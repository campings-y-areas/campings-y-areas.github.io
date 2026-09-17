import { getRuntimeConfig } from "../core/runtime-config.js";

function vehicleMode(vehicle) {
  const type = String(vehicle?.tipo ?? vehicle?.type ?? "").toLowerCase();
  return type.includes("moto") ? "motorcycle" : "drive";
}

function routeCountries(legs) {
  const result = [];
  for (const leg of legs) {
    const codes = Array.isArray(leg?.country_code) ? leg.country_code : (leg?.country_code ? [leg.country_code] : []);
    for (const code of codes) {
      const normalized = String(code ?? "").toLowerCase().trim();
      if (normalized && !result.includes(normalized)) result.push(normalized);
    }
  }
  return result;
}

export async function geoapifyRoute({ points, vehicle, includeCountryDetails = false }) {
  const key = getRuntimeConfig().geoapifyKey;
  if (!key) throw new Error("Geoapify no configurado");
  const waypoints = points.map(point => `${point.lat},${point.lon}`).join("|");
  const query = new URLSearchParams({ waypoints, mode: vehicleMode(vehicle), apiKey: key });
  if (includeCountryDetails) query.set("details", "route_details");

  const response = await fetch(`https://api.geoapify.com/v1/routing?${query.toString()}`);
  if (!response.ok) throw new Error(`Geoapify: ${response.status}`);
  const payload = await response.json();
  const feature = payload?.features?.[0];
  if (!feature?.geometry || !feature?.properties) throw new Error("Geoapify devolvió una ruta vacía");
  const legs = Array.isArray(feature.properties.legs) ? feature.properties.legs : [];
  return {
    geometry: feature.geometry,
    distance_m: Number(feature.properties.distance ?? 0),
    duration_s: Number(feature.properties.time ?? 0),
    legs,
    country_metadata: includeCountryDetails ? routeCountries(legs).map(country_code => ({ country_code })) : [],
    country_details_loaded: includeCountryDetails,
    provider: "geoapify"
  };
}
