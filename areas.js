// ==========================================
// CAMPINGS & ÁREAS
// ÁREAS Y PARKINGS
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
// TIPO INICIAL DESDE LA URL
// ==========================================

function aplicarTipoInicial() {
  const parametros =
    new URLSearchParams(window.location.search);

  const tipo =
    parametros.get("tipo");

  if (tipo === "area") {
    const radio =
      document.getElementById("tipoArea");

    if (radio) {
      radio.checked = true;
    }
  }

  else if (tipo === "parking") {
    const radio =
      document.getElementById("tipoParking");

    if (radio) {
      radio.checked = true;
    }
  }
}


// ==========================================
// TEXTOS DINÁMICOS
// ==========================================

function actualizarTextosTipo() {
  const seleccionado =
    document.querySelector(
      'input[name="tipoPunto"]:checked'
    );

  const tipo =
    seleccionado
      ? seleccionado.value
      : "";

  const titulo =
    document.querySelector(".bienvenida h2");

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


  if (tipo === "area") {
    if (titulo) {
      titulo.textContent = "🚐 Áreas";
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


// ==========================================
// CAMBIO DESDE EL MENÚ
// ==========================================

function cambiarTipoDesdeMenu(tipo) {
  if (tipo === "area") {
    const radio =
      document.getElementById("tipoArea");

    if (radio) {
      radio.checked = true;
    }
  }

  else if (tipo === "parking") {
    const radio =
      document.getElementById("tipoParking");

    if (radio) {
      radio.checked = true;
    }
  }

  window.history.replaceState(
    {},
    "",
    "areas.html?tipo=" + tipo
  );

  actualizarTextosTipo();
  buscarPuntos();
}


// ==========================================
// GOOGLE MAPS
// ==========================================

function crearEnlaceMapa(punto) {
  if (punto.google_maps) {
    return normalizarUrl(
      punto.google_maps
    );
  }

  // Si no hay enlace Maps,
  // usamos coordenadas exactas.

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
    punto.direccion
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
// BUSCAR
// ==========================================

function buscarPuntos() {
  const campo =
    document.getElementById(
      "buscarArea"
    );

  const texto =
    normalizarTexto(
      campo ? campo.value : ""
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
    document.getElementById(
      "filtroAdmiteCaravanas"
    )?.checked || false;

  const soloNoAdmite =
    document.getElementById(
      "filtroNoAdmiteCaravanas"
    )?.checked || false;

  const soloPernocta =
    document.getElementById(
      "filtroPernocta"
    )?.checked || false;

  const soloAgua =
    document.getElementById(
      "filtroAgua"
    )?.checked || false;

  const soloVaciado =
    document.getElementById(
      "filtroVaciado"
    )?.checked || false;

  const soloElectricidad =
    document.getElementById(
      "filtroElectricidad"
    )?.checked || false;

  const soloMascotas =
    document.getElementById(
      "filtroMascotasArea"
    )?.checked || false;

  const soloSinServicios =
    document.getElementById(
      "filtroSinServicios"
    )?.checked || false;


  resultadosActuales =
    puntos.filter(punto => {

      const contenido =
        normalizarTexto(
          [
            punto.nombre,
            punto.localidad,
            punto.provincia,
            punto.comunidad_autonoma,
            punto.pais,
            punto.direccion,
            punto.descripcion_original
          ]
            .filter(Boolean)
            .join(" ")
        );


      const coincideTexto =
        texto === "" ||
        contenido.includes(texto);


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
      ? "1 resultado encontrado"
      : `${total} resultados encontrados`;

  cabecera.appendChild(contador);


  if (totalPaginas > 1) {
    const info =
      document.createElement("p");

    info.className =
      "pagina-info";

    info.textContent =
      `Página ${paginaActual} de ${totalPaginas}`;

    cabecera.appendChild(info);
  }


  resultados.appendChild(cabecera);


  if (total === 0) {
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

    else {
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
// INICIO
// ==========================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    aplicarTipoInicial();
    actualizarTextosTipo();


    const campo =
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


    if (campo) {
      campo.addEventListener(
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


    // CARGAR JSON V3

    fetch(
      "areas-parkings-espana-v3.json?v=1"
    )
      .then(response => {

        if (!response.ok) {
          throw new Error(
            "No se pudo cargar la base de datos"
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

        console.error(error);

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
