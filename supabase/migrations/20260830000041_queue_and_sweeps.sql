-- La cola periódica y los barridos. Es lo que el ROADMAP llevaba tres
-- hitos diciendo como salvedad: `generate_monthly_charge()` y
-- `evaluate_establishment_dunning()` existían y funcionaban, pero **no se
-- disparaban solas** — alguien del equipo tenía que llamarlas. RN-FIN-01
-- ("en la fecha de renovación") y RN-FIN-10/11 ("a las +24 h / +72 h")
-- hablan de que ocurra automáticamente, y no ocurría.
--
-- Lo mismo con RN-EST-09 y RN-EST-10 (`ending` -> `read_only` 24 h ->
-- `suspended`), con el cambio de plan programado a renovación (§6.4) y con
-- los avisos de consumo al 80 % y al 100 % del §18.
--
-- Reparto de responsabilidades, que es lo que hace que esto sea
-- comprobable: aquí abajo va todo lo que **es SQL** (los barridos que solo
-- necesitan la base de datos, y las primitivas de la cola). Lo que
-- necesita el reloj laboral —los umbrales de T2 y T3— vive en
-- `src/services/queue-runner.ts`, porque el cálculo de minutos laborables
-- está en `src/core/business-clock.ts` y CLAUDE.md manda que la lógica de
-- dominio no se duplique en SQL.
--
-- Todo lo de este archivo está reservado a `service_role`: lo llama el
-- proceso de la cola, no una persona. Y por eso mismo no puede depender de
-- `has_capability()`, que mira la membresía de quien consulta y el proceso
-- no es miembro de ningún espacio. Se parten en dos las dos funciones que
-- sí comprobaban permiso: la pública sigue comprobándolo y delega en una
-- interna que no lo hace, en vez de duplicar la implementación.

-- ============================================================
-- Las dos internas, sin comprobación de permisos.
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_monthly_charge_internal(p_subscription_id uuid, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_kind text;
  v_plan_name text;
  v_base_cents integer;
  v_tax_rate numeric(5, 2);
  v_tax_cents integer;
  v_cycle_id uuid;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_charge_id uuid;
begin
  select s.space_id, s.establishment_id, s.kind, p.name, p.price_cents
  into v_space_id, v_establishment_id, v_kind, v_plan_name, v_base_cents
  from public.subscriptions s
  left join public.plans p on p.id = s.plan_id
  where s.id = p_subscription_id and s.status = 'active';

  if v_space_id is null then
    raise exception 'Suscripción activa no encontrada';
  end if;

  if v_kind <> 'plan' then
    -- RN-COM-08 fija dos precios para Menú Diario según el establecimiento
    -- tenga o no plan Premium activo, y el esquema todavía no sabe cuál de
    -- los planes es "Premium" (solo tienen nombre). Menú Diario entero es
    -- Fase 2: aquí se para en vez de adivinar el precio.
    raise exception 'La mensualidad de un servicio se implementa con Menú Diario (Fase 2)';
  end if;

  v_cycle_id := public.get_or_create_consumption_cycle(p_subscription_id);
  select cycle_start, cycle_end into v_cycle_start, v_cycle_end
  from public.consumption_cycles where id = v_cycle_id;

  select id into v_charge_id from public.charges
  where subscription_id = p_subscription_id and period_start = v_cycle_start;
  if v_charge_id is not null then
    return v_charge_id; -- RN-DAT-09: emitir dos veces no cobra dos veces.
  end if;

  select tax_rate_percent into v_tax_rate from public.spaces where id = v_space_id;
  v_tax_cents := round(v_base_cents * v_tax_rate / 100)::integer;

  insert into public.charges
    (space_id, establishment_id, subscription_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_by)
  values
    (v_space_id, v_establishment_id, p_subscription_id, v_plan_name, v_cycle_start, v_cycle_end,
     v_base_cents, v_tax_rate, v_tax_cents, v_base_cents + v_tax_cents,
     coalesce(p_due_at, v_cycle_start), auth.uid())
  returning id into v_charge_id;

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    (v_space_id, v_establishment_id, v_charge_id, 'charge', v_base_cents + v_tax_cents,
     'Mensualidad ' || v_plan_name, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'charge.issued', 'charge', v_charge_id,
          jsonb_build_object('establishment_id', v_establishment_id, 'total_cents', v_base_cents + v_tax_cents,
                             'period_start', v_cycle_start));

  return v_charge_id;
end;
$function$

;

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
    and public.charge_outstanding_cents(c.id) > 0;

  if v_oldest_due is null then
    perform public.reactivate_establishment_after_payment(p_establishment_id);
    return 'current';
  end if;

  -- RN-FIN-10/11: horas **naturales**, no laborables. Es la única familia
  -- de plazos de Cuotly que no pasa por el reloj contractual, y el PRD lo
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

revoke all on function public.generate_monthly_charge_internal(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.evaluate_establishment_dunning_internal(uuid)
  from public, anon, authenticated;

comment on function public.generate_monthly_charge_internal(uuid, timestamptz) is
  'Cuerpo de generate_monthly_charge() sin la comprobación de permiso, para
   que la pueda llamar el proceso de la cola, que no es miembro de ningún
   espacio. Interna: la pública comprueba `manage_finance` y delega aquí.';

comment on function public.evaluate_establishment_dunning_internal(uuid) is
  'Cuerpo de evaluate_establishment_dunning() sin la comprobación de
   permiso. Interna, igual que la anterior.';

-- Y las públicas pasan a delegar, para que la implementación sea una sola.
create or replace function public.generate_monthly_charge(
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
begin
  select space_id into v_space_id from public.subscriptions where id = p_subscription_id;
  if v_space_id is null then
    raise exception 'Suscripción activa no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para emitir cobros en este espacio';
  end if;

  return public.generate_monthly_charge_internal(p_subscription_id, p_due_at);
end;
$$;

create or replace function public.evaluate_establishment_dunning(p_establishment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para gestionar el impago de este establecimiento';
  end if;

  return public.evaluate_establishment_dunning_internal(p_establishment_id);
end;
$$;

-- ============================================================
-- RN-FIN-01 · la mensualidad, en la fecha de renovación.
--
-- No se decide aquí qué día toca: el ciclo ya lo sabe
-- (`get_or_create_consumption_cycle()` avanza por aniversario en la zona
-- del espacio) y `generate_monthly_charge_internal()` ya es idempotente
-- por `(subscription_id, period_start)`. El barrido solo pasa por todas
-- las suscripciones activas; si el ciclo no ha cambiado, no cobra nada.
-- ============================================================
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
begin
  for v_sub in
    select s.id from public.subscriptions s
    join public.establishments e on e.id = s.establishment_id
    where s.space_id = p_space_id
      and s.kind = 'plan'
      and s.status = 'active'
      -- A un restaurante archivado no se le sigue pasando la mensualidad.
      -- Suspendido o pausado sí: RN-FIN-14, la deuda no desaparece.
      and e.status <> 'archived'
  loop
    begin
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

-- ============================================================
-- RN-FIN-10 y RN-FIN-11 · el ciclo de impago, a las +24 h y a las +72 h.
-- ============================================================
create or replace function public.run_dunning_sweep(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_est uuid;
  v_afectados integer := 0;
  v_stage text;
begin
  for v_est in
    select e.id from public.establishments e
    where e.space_id = p_space_id and e.status <> 'archived'
  loop
    begin
      v_stage := public.evaluate_establishment_dunning_internal(v_est);
      if v_stage <> 'current' then
        v_afectados := v_afectados + 1;
      end if;
    exception when others then
      null;
    end;
  end loop;

  return v_afectados;
end;
$$;

-- ============================================================
-- RN-EST-09 y RN-EST-10 · el final del servicio por baja, que hasta ahora
-- no lo movía nadie: "al llegar esa fecha pasa a `read_only` durante 24 h
-- y después a `suspended`".
--
-- La fecha de la que habla RN-EST-09 es el final del periodo pagado: el
-- `period_end` del último cobro emitido. Si no hay ninguno, el final del
-- ciclo de consumo en curso. No se inventa ningún otro plazo.
--
-- Aprovecha el mismo barrido el cambio de plan programado a renovación
-- (§6.4), que tenía el mismo problema: existía y no se disparaba solo.
-- ============================================================
create or replace function public.run_lifecycle_sweep(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_est record;
  v_movidos integer := 0;
  v_fin timestamptz;
  v_desde timestamptz;
  v_sub uuid;
begin
  for v_est in
    select e.id, e.status from public.establishments e
    where e.space_id = p_space_id and e.status in ('ending', 'read_only')
  loop
    if v_est.status = 'ending' then
      select max(c.period_end) into v_fin
      from public.charges c where c.establishment_id = v_est.id;

      if v_fin is null then
        select max(cc.cycle_end) into v_fin
        from public.consumption_cycles cc where cc.establishment_id = v_est.id;
      end if;

      if v_fin is not null and now() >= v_fin then
        perform public.set_establishment_nonpayment_status(v_est.id, 'read_only', 'service_ending');
        v_movidos := v_movidos + 1;
      end if;

    else
      -- RN-EST-10: 24 h en solo lectura, contadas desde el evento que lo
      -- dejó ahí. Horas naturales, como el ciclo de impago.
      select max(se.occurred_at) into v_desde
      from public.state_events se
      where se.entity_type = 'establishment' and se.entity_id = v_est.id
        and se.to_state = 'read_only';

      if v_desde is not null and now() >= v_desde + interval '24 hours' then
        perform public.set_establishment_nonpayment_status(v_est.id, 'suspended', 'service_ended');
        v_movidos := v_movidos + 1;
      end if;
    end if;
  end loop;

  -- §6.4: el cambio de plan programado, cuando llega la renovación.
  for v_sub in
    select spc.subscription_id from public.scheduled_plan_changes spc
    where spc.space_id = p_space_id and spc.state = 'pending' and spc.effective_at <= now()
  loop
    begin
      if public.apply_scheduled_plan_change_internal(v_sub) then
        v_movidos := v_movidos + 1;
      end if;
    exception when others then
      null;
    end;
  end loop;

  return v_movidos;
end;
$$;

-- El cambio programado también necesita su interna: `has_capability()` no
-- sirve para un proceso que no es miembro de ningún espacio.
create or replace function public.apply_scheduled_plan_change_internal(p_subscription_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change public.scheduled_plan_changes;
begin
  select * into v_change from public.scheduled_plan_changes
  where subscription_id = p_subscription_id and state = 'pending'
  for update;

  if v_change.id is null or now() < v_change.effective_at then
    return false;
  end if;

  update public.subscriptions set plan_id = v_change.to_plan_id where id = p_subscription_id;

  update public.scheduled_plan_changes
  set state = 'applied', applied_at = now()
  where id = v_change.id;

  perform public.get_or_create_consumption_cycle_internal(p_subscription_id);

  insert into public.plan_commitments
    (space_id, establishment_id, subscription_id, plan_id, started_at, ends_at, cause, created_by)
  values
    (v_change.space_id, v_change.establishment_id, p_subscription_id, v_change.to_plan_id,
     now(), now() + interval '3 months', 'plan_change', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_change.space_id, null, 'subscription.plan_changed', 'subscription', p_subscription_id,
    jsonb_build_object('plan_id', v_change.from_plan_id),
    jsonb_build_object('plan_id', v_change.to_plan_id, 'kind', 'renewal_' || v_change.direction,
                       'by', 'queue', 'idempotency_key', 'scheduled:' || v_change.id::text)
  );

  return true;
end;
$$;

-- El ciclo de consumo, igual: la pública comprueba acceso, la interna no.
CREATE OR REPLACE FUNCTION public.get_or_create_consumption_cycle_internal(p_subscription_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_establishment_id uuid;
  v_space_id uuid;
  v_started_at timestamptz;
  v_timezone text;
  v_included_small integer;
  v_included_photo integer;
  v_included_medium integer;
  v_included_large integer;
  v_local_start timestamp;
  v_local_now timestamp;
  v_k integer := 0;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_cycle_id uuid;
begin
  select s.establishment_id, s.space_id, s.started_at,
         p.included_small, p.included_photo, p.included_medium, p.included_large
  into v_establishment_id, v_space_id, v_started_at,
       v_included_small, v_included_photo, v_included_medium, v_included_large
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.id = p_subscription_id and s.kind = 'plan';

  if v_establishment_id is null then
    raise exception 'Suscripción de plan no encontrada';
  end if;

  select timezone into v_timezone from public.spaces where id = v_space_id;

  v_local_start := v_started_at at time zone v_timezone;
  v_local_now := now() at time zone v_timezone;

  while (v_local_start + ((v_k + 1) || ' months')::interval) <= v_local_now loop
    v_k := v_k + 1;
  end loop;

  v_cycle_start := (v_local_start + (v_k || ' months')::interval) at time zone v_timezone;
  v_cycle_end := (v_local_start + ((v_k + 1) || ' months')::interval) at time zone v_timezone;

  insert into public.consumption_cycles
    (space_id, establishment_id, subscription_id, cycle_start, cycle_end, included_small, included_photo, included_medium, included_large)
  values
    (v_space_id, v_establishment_id, p_subscription_id, v_cycle_start, v_cycle_end, v_included_small, v_included_photo, v_included_medium, v_included_large)
  on conflict (subscription_id, cycle_start)
  do update set cycle_start = excluded.cycle_start
  returning id into v_cycle_id;

  return v_cycle_id;
end;
$function$

;

revoke all on function public.get_or_create_consumption_cycle_internal(uuid)
  from public, anon, authenticated;

create or replace function public.get_or_create_consumption_cycle(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
begin
  select s.space_id, s.establishment_id into v_space_id, v_establishment_id
  from public.subscriptions s where s.id = p_subscription_id and s.kind = 'plan';

  if v_space_id is null then
    raise exception 'Suscripción de plan no encontrada';
  end if;

  if not (public.is_space_member(v_space_id) or public.can_write_establishment(v_establishment_id)) then
    raise exception 'No tienes acceso a este establecimiento';
  end if;

  return public.get_or_create_consumption_cycle_internal(p_subscription_id);
end;
$$;

-- ============================================================
-- §18 · "Consumo de bolsa | Avisos al 80 % y 100 %". Era una de las dos
-- filas que seguían sin emitir.
--
-- El porcentaje es consumido sobre incluido, y solo cuenta para las
-- categorías que el plan incluye: en Básico, que no incluye ninguna, no
-- hay bolsa que agotar y no se avisa de nada (RN-COM-01).
--
-- Destinatarios: la fila del §18 no los nombra —su segunda columna
-- describe los umbrales, no a quién— así que no me los invento por mi
-- cuenta: se aplica lo que sí está escrito. La bolsa es del cliente, así
-- que se le avisa a él (audiencia `client`), y RN-NOT-02 dice que "los
-- propietarios reciben todo por defecto", así que también al propietario y
-- a los administradores. Queda anotado en el ROADMAP por si Bosco lo
-- quiere de otra manera.
--
-- La clave de deduplicación lleva el ciclo dentro: el aviso se vuelve a
-- armar solo cuando la bolsa se renueva (RN-COM-06).
-- ============================================================
create or replace function public.run_consumption_thresholds(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila record;
  v_recipient uuid;
  v_slug text;
  v_umbral integer;
  v_emitidos integer := 0;
begin
  v_slug := public.space_slug(p_space_id);

  for v_fila in
    with ciclo as (
      select cc.id, cc.establishment_id, cc.included_small, cc.included_photo,
             cc.included_medium, cc.included_large
      from public.consumption_cycles cc
      join public.subscriptions s on s.id = cc.subscription_id
      join public.establishments e on e.id = cc.establishment_id
      where cc.space_id = p_space_id
        and s.kind = 'plan' and s.status = 'active'
        and e.status not in ('archived', 'suspended')
        and now() >= cc.cycle_start and now() < cc.cycle_end
    ),
    incluido as (
      select id, establishment_id, 'small' as category, included_small as included from ciclo
      union all select id, establishment_id, 'photo', included_photo from ciclo
      union all select id, establishment_id, 'medium', included_medium from ciclo
      union all select id, establishment_id, 'large', included_large from ciclo
    )
    select
      i.id as cycle_id,
      i.establishment_id,
      i.category,
      i.included,
      -- Consumido = lo que han restado los débitos, neteado con las
      -- devoluciones y los créditos. Sale del libro, no de un contador.
      greatest(0, i.included - (i.included + coalesce((
        select sum(ce.amount) from public.consumption_entries ce
        where ce.consumption_cycle_id = i.id and ce.category = i.category
      ), 0)))::integer as consumido
    from incluido i
    where i.included > 0
  loop
    v_umbral := case
      when v_fila.consumido >= v_fila.included then 100
      when v_fila.consumido * 100 >= v_fila.included * 80 then 80
      else null
    end;

    if v_umbral is null then
      continue;
    end if;

    for v_recipient in
      select em.user_id from public.establishment_memberships em
      where em.establishment_id = v_fila.establishment_id and em.revoked_at is null
    loop
      if public.emit_notification(
           p_space_id, v_recipient,
           ('consumption_threshold_' || v_umbral)::text, 'client', 'establishment',
           v_fila.establishment_id,
           '/espacios/' || v_slug || '/restaurantes/' || v_fila.establishment_id::text,
           'consumption_threshold_' || v_umbral || ':' || v_fila.cycle_id::text || ':' || v_fila.category,
           v_fila.establishment_id, v_umbral) is not null then
        v_emitidos := v_emitidos + 1;
      end if;
    end loop;

    for v_recipient in
      select sm.user_id from public.space_memberships sm
      where sm.space_id = p_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
    loop
      if public.emit_notification(
           p_space_id, v_recipient,
           ('consumption_threshold_' || v_umbral)::text, 'staff', 'establishment',
           v_fila.establishment_id,
           '/espacios/' || v_slug || '/restaurantes/' || v_fila.establishment_id::text,
           'consumption_threshold_' || v_umbral || ':' || v_fila.cycle_id::text || ':' || v_fila.category || ':staff',
           v_fila.establishment_id, v_umbral) is not null then
        v_emitidos := v_emitidos + 1;
      end if;
    end loop;
  end loop;

  return v_emitidos;
end;
$$;

-- ============================================================
-- Las primitivas de la cola. `for update skip locked` para que dos
-- procesos a la vez no cojan el mismo trabajo — que es exactamente el
-- fallo que los dos scripts de concurrencia del repositorio existen para
-- cazar en otras operaciones.
-- ============================================================
alter table public.scheduled_jobs drop constraint scheduled_jobs_kind_check;
alter table public.scheduled_jobs add constraint scheduled_jobs_kind_check
  check (kind in ('monthly_charges', 'dunning_sweep', 'sla_sweep', 'lifecycle_sweep', 'consumption_sweep'));

create or replace function public.enqueue_scheduled_job(
  p_space_id uuid,
  p_kind text,
  p_run_after timestamptz default now(),
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_key text;
begin
  -- Sin clave explícita, una por espacio, tipo y minuto: encolar dos veces
  -- el mismo barrido en el mismo minuto no lo ejecuta dos veces.
  v_key := coalesce(p_dedupe_key,
    p_kind || ':' || p_space_id::text || ':' || to_char(p_run_after at time zone 'UTC', 'YYYYMMDDHH24MI'));

  insert into public.scheduled_jobs (space_id, kind, run_after, dedupe_key)
  values (p_space_id, p_kind, p_run_after, v_key)
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.claim_scheduled_jobs(p_limit integer default 10)
returns table (id uuid, space_id uuid, kind text, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with tomados as (
    select sj.id from public.scheduled_jobs sj
    where sj.status = 'pending' and sj.run_after <= now()
    order by sj.run_after
    limit p_limit
    for update skip locked
  )
  update public.scheduled_jobs sj
  set status = 'running', attempts = sj.attempts + 1
  from tomados t
  where sj.id = t.id
  returning sj.id, sj.space_id, sj.kind, sj.attempts;
end;
$$;

create or replace function public.finish_scheduled_job(
  p_job_id uuid,
  p_ok boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.scheduled_jobs
  set status = case when p_ok then 'done' else 'failed' end,
      last_error = p_error,
      finished_at = now()
  where id = p_job_id;
end;
$$;

-- El despachador: un solo sitio que sabe qué hace cada tipo. Así el
-- proceso de la cola no tiene que saberlo, y añadir un barrido nuevo no
-- toca el proceso.
create or replace function public.run_scheduled_job(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_space uuid;
  v_hechos integer := 0;
begin
  select kind, space_id into v_kind, v_space
  from public.scheduled_jobs where id = p_job_id;

  if v_kind is null then
    raise exception 'Trabajo de cola no encontrado';
  end if;

  if v_kind = 'monthly_charges' then
    v_hechos := public.run_monthly_charges(v_space);
  elsif v_kind = 'dunning_sweep' then
    v_hechos := public.run_dunning_sweep(v_space);
  elsif v_kind = 'lifecycle_sweep' then
    v_hechos := public.run_lifecycle_sweep(v_space);
  elsif v_kind = 'consumption_sweep' then
    v_hechos := public.run_consumption_thresholds(v_space);
  elsif v_kind = 'sla_sweep' then
    -- Los umbrales de T2 y T3 necesitan el reloj laboral, que vive en
    -- src/core/business-clock.ts. Los calcula el proceso de la cola y
    -- vuelve por emit_sla_notification(); aquí no se duplica.
    raise exception 'El barrido de plazos lo ejecuta src/services/queue-runner.ts, no SQL';
  else
    raise exception 'Tipo de trabajo de cola desconocido: %', v_kind;
  end if;

  perform public.finish_scheduled_job(p_job_id, true, null);
  return v_hechos;
end;
$$;

-- ============================================================
-- La cola de envío de correo. RN-NOT-05: "los envíos van por cola con
-- reintentos e idempotencia". La espera creciente y el techo de intentos
-- son los de src/core/notifications.ts, que es donde están sus tests:
-- 2^(intentos-1) minutos con techo de 60, y `dead` a los 5 intentos.
-- ============================================================
create or replace function public.claim_notification_deliveries(p_limit integer default 20)
returns table (
  delivery_id uuid,
  notification_id uuid,
  attempts integer,
  recipient_email text,
  event_type text,
  audience text,
  deep_link text,
  space_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with tomados as (
    select d.id from public.notification_deliveries d
    where d.status = 'pending' and d.next_attempt_at <= now()
    order by d.next_attempt_at
    limit p_limit
    for update skip locked
  ),
  marcados as (
    update public.notification_deliveries d
    set attempts = d.attempts + 1
    from tomados t
    where d.id = t.id
    returning d.id, d.notification_id, d.attempts
  )
  select m.id, m.notification_id, m.attempts,
         p.email, n.event_type, n.audience, n.deep_link, s.name
  from marcados m
  join public.notifications n on n.id = m.notification_id
  join public.profiles p on p.id = n.recipient_id
  join public.spaces s on s.id = n.space_id;
end;
$$;

create or replace function public.mark_delivery_sent(
  p_delivery_id uuid,
  p_provider_message_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_deliveries
  set status = 'sent', sent_at = now(), last_error = null,
      provider_message_id = p_provider_message_id
  where id = p_delivery_id;
end;
$$;

create or replace function public.mark_delivery_failed(
  p_delivery_id uuid,
  p_error text,
  p_next_attempt_at timestamptz,
  p_dead boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_deliveries
  set status = case when p_dead then 'dead' else 'pending' end,
      last_error = p_error,
      next_attempt_at = p_next_attempt_at
  where id = p_delivery_id;
end;
$$;

-- ============================================================
-- Lo que el proceso de la cola necesita para los umbrales de T2 y T3: los
-- contadores abiertos con sus eventos, el calendario del espacio y el
-- plazo que les toca. El cálculo lo hace él con src/core.
-- ============================================================
create or replace function public.sla_sweep_counters(p_space_id uuid)
returns table (
  entity_type text,
  entity_id uuid,
  job_id uuid,
  counter_kind text,
  category text,
  start_sla_hours integer,
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
           r.accepted_start_sla_hours, p.start_sla_hours, sp.timezone;
$$;

create or replace function public.emit_sla_notification(
  p_job_id uuid,
  p_event_type text,
  p_threshold_percent integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.notify_job_event(p_job_id, p_event_type, p_threshold_percent);
end;
$$;

-- ============================================================
-- Todo esto es del proceso de la cola, no de una persona: ni `anon` ni
-- `authenticated` lo pueden llamar por RPC. CLAUDE.md: revocar solo a
-- PUBLIC no cierra nada en Supabase.
-- ============================================================
revoke all on function public.apply_scheduled_plan_change_internal(uuid) from public, anon, authenticated;
revoke all on function public.run_monthly_charges(uuid) from public, anon, authenticated;
revoke all on function public.run_dunning_sweep(uuid) from public, anon, authenticated;
revoke all on function public.run_lifecycle_sweep(uuid) from public, anon, authenticated;
revoke all on function public.run_consumption_thresholds(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_scheduled_job(uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.claim_scheduled_jobs(integer) from public, anon, authenticated;
revoke all on function public.finish_scheduled_job(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.run_scheduled_job(uuid) from public, anon, authenticated;
revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
revoke all on function public.mark_delivery_sent(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_delivery_failed(uuid, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.sla_sweep_counters(uuid) from public, anon, authenticated;
revoke all on function public.emit_sla_notification(uuid, text, integer) from public, anon, authenticated;
