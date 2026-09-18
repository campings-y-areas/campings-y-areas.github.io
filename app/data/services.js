import { SERVICE_SOURCES } from "../config/content-sources.js";
import { registerDataset, loadDataset, loadAvailable } from "../services/data-registry.js";

function normalizeService(item, category) {
  const normalized = {
    ...item,
    service_category: category,
    lat: item.lat == null ? null : Number(item.lat),
    lon: item.lon == null ? null : Number(item.lon)
  };
  if (category === "guarderias") {
    normalized.tipo = "guarderia_vehiculos_camping";
    normalized.guarderia_vehiculos_camping = true;
  }
  return normalized;
}

const keys = Object.entries(SERVICE_SOURCES).map(([category, url]) => {
  const key = `services:${category}`;
  registerDataset(key, { url, domain: "services", category, normalize: item => normalizeService(item, category) });
  return key;
});

export function loadServicesByCategory(category, options) {
  if (!SERVICE_SOURCES[category]) throw new Error(`Categoría de servicios no registrada: ${category}`);
  return loadDataset(`services:${category}`, options);
}

export async function loadServicesAvailable() {
  const result = await loadAvailable(keys);
  const services = [...result.data.values()].flat();
  return {
    services,
    restaurants: services.filter(item => item.service_category === "restaurantes"),
    errors: result.errors
  };
}
