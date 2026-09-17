import { setState } from "../core/store.js";

// La demo usa el mismo estado y pipeline que la aplicación real.
// Solo cambia la entrada controlada; no existe una segunda implementación de Rutas.
export function activateDemo(seed) {
  if (!seed?.trip) throw new TypeError("Demo sin viaje de ejemplo");
  return setState(state => ({
    ...state,
    demo: true,
    mode: "route",
    vehicle: seed.vehicle ?? state.vehicle,
    trip: {
      ...state.trip,
      ...seed.trip,
      waypoints: Array.isArray(seed.trip.waypoints) ? seed.trip.waypoints : []
    }
  }));
}
