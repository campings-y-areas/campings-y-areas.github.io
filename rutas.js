// ==========================================
// CAMPINGS & ÁREAS
// RUTAS - FASE 1
// ==========================================

let pasoActual = 1;
const totalPasos = 4;

const formRuta = document.getElementById("formRuta");
const botonAnterior = document.getElementById("anteriorPaso");
const botonSiguiente = document.getElementById("siguientePaso");
const botonCrear = document.getElementById("crearRuta");

function mostrarPaso(numero) {
  pasoActual = numero;

  document.querySelectorAll(".paso-contenido").forEach(seccion => {
    seccion.classList.toggle("activo", Number(seccion.dataset.paso) === numero);
  });

  document.querySelectorAll("[data-paso-indicador]").forEach(indicador => {
    const n = Number(indicador.dataset.pasoIndicador);
    indicador.classList.toggle("activo", n === numero);
    indicador.classList.toggle("completado", n < numero);
  });

  botonAnterior.disabled = numero === 1;
  botonSiguiente.classList.toggle("oculto", numero === totalPasos);
  botonCrear.classList.toggle("oculto", numero !== totalPasos);

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function validarPasoActual() {
  const seccion = document.querySelector(`.paso-contenido[data-paso="${pasoActual}"]`);
  const obligatorios = [...seccion.querySelectorAll("[required]")];

  for (const campo of obligatorios) {
    if (!campo.checkValidity()) {
      campo.reportValidity();
      return false;
    }
  }

  if (pasoActual === 1) {
    const modo = document.querySelector('input[name="modoRuta"]:checked')?.value;
    const destino = document.getElementById("destinoPrincipal");

    if (modo === "destino" && !destino.value.trim()) {
      destino.setCustomValidity("Indica al menos un destino.");
      destino.reportValidity();
      destino.setCustomValidity("");
      return false;
    }
  }

  return true;
}

botonSiguiente.addEventListener("click", () => {
  if (!validarPasoActual()) return;
  if (pasoActual < totalPasos) mostrarPaso(pasoActual + 1);
});

botonAnterior.addEventListener("click", () => {
  if (pasoActual > 1) mostrarPaso(pasoActual - 1);
});

document.querySelectorAll('input[name="modoRuta"]').forEach(radio => {
  radio.addEventListener("change", () => {
    const modo = document.querySelector('input[name="modoRuta"]:checked')?.value;
    document.getElementById("zonaDestinos").classList.toggle("oculto", modo === "propuesta");
  });
});

const ninos = document.getElementById("ninos");
const edadesNinos = document.getElementById("edadesNinos");

function actualizarEdades() {
  const cantidad = Math.max(0, Math.min(10, Number(ninos.value) || 0));
  const edadesPrevias = [...edadesNinos.querySelectorAll("input")].map(i => i.value);

  edadesNinos.innerHTML = "";

  for (let i = 0; i < cantidad; i++) {
    const label = document.createElement("label");
    label.innerHTML = `
      <span>Edad niño ${i + 1}</span>
      <input type="number" class="edadNino" min="0" max="17" value="${edadesPrevias[i] || ""}" placeholder="Edad">
    `;
    edadesNinos.appendChild(label);
  }
}

ninos.addEventListener("input", actualizarEdades);
actualizarEdades();

let contadorDestinos = 0;
document.getElementById("anadirDestino").addEventListener("click", () => {
  contadorDestinos++;
  const contenedor = document.getElementById("destinosExtra");
  const fila = document.createElement("div");
  fila.className = "destino-extra";
  fila.innerHTML = `
    <label>
      <span>📍 Destino adicional ${contadorDestinos}</span>
      <input type="text" class="destinoAdicional" placeholder="Ciudad, región o lugar">
    </label>
    <button type="button" class="boton-secundario eliminar-destino" aria-label="Eliminar destino">✕</button>
  `;
  contenedor.appendChild(fila);

  fila.querySelector(".eliminar-destino").addEventListener("click", () => {
    fila.remove();
  });
});

function valoresMarcados(selector) {
  return [...document.querySelectorAll(selector)]
    .filter(el => el.checked)
    .map(el => el.value);
}

function escapar(texto) {
  return String(texto ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

formRuta.addEventListener("submit", event => {
  event.preventDefault();

  if (!validarPasoActual()) return;

  const modo = document.querySelector('input[name="modoRuta"]:checked')?.value || "destino";
  const destinoPrincipal = document.getElementById("destinoPrincipal").value.trim();
  const destinosExtra = [...document.querySelectorAll(".destinoAdicional")]
    .map(i => i.value.trim())
    .filter(Boolean);

  const edades = [...document.querySelectorAll(".edadNino")]
    .map(i => i.value)
    .filter(v => v !== "");

  const datos = {
    modo,
    origen: document.getElementById("origen").value.trim(),
    destinoPrincipal,
    destinosExtra,
    fechaSalida: document.getElementById("fechaSalida").value,
    dias: document.getElementById("diasViaje").value,
    adultos: document.getElementById("adultos").value,
    ninos: document.getElementById("ninos").value,
    edades,
    mascota: document.getElementById("mascota").checked,
    recomendacionesNinos: document.getElementById("recomendacionesNinos").checked,
    vehiculo: document.querySelector('input[name="vehiculo"]:checked')?.value,
    maxConduccion: document.getElementById("maxConduccion").value,
    ritmo: document.getElementById("ritmo").value,
    intereses: valoresMarcados(".intereses input[type=checkbox]"),
    pernocta: valoresMarcados('input[name="pernocta"]'),
    evitar: valoresMarcados('input[name="evitar"]'),
    presupuesto: document.getElementById("presupuesto").value,
    contenidoVisual: document.getElementById("contenidoVisual").value,
    notas: document.getElementById("notasRuta").value.trim()
  };

  localStorage.setItem("campingsAreasRutaBorrador", JSON.stringify(datos));

  const destinosTexto = modo === "propuesta"
    ? "La web propondrá los destinos"
    : [destinoPrincipal, ...destinosExtra].filter(Boolean).join(" → ");

  const resumen = document.getElementById("resumenRuta");
  resumen.innerHTML = `
    <h3>✅ Datos preparados para crear la ruta</h3>
    <div class="resumen-grid">
      <div class="resumen-item"><strong>Salida:</strong><br>${escapar(datos.origen)}</div>
      <div class="resumen-item"><strong>Destino:</strong><br>${escapar(destinosTexto)}</div>
      <div class="resumen-item"><strong>Duración:</strong><br>${escapar(datos.dias)} días</div>
      <div class="resumen-item"><strong>Viajeros:</strong><br>${escapar(datos.adultos)} adultos · ${escapar(datos.ninos)} niños${datos.mascota ? " · mascota" : ""}</div>
      <div class="resumen-item"><strong>Vehículo:</strong><br>${escapar(datos.vehiculo)}</div>
      <div class="resumen-item"><strong>Máximo diario:</strong><br>${escapar(datos.maxConduccion)} h de conducción</div>
      <div class="resumen-item"><strong>Intereses:</strong><br>${escapar(datos.intereses.join(", ") || "Sin preferencias")}</div>
      <div class="resumen-item"><strong>Pernocta:</strong><br>${escapar(datos.pernocta.join(", ") || "Sin preferencia")}</div>
    </div>
    <div class="resumen-aviso">
      <strong>Siguiente fase:</strong> estos datos se enviarán al motor de planificación
      para generar las etapas, kilómetros, lugares que visitar, actividades para adultos
      y niños, restaurantes, fotos/vídeos y puntos de pernocta.
    </div>
  `;
  resumen.classList.remove("oculto");
  resumen.scrollIntoView({ behavior: "smooth", block: "start" });
});

mostrarPaso(1);
