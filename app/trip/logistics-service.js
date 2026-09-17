import { buildDrivingStages } from "./stages.js";
import { selectStageOvernights } from "./logistics.js";

export function createLogisticsService({ loadCatalogs, resolveCountries }) {
  if (typeof loadCatalogs !== "function") throw new TypeError("Cargador de catálogos no configurado");
  if (typeof resolveCountries !== "function") throw new TypeError("Resolución de países no configurada");

  return async function logistics({ trip, route, vehicle }) {
    const stages = buildDrivingStages(route, trip.waypoints ?? []);
    const countries = await resolveCountries({ trip, route, stages });
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

    return {
      stages: stagesWithOvernights,
      overnights: stagesWithOvernights.map(stage => stage.overnight).filter(Boolean),
      catalogs,
      countries
    };
  };
}
