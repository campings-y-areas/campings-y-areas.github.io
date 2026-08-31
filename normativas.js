// ==========================================
// CAMPINGS & ÁREAS
// NORMATIVAS
// ==========================================

const archivosNormativas = {
  "España": "normativas-espana-definitivo.json?v=1",
  "Portugal": "normativas-portugal-definitivo.json?v=1",
  "Francia": "normativas-francia-definitivo.json?v=1",
  "Alemania": "normativas-alemania-definitivo.json?v=1",
  "Suiza": "normativas-suiza-definitivo.json?v=1",
  "Austria": "normativas-austria-definitivo.json?v=1",
  "Bélgica": "normativas-belgica-definitivo.json?v=1",
  "Países Bajos": "normativas-paises-bajos-definitivo.json?v=1",
  "Luxemburgo": "normativas-luxemburgo-definitivo.json?v=1",
  "Andorra": "normativas-andorra-definitivo.json?v=1",
  "Italia": "normativas-italia-definitivo.json?v=1",
  "Eslovenia": "normativas-eslovenia-definitivo.json?v=1",
  "Croacia": "normativas-croacia-definitivo.json?v=1",
  "Montenegro": "normativas-montenegro-definitivo.json?v=1",
  "Bosnia y Herzegovina": "normativas-bosnia-y-herzegovina-definitivo.json?v=1",
  "Dinamarca": "normativas-dinamarca-definitivo.json?v=1",
  "Suecia": "normativas-suecia-definitivo.json?v=1",
  "Noruega": "normativas-noruega-definitivo.json?v=1",
  "Finlandia": "normativas-finlandia-definitivo.json?v=1",
  "Islandia": "normativas-islandia-definitivo.json?v=1",
  "Irlanda": "normativas-irlanda-definitivo.json?v=1",
  "Reino Unido": "normativas-reino-unido-definitivo.json?v=1",
  "Polonia": "normativas-polonia-definitivo.json?v=1",
  "República Checa": "normativas-republica-checa-definitivo.json?v=1"
};


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
// CARGAR JSON
// ==========================================

async function cargarJSON(archivo) {

  const response = await fetch(archivo);

  if (!response.ok) {
    throw new Error(
      `No se pudo cargar ${archivo}`
    );
  }

  const datos = await response.json();

  if (!Array.isArray(datos)) {
    throw new Error(
      `${archivo} no contiene una lista válida`
    );
  }

  return datos;
}


// ==========================================
// CREAR BLOQUE
// ==========================================

function crearBloque(titulo, icono, contenido) {

  if (!contenido) return null;

  const bloque =
    document.createElement("article");

  bloque.className =
    "resultado-camping";


  const h3 =
    document.createElement("h3");

  h3.textContent =
    `${icono} ${titulo}`;

  bloque.appendChild(h3);


  if (contenido.estado) {

    const estado =
      document.createElement("p");

    estado.className =
      "tipo-punto";

    estado.textContent =
      `Estado: ${String(contenido.estado).replaceAll("_", " ")}`;

    bloque.appendChild(estado);
  }


  if (contenido.detalle) {

    const detalle =
      document.createElement("p");

    detalle.className =
      "descripcion-acampada";

    detalle.textContent =
      contenido.detalle;

    bloque.appendChild(detalle);
  }


  if (
    Array.isArray(
      contenido.condiciones_practicas
    )
  ) {

    const lista =
      document.createElement("ul");

    contenido.condiciones_practicas
      .forEach(texto => {

        const li =
          document.createElement("li");

        li.textContent = texto;

        lista.appendChild(li);
      });

    bloque.appendChild(lista);
  }


  if (
    Array.isArray(
      contenido.elementos
    )
  ) {

    const lista =
      document.createElement("ul");

    contenido.elementos
      .forEach(texto => {

        const li =
          document.createElement("li");

        li.textContent = texto;

        lista.appendChild(li);
      });

    bloque.appendChild(lista);
  }


  return bloque;
}


// ==========================================
// MOSTRAR NORMATIVA
// ==========================================

function mostrarNormativa(normativa) {

  const resultados =
    document.getElementById(
      "resultadosNormativas"
    );

  if (!resultados) return;

  resultados.innerHTML = "";


  const cabecera =
    document.createElement("article");

  cabecera.className =
    "resultado-camping";


  const titulo =
    document.createElement("h2");

  titulo.textContent =
    `🇪🇸 ${normativa.pais}`;

  cabecera.appendChild(titulo);


  if (normativa.actualizado) {

    const actualizado =
      document.createElement("p");

    actualizado.className =
      "tipo-punto";

    actualizado.textContent =
      `📅 Última comprobación: ${normativa.actualizado}`;

    cabecera.appendChild(actualizado);
  }


  if (normativa.estado_general) {

    const estadoGeneral =
      document.createElement("p");

    estadoGeneral.className =
      "descripcion-acampada";

    estadoGeneral.textContent =
      normativa.estado_general;

    cabecera.appendChild(
      estadoGeneral
    );
  }


  if (normativa.resumen) {

    const resumen =
      document.createElement("p");

    resumen.className =
      "descripcion-acampada";

    resumen.textContent =
      normativa.resumen;

    cabecera.appendChild(
      resumen
    );
  }


  resultados.appendChild(
    cabecera
  );


  const bloques = [

    ["Estacionamiento", "🅿️", normativa.estacionamiento],
    ["Pernocta", "🌙", normativa.pernocta],
    ["Acampada libre", "🏕️", normativa.acampada_libre],
    ["Elementos exteriores", "🪑", normativa.elementos_exteriores],
    ["Costas y playas", "🏖️", normativa.costas_y_playas],
    ["Espacios naturales", "🌲", normativa.espacios_naturales],
    ["Fuego y barbacoas", "🔥", normativa.fuego_y_barbacoa],
    ["Aguas y residuos", "🚰", normativa.aguas_y_residuos],
    ["Límites de permanencia", "⏱️", normativa.limites_de_permanencia],
    ["Multas", "💶", normativa.multas],
    ["Normativa local", "🏛️", normativa.normativa_local]

  ];


  bloques.forEach(
    ([tituloBloque, icono, contenido]) => {

      const bloque =
        crearBloque(
          tituloBloque,
          icono,
          contenido
        );

      if (bloque) {
        resultados.appendChild(
          bloque
        );
      }
    }
  );


  // ========================================
  // CAMBIO NORMATIVO
  // ========================================

  if (
    normativa.cambio_normativo_proximo
  ) {

    const cambio =
      document.createElement("article");

    cambio.className =
      "resultado-camping";


    const h3 =
      document.createElement("h3");

    h3.textContent =
      "📌 Cambio normativo aprobado";

    cambio.appendChild(h3);


    const norma =
      document.createElement("p");

    norma.className =
      "tipo-punto";

    norma.textContent =
      normativa.cambio_normativo_proximo.norma ||
      "";

    cambio.appendChild(norma);


    const fecha =
      document.createElement("p");

    fecha.textContent =
      "Entrada en vigor: " +
      (
        normativa.cambio_normativo_proximo
          .fecha_entrada_vigor || ""
      );

    cambio.appendChild(fecha);


    const detalle =
      document.createElement("p");

    detalle.className =
      "descripcion-acampada";

    detalle.textContent =
      normativa.cambio_normativo_proximo
        .detalle || "";

    cambio.appendChild(detalle);


    resultados.appendChild(
      cambio
    );
  }


  // ========================================
  // INSTRUCCIÓN 08/V-74
  // ========================================

  const antecedente =
    normativa.antecedentes_dgt
      ?.instruccion_08_v_74;

  if (antecedente) {

    const bloque =
      document.createElement("article");

    bloque.className =
      "resultado-camping";


    const h3 =
      document.createElement("h3");

    h3.textContent =
      "📜 Instrucción DGT 08/V-74";

    bloque.appendChild(h3);


    const estado =
      document.createElement("p");

    estado.className =
      "tipo-punto";

    estado.textContent =
      "⚠️ DEROGADA — antecedente histórico";

    bloque.appendChild(estado);


    const detalle =
      document.createElement("p");

    detalle.className =
      "descripcion-acampada";

    detalle.textContent =
      antecedente.detalle || "";

    bloque.appendChild(detalle);


    if (
      antecedente.referencia_vigente_2026
    ) {

      const vigente =
        document.createElement("p");

      vigente.className =
        "tipo-punto";

      vigente.textContent =
        "✅ Referencia vigente: " +
        antecedente.referencia_vigente_2026;

      bloque.appendChild(vigente);
    }


    resultados.appendChild(
      bloque
    );
  }


  // ========================================
  // FUENTES
  // ========================================

  if (
    Array.isArray(normativa.fuentes) &&
    normativa.fuentes.length > 0
  ) {

    const fuentes =
      document.createElement("article");

    fuentes.className =
      "resultado-camping";


    const h3 =
      document.createElement("h3");

    h3.textContent =
      "🔗 Fuentes oficiales y referencias";

    fuentes.appendChild(h3);


    const lista =
      document.createElement("ul");


    normativa.fuentes.forEach(
      fuente => {

        const li =
          document.createElement("li");


        const a =
          document.createElement("a");

        a.href =
          normalizarUrl(
            fuente.url
          );

        a.target =
          "_blank";

        a.rel =
          "noopener noreferrer";

        a.textContent =
          fuente.titulo ||
          fuente.organismo ||
          "Fuente";


        li.appendChild(a);


        if (fuente.organismo) {

          const texto =
            document.createTextNode(
              ` — ${fuente.organismo}`
            );

          li.appendChild(texto);
        }


        lista.appendChild(li);
      }
    );


    fuentes.appendChild(lista);

    resultados.appendChild(
      fuentes
    );
  }
}


// ==========================================
// CAMBIAR PAÍS
// ==========================================

async function cambiarPais() {

  const pais =
    document.getElementById(
      "paisNormativa"
    )?.value || "";


  const resultados =
    document.getElementById(
      "resultadosNormativas"
    );


  if (!pais) {

    if (resultados) {

      resultados.innerHTML =
        '<p class="sin-resultados">' +
        'Selecciona un país.' +
        '</p>';
    }

    return;
  }


  const archivo =
    archivosNormativas[pais];


  if (!archivo) {

    if (resultados) {

      resultados.innerHTML =
        '<p class="sin-resultados">' +
        'Todavía no hay normativa disponible para este país.' +
        '</p>';
    }

    return;
  }


  if (resultados) {

    resultados.innerHTML =
      '<p class="contador-resultados">' +
      'Cargando normativa...' +
      '</p>';
  }


  try {

    const datos =
      await cargarJSON(
        archivo
      );


    if (datos.length === 0) {

      throw new Error(
        "JSON vacío"
      );
    }


    mostrarNormativa(
      datos[0]
    );

  }

  catch (error) {

    console.error(
      "ERROR CARGANDO NORMATIVA:",
      error
    );


    if (resultados) {

      resultados.innerHTML =
        '<p class="sin-resultados">' +
        '⚠️ No se pudo cargar la normativa.' +
        '</p>';
    }
  }
}


// ==========================================
// INICIO
// ==========================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const pais =
      document.getElementById(
        "paisNormativa"
      );


    if (pais) {

      pais.addEventListener(
        "change",
        cambiarPais
      );

      pais.value =
        "España";
    }


    cambiarPais();
  }
);
