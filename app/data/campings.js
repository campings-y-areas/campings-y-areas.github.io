import { CAMPING_SOURCES } from "../config/camping-sources.js";
import { registerDataset, loadDataset, loadAvailable } from "../services/data-registry.js";

function token(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9áéíóúüñ.-]+/gi, "-").replace(/^-|-$/g, "");
}

function campingPrefix(country) {
  return `camping:${token(country)}:`;
}

function sourceCampingId(camping, country) {
  const prefix = campingPrefix(country);
  const existing = camping.overnight_id ?? camping.id ?? camping.camping_id;
  if (existing == null || !String(existing).trim()) return null;
  const value = String(existing).trim();
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function stableCampingId(camping, country) {
  const prefix = campingPrefix(country);
  const existing = camping.overnight_id ?? camping.id ?? camping.camping_id;
  if (existing != null && String(existing).trim()) {
    const value = String(existing).trim();
    return value.startsWith(prefix) ? value : `${prefix}${value}`;
  }
  const name = token(camping.nombre ?? camping.name ?? "camping") || "sin-nombre";
  const locality = token(camping.localidad ?? camping.ciudad ?? camping.city ?? camping.municipio);
  const lat = Number(camping.lat);
  const lon = Number(camping.lon);
  const coords = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(5)}:${lon.toFixed(5)}` : "sin-coordenadas";
  return `${prefix}${locality || "sin-localidad"}:${name}:${coords}`;
}

function normalizeCamping(camping, country) {
  const id = stableCampingId(camping, country);
  return {
    ...camping,
    source_id: camping.source_id ?? sourceCampingId(camping, country),
    id,
    overnight_id: id,
    tipo: camping.tipo || "camping",
    pais: camping.pais || country,
    region: camping.region || camping.comunidad_autonoma || null,
    lat: camping.lat == null ? null : Number(camping.lat),
    lon: camping.lon == null ? null : Number(camping.lon)
  };
}

const keys = [];
for (const [country, url] of Object.entries(CAMPING_SOURCES)) {
  const key = `campings:${country}`;
  keys.push(key);
  registerDataset(key, { url, normalize: item => normalizeCamping(item, country), domain: "campings", country });
}

export function campingCountries() {
  return Object.keys(CAMPING_SOURCES);
}

export function loadCampingsByCountry(country, options) {
  if (!CAMPING_SOURCES[country]) throw new Error(`País de campings no registrado: ${country}`);
  return loadDataset(`campings:${country}`, options);
}

export async function loadAllCampingsAvailable() {
  const result = await loadAvailable(keys);
  return {
    campings: [...result.data.values()].flat(),
    errors: result.errors
  };
}
