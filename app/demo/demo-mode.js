import { resetState, setState } from "../core/store.js";

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

// La demo usa la misma arquitectura que la aplicación real, pero parte siempre
// de un estado limpio y de una copia de sus datos controlados. No puede heredar
// una ruta real anterior ni modificar el objeto seed recibido.
export function activateDemo(seed) {
  if (!seed?.trip) throw new TypeError("Demo sin viaje de ejemplo");
  const controlled = clone(seed);
  resetState();
  return setState(state => ({
    ...state,
    demo: true,
    mode: "route",
    vehicle: controlled.vehicle ?? null,
    trip: {
      ...state.trip,
      ...controlled.trip,
      waypoints: Array.isArray(controlled.trip.waypoints) ? controlled.trip.waypoints : [],
      stages: Array.isArray(controlled.trip.stages) ? controlled.trip.stages : []
    },
    route: controlled.route ? { ...state.route, ...controlled.route } : state.route,
    logistics: controlled.logistics ? { ...state.logistics, ...controlled.logistics } : state.logistics,
    enrichment: controlled.enrichment ? { ...state.enrichment, ...controlled.enrichment } : state.enrichment,
    guide: controlled.guide ?? null
  }));
}

export function deactivateDemo() {
  return resetState();
}
