function clean(value, max=4000){return String(value??"").trim().slice(0,max)}
function validEmail(value){return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}

export class ReportError extends Error {
 constructor(message, status="invalid_report", httpStatus=400){
  super(message); this.name="ReportError"; this.status=status; this.httpStatus=httpStatus;
 }
}

export async function reportError(request,env){
 let body;
 try { body=await request.json(); }
 catch { throw new ReportError("El informe debe contener JSON válido"); }
 if(clean(body.website,200)) return {ok:true,status:"reported"};
 const type=clean(body.type,120), description=clean(body.description,4000);
 if(!type||!description) throw new ReportError("Faltan los datos obligatorios del informe");
 const email=clean(body.email,254); if(!validEmail(email)) throw new ReportError("Email de contacto inválido");
 if(!env.REPORT_TO_EMAIL||!env.REPORT_FROM_EMAIL||!env.REPORT_EMAIL?.send) {
  throw new ReportError("Servicio de informes no configurado","report_service_unavailable",503);
 }
 const lines=[
  `Tipo: ${type}`,`Descripción: ${description}`,`Corrección propuesta: ${clean(body.correction,2000)||"-"}`,
  `Página/ficha: ${clean(body.page,1000)||"-"}`,`Tipo de ficha: ${clean(body.item_type,120)||"-"}`,
  `ID: ${clean(body.item_id,240)||"-"}`,`Nombre: ${clean(body.item_name,300)||"-"}`,`URL: ${clean(body.url,1000)||"-"}`,
  `Remitente: ${clean(body.name,120)||"-"}`,`Email de contacto: ${email||"-"}`
 ];
 try {
  await env.REPORT_EMAIL.send({to:env.REPORT_TO_EMAIL,from:env.REPORT_FROM_EMAIL,subject:`Campings & Áreas · ${type}`,text:lines.join("\n"),replyTo:email||undefined});
 } catch {
  throw new ReportError("No se pudo enviar el informe","report_delivery_failed",502);
 }
 return {ok:true,status:"reported"};
}
