# CLAUDE.md — Cuotly

Reglas permanentes de este repositorio. Son obligatorias, no sugerencias.
La especificación funcional está en `docs/PRD.md`. El plan de fases en `docs/ROADMAP.md`.
El documento maestro completo del producto está en `docs/ESPECIFICACION-MAESTRA.md` (referencia de fondo).

**Jerarquía de autoridad:** `CLAUDE.md` > `docs/PRD.md` > `docs/ESPECIFICACION-MAESTRA.md`.
Si detectas una contradicción entre los tres, PARA y pregúntame. No la resuelvas por tu cuenta.

---

## Comandos

```bash
pnpm dev              # servidor de desarrollo
pnpm typecheck        # comprobación de tipos (debe pasar siempre)
pnpm lint             # eslint
pnpm test             # tests unitarios (vitest)
pnpm test:e2e         # tests end-to-end (playwright)
supabase start        # base de datos local
supabase db reset     # recrear BD local aplicando migraciones + seed
supabase migration new <nombre>   # nueva migración (NUNCA editar una migración ya aplicada)
```

## Flujo de trabajo obligatorio

1. Antes de escribir código de una tarea nueva, lee las secciones del PRD que la cubren.
2. Al terminar cada tarea: `pnpm typecheck && pnpm lint && pnpm test`. No declares una tarea terminada si algo falla.
3. Toda regla de negocio con número (`RN-xxx`) del PRD debe tener al menos un test que la cubra, y el test debe citar el número de la regla en su nombre.
4. Cada migración de base de datos es un archivo nuevo y versionado. Nunca modifiques una migración existente.
5. Cuando termines un hito del ROADMAP, para y avísame antes de empezar el siguiente.

## Reglas duras de producto

- **MUST**: toda operación se valida en el servidor. Ocultar un botón NO es un control de acceso. Una función no está terminada hasta que un usuario sin permiso tampoco pueda ejecutarla por URL o llamada directa.
- **MUST**: toda tabla que pertenezca a un espacio lleva `space_id NOT NULL` y tiene RLS **activado** con políticas explícitas. Ninguna tabla se crea sin RLS.
- **MUST**: los cálculos de consumos, permisos, pagos, contadores de tiempo y estados derivados se hacen en el servidor. El cliente nunca es la autoridad.
- **MUST**: consumos y movimientos financieros se registran como **libro inmutable** de apuntes con signo. NUNCA un contador que se actualiza con UPDATE.
- **MUST**: todo cambio de estado relevante genera un evento y un registro de auditoría con actor, fecha, valor anterior, valor nuevo y motivo cuando proceda. Los registros de auditoría no se editan ni se borran desde la aplicación.
- **MUST**: las operaciones críticas (aceptar, comenzar, publicar, pagar, consumir crédito) usan transacción + clave de idempotencia. Pulsar dos veces nunca duplica el efecto.
- **MUST**: las fechas se guardan en `timestamptz` y se calculan en la zona horaria del espacio.
- **MUST NOT**: mostrar al cliente el nombre, foto o identidad individual de nadie del equipo de mantenimiento. El cliente siempre ve "Equipo de mantenimiento". Como RLS filtra filas pero **no columnas**, esto se sostiene con privilegios de columna: `revoke select on <tabla> from anon, authenticated` seguido de `grant select (<columnas sin identidad>)`. Consecuencia práctica que hay que tener presente al escribir pantallas: **`select *` sobre esas tablas devuelve 403**, y también filtrar u ordenar por una columna revocada — toda consulta debe enumerar columnas. Afecta hoy a `messages`, `message_edits`, `files`, `file_versions`, `file_links`, `charges`, `payments`, `payment_confirmations`, `receipts`, `financial_entries`, `requests`, `subscriptions`, `corrections`, `plan_commitments`, `scheduled_plan_changes`, `space_requests`, `cuotly_payments` y `cuotly_ledger_entries`. Cuando el equipo sí necesita ver quién hizo qué, sale de `audit_log` o de una función que comprueba permisos, nunca de la columna.
  El privilegio de columna es para tablas cuya **fila** sí es del cliente (su mensaje, su archivo, su corrección) y solo hay que taparle una columna. Cuando la fila entera es organización interna del equipo —`assignments`, `tasks` y los `state_events` de tarea— no se tapa la columna: se deja al cliente fuera de la fila con RLS (principio P7 del PRD, "el cliente no ve la organización interna"). Confundir los dos casos fue el bloqueante B2 de la cuarta revisión.
  Nada de esto se sostiene con una lista escrita a mano: se escapó tres veces. Lo que lo sostiene es el barrido de `supabase/tests/hito7_mensajes_archivos_finanzas.sql`, que recorre **todas** las columnas con clave ajena a `profiles` sentado como cliente y falla si alguna le devuelve el uuid de alguien del equipo.
- **MUST**: el sombrero de plataforma —Bosco y los Administradores de Cuotly— solo existe en una sesión verificada en dos pasos (§136, RN-ADM-02, migración 91). `is_platform_owner()` exige el reclamo `aal2` del token y todo lo de plataforma cuelga de ella; no se añade ninguna función de plataforma que no pase por `is_platform_owner()`, `is_platform_member()` o una de las cuatro de permiso fino (la cuarta, `is_platform_account_manager()`, llegó con la migración 140: eliminar y recuperar cuentas, espacios y restaurantes, RN-ADM-14). En las suites se declara con `set_config('request.jwt.claim.aal', 'aal2', false)`; sin esa línea, Bosco es un usuario normal y la suite falla en silencio del lado equivocado.
- **MUST NOT**: entrar en un espacio ajeno por otra vía que no sea Modo soporte (§129, §134, RN-ADM-06/07). La puerta está en `is_space_member()` y `has_capability_as()`, que reconocen una sesión de `support_sessions` activa; nunca se añade una excepción por tabla ni una fila en `space_memberships`. Toda tabla nueva con `space_id` lleva el disparador de solo lectura en soporte (`<tabla>_guard_support_read_only`) o se justifica en la lista de exentas de la suite 42.
- **MUST NOT**: mostrar datos ficticios, de ejemplo o rellenos de relleno en pantallas de producción. Si no hay dato, se dice cuál es el motivo (no conectado / sin datos todavía / error / periodo insuficiente).
- **MUST NOT**: borrar físicamente registros de negocio. Se archiva o se marca como eliminado.
- **MUST**: una función interna (`SECURITY DEFINER` que no comprueba permisos por su cuenta, o reservada a `service_role`) se protege con `revoke all on function ... from public, anon, authenticated`. **Nunca solo `from public`**: un proyecto de Supabase concede `EXECUTE` por defecto a `anon` y `authenticated` sobre toda función nueva, así que revocar solo a PUBLIC deja la función abierta por RPC a cualquiera, con sesión o sin ella. Verificado en vivo el 30/08/2026 (migración `20260830000024`), donde nueve funciones que se creían internas resultaron ser públicas. Esto no se reproduce en un PostgreSQL desnudo: para comprobarlo en local hay que replicar antes `alter default privileges in schema public grant execute on functions to anon, authenticated, service_role`. Eso y el resto de la emulación (roles, esquema `auth`, esquema `storage`) están en `supabase/tests/bootstrap-postgres-local.sql`, que permite ejecutar las suites de `supabase/tests/` contra cualquier PostgreSQL 16 sin Docker.
  **Excepción que hay que respetar:** una función que aparezca dentro de la expresión de una política de RLS (`using` o `with check`) NO puede perder el `EXECUTE` de `authenticated`. PostgreSQL evalúa esas expresiones con los privilegios de **quien consulta**, así que revocársela no la cierra: rompe la política entera y la tabla empieza a devolver `permission denied for function`. A esas se les revoca `public` y `anon` y se deja `authenticated`. Para saber cuáles son, no lo adivines: `select polname, pg_get_expr(polqual, polrelid) from pg_policy`. Diez funciones están hoy en ese caso: ocho las enumera la migración `20260830000032`, y las dos de la auditoría (`audit_action_capability` y `audit_entity_is_visible`) llegaron con la `20260903000049`. La Fase 4 sumó las de plataforma: `is_platform_owner` (en políticas desde la migración 8, redefinida en la 91), `is_platform_approver` (89), `is_platform_subscription_manager` (90), y `session_is_two_factor`, `is_platform_admin`, `is_platform_member` e `is_platform_supporter` (91). La migración 131 sumó `plan_lineage` y `service_lineage`, que están en las políticas de `plan_versions` y `service_versions`. La 138 sumó `is_report_worker` e `is_report_worker_for`, que están en las políticas de `reports`, `report_sections`, `report_versions`, `report_deliveries` y `report_entry_texts` (RN-REP-31).
  El barrido de `supabase/tests/hito7_mensajes_archivos_finanzas.sql` incluye una comprobación en falso-cerrado: toda función `SECURITY DEFINER` abierta por RPC cuyo cuerpo no mencione ninguna comprobación de permisos hace fallar el test hasta que alguien la clasifique. Así se encontraron `job_assignee` y `get_or_create_request_conversation`.

## No inventes lo que está pendiente

Estos puntos están **aplazados deliberadamente**. Si una tarea los toca, deja el placeholder documentado y pregúntame. NO inventes reglas, fórmulas ni umbrales:

- Agente Cuotly: solo existe la entrada de menú con la etiqueta "Próximamente". Sin funcionalidad simulada.
- Fórmula ponderada de recomendación de trabajador (usa el orden determinista del PRD, no inventes porcentajes).
- Categoría de puntos para tareas de más de 4 horas.
- ~~Umbrales concretos de detección de oportunidades y definición de impacto/esfuerzo~~ — los fijó Bosco el 14/09/2026 (decisión 26 de `docs/DECISIONES.md`, razonada en `docs/PROPUESTA-OPORTUNIDADES.md`). Ya no se inventan: se citan.
- El bloque legal y fiscal: términos de uso, privacidad, retenciones, numeración fiscal de facturas, jurisdicción. **Excepción desde el 12/09/2026:** las **condiciones de cada plan y servicio** sí existen (migración 75): las escribe el espacio para su propio plan, se versionan (RN-DAT-07) y el restaurante las acepta en Cuotly o el equipo registra la aceptación de fuera con fecha y contrato. Cuotly no redacta ninguna: el texto es del espacio.
- API pública y webhooks.
- ~~Precio del almacenamiento adicional~~ — no hay precio: pasarse de lo incluido **se presupuesta aparte** (decisión 38 del 16/09/2026; RN-SUB-13, migración 95). Se avisa al 80 % y al 100 %, y al 100 % también a Cuotly. Nada se bloquea. No inventes un precio por GB.
- Cancelación/anulación/abono de un cobro. Reembolsar lo **reabre** (RN-FIN-04b, decisión 12): devolver el dinero dejando al cliente a cero es otra operación, y no existe. No la metas dentro de `refund_charge`.
- Sincronización bidireccional de calendarios.
- ~~Crear, editar y archivar planes y servicios~~ — las reglas las fijó Bosco el 23/09/2026 (decisión 72, opción A: quien no acepta un cambio que le perjudica sigue en la versión que aceptó). Están en el PRD como RN-COM-19 a RN-COM-30. Ya no se inventan: se citan.

## Decisiones que NO deben reaparecer

- Cuotly es multiempresa, no solo el espacio de Restavor.
- Menú Diario: 30 actualizaciones (no 25). 229 € + IVA, o 199 € + IVA **solo** si el establecimiento tiene Premium+ activo. Impulso, Impulso+ y Premium pagan 229 €.
- Planes (fichas de Restavor del 16/09/2026, decisión 39, migración 96): Básico 99 €, Impulso 299 €, Impulso+ 399 €, Premium 499 €, Premium+ 599 €, todos + IVA. Básico NO incluye ningún cambio ni fotografía. Solo Premium+ incluye un cambio grande y solo Premium+ concede la prioridad (`plans.grants_priority`). Impulso arranca a 48 h laborables; Impulso+, Premium y Premium+ a 24 h. Premium (499 €) incluye menos cambios pequeños que Impulso+ y es intencionado.
- Permanencia de mantenimiento: 3 meses. No existen bolsas de horas.
- "Supervisor" no es un rol: es una relación Administrador–Trabajador.
- El supervisor NO aprueba antes de publicar. El trabajador publica directamente.
- El reloj contractual empieza el lunes a las 09:00, no a las 00:00.
- El horario de soporte humano es un reloj distinto y no afecta a los plazos contractuales.
- Los mensajes se editan durante 10 minutos y no se eliminan nunca.
- Menú Diario no tiene botón "Comenzar".
- Reservas y delivery no se monitorizan.
- No existe botón "Sincronizar ahora" en las integraciones analíticas.
- Sin Stripe: los pagos se registran manualmente (transferencia o Bizum).
- Sin modo oscuro, sin selector de densidad, sin marca blanca, sin publicidad.
- No se crean bases de datos ni proyectos separados por restaurante.

## Estilo de código

- TypeScript estricto. `strict: true`, sin `any` salvo justificación en comentario.
- Identificadores, nombres de tablas, columnas y funciones en **inglés**. Todo el texto visible al usuario en **español**, siempre a través del sistema de i18n (`src/i18n/es.ts`). Nunca literales de UI incrustados en los componentes.
- Lógica de dominio pura (reloj laboral, consumos, permisos, estados) en `src/core/`, sin dependencias de Supabase, Next ni React, y con tests unitarios. Los adaptadores externos viven en `src/services/`.
- Colores, espaciados y tipografía solo mediante los tokens del sistema Emerald Control. Nunca un hexadecimal suelto en un componente.
- Errores de negocio como tipos de resultado explícitos, no como excepciones genéricas.
