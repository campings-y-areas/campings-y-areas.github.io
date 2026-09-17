import { assertRoute, assertWaypoint } from "../core/contracts.js";

export function buildDrivingStages(routeInput, waypointInput) {
  const route = assertRoute(routeInput);
  const waypoints = waypointInput.map(assertWaypoint);
  if (route.legs.length !== waypoints.length - 1) {
    throw new Error("Los tramos de routing no coinciden con los puntos solicitados");
  }
  return route.legs.map((leg, index) => ({
    driving_stage_id: `stage-${index + 1}`,
    index,
    from_point_id: waypoints[index].request_point_id ?? waypoints[index].id,
    to_point_id: waypoints[index + 1].request_point_id ?? waypoints[index + 1].id,
    from: waypoints[index],
    to: waypoints[index + 1],
    distance_m: Number(leg.distance ?? 0),
    duration_s: Number(leg.time ?? 0),
    geometry: leg.geometry ?? null,
    overnight_id: null,
    base_id: null
  }));
}
