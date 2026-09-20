import {
  getPremiumAccount,
  requestLoginCode,
  verifyLoginCode,
  createPremiumCheckout
} from "./premium-client.js";

const lock = document.getElementById("rutasPremiumLock");
const panel = document.querySelector(".rutas-panel");
const loggedOut = document.getElementById("premiumLoggedOut");
const noSubscription = document.getElementById("premiumNoSubscription");
const checking = document.getElementById("premiumChecking");
const emailForm = document.getElementById("premiumEmailForm");
const codeForm = document.getElementById("premiumCodeForm");
const emailInput = document.getElementById("premiumEmail");
const codeInput = document.getElementById("premiumCode");
const authStatus = document.getElementById("premiumAuthStatus");
const checkoutStatus = document.getElementById("premiumCheckoutStatus");

let loginEmail = "";
const requestedPlan = new URLSearchParams(window.location.search).get("plan");
const pendingPlan = requestedPlan === "monthly" || requestedPlan === "yearly" ? requestedPlan : "";

function show(element, visible) {
  element?.classList.toggle("oculto", !visible);
}

function setPremiumAccess(enabled) {
  if (enabled) {
    document.documentElement.classList.add("premium-activo");
    lock?.classList.add("oculto");
    if (panel) panel.hidden = false;
    return;
  }

  document.documentElement.classList.remove("premium-activo");
  lock?.classList.remove("oculto");
}

function renderAccount(account) {
  show(checking, false);

  if (account?.premium === true) {
    setPremiumAccess(true);
    return;
  }

  setPremiumAccess(false);
  const authenticated = account?.authenticated === true;
  show(loggedOut, !authenticated);
  show(noSubscription, authenticated);
}

async function startCheckout(plan) {
  if (!plan) return;
  if (checkoutStatus) checkoutStatus.textContent = "Preparando el pago seguro…";
  const checkout = await createPremiumCheckout(plan);
  if (!checkout?.url) throw new Error("Stripe no devolvió una dirección de pago.");
  window.location.assign(checkout.url);
}

async function refreshAccount() {
  try {
    const account = await getPremiumAccount();
    renderAccount(account);
    if (pendingPlan && account?.authenticated === true && account?.premium !== true) {
      await startCheckout(pendingPlan);
    }
  } catch (error) {
    show(checking, false);
    show(loggedOut, true);
    show(noSubscription, false);
    setPremiumAccess(false);
    if (authStatus) authStatus.textContent = "No se pudo comprobar el acceso Premium. Inténtalo de nuevo.";
    console.error("Premium account check failed:", error);
  }
}

emailForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginEmail = String(emailInput?.value || "").trim().toLowerCase();
  if (!loginEmail) return;

  if (authStatus) authStatus.textContent = "Enviando código…";

  try {
    await requestLoginCode(loginEmail);
    show(codeForm, true);
    codeInput?.focus();
    if (authStatus) authStatus.textContent = "Código enviado. Caduca en 10 minutos.";
  } catch (error) {
    if (authStatus) authStatus.textContent = error?.status === 429
      ? "Espera un minuto antes de solicitar otro código."
      : "No se pudo enviar el código. Inténtalo de nuevo.";
    console.error("Premium code request failed:", error);
  }
});

codeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = String(codeInput?.value || "").trim();
  if (!loginEmail || !code) return;

  if (authStatus) authStatus.textContent = "Comprobando código…";

  try {
    await verifyLoginCode(loginEmail, code);
    if (authStatus) authStatus.textContent = "";
    await refreshAccount();
  } catch (error) {
    if (authStatus) authStatus.textContent = "El código no es válido o ha caducado.";
    console.error("Premium code verification failed:", error);
  }
});

document.querySelectorAll("[data-premium-plan]").forEach((button) => {
  button.addEventListener("click", async () => {
    const plan = button.dataset.premiumPlan;
    if (checkoutStatus) checkoutStatus.textContent = "Preparando el pago seguro…";
    button.disabled = true;
    try {
      await startCheckout(plan);
    } catch (error) {
      if (checkoutStatus) {
        checkoutStatus.textContent = error?.status === 409
          ? "Esta cuenta ya tiene una suscripción Premium activa."
          : "No se pudo abrir el pago seguro. Inténtalo de nuevo.";
      }
      console.error("Premium checkout failed:", error);
      button.disabled = false;
    }
  });
});

// El acceso manual ?pruebas=manuel se conserva para no alterar las pruebas existentes.
// Para usuarios normales, solo Premium activo desbloquea el formulario.
refreshAccount();
