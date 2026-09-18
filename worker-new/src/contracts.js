export const ROUTE_CONTRACT_VERSION = "route-contract-v3";

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function assertRequestPoint(point, index) {
  if (!point || !nonEmpty(point.request_point_id)) throw new Error(`request_points[${index}] sin request_point_id`);
  if (!finite(point.lat) || !finite(point.lon)) throw new Error(`request_points[${index}] sin coordenadas válidas`);
}

function assertStage(stage, index) {
  if (!stage || !nonEmpty(stage.driving_stage_id)) throw new Error(`stages[${index}] sin driving_stage_id`);
  if (!nonEmpty(stage.from_point_id) || !nonEmpty(stage.to_point_id)) throw new Error(`${stage.driving_stage_id} sin extremos autoritativos`);
  const expected = `${stage.from_point_id}=>${stage.to_point_id}`;
  if (stage.route_stage_key !== expected) throw new Error(`${stage.driving_stage_id} tiene route_stage_key inválido`);
  if (!finite(stage.distance_m) || Number(stage.distance_m) < 0 || !finite(stage.duration_s) || Number(stage.duration_s) < 0) {
    throw new Error(`${stage.driving_stage_id} sin hechos exactos de conducción válidos`);
  }
}

export function assertPlanRequest(body) {
  if (!body || body.route_contract_version !== ROUTE_CONTRACT_VERSION) throw new Error("Contrato de ruta no compatible");
  if (!Array.isArray(body.request_points) || body.request_points.length < 2) throw new Error("Faltan puntos solicitados");
  if (!Array.isArray(body.stages) || body.stages.length < 1) throw new Error("Faltan etapas cerradas");
  body.request_points.forEach(assertRequestPoint);
  body.stages.forEach(assertStage);
  return body;
}

export function assertWriteRequest(body) {
  assertPlanRequest(body);
  if (!body.plan || typeof body.plan !== "object") throw new Error("Falta el plan editorial");
  return body;
}
