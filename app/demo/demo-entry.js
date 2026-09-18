import { DEMO_DAYS } from "./demo-spain-15-data.js";
import { DEMO_EDITORIAL_DETAILS, DEMO_BASE_DETAILS } from "./demo-spain-15-details.js";
import { renderRouteMap } from "../ui/route-map.js";
import { renderLongFormGuide } from "../ui/route-guide.js";


const params = new URLSearchParams(location.search);
const acceso = params.get("pruebas") === "manuel";
const app = document.getElementById("demoApp");
const bloqueo = document.getElementById("bloqueoDemo");

function mapsDir(origin, destination) {
  const query = new URLSearchParams({ api: "1", origin, destination, travelmode: "driving" });
  return `https://www.google.com/maps/dir/?${query}`;
}
function mapsSearch(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

if (acceso) {
  bloqueo.hidden = true;
  app.hidden = false;

  const routePoints = [
    [41.3874, 2.1686, "Barcelona"],
    [41.5932, 1.8372, "Montserrat"],
    [41.0879, 1.1575, "PortAventura"],
    [40.7050, 0.7180, "Delta del Ebro"],
    [39.4699, -0.3763, "València"],
    [38.3452, -0.4810, "Alicante"],
    [37.6257, -0.9966, "Cartagena"],
    [37.1761, -3.5881, "Granada"],
    [36.7213, -4.4214, "Málaga"],
    [36.9167, -4.7725, "Ardales"],
    [36.7420, -5.1672, "Ronda"],
    [37.3891, -5.9845, "Sevilla"]
  ];

  const waypoints = routePoints.map(([lat, lon, label], index) => ({
    id: `demo:point:${index + 1}`,
    request_point_id: `demo:point:${index + 1}`,
    label,
    lat,
    lon
  }));

  const metricas = document.getElementById("metricasRuta");
  if (metricas) {
    const items = [["15 días", "Duración"], ["14 noches", "Pernoctas"], ["aprox. 1.500 km", "Recorrido principal"], ["12 bases", "Campings / áreas"]];
    metricas.replaceChildren(...items.map(([value, label]) => {
      const box = document.createElement("div");
      box.className = "metrica";
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = value;
      span.textContent = label;
      box.append(strong, span);
      return box;
    }));
  }

  const enrichItem = item => {
    const detail = DEMO_EDITORIAL_DETAILS[item?.name];
    const baseDetail = DEMO_BASE_DETAILS[item?.name];
    return {
      ...item,
      description: detail?.[0] || baseDetail || item?.description || "",
      recommended_visit_time: detail?.[1] || item?.recommended_visit_time || ""
    };
  };
  const etapas = document.getElementById("etapasRuta");
  const guide = {
    title: "España en autocaravana · 15 días",
    subtitle: "Barcelona → Montserrat → PortAventura → Delta del Ebro → València → Alicante → Cartagena → Granada → Málaga → Ardales → Ronda → Sevilla",
    introduction: "Ejemplo completo con contenido congelado y revisado. Los horarios, precios, accesos y disponibilidad pueden cambiar; antes de viajar deben consultarse las fuentes oficiales enlazadas.",
    trip_summary: {
      route: "Barcelona → Sevilla, con 12 bases y 14 noches",
      travel_style: "Autocaravana · patrimonio, naturaleza, familia y gastronomía",
      key_advice: "Dejar la autocaravana en las bases indicadas cuando la visita urbana o el acceso aconsejen utilizar transporte público."
    },
    days: DEMO_DAYS.map((day, index) => ({
      ...day,
      heading: day.title,
      driving: day.drive,
      day_type: day.stay ? "estancia" : "conduccion_y_visita",
      opening_narrative: day.plan,
      highlights: day.visits.map(enrichItem),
      restaurants: day.food.map(enrichItem),
      overnight: day.base ? [enrichItem(day.base)] : [],
      overnight_intro: day.sameBase && day.base ? `Se mantiene la misma base: ${day.base.name}, evitando mover innecesariamente la autocaravana.` : "",
      practical_advice: null,
      maps_url: day.stay || !DEMO_DAYS[index + 1] ? mapsSearch(day.place) : mapsDir(day.place, DEMO_DAYS[index + 1].place),
      final_recommendation: day.stay
        ? "Aprovecha que hoy no hay un gran traslado: deja margen para descansar y adapta las visitas al ritmo real del grupo."
        : "No persigas el reloj. Las distancias son aproximadas y la prioridad es llegar con margen, instalar la autocaravana y disfrutar del destino."
    })),
    final_notes: [
      "La ruta termina en Sevilla después del día 15; no se añade una noche 15 ficticia.",
      "Horarios, precios, reservas, accesos y disponibilidad deben comprobarse de nuevo antes del viaje."
    ]
  };
  renderRouteMap({
    geometry: null,
    display_geometry: {
      type: "LineString",
      coordinates: routePoints.map(([lat, lon]) => [lon, lat])
    },
    geometry_source: "demo-display-polyline",
    waypoints
  });
  if (etapas) renderLongFormGuide(guide, etapas);

}
