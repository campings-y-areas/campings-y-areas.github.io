(() => {
"use strict";
if(new URLSearchParams(location.search).get("pruebas")!=="manuel")return;

// La demo no debe volver a buscar imágenes automáticamente en Wikimedia Commons.
const fetchReal=window.fetch.bind(window);
window.fetch=(input,init)=>{
  const u=String(typeof input==="string"?input:input?.url||"");
  if(u.startsWith("https://commons.wikimedia.org/w/api.php"))return Promise.reject(new Error("Commons API desactivada en la demo: fotos deterministas"));
  return fetchReal(input,init);
};

const commons=(name)=>`https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(name)}?width=1280`;
const page=(name)=>`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name).replace(/%2F/g,"/")}`;
const C=(name,author,license)=>({url:commons(name),page:page(name),author,license});
const O=(url,label,pageUrl)=>({url,page:pageUrl||url,author:label,license:"Autorización expresa"});

const F={
"Basílica de la Sagrada Família":C("Barcelona Sagrada Familia.JPG","Jcca76","CC BY-SA 4.0"),
"Barrio Gótico":C("Carrer del Bisbe de Barcelona 001.jpg","Dieglop","CC BY-SA 4.0"),
"Mercat de la Boqueria":C("Mercat de la Boqueria 20171227.jpg","Suicasmo","CC BY-SA 4.0"),
"Monasterio de Montserrat":C("Montserrat Natural Park 4.jpg","Kallerna","CC BY-SA 4.0"),
"Camí dels Degotalls":C("Camí dels Degotalls - panoramio.jpg","Jorge Franganillo","CC BY 3.0"),
"Montserrat · gastronomía local":C("Mel i Mato (Camp Portel).jpg","Tamorlan","CC BY 3.0"),
"PortAventura Park":C("Port Aventura - panoramio.jpg","jmsolerb","CC BY 3.0"),
"Ferrari Land":C("Entrée de Ferrari Land.jpg","ThomasPA34","CC BY-SA 4.0"),
"Gold River Saloon":C("PortAventura2.jpg","Decoretro","CC BY-SA 3.0"),
"Parc Natural del Delta de l'Ebre":C("Família de flamencs (cropped).jpg","Xavier Grané Feliu","CC BY-SA 3.0 ES"),
"Platja del Trabucador":C("Platja de l'Aluet (Amposta, Tarragona).jpg","Juan Emilio Prades Bel","CC BY-SA 4.0"),
"Mercado Central de València":C("Mercado Central de Valencia 03.jpg","Bene Riobó","CC BY-SA 4.0"),
"La Lonja de la Seda":C("La Lonja de la Seda (420922387).jpg","Wikimedia Commons","licencia en ficha"),
"Casa Carmela":C("Paella valenciana.jpg","Juan Emilio Prades Bel","CC BY-SA 4.0 · imagen gastronómica"),
"Ciudad de las Artes y las Ciencias":C("Ciudad de las Artes y las Ciencias, Valencia, España, 2014-06-29, DD 39.JPG","Diego Delso","CC BY-SA 3.0"),
"Oceanogràfic":C("Oceanografic Valencia.JPG","Wikimedia Commons","CC BY-SA 3.0"),
"València marítima":C("Malvarrosa Beach, Valencia, Spain (30358191821).jpg","Boris Dzhingarov","CC BY 2.0"),
"Castillo de Santa Bárbara":C("Castello de Santa Bàrbara Alicante.jpg","Artistosteles","CC BY-SA 4.0"),
"Explanada de España":C("Explanada de España Alicante 1.jpg","Kallerna","CC BY-SA 4.0"),
"Nou Manolín":C("Arroz a banda (Alicante, 2026).jpg","Alvy","CC BY 4.0 · imagen gastronómica"),
"Teatro Romano de Cartagena":C("Teatro romano de Cartagena, España, 2022-07-16, DD 07.jpg","Diego Delso","CC BY-SA 4.0"),
"Cabo de Palos":C("Cabo de Palos, Carthagena, Spain.jpg","Wikimedia Commons","licencia en ficha"),
"Cartagena y Cabo de Palos":C("Caldero del Mar Menor.jpg","Wikimedia Commons","imagen gastronómica · licencia en ficha"),
"Alhambra y Generalife":C("Alhambra evening panorama Mirador San Nicolas sRGB-1 (cropped).jpg","Wikimedia Commons","licencia en ficha"),
"Albaicín y miradores":C("Albaicin-granada.JPG","Miguel303xm","CC BY-SA 2.5"),
"Bodegas Castañeda":C("Plato alpujarreño.jpg","Wikimedia Commons","imagen gastronómica · licencia en ficha"),
"Sierra Nevada":C("Sierra Nevada desde el embalse del Cubillas, en Atarfe (Granada).jpg","Lopezsuarez","CC0 1.0"),
"Güéjar Sierra":C("Vista de Barrio Alto, Güéjar Sierra.jpg","Ian Marshall (EyeMarshall)","CC BY-SA 4.0"),
"Güéjar Sierra · cocina de montaña":C("Plato alpujarreño.jpg","Wikimedia Commons","imagen gastronómica · licencia en ficha"),
"Alcazaba de Málaga":C("Malaga Alcazaba 25-9-2007a.JPG","Hedwig Storch","CC BY-SA 3.0"),
"Muelle Uno y Palmeral de las Sorpresas":C("Malaga Muelle 04 (11937355716).jpg","Martin Haisch","CC BY-SA 2.0"),
"El Tintero":C("Chirlas (cropped).jpg","Tamorlan","CC BY-SA 3.0 · foto tomada en El Tintero"),
"Caminito del Rey":C("Caminito del Rey, Málaga, España, 2023-05-18, DD 44.jpg","Diego Delso","CC BY-SA 4.0"),
"El Chorro":C("Caminito del Rey, Málaga, España, 2023-05-18, DD 44.jpg","Diego Delso","CC BY-SA 4.0"),
"Restaurante El Kiosko":C("IMG 1438. Bar restaurante el kiosko.jpg","Por los caminos de Málaga","CC BY 2.0"),
"Puente Nuevo":C("\"Puente Nuevo\" de Ronda.jpg","Andbog","CC BY-SA 4.0"),
"Casco histórico de Ronda":C("Old Moorish town - Calle Arminan, Ronda (14641819331).jpg","Elliott Brown","Wikimedia Commons"),
"Pedro Romero":C("Rabo de toro.jpg","Javier Lastras","CC BY 2.0 · imagen gastronómica"),
"Triana":C("Puente de triana 2013An010.jpg","Anual","CC BY-SA 4.0"),
"Paseo del Guadalquivir":C("Sevilla desde la Torre del Oro (1).jpg","Gzzz","CC BY-SA 4.0"),
"Casa Morales":C("Casa Morales (17344080461).jpg","Sandra Vallaure","CC BY 2.0"),
"Real Alcázar de Sevilla":C("Sevilla2005Julio 022.jpg","Daniel Csörföly","CC BY-SA 3.0"),
"Catedral y Giralda":C("La Giralda August 2012 Seville Spain.jpg","Jebulon","CC BY-SA 3.0"),
"Plaza de España y Parque de María Luisa":C("Sevilla Plaza de Espana 01.jpg","Mihael Grmek","CC BY-SA 3.0"),
"Sevilla · despedida de tapas":C("Sevilla Tapas.jpg","John Picken","CC BY 2.0 · imagen gastronómica"),

"Valencia Camper Park":O("https://valenciacamperpark.com/__l5e/assets-v1/e34775a4-4993-4150-8756-19cb4de027a5/vcp-1.jpg","Valencia Camper Park","https://valenciacamperpark.com/"),
"Camper Park Alicante":O("https://www.camperparkalicante.com/wp-content/uploads/2026/01/Camper-Park-Alicante-lleno-a.jpg","Camper Park Alicante","https://www.camperparkalicante.com/"),
"Área Autocaravanas Cartagena":O("https://areaautocaravanas.com/wp-content/uploads/2023/09/entrada1-1030x668.jpg","Área Autocaravanas Cartagena","https://areaautocaravanas.com/"),
"Área Málaga Beach":O("https://www.areamalagabeach.com/fotos/pasillo-central.jpg","Área Málaga Beach","https://www.areamalagabeach.com/"),
"Camping Parque Ardales":O("https://www.parqueardales.com/images/Caravanas%202.webp","Camping Parque Ardales","https://www.parqueardales.com/"),
"Camping El Sur":O("https://www.campingelsur.com/fotos/camping/01.jpg","Camping El Sur","https://www.campingelsur.com/"),
"Camping Villsom":O("https://campingvillsom.com/wp-content/uploads/2026/06/camping-villsom-14-768x476.jpg","Camping Villsom","https://campingvillsom.com/")
};

function titulo(t){return String(t||"").replace(/^⭐\s*/,"").replace(/^(Recomendado|Base recomendada)\s*·\s*/i,"").trim()}
function poner(c,f){if(!f)return;for(const old of c.querySelectorAll(":scope > .foto-recomendacion"))old.remove();const g=document.createElement("figure"),i=document.createElement("img"),p=document.createElement("figcaption"),a=document.createElement("a");g.className="foto-recomendacion foto-recomendacion-fija";i.loading="lazy";i.src=f.url;i.alt=titulo(c.querySelector("h4")?.textContent);a.href=f.page;a.target="_blank";a.rel="noopener";a.textContent=`${f.author} · ${f.license}`;p.append(a);g.append(i,p);c.insertBefore(g,c.querySelector("h4")?.nextSibling||c.firstChild)}
function aplicar(){for(const c of document.querySelectorAll(".guia-recomendacion")){const n=titulo(c.querySelector("h4")?.textContent),f=F[n];if(f)poner(c,f)}setTimeout(()=>{for(const c of document.querySelectorAll(".guia-recomendacion")){const n=titulo(c.querySelector("h4")?.textContent),f=F[n];if(f&&!c.querySelector(":scope > .foto-recomendacion-fija"))poner(c,f)}},1000)}
function pdfFinal(){setTimeout(()=>{const b=document.getElementById("imprimirDemoPdf");const etapas=document.getElementById("etapasRuta");if(!b||!etapas)return;let z=document.getElementById("accionesFinalesDemo");if(!z){z=document.createElement("div");z.id="accionesFinalesDemo";z.className="acciones-finales-demo";etapas.insertAdjacentElement("afterend",z)}z.appendChild(b)},1200)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{aplicar();pdfFinal()},{once:true});else{aplicar();pdfFinal()}
})();