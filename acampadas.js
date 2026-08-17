// ==========================================
// CAMPINGS & ÁREAS
// ZONAS DE ACAMPADAS CONTROLADAS
// ==========================================

let acampadas = [];
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
// CREAR ENLACE GOOGLE MAPS
// ==========================================

function crearEnlaceMapa(zona) {

  if (zona.google_maps) {
    return normalizarUrl(zona.google_maps);
  }

  if (
    zona.lat !== null &&
    zona.lat !== undefined &&
    zona.lon !== null &&
    zona.lon !== undefined
  ) {
    return (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(
        `${zona.lat},${zona.lon}`
      )
    );
  }

  const consulta = [
    zona.nombre,
    zona.localidad,
    zona.provincia
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
      "comunidadAcampada"
    );

  if (!selector) {
    return;
  }


  const comunidades =
    [
      ...new Set(
        acampadas
          .map(zona =>
            zona.comunidad_autonoma
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
// BUSCAR Y FILTRAR
// ==========================================

function buscarAcampadas() {

  const campo =
    document.getElementById(
      "buscarAcampada"
    );

  const texto =
    normalizarTexto(
      campo
        ? campo.value
        : ""
    );


  const comunidad =
    document.getElementById(
      "comunidadAcampada"
    )?.value || "";


  const soloPermiso =
    document.getElementById(
      "filtroPermiso"
    )?.checked || false;


  const soloAbierta =
    document.getElementById(
      "filtroAbierta"
    )?.checked || false;


  resultadosActuales =
    acampadas.filter(zona => {

      const contenido =
        normalizarTexto(
          [
            zona.nombre,
            zona.localidad,
            zona.provincia,
            zona.comunidad_autonoma,
            zona.descripcion_original
          ]
            .filter(Boolean)
            .join(" ")
        );


      const coincideTexto =
        texto === "" ||
        contenido.includes(texto);


      const coincideComunidad =
        comunidad === "" ||
        zona.comunidad_autonoma === comunidad;


      const coincidePermiso =
        !soloPermiso ||
        zona.permiso_necesario === true;


      const coincideAbierta =
        !soloAbierta ||
        zona.estado === "abierta" ||
        zona.estado === "sin_indicacion_de_cierre";


      return (
        coincideTexto &&
        coincideComunidad &&
        coincidePermiso &&
        coincideAbierta
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
      "resultadosAcampadas"
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
      ? "1 zona encontrada"
      : `${total} zonas encontradas`;


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


  if (total === 0) {

    const mensaje =
      document.createElement("p");

    mensaje.className =
      "sin-resultados";

    mensaje.textContent =
      "No se han encontrado zonas con esos criterios.";

    resultados.appendChild(
      mensaje
    );

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


  pagina.forEach(zona => {

    listado.appendChild(
      crearFichaAcampada(zona)
    );

  });


  resultados.appendChild(
    listado
  );


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

function crearFichaAcampada(zona) {

  const ficha =
    document.createElement("article");

  ficha.className =
    "resultado-camping";


  const titulo =
    document.createElement("h3");

  titulo.textContent =
    zona.nombre ||
    "Zona de acampada controlada";

  ficha.appendChild(
    titulo
  );


  const tipo =
    document.createElement("p");

  tipo.className =
    "tipo-punto";

  tipo.textContent =
    "🥾 Zona de acampada controlada";

  ficha.appendChild(
    tipo
  );


  const ubicacion = [
    zona.localidad,
    zona.provincia,
    zona.comunidad_autonoma
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


  const avisos = [];


  if (
    zona.permiso_necesario === true
  ) {

    avisos.push(
      "📋 Requiere permiso o autorización"
    );

  }


  if (
    zona.estado === "cerrada"
  ) {

    avisos.push(
      "🚫 Cerrada según la información disponible"
    );

  }


  if (
    zona.estado === "abierta"
  ) {

    avisos.push(
      "✅ Abierta"
    );

  }


  if (avisos.length > 0) {

    const avisosTexto =
      document.createElement("p");

    avisosTexto.className =
      "caracteristicas";

    avisosTexto.textContent =
      avisos.join(" · ");

    ficha.appendChild(
      avisosTexto
    );

  }


  // DESCRIPCIÓN COMPLETA

  if (zona.descripcion_original) {

    const descripcion =
      document.createElement("p");

    descripcion.className =
      "descripcion-acampada";

    descripcion.style.whiteSpace =
      "pre-line";

    descripcion.textContent =
      zona.descripcion_original;

    ficha.appendChild(
      descripcion
    );

  }


  // ENLACES

  const enlaces =
    document.createElement("div");

  enlaces.className =
    "enlaces-camping";


  if (zona.web) {

    const web =
      document.createElement("a");

    web.href =
      normalizarUrl(
        zona.web
      );

    web.target =
      "_blank";

    web.rel =
      "noopener noreferrer";

    web.textContent =
      zona.permiso_necesario
        ? "📋 Información / Permiso"
        : "🌐 Web";

    enlaces.appendChild(
      web
    );

  }


  if (zona.telefono) {

    const telefono =
      document.createElement("a");

    telefono.href =
      "tel:" +
      zona.telefono.replace(
        /[^\d+]/g,
        ""
      );

    telefono.textContent =
      "☎️ " +
      zona.telefono;

    enlaces.appendChild(
      telefono
    );

  }


  const enlaceMapa =
    crearEnlaceMapa(zona);


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
// SCROLL A RESULTADOS
// ==========================================

function irAResultados() {

  const resultados =
    document.getElementById(
      "resultadosAcampadas"
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
        "buscarAcampada"
      );


    const boton =
      document.getElementById(
        "botonBuscarAcampada"
      );


    const comunidad =
      document.getElementById(
        "comunidadAcampada"
      );


    if (boton) {

      boton.addEventListener(
        "click",
        buscarAcampadas
      );

    }


    if (campo) {

      campo.addEventListener(
        "keydown",
        event => {

          if (
            event.key === "Enter"
          ) {

            buscarAcampadas();

          }

        }
      );

    }


    if (comunidad) {

      comunidad.addEventListener(
        "change",
        buscarAcampadas
      );

    }


    [
      "filtroPermiso",
      "filtroAbierta"
    ]
      .forEach(id => {

        const elemento =
          document.getElementById(id);

        if (elemento) {

          elemento.addEventListener(
            "change",
            buscarAcampadas
          );

        }

      });


    // ======================================
    // CARGAR BASE DE DATOS
    // ======================================

    fetch(
      "zonas-acampadas-controladas-espana-v3.json?v=1"
    )
      .then(response => {

        if (!response.ok) {

          throw new Error(
            "No se pudo cargar la base de zonas de acampadas controladas"
          );

        }

        return response.json();

      })

      .then(data => {

        acampadas = data;

        console.log(
          "Zonas cargadas:",
          acampadas.length
        );

        cargarComunidades();

        buscarAcampadas();

      })

      .catch(error => {

        console.error(
          "Error:",
          error
        );


        const resultados =
          document.getElementById(
            "resultadosAcampadas"
          );


        if (resultados) {

          resultados.innerHTML =
            "<p>No se pudieron cargar las zonas de acampadas controladas.</p>";

        }

      });

  }
);
