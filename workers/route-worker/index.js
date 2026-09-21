const legacyWorker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS: permite que la web pública de Campings & Áreas llame al Worker.
    // No modifica la protección de costes ni habilita OpenAI.
    const allowedOrigins = new Set([
      "https://campings-y-areas.github.io"
    ]);
    const requestOrigin = request.headers.get("Origin") || "";
    const headers = {
      "Content-Type": "application/json; charset=UTF-8"
    };

    if (allowedOrigins.has(requestOrigin)) {
      headers["Access-Control-Allow-Origin"] = requestOrigin;
      headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Content-Type";
      headers["Vary"] = "Origin";
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers
      });
    }

    function getOutputText(data) {
      return (
        data.output
          ?.flatMap(item => item.content || [])
          ?.find(item => item.type === "output_text")
          ?.text || null
      );
    }

    function getWebSources(data) {
      const sources = [];
      const seen = new Set();

      function addSource(url, title = null) {
        if (!url || seen.has(url)) return;
        seen.add(url);
        sources.push({ url, title });
      }

      for (const item of data.output || []) {
        if (
          item.type === "web_search_call" &&
          Array.isArray(item.action?.sources)
        ) {
          for (const source of item.action.sources) {
            addSource(source.url, source.title || null);
          }
        }

        for (const content of item.content || []) {
          for (const annotation of content.annotations || []) {
            if (annotation.type === "url_citation") {
              addSource(
                annotation.url || annotation.url_citation?.url,
                annotation.title || annotation.url_citation?.title || null
              );
            }
          }
        }
      }

      return sources;
    }

    function normalizeKey(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
    }

    function canonicalDestinationName(place, country) {
      const p = normalizeKey(place);
      const c = normalizeKey(country);

      // Geoapify puede devolver el nombre administrativo "Grad Zagreb"
      // para la ciudad de Zagreb. En D1 la investigación está guardada
      // correctamente como "zagreb|croatia". Ambas formas representan
      // el mismo destino y deben reutilizar la misma investigación.
      if (c === "croatia" && p === "grad zagreb") return "zagreb";

      return p;
    }

    function destinationKey(place, country) {
      return `${canonicalDestinationName(place, country)}|${normalizeKey(country)}`;
    }

    // v44: una pernocta de ruta debe admitir realmente vehículos vivienda.
    // Evita que hoteles, habitaciones o apartamentos entren en "Dónde dormir"
    // cuando el viaje se realiza en autocaravana/camper.
    function isVehicleCompatibleOvernight(entry) {
      if (!entry || typeof entry !== "object") return false;
      const text = normalizeKey([
        entry.name, entry.type, entry.why, entry.services, entry.practical_info
      ].filter(Boolean).join(" "));
      if (!text) return false;

      const positive = /camping|campsite|campground|camper|autocaravana|motorhome|wohnmobil|wohnmobilstellplatz|stellplatz|caravan|caravana|rv park|area de pernocta|area para autocaravanas|parking para autocaravanas|parking de autocaravanas|camper stop|camperstop|pitch|parcelas/.test(text);
      if (positive) return true;

      const incompatible = /habitacion|habitaciones|hotel|hostal|hostel|bed and breakfast|b&b|apartamento|apartamentos|apartment|apartments|ferienwohnung|guesthouse|pension|alojamiento convencional|no es una opcion de parcela|no es parcela|sin parcela|no admite autocaravana|no admite camper/.test(text);
      if (incompatible) return false;

      // Si no hay evidencia explícita de compatibilidad con vehículo vivienda,
      // no se ofrece como pernocta Premium. Es preferible omitirla a recomendar
      // un alojamiento que no sirve para la autocaravana/camper.
      return false;
    }

    function sanitizeOvernightList(list) {
      return (Array.isArray(list) ? list : []).filter(isVehicleCompatibleOvernight);
    }

    function overnightTypeMatches(entry, allowedTypes = []) {
      const allowed = new Set((Array.isArray(allowedTypes) ? allowedTypes : []).map(normalizeKey));
      if (!allowed.size) return true;
      const text = normalizeKey([entry?.name, entry?.type, entry?.why, entry?.services, entry?.practical_info].filter(Boolean).join(" "));
      const isCamping = /camping|campsite|campground|campamento/.test(text);
      const isArea = /area de|area para|stellplatz|wohnmobilstellplatz|camper stop|camperstop|rv park|autocaravana|motorhome/.test(text);
      const isParking = /parking|aparcamiento|parkplatz/.test(text);
      return (allowed.has("camping") && isCamping) ||
        (allowed.has("area") && isArea) ||
        (allowed.has("parking") && isParking);
    }

    function sanitizeOvernightListForTypes(list, allowedTypes = []) {
      return sanitizeOvernightList(list).filter(entry => overnightTypeMatches(entry, allowedTypes));
    }

    function sanitizeGuideOvernightResponse(response, allowedTypes = []) {
      if (!response || typeof response !== "object") return response;
      const copy = structuredClone(response);
      if (copy.guide && Array.isArray(copy.guide.days)) {
        for (const day of copy.guide.days) {
          if (Array.isArray(day?.overnight)) day.overnight = sanitizeOvernightListForTypes(day.overnight, allowedTypes);
        }
      }
      return copy;
    }

    function parseStoredJson(value) {
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }

    // PROTECCIÓN DE COSTES IA.
    // Los gates se resuelven por petición desde Runtime Variables y fallan cerrados.
    // La ruta principal exige DOS permisos: maestro + pipeline de ruta.
    // Multimedia y /openai-test quedan aislados y no se abren al probar una ruta.
    const OPENAI_SPEND_ENABLED =
      String(env?.OPENAI_SPEND_ENABLED || "").toLowerCase() === "true";
    const OPENAI_ROUTE_PIPELINE_ENABLED =
      String(env?.OPENAI_ROUTE_PIPELINE_ENABLED || "").toLowerCase() === "true";
    const OPENAI_MEDIA_ENABLED =
      String(env?.OPENAI_MEDIA_ENABLED || "").toLowerCase() === "true";
    const OPENAI_TEST_ENDPOINT_ENABLED =
      String(env?.OPENAI_TEST_ENDPOINT_ENABLED || "").toLowerCase() === "true";

    // Revisión del pipeline generativo. Evita que un fallo sistemático guardado
    // por una versión antigua del Worker bloquee para siempre una versión corregida.
    const GENERATION_PIPELINE_REVISION = "2026-09-13-r6";

    // BLOQUEO MAESTRO + BLOQUEO POR ÁMBITO.
    // Toda llamada HTTP a OpenAI debe pasar obligatoriamente por este helper.
    function openAiScopeEnabled(scope = "route") {
      if (OPENAI_SPEND_ENABLED !== true) return false;
      return (
        (scope === "route" && OPENAI_ROUTE_PIPELINE_ENABLED === true) ||
        (scope === "media" && OPENAI_MEDIA_ENABLED === true) ||
        (scope === "test" && OPENAI_TEST_ENDPOINT_ENABLED === true)
      );
    }

    async function openAiFetch(resource, options, scope = "route") {
      if (OPENAI_SPEND_ENABLED !== true) {
        const error = new Error("OPENAI_SPEND_DISABLED");
        error.code = "OPENAI_SPEND_DISABLED";
        throw error;
      }

      if (!openAiScopeEnabled(scope)) {
        const error = new Error(`OPENAI_SCOPE_DISABLED:${scope}`);
        error.code = "OPENAI_SCOPE_DISABLED";
        error.scope = scope;
        throw error;
      }

      return fetch(resource, options);
    }

    async function openAiMediaFetch(resource, options) {
      return openAiFetch(resource, options, "media");
    }

    async function openAiTestFetch(resource, options) {
      return openAiFetch(resource, options, "test");
    }

const MEDIA_ENRICH_TOKEN = String(env.MEDIA_ENRICH_TOKEN || "");
const MEDIA_AI_QUEUE_TOKEN = String(env.MEDIA_AI_QUEUE_TOKEN || "");
const MEDIA_VISUAL_REVIEW_TOKEN = String(env.MEDIA_VISUAL_REVIEW_TOKEN || "");
const CONTROLLED_AI_MEDIA_TEST_TOKEN = String(env.CONTROLLED_AI_MEDIA_TEST_TOKEN || "");
const CONTROLLED_AI_MEDIA_TEST_KEY = "ai-media-paris-missing-v1";
const CONTROLLED_PARIS_RESTAURANTS_MEDIA_TOKEN = String(env.CONTROLLED_PARIS_RESTAURANTS_MEDIA_TOKEN || "");
const CONTROLLED_PARIS_RESTAURANTS_MEDIA_KEY = "ai-media-paris-restaurants-affordable-v2";

    // PRUEBA CONTROLADA ÚNICA: solo París, Francia.
    // No habilita OpenAI de forma general.
    const CONTROLLED_PARIS_TEST_ENABLED = false;
    const CONTROLLED_PARIS_TEST_TOKEN = String(env.CONTROLLED_PARIS_TEST_TOKEN || "");
    const CONTROLLED_PARIS_TEST_KEY = "research-paris-france-premium-v3-phased";
    // v32: prueba única controlada del flujo v31 con un destino completamente nuevo.
    const CONTROLLED_VALENCIA_TEST_ENABLED = false;
    const CONTROLLED_VALENCIA_TEST_TOKEN = String(env.CONTROLLED_VALENCIA_TEST_TOKEN || "");
    const CONTROLLED_VALENCIA_TEST_KEY = "research-valencia-spain-premium-v31-validity-test";

    async function ensureControlledTestTable() {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS ai_controlled_tests (
          test_key TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          finished_at TEXT,
          usage_json TEXT,
          note TEXT
        )
      `).run();
    }

    function isControlledParisRequest(place, country, requestToken) {
      return (
        CONTROLLED_PARIS_TEST_ENABLED &&
        normalizeKey(place) === "paris" &&
        normalizeKey(country) === "france" &&
        requestToken === CONTROLLED_PARIS_TEST_TOKEN
      );
    }

    async function claimControlledParisTest() {
      await ensureControlledTestTable();

      const runId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT OR IGNORE INTO ai_controlled_tests (
          test_key,
          run_id,
          status,
          started_at,
          note
        )
        VALUES (?, ?, 'started', CURRENT_TIMESTAMP, ?)
      `).bind(
        CONTROLLED_PARIS_TEST_KEY,
        runId,
        "Prueba única y controlada de investigación Premium de París."
      ).run();

      const row = await env.DB.prepare(`
        SELECT test_key, run_id, status, started_at, finished_at
        FROM ai_controlled_tests
        WHERE test_key = ?
        LIMIT 1
      `).bind(CONTROLLED_PARIS_TEST_KEY).first();

      return {
        claimed: Boolean(row && row.run_id === runId),
        run_id: runId,
        row: row || null
      };
    }

    async function finishControlledParisTest(runId, status, usage = null, note = null) {
      await ensureControlledTestTable();

      await env.DB.prepare(`
        UPDATE ai_controlled_tests
        SET
          status = ?,
          finished_at = CURRENT_TIMESTAMP,
          usage_json = ?,
          note = COALESCE(?, note)
        WHERE test_key = ? AND run_id = ?
      `).bind(
        status,
        usage ? JSON.stringify(usage) : null,
        note,
        CONTROLLED_PARIS_TEST_KEY,
        runId
      ).run();
    }

    function isControlledValenciaRequest(place, country, requestToken) {
      return (
        CONTROLLED_VALENCIA_TEST_ENABLED &&
        normalizeKey(place) === "valencia" &&
        normalizeKey(country) === "spain" &&
        requestToken === CONTROLLED_VALENCIA_TEST_TOKEN
      );
    }

    async function claimControlledValenciaTest() {
      await ensureControlledTestTable();

      const runId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT OR IGNORE INTO ai_controlled_tests (
          test_key,
          run_id,
          status,
          started_at,
          note
        )
        VALUES (?, ?, 'started', CURRENT_TIMESTAMP, ?)
      `).bind(
        CONTROLLED_VALENCIA_TEST_KEY,
        runId,
        "Prueba única controlada de Valencia para validar vigencia + cola multimedia automática v31."
      ).run();

      const row = await env.DB.prepare(`
        SELECT test_key, run_id, status, started_at, finished_at
        FROM ai_controlled_tests
        WHERE test_key = ?
        LIMIT 1
      `).bind(CONTROLLED_VALENCIA_TEST_KEY).first();

      return {
        claimed: Boolean(row && row.run_id === runId),
        run_id: runId,
        row: row || null
      };
    }

    async function finishControlledValenciaTest(runId, status, usage = null, note = null) {
      await ensureControlledTestTable();

      await env.DB.prepare(`
        UPDATE ai_controlled_tests
        SET
          status = ?,
          finished_at = CURRENT_TIMESTAMP,
          usage_json = ?,
          note = COALESCE(?, note)
        WHERE test_key = ? AND run_id = ?
      `).bind(
        status,
        usage ? JSON.stringify(usage) : null,
        note,
        CONTROLLED_VALENCIA_TEST_KEY,
        runId
      ).run();
    }

    // La investigación de un destino se conserva y reutiliza indefinidamente.
    // "expires_at" queda como dato histórico, pero NO provoca una reinvestigación
    // automática. Una actualización futura deberá hacerse de forma manual y consciente.
    function cacheIsValid(row) {
      return Boolean(row);
    }

    async function ensureResearchPhaseTable() {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS destination_research_phases (
          place_key TEXT NOT NULL,
          phase_name TEXT NOT NULL,
          response_json TEXT NOT NULL,
          sources_json TEXT,
          usage_json TEXT,
          quality_status TEXT NOT NULL DEFAULT 'generated',
          failure_reason TEXT,
          completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (place_key, phase_name)
        )
      `).run();

      try {
        await env.DB.prepare("ALTER TABLE destination_research_phases ADD COLUMN quality_status TEXT DEFAULT 'generated'").run();
      } catch (e) {}
      try {
        await env.DB.prepare("ALTER TABLE destination_research_phases ADD COLUMN failure_reason TEXT").run();
      } catch (e) {}
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS entity_sources (
          entity_id TEXT NOT NULL, source_url TEXT NOT NULL, source_type TEXT, verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(entity_id, source_url)
        )
      `).run();
    }

    async function loadResearchPhase(placeKey, phaseName) {
      await ensureResearchPhaseTable();
      const row = await env.DB.prepare(`
        SELECT response_json, sources_json, usage_json, quality_status, failure_reason, completed_at
        FROM destination_research_phases
        WHERE place_key = ? AND phase_name = ?
        LIMIT 1
      `).bind(placeKey, phaseName).first();
      if (!row) return null;
      // Una fase ya pagada se conserva incluso si un control de calidad anterior
      // la marcó como quality_failed. Se revalida con el código actual SIN volver
      // a llamar a OpenAI. Solo refresh=1 fuerza una regeneración consciente.
      const parsed = parseStoredJson(row.response_json);
      if (!parsed) return null;
      return {
        parsed,
        sources: parseStoredJson(row.sources_json) || [],
        usage: parseStoredJson(row.usage_json) || null,
        quality_status: row.quality_status || "generated",
        failure_reason: row.failure_reason || null,
        completed_at: row.completed_at
      };
    }

    async function saveResearchPhase(placeKey, phaseName, result, qualityStatus = "generated", failureReason = null) {
      await ensureResearchPhaseTable();
      const sources = getWebSources(result?.payload || {});
      await env.DB.prepare(`
        INSERT INTO destination_research_phases (
          place_key, phase_name, response_json, sources_json, usage_json, quality_status, failure_reason, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(place_key, phase_name) DO UPDATE SET
          response_json = excluded.response_json,
          sources_json = excluded.sources_json,
          usage_json = excluded.usage_json,
          quality_status = excluded.quality_status,
          failure_reason = excluded.failure_reason,
          completed_at = CURRENT_TIMESTAMP
      `).bind(
        placeKey,
        phaseName,
        JSON.stringify(result.parsed),
        JSON.stringify(sources),
        JSON.stringify(result?.payload?.usage || null),
        qualityStatus,
        failureReason
      ).run();
      return { parsed: result.parsed, sources, usage: result?.payload?.usage || null, quality_status: qualityStatus, failure_reason: failureReason };
    }

    async function markResearchPhaseQuality(placeKey, phaseName, qualityStatus, failureReason = null) {
      await ensureResearchPhaseTable();
      await env.DB.prepare(`
        UPDATE destination_research_phases
        SET quality_status = ?, failure_reason = ?, completed_at = CURRENT_TIMESTAMP
        WHERE place_key = ? AND phase_name = ?
      `).bind(qualityStatus, failureReason, placeKey, phaseName).run();
    }

    function stableStringify(value) {
      if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
      }

      if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
      }

      const keys = Object.keys(value).sort();
      return `{${keys.map(key =>
        `${JSON.stringify(key)}:${stableStringify(value[key])}`
      ).join(",")}}`;
    }

    async function sha256Hex(value) {
      const bytes = new TextEncoder().encode(value);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
    }

    async function ensureAiRouteCacheTable() {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS ai_route_cache (
          cache_key TEXT PRIMARY KEY,
          cache_type TEXT NOT NULL,
          request_json TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_ai_route_cache_type
        ON ai_route_cache(cache_type)
      `).run();

      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS ai_route_cache_v3 (
          cache_key TEXT PRIMARY KEY, cache_type TEXT NOT NULL, request_fingerprint TEXT NOT NULL,
          logistics_revision TEXT, research_revision TEXT, plan_revision TEXT, guide_revision TEXT, media_revision TEXT,
          request_json TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      // Migraciones idempotentes: CREATE TABLE IF NOT EXISTS no añade columnas
      // a una tabla D1 creada por una versión anterior.
      for (const migrationSql of [
        "ALTER TABLE ai_route_cache_v3 ADD COLUMN cache_type TEXT",
        "ALTER TABLE ai_route_cache_v3 ADD COLUMN request_json TEXT",
        "ALTER TABLE ai_route_cache_v3 ADD COLUMN response_json TEXT",
        "ALTER TABLE ai_route_cache_v3 ADD COLUMN request_fingerprint TEXT",
        "ALTER TABLE ai_route_cache_v3 ADD COLUMN logistics_revision TEXT",
        "ALTER TABLE ai_route_cache_v3 ADD COLUMN research_revision TEXT",
        "ALTER TABLE ai_route_cache_v3 ADD COLUMN plan_revision TEXT",
        "ALTER TABLE ai_route_cache_v3 ADD COLUMN guide_revision TEXT",
        "ALTER TABLE ai_route_cache_v3 ADD COLUMN media_revision TEXT",
        "ALTER TABLE ai_route_cache_v3 ADD COLUMN created_at TEXT",
        "ALTER TABLE ai_route_cache_v3 ADD COLUMN updated_at TEXT"
      ]) {
        try { await env.DB.prepare(migrationSql).run(); } catch (e) {}
      }
      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_ai_route_cache_v3_type
        ON ai_route_cache_v3(cache_type)
      `).run();

      // Copia de recuperación simple para no perder una respuesta ya pagada si
      // la escritura en la tabla v3 principal falla por esquema/migración.
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS ai_route_recovery_v3 (
          cache_key TEXT PRIMARY KEY,
          cache_type TEXT NOT NULL,
          request_json TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_ai_route_recovery_v3_type
        ON ai_route_recovery_v3(cache_type)
      `).run();

      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS generation_attempts (
          attempt_id TEXT PRIMARY KEY, request_fingerprint TEXT NOT NULL, stage TEXT NOT NULL,
          result TEXT NOT NULL, failure_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_generation_attempts_fingerprint_stage ON generation_attempts(request_fingerprint, stage)`).run();

      // Conserva cualquier salida YA PAGADA que sea rechazada después por validación.
      // No se mezcla con la caché válida: sirve para diagnóstico y para impedir
      // que un mismo resultado defectuoso vuelva a comprarse accidentalmente.
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS ai_generation_rejections_v3 (
          rejection_id TEXT PRIMARY KEY,
          stable_fingerprint TEXT NOT NULL,
          request_fingerprint TEXT NOT NULL,
          pipeline_revision TEXT NOT NULL,
          stage TEXT NOT NULL,
          failure_reason TEXT NOT NULL,
          request_json TEXT NOT NULL,
          response_json TEXT,
          raw_output TEXT,
          usage_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ai_generation_rejections_stable_stage ON ai_generation_rejections_v3(stable_fingerprint, stage, created_at)`).run();
    }

    async function stableGenerationFingerprint(stage,requestObject={}){
      return sha256Hex(`${stage}|${stableStringify(routeCacheIdentity(stage==="planner"?"plan":"guide",requestObject))}`);
    }
    async function generationFingerprint(stage,requestObject={}){
      const stable = await stableGenerationFingerprint(stage, requestObject);
      return sha256Hex(`${GENERATION_PIPELINE_REVISION}|${stable}`);
    }
    async function previousSystematicFailure(fingerprint,stage){
      await ensureAiRouteCacheTable();
      return env.DB.prepare(`SELECT result,failure_reason,created_at FROM generation_attempts WHERE request_fingerprint=? AND stage=? AND result='systematic_failure' ORDER BY created_at DESC LIMIT 1`).bind(fingerprint,stage).first();
    }

    // Compatibilidad de seguridad con generation_attempts creados antes de r3.
    // No modifica ni migra datos antiguos: reconstruye exactamente las huellas
    // que r1/r2 habrían generado a partir de la identidad estable actual.
    const HISTORICAL_GENERATION_PIPELINE_REVISIONS = [
      "2026-09-13-r1",
      "2026-09-13-r2",
      "2026-09-13-r3",
      "2026-09-13-r4",
      "2026-09-13-r5"
    ];

    async function previousHistoricalSystematicFailure(stage,requestObject={}){
      await ensureAiRouteCacheTable();
      const stableFingerprint = await stableGenerationFingerprint(stage, requestObject);
      for(const revision of HISTORICAL_GENERATION_PIPELINE_REVISIONS){
        if(revision===GENERATION_PIPELINE_REVISION) continue;
        const requestFingerprint = await sha256Hex(`${revision}|${stableFingerprint}`);
        const row = await env.DB.prepare(`
          SELECT result,failure_reason,created_at
          FROM generation_attempts
          WHERE request_fingerprint=? AND stage=? AND result='systematic_failure'
          ORDER BY created_at DESC
          LIMIT 1
        `).bind(requestFingerprint,stage).first();
        if(row){
          return {
            ...row,
            pipeline_revision:revision,
            request_fingerprint:requestFingerprint
          };
        }
      }
      return null;
    }
    async function recordGenerationAttempt(fingerprint,stage,result,failureReason=null){
      try {
        await ensureAiRouteCacheTable();
        await env.DB.prepare(`INSERT INTO generation_attempts(attempt_id,request_fingerprint,stage,result,failure_reason,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),fingerprint,stage,result,failureReason).run();
        return true;
      } catch (error) {
        // El registro de auditoría nunca debe destruir un resultado válido ni
        // provocar una segunda llamada pagada.
        console.log("generation_attempts audit write failed", stage, error?.message || error);
        return false;
      }
    }

    async function saveRejectedGeneration(stage, requestObject, requestFingerprint, failureReason, responseObject=null, rawOutput=null, usage=null){
      try {
        await ensureAiRouteCacheTable();
        const stableFingerprint = await stableGenerationFingerprint(stage, requestObject);
        await env.DB.prepare(`
          INSERT INTO ai_generation_rejections_v3 (
            rejection_id, stable_fingerprint, request_fingerprint, pipeline_revision,
            stage, failure_reason, request_json, response_json, raw_output, usage_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          crypto.randomUUID(), stableFingerprint, requestFingerprint, GENERATION_PIPELINE_REVISION,
          stage, String(failureReason||"unknown"), stableStringify(requestObject||{}),
          responseObject == null ? null : JSON.stringify(responseObject),
          rawOutput == null ? null : String(rawOutput),
          usage == null ? null : JSON.stringify(usage)
        ).run();
        return true;
      } catch (error) {
        console.log("ai_generation_rejections_v3 save failed", stage, error?.message || error);
        return false;
      }
    }

    async function rejectedGenerationState(stage, requestObject={}){
      try {
        await ensureAiRouteCacheTable();
        const stableFingerprint = await stableGenerationFingerprint(stage, requestObject);

        const current = await env.DB.prepare(`
          SELECT failure_reason, pipeline_revision, created_at
          FROM ai_generation_rejections_v3
          WHERE stable_fingerprint = ? AND stage = ? AND pipeline_revision = ?
          ORDER BY created_at DESC
          LIMIT 1
        `).bind(stableFingerprint, stage, GENERATION_PIPELINE_REVISION).first();

        const historical = await env.DB.prepare(`
          SELECT failure_reason, pipeline_revision, created_at
          FROM ai_generation_rejections_v3
          WHERE stable_fingerprint = ? AND stage = ? AND pipeline_revision <> ?
          ORDER BY created_at DESC
          LIMIT 1
        `).bind(stableFingerprint, stage, GENERATION_PIPELINE_REVISION).first();

        return { current: current || null, historical: historical || null };
      } catch (error) {
        console.log("ai_generation_rejections_v3 read failed", stage, error?.message || error);
        return { current: null, historical: null };
      }
    }

    function blockedGenerationPayload(stage, failureReason, rejectedRevision=null){
      const reason=String(failureReason||"unknown");
      const common={
        ok:true,
        openai_called:false,
        generation_guard:"generation_retry_blocked",
        stage,
        failure_reason:reason,
        rejected_pipeline_revision:rejectedRevision||null,
        message:"Existe una generación ya pagada que fue rechazada. Se bloquea cualquier recompra automática hasta una revisión consciente.",
        usage:zeroUsage()
      };
      if(reason.startsWith("contract:")){
        return {...common,status:"invalid_route_contract",contract_error:{reason:reason.slice("contract:".length)}};
      }
      if(reason.startsWith("verified_content:")){
        return {...common,status:"invalid_verified_content",content_error:{reason:reason.slice("verified_content:".length)}};
      }
      // El frontend ya trata cost_guard_active de forma segura y detiene el flujo.
      // generation_guard conserva el diagnóstico exacto sin tocar rutas.js.
      return {...common,status:"cost_guard_active"};
    }

    function previousRevisionRejectionPayload(stage, rejection){
      return {
        ok:true,
        status:"cost_guard_active",
        openai_called:false,
        generation_guard:"previous_revision_rejection",
        stage,
        failure_reason:String(rejection?.failure_reason||"unknown"),
        rejected_pipeline_revision:rejection?.pipeline_revision||null,
        current_pipeline_revision:GENERATION_PIPELINE_REVISION,
        retry_authorization_required:true,
        authorization_field:"allow_previous_revision_retry",
        message:"Existe una generación pagada rechazada en una revisión anterior. No se realiza una nueva llamada a OpenAI sin autorización explícita.",
        usage:zeroUsage()
      };
    }

    function previousRevisionFailurePayload(stage, failure){
      return {
        ok:true,
        status:"cost_guard_active",
        openai_called:false,
        generation_guard:"previous_revision_failure",
        stage,
        failure_reason:String(failure?.failure_reason||"unknown"),
        rejected_pipeline_revision:failure?.pipeline_revision||null,
        current_pipeline_revision:GENERATION_PIPELINE_REVISION,
        retry_authorization_required:true,
        authorization_field:"allow_previous_revision_retry",
        message:"Existe un systematic_failure pagado en una revisión anterior. No se realiza una nueva llamada a OpenAI sin autorización explícita.",
        usage:zeroUsage()
      };
    }

    // Identidad estable de una ruta. No incluye datos mutables de investigación
    // ni los puntos de fin de jornada calculados por Geoapify. Así, una ruta ya
    // pagada/guardada sigue siendo la misma aunque se actualice researched_at o
    // cambie ligeramente el reverse-geocoding de una etapa.
    function routeCacheIdentity(cacheType, requestObject = {}) {
      const stops = Array.isArray(requestObject.stops) ? requestObject.stops : [];
      const requestedVia = Array.isArray(requestObject.requested_via)
        ? requestObject.requested_via.map(normalizeKey).filter(Boolean)
        : [];
      const tripDaysRaw = Number(requestObject.trip_days);
      const maxHoursRaw = Number(requestObject.max_driving_hours);

      // La identidad de caché debe usar el mismo nombre canónico que D1.
      // Ejemplo real: Geoapify puede devolver "Grad Zagreb" mientras D1 guarda
      // "zagreb|croatia". destinationKey() ya resolvía esta equivalencia para
      // destination_research, pero la caché de plan/guide seguía comparando el
      // texto bruto y por eso no encontraba una ruta completa ya guardada.
      // En /write-route no llega `country`, así que tomamos el país del stop final.
      const finalStop = stops.length ? stops[stops.length - 1] : null;
      const destinationCountry = requestObject.country || finalStop?.country || "";
      const canonicalDestination = canonicalDestinationName(
        requestObject.destination || finalStop?.place || "",
        destinationCountry
      );

      return {
        schema_version: "route-identity-v2",
        cache_type: cacheType,
        origin: normalizeKey(requestObject.origin || ""),
        destination: canonicalDestination,
        requested_via: requestedVia,
        trip_days: Number.isFinite(tripDaysRaw) && tripDaysRaw > 0
          ? Math.round(tripDaysRaw)
          : (stops.length || null),
        vehicle: normalizeKey(requestObject.vehicle || ""),
        adults: Number.isFinite(Number(requestObject.adults))
          ? Number(requestObject.adults)
          : 0,
        children: Array.isArray(requestObject.children)
          ? requestObject.children.map(Number).filter(Number.isFinite)
          : [],
        pet: Boolean(requestObject.pet),
        start_date: String(requestObject.start_date || "").trim(),
        children_count: Number.isFinite(Number(requestObject.children_count)) ? Number(requestObject.children_count) : 0,
        family_recommendations: Boolean(requestObject.family_recommendations),
        max_driving_hours: Number.isFinite(maxHoursRaw)
          ? maxHoursRaw
          : null,
        minimum_required_days: Number.isFinite(Number(requestObject.minimum_required_days))
          ? Math.max(1, Math.round(Number(requestObject.minimum_required_days)))
          : null,
        pace: normalizeKey(requestObject.pace || ""),
        interests: Array.isArray(requestObject.interests)
          ? requestObject.interests.map(normalizeKey).filter(Boolean).sort()
          : [],
        overnight_types: Array.isArray(requestObject.overnight_types)
          ? requestObject.overnight_types.map(normalizeKey).filter(Boolean).sort()
          : [],
        overnight_preference: normalizeKey(requestObject.overnight_preference || ""),
        avoid_preferences: Array.isArray(requestObject.avoid_preferences)
          ? requestObject.avoid_preferences.map(normalizeKey).filter(Boolean).sort()
          : [],
        budget: normalizeKey(requestObject.budget || ""),
        visual_content: normalizeKey(requestObject.visual_content || ""),
        user_notes: normalizeKey(requestObject.user_notes || ""),
        route_contract_version: normalizeKey(requestObject.route_contract_version || ""),
        request_points: Array.isArray(requestObject.request_points)
          ? requestObject.request_points.map((pt,index)=>({
              request_point_id:String(pt?.request_point_id||""), role:normalizeKey(pt?.role||""), order:Number(pt?.order ?? index),
              lat:Number.isFinite(Number(pt?.lat))?Number(pt.lat):null, lon:Number.isFinite(Number(pt?.lon))?Number(pt.lon):null,
              place:normalizeKey(pt?.place||pt?.name||"")
            }))
          : [],
        stages: (Array.isArray(requestObject.stages) ? requestObject.stages : (Array.isArray(requestObject.stops)?requestObject.stops:[])).map(st=>({
          driving_stage_id:String(st?.driving_stage_id||""), base_id:String(st?.base_id||""), overnight_id:String(st?.overnight_id||""),
          lat:Number.isFinite(Number(st?.lat))?Number(st.lat):null, lon:Number.isFinite(Number(st?.lon))?Number(st.lon):null,
          start_lat:Number.isFinite(Number(st?.start_lat))?Number(st.start_lat):null, start_lon:Number.isFinite(Number(st?.start_lon))?Number(st.start_lon):null,
          request_point_id:st?.request_point_id==null?null:String(st.request_point_id),
          requested_lat:Number.isFinite(Number(st?.requested_lat))?Number(st.requested_lat):null,
          requested_lon:Number.isFinite(Number(st?.requested_lon))?Number(st.requested_lon):null,
          driving_km:Math.round(Number(st?.driving_km)||0), driving_minutes:Math.round(Number(st?.driving_minutes)||0), is_final:Boolean(st?.is_final),
          requested_waypoint:Boolean(st?.requested_waypoint)
        })),
        vacation_days: Array.isArray(requestObject.vacation_days)
          ? requestObject.vacation_days.map(day => ({
              vacation_day_id: String(day?.vacation_day_id || "").trim(),
              logistics_id: String(day?.logistics_id || "").trim(),
              day: Number(day?.day) || 0,
              travel_date: String(day?.travel_date || "").trim(),
              day_type: normalizeKey(day?.day_type || ""),
              place: normalizeKey(day?.place || ""),
              country: normalizeKey(day?.country || ""),
              driving_stage_id: day?.driving_stage_id == null ? null : String(day.driving_stage_id).trim(),
              base_id: String(day?.base_id || "").trim(),
              overnight_id: day?.overnight_id == null ? null : String(day.overnight_id).trim(),
              driving_stage_index: Number(day?.driving_stage_index) || 0,
              base_stop_index: Number(day?.base_stop_index) || 0,
              driving_km: Number(day?.driving_km) || 0,
              driving_minutes: Number(day?.driving_minutes) || 0,
              request_point_id: day?.request_point_id == null ? null : String(day.request_point_id).trim(),
              is_final: Boolean(day?.is_final),
              requested_waypoint: Boolean(day?.requested_waypoint)
            }))
          : []
      };
    }

    function sameJsonValue(a, b) {
      return stableStringify(a) === stableStringify(b);
    }

    function stopSimilarityScore(currentStops = [], storedStops = []) {
      if (!Array.isArray(currentStops) || !Array.isArray(storedStops)) return 0;
      if (!currentStops.length || !storedStops.length) return 0;
      if (currentStops.length !== storedStops.length) return -30;

      let score = 0;
      for (let i = 0; i < currentStops.length; i++) {
        const a = currentStops[i] || {};
        const b = storedStops[i] || {};
        const ap = normalizeKey(a.place || a.name || "");
        const bp = normalizeKey(b.place || b.name || "");
        const ac = normalizeKey(a.country || "");
        const bc = normalizeKey(b.country || "");

        if (ap && bp) {
          if (ap === bp) score += 8;
          else if (ap.includes(bp) || bp.includes(ap)) score += 5;
        }
        if (ac && bc && ac === bc) score += 2;
        if (Boolean(a.is_final) === Boolean(b.is_final)) score += 1;
      }
      return score;
    }

    function normalizeVacationDays(requestObject = {}) {
      return Array.isArray(requestObject.vacation_days)
        ? requestObject.vacation_days.map((day, index) => ({
            vacation_day_id: String(day?.vacation_day_id || "").trim(),
            logistics_id: String(day?.logistics_id || "").trim(),
            day: Number(day?.day) || index + 1,
            travel_date: String(day?.travel_date || "").trim(),
            day_type: normalizeKey(day?.day_type || ""),
            place: normalizeKey(day?.place || ""),
            country: normalizeKey(day?.country || ""),
            driving_stage_id: day?.driving_stage_id == null ? null : String(day.driving_stage_id).trim(),
            base_id: String(day?.base_id || "").trim(),
            overnight_id: day?.overnight_id == null ? null : String(day.overnight_id).trim(),
            driving_stage_index: Number(day?.driving_stage_index) || 0,
            base_stop_index: Number(day?.base_stop_index) || 0,
            driving_km: Math.max(0, Math.round(Number(day?.driving_km) || 0)),
            driving_minutes: Math.max(0, Math.round(Number(day?.driving_minutes) || 0)),
            request_point_id: day?.request_point_id == null ? null : String(day.request_point_id).trim(),
            is_final: Boolean(day?.is_final),
            requested_waypoint: Boolean(day?.requested_waypoint)
          }))
        : [];
    }

    function validateRouteContractV3(requestObject = {}) {
      if (normalizeKey(requestObject.route_contract_version) !== "route-contract-v3") return {ok:false,reason:"contract_version"};
      const points=Array.isArray(requestObject.request_points)?requestObject.request_points:[];
      const stages=Array.isArray(requestObject.stages)?requestObject.stages:[];
      const days=normalizeVacationDays(requestObject);
      if(points.length<2 || points[0]?.role!=="origin" || points[points.length-1]?.role!=="final_destination") return {ok:false,reason:"request_points_order"};
      if(points.slice(1,-1).some(p=>p?.role!=="user_via")) return {ok:false,reason:"request_points_role"};
      if(points.some((p,i)=>!String(p?.request_point_id||"").trim()||!Number.isFinite(Number(p?.lat))||!Number.isFinite(Number(p?.lon))||Number(p?.order)!==i)) return {ok:false,reason:"request_point_identity"};
      if(new Set(points.map(p=>String(p?.request_point_id||""))).size!==points.length) return {ok:false,reason:"request_point_duplicate_id"};
      if(!stages.length || !days.length) return {ok:false,reason:"missing_logistics"};
      const minimumRequiredDays=Math.max(1,Number(requestObject.minimum_required_days)||stages.length);
      if(minimumRequiredDays!==stages.length) return {ok:false,reason:"minimum_required_days",expected:stages.length,actual:minimumRequiredDays};
      if(days.length<minimumRequiredDays) return {ok:false,reason:"insufficient_trip_days",minimum_required_days:minimumRequiredDays,actual:days.length};
      const maxHours=Number(requestObject.max_driving_hours);
      const maxMinutes=Number.isFinite(maxHours)&&maxHours>0?Math.round(maxHours*60):null;
      for(let i=0;i<stages.length;i++){
        const st=stages[i]||{};
        if(!String(st.driving_stage_id||"").trim()||!String(st.base_id||"").trim()||!String(st.overnight_id||"").trim()) return {ok:false,reason:"stage_identity",stage:i+1};
        if(!Number.isFinite(Number(st.lat))||!Number.isFinite(Number(st.lon))) return {ok:false,reason:"stage_coordinates",stage:i+1};
        if(!st.overnight || String(st.overnight.id||"").trim()!==String(st.overnight_id||"").trim()) return {ok:false,reason:"overnight_identity",stage:i+1};
        if(!Number.isFinite(Number(st.overnight.lat))||!Number.isFinite(Number(st.overnight.lon))) return {ok:false,reason:"overnight_coordinates",stage:i+1};
        if(Math.abs(Number(st.lat)-Number(st.overnight.lat))>1e-7||Math.abs(Number(st.lon)-Number(st.overnight.lon))>1e-7) return {ok:false,reason:"stage_not_overnight",stage:i+1};
        if(maxMinutes!=null && Number(st.driving_minutes)>maxMinutes+1) return {ok:false,reason:"stage_exceeds_max",stage:i+1};
      }
      if(stages.slice(0,-1).some(st=>Boolean(st?.is_final)) || !Boolean(stages.at(-1)?.is_final)) return {ok:false,reason:"final_stage_identity"};
      const requestedStages=stages.filter(st=>Boolean(st?.requested_waypoint));
      const requestedPoints=points.slice(1);
      if(requestedStages.length!==requestedPoints.length) return {ok:false,reason:"request_point_stage_count"};
      for(let i=0;i<requestedPoints.length;i++){
        const st=requestedStages[i]||{},pt=requestedPoints[i]||{};
        if(String(st.request_point_id||"")!==String(pt.request_point_id||"")) return {ok:false,reason:"request_point_stage_link",index:i+1};
        if(!Number.isFinite(Number(st.requested_lat))||!Number.isFinite(Number(st.requested_lon))) return {ok:false,reason:"request_point_stage_coordinates",index:i+1};
        if(Math.abs(Number(st.requested_lat)-Number(pt.lat))>1e-7||Math.abs(Number(st.requested_lon)-Number(pt.lon))>1e-7) return {ok:false,reason:"request_point_stage_geometry",index:i+1};
      }
      for(let i=0;i<stages.length;i++){
        const st=stages[i]||{};
        const expectedStart=i===0?points[0]:stages[i-1];
        if(Number.isFinite(Number(st.start_lat))&&Number.isFinite(Number(st.start_lon))){
          const elat=i===0?Number(expectedStart.lat):Number(expectedStart.lat), elon=i===0?Number(expectedStart.lon):Number(expectedStart.lon);
          if(Math.abs(Number(st.start_lat)-elat)>1e-7||Math.abs(Number(st.start_lon)-elon)>1e-7) return {ok:false,reason:"stage_continuity",stage:i+1};
        }
      }
      const driveDays=days.filter(d=>d.day_type==="conduccion_y_visita");
      if(driveDays.length!==stages.length) return {ok:false,reason:"drive_day_count"};
      for(let i=0;i<driveDays.length;i++){
        if(driveDays[i].driving_stage_id!==String(stages[i].driving_stage_id)) return {ok:false,reason:"stage_day_link",stage:i+1};
        if(driveDays[i].base_id!==String(stages[i].base_id)) return {ok:false,reason:"base_day_link",stage:i+1};
        if(driveDays[i].overnight_id!==String(stages[i].overnight_id)) return {ok:false,reason:"overnight_day_link",stage:i+1};
      }
      return {ok:true};
    }

    function validatePlanContract(plan, requestObject = {}) {
      const skeleton = normalizeVacationDays(requestObject);
      if (!skeleton.length || !plan || !Array.isArray(plan.days)) {
        return { ok: false, reason: "missing_route_contract" };
      }
      if (plan.days.length !== skeleton.length) {
        return { ok: false, reason: "day_count", expected: skeleton.length, actual: plan.days.length };
      }
      const maxHours = Number(requestObject.max_driving_hours);
      const maxMinutes = Number.isFinite(maxHours) && maxHours > 0 ? Math.round(maxHours * 60) : null;
      for (let i = 0; i < skeleton.length; i++) {
        const expected = skeleton[i];
        const actual = plan.days[i] || {};
        if (Number(actual.day) !== i + 1) return { ok: false, reason: "day_number", day: i + 1 };
        if (String(actual.logistics_id || "") !== expected.logistics_id) return { ok: false, reason: "logistics_id", day: i + 1 };
        if (String(actual.vacation_day_id || "") !== expected.vacation_day_id) return { ok: false, reason: "vacation_day_id", day: i + 1 };
        if (String(actual.travel_date || "") !== expected.travel_date) return { ok: false, reason: "travel_date", day: i + 1 };
        if ((actual.driving_stage_id == null ? null : String(actual.driving_stage_id)) !== expected.driving_stage_id) return { ok: false, reason: "driving_stage_id", day: i + 1 };
        if (String(actual.base_id || "") !== expected.base_id) return { ok: false, reason: "base_id", day: i + 1 };
        if ((actual.overnight_id == null ? null : String(actual.overnight_id)) !== expected.overnight_id) return { ok: false, reason: "overnight_id", day: i + 1 };
        if (normalizeKey(actual.place) !== expected.place) return { ok: false, reason: "place", day: i + 1 };
        if (normalizeKey(actual.country) !== expected.country) return { ok: false, reason: "country", day: i + 1 };
        if (normalizeKey(actual.day_type) !== expected.day_type) return { ok: false, reason: "day_type", day: i + 1 };
        if (Math.round(Number(actual.driving_km) || 0) !== expected.driving_km) return { ok: false, reason: "driving_km", day: i + 1 };
        if (Math.round(Number(actual.driving_minutes) || 0) !== expected.driving_minutes) return { ok: false, reason: "driving_minutes", day: i + 1 };
        if ((Number(actual.driving_stage_index) || 0) !== expected.driving_stage_index) return { ok: false, reason: "driving_stage_index", day: i + 1 };
        if ((Number(actual.base_stop_index) || 0) !== expected.base_stop_index) return { ok: false, reason: "base_stop_index", day: i + 1 };
        if ((actual.request_point_id == null ? null : String(actual.request_point_id)) !== expected.request_point_id) return { ok:false,reason:"request_point_id",day:i+1 };
        if (Boolean(actual.is_final) !== expected.is_final) return { ok: false, reason: "is_final", day: i + 1 };
        if (maxMinutes != null && expected.driving_minutes > maxMinutes + 1) return { ok: false, reason: "max_driving_minutes", day: i + 1 };
        if (["visita","estancia"].includes(expected.day_type) && (expected.driving_minutes !== 0 || expected.driving_km !== 0)) {
          return { ok: false, reason: "stay_day_has_driving", day: i + 1 };
        }
      }
      return { ok: true };
    }

    function validateGuideContract(guide, requestObject = {}) {
      const skeleton = normalizeVacationDays(requestObject);
      if (!skeleton.length || !guide || !Array.isArray(guide.days)) return { ok: false, reason: "missing_route_contract" };
      if (guide.days.length !== skeleton.length) return { ok: false, reason: "day_count", expected:skeleton.length, actual:guide.days.length };
      if (Number(guide?.trip_summary?.days) !== skeleton.length) return { ok: false, reason: "trip_summary_days" };
      for (let i = 0; i < guide.days.length; i++) {
        const expected=skeleton[i], actual=guide.days[i]||{};
        if (Number(actual.day) !== i + 1) return { ok: false, reason: "day_number", day: i + 1 };
        if (String(actual.vacation_day_id || "") !== expected.vacation_day_id) return { ok:false,reason:"vacation_day_id",day:i+1 };
        if (String(actual.logistics_id || "") !== expected.logistics_id) return { ok:false,reason:"logistics_id",day:i+1 };
        if (String(actual.travel_date || "") !== expected.travel_date) return { ok:false,reason:"travel_date",day:i+1 };
        if (normalizeKey(actual.place) !== expected.place) return { ok:false,reason:"place",day:i+1 };
        if (normalizeKey(actual.country) !== expected.country) return { ok:false,reason:"country",day:i+1 };
        if (normalizeKey(actual.day_type) !== expected.day_type) return { ok:false,reason:"day_type",day:i+1 };
        if ((actual.driving_stage_id == null ? null : String(actual.driving_stage_id)) !== expected.driving_stage_id) return { ok:false,reason:"driving_stage_id",day:i+1 };
        if (String(actual.base_id || "") !== expected.base_id) return { ok:false,reason:"base_id",day:i+1 };
        if ((actual.overnight_id == null ? null : String(actual.overnight_id)) !== expected.overnight_id) return { ok:false,reason:"overnight_id",day:i+1 };
        if (Math.round(Number(actual.driving_km)||0)!==expected.driving_km) return {ok:false,reason:"driving_km",day:i+1};
        if (Math.round(Number(actual.driving_minutes)||0)!==expected.driving_minutes) return {ok:false,reason:"driving_minutes",day:i+1};
        if ((actual.request_point_id == null ? null : String(actual.request_point_id)) !== expected.request_point_id) return {ok:false,reason:"request_point_id",day:i+1};
      }
      return { ok: true };
    }

    function verifiedNamesForResearch(row, allowedOvernightTypes = []) {
      const research = row?.research || row || {};
      return {
        highlights: new Set((research.must_see || []).map(x => normalizeKey(x?.name)).filter(Boolean)),
        restaurants: new Set((research.gastronomy?.restaurants || []).map(x => normalizeKey(x?.name)).filter(Boolean)),
        overnight: new Set(sanitizeOvernightListForTypes(research.overnight || [], allowedOvernightTypes).map(x => normalizeKey(x?.name)).filter(Boolean))
      };
    }

    function findResearchForPlace(rows = [], place = "", country = "") {
      const p = normalizeKey(place), c = normalizeKey(country);
      return (Array.isArray(rows) ? rows : []).find(row =>
        normalizeKey(row?.place) === p && (!c || !normalizeKey(row?.country) || normalizeKey(row?.country) === c)
      ) || null;
    }

    function validatePlanVerifiedSelections(plan, researchRows = [], allowedOvernightTypes = []) {
      if (!plan || !Array.isArray(plan.days)) return { ok: false, reason: "missing_plan" };
      for (const day of plan.days) {
        const row = findResearchForPlace(researchRows, day?.place, day?.country);
        if (!row) return { ok: false, reason: "missing_research_for_day", day: day?.day, place: day?.place };
        const research = row?.research || row || {};
        const allowed = verifiedNamesForResearch(research, allowedOvernightTypes);
        const verifiedEntities = [
          ...(Array.isArray(research.must_see) ? research.must_see : []),
          ...(Array.isArray(research.gastronomy?.restaurants) ? research.gastronomy.restaurants : []),
          ...(Array.isArray(research.overnight) ? research.overnight : [])
        ];
        const allowedIds = new Set(verifiedEntities.map(x => String(x?.entity_id || "")).filter(Boolean));
        const selectedIds = new Set((Array.isArray(day?.selected_entity_ids) ? day.selected_entity_ids : []).map(String));
        for (const id of selectedIds) {
          if (!allowedIds.has(id)) return { ok:false, reason:"unverified_entity_id", day:day?.day, entity_id:id };
        }
        const allowedHighlightById = new Map(
          (Array.isArray(research.must_see) ? research.must_see : [])
            .map(item => [String(item?.entity_id || ""), normalizeKey(item?.name)])
            .filter(([id, name]) => id && name)
        );
        for (const item of (Array.isArray(day?.selected_highlights) ? day.selected_highlights : [])) {
          const entityId = String(item?.entity_id || "");
          const expectedName = allowedHighlightById.get(entityId);
          if (!expectedName) return { ok:false, reason:"unverified_highlight_entity_id", day:day?.day, entity_id:entityId };
          if (!selectedIds.has(entityId)) return { ok:false, reason:"highlight_entity_not_selected", day:day?.day, entity_id:entityId };
          if (normalizeKey(item?.name) !== expectedName) return { ok:false, reason:"highlight_entity_name_mismatch", day:day?.day, entity_id:entityId, name:item?.name };
          if (!allowed.highlights.has(normalizeKey(item?.name))) return { ok: false, reason: "unverified_highlight", day: day?.day, name: item?.name };
        }
        for (const name of (Array.isArray(day?.restaurant_choices) ? day.restaurant_choices : [])) {
          if (!allowed.restaurants.has(normalizeKey(name))) return { ok: false, reason: "unverified_restaurant", day: day?.day, name };
        }
        for (const name of (Array.isArray(day?.overnight_choices) ? day.overnight_choices : [])) {
          if (!allowed.overnight.has(normalizeKey(name))) return { ok: false, reason: "unverified_overnight", day: day?.day, name };
        }
      }
      return { ok: true };
    }

    function validateGuideVerifiedSelections(guide, plan, researchRows = [], allowedOvernightTypes = []) {
      if (!guide || !Array.isArray(guide.days) || !plan || !Array.isArray(plan.days)) return { ok: false, reason: "missing_guide_or_plan" };
      for (let i = 0; i < guide.days.length; i++) {
        const gday = guide.days[i] || {}, pday = plan.days[i] || {};
        const row = findResearchForPlace(researchRows, pday.place, pday.country);
        if (!row) return { ok: false, reason: "missing_research_for_day", day: i + 1, place: pday.place };
        const allowed = verifiedNamesForResearch(row, allowedOvernightTypes);
        const planIds=new Set(Array.isArray(pday?.selected_entity_ids)?pday.selected_entity_ids.map(String):[]);
        const guideEntities=[...(Array.isArray(gday.highlights)?gday.highlights:[]),...(Array.isArray(gday.restaurants)?gday.restaurants:[]),...(Array.isArray(gday.overnight)?gday.overnight:[])];
        for(const entity of guideEntities){ if(!planIds.has(String(entity?.entity_id||""))) return {ok:false,reason:"guide_entity_not_in_plan",day:i+1,entity_id:entity?.entity_id||null}; }
        for (const item of (Array.isArray(gday.highlights) ? gday.highlights : [])) {
          if (!allowed.highlights.has(normalizeKey(item?.name))) return { ok: false, reason: "unverified_highlight", day: i + 1, name: item?.name };
        }
        for (const item of (Array.isArray(gday.restaurants) ? gday.restaurants : [])) {
          if (!allowed.restaurants.has(normalizeKey(item?.name))) return { ok: false, reason: "unverified_restaurant", day: i + 1, name: item?.name };
        }
        for (const item of (Array.isArray(gday.overnight) ? gday.overnight : [])) {
          if (!allowed.overnight.has(normalizeKey(item?.name))) return { ok: false, reason: "unverified_overnight", day: i + 1, name: item?.name };
        }
      }
      return { ok: true };
    }

    function legacyRouteCandidateScore(cacheType, currentRequest, storedRequest) {
      if (!storedRequest || typeof storedRequest !== "object") return -Infinity;

      const current = routeCacheIdentity(cacheType, currentRequest);
      const stored = routeCacheIdentity(cacheType, storedRequest);

      const currentContract = normalizeKey(currentRequest?.route_contract_version);
      if (currentContract === "route-contract-v2" || currentContract === "route-contract-v3") {
        if (normalizeKey(storedRequest?.route_contract_version) !== currentContract) return -Infinity;
        if (!sameJsonValue(current.vacation_days, stored.vacation_days)) return -Infinity;
        if (currentContract === "route-contract-v3" && !sameJsonValue(current.stages, stored.stages)) return -Infinity;
      }

      if (!current.origin || !current.destination) return -Infinity;
      if (current.origin !== stored.origin || current.destination !== stored.destination) {
        return -Infinity;
      }

      let score = 100;
      const exactFields = ["vehicle", "adults", "children", "children_count", "family_recommendations", "pet", "start_date", "pace", "interests", "overnight_types", "overnight_preference", "avoid_preferences", "budget", "visual_content", "user_notes"];
      for (const field of exactFields) {
        if (sameJsonValue(current[field], stored[field])) score += 8;
        else score -= 18;
      }

      if (cacheType === "plan") {
        if (current.max_driving_hours === stored.max_driving_hours) score += 12;
        else if (current.max_driving_hours != null && stored.max_driving_hours != null) score -= 20;
      }

      if (current.trip_days && stored.trip_days) {
        if (current.trip_days === stored.trip_days) score += 20;
        else score -= 40;
      }

      // Si la petición moderna incluye destinos intermedios elegidos por el usuario,
      // deben coincidir. Las entradas antiguas no tenían este campo, por lo que en
      // ellas usamos además la semejanza de stops solo para escoger el mejor legado.
      if (current.requested_via.length || stored.requested_via.length) {
        if (sameJsonValue(current.requested_via, stored.requested_via)) score += 25;
        else return -Infinity;
      }

      score += stopSimilarityScore(currentRequest.stops, storedRequest.stops);
      return score;
    }

    async function getAiRouteCache(cacheType, requestObject) {
      await ensureAiRouteCacheTable();

      const requestJson = stableStringify(requestObject);
      const identity = routeCacheIdentity(cacheType, requestObject);
      const contractVersion = normalizeKey(requestObject?.route_contract_version);
      const isV3 = contractVersion === "route-contract-v3";
      const stableVersion = isV3 ? "stable-v3" : "stable-v2";
      const stableKey = await sha256Hex(`${cacheType}|${stableVersion}|${stableStringify(identity)}`);

      // V3 está físicamente aislado de la caché histórica. Nunca escanea ni crea
      // alias desde ai_route_cache, de modo que una entrada v2 no puede satisfacer
      // un contrato v3 aunque comparta origen/destino o un perfil parecido.
      if (isV3) {
        const row = await env.DB.prepare(`
          SELECT cache_key, cache_type, request_json, response_json, created_at, updated_at,
                 request_fingerprint, logistics_revision, research_revision,
                 plan_revision, guide_revision, media_revision
          FROM ai_route_cache_v3
          WHERE cache_key = ? AND cache_type = ?
          LIMIT 1
        `).bind(stableKey, cacheType).first();

        let recoveryHit = false;
        if (!row) {
          const recoveryRow = await env.DB.prepare(`
            SELECT cache_key, cache_type, request_json, response_json, created_at, updated_at
            FROM ai_route_recovery_v3
            WHERE cache_key = ? AND cache_type = ?
            LIMIT 1
          `).bind(stableKey, cacheType).first();

          if (recoveryRow) {
            row = {
              ...recoveryRow,
              request_fingerprint: null,
              logistics_revision: null,
              research_revision: null,
              plan_revision: null,
              guide_revision: null,
              media_revision: null
            };
            recoveryHit = true;
          }
        }

        if (!row) {
          return {
            found: false,
            cache_key: stableKey,
            request_json: requestJson,
            response: null,
            resolved_stops: null
          };
        }

        const storedRequest = parseStoredJson(row.request_json) || {};
        const response = parseStoredJson(row.response_json);
        const valid = cacheType === "plan"
          ? validatePlanContract(response?.plan, requestObject)
          : validateGuideContract(response?.guide, requestObject);
        if (!valid.ok) {
          return {
            found: false,
            cache_key: stableKey,
            request_json: requestJson,
            response: null,
            resolved_stops: null,
            rejected_cache_reason: valid.reason || "route_contract_invalid"
          };
        }

        return {
          found: true,
          cache_key: stableKey,
          source_cache_key: row.cache_key,
          request_json: requestJson,
          response,
          resolved_stops: Array.isArray(storedRequest.stages)
            ? storedRequest.stages
            : (Array.isArray(storedRequest.stops) ? storedRequest.stops : null),
          created_at: row.created_at,
          updated_at: row.updated_at,
          recovered_from_fallback: recoveryHit,
          revisions: {
            logistics: row.logistics_revision || null,
            research: row.research_revision || null,
            plan: row.plan_revision || null,
            guide: row.guide_revision || null,
            media: row.media_revision || null
          }
        };
      }

      // Compatibilidad histórica exclusiva de v2/legado.
      const legacyExactKey = await sha256Hex(`${cacheType}|${requestJson}`);
      let row = await env.DB.prepare(`
        SELECT cache_key, cache_type, request_json, response_json, created_at, updated_at
        FROM ai_route_cache
        WHERE cache_key = ? AND cache_type = ?
        LIMIT 1
      `).bind(stableKey, cacheType).first();

      if (!row) {
        row = await env.DB.prepare(`
          SELECT cache_key, cache_type, request_json, response_json, created_at, updated_at
          FROM ai_route_cache
          WHERE cache_key = ? AND cache_type = ?
          LIMIT 1
        `).bind(legacyExactKey, cacheType).first();
      }

      if (!row) {
        const candidates = await env.DB.prepare(`
          SELECT cache_key, cache_type, request_json, response_json, created_at, updated_at
          FROM ai_route_cache
          WHERE cache_type = ?
          ORDER BY updated_at DESC
          LIMIT 200
        `).bind(cacheType).all();

        let best = null;
        let bestScore = -Infinity;
        for (const candidate of (candidates.results || [])) {
          const storedRequest = parseStoredJson(candidate.request_json);
          const score = legacyRouteCandidateScore(cacheType, requestObject, storedRequest);
          if (score > bestScore) {
            bestScore = score;
            best = { ...candidate, storedRequest };
          }
        }
        if (best && bestScore >= 135) row = best;
      }

      if (!row) {
        return {
          found: false,
          cache_key: stableKey,
          request_json: requestJson,
          response: null,
          resolved_stops: null
        };
      }

      const storedRequest = row.storedRequest || parseStoredJson(row.request_json) || {};
      const resolvedStops = Array.isArray(storedRequest.stops) ? storedRequest.stops : null;
      const response = parseStoredJson(row.response_json);

      if (contractVersion === "route-contract-v2") {
        const valid = cacheType === "plan"
          ? validatePlanContract(response?.plan, requestObject)
          : validateGuideContract(response?.guide, requestObject);
        if (!valid.ok) {
          return {
            found: false,
            cache_key: stableKey,
            request_json: requestJson,
            response: null,
            resolved_stops: null,
            rejected_cache_reason: valid.reason || "route_contract_invalid"
          };
        }
      }

      if (row.cache_key !== stableKey && response) {
        await saveAiRouteCache(cacheType, stableKey, requestJson, response);
      }

      return {
        found: true,
        cache_key: stableKey,
        source_cache_key: row.cache_key,
        request_json: requestJson,
        response,
        resolved_stops: resolvedStops,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }


    // v41: una guía terminada es un "bundle" coherente: conserva la guía y el
    // plan exacto que se utilizó para redactarla dentro de request_json.plan.
    // Para una ruta ya completada, este bundle tiene prioridad sobre un plan
    // independiente guardado más tarde. Así nunca se mezcla un plan de una
    // generación con la guía de otra.
    function completedGuideProfileMatches(currentRequest, storedRequest) {
      const current = routeCacheIdentity("guide", currentRequest || {});
      const stored = routeCacheIdentity("guide", storedRequest || {});

      if (!current.origin || !current.destination) return false;
      if (current.origin !== stored.origin || current.destination !== stored.destination) return false;
      const currentContract = normalizeKey(currentRequest?.route_contract_version);
      if (currentContract === "route-contract-v2" || currentContract === "route-contract-v3") {
        if (normalizeKey(storedRequest?.route_contract_version) !== currentContract) return false;
        if (!sameJsonValue(current.vacation_days, stored.vacation_days)) return false;
        if (currentContract === "route-contract-v3") {
          if (!sameJsonValue(current.request_points, stored.request_points)) return false;
          if (!sameJsonValue(current.stages, stored.stages)) return false;
        }
      }

      // Días y destinos intermedios elegidos por el usuario forman parte de la
      // identidad logística de la ruta.
      if (current.trip_days && stored.trip_days && current.trip_days !== stored.trip_days) return false;
      if ((current.requested_via?.length || 0) || (stored.requested_via?.length || 0)) {
        if (!sameJsonValue(current.requested_via || [], stored.requested_via || [])) return false;
      }

      // La guía es personalizada: no se reutiliza entre perfiles distintos.
      const exactFields = ["vehicle", "adults", "children", "children_count", "family_recommendations", "pet", "start_date", "pace", "interests", "overnight_types", "overnight_preference", "avoid_preferences", "budget", "visual_content", "user_notes"];
      for (const field of exactFields) {
        if (!sameJsonValue(current[field], stored[field])) return false;
      }

      // Desde v41 también se conserva el máximo diario en /write-route. Para
      // guías antiguas que no lo guardaban, null actúa como compatibilidad legado.
      if (current.max_driving_hours != null && stored.max_driving_hours != null &&
          current.max_driving_hours !== stored.max_driving_hours) return false;

      return true;
    }

    async function getCompletedGuideBundle(requestObject = {}) {
      await ensureAiRouteCacheTable();
      const contractVersion = normalizeKey(requestObject?.route_contract_version);
      const isV3 = contractVersion === "route-contract-v3";
      const table = isV3 ? "ai_route_cache_v3" : "ai_route_cache";

      const rows = await env.DB.prepare(`
        SELECT cache_key, request_json, response_json, created_at, updated_at
        FROM ${table}
        WHERE cache_type = 'guide'
        ORDER BY updated_at DESC
        LIMIT 500
      `).all();

      let guideRows = rows.results || [];
      if (isV3) {
        const recoveryRows = await env.DB.prepare(`
          SELECT cache_key, request_json, response_json, created_at, updated_at
          FROM ai_route_recovery_v3
          WHERE cache_type = 'guide'
          ORDER BY updated_at DESC
          LIMIT 500
        `).all();
        const seen = new Set(guideRows.map(row => row.cache_key));
        guideRows = [
          ...guideRows,
          ...(recoveryRows.results || []).filter(row => !seen.has(row.cache_key))
        ];
      }

      for (const row of guideRows) {
        const storedRequest = parseStoredJson(row.request_json) || {};
        const response = parseStoredJson(row.response_json);
        const embeddedPlan = storedRequest?.plan && typeof storedRequest.plan === "object"
          ? storedRequest.plan
          : null;
        const storedStops = Array.isArray(storedRequest?.stages)
        ? storedRequest.stages
        : (Array.isArray(storedRequest?.stops) ? storedRequest.stops : null);

        if (!response?.guide || !embeddedPlan || !Array.isArray(embeddedPlan.days)) continue;
        if (!completedGuideProfileMatches(requestObject, storedRequest)) continue;
        if (!validatePlanContract(embeddedPlan, requestObject).ok) continue;
        if (!validateGuideContract(response.guide, requestObject).ok) continue;

        return {
          found: true,
          cache_key: row.cache_key,
          request: storedRequest,
          response,
          plan: embeddedPlan,
          resolved_stops: storedStops,
          created_at: row.created_at,
          updated_at: row.updated_at
        };
      }

      return { found: false };
    }


    async function saveAiRouteCache(cacheType, cacheKey, requestJson, responseObject) {
      await ensureAiRouteCacheTable();
      const requestObject = parseStoredJson(requestJson) || {};
      const contractVersion = normalizeKey(requestObject?.route_contract_version);

      if (contractVersion === "route-contract-v3") {
        const identity = routeCacheIdentity(cacheType, requestObject);
        const requestFingerprint = await sha256Hex(`request-v3|${stableStringify(identity)}`);
        const logisticsRevision = await sha256Hex(`logistics|${stableStringify({
          route_contract_version: requestObject.route_contract_version || "",
          request_points: requestObject.request_points || [],
          stages: requestObject.stages || requestObject.stops || [],
          vacation_days: requestObject.vacation_days || []
        })}`);
        const researchRevision = requestObject.research_signature
          ? await sha256Hex(`research|${stableStringify(requestObject.research_signature)}`)
          : null;
        const planRevision = responseObject?.plan
          ? await sha256Hex(`plan|${stableStringify(responseObject.plan)}`)
          : (requestObject.plan ? await sha256Hex(`plan|${stableStringify(requestObject.plan)}`) : null);
        const guideRevision = responseObject?.guide
          ? await sha256Hex(`guide|${stableStringify(responseObject.guide)}`)
          : null;
        const mediaRevision = await sha256Hex(`media|${stableStringify({
          visual_content: requestObject.visual_content || "",
          media_signature: requestObject.media_signature || null
        })}`);

        // Guardamos una copia mínima de recuperación y, de forma independiente,
        // la tabla v3 principal. Una de las dos puede salvar un resultado ya pagado.
        let recoverySaved = false;
        let recoveryError = null;
        try {
          await env.DB.prepare(`
            INSERT INTO ai_route_recovery_v3 (
              cache_key, cache_type, request_json, response_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(cache_key) DO UPDATE SET
              cache_type = excluded.cache_type,
              request_json = excluded.request_json,
              response_json = excluded.response_json,
              updated_at = CURRENT_TIMESTAMP
          `).bind(
            cacheKey, cacheType, requestJson, JSON.stringify(responseObject)
          ).run();
          recoverySaved = true;
        } catch (error) {
          recoveryError = error?.message || String(error);
          console.log("ai_route_recovery_v3 save failed", recoveryError);
        }

        try {
          await env.DB.prepare(`
            INSERT INTO ai_route_cache_v3 (
              cache_key, cache_type, request_fingerprint,
              logistics_revision, research_revision, plan_revision, guide_revision, media_revision,
              request_json, response_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(cache_key) DO UPDATE SET
              cache_type = excluded.cache_type,
              request_fingerprint = excluded.request_fingerprint,
              logistics_revision = excluded.logistics_revision,
              research_revision = excluded.research_revision,
              plan_revision = excluded.plan_revision,
              guide_revision = excluded.guide_revision,
              media_revision = excluded.media_revision,
              request_json = excluded.request_json,
              response_json = excluded.response_json,
              updated_at = CURRENT_TIMESTAMP
          `).bind(
            cacheKey, cacheType, requestFingerprint,
            logisticsRevision, researchRevision, planRevision, guideRevision, mediaRevision,
            requestJson, JSON.stringify(responseObject)
          ).run();
          return {
            primary_saved: true,
            recovery_saved: recoverySaved,
            recovery_error: recoveryError
          };
        } catch (primaryError) {
          const primaryMessage = primaryError?.message || String(primaryError);
          console.log("ai_route_cache_v3 primary save failed", primaryMessage);
          if (recoverySaved) {
            return {
              primary_saved: false,
              recovery_saved: true,
              error: primaryMessage
            };
          }
          // Si fallan ambas escrituras no ocultamos el problema: así el caller
          // conserva la respuesta en memoria y devuelve un error claro sin reintentar.
          const error = new Error(`D1_CACHE_SAVE_FAILED: ${primaryMessage}; recovery=${recoveryError || "unknown"}`);
          error.code = "D1_CACHE_SAVE_FAILED";
          throw error;
        }

      }

      await env.DB.prepare(`
        INSERT INTO ai_route_cache (
          cache_key,
          cache_type,
          request_json,
          response_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(cache_key) DO UPDATE SET
          cache_type = excluded.cache_type,
          request_json = excluded.request_json,
          response_json = excluded.response_json,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        cacheKey,
        cacheType,
        requestJson,
        JSON.stringify(responseObject)
      ).run();
    }


    function zeroUsage() {
      return {
        openai_called: false,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
      };
    }

    // COLA MULTIMEDIA v23: registra en D1 lo que falta por completar.
    // No llama a OpenAI. Sirve para que un destino investigado quede
    // preparado automáticamente para el futuro enriquecimiento multimedia.
    async function ensureDestinationMediaJobsTable() {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS destination_media_jobs (
          job_key TEXT PRIMARY KEY,
          place_key TEXT NOT NULL,
          place_name TEXT NOT NULL,
          country_name TEXT NOT NULL,
          entity_id TEXT,
          entity_name TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          website TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_destination_media_jobs_place_status
        ON destination_media_jobs(place_key, status)
      `).run();
      try { await env.DB.prepare("ALTER TABLE destination_media_jobs ADD COLUMN entity_id TEXT").run(); } catch(e) {}
    }

    // v30: D1 primero, pero SOLO se reutiliza multimedia cerrada por IA o aprobación manual.
    // Una imagen encontrada por scraper/asset-scan NO se considera definitiva aunque tenga verified_exact=1.
    // Así evitamos repetir el caso Camping Aigen: existir en la web oficial no garantiza que represente bien el lugar.
    function isTrustedDestinationPhoto(media) {
      if (!media?.image_url || Number(media?.verified_exact) !== 1) return false;
      const method = String(media?.source_method || "").trim().toLowerCase();
      const aiOrManualVerified = [
        'openai-web-search-premium-photo',
        'openai-vision-verified-official-photo',
        'manual-approved-photo'
      ].includes(method);
      if (!aiOrManualVerified) return false;
      const haystack = normalizeKey(`${media.image_url || ""} ${media.source_page_url || ""}`);
      if (/unsplash|pexels|pixabay|shutterstock|istock|gettyimages|adobestock|adobe stock|stockphoto|stock photo/.test(haystack)) return false;
      return true;
    }

    async function syncDestinationMediaJobs(place, country, research) {
      await ensureDestinationMediaTable();
      await ensureDestinationMediaJobsTable();
      const placeKey = destinationKey(place, country);
      const entities = [
        ...(Array.isArray(research?.gastronomy?.restaurants) ? research.gastronomy.restaurants : [])
          .map(x => ({ entity_id:x.entity_id||'', name: x.name, type: 'restaurant', website: x.official_url || x.website || '' })),
        ...(sanitizeOvernightList(research?.overnight))
          .map(x => ({ entity_id:x.entity_id||'', name: x.name, type: 'overnight', website: x.official_url || x.website || '' }))
      ].filter(x => x.name && x.website);

      const mediaRows = await env.DB.prepare(`
        SELECT media_key, entity_id, entity_name, entity_type, image_url, verified_exact, source_method
        FROM destination_media WHERE place_key = ?
      `).bind(placeKey).all();
      const mediaMap = new Map();
      for(const x of (mediaRows.results||[])){
        if(String(x?.entity_id||"").trim())mediaMap.set(`id|${String(x.entity_id).trim()}`,x);
        mediaMap.set(`name|${normalizeKey(x.entity_type)}|${normalizeKey(x.entity_name)}`,x);
      }

      let pending = 0, resolved = 0;
      for (const entity of entities) {
        const media = mediaMap.get(`id|${String(entity.entity_id||"").trim()}`)
          || mediaMap.get(`name|${normalizeKey(entity.type)}|${normalizeKey(entity.name)}`);
        if(media?.media_key && entity.entity_id && !String(media.entity_id||"").trim()){
          await env.DB.prepare(`UPDATE destination_media SET entity_id=? WHERE media_key=? AND (entity_id IS NULL OR entity_id='')`)
            .bind(entity.entity_id,media.media_key).run();
          media.entity_id=entity.entity_id;
          mediaMap.set(`id|${entity.entity_id}`,media);
        }
        const hasPhoto = isTrustedDestinationPhoto(media);
        const noSuitable = ['openai-no-suitable-photo-v3','openai-no-suitable-photo','rejected-non-photo'].includes(String(media?.source_method || ''));
        const jobKey = await sha256Hex(`${placeKey}|${entity.entity_id||`${normalizeKey(entity.type)}|${normalizeKey(entity.name)}`}`);
        const existingJob = await env.DB.prepare(`
          SELECT status FROM destination_media_jobs WHERE job_key = ? LIMIT 1
        `).bind(jobKey).first();
        // v30: flujo Premium definitivo.
        // D1 verificado por IA/manual => resolved. No-photo confirmado por IA => resolved.
        // Cualquier otro caso (sin foto, asset-scan, scraper o candidato visual antiguo) => pending_ai.
        // Si una IA ya está ejecutándose, preservamos ai_running para evitar duplicados.
        const status = (hasPhoto || noSuitable)
          ? 'resolved'
          : (existingJob?.status === 'ai_running' ? 'ai_running' : 'pending_ai');
        if (status === 'resolved') resolved++; else pending++;
        await env.DB.prepare(`
          INSERT INTO destination_media_jobs (
            job_key, place_key, place_name, country_name, entity_id, entity_name, entity_type, website, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(job_key) DO UPDATE SET
            website = excluded.website,
            status = excluded.status,
            updated_at = CURRENT_TIMESTAMP
        `).bind(jobKey, placeKey, place, country, entity.entity_id||null, entity.name, entity.type, entity.website, status).run();
      }
      return { place_key: placeKey, entities_total: entities.length, pending, resolved };
    }

    // Comprobar que el backend funciona
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        ok: true,
        service: "RUTAS Campings & Areas IA",
        database: "connected"
      }), { headers });
    }

    // Comprobar conexión con D1 y estructura de destination_research
    if (url.pathname === "/db-test") {
      const tables = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      ).all();

      const destinationResearch = await env.DB.prepare(
        "PRAGMA table_info(destination_research)"
      ).all();

      return new Response(JSON.stringify({
        ok: true,
        tables: tables.results,
        destination_research_columns: destinationResearch.results
      }), { headers });
    }

    // Comprobar conexión con OpenAI.
    // Con la protección de costes activa, este endpoint NO hace ninguna llamada.
    if (url.pathname === "/openai-test") {
      if (!openAiScopeEnabled("test")) {
        return new Response(JSON.stringify({
          ok: true,
          status: "cost_guard_active",
          openai_called: false,
          message: "Protección de costes activa: no se ha llamado a OpenAI."
        }), { headers });
      }

      try {
        const openaiResponse = await openAiTestFetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-5.6-luna",
              input:
                "Responde únicamente con esta frase exacta: Conexion OpenAI correcta"
            })
          }
        );

        const data = await openaiResponse.json();

        if (!openaiResponse.ok) {
          return new Response(JSON.stringify({
            ok: false,
            status: openaiResponse.status,
            error: data
          }), {
            status: openaiResponse.status,
            headers
          });
        }

        return new Response(JSON.stringify({
          ok: true,
          model: data.model,
          response: getOutputText(data),
          usage: data.usage || null
        }), { headers });

      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          error: error.message
        }), {
          status: 500,
          headers
        });
      }
    }


    // ============================================================
    // MEDIA OFICIAL v1 - ENRIQUECIMIENTO SIN OPENAI
    // Obtiene una imagen representativa desde la web oficial ya
    // verificada en la investigación D1. No usa OpenAI ni habilita gasto.
    // ============================================================

    function mediaCacheKey(website, name, type) {
      return [
        normalizeKey(type),
        normalizeKey(name),
        normalizeKey(website)
      ].join("|");
    }

    function safeOfficialUrl(value) {
      try {
        const u = new URL(String(value || "").trim());
        if (u.protocol !== "https:" && u.protocol !== "http:") return null;
        const host = u.hostname.toLowerCase();
        if (
          host === "localhost" ||
          host.endsWith(".local") ||
          host === "0.0.0.0" ||
          host === "::1" ||
          /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
        ) return null;
        return u;
      } catch {
        return null;
      }
    }

    function decodeHtmlAttr(value) {
      return String(value || "")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .trim();
    }

    function extractAttr(tag, attrName) {
      const re = new RegExp(
        `${attrName}\\\\s*=\\\\s*(?:"([^"]*)"|'([^']*)'|([^\\\\s>]+))`,
        "i"
      );
      const m = String(tag || "").match(re);
      return decodeHtmlAttr(m ? (m[1] ?? m[2] ?? m[3] ?? "") : "");
    }

    function normalizeCandidateImage(raw, baseUrl) {
      const value = decodeHtmlAttr(raw);
      if (!value || value.startsWith("data:")) return null;
      try {
        const u = new URL(value, baseUrl);
        if (u.protocol !== "https:" && u.protocol !== "http:") return null;
        const text = u.toString().toLowerCase();
        if (/(logo|favicon|icon|sprite|avatar|placeholder|tracking|pixel|transparent|blank|spacer|loader|loading)[^/]*\.(svg|png|gif|webp|jpe?g|avif)?(?:\?|$)/.test(text)) {
          return null;
        }
        return u.toString();
      } catch {
        return null;
      }
    }

    function mediaTypeBonus(text, type) {
      const t = normalizeKey(text);
      let score = 0;
      if (type === "restaurant") {
        if (/restaurant|dining|salle|salon|interior|terrace|terrasse|cuisine|dish|plat|chef/.test(t)) score += 18;
        if (/book|kiosk|poster|logo|menu pdf|archive|histor/.test(t)) score -= 35;
      } else if (type === "overnight") {
        if (/camp|camping|campsite|caravan|motorhome|pitch|emplacement|pool|piscine|aerial|vue aerienne|mobilhome|mobile home/.test(t)) score += 20;
        if (/tunnel|underpass|passage|road|street|sign|logo|map/.test(t)) score -= 45;
      } else if (type === "visit") {
        if (/museum|monastery|monaster|kloster|church|kirche|lake|see|trail|wander|route|tour|cave|hohle|höhle|historic|heritage|landmark|view|panoram/.test(t)) score += 18;
        if (/logo|icon|map|plan|ticket|poster|banner/.test(t)) score -= 35;
      }
      return score;
    }

    function extractOfficialImage(html, pageUrl, name, type) {
      const candidates = [];
      const seen = new Set();

      function add(raw, source, context = "") {
        const imageUrl = normalizeCandidateImage(raw, pageUrl);
        if (!imageUrl || seen.has(imageUrl)) return;
        seen.add(imageUrl);
        let score = 0;
        if (source === "og:image") score += 80;
        else if (source === "twitter:image") score += 65;
        else if (source === "image_src") score += 55;
        else if (source === "jsonld") score += 50;
        else if (source === "img") score += 20;

        const combined = `${imageUrl} ${context}`;
        const normalized = normalizeKey(combined);
        const nameTokens = normalizeKey(name).split(" ").filter(x => x.length > 2);
        const matches = nameTokens.filter(t => normalized.includes(t)).length;
        score += Math.min(20, matches * 5);
        score += mediaTypeBonus(combined, type);

        if (/(logo|favicon|icon|sprite|avatar|placeholder|tracking|pixel)/i.test(combined)) score -= 100;
        candidates.push({ image_url: imageUrl, source, score });
      }

      for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const property = (extractAttr(tag, "property") || extractAttr(tag, "name")).toLowerCase();
        const content = extractAttr(tag, "content");
        if (!content) continue;
        if (property === "og:image" || property === "og:image:url" || property === "og:image:secure_url") {
          add(content, "og:image", tag);
        } else if (property === "twitter:image" || property === "twitter:image:src") {
          add(content, "twitter:image", tag);
        }
      }

      for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
        const rel = extractAttr(tag, "rel").toLowerCase();
        if (rel === "image_src" || rel.includes("image_src")) {
          add(extractAttr(tag, "href"), "image_src", tag);
        }
      }

      for (const script of html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || []) {
        const body = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
        const urls = [];
        const re = /"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/gi;
        let m;
        while ((m = re.exec(body)) !== null) urls.push(m[1] || m[2]);
        urls.slice(0, 8).forEach(u => add(u, "jsonld", body.slice(0, 500)));
      }

      for (const tag of (html.match(/<img\b[^>]*>/gi) || []).slice(0, 150)) {
        const src = extractAttr(tag, "src") || extractAttr(tag, "data-src") || extractAttr(tag, "data-lazy-src");
        const alt = extractAttr(tag, "alt");
        const title = extractAttr(tag, "title");
        if (!src) continue;
        const context = `${alt} ${title} ${tag}`;
        const normalizedContext = normalizeKey(context);
        const nameTokens = normalizeKey(name).split(" ").filter(x => x.length > 2);
        const matches = nameTokens.filter(t => normalizedContext.includes(t)).length;
        const typeRelevant =
          type === "restaurant"
            ? /restaurant|salle|salon|terrace|terrasse|cuisine|plat|dish|dining/.test(normalizedContext)
            : type === "visit"
              ? /museum|museo|monument|palace|palacio|castle|castillo|church|iglesia|cathedral|catedral|bridge|puente|monastery|monasterio|garden|jardin|park|parque|cave|cueva|historic|heritage|landmark|view|mirador|panoram|trail|ruta|sendero|archaeolog|arqueolog|bath|bano|baño/.test(normalizedContext)
              : /camp|camping|emplacement|pitch|caravan|motorhome|piscine|pool|aerial|vue aerienne|mobilhome/.test(normalizedContext);
        if (matches > 0 || typeRelevant) add(src, "img", context);
      }

      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0] || null;
      if (!best || best.score < 35) return null;
      return best;
    }

    async function ensureOfficialMediaTable() {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS official_media_cache (
          cache_key TEXT PRIMARY KEY,
          website_url TEXT NOT NULL,
          entity_name TEXT,
          entity_type TEXT,
          image_url TEXT,
          source_page_url TEXT,
          source_method TEXT,
          fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    }

    if (
      url.pathname === "/official-media" &&
      request.method === "GET"
    ) {
      try {
        const website = (url.searchParams.get("website") || "").trim();
        const name = (url.searchParams.get("name") || "").trim();
        const type = (url.searchParams.get("type") || "").trim().toLowerCase();

        if (!website || !name || !["restaurant", "overnight", "visit"].includes(type)) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Se requieren website, name y type=restaurant|overnight|visit",
            openai_called: false
          }), { status: 400, headers });
        }

        const official = safeOfficialUrl(website);
        if (!official) {
          return new Response(JSON.stringify({
            ok: false,
            error: "URL oficial no válida",
            openai_called: false
          }), { status: 400, headers });
        }

        await ensureOfficialMediaTable();
        const cacheKey = mediaCacheKey(official.toString(), name, type);

        const cached = await env.DB.prepare(`
          SELECT *
          FROM official_media_cache
          WHERE cache_key = ?
            AND fetched_at >= datetime('now', '-30 days')
          LIMIT 1
        `).bind(cacheKey).first();

        if (cached) {
          return new Response(JSON.stringify({
            ok: true,
            source: "D1-official-media-cache",
            cached: true,
            openai_called: false,
            name,
            type,
            image_url: cached.image_url || null,
            source_page_url: cached.source_page_url || website,
            source_method: cached.source_method || null
          }), { headers });
        }

        const response = await fetch(official.toString(), {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent": "CampingsYAreasBot/1.0 (+https://campings-y-areas.github.io)",
            "Accept": "text/html,application/xhtml+xml"
          }
        });

        if (!response.ok) {
          return new Response(JSON.stringify({
            ok: false,
            source: "official-website",
            openai_called: false,
            status: response.status,
            error: "La web oficial no permitió obtener su página"
          }), { status: 502, headers });
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
          return new Response(JSON.stringify({
            ok: false,
            openai_called: false,
            error: "La URL oficial no devolvió HTML"
          }), { status: 422, headers });
        }

        const html = await response.text();
        const finalPage = response.url || official.toString();
        const best = extractOfficialImage(html.slice(0, 1800000), finalPage, name, type);

        await env.DB.prepare(`
          INSERT INTO official_media_cache (
            cache_key, website_url, entity_name, entity_type,
            image_url, source_page_url, source_method, fetched_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(cache_key) DO UPDATE SET
            website_url = excluded.website_url,
            entity_name = excluded.entity_name,
            entity_type = excluded.entity_type,
            image_url = excluded.image_url,
            source_page_url = excluded.source_page_url,
            source_method = excluded.source_method,
            fetched_at = CURRENT_TIMESTAMP
        `).bind(
          cacheKey,
          official.toString(),
          name,
          type,
          best?.image_url || null,
          finalPage,
          best?.source || null
        ).run();

        return new Response(JSON.stringify({
          ok: true,
          source: "official-website",
          cached: false,
          openai_called: false,
          name,
          type,
          image_url: best?.image_url || null,
          source_page_url: finalPage,
          source_method: best?.source || null,
          message: best
            ? "Imagen representativa obtenida desde la web oficial."
            : "No se encontró una imagen oficial suficientemente clara en los metadatos de la página."
        }), { headers });

      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          openai_called: false,
          error: error.message
        }), { status: 500, headers });
      }
    }


    // ============================================================
    // ENRIQUECIMIENTO MULTIMEDIA D1 v8 · CACHE DE ÉXITO/FALLO + ESTADO PARA FLUJO AUTOMÁTICO
    // Lee la investigación ya guardada, visita las webs oficiales
    // de restaurantes y pernoctas, selecciona candidatos visuales
    // y los guarda en una caché multimedia separada.
    // ============================================================

    function sameOriginUrl(value, originUrl) {
      try {
        const u = new URL(value, originUrl);
        const o = new URL(originUrl);
        if (u.origin !== o.origin) return null;
        if (u.protocol !== "https:" && u.protocol !== "http:") return null;
        u.hash = "";
        return u.toString();
      } catch {
        return null;
      }
    }

    function mediaWords(type) {
      if (type === "restaurant") {
        return [
          "restaurant","restaurants","gastronomie","gastronomy","dining","menu",
          "cuisine","salon","salle","terrace","terrasse","gallery","galerie",
          "photos","images","experience","maison","about"
        ];
      }
      return [
        "camping","campsite","campground","pitch","pitches","emplacement",
        "emplacements","caravan","motorhome","rv","mobilhome","mobile-home",
        "accommodation","hebergement","hébergement","gallery","galerie",
        "photos","images","services","facilities","pool","piscine","site"
      ];
    }

    function extractInternalMediaLinks(html, pageUrl, type) {
      const words = mediaWords(type);
      const found = new Map();

      for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        const tag = `<a ${match[1] || ""}>`;
        const href = extractAttr(tag, "href");
        if (!href) continue;

        const absolute = sameOriginUrl(href, pageUrl);
        if (!absolute) continue;

        const visibleText = String(match[2] || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        const haystack = normalizeKey(`${href} ${tag} ${visibleText}`);
        let score = 0;

        for (const word of words) {
          if (haystack.includes(normalizeKey(word))) score += 7;
        }

        if (/photo|photos|gallery|galerie|restaurant|cuisine|menu|chef|salle|salon|terrasse|terrace|camping|pitch|pitches|emplacement|emplacements|mobilhome|mobile home|accommodation|hebergement|services|facilities|pool|piscine/.test(haystack)) {
          score += 12;
        }

        if (/privacy|cookie|terms|legal|contact|login|account|booking|reserve|reservation|cart|checkout|gift|shop|press|jobs|career/.test(haystack)) {
          score -= 22;
        }

        if (score > 0) {
          const prev = found.get(absolute);
          if (!prev || score > prev.score) found.set(absolute, { url: absolute, score });
        }
      }

      return Array.from(found.values())
        .sort((a,b)=>b.score-a.score)
        .slice(0,8);
    }

    function extractAllImageCandidates(html, pageUrl, name, type, pageBoost = 0) {
      const candidates = [];
      const seen = new Set();

      function add(raw, source, context = "", boost = 0) {
        const imageUrl = normalizeCandidateImage(raw, pageUrl);
        if (!imageUrl || seen.has(imageUrl)) return;
        seen.add(imageUrl);

        let score = pageBoost + boost;
        if (source === "og:image") score += 90;
        else if (source === "twitter:image") score += 72;
        else if (source === "image_src") score += 65;
        else if (source === "jsonld") score += 58;
        else if (source === "picture") score += 35;
        else if (source === "img") score += 28;
        else if (source === "background") score += 22;

        const combined = `${imageUrl} ${context}`;
        const normalized = normalizeKey(combined);
        const nameTokens = normalizeKey(name).split(" ").filter(x => x.length > 2);
        const matches = nameTokens.filter(t => normalized.includes(t)).length;
        score += Math.min(25, matches * 6);
        score += mediaTypeBonus(combined, type);

        if (/hero|banner|cover|slider|carousel|gallery|galerie|featured|main/.test(normalized)) score += 18;
        if (/thumb|thumbnail|small|logo|favicon|icon|sprite|avatar|placeholder|tracking|pixel|map|plan/.test(normalized)) score -= 90;
        if (type === "overnight" && /tunnel|underpass|passage|road|street|sign|entrance|gate|barrier/.test(normalized)) score -= 120;
        if (type === "restaurant" && /book|kiosk|newsstand|poster|archive|historic photo|old photograph|postcard/.test(normalized)) score -= 100;

        candidates.push({
          image_url: imageUrl,
          source_page_url: pageUrl,
          source_method: source,
          score
        });
      }

      for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const property = (extractAttr(tag, "property") || extractAttr(tag, "name")).toLowerCase();
        const content = extractAttr(tag, "content");
        if (!content) continue;
        if (property === "og:image" || property === "og:image:url" || property === "og:image:secure_url") {
          add(content, "og:image", tag);
        } else if (property === "twitter:image" || property === "twitter:image:src") {
          add(content, "twitter:image", tag);
        }
      }

      for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
        const rel = extractAttr(tag, "rel").toLowerCase();
        if (rel.includes("image_src")) add(extractAttr(tag, "href"), "image_src", tag);
      }

      function addSrcset(srcset, context, baseBoost = 0) {
        if (!srcset) return;
        const choices = String(srcset)
          .split(",")
          .map(x => {
            const parts = x.trim().split(/\s+/);
            const url = parts[0] || "";
            const descriptor = parts[1] || "";
            let weight = 0;
            const wm = descriptor.match(/^(\d+)w$/i);
            if (wm) weight = Number(wm[1]) || 0;
            return { url, weight };
          })
          .filter(x => x.url);

        choices
          .sort((a,b)=>b.weight-a.weight)
          .slice(0,3)
          .forEach((x,idx)=>{
            let boost = baseBoost;
            if (x.weight >= 1400) boost += 28;
            else if (x.weight >= 1000) boost += 22;
            else if (x.weight >= 700) boost += 14;
            else if (x.weight && x.weight < 350) boost -= 25;
            if (idx === 0) boost += 4;
            add(x.url, "picture", context, boost);
          });
      }

      for (const tag of (html.match(/<img\b[^>]*>/gi) || []).slice(0,320)) {
        const alt = extractAttr(tag, "alt");
        const title = extractAttr(tag, "title");
        const width = Number(extractAttr(tag, "width") || 0);
        const height = Number(extractAttr(tag, "height") || 0);
        const context = `${alt} ${title} ${tag}`;

        let boost = 0;
        if (width >= 1200 || height >= 800) boost += 26;
        else if (width >= 900 || height >= 600) boost += 20;
        else if (width >= 600 || height >= 400) boost += 10;
        if (width && height && (width < 250 || height < 180)) boost -= 40;

        const directSources = [
          extractAttr(tag, "data-src"),
          extractAttr(tag, "data-lazy-src"),
          extractAttr(tag, "data-original"),
          extractAttr(tag, "data-image"),
          extractAttr(tag, "data-bg"),
          extractAttr(tag, "src")
        ].filter(Boolean);

        for (const src of directSources) {
          if (!String(src).startsWith("data:")) add(src, "img", context, boost);
        }

        const srcsets = [
          extractAttr(tag, "data-srcset"),
          extractAttr(tag, "data-lazy-srcset"),
          extractAttr(tag, "srcset")
        ].filter(Boolean);

        for (const srcset of srcsets) addSrcset(srcset, context, boost + 8);
      }

      for (const tag of (html.match(/<source\b[^>]*>/gi) || []).slice(0,160)) {
        const context = tag;
        for (const srcset of [
          extractAttr(tag, "data-srcset"),
          extractAttr(tag, "data-lazy-srcset"),
          extractAttr(tag, "srcset")
        ].filter(Boolean)) {
          addSrcset(srcset, context, 10);
        }
      }

      const bgRegex = /(?:background-image|background)\s*:\s*[^;]*url\((['"]?)([^'")]+)\1\)/gi;
      let bm;
      let bgCount = 0;
      while ((bm = bgRegex.exec(html)) !== null && bgCount < 80) {
        bgCount++;
        add(bm[2], "background", bm[0], 5);
      }

      candidates.sort((a,b)=>b.score-a.score);
      return candidates;
    }

    async function fetchHtmlPage(pageUrl) {
      const response = await fetch(pageUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "CampingsYAreasBot/1.0 (+https://campings-y-areas.github.io)",
          "Accept": "text/html,application/xhtml+xml"
        }
      });

      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;
      const html = await response.text();
      return {
        html: html.slice(0, 1800000),
        page_url: response.url || pageUrl
      };
    }


    function extractScriptAndStyleAssetUrls(html, pageUrl) {
      const urls = [];
      const seen = new Set();

      function add(raw) {
        if (!raw) return;
        try {
          const u = new URL(decodeHtmlAttr(raw), pageUrl);
          if (u.protocol !== "https:" && u.protocol !== "http:") return;
          const s = u.toString();
          if (seen.has(s)) return;
          seen.add(s);
          urls.push(s);
        } catch {}
      }

      for (const tag of html.match(/<script\b[^>]*src=["'][^"']+["'][^>]*>/gi) || []) {
        add(extractAttr(tag, "src"));
      }
      for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
        const rel = extractAttr(tag, "rel").toLowerCase();
        if (rel.includes("stylesheet")) add(extractAttr(tag, "href"));
      }
      return urls.slice(0, 10);
    }

    function extractLooseImageUrls(text, baseUrl, name, type, sourcePage, boost = 0) {
      const candidates = [];
      const seen = new Set();
      const patterns = [
        /https?:\/\/[^"'\\\s)]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'\\\s)]*)?/gi,
        /(?:https?:)?\/\/[^"'\\\s)]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'\\\s)]*)?/gi,
        /["']([^"']+\.(?:jpe?g|png|webp|avif)(?:\?[^"']*)?)["']/gi
      ];

      function add(raw, context = "") {
        let imageUrl;
        try {
          imageUrl = new URL(raw, baseUrl).toString();
        } catch {
          return;
        }
        if (seen.has(imageUrl)) return;
        seen.add(imageUrl);

        const combined = `${imageUrl} ${context}`;
        const normalized = normalizeKey(combined);
        let score = boost + 26 + mediaTypeBonus(combined, type);

        const nameTokens = normalizeKey(name).split(" ").filter(x => x.length > 2);
        const matches = nameTokens.filter(t => normalized.includes(t)).length;
        score += Math.min(30, matches * 6);

        if (/hero|banner|cover|gallery|galerie|slider|carousel|restaurant|dining|camping|campsite|pitch|emplacement|pool|piscine|aerial|mobilhome|mobile-home/.test(normalized)) score += 18;
        if (/logo|icon|favicon|sprite|avatar|placeholder|tracking|pixel|map|plan|thumbnail|thumb/.test(normalized)) score -= 100;
        if (type === "overnight" && /tunnel|underpass|passage|road|street|sign|entrance|gate|barrier/.test(normalized)) score -= 120;
        if (type === "restaurant" && /book|kiosk|newsstand|poster|archive|historic|postcard/.test(normalized)) score -= 100;

        candidates.push({
          image_url: imageUrl,
          source_page_url: sourcePage,
          source_method: "asset-scan",
          score
        });
      }

      for (const re of patterns) {
        let mm;
        let count = 0;
        while ((mm = re.exec(text)) !== null && count < 250) {
          count++;
          add(mm[1] || mm[0], mm[0]);
        }
      }

      for (const sm of text.matchAll(/(?:data-srcset|data-lazy-srcset|srcset)\s*=\s*["']([^"']+)["']/gi)) {
        const parts = String(sm[1] || "")
          .split(",")
          .map(x=>x.trim().split(/\s+/)[0])
          .filter(Boolean);
        parts.slice(-3).forEach(u=>add(u, sm[0]));
      }

      return candidates;
    }

    async function fetchTextAsset(assetUrl) {
      try {
        const r = await fetch(assetUrl, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent": "CampingsYAreasBot/1.0 (+https://campings-y-areas.github.io)",
            "Accept": "*/*"
          }
        });
        if (!r.ok) return null;
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (
          !ct.includes("javascript") &&
          !ct.includes("css") &&
          !ct.includes("json") &&
          !ct.includes("text/")
        ) return null;
        const body = await r.text();
        return { body: body.slice(0, 1500000), url: r.url || assetUrl };
      } catch {
        return null;
      }
    }

    async function discoverSitemapMediaLinks(website, type) {
      const official = safeOfficialUrl(website);
      if (!official) return [];

      const candidates = [
        new URL("/sitemap.xml", official).toString(),
        new URL("/sitemap_index.xml", official).toString()
      ];

      const words = mediaWords(type).map(normalizeKey);
      const found = new Map();

      async function inspectSitemap(urlValue, depth = 0) {
        if (depth > 1) return;
        try {
          const r = await fetch(urlValue, {
            method: "GET",
            redirect: "follow",
            headers: {
              "User-Agent": "CampingsYAreasBot/1.0 (+https://campings-y-areas.github.io)",
              "Accept": "application/xml,text/xml,text/plain,*/*"
            }
          });
          if (!r.ok) return;

          const body = (await r.text()).slice(0, 2000000);
          const locs = Array.from(body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi))
            .map(x => decodeHtmlAttr(x[1]))
            .filter(Boolean);

          for (const loc of locs.slice(0,500)) {
            let u;
            try { u = new URL(loc); } catch { continue; }
            if (u.origin !== official.origin) continue;

            if (/sitemap.*\.xml(?:\?|$)/i.test(u.pathname + u.search)) {
              await inspectSitemap(u.toString(), depth + 1);
              continue;
            }

            const haystack = normalizeKey(u.pathname + " " + u.search);
            let score = 0;
            for (const word of words) {
              if (haystack.includes(word)) score += 7;
            }

            if (type === "restaurant" && /restaurant|menu|cuisine|chef|table|gastronom|experience|maison|food|eat/.test(haystack)) score += 12;
            if (type === "overnight" && /camp|pitch|emplacement|caravan|motorhome|mobilhome|accommodation|hebergement|services|facilities|pool|piscine/.test(haystack)) score += 12;

            if (/privacy|cookie|legal|contact|booking|reservation|checkout|account|login|shop|press|jobs|career/.test(haystack)) score -= 20;

            if (score > 0) {
              const prev = found.get(u.toString());
              if (!prev || score > prev.score) found.set(u.toString(), { url: u.toString(), score });
            }
          }
        } catch {}
      }

      for (const s of candidates) await inspectSitemap(s, 0);

      return Array.from(found.values())
        .sort((a,b)=>b.score-a.score)
        .slice(0,8);
    }

    async function discoverOfficialMediaDeep(website, name, type) {
      const official = safeOfficialUrl(website);
      if (!official) return null;

      const first = await fetchHtmlPage(official.toString());
      if (!first) return null;

      let candidates = extractAllImageCandidates(first.html, first.page_url, name, type, 12);
      candidates = candidates.concat(
        extractLooseImageUrls(first.html, first.page_url, name, type, first.page_url, 18)
      );

      const internalLinks = extractInternalMediaLinks(first.html, first.page_url, type);
      const sitemapLinks = await discoverSitemapMediaLinks(first.page_url, type);

      const mergedPages = new Map();
      for (const item of [...internalLinks, ...sitemapLinks]) {
        const prev = mergedPages.get(item.url);
        if (!prev || item.score > prev.score) mergedPages.set(item.url, item);
      }

      const pages = Array.from(mergedPages.values())
        .sort((a,b)=>b.score-a.score)
        .slice(0,7);

      for (const link of pages) {
        try {
          const page = await fetchHtmlPage(link.url);
          if (!page) continue;

          const pageBoost = Math.min(35, Number(link.score) || 0);

          candidates = candidates.concat(
            extractAllImageCandidates(page.html, page.page_url, name, type, pageBoost)
          );
          candidates = candidates.concat(
            extractLooseImageUrls(page.html, page.page_url, name, type, page.page_url, pageBoost + 10)
          );

          const pageAssets = extractScriptAndStyleAssetUrls(page.html, page.page_url);
          for (const assetUrl of pageAssets.slice(0,4)) {
            const asset = await fetchTextAsset(assetUrl);
            if (!asset) continue;
            candidates = candidates.concat(
              extractLooseImageUrls(asset.body, asset.url, name, type, page.page_url, pageBoost + 5)
            );
          }
        } catch {}
      }

      const assetUrls = extractScriptAndStyleAssetUrls(first.html, first.page_url);
      for (const assetUrl of assetUrls.slice(0,8)) {
        const asset = await fetchTextAsset(assetUrl);
        if (!asset) continue;
        candidates = candidates.concat(
          extractLooseImageUrls(asset.body, asset.url, name, type, first.page_url, 10)
        );
      }

      const unique = new Map();
      for (const item of candidates) {
        const low = String(item.image_url || "").toLowerCase();

        if (/transparent|blank|spacer|loader|loading|placeholder|pixel|favicon|logo|sprite/.test(low)) {
          continue;
        }
        // v27: no aceptar bancos de imágenes ni fotografías genéricas de stock.
        // Ejemplo real detectado: Camping Aigen servía un asset de Unsplash que no identificaba el camping.
        if (/unsplash|pexels|pixabay|shutterstock|istock|gettyimages|adobestock|stockphoto/.test(low)) {
          continue;
        }

        const prev = unique.get(item.image_url);
        if (!prev || item.score > prev.score) unique.set(item.image_url, item);
      }

      const ordered = Array.from(unique.values()).sort((a,b)=>b.score-a.score);
      const threshold = type === "restaurant" ? 52 : 58;
      return ordered.find(x => x.score >= threshold) || null;
    }

    async function ensureDestinationMediaTable() {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS destination_media (
          media_key TEXT PRIMARY KEY,
          place_key TEXT NOT NULL,
          entity_id TEXT,
          entity_name TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          website_url TEXT,
          image_url TEXT,
          source_page_url TEXT,
          source_method TEXT,
          score REAL,
          verified_exact INTEGER NOT NULL DEFAULT 0,
          fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_destination_media_place
        ON destination_media(place_key)
      `).run();
      try { await env.DB.prepare("ALTER TABLE destination_media ADD COLUMN entity_id TEXT").run(); } catch(e) {}
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_destination_media_entity ON destination_media(entity_id)`).run();
    }

    function destinationMediaKey(placeKey, entityId, entityType, entityName) {
      const id=String(entityId||"").trim();
      return id ? `${placeKey}|entity|${id}` : [placeKey,normalizeKey(entityType),normalizeKey(entityName)].join("|");
    }



    // ============================================================
    // PRUEBA CONTROLADA IA MULTIMEDIA - PARÍS
    // Una sola ejecución. No reactiva el gasto general.
    // Usa la investigación D1 existente y solo completa entidades
    // que todavía no tienen una imagen multimedia válida guardada.
    // ============================================================

    async function ensureAiMediaTestTable() {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS ai_media_tests (
          test_key TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          finished_at TEXT,
          result_json TEXT
        )
      `).run();
    }

    if (
      url.pathname === "/ai-media-enrich-paris" &&
      request.method === "GET"
    ) {
      try {
        const testToken = (url.searchParams.get("test_token") || "").trim();

        if (!CONTROLLED_AI_MEDIA_TEST_TOKEN || testToken !== CONTROLLED_AI_MEDIA_TEST_TOKEN) {
          return new Response(JSON.stringify({
            ok: false,
            status: "cost_guard_active",
            openai_called: false,
            error: "test_token no válido"
          }), { status: 403, headers });
        }

        await ensureAiMediaTestTable();
        await ensureDestinationMediaTable();

        const existingTest = await env.DB.prepare(`
          SELECT *
          FROM ai_media_tests
          WHERE test_key = ?
          LIMIT 1
        `).bind(CONTROLLED_AI_MEDIA_TEST_KEY).first();

        if (existingTest) {
          return new Response(JSON.stringify({
            ok: true,
            status: existingTest.status,
            openai_called: false,
            reused_test_record: true,
            test_key: CONTROLLED_AI_MEDIA_TEST_KEY,
            started_at: existingTest.started_at,
            finished_at: existingTest.finished_at || null,
            result: parseStoredJson(existingTest.result_json) || null,
            message: "La prueba controlada ya fue utilizada. No se hará otra llamada a OpenAI."
          }), { headers });
        }

        const claim = await env.DB.prepare(`
          INSERT OR IGNORE INTO ai_media_tests (
            test_key, status, started_at
          )
          VALUES (?, 'running', CURRENT_TIMESTAMP)
        `).bind(CONTROLLED_AI_MEDIA_TEST_KEY).run();

        if (!claim?.meta?.changes) {
          return new Response(JSON.stringify({
            ok: false,
            status: "already_claimed",
            openai_called: false,
            message: "La prueba ya fue reclamada por otra ejecución."
          }), { status: 409, headers });
        }

        const placeKey = destinationKey("Paris", "France");
        const row = await env.DB.prepare(`
          SELECT research_json
          FROM destination_research
          WHERE place_key = ?
          LIMIT 1
        `).bind(placeKey).first();

        if (!row) {
          const result = {
            ok: false,
            error: "París no existe en destination_research"
          };
          await env.DB.prepare(`
            UPDATE ai_media_tests
            SET status = 'failed',
                finished_at = CURRENT_TIMESTAMP,
                result_json = ?
            WHERE test_key = ?
          `).bind(JSON.stringify(result), CONTROLLED_AI_MEDIA_TEST_KEY).run();

          return new Response(JSON.stringify({
            ...result,
            openai_called: false
          }), { status: 404, headers });
        }

        const research = parseStoredJson(row.research_json) || {};
        const restaurants = Array.isArray(research?.gastronomy?.restaurants)
          ? research.gastronomy.restaurants
          : [];
        const overnight = sanitizeOvernightList(research?.overnight);

        const entities = [
          ...restaurants.map(x => ({
            name: x.name,
            type: "restaurant",
            website: x.website,
            address: x.address || "",
            zone: x.zone || ""
          })),
          ...overnight.map(x => ({
            name: x.name,
            type: "overnight",
            website: x.website,
            address: x.address || "",
            zone: ""
          }))
        ].filter(x => x.name && x.website);

        const mediaRows = await env.DB.prepare(`
          SELECT entity_name, entity_type, image_url, verified_exact
          FROM destination_media
          WHERE place_key = ?
        `).bind(placeKey).all();

        const haveMedia = new Set(
          (mediaRows.results || [])
            .filter(x => x.image_url && Number(x.verified_exact) === 1)
            .map(x => `${normalizeKey(x.entity_type)}|${normalizeKey(x.entity_name)}`)
        );

        const missing = entities.filter(x =>
          !haveMedia.has(`${normalizeKey(x.type)}|${normalizeKey(x.name)}`)
        );

        if (!missing.length) {
          const result = {
            ok: true,
            status: "nothing_missing",
            missing_count: 0,
            saved_count: 0
          };

          await env.DB.prepare(`
            UPDATE ai_media_tests
            SET status = 'completed',
                finished_at = CURRENT_TIMESTAMP,
                result_json = ?
            WHERE test_key = ?
          `).bind(JSON.stringify(result), CONTROLLED_AI_MEDIA_TEST_KEY).run();

          return new Response(JSON.stringify({
            ...result,
            openai_called: false
          }), { headers });
        }

        const prompt = `
Eres el INVESTIGADOR MULTIMEDIA de "Rutas con Campings & Áreas IA".

OBJETIVO:
Completar SOLO las fotografías faltantes de establecimientos ya investigados en París.
No vuelvas a investigar turismo general. No añadas nuevos establecimientos.

ENTIDADES:
${JSON.stringify(missing, null, 2)}

REGLAS ESTRICTAS:
- Usa búsqueda web.
- Prioriza SIEMPRE la web oficial del establecimiento.
- Para cada entidad encuentra UNA fotografía REAL, representativa y atractiva del establecimiento exacto.
- Restaurante: prioriza fachada actual, sala, terraza o plato claramente asociado al restaurante.
- Camping/pernocta: prioriza vista general, vista aérea, parcelas, caravanas/autocaravanas, piscina o instalaciones atractivas.
- SOLO acepta FOTOGRAFÍAS REALES. RECHAZA cualquier dibujo, ilustración, render, gráfico, clipart, pictograma o composición principalmente gráfica, aunque esté en la web oficial.
- RECHAZA también: logos, iconos, mapas, carteles, túneles, pasos inferiores, barreras, carreteras, capturas de pantalla, libros, postales, imágenes históricas no representativas, transparentes, placeholders y miniaturas.
- Restaurante: prioriza en este orden: plato real terminado, interior/sala, terraza, fachada. Evita ingredientes sueltos si existe una alternativa mejor.
- Camping/pernocta: prioriza en este orden: vista general/aérea del recinto, parcelas con caravanas/autocaravanas, instalaciones, piscina.
- Antes de devolver image_url confirma visualmente que el recurso es una fotografía real y que representa exactamente la entidad.
- No inventes URLs.
- Si no puedes verificar una URL DIRECTA de imagen, devuelve image_url="" y conserva source_page_url con la página oficial donde se ve la foto.
- source_page_url debe ser la página donde se muestra o documenta esa imagen.
- La foto debe corresponder exactamente al establecimiento indicado.
- Devuelve solo JSON válido.

IMPORTANTE:
Esto es una prueba de calidad multimedia. Es mejor devolver una entidad sin image_url que una foto equivocada.
`;

        const aiResponse = await openAiMediaFetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-5.6-terra",
              reasoning: { effort: "low" },
              tools: [{
                type: "web_search",
                search_context_size: "medium"
              }],
              input: prompt,
              max_output_tokens: 3000,
              text: {
                format: {
                  type: "json_schema",
                  name: "media_enrichment",
                  strict: true,
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      results: {
                        type: "array",
                        maxItems: 9,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            name: { type: "string" },
                            type: {
                              type: "string",
                              enum: ["restaurant", "overnight"]
                            },
                            image_url: { type: "string" },
                            source_page_url: { type: "string" },
                            why_this_image: { type: "string" },
                            visual_subject: { type: "string" },
                            visual_kind: {
                              type: "string",
                              enum: ["real_photo", "not_acceptable"]
                            }
                          },
                          required: [
                            "name",
                            "type",
                            "image_url",
                            "source_page_url",
                            "why_this_image",
                            "visual_subject",
                            "visual_kind"
                          ]
                        }
                      }
                    },
                    required: ["results"]
                  }
                }
              }
            })
          }
        );

        const aiData = await aiResponse.json();

        if (!aiResponse.ok) {
          const result = {
            ok: false,
            status: "openai_error",
            error: aiData,
            usage: aiData?.usage || null
          };

          await env.DB.prepare(`
            UPDATE ai_media_tests
            SET status = 'failed',
                finished_at = CURRENT_TIMESTAMP,
                result_json = ?
            WHERE test_key = ?
          `).bind(JSON.stringify(result), CONTROLLED_AI_MEDIA_TEST_KEY).run();

          return new Response(JSON.stringify({
            ...result,
            openai_called: true
          }), { status: aiResponse.status, headers });
        }

        const outputText = getOutputText(aiData);
        let parsed = null;
        try {
          parsed = outputText ? JSON.parse(outputText) : null;
        } catch {}

        if (!parsed || !Array.isArray(parsed.results)) {
          const result = {
            ok: false,
            status: "invalid_json",
            raw_output: outputText,
            usage: aiData?.usage || null
          };

          await env.DB.prepare(`
            UPDATE ai_media_tests
            SET status = 'failed',
                finished_at = CURRENT_TIMESTAMP,
                result_json = ?
            WHERE test_key = ?
          `).bind(JSON.stringify(result), CONTROLLED_AI_MEDIA_TEST_KEY).run();

          return new Response(JSON.stringify({
            ...result,
            openai_called: true
          }), { status: 502, headers });
        }

        const missingMap = new Map(
          missing.map(x => [
            `${normalizeKey(x.type)}|${normalizeKey(x.name)}`,
            x
          ])
        );

        const saved = [];
        const skipped = [];

        for (const item of parsed.results) {
          const key = `${normalizeKey(item.type)}|${normalizeKey(item.name)}`;
          const entity = missingMap.get(key);

          if (!entity) {
            skipped.push({
              name: item.name,
              type: item.type,
              reason: "Entidad no solicitada"
            });
            continue;
          }

          const sourceOfficial = safeOfficialUrl(entity.website);
          const sourcePage = safeOfficialUrl(item.source_page_url);
          const image = safeOfficialUrl(item.image_url);

          if (!sourceOfficial || !sourcePage) {
            skipped.push({
              name: entity.name,
              type: entity.type,
              reason: "source_page_url inválida"
            });
            continue;
          }

          const sameOfficialHost =
            sourcePage.hostname === sourceOfficial.hostname ||
            sourcePage.hostname.endsWith(`.${sourceOfficial.hostname}`) ||
            sourceOfficial.hostname.endsWith(`.${sourcePage.hostname}`);

          if (!sameOfficialHost) {
            skipped.push({
              name: entity.name,
              type: entity.type,
              reason: "La fuente no pertenece a la web oficial"
            });
            continue;
          }

          if (item.visual_kind !== "real_photo") {
            skipped.push({
              name: entity.name,
              type: entity.type,
              reason: "La imagen fue descartada porque no es una fotografía real válida",
              source_page_url: item.source_page_url
            });
            continue;
          }

          if (!image) {
            skipped.push({
              name: entity.name,
              type: entity.type,
              reason: "La IA encontró la página oficial, pero no una URL directa de imagen verificable",
              source_page_url: item.source_page_url
            });
            continue;
          }

          const lowImage = image.toString().toLowerCase();
          if (/transparent|blank|spacer|loader|loading|placeholder|pixel|favicon|logo|sprite/.test(lowImage)) {
            skipped.push({
              name: entity.name,
              type: entity.type,
              reason: "Imagen descartada por patrón no fotográfico"
            });
            continue;
          }

          const mediaKey = [
            placeKey,
            normalizeKey(entity.type),
            normalizeKey(entity.name)
          ].join("|");

          await env.DB.prepare(`
            INSERT INTO destination_media (
              media_key, place_key, entity_name, entity_type,
              website_url, image_url, source_page_url, source_method,
              score, verified_exact, fetched_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'openai-web-search', 100, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(media_key) DO UPDATE SET
              website_url = excluded.website_url,
              image_url = excluded.image_url,
              source_page_url = excluded.source_page_url,
              source_method = excluded.source_method,
              score = excluded.score,
              verified_exact = excluded.verified_exact,
              fetched_at = CURRENT_TIMESTAMP
          `).bind(
            mediaKey,
            placeKey,
            entity.name,
            entity.type,
            entity.website,
            image.toString(),
            sourcePage.toString()
          ).run();

          saved.push({
            name: entity.name,
            type: entity.type,
            image_url: image.toString(),
            source_page_url: sourcePage.toString(),
            why_this_image: item.why_this_image,
            visual_subject: item.visual_subject
          });
        }

        const result = {
          ok: true,
          status: "completed",
          missing_before: missing.length,
          saved_count: saved.length,
          skipped_count: skipped.length,
          saved,
          skipped,
          usage: aiData?.usage || null
        };

        await env.DB.prepare(`
          UPDATE ai_media_tests
          SET status = 'completed',
              finished_at = CURRENT_TIMESTAMP,
              result_json = ?
          WHERE test_key = ?
        `).bind(JSON.stringify(result), CONTROLLED_AI_MEDIA_TEST_KEY).run();

        return new Response(JSON.stringify({
          ...result,
          openai_called: true,
          test_key: CONTROLLED_AI_MEDIA_TEST_KEY,
          general_openai_still_blocked: OPENAI_SPEND_ENABLED === false
        }), { headers });

      } catch (error) {
        try {
          await ensureAiMediaTestTable();
          await env.DB.prepare(`
            UPDATE ai_media_tests
            SET status = 'failed',
                finished_at = CURRENT_TIMESTAMP,
                result_json = ?
            WHERE test_key = ?
          `).bind(
            JSON.stringify({
              ok: false,
              error: error.message
            }),
            CONTROLLED_AI_MEDIA_TEST_KEY
          ).run();
        } catch {}

        return new Response(JSON.stringify({
          ok: false,
          status: "exception",
          openai_called: false,
          error: error.message
        }), { status: 500, headers });
      }
    }


    // Estado de la cola multimedia. Solo D1, cero OpenAI.
    if (url.pathname === "/media-jobs-status" && request.method === "GET") {
      try {
        const place = String(url.searchParams.get("place") || "").trim();
        const country = String(url.searchParams.get("country") || "").trim();
        if (!place || !country) return new Response(JSON.stringify({ok:false,openai_called:false,error:"place y country son obligatorios"}),{status:400,headers});
        await ensureDestinationMediaJobsTable();
        const placeKey = destinationKey(place,country);
        const rows = await env.DB.prepare(`
          SELECT entity_id, entity_name, entity_type, website, status, updated_at
          FROM destination_media_jobs WHERE place_key = ? ORDER BY entity_type, entity_name
        `).bind(placeKey).all();
        const items = rows.results || [];
        return new Response(JSON.stringify({
          ok:true, openai_called:false, openai_spend_enabled:OPENAI_SPEND_ENABLED,
          place, country, place_key:placeKey,
          total:items.length,
          pending_free:items.filter(x=>x.status==='pending').length,
          pending_visual:items.filter(x=>x.status==='pending_visual').length,
          visual_running:items.filter(x=>x.status==='visual_running').length,
          pending_ai:items.filter(x=>x.status==='pending_ai').length,
          ai_running:items.filter(x=>x.status==='ai_running').length,
          pending:items.filter(x=>['pending','pending_visual','visual_running','pending_ai','ai_running'].includes(x.status)).length,
          resolved:items.filter(x=>x.status==='resolved').length,
          items
        }),{headers});
      } catch(error) {
        return new Response(JSON.stringify({ok:false,openai_called:false,error:error.message}),{status:500,headers});
      }
    }

    // v25: procesa UN solo trabajo multimedia gratuito pendiente por llamada.
    // Nunca llama a OpenAI. Un trabajo por llamada evita agotar subrequests de Cloudflare.
    if (url.pathname === "/media-process-next" && request.method === "GET") {
      try {
        const place = String(url.searchParams.get("place") || "").trim();
        const country = String(url.searchParams.get("country") || "").trim();
        const mediaToken = String(url.searchParams.get("media_token") || "").trim();
        if (!MEDIA_ENRICH_TOKEN || mediaToken !== MEDIA_ENRICH_TOKEN) {
          return new Response(JSON.stringify({ok:false,openai_called:false,error:"media_token no válido"}),{status:403,headers});
        }
        if (!place || !country) {
          return new Response(JSON.stringify({ok:false,openai_called:false,error:"place y country son obligatorios"}),{status:400,headers});
        }
        await ensureDestinationMediaTable();
        await ensureDestinationMediaJobsTable();
        const placeKey = destinationKey(place,country);
        const job = await env.DB.prepare(`
          SELECT job_key, entity_id, entity_name, entity_type, website
          FROM destination_media_jobs
          WHERE place_key = ? AND status = 'pending'
          ORDER BY created_at, entity_type, entity_name
          LIMIT 1
        `).bind(placeKey).first();
        if (!job) {
          const counts = await env.DB.prepare(`
            SELECT status, COUNT(*) AS total FROM destination_media_jobs
            WHERE place_key = ? GROUP BY status
          `).bind(placeKey).all();
          return new Response(JSON.stringify({
            ok:true, source:"media-process-next", openai_called:false,
            openai_spend_enabled:OPENAI_SPEND_ENABLED, place, country, place_key:placeKey,
            processed:false, reason:"no_pending_free_jobs", counts:counts.results||[]
          }),{headers});
        }
        let best = null;
        let error = null;
        try {
          best = await discoverOfficialMediaDeep(job.website, job.entity_name, job.entity_type);
        } catch (e) {
          error = e.message;
        }
        const mediaKey = destinationMediaKey(placeKey,job.entity_id,job.entity_type,job.entity_name);
        await env.DB.prepare(`
          INSERT INTO destination_media (
            media_key, place_key, entity_id, entity_name, entity_type, website_url, image_url,
            source_page_url, source_method, score, verified_exact, fetched_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(media_key) DO UPDATE SET
            entity_id=excluded.entity_id, website_url=excluded.website_url, image_url=excluded.image_url,
            source_page_url=excluded.source_page_url, source_method=excluded.source_method,
            score=excluded.score, verified_exact=excluded.verified_exact, fetched_at=CURRENT_TIMESTAMP
        `).bind(
          mediaKey, placeKey, job.entity_id||null, job.entity_name, job.entity_type, job.website,
          best?.image_url || null, best?.source_page_url || job.website,
          best?.image_url ? 'official-web-free-candidate' : (best?.source_method || null), Number.isFinite(best?.score) ? best.score : null,
          0
        ).run();
        // v29: una foto encontrada gratis es candidata, no queda verificada solo por estar en la web oficial.
        // Luna la revisa visualmente con coste muy bajo. Si no hay candidato, pasa directamente a búsqueda IA web.
        const jobStatus = best?.image_url ? 'pending_visual' : 'pending_ai';
        await env.DB.prepare(`
          UPDATE destination_media_jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE job_key = ?
        `).bind(jobStatus, job.job_key).run();
        return new Response(JSON.stringify({
          ok:true, source:"media-process-next", openai_called:false,
          openai_spend_enabled:OPENAI_SPEND_ENABLED, place, country, place_key:placeKey,
          processed:true, name:job.entity_name, type:job.entity_type, website:job.website,
          found:Boolean(best?.image_url), image_url:best?.image_url||null,
          source_page_url:best?.source_page_url||job.website,
          source_method:best?.source_method||null,
          score:Number.isFinite(best?.score)?best.score:null, error,
          queue_status:jobStatus
        }),{headers});
      } catch(error) {
        return new Response(JSON.stringify({ok:false,openai_called:false,error:error.message}),{status:500,headers});
      }
    }

    // ============================================================
    // v29 - REVISIÓN VISUAL ECONÓMICA DE CANDIDATOS GRATUITOS.
    // Procesa SOLO un pending_visual por llamada con GPT-5.6 Luna.
    // No usa búsqueda web: mira la fotografía candidata y decide si
    // representa suficientemente bien al establecimiento. Si la rechaza,
    // pasa a pending_ai para que Terra busque una alternativa mejor.
    // ============================================================
    if (url.pathname === "/media-visual-review-next" && request.method === "GET") {
      let claimedJob = null;
      try {
        const place = String(url.searchParams.get("place") || "").trim();
        const country = String(url.searchParams.get("country") || "").trim();
        const visualToken = String(url.searchParams.get("visual_token") || "").trim();

        if (!MEDIA_VISUAL_REVIEW_TOKEN || visualToken !== MEDIA_VISUAL_REVIEW_TOKEN) {
          return new Response(JSON.stringify({ok:false,status:"cost_guard_active",openai_called:false,error:"visual_token no válido"}),{status:403,headers});
        }
        if (!place || !country) {
          return new Response(JSON.stringify({ok:false,status:"invalid_request",openai_called:false,error:"place y country son obligatorios"}),{status:400,headers});
        }

        await ensureDestinationMediaJobsTable();
        await ensureDestinationMediaTable();
        const placeKey = destinationKey(place,country);

        const visualJob = await env.DB.prepare(`
          SELECT job_key, entity_id, entity_name, entity_type, website
          FROM destination_media_jobs
          WHERE place_key = ? AND status = 'pending_visual'
          ORDER BY updated_at, entity_type, entity_name
          LIMIT 1
        `).bind(placeKey).first();
        if (visualJob) {
          const mediaKey=destinationMediaKey(placeKey,visualJob.entity_id,visualJob.entity_type,visualJob.entity_name);
          const media=await env.DB.prepare(`
            SELECT image_url, source_page_url, score FROM destination_media WHERE media_key=? LIMIT 1
          `).bind(mediaKey).first();
          claimedJob={...visualJob,...(media||{})};
        }

        if (!claimedJob) {
          return new Response(JSON.stringify({
            ok:true,status:"no_pending_visual",openai_called:false,openai_spend_enabled:OPENAI_SPEND_ENABLED,
            place,country,place_key:placeKey,processed:false,message:"No quedan candidatos gratuitos pendientes de revisión visual."
          }),{headers});
        }
        if (!claimedJob.image_url) {
          await env.DB.prepare(`UPDATE destination_media_jobs SET status='pending_ai',updated_at=CURRENT_TIMESTAMP WHERE job_key=?`).bind(claimedJob.job_key).run();
          return new Response(JSON.stringify({ok:true,status:"candidate_missing",openai_called:false,place,country,place_key:placeKey,processed:true,name:claimedJob.entity_name,queue_status:"pending_ai"}),{headers});
        }

        const claim = await env.DB.prepare(`
          UPDATE destination_media_jobs SET status='visual_running', updated_at=CURRENT_TIMESTAMP
          WHERE job_key=? AND status='pending_visual'
        `).bind(claimedJob.job_key).run();
        if (!claim?.meta?.changes) {
          claimedJob=null;
          return new Response(JSON.stringify({ok:false,status:"already_claimed",openai_called:false}),{status:409,headers});
        }

        const criteria = claimedJob.entity_type === 'overnight'
          ? `Acepta solo si la fotografía representa de forma útil el camping/área o una parte real y reconocible de sus instalaciones: vista del recinto, parcelas, caravanas/autocaravanas, edificios, recepción, servicios o una parcela claramente preparada. Rechaza fotos de estilo de vida genéricas, primeros planos de personas, tiendas aisladas sin contexto, paisajes decorativos, objetos o escenas que podrían pertenecer a cualquier camping.`
          : `Acepta solo si la fotografía representa de forma útil el restaurante: fachada, interior, terraza o un plato claramente presentado como parte de su oferta. Rechaza escenas genéricas de estilo de vida, ingredientes aislados, decoración sin contexto, personas sin relación clara o imágenes que podrían pertenecer a cualquier restaurante.`;

        const reviewResponse = await openAiMediaFetch("https://api.openai.com/v1/responses", {
          method:"POST",
          headers:{"Authorization":`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
          body:JSON.stringify({
            model:"gpt-5.6-luna",
            reasoning:{effort:"none"},
            input:[{
              role:"user",
              content:[
                {type:"input_text",text:`Revisa una fotografía candidata obtenida de la web oficial de ${claimedJob.entity_name} (${claimedJob.entity_type}) en ${place}, ${country}. ${criteria} No juzgues si la foto es bonita: juzga si sirve para representar el establecimiento en una guía de viaje. Devuelve solo el JSON solicitado.`},
                {type:"input_image",image_url:claimedJob.image_url}
              ]
            }],
            max_output_tokens:250,
            text:{format:{type:"json_schema",name:"visual_media_review",strict:true,schema:{
              type:"object",additionalProperties:false,
              properties:{
                acceptable:{type:"boolean"},
                reason:{type:"string"},
                visual_subject:{type:"string"}
              },
              required:["acceptable","reason","visual_subject"]
            }}}
          })
        });
        const reviewData=await reviewResponse.json();
        if (!reviewResponse.ok) throw new Error(`OpenAI ${reviewResponse.status}: ${JSON.stringify(reviewData).slice(0,500)}`);
        const outputText=getOutputText(reviewData);
        let review=null;
        try { review=outputText?JSON.parse(outputText):null; } catch {}
        if (!review || typeof review.acceptable !== 'boolean') throw new Error("La revisión visual no devolvió JSON válido");

        const mediaKey=destinationMediaKey(placeKey,claimedJob.entity_id,claimedJob.entity_type,claimedJob.entity_name);
        if (review.acceptable) {
          await env.DB.prepare(`
            UPDATE destination_media
            SET verified_exact=1, source_method='openai-vision-verified-official-photo', fetched_at=CURRENT_TIMESTAMP
            WHERE media_key=?
          `).bind(mediaKey).run();
          await env.DB.prepare(`UPDATE destination_media_jobs SET status='resolved',updated_at=CURRENT_TIMESTAMP WHERE job_key=?`).bind(claimedJob.job_key).run();
        } else {
          await env.DB.prepare(`
            UPDATE destination_media
            SET image_url=NULL, verified_exact=0, source_method='vision-rejected-candidate', fetched_at=CURRENT_TIMESTAMP
            WHERE media_key=?
          `).bind(mediaKey).run();
          await env.DB.prepare(`UPDATE destination_media_jobs SET status='pending_ai',updated_at=CURRENT_TIMESTAMP WHERE job_key=?`).bind(claimedJob.job_key).run();
        }

        return new Response(JSON.stringify({
          ok:true,status:"completed",source:"media-visual-review-next",openai_called:true,
          openai_spend_enabled:OPENAI_SPEND_ENABLED,model:"gpt-5.6-luna",place,country,place_key:placeKey,processed:true,
          name:claimedJob.entity_name,type:claimedJob.entity_type,candidate_image_url:claimedJob.image_url,
          acceptable:review.acceptable,reason:review.reason,visual_subject:review.visual_subject,
          queue_status:review.acceptable?"resolved":"pending_ai",usage:reviewData?.usage||null
        }),{headers});
      } catch(error) {
        if (claimedJob?.job_key) {
          try { await env.DB.prepare(`UPDATE destination_media_jobs SET status='pending_visual',updated_at=CURRENT_TIMESTAMP WHERE job_key=? AND status='visual_running'`).bind(claimedJob.job_key).run(); } catch {}
        }
        return new Response(JSON.stringify({ok:false,status:"exception",openai_called:Boolean(claimedJob),openai_spend_enabled:OPENAI_SPEND_ENABLED,error:error.message}),{status:500,headers});
      }
    }

    // ============================================================
    // DESTINATION READINESS v21
    // Diagnóstico unificado de investigación + multimedia.
    // SOLO lee D1. Nunca llama a OpenAI y nunca habilita gasto.
    // ============================================================
    if (
      url.pathname === "/destination-readiness" &&
      request.method === "GET"
    ) {
      try {
        const place = String(url.searchParams.get("place") || "").trim();
        const country = String(url.searchParams.get("country") || "").trim();

        if (!place || !country) {
          return new Response(JSON.stringify({
            ok: false,
            status: "invalid_request",
            openai_called: false,
            error: "place y country son obligatorios"
          }), { status: 400, headers });
        }

        await ensureDestinationMediaTable();

        const placeKey = destinationKey(place, country);
        const row = await env.DB.prepare(`
          SELECT research_json
          FROM destination_research
          WHERE place_key = ?
          LIMIT 1
        `).bind(placeKey).first();

        if (!row) {
          return new Response(JSON.stringify({
            ok: true,
            status: "destination_research_required",
            ready: false,
            openai_called: false,
            openai_spend_enabled: OPENAI_SPEND_ENABLED,
            place,
            country,
            place_key: placeKey,
            research: { exists: false },
            media: {
              status: "waiting_for_destination_research",
              entities_total: 0,
              with_photo: 0,
              without_suitable_photo: 0,
              unresolved_count: 0,
              unresolved: []
            }
          }), { headers });
        }

        const research = parseStoredJson(row.research_json) || {};
        const entities = [
          ...(Array.isArray(research?.gastronomy?.restaurants) ? research.gastronomy.restaurants : [])
            .map(x => ({ name: x.name, type: "restaurant", website: x.website })),
          ...(sanitizeOvernightList(research?.overnight))
            .map(x => ({ name: x.name, type: "overnight", website: x.website }))
        ].filter(x => x.name && x.website);

        const mediaRows = await env.DB.prepare(`
          SELECT entity_name, entity_type, image_url, verified_exact, source_method
          FROM destination_media
          WHERE place_key = ?
        `).bind(placeKey).all();

        const mediaMap = new Map(
          (mediaRows.results || []).map(x => [
            `${normalizeKey(x.entity_type)}|${normalizeKey(x.entity_name)}`,
            x
          ])
        );

        const details = entities.map(entity => {
          const key = `${normalizeKey(entity.type)}|${normalizeKey(entity.name)}`;
          const media = mediaMap.get(key);
          const hasPhoto = isTrustedDestinationPhoto(media);
          const noSuitablePhoto = ["openai-no-suitable-photo-v3", "openai-no-suitable-photo", "rejected-non-photo"]
            .includes(String(media?.source_method || ""));

          return {
            name: entity.name,
            type: entity.type,
            resolved: hasPhoto || noSuitablePhoto,
            has_photo: hasPhoto,
            no_suitable_photo: noSuitablePhoto
          };
        });

        const unresolved = details.filter(x => !x.resolved);
        const mediaComplete = unresolved.length === 0;

        return new Response(JSON.stringify({
          ok: true,
          status: mediaComplete ? "ready" : "media_research_required",
          ready: mediaComplete,
          openai_called: false,
          openai_spend_enabled: OPENAI_SPEND_ENABLED,
          place,
          country,
          place_key: placeKey,
          research: {
            exists: true,
            destination_scale: research?.destination_scale || null,
            quality: research?._quality || null
          },
          media: {
            status: mediaComplete ? "media_complete" : "media_research_required",
            entities_total: details.length,
            with_photo: details.filter(x => x.has_photo).length,
            without_suitable_photo: details.filter(x => x.no_suitable_photo).length,
            unresolved_count: unresolved.length,
            unresolved,
            details
          }
        }), { headers });
      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          status: "exception",
          openai_called: false,
          error: error.message
        }), { status: 500, headers });
      }
    }

    // ============================================================
    // INVESTIGACIÓN MULTIMEDIA IA GENÉRICA
    // Preparada para producción. Cache-first: solo investiga medios
    // faltantes de un destino que YA exista en destination_research.
    // Mientras OPENAI_SPEND_ENABLED=false no puede generar gasto.
    // ============================================================

    // Estado multimedia de un destino. Solo D1, cero OpenAI.
    if (
      url.pathname === "/media-research-status" &&
      request.method === "GET"
    ) {
      try {
        const place = String(url.searchParams.get("place") || "").trim();
        const country = String(url.searchParams.get("country") || "").trim();

        if (!place || !country) {
          return new Response(JSON.stringify({
            ok: false,
            openai_called: false,
            error: "place y country son obligatorios"
          }), { status: 400, headers });
        }

        await ensureDestinationMediaTable();

        const placeKey = destinationKey(place, country);
        const row = await env.DB.prepare(`
          SELECT research_json
          FROM destination_research
          WHERE place_key = ?
          LIMIT 1
        `).bind(placeKey).first();

        if (!row) {
          return new Response(JSON.stringify({
            ok: true,
            status: "destination_research_required",
            openai_called: false,
            place,
            country,
            place_key: placeKey
          }), { headers });
        }

        const research = parseStoredJson(row.research_json) || {};
        const entities = [
          ...(Array.isArray(research?.gastronomy?.restaurants) ? research.gastronomy.restaurants : [])
            .map(x => ({ name: x.name, type: "restaurant", website: x.website })),
          ...(sanitizeOvernightList(research?.overnight))
            .map(x => ({ name: x.name, type: "overnight", website: x.website }))
        ].filter(x => x.name && x.website);

        const mediaRows = await env.DB.prepare(`
          SELECT entity_name, entity_type, image_url, verified_exact, source_method
          FROM destination_media
          WHERE place_key = ?
        `).bind(placeKey).all();

        const rowMap = new Map(
          (mediaRows.results || []).map(x => [
            `${normalizeKey(x.entity_type)}|${normalizeKey(x.entity_name)}`,
            x
          ])
        );

        const details = entities.map(entity => {
          const key = `${normalizeKey(entity.type)}|${normalizeKey(entity.name)}`;
          const media = rowMap.get(key);
          const hasPhoto = isTrustedDestinationPhoto(media);
          const noSuitable = ["openai-no-suitable-photo-v3", "openai-no-suitable-photo", "rejected-non-photo"].includes(String(media?.source_method || ""));
          return {
            name: entity.name,
            type: entity.type,
            resolved: hasPhoto || noSuitable,
            has_photo: hasPhoto,
            no_suitable_photo: noSuitable
          };
        });

        const unresolved = details.filter(x => !x.resolved);

        return new Response(JSON.stringify({
          ok: true,
          status: unresolved.length ? "media_research_required" : "media_complete",
          openai_called: false,
          place,
          country,
          place_key: placeKey,
          entities_total: details.length,
          with_photo: details.filter(x => x.has_photo).length,
          without_suitable_photo: details.filter(x => x.no_suitable_photo).length,
          unresolved_count: unresolved.length,
          unresolved,
          details
        }), { headers });
      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          openai_called: false,
          error: error.message
        }), { status: 500, headers });
      }
    }

    // ============================================================
    // v30 - IA multimedia directa con caché D1: procesa SOLO un pending_ai.
    // El flujo normal ya clasifica como pending_ai toda multimedia no verificada por IA/manual.
    // Esta ruta requiere token independiente y además respeta los gates OpenAI por petición.
    // Un resultado válido o "sin foto fiable" queda guardado en D1 y no se vuelve a pagar.
    // ============================================================
    if (url.pathname === "/media-ai-process-next" && request.method === "GET") {
      let claimedJob = null;
      try {
        const place = String(url.searchParams.get("place") || "").trim();
        const country = String(url.searchParams.get("country") || "").trim();
        const aiMediaToken = String(url.searchParams.get("ai_media_token") || "").trim();

        if (!MEDIA_AI_QUEUE_TOKEN || aiMediaToken !== MEDIA_AI_QUEUE_TOKEN) {
          return new Response(JSON.stringify({ok:false,status:"cost_guard_active",openai_called:false,error:"ai_media_token no válido"}),{status:403,headers});
        }
        if (!place || !country) {
          return new Response(JSON.stringify({ok:false,status:"invalid_request",openai_called:false,error:"place y country son obligatorios"}),{status:400,headers});
        }

        await ensureDestinationMediaJobsTable();
        await ensureDestinationMediaTable();
        const placeKey = destinationKey(place,country);

        const researchRow = await env.DB.prepare(`
          SELECT research_json FROM destination_research WHERE place_key = ? LIMIT 1
        `).bind(placeKey).first();
        if (!researchRow) {
          return new Response(JSON.stringify({ok:false,status:"research_required",openai_called:false,place,country,place_key:placeKey}),{status:404,headers});
        }

        const research = parseStoredJson(researchRow.research_json) || {};
        await syncDestinationMediaJobs(place,country,research);

        claimedJob = await env.DB.prepare(`
          SELECT job_key, entity_id, entity_name, entity_type, website
          FROM destination_media_jobs
          WHERE place_key = ? AND status = 'pending_ai'
          ORDER BY updated_at, entity_type, entity_name
          LIMIT 1
        `).bind(placeKey).first();

        if (!claimedJob) {
          return new Response(JSON.stringify({
            ok:true,status:"no_pending_ai",openai_called:false,openai_spend_enabled:OPENAI_SPEND_ENABLED,
            place,country,place_key:placeKey,processed:false,message:"No quedan trabajos multimedia pendientes de IA para este destino."
          }),{headers});
        }

        const claim = await env.DB.prepare(`
          UPDATE destination_media_jobs SET status='ai_running', updated_at=CURRENT_TIMESTAMP
          WHERE job_key=? AND status='pending_ai'
        `).bind(claimedJob.job_key).run();
        if (!claim?.meta?.changes) {
          claimedJob = null;
          return new Response(JSON.stringify({ok:false,status:"already_claimed",openai_called:false}),{status:409,headers});
        }

        const prompt = `
Eres el INVESTIGADOR MULTIMEDIA de "Rutas con Campings & Áreas IA".
Investiga SOLO esta entidad de ${place}, ${country}:
${JSON.stringify({name:claimedJob.entity_name,type:claimedJob.entity_type,website:claimedJob.website},null,2)}

OBJETIVO: encontrar UNA fotografía real, atractiva y exacta de la entidad.
REGLAS:
- Usa búsqueda web y prioriza la web oficial indicada.
- La source_page_url DEBE pertenecer a la web oficial.
- SOLO acepta fotografía real. Rechaza logos, iconos, dibujos, mapas, renders, banners, placeholders y fotos dudosas.
- Restaurante: prioriza plato terminado, interior, terraza o fachada.
- Camping/pernocta: prioriza vista general, parcelas con caravanas/autocaravanas o instalaciones.
- No inventes URLs.
- image_url debe ser URL directa verificable de la fotografía.
- Si no puedes verificar una foto adecuada, devuelve image_url="" y visual_kind="not_acceptable".
- Devuelve solo JSON válido.`;

        const aiResponse = await openAiMediaFetch("https://api.openai.com/v1/responses", {
          method:"POST",
          headers:{"Authorization":`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
          body:JSON.stringify({
            model:"gpt-5.6-terra",
            reasoning:{effort:"low"},
            tools:[{type:"web_search",search_context_size:"medium"}],
            input:prompt,
            max_output_tokens:1200,
            text:{format:{type:"json_schema",name:"single_media_research",strict:true,schema:{
              type:"object",additionalProperties:false,
              properties:{
                name:{type:"string"}, type:{type:"string",enum:["restaurant","overnight"]},
                image_url:{type:"string"}, source_page_url:{type:"string"},
                visual_subject:{type:"string"}, visual_kind:{type:"string",enum:["real_photo","not_acceptable"]}
              },
              required:["name","type","image_url","source_page_url","visual_subject","visual_kind"]
            }}}
          })
        });
        const aiData = await aiResponse.json();
        if (!aiResponse.ok) throw new Error(`OpenAI ${aiResponse.status}: ${JSON.stringify(aiData).slice(0,500)}`);

        const outputText = getOutputText(aiData);
        let item=null;
        try { item=outputText ? JSON.parse(outputText) : null; } catch {}
        if (!item) throw new Error("La IA no devolvió JSON válido");

        const official=safeOfficialUrl(claimedJob.website);
        const sourcePage=safeOfficialUrl(item.source_page_url);
        const image=safeOfficialUrl(item.image_url);
        const sameOfficialHost=official && sourcePage && (
          sourcePage.hostname===official.hostname || sourcePage.hostname.endsWith(`.${official.hostname}`) || official.hostname.endsWith(`.${sourcePage.hostname}`)
        );
        if (!sameOfficialHost) throw new Error("La fuente devuelta por la IA no pertenece a la web oficial");

        const mediaKey=destinationMediaKey(placeKey,claimedJob.entity_id,claimedJob.entity_type,claimedJob.entity_name);
        const lowImage=image ? image.toString().toLowerCase() : "";
        const acceptable=item.visual_kind==="real_photo" && image && !/transparent|blank|spacer|loader|loading|placeholder|pixel|favicon|logo|sprite|icon|clipart|illustration/.test(lowImage);

        if (acceptable) {
          await env.DB.prepare(`
            INSERT INTO destination_media (media_key,place_key,entity_id,entity_name,entity_type,website_url,image_url,source_page_url,source_method,score,verified_exact,fetched_at)
            VALUES (?,?,?,?,?,?,?,?,'openai-web-search-premium-photo',100,1,CURRENT_TIMESTAMP)
            ON CONFLICT(media_key) DO UPDATE SET website_url=excluded.website_url,image_url=excluded.image_url,source_page_url=excluded.source_page_url,source_method=excluded.source_method,score=100,verified_exact=1,fetched_at=CURRENT_TIMESTAMP
          `).bind(mediaKey,placeKey,claimedJob.entity_id||null,claimedJob.entity_name,claimedJob.entity_type,claimedJob.website,image.toString(),sourcePage.toString()).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO destination_media (media_key,place_key,entity_id,entity_name,entity_type,website_url,image_url,source_page_url,source_method,score,verified_exact,fetched_at)
            VALUES (?,?,?,?,?,?,NULL,?,'openai-no-suitable-photo-v3',0,0,CURRENT_TIMESTAMP)
            ON CONFLICT(media_key) DO UPDATE SET website_url=excluded.website_url,image_url=NULL,source_page_url=excluded.source_page_url,source_method='openai-no-suitable-photo-v3',score=0,verified_exact=0,fetched_at=CURRENT_TIMESTAMP
          `).bind(mediaKey,placeKey,claimedJob.entity_id||null,claimedJob.entity_name,claimedJob.entity_type,claimedJob.website,sourcePage.toString()).run();
        }

        await env.DB.prepare(`UPDATE destination_media_jobs SET status='resolved',updated_at=CURRENT_TIMESTAMP WHERE job_key=?`).bind(claimedJob.job_key).run();

        return new Response(JSON.stringify({
          ok:true,status:"completed",source:"media-ai-process-next",openai_called:true,
          openai_spend_enabled:OPENAI_SPEND_ENABLED,place,country,place_key:placeKey,processed:true,
          name:claimedJob.entity_name,type:claimedJob.entity_type,website:claimedJob.website,
          found:Boolean(acceptable),image_url:acceptable?image.toString():null,
          source_page_url:sourcePage.toString(),queue_status:"resolved",usage:aiData?.usage||null
        }),{headers});
      } catch(error) {
        if (claimedJob?.job_key) {
          try { await env.DB.prepare(`UPDATE destination_media_jobs SET status='pending_ai',updated_at=CURRENT_TIMESTAMP WHERE job_key=? AND status='ai_running'`).bind(claimedJob.job_key).run(); } catch {}
        }
        return new Response(JSON.stringify({ok:false,status:"exception",openai_called:Boolean(claimedJob),openai_spend_enabled:OPENAI_SPEND_ENABLED,error:error.message}),{status:500,headers});
      }
    }


    // v45: si la búsqueda web no logra una URL directa de foto, hacemos un
    // segundo método controlado: extraemos candidatos de la web oficial y
    // verificamos visualmente SOLO el mejor candidato con un modelo barato.
    async function verifiedOfficialPhotoFallback(entity, place, country) {
      try {
        const official = safeOfficialUrl(entity?.website);
        if (!official) return null;
        const page = await fetchHtmlPage(official.toString());
        if (!page?.html) return null;

        const allCandidates = [
          ...extractAllImageCandidates(page.html, page.page_url, entity.name, entity.type, 0)
        ];

        // Muchas webs oficiales guardan sus mejores fotos en galería, instalaciones,
        // camping o restaurante. Revisamos unas pocas páginas internas del mismo dominio
        // y mantenemos la verificación visual posterior para evitar imágenes equivocadas.
        const internalPages = extractInternalMediaLinks(page.html, page.page_url, entity.type).slice(0, 4);
        for (const link of internalPages) {
          const sub = await fetchHtmlPage(link.url);
          if (!sub?.html) continue;
          allCandidates.push(
            ...extractAllImageCandidates(sub.html, sub.page_url, entity.name, entity.type, Math.min(25, Number(link.score) || 0))
          );
        }

        const seenCandidates = new Set();
        const candidates = allCandidates
          .filter(x => x?.image_url && Number(x?.score) >= 35)
          .sort((a,b)=>(Number(b?.score)||0)-(Number(a?.score)||0))
          .filter(x => {
            if (seenCandidates.has(x.image_url)) return false;
            seenCandidates.add(x.image_url);
            return true;
          })
          .slice(0, 6);
        for (const candidate of candidates) {
          const criteria = entity.type === "overnight"
            ? "Acepta solo si muestra claramente el camping/área/camper stop real: recinto, parcelas, autocaravanas, recepción o instalaciones identificables."
            : "Acepta solo si muestra claramente el restaurante real: plato servido, sala, terraza o fachada identificable.";
          const vr = await openAiMediaFetch("https://api.openai.com/v1/responses", {
            method:"POST",
            headers:{"Authorization":`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
            body:JSON.stringify({
              model:"gpt-5.6-luna",
              reasoning:{effort:"none"},
              input:[{role:"user",content:[
                {type:"input_text",text:`Verifica esta imagen de ${entity.name} (${entity.type}) en ${place}, ${country}. ${criteria} Rechaza logos, mapas, dibujos, imágenes genéricas o de otro negocio.`},
                {type:"input_image",image_url:candidate.image_url}
              ]}],
              max_output_tokens:180,
              text:{format:{type:"json_schema",name:"official_photo_fallback_review",strict:true,schema:{
                type:"object",additionalProperties:false,
                properties:{acceptable:{type:"boolean"},reason:{type:"string"}},
                required:["acceptable","reason"]
              }}}
            })
          });
          const vd=await vr.json();
          if(!vr.ok) continue;
          let review=null; try{const t=getOutputText(vd); review=t?JSON.parse(t):null;}catch{}
          if(review?.acceptable){
            return {image_url:candidate.image_url,source_page_url:candidate.source_page_url||page.page_url,usage:vd.usage||null};
          }
        }
      } catch(e) { console.log("official-photo-fallback", entity?.name, e?.message||e); }
      return null;
    }

    if (
      (url.pathname === "/research-media" && request.method === "POST") ||
      (url.pathname === "/ai-media-enrich-paris-restaurants-v2" && request.method === "GET")
    ) {
      try {
        const controlledParisRestaurants =
          url.pathname === "/ai-media-enrich-paris-restaurants-v2";

        const body = controlledParisRestaurants
          ? { place: "Paris", country: "France" }
          : await request.json().catch(() => ({}));

        const place = String(body?.place || "").trim();
        const country = String(body?.country || "").trim();

        if (controlledParisRestaurants) {
          const testToken = String(url.searchParams.get("test_token") || "").trim();
          if (!CONTROLLED_PARIS_RESTAURANTS_MEDIA_TOKEN || testToken !== CONTROLLED_PARIS_RESTAURANTS_MEDIA_TOKEN) {
            return new Response(JSON.stringify({
              ok: false,
              status: "cost_guard_active",
              openai_called: false,
              error: "test_token no válido"
            }), { status: 403, headers });
          }
        }

        if (!place || !country) {
          return new Response(JSON.stringify({
            ok: false,
            status: "invalid_request",
            openai_called: false,
            error: "place y country son obligatorios"
          }), { status: 400, headers });
        }

        await ensureDestinationMediaTable();

        const placeKey = destinationKey(place, country);
        const row = await env.DB.prepare(`
          SELECT research_json
          FROM destination_research
          WHERE place_key = ?
          LIMIT 1
        `).bind(placeKey).first();

        if (!row) {
          return new Response(JSON.stringify({
            ok: false,
            status: "research_required",
            openai_called: false,
            place,
            country,
            place_key: placeKey,
            message: "Primero debe existir la investigación turística del destino."
          }), { status: 404, headers });
        }

        const research = parseStoredJson(row.research_json) || {};
        const restaurants = Array.isArray(research?.gastronomy?.restaurants)
          ? research.gastronomy.restaurants
          : [];
        const overnight = Array.isArray(research?.overnight)
          ? research.overnight
          : [];

        const entities = [
          ...restaurants.map(x => ({
            entity_id: String(x.entity_id || "").trim(),
            name: x.name,
            type: "restaurant",
            website: x.website,
            address: x.address || "",
            zone: x.zone || ""
          })),
          ...overnight.map(x => ({
            entity_id: String(x.entity_id || "").trim(),
            name: x.name,
            type: "overnight",
            website: x.website,
            address: x.address || "",
            zone: ""
          }))
        ].filter(x => x.name && x.website);

        const mediaRows = await env.DB.prepare(`
          SELECT entity_id, entity_name, entity_type, image_url, verified_exact, source_method
          FROM destination_media
          WHERE place_key = ?
        `).bind(placeKey).all();

        // v46: identidad multimedia canónica por entity_id. El nombre queda como
        // compatibilidad con filas históricas que todavía no tengan entity_id.
        // Cualquier intento IA ya iniciado queda cerrado para impedir recompras
        // automáticas incluso si la llamada falla después de consumir coste.
        const terminalNegativeMethods = new Set([
          "openai-no-suitable-photo-v3",
          "openai-no-suitable-photo",
          "rejected-non-photo",
          "openai-media-attempted-v1"
        ]);
        const resolvedIds = new Set();
        const resolvedNames = new Set();
        for (const x of (mediaRows.results || [])) {
          const resolved =
            (x.image_url && Number(x.verified_exact) === 1) ||
            terminalNegativeMethods.has(String(x.source_method || ""));
          if (!resolved) continue;
          const id = String(x.entity_id || "").trim();
          if (id) resolvedIds.add(id);
          resolvedNames.add(`${normalizeKey(x.entity_type)}|${normalizeKey(x.entity_name)}`);
        }

        const missing = entities.filter(x => {
          const id = String(x.entity_id || "").trim();
          if (id && resolvedIds.has(id)) return false;
          return !resolvedNames.has(`${normalizeKey(x.type)}|${normalizeKey(x.name)}`);
        });

        if (!missing.length) {
          return new Response(JSON.stringify({
            ok: true,
            status: "cache_complete",
            openai_called: false,
            place,
            country,
            place_key: placeKey,
            entities_total: entities.length,
            missing_count: 0,
            message: "Toda la multimedia empresarial ya está guardada en D1."
          }), { headers });
        }

        if (!openAiScopeEnabled("media") && !controlledParisRestaurants) {
          return new Response(JSON.stringify({
            ok: false,
            status: "cost_guard_active",
            openai_called: false,
            place,
            country,
            place_key: placeKey,
            missing_count: missing.length,
            message: "La investigación multimedia IA está preparada, pero el gasto general continúa bloqueado."
          }), { status: 403, headers });
        }

        if (controlledParisRestaurants) {
          await ensureAiMediaTestTable();

          const existingControlled = await env.DB.prepare(`
            SELECT status, started_at, finished_at, result_json
            FROM ai_media_tests
            WHERE test_key = ?
            LIMIT 1
          `).bind(CONTROLLED_PARIS_RESTAURANTS_MEDIA_KEY).first();

          if (existingControlled) {
            return new Response(JSON.stringify({
              ok: true,
              status: existingControlled.status,
              openai_called: false,
              reused_test_record: true,
              started_at: existingControlled.started_at,
              finished_at: existingControlled.finished_at || null,
              result: parseStoredJson(existingControlled.result_json) || null,
              message: "Esta excepción controlada ya fue utilizada. No se hará otra llamada a OpenAI."
            }), { headers });
          }

          const claim = await env.DB.prepare(`
            INSERT OR IGNORE INTO ai_media_tests (test_key, status, started_at)
            VALUES (?, 'running', CURRENT_TIMESTAMP)
          `).bind(CONTROLLED_PARIS_RESTAURANTS_MEDIA_KEY).run();

          if (!claim?.meta?.changes) {
            return new Response(JSON.stringify({
              ok: false,
              status: "already_claimed",
              openai_called: false
            }), { status: 409, headers });
          }
        }

        const prompt = `
Eres el INVESTIGADOR MULTIMEDIA de "Rutas con Campings & Áreas IA".

DESTINO: ${place}, ${country}

OBJETIVO:
Encontrar UNA fotografía Premium para cada entidad indicada.
No investigues turismo general ni añadas entidades nuevas.

ENTIDADES:
${JSON.stringify(missing, null, 2)}

REGLAS OBLIGATORIAS:
- Usa búsqueda web y prioriza la web oficial de cada entidad.
- SOLO acepta FOTOGRAFÍAS REALES.
- RECHAZA dibujos, ilustraciones, renders, gráficos, clipart, pictogramas, logotipos, iconos, mapas, banners gráficos, carteles, capturas, placeholders, miniaturas y transparentes.
- Una imagen procedente de la web oficial NO es válida automáticamente: además debe ser una fotografía real, atractiva y representar exactamente la entidad.
- Restaurante: prioriza 1) plato real terminado, 2) interior/sala, 3) terraza, 4) fachada. Evita ingredientes sueltos si existe una alternativa mejor.
- Camping/pernocta: prioriza 1) vista general o aérea del recinto, 2) parcelas con caravanas/autocaravanas, 3) instalaciones, 4) piscina.
- Rechaza túneles, pasos inferiores, barreras, carreteras o imágenes del entorno que no muestren claramente el establecimiento.
- Antes de devolver una URL confirma visualmente que es una fotografía real y adecuada.
- Devuelve exactamente el entity_id recibido para cada entidad (o cadena vacía si no existe).
- No inventes URLs.
- image_url debe ser una URL directa verificable de la fotografía.
- source_page_url debe ser la página oficial donde se muestra o documenta esa fotografía.
- Si no puedes verificar una fotografía que cumpla TODO lo anterior, usa image_url="" y visual_kind="not_acceptable".
- Es preferible NO guardar foto a guardar una foto mediocre, dudosa o incorrecta.
- Devuelve solo JSON válido.
`;

        // v46 COST GUARD MULTIMEDIA: antes de la única llamada Terra del destino,
        // marcamos cada entidad pendiente como ya intentada. Si la API, el parseo o
        // el Worker fallan después, una recarga normal NO vuelve a comprar la misma
        // investigación. Un reintento futuro deberá ser manual y consciente.
        for (const entity of missing) {
          const mediaKey = destinationMediaKey(placeKey, entity.entity_id, entity.type, entity.name);
          await env.DB.prepare(`
            INSERT INTO destination_media (
              media_key, place_key, entity_id, entity_name, entity_type,
              website_url, image_url, source_page_url, source_method,
              score, verified_exact, fetched_at
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'openai-media-attempted-v1', 0, 0, CURRENT_TIMESTAMP)
            ON CONFLICT(media_key) DO UPDATE SET
              entity_id = COALESCE(excluded.entity_id, destination_media.entity_id),
              website_url = excluded.website_url,
              source_method = 'openai-media-attempted-v1',
              score = 0,
              verified_exact = 0,
              fetched_at = CURRENT_TIMESTAMP
          `).bind(
            mediaKey, placeKey, entity.entity_id || null, entity.name, entity.type,
            entity.website, entity.website
          ).run();
        }

        const aiResponse = await openAiMediaFetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-5.6-terra",
            reasoning: { effort: "low" },
            tools: [{ type: "web_search", search_context_size: "medium" }],
            input: prompt,
            max_output_tokens: 3500,
            text: {
              format: {
                type: "json_schema",
                name: "destination_media_research",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    results: {
                      type: "array",
                      maxItems: 20,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          entity_id: { type: "string" },
                          name: { type: "string" },
                          type: { type: "string", enum: ["restaurant", "overnight"] },
                          image_url: { type: "string" },
                          source_page_url: { type: "string" },
                          why_this_image: { type: "string" },
                          visual_subject: { type: "string" },
                          visual_kind: { type: "string", enum: ["real_photo", "not_acceptable"] }
                        },
                        required: [
                          "entity_id", "name", "type", "image_url", "source_page_url",
                          "why_this_image", "visual_subject", "visual_kind"
                        ]
                      }
                    }
                  },
                  required: ["results"]
                }
              }
            }
          })
        });

        const aiData = await aiResponse.json();

        if (!aiResponse.ok) {
          return new Response(JSON.stringify({
            ok: false,
            status: "openai_error",
            openai_called: true,
            error: aiData,
            usage: aiData?.usage || null
          }), { status: aiResponse.status, headers });
        }

        const outputText = getOutputText(aiData);
        let parsed = null;
        try { parsed = outputText ? JSON.parse(outputText) : null; } catch {}

        if (!parsed || !Array.isArray(parsed.results)) {
          return new Response(JSON.stringify({
            ok: false,
            status: "invalid_json",
            openai_called: true,
            usage: aiData?.usage || null
          }), { status: 502, headers });
        }

        const missingById = new Map();
        const missingByName = new Map();
        for (const x of missing) {
          const id = String(x.entity_id || "").trim();
          if (id) missingById.set(id, x);
          missingByName.set(`${normalizeKey(x.type)}|${normalizeKey(x.name)}`, x);
        }

        const saved = [];
        const skipped = [];
        const processedEntities = new Set();

        function processedKey(entity) {
          const id = String(entity?.entity_id || "").trim();
          return id ? `id:${id}` : `name:${normalizeKey(entity?.type)}|${normalizeKey(entity?.name)}`;
        }

        async function saveNoSuitable(entity, reason, sourcePageUrl = "") {
          const mediaKey = destinationMediaKey(placeKey, entity.entity_id, entity.type, entity.name);
          await env.DB.prepare(`
            INSERT INTO destination_media (
              media_key, place_key, entity_id, entity_name, entity_type,
              website_url, image_url, source_page_url, source_method,
              score, verified_exact, fetched_at
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'openai-no-suitable-photo-v3', 0, 0, CURRENT_TIMESTAMP)
            ON CONFLICT(media_key) DO UPDATE SET
              entity_id = COALESCE(excluded.entity_id, destination_media.entity_id),
              entity_name = excluded.entity_name,
              entity_type = excluded.entity_type,
              website_url = excluded.website_url,
              image_url = NULL,
              source_page_url = excluded.source_page_url,
              source_method = 'openai-no-suitable-photo-v3',
              score = 0,
              verified_exact = 0,
              fetched_at = CURRENT_TIMESTAMP
          `).bind(
            mediaKey, placeKey, entity.entity_id || null, entity.name, entity.type,
            entity.website, sourcePageUrl || entity.website
          ).run();
          processedEntities.add(processedKey(entity));
          skipped.push({
            entity_id: entity.entity_id || null,
            name: entity.name,
            type: entity.type,
            reason,
            source_page_url: sourcePageUrl || entity.website,
            saved_as_resolved_without_photo: true
          });
        }

        async function saveVerifiedPhoto(entity, imageUrl, sourcePageUrl, visualSubject = "") {
          const mediaKey = destinationMediaKey(placeKey, entity.entity_id, entity.type, entity.name);
          await env.DB.prepare(`
            INSERT INTO destination_media (
              media_key, place_key, entity_id, entity_name, entity_type,
              website_url, image_url, source_page_url, source_method,
              score, verified_exact, fetched_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'openai-web-search-premium-photo', 100, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(media_key) DO UPDATE SET
              entity_id = COALESCE(excluded.entity_id, destination_media.entity_id),
              entity_name = excluded.entity_name,
              entity_type = excluded.entity_type,
              website_url = excluded.website_url,
              image_url = excluded.image_url,
              source_page_url = excluded.source_page_url,
              source_method = excluded.source_method,
              score = 100,
              verified_exact = 1,
              fetched_at = CURRENT_TIMESTAMP
          `).bind(
            mediaKey, placeKey, entity.entity_id || null, entity.name, entity.type,
            entity.website, imageUrl, sourcePageUrl
          ).run();
          processedEntities.add(processedKey(entity));
          saved.push({
            entity_id: entity.entity_id || null,
            name: entity.name,
            type: entity.type,
            image_url: imageUrl,
            source_page_url: sourcePageUrl,
            visual_subject: visualSubject
          });
        }

        // v46: UNA sola llamada Terra por destino. No hay fallback automático Luna.
        // Si Terra no puede cerrar una entidad de forma fiable, se persiste como
        // "sin foto adecuada" y no se vuelve a pagar al reabrir la ruta.
        for (const item of parsed.results) {
          const itemId = String(item?.entity_id || "").trim();
          const nameKey = `${normalizeKey(item?.type)}|${normalizeKey(item?.name)}`;
          const entity = (itemId && missingById.get(itemId)) || missingByName.get(nameKey);

          if (!entity) {
            skipped.push({ entity_id: itemId || null, name: item?.name, type: item?.type, reason: "Entidad no solicitada" });
            continue;
          }
          if (processedEntities.has(processedKey(entity))) continue;

          const official = safeOfficialUrl(entity.website);
          const sourcePage = safeOfficialUrl(item.source_page_url);
          const image = safeOfficialUrl(item.image_url);

          if (!official || !sourcePage) {
            await saveNoSuitable(entity, "Fuente oficial inválida");
            continue;
          }

          const sameOfficialHost =
            sourcePage.hostname === official.hostname ||
            sourcePage.hostname.endsWith(`.${official.hostname}`) ||
            official.hostname.endsWith(`.${sourcePage.hostname}`);

          if (!sameOfficialHost) {
            await saveNoSuitable(entity, "La fuente no pertenece a la web oficial", sourcePage.toString());
            continue;
          }

          if (item.visual_kind !== "real_photo" || !image) {
            await saveNoSuitable(entity, "Sin fotografía real Premium suficientemente verificada", sourcePage.toString());
            continue;
          }

          const lowImage = image.toString().toLowerCase();
          if (/transparent|blank|spacer|loader|loading|placeholder|pixel|favicon|logo|sprite|icon|clipart|illustration/.test(lowImage)) {
            await saveNoSuitable(entity, "Rechazada por patrón no fotográfico", sourcePage.toString());
            continue;
          }

          await saveVerifiedPhoto(entity, image.toString(), sourcePage.toString(), item.visual_subject || "");
        }

        // El schema permite hasta 20 resultados, pero si el modelo omite alguno
        // no dejamos esa entidad abierta para que una recarga vuelva a pagar Terra.
        for (const entity of missing) {
          if (!processedEntities.has(processedKey(entity))) {
            await saveNoSuitable(entity, "La investigación IA no devolvió una fotografía verificable para esta entidad");
          }
        }

        const completedResult = {
          ok: true,
          status: "completed",
          openai_called: true,
          place,
          country,
          place_key: placeKey,
          missing_before: missing.length,
          processed_count: missing.length,
          saved_count: saved.length,
          skipped_count: skipped.length,
          automatic_openai_calls: 1,
          automatic_luna_fallback_calls: 0,
          saved,
          skipped,
          usage: aiData?.usage || null
        };

        if (controlledParisRestaurants) {
          await env.DB.prepare(`
            UPDATE ai_media_tests
            SET status = 'completed', finished_at = CURRENT_TIMESTAMP, result_json = ?
            WHERE test_key = ?
          `).bind(JSON.stringify(completedResult), CONTROLLED_PARIS_RESTAURANTS_MEDIA_KEY).run();
        }

        return new Response(JSON.stringify(completedResult), { headers });

      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          status: "exception",
          openai_called: false,
          error: error.message
        }), { status: 500, headers });
      }
    }

    if (
      url.pathname === "/media-enrich-entity" &&
      request.method === "GET"
    ) {
      try {
        const place = (url.searchParams.get("place") || "").trim();
        const country = (url.searchParams.get("country") || "").trim();
        const name = (url.searchParams.get("name") || "").trim();
        const type = (url.searchParams.get("type") || "").trim().toLowerCase();
        const mediaToken = (url.searchParams.get("media_token") || "").trim();

        if (!MEDIA_ENRICH_TOKEN || mediaToken !== MEDIA_ENRICH_TOKEN) {
          return new Response(JSON.stringify({
            ok: false,
            error: "media_token no válido",
            openai_called: false
          }), { status: 403, headers });
        }

        if (!place || !name || !["restaurant", "overnight"].includes(type)) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Se requieren place, name y type=restaurant|overnight",
            openai_called: false
          }), { status: 400, headers });
        }

        const placeKey = destinationKey(place, country);
        const row = await env.DB.prepare(`
          SELECT research_json
          FROM destination_research
          WHERE place_key = ?
          LIMIT 1
        `).bind(placeKey).first();

        if (!row) {
          return new Response(JSON.stringify({
            ok: false,
            error: "El destino no existe en destination_research",
            place_key: placeKey,
            openai_called: false
          }), { status: 404, headers });
        }

        const research = parseStoredJson(row.research_json) || {};
        const restaurants = Array.isArray(research?.gastronomy?.restaurants)
          ? research.gastronomy.restaurants
          : [];
        const overnight = Array.isArray(research?.overnight)
          ? research.overnight
          : [];

        const list = type === "restaurant" ? restaurants : overnight;
        const targetName = normalizeKey(name);
        const entity = list.find(x => normalizeKey(x?.name) === targetName);

        if (!entity) {
          return new Response(JSON.stringify({
            ok: false,
            error: "El establecimiento no existe en la investigación D1 del destino",
            place_key: placeKey,
            name,
            type,
            openai_called: false
          }), { status: 404, headers });
        }

        if (!entity.website) {
          return new Response(JSON.stringify({
            ok: false,
            error: "El establecimiento no tiene web oficial verificada en D1",
            place_key: placeKey,
            name: entity.name,
            type,
            openai_called: false
          }), { status: 422, headers });
        }

        await ensureDestinationMediaTable();
        await ensureDestinationMediaJobsTable();

        const mediaKey = [
          placeKey,
          normalizeKey(type),
          normalizeKey(entity.name)
        ].join("|");

        let best = null;
        let error = null;

        try {
          best = await discoverOfficialMediaDeep(
            entity.website,
            entity.name,
            type
          );
        } catch (e) {
          error = e.message;
        }

        await env.DB.prepare(`
          INSERT INTO destination_media (
            media_key, place_key, entity_name, entity_type,
            website_url, image_url, source_page_url, source_method,
            score, verified_exact, fetched_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(media_key) DO UPDATE SET
            website_url = excluded.website_url,
            image_url = excluded.image_url,
            source_page_url = excluded.source_page_url,
            source_method = excluded.source_method,
            score = excluded.score,
            verified_exact = excluded.verified_exact,
            fetched_at = CURRENT_TIMESTAMP
        `).bind(
          mediaKey,
          placeKey,
          entity.name,
          type,
          entity.website,
          best?.image_url || null,
          best?.source_page_url || entity.website,
          best?.source_method || null,
          Number.isFinite(best?.score) ? best.score : null,
          best?.image_url ? 1 : 0
        ).run();

        // v24: sincroniza el resultado de la búsqueda gratuita con la cola.
        // Foto válida => resuelto. Sin foto => queda pendiente de IA multimedia.
        const jobKey = await sha256Hex(`${placeKey}|${normalizeKey(type)}|${normalizeKey(entity.name)}`);
        const jobStatus = best?.image_url ? 'resolved' : 'pending_ai';
        await env.DB.prepare(`
          INSERT INTO destination_media_jobs (
            job_key, place_key, place_name, country_name, entity_name, entity_type,
            website, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(job_key) DO UPDATE SET
            website = excluded.website,
            status = excluded.status,
            updated_at = CURRENT_TIMESTAMP
        `).bind(
          jobKey, placeKey, place, country, entity.name, type,
          entity.website, jobStatus
        ).run();

        return new Response(JSON.stringify({
          ok: true,
          source: "official-web-enrichment-single-entity",
          openai_called: false,
          place,
          country: country || null,
          place_key: placeKey,
          name: entity.name,
          type,
          website: entity.website,
          found: Boolean(best?.image_url),
          image_url: best?.image_url || null,
          source_page_url: best?.source_page_url || entity.website,
          source_method: best?.source_method || null,
          score: Number.isFinite(best?.score) ? best.score : null,
          error,
          saved_to_d1: true,
          queue_status: jobStatus,
          message: best?.image_url
            ? "Fotografía guardada en D1 para este establecimiento."
            : "No se encontró todavía una fotografía suficientemente válida para este establecimiento."
        }), { headers });

      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          openai_called: false,
          error: error.message
        }), { status: 500, headers });
      }
    }

    if (
      url.pathname === "/media-enrich-destination" &&
      request.method === "GET"
    ) {
      try {
        const place = (url.searchParams.get("place") || "").trim();
        const country = (url.searchParams.get("country") || "").trim();
        const mediaToken = (url.searchParams.get("media_token") || "").trim();

        if (!MEDIA_ENRICH_TOKEN || mediaToken !== MEDIA_ENRICH_TOKEN) {
          return new Response(JSON.stringify({
            ok: false,
            error: "media_token no válido",
            openai_called: false
          }), { status: 403, headers });
        }

        if (!place) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Falta place",
            openai_called: false
          }), { status: 400, headers });
        }

        const placeKey = destinationKey(place, country);
        const row = await env.DB.prepare(`
          SELECT research_json
          FROM destination_research
          WHERE place_key = ?
          LIMIT 1
        `).bind(placeKey).first();

        if (!row) {
          return new Response(JSON.stringify({
            ok: false,
            error: "El destino no existe en destination_research",
            place_key: placeKey,
            openai_called: false
          }), { status: 404, headers });
        }

        const research = parseStoredJson(row.research_json) || {};
        const restaurants = Array.isArray(research?.gastronomy?.restaurants)
          ? research.gastronomy.restaurants
          : [];
        const overnight = Array.isArray(research?.overnight)
          ? research.overnight
          : [];

        const entities = [
          ...restaurants.map(x => ({ ...x, entity_type: "restaurant" })),
          ...overnight.map(x => ({ ...x, entity_type: "overnight" }))
        ].filter(x => x?.name && x?.website);

        await ensureDestinationMediaTable();

        const results = [];
        for (const entity of entities) {
          const mediaKey = [
            placeKey,
            normalizeKey(entity.entity_type),
            normalizeKey(entity.name)
          ].join("|");

          let best = null;
          let error = null;
          try {
            best = await discoverOfficialMediaDeep(
              entity.website,
              entity.name,
              entity.entity_type
            );
          } catch (e) {
            error = e.message;
          }

          await env.DB.prepare(`
            INSERT INTO destination_media (
              media_key, place_key, entity_name, entity_type,
              website_url, image_url, source_page_url, source_method,
              score, verified_exact, fetched_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(media_key) DO UPDATE SET
              website_url = excluded.website_url,
              image_url = excluded.image_url,
              source_page_url = excluded.source_page_url,
              source_method = excluded.source_method,
              score = excluded.score,
              verified_exact = excluded.verified_exact,
              fetched_at = CURRENT_TIMESTAMP
          `).bind(
            mediaKey,
            placeKey,
            entity.name,
            entity.entity_type,
            entity.website,
            best?.image_url || null,
            best?.source_page_url || entity.website,
            best?.source_method || null,
            Number.isFinite(best?.score) ? best.score : null,
            best?.image_url ? 1 : 0
          ).run();

          results.push({
            name: entity.name,
            type: entity.entity_type,
            website: entity.website,
            found: Boolean(best?.image_url),
            image_url: best?.image_url || null,
            source_page_url: best?.source_page_url || entity.website,
            source_method: best?.source_method || null,
            score: Number.isFinite(best?.score) ? best.score : null,
            error
          });
        }

        const found = results.filter(x => x.found).length;
        return new Response(JSON.stringify({
          ok: true,
          source: "official-web-enrichment",
          openai_called: false,
          place,
          country: country || null,
          place_key: placeKey,
          entities_total: results.length,
          images_found: found,
          images_missing: results.length - found,
          results,
          message: "Enriquecimiento multimedia terminado sin OpenAI. Los resultados se han guardado en D1."
        }), { headers });

      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          openai_called: false,
          error: error.message
        }), { status: 500, headers });
      }
    }

    if (
      url.pathname === "/media-cache" &&
      request.method === "GET"
    ) {
      try {
        const place = (url.searchParams.get("place") || "").trim();
        const country = (url.searchParams.get("country") || "").trim();
        if (!place) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Falta place",
            openai_called: false
          }), { status: 400, headers });
        }

        await ensureDestinationMediaTable();
        const placeKey = destinationKey(place, country);
        const result = await env.DB.prepare(`
          SELECT entity_id, entity_name, entity_type, website_url, image_url,
                 source_page_url, source_method, score, verified_exact, fetched_at
          FROM destination_media
          WHERE place_key = ?
          ORDER BY entity_type, entity_name
        `).bind(placeKey).all();

        return new Response(JSON.stringify({
          ok: true,
          source: "D1-destination-media",
          openai_called: false,
          place_key: placeKey,
          count: result.results?.length || 0,
          media: result.results || []
        }), { headers });
      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          openai_called: false,
          error: error.message
        }), { status: 500, headers });
      }
    }

    // Diagnóstico de la caché de investigación (no llama a OpenAI)
    // Ejemplo: /research-cache?place=Salzburg&country=Austria
    if (
      url.pathname === "/research-cache" &&
      request.method === "GET"
    ) {
      try {
        const place = (url.searchParams.get("place") || "").trim();
        const country = (url.searchParams.get("country") || "").trim();

        if (!place) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Falta el parámetro place"
          }), {
            status: 400,
            headers
          });
        }

        const placeKey = destinationKey(place, country);

        const cached = await env.DB.prepare(`
          SELECT
            id,
            place_key,
            place_name,
            country_code,
            latitude,
            longitude,
            research_json,
            researched_at,
            expires_at
          FROM destination_research
          WHERE place_key = ?
          LIMIT 1
        `).bind(placeKey).first();

        if (!cached) {
          return new Response(JSON.stringify({
            ok: false,
            found: false,
            place_key: placeKey,
            error: "Destino no encontrado en caché"
          }), {
            status: 404,
            headers
          });
        }

        const storedResearch = parseStoredJson(cached.research_json) || {};

        return new Response(JSON.stringify({
          ok: true,
          found: true,
          source: "cache-diagnostic",
          openai_called: false,
          place_key: cached.place_key,
          place: cached.place_name,
          country: cached.country_code,
          researched_at: cached.researched_at,
          expires_at: cached.expires_at,
          cache_valid: cacheIsValid(cached),
          web_sources: Array.isArray(storedResearch._sources)
            ? storedResearch._sources
            : [],
          generation_meta: storedResearch._generation || null,
          research: storedResearch
        }), { headers });

      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          error: error.message
        }), {
          status: 500,
          headers
        });
      }
    }

    // INVESTIGADOR IA v4 - CALIDAD PREMIUM + CACHE PERMANENTE + PROTECCIÓN DE COSTES
    // Reutiliza siempre D1 si el destino ya existe.
    // Una reinvestigación solo podrá hacerse cuando OPENAI_SPEND_ENABLED sea true
    // y se solicite de forma manual con &refresh=1.
    if (
      url.pathname === "/research-destination" &&
      request.method === "GET"
    ) {
      try {
        const place = (url.searchParams.get("place") || "").trim();
        const country = (url.searchParams.get("country") || "").trim();
        const refresh = url.searchParams.get("refresh") === "1";
        const testToken = (url.searchParams.get("test_token") || "").trim();
        const controlledParisRequest = isControlledParisRequest(
          place,
          country,
          testToken
        );
        const controlledValenciaRequest = isControlledValenciaRequest(
          place,
          country,
          testToken
        );
        let controlledParisRunId = null;
        let controlledValenciaRunId = null;

        if (!place) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Falta el parámetro place"
          }), {
            status: 400,
            headers
          });
        }

        const placeKey = destinationKey(place, country);

        if (!refresh) {
          const cached = await env.DB.prepare(`
            SELECT *
            FROM destination_research
            WHERE place_key = ?
            LIMIT 1
          `).bind(placeKey).first();

          if (cacheIsValid(cached)) {
            const storedResearch = parseStoredJson(cached.research_json) || {};

            return new Response(JSON.stringify({
              ok: true,
              investigator: "Rutas Campings & Areas IA",
              source: "cache",
              cached: true,
              place: cached.place_name,
              country: cached.country_code || country || null,
              researched_at: cached.researched_at,
              expires_at: cached.expires_at,
              research: storedResearch,
              web_sources: Array.isArray(storedResearch._sources)
                ? storedResearch._sources
                : [],
              generation_meta: storedResearch._generation || null,
              usage: {
                openai_called: false,
                input_tokens: 0,
                output_tokens: 0,
                total_tokens: 0
              }
            }), { headers });
          }
        }

        if (!openAiScopeEnabled("route")) {
          const partialTourism = await loadResearchPhase(placeKey, "destination_tourism");
          const partialPractical = await loadResearchPhase(placeKey, "destination_practical");
          if (!(partialTourism && partialPractical)) {
            return new Response(JSON.stringify({
              ok: true,
              investigator: "Rutas Campings & Areas IA",
              version: "investigador-v5-resumable",
              status: "cost_guard_active",
              source: partialTourism || partialPractical ? "D1-partial-research" : "D1-cache-only",
              openai_called: false,
              place,
              country: country || null,
              place_key: placeKey,
              completed_phases: [partialTourism ? "tourism" : null, partialPractical ? "practical" : null].filter(Boolean),
              missing_phases: [!partialTourism ? "tourism" : null, !partialPractical ? "practical" : null].filter(Boolean),
              message: partialTourism || partialPractical
                ? "La fase completada está conservada en D1. OpenAI sigue bloqueado y no se repetirá ningún gasto."
                : "Destino no disponible en D1. La protección de costes impide investigar con OpenAI.",
              next_step: "Mantener bloqueado hasta decidir conscientemente habilitar nuevas investigaciones.",
              usage: zeroUsage()
            }), { headers });
          }
        }

        if (controlledParisRequest) {
          const claim = await claimControlledParisTest();

          if (!claim.claimed) {
            return new Response(JSON.stringify({
              ok: true,
              investigator: "Rutas Campings & Areas IA",
              version: "investigador-v4-premium",
              status: "controlled_test_already_used",
              source: "D1-cache-only",
              openai_called: false,
              place,
              country: country || null,
              place_key: placeKey,
              controlled_test: {
                key: CONTROLLED_PARIS_TEST_KEY,
                status: claim.row?.status || "unknown",
                started_at: claim.row?.started_at || null,
                finished_at: claim.row?.finished_at || null
              },
              message: "La prueba controlada de París ya fue reclamada. No se realizará otra llamada de pago.",
              usage: zeroUsage()
            }), { headers });
          }

          controlledParisRunId = claim.run_id;
        }

        if (controlledValenciaRequest) {
          const claim = await claimControlledValenciaTest();

          if (!claim.claimed) {
            return new Response(JSON.stringify({
              ok: true,
              investigator: "Rutas Campings & Areas IA",
              version: "investigador-v4-premium",
              status: "controlled_test_already_used",
              source: "D1-cache-only",
              openai_called: false,
              place,
              country: country || null,
              place_key: placeKey,
              controlled_test: {
                key: CONTROLLED_VALENCIA_TEST_KEY,
                status: claim.row?.status || "unknown",
                started_at: claim.row?.started_at || null,
                finished_at: claim.row?.finished_at || null
              },
              message: "La prueba controlada de Valencia ya fue reclamada. No se realizará otra llamada de pago.",
              usage: zeroUsage()
            }), { headers });
          }

          controlledValenciaRunId = claim.run_id;
        }

        // Investigación Premium por fases.
        // Se separa turismo de gastronomía/pernocta para evitar respuestas monolíticas,
        // reducir el riesgo de JSON truncado y conservar la calidad editorial.
        const baseRules = `
Eres el INVESTIGADOR PREMIUM de "Rutas Campings & Áreas IA".
Investiga ${place}${country ? `, ${country}` : ""} para construir una base turística reutilizable de alta calidad para una guía de viaje de pago.

REGLAS GENERALES:
- Usa búsqueda web y prioriza turismo oficial, webs oficiales de atracciones, establecimientos y organismos públicos.
- Selecciona por RELEVANCIA TURÍSTICA REAL, nunca por simple proximidad ni para rellenar cantidad.
- No inventes nombres, URLs, direcciones, servicios, horarios ni precios. Si un dato no puede verificarse, devuelve cadena vacía.
- Todo en español.
- Calidad editorial: cada recomendación debe tener un motivo real y práctico.
- INVESTIGA TAMBIÉN CONTENIDO NARRATIVO REAL: lee las páginas oficiales y fuentes fiables para extraer hechos que permitan explicar qué es cada lugar, qué verá o experimentará el viajero, qué lo hace especial y por qué merece formar parte de una guía.
- No copies párrafos de las fuentes. Resume y reformula fielmente los hechos verificados con redacción propia.
- No rellenes huecos con conocimientos supuestos. Si una característica no está respaldada por las fuentes consultadas, no la afirmes.
- Los campos narrativos deben contener información específica del lugar, no frases genéricas que servirían para cualquier destino.
- Devuelve exclusivamente el JSON solicitado, sin texto adicional.
`;

        async function runResearchPhase(input, name, schema, maxOutputTokens, searchContextSize = "medium") {
          const response = await openAiFetch(
            "https://api.openai.com/v1/responses",
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "gpt-5.6-terra",
                max_output_tokens: maxOutputTokens,
                reasoning: { effort: "low" },
                tools: [
                  {
                    type: "web_search",
                    search_context_size: searchContextSize
                  }
                ],
                tool_choice: "required",
                include: ["web_search_call.action.sources"],
                input,
                text: {
                  format: {
                    type: "json_schema",
                    name,
                    strict: true,
                    schema
                  }
                }
              })
            }
          );

          const payload = await response.json();

          if (!response.ok) {
            const err = new Error(`OpenAI respondió con estado ${response.status} en ${name}.`);
            err.status = response.status;
            err.payload = payload;
            throw err;
          }

          const outputText = getOutputText(payload);
          let parsed = null;

          try {
            parsed = outputText ? JSON.parse(outputText) : null;
          } catch {
            parsed = null;
          }

          if (!parsed) {
            const err = new Error(`OpenAI no devolvió JSON válido en la fase ${name}.`);
            err.status = 502;
            err.payload = payload;
            err.raw_output = outputText;
            throw err;
          }

          return { payload, parsed };
        }

        const tourismSchema = {
          type: "object",
          additionalProperties: false,
          properties: {
            destination: { type: "string" },
            country: { type: "string" },
            destination_scale: { type: "string", enum: ["major_city", "city", "town", "small_place"] },
            verdict: { type: "string" },
            recommended_time: { type: "string" },
            visit_narrative: { type: "string" },
            must_see: {
              type: "array",
              maxItems: 15,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  why: { type: "string" },
                  narrative_material: { type: "string" },
                  visitor_experience: { type: "string" },
                  category: { type: "string" },
                  zone: { type: "string" },
                  recommended_minutes: { type: "integer", minimum: 15, maximum: 480 },
                  address: { type: "string" },
                  website: { type: "string" },
                  latitude: { type: ["number", "null"] },
                  longitude: { type: ["number", "null"] },
                  official_url: { type: "string" },
                  identity_status: { type: "string", enum: ["verified", "unverified"] },
                  sources: { type: "array", maxItems: 8, items: { type: "string" } },
                  photo_search_terms: { type: "array", maxItems: 4, items: { type: "string" } },
                  priority: { type: "string", enum: ["imprescindible", "recomendado", "si_hay_tiempo"] },
                  practical_info: { type: "string" }
                },
                required: [
                  "name", "why", "narrative_material", "visitor_experience", "category", "zone", "recommended_minutes", "address",
                  "website", "latitude", "longitude", "official_url", "identity_status", "sources", "photo_search_terms", "priority", "practical_info"
                ]
              }
            },
            family: {
              type: "object",
              additionalProperties: false,
              properties: {
                suitable: { type: "boolean" },
                recommendations: { type: "string" }
              },
              required: ["suitable", "recommendations"]
            },
            pets: { type: "string" },
            accessibility: { type: "string" },
            current_warnings: { type: "array", maxItems: 5, items: { type: "string" } },
            final_recommendation: { type: "string" }
          },
          required: [
            "destination", "country", "destination_scale", "verdict", "recommended_time",
            "visit_narrative", "must_see", "family", "pets", "accessibility",
            "current_warnings", "final_recommendation"
          ]
        };

        const practicalSchema = {
          type: "object",
          additionalProperties: false,
          properties: {
            local_specialties: {
              type: "array",
              maxItems: 6,
              items: { type: "string" }
            },
            restaurants: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  why: { type: "string" },
                  narrative_material: { type: "string" },
                  atmosphere_and_experience: { type: "string" },
                  specialty: { type: "string" },
                  zone: { type: "string" },
                  address: { type: "string" },
                  website: { type: "string" },
                  latitude: { type: ["number", "null"] },
                  longitude: { type: ["number", "null"] },
                  official_url: { type: "string" },
                  identity_status: { type: "string", enum: ["verified", "unverified"] },
                  sources: { type: "array", maxItems: 8, items: { type: "string" } },
                  price_level: { type: "string", enum: ["economico", "medio", "especial"] }
                },
                required: ["name", "why", "narrative_material", "atmosphere_and_experience", "specialty", "zone", "address", "website", "latitude", "longitude", "official_url", "identity_status", "sources", "price_level"]
              }
            },
            overnight: {
              type: "array",
              maxItems: 6,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  type: { type: "string" },
                  address: { type: "string" },
                  why: { type: "string" },
                  narrative_material: { type: "string" },
                  setting_and_access: { type: "string" },
                  services: { type: "string" },
                  practical_info: { type: "string" },
                  website: { type: "string" },
                  latitude: { type: ["number", "null"] },
                  longitude: { type: ["number", "null"] },
                  official_url: { type: "string" },
                  identity_status: { type: "string", enum: ["verified", "unverified"] },
                  sources: { type: "array", maxItems: 8, items: { type: "string" } }
                },
                required: ["name", "type", "address", "why", "narrative_material", "setting_and_access", "services", "practical_info", "website", "latitude", "longitude", "official_url", "identity_status", "sources"]
              }
            }
          },
          required: ["local_specialties", "restaurants", "overnight"]
        };

        const tourismPrompt = `${baseRules}\nFASE 1 — TURISMO Y EXPERIENCIA DEL DESTINO:\n- En ciudades grandes, los iconos universalmente reconocidos y atracciones principales deben aparecer antes que monumentos menores.\n- Clasifica cada visita como imprescindible, recomendada o solo si hay tiempo.\n- Una ciudad grande debe aportar material real para varios días: normalmente entre 10 y 15 visitas relevantes.\n- Agrupa por zonas/barrios para permitir itinerarios caminables.\n- Incluye tiempo recomendado, dirección, web oficial cuando exista y términos inequívocos para fotografía.\n- PARA CADA VISITA seleccionada, abre y aprovecha su web oficial o la fuente primaria más fiable disponible. No te limites al resumen del buscador.\n- narrative_material debe reunir suficiente materia factual para redactar después una guía rica: historia y contexto, elementos concretos que se contemplan o recorren, arquitectura/paisaje/colecciones cuando proceda, rasgos singulares, curiosidades verificadas y cualquier detalle que ayude a comprender el lugar. No lo comprimas a una sola frase si las fuentes ofrecen más.\n- visitor_experience debe explicar con hechos qué encontrará realmente el viajero al llegar, qué partes merece la pena observar y qué tipo de experiencia ofrece la visita.\n- En lugares importantes, conserva varios datos específicos aunque el resultado sea largo. La prioridad es disponer de material real para una narración profunda, no ahorrar palabras.\n- Piensa en viajeros que pueden llegar tras varias horas conduciendo.\n- Familias, mascotas y accesibilidad: afirma únicamente lo verificable.\n- Horarios, cierres y avisos son volátiles: menciona solo lo importante y aconseja comprobarlo antes del viaje.`;

        const practicalPrompt = `${baseRules}\nFASE 2 — GASTRONOMÍA Y PERNOCTA:\n- Investiga especialidades locales reales con frases breves; no añadas despedidas, consejos genéricos ni texto repetitivo.\n- Selecciona restaurantes reales, variados y verificables, repartidos por zonas cuando el destino sea grande.\n- PARA CADA RESTAURANTE, consulta su web oficial cuando exista y recoge narrativa factual suficiente: tipo de cocina, especialidades concretas, historia o filosofía si está documentada, ambiente/espacios/terraza cuando esté descrito, relación con producto local y motivos reales por los que encaja en la ruta. Guarda esos hechos en narrative_material y atmosphere_and_experience; no los reduzcas a una frase genérica.\n- PARA CADA CAMPING/ÁREA, consulta su web oficial y describe con datos verificables cómo es el recinto y su entorno, parcelas o disposición, acceso, relación con el centro o las visitas, instalaciones relevantes, ventajas e inconvenientes prácticos para el vehículo. Guarda esa materia en narrative_material y setting_and_access.\n- La investigación práctica debe dar al redactor material para CONTAR la experiencia, no solo una ficha de servicios. Si la web oficial ofrece detalles útiles, consérvalos aunque el campo resulte largo.\n- VIGENCIA OBLIGATORIA: antes de incluir CADA restaurante o pernocta, comprueba con información ACTUAL que el establecimiento sigue operativo y que continúa prestando exactamente el servicio por el que se recomienda.\n- Prioriza para esta comprobación la web oficial actual del establecimiento. Si una página antigua, un resultado de buscador o un directorio contradice la web oficial actual, prevalece la información oficial actual.\n- Si hay indicios de cierre permanente, cambio de actividad, desaparición del servicio, o no puedes confirmar razonablemente que sigue operativo, NO lo incluyas: busca otra alternativa vigente.\n- Para pernoctas, no basta con que exista el recinto: confirma que ACTUALMENTE permite pernoctar/acampada al tipo de vehículo correspondiente. Un aparcamiento de larga estancia, guardería de vehículos o recinto que prohíba dormir NO es una pernocta válida.\n- Para restaurantes, confirma que ACTUALMENTE funciona como restaurante y que la web/datos corresponden al establecimiento exacto.\n- No uses como prueba suficiente una ficha antigua, una caché, una reseña histórica ni una página desactualizada cuando exista información oficial más reciente.\n- PRIORIDAD DE PRECIO: la guía está pensada para viajeros normales en camper/autocaravana, no como una guía gastronómica de lujo. Prioriza sitios buenos, típicos y de precio económico o medio.\n- En ciudades grandes, al menos 2/3 de los restaurantes deben ser "economico" o "medio". Como máximo 1 opción "especial" puede ser claramente cara y solo si aporta una experiencia excepcional.\n- Evita que restaurantes de alta cocina, estrellas Michelin, menús degustación caros o locales de lujo dominen la selección.\n- Clasifica cada restaurante en price_level: "economico", "medio" o "especial", basándote en precios actuales verificables o evidencia suficiente del posicionamiento. No inventes precios.\n- Da preferencia a cocina local, bistrós, brasseries, mercados, tabernas, trattorias, cervecerías y equivalentes locales con buena relación calidad/precio.\n- Aporta dirección, coordenadas latitude/longitude y web oficial cuando puedan verificarse.
- Cada visita, restaurante y pernocta debe tener identity_status="verified" solo si la identidad física está respaldada por sources; official_url debe ser la URL oficial exacta o cadena vacía. No inventes coordenadas ni URLs.\n- Investiga opciones reales de pernocta útiles para autocaravana/camper y camping para caravana cuando corresponda.\n- Verifica servicios y ubicación; si un dato concreto no está confirmado, déjalo vacío.\n- No repitas el mismo restaurante ni rellenes listas con opciones débiles.`;

        let tourismResult = refresh ? null : await loadResearchPhase(placeKey, "destination_tourism");
        let practicalResult = refresh ? null : await loadResearchPhase(placeKey, "destination_practical");

        // Si solo queda una fase pendiente y el gasto está bloqueado, conservamos
        // la fase terminada y explicamos exactamente qué falta. No se repite nada.
        if (!openAiScopeEnabled("route") && (!tourismResult || !practicalResult)) {
          return new Response(JSON.stringify({
            ok: true,
            investigator: "Rutas Campings & Areas IA",
            version: "investigador-v5-resumable",
            status: "cost_guard_active",
            source: "D1-partial-research",
            openai_called: false,
            place,
            country: country || null,
            place_key: placeKey,
            completed_phases: [tourismResult ? "tourism" : null, practicalResult ? "practical" : null].filter(Boolean),
            missing_phases: [!tourismResult ? "tourism" : null, !practicalResult ? "practical" : null].filter(Boolean),
            message: "La investigación parcial conservada en D1 no se perderá. OpenAI sigue bloqueado.",
            usage: zeroUsage()
          }), { headers });
        }

        try {
          if (!tourismResult) {
            const freshTourism = await runResearchPhase(
              tourismPrompt,
              "destination_tourism",
              tourismSchema,
              10000,
              "high"
            );
            tourismResult = await saveResearchPhase(placeKey, "destination_tourism", freshTourism);
          }

          if (!practicalResult) {
            const freshPractical = await runResearchPhase(
              practicalPrompt,
              "destination_practical",
              practicalSchema,
              7500,
              "high"
            );
            practicalResult = await saveResearchPhase(placeKey, "destination_practical", freshPractical);
          }
        } catch (error) {
          const phaseUsage = error?.payload?.usage || null;

          if (controlledParisRunId) {
            await finishControlledParisTest(controlledParisRunId,error.status === 502 ? "invalid_json" : "api_error",phaseUsage,error.message);
          }
          if (controlledValenciaRunId) {
            await finishControlledValenciaTest(controlledValenciaRunId,error.status === 502 ? "invalid_json" : "api_error",phaseUsage,error.message);
          }

          return new Response(JSON.stringify({
            ok: false,
            status: error.status || 502,
            error: error.message,
            raw_output: error.raw_output || null,
            usage: phaseUsage,
            completed_phases: [tourismResult ? "tourism" : null, practicalResult ? "practical" : null].filter(Boolean),
            message: "La investigación se detuvo, pero cada fase completada ya está guardada en D1 y se reutilizará en el siguiente intento."
          }), { status: error.status || 502, headers });
        }

        const tourism = tourismResult.parsed;
        const practical = practicalResult.parsed;

        const research = {
          ...tourism,
          gastronomy: {
            local_specialties: Array.isArray(practical.local_specialties) ? practical.local_specialties : [],
            restaurants: Array.isArray(practical.restaurants) ? practical.restaurants : []
          },
          overnight: sanitizeOvernightList(practical.overnight)
        };

        const usageA = tourismResult.payload?.usage || tourismResult.usage || {};
        const usageB = practicalResult.payload?.usage || practicalResult.usage || {};
        const combinedUsage = {
          input_tokens: Number(usageA.input_tokens || 0) + Number(usageB.input_tokens || 0),
          output_tokens: Number(usageA.output_tokens || 0) + Number(usageB.output_tokens || 0),
          total_tokens: Number(usageA.total_tokens || 0) + Number(usageB.total_tokens || 0),
          output_tokens_details: {
            reasoning_tokens:
              Number(usageA.output_tokens_details?.reasoning_tokens || 0) +
              Number(usageB.output_tokens_details?.reasoning_tokens || 0)
          },
          phases: {
            tourism: usageA,
            practical: usageB
          }
        };

        const data = {
          model: "gpt-5.6-terra",
          usage: combinedUsage
        };

        const webSources = [
          ...(tourismResult.sources || getWebSources(tourismResult.payload || {})),
          ...(practicalResult.sources || getWebSources(practicalResult.payload || {}))
        ].filter((source, index, array) => {
          const urlValue = source?.url || source?.source_url || JSON.stringify(source);
          return array.findIndex(candidate => {
            const candidateUrl = candidate?.url || candidate?.source_url || JSON.stringify(candidate);
            return candidateUrl === urlValue;
          }) === index;
        });

        const entityIdFor=(kind,item)=>`${kind}:${normalizeKey(placeKey)}:${normalizeKey(item?.name||"")}`;
        for(const item of (Array.isArray(research.must_see)?research.must_see:[])) item.entity_id=entityIdFor("visit",item);
        for(const item of (Array.isArray(research.gastronomy?.restaurants)?research.gastronomy.restaurants:[])) item.entity_id=entityIdFor("restaurant",item);
        for(const item of (Array.isArray(research.overnight)?research.overnight:[])) item.entity_id=entityIdFor("overnight",item);

        const scale = String(research.destination_scale || "");
        const visits = Array.isArray(research.must_see) ? research.must_see : [];
        const essential = visits.filter(v => v && v.priority === "imprescindible");
        const restaurants = Array.isArray(research.gastronomy?.restaurants)
          ? research.gastronomy.restaurants
          : [];
        const overnight = sanitizeOvernightList(research.overnight);
        const minVisits = scale === "major_city" ? 8 : scale === "city" ? 6 : scale === "town" ? 4 : 2;
        const minEssential = scale === "major_city" ? 4 : scale === "city" ? 3 : 1;
        const minRestaurants = scale === "major_city" ? 4 : scale === "city" ? 3 : 1;
        const tourismProblems = [];
        const practicalProblems = [];

        if (visits.length < minVisits) tourismProblems.push(`visitas insuficientes: ${visits.length}/${minVisits}`);
        if (essential.length < minEssential) tourismProblems.push(`imprescindibles insuficientes: ${essential.length}/${minEssential}`);
        if (visits.some(v => String(v?.identity_status || "") !== "verified")) tourismProblems.push("hay visitas sin identidad física verificada");
        if (visits.some(v => !Number.isFinite(Number(v?.latitude)) || !Number.isFinite(Number(v?.longitude)))) tourismProblems.push("faltan coordenadas verificadas en visitas");
        if (visits.some(v => !Array.isArray(v?.sources) || !v.sources.length)) tourismProblems.push("faltan fuentes en visitas");
        if (visits.some(v => !Array.isArray(v?.photo_search_terms) || v.photo_search_terms.length === 0)) {
          tourismProblems.push("faltan términos de búsqueda fotográfica en alguna visita");
        }

        if (restaurants.length < minRestaurants) practicalProblems.push(`restaurantes insuficientes: ${restaurants.length}/${minRestaurants}`);
        const affordableRestaurants = restaurants.filter(r => r && ["economico", "medio"].includes(String(r.price_level || "")));
        const specialRestaurants = restaurants.filter(r => r && String(r.price_level || "") === "especial");
        const minAffordableRestaurants = restaurants.length >= 6 ? 4 : restaurants.length >= 4 ? 3 : restaurants.length >= 2 ? 1 : 0;
        if (affordableRestaurants.length < minAffordableRestaurants) practicalProblems.push(`faltan restaurantes económicos/medios: ${affordableRestaurants.length}/${minAffordableRestaurants}`);
        if (specialRestaurants.length > 1) practicalProblems.push(`demasiados restaurantes de precio especial: ${specialRestaurants.length}/1`);
        if (overnight.length < 1) practicalProblems.push("sin opciones de pernocta verificadas");
        const practicalEntities = [...restaurants, ...overnight];
        if (practicalEntities.some(e => String(e?.identity_status || "") !== "verified")) practicalProblems.push("hay entidades prácticas sin identidad física verificada");
        if (practicalEntities.some(e => !Number.isFinite(Number(e?.latitude)) || !Number.isFinite(Number(e?.longitude)))) practicalProblems.push("faltan coordenadas verificadas en entidades prácticas");
        if (practicalEntities.some(e => !Array.isArray(e?.sources) || !e.sources.length)) practicalProblems.push("faltan fuentes en entidades prácticas");

        const qualityProblems = [...tourismProblems, ...practicalProblems];

        if (qualityProblems.length > 0) {
          if(tourismProblems.length) await markResearchPhaseQuality(placeKey,"destination_tourism","quality_failed",tourismProblems.join("; "));
          else await markResearchPhaseQuality(placeKey,"destination_tourism","quality_approved",null);
          if(practicalProblems.length) await markResearchPhaseQuality(placeKey,"destination_practical","quality_failed",practicalProblems.join("; "));
          else await markResearchPhaseQuality(placeKey,"destination_practical","quality_approved",null);
          if (controlledParisRunId) {
            await finishControlledParisTest(
              controlledParisRunId,
              "quality_rejected",
              data.usage || null,
              `Control de calidad rechazó la investigación: ${qualityProblems.join("; ")}`
            );
          }
          if (controlledValenciaRunId) {
            await finishControlledValenciaTest(
              controlledValenciaRunId,
              "quality_rejected",
              data.usage || null,
              `Control de calidad rechazó la investigación: ${qualityProblems.join("; ")}`
            );
          }

          return new Response(JSON.stringify({
            ok: false,
            status: "quality_rejected",
            openai_called: true,
            place,
            country: country || null,
            quality_problems: qualityProblems,
            message: "La investigación no alcanza el mínimo de calidad Premium y NO se ha guardado en D1.",
            usage: data.usage || null
          }), { status: 422, headers });
        }

        await markResearchPhaseQuality(placeKey,"destination_tourism","quality_approved",null);
        await markResearchPhaseQuality(placeKey,"destination_practical","quality_approved",null);

        const id = crypto.randomUUID();

        // Conservación prolongada. La validez real la decide cacheIsValid(),
        // que reutiliza cualquier investigación existente hasta una actualización manual.
        const expiresAt = new Date(
          Date.now() + 3650 * 24 * 60 * 60 * 1000
        ).toISOString();

        await env.DB.prepare(`
          INSERT INTO destination_research (
            id,
            place_key,
            place_name,
            country_code,
            latitude,
            longitude,
            research_json,
            researched_at,
            expires_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
          ON CONFLICT(place_key) DO UPDATE SET
            place_name = excluded.place_name,
            country_code = excluded.country_code,
            research_json = excluded.research_json,
            researched_at = CURRENT_TIMESTAMP,
            expires_at = excluded.expires_at
        `).bind(
          id,
          placeKey,
          place,
          country || null,
          null,
          null,
          JSON.stringify({
            ...research,
            _sources: webSources,
            _quality: {
              gate: "premium-v1",
              passed: true,
              destination_scale: scale,
              visits: visits.length,
              essential: essential.length,
              restaurants: restaurants.length,
              overnight: overnight.length
            },
            _generation: {
              model: data.model || "gpt-5.6-terra",
              search_context_size: "medium",
              usage: data.usage || null
            }
          }),
          expiresAt
        ).run();

        await ensureResearchPhaseTable();
        for(const entity of [...visits,...restaurants,...overnight]){
          const entityId=String(entity?.entity_id||"").trim();
          if(!entityId) continue;
          for(const sourceUrl of (Array.isArray(entity?.sources)?entity.sources:[])){
            const u=String(sourceUrl||"").trim();
            if(!/^https?:\/\//i.test(u)) continue;
            await env.DB.prepare(`INSERT OR REPLACE INTO entity_sources(entity_id,source_url,source_type,verified_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`).bind(entityId,u,u===entity?.official_url?"official":"source").run();
          }
        }

        if (controlledParisRunId) {
          await finishControlledParisTest(
            controlledParisRunId,
            "completed",
            data.usage || null,
            "Investigación Premium de París completada en 2 fases y guardada en D1."
          );
        }
        if (controlledValenciaRunId) {
          await finishControlledValenciaTest(
            controlledValenciaRunId,
            "completed",
            data.usage || null,
            "Investigación Premium de Valencia completada en 2 fases, validada y guardada en D1."
          );
        }

        // v31: al terminar una investigación nueva, deja creada automáticamente
        // la cola multimedia del destino. Esta sincronización solo usa D1 y NO llama a OpenAI.
        const mediaQueue = await syncDestinationMediaJobs(place, country, research);

        return new Response(JSON.stringify({
          ok: true,
          investigator: "Rutas Campings & Areas IA",
          model: data.model,
          source: "openai",
          cached: false,
          place,
          country: country || null,
          research,
          web_sources: webSources,
          generation_meta: {
            model: data.model || "gpt-5.6-terra",
            search_context_size: "medium",
            usage: data.usage || null
          },
          cache: {
            saved: true,
            place_key: placeKey,
            expires_at: expiresAt
          },
          media_queue: mediaQueue,
          usage: data.usage || null
        }), { headers });

      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          error: error.message
        }), {
          status: 500,
          headers
        });
      }
    }

    // v34: restaurado el criterio original de la demo:
    // cada stop calculado por el máximo de horas de conducción es un FIN DE JORNADA
    // real y debe disponer de investigación/multimedia D1 antes de planificar.
    // No existen "paradas técnicas" generadas por este reparto diario.
    // PLANIFICADOR v1
    // Construye un plan diario a partir de un itinerario objetivo ya calculado
    // (por ejemplo, desde Geoapify) y reutiliza investigación guardada en D1.
    // No investiga destinos nuevos: indica cuáles faltan para que el Investigador
    // los complete antes de redactar la guía final.
    if (
      url.pathname === "/plan-route" &&
      request.method === "POST"
    ) {
      try {
        const data = await request.json();

        const origin = String(data.origin || "").trim();
        const finalDestination = String(data.destination || "").trim();
        const country = String(data.country || "").trim();
        const vehicle = String(data.vehicle || "autocaravana").trim();
        const adults = Number.isFinite(Number(data.adults))
          ? Number(data.adults)
          : 1;
        const children = Array.isArray(data.children) ? data.children : [];
        const pet = Boolean(data.pet);
        const maxDrivingHours = Number.isFinite(Number(data.max_driving_hours))
          ? Number(data.max_driving_hours)
          : null;
        const pace = String(data.pace || "equilibrado").trim();
        const interests = Array.isArray(data.interests)
          ? data.interests.map(v => String(v)).slice(0, 20)
          : [];
        const overnightPreference = String(
          data.overnight_preference || ""
        ).trim();
        const tripDays = Number.isFinite(Number(data.trip_days))
          ? Math.max(1, Math.round(Number(data.trip_days)))
          : null;
        const requestedVia = Array.isArray(data.requested_via)
          ? data.requested_via.map(v => String(v).trim()).filter(Boolean).slice(0, 20)
          : [];
        const startDate = String(data.start_date || "").trim();
        const childrenCount = Number.isFinite(Number(data.children_count)) ? Math.max(0, Number(data.children_count)) : children.length;
        const familyRecommendations = Boolean(data.family_recommendations);
        const overnightTypes = Array.isArray(data.overnight_types) ? data.overnight_types.map(v=>String(v).trim()).filter(Boolean).slice(0,10) : [];
        const avoidPreferences = Array.isArray(data.avoid_preferences) ? data.avoid_preferences.map(v=>String(v).trim()).filter(Boolean).slice(0,20) : [];
        const budget = String(data.budget || "").trim();
        const visualContent = String(data.visual_content || "").trim();
        const userNotes = String(data.user_notes || "").trim();

        const rawStops = Array.isArray(data.stops) ? data.stops : [];
        const requestPoints = Array.isArray(data.request_points) ? data.request_points : [];
        const stages = Array.isArray(data.stages) ? data.stages : rawStops;
        const vacationDays = Array.isArray(data.vacation_days) ? data.vacation_days : [];
        const routeContractVersion = String(data.route_contract_version || "").trim();

        if (!origin || !finalDestination) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Faltan origin o destination"
          }), {
            status: 400,
            headers
          });
        }

        if (rawStops.length === 0) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Falta stops: el Planificador necesita las etapas/destinos calculados por el routing"
          }), {
            status: 400,
            headers
          });
        }

        const stops = rawStops
          .map((stop, index) => ({
            day: Number.isFinite(Number(stop.day))
              ? Number(stop.day)
              : index + 1,
            place: String(stop.place || stop.name || "").trim(),
            country: String(stop.country || country || "").trim(),
            driving_km: Number.isFinite(Number(stop.driving_km))
              ? Number(stop.driving_km)
              : null,
            driving_minutes: Number.isFinite(Number(stop.driving_minutes))
              ? Number(stop.driving_minutes)
              : null,
            is_final: Boolean(stop.is_final) ||
              normalizeKey(stop.place || stop.name) === normalizeKey(finalDestination),
            driving_stage_id: String(stop.driving_stage_id || `stage-${index + 1}`).trim(),
            base_id: String(stop.base_id || `base-${index + 1}`).trim(),
            overnight_id: String(stop.overnight_id || stop.overnight?.id || "").trim() || null,
            lat: Number.isFinite(Number(stop.lat)) ? Number(stop.lat) : null,
            lon: Number.isFinite(Number(stop.lon)) ? Number(stop.lon) : null,
            requested_waypoint: Boolean(stop.requested_waypoint),
            stay_eligible: Boolean(stop.stay_eligible),
            overnight: stop.overnight && typeof stop.overnight === "object" ? {
              id: String(stop.overnight.id || stop.overnight_id || "").trim() || null,
              nombre: String(stop.overnight.nombre || stop.overnight.name || "").trim(),
              tipo: String(stop.overnight.tipo || stop.overnight.type || "").trim(),
              lat: Number.isFinite(Number(stop.overnight.lat)) ? Number(stop.overnight.lat) : null,
              lon: Number.isFinite(Number(stop.overnight.lon)) ? Number(stop.overnight.lon) : null
            } : null
          }))
          .filter(stop => stop.place);

        if (stops.length === 0) {
          return new Response(JSON.stringify({
            ok: false,
            error: "No hay paradas válidas en stops"
          }), {
            status: 400,
            headers
          });
        }

        if (routeContractVersion !== "route-contract-v3" || vacationDays.length !== tripDays) {
          return new Response(JSON.stringify({
            ok: true,
            planner: "Rutas Campings & Areas IA",
            status: "invalid_route_contract",
            openai_called: false,
            message: "La ruta no incluye un esqueleto logístico v3 completo. No se planificará ni se reutilizará caché v2.",
            usage: zeroUsage()
          }), { headers });
        }

        const routeContractRequest = {
          route_contract_version: routeContractVersion,
          request_points: requestPoints,
          stages,
          vacation_days: vacationDays,
          max_driving_hours: maxDrivingHours,
          minimum_required_days: Math.max(1, Number(data?.minimum_required_days)||stages.length)
        };
        const v3ContractCheck=validateRouteContractV3(routeContractRequest);
        if(!v3ContractCheck.ok){
          return new Response(JSON.stringify({ok:true,status:"invalid_route_contract",openai_called:false,contract_error:v3ContractCheck,usage:zeroUsage()}),{headers});
        }
        const normalizedSkeleton = normalizeVacationDays(routeContractRequest);
        const displaySkeleton = vacationDays.map((day, index) => ({
          vacation_day_id: String(day?.vacation_day_id || "").trim(),
          logistics_id: String(day?.logistics_id || "").trim(),
          day: Number(day?.day) || index + 1,
          travel_date: String(day?.travel_date || "").trim(),
          day_type: String(day?.day_type || "").trim(),
          place: String(day?.place || "").trim(),
          country: String(day?.country || "").trim(),
          driving_stage_id: day?.driving_stage_id == null ? null : String(day.driving_stage_id).trim(),
          base_id: String(day?.base_id || "").trim(),
          overnight_id: day?.overnight_id == null ? null : String(day.overnight_id).trim(),
          driving_stage_index: Number(day?.driving_stage_index) || 0,
          base_stop_index: Number(day?.base_stop_index) || 0,
          driving_km: Math.max(0, Math.round(Number(day?.driving_km) || 0)),
          driving_minutes: Math.max(0, Math.round(Number(day?.driving_minutes) || 0)),
          request_point_id: day?.request_point_id == null ? null : String(day.request_point_id).trim(),
          is_final: Boolean(day?.is_final),
          requested_waypoint: Boolean(day?.requested_waypoint),
          candidate_highlights: Array.isArray(day?.candidate_highlights)
            ? day.candidate_highlights.slice(0, 8).map(item => ({
                name: String(item?.name || "").trim(),
                category: String(item?.category || "").trim(),
                score: Number.isFinite(Number(item?.score)) ? Number(item.score) : 0
              })).filter(item => item.name)
            : []
        }));
        if (normalizedSkeleton.length !== tripDays || normalizedSkeleton.some((d,i)=>d.day!==i+1 || !d.logistics_id || !d.place)) {
          return new Response(JSON.stringify({
            ok: true, planner: "Rutas Campings & Areas IA", status: "invalid_route_contract",
            openai_called: false, message: "El esqueleto diario contiene días incompletos o desordenados.", usage: zeroUsage()
          }), { headers });
        }
        const maxContractMinutes = Math.round(maxDrivingHours * 60);
        if (normalizedSkeleton.some(d=>d.driving_minutes>maxContractMinutes+1 || (d.day_type==="visita"&&(d.driving_minutes!==0||d.driving_km!==0)))) {
          return new Response(JSON.stringify({
            ok: true, planner: "Rutas Campings & Areas IA", status: "invalid_route_contract",
            openai_called: false, message: "El esqueleto diario no respeta el límite de conducción.", usage: zeroUsage()
          }), { headers });
        }

        // v41: antes de mirar un plan independiente, buscamos una guía completa
        // ya terminada para esta misma ruta/perfil. La guía conserva dentro el
        // plan exacto que se usó al redactarla, por lo que ese plan es la fuente
        // autoritativa para reutilizar una ruta completa sin mezclar versiones.
        const completedBundleRequest = {
          schema_version: "route-bundle-v2",
          route_contract_version: routeContractVersion,
          request_points: requestPoints,
          stages,
          vacation_days: vacationDays,
          trip_days: tripDays,
          requested_via: requestedVia,
          start_date: startDate,
          children_count: childrenCount,
          family_recommendations: familyRecommendations,
          overnight_types: overnightTypes,
          avoid_preferences: avoidPreferences,
          budget,
          visual_content: visualContent,
          user_notes: userNotes,
          origin: normalizeKey(origin),
          destination: normalizeKey(finalDestination),
          vehicle: normalizeKey(vehicle),
          adults,
          children,
          pet,
          max_driving_hours: maxDrivingHours,
          pace: normalizeKey(pace),
          interests: interests.map(normalizeKey).sort(),
          overnight_preference: normalizeKey(overnightPreference),
          stops
        };

        const completedBundle = await getCompletedGuideBundle(completedBundleRequest);
        if (completedBundle.found && completedBundle.plan) {
          return new Response(JSON.stringify({
            ok: true,
            planner: "Rutas Campings & Areas IA",
            version: "planificador-v4-route-contract",
            status: "planned",
            openai_called: false,
            research_source: "D1-completed-route",
            cache: {
              hit: true,
              type: "completed_guide_bundle",
              cache_key: completedBundle.cache_key,
              created_at: completedBundle.created_at,
              updated_at: completedBundle.updated_at
            },
            plan: completedBundle.plan,
            resolved_stops: completedBundle.resolved_stops || stops,
            usage: zeroUsage()
          }), { headers });
        }

        // v40: D1 PRIMERO. Un plan de ruta ya guardado debe devolverse antes
        // de comprobar si la investigación de sus ciudades ha caducado o cambiado.
        // La ruta pagada/guardada es un artefacto completo e independiente.
        const earlyPlanCacheRequest = {
          schema_version: "planificador-v4-route-contract",
          route_contract_version: routeContractVersion,
          request_points: requestPoints,
          stages,
          vacation_days: vacationDays,
          trip_days: tripDays,
          requested_via: requestedVia,
          start_date: startDate,
          children_count: childrenCount,
          family_recommendations: familyRecommendations,
          overnight_types: overnightTypes,
          avoid_preferences: avoidPreferences,
          budget,
          visual_content: visualContent,
          user_notes: userNotes,
          origin: normalizeKey(origin),
          destination: normalizeKey(finalDestination),
          vehicle: normalizeKey(vehicle),
          adults,
          children,
          pet,
          max_driving_hours: maxDrivingHours,
          pace: normalizeKey(pace),
          interests: interests.map(normalizeKey).sort(),
          overnight_preference: normalizeKey(overnightPreference),
          stops: stops.map(stop => ({
            day: stop.day,
            place: normalizeKey(stop.place),
            country: normalizeKey(stop.country),
            driving_km: stop.driving_km,
            driving_minutes: stop.driving_minutes,
            is_final: stop.is_final
          }))
        };

        const earlyPlanCache = await getAiRouteCache("plan", earlyPlanCacheRequest);
        if (earlyPlanCache.found && earlyPlanCache.response) {
          return new Response(JSON.stringify({
            ...earlyPlanCache.response,
            openai_called: false,
            cache: {
              hit: true,
              type: "plan",
              cache_key: earlyPlanCache.cache_key,
              source_cache_key: earlyPlanCache.source_cache_key || earlyPlanCache.cache_key,
              created_at: earlyPlanCache.created_at,
              updated_at: earlyPlanCache.updated_at
            },
            resolved_stops: earlyPlanCache.resolved_stops || stops,
            usage: zeroUsage()
          }), { headers });
        }

        const cacheRows = [];
        const missingResearch = [];

        // v52: el Planificador solo puede elegir visitas con investigación real.
        // Investigamos una vez cada base utilizada por el esqueleto de vacaciones,
        // no cada día repetido ni únicamente el destino final.
        const researchStops = [];
        const seenResearchStops = new Set();
        for (const day of displaySkeleton) {
          const key = `${day.place}|${day.country}`;
          if (seenResearchStops.has(key)) continue;
          seenResearchStops.add(key);
          const stop = stops[Math.max(0, day.base_stop_index - 1)] || {};
          researchStops.push({
            day: day.day,
            place: day.place,
            country: day.country,
            driving_km: stop.driving_km || 0,
            driving_minutes: stop.driving_minutes || 0,
            is_final: Boolean(day.is_final)
          });
        }

        for (const stop of researchStops) {
          const key = destinationKey(stop.place, stop.country);
          const row = await env.DB.prepare(`
            SELECT
              place_key,
              place_name,
              country_code,
              research_json,
              researched_at,
              expires_at
            FROM destination_research
            WHERE place_key = ?
            LIMIT 1
          `).bind(key).first();

          if (cacheIsValid(row)) {
            const stored = parseStoredJson(row.research_json) || {};
            cacheRows.push({
              ...stop,
              place_key: key,
              researched_at: row.researched_at,
              expires_at: row.expires_at,
              research: stored
            });
          } else {
            missingResearch.push({
              day: stop.day,
              place: stop.place,
              country: stop.country,
              place_key: key,
              reason: row ? "cache_expired" : "not_in_cache"
            });
          }
        }

        // Bloqueamos si falta cualquiera de las bases reales del esqueleto.
        // Cada base se investiga una sola vez y se reutiliza en todos sus días.
        if (missingResearch.length > 0) {
          return new Response(JSON.stringify({
            ok: true,
            planner: "Rutas Campings & Areas IA",
            status: "research_required",
            openai_called: false,
            origin,
            destination: finalDestination,
            stops,
            cached_destinations: cacheRows.map(row => ({
              day: row.day,
              place: row.place,
              country: row.country,
              researched_at: row.researched_at,
              expires_at: row.expires_at
            })),
            missing_research: missingResearch,
            next_step: "Investigar únicamente los destinos de missing_research y volver a llamar a /plan-route"
          }), { headers });
        }

        // v36: la multimedia nunca bloquea la creación de una ruta.
        // Las fotos verificadas que ya existan en D1 se reutilizan al renderizar.
        // Si una entidad no tiene una foto válida, la guía continúa sin esa foto.
        // Este flujo no lanza búsquedas multimedia ni llamadas a OpenAI.

        const planCacheRequest = {
          schema_version: "planificador-v4-route-contract",
          route_contract_version: routeContractVersion,
          request_points: requestPoints,
          stages,
          vacation_days: vacationDays,
          trip_days: tripDays,
          requested_via: requestedVia,
          start_date: startDate,
          children_count: childrenCount,
          family_recommendations: familyRecommendations,
          overnight_types: overnightTypes,
          avoid_preferences: avoidPreferences,
          budget,
          visual_content: visualContent,
          user_notes: userNotes,
          origin: normalizeKey(origin),
          destination: normalizeKey(finalDestination),
          vehicle: normalizeKey(vehicle),
          adults,
          children,
          pet,
          max_driving_hours: maxDrivingHours,
          pace: normalizeKey(pace),
          interests: interests.map(normalizeKey).sort(),
          overnight_preference: normalizeKey(overnightPreference),
          stops: stops.map(stop => ({
            day: stop.day,
            place: normalizeKey(stop.place),
            country: normalizeKey(stop.country),
            driving_km: stop.driving_km,
            driving_minutes: stop.driving_minutes,
            is_final: stop.is_final
          })),
          research_signature: cacheRows.map(row => ({
            place_key: row.place_key,
            researched_at: row.researched_at
          }))
        };

        const planCache = await getAiRouteCache(
          "plan",
          planCacheRequest
        );

        if (planCache.found && planCache.response) {
          return new Response(JSON.stringify({
            ...planCache.response,
            openai_called: false,
            cache: {
              hit: true,
              type: "plan",
              cache_key: planCache.cache_key,
              source_cache_key: planCache.source_cache_key || planCache.cache_key,
              created_at: planCache.created_at,
              updated_at: planCache.updated_at
            },
            resolved_stops: planCache.resolved_stops || stops,
            usage: zeroUsage()
          }), { headers });
        }

        if (!openAiScopeEnabled("route")) {
          return new Response(JSON.stringify({
            ok: true,
            planner: "Rutas Campings & Areas IA",
            version: "planificador-v4-route-contract",
            status: "cost_guard_active",
            openai_called: false,
            research_source: "D1-cache",
            cached_destinations: cacheRows.map(row => ({
              day: row.day,
              place: row.place,
              country: row.country,
              researched_at: row.researched_at
            })),
            route_cache: {
              hit: false,
              cache_key: planCache.cache_key
            },
            message: "La investigación existe en D1, pero este plan concreto aún no está en la caché de rutas. OpenAI está bloqueado para evitar gastos.",
            usage: zeroUsage()
          }), { headers });
        }

        const compactResearch = cacheRows.map(row => {
          const r = row.research || {};
          return {
            day: row.day,
            place: row.place,
            country: row.country,
            driving_km: row.driving_km,
            driving_minutes: row.driving_minutes,
            is_final: row.is_final,
            verdict: r.verdict || "",
            recommended_time: r.recommended_time || "",
            visit_narrative: r.visit_narrative || "",
            must_see: Array.isArray(r.must_see) ? r.must_see : [],
            family: r.family || null,
            gastronomy: r.gastronomy || null,
            overnight: sanitizeOvernightListForTypes(r.overnight, overnightTypes),
            pets: r.pets || "",
            accessibility: r.accessibility || "",
            current_warnings: Array.isArray(r.current_warnings)
              ? r.current_warnings
              : [],
            final_recommendation: r.final_recommendation || ""
          };
        });

        // r5: el schema del Planner se cierra por jornada, no con un catálogo global.
        // Cada day_N solo puede elegir entidades verificadas de la base correspondiente.
        const plannerDayKeys = [];
        const plannerDaySchemas = {};
        const plannerDayCatalogs = {};

        for (let i = 0; i < displaySkeleton.length; i++) {
          const skeletonDay = displaySkeleton[i] || {};
          const dayKey = `day_${i + 1}`;
          const researchRow = findResearchForPlace(compactResearch, skeletonDay.place, skeletonDay.country);
          const research = researchRow || {};
          const highlights = Array.isArray(research.must_see) ? research.must_see : [];
          const restaurants = Array.isArray(research.gastronomy?.restaurants) ? research.gastronomy.restaurants : [];
          const overnights = Array.isArray(research.overnight) ? research.overnight : [];

          const allEntities = [...highlights, ...restaurants, ...overnights];
          const entityIds = [...new Set(allEntities.map(x => String(x?.entity_id || "").trim()).filter(Boolean))];
          const highlightIds = [...new Set(highlights.map(x => String(x?.entity_id || "").trim()).filter(Boolean))];
          const restaurantIds = [...new Set(restaurants.map(x => String(x?.entity_id || "").trim()).filter(Boolean))];
          const overnightIds = [...new Set(overnights.map(x => String(x?.entity_id || "").trim()).filter(Boolean))];

          const entityById = Object.fromEntries(allEntities
            .map(x => [String(x?.entity_id || "").trim(), x])
            .filter(([id]) => id));
          plannerDayKeys.push(dayKey);
          plannerDayCatalogs[dayKey] = { entityById };

          plannerDaySchemas[dayKey] = {
            type: "object",
            additionalProperties: false,
            properties: {
              day: { type: "integer", enum: [i + 1] },
              vacation_day_id: { type: "string", enum: [String(skeletonDay.vacation_day_id || "")] },
              logistics_id: { type: "string", enum: [String(skeletonDay.logistics_id || "")] },
              travel_date: { type: "string", enum: [String(skeletonDay.travel_date || "")] },
              request_point_id: { type: ["string", "null"], enum: [skeletonDay.request_point_id == null ? null : String(skeletonDay.request_point_id)] },
              driving_stage_id: { type: ["string", "null"], enum: [skeletonDay.driving_stage_id == null ? null : String(skeletonDay.driving_stage_id)] },
              base_id: { type: "string", enum: [String(skeletonDay.base_id || "")] },
              overnight_id: { type: ["string", "null"], enum: [skeletonDay.overnight_id == null ? null : String(skeletonDay.overnight_id)] },
              stage: { type: "string" },
              place: { type: "string", enum: [String(skeletonDay.place || "")] },
              country: { type: "string", enum: [String(skeletonDay.country || "")] },
              driving_summary: { type: "string" },
              day_type: { type: "string", enum: [String(skeletonDay.day_type || "")] },
              driving_stage_index: { type: "integer", enum: [Number(skeletonDay.driving_stage_index) || 0] },
              base_stop_index: { type: "integer", enum: [Number(skeletonDay.base_stop_index) || 0] },
              driving_km: { type: "integer", enum: [Math.max(0, Math.round(Number(skeletonDay.driving_km) || 0))] },
              driving_minutes: { type: "integer", enum: [Math.max(0, Math.round(Number(skeletonDay.driving_minutes) || 0))] },
              is_final: { type: "boolean", enum: [Boolean(skeletonDay.is_final)] },
              timing_logic: { type: "string" },
              visit_plan: { type: "string" },
              selected_highlights: {
                type: "array",
                maxItems: highlightIds.length ? 4 : 0,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    entity_id: highlightIds.length
                      ? { type: "string", enum: highlightIds }
                      : { type: "string" },
                    reason: { type: "string" }
                  },
                  required: ["entity_id", "reason"]
                }
              },
              family_plan: { type: "string" },
              gastronomy_plan: { type: "string" },
              restaurant_choice_ids: {
                type: "array",
                maxItems: restaurantIds.length ? 2 : 0,
                items: restaurantIds.length
                  ? { type: "string", enum: restaurantIds }
                  : { type: "string" }
              },
              overnight_plan: { type: "string" },
              overnight_choice_ids: {
                type: "array",
                maxItems: overnightIds.length ? 2 : 0,
                items: overnightIds.length
                  ? { type: "string", enum: overnightIds }
                  : { type: "string" }
              },
              practical_note: { type: "string" }
            },
            required: [
              "day",
              "vacation_day_id",
              "logistics_id",
              "travel_date",
              "request_point_id",
              "driving_stage_id",
              "base_id",
              "overnight_id",
              "stage",
              "place",
              "country",
              "driving_summary",
              "day_type",
              "driving_stage_index",
              "base_stop_index",
              "driving_km",
              "driving_minutes",
              "is_final",
              "timing_logic",
              "visit_plan",
              "selected_highlights",
              "family_plan",
              "gastronomy_plan",
              "restaurant_choice_ids",
              "overnight_plan",
              "overnight_choice_ids",
              "practical_note"
            ]
          };
        }

        const plannerPrompt = `
Eres el PLANIFICADOR de "Rutas Campings & Áreas IA".
Tu trabajo NO es investigar Internet. Ya recibes investigación verificada y
un itinerario objetivo calculado por routing. Debes convertirlo en un plan
diario coherente y realista para una guía de viaje por carretera.

PERFIL:
- Origen: ${origin}
- Destino final: ${finalDestination}
- Vehículo: ${vehicle}
- Fecha de salida: ${startDate || "no indicada"}
- Duración TOTAL de las vacaciones: ${tripDays ?? "no indicada"} días
- Adultos: ${adults}
- Número de niños: ${childrenCount}
- Niños/edades conocidas: ${JSON.stringify(children)}
- Recomendaciones especiales para niños: ${familyRecommendations ? "sí" : "no"}
- Mascota: ${pet ? "sí" : "no"}
- Máximo de conducción/día: ${maxDrivingHours ?? "no indicado"} horas
- Ritmo: ${pace}
- Intereses seleccionados, todos importantes: ${interests.join(", ") || "no indicados"}
- Tipos de pernocta permitidos: ${overnightTypes.join(", ") || "no indicados"}
- Preferencia de pernocta: ${overnightPreference || "no indicada"}
- Evitar si es posible: ${avoidPreferences.join(", ") || "nada indicado"}
- Presupuesto: ${budget || "no indicado"}
- Contenido visual: ${visualContent || "no indicado"}
- Instrucciones adicionales del usuario: ${userNotes || "ninguna"}

REGLAS:
- OBLIGATORIO: days es un objeto con claves fijas day_1, day_2, etc. Debes completar exactamente las claves solicitadas por el schema.
- trip_days representa la duración total de las VACACIONES, no el mínimo de días necesarios para conducir.
- El ESQUELETO LOGÍSTICO INMUTABLE ya contiene la distribución exacta de días de conducción y de estancia. No debes redistribuir días.
- Los stops son las bases de las jornadas de conducción; vacation_days fija también los días completos de estancia y su posición exacta en el viaje.
- La elección de visitas, gastronomía y pernocta debe adaptarse a esa logística ya decidida, nunca al revés.
- Debes tener en cuenta CADA interés seleccionado por separado. A lo largo del viaje intenta cubrir todos los que tengan opciones verificadas en INVESTIGACIÓN DISPONIBLE; no los sustituyas por la idea genérica de “turismo”.
- Si viajan niños y las recomendaciones especiales están activadas, prioriza también actividades apropiadas para sus edades entre las opciones verificadas.
- Respeta los tipos de pernocta permitidos; no recomiendes un tipo que el usuario no haya seleccionado.
- Las opciones de “evitar si es posible” son preferencias, no prohibiciones absolutas; aplícalas cuando no destruyan la lógica del recorrido.
- El presupuesto y las instrucciones adicionales del usuario deben influir en las elecciones siempre que los datos verificados permitan hacerlo.
- Respeta el orden de las etapas y los tiempos/km recibidos. No inventes carreteras.
- Una parada tras varias horas de conducción debe ser agradable y realista; no
  intentes meter un día turístico completo en una tarde corta.
- Distingue claramente etapa de conducción, visita y destino final.
- Selecciona pocos imprescindibles con lógica horaria, no vuelques toda la investigación.
- Si viajan niños, adapta actividades a sus edades; no conviertas la ruta en infantil
  si no corresponde. Si hay mascota, usa únicamente información verificada recibida.
- La gastronomía forma parte del día: incluye especialidades y como máximo dos
  restaurantes cuando encajen de verdad.
- Para pernocta, elige como máximo dos opciones de la investigación recibida y
  explica cuál encaja mejor con el vehículo/perfil.
- No inventes nombres, servicios, horarios, precios ni hechos que no estén en los datos.
- Todo en español.
- El resultado debe parecer la estructura inteligente de una guía personalizada,
  no una lista genérica de tarjetas.

ESQUELETO LOGÍSTICO INMUTABLE:
${JSON.stringify(displaySkeleton)}

INVESTIGACIÓN DISPONIBLE:
${JSON.stringify(compactResearch)}

REGLA DE CONTRATO:
- Debes copiar literalmente en cada día: vacation_day_id, logistics_id, travel_date, request_point_id, place, country, day_type, driving_stage_id, base_id, overnight_id, driving_stage_index, base_stop_index, driving_km, driving_minutes e is_final desde ESQUELETO LOGÍSTICO INMUTABLE.
- No puedes mover una jornada de conducción, cambiar una base, alterar km/minutos ni convertir un día de visita en conducción.
- candidate_highlights del esqueleto son candidatos gratuitos de Geoapify; solo incluyas en el plan entidades respaldadas por INVESTIGACIÓN DISPONIBLE.
- Cada jornada solo puede seleccionar entidades del catálogo cerrado de SU PROPIA jornada.
- selected_highlights debe usar únicamente entity_id permitidos por el schema; no escribas el nombre, se reconstruirá desde la investigación verificada.
- restaurant_choice_ids y overnight_choice_ids deben contener únicamente IDs permitidos por el schema de esa jornada.
- No escribas nombres de restaurantes/pernoctas como selección estructurada; el Worker los reconstruirá desde los IDs verificados.

Devuelve exclusivamente el JSON solicitado.
`;

        const plannerRequestForFingerprint={...data,stops,vacation_days:vacationDays};
        const plannerFingerprint=await generationFingerprint("planner",plannerRequestForFingerprint);
        const plannerPreviousFailure=await previousSystematicFailure(plannerFingerprint,"planner");
        const plannerHistoricalFailure=await previousHistoricalSystematicFailure("planner",plannerRequestForFingerprint);
        const plannerRejections=await rejectedGenerationState("planner",plannerRequestForFingerprint);

        // Misma revisión: nunca repetir automáticamente una generación ya fallida/rechazada.
        if(plannerPreviousFailure || plannerRejections.current){
          const failureReason=plannerPreviousFailure?.failure_reason || plannerRejections.current?.failure_reason || "unknown";
          return new Response(JSON.stringify(blockedGenerationPayload("planner",failureReason,plannerRejections.current?.pipeline_revision||GENERATION_PIPELINE_REVISION)),{headers});
        }

        // Revisión anterior: conservar el historial, pero no pagar de nuevo de forma silenciosa.
        // Incluye tanto rechazos v3 como systematic_failure heredados de r1/r2.
        // Solo una autorización explícita y consciente permite probar el código actualizado.
        if(plannerHistoricalFailure && data.allow_previous_revision_retry!==true){
          return new Response(JSON.stringify(previousRevisionFailurePayload("planner",plannerHistoricalFailure)),{headers});
        }
        if(plannerRejections.historical && data.allow_previous_revision_retry!==true){
          return new Response(JSON.stringify(previousRevisionRejectionPayload("planner",plannerRejections.historical)),{headers});
        }

        const openaiResponse = await openAiFetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-5.6-luna",
              reasoning: { effort: "medium" },
              input: plannerPrompt,
              text: {
                format: {
                  type: "json_schema",
                  name: "route_plan",
                  strict: true,
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      route_title: { type: "string" },
                      route_summary: { type: "string" },
                      planning_notes: {
                        type: "array",
                        maxItems: 6,
                        items: { type: "string" }
                      },
                      days: {
                        type: "object",
                        additionalProperties: false,
                        properties: plannerDaySchemas,
                        required: plannerDayKeys
                      },
                      final_advice: { type: "string" }
                    },
                    required: [
                      "route_title",
                      "route_summary",
                      "planning_notes",
                      "days",
                      "final_advice"
                    ]
                  }
                }
              }
            })
          }
        );

        const aiData = await openaiResponse.json();

        if (!openaiResponse.ok) {
          return new Response(JSON.stringify({
            ok: false,
            status: openaiResponse.status,
            error: aiData
          }), {
            status: openaiResponse.status,
            headers
          });
        }

        const outputText = getOutputText(aiData);
        let plan = null;

        try {
          plan = outputText ? JSON.parse(outputText) : null;
        } catch {
          plan = null;
        }

        // r5: adaptar la salida cerrada day_N al contrato interno histórico.
        // Los nombres y selected_entity_ids se derivan únicamente del catálogo verificado,
        // nunca de texto libre del modelo.
        if (plan && plan.days && !Array.isArray(plan.days)) {
          const rawDays = plan.days;
          const normalizedDays = [];
          for (const dayKey of plannerDayKeys) {
            const rawDay = rawDays?.[dayKey];
            if (!rawDay || typeof rawDay !== "object") {
              plan = null;
              break;
            }
            const catalog = plannerDayCatalogs[dayKey] || {};
            const selectedHighlights = (Array.isArray(rawDay.selected_highlights) ? rawDay.selected_highlights : []).map(item => {
              const entityId = String(item?.entity_id || "");
              const entity = catalog.entityById?.[entityId] || null;
              return {
                entity_id: entityId,
                name: String(entity?.name || ""),
                reason: String(item?.reason || "")
              };
            });

            const restaurantChoiceIds = Array.isArray(rawDay.restaurant_choice_ids) ? rawDay.restaurant_choice_ids.map(String) : [];
            const overnightChoiceIds = Array.isArray(rawDay.overnight_choice_ids) ? rawDay.overnight_choice_ids.map(String) : [];
            const restaurantChoices = restaurantChoiceIds.map(id => String(catalog.entityById?.[id]?.name || "")).filter(Boolean);
            const overnightChoices = overnightChoiceIds.map(id => String(catalog.entityById?.[id]?.name || "")).filter(Boolean);

            const selectedIds = new Set([
              ...selectedHighlights.map(x => x.entity_id).filter(Boolean),
              ...restaurantChoiceIds.filter(Boolean),
              ...overnightChoiceIds.filter(Boolean)
            ]);

            const { restaurant_choice_ids, overnight_choice_ids, ...legacyDay } = rawDay;
            normalizedDays.push({
              ...legacyDay,
              selected_highlights: selectedHighlights,
              selected_entity_ids: [...selectedIds],
              restaurant_choices: restaurantChoices,
              overnight_choices: overnightChoices
            });
          }
          if (plan) plan = { ...plan, days: normalizedDays };
        }

        if (!plan) {
          await saveRejectedGeneration("planner",plannerRequestForFingerprint,plannerFingerprint,"invalid_json",null,outputText,aiData.usage||null);
          await recordGenerationAttempt(plannerFingerprint,"planner","systematic_failure","invalid_json");
          return new Response(JSON.stringify({
            ok: false,
            error: "El Planificador no devolvió un JSON válido",
            raw_output: outputText,
            usage: aiData.usage || null
          }), {
            status: 502,
            headers
          });
        }

        const planContract = validatePlanContract(plan, {
          route_contract_version: routeContractVersion,
          vacation_days: vacationDays,
          max_driving_hours: maxDrivingHours,
          minimum_required_days: Math.max(1, Number(data?.minimum_required_days)||stages.length)
        });
        if (!planContract.ok) {
          await saveRejectedGeneration("planner",plannerRequestForFingerprint,plannerFingerprint,`contract:${planContract.reason||"unknown"}`,plan,null,aiData.usage||null);
          await recordGenerationAttempt(plannerFingerprint,"planner","systematic_failure",`contract:${planContract.reason||"unknown"}`);
          return new Response(JSON.stringify({
            ok: true,
            planner: "Rutas Campings & Areas IA",
            version: "planificador-v4-route-contract",
            status: "invalid_route_contract",
            openai_called: true,
            contract_error: planContract,
            message: "El Planificador intentó alterar la logística calculada. El plan se rechaza y no se guarda ni se envía al Redactor.",
            usage: aiData.usage || null
          }), { headers });
        }

        const planSelections = validatePlanVerifiedSelections(plan, compactResearch, overnightTypes);
        if (!planSelections.ok) {
          await saveRejectedGeneration("planner",plannerRequestForFingerprint,plannerFingerprint,`verified_content:${planSelections.reason||"unknown"}`,plan,null,aiData.usage||null);
          await recordGenerationAttempt(plannerFingerprint,"planner","systematic_failure",`verified_content:${planSelections.reason||"unknown"}`);
          return new Response(JSON.stringify({
            ok: true,
            planner: "Rutas Campings & Areas IA",
            version: "planificador-v4-route-contract",
            status: "invalid_verified_content",
            openai_called: true,
            content_error: planSelections,
            message: "El Planificador incluyó una visita, restaurante o pernocta que no está respaldada por la investigación verificada. El plan se rechaza y no se guarda.",
            usage: aiData.usage || null
          }), { headers });
        }

        const planResponse = {
          ok: true,
          planner: "Rutas Campings & Areas IA",
          version: "planificador-v4-route-contract",
          status: "planned",
          model: aiData.model || "gpt-5.6-luna",
          openai_called: true,
          research_source: "D1-cache",
          cached_destinations: cacheRows.map(row => ({
            day: row.day,
            place: row.place,
            country: row.country,
            researched_at: row.researched_at
          })),
          cache: {
            hit: false,
            saved: true,
            type: "plan",
            cache_key: planCache.cache_key
          },
          plan,
          usage: aiData.usage || null
        };

        const planSaveResult = await saveAiRouteCache(
          "plan",
          planCache.cache_key,
          planCache.request_json,
          planResponse
        );
        await recordGenerationAttempt(plannerFingerprint,"planner","success",null);
        if (planSaveResult?.primary_saved === false) {
          planResponse.cache.primary_saved = false;
          planResponse.cache.recovery_saved = true;
          planResponse.cache.warning = "D1 principal no aceptó la escritura; respuesta preservada en recuperación v3.";
        }

        return new Response(JSON.stringify(planResponse), { headers });

      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          error: error.message
        }), {
          status: 500,
          headers
        });
      }
    }

    // REDACTOR v2
    // Convierte un plan ya generado + investigación D1 en una guía editorial completa.
    // No hace búsquedas web nuevas: reutiliza exclusivamente la investigación almacenada.
    // Mejora enlaces integrados, datos prácticos, plan visual y control de URLs/idioma.
    if (
      url.pathname === "/write-route" &&
      request.method === "POST"
    ) {
      try {
        const data = await request.json();

        const origin = String(data.origin || "").trim();
        const finalDestination = String(data.destination || "").trim();
        const vehicle = String(data.vehicle || "autocaravana").trim();
        const adults = Number.isFinite(Number(data.adults))
          ? Number(data.adults)
          : 1;
        const children = Array.isArray(data.children) ? data.children : [];
        const pet = Boolean(data.pet);
        const pace = String(data.pace || "equilibrado").trim();
        const interests = Array.isArray(data.interests)
          ? data.interests.map(v => String(v)).slice(0, 20)
          : [];
        const overnightPreference = String(
          data.overnight_preference || ""
        ).trim();
        const tripDays = Number.isFinite(Number(data.trip_days))
          ? Math.max(1, Math.round(Number(data.trip_days)))
          : null;
        const requestedVia = Array.isArray(data.requested_via)
          ? data.requested_via.map(v => String(v).trim()).filter(Boolean).slice(0, 20)
          : [];
        const startDate = String(data.start_date || "").trim();
        const childrenCount = Number.isFinite(Number(data.children_count)) ? Math.max(0, Number(data.children_count)) : children.length;
        const familyRecommendations = Boolean(data.family_recommendations);
        const overnightTypes = Array.isArray(data.overnight_types) ? data.overnight_types.map(v=>String(v).trim()).filter(Boolean).slice(0,10) : [];
        const avoidPreferences = Array.isArray(data.avoid_preferences) ? data.avoid_preferences.map(v=>String(v).trim()).filter(Boolean).slice(0,20) : [];
        const budget = String(data.budget || "").trim();
        const visualContent = String(data.visual_content || "").trim();
        const userNotes = String(data.user_notes || "").trim();

        const plan = data.plan && typeof data.plan === "object"
          ? data.plan
          : null;
        const rawStops = Array.isArray(data.stops) ? data.stops : [];
        const requestPoints = Array.isArray(data.request_points) ? data.request_points : [];
        const stages = Array.isArray(data.stages) ? data.stages : rawStops;
        const vacationDays = Array.isArray(data.vacation_days) ? data.vacation_days : [];
        const routeContractVersion = String(data.route_contract_version || "").trim();

        if (!origin || !finalDestination) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Faltan origin o destination"
          }), {
            status: 400,
            headers
          });
        }

        if (!plan || !Array.isArray(plan.days)) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Falta plan: el Redactor necesita el resultado del Planificador"
          }), {
            status: 400,
            headers
          });
        }

        if (rawStops.length === 0) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Falta stops: el Redactor necesita las etapas de la ruta"
          }), {
            status: 400,
            headers
          });
        }

        const writerV3Contract=validateRouteContractV3({route_contract_version:routeContractVersion,request_points:requestPoints,stages,vacation_days:vacationDays});
        if(!writerV3Contract.ok){
          return new Response(JSON.stringify({ok:true,status:"invalid_route_contract",openai_called:false,contract_error:writerV3Contract,usage:zeroUsage()}),{headers});
        }

        const incomingPlanContract = validatePlanContract(plan, {
          route_contract_version: routeContractVersion,
          vacation_days: vacationDays,
          max_driving_hours: Number(data.max_driving_hours)
        });
        if (!incomingPlanContract.ok) {
          return new Response(JSON.stringify({
            ok: true,
            writer: "Rutas Campings & Areas IA",
            version: "redactor-v5-route-contract",
            status: "invalid_route_contract",
            openai_called: false,
            contract_error: incomingPlanContract,
            message: "El Redactor ha bloqueado un plan que no coincide exactamente con la logística calculada.",
            usage: zeroUsage()
          }), { headers });
        }

        const stops = rawStops
          .map((stop, index) => ({
            day: Number.isFinite(Number(stop.day))
              ? Number(stop.day)
              : index + 1,
            place: String(stop.place || stop.name || "").trim(),
            country: String(stop.country || "").trim(),
            driving_km: Number.isFinite(Number(stop.driving_km))
              ? Number(stop.driving_km)
              : null,
            driving_minutes: Number.isFinite(Number(stop.driving_minutes))
              ? Number(stop.driving_minutes)
              : null,
            is_final: Boolean(stop.is_final),
            driving_stage_id: String(stop.driving_stage_id || `stage-${index + 1}`).trim(),
            base_id: String(stop.base_id || `base-${index + 1}`).trim(),
            overnight_id: String(stop.overnight_id || stop.overnight?.id || "").trim() || null,
            lat: Number.isFinite(Number(stop.lat)) ? Number(stop.lat) : null,
            lon: Number.isFinite(Number(stop.lon)) ? Number(stop.lon) : null,
            requested_waypoint: Boolean(stop.requested_waypoint),
            stay_eligible: Boolean(stop.stay_eligible),
            overnight: stop.overnight && typeof stop.overnight === "object" ? {
              id: String(stop.overnight.id || stop.overnight_id || "").trim() || null,
              nombre: String(stop.overnight.nombre || stop.overnight.name || "").trim(),
              tipo: String(stop.overnight.tipo || stop.overnight.type || "").trim(),
              lat: Number.isFinite(Number(stop.overnight.lat)) ? Number(stop.overnight.lat) : null,
              lon: Number.isFinite(Number(stop.overnight.lon)) ? Number(stop.overnight.lon) : null
            } : null
          }))
          .filter(stop => stop.place);

        // v41: una guía ya terminada se recupera como bundle coherente.
        // No exigimos que el plan recibido sea byte-a-byte idéntico a otro plan
        // independiente: si ruta y perfil coinciden, devolvemos la guía junto con
        // el plan que originalmente la generó y sus stops almacenados.
        const completedGuideRequest = {
          schema_version: "route-bundle-v2",
          route_contract_version: routeContractVersion,
          request_points: requestPoints,
          stages,
          vacation_days: vacationDays,
          trip_days: tripDays,
          requested_via: requestedVia,
          start_date: startDate,
          children_count: childrenCount,
          family_recommendations: familyRecommendations,
          overnight_types: overnightTypes,
          avoid_preferences: avoidPreferences,
          budget,
          visual_content: visualContent,
          user_notes: userNotes,
          origin: normalizeKey(origin),
          destination: normalizeKey(finalDestination),
          vehicle: normalizeKey(vehicle),
          adults,
          children,
          pet,
          max_driving_hours: Number.isFinite(Number(data.max_driving_hours))
            ? Number(data.max_driving_hours)
            : null,
          pace: normalizeKey(pace),
          interests: interests.map(normalizeKey).sort(),
          overnight_preference: normalizeKey(overnightPreference),
          stops,
          plan
        };

        const completedGuide = await getCompletedGuideBundle(completedGuideRequest);
        if (completedGuide.found && completedGuide.response?.guide) {
          const safeCompletedGuideResponse = sanitizeGuideOvernightResponse(completedGuide.response, overnightTypes);
          return new Response(JSON.stringify({
            ...safeCompletedGuideResponse,
            openai_called: false,
            research_source: "D1-completed-route",
            cache: {
              hit: true,
              type: "completed_guide_bundle",
              cache_key: completedGuide.cache_key,
              created_at: completedGuide.created_at,
              updated_at: completedGuide.updated_at
            },
            resolved_stops: completedGuide.resolved_stops || stops,
            resolved_plan: completedGuide.plan,
            usage: zeroUsage()
          }), { headers });
        }

        // v40: D1 PRIMERO también para la guía. Si la guía completa ya fue
        // redactada y guardada, se devuelve tal cual antes de validar de nuevo
        // destination_research. Así una actualización/caducidad de investigación
        // o multimedia nunca invalida una guía ya pagada.
        const earlyGuideCacheRequest = {
          schema_version: "redactor-v4-route-contract",
          route_contract_version: routeContractVersion,
          request_points: requestPoints,
          stages,
          vacation_days: vacationDays,
          trip_days: tripDays,
          requested_via: requestedVia,
          start_date: startDate,
          children_count: childrenCount,
          family_recommendations: familyRecommendations,
          overnight_types: overnightTypes,
          avoid_preferences: avoidPreferences,
          budget,
          visual_content: visualContent,
          user_notes: userNotes,
          origin: normalizeKey(origin),
          destination: normalizeKey(finalDestination),
          vehicle: normalizeKey(vehicle),
          adults,
          children,
          pet,
          pace: normalizeKey(pace),
          interests: interests.map(normalizeKey).sort(),
          overnight_preference: normalizeKey(overnightPreference),
          stops: stops.map(stop => ({
            day: stop.day,
            place: normalizeKey(stop.place),
            country: normalizeKey(stop.country),
            driving_km: stop.driving_km,
            driving_minutes: stop.driving_minutes,
            is_final: stop.is_final
          })),
          plan
        };

        const earlyGuideCache = await getAiRouteCache("guide", earlyGuideCacheRequest);
        if (earlyGuideCache.found && earlyGuideCache.response) {
          return new Response(JSON.stringify({
            ...earlyGuideCache.response,
            openai_called: false,
            research_source: "D1-cache",
            cache: {
              hit: true,
              type: "guide",
              cache_key: earlyGuideCache.cache_key,
              source_cache_key: earlyGuideCache.source_cache_key || earlyGuideCache.cache_key,
              created_at: earlyGuideCache.created_at,
              updated_at: earlyGuideCache.updated_at
            },
            resolved_stops: earlyGuideCache.resolved_stops || stops,
            usage: zeroUsage()
          }), { headers });
        }

        const researchRows = [];
        const missingResearch = [];

        for (const stop of stops) {
          const key = destinationKey(stop.place, stop.country);
          const row = await env.DB.prepare(`
            SELECT
              place_key,
              place_name,
              country_code,
              research_json,
              researched_at,
              expires_at
            FROM destination_research
            WHERE place_key = ?
            LIMIT 1
          `).bind(key).first();

          if (!cacheIsValid(row)) {
            missingResearch.push({
              day: stop.day,
              place: stop.place,
              country: stop.country,
              place_key: key,
              reason: row ? "cache_expired" : "not_in_cache"
            });
            continue;
          }

          const r = parseStoredJson(row.research_json) || {};

          researchRows.push({
            day: stop.day,
            place: stop.place,
            country: stop.country,
            driving_km: stop.driving_km,
            driving_minutes: stop.driving_minutes,
            is_final: stop.is_final,
            researched_at: row.researched_at,
            verdict: r.verdict || "",
            recommended_time: r.recommended_time || "",
            visit_narrative: r.visit_narrative || "",
            must_see: Array.isArray(r.must_see) ? r.must_see : [],
            family: r.family || null,
            gastronomy: r.gastronomy || null,
            overnight: sanitizeOvernightListForTypes(r.overnight, overnightTypes),
            pets: r.pets || "",
            accessibility: r.accessibility || "",
            current_warnings: Array.isArray(r.current_warnings)
              ? r.current_warnings
              : [],
            final_recommendation: r.final_recommendation || "",
            sources: Array.isArray(r._sources)
              ? r._sources.slice(0, 30)
              : []
          });
        }

        if (missingResearch.length > 0) {
          return new Response(JSON.stringify({
            ok: true,
            writer: "Rutas Campings & Areas IA",
            version: "redactor-v2",
            status: "research_required",
            openai_called: false,
            missing_research: missingResearch,
            next_step: "Completar la investigación pendiente y volver a llamar a /write-route"
          }), { headers });
        }

        const guideCacheRequest = {
          schema_version: "redactor-v4-route-contract",
          route_contract_version: routeContractVersion,
          request_points: requestPoints,
          stages,
          vacation_days: vacationDays,
          trip_days: tripDays,
          requested_via: requestedVia,
          start_date: startDate,
          children_count: childrenCount,
          family_recommendations: familyRecommendations,
          overnight_types: overnightTypes,
          avoid_preferences: avoidPreferences,
          budget,
          visual_content: visualContent,
          user_notes: userNotes,
          origin: normalizeKey(origin),
          destination: normalizeKey(finalDestination),
          vehicle: normalizeKey(vehicle),
          adults,
          children,
          pet,
          pace: normalizeKey(pace),
          interests: interests.map(normalizeKey).sort(),
          overnight_preference: normalizeKey(overnightPreference),
          stops: stops.map(stop => ({
            day: stop.day,
            place: normalizeKey(stop.place),
            country: normalizeKey(stop.country),
            driving_km: stop.driving_km,
            driving_minutes: stop.driving_minutes,
            is_final: stop.is_final
          })),
          plan,
          research_signature: researchRows.map(row => ({
            place: normalizeKey(row.place),
            country: normalizeKey(row.country),
            researched_at: row.researched_at
          }))
        };

        const guideCache = await getAiRouteCache(
          "guide",
          guideCacheRequest
        );

        if (guideCache.found && guideCache.response) {
          const safeCachedGuideResponse = sanitizeGuideOvernightResponse(guideCache.response, overnightTypes);
          return new Response(JSON.stringify({
            ...safeCachedGuideResponse,
            openai_called: false,
            research_source: "D1-cache",
            cache: {
              hit: true,
              type: "guide",
              cache_key: guideCache.cache_key,
              source_cache_key: guideCache.source_cache_key || guideCache.cache_key,
              created_at: guideCache.created_at,
              updated_at: guideCache.updated_at
            },
            resolved_stops: guideCache.resolved_stops || stops,
            usage: zeroUsage()
          }), { headers });
        }

        if (!openAiScopeEnabled("route")) {
          return new Response(JSON.stringify({
            ok: true,
            writer: "Rutas Campings & Areas IA",
            version: "redactor-v5-route-contract",
            status: "cost_guard_active",
            openai_called: false,
            research_source: "D1-cache",
            route_cache: {
              hit: false,
              cache_key: guideCache.cache_key
            },
            message: "Los destinos están en D1, pero esta guía exacta aún no está en la caché de rutas. OpenAI está bloqueado para evitar gastos.",
            media_status: "pending_enrichment",
            usage: zeroUsage()
          }), { headers });
        }

        // Lista blanca de URLs verificadas. El Redactor puede reutilizarlas,
        // pero cualquier URL inventada se elimina de forma determinista.
        const allowedUrlMap = new Map();

        function normalizeUrlForCompare(value) {
          if (!value || typeof value !== "string") return null;
          try {
            const u = new URL(value.trim());
            if (u.protocol !== "http:" && u.protocol !== "https:") return null;
            u.hash = "";
            let result = u.toString();
            if (result.endsWith("/")) result = result.slice(0, -1);
            return result;
          } catch {
            return null;
          }
        }

        function addAllowedUrl(value) {
          const normalized = normalizeUrlForCompare(value);
          if (!normalized) return;
          if (!allowedUrlMap.has(normalized)) {
            allowedUrlMap.set(normalized, String(value).trim());
          }
        }

        for (const row of researchRows) {
          for (const source of row.sources || []) {
            addAllowedUrl(source?.url);
          }
          for (const restaurant of row.gastronomy?.restaurants || []) {
            addAllowedUrl(restaurant?.website);
          }
          for (const place of row.overnight || []) {
            addAllowedUrl(place?.website);
          }
        }

        const verifiedUrls = Array.from(allowedUrlMap.values());

        // r6: el Redactor recibe un schema cerrado por jornada, igual que el Planner.
        // Solo puede seleccionar entity_id ya elegidos por el plan para ESA jornada.
        // Nombres, URLs y toda la logistica se reconstruyen de forma determinista despues.
        const writerDaySchemas = {};
        const writerDayKeys = [];
        const writerEntityMapsByDay = [];

        for (let i = 0; i < plan.days.length; i++) {
          const planDay = plan.days[i] || {};
          const dayKey = `day_${i + 1}`;
          writerDayKeys.push(dayKey);

          const row = findResearchForPlace(researchRows, planDay.place, planDay.country);
          const selectedIds = new Set(
            (Array.isArray(planDay.selected_entity_ids) ? planDay.selected_entity_ids : [])
              .map(id => String(id || "").trim())
              .filter(Boolean)
          );

          const highlights = (Array.isArray(row?.must_see) ? row.must_see : [])
            .filter(entity => selectedIds.has(String(entity?.entity_id || "")));
          const restaurants = (Array.isArray(row?.gastronomy?.restaurants) ? row.gastronomy.restaurants : [])
            .filter(entity => selectedIds.has(String(entity?.entity_id || "")));
          const overnights = sanitizeOvernightListForTypes(
            Array.isArray(row?.overnight) ? row.overnight : [],
            overnightTypes
          ).filter(entity => selectedIds.has(String(entity?.entity_id || "")));

          const highlightIds = highlights.map(entity => String(entity?.entity_id || "")).filter(Boolean);
          const restaurantIds = restaurants.map(entity => String(entity?.entity_id || "")).filter(Boolean);
          const overnightIds = overnights.map(entity => String(entity?.entity_id || "")).filter(Boolean);

          writerEntityMapsByDay.push({
            highlights: new Map(highlights.map(entity => [String(entity.entity_id), entity])),
            restaurants: new Map(restaurants.map(entity => [String(entity.entity_id), entity])),
            overnight: new Map(overnights.map(entity => [String(entity.entity_id), entity]))
          });

          const highlightItemSchema = {
            type: "object",
            additionalProperties: false,
            properties: {
              entity_id: highlightIds.length
                ? { type: "string", enum: highlightIds }
                : { type: "string" },
              description: { type: "string" },
              practical_note: { type: "string" }
            },
            required: ["entity_id", "description", "practical_note"]
          };

          const restaurantItemSchema = {
            type: "object",
            additionalProperties: false,
            properties: {
              entity_id: restaurantIds.length
                ? { type: "string", enum: restaurantIds }
                : { type: "string" },
              why: { type: "string" },
              specialty: { type: "string" },
              practical_note: { type: "string" }
            },
            required: ["entity_id", "why", "specialty", "practical_note"]
          };

          const overnightItemSchema = {
            type: "object",
            additionalProperties: false,
            properties: {
              entity_id: overnightIds.length
                ? { type: "string", enum: overnightIds }
                : { type: "string" },
              why: { type: "string" },
              services: { type: "string" },
              practical_info: { type: "string" }
            },
            required: ["entity_id", "why", "services", "practical_info"]
          };

          writerDaySchemas[dayKey] = {
            type: "object",
            additionalProperties: false,
            properties: {
              heading: { type: "string" },
              driving: { type: "string" },
              recommended_visit_time: { type: "string" },
              arrival_strategy: { type: "string" },
              pace_advice: { type: "string" },
              opening_narrative: { type: "string" },
              visit_story: { type: "string" },
              highlights: {
                type: "array",
                maxItems: highlightIds.length ? Math.min(4, highlightIds.length) : 0,
                items: highlightItemSchema
              },
              family_section: { type: "string" },
              gastronomy_intro: { type: "string" },
              restaurants: {
                type: "array",
                maxItems: restaurantIds.length ? Math.min(2, restaurantIds.length) : 0,
                items: restaurantItemSchema
              },
              overnight_intro: { type: "string" },
              overnight: {
                type: "array",
                maxItems: overnightIds.length ? Math.min(2, overnightIds.length) : 0,
                items: overnightItemSchema
              },
              practical_advice: {
                type: "array",
                maxItems: 5,
                items: { type: "string" }
              },
              useful_links: {
                type: "array",
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    label: { type: "string" },
                    purpose: { type: "string" },
                    url: { type: "string" }
                  },
                  required: ["label", "purpose", "url"]
                }
              },
              visual_plan: {
                type: "object",
                additionalProperties: false,
                properties: {
                  hero: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      subject: { type: "string" },
                      purpose: { type: "string" },
                      caption: { type: "string" },
                      source_page_url: { type: "string" }
                    },
                    required: ["subject", "purpose", "caption", "source_page_url"]
                  },
                  gallery: {
                    type: "array",
                    maxItems: 3,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        subject: { type: "string" },
                        purpose: { type: "string" },
                        caption: { type: "string" },
                        source_page_url: { type: "string" }
                      },
                      required: ["subject", "purpose", "caption", "source_page_url"]
                    }
                  }
                },
                required: ["hero", "gallery"]
              }
            },
            required: [
              "heading", "driving", "recommended_visit_time", "arrival_strategy",
              "pace_advice", "opening_narrative", "visit_story", "highlights",
              "family_section", "gastronomy_intro", "restaurants", "overnight_intro",
              "overnight", "practical_advice", "useful_links", "visual_plan"
            ]
          };
        }

        const writerPrompt = `
Eres el REDACTOR v2 de "Rutas Campings & Áreas IA".
Tu trabajo es convertir un plan ya decidido y una investigación verificada en una
GUÍA PERSONALIZADA DE VIAJE POR CARRETERA de alta calidad editorial.

No investigues Internet y no inventes datos. Trabaja únicamente con PLAN,
INVESTIGACIÓN DISPONIBLE y URLS VERIFICADAS.

PERFIL DEL VIAJE:
- Origen: ${origin}
- Destino final: ${finalDestination}
- Fecha de salida: ${startDate || "no indicada"}
- Duración total: ${tripDays ?? "no indicada"} días
- Vehículo: ${vehicle}
- Adultos: ${adults}
- Número de niños: ${childrenCount}
- Niños/edades conocidas: ${JSON.stringify(children)}
- Recomendaciones especiales para niños: ${familyRecommendations ? "sí" : "no"}
- Mascota: ${pet ? "sí" : "no"}
- Ritmo: ${pace}
- Intereses seleccionados: ${interests.join(", ") || "no indicados"}
- Tipos de pernocta permitidos: ${overnightTypes.join(", ") || "no indicados"}
- Preferencia de pernocta: ${overnightPreference || "no indicada"}
- Evitar si es posible: ${avoidPreferences.join(", ") || "nada indicado"}
- Presupuesto: ${budget || "no indicado"}
- Contenido visual: ${visualContent || "no indicado"}
- Instrucciones adicionales: ${userNotes || "ninguna"}

OBJETIVO EDITORIAL:
- OBLIGATORIO: redacta exactamente las ${tripDays ?? plan.days.length} jornadas del PLAN. No reduzcas ni fusiones días.
- La logística y los nombres canónicos NO los generas tú: el Worker los inyecta de forma determinista después. Limítate a redactar el contenido editorial y a seleccionar únicamente los entity_id permitidos por el schema de cada day_N.
- Refleja de forma visible los intereses seleccionados cuando el PLAN y la investigación contengan opciones verificadas para ellos.
- Respeta tipos de pernocta, presupuesto, preferencias de evitación, recomendaciones infantiles e instrucciones adicionales del usuario.
- Debe parecer una guía preparada expresamente para estos viajeros, como una guía
  profesional entregada a un cliente, no una colección de tarjetas ni un informe.
- TEXTO Y FOTOGRAFÍAS TIENEN EL MISMO PESO EDITORIAL. Las fotos ilustran la guía; no
  sustituyen la explicación. No comprimas el contenido para que quepa en tarjetas.
- Cada día debe contar una historia práctica y descriptiva: conducción, llegada, qué
  merece la pena hacer con el tiempo REAL disponible, qué encontrará el viajero, por
  qué se recomienda, dónde comer y dónde dormir.
- Una parada intermedia debe tener una razón clara para existir.
- Diferencia una tarde después de conducir de un día turístico completo.
- Selecciona; no vuelques todos los POI de la investigación.
- Para CADA VISITA seleccionada, description debe ser narrativa, evocadora y sustancial: explica
  qué es, qué se ve o experimenta, los hechos históricos/culturales/naturales relevantes
  disponibles y por qué merece la pena en ESTA ruta. Usa activamente narrative_material y
  visitor_experience cuando existan. No los resumas a una ficha: transforma los hechos verificados
  en una narración propia que permita imaginar la visita y despierte ganas de conocerla, sin inventar.
  Un lugar principal con material suficiente puede y debe ocupar varios párrafos; una visita secundaria
  puede ser más breve. Evita descripciones de una sola frase salvo que la investigación realmente no permita más.
- Para CADA RESTAURANTE, why debe explicar por qué se ha elegido ese establecimiento
  concreto, qué tipo de experiencia o cocina ofrece, qué lo vincula al destino y por qué
  encaja en ese momento del día. Usa narrative_material y atmosphere_and_experience cuando existan.
  Cuenta qué clase de sitio encontrará el viajero y qué hace atractiva la parada; no lo reduzcas a
  “está bien situado” o a una lista de platos. specialty complementa la explicación; no la sustituye.
- Para CADA PERNOCTA, why debe explicar cómo es el camping/área, su entorno y ubicación
  respecto a la etapa, por qué es adecuada para el vehículo y qué ventajas concretas
  justifican elegirla. Usa narrative_material y setting_and_access cuando existan y describe la
  experiencia práctica de llegar y utilizar esa base. Incluso una simple área o aparcamiento debe
  quedar explicado con suficiente contexto para entender por qué se recomienda. services y
  practical_info complementan esa narrativa.
- Usa toda la información verificada disponible que sea útil. NO hagas un resumen ejecutivo de la
  investigación: conviértela en una guía de viaje completa. Puedes desarrollar varios párrafos dentro
  de un campo de texto cuando el lugar lo merezca. La longitud la marca el contenido, no una plantilla
  visual ni el número de páginas. Si una ruta necesita muchas páginas para quedar bien explicada, es correcto.
- Cada highlight, restaurante y pernocta debe usar exclusivamente uno de los entity_id permitidos por el schema específico de esa jornada. No inventes entidades, IDs ni nombres.
- NO INVENTES para enriquecer. Redacta y conecta únicamente hechos presentes en PLAN e
  INVESTIGACIÓN DISPONIBLE. Si falta un dato, omítelo en vez de rellenarlo.
- Explica por qué cada elección encaja en esa jornada.
- Evita repetir frases burocráticas como "comprueba horarios" en cada párrafo. Agrupa
  avisos volátiles en el lugar más útil y escribe con naturalidad.
- No conviertas el texto en publicidad de restaurantes, campings o atracciones.

ENLACES INTERACTIVOS:
- La futura web mostrará en azul y como enlace las palabras/lugares que tengan URL.
- Integra la URL directamente en cada highlight, restaurante, pernocta o enlace útil.
- Usa EXCLUSIVAMENTE una URL que aparezca en URLS VERIFICADAS.
- No construyas, completes, acortes ni adivines URLs.
- Si no existe URL verificada para un elemento, devuelve cadena vacía en su campo URL.

DATOS PRÁCTICOS:
- Para cada día indica duración realista de la visita, estrategia de llegada/acceso y
  una recomendación de ritmo.
- Usa horarios, cierres, restricciones, reservas o precios solo si aparecen en la
  investigación disponible y son relevantes para decidir el día.
- Marca los datos volátiles con prudencia y evita falsa precisión.

FOTOGRAFÍAS / PLAN VISUAL:
- NO inventes URLs de imágenes y NO afirmes haber descargado fotografías.
- Prepara un plan visual para que otro componente consiga después fotos reales.
- Elige un hero visual y hasta 3 imágenes secundarias por día.
- Cada elemento visual debe indicar claramente QUÉ debería mostrar la foto y por qué
  ayuda a decidir la visita.
- source_page_url solo puede usar una URL de URLS VERIFICADAS o quedar vacío.

CONTROL DE IDIOMA:
- Todo el texto visible debe estar en español natural.
- Antes de responder haz una revisión silenciosa: no deben aparecer caracteres
  cirílicos, griegos, asiáticos ni palabras de otro idioma salvo nombres propios,
  platos, calles o denominaciones oficiales que deban conservarse.
- Corrige erratas antes de producir el JSON final.

VACATION_DAYS INMUTABLES:
${JSON.stringify(vacationDays)}

PLAN DEL VIAJE:
${JSON.stringify(plan)}

INVESTIGACIÓN DISPONIBLE:
${JSON.stringify(researchRows)}

URLS VERIFICADAS:
${JSON.stringify(verifiedUrls)}

Devuelve exclusivamente el JSON solicitado.
`;

        const writerRequestForFingerprint={...data,stops,vacation_days:vacationDays,plan};
        const writerFingerprint=await generationFingerprint("writer",writerRequestForFingerprint);
        const writerPreviousFailure=await previousSystematicFailure(writerFingerprint,"writer");
        const writerHistoricalFailure=await previousHistoricalSystematicFailure("writer",writerRequestForFingerprint);
        const writerRejections=await rejectedGenerationState("writer",writerRequestForFingerprint);

        // Misma revisión: nunca repetir automáticamente una generación ya fallida/rechazada.
        if(writerPreviousFailure || writerRejections.current){
          const failureReason=writerPreviousFailure?.failure_reason || writerRejections.current?.failure_reason || "unknown";
          return new Response(JSON.stringify(blockedGenerationPayload("writer",failureReason,writerRejections.current?.pipeline_revision||GENERATION_PIPELINE_REVISION)),{headers});
        }

        // Revisión anterior: conservar el historial, pero no pagar de nuevo de forma silenciosa.
        // Incluye tanto rechazos v3 como systematic_failure heredados de r1/r2.
        // Solo una autorización explícita y consciente permite probar el código actualizado.
        if(writerHistoricalFailure && data.allow_previous_revision_retry!==true){
          return new Response(JSON.stringify(previousRevisionFailurePayload("writer",writerHistoricalFailure)),{headers});
        }
        if(writerRejections.historical && data.allow_previous_revision_retry!==true){
          return new Response(JSON.stringify(previousRevisionRejectionPayload("writer",writerRejections.historical)),{headers});
        }

        const openaiResponse = await openAiFetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-5.6-luna",
              reasoning: { effort: "medium" },
              input: writerPrompt,
              text: {
                format: {
                  type: "json_schema",
                  name: "route_guide_v2",
                  strict: true,
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      title: { type: "string" },
                      subtitle: { type: "string" },
                      introduction: { type: "string" },
                      trip_summary: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          days: { type: "integer", enum: [vacationDays.length] },
                          route: { type: "string" },
                          travel_style: { type: "string" },
                          key_advice: { type: "string" }
                        },
                        required: [
                          "days",
                          "route",
                          "travel_style",
                          "key_advice"
                        ]
                      },
                      before_you_go: {
                        type: "array",
                        maxItems: 8,
                        items: { type: "string" }
                      },
                      days: {
                        type: "object",
                        additionalProperties: false,
                        properties: writerDaySchemas,
                        required: writerDayKeys
                      },
                      final_notes: { type: "string" },
                      media_status: {
                        type: "string",
                        enum: ["pending_enrichment"]
                      }
                    },
                    required: [
                      "title",
                      "subtitle",
                      "introduction",
                      "trip_summary",
                      "before_you_go",
                      "days",
                      "final_notes",
                      "media_status"
                    ]
                  }
                }
              }
            })
          }
        );

        const aiData = await openaiResponse.json();

        if (!openaiResponse.ok) {
          return new Response(JSON.stringify({
            ok: false,
            status: openaiResponse.status,
            error: aiData
          }), {
            status: openaiResponse.status,
            headers
          });
        }

        const outputText = getOutputText(aiData);
        let guide = null;

        try {
          guide = outputText ? JSON.parse(outputText) : null;
        } catch {
          guide = null;
        }

        if (!guide) {
          await saveRejectedGeneration("writer",writerRequestForFingerprint,writerFingerprint,"invalid_json",null,outputText,aiData.usage||null);
          await recordGenerationAttempt(writerFingerprint,"writer","systematic_failure","invalid_json");
          return new Response(JSON.stringify({
            ok: false,
            error: "El Redactor no devolvió un JSON válido",
            raw_output: outputText,
            usage: aiData.usage || null
          }), {
            status: 502,
            headers
          });
        }

        // r6: normalizacion determinista de la salida cerrada del Redactor.
        // Recupera el formato historico esperado por validadores, cache y frontend.
        if (!guide.days || Array.isArray(guide.days) || typeof guide.days !== "object") {
          await saveRejectedGeneration("writer",writerRequestForFingerprint,writerFingerprint,"invalid_days_shape",guide,outputText,aiData.usage||null);
          await recordGenerationAttempt(writerFingerprint,"writer","systematic_failure","invalid_days_shape");
          return new Response(JSON.stringify({
            ok: false,
            error: "El Redactor no devolvio el objeto day_N esperado",
            usage: aiData.usage || null
          }), { status: 502, headers });
        }

        const normalizedWriterDays = [];
        for (let i = 0; i < writerDayKeys.length; i++) {
          const dayKey = writerDayKeys[i];
          const generated = guide.days[dayKey] || {};
          const expected = normalizeVacationDays({ vacation_days: vacationDays })[i] || {};
          const maps = writerEntityMapsByDay[i] || {
            highlights: new Map(), restaurants: new Map(), overnight: new Map()
          };

          const highlights = (Array.isArray(generated.highlights) ? generated.highlights : []).map(item => {
            const entityId = String(item?.entity_id || "");
            const entity = maps.highlights.get(entityId);
            return {
              entity_id: entityId,
              name: String(entity?.name || ""),
              description: String(item?.description || ""),
              practical_note: String(item?.practical_note || ""),
              url: String(entity?.url || entity?.website || "")
            };
          });

          const restaurants = (Array.isArray(generated.restaurants) ? generated.restaurants : []).map(item => {
            const entityId = String(item?.entity_id || "");
            const entity = maps.restaurants.get(entityId);
            return {
              entity_id: entityId,
              name: String(entity?.name || ""),
              why: String(item?.why || ""),
              specialty: String(item?.specialty || entity?.specialty || ""),
              practical_note: String(item?.practical_note || ""),
              website: String(entity?.website || "")
            };
          });

          const overnight = (Array.isArray(generated.overnight) ? generated.overnight : []).map(item => {
            const entityId = String(item?.entity_id || "");
            const entity = maps.overnight.get(entityId);
            return {
              entity_id: entityId,
              name: String(entity?.name || ""),
              type: String(entity?.type || ""),
              why: String(item?.why || ""),
              services: String(item?.services || entity?.services || ""),
              practical_info: String(item?.practical_info || entity?.practical_info || ""),
              website: String(entity?.website || "")
            };
          });

          normalizedWriterDays.push({
            day: i + 1,
            vacation_day_id: expected.vacation_day_id,
            logistics_id: expected.logistics_id,
            travel_date: expected.travel_date,
            request_point_id: expected.request_point_id,
            place: String(vacationDays[i]?.place || expected.place || "").trim(),
            country: String(vacationDays[i]?.country || expected.country || "").trim(),
            day_type: expected.day_type,
            driving_stage_id: expected.driving_stage_id,
            base_id: expected.base_id,
            overnight_id: expected.overnight_id,
            driving_km: expected.driving_km,
            driving_minutes: expected.driving_minutes,
            heading: String(generated.heading || ""),
            driving: String(generated.driving || ""),
            recommended_visit_time: String(generated.recommended_visit_time || ""),
            arrival_strategy: String(generated.arrival_strategy || ""),
            pace_advice: String(generated.pace_advice || ""),
            opening_narrative: String(generated.opening_narrative || ""),
            visit_story: String(generated.visit_story || ""),
            highlights,
            family_section: String(generated.family_section || ""),
            gastronomy_intro: String(generated.gastronomy_intro || ""),
            restaurants,
            overnight_intro: String(generated.overnight_intro || ""),
            overnight,
            practical_advice: Array.isArray(generated.practical_advice) ? generated.practical_advice.map(String) : [],
            useful_links: Array.isArray(generated.useful_links) ? generated.useful_links : [],
            visual_plan: generated.visual_plan || {
              hero: { subject: "", purpose: "", caption: "", source_page_url: "" },
              gallery: []
            }
          });
        }
        guide = { ...guide, days: normalizedWriterDays };

        function sanitizeVerifiedUrls(value, key = "") {
          if (Array.isArray(value)) {
            return value.map(item => sanitizeVerifiedUrls(item, key));
          }

          if (value && typeof value === "object") {
            const result = {};
            for (const [childKey, childValue] of Object.entries(value)) {
              result[childKey] = sanitizeVerifiedUrls(childValue, childKey);
            }
            return result;
          }

          const isUrlField =
            key === "url" ||
            key === "website" ||
            key.endsWith("_url");

          if (isUrlField && typeof value === "string") {
            if (!value.trim()) return "";
            const normalized = normalizeUrlForCompare(value);
            return normalized && allowedUrlMap.has(normalized)
              ? allowedUrlMap.get(normalized)
              : "";
          }

          return value;
        }

        guide = sanitizeVerifiedUrls(guide);
        if (Array.isArray(guide?.days)) {
          for (const day of guide.days) {
            if (Array.isArray(day?.overnight)) day.overnight = sanitizeOvernightListForTypes(day.overnight, overnightTypes);
          }
        }

        const guideContract = validateGuideContract(guide, {
          route_contract_version: routeContractVersion,
          vacation_days: vacationDays
        });
        if (!guideContract.ok) {
          await saveRejectedGeneration("writer",writerRequestForFingerprint,writerFingerprint,`contract:${guideContract.reason||"unknown"}`,guide,null,aiData.usage||null);
          await recordGenerationAttempt(writerFingerprint,"writer","systematic_failure",`contract:${guideContract.reason||"unknown"}`);
          return new Response(JSON.stringify({
            ok: true,
            writer: "Rutas Campings & Areas IA",
            version: "redactor-v5-route-contract",
            status: "invalid_route_contract",
            openai_called: true,
            contract_error: guideContract,
            message: "La guía no respeta exactamente los días del contrato logístico y no se guardará.",
            usage: aiData.usage || null
          }), { headers });
        }

        const guideSelections = validateGuideVerifiedSelections(guide, plan, researchRows, overnightTypes);
        if (!guideSelections.ok) {
          await saveRejectedGeneration("writer",writerRequestForFingerprint,writerFingerprint,`verified_content:${guideSelections.reason||"unknown"}`,guide,null,aiData.usage||null);
          await recordGenerationAttempt(writerFingerprint,"writer","systematic_failure",`verified_content:${guideSelections.reason||"unknown"}`);
          return new Response(JSON.stringify({
            ok: true,
            writer: "Rutas Campings & Areas IA",
            version: "redactor-v5-route-contract",
            status: "invalid_verified_content",
            openai_called: true,
            content_error: guideSelections,
            message: "La guía incluyó contenido que no coincide con la investigación verificada y no se guardará.",
            usage: aiData.usage || null
          }), { headers });
        }

        const serializedGuide = JSON.stringify(guide);
        const containsUnexpectedScript = /[\u0400-\u04FF\u0370-\u03FF\u4E00-\u9FFF\u3040-\u30FF]/u
          .test(serializedGuide);

        if (containsUnexpectedScript) {
          await saveRejectedGeneration("writer",writerRequestForFingerprint,writerFingerprint,"language_control:unexpected_script",guide,null,aiData.usage||null);
          await recordGenerationAttempt(writerFingerprint,"writer","systematic_failure","language_control:unexpected_script");
          return new Response(JSON.stringify({
            ok: false,
            error: "Control de idioma: el Redactor devolvió caracteres no permitidos",
            retry_recommended: false,
            usage: aiData.usage || null
          }), {
            status: 502,
            headers
          });
        }

        const guideResponse = {
          ok: true,
          writer: "Rutas Campings & Areas IA",
          version: "redactor-v5-route-contract",
          status: "written",
          model: aiData.model || "gpt-5.6-luna",
          openai_called: true,
          research_source: "D1-cache",
          verified_url_count: allowedUrlMap.size,
          media_status: "pending_enrichment",
          cache: {
            hit: false,
            saved: true,
            type: "guide",
            cache_key: guideCache.cache_key
          },
          guide,
          usage: aiData.usage || null
        };

        const guideSaveResult = await saveAiRouteCache(
          "guide",
          guideCache.cache_key,
          guideCache.request_json,
          guideResponse
        );
        await recordGenerationAttempt(writerFingerprint,"writer","success",null);
        if (guideSaveResult?.primary_saved === false) {
          guideResponse.cache.primary_saved = false;
          guideResponse.cache.recovery_saved = true;
          guideResponse.cache.warning = "D1 principal no aceptó la escritura; guía preservada en recuperación v3.";
        }

        return new Response(JSON.stringify(guideResponse), { headers });

      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          error: error.message
        }), {
          status: 500,
          headers
        });
      }
    }

    // Importación manual de un PLAN ya generado a la caché D1.
    // NO llama a OpenAI. Permite reutilizar planificación ya pagada.
    if (
      url.pathname === "/cache-import-plan" &&
      request.method === "POST"
    ) {
      try {
        const data = await request.json();
        const routeRequest = data?.route_request && typeof data.route_request === "object"
          ? data.route_request
          : null;
        const savedResponse = data?.saved_response && typeof data.saved_response === "object"
          ? data.saved_response
          : null;

        if (!routeRequest || !savedResponse) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Faltan route_request o saved_response"
          }), { status: 400, headers });
        }

        const origin = String(routeRequest.origin || "").trim();
        const finalDestination = String(routeRequest.destination || "").trim();
        const country = String(routeRequest.country || "").trim();
        const vehicle = String(routeRequest.vehicle || "autocaravana").trim();
        const adults = Number.isFinite(Number(routeRequest.adults)) ? Number(routeRequest.adults) : 1;
        const children = Array.isArray(routeRequest.children) ? routeRequest.children : [];
        const pet = Boolean(routeRequest.pet);
        const maxDrivingHours = Number.isFinite(Number(routeRequest.max_driving_hours))
          ? Number(routeRequest.max_driving_hours)
          : null;
        const pace = String(routeRequest.pace || "equilibrado").trim();
        const interests = Array.isArray(routeRequest.interests)
          ? routeRequest.interests.map(v => String(v)).slice(0, 20)
          : [];
        const overnightPreference = String(routeRequest.overnight_preference || "").trim();
        const rawStops = Array.isArray(routeRequest.stops) ? routeRequest.stops : [];

        if (!origin || !finalDestination || rawStops.length === 0) {
          return new Response(JSON.stringify({
            ok: false,
            error: "route_request incompleto"
          }), { status: 400, headers });
        }

        const stops = rawStops.map((stop, index) => ({
          day: Number.isFinite(Number(stop.day)) ? Number(stop.day) : index + 1,
          place: String(stop.place || stop.name || "").trim(),
          country: String(stop.country || country || "").trim(),
          driving_km: Number.isFinite(Number(stop.driving_km)) ? Number(stop.driving_km) : null,
          driving_minutes: Number.isFinite(Number(stop.driving_minutes)) ? Number(stop.driving_minutes) : null,
          is_final: Boolean(stop.is_final) ||
            normalizeKey(stop.place || stop.name) === normalizeKey(finalDestination)
        })).filter(stop => stop.place);

        if (stops.length === 0) {
          return new Response(JSON.stringify({ ok: false, error: "No hay paradas válidas" }), {
            status: 400,
            headers
          });
        }

        const researchSignature = [];
        const missingResearch = [];

        for (const stop of stops) {
          const key = destinationKey(stop.place, stop.country);
          const row = await env.DB.prepare(`
            SELECT place_key, researched_at
            FROM destination_research
            WHERE place_key = ?
            LIMIT 1
          `).bind(key).first();

          if (!row) {
            missingResearch.push({
              day: stop.day,
              place: stop.place,
              country: stop.country,
              place_key: key
            });
          } else {
            researchSignature.push({
              place_key: row.place_key,
              researched_at: row.researched_at
            });
          }
        }

        if (missingResearch.length > 0) {
          return new Response(JSON.stringify({
            ok: false,
            error: "No se puede importar: faltan investigaciones D1",
            missing_research: missingResearch
          }), { status: 400, headers });
        }

        const planCacheRequest = {
          schema_version: "planificador-v4-route-contract",
          origin: normalizeKey(origin),
          destination: normalizeKey(finalDestination),
          vehicle: normalizeKey(vehicle),
          adults,
          children,
          pet,
          max_driving_hours: maxDrivingHours,
          pace: normalizeKey(pace),
          interests: interests.map(normalizeKey).sort(),
          overnight_preference: normalizeKey(overnightPreference),
          stops: stops.map(stop => ({
            day: stop.day,
            place: normalizeKey(stop.place),
            country: normalizeKey(stop.country),
            driving_km: stop.driving_km,
            driving_minutes: stop.driving_minutes,
            is_final: stop.is_final
          })),
          research_signature: researchSignature
        };

        const planCache = await getAiRouteCache("plan", planCacheRequest);
        const importedResponse = {
          ...savedResponse,
          ok: true,
          planner: savedResponse.planner || "Rutas Campings & Areas IA",
          version: savedResponse.version || "planificador-v1",
          status: "planned",
          openai_called: false,
          research_source: "D1-cache",
          imported_to_cache: true,
          original_usage: savedResponse.usage || null,
          usage: zeroUsage()
        };

        await saveAiRouteCache(
          "plan",
          planCache.cache_key,
          planCache.request_json,
          importedResponse
        );

        return new Response(JSON.stringify({
          ok: true,
          status: planCache.found ? "cache_replaced" : "cache_imported",
          openai_called: false,
          cost: 0,
          cache_type: "plan",
          cache_key: planCache.cache_key,
          route: `${origin} → ${finalDestination}`,
          message: "Plan importado a D1 sin llamar a OpenAI."
        }), { headers });
      } catch (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers
        });
      }
    }

    // Importación manual de una guía ya generada a la caché D1.
    // NO llama a OpenAI. Sirve para rescatar resultados obtenidos antes
    // de activar la protección de costes.
    if (
      url.pathname === "/cache-import-guide" &&
      request.method === "POST"
    ) {
      try {
        const data = await request.json();
        const routeRequest = data?.route_request && typeof data.route_request === "object"
          ? data.route_request
          : null;
        const savedResponse = data?.saved_response && typeof data.saved_response === "object"
          ? data.saved_response
          : null;

        if (!routeRequest || !savedResponse) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Faltan route_request o saved_response"
          }), {
            status: 400,
            headers
          });
        }

        if (!savedResponse.guide || typeof savedResponse.guide !== "object") {
          return new Response(JSON.stringify({
            ok: false,
            error: "saved_response no contiene una guide válida"
          }), {
            status: 400,
            headers
          });
        }

        const origin = String(routeRequest.origin || "").trim();
        const finalDestination = String(routeRequest.destination || "").trim();
        const vehicle = String(routeRequest.vehicle || "autocaravana").trim();
        const adults = Number.isFinite(Number(routeRequest.adults))
          ? Number(routeRequest.adults)
          : 1;
        const children = Array.isArray(routeRequest.children) ? routeRequest.children : [];
        const pet = Boolean(routeRequest.pet);
        const pace = String(routeRequest.pace || "equilibrado").trim();
        const interests = Array.isArray(routeRequest.interests)
          ? routeRequest.interests.map(v => String(v)).slice(0, 20)
          : [];
        const overnightPreference = String(
          routeRequest.overnight_preference || ""
        ).trim();
        const plan = routeRequest.plan && typeof routeRequest.plan === "object"
          ? routeRequest.plan
          : null;
        const rawStops = Array.isArray(routeRequest.stops) ? routeRequest.stops : [];

        if (!origin || !finalDestination || !plan || !Array.isArray(plan.days) || rawStops.length === 0) {
          return new Response(JSON.stringify({
            ok: false,
            error: "route_request incompleto"
          }), {
            status: 400,
            headers
          });
        }

        const stops = rawStops
          .map((stop, index) => ({
            day: Number.isFinite(Number(stop.day)) ? Number(stop.day) : index + 1,
            place: String(stop.place || stop.name || "").trim(),
            country: String(stop.country || "").trim(),
            driving_km: Number.isFinite(Number(stop.driving_km))
              ? Number(stop.driving_km)
              : null,
            driving_minutes: Number.isFinite(Number(stop.driving_minutes))
              ? Number(stop.driving_minutes)
              : null,
            is_final: Boolean(stop.is_final)
          }))
          .filter(stop => stop.place);

        const researchSignature = [];
        const missingResearch = [];

        for (const stop of stops) {
          const key = destinationKey(stop.place, stop.country);
          const row = await env.DB.prepare(`
            SELECT place_key, researched_at
            FROM destination_research
            WHERE place_key = ?
            LIMIT 1
          `).bind(key).first();

          if (!row) {
            missingResearch.push({
              day: stop.day,
              place: stop.place,
              country: stop.country,
              place_key: key
            });
            continue;
          }

          researchSignature.push({
            place: normalizeKey(stop.place),
            country: normalizeKey(stop.country),
            researched_at: row.researched_at
          });
        }

        if (missingResearch.length > 0) {
          return new Response(JSON.stringify({
            ok: false,
            error: "No se puede importar: faltan investigaciones D1",
            missing_research: missingResearch
          }), {
            status: 400,
            headers
          });
        }

        const guideCacheRequest = {
          schema_version: "redactor-v5-route-contract",
          origin: normalizeKey(origin),
          destination: normalizeKey(finalDestination),
          vehicle: normalizeKey(vehicle),
          adults,
          children,
          pet,
          pace: normalizeKey(pace),
          interests: interests.map(normalizeKey).sort(),
          overnight_preference: normalizeKey(overnightPreference),
          stops: stops.map(stop => ({
            day: stop.day,
            place: normalizeKey(stop.place),
            country: normalizeKey(stop.country),
            driving_km: stop.driving_km,
            driving_minutes: stop.driving_minutes,
            is_final: stop.is_final
          })),
          plan,
          research_signature: researchSignature
        };

        const guideCache = await getAiRouteCache("guide", guideCacheRequest);

        const importedResponse = {
          ...savedResponse,
          openai_called: false,
          research_source: "D1-cache",
          imported_to_cache: true,
          original_usage: savedResponse.usage || null,
          usage: zeroUsage()
        };

        await saveAiRouteCache(
          "guide",
          guideCache.cache_key,
          guideCache.request_json,
          importedResponse
        );

        return new Response(JSON.stringify({
          ok: true,
          status: guideCache.found ? "cache_replaced" : "cache_imported",
          openai_called: false,
          cost: 0,
          cache_type: "guide",
          cache_key: guideCache.cache_key,
          route: `${origin} → ${finalDestination}`,
          message: "Guía importada a D1 sin llamar a OpenAI."
        }), { headers });

      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          error: error.message
        }), {
          status: 500,
          headers
        });
      }
    }

    // Estado de protección de costes y cachés. No llama a OpenAI.
    // Incluye diagnóstico D1 suficiente para auditar fallos sin gastar.
    if (
      url.pathname === "/cost-status" &&
      request.method === "GET"
    ) {
      try {
        await ensureAiRouteCacheTable();
        await ensureResearchPhaseTable();
        await ensureControlledTestTable();

        const researchCount = await env.DB.prepare(
          "SELECT COUNT(*) AS total FROM destination_research"
        ).first();

        const controlledTest = await env.DB.prepare(`
          SELECT test_key, status, started_at, finished_at
          FROM ai_controlled_tests
          WHERE test_key = ?
          LIMIT 1
        `).bind(CONTROLLED_PARIS_TEST_KEY).first();

        const routeCacheCounts = await env.DB.prepare(`
          SELECT cache_type, COUNT(*) AS total
          FROM ai_route_cache
          GROUP BY cache_type
          ORDER BY cache_type
        `).all();

        const routeCacheV3Counts = await env.DB.prepare(`
          SELECT cache_type, COUNT(*) AS total
          FROM ai_route_cache_v3
          GROUP BY cache_type
          ORDER BY cache_type
        `).all();

        const recoveryV3Counts = await env.DB.prepare(`
          SELECT cache_type, COUNT(*) AS total
          FROM ai_route_recovery_v3
          GROUP BY cache_type
          ORDER BY cache_type
        `).all();

        const latestGenerationAttempts = await env.DB.prepare(`
          SELECT request_fingerprint, stage, result, failure_reason, created_at
          FROM generation_attempts
          ORDER BY created_at DESC
          LIMIT 20
        `).all();

        const latestResearchPhases = await env.DB.prepare(`
          SELECT place_key, phase_name, quality_status, failure_reason, completed_at
          FROM destination_research_phases
          ORDER BY completed_at DESC
          LIMIT 30
        `).all();

        const latestGenerationRejections = await env.DB.prepare(`
          SELECT stable_fingerprint, request_fingerprint, pipeline_revision, stage, failure_reason, usage_json, created_at
          FROM ai_generation_rejections_v3
          ORDER BY created_at DESC
          LIMIT 30
        `).all();

        return new Response(JSON.stringify({
          ok: true,
          openai_spend_enabled: OPENAI_SPEND_ENABLED,
          openai_route_pipeline_enabled: OPENAI_ROUTE_PIPELINE_ENABLED,
          openai_media_enabled: OPENAI_MEDIA_ENABLED,
          openai_test_endpoint_enabled: OPENAI_TEST_ENDPOINT_ENABLED,
          openai_route_effectively_enabled:
            OPENAI_SPEND_ENABLED && OPENAI_ROUTE_PIPELINE_ENABLED,
          generation_pipeline_revision: GENERATION_PIPELINE_REVISION,
          protection: OPENAI_SPEND_ENABLED
            ? (OPENAI_ROUTE_PIPELINE_ENABLED ? "ROUTE_AI_ENABLED" : "MASTER_ENABLED_ROUTE_BLOCKED")
            : "COST_GUARD_ACTIVE",
          destination_research_cached: Number(researchCount?.total || 0),
          route_ai_cache: routeCacheCounts.results || [],
          route_ai_cache_legacy: routeCacheCounts.results || [],
          route_ai_cache_v3: routeCacheV3Counts.results || [],
          route_ai_recovery_v3: recoveryV3Counts.results || [],
          latest_generation_attempts: latestGenerationAttempts.results || [],
          latest_generation_rejections: latestGenerationRejections.results || [],
          latest_research_phases: latestResearchPhases.results || [],
          controlled_paris_test: {
            enabled: CONTROLLED_PARIS_TEST_ENABLED,
            destination: "Paris, France",
            general_openai_still_blocked: !OPENAI_SPEND_ENABLED,
            used: Boolean(controlledTest),
            status: controlledTest?.status || "available",
            started_at: controlledTest?.started_at || null,
            finished_at: controlledTest?.finished_at || null
          },
          controlled_valencia_test: {
            enabled: CONTROLLED_VALENCIA_TEST_ENABLED
          },
          message: OPENAI_SPEND_ENABLED
            ? (OPENAI_ROUTE_PIPELINE_ENABLED
                ? "OpenAI está habilitado solo para el pipeline de ruta si multimedia/test siguen cerrados."
                : "El maestro está abierto, pero el pipeline de ruta continúa bloqueado.")
            : "OpenAI está completamente bloqueado por el maestro; D1 puede auditarse sin gasto."
        }), { headers });
      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          error: error.message
        }), {
          status: 500,
          headers
        });
      }
    }

    // Guardar una nueva ruta
    if (url.pathname === "/routes" && request.method === "POST") {
      try {
        const data = await request.json();
        const id = crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO routes (
            id,
            status,
            origin,
            destination,
            start_date,
            days,
            vehicle,
            adults,
            children_json,
            pet,
            preferences_json,
            route_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          "draft",
          data.origin,
          data.destination || null,
          data.start_date || null,
          data.days,
          data.vehicle,
          data.adults || 1,
          JSON.stringify(data.children || []),
          data.pet ? 1 : 0,
          JSON.stringify(data.preferences || {}),
          null
        ).run();

        return new Response(JSON.stringify({
          ok: true,
          id,
          message: "Ruta guardada correctamente"
        }), {
          status: 201,
          headers
        });

      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          error: error.message
        }), {
          status: 400,
          headers
        });
      }
    }

    // Recuperar una ruta por su ID
    if (
      url.pathname.startsWith("/routes/") &&
      request.method === "GET"
    ) {
      const id = url.pathname.split("/")[2];

      const route = await env.DB.prepare(
        "SELECT * FROM routes WHERE id = ?"
      ).bind(id).first();

      if (!route) {
        return new Response(JSON.stringify({
          ok: false,
          error: "Ruta no encontrada"
        }), {
          status: 404,
          headers
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        route
      }), { headers });
    }

    return new Response(JSON.stringify({
      ok: true,
      service: "RUTAS Campings & Areas IA",
      message: "Backend de desarrollo funcionando"
    }), { headers });
  }
};

// ============================================================
// CAPA PREMIUM DEFINITIVA (2026-09-21)
// Mantiene intacto el motor histórico de Rutas y su D1.
// Requiere una Service Binding en Cloudflare:
//   PREMIUM_AUTH -> campings-areas-premium
// ============================================================
const PREMIUM_APP_ORIGIN = "https://campings-y-areas.github.io";
const PREMIUM_PROTECTED_PATHS = new Set([
  "/plan-route",
  "/write-route",
  "/research-cache",
  "/research-destination",
  "/media-cache",
  "/research-media",
  "/official-media"
]);
const PREMIUM_COST_PATHS = new Set([
  "/plan-route",
  "/write-route",
  "/research-destination",
  "/research-media"
]);

function premiumCors(request) {
  const origin = request.headers.get("Origin") || "";
  const h = {
    "Content-Type": "application/json; charset=UTF-8",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
  if (origin === PREMIUM_APP_ORIGIN) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function premiumJson(request, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: premiumCors(request) });
}

function premiumBearer(request) {
  const value = request.headers.get("Authorization") || "";
  const match = value.match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/i);
  return match ? match[1] : "";
}

async function premiumCall(request, env, path, { method = "GET", body } = {}) {
  const token = premiumBearer(request);
  if (!token) {
    const error = new Error("Debes iniciar sesión con una cuenta Premium.");
    error.httpStatus = 401;
    error.code = "premium_auth_required";
    throw error;
  }
  if (!env.PREMIUM_AUTH || typeof env.PREMIUM_AUTH.fetch !== "function") {
    const error = new Error("La conexión con Premium no está configurada.");
    error.httpStatus = 503;
    error.code = "premium_auth_unavailable";
    throw error;
  }
  const response = await env.PREMIUM_AUTH.fetch(`https://campings-areas-premium${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok !== true) {
    const error = new Error(payload?.message || (response.status === 401
      ? "La sesión ha caducado o no es válida."
      : response.status === 403
        ? "Esta cuenta no tiene una suscripción Premium activa."
        : response.status === 429
          ? "Has alcanzado el límite de 8 rutas con IA de este mes."
          : "No se pudo comprobar temporalmente el acceso Premium."));
    error.httpStatus = response.status || 503;
    error.code = payload?.error || (response.status === 401 ? "premium_auth_required" : "premium_unavailable");
    throw error;
  }
  return payload;
}

async function requirePremium(request, env) {
  const me = await premiumCall(request, env, "/me");
  if (me.premium !== true) {
    const error = new Error("Esta cuenta no tiene una suscripción Premium activa.");
    error.httpStatus = 403;
    error.code = "premium_required";
    throw error;
  }
  return me;
}

async function requireRouteAvailable(request, env) {
  const usage = await premiumCall(request, env, "/route-usage");
  if (Number(usage.remaining) <= 0) {
    const error = new Error("Has alcanzado el límite de 8 rutas con IA de este mes.");
    error.httpStatus = 429;
    error.code = "route_limit_reached";
    throw error;
  }
  return usage;
}

async function stableRouteId(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `route_${hex}`;
}

async function consumeCompletedRoute(request, env, requestBodyText) {
  return premiumCall(request, env, "/route-usage/consume", {
    method: "POST",
    body: { route_id: await stableRouteId(requestBodyText) }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // La preflight se resuelve aquí para permitir Authorization desde GitHub Pages.
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin") || "";
      if (origin && origin !== PREMIUM_APP_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: premiumCors(request) });
    }

    const protectedPath = PREMIUM_PROTECTED_PATHS.has(url.pathname);
    let requestBodyText = "";

    try {
      if (protectedPath) {
        await requirePremium(request, env);
        if (PREMIUM_COST_PATHS.has(url.pathname)) await requireRouteAvailable(request, env);
      }

      if (url.pathname === "/write-route" && request.method === "POST") {
        requestBodyText = await request.clone().text();
      }

      const response = await legacyWorker.fetch(request, env);

      // Solo descuenta 1 ruta cuando el motor antiguo confirma una guía terminada.
      // El route_id es estable para que Premium pueda hacer el consumo idempotente.
      if (url.pathname === "/write-route" && request.method === "POST" && response.ok) {
        const copy = response.clone();
        const payload = await copy.json().catch(() => null);
        if (payload?.ok === true && payload?.status === "written" && payload?.guide) {
          const usage = await consumeCompletedRoute(request, env, requestBodyText);
          const merged = { ...payload, route_usage: usage };
          return premiumJson(request, merged, response.status);
        }
      }

      return response;
    } catch (error) {
      return premiumJson(request, {
        ok: false,
        status: error?.code || "premium_error",
        message: error?.message || "No se pudo validar el acceso Premium."
      }, Number(error?.httpStatus) || 503);
    }
  }
};
