import { getState, subscribe } from "../core/store.js";
import { prepareTripFromCurrentForm, createProductionGuideAdapter } from "./controller.js";
import { renderRouteMap } from "../ui/route-map.js";
import { renderLongFormGuide } from "../ui/route-guide.js";

let currentStep = 1;
let childAgeCount = 0;

function byId(id) { return document.getElementById(id); }
function all(selector) { return [...document.querySelectorAll(selector)]; }

function showStep(step) {
  currentStep = Math.max(1, Math.min(4, step));
  all("[data-paso]").forEach(section => section.classList.toggle("activo", Number(section.dataset.paso) === currentStep));
  all("[data-paso-indicador]").forEach(indicator => indicator.classList.toggle("activo", Number(indicator.dataset.pasoIndicador) <= currentStep));
  const previous = byId("anteriorPaso");
  const next = byId("siguientePaso");
  const submit = byId("crearRuta");
  if (previous) previous.disabled = currentStep === 1;
  next?.classList.toggle("oculto", currentStep === 4);
  submit?.classList.toggle("oculto", currentStep !== 4);
}

function syncChildAges() {
  const count = Math.max(0, Number(byId("ninos")?.value) || 0);
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
    input.required = true;
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
  return true;
}

function renderClosedTrip(state) {
  const result = byId("resultadoReal");
  const status = byId("estadoCalculo");
  const metrics = byId("metricasRuta");
  const stages = byId("etapasRuta");
  if (!result) return;
  result.classList.remove("oculto");
  if (status) status.textContent = state.guide ? "Ruta y guía preparadas." : "Ruta logística preparada.";
  if (metrics) {
    const km = Math.round(Number(state.route?.distance_m ?? 0) / 1000);
    const minutes = Math.round(Number(state.route?.duration_s ?? 0) / 60);
    metrics.textContent = `${km} km · ${Math.floor(minutes / 60)} h ${minutes % 60} min · ${state.trip?.stages?.length ?? 0} etapas`;
  }
  renderRouteMap(state.route);\n  if (stages) {
    stages.replaceChildren();
    for (const stage of state.trip?.stages ?? []) {
      const article = document.createElement("article");
      const title = document.createElement("h3");
      const detail = document.createElement("p");
      title.textContent = stage.to?.label ?? stage.overnight?.nombre ?? stage.overnight?.name ?? stage.driving_stage_id;
      detail.textContent = `${Math.round(Number(stage.distance_m ?? 0) / 1000)} km · ${Math.round(Number(stage.duration_s ?? 0) / 60)} min${stage.overnight ? ` · Pernocta: ${stage.overnight.nombre ?? stage.overnight.name ?? stage.overnight_id}` : ""}`;
      article.append(title, detail);
      stages.append(article);
    }
  }
}

function productionGuide() {
  const config = globalThis.RUTAS_CONFIG ?? {};
  if (config.OPENAI_ROUTE_PIPELINE_ENABLED !== true || config.OPENAI_SPEND_ENABLED !== true) return undefined;
  return createProductionGuideAdapter();
}

async function submitTrip(event) {
  event.preventDefault();
  if (!validateCurrentStep()) return;
  const button = byId("crearRuta");
  const status = byId("estadoCalculo");
  button && (button.disabled = true);
  byId("resultadoReal")?.classList.remove("oculto");
  if (status) status.textContent = "Calculando recorrido…";
  try {
    const guide = productionGuide();
    await prepareTripFromCurrentForm(guide ? { guide } : {});
    renderClosedTrip(getState());
  } catch (error) {
    if (status) status.textContent = error?.message ?? "No se pudo preparar la ruta.";
  } finally {
    button && (button.disabled = false);
  }
}

function init() {
  showStep(1);
  syncChildAges();
  byId("ninos")?.addEventListener("input", syncChildAges);
  byId("anadirDestino")?.addEventListener("click", () => addViaField());
  byId("anteriorPaso")?.addEventListener("click", () => showStep(currentStep - 1));
  byId("siguientePaso")?.addEventListener("click", () => { if (validateCurrentStep()) showStep(currentStep + 1); });
  byId("formRuta")?.addEventListener("submit", submitTrip);
  byId("volverEditar")?.addEventListener("click", () => {
    byId("resultadoReal")?.classList.add("oculto");
    showStep(1);
  });
  subscribe(state => {
    if (state.route?.distance_m != null && state.trip?.stages?.length) renderClosedTrip(state);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
