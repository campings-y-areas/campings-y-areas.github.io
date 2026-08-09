// ==========================================
// CAMPINGS & ÁREAS
// Buscador + filtros + paginación
// ==========================================

let campings = [];
let resultadosActuales = [];

const resultadosPorPagina = 20;
let paginaActual = 1;


// ==========================================
// CARGAR BASE DE DATOS
// ==========================================

fetch("campings.json?v=2")
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
// Permite buscar con o sin tildes
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
// CREAR ENLACE GOOGLE MAPS
// ==========================================

function crearEnlaceMapa(camping) {

  if (camping.google_maps) {
    return normalizarUrl(camping.google_maps);
  }


  let consulta = [
    camping.nombre,
    camping.localidad,
    camping.provincia,
    camping.direccion
  ]
    .filter(Boolean)
    .join(", ");


  if (
    !consulta &&
    camping.lat !== null &&
    camping.lon !== null
  ) {

    consulta =
      `${camping.lat},${camping.lon}`;

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
// BUSCAR Y FILTRAR CAMPINGS
// ==========================================

function buscarCampings() {

  const campoBusqueda =
    document.getElementById("buscarCamping");

  const campoPais =
    document.getElementById("paisCamping");

  const filtroMascotas =
    document.getElementById("filtroMascotas");

  const filtroTodoAno =
    document.getElementById("filtroTodoAno");

  const filtroPiscina =
    document.getElementById("filtroPiscina");

  const filtroAcuatico =
    document.getElementById("filtroAcuatico");


  const texto =
    normalizarTexto(
      campoBusqueda
        ? campoBusqueda.value
        : ""
    );


  const pais =
    campoPais
      ? campoPais.value
      : "";


  const soloMascotas =
    filtroMascotas
      ? filtroMascotas.checked
      : false;

  const soloTodoAno =
    filtroTodoAno
      ? filtroTodoAno.checked
      : false;

  const soloPiscina =
    filtroPiscina
      ? filtroPiscina.checked
      : false;

  const soloAcuatico =
    filtroAcuatico
      ? filtroAcuatico.checked
      : false;


  resultadosActuales =
    campings.filter(camping => {


      // Ocultar cerrados permanentemente

      if (
        camping.estado ===
        "cerrado_permanentemente"
      ) {
        return false;
      }


      // ----------------------------------
      // BUSCADOR PRINCIPAL
      // ----------------------------------

      const contenido =
        normalizarTexto(
          [
            camping.nombre,
            camping.localidad,
            camping.provincia,
            camping.comunidad_autonoma,
            camping.pais,
            camping.direccion,
            camping.descripcion_original
          ]
            .filter(Boolean)
            .join(" ")
        );


      const coincideTexto =
        texto === "" ||
        contenido.includes(texto);


      // ----------------------------------
      // PAÍS
      // ----------------------------------

      const coincidePais =
        pais === "" ||
        (
          pais === "ES" &&
          normalizarTexto(camping.pais) ===
          "espana"
        );


      // ----------------------------------
      // FILTROS
      // ----------------------------------

      const coincideMascotas =
        !soloMascotas ||
        camping.mascotas === true;


      const coincideTodoAno =
        !soloTodoAno ||
        camping.abierto_todo_ano === true;


      const coincidePiscina =
        !soloPiscina ||
        camping.piscina_climatizada === true;


      const coincideAcuatico =
        !soloAcuatico ||
        camping.parque_acuatico === true;


      return (
        coincideTexto &&
        coincidePais &&
        coincideMascotas &&
        coincideTodoAno &&
        coincidePiscina &&
        coincideAcuatico
      );

    });


  paginaActual = 1;

  mostrarPagina();

}


// ==========================================
// MOSTRAR PÁGINA ACTUAL
// ==========================================

function mostrarPagina() {

  const resultados =
    document.getElementById(
      "resultadosCampings"
    );


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


  // LOCALIZACIÓN

  const ubicacion = [
    camping.localidad,
    camping.provincia,
    camping.comunidad_autonoma
  ]
    .filter(Boolean);


  if (ubicacion.length > 0) {

    const zona =
      document.createElement("p");

    zona.className =
      "zona-camping";

    zona.textContent =
      "📌 " +
      [...new Set(ubicacion)].join(" · ");

    ficha.appendChild(zona);

  }


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


  // MAPA

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
// VOLVER A RESULTADOS
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

    const filtroMascotas =
      document.getElementById(
        "filtroMascotas"
      );

    const filtroTodoAno =
      document.getElementById(
        "filtroTodoAno"
      );

    const filtroPiscina =
      document.getElementById(
        "filtroPiscina"
      );

    const filtroAcuatico =
      document.getElementById(
        "filtroAcuatico"
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


    [
      filtroMascotas,
      filtroTodoAno,
      filtroPiscina,
      filtroAcuatico
    ].forEach(filtro => {

      if (filtro) {

        filtro.addEventListener(
          "change",
          buscarCampings
        );

      }

    });

  }
);
