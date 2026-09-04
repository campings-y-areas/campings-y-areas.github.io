
// ==========================================
// CAMPINGS & ÁREAS - RUTAS FASE 21 · RUTA DE EJEMPLO + PORTADA + GUÍA COMPLETA
// Geoapify: autocomplete + routing + mapa + paradas inteligentes + recálculo real + pernoctas propias
// ==========================================

let pasoActual = 1;
const totalPasos = 4;
const formRuta = document.getElementById("formRuta");
const botonAnterior = document.getElementById("anteriorPaso");
const botonSiguiente = document.getElementById("siguientePaso");
const botonCrear = document.getElementById("crearRuta");
const config = window.RUTAS_CONFIG || {};
let mapa = null;
let capaRuta = null;
let marcadores = [];
const lugaresSeleccionados = new WeakMap();

// ---------- Multimedia + lugares verificados ----------
const MEDIA_VERIFICADO_URL = "rutas-media-verificado-v1.json?v=1";
const LUGARES_VERIFICADOS_URL = "rutas-lugares-verificados-v2.json?v=2";
let mediaVerificadoCache = null;
let lugaresVerificadosCache = null;

// ---------- Selector fotográfico automático (sin OpenAI) ----------
const FOTO_AUTO_STORAGE_KEY = "campingsAreasFotoAutoV2";
const fotoAutoCache = new Map();

function cargarFotoAutoLocal(){
  try{
    const d=JSON.parse(localStorage.getItem(FOTO_AUTO_STORAGE_KEY)||"{}");
    Object.entries(d||{}).forEach(([k,v])=>{if(v?.image_url)fotoAutoCache.set(k,v);});
  }catch{}
}
function guardarFotoAutoLocal(){
  try{
    const d={}; fotoAutoCache.forEach((v,k)=>{d[k]=v;});
    localStorage.setItem(FOTO_AUTO_STORAGE_KEY,JSON.stringify(d));
  }catch{}
}
function claveFotoAuto(nombre,ciudad,tipo){
  return [tipo,normalizarClaveMedia(nombre),normalizarClaveMedia(ciudad)].join("|");
}
function textoPlanoHtml(v){
  const el=document.createElement("div"); el.innerHTML=String(v||"");
  return (el.textContent||el.innerText||"").replace(/\s+/g," ").trim();
}
function tokensFoto(v){
  const stop=new Set(["de","del","la","las","el","los","y","en","of","the","and","in","und","der","die","das","von","zu","im","am","para","con","casco","historico","ciudad"]);
  return normalizarClaveMedia(v).split(" ").filter(x=>x.length>2&&!stop.has(x));
}
function consultasFotoVisita(nombre,ciudad){
  const original=String(nombre||"").trim();
  const ciudadTxt=String(ciudad||"").trim();
  const partes=original
    .replace(/\s*\+\s*/g," y ")
    .split(/\s+y\s+|\s*,\s*|\s*\/\s*/i)
    .map(x=>x.replace(/^(casco historico|casco histórico|centro historico|centro histórico)\s*/i,"").trim())
    .filter(x=>x.length>=4 && !/^(casco historico|casco histórico|centro historico|centro histórico)$/i.test(x));
  const q=[];
  const add=v=>{v=String(v||"").replace(/\s+/g," ").trim();if(v&&!q.includes(v))q.push(v);};
  partes.forEach(x=>add(`${x} ${ciudadTxt}`));
  add(`${original} ${ciudadTxt}`);
  add(original);
  return q.slice(0,6);
}
function bonusIconicoFoto(texto){
  let b=0;
  if(/cathedral|catedral|church|iglesia|kirche|basilica|fortress|fortaleza|castle|castillo|schloss|palace|palacio|panoram|aerial|skyline|roof|tejado|dome|cupola/.test(texto))b+=14;
  if(/interior|inside|altar|nave|ceiling|fresco|vault/.test(texto))b+=8;
  if(/street|calle|gasse/.test(texto))b+=2;
  return b;
}
function puntuacionFotoBase(p,nombre,ciudad){
  const ii=p.imageinfo?.[0]||{};
  const titulo=normalizarClaveMedia(p.title||"");
  const nt=tokensFoto(nombre), ct=tokensFoto(ciudad);
  let score=0;
  nt.forEach(t=>{if(titulo.includes(t))score+=9;});
  ct.forEach(t=>{if(titulo.includes(t))score+=5;});
  const w=Number(ii.width)||0,h=Number(ii.height)||0;
  if(w>=1600)score+=10; else if(w>=1000)score+=6; else if(w&&w<800)score-=12;
  if(w>h*1.15)score+=10; else if(h>w*1.35)score-=6;
  if(w>=2400&&h>=1400)score+=5;
  const malo=/sign|logo|plaque|poster|advert|advertisement|information board|ticket|entrance sign|door detail|detail of|memorial plaque|schild|tafel|plakat|logo|cartel|letrero|placa/;
  const bueno=/panoram|aerial|interior|garden|square|plaza|skyline|overview|view|castle|church|cathedral|palace|market|park|fortress|street|historic|roof|garten|kirche|schloss|markt|platz/;
  if(malo.test(titulo))score-=30;
  if(bueno.test(titulo))score+=12;
  score+=bonusIconicoFoto(titulo);
  if(/crowd|crowded|people|tourists|menschenmenge|touristen/.test(titulo))score-=8;
  return score;
}
function licenciaFotoPermitida(meta){
  const l=textoPlanoHtml(meta?.LicenseShortName?.value||meta?.UsageTerms?.value||"").toLowerCase();
  if(!l)return false;
  return /cc0|public domain|cc by|cc-by|cc by-sa|cc-by-sa/.test(l);
}
function puntuacionFotoFinal(p,nombre,ciudad){
  const ii=p.imageinfo?.[0]||{}, m=ii.extmetadata||{};
  let score=puntuacionFotoBase(p,nombre,ciudad);
  const texto=normalizarClaveMedia([p.title,textoPlanoHtml(m.ImageDescription?.value),textoPlanoHtml(m.Categories?.value),textoPlanoHtml(m.Assessments?.value)].join(" "));
  const nt=tokensFoto(nombre), ct=tokensFoto(ciudad);
  nt.forEach(t=>{if(texto.includes(t))score+=5;});
  ct.forEach(t=>{if(texto.includes(t))score+=3;});
  if(/featured|quality image|valued image|picture of the day|potd/.test(texto))score+=20;
  if(/panoram|aerial|interior|garden|square|plaza|skyline|overview|historic|roof|market|fortress|castle|cathedral|church|palace/.test(texto))score+=8;
  score+=bonusIconicoFoto(texto);
  if(/crowd|crowded|people|tourists|menschenmenge|touristen/.test(texto))score-=8;
  if(/sign|logo|plaque|poster|advert|information board|ticket|schild|tafel|plakat|cartel|letrero|placa/.test(texto))score-=28;
  return score;
}
async function buscarFotoAutomatica(nombre,ciudad,tipo="visit"){
  if(tipo!=="visit"||!nombre)return null;
  const key=claveFotoAuto(nombre,ciudad,tipo);
  if(fotoAutoCache.has(key))return fotoAutoCache.get(key);
  try{
    const consultas=consultasFotoVisita(nombre,ciudad);
    const mapaCandidatos=new Map();
    for(const consulta of consultas){
      const params=new URLSearchParams({action:"query",generator:"search",gsrsearch:consulta,gsrnamespace:"6",gsrlimit:"10",prop:"imageinfo",iiprop:"url|dimensions",iiurlwidth:"1600",format:"json",origin:"*"});
      const r=await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
      if(!r.ok)continue;
      const d=await r.json();
      Object.values(d.query?.pages||{}).filter(p=>p.imageinfo?.[0]).forEach(p=>mapaCandidatos.set(p.title,p));
    }
    let candidatos=[...mapaCandidatos.values()];
    if(!candidatos.length)return null;
    candidatos.sort((a,b)=>puntuacionFotoBase(b,nombre,ciudad)-puntuacionFotoBase(a,nombre,ciudad));
    const finalistas=candidatos.slice(0,8);
    const titles=finalistas.map(p=>p.title).join("|");
    const params2=new URLSearchParams({action:"query",titles,prop:"imageinfo",iiprop:"url|dimensions|extmetadata",iiurlwidth:"1600",iiextmetadatalanguage:"en",iiextmetadatafilter:"ImageDescription|Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|Categories|Assessments",format:"json",origin:"*"});
    const r2=await fetch(`https://commons.wikimedia.org/w/api.php?${params2}`);
    if(!r2.ok)return null;
    const d2=await r2.json();
    const completas=Object.values(d2.query?.pages||{}).filter(p=>p.imageinfo?.[0]&&licenciaFotoPermitida(p.imageinfo[0].extmetadata||{}));
    completas.sort((a,b)=>puntuacionFotoFinal(b,nombre,ciudad)-puntuacionFotoFinal(a,nombre,ciudad));
    const ganadora=completas[0]; if(!ganadora)return null;
    const score=puntuacionFotoFinal(ganadora,nombre,ciudad);
    if(score<36)return null;
    const ii=ganadora.imageinfo[0],m=ii.extmetadata||{};
    const foto={
      image_url:ii.thumburl||ii.url||"",
      source_page:ii.descriptionurl||"",
      credit:[textoPlanoHtml(m.Artist?.value),textoPlanoHtml(m.LicenseShortName?.value)].filter(Boolean).join(" · ")||"Wikimedia Commons",
      score, selected_automatically:true
    };
    if(foto.image_url){fotoAutoCache.set(key,foto);guardarFotoAutoLocal();return foto;}
  }catch(e){console.warn("Selector fotográfico",e);}
  return null;
}
async function prepararFotosGuia(guide){
  cargarFotoAutoLocal();
  const trabajos=[];
  (guide?.days||[]).forEach(d=>{
    const ciudad=d.city||d.destination||"";
    (d.highlights||[]).forEach(x=>trabajos.push(buscarFotoAutomatica(x.name,ciudad,"visit")));
  });
  await Promise.allSettled(trabajos);
}

const IMAGENES_EDITORIALES_PRIORITARIAS = Object.freeze({
  "dolac market y gornji grad": {
    image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Dolac%20Zagreb.jpg",
    source_page: "https://commons.wikimedia.org/wiki/File:Dolac_Zagreb.jpg",
    credit: "Wikimedia Commons · Dolac Market"
  },
  "iglesia de san marcos y kamenita vrata": {
    image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Zagreb%20Church%20of%20St.%20Mark%20%2834411766366%29.jpg",
    source_page: "https://commons.wikimedia.org/wiki/File:Zagreb_Church_of_St._Mark_(34411766366).jpg",
    credit: "Wikimedia Commons · St. Mark's Church, Zagreb"
  }
});

const IMAGENES_VERIFICADAS_SUPLEMENTARIAS = Object.freeze({
  "buergerpark y paseo hacia schloss reisensburg": {
    image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Aerial%20image%20of%20the%20Schloss%20Reisensburg.jpg",
    source_page: "https://commons.wikimedia.org/wiki/Category:Schloss_Reisensburg",
    credit: "Wikimedia Commons · Schloss Reisensburg"
  },
  "heimatmuseum gunzburg": {
    image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/G%C3%BCnzburg%20BW%202017-03-13%2014-08-26.jpg",
    source_page: "https://commons.wikimedia.org/wiki/File:G%C3%BCnzburg_BW_2017-03-13_14-08-26.jpg",
    credit: "Wikimedia Commons · Heimatmuseum Günzburg"
  },
  "jardines de mirabell": {
    image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Salzburg%20Mirabellgarten%20Festung.jpg",
    source_page: "https://commons.wikimedia.org/wiki/File:Salzburg_Mirabellgarten_Festung.jpg",
    credit: "Wikimedia Commons · Mirabellgarten"
  },
  "getreidegasse casco historico y catedral de salzburg": {
    image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Getreidegasse%20Salzburg.jpg",
    source_page: "https://commons.wikimedia.org/wiki/File:Getreidegasse_Salzburg.jpg",
    credit: "Wikimedia Commons · Getreidegasse"
  },
  "fortaleza de hohensalzburg": {
    image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Salzburg%20-%20Festung%20Hohensalzburg.JPG",
    source_page: "https://commons.wikimedia.org/wiki/File:Salzburg_-_Festung_Hohensalzburg.JPG",
    credit: "Wikimedia Commons · Festung Hohensalzburg"
  },
  "herzl restaurant": {
    image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Getreidegasse%2037%2C%20Salzburg.jpg",
    source_page: "https://commons.wikimedia.org/wiki/File:Getreidegasse_37%2C_Salzburg.jpg",
    credit: "Wikimedia Commons · Getreidegasse 37"
  },
  "dolac market y gornji grad": {
    image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Dolac%20Zagreb.jpg",
    source_page: "https://commons.wikimedia.org/wiki/File:Dolac_Zagreb.jpg",
    credit: "Wikimedia Commons · Dolac Market"
  },
  "museum of broken relationships": {
    image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Museum%20of%20Broken%20Relationships%20in%20Zagreb.jpg",
    source_page: "https://commons.wikimedia.org/wiki/File:Museum_of_Broken_Relationships_in_Zagreb.jpg",
    credit: "Wikimedia Commons · Museum of Broken Relationships"
  },
  "parque maksimir y zoo de zagreb": {
    image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Maksimir%20Park%20in%20Zagreb.jpg",
    source_page: "https://commons.wikimedia.org/wiki/File:Maksimir_Park_in_Zagreb.jpg",
    credit: "Wikimedia Commons · Maksimir Park"
  }
});

function normalizarClaveMedia(texto){
  return String(texto||"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

async function cargarMediaVerificado(){
  if(mediaVerificadoCache)return mediaVerificadoCache;
  try{
    const r=await fetch(MEDIA_VERIFICADO_URL,{cache:"no-store"});
    if(!r.ok)throw new Error("No se pudo cargar el catálogo multimedia verificado.");
    const d=await r.json();
    mediaVerificadoCache=Array.isArray(d?.items)?d.items:[];
  }catch(e){
    console.warn(e);
    mediaVerificadoCache=[];
  }
  return mediaVerificadoCache;
}

async function cargarLugaresVerificados(){
  if(lugaresVerificadosCache)return lugaresVerificadosCache;
  try{
    const r=await fetch(LUGARES_VERIFICADOS_URL,{cache:"no-store"});
    if(!r.ok)throw new Error("No se pudo cargar el catálogo de lugares verificados.");
    const d=await r.json();
    lugaresVerificadosCache=Array.isArray(d?.items)?d.items:[];
  }catch(e){
    console.warn(e);
    lugaresVerificadosCache=[];
  }
  return lugaresVerificadosCache;
}

function normalizarNombreLugar(nombre){
  const n=normalizarClaveMedia(nombre);
  if(n==="casco historico marktplatz stadtturm y frauenkirche")return "marktplatz y stadtturm de gunzburg";
  return n;
}

function buscarLugarVerificado(nombre,tipo=""){
  const clave=normalizarNombreLugar(nombre);
  const lista=lugaresVerificadosCache||[];
  let candidatos=lista.filter(x=>x?.verified_entity===true);
  if(tipo)candidatos=candidatos.filter(x=>String(x.type||"")===tipo);
  return candidatos.find(x=>normalizarNombreLugar(x.name)===clave)||null;
}

function limpiarTextoGuia(texto){
  return String(texto??"")
    .replace(/\s+([,.;:!?])/g,"$1")
    .replace(/([.!?])\s*,\s*/g,"$1 ")
    .replace(/,\s*([.!?])/g,"$1")
    .replace(/\.{2,}/g,".")
    .replace(/\s{2,}/g," ")
    .trim();
}

function htmlDatosLugar(nombre,tipo="",webGuia=""){
  const l=buscarLugarVerificado(nombre,tipo);
  if(!l)return webGuia?`<div class="guia-enlaces">${htmlEnlaceGuia("🌐 Web oficial",webGuia)}</div>`:"";
  let h="";
  if(tipo==="visit"&&l.visit_time)h+=`<p><strong>⏱️ Tiempo orientativo:</strong> ${escapar(l.visit_time)}</p>`;
  if(tipo==="visit"&&l.what_to_see)h+=`<p><strong>👀 Qué merece la pena ver:</strong> ${escapar(l.what_to_see)}</p>`;
  if(l.address)h+=`<p><strong>📍 Dirección:</strong> ${escapar(l.address)}</p>`;
  const enlaces=[];
  if(l.maps_url)enlaces.push(htmlEnlaceGuia("📍 Abrir en Google Maps",l.maps_url));
  const web=webGuia||l.website||"";
  if(web)enlaces.push(htmlEnlaceGuia(tipo==="visit"?"🌐 Información oficial":"🌐 Web oficial",web));
  if(enlaces.length)h+=`<div class="guia-enlaces">${enlaces.join("")}</div>`;
  return h;
}

function buscarMediaVerificado(nombre,ciudad="",tipo=""){
  const nombreN=normalizarClaveMedia(nombre);
  const ciudadN=normalizarClaveMedia(ciudad);
  const lista=mediaVerificadoCache||[];
  let candidatos=lista.filter(x=>x?.verified_exact===true);

  if(tipo)candidatos=candidatos.filter(x=>String(x.type||"")===tipo);

  const exactos=candidatos.filter(x=>normalizarClaveMedia(x.name)===nombreN);
  if(exactos.length){
    if(!ciudadN)return exactos[0];
    const porCiudad=exactos.find(x=>normalizarClaveMedia(x.city)===ciudadN);
    return porCiudad||exactos[0];
  }

  // Sin coincidencia exacta no mostramos foto: evita errores por nombres parecidos.
  return null;
}

function htmlFotoVerificada(nombre,ciudad,tipo){
  const lugar=buscarLugarVerificado(nombre,tipo);
  const media=buscarMediaVerificado(nombre,ciudad,tipo);
  const claveNombre=normalizarClaveMedia(nombre);
  const editorial=tipo==="visit"?IMAGENES_EDITORIALES_PRIORITARIAS[claveNombre]||null:null;
  const extra=IMAGENES_VERIFICADAS_SUPLEMENTARIAS[claveNombre]||null;
  const auto=tipo==="visit"?fotoAutoCache.get(claveFotoAuto(nombre,ciudad,tipo)):null;
  // Las excepciones editoriales verificadas corrigen solo lugares donde una coincidencia automática era semánticamente correcta pero visualmente inadecuada.
  const imageUrl=editorial?.image_url||auto?.image_url||lugar?.image_url||media?.image_url||extra?.image_url||"";
  if(!imageUrl)return "";
  const pie=lugar?.name||media?.name||nombre;
  const sourcePage=editorial?.source_page||auto?.source_page||lugar?.image_source_page||media?.source_page||extra?.source_page||"";
  const credit=editorial?.credit||auto?.credit||lugar?.image_credit||media?.credit||extra?.credit||"";
  const fuente=sourcePage
    ? `<a href="${escapar(sourcePage)}" target="_blank" rel="noopener">Fuente de la imagen</a>`
    : "";
  return `<figure class="guia-foto">
    <img src="${escapar(imageUrl)}" alt="${escapar(pie)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('figure').remove()">
    <figcaption>${escapar(pie)}${credit?` · ${escapar(credit)}`:""}${fuente?` · ${fuente}`:""}</figcaption>
  </figure>`;
}


function mostrarPaso(numero) {
  pasoActual = numero;
  document.querySelectorAll(".paso-contenido").forEach(s => s.classList.toggle("activo", Number(s.dataset.paso) === numero));
  document.querySelectorAll("[data-paso-indicador]").forEach(i => {
    const n = Number(i.dataset.pasoIndicador);
    i.classList.toggle("activo", n === numero);
    i.classList.toggle("completado", n < numero);
  });
  botonAnterior.disabled = numero === 1;
  botonSiguiente.classList.toggle("oculto", numero === totalPasos);
  botonCrear.classList.toggle("oculto", numero !== totalPasos);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function validarPasoActual() {
  const seccion = document.querySelector(`.paso-contenido[data-paso="${pasoActual}"]`);
  for (const campo of [...seccion.querySelectorAll("[required]")]) {
    if (!campo.checkValidity()) { campo.reportValidity(); return false; }
  }
  if (pasoActual === 1) {
    const modo = document.querySelector('input[name="modoRuta"]:checked')?.value;
    const destino = document.getElementById("destinoPrincipal");
    if (modo === "destino" && !destino.value.trim()) {
      destino.setCustomValidity("Indica al menos un destino."); destino.reportValidity(); destino.setCustomValidity(""); return false;
    }
  }
  return true;
}

botonSiguiente.addEventListener("click", () => { if (validarPasoActual() && pasoActual < totalPasos) mostrarPaso(pasoActual + 1); });
botonAnterior.addEventListener("click", () => { if (pasoActual > 1) mostrarPaso(pasoActual - 1); });

document.querySelectorAll('input[name="modoRuta"]').forEach(r => r.addEventListener("change", () => {
  const modo = document.querySelector('input[name="modoRuta"]:checked')?.value;
  document.getElementById("zonaDestinos").classList.toggle("oculto", modo === "propuesta");
}));

const ninos = document.getElementById("ninos");
const edadesNinos = document.getElementById("edadesNinos");
function actualizarEdades() {
  const cantidad = Math.max(0, Math.min(10, Number(ninos.value) || 0));
  const previas = [...edadesNinos.querySelectorAll("input")].map(i => i.value);
  edadesNinos.innerHTML = "";
  for (let i=0;i<cantidad;i++) {
    const label=document.createElement("label");
    label.innerHTML=`<span>Edad niño ${i+1}</span><input type="number" class="edadNino" min="0" max="17" value="${previas[i]||""}" placeholder="Edad">`;
    edadesNinos.appendChild(label);
  }
}
ninos.addEventListener("input", actualizarEdades); actualizarEdades();

function valoresMarcados(selector){ return [...document.querySelectorAll(selector)].filter(e=>e.checked).map(e=>e.value); }
function escapar(t){ return String(t??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }
function formatoTiempo(seg){ const m=Math.round(seg/60), h=Math.floor(m/60), r=m%60; return h ? `${h} h ${r ? r+" min" : ""}`.trim() : `${r} min`; }
function formatoKm(m){ return new Intl.NumberFormat("es-ES",{maximumFractionDigits:0}).format(m/1000)+" km"; }


// ---------- Backend IA: Cloudflare Worker ----------
async function llamarWorker(ruta, cuerpo){
  const base=String(config.WORKER_BASE_URL||"").replace(/\/+$/,"");
  if(!base)throw new Error("Falta configurar la dirección del Worker de Rutas.");
  const r=await fetch(`${base}${ruta}`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(cuerpo)
  });
  let data=null;
  try{data=await r.json();}catch{}
  if(!r.ok)throw new Error(data?.message||data?.error||`El Worker respondió con error ${r.status}.`);
  return data;
}

function paisCanonico(codigo,nombre=""){
  const mapa={
    de:"Germany",at:"Austria",hr:"Croatia",fr:"France",es:"Spain",it:"Italy",
    pt:"Portugal",ch:"Switzerland",be:"Belgium",nl:"Netherlands",lu:"Luxembourg",
    si:"Slovenia",cz:"Czechia",sk:"Slovakia",hu:"Hungary",pl:"Poland",
    ba:"Bosnia and Herzegovina",me:"Montenegro",rs:"Serbia",al:"Albania",
    gr:"Greece",ro:"Romania",bg:"Bulgaria",gb:"United Kingdom",ie:"Ireland"
  };
  return mapa[String(codigo||"").toLowerCase()]||String(nombre||"").trim();
}

function nombreLugarWorker(lugar,fallback=""){
  return lugar?.city||lugar?.town||lugar?.village||lugar?.municipality||lugar?.name||fallback||lugar?.formatted||"";
}

function ritmoWorker(valor){
  if(valor==="tranquilo")return "tranquilo";
  if(valor==="intenso")return "intenso";
  return "equilibrado";
}

function interesesWorker(intereses=[]){
  const s=new Set(intereses||[]);
  const out=[];
  if(["ciudades","monumentos","pueblos","museos-ninos","naturaleza","montana","playa","senderismo","animales","acuarios","parques"].some(x=>s.has(x)))out.push("turismo");
  if(s.has("gastronomia"))out.push("gastronomía");
  return out.length?out:["turismo"];
}

function preferenciaPernoctaWorker(datos){
  if(datos.vehiculo==="autocaravana"||datos.vehiculo==="camper"){
    return "campings, áreas o parkings adecuados para autocaravana";
  }
  return (datos.pernocta||[]).join(", ");
}

function perfilWorker(datos,lugares,stops=[]){
  return {
    origin:nombreLugarWorker(lugares[0],datos.origen),
    destination:nombreLugarWorker(lugares.at(-1),datos.destinoPrincipal),
    country:paisCanonico(lugares.at(-1)?.country_code,lugares.at(-1)?.country),
    vehicle:datos.vehiculo,
    adults:Number(datos.adultos)||0,
    children:(datos.edades||[]).map(Number).filter(Number.isFinite),
    pet:Boolean(datos.mascota),
    max_driving_hours:Number(datos.maxConduccion)||4,
    pace:ritmoWorker(datos.ritmo),
    interests:interesesWorker(datos.intereses),
    overnight_preference:preferenciaPernoctaWorker(datos),
    stops
  };
}

async function consultarPlanificadorIA(datos,lugares,stops){
  return llamarWorker("/plan-route",perfilWorker(datos,lugares,stops));
}

async function consultarRedactorIA(datos,lugares,stops,plan){
  const perfil=perfilWorker(datos,lugares,stops);
  delete perfil.country;
  delete perfil.max_driving_hours;
  return llamarWorker("/write-route",{...perfil,plan});
}

function htmlLista(items=[]){
  if(!Array.isArray(items)||!items.length)return "";
  return `<ul>${items.map(x=>`<li>${escapar(x)}</li>`).join("")}</ul>`;
}

function htmlEnlaceGuia(label,url){
  if(!url)return "";
  return `<a href="${escapar(url)}" target="_blank" rel="noopener">${escapar(label)}</a>`;
}


const PORTADA_FONDO_DATA_URL = "data:image/jpeg;base64,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";

function nombrePortadaRuta(valor,fallback){
  const limpio=String(valor||fallback||"").trim();
  return limpio.split(",")[0].trim()||fallback;
}

function htmlPortadaRuta(datos={}){
  const origen=escapar(nombrePortadaRuta(datos.origen,"Origen"));
  const destino=escapar(nombrePortadaRuta(datos.destinoPrincipal,"Destino"));
  return `<section class="portada-ruta-fija" style="
    position:relative; min-height:760px; border-radius:26px; overflow:hidden; margin:0 0 28px;
    background-image:linear-gradient(180deg,rgba(235,248,255,.12),rgba(3,38,58,.12)),url('${PORTADA_FONDO_DATA_URL}');
    background-size:cover; background-position:center; box-shadow:0 18px 50px rgba(0,0,0,.18);
    color:#062f49; box-sizing:border-box; padding:26px 28px 30px; display:flex; flex-direction:column;
  ">
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:start;gap:18px;width:100%;">
      <div style="font-size:13px;font-weight:800;line-height:2.05;text-align:left;text-shadow:0 1px 10px rgba(255,255,255,.9);">
        <div>⛺ CAMPINGS</div><div>🚐 ÁREAS</div><div>🅿️ PARKINGS</div><div>📍 RUTAS</div><div>🌲 NATURALEZA</div><div>📷 VIAJES</div>
      </div>
      <img src="logo.png" alt="Campings & Áreas" style="display:block;width:230px;height:230px;object-fit:contain;margin:0 auto;filter:drop-shadow(0 7px 14px rgba(0,0,0,.24));">
      <div style="text-align:right;font-size:13px;font-weight:800;line-height:2.05;text-shadow:0 1px 10px rgba(255,255,255,.9);">
        <div style="font-size:25px;letter-spacing:8px;white-space:nowrap;margin-bottom:5px;">🇪🇸 🇩🇪 🇫🇷 🇬🇧</div>
        <div>ESPAÑA 🌍</div><div>EUROPA 🌍</div><div>MAPAS 🗺️</div><div>CONSEJOS ℹ️</div><div>EXPERIENCIAS ★</div><div>Y MUCHO MÁS ♥</div>
      </div>
    </div>

    <div style="text-align:center;margin:12px auto 0;width:min(940px,100%);">
      <div style="font-size:clamp(15px,1.8vw,22px);letter-spacing:.32em;font-weight:800;margin-bottom:8px;">GUÍA DE RUTA</div>
      <h1 style="margin:0;font-size:clamp(40px,6.2vw,76px);line-height:1;font-weight:900;letter-spacing:-.035em;text-shadow:0 2px 18px rgba(255,255,255,.9);">${origen} → ${destino}</h1>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;width:min(820px,100%);margin:24px auto 0;text-align:center;">
      <div><div style="font-size:34px">📅</div><strong>3 días</strong><small style="display:block;letter-spacing:.12em">DE RUTA</small></div>
      <div><div style="font-size:34px">🚐</div><strong>Autocaravana</strong><small style="display:block;letter-spacing:.12em">TIPO DE VIAJE</small></div>
      <div><div style="font-size:34px">📍</div><strong>Paisajes</strong><small style="display:block;letter-spacing:.12em">Y CULTURA</small></div>
      <div><div style="font-size:34px">⛰️</div><strong>Ciudades</strong><small style="display:block;letter-spacing:.12em">Y NATURALEZA</small></div>
    </div>

    <div style="margin-top:auto;display:grid;grid-template-columns:repeat(4,1fr);background:rgba(3,55,79,.94);color:white;border-radius:22px;padding:22px 12px;box-shadow:0 10px 30px rgba(0,0,0,.24);text-align:center;gap:0;">
      <div style="border-right:1px solid rgba(255,255,255,.35)"><div style="font-size:32px">↔</div><strong>Rutas optimizadas</strong><small style="display:block;letter-spacing:.12em;margin-top:5px">CON IA</small></div>
      <div style="border-right:1px solid rgba(255,255,255,.35)"><div style="font-size:32px">⛺</div><strong>Campings y áreas</strong><small style="display:block;letter-spacing:.12em;margin-top:5px">EN TU CAMINO</small></div>
      <div style="border-right:1px solid rgba(255,255,255,.35)"><div style="font-size:32px">📷</div><strong>Lugares de interés</strong><small style="display:block;letter-spacing:.12em;margin-top:5px">IMPRESCINDIBLES</small></div>
      <div><div style="font-size:32px">🗺️</div><strong>Todo en un mapa</strong><small style="display:block;letter-spacing:.12em;margin-top:5px">INTERACTIVO</small></div>
    </div>
  </section>`;
}

function montarPortadaAntesMapa(datos={}){
  document.querySelectorAll('.portada-ruta-fija').forEach(x=>x.remove());
  const mapaEl=document.getElementById('mapaRuta');
  if(!mapaEl)return;
  mapaEl.insertAdjacentHTML('beforebegin',htmlPortadaRuta(datos));
}

function htmlGuiaIA(guide,datos={}){
  if(!guide||typeof guide!=="object")return '<div class="error-ruta"><strong>⚠️ La guía almacenada no tiene un formato válido.</strong></div>';
  let h=`<div class="guia-pdf guia-ia-real">
    <header class="guia-portada">
      <span>GUÍA PERSONALIZADA DE VIAJE</span>
      <h2>${escapar(guide.title||"Tu ruta")}</h2>
      ${guide.subtitle?`<p>${escapar(guide.subtitle)}</p>`:""}
    </header>`;

  if(guide.introduction)h+=`<section class="guia-seccion-editorial"><p>${escapar(limpiarTextoGuia(guide.introduction))}</p></section>`;

  const resumen=guide.trip_summary||{};
  if(Object.keys(resumen).length){
    h+=`<section class="guia-seccion-editorial"><h3>🧭 Resumen del viaje</h3>
      ${resumen.route?`<p><strong>Ruta:</strong> ${escapar(resumen.route)}</p>`:""}
      ${resumen.travel_style?`<p><strong>Estilo:</strong> ${escapar(resumen.travel_style)}</p>`:""}
      ${resumen.key_advice?`<p><strong>Consejo principal:</strong> ${escapar(resumen.key_advice)}</p>`:""}
    </section>`;
  }

  if(Array.isArray(guide.before_you_go)&&guide.before_you_go.length){
    h+=`<section class="guia-seccion-editorial"><h3>✅ Antes de salir</h3>${htmlLista(guide.before_you_go)}</section>`;
  }

  (guide.days||[]).forEach(d=>{
    h+=`<section class="guia-dia-editorial">
      <div class="guia-dia-titulo">
        <span>DÍA ${escapar(d.day||"")}</span>
        <h2>${escapar(d.heading||"Etapa")}</h2>
        ${d.driving?`<p>🚐 ${escapar(d.driving)}</p>`:""}
      </div>`;

    if(d.opening_narrative)h+=`<div class="guia-narrativa"><p>${escapar(limpiarTextoGuia(d.opening_narrative))}</p></div>`;
    if(d.arrival_strategy)h+=`<div class="guia-narrativa"><p><strong>Al llegar:</strong> ${escapar(limpiarTextoGuia(d.arrival_strategy))}</p></div>`;
    if(d.recommended_visit_time)h+=`<div class="guia-narrativa"><p><strong>Tiempo recomendado:</strong> ${escapar(limpiarTextoGuia(d.recommended_visit_time))}</p></div>`;
    if(d.pace_advice)h+=`<div class="guia-narrativa"><p><strong>Ritmo:</strong> ${escapar(limpiarTextoGuia(d.pace_advice))}</p></div>`;
    if(d.visit_story)h+=`<section class="guia-seccion-editorial"><h3>📍 Qué visitar y cómo organizarlo</h3><p>${escapar(limpiarTextoGuia(d.visit_story))}</p></section>`;

    if(Array.isArray(d.highlights)&&d.highlights.length){
      h+=`<section class="guia-seccion-editorial"><h3>🏛️ Visitas recomendadas</h3>`;
      d.highlights.forEach(x=>{
        h+=`<div class="guia-recomendacion">
          <h4>${escapar(x.name||"Visita")}</h4>
          ${htmlFotoVerificada(x.name,d.city||d.destination||"", "visit")}
          ${x.description?`<p>${escapar(limpiarTextoGuia(x.description))}</p>`:""}
          ${x.practical_note?`<p><strong>Información práctica:</strong> ${escapar(limpiarTextoGuia(x.practical_note))}</p>`:""}
          ${htmlDatosLugar(x.name,"visit",x.url||"")}
        </div>`;
      });
      h+=`</section>`;
    }

    if(d.gastronomy_intro)h+=`<section class="guia-seccion-editorial"><h3>🍽️ Gastronomía</h3><p>${escapar(limpiarTextoGuia(d.gastronomy_intro))}</p></section>`;
    if(Array.isArray(d.restaurants)&&d.restaurants.length){
      h+=`<section class="guia-seccion-editorial"><h3>🍴 Dónde comer</h3>`;
      d.restaurants.forEach((x,i)=>{
        h+=`<div class="guia-recomendacion ${i===0?"principal":""}">
          <h4>${i===0?"⭐ Recomendado · ":""}${escapar(x.name||"Restaurante")}</h4>
          ${htmlFotoVerificada(x.name,d.city||d.destination||"", "restaurant")}
          ${x.why?`<p>${escapar(limpiarTextoGuia(x.why))}</p>`:""}
          ${x.specialty?`<p><strong>Qué probar:</strong> ${escapar(limpiarTextoGuia(x.specialty))}</p>`:""}
          ${x.practical_note?`<p><strong>Consejo:</strong> ${escapar(limpiarTextoGuia(x.practical_note))}</p>`:""}
          ${htmlDatosLugar(x.name,"restaurant",x.website||"")}
        </div>`;
      });
      h+=`</section>`;
    }

    if(d.overnight_intro)h+=`<section class="guia-seccion-editorial"><h3>🌙 Pernocta</h3><p>${escapar(limpiarTextoGuia(d.overnight_intro))}</p></section>`;
    if(Array.isArray(d.overnight)&&d.overnight.length){
      h+=`<section class="guia-seccion-editorial"><h3>🚐 Dónde dormir</h3>`;
      d.overnight.forEach((x,i)=>{
        h+=`<div class="guia-recomendacion ${i===0?"principal":""}">
          <h4>${i===0?"⭐ Recomendado · ":""}${escapar(x.name||"Pernocta")}</h4>
          ${htmlFotoVerificada(x.name,d.city||d.destination||"", "overnight")}
          ${x.type?`<p><strong>Tipo:</strong> ${escapar(limpiarTextoGuia(x.type))}</p>`:""}
          ${x.why?`<p>${escapar(limpiarTextoGuia(x.why))}</p>`:""}
          ${x.services?`<p><strong>Servicios:</strong> ${escapar(limpiarTextoGuia(x.services))}</p>`:""}
          ${x.practical_info?`<p><strong>Información práctica:</strong> ${escapar(limpiarTextoGuia(x.practical_info))}</p>`:""}
          ${htmlDatosLugar(x.name,"overnight",x.website||"")}
        </div>`;
      });
      h+=`</section>`;
    }

    if(Array.isArray(d.practical_advice)&&d.practical_advice.length){
      h+=`<section class="guia-seccion-editorial"><h3>💡 Consejo del día</h3>${htmlLista(d.practical_advice.map(limpiarTextoGuia))}</section>`;
    }else if(d.practical_advice){
      h+=`<section class="guia-seccion-editorial"><h3>💡 Consejo del día</h3><p>${escapar(limpiarTextoGuia(d.practical_advice))}</p></section>`;
    }

    if(Array.isArray(d.useful_links)&&d.useful_links.length){
      h+=`<section class="guia-seccion-editorial"><h3>🔗 Enlaces útiles</h3>`;
      d.useful_links.forEach(x=>{
        h+=`<p>${htmlEnlaceGuia(x.label||"Abrir información",x.url)}${x.purpose?` — ${escapar(x.purpose)}`:""}</p>`;
      });
      h+=`</section>`;
    }

    h+=`</section>`;
  });

  if(Array.isArray(guide.final_notes)&&guide.final_notes.length){
    h+=`<section class="guia-seccion-editorial"><h3>📌 Notas finales</h3>${htmlLista(guide.final_notes)}</section>`;
  }else if(typeof guide.final_notes==="string"&&guide.final_notes){
    h+=`<section class="guia-seccion-editorial"><h3>📌 Notas finales</h3><p>${escapar(guide.final_notes)}</p></section>`;
  }

  return h+"</div>";
}

function htmlEstadoIA(respuesta){
  if(respuesta?.status==="research_required"){
    const faltan=(respuesta.missing_research||[]).map(x=>x.place).filter(Boolean);
    return `<div class="aviso-ruta"><strong>🔎 Ruta todavía no preparada.</strong><br>
      Falta investigación almacenada en D1${faltan.length?`: ${escapar(faltan.join(", "))}`:""}.
      No se ha llamado a OpenAI y no se ha generado contenido automático de sustitución.</div>`;
  }
  if(respuesta?.status==="cost_guard_active"){
    return `<div class="aviso-ruta"><strong>🔒 Protección de coste activa.</strong><br>
      La ruta no está todavía en la caché de IA. OpenAI permanece bloqueado y no se mostrará una guía inventada.</div>`;
  }
  return `<div class="error-ruta"><strong>⚠️ No hay una guía preparada para esta ruta.</strong><br>
    La carretera sí se ha calculado, pero la guía editorial no está disponible en D1.</div>`;
}

// ---------- Geoapify autocomplete ----------
function prepararAutocomplete(input) {
  if (!input || input.dataset.autocompleteListo) return;
  input.dataset.autocompleteListo="1";
  const wrap=document.createElement("div"); wrap.className="autocomplete-wrap";
  input.parentNode.insertBefore(wrap,input); wrap.appendChild(input);
  const lista=document.createElement("div"); lista.className="autocomplete-lista oculto"; wrap.appendChild(lista);
  let timer, controlador;

  const cerrar=()=>{lista.innerHTML="";lista.classList.add("oculto");};
  input.addEventListener("input",()=>{
    lugaresSeleccionados.delete(input); clearTimeout(timer); cerrar();
    const texto=input.value.trim(); if(texto.length<3)return;
    timer=setTimeout(async()=>{
      try{
        controlador?.abort(); controlador=new AbortController();
        const url=`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(texto)}&format=json&limit=6&lang=es&apiKey=${encodeURIComponent(config.GEOAPIFY_API_KEY)}`;
        const r=await fetch(url,{signal:controlador.signal}); if(!r.ok)throw new Error("Autocomplete no disponible");
        const data=await r.json(); cerrar();
        (data.results||[]).forEach(lugar=>{
          const b=document.createElement("button"); b.type="button"; b.className="autocomplete-opcion";
          b.innerHTML=`<strong>${escapar(lugar.name||lugar.city||lugar.address_line1||lugar.formatted)}</strong><small>${escapar(lugar.formatted||"")}</small>`;
          b.addEventListener("click",()=>{ input.value=lugar.formatted; lugaresSeleccionados.set(input,lugar); cerrar(); });
          lista.appendChild(b);
        });
        if(lista.children.length)lista.classList.remove("oculto");
      }catch(e){ if(e.name!=="AbortError") console.warn(e); }
    },300);
  });
  document.addEventListener("click",e=>{if(!wrap.contains(e.target))cerrar();});
}

async function resolverLugar(input){
  const seleccionado=lugaresSeleccionados.get(input);
  if(seleccionado?.lat!=null && seleccionado?.lon!=null)return seleccionado;
  const texto=input.value.trim(); if(!texto)throw new Error("Falta una ubicación.");
  const url=`https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(texto)}&format=json&limit=1&lang=es&apiKey=${encodeURIComponent(config.GEOAPIFY_API_KEY)}`;
  const r=await fetch(url); if(!r.ok)throw new Error(`No se pudo localizar: ${texto}`);
  const data=await r.json(); const lugar=data.results?.[0]; if(!lugar)throw new Error(`No encontramos: ${texto}`);
  input.value=lugar.formatted||texto; lugaresSeleccionados.set(input,lugar); return lugar;
}

prepararAutocomplete(document.getElementById("origen"));
prepararAutocomplete(document.getElementById("destinoPrincipal"));

let contadorDestinos=0;
document.getElementById("anadirDestino").addEventListener("click",()=>{
  contadorDestinos++;
  const fila=document.createElement("div"); fila.className="destino-extra";
  fila.innerHTML=`<label><span>📍 Destino adicional ${contadorDestinos}</span><input type="text" class="destinoAdicional" placeholder="Ciudad, región o lugar"></label><button type="button" class="boton-secundario eliminar-destino" aria-label="Eliminar destino">✕</button>`;
  document.getElementById("destinosExtra").appendChild(fila);
  prepararAutocomplete(fila.querySelector(".destinoAdicional"));
  fila.querySelector(".eliminar-destino").addEventListener("click",()=>fila.remove());
});

function modoGeoapify(vehiculo){
  return ({autocaravana:"light_truck",camper:"light_truck",caravana:"light_truck",coche:"drive",moto:"motorcycle"})[vehiculo]||"drive";
}
function evitarGeoapify(evitar){
  const mapaEv={peajes:"tolls",autopistas:"highways",ferris:"ferries"};
  return evitar.map(x=>mapaEv[x]).filter(Boolean);
}

async function calcularRuta(lugares,datos){
  const waypoints=lugares.map(l=>`${l.lat},${l.lon}`).join("|");
  const params=new URLSearchParams({waypoints,mode:modoGeoapify(datos.vehiculo),units:"metric",lang:"es",format:"geojson",apiKey:config.GEOAPIFY_API_KEY});
  const evita=evitarGeoapify(datos.evitar); if(evita.length)params.set("avoid",evita.join("|"));
  const r=await fetch(`https://api.geoapify.com/v1/routing?${params}`);
  if(!r.ok){ let msg=""; try{msg=(await r.json()).message||""}catch{} throw new Error(msg||"Geoapify no pudo calcular la ruta."); }
  const data=await r.json(); if(!data.features?.length)throw new Error("No se encontró una ruta entre esos puntos."); return data;
}

function iniciarMapa(){
  if(mapa)return;
  mapa=L.map("mapaRuta").setView([48.5,9],5);
  const retina=L.Browser.retina;
  const base="https://maps.geoapify.com/v1/tile/"+(config.MAP_STYLE||"osm-bright")+"/{z}/{x}/{y}.png?apiKey={apiKey}";
  const hi="https://maps.geoapify.com/v1/tile/"+(config.MAP_STYLE||"osm-bright")+"/{z}/{x}/{y}@2x.png?apiKey={apiKey}";
  L.tileLayer(retina?hi:base,{apiKey:config.GEOAPIFY_API_KEY,maxZoom:20,attribution:'Powered by <a href="https://www.geoapify.com/" target="_blank">Geoapify</a> | <a href="https://openmaptiles.org/" target="_blank">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a> contributors'}).addTo(mapa);
}

function pintarRuta(data,lugares){
  iniciarMapa();
  if(capaRuta)mapa.removeLayer(capaRuta); marcadores.forEach(m=>mapa.removeLayer(m)); marcadores=[];
  capaRuta=L.geoJSON(data,{style:{weight:5,opacity:.8}}).addTo(mapa);
  lugares.forEach((l,i)=>{
    const esFinal=i===lugares.length-1;
    const titulo=i===0?"Salida":(esFinal?"Destino":(l.recomendada?"Parada recomendada":"Parada "+i));
    const m=L.marker([l.lat,l.lon]).addTo(mapa).bindPopup(`<strong>${escapar(titulo)}</strong><br>${escapar(l.formatted||l.name||"")}`);
    marcadores.push(m);
  });
  mapa.fitBounds(capaRuta.getBounds(),{padding:[24,24]}); setTimeout(()=>mapa.invalidateSize(),100);
}

async function pintarResultado(data,lugares,datos){
  const feature=data.features[0], p=feature.properties||{};
  const distancia=Number(p.distance)||0, tiempo=Number(p.time)||0;
  const maxHoras=Math.max(1,Number(datos.maxConduccion)||4);
  const jornadasConduccion=Math.max(1,Math.ceil(tiempo/(maxHoras*3600)));
  const diasSolicitados=Math.max(1,Number(datos.dias)||1);

  if(diasSolicitados<jornadasConduccion){
    throw new Error(`Con un máximo de ${maxHoras} h de conducción al día, este trayecto necesita al menos ${jornadasConduccion} días. Has elegido ${diasSolicitados}. Aumenta los días del viaje o las horas máximas de conducción.`);
  }

  document.getElementById("estadoCalculo").textContent=`${lugares[0].formatted||datos.origen} → ${lugares[lugares.length-1].formatted||datos.destinoPrincipal}`;
  pintarMetricas(distancia,tiempo,diasSolicitados,lugares.length);

  let html=htmlRecorrido(feature,lugares);
  if(jornadasConduccion>1){
    html+=`<div class="aviso-ruta"><strong>Plan de conducción:</strong> con un máximo de ${escapar(maxHoras)} h al día, el desplazamiento necesita ${jornadasConduccion} jornadas de carretera.</div>`;
  }
  if(diasSolicitados>jornadasConduccion){
    const libres=diasSolicitados-jornadasConduccion;
    html+=`<div class="aviso-optimizacion"><strong>🗓️ Viaje de ${diasSolicitados} días:</strong> el trayecto ocupa ${jornadasConduccion} ${jornadasConduccion===1?"día":"días"} de conducción y ${libres} ${libres===1?"día queda":"días quedan"} para disfrutar del destino.</div>`;
  }

  document.getElementById("etapasRuta").innerHTML=html+'<div id="cargandoParadas" class="aviso-suave">🔎 Preparando todas las jornadas, visitas, gastronomía y pernocta…</div>';
  pintarRuta(data,lugares);

  const plan=await crearPlanJornadas(feature,lugares,datos);
  const promesaPernoctas=completarPernoctas(plan,datos);
  const promesaGastronomia=completarGastronomia(plan,datos);
  const promesaVisitasDestino=completarVisitasDestino(plan,datos);
  const promesaFichas=promesaVisitasDestino.then(()=>completarFichasEnriquecidas(plan));
  document.getElementById("cargandoParadas")?.remove();

  const conParadas=plan.filter(e=>e.intermedia && e.poiPrincipal && Array.isArray(e.coordRecomendada));
  if(conParadas.length){
    try{
      document.getElementById("estadoCalculo").textContent="Recalculando la carretera por las mejores paradas…";
      const lugaresOpt=[lugares[0],...conParadas.map(e=>({
        lat:e.coordRecomendada[1], lon:e.coordRecomendada[0], formatted:e.hasta,
        name:e.poiPrincipal, recomendada:true
      })),lugares.at(-1)];
      const rutaOpt=await calcularRuta(lugaresOpt,datos);
      const fOpt=rutaOpt.features[0], pOpt=fOpt.properties||{};
      const tiempoExtra=Math.max(0,(pOpt.time||0)-tiempo);
      const distanciaExtra=Math.max(0,(pOpt.distance||0)-distancia);

      pintarRuta(rutaOpt,lugaresOpt);
      pintarMetricas(pOpt.distance||0,pOpt.time||0,diasSolicitados,lugaresOpt.length);
      document.getElementById("estadoCalculo").textContent=`Ruta optimizada: ${lugaresOpt[0].formatted||datos.origen} → ${lugaresOpt.at(-1)?.formatted||datos.destinoPrincipal}`;
      document.getElementById("etapasRuta").innerHTML=htmlRecorrido(fOpt,lugaresOpt,"🚐 Recorrido optimizado");
      document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",htmlResumenDesvio(distanciaExtra,tiempoExtra,conParadas.length));
      await Promise.all([promesaPernoctas,promesaGastronomia,promesaVisitasDestino,promesaFichas]);
      await prepararFotosPlanGenerico(plan);
      document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",htmlPlanJornadas(plan,datos));
    }catch(err){
      console.warn("No se pudo recalcular por las paradas recomendadas",err);
      await Promise.all([promesaPernoctas,promesaGastronomia,promesaVisitasDestino,promesaFichas]);
      await prepararFotosPlanGenerico(plan);
      document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",htmlPlanJornadas(plan,datos));
      document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",'<div class="aviso-suave">Las recomendaciones son válidas, pero no hemos podido recalcular el desvío completo en esta ocasión. Se mantiene la ruta directa.</div>');
    }
  }else{
    await Promise.all([promesaPernoctas,promesaGastronomia,promesaVisitasDestino,promesaFichas]);
    await prepararFotosPlanGenerico(plan);
    document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",htmlPlanJornadas(plan,datos));
  }

  return {plan};
}

function pintarMetricas(distancia,tiempo,jornadas,puntos){
  document.getElementById("metricasRuta").innerHTML=`
    <div class="metrica-ruta">📏 Distancia<strong>${formatoKm(distancia)}</strong></div>
    <div class="metrica-ruta">⏱️ Conducción<strong>${formatoTiempo(tiempo)}</strong></div>
    <div class="metrica-ruta">🛏️ Jornadas estimadas<strong>${jornadas}</strong></div>
    <div class="metrica-ruta">📍 Puntos de ruta<strong>${puntos}</strong></div>`;
}

function htmlRecorrido(feature,lugares,titulo="🚐 Recorrido"){
  const p=feature.properties||{}, legs=p.legs||[];
  let html=`<h3>${titulo}</h3>`;
  if(legs.length){
    legs.forEach((leg,i)=>{
      const etiqueta=(lugares[i+1]?.recomendada?'<span class="badge-recomendada">✨ parada elegida</span>':'');
      html+=`<div class="etapa-card"><div class="etapa-numero">${i+1}</div><div><strong>${escapar(lugares[i]?.formatted||"Salida")} → ${escapar(lugares[i+1]?.formatted||"Destino")}</strong>${etiqueta}<p>${formatoKm(leg.distance||0)} · ${formatoTiempo(leg.time||0)}</p></div></div>`;
    });
  } else html+=`<p>${formatoKm(p.distance||0)} · ${formatoTiempo(p.time||0)}</p>`;
  return html;
}

function htmlResumenDesvio(distanciaExtra,tiempoExtra,cantidad){
  const hay=distanciaExtra>500 || tiempoExtra>60;
  if(!hay)return `<div class="aviso-optimizacion"><strong>✨ Ruta adaptada:</strong> hemos incorporado ${cantidad} ${cantidad===1?"parada interesante":"paradas interesantes"} prácticamente sin aumentar el recorrido.</div>`;
  return `<div class="aviso-optimizacion"><strong>✨ Ruta adaptada a tus paradas:</strong> hemos incorporado ${cantidad} ${cantidad===1?"parada interesante":"paradas interesantes"}. El desvío real añade aproximadamente <strong>${formatoKm(distanciaExtra)}</strong> y <strong>${formatoTiempo(tiempoExtra)}</strong> frente a ir directamente.</div>`;
}


// ---------- Etapas limpias para el Worker ----------
let ejecutarRutaComoDemo=false;

async function crearEtapasWorker(feature,lugares,datos,esDemo=false){
  // La demo conserva exactamente las etapas con las que se creó su caché en D1.
  const origenClave=normalizarClaveMedia(nombreLugarWorker(lugares[0],datos.origen));
  const destinoClave=normalizarClaveMedia(nombreLugarWorker(lugares.at(-1),datos.destinoPrincipal));
  if(esDemo && origenClave.includes("saarlouis") && destinoClave.includes("zagreb")){
    return [
      {day:1,place:"Günzburg",country:"Germany",driving_km:338,driving_minutes:205,is_final:false},
      {day:2,place:"Salzburg",country:"Austria",driving_km:300,driving_minutes:180,is_final:false},
      {day:3,place:"Zagreb",country:"Croatia",driving_km:410,driving_minutes:245,is_final:true}
    ];
  }

  // Para cualquier otra ruta, las jornadas se calculan de forma genérica a partir
  // del tiempo REAL devuelto por Geoapify y del máximo de conducción elegido.
  const p=feature.properties||{};
  const totalTiempo=Math.max(0,Number(p.time)||0);
  const totalDist=Math.max(0,Number(p.distance)||0);
  const maxSeg=Math.max(1,Number(datos.maxConduccion)||4)*3600;
  const jornadas=Math.max(1,Math.ceil(totalTiempo/maxSeg));
  const destino=lugares.at(-1);

  if(jornadas<=1){
    return [{
      day:1,
      place:nombreLugarWorker(destino,datos.destinoPrincipal),
      country:paisCanonico(destino?.country_code,destino?.country),
      driving_km:Math.round(totalDist/1000),
      driving_minutes:Math.round(totalTiempo/60),
      is_final:true
    }];
  }

  const coords=puntosLinea(feature.geometry);
  if(coords.length<2)throw new Error("No se pudieron calcular las etapas de la carretera.");
  const acum=distanciaAcumulada(coords), geomTotal=acum.at(-1)||1;
  const stops=[];
  let ultimoLugar="";

  // Al repartir por jornadas, ninguna etapa supera el máximo elegido salvo pequeñas
  // diferencias derivadas de que la geometría solo permite aproximar el punto de corte.
  for(let dia=1;dia<jornadas;dia++){
    const fraccion=dia/jornadas;
    const objetivo=geomTotal*fraccion;
    let idx=indiceCercano(acum,objetivo,0);
    let rev=await reverseLugar(coords[idx]);
    let place=nombreLugarWorker(rev,nombreLocalidad(rev));

    // Si el reverse-geocoding devuelve la misma localidad que la etapa anterior,
    // probamos ligeramente más adelante para evitar duplicados absurdos.
    if(place && normalizarClaveMedia(place)===normalizarClaveMedia(ultimoLugar)){
      const objetivo2=Math.min(geomTotal,objetivo+geomTotal*0.025);
      idx=indiceCercano(acum,objetivo2,idx);
      const rev2=await reverseLugar(coords[idx]);
      const place2=nombreLugarWorker(rev2,nombreLocalidad(rev2));
      if(place2){ rev=rev2; place=place2; }
    }

    const kmHasta=Math.round((totalDist*fraccion)/1000);
    const minHasta=Math.round((totalTiempo*fraccion)/60);
    const kmPrev=stops.reduce((a,x)=>a+(Number(x.driving_km)||0),0);
    const minPrev=stops.reduce((a,x)=>a+(Number(x.driving_minutes)||0),0);

    stops.push({
      day:dia,
      place:place||`Parada día ${dia}`,
      country:paisCanonico(rev?.country_code,rev?.country),
      driving_km:Math.max(0,kmHasta-kmPrev),
      driving_minutes:Math.max(0,minHasta-minPrev),
      is_final:false
    });
    ultimoLugar=place||ultimoLugar;
  }

  const kmUsados=stops.reduce((a,x)=>a+(Number(x.driving_km)||0),0);
  const minUsados=stops.reduce((a,x)=>a+(Number(x.driving_minutes)||0),0);
  stops.push({
    day:jornadas,
    place:nombreLugarWorker(destino,datos.destinoPrincipal),
    country:paisCanonico(destino?.country_code,destino?.country),
    driving_km:Math.max(0,Math.round(totalDist/1000)-kmUsados),
    driving_minutes:Math.max(0,Math.round(totalTiempo/60)-minUsados),
    is_final:true
  });

  return stops;
}

function htmlEtapasGenericas(stops){
  if(!Array.isArray(stops)||!stops.length)return "";
  let html='<div id="etapasGenericasF25" style="margin-top:18px"><h3>🛣️ Etapas calculadas</h3>';
  for(const x of stops){
    const pais=x.country?` · ${escapar(x.country)}`:"";
    const km=Number.isFinite(Number(x.driving_km))?`${new Intl.NumberFormat("es-ES").format(Number(x.driving_km))} km`:"";
    const mins=Number(x.driving_minutes)||0;
    const tiempo=mins?formatoTiempo(mins*60):"";
    const detalle=[km,tiempo].filter(Boolean).join(" · ");
    html+=`<div class="etapa-card"><div class="etapa-numero">${Number(x.day)||""}</div><div><strong>${escapar(x.place||"Etapa")}${pais}</strong>${detalle?`<p>${detalle}</p>`:""}</div></div>`;
  }
  return html+'</div>';
}

function pintarResultadoBase(data,lugares,datos){
  const feature=data.features[0],p=feature.properties||{};
  const distancia=p.distance||0,tiempo=p.time||0;
  const maxHoras=Math.max(1,Number(datos.maxConduccion)||4);
  const jornadas=Math.max(1,Math.ceil(tiempo/(maxHoras*3600)));
  document.getElementById("estadoCalculo").textContent=`${lugares[0].formatted||datos.origen} → ${lugares.at(-1).formatted||datos.destinoPrincipal}`;
  pintarMetricas(distancia,tiempo,jornadas,lugares.length);
  document.getElementById("etapasRuta").innerHTML=htmlRecorrido(feature,lugares);
  pintarRuta(data,lugares);
}

// ---------- Fase 5: jornadas + paradas interesantes + recálculo real ----------
function puntosLinea(geometry){
  if(!geometry)return [];
  if(geometry.type==="LineString")return geometry.coordinates||[];
  if(geometry.type==="MultiLineString")return (geometry.coordinates||[]).flat();
  return [];
}
function distanciaHaversine(a,b){
  const R=6371000, rad=x=>x*Math.PI/180;
  const dLat=rad(b[1]-a[1]), dLon=rad(b[0]-a[0]);
  const q=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(q));
}
function distanciaAcumulada(coords){
  const out=[0]; for(let i=1;i<coords.length;i++)out.push(out[i-1]+distanciaHaversine(coords[i-1],coords[i])); return out;
}
function indiceCercano(acum,objetivo,desde=0){
  let mejor=desde, dif=Infinity; for(let i=desde;i<acum.length;i++){const d=Math.abs(acum[i]-objetivo);if(d<dif){dif=d;mejor=i;}if(acum[i]>objetivo&&d>dif)break;} return mejor;
}
async function reverseLugar(coord){
  try{
    const url=`https://api.geoapify.com/v1/geocode/reverse?lat=${coord[1]}&lon=${coord[0]}&format=json&lang=es&apiKey=${encodeURIComponent(config.GEOAPIFY_API_KEY)}`;
    const r=await fetch(url); if(!r.ok)throw new Error(); const d=await r.json(); return d.results?.[0]||null;
  }catch{return null;}
}
function nombreLocalidad(x){ return x?.city||x?.town||x?.village||x?.municipality||x?.county||x?.formatted||"Zona de parada"; }

function categoriasSegunViaje(datos){
  const elegidas=new Set(datos.intereses||[]), cats=new Set(["tourism.attraction","tourism.sights"]);
  if(elegidas.has("naturaleza")){ cats.add("leisure.park"); cats.add("leisure.park.nature_reserve"); cats.add("natural.protected_area"); }
  if(elegidas.has("playa")){ cats.add("natural.coastal"); cats.add("natural.water"); }
  if(elegidas.has("montana")){ cats.add("natural.mountain"); cats.add("tourism.attraction.viewpoint"); }
  if(elegidas.has("monumentos")||elegidas.has("pueblos")){ cats.add("heritage"); cats.add("tourism.sights.castle"); }
  if(elegidas.has("senderismo")){ cats.add("natural.protected_area"); cats.add("national_park"); }
  if(elegidas.has("animales")){ cats.add("entertainment.zoo"); }
  if(elegidas.has("acuarios")){ cats.add("entertainment.aquarium"); }
  if(elegidas.has("parques")){ cats.add("entertainment.theme_park"); cats.add("entertainment.water_park"); cats.add("entertainment.activity_park"); }
  if(elegidas.has("museos-ninos")){ cats.add("entertainment.museum"); }
  if(Number(datos.ninos)>0 && datos.recomendacionesNinos){ cats.add("leisure.playground"); cats.add("entertainment"); }
  return [...cats];
}
function etiquetaCategoria(categorias=[]){
  const c=categorias.join(" ");
  if(c.includes("theme_park")||c.includes("activity_park")||c.includes("water_park"))return "🎢 Diversión";
  if(c.includes("zoo"))return "🦁 Animales";
  if(c.includes("aquarium"))return "🐠 Acuario";
  if(c.includes("museum"))return "🏛️ Museo";
  if(c.includes("playground"))return "🛝 Niños";
  if(c.includes("castle")||c.includes("heritage")||c.includes("sights"))return "🏰 Patrimonio";
  if(c.includes("natural")||c.includes("park")||c.includes("viewpoint"))return "🌲 Naturaleza";
  return "📍 Visita";
}
function puntuacionPOI(f,datos){
  const p=f.properties||{}, cats=p.categories||[], texto=cats.join(" "); let puntos=0;
  const intereses=new Set(datos.intereses||[]);
  if(intereses.has("naturaleza") && /(natural|nature_reserve|park|viewpoint)/.test(texto))puntos+=8;
  if(intereses.has("montana") && /(mountain|viewpoint)/.test(texto))puntos+=8;
  if(intereses.has("playa") && /(coastal|water)/.test(texto))puntos+=8;
  if(intereses.has("monumentos") && /(heritage|castle|sights)/.test(texto))puntos+=8;
  if(intereses.has("animales") && /zoo/.test(texto))puntos+=12;
  if(intereses.has("acuarios") && /aquarium/.test(texto))puntos+=12;
  if(intereses.has("parques") && /(theme_park|water_park|activity_park)/.test(texto))puntos+=12;
  if(intereses.has("museos-ninos") && /museum/.test(texto))puntos+=10;
  if(Number(datos.ninos)>0 && datos.recomendacionesNinos && /(playground|zoo|aquarium|theme_park|water_park|activity_park|museum)/.test(texto))puntos+=7;
  if(p.name)puntos+=2;
  const nombre=String(p.name||"").toLowerCase();
  // Evitar micro-POI internos (fotopoints, números de atracción, pequeños objetos)
  // cuando existe una atracción turística completa en la misma zona.
  if(/^\s*\d+\s*:/.test(nombre))puntos-=18;
  if(/fotopoint|photo ?point|fotopunkt|spielplatz|playground/.test(nombre))puntos-=14;
  if(/theme_park|zoo|aquarium|castle|museum/.test(texto))puntos+=5;
  if(p.wiki_and_media?.wikipedia||p.wiki_and_media?.wikidata)puntos+=8;
  const popularidad=Number(p.rank?.popularity)||0;
  const importancia=Number(p.rank?.importance)||0;
  if(popularidad>0)puntos+=Math.min(24,popularidad*3);
  if(importancia>0)puntos+=Math.min(18,importancia*18);
  if(/point z[eé]ro|kilom[eè]tre z[eé]ro|zero point|plaque|bust|fotopoint|photo ?point/i.test(nombre))puntos-=16;
  const dist=Number(p.distance)||0; puntos+=Math.max(0,6-dist/5000);
  return puntos;
}
async function buscarPOIs(coord,datos){
  const categorias=categoriasSegunViaje(datos);
  const params=new URLSearchParams({
    categories:categorias.join(","),
    filter:`circle:${coord[0]},${coord[1]},25000`,
    bias:`proximity:${coord[0]},${coord[1]}`,
    limit:"40",lang:"es",apiKey:config.GEOAPIFY_API_KEY
  });
  const r=await fetch(`https://api.geoapify.com/v2/places?${params}`); if(!r.ok)return [];
  const d=await r.json();
  return (d.features||[]).filter(f=>f.properties?.name).sort((a,b)=>puntuacionPOI(b,datos)-puntuacionPOI(a,datos));
}
async function enriquecerCorte(corte,datos){
  const pois=await buscarPOIs(corte.coord,datos);
  const mejores=pois.slice(0,2);
  // El POI mejor valorado sirve para desplazar la zona recomendada; todavía no altera la carretera.
  if(mejores[0]){
    const p=mejores[0].properties||{}, c=mejores[0].geometry?.coordinates;
    corte.nombre=nombreLocalidad(p);
    corte.poiPrincipal=p.name||null;
    corte.coordRecomendada=Array.isArray(c)?c:corte.coord;
    corte.codigoPais=(p.country_code||"").toLowerCase();
  } else {
    const rev=await reverseLugar(corte.coord); corte.nombre=nombreLocalidad(rev); corte.codigoPais=(rev?.country_code||"").toLowerCase();
  }
  corte.pois=mejores.map(f=>{
    const p=f.properties||{}, c=f.geometry?.coordinates||[];
    return {
      nombre:p.name||"Lugar de interés", localidad:nombreLocalidad(p),
      direccion:p.formatted||p.address_line2||"", distancia:Number(p.distance)||0,
      categorias:p.categories||[], etiqueta:etiquetaCategoria(p.categories||[]),
      lat:Number(c[1]), lon:Number(c[0]),
      web:p.website||p.contact?.website||p.datasource?.raw?.website||"",
      placeId:p.place_id||"", descripcion:p.description||p.datasource?.raw?.description||"",
      horarios:p.opening_hours||p.datasource?.raw?.opening_hours||"", imagen:"", wikiUrl:"", wikiTitulo:""
    };
  });
  return corte;
}
async function crearPlanJornadas(feature,lugares,datos){
  const p=feature.properties||{}, totalTiempo=Number(p.time)||0, totalDist=Number(p.distance)||0;
  const maxSeg=Math.max(1,Number(datos.maxConduccion)||4)*3600;
  const jornadasConduccion=Math.max(1,Math.ceil(totalTiempo/maxSeg));
  const diasSolicitados=Math.max(1,Number(datos.dias)||1);
  if(diasSolicitados<jornadasConduccion)throw new Error(`El trayecto necesita al menos ${jornadasConduccion} días de conducción con el límite elegido.`);

  const destinoFinal=lugares.at(-1);
  const destinoNombre=destinoFinal?.formatted||datos.destinoPrincipal;
  const destinoCoord=(destinoFinal?.lon!=null&&destinoFinal?.lat!=null)?[Number(destinoFinal.lon),Number(destinoFinal.lat)]:null;
  const destinoPais=String(destinoFinal?.country_code||"").toLowerCase();
  const puntos=[{nombre:lugares[0]?.formatted||datos.origen,distRuta:0,tiempoRuta:0}];

  if(jornadasConduccion>1){
    const coords=puntosLinea(feature.geometry); if(coords.length<2)throw new Error("No se pudieron calcular las jornadas de carretera.");
    const acum=distanciaAcumulada(coords), geomTotal=acum.at(-1)||totalDist;
    const cortes=[]; let desde=0;
    for(let dia=1;dia<jornadasConduccion;dia++){
      const objetivo=geomTotal*(dia/jornadasConduccion), idx=indiceCercano(acum,objetivo,desde+1); desde=idx;
      cortes.push({coord:coords[idx],nombre:"Buscando una parada interesante…",distRuta:totalDist*(dia/jornadasConduccion),tiempoRuta:totalTiempo*(dia/jornadasConduccion)});
    }
    const cortesEnriquecidos=await Promise.all(cortes.map(c=>enriquecerCorte(c,datos)));
    puntos.push(...cortesEnriquecidos);
  }

  puntos.push({
    nombre:destinoNombre,distRuta:totalDist,tiempoRuta:totalTiempo,
    coordRecomendada:destinoCoord,codigoPais:destinoPais,esDestino:true
  });

  const plan=puntos.slice(0,-1).map((a,i)=>{
    const b=puntos[i+1], esDestino=i===puntos.length-2;
    return {
      dia:i+1,desde:a.nombre,hasta:b.nombre,distancia:b.distRuta-a.distRuta,tiempo:b.tiempoRuta-a.tiempoRuta,
      intermedia:!esDestino,esDestino,estanciaDestino:false,pois:b.pois||[],poiPrincipal:b.poiPrincipal||null,
      coordRecomendada:b.coordRecomendada||null,coordIdeal:b.coord||null,codigoPais:b.codigoPais||null,alojamientos:[],restaurantes:[]
    };
  });

  // Los días elegidos por el usuario son la duración REAL del viaje. Los días que
  // sobran después de llegar se convierten en jornadas completas en el destino.
  for(let dia=jornadasConduccion+1;dia<=diasSolicitados;dia++){
    plan.push({
      dia,desde:destinoNombre,hasta:destinoNombre,distancia:0,tiempo:0,
      intermedia:false,esDestino:true,estanciaDestino:true,pois:[],poiPrincipal:null,
      coordRecomendada:destinoCoord,coordIdeal:destinoCoord,codigoPais:destinoPais,alojamientos:[],restaurantes:[]
    });
  }
  return plan;
}
// ---------- Fase 7:// ---------- Fase 7: el destino también forma parte de la guía ----------
async function completarVisitasDestino(plan,datos){
  const diasDestino=plan.filter(e=>e.esDestino&&Array.isArray(e.coordRecomendada));
  if(!diasDestino.length)return plan;
  const centro=diasDestino[0].coordRecomendada;
  try{
    const resultados=await buscarPOIs(centro,datos);
    const unicos=[]; const vistos=new Set();
    for(const f of resultados){
      const nombre=String(f.properties?.name||"").trim();
      const clave=normalizarClaveMedia(nombre);
      if(!nombre||vistos.has(clave))continue;
      vistos.add(clave); unicos.push(f);
    }
    let cursor=0;
    for(const etapa of diasDestino){
      const horasConduccion=(Number(etapa.tiempo)||0)/3600;
      const ritmo=String(datos.ritmo||"equilibrado");
      let cantidad=ritmo==="tranquilo"?3:ritmo==="intenso"?5:4;
      if(!etapa.estanciaDestino){
        if(horasConduccion>=5)cantidad=1;
        else if(horasConduccion>=3)cantidad=Math.min(cantidad,2);
        else if(horasConduccion>=1.5)cantidad=Math.min(cantidad,3);
      }
      const seleccion=unicos.slice(cursor,cursor+cantidad); cursor+=seleccion.length;
      etapa.pois=seleccion.map(f=>{
        const p=f.properties||{}, c=f.geometry?.coordinates||[];
        return {nombre:p.name||"Lugar de interés",localidad:nombreLocalidad(p),direccion:p.formatted||p.address_line2||"",distancia:Number(p.distance)||0,categorias:p.categories||[],etiqueta:etiquetaCategoria(p.categories||[]),lat:Number(c[1]),lon:Number(c[0]),web:p.website||p.contact?.website||p.datasource?.raw?.website||"",placeId:p.place_id||"",descripcion:p.description||p.datasource?.raw?.description||"",horarios:p.opening_hours||p.datasource?.raw?.opening_hours||"",imagen:"",wikiUrl:"",wikiTitulo:""};
      });
      etapa.poiPrincipal=etapa.pois[0]?.nombre||null;
    }
  }catch(err){console.warn("No se pudieron distribuir las visitas del destino",err);}
  return plan;
}

// ---------- Fase 8:// ---------- Fase 8: fichas enriquecidas + fotografía del lugar principal ----------
function tiempoVisitaPOI(x){
  const c=(x.categorias||[]).join(" ");
  if(/theme_park|water_park|zoo|aquarium/.test(c))return "3–5 h";
  if(/museum/.test(c))return "1 h 30 min–2 h";
  if(/natural|nature_reserve|national_park/.test(c))return "1–3 h";
  if(/castle|heritage|sights/.test(c))return "1–2 h";
  if(/viewpoint|artwork|fountain/.test(c))return "30–60 min";
  return "1–2 h";
}
function limpiarExtracto(t){
  return String(t||"").replace(/\s+/g," ").trim().slice(0,650);
}
function wikipediaUrlDesdeReferencia(ref){
  if(!ref)return "";
  if(/^https?:\/\//i.test(ref))return ref;
  const m=String(ref).match(/^([a-z-]+):(.+)$/i);
  if(!m)return "";
  return `https://${m[1]}.wikipedia.org/wiki/${encodeURIComponent(m[2].replace(/ /g,"_"))}`;
}
async function detallesGeoapifyPOI(x){
  if(!x?.placeId)return x;
  try{
    const params=new URLSearchParams({id:x.placeId,features:"details",lang:"es",apiKey:config.GEOAPIFY_API_KEY});
    const r=await fetch(`https://api.geoapify.com/v2/place-details?${params}`); if(!r.ok)return x;
    const d=await r.json(); const p=d.features?.find(f=>f.properties?.feature_type==="details")?.properties||d.features?.[0]?.properties||{};
    x.descripcion=x.descripcion||p.description||p.description_international?.es||p.datasource?.raw?.description||"";
    x.horarios=x.horarios||p.opening_hours||p.datasource?.raw?.opening_hours||"";
    x.web=x.web||p.website||p.contact?.website||p.datasource?.raw?.website||"";
    const media=p.wiki_and_media||{};
    x.imagen=x.imagen||media.image||"";
    x.wikiUrl=x.wikiUrl||wikipediaUrlDesdeReferencia(media.wikipedia)||"";
    x.wikidata=x.wikidata||media.wikidata||"";
    x.commons=x.commons||media.wikimedia_commons||"";
  }catch{}
  return x;
}
async function wikipediaBuscar(x,idioma="es"){
  const consulta=[x.nombre,x.localidad].filter(Boolean).join(" ");
  const params=new URLSearchParams({action:"query",generator:"search",gsrsearch:consulta,gsrnamespace:"0",gsrlimit:"1",prop:"pageimages|extracts|info",inprop:"url",piprop:"thumbnail",pithumbsize:"1200",exintro:"1",explaintext:"1",exsentences:"4",redirects:"1",format:"json",origin:"*"});
  const r=await fetch(`https://${idioma}.wikipedia.org/w/api.php?${params}`); if(!r.ok)return null;
  const d=await r.json(); return Object.values(d.query?.pages||{})[0]||null;
}
async function commonsFotoPOI(x){
  if(x.imagen||!x?.nombre)return x;
  try{
    const consultas=[[x.nombre,x.localidad].filter(Boolean).join(" "),x.nombre].filter(Boolean);
    for(const consulta of consultas){
      const params=new URLSearchParams({action:"query",generator:"search",gsrsearch:consulta,gsrnamespace:"6",gsrlimit:"5",prop:"imageinfo",iiprop:"url",iiurlwidth:"1200",format:"json",origin:"*"});
      const r=await fetch(`https://commons.wikimedia.org/w/api.php?${params}`); if(!r.ok)continue;
      const d=await r.json(); const paginas=Object.values(d.query?.pages||{});
      const pagina=paginas.find(p=>p.imageinfo?.[0]?.thumburl)||paginas.find(p=>p.imageinfo?.[0]?.url);
      if(pagina){x.imagen=pagina.imageinfo?.[0]?.thumburl||pagina.imageinfo?.[0]?.url||"";x.commonsUrl=pagina.imageinfo?.[0]?.descriptionurl||"";break;}
    }
  }catch{}
  return x;
}
async function wikipediaPOI(x){
  if(!x?.nombre)return x;
  try{
    let page=null;
    for(const idioma of ["es","en"]){
      page=await wikipediaBuscar(x,idioma); if(page?.thumbnail?.source||page?.extract)break;
    }
    if(page){
      x.imagen=x.imagen||page.thumbnail?.source||"";
      x.wikiUrl=x.wikiUrl||page.fullurl||""; x.wikiTitulo=page.title||"";
      if(!x.descripcion)x.descripcion=limpiarExtracto(page.extract||"");
    }
    if(!x.imagen)await commonsFotoPOI(x);
  }catch{}
  return x;
}
async function enriquecerFichaPrincipal(etapa){
  const principal=etapa?.pois?.[0]; if(!principal)return etapa;
  principal.tiempoVisita=tiempoVisitaPOI(principal);
  await detallesGeoapifyPOI(principal);
  await wikipediaPOI(principal);
  return etapa;
}
async function completarFichasEnriquecidas(plan){
  const tareas=[];
  for(const etapa of plan){
    for(const poi of (etapa.pois||[])){
      tareas.push((async()=>{
        poi.tiempoVisita=tiempoVisitaPOI(poi);
        await detallesGeoapifyPOI(poi);
        await wikipediaPOI(poi);
      })());
    }
  }
  await Promise.all(tareas);
  return plan;
}

// ---------- Fase 6:// ---------- Fase 6: pernoctas con nuestra propia base de datos ----------
const cacheAlojamientos=new Map();
const archivosPernocta={
  es:["campings-espana-definitivo.json?v=1","areas-parkings-espana-v3.json?v=1"],
  it:["campings-italia-definitivo.json?v=1","areas-italia-definitivo-v3.json?v=3"],
  pt:["campings-portugal-definitivo.json?v=1","areas-portugal-definitivo.json?v=2"],
  fr:["campings-francia-definitivo.json?v=1","areas-francia-definitivo.json?v=1"],
  de:["campings-alemania-definitivo.json?v=1","areas-alemania-definitivo.json?v=2"],
  ch:["campings-suiza-definitivo.json?v=2","areas-suiza-definitivo.json?v=1"],
  at:["campings-austria-definitivo.json?v=1","areas-austria-definitivo.json?v=1"],
  be:["campings-belgica-definitivo.json?v=4","areas-belgica-definitivo.json?v=1"],
  nl:["campings-paises-bajos-definitivo.json?v=1","areas-paises-bajos-definitivo.json?v=1"],
  lu:["campings-luxemburgo-definitivo.json?v=1","areas-luxemburgo-definitivo.json?v=1"],
  ad:["campings-andorra-definitivo.json?v=1","areas-andorra-definitivo.json?v=1"],
  si:["campings-eslovenia-definitivo.json?v=1","areas-eslovenia-definitivo.json?v=1"],
  hr:["campings-croacia-definitivo.json?v=1","areas-croacia-definitivo.json?v=1"],
  me:["campings-montenegro-definitivo.json?v=1","areas-montenegro-definitivo.json?v=1"],
  ba:["campings-bosnia-herzegovina-definitivo.json?v=1","areas-bosnia-herzegovina-definitivo.json?v=1"],
  dk:["campings-dinamarca-definitivo.json?v=1","areas-dinamarca-definitivo.json?v=1"],
  se:["campings-suecia-definitivo.json?v=1","areas-suecia-definitivo.json?v=1"],
  no:["campings-noruega-definitivo.json?v=1","areas-noruega-definitivo.json?v=1"],
  fi:["campings-finlandia-definitivo.json?v=1","areas-finlandia-definitivo.json?v=1"],
  is:["campings-islandia-definitivo.json?v=1","areas-islandia-definitivo.json?v=1"],
  ie:["campings-irlanda-definitivo.json?v=1","areas-irlanda-definitivo.json?v=1"],
  gb:["campings-reino-unido-definitivo.json?v=1","areas-reino-unido-definitivo.json?v=1"],
  pl:["campings-polonia-definitivo.json?v=1","areas-polonia-definitivo.json?v=1"],
  cz:["campings-republica-checa-definitivo.json?v=1","areas-chequia-definitivo.json?v=1"],
  sk:["campings-eslovaquia-definitivo.json?v=1","areas-eslovaquia-definitivo.json?v=1"],
  hu:["campings-hungria-definitivo.json?v=1","areas-hungria-definitivo.json?v=1"],
  ro:["campings-rumania-definitivo.json?v=1","areas-rumania-definitivo.json?v=1"],
  bg:["campings-bulgaria-definitivo.json?v=1","areas-bulgaria-definitivo.json?v=1"],
  rs:["campings-serbia-definitivo.json?v=1","areas-serbia-definitivo.json?v=1"],
  mk:["campings-macedonia-del-norte-definitivo.json?v=1","areas-macedonia-del-norte-definitivo.json?v=1"],
  al:["campings-albania-definitivo.json?v=1","areas-albania-definitivo.json?v=1"],
  gr:["campings-grecia-definitivo.json?v=1","areas-grecia-definitivo.json?v=1"],
  ee:["campings-estonia-definitivo.json?v=1","areas-estonia-definitivo.json?v=1"],
  lv:["campings-letonia-definitivo.json?v=1","areas-letonia-definitivo.json?v=1"],
  lt:["campings-lituania-definitivo.json?v=1","areas-lituania-definitivo.json?v=1"],
  md:["campings-moldavia-definitivo.json?v=1","areas-moldavia-definitivo.json?v=1"],
  ua:["campings-ucrania-definitivo.json?v=1","areas-ucrania-definitivo.json?v=1"],
  cy:["campings-chipre-definitivo.json?v=1","areas-chipre-definitivo.json?v=1"],
  xk:["campings-kosovo-definitivo.json?v=1","areas-kosovo-definitivo.json?v=1"]
};
async function cargarListaPernocta(archivo){
  try{const r=await fetch(archivo); if(!r.ok)return []; const d=await r.json(); return Array.isArray(d)?d:[];}catch{return [];}
}
async function cargarAlojamientosPais(codigo){
  codigo=String(codigo||"").toLowerCase();
  if(cacheAlojamientos.has(codigo))return cacheAlojamientos.get(codigo);
  const archivos=archivosPernocta[codigo]; if(!archivos)return [];
  const prom=Promise.all(archivos.map(cargarListaPernocta)).then(([campings,puntos])=>[
    ...campings.map(x=>({...x,tipo:"camping"})),
    ...puntos.map(x=>({...x,tipo:x.tipo||"area"}))
  ]);
  cacheAlojamientos.set(codigo,prom); return prom;
}
function valorBool(v){return v===true||v===1||v==="true"||v==="yes"||v==="sí"||v==="si";}
function nombreAlojamiento(x){return x.nombre||x.name||"Lugar de pernocta";}
function localidadAlojamiento(x){return x.localidad||x.ciudad||x.municipio||x.provincia||x.region||x.pais||"";}
function urlMapaAlojamiento(x){
  if(x.google_maps)return x.google_maps;
  if(Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lon)))return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${x.lat},${x.lon}`)}`;
  return "";
}
function alojamientoCompatible(x,datos){
  const tipos=new Set(datos.pernocta||[]); if(!tipos.has(x.tipo))return false;
  if(!Number.isFinite(Number(x.lat))||!Number.isFinite(Number(x.lon)))return false;
  if(datos.vehiculo==="caravana" && (x.tipo==="area"||x.tipo==="parking") && !valorBool(x.admite_caravanas))return false;
  if(datos.mascota && x.mascotas===false)return false;
  return true;
}
function puntosAlojamiento(x,datos,distancia){
  let s=Math.max(0,30-distancia/1000);
  if((datos.vehiculo==="autocaravana"||datos.vehiculo==="camper")&&x.tipo==="area")s+=5;
  if(datos.vehiculo==="caravana"&&x.tipo==="camping")s+=6;
  if((datos.vehiculo==="coche"||datos.vehiculo==="moto")&&x.tipo==="camping")s+=4;
  if(datos.mascota&&valorBool(x.mascotas))s+=3;
  if(valorBool(x.electricidad))s+=1; if(valorBool(x.agua))s+=1;
  return s;
}
async function buscarPernoctasEtapa(etapa,datos){
  if(!Array.isArray(etapa.coordRecomendada)||!(datos.pernocta||[]).length)return [];
  let codigo=etapa.codigoPais;
  if(!codigo){const rev=await reverseLugar(etapa.coordRecomendada); codigo=(rev?.country_code||"").toLowerCase(); etapa.codigoPais=codigo;}
  const todos=await cargarAlojamientosPais(codigo); const centro=etapa.coordRecomendada;
  const candidatos=todos.filter(x=>alojamientoCompatible(x,datos)).map(x=>{
    const d=distanciaHaversine(centro,[Number(x.lon),Number(x.lat)]); return {...x,_distancia:d,_score:puntosAlojamiento(x,datos,d)};
  }).filter(x=>x._distancia<=35000).sort((a,b)=>b._score-a._score||a._distancia-b._distancia);
  return candidatos.slice(0,3);
}
async function completarPernoctas(plan,datos){
  await Promise.all(plan.map(async e=>{e.alojamientos=await buscarPernoctasEtapa(e,datos);}));
  return plan;
}
function etiquetaTipoPernocta(tipo){return tipo==="camping"?"🏕️ Camping":tipo==="parking"?"🅿️ Parking":"🚐 Área";}
function detallesPernocta(x){
  const d=[]; if(valorBool(x.mascotas))d.push("🐕 mascotas"); if(valorBool(x.electricidad))d.push("⚡ electricidad"); if(valorBool(x.agua))d.push("💧 agua"); if(valorBool(x.vaciado_aguas))d.push("🚿 vaciado"); return d.join(" · ");
}
function htmlPernoctas(etapa){
  const lista=etapa.alojamientos||[];
  let h='<div class="pernocta-inteligente"><h4>🌙 Dónde dormir cerca de esta parada</h4>';
  if(!lista.length)return h+'<p>No hemos encontrado en nuestra base un Camping, Área o Parking compatible a menos de 35 km de esta parada.</p></div>';
  h+='<div class="pernocta-lista">';
  lista.forEach((x,i)=>{const mapa=urlMapaAlojamiento(x),det=detallesPernocta(x); h+=`<div class="pernocta-card ${i===0?'pernocta-principal':''}"><div><span class="pernocta-tipo">${etiquetaTipoPernocta(x.tipo)}</span>${i===0?'<span class="badge-recomendada">⭐ recomendada</span>':''}</div><strong>${escapar(nombreAlojamiento(x))}</strong><small>${escapar(localidadAlojamiento(x))}${x._distancia?` · a ${(x._distancia/1000).toFixed(1).replace('.',',')} km en línea recta`:' '}</small>${det?`<span class="pernocta-servicios">${escapar(det)}</span>`:''}<div class="pernocta-enlaces">${mapa?`<a href="${escapar(mapa)}" target="_blank" rel="noopener">📍 Ver en mapa</a>`:''}${x.web?`<a href="${escapar(x.web)}" target="_blank" rel="noopener">🌐 Web</a>`:''}</div></div>`;});
  return h+'</div><p class="nota-distancia">La distancia indicada es aproximada en línea recta. Más adelante calcularemos también el desvío real por carretera hasta la pernocta elegida.</p></div>';
}

// ---------- Gastronomía: restaurantes reales cuando el usuario la marca ----------
async function buscarRestaurantesEtapa(etapa,datos){
  if(!(datos.intereses||[]).includes("gastronomia")||!Array.isArray(etapa.coordRecomendada))return [];
  const coord=etapa.coordRecomendada;
  try{
    const params=new URLSearchParams({
      categories:"catering.restaurant",
      filter:`circle:${coord[0]},${coord[1]},10000`,
      bias:`proximity:${coord[0]},${coord[1]}`,
      limit:"18",lang:"es",apiKey:config.GEOAPIFY_API_KEY
    });
    const r=await fetch(`https://api.geoapify.com/v2/places?${params}`);
    if(!r.ok)return [];
    const d=await r.json();
    return (d.features||[]).filter(f=>f.properties?.name).slice(0,12).map(f=>{
      const p=f.properties||{}, c=f.geometry?.coordinates||[];
      const cuisine=p.datasource?.raw?.cuisine||p.cuisine||"";
      const web=p.website||p.contact?.website||p.datasource?.raw?.website||"";
      return {
        nombre:p.name,
        localidad:nombreLocalidad(p),
        distancia:Number(p.distance)||0,
        cuisine:String(cuisine||"").replace(/;/g,", "),
        lat:Number(c[1]),lon:Number(c[0]),web
      };
    });
  }catch{return [];}
}
async function completarGastronomia(plan,datos){
  if(!(datos.intereses||[]).includes("gastronomia"))return plan;
  const usados=new Set();
  for(const e of plan){
    const candidatos=await buscarRestaurantesEtapa(e,datos);
    let elegidos=candidatos.filter(x=>!usados.has(normalizarClaveMedia(x.nombre))).slice(0,3);
    if(elegidos.length<3)elegidos=[...elegidos,...candidatos.filter(x=>!elegidos.includes(x)).slice(0,3-elegidos.length)];
    e.restaurantes=elegidos;
    elegidos.forEach(x=>usados.add(normalizarClaveMedia(x.nombre)));
  }
  return plan;
}
function htmlGastronomia(etapa,esDestino=false){
  const lista=etapa.restaurantes||[];
  let h=`<div class="parada-inteligente gastronomia-ruta"><h4>🍽️ ${esDestino?"Dónde comer en el destino":"Dónde comer cerca de esta parada"}</h4>`;
  if(!lista.length)return h+'<p>No hemos encontrado restaurantes con nombre en un radio de 10 km.</p></div>';
  h+='<div class="poi-lista">';
  lista.forEach((x,i)=>{
    const mapa=Number.isFinite(x.lat)&&Number.isFinite(x.lon)?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${x.lat},${x.lon}`)}`:"";
    h+=`<div class="poi-card"><strong>${escapar(x.nombre)}</strong><small>${escapar(x.localidad)}${x.distancia?` · a ${(x.distancia/1000).toFixed(1).replace('.',',')} km`:""}</small>${x.cuisine?`<span class="poi-etiqueta">🍴 ${escapar(x.cuisine)}</span>`:'<span class="poi-etiqueta">🍽️ Restaurante</span>'}<div class="pernocta-enlaces">${mapa?`<a href="${escapar(mapa)}" target="_blank" rel="noopener">📍 Ver en mapa</a>`:""}${x.web?`<a href="${escapar(x.web)}" target="_blank" rel="noopener">🌐 Web</a>`:""}</div></div>`;
  });
  return h+'</div></div>';
}

function urlMapaPOI(x){
  if(Number.isFinite(x.lat)&&Number.isFinite(x.lon))return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${x.lat},${x.lon}`)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${x.nombre||""} ${x.localidad||""}`)}`;
}
function textoEditorialVisita(x){
  if(x.descripcion)return escapar(x.descripcion);
  const tipo=(x.etiqueta||"visita").replace(/^[^ ]+\s*/,"").toLowerCase();
  return `Esta es una de las visitas seleccionadas para esta jornada por su interés como ${escapar(tipo)} y por encajar con las preferencias indicadas para el viaje. Consulta los enlaces de la ficha para ampliar la información práctica antes de la visita.`;
}
function htmlEnlacesEditorial(mapa,web,info){
  return `<div class="guia-enlaces"><a href="${escapar(mapa)}" target="_blank" rel="noopener">📍 Cómo llegar</a>${web?`<a href="${escapar(web)}" target="_blank" rel="noopener">🌐 Web oficial</a>`:""}${info?`<a href="${escapar(info)}" target="_blank" rel="noopener">ℹ️ Más información</a>`:""}</div>`;
}
function htmlVisitaEditorial(x){
  const mapa=urlMapaPOI(x), info=x.wikiUrl||x.commonsUrl||"";
  const foto=x.imagen?`<figure class="guia-foto"><img src="${escapar(x.imagen)}" alt="${escapar(x.nombre)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>${escapar(x.nombre)}${x.localidad?` · ${escapar(x.localidad)}`:""}</figcaption></figure>`:"";
  return `<article class="guia-visita-editorial"><h3>${escapar(x.nombre)}</h3>${foto}<div class="guia-texto"><p>${textoEditorialVisita(x)}</p><p><strong>Tiempo recomendado:</strong> ${escapar(x.tiempoVisita||tiempoVisitaPOI(x))}${x.horarios?` · <strong>Horario:</strong> ${escapar(x.horarios)}`:""}</p>${x.direccion?`<p><strong>Dirección:</strong> ${escapar(x.direccion)}</p>`:""}${htmlEnlacesEditorial(mapa,x.web,info)}</div></article>`;
}
function htmlAlternativasEditorial(pois=[]){
  if(pois.length<2)return "";
  return `<div class="guia-alternativas"><h4>Otras visitas que pueden encajar</h4>${pois.slice(1,4).map(x=>`<p><strong>${escapar(x.nombre)}</strong>${x.localidad?` — ${escapar(x.localidad)}`:""} · <a href="${escapar(urlMapaPOI(x))}" target="_blank" rel="noopener">ver ubicación</a></p>`).join("")}</div>`;
}
function htmlComerEditorial(etapa,esDestino=false){
  const lista=etapa.restaurantes||[];
  if(!lista.length)return "";
  return `<section class="guia-seccion-editorial"><h3>🍽️ Dónde comer${esDestino?' en el destino':''}</h3><p class="guia-intro">Estas son algunas opciones próximas a la jornada. La primera queda como propuesta principal y las demás como alternativas.</p>${lista.map((x,i)=>{const mapa=Number.isFinite(x.lat)&&Number.isFinite(x.lon)?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${x.lat},${x.lon}`)}`:"";return `<div class="guia-recomendacion"><h4>${i===0?'Nuestra recomendación: ':''}${escapar(x.nombre)}</h4><p>${x.cuisine?`Cocina: <strong>${escapar(x.cuisine)}</strong>. `:""}${escapar(x.localidad||"")}${x.distancia?` · aproximadamente ${(x.distancia/1000).toFixed(1).replace('.',',')} km`:""}.</p>${htmlEnlacesEditorial(mapa,x.web,"")}</div>`}).join("")}</section>`;
}
function htmlDormirEditorial(etapa,esDestino=false){
  const lista=etapa.alojamientos||[];
  if(!lista.length)return `<section class="guia-seccion-editorial"><h3>🌙 Dónde dormir${esDestino?' en el destino':''}</h3><p>No hemos encontrado una opción compatible en nuestra base a menos de 35 km.</p></section>`;
  return `<section class="guia-seccion-editorial"><h3>🌙 Dónde dormir${esDestino?' en el destino':''}</h3>${lista.map((x,i)=>{const mapa=urlMapaAlojamiento(x),det=detallesPernocta(x);return `<div class="guia-recomendacion ${i===0?'principal':''}"><h4>${i===0?'⭐ Recomendado · ':''}${escapar(nombreAlojamiento(x))}</h4><p>${escapar(localidadAlojamiento(x))}${x._distancia?` · ${(x._distancia/1000).toFixed(1).replace('.',',')} km en línea recta`:''}.</p>${det?`<p><strong>Servicios:</strong> ${escapar(det)}</p>`:""}${htmlEnlacesEditorial(mapa,x.web,"")}</div>`}).join("")}</section>`;
}
function htmlPlanJornadas(plan,datos,rutaOptimizada=null,lugaresOpt=[]){
  if(!plan.length)return "";
  let h='<div class="guia-pdf"><header class="guia-portada"><span>GUÍA PERSONALIZADA DE VIAJE</span><h2>Tu ruta, día a día</h2><p>Una propuesta organizada con desplazamientos, visitas, gastronomía y pernocta.</p></header>';
  plan.forEach((e,idx)=>{
    const esUltima=idx===plan.length-1;
    const sinConduccion=(Number(e.distancia)||0)<100 && (Number(e.tiempo)||0)<60;
    h+=`<section class="guia-dia-editorial"><div class="guia-dia-titulo"><span>DÍA ${e.dia}</span><h2>${e.estanciaDestino?`Día completo en ${escapar(e.hasta)}`:`${escapar(e.desde)} → ${escapar(e.hasta)}`}</h2><p>${sinConduccion?'📍 Jornada en destino':`🚐 ${formatoKm(e.distancia)} · ${formatoTiempo(e.tiempo)}`}</p></div>`;
    if(e.estanciaDestino){
      h+=`<div class="guia-narrativa"><p><strong>Plan del día.</strong> Jornada completa para disfrutar de ${escapar(e.hasta)} sin conducción de larga distancia. Hemos repartido visitas distintas para aprovechar el viaje sin repetir las jornadas anteriores.</p></div>`;
    }else{
      h+=`<div class="guia-narrativa"><p><strong>Plan del día.</strong> Tras el desplazamiento previsto, dedicamos el resto de la jornada a conocer ${escapar(e.pois?.[0]?.localidad||e.hasta)}. La cantidad de visitas se ajusta al tiempo de conducción y al ritmo elegido.</p></div>`;
    }
    if(e.pois?.length){
      h+='<section class="guia-seccion-editorial"><h3>📍 Visitas recomendadas</h3>';
      e.pois.forEach(x=>{h+=htmlVisitaEditorial(x);});
      h+='</section>';
    }else{
      h+='<section class="guia-seccion-editorial"><h3>📍 Qué visitar</h3><p>No hemos encontrado suficientes visitas sólidas para completar esta jornada sin repetir lugares.</p></section>';
    }
    if((datos.intereses||[]).includes("gastronomia"))h+=htmlComerEditorial(e,true);
    h+=htmlDormirEditorial(e,true);
    h+='</section>';
  });
  return h+'</div>';
}

// ---------- Rutas genéricas: fotografías// ---------- Rutas genéricas: fotografías verificadas sin coste OpenAI ----------
async function prepararFotosPlanGenerico(plan=[]){
  if(!Array.isArray(plan)||!plan.length)return plan;
  const tareas=[];
  for(const etapa of plan){
    for(const poi of (etapa?.pois||[])){
      if(!poi?.nombre)continue;
      tareas.push((async()=>{
        try{
          const verificado=buscarLugarVerificado(poi.nombre,"visit");
          if(verificado?.image_url){
            poi.imagen=verificado.image_url;
            poi.commonsUrl=verificado.image_source_url||poi.commonsUrl||"";
            return;
          }
          const auto=await buscarFotoAutomatica(poi.nombre,poi.localidad||etapa.hasta||"","visit");
          if(auto?.image_url){
            poi.imagen=auto.image_url;
            poi.commonsUrl=auto.source_url||auto.description_url||poi.commonsUrl||"";
          }else poi.imagen="";
        }catch(err){console.warn("No se pudo seleccionar foto genérica",poi.nombre,err);}
      })());
    }
  }
  await Promise.all(tareas);
  return plan;
}

function stopsDesdePlanGenerico(plan=[]){
  const etapas=(Array.isArray(plan)?plan:[]).filter(e=>(Number(e?.distancia)||0)>1000 || (Number(e?.tiempo)||0)>300);
  const out=[]; const vistos=new Set();
  for(const e of etapas){
    const place=String(e?.hasta||"").trim(); if(!place)continue;
    const clave=normalizarClaveMedia(place); if(vistos.has(clave))continue;
    vistos.add(clave);
    out.push({day:Number(e?.dia)||out.length+1,place,country:"",driving_km:Math.round((Number(e?.distancia)||0)/1000),driving_minutes:Math.round((Number(e?.tiempo)||0)/60),is_final:false});
  }
  if(out.length)out[out.length-1].is_final=true;
  return out;
}

async function crearGuiaUnaJornada(feature,lugares,datos){
  const p=feature?.properties||{};
  const destino=lugares.at(-1);
  const etapa={
    dia:1,
    desde:lugares[0]?.formatted||datos.origen,
    hasta:destino?.formatted||datos.destinoPrincipal,
    distancia:Number(p.distance)||0,
    tiempo:Number(p.time)||0,
    intermedia:false,
    esDestino:true,
    pois:[],
    poiPrincipal:null,
    coordRecomendada:(destino?.lon!=null&&destino?.lat!=null)?[Number(destino.lon),Number(destino.lat)]:null,
    codigoPais:String(destino?.country_code||"").toLowerCase(),
    alojamientos:[],
    restaurantes:[]
  };
  const plan=[etapa];
  await completarVisitasDestino(plan,datos);
  await Promise.all([completarPernoctas(plan,datos),completarGastronomia(plan,datos)]);
  await completarFichasEnriquecidas(plan);
  await prepararFotosPlanGenerico(plan);
  return plan;
}

function recogerDatos(){
  const destinoPrincipal=document.getElementById("destinoPrincipal").value.trim();
  const destinosExtra=[...document.querySelectorAll(".destinoAdicional")].map(i=>i.value.trim()).filter(Boolean);
  return {
    modo:document.querySelector('input[name="modoRuta"]:checked')?.value||"destino", origen:document.getElementById("origen").value.trim(), destinoPrincipal,destinosExtra,
    fechaSalida:document.getElementById("fechaSalida").value,dias:document.getElementById("diasViaje").value,adultos:document.getElementById("adultos").value,ninos:document.getElementById("ninos").value,
    edades:[...document.querySelectorAll(".edadNino")].map(i=>i.value).filter(Boolean),mascota:document.getElementById("mascota").checked,recomendacionesNinos:document.getElementById("recomendacionesNinos").checked,
    vehiculo:document.querySelector('input[name="vehiculo"]:checked')?.value,maxConduccion:document.getElementById("maxConduccion").value,ritmo:document.getElementById("ritmo").value,
    intereses:valoresMarcados(".intereses input[type=checkbox]"),pernocta:valoresMarcados('input[name="pernocta"]'),evitar:valoresMarcados('input[name="evitar"]'),presupuesto:document.getElementById("presupuesto").value,contenidoVisual:document.getElementById("contenidoVisual").value,notas:document.getElementById("notasRuta").value.trim()
  };
}





// ---------- Fase 22: resumen bajo mapa + navegación Google Maps + PDF ----------
function nombreMapsLugar(x,alternativa=""){
  return String(x?.formatted||x?.name||x?.place||alternativa||"").trim();
}

function urlGoogleMapsRuta(lugares=[],stops=[],datos={}){
  const origen=nombreMapsLugar(lugares[0],datos.origen);
  const destino=nombreMapsLugar(lugares.at(-1),datos.destinoPrincipal);
  if(!origen||!destino)return "";
  const intermedios=(Array.isArray(stops)?stops:[])
    .filter(x=>!x?.is_final)
    .map(x=>String(x?.place||"").trim())
    .filter(Boolean);
  const q=new URLSearchParams({api:"1",origin:origen,destination:destino,travelmode:"driving"});
  if(intermedios.length)q.set("waypoints",intermedios.join("|"));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

function colocarResumenDebajoMapa(){
  const mapaEl=document.getElementById("mapaRuta");
  const metricas=document.getElementById("metricasRuta");
  if(!mapaEl||!metricas)return;
  // Se conserva el mismo bloque de métricas; solo se fija su posición justo después del mapa.
  mapaEl.insertAdjacentElement("afterend",metricas);
  metricas.classList.remove("oculto");
}

function instalarAccionesRuta(lugares=[],stops=[],datos={}){
  document.getElementById("accionesRutaF22")?.remove();
  const metricas=document.getElementById("metricasRuta");
  if(!metricas)return;
  const maps=urlGoogleMapsRuta(lugares,stops,datos);
  const bloque=document.createElement("div");
  bloque.id="accionesRutaF22";
  bloque.style.cssText="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:18px 0 28px";
  bloque.innerHTML=`${maps?`<a href="${escapar(maps)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;border-radius:999px;background:#087d91;color:#fff;text-decoration:none;font-weight:900;box-shadow:0 7px 18px rgba(8,125,145,.18)">🧭 Navegar esta ruta con Google Maps</a>`:""}`;
  metricas.insertAdjacentElement("afterend",bloque);
}

function instalarBotonPDF(){
  document.getElementById("descargarGuiaPdfF22")?.remove();
  const etapas=document.getElementById("etapasRuta");
  if(!etapas)return;
  const cont=document.createElement("div");
  cont.id="descargarGuiaPdfF22";
  cont.style.cssText="text-align:center;margin:34px 0 10px";
  cont.innerHTML='<button type="button" style="border:0;border-radius:999px;padding:14px 24px;background:#063b59;color:#fff;font-weight:900;font-size:16px;cursor:pointer;box-shadow:0 7px 18px rgba(6,59,89,.18)">📄 Descargar guía en PDF</button><div style="font-size:12px;color:#667b88;margin-top:8px">Se abrirá la opción de impresión del navegador para guardarla como PDF.</div>';
  etapas.insertAdjacentElement("afterend",cont);
  cont.querySelector("button").addEventListener("click",()=>window.print());
}

// ---------- Fase 21: ruta de ejemplo permanente ----------
function seleccionarValor(selector,valor){
  const el=[...document.querySelectorAll(selector)].find(x=>x.value===valor);
  if(el){el.checked=true;el.dispatchEvent(new Event("change",{bubbles:true}));}
}

function prepararRutaEjemplo(){
  document.querySelectorAll(".destino-extra").forEach(x=>x.remove());
  const origen=document.getElementById("origen");
  const destino=document.getElementById("destinoPrincipal");
  origen.value="Saarlouis";
  destino.value="Zagreb";
  lugaresSeleccionados.delete(origen);
  lugaresSeleccionados.delete(destino);

  seleccionarValor('input[name="modoRuta"]',"destino");
  seleccionarValor('input[name="vehiculo"]',"autocaravana");

  const setValor=(id,v)=>{const e=document.getElementById(id);if(e)e.value=String(v);};
  setValor("diasViaje",3);
  setValor("adultos",2);
  setValor("ninos",0);
  ninos.dispatchEvent(new Event("input",{bubbles:true}));
  setValor("maxConduccion",4);
  setValor("ritmo","equilibrado");

  const mascota=document.getElementById("mascota"); if(mascota)mascota.checked=false;
  const recNinos=document.getElementById("recomendacionesNinos"); if(recNinos)recNinos.checked=false;

  document.querySelectorAll('.intereses input[type="checkbox"]').forEach(x=>x.checked=false);
  ["ciudades","gastronomia"].forEach(v=>{
    const x=[...document.querySelectorAll('.intereses input[type="checkbox"]')].find(e=>e.value===v);
    if(x)x.checked=true;
  });

  // La preferencia de pernocta de autocaravana se normaliza en el Worker como
  // campings, áreas o parkings adecuados para autocaravana.
  document.querySelectorAll('input[name="pernocta"]').forEach(x=>x.checked=true);
  document.querySelectorAll('input[name="evitar"]').forEach(x=>x.checked=false);

  mostrarPaso(4);
}

function instalarRutaEjemplo(){
  if(document.getElementById("rutaDemoCampingsAreas"))return;
  const panel=document.querySelector(".rutas-panel");
  if(!panel||!formRuta)return;
  const demo=document.createElement("section");
  demo.id="rutaDemoCampingsAreas";
  demo.style.cssText="margin:0 0 22px;padding:22px;border:1px solid #c9deeb;border-radius:20px;background:linear-gradient(135deg,#f7fcff,#edf8f5);box-shadow:0 8px 24px rgba(4,53,78,.08);text-align:center";
  demo.innerHTML=`
    <div style="font-size:12px;font-weight:900;letter-spacing:.14em;color:#087d91;margin-bottom:7px">RUTA DE EJEMPLO</div>
    <h2 style="margin:0 0 8px;color:#063b59;font-size:clamp(24px,4vw,36px)">Saarlouis → Zagreb</h2>
    <p style="margin:0 auto 16px;max-width:720px;color:#4a6170;line-height:1.55">Descubre cómo será una guía de Rutas con Campings & Áreas IA completa: recorrido, mapa, etapas, visitas, gastronomía, lugares para pernoctar y fotografías.</p>
    <button type="button" id="verRutaDemo" style="border:0;border-radius:999px;padding:13px 24px;background:#087d91;color:white;font-weight:900;font-size:16px;cursor:pointer;box-shadow:0 7px 18px rgba(8,125,145,.22)">▶ Ver ruta de ejemplo</button>`;
  formRuta.parentNode.insertBefore(demo,formRuta);
  document.getElementById("verRutaDemo").addEventListener("click",()=>{
    const b=document.getElementById("verRutaDemo");
    b.disabled=true;b.textContent="Preparando ruta de ejemplo…";
    ejecutarRutaComoDemo=true;
    prepararRutaEjemplo();
    formRuta.requestSubmit();
    setTimeout(()=>{b.disabled=false;b.textContent="▶ Ver ruta de ejemplo";},1200);
  });
}

formRuta.addEventListener("submit",async event=>{
  event.preventDefault(); if(!validarPasoActual())return;
  const esDemo=ejecutarRutaComoDemo;
  ejecutarRutaComoDemo=false;
  const datos=recogerDatos(); localStorage.setItem("campingsAreasRutaBorrador",JSON.stringify(datos));
  const resumen=document.getElementById("resumenRuta"); const resultado=document.getElementById("resultadoReal");
  resumen.classList.add("oculto"); resultado.classList.remove("oculto"); resultado.classList.add("cargando-ruta");
  document.getElementById("estadoCalculo").textContent="Localizando origen y destinos…";
  document.getElementById("metricasRuta").innerHTML=""; document.getElementById("etapasRuta").innerHTML="";
  document.getElementById("accionesRutaF22")?.remove();
  document.getElementById("descargarGuiaPdfF22")?.remove();
  document.querySelectorAll(".portada-ruta-fija").forEach(x=>x.remove());
  resultado.scrollIntoView({behavior:"smooth",block:"start"});
  try{
    if(!config.GEOAPIFY_API_KEY)throw new Error("Falta configurar la API Key de Geoapify.");
    if(datos.modo==="propuesta"){
      document.getElementById("estadoCalculo").textContent="Modo todavía no disponible";
      document.getElementById("etapasRuta").innerHTML='<div class="aviso-ruta"><strong>✨ Organízame las vacaciones:</strong> este modo se activará cuando el flujo de investigación y planificación esté preparado para proponer destinos sin inventarlos.</div>';
      return;
    }

    const inputs=[document.getElementById("origen"),document.getElementById("destinoPrincipal"),...document.querySelectorAll(".destinoAdicional")].filter(i=>i.value.trim());
    const lugares=[];
    for(const input of inputs){
      document.getElementById("estadoCalculo").textContent=`Localizando ${input.value.trim()}…`;
      lugares.push(await resolverLugar(input));
    }

    document.getElementById("estadoCalculo").textContent="Calculando carretera, kilómetros y tiempo…";
    const ruta=await calcularRuta(lugares,datos);

    // La demo es inmutable y siempre usa el plan + guía ya guardados en D1.
    if(esDemo){
      pintarResultadoBase(ruta,lugares,datos);
      colocarResumenDebajoMapa();
      document.getElementById("estadoCalculo").textContent="Cargando fotografías verificadas…";
      await Promise.all([cargarMediaVerificado(),cargarLugaresVerificados()]);
      const stops=await crearEtapasWorker(ruta.features[0],lugares,datos,true);
      document.getElementById("estadoCalculo").textContent="Cargando la ruta de ejemplo guardada…";
      const respuestaPlan=await consultarPlanificadorIA(datos,lugares,stops);
      if(!(respuestaPlan?.ok&&respuestaPlan?.status==="planned"&&respuestaPlan?.plan))throw new Error("La ruta de ejemplo guardada no está disponible.");
      const respuestaGuia=await consultarRedactorIA(datos,lugares,stops,respuestaPlan.plan);
      if(!(respuestaGuia?.ok&&respuestaGuia?.status==="written"&&respuestaGuia?.guide))throw new Error("La guía de ejemplo guardada no está disponible.");
      document.getElementById("estadoCalculo").textContent="Seleccionando las mejores fotografías…";
      await prepararFotosGuia(respuestaGuia.guide);
      document.getElementById("estadoCalculo").textContent="Guía preparada";
      montarPortadaAntesMapa(datos);
      colocarResumenDebajoMapa();
      instalarAccionesRuta(lugares,stops,datos);
      document.getElementById("etapasRuta").innerHTML=htmlGuiaIA(respuestaGuia.guide,datos);
      instalarBotonPDF();
      return;
    }

    // RUTAS NUEVAS: primero consultamos D1. Si esa ruta ya existe, reutilizamos
    // su plan y su guía sin investigar de nuevo y sin generar ningún coste.
    let stopsCache=[];
    try{
      document.getElementById("estadoCalculo").textContent="Comprobando si esta ruta ya está guardada…";
      stopsCache=await crearEtapasWorker(ruta.features[0],lugares,datos,false);
      const planCache=await consultarPlanificadorIA(datos,lugares,stopsCache);
      if(planCache?.ok&&planCache?.status==="planned"&&planCache?.plan){
        const guiaCache=await consultarRedactorIA(datos,lugares,stopsCache,planCache.plan);
        if(guiaCache?.ok&&guiaCache?.status==="written"&&guiaCache?.guide){
          await Promise.all([cargarMediaVerificado(),cargarLugaresVerificados()]);
          document.getElementById("estadoCalculo").textContent="Seleccionando las mejores fotografías…";
          await prepararFotosGuia(guiaCache.guide);
          pintarResultadoBase(ruta,lugares,datos);
          montarPortadaAntesMapa(datos);
          colocarResumenDebajoMapa();
          instalarAccionesRuta(lugares,stopsCache,datos);
          document.getElementById("etapasRuta").innerHTML=htmlGuiaIA(guiaCache.guide,datos);
          instalarBotonPDF();
          document.getElementById("estadoCalculo").textContent="Guía preparada";
          return;
        }
      }
    }catch(errCache){
      console.info("Ruta no disponible en D1; se prepara sin coste OpenAI.",errCache);
    }

    // Si D1 no tiene la ruta, durante el desarrollo usamos el flujo genérico de coste cero.
    // Geoapify calcula carretera, POIs y restaurantes; nuestra base aporta pernoctas;
    // Wikimedia Commons aporta fotografías con licencia comprobada.
    document.getElementById("estadoCalculo").textContent="Preparando jornadas, visitas, gastronomía y pernocta…";
    await Promise.all([cargarMediaVerificado(),cargarLugaresVerificados()]);
    const generica=await pintarResultado(ruta,lugares,datos);
    const planGenerico=generica?.plan||[];
    const stopsGenericos=stopsDesdePlanGenerico(planGenerico);

    // Una ruta corta de una sola jornada también recibe guía completa del destino.
    if(!planGenerico.length){
      document.getElementById("estadoCalculo").textContent="Preparando la guía del destino…";
      const planUnaJornada=await crearGuiaUnaJornada(ruta.features[0],lugares,datos);
      document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",htmlPlanJornadas(planUnaJornada,datos));
      const stopsUnaJornada=stopsDesdePlanGenerico(planUnaJornada);
      document.getElementById("estadoCalculo").textContent="Guía preparada";
      montarPortadaAntesMapa(datos);
      colocarResumenDebajoMapa();
      instalarAccionesRuta(lugares,stopsUnaJornada.length?stopsUnaJornada:stopsCache,datos);
      instalarBotonPDF();
      return;
    }

    document.getElementById("estadoCalculo").textContent="Guía preparada";
    montarPortadaAntesMapa(datos);
    colocarResumenDebajoMapa();
    instalarAccionesRuta(lugares,stopsGenericos,datos);
    instalarBotonPDF();
  }catch(e){
    console.error("Rutas Campings & Áreas",e);
    document.getElementById("estadoCalculo").textContent="No se pudo crear la ruta";
    document.getElementById("etapasRuta").innerHTML=`<div class="error-ruta"><strong>⚠️ ${escapar(e.message)}</strong><br>No se ha generado una guía automática de sustitución.</div>`;
  }finally{
    resultado.classList.remove("cargando-ruta");
  }
});

document.getElementById("volverEditar").addEventListener("click",()=>{ document.querySelector(".rutas-panel").scrollIntoView({behavior:"smooth"}); mostrarPaso(1); });
instalarRutaEjemplo();
mostrarPaso(1);
