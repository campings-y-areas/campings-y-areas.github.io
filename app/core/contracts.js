// Contratos internos: separan identidad, geometría, logística y contenido.

export function assertPoint(point, label = "punto") {
  if (!point || typeof point !== "object") throw new TypeError(`${label} inválido`);
  const lat = Number(point.lat);
  const lon = Number(point.lon ?? point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new TypeError(`${label} sin coordenadas válidas`);
  return { ...point, lat, lon };
}

export function assertWaypoint(point) {
  const normalized = assertPoint(point, "waypoint");
  if (!String(normalized.id ?? normalized.request_point_id ?? "").trim()) {
    throw new TypeError("waypoint sin identidad estable");
  }
  return normalized;
}

export function assertRoute(route) {
  if (!route || typeof route !== "object") throw new TypeError("ruta inválida");
  if (!Array.isArray(route.legs)) throw new TypeError("ruta sin tramos");
  return route;
}

export function assertOvernight(overnight) {
  const normalized = assertPoint(overnight, "pernocta");
  const id = String(normalized.overnight_id ?? normalized.id ?? "").trim();
  if (!id) throw new TypeError("pernocta sin identidad estable");
  return { ...normalized, overnight_id: id };
}
