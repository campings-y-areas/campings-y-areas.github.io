(() => {
  if (new URLSearchParams(location.search).get("pruebas") !== "manuel") return;
  const preserveAccess = () => document.querySelectorAll('a[href]').forEach(link => {
    const raw = link.getAttribute("href");
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) return;
    let url;
    try { url = new URL(raw, location.href); } catch { return; }
    if (url.origin !== location.origin || !url.pathname.toLowerCase().endsWith(".html")) return;
    url.searchParams.set("pruebas", "manuel");
    link.href = `${url.pathname.split("/").pop()}${url.search}${url.hash}`;
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", preserveAccess, { once: true });
  else preserveAccess();
})();
