import { DEMO_DAYS } from "./demo-spain-15-data.js";
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

  const etapas = document.getElementById("etapasRuta");
  if (etapas) {
    etapas.replaceChildren(...DEMO_DAYS.map(day => {
      const article = document.createElement("section");
      article.className = `guia-dia-editorial ${day.stay ? "dia-estancia" : "dia-conduccion"}`;
      article.id = `dia-${day.day}`;

      const head = document.createElement("div");
      head.className = "guia-dia-titulo";
      const number = document.createElement("span");
      number.textContent = `DÍA ${day.day}`;
      const title = document.createElement("h2");
      title.textContent = day.title;
      const drive = document.createElement("p");
      drive.textContent = day.drive;
      head.append(number, title, drive);
      article.append(head);

      const plan = document.createElement("div");
      plan.className = "guia-narrativa";
      const strong = document.createElement("strong");
      strong.textContent = "Plan del día. ";
      plan.append(strong, document.createTextNode(day.plan));
      article.append(plan);

      const addRecommendations = (heading, items, food = false) => {
        if (!items?.length) return;
        const section = document.createElement("section");
        section.className = "guia-seccion-editorial";
        const h3 = document.createElement("h3");
        h3.textContent = heading;
        const list = document.createElement("div");
        list.className = "guia-recomendaciones";
        items.forEach((item, index) => {
          const box = document.createElement("div");
          box.className = `guia-recomendacion ${index === 0 ? "principal" : ""}`;
          const h4 = document.createElement("h4");
          h4.textContent = `${index === 0 ? "⭐ " : ""}${item.name}`;
          const why = document.createElement("p");
          why.textContent = `${food ? "Por qué lo recomendamos" : "Por qué merece la pena"}: ${item.why}`;
          box.append(h4, why);
          if (item.category || item.specialty) {
            const detail = document.createElement("p");
            detail.textContent = item.category ? `Qué vas a visitar: ${item.category}` : `Qué probar: ${item.specialty}`;
            box.append(detail);
          }
          const links = document.createElement("div");
          links.className = "guia-enlaces";
          for (const [label, href] of [["📍 Abrir en Google Maps", item.maps], ["🌐 Web oficial", item.web]]) {
            if (!href) continue;
            const a = document.createElement("a");
            a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = label;
            links.append(a);
          }
          if (links.childNodes.length) box.append(links);
          list.append(box);
        });
        section.append(h3, list);
        article.append(section);
      };

      addRecommendations("🏛️ Visitas recomendadas", day.visits);
      addRecommendations("🍴 Dónde comer", day.food, true);

      if (day.curiosity) {
        const section = document.createElement("section");
        section.className = "guia-seccion-editorial";
        const h3 = document.createElement("h3"); h3.textContent = "🎬 Curiosidad del lugar";
        const body = document.createElement("div"); body.className = "curiosidad"; body.textContent = day.curiosity;
        section.append(h3, body); article.append(section);
      }

      if (day.base) addRecommendations(day.sameBase ? "🌙 Pernocta · misma base" : "🚐 Dónde dormir", [day.base]);

      const warning = document.createElement("section");
      warning.className = "guia-seccion-editorial";
      const wh = document.createElement("h3"); wh.textContent = "⚠️ Conviene comprobar antes de ir";
      const wb = document.createElement("div"); wb.className = "aviso"; wb.textContent = day.warning;
      warning.append(wh, wb); article.append(warning);

      if (day.photo) {
        const figure = document.createElement("figure"); figure.className = "guia-foto";
        const img = document.createElement("img"); img.loading = "lazy"; img.src = day.photo; img.alt = day.title;
        const caption = document.createElement("figcaption"); caption.textContent = day.photoCredit || "Wikimedia Commons";
        if (day.photoSource) {
          const a = document.createElement("a"); a.href = day.photoSource; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "fuente/licencia";
          caption.append(document.createTextNode(" · "), a);
        }
        figure.append(img, caption); article.insertBefore(figure, plan);
      }
      return article;
    }));
  }
}
