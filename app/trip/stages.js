import { assertRoute, assertWaypoint } from "../core/contracts.js";

function legDistance(leg) {
  return Number(leg.distance_m ?? leg.distance ?? leg.properties?.distance ?? 0);
}

function legDuration(leg) {
  return Number(leg.duration_s ?? leg.time ?? leg.properties?.time ?? 0);
}

function legGeometry(leg) {
  return leg.geometry ?? leg.properties?.geometry ?? null;
}

export function buildDrivingStages(routeInput, waypointInput, { maxDrivingHours = null } = {}) {
  const route = assertRoute(routeInput);
  const waypoints = waypointInput.map(assertWaypoint);
  if (route.legs.length !== waypoints.length - 1) {
    throw new Error("Los tramos de routing no coinciden con los puntos solicitados");
  }
  const maxDrivingSeconds = Number(maxDrivingHours) > 0 ? Number(maxDrivingHours) * 3600 : null;
  return route.legs.map((leg, index) => {
    const duration_s = legDuration(leg);
    return {
      driving_stage_id: `stage-${index + 1}`,
      index,
      from_point_id: waypoints[index].request_point_id ?? waypoints[index].id,
      to_point_id: waypoints[index + 1].request_point_id ?? waypoints[index + 1].id,
      from: waypoints[index],
      to: waypoints[index + 1],
      distance_m: legDistance(leg),
      duration_s,
      geometry: legGeometry(leg),
      exceeds_max_driving: maxDrivingSeconds != null && duration_s > maxDrivingSeconds,
      max_driving_seconds: maxDrivingSeconds,
      overnight_id: null,
      base_id: null
    };
  });
}
