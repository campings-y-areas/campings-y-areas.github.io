// ==========================================
// CAMPINGS & ÁREAS
// LUGARES
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
// SABER TIPO SELECCIONADO
// ==========================================

function obtenerTipoSeleccionado() {

  const seleccionado =
    document.querySelector(
      'input[name="tipoLugar"]:checked'
    );

  return seleccionado
    ? seleccionado.value
    : "";
}


// ==========================================
// ACTUALIZAR TEXTOS DE LA PÁGINA
// ==========================================

function actualizarTextosTipo() {

  const tipo =
    obtenerTipoSeleccionado();

  const titulo =
    document.querySelector(
      ".bienvenida h2"
    );

  const descripcion =
    document.querySelector(
      ".bienvenida p:not(.estado)"
    );

  const tituloBuscador =
    document.querySelector(
      ".buscador h2"
    );


  if (
    tipo === "playa_canina"
  ) {

    if (titulo) {
      titulo.textContent =
        "🐕 Playas caninas";
    }

    if (descripcion) {
      descripcion.textContent =
        "Encuentra playas y zonas de baño donde está permitida la entrada con perros.";
    }

    if (tituloBuscador) {
      tituloBuscador.textContent =
        "🔎 Buscar playas caninas";
    }

    return;
  }


  if (
    tipo === "poza_piscina_natural"
  ) {

    if (titulo) {
      titulo.textContent =
        "💧 Pozas y piscinas naturales";
    }

    if (descripcion) {
      descripcion.textContent =
        "Descubre pozas, piscinas naturales, zonas de baño fluvial y otros lugares naturales para refrescarte durante tus viajes.";
    }

    if (tituloBuscador) {
      tituloBuscador.textContent =
        "🔎 Buscar pozas y piscinas naturales";
    }

    return;
  }


  if (titulo) {
    titulo.textContent =
      "📍 Lugares";
  }

  if (descripcion) {
    descripcion.textContent =
      "Descubre lugares útiles e interesantes para disfrutar durante tus viajes.";
  }

  if (tituloBuscador) {
    tituloBuscador.textContent =
      "🔎 Buscar lugares";
  }
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


  const valorActual =
    selector.value;


  selector.innerHTML =
    '<option value="">Todas las comunidades</option>';


  const tipo =
    obtenerTipoSeleccionado();


  const comunidades =
    [
      ...new Set(
        lugares
          .filter(lugar =>
            tipo === "" ||
            lugar.tipo === tipo
          )
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
      document.createElement(
        "option"
      );

    opcion.value =
      comunidad;

    opcion.textContent =
      comunidad;

    selector.appendChild(
      opcion
    );

  });


  if (
    comunidades.includes(
      valorActual
    )
  ) {
    selector.value =
      valorActual;
  }
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
      campo
        ? campo.value
        : ""
    );


  const comunidad =
    document.getElementById(
      "comunidadLugar"
    )?.value || "";


  const tipo =
    obtenerTipoSeleccionado();


  resultadosActuales =
    lugares.filter(lugar => {

      const descripcion =
        lugar.descripcion ||
        lugar.descripcion_original ||
        "";


      const contenido =
        normalizarTexto(
          [
            lugar.nombre,
            lugar.localidad,
            lugar.provincia,
            lugar.comunidad_autonoma,
            descripcion
          ]
            .filter(Boolean)
            .join(" ")
        );


      const coincideTexto =
        texto === "" ||
        contenido.includes(
          texto
        );


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
    document.createElement(
      "div"
    );

  cabecera.className =
    "cabecera-resultados";


  const contador =
    document.createElement(
      "p"
    );

  contador.className =
    "contador-resultados";


  contador.textContent =
    total === 1
      ? "1 lugar encontrado"
      : `${total} lugares encontrados`;


  cabecera.appendChild(
    contador
  );


  if (
    totalPaginas > 1
  ) {

    const paginaInfo =
      document.createElement(
        "p"
      );

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

  if (
    total === 0
  ) {

    const mensaje =
      document.createElement(
        "p"
      );

    mensaje.className =
      "sin-resultados";

    mensaje.textContent =
      "No se han encontrado lugares con esos criterios.";

    resultados.appendChild(
      mensaje
    );

    return;
  }


  // RESULTADOS DE LA PÁGINA

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
    document.createElement(
      "div"
    );

  listado.className =
    "lista-campings";


  pagina.forEach(lugar => {

    listado.appendChild(
      crearFichaLugar(
        lugar
      )
    );

  });


  resultados.appendChild(
    listado
  );


  // PAGINACIÓN

  if (
    totalPaginas > 1
  ) {

    const paginacion =
      document.createElement(
        "div"
      );

    paginacion.className =
      "paginacion";


    const anterior =
      document.createElement(
        "button"
      );

    anterior.type =
      "button";

    anterior.textContent =
      "← Anterior";

    anterior.disabled =
      paginaActual === 1;


    anterior.addEventListener(
      "click",
      () => {

        if (
          paginaActual > 1
        ) {

          paginaActual--;

          mostrarPagina();

          irAResultados();
        }
      }
    );


    const indicador =
      document.createElement(
        "span"
      );

    indicador.textContent =
      `${paginaActual} / ${totalPaginas}`;


    const siguiente =
      document.createElement(
        "button"
      );

    siguiente.type =
      "button";

    siguiente.textContent =
      "Siguiente →";

    siguiente.disabled =
      paginaActual ===
      totalPaginas;


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

function crearFichaLugar(
  lugar
) {

  const ficha =
    document.createElement(
      "article"
    );

  ficha.className =
    "resultado-camping";


  // NOMBRE

  const titulo =
    document.createElement(
      "h3"
    );

  titulo.textContent =
    lugar.nombre ||
    "Lugar";

  ficha.appendChild(
    titulo
  );


  // TIPO

  const tipo =
    document.createElement(
      "p"
    );

  tipo.className =
    "tipo-punto";


  if (
    lugar.tipo ===
    "playa_canina"
  ) {

    tipo.textContent =
      "🐕 Playa canina";
  }

  else if (
    lugar.tipo ===
    "poza_piscina_natural"
  ) {

    tipo.textContent =
      "💧 Poza / piscina natural";
  }

  else {

    tipo.textContent =
      "📍 Lugar";
  }


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


  if (
    ubicacion.length > 0
  ) {

    const zonaTexto =
      document.createElement(
        "p"
      );

    zonaTexto.className =
      "zona-camping";

    zonaTexto.textContent =
      "📌 " +
      [...new Set(
        ubicacion
      )]
        .join(" · ");

    ficha.appendChild(
      zonaTexto
    );
  }


  // CARACTERÍSTICAS

  if (
    lugar.tipo ===
      "playa_canina" &&
    lugar.admite_mascotas ===
      true
  ) {

    const mascotas =
      document.createElement(
        "p"
      );

    mascotas.className =
      "caracteristicas";

    mascotas.textContent =
      "🐕 Admite perros";

    ficha.appendChild(
      mascotas
    );
  }


  // DESCRIPCIÓN

  const descripcionLugar =
    lugar.descripcion ||
    lugar.descripcion_original ||
    "";


  if (
    descripcionLugar
  ) {

    const descripcion =
      document.createElement(
        "p"
      );

    descripcion.className =
      "descripcion-acampada";

    descripcion.style.whiteSpace =
      "pre-line";

    descripcion.textContent =
      descripcionLugar;

    ficha.appendChild(
      descripcion
    );
  }


  // ENLACES

  const enlaces =
    document.createElement(
      "div"
    );

  enlaces.className =
    "enlaces-camping";


  // WEB

  if (
    lugar.web
  ) {

    const web =
      document.createElement(
        "a"
      );

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


  // TELÉFONO

  if (
    lugar.telefono
  ) {

    const telefono =
      document.createElement(
        "a"
      );

    telefono.href =
      "tel:" +
      lugar.telefono.replace(
        /[^\d+]/g,
        ""
      );

    telefono.textContent =
      "☎️ " +
      lugar.telefono;

    enlaces.appendChild(
      telefono
    );
  }


  // MAPA

  const enlaceMapa =
    crearEnlaceMapa(
      lugar
    );


  if (
    enlaceMapa
  ) {

    const mapa =
      document.createElement(
        "a"
      );

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


  if (
    resultados
  ) {

    resultados.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}


// ==========================================
// CAMBIO DE CATEGORÍA
// ==========================================

function cambiarCategoria() {

  const selector =
    document.getElementById(
      "comunidadLugar"
    );


  if (
    selector
  ) {
    selector.value = "";
  }


  actualizarTextosTipo();

  cargarComunidades();

  buscarLugares();
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

    if (
      boton
    ) {

      boton.addEventListener(
        "click",
        buscarLugares
      );
    }


    // ENTER

    if (
      campo
    ) {

      campo.addEventListener(
        "keydown",
        event => {

          if (
            event.key ===
            "Enter"
          ) {

            buscarLugares();
          }
        }
      );
    }


    // COMUNIDAD

    if (
      comunidad
    ) {

      comunidad.addEventListener(
        "change",
        buscarLugares
      );
    }


    // CAMBIO PLAYAS / POZAS

    document
      .querySelectorAll(
        'input[name="tipoLugar"]'
      )
      .forEach(
        radio => {

          radio.addEventListener(
            "change",
            cambiarCategoria
          );

        }
      );


    // ======================================
    // CARGAR LAS DOS BASES
    // ======================================

    Promise.all([

      fetch(
        "playas-caninas-espana-v2.json?v=2"
      )
        .then(response => {

          if (
            !response.ok
          ) {
            throw new Error(
              "No se pudo cargar playas caninas"
            );
          }

          return response.json();
        }),


      fetch(
        "pozas-piscinas-naturales-espana-v1.json?v=1"
      )
        .then(response => {

          if (
            !response.ok
          ) {
            throw new Error(
              "No se pudieron cargar las pozas y piscinas naturales"
            );
          }

          return response.json();
        })

    ])

      .then(
        ([playas, pozas]) => {

          lugares = [
            ...playas,
            ...pozas
          ];


          console.log(
            "Playas caninas:",
            playas.length
          );

          console.log(
            "Pozas y piscinas naturales:",
            pozas.length
          );

          console.log(
            "Lugares totales:",
            lugares.length
          );


          actualizarTextosTipo();

          cargarComunidades();

          buscarLugares();
        }
      )

      .catch(
        error => {

          console.error(
            "Error:",
            error
          );


          const resultados =
            document.getElementById(
              "resultadosLugares"
            );


          if (
            resultados
          ) {

            resultados.innerHTML =
              "<p>No se pudieron cargar los lugares.</p>";
          }
        }
      );

  }
);
