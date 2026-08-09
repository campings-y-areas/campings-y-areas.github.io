// ==========================================
// CAMPINGS & ÁREAS
// Buscador + paginación de campings
// ==========================================

let campings = [];
let resultadosActuales = [];

const resultadosPorPagina = 20;
let paginaActual = 1;


// ==========================================
// CARGAR BASE DE DATOS
// ==========================================

fetch("campings.json")
  .then(response => {

    if (!response.ok) {
      throw new Error("No se pudo cargar campings.json");
    }

    return response.json();

  })

  .then(data => {

    campings = data;

    console.log("Campings cargados:", campings.length);

    buscarCampings();

  })

  .catch(error => {

    console.error("Error:", error);

    const resultados =
      document.getElementById("resultadosCampings");

    if (resultados) {
      resultados.innerHTML =
        "<p>No se pudieron cargar los campings.</p>";
    }

  });


// ==========================================
// NORMALIZAR TEXTO
// ==========================================

function normalizarTexto(texto) {

  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

}


// ==========================================
// NORMALIZAR DIRECCIONES WEB
// ==========================================

function normalizarUrl(url) {

  if (!url) {
    return "";
  }

  url = String(url).trim();

  if (
    url.startsWith("http://") ||
    url.startsWith("https://")
  ) {
    return url;
  }

  return "https://" + url;

}


// ==========================================
// CREAR ENLACE DE GOOGLE MAPS
// ==========================================

function crearEnlaceMapa(camping) {

  // Si el KML ya contenía un enlace válido de Google Maps,
  // utilizamos ese primero.

  if (camping.google_maps) {
    return normalizarUrl(camping.google_maps);
  }


  /*
    Si no existe, buscamos el establecimiento
    por nombre y dirección.

    Esto permite que Google intente abrir la
    ficha real del camping y no solamente unas
    coordenadas anónimas.
  */

  let consulta = [
    camping.nombre,
    camping.direccion
  ]
    .filter(Boolean)
    .join(", ");


  // Si no tenemos dirección, añadimos coordenadas.

  if (
    !camping.direccion &&
    camping.lat !== null &&
    camping.lon !== null
  ) {

    consulta = [
      camping.nombre,
      `${camping.lat},${camping.lon}`
    ]
      .filter(Boolean)
      .join(", ");

  }


  if (!consulta) {
    return "";
  }


  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(consulta)
  );

}


// ==========================================
// BUSCAR CAMPINGS
// ==========================================

function buscarCampings() {

  const campoBusqueda =
    document.getElementById("buscarCamping");

  const campoPais =
    document.getElementById("paisCamping");


  const texto = normalizarTexto(
    campoBusqueda ? campoBusqueda.value : ""
  );


  const pais =
    campoPais ? campoPais.value : "";


  resultadosActuales = campings.filter(camping => {

    // No mostrar cerrados permanentemente

    if (
      camping.estado ===
      "cerrado_permanentemente"
    ) {
      return false;
    }


    const contenido = normalizarTexto(
      [
        camping.nombre,
        camping.direccion,
        camping.provincia_texto,
        camping.descripcion_original
      ]
        .filter(Boolean)
        .join(" ")
    );


    const coincideTexto =
      texto === "" ||
      contenido.includes(texto);


    /*
      De momento los datos proceden
      principalmente de España.
    */

    const coincidePais =
      pais === "" ||
      pais === "ES";


    return coincideTexto && coincidePais;

  });


  paginaActual = 1;

  mostrarPagina();

}


// ==========================================
// MOSTRAR PÁGINA ACTUAL
// ==========================================

function mostrarPagina() {

  const resultados =
    document.getElementById("resultadosCampings");

  if (!resultados) {
    return;
  }


  resultados.innerHTML = "";


  const totalResultados =
    resultadosActuales.length;


  const totalPaginas =
    Math.ceil(
      totalResultados /
      resultadosPorPagina
    );


  // CABECERA DE RESULTADOS

  const cabecera =
    document.createElement("div");

  cabecera.className =
    "cabecera-resultados";


  const contador =
    document.createElement("p");

  contador.className =
    "contador-resultados";


  contador.textContent =
    totalResultados === 1
      ? "1 camping encontrado"
      : `${totalResultados} campings encontrados`;


  cabecera.appendChild(contador);


  if (totalPaginas > 1) {

    const paginaInfo =
      document.createElement("p");

    paginaInfo.className =
      "pagina-info";

    paginaInfo.textContent =
      `Página ${paginaActual} de ${totalPaginas}`;

    cabecera.appendChild(paginaInfo);

  }


  resultados.appendChild(cabecera);


  // SIN RESULTADOS

  if (totalResultados === 0) {

    const mensaje =
      document.createElement("p");

    mensaje.className =
      "sin-resultados";

    mensaje.textContent =
      "No se han encontrado campings con esos criterios.";

    resultados.appendChild(mensaje);

    return;

  }


  // REGISTROS DE ESTA PÁGINA

  const inicio =
    (paginaActual - 1) *
    resultadosPorPagina;


  const fin =
    inicio +
    resultadosPorPagina;


  const campingsPagina =
    resultadosActuales.slice(
      inicio,
      fin
    );


  // LISTADO

  const listado =
    document.createElement("div");

  listado.className =
    "lista-campings";


  campingsPagina.forEach(camping => {

    listado.appendChild(
      crearFichaCamping(camping)
    );

  });


  resultados.appendChild(listado);


  // PAGINACIÓN

  if (totalPaginas > 1) {

    const paginacion =
      document.createElement("div");

    paginacion.className =
      "paginacion";


    const anterior =
      document.createElement("button");

    anterior.type = "button";

    anterior.textContent =
      "← Anterior";

    anterior.disabled =
      paginaActual === 1;


    anterior.addEventListener(
      "click",
      () => {

        if (paginaActual > 1) {

          paginaActual--;

          mostrarPagina();

          irAResultados();

        }

      }
    );


    const indicador =
      document.createElement("span");

    indicador.textContent =
      `${paginaActual} / ${totalPaginas}`;


    const siguiente =
      document.createElement("button");

    siguiente.type = "button";

    siguiente.textContent =
      "Siguiente →";

    siguiente.disabled =
      paginaActual === totalPaginas;


    siguiente.addEventListener(
      "click",
      () => {

        if (
          paginaActual <
          totalPaginas
        ) {

          paginaActual++;

          mostrarPagina();

          irAResultados();

        }

      }
    );


    paginacion.appendChild(anterior);
    paginacion.appendChild(indicador);
    paginacion.appendChild(siguiente);

    resultados.appendChild(paginacion);

  }

}


// ==========================================
// CREAR FICHA DE CAMPING
// ==========================================

function crearFichaCamping(camping) {

  const ficha =
    document.createElement("article");

  ficha.className =
    "resultado-camping";


  // NOMBRE

  const titulo =
    document.createElement("h3");

  titulo.textContent =
    camping.nombre || "Camping";

  ficha.appendChild(titulo);


  // DIRECCIÓN

  if (camping.direccion) {

    const direccion =
      document.createElement("p");

    direccion.className =
      "direccion";

    direccion.textContent =
      "📍 " + camping.direccion;

    ficha.appendChild(direccion);

  }


  // CARACTERÍSTICAS

  const caracteristicas = [];


  if (camping.abierto_todo_ano) {

    caracteristicas.push(
      "📅 Abierto todo el año"
    );

  }


  if (camping.piscina_climatizada) {

    caracteristicas.push(
      "🏊 Piscina climatizada/cubierta"
    );

  }


  if (camping.parque_acuatico) {

    caracteristicas.push(
      "🌊 Parque acuático/toboganes"
    );

  }


  if (camping.mascotas === true) {

    caracteristicas.push(
      "🐕 Admite mascotas"
    );

  }


  if (caracteristicas.length > 0) {

    const servicios =
      document.createElement("p");

    servicios.className =
      "caracteristicas";

    servicios.textContent =
      caracteristicas.join(" · ");

    ficha.appendChild(servicios);

  }


  // BOTONES

  const enlaces =
    document.createElement("div");

  enlaces.className =
    "enlaces-camping";


  // WEB

  if (camping.web) {

    const web =
      document.createElement("a");

    web.href =
      normalizarUrl(camping.web);

    web.target =
      "_blank";

    web.rel =
      "noopener noreferrer";

    web.textContent =
      "🌐 Web";

    enlaces.appendChild(web);

  }


  // TELÉFONO

  if (camping.telefono) {

    const telefono =
      document.createElement("a");

    telefono.href =
      "tel:" +
      camping.telefono.replace(
        /[^\d+]/g,
        ""
      );

    telefono.textContent =
      "☎️ " + camping.telefono;

    enlaces.appendChild(telefono);

  }


  // GOOGLE MAPS

  const enlaceMapa =
    crearEnlaceMapa(camping);


  if (enlaceMapa) {

    const mapa =
      document.createElement("a");

    mapa.href =
      enlaceMapa;

    mapa.target =
      "_blank";

    mapa.rel =
      "noopener noreferrer";

    mapa.textContent =
      "🗺️ Ver en el mapa";

    enlaces.appendChild(mapa);

  }


  if (enlaces.children.length > 0) {

    ficha.appendChild(enlaces);

  }


  return ficha;

}


// ==========================================
// VOLVER A LOS RESULTADOS
// ==========================================

function irAResultados() {

  const resultados =
    document.getElementById(
      "resultadosCampings"
    );


  if (resultados) {

    resultados.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }

}


// ==========================================
// EVENTOS
// ==========================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const campoBusqueda =
      document.getElementById(
        "buscarCamping"
      );


    const campoPais =
      document.getElementById(
        "paisCamping"
      );


    const boton =
      document.getElementById(
        "botonBuscarCamping"
      );


    if (boton) {

      boton.addEventListener(
        "click",
        buscarCampings
      );

    }


    if (campoBusqueda) {

      campoBusqueda.addEventListener(
        "keydown",
        event => {

          if (event.key === "Enter") {

            buscarCampings();

          }

        }
      );

    }


    if (campoPais) {

      campoPais.addEventListener(
        "change",
        buscarCampings
      );

    }

  }
);
