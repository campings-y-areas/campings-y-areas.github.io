function coord(point) {
  const lat = Number(point?.lat), lon = Number(point?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(6)},${lon.toFixed(6)}` : "";
}
function googleMapsUrl(points) {
  const clean = points.filter(Boolean).filter((value, index, all) => index === 0 || value !== all[index - 1]);
  if (clean.length < 2) return "";
  const query = new URLSearchParams({ api: "1", origin: clean[0], destination: clean.at(-1), travelmode: "driving" });
  if (clean.length > 2) query.set("waypoints", clean.slice(1, -1).join("|"));
  return `https://www.google.com/maps/dir/?${query}`;
}
export function requestedRouteMapsUrl(state) {
  const requested = Array.isArray(state?.trip?.waypoints) ? state.trip.waypoints : [];
  return googleMapsUrl(requested.map(coord));
}
export function renderRouteActions(state) {
  document.getElementById("accionesRutaNueva")?.remove();
  const mapElement = document.getElementById("mapaRuta");
  const stages = document.getElementById("etapasRuta");
  if (!mapElement || !stages) return;

  const actions = document.createElement("div");
  actions.id = "accionesRutaNueva";
  actions.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:18px 0 28px";
  const maps = requestedRouteMapsUrl(state);
  if (maps) {
    const link = document.createElement("a");
    link.href = maps; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.textContent = "🧭 Navegar esta ruta con Google Maps";
    link.style.cssText = "display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;border-radius:999px;background:#087d91;color:#fff;text-decoration:none;font-weight:900;box-shadow:0 7px 18px rgba(8,125,145,.18)";
    actions.append(link);
  }
  if (actions.childElementCount) mapElement.insertAdjacentElement("afterend", actions);

  document.getElementById("descargarGuiaPdfNueva")?.remove();
  if (state?.guide) {
    const pdf = document.createElement("div");
    pdf.id = "descargarGuiaPdfNueva"; pdf.style.cssText = "text-align:center;margin:34px 0 10px";
    const button = document.createElement("button");
    button.type = "button"; button.textContent = "📄 Descargar guía en PDF";
    button.style.cssText = "border:0;border-radius:999px;padding:14px 24px;background:#063b59;color:#fff;font-weight:900;font-size:16px;cursor:pointer;box-shadow:0 7px 18px rgba(6,59,89,.18)";
    button.addEventListener("click", () => window.print());
    const note = document.createElement("div");
    note.textContent = "Se abrirá la opción de impresión del navegador para guardarla como PDF.";
    note.style.cssText = "font-size:12px;color:#667b88;margin-top:8px";
    pdf.append(button, note); stages.insertAdjacentElement("afterend", pdf);
  }
}
