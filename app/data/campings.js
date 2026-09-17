import { CAMPING_SOURCES } from "../config/camping-sources.js";
import { registerDataset, loadDataset, loadAvailable } from "../services/data-registry.js";

function stableCampingId(camping, country, index) {
  const existing = camping.overnight_id ?? camping.id ?? camping.camping_id;
  if (existing != null && String(existing).trim()) return String(existing).trim();
  const name = String(camping.nombre ?? camping.name ?? "camping").trim().toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, "-").replace(/^-|-$/g, "");
  return `camping:${country}:${index}:${name || "sin-nombre"}`;
}

function normalizeCamping(camping, country, index) {
  const id = stableCampingId(camping, country, index);
  return {
    ...camping,
    id: camping.id ?? id,
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
  registerDataset(key, { url, normalize: (item, index) => normalizeCamping(item, country, index), domain: "campings", country });
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
