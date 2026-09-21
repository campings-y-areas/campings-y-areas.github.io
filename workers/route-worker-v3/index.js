var ROUTE_CONTRACT_VERSION = "route-contract-v3";
function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function finite(value) {
  return Number.isFinite(Number(value));
}
function assertRequestPoint(point, index) {
  if (!point || !nonEmpty(point.request_point_id)) throw new Error(`request_points[${index}] sin request_point_id`);
  if (!finite(point.lat) || !finite(point.lon)) throw new Error(`request_points[${index}] sin coordenadas válidas`);
}
function assertStage(stage, index) {
  if (!stage || !nonEmpty(stage.driving_stage_id)) throw new Error(`stages[${index}] sin driving_stage_id`);
  if (!nonEmpty(stage.from_point_id) || !nonEmpty(stage.to_point_id)) throw new Error(`${stage.driving_stage_id} sin extremos autoritativos`);
  const expected = `${stage.from_point_id}=>${stage.to_point_id}`;
  if (stage.route_stage_key !== expected) throw new Error(`${stage.driving_stage_id} tiene route_stage_key inválido`);
  if (!finite(stage.driving_km) || Number(stage.driving_km) < 0 || !finite(stage.driving_minutes) || Number(stage.driving_minutes) < 0) {
    throw new Error(`${stage.driving_stage_id} sin resumen de conducción válido`);
  }
}
function assertRouteFacts(body) {
  const facts = body.route_facts;
  if (!facts || !finite(facts.distance_m) || !finite(facts.duration_s)) throw new Error("Faltan hechos autoritativos de la ruta");
  if (!Array.isArray(facts.stages) || facts.stages.length !== body.stages.length) throw new Error("Las etapas autoritativas no coinciden con el perfil");
  const byId = new Map(facts.stages.map((stage) => [stage.driving_stage_id, stage]));
  for (const stage of body.stages) {
    const exact = byId.get(stage.driving_stage_id);
    if (!exact) throw new Error(`Faltan hechos autoritativos de ${stage.driving_stage_id}`);
    if (exact.route_stage_key !== stage.route_stage_key || exact.from_point_id !== stage.from_point_id || exact.to_point_id !== stage.to_point_id) {
      throw new Error(`La identidad de ${stage.driving_stage_id} no coincide con route_facts`);
    }
    if (!finite(exact.distance_m) || !finite(exact.duration_s)) throw new Error(`Faltan distancia/duración autoritativas de ${stage.driving_stage_id}`);
  }
}
function assertVacationDays(body) {
  const days = body.vacation_days;
  if (!Array.isArray(days) || !days.length) throw new Error("Faltan los días completos del viaje");
  if (finite(body.trip_days) && Number(body.trip_days) !== days.length) throw new Error("vacation_days no coincide con trip_days");
  const stageById = new Map(body.stages.map((stage) => [stage.driving_stage_id, stage]));
  const seen = new Set();
  days.forEach((day, index) => {
    if (!day || !nonEmpty(day.vacation_day_id) || seen.has(day.vacation_day_id)) throw new Error(`vacation_days[${index}] sin identidad única`);
    seen.add(day.vacation_day_id);
    if (Number(day.day) !== index + 1) throw new Error(`${day.vacation_day_id} tiene un número de día inválido`);
    if (!nonEmpty(day.day_type)) throw new Error(`${day.vacation_day_id} sin day_type`);
    if (day.day_type === "estancia") {
      if (day.driving_stage_id != null) throw new Error(`${day.vacation_day_id} asigna conducción a una estancia`);
      if (Number(day.driving_km ?? 0) !== 0 || Number(day.driving_minutes ?? 0) !== 0) throw new Error(`${day.vacation_day_id} añade conducción a una estancia`);
      return;
    }
    const stage = stageById.get(day.driving_stage_id);
    if (!stage) throw new Error(`${day.vacation_day_id} referencia una etapa inexistente`);
    for (const field of ["route_stage_key", "base_id", "overnight_id"]) {
      if ((day[field] ?? null) !== (stage[field] ?? null)) throw new Error(`${day.vacation_day_id} no coincide con ${field} de su etapa`);
    }
  });
}
function assertPlanRequest(body) {
  if (!body || body.route_contract_version !== ROUTE_CONTRACT_VERSION) throw new Error("Contrato de ruta no compatible");
  if (!Array.isArray(body.request_points) || body.request_points.length < 2) throw new Error("Faltan puntos solicitados");
  if (!Array.isArray(body.stages) || body.stages.length < 1) throw new Error("Faltan etapas cerradas");
  body.request_points.forEach(assertRequestPoint);
  body.stages.forEach(assertStage);
  assertRouteFacts(body);
  assertVacationDays(body);
  return body;
}
function assertWriteRequest(body) {
  assertPlanRequest(body);
  if (!body.plan || typeof body.plan !== "object") throw new Error("Falta el plan editorial");
  return body;
}

function json(value) {
  return JSON.stringify(value);
}
var GUIDE_SHAPE = {
  title: "string",
  subtitle: "string",
  introduction: "string",
  trip_summary: { route: "string", travel_style: "string", key_advice: "string" },
  before_you_go: ["string"],
  days: [{
    vacation_day_id: "copiar de vacation_days",
    day: "copiar de vacation_days",
    travel_date: "copiar de vacation_days",
    day_type: "copiar de vacation_days",
    driving_stage_id: "copiar en conducción; null en estancia",
    route_stage_key: "copiar",
    request_point_id: "copiar",
    requested_waypoint: "copiar",
    is_final: "copiar",
    stay_eligible: "copiar",
    base_id: "copiar",
    overnight_id: "copiar",
    heading: "string",
    driving: "string",
    opening_narrative: "string extenso",
    arrival_strategy: "string",
    recommended_visit_time: "string",
    pace_advice: "string",
    curiosity: "string",
    visit_story: "string extenso",
    highlights: [{ name: "string", description: "string", recommended_visit_time: "string", why: "string", category: "string", address: "string", practical_info: "string", url: "string", maps: "string", verified_media: "solo si existe en material verificado" }],
    gastronomy_intro: "string",
    restaurants: [{ name: "string", description: "string", specialty: "string", address: "string", practical_info: "string", url: "string", maps: "string", verified_media: "solo si existe en material verificado" }],
    overnight_intro: "string",
    overnight: [{ name: "string", description: "string", services: "string", practical_info: "string", url: "string", maps: "string", verified_media: "si visual_content=completo, buscar foto del camping/area exactos cuando exista" }],
    warning: "string",
    maps_url: "string",
    practical_advice: ["string"],
    final_recommendation: "string"
  }],
  final_notes: ["string"]
};
function plannerPrompt(profile) {
  return [
    "Eres el planificador editorial de Campings & Áreas.",
    "La ruta, las etapas, distancias, tiempos, destinos solicitados y pernoctas recibidas son hechos cerrados y no puedes cambiarlos.",
    "Planifica TODOS los elementos de vacation_days, incluidos los días de estancia sin conducción. No omitas días ni conviertas estancias en nuevos tramos.",
    "Decide únicamente contenido editorial: visitas, actividades, gastronomía, restaurantes e información práctica.",
    "Respeta edades, mascota, intereses, ritmo, presupuesto, notas y avisos logísticos.",
    "Para un destino solicitado usa requested_lat/requested_lon y su identidad turística para el contenido; la coordenada logística de la pernocta no sustituye el destino.",
    "No inventes una pernocta ni un tramo de carretera. No conviertas una compatibilidad desconocida en confirmada.",
    "Devuelve solo JSON válido.",
    json({
      trip_days: profile.trip_days,
      vacation_days: profile.vacation_days,
      request_points: profile.request_points,
      stages: profile.stages,
      travellers: { adults: profile.adults, children: profile.children, pet: profile.pet },
      preferences: {
        pace: profile.pace,
        interests: profile.interests,
        budget: profile.budget,
        visual_content: profile.visual_content,
        user_notes: profile.user_notes
      },
      route_facts: profile.route_facts,
      editorial_material: profile.editorial_material,
      editorial_brief: profile.editorial_brief
    })
  ].join("\n\n");
}
function writerPrompt(profile) {
  return [
    "Eres el redactor de la guía premium de Campings & Áreas.",
    "Redacta una guía de viaje extensa, útil y natural, organizada día por día; no una colección de tarjetas breves.",
    "Debes devolver exactamente un elemento de days por cada elemento de vacation_days, en el mismo orden y con sus campos de identidad copiados sin cambios.",
    "Los días day_type=estancia no tienen un nuevo tramo de conducción: driving_stage_id debe ser null y el contenido se desarrolla alrededor de la base/destino asignado.",
    "El plan editorial recibido y los hechos de ruta son la base. No cambies geometría, distancias, tiempos, destinos solicitados, IDs ni pernoctas.",
    "Puedes desarrollar ampliamente narrativa, visitas, actividades, gastronomía, restaurantes y consejos prácticos con el material verificado disponible.",
    "Si visual_content es completo, la guia DEBE intentar incorporar fotografias mediante la busqueda de imagenes disponible. Busca imagenes para visitas, restaurantes y tambien para cada camping o area de pernocta que figure en la ruta.",
    "Para monumentos, museos, jardines, lugares y puntos de interes: busca primero una fotografia inequivoca del lugar exacto recomendado. Si existe un resultado claramente identificable por nombre, caption o pagina fuente, anadelo como verified_media.",
    "Para campings y areas: esta autorizado usar fotografias del establecimiento o area exactos cuando aparezcan en su web, ficha o fuente publica identificable. Busca por nombre exacto y localidad y anade la fotografia cuando la correspondencia sea clara.",
    "Para restaurantes: busca primero una fotografia del establecimiento exacto (fachada, interior o plato atribuido claramente al restaurante). Si no encuentras una imagen inequivoca del restaurante, puedes usar como alternativa una fotografia de un plato tipico o especialidad que recomiendas alli, siempre que la imagen represente realmente ese plato y la fuente lo identifique. En ese caso el credit debe indicar claramente que es una imagen representativa del plato y no una fotografia verificada del restaurante.",
    "No descartes una imagen unicamente porque no proceda del material editorial recibido: visual_content=completo significa que debes usar activamente la busqueda de imagenes. Solo omite la foto despues de haber intentado localizar una opcion valida con la herramienta.",
    "Puedes proponer verified_media si la herramienta te muestra una coincidencia clara, pero el Worker validara la URL contra los resultados reales de web_search_call.results y descartara cualquier URL no devuelta literalmente por la herramienta. No inventes, reconstruyas ni modifiques URLs.",
    "El material recibido que ya contenga verified_media verificado tambien puede copiarse sin cambiar image_url, source_page, credit ni verified_exact.",
    "No escribas en final_notes que no hay fotografias por no disponer de material visual verificado sin haber usado antes la busqueda de imagenes para cada candidato relevante.",
    "Aunque la búsqueda web esté activa, tu respuesta final debe ser EXCLUSIVAMENTE el objeto JSON de la guía, sin Markdown, sin bloque ``` y sin texto antes o después.",
    "Los campos técnicos son exclusivamente para validar la ruta. NUNCA escribas en title, subtitle, introduction, trip_summary, before_you_go, heading, driving, narrativas, visitas, gastronomía, pernocta, avisos, consejos ni notas nombres internos como overnight_id, base_id, driving_stage_id, route_stage_key, request_point_id, distance_m, duration_s, max_driving_seconds, excess_s o valores null.",
    "Expresa siempre distancias y tiempos para viajeros: kilómetros y horas/minutos redondeados de forma natural. Nunca muestres metros crudos ni segundos crudos.",
    "La salida debe respetar esta estructura compatible con el renderizador existente:",
    json(GUIDE_SHAPE),
    "Devuelve solo JSON válido.",
    json({
      plan: profile.plan,
      vacation_days: profile.vacation_days,
      request_points: profile.request_points,
      stages: profile.stages,
      route_facts: profile.route_facts,
      editorial_material: profile.editorial_material,
      editorial_brief: profile.editorial_brief
    })
  ].join("\n\n");
}

function parseJsonText(text) {
  const value = String(text ?? "").trim();
  if (!value) throw new Error("OpenAI devolvió contenido vacío");
  try { return JSON.parse(value); } catch {}

  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }
  throw new Error("OpenAI devolvió JSON inválido");
}
function outputText(payload) {
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
      if (content?.type === "refusal") throw new Error("OpenAI rechazó generar la respuesta");
    }
  }
  if (typeof payload?.output_text === "string") return payload.output_text;
  throw new Error("OpenAI no devolvió texto utilizable");
}
function webImageResults(payload) {
  const results = [];
  const seen = new Set();
  for (const item of payload?.output ?? []) {
    if (item?.type !== "web_search_call" || !Array.isArray(item.results)) continue;
    for (const result of item.results) {
      if (result?.type !== "image_result") continue;
      const imageUrl = String(result.image_url ?? "").trim();
      const sourcePage = String(result.source_website_url ?? "").trim();
      if (!imageUrl || !sourcePage || seen.has(imageUrl)) continue;
      seen.add(imageUrl);
      results.push({
        image_url: imageUrl,
        source_page: sourcePage,
        thumbnail_url: String(result.thumbnail_url ?? "").trim(),
        caption: String(result.caption ?? "").trim()
      });
    }
  }
  return results;
}
async function generateJson(env, prompt, { imageSearch = false, returnImageResults = false } = {}) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no configurada");
  const model = env.OPENAI_MODEL || "gpt-5.6";
  let response;
  try {
    response = await fetch("https://" + "api.openai.com" + "/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        input: prompt,
        ...(!imageSearch ? { text: { format: { type: "json_object" } } } : {}),
        ...(imageSearch ? {
          tools: [{
            type: "web_search",
            search_content_types: ["image"],
            image_settings: { max_results: 12, caption: true }
          }],
          include: ["web_search_call.results"]
        } : {})
      })
    });
  } catch (error) {
    throw new Error(`OpenAI no disponible: ${error?.message || "error de red"}`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ? `OpenAI: ${payload.error.message}` : `OpenAI HTTP ${response.status}`);
  const data = parseJsonText(outputText(payload));
  if (returnImageResults) return { data, imageResults: webImageResults(payload) };
  return data;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}
function verifiedMedia(media) {
  if (!media || typeof media !== "object") return null;
  if (media.verified_exact !== true || !media.image_url || !media.source_page) return null;
  return {
    image_url: String(media.image_url),
    source_page: String(media.source_page),
    credit: media.credit ? String(media.credit) : "",
    verified_exact: true
  };
}
function sanitizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const clean2 = clone(item);
  const media = verifiedMedia(item.verified_media ?? item.media);
  delete clean2.media;
  delete clean2.verified_media;
  if (media) clean2.verified_media = media;
  return clean2;
}

function normalizeMediaText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
const MEDIA_STOP = new Set(["the", "and", "der", "die", "das", "und", "von", "zur", "zum", "de", "del", "la", "las", "los", "el", "le", "les", "des", "du", "of", "restaurant", "restaurante", "camping", "campings", "area", "areas", "aire", "autocaravanas", "autocaravana", "camper", "park", "platz"]);
function mediaTokens(value) {
  return normalizeMediaText(value).split(/\s+/).filter((token) => token.length >= 3 && !MEDIA_STOP.has(token));
}
function sourceText(result) {
  let source = String(result?.source_page ?? "");
  try { source = `${new URL(source).hostname} ${new URL(source).pathname}`; } catch {}
  return normalizeMediaText(`${result?.caption ?? ""} ${source}`);
}
function tokenPresent(haystack, token) {
  return (` ${haystack} `).includes(` ${token} `);
}
function hostname(value) {
  try { return new URL(String(value ?? "")).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
function officialHost(entity) {
  return hostname(entity?.url ?? entity?.website ?? entity?.web);
}
function locationTokens(entity) {
  return mediaTokens(`${entity?.address ?? ""} ${entity?.place ?? ""} ${entity?.city ?? ""} ${entity?.locality ?? ""}`).filter((token) => token.length >= 4);
}
function exactEntityImage(entity, imageResults) {
  const name = normalizeMediaText(entity?.name);
  const tokens = mediaTokens(entity?.name);
  if (!name || !tokens.length) return null;
  const host = officialHost(entity);
  const locTokens = locationTokens(entity);
  let best = null, bestScore = -1;

  for (const result of imageResults) {
    const haystack = sourceText(result);
    if (!haystack) continue;
    const resultHost = hostname(result?.source_page);
    const official = Boolean(host && resultHost && (resultHost === host || resultHost.endsWith(`.${host}`) || host.endsWith(`.${resultHost}`)));
    const exactName = (` ${haystack} `).includes(` ${name} `);
    const matched = tokens.filter((token) => tokenPresent(haystack, token)).length;
    const locationMatch = locTokens.some((token) => tokenPresent(haystack, token));

    let acceptable = false;
    if (official) acceptable = true;
    else if (tokens.length === 1) acceptable = exactName && tokens[0].length >= 5 && locationMatch;
    else acceptable = exactName || matched >= Math.min(2, tokens.length);
    if (!acceptable) continue;

    const score = (official ? 1000 : 0) + (exactName ? 100 : 0) + matched * 10 + (locationMatch ? 5 : 0);
    if (score > bestScore) { best = result; bestScore = score; }
  }
  return best;
}
function specialtyImage(entity, imageResults) {
  const tokens = mediaTokens(entity?.specialty);
  if (!tokens.length) return null;
  let best = null, bestScore = 0;
  for (const result of imageResults) {
    const haystack = sourceText(result);
    if (!haystack) continue;
    const matched = tokens.filter((token) => tokenPresent(haystack, token)).length;
    const required = tokens.length === 1 ? 1 : Math.min(2, tokens.length);
    if (matched >= required && matched > bestScore) { best = result; bestScore = matched; }
  }
  return best;
}
function mediaFromResult(result, { representative = false } = {}) {
  if (!result) return null;
  const caption = String(result.caption ?? "").trim();
  return {
    image_url: result.image_url,
    source_page: result.source_page,
    credit: representative ? `Imagen representativa del plato: ${caption || "fuente enlazada"}` : (caption || (() => { try { return new URL(result.source_page).hostname; } catch { return "Fuente enlazada"; } })()),
    verified_exact: true,
    ...(representative ? { representative_specialty: true } : {})
  };
}
function enrichGuideMedia(guide, imageResults) {
  if (!guide || !Array.isArray(guide.days)) return guide;
  const safeResults = Array.isArray(imageResults) ? imageResults : [];
  const attach = (item, kind) => {
    if (!item || typeof item !== "object") return;
    const modelVerifiedMedia = verifiedMedia(item.verified_media ?? item.media);
    let match = exactEntityImage(item, safeResults);
    let representative = false;
    if (!match && kind === "restaurant") {
      match = specialtyImage(item, safeResults);
      representative = Boolean(match);
    }
    delete item.media;
    delete item.verified_media;
    if (match) item.verified_media = mediaFromResult(match, { representative });
    else if (modelVerifiedMedia) item.verified_media = modelVerifiedMedia;
  };
  for (const day of guide.days) {
    for (const item of Array.isArray(day?.highlights) ? day.highlights : []) attach(item, "highlight");
    for (const item of Array.isArray(day?.restaurants) ? day.restaurants : []) attach(item, "restaurant");
    for (const item of Array.isArray(day?.overnight) ? day.overnight : []) attach(item, "overnight");
    if (day?.base && typeof day.base === "object") attach(day.base, "overnight");
  }
  return guide;
}
function buildVerifiedEditorialMaterial(profile) {
  const source = Array.isArray(profile.editorial_material) ? profile.editorial_material : [];
  return source.map((stage) => {
    const content = stage?.content ?? {};
    const lists = {};
    for (const key of ["places", "restaurants", "services", "workshops"]) {
      lists[key] = (Array.isArray(content[key]) ? content[key] : []).map(sanitizeItem).filter(Boolean);
    }
    return {
      driving_stage_id: stage.driving_stage_id,
      route_stage_key: stage.route_stage_key ?? null,
      content: lists
    };
  });
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function expectedStages(profile) {
  const exactById = new Map((profile.route_facts?.stages ?? []).map((stage) => [stage.driving_stage_id, stage]));
  return new Map(profile.stages.map((stage) => {
    const exact = exactById.get(stage.driving_stage_id);
    if (!exact) throw new Error(`Faltan hechos autoritativos de ${stage.driving_stage_id}`);
    return [stage.driving_stage_id, {
      driving_stage_id: stage.driving_stage_id,
      route_stage_key: exact.route_stage_key,
      from_point_id: exact.from_point_id,
      to_point_id: exact.to_point_id,
      overnight_id: exact.overnight_id ?? null,
      base_id: exact.base_id ?? exact.overnight_id ?? null,
      distance_m: number(exact.distance_m),
      duration_s: number(exact.duration_s),
      overnight_compatibility: exact.overnight_compatibility ?? null
    }];
  }));
}
function expectedVacationDays(profile) {
  const days = Array.isArray(profile.vacation_days) ? profile.vacation_days : [];
  return new Map(days.map((day) => [String(day.vacation_day_id), day]));
}
function copyAuthoritative(day, expected) {
  day.driving_stage_id = expected.driving_stage_id;
  day.route_stage_key = expected.route_stage_key;
  day.from_point_id = expected.from_point_id;
  day.to_point_id = expected.to_point_id;
  day.overnight_id = expected.overnight_id;
  day.base_id = expected.base_id;
  day.distance_m = expected.distance_m;
  day.duration_s = expected.duration_s;
  day.overnight_compatibility = expected.overnight_compatibility;
}
function enforceVacationDays(guide, profile) {
  const expected = expectedVacationDays(profile);
  if (!expected.size) return;
  if (guide.days.length !== expected.size) throw new Error("La guía no coincide con el número de días del viaje");
  const seen = new Set();
  guide.days.forEach((day, index) => {
    const expectedAtIndex = profile.vacation_days[index];
    const id = String(day?.vacation_day_id ?? "");
    if (!id || id !== String(expectedAtIndex?.vacation_day_id ?? "")) {
      throw new Error(`La guía alteró el orden o la identidad del día ${index + 1}`);
    }
    const facts = expected.get(id);
    if (!facts || seen.has(id)) throw new Error(`La guía alteró la identidad del día ${index + 1}`);
    seen.add(id);
    for (const field of ["day", "travel_date", "day_type", "driving_stage_id", "route_stage_key", "request_point_id", "requested_waypoint", "is_final", "stay_eligible", "base_id", "overnight_id"]) {
      if (day[field] != null && !same(day[field], facts[field])) throw new Error(`La guía intentó cambiar ${field} de ${id}`);
      day[field] = facts[field] ?? null;
    }
    day.vacation_day_id = id;
    if (facts.day_type === "estancia") {
      day.driving_km = 0;
      day.driving_minutes = 0;
    }
  });
  if (seen.size !== expected.size) throw new Error("La guía omitió días del viaje");
}
function validateGeneratedGuide(guide, profile) {
  if (!guide || typeof guide !== "object" || !Array.isArray(guide.days)) throw new Error("Guía generada inválida");
  enforceVacationDays(guide, profile);
  const expected = expectedStages(profile);
  const seen = new Set();
  for (const day of guide.days) {
    if (!day?.driving_stage_id) continue;
    const facts = expected.get(day.driving_stage_id);
    if (!facts) throw new Error(`La guía inventó el tramo ${day.driving_stage_id}`);
    if (seen.has(day.driving_stage_id)) throw new Error(`La guía duplicó el tramo ${day.driving_stage_id}`);
    seen.add(day.driving_stage_id);
    for (const [field, value] of [["route_stage_key", facts.route_stage_key], ["from_point_id", facts.from_point_id], ["to_point_id", facts.to_point_id], ["overnight_id", facts.overnight_id], ["base_id", facts.base_id]]) {
      if (day[field] != null && !same(day[field], value)) throw new Error(`La guía intentó cambiar ${field} de ${day.driving_stage_id}`);
    }
    if (day.distance_m != null && number(day.distance_m) !== facts.distance_m) throw new Error(`La guía intentó cambiar la distancia de ${day.driving_stage_id}`);
    if (day.duration_s != null && number(day.duration_s) !== facts.duration_s) throw new Error(`La guía intentó cambiar la duración de ${day.driving_stage_id}`);
    if (day.overnight_compatibility != null && !same(day.overnight_compatibility, facts.overnight_compatibility)) throw new Error(`La guía intentó cambiar la compatibilidad de ${day.driving_stage_id}`);
    copyAuthoritative(day, facts);
  }
  for (const id of expected.keys()) if (!seen.has(id)) throw new Error(`La guía omitió el tramo ${id}`);
  guide.route_countries = [...profile.route_facts?.countries ?? []];
  guide.country_metadata = profile.route_facts?.country_metadata ?? null;
  guide.logistics_warnings = [...profile.route_facts?.drivingWarnings ?? []];
  guide.max_driving_limit_satisfied = profile.route_facts?.maxDrivingLimitSatisfied !== false;
  return guide;
}

var PREMIUM_AUTH_URL = "https://campings-areas-premium.manuel-lopez-molina.workers.dev/me";
var DEFAULT_ALLOWED_ORIGINS = ["https://" + "campings-y-areas" + ".github.io"];
function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}
function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin"
  };
  if (origin && allowedOrigins(env).has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers["access-control-allow-headers"] = "Content-Type, Authorization";
    headers["access-control-max-age"] = "86400";
  }
  return headers;
}
function jsonReply(request, env, status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders(request, env) });
}
function preflight(request, env) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(env).has(origin)) return new Response(null, { status: 403, headers: { vary: "Origin" } });
  const headers = corsHeaders(request, env);
  delete headers["content-type"];
  return new Response(null, { status: 204, headers });
}

function clean(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}
function validEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
var ReportError = class extends Error {
  constructor(message, status = "invalid_report", httpStatus = 400) {
    super(message);
    this.name = "ReportError";
    this.status = status;
    this.httpStatus = httpStatus;
  }
};
async function reportError(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new ReportError("El informe debe contener JSON válido");
  }
  if (clean(body.website, 200)) return { ok: true, status: "reported" };
  const type = clean(body.type, 120), description = clean(body.description, 4000);
  if (!type || !description) throw new ReportError("Faltan los datos obligatorios del informe");
  const email = clean(body.email, 254);
  if (!validEmail(email)) throw new ReportError("Email de contacto inválido");
  if (!env.REPORT_TO_EMAIL || !env.REPORT_FROM_EMAIL || !env.REPORT_EMAIL?.send) {
    throw new ReportError("Servicio de informes no configurado", "report_service_unavailable", 503);
  }
  const lines = [
    `Tipo: ${type}`,
    `Descripción: ${description}`,
    `Corrección propuesta: ${clean(body.correction, 2000) || "-"}`,
    `Página/ficha: ${clean(body.page, 1000) || "-"}`,
    `Tipo de ficha: ${clean(body.item_type, 120) || "-"}`,
    `ID: ${clean(body.item_id, 240) || "-"}`,
    `Nombre: ${clean(body.item_name, 300) || "-"}`,
    `URL: ${clean(body.url, 1000) || "-"}`,
    `Remitente: ${clean(body.name, 120) || "-"}`,
    `Email de contacto: ${email || "-"}`
  ];
  try {
    await env.REPORT_EMAIL.send({ to: env.REPORT_TO_EMAIL, from: env.REPORT_FROM_EMAIL, subject: `Campings & Áreas · ${type}`, text: lines.join("\n"), replyTo: email || void 0 });
  } catch {
    throw new ReportError("No se pudo enviar el informe", "report_delivery_failed", 502);
  }
  return { ok: true, status: "reported" };
}

async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("Se requiere application/json");
  return request.json();
}
function generationEnabled(env) {
  return env.OPENAI_ROUTE_PIPELINE_ENABLED === "true" && env.OPENAI_SPEND_ENABLED === "true";
}
var PremiumAccessError = class extends Error {
  constructor(message, status, httpStatus) {
    super(message);
    this.name = "PremiumAccessError";
    this.status = status;
    this.httpStatus = httpStatus;
  }
};
var RouteUsageError = class extends Error {
  constructor(message, status = "route_usage_unavailable", httpStatus = 503) {
    super(message);
    this.name = "RouteUsageError";
    this.status = status;
    this.httpStatus = httpStatus;
  }
};
function premiumBearer(request) {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/i);
  return match ? match[1] : null;
}
async function requirePremiumAccess(request, env) {
  const token = premiumBearer(request);
  if (!token) {
    throw new PremiumAccessError("Debes iniciar sesión con una cuenta Premium.", "premium_auth_required", 401);
  }

  let response;
  try {
    response = await env.PREMIUM_AUTH.fetch("https://campings-areas-premium/me", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    });
  } catch (error) {
    throw new PremiumAccessError("No se pudo comprobar temporalmente el acceso Premium.", "premium_auth_unavailable", 503);
  }

  const payload = await response.json().catch(() => null);
  if (response.status === 401) {
    throw new PremiumAccessError("La sesión ha caducado o no es válida.", "premium_auth_required", 401);
  }
  if (!response.ok || !payload || payload.ok !== true) {
    throw new PremiumAccessError("No se pudo comprobar temporalmente el acceso Premium.", "premium_auth_unavailable", 503);
  }
  if (payload.premium !== true) {
    throw new PremiumAccessError("Esta cuenta no tiene una suscripción Premium activa.", "premium_required", 403);
  }
  return payload;
}
/**
 * @param {Request} request
 * @param {any} env
 * @param {string} path
 * @param {{ method?: string, body?: any }} options
 */
async function premiumUsageRequest(request, env, path, options = {}) {
  const { method = "GET", body } = options;
  const token = premiumBearer(request);
  if (!token) {
    throw new PremiumAccessError("Debes iniciar sesión con una cuenta Premium.", "premium_auth_required", 401);
  }

  let response;
  try {
    response = await env.PREMIUM_AUTH.fetch(`https://campings-areas-premium${path}`, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new RouteUsageError("No se pudo comprobar temporalmente el límite de rutas.");
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 401) {
    throw new PremiumAccessError("La sesión ha caducado o no es válida.", "premium_auth_required", 401);
  }
  if (response.status === 403) {
    throw new PremiumAccessError(
      payload?.message || "Esta cuenta no tiene una suscripción Premium activa.",
      "premium_required",
      403
    );
  }
  if (response.status === 429 || payload?.error === "route_limit_reached") {
    throw new RouteUsageError(
      payload?.message || "Has alcanzado el límite de 8 rutas con IA de este mes.",
      "route_limit_reached",
      429
    );
  }
  if (!response.ok || !payload || payload.ok !== true) {
    throw new RouteUsageError("No se pudo comprobar temporalmente el límite de rutas.");
  }

  return payload;
}
async function requireRouteUsageAvailable(request, env) {
  const usage = await premiumUsageRequest(request, env, "/route-usage");
  if (Number(usage.remaining) <= 0) {
    throw new RouteUsageError(
      "Has alcanzado el límite de 8 rutas con IA de este mes.",
      "route_limit_reached",
      429
    );
  }
  return usage;
}
async function routeUsageId(profile) {
  const bytes = new TextEncoder().encode(JSON.stringify(profile || {}));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `route_${hex}`;
}
async function consumeCompletedRoute(request, env, profile) {
  return premiumUsageRequest(request, env, "/route-usage/consume", {
    method: "POST",
    body: { route_id: await routeUsageId(profile) }
  });
}
async function planRoute(request, env) {
  await requirePremiumAccess(request, env);
  const profile = assertPlanRequest(await readJson(request));
  await requireRouteUsageAvailable(request, env);
  if (!generationEnabled(env)) return jsonReply(request, env, 503, { ok: false, status: "cost_guard_active", message: "Generación Premium desactivada" });
  const verifiedProfile = { ...profile, editorial_material: buildVerifiedEditorialMaterial(profile) };
  const plan = await generateJson(env, plannerPrompt(verifiedProfile));
  return jsonReply(request, env, 200, { ok: true, status: "planned", plan });
}
async function writeRoute(request, env) {
  await requirePremiumAccess(request, env);
  const profile = assertWriteRequest(await readJson(request));
  await requireRouteUsageAvailable(request, env);
  if (!generationEnabled(env)) return jsonReply(request, env, 503, { ok: false, status: "cost_guard_active", message: "Generación Premium desactivada" });
  const verifiedProfile = { ...profile, editorial_material: buildVerifiedEditorialMaterial(profile) };
  const visualComplete = verifiedProfile.visual_content === "completo";
  const generated = await generateJson(env, writerPrompt(verifiedProfile), { imageSearch: visualComplete, returnImageResults: visualComplete });
  const generatedGuide = visualComplete ? generated.data : generated;
  const imageResults = visualComplete ? generated.imageResults : [];
  const guide = validateGeneratedGuide(generatedGuide, verifiedProfile);
  if (visualComplete) enrichGuideMedia(guide, imageResults);
  const usage = await consumeCompletedRoute(request, env, profile);
  return jsonReply(request, env, 200, { ok: true, status: "written", guide, usage });
}
function errorStatus(error) {
  if (error instanceof PremiumAccessError) return { http: error.httpStatus, status: error.status };
  if (error instanceof RouteUsageError) return { http: error.httpStatus, status: error.status };
  const message = String(error?.message || "");
  if (message.startsWith("OpenAI")) return { http: 502, status: "generation_failed" };
  if (message === "OPENAI_API_KEY no configurada") return { http: 503, status: "generation_unavailable" };
  return { http: 400, status: "invalid_route_contract" };
}
var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return preflight(request, env);
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/plan-route") return await planRoute(request, env);
      if (request.method === "POST" && url.pathname === "/write-route") return await writeRoute(request, env);
      if (request.method === "POST" && url.pathname === "/report-error") return jsonReply(request, env, 200, await reportError(request, env));
      if (request.method === "GET" && url.pathname === "/health") {
        return jsonReply(request, env, 200, { ok: true, service: "campings-areas-route-guide", contract: "route-contract-v3" });
      }
      return jsonReply(request, env, 404, { ok: false, status: "not_found" });
    } catch (error) {
      if (url.pathname === "/report-error") {
        const http = error instanceof ReportError ? error.httpStatus : 500;
        const status = error instanceof ReportError ? error.status : "report_failed";
        return jsonReply(request, env, http, { ok: false, status, message: error?.message || "No se pudo enviar el informe" });
      }
      const failure = errorStatus(error);
      return jsonReply(request, env, failure.http, { ok: false, status: failure.status, message: error?.message || "Solicitud inválida" });
    }
  }
};
export {
  index_default as default
};
