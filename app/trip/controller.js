import { getState, setState } from "../core/store.js";
import { commitCurrentTripForm } from "./form-adapter.js";
import { resolveTripPoints } from "./geocoding.js";
import { buildTrip } from "./pipeline.js";
import { routingService, logisticsService, enrichmentService } from "./runtime-services.js";
import { activateDemo, deactivateDemo } from "../demo/demo-mode.js";
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

export async function prepareDemoTrip(seed, {
  routing = null,
  logistics = null,
  enrichment = null
} = {}) {
  if (!seed?.trip?.waypoints?.length) throw new TypeError("Demo sin puntos de ruta");
  if (!seed?.guide) throw new TypeError("Demo sin guía predefinida");

  activateDemo(seed);
  const closedEditorialSeed = seed.demo_closed === true;
  const closedRoutedSeed = Boolean(seed.route?.geometry && seed.trip?.stages?.length);
  const hasInjectedServices = [routing, logistics, enrichment].every(service => typeof service === "function");

  // La demo editorial congelada comparte estado/controlador/presentación, pero no
  // finge geometría vial ni etapas de routing que nunca fueron calculadas.
  // Al estar marcada explícitamente como cerrada, no toca servicios externos.
  if ((closedEditorialSeed || closedRoutedSeed) && !hasInjectedServices) return getState();

  // Recalcular una demo exige adaptadores explícitos: nunca cae por defecto
  // en Geoapify, catálogos/enrichment de producción ni Worker/OpenAI.
  if (!hasInjectedServices) {
    deactivateDemo();
    throw new TypeError("La demo recalculada necesita servicios inyectados explícitamente");
  }

  const guideService = createGuideService();
  const guide = pipelineGuideAdapter(guideService, { demo: true, demoGuide: seed.guide });

  try {
    return await buildTrip({ routing, logistics, enrichment, guide });
  } catch (error) {
    deactivateDemo();
    throw error;
  }
}

export function closeDemoTrip() {
  return deactivateDemo();
}
