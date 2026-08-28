// ==========================================
// CAMPINGS & ÁREAS
// TALLERES
// ==========================================

let talleres = [];
let resultadosActuales = [];
let paisCargado = "";

const resultadosPorPagina = 20;
let paginaActual = 1;

const archivosTalleres = {
  "España": "talleres-espana-v1.json?v=3",
  "Portugal": "talleres-portugal-definitivo.json?v=1",
  "Francia": "talleres-francia-definitivo.json?v=1",
  "Alemania": "talleres-alemania-definitivo.json?v=1",
  "Austria": "talleres-austria-definitivo.json?v=1"
};

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarUrl(url) {
  if (!url) return "";
  url = String(url).trim();
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return "https://" + url;
}

function crearEnlaceMapa(taller) {
  if (taller.google_maps) return normalizarUrl(taller.google_maps);

  if (
    taller.lat !== null && taller.lat !== undefined &&
    taller.lon !== null && taller.lon !== undefined
  ) {
    return "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(`${taller.lat},${taller.lon}`);
  }

  const consulta = [
    taller.nombre,
    taller.localidad,
    taller.provincia,
    taller.pais
  ].filter(Boolean).join(", ");

  return consulta
    ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(consulta)
    : "";
}

async function cargarJSON(archivo) {
  const response = await fetch(archivo);
  if (!response.ok) throw new Error(`No se pudo cargar ${archivo}`);

  const datos = await response.json();
  if (!Array.isArray(datos)) {
    throw new Error(`${archivo} no contiene una lista válida`);
  }
  return datos;
}

function regionDe(taller) {
  return taller.comunidad_autonoma || taller.provincia || "";
}

function cargarRegiones() {
  const selector = document.getElementById("regionTaller");
  const pais = document.getElementById("paisTaller")?.value || "";
  if (!selector) return;

  const regiones = [
    ...new Set(talleres.map(regionDe).filter(Boolean))
  ].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const etiqueta =
    pais === "España" ? "Todas las comunidades" :
    pais === "Portugal" ? "Todos los distritos" :
    pais === "Alemania" ? "Todos los estados federados" :
    "Todas las regiones";

  selector.innerHTML = `<option value="">${etiqueta}</option>`;

  regiones.forEach(region => {
    const opcion = document.createElement("option");
    opcion.value = region;
    opcion.textContent = region;
    selector.appendChild(opcion);
  });

  selector.disabled = talleres.length === 0;
}

function cargarCiudades() {
  const selector = document.getElementById("ciudadTaller");
  const region = document.getElementById("regionTaller")?.value || "";
  if (!selector) return;

  const ciudades = [
    ...new Set(
      talleres
        .filter(taller => region === "" || regionDe(taller) === region)
        .map(taller => taller.localidad)
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  selector.innerHTML = '<option value="">Todas las ciudades</option>';

  ciudades.forEach(ciudad => {
    const opcion = document.createElement("option");
    opcion.value = ciudad;
    opcion.textContent = ciudad;
    selector.appendChild(opcion);
  });

  selector.disabled = talleres.length === 0;
}

async function cambiarPais() {
  const pais = document.getElementById("paisTaller")?.value || "";
  const resultados = document.getElementById("resultadosTalleres");
  const region = document.getElementById("regionTaller");
  const ciudad = document.getElementById("ciudadTaller");

  talleres = [];
  resultadosActuales = [];
  paisCargado = "";
  paginaActual = 1;

  if (region) {
    region.innerHTML = '<option value="">Todas las regiones</option>';
    region.disabled = true;
  }

  if (ciudad) {
    ciudad.innerHTML = '<option value="">Todas las ciudades</option>';
    ciudad.disabled = true;
  }

  if (!pais) {
    if (resultados) {
      resultados.innerHTML =
        '<p class="sin-resultados">Selecciona un país para ver sus talleres.</p>';
    }
    return;
  }

  const archivo = archivosTalleres[pais];

  if (!archivo) {
    if (resultados) {
      resultados.innerHTML =
        '<p class="sin-resultados">Todavía no hay talleres disponibles para este país.</p>';
    }
    return;
  }

  if (resultados) {
    resultados.innerHTML =
      '<p class="contador-resultados">Cargando talleres...</p>';
  }

  try {
    talleres = await cargarJSON(archivo);
    paisCargado = pais;

    talleres = talleres.map(taller => ({
      ...taller,
      tipo: "taller",
      pais: taller.pais || pais
    }));

    cargarRegiones();
    cargarCiudades();
    buscarTalleres();
  } catch (error) {
    console.error("ERROR CARGANDO TALLERES:", error);

    if (resultados) {
      resultados.innerHTML =
        '<p class="sin-resultados">⚠️ No se pudieron cargar los talleres.</p>';
    }
  }
}

function buscarTalleres() {
  const texto = normalizarTexto(
    document.getElementById("buscarTaller")?.value || ""
  );
  const region = document.getElementById("regionTaller")?.value || "";
  const ciudad = document.getElementById("ciudadTaller")?.value || "";

  if (!paisCargado) {
    resultadosActuales = [];
    mostrarPagina();
    return;
  }

  resultadosActuales = talleres.filter(taller => {
    const contenido = normalizarTexto([
      taller.nombre,
      taller.localidad,
      taller.provincia,
      taller.comunidad_autonoma,
      taller.pais,
      taller.descripcion
    ].filter(Boolean).join(" "));

    return (
      (texto === "" || contenido.includes(texto)) &&
      (region === "" || regionDe(taller) === region) &&
      (ciudad === "" || taller.localidad === ciudad)
    );
  });

  resultadosActuales.sort((a, b) =>
    String(a.nombre || "").localeCompare(
      String(b.nombre || ""),
      "es",
      { sensitivity: "base" }
    )
  );

  paginaActual = 1;
  mostrarPagina();
}

function mostrarPagina() {
  const resultados = document.getElementById("resultadosTalleres");
  if (!resultados) return;

  resultados.innerHTML = "";

  if (!paisCargado) {
    resultados.innerHTML =
      '<p class="sin-resultados">Selecciona un país para ver sus talleres.</p>';
    return;
  }

  const total = resultadosActuales.length;
  const totalPaginas = Math.ceil(total / resultadosPorPagina);

  const cabecera = document.createElement("div");
  cabecera.className = "cabecera-resultados";

  const contador = document.createElement("p");
  contador.className = "contador-resultados";
  contador.textContent =
    total === 1 ? "1 taller encontrado" : `${total} talleres encontrados`;
  cabecera.appendChild(contador);

  if (totalPaginas > 1) {
    const paginaInfo = document.createElement("p");
    paginaInfo.className = "pagina-info";
    paginaInfo.textContent = `Página ${paginaActual} de ${totalPaginas}`;
    cabecera.appendChild(paginaInfo);
  }

  resultados.appendChild(cabecera);

  if (total === 0) {
    const mensaje = document.createElement("p");
    mensaje.className = "sin-resultados";
    mensaje.textContent = "No se han encontrado talleres con esos criterios.";
    resultados.appendChild(mensaje);
    return;
  }

  const inicio = (paginaActual - 1) * resultadosPorPagina;
  const fin = inicio + resultadosPorPagina;
  const pagina = resultadosActuales.slice(inicio, fin);

  const listado = document.createElement("div");
  listado.className = "lista-campings";

  pagina.forEach(taller => {
    listado.appendChild(crearFichaTaller(taller));
  });

  resultados.appendChild(listado);

  if (totalPaginas > 1) {
    const paginacion = document.createElement("div");
    paginacion.className = "paginacion";

    const anterior = document.createElement("button");
    anterior.type = "button";
    anterior.textContent = "← Anterior";
    anterior.disabled = paginaActual === 1;
    anterior.addEventListener("click", () => {
      if (paginaActual > 1) {
        paginaActual--;
        mostrarPagina();
        irAResultados();
      }
    });

    const indicador = document.createElement("span");
    indicador.textContent = `${paginaActual} / ${totalPaginas}`;

    const siguiente = document.createElement("button");
    siguiente.type = "button";
    siguiente.textContent = "Siguiente →";
    siguiente.disabled = paginaActual === totalPaginas;
    siguiente.addEventListener("click", () => {
      if (paginaActual < totalPaginas) {
        paginaActual++;
        mostrarPagina();
        irAResultados();
      }
    });

    paginacion.appendChild(anterior);
    paginacion.appendChild(indicador);
    paginacion.appendChild(siguiente);
    resultados.appendChild(paginacion);
  }
}

function crearFichaTaller(taller) {
  const ficha = document.createElement("article");
  ficha.className = "resultado-camping";

  const titulo = document.createElement("h3");
  titulo.textContent = taller.nombre || "Taller";
  ficha.appendChild(titulo);

  const tipo = document.createElement("p");
  tipo.className = "tipo-punto";
  tipo.textContent = "🛠️ Taller";
  ficha.appendChild(tipo);

  const ubicacion = [
    taller.localidad,
    taller.provincia,
    taller.comunidad_autonoma
  ].filter(Boolean);

  if (taller.pais) ubicacion.push(taller.pais);

  const ubicacionUnica = [...new Set(ubicacion)];
  if (ubicacionUnica.length > 0) {
    const zona = document.createElement("p");
    zona.className = "zona-camping";
    zona.textContent = "📌 " + ubicacionUnica.join(" · ");
    ficha.appendChild(zona);
  }

  if (taller.descripcion) {
    const descripcion = document.createElement("p");
    descripcion.className = "descripcion-acampada";
    descripcion.style.whiteSpace = "pre-line";
    descripcion.textContent = taller.descripcion;
    ficha.appendChild(descripcion);
  }

  const enlaces = document.createElement("div");
  enlaces.className = "enlaces-camping";

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
    telefono.href =
      "tel:" + String(taller.telefono).replace(/[^\d+]/g, "");
    telefono.textContent = "☎️ " + taller.telefono;
    enlaces.appendChild(telefono);
  }

  const enlaceMapa = crearEnlaceMapa(taller);
  if (enlaceMapa) {
    const mapa = document.createElement("a");
    mapa.href = enlaceMapa;
    mapa.target = "_blank";
    mapa.rel = "noopener noreferrer";
    mapa.textContent = "🗺️ Ver en el mapa";
    enlaces.appendChild(mapa);
  }

  if (enlaces.children.length > 0) ficha.appendChild(enlaces);

  return ficha;
}

function irAResultados() {
  const resultados = document.getElementById("resultadosTalleres");
  if (resultados) {
    resultados.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const pais = document.getElementById("paisTaller");
  const region = document.getElementById("regionTaller");
  const ciudad = document.getElementById("ciudadTaller");
  const campo = document.getElementById("buscarTaller");
  const boton = document.getElementById("botonBuscarTaller");

  if (pais) pais.addEventListener("change", cambiarPais);

  if (region) {
    region.addEventListener("change", () => {
      if (ciudad) ciudad.value = "";
      cargarCiudades();
      buscarTalleres();
    });
  }

  if (ciudad) ciudad.addEventListener("change", buscarTalleres);
  if (boton) boton.addEventListener("click", buscarTalleres);

  if (campo) {
    campo.addEventListener("keydown", event => {
      if (event.key === "Enter") buscarTalleres();
    });
  }

  const resultados = document.getElementById("resultadosTalleres");

  if (pais) {
    pais.value = "España";
  }

  if (resultados) {
    resultados.innerHTML =
      '<p class="contador-resultados">🇪🇸 España seleccionada por defecto. Puedes cambiar de país en el desplegable.</p>';
  }

  cambiarPais();
});
