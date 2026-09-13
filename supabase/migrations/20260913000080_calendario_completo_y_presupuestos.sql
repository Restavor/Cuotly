-- Fase 2 · Hito 12 · Calendario operativo completo y presupuestos
-- adicionales. Y con ellos, la mensualidad del servicio (RN-COM-08).
--
-- Tres cosas, en este orden:
--
--   1 · **La mensualidad del servicio, con los dos precios** (RN-COM-08,
--       decisión 20 de `docs/DECISIONES.md`). Desde la migración 48
--       `generate_monthly_charge_internal()` se paraba en seco con un
--       servicio porque el esquema "no sabía cuál de los planes es
--       Premium". Bosco decidió el 13/09/2026 que `plans.grants_priority`
--       basta: se cobra `services.price_premium_cents` cuando el plan
--       activo del establecimiento lo tiene, y `price_cents` si no. Se
--       aplica en la mensualidad, en el barrido (`run_monthly_charges()`
--       recorre ahora también los servicios), en el alta del servicio (que
--       emite su primera mensualidad como el plan desde la 52, RN-FIN-01),
--       en el ingreso recurrente del panel y en las próximas renovaciones.
--       `service_monthly_price()` es la misma cuenta, para la pantalla.
--   2 · **El calendario operativo completo** (§75 y §76). `space_calendar()`
--       sigue DERIVANDO los eventos (RN-DAT-05: no hay tabla de eventos
--       que pudiera discrepar), y añade las publicaciones de Menú Diario,
--       las renovaciones de planes y servicios y el final de las
--       sustituciones, con los tres filtros de §75 que se pueden resolver
--       en SQL: restaurante, trabajador y tipo de evento. Sigue siendo
--       SECURITY INVOKER: el trabajador ve los menús de sus restaurantes
--       autorizados y ninguna ausencia ajena la ve el cliente.
--   3 · **Los presupuestos adicionales** (§84): `quotes`, con su código
--       (PRE-0001), sus importes con IVA congelado (RN-FIN-08, P4), su
--       flujo —borrador, enviado, aceptado o rechazado— y los dos estados
--       de pago DERIVADOS del cobro que la aceptación emite (pendiente de
--       pago, pagado). Tras aceptar "se crea solicitud o trabajo sin
--       consumir bolsa" (RN-CON-03): con solicitud, la aceptación del
--       presupuesto ES la aceptación de la solicitud y el trabajo nace
--       presupuestado; sin ella, se crea la solicitud ya aceptada y su
--       trabajo. "Puede exigirse pago previo o autorizar inicio antes del
--       pago; la autorización queda registrada": `requires_payment_before_start`
--       en el presupuesto, `authorize_quote_start()` con motivo y apunte, y
--       `start_job()` que no deja Comenzar un trabajo presupuestado con
--       pago pendiente sin esa autorización (RN-JOB-06). Las plantillas
--       `quoted` de Menú Diario (RN-MEN-11) cuelgan de un presupuesto
--       aceptado.
--
-- Lo que este archivo NO inventa, dicho en claro:
--
--   · Los límites de comenzar y de ejecución (§76) no entran en el
--     calendario: se calculan con el reloj laboral de
--     `src/core/business-clock.ts`, que no existe en SQL. Copiarlo aquí
--     sería el segundo reloj que CA-10 prohíbe.
--   · Quién acepta un presupuesto por el restaurante: la misma lista que
--     `client_can_accept_terms()` (propietario local y propietario global
--     del grupo), porque compromete dinero, como las condiciones. El
--     Editor no. Está anotado como pendiente en `docs/DECISIONES.md`.
--   · Un presupuesto rechazado deja la solicitud donde estaba: el equipo
--     puede enviar otro y el restaurante puede no continuarla. No se
--     inventa un estado nuevo de solicitud.
--   · El periodo del cobro de un presupuesto es el día de la aceptación:
--     `charges` exige un periodo y un cobro puntual no tiene otro.
--
-- Se comprueba con `supabase/tests/presupuestos_y_calendario.sql`.

-- ============================================================
-- 1 · La mensualidad del servicio (RN-COM-08, decisión 20)
-- ============================================================

-- La cuenta, una sola vez. Interna: no comprueba permisos.
create or replace function public.service_monthly_price_internal(p_subscription_id uuid)
returns table (base_cents integer, premium_applied boolean, service_name text)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when sv.price_premium_cents is not null and exists (
        select 1
        from public.subscriptions ps
        join public.plans p on p.id = ps.plan_id
        where ps.establishment_id = s.establishment_id
          and ps.kind = 'plan'
          and ps.status = 'active'
          and p.grants_priority
      ) then sv.price_premium_cents
      else sv.price_cents
    end,
    sv.price_premium_cents is not null and exists (
        select 1
        from public.subscriptions ps
        join public.plans p on p.id = ps.plan_id
        where ps.establishment_id = s.establishment_id
          and ps.kind = 'plan'
          and ps.status = 'active'
          and p.grants_priority
    ),
    sv.name
  from public.subscriptions s
  join public.services sv on sv.id = s.service_id
  where s.id = p_subscription_id and s.kind = 'service';
$$;

comment on function public.service_monthly_price_internal(uuid) is
  'RN-COM-08 · el precio mensual de un servicio contratado: el Premium si
   el establecimiento tiene activo un plan con grants_priority (decisión
   20), el normal si no. Interna: no comprueba permisos.';

revoke all on function public.service_monthly_price_internal(uuid) from public, anon, authenticated;

-- La misma cuenta para la pantalla, con comprobación de acceso: quien
-- puede leer el restaurante puede saber qué se le cobra.
create or replace function public.service_monthly_price(p_subscription_id uuid)
returns table (base_cents integer, premium_applied boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
begin
  select establishment_id into v_establishment_id
  from public.subscriptions where id = p_subscription_id and kind = 'service';

  if v_establishment_id is null then
    raise exception 'Suscripción de servicio no encontrada';
  end if;

  if not public.can_read_establishment(v_establishment_id) then
    raise exception 'No tienes acceso a este restaurante';
  end if;

  return query
  select i.base_cents, i.premium_applied
  from public.service_monthly_price_internal(p_subscription_id) i;
end;
$$;

revoke all on function public.service_monthly_price(uuid) from public, anon;
grant execute on function public.service_monthly_price(uuid) to authenticated;

-- El periodo en curso de cualquier suscripción, sin crear nada: el ciclo
-- de consumos si es un plan (lo que ya hay), la ventana mensual desde el
-- alta si es un servicio (`menu_update_cycle_window()`, que sirve para
-- cualquier servicio: solo mira `started_at`).
create or replace function public.subscription_current_period(p_subscription_id uuid)
returns table (period_start timestamptz, period_end timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_started_at timestamptz;
  v_timezone text;
  v_local_start timestamp;
  v_local_now timestamp;
  v_k integer := 0;
begin
  select s.kind, s.started_at, sp.timezone
  into v_kind, v_started_at, v_timezone
  from public.subscriptions s
  join public.spaces sp on sp.id = s.space_id
  where s.id = p_subscription_id;

  if v_kind is null then
    raise exception 'Suscripción no encontrada';
  end if;

  -- La misma aritmética que get_or_create_consumption_cycle_internal() y
  -- menu_update_cycle_window(): meses naturales desde el alta, en la zona
  -- del espacio (RN-CLK-06).
  v_local_start := v_started_at at time zone v_timezone;
  v_local_now := now() at time zone v_timezone;
  while (v_local_start + ((v_k + 1) || ' months')::interval) <= v_local_now loop
    v_k := v_k + 1;
  end loop;

  period_start := (v_local_start + (v_k || ' months')::interval) at time zone v_timezone;
  period_end := (v_local_start + ((v_k + 1) || ' months')::interval) at time zone v_timezone;
  return next;
end;
$$;

revoke all on function public.subscription_current_period(uuid) from public, anon, authenticated;

create or replace function public.generate_monthly_charge_internal(
  p_subscription_id uuid,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_kind text;
  v_concept text;
  v_base_cents integer;
  v_premium boolean := false;
  v_tax_rate numeric(5, 2);
  v_tax_cents integer;
  v_term_days integer;
  v_cycle_id uuid;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_charge_id uuid;
begin
  select s.space_id, s.establishment_id, s.kind, p.name, p.price_cents
  into v_space_id, v_establishment_id, v_kind, v_concept, v_base_cents
  from public.subscriptions s
  left join public.plans p on p.id = s.plan_id
  where s.id = p_subscription_id and s.status = 'active';

  if v_space_id is null then
    raise exception 'Suscripción activa no encontrada';
  end if;

  if v_kind = 'plan' then
    v_cycle_id := public.get_or_create_consumption_cycle_internal(p_subscription_id);
    select cycle_start, cycle_end into v_cycle_start, v_cycle_end
    from public.consumption_cycles where id = v_cycle_id;
  else
    -- RN-COM-08 · el servicio: 229 € o 199 € según el plan (decisión 20).
    select i.base_cents, i.premium_applied, i.service_name
    into v_base_cents, v_premium, v_concept
    from public.service_monthly_price_internal(p_subscription_id) i;

    if v_base_cents is null then
      raise exception 'El servicio de la suscripción no tiene precio';
    end if;

    select w.period_start, w.period_end into v_cycle_start, v_cycle_end
    from public.subscription_current_period(p_subscription_id) w;
  end if;

  select id into v_charge_id from public.charges
  where subscription_id = p_subscription_id and period_start = v_cycle_start;
  if v_charge_id is not null then
    return v_charge_id; -- RN-DAT-09: emitir dos veces no cobra dos veces.
  end if;

  select tax_rate_percent, payment_term_days
  into v_tax_rate, v_term_days
  from public.spaces where id = v_space_id;
  v_tax_cents := round(v_base_cents * v_tax_rate / 100)::integer;

  insert into public.charges
    (space_id, establishment_id, subscription_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_by)
  values
    (v_space_id, v_establishment_id, p_subscription_id, v_concept, v_cycle_start, v_cycle_end,
     v_base_cents, v_tax_rate, v_tax_cents, v_base_cents + v_tax_cents,
     -- RN-FIN-01b: el plazo se cuenta desde la emisión real (migración 52).
     coalesce(p_due_at, greatest(now(), v_cycle_start) + (v_term_days || ' days')::interval),
     auth.uid())
  returning id into v_charge_id;

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    (v_space_id, v_establishment_id, v_charge_id, 'charge', v_base_cents + v_tax_cents,
     'Mensualidad ' || v_concept, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'charge.issued', 'charge', v_charge_id,
          jsonb_build_object('establishment_id', v_establishment_id, 'total_cents', v_base_cents + v_tax_cents,
                             'period_start', v_cycle_start, 'kind', v_kind, 'premium_price', v_premium));

  return v_charge_id;
end;
$$;

revoke all on function public.generate_monthly_charge_internal(uuid, timestamptz)
  from public, anon, authenticated;

comment on function public.generate_monthly_charge_internal(uuid, timestamptz) is
  'Cuerpo de generate_monthly_charge() sin la comprobación de permiso, para
   que la pueda llamar el proceso de la cola. Desde el Hito 12 también
   emite la mensualidad de un servicio, con el precio de RN-COM-08. El
   vencimiento sale de `spaces.payment_term_days` (RN-FIN-01b).';

-- El barrido recorre planes Y servicios. La comprobación de "ya cobrado"
-- usa el periodo en curso de cada uno sin crear ciclos.
create or replace function public.run_monthly_charges(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub uuid;
  v_emitidos integer := 0;
  v_charge uuid;
  v_period_start timestamptz;
begin
  for v_sub in
    select s.id from public.subscriptions s
    join public.establishments e on e.id = s.establishment_id
    where s.space_id = p_space_id
      and s.status = 'active'
      -- A un restaurante archivado no se le sigue pasando la mensualidad.
      -- Suspendido o pausado sí: RN-FIN-14, la deuda no desaparece.
      and e.status <> 'archived'
    order by s.kind, s.started_at
  loop
    begin
      select w.period_start into v_period_start
      from public.subscription_current_period(v_sub) w;

      if exists (
        select 1 from public.charges c
        where c.subscription_id = v_sub and c.period_start = v_period_start
      ) then
        continue;
      end if;

      v_charge := public.generate_monthly_charge_internal(v_sub, null);
      if v_charge is not null then
        v_emitidos := v_emitidos + 1;
      end if;
    exception when others then
      -- Un restaurante que falle no puede dejar sin cobrar a los demás.
      null;
    end;
  end loop;

  return v_emitidos;
end;
$$;

revoke all on function public.run_monthly_charges(uuid) from public, anon, authenticated;

-- El alta del servicio emite su primera mensualidad, como el alta del
-- plan desde la 52: el alta ES la primera fecha de renovación (RN-FIN-01).
create or replace function public.create_service_subscription(
  p_establishment_id uuid,
  p_service_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_service_space_id uuid;
  v_subscription_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para contratar un servicio a este establecimiento';
  end if;

  select space_id into v_service_space_id from public.services where id = p_service_id;
  if v_service_space_id is null or v_service_space_id <> v_space_id then
    raise exception 'El servicio no pertenece al mismo espacio que el establecimiento';
  end if;

  -- CA-17: pulsar dos veces no contrata dos veces.
  select id into v_subscription_id
  from public.subscriptions
  where establishment_id = p_establishment_id
    and kind = 'service'
    and service_id = p_service_id
    and status = 'active';

  if v_subscription_id is not null then
    return v_subscription_id;
  end if;

  insert into public.subscriptions (space_id, establishment_id, kind, service_id, created_by)
  values (v_space_id, p_establishment_id, 'service', p_service_id, auth.uid())
  returning id into v_subscription_id;

  -- RN-COM-09: "permanencia mínima de 3 meses", igual que un plan.
  insert into public.plan_commitments
    (space_id, establishment_id, subscription_id, service_id, started_at, ends_at, cause, created_by)
  values
    (v_space_id, p_establishment_id, v_subscription_id, p_service_id,
     now(), now() + interval '3 months', 'initial', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id, auth.uid(), 'subscription.service_created', 'subscription', v_subscription_id,
    jsonb_build_object('establishment_id', p_establishment_id, 'service_id', p_service_id)
  );

  -- RN-FIN-01 · la mensualidad del primer periodo, con el precio de
  -- RN-COM-08. Por la interna, como el plan: quien contrata tiene
  -- `manage_clients`, no `manage_finance`, y el cobro queda auditado igual.
  perform public.generate_monthly_charge_internal(v_subscription_id, null);

  return v_subscription_id;
end;
$$;

comment on function public.create_service_subscription(uuid, uuid) is
  'HU-07 · contrata un servicio adicional (RN-COM-11/13) con su permanencia
   de 3 meses (RN-COM-09) y, desde el Hito 12, su primera mensualidad con
   el precio de RN-COM-08 (decisión 20). Comprueba `manage_clients`.';

revoke all on function public.create_service_subscription(uuid, uuid) from public, anon;
grant execute on function public.create_service_subscription(uuid, uuid) to authenticated;

-- El ingreso recurrente mensual cuenta también los servicios, con el
-- precio que se les cobra de verdad.
create or replace function public.financial_dashboard(
  p_space_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  forecast_base_cents bigint,
  forecast_total_cents bigint,
  collected_cents bigint,
  pending_cents bigint,
  overdue_cents bigint,
  recurring_monthly_base_cents bigint,
  recurring_monthly_total_cents bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_capability(p_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para ver el panel financiero de este espacio';
  end if;

  return query
  with emitidos as (
    select c.id, c.base_cents, c.total_cents, c.due_at,
           public.charge_outstanding_cents(c.id) as outstanding_cents,
           public.charge_collected_cents(c.id) as collected_cents
    from public.charges c
    where c.space_id = p_space_id
      and c.issued_at >= p_from and c.issued_at < p_to
  ),
  mensual as (
    -- Ingreso recurrente mensual: lo que se espera facturar cada mes
    -- mientras nada cambie (P6: previsión declarada, no extrapolada).
    select p.price_cents as base_cents
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.space_id = p_space_id and s.kind = 'plan' and s.status = 'active'
    union all
    select i.base_cents
    from public.subscriptions s
    cross join lateral public.service_monthly_price_internal(s.id) i
    where s.space_id = p_space_id and s.kind = 'service' and s.status = 'active'
  ),
  recurrente as (
    select
      coalesce(sum(m.base_cents), 0)::bigint as base_cents,
      coalesce(sum(m.base_cents + round(m.base_cents * sp.tax_rate_percent / 100)), 0)::bigint as total_cents
    from mensual m
    cross join public.spaces sp
    where sp.id = p_space_id
  )
  select
    coalesce(sum(e.base_cents), 0)::bigint,
    coalesce(sum(e.total_cents), 0)::bigint,
    coalesce(sum(e.collected_cents), 0)::bigint,
    coalesce(sum(case when e.outstanding_cents > 0 and now() <= e.due_at then e.outstanding_cents else 0 end), 0)::bigint,
    coalesce(sum(case when e.outstanding_cents > 0 and now() > e.due_at then e.outstanding_cents else 0 end), 0)::bigint,
    (select base_cents from recurrente),
    (select total_cents from recurrente)
  from emitidos e;
end;
$$;

revoke all on function public.financial_dashboard(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.financial_dashboard(uuid, timestamptz, timestamptz) to authenticated;

-- Próximas renovaciones: planes y servicios. `plan_name` conserva su
-- nombre por las pantallas que ya lo leen; para un servicio lleva el del
-- servicio, y `kind` dice cuál es.
drop function public.upcoming_renewals(uuid, integer);
create or replace function public.upcoming_renewals(p_space_id uuid, p_days integer default 30)
returns table (
  establishment_id uuid,
  establishment_name text,
  plan_name text,
  kind text,
  renews_at timestamptz,
  monthly_total_cents bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_capability(p_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para ver el panel financiero de este espacio';
  end if;

  return query
  select e.id, e.name, p.name, s.kind, w.period_end,
         (p.price_cents + round(p.price_cents * sp.tax_rate_percent / 100))::bigint
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  join public.establishments e on e.id = s.establishment_id
  join public.spaces sp on sp.id = e.space_id
  cross join lateral public.subscription_current_period(s.id) w
  where s.space_id = p_space_id
    and s.kind = 'plan'
    and s.status = 'active'
    and e.status <> 'archived'
    and w.period_end >= now()
    and w.period_end < now() + make_interval(days => p_days)
  union all
  select e.id, e.name, i.service_name, s.kind, w.period_end,
         (i.base_cents + round(i.base_cents * sp.tax_rate_percent / 100))::bigint
  from public.subscriptions s
  join public.establishments e on e.id = s.establishment_id
  join public.spaces sp on sp.id = e.space_id
  cross join lateral public.subscription_current_period(s.id) w
  cross join lateral public.service_monthly_price_internal(s.id) i
  where s.space_id = p_space_id
    and s.kind = 'service'
    and s.status = 'active'
    and e.status <> 'archived'
    and w.period_end >= now()
    and w.period_end < now() + make_interval(days => p_days)
  order by 5 asc;
end;
$$;

revoke all on function public.upcoming_renewals(uuid, integer) from public, anon;
grant execute on function public.upcoming_renewals(uuid, integer) to authenticated;

-- ============================================================
-- 2 · El calendario operativo completo (§75, §76)
--
-- Sigue sin haber tabla de eventos (RN-DAT-05) y sigue siendo SECURITY
-- INVOKER: cada `union` lo filtra la política de RLS de su tabla con la
-- identidad de quien mira. Cambia la firma (tres filtros de §75 y dos
-- columnas más de salida), así que se sustituye la función entera.
-- ============================================================
drop function public.space_calendar(uuid, date, date);

create or replace function public.space_calendar(
  p_space_id uuid,
  p_from date,
  p_to date,
  p_establishment_id uuid default null,
  p_worker_id uuid default null,
  p_kind text default null
)
returns table (
  kind text,
  event_date date,
  title text,
  entity_type text,
  entity_id uuid,
  state text,
  establishment_id uuid
)
language sql
stable
set search_path = public
as $$
  with eventos as (
    select 'holiday'::text as kind, h.holiday_date as event_date, h.name as title,
           'holiday'::text as entity_type, h.id as entity_id, null::text as state,
           null::uuid as establishment_id, null::uuid as worker_id
    from public.holidays h
    where h.space_id = p_space_id and h.holiday_date between p_from and p_to

    union all
    -- Una ausencia aprobada o pendiente ocupa todos sus días.
    select 'absence', d::date, coalesce(a.reason, ''), 'absence', a.id, a.state, null, a.user_id
    from public.absences a
    cross join lateral generate_series(a.starts_on, a.ends_on, interval '1 day') d
    where a.space_id = p_space_id
      and a.state in ('requested', 'approved')
      and d::date between p_from and p_to

    union all
    -- Vencimiento de la ventana de corrección de un trabajo publicado
    -- (RN-COR-02, §76 "fin de corrección").
    select 'correction_window', j.correction_window_ends_at::date, j.code, 'job', j.id, j.state,
           j.establishment_id, j.assigned_to
    from public.jobs j
    where j.space_id = p_space_id
      and j.correction_window_ends_at is not null
      and j.correction_window_ends_at::date between p_from and p_to

    union all
    -- Vencimiento de un cobro (RN-FIN-10/11).
    select 'charge_due', c.due_at::date, c.concept, 'charge', c.id, public.charge_status(c.id),
           c.establishment_id, null
    from public.charges c
    where c.space_id = p_space_id and c.due_at::date between p_from and p_to

    union all
    -- §76 · publicaciones de Menú Diario: todo menú con publicación
    -- pedida, en curso, publicada o fallida, en su fecha objetivo. Un
    -- borrador o un preparado sin pedir no es una publicación todavía.
    select 'menu_publication', m.target_date, m.name || ' · ' || e.name, 'menu', m.id, m.state,
           m.establishment_id,
           (select p.assigned_to from public.menu_publications p
            where p.menu_id = m.id and p.cancelled_at is null
            order by p.requested_at desc limit 1)
    from public.menus m
    join public.establishments e on e.id = m.establishment_id
    where m.space_id = p_space_id
      and m.target_date between p_from and p_to
      and m.state in ('publication_requested', 'pending_assignment', 'assigned', 'needs_information',
                      'reviewing', 'ready_to_publish', 'published', 'publication_error')

    union all
    -- §76 · renovaciones de planes y servicios: cada mes natural desde el
    -- alta, en la zona del espacio (RN-COM-04/06/09), la misma aritmética
    -- que los ciclos. Se DERIVAN: no hay fila de renovación que pueda
    -- decir otra cosa que la suscripción.
    select 'renewal', r.renews_on, coalesce(p.name, sv.name, '') || ' · ' || e.name, 'subscription', s.id,
           s.kind, s.establishment_id, null
    from public.subscriptions s
    join public.establishments e on e.id = s.establishment_id
    join public.spaces sp on sp.id = s.space_id
    left join public.plans p on p.id = s.plan_id
    left join public.services sv on sv.id = s.service_id
    cross join lateral (
      select ((s.started_at at time zone sp.timezone) + (k || ' months')::interval)::date as renews_on
      from generate_series(
        greatest(1, ((extract(year from p_from) - extract(year from (s.started_at at time zone sp.timezone))) * 12
                     + (extract(month from p_from) - extract(month from (s.started_at at time zone sp.timezone))) - 1)::integer),
        greatest(1, ((extract(year from p_to) - extract(year from (s.started_at at time zone sp.timezone))) * 12
                     + (extract(month from p_to) - extract(month from (s.started_at at time zone sp.timezone))) + 1)::integer)
      ) k
    ) r
    where s.space_id = p_space_id
      and s.status = 'active'
      and e.status <> 'archived'
      and r.renews_on between p_from and p_to

    union all
    -- §76 · final de una sustitución (RN-SUP-03).
    select 'supervision_end', sv.ends_at::date, coalesce(pw.full_name, pw.email, ''), 'supervision', sv.id,
           sv.kind, null, sv.worker_id
    from public.supervisions sv
    left join public.profiles pw on pw.id = sv.worker_id
    where sv.space_id = p_space_id
      and sv.kind = 'substitute'
      and sv.revoked_at is null
      and sv.ends_at is not null
      and sv.ends_at::date between p_from and p_to
  )
  select ev.kind, ev.event_date, ev.title, ev.entity_type, ev.entity_id, ev.state, ev.establishment_id
  from eventos ev
  where (p_establishment_id is null or ev.establishment_id = p_establishment_id)
    and (p_worker_id is null or ev.worker_id = p_worker_id)
    and (p_kind is null or ev.kind = p_kind)
  order by ev.event_date, ev.kind, ev.title;
$$;

comment on function public.space_calendar(uuid, date, date, uuid, uuid, text) is
  'Calendario operativo del espacio (§75, §76). Los eventos se DERIVAN
   (RN-DAT-05) y SECURITY INVOKER deja que RLS decida qué ve cada uno:
   el cliente nunca ve ausencias ni sustituciones (P7). Desde el Hito 12:
   publicaciones de Menú Diario, renovaciones de planes y servicios, final
   de sustituciones, y los filtros de restaurante, trabajador y tipo. Los
   límites de comenzar y ejecución no están: viven en el reloj laboral de
   src/core/business-clock.ts y aquí no hay segundo reloj (CA-10).';

revoke all on function public.space_calendar(uuid, date, date, uuid, uuid, text) from public, anon;
grant execute on function public.space_calendar(uuid, date, date, uuid, uuid, text) to authenticated;

-- ============================================================
-- 3 · Presupuestos adicionales (§84)
-- ============================================================
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- Cuelga de una solicitud cuando el presupuesto es la respuesta a una
  -- petición del restaurante (§9.1, paso 8: "se aplica el presupuesto").
  -- Sin solicitud, es un presupuesto que propone el equipo por su cuenta.
  request_id uuid references public.requests (id),
  code text not null,
  concept text not null check (length(btrim(concept)) > 0 and length(concept) <= 160),
  description text check (description is null or length(description) <= 4000),
  -- Qué crea la aceptación: un trabajo (con su solicitud, si no la había)
  -- o nada, porque lo presupuestado es una plantilla de Menú Diario que
  -- el equipo diseña después (RN-MEN-11, `origin = quoted`).
  outcome text not null check (outcome in ('job', 'menu_template')),
  category text check (category in ('small', 'photo', 'medium', 'large')),
  -- RN-FIN-08 y P4: base, impuesto y total guardados, con el tipo del
  -- espacio copiado al crear el presupuesto.
  base_cents integer not null check (base_cents >= 0),
  tax_rate_percent numeric(5, 2) not null check (tax_rate_percent >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  -- §84: "puede exigirse pago previo o autorizar inicio antes del pago".
  requires_payment_before_start boolean not null default true,
  -- Los cuatro estados que se GUARDAN. "Pendiente de pago" y "Pagado" se
  -- derivan del cobro (quote_status(), RN-DAT-05).
  state text not null default 'draft' check (state in ('draft', 'sent', 'accepted', 'rejected')),
  sent_at timestamptz,
  sent_by uuid references public.profiles (id),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  decision_reason text,
  start_authorized_at timestamptz,
  start_authorized_by uuid references public.profiles (id),
  start_authorization_reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, code),
  constraint quotes_amounts_add_up check (total_cents = base_cents + tax_cents),
  constraint quotes_outcome_shape check (
    (outcome = 'job' and category is not null)
    or (outcome = 'menu_template' and request_id is null)
  )
);

comment on table public.quotes is
  '§84 · un presupuesto adicional. Borrador, enviado, aceptado o
   rechazado se guardan; pendiente de pago y pagado los deriva
   quote_status() del cobro que emite la aceptación. Sin política de
   escritura: todo pasa por las funciones de la migración 80.';

alter table public.quotes enable row level security;

create index quotes_establishment_idx on public.quotes (establishment_id, created_at desc);
create index quotes_space_state_idx on public.quotes (space_id, state);

-- Una solicitud tiene como mucho un presupuesto abierto y como mucho uno
-- aceptado: es la base quien lo impide, no solo la función.
create unique index quotes_one_open_per_request_idx
  on public.quotes (request_id) where request_id is not null and state in ('draft', 'sent');
create unique index quotes_one_accepted_per_request_idx
  on public.quotes (request_id) where request_id is not null and state = 'accepted';

-- Quién lee: quien gestiona solicitudes (propietario y administradores)
-- y, del lado cliente, quien ve la facturación (RN-FIN-07: propietario
-- local, propietario global y Editor con `view_billing`; Consulta no).
-- Un borrador no ha salido del equipo: el restaurante no lo ve.
create policy quotes_select on public.quotes
for select using (
  public.has_capability(space_id, 'manage_requests')
  or (state <> 'draft' and public.client_can_view_billing(establishment_id))
);

-- P7 / CLAUDE.md: la fila es del restaurante, las columnas con identidad
-- del equipo no. Quien lo decidió puede ser un propietario del propio
-- restaurante, pero se tapa igual: la regla es por columna, no por caso.
revoke select on public.quotes from anon, authenticated;
grant select (id, space_id, establishment_id, request_id, code, concept, description, outcome, category,
              base_cents, tax_rate_percent, tax_cents, total_cents, requires_payment_before_start,
              state, sent_at, decided_at, decision_reason, start_authorized_at, start_authorization_reason,
              created_at, updated_at)
  on public.quotes to authenticated;

-- Las tres tablas que cuelgan de un presupuesto.
alter table public.charges add column quote_id uuid references public.quotes (id);
create unique index charges_quote_idx on public.charges (quote_id) where quote_id is not null;
grant select (quote_id) on public.charges to authenticated;
comment on column public.charges.quote_id is
  '§84 · el presupuesto cuyo cobro es este. Un cobro puntual: subscription_id nulo.';

alter table public.jobs add column quote_id uuid references public.quotes (id);
comment on column public.jobs.quote_id is
  'RN-CON-03 / RN-JOB-06 · el presupuesto del que nace un trabajo
   presupuestado aparte. Nulo en un cambio incluido en el plan.';

alter table public.menu_templates add column quote_id uuid references public.quotes (id);
grant select (quote_id) on public.menu_templates to authenticated;
comment on column public.menu_templates.quote_id is
  'RN-MEN-11 · la plantilla `quoted` cuelga del presupuesto aceptado que la pagó.';

-- ------------------------------------------------------------
-- 3.1 · El estado derivado (RN-DAT-05)
-- ------------------------------------------------------------
-- SECURITY INVOKER: si quien pregunta no puede ver el presupuesto, no ve
-- su estado. `charge_outstanding_cents()` es la misma cuenta que usa el
-- resto de finanzas: el saldo sale del libro, no de una columna.
create or replace function public.quote_status(p_quote_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case q.state
    when 'accepted' then
      case when coalesce(public.charge_outstanding_cents(c.id), 0) > 0 then 'pending_payment' else 'paid' end
    else q.state
  end
  from public.quotes q
  left join public.charges c on c.quote_id = q.id
  where q.id = p_quote_id;
$$;

comment on function public.quote_status(uuid) is
  '§84 · los cinco estados visibles de un presupuesto: borrador, enviado,
   rechazado, pendiente de pago y pagado. Los dos últimos se derivan del
   cobro que emitió la aceptación (RN-DAT-05); "aceptado" a secas no se
   enseña porque aceptar es el instante en que nace el cobro.';

revoke all on function public.quote_status(uuid) from public, anon;
grant execute on function public.quote_status(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3.2 · Los avisos: tres eventos y una entidad nueva (§18, RN-NOT)
-- ------------------------------------------------------------
-- Duplicado a propósito en `src/core/notifications.ts`;
-- `listas-compartidas.test.ts` lee esta ÚLTIMA definición.
alter table public.notifications
  drop constraint notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check check (event_type in (
    'request_submitted',
    'job_unassigned',
    'job_assigned',
    'job_started',
    'job_published',
    'correction_requested',
    'job_reassignment_requested',
    'task_reassignment_requested',
    'terms_version_published',
    'menu_publication_requested',
    'menu_assigned',
    'menu_needs_information',
    'menu_published',
    'menu_publication_error',
    'menu_not_prepared_reminder',
    'menu_publication_overdue',
    'quote_sent',
    'quote_accepted',
    'quote_rejected',
    'consumption_threshold_80',
    'consumption_threshold_100',
    't2_threshold_50',
    't2_threshold_80',
    't2_threshold_100',
    't2_critical_alert',
    't2_reassignment_suggestion',
    't3_threshold_75',
    't3_threshold_90',
    't3_threshold_100',
    'establishment_paused_nonpayment',
    'establishment_suspended_nonpayment',
    'establishment_reactivated',
    'absence_requested',
    'absence_decided',
    'absence_uncovered_jobs'
  ));

alter table public.notifications
  drop constraint notifications_entity_type_check;

alter table public.notifications
  add constraint notifications_entity_type_check check (entity_type in (
    'request', 'job', 'task', 'establishment', 'charge', 'absence', 'menu', 'quote'
  ));

-- A quién avisa cada evento de un presupuesto (§18, RN-NOT-01):
--   · quote_sent → quien puede aceptarlo por el restaurante: propietario
--     local y propietario global del grupo (la misma lista que
--     `client_can_accept_terms()`). Ni el Editor, ni Consulta, ni nadie
--     con el acceso retirado (RN-EST-05).
--   · quote_accepted, quote_rejected → propietario y administradores del
--     espacio. A un trabajador no: todavía no hay nada asignado.
-- Interna: la llaman las funciones de abajo, que sí comprueban permisos.
create or replace function public.notify_quote_event(p_quote_id uuid, p_event_type text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
  v_slug text;
  v_recipient uuid;
  v_sent integer := 0;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'Presupuesto no encontrado';
  end if;

  v_slug := public.space_slug(v_quote.space_id);

  if p_event_type = 'quote_sent' then
    for v_recipient in
      select em.user_id
      from public.establishment_memberships em
      where em.establishment_id = v_quote.establishment_id
        and em.revoked_at is null
        and em.role = 'local_owner'
      union
      select gm.user_id
      from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = v_quote.establishment_id
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    loop
      if public.emit_notification(
           v_quote.space_id, v_recipient, p_event_type, 'client',
           'quote', v_quote.id,
           '/espacios/' || v_slug || '/restaurantes/' || v_quote.establishment_id::text || '/facturacion',
           p_event_type || ':' || v_quote.id::text,
           v_quote.establishment_id, null, v_quote.total_cents) is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  else
    for v_recipient in
      select sm.user_id
      from public.space_memberships sm
      where sm.space_id = v_quote.space_id
        and sm.status = 'active'
        and sm.role in ('owner', 'admin')
    loop
      if public.emit_notification(
           v_quote.space_id, v_recipient, p_event_type, 'staff',
           'quote', v_quote.id,
           '/espacios/' || v_slug || '/finanzas/presupuestos/' || v_quote.id::text,
           p_event_type || ':' || v_quote.id::text,
           v_quote.establishment_id, null, v_quote.total_cents) is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end if;

  return v_sent;
end;
$$;

revoke all on function public.notify_quote_event(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3.3 · Crear, corregir y enviar (el equipo)
-- ------------------------------------------------------------
create or replace function public.create_quote(
  p_establishment_id uuid,
  p_concept text,
  p_base_cents integer,
  p_outcome text,
  p_category text default null,
  p_description text default null,
  p_request_id uuid default null,
  p_requires_payment_before_start boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_request public.requests;
  v_category text := p_category;
  v_tax_rate numeric(5, 2);
  v_tax_cents integer;
  v_seq bigint;
  v_code text;
  v_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  -- Presupuestar es decidir sobre una petición: propietario y
  -- administradores (`manage_requests`, como validar o rechazar).
  if not public.has_capability(v_space_id, 'manage_requests') then
    raise exception 'No tienes permiso para presupuestar en este restaurante';
  end if;

  if p_outcome not in ('job', 'menu_template') then
    raise exception 'Resultado de presupuesto desconocido: %', p_outcome;
  end if;

  if p_concept is null or length(btrim(p_concept)) = 0 then
    raise exception 'El presupuesto necesita un concepto';
  end if;

  if p_base_cents is null or p_base_cents < 0 then
    raise exception 'La base imponible debe ser un importe en céntimos no negativo';
  end if;

  if p_request_id is not null then
    select * into v_request from public.requests where id = p_request_id for update;
    if v_request.id is null or v_request.establishment_id <> p_establishment_id then
      raise exception 'La solicitud no es de este restaurante';
    end if;
    if p_outcome <> 'job' then
      raise exception 'Un presupuesto sobre una solicitud crea un trabajo, no una plantilla';
    end if;
    -- §9.1: el presupuesto se aplica entre la validación interna y la
    -- aceptación del restaurante. Antes no hay alcance; después ya nació
    -- el trabajo.
    if v_request.state not in ('pending_internal_validation', 'pending_client_acceptance') then
      raise exception 'La solicitud no está en un estado que admita presupuesto';
    end if;
    if exists (select 1 from public.quotes where request_id = p_request_id and state = 'accepted') then
      raise exception 'La solicitud ya tiene un presupuesto aceptado';
    end if;
    if exists (select 1 from public.quotes where request_id = p_request_id and state in ('draft', 'sent')) then
      raise exception 'La solicitud ya tiene un presupuesto abierto: corrígelo o espera la respuesta';
    end if;
    v_category := coalesce(v_category, v_request.validated_category);
  end if;

  if p_outcome = 'job' and (v_category is null or v_category not in ('small', 'photo', 'medium', 'large')) then
    raise exception 'Un presupuesto que crea un trabajo necesita una categoría de cambio (RN-CLS)';
  end if;

  if p_outcome = 'menu_template' then
    v_category := null;
    if public.establishment_daily_menu_subscription(p_establishment_id) is null then
      raise exception 'El restaurante no tiene contratado Menú Diario';
    end if;
  end if;

  -- RN-FIN-08 / P4: el tipo del espacio, congelado en el presupuesto.
  select tax_rate_percent into v_tax_rate from public.spaces where id = v_space_id;
  v_tax_cents := round(p_base_cents * v_tax_rate / 100)::integer;

  insert into public.space_sequences (space_id, sequence_name, next_value)
  values (v_space_id, 'quote', 2)
  on conflict (space_id, sequence_name)
  do update set next_value = public.space_sequences.next_value + 1
  returning next_value - 1 into v_seq;
  v_code := 'PRE-' || lpad(v_seq::text, 4, '0');

  insert into public.quotes
    (space_id, establishment_id, request_id, code, concept, description, outcome, category,
     base_cents, tax_rate_percent, tax_cents, total_cents, requires_payment_before_start, created_by)
  values
    (v_space_id, p_establishment_id, p_request_id, v_code, btrim(p_concept), nullif(btrim(coalesce(p_description, '')), ''),
     p_outcome, v_category, p_base_cents, v_tax_rate, v_tax_cents, p_base_cents + v_tax_cents,
     coalesce(p_requires_payment_before_start, true), auth.uid())
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'quote.created', 'quote', v_id,
          jsonb_build_object('establishment_id', p_establishment_id, 'request_id', p_request_id, 'code', v_code,
                             'outcome', p_outcome, 'category', v_category, 'total_cents', p_base_cents + v_tax_cents,
                             'requires_payment_before_start', coalesce(p_requires_payment_before_start, true)));

  return v_id;
end;
$$;

revoke all on function public.create_quote(uuid, text, integer, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.create_quote(uuid, text, integer, text, text, text, uuid, boolean) to authenticated;

-- Un borrador se corrige; lo enviado no (P4: el restaurante decide sobre
-- lo que leyó). El tipo impositivo sigue siendo el congelado al crearlo.
create or replace function public.update_quote_draft(
  p_quote_id uuid,
  p_concept text,
  p_base_cents integer,
  p_description text default null,
  p_category text default null,
  p_requires_payment_before_start boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
  v_category text;
  v_tax_cents integer;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null then
    raise exception 'Presupuesto no encontrado';
  end if;

  if not public.has_capability(v_quote.space_id, 'manage_requests') then
    raise exception 'No tienes permiso para corregir este presupuesto';
  end if;

  if v_quote.state <> 'draft' then
    raise exception 'Solo se corrige un presupuesto en borrador';
  end if;

  if p_concept is null or length(btrim(p_concept)) = 0 then
    raise exception 'El presupuesto necesita un concepto';
  end if;

  if p_base_cents is null or p_base_cents < 0 then
    raise exception 'La base imponible debe ser un importe en céntimos no negativo';
  end if;

  v_category := case when v_quote.outcome = 'job' then coalesce(p_category, v_quote.category) else null end;
  if v_quote.outcome = 'job' and (v_category is null or v_category not in ('small', 'photo', 'medium', 'large')) then
    raise exception 'Un presupuesto que crea un trabajo necesita una categoría de cambio (RN-CLS)';
  end if;

  v_tax_cents := round(p_base_cents * v_quote.tax_rate_percent / 100)::integer;

  update public.quotes
  set concept = btrim(p_concept),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      category = v_category,
      base_cents = p_base_cents,
      tax_cents = v_tax_cents,
      total_cents = p_base_cents + v_tax_cents,
      requires_payment_before_start = coalesce(p_requires_payment_before_start, true),
      updated_at = now()
  where id = p_quote_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_quote.space_id, auth.uid(), 'quote.updated', 'quote', p_quote_id,
          jsonb_build_object('concept', v_quote.concept, 'total_cents', v_quote.total_cents, 'category', v_quote.category,
                             'requires_payment_before_start', v_quote.requires_payment_before_start),
          jsonb_build_object('concept', btrim(p_concept), 'total_cents', p_base_cents + v_tax_cents, 'category', v_category,
                             'requires_payment_before_start', coalesce(p_requires_payment_before_start, true)));
end;
$$;

revoke all on function public.update_quote_draft(uuid, text, integer, text, text, boolean) from public, anon;
grant execute on function public.update_quote_draft(uuid, text, integer, text, text, boolean) to authenticated;

create or replace function public.send_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null then
    raise exception 'Presupuesto no encontrado';
  end if;

  if not public.has_capability(v_quote.space_id, 'manage_requests') then
    raise exception 'No tienes permiso para enviar este presupuesto';
  end if;

  if v_quote.state = 'sent' then
    return; -- CA-17: enviar dos veces no avisa dos veces.
  end if;

  if v_quote.state <> 'draft' then
    raise exception 'Solo se envía un presupuesto en borrador';
  end if;

  -- RN-FIN-12: con el servicio detenido no se le propone nada nuevo.
  perform public.assert_establishment_service_running(v_quote.establishment_id);

  update public.quotes
  set state = 'sent', sent_at = now(), sent_by = auth.uid(), updated_at = now()
  where id = p_quote_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_quote.space_id, auth.uid(), 'quote.sent', 'quote', p_quote_id,
          jsonb_build_object('state', 'draft'),
          jsonb_build_object('state', 'sent', 'total_cents', v_quote.total_cents));

  perform public.notify_quote_event(p_quote_id, 'quote_sent');
end;
$$;

revoke all on function public.send_quote(uuid) from public, anon;
grant execute on function public.send_quote(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3.4 · Aceptar la solicitud cuando hay presupuesto (RN-CON-03)
--
-- La misma función de siempre con una regla más: si la solicitud tiene
-- presupuesto, la aceptación va por el presupuesto. Con uno aceptado,
-- el trabajo nace presupuestado y no toca la bolsa aunque el plan
-- incluyera la categoría; con uno abierto o rechazado, no se acepta por
-- aquí: es el servidor quien lo impide, no el botón.
-- ------------------------------------------------------------
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
begin
  select space_id, establishment_id, state, validated_category
  into v_space_id, v_establishment_id, v_state, v_category
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
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

  -- §84 · el último presupuesto de la solicitud manda sobre cómo se acepta.
  select q.id, q.state into v_quote_id, v_quote_state
  from public.quotes q
  where q.request_id = p_request_id
  order by q.created_at desc
  limit 1;

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

  insert into public.jobs (space_id, establishment_id, request_id, code, category, quote_id)
  values (v_space_id, v_establishment_id, p_request_id, v_job_code, v_category, v_quote_id)
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

revoke all on function public.accept_request(uuid) from public, anon;
grant execute on function public.accept_request(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3.5 · Aceptar y rechazar (el restaurante)
-- ------------------------------------------------------------
create or replace function public.accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
  v_request public.requests;
  v_request_id uuid;
  v_tax_rate numeric(5, 2);
  v_term_days integer;
  v_charge_id uuid;
  v_job_id uuid;
  v_code text;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null then
    raise exception 'Presupuesto no encontrado';
  end if;

  -- Compromete dinero del restaurante: lo acepta quien lo representa
  -- (propietario local o propietario global del grupo), como las
  -- condiciones. El Editor y Consulta, no. El equipo tampoco: no acepta
  -- en nombre del cliente.
  if not public.client_can_accept_terms(v_quote.establishment_id) then
    raise exception 'Solo el propietario del restaurante puede aceptar un presupuesto';
  end if;

  if v_quote.state = 'accepted' then
    return; -- CA-17.
  end if;

  if v_quote.state <> 'sent' then
    raise exception 'El presupuesto no está pendiente de respuesta';
  end if;

  perform public.assert_establishment_service_running(v_quote.establishment_id);

  if v_quote.request_id is not null then
    select * into v_request from public.requests where id = v_quote.request_id;
    if v_request.state <> 'pending_client_acceptance' then
      raise exception 'La solicitud de este presupuesto ya no está pendiente de aceptación';
    end if;
  end if;

  update public.quotes
  set state = 'accepted', decided_at = now(), decided_by = auth.uid(), updated_at = now()
  where id = p_quote_id;

  -- El cobro puntual (RN-FIN-01b para el plazo; RN-FIN-08 con el IVA
  -- congelado en el presupuesto). Sin suscripción: no es una cuota.
  select payment_term_days into v_term_days from public.spaces where id = v_quote.space_id;

  insert into public.charges
    (space_id, establishment_id, subscription_id, quote_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_by)
  values
    (v_quote.space_id, v_quote.establishment_id, null, p_quote_id,
     v_quote.code || ' · ' || v_quote.concept, now(), now() + interval '1 day',
     v_quote.base_cents, v_quote.tax_rate_percent, v_quote.tax_cents, v_quote.total_cents,
     now() + (v_term_days || ' days')::interval, auth.uid())
  returning id into v_charge_id;

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    (v_quote.space_id, v_quote.establishment_id, v_charge_id, 'charge', v_quote.total_cents,
     'Presupuesto ' || v_quote.code, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_quote.space_id, auth.uid(), 'charge.issued', 'charge', v_charge_id,
          jsonb_build_object('establishment_id', v_quote.establishment_id, 'total_cents', v_quote.total_cents,
                             'quote_id', p_quote_id));

  -- §84: "tras aceptación se crea solicitud o trabajo sin consumir bolsa".
  if v_quote.outcome = 'job' then
    if v_quote.request_id is null then
      -- Sin solicitud previa: nace ya validada con el alcance del
      -- presupuesto, y la acepta quien acepta el presupuesto.
      v_code := public.next_request_code(v_quote.establishment_id);
      insert into public.requests
        (space_id, establishment_id, code, state, description, context, created_by,
         validated_category, validated_summary, validated_by, validated_at)
      values
        (v_quote.space_id, v_quote.establishment_id, v_code, 'pending_client_acceptance',
         v_quote.concept, v_quote.description, auth.uid(),
         v_quote.category, v_quote.concept, v_quote.created_by, now())
      returning id into v_request_id;

      update public.quotes set request_id = v_request_id where id = p_quote_id;

      insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
      values (v_quote.space_id, auth.uid(), 'request.created_from_quote', 'request', v_request_id,
              jsonb_build_object('quote_id', p_quote_id, 'code', v_code, 'category', v_quote.category));
    else
      v_request_id := v_quote.request_id;
    end if;

    -- La misma aceptación de siempre: ve el presupuesto aceptado y crea
    -- el trabajo presupuestado (RN-CON-03), con su plazo congelado.
    perform public.accept_request(v_request_id);
    select id into v_job_id from public.jobs where request_id = v_request_id;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_quote.space_id, auth.uid(), 'quote.accepted', 'quote', p_quote_id,
          jsonb_build_object('state', 'sent'),
          jsonb_build_object('state', 'accepted', 'charge_id', v_charge_id, 'request_id', v_request_id, 'job_id', v_job_id));

  perform public.notify_quote_event(p_quote_id, 'quote_accepted');
end;
$$;

revoke all on function public.accept_quote(uuid) from public, anon;
grant execute on function public.accept_quote(uuid) to authenticated;

create or replace function public.reject_quote(p_quote_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null then
    raise exception 'Presupuesto no encontrado';
  end if;

  if not public.client_can_accept_terms(v_quote.establishment_id) then
    raise exception 'Solo el propietario del restaurante puede rechazar un presupuesto';
  end if;

  if v_quote.state = 'rejected' then
    return; -- CA-17.
  end if;

  if v_quote.state <> 'sent' then
    raise exception 'El presupuesto no está pendiente de respuesta';
  end if;

  update public.quotes
  set state = 'rejected', decided_at = now(), decided_by = auth.uid(),
      decision_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_at = now()
  where id = p_quote_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_quote.space_id, auth.uid(), 'quote.rejected', 'quote', p_quote_id,
          jsonb_build_object('state', 'sent'), jsonb_build_object('state', 'rejected'),
          nullif(btrim(coalesce(p_reason, '')), ''));

  perform public.notify_quote_event(p_quote_id, 'quote_rejected');
end;
$$;

revoke all on function public.reject_quote(uuid, text) from public, anon;
grant execute on function public.reject_quote(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3.6 · Autorizar el inicio antes del pago (§84, RN-JOB-06)
-- ------------------------------------------------------------
create or replace function public.authorize_quote_start(p_quote_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null then
    raise exception 'Presupuesto no encontrado';
  end if;

  -- Empezar sin cobrar es una decisión sobre el dinero del espacio.
  if not public.has_capability(v_quote.space_id, 'manage_finance') then
    raise exception 'No tienes permiso para autorizar el inicio sin pago';
  end if;

  if v_quote.start_authorized_at is not null then
    return; -- CA-17.
  end if;

  if v_quote.state <> 'accepted' then
    raise exception 'Solo se autoriza el inicio de un presupuesto aceptado';
  end if;

  update public.quotes
  set start_authorized_at = now(), start_authorized_by = auth.uid(),
      start_authorization_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_at = now()
  where id = p_quote_id;

  -- "La autorización queda registrada" (§84): con actor, fecha y motivo.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_quote.space_id, auth.uid(), 'quote.start_authorized', 'quote', p_quote_id,
          jsonb_build_object('start_authorized', false), jsonb_build_object('start_authorized', true),
          nullif(btrim(coalesce(p_reason, '')), ''));
end;
$$;

revoke all on function public.authorize_quote_start(uuid, text) from public, anon;
grant execute on function public.authorize_quote_start(uuid, text) to authenticated;

-- La puerta de un trabajo presupuestado, para quien puede ver el trabajo:
-- sin importes ni identidades, solo lo que hace falta para saber si se
-- puede Comenzar. Es lo que enseña la ficha del trabajo al responsable.
create or replace function public.job_quote_gate(p_job_id uuid)
returns table (
  quote_id uuid,
  quote_code text,
  requires_payment_before_start boolean,
  paid boolean,
  start_authorized boolean,
  can_start boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_read_job(p_job_id) then
    raise exception 'No tienes acceso a este trabajo';
  end if;

  return query
  select q.id, q.code, q.requires_payment_before_start,
         coalesce(public.charge_outstanding_cents(c.id), 0) = 0,
         q.start_authorized_at is not null,
         (not q.requires_payment_before_start)
           or q.start_authorized_at is not null
           or coalesce(public.charge_outstanding_cents(c.id), 0) = 0
  from public.jobs j
  join public.quotes q on q.id = j.quote_id
  left join public.charges c on c.quote_id = q.id
  where j.id = p_job_id;
end;
$$;

revoke all on function public.job_quote_gate(uuid) from public, anon;
grant execute on function public.job_quote_gate(uuid) to authenticated;

-- Comenzar respeta la puerta (RN-JOB-06). El resto es el cuerpo de la
-- migración 37, sin cambios.
create or replace function public.start_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_request_id uuid;
  v_establishment_id uuid;
  v_gate record;
begin
  select space_id, state, assigned_to, request_id, establishment_id
  into v_space_id, v_state, v_assigned_to, v_request_id, v_establishment_id
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  -- RN-JOB-05: quien comienza es el responsable asignado, nadie más.
  if v_assigned_to is null or v_assigned_to <> auth.uid() then
    raise exception 'Solo el responsable asignado puede comenzar este trabajo';
  end if;

  if v_state = 'in_progress' then
    return; -- CA-17: pulsar Comenzar dos veces produce un único efecto.
  end if;

  if v_state <> 'assigned' then
    raise exception 'El trabajo no está asignado y pendiente de comenzar';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  -- §84 / RN-JOB-06: un trabajo presupuestado con pago previo exigido no
  -- se comienza hasta cobrarlo o hasta que alguien con `manage_finance`
  -- autorice el inicio, y esa autorización queda en el libro.
  select q.requires_payment_before_start, q.start_authorized_at,
         coalesce(public.charge_outstanding_cents(c.id), 0) as outstanding
  into v_gate
  from public.jobs j
  join public.quotes q on q.id = j.quote_id
  left join public.charges c on c.quote_id = q.id
  where j.id = p_job_id;

  if found and v_gate.requires_payment_before_start and v_gate.start_authorized_at is null and v_gate.outstanding > 0 then
    raise exception 'Trabajo presupuestado con pago pendiente: hace falta el pago o la autorización de inicio (§84)';
  end if;

  update public.jobs set state = 'in_progress', started_at = now(), started_by = auth.uid() where id = p_job_id;
  update public.requests set state = 'in_progress' where id = v_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values
    (v_space_id, 't2', 'job', p_job_id, 'stopped', now(), auth.uid()),
    (v_space_id, 't3', 'job', p_job_id, 'started', now(), auth.uid());

  perform public.record_state_event(v_space_id, 'job', p_job_id, 'assigned', 'in_progress', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'job.started', 'job', p_job_id,
    jsonb_build_object('state', 'assigned'),
    jsonb_build_object('state', 'in_progress')
  );

  perform public.notify_job_event(p_job_id, 'job_started');
end;
$$;

revoke all on function public.start_job(uuid) from public, anon;
grant execute on function public.start_job(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3.7 · Lo que el restaurante lee de su solicitud (P7)
-- ------------------------------------------------------------
-- El último presupuesto de una solicitud, sin identidades. Un borrador
-- solo se anuncia ("el equipo está preparando un presupuesto"): decirle
-- al restaurante que acepte cuando el servidor va a decirle que no sería
-- exactamente la pantalla vacía que CA-20 prohíbe.
create or replace function public.client_request_quote(p_request_id uuid)
returns table (
  quote_id uuid,
  code text,
  concept text,
  description text,
  base_cents integer,
  tax_rate_percent numeric,
  tax_cents integer,
  total_cents integer,
  status text,
  requires_payment_before_start boolean,
  start_authorized boolean,
  preparing boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
begin
  select r.establishment_id into v_establishment_id
  from public.requests r where r.id = p_request_id;

  if v_establishment_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_read_establishment(v_establishment_id) then
    raise exception 'No tienes acceso a esta solicitud';
  end if;

  return query
  select
    case when q.state = 'draft' then null else q.id end,
    case when q.state = 'draft' then null else q.code end,
    case when q.state = 'draft' then null else q.concept end,
    case when q.state = 'draft' then null else q.description end,
    case when q.state = 'draft' then null else q.base_cents end,
    case when q.state = 'draft' then null else q.tax_rate_percent end,
    case when q.state = 'draft' then null else q.tax_cents end,
    case when q.state = 'draft' then null else q.total_cents end,
    case when q.state = 'draft' then null else public.quote_status(q.id) end,
    case when q.state = 'draft' then null else q.requires_payment_before_start end,
    case when q.state = 'draft' then null else q.start_authorized_at is not null end,
    q.state = 'draft'
  from public.quotes q
  where q.request_id = p_request_id
  order by q.created_at desc
  limit 1;
end;
$$;

revoke all on function public.client_request_quote(uuid) from public, anon;
grant execute on function public.client_request_quote(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3.8 · Las plantillas `quoted` cuelgan de un presupuesto (RN-MEN-11)
--
-- Cambia la firma (un parámetro más), así que se sustituye entera: dos
-- sobrecargas con valores por omisión serían ambiguas por RPC.
-- ------------------------------------------------------------
drop function public.create_menu_template(uuid, text, text);

create or replace function public.create_menu_template(
  p_establishment_id uuid,
  p_name text,
  p_origin text default 'included',
  p_quote_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_included integer;
  v_quote public.quotes;
  v_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para crear plantillas de Menú Diario en este restaurante';
  end if;

  if public.establishment_daily_menu_subscription(p_establishment_id) is null then
    raise exception 'El restaurante no tiene contratado Menú Diario';
  end if;

  if p_origin not in ('included', 'quoted') then
    raise exception 'Origen de plantilla desconocido: %', p_origin;
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'La plantilla necesita un nombre';
  end if;

  if p_origin = 'included' then
    if p_quote_id is not null then
      raise exception 'Una plantilla incluida no lleva presupuesto';
    end if;

    perform 1 from public.establishments where id = p_establishment_id for update;

    select count(*) into v_included
    from public.menu_templates
    where establishment_id = p_establishment_id and origin = 'included';

    if v_included >= 3 then
      raise exception 'Las tres plantillas incluidas ya se usaron (RN-COM-10): una plantilla nueva se presupuesta aparte';
    end if;
  else
    -- RN-MEN-11: "sustituciones, nuevas plantillas y rediseños se
    -- presupuestan aparte". Aparte quiere decir con presupuesto aceptado
    -- de ESTE restaurante y de plantilla, no un origen escrito a mano.
    if p_quote_id is null then
      raise exception 'Una plantilla presupuestada cuelga de un presupuesto aceptado (RN-MEN-11)';
    end if;

    select * into v_quote from public.quotes where id = p_quote_id;
    if v_quote.id is null or v_quote.establishment_id <> p_establishment_id then
      raise exception 'El presupuesto no es de este restaurante';
    end if;
    if v_quote.outcome <> 'menu_template' then
      raise exception 'Ese presupuesto no es de una plantilla de Menú Diario';
    end if;
    if v_quote.state <> 'accepted' then
      raise exception 'El presupuesto de la plantilla no está aceptado';
    end if;
  end if;

  insert into public.menu_templates (space_id, establishment_id, name, origin, quote_id, created_by)
  values (v_space_id, p_establishment_id, btrim(p_name), p_origin, p_quote_id, auth.uid())
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'menu_template.created', 'menu_template', v_id,
          jsonb_build_object('establishment_id', p_establishment_id, 'name', btrim(p_name), 'origin', p_origin,
                             'quote_id', p_quote_id));

  return v_id;
end;
$$;

revoke all on function public.create_menu_template(uuid, text, text, uuid) from public, anon;
grant execute on function public.create_menu_template(uuid, text, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 3.9 · Auditoría (§21.2): la familia `quote` la decide la fila
-- ------------------------------------------------------------
create or replace function public.audit_action_capability(p_action text)
returns text
language sql
immutable
as $$
  select case split_part(coalesce(p_action, ''), '.', 1)
    when 'space' then 'manage_space'
    when 'membership' then 'manage_space'
    when 'supervision' then 'manage_space'
    when 'plan' then 'manage_space'
    when 'service' then 'manage_space'
    when 'invitation' then 'invite_member'
    when 'charge' then 'manage_finance'
    when 'payment' then 'manage_finance'
    when 'subscription' then 'manage_finance'
    when 'financial' then 'manage_finance'
    when 'establishment' then 'manage_clients'
    when 'establishment_access' then 'manage_clients'
    when 'establishment_note' then 'manage_clients'
    when 'group' then 'manage_clients'
    when 'group_access' then 'manage_clients'
    when 'holiday' then 'manage_holidays'
    when 'menu_template' then 'manage_clients'
    -- Los presupuestos, como las solicitudes: los decide la fila. El
    -- restaurante ve los apuntes de los suyos (los aceptó él) y el
    -- equipo que gestiona, todos.
    else null
  end;
$$;

revoke all on function public.audit_action_capability(text) from public, anon;
grant execute on function public.audit_action_capability(text) to authenticated;

create or replace function public.audit_entity_is_visible(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_entity_id is null then false
    when p_entity_type = 'request' then exists (select 1 from public.requests r where r.id = p_entity_id)
    when p_entity_type = 'job' then exists (select 1 from public.jobs j where j.id = p_entity_id)
    when p_entity_type = 'task' then exists (select 1 from public.tasks t where t.id = p_entity_id)
    when p_entity_type = 'file' then exists (select 1 from public.files f where f.id = p_entity_id)
    when p_entity_type = 'absence' then exists (select 1 from public.absences a where a.id = p_entity_id)
    when p_entity_type = 'correction' then exists (select 1 from public.corrections c where c.id = p_entity_id)
    when p_entity_type = 'menu' then exists (select 1 from public.menus m where m.id = p_entity_id)
    when p_entity_type = 'quote' then exists (select 1 from public.quotes q where q.id = p_entity_id)
    else false
  end;
$$;

revoke all on function public.audit_entity_is_visible(text, uuid) from public, anon;
grant execute on function public.audit_entity_is_visible(text, uuid) to authenticated;
