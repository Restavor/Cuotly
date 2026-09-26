-- ============================================================
-- Migración 150 · Las tres salidas cuando no llegan los créditos
--                 (decisión 85, PRD §41, RN-CRE-14)
-- ============================================================
--
-- Punto 3 del plan de la decisión 85. Cuando una solicitud valorada en
-- créditos no cabe en lo que le queda al restaurante, elige una de tres
-- (RN-CRE-14). La segunda, esperar al ciclo siguiente, ya está en la 149
-- (`defer_request_to_next_cycle()`). Aquí llegan las otras dos:
--
--   1. **Quitar cosas** (`trim_request_scope()`): el restaurante reescribe
--      el alcance, se guarda como versión nueva (P4, `request_versions`) y
--      la solicitud vuelve a `analyzing` para que la IA la valore otra vez
--      (RN-CRE-09). Lo que valía antes no se toca: no llegó a gastarse.
--   2. **Pedir presupuesto aparte** (`request_credit_quote()`): queda
--      marcado cuándo lo pidió y se avisa al propietario y a los
--      administradores (aviso nuevo `credit_quote_requested`). El
--      presupuesto lo prepara el equipo con `create_quote()`, que desde
--      aquí admite solicitudes en créditos, y el restaurante lo acepta
--      como cualquier otro (§26); lo presupuestado no toca los créditos
--      (RN-CRE-07).
--
-- Se comprueba con `supabase/tests/las_tres_salidas.sql`.

-- ------------------------------------------------------------
-- 1 · Cuándo pidió presupuesto el restaurante
-- ------------------------------------------------------------
alter table public.requests add column quote_requested_at timestamptz;

-- `requests` va con privilegio de columna (CLAUDE.md).
grant select (quote_requested_at) on public.requests to authenticated;

-- ------------------------------------------------------------
-- 2 · El aviso al equipo
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
    'plan_revision_published', 'request_created_on_behalf',
    'space_deleted_by_platform', 'establishment_deleted_by_platform',
    'credit_quote_requested'
  ]));

-- ------------------------------------------------------------
-- 3 · Un presupuesto también puede ser de una solicitud en créditos
-- ------------------------------------------------------------
--
-- Mismo cuerpo que el vigente; solo admite la categoría `credits`.
CREATE OR REPLACE FUNCTION public.create_quote(p_establishment_id uuid, p_concept text, p_base_cents integer, p_outcome text, p_category text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid, p_requires_payment_before_start boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if p_outcome = 'job' and (v_category is null or v_category not in ('small', 'photo', 'medium', 'large', 'credits')) then
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
$function$;

-- ------------------------------------------------------------
-- 4 · Quitar cosas (RN-CRE-14, opción 1)
-- ------------------------------------------------------------
create or replace function public.trim_request_scope(p_request_id uuid, p_description text, p_context text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_version integer;
begin
  select id, space_id, establishment_id, state, kind, validated_category, validated_credits_half,
         description, context
  into v_request
  from public.requests where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  -- Lo recorta el restaurante: es su alcance.
  if not public.can_write_establishment(v_request.establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_request.state <> 'pending_client_acceptance' or v_request.validated_category is distinct from 'credits'
     or v_request.kind = 'incident' then
    raise exception 'Solo se recorta una solicitud valorada en créditos y pendiente de aceptar';
  end if;

  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'La solicitud necesita una descripción';
  end if;

  if btrim(p_description) = btrim(coalesce(v_request.description, ''))
     and btrim(coalesce(p_context, '')) = btrim(coalesce(v_request.context, '')) then
    raise exception 'No has cambiado nada de la solicitud';
  end if;

  if exists (select 1 from public.quotes where request_id = p_request_id and state in ('draft', 'sent', 'accepted')) then
    raise exception 'Esta solicitud ya va por presupuesto: no se recorta';
  end if;

  perform public.assert_establishment_service_running(v_request.establishment_id);

  -- P4 · el alcance anterior no se pierde: cada recorte es una versión.
  select coalesce(max(version_number), 0) + 1 into v_version
  from public.request_versions where request_id = p_request_id;

  insert into public.request_versions (request_id, space_id, version_number, description, context, created_by)
  values (p_request_id, v_request.space_id, v_version, btrim(p_description), nullif(btrim(coalesce(p_context, '')), ''),
          auth.uid());

  update public.requests
  set description = btrim(p_description),
      context = nullif(btrim(coalesce(p_context, '')), ''),
      state = 'analyzing',
      validated_category = null,
      validated_credits_half = null,
      credit_breakdown = null,
      validated_summary = null,
      validated_by = null,
      validated_at = null,
      credits_deferred_until = null,
      credits_deferred_by = null,
      quote_requested_at = null
  where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_request.space_id, auth.uid(), 'request.scope_trimmed', 'request', p_request_id,
          jsonb_build_object('state', v_request.state, 'credits_half', v_request.validated_credits_half),
          jsonb_build_object('state', 'analyzing', 'version', v_version));
end;
$$;

comment on function public.trim_request_scope(uuid, text, text) is
  'RN-CRE-14 · el restaurante quita cosas de una solicitud que no le cabe:
   nueva versión del alcance y vuelta a `analyzing` para valorarla otra vez.';

revoke all on function public.trim_request_scope(uuid, text, text) from public, anon;
grant execute on function public.trim_request_scope(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5 · Pedir presupuesto aparte (RN-CRE-14, opción 3)
-- ------------------------------------------------------------
create or replace function public.request_credit_quote(p_request_id uuid, p_note text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_now timestamptz := now();
  v_destinatario uuid;
begin
  select id, space_id, establishment_id, state, kind, validated_category, quote_requested_at
  into v_request
  from public.requests where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_request.establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_request.state <> 'pending_client_acceptance' or v_request.validated_category is distinct from 'credits'
     or v_request.kind = 'incident' then
    raise exception 'Solo se pide presupuesto de una solicitud valorada en créditos y pendiente de aceptar';
  end if;

  if v_request.quote_requested_at is not null then
    return v_request.quote_requested_at; -- CA-17.
  end if;

  perform public.assert_establishment_service_running(v_request.establishment_id);

  update public.requests
  set quote_requested_at = v_now, credits_deferred_until = null, credits_deferred_by = null
  where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_request.space_id, auth.uid(), 'request.quote_requested', 'request', p_request_id,
          jsonb_build_object('at', v_now), nullif(btrim(coalesce(p_note, '')), ''));

  -- Presupuestar es de quien decide sobre las peticiones: propietario y
  -- administradores (`manage_requests`), como el aviso de solicitud nueva.
  for v_destinatario in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = v_request.space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
  loop
    perform public.emit_notification(
      v_request.space_id, v_destinatario, 'credit_quote_requested', 'staff', 'request', p_request_id,
      '/espacios/' || public.space_slug(v_request.space_id) || '/solicitudes/' || p_request_id::text,
      'credit_quote_requested:' || p_request_id::text, v_request.establishment_id);
  end loop;

  return v_now;
end;
$$;

comment on function public.request_credit_quote(uuid, text) is
  'RN-CRE-14 · el restaurante pide que su solicitud se presupueste aparte.
   Avisa al propietario y a los administradores; el presupuesto lo prepara el
   equipo con create_quote().';

revoke all on function public.request_credit_quote(uuid, text) from public, anon;
grant execute on function public.request_credit_quote(uuid, text) to authenticated;

-- ============================================================
-- RN-CRE-29 · en créditos ya no hay corrección mínima gratuita
--
-- Bosco, 26/09/2026: "ya no hay corrección gratis". Un error de Restavor
-- se corrige a 0 créditos por el camino del equipo (RN-CRE-07, RN-JOB-12);
-- cualquier otro retoque del restaurante es una solicitud nueva y gasta.
-- La pantalla ya no ofrece el formulario en un trabajo en créditos, y
-- esto es lo que lo cierra de verdad: esconder un botón no es un control
-- (CLAUDE.md). Los trabajos por categorías siguen con RN-COR-01 mientras
-- existan planes por categorías.
--
-- Es la versión de la migración 38 con una comprobación más, antes de
-- tocar nada. Misma firma, mismos privilegios.
-- ============================================================

create or replace function public.request_free_correction(p_job_id uuid, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_request_id uuid;
  v_window_ends_at timestamptz;
  v_used_at timestamptz;
  v_published_at timestamptz;
  v_category text;
  v_correction_id uuid;
begin
  select space_id, establishment_id, state, request_id, correction_window_ends_at, free_correction_used_at, published_at, category
  into v_space_id, v_establishment_id, v_state, v_request_id, v_window_ends_at, v_used_at, v_published_at, v_category
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  -- RN-CRE-29 · un trabajo en créditos no tiene corrección gratis.
  if v_category = 'credits' then
    raise exception 'Este trabajo va en créditos y no tiene corrección gratuita: pide el retoque como una solicitud nueva (RN-CRE-29)';
  end if;

  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'Hay que explicar qué hay que corregir';
  end if;

  -- RN-COR-01: una sola corrección en total por trabajo, se pida durante
  -- la ejecución o después de publicar.
  if v_used_at is not null then
    raise exception 'Este trabajo ya usó su corrección mínima gratuita (RN-COR-01)';
  end if;

  if v_state not in ('in_progress', 'blocked_by_client', 'authorized_pause', 'published') then
    raise exception 'Este trabajo no está en un estado en el que quepa una corrección mínima';
  end if;

  -- La ventana solo corre desde la publicación (RN-COR-02).
  if v_published_at is not null and (v_window_ends_at is null or now() > v_window_ends_at) then
    raise exception 'La ventana de corrección de este trabajo ya se cerró (RN-COR-02)';
  end if;

  insert into public.corrections
    (space_id, establishment_id, job_id, request_id, kind, description, requested_by)
  values
    (v_space_id, v_establishment_id, p_job_id, v_request_id, 'client_request', p_description, auth.uid())
  returning id into v_correction_id;

  update public.jobs set free_correction_used_at = now() where id = p_job_id;

  if v_state = 'published' then
    update public.requests set state = 'correction_requested' where id = v_request_id;
  end if;

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, v_state, 'correction_requested');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (
    v_space_id, auth.uid(), 'correction.requested', 'correction', v_correction_id,
    jsonb_build_object('job_id', p_job_id, 'kind', 'client_request', 'consumes_free_correction', true, 'during_execution', v_state <> 'published'),
    p_description
  );

  perform public.notify_job_event(p_job_id, 'correction_requested');

  return v_correction_id;
end;
$$;
