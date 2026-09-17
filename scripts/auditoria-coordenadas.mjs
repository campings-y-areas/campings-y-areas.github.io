import fs from 'node:fs';
import path from 'node:path';

const NATURAL_EARTH='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/9380cca83db5f9aef52d5e762765100745f84b27/geojson/ne_10m_admin_0_countries_iso.geojson';
const COUNTRY_BY_SLUG={
  'albania':'AL','alemania':'DE','andorra':'AD','austria':'AT','belgica':'BE','bosnia-herzegovina':'BA','bulgaria':'BG','chequia':'CZ','chipre':'CY','croacia':'HR','dinamarca':'DK','eslovaquia':'SK','eslovenia':'SI','espana':'ES','estonia':'EE','finlandia':'FI','francia':'FR','grecia':'GR','hungria':'HU','irlanda':'IE','islandia':'IS','italia':'IT','kosovo':'XK','letonia':'LV','lituania':'LT','luxemburgo':'LU','macedonia-del-norte':'MK','malta':'MT','moldavia':'MD','montenegro':'ME','noruega':'NO','paises-bajos':'NL','polonia':'PL','portugal':'PT','reino-unido':'GB','rumania':'RO','serbia':'RS','suecia':'SE','suiza':'CH','turquia':'TR','ucrania':'UA'
};
const COUNTRY_BY_NAME={
  'albania':'AL','germany':'DE','alemania':'DE','deutschland':'DE','andorra':'AD','austria':'AT','belgium':'BE','belgica':'BE','bélgica':'BE','bosnia and herzegovina':'BA','bosnia y herzegovina':'BA','bulgaria':'BG','czechia':'CZ','czech republic':'CZ','chequia':'CZ','cyprus':'CY','chipre':'CY','croatia':'HR','croacia':'HR','denmark':'DK','dinamarca':'DK','slovakia':'SK','eslovaquia':'SK','slovenia':'SI','eslovenia':'SI','spain':'ES','espana':'ES','españa':'ES','estonia':'EE','finland':'FI','finlandia':'FI','france':'FR','francia':'FR','greece':'GR','grecia':'GR','hungary':'HU','hungria':'HU','hungría':'HU','ireland':'IE','irlanda':'IE','iceland':'IS','islandia':'IS','italy':'IT','italia':'IT','kosovo':'XK','latvia':'LV','letonia':'LV','lithuania':'LT','lituania':'LT','luxembourg':'LU','luxemburgo':'LU','north macedonia':'MK','macedonia del norte':'MK','malta':'MT','moldova':'MD','moldavia':'MD','montenegro':'ME','norway':'NO','noruega':'NO','netherlands':'NL','paises bajos':'NL','países bajos':'NL','poland':'PL','polonia':'PL','portugal':'PT','united kingdom':'GB','reino unido':'GB','romania':'RO','rumania':'RO','serbia':'RS','sweden':'SE','suecia':'SE','switzerland':'CH','suiza':'CH','turkey':'TR','türkiye':'TR','turquia':'TR','turquía':'TR','ukraine':'UA','ucrania':'UA'
};
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
for(const [k,v] of Object.entries({...COUNTRY_BY_NAME})) COUNTRY_BY_NAME[norm(k)]=v;

function expectedFromFile(file){
  const b=path.basename(file).toLowerCase();
  for(const [slug,iso] of Object.entries(COUNTRY_BY_SLUG)) if(b.includes(`-${slug}-`)||b.includes(`-${slug}.`)) return iso;
  return '';
}
function expectedFromObject(o){
  const vals=[o?.country_code,o?.countryCode,o?.pais_codigo,o?.codigo_pais,o?.country,o?.pais,o?.país];
  for(const v of vals){
    const s=String(v??'').trim();
    if(/^[A-Za-z]{2}$/.test(s))return s.toUpperCase();
    const iso=COUNTRY_BY_NAME[norm(s)]; if(iso)return iso;
  }
  return '';
}
function coords(o){
  if(!o||typeof o!=='object'||Array.isArray(o))return null;
  const lat=o.lat??o.latitude;
  const lon=o.lon??o.lng??o.longitude;
  if(lat===undefined||lon===undefined)return null;
  const a=Number(lat),b=Number(lon);
  if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>90||Math.abs(b)>180)return null;
  return [b,a];
}
function ringContains([x,y],ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    const hit=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||Number.EPSILON)+xi);
    if(hit)inside=!inside;
  }
  return inside;
}
function polygonContains(pt,poly){
  if(!poly?.length||!ringContains(pt,poly[0]))return false;
  for(let i=1;i<poly.length;i++)if(ringContains(pt,poly[i]))return false;
  return true;
}
function geometryContains(pt,g){
  if(!g)return false;
  if(g.type==='Polygon')return polygonContains(pt,g.coordinates);
  if(g.type==='MultiPolygon')return g.coordinates.some(p=>polygonContains(pt,p));
  return false;
}
function featureIso(f){
  const p=f.properties||{};
  for(const k of ['ISO_A2_EH','ISO_A2','WB_A2']){const v=String(p[k]||'').toUpperCase();if(/^[A-Z]{2}$/.test(v))return v;}
  if(norm(p.ADMIN)==='kosovo'||norm(p.NAME)==='kosovo')return 'XK';
  return '';
}
function walk(v,cb){
  if(Array.isArray(v)){for(const x of v)walk(x,cb);return;}
  if(v&&typeof v==='object'){cb(v);for(const x of Object.values(v))walk(x,cb);}
}
function jsonFiles(dir='.'){
  const out=[];
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(ent.name==='.git'||ent.name==='node_modules')continue;
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())out.push(...jsonFiles(p)); else if(ent.isFile()&&ent.name.endsWith('.json'))out.push(p);
  }
  return out;
}

const res=await fetch(NATURAL_EARTH,{headers:{'user-agent':'campings-y-areas-coordinate-audit'}});
if(!res.ok)throw new Error(`Natural Earth no disponible: HTTP ${res.status}`);
const world=await res.json();
const features=(world.features||[]).map(f=>({iso:featureIso(f),geometry:f.geometry,name:f.properties?.ADMIN||f.properties?.NAME||''})).filter(f=>f.iso);
if(features.length<150)throw new Error(`Natural Earth incompleto: ${features.length} países`);
const byIso=new Map();
for(const f of features){if(!byIso.has(f.iso))byIso.set(f.iso,[]);byIso.get(f.iso).push(f);}
const countriesAt=pt=>features.filter(f=>geometryContains(pt,f.geometry)).map(f=>f.iso);
const inIso=(pt,iso)=>(byIso.get(iso)||[]).some(f=>geometryContains(pt,f.geometry));

let checked=0,withExpected=0;
const wrong=[],sea=[],swapped=[],zero=[];
const seen=new Set();
for(const file of jsonFiles()){
  let root; try{root=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}
  const fileIso=expectedFromFile(file);
  walk(root,o=>{
    const pt=coords(o);if(!pt)return;
    const expected=expectedFromObject(o)||fileIso;
    const key=[file,o.id||o.osm_id||o.osmId||o.nombre||o.name||'',pt[0],pt[1],expected].join('|');
    if(seen.has(key))return;seen.add(key);checked++;
    if(pt[0]===0&&pt[1]===0){zero.push({file,id:o.id||'',name:o.nombre||o.name||'',lon:pt[0],lat:pt[1],expected});return;}
    if(!expected)return;withExpected++;
    if(inIso(pt,expected))return;
    const swap=[pt[1],pt[0]];
    if(Math.abs(swap[1])<=90&&Math.abs(swap[0])<=180&&inIso(swap,expected)){
      swapped.push({file,id:o.id||'',name:o.nombre||o.name||'',lon:pt[0],lat:pt[1],expected});return;
    }
    const actual=countriesAt(pt);
    const item={file,id:o.id||'',name:o.nombre||o.name||'',lon:pt[0],lat:pt[1],expected,actual};
    if(actual.length)wrong.push(item); else sea.push(item);
  });
}
const compact=(arr,n=40)=>arr.slice(0,n);
console.log(`Coordenadas únicas revisadas: ${checked}`);
console.log(`Con país esperado verificable: ${withExpected}`);
console.log(`Posibles lat/lon intercambiadas: ${swapped.length}`);
console.log(`En otro país: ${wrong.length}`);
console.log(`Fuera de polígonos terrestres (mar/costa/isla a revisar): ${sea.length}`);
console.log(`Coordenadas 0,0: ${zero.length}`);
if(swapped.length)console.log('INTERCAMBIADAS\n'+JSON.stringify(compact(swapped),null,2));
if(wrong.length)console.log('OTRO_PAIS\n'+JSON.stringify(compact(wrong),null,2));
if(zero.length)console.log('CERO_CERO\n'+JSON.stringify(compact(zero),null,2));
if(sea.length)console.log('MAR_COSTA_REVISION\n'+JSON.stringify(compact(sea),null,2));
fs.writeFileSync('auditoria-coordenadas-reporte.json',JSON.stringify({source:{name:'Natural Earth Admin 0 Countries ISO 1:10m',commit:'9380cca83db5f9aef52d5e762765100745f84b27'},summary:{checked,withExpected,swapped:swapped.length,wrongCountry:wrong.length,seaOrCoast:sea.length,zero:zero.length},swapped,wrongCountry:wrong,seaOrCoast:sea,zero},null,2));
if(swapped.length||wrong.length||zero.length){
  console.error('AUDITORÍA GEOGRÁFICA: hay anomalías inequívocas que requieren revisión; no se corrige ningún dato automáticamente.');
  process.exitCode=1;
}else{
  console.log('AUDITORÍA GEOGRÁFICA: sin intercambios/país incorrecto/0,0. Los casos mar/costa quedan como sospechosos para revisión manual.');
}
