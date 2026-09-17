import { AREA_SOURCES } from "../config/area-sources.js";
import { registerDataset, loadDataset, loadAvailable } from "../services/data-registry.js";

function stablePointId(point, country, index) {
  const existing = point.overnight_id ?? point.id ?? point.area_id ?? point.parking_id;
  if (existing != null && String(existing).trim()) return String(existing).trim();
  const type = String(point.tipo ?? "area").trim().toLowerCase() || "area";
  const name = String(point.nombre ?? point.name ?? type).trim().toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, "-").replace(/^-|-$/g, "");
  return `${type}:${country}:${index}:${name || "sin-nombre"}`;
}

function normalizePoint(point, country, index) {
  const id = stablePointId(point, country, index);
  return {
    ...point,
    id: point.id ?? id,
    overnight_id: id,
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
  registerDataset(key, { url, normalize: (item, index) => normalizePoint(item, country, index), domain: "areas", country });
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
