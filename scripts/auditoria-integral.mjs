import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const skip=new Set(['.git','node_modules']);
const files=[];
function walk(dir){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(skip.has(ent.name))continue;
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())walk(p); else files.push(p);
  }
}
walk(root);
let errors=[];
let warnings=[];
let jsonRows=0;
let coordRows=0;
const globalIds=new Map();

function finiteCoord(lat,lon){
  lat=Number(lat);lon=Number(lon);
  return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180;
}
function scanData(node,file,label='root'){
  if(Array.isArray(node)){
    node.forEach((x,i)=>scanData(x,file,`${label}[${i}]`));
    return;
  }
  if(!node||typeof node!=='object')return;
  jsonRows++;
  const hasLat=Object.prototype.hasOwnProperty.call(node,'lat')||Object.prototype.hasOwnProperty.call(node,'latitude');
  const hasLon=Object.prototype.hasOwnProperty.call(node,'lon')||Object.prototype.hasOwnProperty.call(node,'lng')||Object.prototype.hasOwnProperty.call(node,'longitude');
  if(hasLat||hasLon){
    const lat=node.lat??node.latitude;
    const lon=node.lon??node.lng??node.longitude;
    if(lat!=null||lon!=null){
      coordRows++;
      if(!finiteCoord(lat,lon))errors.push(`Coordenadas inválidas: ${file} ${label} lat=${lat} lon=${lon}`);
    }
  }
  const id=String(node.id??'').trim();
  if(id){
    const key=`${file}|${id}`;
    if(globalIds.has(key))errors.push(`ID duplicado en ${file}: ${id}`);
    else globalIds.set(key,label);
  }
  for(const [k,v] of Object.entries(node)){
    if(v&&typeof v==='object')scanData(v,file,`${label}.${k}`);
  }
}

for(const f of files.filter(f=>f.endsWith('.json'))){
  const rel=path.relative(root,f);
  try{
    const data=JSON.parse(fs.readFileSync(f,'utf8'));
    scanData(data,rel);
  }catch(e){errors.push(`JSON inválido: ${rel}: ${e.message}`);}
}

for(const f of files.filter(f=>f.endsWith('.js')||f.endsWith('.mjs'))){
  try{execFileSync(process.execPath,['--check',f],{stdio:'pipe'});}
  catch(e){errors.push(`JavaScript inválido: ${path.relative(root,f)}\n${String(e.stderr||e.message)}`);}
}

const localRef=/\b(?:src|href)=["']([^"'#?]+)(?:[?#][^"']*)?["']/gi;
for(const f of files.filter(f=>f.endsWith('.html'))){
  const text=fs.readFileSync(f,'utf8');
  let m;
  while((m=localRef.exec(text))){
    const ref=m[1];
    if(/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(ref))continue;
    const target=path.resolve(path.dirname(f),ref);
    if(!fs.existsSync(target))errors.push(`Referencia local rota: ${path.relative(root,f)} -> ${ref}`);
  }
}

// Navegación: las secciones principales deben exponer Rutas, informes y conservar el acceso privado.
const navPages=['index.html','campings.html','areas.html','acampadas.html','lugares.html','talleres.html','servicios.html','normativas.html','rutas.html'];
for(const page of navPages){
  const f=path.join(root,page);
  if(!fs.existsSync(f)){errors.push(`Página principal ausente: ${page}`);continue;}
  const text=fs.readFileSync(f,'utf8');
  if(!/href=["']rutas\.html["']/.test(text))errors.push(`Navegación incompleta: ${page} no enlaza Rutas.`);
  if(!/href=["']informar-error\.html["']/.test(text))errors.push(`Navegación incompleta: ${page} no enlaza Informar de un error.`);
  if(!text.includes('app/private-access.js'))errors.push(`Acceso privado inconsistente: ${page} no conserva pruebas=manuel al navegar.`);
}

// Módulos con varias fuentes independientes: un fallo parcial no debe derribar toda la sección.
for(const name of ['lugares.js','servicios.js']){
  const f=path.join(root,name);
  if(fs.existsSync(f)){
    const s=fs.readFileSync(f,'utf8');
    if(!s.includes('Promise.allSettled'))errors.push(`Resiliencia ausente: ${name} debe tolerar fallos parciales con Promise.allSettled.`);
  }
}

const normativas=path.join(root,'normativas.js');
if(fs.existsSync(normativas)){
  const s=fs.readFileSync(normativas,'utf8');
  if(/🇪🇸\s*\$\{normativa\.pais\}/.test(s))errors.push('Regresión Normativas: bandera de España hardcodeada para todos los países.');
}

const rutasHtml=fs.readFileSync(path.join(root,'rutas.html'),'utf8');
if(/(?:src|href)=["']rutas\.js/.test(rutasHtml))errors.push('Rutas carga el script monolítico antiguo.');
for(const required of ['app/trip/rutas-entry.js','app/trip/pipeline.js','app/trip/vacation-days.js','app/services/data-registry.js']){
  if(!fs.existsSync(path.join(root,required)))errors.push(`Arquitectura de Rutas incompleta: falta ${required}`);
}

const demoHtml=fs.readFileSync(path.join(root,'demo-ruta.html'),'utf8');
// La demo publicada es una muestra estática aislada y actualmente usa estos cuatro scripts.
// La auditoría valida esa implementación real sin obligar a migrarla ni borrar archivos que están en uso.
for(const required of ['demo-ruta.js','demo-ruta-fotos-fijas.js','demo-ruta-guia-premium.js','demo-ruta-mejoras.js']){
  if(!demoHtml.includes(required))errors.push(`Demo: falta la dependencia activa ${required}.`);
  if(!fs.existsSync(path.join(root,required)))errors.push(`Demo: falta el archivo activo ${required}.`);
}
if(/rutas-config|worker-new|app\/trip\/rutas-entry\.js/.test(demoHtml))errors.push('Demo: contiene una dependencia prohibida de Rutas, Worker o configuración.');
if(!demoHtml.includes('No llama a OpenAI, Worker, D1, Planner, Writer, Research ni a las cachés de producción.')){
  errors.push('Demo: falta la declaración de aislamiento respecto a servicios de producción.');
}

if(fs.existsSync(path.join(root,'rutas.js')))errors.push('Código obsoleto todavía presente: rutas.js');

console.log(`Archivos revisados: ${files.length}`);
console.log(`JSON revisados: ${files.filter(f=>f.endsWith('.json')).length}`);
console.log(`JS revisados: ${files.filter(f=>f.endsWith('.js')||f.endsWith('.mjs')).length}`);
console.log(`Objetos JSON inspeccionados: ${jsonRows}`);
console.log(`Objetos con coordenadas inspeccionados: ${coordRows}`);
if(warnings.length){console.warn('\nAVISOS\n'+warnings.join('\n'));}
if(errors.length){console.error('\nERRORES\n'+errors.join('\n'));process.exit(1);}
console.log('\nAUDITORÍA ESTÁTICA AMPLIADA OK');
