import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { validateGeneratedGuide } from "../src/guide-validation.js";

const origin = "https://campings-y-areas.github.io";

function profile() {
  return {
    route_contract_version: "route-contract-v3",
    request_points: [
      { request_point_id: "a", lat: 49.3, lon: 6.75 },
      { request_point_id: "b", lat: 48.1, lon: 11.5 }
    ],
    stages: [{
      driving_stage_id: "stage-1",
      route_stage_key: "a=>b",
      from_point_id: "a",
      to_point_id: "b",
      driving_km: 400,
      driving_minutes: 250,
      overnight_id: "camp-1",
      base_id: "camp-1"
    }],
    route_facts: {
      distance_m: 400123,
      duration_s: 15017,
      countries: ["Alemania"],
      country_metadata: null,
      drivingWarnings: [],
      maxDrivingLimitSatisfied: true,
      stages: [{
        driving_stage_id: "stage-1",
        route_stage_key: "a=>b",
        from_point_id: "a",
        to_point_id: "b",
        distance_m: 400123,
        duration_s: 15017,
        overnight_id: "camp-1",
        base_id: "camp-1",
        overnight_compatibility: { status: "confirmed" }
      }]
    },
    editorial_material: []
  };
}

test("health responde con el contrato nuevo y CORS del sitio", async () => {
  const response = await worker.fetch(new Request("https://worker.test/health", { headers: { origin } }), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  const body = await response.json();
  assert.equal(body.contract, "route-contract-v3");
});

test("preflight rechaza orígenes no autorizados", async () => {
  const response = await worker.fetch(new Request("https://worker.test/plan-route", { method: "OPTIONS", headers: { origin: "https://example.com" } }), {});
  assert.equal(response.status, 403);
});

test("cost guard bloquea OpenAI sin gastar", async () => {
  const response = await worker.fetch(new Request("https://worker.test/plan-route", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(profile())
  }), { OPENAI_ROUTE_PIPELINE_ENABLED: "false", OPENAI_SPEND_ENABLED: "false" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).status, "cost_guard_active");
});

test("contrato inválido se rechaza antes de generación", async () => {
  const broken = profile();
  broken.stages[0].route_stage_key = "x=>y";
  const response = await worker.fetch(new Request("https://worker.test/plan-route", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(broken)
  }), { OPENAI_ROUTE_PIPELINE_ENABLED: "false", OPENAI_SPEND_ENABLED: "false" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).status, "invalid_route_contract");
});

test("la validación restaura hechos exactos de route_facts", () => {
  const p = profile();
  const guide = { days: [{ driving_stage_id: "stage-1", heading: "Día 1" }] };
  const checked = validateGeneratedGuide(guide, p);
  assert.equal(checked.days[0].distance_m, 400123);
  assert.equal(checked.days[0].duration_s, 15017);
  assert.equal(checked.days[0].overnight_id, "camp-1");
});

test("la validación rechaza cambios de pernocta", () => {
  const p = profile();
  const guide = { days: [{ driving_stage_id: "stage-1", overnight_id: "inventada" }] };
  assert.throws(() => validateGeneratedGuide(guide, p), /overnight_id/);
});
