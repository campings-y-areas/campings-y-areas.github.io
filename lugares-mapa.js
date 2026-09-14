// ==========================================
// CAMPINGS & ÁREAS
// VISTA MAPA PARA LUGARES
// Capa aditiva: no modifica filtros, paginación ni carga de datos.
// ==========================================

let vistaLugaresMapa = "lista";
let mapaLugares = null;
let capaMarcadoresLugares = null;

const mostrarPaginaLugaresOriginal = mostrarPagina;

function actualizarBotonesVistaLugares() {
  const botonLista = document.getElementById("vistaListaLugar");
  const botonMapa = document.getElementById("vistaMapaLugar");

  if (botonLista) {
    const activo = vistaLugaresMapa === "lista";
    botonLista.classList.toggle("activo", activo);
    botonLista.setAttribute("aria-pressed", String(activo));
  }

  if (botonMapa) {
    const activo = vistaLugaresMapa === "mapa";
    botonMapa.classList.toggle("activo", activo);
    botonMapa.setAttribute("aria-pressed", String(activo));
  }
}

function destruirMapaLugares() {
  if (mapaLugares) {
    mapaLugares.remove();
    mapaLugares = null;
    capaMarcadoresLugares = null;
  }
}

function coordenadasLugarValidas(lugar) {
  const lat = Number(lugar?.lat);
  const lon = Number(lugar?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }

  // Las bases actuales de Lugares son de España. Este sobre amplio incluye
  // Península, Baleares, Canarias, Ceuta y Melilla y descarta coordenadas
  // manifiestamente erróneas fuera del territorio esperado.
  return (
    lat >= 27 &&
    lat <= 44.5 &&
    lon >= -19 &&
    lon <= 5
  );
}

function textoTipoLugarMapa(lugar) {
  if (lugar.tipo === "playa_canina") {
    return "🐕 Playa canina";
  }

  if (lugar.tipo === "poza_piscina_natural") {
    return "💧 Poza o piscina natural";
  }

  if (lugar.buceo === true) {
    return "🤿 Zona de buceo";
  }

  if (lugar.snorkel === true || lugar.apnea === true) {
    return "🥽 Snorkel y apnea";
  }

  return "📍 Lugar";
}

function crearPopupLugar(lugar) {
  const contenedor = document.createElement("div");
  contenedor.className = "popup-camping";

  const titulo = document.createElement("strong");
  titulo.textContent = lugar.nombre || "Lugar";
  contenedor.appendChild(titulo);

  const tipo = document.createElement("p");
  tipo.textContent = textoTipoLugarMapa(lugar);
  contenedor.appendChild(tipo);

  const actividades = [];
  if (lugar.buceo === true) actividades.push("🤿 Buceo");
  if (lugar.snorkel === true) actividades.push("🥽 Snorkel");
  if (lugar.apnea === true) actividades.push("🌊 Apnea");

  if (actividades.length > 0) {
    const actividad = document.createElement("p");
    actividad.textContent = actividades.join(" · ");
    contenedor.appendChild(actividad);
  }

  const ubicacion = [
    lugar.localidad,
    lugar.provincia,
    lugar.comunidad_autonoma
  ].filter(Boolean);

  if (lugar.pais && lugar.pais !== "España") {
    ubicacion.push(lugar.pais);
  }

  if (ubicacion.length > 0) {
    const zona = document.createElement("p");
    zona.textContent = [...new Set(ubicacion)].join(" · ");
    contenedor.appendChild(zona);
  }

  const enlaces = document.createElement("div");
  enlaces.className = "popup-camping__enlaces";

  if (lugar.web) {
    const web = document.createElement("a");
    web.href = normalizarUrl(lugar.web);
    web.target = "_blank";
    web.rel = "noopener noreferrer";
    web.textContent = "🌐 Web";
    enlaces.appendChild(web);
  }

  const enlaceMapa = crearEnlaceMapa(lugar);

  if (enlaceMapa) {
    const mapa = document.createElement("a");
    mapa.href = enlaceMapa;
    mapa.target = "_blank";
    mapa.rel = "noopener noreferrer";
    mapa.textContent = "📍 Google Maps";
    enlaces.appendChild(mapa);
  }

  if (enlaces.children.length > 0) {
    contenedor.appendChild(enlaces);
  }

  return contenedor;
}

function crearCabeceraMapaLugares(total) {
  const cabecera = document.createElement("div");
  cabecera.className = "cabecera-resultados";

  const contador = document.createElement("p");
  contador.className = "contador-resultados";
  contador.textContent = total === 1
    ? "1 lugar encontrado"
    : `${total} lugares encontrados`;

  cabecera.appendChild(contador);
  return cabecera;
}

function mostrarMapaLugaresResultados() {
  destruirMapaLugares();

  const resultados = document.getElementById("resultadosLugares");
  if (!resultados) {
    return;
  }

  resultados.innerHTML = "";

  const lista = Array.isArray(resultadosActuales)
    ? resultadosActuales
    : [];

  const total = lista.length;
  resultados.appendChild(crearCabeceraMapaLugares(total));

  if (total === 0) {
    const mensaje = document.createElement("p");
    mensaje.className = "sin-resultados";
    mensaje.textContent = "No se han encontrado lugares con esos criterios.";
    resultados.appendChild(mensaje);
    return;
  }

  const validos = lista.filter(coordenadasLugarValidas);
  const descartados = total - validos.length;

  const resumen = document.createElement("p");
  resumen.className = "resumen-mapa-campings";
  resumen.textContent =
    `${validos.length} ${validos.length === 1 ? "lugar mostrado" : "lugares mostrados"} en el mapa` +
    (descartados > 0
      ? ` · ${descartados} con coordenadas no válidas para España`
      : "");
  resultados.appendChild(resumen);

  const contenedorMapa = document.createElement("div");
  contenedorMapa.id = "mapaLugares";
  contenedorMapa.className = "mapa-campings";
  contenedorMapa.setAttribute(
    "aria-label",
    "Mapa de lugares encontrados"
  );
  resultados.appendChild(contenedorMapa);

  if (typeof L === "undefined") {
    contenedorMapa.innerHTML =
      '<p class="mapa-campings__error">⚠️ No se pudo cargar el mapa. Puedes seguir usando la vista de lista.</p>';
    return;
  }

  mapaLugares = L.map(
    contenedorMapa,
    { preferCanvas: true }
  ).setView([40.2, -3.7], 6);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
    }
  ).addTo(mapaLugares);

  if (typeof L.markerClusterGroup === "function") {
    capaMarcadoresLugares = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 55
    });
  }
  else {
    capaMarcadoresLugares = L.layerGroup();
  }

  const limites = [];

  validos.forEach(lugar => {
    const lat = Number(lugar.lat);
    const lon = Number(lugar.lon);
    const marcador = L.marker([lat, lon]);
    marcador.bindPopup(crearPopupLugar(lugar));
    capaMarcadoresLugares.addLayer(marcador);
    limites.push([lat, lon]);
  });

  capaMarcadoresLugares.addTo(mapaLugares);

  if (limites.length > 0) {
    mapaLugares.fitBounds(
      limites,
      {
        padding: [24, 24],
        maxZoom: 13
      }
    );
  }

  window.setTimeout(() => {
    if (mapaLugares) {
      mapaLugares.invalidateSize();
    }
  }, 0);
}

mostrarPagina = function () {
  if (vistaLugaresMapa === "mapa") {
    mostrarMapaLugaresResultados();
    return;
  }

  destruirMapaLugares();
  mostrarPaginaLugaresOriginal();
};

function cambiarVistaLugares(vista) {
  if (vista !== "lista" && vista !== "mapa") {
    return;
  }

  vistaLugaresMapa = vista;
  actualizarBotonesVistaLugares();
  mostrarPagina();
}

document.addEventListener("DOMContentLoaded", () => {
  const botonLista = document.getElementById("vistaListaLugar");
  const botonMapa = document.getElementById("vistaMapaLugar");

  if (botonLista) {
    botonLista.addEventListener(
      "click",
      () => cambiarVistaLugares("lista")
    );
  }

  if (botonMapa) {
    botonMapa.addEventListener(
      "click",
      () => cambiarVistaLugares("mapa")
    );
  }

  actualizarBotonesVistaLugares();
});
