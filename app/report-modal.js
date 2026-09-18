import { backendRequest } from "./services/backend-client.js";

const REPORT_LINK = 'a[href*="informar-error.html"]';

function field(form, name) {
  return form.elements.namedItem(name)?.value?.trim?.() || "";
}

function createModal() {
  const dialog = document.createElement("dialog");
  dialog.className = "reporte-modal";
  dialog.innerHTML = `
    <div class="reporte-modal-cabecera">
      <div><p>AYÚDANOS A MEJORAR</p><h2>⚠️ Informar de un error</h2></div>
      <button type="button" class="reporte-modal-cerrar" aria-label="Cerrar">×</button>
    </div>
    <p class="reporte-modal-intro">Cuéntanos qué información debemos revisar o qué parte de la web no funciona correctamente.</p>
    <form class="reporte-modal-formulario">
      <input type="hidden" name="page"><input type="hidden" name="item_type"><input type="hidden" name="item_id"><input type="hidden" name="item_name">
      <label><span>Tipo de problema *</span><select name="type" required><option value="">Selecciona una opción</option><option>Información incorrecta</option><option>Lugar cerrado</option><option>Ubicación o servicios incorrectos</option><option>Enlace roto</option><option>Funcionamiento de la web</option><option>Otro</option></select></label>
      <label><span>¿Qué ocurre? *</span><textarea name="description" rows="5" maxlength="4000" required placeholder="Describe el error con detalle"></textarea></label>
      <label><span>Dato correcto propuesto <small>(opcional)</small></span><textarea name="correction" rows="3" maxlength="2000" placeholder="Escribe aquí la información correcta si la conoces"></textarea></label>
      <div class="reporte-modal-doble">
        <label><span>Tu nombre <small>(opcional)</small></span><input name="name" maxlength="120" autocomplete="name"></label>
        <label><span>Tu email <small>(opcional)</small></span><input name="email" type="email" maxlength="254" autocomplete="email"></label>
      </div>
      <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="reporte-trampa">
      <div class="reporte-modal-acciones"><button type="button" class="reporte-modal-cancelar">Cancelar</button><button type="submit">Enviar informe</button></div>
      <p class="reporte-modal-estado" role="status" aria-live="polite"></p>
    </form>`;
  document.body.append(dialog);

  const close = () => dialog.close();
  dialog.querySelector(".reporte-modal-cerrar").addEventListener("click", close);
  dialog.querySelector(".reporte-modal-cancelar").addEventListener("click", close);
  dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });

  const form = dialog.querySelector("form");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const status = form.querySelector(".reporte-modal-estado");
    const submit = form.querySelector('[type="submit"]');
    status.textContent = "Enviando…";
    status.classList.remove("es-error", "es-correcto");
    submit.disabled = true;
    try {
      await backendRequest("/report-error", { body: {
        type: field(form, "type"), description: field(form, "description"), correction: field(form, "correction"),
        name: field(form, "name"), email: field(form, "email"), website: field(form, "website"),
        page: field(form, "page"), item_type: field(form, "item_type"), item_id: field(form, "item_id"),
        item_name: field(form, "item_name"), url: location.href
      }});
      status.textContent = "Gracias. El informe se ha enviado correctamente.";
      status.classList.add("es-correcto");
      form.reset();
      setTimeout(() => dialog.open && close(), 1800);
    } catch (error) {
      console.error("Informe de error", error);
      status.textContent = "No se ha podido enviar. Inténtalo de nuevo más tarde.";
      status.classList.add("es-error");
    } finally {
      submit.disabled = false;
    }
  });
  return dialog;
}

let modal;
document.addEventListener("click", event => {
  const link = event.target.closest?.(REPORT_LINK);
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  modal ||= createModal();
  const url = new URL(link.href, location.href);
  const form = modal.querySelector("form");
  form.reset();
  form.elements.page.value = url.searchParams.get("page") || location.pathname.split("/").pop() || "index.html";
  form.elements.item_type.value = url.searchParams.get("tipo") || document.body.dataset.section || "";
  form.elements.item_id.value = url.searchParams.get("id") || "";
  form.elements.item_name.value = url.searchParams.get("nombre") || "";
  modal.querySelector(".reporte-modal-estado").textContent = "";
  modal.showModal();
});
