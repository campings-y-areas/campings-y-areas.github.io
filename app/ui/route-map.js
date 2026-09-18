let map = null;
let routeLayer = null;
let markers = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function ensureMap() {
  const element = document.getElementById("mapaRuta");
  if (!element || !globalThis.L) return null;
  if (map) return map;
  const config = globalThis.RUTAS_CONFIG ?? {};
  map = L.map(element).setView([48.5, 9], 5);
  const retina = L.Browser.retina;
  const style = config.MAP_STYLE || "osm-bright";
  const base = `https://maps.geoapify.com/v1/tile/${style}/{z}/{x}/{y}.png?apiKey={apiKey}`;
  const hi = `https://maps.geoapify.com/v1/tile/${style}/{z}/{x}/{y}@2x.png?apiKey={apiKey}`;
  L.tileLayer(retina ? hi : base, {
    apiKey: config.GEOAPIFY_API_KEY,
    maxZoom: 20,
    attribution: 'Powered by <a href="https://www.geoapify.com/" target="_blank">Geoapify</a> | <a href="https://openmaptiles.org/" target="_blank">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a> contributors'
  }).addTo(map);
  return map;
}

export function renderRouteMap(route) {
  const activeMap = ensureMap();
  if (!activeMap || !route?.geometry) return;
  if (routeLayer) activeMap.removeLayer(routeLayer);
  markers.forEach(marker => activeMap.removeLayer(marker));
  markers = [];

  routeLayer = L.geoJSON({ type: "Feature", properties: {}, geometry: route.geometry }, {
    style: { weight: 5, opacity: 0.8 }
  }).addTo(activeMap);

  const points = Array.isArray(route.waypoints) ? route.waypoints : [];
  points.forEach((point, index) => {
    if (!Number.isFinite(Number(point?.lat)) || !Number.isFinite(Number(point?.lon))) return;
    const final = index === points.length - 1;
    const title = index === 0 ? "Salida" : final ? "Destino" : point.synthetic_route_point ? "Pernocta logística" : `Parada ${index}`;
    const label = point.label ?? point.nombre ?? point.name ?? "";
    markers.push(L.marker([Number(point.lat), Number(point.lon)])
      .addTo(activeMap)
      .bindPopup(`<strong>${escapeHtml(title)}</strong><br>${escapeHtml(label)}`));
  });

  const bounds = routeLayer.getBounds();
  if (bounds.isValid()) activeMap.fitBounds(bounds, { padding: [24, 24] });
  setTimeout(() => activeMap.invalidateSize(), 100);
}
