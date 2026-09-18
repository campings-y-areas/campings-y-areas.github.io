import { buildDrivingStages } from "./stages.js";
import { selectStageOvernights } from "./logistics.js";

function uniqueOvernights(items) {
  const byId = new Map();
  for (const item of items) {
    if (!item?.overnight_id) continue;
    const id = String(item.overnight_id);
    if (!byId.has(id)) byId.set(id, item);
  }
  return [...byId.values()];
}

export function createLogisticsService({ loadCatalogs, resolveCountries }) {
  if (typeof loadCatalogs !== "function") throw new TypeError("Cargador de catálogos no configurado");
  if (typeof resolveCountries !== "function") throw new TypeError("Resolución de países no configurada");

  return async function logistics({ trip, route, vehicle, knownCountries = null }) {
    const stages = buildDrivingStages(route, trip.waypoints ?? [], {
      maxDrivingHours: trip.preferences?.maxDrivingHours
    });
    const countries = Array.isArray(knownCountries) && knownCountries.length
      ? [...new Set(knownCountries)]
      : await resolveCountries({ trip, route, stages });
    if (!countries.length) {
      throw new Error("No se pudo determinar ningún país para cargar la logística del viaje");
    }
    const catalogs = await loadCatalogs({
      countries,
      includeParkings: (trip.preferences?.overnightTypes ?? []).includes("parking")
    });
    const stagesWithOvernights = selectStageOvernights({
      stages,
      candidates: catalogs.overnightCandidates,
      vehicle,
      preferences: trip.preferences,
      travellers: trip.travellers
    });
    const splitTargets = stagesWithOvernights.flatMap(stage => stage.split_targets ?? []);
    const unresolvedSplitPoints = stagesWithOvernights.flatMap(stage =>
      (stage.unresolved_split_points ?? []).map(point => ({
        driving_stage_id: stage.driving_stage_id,
        route_stage_key: stage.route_stage_key ?? null,
        route_point: point,
        duration_s: stage.duration_s,
        max_driving_seconds: stage.max_driving_seconds
      }))
    );
    const overnights = uniqueOvernights(
      stagesWithOvernights.map(stage => stage.overnight).filter(Boolean)
    );
    const missingRequiredOvernights = stagesWithOvernights.filter((stage, index) =>
      index < stagesWithOvernights.length - 1 &&
      !stage.overnight &&
      !stage.requires_stage_split &&
      stage.overnight_unavailable
    );
    if (missingRequiredOvernights.length) {
      const ids = missingRequiredOvernights.map(stage => stage.driving_stage_id).join(", ");
      throw new Error(`No hay una pernocta compatible disponible para completar la ruta (${ids})`);
    }
    const proposedOvernights = splitTargets
      .filter(target => target?.overnight)
      .map(target => ({
        ...target.overnight,
        proposed_for_driving_stage_id: target.driving_stage_id,
        proposed_for_route_stage_key: target.route_stage_key ?? null,
        proposed_at_driving_seconds: Number(target.route_point?.driving_seconds ?? 0)
      }));

    return {
      stages: stagesWithOvernights,
      overnights,
      proposedOvernights,
      splitTargets,
      unresolvedSplitPoints,
      requiresReroute: splitTargets.length > 0,
      catalogs,
      countries
    };
  };
}
