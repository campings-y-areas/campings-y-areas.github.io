import { getState, setState } from "../core/store.js";
import { commitCurrentTripForm } from "./form-adapter.js";
import { resolveTripPoints } from "./geocoding.js";
import { calculateRoute } from "../services/routing.js";
import { geoapifyRoute } from "../services/geoapify-client.js";

const routingProvider = Object.freeze({ route: geoapifyRoute });

export async function prepareTripFromCurrentForm() {
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

  const route = await calculateRoute({
    waypoints: points,
    vehicle: getState().vehicle,
    provider: routingProvider
  });

  setState(current => ({ ...current, route }));
  return getState();
}
