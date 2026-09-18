import { WORKSHOP_SOURCES } from "../config/workshop-sources.js";
import { registerDataset, loadDataset, loadAvailable } from "../services/data-registry.js";

function normalizeWorkshop(item, country) {
  return {
    ...item,
    tipo: "taller",
    pais: item.pais || country,
    lat: item.lat == null ? null : Number(item.lat),
    lon: item.lon == null ? null : Number(item.lon)
  };
}

const keys = [];
for (const [country, url] of Object.entries(WORKSHOP_SOURCES)) {
  const key = `workshops:${country}`;
  keys.push(key);
  registerDataset(key, { url, domain: "workshops", country, normalize: item => normalizeWorkshop(item, country) });
}

export function workshopCountries() {
  return Object.keys(WORKSHOP_SOURCES);
}

export function loadWorkshopsByCountry(country, options) {
  if (!WORKSHOP_SOURCES[country]) throw new Error(`País de talleres no registrado: ${country}`);
  return loadDataset(`workshops:${country}`, options);
}

export async function loadAllWorkshopsAvailable() {
  const result = await loadAvailable(keys);
  return { workshops: [...result.data.values()].flat(), errors: result.errors };
}
