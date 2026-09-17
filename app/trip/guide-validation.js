function collectExpected(stages) {
  return stages.map(stage => ({
    driving_stage_id: stage.driving_stage_id,
    overnight_id: stage.overnight_id ?? null
  }));
}

export function validateGuideAgainstTrip(guide, state) {
  if (!guide || typeof guide !== "object") throw new TypeError("Guía inválida");
  const expected = collectExpected(state.trip?.stages ?? []);
  const days = Array.isArray(guide.days) ? guide.days : [];
  const byStage = new Map(days.map(day => [day.driving_stage_id, day]));

  for (const item of expected) {
    const day = byStage.get(item.driving_stage_id);
    if (!day) continue;
    if (item.overnight_id && day.overnight_id && day.overnight_id !== item.overnight_id) {
      throw new Error(`La guía intentó cambiar la pernocta de ${item.driving_stage_id}`);
    }
    if (item.overnight_id && !day.overnight_id) day.overnight_id = item.overnight_id;
  }
  return guide;
}
