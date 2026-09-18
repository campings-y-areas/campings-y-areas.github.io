const DEFAULT_ALLOWED_ORIGINS = ["https://campings-y-areas.github.io"];

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

export function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin"
  };
  if (origin && allowedOrigins(env).has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers["access-control-allow-headers"] = "Content-Type";
    headers["access-control-max-age"] = "86400";
  }
  return headers;
}

export function jsonReply(request, env, status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders(request, env) });
}

export function preflight(request, env) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(env).has(origin)) return new Response(null, { status: 403, headers: { vary: "Origin" } });
  const headers = corsHeaders(request, env);
  delete headers["content-type"];
  return new Response(null, { status: 204, headers });
}
