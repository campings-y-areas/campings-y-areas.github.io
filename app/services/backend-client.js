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
  if (!response.ok) throw new Error(`Backend ${path}: ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}
