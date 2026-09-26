-- ============================================================
-- Migración 149 · El motor de créditos (decisión 85, PRD §41,
--                 RN-CRE-03 a RN-CRE-20)
-- ============================================================
--
-- Punto 2 del plan de la decisión 85: el servidor aprende a medir en
-- créditos. **No cambia el catálogo** (eso va con el punto 7): hasta que
-- la IA valore en créditos (punto 3), una solicitud clasificada por
-- categoría sigue exactamente el camino de siempre. Lo que llega:
--
--   · `plans.included_credits_half` y su copia en cada ciclo
--     (`consumption_cycles.included_credits_half`): los créditos del plan,
--     en **medios créditos** enteros (RN-CRE-04; 40 = 20 créditos).
--   · Una categoría más, `credits`, en el libro de consumos, los trabajos,
--     las aceptaciones, las clasificaciones, las solicitudes y los
--     presupuestos. El libro sigue siendo el mismo (CLAUDE.md, libro
--     inmutable con signo): un débito de 6,5 créditos es un apunte de −13
--     en la categoría `credits`. No hay contadores.
--   · `record_credit_valuation()`: la IA fija los créditos y la solicitud
--     pasa directamente a que el restaurante la acepte (RN-CRE-09).
--     `set_request_credits()`: el equipo los fija si la IA falló, o los
--     corrige antes de que el restaurante acepte (RN-CRE-10).
--   · `accept_request()` con créditos: fijos al aceptar (RN-CRE-12), con
--     bloqueo de fila sobre el ciclo; si no llegan, un error propio
--     (`CRE14`) para que la pantalla ofrezca las tres salidas (RN-CRE-14).
--   · `defer_request_to_next_cycle()` y su barrido: esperar al ciclo
--     siguiente (RN-CRE-14, opción 2).
--   · Cancelar devuelve lo que se gastó, no una unidad (RN-CRE-13).
--   · El cambio de plan a mitad de ciclo da créditos proporcionales,
--     redondeando al medio crédito (RN-CRE-15).
--   · El plazo de ejecución sale de los créditos (RN-CRE-18) y, por encima
--     de 20, lo fija el equipo antes de comenzar (RN-CRE-19).
--   · Avisos del 80 % y el 100 % también para los créditos, y
--     `establishment_credit_balance()` para la barra (RN-CRE-16).
--   · `create_plan()` y `revise_plan()` aceptan los créditos del plan.
--
-- Se comprueba con `supabase/tests/el_motor_de_creditos.sql`.

-- ------------------------------------------------------------
-- 1 · Esquema
-- ------------------------------------------------------------
alter table public.plans
  add column included_credits_half integer not null default 0
    check (included_credits_half >= 0);

comment on column public.plans.included_credits_half is
  'RN-CRE-01 · créditos incluidos al mes, en medios créditos (40 = 20 créditos, RN-CRE-04).';

alter table public.consumption_cycles
  add column included_credits_half integer not null default 0
    check (included_credits_half >= 0);

comment on column public.consumption_cycles.included_credits_half is
  'Créditos del ciclo en medios créditos, copiados del plan al crear el ciclo (RN-CON-05).';

-- La categoría `credits` en todas las tablas que ya tienen categoría.
alter table public.consumption_entries drop constraint consumption_entries_category_check;
alter table public.consumption_entries add constraint consumption_entries_category_check
  check (category in ('small', 'photo', 'medium', 'large', 'credits'));

alter table public.jobs drop constraint jobs_category_check;
alter table public.jobs add constraint jobs_category_check
  check (category in ('small', 'photo', 'medium', 'large', 'credits'));

alter table public.acceptances drop constraint acceptances_category_check;
alter table public.acceptances add constraint acceptances_category_check
  check (category in ('small', 'photo', 'medium', 'large', 'credits'));

alter table public.quotes drop constraint quotes_category_check;
alter table public.quotes add constraint quotes_category_check
  check (category in ('small', 'photo', 'medium', 'large', 'credits'));

alter table public.requests drop constraint requests_validated_category_check;
alter table public.requests add constraint requests_validated_category_check
  check (validated_category in ('small', 'photo', 'medium', 'large', 'credits'));

alter table public.classifications drop constraint classifications_proposed_category_check;
alter table public.classifications add constraint classifications_proposed_category_check
  check (proposed_category in ('small', 'photo', 'medium', 'large', 'credits'));

alter table public.classifications drop constraint classifications_decided_category_check;
alter table public.classifications add constraint classifications_decided_category_check
  check (decided_category in ('small', 'photo', 'medium', 'large', 'credits'));

-- Lo que valoró la IA (RN-CLS-04 aplicado a los créditos).
alter table public.classifications
  add column proposed_credits_half integer check (proposed_credits_half >= 1),
  add column proposed_breakdown jsonb,
  add column prompt_version text,
  add column decided_credits_half integer check (decided_credits_half >= 1);

-- Lo que la solicitud cuesta, y la espera al ciclo siguiente.
alter table public.requests
  add column validated_credits_half integer check (validated_credits_half >= 1),
  add column credit_breakdown jsonb,
  add column credits_deferred_until timestamptz,
  add column credits_deferred_by uuid references public.profiles (id);

-- `requests` va con privilegio de columna (CLAUDE.md): lo nuevo se concede
-- columna a columna. `credits_deferred_by` no: es quién, y se lee por la
-- auditoría.
grant select (validated_credits_half, credit_breakdown, credits_deferred_until)
  on public.requests to authenticated;

alter table public.jobs
  add column credits_half integer check (credits_half >= 1);

alter table public.acceptances
  add column credits_half integer check (credits_half >= 1);

-- ------------------------------------------------------------
-- 2 · El plazo por créditos (RN-CRE-18)
-- ------------------------------------------------------------
--
-- Hoy los tramos son los mismos para todos los planes (decisión 85: "igual
-- en Impulso y Premium"), así que viven aquí y no en cuatro columnas más de
-- `plans`. Por encima de 20 créditos no hay plazo automático (RN-CRE-19):
-- devuelve null.
create or replace function public.credit_execution_sla_hours(p_credits_half integer)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_credits_half is null or p_credits_half < 1 then null
    when p_credits_half <= 8 then 48    -- 0,5–4 créditos: 1–2 días laborables
    when p_credits_half <= 20 then 72   -- 4,5–10: 1–3
    when p_credits_half <= 30 then 96   -- 10,5–15: 1–4
    when p_credits_half <= 40 then 120  -- 15,5–20: 1–5
    else null                           -- más de 20: lo fija el equipo
  end;
$$;

comment on function public.credit_execution_sla_hours(integer) is
  'RN-CRE-18 · plazo de ejecución en horas laborables según los créditos de
   la solicitud (en medios créditos). Null por encima de 20 créditos:
   RN-CRE-19, lo fija el equipo antes de comenzar.';

-- ------------------------------------------------------------
-- 3 · El ciclo copia los créditos del plan
-- ------------------------------------------------------------
create or replace function public.get_or_create_consumption_cycle_internal(p_subscription_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_establishment_id uuid;
  v_space_id uuid;
  v_started_at timestamptz;
  v_timezone text;
  v_included_small integer;
  v_included_photo integer;
  v_included_medium integer;
  v_included_large integer;
  v_included_credits integer;
  v_local_start timestamp;
  v_local_now timestamp;
  v_k integer := 0;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_cycle_id uuid;
begin
  -- Migración 131 · si al periodo le toca una versión nueva, la bolsa nace
  -- ya con ella.
  perform public.apply_due_revision_internal(p_subscription_id);

  select s.establishment_id, s.space_id, s.started_at,
         p.included_small, p.included_photo, p.included_medium, p.included_large,
         p.included_credits_half
  into v_establishment_id, v_space_id, v_started_at,
       v_included_small, v_included_photo, v_included_medium, v_included_large,
       v_included_credits
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.id = p_subscription_id and s.kind = 'plan';

  if v_establishment_id is null then
    raise exception 'Suscripción de plan no encontrada';
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
    (space_id, establishment_id, subscription_id, cycle_start, cycle_end,
     included_small, included_photo, included_medium, included_large, included_credits_half)
  values
    (v_space_id, v_establishment_id, p_subscription_id, v_cycle_start, v_cycle_end,
     v_included_small, v_included_photo, v_included_medium, v_included_large, v_included_credits)
  on conflict (subscription_id, cycle_start)
  do update set cycle_start = excluded.cycle_start
  returning id into v_cycle_id;

  return v_cycle_id;
end;
$function$;

-- ------------------------------------------------------------
-- 4 · La IA fija los créditos (RN-CRE-09) y el equipo, si falla (RN-CRE-10)
-- ------------------------------------------------------------
--
-- El desglose es `{"items": [{"description": text, "credits_half": int}, …]}`
-- y el total es 1 (los 0,5 de procesamiento, RN-CRE-05) más la suma de sus
-- partidas. Si hay desglose, tiene que cuadrar: la barra del cliente y el
-- detalle no pueden contar cosas distintas.
create or replace function public.credit_breakdown_total_internal(p_breakdown jsonb)
returns integer
language sql
immutable
set search_path = public
as $$
  select 1 + coalesce((
    select sum((i ->> 'credits_half')::integer)
    from jsonb_array_elements(coalesce(p_breakdown -> 'items', '[]'::jsonb)) i
  ), 0)::integer;
$$;

revoke all on function public.credit_breakdown_total_internal(jsonb) from public, anon, authenticated;

create or replace function public.assert_credit_breakdown_internal(p_credits_half integer, p_breakdown jsonb)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_credits_half is null or p_credits_half < 1 then
    raise exception 'Una solicitud cuesta al menos 0,5 créditos de procesamiento (RN-CRE-05)';
  end if;
  if p_breakdown is not null then
    if jsonb_typeof(p_breakdown -> 'items') is distinct from 'array' then
      raise exception 'El desglose de créditos no tiene partidas';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_breakdown -> 'items') i
      where coalesce((i ->> 'credits_half')::integer, 0) < 1
         or btrim(coalesce(i ->> 'description', '')) = ''
    ) then
      raise exception 'Cada partida del desglose necesita su descripción y al menos 0,5 créditos';
    end if;
    if public.credit_breakdown_total_internal(p_breakdown) <> p_credits_half then
      raise exception 'El desglose no suma los créditos de la solicitud (0,5 de procesamiento más las partidas)';
    end if;
  end if;
end;
$$;

revoke all on function public.assert_credit_breakdown_internal(integer, jsonb) from public, anon, authenticated;

-- Lo llama el servidor de la web (cliente de administración) después de
-- preguntar a la IA, como `record_classification()`. Comprueba por su
-- cuenta que el actor puede analizar la solicitud.
create or replace function public.record_credit_valuation(
  p_request_id uuid,
  p_actor_id uuid,
  p_credits_half integer,
  p_breakdown jsonb,
  p_summary text,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_estimated_cost_millicents integer default null,
  p_prompt_version text default null
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
  v_kind text;
  v_classification_id uuid;
  v_millicents integer := coalesce(p_estimated_cost_millicents, 0);
  v_next_state text;
begin
  select space_id, establishment_id, state, kind
  into v_space_id, v_establishment_id, v_state, v_kind
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  -- Idempotente: si ya se valoró, se devuelve la última valoración.
  if v_state in ('pending_client_acceptance', 'pending_internal_validation') then
    select id into v_classification_id from public.classifications
    where request_id = p_request_id order by created_at desc limit 1;
    return v_classification_id;
  end if;

  if v_state <> 'analyzing' then
    raise exception 'La solicitud no está en análisis';
  end if;

  if not (
    public.can_write_establishment_as(v_establishment_id, p_actor_id)
    or public.has_capability_as(v_space_id, p_actor_id, 'manage_requests')
  ) then
    raise exception 'El actor indicado no puede analizar esta solicitud';
  end if;

  perform public.assert_credit_breakdown_internal(p_credits_half, p_breakdown);

  -- La valora siempre la IA: sin modelo no hay valoración (RN-CLS-05).
  if p_model is null then
    raise exception 'La valoración en créditos la hace la IA: falta el modelo';
  end if;

  insert into public.classifications
    (request_id, space_id, source, proposed_category, proposed_summary, model, input_tokens,
     output_tokens, proposed_credits_half, proposed_breakdown, prompt_version)
  values
    (p_request_id, v_space_id, 'ai', 'credits', p_summary, p_model, p_input_tokens,
     p_output_tokens, p_credits_half, p_breakdown, p_prompt_version)
  returning id into v_classification_id;

  insert into public.ai_usage (
    space_id, request_id, classification_id, model, input_tokens, output_tokens,
    estimated_cost_millicents, estimated_cost_cents
  )
  values (
    v_space_id, p_request_id, v_classification_id, p_model,
    coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0),
    v_millicents, round(v_millicents / 1000.0)
  );

  -- RN-REQ-11 · una incidencia no se valora en créditos: la resuelve el
  -- equipo con su diagnóstico. La valoración queda guardada y va al equipo.
  v_next_state := case when v_kind = 'incident' then 'pending_internal_validation'
                       else 'pending_client_acceptance' end;

  if v_next_state = 'pending_client_acceptance' then
    -- RN-CRE-09 · sin validación del equipo: la cifra de la IA es la que ve
    -- el restaurante.
    update public.requests
    set state = 'pending_client_acceptance',
        validated_category = 'credits',
        validated_credits_half = p_credits_half,
        credit_breakdown = p_breakdown,
        validated_summary = p_summary,
        validated_by = null,
        validated_at = now()
    where id = p_request_id;

    -- RN-SLA-03 · T1 se detiene al pasar a pendiente de aceptación.
    insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
    values (v_space_id, 't1', 'request', p_request_id, 'stopped', now(), p_actor_id);
  else
    update public.requests set state = 'pending_internal_validation' where id = p_request_id;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, p_actor_id, 'request.credits_valued', 'request', p_request_id,
    jsonb_build_object('state', 'analyzing'),
    jsonb_build_object('state', v_next_state, 'source', 'ai', 'credits_half', p_credits_half,
                       'prompt_version', p_prompt_version)
  );

  return v_classification_id;
end;
$$;

comment on function public.record_credit_valuation(uuid, uuid, integer, jsonb, text, text, integer, integer, integer, text) is
  'RN-CRE-09 · la IA fija los créditos de la solicitud y pasa directamente a
   que el restaurante la acepte. Una incidencia va al equipo (RN-REQ-11).
   Idempotente.';

revoke all on function public.record_credit_valuation(uuid, uuid, integer, jsonb, text, text, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_credit_valuation(uuid, uuid, integer, jsonb, text, text, integer, integer, integer, text)
  to service_role;

create or replace function public.set_request_credits(
  p_request_id uuid,
  p_credits_half integer,
  p_breakdown jsonb,
  p_summary text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_classification_id uuid;
begin
  select id, space_id, state, kind, validated_credits_half
  into v_request
  from public.requests where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.has_capability(v_request.space_id, 'manage_requests') then
    raise exception 'No tienes permiso para fijar los créditos de esta solicitud';
  end if;

  if v_request.kind = 'incident' then
    raise exception 'Una incidencia se resuelve con su diagnóstico, no se valora en créditos';
  end if;

  -- RN-CRE-10 · el equipo interviene si la IA falló (validación interna) o
  -- para corregir antes de que el restaurante acepte. Después, nunca
  -- (RN-CRE-12).
  if v_request.state not in ('pending_internal_validation', 'pending_client_acceptance') then
    raise exception 'Los créditos solo se fijan antes de que el restaurante acepte (RN-CRE-12)';
  end if;

  perform public.assert_credit_breakdown_internal(p_credits_half, p_breakdown);

  select id into v_classification_id from public.classifications
  where request_id = p_request_id order by created_at desc limit 1;

  if v_classification_id is not null then
    update public.classifications
    set decided_category = 'credits', decided_credits_half = p_credits_half,
        decided_summary = p_summary, decided_by = auth.uid(), decided_at = now()
    where id = v_classification_id;
  end if;

  update public.requests
  set state = 'pending_client_acceptance',
      validated_category = 'credits',
      validated_credits_half = p_credits_half,
      credit_breakdown = p_breakdown,
      validated_summary = p_summary,
      validated_by = auth.uid(),
      validated_at = now(),
      -- La espera al ciclo siguiente se pidió con la cifra anterior.
      credits_deferred_until = null,
      credits_deferred_by = null
  where id = p_request_id;

  if v_request.state = 'pending_internal_validation' then
    insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
    values (v_request.space_id, 't1', 'request', p_request_id, 'stopped', now(), auth.uid());
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_request.space_id, auth.uid(), 'request.credits_set', 'request', p_request_id,
    jsonb_build_object('state', v_request.state, 'credits_half', v_request.validated_credits_half),
    jsonb_build_object('state', 'pending_client_acceptance', 'credits_half', p_credits_half),
    p_reason
  );
end;
$$;

comment on function public.set_request_credits(uuid, integer, jsonb, text, text) is
  'RN-CRE-10 · el propietario o un administrador fijan los créditos si la IA
   falló, o los corrigen antes de que el restaurante acepte. Queda en la
   auditoría con el valor anterior y el nuevo.';

revoke all on function public.set_request_credits(uuid, integer, jsonb, text, text) from public, anon;
grant execute on function public.set_request_credits(uuid, integer, jsonb, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5 · Aceptar con créditos (RN-CRE-11 y RN-CRE-12)
-- ------------------------------------------------------------
--
-- Mismo cuerpo que la migración 147 con la rama de créditos. Lo que no es
-- `credits` sigue exactamente igual.
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
  v_included_credits integer;
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
  v_accepted_by uuid;
  v_kind text;
  v_outcome text;
  v_free boolean := false;
  -- Migración 149 · lo que cuesta la solicitud, en medios créditos.
  v_credits integer;
  v_debit integer := -1;
begin
  select space_id, establishment_id, state, validated_category, kind, incident_outcome, validated_credits_half
  into v_space_id, v_establishment_id, v_state, v_category, v_kind, v_outcome, v_credits
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  select q.id, q.state into v_quote_id, v_quote_state
  from public.quotes q
  where q.request_id = p_request_id
  order by q.created_at desc
  limit 1;

  if not public.can_write_establishment(v_establishment_id)
     and not (coalesce(v_quote_state = 'accepted', false)
              and public.has_capability(v_space_id, 'manage_requests'))
     and not (v_kind = 'incident' and v_outcome = 'restavor_error'
              and public.has_capability(v_space_id, 'manage_requests')) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  v_accepted_by := case
    when v_kind = 'incident' and v_outcome = 'restavor_error' then null
    when public.can_write_establishment(v_establishment_id) then auth.uid()
  end;

  if v_state = 'accepted' then
    return; -- CA-17: pulsar aceptar dos veces no duplica el efecto.
  end if;

  if v_state <> 'pending_client_acceptance' then
    raise exception 'La solicitud no está pendiente de aceptación';
  end if;

  if v_category is null then
    raise exception 'La solicitud no tiene una categoría validada';
  end if;

  if v_category = 'credits' and v_credits is null then
    raise exception 'La solicitud no tiene sus créditos fijados';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  if v_quote_id is not null and v_quote_state in ('draft', 'sent') then
    raise exception 'Esta solicitud se presupuesta aparte: la aceptación es la del presupuesto (§84)';
  end if;

  if v_quote_id is not null and v_quote_state = 'rejected' then
    raise exception 'El presupuesto de esta solicitud se rechazó: el equipo tiene que enviar otro, o puedes no continuarla';
  end if;

  if v_kind = 'incident' and not coalesce(v_quote_state = 'accepted', false) then
    if v_outcome = 'restavor_error' then
      v_free := true;
    else
      raise exception 'Una incidencia no gasta del plan: o se arregla sin coste o se presupuesta aparte';
    end if;
  end if;

  update public.requests r
  set accepted_start_sla_hours = (
    select p.start_sla_hours
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.establishment_id = v_establishment_id and s.kind = 'plan' and s.status = 'active'
    limit 1
  )
  where r.id = p_request_id and r.accepted_start_sla_hours is null;

  if v_category = 'credits' then
    -- RN-CRE-18 · el plazo sale de los créditos; por encima de 20, null
    -- hasta que el equipo lo fije (RN-CRE-19).
    v_execution_sla := public.credit_execution_sla_hours(v_credits);
  else
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
  end if;

  if v_free then
    v_budgeted := false;
  elsif v_quote_id is null then
    select s.id, p.included_small, p.included_photo, p.included_medium, p.included_large, p.included_credits_half
    into v_subscription_id, v_included_small, v_included_photo, v_included_medium, v_included_large, v_included_credits
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
        when 'credits' then v_included_credits
      end;

      if v_included > 0 then
        v_budgeted := false;
        -- RN-CON-06 · bloqueo de fila sobre el ciclo: solo una solicitud
        -- gasta los últimos créditos.
        v_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);

        select case v_category
          when 'small' then included_small
          when 'photo' then included_photo
          when 'medium' then included_medium
          when 'large' then included_large
          when 'credits' then included_credits_half
        end into v_cycle_included
        from public.consumption_cycles where id = v_cycle_id;

        select v_cycle_included + coalesce(sum(amount), 0) into v_balance
        from public.consumption_entries
        where consumption_cycle_id = v_cycle_id and category = v_category;

        if v_category = 'credits' then
          -- RN-CRE-14 · no se hace por lo que le queda: la pantalla ofrece
          -- quitar cosas, esperar o presupuestar.
          if v_balance < v_credits then
            raise exception 'No te quedan créditos suficientes en este ciclo para esta solicitud (RN-CRE-14)'
              using errcode = 'CRE14',
                    detail = json_build_object('needed_half', v_credits, 'remaining_half', greatest(v_balance, 0))::text;
          end if;
          v_debit := -v_credits;
        elsif v_balance <= 0 then
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
    (space_id, establishment_id, request_id, code, category, quote_id, execution_sla_hours, credits_half)
  values
    (v_space_id, v_establishment_id, p_request_id, v_job_code, v_category, v_quote_id, v_execution_sla,
     case when v_category = 'credits' then v_credits end)
  returning id into v_job_id;

  if not v_budgeted and not v_free then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, created_by)
    values
      (v_space_id, v_establishment_id, v_cycle_id, v_category, v_debit, 'debit', p_request_id, v_job_id, auth.uid())
    returning id into v_entry_id;
  end if;

  insert into public.acceptances
    (space_id, establishment_id, request_id, job_id, category, consumption_cycle_id, consumption_entry_id, budgeted,
     free_of_charge, accepted_by, credits_half)
  values
    (v_space_id, v_establishment_id, p_request_id, v_job_id, v_category, v_cycle_id, v_entry_id, v_budgeted,
     v_free, v_accepted_by, case when v_category = 'credits' then v_credits end);

  update public.requests
  set state = 'accepted', accepted_by = v_accepted_by, accepted_at = now(),
      credits_deferred_until = null, credits_deferred_by = null
  where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.accepted', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'accepted', 'job_id', v_job_id, 'job_code', v_job_code, 'budgeted', v_budgeted,
                       'quote_id', v_quote_id, 'free_of_charge', v_free,
                       'credits_half', case when v_category = 'credits' and not v_budgeted and not v_free then v_credits end)
  );
end;
$function$;

-- ------------------------------------------------------------
-- 6 · Cancelar devuelve lo que se gastó (RN-CRE-13)
-- ------------------------------------------------------------
--
-- Mismo cuerpo que el vigente; el apunte de devolución es el inverso del
-- débito (antes, siempre 1: con categorías cada cambio era una unidad).
create or replace function public.cancel_accepted_request(p_request_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_debit_amount integer;
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

  if v_request_state not in ('accepted', 'in_progress') then
    raise exception 'La solicitud no está en un estado que se pueda cancelar';
  end if;

  v_before_start := v_started_at is null;
  v_new_state := case when v_before_start then 'cancelled_before_start' else 'cancelled_after_start' end;

  update public.jobs
  set state = v_new_state, cancelled_reason = p_reason, cancelled_by = auth.uid(), cancelled_at = now()
  where id = v_job_id;

  update public.requests set state = v_new_state where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  select v_space_id, te.counter_kind, 'job', v_job_id, 'stopped', now(), auth.uid()
  from (select distinct counter_kind from public.timer_events
        where entity_type = 'job' and entity_id = v_job_id) te
  where (
    select event_type from public.timer_events
    where entity_type = 'job' and entity_id = v_job_id and counter_kind = te.counter_kind
    order by occurred_at desc, id desc limit 1
  ) in ('started', 'resumed');

  perform public.record_state_event(v_space_id, 'job', v_job_id, v_job_state, v_new_state, p_reason);

  if v_before_start then
    select ce.id, ce.consumption_cycle_id, ce.category, ce.amount
    into v_debit_entry_id, v_original_cycle_id, v_category, v_debit_amount
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
          (v_space_id, v_establishment_id, v_original_cycle_id, v_category, -v_debit_amount, 'return', p_request_id, v_job_id, v_debit_entry_id, p_reason, auth.uid());
      else
        insert into public.consumption_entries
          (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, related_entry_id, reason, created_by)
        values
          (v_space_id, v_establishment_id, v_current_cycle_id, v_category, -v_debit_amount, 'compensatory_credit', p_request_id, v_job_id, v_debit_entry_id,
           coalesce(p_reason || ' ', '') || '(crédito compensatorio: el ciclo original ya había cerrado)', auth.uid());
      end if;
    end if;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'request.cancelled', 'request', p_request_id,
    jsonb_build_object('state', v_request_state, 'job_state', v_job_state),
    jsonb_build_object('state', v_new_state, 'consumption_returned', v_before_start and v_debit_entry_id is not null),
    p_reason
  );
end;
$function$;

-- ------------------------------------------------------------
-- 7 · Esperar al ciclo siguiente (RN-CRE-14, opción 2)
-- ------------------------------------------------------------
create or replace function public.defer_request_to_next_cycle(p_request_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_subscription_id uuid;
  v_included integer;
  v_cycle_id uuid;
  v_cycle_end timestamptz;
  v_balance integer;
begin
  select id, space_id, establishment_id, state, validated_category, validated_credits_half, credits_deferred_until
  into v_request
  from public.requests where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  -- Lo decide el restaurante: es su plan y su espera.
  if not public.can_write_establishment(v_request.establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_request.state <> 'pending_client_acceptance' or v_request.validated_category is distinct from 'credits' then
    raise exception 'Solo espera al ciclo siguiente una solicitud valorada en créditos y pendiente de aceptar';
  end if;

  if v_request.credits_deferred_until is not null then
    return v_request.credits_deferred_until; -- Idempotente.
  end if;

  select s.id, p.included_credits_half into v_subscription_id, v_included
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = v_request.establishment_id and s.kind = 'plan' and s.status = 'active'
  limit 1;

  if v_subscription_id is null or coalesce(v_included, 0) = 0 then
    raise exception 'Tu plan no incluye créditos: esta solicitud se presupuesta aparte';
  end if;

  if v_request.validated_credits_half > v_included then
    raise exception 'Esta solicitud cuesta más créditos de los que trae tu plan en un ciclo: se presupuesta aparte o se quitan cosas';
  end if;

  v_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);

  select cc.cycle_end, cc.included_credits_half + coalesce((
    select sum(ce.amount) from public.consumption_entries ce
    where ce.consumption_cycle_id = cc.id and ce.category = 'credits'), 0)
  into v_cycle_end, v_balance
  from public.consumption_cycles cc where cc.id = v_cycle_id;

  if v_balance >= v_request.validated_credits_half then
    raise exception 'Todavía te quedan créditos para esta solicitud en este ciclo: puedes aceptarla ya';
  end if;

  update public.requests
  set credits_deferred_until = v_cycle_end, credits_deferred_by = auth.uid()
  where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_request.space_id, auth.uid(), 'request.deferred_to_next_cycle', 'request', p_request_id,
          jsonb_build_object('until', v_cycle_end, 'credits_half', v_request.validated_credits_half));

  return v_cycle_end;
end;
$$;

comment on function public.defer_request_to_next_cycle(uuid) is
  'RN-CRE-14 · el restaurante elige esperar al ciclo siguiente: la solicitud
   queda en espera y el barrido la acepta en su nombre el día de la
   renovación si entonces cabe.';

revoke all on function public.defer_request_to_next_cycle(uuid) from public, anon;
grant execute on function public.defer_request_to_next_cycle(uuid) to authenticated;

-- El barrido: el día de la renovación acepta en nombre de quien pidió
-- esperar, con su propia identidad, para que la aceptación pase por las
-- mismas comprobaciones que si pulsara él (acceso de escritura vigente,
-- servicio en marcha, bloqueo de fila). Si ya no cabe o ya no puede, la
-- espera se cae y queda en la auditoría; la solicitud sigue pendiente de
-- aceptar, como antes de pedir la espera.
create or replace function public.run_deferred_credit_requests(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_done integer := 0;
  -- Las dos formas en que `auth.uid()` lee quién es: se fijan las dos y se
  -- devuelven como estaban al terminar.
  v_prev_sub text := current_setting('request.jwt.claim.sub', true);
  v_prev_claims text := current_setting('request.jwt.claims', true);
begin
  for r in
    select id, space_id, credits_deferred_by
    from public.requests
    where space_id = p_space_id
      and state = 'pending_client_acceptance'
      and credits_deferred_until is not null
      and credits_deferred_until <= now()
    order by credits_deferred_until, created_at
  loop
    begin
      perform set_config('request.jwt.claim.sub', r.credits_deferred_by::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', r.credits_deferred_by, 'role', 'authenticated')::text, true);
      perform public.accept_request(r.id);
      v_done := v_done + 1;
    exception when others then
      update public.requests
      set credits_deferred_until = null, credits_deferred_by = null
      where id = r.id;

      insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
      values (r.space_id, null, 'request.deferral_expired', 'request', r.id,
              jsonb_build_object('error', sqlerrm), 'No se pudo aceptar al renovar el ciclo');
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  return v_done;
end;
$$;

revoke all on function public.run_deferred_credit_requests(uuid) from public, anon, authenticated;

create or replace function public.run_scheduled_job(p_job_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Migración 149 · primero las esperas al ciclo nuevo (RN-CRE-14) y
    -- después los avisos, que ya las cuentan.
    v_hechos := public.run_deferred_credit_requests(v_space);
    v_hechos := v_hechos + public.run_consumption_thresholds(v_space);
  elsif v_kind = 'daily_menu_sweep' then
    v_hechos := public.run_daily_menu_sweep(v_space);
  elsif v_kind = 'cuotly_billing_sweep' then
    v_hechos := public.run_cuotly_billing_sweep(v_space);
  elsif v_kind = 'cuotly_storage_sweep' then
    v_hechos := public.run_cuotly_storage_sweep(v_space);
  elsif v_kind = 'backup_sweep' then
    v_hechos := public.run_backup_sweep(v_space);
  elsif v_kind = 'charge_reminders' then
    v_hechos := public.run_charge_reminders(v_space);
  elsif v_kind = 'notification_digests' then
    v_hechos := public.run_notification_digests(v_space);
  elsif v_kind = 'sla_sweep' then
    raise exception 'El barrido de plazos lo ejecuta src/services/queue-runner.ts, no SQL';
  else
    raise exception 'Tipo de trabajo de cola desconocido: %', v_kind;
  end if;

  perform public.finish_scheduled_job(p_job_id, true, null);
  return v_hechos;
end;
$function$;

-- ------------------------------------------------------------
-- 8 · La barra del restaurante (RN-CRE-16)
-- ------------------------------------------------------------
create or replace function public.establishment_credit_balance(p_establishment_id uuid)
returns table(included_half integer, used_half integer, remaining_half integer,
              percent_used integer, renews_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with ciclo as (
    select cc.*
    from public.consumption_cycles cc
    join public.subscriptions s on s.id = cc.subscription_id
    where cc.establishment_id = p_establishment_id
      and s.kind = 'plan' and s.status = 'active'
      and now() >= cc.cycle_start and now() < cc.cycle_end
    order by cc.cycle_start desc
    limit 1
  ),
  saldo as (
    select c.included_credits_half as incluido,
           c.included_credits_half + coalesce((
             select sum(ce.amount) from public.consumption_entries ce
             where ce.consumption_cycle_id = c.id and ce.category = 'credits'), 0) as queda,
           c.cycle_end
    from ciclo c
  )
  select
    s.incluido::integer,
    greatest(0, s.incluido - s.queda)::integer,
    s.queda::integer,
    -- RN-CRE-16 · el porcentaje lo calcula el servidor. Redondeo al entero
    -- más cercano (6,5 de 25 → 26 %), sin pasar de 100.
    least(100, round(greatest(0, s.incluido - s.queda) * 100.0 / s.incluido))::integer,
    s.cycle_end
  from saldo s
  where s.incluido > 0
    and public.can_read_establishment(p_establishment_id);
$$;

comment on function public.establishment_credit_balance(uuid) is
  'RN-CRE-16 · créditos del ciclo vigente (en medios créditos) y el
   porcentaje usado. Sin filas si el plan no incluye créditos.';

revoke all on function public.establishment_credit_balance(uuid) from public, anon;
grant execute on function public.establishment_credit_balance(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9 · Avisos del 80 % y el 100 % también en créditos
-- ------------------------------------------------------------
create or replace function public.run_consumption_thresholds(p_space_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fila record;
  v_recipient uuid;
  v_slug text;
  v_umbral integer;
  v_emitidos integer := 0;
begin
  v_slug := public.space_slug(p_space_id);

  for v_fila in
    with ciclo as (
      select cc.id, cc.establishment_id, cc.included_small, cc.included_photo,
             cc.included_medium, cc.included_large, cc.included_credits_half
      from public.consumption_cycles cc
      join public.subscriptions s on s.id = cc.subscription_id
      join public.establishments e on e.id = cc.establishment_id
      where cc.space_id = p_space_id
        and s.kind = 'plan' and s.status = 'active'
        and e.status not in ('archived', 'suspended')
        and now() >= cc.cycle_start and now() < cc.cycle_end
    ),
    incluido as (
      select id, establishment_id, 'small' as category, included_small as included from ciclo
      union all select id, establishment_id, 'photo', included_photo from ciclo
      union all select id, establishment_id, 'medium', included_medium from ciclo
      union all select id, establishment_id, 'large', included_large from ciclo
      union all select id, establishment_id, 'credits', included_credits_half from ciclo
    )
    select
      i.id as cycle_id,
      i.establishment_id,
      i.category,
      i.included,
      greatest(0, i.included - (i.included + coalesce((
        select sum(ce.amount) from public.consumption_entries ce
        where ce.consumption_cycle_id = i.id and ce.category = i.category
      ), 0)))::integer as consumido
    from incluido i
    where i.included > 0
  loop
    v_umbral := case
      when v_fila.consumido >= v_fila.included then 100
      when v_fila.consumido * 100 >= v_fila.included * 80 then 80
      else null
    end;

    if v_umbral is null then
      continue;
    end if;

    for v_recipient in
      select em.user_id from public.establishment_memberships em
      where em.establishment_id = v_fila.establishment_id and em.revoked_at is null
    loop
      if public.emit_notification(
           p_space_id, v_recipient,
           ('consumption_threshold_' || v_umbral)::text, 'client', 'establishment',
           v_fila.establishment_id,
           '/espacios/' || v_slug || '/restaurantes/' || v_fila.establishment_id::text,
           'consumption_threshold_' || v_umbral || ':' || v_fila.cycle_id::text || ':' || v_fila.category,
           v_fila.establishment_id, v_umbral) is not null then
        v_emitidos := v_emitidos + 1;
      end if;
    end loop;
  end loop;

  return v_emitidos;
end;
$function$;

-- ------------------------------------------------------------
-- 10 · Cambio de plan a mitad de ciclo (RN-CRE-15)
-- ------------------------------------------------------------
--
-- Cambia el tipo de lo que devuelve: se borra y se crea. `ceil` sobre
-- medios créditos es redondear hacia arriba al medio crédito.
drop function public.plan_change_proration(uuid, uuid);

create function public.plan_change_proration(p_subscription_id uuid, p_new_plan_id uuid)
 RETURNS TABLE(fraction numeric, difference_cents integer, extra_small integer, extra_photo integer,
               extra_medium integer, extra_large integer, extra_credits_half integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  extra_credits_half := greatest(0,
    ceil((v_new.included_credits_half - v_old.included_credits_half) * v_fraction)::integer);
  return next;
end;
$function$;

-- `plan_change_preview()` devuelve lo mismo que el prorrateo para la
-- pantalla: cambia con él. Mismo cuerpo.
drop function public.plan_change_preview(uuid, uuid);

create function public.plan_change_preview(p_subscription_id uuid, p_new_plan_id uuid)
 RETURNS TABLE(fraction numeric, difference_cents integer, extra_small integer, extra_photo integer,
               extra_medium integer, extra_large integer, extra_credits_half integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_new_space_id uuid;
begin
  select space_id into v_space_id from public.subscriptions
  where id = p_subscription_id and kind = 'plan' and status = 'active';

  if v_space_id is null then
    raise exception 'Suscripción de plan activa no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden ver el prorrateo de un cambio de plan';
  end if;

  select space_id into v_new_space_id from public.plans where id = p_new_plan_id;
  if v_new_space_id is null or v_new_space_id <> v_space_id then
    raise exception 'El plan no pertenece al mismo espacio que el establecimiento';
  end if;

  return query select * from public.plan_change_proration(p_subscription_id, p_new_plan_id);
end;
$function$;

revoke all on function public.plan_change_preview(uuid, uuid) from public, anon;
grant execute on function public.plan_change_preview(uuid, uuid) to authenticated;

-- Como estaba: interna, solo la llaman `change_plan_immediately()` y
-- `plan_change_preview()`.
revoke all on function public.plan_change_proration(uuid, uuid) from public, anon, authenticated;
grant execute on function public.plan_change_proration(uuid, uuid) to service_role;

create or replace function public.change_plan_immediately(p_subscription_id uuid, p_new_plan_id uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    return null;
  end if;

  if v_new_price <= v_old_price then
    raise exception 'Una reducción de plan solo se aplica en la renovación y tras cumplir la permanencia (RN-COM-17)';
  end if;

  v_key := coalesce(p_idempotency_key, 'plan_change:' || p_subscription_id::text || ':' || p_new_plan_id::text);

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
  -- RN-CRE-15 · y los créditos, en proporción, redondeando a favor.
  if v_pro.extra_credits_half > 0 then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason, created_by)
    values (v_space_id, v_establishment_id, v_cycle_id, 'credits', v_pro.extra_credits_half,
            'compensatory_credit', 'Mejora de plan (RN-CRE-15)', auth.uid());
  end if;

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

    insert into public.financial_entries
      (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
    values
      (v_space_id, v_establishment_id, v_charge_id, 'charge',
       v_pro.difference_cents + v_tax_cents,
       'Mejora a ' || v_new_name || ' (parte proporcional)', auth.uid());

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (v_space_id, auth.uid(), 'charge.issued', 'charge', v_charge_id,
            jsonb_build_object('establishment_id', v_establishment_id,
                               'total_cents', v_pro.difference_cents + v_tax_cents,
                               'cause', 'plan_change'));
  end if;

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
      'extra_credits_half', v_pro.extra_credits_half,
      'charge_id', v_charge_id, 'idempotency_key', v_key)
  );

  return v_charge_id;
end;
$function$;

-- ------------------------------------------------------------
-- 11 · Más de 20 créditos: el plazo lo fija el equipo (RN-CRE-19)
-- ------------------------------------------------------------
create or replace function public.set_job_execution_days(p_job_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
begin
  select id, space_id, state, category, credits_half, execution_sla_hours, started_at
  into v_job
  from public.jobs where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not public.has_capability(v_job.space_id, 'manage_requests') then
    raise exception 'No tienes permiso para fijar el plazo de este trabajo';
  end if;

  if v_job.category <> 'credits' or coalesce(v_job.credits_half, 0) <= 40 then
    raise exception 'Este trabajo tiene su plazo por los créditos: solo se fija a mano por encima de 20 (RN-CRE-19)';
  end if;

  if v_job.started_at is not null then
    raise exception 'El plazo se fija antes de comenzar (RN-CRE-19)';
  end if;

  if p_days is null or p_days < 1 then
    raise exception 'El plazo tiene que ser de al menos un día laborable';
  end if;

  if v_job.execution_sla_hours = p_days * 24 then
    return; -- Idempotente.
  end if;

  update public.jobs set execution_sla_hours = p_days * 24 where id = p_job_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_job.space_id, auth.uid(), 'job.execution_sla_set', 'job', p_job_id,
          jsonb_build_object('execution_sla_hours', v_job.execution_sla_hours),
          jsonb_build_object('execution_sla_hours', p_days * 24, 'days', p_days));
end;
$$;

comment on function public.set_job_execution_days(uuid, integer) is
  'RN-CRE-19 · en un trabajo de más de 20 créditos el equipo fija los días
   laborables antes de comenzar. Un día laborable son 24 h del reloj
   contractual (RN-CRE-18).';

revoke all on function public.set_job_execution_days(uuid, integer) from public, anon;
grant execute on function public.set_job_execution_days(uuid, integer) to authenticated;

create or replace function public.start_job(p_job_id uuid)
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
  v_gate record;
  v_category text;
  v_credits integer;
  v_execution_sla integer;
begin
  select space_id, state, assigned_to, request_id, establishment_id, category, credits_half, execution_sla_hours
  into v_space_id, v_state, v_assigned_to, v_request_id, v_establishment_id, v_category, v_credits, v_execution_sla
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if v_assigned_to is null or v_assigned_to <> auth.uid() then
    raise exception 'Solo el responsable asignado puede comenzar este trabajo';
  end if;

  if v_state = 'in_progress' then
    return;
  end if;

  if v_state <> 'assigned' then
    raise exception 'El trabajo no está asignado y pendiente de comenzar';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  -- RN-CRE-19 · más de 20 créditos: sin plazo fijado no se comienza.
  if v_category = 'credits' and coalesce(v_credits, 0) > 40 and v_execution_sla is null then
    raise exception 'Este trabajo pasa de 20 créditos: el equipo tiene que fijar su plazo antes de comenzar (RN-CRE-19)';
  end if;

  select q.requires_payment_before_start, q.start_authorized_at,
         coalesce(public.charge_outstanding_cents(c.id), 0) as outstanding
  into v_gate
  from public.jobs j
  join public.quotes q on q.id = j.quote_id
  left join public.charges c on c.quote_id = q.id
  where j.id = p_job_id;

  if found and v_gate.requires_payment_before_start and v_gate.start_authorized_at is null and v_gate.outstanding > 0 then
    raise exception 'Trabajo presupuestado con pago pendiente: hace falta el pago o la autorización de inicio (§84)';
  end if;

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

  perform public.notify_job_event(p_job_id, 'job_started');
end;
$function$;

-- ------------------------------------------------------------
-- 12 · Los créditos quedan fijos al aceptar (RN-CRE-12)
-- ------------------------------------------------------------
--
-- `request_new_client_acceptance()` reabre la aceptación para cambiar la
-- categoría (RN-SLA-08). Con créditos no se reabre: se ponen al aceptar y
-- no se tocan. Se envuelve en vez de reescribirla.
alter function public.request_new_client_acceptance(uuid, text, text, text)
  rename to request_new_client_acceptance_categories;

revoke all on function public.request_new_client_acceptance_categories(uuid, text, text, text)
  from public, anon, authenticated;

create function public.request_new_client_acceptance(p_job_id uuid, p_new_category text, p_summary text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select space_id into v_space_id from public.jobs where id = p_job_id;
  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;
  if not public.has_capability(v_space_id, 'manage_requests') then
    raise exception 'No tienes permiso para reabrir la aceptación de esta solicitud';
  end if;
  if (select category from public.jobs where id = p_job_id) = 'credits'
     or p_new_category = 'credits' then
    raise exception 'Los créditos quedan fijos al aceptar: no se vuelve a pedir la aceptación (RN-CRE-12)';
  end if;
  perform public.request_new_client_acceptance_categories(p_job_id, p_new_category, p_summary, p_reason);
end;
$$;

revoke all on function public.request_new_client_acceptance(uuid, text, text, text) from public, anon;
grant execute on function public.request_new_client_acceptance(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 13 · Los créditos del plan se crean y se editan (RN-CRE-01)
-- ------------------------------------------------------------
--
-- `create_plan()` y `revise_plan()` ganan `p_included_credits_half` al
-- final, con valor por omisión: quien no lo mande deja los créditos como
-- estaban (0 al crear). Cambia la firma, así que se borran y se crean.
drop function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, boolean, boolean, integer, text, boolean, text, text);

create function public.create_plan(p_space_id uuid, p_name text, p_price_cents integer, p_included_small integer, p_included_photo integer, p_included_medium integer, p_included_large integer, p_start_sla_hours integer, p_execution_sla_small integer, p_execution_sla_photo integer, p_execution_sla_medium integer, p_execution_sla_large integer, p_can_order_requests boolean, p_grants_priority boolean, p_queue_rank integer, p_report_level text, p_watches_reviews boolean, p_idempotency_key text, p_report_period text DEFAULT NULL::text, p_included_credits_half integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_period text := coalesce(p_report_period, 'month');
  v_credits integer := coalesce(p_included_credits_half, 0);
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio crea planes (RN-COM-19)';
  end if;

  if p_idempotency_key is not null then
    select id into v_id from public.plans where space_id = p_space_id and publish_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if v_name = '' then
    raise exception 'El plan necesita un nombre';
  end if;

  if exists (
    select 1 from public.plans
    where space_id = p_space_id and superseded_at is null and archived_at is null
      and lower(name) = lower(v_name)
  ) then
    raise exception 'Ya hay un plan con ese nombre';
  end if;

  perform public.assert_plan_terms(p_price_cents, p_included_small, p_included_photo, p_included_medium,
    p_included_large, p_start_sla_hours, p_execution_sla_small, p_execution_sla_photo,
    p_execution_sla_medium, p_execution_sla_large, p_report_level);

  if v_period not in ('month', 'quarter') then
    raise exception 'Periodo de informe desconocido: %', v_period;
  end if;

  if v_credits < 0 then
    raise exception 'Los créditos incluidos no pueden ser negativos';
  end if;

  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium, included_large,
     start_sla_hours, execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large,
     can_order_requests, grants_priority, queue_rank, report_level, report_period, watches_reviews,
     included_credits_half, published_by, publish_key)
  values
    (p_space_id, v_name, p_price_cents, p_included_small, p_included_photo, p_included_medium, p_included_large,
     p_start_sla_hours, p_execution_sla_small, p_execution_sla_photo, p_execution_sla_medium, p_execution_sla_large,
     coalesce(p_can_order_requests, false), coalesce(p_grants_priority, false), coalesce(p_queue_rank, 0),
     p_report_level, v_period, coalesce(p_watches_reviews, false),
     v_credits, auth.uid(), p_idempotency_key)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  select p_space_id, auth.uid(), 'plan.created', 'plan', v_id, to_jsonb(p) - 'publish_key'
  from public.plans p where p.id = v_id;

  return v_id;
end;
$function$;

revoke all on function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, boolean, boolean, integer, text, boolean, text, text, integer) from public, anon;
grant execute on function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, boolean, boolean, integer, text, boolean, text, text, integer) to authenticated;

drop function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, boolean, boolean, integer, text, boolean, text, text);

create function public.revise_plan(p_plan_id uuid, p_price_cents integer, p_included_small integer, p_included_photo integer, p_included_medium integer, p_included_large integer, p_start_sla_hours integer, p_execution_sla_small integer, p_execution_sla_photo integer, p_execution_sla_medium integer, p_execution_sla_large integer, p_can_order_requests boolean, p_grants_priority boolean, p_queue_rank integer, p_report_level text, p_watches_reviews boolean, p_idempotency_key text, p_report_period text DEFAULT NULL::text, p_included_credits_half integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_head public.plans%rowtype;
  v_new public.plans%rowtype;
  v_id uuid;
  v_changes jsonb;
begin
  select * into v_head from public.plans where id = p_plan_id for update;

  if v_head.id is null then
    raise exception 'Plan no encontrado';
  end if;

  if not public.has_capability(v_head.space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio edita planes (RN-COM-19)';
  end if;

  if p_idempotency_key is not null then
    select id into v_id from public.plans
    where space_id = v_head.space_id and publish_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if v_head.superseded_at is not null then
    raise exception 'Esta versión ya está sustituida: edita la vigente';
  end if;

  if v_head.archived_at is not null then
    raise exception 'Un plan archivado no se edita';
  end if;

  perform public.assert_plan_terms(p_price_cents, p_included_small, p_included_photo, p_included_medium,
    p_included_large, p_start_sla_hours, p_execution_sla_small, p_execution_sla_photo,
    p_execution_sla_medium, p_execution_sla_large, p_report_level);

  if coalesce(p_report_period, v_head.report_period) not in ('month', 'quarter') then
    raise exception 'Periodo de informe desconocido: %', p_report_period;
  end if;

  if coalesce(p_included_credits_half, v_head.included_credits_half) < 0 then
    raise exception 'Los créditos incluidos no pueden ser negativos';
  end if;

  v_new := v_head;
  v_new.price_cents := p_price_cents;
  v_new.included_small := p_included_small;
  v_new.included_photo := p_included_photo;
  v_new.included_medium := p_included_medium;
  v_new.included_large := p_included_large;
  v_new.start_sla_hours := p_start_sla_hours;
  v_new.execution_sla_small := p_execution_sla_small;
  v_new.execution_sla_photo := p_execution_sla_photo;
  v_new.execution_sla_medium := p_execution_sla_medium;
  v_new.execution_sla_large := p_execution_sla_large;
  v_new.can_order_requests := coalesce(p_can_order_requests, false);
  v_new.grants_priority := coalesce(p_grants_priority, false);
  v_new.queue_rank := coalesce(p_queue_rank, 0);
  v_new.report_level := p_report_level;
  v_new.report_period := coalesce(p_report_period, v_head.report_period);
  v_new.watches_reviews := coalesce(p_watches_reviews, false);
  v_new.included_credits_half := coalesce(p_included_credits_half, v_head.included_credits_half);

  select coalesce(jsonb_object_agg(o.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}'::jsonb)
  into v_changes
  from jsonb_each(to_jsonb(v_head)) o
  join jsonb_each(to_jsonb(v_new)) n on n.key = o.key
  where o.value is distinct from n.value;

  if v_changes = '{}'::jsonb then
    raise exception 'No has cambiado ninguna condición del plan';
  end if;

  if not public.plan_lineage_in_use(v_head.lineage_id) then
    update public.plans set
      price_cents = v_new.price_cents,
      included_small = v_new.included_small,
      included_photo = v_new.included_photo,
      included_medium = v_new.included_medium,
      included_large = v_new.included_large,
      start_sla_hours = v_new.start_sla_hours,
      execution_sla_small = v_new.execution_sla_small,
      execution_sla_photo = v_new.execution_sla_photo,
      execution_sla_medium = v_new.execution_sla_medium,
      execution_sla_large = v_new.execution_sla_large,
      can_order_requests = v_new.can_order_requests,
      grants_priority = v_new.grants_priority,
      queue_rank = v_new.queue_rank,
      report_level = v_new.report_level,
      report_period = v_new.report_period,
      watches_reviews = v_new.watches_reviews,
      included_credits_half = v_new.included_credits_half,
      publish_key = coalesce(p_idempotency_key, publish_key)
    where id = v_head.id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_head.space_id, auth.uid(), 'plan.edited', 'plan', v_head.id,
            (select jsonb_object_agg(key, value->'old') from jsonb_each(v_changes)),
            (select jsonb_object_agg(key, value->'new') from jsonb_each(v_changes))
              || jsonb_build_object('in_place', true));

    return v_head.id;
  end if;

  update public.plans set superseded_at = now() where id = v_head.id;

  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium, included_large,
     start_sla_hours, execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large,
     can_order_requests, grants_priority, queue_rank, report_level, report_period, watches_reviews,
     included_credits_half, lineage_id, revision, supersedes_id, published_by, publish_key)
  values
    (v_head.space_id, v_head.name, v_new.price_cents, v_new.included_small, v_new.included_photo,
     v_new.included_medium, v_new.included_large, v_new.start_sla_hours, v_new.execution_sla_small,
     v_new.execution_sla_photo, v_new.execution_sla_medium, v_new.execution_sla_large,
     v_new.can_order_requests, v_new.grants_priority, v_new.queue_rank, v_new.report_level,
     v_new.report_period, v_new.watches_reviews, v_new.included_credits_half,
     v_head.lineage_id, v_head.revision + 1, v_head.id,
     auth.uid(), p_idempotency_key)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_head.space_id, auth.uid(), 'plan.revised', 'plan', v_head.lineage_id,
          (select jsonb_object_agg(key, value->'old') from jsonb_each(v_changes))
            || jsonb_build_object('plan_id', v_head.id, 'revision', v_head.revision),
          (select jsonb_object_agg(key, value->'new') from jsonb_each(v_changes))
            || jsonb_build_object('plan_id', v_id, 'revision', v_head.revision + 1,
                                  'harms', public.revision_harms_internal('plan', v_head.id, v_id)));

  perform public.notify_revision_published(v_head.space_id, 'plan', v_head.lineage_id, v_id);

  return v_id;
end;
$function$;

revoke all on function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, boolean, boolean, integer, text, boolean, text, text, integer) from public, anon;
grant execute on function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, boolean, boolean, integer, text, boolean, text, text, integer) to authenticated;

-- RN-COM-23 y RN-CRE-01 · menos créditos perjudica; más, favorece.
create or replace function public.plan_terms_diff_internal(p_from uuid, p_to uuid)
 RETURNS TABLE(field text, old_value text, new_value text, better boolean, client_visible boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.field, d.o, d.n, d.better, d.visible
  from public.plans a
  join public.plans b on b.id = p_to
  cross join lateral (values
    ('price_cents', a.price_cents::text, b.price_cents::text, b.price_cents < a.price_cents, true, 1),
    ('included_credits_half', a.included_credits_half::text, b.included_credits_half::text,
      b.included_credits_half > a.included_credits_half, true, 2),
    ('included_small', a.included_small::text, b.included_small::text, b.included_small > a.included_small, true, 3),
    ('included_photo', a.included_photo::text, b.included_photo::text, b.included_photo > a.included_photo, true, 4),
    ('included_medium', a.included_medium::text, b.included_medium::text, b.included_medium > a.included_medium, true, 5),
    ('included_large', a.included_large::text, b.included_large::text, b.included_large > a.included_large, true, 6),
    ('start_sla_hours', a.start_sla_hours::text, b.start_sla_hours::text, b.start_sla_hours < a.start_sla_hours, true, 7),
    ('execution_sla_small', a.execution_sla_small::text, b.execution_sla_small::text, b.execution_sla_small < a.execution_sla_small, true, 8),
    ('execution_sla_photo', a.execution_sla_photo::text, b.execution_sla_photo::text, b.execution_sla_photo < a.execution_sla_photo, true, 9),
    ('execution_sla_medium', a.execution_sla_medium::text, b.execution_sla_medium::text, b.execution_sla_medium < a.execution_sla_medium, true, 10),
    ('execution_sla_large', a.execution_sla_large::text, b.execution_sla_large::text, b.execution_sla_large < a.execution_sla_large, true, 11),
    ('can_order_requests', a.can_order_requests::text, b.can_order_requests::text, b.can_order_requests and not a.can_order_requests, true, 12),
    ('grants_priority', a.grants_priority::text, b.grants_priority::text, b.grants_priority and not a.grants_priority, true, 13),
    ('report_level', a.report_level, b.report_level,
      public.report_level_rank(b.report_level) > public.report_level_rank(a.report_level), true, 14),
    ('report_period', a.report_period, b.report_period, b.report_period = 'month' and a.report_period = 'quarter', true, 15),
    ('watches_reviews', a.watches_reviews::text, b.watches_reviews::text, b.watches_reviews and not a.watches_reviews, true, 16),
    ('queue_rank', a.queue_rank::text, b.queue_rank::text, b.queue_rank > a.queue_rank, false, 17)
  ) as d(field, o, n, better, visible, ord)
  where a.id = p_from and d.o is distinct from d.n
  order by d.ord;
$function$;
