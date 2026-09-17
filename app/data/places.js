import { PLACE_SOURCES } from "../config/content-sources.js";
import { registerDataset, loadDataset, loadAvailable } from "../services/data-registry.js";

function normalizePlace(item, category) {
  return {
    ...item,
    content_category: category,
    lat: item.lat == null ? null : Number(item.lat),
    lon: item.lon == null ? null : Number(item.lon)
  };
}

const keys = Object.entries(PLACE_SOURCES).map(([category, url]) => {
  const key = `places:${category}`;
  registerDataset(key, { url, domain: "places", category, normalize: item => normalizePlace(item, category) });
  return key;
});

export function loadPlacesByCategory(category, options) {
  if (!PLACE_SOURCES[category]) throw new Error(`Categoría de lugares no registrada: ${category}`);
  return loadDataset(`places:${category}`, options);
}

export async function loadPlacesAvailable() {
  const result = await loadAvailable(keys);
  return { places: [...result.data.values()].flat(), errors: result.errors };
}
