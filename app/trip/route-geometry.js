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

function stepDuration(step) {
  return Number(step?.time ?? step?.duration_s ?? step?.properties?.time ?? 0);
}

function stepIndexes(step) {
  const from = Number(step?.from_index ?? step?.properties?.from_index);
  const to = Number(step?.to_index ?? step?.properties?.to_index);
  return Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= from ? { from, to } : null;
}

function geometryFromCoords(coords) {
  return { type: "LineString", coordinates: coords };
}

function stepGeometryFromLeg(legGeometry, indexes) {
  const coords = coordsFromGeometry(legGeometry);
  if (!indexes || coords.length < 2 || indexes.from >= coords.length) return null;
  const to = Math.min(indexes.to, coords.length - 1);
  const slice = coords.slice(indexes.from, to + 1);
  return slice.length >= 2 ? geometryFromCoords(slice) : null;
}

export function splitPointsForDuration({ geometry, steps = [], durationSeconds, maxDrivingSeconds }) {
  const duration = Number(durationSeconds);
  const max = Number(maxDrivingSeconds);
  if (!(duration > 0) || !(max > 0) || duration <= max) return [];
  const targets = [];
  for (let seconds = max; seconds < duration; seconds += max) targets.push(seconds);

  const timedSteps = (Array.isArray(steps) ? steps : [])
    .map(step => {
      const duration = stepDuration(step);
      const indexes = stepIndexes(step);
      return { duration, geometry: stepGeometryFromLeg(geometry, indexes) };
    })
    .filter(item => item.duration > 0 && item.geometry);
  const timedTotal = timedSteps.reduce((sum, item) => sum + item.duration, 0);

  if (timedSteps.length && timedTotal > 0) {
    return targets.map(targetSeconds => {
      const scaledTarget = Math.min(timedTotal, targetSeconds * timedTotal / duration);
      let elapsed = 0;
      for (const item of timedSteps) {
        const next = elapsed + item.duration;
        if (scaledTarget <= next) {
          const fraction = item.duration > 0 ? (scaledTarget - elapsed) / item.duration : 0;
          return { ...pointAtGeometryFraction(item.geometry, fraction), driving_seconds: targetSeconds, split_basis: "geoapify_step_time" };
        }
        elapsed = next;
      }
      return { ...pointAtGeometryFraction(timedSteps.at(-1).geometry, 1), driving_seconds: targetSeconds, split_basis: "geoapify_step_time" };
    });
  }

  return targets.map(targetSeconds => ({
    ...pointAtGeometryFraction(geometry, targetSeconds / duration),
    driving_seconds: targetSeconds,
    split_basis: "geometry_fallback"
  }));
}
