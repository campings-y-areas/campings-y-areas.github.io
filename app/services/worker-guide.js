import { backendRequest } from "./backend-client.js";
import { buildGuideContext } from "../trip/guide-context.js";
import { validateGuideAgainstTrip } from "../trip/guide-validation.js";
import { buildVacationDays } from "../trip/vacation-days.js";

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointIdentity(point) {
  return point?.request_point_id ?? point?.id ?? null;
}

function requestedPointIds(points) {
  const ids = new Set();
  for (const point of points) {
    const id = pointIdentity(point);
    if (id != null && String(id).trim()) ids.add(String(id));
  }
  return ids;
}

function workerPoint(point, index, total) {
  const requestPointId = pointIdentity(point) ?? `req-${index + 1}`;
  return {
    request_point_id: String(requestPointId),
    role: index === 0 ? "origin" : index === total - 1 ? "final_destination" : "user_via",
    order: index,
    name: point.label ?? point.requested_text ?? "",
    place: point.label ?? point.requested_text ?? "",
    country: point.country ?? "",
    lat: finiteNumber(point.lat),
    lon: finiteNumber(point.lon)
  };
}

function assertWorkerStageIdentity(stage) {
  const fromId = stage?.from_point_id;
  const toId = stage?.to_point_id;
  const routeKey = stage?.route_stage_key;
  if (fromId == null || !String(fromId).trim() || toId == null || !String(toId).trim()) {
    throw new Error(`La etapa ${stage?.driving_stage_id ?? "sin-id"} no tiene extremos autoritativos para el Worker`);
  }
  const expected = `${fromId}=>${toId}`;
  if (routeKey == null || String(routeKey) !== expected) {
    throw new Error(`La etapa ${stage?.driving_stage_id ?? "sin-id"} no tiene una identidad física válida para el Worker`);
  }
}

function workerStage(stage, index, total, requestedIds) {
  assertWorkerStageIdentity(stage);
  const final = index === total - 1;
  const toId = String(stage.to_point_id ?? "");
  const requestedWaypoint = requestedIds.has(toId);
  const overnightId = stage.overnight_id ?? null;
  const baseId = stage.base_id ?? overnightId ?? null;
  return {
    driving_stage_id: stage.driving_stage_id,
    route_stage_key: stage.route_stage_key,
    from_point_id: stage.from_point_id,
    to_point_id: stage.to_point_id,
    base_id: baseId,
    overnight_id: overnightId,
    day: index + 1,
    place: stage.overnight?.nombre ?? stage.overnight?.name ?? stage.to?.label ?? "Etapa",
    country: stage.overnight?.pais ?? stage.overnight?.country ?? stage.to?.country ?? "",
    lat: finiteNumber(stage.overnight?.lat) ?? finiteNumber(stage.to?.lat),
    lon: finiteNumber(stage.overnight?.lon ?? stage.overnight?.lng) ?? finiteNumber(stage.to?.lon ?? stage.to?.lng),
    driving_km: Math.round(Number(stage.distance_m ?? 0) / 1000),
    driving_minutes: Math.round(Number(stage.duration_s ?? 0) / 60),
    start_lat: finiteNumber(stage.from?.lat),
    start_lon: finiteNumber(stage.from?.lon),
    request_point_id: requestedWaypoint ? toId : null,
    requested_role: requestedWaypoint ? (final ? "final_destination" : "user_via") : null,
    requested_lat: requestedWaypoint ? finiteNumber(stage.to?.requested_lat ?? stage.to?.lat) : null,
    requested_lon: requestedWaypoint ? finiteNumber(stage.to?.requested_lon ?? stage.to?.lon) : null,
    is_final: final,
    requested_waypoint: requestedWaypoint,
    stay_eligible: requestedWaypoint || final,
    overnight: stage.overnight ?? null,
    overnight_compatibility: stage.overnight_compatibility ?? null,
    content: stage.content ?? {}
  };
}

function buildWorkerProfile(state, guideContext) {
  const trip = state.trip ?? {};
  const points = Array.isArray(trip.waypoints) ? trip.waypoints : [];
  const requestedIds = requestedPointIds(points);
  const sourceStages = Array.isArray(trip.stages) ? trip.stages : [];
  const stages = sourceStages.map((stage, index) => workerStage(stage, index, sourceStages.length, requestedIds));
  const vacationDays = buildVacationDays(trip);
  const travellers = trip.travellers ?? {};
  const preferences = trip.preferences ?? {};
  return {
    route_contract_version: "route-contract-v3",
    origin: points[0]?.label ?? trip.originText ?? "",
    destination: points.at(-1)?.label ?? trip.destinationText ?? "",
    country: points.at(-1)?.country ?? "",
    start_date: trip.departureDate ?? "",
    vehicle: state.vehicle?.tipo ?? "autocaravana",
    adults: Number(travellers.adults) || 1,
    children_count: Math.max(0, Number(travellers.children) || 0),
    children: Array.isArray(travellers.childAges) ? travellers.childAges : [],
    family_recommendations: Boolean(travellers.childRecommendations),
    pet: Boolean(travellers.pet),
    max_driving_hours: Number(preferences.maxDrivingHours) || 4,
    minimum_required_days: Math.max(1, stages.length),
    trip_days: Math.max(1, Number(trip.days) || 1),
    requested_via: points.slice(1, -1).map(point => point.requested_text ?? point.label ?? "").filter(Boolean),
    pace: preferences.pace ?? "equilibrado",
    interests: preferences.interests ?? [],
    overnight_types: preferences.overnightTypes ?? [],
    overnight_preference: (preferences.overnightTypes ?? []).length ? `solo estas opciones seleccionadas por el usuario: ${preferences.overnightTypes.join(", ")}` : "sin preferencia indicada",
    avoid_preferences: preferences.avoid ?? [],
    budget: preferences.budget ?? "",
    visual_content: preferences.visualMode === "minimo" ? "minimo" : "completo",
    user_notes: preferences.notes ?? "",
    request_points: points.map((point, index) => workerPoint(point, index, points.length)),
    stages,
    vacation_days: vacationDays,
    stops: stages,
    route_facts: guideContext.routeFacts,
    editorial_material: guideContext.editorialMaterial,
    editorial_brief: guideContext.editorialBrief
  };
}

function assertWorkerResult(response, expectedStatus, phase) {
  if (!response || typeof response !== "object") throw new Error(`Respuesta inválida del Worker durante ${phase}`);
  if (response.ok !== true || response.status !== expectedStatus) {
    const error = new Error(response.message ?? response.error ?? `El Worker no completó ${phase}: ${response.status ?? "estado desconocido"}`);
    error.workerResponse = response;
    throw error;
  }
  return response;
}

export function createWorkerGuideGenerator({ request = backendRequest, planPath = "/plan-route", writePath = "/write-route" } = {}) {
  if (typeof request !== "function") throw new TypeError("Cliente Worker inválido");

  return async function generateGuideFromWorker(payload) {
    if (!payload || typeof payload !== "object") throw new TypeError("Viaje requerido para generar la guía");
    const state = {
      trip: payload.trip,
      route: payload.route,
      logistics: payload.logistics,
      enrichment: payload.enrichment,
      vehicle: payload.vehicle
    };
    const guideContext = buildGuideContext(state);
    const profile = buildWorkerProfile(state, guideContext);
    const planned = assertWorkerResult(
      await request(planPath, { method: "POST", body: profile }),
      "planned",
      "la planificación"
    );
    if (!planned.plan) throw new Error("El Worker no devolvió el plan de ruta");

    const writeProfile = { ...profile, plan: planned.plan };
    delete writeProfile.country;
    const written = assertWorkerResult(
      await request(writePath, { method: "POST", body: writeProfile }),
      "written",
      "la redacción"
    );
    if (!written.guide) throw new Error("El Worker no devolvió la guía redactada");
    return validateGuideAgainstTrip(written.guide, state);
  };
}
