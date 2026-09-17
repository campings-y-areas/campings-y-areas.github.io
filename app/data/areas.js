import { AREA_SOURCES } from "../config/area-sources.js";
import { registerDataset, loadDataset, loadAvailable } from "../services/data-registry.js";

function normalizePoint(point, country) {
  return {
    ...point,
    pais: point.pais || country,
    region: point.region || point.comunidad_autonoma || null,
    lat: point.lat == null ? null : Number(point.lat),
    lon: point.lon == null ? null : Number(point.lon)
  };
}

const keys = [];
for (const [country, url] of Object.entries(AREA_SOURCES)) {
  const key = `areas:${country}`;
  keys.push(key);
  registerDataset(key, { url, normalize: item => normalizePoint(item, country), domain: "areas", country });
}

export function areaCountries() {
  return Object.keys(AREA_SOURCES);
}

export function loadAreasByCountry(country, options) {
  if (!AREA_SOURCES[country]) throw new Error(`País de áreas no registrado: ${country}`);
  return loadDataset(`areas:${country}`, options);
}

export async function loadAllAreasAvailable() {
  const result = await loadAvailable(keys);
  return { points: [...result.data.values()].flat(), errors: result.errors };
}

export async function loadOvernightCandidates(country, { includeParkings = false } = {}) {
  const points = await loadAreasByCountry(country);
  return points.filter(point => {
    const type = String(point.tipo ?? "area").toLowerCase();
    if (type.includes("parking")) return includeParkings;
    return type.includes("area") || type.includes("autocaravana") || type === "";
  });
}
