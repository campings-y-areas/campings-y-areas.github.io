import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const source=fs.readFileSync('rutas.js','utf8');
let s=source;
const changes=[];
function replaceOnce(label,from,to){
  const n=s.split(from).length-1;
  if(n!==1)throw new Error(`${label}: se esperaba 1 coincidencia y hay ${n}`);
  s=s.replace(from,to);changes.push(label);
}

if(!s.includes('function nombreLocalidadWorker(')){
  replaceOnce('helper localidad',
`function nombreLugarWorker(lugar,fallback=""){
  const otros=lugar?.other_names||{};
  const raw=lugar?.datasource?.raw||{};
  return otros.name||raw.name||otros["name:en"]||raw["name:en"]||lugar?.city||lugar?.town||lugar?.village||lugar?.municipality||lugar?.name||fallback||lugar?.formatted||"";
}`,
`function nombreLugarWorker(lugar,fallback=""){
  const otros=lugar?.other_names||{};
  const raw=lugar?.datasource?.raw||{};
  return otros.name||raw.name||otros["name:en"]||raw["name:en"]||lugar?.city||lugar?.town||lugar?.village||lugar?.municipality||lugar?.name||fallback||lugar?.formatted||"";
}

function nombreLocalidadWorker(lugar,fallback=""){
  return String(lugar?.city||lugar?.town||lugar?.village||lugar?.municipality||lugar?.county||fallback||"").trim();
}`);
}
replaceOnce('corte tecnico localidad','const place=nombreLugarWorker(rev,nombreLocalidad(rev));','const place=nombreLocalidadWorker(rev,nombreLocalidad(rev));');
replaceOnce('pernocta localidad',`const localidadPernocta=String(\n  nombreLugarWorker(revPernocta,localidadAlojamiento(cand))||""\n).trim();`,`const localidadPernocta=nombreLocalidadWorker(\n  revPernocta,\n  localidadAlojamiento(cand)\n);`);

const tmp=path.join(os.tmpdir(),'rutas-candidato-auditoria.js');
fs.writeFileSync(tmp,s);
execFileSync(process.execPath,['--check',tmp],{stdio:'inherit'});
if(/const\s+localidadPernocta\s*=\s*String\(\s*nombreLugarWorker\s*\(/s.test(s))throw new Error('Sigue presente POI como localidad de pernocta');
if(/const\s+place\s*=\s*nombreLugarWorker\(rev,nombreLocalidad\(rev\)\)/.test(s))throw new Error('Sigue presente POI como localidad de corte');
console.log(`Candidato exacto generado desde rutas.js actual: ${changes.join(', ')}`);
console.log('Sintaxis del candidato: OK');
