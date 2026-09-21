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

## Registro de reparación integral

### Bloque 1 — Punto de partida verificado en GitHub (2026-09-21)
- Rama de trabajo creada: `reparacion-integral-2026-09-21`, basada en el checkpoint `4272c944440f6f50fd23bc802ab0e72800d9c4c5`.
- `main` verificada en `3274a8eb213945fd0e784c4cde3b931dcac69369`.
- La rama `checkpoint-reparacion-total-2026-09-21` está exactamente un commit por delante de `main` y su única diferencia es este archivo.
- PR #58 verificado en GitHub como cerrado y fusionado; merge commit `3274a8eb213945fd0e784c4cde3b931dcac69369`.
- La rama `unificar-rutas-premium-2026-09-21` existe en `f84413684198ffc9a128f5f522e457acdc69a7e3` y cambia sólo `app/premium-rutas.js`, `rutas-legacy.js` y `rutas.html`.
- Hallazgo nuevo: esa rama centraliza `headersWorker()` y añade `Authorization` a investigación/media, pero cambia la referencia de `rutas-legacy.js?v=2` a `v=1`. Es una regresión potencial de caché; no se fusionará tal cual.
- No se ha ejecutado ninguna llamada de OpenAI, investigación con gasto ni ruta real durante este bloque.
- Pendiente inmediato: auditar código y contratos completos; obtener y comparar la fuente exacta de los Workers desplegados y sus bindings antes de decidir la arquitectura definitiva.

## Criterio de cierre
Sólo terminado cuando: comprobaciones gratuitas limpias + Worker/Frontend/Premium/D1 coherentes + una única prueba real produce guía completa correcta + cuota pasa exactamente de 8 a 7 (o equivalente de una unidad) + Stripe LIVE configurado y probado sin alterar Rutas + auditoría funcional final.
