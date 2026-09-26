-- ============================================================
-- Suite 82 · Las incidencias (migración 147; decisión 83; PRD RN-REQ-09 a
--            RN-REQ-12)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-REQ-09 · cambio o incidencia: el restaurante lo elige en su
--     borrador; enviada, solo el equipo lo corrige, y solo antes de validar.
--   · RN-REQ-10 · una incidencia no gasta del plan NUNCA, aunque el plan
--     incluya cambios de esa categoría: ni sin coste, ni presupuestada.
--   · RN-REQ-11 · las cuatro salidas del diagnóstico, solo para el equipo
--     con `manage_requests` y con explicación obligatoria:
--       - error de Restavor: nace el trabajo sin que el restaurante acepte
--         nada, sin coste y sin que `accepted_by` diga quién (P7);
--       - externa: se cierra sin trabajo;
--       - presupuesto: solo se acepta por el presupuesto (§84);
--       - era un cambio: sigue como un cambio y entonces sí gasta.
--     T1 se para al diagnosticar (RN-SLA-03). Pulsar dos veces no hace dos
--     cosas (CA-17). Una incidencia no se valida como un cambio.
--   · CLAUDE.md · anon no ejecuta nada nuevo; las columnas nuevas se leen.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/las_incidencias.sql
--
-- Prefijo de esta suite: f1470000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1470000-0000-0000-0000-000000000001', 'duena-inc@cuotly.test', 'authenticated', 'authenticated'),
  ('f1470000-0000-0000-0000-000000000002', 'cliente-inc@cuotly.test', 'authenticated', 'authenticated'),
  ('f1470000-0000-0000-0000-000000000003', 'trabajador-inc@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1470000-0000-0000-0000-000000000001', 'duena-inc@cuotly.test', 'Dueña Incidencias'),
  ('f1470000-0000-0000-0000-000000000002', 'cliente-inc@cuotly.test', 'Cliente Incidencias'),
  ('f1470000-0000-0000-0000-000000000003', 'trabajador-inc@cuotly.test', 'Trabajador Incidencias')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1471000-0000-0000-0000-000000000001', 'Espacio Incidencias', 'espacio-incidencias', 'Europe/Madrid',
   'f1470000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1471000-0000-0000-0000-000000000001', 'f1470000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('f1471000-0000-0000-0000-000000000001', 'f1470000-0000-0000-0000-000000000003', 'worker', 'active');

-- Un plan que SÍ incluye cambios pequeños: si una incidencia gastara del
-- plan, aquí se vería.
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium,
                          included_large, start_sla_hours) values
  ('f1472000-0000-0000-0000-000000000001', 'f1471000-0000-0000-0000-000000000001', 'Con cambios', 29900,
   5, 0, 0, 0, 48);

insert into public.groups (id, space_id, name) values
  ('f1473000-0000-0000-0000-000000000001', 'f1471000-0000-0000-0000-000000000001', 'Grupo Incidencias');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1474000-0000-0000-0000-000000000001', 'f1471000-0000-0000-0000-000000000001',
   'f1473000-0000-0000-0000-000000000001', 'EST-INC-1', 'Casa Incidencia', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f1474000-0000-0000-0000-000000000001', 'f1470000-0000-0000-0000-000000000002', 'local_owner');

create temp table inc_ids (k text primary key, v uuid);
grant select, insert, update on inc_ids to authenticated, service_role;

-- ============================================================
-- CLAUDE.md · privilegios
-- ============================================================
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.set_request_kind(uuid, text)',
    'public.resolve_incident(uuid, text, text, text)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: anon puede ejecutar %', v_fn using errcode = 'assert_failure';
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '% debería poder llamarla authenticated', v_fn using errcode = 'assert_failure';
    end if;
  end loop;

  if not has_column_privilege('authenticated', 'public.requests', 'kind', 'select')
     or not has_column_privilege('authenticated', 'public.requests', 'incident_outcome', 'select')
     or not has_column_privilege('authenticated', 'public.requests', 'incident_note', 'select') then
    raise exception 'RN-REQ-09 FALLIDO: el restaurante no puede leer el tipo ni la resolución de su solicitud' using errcode = 'assert_failure';
  end if;
end $$;

-- El plan, asignado por la propietaria.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1470000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.create_plan_subscription('f1474000-0000-0000-0000-000000000001', 'f1472000-0000-0000-0000-000000000001');
end $$;

-- ============================================================
-- RN-REQ-09 · el restaurante elige en su borrador
-- ============================================================
select set_config('request.jwt.claim.sub', 'f1470000-0000-0000-0000-000000000002', true);

-- Crea cinco incidencias y un cambio, todos enviados.
do $$
declare
  v_id uuid;
  v_k text;
begin
  foreach v_k in array array['error', 'externa', 'presupuesto', 'cambio', 'doble'] loop
    v_id := public.create_request_draft('f1474000-0000-0000-0000-000000000001',
      'La web no carga: ' || v_k, null, 'high', 'No entran reservas');
    perform public.set_request_kind(v_id, 'incident');
    perform public.set_request_kind(v_id, 'incident'); -- CA-17
    perform public.submit_request(v_id);
    perform public.begin_request_analysis(v_id);
    insert into inc_ids values (v_k, v_id);
  end loop;

  -- La auditoría no la lee el restaurante: se mira como postgres.
  set local role postgres;
  if (select count(*) from public.audit_log
      where entity_id = (select v from inc_ids where k = 'error') and action = 'request.kind_changed') <> 1 then
    raise exception 'CA-17 FALLIDO: elegir el mismo tipo dos veces escribió dos apuntes' using errcode = 'assert_failure';
  end if;
  set local role authenticated;

  -- Enviada, el restaurante ya no lo cambia.
  begin
    perform public.set_request_kind((select v from inc_ids where k = 'error'), 'change');
    raise exception 'RN-REQ-09 FALLIDO: el restaurante cambió el tipo de una solicitud enviada' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

-- La propuesta de la IA, como en cualquier solicitud.
set local role service_role;
do $$
declare
  r record;
begin
  for r in select v from inc_ids loop
    perform public.record_classification(r.v, 'f1470000-0000-0000-0000-000000000002'::uuid, 'rules', 'small',
      'Incidencia', null, null, null, null, null, null);
  end loop;
end $$;

-- ============================================================
-- RN-REQ-11 · quién resuelve, y con qué
-- ============================================================
set local role authenticated;

-- Ni el restaurante ni un trabajador.
do $$
declare
  v_quien text;
begin
  foreach v_quien in array array['f1470000-0000-0000-0000-000000000002', 'f1470000-0000-0000-0000-000000000003'] loop
    perform set_config('request.jwt.claim.sub', v_quien, true);
    begin
      perform public.resolve_incident((select v from inc_ids where k = 'error'), 'restavor_error',
        'Lo rompimos nosotros', 'small');
      raise exception 'RN-REQ-11 FALLIDO: % resolvió una incidencia sin manage_requests', v_quien using errcode = 'assert_failure';
    exception when assert_failure then raise; when others then null;
    end;
  end loop;
end $$;

select set_config('request.jwt.claim.sub', 'f1470000-0000-0000-0000-000000000001', true);

do $$
declare
  v_error uuid := (select v from inc_ids where k = 'error');
begin
  -- Sin explicación no: la lee el restaurante.
  begin
    perform public.resolve_incident(v_error, 'restavor_error', '   ', 'small');
    raise exception 'RN-REQ-11 FALLIDO: se resolvió sin explicación' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- El arreglo necesita el tamaño del trabajo (plazo de RN-SLA-12).
  begin
    perform public.resolve_incident(v_error, 'restavor_error', 'Lo rompimos nosotros');
    raise exception 'RN-REQ-11 FALLIDO: nació un trabajo sin tamaño' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- Una incidencia no se valida como un cambio.
  begin
    perform public.validate_classification(v_error, 'small', 'Como un cambio');
    raise exception 'RN-REQ-11 FALLIDO: se validó una incidencia como un cambio' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

-- ============================================================
-- RN-REQ-11 · error de Restavor: sin coste y sin pedir nada
-- ============================================================
do $$
declare
  v_error uuid := (select v from inc_ids where k = 'error');
  v_job uuid;
begin
  perform public.resolve_incident(v_error, 'restavor_error',
    'El formulario dejó de enviar por un cambio nuestro. Lo arreglamos sin coste.', 'small');
  -- CA-17 · otra vez no hace nada.
  perform public.resolve_incident(v_error, 'restavor_error', 'Otra vez', 'small');

  set local role postgres;

  if (select state from public.requests where id = v_error) <> 'accepted' then
    raise exception 'RN-REQ-11 FALLIDO: el arreglo sin coste no quedó aceptado' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.jobs where request_id = v_error) <> 1 then
    raise exception 'RN-REQ-11 FALLIDO: el arreglo sin coste no creó exactamente un trabajo' using errcode = 'assert_failure';
  end if;
  select id into v_job from public.jobs where request_id = v_error;
  if (select quote_id from public.jobs where id = v_job) is not null then
    raise exception 'RN-REQ-11 FALLIDO: el arreglo sin coste va presupuestado' using errcode = 'assert_failure';
  end if;

  -- RN-REQ-10 · el plan incluye cinco pequeños y no se toca ninguno.
  if exists (select 1 from public.consumption_entries where request_id = v_error) then
    raise exception 'RN-REQ-10 FALLIDO: una incidencia gastó del plan' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.acceptances where request_id = v_error
                 and free_of_charge and not budgeted and consumption_entry_id is null) then
    raise exception 'RN-REQ-11 FALLIDO: la aceptación no dice que fue sin coste' using errcode = 'assert_failure';
  end if;

  -- P7 · no aceptó nadie del restaurante, y no se dice quién del equipo.
  if (select accepted_by from public.requests where id = v_error) is not null
     or (select accepted_by from public.acceptances where request_id = v_error) is not null then
    raise exception 'P7 FALLIDO: la aceptación sin coste lleva la identidad de quien resolvió' using errcode = 'assert_failure';
  end if;

  -- RN-SLA-03 · la primera atención terminó con el diagnóstico.
  if not exists (select 1 from public.timer_events where entity_id = v_error and counter_kind = 't1'
                 and event_type = 'stopped') then
    raise exception 'RN-SLA-03 FALLIDO: T1 sigue corriendo después del diagnóstico' using errcode = 'assert_failure';
  end if;

  -- La explicación le llega al restaurante, y queda la auditoría.
  if not exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
                 where c.request_id = v_error and m.body like 'El formulario dejó de enviar%') then
    raise exception 'RN-REQ-11 FALLIDO: la explicación no llegó a la conversación' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where entity_id = v_error and action = 'request.incident_resolved') <> 1 then
    raise exception 'CA-17 FALLIDO: resolver dos veces escribió dos apuntes' using errcode = 'assert_failure';
  end if;

  set local role authenticated;
end $$;

-- ============================================================
-- RN-REQ-11 · externa: se cierra sin trabajo
-- ============================================================
do $$
declare
  v_externa uuid := (select v from inc_ids where k = 'externa');
begin
  perform public.resolve_incident(v_externa, 'external',
    'El dominio lo tiene caducado vuestro proveedor. Os decimos cómo renovarlo.');

  set local role postgres;
  if (select state from public.requests where id = v_externa) <> 'closed'
     or exists (select 1 from public.jobs where request_id = v_externa)
     or exists (select 1 from public.consumption_entries where request_id = v_externa) then
    raise exception 'RN-REQ-11 FALLIDO: la incidencia externa no se cerró limpia' using errcode = 'assert_failure';
  end if;
  if (select incident_outcome from public.requests where id = v_externa) <> 'external'
     or (select incident_resolved_at from public.requests where id = v_externa) is null then
    raise exception 'RN-REQ-11 FALLIDO: la salida no quedó registrada' using errcode = 'assert_failure';
  end if;
  set local role authenticated;

  -- Y una resuelta no se resuelve con otra salida.
  begin
    perform public.resolve_incident(v_externa, 'restavor_error', 'Cambio de idea', 'small');
    raise exception 'RN-REQ-11 FALLIDO: una incidencia resuelta cambió de salida' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

-- ============================================================
-- RN-REQ-10 · presupuesto: solo se acepta por el presupuesto
-- ============================================================
do $$
declare
  v_pres uuid := (select v from inc_ids where k = 'presupuesto');
  v_quote uuid;
begin
  perform public.resolve_incident(v_pres, 'quote',
    'Hay que rehacer el formulario de reservas: no está incluido. Os mandamos presupuesto.', 'medium');
  v_quote := public.create_quote('f1474000-0000-0000-0000-000000000001', 'Rehacer el formulario', 15000,
    'job', 'medium', null, v_pres, false);
  insert into inc_ids values ('quote', v_quote);
end $$;

-- El restaurante no puede aceptarla a secas: no gasta del plan.
select set_config('request.jwt.claim.sub', 'f1470000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.accept_request((select v from inc_ids where k = 'presupuesto'));
    raise exception 'RN-REQ-10 FALLIDO: una incidencia se aceptó sin presupuesto' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'f1470000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.send_quote((select v from inc_ids where k = 'quote'));
end $$;

select set_config('request.jwt.claim.sub', 'f1470000-0000-0000-0000-000000000002', true);
do $$
declare
  v_pres uuid := (select v from inc_ids where k = 'presupuesto');
begin
  perform public.accept_quote((select v from inc_ids where k = 'quote'));

  set local role postgres;
  if (select state from public.requests where id = v_pres) <> 'accepted'
     or (select quote_id from public.jobs where request_id = v_pres) is distinct from (select v from inc_ids where k = 'quote') then
    raise exception 'RN-QUO-02 FALLIDO: aceptar el presupuesto de una incidencia no creó el trabajo presupuestado' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.consumption_entries where request_id = v_pres) then
    raise exception 'RN-REQ-10 FALLIDO: una incidencia presupuestada gastó del plan' using errcode = 'assert_failure';
  end if;
  set local role authenticated;
end $$;

-- ============================================================
-- RN-REQ-11 · era un cambio: sigue como un cambio, y entonces sí gasta
-- ============================================================
select set_config('request.jwt.claim.sub', 'f1470000-0000-0000-0000-000000000001', true);
do $$
declare
  v_cambio uuid := (select v from inc_ids where k = 'cambio');
begin
  perform public.resolve_incident(v_cambio, 'change',
    'No es una avería: es un cambio de horario. Lo tratamos como un cambio de tu plan.');

  set local role postgres;
  if (select kind from public.requests where id = v_cambio) <> 'change'
     or (select state from public.requests where id = v_cambio) <> 'pending_internal_validation' then
    raise exception 'RN-REQ-11 FALLIDO: la incidencia no pasó a ser un cambio pendiente de validar' using errcode = 'assert_failure';
  end if;
  -- La primera atención todavía no ha terminado.
  if exists (select 1 from public.timer_events where entity_id = v_cambio and counter_kind = 't1'
             and event_type = 'stopped') then
    raise exception 'RN-SLA-03 FALLIDO: T1 se paró al convertirla en cambio' using errcode = 'assert_failure';
  end if;
  set local role authenticated;

  perform public.validate_classification(v_cambio, 'small', 'Cambio de horario');
end $$;

select set_config('request.jwt.claim.sub', 'f1470000-0000-0000-0000-000000000002', true);
do $$
declare
  v_cambio uuid := (select v from inc_ids where k = 'cambio');
begin
  perform public.accept_request(v_cambio);
  set local role postgres;
  if not exists (select 1 from public.consumption_entries where request_id = v_cambio and entry_type = 'debit') then
    raise exception 'RN-REQ-11 FALLIDO: convertida en cambio, no gastó de la bolsa' using errcode = 'assert_failure';
  end if;
  set local role authenticated;
end $$;

-- ============================================================
-- RN-REQ-09 · el equipo corrige el tipo antes de validar
-- ============================================================
select set_config('request.jwt.claim.sub', 'f1470000-0000-0000-0000-000000000001', true);
do $$
declare
  v_doble uuid := (select v from inc_ids where k = 'doble');
begin
  perform public.set_request_kind(v_doble, 'change');
  perform public.validate_classification(v_doble, 'small', 'Era un cambio desde el principio');

  -- Validada, ya no se toca.
  begin
    perform public.set_request_kind(v_doble, 'incident');
    raise exception 'RN-REQ-09 FALLIDO: se cambió el tipo de una solicitud ya validada' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- Y un cambio no se resuelve como incidencia.
  begin
    perform public.resolve_incident(v_doble, 'external', 'No aplica');
    raise exception 'RN-REQ-11 FALLIDO: se resolvió como incidencia un cambio' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

rollback;
