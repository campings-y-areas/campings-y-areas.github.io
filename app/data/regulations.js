import { REGULATION_SOURCES } from "../config/regulation-sources.js";
import { registerDataset, loadDataset, loadAvailable } from "../services/data-registry.js";

const keys = [];
for (const [country, url] of Object.entries(REGULATION_SOURCES)) {
  const key = `regulations:${country}`;
  keys.push(key);
  registerDataset(key, {
    url,
    domain: "regulations",
    country,
    normalize: item => ({ ...item, pais: item.pais || country })
  });
}

export function regulationCountries() {
  return Object.keys(REGULATION_SOURCES);
}

export function loadRegulationsByCountry(country, options) {
  if (!REGULATION_SOURCES[country]) throw new Error(`País de normativas no registrado: ${country}`);
  return loadDataset(`regulations:${country}`, options);
}

export async function loadAllRegulationsAvailable() {
  const result = await loadAvailable(keys);
  return { regulations: [...result.data.values()].flat(), errors: result.errors };
}
