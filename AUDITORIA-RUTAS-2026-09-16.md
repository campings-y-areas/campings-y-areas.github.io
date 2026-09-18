# Auditoría integral — Rutas Campings & Áreas IA — 2026-09-16

## Regla operativa

- OpenAI permanece cerrado durante toda la auditoría y reparación.
- No se autoriza ninguna prueba de pago hasta superar la auditoría estática y las pruebas gratuitas.
- Los cambios se preparan en esta rama y no se incorporan a `main` hasta revisión final.

## Alcance obligatorio

1. Identidad geográfica de etapas y separación de pernocta/localidad.
2. Compatibilidad y trazabilidad de campings, áreas y parkings.
3. Investigación D1/OpenAI y controles de calidad por tipo de parada.
4. Continuación segura ante fallos parciales y diagnóstico completo.
5. Planner y Writer: contratos, contenido verificado y manejo de rechazos.
6. Multimedia: aislamiento, coste y degradación segura.
7. Caché D1: reutilización, vigencia y ausencia de regeneración accidental.
8. Protección de coste y autorización de endpoints con gasto.
9. Endpoints de diagnóstico y rutas almacenadas.
10. Vehículos y opciones de pernocta coherentes.
11. Sintaxis JS, parseo de JSON y referencias locales HTML.
12. Regresiones del resto de la web y estado de la portada.

## Criterio de cierre

No se considera terminado mientras exista un fallo conocido de severidad alta/crítica, falle una comprobación gratuita, o la segunda auditoría integral detecte una regresión. La prueba real con OpenAI será posterior y única cuando el sistema esté estáticamente limpio.