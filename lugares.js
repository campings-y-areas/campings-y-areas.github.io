// ==========================================
// CAMPINGS & ÁREAS
// LUGARES
// PLAYAS CANINAS
// ==========================================

let lugares = [];
let resultadosActuales = [];

const resultadosPorPagina = 20;
let paginaActual = 1;


// ==========================================
// NORMALIZAR TEXTO
// ==========================================

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


// ==========================================
// NORMALIZAR URL
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
// ENLACE GOOGLE MAPS
// ==========================================

function crearEnlaceMapa(lugar) {

  if (lugar.google_maps) {
    return normalizarUrl(
      lugar.google_maps
    );
  }

  if (
    lugar.lat !== null &&
    lugar.lat !== undefined &&
    lugar.lon !== null &&
    lugar.lon !== undefined
  ) {

    return (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(
        `${lugar.lat},${lugar.lon}`
      )
    );
  }

  const consulta = [
    lugar.nombre,
    lugar.localidad,
    lugar.provincia
  ]
    .filter(Boolean)
    .join(", ");

  if (!consulta) {
    return "";
  }

  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(consulta)
  );
}


// ==========================================
// CARGAR COMUNIDADES
// ==========================================

function cargarComunidades() {

  const selector =
    document.getElementById(
      "comunidadLugar"
    );

  if (!selector) {
    return;
  }

  const comunidades =
    [
      ...new Set(
        lugares
          .map(lugar =>
            lugar.comunidad_autonoma
          )
          .filter(Boolean)
      )
    ]
      .sort((a, b) =>
        a.localeCompare(
          b,
          "es",
          {
            sensitivity: "base"
          }
        )
      );

  comunidades.forEach(comunidad => {

    const opcion =
      document.createElement("option");

    opcion.value =
      comunidad;

    opcion.textContent =
      comunidad;

    selector.appendChild(opcion);

  });
}


// ==========================================
// BUSCAR
// ==========================================

function buscarLugares() {

  const campo =
    document.getElementById(
      "buscarLugar"
    );

  const texto =
    normalizarTexto(
      campo ? campo.value : ""
    );


  const comunidad =
    document.getElementById(
      "comunidadLugar"
    )?.value || "";


  const tipoSeleccionado =
    document.querySelector(
      'input[name="tipoLugar"]:checked'
    );


  const tipo =
    tipoSeleccionado
      ? tipoSeleccionado.value
      : "";


  resultadosActuales =
    lugares.filter(lugar => {

      const contenido =
        normalizarTexto(
          [
            lugar.nombre,
            lugar.localidad,
            lugar.provincia,
            lugar.comunidad_autonoma,
            lugar.descripcion
          ]
            .filter(Boolean)
            .join(" ")
        );


      const coincideTexto =
        texto === "" ||
        contenido.includes(texto);


      const coincideComunidad =
        comunidad === "" ||
        lugar.comunidad_autonoma ===
          comunidad;


      const coincideTipo =
        tipo === "" ||
        lugar.tipo === tipo;


      return (
        coincideTexto &&
        coincideComunidad &&
        coincideTipo
      );

    });


  paginaActual = 1;

  mostrarPagina();
}


// ==========================================
// MOSTRAR RESULTADOS
// ==========================================

function mostrarPagina() {

  const resultados =
    document.getElementById(
      "resultadosLugares"
    );

  if (!resultados) {
    return;
  }


  resultados.innerHTML = "";


  const total =
    resultadosActuales.length;


  const totalPaginas =
    Math.ceil(
      total /
      resultadosPorPagina
    );


  // CABECERA

  const cabecera =
    document.createElement("div");

  cabecera.className =
    "cabecera-resultados";


  const contador =
    document.createElement("p");

  contador.className =
    "contador-resultados";


  contador.textContent =
    total === 1
      ? "1 lugar encontrado"
      : `${total} lugares encontrados`;


  cabecera.appendChild(
    contador
  );


  if (totalPaginas > 1) {

    const paginaInfo =
      document.createElement("p");

    paginaInfo.className =
      "pagina-info";

    paginaInfo.textContent =
      `Página ${paginaActual} de ${totalPaginas}`;

    cabecera.appendChild(
      paginaInfo
    );
  }


  resultados.appendChild(
    cabecera
  );


  // SIN RESULTADOS

  if (total === 0) {

    const mensaje =
      document.createElement("p");

    mensaje.className =
      "sin-resultados";

    mensaje.textContent =
      "No se han encontrado lugares con esos criterios.";

    resultados.appendChild(
      mensaje
    );

    return;
  }


  // PÁGINA ACTUAL

  const inicio =
    (paginaActual - 1) *
    resultadosPorPagina;


  const fin =
    inicio +
    resultadosPorPagina;


  const pagina =
    resultadosActuales.slice(
      inicio,
      fin
    );


  const listado =
    document.createElement("div");

  listado.className =
    "lista-campings";


  pagina.forEach(lugar => {

    listado.appendChild(
      crearFichaLugar(lugar)
    );

  });


  resultados.appendChild(
    listado
  );


  // PAGINACIÓN

  if (totalPaginas > 1) {

    const paginacion =
      document.createElement("div");

    paginacion.className =
      "paginacion";


    const anterior =
      document.createElement("button");

    anterior.type =
      "button";

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

    siguiente.type =
      "button";

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


    paginacion.appendChild(
      anterior
    );

    paginacion.appendChild(
      indicador
    );

    paginacion.appendChild(
      siguiente
    );


    resultados.appendChild(
      paginacion
    );
  }
}


// ==========================================
// CREAR FICHA
// ==========================================

function crearFichaLugar(lugar) {

  const ficha =
    document.createElement("article");

  ficha.className =
    "resultado-camping";


  // NOMBRE

  const titulo =
    document.createElement("h3");

  titulo.textContent =
    lugar.nombre ||
    "Playa canina";

  ficha.appendChild(
    titulo
  );


  // TIPO

  const tipo =
    document.createElement("p");

  tipo.className =
    "tipo-punto";

  tipo.textContent =
    "🐕 Playa canina";

  ficha.appendChild(
    tipo
  );


  // UBICACIÓN

  const ubicacion = [
    lugar.localidad,
    lugar.provincia,
    lugar.comunidad_autonoma
  ]
    .filter(Boolean);


  if (ubicacion.length > 0) {

    const zonaTexto =
      document.createElement("p");

    zonaTexto.className =
      "zona-camping";

    zonaTexto.textContent =
      "📌 " +
      [...new Set(ubicacion)]
        .join(" · ");

    ficha.appendChild(
      zonaTexto
    );
  }


  // MASCOTAS

  if (
    lugar.admite_mascotas === true
  ) {

    const mascotas =
      document.createElement("p");

    mascotas.className =
      "caracteristicas";

    mascotas.textContent =
      "🐕 Admite perros";

    ficha.appendChild(
      mascotas
    );
  }


  // DESCRIPCIÓN

  if (lugar.descripcion) {

    const descripcion =
      document.createElement("p");

    descripcion.className =
      "descripcion-acampada";

    descripcion.style.whiteSpace =
      "pre-line";

    descripcion.textContent =
      lugar.descripcion;

    ficha.appendChild(
      descripcion
    );
  }


  // ENLACES

  const enlaces =
    document.createElement("div");

  enlaces.className =
    "enlaces-camping";


  // WEB

  if (lugar.web) {

    const web =
      document.createElement("a");

    web.href =
      normalizarUrl(
        lugar.web
      );

    web.target =
      "_blank";

    web.rel =
      "noopener noreferrer";

    web.textContent =
      "🌐 Web";

    enlaces.appendChild(
      web
    );
  }


  // MAPA

  const enlaceMapa =
    crearEnlaceMapa(lugar);


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

    enlaces.appendChild(
      mapa
    );
  }


  if (
    enlaces.children.length > 0
  ) {

    ficha.appendChild(
      enlaces
    );
  }


  return ficha;
}


// ==========================================
// SCROLL
// ==========================================

function irAResultados() {

  const resultados =
    document.getElementById(
      "resultadosLugares"
    );


  if (resultados) {

    resultados.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}


// ==========================================
// INICIO
// ==========================================

document.addEventListener(
  "DOMContentLoaded",
  () => {


    const campo =
      document.getElementById(
        "buscarLugar"
      );


    const boton =
      document.getElementById(
        "botonBuscarLugar"
      );


    const comunidad =
      document.getElementById(
        "comunidadLugar"
      );


    // BOTÓN BUSCAR

    if (boton) {

      boton.addEventListener(
        "click",
        buscarLugares
      );
    }


    // ENTER

    if (campo) {

      campo.addEventListener(
        "keydown",
        event => {

          if (
            event.key === "Enter"
          ) {

            buscarLugares();
          }
        }
      );
    }


    // COMUNIDAD

    if (comunidad) {

      comunidad.addEventListener(
        "change",
        buscarLugares
      );
    }


    // TIPOS DE LUGAR

    document
      .querySelectorAll(
        'input[name="tipoLugar"]'
      )
      .forEach(radio => {

        radio.addEventListener(
          "change",
          buscarLugares
        );

      });


    // ======================================
    // CARGAR PLAYAS CANINAS
    // ======================================

    fetch(
      "playas-caninas-espana-v2.json?v=1"
    )
      .then(response => {

        if (!response.ok) {

          throw new Error(
            "No se pudo cargar la base de playas caninas"
          );
        }

        return response.json();
      })

      .then(data => {

        lugares = data;

        console.log(
          "Lugares cargados:",
          lugares.length
        );

        cargarComunidades();

        buscarLugares();
      })

      .catch(error => {

        console.error(
          "Error:",
          error
        );


        const resultados =
          document.getElementById(
            "resultadosLugares"
          );


        if (resultados) {

          resultados.innerHTML =
            "<p>No se pudieron cargar los lugares.</p>";
        }
      });

  }
);
