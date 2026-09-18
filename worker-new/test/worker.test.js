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


test("plan-route usa Responses API sin alterar el contrato y acepta salida REST real", async () => {
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      id: "resp_test",
      status: "completed",
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: JSON.stringify({ days: [{ vacation_day_id: "day-1" }] }), annotations: [] }]
      }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.test/plan-route", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(profile())
    }), { OPENAI_ROUTE_PIPELINE_ENABLED: "true", OPENAI_SPEND_ENABLED: "true", OPENAI_API_KEY: "test-key" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "planned");
    assert.equal(captured.url, "https://api.openai.com/v1/responses");
    assert.equal(captured.options.method, "POST");
    assert.equal(captured.body.model, "gpt-5.6");
    assert.equal(captured.body.text.format.type, "json_object");
    assert.equal(typeof captured.body.input, "string");
    assert.match(captured.options.headers.authorization, /^Bearer test-key$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("error de red de OpenAI se clasifica como fallo de generación", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("network down"); };
  try {
    const response = await worker.fetch(new Request("https://worker.test/plan-route", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(profile())
    }), { OPENAI_ROUTE_PIPELINE_ENABLED: "true", OPENAI_SPEND_ENABLED: "true", OPENAI_API_KEY: "test-key" });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).status, "generation_failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("JSON inválido de OpenAI se clasifica como fallo de generación", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    output: [{ type: "message", content: [{ type: "output_text", text: "{no-json" }] }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const response = await worker.fetch(new Request("https://worker.test/plan-route", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(profile())
    }), { OPENAI_ROUTE_PIPELINE_ENABLED: "true", OPENAI_SPEND_ENABLED: "true", OPENAI_API_KEY: "test-key" });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).status, "generation_failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
