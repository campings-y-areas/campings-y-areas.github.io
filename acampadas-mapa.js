// ==========================================
// CAMPINGS & ÁREAS
// VISTA MAPA PARA ACAMPADAS CONTROLADAS
// Capa aditiva: no modifica filtros, paginación ni carga de datos.
// ==========================================

let vistaAcampadasMapa = "lista";
let mapaAcampadas = null;
let capaMarcadoresAcampadas = null;

const mostrarPaginaAcampadasOriginal = mostrarPagina;

function actualizarBotonesVistaAcampadas() {
  const botonLista = document.getElementById("vistaListaAcampada");
  const botonMapa = document.getElementById("vistaMapaAcampada");

  if (botonLista) {
    const activo = vistaAcampadasMapa === "lista";
    botonLista.classList.toggle("activo", activo);
    botonLista.setAttribute("aria-pressed", String(activo));
  }

  if (botonMapa) {
    const activo = vistaAcampadasMapa === "mapa";
    botonMapa.classList.toggle("activo", activo);
    botonMapa.setAttribute("aria-pressed", String(activo));
  }
}

function destruirMapaAcampadas() {
  if (mapaAcampadas) {
    mapaAcampadas.remove();
    mapaAcampadas = null;
    capaMarcadoresAcampadas = null;
  }
}

function coordenadasAcampadaValidas(zona) {
  const lat = Number(zona?.lat);
  const lon = Number(zona?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }

  // La base actual de acampadas es España. Este sobre amplio incluye
  // Península, Baleares, Canarias, Ceuta y Melilla y descarta
  // coordenadas manifiestamente erróneas fuera del territorio esperado.
  return (
    lat >= 27 &&
    lat <= 44.5 &&
    lon >= -19 &&
    lon <= 5
  );
}

function crearPopupAcampada(zona) {
  const contenedor = document.createElement("div");
  contenedor.className = "popup-camping";

  const titulo = document.createElement("strong");
  titulo.textContent = zona.nombre || "Zona de acampada controlada";
  contenedor.appendChild(titulo);

  const tipo = document.createElement("p");
  tipo.textContent = "🥾 Zona de acampada controlada";
  contenedor.appendChild(tipo);

  const ubicacion = [
    zona.localidad,
    zona.provincia,
    zona.comunidad_autonoma
  ].filter(Boolean);

  if (ubicacion.length > 0) {
    const lugar = document.createElement("p");
    lugar.textContent = [...new Set(ubicacion)].join(" · ");
    contenedor.appendChild(lugar);
  }

  if (zona.permiso_necesario === true) {
    const permiso = document.createElement("p");
    permiso.textContent = "📋 Requiere permiso o autorización";
    contenedor.appendChild(permiso);
  }

  if (zona.estado === "cerrada") {
    const cerrado = document.createElement("p");
    cerrado.className = "popup-camping__cerrado";
    cerrado.textContent = "🚫 Cerrada según la información disponible";
    contenedor.appendChild(cerrado);
  }

  const enlaces = document.createElement("div");
  enlaces.className = "popup-camping__enlaces";

  if (zona.web) {
    const web = document.createElement("a");
    web.href = normalizarUrl(zona.web);
    web.target = "_blank";
    web.rel = "noopener noreferrer";
    web.textContent = zona.permiso_necesario
      ? "📋 Información / Permiso"
      : "🌐 Web";
    enlaces.appendChild(web);
  }

  const enlaceMapa = crearEnlaceMapa(zona);

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

function crearCabeceraMapaAcampadas(total) {
  const cabecera = document.createElement("div");
  cabecera.className = "cabecera-resultados";

  const contador = document.createElement("p");
  contador.className = "contador-resultados";
  contador.textContent = total === 1
    ? "1 zona encontrada"
    : `${total} zonas encontradas`;

  cabecera.appendChild(contador);
  return cabecera;
}

function mostrarMapaAcampadasResultados() {
  destruirMapaAcampadas();

  const resultados = document.getElementById("resultadosAcampadas");
  if (!resultados) {
    return;
  }

  resultados.innerHTML = "";

  const lista = Array.isArray(resultadosActuales)
    ? resultadosActuales
    : [];

  const total = lista.length;
  resultados.appendChild(crearCabeceraMapaAcampadas(total));

  if (total === 0) {
    const mensaje = document.createElement("p");
    mensaje.className = "sin-resultados";
    mensaje.textContent = "No se han encontrado zonas con esos criterios.";
    resultados.appendChild(mensaje);
    return;
  }

  const validas = lista.filter(coordenadasAcampadaValidas);
  const descartadas = total - validas.length;

  const resumen = document.createElement("p");
  resumen.className = "resumen-mapa-campings";
  resumen.textContent =
    `${validas.length} ${validas.length === 1 ? "zona mostrada" : "zonas mostradas"} en el mapa` +
    (descartadas > 0
      ? ` · ${descartadas} con coordenadas no válidas para España`
      : "");
  resultados.appendChild(resumen);

  const contenedorMapa = document.createElement("div");
  contenedorMapa.id = "mapaAcampadas";
  contenedorMapa.className = "mapa-campings";
  contenedorMapa.setAttribute(
    "aria-label",
    "Mapa de zonas de acampada controlada encontradas"
  );
  resultados.appendChild(contenedorMapa);

  if (typeof L === "undefined") {
    contenedorMapa.innerHTML =
      '<p class="mapa-campings__error">⚠️ No se pudo cargar el mapa. Puedes seguir usando la vista de lista.</p>';
    return;
  }

  mapaAcampadas = L.map(
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
  ).addTo(mapaAcampadas);

  if (typeof L.markerClusterGroup === "function") {
    capaMarcadoresAcampadas = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 55
    });
  }
  else {
    capaMarcadoresAcampadas = L.layerGroup();
  }

  const limites = [];

  validas.forEach(zona => {
    const lat = Number(zona.lat);
    const lon = Number(zona.lon);
    const marcador = L.marker([lat, lon]);
    marcador.bindPopup(crearPopupAcampada(zona));
    capaMarcadoresAcampadas.addLayer(marcador);
    limites.push([lat, lon]);
  });

  capaMarcadoresAcampadas.addTo(mapaAcampadas);

  if (limites.length > 0) {
    mapaAcampadas.fitBounds(
      limites,
      {
        padding: [24, 24],
        maxZoom: 13
      }
    );
  }

  // Protección frente a cálculos de tamaño tardíos del contenedor Leaflet.
  window.setTimeout(() => {
    if (mapaAcampadas) {
      mapaAcampadas.invalidateSize();
    }
  }, 0);
}

mostrarPagina = function () {
  if (vistaAcampadasMapa === "mapa") {
    mostrarMapaAcampadasResultados();
    return;
  }

  destruirMapaAcampadas();
  mostrarPaginaAcampadasOriginal();
};

function cambiarVistaAcampadas(vista) {
  if (vista !== "lista" && vista !== "mapa") {
    return;
  }

  vistaAcampadasMapa = vista;
  actualizarBotonesVistaAcampadas();
  mostrarPagina();
}

document.addEventListener("DOMContentLoaded", () => {
  const botonLista = document.getElementById("vistaListaAcampada");
  const botonMapa = document.getElementById("vistaMapaAcampada");

  if (botonLista) {
    botonLista.addEventListener(
      "click",
      () => cambiarVistaAcampadas("lista")
    );
  }

  if (botonMapa) {
    botonMapa.addEventListener(
      "click",
      () => cambiarVistaAcampadas("mapa")
    );
  }

  actualizarBotonesVistaAcampadas();
});
