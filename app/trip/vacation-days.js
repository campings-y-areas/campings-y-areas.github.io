function addDays(dateText, offset) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText ?? ""))) return null;
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function pointId(point) {
  return point?.request_point_id ?? point?.id ?? null;
}

function requestedPointIds(trip) {
  return new Set((trip.waypoints ?? []).map(point => String(pointId(point))).filter(Boolean));
}

function contentScore(stage) {
  const content = stage.content ?? {};
  const count = key => Array.isArray(content[key]) ? content[key].length : 0;
  return count("places") * 5 + count("restaurants") * 3 + count("services") + count("workshops");
}

function stayBases(trip) {
  const stages = trip.stages ?? [];
  const requested = requestedPointIds(trip);
  return stages.map((stage, index) => {
    const final = index === stages.length - 1;
    const requestedStop = requested.has(String(stage.to_point_id));
    return {
      index,
      eligible: final || requestedStop,
      score: 1 + contentScore(stage) + (requestedStop ? 20 : 0) + (final ? 40 : 0),
      assigned: 0
    };
  });
}

function allocateExtraDays(bases, extraDays) {
  const eligible = bases.filter(base => base.eligible);
  if (!eligible.length && bases.length) eligible.push(bases.at(-1));
  for (let n = 0; n < extraDays; n += 1) {
    let best = null;
    let bestValue = -Infinity;
    for (const base of eligible) {
      const value = base.score / Math.pow(1 + base.assigned, 2);
      if (value > bestValue) {
        best = base;
        bestValue = value;
      }
    }
    if (best) best.assigned += 1;
  }
}

function authoritativeBase(stage) {
  return stage.base_id ?? stage.overnight_id ?? null;
}

function assertStageIdentity(stage, index) {
  if (!stage?.driving_stage_id) throw new Error(`La etapa ${index + 1} no tiene driving_stage_id`);
  if (!stage?.from_point_id || !stage?.to_point_id) throw new Error(`La etapa ${stage.driving_stage_id} no tiene extremos autoritativos`);
  if (pointId(stage.from) && String(pointId(stage.from)) !== String(stage.from_point_id)) {
    throw new Error(`El origen de ${stage.driving_stage_id} no coincide con su identidad autoritativa`);
  }
  if (pointId(stage.to) && String(pointId(stage.to)) !== String(stage.to_point_id)) {
    throw new Error(`El destino de ${stage.driving_stage_id} no coincide con su identidad autoritativa`);
  }
  if (stage.overnight_id && stage.overnight?.overnight_id && String(stage.overnight_id) !== String(stage.overnight.overnight_id)) {
    throw new Error(`La pernocta de ${stage.driving_stage_id} no coincide con su overnight_id autoritativo`);
  }
}

function dayBase(stage, stageIndex, requested, type, extra = 0) {
  const overnightId = stage.overnight_id ?? null;
  const baseId = authoritativeBase(stage);
  const requestedWaypoint = requested.has(String(stage.to_point_id));
  const final = Boolean(stage.is_final) || false;
  return {
    logistics_id: type === "drive" ? `drive:${stage.driving_stage_id}` : `stay:${baseId ?? stage.driving_stage_id}:${extra + 1}`,
    driving_stage_id: type === "drive" ? stage.driving_stage_id : null,
    driving_stage_index: type === "drive" ? stageIndex + 1 : 0,
    base_stop_index: stageIndex + 1,
    base_id: baseId,
    overnight_id: overnightId,
    place: stage.to?.label ?? stage.overnight?.nombre ?? stage.overnight?.name ?? (type === "drive" ? "Etapa" : "Estancia"),
    country: stage.to?.country ?? stage.overnight?.pais ?? "",
    request_point_id: requestedWaypoint ? String(stage.to_point_id) : null,
    requested_waypoint: requestedWaypoint,
    is_final: final,
    stay_eligible: type === "stay" ? true : requestedWaypoint || final
  };
}

export function buildVacationDays(trip) {
  const stages = Array.isArray(trip?.stages) ? trip.stages : [];
  if (!stages.length) throw new Error("No hay etapas de conducción para construir los días del viaje");
  stages.forEach(assertStageIdentity);

  const totalDays = Math.max(1, Math.round(Number(trip.days) || 1));
  if (totalDays < stages.length) {
    throw new Error(`El viaje dispone de ${totalDays} días, pero necesita ${stages.length} jornadas de conducción`);
  }

  const requested = requestedPointIds(trip);
  const bases = stayBases(trip);
  allocateExtraDays(bases, totalDays - stages.length);
  const days = [];

  stages.forEach((stage, stageIndex) => {
    const final = stageIndex === stages.length - 1;
    stage.is_final = final;
    const driveDayNumber = days.length + 1;
    days.push({
      vacation_day_id: `vday-${driveDayNumber}`,
      day: driveDayNumber,
      travel_date: addDays(trip.departureDate, driveDayNumber - 1),
      day_type: "conduccion_y_visita",
      ...dayBase(stage, stageIndex, requested, "drive"),
      driving_km: Math.round(Number(stage.distance_m ?? 0) / 1000),
      driving_minutes: Math.round(Number(stage.duration_s ?? 0) / 60)
    });

    for (let extra = 0; extra < bases[stageIndex].assigned; extra += 1) {
      const stayDayNumber = days.length + 1;
      days.push({
        vacation_day_id: `vday-${stayDayNumber}`,
        day: stayDayNumber,
        travel_date: addDays(trip.departureDate, stayDayNumber - 1),
        day_type: "estancia",
        ...dayBase(stage, stageIndex, requested, "stay", extra),
        driving_km: 0,
        driving_minutes: 0
      });
    }
  });

  if (days.length !== totalDays) throw new Error("La distribución de días del viaje no coincide con la duración solicitada");
  return days;
}
