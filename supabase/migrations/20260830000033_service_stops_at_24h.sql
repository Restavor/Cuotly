-- El servicio se detiene a las 24 horas, no a las 72.
--
-- La quinta revisión encontró que el código hacía dos cosas
-- contradictorias: `evaluate_establishment_dunning()` paraba TODOS los
-- contadores del establecimiento ya en la etapa `paused` (+24 h), pero la
-- guarda de la migración 30 solo miraba `suspended` (+72 h). Resultado
-- comprobado en vivo: a las 24 h se paraban once contadores y acto seguido
-- el cliente enviaba una solicitud y el trabajador comenzaba un trabajo,
-- arrancando dos contadores nuevos que corrían durante el impago.
--
-- No era un fallo de implementación sino una contradicción entre
-- documentos, así que se paró y se preguntó (CLAUDE.md). Bosco decide el
-- 31/08/2026: **el servicio se detiene a las 24 h**. A las 72 h lo que
-- cambia es el estado (Suspendido) y su gravedad de cara al cliente, no la
-- detención, que ya estaba. Recogido en RN-FIN-10/11/12 del PRD y en la
-- decisión 11 de docs/DECISIONES.md.
--
-- Consecuencia técnica: la guarda pasa a rechazar `paused` y `suspended`,
-- y con eso su nombre —`assert_establishment_not_suspended`— pasa a
-- mentir. Un nombre que miente en una guarda de seguridad es exactamente
-- lo que provoca el siguiente fallo: alguien lee `not_suspended` en
-- `start_job()` y da por hecho que `paused` sí deja pasar. Así que se
-- renombra a `assert_establishment_service_running()` y se reescriben las
-- diez funciones que la llaman.
--
-- Las diez se reescriben copiadas literalmente de la base y cambiando
-- únicamente el nombre de la función llamada; verificado comparando el
-- resto del cuerpo línea a línea.
-- ============================================================

create or replace function public.assert_establishment_service_running(p_establishment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.establishments where id = p_establishment_id;

  -- RN-FIN-10 (+24 h, `paused`) y RN-FIN-11 (+72 h, `suspended`): en las
  -- dos etapas del impago el servicio está detenido (RN-FIN-12: "se
  -- detienen trabajos, publicaciones y contadores").
  if v_status in ('paused', 'suspended') then
    raise exception 'El servicio de este establecimiento está detenido por impago';
  end if;
end;
$$;

comment on function public.assert_establishment_service_running(uuid) is
  'RN-FIN-10 a RN-FIN-12: con el establecimiento pausado (+24 h) o
   suspendido (+72 h) por impago no se comienzan ni publican trabajos, ni
   se asignan, ni se envían o aceptan solicitudes, ni se reanuda nada que
   arranque un contador. Interna: no comprueba permisos por su cuenta, la
   llaman funciones que sí lo hacen.';

revoke all on function public.assert_establishment_service_running(uuid)
  from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_job(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_request_id uuid;
  v_establishment_id uuid;
begin
  select space_id, state, assigned_to, request_id, establishment_id
  into v_space_id, v_state, v_assigned_to, v_request_id, v_establishment_id
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  -- RN-JOB-05: un cambio incluido en el plan es una obligación contractual
  -- del espacio; el responsable no lo rechaza por preferencia. Quien
  -- comienza es el responsable asignado, nadie más.
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
end;
$function$;

CREATE OR REPLACE FUNCTION public.publish_job(p_job_id uuid, p_correction_window_ends_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_request_id uuid;
  v_establishment_id uuid;
begin
  select space_id, state, assigned_to, request_id, establishment_id
  into v_space_id, v_state, v_assigned_to, v_request_id, v_establishment_id
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if v_assigned_to is null or v_assigned_to <> auth.uid() then
    raise exception 'Solo el responsable asignado puede publicar este trabajo';
  end if;

  if v_state = 'published' then
    return; -- CA-17: publicar dos veces produce un único efecto.
  end if;

  if v_state <> 'in_progress' then
    raise exception 'Solo se puede publicar un trabajo en curso';
  end if;

  if p_correction_window_ends_at is null
     or p_correction_window_ends_at <= now()
     or p_correction_window_ends_at > now() + interval '60 days' then
    raise exception 'La ventana de corrección recibida no es válida';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.jobs
  set state = 'published',
      published_at = now(),
      published_by = auth.uid(),
      correction_window_ends_at = p_correction_window_ends_at
  where id = p_job_id;

  update public.requests set state = 'published' where id = v_request_id;

  -- RN-SLA-13: T3 se detiene al publicar.
  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't3', 'job', p_job_id, 'stopped', now(), auth.uid());

  perform public.record_state_event(v_space_id, 'job', p_job_id, 'in_progress', 'published', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'job.published', 'job', p_job_id,
    jsonb_build_object('state', 'in_progress'),
    jsonb_build_object('state', 'published', 'correction_window_ends_at', p_correction_window_ends_at)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state <> 'draft' then
    return; -- idempotente: ya se envió.
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.requests set state = 'received' where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'started', now(), auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'request.submitted', 'request', p_request_id, jsonb_build_object('state', 'draft'), jsonb_build_object('state', 'received'));
end;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.unblock_job(p_job_id uuid, p_note text DEFAULT NULL::text, p_reverted boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_establishment_id uuid;
begin
  select space_id, state, assigned_to, establishment_id
  into v_space_id, v_state, v_assigned_to, v_establishment_id
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden reanudar este trabajo';
  end if;

  if p_reverted and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el propietario o un administrador pueden revertir un bloqueo';
  end if;

  -- RN-JOB-07: una pausa autorizada la levanta quien la autorizó, no el
  -- trabajador (a diferencia del bloqueo por falta de información, que
  -- termina cuando llega lo que faltaba).
  if v_state = 'authorized_pause' and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el propietario o un administrador pueden levantar una pausa autorizada';
  end if;

  if v_state = 'in_progress' then
    return; -- Idempotente: ya está en curso.
  end if;

  if v_state not in ('blocked_by_client', 'authorized_pause') then
    raise exception 'El trabajo no está bloqueado ni en pausa';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  -- RN-FIN-12 / RN-FIN-13: una retención por impago NO se levanta desde
  -- aquí. La abre `apply_financial_hold_on_jobs()` y la cierra
  -- `release_financial_holds()` cuando se cobra, y nada más. Sin esto, el
  -- mismo botón que reanuda un trabajo bloqueado por el cliente deshacía
  -- la suspensión entera.
  if exists (
    select 1 from public.blocks
    where job_id = p_job_id and ended_at is null and reason_type = 'financial_hold'
  ) then
    raise exception 'Este trabajo está retenido por impago: se reanuda al cobrar, no desde aquí';
  end if;

  update public.blocks
  set ended_at = now(), ended_by = auth.uid(), reverted = p_reverted
  where job_id = p_job_id and ended_at is null;

  update public.jobs set state = 'in_progress' where id = p_job_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't3', 'job', p_job_id, 'resumed', now(), auth.uid());

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, 'in_progress', p_note);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'job.unblocked', 'job', p_job_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'in_progress', 'reverted', p_reverted),
    p_note
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.provide_additional_information(p_request_id uuid, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_conversation_id uuid;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state <> 'needs_information' then
    raise exception 'La solicitud no está esperando información adicional';
  end if;

  if btrim(coalesce(p_message, '')) = '' then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.requests set state = 'pending_internal_validation' where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'resumed', now(), auth.uid());

  v_conversation_id := public.get_or_create_request_conversation(p_request_id);
  insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
  values (v_conversation_id, v_space_id, auth.uid(), 'client', p_message);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.information_provided', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'pending_internal_validation')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_revised_request(p_request_id uuid)
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
  v_job_id uuid;
  v_job_state text;
  v_old_category text;
  v_debit_entry_id uuid;
  v_original_cycle_id uuid;
  v_subscription_id uuid;
  v_current_cycle_id uuid;
  v_included integer;
  v_cycle_included integer;
  v_balance integer;
  v_budgeted boolean := true;
  v_cycle_id uuid;
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

  select id, state, category into v_job_id, v_job_state, v_old_category
  from public.jobs where request_id = p_request_id
  for update;

  if v_job_id is null then
    raise exception 'Esta solicitud todavía no tiene trabajo: la primera aceptación es accept_request()';
  end if;

  if v_state = 'accepted' then
    return; -- CA-17: aceptar dos veces produce un único efecto.
  end if;

  if v_state <> 'pending_client_acceptance' then
    raise exception 'La solicitud no está pendiente de aceptación';
  end if;

  if v_job_state not in ('pending_assignment', 'assigned') then
    raise exception 'El trabajo ya comenzó: no cabe una nueva aceptación (RN-SLA-08)';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  -- Si la categoría cambió, el débito anterior se devuelve y se registra
  -- el de la categoría nueva. El libro es inmutable: se añaden apuntes con
  -- signo, nunca se corrige el anterior (RN-DAT-04, CA-08).
  if v_old_category is distinct from v_category then
    select ce.id, ce.consumption_cycle_id into v_debit_entry_id, v_original_cycle_id
    from public.consumption_entries ce
    where ce.job_id = v_job_id and ce.entry_type = 'debit'
    order by ce.created_at desc
    limit 1;

    if v_debit_entry_id is not null then
      select subscription_id into v_subscription_id from public.consumption_cycles where id = v_original_cycle_id;
      v_current_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);

      insert into public.consumption_entries
        (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, related_entry_id, reason, created_by)
      values (
        v_space_id, v_establishment_id,
        case when v_current_cycle_id = v_original_cycle_id then v_original_cycle_id else v_current_cycle_id end,
        v_old_category, 1,
        -- RN-CON-10: si el ciclo original ya cerró, no se reabre — el
        -- apunte es un crédito compensatorio en el ciclo vigente.
        case when v_current_cycle_id = v_original_cycle_id then 'return' else 'compensatory_credit' end,
        p_request_id, v_job_id, v_debit_entry_id,
        'Nueva aceptación por cambio de clasificación (RN-CLS-09)', auth.uid()
      );
    end if;
  end if;

  -- Consumo de la categoría nueva, con las mismas reglas que
  -- accept_request() (RN-COM-01/02/12, RN-CON-03/06).
  select s.id, case v_category
      when 'small' then p.included_small
      when 'photo' then p.included_photo
      when 'medium' then p.included_medium
      when 'large' then p.included_large
    end
  into v_subscription_id, v_included
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = v_establishment_id and s.kind = 'plan' and s.status = 'active'
  limit 1;

  if v_subscription_id is not null and v_included > 0 then
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

    -- Solo se debita de nuevo si la categoría cambió: si es la misma, el
    -- débito original sigue en pie y volver a debitar cobraría dos veces
    -- el mismo cambio.
    if v_old_category is distinct from v_category then
      insert into public.consumption_entries
        (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, reason, created_by)
      values (
        v_space_id, v_establishment_id, v_cycle_id, v_category, -1, 'debit', p_request_id, v_job_id,
        'Nueva aceptación por cambio de clasificación (RN-CLS-09)', auth.uid()
      )
      returning id into v_entry_id;
    else
      -- Misma categoría: el débito original sigue en pie, y la nueva
      -- aceptación apunta a él para que el rastro no se rompa (CA-15).
      select ce.id into v_entry_id
      from public.consumption_entries ce
      where ce.job_id = v_job_id and ce.entry_type = 'debit'
      order by ce.created_at desc
      limit 1;
    end if;
  end if;

  update public.jobs set category = v_category where id = v_job_id;

  insert into public.acceptances
    (space_id, establishment_id, request_id, job_id, category, consumption_cycle_id, consumption_entry_id, budgeted, accepted_by)
  values
    (v_space_id, v_establishment_id, p_request_id, v_job_id, v_category, v_cycle_id, v_entry_id, v_budgeted, auth.uid());

  update public.requests set state = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = p_request_id;

  -- CA-12 / RN-SLA-08: T2 se reinicia **desde cero**. El libro conserva
  -- todos los eventos anteriores (nada se borra); es el arranque nuevo el
  -- que hace que el contador vigente empiece de cero
  -- (eventsSinceLastStart() en src/core/timer-events.ts).
  if v_job_state = 'assigned' then
    insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
    values (v_space_id, 't2', 'job', v_job_id, 'started', now(), auth.uid());
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.accepted_again', 'request', p_request_id,
    jsonb_build_object('state', v_state, 'category', v_old_category),
    jsonb_build_object('state', 'accepted', 'category', v_category, 'job_id', v_job_id, 't2_restarted', v_job_state = 'assigned')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_correction(p_correction_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_job_id uuid;
  v_request_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_establishment_id uuid;
begin
  select c.space_id, c.job_id, c.request_id, c.establishment_id
  into v_space_id, v_job_id, v_request_id, v_establishment_id
  from public.corrections c where c.id = p_correction_id;

  if v_space_id is null then
    raise exception 'Corrección no encontrada';
  end if;

  select state, assigned_to into v_state, v_assigned_to from public.jobs where id = v_job_id for update;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden empezar esta corrección';
  end if;

  if v_state = 'in_correction' then
    return; -- Idempotente.
  end if;

  if v_state <> 'published' then
    raise exception 'Solo se puede corregir un trabajo publicado';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.corrections set started_at = now() where id = p_correction_id and started_at is null;
  update public.jobs set state = 'in_correction' where id = v_job_id;
  update public.requests set state = 'in_correction' where id = v_request_id;

  perform public.record_state_event(v_space_id, 'job', v_job_id, 'published', 'in_correction', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'correction.started', 'correction', p_correction_id,
    jsonb_build_object('job_state', 'published'), jsonb_build_object('job_state', 'in_correction')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_correction(p_correction_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_job_id uuid;
  v_request_id uuid;
  v_completed_at timestamptz;
  v_state text;
  v_assigned_to uuid;
  v_establishment_id uuid;
begin
  select c.space_id, c.job_id, c.request_id, c.completed_at, c.establishment_id
  into v_space_id, v_job_id, v_request_id, v_completed_at, v_establishment_id
  from public.corrections c where c.id = p_correction_id;

  if v_space_id is null then
    raise exception 'Corrección no encontrada';
  end if;

  select state, assigned_to into v_state, v_assigned_to from public.jobs where id = v_job_id for update;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden cerrar esta corrección';
  end if;

  if v_completed_at is not null then
    return; -- CA-17: cerrarla dos veces produce un único efecto.
  end if;

  if v_state <> 'in_correction' then
    raise exception 'Esta corrección todavía no se ha empezado (start_correction)';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.corrections set completed_at = now(), completed_by = auth.uid() where id = p_correction_id;
  update public.jobs set state = 'published' where id = v_job_id;
  update public.requests set state = 'published' where id = v_request_id;

  perform public.record_state_event(v_space_id, 'job', v_job_id, 'in_correction', 'published', p_note);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'correction.completed', 'correction', p_correction_id,
    jsonb_build_object('job_state', 'in_correction'), jsonb_build_object('job_state', 'published'), p_note
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_job_assignment(p_job_id uuid, p_worker_id uuid, p_kind text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_state text;
  v_previous_assignee uuid;
  v_establishment_id uuid;
begin
  select space_id, state, assigned_to, establishment_id
  into v_space_id, v_state, v_previous_assignee, v_establishment_id
  from public.jobs where id = p_job_id;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.assignments set released_at = now()
  where job_id = p_job_id and released_at is null;

  insert into public.assignments (space_id, job_id, assignee_id, assigned_by, kind, reason)
  values (v_space_id, p_job_id, p_worker_id, auth.uid(), p_kind, p_reason);

  update public.jobs
  set assigned_to = p_worker_id, assigned_at = now(), state = 'assigned'
  where id = p_job_id;

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, 'assigned', p_reason);

  -- RN-SLA-05: T2 arranca cuando el trabajo queda asignado. Una
  -- reasignación NO vuelve a arrancarlo (RN-SLA-09, CA-12) — por eso el
  -- evento solo se escribe en la primera asignación, cuando el trabajo
  -- venía de pending_assignment.
  if v_state = 'pending_assignment' then
    insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
    values (v_space_id, 't2', 'job', p_job_id, 'started', now(), auth.uid());
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'job.assigned', 'job', p_job_id,
    jsonb_build_object('state', v_state, 'assigned_to', v_previous_assignee),
    jsonb_build_object('state', 'assigned', 'assigned_to', p_worker_id, 'kind', p_kind),
    p_reason
  );
end;
$function$;

-- Y fuera la anterior, para que no quede un nombre que miente esperando a
-- que alguien lo use.
drop function public.assert_establishment_not_suspended(uuid);
