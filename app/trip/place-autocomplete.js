import { getRuntimeConfig } from "../core/runtime-config.js";

const selectedPlaces = new WeakMap();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function getSelectedPlace(input) {
  return input ? selectedPlaces.get(input) ?? null : null;
}

export function attachPlaceAutocomplete(input) {
  if (!input || input.dataset.autocompleteListo === "1") return;
  input.dataset.autocompleteListo = "1";

  const wrap = document.createElement("div");
  wrap.className = "autocomplete-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const list = document.createElement("div");
  list.className = "autocomplete-lista oculto";
  wrap.appendChild(list);

  let timer = null;
  let controller = null;

  const close = () => {
    list.replaceChildren();
    list.classList.add("oculto");
  };

  input.addEventListener("input", () => {
    selectedPlaces.delete(input);
    clearTimeout(timer);
    close();
    const text = input.value.trim();
    if (text.length < 3) return;

    timer = setTimeout(async () => {
      try {
        controller?.abort();
        controller = new AbortController();
        const key = getRuntimeConfig().geoapifyKey;
        if (!key) throw new Error("Geoapify no configurado");
        const params = new URLSearchParams({
          text,
          format: "json",
          limit: "6",
          lang: "es",
          apiKey: key
        });
        const response = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Autocomplete Geoapify: ${response.status}`);
        const data = await response.json();
        close();
        for (const place of data.results ?? []) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "autocomplete-opcion";
          const title = place.name || place.city || place.address_line1 || place.formatted || text;
          button.innerHTML = `<strong>${escapeHtml(title)}</strong><small>${escapeHtml(place.formatted || "")}</small>`;
          button.addEventListener("click", () => {
            input.value = place.formatted || title;
            selectedPlaces.set(input, place);
            close();
          });
          list.appendChild(button);
        }
        if (list.children.length) list.classList.remove("oculto");
      } catch (error) {
        if (error?.name !== "AbortError") console.warn("Autocomplete de ubicación", error);
      }
    }, 300);
  });

  document.addEventListener("click", event => {
    if (!wrap.contains(event.target)) close();
  });
}
