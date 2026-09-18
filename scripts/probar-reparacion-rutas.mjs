import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const file='rutas.js';
const source=fs.readFileSync(file,'utf8');
let s=source;
const changes=[];
function replaceOnce(label,from,to){
  const n=s.split(from).length-1;
  if(n!==1)throw new Error(`${label}: se esperaba 1 coincidencia y hay ${n}`);
  s=s.replace(from,to);changes.push(label);
}

if(!s.includes('function nombreLocalidadWorker(')){
  const re=/function nombreLugarWorker\(lugar,fallback=""\)\{[\s\S]*?\n\}/;
  const matches=s.match(new RegExp(re.source,'g'))||[];
  if(matches.length!==1)throw new Error(`helper localidad: se esperaba 1 función nombreLugarWorker y hay ${matches.length}`);
  s=s.replace(re,`${matches[0]}\n\nfunction nombreLocalidadWorker(lugar,fallback=""){\n  return String(lugar?.city||lugar?.town||lugar?.village||lugar?.municipality||lugar?.county||fallback||"").trim();\n}`);
  changes.push('helper localidad');
}
if(s.includes('const place=nombreLugarWorker(rev,nombreLocalidad(rev));')){
  replaceOnce('corte tecnico localidad','const place=nombreLugarWorker(rev,nombreLocalidad(rev));','const place=nombreLocalidadWorker(rev,nombreLocalidad(rev));');
}
const oldPernocta=`const localidadPernocta=String(\n  nombreLugarWorker(revPernocta,localidadAlojamiento(cand))||""\n).trim();`;
if(s.includes(oldPernocta)){
  replaceOnce('pernocta localidad',oldPernocta,`const localidadPernocta=nombreLocalidadWorker(\n  revPernocta,\n  localidadAlojamiento(cand)\n);`);
}
const oldDup='if(ultimoLugar&&normalizarClaveMedia(nombre)===normalizarClaveMedia(ultimoLugar))score-=100;';
if(s.includes(oldDup)){
  replaceOnce('duplicados localidad-localidad',oldDup,'if(ultimoLugar&&localidadAlojamiento(cand)&&normalizarClaveMedia(localidadAlojamiento(cand))===normalizarClaveMedia(ultimoLugar))score-=100;');
}

if(changes.length)fs.writeFileSync(file,s);
execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
if(/const\s+localidadPernocta\s*=\s*String\(\s*nombreLugarWorker\s*\(/s.test(s))throw new Error('Sigue presente POI como localidad de pernocta');
if(/const\s+place\s*=\s*nombreLugarWorker\(rev,nombreLocalidad\(rev\)\)/.test(s))throw new Error('Sigue presente POI como localidad de corte');
if(/normalizarClaveMedia\(nombre\)===normalizarClaveMedia\(ultimoLugar\)/.test(s))throw new Error('Sigue presente comparación alojamiento-localidad');
console.log(changes.length?`Reparación aplicada: ${changes.join(', ')}`:'Rutas ya contiene la reparación geográfica.');
console.log('Sintaxis rutas.js: OK');