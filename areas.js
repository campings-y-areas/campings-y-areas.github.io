// ==========================================
// CAMPINGS & ÁREAS
// ÁREAS + PARKINGS INTERNACIONAL
// ESPAÑA + ITALIA
// ==========================================

let puntos = [];
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
// NORMALIZAR PUNTO
// ==========================================

function normalizarPunto(punto) {

  return {

    ...punto,

    region:
      punto.region ||
      punto.comunidad_autonoma ||
      null

  };
}


// ==========================================
// MAPA
// ==========================================

function crearEnlaceMapa(punto) {

  if (punto.google_maps) {
    return normalizarUrl(
      punto.google_maps
    );
  }

  if (
    punto.lat !== null &&
    punto.lat !== undefined &&
    punto.lon !== null &&
    punto.lon !== undefined
  ) {

    return (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(
        `${punto.lat},${punto.lon}`
      )
    );
  }


  const consulta = [

    punto.nombre,
    punto.localidad,
    punto.provincia,
    punto.region,
    punto.pais

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
      'input[name="tipoArea"]:checked'
    );

  return seleccionado
    ? seleccionado.value
    : "area";
}


// ==========================================
// PAÍS SELECCIONADO
// ==========================================

function obtenerPaisSeleccionado() {

  return (
    document.getElementById(
      "paisArea"
    )?.value || ""
  );
}


// ==========================================
// CARGAR REGIONES
// ==========================================

function cargarRegiones() {

  const selector =
    document.getElementById(
      "regionArea"
    );

  if (!selector) {
    return;
  }


  const pais =
    obtenerPaisSeleccionado();


  const valorActual =
    selector.value;


  if (pais === "España") {

    selector.innerHTML =
      '<option value="">Todas las comunidades autónomas</option>';

  }

  else {

    selector.innerHTML =
      '<option value="">Todas las regiones</option>';
  }


  const regiones = [

    ...new Set(

      puntos

        .filter(punto => {

          return (
            pais === "" ||
            punto.pais === pais
          );
        })

        .map(punto =>
          punto.region
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


  regiones.forEach(region => {

    const opcion =
      document.createElement(
        "option"
      );


    opcion.value =
      region;


    opcion.textContent =
      region;


    selector.appendChild(
      opcion
    );
  });


  if (
    regiones.includes(
      valorActual
    )
  ) {

    selector.value =
      valorActual;

  }

  else {

    selector.value = "";
  }
}


// ==========================================
// ACTUALIZAR TÍTULO
// ==========================================

function actualizarTitulo() {

  const tipo =
    obtenerTipoSeleccionado();


  const titulo =
    document.getElementById(
      "tituloAreas"
    );


  const texto =
    document.getElementById(
      "textoAreas"
    );


  if (tipo === "parking") {

    if (titulo) {
      titulo.textContent =
        "🅿️ Parkings";
    }

    if (texto) {
      texto.textContent =
        "Encuentra parkings para tus viajes en autocaravana, caravana o camper.";
    }

  }

  else {

    if (titulo) {
      titulo.textContent =
        "🚐 Áreas";
    }

    if (texto) {
      texto.textContent =
        "Encuentra áreas para autocaravanas, caravanas y campers.";
    }
  }
}


// ==========================================
// BUSCAR
// ==========================================

function buscarPuntos() {

  const campo =
    document.getElementById(
      "buscarArea"
    );


  const texto =
    normalizarTexto(
      campo
        ? campo.value
        : ""
    );


  const tipo =
    obtenerTipoSeleccionado();


  const pais =
    obtenerPaisSeleccionado();


  const region =
    document.getElementById(
      "regionArea"
    )?.value || "";


  const filtroCaravanas =
    document.getElementById(
      "filtroCaravanas"
    )?.checked || false;


  const filtroMascotas =
    document.getElementById(
      "filtroMascotasArea"
    )?.checked || false;


  const filtroElectricidad =
    document.getElementById(
      "filtroElectricidadArea"
    )?.checked || false;


  const filtroAgua =
    document.getElementById(
      "filtroAguaArea"
    )?.checked || false;


  resultadosActuales =
    puntos.filter(punto => {


      const contenido =
        normalizarTexto(
          [

            punto.nombre,
            punto.localidad,
            punto.provincia,
            punto.region,
            punto.comunidad_autonoma,
            punto.direccion,
            punto.descripcion_original,
            punto.pais

          ]
            .filter(Boolean)
            .join(" ")
        );


      const coincideTexto =
        texto === "" ||
        contenido.includes(
          texto
        );


      const coincideTipo =
        punto.tipo === tipo;


      const coincidePais =
        pais === "" ||
        punto.pais === pais;


      const coincideRegion =
        region === "" ||
        punto.region === region;


      const coincideCaravanas =
        !filtroCaravanas ||
        punto.admite_caravanas === true;


      const coincideMascotas =
        !filtroMascotas ||
        punto.mascotas === true;


      const coincideElectricidad =
        !filtroElectricidad ||
        punto.electricidad === true;


      const coincideAgua =
        !filtroAgua ||
        punto.agua === true;


      return (

        coincideTexto &&
        coincideTipo &&
        coincidePais &&
        coincideRegion &&
        coincideCaravanas &&
        coincideMascotas &&
        coincideElectricidad &&
        coincideAgua

      );
    });


  paginaActual = 1;

  actualizarTitulo();

  mostrarPagina();
}


// ==========================================
// MOSTRAR RESULTADOS
// ==========================================

function mostrarPagina() {

  const resultados =
    document.getElementById(
      "resultadosAreas"
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


  const tipo =
    obtenerTipoSeleccionado();


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


  if (tipo === "parking") {

    contador.textContent =
      total === 1
        ? "1 parking encontrado"
        : `${total} parkings encontrados`;

  }

  else {

    contador.textContent =
      total === 1
        ? "1 área encontrada"
        : `${total} áreas encontradas`;
  }


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
      "No se han encontrado resultados con esos criterios.";


    resultados.appendChild(
      mensaje
    );


    return;
  }


  // RESULTADOS DE PÁGINA

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


  pagina.forEach(punto => {

    listado.appendChild(
      crearFichaPunto(
        punto
      )
    );
  });


  resultados.appendChild(
    listado
  );


  // PAGINACIÓN

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

function crearFichaPunto(punto) {

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
    punto.nombre ||
    (
      punto.tipo === "parking"
        ? "Parking"
        : "Área"
    );


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


  tipo.textContent =
    punto.tipo === "parking"
      ? "🅿️ Parking"
      : "🚐 Área";


  ficha.appendChild(
    tipo
  );


  // PAÍS

  const pais =
    document.createElement(
      "p"
    );


  pais.className =
    "tipo-punto";


  if (punto.pais === "España") {

    pais.textContent =
      "🇪🇸 España";

  }

  else if (punto.pais === "Italia") {

    pais.textContent =
      "🇮🇹 Italia";

  }

  else {

    pais.textContent =
      "🌍 " +
      (
        punto.pais ||
        "País no indicado"
      );
  }


  ficha.appendChild(
    pais
  );


  // UBICACIÓN

  const ubicacion = [

    punto.localidad,
    punto.provincia,
    punto.region

  ].filter(Boolean);


  if (ubicacion.length > 0) {

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


  // DIRECCIÓN

  if (punto.direccion) {

    const direccion =
      document.createElement(
        "p"
      );


    direccion.className =
      "descripcion-acampada";


    direccion.textContent =
      punto.direccion;


    ficha.appendChild(
      direccion
    );
  }


  // CARACTERÍSTICAS

  const caracteristicas = [];


  if (
    punto.admite_caravanas === true
  ) {

    caracteristicas.push(
      "🚐 Admite caravanas"
    );
  }


  if (
    punto.mascotas === true
  ) {

    caracteristicas.push(
      "🐕 Admite mascotas"
    );
  }


  if (
    punto.electricidad === true
  ) {

    caracteristicas.push(
      "⚡ Electricidad"
    );
  }


  if (
    punto.agua === true
  ) {

    caracteristicas.push(
      "💧 Agua"
    );
  }


  if (
    punto.aguas_grises === true
  ) {

    caracteristicas.push(
      "🚿 Vaciado de aguas grises"
    );
  }


  if (
    punto.aguas_negras === true
  ) {

    caracteristicas.push(
      "🚽 Vaciado de aguas negras"
    );
  }


  caracteristicas.forEach(texto => {

    const dato =
      document.createElement(
        "p"
      );


    dato.className =
      "tipo-punto";


    dato.textContent =
      texto;


    ficha.appendChild(
      dato
    );
  });


  // ENLACES

  const enlaces =
    document.createElement(
      "div"
    );


  enlaces.className =
    "enlaces-camping";


  if (punto.web) {

    const web =
      document.createElement(
        "a"
      );


    web.href =
      normalizarUrl(
        punto.web
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


  if (punto.telefono) {

    const telefono =
      document.createElement(
        "a"
      );


    telefono.href =
      "tel:" +
      String(
        punto.telefono
      ).replace(
        /[^\d+]/g,
        ""
      );


    telefono.textContent =
      "☎️ " +
      punto.telefono;


    enlaces.appendChild(
      telefono
    );
  }


  const enlaceMapa =
    crearEnlaceMapa(
      punto
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
// CAMBIAR PAÍS
// ==========================================

function cambiarPais() {

  const region =
    document.getElementById(
      "regionArea"
    );


  if (region) {
    region.value = "";
  }


  cargarRegiones();

  buscarPuntos();
}


// ==========================================
// CAMBIAR TIPO
// ==========================================

function cambiarTipo() {

  paginaActual = 1;

  actualizarTitulo();

  buscarPuntos();
}


// ==========================================
// LIMPIAR FILTROS
// ==========================================

function limpiarFiltros() {

  const campo =
    document.getElementById(
      "buscarArea"
    );


  const pais =
    document.getElementById(
      "paisArea"
    );


  const region =
    document.getElementById(
      "regionArea"
    );


  if (campo) {
    campo.value = "";
  }


  if (pais) {
    pais.value = "";
  }


  if (region) {
    region.value = "";
  }


  [
    "filtroCaravanas",
    "filtroMascotasArea",
    "filtroElectricidadArea",
    "filtroAguaArea"
  ].forEach(id => {

    const filtro =
      document.getElementById(id);


    if (filtro) {
      filtro.checked = false;
    }
  });


  const radioArea =
    document.querySelector(
      'input[name="tipoArea"][value="area"]'
    );


  if (radioArea) {
    radioArea.checked = true;
  }


  cargarRegiones();

  actualizarTitulo();

  buscarPuntos();
}


// ==========================================
// SCROLL
// ==========================================

function irAResultados() {

  const resultados =
    document.getElementById(
      "resultadosAreas"
    );


  if (resultados) {

    resultados.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
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
        "buscarArea"
      );


    const boton =
      document.getElementById(
        "botonBuscarArea"
      );


    const pais =
      document.getElementById(
        "paisArea"
      );


    const region =
      document.getElementById(
        "regionArea"
      );


    const limpiar =
      document.getElementById(
        "limpiarFiltrosArea"
      );


    // URL:
    // areas.html?tipo=area
    // areas.html?tipo=parking

    const parametros =
      new URLSearchParams(
        window.location.search
      );


    const tipoUrl =
      parametros.get("tipo");


    if (
      tipoUrl === "area" ||
      tipoUrl === "parking"
    ) {

      const radio =
        document.querySelector(
          `input[name="tipoArea"][value="${tipoUrl}"]`
        );


      if (radio) {
        radio.checked = true;
      }
    }


    // BUSCAR

    if (boton) {

      boton.addEventListener(
        "click",
        buscarPuntos
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

            buscarPuntos();
          }
        }
      );
    }


    // PAÍS

    if (pais) {

      pais.addEventListener(
        "change",
        cambiarPais
      );
    }


    // REGIÓN

    if (region) {

      region.addEventListener(
        "change",
        buscarPuntos
      );
    }


    // TIPO

    document
      .querySelectorAll(
        'input[name="tipoArea"]'
      )
      .forEach(radio => {

        radio.addEventListener(
          "change",
          cambiarTipo
        );
      });


    // FILTROS

    [
      "filtroCaravanas",
      "filtroMascotasArea",
      "filtroElectricidadArea",
      "filtroAguaArea"
    ].forEach(id => {

      const filtro =
        document.getElementById(id);


      if (filtro) {

        filtro.addEventListener(
          "change",
          buscarPuntos
        );
      }
    });


    // LIMPIAR

    if (limpiar) {

      limpiar.addEventListener(
        "click",
        limpiarFiltros
      );
    }


  // ======================================
// CARGAR ESPAÑA + ITALIA + PORTUGAL + FRANCIA + ALEMANIA + SUIZA + AUSTRIA + BÉLGICA + PAÍSES BAJOS + LUXEMBURGO + ANDORRA + ESLOVENIA + CROACIA + SERBIA + BOSNIA Y HERZEGOVINA + MONTENEGRO + MACEDONIA DEL NORTE + ALBANIA + BULGARIA + RUMANÍA + HUNGRÍA + ESLOVAQUIA + CHEQUIA + POLONIA + DINAMARCA + SUECIA + NORUEGA + FINLANDIA + ISLANDIA
// ======================================

try {

  const [
    datosEspana,
    datosItalia,
    datosPortugal,
    datosFrancia,
    datosAlemania,
    datosSuiza,
    datosAustria,
    datosBelgica,
    datosPaisesBajos,
    datosLuxemburgo,
    datosAndorra,
    datosEslovenia,
    datosCroacia,
    datosSerbia,
    datosBosniaHerzegovina,
    datosMontenegro,
    datosMacedoniaNorte,
    datosAlbania,
    datosBulgaria,
    datosRumania,
    datosHungria,
    datosEslovaquia,
    datosChequia,
    datosPolonia,
    datosDinamarca,
    datosSuecia,
    datosNoruega,
    datosFinlandia,
    datosIslandia
  ] = await Promise.all([

    cargarJSON(
      "areas-parkings-espana-v3.json?v=1"
    ),

    cargarJSON(
      "areas-italia-definitivo-v3.json?v=3"
    ),

    cargarJSON(
      "areas-portugal-definitivo.json?v=2"
    ),

    cargarJSON(
      "areas-francia-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-alemania-definitivo.json?v=2"
    ),

    cargarJSON(
      "areas-suiza-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-austria-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-belgica-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-paises-bajos-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-luxemburgo-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-andorra-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-eslovenia-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-croacia-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-serbia-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-bosnia-herzegovina-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-montenegro-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-macedonia-del-norte-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-albania-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-bulgaria-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-rumania-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-hungria-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-eslovaquia-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-chequia-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-polonia-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-dinamarca-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-suecia-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-noruega-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-finlandia-definitivo.json?v=1"
    ),

    cargarJSON(
      "areas-islandia-definitivo.json?v=1"
    )

  ]);
  const espana =
    datosEspana.map(
      normalizarPunto
    );


  const italia =
    datosItalia.map(
      normalizarPunto
    );


  const portugal =
    datosPortugal.map(
      normalizarPunto
    );


  const francia =
    datosFrancia.map(
      normalizarPunto
    );


  const alemania =
    datosAlemania.map(
      normalizarPunto
    );


 const suiza =
  datosSuiza.map(
    normalizarPunto
  );


const austria =
  datosAustria.map(
    normalizarPunto
  );


const belgica =
  datosBelgica.map(
    normalizarPunto
  );


const paisesBajos =
  datosPaisesBajos.map(
    normalizarPunto
  );


const luxemburgo =
  datosLuxemburgo.map(
    normalizarPunto
  );


const andorra =
  datosAndorra.map(
    normalizarPunto
  );


const eslovenia =
  datosEslovenia.map(
    normalizarPunto
  );


const croacia =
  datosCroacia.map(
    normalizarPunto
  );


const serbia =
  datosSerbia.map(
    normalizarPunto
  );


const bosniaHerzegovina =
  datosBosniaHerzegovina.map(
    normalizarPunto
  );


const montenegro =
  datosMontenegro.map(
    normalizarPunto
  );


const macedoniaNorte =
  datosMacedoniaNorte.map(
    normalizarPunto
  );


const albania =
  datosAlbania.map(
    normalizarPunto
  );


const bulgaria =
  datosBulgaria.map(
    normalizarPunto
  );


const rumania =
  datosRumania.map(
    normalizarPunto
  );


const hungria =
  datosHungria.map(
    normalizarPunto
  );


const eslovaquia =
  datosEslovaquia.map(
    normalizarPunto
  );


const chequia =
  datosChequia.map(
    normalizarPunto
  );


const polonia =
  datosPolonia.map(
    normalizarPunto
  );


const dinamarca =
  datosDinamarca.map(
    normalizarPunto
  );


const suecia =
  datosSuecia.map(
    normalizarPunto
  );


const noruega =
  datosNoruega.map(
    normalizarPunto
  );


const finlandia =
  datosFinlandia.map(
    normalizarPunto
  );


const islandia =
  datosIslandia.map(
    normalizarPunto
  );


puntos = [
  ...espana,
  ...italia,
  ...portugal,
  ...francia,
  ...alemania,
  ...suiza,
  ...austria,
  ...belgica,
  ...paisesBajos,
  ...luxemburgo,
  ...andorra,
  ...eslovenia,
  ...croacia,
  ...serbia,
  ...bosniaHerzegovina,
  ...montenegro,
  ...macedoniaNorte,
  ...albania,
  ...bulgaria,
  ...rumania,
  ...hungria,
  ...eslovaquia,
  ...chequia,
  ...polonia,
  ...dinamarca,
  ...suecia,
  ...noruega,
  ...finlandia,
  ...islandia
];

      console.log(
        "🇪🇸 Puntos España:",
        espana.length
      );


      console.log(
        "🇮🇹 Puntos Italia:",
        italia.length
      );


      console.log(
        "🇵🇹 Puntos Portugal:",
        portugal.length
      );


      console.log(
        "🌍 Total:",
        puntos.length
      );


      console.log(
        "🚐 Áreas:",
        puntos.filter(
          punto =>
            punto.tipo === "area"
        ).length
      );


      console.log(
        "🅿️ Parkings:",
        puntos.filter(
          punto =>
            punto.tipo === "parking"
        ).length
      );


      cargarRegiones();

      actualizarTitulo();

      buscarPuntos();

    }

    catch (error) {

      console.error(
        "ERROR CARGANDO ÁREAS/PARKINGS:",
        error
      );


      const resultados =
        document.getElementById(
          "resultadosAreas"
        );


      if (resultados) {

        resultados.innerHTML =
          '<p class="sin-resultados">' +
          '⚠️ No se pudieron cargar las áreas y parkings.' +
          '</p>';
      }
    }

  }
);
