import { calculateRoute } from "../services/routing.js";
import { geoapifyRoute } from "../services/geoapify-client.js?v=2";
import { createLogisticsService } from "./logistics-service.js";
import { loadTripCatalogs } from "./catalogs.js";
import { resolveKnownTripCountries } from "./country-resolver.js";
import { enrichStages } from "./enrichment.js";

const routingProvider = Object.freeze({ route: geoapifyRoute });

export async function routingService({ waypoints, vehicle, preferences = {}, includeCountryDetails = false }) {
  return calculateRoute({ waypoints, vehicle, preferences, provider: routingProvider, includeCountryDetails });
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

