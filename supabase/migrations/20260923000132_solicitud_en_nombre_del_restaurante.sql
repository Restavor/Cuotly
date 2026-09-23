-- ============================================================
-- Migración 132 · Crear una solicitud en nombre del restaurante
--                 (M77 del diseño definitivo; RN-REQ-08, decisión 73)
-- ============================================================
--
-- M77 dibuja "Nueva solicitud" dentro de Solicitudes del equipo: el
-- restaurante lo pidió por teléfono, por correo o en persona y alguien del
-- equipo lo deja escrito en Cuotly. Hasta hoy no se podía: las cuatro
-- puertas de la solicitud —`create_request_draft()`,
-- `update_request_draft()`, `attach_file_to_request_draft()` y
-- `submit_request()`— exigen ser del restaurante (`can_write_establishment()`
-- y su permiso "Crear solicitudes"), y así se quedan.
--
-- Lo que Bosco decidió el 23/09/2026 (decisión 73), con el mismo patrón que
-- la decisión 21 para responder un presupuesto:
--
--   · **Quién**: el propietario y los administradores del espacio
--     (`manage_requests`). Un trabajador no.
--   · **Sin borrador**: se crea y se envía en un paso. El equipo registra
--     algo que el restaurante ya pidió; un borrador suyo aparecería en el
--     panel del restaurante como si lo estuviera escribiendo él.
--   · **Motivo obligatorio**: cómo y cuándo lo pidió el restaurante. La
--     fila queda marcada (`created_by_team`), el apunte de auditoría lleva
--     `on_behalf_of_client` y el motivo, y los propietarios del restaurante
--     reciben el aviso. El restaurante ve que se creó en su nombre y por
--     qué, nunca quién (P7). Ver el punto 1: `created_by` NO está tapado.
--   · **La aceptación no cambia**: la propuesta la acepta el restaurante,
--     como siempre. Consumir cambios de su plan es decisión suya.
--   · **La categoría del equipo sustituye a la IA**: si quien la crea elige
--     una, se guarda como la propuesta (`classifications.source = 'team'`)
--     y la solicitud pasa directa a validación interna; no se llama a la
--     IA. Si la deja vacía, clasifica la IA como con cualquier otra. En los
--     dos casos nadie fuera del equipo ve nada hasta validarla (RN-CLS-03).
--
-- Todo en una transacción y con clave de idempotencia (CLAUDE.md): pulsar
-- dos veces "Enviar solicitud" devuelve la misma solicitud, no dos.
--
-- Se comprueba con `supabase/tests/solicitud_en_nombre_del_restaurante.sql`
-- (suite 73), que además destapó el fallo de `accept_request()` del punto 5.

-- ------------------------------------------------------------
-- 1 · La marca en la fila
-- ------------------------------------------------------------

alter table public.requests
  add column created_by_team boolean not null default false,
  add column on_behalf_reason text,
  add column creation_idempotency_key text;

-- P7 · `requests.created_by` y `request_versions.created_by` NO están
-- tapados por columna: el restaurante los lee (migración 27) porque hasta
-- hoy solo él creaba solicitudes y escribía su alcance, así que siempre
-- eran su propia identidad. Una solicitud del equipo pondría ahí el uuid
-- de un miembro del equipo, a la vista del restaurante: el bloqueante B2
-- otra vez. Revocar la columna rompería las pantallas que la leen, así
-- que la solución es no escribirla: en una solicitud del equipo las dos
-- quedan vacías, y quién fue lo dice `audit_log` (CLAUDE.md: "Cuando el
-- equipo sí necesita ver quién hizo qué, sale de audit_log").
alter table public.requests alter column created_by drop not null;
alter table public.request_versions alter column created_by drop not null;

alter table public.requests
  add constraint requests_creator_check check (
    (created_by_team and created_by is null) or (not created_by_team and created_by is not null)
  );

-- La marca y el motivo van juntos: una solicitud del equipo sin motivo no
-- dice nada al restaurante, y un motivo sin marca no tiene sentido.
alter table public.requests
  add constraint requests_on_behalf_reason_check check (
    (created_by_team and on_behalf_reason is not null
       and btrim(on_behalf_reason) <> '' and char_length(on_behalf_reason) <= 500)
    or (not created_by_team and on_behalf_reason is null)
  );

create unique index requests_creation_idempotency_idx
  on public.requests (space_id, creation_idempotency_key)
  where creation_idempotency_key is not null;

comment on column public.requests.created_by_team is
  'RN-REQ-08 · la creó el equipo en nombre del restaurante (M77, decisión 73). La ve el restaurante; quién fue, no (P7).';
comment on column public.requests.on_behalf_reason is
  'RN-REQ-08 · cómo y cuándo lo pidió el restaurante fuera de Cuotly. Obligatorio si created_by_team.';
comment on column public.requests.creation_idempotency_key is
  'RN-REQ-08 · clave de idempotencia de create_request_on_behalf(). Solo el equipo la usa; no se concede a nadie.';

-- La fila es del restaurante y la marca también: la lee (P7 tapa QUIÉN,
-- no QUE). La clave de idempotencia no le dice nada y no se concede.
grant select (created_by_team, on_behalf_reason) on public.requests to authenticated;

-- ------------------------------------------------------------
-- 2 · La propuesta del equipo
-- ------------------------------------------------------------
--
-- `classifications.source` decía de dónde salió la propuesta: la IA o las
-- reglas (RN-CLS-02 obliga a decirlo). Ahora puede salir del equipo. Sigue
-- siendo una PROPUESTA: pasa por `validate_classification()` igual que las
-- otras dos.

alter table public.classifications drop constraint classifications_source_check;
alter table public.classifications
  add constraint classifications_source_check check (source in ('ai', 'rules', 'team'));

-- ------------------------------------------------------------
-- 3 · El aviso al restaurante
-- ------------------------------------------------------------

alter table public.notifications drop constraint notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
  check (event_type = any (array[
    'request_submitted', 'job_unassigned', 'job_assigned', 'job_started', 'job_published',
    'correction_requested', 'job_reassignment_requested', 'task_reassignment_requested',
    'terms_version_published', 'menu_publication_requested', 'menu_assigned',
    'menu_needs_information', 'menu_published', 'menu_publication_error',
    'menu_not_prepared_reminder', 'menu_publication_overdue', 'quote_sent', 'quote_accepted',
    'quote_rejected', 'integration_sync_failed', 'integration_reauthorization_required',
    'report_schedule_due_soon', 'report_sent', 'cuotly_payment_due_soon',
    'cuotly_payment_due_today', 'cuotly_payment_overdue_24h', 'cuotly_payment_overdue_48h',
    'cuotly_payment_final_notice', 'cuotly_space_archived', 'cuotly_space_reactivated',
    'support_session_started', 'space_ownership_transferred', 'space_archived_by_owner',
    'incident_opened', 'incident_updated', 'incident_replied', 'storage_threshold_80',
    'storage_threshold_100', 'security_incident', 'consumption_threshold_80',
    'consumption_threshold_100', 't2_threshold_50', 't2_threshold_80', 't2_threshold_100',
    't2_critical_alert', 't2_reassignment_suggestion', 't3_threshold_75', 't3_threshold_90',
    't3_threshold_100', 'establishment_paused_nonpayment', 'establishment_suspended_nonpayment',
    'establishment_reactivated', 'charge_due_today', 'absence_requested', 'absence_decided',
    'absence_uncovered_jobs', 'establishment_access_granted', 'panel_invitation_pending_review',
    'panel_invitation_decided', 'review_received', 'low_review_received',
    'plan_revision_published',
    -- RN-REQ-08 (esta migración) · el equipo creó una solicitud en su nombre.
    'request_created_on_behalf'
  ]));

-- ------------------------------------------------------------
-- 4 · create_request_on_behalf
-- ------------------------------------------------------------

create or replace function public.create_request_on_behalf(
  p_establishment_id uuid,
  p_description text,
  p_priority text,
  p_priority_reason text,
  p_on_behalf_reason text,
  p_idempotency_key text,
  p_context text default null,
  p_category text default null,
  p_file_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_request_id uuid;
  v_existing_establishment uuid;
  v_code text;
  v_slug text;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_description text := btrim(coalesce(p_description, ''));
  v_context text := nullif(btrim(coalesce(p_context, '')), '');
  v_priority text := nullif(btrim(coalesce(p_priority, '')), '');
  v_reason text := nullif(btrim(coalesce(p_priority_reason, '')), '');
  v_on_behalf text := nullif(btrim(coalesce(p_on_behalf_reason, '')), '');
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_file_id uuid;
  v_file_establishment uuid;
  v_files uuid[] := '{}';
  v_recipient uuid;
begin
  select e.space_id into v_space_id
  from public.establishments e where e.id = p_establishment_id;

  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  -- RN-REQ-08 · propietario y administradores del espacio. Un trabajador
  -- no, y el restaurante tampoco: el suyo es create_request_draft().
  if not public.has_capability(v_space_id, 'manage_requests') then
    raise exception 'Solo el propietario y los administradores del espacio pueden crear una solicitud en nombre de un restaurante';
  end if;

  if v_key is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  -- Dos pulsaciones a la vez: la segunda espera a la primera y encuentra
  -- su solicitud en vez de tropezar con el índice único.
  perform pg_advisory_xact_lock(hashtextextended(v_space_id::text || ':' || v_key, 0));

  select r.id, r.establishment_id into v_request_id, v_existing_establishment
  from public.requests r
  where r.space_id = v_space_id and r.creation_idempotency_key = v_key;

  if v_request_id is not null then
    if v_existing_establishment <> p_establishment_id then
      raise exception 'Esa clave de idempotencia ya se usó para otro restaurante';
    end if;
    return v_request_id;
  end if;

  if v_description = '' then
    raise exception 'La descripción de la solicitud no puede estar vacía';
  end if;

  -- RN-REQ-05 · los dos obligatorios también aquí: el equipo los escribe
  -- con lo que le dijo el restaurante.
  if v_priority is null then
    raise exception 'Elige la prioridad antes de enviar la solicitud';
  end if;

  if v_priority not in ('high', 'medium', 'low') then
    raise exception 'La prioridad tiene que ser alta, media o baja';
  end if;

  if v_reason is null then
    raise exception 'Escribe el motivo de la prioridad antes de enviar la solicitud';
  end if;

  if char_length(v_reason) > 200 then
    raise exception 'El motivo de la prioridad no puede pasar de 200 caracteres';
  end if;

  -- Decisión 73 · cómo y cuándo lo pidió el restaurante.
  if v_on_behalf is null then
    raise exception 'Escribe cómo y cuándo lo pidió el restaurante';
  end if;

  if char_length(v_on_behalf) > 500 then
    raise exception 'Cómo lo pidió el restaurante no puede pasar de 500 caracteres';
  end if;

  if v_category is not null and v_category not in ('small', 'photo', 'medium', 'large') then
    raise exception 'La categoría tiene que ser pequeño, fotográfico, mediano o grande';
  end if;

  -- RN-EST-08 · con el servicio detenido no entra nada, venga de quien venga.
  perform public.assert_establishment_service_running(p_establishment_id);

  -- Los archivos, antes de escribir nada: uno que no vale no deja una
  -- solicitud a medias.
  if p_file_ids is not null then
    foreach v_file_id in array p_file_ids loop
      if v_file_id = any (v_files) then
        continue;
      end if;

      if not public.can_read_file(v_file_id) then
        raise exception 'No tienes acceso a ese archivo';
      end if;

      select f.establishment_id into v_file_establishment
      from public.files f where f.id = v_file_id;

      if v_file_establishment is distinct from p_establishment_id then
        raise exception 'El archivo es de otro establecimiento';
      end if;

      v_files := v_files || v_file_id;
    end loop;
  end if;

  -- La interna: la pública exige escribir en el restaurante, y el permiso
  -- de aquí ya se comprobó arriba (el mismo arreglo que `accept_quote()`,
  -- migración 80).
  v_code := public.next_request_code_internal(p_establishment_id);

  insert into public.requests
    (space_id, establishment_id, code, state, description, context, priority, priority_reason,
     created_by, created_by_team, on_behalf_reason, creation_idempotency_key)
  values
    (v_space_id, p_establishment_id, v_code, 'received', v_description, v_context, v_priority,
     v_reason, null, true, v_on_behalf, v_key)
  returning id into v_request_id;

  insert into public.request_versions (space_id, request_id, version_number, description, context, created_by)
  values (v_space_id, v_request_id, 1, v_description, v_context, null);

  foreach v_file_id in array v_files loop
    perform public.link_file(v_file_id, 'request', v_request_id, auth.uid());
  end loop;

  -- RN-SLA-01 · T1 arranca al enviar, y esto es enviar.
  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', v_request_id, 'started', now(), auth.uid());

  -- `request.submitted` y no una acción nueva: es la fecha de envío que
  -- lee el seguimiento del restaurante (migración 127). Lo que la
  -- distingue es `on_behalf_of_client`, como en la decisión 21.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'request.submitted', 'request', v_request_id,
          null,
          jsonb_build_object('state', 'received', 'code', v_code, 'priority', v_priority,
                             'on_behalf_of_client', true, 'reason', v_on_behalf,
                             'files', to_jsonb(v_files)));

  -- La propuesta del equipo, si la hay: received -> analyzing ->
  -- pending_internal_validation, los mismos dos pasos que da la IA.
  if v_category is not null then
    update public.requests set state = 'analyzing' where id = v_request_id;

    insert into public.classifications (request_id, space_id, source, proposed_category, proposed_summary)
    values (v_request_id, v_space_id, 'team', v_category, left(v_description, 500));

    update public.requests set state = 'pending_internal_validation' where id = v_request_id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_space_id, auth.uid(), 'request.classified', 'request', v_request_id,
            jsonb_build_object('state', 'analyzing'),
            jsonb_build_object('state', 'pending_internal_validation', 'source', 'team',
                               'category', v_category));
  end if;

  v_slug := public.space_slug(v_space_id);

  -- §18, fila 1 · "Nueva solicitud sin asignar -> propietario y todos los
  -- administradores". Quien la creó ya lo sabe.
  for v_recipient in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = v_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
      and sm.user_id <> auth.uid()
  loop
    perform public.emit_notification(
      v_space_id, v_recipient, 'request_submitted', 'staff', 'request', v_request_id,
      '/espacios/' || v_slug || '/solicitudes/' || v_request_id::text,
      'request_submitted:' || v_request_id::text, p_establishment_id);
  end loop;

  -- Decisión 73 · quien puede responder por el restaurante se entera de
  -- que hay una solicitud suya que no escribió: la misma lista que
  -- `quote_sent` (propietario local y propietario global del grupo).
  for v_recipient in
    select em.user_id
    from public.establishment_memberships em
    where em.establishment_id = p_establishment_id
      and em.revoked_at is null
      and em.role = 'local_owner'
    union
    select gm.user_id
    from public.group_memberships gm
    join public.establishments e on e.group_id = gm.group_id
    where e.id = p_establishment_id
      and gm.revoked_at is null
      and gm.role = 'global_owner'
  loop
    perform public.emit_notification(
      v_space_id, v_recipient, 'request_created_on_behalf', 'client', 'request', v_request_id,
      '/espacios/' || v_slug || '/restaurantes/' || p_establishment_id::text || '/solicitudes/' || v_request_id::text,
      'request_created_on_behalf:' || v_request_id::text, p_establishment_id);
  end loop;

  return v_request_id;
end;
$$;

comment on function public.create_request_on_behalf(uuid, text, text, text, text, text, text, text, uuid[]) is
  'RN-REQ-08 · M77 · el propietario o un administrador del espacio (manage_requests) crea y envía una solicitud en nombre del restaurante, con motivo obligatorio, marca en la fila, auditoría on_behalf_of_client y aviso a los propietarios del restaurante. Con categoría, la propuesta es del equipo (source = team) y va a validación interna sin IA. Idempotente por clave.';

-- Comprueba el permiso por su cuenta: `authenticated` la necesita, `anon`
-- no (CLAUDE.md: nunca solo `from public`).
revoke all on function public.create_request_on_behalf(uuid, text, text, text, text, text, text, text, uuid[])
  from public, anon;
grant execute on function public.create_request_on_behalf(uuid, text, text, text, text, text, text, text, uuid[])
  to authenticated;

-- ------------------------------------------------------------
-- 5 · accept_request(): el equipo no acepta sin presupuesto
-- ------------------------------------------------------------
--
-- Lo destapó la suite 73 al comprobar que la aceptación sigue siendo del
-- restaurante (decisión 73). La excepción de la decisión 21 —el equipo
-- llega aquí en nombre del restaurante cuando el PRESUPUESTO ya está
-- aceptado— se escribió así:
--
--   if not can_write_establishment(...)
--      and not (v_quote_state = 'accepted' and has_capability(..., 'manage_requests'))
--
-- Una solicitud sin presupuesto tiene `v_quote_state` nulo. Para quien
-- tiene `manage_requests`, `null and true` es nulo, `not null` es nulo, y
-- un `if` nulo no salta: el propietario y los administradores del espacio
-- aceptaban por RPC cualquier propuesta de cambios incluidos, consumiendo
-- la bolsa del restaurante sin que él dijera nada. Ninguna pantalla lo
-- ofrecía, pero ocultar un botón no es un control (CLAUDE.md). A un
-- trabajador no le pasaba: `null and false` es falso.
--
-- La función es la de la migración 118 sin más cambio que el `coalesce`.
-- `create or replace` conserva sus privilegios.

create or replace function public.accept_request(p_request_id uuid)
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
  -- Migración 132 · `coalesce`: sin presupuesto `v_quote_state` es nulo, y
  -- `not (null and true)` es nulo, no verdadero, así que el `if` no saltaba.
  if not public.can_write_establishment(v_establishment_id)
     and not (coalesce(v_quote_state = 'accepted', false)
              and public.has_capability(v_space_id, 'manage_requests')) then
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
$function$;
