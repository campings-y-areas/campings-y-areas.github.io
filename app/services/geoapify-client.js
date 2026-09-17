import { getRuntimeConfig } from "../core/runtime-config.js";

function vehicleMode(vehicle) {
  const type = String(vehicle?.tipo ?? vehicle?.type ?? "").toLowerCase();
  return type.includes("moto") ? "motorcycle" : "drive";
}

export async function geoapifyRoute({ points, vehicle }) {
  const key = getRuntimeConfig().geoapifyKey;
  if (!key) throw new Error("Geoapify no configurado");
  const waypoints = points.map(point => `${point.lat},${point.lon}`).join("|");
  const query = new URLSearchParams({ waypoints, mode: vehicleMode(vehicle), apiKey: key });
  const response = await fetch(`https://api.geoapify.com/v1/routing?${query.toString()}`);
  if (!response.ok) throw new Error(`Geoapify: ${response.status}`);
  const payload = await response.json();
  const feature = payload?.features?.[0];
  if (!feature?.geometry || !feature?.properties) throw new Error("Geoapify devolvió una ruta vacía");
  return {
    geometry: feature.geometry,
    distance_m: Number(feature.properties.distance ?? 0),
    duration_s: Number(feature.properties.time ?? 0),
    legs: Array.isArray(feature.properties.legs) ? feature.properties.legs : [],
    provider: "geoapify"
  };
}
