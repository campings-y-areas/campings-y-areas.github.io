function bool(value) {
  return value === true || value === 1 || String(value).toLowerCase() === "si" || String(value).toLowerCase() === "sí";
}

export function isOvernightCompatible(place, { vehicle, preferences } = {}) {
  if (!place) return false;
  const allowed = new Set(preferences?.overnightTypes ?? ["camping", "area"]);
  const type = String(place.tipo ?? place.type ?? "").toLowerCase();
  if (type.includes("camping") && !allowed.has("camping")) return false;
  if (type.includes("area") && !allowed.has("area")) return false;
  if (type.includes("parking") && !allowed.has("parking")) return false;

  const vehicleType = String(vehicle?.tipo ?? vehicle?.type ?? "").toLowerCase();
  if (vehicleType === "caravana") {
    const explicit = place.admite_caravanas ?? place.caravanas ?? place.admiteCaravanas;
    if (explicit !== undefined && !bool(explicit)) return false;
  }
  if (preferences?.pet && place.mascotas === false) return false;
  return true;
}
