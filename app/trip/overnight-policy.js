function bool(value) {
  return value === true || value === 1 || String(value).toLowerCase() === "si" || String(value).toLowerCase() === "sí";
}

function explicitValue(place, fields) {
  for (const field of fields) {
    if (place[field] !== undefined && place[field] !== null && place[field] !== "") return place[field];
  }
  return undefined;
}

function knownMaximumLength(place) {
  const raw = explicitValue(place, ["longitud_maxima_m", "max_length_m", "longitudMaximaM"]);
  if (raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function assessOvernightCompatibility(place, { vehicle, preferences, travellers } = {}) {
  if (!place) return { eligible: false, status: "incompatible", reasons: ["missing_place"], warnings: [] };

  const reasons = [];
  const warnings = [];
  const allowed = new Set(preferences?.overnightTypes ?? ["camping", "area"]);
  const type = String(place.tipo ?? place.type ?? "").toLowerCase();
  if (type.includes("camping") && !allowed.has("camping")) reasons.push("type_not_allowed");
  if (type.includes("area") && !allowed.has("area")) reasons.push("type_not_allowed");
  if (type.includes("parking") && !allowed.has("parking")) reasons.push("type_not_allowed");

  const vehicleType = String(vehicle?.tipo ?? vehicle?.type ?? "").toLowerCase();
  if (vehicleType === "caravana") {
    const explicit = explicitValue(place, ["admite_caravanas", "caravanas", "admiteCaravanas"]);
    if (explicit !== undefined && !bool(explicit)) reasons.push("caravan_not_allowed");
  }

  if (travellers?.pet) {
    const pets = explicitValue(place, ["mascotas", "admite_mascotas", "admiteMascotas"]);
    if (pets !== undefined && !bool(pets)) reasons.push("pets_not_allowed");
  }

  const totalLength = Number(vehicle?.longitud_total_m ?? vehicle?.totalLengthM ?? vehicle?.length_m);
  if (Number.isFinite(totalLength) && totalLength > 0) {
    const maxLength = knownMaximumLength(place);
    if (maxLength != null && totalLength > maxLength) {
      reasons.push("vehicle_too_long");
    } else if (maxLength == null) {
      warnings.push("maximum_length_unknown_confirm_with_venue");
    }
  }

  return {
    eligible: reasons.length === 0,
    status: reasons.length ? "incompatible" : warnings.length ? "unknown" : "confirmed",
    reasons,
    warnings
  };
}

export function isOvernightCompatible(place, context = {}) {
  return assessOvernightCompatibility(place, context).eligible;
}
