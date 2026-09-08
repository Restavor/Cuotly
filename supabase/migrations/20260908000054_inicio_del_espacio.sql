-- El Inicio del espacio (§20.4), con datos de verdad.
--
-- La pantalla de Inicio existía desde el Hito 2 como una lista de
-- restaurantes y cinco atajos. §20.4 pide otra cosa: "resumen general,
-- restaurantes y estados, solicitudes y trabajos críticos, carga del
-- equipo, ingresos y pendientes, incidencias, actividad reciente". Casi
-- todo eso son consultas normales que la pantalla ya puede hacer con RLS
-- —contar restaurantes activos, contar solicitudes pendientes, leer
-- `state_events`—, y no necesitan nada nuevo aquí.
--
-- Dos no:
--
--   1. **"Trabajos próximos a vencer".** El plazo de un trabajo no está
--      guardado en ninguna columna: se RECALCULA sumando `timer_events`
--      sobre el reloj laboral (RN-CLK, CA-10), y ese reloj vive en
--      `src/core/business-clock.ts` — CLAUDE.md prohíbe tener una segunda
--      copia en PL/pgSQL. Así que esto no calcula el plazo: entrega los
--      eventos y el plazo contratado, y quien decide es TypeScript, igual
--      que hace el proceso de la cola con `sla_sweep_counters()`.
--
--      La diferencia con esa función es de quién la llama.
--      `sla_sweep_counters()` es del proceso de la cola: `SECURITY
--      DEFINER`, reservada a `service_role`, y ve el espacio entero. Esta
--      la llama una persona desde su pantalla, así que es **`SECURITY
--      INVOKER` a propósito**: se ejecuta con los privilegios de quien
--      mira y las mismas políticas de RLS que filtran `jobs` y
--      `timer_events` filtran el resultado. Un trabajador ve el plazo de
--      sus trabajos y de los de sus restaurantes autorizados; un cliente
--      no ve ninguno, porque `timer_events` es del equipo. No hay ni una
--      lista de permisos escrita aquí, que es justo lo que la hace
--      correcta (el mismo razonamiento que `global_search()` en el Hito
--      8).
--
--   2. **"Carga del equipo".** `worker_load()` ya existe y ya comprueba el
--      permiso, pero contesta por UNA persona: pintar la lista del equipo
--      con ella son N llamadas y N comprobaciones idénticas. Esto es la
--      misma respuesta para el equipo entero, con la MISMA comprobación
--      —`assign_jobs`— hecha una vez.
--
-- Lo que no se toca: RN-ASG-17 sigue prohibiendo cualquier ranking
-- público entre trabajadores. Esta función devuelve la carga de cada
-- persona a quien puede asignar trabajos, que es quien necesita saberla
-- para repartir; no ordena, no puntúa y no la enseña a nadie más.
--
-- Se comprueba con `supabase/tests/inicio_del_espacio.sql`.

-- ============================================================
-- 1 · El plazo congelado, legible por quien mira su propio trabajo.
--
-- `requests.accepted_start_sla_hours` nació en la migración 40, o sea
-- DESPUÉS del `revoke select on public.requests` de la 27, así que nació
-- ilegible para `authenticated`: pedirla devuelve 403 y por eso ninguna
-- pantalla la ha leído nunca (el proceso de la cola la lee como
-- `service_role`).
--
-- Se concede. No identifica a nadie del equipo —es un número de horas, el
-- plazo con el que se aceptó la solicitud (RN-COM-15/17)—, y el motivo por
-- el que existe el privilegio de columna en esta tabla es tapar la
-- IDENTIDAD, no los términos del contrato: el restaurante tiene derecho a
-- saber en cuántas horas se le prometió empezar.
-- ============================================================
grant select (accepted_start_sla_hours) on public.requests to authenticated;

-- ============================================================
-- 2 · Los contadores de los trabajos que quien mira puede ver.
--
-- T2 y T3 se anotan siempre sobre el trabajo (`entity_type = 'job'`), así
-- que aquí no hace falta la doble junta de `sla_sweep_counters()`.
--
-- Se devuelven también el código, el estado y el restaurante: sin ellos la
-- pantalla tendría que volver a consultar `jobs` fila a fila para poder
-- escribir "Quedan 2 h para comenzar" al lado de un trabajo con nombre.
-- ============================================================
create or replace function public.space_job_counters(p_space_id uuid)
returns table (
  job_id uuid,
  job_code text,
  job_state text,
  establishment_id uuid,
  counter_kind text,
  category text,
  start_sla_hours integer,
  timezone text,
  events jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    j.id,
    j.code,
    j.state,
    j.establishment_id,
    te.counter_kind,
    j.category,
    coalesce(r.accepted_start_sla_hours, p.start_sla_hours),
    sp.timezone,
    jsonb_agg(jsonb_build_object(
      'event_type', te.event_type,
      'occurred_at', te.occurred_at,
      'cause', te.cause
    ) order by te.occurred_at)
  from public.timer_events te
  join public.jobs j on j.id = te.entity_id and te.entity_type = 'job'
  join public.spaces sp on sp.id = te.space_id
  join public.establishments e on e.id = j.establishment_id
  left join public.requests r on r.id = j.request_id
  left join public.subscriptions s
    on s.establishment_id = e.id and s.kind = 'plan' and s.status = 'active'
  left join public.plans p on p.id = s.plan_id
  where te.space_id = p_space_id
    and te.counter_kind in ('t2', 't3')
    -- Un trabajo publicado, terminado o cancelado ya no tiene plazo que
    -- agotar: su contador está parado y sacarlo en "próximos a vencer"
    -- sería contar dos veces algo que ya no se puede hacer.
    and j.state not in ('published', 'completed',
                        'cancelled_before_start', 'cancelled_after_start')
    -- RN-EST: un restaurante pausado, suspendido o archivado tiene los
    -- contadores parados (§8). Mismo criterio que sla_sweep_counters().
    and e.status not in ('archived', 'suspended', 'paused', 'read_only')
  group by j.id, j.code, j.state, j.establishment_id, te.counter_kind,
           j.category, r.accepted_start_sla_hours, p.start_sla_hours, sp.timezone;
$$;

comment on function public.space_job_counters(uuid) is
  'Contadores T2/T3 abiertos de los trabajos que quien llama puede ver
   (§20.4, "trabajos críticos"). SECURITY INVOKER a propósito: filtra RLS,
   no una lista de permisos escrita a mano. No calcula el plazo — el reloj
   laboral vive en src/core/business-clock.ts y no se duplica en SQL
   (CLAUDE.md).';

-- Invoker, así que `authenticated` la puede llamar sin que eso conceda
-- nada: lo que ve cada quien lo siguen decidiendo las políticas. `anon`
-- no tiene sesión y no tiene nada que buscar aquí.
revoke all on function public.space_job_counters(uuid) from public, anon;
grant execute on function public.space_job_counters(uuid) to authenticated;

-- ============================================================
-- 3 · La carga del equipo, de una vez.
--
-- Misma comprobación que `worker_load()`: hace falta `assign_jobs` para
-- ver la carga de otra persona. Quien no la tenga recibe una lista con su
-- propia carga y nada más — no un error, porque un trabajador SÍ puede ver
-- la suya (§20.4, "Mi trabajo").
-- ============================================================
create or replace function public.space_team_load(p_space_id uuid)
returns table (
  user_id uuid,
  role text,
  load_points integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'No perteneces a este espacio';
  end if;

  return query
  select
    sm.user_id,
    sm.role::text,
    public.worker_active_load_points(p_space_id, sm.user_id)
  from public.space_memberships sm
  where sm.space_id = p_space_id
    and sm.status = 'active'
    and (public.has_capability(p_space_id, 'assign_jobs') or sm.user_id = auth.uid())
  order by sm.user_id;
end;
$$;

comment on function public.space_team_load(uuid) is
  'RN-ASG-13/14 y §20.4 · la carga activa de cada miembro del espacio, en
   una sola llamada. Comprueba el permiso por su cuenta: con assign_jobs
   se ve la del equipo, sin él solo la propia (la misma regla que
   worker_load()). RN-ASG-17: no ordena por carga ni puntúa a nadie —
   ordenar por puntos sería el ranking que la regla prohíbe.';

revoke all on function public.space_team_load(uuid) from public, anon;
grant execute on function public.space_team_load(uuid) to authenticated;
