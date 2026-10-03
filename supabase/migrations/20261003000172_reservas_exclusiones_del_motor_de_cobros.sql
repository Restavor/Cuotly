-- Fase E de Restavor agents (COB-01) · primera de tres migraciones.
--
-- Reservas tiene su propio ciclo de vida (decisión 91, PRD de agents §6.12): un cobro
-- de Reservas vencido NO pausa ni suspende al restaurante en Restavor web, y un impago
-- de Restavor web NO pausa Reservas. Hasta ahora los barridos de Restavor web leían
-- TODOS los cobros del restaurante, sin mirar de qué servicio eran; en cuanto exista
-- el primer cobro de Reservas, el impago de uno pausaría el otro producto.
--
-- Esta migración no añade ninguna función de Reservas: solo cierra esa puerta, con el
-- cambio mínimo en cada lectura de «deuda vencida». Cada función se recrea ENTERA
-- partiendo de su última definición viva (el repositorio las reescribe completas cada
-- vez que crecen; copiar una versión vieja perdería lo que añadió la anterior):
--
--   · `evaluate_establishment_dunning_internal` (migración 155)
--   · `reactivate_establishment_after_payment` (038)
--   · `establishment_has_overdue_debt` (038) y su `_internal` (100)
--   · `run_charge_reminders` (100)
--   · `run_monthly_charges` (080): ni emite mensualidad nueva a una Reservas que se
--     da de baja o ya cerró
--   · `establishments_with_nonpayment` (el panel de impagos de Restavor web)
--   · `my_client_attention` (la lista «Necesita tu atención» de Restavor web): la
--     mensualidad y las condiciones de Reservas se atienden en Restavor agents
--     (PRD §12.3)
--
-- `register_payment()` y `waive_charge()` NO se recrean: el gancho de reactivación de
-- Reservas es un disparador sobre `financial_entries` (migración 173), que sobrevive
-- a cualquier redefinición futura de esas funciones (decisión 134).
--
-- Se comprueba con `supabase/tests/reservas_cobro_y_ciclo.sql`.

-- ------------------------------------------------------------
-- 1 · ¿Es de Reservas?
-- ------------------------------------------------------------
create or replace function public.subscription_is_reservations(p_subscription_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    join public.services sv on sv.id = s.service_id
    where s.id = p_subscription_id and s.kind = 'service' and sv.kind = 'reservations'
  );
$$;

create or replace function public.charge_is_reservations(p_charge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.charges c
    where c.id = p_charge_id
      and c.subscription_id is not null
      and public.subscription_is_reservations(c.subscription_id)
  );
$$;

comment on function public.charge_is_reservations(uuid) is
  'D-D · un cobro de la suscripción al servicio Reservas. Los barridos de Restavor web lo ignoran; Reservas tiene su propio barrido.';

-- Internas: las usan funciones SECURITY DEFINER, ninguna política (CLAUDE.md MUST).
revoke all on function public.subscription_is_reservations(uuid) from public, anon, authenticated;
revoke all on function public.charge_is_reservations(uuid) from public, anon, authenticated;
grant execute on function public.subscription_is_reservations(uuid) to service_role;
grant execute on function public.charge_is_reservations(uuid) to service_role;

-- ------------------------------------------------------------
-- 2 · Las lecturas de deuda vencida de Restavor web, sin los cobros de Reservas
-- ------------------------------------------------------------
-- (dunning)
CREATE OR REPLACE FUNCTION public.evaluate_establishment_dunning_internal(p_establishment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_oldest_due timestamptz;
  v_hours numeric;
  v_stage text;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  -- Manda el cobro vencido más antiguo que siga con deuda viva: uno nuevo
  -- todavía en plazo no rescata a un establecimiento ya suspendido.
  select min(c.due_at) into v_oldest_due
  from public.charges c
  where c.establishment_id = p_establishment_id
    and now() > c.due_at
    and not public.charge_is_reservations(c.id)
    and public.charge_outstanding_cents(c.id) > 0;

  if v_oldest_due is null then
    perform public.reactivate_establishment_after_payment(p_establishment_id);
    return 'current';
  end if;

  -- RN-FIN-10/11: horas **naturales**, no laborables. Es la única familia
  -- de plazos de Restavor web que no pasa por el reloj contractual, y el PRD lo
  -- dice con esa palabra exacta.
  v_hours := extract(epoch from (now() - v_oldest_due)) / 3600;

  if v_hours >= 72 then
    v_stage := 'suspended';
  elsif v_hours >= 24 then
    v_stage := 'paused';
  else
    return 'current';
  end if;

  -- RN-FIN-12 (aclarada 31/08/2026): "se detienen trabajos, publicaciones
  -- y contadores, **desde las +24 h**". Las dos cosas van juntas y en las
  -- dos etapas: hasta la sexta revisión los contadores se paraban a las
  -- 24 h pero los trabajos en curso seguían en `in_progress` y sin
  -- retención, así que el restaurante veía "En curso" un trabajo cuyo
  -- servicio estaba detenido.
  perform public.pause_establishment_counters(p_establishment_id);
  perform public.apply_financial_hold_on_jobs(p_establishment_id);

  if v_stage = 'suspended' then
    perform public.set_establishment_nonpayment_status(p_establishment_id, 'suspended', 'nonpayment_suspension');
  else
    perform public.set_establishment_nonpayment_status(p_establishment_id, 'paused', 'nonpayment_pause');
  end if;

  return v_stage;
end;
$function$
;

-- (reactivate)
CREATE OR REPLACE FUNCTION public.reactivate_establishment_after_payment(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_status text;
  v_restore text;
  v_last_reactivation timestamptz;
begin
  select space_id, status into v_space_id, v_status
  from public.establishments where id = p_establishment_id
  for update;

  -- Se acepta salir también de `ending` y `read_only`: si alguien llevó
  -- ahí un establecimiento moroso, pagar tiene que reanudar sus contadores
  -- igual. Sin esto, el lavado de estado dejaba los contadores congelados
  -- para siempre aunque después se pagara (R1 de la segunda pasada).
  if v_status not in ('paused', 'suspended', 'ending', 'read_only') then
    return false;
  end if;

  -- RN-FIN-14: la deuda no desaparece al reactivar. Si queda algún cobro
  -- vencido sin saldar, no se reactiva nada.
  if exists (
    select 1 from public.charges c
    where c.establishment_id = p_establishment_id
      and now() > c.due_at
      and not public.charge_is_reservations(c.id)
      and public.charge_outstanding_cents(c.id) > 0
  ) then
    return false;
  end if;

  select max(se.occurred_at) into v_last_reactivation
  from public.state_events se
  where se.entity_type = 'establishment' and se.entity_id = p_establishment_id
    and se.cause = 'nonpayment_reactivation';

  select se.from_state into v_restore
  from public.state_events se
  where se.entity_type = 'establishment' and se.entity_id = p_establishment_id
    and se.cause in ('nonpayment_pause', 'nonpayment_suspension')
    and se.occurred_at > coalesce(v_last_reactivation, '-infinity'::timestamptz)
  order by se.occurred_at asc
  limit 1;

  perform public.release_financial_holds(p_establishment_id);
  perform public.set_establishment_nonpayment_status(
    p_establishment_id, coalesce(v_restore, 'active'), 'nonpayment_reactivation'
  );
  perform public.resume_establishment_counters(p_establishment_id);

  -- El aviso va ANTES del return. En la migración 37 estaba después, que
  -- en PL/pgSQL es código inalcanzable: la reactivación no avisaba nunca.
  perform public.notify_establishment_event(p_establishment_id, 'establishment_reactivated');

  return true;
end;
$function$
;

-- (debt)
CREATE OR REPLACE FUNCTION public.establishment_has_overdue_debt(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.charges c
    where c.establishment_id = p_establishment_id
      and now() > c.due_at
      and not public.charge_is_reservations(c.id)
      and public.charge_outstanding_cents(c.id) > 0
  );
$function$
;

-- (debt_int)
CREATE OR REPLACE FUNCTION public.establishment_has_overdue_debt_internal(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.charges c
    where c.establishment_id = p_establishment_id
      and now() > c.due_at
      and not public.charge_is_reservations(c.id)
      and (select coalesce(sum(fe.amount_cents), 0)
           from public.financial_entries fe where fe.charge_id = c.id) > 0
  );
$function$
;

-- (reminders)
CREATE OR REPLACE FUNCTION public.run_charge_reminders(p_space_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_charge uuid;
  v_avisados integer := 0;
  v_zona text;
begin
  -- La zona se lee de la tabla y NO con `space_timezone()`, que exige ser
  -- miembro del espacio para contestar. Este barrido lo ejecuta la cola,
  -- que no es miembro de ninguno: llamarla desde aquí fallaba con "No
  -- tienes acceso a este espacio" y ningún restaurante habría recibido su
  -- aviso. Es interna y está reservada, así que leer la columna es
  -- exactamente lo que le toca.
  select timezone into v_zona from public.spaces where id = p_space_id;
  if v_zona is null then
    return 0;
  end if;

  for v_charge in
    select c.id
    from public.charges c
    join public.establishments e on e.id = c.establishment_id
    where c.space_id = p_space_id
      -- El día del vencimiento, en la zona del espacio: "hoy vence" para un
      -- restaurante de un espacio en otra zona no es el hoy de Restavor
      -- (CLAUDE.md).
      and (c.due_at at time zone v_zona)::date = (now() at time zone v_zona)::date
      and e.status <> 'archived'
      and not public.charge_is_reservations(c.id)
  loop
    begin
      v_avisados := v_avisados + public.notify_charge_due_today(v_charge);
    exception when others then
      -- CA-18 · un aviso que falla no puede dejar sin avisar a los demás.
      null;
    end;
  end loop;

  return v_avisados;
end;
$function$
;

-- (monthly)
CREATE OR REPLACE FUNCTION public.run_monthly_charges(p_space_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- Reservas tiene su propio ciclo (decisión 91): una baja pedida o un cierre no
      -- emiten mensualidad nueva, y el estado de Restavor web no entra en juego.
      and not exists (
        select 1 from public.reservation_settings rs
        where rs.subscription_id = s.id and rs.service_status in ('ending', 'closed')
      )
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
$function$
;

-- (nonpay)
CREATE OR REPLACE FUNCTION public.establishments_with_nonpayment(p_space_id uuid)
 RETURNS TABLE(establishment_id uuid, establishment_name text, status text, oldest_due_at timestamp with time zone, outstanding_cents bigint, stage text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_capability(p_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para ver el panel financiero de este espacio';
  end if;

  return query
  with vencidos as (
    select c.establishment_id,
           min(c.due_at) as oldest_due_at,
           sum(public.charge_outstanding_cents(c.id)) as outstanding_cents
    from public.charges c
    where c.space_id = p_space_id
      and now() > c.due_at
      and not public.charge_is_reservations(c.id)
      and public.charge_outstanding_cents(c.id) > 0
    group by c.establishment_id
  )
  select e.id, e.name, e.status, v.oldest_due_at, v.outstanding_cents::bigint,
         case
           when extract(epoch from (now() - v.oldest_due_at)) / 3600 >= 72 then 'suspended'
           when extract(epoch from (now() - v.oldest_due_at)) / 3600 >= 24 then 'paused'
           else 'current'
         end
  from vencidos v
  join public.establishments e on e.id = v.establishment_id
  order by v.oldest_due_at asc;
end;
$function$
;

-- (attention)
CREATE OR REPLACE FUNCTION public.my_client_attention()
 RETURNS TABLE(kind text, space_id uuid, space_slug text, establishment_id uuid, establishment_name text, entity_type text, entity_id uuid, title text, due_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Una solicitud que espera su respuesta, o su aceptación.
  select case r.state
           when 'needs_information' then 'request_needs_information'
           else 'request_pending_acceptance'
         end,
         r.space_id,
         public.space_slug(r.space_id),
         r.establishment_id,
         e.name,
         'request',
         r.id,
         r.code,
         null::timestamptz,
         r.created_at
  from public.requests r
  join public.establishments e on e.id = r.establishment_id
  where r.state in ('needs_information', 'pending_client_acceptance')
    and public.is_establishment_client(r.establishment_id)

  union all

  -- Un presupuesto enviado y sin decidir (§84).
  select 'quote_to_decide',
         q.space_id,
         public.space_slug(q.space_id),
         q.establishment_id,
         e.name,
         'quote',
         q.id,
         q.code,
         null::timestamptz,
         coalesce(q.sent_at, q.created_at)
  from public.quotes q
  join public.establishments e on e.id = q.establishment_id
  where q.state = 'sent'
    and public.is_establishment_client(q.establishment_id)

  union all

  -- Un cobro con deuda viva. `charge_outstanding_cents()` exige
  -- visibilidad financiera y lanza si no la hay, así que se pregunta antes:
  -- un cliente sin acceso a facturación no ve cobros aquí, no recibe un
  -- error a mitad de lista.
  select 'charge_to_pay',
         c.space_id,
         public.space_slug(c.space_id),
         c.establishment_id,
         e.name,
         'charge',
         c.id,
         c.concept,
         c.due_at,
         c.created_at
  from public.charges c
  join public.establishments e on e.id = c.establishment_id
  where public.is_establishment_client(c.establishment_id)
    and public.can_read_establishment_finance(c.establishment_id)
    and not public.charge_is_reservations(c.id)
    and public.charge_outstanding_cents(c.id) > 0

  union all

  -- Un menú que todavía no está preparado para su día (RN-MEN).
  select 'menu_to_prepare',
         m.space_id,
         public.space_slug(m.space_id),
         m.establishment_id,
         e.name,
         'menu',
         m.id,
         m.name,
         (m.target_date::timestamp at time zone public.establishment_timezone(m.establishment_id)),
         m.created_at
  from public.menus m
  join public.establishments e on e.id = m.establishment_id
  where m.state in ('draft', 'needs_information')
    and m.target_date >= (now() at time zone public.establishment_timezone(m.establishment_id))::date
    and public.is_establishment_client(m.establishment_id)

  union all

  -- Condiciones nuevas sin aceptar (RN-DAT-07). `subscription_terms()` ya
  -- dice si están pendientes o desactualizadas y comprueba quién pregunta.
  select 'terms_to_accept',
         s.space_id,
         public.space_slug(s.space_id),
         s.establishment_id,
         e.name,
         'subscription',
         s.id,
         t.subject_name,
         null::timestamptz,
         coalesce(t.current_published_at, s.created_at)
  from public.subscriptions s
  join public.establishments e on e.id = s.establishment_id
  cross join lateral public.subscription_terms(s.id) t
  where public.is_establishment_client(s.establishment_id)
    and public.client_can_accept_terms(s.establishment_id)
    and t.status in ('pending', 'outdated')
    and not public.subscription_is_reservations(s.id);
$function$
;

-- Las copias recreadas conservan los privilegios que ya tenían (CREATE OR REPLACE no los toca).
