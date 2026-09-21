import test from "node:test";
import assert from "node:assert/strict";
import { resetState, setState } from "../app/core/store.js";
import { buildTrip } from "../app/trip/pipeline.js";
import { buildVacationDays } from "../app/trip/vacation-days.js";
import { buildGuideContext } from "../app/trip/guide-context.js";
import { geoapifyRoute, routeCountryMetadata } from "../app/services/geoapify-client.js";

const origin = { id: "req-origin", request_point_id: "req-origin", label: "Barcelona", country: "España", country_code: "es", lat: 41.38, lon: 2.17 };
const destination = { id: "req-final", request_point_id: "req-final", label: "Sevilla", country: "España", country_code: "es", lat: 37.39, lon: -5.99 };
const overnight = { overnight_id: "camping:espana:test", id: "camping:espana:test", nombre: "Camping de prueba", tipo: "camping", pais: "España", lat: 39.5, lon: -2.5 };

function routeFor(points, duration = 18000) {
  const legs = [];
  const lines = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const coordinates = [[points[index].lon, points[index].lat], [points[index + 1].lon, points[index + 1].lat]];
    lines.push(coordinates);
    legs.push({ distance_m: 300000, duration_s: duration / (points.length - 1), geometry: { type: "LineString", coordinates }, steps: [] });
  }
  return { geometry: { type: "MultiLineString", coordinates: lines }, distance_m: legs.reduce((n, leg) => n + leg.distance_m, 0), duration_s: duration, legs, country_metadata: [{ country_code: "es", country: "España" }], country_details_loaded: true };
}

test("pipeline completo conserva estado, inserta pernocta, enriquece y construye todos los días", async () => {
  resetState();
  setState(state => ({ ...state, vehicle: { tipo: "autocaravana", longitud_total_m: null }, trip: {
    ...state.trip, waypoints: [origin, destination], days: 3, departureDate: "2026-10-01",
    travellers: { adults: 2, children: 0, pet: false },
    preferences: { maxDrivingHours: 3, overnightTypes: ["camping"], interests: ["naturaleza"] }
  }}));

  let routeCalls = 0;
  const routing = async ({ waypoints }) => { routeCalls += 1; return routeFor(waypoints, routeCalls === 1 ? 18000 : 9000); };
  const logistics = async ({ trip, route }) => {
    if (trip.waypoints.length === 2) {
      return {
        countries: ["España"], catalogs: { places: [], services: [], restaurants: [], workshops: [], regulations: [] },
        stages: [{ driving_stage_id: "stage-1", route_stage_key: "req-origin=>req-final", from_point_id: "req-origin", to_point_id: "req-final", from: origin, to: destination, distance_m: route.distance_m, duration_s: route.duration_s, exceeds_max_driving: true, max_driving_seconds: 10800 }],
        splitTargets: [{ driving_stage_id: "stage-1", route_stage_key: "req-origin=>req-final", route_point: { driving_seconds: 10800 }, overnight_id: overnight.overnight_id, overnight }],
        proposedOvernights: [overnight], unresolvedSplitPoints: [], overnights: [], requiresReroute: true
      };
    }
    const stop = trip.waypoints[1];
    const stages = [
      { driving_stage_id: "stage-1", route_stage_key: `req-origin=>${stop.id}`, from_point_id: "req-origin", to_point_id: stop.id, from: origin, to: stop, distance_m: 300000, duration_s: 4500, exceeds_max_driving: false, max_driving_seconds: 10800, overnight_id: overnight.overnight_id, base_id: overnight.overnight_id, overnight, overnight_compatibility: { status: "unknown" } },
      { driving_stage_id: "stage-2", route_stage_key: `${stop.id}=>req-final`, from_point_id: stop.id, to_point_id: "req-final", from: stop, to: destination, distance_m: 300000, duration_s: 4500, exceeds_max_driving: false, max_driving_seconds: 10800, overnight_id: null, base_id: null }
    ];
    return { countries: ["España"], catalogs: { places: [], services: [], restaurants: [], workshops: [], regulations: [] }, stages, splitTargets: [], proposedOvernights: [], unresolvedSplitPoints: [], overnights: [overnight], requiresReroute: false };
  };
  const enrichment = async ({ trip, catalogs }) => ({ stages: trip.stages.map(stage => ({ ...stage, content: { places: [{ nombre: "Visita verificada" }], services: [], restaurants: [], workshops: [], regulations: [] } })), catalogs });
  const guide = async state => {
    const days = buildVacationDays(state.trip);
    const context = buildGuideContext(state);
    assert.equal(days.length, 3);
    assert.equal(context.routeFacts.countries[0], "España");
    return { title: "Guía de prueba", days };
  };

  const result = await buildTrip({ routing, logistics, enrichment, guide });
  assert.equal(routeCalls, 2);
  assert.equal(result.route.waypoints.length, 3);
  assert.equal(result.trip.waypoints.length, 2, "los puntos pedidos permanecen separados de la pernocta logística");
  assert.equal(result.trip.stages.length, 2);
  assert.equal(result.logistics.overnights[0].overnight_id, overnight.overnight_id);
  assert.equal(result.trip.stages[0].content.places[0].nombre, "Visita verificada");
  assert.equal(result.guide.days.length, 3);
  assert.equal(result.guide.days.filter(day => day.day_type === "estancia").length, 1);
  assert.equal(result.guide.days.find(day => day.day_type === "estancia").driving_minutes, 0);
});

test("Geoapify evita details inválido, usa lat-lon en la petición y GeoJSON lon-lat", async () => {
  globalThis.RUTAS_CONFIG = { GEOAPIFY_API_KEY: "test", WORKER_BASE_URL: "" };
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async url => {
    requested = new URL(url);
    return new Response(JSON.stringify({ features: [{ type: "Feature", properties: {
      distance: 1000, time: 600, country_code: ["ES", "FR"],
      admin_areas: [{ country_code: "es", country_text: "España" }, { country_code: "fr", country_text: "France" }],
      legs: [{ distance: 1000, time: 600, steps: [] }]
    }, geometry: { type: "LineString", coordinates: [[2.17, 41.38], [2.18, 41.39]] } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await geoapifyRoute({ points: [origin, { ...destination, lat: 41.39, lon: 2.18 }], vehicle: { tipo: "autocaravana" }, preferences: { avoid: ["peajes", "ferris"] }, includeCountryDetails: true });
    assert.equal(requested.searchParams.get("waypoints"), "41.38,2.17|41.39,2.18");
    assert.equal(requested.searchParams.get("details"), null);
    assert.equal(requested.searchParams.get("avoid"), "tolls|ferries");
    assert.deepEqual(result.legs[0].geometry.coordinates[0], [2.17, 41.38]);
    assert.deepEqual(result.country_metadata.map(item => item.country_code), ["es", "fr"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("los metadatos de países eliminan duplicados sin inventar nombres", () => {
  assert.deepEqual(routeCountryMetadata({ admin_areas: [{ country_code: "DE", country_text: "Deutschland" }], country_code: ["de", "AT"] }), [
    { country_code: "de", country: "Deutschland", state_code: null, state: null },
    { country_code: "at", country: null, state_code: null, state: null }
  ]);
});
