// ==========================================
// CAMPINGS & ÁREAS
// VISTA MAPA PARA SERVICIOS
// Capa aditiva: no modifica carga, filtros ni paginación existentes.
// ==========================================

let vistaServiciosMapa = "lista";
let mapaServicios = null;
let capaMarcadoresServicios = null;

const mostrarPaginaServiciosOriginal = mostrarPagina;

function actualizarBotonesVistaServicios() {
  const botonLista = document.getElementById("vistaListaServicio");
  const botonMapa = document.getElementById("vistaMapaServicio");

  if (botonLista) {
    const activo = vistaServiciosMapa === "lista";
    botonLista.classList.toggle("activo", activo);
    botonLista.setAttribute("aria-pressed", String(activo));
  }

  if (botonMapa) {
    const activo = vistaServiciosMapa === "mapa";
    botonMapa.classList.toggle("activo", activo);
    botonMapa.setAttribute("aria-pressed", String(activo));
  }
}

function destruirMapaServicios() {
  if (mapaServicios) {
    mapaServicios.remove();
    mapaServicios = null;
    capaMarcadoresServicios = null;
  }
}

function coordenadasServicioValidas(servicio) {
  const lat = Number(servicio?.lat);
  const lon = Number(servicio?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

  // Sobre amplio para Europa y territorios europeos usados por esta sección.
  return lat >= 27 && lat <= 72.5 && lon >= -33 && lon <= 45;
}

function textoTipoServicioMapa(servicio) {
  switch (servicio?.tipo) {
    case "restaurante": return "🍽️ Restaurante";
    case "ducha": return "🚿 Ducha";
    case "lavadero": return "🧽 Lavadero de autocaravanas";
    case "lavanderia": return "🧺 Lavandería";
    case "vaciado_aguas": return "🚰 Vaciado de aguas";
    case "guarderia_vehiculos_camping": return "🏠 Guardería de vehículos de camping";
    default: return "🔧 Servicio";
  }
}

function crearPopupServicio(servicio) {
  const contenedor = document.createElement("div");
  contenedor.className = "popup-camping";

  const titulo = document.createElement("strong");
  titulo.textContent = servicio.nombre || "Servicio";
  contenedor.appendChild(titulo);

  const tipo = document.createElement("p");
  tipo.textContent = textoTipoServicioMapa(servicio);
  contenedor.appendChild(tipo);

  const ubicacion = [
    servicio.localidad,
    servicio.provincia,
    servicio.comunidad_autonoma,
    servicio.pais
  ].filter(Boolean);

  if (ubicacion.length > 0) {
    const zona = document.createElement("p");
    zona.textContent = [...new Set(ubicacion)].join(" · ");
    contenedor.appendChild(zona);
  }

  if (servicio.precio) {
    const precio = document.createElement("p");
    precio.textContent = "💶 " + servicio.precio;
    contenedor.appendChild(precio);
  }

  if (servicio.horario) {
    const horario = document.createElement("p");
    horario.textContent = "🕒 " + servicio.horario;
    contenedor.appendChild(horario);
  }

  if (servicio.tipo === "guarderia_vehiculos_camping") {
    if (servicio.lavadero === true) {
      const dato = document.createElement("p");
      dato.textContent = "🧽 Dispone de lavadero";
      contenedor.appendChild(dato);
    }
    if (servicio.larga_estancia_explicita === true) {
      const dato = document.createElement("p");
      dato.textContent = "🅿️ Larga estancia";
      contenedor.appendChild(dato);
    }
    if (servicio.pernocta === false) {
      const dato = document.createElement("p");
      dato.textContent = "🚫 No permite pernocta";
      contenedor.appendChild(dato);
    }
  }

  const enlaces = document.createElement("div");
  enlaces.className = "popup-camping__enlaces";

  if (servicio.web) {
    const web = document.createElement("a");
    web.href = normalizarUrl(servicio.web);
    web.target = "_blank";
    web.rel = "noopener noreferrer";
    web.textContent = "🌐 Web";
    enlaces.appendChild(web);
  }

  if (servicio.telefono) {
    const telefono = document.createElement("a");
    telefono.href = "tel:" + String(servicio.telefono).replace(/[^\d+]/g, "");
    telefono.textContent = "☎️ " + servicio.telefono;
    enlaces.appendChild(telefono);
  }

  const enlaceMapa = crearEnlaceMapa(servicio);
  if (enlaceMapa) {
    const mapa = document.createElement("a");
    mapa.href = enlaceMapa;
    mapa.target = "_blank";
    mapa.rel = "noopener noreferrer";
    mapa.textContent = "📍 Google Maps";
    enlaces.appendChild(mapa);
  }

  if (enlaces.children.length > 0) contenedor.appendChild(enlaces);

  return contenedor;
}

function crearCabeceraMapaServicios(total) {
  const cabecera = document.createElement("div");
  cabecera.className = "cabecera-resultados";

  const contador = document.createElement("p");
  contador.className = "contador-resultados";
  contador.textContent = total === 1
    ? "1 servicio encontrado"
    : `${total} servicios encontrados`;

  cabecera.appendChild(contador);
  return cabecera;
}

function mostrarMapaServiciosResultados() {
  destruirMapaServicios();

  const resultados = document.getElementById("resultadosServicios");
  if (!resultados) return;

  resultados.innerHTML = "";

  const lista = Array.isArray(resultadosActuales) ? resultadosActuales : [];
  const total = lista.length;

  resultados.appendChild(crearCabeceraMapaServicios(total));

  if (total === 0) {
    const mensaje = document.createElement("p");
    mensaje.className = "sin-resultados";
    mensaje.textContent = "No se han encontrado servicios con esos criterios.";
    resultados.appendChild(mensaje);
    return;
  }

  const validos = lista.filter(coordenadasServicioValidas);
  const descartados = total - validos.length;

  const resumen = document.createElement("p");
  resumen.className = "resumen-mapa-campings";
  resumen.textContent =
    `${validos.length} ${validos.length === 1 ? "servicio mostrado" : "servicios mostrados"} en el mapa` +
    (descartados > 0
      ? ` · ${descartados} con coordenadas no válidas para Europa`
      : "");
  resultados.appendChild(resumen);

  const contenedorMapa = document.createElement("div");
  contenedorMapa.id = "mapaServicios";
  contenedorMapa.className = "mapa-campings";
  contenedorMapa.setAttribute("aria-label", "Mapa de servicios encontrados");
  resultados.appendChild(contenedorMapa);

  if (typeof L === "undefined") {
    contenedorMapa.innerHTML =
      '<p class="mapa-campings__error">⚠️ No se pudo cargar el mapa. Puedes seguir usando la vista de lista.</p>';
    return;
  }

  mapaServicios = L.map(contenedorMapa, { preferCanvas: true })
    .setView([40.2, -3.7], 6);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
    }
  ).addTo(mapaServicios);

  if (typeof L.markerClusterGroup === "function") {
    capaMarcadoresServicios = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 55
    });
  } else {
    capaMarcadoresServicios = L.layerGroup();
  }

  const limites = [];

  validos.forEach(servicio => {
    const lat = Number(servicio.lat);
    const lon = Number(servicio.lon);
    const marcador = L.marker([lat, lon]);
    marcador.bindPopup(crearPopupServicio(servicio));
    capaMarcadoresServicios.addLayer(marcador);
    limites.push([lat, lon]);
  });

  capaMarcadoresServicios.addTo(mapaServicios);

  if (limites.length > 1) {
    mapaServicios.fitBounds(limites, {
      padding: [24, 24],
      maxZoom: 13
    });
  } else if (limites.length === 1) {
    mapaServicios.setView(limites[0], 13);
  }

  window.setTimeout(() => {
    if (mapaServicios) mapaServicios.invalidateSize();
  }, 0);
}

mostrarPagina = function () {
  if (vistaServiciosMapa === "mapa") {
    mostrarMapaServiciosResultados();
    return;
  }

  destruirMapaServicios();
  mostrarPaginaServiciosOriginal();
};

function cambiarVistaServicios(vista) {
  if (vista !== "lista" && vista !== "mapa") return;

  vistaServiciosMapa = vista;
  actualizarBotonesVistaServicios();
  mostrarPagina();
}

document.addEventListener("DOMContentLoaded", () => {
  const botonLista = document.getElementById("vistaListaServicio");
  const botonMapa = document.getElementById("vistaMapaServicio");

  if (botonLista) {
    botonLista.addEventListener("click", () => cambiarVistaServicios("lista"));
  }

  if (botonMapa) {
    botonMapa.addEventListener("click", () => cambiarVistaServicios("mapa"));
  }

  actualizarBotonesVistaServicios();
});
