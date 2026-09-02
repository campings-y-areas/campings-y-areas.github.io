// ==========================================
// CAMPINGS & ÁREAS - RUTAS FASE 8
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

function paisLugar(lugar){
  return lugar?.country||lugar?.country_name||lugar?.state||"";
}

function nombreLugarWorker(lugar,fallback=""){
  return lugar?.city||lugar?.town||lugar?.village||lugar?.municipality||lugar?.name||fallback||lugar?.formatted||"";
}

function perfilWorker(datos,lugares){
  const origen=nombreLugarWorker(lugares[0],datos.origen);
  const destino=nombreLugarWorker(lugares.at(-1),datos.destinoPrincipal);
  return {
    origin:origen,
    destination:destino,
    country:paisLugar(lugares.at(-1)),
    vehicle:datos.vehiculo,
    adults:Number(datos.adultos)||0,
    children:(datos.edades||[]).map(Number).filter(Number.isFinite),
    pet:Boolean(datos.mascota),
    max_driving_hours:Number(datos.maxConduccion)||4,
    pace:datos.ritmo||"equilibrado",
    interests:datos.intereses||[],
    overnight_preference:(datos.pernocta||[]).join(", "),
    stops:lugares.slice(1).map((l,i)=>({
      day:i+1,
      place:nombreLugarWorker(l,l.formatted||""),
      country:paisLugar(l),
      is_final:i===lugares.length-2
    }))
  };
}

async function consultarPlanificadorIA(datos,lugares){
  return llamarWorker("/plan-route",perfilWorker(datos,lugares));
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
      document.getElementById("estadoCalculo").textContent="Datos guardados correctamente";
      document.getElementById("etapasRuta").innerHTML='<div class="aviso-ruta"><strong>Modo “Organízame las vacaciones”:</strong> ya tenemos tus preferencias. La selección automática de destinos se incorpora en la siguiente fase, cuando añadamos lugares, actividades y pernoctas.</div>';
      return;
    }
    const inputs=[document.getElementById("origen"),document.getElementById("destinoPrincipal"),...document.querySelectorAll(".destinoAdicional")].filter(i=>i.value.trim());
    const lugares=[]; for(const input of inputs){document.getElementById("estadoCalculo").textContent=`Localizando ${input.value.trim()}…`; lugares.push(await resolverLugar(input));}
    document.getElementById("estadoCalculo").textContent="Calculando carretera, kilómetros y tiempo…";
    const ruta=await calcularRuta(lugares,datos); await pintarResultado(ruta,lugares,datos);

    // Conexión inicial con el Planificador del Worker.
    // OPENAI permanece bloqueado en el Worker: una ruta sin caché no genera gasto.
    try{
      const respuestaIA=await consultarPlanificadorIA(datos,lugares);
      console.info("Rutas IA · Planificador",respuestaIA);
      if(respuestaIA?.status==="cost_guard_active"){
        console.info("Rutas IA protegida: esta ruta todavía no está en caché y OpenAI sigue bloqueado.");
      }else if(respuestaIA?.status==="research_required"){
        console.info("Rutas IA: falta investigación almacenada en D1 para alguna parada.");
      }else if(respuestaIA?.ok){
        console.info("Rutas IA: respuesta del Worker recibida correctamente.");
      }
    }catch(errorIA){
      console.warn("Rutas IA · No se pudo contactar con el Worker",errorIA);
    }
  }catch(e){ document.getElementById("estadoCalculo").textContent="No se pudo crear la ruta"; document.getElementById("etapasRuta").innerHTML=`<div class="error-ruta"><strong>⚠️ ${escapar(e.message)}</strong><br>Revisa los lugares introducidos y vuelve a intentarlo.</div>`; }
  finally{ resultado.classList.remove("cargando-ruta"); }
});

document.getElementById("volverEditar").addEventListener("click",()=>{ document.querySelector(".rutas-panel").scrollIntoView({behavior:"smooth"}); mostrarPaso(1); });
mostrarPaso(1);
