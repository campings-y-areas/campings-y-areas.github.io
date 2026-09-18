# Auditoría global de coordenadas — 2026-09-16

## Alcance
Control gratuito de todos los JSON del repositorio, sin llamadas a OpenAI y sin modificar automáticamente coordenadas.

Referencia geográfica: Natural Earth Admin 0 Countries ISO 1:10m, fijada al commit `9380cca83db5f9aef52d5e762765100745f84b27`.

## Resultado bruto
- Coordenadas únicas revisadas: **49.764**
- Registros con país esperado verificable: **47.735**
- Latitud/longitud aparentemente intercambiadas: **0**
- Coordenadas `0,0`: **0**
- Puntos que el control sitúa en otro país: **422**
- Puntos fuera de polígonos terrestres, incluidos costa/islas que requieren revisión: **3.579**

## Hallazgo importante
El problema no está limitado a Francia. Aparecen sospechas en bases de varios países y tipos de datos.

Entre los 422 casos de país distinto hay **147 puntos claramente fuera del ámbito europeo por posición geográfica**: 146 pertenecen al fichero de campings de Francia (principalmente territorios de ultramar como Reunión, Nueva Caledonia, Guayana Francesa y Polinesia Francesa) y 1 al fichero de áreas de Países Bajos (Aruba).

Los otros casos de país distinto se concentran en buena parte cerca de fronteras. No deben corregirse automáticamente: un polígono cartográfico y un punto situado junto a una frontera pueden producir falsos positivos. Cada caso debe distinguir entre dato realmente mal clasificado y precisión de frontera.

Los 3.579 casos tierra/mar tampoco se consideran automáticamente erróneos. Muchos corresponden a costa, islas, puertos, playas o geometrías costeras. Se conservan como lista de revisión y no se inventan coordenadas nuevas.

## Regla de seguridad
1. No mover coordenadas por aproximación.
2. No sustituir coordenadas dudosas por valores inventados.
3. Separar errores inequívocos de casos fronterizos/costeros.
4. Verificar antes de corregir o eliminar un registro.
5. Repetir la auditoría completa después de cualquier lote de correcciones.

El informe completo se genera como artefacto `auditoria-coordenadas` en GitHub Actions.