function clean(value, max=4000){return String(value??"").trim().slice(0,max)}
function validEmail(value){return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
export async function reportError(request,env){
 const body=await request.json();
 if(clean(body.website,200)) return {ok:true,status:"reported"};
 const type=clean(body.type,120), description=clean(body.description,4000);
 if(!type||!description) throw new Error("Faltan los datos obligatorios del informe");
 const email=clean(body.email,254); if(!validEmail(email)) throw new Error("Email de contacto inválido");
 if(!env.REPORT_EMAIL?.send) throw new Error("Servicio de informes no configurado");
 const lines=[
  `Tipo: ${type}`,`Descripción: ${description}`,`Corrección propuesta: ${clean(body.correction,2000)||"-"}`,
  `Página/ficha: ${clean(body.page,1000)||"-"}`,`Tipo de ficha: ${clean(body.item_type,120)||"-"}`,
  `ID: ${clean(body.item_id,240)||"-"}`,`Nombre: ${clean(body.item_name,300)||"-"}`,`URL: ${clean(body.url,1000)||"-"}`,
  `Remitente: ${clean(body.name,120)||"-"}`,`Email de contacto: ${email||"-"}`
 ];
 await env.REPORT_EMAIL.send({to:env.REPORT_TO_EMAIL,from:env.REPORT_FROM_EMAIL,subject:`Campings & Áreas · ${type}`,text:lines.join("\n"),replyTo:email||undefined});
 return {ok:true,status:"reported"};
}
