import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../rutas-legacy.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../rutas.html", import.meta.url), "utf8");

test("el motor activo comparte la sesión Premium con todas las llamadas protegidas", () => {
  assert.match(source, /function headersWorker\(incluirJson=false\)/);
  assert.match(source, /CAMPINGS_PREMIUM_AUTH_HEADERS/);
  assert.match(source, /headers:headersWorker\(true\)/);

  const protectedGetEndpoints = [
    "/research-cache",
    "/research-destination",
    "/official-media",
    "/media-cache"
  ];
  for (const endpoint of protectedGetEndpoints) {
    const endpointIndex = source.indexOf(`\`${"${base}"}${endpoint}\``);
    assert.notEqual(endpointIndex, -1, `falta ${endpoint}`);
    const nextFetch = source.indexOf("fetch(u.toString()", endpointIndex);
    assert.notEqual(nextFetch, -1, `falta fetch de ${endpoint}`);
    assert.match(source.slice(nextFetch, nextFetch + 180), /headers:headersWorker\(\)/, `${endpoint} no envía sesión Premium`);
  }

  const mediaIndex = source.indexOf("`${base}/research-media`");
  assert.notEqual(mediaIndex, -1, "falta /research-media");
  assert.match(source.slice(mediaIndex, mediaIndex + 220), /headers:headersWorker\(true\)/);
});

test("la localidad de una pernocta procede del municipio y no del nombre del negocio", () => {
  const localityBlock = source.match(/const localidadPernocta=String\([\s\S]*?\)\.trim\(\);/)?.[0] || "";
  assert.match(localityBlock, /nombreLocalidad\(revPernocta\)/);
  assert.doesNotMatch(localityBlock, /nombreLugarWorker/);
});

test("rutas carga la revisión reparada del motor legado", () => {
  assert.match(html, /<script src="rutas-legacy\.js\?v=3"><\/script>/);
  assert.doesNotMatch(html, /rutas-legacy\.js\?v=[12]/);
});
