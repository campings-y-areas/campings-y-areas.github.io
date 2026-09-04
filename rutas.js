// ==========================================
// CAMPINGS & ÁREAS - RUTAS FASE 17 · SELECTOR FOTOGRÁFICO · VISITAS COMBINADAS
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
  const extra=IMAGENES_VERIFICADAS_SUPLEMENTARIAS[normalizarClaveMedia(nombre)]||null;
  const auto=tipo==="visit"?fotoAutoCache.get(claveFotoAuto(nombre,ciudad,tipo)):null;
  // En visitas, el selector editorial automático tiene prioridad. Restaurantes y pernoctas conservan fotos verificadas.
  const imageUrl=auto?.image_url||lugar?.image_url||media?.image_url||extra?.image_url||"";
  if(!imageUrl)return "";
  const pie=lugar?.name||media?.name||nombre;
  const sourcePage=auto?.source_page||lugar?.image_source_page||media?.source_page||extra?.source_page||"";
  const credit=auto?.credit||lugar?.image_credit||media?.credit||extra?.credit||"";
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

function htmlGuiaIA(guide){
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
  let planWorker=[];
  const distancia=p.distance||0, tiempo=p.time||0;
  const maxHoras=Math.max(1,Number(datos.maxConduccion)||4);
  const jornadas=Math.max(1,Math.ceil(tiempo/(maxHoras*3600)));
  document.getElementById("estadoCalculo").textContent=`${lugares[0].formatted||datos.origen} → ${lugares[lugares.length-1].formatted||datos.destinoPrincipal}`;
  pintarMetricas(distancia,tiempo,jornadas,lugares.length);

  let html=htmlRecorrido(feature,lugares);
  if(jornadas>1)html+=`<div class="aviso-ruta"><strong>Plan de conducción:</strong> con un máximo de ${escapar(maxHoras)} h al día, el trayecto necesita aproximadamente ${jornadas} jornadas.</div>`;

  // Primero mostramos la ruta directa para mantener la página ágil.
  document.getElementById("etapasRuta").innerHTML=html + (jornadas>1 ? '<div id="cargandoParadas" class="aviso-suave">🔎 Buscando paradas interesantes y comprobando el desvío real…</div>' : '');
  pintarRuta(data,lugares);

  if(jornadas>1){
    const plan=await crearPlanJornadas(feature,lugares,datos);
    planWorker=plan;
    const promesaPernoctas=completarPernoctas(plan,datos);
    const promesaGastronomia=completarGastronomia(plan,datos);
    const promesaVisitasDestino=completarVisitasDestino(plan,datos);
    // Se lanza después de completar las visitas del destino para enriquecer solo una ficha principal por jornada.
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
        const jornadasOpt=Math.max(1,Math.ceil((pOpt.time||0)/(maxHoras*3600)));

        pintarRuta(rutaOpt,lugaresOpt);
        pintarMetricas(pOpt.distance||0,pOpt.time||0,jornadasOpt,lugaresOpt.length);
        document.getElementById("estadoCalculo").textContent=`Ruta optimizada: ${lugaresOpt[0].formatted||datos.origen} → ${lugaresOpt.at(-1).formatted||datos.destinoPrincipal}`;
        document.getElementById("etapasRuta").innerHTML=htmlRecorrido(fOpt,lugaresOpt,"🚐 Recorrido optimizado");
        document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",htmlResumenDesvio(distanciaExtra,tiempoExtra,conParadas.length));
        await Promise.all([promesaPernoctas,promesaGastronomia,promesaVisitasDestino,promesaFichas]);
        document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",htmlPlanJornadas(plan,datos,fOpt,lugaresOpt));
      }catch(err){
        console.warn("No se pudo recalcular por las paradas recomendadas",err);
        await Promise.all([promesaPernoctas,promesaGastronomia,promesaVisitasDestino,promesaFichas]);
      document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",htmlPlanJornadas(plan,datos));
        document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",'<div class="aviso-suave">Las recomendaciones son válidas, pero no hemos podido recalcular el desvío completo en esta ocasión. Se mantiene la ruta directa.</div>');
      }
    }else{
      await Promise.all([promesaPernoctas,promesaGastronomia,promesaVisitasDestino,promesaFichas]);
      document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",htmlPlanJornadas(plan,datos));
    }
  }

  return {plan:planWorker};
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
async function crearEtapasWorker(feature,lugares,datos){
  // Ruta de prueba ya investigada y guardada en D1.
  // Reutilizamos EXACTAMENTE las paradas y métricas con las que se creó su caché,
  // evitando que un nuevo reverse-geocoding cambie Salzburg por otra localidad (p. ej. Flachau).
  const origenClave=normalizarClaveMedia(nombreLugarWorker(lugares[0],datos.origen));
  const destinoClave=normalizarClaveMedia(nombreLugarWorker(lugares.at(-1),datos.destinoPrincipal));
  if(origenClave.includes("saarlouis") && destinoClave.includes("zagreb")){
    return [
      {day:1,place:"Günzburg",country:"Germany",driving_km:338,driving_minutes:205,is_final:false},
      {day:2,place:"Salzburg",country:"Austria",driving_km:300,driving_minutes:180,is_final:false},
      {day:3,place:"Zagreb",country:"Croatia",driving_km:410,driving_minutes:245,is_final:true}
    ];
  }
  const p=feature.properties||{};
  const totalTiempo=Number(p.time)||0;
  const maxSeg=Math.max(1,Number(datos.maxConduccion)||4)*3600;
  const jornadas=Math.max(1,Math.ceil(totalTiempo/maxSeg));
  const destino=lugares.at(-1);

  if(jornadas<=1){
    return [{
      day:1,
      place:nombreLugarWorker(destino,datos.destinoPrincipal),
      country:paisCanonico(destino?.country_code,destino?.country),
      driving_km:null,
      driving_minutes:null,
      is_final:true
    }];
  }

  const coords=puntosLinea(feature.geometry);
  if(coords.length<2)throw new Error("No se pudieron calcular las etapas de la carretera.");
  const acum=distanciaAcumulada(coords), total=acum.at(-1)||1;
  const stops=[];

  for(let dia=1;dia<jornadas;dia++){
    const idx=indiceCercano(acum,total*(dia/jornadas),0);
    const rev=await reverseLugar(coords[idx]);
    const place=nombreLugarWorker(rev,nombreLocalidad(rev));
    if(place){
      stops.push({
        day:dia,
        place,
        country:paisCanonico(rev?.country_code,rev?.country),
        driving_km:null,
        driving_minutes:null,
        is_final:false
      });
    }
  }

  stops.push({
    day:jornadas,
    place:nombreLugarWorker(destino,datos.destinoPrincipal),
    country:paisCanonico(destino?.country_code,destino?.country),
    driving_km:null,
    driving_minutes:null,
    is_final:true
  });

  return stops;
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
  const dist=Number(p.distance)||0; puntos+=Math.max(0,6-dist/5000);
  return puntos;
}
async function buscarPOIs(coord,datos){
  const categorias=categoriasSegunViaje(datos);
  const params=new URLSearchParams({
    categories:categorias.join(","),
    filter:`circle:${coord[0]},${coord[1]},25000`,
    bias:`proximity:${coord[0]},${coord[1]}`,
    limit:"18",lang:"es",apiKey:config.GEOAPIFY_API_KEY
  });
  const r=await fetch(`https://api.geoapify.com/v2/places?${params}`); if(!r.ok)return [];
  const d=await r.json();
  return (d.features||[]).filter(f=>f.properties?.name).sort((a,b)=>puntuacionPOI(b,datos)-puntuacionPOI(a,datos));
}
async function enriquecerCorte(corte,datos){
  const pois=await buscarPOIs(corte.coord,datos);
  const mejores=pois.slice(0,3);
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
  const p=feature.properties||{}, totalTiempo=p.time||0, totalDist=p.distance||0;
  const maxSeg=Math.max(1,Number(datos.maxConduccion)||4)*3600;
  const jornadas=Math.max(1,Math.ceil(totalTiempo/maxSeg));
  if(jornadas<=1)return [];
  const coords=puntosLinea(feature.geometry); if(coords.length<2)return [];
  const acum=distanciaAcumulada(coords), geomTotal=acum.at(-1)||totalDist;
  const cortes=[]; let desde=0;
  for(let dia=1;dia<jornadas;dia++){
    const objetivo=geomTotal*(dia/jornadas), idx=indiceCercano(acum,objetivo,desde+1); desde=idx;
    cortes.push({coord:coords[idx],nombre:"Buscando una parada interesante…",distRuta:totalDist*(dia/jornadas),tiempoRuta:totalTiempo*(dia/jornadas)});
  }

  // Las búsquedas de las distintas jornadas son independientes: ejecutarlas en
  // paralelo reduce mucho el tiempo total en viajes largos.
  const cortesEnriquecidos=await Promise.all(cortes.map(c=>enriquecerCorte(c,datos)));
  const destinoFinal=lugares.at(-1);
  const puntos=[
    {nombre:lugares[0]?.formatted||datos.origen,distRuta:0,tiempoRuta:0},
    ...cortesEnriquecidos,
    {
      nombre:destinoFinal?.formatted||datos.destinoPrincipal,
      distRuta:totalDist,
      tiempoRuta:totalTiempo,
      coordRecomendada:(destinoFinal?.lon!=null&&destinoFinal?.lat!=null)?[Number(destinoFinal.lon),Number(destinoFinal.lat)]:null,
      codigoPais:String(destinoFinal?.country_code||"").toLowerCase(),
      esDestino:true
    }
  ];
  return puntos.slice(0,-1).map((a,i)=>{
    const b=puntos[i+1];
    const esDestino=i===puntos.length-2;
    return {
      dia:i+1,desde:a.nombre,hasta:b.nombre,distancia:b.distRuta-a.distRuta,tiempo:b.tiempoRuta-a.tiempoRuta,
      intermedia:!esDestino,esDestino,pois:b.pois||[],poiPrincipal:b.poiPrincipal||null,
      coordRecomendada:b.coordRecomendada||null,coordIdeal:b.coord||null,codigoPais:b.codigoPais||null,alojamientos:[]
    };
  });
}
// ---------- Fase 7: el destino también forma parte de la guía ----------
async function completarVisitasDestino(plan,datos){
  if(!plan.length)return plan;
  const ultima=plan.at(-1);
  if(!Array.isArray(ultima.coordRecomendada))return plan;
  try{
    const pois=(await buscarPOIs(ultima.coordRecomendada,datos)).slice(0,5);
    ultima.pois=pois.map(f=>{
      const p=f.properties||{}, c=f.geometry?.coordinates||[];
      return {nombre:p.name||"Lugar de interés",localidad:nombreLocalidad(p),direccion:p.formatted||p.address_line2||"",distancia:Number(p.distance)||0,categorias:p.categories||[],etiqueta:etiquetaCategoria(p.categories||[]),lat:Number(c[1]),lon:Number(c[0]),web:p.website||p.contact?.website||p.datasource?.raw?.website||"",placeId:p.place_id||"",descripcion:p.description||p.datasource?.raw?.description||"",horarios:p.opening_hours||p.datasource?.raw?.opening_hours||"",imagen:"",wikiUrl:"",wikiTitulo:""};
    });
    ultima.poiPrincipal=ultima.pois[0]?.nombre||null;
  }catch{}
  return plan;
}

// ---------- Fase 8: fichas enriquecidas + fotografía del lugar principal ----------
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
  await Promise.all(plan.map(enriquecerFichaPrincipal));
  return plan;
}

// ---------- Fase 6: pernoctas con nuestra propia base de datos ----------
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
      limit:"8",lang:"es",apiKey:config.GEOAPIFY_API_KEY
    });
    const r=await fetch(`https://api.geoapify.com/v2/places?${params}`);
    if(!r.ok)return [];
    const d=await r.json();
    return (d.features||[]).filter(f=>f.properties?.name).slice(0,3).map(f=>{
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
  await Promise.all(plan.map(async e=>{e.restaurantes=await buscarRestaurantesEtapa(e,datos);}));
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
  const legsOpt=rutaOptimizada?.properties?.legs||[];
  let h='<div class="guia-pdf"><header class="guia-portada"><span>GUÍA PERSONALIZADA DE VIAJE</span><h2>Tu ruta, día a día</h2><p>Una propuesta organizada con desplazamientos, visitas, gastronomía y pernocta.</p></header>';
  plan.forEach((e,idx)=>{
    const leg=legsOpt[idx]||null, desde=lugaresOpt[idx]?.formatted||e.desde, hasta=lugaresOpt[idx+1]?.formatted||e.hasta;
    const distancia=leg?.distance??e.distancia, tiempo=leg?.time??e.tiempo, esUltima=idx===plan.length-1;
    h+=`<section class="guia-dia-editorial"><div class="guia-dia-titulo"><span>DÍA ${e.dia}</span><h2>${escapar(desde)} → ${escapar(hasta)}</h2><p>🚐 ${formatoKm(distancia)} · ${formatoTiempo(tiempo)}</p></div>`;
    h+=`<div class="guia-narrativa"><p><strong>Plan del día.</strong> Tras el desplazamiento previsto, dedicamos el resto de la jornada a conocer ${escapar(e.pois?.[0]?.localidad||hasta)}. La selección se adapta a los intereses indicados y deja alternativas por si prefieres cambiar el ritmo.</p></div>`;
    if(e.pois?.[0])h+=htmlVisitaEditorial(e.pois[0])+htmlAlternativasEditorial(e.pois);
    else h+='<section class="guia-seccion-editorial"><h3>📍 Qué visitar</h3><p>Esta etapa se utiliza principalmente como parada de viaje. No hemos encontrado una visita suficientemente sólida para recomendarla como principal.</p></section>';
    if((datos.intereses||[]).includes("gastronomia"))h+=htmlComerEditorial(e,esUltima);
    h+=htmlDormirEditorial(e,esUltima);
    h+='</section>';
  });
  return h+'</div>';
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

formRuta.addEventListener("submit",async event=>{
  event.preventDefault(); if(!validarPasoActual())return;
  const datos=recogerDatos(); localStorage.setItem("campingsAreasRutaBorrador",JSON.stringify(datos));
  const resumen=document.getElementById("resumenRuta"); const resultado=document.getElementById("resultadoReal");
  resumen.classList.add("oculto"); resultado.classList.remove("oculto"); resultado.classList.add("cargando-ruta");
  document.getElementById("estadoCalculo").textContent="Localizando origen y destinos…";
  document.getElementById("metricasRuta").innerHTML=""; document.getElementById("etapasRuta").innerHTML="";
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
    pintarResultadoBase(ruta,lugares,datos);

    document.getElementById("estadoCalculo").textContent="Cargando fotografías verificadas…";
    await Promise.all([cargarMediaVerificado(),cargarLugaresVerificados()]);

    document.getElementById("estadoCalculo").textContent="Preparando las etapas para la guía…";
    const stops=await crearEtapasWorker(ruta.features[0],lugares,datos);

    document.getElementById("estadoCalculo").textContent="Consultando la planificación guardada en D1…";
    const respuestaPlan=await consultarPlanificadorIA(datos,lugares,stops);
    console.info("Rutas IA · Planificador",respuestaPlan);

    if(!(respuestaPlan?.ok&&respuestaPlan?.status==="planned"&&respuestaPlan?.plan)){
      document.getElementById("estadoCalculo").textContent="Carretera calculada · guía no disponible";
      document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",htmlEstadoIA(respuestaPlan));
      return;
    }

    document.getElementById("estadoCalculo").textContent="Cargando la guía editorial guardada en D1…";
    const respuestaGuia=await consultarRedactorIA(datos,lugares,stops,respuestaPlan.plan);
    console.info("Rutas IA · Redactor",respuestaGuia);

    if(respuestaGuia?.ok&&respuestaGuia?.status==="written"&&respuestaGuia?.guide){
      document.getElementById("estadoCalculo").textContent="Seleccionando las mejores fotografías…";
      await prepararFotosGuia(respuestaGuia.guide);
      document.getElementById("estadoCalculo").textContent="Guía preparada";
      document.getElementById("etapasRuta").innerHTML=htmlGuiaIA(respuestaGuia.guide);
      return;
    }

    document.getElementById("estadoCalculo").textContent="Carretera calculada · guía no disponible";
    document.getElementById("etapasRuta").insertAdjacentHTML("beforeend",htmlEstadoIA(respuestaGuia));
  }catch(e){
    document.getElementById("estadoCalculo").textContent="No se pudo crear la ruta";
    document.getElementById("etapasRuta").innerHTML=`<div class="error-ruta"><strong>⚠️ ${escapar(e.message)}</strong><br>No se ha generado una guía automática de sustitución.</div>`;
  }finally{
    resultado.classList.remove("cargando-ruta");
  }
});

document.getElementById("volverEditar").addEventListener("click",()=>{ document.querySelector(".rutas-panel").scrollIntoView({behavior:"smooth"}); mostrarPaso(1); });
mostrarPaso(1);
