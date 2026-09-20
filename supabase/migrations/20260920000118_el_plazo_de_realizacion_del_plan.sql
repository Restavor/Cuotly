-- ============================================================
-- Migración 118 · El plazo de realización lo puede acortar el plan
--                 (RN-SLA-18, decisión 61)
-- ============================================================
--
-- Hasta hoy el plazo de ejecución era el mismo para todos: 72 h laborables
-- para pequeño, fotográfico y mediano, y 120 h para grande (RN-SLA-12).
-- Bosco decidió el 20/09/2026 bajarlo **solo en Premium+**.
--
-- **Cuatro columnas y no un porcentaje.** Un factor —"Premium+ va un 30 %
-- más rápido"— daría 50,4 h, que no es un número que nadie pueda decirle a
-- un cliente, y obligaría a redondear en algún sitio. Cuatro columnas, una
-- por categoría, es además la forma que ya tiene esta tabla para los
-- cambios incluidos: la misma idea se escribe igual.
--
-- **El plazo se congela en el trabajo al aceptarlo.** Es el mismo
-- mecanismo que `requests.accepted_start_sla_hours` (RN-COM-15) y por la
-- misma razón: subir o bajar de plan **no reescribe hacia atrás** un
-- trabajo ya aceptado. Sin esto, cambiar de plan el día 20 movería el
-- plazo de todo lo que está en marcha —para bien o para mal— y el equipo
-- vería saltar avisos de trabajos que iban sobrados.
--
-- **Un trabajo aceptado ANTES de esta migración se queda a null**, y eso
-- no es un hueco: significa "el de la tabla de RN-SLA-12", que es el que
-- tenía el día que se aceptó. Rellenarlos con el valor de hoy sería
-- reescribir el compromiso de trabajos que ya estaban corriendo.

-- ------------------------------------------------------------
-- 1 · El plan lo dice, categoría a categoría (RN-SLA-18)
-- ------------------------------------------------------------
alter table public.plans
  add column execution_sla_small integer not null default 72
    check (execution_sla_small > 0),
  add column execution_sla_photo integer not null default 72
    check (execution_sla_photo > 0),
  add column execution_sla_medium integer not null default 72
    check (execution_sla_medium > 0),
  add column execution_sla_large integer not null default 120
    check (execution_sla_large > 0);

comment on column public.plans.execution_sla_small is
  'RN-SLA-18 · horas LABORABLES de plazo de realización para un cambio
   pequeño. El valor por omisión es el de la tabla de RN-SLA-12 (72 h);
   un plan puede acortarlo.';

comment on column public.plans.execution_sla_large is
  'RN-SLA-18 · ídem para un cambio grande. Por omisión 120 h laborables.';

-- El relleno de hoy va por `grants_priority`, que es lo único que se sabe
-- de cualquier espacio sobre cuál es su plan más alto (migración 110). Los
-- números son los de Restavor, fijados por Bosco el 20/09/2026: 1–2 días
-- en pequeño y fotográfico, 1–3 en mediano —igual que ahora— y 2–4 en
-- grande.
update public.plans
set execution_sla_small = 48,
    execution_sla_photo = 48,
    execution_sla_medium = 72,
    execution_sla_large = 96
where grants_priority;

-- ------------------------------------------------------------
-- 2 · El trabajo se queda con el plazo que tenía al aceptarse
-- ------------------------------------------------------------
alter table public.jobs
  add column execution_sla_hours integer
    check (execution_sla_hours is null or execution_sla_hours > 0);

comment on column public.jobs.execution_sla_hours is
  'RN-SLA-18 · las horas laborables de plazo de realización con las que se
   ACEPTÓ este trabajo. `null` en los aceptados antes de la migración 118,
   y ahí significa "el valor por omisión de RN-SLA-12", que es el que
   tenían: no se rellena hacia atrás, porque eso reescribiría un
   compromiso ya vivo.';

-- ------------------------------------------------------------
-- 3 · Congelarlo al aceptar (RN-SLA-18, RN-COM-15)
-- ------------------------------------------------------------
--
-- La función se copia **de la definición viva** y lo único que cambia son
-- las dos líneas del `insert into public.jobs`: reescribirla de memoria se
-- come lo que añadieron las migraciones 33, 40 y 80, y ya pasó una vez.
create or replace function public.accept_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_category text;
  v_subscription_id uuid;
  v_included_small integer;
  v_included_photo integer;
  v_included_medium integer;
  v_included_large integer;
  v_included integer;
  v_budgeted boolean := true;
  v_cycle_id uuid;
  v_cycle_included integer;
  v_balance integer;
  v_seq bigint;
  v_job_code text;
  v_job_id uuid;
  v_entry_id uuid;
  v_quote_id uuid;
  v_quote_state text;
  v_execution_sla integer;
begin
  select space_id, establishment_id, state, validated_category
  into v_space_id, v_establishment_id, v_state, v_category
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  -- §84 · el último presupuesto de la solicitud manda sobre cómo se acepta.
  select q.id, q.state into v_quote_id, v_quote_state
  from public.quotes q
  where q.request_id = p_request_id
  order by q.created_at desc
  limit 1;

  -- Acepta el restaurante. La única excepción es la que abre la decisión
  -- 21: con el presupuesto ya aceptado (lo que `accept_quote()` acaba de
  -- comprobar y registrar), el propietario o un administrador del espacio
  -- llegan aquí en nombre del restaurante.
  if not public.can_write_establishment(v_establishment_id)
     and not (v_quote_state = 'accepted' and public.has_capability(v_space_id, 'manage_requests')) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state = 'accepted' then
    return; -- CA-17: pulsar aceptar dos veces no duplica el efecto.
  end if;

  if v_state <> 'pending_client_acceptance' then
    raise exception 'La solicitud no está pendiente de aceptación';
  end if;

  if v_category is null then
    raise exception 'La solicitud no tiene una categoría validada';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  if v_quote_id is not null and v_quote_state in ('draft', 'sent') then
    raise exception 'Esta solicitud se presupuesta aparte: la aceptación es la del presupuesto (§84)';
  end if;

  if v_quote_id is not null and v_quote_state = 'rejected' then
    raise exception 'El presupuesto de esta solicitud se rechazó: el equipo tiene que enviar otro, o puedes no continuarla';
  end if;

  -- RN-COM-15 y RN-COM-17: el plazo de inicio se congela AQUÍ, al aceptar.
  update public.requests r
  set accepted_start_sla_hours = (
    select p.start_sla_hours
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.establishment_id = v_establishment_id and s.kind = 'plan' and s.status = 'active'
    limit 1
  )
  where r.id = p_request_id and r.accepted_start_sla_hours is null;

  -- RN-SLA-18 (migración 118) · y el de REALIZACIÓN, en el mismo momento y
  -- por la misma razón. Sin plan vigente se queda a null, que significa
  -- "el valor por omisión de RN-SLA-12": un establecimiento sin plan no
  -- tiene a quién preguntarle el plazo.
  select case v_category
    when 'small' then p.execution_sla_small
    when 'photo' then p.execution_sla_photo
    when 'medium' then p.execution_sla_medium
    when 'large' then p.execution_sla_large
  end into v_execution_sla
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = v_establishment_id and s.kind = 'plan' and s.status = 'active'
  limit 1;

  -- RN-CON-03: con presupuesto aceptado no se mira la bolsa.
  if v_quote_id is null then
    select s.id, p.included_small, p.included_photo, p.included_medium, p.included_large
    into v_subscription_id, v_included_small, v_included_photo, v_included_medium, v_included_large
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.establishment_id = v_establishment_id and s.kind = 'plan' and s.status = 'active'
    limit 1;

    if v_subscription_id is not null then
      v_included := case v_category
        when 'small' then v_included_small
        when 'photo' then v_included_photo
        when 'medium' then v_included_medium
        when 'large' then v_included_large
      end;

      if v_included > 0 then
        v_budgeted := false;
        v_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);

        select case v_category
          when 'small' then included_small
          when 'photo' then included_photo
          when 'medium' then included_medium
          when 'large' then included_large
        end into v_cycle_included
        from public.consumption_cycles where id = v_cycle_id;

        select v_cycle_included + coalesce(sum(amount), 0) into v_balance
        from public.consumption_entries
        where consumption_cycle_id = v_cycle_id and category = v_category;

        if v_balance <= 0 then
          raise exception 'Sin crédito disponible en el ciclo actual para la categoría %', v_category;
        end if;
      end if;
    end if;
  end if;

  insert into public.space_sequences (space_id, sequence_name, next_value)
  values (v_space_id, 'job', 2)
  on conflict (space_id, sequence_name)
  do update set next_value = public.space_sequences.next_value + 1
  returning next_value - 1 into v_seq;
  v_job_code := 'TRB-' || lpad(v_seq::text, 4, '0');

  insert into public.jobs
    (space_id, establishment_id, request_id, code, category, quote_id, execution_sla_hours)
  values
    (v_space_id, v_establishment_id, p_request_id, v_job_code, v_category, v_quote_id, v_execution_sla)
  returning id into v_job_id;

  if not v_budgeted then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, created_by)
    values
      (v_space_id, v_establishment_id, v_cycle_id, v_category, -1, 'debit', p_request_id, v_job_id, auth.uid())
    returning id into v_entry_id;
  end if;

  insert into public.acceptances
    (space_id, establishment_id, request_id, job_id, category, consumption_cycle_id, consumption_entry_id, budgeted, accepted_by)
  values
    (v_space_id, v_establishment_id, p_request_id, v_job_id, v_category, v_cycle_id, v_entry_id, v_budgeted, auth.uid());

  update public.requests set state = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.accepted', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'accepted', 'job_id', v_job_id, 'job_code', v_job_code, 'budgeted', v_budgeted, 'quote_id', v_quote_id)
  );
end;
$$;

-- ------------------------------------------------------------
-- 4 · El barrido de plazos tiene que saberlo (RN-SLA-15, RN-SLA-18)
-- ------------------------------------------------------------
--
-- `sla_sweep_counters()` es lo que alimenta los avisos del 75 %, 90 % y
-- 100 %. Sin el plazo congelado del trabajo seguiría midiendo T3 contra
-- las 72 h de siempre, así que un Premium+ **no recibiría ningún aviso
-- hasta pasarse de largo**: el 100 % de 72 h llega cuando el plazo de
-- verdad (48 h) hace rato que venció.
--
-- Es el fallo silencioso de esta migración: todo lo demás funcionaría y
-- solo se notaría el día que alguien se pregunte por qué no saltó nada.
-- Se copia de la definición viva y se le añade una columna.
--
-- **Hay que soltarla antes**: `create or replace` no puede cambiar el tipo
-- de retorno de una función, y añadir una columna a un `returns table` es
-- cambiarlo. Con el `drop` se pierden sus privilegios, así que abajo se
-- vuelven a poner **exactamente los que tenía**: solo `service_role`.
drop function if exists public.sla_sweep_counters(uuid);

create function public.sla_sweep_counters(p_space_id uuid)
returns table(
  entity_type text,
  entity_id uuid,
  job_id uuid,
  counter_kind text,
  category text,
  start_sla_hours integer,
  execution_sla_hours integer,
  timezone text,
  events jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    te.entity_type,
    te.entity_id,
    case when te.entity_type = 'job' then te.entity_id else j.id end as job_id,
    te.counter_kind,
    j.category,
    coalesce(r.accepted_start_sla_hours, p.start_sla_hours) as start_sla_hours,
    -- RN-SLA-18 · el congelado del trabajo y **no** el del plan de hoy:
    -- un cambio de plan no reescribe un trabajo que ya está corriendo.
    -- `null` significa "el valor por omisión de RN-SLA-12", que lo pone
    -- `src/core/sla-timers.ts`.
    j.execution_sla_hours,
    sp.timezone,
    jsonb_agg(jsonb_build_object(
      'event_type', te.event_type,
      'occurred_at', te.occurred_at,
      'cause', te.cause
    ) order by te.occurred_at) as events
  from public.timer_events te
  join public.spaces sp on sp.id = te.space_id
  left join public.jobs j
    on (te.entity_type = 'job' and j.id = te.entity_id)
    or (te.entity_type = 'request' and j.request_id = te.entity_id)
  left join public.requests r on r.id = coalesce(j.request_id, te.entity_id)
  left join public.establishments e on e.id = coalesce(j.establishment_id, r.establishment_id)
  left join public.subscriptions s
    on s.establishment_id = e.id and s.kind = 'plan' and s.status = 'active'
  left join public.plans p on p.id = s.plan_id
  where te.space_id = p_space_id
    and te.counter_kind in ('t2', 't3')
    and e.status not in ('archived', 'suspended', 'paused', 'read_only')
    and (j.id is null or j.state not in ('published', 'completed',
                                         'cancelled_before_start', 'cancelled_after_start'))
  group by te.entity_type, te.entity_id, j.id, te.counter_kind, j.category,
           r.accepted_start_sla_hours, p.start_sla_hours, j.execution_sla_hours, sp.timezone;
$$;

comment on function public.sla_sweep_counters(uuid) is
  'RN-SLA-15, RN-SLA-18 · las filas que necesita el barrido de plazos: los
   eventos de cada contador vivo, con el plazo de inicio y el de
   realización **congelados al aceptar**. Interna: solo `service_role`, que
   es quien ejecuta la cola.';

-- CLAUDE.md · los mismos privilegios que tenía antes del `drop`, ni uno
-- más. Revocar solo a PUBLIC dejaría la función abierta por RPC a
-- cualquiera con sesión.
revoke all on function public.sla_sweep_counters(uuid) from public, anon, authenticated;
grant execute on function public.sla_sweep_counters(uuid) to service_role;

-- ------------------------------------------------------------
-- 5 · Y el dataset del informe, por lo mismo (RN-REP-21)
-- ------------------------------------------------------------
--
-- Los tiempos de cada cambio de la decisión 60 dicen si cumplió su plazo.
-- Sin esta columna dirían si cumplió el de otro.
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
      -- RN-SLA-18 (migración 118) · el plazo de realización con el que se
      -- aceptó este trabajo.
      j.execution_sla_hours,
      -- RN-REP-21 · el código de la SOLICITUD y la fecha en que se aceptó.
      (select rq.code from public.requests rq where rq.id = j.request_id) as request_code,
      (select rq.accepted_at from public.requests rq where rq.id = j.request_id) as request_accepted_at,
      (select s.plan_id from public.subscriptions s
        where s.establishment_id = j.establishment_id and s.kind = 'plan' and s.status = 'active'
        order by s.started_at desc limit 1) as plan_id,
      -- RN-COM-15 · el plazo de inicio con el que se ACEPTÓ, y solo si no
      -- lo hay, el del plan vigente.
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

revoke all on function public.report_operation_dataset(uuid, uuid, date, date)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6 · Y los contadores del Inicio del espacio
-- ------------------------------------------------------------
--
-- Esta es la tercera y la encontró el typecheck, no yo: creía que el plazo
-- de ejecución se leía en un solo sitio y se lee en tres
-- —`sla_sweep_counters()` para los avisos, `space_job_counters()` para el
-- Inicio y la fila de `jobs` para la ficha del trabajo—.
--
-- Si esta se queda fuera, el Inicio pinta "plazo en riesgo" con la regla
-- vieja mientras el barrido avisa con la nueva: **dos relojes distintos
-- para el mismo trabajo**, que es peor que uno mal, porque el equipo deja
-- de fiarse de los dos.
--
-- También cambia de firma, así que también hay que soltarla. No es
-- `SECURITY DEFINER` —la lee quien puede ver el espacio, con su RLS— y por
-- eso conserva el EXECUTE de `authenticated`, que es el que tenía.
drop function if exists public.space_job_counters(uuid);

create function public.space_job_counters(p_space_id uuid)
returns table(
  job_id uuid,
  job_code text,
  job_state text,
  establishment_id uuid,
  counter_kind text,
  category text,
  start_sla_hours integer,
  execution_sla_hours integer,
  timezone text,
  events jsonb
)
language sql
stable
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
    -- RN-SLA-18 · el congelado del trabajo, como en el barrido.
    j.execution_sla_hours,
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
    and j.state not in ('published', 'completed',
                        'cancelled_before_start', 'cancelled_after_start')
    and e.status not in ('archived', 'suspended', 'paused', 'read_only')
  group by j.id, j.code, j.state, j.establishment_id, te.counter_kind,
           j.category, r.accepted_start_sla_hours, p.start_sla_hours,
           j.execution_sla_hours, sp.timezone;
$$;

comment on function public.space_job_counters(uuid) is
  'Los contadores vivos del Inicio del espacio, con el plazo de inicio y el
   de realización congelados al aceptar (RN-COM-15, RN-SLA-18). No es
   SECURITY DEFINER: lo filtra la RLS de quien consulta.';

revoke all on function public.space_job_counters(uuid) from public, anon;
grant execute on function public.space_job_counters(uuid) to authenticated;
