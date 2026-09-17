function coordsFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return geometry.coordinates ?? [];
  if (geometry.type === "MultiLineString") return (geometry.coordinates ?? []).flat();
  return [];
}

function radians(value) { return value * Math.PI / 180; }
function segmentKm(a, b) {
  const lat1 = radians(Number(a[1]));
  const lat2 = radians(Number(b[1]));
  const dLat = lat2 - lat1;
  const dLon = radians(Number(b[0]) - Number(a[0]));
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function pointAtGeometryFraction(geometry, fraction) {
  const coords = coordsFromGeometry(geometry);
  if (coords.length < 2) throw new Error("Geometría insuficiente para obtener un punto de corte");
  const targetFraction = Math.max(0, Math.min(1, Number(fraction)));
  const lengths = [];
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const km = segmentKm(coords[i - 1], coords[i]);
    lengths.push(km);
    total += km;
  }
  if (!(total > 0)) throw new Error("Geometría sin longitud utilizable");
  const target = total * targetFraction;
  let walked = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const next = walked + lengths[i];
    if (target <= next || i === lengths.length - 1) {
      const ratio = lengths[i] > 0 ? (target - walked) / lengths[i] : 0;
      const a = coords[i];
      const b = coords[i + 1];
      return {
        lat: Number(a[1]) + (Number(b[1]) - Number(a[1])) * ratio,
        lon: Number(a[0]) + (Number(b[0]) - Number(a[0])) * ratio,
        route_fraction: targetFraction
      };
    }
    walked = next;
  }
  return { lat: Number(coords.at(-1)[1]), lon: Number(coords.at(-1)[0]), route_fraction: 1 };
}

export function splitFractionsForDuration(durationSeconds, maxDrivingSeconds) {
  const duration = Number(durationSeconds);
  const max = Number(maxDrivingSeconds);
  if (!(duration > 0) || !(max > 0) || duration <= max) return [];
  const parts = Math.ceil(duration / max);
  return Array.from({ length: parts - 1 }, (_, index) => (index + 1) / parts);
}
