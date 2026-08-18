// ==========================================
// CAMPINGS & ÁREAS
// CAMPINGS
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
// COMPROBAR ACCESIBILIDAD
// ==========================================

function campingAccesible(camping) {

  return (
    camping.accesibilidad &&
    camping.accesibilidad.confirmada === true
  );
}


// ==========================================
// CARGAR COMUNIDADES
// ==========================================

function cargarComunidades() {

  const selector =
    document.getElementById(
      "comunidadCamping"
    );

  if (!selector) {
    return;
  }

  const valorActual =
    selector.value;

  selector.innerHTML =
    '<option value="">Todas las comunidades</option>';


  const comunidades = [

    ...new Set(

      campings

        .map(camping =>
          camping.comunidad_autonoma
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


  const comunidad =
    document.getElementById(
      "comunidadCamping"
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


      const coincideComunidad =
        comunidad === "" ||
        camping.comunidad_autonoma ===
          comunidad;


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
        coincideComunidad &&
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
  // RESULTADOS DE LA PÁGINA
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
// CREAR FICHA DE CAMPING
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
  // CAMPING CERRADO
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
    camping.comunidad_autonoma

  ].filter(Boolean);


  if (
    camping.pais &&
    camping.pais !== "España"
  ) {

    ubicacion.push(
      camping.pais
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
  // DETALLES DE ACCESIBILIDAD
  // ========================================

  if (
    campingAccesible(
      camping
    )
  ) {

    const acceso =
      camping.accesibilidad;


    const bloqueAccesibilidad =
      document.createElement(
        "div"
      );

    bloqueAccesibilidad.className =
      "accesibilidad-camping";


    const tituloAccesibilidad =
      document.createElement(
        "p"
      );

    tituloAccesibilidad.className =
      "tipo-punto";

    tituloAccesibilidad.textContent =
      "♿ Accesibilidad para personas con movilidad reducida";


    bloqueAccesibilidad.appendChild(
      tituloAccesibilidad
    );


    // SANITARIOS

    if (
      acceso.sanitarios_adaptados === true
    ) {

      const dato =
        document.createElement(
          "p"
        );

      dato.textContent =
        "🚿 Sanitarios adaptados";

      bloqueAccesibilidad.appendChild(
        dato
      );
    }


    // PARCELAS

    if (
      acceso.parcelas_accesibles === true
    ) {

      const dato =
        document.createElement(
          "p"
        );

      dato.textContent =
        "🚐 Parcelas accesibles";

      bloqueAccesibilidad.appendChild(
        dato
      );
    }


    // INSTALACIONES

    if (
      acceso.instalaciones_accesibles === true
    ) {

      const dato =
        document.createElement(
          "p"
        );

      dato.textContent =
        "🏢 Instalaciones accesibles";

      bloqueAccesibilidad.appendChild(
        dato
      );
    }


    // CAMINOS

    if (
      acceso.caminos_accesibles === true
    ) {

      const dato =
        document.createElement(
          "p"
        );

      dato.textContent =
        "🦽 Recorridos accesibles";

      bloqueAccesibilidad.appendChild(
        dato
      );
    }


    // ALOJAMIENTOS

    if (
      acceso.alojamiento_adaptado === true
    ) {

      const dato =
        document.createElement(
          "p"
        );

      dato.textContent =
        "🏠 Alojamiento adaptado";

      bloqueAccesibilidad.appendChild(
        dato
      );
    }


    // PISCINA

    if (
      acceso.piscina_accesible === true
    ) {

      const dato =
        document.createElement(
          "p"
        );

      dato.textContent =
        "🏊 Piscina accesible";

      bloqueAccesibilidad.appendChild(
        dato
      );
    }


    // OBSERVACIONES

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

      bloqueAccesibilidad.appendChild(
        observaciones
      );
    }


    ficha.appendChild(
      bloqueAccesibilidad
    );
  }


  // ========================================
  // ENLACES Y CONTACTO
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
// LIMPIAR FILTROS
// ==========================================

function limpiarFiltros() {

  const campo =
    document.getElementById(
      "buscarCamping"
    );

  const comunidad =
    document.getElementById(
      "comunidadCamping"
    );


  if (campo) {
    campo.value = "";
  }


  if (comunidad) {
    comunidad.value = "";
  }


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


  buscarCampings();
}


// ==========================================
// SCROLL A RESULTADOS
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


    const comunidad =
      document.getElementById(
        "comunidadCamping"
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
    // COMUNIDAD
    // ======================================

    if (comunidad) {

      comunidad.addEventListener(
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
    // LIMPIAR FILTROS
    // ======================================

    if (limpiar) {

      limpiar.addEventListener(
        "click",
        limpiarFiltros
      );
    }


    // ======================================
    // CARGAR BASE V4
    // ======================================

    try {

      campings =
        await cargarJSON(
          "campings-espana-v4-definitivo.json?v=1"
        );


      console.log(
        "🏕️ Campings cargados:",
        campings.length
      );


      console.log(
        "♿ Campings con accesibilidad confirmada:",
        campings.filter(
          camping =>
            campingAccesible(
              camping
            )
        ).length
      );


      cargarComunidades();

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
