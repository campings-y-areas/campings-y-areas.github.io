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

function featureLegCoordinates(geometry, legIndex) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  if (geometry.type === "MultiLineString") {
    const coordinates = geometry.coordinates[legIndex];
    return Array.isArray(coordinates) && coordinates.length ? coordinates : null;
  }
  if (geometry.type === "LineString" && legIndex === 0) {
    return geometry.coordinates.length ? geometry.coordinates : null;
  }
  return null;
}

function normalizeLegs(rawLegs, geometry) {
  return rawLegs.map((leg, legIndex) => {
    const coordinates = featureLegCoordinates(geometry, legIndex);
    return {
      ...leg,
      distance_m: Number(leg?.distance ?? leg?.distance_m ?? 0),
      duration_s: Number(leg?.time ?? leg?.duration_s ?? 0),
      geometry: coordinates ? { type: "LineString", coordinates } : null,
      steps: Array.isArray(leg?.steps) ? leg.steps : []
    };
  });
}

function routingOptions(preferences = {}) {
  const avoid = new Set(Array.isArray(preferences?.avoid) ? preferences.avoid : []);
  const options = [];
  if (avoid.has("peajes")) options.push("avoid=tolls");
  if (avoid.has("autopistas")) options.push("avoid=highways");
  if (avoid.has("ferris")) options.push("avoid=ferries");
  if (avoid.has("carreteras-complicadas")) options.push("less_maneuvers");
  return options;
}

export async function geoapifyRoute({ points, vehicle, preferences = {}, includeCountryDetails = false }) {
  const key = getRuntimeConfig().geoapifyKey;
  if (!key) throw new Error("Geoapify no configurado");
  const waypoints = points.map(point => `${point.lat},${point.lon}`).join("|");
  const query = new URLSearchParams({ waypoints, mode: vehicleMode(vehicle), apiKey: key });
  const options = routingOptions(preferences);
  if (options.length) query.set("avoid", options.filter(option => option.startsWith("avoid=")).map(option => option.slice(6)).join(","));
  if (options.includes("less_maneuvers")) query.set("details", includeCountryDetails ? "route_details,instruction_details" : "instruction_details");
  else if (includeCountryDetails) query.set("details", "route_details");

  const response = await fetch(`https://api.geoapify.com/v1/routing?${query.toString()}`);
  if (!response.ok) throw new Error(`Geoapify: ${response.status}`);
  const payload = await response.json();
  const feature = payload?.features?.[0];
  if (!feature?.geometry || !feature?.properties) throw new Error("Geoapify devolvió una ruta vacía");
  const rawLegs = Array.isArray(feature.properties.legs) ? feature.properties.legs : [];
  const legs = normalizeLegs(rawLegs, feature.geometry);
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
