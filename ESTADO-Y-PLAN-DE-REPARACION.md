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

### Bloque 2 — Fuentes desplegadas, endpoints y costes auditados (2026-09-21)
- Fuente recuperada del Route Worker antiguo desplegado: `rutas-campings-areas-DEFINITIVO.js`, 8.111 líneas, SHA-256 `d2cac088c0493c20377a474225400bbd7681c112e7bdee20286fd0922dda3bb7`.
- Fuente exacta más reciente recuperada del Premium Worker desplegado: `Se ha pegado el código(20260921-095942).js`, SHA-256 `8a7b17accac867ab75b592479edcee4f2ac2bcebfaff4710493f49834707f149`. La copia `campings-areas-premium-FINAL-8-rutas.txt` (`0ada9d…`) es anterior y no debe tomarse como el despliegue vigente.
- Fuente exacta recuperada del Route Worker nuevo desplegado: `Se ha pegado el código(10).js`, SHA-256 `ba9cf495a9e618b2b88bbb07aa70d7531717c2fd55e54165e066a1e12d541b03`. Es un bundle del contrato v3 con wrapper Premium y no implementa los endpoints históricos de investigación/media que consume el frontend activo.
- Las respuestas públicas corroboran esos despliegues: Route Worker antiguo devuelve el backend histórico y D1 conectado; Route Worker nuevo devuelve `route-contract-v3`; Premium devuelve fase 2, `stripe_mode: test` y autenticación por código.
- Preflight gratuito verificado en Worker antiguo para plan, caché, investigación y multimedia: permite el origen público y `Content-Type, Authorization`. Premium también. El Worker nuevo desplegado también permite `Authorization`, pero su fuente en el repositorio todavía no: hay desincronización real entre repo y despliegue.
- `/cost-status` del Worker antiguo verificado sin gasto: `OPENAI_SPEND_ENABLED=false`, `OPENAI_ROUTE_PIPELINE_ENABLED=false`, `OPENAI_MEDIA_ENABLED=false`, `OPENAI_TEST_ENDPOINT_ENABLED=false`, protección `COST_GUARD_ACTIVE`, 32 investigaciones D1 y cachés de plan/guía existentes.
- Hallazgo crítico de identidad: `elegirFinJornadaRealV3()` obtiene la supuesta localidad con `nombreLugarWorker(revPernocta, ...)`, función que prioriza `raw.name`/`other_names.name`. En un reverse geocode sobre una pernocta puede devolver el nombre del camping o área en vez de la ciudad. `/cost-status` confirma contaminación funcional reciente con claves como `kamp zagreb|croatia`, `camper stop maribor - partizanska|slovenia` y varios `wohnmobilstellplatz...|germany`.
- Hallazgo crítico de autenticación: `main` no envía Bearer en lecturas/investigaciones directas. La rama `unificar` corrige cuatro familias, pero omite `/official-media`; además conserva la regresión de caché `v=2` → `v=1`.
- Hallazgo de cuota corregido tras localizar la fuente más reciente: el Premium Worker vigente usa `INSERT OR IGNORE ... SELECT ... WHERE COUNT < 8`, por lo que la comprobación e inserción del límite son atómicas. Queda por demostrar directamente que D1 tiene una restricción única sobre `(user_id, route_id)` —necesaria para que `OR IGNORE` garantice idempotencia— y ambos Route Workers aún generan `route_id` mediante FNV-1a de 32 bits, con riesgo de colisión.
- Hallazgo de Stripe: el despliegue sigue expresamente en TEST y el frontend contiene IDs de precio TEST. LIVE continúa pendiente y no se tocará hasta cerrar Rutas.
- Pruebas gratuitas: `npm run audit` informa OK, pero es un falso positivo parcial porque no valida que `rutas-legacy.js` sea el motor activo ni los Workers desplegados. `npm test` falla 1/3 en el test modular de Geoapify porque aún espera el parámetro inválido `details=admin_areas`; los 17 tests de `worker-new` pasan. Ambas fuentes desplegadas superan comprobación de sintaxis.
- El panel de Cloudflare no fue accesible desde el navegador de trabajo por una verificación humana persistente. No se intentó eludirla; las fuentes exactas guardadas y las respuestas de producción permitieron continuar la auditoría.
- No se ejecutó ninguna ruta real ni endpoint que pueda llamar a OpenAI. Todos los flags observados siguen cerrados.
- Pendiente inmediato: corregir identidad de localidad, unificar headers incluyendo `/official-media`, versionado de caché, pruebas/auditoría, sincronizar fuentes de Workers en GitHub y blindar cuota antes de cualquier despliegue o prueba real.

### Bloque 3 — Frontend coherente y fuentes de Workers versionadas (2026-09-21)
- Cambios funcionales publicados en la rama `reparacion-integral-2026-09-21`; cabeza remota tras subir las 15 rutas modificadas: `ccd550d7afe79460e166f60ec0e671e9f376b70f`. PR borrador #59 abierto contra `main`: `https://github.com/campings-y-areas/campings-y-areas.github.io/pull/59`. No se fusionará hasta verificar dependencias y despliegues.
- `app/premium-rutas.js` expone el lector único de cabeceras de sesión y `rutas-legacy.js` lo usa, con fallback seguro por orden de carga, en Planner, Writer, ambas lecturas de `/research-cache`, `/research-destination`, `/official-media`, `/media-cache` y `/research-media`.
- La localidad de la pernocta ahora sale de `nombreLocalidad(revPernocta)` y sólo cae al catálogo si no existe reverse geocode; deja de usar el nombre del camping/área como clave de destino. Se subió `rutas-legacy.js` a `v=3` para evitar caché antigua.
- Se corrigió el test de Geoapify: la API ya no recibe el parámetro inválido `details=admin_areas`. La auditoría valida ahora el motor realmente cargado, sus cabeceras protegidas y la identidad administrativa de la pernocta; ya no acepta la mera presencia de módulos inactivos como prueba suficiente.
- Se versionaron las tres fuentes completas recuperadas en `workers/`: Route Worker histórico activo, Premium Worker y Route Worker v3. El v3 del repo también permite `Authorization` en CORS.
- Ambos Route Workers sustituyen FNV-1a de 32 bits por SHA-256 para el `route_id`. Se añadió migración D1 declarativa con índice único `(user_id, route_id)` e índice de periodo, precedida por consulta obligatoria de duplicados. La migración NO se ha ejecutado: antes hay que inspeccionar D1 directamente.
- Pruebas gratuitas superadas: 9/9 tests del sitio, 18/18 tests de `worker-new`, sintaxis de las tres fuentes completas y `npm run audit` sobre 300 archivos. No hubo llamadas a OpenAI, investigación real ni ruta real.
- No se desplegó ningún Worker: el siguiente bloque debe publicar el commit/PR, comprobar en Cloudflare bindings y esquema D1, ejecutar la migración sólo si el preflight no tiene duplicados, desplegar primero Premium y después Route Worker, y repetir health/CORS/cost guard gratuitos antes de habilitar una única prueba controlada.

### Bloque 4 — PR verificado y límite de acceso a Cloudflare (2026-09-21)
- PR borrador #59 publicado. Los SHA de blob de los 15 archivos del bloque anterior se compararon entre el workspace y GitHub: 15/15 idénticos. GitHub Actions `Auditoría integral gratuita` (run `35596577141`) terminó con `success` sobre la cabeza remota.
- Se añadió una prueba aislada del Premium Worker con D1 simulado: la primera guía pasa de 8 a 7 restantes, repetir exactamente el mismo `route_id` no vuelve a consumir y una novena ruta recibe 429 sin insertar. Resultado gratuito actualizado: 11/11 tests del sitio + 18/18 de `worker-new`; auditoría ampliada OK sobre 301 archivos.
- Acceso Cloudflare comprobado sin modificar nada: no hay variables de credenciales configuradas y `wrangler whoami` responde `You are not authenticated`. El navegador de trabajo sigue bloqueado por la verificación humana de Cloudflare. También se buscó una integración instalable de Cloudflare Workers/D1 y no existe ninguna disponible.
- Por tanto NO se ha inspeccionado aún el esquema real de D1, NO se ha ejecutado la migración, NO se han desplegado Workers y NO se han abierto los flags de coste. Para continuar hace falta autenticar Wrangler o aportar un API Token limitado al proyecto con permisos de lectura/escritura de Workers y D1; después se ejecutarán primero consultas de sólo lectura.
- No se ejecutó OpenAI, investigación real ni ruta real. Stripe continúa en TEST por diseño hasta cerrar Rutas.

## Criterio de cierre
Sólo terminado cuando: comprobaciones gratuitas limpias + Worker/Frontend/Premium/D1 coherentes + una única prueba real produce guía completa correcta + cuota pasa exactamente de 8 a 7 (o equivalente de una unidad) + Stripe LIVE configurado y probado sin alterar Rutas + auditoría funcional final.
