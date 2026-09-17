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

function authoritativeOvernightForPoint(point, available) {
  const overnightId = point?.logistics_overnight_id;
  if (!overnightId) return null;
  const entry = available.find(candidate => String(candidate.item?.overnight_id) === String(overnightId));
  if (!entry) throw new Error(`La pernocta logística ${overnightId} ya no está disponible en los catálogos cargados`);
  return {
    overnight: assertOvernight(entry.item),
    distance_km: 0,
    compatibility: entry.assessment
  };
}

export function selectStageOvernights({ stages, candidates, vehicle, preferences, travellers }) {
  const available = candidates
    .map(item => ({ item, assessment: assessOvernightCompatibility(item, { vehicle, preferences, travellers }) }))
    .filter(entry => entry.assessment.eligible);

  return stages.map((stage, index) => {
    const authoritative = authoritativeOvernightForPoint(stage.to, available);
    if (authoritative) {
      return {
        ...stage,
        overnight_id: authoritative.overnight.overnight_id,
        base_id: authoritative.overnight.overnight_id,
        overnight: authoritative.overnight,
        overnight_distance_km: 0,
        overnight_compatibility: authoritative.compatibility,
        split_targets: [],
        requires_stage_split: false,
        authoritative_logistics_stop: true
      };
    }

    if (stage.exceeds_max_driving) {
      const splitTargets = (stage.split_points ?? []).map(point => {
        const selected = nearestCompatible(point, available);
        if (!selected) {
          return {
            route_point: point,
            overnight_id: null,
            overnight: null,
            overnight_distance_km: null,
            overnight_compatibility: null,
            unavailable: true
          };
        }
        return {
          route_point: point,
          overnight_id: selected.overnight.overnight_id,
          overnight: selected.overnight,
          overnight_distance_km: selected.distance_km,
          overnight_compatibility: selected.compatibility,
          unavailable: false
        };
      });
      const usableTargets = splitTargets.filter(target => target.overnight);
      return {
        ...stage,
        overnight_id: null,
        base_id: null,
        overnight: null,
        overnight_distance_km: null,
        overnight_compatibility: null,
        split_targets: usableTargets,
        unresolved_split_points: splitTargets.filter(target => target.unavailable).map(target => target.route_point),
        requires_stage_split: usableTargets.length > 0
      };
    }

    if (index === stages.length - 1) {
      return { ...stage, overnight_id: null, overnight: null, overnight_compatibility: null, requires_stage_split: false };
    }
    const selected = nearestCompatible(stage.to, available);
    if (!selected) {
      return {
        ...stage,
        overnight_id: null,
        base_id: null,
        overnight: null,
        overnight_distance_km: null,
        overnight_compatibility: null,
        overnight_unavailable: true,
        requires_stage_split: false
      };
    }
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
