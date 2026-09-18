import { loadCampingsByCountry } from "../data/campings.js";
import { loadOvernightCandidates } from "../data/areas.js";
import { loadPlacesAvailable } from "../data/places.js";
import { loadServicesAvailable } from "../data/services.js";
import { loadWorkshopsByCountry } from "../data/workshops.js";
import { loadRegulationsByCountry } from "../data/regulations.js";

async function settled(loader) {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function loadTripCatalogs({ countries = [], includeParkings = false } = {}) {
  const uniqueCountries = [...new Set(countries.filter(Boolean))];
  const [placesResult, servicesResult] = await Promise.all([
    loadPlacesAvailable(),
    loadServicesAvailable()
  ]);

  const campings = [];
  const areas = [];
  const workshops = [];
  const regulations = [];
  const errors = new Map([...placesResult.errors, ...servicesResult.errors]);

  await Promise.all(uniqueCountries.map(async country => {
    const [campingResult, areaResult, workshopResult, regulationResult] = await Promise.all([
      settled(() => loadCampingsByCountry(country)),
      settled(() => loadOvernightCandidates(country, { includeParkings })),
      settled(() => loadWorkshopsByCountry(country)),
      settled(() => loadRegulationsByCountry(country))
    ]);

    if (campingResult.error) errors.set(`campings:${country}`, campingResult.error);
    else campings.push(...campingResult.data);

    if (areaResult.error) errors.set(`areas:${country}`, areaResult.error);
    else areas.push(...areaResult.data);

    if (workshopResult.error) errors.set(`workshops:${country}`, workshopResult.error);
    else workshops.push(...workshopResult.data);

    if (regulationResult.error) errors.set(`regulations:${country}`, regulationResult.error);
    else regulations.push(...regulationResult.data);
  }));

  const overnightCandidates = [...campings, ...areas];
  if (uniqueCountries.length && overnightCandidates.length === 0) {
    const overnightErrors = [...errors.keys()].filter(key => key.startsWith("campings:") || key.startsWith("areas:"));
    if (overnightErrors.length) {
      throw new Error(`No se pudieron cargar campings ni áreas para la ruta (${overnightErrors.join(", ")})`);
    }
    throw new Error("Los catálogos cargados no contienen campings ni áreas disponibles para esta ruta");
  }

  return {
    campings,
    areas,
    overnightCandidates,
    places: placesResult.places,
    services: servicesResult.services,
    restaurants: servicesResult.restaurants,
    workshops,
    regulations,
    errors
  };
}
