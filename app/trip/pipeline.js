import { getState, setState } from "../core/store.js";
import { assertOvernight, assertRoute, assertWaypoint } from "../core/contracts.js";

const MAX_LOGISTICS_REROUTES = 4;

function stageIdentity(stage) {
  return String(stage?.route_stage_key ?? stage?.driving_stage_id ?? "");
}

function targetStageIdentity(target) {
  return String(target?.route_stage_key ?? target?.driving_stage_id ?? "");
}

function overnightWaypoint(target) {
  const overnight = assertOvernight(target.overnight);
  const stageKey = targetStageIdentity(target) || "stage";
  const overnightId = String(overnight.overnight_id);
  const id = `logistics:overnight:${overnightId}`;
  return assertWaypoint({
    id,
    label: overnight.nombre ?? overnight.name ?? "Pernocta logística",
    country: overnight.pais ?? null,
    country_code: overnight.country_code ?? null,
    lat: Number(overnight.lat),
    lon: Number(overnight.lon),
    synthetic_route_point: true,
    generated_by: "logistics",
    logistics_overnight_id: overnightId,
    logistics_stage_key: stageKey,
    logistics_stage_id: target.driving_stage_id ?? null
  });
}

function insertSplitTargets(routeWaypoints, stages, splitTargets) {
  if (!splitTargets.length) return { waypoints: routeWaypoints, inserted: 0 };
  const targetsByStage = new Map(stages.map(stage => [stageIdentity(stage), []]));
  for (const target of splitTargets) {
    const key = targetStageIdentity(target);
    if (targetsByStage.has(key)) targetsByStage.get(key).push(target);
  }

  const existingStops = new Set(routeWaypoints
    .filter(point => point?.logistics_overnight_id)
    .map(point => `${String(point.logistics_stage_key ?? "")}::${String(point.logistics_overnight_id)}`));
  const result = [];
  let inserted = 0;

  stages.forEach((stage, stageIndex) => {
    if (stageIndex === 0) result.push(routeWaypoints[0]);
    const targets = targetsByStage.get(stageIdentity(stage)) ?? [];
    for (const target of targets) {
      const point = overnightWaypoint(target);
      const overnightKey = `${String(point.logistics_stage_key ?? "")}::${String(point.logistics_overnight_id)}`;
      if (!existingStops.has(overnightKey)) {
        existingStops.add(overnightKey);
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
  const unresolvedStages = new Set(unresolvedSplitPoints.map(item => item.route_stage_key ?? item.driving_stage_id));
  return stages
    .filter(stage => stage.exceeds_max_driving && Number(stage.max_driving_seconds) > 0)
    .map(stage => {
      const excessSeconds = Math.max(0, Number(stage.duration_s) - Number(stage.max_driving_seconds));
      const noCompatibleStop = unresolvedStages.has(stage.route_stage_key ?? stage.driving_stage_id);
      const rerouteLimitReached = stopReason === "reroute_limit_reached" && !noCompatibleStop;
      const convergedWithoutNewStop = stopReason === "no_new_compatible_overnight" && !noCompatibleStop;
      return {
        code: noCompatibleStop
          ? "max_driving_exceeded_no_compatible_overnight"
          : rerouteLimitReached
            ? "max_driving_exceeded_reroute_limit"
            : convergedWithoutNewStop ? "max_driving_exceeded_logistics_converged" : "max_driving_exceeded",
        driving_stage_id: stage.driving_stage_id,
        route_stage_key: stage.route_stage_key ?? null,
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

function proposedOvernights(logisticsResult) {
  return (logisticsResult?.proposedOvernights ?? []).filter(Boolean).map(assertOvernight);
}

function assertNoUncommittedOvernights(logisticsResult, stopReason) {
  const proposed = proposedOvernights(logisticsResult);
  if (!proposed.length) return;
  const ids = proposed.map(item => item.overnight_id).join(", ");
  throw new Error(`La logística terminó con pernoctas propuestas sin confirmar en la ruta${ids ? `: ${ids}` : ""}. Motivo: ${stopReason ?? "desconocido"}`);
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

  const pendingProposals = proposedOvernights(logisticsResult);
  setState(state => ({
    ...state,
    logistics: {
      ...state.logistics,
      proposedOvernights: pendingProposals,
      rerouteCount,
      rerouteStopReason: stopReason
    }
  }));
  assertNoUncommittedOvernights(logisticsResult, stopReason);

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
      proposedOvernights: [],
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

  if (typeof guide === "function") {
    const finalGuide = await guide({
      trip: getState().trip,
      route: getState().route,
      logistics: getState().logistics,
      enrichment: getState().enrichment,
      vehicle: getState().vehicle
    });
    setState(state => ({ ...state, guide: finalGuide }));
  } else {
    setState(state => ({ ...state, guide: null }));
  }
  return getState();
}
