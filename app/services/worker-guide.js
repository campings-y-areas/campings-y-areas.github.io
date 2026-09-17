import { backendRequest } from "./backend-client.js";
import { buildGuideContext } from "../trip/guide-context.js";
import { validateGuideAgainstTrip } from "../trip/guide-validation.js";
import { buildVacationDays } from "../trip/vacation-days.js";

function workerPoint(point, index, total) {
  const requestPointId = point.request_point_id ?? point.id ?? `req-${index + 1}`;
  return {
    request_point_id: String(requestPointId),
    role: index === 0 ? "origin" : index === total - 1 ? "final_destination" : "user_via",
    order: index,
    name: point.label ?? point.requested_text ?? "",
    place: point.label ?? point.requested_text ?? "",
    country: point.country ?? "",
    lat: Number.isFinite(Number(point.lat)) ? Number(point.lat) : null,
    lon: Number.isFinite(Number(point.lon)) ? Number(point.lon) : null
  };
}

function workerStage(stage, index) {
  return {
    driving_stage_id: stage.driving_stage_id,
    base_id: stage.base_id ?? stage.overnight_id ?? `base-${index + 1}`,
    overnight_id: stage.overnight_id ?? null,
    day: index + 1,
    place: stage.to?.label ?? stage.overnight?.nombre ?? stage.overnight?.name ?? "Etapa",
    country: stage.to?.country ?? stage.overnight?.pais ?? "",
    lat: Number.isFinite(Number(stage.to?.lat)) ? Number(stage.to.lat) : Number(stage.overnight?.lat),
    lon: Number.isFinite(Number(stage.to?.lon)) ? Number(stage.to.lon) : Number(stage.overnight?.lon),
    driving_km: Math.round(Number(stage.distance_m ?? 0) / 1000),
    driving_minutes: Math.round(Number(stage.duration_s ?? 0) / 60),
    start_lat: Number.isFinite(Number(stage.from?.lat)) ? Number(stage.from.lat) : null,
    start_lon: Number.isFinite(Number(stage.from?.lon)) ? Number(stage.from.lon) : null,
    request_point_id: stage.to?.request_point_id ?? null,
    requested_role: stage.to?.request_point_id ? (index === 0 ? "origin" : "user_via") : null,
    requested_lat: Number.isFinite(Number(stage.to?.requested_lat)) ? Number(stage.to.requested_lat) : null,
    requested_lon: Number.isFinite(Number(stage.to?.requested_lon)) ? Number(stage.to.requested_lon) : null,
    is_final: false,
    requested_waypoint: Boolean(stage.to?.request_point_id),
    stay_eligible: Boolean(stage.to?.request_point_id),
    overnight: stage.overnight ?? null
  };
}

function buildWorkerProfile(state) {
  const trip = state.trip ?? {};
  const points = Array.isArray(trip.waypoints) ? trip.waypoints : [];
  const stages = (trip.stages ?? []).map(workerStage);
  if (stages.length) {
    stages.at(-1).is_final = true;
    stages.at(-1).stay_eligible = true;
    if (stages.at(-1).request_point_id) stages.at(-1).requested_role = "final_destination";
  }
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
    stops: stages
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
    buildGuideContext(state);
    const profile = buildWorkerProfile(state);
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
