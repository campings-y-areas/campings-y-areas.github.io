import { buildDrivingStages } from "./stages.js";
import { selectStageOvernights } from "./logistics.js";

export function createLogisticsService({ loadCatalogs, resolveCountries }) {
  if (typeof loadCatalogs !== "function") throw new TypeError("Cargador de catálogos no configurado");
  if (typeof resolveCountries !== "function") throw new TypeError("Resolución de países no configurada");

  return async function logistics({ trip, route, vehicle }) {
    const stages = buildDrivingStages(route, trip.waypoints ?? [], {
      maxDrivingHours: trip.preferences?.maxDrivingHours
    });
    const countries = await resolveCountries({ trip, route, stages });
    if (!Array.isArray(countries) || !countries.length) {
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
    const pendingSplits = stagesWithOvernights.filter(stage => stage.requires_stage_split);
    if (pendingSplits.length) {
      const ids = pendingSplits.map(stage => stage.driving_stage_id).join(", ");
      throw new Error(`Hay tramos que superan la conducción máxima y deben dividirse sobre la ruta real antes de elegir pernocta: ${ids}`);
    }

    return {
      stages: stagesWithOvernights,
      overnights: stagesWithOvernights.map(stage => stage.overnight).filter(Boolean),
      catalogs,
      countries
    };
  };
}
