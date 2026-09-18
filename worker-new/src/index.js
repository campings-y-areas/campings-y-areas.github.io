import { assertPlanRequest, assertWriteRequest } from "./contracts.js";
import { plannerPrompt, writerPrompt } from "./prompts.js";
import { generateJson } from "./openai.js";
import { buildVerifiedEditorialMaterial } from "./research.js";
import { validateGeneratedGuide } from "./guide-validation.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function reply(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("Se requiere application/json");
  return request.json();
}

function generationEnabled(env) {
  return env.OPENAI_ROUTE_PIPELINE_ENABLED === "true" && env.OPENAI_SPEND_ENABLED === "true";
}

async function planRoute(request, env) {
  const profile = assertPlanRequest(await readJson(request));
  if (!generationEnabled(env)) return reply(503, { ok: false, status: "cost_guard_active", message: "Generación Premium desactivada" });
  const verifiedProfile = { ...profile, editorial_material: buildVerifiedEditorialMaterial(profile) };
  const plan = await generateJson(env, plannerPrompt(verifiedProfile));
  return reply(200, { ok: true, status: "planned", plan });
}

async function writeRoute(request, env) {
  const profile = assertWriteRequest(await readJson(request));
  if (!generationEnabled(env)) return reply(503, { ok: false, status: "cost_guard_active", message: "Generación Premium desactivada" });
  const verifiedProfile = { ...profile, editorial_material: buildVerifiedEditorialMaterial(profile) };
  const guide = validateGeneratedGuide(await generateJson(env, writerPrompt(verifiedProfile)), verifiedProfile);
  return reply(200, { ok: true, status: "written", guide });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/plan-route") return await planRoute(request, env);
      if (request.method === "POST" && url.pathname === "/write-route") return await writeRoute(request, env);
      if (request.method === "GET" && url.pathname === "/health") {
        return reply(200, { ok: true, service: "campings-areas-route-guide", contract: "route-contract-v3" });
      }
      return reply(404, { ok: false, status: "not_found" });
    } catch (error) {
      return reply(400, { ok: false, status: "invalid_route_contract", message: error?.message || "Solicitud inválida" });
    }
  }
};
