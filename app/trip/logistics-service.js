import { buildDrivingStages } from "./stages.js";
import { selectStageOvernights } from "./logistics.js";

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
        route_point: point,
        duration_s: stage.duration_s,
        max_driving_seconds: stage.max_driving_seconds
      }))
    );

    return {
      stages: stagesWithOvernights,
      overnights: [
        ...stagesWithOvernights.map(stage => stage.overnight).filter(Boolean),
        ...splitTargets.map(target => target.overnight).filter(Boolean)
      ],
      splitTargets,
      unresolvedSplitPoints,
      requiresReroute: splitTargets.length > 0,
      catalogs,
      countries
    };
  };
}
