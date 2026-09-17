import { getRuntimeConfig } from "../core/runtime-config.js";

function stableId(kind, index, text) {
  const normalized = String(text).trim().toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, "-").replace(/^-|-$/g, "");
  return `${kind}-${index}-${normalized || "punto"}`;
}

export async function geocodeText(text, { kind = "point", index = 0 } = {}) {
  const key = getRuntimeConfig().geoapifyKey;
  if (!key) throw new Error("Geoapify no configurado");
  const params = new URLSearchParams({ text, format: "json", limit: "1", apiKey: key });
  const response = await fetch(`https://api.geoapify.com/v1/geocode/search?${params.toString()}`);
  if (!response.ok) throw new Error(`Geocodificación: ${response.status}`);
  const payload = await response.json();
  const item = payload?.results?.[0];
  if (!item) throw new Error(`No se encontró: ${text}`);
  return {
    id: stableId(kind, index, text),
    request_point_id: stableId(kind, index, text),
    requested_text: text,
    label: item.formatted || text,
    lat: Number(item.lat),
    lon: Number(item.lon)
  };
}

export async function resolveTripPoints({ originText, viaTexts = [], destinationText }) {
  const requests = [
    { text: originText, kind: "origin", index: 0 },
    ...viaTexts.map((text, index) => ({ text, kind: "via", index })),
    { text: destinationText, kind: "destination", index: 0 }
  ];
  const points = [];
  for (const request of requests) points.push(await geocodeText(request.text, request));
  return points;
}
