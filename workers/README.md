# Workers de Rutas Premium

Este directorio conserva en GitHub las fuentes completas que deben corresponder a
los tres despliegues de Cloudflare relacionados con Rutas:

- `route-worker/index.js`: Worker histórico activo para `rutas.html`. Incluye D1,
  investigación, Planner, Writer, multimedia y el wrapper Premium.
- `premium-worker/index.js`: autenticación, Stripe y cuota mensual.
- `route-worker-v3/index.js`: Worker del contrato modular v3. Está desplegado, pero
  no puede sustituir al histórico mientras el frontend activo necesite los endpoints
  de investigación y multimedia.

El código importado reproduce las fuentes desplegadas recuperadas el 21-09-2026.
Los dos Route Workers cambian únicamente el identificador de consumo de FNV-1a de
32 bits a SHA-256. Ninguno debe desplegarse desde un editor manual sin reflejar antes
el mismo commit aquí.

## Dependencias que deben verificarse antes de desplegar

1. `route-worker` necesita el binding D1 histórico y el Service Binding
   `PREMIUM_AUTH` dirigido a `premium-worker`.
2. `route-worker-v3` necesita el mismo Service Binding si se mantiene desplegado.
3. `premium-worker` necesita su D1, secretos de sesión/correo/Stripe, precios del
   entorno elegido y la restricción única documentada en `migrations/`.
4. Los flags de OpenAI deben permanecer cerrados durante validaciones gratuitas.
5. La migración D1 no se ejecuta a ciegas: primero se consulta si existen duplicados.

El frontend de producción sigue usando `route-worker`. La migración completa al
contrato v3 es trabajo independiente y exige implementar o retirar de forma explícita
los endpoints históricos; no se resuelve cambiando una URL.
