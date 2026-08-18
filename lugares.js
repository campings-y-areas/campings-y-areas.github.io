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
  if (!url) return "";

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

function crearEnlaceMapa(lugar) {

  if (lugar.google_maps) {
    return normalizarUrl(lugar.google_maps);
  }

  if (
    lugar.lat !== null &&
    lugar.lat !== undefined &&
    lugar.lon !== null &&
    lugar.lon !== undefined
  ) {
    return (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(`${lugar.lat},${lugar.lon}`)
    );
  }

  const consulta = [
    lugar.nombre,
    lugar.localidad,
    lugar.provincia,
    lugar.pais
  ]
    .filter(Boolean)
    .join(", ");

  if (!consulta) return "";

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
      'input[name="tipoLugar"]:checked'
    );

  return seleccionado
    ? seleccionado.value
    : "";
}


// ==========================================
// COMPROBAR TIPO
// ==========================================

function coincideTipoLugar(lugar, tipo) {

  if (!tipo) {
    return true;
  }

  if (tipo === "buceo") {
    return lugar.buceo === true;
  }

  if (tipo === "snorkel_apnea") {
    return (
      lugar.snorkel === true ||
      lugar.apnea === true
    );
  }

  return lugar.tipo === tipo;
}


// ==========================================
// CARGAR COMUNIDADES
// ==========================================

function cargarComunidades() {

  const selector =
    document.getElementById("comunidadLugar");

  if (!selector) return;

  const valorActual = selector.value;
  const tipo = obtenerTipoSeleccionado();

  selector.innerHTML =
    '<option value="">Todas las comunidades</option>';

  const comunidades = [
    ...new Set(
      lugares
        .filter(lugar =>
          coincideTipoLugar(lugar, tipo)
        )
        .map(lugar =>
          lugar.comunidad_autonoma
        )
        .filter(Boolean)
    )
  ].sort((a, b) =>
    a.localeCompare(
      b,
      "es",
      { sensitivity: "base" }
    )
  );

  comunidades.forEach(comunidad => {

    const opcion =
      document.createElement("option");

    opcion.value = comunidad;
    opcion.textContent = comunidad;

    selector.appendChild(opcion);
  });

  if (
    comunidades.includes(valorActual)
  ) {
    selector.value = valorActual;
  }
}


// ==========================================
// BUSCAR LUGARES
// ==========================================

function buscarLugares() {

  const campo =
    document.getElementById("buscarLugar");

  const texto =
    normalizarTexto(
      campo ? campo.value : ""
    );

  const comunidad =
    document.getElementById("comunidadLugar")
      ?.value || "";

  const tipo =
    obtenerTipoSeleccionado();

  resultadosActuales =
    lugares.filter(lugar => {

      const actividades =
        Array.isArray(
          lugar.actividades_mencionadas
        )
          ? lugar.actividades_mencionadas.join(" ")
          : "";

      const tiposBuceo =
        Array.isArray(
          lugar.tipos_buceo
        )
          ? lugar.tipos_buceo.join(" ")
          : "";

      const contenido =
        normalizarTexto(
          [
            lugar.nombre,
            lugar.localidad,
            lugar.provincia,
            lugar.comunidad_autonoma,
            lugar.pais,
            lugar.descripcion,
            actividades,
            tiposBuceo
          ]
            .filter(Boolean)
            .join(" ")
        );

      const coincideTexto =
        texto === "" ||
        contenido.includes(texto);

      const coincideComunidad =
        comunidad === "" ||
        lugar.comunidad_autonoma === comunidad;

      const coincideTipo =
        coincideTipoLugar(lugar, tipo);

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

  if (!resultados) return;

  resultados.innerHTML = "";

  const total =
    resultadosActuales.length;

  const totalPaginas =
    Math.ceil(
      total / resultadosPorPagina
    );

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


  if (total === 0) {

    const mensaje =
      document.createElement("p");

    mensaje.className =
      "sin-resultados";

    mensaje.textContent =
      "No se han encontrado lugares con esos criterios.";

    resultados.appendChild(mensaje);

    return;
  }


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

  resultados.appendChild(listado);


  // ========================================
  // PAGINACIÓN
  // ========================================

  if (totalPaginas > 1) {

    const paginacion =
      document.createElement("div");

    paginacion.className =
      "paginacion";


    const anterior =
      document.createElement("button");

    anterior.type = "button";
    anterior.textContent = "← Anterior";
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
// CREAR FICHA
// ==========================================

function crearFichaLugar(lugar) {

  const ficha =
    document.createElement("article");

  ficha.className =
    "resultado-camping";


  const titulo =
    document.createElement("h3");

  titulo.textContent =
    lugar.nombre || "Lugar";

  ficha.appendChild(titulo);


  // ========================================
  // TIPO
  // ========================================

  const tipo =
    document.createElement("p");

  tipo.className =
    "tipo-punto";


  if (
    lugar.tipo === "playa_canina"
  ) {

    tipo.textContent =
      "🐕 Playa canina";
  }

  else if (
    lugar.tipo ===
    "poza_piscina_natural"
  ) {

    tipo.textContent =
      "💧 Poza o piscina natural";
  }

  else if (
    lugar.buceo === true
  ) {

    tipo.textContent =
      "🤿 Zona de buceo";
  }

  else if (
    lugar.snorkel === true ||
    lugar.apnea === true
  ) {

    tipo.textContent =
      "🥽 Snorkel y apnea";
  }

  else {

    tipo.textContent =
      "📍 Lugar";
  }

  ficha.appendChild(tipo);


  // ========================================
  // ACTIVIDADES MARINAS
  // ========================================

  if (
    lugar.buceo === true ||
    lugar.snorkel === true ||
    lugar.apnea === true
  ) {

    const actividades = [];

    if (lugar.buceo === true) {
      actividades.push("🤿 Buceo");
    }

    if (lugar.snorkel === true) {
      actividades.push("🥽 Snorkel");
    }

    if (lugar.apnea === true) {
      actividades.push("🌊 Apnea");
    }

    const actividad =
      document.createElement("p");

    actividad.className =
      "tipo-punto";

    actividad.textContent =
      actividades.join(" · ");

    ficha.appendChild(actividad);
  }


  // ========================================
  // UBICACIÓN
  // ========================================

  const ubicacion = [
    lugar.localidad,
    lugar.provincia,
    lugar.comunidad_autonoma
  ].filter(Boolean);


  if (
    lugar.pais &&
    lugar.pais !== "España"
  ) {
    ubicacion.push(lugar.pais);
  }


  if (ubicacion.length > 0) {

    const zona =
      document.createElement("p");

    zona.className =
      "zona-camping";

    zona.textContent =
      "📌 " +
      [...new Set(ubicacion)]
        .join(" · ");

    ficha.appendChild(zona);
  }


  // ========================================
  // DESCRIPCIÓN
  // ========================================

  if (lugar.descripcion) {

    const descripcion =
      document.createElement("p");

    descripcion.className =
      "descripcion-acampada";

    descripcion.style.whiteSpace =
      "pre-line";

    descripcion.textContent =
      lugar.descripcion;

    ficha.appendChild(descripcion);
  }


  // ========================================
  // ENLACES
  // ========================================

  const enlaces =
    document.createElement("div");

  enlaces.className =
    "enlaces-camping";


  if (lugar.web) {

    const web =
      document.createElement("a");

    web.href =
      normalizarUrl(lugar.web);

    web.target = "_blank";

    web.rel =
      "noopener noreferrer";

    web.textContent =
      "🌐 Web";

    enlaces.appendChild(web);
  }


  const enlaceMapa =
    crearEnlaceMapa(lugar);


  if (enlaceMapa) {

    const mapa =
      document.createElement("a");

    mapa.href = enlaceMapa;

    mapa.target = "_blank";

    mapa.rel =
      "noopener noreferrer";

    mapa.textContent =
      "🗺️ Ver en el mapa";

    enlaces.appendChild(mapa);
  }


  if (
    enlaces.children.length > 0
  ) {
    ficha.appendChild(enlaces);
  }


  return ficha;
}


// ==========================================
// SCROLL A RESULTADOS
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
// CAMBIO DE CATEGORÍA
// ==========================================

function cambiarCategoria() {

  const selector =
    document.getElementById(
      "comunidadLugar"
    );

  if (selector) {
    selector.value = "";
  }

  cargarComunidades();
  buscarLugares();
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


    // ENTER EN BUSCADOR

    if (campo) {

      campo.addEventListener(
        "keydown",
        event => {

          if (event.key === "Enter") {
            buscarLugares();
          }
        }
      );
    }


    // CAMBIO DE COMUNIDAD

    if (comunidad) {

      comunidad.addEventListener(
        "change",
        buscarLugares
      );
    }


    // CAMBIO DE TIPO

    document
      .querySelectorAll(
        'input[name="tipoLugar"]'
      )
      .forEach(radio => {

        radio.addEventListener(
          "change",
          cambiarCategoria
        );
      });


    // ======================================
    // CARGAR LAS TRES BASES
    // ======================================

    try {

      const [
        playasCaninas,
        pozas,
        zonasMarinas
      ] = await Promise.all([

        cargarJSON(
          "playas-caninas-espana-v2.json?v=2"
        ),

        cargarJSON(
          "pozas-piscinas-naturales-espana-v1.json?v=2"
        ),

        cargarJSON(
          "zonas-buceo-snorkel-espana-v2.json?v=2"
        )

      ]);


      lugares = [
        ...playasCaninas,
        ...pozas,
        ...zonasMarinas
      ];


      console.log(
        "🐕 Playas caninas:",
        playasCaninas.length
      );

      console.log(
        "💧 Pozas y piscinas naturales:",
        pozas.length
      );

      console.log(
        "🤿 Buceo:",
        zonasMarinas.filter(
          lugar =>
            lugar.buceo === true
        ).length
      );

      console.log(
        "🥽 Snorkel y apnea:",
        zonasMarinas.filter(
          lugar =>
            lugar.snorkel === true ||
            lugar.apnea === true
        ).length
      );

      console.log(
        "📍 Total lugares cargados:",
        lugares.length
      );


      cargarComunidades();
      buscarLugares();

    }

    catch (error) {

      console.error(
        "ERROR CARGANDO LUGARES:",
        error
      );

      const resultados =
        document.getElementById(
          "resultadosLugares"
        );

      if (resultados) {

        resultados.innerHTML =
          '<p class="sin-resultados">' +
          '⚠️ No se pudieron cargar los datos de Lugares.' +
          '</p>';
      }
    }

  }
);
