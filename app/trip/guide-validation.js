function collectExpected(stages) {
  return stages.map(stage => ({
    driving_stage_id: stage.driving_stage_id,
    route_stage_key: stage.route_stage_key ?? null,
    from_point_id: stage.from_point_id,
    to_point_id: stage.to_point_id,
    overnight_id: stage.overnight_id ?? null,
    base_id: stage.base_id ?? stage.overnight_id ?? null,
    distance_m: Number(stage.distance_m ?? 0),
    duration_s: Number(stage.duration_s ?? 0),
    overnight_compatibility: stage.overnight_compatibility ?? null
  }));
}

function sameNumber(a, b) { return Number(a) === Number(b); }
function sameCompatibility(a, b) { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }
function sameJson(a, b) { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }

function authoritativeWarnings(state) {
  return (state.logistics?.warnings ?? []).map(warning => ({
    code: warning.code,
    driving_stage_id: warning.driving_stage_id,
    route_stage_key: warning.route_stage_key ?? null,
    duration_s: Number(warning.duration_s),
    requested_max_s: Number(warning.requested_max_s),
    excess_s: Number(warning.excess_s),
    reason: warning.reason ?? null,
    message: warning.message ?? null
  }));
}

function sameWarningFacts(actual, expected) {
  return actual?.code === expected.code
    && actual?.driving_stage_id === expected.driving_stage_id
    && (actual?.route_stage_key ?? null) === expected.route_stage_key
    && sameNumber(actual?.duration_s, expected.duration_s)
    && sameNumber(actual?.requested_max_s, expected.requested_max_s)
    && sameNumber(actual?.excess_s, expected.excess_s)
    && (actual?.reason ?? null) === expected.reason;
}

function enforceWarnings(guide, state) {
  const expectedWarnings = authoritativeWarnings(state);
  const supplied = Array.isArray(guide.logistics_warnings) ? guide.logistics_warnings : [];
  const suppliedByStage = new Map(supplied.filter(item => item?.driving_stage_id).map(item => [item.driving_stage_id, item]));

  for (const expected of expectedWarnings) {
    const actual = suppliedByStage.get(expected.driving_stage_id);
    if (actual && !sameWarningFacts(actual, expected)) {
      throw new Error(`La guía intentó cambiar el aviso logístico de ${expected.driving_stage_id}`);
    }
  }

  guide.logistics_warnings = expectedWarnings;
  guide.max_driving_limit_satisfied = state.logistics?.maxDrivingLimitSatisfied !== false;
  return guide;
}

function enforceRouteCountries(guide, state) {
  const expectedCountries = Array.isArray(state.logistics?.countries) ? [...state.logistics.countries] : [];
  const expectedMetadata = state.route?.country_metadata ?? null;

  if (guide.route_countries != null && !sameJson(guide.route_countries, expectedCountries)) {
    throw new Error("La guía intentó cambiar los países autoritativos de la ruta");
  }
  if (guide.country_metadata != null && !sameJson(guide.country_metadata, expectedMetadata)) {
    throw new Error("La guía intentó cambiar los metadatos autoritativos de países");
  }

  guide.route_countries = expectedCountries;
  guide.country_metadata = expectedMetadata;
  return guide;
}

function indexGuideDays(days) {
  const byStage = new Map();
  for (const day of days) {
    const stageId = day?.driving_stage_id;
    if (!stageId) continue;
    if (byStage.has(stageId)) throw new Error(`La guía duplicó el tramo de conducción ${stageId}`);
    byStage.set(stageId, day);
  }
  return byStage;
}

function sameNullableId(actual, expected) {
  return (actual ?? null) === (expected ?? null);
}

export function validateGuideAgainstTrip(guide, state) {
  if (!guide || typeof guide !== "object") throw new TypeError("Guía inválida");
  if (Array.isArray(state.logistics?.proposedOvernights) && state.logistics.proposedOvernights.length) {
    throw new Error("No se puede validar una guía con pernoctas logísticas pendientes de confirmar");
  }
  const expected = collectExpected(state.trip?.stages ?? []);
  const days = Array.isArray(guide.days) ? guide.days : [];
  const byStage = indexGuideDays(days);
  const expectedStageIds = new Set(expected.map(item => item.driving_stage_id));

  for (const stageId of byStage.keys()) {
    if (!expectedStageIds.has(stageId)) throw new Error(`La guía inventó el tramo de conducción ${stageId}`);
  }

  for (const item of expected) {
    const day = byStage.get(item.driving_stage_id);
    if (!day) throw new Error(`La guía omitió el tramo de conducción ${item.driving_stage_id}`);

    if (day.route_stage_key != null && day.route_stage_key !== item.route_stage_key) throw new Error(`La guía intentó cambiar la identidad física de ${item.driving_stage_id}`);
    if (day.from_point_id != null && day.from_point_id !== item.from_point_id) throw new Error(`La guía intentó cambiar el origen de ${item.driving_stage_id}`);
    if (day.to_point_id != null && day.to_point_id !== item.to_point_id) throw new Error(`La guía intentó cambiar el destino de ${item.driving_stage_id}`);
    if (!sameNullableId(day.overnight_id, item.overnight_id)) throw new Error(`La guía intentó cambiar la pernocta de ${item.driving_stage_id}`);
    if (!sameNullableId(day.base_id, item.base_id)) throw new Error(`La guía intentó cambiar la base de ${item.driving_stage_id}`);
    if (day.distance_m != null && !sameNumber(day.distance_m, item.distance_m)) throw new Error(`La guía intentó cambiar la distancia de ${item.driving_stage_id}`);
    if (day.duration_s != null && !sameNumber(day.duration_s, item.duration_s)) throw new Error(`La guía intentó cambiar la duración de ${item.driving_stage_id}`);
    if (day.overnight_compatibility != null && !sameCompatibility(day.overnight_compatibility, item.overnight_compatibility)) {
      throw new Error(`La guía intentó cambiar la compatibilidad de pernocta de ${item.driving_stage_id}`);
    }

    day.route_stage_key = item.route_stage_key;
    day.from_point_id = item.from_point_id;
    day.to_point_id = item.to_point_id;
    day.overnight_id = item.overnight_id;
    day.base_id = item.base_id;
    day.distance_m = item.distance_m;
    day.duration_s = item.duration_s;
    day.overnight_compatibility = item.overnight_compatibility;
  }
  enforceRouteCountries(guide, state);
  return enforceWarnings(guide, state);
}
