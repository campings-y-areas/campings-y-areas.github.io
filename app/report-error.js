import { backendRequest } from "./services/backend-client.js";
const form=document.getElementById("errorReportForm"), status=document.getElementById("reportStatus"), button=document.getElementById("reportSubmit");
const params=new URLSearchParams(location.search);
function value(id){return document.getElementById(id)?.value?.trim?.()||""}
form?.addEventListener("submit",async event=>{
 event.preventDefault(); status.textContent=""; button.disabled=true;
 try{
  await backendRequest("/report-error",{body:{
   type:value("reportType"),description:value("reportDescription"),correction:value("reportCorrection"),
   name:value("reportName"),email:value("reportEmail"),website:value("reportWebsite"),
   page:params.get("page")||document.referrer||"",item_type:params.get("tipo")||"",item_id:params.get("id")||"",
   item_name:params.get("nombre")||"",url:location.href
  }});
  form.reset(); status.textContent="Gracias. El informe se ha enviado correctamente.";
 }catch(error){console.error("Informe de error",error);status.textContent="No se ha podido enviar el informe. Inténtalo de nuevo más tarde."}
 finally{button.disabled=false}
});