import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { validateGeneratedGuide } from "../src/guide-validation.js";
import { reportError } from "../src/report-error.js";

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
    editorial_material: [],
    vacation_days: [{ vacation_day_id: "day-1", day: 1, travel_date: null, day_type: "conduccion_y_visita", driving_stage_id: "stage-1", route_stage_key: "a=>b", request_point_id: "b", requested_waypoint: true, is_final: true, stay_eligible: true, base_id: "camp-1", overnight_id: "camp-1" }]
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

test("preflight permite la cabecera de sesión Premium", async () => {
  const response = await worker.fetch(new Request("https://worker.test/plan-route", {
    method: "OPTIONS",
    headers: { origin, "access-control-request-headers": "content-type, authorization" }
  }), {});
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-headers") || "", /Authorization/i);
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
  const guide = { days: [{ vacation_day_id: "day-1", driving_stage_id: "stage-1", heading: "Día 1" }] };
  const checked = validateGeneratedGuide(guide, p);
  assert.equal(checked.days[0].distance_m, 400123);
  assert.equal(checked.days[0].duration_s, 15017);
  assert.equal(checked.days[0].overnight_id, "camp-1");
});

test("la validación rechaza cambios de pernocta", () => {
  const p = profile();
  const guide = { days: [{ vacation_day_id: "day-1", driving_stage_id: "stage-1", overnight_id: "inventada" }] };
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


test("informe voluntario exige descripción y no expone destinatario al cliente", async () => {
  const sent = [];
  const env = {
    REPORT_TO_EMAIL: "propietario@example.test",
    REPORT_FROM_EMAIL: "web@example.test",
    REPORT_EMAIL: { send: async message => sent.push(message) }
  };
  const response = await worker.fetch(new Request("https://worker.test/report-error", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ type: "Enlace roto", description: "La web oficial no abre", url: "https://campings-y-areas.github.io/campings.html" })
  }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "reported");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, env.REPORT_TO_EMAIL);
});

test("honeypot del informe descarta spam sin enviar correo", async () => {
  let sent = false;
  const result = await reportError(new Request("https://worker.test/report-error", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ website: "spam.example", type: "Otro", description: "spam" })
  }), { REPORT_EMAIL: { send: async () => { sent = true; } } });
  assert.equal(result.status, "reported");
  assert.equal(sent, false);
});


test("error HTTP de OpenAI se clasifica como fallo de generación", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "upstream failure" } }), { status: 500, headers: { "content-type": "application/json" } });
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


test("la validación rechaza cambiar la etapa asignada a un día", () => {
  const p = profile();
  const guide = { days: [{ vacation_day_id: "day-1", driving_stage_id: "stage-inventada", route_stage_key: "x=>y" }] };
  assert.throws(() => validateGeneratedGuide(guide, p), /driving_stage_id/);
});

test("la validación rechaza intercambiar días y etapas aunque ambas existan", () => {
  const p = profile();
  p.stages.push({
    driving_stage_id: "stage-2", route_stage_key: "b=>c", from_point_id: "b", to_point_id: "c",
    driving_km: 100, driving_minutes: 60, overnight_id: null, base_id: null
  });
  p.route_facts.stages.push({
    driving_stage_id: "stage-2", route_stage_key: "b=>c", from_point_id: "b", to_point_id: "c",
    distance_m: 100000, duration_s: 3600, overnight_id: null, base_id: null, overnight_compatibility: null
  });
  p.vacation_days.push({
    vacation_day_id: "day-2", day: 2, travel_date: null, day_type: "conduccion_y_visita",
    driving_stage_id: "stage-2", route_stage_key: "b=>c", request_point_id: "c",
    requested_waypoint: true, is_final: true, stay_eligible: true, base_id: null, overnight_id: null
  });
  const guide = { days: [
    { ...p.vacation_days[1] },
    { ...p.vacation_days[0] }
  ] };
  assert.throws(() => validateGeneratedGuide(guide, p), /orden o la identidad/);
});

test("los errores del formulario no se clasifican como contrato de ruta", async () => {
  const response = await worker.fetch(new Request("https://worker.test/report-error", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ type: "Enlace roto", description: "" })
  }), {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).status, "invalid_report");
});

test("un fallo del servicio de correo devuelve estado propio", async () => {
  const response = await worker.fetch(new Request("https://worker.test/report-error", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ type: "Enlace roto", description: "No funciona" })
  }), { REPORT_TO_EMAIL: "to@example.test", REPORT_FROM_EMAIL: "from@example.test", REPORT_EMAIL: { send: async () => { throw new Error("mail down"); } } });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).status, "report_delivery_failed");
});

test("el contrato rechaza vacation_days asociados a otra etapa", async () => {
  const broken = profile();
  broken.vacation_days[0].route_stage_key = "otra=>etapa";
  const response = await worker.fetch(new Request("https://worker.test/plan-route", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(broken)
  }), { OPENAI_ROUTE_PIPELINE_ENABLED: "false", OPENAI_SPEND_ENABLED: "false" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).status, "invalid_route_contract");
});
