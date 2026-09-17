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

function nearestCompatible(point, available) {
  const ranked = available
    .map(entry => ({ ...entry, km: distanceKm(point, entry.item) }))
    .filter(entry => Number.isFinite(entry.km))
    .sort((a, b) => a.km - b.km);
  if (!ranked.length) return null;
  const selected = ranked[0];
  return {
    overnight: assertOvernight(selected.item),
    distance_km: selected.km,
    compatibility: selected.assessment
  };
}

export function selectStageOvernights({ stages, candidates, vehicle, preferences, travellers }) {
  const available = candidates
    .map(item => ({ item, assessment: assessOvernightCompatibility(item, { vehicle, preferences, travellers }) }))
    .filter(entry => entry.assessment.eligible);

  return stages.map((stage, index) => {
    if (stage.exceeds_max_driving) {
      const splitTargets = (stage.split_points ?? []).map(point => {
        const selected = nearestCompatible(point, available);
        if (!selected) throw new Error(`No hay pernocta compatible cerca del punto de corte ${point.id}`);
        return {
          route_point: point,
          overnight_id: selected.overnight.overnight_id,
          overnight: selected.overnight,
          overnight_distance_km: selected.distance_km,
          overnight_compatibility: selected.compatibility
        };
      });
      return {
        ...stage,
        overnight_id: null,
        base_id: null,
        overnight: null,
        overnight_distance_km: null,
        overnight_compatibility: null,
        split_targets: splitTargets,
        requires_stage_split: splitTargets.length > 0
      };
    }
    if (index === stages.length - 1) {
      return { ...stage, overnight_id: null, overnight: null, overnight_compatibility: null, requires_stage_split: false };
    }
    const selected = nearestCompatible(stage.to, available);
    if (!selected) throw new Error(`No hay pernocta compatible para ${stage.driving_stage_id}`);
    return {
      ...stage,
      overnight_id: selected.overnight.overnight_id,
      base_id: selected.overnight.overnight_id,
      overnight: selected.overnight,
      overnight_distance_km: selected.distance_km,
      overnight_compatibility: selected.compatibility,
      requires_stage_split: false
    };
  });
}
