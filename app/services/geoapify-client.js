import { getRuntimeConfig } from "../core/runtime-config.js";

function vehicleMode(vehicle) {
  const type = String(vehicle?.tipo ?? vehicle?.type ?? "").toLowerCase();
  return type.includes("moto") ? "motorcycle" : "drive";
}

export function routeCountryMetadata(properties = {}) {
  const metadata = [];
  const byCode = new Map();
  const add = value => {
    const countryCode = String(value?.country_code ?? value ?? "").toLowerCase().trim();
    if (!countryCode) return;
    if (!byCode.has(countryCode)) {
      const item = typeof value === "object" ? {
        country_code: countryCode,
        country: value.country_text ?? value.country ?? null,
        state_code: value.state_code ?? null,
        state: value.state_text ?? value.state ?? null
      } : { country_code: countryCode, country: null, state_code: null, state: null };
      byCode.set(countryCode, item);
      metadata.push(item);
    }
  };
  for (const area of properties.admin_areas ?? []) add(area);
  for (const code of properties.country_code ?? []) add(code);
  return metadata;
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
  return {
    avoid: [
      avoid.has("peajes") ? "tolls" : null,
      avoid.has("autopistas") ? "highways" : null,
      avoid.has("ferris") ? "ferries" : null
    ].filter(Boolean),
    type: avoid.has("carreteras-complicadas") ? "less_maneuvers" : null
  };
}

export async function geoapifyRoute({ points, vehicle, preferences = {}, includeCountryDetails = false }) {
  const key = getRuntimeConfig().geoapifyKey;
  if (!key) throw new Error("Geoapify no configurado");
  if (!Array.isArray(points) || points.length < 2) throw new TypeError("Geoapify requiere al menos dos puntos");

  const waypoints = points.map(point => `${point.lat},${point.lon}`).join("|");
  const query = new URLSearchParams({
    waypoints,
    mode: vehicleMode(vehicle),
    format: "geojson",
    apiKey: key
  });
  const options = routingOptions(preferences);
  if (options.avoid.length) query.set("avoid", options.avoid.join("|"));
  if (options.type) query.set("type", options.type);
  // Geoapify expone los países atravesados en properties.country_code y los
  // nombres administrativos mediante details=admin_areas. route_details son
  // atributos viarios y tienen un coste adicional, por lo que no se solicitan.
  if (includeCountryDetails) query.set("details", "admin_areas");

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
    country_metadata: includeCountryDetails ? routeCountryMetadata(feature.properties) : [],
    country_details_loaded: includeCountryDetails,
    provider: "geoapify"
  };
}
