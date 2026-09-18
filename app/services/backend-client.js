import { getRuntimeConfig } from "../core/runtime-config.js";

function endpoint(path) {
  const base = getRuntimeConfig().workerBaseUrl.replace(/\/$/, "");
  if (!base) throw new Error("Backend no configurado");
  return `${base}${path}`;
}

export async function backendRequest(path, { method = "POST", body, headers = {} } = {}) {
  const response = await fetch(endpoint(path), {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message ?? payload?.error ?? `Backend ${path}: ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}
