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
      routeWaypoints: (state.route.waypoints ?? []).map(point => ({
        id: point.id,
        label: point.label,
        lat: point.lat,
        lon: point.lon,
        synthetic_route_point: Boolean(point.synthetic_route_point),
        logistics_overnight_id: point.logistics_overnight_id ?? null
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
        overnight_compatibility: stage.overnight_compatibility ?? null,
        compatibility_warnings: stage.overnight_compatibility?.warnings ?? [],
        compatibility_constraints: stage.overnight_compatibility?.constraints ?? {}
      })),
      maxDrivingLimitSatisfied: state.logistics?.maxDrivingLimitSatisfied !== false,
      drivingWarnings: drivingWarnings.map(warning => ({
        code: warning.code,
        driving_stage_id: warning.driving_stage_id,
        duration_s: warning.duration_s,
        requested_max_s: warning.requested_max_s,
        excess_s: warning.excess_s,
        reason: warning.reason ?? null,
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
        caravan_acceptance_unknown_confirm_with_venue: "No existe confirmación explícita en nuestros datos de que el establecimiento admita caravanas. Presentarlo como información no verificada y recomendar confirmarlo antes de acudir; nunca convertir la ausencia de datos en una aceptación.",
        pets_acceptance_unknown_confirm_with_venue: "No existe confirmación explícita en nuestros datos sobre admisión de mascotas. Indicar que debe confirmarse antes de acudir; no afirmar que admite mascotas.",
        max_driving_exceeded_no_compatible_overnight: "La guía debe seguir generándose. Indicar el tiempo real, máximo solicitado y exceso exacto, explicando que no se encontró una pernocta compatible disponible en la zona necesaria.",
        max_driving_exceeded_reroute_limit: "La guía debe seguir generándose. Indicar el tiempo real, máximo solicitado y exceso exacto. Explicar que tras varios recálculos logísticos acotados no se consiguió reducir más el tramo; no afirmar que faltaban campings o áreas si ese no fue el motivo.",
        max_driving_exceeded: "La guía debe seguir generándose. Indicar claramente en el día afectado el tiempo real de conducción, el máximo solicitado y el exceso exacto. No ocultar el exceso ni inventar una pernocta."
      },
      compatibilityRule: "Una pernocta con estado unknown sigue siendo candidata si no existe incompatibilidad explícita, pero la guía debe identificar qué condición no está verificada y pedir confirmación. Solo status confirmed permite describir como confirmadas todas las restricciones aplicables evaluadas.",
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
        "overnight_compatibility",
        "compatibility_constraints"
      ]
    }
  };
  return deepFreeze(context);
}
