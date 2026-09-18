import { assertPlanRequest, assertWriteRequest } from "./contracts.js";
import { plannerPrompt, writerPrompt } from "./prompts.js";
import { generateJson } from "./openai.js";
import { buildVerifiedEditorialMaterial } from "./research.js";
import { validateGeneratedGuide } from "./guide-validation.js";
import { jsonReply, preflight } from "./http.js";

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
  if (!generationEnabled(env)) return jsonReply(request, env, 503, { ok: false, status: "cost_guard_active", message: "Generación Premium desactivada" });
  const verifiedProfile = { ...profile, editorial_material: buildVerifiedEditorialMaterial(profile) };
  const plan = await generateJson(env, plannerPrompt(verifiedProfile));
  return jsonReply(request, env, 200, { ok: true, status: "planned", plan });
}

async function writeRoute(request, env) {
  const profile = assertWriteRequest(await readJson(request));
  if (!generationEnabled(env)) return jsonReply(request, env, 503, { ok: false, status: "cost_guard_active", message: "Generación Premium desactivada" });
  const verifiedProfile = { ...profile, editorial_material: buildVerifiedEditorialMaterial(profile) };
  const guide = validateGeneratedGuide(await generateJson(env, writerPrompt(verifiedProfile)), verifiedProfile);
  return jsonReply(request, env, 200, { ok: true, status: "written", guide });
}

function errorStatus(error) {
  const message = String(error?.message || "");
  if (message.startsWith("OpenAI ")) return { http: 502, status: "generation_failed" };
  if (message === "OPENAI_API_KEY no configurada") return { http: 503, status: "generation_unavailable" };
  return { http: 400, status: "invalid_route_contract" };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return preflight(request, env);
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/plan-route") return await planRoute(request, env);
      if (request.method === "POST" && url.pathname === "/write-route") return await writeRoute(request, env);
      if (request.method === "GET" && url.pathname === "/health") {
        return jsonReply(request, env, 200, { ok: true, service: "campings-areas-route-guide", contract: "route-contract-v3" });
      }
      return jsonReply(request, env, 404, { ok: false, status: "not_found" });
    } catch (error) {
      const failure = errorStatus(error);
      return jsonReply(request, env, failure.http, { ok: false, status: failure.status, message: error?.message || "Solicitud inválida" });
    }
  }
};
