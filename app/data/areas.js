import { AREA_SOURCES } from "../config/area-sources.js";
import { registerDataset, loadDataset, loadAvailable } from "../services/data-registry.js";

function token(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9áéíóúüñ.-]+/gi, "-").replace(/^-|-$/g, "");
}

function pointPrefix(point, country) {
  const type = token(point.tipo ?? "area") || "area";
  return `${type}:${token(country)}:`;
}

function sourcePointId(point, country) {
  const prefix = pointPrefix(point, country);
  const existing = point.overnight_id ?? point.id ?? point.area_id ?? point.parking_id;
  if (existing == null || !String(existing).trim()) return null;
  const value = String(existing).trim();
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function stablePointId(point, country) {
  const prefix = pointPrefix(point, country);
  const existing = point.overnight_id ?? point.id ?? point.area_id ?? point.parking_id;
  if (existing != null && String(existing).trim()) {
    const value = String(existing).trim();
    return value.startsWith(prefix) ? value : `${prefix}${value}`;
  }
  const type = token(point.tipo ?? "area") || "area";
  const name = token(point.nombre ?? point.name ?? type) || "sin-nombre";
  const locality = token(point.localidad ?? point.ciudad ?? point.city ?? point.municipio);
  const lat = Number(point.lat);
  const lon = Number(point.lon);
  const coords = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(5)}:${lon.toFixed(5)}` : "sin-coordenadas";
  return `${prefix}${locality || "sin-localidad"}:${name}:${coords}`;
}

function normalizePoint(point, country) {
  const id = stablePointId(point, country);
  return {
    ...point,
    source_id: point.source_id ?? sourcePointId(point, country),
    id,
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
