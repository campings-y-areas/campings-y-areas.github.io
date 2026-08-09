// ==========================================
// CAMPINGS & ÁREAS
// Buscador de campings
// ==========================================

let campings = [];

// Cargar la base de datos
fetch("campings.json")
  .then(response => {
    if (!response.ok) {
      throw new Error("No se pudo cargar campings.json");
    }
    return response.json();
  })
  .then(data => {
    campings = data;
    console.log("Campings cargados:", campings.length);

    // Mostrar inicialmente todos los campings activos
    buscarCampings();
  })
  .catch(error => {
    console.error("Error:", error);

    const resultados = document.getElementById("resultadosCampings");

    if (resultados) {
      resultados.innerHTML =
        "<p>No se pudieron cargar los campings.</p>";
    }
  });


// ==========================================
// NORMALIZAR TEXTO
// Permite buscar con o sin tildes
// ==========================================

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}


// ==========================================
// BUSCAR CAMPINGS
// ==========================================

function buscarCampings() {

  const campoBusqueda = document.getElementById("buscarCamping");
  const campoPais = document.getElementById("paisCamping");
  const resultados = document.getElementById("resultadosCampings");

  if (!resultados) return;

  const texto = normalizarTexto(
    campoBusqueda ? campoBusqueda.value : ""
  );

  const pais = campoPais ? campoPais.value : "";

  let encontrados = campings.filter(camping => {

    // Los cerrados permanentemente no aparecen
    if (camping.estado === "cerrado_permanentemente") {
      return false;
    }

    const contenido = normalizarTexto(
      [
        camping.nombre,
        camping.direccion,
        camping.provincia_texto,
        camping.descripcion_original
      ].filter(Boolean).join(" ")
    );

    const coincideTexto =
      texto === "" || contenido.includes(texto);

    /*
      De momento el JSON procede principalmente del mapa
      original de España.

      El filtro por país quedará preparado para la siguiente
      fase, cuando añadamos el campo pais a los registros.
    */
    const coincidePais =
      pais === "" ||
      pais === "ES";

    return coincideTexto && coincidePais;
  });


  mostrarResultados(encontrados);
}


// ==========================================
// MOSTRAR RESULTADOS
// ==========================================

function mostrarResultados(lista) {

  const resultados = document.getElementById("resultadosCampings");

  if (!resultados) return;

  resultados.innerHTML = "";

  const contador = document.createElement("p");
  contador.className = "contador-resultados";

  contador.textContent =
    lista.length === 1
      ? "1 camping encontrado"
      : `${lista.length} campings encontrados`;

  resultados.appendChild(contador);


  if (lista.length === 0) {

    const mensaje = document.createElement("p");
    mensaje.className = "sin-resultados";
    mensaje.textContent =
      "No se han encontrado campings con esos criterios.";

    resultados.appendChild(mensaje);

    return;
  }


  lista.forEach(camping => {

    const ficha = document.createElement("article");
    ficha.className = "resultado-camping";


    const titulo = document.createElement("h3");
    titulo.textContent = camping.nombre || "Camping";

    ficha.appendChild(titulo);


    if (camping.direccion) {

      const direccion = document.createElement("p");
      direccion.className = "direccion";
      direccion.textContent = "📍 " + camping.direccion;

      ficha.appendChild(direccion);
    }


    const caracteristicas = [];

    if (camping.abierto_todo_ano) {
      caracteristicas.push("📅 Abierto todo el año");
    }

    if (camping.piscina_climatizada) {
      caracteristicas.push("🏊 Piscina climatizada/cubierta");
    }

    if (camping.parque_acuatico) {
      caracteristicas.push("🌊 Parque acuático/toboganes");
    }

    if (camping.mascotas === true) {
      caracteristicas.push("🐕 Admite mascotas");
    }


    if (caracteristicas.length > 0) {

      const servicios = document.createElement("p");
      servicios.className = "caracteristicas";
      servicios.textContent = caracteristicas.join(" · ");

      ficha.appendChild(servicios);
    }


    const enlaces = document.createElement("div");
    enlaces.className = "enlaces-camping";


    if (camping.web) {

      const web = document.createElement("a");
      web.href = camping.web;
      web.target = "_blank";
      web.rel = "noopener noreferrer";
      web.textContent = "🌐 Web";

      enlaces.appendChild(web);
    }


    if (camping.telefono) {

      const telefono = document.createElement("a");
      telefono.href =
        "tel:" + camping.telefono.replace(/[^\d+]/g, "");

      telefono.textContent = "☎️ " + camping.telefono;

      enlaces.appendChild(telefono);
    }


    if (camping.lat && camping.lon) {

      const mapa = document.createElement("a");

      mapa.href =
        `https://www.google.com/maps/search/?api=1&query=${camping.lat},${camping.lon}`;

      mapa.target = "_blank";
      mapa.rel = "noopener noreferrer";
      mapa.textContent = "🗺️ Ver en el mapa";

      enlaces.appendChild(mapa);
    }


    if (enlaces.children.length > 0) {
      ficha.appendChild(enlaces);
    }


    resultados.appendChild(ficha);
  });
}


// ==========================================
// EVENTOS DEL BUSCADOR
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

  const campoBusqueda = document.getElementById("buscarCamping");
  const campoPais = document.getElementById("paisCamping");
  const boton = document.getElementById("botonBuscarCamping");


  if (boton) {
    boton.addEventListener("click", buscarCampings);
  }


  if (campoBusqueda) {

    campoBusqueda.addEventListener("keydown", event => {

      if (event.key === "Enter") {
        buscarCampings();
      }

    });

  }


  if (campoPais) {
    campoPais.addEventListener("change", buscarCampings);
  }

});
