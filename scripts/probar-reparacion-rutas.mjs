import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const required=['rutas-legacy.js','rutas-config.js','app/premium-client.js','app/premium-rutas.js','rutas.html'];
for(const rel of required){
  const file=path.join(root,rel);
  if(!fs.existsSync(file)) throw new Error(`Rutas incompleta: falta ${rel}`);
  if(/\.(?:js|mjs)$/.test(rel)) execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
}

const html=fs.readFileSync(path.join(root,'rutas.html'),'utf8');
if(!html.includes('rutas-legacy.js')) throw new Error('rutas.html no carga el motor histórico vigente rutas-legacy.js');
if(!html.includes('app/premium-rutas.js')) throw new Error('rutas.html no carga el control Premium vigente');

const source=fs.readFileSync(path.join(root,'rutas-legacy.js'),'utf8');
const premium=fs.readFileSync(path.join(root,'app','premium-rutas.js'),'utf8');

if(!/function\s+headersWorker\s*\(/.test(source)) throw new Error('Falta headersWorker() para centralizar autorización Premium');
if(!premium.includes('window.CAMPINGS_PREMIUM_AUTH_HEADERS = premiumAuthorizationHeaders')) {
  throw new Error('Premium no expone las cabeceras de autorización al motor de Rutas');
}

const protectedGets=['research-cache','research-destination','media-cache','official-media'];
for(const endpoint of protectedGets){
  const positions=[];
  let from=0;
  while((from=source.indexOf(`/${endpoint}`,from))!==-1){
    positions.push(from);
    from+=endpoint.length+1;
  }
  if(!positions.length) throw new Error(`No se encontró el endpoint protegido /${endpoint}`);
  for(const pos of positions){
    const nearby=source.slice(pos,Math.min(source.length,pos+1200));
    if(!/fetch\([\s\S]{0,900}headers:headersWorker\(\)/.test(nearby)){
      throw new Error(`El endpoint protegido /${endpoint} no usa headersWorker()`);
    }
  }
}
if(!/\/research-media[\s\S]{0,500}headers:headersWorker\(\)/.test(source)) {
  throw new Error('El endpoint protegido /research-media no usa headersWorker()');
}
if(!/fetch\(\`\$\{base\}\$\{ruta\}\`[\s\S]{0,250}headers:headersWorker\(\)/.test(source)) {
  throw new Error('plan-route/write-route no pasan por headersWorker()');
}


// Regresiones detectadas en la primera prueba Premium real (2026-09-21).
if(!source.includes('const mapsUrl=urlGoogleMapsTexto(nombre,address)')) {
  throw new Error('Google Maps de lugares no prioriza nombre + dirección verificada');
}
if(!source.includes('const FOTO_AUTO_STORAGE_KEY = "campingsAreasFotoAutoV4"')) {
  throw new Error('La caché fotográfica antigua no quedó invalidada');
}
if(!source.includes('lugar?.name||lugar?.village||lugar?.town||lugar?.city||lugar?.municipality')) {
  throw new Error('El nombre canónico puede volver a degradar un pueblo a su municipio');
}
if(!source.includes('.replace(/\\[([^\\]]+)\\]\\(https?:\\/\\/[^)\\s]+\\)/gi,"$1")')) {
  throw new Error('La guía puede volver a mostrar enlaces Markdown sin renderizar');
}
if(!source.includes('function corregirTextoRutaVisible(') || !source.includes('function tituloDiaVisible(')) {
  throw new Error('Falta la corrección determinista de origen y métricas visibles');
}
const forbidden=[
  {label:'comparación alojamiento-localidad antigua',pattern:/normalizarClaveMedia\(nombre\)===normalizarClaveMedia\(ultimoLugar\)/}
];
for(const check of forbidden){
  if(check.pattern.test(source)) throw new Error(`Regresión geográfica: ${check.label}`);
}

console.log('Arquitectura vigente de Rutas: OK');
console.log('Autorización Premium en endpoints protegidos: OK');
console.log('Regresiones geográficas antiguas: no presentes');
