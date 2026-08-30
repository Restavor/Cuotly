-- Corrige los hallazgos de la revisión adversarial del Hito 4 contra
-- docs/PRD.md y docs/ROADMAP.md. La migración 20260830000017 nunca se
-- toca, tal como exige CLAUDE.md — todo aquí es CREATE OR REPLACE, o un
-- DROP + CREATE puntual cuando cambia una firma o una política.

-- ============================================================
-- Hallazgo 1 (severidad alta) — RN-CLS-01/04/05, CLAUDE.md ("el cliente
-- nunca es la autoridad"; CA-01, "ni por llamada a la API").
--
-- record_classification() solo comprobaba can_write_establishment(), la
-- misma capacidad que ya tiene el propio cliente que envió la solicitud.
-- Sin ningún REVOKE en la migración original, la función SECURITY
-- DEFINER queda expuesta tal cual por la API REST autogenerada de
-- PostgREST/Supabase: cualquier restaurante autenticado podía llamarla
-- por RPC directa con source='ai' y tokens/coste inventados, sin que
-- Anthropic hubiera sido invocado nunca — falseando qué propuso
-- realmente la IA (RN-CLS-04, pensado para medir su calidad) y
-- facturando a Restavor un consumo de IA que nunca ocurrió (RN-CLS-05).
--
-- Arreglo: la función pasa a poder ejecutarla solo `service_role` (REVOKE/
-- GRANT de más abajo) — el código de servidor que ya invocó de verdad a
-- src/services/ai-classifier.ts (apps/web/src/lib/supabase/admin.ts).
-- Una llamada con service_role no lleva el JWT de ningún usuario, así
-- que auth.uid() no resuelve nada en ese contexto: el actor se recibe
-- explícito en p_actor_id, validado con la nueva
-- can_write_establishment_as() (mismo criterio que can_write_establishment(),
-- parametrizada en vez de leer auth.uid()).
-- ============================================================

create or replace function public.can_write_establishment_as(p_establishment_id uuid, p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id
        and em.user_id = p_actor_id
        and em.role in ('local_owner', 'editor')
    )
    or exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = p_actor_id
    );
$$;

comment on function public.can_write_establishment_as(uuid, uuid) is
  'Mismo criterio que can_write_establishment(uuid), parametrizado por
   actor en vez de leer auth.uid() — para funciones SECURITY DEFINER que
   solo puede llamar service_role (sin JWT de usuario, así que auth.uid()
   es siempre null) y reciben el actor real como parámetro explícito.';

-- La firma original (sin p_actor_id) queda huérfana: se elimina para que
-- no quede como una segunda puerta de entrada sin el REVOKE de abajo.
drop function if exists public.record_classification(uuid, text, text, text, text[], text, integer, integer, integer, text);

create or replace function public.record_classification(
  p_request_id uuid,
  p_actor_id uuid,
  p_source text,
  p_category text,
  p_summary text,
  p_matched_keywords text[] default null,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_estimated_cost_cents integer default null,
  p_fallback_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_classification_id uuid;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state = 'pending_internal_validation' then
    -- Idempotente: ya se registró un análisis para esta solicitud, se
    -- devuelve el último en vez de duplicarlo.
    select id into v_classification_id from public.classifications
    where request_id = p_request_id order by created_at desc limit 1;
    return v_classification_id;
  end if;

  if v_state <> 'analyzing' then
    raise exception 'La solicitud no está en análisis';
  end if;

  if not public.can_write_establishment_as(v_establishment_id, p_actor_id) then
    raise exception 'El actor indicado no tiene acceso de escritura a este establecimiento';
  end if;

  insert into public.classifications
    (request_id, space_id, source, proposed_category, proposed_summary, matched_keywords, model, input_tokens, output_tokens, fallback_reason)
  values
    (p_request_id, v_space_id, p_source, p_category, p_summary, p_matched_keywords, p_model, p_input_tokens, p_output_tokens, p_fallback_reason)
  returning id into v_classification_id;

  if p_source = 'ai' then
    insert into public.ai_usage (space_id, request_id, classification_id, model, input_tokens, output_tokens, estimated_cost_cents)
    values (v_space_id, p_request_id, v_classification_id, p_model, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), coalesce(p_estimated_cost_cents, 0));
  end if;

  update public.requests set state = 'pending_internal_validation' where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, p_actor_id, 'request.classified', 'request', p_request_id,
    jsonb_build_object('state', 'analyzing'),
    jsonb_build_object('state', 'pending_internal_validation', 'source', p_source, 'category', p_category)
  );

  return v_classification_id;
end;
$$;

comment on function public.record_classification(uuid, uuid, text, text, text, text[], text, integer, integer, integer, text) is
  'Solo service_role puede ejecutarla (ver REVOKE/GRANT de más abajo) —
   hallazgo de la revisión adversarial del Hito 4: la versión original
   (migración 20260830000017) era invocable directamente por el cliente
   vía RPC con source=''ai'' y datos inventados. auth.uid() no resuelve
   nada bajo service_role: el actor llega explícito en p_actor_id.';

revoke all on function public.record_classification(uuid, uuid, text, text, text, text[], text, integer, integer, integer, text) from public;
grant execute on function public.record_classification(uuid, uuid, text, text, text, text[], text, integer, integer, integer, text) to service_role;

-- ============================================================
-- Hallazgo 2 (severidad media) — RN-MSG-03: "el trabajador solo [ve
-- conversaciones de] establecimientos y trabajos autorizados", no todas
-- las del espacio. Las políticas originales usaban is_space_member(),
-- que incluye a cualquier trabajador activo — como en el Hito 4 no
-- existe todavía el concepto de "trabajo autorizado" (llega en el Hito
-- 6), se restringe la lectura de las conversaciones de solicitud al
-- mismo criterio que ya usan validate_classification/request_more_information/
-- reject_request: has_capability('manage_requests'), solo propietario o
-- administrador. messages_insert ya usaba ese criterio para el lado del
-- equipo — aquí solo hacía falta corregir las políticas de SELECT.
-- ============================================================

-- can_read_establishment(uuid) (migración 20260830000017) da acceso a
-- CUALQUIER miembro del espacio vía is_space_member() — a propósito para
-- requests/request_versions/request_attachments, donde todo el equipo sí
-- debe ver todas las solicitudes del espacio. Usarla tal cual aquí habría
-- dejado el hallazgo 2 sin corregir de verdad: is_space_member() dentro
-- de can_read_establishment() vuelve a admitir al trabajador por la
-- puerta de atrás, aunque el primer término de la política ya lo
-- excluya explícitamente. Se necesita el lado "solo cliente" por
-- separado.
create or replace function public.can_read_establishment_as_client(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_group_member((select e.group_id from public.establishments e where e.id = p_establishment_id))
    or public.is_establishment_member(p_establishment_id);
$$;

comment on function public.can_read_establishment_as_client(uuid) is
  'Como can_read_establishment(uuid) pero sin el término is_space_member():
   solo el lado cliente (Propietario global del grupo o miembro directo
   del establecimiento, cualquier rol incluido Consulta). Para políticas
   donde la visibilidad del equipo no debe ser "cualquier miembro del
   espacio" sino una capacidad concreta (conversations_select/messages_select
   de más abajo, RN-MSG-03).';

drop policy conversations_select on public.conversations;

create policy conversations_select on public.conversations
for select
using (
  public.has_capability(space_id, 'manage_requests')
  or (request_id is not null and public.can_read_establishment_as_client(public.request_establishment_id(request_id)))
);

drop policy messages_select on public.messages;

create policy messages_select on public.messages
for select
using (
  public.has_capability(space_id, 'manage_requests')
  or public.can_read_establishment_as_client(public.conversation_establishment_id(conversation_id))
);

-- ============================================================
-- Hallazgo 3 (severidad media) — RN-DAT-02: request_attachments_insert
-- comprobaba establishment_id contra el establecimiento real de la
-- solicitud, pero no space_id, que el cliente rellena libremente en el
-- INSERT (solo con una FK a spaces, sin exigir que sea su propio
-- espacio). Un cliente podía insertar una fila con su establishment_id
-- real pero un space_id ajeno, y esa fila pasaría a ser visible para
-- is_space_member() de ese otro espacio vía request_attachments_select —
-- filtrando metadatos del adjunto (nombre, ruta, tamaño) hacia un tenant
-- sin relación con la solicitud.
-- ============================================================

drop policy request_attachments_insert on public.request_attachments;

create policy request_attachments_insert on public.request_attachments
for insert
with check (
  created_by = auth.uid()
  and space_id = public.request_space_id(request_id)
  and establishment_id = public.request_establishment_id(request_id)
  and public.can_write_establishment(establishment_id)
  and public.request_state(request_id) = 'draft'
);

-- ============================================================
-- Hallazgo (severidad media) — CA-15: varias de las funciones del Hito 4
-- registraban el motivo (`reason`) pero no `old_value`/`new_value` en
-- audit_log, a diferencia de submit_request/record_classification/
-- copy_paste_request. CA-15 exige poder reconstruir "quién, qué, cuándo,
-- valor anterior, valor nuevo, motivo cuando corresponda" para cualquier
-- solicitud — se completa aquí, sin cambiar ninguna otra lógica de estas
-- funciones (mismas firmas, mismas comprobaciones, mismos efectos sobre
-- T1 y las tablas de negocio).
-- ============================================================

create or replace function public.validate_classification(
  p_request_id uuid,
  p_category text,
  p_summary text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_classification_id uuid;
begin
  select space_id, state into v_space_id, v_state from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_requests') then
    raise exception 'No tienes permiso para validar esta solicitud';
  end if;

  if v_state <> 'pending_internal_validation' then
    raise exception 'La solicitud no está pendiente de validación interna';
  end if;

  select id into v_classification_id from public.classifications
  where request_id = p_request_id order by created_at desc limit 1;

  update public.classifications
  set decided_category = p_category, decided_summary = p_summary, decided_by = auth.uid(), decided_at = now()
  where id = v_classification_id;

  update public.requests
  set state = 'pending_client_acceptance',
      validated_category = p_category,
      validated_summary = p_summary,
      validated_by = auth.uid(),
      validated_at = now()
  where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'stopped', now(), auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.classification_validated', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'pending_client_acceptance', 'category', p_category, 'summary', p_summary)
  );
end;
$$;

create or replace function public.request_more_information(p_request_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_conversation_id uuid;
begin
  select space_id, state into v_space_id, v_state from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_requests') then
    raise exception 'No tienes permiso para pedir información en esta solicitud';
  end if;

  if v_state <> 'pending_internal_validation' then
    raise exception 'La solicitud no está pendiente de validación interna';
  end if;

  if btrim(coalesce(p_message, '')) = '' then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  update public.requests set state = 'needs_information' where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'paused', now(), auth.uid());

  v_conversation_id := public.get_or_create_request_conversation(p_request_id);
  insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
  values (v_conversation_id, v_space_id, auth.uid(), 'staff', p_message);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'request.information_requested', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'needs_information'),
    p_message
  );
end;
$$;

create or replace function public.provide_additional_information(p_request_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.reject_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_conversation_id uuid;
begin
  select space_id, state into v_space_id, v_state from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_requests') then
    raise exception 'No tienes permiso para rechazar esta solicitud';
  end if;

  if v_state <> 'pending_internal_validation' then
    raise exception 'La solicitud no está pendiente de validación interna';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'El motivo del rechazo es obligatorio';
  end if;

  update public.requests
  set state = 'rejected', rejected_reason = p_reason, rejected_by = auth.uid(), rejected_at = now()
  where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'stopped', now(), auth.uid());

  v_conversation_id := public.get_or_create_request_conversation(p_request_id);
  insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
  values (v_conversation_id, v_space_id, auth.uid(), 'staff', p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'request.rejected', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'rejected'),
    p_reason
  );
end;
$$;

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
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state = 'accepted' then
    return; -- idempotente.
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state <> 'pending_client_acceptance' then
    raise exception 'La solicitud no está pendiente de aceptación';
  end if;

  update public.requests set state = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.accepted', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'accepted')
  );
end;
$$;

create or replace function public.decline_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  if v_state = 'rejected' then
    return; -- idempotente.
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state <> 'pending_client_acceptance' then
    raise exception 'La solicitud no está pendiente de aceptación';
  end if;

  update public.requests
  set state = 'rejected',
      rejected_reason = coalesce(p_reason, 'Rechazada por el restaurante'),
      rejected_by = auth.uid(),
      rejected_at = now()
  where id = p_request_id;

  if p_reason is not null and btrim(p_reason) <> '' then
    v_conversation_id := public.get_or_create_request_conversation(p_request_id);
    insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
    values (v_conversation_id, v_space_id, auth.uid(), 'client', p_reason);
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'request.declined_by_client', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'rejected'),
    p_reason
  );
end;
$$;
