(() => {
  "use strict";
  if (new URLSearchParams(location.search).get("pruebas") !== "manuel") return;

  const commonsApi = "https://commons.wikimedia.org/w/api.php";
  const cache = new Map();
  const strip = s => String(s || "").replace(/<[^>]*>/g, "").trim();
  const limpiarTitulo = t => String(t || "").replace(/^⭐\s*/, "").replace(/^(Recomendado|Base recomendada)\s*·\s*/i, "").trim();

  const style = document.createElement("style");
  style.textContent = `
    .foto-recomendacion{margin:.7rem 0 .85rem;border-radius:12px;overflow:hidden;background:#e8eeec;position:relative;aspect-ratio:16/9}
    .foto-recomendacion img{width:100%;height:100%;object-fit:cover;display:block}
    .foto-recomendacion figcaption{position:absolute;left:.45rem;right:.45rem;bottom:.45rem;background:rgba(0,0,0,.66);color:#fff;padding:.28rem .42rem;border-radius:7px;font-size:.64rem;line-height:1.25}
    .foto-recomendacion figcaption a{color:#fff;text-decoration:none}
    .boton-pdf-demo{cursor:pointer;font:inherit}
    @media print{
      @page{size:A4;margin:12mm}
      body{background:#fff!important;color:#111!important}
      .cabecera-demo,.intro-demo,.boton-secundario,.navegacion-ruta,.ruta-dia,.leaflet-control-container,.creditos-demo{display:none!important}
      .contenedor{width:100%!important;margin:0!important;padding:0!important}
      .resultado-real{box-shadow:none!important;border:0!important;padding:0!important}
      .resultado-cabecera{display:block!important;margin:0 0 8mm!important}
      .resultado-cabecera h2:after{content:" · España en autocaravana · 15 días"}
      .mapa-ruta{height:85mm!important;break-after:page}
      .guia-dia-editorial{break-before:page;box-shadow:none!important;border:1px solid #ccc!important}
      .guia-recomendacion{break-inside:avoid}
      .guia-foto{max-height:90mm}
      .foto-recomendacion{max-height:58mm}
      a{color:inherit!important;text-decoration:none!important}
    }`;
  document.head.appendChild(style);

  function contextoTarjeta(card) {
    const dia = card.closest(".guia-dia-editorial");
    const seccion = card.closest(".guia-seccion-editorial");
    return {
      nombre: limpiarTitulo(card.querySelector("h4")?.textContent),
      destino: dia?.querySelector(".guia-dia-titulo h2")?.textContent || "España",
      tipo: seccion?.querySelector("h3")?.textContent || ""
    };
  }

  function consultaCommons({nombre, destino, tipo}) {
    if (/Dónde comer/i.test(tipo)) return `${nombre} ${destino} cuisine restaurant`;
    if (/Dónde dormir|Pernocta/i.test(tipo)) return `${nombre} ${destino} camping`;
    return `${nombre} ${destino}`;
  }

  async function buscarFoto(query) {
    if (cache.has(query)) return cache.get(query);
    const p = (async () => {
      const params = new URLSearchParams({origin:"*",action:"query",format:"json",generator:"search",gsrnamespace:"6",gsrsearch:query,gsrlimit:"8",prop:"imageinfo",iiprop:"url|extmetadata",iiurlwidth:"1000"});
      const r = await fetch(`${commonsApi}?${params}`);
      if (!r.ok) return null;
      const j = await r.json();
      for (const page of Object.values(j?.query?.pages || {})) {
        const ii = page?.imageinfo?.[0];
        const url = ii?.thumburl || ii?.url;
        if (!url || !/\.(jpe?g|png|webp)(\?|$)/i.test(url)) continue;
        const meta = ii.extmetadata || {};
        return {url,page:ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,author:strip(meta.Artist?.value)||"Wikimedia Commons",license:meta.LicenseShortName?.value||"ver licencia"};
      }
      return null;
    })().catch(() => null);
    cache.set(query,p);
    return p;
  }

  function figura(foto, alt, clase) {
    const fig=document.createElement("figure"); fig.className=clase;
    const img=document.createElement("img"); img.loading="lazy"; img.src=foto.url; img.alt=alt;
    const cap=document.createElement("figcaption"); const a=document.createElement("a");
    a.href=foto.page; a.target="_blank"; a.rel="noopener"; a.textContent=`${foto.author} · ${foto.license}`;
    cap.append(a); fig.append(img,cap); return fig;
  }

  async function completarHeroes() {
    for (const dia of document.querySelectorAll(".guia-dia-editorial")) {
      if (dia.querySelector(":scope > .guia-foto")) continue;
      const titulo=dia.querySelector(".guia-dia-titulo h2")?.textContent||"España";
      const foto=await buscarFoto(`${titulo} Spain landmark travel`);
      if (!foto) continue;
      const title=dia.querySelector(".guia-dia-titulo");
      title?.insertAdjacentElement("afterend",figura(foto,titulo,"guia-foto"));
    }
  }

  async function completarTarjetas() {
    for (const card of document.querySelectorAll(".guia-recomendacion")) {
      if (card.querySelector(":scope > .foto-recomendacion")) continue;
      const ctx=contextoTarjeta(card);
      let foto=await buscarFoto(consultaCommons(ctx));
      if (!foto) foto=await buscarFoto(`${ctx.destino} Spain travel`);
      if (!foto) {
        const hero=card.closest(".guia-dia-editorial")?.querySelector(".guia-foto img");
        const link=card.closest(".guia-dia-editorial")?.querySelector(".guia-foto figcaption a");
        if (hero) foto={url:hero.currentSrc||hero.src,page:link?.href||"https://commons.wikimedia.org/",author:"Imagen del destino",license:"Wikimedia Commons"};
      }
      if (!foto) continue;
      const h=card.querySelector("h4");
      h?.insertAdjacentElement("afterend",figura(foto,ctx.nombre,"foto-recomendacion"));
    }
  }

  function instalarPDF() {
    const cabecera=document.querySelector(".resultado-cabecera");
    if (!cabecera || document.getElementById("imprimirDemoPdf")) return;
    const b=document.createElement("button"); b.type="button"; b.id="imprimirDemoPdf"; b.className="boton-secundario boton-pdf-demo";
    b.textContent="🖨️ Imprimir / guardar en PDF";
    b.addEventListener("click",()=>window.print());
    cabecera.appendChild(b);
  }

  async function arrancar(){instalarPDF();await completarHeroes();await completarTarjetas();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",arrancar,{once:true});else arrancar();
})();
