function same(a, b) { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

function expectedStages(profile) {
  return new Map(profile.stages.map(stage => [stage.driving_stage_id, {
    driving_stage_id: stage.driving_stage_id,
    route_stage_key: stage.route_stage_key,
    from_point_id: stage.from_point_id,
    to_point_id: stage.to_point_id,
    overnight_id: stage.overnight_id ?? null,
    base_id: stage.base_id ?? stage.overnight_id ?? null,
    distance_m: number(stage.driving_km) * 1000,
    duration_s: number(stage.driving_minutes) * 60,
    overnight_compatibility: stage.overnight_compatibility ?? null
  }]));
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

export function validateGeneratedGuide(guide, profile) {
  if (!guide || typeof guide !== "object" || !Array.isArray(guide.days)) throw new Error("Guía generada inválida");
  const expected = expectedStages(profile);
  const seen = new Set();

  for (const day of guide.days) {
    if (!day?.driving_stage_id) continue; // día de estancia: no crea un tramo físico.
    const facts = expected.get(day.driving_stage_id);
    if (!facts) throw new Error(`La guía inventó el tramo ${day.driving_stage_id}`);
    if (seen.has(day.driving_stage_id)) throw new Error(`La guía duplicó el tramo ${day.driving_stage_id}`);
    seen.add(day.driving_stage_id);

    const checks = [
      ["route_stage_key", facts.route_stage_key],
      ["from_point_id", facts.from_point_id],
      ["to_point_id", facts.to_point_id],
      ["overnight_id", facts.overnight_id],
      ["base_id", facts.base_id]
    ];
    for (const [field, value] of checks) {
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
