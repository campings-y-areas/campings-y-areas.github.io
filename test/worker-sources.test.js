import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(relative) {
  return fs.readFileSync(new URL(relative, import.meta.url), "utf8");
}

const historical = read("../workers/route-worker/index.js");
const modular = read("../workers/route-worker-v3/index.js");
const premium = read("../workers/premium-worker/index.js");
const migration = read("../workers/premium-worker/migrations/0001_route_usage_unique.sql");

test("las fuentes canónicas incluyen los contratos desplegados", () => {
  for (const endpoint of ["/plan-route", "/write-route", "/research-cache", "/research-destination", "/official-media", "/media-cache", "/research-media"]) {
    assert.ok(historical.includes(endpoint), `Route Worker histórico sin ${endpoint}`);
  }
  assert.match(modular, /route-contract-v3/);
  assert.match(premium, /INSERT OR IGNORE INTO route_usage/);
});

test("los Route Workers identifican el consumo con SHA-256", () => {
  for (const source of [historical, modular]) {
    assert.match(source, /crypto\.subtle\.digest\("SHA-256"/);
    assert.doesNotMatch(source, /2166136261|16777619/);
    assert.match(source, /route_\$\{hex\}/);
  }
});

test("la cuota exige una clave única idempotente y conserva el límite atómico", () => {
  assert.match(premium, /INSERT OR IGNORE[\s\S]*SELECT[\s\S]*COUNT\(\*\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*ON route_usage\(user_id, route_id\)/);
  assert.match(migration, /HAVING COUNT\(\*\) > 1/);
});
