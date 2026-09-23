-- ============================================================
-- Migración 133 · Lo que el equipo hace en nombre del restaurante no deja
--                 su identidad a la vista del restaurante (P7; decisiones
--                 21 y 73)
-- ============================================================
--
-- La migración 132 dejó sin autor en la columna las solicitudes que el
-- equipo crea en nombre del restaurante (`create_request_on_behalf()`),
-- porque `requests.created_by` lo lee el restaurante. Había otra ruta que
-- hace lo mismo y no lo hacía: responder un presupuesto en su nombre
-- (decisión 21, migración 80). La suite 74 la recorre y barre, sentada
-- como el restaurante, toda columna uuid y de texto; salían tres:
--
--   · `requests.created_by`: `accept_quote()` crea la solicitud cuando el
--     presupuesto no tenía, con `auth.uid()` del administrador.
--   · `requests.accepted_by` y `acceptances.accepted_by`: `accept_quote()`
--     llama a `accept_request()`, que apunta como quien acepta a quien
--     llama, también cuando es el equipo en su nombre.
--
-- Las tres son columnas que el restaurante lee porque hasta la decisión
-- 21 solo él creaba y aceptaba. Revocarlas rompería las pantallas que
-- las leen; la solución es la de la 132: cuando es el equipo en su
-- nombre, no se escriben. Quién fue lo dice `audit_log` (`quote.accepted`
-- lleva actor, motivo y `on_behalf_of_client`), que es de donde lo saca el
-- equipo (CLAUDE.md).
--
-- La solicitud que nace así queda marcada como creada por el equipo, con
-- el motivo que se dio al aceptar (RN-REQ-08): el restaurante ve que se
-- hizo en su nombre y por qué, y no quién.
--
-- En producción no hay ninguna fila que sanear: el 23/09/2026 no había
-- ningún presupuesto respondido por el equipo (`quotes.decided_by_team`).
--
-- Se comprueba con `supabase/tests/en_nombre_del_restaurante_sin_identidad.sql`
-- (suite 74).

alter table public.acceptances alter column accepted_by drop not null;

comment on column public.acceptances.accepted_by is
  'Quién del restaurante aceptó. Vacío cuando la aceptación la registró el equipo en su nombre (decisión 21, migración 133): el restaurante lee esta columna (P7), y quién fue está en audit_log.';

comment on column public.requests.accepted_by is
  'Quién del restaurante aceptó la propuesta. Vacío cuando la registró el equipo en su nombre (decisión 21, migración 133); quién fue está en audit_log.';

-- ------------------------------------------------------------
-- accept_request(): la de la migración 132, con quien acepta vacío cuando
-- no es el restaurante. `create or replace` conserva sus privilegios.
-- ------------------------------------------------------------

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
  -- Migración 133 · quién acepta, si es el restaurante; nadie si es el
  -- equipo en su nombre (P7: `accepted_by` lo lee el restaurante).
  v_accepted_by uuid;
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

  v_accepted_by := case when public.can_write_establishment(v_establishment_id) then auth.uid() end;

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
    (v_space_id, v_establishment_id, p_request_id, v_job_id, v_category, v_cycle_id, v_entry_id, v_budgeted, v_accepted_by);

  update public.requests set state = 'accepted', accepted_by = v_accepted_by, accepted_at = now() where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.accepted', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'accepted', 'job_id', v_job_id, 'job_code', v_job_code, 'budgeted', v_budgeted, 'quote_id', v_quote_id)
  );
end;
$function$;

-- ------------------------------------------------------------
-- accept_quote(): la de la migración 80, con la solicitud que crea en su
-- nombre marcada y sin autor en la columna.
-- ------------------------------------------------------------

create or replace function public.accept_quote(p_quote_id uuid, p_reason text DEFAULT NULL::text)
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
  -- restaurante lo aceptó fuera de Cuotly, en su nombre y con motivo.
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
$function$;
