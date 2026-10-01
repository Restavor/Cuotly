# Reglas de Restavor app y Restavor agents

Lista de los códigos de reglas de `PRD-RESTAVOR-AGENTS.md`, con el apartado donde se explican y el test que las cita.
Se rellena a medida que se construye cada fase. Regla de `CLAUDE.md`: toda regla con código tiene al menos un test que la cite en su nombre
(SQL si protege la base de datos, unitario si es lógica de `src/core/`).

## Fase A · Restavor app (la puerta común)

| Código | Qué dice | PRD | Test |
|---|---|---|---|
| RN-APP-01 | `my_products()` devuelve, para quien entra, qué productos puede abrir (`web`, `agents`) y qué puede contratar o ha solicitado (`agents_offer`, `agents_requests`). Un restaurante que solo tiene Reservas no da panel de Restavor web. | §4.2 | `supabase/tests/restavor_app_puerta_comun.sql` (tabla completa de `my_products()` y `my_contexts()`), `apps/web/src/core/app/products.test.ts` (menú del logo) |
| RN-APP-02 | El Inicio de Restavor app se enseña con dos productos, o con uno y algo que contratar o una solicitud, o sin ninguno. Solo se salta con un único producto y nada que contratar. | §4.3 | `apps/web/src/core/app/products.test.ts` (`homeBehavior`), `apps/web/e2e/flujos-espacio-demo.spec.ts` (el trabajador entra directo en `/web`; el restaurante con algo que contratar ve el Inicio) |
| RN-APP-03 | Contratar Reservas crea una solicitud `requested` con la aceptación de las condiciones, avisa al restaurante y al equipo y no crea nada más. Ninguna otra vía crea una suscripción al servicio Reservas. Una sola solicitud `requested` por restaurante. | §4.4 | `supabase/tests/restavor_app_puerta_comun.sql` (solicitud, aceptación, avisos, trigger, en nombre del restaurante, «¿Qué te interesa?»), `apps/web/src/core/access-requests.test.ts`, `apps/web/src/app/(auth)/actions.test.ts`, `apps/web/src/core/app/reservation-notifications.test.ts`, `apps/web/e2e/flujos-espacio-demo.spec.ts` (contratar y ver la solicitud en el espacio) |

**Decisión 99 (push al momento, correo en tanda):** `supabase/tests/restavor_app_puerta_comun.sql` (el reclamo `claim_push_deliveries_for_keys` devuelve solo el push y no toca el correo) y `apps/web/src/services/queue-runner.test.ts` (`sendPushNow`).

## Fases siguientes (pendientes)
`RN-AGT-01 a 09` (saldo), `RN-RES-01 a 13` (Reservas), `RN-LLA-01 a 17` (agente de llamadas): se asignan en orden al construir cada fase.
