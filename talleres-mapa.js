// ==========================================
// CAMPINGS & ÁREAS
// VISTA MAPA PARA TALLERES
// Capa aditiva: no modifica carga, filtros ni paginación existentes.
// ==========================================

let vistaTalleresMapa = "lista";
let mapaTalleres = null;
let capaMarcadoresTalleres = null;

const mostrarPaginaTalleresOriginal = mostrarPagina;

function actualizarBotonesVistaTalleres() {
  const botonLista = document.getElementById("vistaListaTaller");
  const botonMapa = document.getElementById("vistaMapaTaller");

  if (botonLista) {
    const activo = vistaTalleresMapa === "lista";
    botonLista.classList.toggle("activo", activo);
    botonLista.setAttribute("aria-pressed", String(activo));
  }

  if (botonMapa) {
    const activo = vistaTalleresMapa === "mapa";
    botonMapa.classList.toggle("activo", activo);
    botonMapa.setAttribute("aria-pressed", String(activo));
  }
}

function destruirMapaTalleres() {
  if (mapaTalleres) {
    mapaTalleres.remove();
    mapaTalleres = null;
    capaMarcadoresTalleres = null;
  }
}

function coordenadasTallerValidas(taller) {
  const lat = Number(taller?.lat);
  const lon = Number(taller?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }

  // Sobre amplio para Europa y territorios europeos usados por esta sección.
  return (
    lat >= 27 &&
    lat <= 72.5 &&
    lon >= -33 &&
    lon <= 45
  );
}

function crearPopupTaller(taller) {
  const contenedor = document.createElement("div");
  contenedor.className = "popup-camping";

  const titulo = document.createElement("strong");
  titulo.textContent = taller.nombre || "Taller";
  contenedor.appendChild(titulo);

  const tipo = document.createElement("p");
  tipo.textContent = "🛠️ Taller";
  contenedor.appendChild(tipo);

  const ubicacion = [
    taller.localidad,
    taller.provincia,
    taller.comunidad_autonoma,
    taller.pais
  ].filter(Boolean);

  if (ubicacion.length > 0) {
    const zona = document.createElement("p");
    zona.textContent = [...new Set(ubicacion)].join(" · ");
    contenedor.appendChild(zona);
  }

  const enlaces = document.createElement("div");
  enlaces.className = "popup-camping__enlaces";

  if (taller.web) {
    const web = document.createElement("a");
    web.href = normalizarUrl(taller.web);
    web.target = "_blank";
    web.rel = "noopener noreferrer";
    web.textContent = "🌐 Web";
    enlaces.appendChild(web);
  }

  if (taller.telefono) {
    const telefono = document.createElement("a");
    telefono.href = "tel:" + String(taller.telefono).replace(/[^\d+]/g, "");
    telefono.textContent = "☎️ " + taller.telefono;
    enlaces.appendChild(telefono);
  }

  const enlaceMapa = crearEnlaceMapa(taller);
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

function crearCabeceraMapaTalleres(total) {
  const cabecera = document.createElement("div");
  cabecera.className = "cabecera-resultados";

  const contador = document.createElement("p");
  contador.className = "contador-resultados";
  contador.textContent = total === 1
    ? "1 taller encontrado"
    : `${total} talleres encontrados`;

  cabecera.appendChild(contador);
  return cabecera;
}

function mostrarMapaTalleresResultados() {
  destruirMapaTalleres();

  const resultados = document.getElementById("resultadosTalleres");
  if (!resultados) return;

  resultados.innerHTML = "";

  if (!paisCargado) {
    resultados.innerHTML =
      '<p class="sin-resultados">Selecciona un país para ver sus talleres.</p>';
    return;
  }

  const lista = Array.isArray(resultadosActuales)
    ? resultadosActuales
    : [];

  const total = lista.length;
  resultados.appendChild(crearCabeceraMapaTalleres(total));

  if (total === 0) {
    const mensaje = document.createElement("p");
    mensaje.className = "sin-resultados";
    mensaje.textContent = "No se han encontrado talleres con esos criterios.";
    resultados.appendChild(mensaje);
    return;
  }

  const validos = lista.filter(coordenadasTallerValidas);
  const descartados = total - validos.length;

  const resumen = document.createElement("p");
  resumen.className = "resumen-mapa-campings";
  resumen.textContent =
    `${validos.length} ${validos.length === 1 ? "taller mostrado" : "talleres mostrados"} en el mapa` +
    (descartados > 0
      ? ` · ${descartados} con coordenadas no válidas para Europa`
      : "");
  resultados.appendChild(resumen);

  const contenedorMapa = document.createElement("div");
  contenedorMapa.id = "mapaTalleres";
  contenedorMapa.className = "mapa-campings";
  contenedorMapa.setAttribute("aria-label", "Mapa de talleres encontrados");
  resultados.appendChild(contenedorMapa);

  if (typeof L === "undefined") {
    contenedorMapa.innerHTML =
      '<p class="mapa-campings__error">⚠️ No se pudo cargar el mapa. Puedes seguir usando la vista de lista.</p>';
    return;
  }

  mapaTalleres = L.map(contenedorMapa, { preferCanvas: true })
    .setView([50.5, 10], 4);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
    }
  ).addTo(mapaTalleres);

  if (typeof L.markerClusterGroup === "function") {
    capaMarcadoresTalleres = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 55
    });
  } else {
    capaMarcadoresTalleres = L.layerGroup();
  }

  const limites = [];

  validos.forEach(taller => {
    const lat = Number(taller.lat);
    const lon = Number(taller.lon);
    const marcador = L.marker([lat, lon]);
    marcador.bindPopup(crearPopupTaller(taller));
    capaMarcadoresTalleres.addLayer(marcador);
    limites.push([lat, lon]);
  });

  capaMarcadoresTalleres.addTo(mapaTalleres);

  if (limites.length > 1) {
    mapaTalleres.fitBounds(limites, {
      padding: [24, 24],
      maxZoom: 13
    });
  } else if (limites.length === 1) {
    mapaTalleres.setView(limites[0], 13);
  }

  window.setTimeout(() => {
    if (mapaTalleres) {
      mapaTalleres.invalidateSize();
    }
  }, 0);
}

mostrarPagina = function () {
  if (vistaTalleresMapa === "mapa") {
    mostrarMapaTalleresResultados();
    return;
  }

  destruirMapaTalleres();
  mostrarPaginaTalleresOriginal();
};

function cambiarVistaTalleres(vista) {
  if (vista !== "lista" && vista !== "mapa") return;

  vistaTalleresMapa = vista;
  actualizarBotonesVistaTalleres();
  mostrarPagina();
}

document.addEventListener("DOMContentLoaded", () => {
  const pais = document.getElementById("paisTaller");
  const botonLista = document.getElementById("vistaListaTaller");
  const botonMapa = document.getElementById("vistaMapaTaller");

  // El núcleo cambia el contenido de #resultadosTalleres inmediatamente
  // al seleccionar otro país y después carga su JSON de forma asíncrona.
  // Destruimos antes la instancia Leaflet activa para evitar que quede
  // ligada a un contenedor que el núcleo va a retirar del DOM.
  if (pais) {
    pais.addEventListener(
      "change",
      () => {
        if (vistaTalleresMapa === "mapa") {
          destruirMapaTalleres();
        }
      },
      { capture: true }
    );
  }

  if (botonLista) {
    botonLista.addEventListener("click", () => cambiarVistaTalleres("lista"));
  }

  if (botonMapa) {
    botonMapa.addEventListener("click", () => cambiarVistaTalleres("mapa"));
  }

  actualizarBotonesVistaTalleres();
});
