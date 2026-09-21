// Campings & Areas Premium - FASE 2
// Cloudflare Worker: email-code authentication (Mailjet) + secure sessions +
// Stripe Checkout/Customer Portal + verified Stripe webhook + D1 subscription sync.
//
// Required bindings:
// DB
// MAILJET_API_KEY
// MAILJET_SECRET_KEY
// MAILJET_FROM_EMAIL
// STRIPE_SECRET_KEY
// STRIPE_WEBHOOK_SECRET
// STRIPE_PRICE_MONTHLY
// STRIPE_PRICE_YEARLY

const APP_ORIGIN = "https://campings-y-areas.github.io";
const STRIPE_API = "https://api.stripe.com/v1";
const MAILJET_SEND_API = "https://api.mailjet.com/v3.1/send";

const LOGIN_CODE_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const CODE_REQUEST_COOLDOWN_SECONDS = 60;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // Stripe webhook MUST be handled before reading/parsing the request body.
      if (request.method === "POST" && url.pathname === "/stripe/webhook") {
        return await handleStripeWebhook(request, env);
      }

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return json({
          ok: true,
          service: "campings-areas-premium",
          phase: 2,
          stripe_mode: "test",
          auth: "email_code"
        }, 200, request);
      }

      if (request.method === "POST" && url.pathname === "/auth/request-code") {
        return await requestLoginCode(request, env);
      }

      if (request.method === "POST" && url.pathname === "/auth/verify-code") {
        return await verifyLoginCode(request, env);
      }

      if (request.method === "POST" && url.pathname === "/auth/logout") {
        return await logout(request, env);
      }

      if (request.method === "GET" && url.pathname === "/me") {
        return await getMe(request, env);
      }
if (request.method === "GET" && url.pathname === "/route-usage") {
  return await getRouteUsage(request, env);
}

if (request.method === "POST" && url.pathname === "/route-usage/consume") {
  return await consumeRouteUsage(request, env);
}
      if (request.method === "POST" && url.pathname === "/create-checkout-session") {
        return await createCheckoutSession(request, env);
      }

      if (request.method === "POST" && url.pathname === "/create-portal-session") {
        return await createPortalSession(request, env);
      }

      return json({ ok: false, error: "not_found" }, 404, request);
    } catch (err) {
      console.error("Worker error:", err);
      return json({ ok: false, error: "internal_error" }, 500, request);
    }
  }
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
  if (origin === APP_ORIGIN) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(data, status = 200, request = null) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  if (request) Object.assign(headers, corsHeaders(request));
  return new Response(JSON.stringify(data), { status, headers });
}

async function readJson(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "content_type_required");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function randomCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, "0");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function codeHash(email, code, env) {
  // The server-side Stripe webhook secret acts as a pepper so a leaked D1 code hash
  // cannot be brute-forced offline as a plain six-digit SHA-256.
  return sha256Hex(`${email}:${code}:${env.STRIPE_WEBHOOK_SECRET}`);
}

async function requestLoginCode(request, env) {
  try {
    requireAuthConfiguration(env);
    const body = await readJson(request);
    const email = normalizeEmail(body?.email);
    if (!email) return json({ ok: false, error: "invalid_email" }, 400, request);

    const recent = await env.DB.prepare(
      `SELECT created_at FROM login_codes
       WHERE email = ?
         AND datetime(created_at) > datetime('now', ?)
       ORDER BY created_at DESC LIMIT 1`
    ).bind(email, `-${CODE_REQUEST_COOLDOWN_SECONDS} seconds`).first();

    // Return a generic success to avoid turning this endpoint into an account oracle.
    if (recent) {
      return json({
        ok: true,
        message: "Si el correo es válido, recibirás un código en breve."
      }, 200, request);
    }

    const code = randomCode();
    const hash = await codeHash(email, code, env);
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + LOGIN_CODE_TTL_SECONDS * 1000).toISOString();

    // Keep only the newest usable code for this email.
    await env.DB.prepare(
      `UPDATE login_codes
       SET used_at = CURRENT_TIMESTAMP
       WHERE email = ? AND used_at IS NULL`
    ).bind(email).run();

    await env.DB.prepare(
      `INSERT INTO login_codes (id,email,code_hash,expires_at)
       VALUES (?,?,?,?)`
    ).bind(id, email, hash, expiresAt).run();

    try {
      await sendLoginCodeEmail(env, email, code);
    } catch (err) {
      // Do not leave a valid code behind if delivery failed.
      await env.DB.prepare(
        "UPDATE login_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(id).run();
      console.error("Mailjet send failed:", err);
      return json({ ok: false, error: "email_delivery_failed" }, 502, request);
    }

    return json({
      ok: true,
      message: "Te hemos enviado un código de acceso de 6 cifras."
    }, 200, request);
  } catch (err) {
    return authError(err, request);
  }
}

async function verifyLoginCode(request, env) {
  try {
    requireAuthConfiguration(env);
    const body = await readJson(request);
    const email = normalizeEmail(body?.email);
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!email || !/^\d{6}$/.test(code)) {
      return json({ ok: false, error: "invalid_code" }, 400, request);
    }

    const row = await env.DB.prepare(
      `SELECT id,code_hash,expires_at
       FROM login_codes
       WHERE email = ? AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`
    ).bind(email).first();

    if (!row || Date.parse(row.expires_at) <= Date.now()) {
      if (row?.id) {
        await env.DB.prepare(
          "UPDATE login_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?"
        ).bind(row.id).run();
      }
      return json({ ok: false, error: "invalid_or_expired_code" }, 401, request);
    }

    const suppliedHash = await codeHash(email, code, env);
    if (!timingSafeEqualHex(String(row.code_hash), suppliedHash)) {
      return json({ ok: false, error: "invalid_or_expired_code" }, 401, request);
    }

    await env.DB.prepare(
      "UPDATE login_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(row.id).run();

    let user = await env.DB.prepare(
      "SELECT id,email,email_verified FROM users WHERE email=? LIMIT 1"
    ).bind(email).first();

    if (!user) {
      const userId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO users (id,email,email_verified)
         VALUES (?,?,1)`
      ).bind(userId, email).run();
      user = { id: userId, email, email_verified: 1 };
    } else if (!user.email_verified) {
      await env.DB.prepare(
        `UPDATE users
         SET email_verified=1, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`
      ).bind(user.id).run();
      user.email_verified = 1;
    }

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

    await env.DB.prepare(
      `INSERT INTO sessions (id,user_id,token_hash,expires_at)
       VALUES (?,?,?,?)`
    ).bind(sessionId, user.id, tokenHash, expiresAt).run();

    await cleanupExpiredAuthRows(env);

    return json({
      ok: true,
      token,
      expires_at: expiresAt,
      user: {
        id: user.id,
        email: user.email,
        email_verified: true
      }
    }, 200, request);
  } catch (err) {
    return authError(err, request);
  }
}

async function logout(request, env) {
  const token = bearerToken(request);
  if (token) {
    const hash = await sha256Hex(token);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(hash).run();
  }
  return json({ ok: true }, 200, request);
}

async function authenticate(request, env) {
  const token = bearerToken(request);
  if (!token) return null;

  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id,s.expires_at,
            u.id AS user_id,u.email,u.email_verified
     FROM sessions s
     JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=?
     LIMIT 1`
  ).bind(hash).first();

  if (!row) return null;

  if (Date.parse(row.expires_at) <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(row.session_id).run();
    return null;
  }

  return {
    sessionId: row.session_id,
    id: row.user_id,
    email: row.email,
    emailVerified: Boolean(row.email_verified)
  };
}

function bearerToken(request) {
  const value = request.headers.get("Authorization") || "";
  const match = value.match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/i);
  return match ? match[1] : null;
}

async function getMe(request, env) {
  const user = await authenticate(request, env);
  if (!user) return authRequired(request);

  const sub = await env.DB.prepare(
    `SELECT stripe_customer_id,stripe_subscription_id,stripe_price_id,
            status,current_period_end,cancel_at_period_end
     FROM subscriptions
     WHERE user_id=?
     ORDER BY updated_at DESC LIMIT 1`
  ).bind(user.id).first();

  const entitlement = subscriptionEntitlement(sub);

  return json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      email_verified: user.emailVerified
    },
    premium: entitlement,
    subscription: sub ? {
      status: sub.status,
      price_id: sub.stripe_price_id,
      current_period_end: sub.current_period_end,
      cancel_at_period_end: Boolean(sub.cancel_at_period_end)
    } : null
  }, 200, request);
}

function subscriptionEntitlement(sub) {
  if (!sub) return false;
  // Stripe statuses that currently represent paid/usable subscription access.
  return sub.status === "active" || sub.status === "trialing";
}

const ROUTE_MONTHLY_LIMIT = 8;

function routeUsagePeriod() {
  return new Date().toISOString().slice(0, 7);
}

async function premiumUserForRouteUsage(request, env) {
  const user = await authenticate(request, env);
  if (!user) return { response: authRequired(request) };

  const sub = await env.DB.prepare(
    `SELECT status
     FROM subscriptions
     WHERE user_id=?
     ORDER BY updated_at DESC LIMIT 1`
  ).bind(user.id).first();

  if (!subscriptionEntitlement(sub)) {
    return {
      response: json({
        ok: false,
        error: "premium_required",
        message: "Esta cuenta no tiene una suscripción Premium activa."
      }, 403, request)
    };
  }

  return { user };
}

async function getRouteUsage(request, env) {
  const access = await premiumUserForRouteUsage(request, env);
  if (access.response) return access.response;

  const billingPeriod = routeUsagePeriod();
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS used
     FROM route_usage
     WHERE user_id=? AND billing_period=?`
  ).bind(access.user.id, billingPeriod).first();

  const used = Number(row?.used || 0);

  return json({
    ok: true,
    used,
    limit: ROUTE_MONTHLY_LIMIT,
    remaining: Math.max(0, ROUTE_MONTHLY_LIMIT - used),
    billing_period: billingPeriod
  }, 200, request);
}

async function consumeRouteUsage(request, env) {
  const access = await premiumUserForRouteUsage(request, env);
  if (access.response) return access.response;

  const body = await readJson(request);
  const routeId = typeof body?.route_id === "string" ? body.route_id.trim() : "";

  if (!/^[A-Za-z0-9_-]{8,128}$/.test(routeId)) {
    return json({
      ok: false,
      error: "invalid_route_id",
      message: "Falta un identificador de ruta válido."
    }, 400, request);
  }

  const billingPeriod = routeUsagePeriod();

  // The stored key includes the month. This preserves idempotency inside the
  // same month while allowing the same itinerary to count again in a later month.
  const storedRouteId = `${billingPeriod}_${routeId}`;

  const existing = await env.DB.prepare(
    `SELECT id
     FROM route_usage
     WHERE user_id=? AND route_id=?
     LIMIT 1`
  ).bind(access.user.id, storedRouteId).first();

  if (existing) {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS used
       FROM route_usage
       WHERE user_id=? AND billing_period=?`
    ).bind(access.user.id, billingPeriod).first();

    const used = Number(row?.used || 0);
    return json({
      ok: true,
      duplicate: true,
      used,
      limit: ROUTE_MONTHLY_LIMIT,
      remaining: Math.max(0, ROUTE_MONTHLY_LIMIT - used),
      billing_period: billingPeriod
    }, 200, request);
  }

  // One atomic INSERT enforces the monthly limit at write time. This avoids
  // two simultaneous completed routes both passing a separate COUNT check.
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO route_usage (id,user_id,route_id,billing_period)
     SELECT ?,?,?,?
     WHERE (
       SELECT COUNT(*)
       FROM route_usage
       WHERE user_id=? AND billing_period=?
     ) < ?`
  ).bind(
    crypto.randomUUID(),
    access.user.id,
    storedRouteId,
    billingPeriod,
    access.user.id,
    billingPeriod,
    ROUTE_MONTHLY_LIMIT
  ).run();

  const updated = await env.DB.prepare(
    `SELECT COUNT(*) AS used
     FROM route_usage
     WHERE user_id=? AND billing_period=?`
  ).bind(access.user.id, billingPeriod).first();

  const used = Number(updated?.used || 0);

  const nowExisting = await env.DB.prepare(
    `SELECT id
     FROM route_usage
     WHERE user_id=? AND route_id=?
     LIMIT 1`
  ).bind(access.user.id, storedRouteId).first();

  if (!nowExisting) {
    return json({
      ok: false,
      error: "route_limit_reached",
      message: "Has alcanzado el límite de 8 rutas con IA de este mes.",
      used,
      limit: ROUTE_MONTHLY_LIMIT,
      remaining: 0,
      billing_period: billingPeriod
    }, 429, request);
  }

  return json({
    ok: true,
    duplicate: Number(result?.meta?.changes || 0) === 0,
    used,
    limit: ROUTE_MONTHLY_LIMIT,
    remaining: Math.max(0, ROUTE_MONTHLY_LIMIT - used),
    billing_period: billingPeriod
  }, 200, request);
}

async function createCheckoutSession(request, env) {
  const user = await authenticate(request, env);
  if (!user) return authRequired(request);

  const body = await readJson(request);
  const plan = body?.plan === "yearly" ? "yearly" :
               body?.plan === "monthly" ? "monthly" : null;
  if (!plan) return json({ ok: false, error: "invalid_plan" }, 400, request);

  const priceId = plan === "yearly" ? env.STRIPE_PRICE_YEARLY : env.STRIPE_PRICE_MONTHLY;
  if (!priceId || !env.STRIPE_SECRET_KEY) {
    return json({ ok: false, error: "stripe_not_configured" }, 500, request);
  }

  const existing = await env.DB.prepare(
    `SELECT stripe_customer_id,status
     FROM subscriptions
     WHERE user_id=?
     ORDER BY updated_at DESC LIMIT 1`
  ).bind(user.id).first();

  if (existing && (existing.status === "active" || existing.status === "trialing")) {
    return json({
      ok: false,
      error: "already_subscribed",
      message: "La cuenta ya tiene una suscripción Premium activa."
    }, 409, request);
  }

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("client_reference_id", user.id);
  params.set("metadata[user_id]", user.id);
  params.set("subscription_data[metadata][user_id]", user.id);
  params.set("success_url", `${APP_ORIGIN}/?premium=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${APP_ORIGIN}/?premium=cancelled`);
  params.set("allow_promotion_codes", "false");

  if (existing?.stripe_customer_id) {
    params.set("customer", existing.stripe_customer_id);
  } else {
    params.set("customer_email", user.email);
  }

  const session = await stripePost(env, "/checkout/sessions", params);

  return json({
    ok: true,
    url: session.url,
    session_id: session.id
  }, 200, request);
}

async function createPortalSession(request, env) {
  const user = await authenticate(request, env);
  if (!user) return authRequired(request);

  const sub = await env.DB.prepare(
    `SELECT stripe_customer_id
     FROM subscriptions
     WHERE user_id=? AND stripe_customer_id IS NOT NULL
     ORDER BY updated_at DESC LIMIT 1`
  ).bind(user.id).first();

  if (!sub?.stripe_customer_id) {
    return json({ ok: false, error: "stripe_customer_not_found" }, 404, request);
  }

  const params = new URLSearchParams();
  params.set("customer", sub.stripe_customer_id);
  params.set("return_url", `${APP_ORIGIN}/`);

  const portal = await stripePost(env, "/billing_portal/sessions", params);
  return json({ ok: true, url: portal.url }, 200, request);
}

function authRequired(request) {
  return json({
    ok: false,
    error: "authentication_required",
    message: "Debes iniciar sesión."
  }, 401, request);
}

function authError(err, request) {
  if (err instanceof HttpError) {
    return json({ ok: false, error: err.code }, err.status, request);
  }
  console.error("Authentication error:", err);
  return json({ ok: false, error: "internal_error" }, 500, request);
}

function requireAuthConfiguration(env) {
  if (!env.DB ||
      !env.MAILJET_API_KEY ||
      !env.MAILJET_SECRET_KEY ||
      !env.MAILJET_FROM_EMAIL ||
      !env.STRIPE_WEBHOOK_SECRET) {
    throw new HttpError(500, "authentication_not_configured");
  }
}

async function sendLoginCodeEmail(env, toEmail, code) {
  const credentials = btoa(`${env.MAILJET_API_KEY}:${env.MAILJET_SECRET_KEY}`);

  const payload = {
    Messages: [{
      From: {
        Email: env.MAILJET_FROM_EMAIL,
        Name: "Campings & Áreas"
      },
      To: [{ Email: toEmail }],
      Subject: "Tu código de acceso a Campings & Áreas",
      TextPart:
        `Tu código de acceso es: ${code}\n\n` +
        `Caduca en 10 minutos.\n\n` +
        `Si no has solicitado este código, puedes ignorar este mensaje.`,
      HTMLPart:
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">` +
        `<h2>Campings &amp; Áreas</h2>` +
        `<p>Tu código de acceso es:</p>` +
        `<p style="font-size:30px;font-weight:700;letter-spacing:6px">${code}</p>` +
        `<p>Caduca en 10 minutos.</p>` +
        `<p style="color:#666">Si no has solicitado este código, puedes ignorar este mensaje.</p>` +
        `</div>`
    }]
  };

  const response = await fetch(MAILJET_SEND_API, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Mailjet ${response.status}: ${text.slice(0, 800)}`);
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Mailjet returned invalid JSON");
  }

  const status = result?.Messages?.[0]?.Status;
  if (status && String(status).toLowerCase() !== "success") {
    throw new Error(`Mailjet message status: ${status}`);
  }
}

async function cleanupExpiredAuthRows(env) {
  try {
    await env.DB.prepare(
      "DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')"
    ).run();
    await env.DB.prepare(
      `DELETE FROM login_codes
       WHERE datetime(expires_at) <= datetime('now')
          OR (used_at IS NOT NULL AND datetime(used_at) <= datetime('now','-1 day'))`
    ).run();
  } catch (err) {
    console.warn("Auth cleanup failed:", err);
  }
}

// -----------------------------
// Stripe webhook
// -----------------------------

async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.DB) {
    return new Response("Webhook not configured", { status: 500 });
  }

  const signature = request.headers.get("Stripe-Signature");
  if (!signature) return new Response("Missing Stripe-Signature", { status: 400 });

  const rawBody = await request.text();
  if (!(await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!event?.id || !event?.type || !event?.data?.object) {
    return new Response("Malformed Stripe event", { status: 400 });
  }

  const seen = await env.DB.prepare(
    "SELECT event_id FROM stripe_events WHERE event_id = ? LIMIT 1"
  ).bind(event.id).first();

  if (seen) return json({ received: true, duplicate: true });

  const object = event.data.object;

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(env, object);
      break;
    case "customer.subscription.updated":
      await upsertSubscription(env, object);
      break;
    case "customer.subscription.deleted":
      await upsertSubscription(env, object, "canceled");
      break;
    case "invoice.paid":
      await handleInvoice(env, object, "active");
      break;
    case "invoice.payment_failed":
      await handleInvoice(env, object, "past_due");
      break;
  }

  await env.DB.prepare(
    "INSERT INTO stripe_events (event_id, event_type) VALUES (?, ?)"
  ).bind(event.id, event.type).run();

  return json({ received: true });
}

async function handleCheckoutCompleted(env, session) {
  if (session.mode !== "subscription") return;

  const customerId = idOf(session.customer);
  const subscriptionId = idOf(session.subscription);
  const userId = session.client_reference_id || session.metadata?.user_id || null;

  if (!userId || !customerId || !subscriptionId) {
    console.warn("Checkout without local user mapping", session.id);
    return;
  }

  const user = await env.DB.prepare(
    "SELECT id FROM users WHERE id = ? LIMIT 1"
  ).bind(userId).first();
  if (!user) return;

  const sub = await stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  await upsertSubscription(env, sub, null, userId);
}

async function upsertSubscription(env, sub, forcedStatus = null, forcedUserId = null) {
  const subscriptionId = idOf(sub.id);
  const customerId = idOf(sub.customer);
  if (!subscriptionId || !customerId) return;

  let userId = forcedUserId || sub.metadata?.user_id || null;

  if (!userId) {
    const known = await env.DB.prepare(
      `SELECT user_id FROM subscriptions
       WHERE stripe_subscription_id = ? OR stripe_customer_id = ?
       LIMIT 1`
    ).bind(subscriptionId, customerId).first();
    userId = known?.user_id || null;
  }

  if (!userId) {
    console.warn("Subscription without local user mapping", subscriptionId);
    return;
  }

  const user = await env.DB.prepare(
    "SELECT id FROM users WHERE id = ? LIMIT 1"
  ).bind(userId).first();
  if (!user) return;

  const priceId = sub.items?.data?.[0]?.price?.id || null;
  const status = forcedStatus || sub.status || "inactive";
  const periodEnd = unixToIso(
    sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end
  );
  const cancelAtPeriodEnd = sub.cancel_at_period_end ? 1 : 0;

  const existing = await env.DB.prepare(
    `SELECT id FROM subscriptions
     WHERE stripe_subscription_id = ? OR stripe_customer_id = ?
     LIMIT 1`
  ).bind(subscriptionId, customerId).first();

  if (existing?.id) {
    await env.DB.prepare(
      `UPDATE subscriptions
       SET user_id=?, stripe_customer_id=?, stripe_subscription_id=?,
           stripe_price_id=?, status=?, current_period_end=?,
           cancel_at_period_end=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
    ).bind(
      userId, customerId, subscriptionId, priceId, status,
      periodEnd, cancelAtPeriodEnd, existing.id
    ).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO subscriptions
       (id,user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,
        status,current_period_end,cancel_at_period_end)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(
      crypto.randomUUID(), userId, customerId, subscriptionId, priceId,
      status, periodEnd, cancelAtPeriodEnd
    ).run();
  }
}

async function handleInvoice(env, invoice, fallbackStatus) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const customerId = idOf(invoice.customer);
  if (!subscriptionId && !customerId) return;

  const known = await env.DB.prepare(
    `SELECT id,user_id FROM subscriptions
     WHERE stripe_subscription_id = ? OR stripe_customer_id = ?
     LIMIT 1`
  ).bind(subscriptionId || "", customerId || "").first();

  if (!known) {
    console.warn("Invoice without known local subscription", invoice.id);
    return;
  }

  if (subscriptionId) {
    try {
      const sub = await stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
      await upsertSubscription(env, sub, null, known.user_id);
      return;
    } catch (err) {
      console.error("Subscription refresh after invoice failed:", err);
    }
  }

  await env.DB.prepare(
    "UPDATE subscriptions SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
  ).bind(fallbackStatus, known.id).run();
}

function invoiceSubscriptionId(invoice) {
  return (
    idOf(invoice.subscription) ||
    idOf(invoice.parent?.subscription_details?.subscription) ||
    idOf(
      invoice.lines?.data?.find(x => x?.parent?.subscription_item_details)
        ?.parent?.subscription_item_details?.subscription
    )
  );
}

function idOf(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.id === "string") return value.id;
  return null;
}

function unixToIso(value) {
  return Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

async function stripeGet(env, path) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    headers: { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}` }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Stripe ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function stripePost(env, path, params) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Stripe ${response.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}

async function verifyStripeSignature(payload, header, secret, tolerance = 300) {
  const parsed = parseStripeSignature(header);
  if (!parsed.timestamp || parsed.v1.length === 0) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > tolerance) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${parsed.timestamp}.${payload}`)
  );
  const expected = bytesToHex(new Uint8Array(mac));
  return parsed.v1.some(sig => timingSafeEqualHex(expected, sig));
}

function parseStripeSignature(header) {
  let timestamp = null;
  const v1 = [];

  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();

    if (key === "t") {
      const n = Number(value);
      if (Number.isFinite(n)) timestamp = n;
    } else if (key === "v1" && /^[0-9a-fA-F]{64}$/.test(value)) {
      v1.push(value.toLowerCase());
    }
  }
  return { timestamp, v1 };
}

function bytesToHex(bytes) {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
