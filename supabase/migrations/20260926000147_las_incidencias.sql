-- ============================================================
-- Migración 147 · Las incidencias (decisión 83, RN-REQ-09 a RN-REQ-12)
-- ============================================================
--
-- La ficha del Básico (26/09/2026) separa dos cosas que en Cuotly eran la
-- misma: un **cambio** en la web y una **incidencia** técnica —algo que
-- no funciona—. De la incidencia dice: el diagnóstico no cuesta nada, lo
-- que rompió Restavor se arregla sin coste, lo que sea de una plataforma
-- externa Restavor ayuda a identificarlo y gestionarlo, y si hace falta un
-- trabajo no incluido se presupuesta antes. Bosco eligió el 26/09/2026 un
-- tipo de solicitud propio, con su historial, y contestó que sí a las
-- cuatro preguntas del flujo:
--
--   1. **Error de Restavor**: el equipo lo marca y el arreglo empieza sin
--      que el restaurante acepte nada. No gasta del plan ni cuesta dinero.
--   2. **Problema externo**: la incidencia se cierra con la explicación del
--      equipo, sin trabajo.
--   3. **Si resulta ser un cambio**, se convierte en una solicitud de
--      cambio normal y sigue su camino (bolsa o presupuesto).
--   4. **Vale para todos los planes** y para quien no tiene plan, y una
--      incidencia **nunca gasta del plan**.
--
-- Y la cuarta salida, la de la ficha: **necesita un trabajo no incluido**,
-- que va por el presupuesto de siempre (§84, RN-QUO).
--
-- Lo que hace este archivo:
--
--   1. `requests.kind` ('change' | 'incident') y lo que decidió el equipo
--      (`incident_outcome`, `incident_note`, `incident_resolved_at`), con
--      el `select` concedido columna a columna como el resto de `requests`
--      (P7): ninguna lleva identidad; quién resolvió lo dice la auditoría.
--   2. `acceptances.free_of_charge`: el tercer caso de una aceptación,
--      junto a "gasta de la bolsa" y "presupuestado aparte".
--   3. `set_request_kind()`: el restaurante elige en su borrador; el equipo
--      puede corregirlo mientras nadie la ha validado.
--   4. `resolve_incident()`: las cuatro salidas del diagnóstico.
--   5. `accept_request()`: una incidencia no consume nunca.
--
-- T1 (primera atención, RN-SLA-01) no cambia: es el plazo que la ficha
-- llama "inicio de atención de solicitudes o incidencias", y se para al
-- resolver, como al validar o rechazar.
--
-- Se comprueba con `supabase/tests/las_incidencias.sql`.

-- ------------------------------------------------------------
-- 1 · Las columnas
-- ------------------------------------------------------------
alter table public.requests
  add column kind text not null default 'change' check (kind in ('change', 'incident')),
  add column incident_outcome text check (incident_outcome in ('restavor_error', 'external', 'quote', 'change')),
  add column incident_note text check (incident_note is null or char_length(incident_note) <= 1000),
  add column incident_resolved_at timestamptz;

-- Lo resuelto va entero o no va: una salida sin fecha no se sabe cuándo se
-- dio, y una fecha sin salida no dice qué se decidió.
alter table public.requests
  add constraint requests_incident_outcome_shape check (
    (incident_outcome is null and incident_resolved_at is null)
    or (incident_outcome is not null and incident_resolved_at is not null)
  );

comment on column public.requests.kind is
  'RN-REQ-09 · `change`, un cambio en la web; `incident`, algo que no
   funciona. Una incidencia no gasta del plan nunca (RN-REQ-10).';
comment on column public.requests.incident_outcome is
  'RN-REQ-11 · lo que decidió el equipo al diagnosticar: `restavor_error`
   (se arregla sin coste), `external` (se cierra con la explicación),
   `quote` (se presupuesta) o `change` (era un cambio y sigue como tal).';

-- P7 · ninguna lleva identidad: quién la resolvió sale de `audit_log`.
grant select (kind, incident_outcome, incident_note, incident_resolved_at) on public.requests to authenticated;

alter table public.acceptances
  add column free_of_charge boolean not null default false;

-- Sin coste es sin coste: ni bolsa ni presupuesto.
alter table public.acceptances
  add constraint acceptances_free_shape check (
    not free_of_charge or (not budgeted and consumption_entry_id is null)
  );

comment on column public.acceptances.free_of_charge is
  'RN-REQ-11 · el arreglo sin coste de una incidencia que rompió Restavor:
   no gasta de la bolsa ni va presupuestado.';

-- ------------------------------------------------------------
-- 2 · Cambio o incidencia
-- ------------------------------------------------------------
--
-- El restaurante lo elige en su borrador, con "Crear solicitudes"
-- (RN-EST-15). El equipo lo corrige mientras la solicitud espera a que la
-- miren —recibida, en análisis o pendiente de validar—: es lo que hace
-- falta al crearla en su nombre (RN-REQ-08) y cuando el restaurante marcó
-- como cambio algo que no funciona. De incidencia a cambio, una vez
-- diagnosticada, se pasa por `resolve_incident(..., 'change')`, que deja
-- la explicación.
create or replace function public.set_request_kind(p_request_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
begin
  select * into v_request from public.requests where id = p_request_id for update;

  if v_request.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if p_kind not in ('change', 'incident') then
    raise exception 'Una solicitud es un cambio o una incidencia';
  end if;

  if v_request.state = 'draft' then
    if not public.can_write_establishment(v_request.establishment_id)
       or not public.client_permission(v_request.establishment_id, 'create_requests') then
      raise exception 'No tienes permiso para editar solicitudes en este restaurante';
    end if;
  elsif v_request.state in ('received', 'analyzing', 'pending_internal_validation') then
    if not public.has_capability(v_request.space_id, 'manage_requests') then
      raise exception 'Solo el equipo cambia el tipo de una solicitud ya enviada';
    end if;
    if v_request.incident_outcome is not null then
      raise exception 'Esta incidencia ya está resuelta';
    end if;
  else
    raise exception 'El tipo de una solicitud solo se cambia antes de validarla';
  end if;

  if v_request.kind = p_kind then
    return; -- CA-17: el mismo tipo dos veces no escribe dos apuntes.
  end if;

  update public.requests set kind = p_kind where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_request.space_id, auth.uid(), 'request.kind_changed', 'request', p_request_id,
          jsonb_build_object('kind', v_request.kind), jsonb_build_object('kind', p_kind));
end;
$$;

comment on function public.set_request_kind(uuid, text) is
  'RN-REQ-09 · cambio o incidencia. En borrador, el restaurante con "Crear
   solicitudes"; enviada y sin validar, el equipo con `manage_requests`.';

revoke all on function public.set_request_kind(uuid, text) from public, anon;
grant execute on function public.set_request_kind(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3 · Las cuatro salidas del diagnóstico
-- ------------------------------------------------------------
--
-- Resuelve el equipo con `manage_requests` (propietario y administradores),
-- que es quien valida y rechaza (RN-CLS-03, RN-REQ-03), y desde el mismo
-- estado: pendiente de validación interna. La explicación es obligatoria y
-- la lee el restaurante: va a la conversación de la solicitud, como el
-- motivo de un rechazo. **No lleva el nombre de nadie** (P7): quién
-- resolvió lo dice la auditoría.
--
--   · `restavor_error` · con la categoría del trabajo (su tamaño decide el
--     plazo de realización, RN-SLA-12). Se valida y se acepta en el acto,
--     sin coste (`accept_request()` lo sabe por la salida), y nace el
--     trabajo. Arranca T2 cuando se asigne, como cualquier trabajo.
--   · `external` · se cierra (`closed`), sin trabajo y sin coste.
--   · `quote` · con la categoría. Queda pendiente de aceptación, y solo se
--     acepta por el presupuesto (§84): la aceptación a secas la rechaza
--     `accept_request()`.
--   · `change` · deja de ser incidencia y sigue pendiente de validación
--     como un cambio, con su bolsa o su presupuesto. T1 sigue corriendo: la
--     primera atención todavía no ha terminado.
--
-- Pulsar dos veces la misma salida no hace nada la segunda (CA-17).
create or replace function public.resolve_incident(
  p_request_id uuid,
  p_outcome text,
  p_note text,
  p_category text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_conversation_id uuid;
  v_new_state text;
begin
  select * into v_request from public.requests where id = p_request_id for update;

  if v_request.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.has_capability(v_request.space_id, 'manage_requests') then
    raise exception 'No tienes permiso para resolver esta incidencia';
  end if;

  if p_outcome not in ('restavor_error', 'external', 'quote', 'change') then
    raise exception 'Salida desconocida: %', p_outcome;
  end if;

  -- CA-17 · la misma salida otra vez no hace nada.
  if v_request.incident_outcome = p_outcome then
    return;
  end if;

  if v_request.kind <> 'incident' or v_request.incident_outcome is not null then
    raise exception 'Esta solicitud no es una incidencia pendiente de diagnóstico';
  end if;

  if v_request.state <> 'pending_internal_validation' then
    raise exception 'La incidencia no está pendiente de validación interna';
  end if;

  if v_note is null then
    raise exception 'Explica al restaurante lo que habéis visto';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'La explicación no puede pasar de 1000 caracteres';
  end if;

  if p_outcome in ('restavor_error', 'quote')
     and (p_category is null or p_category not in ('small', 'photo', 'medium', 'large')) then
    raise exception 'Elige el tamaño del trabajo';
  end if;

  if p_outcome in ('restavor_error', 'quote') then
    perform public.assert_establishment_service_running(v_request.establishment_id);
  end if;

  v_new_state := case p_outcome
    when 'external' then 'closed'
    when 'change' then 'pending_internal_validation'
    else 'pending_client_acceptance'
  end;

  update public.requests
  set kind = case when p_outcome = 'change' then 'change' else kind end,
      incident_outcome = p_outcome,
      incident_note = v_note,
      incident_resolved_at = now(),
      state = v_new_state,
      validated_category = case when p_outcome in ('restavor_error', 'quote') then p_category else validated_category end,
      validated_summary = case when p_outcome in ('restavor_error', 'quote') then v_note else validated_summary end,
      validated_by = case when p_outcome in ('restavor_error', 'quote') then auth.uid() else validated_by end,
      validated_at = case when p_outcome in ('restavor_error', 'quote') then now() else validated_at end
  where id = p_request_id;

  -- RN-SLA-03 · la primera atención termina con el diagnóstico, salvo si
  -- resulta ser un cambio: entonces termina al validarlo.
  if p_outcome <> 'change' then
    insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
    values (v_request.space_id, 't1', 'request', p_request_id, 'stopped', now(), auth.uid());
  end if;

  if p_outcome in ('restavor_error', 'quote') then
    -- La propuesta de la IA, si la hubo, queda decidida por el equipo
    -- (RN-CLS-04: se guarda qué propuso y qué se decidió).
    update public.classifications
    set decided_category = p_category, decided_summary = v_note, decided_by = auth.uid(), decided_at = now()
    where id = (select c.id from public.classifications c
                where c.request_id = p_request_id order by c.created_at desc limit 1);
  end if;

  v_conversation_id := public.get_or_create_request_conversation(p_request_id);
  insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
  values (v_conversation_id, v_request.space_id, auth.uid(), 'staff', v_note);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_request.space_id, auth.uid(), 'request.incident_resolved', 'request', p_request_id,
    jsonb_build_object('state', v_request.state, 'kind', v_request.kind),
    jsonb_build_object('state', v_new_state, 'outcome', p_outcome, 'category', p_category),
    v_note
  );

  -- RN-REQ-11 · el arreglo de lo que rompió Restavor no espera a nadie.
  if p_outcome = 'restavor_error' then
    perform public.accept_request(p_request_id);
  end if;
end;
$$;

comment on function public.resolve_incident(uuid, text, text, text) is
  'RN-REQ-11 · las cuatro salidas del diagnóstico de una incidencia: error
   de Restavor (se arregla sin coste y sin pedir aceptación), externa (se
   cierra), presupuesto (§84) o era un cambio. Solo `manage_requests`.';

revoke all on function public.resolve_incident(uuid, text, text, text) from public, anon;
grant execute on function public.resolve_incident(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 4 · accept_request(): una incidencia no consume nunca
-- ------------------------------------------------------------
--
-- Mismo cuerpo que la migración 133 con tres cambios, todos marcados:
-- quién puede aceptar el arreglo sin coste, la barrera de RN-REQ-10 y la
-- aceptación `free_of_charge`.
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
  -- Migración 147 (RN-REQ-10) · una incidencia no gasta del plan nunca: o
  -- se arregla sin coste porque el error fue de Restavor, o se presupuesta.
  v_kind text;
  v_outcome text;
  v_free boolean := false;
begin
  select space_id, establishment_id, state, validated_category, kind, incident_outcome
  into v_space_id, v_establishment_id, v_state, v_category, v_kind, v_outcome
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
  -- Migración 147 · y la segunda: el arreglo sin coste de una incidencia
  -- que rompió Restavor lo pone en marcha el equipo, sin pedirle nada al
  -- restaurante, porque no gasta nada suyo (RN-REQ-11).
  if not public.can_write_establishment(v_establishment_id)
     and not (coalesce(v_quote_state = 'accepted', false)
              and public.has_capability(v_space_id, 'manage_requests'))
     and not (v_kind = 'incident' and v_outcome = 'restavor_error'
              and public.has_capability(v_space_id, 'manage_requests')) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  -- P7 · en el arreglo sin coste no acepta nadie del restaurante, y
  -- `accepted_by` lo lee el restaurante: se queda vacío, como en la 133.
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

  perform public.assert_establishment_service_running(v_establishment_id);

  if v_quote_id is not null and v_quote_state in ('draft', 'sent') then
    raise exception 'Esta solicitud se presupuesta aparte: la aceptación es la del presupuesto (§84)';
  end if;

  if v_quote_id is not null and v_quote_state = 'rejected' then
    raise exception 'El presupuesto de esta solicitud se rechazó: el equipo tiene que enviar otro, o puedes no continuarla';
  end if;

  -- RN-REQ-10 · una incidencia no gasta del plan. Con el presupuesto
  -- aceptado sigue el camino de cualquier presupuesto; sin él, solo si el
  -- equipo la dio por error de Restavor, y entonces no cuesta nada.
  if v_kind = 'incident' and not coalesce(v_quote_state = 'accepted', false) then
    if v_outcome = 'restavor_error' then
      v_free := true;
    else
      raise exception 'Una incidencia no gasta del plan: o se arregla sin coste o se presupuesta aparte';
    end if;
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

  -- RN-CON-03: con presupuesto aceptado no se mira la bolsa. Tampoco en el
  -- arreglo sin coste de una incidencia (RN-REQ-11).
  if v_free then
    v_budgeted := false;
  elsif v_quote_id is null then
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

  if not v_budgeted and not v_free then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, created_by)
    values
      (v_space_id, v_establishment_id, v_cycle_id, v_category, -1, 'debit', p_request_id, v_job_id, auth.uid())
    returning id into v_entry_id;
  end if;

  insert into public.acceptances
    (space_id, establishment_id, request_id, job_id, category, consumption_cycle_id, consumption_entry_id, budgeted,
     free_of_charge, accepted_by)
  values
    (v_space_id, v_establishment_id, p_request_id, v_job_id, v_category, v_cycle_id, v_entry_id, v_budgeted,
     v_free, v_accepted_by);

  update public.requests set state = 'accepted', accepted_by = v_accepted_by, accepted_at = now() where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.accepted', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'accepted', 'job_id', v_job_id, 'job_code', v_job_code, 'budgeted', v_budgeted,
                       'quote_id', v_quote_id, 'free_of_charge', v_free)
  );
end;
$function$;

revoke all on function public.accept_request(uuid) from public, anon;
grant execute on function public.accept_request(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5 · validate_classification(): una incidencia no se valida como cambio
-- ------------------------------------------------------------
--
-- Mismo cuerpo que la migración 18 con una comprobación más. Sin ella, el
-- equipo podría validar una incidencia como si fuera un cambio y dejarla
-- pendiente de una aceptación que `accept_request()` rechazaría siempre:
-- se resuelve con `resolve_incident()`, que para eso tiene la salida
-- "era un cambio".
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

  -- Migración 147 (RN-REQ-11).
  if (select kind from public.requests where id = p_request_id) = 'incident' then
    raise exception 'Una incidencia se resuelve con su diagnóstico, no se valida como un cambio';
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

