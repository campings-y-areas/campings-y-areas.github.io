import { getState, setState } from "../core/store.js";
import { commitCurrentTripForm } from "./form-adapter.js";
import { resolveTripPoints } from "./geocoding.js";
import { buildTrip } from "./pipeline.js";
import { routingService, logisticsService, enrichmentService, disabledGuideService } from "./runtime-services.js";

export async function prepareTripFromCurrentForm({ guide = disabledGuideService } = {}) {
  commitCurrentTripForm();
  const state = getState();
  const points = await resolveTripPoints({
    originText: state.trip.originText,
    viaTexts: state.trip.viaTexts,
    destinationText: state.trip.destinationText
  });

  setState(current => ({
    ...current,
    trip: { ...current.trip, waypoints: points }
  }));

  return buildTrip({
    routing: routingService,
    logistics: logisticsService,
    enrichment: enrichmentService,
    guide
  });
}
