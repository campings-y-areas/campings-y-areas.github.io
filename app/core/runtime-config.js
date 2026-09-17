// Adaptador de configuración pública ya existente.
// No duplica credenciales ni URLs: las consume desde RUTAS_CONFIG.
export function getRuntimeConfig() {
  const source = globalThis.RUTAS_CONFIG;
  if (!source || typeof source !== "object") {
    throw new Error("Configuración de la aplicación no disponible");
  }
  return Object.freeze({
    geoapifyKey: source.GEOAPIFY_API_KEY || "",
    mapStyle: source.MAP_STYLE || "osm-bright",
    workerBaseUrl: source.WORKER_BASE_URL || ""
  });
}
