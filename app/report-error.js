const form=document.getElementById("errorReportForm");
const status=document.getElementById("reportStatus");
const button=document.getElementById("reportSubmit");
const params=new URLSearchParams(location.search);

function show(text,type=""){
  status.textContent=text;
  status.className="report-status"+(type?" "+type:"");
}

if(form){
  const origin=document.getElementById("reportOrigin");
  const page=document.getElementById("reportPage");
  origin.value=params.get("origen")||params.get("page")||document.referrer||location.href;
  page.value=location.href;

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    show("");
    if(!form.reportValidity())return;

    button.disabled=true;
    const original=button.textContent;
    button.textContent="Enviando informe…";

    try{
      const formData=new FormData(form);
      const payload=Object.fromEntries(formData);
      payload.tipo_ficha=params.get("tipo")||"";
      payload.id_ficha=params.get("id")||"";
      payload.nombre_ficha=params.get("nombre")||"";

      const response=await fetch("https://api.web3forms.com/submit",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Accept":"application/json"
        },
        body:JSON.stringify(payload)
      });

      const result=await response.json();
      if(!response.ok||!result.success){
        throw new Error(result.message||"No se pudo enviar el informe");
      }

      form.reset();
      origin.value=params.get("origen")||params.get("page")||document.referrer||location.href;
      page.value=location.href;
      show("✓ Gracias. Hemos recibido tu aviso. Revisaremos la información antes de realizar cualquier cambio.","ok");
    }catch(error){
      console.error("Informe de error",error);
      show("No hemos podido enviar el aviso. Inténtalo de nuevo dentro de unos minutos.","err");
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  });
}