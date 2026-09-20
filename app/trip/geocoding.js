import { getRuntimeConfig } from "../core/runtime-config.js";

function stableId(kind, index, text) {
  const normalized = String(text).trim().toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, "-").replace(/^-|-$/g, "");
  return `${kind}-${index}-${normalized || "punto"}`;
}

export async function geocodeText(text, { kind = "point", index = 0, selectedPlace = null } = {}) {
  const requestedText = String(text ?? "").trim();
  if (!requestedText) throw new TypeError(`Falta ${kind === "origin" ? "el origen" : kind === "destination" ? "el destino" : "un punto intermedio"}`);

  let item = selectedPlace;
  if (!Number.isFinite(Number(item?.lat)) || !Number.isFinite(Number(item?.lon))) {
    const key = getRuntimeConfig().geoapifyKey;
    if (!key) throw new Error("Geoapify no configurado");
    const params = new URLSearchParams({ text: requestedText, format: "json", limit: "1", lang: "es", apiKey: key });
    const response = await fetch(`https://api.geoapify.com/v1/geocode/search?${params.toString()}`);
    if (!response.ok) throw new Error(`Geocodificación: ${response.status}`);
    const payload = await response.json();
    item = payload?.results?.[0];
    if (!item) throw new Error(`No se encontró: ${requestedText}`);
  }

  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`Geocodificación sin coordenadas válidas: ${requestedText}`);
  const id = stableId(kind, index, requestedText);

  return {
    id,
    request_point_id: id,
    requested_text: requestedText,
    requested_lat: lat,
    requested_lon: lon,
    label: item.formatted || requestedText,
    country: item.country || null,
    country_code: item.country_code ? String(item.country_code).toLowerCase() : null,
    lat,
    lon
  };
}

export async function resolveTripPoints({ originText, viaTexts = [], destinationText, selectedPlaces = {} }) {
  const requests = [
    { text: originText, kind: "origin", index: 0, selectedPlace: selectedPlaces.origin ?? null },
    ...viaTexts.map((text, index) => ({ text, kind: "via", index, selectedPlace: selectedPlaces.vias?.[index] ?? null })),
    { text: destinationText, kind: "destination", index: 0, selectedPlace: selectedPlaces.destination ?? null }
  ];
  const points = [];
  for (const request of requests) points.push(await geocodeText(request.text, request));
  return points;
}
