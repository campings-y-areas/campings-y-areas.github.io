function same(a, b) { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

function expectedStages(profile) {
  const exactById = new Map((profile.route_facts?.stages ?? []).map(stage => [stage.driving_stage_id, stage]));
  return new Map(profile.stages.map(stage => {
    const exact = exactById.get(stage.driving_stage_id);
    if (!exact) throw new Error(`Faltan hechos autoritativos de ${stage.driving_stage_id}`);
    return [stage.driving_stage_id, {
      driving_stage_id: stage.driving_stage_id,
      route_stage_key: exact.route_stage_key,
      from_point_id: exact.from_point_id,
      to_point_id: exact.to_point_id,
      overnight_id: exact.overnight_id ?? null,
      base_id: exact.base_id ?? exact.overnight_id ?? null,
      distance_m: number(exact.distance_m),
      duration_s: number(exact.duration_s),
      overnight_compatibility: exact.overnight_compatibility ?? null
    }];
  }));
}

function expectedVacationDays(profile) {
  const days = Array.isArray(profile.vacation_days) ? profile.vacation_days : [];
  return new Map(days.map(day => [String(day.vacation_day_id), day]));
}

function copyAuthoritative(day, expected) {
  day.driving_stage_id = expected.driving_stage_id;
  day.route_stage_key = expected.route_stage_key;
  day.from_point_id = expected.from_point_id;
  day.to_point_id = expected.to_point_id;
  day.overnight_id = expected.overnight_id;
  day.base_id = expected.base_id;
  day.distance_m = expected.distance_m;
  day.duration_s = expected.duration_s;
  day.overnight_compatibility = expected.overnight_compatibility;
}

function enforceVacationDays(guide, profile) {
  const expected = expectedVacationDays(profile);
  if (!expected.size) return;
  if (guide.days.length !== expected.size) throw new Error("La guía no coincide con el número de días del viaje");
  const seen = new Set();
  guide.days.forEach((day, index) => {
    const fallback = profile.vacation_days[index];
    const id = String(day?.vacation_day_id ?? fallback?.vacation_day_id ?? "");
    const facts = expected.get(id);
    if (!facts || seen.has(id)) throw new Error(`La guía alteró la identidad del día ${index + 1}`);
    seen.add(id);
    for (const field of ["day", "travel_date", "day_type", "request_point_id", "requested_waypoint", "is_final", "stay_eligible", "base_id", "overnight_id"]) {
      if (day[field] != null && !same(day[field], facts[field])) throw new Error(`La guía intentó cambiar ${field} de ${id}`);
      day[field] = facts[field] ?? null;
    }
    day.vacation_day_id = id;
    if (facts.day_type === "estancia") {
      day.driving_stage_id = null;
      day.route_stage_key = facts.route_stage_key ?? null;
      day.driving_km = 0;
      day.driving_minutes = 0;
    }
  });
  if (seen.size !== expected.size) throw new Error("La guía omitió días del viaje");
}

export function validateGeneratedGuide(guide, profile) {
  if (!guide || typeof guide !== "object" || !Array.isArray(guide.days)) throw new Error("Guía generada inválida");
  enforceVacationDays(guide, profile);
  const expected = expectedStages(profile);
  const seen = new Set();

  for (const day of guide.days) {
    if (!day?.driving_stage_id) continue;
    const facts = expected.get(day.driving_stage_id);
    if (!facts) throw new Error(`La guía inventó el tramo ${day.driving_stage_id}`);
    if (seen.has(day.driving_stage_id)) throw new Error(`La guía duplicó el tramo ${day.driving_stage_id}`);
    seen.add(day.driving_stage_id);
    for (const [field, value] of [["route_stage_key", facts.route_stage_key],["from_point_id", facts.from_point_id],["to_point_id", facts.to_point_id],["overnight_id", facts.overnight_id],["base_id", facts.base_id]]) {
      if (day[field] != null && !same(day[field], value)) throw new Error(`La guía intentó cambiar ${field} de ${day.driving_stage_id}`);
    }
    if (day.distance_m != null && number(day.distance_m) !== facts.distance_m) throw new Error(`La guía intentó cambiar la distancia de ${day.driving_stage_id}`);
    if (day.duration_s != null && number(day.duration_s) !== facts.duration_s) throw new Error(`La guía intentó cambiar la duración de ${day.driving_stage_id}`);
    if (day.overnight_compatibility != null && !same(day.overnight_compatibility, facts.overnight_compatibility)) throw new Error(`La guía intentó cambiar la compatibilidad de ${day.driving_stage_id}`);
    copyAuthoritative(day, facts);
  }

  for (const id of expected.keys()) if (!seen.has(id)) throw new Error(`La guía omitió el tramo ${id}`);
  guide.route_countries = [...(profile.route_facts?.countries ?? [])];
  guide.country_metadata = profile.route_facts?.country_metadata ?? null;
  guide.logistics_warnings = [...(profile.route_facts?.drivingWarnings ?? [])];
  guide.max_driving_limit_satisfied = profile.route_facts?.maxDrivingLimitSatisfied !== false;
  return guide;
}
