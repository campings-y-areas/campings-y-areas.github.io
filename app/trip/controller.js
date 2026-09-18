import { getState, setState } from "../core/store.js";
import { commitCurrentTripForm } from "./form-adapter.js";
import { resolveTripPoints } from "./geocoding.js";
import { buildTrip } from "./pipeline.js";
import { routingService, logisticsService, enrichmentService } from "./runtime-services.js";
import { createGuideService } from "../services/guide-service.js";
import { createWorkerGuideGenerator } from "../services/worker-guide.js";

function pipelineGuideAdapter(service, { demo = false, demoGuide = null } = {}) {
  return async ({ trip, route, logistics, enrichment, vehicle }) => service.generate({
    trip,
    route,
    logistics,
    enrichment,
    vehicle,
    demoGuide
  }, { demo });
}

export function createProductionGuideAdapter({ request, planPath = "/plan-route", writePath = "/write-route" } = {}) {
  const remoteGenerate = createWorkerGuideGenerator({ request, planPath, writePath });
  return pipelineGuideAdapter(createGuideService({ remoteGenerate }));
}

export async function prepareTripFromCurrentForm({ guide = null } = {}) {
  commitCurrentTripForm();
  const state = getState();
  const points = await resolveTripPoints({
    originText: state.trip.originText,
    viaTexts: state.trip.viaTexts,
    destinationText: state.trip.destinationText
  });

  setState(current => ({
    ...current,
    demo: false,
    trip: { ...current.trip, waypoints: points }
  }));

  return buildTrip({
    routing: routingService,
    logistics: logisticsService,
    enrichment: enrichmentService,
    guide
  });
}
