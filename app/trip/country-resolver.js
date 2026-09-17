const COUNTRY_BY_CODE = Object.freeze({
  es: "España", pt: "Portugal", fr: "Francia", de: "Alemania", ch: "Suiza", at: "Austria",
  be: "Bélgica", nl: "Países Bajos", lu: "Luxemburgo", ad: "Andorra", it: "Italia", si: "Eslovenia",
  hr: "Croacia", me: "Montenegro", ba: "Bosnia y Herzegovina", dk: "Dinamarca", se: "Suecia", no: "Noruega",
  fi: "Finlandia", is: "Islandia", ie: "Irlanda", gb: "Reino Unido", pl: "Polonia", cz: "República Checa",
  sk: "Eslovaquia", hu: "Hungría", ro: "Rumanía", bg: "Bulgaria", rs: "Serbia", mk: "Macedonia del Norte",
  al: "Albania", gr: "Grecia", ee: "Estonia", lv: "Letonia", lt: "Lituania", md: "Moldavia", ua: "Ucrania",
  cy: "Chipre", xk: "Kosovo"
});

function addUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function countryFromCode(code) {
  return COUNTRY_BY_CODE[String(code ?? "").toLowerCase()] ?? null;
}

function canonicalCountry(value) {
  if (!value) return null;
  if (typeof value === "string") return countryFromCode(value) ?? value.trim() || null;
  return countryFromCode(value.country_code ?? value.countryCode ?? value.iso_code ?? value.isoCode)
    ?? String(value.country ?? value.country_name ?? value.countryName ?? "").trim()
    ?? null;
}

function collectRouteMetadata(node, countries, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  addUnique(countries, canonicalCountry(node));
  if (Array.isArray(node)) {
    node.forEach(child => collectRouteMetadata(child, countries, seen));
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === "geometry" || key === "coordinates") continue;
    if (child && typeof child === "object") collectRouteMetadata(child, countries, seen);
  }
}

export async function resolveKnownTripCountries({ trip, route }) {
  const countries = [];
  for (const point of trip?.waypoints ?? []) addUnique(countries, canonicalCountry(point));
  collectRouteMetadata(route?.country_metadata ?? route?.legs ?? [], countries);
  return countries;
}

export function countryNameFromCode(code) {
  return countryFromCode(code);
}
