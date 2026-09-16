-- Fase 4 · después del Hito 22 · las cuatro pendientes de la Fase 4,
-- decididas por Bosco el 16/09/2026 (decisión 38; PRD RN-SUB-13,
-- RN-PLA-09 y RN-ADM-13).
--
-- **Lo que este archivo es.** Tres cosas que la maestra dejaba sin cerrar
-- y Bosco cerró, cada una en su sección:
--
--   1. **Almacenamiento** (pendientes 17 y 18). "Uso razonable" no tiene
--      umbral: lo controla Bosco desde el panel, y aquí no se mide ninguna
--      actividad ni se bloquea nada. Lo que sí se vigila es el
--      almacenamiento de §113: avisos al 80 % y al 100 % de lo incluido
--      en el plan, al propietario del espacio y, al 100 %, también a
--      Cuotly. Pasarse no bloquea nada: **se presupuesta aparte**, y por
--      eso no hay precio, ni bloque, ni límite duro.
--   2. **Una sola prueba gratuita por negocio** (pendiente 19): un negocio
--      es el mismo NIF **o** el mismo dominio de correo, salvo los dominios
--      públicos (gmail, hotmail…), que no identifican a nadie. Lo comprueba
--      `approve_space_request()` en el servidor y el panel lo enseña antes.
--   3. **El incidente de seguridad** (§142, pendiente 20.3): Cuotly lo
--      declara como un evento de estado marcado como de seguridad, y todos
--      los propietarios afectados reciben un aviso **obligatorio**. El
--      texto lo fijará el profesional del bloque legal cuando toque (paso 4
--      del orden acordado); la mecánica ya existe.
--
-- **Lo que NO es.** Los otros tres puntos legales (qué se elimina a los 30
-- días, qué se conserva y la numeración fiscal) quedan **como están**:
-- nada se elimina, todo se conserva, y las facturas las preparará un
-- agente aparte. No hay nada que migrar de eso.
--
-- Se comprueba con `supabase/tests/pendientes_de_la_fase_4.sql`.

-- ============================================================
-- 1 · Almacenamiento: lo incluido, el barrido y los avisos
-- ============================================================

-- Lo incluido en el plan del espacio, en bytes. `null` es "sin plan de
-- Cuotly" (Restavor y el de demostración): nada que vigilar. Interna: la
-- usan el barrido y el panel.
create or replace function public.cuotly_storage_limit_bytes(p_space_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_gb integer;
begin
  select coalesce(sub.plan, s.cuotly_plan) into v_plan
  from public.spaces s
  left join public.cuotly_subscriptions sub on sub.space_id = s.id
  where s.id = p_space_id;
  if v_plan is null then
    return null;
  end if;
  select t.storage_gb into v_gb from public.cuotly_plan_terms(v_plan) t;
  if v_gb is null then
    return null;
  end if;
  return v_gb::bigint * 1024 * 1024 * 1024;
end;
$$;

revoke all on function public.cuotly_storage_limit_bytes(uuid) from public, anon, authenticated;

-- A Bosco y a quien gestiona suscripciones: un espacio que ha llegado al
-- 100 % es un presupuesto que preparar (decisión 38).
create or replace function public.notify_platform_storage(p_space_id uuid, p_dedupe_key text)
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
    select p.id from public.profiles p where lower(p.email) = lower('info@restavor.com')
    union
    select pr.user_id from public.platform_roles pr where pr.can_manage_subscriptions
  loop
    if public.emit_notification(
         p_space_id, v_recipient, 'storage_threshold_100', 'staff',
         'space', p_space_id, '/administracion/espacios',
         p_dedupe_key || ':' || v_recipient::text, null, 100) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end;
$$;

revoke all on function public.notify_platform_storage(uuid, text) from public, anon, authenticated;

-- El barrido: una vez por espacio y hora, como los demás de la cola. El
-- aviso de cada umbral se repite como mucho una vez al mes mientras el
-- espacio siga por encima (la clave de deduplicación lleva el mes): §113
-- pide avisar, no aturdir. Devuelve cuántos avisos ha encolado.
create or replace function public.run_cuotly_storage_sweep(p_space_id uuid, p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit bigint := public.cuotly_storage_limit_bytes(p_space_id);
  v_used bigint;
  v_percent integer;
  v_mes text := to_char(p_now at time zone 'UTC', 'YYYYMM');
  v_slug text;
  v_owner uuid;
  v_sent integer := 0;
begin
  if v_limit is null or v_limit <= 0 then
    return 0;
  end if;

  select coalesce(sum(fv.size_bytes), 0)::bigint into v_used
  from public.file_versions fv where fv.space_id = p_space_id;

  if v_used * 100 < v_limit * 80 then
    return 0;
  end if;

  v_percent := case when v_used >= v_limit then 100 else 80 end;
  select slug into v_slug from public.spaces where id = p_space_id;

  for v_owner in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = p_space_id and sm.status = 'active' and sm.role = 'owner'
  loop
    if public.emit_notification(
         p_space_id, v_owner,
         case when v_percent = 100 then 'storage_threshold_100' else 'storage_threshold_80' end,
         'staff', 'space', p_space_id,
         '/espacios/' || v_slug || '/ajustes/suscripcion',
         'storage_threshold_' || v_percent || ':' || p_space_id::text || ':' || v_mes,
         null, v_percent) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  if v_percent = 100 then
    v_sent := v_sent + public.notify_platform_storage(p_space_id, 'storage_threshold_100:platform:' || p_space_id::text || ':' || v_mes);
  end if;

  return v_sent;
end;
$$;

comment on function public.run_cuotly_storage_sweep(uuid, timestamptz) is
  'RN-SUB-13 (decisión 38) · avisos al 80 % y al 100 % del almacenamiento
   incluido en el plan de Cuotly. Al 100 % avisa también a Cuotly: lo que
   pasa de lo incluido se presupuesta aparte. No bloquea nada.';

revoke all on function public.run_cuotly_storage_sweep(uuid, timestamptz) from public, anon, authenticated;

-- La cola: un tipo de trabajo más, solo para los espacios con suscripción.
alter table public.scheduled_jobs drop constraint scheduled_jobs_kind_check;
alter table public.scheduled_jobs add constraint scheduled_jobs_kind_check
  check (kind in ('monthly_charges', 'dunning_sweep', 'sla_sweep', 'lifecycle_sweep',
                  'consumption_sweep', 'daily_menu_sweep', 'cuotly_billing_sweep',
                  'cuotly_storage_sweep'));

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
  elsif v_kind = 'daily_menu_sweep' then
    v_hechos := public.run_daily_menu_sweep(v_space);
  elsif v_kind = 'cuotly_billing_sweep' then
    v_hechos := public.run_cuotly_billing_sweep(v_space);
  elsif v_kind = 'cuotly_storage_sweep' then
    v_hechos := public.run_cuotly_storage_sweep(v_space);
  elsif v_kind = 'sla_sweep' then
    raise exception 'El barrido de plazos lo ejecuta src/services/queue-runner.ts, no SQL';
  else
    raise exception 'Tipo de trabajo de cola desconocido: %', v_kind;
  end if;

  perform public.finish_scheduled_job(p_job_id, true, null);
  return v_hechos;
end;
$$;

revoke all on function public.run_scheduled_job(uuid) from public, anon, authenticated;

create or replace function public.enqueue_due_scheduled_jobs(
  p_run_after timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space record;
  v_kind text;
  v_hora text := to_char(p_run_after at time zone 'UTC', 'YYYYMMDDHH24');
  v_encolados integer := 0;
begin
  for v_space in select id, cuotly_plan from public.spaces loop
    foreach v_kind in array array[
      'monthly_charges',   -- RN-FIN-01
      'dunning_sweep',     -- RN-FIN-10 y RN-FIN-11
      'lifecycle_sweep',   -- RN-EST-09, RN-EST-10 y §6.4
      'consumption_sweep', -- §18, avisos al 80 % y al 100 %
      'daily_menu_sweep'   -- RN-MEN-08 y §62 (Hito 11)
    ]
    loop
      if public.enqueue_scheduled_job(
           v_space.id, v_kind, p_run_after,
           v_kind || ':' || v_space.id::text || ':' || v_hora) is not null then
        v_encolados := v_encolados + 1;
      end if;
    end loop;

    if v_space.cuotly_plan is not null then
      foreach v_kind in array array['cuotly_billing_sweep', 'cuotly_storage_sweep'] loop
        if public.enqueue_scheduled_job(
             v_space.id, v_kind, p_run_after,
             v_kind || ':' || v_space.id::text || ':' || v_hora) is not null then
          v_encolados := v_encolados + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_encolados;
end;
$$;

revoke all on function public.enqueue_due_scheduled_jobs(timestamptz)
  from public, anon, authenticated;

-- ============================================================
-- 2 · Los avisos nuevos (RN-NOT-03 y RN-NOT-04)
-- ============================================================
alter table public.notifications drop constraint notifications_event_type_check;

-- Sin paréntesis en los comentarios de esta lista, a propósito:
-- `listas-compartidas.test.ts` la lee con una expresión que se corta en el
-- primer cierre.
alter table public.notifications add constraint notifications_event_type_check check (event_type in (
  'request_submitted', 'job_unassigned', 'job_assigned', 'job_started', 'job_published',
  'correction_requested', 'job_reassignment_requested', 'task_reassignment_requested',
  'terms_version_published',
  'menu_publication_requested', 'menu_assigned', 'menu_needs_information', 'menu_published',
  'menu_publication_error', 'menu_not_prepared_reminder', 'menu_publication_overdue',
  'quote_sent', 'quote_accepted', 'quote_rejected',
  'integration_sync_failed', 'integration_reauthorization_required',
  'report_schedule_due_soon', 'report_sent',
  'cuotly_payment_due_soon', 'cuotly_payment_due_today', 'cuotly_payment_overdue_24h',
  'cuotly_payment_overdue_48h', 'cuotly_payment_final_notice',
  'cuotly_space_archived', 'cuotly_space_reactivated',
  'support_session_started',
  'space_ownership_transferred', 'space_archived_by_owner',
  'incident_opened', 'incident_updated', 'incident_replied',
  -- Decisión 38 · el almacenamiento incluido, al 80 % y al 100 %; y el
  -- incidente de seguridad de §142, obligatorio.
  'storage_threshold_80', 'storage_threshold_100', 'security_incident',
  'consumption_threshold_80', 'consumption_threshold_100',
  't2_threshold_50', 't2_threshold_80', 't2_threshold_100',
  't2_critical_alert', 't2_reassignment_suggestion',
  't3_threshold_75', 't3_threshold_90', 't3_threshold_100',
  'establishment_paused_nonpayment', 'establishment_suspended_nonpayment',
  'establishment_reactivated',
  'absence_requested', 'absence_decided', 'absence_uncovered_jobs'
));

-- RN-NOT-04 · el aviso de un incidente de seguridad abre la página pública
-- de estado, que es donde está lo declarado: tercera raíz, y ninguna más.
alter table public.notifications drop constraint notifications_deep_link_check;
alter table public.notifications add constraint notifications_deep_link_check
  check (deep_link like '/espacios/%' or deep_link like '/administracion/%' or deep_link = '/estado');

-- RN-NOT-03 · un incidente de seguridad es seguridad: no se apaga por
-- ningún canal.
create or replace function public.notification_event_is_mandatory(p_event_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_event_type in (
    't2_threshold_100',
    't3_threshold_100',
    'establishment_paused_nonpayment',
    'establishment_suspended_nonpayment',
    'cuotly_payment_final_notice',
    'cuotly_space_archived',
    'support_session_started',
    'space_ownership_transferred',
    'space_archived_by_owner',
    'security_incident'
  );
$$;

-- ============================================================
-- 3 · Una sola prueba gratuita por negocio (RN-PLA-09, decisión 38)
-- ============================================================

-- Un NIF se compara sin espacios, guiones ni mayúsculas: "B-12.345.678"
-- y "b12345678" son el mismo negocio.
create or replace function public.normalized_tax_id(p_tax_id text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(coalesce(p_tax_id, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

create or replace function public.email_domain(p_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(split_part(coalesce(p_email, ''), '@', 2))), '');
$$;

-- Los dominios de correo públicos no identifican a ningún negocio: dos
-- restaurantes distintos con Gmail no son el mismo. La lista es corta y
-- se amplía por migración. Los tres `example.*` están reservados para
-- documentación (RFC 2606) y no son de nadie: por eso están aquí y no en
-- una excepción de las suites.
create or replace function public.is_public_email_domain(p_domain text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_domain, '')) in (
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es',
    'live.com', 'msn.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com', 'mac.com',
    'protonmail.com', 'proton.me', 'gmx.com', 'gmx.es', 'aol.com', 'terra.es', 'telefonica.net',
    'movistar.es', 'orange.es', 'vodafone.es', 'ya.com', 'wanadoo.es',
    'example.com', 'example.net', 'example.org'
  );
$$;

-- Con qué solicitudes ya aprobadas choca esta: la misma persona, el mismo
-- NIF o el mismo dominio de correo no público. Para el panel, ANTES de
-- aprobar; `approve_space_request()` vuelve a comprobarlo.
create or replace function public.space_request_trial_conflicts(p_request_id uuid)
returns table (kind text, matched text, request_id uuid, business_name text, decided_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_req public.space_requests;
  v_tax text;
  v_domains text[];
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee las solicitudes (§128, §136)';
  end if;

  select * into v_req from public.space_requests where id = p_request_id;
  if v_req.id is null then
    return;
  end if;

  v_tax := public.normalized_tax_id(v_req.tax_id);
  select array_agg(distinct d) into v_domains
  from unnest(array[
    public.email_domain(v_req.email),
    public.email_domain((select p.email from public.profiles p where p.id = v_req.requester_id))
  ]) d
  where d is not null and not public.is_public_email_domain(d);

  return query
    select 'person'::text, (select p.email from public.profiles p where p.id = v_req.requester_id),
           r.id, r.business_name, r.decided_at
    from public.space_requests r
    where r.status = 'approved' and r.id <> v_req.id and r.requester_id = v_req.requester_id
    union all
    select 'tax_id'::text, v_tax, r.id, r.business_name, r.decided_at
    from public.space_requests r
    where r.status = 'approved' and r.id <> v_req.id
      and v_tax is not null and public.normalized_tax_id(r.tax_id) = v_tax
    union all
    select 'email_domain'::text, d.dominio, r.id, r.business_name, r.decided_at
    from public.space_requests r
    join public.profiles p on p.id = r.requester_id
    join lateral (
      select unnest(v_domains) as dominio
    ) d on d.dominio in (public.email_domain(r.email), public.email_domain(p.email))
    where r.status = 'approved' and r.id <> v_req.id and v_domains is not null
    order by 5 desc nulls last;
end;
$$;

comment on function public.space_request_trial_conflicts(uuid) is
  'RN-PLA-09 (decisión 38) · con qué solicitudes ya aprobadas choca esta:
   misma persona, mismo NIF o mismo dominio de correo no público. Lo que
   el panel enseña antes de aprobar; approve_space_request() lo repite.';

revoke all on function public.space_request_trial_conflicts(uuid) from public, anon;
grant execute on function public.space_request_trial_conflicts(uuid) to authenticated;

-- La misma `approve_space_request()` de la 90 con la comprobación por
-- negocio (NIF y dominio), además de la de persona que ya tenía.
create or replace function public.approve_space_request(
  p_request_id uuid,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.space_requests;
  v_space_id uuid;
  v_sub_id uuid;
  v_slug text;
  v_trial_ends timestamptz;
  v_conflict record;
begin
  if not public.is_platform_approver() then
    raise exception 'Solo Cuotly aprueba una solicitud de espacio';
  end if;

  select * into v_req from public.space_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_req.status = 'approved' then
    return v_req.space_id;
  end if;

  if not public.space_request_transition_allowed(v_req.status, 'approved', 'platform') then
    raise exception 'Una solicitud en % no se aprueba', v_req.status;
  end if;

  -- RN-PLA-09 · "una sola prueba gratuita por persona o negocio" (§4.4).
  -- Persona: el mismo solicitante. Negocio (decisión 38): el mismo NIF o
  -- el mismo dominio de correo no público. La primera que choque, para.
  select * into v_conflict from public.space_request_trial_conflicts(p_request_id) limit 1;
  if v_conflict.kind = 'person' then
    raise exception 'Esta persona ya tuvo su prueba gratuita (§4.4)';
  elsif v_conflict.kind = 'tax_id' then
    raise exception 'Este negocio ya tuvo su prueba gratuita (§4.4): el NIF % es el de la solicitud aprobada «%»', v_conflict.matched, v_conflict.business_name;
  elsif v_conflict.kind = 'email_domain' then
    raise exception 'Este negocio ya tuvo su prueba gratuita (§4.4): el dominio de correo % es el de la solicitud aprobada «%»', v_conflict.matched, v_conflict.business_name;
  end if;

  v_slug := public.space_slug_from_name(v_req.business_name);
  v_trial_ends := now() + make_interval(days => public.cuotly_constant('trial_days'));

  insert into public.spaces (name, slug, created_by, cuotly_plan, cuotly_trial_ends_at,
                             cuotly_status, cuotly_status_changed_at)
  values (btrim(v_req.business_name), v_slug, v_req.requester_id, v_req.plan, v_trial_ends,
          'trial', now())
  returning id into v_space_id;

  insert into public.space_memberships (space_id, user_id, role, status)
  values (v_space_id, v_req.requester_id, 'owner', 'active');

  insert into public.cuotly_subscriptions (space_id, plan, current_period_start, current_period_end)
  values (v_space_id, v_req.plan, v_trial_ends, v_trial_ends + interval '1 month')
  returning id into v_sub_id;

  perform public.issue_cuotly_period_charge_internal(v_sub_id, v_trial_ends, v_trial_ends + interval '1 month');

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (v_space_id, 'space', v_space_id, null, 'trial', auth.uid(), null, 'approved');

  update public.space_requests
  set status = 'approved',
      status_reason = null,
      decided_at = now(),
      decided_by = auth.uid(),
      space_id = v_space_id,
      idempotency_key = coalesce(p_idempotency_key, idempotency_key),
      updated_at = now()
  where id = p_request_id;

  insert into public.space_request_events (request_id, from_status, to_status, actor_id)
  values (p_request_id, v_req.status, 'approved', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (null, auth.uid(), 'space_request.approved', 'space_request', p_request_id,
          jsonb_build_object('status', v_req.status),
          jsonb_build_object('status', 'approved', 'space_id', v_space_id));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'space.created', 'space', v_space_id,
          jsonb_build_object('from_request', p_request_id, 'plan', v_req.plan,
                             'trial_ends_at', v_trial_ends, 'owner', v_req.requester_id));

  return v_space_id;
end;
$$;

revoke all on function public.approve_space_request(uuid, text) from public, anon;
grant execute on function public.approve_space_request(uuid, text) to authenticated;

-- ============================================================
-- 4 · El incidente de seguridad (§142, RN-ADM-13, decisión 38)
-- ============================================================
alter table public.platform_status_events
  add column security boolean not null default false;

comment on column public.platform_status_events.security is
  'RN-ADM-13 · un evento de estado que es un incidente de seguridad de
   §142: los propietarios afectados reciben un aviso obligatorio y la
   página pública lo marca como tal.';

-- Declararlo: un evento de estado marcado como de seguridad y el aviso
-- obligatorio a los propietarios de los espacios afectados (todos, si no
-- se dice cuáles). El texto lo redacta quien declara; el profesional del
-- bloque legal fijará la plantilla cuando toque.
create or replace function public.declare_security_incident(
  p_title text,
  p_body text default null,
  p_severity text default 'degraded',
  p_component text default 'auth',
  p_space_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_space record;
  v_owner uuid;
  v_sent integer := 0;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, declara un incidente de seguridad (§142, RN-ADM-13)';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Un incidente de seguridad lleva título';
  end if;

  insert into public.platform_status_events (component, severity, title, body, started_at, created_by, security)
  values (p_component, p_severity, btrim(p_title), nullif(btrim(p_body), ''), now(), auth.uid(), true)
  returning id into v_id;

  for v_space in
    select s.id, s.slug from public.spaces s
    where p_space_ids is null or s.id = any (p_space_ids)
  loop
    for v_owner in
      select sm.user_id from public.space_memberships sm
      where sm.space_id = v_space.id and sm.status = 'active' and sm.role = 'owner'
    loop
      if public.emit_notification(
           v_space.id, v_owner, 'security_incident', 'staff',
           'space', v_space.id, '/estado',
           'security_incident:' || v_id::text || ':' || v_space.id::text) is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end loop;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (null, auth.uid(), 'platform_status.declared', 'platform_status_event', v_id,
          jsonb_build_object('component', p_component, 'severity', p_severity, 'title', btrim(p_title),
                             'security', true, 'spaces', case when p_space_ids is null then 'all' else 'some' end,
                             'owners_notified', v_sent));
  return v_id;
end;
$$;

comment on function public.declare_security_incident(text, text, text, text, uuid[]) is
  'RN-ADM-13, §142 (decisión 38) · declara un incidente de seguridad: un
   evento de estado marcado como tal, y un aviso obligatorio a los
   propietarios de los espacios afectados, todos si no se dice cuáles.';

revoke all on function public.declare_security_incident(text, text, text, text, uuid[]) from public, anon;
grant execute on function public.declare_security_incident(text, text, text, text, uuid[]) to authenticated;

-- La instantánea pública dice cuáles son de seguridad.
create or replace function public.platform_status_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dead integer;
  v_stuck integer;
  v_int_total integer;
  v_int_error integer;
  v_components jsonb;
  v_open jsonb;
  v_history jsonb;
begin
  select count(*) filter (where d.status = 'dead' and d.next_attempt_at >= now() - interval '24 hours'),
         count(*) filter (where d.status = 'pending' and d.next_attempt_at < now() - interval '1 hour')
  into v_dead, v_stuck
  from public.notification_deliveries d;

  select count(*) filter (where i.status in ('connected', 'syncing', 'needs_attention', 'error')),
         count(*) filter (where i.status = 'error' and i.consecutive_failures >= 3)
  into v_int_total, v_int_error
  from public.integrations i;

  select jsonb_agg(jsonb_build_object(
    'component', c.component,
    'measured', c.measured,
    'measured_state', c.measured_state,
    'measured_detail', c.measured_detail,
    'declared', (select jsonb_agg(jsonb_build_object(
                   'severity', e.severity, 'title', e.title, 'body', e.body, 'started_at', e.started_at,
                   'security', e.security)
                   order by e.started_at desc)
                 from public.platform_status_events e
                 where e.component = c.component and e.resolved_at is null)
  ) order by c.ordinal)
  into v_components
  from (values
    (1, 'app', true, 'operational', jsonb_build_object('reason', 'responds')),
    (2, 'auth', false, null, jsonb_build_object('reason', 'not_measured')),
    (3, 'files', false, null, jsonb_build_object('reason', 'not_measured')),
    (4, 'notifications', true,
        case when v_dead > 0 or v_stuck > 0 then 'degraded' else 'operational' end,
        jsonb_build_object('dead_24h', v_dead, 'stuck_over_1h', v_stuck)),
    (5, 'integrations',
        v_int_total > 0,
        case when v_int_total = 0 then null
             when v_int_error * 4 > v_int_total then 'degraded'
             else 'operational' end,
        jsonb_build_object('connected', v_int_total, 'failing', v_int_error,
                           'reason', case when v_int_total = 0 then 'nothing_connected' else null end))
  ) as c(ordinal, component, measured, measured_state, measured_detail);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'component', e.component, 'severity', e.severity, 'title', e.title,
      'body', e.body, 'started_at', e.started_at, 'security', e.security) order by e.started_at desc), '[]'::jsonb)
  into v_open
  from public.platform_status_events e where e.resolved_at is null;

  select coalesce(jsonb_agg(h order by (h ->> 'started_at') desc), '[]'::jsonb)
  into v_history
  from (
    select jsonb_build_object(
      'id', e.id, 'component', e.component, 'severity', e.severity, 'title', e.title,
      'body', e.body, 'started_at', e.started_at, 'resolved_at', e.resolved_at,
      'resolution_note', e.resolution_note, 'security', e.security) as h
    from public.platform_status_events e
    where e.resolved_at is not null
    order by e.started_at desc
    limit 20
  ) x;

  return jsonb_build_object(
    'generated_at', now(),
    'support_open_now', public.support_minutes_between(now(), now() + interval '1 minute') > 0,
    'components', coalesce(v_components, '[]'::jsonb),
    'open_events', v_open,
    'history', v_history
  );
end;
$$;

revoke all on function public.platform_status_snapshot() from public;
grant execute on function public.platform_status_snapshot() to anon, authenticated;

-- ============================================================
-- 5 · El panel: el almacenamiento frente a lo incluido
-- ============================================================

-- La lista de espacios devuelve también lo incluido, para que el panel
-- diga "18,4 de 20 GB" y marque los que han llegado. Cambia la forma de la
-- tabla devuelta: retirar, crear y revocar (CLAUDE.md).
drop function public.platform_list_spaces();

create function public.platform_list_spaces()
returns table (
  id uuid, name text, slug text, created_at timestamptz,
  cuotly_status text, cuotly_plan text,
  cuotly_trial_ends_at timestamptz, cuotly_archived_at timestamptz, cuotly_reactivation_deadline_at timestamptz,
  current_period_end timestamptz, pending_plan text,
  owner_emails text,
  active_establishments integer, internal_users integer, storage_bytes bigint, storage_limit_bytes bigint,
  outstanding_cents integer, overdue_cents integer, has_pending_declaration boolean,
  support_active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select s.id, s.name, s.slug, s.created_at,
      s.cuotly_status, s.cuotly_plan,
      s.cuotly_trial_ends_at, s.cuotly_archived_at, s.cuotly_reactivation_deadline_at,
      sub.current_period_end, sub.pending_plan,
      (select string_agg(p.email, ', ' order by p.email)
         from public.space_memberships sm join public.profiles p on p.id = sm.user_id
        where sm.space_id = s.id and sm.status = 'active' and sm.role = 'owner'),
      (select count(*)::integer from public.establishments e where e.space_id = s.id and e.status <> 'archived'),
      (select count(*)::integer from public.space_memberships sm where sm.space_id = s.id and sm.status = 'active'),
      (select coalesce(sum(fv.size_bytes), 0)::bigint from public.file_versions fv where fv.space_id = s.id),
      public.cuotly_storage_limit_bytes(s.id),
      (select coalesce(sum(public.cuotly_charge_outstanding_cents(c.id)), 0)::integer
         from public.cuotly_charges c where c.space_id = s.id),
      (select coalesce(sum(public.cuotly_charge_outstanding_cents(c.id)), 0)::integer
         from public.cuotly_charges c where c.space_id = s.id and public.cuotly_charge_status(c.id) = 'overdue'),
      exists (select 1 from public.cuotly_payments cp where cp.space_id = s.id and cp.confirmed_at is null and cp.rejected_at is null),
      exists (select 1 from public.support_sessions ss where ss.space_id = s.id and ss.ended_at is null and ss.expires_at > now())
    from public.spaces s
    left join public.cuotly_subscriptions sub on sub.space_id = s.id
    order by s.created_at desc;
end;
$$;

revoke all on function public.platform_list_spaces() from public, anon;
grant execute on function public.platform_list_spaces() to authenticated;

-- El bloque de almacenamiento del panel cuenta los espacios que han
-- llegado al 100 % de lo incluido: cada uno es un presupuesto que preparar.
create or replace function public.platform_panel_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'spaces_total', (select count(*) from public.spaces),
    'spaces_trial', (select count(*) from public.spaces where cuotly_status = 'trial'),
    'spaces_active', (select count(*) from public.spaces where cuotly_status = 'active'),
    'spaces_archived', (select count(*) from public.spaces where cuotly_status in ('archived_trial_ended', 'archived_nonpayment')),
    'spaces_without_plan', (select count(*) from public.spaces where cuotly_status is null),
    'requests_pending', (select count(*) from public.space_requests where status in ('submitted', 'in_review', 'needs_information')),
    'requests_submitted', (select count(*) from public.space_requests where status in ('submitted', 'in_review')),
    'subscriptions_total', (select count(*) from public.cuotly_subscriptions),
    'revenue_total_cents', (select coalesce(-sum(amount_cents), 0) from public.cuotly_ledger_entries where entry_type in ('payment', 'payment_reversal')),
    'revenue_month_cents', (select coalesce(-sum(amount_cents), 0) from public.cuotly_ledger_entries
                              where entry_type in ('payment', 'payment_reversal')
                                and created_at >= date_trunc('month', now())),
    'overdue_charges', (select count(*) from public.cuotly_charges c where public.cuotly_charge_status(c.id) = 'overdue'),
    'overdue_cents', (select coalesce(sum(public.cuotly_charge_outstanding_cents(c.id)), 0) from public.cuotly_charges c where public.cuotly_charge_status(c.id) = 'overdue'),
    'declared_payments_pending', (select count(*) from public.cuotly_payments where confirmed_at is null and rejected_at is null),
    'storage_bytes_total', (select coalesce(sum(size_bytes), 0) from public.file_versions),
    -- Decisión 38 · los espacios que han llegado al 100 % de lo incluido.
    'storage_over_limit', (select count(*) from public.spaces s
                            where public.cuotly_storage_limit_bytes(s.id) is not null
                              and (select coalesce(sum(fv.size_bytes), 0) from public.file_versions fv where fv.space_id = s.id)
                                  >= public.cuotly_storage_limit_bytes(s.id)),
    'activity_24h', (select count(*) from public.audit_log where created_at >= now() - interval '24 hours'),
    'incidents', (select count(*) from public.incidents where status <> 'closed'),
    'incidents_critical', (select count(*) from public.incidents i where i.status <> 'closed' and public.incident_priority(i.id) = 'critical'),
    'support_sessions_active', (select count(*) from public.support_sessions where ended_at is null and expires_at > now()),
    'support_sessions_total', (select count(*) from public.support_sessions),
    'platform_audit_total', (select count(*) from public.audit_log
                               where space_id is null
                                  or split_part(action, '.', 1) in ('space_request', 'cuotly_charge', 'cuotly_payment', 'support', 'platform', 'incident'))
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_panel_summary() from public, anon;
grant execute on function public.platform_panel_summary() to authenticated;
