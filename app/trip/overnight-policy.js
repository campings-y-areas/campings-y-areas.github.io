function explicitValue(place, fields) {
  for (const field of fields) {
    if (place[field] !== undefined && place[field] !== null && place[field] !== "") return place[field];
  }
  return undefined;
}

function explicitBoolean(value) {
  if (value === undefined) return null;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = String(value).trim().toLowerCase();
  if (["si", "sí", "yes", "true", "1"].includes(normalized)) return true;
  if (["no", "false", "0"].includes(normalized)) return false;
  return null;
}

function knownMaximumLength(place) {
  const raw = explicitValue(place, ["longitud_maxima_m", "max_length_m", "longitudMaximaM"]);
  if (raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function constraint(status, source = null) {
  return { status, source };
}

export function assessOvernightCompatibility(place, { vehicle, preferences, travellers } = {}) {
  if (!place) {
    return {
      eligible: false,
      status: "incompatible",
      reasons: ["missing_place"],
      warnings: [],
      constraints: {}
    };
  }

  const reasons = [];
  const warnings = [];
  const constraints = {};
  const allowed = new Set(preferences?.overnightTypes ?? ["camping", "area"]);
  const type = String(place.tipo ?? place.type ?? "").toLowerCase();
  const typeAllowed = !(
    (type.includes("camping") && !allowed.has("camping")) ||
    (type.includes("area") && !allowed.has("area")) ||
    (type.includes("parking") && !allowed.has("parking"))
  );
  constraints.overnight_type = constraint(typeAllowed ? "confirmed" : "incompatible", "dataset:type");
  if (!typeAllowed) reasons.push("type_not_allowed");

  const vehicleType = String(vehicle?.tipo ?? vehicle?.type ?? "").toLowerCase();
  if (vehicleType === "caravana") {
    const raw = explicitValue(place, ["admite_caravanas", "caravanas", "admiteCaravanas"]);
    const caravan = explicitBoolean(raw);
    if (caravan === false) {
      reasons.push("caravan_not_allowed");
      constraints.caravan = constraint("incompatible", "dataset:caravan");
    } else if (caravan === true) {
      constraints.caravan = constraint("confirmed", "dataset:caravan");
    } else {
      warnings.push("caravan_acceptance_unknown_confirm_with_venue");
      constraints.caravan = constraint("unknown", raw === undefined ? null : "dataset:caravan_unrecognized");
    }
  } else {
    constraints.caravan = constraint("not_applicable");
  }

  if (travellers?.pet) {
    const raw = explicitValue(place, ["mascotas", "admite_mascotas", "admiteMascotas"]);
    const pets = explicitBoolean(raw);
    if (pets === false) {
      reasons.push("pets_not_allowed");
      constraints.pets = constraint("incompatible", "dataset:pets");
    } else if (pets === true) {
      constraints.pets = constraint("confirmed", "dataset:pets");
    } else {
      warnings.push("pets_acceptance_unknown_confirm_with_venue");
      constraints.pets = constraint("unknown", raw === undefined ? null : "dataset:pets_unrecognized");
    }
  } else {
    constraints.pets = constraint("not_applicable");
  }

  const totalLength = Number(vehicle?.longitud_total_m ?? vehicle?.totalLengthM ?? vehicle?.length_m);
  if (Number.isFinite(totalLength) && totalLength > 0) {
    const maxLength = knownMaximumLength(place);
    if (maxLength != null && totalLength > maxLength) {
      reasons.push("vehicle_too_long");
      constraints.vehicle_length = { status: "incompatible", source: "dataset:max_length", vehicle_m: totalLength, maximum_m: maxLength };
    } else if (maxLength != null) {
      constraints.vehicle_length = { status: "confirmed", source: "dataset:max_length", vehicle_m: totalLength, maximum_m: maxLength };
    } else {
      warnings.push("maximum_length_unknown_confirm_with_venue");
      constraints.vehicle_length = { status: "unknown", source: null, vehicle_m: totalLength, maximum_m: null };
    }
  } else {
    constraints.vehicle_length = constraint("unknown");
  }

  const hasUnknown = Object.values(constraints).some(item => item?.status === "unknown");
  return {
    eligible: reasons.length === 0,
    status: reasons.length ? "incompatible" : hasUnknown ? "unknown" : "confirmed",
    reasons,
    warnings,
    constraints
  };
}

export function isOvernightCompatible(place, context = {}) {
  return assessOvernightCompatibility(place, context).eligible;
}
