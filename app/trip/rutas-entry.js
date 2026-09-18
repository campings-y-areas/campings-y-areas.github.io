import { getState, subscribe } from "../core/store.js";
import { prepareTripFromCurrentForm, createProductionGuideAdapter } from "./controller.js";
import { renderRouteMap } from "../ui/route-map.js";
import { renderLongFormGuide } from "../ui/route-guide.js";
import { renderRouteActions } from "../ui/route-actions.js";
import { backendRequest } from "../services/backend-client.js";

let currentStep = 1;
let childAgeCount = 0;

function byId(id) { return document.getElementById(id); }
function all(selector) { return [...document.querySelectorAll(selector)]; }

function showStep(step) {
  currentStep = Math.max(1, Math.min(4, step));
  all("[data-paso]").forEach(section => section.classList.toggle("activo", Number(section.dataset.paso) === currentStep));
  all("[data-paso-indicador]").forEach(indicator => {
    const number = Number(indicator.dataset.pasoIndicador);
    indicator.classList.toggle("activo", number === currentStep);
    indicator.classList.toggle("completado", number < currentStep);
  });
  const previous = byId("anteriorPaso");
  const next = byId("siguientePaso");
  const submit = byId("crearRuta");
  if (previous) previous.disabled = currentStep === 1;
  next?.classList.toggle("oculto", currentStep === 4);
  submit?.classList.toggle("oculto", currentStep !== 4);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function syncChildAges() {
  const count = Math.max(0, Math.min(10, Number(byId("ninos")?.value) || 0));
  const container = byId("edadesNinos");
  if (!container || count === childAgeCount) return;
  const previous = all("#edadesNinos input").map(input => input.value);
  container.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const label = document.createElement("label");
    const span = document.createElement("span");
    const input = document.createElement("input");
    span.textContent = `Edad del niño ${index + 1}`;
    input.type = "number";
    input.min = "0";
    input.max = "17";
    input.className = "edadNino";
    input.placeholder = "Edad";
    input.value = previous[index] ?? "";
    label.append(span, input);
    container.append(label);
  }
  childAgeCount = count;
}

function addViaField(value = "") {
  const container = byId("destinosExtra");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "via-item";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Ej. Lyon, Francia";
  input.value = value;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "boton-secundario boton-pequeno";
  remove.textContent = "Eliminar";
  remove.addEventListener("click", () => row.remove());
  row.append(input, remove);
  container.append(row);
}

function syncRouteMode() {
  const mode = document.querySelector('input[name="modoRuta"]:checked')?.value;
  byId("zonaDestinos")?.classList.toggle("oculto", mode === "propuesta");
}

function validateCurrentStep() {
  const section = document.querySelector(`[data-paso="${currentStep}"]`);
  if (!section) return true;
  const fields = [...section.querySelectorAll("input, select, textarea")].filter(field => !field.disabled);
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }
  if (currentStep === 1) {
    const mode = document.querySelector('input[name="modoRuta"]:checked')?.value;
    const destination = byId("destinoPrincipal");
    if (mode === "destino" && destination && !destination.value.trim()) {
      destination.setCustomValidity("Indica al menos un destino.");
      destination.reportValidity();
      destination.setCustomValidity("");
      return false;
    }
  }
  return true;
}

let renderingClosedTrip = false;

function renderClosedTrip(state) {
  const result = byId("resultadoReal");
  const status = byId("estadoCalculo");
  const metrics = byId("metricasRuta");
  const stages = byId("etapasRuta");
  if (!result || renderingClosedTrip) return;
  renderingClosedTrip = true;
  result.classList.remove("oculto");
  document.querySelector(".rutas-panel")?.classList.add("oculto");
  if (status) status.textContent = state.guide ? "Ruta y guía preparadas." : "Ruta logística preparada.";
  if (metrics) {
    const km = Math.round(Number(state.route?.distance_m ?? 0) / 1000);
    const minutes = Math.round(Number(state.route?.duration_s ?? 0) / 60);
    metrics.textContent = `${km} km · ${Math.floor(minutes / 60)} h ${minutes % 60} min · ${state.trip?.stages?.length ?? 0} etapas`;
  }
  renderRouteMap(state.route);
  renderRouteActions(state);
  const guideRendered = Boolean(stages && state.guide && renderLongFormGuide(state.guide, stages));
  if (!guideRendered && stages) {
    stages.replaceChildren();
    for (const stage of state.trip?.stages ?? []) {
      const article = document.createElement("article");
      const title = document.createElement("h3");
      const detail = document.createElement("p");
      title.textContent = stage.overnight?.nombre ?? stage.overnight?.name ?? stage.to?.label ?? stage.driving_stage_id;
      detail.textContent = `${Math.round(Number(stage.distance_m ?? 0) / 1000)} km · ${Math.round(Number(stage.duration_s ?? 0) / 60)} min${stage.overnight ? ` · Pernocta: ${stage.overnight.nombre ?? stage.overnight.name ?? stage.overnight_id}` : ""}`;
      article.append(title, detail);
      stages.append(article);
    }
  }
  renderingClosedTrip = false;
}

function productionGuide() {
  const config = globalThis.RUTAS_CONFIG ?? {};
  if (config.OPENAI_ROUTE_PIPELINE_ENABLED !== true || config.OPENAI_SPEND_ENABLED !== true) return undefined;
  return createProductionGuideAdapter({ request: backendRequest });
}

async function submitTrip(event) {
  event.preventDefault();
  if (!validateCurrentStep()) return;
  const button = byId("crearRuta");
  const status = byId("estadoCalculo");
  button && (button.disabled = true);
  const result = byId("resultadoReal");
  result?.classList.remove("oculto");
  result?.classList.add("cargando-ruta");
  byId("metricasRuta")?.replaceChildren();
  byId("etapasRuta")?.replaceChildren();
  if (status) status.textContent = "Calculando recorrido…";
  try {
    const guide = productionGuide();
    await prepareTripFromCurrentForm(guide ? { guide } : {});
  } catch (error) {
    console.error("Rutas Campings & Áreas", error);
    if (status) status.textContent = "No se pudo crear la ruta";
    const stages = byId("etapasRuta");
    if (stages) {
      stages.replaceChildren();
      const box = document.createElement("div");
      box.className = "error-ruta";
      const strong = document.createElement("strong");
      const detail = document.createElement("p");
      strong.textContent = `⚠️ ${error?.message ?? "Se produjo un error al preparar la ruta."}`;
      detail.textContent = "No se ha generado una guía automática de sustitución.";
      box.append(strong, detail);
      stages.append(box);
    }
  } finally {
    result?.classList.remove("cargando-ruta");
    button && (button.disabled = false);
  }
}

function init() {
  showStep(1);
  syncChildAges();
  syncRouteMode();
  byId("ninos")?.addEventListener("input", syncChildAges);
  all('input[name="modoRuta"]').forEach(input => input.addEventListener("change", syncRouteMode));
  byId("anadirDestino")?.addEventListener("click", () => addViaField());
  byId("anteriorPaso")?.addEventListener("click", () => showStep(currentStep - 1));
  byId("siguientePaso")?.addEventListener("click", () => { if (validateCurrentStep()) showStep(currentStep + 1); });
  byId("formRuta")?.addEventListener("submit", submitTrip);
  byId("volverEditar")?.addEventListener("click", () => {
    byId("resultadoReal")?.classList.add("oculto");
    document.querySelector(".rutas-panel")?.classList.remove("oculto");
    showStep(1);
  });
  subscribe(state => {
    if (state.route?.distance_m != null && state.trip?.stages?.length) renderClosedTrip(state);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
