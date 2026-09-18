function text(value) {
  return value == null ? "" : String(value).trim();
}
function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value) element.textContent = value;
  return element;
}
function paragraph(parent, value, prefix = "") {
  const content = text(value);
  if (!content) return;
  const p = node("p", "", prefix + content);
  parent.append(p);
}
function section(title) {
  const element = node("section", "guia-seccion-editorial");
  element.append(node("h3", "", title));
  return element;
}
function listSection(title, items) {
  if (!Array.isArray(items) || !items.length) return null;
  const element = section(title);
  const ul = node("ul");
  items.filter(Boolean).forEach(item => ul.append(node("li", "", text(item))));
  element.append(ul);
  return element;
}
function safeUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw, location.href);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch { return ""; }
}
function verifiedFigure(item) {
  const media = item?.verified_media ?? item?.media ?? null;
  const imageUrl = safeUrl(media?.image_url);
  if (!imageUrl || media?.verified_exact !== true) return null;
  const figure = node("figure", "guia-foto");
  const img = document.createElement("img");
  img.src = imageUrl; img.alt = text(item?.name); img.loading = "lazy"; img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => figure.remove(), { once: true });
  figure.append(img);
  const caption = node("figcaption", "", text(item?.name));
  const source = safeUrl(media?.source_page);
  if (media?.credit) caption.append(document.createTextNode(` · ${text(media.credit)}`));
  if (source) { const a = node("a", "", "Fuente de la imagen"); a.href = source; a.target = "_blank"; a.rel = "noopener noreferrer"; caption.append(document.createTextNode(" · "), a); }
  figure.append(caption);
  return figure;
}
function recommendation(item, { prefix = "" } = {}) {
  const box = node("div", "guia-recomendacion");
  box.append(node("h4", "", prefix + text(item?.name || "Recomendación")));
  const figure = verifiedFigure(item);
  if (figure) box.append(figure);
  paragraph(box, item?.description);
  paragraph(box, item?.why);
  paragraph(box, item?.specialty, "Qué probar: ");
  paragraph(box, item?.type, "Tipo: ");
  paragraph(box, item?.services, "Servicios: ");
  paragraph(box, item?.practical_note || item?.practical_info, "Información práctica: ");
  const url = text(item?.url || item?.website);
  if (url) {
    try {
      const parsed = new URL(url, location.href);
      if (["http:", "https:"].includes(parsed.protocol)) {
        const a = node("a", "", "Abrir información");
        a.href = parsed.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        box.append(a);
      }
    } catch {}
  }
  return box;
}

export function renderLongFormGuide(guide, container) {
  if (!container || !guide || typeof guide !== "object") return false;
  const root = node("div", "guia-pdf guia-ia-real");
  const header = node("header", "guia-portada");
  header.append(node("span", "", "GUÍA PERSONALIZADA DE VIAJE"));
  header.append(node("h2", "", text(guide.title || "Tu ruta")));
  paragraph(header, guide.subtitle);
  root.append(header);

  if (guide.introduction) {
    const intro = section("");
    intro.querySelector("h3")?.remove();
    paragraph(intro, guide.introduction);
    root.append(intro);
  }
  const summary = guide.trip_summary;
  if (summary && typeof summary === "object") {
    const s = section("🧭 Resumen del viaje");
    paragraph(s, summary.route, "Ruta: ");
    paragraph(s, summary.travel_style, "Estilo: ");
    paragraph(s, summary.key_advice, "Consejo principal: ");
    root.append(s);
  }
  const before = listSection("✅ Antes de salir", guide.before_you_go);
  if (before) root.append(before);

  (Array.isArray(guide.days) ? guide.days : []).forEach(day => {
    const driving = Boolean(day?.driving || day?.day_type === "conduccion_y_visita" || Number(day?.driving_minutes) > 0);
    const daySection = node("section", `guia-dia-editorial ${driving ? "dia-conduccion" : "dia-estancia"}`);
    if (day?.request_point_id) daySection.dataset.requestPointId = text(day.request_point_id);
    const title = node("div", "guia-dia-titulo");
    title.append(node("span", "", `DÍA ${text(day?.day)}${day?.travel_date ? " · " + text(day.travel_date) : ""}`));
    title.append(node("h2", "", text(day?.heading || "Etapa")));
    paragraph(title, day?.driving, "🚐 ");
    daySection.append(title);
    paragraph(daySection, day?.opening_narrative);
    paragraph(daySection, day?.arrival_strategy, "Al llegar: ");
    paragraph(daySection, day?.recommended_visit_time, "Tiempo recomendado: ");
    paragraph(daySection, day?.pace_advice, "Ritmo: ");

    if (day?.visit_story) { const s = section("📍 Qué visitar y cómo organizarlo"); paragraph(s, day.visit_story); daySection.append(s); }
    if (Array.isArray(day?.highlights) && day.highlights.length) {
      const s = section("🏛️ Visitas recomendadas"); day.highlights.forEach(item => s.append(recommendation(item))); daySection.append(s);
    }
    if (day?.gastronomy_intro) { const s = section("🍽️ Gastronomía"); paragraph(s, day.gastronomy_intro); daySection.append(s); }
    if (Array.isArray(day?.restaurants) && day.restaurants.length) {
      const s = section("🍴 Dónde comer"); day.restaurants.forEach((item, i) => s.append(recommendation(item, { prefix: i === 0 ? "⭐ Recomendado · " : "" }))); daySection.append(s);
    }
    if (day?.overnight_intro) { const s = section("🌙 Pernocta"); paragraph(s, day.overnight_intro); daySection.append(s); }
    if (Array.isArray(day?.overnight) && day.overnight.length) {
      const s = section("🚐 Dónde dormir"); day.overnight.forEach((item, i) => s.append(recommendation(item, { prefix: i === 0 ? "⭐ Recomendado · " : "" }))); daySection.append(s);
    }
    const advice = Array.isArray(day?.practical_advice)
      ? listSection("💡 Consejo del día", day.practical_advice)
      : day?.practical_advice ? (() => { const s = section("💡 Consejo del día"); paragraph(s, day.practical_advice); return s; })() : null;
    if (advice) daySection.append(advice);
    root.append(daySection);
  });

  const finalNotes = Array.isArray(guide.final_notes)
    ? listSection("📌 Notas finales", guide.final_notes)
    : guide.final_notes ? (() => { const s = section("📌 Notas finales"); paragraph(s, guide.final_notes); return s; })() : null;
  if (finalNotes) root.append(finalNotes);
  container.replaceChildren(root);
  return true;
}
