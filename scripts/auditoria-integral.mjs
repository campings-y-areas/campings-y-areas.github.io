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

for(const f of files.filter(f=>f.endsWith('.json'))){
  try{JSON.parse(fs.readFileSync(f,'utf8'));}
  catch(e){errors.push(`JSON inválido: ${path.relative(root,f)}: ${e.message}`);}
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
}

console.log(`Archivos revisados: ${files.length}`);
console.log(`JSON revisados: ${files.filter(f=>f.endsWith('.json')).length}`);
console.log(`JS revisados: ${files.filter(f=>f.endsWith('.js')||f.endsWith('.mjs')).length}`);
if(warnings.length){console.warn('\nAVISOS\n'+warnings.join('\n'));}
if(errors.length){console.error('\nERRORES\n'+errors.join('\n'));process.exit(1);}
console.log('\nAUDITORÍA ESTÁTICA OK');