// Campings & Áreas — estado central compartido
// La interfaz, el routing, los datos y la IA consumen este estado;
// ninguna capa debe convertirse en fuente paralela de verdad.

const initialState = Object.freeze({
  mode: "explore",
  demo: false,
  vehicle: null,
  trip: {
    origin: null,
    destination: null,
    waypoints: [],
    stages: [],
    preferences: {}
  },
  route: {
    geometry: null,
    display_geometry: null,
    geometry_source: null,
    distance_m: null,
    duration_s: null,
    legs: [],
    waypoints: [],
    country_metadata: null
  },
  logistics: {
    overnights: [],
    proposedOvernights: [],
    countries: [],
    catalogs: {},
    unresolvedSplitPoints: [],
    warnings: [],
    maxDrivingLimitSatisfied: true,
    rerouteCount: 0,
    rerouteStopReason: null
  },
  enrichment: {
    places: [],
    services: [],
    restaurants: [],
    workshops: [],
    regulations: []
  },
  guide: null
});

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

let state = clone(initialState);
const listeners = new Set();

export function getState() {
  return clone(state);
}

export function setState(updater) {
  const next = typeof updater === "function" ? updater(clone(state)) : updater;
  if (!next || typeof next !== "object") throw new TypeError("Estado de aplicación inválido");
  state = next;
  listeners.forEach(listener => listener(getState()));
  return getState();
}

export function patchState(partial) {
  return setState(current => ({ ...current, ...partial }));
}

export function resetState() {
  state = clone(initialState);
  listeners.forEach(listener => listener(getState()));
  return getState();
}

export function subscribe(listener) {
  if (typeof listener !== "function") throw new TypeError("Suscriptor de estado inválido");
  listeners.add(listener);
  return () => listeners.delete(listener);
}
