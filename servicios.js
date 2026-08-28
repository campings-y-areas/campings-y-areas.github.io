// ==========================================
// CAMPINGS & ÁREAS
// SERVICIOS
// ==========================================

let servicios = [];
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
// CREAR ENLACE DE MAPA
// ==========================================

function crearEnlaceMapa(servicio) {

  if (servicio.google_maps) {

    return normalizarUrl(
      servicio.google_maps
    );
  }

  if (
    servicio.lat !== null &&
    servicio.lat !== undefined &&
    servicio.lon !== null &&
    servicio.lon !== undefined
  ) {

    return (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(
        `${servicio.lat},${servicio.lon}`
      )
    );
  }

  const consulta = [

    servicio.nombre,
    servicio.localidad,
    servicio.provincia,
    servicio.pais

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
// TIPO SELECCIONADO
// ==========================================

function obtenerTipoSeleccionado() {

  const seleccionado =
    document.querySelector(
      'input[name="tipoServicio"]:checked'
    );

  return seleccionado
    ? seleccionado.value
    : "";
}


// ==========================================
// CARGAR COMUNIDADES
// ==========================================

function cargarComunidades() {

  const selector =
    document.getElementById(
      "comunidadServicio"
    );

  if (!selector) {
    return;
  }

  const valorActual =
    selector.value;

  const tipo =
    obtenerTipoSeleccionado();

  selector.innerHTML =
    '<option value="">Todas las comunidades</option>';

  const comunidades = [

    ...new Set(

      servicios

        .filter(servicio =>
          tipo === "" ||
          servicio.tipo === tipo
        )

        .map(servicio =>
          servicio.comunidad_autonoma
        )

        .filter(Boolean)
    )

  ].sort((a, b) =>

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
// BUSCAR SERVICIOS
// ==========================================

function buscarServicios() {

  const campo =
    document.getElementById(
      "buscarServicio"
    );

  const texto =
    normalizarTexto(
      campo
        ? campo.value
        : ""
    );

  const comunidad =
    document.getElementById(
      "comunidadServicio"
    )?.value || "";

  const tipo =
    obtenerTipoSeleccionado();

  resultadosActuales =
    servicios.filter(servicio => {

      const contenido =
        normalizarTexto(
          [

            servicio.nombre,
            servicio.localidad,
            servicio.provincia,
            servicio.comunidad_autonoma,
            servicio.pais,
            servicio.descripcion

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
        servicio.comunidad_autonoma ===
          comunidad;

      const coincideTipo =
        tipo === "" ||
        servicio.tipo === tipo;

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
      "resultadosServicios"
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
      ? "1 servicio encontrado"
      : `${total} servicios encontrados`;

  cabecera.appendChild(
    contador
  );


  if (totalPaginas > 1) {

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

  if (total === 0) {

    const mensaje =
      document.createElement(
        "p"
      );

    mensaje.className =
      "sin-resultados";

    mensaje.textContent =
      "No se han encontrado servicios con esos criterios.";

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

  pagina.forEach(servicio => {

    listado.appendChild(
      crearFichaServicio(
        servicio
      )
    );
  });

  resultados.appendChild(
    listado
  );


  // ========================================
  // PAGINACIÓN
  // ========================================

  if (totalPaginas > 1) {

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

function crearFichaServicio(servicio) {

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
    servicio.nombre ||
    "Servicio";

  ficha.appendChild(
    titulo
  );


  // ========================================
  // TIPO
  // ========================================

  const tipo =
    document.createElement(
      "p"
    );

  tipo.className =
    "tipo-punto";


  if (
    servicio.tipo ===
    "restaurante"
  ) {

    tipo.textContent =
      "🍽️ Restaurante";
  }

  else if (
    servicio.tipo ===
    "ducha"
  ) {

    tipo.textContent =
      "🚿 Ducha";
  }
else if (
    servicio.tipo ===
    "lavadero"
  ) {

    tipo.textContent =
      "🧽 Lavadero de autocaravanas";
  }

  else if (
    servicio.tipo ===
    "lavanderia"
  ) {

    tipo.textContent =
      "🧺 Lavandería";
  }

  else if (
    servicio.tipo ===
    "vaciado_aguas"
  ) {

    tipo.textContent =
      "🚰 Vaciado de aguas";
  }

  else if (
    servicio.tipo ===
    "guarderia_vehiculos_camping"
  ) {

    tipo.textContent =
      "🏠 Guardería de vehículos de camping";
  }

  else {

    tipo.textContent =
      "🔧 Servicio";
  }


  ficha.appendChild(
    tipo
  );


  // ========================================
  // CARACTERÍSTICAS DE GUARDERÍA
  // ========================================

  if (
    servicio.tipo ===
    "guarderia_vehiculos_camping"
  ) {

    if (
      servicio.lavadero === true
    ) {

      const lavadero =
        document.createElement(
          "p"
        );

      lavadero.className =
        "tipo-punto";

      lavadero.textContent =
        "🧽 Dispone de lavadero";

      ficha.appendChild(
        lavadero
      );
    }


    if (
      servicio.larga_estancia_explicita === true
    ) {

      const estancia =
        document.createElement(
          "p"
        );

      estancia.className =
        "tipo-punto";

      estancia.textContent =
        "🅿️ Larga estancia";

      ficha.appendChild(
        estancia
      );
    }


    if (
      servicio.pernocta === false
    ) {

      const pernocta =
        document.createElement(
          "p"
        );

      pernocta.className =
        "tipo-punto";

      pernocta.textContent =
        "🚫 No permite pernocta";

      ficha.appendChild(
        pernocta
      );
    }
  }


  // ========================================
  // UBICACIÓN
  // ========================================

  const ubicacion = [

    servicio.localidad,
    servicio.provincia,
    servicio.comunidad_autonoma

  ].filter(Boolean);


  if (
    servicio.pais &&
    servicio.pais !== "España"
  ) {

    ubicacion.push(
      servicio.pais
    );
  }


  if (
    ubicacion.length > 0
  ) {

    const zona =
      document.createElement(
        "p"
      );

    zona.className =
      "zona-camping";

    zona.textContent =
      "📌 " +
      [...new Set(
        ubicacion
      )]
        .join(" · ");

    ficha.appendChild(
      zona
    );
  }


  // ========================================
  // PRECIO
  // ========================================

  if (servicio.precio) {

    const precio =
      document.createElement(
        "p"
      );

    precio.className =
      "precio-servicio";

    precio.textContent =
      "💶 " +
      servicio.precio;

    ficha.appendChild(
      precio
    );
  }


  // ========================================
  // HORARIO
  // ========================================

  if (servicio.horario) {

    const horario =
      document.createElement(
        "p"
      );

    horario.className =
      "horario-servicio";

    horario.textContent =
      "🕒 " +
      servicio.horario;

    ficha.appendChild(
      horario
    );
  }


  // ========================================
  // DESCRIPCIÓN
  // ========================================

  if (servicio.descripcion) {

    const descripcion =
      document.createElement(
        "p"
      );

    descripcion.className =
      "descripcion-acampada";

    descripcion.style.whiteSpace =
      "pre-line";

    descripcion.textContent =
      servicio.descripcion;

    ficha.appendChild(
      descripcion
    );
  }


  // ========================================
  // ENLACES
  // ========================================

  const enlaces =
    document.createElement(
      "div"
    );

  enlaces.className =
    "enlaces-camping";


  // WEB

  if (servicio.web) {

    const web =
      document.createElement(
        "a"
      );

    web.href =
      normalizarUrl(
        servicio.web
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

  if (servicio.telefono) {

    const telefono =
      document.createElement(
        "a"
      );

    telefono.href =
      "tel:" +
      String(
        servicio.telefono
      ).replace(
        /[^\d+]/g,
        ""
      );

    telefono.textContent =
      "☎️ " +
      servicio.telefono;

    enlaces.appendChild(
      telefono
    );
  }


  // MAPA

  const enlaceMapa =
    crearEnlaceMapa(
      servicio
    );

  if (enlaceMapa) {

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
// SCROLL A RESULTADOS
// ==========================================

function irAResultados() {

  const resultados =
    document.getElementById(
      "resultadosServicios"
    );

  if (resultados) {

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
      "comunidadServicio"
    );

  if (selector) {
    selector.value = "";
  }

  cargarComunidades();

  buscarServicios();
}


// ==========================================
// CARGAR JSON
// ==========================================

async function cargarJSON(archivo) {

  const response =
    await fetch(archivo);

  if (!response.ok) {

    throw new Error(
      `No se pudo cargar ${archivo}`
    );
  }

  const datos =
    await response.json();

  if (!Array.isArray(datos)) {

    throw new Error(
      `${archivo} no contiene una lista válida`
    );
  }

  return datos;
}


// ==========================================
// INICIO
// ==========================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {


    const campo =
      document.getElementById(
        "buscarServicio"
      );

    const boton =
      document.getElementById(
        "botonBuscarServicio"
      );

    const comunidad =
      document.getElementById(
        "comunidadServicio"
      );


    // BOTÓN BUSCAR

    if (boton) {

      boton.addEventListener(
        "click",
        buscarServicios
      );
    }


    // ENTER

    if (campo) {

      campo.addEventListener(
        "keydown",
        event => {

          if (
            event.key ===
            "Enter"
          ) {

            buscarServicios();
          }
        }
      );
    }


    // COMUNIDAD

    if (comunidad) {

      comunidad.addEventListener(
        "change",
        buscarServicios
      );
    }


    // TIPOS

    document
      .querySelectorAll(
        'input[name="tipoServicio"]'
      )
      .forEach(radio => {

        radio.addEventListener(
          "change",
          cambiarCategoria
        );
      });


    // ======================================
    // CARGAR LAS 6 BASES
    // ======================================

    try {

      const [

        restaurantes,
        duchas,
        lavaderos,
        lavanderias,
        vaciadoAguas,
        guarderiasOriginales

      ] = await Promise.all([


        cargarJSON(
          "restaurantes-espana-v2.json?v=2"
        ),


        cargarJSON(
          "duchas-europa-v1.json?v=2"
        ),
        cargarJSON(
          "lavaderos-autocaravanas-v1.json?v=2"
        ),


        cargarJSON(
          "lavanderias-espana-v1.json?v=2"
        ),


        cargarJSON(
          "vaciado-aguas-espana-v1.json?v=2"
        ),


        cargarJSON(
          "guarderias-vehiculos-camping-espana-v1.json?v=2"
        )

      ]);


      // ====================================
      // NORMALIZAR GUARDERÍAS
      //
      // LOS 43 PUNTOS DE ESTE MAPA SON
      // PARKINGS/GUARDERÍAS PARA VEHÍCULOS
      // DE CAMPING.
      // ====================================

      const guarderias =
        guarderiasOriginales.map(
          servicio => ({

            ...servicio,

            tipo:
              "guarderia_vehiculos_camping",

            guarderia_vehiculos_camping:
              true

          })
        );


      // ====================================
      // UNIR TODAS LAS BASES
      // ====================================

      servicios = [

        ...restaurantes,
        ...duchas,
...lavaderos,
        ...lavanderias,
        ...vaciadoAguas,
        ...guarderias

      ];


      console.log(
        "🍽️ Restaurantes:",
        restaurantes.length
      );

      console.log(
        "🚿 Duchas:",
        duchas.length
      );
console.log(
        "🧽 Lavaderos:",
        lavaderos.length
      );

      console.log(
        "🧺 Lavanderías:",
        lavanderias.length
      );

      console.log(
        "🚰 Vaciado de aguas:",
        vaciadoAguas.length
      );

      console.log(
        "🏠 Guarderías de vehículos:",
        guarderias.length
      );

      console.log(
        "🔧 Servicios totales:",
        servicios.length
      );


      cargarComunidades();

      buscarServicios();

    }

    catch (error) {

      console.error(
        "ERROR CARGANDO SERVICIOS:",
        error
      );

      const resultados =
        document.getElementById(
          "resultadosServicios"
        );

      if (resultados) {

        resultados.innerHTML =
          '<p class="sin-resultados">' +
          '⚠️ No se pudieron cargar los servicios.' +
          '</p>';
      }
    }

  }
);
