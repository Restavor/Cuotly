-- El aviso que faltaba: quien tiene que aprobar una reasignación se entera.
--
-- Decisión de Bosco (12/09/2026), literal: "se avisa al propietario del
-- mantenimiento y a los administradores".
--
-- **El hueco que cierra.** Pedir la reasignación de un trabajo existe desde
-- el Hito 6 (`request_job_reassignment()`, RN-ASG-07) y la de una tarea
-- desde la migración 65. Las dos escriben su apunte de auditoría, las dos
-- se ven en pantalla, y ninguna de las dos avisaba a nadie: quien puede
-- aprobarla (RN-ASG-08) se enteraba si entraba a mirar. El ROADMAP lo
-- tenía escrito como pendiente de decisión desde el 11/09 precisamente
-- porque decidir A QUIÉN se avisa no es cosa mía.
--
-- **Por qué DOS tipos de evento y no uno.** El destinatario y la regla son
-- los mismos, pero el aviso no se redacta igual —"un trabajo" y "una
-- tarea" no son la misma cosa para quien lo lee— y las preferencias de
-- aviso (RN-NOT-02) se guardan por tipo de evento: con un solo tipo,
-- apagar el de tareas apagaría también el de trabajos.
--
-- **Por qué NO se avisa al responsable.** El responsable es quien la pide.
-- `notify_job_event()` incluye al asignado en su lista, y por eso no se
-- reutiliza aquí: mandarle un correo diciéndole lo que acaba de escribir
-- él mismo es ruido, y el ruido es lo que hace que se apaguen los avisos
-- que sí importan.
--
-- **Por qué la clave de deduplicación lleva el id del apunte y no el de la
-- entidad.** Una reasignación se pide, se aprueba, y meses después puede
-- volver a pedirse sobre el mismo trabajo. Con la clave
-- `job_reassignment_requested:<trabajo>`, la segunda no avisaría a nadie
-- (CA-17 la tomaría por un doble clic). El apunte de auditoría —o la fila
-- de la solicitud, en las tareas— nace una sola vez por petición de
-- verdad, así que sirve de clave: el doble clic sigue sin duplicar nada,
-- porque las dos funciones salen antes de escribirlo.
--
-- Se comprueba con `supabase/tests/el_aviso_de_la_reasignacion.sql`.

-- ------------------------------------------------------------
-- 1 · El catálogo de eventos admite los dos nuevos
-- ------------------------------------------------------------
--
-- Este CHECK está duplicado a propósito en `src/core/notifications.ts`
-- (NOTIFICATION_EVENTS) porque ninguno de los dos sistemas puede importar
-- del otro; que no se separen lo comprueba `notifications.test.ts`.
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

-- ------------------------------------------------------------
-- 2 · Y una tarea puede ser el elemento al que apunta
-- ------------------------------------------------------------
--
-- `entity_type` es lo que hace que el enlace profundo de RN-NOT-04 abra el
-- elemento exacto. Sin 'task', el aviso de una tarea tendría que mentir
-- diciendo que apunta a su trabajo.
alter table public.notifications
  drop constraint notifications_entity_type_check;

alter table public.notifications
  add constraint notifications_entity_type_check check (entity_type in (
    'request', 'job', 'task', 'establishment', 'charge', 'absence'
  ));

-- ------------------------------------------------------------
-- 3 · Quién decide sobre una reasignación, en un solo sitio
-- ------------------------------------------------------------
--
-- RN-ASG-08: "la aprueba el propietario o el administrador". Las dos
-- funciones de abajo necesitan la misma lista, y escribirla dos veces es
-- exactamente lo que CLAUDE.md prohíbe.
--
-- Se avisa por el ROL y no por la capacidad `assign_jobs`: el rol es lo
-- que dice la decisión de Bosco, y la capacidad podría concederse mañana a
-- un trabajador sin que eso signifique que hay que despertarle por correo.
-- Quién puede APROBARLA la sigue comprobando `approve_*_reassignment()`
-- por su cuenta; esto es solo a quién se avisa.
create or replace function public.notify_reassignment_deciders(
  p_space_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_deep_link text,
  p_dedupe_key text,
  p_establishment_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_sent integer := 0;
begin
  for v_recipient in
    select sm.user_id
    from public.space_memberships sm
    where sm.space_id = p_space_id
      and sm.status = 'active'
      and sm.role in ('owner', 'admin')
  loop
    if public.emit_notification(
         p_space_id, v_recipient, p_event_type, 'staff', p_entity_type, p_entity_id,
         p_deep_link, p_dedupe_key, p_establishment_id) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

comment on function public.notify_reassignment_deciders(uuid, text, text, uuid, text, text, uuid) is
  'Avisa de una reasignación pedida al propietario del espacio de
   mantenimiento y a sus administradores (decisión de Bosco, 12/09/2026).
   NO avisa al responsable: es quien la pide. Audiencia siempre `staff` —
   una reasignación es organización interna del equipo (P7) y el
   restaurante no la ve.';

revoke all on function public.notify_reassignment_deciders(uuid, text, text, uuid, text, text, uuid)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4 · La de un trabajo (RN-ASG-07)
-- ------------------------------------------------------------
--
-- Igual que la del Hito 6, con el aviso al final. Lo demás no se toca.
create or replace function public.request_job_reassignment(p_job_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_audit_id uuid;
begin
  select space_id, establishment_id, state, assigned_to
  into v_space_id, v_establishment_id, v_state, v_assigned_to
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if v_assigned_to is null or v_assigned_to <> auth.uid() then
    raise exception 'Solo el responsable asignado puede pedir la reasignación de este trabajo';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Hay que explicar el motivo de la reasignación (RN-ASG-07)';
  end if;

  if v_state = 'reassignment_requested' then
    return; -- Idempotente: ni segundo apunte ni segundo aviso.
  end if;

  if v_state not in ('assigned', 'in_progress') then
    raise exception 'Solo se puede pedir la reasignación de un trabajo asignado o en curso';
  end if;

  update public.jobs set state = 'reassignment_requested' where id = p_job_id;

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, 'reassignment_requested', p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'job.reassignment_requested', 'job', p_job_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'reassignment_requested'),
    p_reason
  )
  returning id into v_audit_id;

  perform public.notify_reassignment_deciders(
    v_space_id,
    'job_reassignment_requested',
    'job',
    p_job_id,
    '/espacios/' || public.space_slug(v_space_id) || '/trabajos/' || p_job_id::text,
    'job_reassignment_requested:' || v_audit_id::text,
    v_establishment_id
  );
end;
$$;

-- ------------------------------------------------------------
-- 5 · La de una tarea (migración 65)
-- ------------------------------------------------------------
--
-- El enlace profundo lleva a la tarea abierta en el panel
-- (`/trabajos/<id>/tareas?tarea=<id>`), que es la dirección que ya usa la
-- pantalla. Una tarea suelta —sin trabajo— no tiene esa pantalla, así que
-- su enlace es la lista de tareas del espacio.
create or replace function public.request_task_reassignment(p_task_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_assignee_id uuid;
  v_job_id uuid;
  v_job_state text;
  v_establishment_id uuid;
  v_slug text;
  v_link text;
  v_request_id uuid;
begin
  select t.space_id, t.state, t.assignee_id, t.job_id
  into v_space_id, v_state, v_assignee_id, v_job_id
  from public.tasks t where t.id = p_task_id
  for update;

  if v_space_id is null then
    raise exception 'Tarea no encontrada';
  end if;

  if not public.is_space_member(v_space_id) then
    raise exception 'Solo el equipo del espacio trabaja con tareas';
  end if;

  if v_assignee_id is null or v_assignee_id <> auth.uid() then
    raise exception 'Solo el responsable de la tarea puede pedir su reasignación (RN-ASG-07)';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Hay que explicar el motivo de la reasignación (RN-ASG-07)';
  end if;

  if v_state in ('completed', 'cancelled') then
    raise exception 'Una tarea % no se reasigna', v_state;
  end if;

  if v_job_id is not null then
    select j.state, j.establishment_id into v_job_state, v_establishment_id
    from public.jobs j where j.id = v_job_id;
    if v_job_state in ('published', 'completed', 'cancelled_before_start', 'cancelled_after_start') then
      raise exception 'No se reasignan tareas de un trabajo ya terminado';
    end if;
  end if;

  if exists (
    select 1 from public.task_reassignment_requests r
    where r.task_id = p_task_id and r.state = 'pending'
  ) then
    return; -- CA-17, y tampoco un segundo aviso.
  end if;

  insert into public.task_reassignment_requests (space_id, task_id, requested_by, reason)
  values (v_space_id, p_task_id, auth.uid(), btrim(p_reason))
  returning id into v_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'task.reassignment_requested', 'task', p_task_id,
    jsonb_build_object('assignee_id', v_assignee_id, 'reassignment_pending', false),
    jsonb_build_object('assignee_id', v_assignee_id, 'reassignment_pending', true),
    btrim(p_reason)
  );

  v_slug := public.space_slug(v_space_id);
  v_link := case
    when v_job_id is null then '/espacios/' || v_slug || '/tareas'
    else '/espacios/' || v_slug || '/trabajos/' || v_job_id::text || '/tareas?tarea=' || p_task_id::text
  end;

  perform public.notify_reassignment_deciders(
    v_space_id,
    'task_reassignment_requested',
    'task',
    p_task_id,
    v_link,
    'task_reassignment_requested:' || v_request_id::text,
    v_establishment_id
  );
end;
$$;

comment on function public.request_task_reassignment(uuid, text) is
  'RN-ASG-07 · la pide el responsable de la tarea explicando el motivo. No
   cambia el estado de la tarea: mientras alguien decide, el trabajo sigue
   donde estaba. Avisa a quien puede aprobarla (RN-ASG-08).';

-- Los privilegios, restablecidos a mano. `create or replace` los conserva,
-- pero escribirlos aquí es lo que hace que la migración diga la verdad
-- entera si alguien la lee dentro de un año.
revoke all on function public.request_job_reassignment(uuid, text) from public, anon;
grant execute on function public.request_job_reassignment(uuid, text) to authenticated;
revoke all on function public.request_task_reassignment(uuid, text) from public, anon;
grant execute on function public.request_task_reassignment(uuid, text) to authenticated;
