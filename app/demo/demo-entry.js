import { resetState, setState } from "../core/store.js";

const params = new URLSearchParams(location.search);
const acceso = params.get("pruebas") === "manuel";
const app = document.getElementById("demoApp");
const bloqueo = document.getElementById("bloqueoDemo");

if (acceso) {
  bloqueo.hidden = true;
  app.hidden = false;
  resetState();

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

  setState(state => ({
    ...state,
    demo: true,
    mode: "route",
    vehicle: { tipo: "autocaravana" },
    trip: {
      ...state.trip,
      days: 15,
      waypoints,
      stages: []
    },
    route: {
      ...state.route,
      waypoints,
      geometry: {
        type: "LineString",
        coordinates: routePoints.map(([lat, lon]) => [lon, lat])
      }
    },
    logistics: {
      ...state.logistics,
      warnings: ["Demo editorial congelada: horarios, precios, accesos y disponibilidad deben comprobarse antes de viajar."]
    }
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

  if (globalThis.L && document.getElementById("mapaRuta")) {
    const map = L.map("mapaRuta", { scrollWheelZoom: false }).setView([39.3, -1.2], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    const latlngs = routePoints.map(([lat, lon]) => [lat, lon]);
    L.polyline(latlngs, { weight: 5, opacity: 0.78 }).addTo(map);
    routePoints.forEach(([lat, lon, label], index) => {
      const icon = L.divIcon({
        className: "leaflet-div-icon",
        html: `<div class="marker-num">${index + 1}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      L.marker([lat, lon], { icon }).addTo(map).bindPopup(`<strong>${index + 1}. ${label}</strong>`);
    });
    map.fitBounds(latlngs, { padding: [25, 25] });
    setTimeout(() => map.invalidateSize(), 50);
  }

  // La guía editorial definitiva de 15 días sigue congelada en demo-ruta.js
  // mientras se migra a datos estructurados. No se ejecuta aquí: este módulo
  // no llama a Geoapify, Worker, D1, OpenAI ni a ninguna caché de producción.
  const etapas = document.getElementById("etapasRuta");
  if (etapas) {
    const aviso = document.createElement("div");
    aviso.className = "aviso";
    aviso.textContent = "Migración modular en curso: se conserva intacta la guía definitiva de 15 días antes de conectarla al nuevo renderer.";
    etapas.replaceChildren(aviso);
  }
}
