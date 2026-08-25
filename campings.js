// ==========================================
// CAMPINGS & ÁREAS
// CAMPINGS INTERNACIONAL
// ESPAÑA + ITALIA
// ==========================================

let campings = [];
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
// NORMALIZAR CAMPING
// ==========================================

function normalizarCamping(camping) {

  return {

    ...camping,

    region:
      camping.region ||
      camping.comunidad_autonoma ||
      null

  };
}


// ==========================================
// CREAR ENLACE DE MAPA
// ==========================================

function crearEnlaceMapa(camping) {

  if (camping.google_maps) {

    return normalizarUrl(
      camping.google_maps
    );
  }

  if (
    camping.lat !== null &&
    camping.lat !== undefined &&
    camping.lon !== null &&
    camping.lon !== undefined
  ) {

    return (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(
        `${camping.lat},${camping.lon}`
      )
    );
  }


  const consulta = [

    camping.nombre,
    camping.localidad,
    camping.provincia,
    camping.region,
    camping.pais

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
// ACCESIBILIDAD
// ==========================================

function campingAccesible(camping) {

  return (
    camping.accesibilidad &&
    camping.accesibilidad.confirmada === true
  );
}


// ==========================================
// PAÍS SELECCIONADO
// ==========================================

function obtenerPaisSeleccionado() {

  return (
    document.getElementById(
      "paisCamping"
    )?.value || ""
  );
}


// ==========================================
// CARGAR REGIONES
// ==========================================

function cargarRegiones() {

  const selector =
    document.getElementById(
      "regionCamping"
    );

  if (!selector) {
    return;
  }


  const pais =
    obtenerPaisSeleccionado();


  const valorActual =
    selector.value;


  // TEXTO DEL SELECTOR SEGÚN PAÍS

  if (pais === "España") {

    selector.innerHTML =
      '<option value="">Todas las comunidades autónomas</option>';

  }

  else if (pais === "Italia") {

    selector.innerHTML =
      '<option value="">Todas las regiones</option>';

  }

  else {

    selector.innerHTML =
      '<option value="">Todas las regiones</option>';

  }


  const regiones = [

    ...new Set(

      campings

        .filter(camping => {

          return (
            pais === "" ||
            camping.pais === pais
          );

        })

        .map(camping =>
          camping.region
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
// CARGAR PROVINCIAS / CONDADOS
// ==========================================

function cargarProvincias() {

  const selector =
    document.getElementById(
      "provinciaCamping"
    );

  if (!selector) {
    return;
  }


  const pais =
    obtenerPaisSeleccionado();


  const region =
    document.getElementById(
      "regionCamping"
    )?.value || "";


  const valorActual =
    selector.value;


  selector.innerHTML =
    '<option value="">Todas las provincias/condados</option>';


  const provincias = [

    ...new Set(

      campings

        .filter(camping => {

          return (
            (pais === "" || camping.pais === pais) &&
            (region === "" || camping.region === region)
          );
        })

        .map(camping =>
          camping.provincia
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


  provincias.forEach(provincia => {

    const opcion =
      document.createElement(
        "option"
      );

    opcion.value =
      provincia;

    opcion.textContent =
      provincia;

    selector.appendChild(
      opcion
    );
  });


  if (
    provincias.includes(
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
// CARGAR CIUDADES
// ==========================================

function cargarCiudades() {

  const selector =
    document.getElementById(
      "ciudadCamping"
    );

  if (!selector) {
    return;
  }


  const pais =
    obtenerPaisSeleccionado();


  const region =
    document.getElementById(
      "regionCamping"
    )?.value || "";


  const provincia =
    document.getElementById(
      "provinciaCamping"
    )?.value || "";


  const valorActual =
    selector.value;


  selector.innerHTML =
    '<option value="">Todas las ciudades</option>';


  const ciudades = [

    ...new Set(

      campings

        .filter(camping => {

          return (
            (pais === "" || camping.pais === pais) &&
            (region === "" || camping.region === region) &&
            (provincia === "" || camping.provincia === provincia)
          );
        })

        .map(camping =>
          camping.localidad
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


  ciudades.forEach(ciudad => {

    const opcion =
      document.createElement(
        "option"
      );

    opcion.value =
      ciudad;

    opcion.textContent =
      ciudad;

    selector.appendChild(
      opcion
    );
  });


  if (
    ciudades.includes(
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
// BUSCAR CAMPINGS
// ==========================================

function buscarCampings() {

  const campo =
    document.getElementById(
      "buscarCamping"
    );


  const texto =
    normalizarTexto(
      campo
        ? campo.value
        : ""
    );


  const pais =
    obtenerPaisSeleccionado();


 const region =
  document.getElementById(
    "regionCamping"
  )?.value || "";


const provincia =
  document.getElementById(
    "provinciaCamping"
  )?.value || "";


const ciudad =
  document.getElementById(
    "ciudadCamping"
  )?.value || "";


  const filtroMascotas =
    document.getElementById(
      "filtroMascotas"
    )?.checked || false;


  const filtroTodoAno =
    document.getElementById(
      "filtroTodoAno"
    )?.checked || false;


  const filtroPiscina =
    document.getElementById(
      "filtroPiscina"
    )?.checked || false;


  const filtroParqueAcuatico =
    document.getElementById(
      "filtroParqueAcuatico"
    )?.checked || false;


  const filtroAccesibilidad =
    document.getElementById(
      "filtroAccesibilidad"
    )?.checked || false;


  resultadosActuales =
    campings.filter(camping => {


      const contenido =
        normalizarTexto(
          [

            camping.nombre,
            camping.localidad,
            camping.provincia,
            camping.region,
            camping.comunidad_autonoma,
            camping.direccion,
            camping.descripcion_original,
            camping.pais

          ]
            .filter(Boolean)
            .join(" ")
        );


      const coincideTexto =
        texto === "" ||
        contenido.includes(
          texto
        );


      const coincidePais =
        pais === "" ||
        camping.pais === pais;


      const coincideRegion =
        region === "" ||
        camping.region === region;
const coincideProvincia =
  provincia === "" ||
  camping.provincia === provincia;


const coincideCiudad =
  ciudad === "" ||
  camping.localidad === ciudad;

      const coincideMascotas =
        !filtroMascotas ||
        camping.mascotas === true;


      const coincideTodoAno =
        !filtroTodoAno ||
        camping.abierto_todo_ano === true;


      const coincidePiscina =
        !filtroPiscina ||
        camping.piscina_climatizada === true;


      const coincideParque =
        !filtroParqueAcuatico ||
        camping.parque_acuatico === true;


      const coincideAccesibilidad =
        !filtroAccesibilidad ||
        campingAccesible(
          camping
        );


     return (

  coincideTexto &&
  coincidePais &&
  coincideRegion &&
  coincideProvincia &&
  coincideCiudad &&
  coincideMascotas &&
  coincideTodoAno &&
  coincidePiscina &&
  coincideParque &&
  coincideAccesibilidad

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
      "resultadosCampings"
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


  // ========================================
  // CABECERA
  // ========================================

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
      ? "1 camping encontrado"
      : `${total} campings encontrados`;


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


  // ========================================
  // SIN RESULTADOS
  // ========================================

  if (total === 0) {

    const mensaje =
      document.createElement(
        "p"
      );


    mensaje.className =
      "sin-resultados";


    mensaje.textContent =
      "No se han encontrado campings con esos criterios.";


    resultados.appendChild(
      mensaje
    );


    return;
  }


  // ========================================
  // RESULTADOS DE PÁGINA
  // ========================================

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


  pagina.forEach(camping => {

    listado.appendChild(
      crearFichaCamping(
        camping
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

function crearFichaCamping(camping) {

  const ficha =
    document.createElement(
      "article"
    );


  ficha.className =
    "resultado-camping";


  // ========================================
  // NOMBRE
  // ========================================

  const titulo =
    document.createElement(
      "h3"
    );


  titulo.textContent =
    camping.nombre ||
    "Camping";


  ficha.appendChild(
    titulo
  );


  // ========================================
  // PAÍS
  // ========================================

  const pais =
    document.createElement(
      "p"
    );


  pais.className =
    "tipo-punto";


  if (
    camping.pais ===
    "España"
  ) {

    pais.textContent =
      "🇪🇸 España";

  }

  else if (
    camping.pais ===
    "Italia"
  ) {

    pais.textContent =
      "🇮🇹 Italia";

  }

  else {

    pais.textContent =
      "🌍 " +
      (
        camping.pais ||
        "País no indicado"
      );
  }


  ficha.appendChild(
    pais
  );


  // ========================================
  // CERRADO
  // ========================================

  if (
    camping.estado ===
    "cerrado_permanentemente"
  ) {

    const cerrado =
      document.createElement(
        "p"
      );


    cerrado.className =
      "tipo-punto";


    cerrado.textContent =
      "⛔ Cerrado permanentemente";


    ficha.appendChild(
      cerrado
    );
  }


  // ========================================
  // UBICACIÓN
  // ========================================

  const ubicacion = [

    camping.localidad,
    camping.provincia,
    camping.region

  ].filter(Boolean);


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
  // DIRECCIÓN
  // ========================================

  if (camping.direccion) {

    const direccion =
      document.createElement(
        "p"
      );


    direccion.className =
      "descripcion-acampada";


    direccion.textContent =
      camping.direccion;


    ficha.appendChild(
      direccion
    );
  }


  // ========================================
  // CARACTERÍSTICAS
  // ========================================

  const caracteristicas = [];


  if (
    camping.mascotas === true
  ) {

    caracteristicas.push(
      "🐕 Admite mascotas"
    );
  }


  if (
    camping.abierto_todo_ano === true
  ) {

    caracteristicas.push(
      "📅 Abierto todo el año"
    );
  }


  if (
    camping.piscina_climatizada === true
  ) {

    caracteristicas.push(
      "🏊 Piscina climatizada/cubierta"
    );
  }


  if (
    camping.parque_acuatico === true
  ) {

    caracteristicas.push(
      "🌊 Parque acuático/toboganes"
    );
  }


  if (
    campingAccesible(
      camping
    )
  ) {

    caracteristicas.push(
      "♿ Accesibilidad confirmada"
    );
  }


  caracteristicas.forEach(texto => {

    const caracteristica =
      document.createElement(
        "p"
      );


    caracteristica.className =
      "tipo-punto";


    caracteristica.textContent =
      texto;


    ficha.appendChild(
      caracteristica
    );
  });


  // ========================================
  // DETALLES ACCESIBILIDAD
  // ========================================

  if (
    campingAccesible(
      camping
    )
  ) {

    const acceso =
      camping.accesibilidad;


    const bloque =
      document.createElement(
        "div"
      );


    bloque.className =
      "accesibilidad-camping";


    const tituloAcceso =
      document.createElement(
        "p"
      );


    tituloAcceso.className =
      "tipo-punto";


    tituloAcceso.textContent =
      "♿ Accesibilidad para personas con movilidad reducida";


    bloque.appendChild(
      tituloAcceso
    );


    if (
      acceso.sanitarios_adaptados === true
    ) {

      const dato =
        document.createElement("p");

      dato.textContent =
        "🚿 Sanitarios adaptados";

      bloque.appendChild(dato);
    }


    if (
      acceso.parcelas_accesibles === true
    ) {

      const dato =
        document.createElement("p");

      dato.textContent =
        "🚐 Parcelas accesibles";

      bloque.appendChild(dato);
    }


    if (
      acceso.instalaciones_accesibles === true
    ) {

      const dato =
        document.createElement("p");

      dato.textContent =
        "🏢 Instalaciones accesibles";

      bloque.appendChild(dato);
    }


    if (
      acceso.caminos_accesibles === true
    ) {

      const dato =
        document.createElement("p");

      dato.textContent =
        "🦽 Recorridos accesibles";

      bloque.appendChild(dato);
    }


    if (
      acceso.alojamiento_adaptado === true
    ) {

      const dato =
        document.createElement("p");

      dato.textContent =
        "🏠 Alojamiento adaptado";

      bloque.appendChild(dato);
    }


    if (
      acceso.piscina_accesible === true
    ) {

      const dato =
        document.createElement("p");

      dato.textContent =
        "🏊 Piscina accesible";

      bloque.appendChild(dato);
    }


    if (
      acceso.observaciones
    ) {

      const observaciones =
        document.createElement(
          "p"
        );


      observaciones.className =
        "descripcion-acampada";


      observaciones.textContent =
        acceso.observaciones;


      bloque.appendChild(
        observaciones
      );
    }


    ficha.appendChild(
      bloque
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

  if (camping.web) {

    const web =
      document.createElement(
        "a"
      );


    web.href =
      normalizarUrl(
        camping.web
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

  if (camping.telefono) {

    const telefono =
      document.createElement(
        "a"
      );


    telefono.href =
      "tel:" +
      String(
        camping.telefono
      ).replace(
        /[^\d+]/g,
        ""
      );


    telefono.textContent =
      "☎️ " +
      camping.telefono;


    enlaces.appendChild(
      telefono
    );
  }


  // MAPA

  const enlaceMapa =
    crearEnlaceMapa(
      camping
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
// CAMBIO DE PAÍS
// ==========================================

function cambiarPais() {

  const selectorRegion =
    document.getElementById(
      "regionCamping"
    );

  const selectorProvincia =
    document.getElementById(
      "provinciaCamping"
    );

  const selectorCiudad =
    document.getElementById(
      "ciudadCamping"
    );


  if (selectorRegion) {
    selectorRegion.value = "";
  }

  if (selectorProvincia) {
    selectorProvincia.value = "";
  }

  if (selectorCiudad) {
    selectorCiudad.value = "";
  }


  cargarRegiones();

  cargarProvincias();

  cargarCiudades();

  buscarCampings();
}

// ==========================================
// LIMPIAR FILTROS
// ==========================================

function limpiarFiltros() {

  const campo =
    document.getElementById(
      "buscarCamping"
    );

  const pais =
    document.getElementById(
      "paisCamping"
    );

  const region =
    document.getElementById(
      "regionCamping"
    );

  const provincia =
    document.getElementById(
      "provinciaCamping"
    );

  const ciudad =
    document.getElementById(
      "ciudadCamping"
    );


  if (campo) campo.value = "";
  if (pais) pais.value = "";
  if (region) region.value = "";
  if (provincia) provincia.value = "";
  if (ciudad) ciudad.value = "";


  [
    "filtroMascotas",
    "filtroTodoAno",
    "filtroPiscina",
    "filtroParqueAcuatico",
    "filtroAccesibilidad"
  ].forEach(id => {

    const filtro =
      document.getElementById(id);

    if (filtro) {
      filtro.checked = false;
    }
  });


  cargarRegiones();
  cargarProvincias();
  cargarCiudades();
  buscarCampings();
}


// ==========================================
// SCROLL
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
        "buscarCamping"
      );


    const boton =
      document.getElementById(
        "botonBuscarCamping"
      );


    const pais =
      document.getElementById(
        "paisCamping"
      );


    const region =
      document.getElementById(
        "regionCamping"
      );

    const provincia =
      document.getElementById(
        "provinciaCamping"
      );

    const ciudad =
      document.getElementById(
        "ciudadCamping"
      );


    const limpiar =
      document.getElementById(
        "limpiarFiltrosCamping"
      );


    // ======================================
    // BOTÓN BUSCAR
    // ======================================

    if (boton) {

      boton.addEventListener(
        "click",
        buscarCampings
      );
    }


    // ======================================
    // ENTER
    // ======================================

    if (campo) {

      campo.addEventListener(
        "keydown",
        event => {

          if (
            event.key ===
            "Enter"
          ) {

            buscarCampings();
          }
        }
      );
    }


    // ======================================
    // PAÍS
    // ======================================

    if (pais) {

      pais.addEventListener(
        "change",
        cambiarPais
      );
    }


    // ======================================
    // REGIÓN
    // ======================================

    if (region) {

      region.addEventListener(
        "change",
        () => {

          if (provincia) provincia.value = "";
          if (ciudad) ciudad.value = "";

          cargarProvincias();
          cargarCiudades();
          buscarCampings();
        }
      );
    }


    // ======================================
    // PROVINCIA / CONDADO
    // ======================================

    if (provincia) {

      provincia.addEventListener(
        "change",
        () => {

          if (ciudad) ciudad.value = "";

          cargarCiudades();
          buscarCampings();
        }
      );
    }


    // ======================================
    // CIUDAD
    // ======================================

    if (ciudad) {

      ciudad.addEventListener(
        "change",
        buscarCampings
      );
    }


    // ======================================
    // FILTROS
    // ======================================

    [

      "filtroMascotas",
      "filtroTodoAno",
      "filtroPiscina",
      "filtroParqueAcuatico",
      "filtroAccesibilidad"

    ].forEach(id => {

      const filtro =
        document.getElementById(id);


      if (filtro) {

        filtro.addEventListener(
          "change",
          buscarCampings
        );
      }
    });


    // ======================================
    // LIMPIAR
    // ======================================

    if (limpiar) {

      limpiar.addEventListener(
        "click",
        limpiarFiltros
      );
    }


// ======================================
// CARGAR ESPAÑA + ITALIA + PORTUGAL + FRANCIA + ALEMANIA + SUIZA + AUSTRIA + BÉLGICA + PAÍSES BAJOS + LUXEMBURGO + ANDORRA
// ======================================

try {

  const [

    campingsEspana,
    campingsItalia,
    campingsPortugal,
    campingsFrancia,
    campingsAlemania,
    campingsSuiza,
    campingsAustria,
    campingsBelgica,
    campingsPaisesBajos,
    campingsLuxemburgo,
    campingsAndorra

  ] = await Promise.all([


    cargarJSON(
      "campings-espana-definitivo.json?v=1"
    ),


    cargarJSON(
      "campings-italia-definitivo.json?v=1"
    ),


    cargarJSON(
      "campings-portugal-definitivo.json?v=1"
    ),


    cargarJSON(
      "campings-francia-definitivo.json?v=1"
    ),


    cargarJSON(
      "campings-alemania-definitivo.json?v=1"
    ),


    cargarJSON(
      "campings-suiza-definitivo.json?v=2"
    ),


    cargarJSON(
      "campings-austria-definitivo.json?v=1"
    ),


    cargarJSON(
    "campings-belgica-definitivo.json?v=4"
    ),


    cargarJSON(
      "campings-paises-bajos-definitivo.json?v=1"
    ),


    cargarJSON(
      "campings-luxemburgo-definitivo.json?v=1"
    ),

    cargarJSON(
      "campings-andorra-definitivo.json?v=1"
    )

  ]);
      // NORMALIZAR REGIÓN

      const espanaNormalizada =
        campingsEspana.map(
          normalizarCamping
        );


      const italiaNormalizada =
        campingsItalia.map(
          normalizarCamping
        );


            const portugalNormalizado =
        campingsPortugal.map(
          normalizarCamping
        );


           const franciaNormalizada =
        campingsFrancia.map(
          normalizarCamping
        );


     const alemaniaNormalizada =
  campingsAlemania.map(
    normalizarCamping
  );


const suizaNormalizada =
  campingsSuiza.map(
    normalizarCamping
  );


const austriaNormalizada =
  campingsAustria.map(
    normalizarCamping
  );


const belgicaNormalizada =
  campingsBelgica.map(
    normalizarCamping
  );


const paisesBajosNormalizada =
  campingsPaisesBajos.map(
    normalizarCamping
  );


const luxemburgoNormalizado =
  campingsLuxemburgo.map(
    normalizarCamping
  );


const andorraNormalizada =
  campingsAndorra.map(
    normalizarCamping
  );


// UNIR

campings = [

  ...espanaNormalizada,
  ...italiaNormalizada,
  ...portugalNormalizado,
  ...franciaNormalizada,
  ...alemaniaNormalizada,
  ...suizaNormalizada,
  ...austriaNormalizada,
  ...belgicaNormalizada,
  ...paisesBajosNormalizada,
  ...luxemburgoNormalizado,
  ...andorraNormalizada

];


      console.log(
        "🇪🇸 Campings España:",
        espanaNormalizada.length
      );


      console.log(
        "🇮🇹 Campings Italia:",
        italiaNormalizada.length
      );


      console.log(
        "🇵🇹 Campings Portugal:",
        portugalNormalizado.length
      );


      console.log(
        "🌍 Campings totales:",
        campings.length
      );


      console.log(
        "♿ Accesibilidad confirmada:",
        campings.filter(
          camping =>
            campingAccesible(
              camping
            )
        ).length
      );


      cargarRegiones();
      cargarProvincias();
      cargarCiudades();

      buscarCampings();

    }

    catch (error) {

      console.error(
        "ERROR CARGANDO CAMPINGS:",
        error
      );


      const resultados =
        document.getElementById(
          "resultadosCampings"
        );


      if (resultados) {

        resultados.innerHTML =
          '<p class="sin-resultados">' +
          '⚠️ No se pudieron cargar los campings.' +
          '</p>';
      }
    }

  }
);
