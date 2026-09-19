const INTERNAL_TECHNICAL_TEXT = /\b(?:overnight_id|base_id|driving_stage_id|route_stage_key|request_point_id|from_point_id|to_point_id|distance_m|duration_s|max_driving_seconds|excess_s)\b|\bnull\b/i;

function text(value) {
  const content = value == null ? "" : String(value).trim();
  return INTERNAL_TECHNICAL_TEXT.test(content) ? "" : content;
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
  items.filter(Boolean).forEach(item => { const value = text(item); if (value) ul.append(node("li", "", value)); });
  if (!ul.children.length) return null;
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
  paragraph(box, item?.recommended_visit_time, "⏱️ Tiempo recomendado: ");
  paragraph(box, item?.why);
  paragraph(box, item?.category, "Qué vas a visitar: ");
  paragraph(box, item?.address, "Dirección: ");
  paragraph(box, item?.specialty, "Qué probar: ");
  paragraph(box, item?.type, "Tipo: ");
  paragraph(box, item?.services, "Servicios: ");
  paragraph(box, item?.practical_note || item?.practical_info, "Información práctica: ");
  const url = text(item?.url || item?.website || item?.web);
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
  const maps = safeUrl(item?.maps);
  if (maps) {
    const a = node("a", "", "Abrir en Google Maps");
    a.href = maps; a.target = "_blank"; a.rel = "noopener noreferrer";
    box.append(a);
  }
  return box;
}

function dayFigure(day) {
  const media = day?.verified_media ?? day?.media ?? null;
  const imageUrl = safeUrl(media?.image_url);
  if (!imageUrl || media?.verified_exact !== true) return null;
  const figure = node("figure", "guia-foto");
  const img = document.createElement("img");
  img.src = imageUrl; img.alt = text(day?.heading || day?.title || "Fotografía del día"); img.loading = "lazy";
  img.addEventListener("error", () => figure.remove(), { once: true });
  figure.append(img);
  const caption = node("figcaption", "", text(media?.credit || day?.heading || day?.title || "Imagen"));
  const source = safeUrl(media?.source_page);
  if (source) { const a = node("a", "", "fuente/licencia"); a.href = source; a.target = "_blank"; a.rel = "noopener noreferrer"; caption.append(document.createTextNode(" · "), a); }
  figure.append(caption);
  return figure;
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
    if (day?.day_type === "estancia") title.append(node("span", "badge-estancia", "🏡 Día de estancia y visitas"));
    title.append(node("h2", "", text(day?.heading || "Etapa")));
    paragraph(title, day?.driving, "🚐 ");
    daySection.append(title);
    const figure = dayFigure(day); if (figure) daySection.append(figure);
    paragraph(daySection, day?.opening_narrative || day?.plan);
    paragraph(daySection, day?.arrival_strategy, "Al llegar: ");
    paragraph(daySection, day?.recommended_visit_time, "Tiempo recomendado: ");
    paragraph(daySection, day?.pace_advice, "Ritmo: ");

    if (day?.curiosity) { const s = section("🎬 Curiosidad del lugar"); paragraph(s, day.curiosity); daySection.append(s); }

    if (day?.visit_story) { const s = section("📍 Qué visitar y cómo organizarlo"); paragraph(s, day.visit_story); daySection.append(s); }
    const highlights = Array.isArray(day?.highlights) ? day.highlights : day?.visits;
    if (Array.isArray(highlights) && highlights.length) {
      const s = section("🏛️ Visitas recomendadas"); const list = node("div", "guia-recomendaciones"); highlights.forEach((item, i) => { const card = recommendation(item, { prefix: i === 0 ? "⭐ " : "" }); if (i === 0) card.classList.add("principal"); list.append(card); }); s.append(list); daySection.append(s);
    }
    if (day?.gastronomy_intro) { const s = section("🍽️ Gastronomía"); paragraph(s, day.gastronomy_intro); daySection.append(s); }
    const restaurants = Array.isArray(day?.restaurants) ? day.restaurants : day?.food;
    if (Array.isArray(restaurants) && restaurants.length) {
      const s = section("🍴 Dónde comer"); const list = node("div", "guia-recomendaciones"); restaurants.forEach((item, i) => { const card = recommendation(item, { prefix: i === 0 ? "⭐ " : "" }); if (i === 0) card.classList.add("principal"); list.append(card); }); s.append(list); daySection.append(s);
    }
    if (day?.overnight_intro) { const s = section("🌙 Pernocta"); paragraph(s, day.overnight_intro); daySection.append(s); }
    const overnight = Array.isArray(day?.overnight) ? day.overnight : day?.base ? [day.base] : [];
    if (Array.isArray(overnight) && overnight.length) {
      const s = section("🚐 Dónde dormir"); const list = node("div", "guia-recomendaciones"); overnight.forEach((item, i) => { const card = recommendation(item, { prefix: i === 0 ? "⭐ " : "" }); if (i === 0) card.classList.add("principal"); list.append(card); }); s.append(list); daySection.append(s);
    }
    if (day?.warning) {
      const s = section("⚠️ Conviene comprobar antes de ir");
      paragraph(s, day.warning);
      const mapsUrl = safeUrl(day?.maps_url);
      if (mapsUrl) {
        const route = node("div", "ruta-dia");
        const a = node("a", "", "🧭 Abrir etapa del día en Google Maps");
        a.href = mapsUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
        route.append(a); s.append(route);
      }
      daySection.append(s);
    }
    const advice = Array.isArray(day?.practical_advice)
      ? listSection("💡 Consejo del día", day.practical_advice)
      : day?.practical_advice ? (() => { const s = section("💡 Consejo del día"); paragraph(s, day.practical_advice); return s; })() : null;
    if (advice) daySection.append(advice);
    if (day?.final_recommendation) {
      const s = section("📌 Recomendación final");
      paragraph(s, day.final_recommendation);
      daySection.append(s);
    }
    root.append(daySection);
  });

  const finalNotes = Array.isArray(guide.final_notes)
    ? listSection("📌 Notas finales", guide.final_notes)
    : guide.final_notes ? (() => { const s = section("📌 Notas finales"); paragraph(s, guide.final_notes); return s; })() : null;
  if (finalNotes) root.append(finalNotes);
  container.replaceChildren(root);
  return true;
}
