function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function buildGuideContext(state) {
  if (!state?.route?.geometry || !Array.isArray(state.trip?.stages) || !state.trip.stages.length) {
    throw new Error("El viaje debe estar cerrado antes de redactar la guía");
  }
  const context = {
    routeFacts: {
      distance_m: state.route.distance_m,
      duration_s: state.route.duration_s,
      waypoints: state.trip.waypoints.map(point => ({
        request_point_id: point.request_point_id ?? point.id,
        requested_text: point.requested_text,
        requested_lat: point.requested_lat ?? point.lat,
        requested_lon: point.requested_lon ?? point.lon,
        label: point.label,
        lat: point.lat,
        lon: point.lon
      })),
      stages: state.trip.stages.map(stage => ({
        driving_stage_id: stage.driving_stage_id,
        from_point_id: stage.from_point_id,
        to_point_id: stage.to_point_id,
        distance_m: stage.distance_m,
        duration_s: stage.duration_s,
        overnight_id: stage.overnight_id,
        base_id: stage.base_id ?? stage.overnight_id ?? null,
        overnight: stage.overnight ?? null
      }))
    },
    travellers: state.trip.travellers ?? {},
    preferences: state.trip.preferences ?? {},
    editorialMaterial: state.trip.stages.map(stage => ({
      driving_stage_id: stage.driving_stage_id,
      content: stage.content ?? {}
    })),
    editorialBrief: {
      format: "long-form-day-by-day",
      quality: "premium",
      goals: [
        "narrativa extensa y útil",
        "qué visitar y por qué merece la pena",
        "actividades adaptadas a viajeros e intereses",
        "gastronomía y restaurantes",
        "información práctica",
        "fotografías verificadas y pertinentes cuando estén disponibles"
      ],
      immutableFacts: [
        "request_point_id",
        "requested_lat",
        "requested_lon",
        "driving_stage_id",
        "overnight_id",
        "base_id",
        "distance_m",
        "duration_s"
      ]
    }
  };
  return deepFreeze(context);
}
