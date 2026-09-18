export const ROUTE_CONTRACT_VERSION = "route-contract-v3";

function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }
function finite(value) { return Number.isFinite(Number(value)); }

function assertRequestPoint(point, index) {
  if (!point || !nonEmpty(point.request_point_id)) throw new Error(`request_points[${index}] sin request_point_id`);
  if (!finite(point.lat) || !finite(point.lon)) throw new Error(`request_points[${index}] sin coordenadas válidas`);
}

function assertStage(stage, index) {
  if (!stage || !nonEmpty(stage.driving_stage_id)) throw new Error(`stages[${index}] sin driving_stage_id`);
  if (!nonEmpty(stage.from_point_id) || !nonEmpty(stage.to_point_id)) throw new Error(`${stage.driving_stage_id} sin extremos autoritativos`);
  const expected = `${stage.from_point_id}=>${stage.to_point_id}`;
  if (stage.route_stage_key !== expected) throw new Error(`${stage.driving_stage_id} tiene route_stage_key inválido`);
  if (!finite(stage.driving_km) || Number(stage.driving_km) < 0 || !finite(stage.driving_minutes) || Number(stage.driving_minutes) < 0) {
    throw new Error(`${stage.driving_stage_id} sin resumen de conducción válido`);
  }
}

function assertRouteFacts(body) {
  const facts = body.route_facts;
  if (!facts || !finite(facts.distance_m) || !finite(facts.duration_s)) throw new Error("Faltan hechos autoritativos de la ruta");
  if (!Array.isArray(facts.stages) || facts.stages.length !== body.stages.length) throw new Error("Las etapas autoritativas no coinciden con el perfil");
  const byId = new Map(facts.stages.map(stage => [stage.driving_stage_id, stage]));
  for (const stage of body.stages) {
    const exact = byId.get(stage.driving_stage_id);
    if (!exact) throw new Error(`Faltan hechos autoritativos de ${stage.driving_stage_id}`);
    if (exact.route_stage_key !== stage.route_stage_key || exact.from_point_id !== stage.from_point_id || exact.to_point_id !== stage.to_point_id) {
      throw new Error(`La identidad de ${stage.driving_stage_id} no coincide con route_facts`);
    }
    if (!finite(exact.distance_m) || !finite(exact.duration_s)) throw new Error(`Faltan distancia/duración autoritativas de ${stage.driving_stage_id}`);
  }
}

export function assertPlanRequest(body) {
  if (!body || body.route_contract_version !== ROUTE_CONTRACT_VERSION) throw new Error("Contrato de ruta no compatible");
  if (!Array.isArray(body.request_points) || body.request_points.length < 2) throw new Error("Faltan puntos solicitados");
  if (!Array.isArray(body.stages) || body.stages.length < 1) throw new Error("Faltan etapas cerradas");
  body.request_points.forEach(assertRequestPoint);
  body.stages.forEach(assertStage);
  assertRouteFacts(body);
  return body;
}

export function assertWriteRequest(body) {
  assertPlanRequest(body);
  if (!body.plan || typeof body.plan !== "object") throw new Error("Falta el plan editorial");
  return body;
}
