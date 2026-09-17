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
  const drivingWarnings = Array.isArray(state.logistics?.warnings) ? state.logistics.warnings : [];
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
        country: point.country ?? null,
        country_code: point.country_code ?? null,
        lat: point.lat,
        lon: point.lon
      })),
      stages: state.trip.stages.map(stage => ({
        driving_stage_id: stage.driving_stage_id,
        from_point_id: stage.from_point_id,
        to_point_id: stage.to_point_id,
        distance_m: stage.distance_m,
        duration_s: stage.duration_s,
        max_driving_seconds: stage.max_driving_seconds ?? null,
        exceeds_max_driving: Boolean(stage.exceeds_max_driving),
        overnight_id: stage.overnight_id,
        base_id: stage.base_id ?? stage.overnight_id ?? null,
        overnight: stage.overnight ?? null,
        overnight_compatibility: stage.overnight_compatibility ?? null
      })),
      maxDrivingLimitSatisfied: state.logistics?.maxDrivingLimitSatisfied !== false,
      drivingWarnings: drivingWarnings.map(warning => ({
        code: warning.code,
        driving_stage_id: warning.driving_stage_id,
        duration_s: warning.duration_s,
        requested_max_s: warning.requested_max_s,
        excess_s: warning.excess_s,
        message: warning.message
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
      logisticsWarnings: {
        maximum_length_unknown_confirm_with_venue: "La longitud máxima admitida no está verificada. Indicar al viajero que confirme con el camping o área que admite la longitud total de su vehículo o conjunto antes de acudir. No afirmar compatibilidad por dimensiones.",
        max_driving_exceeded: "La guía debe seguir generándose. Indicar claramente en el día afectado el tiempo real de conducción, el máximo solicitado y el exceso exacto. Explicar que no ha sido posible ajustar mejor ese tramo con las pernoctas compatibles disponibles; no ocultar el exceso ni inventar una pernocta."
      },
      immutableFacts: [
        "request_point_id",
        "requested_lat",
        "requested_lon",
        "driving_stage_id",
        "overnight_id",
        "base_id",
        "distance_m",
        "duration_s",
        "max_driving_seconds",
        "excess_s",
        "overnight_compatibility"
      ]
    }
  };
  return deepFreeze(context);
}
