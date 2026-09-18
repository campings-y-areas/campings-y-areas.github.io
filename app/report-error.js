const form=document.getElementById("errorReportForm");
const status=document.getElementById("reportStatus");
const button=document.getElementById("reportSubmit");
const params=new URLSearchParams(location.search);
const ACCESS_KEY="07bc74fd-a27b-4fb9-b5cd-e6de8052e476";

function value(id){return document.getElementById(id)?.value?.trim?.()||""}
function show(text,type=""){status.textContent=text;status.className=type}

form?.addEventListener("submit",async event=>{
  event.preventDefault();
  show("");
  if(!form.reportValidity())return;
  button.disabled=true;
  const original=button.textContent;
  button.textContent="Enviando informe…";
  try{
    const payload={
      access_key:ACCESS_KEY,
      subject:"Campings & Áreas · Nuevo reporte de información",
      tipo_problema:value("reportType"),
      mensaje:value("reportDescription"),
      correccion_propuesta:value("reportCorrection"),
      nombre:value("reportName"),
      email:value("reportEmail"),
      origen_pagina:params.get("origen")||params.get("page")||document.referrer||location.href,
      tipo_ficha:params.get("tipo")||"",
      id_ficha:params.get("id")||"",
      nombre_ficha:params.get("nombre")||"",
      pagina_actual:location.href,
      botcheck:value("reportWebsite")
    };
    const response=await fetch("https://api.web3forms.com/submit",{
      method:"POST",
      headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify(payload)
    });
    const result=await response.json().catch(()=>null);
    if(!response.ok||!result?.success)throw new Error(result?.message||"No se pudo enviar");
    form.reset();
    show("✓ Gracias. Hemos recibido tu aviso. Revisaremos la información antes de realizar cualquier cambio.","ok");
  }catch(error){
    console.error("Informe de error",error);
    show("No hemos podido enviar el aviso. Inténtalo de nuevo dentro de unos minutos.","err");
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
});
