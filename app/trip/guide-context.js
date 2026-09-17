export function buildGuideContext(state) {
  if (!state?.route?.geometry || !Array.isArray(state.trip?.stages)) {
    throw new Error("El viaje debe estar cerrado antes de redactar la guía");
  }
  return Object.freeze({
    routeFacts: {
      distance_m: state.route.distance_m,
      duration_s: state.route.duration_s,
      waypoints: state.trip.waypoints,
      stages: state.trip.stages.map(stage => ({
        driving_stage_id: stage.driving_stage_id,
        from_point_id: stage.from_point_id,
        to_point_id: stage.to_point_id,
        distance_m: stage.distance_m,
        duration_s: stage.duration_s,
        overnight_id: stage.overnight_id,
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
      immutableFacts: ["routeFacts", "overnight_id", "driving_stage_id"]
    }
  });
}
