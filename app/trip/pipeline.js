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

async function routeAndLogistics({ routing, logistics, waypoints, vehicle, trip, includeCountryDetails = false, knownCountries = null }) {
  const route = assertRoute(await routing({ waypoints, vehicle, includeCountryDetails }));
  const logisticsResult = await logistics({ trip: { ...trip, waypoints }, route, vehicle, knownCountries });
  return { route, logisticsResult };
}

function drivingLimitWarnings(stages, unresolvedSplitPoints = []) {
  const unresolvedStages = new Set(unresolvedSplitPoints.map(item => item.driving_stage_id));
  return stages
    .filter(stage => stage.exceeds_max_driving && Number(stage.max_driving_seconds) > 0)
    .map(stage => {
      const excessSeconds = Math.max(0, Number(stage.duration_s) - Number(stage.max_driving_seconds));
      const noCompatibleStop = unresolvedStages.has(stage.driving_stage_id);
      return {
        code: noCompatibleStop ? "max_driving_exceeded_no_compatible_overnight" : "max_driving_exceeded",
        driving_stage_id: stage.driving_stage_id,
        duration_s: Number(stage.duration_s),
        requested_max_s: Number(stage.max_driving_seconds),
        excess_s: excessSeconds,
        reason: noCompatibleStop ? "no_compatible_overnight_available" : "route_after_logistics_still_exceeds_limit",
        message: noCompatibleStop
          ? "No existe una pernocta compatible disponible en la zona necesaria para respetar el máximo de conducción. La guía continúa y debe informar del exceso real de este tramo."
          : "La ruta logística recalculada todavía supera el máximo solicitado. La guía continúa y debe informar del exceso real de este tramo."
      };
    });
}

export async function buildTrip({ routing, logistics, enrichment, guide }) {
  const current = getState();
  const requestedWaypoints = current.trip.waypoints.map(assertWaypoint);
  let routedWaypoints = requestedWaypoints;
  let { route, logisticsResult } = await routeAndLogistics({
    routing, logistics, waypoints: requestedWaypoints, vehicle: current.vehicle, trip: current.trip, includeCountryDetails: true
  });
  const initialCountries = logisticsResult?.countries ?? [];

  if (logisticsResult?.requiresReroute) {
    routedWaypoints = insertSplitTargets(requestedWaypoints, logisticsResult.stages ?? [], logisticsResult.splitTargets ?? []);
    ({ route, logisticsResult } = await routeAndLogistics({
      routing, logistics, waypoints: routedWaypoints, vehicle: current.vehicle, trip: current.trip,
      includeCountryDetails: false, knownCountries: initialCountries
    }));
    setState(state => ({ ...state, trip: { ...state.trip, waypoints: routedWaypoints } }));
  }

  setState(state => ({ ...state, route }));
  const stages = Array.isArray(logisticsResult?.stages) ? logisticsResult.stages : [];
  const overnights = (logisticsResult?.overnights ?? []).filter(Boolean).map(assertOvernight);
  const catalogs = logisticsResult?.catalogs ?? {};
  const unresolvedSplitPoints = logisticsResult?.unresolvedSplitPoints ?? [];
  const warnings = drivingLimitWarnings(stages, unresolvedSplitPoints);

  setState(state => ({
    ...state,
    trip: { ...state.trip, stages },
    logistics: {
      ...state.logistics,
      overnights,
      countries: logisticsResult?.countries ?? initialCountries,
      catalogs,
      unresolvedSplitPoints,
      warnings,
      maxDrivingLimitSatisfied: warnings.length === 0
    }
  }));

  const enriched = await enrichment({
    trip: getState().trip, route, overnights, catalogs,
    countries: logisticsResult?.countries ?? initialCountries, vehicle: getState().vehicle
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
