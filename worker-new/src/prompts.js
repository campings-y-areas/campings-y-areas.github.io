function json(value) {
  return JSON.stringify(value);
}

export function plannerPrompt(profile) {
  return [
    "Eres el planificador editorial de Campings & Áreas.",
    "La ruta, las etapas, distancias, tiempos y pernoctas recibidas son hechos cerrados y no puedes cambiarlos.",
    "Organiza una guía premium extensa día por día. Decide únicamente contenido editorial: visitas, actividades, gastronomía, restaurantes e información práctica.",
    "Respeta destinos pedidos, edades, mascota, intereses, ritmo, presupuesto, notas y avisos logísticos.",
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
    "El plan editorial recibido y los hechos de ruta son la base. No cambies geometría, distancias, tiempos, destinos solicitados, IDs ni pernoctas.",
    "Puedes desarrollar ampliamente narrativa, visitas, actividades, gastronomía, restaurantes y consejos prácticos con el material verificado disponible.",
    "Las fotografías solo pueden incluirse cuando el material recibido las identifica como verificadas.",
    "Devuelve solo JSON válido y conserva los identificadores autoritativos de cada jornada/tramo.",
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
