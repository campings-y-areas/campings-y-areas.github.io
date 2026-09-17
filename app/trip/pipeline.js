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

  const logisticsResult = await logistics({
    trip: getState().trip,
    route,
    vehicle: getState().vehicle
  });
  const stages = Array.isArray(logisticsResult?.stages) ? logisticsResult.stages : [];
  const overnights = (logisticsResult?.overnights ?? [])
    .filter(Boolean)
    .map(assertOvernight);
  const catalogs = logisticsResult?.catalogs ?? {};

  setState(state => ({
    ...state,
    trip: { ...state.trip, stages },
    logistics: {
      ...state.logistics,
      overnights,
      countries: logisticsResult?.countries ?? [],
      catalogs
    }
  }));

  const enriched = await enrichment({
    trip: getState().trip,
    route,
    overnights,
    catalogs,
    countries: logisticsResult?.countries ?? [],
    vehicle: getState().vehicle
  });

  if (Array.isArray(enriched?.stages)) {
    setState(state => ({
      ...state,
      trip: { ...state.trip, stages: enriched.stages },
      enrichment: { ...state.enrichment, ...(enriched.catalogs ?? catalogs) }
    }));
  } else {
    setState(state => ({
      ...state,
      enrichment: { ...state.enrichment, ...catalogs, ...(enriched ?? {}) }
    }));
  }

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
