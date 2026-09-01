-- §6.4 del PRD · cambio de plan (RN-COM-05, RN-COM-15 a RN-COM-18).
--
-- La tercera pasada de la revisión lo encontró sin dueño: la migración 20
-- lo declaró fuera del alcance del Hito 5 ("ni el ROADMAP ni ningún CA de
-- este hito lo exige") y ningún hito posterior lo recogió, ni figuraba
-- como salvedad. Es un requisito de Fase 1 y el PRD lo da cerrado, fórmula
-- de prorrateo incluida, así que aquí no se inventa nada.
--
-- Lo que este archivo NO hace, y se dice en el ROADMAP en vez de fingirlo:
-- disparar solo el cambio programado en la fecha de renovación. Como
-- `generate_monthly_charge()` y `evaluate_establishment_dunning()`, hay que
-- llamarlo; la cola que lo dispare sigue sin existir.

-- ============================================================
-- La permanencia, que tampoco existía en el esquema. RN-COM-04
-- ("permanencia mínima inicial de 3 meses") y RN-COM-05 ("un cambio
-- voluntario de plan inicia una nueva permanencia de 3 meses") hablan de
-- ella y no había dónde guardarla, así que RN-COM-17 —"reducción solo tras
-- cumplir la permanencia vigente"— no se podía ni comprobar.
--
-- Libro inmutable, como manda CLAUDE.md: una fila por permanencia, nunca
-- un UPDATE. La vigente es la de `started_at` más reciente.
-- ============================================================
create table public.plan_commitments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id),
  plan_id uuid not null references public.plans(id),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  cause text not null check (cause in ('initial', 'plan_change')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > started_at)
);

create index plan_commitments_subscription_idx
  on public.plan_commitments (subscription_id, started_at desc);

alter table public.plan_commitments enable row level security;

create policy plan_commitments_select on public.plan_commitments
  for select using (
    public.is_space_member(space_id) or public.client_can_view_billing(establishment_id)
  );

-- Sin política de INSERT ni UPDATE ni DELETE: solo escriben las funciones
-- de abajo, que son SECURITY DEFINER y comprueban permisos.

comment on table public.plan_commitments is
  'RN-COM-04 y RN-COM-05: permanencia de 3 meses, inicial y tras cada
   cambio voluntario de plan. Libro inmutable: la vigente es la fila con
   `started_at` más reciente, nunca se actualiza una existente.';

-- ============================================================
-- El cambio programado a renovación (RN-COM-16 y RN-COM-17). Una fila
-- pendiente por suscripción como mucho.
-- ============================================================
create table public.scheduled_plan_changes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id),
  from_plan_id uuid not null references public.plans(id),
  to_plan_id uuid not null references public.plans(id),
  direction text not null check (direction in ('upgrade', 'downgrade')),
  effective_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'applied', 'cancelled')),
  requested_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create unique index scheduled_plan_changes_one_pending_idx
  on public.scheduled_plan_changes (subscription_id)
  where state = 'pending';

alter table public.scheduled_plan_changes enable row level security;

create policy scheduled_plan_changes_select on public.scheduled_plan_changes
  for select using (
    public.is_space_member(space_id) or public.client_can_view_billing(establishment_id)
  );

comment on table public.scheduled_plan_changes is
  'RN-COM-16 (mejora en renovación) y RN-COM-17 (reducción, solo en
   renovación y tras cumplir la permanencia). No se dispara sola: hay que
   llamar a apply_scheduled_plan_change(), como con generate_monthly_charge().';

-- ============================================================
-- RN-COM-15/17: "el nuevo plazo de inicio se aplica solo a solicitudes
-- posteriores al cambio" y "los trabajos ya aceptados conservan las
-- condiciones con las que se aceptaron".
--
-- Hoy el plazo de inicio se leía del plan vigente en el momento de mirar,
-- así que un cambio de plan reescribía hacia atrás el plazo de todo lo ya
-- aceptado. Se congela en la solicitud al aceptarla, que es cuando arranca
-- T2.
-- ============================================================
alter table public.requests
  add column accepted_start_sla_hours integer check (accepted_start_sla_hours > 0);

comment on column public.requests.accepted_start_sla_hours is
  'RN-COM-15 y RN-COM-17: el plazo de inicio con el que se aceptó esta
   solicitud. Congelado al aceptar: un cambio de plan posterior no
   reescribe las condiciones de lo ya aceptado.';

-- ============================================================
-- RN-COM-18 · la fórmula, tal cual la da el PRD:
--
--   fracción_restante = minutos_naturales_restantes / minutos_totales
--   importe_diferencia = redondear2((precio_nuevo - precio_antiguo) * fracción)
--   unidades_extra(cat) = techo((incluidas_nuevo - incluidas_antiguo) * fracción)
--
-- Si `unidades_extra` sale negativo se trata como 0: una mejora nunca
-- quita consumos.
-- ============================================================
create or replace function public.plan_change_proration(
  p_subscription_id uuid,
  p_new_plan_id uuid
)
returns table (
  fraction numeric,
  difference_cents integer,
  extra_small integer,
  extra_photo integer,
  extra_medium integer,
  extra_large integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_old public.plans;
  v_new public.plans;
  v_fraction numeric;
begin
  select cc.cycle_start, cc.cycle_end into v_cycle_start, v_cycle_end
  from public.consumption_cycles cc
  where cc.subscription_id = p_subscription_id
  order by cc.cycle_start desc
  limit 1;

  if v_cycle_start is null then
    raise exception 'La suscripción no tiene ciclo de consumo abierto';
  end if;

  select p.* into v_old from public.plans p
  join public.subscriptions s on s.plan_id = p.id
  where s.id = p_subscription_id;

  select p.* into v_new from public.plans p where p.id = p_new_plan_id;

  if v_old.id is null or v_new.id is null then
    raise exception 'Plan no encontrado';
  end if;

  -- Minutos NATURALES, como dice el PRD: no es el reloj laboral.
  v_fraction := greatest(0, least(1,
    extract(epoch from (v_cycle_end - greatest(now(), v_cycle_start)))
    / nullif(extract(epoch from (v_cycle_end - v_cycle_start)), 0)
  ));

  fraction := v_fraction;
  difference_cents := round((v_new.price_cents - v_old.price_cents) * v_fraction, 0)::integer;
  extra_small  := greatest(0, ceil((v_new.included_small  - v_old.included_small)  * v_fraction)::integer);
  extra_photo  := greatest(0, ceil((v_new.included_photo  - v_old.included_photo)  * v_fraction)::integer);
  extra_medium := greatest(0, ceil((v_new.included_medium - v_old.included_medium) * v_fraction)::integer);
  extra_large  := greatest(0, ceil((v_new.included_large  - v_old.included_large)  * v_fraction)::integer);
  return next;
end;
$$;

comment on function public.plan_change_proration(uuid, uuid) is
  'RN-COM-18. `difference_cents` va en céntimos, que es "redondeada a 2
   decimales" en la moneda con la que trabaja todo el esquema. Interna: no
   comprueba permisos, la llaman funciones que sí lo hacen.';

revoke all on function public.plan_change_proration(uuid, uuid)
  from public, anon, authenticated;

-- ============================================================
-- RN-COM-15 · mejora inmediata.
-- ============================================================
create or replace function public.change_plan_immediately(
  p_subscription_id uuid,
  p_new_plan_id uuid,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_old_plan_id uuid;
  v_old_price integer;
  v_new_price integer;
  v_new_space uuid;
  v_cycle_id uuid;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_pro record;
  v_tax_rate numeric(5,2);
  v_tax_cents integer;
  v_charge_id uuid;
  v_new_name text;
  v_key text;
begin
  select s.space_id, s.establishment_id, s.plan_id, p.price_cents
  into v_space_id, v_establishment_id, v_old_plan_id, v_old_price
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.id = p_subscription_id and s.kind = 'plan' and s.status = 'active'
  for update;

  if v_space_id is null then
    raise exception 'Suscripción de plan activa no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden cambiar el plan de un restaurante';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  select space_id, price_cents, name into v_new_space, v_new_price, v_new_name
  from public.plans where id = p_new_plan_id;

  if v_new_space is null or v_new_space <> v_space_id then
    raise exception 'El plan no pertenece al mismo espacio que el establecimiento';
  end if;

  if p_new_plan_id = v_old_plan_id then
    return null; -- CA-17: cambiar al mismo plan no hace nada.
  end if;

  -- RN-COM-17: la reducción es solo en renovación. Aquí no cabe.
  if v_new_price <= v_old_price then
    raise exception 'Una reducción de plan solo se aplica en la renovación y tras cumplir la permanencia (RN-COM-17)';
  end if;

  v_key := coalesce(p_idempotency_key, 'plan_change:' || p_subscription_id::text || ':' || p_new_plan_id::text);

  -- RN-DAT-09 / CA-17: pulsar dos veces no cobra dos veces ni regala dos
  -- bolsas. La marca la lleva la auditoría, que ya es un libro inmutable.
  if exists (
    select 1 from public.audit_log
    where action = 'subscription.plan_changed'
      and entity_id = p_subscription_id
      and new_value ->> 'idempotency_key' = v_key
  ) then
    return null;
  end if;

  v_cycle_id := public.get_or_create_consumption_cycle(p_subscription_id);
  select cycle_start, cycle_end into v_cycle_start, v_cycle_end
  from public.consumption_cycles where id = v_cycle_id;

  select * into v_pro from public.plan_change_proration(p_subscription_id, p_new_plan_id);

  update public.subscriptions set plan_id = p_new_plan_id where id = p_subscription_id;

  -- "Se añaden consumos adicionales proporcionales al periodo restante,
  -- redondeando al alza (a favor del cliente). No se duplica lo ya
  -- utilizado": por eso son apuntes NUEVOS sobre el ciclo en curso y no un
  -- recálculo de la bolsa. El libro es de apuntes con signo (CLAUDE.md).
  if v_pro.extra_small > 0 then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason, created_by)
    values (v_space_id, v_establishment_id, v_cycle_id, 'small', v_pro.extra_small,
            'compensatory_credit', 'Mejora de plan (RN-COM-15)', auth.uid());
  end if;
  if v_pro.extra_photo > 0 then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason, created_by)
    values (v_space_id, v_establishment_id, v_cycle_id, 'photo', v_pro.extra_photo,
            'compensatory_credit', 'Mejora de plan (RN-COM-15)', auth.uid());
  end if;
  if v_pro.extra_medium > 0 then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason, created_by)
    values (v_space_id, v_establishment_id, v_cycle_id, 'medium', v_pro.extra_medium,
            'compensatory_credit', 'Mejora de plan (RN-COM-15)', auth.uid());
  end if;
  if v_pro.extra_large > 0 then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason, created_by)
    values (v_space_id, v_establishment_id, v_cycle_id, 'large', v_pro.extra_large,
            'compensatory_credit', 'Mejora de plan (RN-COM-15)', auth.uid());
  end if;

  -- "Se cobra la diferencia económica proporcional al periodo restante."
  if v_pro.difference_cents > 0 then
    select tax_rate_percent into v_tax_rate from public.spaces where id = v_space_id;
    v_tax_cents := round(v_pro.difference_cents * v_tax_rate / 100)::integer;

    insert into public.charges
      (space_id, establishment_id, subscription_id, concept, period_start, period_end,
       base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_by)
    values
      (v_space_id, v_establishment_id, p_subscription_id,
       'Mejora a ' || v_new_name || ' (parte proporcional)', now(), v_cycle_end,
       v_pro.difference_cents, v_tax_rate, v_tax_cents, v_pro.difference_cents + v_tax_cents,
       v_cycle_end, auth.uid())
    returning id into v_charge_id;
  end if;

  -- RN-COM-05: nueva permanencia de 3 meses.
  insert into public.plan_commitments
    (space_id, establishment_id, subscription_id, plan_id, started_at, ends_at, cause, created_by)
  values
    (v_space_id, v_establishment_id, p_subscription_id, p_new_plan_id,
     now(), now() + interval '3 months', 'plan_change', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'subscription.plan_changed', 'subscription', p_subscription_id,
    jsonb_build_object('plan_id', v_old_plan_id, 'price_cents', v_old_price),
    jsonb_build_object(
      'plan_id', p_new_plan_id, 'price_cents', v_new_price, 'kind', 'immediate_upgrade',
      'fraction', v_pro.fraction, 'difference_cents', v_pro.difference_cents,
      'charge_id', v_charge_id, 'idempotency_key', v_key)
  );

  return v_charge_id;
end;
$$;

comment on function public.change_plan_immediately(uuid, uuid, text) is
  'RN-COM-15 (mejora inmediata) + RN-COM-05 (nueva permanencia de 3 meses)
   + RN-COM-18 (prorrateo). La reducción no cabe aquí: RN-COM-17 la reserva
   a la renovación.';

-- ============================================================
-- RN-COM-16 y RN-COM-17 · el cambio que espera a la renovación.
-- ============================================================
create or replace function public.schedule_plan_change(
  p_subscription_id uuid,
  p_new_plan_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_old_plan_id uuid;
  v_old_price integer;
  v_new_price integer;
  v_new_space uuid;
  v_cycle_id uuid;
  v_cycle_end timestamptz;
  v_commitment_ends timestamptz;
  v_direction text;
  v_id uuid;
begin
  select s.space_id, s.establishment_id, s.plan_id, p.price_cents
  into v_space_id, v_establishment_id, v_old_plan_id, v_old_price
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.id = p_subscription_id and s.kind = 'plan' and s.status = 'active'
  for update;

  if v_space_id is null then
    raise exception 'Suscripción de plan activa no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden cambiar el plan de un restaurante';
  end if;

  select space_id, price_cents into v_new_space, v_new_price
  from public.plans where id = p_new_plan_id;

  if v_new_space is null or v_new_space <> v_space_id then
    raise exception 'El plan no pertenece al mismo espacio que el establecimiento';
  end if;

  if p_new_plan_id = v_old_plan_id then
    raise exception 'Ese ya es el plan del establecimiento';
  end if;

  v_direction := case when v_new_price > v_old_price then 'upgrade' else 'downgrade' end;

  v_cycle_id := public.get_or_create_consumption_cycle(p_subscription_id);
  select cycle_end into v_cycle_end from public.consumption_cycles where id = v_cycle_id;

  -- RN-COM-17: la reducción, además, solo tras cumplir la permanencia
  -- vigente. Es la razón por la que existe `plan_commitments`.
  if v_direction = 'downgrade' then
    select ends_at into v_commitment_ends
    from public.plan_commitments
    where subscription_id = p_subscription_id
    order by started_at desc
    limit 1;

    if v_commitment_ends is not null and v_cycle_end < v_commitment_ends then
      raise exception 'La permanencia vigente no se ha cumplido: la reducción no se puede programar todavía (RN-COM-17)';
    end if;
  end if;

  insert into public.scheduled_plan_changes
    (space_id, establishment_id, subscription_id, from_plan_id, to_plan_id, direction, effective_at, requested_by)
  values
    (v_space_id, v_establishment_id, p_subscription_id, v_old_plan_id, p_new_plan_id,
     v_direction, v_cycle_end, auth.uid())
  on conflict (subscription_id) where state = 'pending' do nothing
  returning id into v_id;

  if v_id is null then
    -- CA-17: ya había uno pendiente. Se devuelve el que hay en vez de
    -- apilar dos cambios contradictorios.
    select id into v_id from public.scheduled_plan_changes
    where subscription_id = p_subscription_id and state = 'pending';
    return v_id;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'subscription.plan_change_scheduled', 'subscription', p_subscription_id,
    jsonb_build_object('plan_id', v_old_plan_id),
    jsonb_build_object('plan_id', p_new_plan_id, 'direction', v_direction, 'effective_at', v_cycle_end)
  );

  return v_id;
end;
$$;

comment on function public.schedule_plan_change(uuid, uuid) is
  'RN-COM-16 (mejora en renovación) y RN-COM-17 (reducción: solo en
   renovación y tras cumplir la permanencia vigente).';

create or replace function public.apply_scheduled_plan_change(p_subscription_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change public.scheduled_plan_changes;
  v_space_id uuid;
begin
  select * into v_change from public.scheduled_plan_changes
  where subscription_id = p_subscription_id and state = 'pending'
  for update;

  if v_change.id is null then
    return false;
  end if;

  v_space_id := v_change.space_id;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden aplicar un cambio de plan';
  end if;

  if now() < v_change.effective_at then
    return false; -- Todavía no toca: el cambio es en la renovación.
  end if;

  update public.subscriptions set plan_id = v_change.to_plan_id where id = p_subscription_id;

  update public.scheduled_plan_changes
  set state = 'applied', applied_at = now()
  where id = v_change.id;

  -- RN-COM-16 y RN-COM-17: bolsa completa del plan nuevo en la fecha de
  -- renovación, y los consumos sobrantes desaparecen. Las dos cosas salen
  -- solas del ciclo: el siguiente se crea con los `included_*` del plan
  -- que la suscripción tenga en ese momento, y los ciclos no se acumulan
  -- (RN-COM-06).
  perform public.get_or_create_consumption_cycle(p_subscription_id);

  -- RN-COM-05: nueva permanencia de 3 meses, también en la renovación.
  insert into public.plan_commitments
    (space_id, establishment_id, subscription_id, plan_id, started_at, ends_at, cause, created_by)
  values
    (v_space_id, v_change.establishment_id, p_subscription_id, v_change.to_plan_id,
     now(), now() + interval '3 months', 'plan_change', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'subscription.plan_changed', 'subscription', p_subscription_id,
    jsonb_build_object('plan_id', v_change.from_plan_id),
    jsonb_build_object('plan_id', v_change.to_plan_id, 'kind', 'renewal_' || v_change.direction,
                       'idempotency_key', 'scheduled:' || v_change.id::text)
  );

  return true;
end;
$$;

comment on function public.apply_scheduled_plan_change(uuid) is
  'Aplica el cambio programado cuando llega la renovación. NO se dispara
   solo: como generate_monthly_charge(), hay que llamarlo. La cola que lo
   haga sigue sin existir y está dicho en el ROADMAP.';

-- ============================================================
-- RN-COM-04 · la permanencia inicial, que tampoco se creaba.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_plan_subscription(p_establishment_id uuid, p_plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_plan_space_id uuid;
  v_subscription_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para asignar un plan a este establecimiento';
  end if;

  select space_id into v_plan_space_id from public.plans where id = p_plan_id;
  if v_plan_space_id is null or v_plan_space_id <> v_space_id then
    raise exception 'El plan no pertenece al mismo espacio que el establecimiento';
  end if;

  insert into public.subscriptions (space_id, establishment_id, kind, plan_id, created_by)
  values (v_space_id, p_establishment_id, 'plan', p_plan_id, auth.uid())
  returning id into v_subscription_id;

  -- RN-COM-04: "permanencia mínima inicial de 3 meses".
  insert into public.plan_commitments
    (space_id, establishment_id, subscription_id, plan_id, started_at, ends_at, cause, created_by)
  values
    (v_space_id, p_establishment_id, v_subscription_id, p_plan_id,
     now(), now() + interval '3 months', 'initial', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'subscription.plan_created', 'subscription', v_subscription_id, jsonb_build_object('establishment_id', p_establishment_id, 'plan_id', p_plan_id));

  return v_subscription_id;
end;
$function$;

-- ============================================================
-- RN-COM-15 / RN-COM-17 · congelar el plazo de inicio al aceptar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- RN-COM-15 y RN-COM-17: el plazo de inicio se congela AQUÍ, al aceptar,
  -- que es cuando arranca T2. Antes se leía del plan vigente en el momento
  -- de mirar, así que un cambio de plan reescribía hacia atrás el plazo de
  -- todo lo ya aceptado — justo lo que las dos reglas prohíben.
  update public.requests r
  set accepted_start_sla_hours = (
    select p.start_sla_hours
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.establishment_id = v_establishment_id and s.kind = 'plan' and s.status = 'active'
    limit 1
  )
  where r.id = p_request_id and r.accepted_start_sla_hours is null;

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

  insert into public.space_sequences (space_id, sequence_name, next_value)
  values (v_space_id, 'job', 2)
  on conflict (space_id, sequence_name)
  do update set next_value = public.space_sequences.next_value + 1
  returning next_value - 1 into v_seq;
  v_job_code := 'TRB-' || lpad(v_seq::text, 4, '0');

  insert into public.jobs (space_id, establishment_id, request_id, code, category)
  values (v_space_id, v_establishment_id, p_request_id, v_job_code, v_category)
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
    jsonb_build_object('state', 'accepted', 'job_id', v_job_id, 'job_code', v_job_code, 'budgeted', v_budgeted)
  );
end;
$function$

;

-- ============================================================
-- CLAUDE.md MUST NOT · el cliente nunca ve la identidad individual de
-- nadie del equipo. Las dos tablas nuevas son SUYAS (su permanencia, su
-- cambio de plan) y las lee con `client_can_view_billing()`, así que RLS
-- no basta: filtra filas, no columnas. Lo sostiene el privilegio de
-- columna, como en `charges` y compañía.
--
-- Consecuencia práctica: `select *` sobre estas dos tablas devuelve 403.
-- Toda consulta debe enumerar columnas.
--
-- Lo encontró el barrido de hito7_mensajes_archivos_finanzas.sql antes que
-- ninguna persona, que es para lo que está.
-- ============================================================
revoke select on public.plan_commitments from anon, authenticated;
grant select (id, space_id, establishment_id, subscription_id, plan_id,
              started_at, ends_at, cause, created_at)
  on public.plan_commitments to authenticated;

revoke select on public.scheduled_plan_changes from anon, authenticated;
grant select (id, space_id, establishment_id, subscription_id, from_plan_id, to_plan_id,
              direction, effective_at, state, created_at, applied_at)
  on public.scheduled_plan_changes to authenticated;

-- Y ni una ni otra se escriben a mano: solo por las funciones de arriba.
revoke insert, update, delete on public.plan_commitments from anon, authenticated;
revoke insert, update, delete on public.scheduled_plan_changes from anon, authenticated;
