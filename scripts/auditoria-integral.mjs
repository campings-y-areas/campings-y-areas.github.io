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

const rutas=path.join(root,'rutas.js');
if(fs.existsSync(rutas)){
  const s=fs.readFileSync(rutas,'utf8');
  const required=['elegirFinJornadaRealV3','completarInvestigacionesPendientesIA','validarLogisticaLocal','alojamientoCompatible','consultarPlanificadorIA','consultarRedactorIA'];
  for(const name of required)if(!s.includes(name))errors.push(`Contrato Rutas ausente: ${name}`);
  if(/place\s*:\s*nombreAlojamiento\s*\(\s*cand\s*\)/.test(s))errors.push('Regresión Rutas: una pernocta vuelve a usarse como place de etapa.');
  if(/const\s+localidadPernocta\s*=\s*String\(\s*nombreLugarWorker\s*\(/s.test(s))errors.push('Regresión Rutas: la localidad de la pernocta aún puede tomar el nombre comercial del POI.');
  if(/const\s+place\s*=\s*nombreLugarWorker\(rev,nombreLocalidad\(rev\)\)/.test(s))errors.push('Regresión Rutas: el corte técnico aún puede usar nombre de POI como localidad.');
  if(/normalizarClaveMedia\(nombre\)===normalizarClaveMedia\(ultimoLugar\)/.test(s))warnings.push('Rutas: la penalización de duplicados compara nombre de alojamiento con localidad; debe compararse localidad con localidad.');
}

console.log(`Archivos revisados: ${files.length}`);
console.log(`JSON revisados: ${files.filter(f=>f.endsWith('.json')).length}`);
console.log(`JS revisados: ${files.filter(f=>f.endsWith('.js')||f.endsWith('.mjs')).length}`);
console.log(`Objetos JSON inspeccionados: ${jsonRows}`);
console.log(`Objetos con coordenadas inspeccionados: ${coordRows}`);
if(warnings.length){console.warn('\nAVISOS\n'+warnings.join('\n'));}
if(errors.length){console.error('\nERRORES\n'+errors.join('\n'));process.exit(1);}
console.log('\nAUDITORÍA ESTÁTICA AMPLIADA OK');