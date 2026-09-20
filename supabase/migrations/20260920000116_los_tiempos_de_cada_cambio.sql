-- ============================================================
-- Migración 116 · Los tiempos de cada cambio, uno a uno
--                 (RN-REP-21, decisión 60)
-- ============================================================
--
-- La tabla de RN-REP-15 le promete a Premium+ desde el día que se escribió
-- una cosa que no existía: **los tiempos de cada cambio, uno a uno**. Hasta
-- hoy Premium+ recibía exactamente el mismo informe que Premium, y eso es
-- cobrar 100 € por una fila de una tabla.
--
-- **Lo que NO hace falta, y conviene decirlo porque es el hallazgo de
-- construirlo.** De las seis piezas que Bosco aprobó para Premium+, cinco
-- no tocan el servidor:
--
--   · la evolución dentro del mes (RN-REP-22) sale de los mismos puntos de
--     `metric_points` que el informe ya pide para el periodo;
--   · la comparación interanual (RN-REP-23) es una tercera llamada al mismo
--     cálculo de cifras, con otro periodo;
--   · el efecto de cada cambio (RN-REP-25) es el mismo `metricPoints` con
--     la ventana ensanchada 14 días por cada lado;
--   · el seguimiento de oportunidades (RN-REP-24) y el aprovechamiento del
--     plan (RN-REP-26) son lecturas de tablas que ya existen.
--
-- Eso no es suerte: `report_operation_dataset()` se diseñó devolviendo
-- **filas y no cifras** precisamente para que una lectura nueva se escriba
-- en `src/core/` sin tocar SQL (CLAUDE.md: la lógica de dominio no se
-- duplica en la base). Esta migración es la excepción, y lo es porque le
-- faltan datos a la fila, no porque haya que calcular nada aquí.
--
-- **Tres columnas, y cada una tiene su motivo:**
--
--   1. `request_code` — el informe habla de cambios por el código con el
--      que el restaurante los pidió (RN-REP-18), no por el del trabajo, que
--      es organización interna. Sin él, la tabla de tiempos no se puede
--      juntar con la ficha del cambio: serían dos listas de lo mismo con
--      nombres distintos.
--   2. `request_accepted_at` — "cuánto tardó en arrancar" se mide **desde
--      que se aceptó**, que es cuando empieza el compromiso (RN-COM-15), no
--      desde que se creó el trabajo.
--   3. `reason_type` en los bloqueos — RN-REP-21 dice **por qué** estuvo
--      parado, y los cuatro motivos de `blocks.reason_type` son categorías
--      cerradas que no nombran a nadie. El texto libre del bloqueo NO entra:
--      lo escribe el equipo para el equipo (P7).
--
-- El resto de la función se copia tal cual de la definición viva.
create or replace function public.report_operation_dataset(
  p_space_id uuid,
  p_establishment_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      (p_from::timestamptz) as from_at,
      ((p_to + 1)::timestamptz) as to_at
  ),
  reqs as (
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'establishment_id', r.establishment_id, 'state', r.state, 'created_at', r.created_at
    ) order by r.created_at) as rows
    from public.requests r, bounds b
    where r.space_id = p_space_id
      and (p_establishment_id is null or r.establishment_id = p_establishment_id)
      and r.created_at >= b.from_at and r.created_at < b.to_at
  ),
  job_rows as (
    select
      j.id, j.establishment_id, j.category, j.state, j.assigned_to, j.created_at,
      j.started_at, j.published_at, j.completed_at,
      -- RN-REP-21 · el código de la SOLICITUD y la fecha en que se aceptó.
      -- Los dos salen de la misma fila y por eso van en un solo subselect:
      -- pedir dos veces `requests` por trabajo sería pagar dos veces el
      -- mismo índice.
      (select rq.code from public.requests rq where rq.id = j.request_id) as request_code,
      (select rq.accepted_at from public.requests rq where rq.id = j.request_id) as request_accepted_at,
      (select s.plan_id from public.subscriptions s
        where s.establishment_id = j.establishment_id and s.kind = 'plan' and s.status = 'active'
        order by s.started_at desc limit 1) as plan_id,
      -- RN-COM-15 · el plazo de inicio con el que se ACEPTÓ, y solo si no
      -- lo hay, el del plan vigente: es el mismo coalesce de
      -- sla_sweep_counters(), y por la misma razón (un cambio de plan no
      -- reescribe hacia atrás lo ya aceptado).
      (select coalesce(rq.accepted_start_sla_hours, pl.start_sla_hours)
       from public.requests rq
       left join public.subscriptions su
         on su.establishment_id = j.establishment_id and su.kind = 'plan' and su.status = 'active'
       left join public.plans pl on pl.id = su.plan_id
       where rq.id = j.request_id) as start_sla_hours,
      coalesce((
        select jsonb_agg(jsonb_build_object('type', te.event_type, 'occurred_at', te.occurred_at)
                         order by te.occurred_at)
        from public.timer_events te
        where te.entity_type = 'job' and te.entity_id = j.id and te.counter_kind = 't2'
      ), '[]'::jsonb) as t2_events,
      coalesce((
        select jsonb_agg(jsonb_build_object('type', te.event_type, 'occurred_at', te.occurred_at)
                         order by te.occurred_at)
        from public.timer_events te
        where te.entity_type = 'job' and te.entity_id = j.id and te.counter_kind = 't3'
      ), '[]'::jsonb) as t3_events
    from public.jobs j, bounds b
    where j.space_id = p_space_id
      and (p_establishment_id is null or j.establishment_id = p_establishment_id)
      and j.created_at < b.to_at
      and (j.completed_at is null or j.completed_at >= b.from_at)
  ),
  jobs as (
    select jsonb_agg(to_jsonb(job_rows.*) order by job_rows.created_at) as rows from job_rows
  ),
  blocks as (
    select jsonb_agg(jsonb_build_object(
      'job_id', bl.job_id, 'started_at', bl.started_at, 'ended_at', bl.ended_at,
      -- RN-REP-21 · el MOTIVO, que es una de cuatro categorías cerradas.
      -- El texto libre del bloqueo no sale de aquí ni saldrá: lo escribe el
      -- equipo para el equipo (P7, RN-REP-13).
      'reason_type', bl.reason_type
    ) order by bl.started_at) as rows
    from public.blocks bl
    join public.jobs j on j.id = bl.job_id, bounds b
    where j.space_id = p_space_id
      and (p_establishment_id is null or j.establishment_id = p_establishment_id)
      and bl.started_at < b.to_at
      and (bl.ended_at is null or bl.ended_at >= b.from_at)
  ),
  consumption as (
    select jsonb_agg(jsonb_build_object(
      'establishment_id', ce.establishment_id, 'category', ce.category, 'amount', ce.amount
    )) as rows
    from public.consumption_entries ce, bounds b
    where ce.space_id = p_space_id
      and (p_establishment_id is null or ce.establishment_id = p_establishment_id)
      and ce.created_at >= b.from_at and ce.created_at < b.to_at
  ),
  menus as (
    select jsonb_agg(jsonb_build_object(
      'establishment_id', mp.establishment_id,
      'published_at', mp.published_at,
      -- §62 · la garantía se pidió antes del corte y se publicó a tiempo.
      'within_guarantee', mp.requested_before_cutoff
        and mp.published_at is not null
        and mp.published_at <= public.menu_publish_by_at(m.target_date, mp.space_id)
    )) as rows
    from public.menu_publications mp
    join public.menus m on m.id = mp.menu_id, bounds b
    where mp.space_id = p_space_id
      and (p_establishment_id is null or mp.establishment_id = p_establishment_id)
      and mp.published_at >= b.from_at and mp.published_at < b.to_at
  ),
  corrections as (
    select count(*)::integer as total
    from public.corrections c, bounds b
    where c.space_id = p_space_id
      and (p_establishment_id is null or c.establishment_id = p_establishment_id)
      and c.kind = 'client_request'
      and c.requested_at >= b.from_at and c.requested_at < b.to_at
  ),
  menu_updates as (
    select coalesce(sum(-mue.amount), 0)::integer as total
    from public.menu_update_entries mue, bounds b
    where mue.space_id = p_space_id
      and (p_establishment_id is null or mue.establishment_id = p_establishment_id)
      and mue.amount < 0
      and mue.created_at >= b.from_at and mue.created_at < b.to_at
  )
  select jsonb_build_object(
    'requests', coalesce((select rows from reqs), '[]'::jsonb),
    'jobs', coalesce((select rows from jobs), '[]'::jsonb),
    'blocks', coalesce((select rows from blocks), '[]'::jsonb),
    'consumption', coalesce((select rows from consumption), '[]'::jsonb),
    'menus', coalesce((select rows from menus), '[]'::jsonb),
    'corrections_requested', (select total from corrections),
    'menu_updates_used', (select total from menu_updates)
  );
$$;

comment on function public.report_operation_dataset(uuid, uuid, date, date) is
  '§91, RN-REP-21 · las FILAS que necesitan los indicadores y los tiempos de
   cada cambio, no los indicadores. El cumplimiento y los tiempos se miden
   con el reloj contractual, que vive en src/core/business-clock.ts:
   calcularlos aquí sería duplicar la lógica de dominio en SQL (CLAUDE.md).
   Lleva el código de la SOLICITUD para poder juntarse con la ficha del
   cambio (RN-REP-18) y el motivo de cada bloqueo, que es una categoría
   cerrada; nunca el texto del bloqueo ni quién lo puso (P7).';

revoke all on function public.report_operation_dataset(uuid, uuid, date, date)
  from public, anon, authenticated;
