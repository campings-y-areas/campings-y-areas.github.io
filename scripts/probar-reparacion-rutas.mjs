import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const required=[
  'app/trip/rutas-entry.js',
  'app/trip/pipeline.js',
  'app/trip/logistics.js',
  'app/trip/logistics-service.js',
  'app/trip/stages.js',
  'app/trip/overnight-policy.js'
];

for(const rel of required){
  const file=path.join(root,rel);
  if(!fs.existsSync(file)) throw new Error(`Arquitectura modular de Rutas incompleta: falta ${rel}`);
  execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
}

const obsolete=path.join(root,'rutas.js');
if(fs.existsSync(obsolete)){
  throw new Error('Regresión: rutas.js monolítico no debe volver a existir.');
}

const routeFiles=[];
function walk(dir){
  if(!fs.existsSync(dir)) return;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,ent.name);
    if(ent.isDirectory()) walk(file);
    else if(/\.(?:js|mjs)$/.test(ent.name)) routeFiles.push(file);
  }
}
walk(path.join(root,'app','trip'));

const source=routeFiles.map(file=>fs.readFileSync(file,'utf8')).join('\n');

const forbidden=[
  {
    label:'POI usado como localidad de pernocta',
    pattern:/const\s+localidadPernocta\s*=\s*String\(\s*nombreLugarWorker\s*\(/s
  },
  {
    label:'POI usado como localidad de corte',
    pattern:/const\s+place\s*=\s*nombreLugarWorker\(rev,nombreLocalidad\(rev\)\)/
  },
  {
    label:'comparación alojamiento-localidad antigua',
    pattern:/normalizarClaveMedia\(nombre\)===normalizarClaveMedia\(ultimoLugar\)/
  }
];

for(const check of forbidden){
  if(check.pattern.test(source)) throw new Error(`Regresión geográfica: ${check.label}`);
}

console.log('Arquitectura modular de Rutas: OK');
console.log('Regresiones geográficas antiguas: no presentes');
