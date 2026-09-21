import test from "node:test";
import assert from "node:assert/strict";
import premiumWorker from "../workers/premium-worker/index.js";

const token = "session_token_12345678901234567890";

class FakeD1 {
  constructor(routes = []) {
    this.routes = routes;
  }

  prepare(sql) {
    const db = this;
    return {
      args: [],
      bind(...args) { this.args = args; return this; },
      async first() {
        if (sql.includes("FROM sessions s")) {
          return {
            session_id: "session-1",
            expires_at: "2099-01-01T00:00:00.000Z",
            user_id: "user-1",
            email: "premium@example.test",
            email_verified: 1
          };
        }
        if (sql.includes("FROM subscriptions")) return { status: "active" };
        if (sql.includes("COUNT(*) AS used")) {
          const [userId, period] = this.args;
          return { used: db.routes.filter(row => row.user_id === userId && row.billing_period === period).length };
        }
        if (sql.includes("FROM route_usage") && sql.includes("route_id=?")) {
          const [userId, routeId] = this.args;
          return db.routes.find(row => row.user_id === userId && row.route_id === routeId) || null;
        }
        throw new Error(`Consulta first no simulada: ${sql}`);
      },
      async run() {
        if (!sql.includes("INSERT OR IGNORE INTO route_usage")) throw new Error(`Consulta run no simulada: ${sql}`);
        const [id, userId, routeId, period, countUserId, countPeriod, limit] = this.args;
        const duplicate = db.routes.some(row => row.user_id === userId && row.route_id === routeId);
        const used = db.routes.filter(row => row.user_id === countUserId && row.billing_period === countPeriod).length;
        if (!duplicate && used < limit) {
          db.routes.push({ id, user_id: userId, route_id: routeId, billing_period: period });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      }
    };
  }
}

function consume(db, routeId) {
  return premiumWorker.fetch(new Request("https://premium.test/route-usage/consume", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ route_id: routeId })
  }), { DB: db });
}

test("una guía completada consume exactamente una unidad y repetir su ID no consume otra", async () => {
  const db = new FakeD1();
  const first = await consume(db, "route_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.used, 1);
  assert.equal(firstBody.remaining, 7);
  assert.equal(firstBody.duplicate, false);

  const duplicate = await consume(db, "route_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  const duplicateBody = await duplicate.json();
  assert.equal(duplicate.status, 200);
  assert.equal(duplicateBody.used, 1);
  assert.equal(duplicateBody.remaining, 7);
  assert.equal(duplicateBody.duplicate, true);
  assert.equal(db.routes.length, 1);
});

test("la cuota rechaza una novena ruta sin insertar una fila", async () => {
  const period = new Date().toISOString().slice(0, 7);
  const db = new FakeD1(Array.from({ length: 8 }, (_, index) => ({
    id: `id-${index}`,
    user_id: "user-1",
    route_id: `${period}_route_existing_${index}`,
    billing_period: period
  })));
  const response = await consume(db, "route_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  const body = await response.json();
  assert.equal(response.status, 429);
  assert.equal(body.error, "route_limit_reached");
  assert.equal(body.used, 8);
  assert.equal(body.remaining, 0);
  assert.equal(db.routes.length, 8);
});
