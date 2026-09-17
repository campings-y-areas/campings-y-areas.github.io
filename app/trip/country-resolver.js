const COUNTRY_BY_CODE = Object.freeze({
  es: "España", pt: "Portugal", fr: "Francia", de: "Alemania", ch: "Suiza", at: "Austria",
  be: "Bélgica", nl: "Países Bajos", lu: "Luxemburgo", ad: "Andorra", it: "Italia", si: "Eslovenia",
  hr: "Croacia", me: "Montenegro", ba: "Bosnia y Herzegovina", dk: "Dinamarca", se: "Suecia", no: "Noruega",
  fi: "Finlandia", is: "Islandia", ie: "Irlanda", gb: "Reino Unido", pl: "Polonia", cz: "República Checa",
  sk: "Eslovaquia", hu: "Hungría", ro: "Rumanía", bg: "Bulgaria", rs: "Serbia", mk: "Macedonia del Norte",
  al: "Albania", gr: "Grecia", ee: "Estonia", lv: "Letonia", lt: "Lituania", md: "Moldavia", ua: "Ucrania",
  cy: "Chipre", xk: "Kosovo"
});

function canonicalCountry(point) {
  const byCode = COUNTRY_BY_CODE[String(point?.country_code ?? "").toLowerCase()];
  return byCode || String(point?.country ?? "").trim() || null;
}

export async function resolveKnownTripCountries({ trip }) {
  const countries = [];
  for (const point of trip?.waypoints ?? []) {
    const country = canonicalCountry(point);
    if (country && !countries.includes(country)) countries.push(country);
  }
  return countries;
}

export function countryNameFromCode(code) {
  return COUNTRY_BY_CODE[String(code ?? "").toLowerCase()] ?? null;
}
