(() => {
  "use strict";
  if (new URLSearchParams(location.search).get("pruebas") !== "manuel") return;

  const commonsApi = "https://commons.wikimedia.org/w/api.php";
  const cache = new Map();

  function limpiarTitulo(t) {
    return String(t || "").replace(/^⭐\s*/, "").replace(/^(Recomendado|Base recomendada)\s*·\s*/i, "").trim();
  }

  function contextoTarjeta(card) {
    const dia = card.closest(".guia-dia-editorial");
    const seccion = card.closest(".guia-seccion-editorial");
    const nombre = limpiarTitulo(card.querySelector("h4")?.textContent);
    const destino = dia?.querySelector(".guia-dia-titulo h2")?.textContent || "España";
    const tipo = seccion?.querySelector("h3")?.textContent || "";
    return { nombre, destino, tipo };
  }

  function consultaCommons({nombre, destino, tipo}) {
    if (/Dónde comer/i.test(tipo)) return `${nombre} ${destino} food`;
    if (/Dónde dormir|Pernocta/i.test(tipo)) return `${nombre} ${destino} camping motorhome`;
    return `${nombre} ${destino}`;
  }

  async function buscarFoto(query) {
    if (cache.has(query)) return cache.get(query);
    const p = (async () => {
      const params = new URLSearchParams({
        origin: "*", action: "query", format: "json", generator: "search",
        gsrnamespace: "6", gsrsearch: query, gsrlimit: "6",
        prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "900"
      });
      const r = await fetch(`${commonsApi}?${params}`);
      if (!r.ok) return null;
      const j = await r.json();
      const pages = Object.values(j?.query?.pages || {});
      for (const page of pages) {
        const ii = page?.imageinfo?.[0];
        const url = ii?.thumburl || ii?.url;
        if (!url || !/\.(jpe?g|png|webp)(\?|$)/i.test(url)) continue;
        const meta = ii.extmetadata || {};
        return {
          url,
          page: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
          author: String(meta.Artist?.value || "Wikimedia Commons").replace(/<[^>]*>/g, "").trim(),
          license: meta.LicenseShortName?.value || "ver licencia"
        };
      }
      return null;
    })().catch(() => null);
    cache.set(query, p);
    return p;
  }

  function fotoFallback(card) {
    const hero = card.closest(".guia-dia-editorial")?.querySelector(".guia-foto img");
    const cap = card.closest(".guia-dia-editorial")?.querySelector(".guia-foto figcaption a");
    return hero ? {url: hero.currentSrc || hero.src, page: cap?.href || "https://commons.wikimedia.org/", author:"Imagen del destino", license:"Wikimedia Commons"} : null;
  }

  function insertarFoto(card, foto) {
    if (!foto || card.querySelector(":scope > .foto-recomendacion")) return;
    const fig = document.createElement("figure");
    fig.className = "foto-recomendacion";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = foto.url;
    img.alt = limpiarTitulo(card.querySelector("h4")?.textContent);
    const cap = document.createElement("figcaption");
    const a = document.createElement("a");
    a.href = foto.page;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = `${foto.author || "Wikimedia Commons"} · ${foto.license || "ver licencia"}`;
    cap.append(a);
    fig.append(img, cap);
    card.insertBefore(fig, card.querySelector("h4")?.nextSibling || card.firstChild);
  }

  async function completarFotos() {
    const cards = [...document.querySelectorAll(".guia-recomendacion")];
    for (const card of cards) {
      const ctx = contextoTarjeta(card);
      let foto = await buscarFoto(consultaCommons(ctx));
      if (!foto) foto = await buscarFoto(`${ctx.destino} Spain travel`);
      if (!foto) foto = fotoFallback(card);
      insertarFoto(card, foto);
    }
  }

  function instalarPDF() {
    const cabecera = document.querySelector(".resultado-cabecera");
    if (!cabecera || document.getElementById("imprimirDemoPdf")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "imprimirDemoPdf";
    b.className = "boton-secundario boton-pdf-demo";
    b.textContent = "🖨️ Imprimir / guardar en PDF";
    b.addEventListener("click", () => window.print());
    cabecera.appendChild(b);
  }

  function arrancar() {
    instalarPDF();
    completarFotos();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar, {once:true});
  else arrancar();
})();
