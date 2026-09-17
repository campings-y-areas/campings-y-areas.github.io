import { assertRoute, assertWaypoint } from "../core/contracts.js";
import { splitPointsForDuration } from "./route-geometry.js";

function legDistance(leg) {
  return Number(leg.distance_m ?? leg.distance ?? leg.properties?.distance ?? 0);
}

function legDuration(leg) {
  return Number(leg.duration_s ?? leg.time ?? leg.properties?.time ?? 0);
}

function legGeometry(leg) {
  return leg.geometry ?? leg.properties?.geometry ?? null;
}

function legSteps(leg) {
  return leg.steps ?? leg.properties?.steps ?? [];
}

function pointIdentity(point) {
  const id = point?.request_point_id ?? point?.id ?? null;
  if (id == null || !String(id).trim()) throw new Error("Punto de ruta sin identidad estable");
  return String(id);
}

function stageRouteKey(fromPoint, toPoint) {
  return `${pointIdentity(fromPoint)}=>${pointIdentity(toPoint)}`;
}

export function buildDrivingStages(routeInput, waypointInput, { maxDrivingHours = null } = {}) {
  const route = assertRoute(routeInput);
  const waypoints = waypointInput.map(assertWaypoint);
  if (route.legs.length !== waypoints.length - 1) {
    throw new Error("Los tramos de routing no coinciden con los puntos solicitados");
  }
  const maxDrivingSeconds = Number(maxDrivingHours) > 0 ? Number(maxDrivingHours) * 3600 : null;
  return route.legs.map((leg, index) => {
    const from = waypoints[index];
    const to = waypoints[index + 1];
    const fromPointId = pointIdentity(from);
    const toPointId = pointIdentity(to);
    const routeKey = stageRouteKey(from, to);
    const duration_s = legDuration(leg);
    const geometry = legGeometry(leg);
    const rawSplitPoints = maxDrivingSeconds ? splitPointsForDuration({
      geometry,
      steps: legSteps(leg),
      durationSeconds: duration_s,
      maxDrivingSeconds
    }) : [];
    const splitPoints = rawSplitPoints.map((point, splitIndex) => ({
      id: `route-split:${routeKey}:${splitIndex + 1}`,
      requested_text: null,
      ...point,
      synthetic_route_point: true,
      generated_by: "max_driving_split",
      parent_route_key: routeKey
    }));
    return {
      // driving_stage_id conserva el formato route-contract-v3; route_stage_key es la
      // identidad interna estable para relacionar el tramo con sus extremos reales.
      driving_stage_id: `stage-${index + 1}`,
      route_stage_key: routeKey,
      index,
      from_point_id: fromPointId,
      to_point_id: toPointId,
      from,
      to,
      distance_m: legDistance(leg),
      duration_s,
      geometry,
      exceeds_max_driving: splitPoints.length > 0,
      max_driving_seconds: maxDrivingSeconds,
      split_points: splitPoints,
      overnight_id: null,
      base_id: null
    };
  });
}
