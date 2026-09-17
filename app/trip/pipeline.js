import { getState, setState } from "../core/store.js";
import { assertOvernight, assertRoute, assertWaypoint } from "../core/contracts.js";

function overnightWaypoint(target, index) {
  const overnight = assertOvernight(target.overnight);
  const id = `logistics-overnight-${index + 1}-${overnight.overnight_id}`;
  return assertWaypoint({
    id,
    request_point_id: id,
    requested_text: overnight.nombre ?? overnight.name ?? null,
    requested_lat: Number(overnight.lat),
    requested_lon: Number(overnight.lon),
    label: overnight.nombre ?? overnight.name ?? "Pernocta logística",
    country: overnight.pais ?? null,
    country_code: overnight.country_code ?? null,
    lat: Number(overnight.lat),
    lon: Number(overnight.lon),
    synthetic_route_point: true,
    logistics_overnight_id: overnight.overnight_id
  });
}

function insertSplitTargets(originalWaypoints, stages, splitTargets) {
  if (!splitTargets.length) return originalWaypoints;
  const targetsByStage = new Map();
  for (const stage of stages) targetsByStage.set(stage.driving_stage_id, []);
  for (const target of splitTargets) {
    const stage = stages.find(item => (item.split_targets ?? []).includes(target));
    if (stage) targetsByStage.get(stage.driving_stage_id).push(target);
  }
  const result = [];
  stages.forEach((stage, stageIndex) => {
    if (stageIndex === 0) result.push(originalWaypoints[0]);
    const targets = targetsByStage.get(stage.driving_stage_id) ?? [];
    targets.forEach((target, index) => result.push(overnightWaypoint(target, index)));
    result.push(originalWaypoints[stageIndex + 1]);
  });
  return result;
}

async function routeAndLogistics({ routing, logistics, waypoints, vehicle, trip }) {
  const route = assertRoute(await routing({ waypoints, vehicle }));
  const logisticsResult = await logistics({ trip: { ...trip, waypoints }, route, vehicle });
  return { route, logisticsResult };
}

// Orquestación cerrada:
// puntos -> routing inicial -> logística -> pernoctas de corte -> routing definitivo -> logística definitiva -> enriquecimiento -> guía.
export async function buildTrip({ routing, logistics, enrichment, guide }) {
  const current = getState();
  const requestedWaypoints = current.trip.waypoints.map(assertWaypoint);
  let { route, logisticsResult } = await routeAndLogistics({
    routing,
    logistics,
    waypoints: requestedWaypoints,
    vehicle: current.vehicle,
    trip: current.trip
  });

  if (logisticsResult?.requiresReroute) {
    const routedWaypoints = insertSplitTargets(requestedWaypoints, logisticsResult.stages ?? [], logisticsResult.splitTargets ?? []);
    ({ route, logisticsResult } = await routeAndLogistics({
      routing,
      logistics,
      waypoints: routedWaypoints,
      vehicle: current.vehicle,
      trip: current.trip
    }));
    if (logisticsResult?.requiresReroute) {
      throw new Error("La ruta recalculada todavía supera el máximo de conducción; se requiere otra selección logística antes de cerrar el viaje");
    }
    setState(state => ({
      ...state,
      trip: { ...state.trip, waypoints: routedWaypoints }
    }));
  }

  setState(state => ({ ...state, route }));
  const stages = Array.isArray(logisticsResult?.stages) ? logisticsResult.stages : [];
  const overnights = (logisticsResult?.overnights ?? []).filter(Boolean).map(assertOvernight);
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
    setState(state => ({ ...state, enrichment: { ...state.enrichment, ...catalogs, ...(enriched ?? {}) } }));
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
