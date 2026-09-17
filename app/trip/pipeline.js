import { getState, setState } from "../core/store.js";
import { assertOvernight, assertRoute, assertWaypoint } from "../core/contracts.js";

// Orquestación explícita:
// puntos -> routing -> logística/pernocta -> enriquecimiento -> IA/guía.
// Cada fase consume la salida validada de la anterior.
export async function buildTrip({ routing, logistics, enrichment, guide }) {
  const current = getState();
  const waypoints = current.trip.waypoints.map(assertWaypoint);

  const route = assertRoute(await routing({
    waypoints,
    vehicle: current.vehicle
  }));

  setState(state => ({ ...state, route }));

  const overnightsRaw = await logistics({
    trip: getState().trip,
    route,
    vehicle: getState().vehicle
  });
  const overnights = (overnightsRaw ?? []).map(assertOvernight);

  setState(state => ({
    ...state,
    logistics: { ...state.logistics, overnights }
  }));

  const enriched = await enrichment({
    trip: getState().trip,
    route,
    overnights,
    vehicle: getState().vehicle
  });

  setState(state => ({
    ...state,
    enrichment: { ...state.enrichment, ...(enriched ?? {}) }
  }));

  const finalGuide = await guide({
    trip: getState().trip,
    route: getState().route,
    logistics: getState().logistics,
    enrichment: getState().enrichment,
    vehicle: getState().vehicle
  });

  setState(state => ({ ...state, guide: finalGuide }));
  return getState();
}
