import { assertOvernight } from "../core/contracts.js";
import { assessOvernightCompatibility } from "./overnight-policy.js";

function radians(value) { return value * Math.PI / 180; }
function distanceKm(a, b) {
  const earth = 6371;
  const dLat = radians(Number(b.lat) - Number(a.lat));
  const dLon = radians(Number(b.lon) - Number(a.lon));
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(Number(a.lat))) * Math.cos(radians(Number(b.lat))) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function selectStageOvernights({ stages, candidates, vehicle, preferences, travellers }) {
  const available = candidates
    .map(item => ({ item, assessment: assessOvernightCompatibility(item, { vehicle, preferences, travellers }) }))
    .filter(entry => entry.assessment.eligible);

  return stages.map((stage, index) => {
    if (stage.exceeds_max_driving) {
      return {
        ...stage,
        overnight_id: null,
        base_id: null,
        overnight: null,
        overnight_distance_km: null,
        overnight_compatibility: null,
        requires_stage_split: true
      };
    }
    if (index === stages.length - 1) {
      return { ...stage, overnight_id: null, overnight: null, overnight_compatibility: null, requires_stage_split: false };
    }
    const ranked = available
      .map(entry => ({ ...entry, km: distanceKm(stage.to, entry.item) }))
      .filter(entry => Number.isFinite(entry.km))
      .sort((a, b) => a.km - b.km);
    if (!ranked.length) throw new Error(`No hay pernocta compatible para ${stage.driving_stage_id}`);
    const selected = ranked[0];
    const overnight = assertOvernight(selected.item);
    return {
      ...stage,
      overnight_id: overnight.overnight_id,
      base_id: overnight.overnight_id,
      overnight,
      overnight_distance_km: selected.km,
      overnight_compatibility: selected.assessment,
      requires_stage_split: false
    };
  });
}
