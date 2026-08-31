// ==========================================
// CAMPINGS & ÁREAS - RUTAS FASE 2
// Geoapify: autocomplete + routing + mapa
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
  lugares.forEach((l,i)=>{ const m=L.marker([l.lat,l.lon]).addTo(mapa).bindPopup(`<strong>${i===0?"Salida":"Parada "+i}</strong><br>${escapar(l.formatted||l.name||"")}`); marcadores.push(m); });
  mapa.fitBounds(capaRuta.getBounds(),{padding:[24,24]}); setTimeout(()=>mapa.invalidateSize(),100);
}

function pintarResultado(data,lugares,datos){
  const feature=data.features[0], p=feature.properties||{};
  const distancia=p.distance||0, tiempo=p.time||0;
  const maxHoras=Math.max(1,Number(datos.maxConduccion)||4);
  const jornadas=Math.max(1,Math.ceil(tiempo/(maxHoras*3600)));
  document.getElementById("estadoCalculo").textContent=`${lugares[0].formatted||datos.origen} → ${lugares[lugares.length-1].formatted||datos.destinoPrincipal}`;
  document.getElementById("metricasRuta").innerHTML=`
    <div class="metrica-ruta">📏 Distancia<strong>${formatoKm(distancia)}</strong></div>
    <div class="metrica-ruta">⏱️ Conducción<strong>${formatoTiempo(tiempo)}</strong></div>
    <div class="metrica-ruta">🛏️ Jornadas estimadas<strong>${jornadas}</strong></div>
    <div class="metrica-ruta">📍 Puntos de ruta<strong>${lugares.length}</strong></div>`;
  const legs=p.legs||[];
  let html="<h3>🚐 Recorrido</h3>";
  if(legs.length){
    legs.forEach((leg,i)=>{html+=`<div class="etapa-card"><div class="etapa-numero">${i+1}</div><div><strong>${escapar(lugares[i]?.formatted||"Salida")} → ${escapar(lugares[i+1]?.formatted||"Destino")}</strong><p>${formatoKm(leg.distance||0)} · ${formatoTiempo(leg.time||0)}</p></div></div>`;});
  } else html+=`<p>${formatoKm(distancia)} · ${formatoTiempo(tiempo)}</p>`;
  if(jornadas>1)html+=`<div class="aviso-ruta"><strong>Plan de conducción:</strong> con un máximo de ${escapar(maxHoras)} h al día, el trayecto necesita aproximadamente ${jornadas} jornadas. En la siguiente fase elegiremos las paradas reales de cada jornada según lugares interesantes y opciones de pernocta, no simples puntos matemáticos de la carretera.</div>`;
  const noAplicables=datos.evitar.filter(x=>["carreteras-complicadas","grandes-ciudades"].includes(x));
  if(noAplicables.length)html+=`<div class="aviso-ruta">ℹ️ Las preferencias “${escapar(noAplicables.join(" / "))}” se conservarán para la planificación de etapas y lugares. No se aplican como exclusión directa al cálculo básico de carretera.</div>`;
  document.getElementById("etapasRuta").innerHTML=html;
  pintarRuta(data,lugares);
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
    const ruta=await calcularRuta(lugares,datos); pintarResultado(ruta,lugares,datos);
  }catch(e){ document.getElementById("estadoCalculo").textContent="No se pudo crear la ruta"; document.getElementById("etapasRuta").innerHTML=`<div class="error-ruta"><strong>⚠️ ${escapar(e.message)}</strong><br>Revisa los lugares introducidos y vuelve a intentarlo.</div>`; }
  finally{ resultado.classList.remove("cargando-ruta"); }
});

document.getElementById("volverEditar").addEventListener("click",()=>{ document.querySelector(".rutas-panel").scrollIntoView({behavior:"smooth"}); mostrarPaso(1); });
mostrarPaso(1);
