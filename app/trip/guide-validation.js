function collectExpected(stages) {
  return stages.map(stage => ({
    driving_stage_id: stage.driving_stage_id,
    from_point_id: stage.from_point_id,
    to_point_id: stage.to_point_id,
    overnight_id: stage.overnight_id ?? null,
    base_id: stage.base_id ?? stage.overnight_id ?? null,
    distance_m: Number(stage.distance_m ?? 0),
    duration_s: Number(stage.duration_s ?? 0),
    overnight_compatibility: stage.overnight_compatibility ?? null
  }));
}

function sameNumber(a, b) {
  return Number(a) === Number(b);
}

function sameCompatibility(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function validateGuideAgainstTrip(guide, state) {
  if (!guide || typeof guide !== "object") throw new TypeError("Guía inválida");
  const expected = collectExpected(state.trip?.stages ?? []);
  const days = Array.isArray(guide.days) ? guide.days : [];
  const byStage = new Map(days.filter(day => day?.driving_stage_id).map(day => [day.driving_stage_id, day]));

  for (const item of expected) {
    const day = byStage.get(item.driving_stage_id);
    if (!day) continue;

    if (day.from_point_id && day.from_point_id !== item.from_point_id) {
      throw new Error(`La guía intentó cambiar el origen de ${item.driving_stage_id}`);
    }
    if (day.to_point_id && day.to_point_id !== item.to_point_id) {
      throw new Error(`La guía intentó cambiar el destino de ${item.driving_stage_id}`);
    }
    if (day.overnight_id && day.overnight_id !== item.overnight_id) {
      throw new Error(`La guía intentó cambiar la pernocta de ${item.driving_stage_id}`);
    }
    if (day.base_id && day.base_id !== item.base_id) {
      throw new Error(`La guía intentó cambiar la base de ${item.driving_stage_id}`);
    }
    if (day.distance_m != null && !sameNumber(day.distance_m, item.distance_m)) {
      throw new Error(`La guía intentó cambiar la distancia de ${item.driving_stage_id}`);
    }
    if (day.duration_s != null && !sameNumber(day.duration_s, item.duration_s)) {
      throw new Error(`La guía intentó cambiar la duración de ${item.driving_stage_id}`);
    }
    if (day.overnight_compatibility != null && !sameCompatibility(day.overnight_compatibility, item.overnight_compatibility)) {
      throw new Error(`La guía intentó cambiar la compatibilidad de pernocta de ${item.driving_stage_id}`);
    }

    day.from_point_id = item.from_point_id;
    day.to_point_id = item.to_point_id;
    day.distance_m = item.distance_m;
    day.duration_s = item.duration_s;
    day.overnight_compatibility = item.overnight_compatibility;
    if (item.overnight_id) day.overnight_id = item.overnight_id;
    if (item.base_id) day.base_id = item.base_id;
  }
  return guide;
}
