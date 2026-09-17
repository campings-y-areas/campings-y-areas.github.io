import { assertOvernight } from "../core/contracts.js";
import { isOvernightCompatible } from "./overnight-policy.js";

function radians(value) { return value * Math.PI / 180; }
function distanceKm(a, b) {
  const earth = 6371;
  const dLat = radians(Number(b.lat) - Number(a.lat));
  const dLon = radians(Number(b.lon) - Number(a.lon));
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(Number(a.lat))) * Math.cos(radians(Number(b.lat))) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function selectStageOvernights({ stages, candidates, vehicle, preferences, travellers }) {
  const available = candidates.filter(item => isOvernightCompatible(item, { vehicle, preferences, travellers }));
  return stages.map((stage, index) => {
    if (index === stages.length - 1) return { ...stage, overnight_id: null, overnight: null };
    const ranked = available
      .map(item => ({ item, km: distanceKm(stage.to, item) }))
      .filter(entry => Number.isFinite(entry.km))
      .sort((a, b) => a.km - b.km);
    if (!ranked.length) throw new Error(`No hay pernocta compatible para ${stage.driving_stage_id}`);
    const overnight = assertOvernight(ranked[0].item);
    return {
      ...stage,
      overnight_id: overnight.overnight_id,
      base_id: overnight.overnight_id,
      overnight,
      overnight_distance_km: ranked[0].km
    };
  });
}
