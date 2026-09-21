# CHECKPOINT — Reparación total Campings & Áreas
Fecha: 2026-09-21
Base main al iniciar: 3274a8eb213945fd0e784c4cde3b931dcac69369

## Objetivo
Dejar la web completa funcional y coherente, con especial atención a Rutas Premium. No considerar terminado por una auditoría estática: exigir verificación funcional final.

## Estado funcional confirmado
- Web pública abierta.
- Demo pública verificada funcional tras PR #54, #55 y #56.
- Una prueba real de Rutas Düppenweiler → Trier calculó correctamente Geoapify: 51 km, 1 h 3 min, mapa y geometría visibles.
- Esa prueba se detuvo antes de la guía con status research_required para Trier y no mostró consumo OpenAI.
- No repetir pruebas reales hasta cerrar todas las comprobaciones gratuitas.

## Cambios recientes relevantes
- #52 recuperó motor histórico como rutas-legacy.js y apuntó rutas-config.js al Worker antiguo rutas-campings-areas.
- #53 reabrió la web.
- #54–#56 repararon Demo; no tocar Demo sin evidencia nueva.
- #58 conectó Authorization únicamente en llamarWorker() de rutas-legacy.js.
- Worker antiguo fue reemplazado/desplegado manualmente en Cloudflare y ahora contiene wrapper Premium/cuota; GET raíz responde Backend de desarrollo funcionando.
- Binding observado en Worker antiguo: DB=rutas-campings-areas-dev y PREMIUM_AUTH.
- El editor Cloudflare mostró diagnósticos TypeScript, aunque desplegó.

## Hallazgos confirmados de esta revisión
1. main mezcla dos arquitecturas: rutas-legacy.js espera endpoints históricos de investigación/D1/media además de plan/write; worker-new del repo implementa otro contrato y no representa el Worker antiguo desplegado.
2. rutas-legacy.js en main añade Authorization a llamarWorker() (plan-route/write-route), pero llamadas directas a research-cache, research-destination, media-cache y research-media no usan esa autorización.
3. Existe rama unificar-rutas-premium-2026-09-21 que centraliza headersWorker() y añade autorización a esas llamadas directas. NO fusionar a ciegas: validar primero el CORS y contrato del Worker desplegado.
4. worker-new/src/http.js sólo permite Access-Control-Allow-Headers: Content-Type, no Authorization. Si se usa ese Worker con auth, CORS es incompatible.
5. worker-new/src/index.js no implementa research-cache/research-destination/media-cache/research-media. No sustituye directamente al Worker histórico.
6. El checklist original exige autorización real de endpoints con gasto, D1 reutilizable, multimedia degradable/no bloqueante, Planner/Writer sin bucles de gasto y protección de coste.
7. scripts/probar-reparacion-rutas.mjs está desactualizado respecto a main: exige arquitectura modular y ausencia de rutas.js; main usa ahora rutas-legacy.js recuperado. No interpretar ese script como prueba funcional actual.

## Flujo que debe quedar coherente
Premium login/session → autorización Worker → Geoapify → logística → plan-route → research_required si falta D1 → research-destination → guardar/releer D1 → reintentar plan-route → write-route → investigación adicional si procede → multimedia/cache → guía textual final → fotos si disponibles → cuota exactamente una ruta completada.

## Pendiente obligatorio antes de otra prueba real
- Obtener/inspeccionar la fuente EXACTA del Worker antiguo actualmente desplegado en Cloudflare. El repo no la contiene.
- Verificar CORS actual, especialmente Authorization.
- Verificar qué endpoints exigen Premium y qué métodos usan.
- Verificar research-cache, research-destination, media-cache, research-media, plan-route, write-route.
- Verificar OPENAI_ROUTE_PIPELINE_ENABLED y OPENAI_SPEND_ENABLED del Worker correcto.
- Verificar D1 y normalización Trier/Germany.
- Verificar que investigación nueva se guarda y se reutiliza.
- Verificar que multimedia no impide guía textual válida.
- Verificar que la cuota se consume sólo con guía completada y una sola vez.
- Verificar que fallos parciales no causan reintentos de pago automáticos.
- Revisar Premium Worker y Service Binding conjuntamente con Route Worker.
- Revisar Stripe TEST/LIVE sólo después de Rutas funcional.
- Auditoría final de navegación, formularios, Inicio, Campings, Áreas, Parkings, Acampadas, Lugares, Talleres, Servicios, Normativas, Demo, Rutas, Premium e Informar error.

## Reglas de trabajo
- No gastar OpenAI durante diagnóstico/reparación.
- No ejecutar research-destination real si puede gastar hasta comprobar flags/protecciones.
- No repetir una ruta automáticamente.
- No tocar Demo salvo fallo demostrado.
- No parchear error por error: validar el flujo completo antes de desplegar.
- Hacer cambios en rama/PR, auditar y sólo fusionar cuando sean coherentes.
- Actualizar ESTE checkpoint tras cada bloque importante: hallazgo, cambio, commit/PR, prueba y pendiente.
- Si el trabajo se interrumpe, el siguiente agente debe leer este archivo y comprobar GitHub/Cloudflare antes de continuar; no reconstruir de memoria.

## Criterio de cierre
Sólo terminado cuando: comprobaciones gratuitas limpias + Worker/Frontend/Premium/D1 coherentes + una única prueba real produce guía completa correcta + cuota pasa exactamente de 8 a 7 (o equivalente de una unidad) + Stripe LIVE configurado y probado sin alterar Rutas + auditoría funcional final.


## Actualización 2026-09-21 — autorización unificada (rama reparar-autorizacion-rutas-2026-09-21)
- Se inspeccionó la fuente exacta del Worker desplegado aportada por el usuario.
- La capa Premium exterior resuelve OPTIONS antes del motor histórico y permite Content-Type, Authorization.
- Protege plan-route, write-route, research-cache, research-destination, media-cache, research-media y official-media.
- Verifica Premium en todos los endpoints protegidos y disponibilidad de cuota en los endpoints de coste.
- La cuota se consume únicamente tras write-route con ok=true, status=written y guide; usa route_id SHA-256 estable para consumo idempotente.
- Se creó una rama nueva desde main actual, sin fusionar la rama divergida unificar-rutas-premium-2026-09-21.
- rutas-legacy.js ahora usa headersWorker() para plan/write y todas las llamadas directas protegidas.
- app/premium-rutas.js expone window.CAMPINGS_PREMIUM_AUTH_HEADERS usando premiumAuthorizationHeaders() de premium-client.js.
- Auditoría estática confirma que research-cache, research-destination, media-cache, research-media y official-media llevan Authorization.
- rutas-config.js sigue apuntando al Worker histórico rutas-campings-areas.
- No se ha realizado ninguna llamada OpenAI ni prueba real de ruta en este bloque.
- Pendiente: comprobar flags reales de Cloudflare, D1/Trier, Service Binding Premium, realizar comprobaciones gratuitas y después una única prueba real controlada.


## Actualización 2026-09-21 — auditoría gratuita vigente
- Se actualizó scripts/probar-reparacion-rutas.mjs para auditar la arquitectura realmente publicada: rutas-legacy.js + Premium, no la arquitectura modular retirada.
- La nueva auditoría detectó una regresión real: al penalizar pernoctas repetidas se comparaba el nombre del alojamiento con la localidad anterior. Se corrigió para comparar localidadAlojamiento(cand) con ultimoLugar.
- Ejecución GitHub Actions #149: SUCCESS.
- Resultado específico de Rutas: arquitectura vigente OK; autorización Premium en endpoints protegidos OK; regresiones geográficas antiguas no presentes.
- Auditoría integral: 293 archivos, 174 JSON, 85 JS, 100374 objetos JSON y 49758 objetos con coordenadas; AUDITORÍA ESTÁTICA AMPLIADA OK.
- Clasificación geográfica de datos activos: 0 fuera de Europa mal archivados, 0 país distinto >5 km de alta confianza, 0 lat/lon intercambiadas, 0 coordenadas 0,0. Quedan 96 puntos sin polígono terrestre >5 km para revisión no inequívoca; el clasificador no los considera anomalías inequívocas.
- No se realizó ninguna llamada OpenAI ni prueba real de ruta durante esta auditoría.
- Pendiente antes de la prueba real: verificar en Cloudflare los valores reales de flags de gasto/pipeline/media/test, el binding D1 y el Service Binding PREMIUM_AUTH; verificar contrato del Premium Worker y después realizar una única prueba real controlada.
- La comprobación D1 debe ser general para coherencia de destinos y países; Trier se mantiene únicamente como el caso observado que descubrió el problema anterior, no como objetivo especial de la reparación.


## Actualización 2026-09-21 — Cloudflare y cuota Premium verificados
- Configuración real del Worker histórico rutas-campings-areas comprobada en Cloudflare: OPENAI_SPEND_ENABLED=false, OPENAI_ROUTE_PIPELINE_ENABLED=false y OPENAI_MEDIA_ENABLED=false durante el diagnóstico; OPENAI_API_KEY permanece como secreto cifrado.
- Bindings reales comprobados: DB -> rutas-campings-areas-dev y PREMIUM_AUTH -> campings-areas-premium.
- Se inspeccionó directamente el Worker campings-areas-premium actualmente activo. Implementa GET /route-usage y POST /route-usage/consume.
- consumeRouteUsage valida route_id, incorpora billing_period al identificador almacenado y consulta previamente user_id + route_id, por lo que repetir la misma ruta completada dentro del mismo periodo devuelve duplicate=true sin un segundo consumo.
- El límite mensual se aplica con un INSERT OR IGNORE condicionado por COUNT(*) < ROUTE_MONTHLY_LIMIT, evitando superar el límite incluso con consumos concurrentes.
- Tras el INSERT vuelve a comprobar el route_id; si no se insertó por límite devuelve HTTP 429, route_limit_reached, remaining=0. En éxito devuelve used, limit, remaining y billing_period.
- La interfaz/mensaje confirma un límite de 8 rutas IA al mes.
- No se modificó ni desplegó el Worker Premium durante esta inspección.
- Siguiente paso: determinar y activar únicamente los flags necesarios para una sola prueba real controlada; mantener multimedia desactivado si no es necesario para validar la guía textual, y comprobar consumo exactamente una vez.
