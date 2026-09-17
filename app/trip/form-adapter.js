import { setState } from "../core/store.js";

function value(id) {
  return document.getElementById(id)?.value?.trim?.() ?? "";
}
function number(id, fallback = 0) {
  const n = Number(document.getElementById(id)?.value);
  return Number.isFinite(n) ? n : fallback;
}
function checked(selector) {
  return [...document.querySelectorAll(selector)].filter(el => el.checked).map(el => el.value);
}
function radio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value ?? "";
}

export function readCurrentTripForm() {
  return {
    mode: radio("modoRuta") || "destino",
    originText: value("origen"),
    destinationText: value("destinoPrincipal"),
    viaTexts: [...document.querySelectorAll("#destinosExtra input")].map(el => el.value.trim()).filter(Boolean),
    departureDate: value("fechaSalida"),
    days: number("diasViaje", 7),
    travellers: {
      adults: number("adultos", 2),
      children: number("ninos", 0),
      pet: Boolean(document.getElementById("mascota")?.checked),
      childRecommendations: Boolean(document.getElementById("recomendacionesNinos")?.checked)
    },
    vehicle: { tipo: radio("vehiculo") || "autocaravana" },
    preferences: {
      maxDrivingHours: number("maxConduccion", 3),
      pace: value("ritmo") || "normal",
      interests: checked(".intereses input[type=checkbox]"),
      overnightTypes: checked('input[name="pernocta"]'),
      avoid: checked('input[name="evitar"]'),
      budget: value("presupuesto"),
      visualMode: value("contenidoVisual"),
      notes: value("notasRuta")
    }
  };
}

export function commitCurrentTripForm() {
  const form = readCurrentTripForm();
  return setState(state => ({
    ...state,
    mode: form.mode,
    vehicle: form.vehicle,
    trip: {
      ...state.trip,
      originText: form.originText,
      destinationText: form.destinationText,
      viaTexts: form.viaTexts,
      departureDate: form.departureDate,
      days: form.days,
      travellers: form.travellers,
      preferences: form.preferences
    }
  }));
}
