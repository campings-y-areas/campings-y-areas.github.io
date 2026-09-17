import fs from 'node:fs';

function load(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function save(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
function byId(data,id){const x=data.find(v=>v?.id===id);if(!x)throw new Error(`${id} no encontrado`);return x;}
function removeIds(file,ids){const data=load(file);const filtered=data.filter(x=>!ids.includes(x?.id));if(filtered.length!==data.length)save(file,filtered);}

// Fuera del ámbito europeo o archivados en el país equivocado sin identidad fiable para recolocarlos.
removeIds('areas-paises-bajos-definitivo.json',['nl-area-0427']); // Aruba
removeIds('areas-parkings-espana-v4-corregido.json',['punto-0017']); // Andorra

const lavFile='lavaderos-autocaravanas-v1.json';
let lav=load(lavFile);
const portugal=['lavadero-231','lavadero-232','lavadero-233','lavadero-234','lavadero-235','lavadero-236','lavadero-243','lavadero-244','lavadero-245','lavadero-266','lavadero-290'];
for(const id of portugal){const x=byId(lav,id);x.pais='Portugal';x.comunidad_autonoma=null;x.provincia=null;}
// Coordenada oficial publicada por SELPE: 36º12′16″N, 5º24′50″O.
{const x=byId(lav,'lavadero-461');x.lat=36.2044444444;x.lon=-5.4138888889;x.pais='España';x.comunidad_autonoma='Andalucía';x.provincia='Cádiz';x.localidad='San Roque';x.google_maps='https://www.google.com/maps/search/?api=1&query=36.2044444444,-5.4138888889';}
// Registros con coordenadas inequívocamente incompatibles y sin evidencia suficiente para inventar una corrección.
const eliminar=new Set(['lavadero-479','lavadero-481','lavadero-505','lavadero-506']);
lav=lav.filter(x=>!eliminar.has(x?.id));
save(lavFile,lav);

console.log('Reparaciones geográficas confirmadas aplicadas/verificadas sin inventar coordenadas.');
