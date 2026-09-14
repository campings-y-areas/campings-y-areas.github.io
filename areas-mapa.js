// ==========================================
// CAMPINGS & ÁREAS
// VISTA MAPA PARA ÁREAS + PARKINGS
// Capa aditiva: no modifica filtros, paginación ni carga de datos.
// ==========================================

let vistaAreasMapa = "lista";
let mapaAreas = null;
let capaMarcadoresAreas = null;

const mostrarPaginaAreasOriginal = mostrarPagina;


function actualizarBotonesVistaAreas() {

  const botonLista =
    document.getElementById("vistaListaArea");

  const botonMapa =
    document.getElementById("vistaMapaArea");

  if (botonLista) {
    const activo = vistaAreasMapa === "lista";
    botonLista.classList.toggle("activo", activo);
    botonLista.setAttribute("aria-pressed", String(activo));
  }

  if (botonMapa) {
    const activo = vistaAreasMapa === "mapa";
    botonMapa.classList.toggle("activo", activo);
    botonMapa.setAttribute("aria-pressed", String(activo));
  }
}


function destruirMapaAreas() {

  if (mapaAreas) {
    mapaAreas.remove();
    mapaAreas = null;
    capaMarcadoresAreas = null;
  }
}


function coordenadasAreaValidas(punto) {

  const lat = Number(punto?.lat);
  const lon = Number(punto?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }

  // La base publicada trabaja con Europa. Este límite amplio conserva
  // Europa continental, Reino Unido, Irlanda, Islandia, Azores, Madeira,
  // Canarias, Chipre y Balcanes y descarta coordenadas manifiestamente
  // erróneas en otros continentes u océanos lejanos.
  return (
    lat >= 27 &&
    lat <= 72.5 &&
    lon >= -33 &&
    lon <= 45
  );
}


function crearPopupArea(punto) {

  const contenedor = document.createElement("div");
  contenedor.className = "popup-camping";

  const titulo = document.createElement("strong");
  titulo.textContent =
    punto.nombre ||
    (punto.tipo === "parking" ? "Parking" : "Área");
  contenedor.appendChild(titulo);

  const tipo = document.createElement("p");
  tipo.textContent =
    punto.tipo === "parking"
      ? "🅿️ Parking"
      : "🚐 Área";
  contenedor.appendChild(tipo);

  const ubicacion = [
    punto.localidad,
    punto.provincia,
    punto.region,
    punto.pais
  ].filter(Boolean);

  if (ubicacion.length > 0) {
    const zona = document.createElement("p");
    zona.textContent = [...new Set(ubicacion)].join(" · ");
    contenedor.appendChild(zona);
  }

  const enlaces = document.createElement("div");
  enlaces.className = "popup-camping__enlaces";

  if (punto.web) {
    const web = document.createElement("a");
    web.href = normalizarUrl(punto.web);
    web.target = "_blank";
    web.rel = "noopener noreferrer";
    web.textContent = "🌐 Web";
    enlaces.appendChild(web);
  }

  const enlaceMapa = crearEnlaceMapa(punto);

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


function crearCabeceraMapaAreas(total, tipo) {

  const cabecera = document.createElement("div");
  cabecera.className = "cabecera-resultados";

  const contador = document.createElement("p");
  contador.className = "contador-resultados";

  if (tipo === "parking") {
    contador.textContent =
      total === 1
        ? "1 parking encontrado"
        : `${total} parkings encontrados`;
  }
  else {
    contador.textContent =
      total === 1
        ? "1 área encontrada"
        : `${total} áreas encontradas`;
  }

  cabecera.appendChild(contador);
  return cabecera;
}


function mostrarMapaAreasResultados() {

  destruirMapaAreas();

  const resultados = document.getElementById("resultadosAreas");

  if (!resultados) {
    return;
  }

  resultados.innerHTML = "";

  const lista = Array.isArray(resultadosActuales)
    ? resultadosActuales
    : [];

  const total = lista.length;
  const tipo = obtenerTipoSeleccionado();

  resultados.appendChild(
    crearCabeceraMapaAreas(total, tipo)
  );

  if (total === 0) {
    const mensaje = document.createElement("p");
    mensaje.className = "sin-resultados";
    mensaje.textContent =
      "No se han encontrado resultados con esos criterios.";
    resultados.appendChild(mensaje);
    return;
  }

  const validos = lista.filter(coordenadasAreaValidas);
  const descartados = total - validos.length;

  const resumen = document.createElement("p");
  resumen.className = "resumen-mapa-campings";
  resumen.textContent =
    `${validos.length} ${
      tipo === "parking"
        ? (validos.length === 1 ? "parking mostrado" : "parkings mostrados")
        : (validos.length === 1 ? "área mostrada" : "áreas mostradas")
    } en el mapa` +
    (descartados > 0
      ? ` · ${descartados} con coordenadas no válidas para Europa`
      : "");

  resultados.appendChild(resumen);

  const contenedorMapa = document.createElement("div");
  contenedorMapa.id = "mapaAreas";
  contenedorMapa.className = "mapa-campings";
  contenedorMapa.setAttribute(
    "aria-label",
    tipo === "parking"
      ? "Mapa de parkings encontrados"
      : "Mapa de áreas encontradas"
  );
  resultados.appendChild(contenedorMapa);

  if (typeof L === "undefined") {
    contenedorMapa.innerHTML =
      '<p class="mapa-campings__error">' +
      '⚠️ No se pudo cargar el mapa. Puedes seguir usando la vista de lista.' +
      '</p>';
    return;
  }

  mapaAreas = L.map(
    contenedorMapa,
    { preferCanvas: true }
  ).setView([48.5, 10.5], 4);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
    }
  ).addTo(mapaAreas);

  if (typeof L.markerClusterGroup === "function") {
    capaMarcadoresAreas = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 55
    });
  }
  else {
    capaMarcadoresAreas = L.layerGroup();
  }

  const limites = [];

  validos.forEach(punto => {
    const lat = Number(punto.lat);
    const lon = Number(punto.lon);

    const marcador = L.marker([lat, lon]);
    marcador.bindPopup(crearPopupArea(punto));
    capaMarcadoresAreas.addLayer(marcador);
    limites.push([lat, lon]);
  });

  capaMarcadoresAreas.addTo(mapaAreas);

  if (limites.length > 0) {
    mapaAreas.fitBounds(
      limites,
      {
        padding: [24, 24],
        maxZoom: 13
      }
    );
  }
}


mostrarPagina = function () {

  if (vistaAreasMapa === "mapa") {
    mostrarMapaAreasResultados();
    return;
  }

  destruirMapaAreas();
  mostrarPaginaAreasOriginal();
};


function cambiarVistaAreas(vista) {

  if (vista !== "lista" && vista !== "mapa") {
    return;
  }

  vistaAreasMapa = vista;
  actualizarBotonesVistaAreas();
  mostrarPagina();
}


document.addEventListener("DOMContentLoaded", () => {

  const botonLista = document.getElementById("vistaListaArea");
  const botonMapa = document.getElementById("vistaMapaArea");

  if (botonLista) {
    botonLista.addEventListener(
      "click",
      () => cambiarVistaAreas("lista")
    );
  }

  if (botonMapa) {
    botonMapa.addEventListener(
      "click",
      () => cambiarVistaAreas("mapa")
    );
  }

  actualizarBotonesVistaAreas();
});
