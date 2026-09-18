const form=document.getElementById("errorReportForm");
const status=document.getElementById("reportStatus");
const button=document.getElementById("reportSubmit");
const params=new URLSearchParams(location.search);

const WEB3FORMS_ACCESS_KEY="07bc74fd-a27b-4fb9-b5cd-e6de8052e476";

function value(id){return document.getElementById(id)?.value?.trim?.()||""}

form?.addEventListener("submit",async event=>{
  event.preventDefault();
  status.textContent="";
  if(!form.reportValidity())return;

  button.disabled=true;

  try{
    const payload={
      access_key:WEB3FORMS_ACCESS_KEY,
      subject:"Campings & Áreas · Nuevo reporte de información",
      tipo_problema:value("reportType"),
      message:value("reportDescription"),
      correccion_propuesta:value("reportCorrection"),
      name:value("reportName"),
      email:value("reportEmail"),
      botcheck:value("reportWebsite"),
      pagina_origen:params.get("page")||document.referrer||location.href,
      tipo_ficha:params.get("tipo")||"",
      id_ficha:params.get("id")||"",
      nombre_ficha:params.get("nombre")||""
    };

    const response=await fetch("https://api.web3forms.com/submit",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Accept":"application/json"
      },
      body:JSON.stringify(payload)
    });

    const result=await response.json().catch(()=>null);

    if(!response.ok||!result?.success){
      throw new Error(result?.message||`Web3Forms: ${response.status}`);
    }

    form.reset();
    status.textContent="Gracias. El informe se ha enviado correctamente.";
  }catch(error){
    console.error("Informe de error",error);
    status.textContent="No se ha podido enviar el informe. Inténtalo de nuevo más tarde.";
  }finally{
    button.disabled=false;
  }
});
