// ==========================================
// CAMPINGS & ÁREAS
// Buscador de áreas y parkings
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
// LEER TIPO DESDE LA URL
// ==========================================

function aplicarTipoInicial() {
  const parametros =
    new URLSearchParams(window.location.search);

  const tipoInicial =
    parametros.get("tipo");

  if (tipoInicial === "area") {
    const radioArea =
      document.getElementById("tipoArea");

    if (radioArea) {
      radioArea.checked = true;
    }
  }

  if (tipoInicial === "parking") {
    const radioParking =
      document.getElementById("tipoParking");

    if (radioParking) {
      radioParking.checked = true;
    }
  }
}


// ==========================================
// CREAR ENLACE GOOGLE MAPS
// ==========================================

function crearEnlaceMapa(punto) {
  if (punto.google_maps) {
    return normalizarUrl(punto.google_maps);
  }

  let consulta = [
    punto.nombre,
    punto.localidad,
    punto.provincia,
    punto.direccion
  ]
    .filter(Boolean)
    .join(", ");

  if (
    !consulta &&
    punto.lat !== null &&
    punto.lon !== null
  ) {
    consulta =
      `${punto.lat},${punto.lon}`;
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
// BUSCAR Y FILTRAR
// ==========================================

function buscarPuntos() {
  const campoBusqueda =
    document.getElementById("buscarArea");

  const texto =
    normalizarTexto(
      campoBusqueda
        ? campoBusqueda.value
        : ""
    );

  const tipoSeleccionado =
    document.querySelector(
      'input[name="tipoPunto"]:checked'
    );

  const tipo =
    tipoSeleccionado
      ? tipoSeleccionado.value
      : "";

  const soloAdmite =
    document.getElementById("filtroAdmiteCaravanas")?.checked || false;

  const soloNoAdmite =
    document.getElementById("filtroNoAdmiteCaravanas")?.checked || false;

  const soloPernocta =
    document.getElementById("filtroPernocta")?.checked || false;

  const soloAgua =
    document.getElementById("filtroAgua")?.checked || false;

  const soloVaciado =
    document.getElementById("filtroVaciado")?.checked || false;

  const soloElectricidad =
    document.getElementById("filtroElectricidad")?.checked || false;

  const soloMascotas =
    document.getElementById("filtroMascotasArea")?.checked || false;

  const soloSinServicios =
    document.getElementById("filtroSinServicios")?.checked || false;


  resultadosActuales =
    puntos.filter(punto => {

      const nombre =
        normalizarTexto(punto.nombre);

      const localidad =
        normalizarTexto(punto.localidad);

      const provincia =
        normalizarTexto(punto.provincia);

      const comunidad =
        normalizarTexto(punto.comunidad_autonoma);

      const pais =
        normalizarTexto(punto.pais);

      const direccion =
        normalizarTexto(punto.direccion);

      const descripcion =
        normalizarTexto(punto.descripcion_original);


      const coincideTexto =
        texto === "" ||
        nombre.includes(texto) ||
        localidad.includes(texto) ||
        provincia.includes(texto) ||
        comunidad.includes(texto) ||
        pais.includes(texto) ||
        direccion.includes(texto) ||
        descripcion.includes(texto);


      const coincideTipo =
        tipo === "" ||
        punto.tipo === tipo;


      const coincideAdmite =
        !soloAdmite ||
        punto.admite_caravanas === true;


      const coincideNoAdmite =
        !soloNoAdmite ||
        punto.admite_caravanas === false;


      const coincidePernocta =
        !soloPernocta ||
        punto.permite_pernocta === true;


      const coincideAgua =
        !soloAgua ||
        punto.agua === true;


      const coincideVaciado =
        !soloVaciado ||
        punto.vaciado_aguas === true;


      const coincideElectricidad =
        !soloElectricidad ||
        punto.electricidad === true;


      const coincideMascotas =
        !soloMascotas ||
        punto.mascotas === true;


      const coincideSinServicios =
        !soloSinServicios ||
        punto.sin_servicios === true;


      return (
        coincideTexto &&
        coincideTipo &&
        coincideAdmite &&
        coincideNoAdmite &&
        coincidePernocta &&
        coincideAgua &&
        coincideVaciado &&
        coincideElectricidad &&
        coincideMascotas &&
        coincideSinServicios
      );
    });


  paginaActual = 1;

  mostrarPagina();
}


// ==========================================
// MOSTRAR PÁGINA
// ==========================================

function mostrarPagina() {
  const resultados =
    document.getElementById("resultadosAreas");

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
      ? "1 resultado encontrado"
      : `${totalResultados} resultados encontrados`;

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


  if (totalResultados === 0) {
    const mensaje =
      document.createElement("p");

    mensaje.className =
      "sin-resultados";

    mensaje.textContent =
      "No se han encontrado resultados con esos criterios.";

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


  pagina.forEach(punto => {
    listado.appendChild(
      crearFichaPunto(punto)
    );
  });


  resultados.appendChild(listado);


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
// CREAR FICHA
// ==========================================

function crearFichaPunto(punto) {
  const ficha =
    document.createElement("article");

  ficha.className =
    "resultado-camping";


  const titulo =
    document.createElement("h3");

  titulo.textContent =
    punto.nombre || "Punto";

  ficha.appendChild(titulo);


  const tipo =
    document.createElement("p");

  tipo.className =
    "tipo-punto";

  tipo.textContent =
    punto.tipo === "parking"
      ? "🅿️ Parking"
      : "🚐 Área";

  ficha.appendChild(tipo);


  const ubicacion = [
    punto.localidad,
    punto.provincia,
    punto.comunidad_autonoma
  ]
    .filter(Boolean);


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


  if (punto.direccion) {
    const direccion =
      document.createElement("p");

    direccion.className =
      "direccion";

    direccion.textContent =
      "📍 " + punto.direccion;

    ficha.appendChild(direccion);
  }


  const caracteristicas = [];


  if (punto.tipo === "area") {
    if (punto.admite_caravanas === true) {
      caracteristicas.push(
        "🔴 Admite caravanas"
      );
    }

    if (punto.admite_caravanas === false) {
      caracteristicas.push(
        "🔵 No admite caravanas"
      );
    }
  }


  if (punto.tipo === "parking") {
    if (punto.permite_pernocta === true) {
      caracteristicas.push(
        "🌙 Permite pernocta"
      );
    }

    if (punto.permite_pernocta === false) {
      caracteristicas.push(
        "🚫 No permite pernocta"
      );
    }
  }


  if (punto.agua) {
    caracteristicas.push(
      "🚰 Agua"
    );
  }


  if (punto.vaciado_aguas) {
    caracteristicas.push(
      "💧 Vaciado"
    );
  }


  if (punto.electricidad) {
    caracteristicas.push(
      "⚡ Electricidad"
    );
  }


  if (punto.mascotas === true) {
    caracteristicas.push(
      "🐕 Admite mascotas"
    );
  }


  if (punto.sin_servicios) {
    caracteristicas.push(
      "🚫 Sin servicios"
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


  const enlaces =
    document.createElement("div");

  enlaces.className =
    "enlaces-camping";


  if (punto.web) {
    const web =
      document.createElement("a");

    web.href =
      normalizarUrl(punto.web);

    web.target =
      "_blank";

    web.rel =
      "noopener noreferrer";

    web.textContent =
      "🌐 Web";

    enlaces.appendChild(web);
  }


  if (punto.telefono) {
    const telefono =
      document.createElement("a");

    telefono.href =
      "tel:" +
      punto.telefono.replace(
        /[^\d+]/g,
        ""
      );

    telefono.textContent =
      "☎️ " + punto.telefono;

    enlaces.appendChild(telefono);
  }


  const enlaceMapa =
    crearEnlaceMapa(punto);


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
// CAMBIAR ÁREAS / PARKINGS DESDE EL MENÚ
// ==========================================
// ==========================================
// ACTUALIZAR TEXTOS SEGÚN ÁREAS / PARKINGS
// ==========================================

function actualizarTextosTipo() {

  const tipoSeleccionado =
    document.querySelector(
      'input[name="tipoPunto"]:checked'
    );

  const tipo =
    tipoSeleccionado
      ? tipoSeleccionado.value
      : "";

  const titulo =
    document.querySelector(
      ".bienvenida h2"
    );

  const descripcion =
    document.querySelector(
      ".bienvenida p:not(.estado)"
    );

  const estado =
    document.querySelector(
      ".bienvenida .estado"
    );

  const tituloBuscador =
    document.querySelector(
      ".buscador h2"
    );


  // ÁREAS

  if (tipo === "area") {

    if (titulo) {
      titulo.textContent =
        "🚐 Áreas";
    }

    if (descripcion) {
      descripcion.textContent =
        "Encuentra áreas para autocaravanas, caravanas y campers.";
    }

    if (estado) {
      estado.textContent =
        "Busca por nombre, localidad, provincia o comunidad autónoma y filtra por características y servicios.";
    }

    if (tituloBuscador) {
      tituloBuscador.textContent =
        "🔎 Buscar áreas";
    }

    return;
  }


  // PARKINGS

  if (tipo === "parking") {

    if (titulo) {
      titulo.textContent =
        "🅿️ Parkings";
    }

    if (descripcion) {
      descripcion.textContent =
        "Encuentra parkings para estacionamiento y guarda de autocaravanas y caravanas.";
    }

    if (estado) {
      estado.textContent =
        "Busca por nombre, localidad, provincia o comunidad autónoma y filtra por características y servicios.";
    }

    if (tituloBuscador) {
      tituloBuscador.textContent =
        "🔎 Buscar parkings";
    }

    return;
  }


  // TODOS

  if (titulo) {
    titulo.textContent =
      "🚐 Áreas y 🅿️ Parkings";
  }

  if (descripcion) {
    descripcion.textContent =
      "Encuentra áreas para autocaravanas y caravanas, además de parkings para estacionamiento y guarda.";
  }

  if (estado) {
    estado.textContent =
      "Busca por nombre, localidad, provincia o comunidad autónoma y filtra según el tipo de vehículo y los servicios disponibles.";
  }

  if (tituloBuscador) {
    tituloBuscador.textContent =
      "🔎 Buscar áreas y parkings";
  }
}
function cambiarTipoDesdeMenu(tipo) {

  if (tipo === "area") {

    const radioArea =
      document.getElementById("tipoArea");

    if (radioArea) {
      radioArea.checked = true;
    }

  }

  if (tipo === "parking") {

    const radioParking =
      document.getElementById("tipoParking");

    if (radioParking) {
      radioParking.checked = true;
    }

  }

  const nuevaUrl =
    "areas.html?tipo=" + tipo;

  window.history.replaceState(
    {},
    "",
    nuevaUrl
  );

  actualizarTextosTipo();
buscarPuntos();
}
// ==========================================
// INICIALIZACIÓN Y EVENTOS
// ==========================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    // Primero aplicamos el filtro recibido desde la portada
    aplicarTipoInicial();
actualizarTextosTipo();


    const campoBusqueda =
      document.getElementById(
        "buscarArea"
      );


    const boton =
      document.getElementById(
        "botonBuscarArea"
      );


    if (boton) {
      boton.addEventListener(
        "click",
        buscarPuntos
      );
    }


    if (campoBusqueda) {
      campoBusqueda.addEventListener(
        "keydown",
        event => {
          if (event.key === "Enter") {
            buscarPuntos();
          }
        }
      );
    }


    document
      .querySelectorAll(
        'input[name="tipoPunto"]'
      )
      .forEach(radio => {
       radio.addEventListener(
  "change",
  () => {
    actualizarTextosTipo();
    buscarPuntos();
  }
);
      });


    [
      "filtroAdmiteCaravanas",
      "filtroNoAdmiteCaravanas",
      "filtroPernocta",
      "filtroAgua",
      "filtroVaciado",
      "filtroElectricidad",
      "filtroMascotasArea",
      "filtroSinServicios"
    ]
      .forEach(id => {
        const elemento =
          document.getElementById(id);

        if (elemento) {
          elemento.addEventListener(
            "change",
            buscarPuntos
          );
        }
      });


    // Cargar datos después de haber aplicado el tipo inicial

    fetch("areas-parkings-espana-v2.json?v=3")
      .then(response => {

        if (!response.ok) {
          throw new Error(
            "No se pudo cargar la base de áreas y parkings"
          );
        }

        return response.json();

      })

      .then(data => {

        puntos = data;

        console.log(
          "Puntos cargados:",
          puntos.length
        );

        buscarPuntos();

      })

      .catch(error => {

        console.error(
          "Error:",
          error
        );

        const resultados =
          document.getElementById(
            "resultadosAreas"
          );

        if (resultados) {
          resultados.innerHTML =
            "<p>No se pudieron cargar las áreas y parkings.</p>";
        }

      });

  }
);
