import fs from 'node:fs';

const INPUT='auditoria-coordenadas-reporte.json';
const OUTPUT='auditoria-coordenadas-clasificada.json';
const NATURAL_EARTH='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/9380cca83db5f9aef52d5e762765100745f84b27/geojson/ne_10m_admin_0_countries_iso.geojson';
const BORDER_TOLERANCE_KM=5;

if(!fs.existsSync(INPUT)) throw new Error(`Falta ${INPUT}`);
const audit=JSON.parse(fs.readFileSync(INPUT,'utf8'));
const res=await fetch(NATURAL_EARTH,{headers:{'user-agent':'campings-y-areas-coordinate-audit'}});
if(!res.ok) throw new Error(`Natural Earth no disponible: HTTP ${res.status}`);
const world=await res.json();

const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function featureIso(f){
  const p=f.properties||{};
  for(const k of ['ISO_A2_EH','ISO_A2','WB_A2']){
    const v=String(p[k]||'').toUpperCase();
    if(/^[A-Z]{2}$/.test(v)) return v;
  }
  if(norm(p.ADMIN)==='kosovo'||norm(p.NAME)==='kosovo') return 'XK';
  return '';
}
const byIso=new Map();
for(const f of world.features||[]){
  const iso=featureIso(f); if(!iso) continue;
  if(!byIso.has(iso)) byIso.set(iso,[]);
  byIso.get(iso).push(f.geometry);
}

function rings(g){
  if(!g) return [];
  if(g.type==='Polygon') return g.coordinates;
  if(g.type==='MultiPolygon') return g.coordinates.flat();
  return [];
}
function rad(x){return x*Math.PI/180;}
function project(lon,lat,lat0){return [lon*111.320*Math.cos(rad(lat0)),lat*110.574];}
function pointSegmentKm(p,a,b){
  const lat0=p[1];
  const P=project(p[0],p[1],lat0), A=project(a[0],a[1],lat0), B=project(b[0],b[1],lat0);
  const vx=B[0]-A[0],vy=B[1]-A[1],wx=P[0]-A[0],wy=P[1]-A[1];
  const vv=vx*vx+vy*vy;
  const t=vv?Math.max(0,Math.min(1,(wx*vx+wy*vy)/vv)):0;
  return Math.hypot(P[0]-(A[0]+t*vx),P[1]-(A[1]+t*vy));
}
function distanceToCountryKm(item){
  const gs=byIso.get(item.expected)||[];
  if(!gs.length) return null;
  const p=[Number(item.lon),Number(item.lat)];
  let best=Infinity;
  for(const g of gs) for(const ring of rings(g)) for(let i=1;i<ring.length;i++){
    const d=pointSegmentKm(p,ring[i-1],ring[i]);
    if(d<best) best=d;
  }
  return Number.isFinite(best)?best:null;
}
function outsideEuropeCore(item){
  const lon=Number(item.lon),lat=Number(item.lat);
  // Umbral deliberadamente amplio: solo marca casos inequívocos en otros continentes.
  return lat<25 || lat>73 || lon<-35 || lon>60;
}
function enrich(item,kind){
  const distanceKm=distanceToCountryKm(item);
  const borderAmbiguous=distanceKm!==null && distanceKm<=BORDER_TOLERANCE_KM;
  const outsideEurope=outsideEuropeCore(item);
  return {...item,kind,distance_to_expected_country_km:distanceKm===null?null:Number(distanceKm.toFixed(3)),border_ambiguous:borderAmbiguous,outside_europe:outsideEurope};
}

const wrong=(audit.wrongCountry||[]).map(x=>enrich(x,'wrong_country'));
const sea=(audit.seaOrCoast||[]).map(x=>enrich(x,'sea_or_coast'));
const swapped=(audit.swapped||[]).map(x=>({...x,kind:'swapped'}));
const zero=(audit.zero||[]).map(x=>({...x,kind:'zero'}));
const borderAmbiguous=[...wrong,...sea].filter(x=>x.border_ambiguous);
const outsideEurope=[...wrong,...sea].filter(x=>x.outside_europe);
const highConfidenceWrong=wrong.filter(x=>!x.border_ambiguous);
const highConfidenceSea=sea.filter(x=>!x.border_ambiguous && !x.outside_europe);

const byFile=arr=>Object.entries(arr.reduce((m,x)=>(m[x.file]=(m[x.file]||0)+1,m),{})).sort((a,b)=>b[1]-a[1]).map(([file,count])=>({file,count}));
const result={
  source:audit.source,
  policy:{border_tolerance_km:BORDER_TOLERANCE_KM,outside_europe_rule:'lat < 25 || lat > 73 || lon < -35 || lon > 60',automatic_corrections:false},
  summary:{
    checked:audit.summary?.checked||0,
    withExpected:audit.summary?.withExpected||0,
    swapped:swapped.length,
    zero:zero.length,
    wrongCountryTotal:wrong.length,
    seaOrCoastTotal:sea.length,
    borderAmbiguous:borderAmbiguous.length,
    outsideEurope:outsideEurope.length,
    highConfidenceWrongCountry:highConfidenceWrong.length,
    highConfidenceSeaOrLandMismatch:highConfidenceSea.length
  },
  files:{outsideEurope:byFile(outsideEurope),highConfidenceWrongCountry:byFile(highConfidenceWrong),highConfidenceSeaOrLandMismatch:byFile(highConfidenceSea)},
  outsideEurope,highConfidenceWrongCountry:highConfidenceWrong,highConfidenceSeaOrLandMismatch:highConfidenceSea,borderAmbiguous,swapped,zero
};
fs.writeFileSync(OUTPUT,JSON.stringify(result,null,2));
console.log(`Clasificación geográfica sobre ${result.summary.checked} coordenadas`);
console.log(`Frontera/costa <= ${BORDER_TOLERANCE_KM} km (no corregir automáticamente): ${borderAmbiguous.length}`);
console.log(`Fuera de Europa inequívoco: ${outsideEurope.length}`);
console.log(`País distinto a > ${BORDER_TOLERANCE_KM} km: ${highConfidenceWrong.length}`);
console.log(`Sin polígono terrestre y a > ${BORDER_TOLERANCE_KM} km: ${highConfidenceSea.length}`);
console.log(`Lat/lon intercambiadas: ${swapped.length}; 0,0: ${zero.length}`);
if(outsideEurope.length||highConfidenceWrong.length||swapped.length||zero.length){
  console.error('CLASIFICACIÓN GEOGRÁFICA: quedan anomalías de alta confianza; no se ha modificado ningún dato.');
  process.exitCode=1;
}else console.log('CLASIFICACIÓN GEOGRÁFICA: sin anomalías inequívocas de país/continente/intercambio.');
