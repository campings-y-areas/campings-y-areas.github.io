import { calculateRoute } from "../services/routing.js";
import { geoapifyRoute } from "../services/geoapify-client.js";
import { createLogisticsService } from "./logistics-service.js";
import { loadTripCatalogs } from "./catalogs.js";
import { resolveKnownTripCountries } from "./country-resolver.js";
import { enrichStages } from "./enrichment.js";

const routingProvider = Object.freeze({ route: geoapifyRoute });

export async function routingService({ waypoints, vehicle, includeCountryDetails = false }) {
  return calculateRoute({ waypoints, vehicle, provider: routingProvider, includeCountryDetails });
}

export const logisticsService = createLogisticsService({
  loadCatalogs: loadTripCatalogs,
  resolveCountries: resolveKnownTripCountries
});

export async function enrichmentService({ trip, catalogs }) {
  return {
    stages: enrichStages({ stages: trip.stages ?? [], catalogs }),
    catalogs
  };
}

export async function disabledGuideService() {
  throw new Error("Generación IA desactivada durante la reconstrucción");
}
