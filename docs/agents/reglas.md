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

## Fase B · Cimientos de Restavor agents

| Código | Qué dice | PRD | Test |
|---|---|---|---|
| RN-APP-04 | `canReservations(actor, acción, recurso)` decide quién puede qué en Reservas: Propietario, Encargado, Equipo con PIN, Restavor, Soporte en sesión. Sin sesión de soporte, Restavor no ve datos de comensales. | §3.2 | `apps/web/src/core/reservations/permissions.test.ts` (la tabla completa) |
| RN-APP-05 | En la tablet sin PIN no aparecen Saldo, Plan y pagos, Ajustes, la columna de coste de las llamadas ni ningún importe. | §3.2 | `apps/web/src/core/reservations/permissions.test.ts`, `apps/web/src/components/shell/navigation-agents.test.ts` |
| RN-AGT-01 | El saldo de un restaurante es la suma de `agent_balance_entries`, un libro inmutable con signo en millonésimas de euro. Un apunte nunca se edita ni se borra. | §5.2 | `supabase/tests/reservas_cimientos.sql` |
| RN-RES-01 | Turnos y huecos: un turno tiene días, apertura, última hora de reserva, cierre y aforo; los huecos van cada 15 o 30 minutos de la apertura a la última hora; un día sin turno activo o cerrado no tiene huecos. | §6.2 | `apps/web/src/core/reservations/shifts.test.ts`, `dates.test.ts`, `phone.test.ts` |
| RN-RES-02 | (parcial, Fase B) El aforo de un turno se enseña con su barra: verde, mostaza («Casi lleno») desde el 85 % y rojo («Aforo superado») por encima del 100 %; plazas libres = aforo − ocupación. Lo que decide si una reserva cabe es de la Fase C. | §6.3 | `apps/web/src/core/reservations/capacity.test.ts`, `apps/web/src/components/agents/components.test.tsx` |
| RN-RES-06 | (parcial, Fase B) Un teléfono se normaliza a E.164, España por defecto; dos teléfonos escritos distinto son el mismo si normalizan igual. Las posibles duplicadas son de la Fase C. | §6.7, §9 | `apps/web/src/core/reservations/phone.test.ts` |
| RN-RES-12 | Datos de comensales: cada restaurante solo ve lo suyo; el equipo del espacio no ve reservas, eventos, avisos ni llamadas salvo con sesión de soporte de Reservas abierta, `aal2` y marca de soporte; `reservation_events` y `audit_log` no guardan datos personales. | §6.13, §3.4, §8.8 | `supabase/tests/reservas_cimientos.sql` |

La lista de tablas sin `space_id` que cita el PRD (§8.6, «suite 42») está en el barrido de `supabase/tests/hito7_mensajes_archivos_finanzas.sql`.

## Fases siguientes (pendientes)
`RN-AGT-02 a 09` (saldo), `RN-RES-02 a 11` y `RN-RES-13` (Reservas; la 02 y la 06 ya tienen su parte de dominio, arriba), `RN-LLA-01 a 17` (agente de llamadas): se asignan en orden al construir cada fase.
