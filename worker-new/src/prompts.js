function json(value) {
  return JSON.stringify(value);
}

const GUIDE_SHAPE = {
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
    overnight: [{ name: "string", description: "string", services: "string", practical_info: "string", url: "string", maps: "string" }],
    warning: "string",
    maps_url: "string",
    practical_advice: ["string"],
    final_recommendation: "string"
  }],
  final_notes: ["string"]
};

export function plannerPrompt(profile) {
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
        pace: profile.pace, interests: profile.interests, budget: profile.budget,
        visual_content: profile.visual_content, user_notes: profile.user_notes
      },
      route_facts: profile.route_facts,
      editorial_material: profile.editorial_material,
      editorial_brief: profile.editorial_brief
    })
  ].join("\n\n");
}

export function writerPrompt(profile) {
  return [
    "Eres el redactor de la guía premium de Campings & Áreas.",
    "Redacta una guía de viaje extensa, útil y natural, organizada día por día; no una colección de tarjetas breves.",
    "Debes devolver exactamente un elemento de days por cada elemento de vacation_days, en el mismo orden y con sus campos de identidad copiados sin cambios.",
    "Los días day_type=estancia no tienen un nuevo tramo de conducción: driving_stage_id debe ser null y el contenido se desarrolla alrededor de la base/destino asignado.",
    "El plan editorial recibido y los hechos de ruta son la base. No cambies geometría, distancias, tiempos, destinos solicitados, IDs ni pernoctas.",
    "Puedes desarrollar ampliamente narrativa, visitas, actividades, gastronomía, restaurantes y consejos prácticos con el material verificado disponible.",
    "Si visual_content es completo, usa la búsqueda de imágenes disponible para localizar fotografías de las entidades concretas que realmente recomiendas (visitas y restaurantes).",
    "Solo añade verified_media cuando el resultado de imagen corresponda de forma inequívoca a ESA entidad exacta por nombre, descripción/caption y página fuente. Si existe cualquier duda, omite la foto.",
    "Para una foto obtenida por búsqueda usa verified_media={image_url: image_url del resultado, source_page: source_website_url del resultado, credit: caption o nombre de la fuente, verified_exact:true}. No inventes, reconstruyas ni modifiques URLs.",
    "El material recibido que ya contenga verified_media verificado también puede copiarse sin cambiar image_url, source_page, credit ni verified_exact.",
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
