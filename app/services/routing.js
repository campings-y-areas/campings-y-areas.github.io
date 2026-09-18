import { assertWaypoint } from "../core/contracts.js";

// Adaptador único de routing. La IA nunca calcula geometría, distancia ni duración.
export async function calculateRoute({ waypoints, vehicle, preferences = {}, provider, includeCountryDetails = false }) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    throw new TypeError("Se necesitan al menos origen y destino");
  }
  const points = waypoints.map(assertWaypoint);
  if (!provider || typeof provider.route !== "function") {
    throw new TypeError("Proveedor de routing no configurado");
  }
  const route = await provider.route({ points, vehicle, preferences, includeCountryDetails });
  if (!route || !Array.isArray(route.legs)) throw new Error("Respuesta de routing inválida");
  return route;
}
