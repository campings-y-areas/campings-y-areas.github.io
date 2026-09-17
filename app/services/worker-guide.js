import { backendRequest } from "./backend-client.js";
import { buildGuideContext } from "../trip/guide-context.js";
import { validateGuideAgainstTrip } from "../trip/guide-validation.js";

export function createWorkerGuideGenerator({ request = backendRequest, path = "/generate" } = {}) {
  if (typeof request !== "function") throw new TypeError("Cliente Worker inválido");

  return async function generateGuideFromWorker({ state }) {
    if (!state || typeof state !== "object") throw new TypeError("Estado de viaje requerido para generar la guía");
    const context = buildGuideContext(state);
    const response = await request(path, { method: "POST", body: context });
    const guide = response?.guide ?? response;
    return validateGuideAgainstTrip(guide, state);
  };
}
