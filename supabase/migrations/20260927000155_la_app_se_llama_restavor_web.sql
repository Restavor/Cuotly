-- ============================================================
-- Migración 155 · La app se llama Restavor web (decisión 87)
-- ============================================================
--
-- Bosco, 27/09/2026: la app deja de llamarse por su nombre anterior y pasa
-- a llamarse **Restavor web** (la otra parte será Restavor agents). La
-- web ya lo dice; aquí se cambia lo que sale de la base y ve alguien:
--
--   1. Las funciones cuyo texto nombraba a la app —mensajes de error que la
--      pantalla enseña tal cual, notas de cierre, conceptos de los cobros
--      de la suscripción— se redefinen con el nombre nuevo. Cada una es la
--      definición vigente tras la migración 154 (sacada con
--      `pg_get_functiondef`), con el nombre cambiado y nada más: ni una
--      condición, ni un permiso, ni una firma distintos. `create or
--      replace` conserva el propietario y los privilegios de cada una, así
--      que no hace falta volver a revocar ni conceder nada.
--   2. Los artículos del centro de ayuda (`help_articles`) cambian el
--      nombre en su título y su texto. El `slug` no se toca: es el enlace.
--
-- Lo que NO cambia, a propósito: los identificadores (`cuotly_payments`,
-- `is_platform_*`, los slugs), los comentarios de tablas y columnas, y los
-- apuntes ya escritos en libros inmutables (`cuotly_ledger_entries`,
-- `audit_log`): un apunte dice lo que decía cuando se escribió.

CREATE OR REPLACE FUNCTION public.accept_quote(p_quote_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quote public.quotes;
  v_request public.requests;
  v_request_id uuid;
  v_tax_rate numeric(5, 2);
  v_term_days integer;
  v_charge_id uuid;
  v_job_id uuid;
  v_code text;
  v_by_team boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null then
    raise exception 'Presupuesto no encontrado';
  end if;

  -- Compromete dinero del restaurante: lo acepta quien lo representa
  -- (propietario local o propietario global del grupo), como las
  -- condiciones. El Editor y Consulta, no. Decisión 21 (13/09/2026): el
  -- propietario o un administrador del espacio pueden registrar que el
  -- restaurante lo aceptó fuera de Restavor web, en su nombre y con motivo.
  v_by_team := not public.client_can_accept_terms(v_quote.establishment_id);
  if v_by_team and not public.has_capability(v_quote.space_id, 'manage_requests') then
    raise exception 'Solo el propietario del restaurante, o el propietario o un administrador del espacio en su nombre, pueden aceptar un presupuesto';
  end if;

  if v_quote.state = 'accepted' then
    return; -- CA-17.
  end if;

  if v_quote.state <> 'sent' then
    raise exception 'El presupuesto no está pendiente de respuesta';
  end if;

  if v_by_team and v_reason is null then
    raise exception 'Para aceptar en nombre del restaurante hay que decir cómo y cuándo lo aceptó (motivo)';
  end if;

  perform public.assert_establishment_service_running(v_quote.establishment_id);

  if v_quote.request_id is not null then
    select * into v_request from public.requests where id = v_quote.request_id;
    if v_request.state <> 'pending_client_acceptance' then
      raise exception 'La solicitud de este presupuesto ya no está pendiente de aceptación';
    end if;
  end if;

  update public.quotes
  set state = 'accepted', decided_at = now(), decided_by = auth.uid(),
      decided_by_team = v_by_team, decision_reason = v_reason, updated_at = now()
  where id = p_quote_id;

  -- El cobro puntual (RN-FIN-01b para el plazo; RN-FIN-08 con el IVA
  -- congelado en el presupuesto). Sin suscripción: no es una cuota.
  select payment_term_days into v_term_days from public.spaces where id = v_quote.space_id;

  insert into public.charges
    (space_id, establishment_id, subscription_id, quote_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_by)
  values
    (v_quote.space_id, v_quote.establishment_id, null, p_quote_id,
     v_quote.code || ' · ' || v_quote.concept, now(), now() + interval '1 day',
     v_quote.base_cents, v_quote.tax_rate_percent, v_quote.tax_cents, v_quote.total_cents,
     now() + (v_term_days || ' days')::interval, auth.uid())
  returning id into v_charge_id;

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    (v_quote.space_id, v_quote.establishment_id, v_charge_id, 'charge', v_quote.total_cents,
     'Presupuesto ' || v_quote.code, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_quote.space_id, auth.uid(), 'charge.issued', 'charge', v_charge_id,
          jsonb_build_object('establishment_id', v_quote.establishment_id, 'total_cents', v_quote.total_cents,
                             'quote_id', p_quote_id));

  -- §84: "tras aceptación se crea solicitud o trabajo sin consumir bolsa".
  if v_quote.outcome = 'job' then
    if v_quote.request_id is null then
      -- Sin solicitud previa: nace ya validada con el alcance del
      -- presupuesto, y la acepta quien acepta el presupuesto.
      v_code := public.next_request_code_internal(v_quote.establishment_id);
      insert into public.requests
        (space_id, establishment_id, code, state, description, context, created_by,
         created_by_team, on_behalf_reason,
         validated_category, validated_summary, validated_by, validated_at)
      values
        (v_quote.space_id, v_quote.establishment_id, v_code, 'pending_client_acceptance',
         v_quote.concept, v_quote.description,
         -- Migración 133 · en su nombre, la solicitud es del equipo (RN-REQ-08):
         -- sin autor en la columna que lee el restaurante, y con el motivo.
         case when v_by_team then null else auth.uid() end,
         v_by_team, case when v_by_team then left(v_reason, 500) end,
         v_quote.category, v_quote.concept, v_quote.created_by, now())
      returning id into v_request_id;

      update public.quotes set request_id = v_request_id where id = p_quote_id;

      insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
      values (v_quote.space_id, auth.uid(), 'request.created_from_quote', 'request', v_request_id,
              jsonb_build_object('quote_id', p_quote_id, 'code', v_code, 'category', v_quote.category));
    else
      v_request_id := v_quote.request_id;
    end if;

    -- La misma aceptación de siempre: ve el presupuesto aceptado y crea
    -- el trabajo presupuestado (RN-CON-03), con su plazo congelado.
    perform public.accept_request(v_request_id);
    select id into v_job_id from public.jobs where request_id = v_request_id;
  end if;

  -- Con actor, fecha y motivo, y dicho en claro si fue en nombre del
  -- restaurante: es lo que después se le puede enseñar a quien pregunte.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_quote.space_id, auth.uid(), 'quote.accepted', 'quote', p_quote_id,
          jsonb_build_object('state', 'sent'),
          jsonb_build_object('state', 'accepted', 'charge_id', v_charge_id, 'request_id', v_request_id, 'job_id', v_job_id,
                             'on_behalf_of_client', v_by_team),
          v_reason);

  perform public.notify_quote_event(p_quote_id, 'quote_accepted');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_space_invitation(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar en Restavor web para aceptar una invitación';
  end if;
  return public.accept_space_invitation_as(p_token, auth.uid());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_platform_holiday(p_date date, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, fija sus festivos (§132, RN-SOP-06)';
  end if;
  if p_date is null or coalesce(btrim(p_name), '') = '' then
    raise exception 'Un festivo lleva fecha y nombre';
  end if;

  select id into v_id from public.platform_holidays where holiday_date = p_date and removed_at is null;
  if v_id is not null then
    return v_id; -- CA-17.
  end if;

  insert into public.platform_holidays (holiday_date, name, created_by)
  values (p_date, btrim(p_name), auth.uid())
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (null, auth.uid(), 'platform_holiday.added', 'platform_holiday', v_id,
          jsonb_build_object('holiday_date', p_date, 'name', btrim(p_name)));
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_access_request(p_request_id uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req public.access_requests;
  v_token uuid;
  v_expires timestamptz;
begin
  if not public.is_platform_approver() then
    raise exception 'Solo Restavor web aprueba una solicitud de acceso';
  end if;

  select * into v_req from public.access_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  -- Ya aprobada: se devuelve el mismo enlace vivo y no se toca nada.
  if v_req.status = 'approved' then
    select t.token into v_token
    from public.account_setup_tokens t
    where t.access_request_id = p_request_id and t.used_at is null
    order by t.created_at desc
    limit 1;
    return v_token;
  end if;

  if not public.access_request_transition_allowed(v_req.status, 'approved', 'platform') then
    raise exception 'Una solicitud en % no se aprueba', v_req.status;
  end if;

  -- Entre que se envió y se aprueba, ese correo puede haberse registrado
  -- por la otra puerta (una invitación). Aprobar entonces crearía una
  -- segunda cuenta para la misma persona, que es lo que §7.1 prohíbe.
  if exists (select 1 from public.profiles p where lower(p.email) = lower(v_req.email)) then
    raise exception 'Ese correo ya tiene cuenta en Restavor web';
  end if;

  -- Los mismos siete días que una invitación (HU-03): es el mismo tipo de
  -- enlace, y dos caducidades distintas para lo mismo solo se olvidan.
  v_expires := now() + interval '7 days';

  update public.access_requests
  set status = 'approved',
      status_reason = null,
      decided_at = now(),
      decided_by = auth.uid(),
      idempotency_key = coalesce(p_idempotency_key, idempotency_key),
      updated_at = now()
  where id = p_request_id;

  insert into public.account_setup_tokens (access_request_id, email, expires_at)
  values (p_request_id, lower(v_req.email), v_expires)
  returning token into v_token;

  insert into public.access_request_events (request_id, from_status, to_status, actor_id)
  values (p_request_id, v_req.status, 'approved', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (null, auth.uid(), 'access_request.approved', 'access_request', p_request_id,
          jsonb_build_object('status', v_req.status),
          jsonb_build_object('status', 'approved', 'expires_at', v_expires));

  perform public.queue_platform_email(
    'access_request_approved', v_req.email,
    jsonb_build_object('contact_name', v_req.contact_name,
                       'setup_token', v_token,
                       'expires_at', v_expires),
    'approved:' || p_request_id::text
  );

  return v_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_space_request(p_request_id uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req public.space_requests;
  v_space_id uuid;
  v_sub_id uuid;
  v_slug text;
  v_trial_ends timestamptz;
  v_conflict record;
begin
  if not public.is_platform_approver() then
    raise exception 'Solo Restavor web aprueba una solicitud de espacio';
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
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_cuotly_plan_change(p_space_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sub public.cuotly_subscriptions;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio anula un cambio de plan de Restavor web';
  end if;

  select * into v_sub from public.cuotly_subscriptions where space_id = p_space_id for update;
  if v_sub.id is null or v_sub.pending_plan is null then
    return; -- CA-17.
  end if;

  update public.cuotly_subscriptions
  set pending_plan = null, pending_extra_establishments = 0, pending_extra_users = 0,
      pending_requested_at = null, updated_at = now()
  where id = v_sub.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (p_space_id, auth.uid(), 'space.plan_change_cancelled', 'space', p_space_id,
          jsonb_build_object('pending_plan', v_sub.pending_plan),
          jsonb_build_object('pending_plan', null));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.change_cuotly_plan(p_space_id uuid, p_new_plan text, p_extra_establishments integer DEFAULT 0, p_extra_users integer DEFAULT 0, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space public.spaces;
  v_sub public.cuotly_subscriptions;
  v_old record;
  v_new record;
  v_usage record;
  v_key text;
  v_fraction numeric;
  v_diff integer;
  v_charge_id uuid;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio cambia el plan de Restavor web';
  end if;
  if p_new_plan not in ('pro', 'agency') then
    raise exception 'El plan de Restavor web es Pro o Agency, no %', p_new_plan;
  end if;

  select * into v_space from public.spaces where id = p_space_id;
  select * into v_sub from public.cuotly_subscriptions where space_id = p_space_id for update;
  if v_sub.id is null then
    raise exception 'Este espacio no tiene suscripción de Restavor web';
  end if;
  if v_space.cuotly_status <> 'active' then
    raise exception 'El plan se cambia con la suscripción activa; en la prueba se elige antes de empezar (§4.4)';
  end if;

  if p_new_plan = v_sub.plan and v_sub.pending_plan is null then
    return null; -- CA-17: cambiar al mismo plan no hace nada.
  end if;

  v_key := coalesce(p_idempotency_key, 'plan_change:' || v_sub.id::text || ':' || p_new_plan);
  if exists (
    select 1 from public.audit_log
    where action in ('space.plan_changed', 'space.plan_change_scheduled') and entity_id = p_space_id
      and new_value ->> 'idempotency_key' = v_key
  ) then
    return null;
  end if;

  select * into v_old from public.cuotly_plan_terms(v_sub.plan);
  select * into v_new from public.cuotly_plan_terms(p_new_plan);

  if p_new_plan = 'agency' then
    if v_sub.plan = 'agency' then
      -- Volver a Agency es anular el cambio a Pro programado.
      perform public.cancel_cuotly_plan_change(p_space_id);
      return null;
    end if;

    -- §4.7 · Pro → Agency: inmediato, con diferencia proporcional
    -- (RN-COM-18). Los adicionales de Pro dejan de aplicarse.
    v_fraction := public.cuotly_remaining_fraction(v_sub.current_period_start, v_sub.current_period_end, now());
    v_diff := round((v_new.price_cents - v_old.price_cents) * v_fraction)::integer;

    if v_diff > 0 then
      v_charge_id := public.issue_cuotly_charge_internal(
        v_sub.id, 'proration', 'Mejora a Restavor web Agency (parte proporcional)',
        now(), v_sub.current_period_end, v_sub.current_period_end, v_diff,
        jsonb_build_object('from_plan', 'pro', 'to_plan', 'agency', 'fraction', v_fraction));
    end if;

    update public.cuotly_subscriptions
    set plan = 'agency', extra_establishments = 0, extra_users = 0,
        pending_plan = null, pending_extra_establishments = 0, pending_extra_users = 0,
        pending_requested_at = null, updated_at = now()
    where id = v_sub.id;

    perform set_config('cuotly.space_status_change', 'on', true);
    update public.spaces set cuotly_plan = 'agency' where id = p_space_id;
    perform set_config('cuotly.space_status_change', 'off', true);

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (p_space_id, auth.uid(), 'space.plan_changed', 'space', p_space_id,
            jsonb_build_object('plan', 'pro', 'extra_establishments', v_sub.extra_establishments,
                               'extra_users', v_sub.extra_users),
            jsonb_build_object('plan', 'agency', 'kind', 'immediate_upgrade', 'fraction', v_fraction,
                               'difference_cents', v_diff, 'charge_id', v_charge_id,
                               'idempotency_key', v_key));
    return v_charge_id;
  end if;

  -- §4.7 · Agency → Pro: en la siguiente renovación, y solo si el uso cabe
  -- en Pro con los adicionales que se contraten ahora.
  if p_extra_establishments is null or p_extra_establishments < 0
     or p_extra_users is null or p_extra_users < 0 then
    raise exception 'Los adicionales son números enteros no negativos';
  end if;

  select
    (select count(*) from public.establishments e where e.space_id = p_space_id and e.status <> 'archived') as est,
    (select count(*) from public.space_memberships sm where sm.space_id = p_space_id and sm.status = 'active') as users
  into v_usage;
  if v_usage.est > v_new.included_establishments + p_extra_establishments then
    raise exception 'Antes de bajar a Pro hay que resolver el exceso (§4.7): caben % establecimientos activos y hay %',
      v_new.included_establishments + p_extra_establishments, v_usage.est;
  end if;
  if v_usage.users > v_new.included_users + p_extra_users then
    raise exception 'Antes de bajar a Pro hay que resolver el exceso (§4.7): caben % usuarios internos y hay %',
      v_new.included_users + p_extra_users, v_usage.users;
  end if;

  update public.cuotly_subscriptions
  set pending_plan = 'pro', pending_extra_establishments = p_extra_establishments,
      pending_extra_users = p_extra_users, pending_requested_at = now(), updated_at = now()
  where id = v_sub.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (p_space_id, auth.uid(), 'space.plan_change_scheduled', 'space', p_space_id,
          jsonb_build_object('plan', 'agency'),
          jsonb_build_object('pending_plan', 'pro', 'applies_at', v_sub.current_period_end,
                             'extra_establishments', p_extra_establishments, 'extra_users', p_extra_users,
                             'idempotency_key', v_key));
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_my_avatar()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar en Restavor web para quitar tu foto';
  end if;

  update public.profiles set avatar_path = null where id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_cuotly_payment(p_payment_id uuid, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_subscription_manager() then
    raise exception 'Solo Restavor web confirma un pago (§4.5)';
  end if;
  if not exists (select 1 from public.cuotly_payments where id = p_payment_id) then
    raise exception 'Pago no encontrado';
  end if;
  return public.cuotly_confirm_payment_internal(p_payment_id, p_note);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_establishment_backup_internal(p_establishment_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_content jsonb;
  v_counts jsonb;
  v_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  -- RN-BCK-01 · lo que hay DENTRO de Restavor web. La web no: Restavor web no la aloja
  -- y respaldarla habría significado conectarse a donde esté alojada.
  select jsonb_build_object(
    'version', 1,
    'taken_at', now(),
    'establishment', (
      select to_jsonb(e) from public.establishments e where e.id = p_establishment_id),
    'requests', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.requests r where r.establishment_id = p_establishment_id), '[]'::jsonb),
    'menus', coalesce((
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object('versions', coalesce((
          select jsonb_agg(to_jsonb(mv) order by mv.version)
          from public.menu_versions mv where mv.menu_id = m.id), '[]'::jsonb))
        order by m.target_date)
      from public.menus m where m.establishment_id = p_establishment_id), '[]'::jsonb),
    -- RN-BCK-09 · el INVENTARIO de los archivos, no los archivos. Duplicar
    -- los bytes doblaría el almacenamiento que el espacio paga (RN-SUB-13)
    -- y crearía copias fuera de `can_read_file()`.
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'category', f.category,
        'visibility', f.visibility, 'created_at', f.created_at,
        'archived_at', f.archived_at)
        order by f.created_at)
      from public.files f where f.establishment_id = p_establishment_id), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'type', c.type,
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', msg.id, 'body', msg.body, 'created_at', msg.created_at,
            'sender_role', msg.sender_role)
            order by msg.created_at)
          from public.messages msg where msg.conversation_id = c.id), '[]'::jsonb)))
      from public.conversations c
      where public.conversation_establishment_id(c.id) = p_establishment_id), '[]'::jsonb)
  ) into v_content;

  select jsonb_build_object(
    'requests', jsonb_array_length(v_content -> 'requests'),
    'menus', jsonb_array_length(v_content -> 'menus'),
    'files', jsonb_array_length(v_content -> 'files'),
    'conversations', jsonb_array_length(v_content -> 'conversations')
  ) into v_counts;

  insert into public.establishment_backups
    (space_id, establishment_id, content, size_bytes, item_counts, created_by)
  values
    (v_space_id, p_establishment_id, v_content,
     length(v_content::text), v_counts, p_created_by)
  returning id into v_id;

  -- RN-BCK-03 · se guardan treinta. La treinta y uno se borra de verdad,
  -- y es la única fila de esta base que se borra: una copia no es un
  -- registro de negocio, es una foto de él.
  delete from public.establishment_backups
  where establishment_id = p_establishment_id
    and id not in (
      select b.id from public.establishment_backups b
      where b.establishment_id = p_establishment_id
      order by b.taken_at desc
      limit 30
    );

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_restavor_space()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_owner_id uuid := auth.uid();
begin
  if not public.is_platform_owner() then
    raise exception 'Solo el propietario de Restavor web puede crear el espacio de Restavor';
  end if;

  if exists (select 1 from public.spaces where slug = 'restavor') then
    raise exception 'El espacio de Restavor ya existe';
  end if;

  insert into public.spaces (name, slug, timezone, created_by)
  values ('Restavor', 'restavor', 'Europe/Madrid', v_owner_id)
  returning id into v_space_id;

  insert into public.space_memberships (space_id, user_id, role, status)
  values (v_space_id, v_owner_id, 'owner', 'active');

  -- Los planes de mantenimiento de Restavor (PRD §6.1 y §41): Básico,
  -- Impulso y Premium (decisiones 84 y 85). Precios en céntimos, más IVA.
  -- Los créditos van en medios créditos: 40 = 20 créditos (RN-CRE-04).
  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium,
     included_large, included_credits_half, start_sla_hours, grants_priority, queue_rank,
     can_order_requests, report_level, report_period, watches_reviews, includes_daily_menu,
     execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large)
  values
    -- RN-COM-03 · `queue_rank` es el turno dentro del mismo plazo: Básico
    -- 0, Impulso 1, Premium 2 (decisiones 55 y 83).
    -- RN-REP-32 y RN-CRE-26 · el Básico recibe el trimestral; Impulso y
    -- Premium, el mensual y el trimestral.
    -- RN-CRE-20 · Impulso y Premium confirman el inicio en 24 h; el Básico, 48.
    -- RN-CRE-21 · Menú Diario incluido en Impulso y Premium.
    -- RN-CRE-28 · ninguno ordena sus solicitudes.
    (v_space_id, 'Básico',    2000, 0, 0, 0, 0,  0, 48, false, 0, false, 'basic',    'quarter', false, false, 72, 72, 72, 120),
    (v_space_id, 'Impulso',   9900, 0, 0, 0, 0, 40, 24, false, 1, false, 'standard', 'both',    false, true,  72, 72, 72, 120),
    (v_space_id, 'Premium',  19900, 0, 0, 0, 0, 80, 24, false, 2, false, 'advanced', 'both',    false, true,  72, 72, 72, 120);

  -- Servicio Menú Diario suelto (RN-CRE-21): 199 € + IVA para quien no lo
  -- tiene en su plan, también con Básico. Sin precio reducido y sin
  -- contador de actualizaciones (RN-CRE-22).
  insert into public.services (space_id, name, price_cents, price_premium_cents, kind, included_updates)
  values (v_space_id, 'Menú Diario', 19900, null, 'daily_menu', 0);

  insert into public.space_working_hours (space_id, calendar_kind, timezone, created_by)
  values
    (v_space_id, 'contractual', 'Europe/Madrid', v_owner_id),
    (v_space_id, 'support', 'Europe/Madrid', v_owner_id),
    (v_space_id, 'menu_diario', 'Europe/Madrid', v_owner_id);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id,
    v_owner_id,
    'space.created',
    'space',
    v_space_id,
    jsonb_build_object('name', 'Restavor', 'slug', 'restavor', 'via', 'create_restavor_space')
  );

  return v_space_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cuotly_space_usage(p_space_id uuid)
 RETURNS TABLE(active_establishments integer, internal_users integer, storage_bytes bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.has_capability(p_space_id, 'manage_space') or public.is_platform_subscription_manager()) then
    raise exception 'Solo el propietario del espacio o Restavor web ven el uso de la suscripción';
  end if;

  return query
    select
      (select count(*)::integer from public.establishments e
        where e.space_id = p_space_id and e.status <> 'archived'),
      (select count(*)::integer from public.space_memberships sm
        where sm.space_id = p_space_id and sm.status = 'active'),
      (select coalesce(sum(fv.size_bytes), 0)::bigint from public.file_versions fv
        where fv.space_id = p_space_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.decide_access_request(p_request_id uuid, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req public.access_requests;
begin
  if not public.is_platform_approver() then
    raise exception 'Solo Restavor web decide sobre una solicitud de acceso';
  end if;

  select * into v_req from public.access_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if p_status = 'approved' then
    raise exception 'Aprobar una solicitud de acceso se hace con approve_access_request()';
  end if;

  if not public.access_request_transition_allowed(v_req.status, p_status, 'platform') then
    raise exception 'Una solicitud en % no pasa a %', v_req.status, p_status;
  end if;

  -- RN-ACC-05 · rechazar sin decir por qué, o pedir información sin decir
  -- cuál, deja a alguien mirando una pared.
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Hace falta un motivo para pasar a %', p_status;
  end if;

  update public.access_requests
  set status = p_status,
      status_reason = btrim(p_reason),
      decided_at = case when p_status = 'rejected' then now() else decided_at end,
      decided_by = case when p_status = 'rejected' then auth.uid() else decided_by end,
      updated_at = now()
  where id = p_request_id;

  insert into public.access_request_events (request_id, from_status, to_status, actor_id, reason)
  values (p_request_id, v_req.status, p_status, auth.uid(), btrim(p_reason));

  -- El nombre de la acción va LITERAL y no compuesto con `|| p_status`:
  -- `audit.test.ts` lee las migraciones para comprobar que el catálogo de
  -- `src/core/audit.ts` conoce todo lo que la base escribe, y un nombre
  -- construido en tiempo de ejecución no se puede leer ahí.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (null, auth.uid(),
          case p_status
            when 'needs_information' then 'access_request.needs_information'
            when 'rejected' then 'access_request.rejected'
          end,
          'access_request', p_request_id,
          jsonb_build_object('status', v_req.status),
          jsonb_build_object('status', p_status), btrim(p_reason));

  perform public.queue_platform_email(
    case p_status
      when 'needs_information' then 'access_request_needs_information'
      when 'rejected' then 'access_request_rejected'
    end,
    v_req.email,
    jsonb_build_object('contact_name', v_req.contact_name,
                       'reason', btrim(p_reason),
                       'follow_up_token', v_req.follow_up_token),
    p_status || ':' || p_request_id::text || ':' || extract(epoch from now())::bigint::text
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.decide_space_request(p_request_id uuid, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req public.space_requests;
begin
  if not public.is_platform_approver() then
    raise exception 'Solo Restavor web decide sobre una solicitud de espacio';
  end if;

  select * into v_req from public.space_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if p_status = 'approved' then
    raise exception 'Aprobar una solicitud se hace con approve_space_request()';
  end if;

  if not public.space_request_transition_allowed(v_req.status, p_status, 'platform') then
    raise exception 'Una solicitud en % no pasa a %', v_req.status, p_status;
  end if;

  -- RN-PLA-06 · rechazar sin decir por qué, o pedir información sin decir
  -- cuál, deja a alguien mirando una pared.
  if p_status in ('needs_information', 'rejected')
     and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Hace falta un motivo para pasar a %', p_status;
  end if;

  update public.space_requests
  set status = p_status,
      status_reason = btrim(p_reason),
      decided_at = case when p_status = 'rejected' then now() else decided_at end,
      decided_by = case when p_status = 'rejected' then auth.uid() else decided_by end,
      updated_at = now()
  where id = p_request_id;

  insert into public.space_request_events (request_id, from_status, to_status, actor_id, reason)
  values (p_request_id, v_req.status, p_status, auth.uid(), btrim(p_reason));

  -- El nombre de la acción va LITERAL y no compuesto con `|| p_status`.
  -- Parece lo mismo y no lo es: `audit.test.ts` lee las migraciones para
  -- comprobar que el catálogo de `src/core/audit.ts` conoce todo lo que la
  -- base escribe, y un nombre construido en tiempo de ejecución no se
  -- puede leer ahí — ni encontrar con grep el día que alguien lo busque.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (null, auth.uid(),
          case p_status
            when 'in_review' then 'space_request.in_review'
            when 'needs_information' then 'space_request.needs_information'
            when 'rejected' then 'space_request.rejected'
          end,
          'space_request', p_request_id,
          jsonb_build_object('status', v_req.status), jsonb_build_object('status', p_status),
          btrim(p_reason));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.declare_cuotly_payment(p_charge_id uuid, p_amount_cents integer, p_method text, p_paid_at timestamp with time zone DEFAULT now(), p_receipt_reference text DEFAULT NULL::text, p_receipt_file_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_outstanding integer;
  v_payment_id uuid;
begin
  select space_id into v_space_id from public.cuotly_charges where id = p_charge_id for update;
  if v_space_id is null then
    raise exception 'Cobro de Restavor web no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio declara un pago a Restavor web';
  end if;

  if p_idempotency_key is not null then
    select id into v_payment_id from public.cuotly_payments
    where charge_id = p_charge_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  if p_method not in ('transfer', 'bizum') then
    raise exception 'Restavor web se paga por transferencia o Bizum (§4.5), no por %', p_method;
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe pagado debe ser mayor que cero';
  end if;

  v_outstanding := public.cuotly_charge_outstanding_cents(p_charge_id);
  if p_amount_cents > v_outstanding then
    raise exception 'El importe (%) supera la deuda viva del cobro (%)', p_amount_cents, v_outstanding;
  end if;

  if p_receipt_file_id is not null
     and (select f.space_id from public.files f where f.id = p_receipt_file_id) is distinct from v_space_id then
    raise exception 'El justificante pertenece a otro espacio';
  end if;

  insert into public.cuotly_payments
    (space_id, charge_id, amount_cents, method, paid_at, receipt_reference, receipt_file_id, note,
     declared_by, declared_side, idempotency_key)
  values
    (v_space_id, p_charge_id, p_amount_cents, p_method, p_paid_at, p_receipt_reference, p_receipt_file_id, p_note,
     auth.uid(), 'owner', p_idempotency_key)
  returning id into v_payment_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_space_id, auth.uid(), 'cuotly_payment.declared', 'cuotly_payment', v_payment_id,
          jsonb_build_object('charge_id', p_charge_id, 'amount_cents', p_amount_cents,
                             'method', p_method, 'paid_at', p_paid_at),
          p_note);

  return v_payment_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.declare_platform_status_event(p_component text, p_severity text, p_title text, p_body text DEFAULT NULL::text, p_started_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, declara el estado (§157, RN-SOP-13)';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Un evento de estado lleva título';
  end if;

  insert into public.platform_status_events (component, severity, title, body, started_at, created_by)
  values (p_component, p_severity, btrim(p_title), nullif(btrim(p_body), ''), coalesce(p_started_at, now()), auth.uid())
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (null, auth.uid(), 'platform_status.declared', 'platform_status_event', v_id,
          jsonb_build_object('component', p_component, 'severity', p_severity, 'title', btrim(p_title),
                             'started_at', coalesce(p_started_at, now())));
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.declare_security_incident(p_title text, p_body text DEFAULT NULL::text, p_severity text DEFAULT 'degraded'::text, p_component text DEFAULT 'auth'::text, p_space_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_space record;
  v_owner uuid;
  v_sent integer := 0;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, declara un incidente de seguridad (§142, RN-ADM-13)';
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
$function$
;

CREATE OR REPLACE FUNCTION public.end_support_session(p_session_id uuid, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_session public.support_sessions;
begin
  select * into v_session from public.support_sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'Sesión de soporte no encontrada';
  end if;
  -- Quien la abrió, o Bosco. Un Administrador de Restavor web no cierra la de
  -- otro: si hace falta, Bosco le retira el permiso (RN-ADM-03).
  if v_session.actor_id <> auth.uid() and not public.is_platform_owner() then
    raise exception 'Solo quien abrió la sesión de soporte, o el propietario de Restavor web, la cierra';
  end if;
  if v_session.ended_at is not null then
    return false; -- CA-17.
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason, support_session_id)
  values (v_session.space_id, auth.uid(), 'support.session_ended', 'support_session', v_session.id,
          jsonb_build_object('started_at', v_session.started_at, 'access_level', v_session.access_level),
          jsonb_build_object('ended_at', now(),
                             'duration_minutes', floor(extract(epoch from (least(now(), v_session.expires_at) - v_session.started_at)) / 60)),
          nullif(btrim(coalesce(p_note, '')), ''), v_session.id);

  update public.support_sessions
  set ended_at = now(), end_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_session.id;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_due_scheduled_jobs(p_run_after timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space record;
  v_kind text;
  v_hora text := to_char(p_run_after at time zone 'UTC', 'YYYYMMDDHH24');
  v_encolados integer := 0;
begin
  for v_space in select id, cuotly_plan from public.spaces loop
    foreach v_kind in array array[
      'monthly_charges',      -- RN-FIN-01
      'dunning_sweep',        -- RN-FIN-10 y RN-FIN-11
      'lifecycle_sweep',      -- RN-EST-09, RN-EST-10 y §6.4
      'consumption_sweep',    -- §18, avisos al 80 % y al 100 %
      'daily_menu_sweep',     -- RN-MEN-08 y §62
      'backup_sweep',         -- RN-BCK-02, una copia al día
      'charge_reminders',     -- RN-REC-02, el aviso del vencimiento
      -- RN-NOT-06 (migración 122) · el resumen diario. Se encola cada hora
      -- como todos los demás: la que decide si toca es la función del
      -- barrido, que mira si en ESE espacio son las ocho. Aquí no se sabe
      -- la zona de nadie, y preguntarla por espacio para ahorrarse una
      -- fila de cola sería poner la misma regla en dos sitios.
      'notification_digests'
    ]
    loop
      if public.enqueue_scheduled_job(
           v_space.id, v_kind, p_run_after,
           v_kind || ':' || v_space.id::text || ':' || v_hora) is not null then
        v_encolados := v_encolados + 1;
      end if;
    end loop;

    -- Los dos de plataforma, solo para los espacios con suscripción de
    -- Restavor web: el cobro (Hito 18) y el almacenamiento (RN-SUB-13, migración
    -- 95). Los dos van en el mismo bucle desde la 95 y siguen aquí — esta
    -- función se reescribe entera cada vez que crece la lista, así que
    -- copiar una versión vieja pierde en silencio lo que añadió la anterior.
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

CREATE OR REPLACE FUNCTION public.grant_establishment_access(p_establishment_id uuid, p_email text, p_role text, p_edit_establishment_data boolean DEFAULT false, p_view_billing boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_user_id uuid;
  v_membership_id uuid;
  v_previo public.establishment_memberships;
  v_edit boolean;
  v_billing boolean;
  v_slug text;
  v_tenia boolean;
begin
  v_space_id := public.establishment_space_id(p_establishment_id);

  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  -- RN-EST-15 · `consulta` se retiró el 19/09/2026: era un Editor con
  -- todos los permisos apagados.
  if p_role not in ('local_owner', 'editor') then
    raise exception 'El rol tiene que ser propietario del restaurante o editor';
  end if;

  -- RN-EST-17 · el equipo, o quien tenga "Usuarios y accesos" dentro del
  -- panel. Desde dentro no se toca al Propietario.
  perform public.assert_can_manage_access(p_establishment_id, p_role);

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(btrim(coalesce(p_email, '')));

  if v_user_id is null then
    -- No se crea nada a medias: en Restavor web se invita al espacio, no a un
    -- restaurante (HU-03), y una membresía apuntando a alguien que no
    -- existe no es un acceso, es una fila rota.
    raise exception 'No hay ninguna cuenta de Restavor web con ese correo: esta pantalla añade a quien ya existe';
  end if;

  -- RN-EST-11 y RN-FIN-07 · los permisos finos solo los elige un Editor.
  if p_role = 'local_owner' then
    v_edit := true;
    v_billing := true;
  else
    v_edit := coalesce(p_edit_establishment_data, false);
    v_billing := coalesce(p_view_billing, false);
  end if;

  select * into v_previo
  from public.establishment_memberships
  where establishment_id = p_establishment_id and user_id = v_user_id
  for update;

  v_tenia := v_previo.id is not null and v_previo.revoked_at is null;

  if v_previo.id is null then
    insert into public.establishment_memberships (establishment_id, user_id, role)
    values (p_establishment_id, v_user_id, p_role)
    returning id into v_membership_id;
  else
    -- Devolverle el acceso a quien lo tuvo NO es una fila nueva: la tabla
    -- tiene `unique (establishment_id, user_id)` y, sobre todo, la
    -- actividad histórica de esa persona cuelga de esta misma membresía
    -- (RN-EST-05). Se reactiva y se le pone el rol que se pide.
    v_membership_id := v_previo.id;
    update public.establishment_memberships
    set revoked_at = null, revoked_by = null, role = p_role
    where id = v_membership_id;
  end if;

  insert into public.establishment_permissions
    (establishment_membership_id, edit_establishment_data, view_billing)
  values (v_membership_id, v_edit, v_billing)
  on conflict (establishment_membership_id) do update
    set edit_establishment_data = excluded.edit_establishment_data,
        view_billing = excluded.view_billing;

  insert into public.audit_log
    (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'establishment_access.granted', 'establishment', p_establishment_id,
    case
      when v_previo.id is null then jsonb_build_object('user_id', v_user_id, 'had_access', false)
      else jsonb_build_object('user_id', v_user_id, 'had_access', v_previo.revoked_at is null,
                              'role', v_previo.role)
    end,
    jsonb_build_object('user_id', v_user_id, 'had_access', true, 'role', p_role,
                       'edit_establishment_data', v_edit, 'view_billing', v_billing)
  );

  -- RN-PAN-12 · se avisa a quien RECIBE el acceso, no al equipo: es quien
  -- tiene algo que hacer con esto.
  --
  -- A quien ya lo tenía no se le avisa: cambiarle el rol o repasarle los
  -- permisos no es "te han dado acceso", y pulsar Guardar dos veces en la
  -- pantalla de accesos no puede mandarle dos correos (CLAUDE.md: pulsar
  -- dos veces nunca duplica el efecto).
  --
  -- **La clave de deduplicación es de un solo uso a propósito**, y esto
  -- tiene dos historias detrás que conviene no repetir.
  --
  -- La primera versión llevaba `…:<restaurante>:<persona>` y la suite 54 la
  -- tumbó: a quien se le revocaba el acceso y luego se le devolvía **no se
  -- le avisaba**, porque la clave seguía gastada del primer aviso. Se
  -- habría quedado sin saber que puede volver a entrar.
  --
  -- La segunda versión la puso a `null`, y eso es peor: `dedupe_key` es
  -- **NOT NULL**, y `emit_notification()` se traga el fallo —su
  -- `on conflict ... do nothing` lo absorbe— y devuelve `null` **sin dar
  -- error**. El aviso no se crea y nada lo dice. Si alguna vez un aviso no
  -- aparece y no hay error en ningún sitio, mira esto primero.
  --
  -- Lo que de verdad impide el doble aviso no es la clave: es `v_tenia`,
  -- que se lee **dentro del `for update`** de la membresía, así que dos
  -- llamadas a la vez se ponen en fila y solo una ve el paso de "sin
  -- acceso" a "con acceso". Las claves sirven a los barridos, que se
  -- repiten solos; esto no se repite solo, lo pulsa una persona.
  if not v_tenia then
    select slug into v_slug from public.spaces where id = v_space_id;

    perform public.emit_notification(
      v_space_id, v_user_id, 'establishment_access_granted', 'client',
      'establishment', p_establishment_id,
      '/espacios/' || v_slug || '/restaurantes/' || p_establishment_id::text,
      'establishment_access_granted:' || gen_random_uuid()::text,
      p_establishment_id, null, null, true);
  end if;

  return v_membership_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grant_group_future_establishments_access(p_group_id uuid, p_email text, p_role text DEFAULT 'editor'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_user_id uuid;
  v_previo record;
  v_membership_id uuid;
begin
  select space_id into v_space_id from public.groups where id = p_group_id;

  if v_space_id is null then
    raise exception 'Grupo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden dar acceso a un grupo';
  end if;

  if p_role is distinct from 'editor' then
    raise exception 'El acceso a todos los restaurantes del grupo, incluidos los futuros, solo existe para un Editor (RN-EST-04)';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(btrim(coalesce(p_email, '')));

  if v_user_id is null then
    raise exception 'No hay ninguna cuenta de Restavor web con ese correo: esta pantalla añade a quien ya existe';
  end if;

  -- La unicidad es de los accesos VIVOS (índice parcial de la 39), así que
  -- puede haber varias filas retiradas de la misma persona: se reutiliza
  -- la viva si la hay y, si no, la última retirada.
  select * into v_previo
  from public.group_memberships
  where group_id = p_group_id and user_id = v_user_id
  order by (revoked_at is null) desc, created_at desc
  limit 1
  for update;

  if v_previo.id is not null and v_previo.revoked_at is null then
    if v_previo.role = 'global_owner' then
      raise exception 'Ya es propietario global del grupo: tiene ese acceso y más, y dar acceso no puede rebajarlo (RN-EST-03)';
    end if;
    -- Ya es editor de grupo. Idempotente: ni fila nueva ni segundo apunte.
    return v_previo.id;
  end if;

  if v_previo.id is null then
    insert into public.group_memberships (group_id, user_id, role)
    values (p_group_id, v_user_id, 'editor')
    returning id into v_membership_id;
  else
    v_membership_id := v_previo.id;
    update public.group_memberships
    set revoked_at = null, revoked_by = null, role = 'editor'
    where id = v_membership_id;
  end if;

  insert into public.audit_log
    (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'group_access.granted', 'group', p_group_id,
    case
      when v_previo.id is null then jsonb_build_object('user_id', v_user_id, 'had_access', false)
      else jsonb_build_object('user_id', v_user_id, 'had_access', false, 'role', v_previo.role)
    end,
    jsonb_build_object('user_id', v_user_id, 'email', lower(btrim(p_email)), 'had_access', true,
                       'role', 'editor', 'future_establishments', true)
  );

  return v_membership_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_cuotly_establishment_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_limit integer;
  v_count integer;
begin
  if tg_op = 'INSERT' and new.status = 'archived' then
    return new;
  end if;
  if tg_op = 'UPDATE' and not (old.status = 'archived' and new.status <> 'archived') then
    return new;
  end if;

  select l.max_establishments into v_limit from public.cuotly_space_limits(new.space_id) l;
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_count from public.establishments e
  where e.space_id = new.space_id and e.status <> 'archived' and e.id <> new.id;

  if v_count >= v_limit then
    raise exception 'El plan de Restavor web de este espacio admite % establecimientos activos; para tener más hay que contratar un establecimiento adicional (§4.1) o archivar uno', v_limit;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_cuotly_user_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_limit integer;
  v_count integer;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  select l.max_users into v_limit from public.cuotly_space_limits(new.space_id) l;
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_count from public.space_memberships sm
  where sm.space_id = new.space_id and sm.status = 'active' and sm.id <> new.id;

  if v_count >= v_limit then
    raise exception 'El plan de Restavor web de este espacio admite % usuarios internos; para tener más hay que contratar un usuario adicional (§4.1)', v_limit;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_establishment_permanently_deleted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.permanently_deleted_at is distinct from old.permanently_deleted_at
     and (old.permanently_deleted_at is not null
          or coalesce(current_setting('cuotly.platform_change', true), '') <> 'on') then
    raise exception 'Solo Restavor web elimina definitivamente un restaurante, y eso no se deshace (RN-ADM-24)';
  end if;

  if old.permanently_deleted_at is not null
     and (new.status is distinct from old.status
          or new.platform_archived_at is distinct from old.platform_archived_at) then
    raise exception 'Este restaurante lo eliminó Restavor web definitivamente: ya no se recupera (RN-ADM-24)';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_platform_archived_establishment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.platform_archived_at is distinct from old.platform_archived_at
     and coalesce(current_setting('cuotly.platform_change', true), '') <> 'on' then
    raise exception 'Solo Restavor web elimina o recupera un restaurante desde su panel (RN-ADM-17)';
  end if;

  if old.platform_archived_at is not null and new.platform_archived_at is not null
     and new.status is distinct from old.status then
    raise exception 'Este restaurante lo eliminó Restavor web: solo Restavor web lo recupera (RN-ADM-17)';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_space_cuotly_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('cuotly.space_status_change', true), '') = 'on' then
    return new;
  end if;

  if new.cuotly_status is distinct from old.cuotly_status
     or new.cuotly_plan is distinct from old.cuotly_plan
     or new.cuotly_trial_ends_at is distinct from old.cuotly_trial_ends_at
     or new.cuotly_archived_at is distinct from old.cuotly_archived_at
     or new.cuotly_reactivation_deadline_at is distinct from old.cuotly_reactivation_deadline_at
     or new.cuotly_deletion_scheduled_at is distinct from old.cuotly_deletion_scheduled_at
     or new.cuotly_status_changed_at is distinct from old.cuotly_status_changed_at then
    raise exception 'La suscripción de Restavor web de un espacio se mueve con sus funciones, que la auditan';
  end if;

  -- RN-SUB-08 · el espacio mismo también es de solo lectura (renombrarlo,
  -- cambiar la zona horaria) mientras está archivado, y desde el Hito 20
  -- eso incluye el archivado de su propio dueño.
  if auth.uid() is not null and public.space_status_is_archived(old.cuotly_status) then
    raise exception 'Este espacio está archivado y es de solo lectura: se puede pagar, exportar y contactar con soporte (§4.6, §127)';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_space_permanently_deleted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.permanently_deleted_at is distinct from old.permanently_deleted_at
     and (old.permanently_deleted_at is not null
          or coalesce(current_setting('cuotly.platform_change', true), '') <> 'on') then
    raise exception 'Solo Restavor web elimina definitivamente un espacio, y eso no se deshace (RN-ADM-24)';
  end if;

  if old.permanently_deleted_at is not null
     and new.cuotly_status is distinct from old.cuotly_status then
    raise exception 'Este espacio lo eliminó Restavor web definitivamente: ya no se recupera (RN-ADM-24)';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_capability_as(p_space_id uuid, p_user_id uuid, p_capability text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role public.space_role;
  v_can_perform_jobs boolean;
  v_can_approve_reports boolean;
  v_support text;
begin
  -- RN-ADM-24 · un espacio eliminado definitivamente ya no lo ve nadie: ni su equipo ni Modo soporte.
  if public.space_is_gone(p_space_id) then
    return false;
  end if;

  select sm.role, sm.can_perform_jobs, sm.can_approve_reports
  into v_role, v_can_perform_jobs, v_can_approve_reports
  from public.space_memberships sm
  where sm.space_id = p_space_id
    and sm.user_id = p_user_id
    and sm.status = 'active';

  if v_role is null and p_user_id = auth.uid() then
    v_support := public.support_access_level(p_space_id);
    -- RN-ADM-07 · `read` no tiene NINGUNA capacidad; `admin` opera como un
    -- administrador sin permisos concedidos; `owner`, como el propietario.
    if v_support in ('admin', 'owner') then
      v_role := v_support::public.space_role;
      v_can_perform_jobs := false;
      v_can_approve_reports := false;
    end if;
  end if;

  if v_role is null then
    return false;
  end if;

  return case p_capability
    when 'manage_space' then v_role = 'owner'
    -- RN-ADM-07 · lo único que Modo soporte no puede hacer ni como
    -- propietario: dejar a alguien dentro cuando la sesión acabe.
    when 'invite_member' then v_role = 'owner' and v_support is null
    when 'create_establishment' then v_role in ('owner', 'admin')
    when 'manage_clients' then v_role in ('owner', 'admin')
    when 'view_team' then true
    when 'manage_holidays' then v_role in ('owner', 'admin')
    when 'manage_requests' then v_role in ('owner', 'admin')
    when 'assign_jobs' then v_role in ('owner', 'admin')
    when 'perform_jobs' then
      v_role = 'worker'
      or v_role = 'owner'
      or (v_role = 'admin' and coalesce(v_can_perform_jobs, false))
    when 'manage_finance' then v_role in ('owner', 'admin')
    -- RN-SOP-01 · abrir una incidencia a Restavor web: propietario y
    -- administrador, y NUNCA una sesión de Modo soporte, ni en nivel
    -- `owner`: hablar con Restavor web en nombre de un espacio ajeno es lo que
    -- RN-ADM-07 prohíbe con invitar, un piso más arriba.
    when 'contact_cuotly' then v_role in ('owner', 'admin') and v_support is null
    when 'manage_files' then v_role in ('owner', 'admin', 'worker')
    when 'manage_absences' then v_role in ('owner', 'admin')
    when 'approve_reports' then
      v_role = 'owner'
      or (v_role = 'admin' and coalesce(v_can_approve_reports, false))
    else false
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invite_to_establishment_panel(p_establishment_id uuid, p_email text, p_role text, p_edit_establishment_data boolean DEFAULT false, p_view_billing boolean DEFAULT false, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user_id uuid;
  v_id uuid;
  v_equipo boolean;
  v_estado text;
  v_slug text;
  v_persona uuid;
begin
  v_space_id := public.establishment_space_id(p_establishment_id);
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Hace falta un correo para invitar';
  end if;

  if p_role not in ('local_owner', 'editor') then
    raise exception 'El rol tiene que ser propietario del restaurante o editor';
  end if;

  -- RN-EST-17 · los mismos permisos que dar un acceso, ni uno más: el
  -- equipo, o quien tenga "Usuarios y accesos" dentro del panel. Desde
  -- dentro no se toca al Propietario. Esta es la comprobación que hace que
  -- la tercera puerta no sea más ancha que la que ya había.
  perform public.assert_can_manage_access(p_establishment_id, p_role);

  -- CA-17 · pulsar dos veces devuelve lo mismo y no manda dos enlaces.
  if p_idempotency_key is not null then
    select id into v_id
    from public.establishment_invitations
    where establishment_id = p_establishment_id and idempotency_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  -- CAMINO 1 · ya tiene cuenta. No hay invitación ni aprobación que
  -- valga: meter a alguien que ya está dentro de Restavor web nunca necesitó
  -- permiso de nadie (RN-PAN-14).
  select id into v_user_id from public.profiles where lower(email) = v_email;
  if v_user_id is not null then
    perform public.grant_establishment_access(
      p_establishment_id, v_email, p_role, p_edit_establishment_data, p_view_billing);
    return null;
  end if;

  -- CAMINO 2 · no tiene cuenta. Se crea la invitación.
  --
  -- Si la manda el equipo del espacio, nace aprobada: pedirle al espacio
  -- que apruebe su propia invitación no es un control, es una pantalla de
  -- más (RN-PAN-14). La aprobación existe para cuando invita el
  -- restaurante.
  v_equipo := public.has_capability(v_space_id, 'manage_clients');
  v_estado := case when v_equipo then 'approved' else 'pending_review' end;

  insert into public.establishment_invitations (
    space_id, establishment_id, email, role, edit_establishment_data, view_billing,
    status, expires_at, invited_by, reviewed_by, reviewed_at, idempotency_key
  )
  values (
    v_space_id, p_establishment_id, v_email, p_role,
    -- RN-EST-11 · un propietario del restaurante los lleva los dos; los
    -- finos solo se eligen para un Editor.
    case when p_role = 'local_owner' then true else coalesce(p_edit_establishment_data, false) end,
    case when p_role = 'local_owner' then true else coalesce(p_view_billing, false) end,
    v_estado,
    -- Los siete días de HU-03, y corriendo desde ya solo si nace aprobada.
    case when v_equipo then now() + interval '7 days' end,
    auth.uid(),
    case when v_equipo then auth.uid() end,
    case when v_equipo then now() end,
    p_idempotency_key
  )
  returning id into v_id;

  perform public.record_state_event(
    v_space_id, 'establishment_invitation', v_id, null, v_estado, null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'panel_invitation.created', 'establishment_invitation', v_id,
          jsonb_build_object('establishment_id', p_establishment_id, 'role', p_role,
                             'status', v_estado));

  -- Al equipo se le avisa solo de lo que tiene que mirar. Una invitación
  -- que nace aprobada no la tiene que mirar nadie.
  if not v_equipo then
    select slug into v_slug from public.spaces where id = v_space_id;
    for v_persona in
      select m.user_id
      from public.space_memberships m
      where m.space_id = v_space_id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    loop
      perform public.emit_notification(
        v_space_id, v_persona, 'panel_invitation_pending_review', 'team',
        'establishment_invitation', v_id,
        '/espacios/' || v_slug || '/restaurantes/' || p_establishment_id::text || '/usuarios',
        'panel_invitation_pending_review:' || v_id::text,
        p_establishment_id, null, null, true);
    end loop;
  end if;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.issue_cuotly_charge_internal(p_subscription_id uuid, p_kind text, p_concept text, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_due_at timestamp with time zone, p_base_cents integer, p_breakdown jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_tax_rate numeric(5, 2) := public.cuotly_constant('tax_rate_percent');
  v_tax_cents integer;
  v_charge_id uuid;
begin
  select space_id into v_space_id from public.cuotly_subscriptions where id = p_subscription_id;
  if v_space_id is null then
    raise exception 'Suscripción de Restavor web no encontrada';
  end if;

  -- Decisión 7: a dos decimales, en céntimos.
  v_tax_cents := round(p_base_cents * v_tax_rate / 100)::integer;

  insert into public.cuotly_charges
    (space_id, subscription_id, kind, concept, reference, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, breakdown, due_at)
  values
    (v_space_id, p_subscription_id, p_kind, p_concept, public.cuotly_charge_reference(v_space_id),
     p_period_start, p_period_end, p_base_cents, v_tax_rate, v_tax_cents,
     p_base_cents + v_tax_cents, p_breakdown, p_due_at)
  returning id into v_charge_id;

  if p_base_cents + v_tax_cents > 0 then
    insert into public.cuotly_ledger_entries
      (space_id, charge_id, entry_type, amount_cents, reason, created_by)
    values
      (v_space_id, v_charge_id, 'charge', p_base_cents + v_tax_cents, p_concept, auth.uid());
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'cuotly_charge.issued', 'cuotly_charge', v_charge_id,
          jsonb_build_object('kind', p_kind, 'total_cents', p_base_cents + v_tax_cents,
                             'due_at', p_due_at, 'breakdown', p_breakdown));

  return v_charge_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.issue_cuotly_period_charge_internal(p_subscription_id uuid, p_period_start timestamp with time zone, p_period_end timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sub public.cuotly_subscriptions;
  v_tz text;
  v_plan text;
  v_extra_est integer;
  v_extra_users integer;
  v_base integer;
  v_terms record;
begin
  select * into v_sub from public.cuotly_subscriptions where id = p_subscription_id;
  select timezone into v_tz from public.spaces where id = v_sub.space_id;

  -- RN-SUB-11 · con un cambio a Pro programado, la mensualidad ya sale con
  -- Pro y con los adicionales con los que se programó.
  if v_sub.pending_plan is not null then
    v_plan := v_sub.pending_plan;
    v_extra_est := v_sub.pending_extra_establishments;
    v_extra_users := v_sub.pending_extra_users;
  else
    v_plan := v_sub.plan;
    v_extra_est := v_sub.extra_establishments;
    v_extra_users := v_sub.extra_users;
  end if;

  select * into v_terms from public.cuotly_plan_terms(v_plan);
  v_base := public.cuotly_monthly_base_cents(v_plan, v_extra_est, v_extra_users);

  return public.issue_cuotly_charge_internal(
    p_subscription_id, 'period',
    'Restavor web ' || initcap(v_plan) || ' · del '
      || to_char(p_period_start at time zone v_tz, 'DD/MM/YYYY') || ' al '
      || to_char(p_period_end at time zone v_tz, 'DD/MM/YYYY'),
    p_period_start, p_period_end, p_period_start, v_base,
    jsonb_build_object(
      'plan', v_plan, 'plan_cents', v_terms.price_cents,
      'extra_establishments', v_extra_est,
      'extra_establishment_cents', coalesce(v_terms.extra_establishment_cents, 0),
      'extra_users', v_extra_users,
      'extra_user_cents', coalesce(v_terms.extra_user_cents, 0)));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.open_incident(p_space_id uuid, p_kind text, p_category text, p_description text, p_impact text DEFAULT NULL::text, p_device text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text, p_client_context jsonb DEFAULT '{}'::jsonb, p_help_query text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_id uuid;
  v_context jsonb;
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión para abrir una incidencia';
  end if;

  -- La clave, antes del permiso (RN-SOP-14): el segundo clic recibe la
  -- misma respuesta que el primero. Acotada a quien la abrió.
  if p_idempotency_key is not null then
    select id into v_existing from public.incidents
    where space_id = p_space_id and idempotency_key = p_idempotency_key and opened_by = v_actor;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if not public.has_capability(p_space_id, 'contact_cuotly') then
    raise exception 'Solo el propietario o un administrador del espacio abren una incidencia a Restavor web (§131, RN-SOP-01)';
  end if;
  if p_kind not in ('error', 'suggestion') then
    raise exception 'Una incidencia es un error o una sugerencia (§133), no %', p_kind;
  end if;
  if p_kind = 'error' and (p_impact is null or p_impact not in ('low', 'medium', 'high', 'critical')) then
    raise exception 'Un error lleva impacto: bajo, medio, alto o crítico (§131, RN-SOP-03)';
  end if;
  if p_kind = 'suggestion' and p_impact is not null then
    raise exception 'Una sugerencia no lleva impacto (RN-SOP-02)';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'Hace falta una descripción';
  end if;

  -- Solo las cuatro claves que §131 nombra; lo demás, aunque llegue, no
  -- entra. "Informando al usuario" lo hace la pantalla antes de enviar.
  v_context := jsonb_strip_nulls(jsonb_build_object(
    'browser', p_client_context ->> 'browser',
    'os', p_client_context ->> 'os',
    'screen', p_client_context ->> 'screen',
    'error', p_client_context ->> 'error'));

  insert into public.incidents
    (space_id, opened_by, kind, category, description, impact, device, app_version,
     client_context, help_query, idempotency_key)
  values
    (p_space_id, v_actor, p_kind, p_category, btrim(p_description), p_impact,
     nullif(btrim(p_device), ''), nullif(btrim(p_app_version), ''),
     v_context, nullif(btrim(p_help_query), ''), p_idempotency_key)
  returning id into v_id;

  insert into public.incident_events (space_id, incident_id, from_status, to_status, actor_id, actor_side)
  values (p_space_id, v_id, null, 'open', v_actor, 'space');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (p_space_id, v_actor, 'incident.opened', 'incident', v_id,
          jsonb_build_object('kind', p_kind, 'category', p_category, 'impact', p_impact,
                             'from_help_query', p_help_query is not null));

  perform public.notify_platform_incident(v_id, 'incident_opened', 'incident_opened:' || v_id::text);

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_account_deletion_preview(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;
  v_spaces jsonb;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Restavor web o un Administrador de Restavor web con permiso para eliminar elimina una cuenta (RN-ADM-14)';
  end if;

  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    raise exception 'Esa cuenta no existe';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'space_id', s.id,
           'space_name', s.name,
           'candidates', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'user_id', c.user_id,
                      'name', coalesce(nullif(btrim(p.full_name), ''), p.email),
                      'role', c.role)
                    order by case c.role when 'admin' then 0 else 1 end,
                             coalesce(nullif(btrim(p.full_name), ''), p.email)), '[]'::jsonb)
             from public.space_memberships c
             join public.profiles p on p.id = c.user_id
             where c.space_id = s.id and c.status = 'active' and c.user_id <> p_user_id
               -- RN-ADM-19 · los administradores; los trabajadores, solo
               -- si no hay ninguno.
               and (c.role = 'admin'
                    or (c.role = 'worker' and not exists (
                          select 1 from public.space_memberships a
                          where a.space_id = s.id and a.status = 'active' and a.role = 'admin'
                            and a.user_id <> p_user_id))))
         ) order by s.name), '[]'::jsonb)
  into v_spaces
  from public.space_memberships sm
  join public.spaces s on s.id = sm.space_id
  where sm.user_id = p_user_id and sm.status = 'active' and sm.role = 'owner'
    and not exists (
      select 1 from public.space_memberships o
      where o.space_id = sm.space_id and o.role = 'owner' and o.status = 'active'
        and o.user_id <> p_user_id);

  return jsonb_build_object(
    'email', v_email,
    -- RN-ADM-20 · Bosco no se elimina nunca; un Administrador de Restavor web,
    -- solo si quien elimina es Bosco, que le retira el rol en el mismo acto.
    'protected', lower(v_email) = lower('info@restavor.com')
                 or (exists (select 1 from public.platform_roles pr where pr.user_id = p_user_id)
                     and not public.is_platform_owner()),
    'platform_admin', exists (select 1 from public.platform_roles pr where pr.user_id = p_user_id),
    'closed', exists (select 1 from public.platform_account_closures c
                      where c.user_id = p_user_id and c.restored_at is null),
    'sole_owner_spaces', v_spaces,
    'team_memberships', (select count(*) from public.space_memberships sm
                         where sm.user_id = p_user_id and sm.status in ('active', 'temporarily_absent')),
    'client_accesses', (select count(*) from public.establishment_memberships em
                        where em.user_id = p_user_id and em.revoked_at is null)
                     + (select count(*) from public.group_memberships gm
                        where gm.user_id = p_user_id and gm.revoked_at is null)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_audit(p_scope text DEFAULT 'platform'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, space_id uuid, space_name text, actor_id uuid, actor_email text, action text, entity_type text, entity_id uuid, old_value jsonb, new_value jsonb, reason text, support_session_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;
  if p_scope not in ('platform', 'all') then
    raise exception 'Ámbito desconocido: platform o all';
  end if;

  return query
    select a.id, a.created_at, a.space_id, s.name,
      a.actor_id, p.email, a.action, a.entity_type, a.entity_id,
      a.old_value, a.new_value, a.reason, a.support_session_id
    from public.audit_log a
    left join public.spaces s on s.id = a.space_id
    left join public.profiles p on p.id = a.actor_id
    where p_scope = 'all'
       or a.space_id is null
       or split_part(a.action, '.', 1) in ('space_request', 'cuotly_charge', 'cuotly_payment', 'support', 'platform', 'incident')
    order by a.created_at desc
    limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_delete_account(p_user_id uuid, p_reason text, p_successors jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_existing public.platform_account_closures;
  v_sm record;
  v_successor uuid;
  v_how text;
  v_requested text;
  v_memberships jsonb := '[]'::jsonb;
  v_transfers jsonb := '[]'::jsonb;
  v_archived jsonb := '[]'::jsonb;
  v_establishment_ids jsonb;
  v_group_ids jsonb;
  v_details jsonb;
  v_op_id uuid;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Restavor web o un Administrador de Restavor web con permiso para eliminar elimina una cuenta (RN-ADM-14)';
  end if;

  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    raise exception 'Esa cuenta no existe';
  end if;

  -- RN-ADM-20 · la plataforma no se elimina a sí misma.
  if lower(v_email) = lower('info@restavor.com') then
    raise exception 'La cuenta del propietario de Restavor web no se elimina (RN-ADM-20)';
  end if;
  -- RN-ADM-20 · a un Administrador de Restavor web solo lo elimina Bosco, que le
  -- retira el rol en el mismo acto (más abajo, ya pasado el motivo).
  if exists (select 1 from public.platform_roles pr where pr.user_id = p_user_id)
     and not public.is_platform_owner() then
    raise exception 'Es Administrador de Restavor web: solo el propietario de Restavor web lo elimina, retirándole el rol (RN-ADM-03, RN-ADM-20)';
  end if;

  -- CA-17 · antes que el motivo: el segundo clic no es un error.
  select * into v_existing from public.platform_account_closures
  where user_id = p_user_id and restored_at is null;
  if v_existing.id is not null then
    return v_existing.details || jsonb_build_object('already_closed', true);
  end if;

  if v_reason = '' then
    raise exception 'Eliminar una cuenta exige motivo (§140, RN-ADM-15)';
  end if;

  -- RN-ADM-20 · Bosco elimina a un Administrador de Restavor web: primero le
  -- retira el rol, con su propio apunte (`platform.admin_revoked`).
  if exists (select 1 from public.platform_roles pr where pr.user_id = p_user_id) then
    perform public.revoke_platform_admin(p_user_id);
  end if;

  -- Los espacios archivados son de solo lectura para las personas; esto
  -- es la plataforma cerrando una cuenta (RN-ADM-16).
  perform set_config('cuotly.space_status_change', 'on', true);
  perform set_config('cuotly.membership_end_reason', v_reason, true);

  -- RN-ADM-19 · de cada espacio del que es la única propietaria, la
  -- propiedad pasa a quien se eligió o, si no, a un administrador al azar
  -- y, si no hay, a un trabajador al azar.
  for v_sm in
    select sm.space_id
    from public.space_memberships sm
    where sm.user_id = p_user_id and sm.status = 'active' and sm.role = 'owner'
      and not exists (
        select 1 from public.space_memberships o
        where o.space_id = sm.space_id and o.role = 'owner' and o.status = 'active'
          and o.user_id <> p_user_id)
    order by sm.space_id
    for update
  loop
    v_successor := null;
    v_requested := p_successors ->> v_sm.space_id::text;

    if v_requested is not null and v_requested <> '' then
      -- Se elige entre los administradores; entre los trabajadores, solo
      -- si el espacio no tiene ningún administrador (RN-ADM-19).
      select c.user_id into v_successor
      from public.space_memberships c
      where c.space_id = v_sm.space_id and c.user_id = v_requested::uuid
        and c.status = 'active' and c.user_id <> p_user_id
        and (c.role = 'admin'
             or (c.role = 'worker' and not exists (
                   select 1 from public.space_memberships a
                   where a.space_id = v_sm.space_id and a.status = 'active' and a.role = 'admin'
                     and a.user_id <> p_user_id)));
      if v_successor is null then
        raise exception 'El espacio pasa a un administrador de su equipo en activo, y a un trabajador solo si no hay ningún administrador (RN-ADM-19)';
      end if;
      v_how := 'selected';
    else
      select c.user_id into v_successor
      from public.space_memberships c
      where c.space_id = v_sm.space_id and c.status = 'active' and c.role = 'admin'
        and c.user_id <> p_user_id
      order by random() limit 1;
      v_how := 'random_admin';

      if v_successor is null then
        select c.user_id into v_successor
        from public.space_memberships c
        where c.space_id = v_sm.space_id and c.status = 'active' and c.role = 'worker'
          and c.user_id <> p_user_id
        order by random() limit 1;
        v_how := 'random_worker';
      end if;
    end if;

    if v_successor is null then
      -- Nadie más en el equipo: no hay a quién pasar el espacio. Se
      -- elimina con la cuenta y la pertenencia se queda como estaba, para
      -- que al recuperarla vuelva entero (RN-ADM-19).
      perform public.platform_set_space_archived_internal(v_sm.space_id, true, v_reason);
      v_archived := v_archived || to_jsonb(v_sm.space_id::text);
      continue;
    end if;

    update public.space_memberships set role = 'owner'
    where space_id = v_sm.space_id and user_id = v_successor;

    insert into public.space_lifecycle_operations
      (space_id, kind, actor_id, from_owner_id, to_owner_id, reason)
    values (v_sm.space_id, 'ownership_transferred', v_actor, p_user_id, v_successor, v_reason)
    returning id into v_op_id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
    values (v_sm.space_id, v_actor, 'space.ownership_transferred', 'space', v_sm.space_id,
            jsonb_build_object('owner_id', p_user_id),
            jsonb_build_object('owner_id', v_successor, 'cause', 'account_deleted', 'chosen', v_how),
            v_reason);

    perform public.notify_space_lifecycle_event(
      v_sm.space_id, 'space_ownership_transferred',
      'space_ownership_transferred:' || v_op_id::text);

    v_transfers := v_transfers || jsonb_build_object(
      'space_id', v_sm.space_id, 'to_user_id', v_successor, 'how', v_how);
  end loop;

  -- RN-ADM-18 · sale de todos los equipos, con las consecuencias de la 139.
  for v_sm in
    select sm.space_id, sm.role, sm.status
    from public.space_memberships sm
    where sm.user_id = p_user_id and sm.status in ('active', 'temporarily_absent', 'invited')
      and not (v_archived ? sm.space_id::text)
    order by sm.space_id
    for update
  loop
    update public.space_memberships set status = 'access_revoked'
    where space_id = v_sm.space_id and user_id = p_user_id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
    values (v_sm.space_id, v_actor, 'membership.access_revoked', 'space_membership', p_user_id,
            jsonb_build_object('status', v_sm.status, 'role', v_sm.role),
            jsonb_build_object('status', 'access_revoked', 'role', v_sm.role, 'cause', 'account_deleted'),
            v_reason);

    v_memberships := v_memberships || jsonb_build_object(
      'space_id', v_sm.space_id, 'role', v_sm.role, 'status', v_sm.status);
  end loop;

  -- RN-ADM-18 · y de todos los restaurantes y grupos a los que tenía acceso.
  with r as (
    update public.establishment_memberships
    set revoked_at = now(), revoked_by = v_actor
    where user_id = p_user_id and revoked_at is null
    returning id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_establishment_ids from r;

  with r as (
    update public.group_memberships
    set revoked_at = now(), revoked_by = v_actor
    where user_id = p_user_id and revoked_at is null
    returning id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_group_ids from r;

  update public.push_devices
  set revoked_at = now(), revoked_reason = 'account_deleted'
  where user_id = p_user_id and revoked_at is null;

  perform set_config('cuotly.membership_end_reason', '', true);
  perform set_config('cuotly.space_status_change', 'off', true);

  -- RN-ADM-18 · no vuelve a entrar, y lo que tenía abierto se cierra.
  update auth.users set banned_until = now() + interval '100 years' where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;

  v_details := jsonb_build_object(
    'memberships', v_memberships,
    'transfers', v_transfers,
    'archived_spaces', v_archived,
    'establishment_memberships', v_establishment_ids,
    'group_memberships', v_group_ids);

  insert into public.platform_account_closures (user_id, actor_id, reason, details)
  values (p_user_id, v_actor, v_reason, v_details)
  returning id into v_op_id;

  -- RN-ADM-21 · se le avisa: "Su cuenta ha sido eliminada". Por correo,
  -- porque ya no puede entrar a leer un aviso dentro de Restavor web. La clave
  -- lleva el cierre: si se recupera y se vuelve a eliminar, vuelve a
  -- avisar; pulsar dos veces, no.
  perform public.queue_platform_email(
    'account_deleted', v_email, '{}'::jsonb, 'account_deleted:' || v_op_id::text);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, v_actor, 'platform.account_deleted', 'profile', p_user_id, v_details, v_reason);

  return v_details || jsonb_build_object('already_closed', false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_delete_establishment(p_establishment_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_status text;
  v_flag timestamptz;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Restavor web o un Administrador de Restavor web con permiso para eliminar elimina un restaurante (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Eliminar un restaurante exige motivo (§140, RN-ADM-15)';
  end if;

  select space_id, status, platform_archived_at into v_space_id, v_status, v_flag
  from public.establishments where id = p_establishment_id for update;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if v_flag is not null then
    return false; -- CA-17.
  end if;

  -- La solo lectura de un espacio archivado es para las personas que
  -- trabajan en él; esto es la plataforma cerrando algo (RN-ADM-16).
  perform set_config('cuotly.space_status_change', 'on', true);
  perform public.set_establishment_status_internal(p_establishment_id, 'archived', btrim(p_reason));

  perform set_config('cuotly.platform_change', 'on', true);
  update public.establishments set platform_archived_at = now() where id = p_establishment_id;
  perform set_config('cuotly.platform_change', 'off', true);
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.archived_by_platform', 'establishment', p_establishment_id,
          jsonb_build_object('status', v_status), jsonb_build_object('status', 'archived'), btrim(p_reason));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, auth.uid(), 'platform.establishment_deleted', 'establishment', p_establishment_id,
          jsonb_build_object('space_id', v_space_id, 'status', v_status), btrim(p_reason));

  perform public.notify_establishment_deleted_by_platform(p_establishment_id);
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_delete_establishment_permanently(p_establishment_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_status text;
  v_flag timestamptz;
  v_gone timestamptz;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Restavor web o un Administrador de Restavor web con permiso para eliminar elimina un restaurante (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Eliminar un restaurante exige motivo (§140, RN-ADM-15)';
  end if;

  select space_id, status, platform_archived_at, permanently_deleted_at
  into v_space_id, v_status, v_flag, v_gone
  from public.establishments where id = p_establishment_id for update;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if v_gone is not null then
    return false; -- CA-17.
  end if;
  if v_status <> 'archived' then
    raise exception 'Solo se elimina definitivamente lo que está en Archivados: archívalo antes (RN-ADM-24)';
  end if;

  -- Con la marca de Restavor web, el equipo tampoco lo reactiva (RN-ADM-17).
  perform set_config('cuotly.space_status_change', 'on', true);
  perform set_config('cuotly.platform_change', 'on', true);
  update public.establishments
  set platform_archived_at = coalesce(platform_archived_at, now()),
      permanently_deleted_at = now()
  where id = p_establishment_id;
  perform set_config('cuotly.platform_change', 'off', true);
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.permanently_deleted_by_platform', 'establishment', p_establishment_id,
          jsonb_build_object('archived_by', case when v_flag is null then 'team' else 'platform' end),
          jsonb_build_object('status', 'archived'), btrim(p_reason));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, auth.uid(), 'platform.establishment_permanently_deleted', 'establishment', p_establishment_id,
          jsonb_build_object('space_id', v_space_id), btrim(p_reason));
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_delete_space(p_space_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_done boolean;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Restavor web o un Administrador de Restavor web con permiso para eliminar elimina un espacio (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Eliminar un espacio exige motivo (§140, RN-ADM-15)';
  end if;

  v_done := public.platform_set_space_archived_internal(p_space_id, true, btrim(p_reason));

  if v_done then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
    values (null, auth.uid(), 'platform.space_deleted', 'space', p_space_id,
            jsonb_build_object('space_id', p_space_id), btrim(p_reason));

    -- RN-ADM-21 · todo su equipo en activo se entera: pierde la escritura.
    perform public.notify_space_lifecycle_event(
      p_space_id, 'space_deleted_by_platform',
      'space_deleted_by_platform:' || p_space_id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS'));
  end if;
  return v_done;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_delete_space_permanently(p_space_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
  v_gone timestamptz;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Restavor web o un Administrador de Restavor web con permiso para eliminar elimina un espacio (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Eliminar un espacio exige motivo (§140, RN-ADM-15)';
  end if;

  select cuotly_status, permanently_deleted_at into v_status, v_gone
  from public.spaces where id = p_space_id for update;
  if not found then
    raise exception 'Espacio no encontrado';
  end if;
  if v_gone is not null then
    return false; -- CA-17.
  end if;
  if v_status is null or v_status not in ('archived_by_platform', 'archived_by_owner') then
    raise exception 'Solo se elimina definitivamente lo que está en Archivados: archívalo antes (RN-ADM-24)';
  end if;

  -- El archivado de un propietario lo podría deshacer él: pasa antes a
  -- Restavor web, con su evento, para que la marca lo deje quieto.
  if v_status = 'archived_by_owner' then
    perform public.platform_set_space_archived_internal(p_space_id, true, btrim(p_reason));
  end if;

  -- La solo lectura del espacio archivado es para quien trabaja en él.
  perform set_config('cuotly.space_status_change', 'on', true);
  perform set_config('cuotly.platform_change', 'on', true);
  update public.spaces set permanently_deleted_at = now() where id = p_space_id;
  perform set_config('cuotly.platform_change', 'off', true);
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, auth.uid(), 'space.permanently_deleted_by_platform', 'space', p_space_id,
          jsonb_build_object('cuotly_status', v_status),
          jsonb_build_object('cuotly_status', 'archived_by_platform'),
          btrim(p_reason));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, auth.uid(), 'platform.space_permanently_deleted', 'space', p_space_id,
          jsonb_build_object('space_id', p_space_id), btrim(p_reason));
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_incident_messages(p_incident_id uuid)
 RETURNS TABLE(id uuid, author_side text, author_id uuid, author_email text, author_name text, body text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee las incidencias (§131, RN-SOP-07)';
  end if;
  return query
    select m.id, m.author_side, m.author_id, p.email, p.full_name, m.body, m.created_at
    from public.incident_messages m
    join public.profiles p on p.id = m.author_id
    where m.incident_id = p_incident_id
    order by m.created_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_list_archived()
 RETURNS TABLE(kind text, id uuid, name text, code text, space_id uuid, space_name text, space_slug text, space_status text, archived_by text, archived_at timestamp with time zone, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select 'space'::text, s.id, s.name, null::text, s.id, s.name, s.slug, s.cuotly_status,
           case s.cuotly_status when 'archived_by_platform' then 'platform' else 'owner' end,
           coalesce(ev.occurred_at, s.cuotly_archived_at, s.cuotly_status_changed_at),
           ev.reason
    from public.spaces s
    left join lateral (
      select se.occurred_at, se.reason
      from public.state_events se
      where se.entity_type = 'space' and se.entity_id = s.id and se.to_state = s.cuotly_status
      order by se.occurred_at desc
      limit 1
    ) ev on true
    where s.cuotly_status in ('archived_by_platform', 'archived_by_owner')
      and s.permanently_deleted_at is null
  union all
    select 'establishment'::text, e.id, e.name, e.code, s.id, s.name, s.slug, s.cuotly_status,
           case when e.platform_archived_at is not null then 'platform' else 'team' end,
           coalesce(e.platform_archived_at, ev.occurred_at),
           case when e.platform_archived_at is not null then pa.reason else ev.reason end
    from public.establishments e
    join public.spaces s on s.id = e.space_id
    left join lateral (
      select se.occurred_at, se.reason
      from public.state_events se
      where se.entity_type = 'establishment' and se.entity_id = e.id and se.to_state = 'archived'
      order by se.occurred_at desc
      limit 1
    ) ev on true
    left join lateral (
      select a.reason
      from public.audit_log a
      where a.action = 'establishment.archived_by_platform' and a.entity_id = e.id
      order by a.created_at desc
      limit 1
    ) pa on true
    where e.status = 'archived'
      and e.permanently_deleted_at is null
  order by 10 desc nulls last, 3;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_list_charges(p_open_only boolean DEFAULT true)
 RETURNS TABLE(id uuid, space_id uuid, space_name text, space_slug text, reference text, concept text, kind text, total_cents integer, outstanding_cents integer, status text, period_start timestamp with time zone, period_end timestamp with time zone, due_at timestamp with time zone, issued_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select c.id, c.space_id, s.name, s.slug,
      c.reference, c.concept, c.kind,
      c.total_cents, public.cuotly_charge_outstanding_cents(c.id), public.cuotly_charge_status(c.id),
      c.period_start, c.period_end, c.due_at, c.issued_at
    from public.cuotly_charges c
    join public.spaces s on s.id = c.space_id
    where not p_open_only or public.cuotly_charge_status(c.id) <> 'paid'
    order by c.due_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_list_establishments()
 RETURNS TABLE(id uuid, name text, code text, status text, platform_archived_at timestamp with time zone, space_id uuid, space_name text, space_slug text, space_status text, created_at timestamp with time zone, has_overdue_debt boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select e.id, e.name, e.code, e.status, e.platform_archived_at,
           s.id, s.name, s.slug, s.cuotly_status, e.created_at,
           public.establishment_has_overdue_debt_internal(e.id)
    from public.establishments e
    join public.spaces s on s.id = e.space_id
    where e.permanently_deleted_at is null
    order by s.name, e.name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_list_incidents(p_open_only boolean DEFAULT true, p_incident_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, space_id uuid, space_name text, space_slug text, space_plan text, kind text, category text, impact text, status text, status_reason text, priority text, description text, device text, app_version text, client_context jsonb, help_query text, opened_by uuid, opened_by_email text, opened_by_name text, opened_at timestamp with time zone, first_platform_response_at timestamp with time zone, resolved_at timestamp with time zone, closed_at timestamp with time zone, last_activity_at timestamp with time zone, first_response_minutes integer, resolution_minutes integer, message_count integer, attachment_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee las incidencias (§131, RN-SOP-07)';
  end if;

  return query
    select i.id, i.space_id, s.name, s.slug, s.cuotly_plan,
      i.kind, i.category, i.impact, i.status, i.status_reason,
      public.incident_priority_for(i.kind, i.impact, s.cuotly_plan),
      i.description, i.device, i.app_version, i.client_context, i.help_query,
      i.opened_by, p.email, p.full_name,
      i.opened_at, i.first_platform_response_at, i.resolved_at, i.closed_at,
      i.last_activity_at,
      case when i.kind = 'error' then public.support_minutes_between(i.opened_at, coalesce(i.first_platform_response_at, now())) end,
      case when i.kind = 'error' then public.support_minutes_between(i.opened_at, coalesce(i.resolved_at, i.closed_at, now())) end,
      (select count(*)::integer from public.incident_messages m where m.incident_id = i.id),
      (select count(*)::integer from public.incident_attachments a where a.incident_id = i.id)
    from public.incidents i
    join public.spaces s on s.id = i.space_id
    join public.profiles p on p.id = i.opened_by
    where (p_incident_id is null or i.id = p_incident_id)
      and (not p_open_only or i.status <> 'closed')
    order by
      case public.incident_priority_for(i.kind, i.impact, s.cuotly_plan)
        when 'critical' then 0 when 'high' then 1 when 'standard' then 2 else 3 end,
      i.opened_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_list_pending_payments()
 RETURNS TABLE(id uuid, space_id uuid, space_name text, charge_id uuid, charge_reference text, amount_cents integer, method text, paid_at timestamp with time zone, receipt_reference text, note text, declared_side text, declared_at timestamp with time zone, declared_by_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select p.id, p.space_id, s.name, p.charge_id, c.reference,
      p.amount_cents, p.method, p.paid_at,
      p.receipt_reference, p.note, p.declared_side, p.declared_at, pr.email
    from public.cuotly_payments p
    join public.spaces s on s.id = p.space_id
    join public.cuotly_charges c on c.id = p.charge_id
    join public.profiles pr on pr.id = p.declared_by
    where p.confirmed_at is null and p.rejected_at is null
    order by p.declared_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_list_spaces()
 RETURNS TABLE(id uuid, name text, slug text, created_at timestamp with time zone, cuotly_status text, cuotly_plan text, cuotly_trial_ends_at timestamp with time zone, cuotly_archived_at timestamp with time zone, cuotly_reactivation_deadline_at timestamp with time zone, current_period_end timestamp with time zone, pending_plan text, owner_emails text, active_establishments integer, internal_users integer, storage_bytes bigint, storage_limit_bytes bigint, outstanding_cents integer, overdue_cents integer, has_pending_declaration boolean, support_active boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
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
$function$
;

CREATE OR REPLACE FUNCTION public.platform_list_support_sessions(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, space_id uuid, space_name text, space_slug text, actor_id uuid, actor_email text, reason text, access_level text, started_at timestamp with time zone, expires_at timestamp with time zone, ended_at timestamp with time zone, end_note text, is_active boolean, actions_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select ss.id, ss.space_id, s.name, s.slug,
      ss.actor_id, p.email, ss.reason, ss.access_level,
      ss.started_at, ss.expires_at, ss.ended_at, ss.end_note,
      ss.ended_at is null and ss.expires_at > now(),
      (select count(*)::integer from public.audit_log a
        where a.support_session_id = ss.id and a.action not in ('support.session_started', 'support.session_ended'))
    from public.support_sessions ss
    join public.spaces s on s.id = ss.space_id
    join public.profiles p on p.id = ss.actor_id
    order by ss.started_at desc
    limit greatest(p_limit, 1);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_list_users(p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, email text, full_name text, created_at timestamp with time zone, spaces_count integer, is_owner boolean, is_admin boolean, can_approve_spaces boolean, can_manage_subscriptions boolean, can_support boolean, can_delete_accounts boolean, two_factor_enrolled boolean, closed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select p.id, p.email, p.full_name, p.created_at,
      (select count(*)::integer from public.space_memberships sm where sm.user_id = p.id and sm.status = 'active'),
      lower(p.email) = lower('info@restavor.com'),
      pr.user_id is not null,
      coalesce(pr.can_approve_spaces, false),
      coalesce(pr.can_manage_subscriptions, false),
      coalesce(pr.can_support, false),
      coalesce(pr.can_delete_accounts, false),
      exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
      (select c.closed_at from public.platform_account_closures c
        where c.user_id = p.id and c.restored_at is null)
    from public.profiles p
    left join public.platform_roles pr on pr.user_id = p.id
    order by p.created_at desc
    limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_panel_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
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
$function$
;

CREATE OR REPLACE FUNCTION public.platform_reactivate_space(p_space_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  if not public.is_platform_subscription_manager() then
    raise exception 'Solo Restavor web reactiva un espacio archivado';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Hace falta un motivo para reactivar un espacio';
  end if;

  select cuotly_status into v_status from public.spaces where id = p_space_id;
  if v_status is null then
    raise exception 'Espacio no encontrado o sin suscripción de Restavor web';
  end if;
  if v_status not in ('archived_trial_ended', 'archived_nonpayment') then
    return; -- CA-17.
  end if;

  perform public.set_space_cuotly_status_internal(p_space_id, 'active', btrim(p_reason), 'platform');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_recover_establishment(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason constant text := 'Recuperado desde Archivados';
  v_space_id uuid;
  v_status text;
  v_flag timestamptz;
  v_gone timestamptz;
  v_target text;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Restavor web o un Administrador de Restavor web con permiso para eliminar recupera un restaurante (RN-ADM-14)';
  end if;

  select space_id, status, platform_archived_at, permanently_deleted_at
  into v_space_id, v_status, v_flag, v_gone
  from public.establishments where id = p_establishment_id for update;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if v_gone is not null then
    raise exception 'Este restaurante lo eliminó Restavor web definitivamente: ya no se recupera (RN-ADM-24)';
  end if;
  if v_flag is null and v_status <> 'archived' then
    return false; -- CA-17.
  end if;

  -- Al estado en que lo encontró Restavor web, salvo que fuera `archived`: se
  -- activa de nuevo (RN-ADM-23, cambia RN-ADM-17). Archivado por su
  -- equipo, también a `active`.
  if v_flag is not null then
    select a.old_value ->> 'status' into v_target
    from public.audit_log a
    where a.action = 'establishment.archived_by_platform' and a.entity_id = p_establishment_id
    order by a.created_at desc
    limit 1;
  end if;
  if v_target is null or v_target = 'archived' then
    v_target := 'active';
  end if;

  perform set_config('cuotly.space_status_change', 'on', true);
  if v_flag is not null then
    perform set_config('cuotly.platform_change', 'on', true);
    update public.establishments set platform_archived_at = null where id = p_establishment_id;
    perform set_config('cuotly.platform_change', 'off', true);
  end if;
  -- La deuda vencida (RN-FIN-13) y el límite del plan de Restavor web lo paran
  -- aquí mismo, con su mensaje, y no se recupera nada.
  perform public.set_establishment_status_internal(p_establishment_id, v_target, v_reason);
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.restored_by_platform', 'establishment', p_establishment_id,
          jsonb_build_object('status', 'archived', 'archived_by', case when v_flag is null then 'team' else 'platform' end),
          jsonb_build_object('status', v_target), v_reason);
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, auth.uid(), 'platform.establishment_restored', 'establishment', p_establishment_id,
          jsonb_build_object('space_id', v_space_id, 'status', v_target), v_reason);
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_recover_space(p_space_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason constant text := 'Recuperado desde Archivados';
  v_status text;
  v_gone timestamptz;
  v_done boolean := false;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Restavor web o un Administrador de Restavor web con permiso para eliminar recupera un espacio (RN-ADM-14)';
  end if;

  select cuotly_status, permanently_deleted_at into v_status, v_gone
  from public.spaces where id = p_space_id for update;
  if not found then
    raise exception 'Espacio no encontrado';
  end if;
  if v_gone is not null then
    raise exception 'Este espacio lo eliminó Restavor web definitivamente: ya no se recupera (RN-ADM-24)';
  end if;

  if v_status = 'archived_by_platform' then
    v_done := public.platform_set_space_archived_internal(p_space_id, false, v_reason);
    select cuotly_status into v_status from public.spaces where id = p_space_id;
  end if;

  -- Si antes de Restavor web lo había archivado su propietario, "se activa de
  -- nuevo" también deshace eso.
  if v_status = 'archived_by_owner' then
    perform public.restore_space_by_owner(p_space_id, v_reason, null);
    v_done := true;
  end if;

  if v_done then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
    values (null, auth.uid(), 'platform.space_restored', 'space', p_space_id,
            jsonb_build_object('space_id', p_space_id,
                               'cuotly_status', (select cuotly_status from public.spaces where id = p_space_id)),
            v_reason);
  end if;
  return v_done; -- CA-17: el segundo clic no encuentra nada archivado a mano.
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_restore_account(p_user_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_closure public.platform_account_closures;
  v_item jsonb;
  v_role text;
  v_space text;
  v_skipped jsonb := '[]'::jsonb;
  v_restored integer := 0;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Restavor web o un Administrador de Restavor web con permiso para eliminar recupera una cuenta (RN-ADM-14)';
  end if;

  select * into v_closure from public.platform_account_closures
  where user_id = p_user_id and restored_at is null
  for update;
  if v_closure.id is null then
    return jsonb_build_object('already_restored', true, 'restored', 0, 'skipped', '[]'::jsonb);
  end if;

  if v_reason = '' then
    raise exception 'Recuperar una cuenta exige motivo (§140, RN-ADM-15)';
  end if;

  perform set_config('cuotly.space_status_change', 'on', true);

  -- Los espacios que se eliminaron con ella, de vuelta.
  for v_space in select jsonb_array_elements_text(v_closure.details -> 'archived_spaces') loop
    perform public.platform_set_space_archived_internal(v_space::uuid, false, v_reason);
  end loop;

  -- De vuelta a sus equipos. Donde era propietaria y la propiedad pasó a
  -- otra persona, vuelve como trabajadora: el espacio ya tiene dueño
  -- (RN-ADM-18, decisión 81 confirmada el 26/09/2026).
  -- Lo que no se puede devolver —el plan del espacio ya no admite más
  -- usuarios— se salta y se dice.
  for v_item in select * from jsonb_array_elements(v_closure.details -> 'memberships') loop
    v_role := v_item ->> 'role';
    if v_role = 'owner' and exists (
         select 1 from jsonb_array_elements(v_closure.details -> 'transfers') t
         where t ->> 'space_id' = v_item ->> 'space_id') then
      v_role := 'worker';
    end if;

    begin
      update public.space_memberships
      set status = (v_item ->> 'status')::public.member_status,
          role = v_role::public.space_role
      where space_id = (v_item ->> 'space_id')::uuid and user_id = p_user_id
        and status = 'access_revoked';
      if found then
        v_restored := v_restored + 1;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('space_id', v_item ->> 'space_id', 'error', sqlerrm);
    end;
  end loop;

  for v_item in select * from jsonb_array_elements(v_closure.details -> 'establishment_memberships') loop
    begin
      update public.establishment_memberships set revoked_at = null, revoked_by = null
      where id = (v_item #>> '{}')::uuid and revoked_at is not null;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('establishment_membership_id', v_item #>> '{}', 'error', sqlerrm);
    end;
  end loop;

  for v_item in select * from jsonb_array_elements(v_closure.details -> 'group_memberships') loop
    begin
      update public.group_memberships set revoked_at = null, revoked_by = null
      where id = (v_item #>> '{}')::uuid and revoked_at is not null;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('group_membership_id', v_item #>> '{}', 'error', sqlerrm);
    end;
  end loop;

  perform set_config('cuotly.space_status_change', 'off', true);

  update auth.users set banned_until = null where id = p_user_id;

  update public.platform_account_closures
  set restored_at = now(), restored_by = v_actor, restore_reason = v_reason
  where id = v_closure.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, v_actor, 'platform.account_restored', 'profile', p_user_id,
          jsonb_build_object('restored_memberships', v_restored, 'skipped', v_skipped), v_reason);

  return jsonb_build_object('already_restored', false, 'restored', v_restored, 'skipped', v_skipped);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_restore_establishment(p_establishment_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_flag timestamptz;
  v_previous text;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Restavor web o un Administrador de Restavor web con permiso para eliminar recupera un restaurante (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Recuperar un restaurante exige motivo (§140, RN-ADM-15)';
  end if;

  select space_id, platform_archived_at into v_space_id, v_flag
  from public.establishments where id = p_establishment_id for update;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if v_flag is null then
    return false; -- CA-17: no lo eliminó Restavor web.
  end if;

  -- Vuelve al estado en que lo encontró Restavor web, apuntado al eliminarlo.
  -- Si el equipo ya lo tenía archivado, sigue archivado: lo reactiva el
  -- equipo si quiere. Si era `active` y hay deuda vencida, la guarda de
  -- RN-FIN-13 lo dice aquí mismo.
  select a.old_value ->> 'status' into v_previous
  from public.audit_log a
  where a.action = 'establishment.archived_by_platform' and a.entity_id = p_establishment_id
  order by a.created_at desc
  limit 1;
  v_previous := coalesce(v_previous, 'active');

  perform set_config('cuotly.space_status_change', 'on', true);
  perform set_config('cuotly.platform_change', 'on', true);
  update public.establishments set platform_archived_at = null where id = p_establishment_id;
  perform set_config('cuotly.platform_change', 'off', true);

  perform public.set_establishment_status_internal(p_establishment_id, v_previous, btrim(p_reason));
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.restored_by_platform', 'establishment', p_establishment_id,
          jsonb_build_object('status', 'archived'), jsonb_build_object('status', v_previous), btrim(p_reason));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, auth.uid(), 'platform.establishment_restored', 'establishment', p_establishment_id,
          jsonb_build_object('space_id', v_space_id, 'status', v_previous), btrim(p_reason));
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_restore_space(p_space_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_done boolean;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Restavor web o un Administrador de Restavor web con permiso para eliminar recupera un espacio (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Recuperar un espacio exige motivo (§140, RN-ADM-15)';
  end if;

  v_done := public.platform_set_space_archived_internal(p_space_id, false, btrim(p_reason));

  if v_done then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
    values (null, auth.uid(), 'platform.space_restored', 'space', p_space_id,
            jsonb_build_object('space_id', p_space_id), btrim(p_reason));
  end if;
  return v_done;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_revenue_by_month(p_months integer DEFAULT 12)
 RETURNS TABLE(month date, paid_cents bigint, payments integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select (date_trunc('month', e.created_at at time zone 'Europe/Madrid'))::date,
      -sum(e.amount_cents)::bigint,
      count(*) filter (where e.entry_type = 'payment')::integer
    from public.cuotly_ledger_entries e
    where e.entry_type in ('payment', 'payment_reversal')
      and e.created_at >= date_trunc('month', now() at time zone 'Europe/Madrid') - make_interval(months => greatest(p_months, 1) - 1)
    group by 1
    order by 1 desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_set_space_archived_internal(p_space_id uuid, p_archive boolean, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current text;
  v_target text;
  v_gone timestamptz;
  v_now timestamptz := now();
  v_switch text := coalesce(current_setting('cuotly.space_status_change', true), '');
begin
  select cuotly_status, permanently_deleted_at into v_current, v_gone
  from public.spaces where id = p_space_id for update;
  if not found then
    raise exception 'Espacio no encontrado';
  end if;

  if v_gone is not null then
    return false; -- RN-ADM-24.
  end if;

  if p_archive then
    if v_current is not distinct from 'archived_by_platform' then
      return false; -- CA-17.
    end if;
    v_target := 'archived_by_platform';
  else
    if v_current is distinct from 'archived_by_platform' then
      return false; -- CA-17: no estaba archivado por Restavor web.
    end if;
    select se.from_state into v_target
    from public.state_events se
    where se.entity_type = 'space' and se.entity_id = p_space_id
      and se.to_state = 'archived_by_platform'
    order by se.occurred_at desc
    limit 1;
  end if;

  perform set_config('cuotly.space_status_change', 'on', true);
  update public.spaces
  set cuotly_status = v_target,
      cuotly_status_changed_at = v_now,
      cuotly_archived_at = case
        when p_archive then coalesce(cuotly_archived_at, v_now)
        when public.space_status_is_archived(v_target) then cuotly_archived_at
        else null
      end
  where id = p_space_id;

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (p_space_id, 'space', p_space_id, v_current, coalesce(v_target, 'none'), auth.uid(), p_reason, 'platform');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, auth.uid(),
          case when p_archive then 'space.archived_by_platform' else 'space.restored_by_platform' end,
          'space', p_space_id,
          jsonb_build_object('cuotly_status', v_current),
          jsonb_build_object('cuotly_status', v_target),
          p_reason);
  perform set_config('cuotly.space_status_change', v_switch, true);

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_cuotly_payment(p_charge_id uuid, p_amount_cents integer, p_method text, p_paid_at timestamp with time zone DEFAULT now(), p_note text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_payment_id uuid;
begin
  if not public.is_platform_subscription_manager() then
    raise exception 'Solo Restavor web registra un pago (§4.5)';
  end if;

  select space_id into v_space_id from public.cuotly_charges where id = p_charge_id for update;
  if v_space_id is null then
    raise exception 'Cobro de Restavor web no encontrado';
  end if;

  if p_idempotency_key is not null then
    select id into v_payment_id from public.cuotly_payments
    where charge_id = p_charge_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  if p_method not in ('transfer', 'bizum') then
    raise exception 'Restavor web se paga por transferencia o Bizum (§4.5), no por %', p_method;
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe pagado debe ser mayor que cero';
  end if;

  insert into public.cuotly_payments
    (space_id, charge_id, amount_cents, method, paid_at, note, declared_by, declared_side, idempotency_key)
  values
    (v_space_id, p_charge_id, p_amount_cents, p_method, p_paid_at, p_note, auth.uid(), 'platform', p_idempotency_key)
  returning id into v_payment_id;

  perform public.cuotly_confirm_payment_internal(v_payment_id, p_note);

  return v_payment_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_cuotly_payment(p_payment_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pay public.cuotly_payments;
begin
  if not public.is_platform_subscription_manager() then
    raise exception 'Solo Restavor web rechaza un pago declarado';
  end if;

  select * into v_pay from public.cuotly_payments where id = p_payment_id for update;
  if v_pay.id is null then
    raise exception 'Pago no encontrado';
  end if;
  if v_pay.rejected_at is not null then
    return; -- CA-17.
  end if;
  if v_pay.confirmed_at is not null then
    raise exception 'Un pago confirmado no se rechaza: se revierte con reverse_cuotly_payment()';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Hace falta un motivo para rechazar un pago declarado';
  end if;

  update public.cuotly_payments
  set rejected_at = now(), rejected_by = auth.uid(), rejection_reason = btrim(p_reason)
  where id = p_payment_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_pay.space_id, auth.uid(), 'cuotly_payment.rejected', 'cuotly_payment', p_payment_id,
          jsonb_build_object('amount_cents', v_pay.amount_cents),
          jsonb_build_object('rejected', true), btrim(p_reason));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.request_service_termination(p_establishment_id uuid, p_reason text DEFAULT NULL::text, p_requested_by_client boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_status text;
  v_es_cliente boolean;
  v_es_equipo boolean;
begin
  select space_id, status into v_space_id, v_status
  from public.establishments where id = p_establishment_id for update;

  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  v_es_cliente := public.can_write_establishment(p_establishment_id);
  v_es_equipo := public.has_capability(v_space_id, 'manage_clients');

  if not (v_es_cliente or v_es_equipo) then
    raise exception 'No puedes comunicar la baja de este restaurante';
  end if;

  -- Registrar una baja "de fuera" es un acto del equipo: dice que alguien
  -- llamó. El restaurante comunica la suya, no la de otro.
  if not p_requested_by_client and not v_es_equipo then
    raise exception 'Solo el equipo registra una baja comunicada por fuera de Restavor web';
  end if;

  -- CA-17 · comunicarla dos veces no hace nada la segunda.
  if v_status = 'ending' then
    return;
  end if;

  -- Lo que ya no tiene servicio no se da de baja: no queda nada que acabar.
  if v_status in ('suspended', 'archived') then
    raise exception 'Este restaurante ya no tiene servicio activo (%)', v_status;
  end if;

  -- RN-EST-09 · `ending` es servicio EN MARCHA. `set_establishment_status()`
  -- lo sabe y por eso exige que no haya deuda vencida: de una parada por
  -- impago se sale cobrando (RN-FIN-13), no comunicando una baja.
  -- Por el cuerpo y no por la puerta del equipo: quién puede ya se ha
  -- comprobado arriba, y el restaurante no tiene `manage_clients` —ni debe
  -- tenerlo— para comunicar su propia baja.
  perform public.set_establishment_status_internal(
    p_establishment_id, 'ending', btrim(p_reason));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.termination_requested', 'establishment',
          p_establishment_id,
          jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'ending', 'requested_by_client', p_requested_by_client),
          btrim(p_reason));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_platform_status_event(p_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.platform_status_events;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, resuelve un evento de estado (§157, RN-SOP-13)';
  end if;
  select * into v_row from public.platform_status_events where id = p_id for update;
  if v_row.id is null then
    raise exception 'Evento de estado no encontrado';
  end if;
  if v_row.resolved_at is not null then
    return; -- CA-17.
  end if;

  update public.platform_status_events
  set resolved_at = now(), resolved_by = auth.uid(), resolution_note = nullif(btrim(p_note), '')
  where id = p_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (null, auth.uid(), 'platform_status.resolved', 'platform_status_event', p_id,
          jsonb_build_object('component', v_row.component, 'severity', v_row.severity),
          jsonb_build_object('resolved', true), nullif(btrim(p_note), ''));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_space_by_owner(p_space_id uuid, p_reason text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_current text;
  v_deadline timestamptz;
  v_previous text;
  v_platform boolean := public.is_platform_owner()
                        or public.is_platform_subscription_manager()
                        or public.is_platform_account_manager();
  v_op_id uuid;
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión para restaurar un espacio';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing
    from public.space_lifecycle_operations
    where space_id = p_space_id and idempotency_key = p_idempotency_key
      and actor_id = v_actor;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  select cuotly_status, cuotly_reactivation_deadline_at
  into v_current, v_deadline
  from public.spaces where id = p_space_id for update;

  if v_current is distinct from 'archived_by_owner' then
    raise exception 'Este espacio no lo archivó su propietario: si está archivado por prueba o impago, se reactiva pagando (§4.6, RN-SUB-09)';
  end if;

  if not v_platform then
    if public.support_access_level(p_space_id) is not null then
      raise exception 'Modo soporte no restaura un espacio (§129, RN-ADM-07, RN-CIC-08)';
    end if;
    if not public.has_capability(p_space_id, 'manage_space') then
      raise exception 'Solo el propietario restaura su espacio dentro de los 30 días (§127, RN-CIC-08)';
    end if;
    if v_deadline is not null and now() > v_deadline then
      raise exception 'Pasados los 30 días, restaurar este espacio es de la plataforma (RN-CIC-08, como RN-SUB-09)';
    end if;
  end if;

  -- Al modo que tenía antes de que lo archivara su propietario. El paso
  -- de `archived_by_platform` a `archived_by_owner` es Restavor web devolviéndolo
  -- a donde estaba, no el propietario archivándolo: se salta, o el espacio
  -- volvería al archivado de Restavor web del que acaba de salir.
  select se.from_state into v_previous
  from public.state_events se
  where se.space_id = p_space_id and se.entity_type = 'space'
    and se.to_state = 'archived_by_owner'
    and se.from_state is distinct from 'archived_by_platform'
  order by se.occurred_at desc, se.id desc
  limit 1;

  perform set_config('cuotly.space_status_change', 'on', true);
  update public.spaces
  set cuotly_status = coalesce(v_previous, 'active'),
      cuotly_status_changed_at = now(),
      cuotly_archived_at = null,
      cuotly_reactivation_deadline_at = null,
      cuotly_deletion_scheduled_at = null
  where id = p_space_id;
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.space_lifecycle_operations
    (space_id, kind, actor_id, reason, idempotency_key)
  values (p_space_id, 'restored', v_actor, p_reason, p_idempotency_key)
  returning id into v_op_id;

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (p_space_id, 'space', p_space_id, 'archived_by_owner', coalesce(v_previous, 'active'),
          v_actor, p_reason, case when v_platform then 'platform_restore' else 'owner_request' end);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, v_actor, 'space.restored_by_owner', 'space', p_space_id,
          jsonb_build_object('cuotly_status', 'archived_by_owner'),
          jsonb_build_object('cuotly_status', coalesce(v_previous, 'active'),
                             'by_platform', v_platform),
          p_reason);

  return v_op_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.retire_platform_holiday(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.platform_holidays;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, retira un festivo (§132, RN-SOP-06)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Retirar un festivo exige motivo';
  end if;

  select * into v_row from public.platform_holidays where id = p_id for update;
  if v_row.id is null then
    raise exception 'Festivo no encontrado';
  end if;
  if v_row.removed_at is not null then
    return; -- CA-17.
  end if;

  update public.platform_holidays
  set removed_at = now(), removed_by = auth.uid(), removal_reason = btrim(p_reason)
  where id = p_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (null, auth.uid(), 'platform_holiday.retired', 'platform_holiday', p_id,
          jsonb_build_object('holiday_date', v_row.holiday_date, 'name', v_row.name),
          jsonb_build_object('removed', true), btrim(p_reason));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reverse_cuotly_payment(p_payment_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pay public.cuotly_payments;
begin
  if not public.is_platform_subscription_manager() then
    raise exception 'Solo Restavor web revierte un pago confirmado';
  end if;

  select * into v_pay from public.cuotly_payments where id = p_payment_id for update;
  if v_pay.id is null then
    raise exception 'Pago no encontrado';
  end if;
  if v_pay.reversed_at is not null then
    return; -- CA-17.
  end if;
  if v_pay.confirmed_at is null then
    raise exception 'Solo se revierte un pago confirmado; uno declarado se rechaza';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Hace falta un motivo para revertir un pago';
  end if;

  update public.cuotly_payments
  set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = btrim(p_reason)
  where id = p_payment_id;

  insert into public.cuotly_ledger_entries
    (space_id, charge_id, entry_type, amount_cents, payment_id, reason, created_by)
  values
    (v_pay.space_id, v_pay.charge_id, 'payment_reversal', v_pay.amount_cents, p_payment_id, btrim(p_reason), auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_pay.space_id, auth.uid(), 'cuotly_payment.reversed', 'cuotly_payment', p_payment_id,
          jsonb_build_object('amount_cents', v_pay.amount_cents),
          jsonb_build_object('reversed', true), btrim(p_reason));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_platform_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_previous public.platform_roles;
begin
  if not public.is_platform_owner() then
    raise exception 'Solo el propietario de Restavor web retira Administradores de Restavor web (§167)';
  end if;

  select * into v_previous from public.platform_roles where user_id = p_user_id;
  if v_previous.user_id is null then
    return false; -- CA-17.
  end if;

  update public.support_sessions
  set ended_at = now(), end_note = 'Rol de Administrador de Restavor web retirado'
  where actor_id = p_user_id and ended_at is null;

  delete from public.platform_roles where user_id = p_user_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value)
  values (null, auth.uid(), 'platform.admin_revoked', 'platform_role', p_user_id,
          jsonb_build_object('can_approve_spaces', v_previous.can_approve_spaces,
                             'can_manage_subscriptions', v_previous.can_manage_subscriptions,
                             'can_support', v_previous.can_support,
                             'can_delete_accounts', v_previous.can_delete_accounts));
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_space_request_draft(p_business_name text, p_contact_name text, p_email text, p_plan text, p_phone text DEFAULT NULL::text, p_estimated_establishments integer DEFAULT NULL::integer, p_estimated_users integer DEFAULT NULL::integer, p_intended_use text DEFAULT NULL::text, p_tax_name text DEFAULT NULL::text, p_tax_id text DEFAULT NULL::text, p_tax_address text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar en Restavor web para pedir un espacio';
  end if;

  if p_plan not in ('pro', 'agency') then
    raise exception 'El plan de Restavor web es Pro o Agency, no %', p_plan;
  end if;

  -- Un borrador por persona (el índice lo garantiza); esto lo actualiza en
  -- vez de chocar, que es lo que "seguir con lo que empecé" significa.
  select id into v_id
  from public.space_requests
  where requester_id = auth.uid() and status = 'draft'
  for update;

  if v_id is null then
    insert into public.space_requests (
      requester_id, business_name, contact_name, email, phone,
      estimated_establishments, estimated_users, intended_use, plan,
      tax_name, tax_id, tax_address
    ) values (
      auth.uid(), btrim(p_business_name), btrim(p_contact_name), btrim(p_email), p_phone,
      p_estimated_establishments, p_estimated_users, p_intended_use, p_plan,
      p_tax_name, p_tax_id, p_tax_address
    )
    returning id into v_id;

    insert into public.space_request_events (request_id, from_status, to_status, actor_id)
    values (v_id, null, 'draft', auth.uid());
  else
    update public.space_requests
    set business_name = btrim(p_business_name),
        contact_name = btrim(p_contact_name),
        email = btrim(p_email),
        phone = p_phone,
        estimated_establishments = p_estimated_establishments,
        estimated_users = p_estimated_users,
        intended_use = p_intended_use,
        plan = p_plan,
        tax_name = p_tax_name,
        tax_id = p_tax_id,
        tax_address = p_tax_address,
        updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_cuotly_extras(p_space_id uuid, p_extra_establishments integer, p_extra_users integer, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space public.spaces;
  v_sub public.cuotly_subscriptions;
  v_terms record;
  v_usage record;
  v_key text;
  v_fraction numeric;
  v_delta_cents integer;
  v_charge_id uuid;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio contrata adicionales de Restavor web';
  end if;

  select * into v_space from public.spaces where id = p_space_id;
  select * into v_sub from public.cuotly_subscriptions where space_id = p_space_id for update;
  if v_sub.id is null then
    raise exception 'Este espacio no tiene suscripción de Restavor web';
  end if;
  if v_sub.plan <> 'pro' then
    raise exception 'Los adicionales son de Pro (§4.1); Agency no tiene límite';
  end if;
  if v_space.cuotly_status <> 'active' then
    raise exception 'Los adicionales se contratan con la suscripción activa; en la prueba el tope es otro (§4.4)';
  end if;
  if p_extra_establishments is null or p_extra_establishments < 0
     or p_extra_users is null or p_extra_users < 0 then
    raise exception 'Los adicionales son números enteros no negativos';
  end if;

  if p_extra_establishments = v_sub.extra_establishments and p_extra_users = v_sub.extra_users then
    return null; -- CA-17.
  end if;

  v_key := coalesce(p_idempotency_key,
                    'extras:' || v_sub.id::text || ':' || p_extra_establishments || ':' || p_extra_users);
  if exists (
    select 1 from public.audit_log
    where action = 'space.extras_changed' and entity_id = p_space_id
      and new_value ->> 'idempotency_key' = v_key
  ) then
    return null;
  end if;

  -- RN-SUB-04 · bajar, nunca por debajo del uso.
  select * into v_terms from public.cuotly_plan_terms('pro');
  select
    (select count(*) from public.establishments e where e.space_id = p_space_id and e.status <> 'archived') as est,
    (select count(*) from public.space_memberships sm where sm.space_id = p_space_id and sm.status = 'active') as users
  into v_usage;
  if v_usage.est > v_terms.included_establishments + p_extra_establishments then
    raise exception 'Con % adicionales caben % establecimientos activos y hay %; archiva alguno antes de bajar',
      p_extra_establishments, v_terms.included_establishments + p_extra_establishments, v_usage.est;
  end if;
  if v_usage.users > v_terms.included_users + p_extra_users then
    raise exception 'Con % adicionales caben % usuarios internos y hay %; da de baja alguno antes de bajar',
      p_extra_users, v_terms.included_users + p_extra_users, v_usage.users;
  end if;

  -- Subir se cobra en proporción al periodo restante (RN-COM-18). Bajar,
  -- sin devolución: la mensualidad siguiente ya sale con la cifra nueva.
  v_fraction := public.cuotly_remaining_fraction(v_sub.current_period_start, v_sub.current_period_end, now());
  v_delta_cents := round((
      greatest(p_extra_establishments - v_sub.extra_establishments, 0) * v_terms.extra_establishment_cents
    + greatest(p_extra_users - v_sub.extra_users, 0) * v_terms.extra_user_cents) * v_fraction)::integer;

  if v_delta_cents > 0 then
    v_charge_id := public.issue_cuotly_charge_internal(
      v_sub.id, 'proration', 'Adicionales de Restavor web Pro (parte proporcional)',
      now(), v_sub.current_period_end, v_sub.current_period_end, v_delta_cents,
      jsonb_build_object(
        'fraction', v_fraction,
        'added_establishments', greatest(p_extra_establishments - v_sub.extra_establishments, 0),
        'added_users', greatest(p_extra_users - v_sub.extra_users, 0)));
  end if;

  update public.cuotly_subscriptions
  set extra_establishments = p_extra_establishments, extra_users = p_extra_users, updated_at = now()
  where id = v_sub.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (p_space_id, auth.uid(), 'space.extras_changed', 'space', p_space_id,
          jsonb_build_object('extra_establishments', v_sub.extra_establishments, 'extra_users', v_sub.extra_users),
          jsonb_build_object('extra_establishments', p_extra_establishments, 'extra_users', p_extra_users,
                             'charge_id', v_charge_id, 'idempotency_key', v_key));

  return v_charge_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_avatar(p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar en Restavor web para cambiar tu foto';
  end if;

  if v_path is null then
    raise exception 'Falta la ruta de la foto';
  end if;

  -- RN-GLO-09 · la foto de uno vive bajo su propio uuid. Se comprueba con
  -- la barra dentro: sin ella, el uuid de alguien sería prefijo de
  -- cualquier ruta que empezara por esas letras.
  if v_path not like (auth.uid()::text || '/%') then
    raise exception 'Una foto de perfil se guarda bajo la carpeta de su dueño';
  end if;

  update public.profiles set avatar_path = v_path where id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_notification_preference(p_event_type text, p_in_app boolean, p_email boolean, p_push boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar en Restavor web para cambiar tus avisos';
  end if;

  -- RN-NOT-03 · "seguridad, pérdida de acceso, impagos graves y
  -- vencimientos críticos no pueden desactivarse dentro de Restavor web". Por
  -- ningún canal (RN-MOV-06), y tampoco desde la cuenta: si esta puerta no
  -- lo comprobara, apagarlos aquí sería apagarlos en todos los espacios de
  -- una vez, que es justo lo contrario de lo que la regla protege.
  if public.notification_event_is_mandatory(p_event_type)
     and (p_in_app is not true or p_email is not true or p_push is false) then
    raise exception 'Este aviso no se puede desactivar: es un vencimiento crítico o un impago grave';
  end if;

  insert into public.profile_notification_preferences (profile_id, event_type, in_app, email, push)
  values (auth.uid(), p_event_type, p_in_app, p_email, coalesce(p_push, true))
  on conflict (profile_id, event_type)
  do update set in_app = excluded.in_app,
                email = excluded.email,
                push = coalesce(p_push, public.profile_notification_preferences.push),
                updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_profile(p_given_name text, p_family_name text, p_phone text DEFAULT NULL::text, p_display_timezone text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_given text := nullif(btrim(coalesce(p_given_name, '')), '');
  v_family text := nullif(btrim(coalesce(p_family_name, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar en Restavor web para cambiar tu perfil';
  end if;

  if v_given is null then
    raise exception 'El nombre no puede quedar en blanco';
  end if;

  -- Una zona horaria que PostgreSQL no conoce no se guarda: con ella
  -- dentro, cualquier pantalla que formatee una fecha reventaría.
  if p_display_timezone is not null
     and not exists (select 1 from pg_timezone_names where name = p_display_timezone) then
    raise exception 'Esa zona horaria no existe: %', p_display_timezone;
  end if;

  update public.profiles
  set given_name = v_given,
      family_name = v_family,
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      display_timezone = p_display_timezone,
      full_name = btrim(v_given || ' ' || coalesce(v_family, ''))
  where id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_notification_preference(p_space_id uuid, p_event_type text, p_in_app boolean, p_email boolean, p_push boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'No perteneces a este espacio';
  end if;

  -- RN-NOT-03: "seguridad, pérdida de acceso, impagos graves y
  -- vencimientos críticos no pueden desactivarse dentro de Restavor web". Por
  -- ningún canal (RN-MOV-06).
  if public.notification_event_is_mandatory(p_event_type)
     and (p_in_app is not true or p_email is not true or p_push is false) then
    raise exception 'Este aviso no se puede desactivar: es un vencimiento crítico o un impago grave';
  end if;

  -- `p_push` nulo significa "no lo toques": la web de escritorio guarda
  -- los dos canales de siempre y deja el del teléfono como estuviera.
  insert into public.notification_preferences (space_id, profile_id, event_type, in_app, email, push)
  values (p_space_id, auth.uid(), p_event_type, p_in_app, p_email, coalesce(p_push, true))
  on conflict (profile_id, space_id, event_type)
  do update set in_app = excluded.in_app,
                email = excluded.email,
                push = coalesce(p_push, public.notification_preferences.push),
                updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_platform_admin(p_user_id uuid, p_can_approve_spaces boolean DEFAULT false, p_can_manage_subscriptions boolean DEFAULT false, p_can_support boolean DEFAULT false, p_can_delete_accounts boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_previous public.platform_roles;
  v_email text;
begin
  if not public.is_platform_owner() then
    raise exception 'Solo el propietario de Restavor web nombra Administradores de Restavor web (§167)';
  end if;

  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    raise exception 'Esa persona no tiene cuenta en Restavor web';
  end if;
  if lower(v_email) = lower('info@restavor.com') then
    raise exception 'El propietario de Restavor web no se nombra a sí mismo: lo identifica su correo';
  end if;
  if exists (select 1 from public.platform_account_closures c
             where c.user_id = p_user_id and c.restored_at is null) then
    raise exception 'Esa cuenta está eliminada: recupérala antes de nombrarla (RN-ADM-18)';
  end if;

  select * into v_previous from public.platform_roles where user_id = p_user_id;

  insert into public.platform_roles (user_id, role, can_approve_spaces, can_manage_subscriptions, can_support, can_delete_accounts)
  values (p_user_id, 'cuotly_admin', p_can_approve_spaces, p_can_manage_subscriptions, p_can_support, p_can_delete_accounts)
  on conflict (user_id) do update
    set can_approve_spaces = excluded.can_approve_spaces,
        can_manage_subscriptions = excluded.can_manage_subscriptions,
        can_support = excluded.can_support,
        can_delete_accounts = excluded.can_delete_accounts;

  if v_previous.user_id is null then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (null, auth.uid(), 'platform.admin_granted', 'platform_role', p_user_id,
            jsonb_build_object('can_approve_spaces', p_can_approve_spaces,
                               'can_manage_subscriptions', p_can_manage_subscriptions,
                               'can_support', p_can_support,
                               'can_delete_accounts', p_can_delete_accounts));
  elsif v_previous.can_approve_spaces is distinct from p_can_approve_spaces
     or v_previous.can_manage_subscriptions is distinct from p_can_manage_subscriptions
     or v_previous.can_support is distinct from p_can_support
     or v_previous.can_delete_accounts is distinct from p_can_delete_accounts then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (null, auth.uid(), 'platform.admin_updated', 'platform_role', p_user_id,
            jsonb_build_object('can_approve_spaces', v_previous.can_approve_spaces,
                               'can_manage_subscriptions', v_previous.can_manage_subscriptions,
                               'can_support', v_previous.can_support,
                               'can_delete_accounts', v_previous.can_delete_accounts),
            jsonb_build_object('can_approve_spaces', p_can_approve_spaces,
                               'can_manage_subscriptions', p_can_manage_subscriptions,
                               'can_support', p_can_support,
                               'can_delete_accounts', p_can_delete_accounts));
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.space_request_trial_conflicts(p_request_id uuid)
 RETURNS TABLE(kind text, matched text, request_id uuid, business_name text, decided_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req public.space_requests;
  v_tax text;
  v_domains text[];
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web, con la sesión verificada en dos pasos, lee las solicitudes (§128, §136)';
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
$function$
;

CREATE OR REPLACE FUNCTION public.start_support_session(p_space_id uuid, p_reason text, p_access_level text DEFAULT 'read'::text, p_minutes integer DEFAULT 60, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_space public.spaces;
  v_recipient uuid;
begin
  if not public.is_platform_supporter() then
    raise exception 'Solo Restavor web, con el permiso de Modo soporte y la sesión verificada en dos pasos, entra en un espacio ajeno (§129, §136)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Modo soporte exige un motivo (§129)';
  end if;
  if p_access_level not in ('read', 'admin', 'owner') then
    raise exception 'Nivel de acceso desconocido: read, admin u owner';
  end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 240 then
    raise exception 'La duración de Modo soporte va de 15 a 240 minutos';
  end if;

  select * into v_space from public.spaces where id = p_space_id;
  if v_space.id is null then
    raise exception 'Espacio no encontrado';
  end if;

  -- RN-ADM-06 · sobre un espacio propio no hay soporte: se entra como
  -- quien se es. Y es una comprobación de verdad: si se abriera igual, la
  -- sesión se estamparía en apuntes que son del miembro, no de Restavor web.
  if exists (
    select 1 from public.space_memberships sm
    where sm.space_id = p_space_id and sm.user_id = auth.uid() and sm.status = 'active'
  ) then
    raise exception 'Ya perteneces a este espacio: entra como miembro, no en Modo soporte';
  end if;

  -- CA-17 · pulsar dos veces devuelve la misma sesión.
  if p_idempotency_key is not null then
    select id into v_id from public.support_sessions where idempotency_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  select id into v_id from public.support_sessions
  where actor_id = auth.uid() and space_id = p_space_id and ended_at is null and expires_at > now();
  if v_id is not null then
    return v_id;
  end if;

  -- Una sesión caducada y no cerrada ocupa el índice de "una activa por
  -- persona y espacio": se cierra aquí, con la fecha en que caducó.
  update public.support_sessions
  set ended_at = expires_at, end_note = coalesce(end_note, 'Caducada')
  where actor_id = auth.uid() and space_id = p_space_id and ended_at is null;

  insert into public.support_sessions (space_id, actor_id, reason, access_level, expires_at, idempotency_key)
  values (p_space_id, auth.uid(), btrim(p_reason), p_access_level,
          now() + make_interval(mins => p_minutes), p_idempotency_key)
  returning id into v_id;

  -- RN-ADM-08 · el apunte va en la auditoría DEL ESPACIO y con la identidad:
  -- el propietario ve quién de Restavor web entró (§129).
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason, support_session_id)
  values (p_space_id, auth.uid(), 'support.session_started', 'support_session', v_id,
          jsonb_build_object('access_level', p_access_level, 'minutes', p_minutes,
                             'expires_at', now() + make_interval(mins => p_minutes)),
          btrim(p_reason), v_id);

  -- RN-ADM-08 · aviso obligatorio a los propietarios del espacio (RN-NOT-03:
  -- es seguridad). El enlace abre su auditoría, donde está el apunte.
  for v_recipient in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = p_space_id and sm.status = 'active' and sm.role = 'owner'
  loop
    perform public.emit_notification(
      p_space_id, v_recipient, 'support_session_started', 'staff',
      'support_session', v_id,
      '/espacios/' || v_space.slug || '/ajustes/auditoria',
      'support_session_started:' || v_id::text || ':' || v_recipient::text);
  end loop;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_access_request(p_contact_name text, p_business_name text, p_phone text, p_email text, p_tax_id text, p_tax_id_country text, p_tax_id_verification text, p_tax_id_registry_name text DEFAULT NULL::text, p_comments text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  -- Decisión 67 · sin espacios, puntos, guiones ni barras y en
  -- mayúsculas, igual que `normalizeTaxId()` en `src/core/tax-id.ts`.
  v_tax_id text := upper(regexp_replace(coalesce(p_tax_id, ''), '[[:space:]./-]', '', 'g'));
  v_country text := upper(btrim(coalesce(p_tax_id_country, '')));
  v_id uuid;
  v_token uuid;
begin
  if coalesce(btrim(p_contact_name), '') = ''
     or coalesce(btrim(p_business_name), '') = ''
     or coalesce(btrim(p_phone), '') = ''
     or v_tax_id = ''
     or position('@' in v_email) < 2 then
    raise exception 'Faltan el nombre, el negocio, el teléfono, el correo o el DNI, CIF o NIF';
  end if;

  -- Decisión 68 · el país y cómo quedó comprobado. La comprobación la hace
  -- el servidor de Restavor web antes de llamar (cálculo de control y VIES);
  -- aquí se exige que venga y que sea una de las conocidas. España solo
  -- entra comprobada por cálculo: un DNI, NIE o CIF que no cuadra no llega.
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'Falta el país del documento';
  end if;
  if coalesce(p_tax_id_verification, '') not in
     ('checksum', 'registry', 'registry_not_found', 'registry_unavailable', 'unverified') then
    raise exception 'Falta cómo se comprobó el documento';
  end if;
  if v_country = 'ES' and p_tax_id_verification <> 'checksum' then
    raise exception 'Un documento español solo entra con su cálculo de control comprobado';
  end if;

  -- Ya tiene cuenta: no se abre una solicitud que nadie podría aprobar
  -- —una persona, una cuenta, un correo— y quien se entera es la
  -- dirección, no la pantalla.
  if exists (select 1 from public.profiles p where lower(p.email) = v_email) then
    perform public.queue_platform_email(
      'access_request_already_registered', v_email,
      jsonb_build_object('contact_name', btrim(p_contact_name)),
      'already:' || v_email || ':' || to_char(now(), 'YYYY-MM-DD')
    );
    return;
  end if;

  -- Ya tiene una abierta: tampoco se abre otra, y se le recuerda por dónde
  -- va la suya. La clave del enlace NO se regenera: si se regenerara,
  -- cualquiera podría invalidar el seguimiento de otro reenviando el
  -- formulario con su correo.
  select id, follow_up_token into v_id, v_token
  from public.access_requests
  where lower(email) = v_email and status in ('submitted', 'needs_information')
  limit 1;

  if v_id is not null then
    perform public.queue_platform_email(
      'access_request_received', v_email,
      jsonb_build_object('contact_name', btrim(p_contact_name), 'follow_up_token', v_token),
      'received:' || v_id::text
    );
    return;
  end if;

  insert into public.access_requests (
    contact_name, business_name, phone, email, tax_id,
    tax_id_country, tax_id_verification, tax_id_registry_name, comments
  )
  values (btrim(p_contact_name), btrim(p_business_name), btrim(p_phone), v_email, v_tax_id,
          v_country, p_tax_id_verification, nullif(btrim(coalesce(p_tax_id_registry_name, '')), ''),
          nullif(btrim(coalesce(p_comments, '')), ''))
  returning id, follow_up_token into v_id, v_token;

  insert into public.access_request_events (request_id, from_status, to_status)
  values (v_id, null, 'submitted');

  -- RN-ACC-08 · con `space_id` nulo y `actor_id` nulo: no hay espacio, y
  -- quien la escribió no es nadie en Restavor web todavía.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (null, null, 'access_request.submitted', 'access_request', v_id,
          jsonb_build_object('status', 'submitted'));

  perform public.queue_platform_email(
    'access_request_received', v_email,
    jsonb_build_object('contact_name', btrim(p_contact_name), 'follow_up_token', v_token),
    'received:' || v_id::text
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.support_session_actions(p_session_id uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, action text, entity_type text, entity_id uuid, old_value jsonb, new_value jsonb, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space uuid;
begin
  select ss.space_id into v_space from public.support_sessions ss where ss.id = p_session_id;
  if v_space is null then
    raise exception 'Sesión de soporte no encontrada';
  end if;
  if not (public.is_platform_member() or public.has_capability(v_space, 'manage_space')) then
    raise exception 'Solo Restavor web o el propietario del espacio ven lo que se hizo en una sesión de soporte';
  end if;

  return query
    select a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.old_value, a.new_value, a.reason
    from public.audit_log a
    where a.support_session_id = p_session_id
      -- Abrir y cerrar son la sesión misma, no lo que se hizo dentro: la
      -- fila de `support_sessions` ya lo cuenta. Mismo criterio que
      -- `actions_count` en `platform_list_support_sessions()`.
      and a.action not in ('support.session_started', 'support.session_ended')
    order by a.created_at asc;
end;
$function$
;


-- 2. El centro de ayuda.
update public.help_articles
set title = regexp_replace(title, '\mCuotly\M', 'Restavor web', 'g'),
    body = regexp_replace(body, '\mCuotly\M', 'Restavor web', 'g')
where title ~ '\mCuotly\M' or body ~ '\mCuotly\M';
