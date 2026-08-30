-- Corrige los hallazgos no bloqueantes de la auditoría del Hito 5
-- (commit 130b6f7): reordena las comprobaciones de autorización en
-- accept_request()/cancel_accepted_request() para que se hagan ANTES de
-- revelar si la operación ya es idempotente (F1); cierra un hueco de RLS
-- en subscriptions_insert/subscriptions_update que no comprobaba que
-- establishment_id/plan_id/service_id pertenecieran al mismo espacio que
-- la propia fila (F2); y añade una comprobación de autorización dentro
-- del propio cuerpo de get_or_create_consumption_cycle() como defensa en
-- profundidad, mismo principio que corrigió next_space_sequence() en el
-- Hito 2 — el REVOKE de la migración 20260830000020 sigue siendo la
-- barrera principal, esto es un cinturón además del cinturón (F4).
--
-- F3 (accept_request/cancel_accepted_request no aceptan un idempotency_key
-- explícito) no se toca aquí: es una decisión de diseño de todo el
-- proyecto, no una regresión de este hito — ya se logra el efecto exigido
-- por CA-17 (pulsar dos veces no duplica nada) mediante el bloqueo de fila
-- (`for update`) sobre requests/jobs más el propio estado como guarda de
-- idempotencia, el mismo patrón que create_restavor_space()/
-- accept_space_invitation() del Hito 2. Queda para que Bosco confirme si
-- quiere además una clave de idempotencia explícita en algún hito
-- posterior.

-- ============================================================
-- accept_request — mismo cuerpo, con el orden de comprobaciones corregido:
-- can_write_establishment() se comprueba justo después de saber a qué
-- establecimiento pertenece la solicitud, ANTES de mirar si ya está
-- accepted. Antes, un usuario sin ningún acceso al establecimiento podía
-- "ejecutar con éxito" (sin excepción) accept_request() sobre una
-- solicitud ya aceptada de un espacio ajeno — no mutaba nada, pero
-- revelaba su estado sin comprobar autorización primero.
-- ============================================================
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
$$;

comment on function public.accept_request(uuid) is
  'HU-12/RN-REQ-02/RN-CLS-08/RN-CON-06. Sustituye a la versión de la
   migración 20260830000020: la comprobación de can_write_establishment()
   ahora se hace antes de mirar si el estado ya es accepted (hallazgo F1
   de la auditoría del Hito 5) — quien no tiene acceso al establecimiento
   nunca llega a saber en qué estado está la solicitud.';

-- ============================================================
-- cancel_accepted_request — mismo motivo: can_write_establishment() se
-- comprueba justo después de conocer el establecimiento (a partir de la
-- fila de requests), antes de mirar si el trabajo ya está cancelado.
-- ============================================================
create or replace function public.cancel_accepted_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_request_state text;
  v_job_id uuid;
  v_job_state text;
  v_started_at timestamptz;
  v_new_state text;
  v_before_start boolean;
  v_debit_entry_id uuid;
  v_original_cycle_id uuid;
  v_category text;
  v_subscription_id uuid;
  v_current_cycle_id uuid;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_request_state
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  select id, state, started_at into v_job_id, v_job_state, v_started_at
  from public.jobs where request_id = p_request_id
  for update;

  if v_job_id is null then
    raise exception 'La solicitud no tiene un trabajo asociado, no se puede cancelar';
  end if;

  if v_job_state in ('cancelled_before_start', 'cancelled_after_start') then
    return; -- Idempotente: ya se canceló.
  end if;

  if v_request_state <> 'accepted' then
    raise exception 'La solicitud no está en un estado que se pueda cancelar';
  end if;

  v_before_start := v_started_at is null;
  v_new_state := case when v_before_start then 'cancelled_before_start' else 'cancelled_after_start' end;

  update public.jobs
  set state = v_new_state, cancelled_reason = p_reason, cancelled_by = auth.uid(), cancelled_at = now()
  where id = v_job_id;

  update public.requests set state = v_new_state where id = p_request_id;

  if v_before_start then
    select ce.id, ce.consumption_cycle_id, ce.category
    into v_debit_entry_id, v_original_cycle_id, v_category
    from public.consumption_entries ce
    where ce.job_id = v_job_id and ce.entry_type = 'debit'
    order by ce.created_at desc
    limit 1;

    if v_debit_entry_id is not null then
      select subscription_id into v_subscription_id
      from public.consumption_cycles where id = v_original_cycle_id;

      v_current_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);

      if v_current_cycle_id = v_original_cycle_id then
        insert into public.consumption_entries
          (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, related_entry_id, reason, created_by)
        values
          (v_space_id, v_establishment_id, v_original_cycle_id, v_category, 1, 'return', p_request_id, v_job_id, v_debit_entry_id, p_reason, auth.uid());
      else
        insert into public.consumption_entries
          (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, related_entry_id, reason, created_by)
        values
          (v_space_id, v_establishment_id, v_current_cycle_id, v_category, 1, 'compensatory_credit', p_request_id, v_job_id, v_debit_entry_id,
           coalesce(p_reason || ' ', '') || '(crédito compensatorio: el ciclo original ya había cerrado)', auth.uid());
      end if;
    end if;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'request.cancelled', 'request', p_request_id,
    jsonb_build_object('state', 'accepted', 'job_state', v_job_state),
    jsonb_build_object('state', v_new_state, 'consumption_returned', v_before_start and v_debit_entry_id is not null),
    p_reason
  );
end;
$$;

comment on function public.cancel_accepted_request(uuid, text) is
  'RN-JOB-04/CA-06/CA-07. Sustituye a la versión de la migración
   20260830000020: can_write_establishment() se comprueba antes de mirar
   si el trabajo ya está cancelado (hallazgo F1 de la auditoría del
   Hito 5), mismo motivo que accept_request().';

-- ============================================================
-- get_or_create_consumption_cycle — defensa en profundidad (hallazgo F4):
-- añade su propia comprobación de acceso al establecimiento, además del
-- REVOKE ya existente que impide invocarla directamente por RPC. Si algún
-- día el REVOKE se perdiera (una migración futura que otorgue EXECUTE por
-- error, o un `alter default privileges` mal puesto), esta comprobación
-- sigue cerrando el mismo hueco que se corrigió en next_space_sequence()
-- en el Hito 2: ninguna función SECURITY DEFINER muta datos de un
-- establecimiento ajeno sin comprobar acceso dentro de su propio cuerpo.
-- ============================================================
create or replace function public.get_or_create_consumption_cycle(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  if not (public.is_space_member(v_space_id) or public.can_write_establishment(v_establishment_id)) then
    raise exception 'No tienes acceso a este establecimiento';
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
$$;

comment on function public.get_or_create_consumption_cycle(uuid) is
  'Solo invocable desde accept_request()/cancel_accepted_request() (REVOKE
   más abajo) — comprueba además su propio acceso al establecimiento
   (is_space_member o can_write_establishment) como defensa en
   profundidad (hallazgo F4 de la auditoría del Hito 5), el mismo
   principio que next_space_sequence() en el Hito 2.';

revoke all on function public.get_or_create_consumption_cycle(uuid) from public;

-- ============================================================
-- subscriptions_insert/subscriptions_update — hallazgo F2: comprueban
-- ahora que establishment_id/plan_id/service_id pertenecen de verdad al
-- mismo space_id que la propia fila, el mismo cruce que ya hacía
-- create_plan_subscription() pero que faltaba en las políticas RLS (una
-- escritura directa a la tabla, sin pasar por esa función, podía saltarse
-- la comprobación).
-- ============================================================
drop policy subscriptions_insert on public.subscriptions;

create policy subscriptions_insert on public.subscriptions
for insert
with check (
  public.has_capability(space_id, 'manage_clients')
  and created_by = auth.uid()
  and public.establishment_space_id(establishment_id) = space_id
  and (plan_id is null or exists (select 1 from public.plans p where p.id = plan_id and p.space_id = subscriptions.space_id))
  and (service_id is null or exists (select 1 from public.services sv where sv.id = service_id and sv.space_id = subscriptions.space_id))
);

drop policy subscriptions_update on public.subscriptions;

create policy subscriptions_update on public.subscriptions
for update
using (public.has_capability(space_id, 'manage_clients'))
with check (
  public.has_capability(space_id, 'manage_clients')
  and public.establishment_space_id(establishment_id) = space_id
  and (plan_id is null or exists (select 1 from public.plans p where p.id = plan_id and p.space_id = subscriptions.space_id))
  and (service_id is null or exists (select 1 from public.services sv where sv.id = service_id and sv.space_id = subscriptions.space_id))
);
