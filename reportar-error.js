(()=>{"use strict";
const form=document.getElementById("reportForm"),status=document.getElementById("formStatus"),btn=document.getElementById("sendBtn"),key=document.getElementById("accessKey"),origin=document.getElementById("origenPagina");
if(!form)return;
const ACCESS_KEY="07bc74fd-a27b-4fb9-b5cd-e6de8052e476";
key.value=ACCESS_KEY;
const q=new URLSearchParams(location.search);
origin.value=q.get("origen")||document.referrer||location.href;
const lugar=q.get("lugar");
if(lugar)form.elements.lugar.value=lugar;
function msg(text,type){status.textContent=text;status.className="status "+(type||"")}
form.addEventListener("submit",async e=>{
  e.preventDefault();msg("");if(!form.reportValidity())return;
  btn.disabled=true;btn.textContent="Enviando aviso…";
  try{
    const data=Object.fromEntries(new FormData(form));
    data.access_key=ACCESS_KEY;
    const r=await fetch("https://api.web3forms.com/submit",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(data)});
    const j=await r.json();
    if(!r.ok||!j.success)throw new Error(j.message||"No se pudo enviar");
    form.reset();
    origin.value=q.get("origen")||document.referrer||location.href;
    msg("✓ Gracias. Hemos recibido tu aviso. Revisaremos la información antes de realizar cualquier cambio.","ok");
  }catch(err){
    msg("No hemos podido enviar el aviso. Inténtalo de nuevo dentro de unos minutos.","err");
  }finally{
    btn.disabled=false;btn.textContent="Enviar aviso para revisión";
  }
});
})();