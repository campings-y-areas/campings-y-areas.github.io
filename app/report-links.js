(() => {
  const pageType = document.body?.dataset?.section || document.title.split("|")[0].trim();

  function reportUrl(container) {
    const card = container.closest("article, .ficha-camping, .popup-camping, .tarjeta, li") || container.parentElement;
    const title = card?.querySelector("h2, h3, h4, strong")?.textContent?.trim() || "";
    const params = new URLSearchParams({ page: location.pathname.split("/").pop() || "index.html", tipo: pageType });
    if (title) params.set("nombre", title);
    if (new URLSearchParams(location.search).get("pruebas") === "manuel") params.set("pruebas", "manuel");
    return `informar-error.html?${params.toString()}`;
  }

  function addLink(container) {
    if (!(container instanceof Element) || container.querySelector(".enlace-informar-error")) return;
    const link = document.createElement("a");
    link.className = "enlace-informar-error";
    link.href = reportUrl(container);
    link.textContent = "⚠️ Informar de un error";
    container.appendChild(link);
  }

  function scan(root = document) {
    if (root.matches?.(".enlaces-camping, .popup-camping__enlaces")) addLink(root);
    root.querySelectorAll?.(".enlaces-camping, .popup-camping__enlaces").forEach(addLink);
  }

  const start = () => {
    scan();
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) scan(node);
    }))).observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
