// Campings & Áreas - cliente de autenticación Premium
// Aislado del Worker de Rutas: este módulo solo habla con campings-areas-premium.

const PREMIUM_WORKER_BASE_URL = "https://campings-areas-premium.manuel-lopez-molina.workers.dev";
const SESSION_STORAGE_KEY = "campings_areas_premium_session";

function endpoint(path) {
  return `${PREMIUM_WORKER_BASE_URL}${path}`;
}

function readStoredToken() {
  try {
    return String(localStorage.getItem(SESSION_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function storeToken(token) {
  const value = String(token || "").trim();
  if (!value) throw new Error("El servidor no devolvió una sesión válida.");
  localStorage.setItem(SESSION_STORAGE_KEY, value);
}

export function clearPremiumSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Si el navegador bloquea localStorage, la sesión simplemente no persiste.
  }
}

async function premiumRequest(path, { method = "GET", body, authenticated = false } = {}) {
  const headers = { "content-type": "application/json" };

  if (authenticated) {
    const token = readStoredToken();
    if (!token) {
      const error = new Error("Necesitas iniciar sesión.");
      error.status = 401;
      throw error;
    }
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(endpoint(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const payload = response.status === 204
    ? null
    : await response.json().catch(() => null);

  if (!response.ok) {
    if (authenticated && response.status === 401) clearPremiumSession();
    const error = new Error(payload?.message ?? payload?.error ?? `Premium: error ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function requestLoginCode(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Introduce tu correo electrónico.");

  return premiumRequest("/auth/request-code", {
    method: "POST",
    body: { email: normalizedEmail }
  });
}

export async function verifyLoginCode(email, code) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCode = String(code || "").trim();

  if (!normalizedEmail || !normalizedCode) {
    throw new Error("Introduce el correo y el código recibido.");
  }

  const payload = await premiumRequest("/auth/verify-code", {
    method: "POST",
    body: { email: normalizedEmail, code: normalizedCode }
  });

  const token = payload?.token ?? payload?.session_token ?? payload?.sessionToken;
  storeToken(token);
  return payload;
}

export async function getPremiumAccount() {
  if (!readStoredToken()) {
    return {
      ok: true,
      authenticated: false,
      premium: false,
      user: null,
      subscription: null
    };
  }

  try {
    const payload = await premiumRequest("/me", { authenticated: true });
    return {
      ...payload,
      authenticated: Boolean(payload?.user)
    };
  } catch (error) {
    if (error?.status === 401) {
      return {
        ok: true,
        authenticated: false,
        premium: false,
        user: null,
        subscription: null
      };
    }
    throw error;
  }
}

export function hasStoredPremiumSession() {
  return Boolean(readStoredToken());
}

export function premiumAuthorizationHeaders() {
  const token = readStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function createPremiumCheckout(plan) {
  const normalizedPlan = plan === "yearly" ? "yearly" : plan === "monthly" ? "monthly" : "";
  if (!normalizedPlan) throw new Error("Plan Premium no válido.");
  return premiumRequest("/create-checkout-session", {
    method: "POST",
    authenticated: true,
    body: { plan: normalizedPlan }
  });
}

export async function createPremiumPortal() {
  return premiumRequest("/create-portal-session", {
    method: "POST",
    authenticated: true
  });
}
