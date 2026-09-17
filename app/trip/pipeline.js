import { getState, setState } from "../core/store.js";
import { assertOvernight, assertRoute, assertWaypoint } from "../core/contracts.js";

const MAX_LOGISTICS_REROUTES = 4;

function overnightWaypoint(target) {
  const overnight = assertOvernight(target.overnight);
  const stageId = String(target.driving_stage_id ?? "stage");
  const id = `logistics:${stageId}:${overnight.overnight_id}`;
  return assertWaypoint({
    id,
    label: overnight.nombre ?? overnight.name ?? "Pernocta logística",
    country: overnight.pais ?? null,
    country_code: overnight.country_code ?? null,
    lat: Number(overnight.lat),
    lon: Number(overnight.lon),
    synthetic_route_point: true,
    generated_by: "logistics",
    logistics_overnight_id: overnight.overnight_id,
    logistics_stage_id: stageId
  });
}

function insertSplitTargets(routeWaypoints, stages, splitTargets) {
  if (!splitTargets.length) return { waypoints: routeWaypoints, inserted: 0 };
  const targetsByStage = new Map(stages.map(stage => [stage.driving_stage_id, []]));
  for (const target of splitTargets) {
    if (targetsByStage.has(target.driving_stage_id)) targetsByStage.get(target.driving_stage_id).push(target);
  }

  const existingOvernights = new Set(routeWaypoints
    .filter(point => point?.logistics_overnight_id)
    .map(point => String(point.logistics_overnight_id)));
  const result = [];
  let inserted = 0;

  stages.forEach((stage, stageIndex) => {
    if (stageIndex === 0) result.push(routeWaypoints[0]);
    const targets = targetsByStage.get(stage.driving_stage_id) ?? [];
    for (const target of targets) {
      const point = overnightWaypoint(target);
      const overnightKey = String(point.logistics_overnight_id);
      if (!existingOvernights.has(overnightKey)) {
        existingOvernights.add(overnightKey);
        result.push(point);
        inserted += 1;
      }
    }
    result.push(routeWaypoints[stageIndex + 1]);
  });
  return { waypoints: result.filter(Boolean), inserted };
}

async function routeAndLogistics({ routing, logistics, waypoints, vehicle, trip, includeCountryDetails = false, knownCountries = null }) {
  const route = assertRoute(await routing({ waypoints, vehicle, includeCountryDetails }));
  const logisticsResult = await logistics({ trip: { ...trip, waypoints }, route, vehicle, knownCountries });
  return { route, logisticsResult };
}

function drivingLimitWarnings(stages, unresolvedSplitPoints = [], stopReason = null) {
  const unresolvedStages = new Set(unresolvedSplitPoints.map(item => item.driving_stage_id));
  return stages
    .filter(stage => stage.exceeds_max_driving && Number(stage.max_driving_seconds) > 0)
    .map(stage => {
      const excessSeconds = Math.max(0, Number(stage.duration_s) - Number(stage.max_driving_seconds));
      const noCompatibleStop = unresolvedStages.has(stage.driving_stage_id);
      const rerouteLimitReached = stopReason === "reroute_limit_reached" && !noCompatibleStop;
      const convergedWithoutNewStop = stopReason === "no_new_compatible_overnight" && !noCompatibleStop;
      return {
        code: noCompatibleStop
          ? "max_driving_exceeded_no_compatible_overnight"
          : rerouteLimitReached
            ? "max_driving_exceeded_reroute_limit"
            : convergedWithoutNewStop ? "max_driving_exceeded_logistics_converged" : "max_driving_exceeded",
        driving_stage_id: stage.driving_stage_id,
        duration_s: Number(stage.duration_s),
        requested_max_s: Number(stage.max_driving_seconds),
        excess_s: excessSeconds,
        reason: noCompatibleStop
          ? "no_compatible_overnight_available"
          : rerouteLimitReached
            ? "reroute_limit_reached"
            : convergedWithoutNewStop ? "logistics_converged_without_new_stop" : "route_after_logistics_still_exceeds_limit",
        message: noCompatibleStop
          ? "No existe una pernocta compatible disponible en la zona necesaria para respetar el máximo de conducción. La guía continúa y debe informar del exceso real de este tramo."
          : rerouteLimitReached
            ? "Tras varios recálculos logísticos acotados, la ruta todavía supera el máximo solicitado. La guía continúa y debe informar del exceso real sin atribuirlo falsamente a falta de pernoctas."
            : convergedWithoutNewStop
              ? "La logística ha convergido sin poder insertar una pernocta compatible distinta adicional. La guía continúa y debe informar del exceso real sin afirmar que no existen establecimientos compatibles."
              : "La ruta logística recalculada todavía supera el máximo solicitado. La guía continúa y debe informar del exceso real de este tramo."
      };
    });
}

export async function buildTrip({ routing, logistics, enrichment, guide }) {
  const current = getState();
  const requestedWaypoints = current.trip.waypoints.map(assertWaypoint);
  let routedWaypoints = [...requestedWaypoints];
  let { route, logisticsResult } = await routeAndLogistics({
    routing, logistics, waypoints: routedWaypoints, vehicle: current.vehicle, trip: current.trip, includeCountryDetails: true
  });
  const initialCountries = logisticsResult?.countries ?? [];
  const initialCountryMetadata = route?.country_metadata ?? null;
  let rerouteCount = 0;
  let stopReason = null;

  while (logisticsResult?.requiresReroute && rerouteCount < MAX_LOGISTICS_REROUTES) {
    const insertion = insertSplitTargets(routedWaypoints, logisticsResult.stages ?? [], logisticsResult.splitTargets ?? []);
    if (insertion.inserted === 0) {
      stopReason = "no_new_compatible_overnight";
      break;
    }
    routedWaypoints = insertion.waypoints;
    rerouteCount += 1;
    ({ route, logisticsResult } = await routeAndLogistics({
      routing, logistics, waypoints: routedWaypoints, vehicle: current.vehicle, trip: current.trip,
      includeCountryDetails: false, knownCountries: initialCountries
    }));
  }
  if (logisticsResult?.requiresReroute && rerouteCount >= MAX_LOGISTICS_REROUTES) stopReason = "reroute_limit_reached";

  setState(state => ({
    ...state,
    route: {
      ...route,
      country_metadata: route?.country_metadata ?? initialCountryMetadata,
      waypoints: routedWaypoints
    },
    trip: { ...state.trip, waypoints: requestedWaypoints }
  }));
  const stages = Array.isArray(logisticsResult?.stages) ? logisticsResult.stages : [];
  const overnights = (logisticsResult?.overnights ?? []).filter(Boolean).map(assertOvernight);
  const catalogs = logisticsResult?.catalogs ?? {};
  const unresolvedSplitPoints = logisticsResult?.unresolvedSplitPoints ?? [];
  const warnings = drivingLimitWarnings(stages, unresolvedSplitPoints, stopReason);

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
      maxDrivingLimitSatisfied: warnings.length === 0,
      rerouteCount,
      rerouteStopReason: stopReason
    }
  }));

  const enriched = await enrichment({
    trip: getState().trip, route: getState().route, overnights, catalogs,
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
