-- Corrige un fallo de seguridad REAL en objetos que ya están desplegados,
-- descubierto al auditar los arreglos del Hito 7. No es del Hito 7: la
-- vista afectada es del Hito 6 (migración 20260830000023) y las columnas,
-- de los Hitos 4 y 5. Por eso va en su propia migración, aplicable a la
-- base de datos real sin arrastrar nada del Hito 7, que sigue pendiente
-- de revisión.
--
-- ============================================================
-- 1 · `client_jobs` era ESCRIBIBLE por el cliente.
--
-- Es una vista simple sobre una sola tabla, sin agregados: PostgreSQL la
-- considera "auto-actualizable", así que un INSERT/UPDATE/DELETE sobre
-- ella se traduce a la tabla base. Y como la vista pertenece a `postgres`
-- (que en Supabase tiene BYPASSRLS) y no lleva `security_invoker`, esas
-- escrituras **se saltan el RLS de `jobs` por completo**.
--
-- El `grant select on public.client_jobs to authenticated` de la
-- migración 20260830000023 hacía pensar que solo se concedía lectura,
-- pero era redundante: las *default privileges* de un proyecto de
-- Supabase ya conceden TODOS los privilegios (arwdDxt) a `anon` y
-- `authenticated` sobre cada tabla o vista nueva. Es la misma clase de
-- fallo que la migración 20260830000024 corrigió para las funciones —
-- revocar (o no conceder) no basta si Supabase concede por defecto.
--
-- Verificado en vivo antes del arreglo: el propietario local de un
-- restaurante cambió el estado de su propio trabajo a través de la vista,
-- algo que `jobs` no permite (no tiene ninguna política de UPDATE: toda
-- mutación pasa por las funciones SECURITY DEFINER del Hito 6).
--
-- El arreglo: revocar todo y conceder solo SELECT, explícitamente.
revoke all on public.client_jobs from public, anon, authenticated;
grant select on public.client_jobs to authenticated;

comment on view public.client_jobs is
  'Lo que el restaurante ve de sus trabajos (RN-JOB-08, RN-NOT). Sin
   assigned_to, started_by, published_by ni cancelled_by: el cliente nunca
   ve la identidad individual de nadie del equipo (CLAUDE.md MUST NOT,
   CA-04).

   SOLO LECTURA, y hay que concederlo explícitamente: una vista simple es
   auto-actualizable y, al pertenecer a postgres, escribir por ella se
   salta el RLS de la tabla base. Ver la migración 20260830000027.';

-- ============================================================
-- 2 · Dos columnas de identidad del equipo que el cliente sí alcanzaba.
--
-- Misma violación del MUST NOT de CLAUDE.md que se corrigió en el Hito 7
-- para las tablas nuevas, sobre dos tablas anteriores que se habían
-- quedado fuera:
--   · requests.validated_by y requests.rejected_by — los escriben
--     validate_classification() y reject_request(), que son solo del
--     equipo (RN-CLS-03, HU-14), y el cliente lee su propia solicitud por
--     requests_select. (`rejected_by` también lo escribe decline_request()
--     con la identidad del propio cliente, pero como la columna no
--     distingue quién fue, se esconde igual: el motivo del rechazo ya
--     viaja en `rejected_reason`, que sí se conserva.)
--   · subscriptions.created_by — lo escribe create_plan_subscription(),
--     que exige 'manage_clients', y el cliente lee su suscripción por
--     subscriptions_select.
--
-- Se cierran con privilegio de columna, el único mecanismo que distingue
-- columnas (RLS filtra filas). Consecuencia, ya documentada en CLAUDE.md:
-- `select *` sobre estas dos tablas devuelve 403 y toda consulta debe
-- enumerar columnas. Ninguna pantalla las lee todavía (comprobado).
--
-- El resto de columnas `*_by` de hitos anteriores (classifications,
-- blocks, corrections, assignments, timer_events, audit_log, tasks,
-- spaces) NO necesitan esto: su RLS ya deja al cliente fuera de la fila
-- entera, así que no hay nada que esconder a nivel de columna.
revoke select on public.requests from anon, authenticated;
grant select (id, space_id, establishment_id, code, state, description, context,
              created_by, copied_from_request_id, validated_category, validated_summary,
              validated_at, accepted_by, accepted_at, rejected_reason, rejected_at, created_at)
  on public.requests to authenticated;

revoke select on public.subscriptions from anon, authenticated;
grant select (id, space_id, establishment_id, kind, plan_id, service_id, status,
              started_at, created_at)
  on public.subscriptions to authenticated;
