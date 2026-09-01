-- Verificación del Hito 7 (Mensajes, archivos y finanzas) contra la base
-- de datos real: HU-24, HU-25, HU-26, HU-27, HU-28 y HU-35, el ciclo de
-- impago completo con RN-FIN-13, y los controles negativos de CA-01,
-- CA-02 y CA-03 que cada operación nueva trae consigo.
--
-- Lo que NO está aquí, y por qué: la aritmética pura (impuestos, estado
-- derivado del cobro, umbrales de 24/72 h, resumen del panel, ventana de
-- edición, límites de archivo) vive en src/core y se prueba con Vitest —
-- finance.test.ts, messages.test.ts, files.test.ts y
-- consumption-ledger.test.ts. Este archivo comprueba lo otro: que el
-- servidor haga cumplir las mismas reglas cuando quien llama es una
-- persona concreta con RLS activo, y que no las haga cumplir "de más" ni
-- "de menos" según el rol.
--
-- Mismo patrón que hito2_permisos.sql, hito4_solicitudes.sql,
-- hito5_consumos.sql y hito6_trabajos.sql: bloques `do $$ ... end $$` que
-- lanzan una excepción real si algo no es lo esperado, `set role
-- authenticated`/`reset role` para cambiar de identidad con RLS activo, y
-- limpieza propia al final.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hito7_mensajes_archivos_finanzas.sql

-- ============================================================
-- Fixture: un espacio con propietario, administrador y dos trabajadores;
-- un grupo con dos establecimientos; y cuatro identidades de cliente
-- (propietario local, editor sin facturación, editor con facturación y
-- Consulta) para poder probar RN-FIN-07 y RN-MSG-05 de verdad.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('b0000000-0000-0000-0000-000000000001', 'h7-owner@example.com', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000002', 'h7-admin@example.com', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000003', 'h7-ana@example.com', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000004', 'h7-luis@example.com', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000005', 'h7-client@example.com', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000006', 'h7-editor@example.com', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000007', 'h7-editor-fact@example.com', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000008', 'h7-consulta@example.com', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000099', 'h7-ajeno@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('b1000000-0000-0000-0000-000000000001', 'Espacio H7', 'espacio-h7-test', 'b0000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'worker', 'active');

-- Impulso, con los mismos números que la semilla de Restavor (Hito 2).
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Impulso H7', 39900, 16, 12, 3, 0, 24);

insert into public.groups (id, space_id, name) values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Grupo H7');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'EST-H7-A', 'Restaurante H7 A'),
  ('b4000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'EST-H7-B', 'Restaurante H7 B');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('b5000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'local_owner'),
  ('b5000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006', 'editor'),
  ('b5000000-0000-0000-0000-000000000003', 'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000007', 'editor'),
  ('b5000000-0000-0000-0000-000000000004', 'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000008', 'consulta'),
  ('b5000000-0000-0000-0000-000000000005', 'b4000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000005', 'local_owner');

-- RN-FIN-07: solo uno de los dos editores tiene `view_billing`.
insert into public.establishment_permissions (establishment_membership_id, edit_establishment_data, view_billing) values
  ('b5000000-0000-0000-0000-000000000002', true, false),
  ('b5000000-0000-0000-0000-000000000003', true, true);

-- RN-ASG-01: Ana está asignada al establecimiento A; Luis, a ninguno.
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');

insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'web', 'b0000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.create_plan_subscription('b4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001');
  perform public.create_plan_subscription('b4000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001');

  create temporary table h7_ctx (key text primary key, value text);
  grant select, insert, update on h7_ctx to authenticated, service_role;
end $$;

reset role;

-- Atajo del fixture: lleva una solicitud de borrador a `accepted` (y por
-- tanto crea su trabajo, RN-REQ-02) recorriendo el flujo real de los
-- Hitos 4 y 5. Igual que h6_make_job; se borra al final del archivo.
create or replace function public.h7_make_job(
  p_establishment_id uuid,
  p_client uuid,
  p_staff uuid,
  p_description text,
  p_category text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_job_id uuid;
begin
  perform set_config('request.jwt.claim.sub', p_client::text, false);
  v_request_id := public.create_request_draft(p_establishment_id, p_description, null);
  perform public.submit_request(v_request_id);
  perform public.begin_request_analysis(v_request_id);

  perform public.record_classification(
    v_request_id, p_client, 'rules', p_category, p_description, null, null, null, null, null, null
  );

  perform set_config('request.jwt.claim.sub', p_staff::text, false);
  perform public.validate_classification(v_request_id, p_category, p_description);

  perform set_config('request.jwt.claim.sub', p_client::text, false);
  perform public.accept_request(v_request_id);

  select id into v_job_id from public.jobs where request_id = v_request_id;
  return v_job_id;
end;
$$;

-- Igual que h7_make_job(), pero se para en `pending_client_acceptance`:
-- hace falta una solicitud validada y SIN aceptar para comprobar que
-- aceptar se niega con el establecimiento suspendido (RN-FIN-11/12).
create or replace function public.h7_make_pending_request(
  p_establishment_id uuid,
  p_client uuid,
  p_staff uuid,
  p_description text,
  p_category text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  perform set_config('request.jwt.claim.sub', p_client::text, false);
  v_request_id := public.create_request_draft(p_establishment_id, p_description, null);
  perform public.submit_request(v_request_id);
  perform public.begin_request_analysis(v_request_id);

  perform public.record_classification(
    v_request_id, p_client, 'rules', p_category, p_description, null, null, null, null, null, null
  );

  perform set_config('request.jwt.claim.sub', p_staff::text, false);
  perform public.validate_classification(v_request_id, p_category, p_description);

  return v_request_id;
end;
$$;

-- Deja una solicitud en `needs_information`: el equipo la analiza y pide
-- información al restaurante. Necesario para comprobar que aportar esa
-- información no reanuda T1 con el establecimiento suspendido (H2).
create or replace function public.h7_make_needs_information(
  p_establishment_id uuid, p_client uuid, p_staff uuid, p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  perform set_config('request.jwt.claim.sub', p_client::text, false);
  v_request_id := public.create_request_draft(p_establishment_id, p_description, null);
  perform public.submit_request(v_request_id);
  perform public.begin_request_analysis(v_request_id);

  perform public.record_classification(
    v_request_id, p_client, 'rules', 'small', p_description, null, null, null, null, null, null
  );

  perform set_config('request.jwt.claim.sub', p_staff::text, false);
  perform public.request_more_information(v_request_id, '¿Nos mandas las fotos?');

  return v_request_id;
end;
$$;

do $$
declare
  v_job_id uuid;
begin
  v_job_id := public.h7_make_job(
    'b4000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001',
    'HU-35: cambiar el horario de la carta', 'small'
  );
  insert into h7_ctx values ('job_a', v_job_id::text);
  insert into h7_ctx values ('request_a', (select request_id from public.jobs where id = v_job_id)::text);
end $$;

-- ============================================================
-- HU-35 · RN-MSG-02 · CLAUDE.md MUST NOT — "Como restaurante, quiero
-- conversar sobre una solicitud y adjuntar archivos, viendo siempre
-- 'Equipo de mantenimiento'".
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h7_ctx where key = 'request_a');
  v_conversation_id uuid;
  v_message_id uuid;
begin
  v_conversation_id := public.get_or_create_request_conversation(v_request_id);
  insert into h7_ctx values ('conv_a', v_conversation_id::text);

  v_message_id := public.post_message(v_conversation_id, 'Buenos días, ¿nos confirmas el horario nuevo?', 'idem-1');
  insert into h7_ctx values ('msg_staff', v_message_id::text);

  -- RN-DAT-09: pulsar dos veces no publica dos mensajes.
  if public.post_message(v_conversation_id, 'Buenos días, ¿nos confirmas el horario nuevo?', 'idem-1') <> v_message_id then
    raise exception 'RN-DAT-09 FALLIDO: post_message() con la misma clave de idempotencia duplicó el mensaje' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_conversation_id uuid := (select value::uuid from h7_ctx where key = 'conv_a');
  v_display text;
  v_sender uuid;
  v_leak boolean := false;
  v_file_id uuid;
  v_message_id uuid;
  v_attachments integer;
begin
  -- El restaurante lee el hilo y ve al equipo, no a una persona.
  select sender_display, sender_id into v_display, v_sender
  from public.list_conversation_messages(v_conversation_id)
  where sender_role = 'staff' limit 1;

  if v_display <> 'maintenance_team' then
    raise exception 'HU-35/RN-MSG-02 FALLIDO: el cliente ve el interlocutor como "%" en vez de maintenance_team', v_display using errcode = 'assert_failure';
  end if;
  if v_sender is not null then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: list_conversation_messages() devolvió al cliente el sender_id del equipo' using errcode = 'assert_failure';
  end if;

  -- Y tampoco puede sacarlo por su cuenta: sender_id no es una columna
  -- legible (privilegio de columna, no una decisión de la interfaz).
  begin
    perform sender_id from public.messages where conversation_id = v_conversation_id;
    v_leak := true;
  exception
    when insufficient_privilege then null;
  end;
  if v_leak then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: el cliente pudo leer messages.sender_id con un SELECT' using errcode = 'assert_failure';
  end if;

  -- HU-35, segunda mitad: adjuntar archivos.
  v_file_id := public.register_file(
    'b4000000-0000-0000-0000-000000000001', 'requests_and_jobs', 'Horario nuevo',
    'h7/horario.pdf', 'horario.pdf', 'application/pdf', 120000
  );
  insert into h7_ctx values ('file_client', v_file_id::text);

  v_message_id := public.post_message(v_conversation_id, 'Sí, os adjunto el horario definitivo.');
  insert into h7_ctx values ('msg_client', v_message_id::text);
  perform public.attach_file_to_message(v_message_id, v_file_id);

  select count(*) into v_attachments from public.file_links
  where entity_type = 'message' and entity_id = v_message_id;
  if v_attachments <> 1 then
    raise exception 'HU-35 FALLIDO: el adjunto del restaurante no quedó enlazado al mensaje (enlaces = %)', v_attachments using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- El equipo sí ve quién escribió (§15: "internamente, Cuotly registra
-- quién realizó cada acción").
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_conversation_id uuid := (select value::uuid from h7_ctx where key = 'conv_a');
  v_display text;
  v_sender uuid;
begin
  select sender_display, sender_id into v_display, v_sender
  from public.list_conversation_messages(v_conversation_id)
  where sender_role = 'staff' limit 1;

  if v_display <> 'person' or v_sender is distinct from 'b0000000-0000-0000-0000-000000000002' then
    raise exception 'HU-35 FALLIDO: el equipo debería ver la persona que escribió (display %, sender %)', v_display, v_sender using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-MSG-07 · RN-MSG-08 — edición de 10 minutos con versión anterior
-- conservada, y ninguna forma de borrar un mensaje.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_message_id uuid := (select value::uuid from h7_ctx where key = 'msg_client');
  v_staff_message uuid := (select value::uuid from h7_ctx where key = 'msg_staff');
  v_body text;
  v_edits integer;
  v_edit_count integer;
  v_previous text;
  v_ok boolean := false;
begin
  perform public.edit_message(v_message_id, 'Sí, os adjunto el horario definitivo (corregido).');

  select body, edit_count into v_body, v_edit_count from public.messages where id = v_message_id;
  if v_body !~ 'corregido' then
    raise exception 'RN-MSG-07 FALLIDO: el mensaje no se editó' using errcode = 'assert_failure';
  end if;
  if v_edit_count <> 1 then
    raise exception 'RN-MSG-07 FALLIDO: el mensaje editado no quedó marcado (edit_count = %)', v_edit_count using errcode = 'assert_failure';
  end if;

  select count(*), max(previous_body) into v_edits, v_previous
  from public.message_edits where message_id = v_message_id;
  if v_edits <> 1 or v_previous !~ 'horario definitivo' then
    raise exception 'RN-MSG-07 FALLIDO: no se conservó la versión anterior del mensaje' using errcode = 'assert_failure';
  end if;

  -- Nadie edita el mensaje de otra persona, ni recién escrito.
  begin
    perform public.edit_message(v_staff_message, 'Esto no lo dijo el equipo');
    raise exception 'RN-MSG-07 FALLIDO: se pudo editar el mensaje de otra persona' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;

  -- RN-MSG-08: no hay política de DELETE. El borrado no falla con error,
  -- simplemente no alcanza ninguna fila — y eso es exactamente lo que hay
  -- que comprobar.
  delete from public.messages where id = v_message_id;
  if not exists (select 1 from public.messages where id = v_message_id) then
    raise exception 'RN-MSG-08 FALLIDO: un mensaje se pudo eliminar' using errcode = 'assert_failure';
  end if;

  -- Tampoco por UPDATE directo (la edición pasa por edit_message()).
  begin
    update public.messages set body = 'reescrito a mano' where id = v_message_id;
    v_ok := not exists (select 1 from public.messages where id = v_message_id and body = 'reescrito a mano');
  exception
    when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then
    raise exception 'RN-MSG-07 FALLIDO: se pudo reescribir un mensaje con UPDATE directo, saltándose la ventana y la versión anterior' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- La ventana son 10 minutos: se retrasa el mensaje en el tiempo (como
-- propietario de la base de datos, que es la única forma de simular que
-- han pasado once minutos sin esperarlos).
update public.messages
set created_at = now() - interval '11 minutes'
where id = (select value::uuid from h7_ctx where key = 'msg_client');

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_message_id uuid := (select value::uuid from h7_ctx where key = 'msg_client');
begin
  begin
    perform public.edit_message(v_message_id, 'Fuera de plazo');
    raise exception 'RN-MSG-07 FALLIDO: se pudo editar un mensaje de hace 11 minutos' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

-- ============================================================
-- RN-MSG-06 — leído y no leído.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_conversation_id uuid := (select value::uuid from h7_ctx where key = 'conv_a');
  v_unread integer;
begin
  select count(*) into v_unread from public.list_conversation_messages(v_conversation_id) where is_unread;
  if v_unread <> 1 then
    raise exception 'RN-MSG-06 FALLIDO: el cliente debería tener 1 mensaje del equipo sin leer, tiene %', v_unread using errcode = 'assert_failure';
  end if;

  perform public.mark_conversation_read(v_conversation_id);

  select count(*) into v_unread from public.list_conversation_messages(v_conversation_id) where is_unread;
  if v_unread <> 0 then
    raise exception 'RN-MSG-06 FALLIDO: tras marcar como leída quedan % mensajes sin leer', v_unread using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-MSG-05 — Consulta lee pero no responde.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000008', false);
set role authenticated;

do $$
declare
  v_conversation_id uuid := (select value::uuid from h7_ctx where key = 'conv_a');
  v_leidos integer;
begin
  select count(*) into v_leidos from public.list_conversation_messages(v_conversation_id);
  if v_leidos < 2 then
    raise exception 'RN-MSG-05 FALLIDO: Consulta debería poder leer la conversación (ve % mensajes)', v_leidos using errcode = 'assert_failure';
  end if;

  begin
    perform public.post_message(v_conversation_id, 'Yo también opino');
    raise exception 'RN-MSG-05 FALLIDO: el rol Consulta pudo responder' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

-- ============================================================
-- RN-MSG-03 · RN-MSG-04 — la conversación interna de trabajo es del
-- equipo, y el trabajador solo alcanza lo suyo.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h7_ctx where key = 'job_a');
  v_conversation_id uuid;
begin
  -- El trabajo se asigna a Ana para que sea "suyo" (RN-MSG-03).
  perform public.auto_assign_job(v_job_id);

  v_conversation_id := public.get_or_create_job_conversation(v_job_id);
  insert into h7_ctx values ('conv_job', v_conversation_id::text);
  perform public.post_message(v_conversation_id, 'Coordinación interna: lo hace Ana esta tarde.');

  -- RN-EST-13: nota interna de gestión, que el trabajador no debe ver.
  insert into public.internal_notes (space_id, establishment_id, kind, body, author_id)
  values ('b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001',
          'management', 'Renegociar el plan en diciembre.', auth.uid());

  insert into public.internal_notes (space_id, establishment_id, kind, body, author_id)
  values ('b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001',
          'operational', 'El acceso al gestor de contenidos es por el panel antiguo.', auth.uid());
end $$;

reset role;

-- El restaurante no ve ni la conversación interna ni ninguna nota interna.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_conversation_id uuid := (select value::uuid from h7_ctx where key = 'conv_job');
  v_visible integer;
  v_notas integer;
begin
  select count(*) into v_visible from public.conversations where id = v_conversation_id;
  if v_visible <> 0 then
    raise exception 'RN-MSG-04 FALLIDO: el restaurante ve la conversación interna de trabajo' using errcode = 'assert_failure';
  end if;

  select count(*) into v_visible from public.messages where conversation_id = v_conversation_id;
  if v_visible <> 0 then
    raise exception 'RN-MSG-04 FALLIDO: el restaurante lee mensajes internos del equipo' using errcode = 'assert_failure';
  end if;

  select count(*) into v_notas from public.internal_notes;
  if v_notas <> 0 then
    raise exception 'RN-MSG-04/RN-EST-13 FALLIDO: el restaurante ve % notas internas', v_notas using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Ana (trabajadora asignada) sí ve la conversación interna de su trabajo y
-- las notas operativas, pero no las de gestión.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_conversation_id uuid := (select value::uuid from h7_ctx where key = 'conv_job');
  v_visible integer;
  v_operativas integer;
  v_gestion integer;
begin
  select count(*) into v_visible from public.messages where conversation_id = v_conversation_id;
  if v_visible <> 1 then
    raise exception 'RN-MSG-03 FALLIDO: la trabajadora asignada no ve la conversación interna de su trabajo' using errcode = 'assert_failure';
  end if;

  select count(*) into v_operativas from public.internal_notes where kind = 'operational';
  select count(*) into v_gestion from public.internal_notes where kind = 'management';
  if v_operativas <> 1 then
    raise exception 'RN-EST-13 FALLIDO: la trabajadora no ve las notas operativas de su establecimiento' using errcode = 'assert_failure';
  end if;
  if v_gestion <> 0 then
    raise exception 'RN-EST-13 FALLIDO: la trabajadora ve % notas internas de gestión', v_gestion using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Luis, trabajador del mismo espacio sin este establecimiento asignado, no
-- ve nada de todo esto (RN-MSG-03).
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_conversation_id uuid := (select value::uuid from h7_ctx where key = 'conv_job');
  v_visible integer;
begin
  select count(*) into v_visible from public.conversations where id = v_conversation_id;
  if v_visible <> 0 then
    raise exception 'RN-MSG-03 FALLIDO: un trabajador sin el establecimiento autorizado ve la conversación interna' using errcode = 'assert_failure';
  end if;

  select count(*) into v_visible from public.internal_notes;
  if v_visible <> 0 then
    raise exception 'RN-EST-13 FALLIDO: un trabajador sin el establecimiento autorizado ve sus notas internas' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- §66.3 · RN-MSG-10 — la conversación general del establecimiento y
-- "Convertir en solicitud".
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
  v_file_id uuid;
  v_request_id uuid;
  v_state text;
  v_description text;
  v_adjuntos integer;
begin
  v_conversation_id := public.get_or_create_establishment_conversation('b4000000-0000-0000-0000-000000000001');
  v_message_id := public.post_message(v_conversation_id, 'Se nos ha ocurrido cambiar la foto de portada por una del salón nuevo.');

  v_file_id := public.register_file(
    'b4000000-0000-0000-0000-000000000001', 'photos', 'Salón nuevo',
    'h7/salon.jpg', 'salon.jpg', 'image/jpeg', 900000
  );
  perform public.attach_file_to_message(v_message_id, v_file_id);

  v_request_id := public.convert_conversation_to_request(v_conversation_id, array[v_message_id], 'Convertida desde la conversación general');
  insert into h7_ctx values ('request_converted', v_request_id::text);

  select state, description into v_state, v_description from public.requests where id = v_request_id;
  if v_state <> 'draft' then
    raise exception 'RN-MSG-10 FALLIDO: convertir debería crear un borrador, creó una solicitud en estado %', v_state using errcode = 'assert_failure';
  end if;
  if v_description !~ 'foto de portada' then
    raise exception 'RN-MSG-10 FALLIDO: el borrador no arrastró el texto del mensaje' using errcode = 'assert_failure';
  end if;

  select count(*) into v_adjuntos from public.file_links
  where entity_type = 'request' and entity_id = v_request_id;
  if v_adjuntos <> 1 then
    raise exception 'RN-MSG-10 FALLIDO: el borrador no arrastró el adjunto (enlaces = %)', v_adjuntos using errcode = 'assert_failure';
  end if;

  -- RN-MSG-08: convertir copia, no mueve. El mensaje sigue en su hilo.
  if not exists (select 1 from public.messages where id = v_message_id) then
    raise exception 'RN-MSG-08 FALLIDO: convertir en solicitud eliminó el mensaje original' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-ARC-06 — 25 MB, y ni vídeos ni ejecutables.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  begin
    perform public.register_file('b4000000-0000-0000-0000-000000000001', 'photos', 'Vídeo del local',
      'h7/video.mp4', 'video.mp4', 'video/mp4', 1000);
    raise exception 'RN-ARC-06 FALLIDO: se pudo subir un vídeo' using errcode = 'assert_failure';
  exception
    when check_violation then null;
  end;

  begin
    perform public.register_file('b4000000-0000-0000-0000-000000000001', 'photos', 'Foto enorme',
      'h7/enorme.png', 'enorme.png', 'image/png', 26214401);
    raise exception 'RN-ARC-06 FALLIDO: se pudo subir un archivo de más de 25 MB' using errcode = 'assert_failure';
  exception
    when check_violation then null;
  end;

  -- 25 MB exactos sí entran.
  perform public.register_file('b4000000-0000-0000-0000-000000000001', 'photos', 'Foto de 25 MB',
    'h7/justa.png', 'justa.png', 'image/png', 26214400);
end $$;

-- ============================================================
-- RN-ARC-03 · RN-ARC-04 — versiones y marca interno/compartido.
-- ============================================================
do $$
declare
  v_file_id uuid;
  v_version integer;
  v_versiones integer;
begin
  v_file_id := public.register_file(
    'b4000000-0000-0000-0000-000000000001', 'documents', 'Textos de la web',
    'h7/textos-v1.docx', 'textos.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 40000,
    'internal'
  );
  insert into h7_ctx values ('file_interno', v_file_id::text);

  v_version := public.add_file_version(
    v_file_id, 'h7/textos-v2.docx', 'textos.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 41000
  );

  if v_version <> 2 then
    raise exception 'RN-ARC-03 FALLIDO: sustituir no creó la versión 2 (devolvió %)', v_version using errcode = 'assert_failure';
  end if;

  select count(*) into v_versiones from public.file_versions where file_id = v_file_id;
  if v_versiones <> 2 then
    raise exception 'RN-ARC-03 FALLIDO: la versión anterior no permanece (versiones = %)', v_versiones using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Antes de compartirlo, el restaurante no lo ve (RN-ARC-04).
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_file_id uuid := (select value::uuid from h7_ctx where key = 'file_interno');
begin
  if exists (select 1 from public.files where id = v_file_id) then
    raise exception 'RN-ARC-04 FALLIDO: el restaurante ve un archivo marcado como interno' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.file_versions where file_id = v_file_id) then
    raise exception 'RN-ARC-04 FALLIDO: el restaurante ve las versiones de un archivo interno' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Ana, trabajadora del establecimiento, lo comparte después (RN-ARC-04:
-- "un trabajador puede compartir después uno interno, y queda auditado").
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_file_id uuid := (select value::uuid from h7_ctx where key = 'file_interno');
begin
  perform public.share_file_with_client(v_file_id);
  perform public.share_file_with_client(v_file_id); -- Idempotente.
end $$;

reset role;

do $$
declare
  v_file_id uuid := (select value::uuid from h7_ctx where key = 'file_interno');
begin
  if not exists (
    select 1 from public.audit_log
    where action = 'file.shared_with_client' and entity_id = v_file_id
      and actor_id = 'b0000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'RN-ARC-04/CA-16 FALLIDO: compartir un archivo no quedó auditado' using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_file_id uuid := (select value::uuid from h7_ctx where key = 'file_interno');
begin
  if not exists (select 1 from public.files where id = v_file_id) then
    raise exception 'RN-ARC-04 FALLIDO: tras compartirlo, el restaurante sigue sin ver el archivo' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-ARC-05 · CA-03 — la facturación nunca es visible para un trabajador,
-- ni siquiera el justificante que él mismo adjunta (RN-FIN-05).
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_file_id uuid;
begin
  v_file_id := public.register_file(
    'b4000000-0000-0000-0000-000000000001', 'billing', 'Factura de septiembre',
    'h7/factura.pdf', 'factura.pdf', 'application/pdf', 50000, 'shared_with_client'
  );
  insert into h7_ctx values ('file_factura', v_file_id::text);
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_file_id uuid := (select value::uuid from h7_ctx where key = 'file_factura');
  v_propio uuid;
begin
  if exists (select 1 from public.files where id = v_file_id) then
    raise exception 'RN-ARC-05 FALLIDO: un trabajador ve un archivo de facturación' using errcode = 'assert_failure';
  end if;

  -- RN-FIN-05: sí puede adjuntar un justificante...
  v_propio := public.register_file(
    'b4000000-0000-0000-0000-000000000001', 'billing', 'Justificante de transferencia',
    'h7/justificante.pdf', 'justificante.pdf', 'application/pdf', 30000
  );
  insert into h7_ctx values ('file_justificante', v_propio::text);

  -- ...y aun así no lo ve después (RN-ARC-05 dice "nunca").
  if exists (select 1 from public.files where id = v_propio) then
    raise exception 'RN-ARC-05 FALLIDO: un trabajador ve el archivo de facturación que él mismo subió' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- RN-FIN-07: de los dos editores del restaurante, solo el que tiene
-- `view_billing` ve la factura; Consulta no ve ninguna.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000006', false);
set role authenticated;

do $$
declare
  v_file_id uuid := (select value::uuid from h7_ctx where key = 'file_factura');
begin
  if exists (select 1 from public.files where id = v_file_id) then
    raise exception 'RN-FIN-07 FALLIDO: un Editor sin `view_billing` ve la facturación' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000007', false);
set role authenticated;

do $$
declare
  v_file_id uuid := (select value::uuid from h7_ctx where key = 'file_factura');
begin
  if not exists (select 1 from public.files where id = v_file_id) then
    raise exception 'RN-FIN-07 FALLIDO: un Editor con `view_billing` no ve la facturación compartida' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000008', false);
set role authenticated;

do $$
begin
  if exists (select 1 from public.files where category = 'billing') then
    raise exception 'RN-FIN-07 FALLIDO: el rol Consulta ve facturación' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-ARC-07 — nada se borra; el borrado definitivo solo se solicita.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_adjunto uuid := (select value::uuid from h7_ctx where key = 'file_client');
  v_suelto uuid;
begin
  begin
    perform public.archive_file(v_adjunto);
    raise exception 'RN-ARC-07 FALLIDO: se pudo archivar un adjunto de mensaje' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;

  -- Un administrador no puede pedir el borrado definitivo: solo el propietario.
  v_suelto := public.register_file('b4000000-0000-0000-0000-000000000001', 'other', 'Nota suelta',
    'h7/nota.txt', 'nota.txt', 'text/plain', 100);
  insert into h7_ctx values ('file_suelto', v_suelto::text);

  begin
    perform public.request_file_permanent_deletion(v_suelto, 'Ya no hace falta');
    raise exception 'RN-ARC-07 FALLIDO: un administrador pudo solicitar el borrado definitivo' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;

  -- Archivar sí puede, y el archivo sigue existiendo (CLAUDE.md MUST NOT).
  perform public.archive_file(v_suelto, 'Documento obsoleto');
  if not exists (select 1 from public.files where id = v_suelto and archived_at is not null) then
    raise exception 'RN-ARC-07 FALLIDO: archivar no marcó el archivo, o lo borró' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_adjunto uuid := (select value::uuid from h7_ctx where key = 'file_client');
  v_suelto uuid := (select value::uuid from h7_ctx where key = 'file_suelto');
begin
  -- Ni el propietario, si el archivo está vinculado a un registro.
  begin
    perform public.request_file_permanent_deletion(v_adjunto, 'Da igual');
    raise exception 'RN-ARC-07 FALLIDO: se pudo solicitar el borrado de un archivo vinculado' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;

  perform public.request_file_permanent_deletion(v_suelto, 'Ya no hace falta');
  if not exists (select 1 from public.files where id = v_suelto and deletion_requested_at is not null) then
    raise exception 'RN-ARC-07 FALLIDO: la solicitud de borrado no quedó registrada' using errcode = 'assert_failure';
  end if;
  -- Y aun así el archivo sigue ahí: solicitar no es borrar.
  if not exists (select 1 from public.files where id = v_suelto) then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: solicitar el borrado definitivo eliminó la fila' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- CA-02 — nadie de otro espacio ve nada de esto.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000099', false);
set role authenticated;

do $$
declare
  v_visibles integer;
begin
  select count(*) into v_visibles from public.files;
  if v_visibles <> 0 then
    raise exception 'CA-02 FALLIDO: una identidad ajena ve % archivos', v_visibles using errcode = 'assert_failure';
  end if;

  select count(*) into v_visibles from public.conversations;
  if v_visibles <> 0 then
    raise exception 'CA-02 FALLIDO: una identidad ajena ve % conversaciones', v_visibles using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- HU-26 · RN-FIN-01 · RN-FIN-08 — emitir la mensualidad con su base, su
-- impuesto y su total, una sola vez por periodo.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_subscription uuid := (select id from public.subscriptions where establishment_id = 'b4000000-0000-0000-0000-000000000001' and kind = 'plan');
begin
  -- RN-FIN-05: el trabajador no emite cobros.
  begin
    perform public.generate_monthly_charge(v_subscription);
    raise exception 'RN-FIN-05 FALLIDO: un trabajador pudo emitir una mensualidad' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_sub_a uuid := (select id from public.subscriptions where establishment_id = 'b4000000-0000-0000-0000-000000000001' and kind = 'plan');
  v_sub_b uuid := (select id from public.subscriptions where establishment_id = 'b4000000-0000-0000-0000-000000000002' and kind = 'plan');
  v_charge_a uuid;
  v_charge_b uuid;
  v_base integer;
  v_tax integer;
  v_total integer;
  v_estado text;
  v_apuntes integer;
begin
  -- Cobro A: vencido hace 25 horas (para el ciclo de impago de más abajo).
  v_charge_a := public.generate_monthly_charge(v_sub_a, now() - interval '25 hours');
  insert into h7_ctx values ('charge_a', v_charge_a::text);

  -- Cobro B: todavía en plazo.
  v_charge_b := public.generate_monthly_charge(v_sub_b, now() + interval '10 days');
  insert into h7_ctx values ('charge_b', v_charge_b::text);

  -- RN-DAT-09 · RN-FIN-01: emitir dos veces el mismo periodo no cobra dos veces.
  if public.generate_monthly_charge(v_sub_a) <> v_charge_a then
    raise exception 'RN-FIN-01 FALLIDO: se generó una segunda mensualidad para el mismo periodo' using errcode = 'assert_failure';
  end if;

  -- RN-FIN-08: Impulso 399 € + 21 % = 482,79 €.
  select base_cents, tax_cents, total_cents into v_base, v_tax, v_total
  from public.charges where id = v_charge_a;
  if v_base <> 39900 or v_tax <> 8379 or v_total <> 48279 then
    raise exception 'RN-FIN-08 FALLIDO: desglose incorrecto (base %, impuesto %, total %)', v_base, v_tax, v_total using errcode = 'assert_failure';
  end if;

  -- RN-DAT-04: el cobro nace con su apunte en el libro, no con un estado.
  select count(*) into v_apuntes from public.financial_entries where charge_id = v_charge_a and entry_type = 'charge';
  if v_apuntes <> 1 then
    raise exception 'RN-DAT-04 FALLIDO: emitir no dejó exactamente un apunte de cargo (%)', v_apuntes using errcode = 'assert_failure';
  end if;

  -- RN-FIN-02 · RN-DAT-05: el estado es derivado.
  v_estado := public.charge_status(v_charge_a);
  if v_estado <> 'overdue' then
    raise exception 'RN-FIN-02 FALLIDO: un cobro vencido y sin pagar debería estar "overdue", está "%"', v_estado using errcode = 'assert_failure';
  end if;
  if public.charge_status(v_charge_b) <> 'pending' then
    raise exception 'RN-FIN-02 FALLIDO: un cobro en plazo debería estar "pending"' using errcode = 'assert_failure';
  end if;

  -- Menú Diario (Fase 2) se rechaza con un motivo explícito, no con un
  -- precio inventado (RN-COM-08).
  if exists (select 1 from public.subscriptions where kind = 'service') then
    raise exception 'Fixture inesperado: este hito no crea suscripciones de servicio' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- HU-24 · HU-25 — la bolsa del ciclo y el libro de consumos.
-- ============================================================
-- Un segundo trabajo, que el restaurante cancela antes de comenzar
-- (RN-JOB-04), para que el libro tenga un apunte de devolución con su
-- motivo además de los débitos.
do $$
declare
  v_job_id uuid;
begin
  v_job_id := public.h7_make_job(
    'b4000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001',
    'HU-25: cambiar el pie de página', 'small'
  );
  insert into h7_ctx values ('job_cancelado', v_job_id::text);
  -- La solicitud se guarda aquí porque el cliente no lee `jobs` (Hito 6,
  -- I3: lee la vista barrera `client_jobs`, sin las columnas de identidad
  -- del equipo).
  insert into h7_ctx values ('request_cancelado', (select request_id from public.jobs where id = v_job_id)::text);
end $$;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h7_ctx where key = 'request_cancelado');
begin
  perform public.cancel_accepted_request(v_request_id, 'El restaurante ya no lo necesita');
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_small integer;
  v_incluido integer;
  v_large_incluido integer;
  v_renews timestamptz;
  v_filas integer;
  v_autor text;
begin
  -- HU-24: dos débitos y una devolución sobre 16 incluidos = 15.
  select remaining, included, renews_at into v_small, v_incluido, v_renews
  from public.establishment_cycle_allowance('b4000000-0000-0000-0000-000000000001')
  where category = 'small';

  if v_small <> 15 or v_incluido <> 16 then
    raise exception 'HU-24 FALLIDO: quedan % de % pequeños incluidos (se esperaba 15 de 16)', v_small, v_incluido using errcode = 'assert_failure';
  end if;
  if v_renews is null or v_renews <= now() then
    raise exception 'HU-24 FALLIDO: la fecha de renovación no es futura (%)', v_renews using errcode = 'assert_failure';
  end if;

  -- "0 restantes" y "no incluido en tu plan" se distinguen (RN-COM-02).
  select included into v_large_incluido
  from public.establishment_cycle_allowance('b4000000-0000-0000-0000-000000000001')
  where category = 'large';
  if v_large_incluido <> 0 then
    raise exception 'HU-24/RN-COM-02 FALLIDO: Impulso no incluye cambios grandes, y aquí incluye %', v_large_incluido using errcode = 'assert_failure';
  end if;

  -- HU-25 desde el lado cliente: ve su libro, pero el apunte del equipo
  -- aparece como "Equipo de mantenimiento" (CLAUDE.md MUST NOT).
  select count(*) into v_filas from public.establishment_consumption_ledger('b4000000-0000-0000-0000-000000000001');
  if v_filas <> 3 then
    raise exception 'HU-25 FALLIDO: el libro debería tener 3 apuntes, tiene %', v_filas using errcode = 'assert_failure';
  end if;

  -- Los tres apuntes los generó el propio restaurante al aceptar y al
  -- cancelar, así que los ve como suyos.
  select author_display into v_autor
  from public.establishment_consumption_ledger('b4000000-0000-0000-0000-000000000001')
  where entry_type = 'return' limit 1;
  if v_autor <> 'self' then
    raise exception 'HU-25 FALLIDO: el cliente ve el autor de su propio apunte como "%"', v_autor using errcode = 'assert_failure';
  end if;

  -- CLAUDE.md MUST NOT: al cliente nunca se le devuelve el identificador
  -- de una persona del equipo. Aquí no hay ninguno, y la función tampoco
  -- se lo daría: author_id solo viaja cuando quien mira es del espacio.
  if exists (
    select 1 from public.establishment_consumption_ledger('b4000000-0000-0000-0000-000000000001')
    where author_id is not null
  ) then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: el libro devolvió al cliente el identificador de una persona' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_motivo text;
  v_autor text;
  v_autor_id uuid;
  v_codigo text;
begin
  -- HU-25 desde el lado administrador: cada apunte con su motivo y su autor.
  select reason, author_display, author_id, request_code
  into v_motivo, v_autor, v_autor_id, v_codigo
  from public.establishment_consumption_ledger('b4000000-0000-0000-0000-000000000001')
  where entry_type = 'return' limit 1;

  if v_motivo !~ 'ya no lo necesita' then
    raise exception 'HU-25 FALLIDO: el apunte no conserva el motivo (%)', v_motivo using errcode = 'assert_failure';
  end if;
  if v_autor <> 'client' or v_autor_id is distinct from 'b0000000-0000-0000-0000-000000000005' then
    raise exception 'HU-25 FALLIDO: el administrador debería ver quién generó el apunte (% / %)', v_autor, v_autor_id using errcode = 'assert_failure';
  end if;
  if v_codigo is null then
    raise exception 'HU-25 FALLIDO: el apunte no enlaza con la solicitud que lo originó' using errcode = 'assert_failure';
  end if;

  -- Y el débito, igual: lo generó el restaurante al aceptar.
  select author_display into v_autor
  from public.establishment_consumption_ledger('b4000000-0000-0000-0000-000000000001')
  where entry_type = 'debit' limit 1;
  if v_autor <> 'client' then
    raise exception 'HU-25 FALLIDO: el débito lo generó el restaurante al aceptar, y figura como "%"', v_autor using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- HU-28 · CA-03 — panel financiero, y quién no lo ve.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform * from public.financial_dashboard('b1000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day');
    raise exception 'CA-03 FALLIDO: un trabajador pudo ver el panel financiero' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;

  begin
    perform * from public.establishments_with_nonpayment('b1000000-0000-0000-0000-000000000001');
    raise exception 'CA-03 FALLIDO: un trabajador pudo ver la lista de restaurantes con impago' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_panel record;
begin
  select * into v_panel
  from public.financial_dashboard('b1000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day');

  -- Previsto: las dos mensualidades emitidas, con y sin IVA (§17.2).
  if v_panel.forecast_base_cents <> 79800 or v_panel.forecast_total_cents <> 96558 then
    raise exception 'HU-28 FALLIDO: previsto incorrecto (% sin IVA, % con IVA)', v_panel.forecast_base_cents, v_panel.forecast_total_cents using errcode = 'assert_failure';
  end if;
  if v_panel.collected_cents <> 0 then
    raise exception 'HU-28 FALLIDO: cobrado debería ser 0 y es %', v_panel.collected_cents using errcode = 'assert_failure';
  end if;
  -- Pendiente y vencido son cosas distintas y no se mezclan.
  if v_panel.pending_cents <> 48279 or v_panel.overdue_cents <> 48279 then
    raise exception 'HU-28 FALLIDO: pendiente % / vencido % (se esperaba 48279 y 48279)', v_panel.pending_cents, v_panel.overdue_cents using errcode = 'assert_failure';
  end if;
  -- Ingreso recurrente: las suscripciones activas, no lo emitido.
  if v_panel.recurring_monthly_base_cents <> 79800 or v_panel.recurring_monthly_total_cents <> 96558 then
    raise exception 'HU-28 FALLIDO: ingreso recurrente incorrecto (%, %)', v_panel.recurring_monthly_base_cents, v_panel.recurring_monthly_total_cents using errcode = 'assert_failure';
  end if;
end $$;

do $$
declare
  v_filas integer;
  v_base bigint;
begin
  -- §17.2: ingresos por plan y próximas renovaciones.
  select count(*), max(base_cents) into v_filas, v_base
  from public.financial_income_by_plan('b1000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day');
  if v_filas <> 1 or v_base <> 79800 then
    raise exception 'HU-28 FALLIDO: ingresos por plan incorrectos (% filas, % base)', v_filas, v_base using errcode = 'assert_failure';
  end if;

  select count(*) into v_filas from public.upcoming_renewals('b1000000-0000-0000-0000-000000000001', 40);
  if v_filas <> 2 then
    raise exception 'HU-28 FALLIDO: se esperaban 2 próximas renovaciones, hay %', v_filas using errcode = 'assert_failure';
  end if;

  select count(*) into v_filas from public.establishments_with_nonpayment('b1000000-0000-0000-0000-000000000001');
  if v_filas <> 1 then
    raise exception 'HU-28 FALLIDO: se esperaba 1 restaurante con impago, hay %', v_filas using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-FIN-10 · RN-FIN-11 · RN-FIN-12 — ciclo de impago: pausa a las 24 h,
-- suspensión a las 72 h, y contadores detenidos.
-- ============================================================
-- Ana empieza el trabajo, para que haya un T3 en marcha que pausar.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  perform public.start_job((select value::uuid from h7_ctx where key = 'job_a'));
end $$;

reset role;

-- RN-FIN-13, control del filtro `cause = 'nonpayment'`: un segundo
-- trabajo del mismo restaurante, bloqueado por el CLIENTE (le falta
-- información) antes de que empiece el impago. Al cobrar, la reactivación
-- debe reanudar solo lo que pausó el impago; este T3 tiene que seguir
-- pausado, porque su causa es otra y el restaurante sigue sin contestar.
--
-- Sin este escenario, `resume_establishment_counters()` podía reanudar
-- cualquier contador parado y la suite seguía verde (mutación: quitar el
-- filtro por causa).
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_job_id uuid;
begin
  v_job_id := public.h7_make_job(
    'b4000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001',
    'RN-FIN-13: pendiente de que el restaurante mande las fotos', 'small'
  );
  insert into h7_ctx values ('job_bloqueado', v_job_id::text);
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
  perform public.auto_assign_job(v_job_id);
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  perform public.start_job((select value::uuid from h7_ctx where key = 'job_bloqueado'));
end $$;

-- En un bloque aparte a propósito: `psql -f` ejecuta cada sentencia de
-- nivel superior en su propia transacción, así que el bloqueo ocurre en un
-- `now()` posterior al arranque. Hacerlo en la misma transacción daría a
-- los dos eventos el mismo `occurred_at` Y el mismo `created_at`, y el
-- desempate de `counter_is_running()` dejaría de ser determinista — algo
-- que no ocurre en producción, donde comenzar y bloquear son dos acciones
-- distintas del trabajador.
do $$
begin
  -- RN-JOB-08 / RN-JOB-09: el trabajador marca el bloqueo por cliente.
  perform public.block_job(
    (select value::uuid from h7_ctx where key = 'job_bloqueado'),
    'client_information', 'Faltan las fotos del local'
  );
end $$;

reset role;

do $$
begin
  insert into h7_ctx values ('estado_previo', (select status from public.establishments where id = 'b4000000-0000-0000-0000-000000000001'));
  insert into h7_ctx values ('jobs_antes', (select count(*)::text from public.jobs where establishment_id = 'b4000000-0000-0000-0000-000000000001'));
  insert into h7_ctx values ('requests_antes', (select count(*)::text from public.requests where establishment_id = 'b4000000-0000-0000-0000-000000000001'));
end $$;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_stage text;
  v_status text;
  v_evento record;
  v_job_estado text;
begin
  v_stage := public.evaluate_establishment_dunning('b4000000-0000-0000-0000-000000000001');
  if v_stage <> 'paused' then
    raise exception 'RN-FIN-10 FALLIDO: a las 25 h de vencimiento el establecimiento debería quedar "paused", quedó "%"', v_stage using errcode = 'assert_failure';
  end if;

  select status into v_status from public.establishments where id = 'b4000000-0000-0000-0000-000000000001';
  if v_status <> 'paused' then
    raise exception 'RN-FIN-10 FALLIDO: el establecimiento no quedó pausado (estado %)', v_status using errcode = 'assert_failure';
  end if;

  -- RN-EST-08: el motivo concreto se puede mostrar junto al estado.
  if public.establishment_status_reason('b4000000-0000-0000-0000-000000000001') <> 'nonpayment_pause' then
    raise exception 'RN-EST-08 FALLIDO: el motivo del estado no es el impago' using errcode = 'assert_failure';
  end if;

  -- RN-FIN-12: los contadores se detienen, y queda escrito por qué.
  select event_type, cause into v_evento
  from public.timer_events
  where entity_type = 'job' and entity_id = (select value::uuid from h7_ctx where key = 'job_a') and counter_kind = 't3'
  order by occurred_at desc, created_at desc limit 1;

  if v_evento.event_type <> 'paused' or v_evento.cause is distinct from 'nonpayment' then
    raise exception 'RN-FIN-12 FALLIDO: T3 no quedó pausado por impago (% / %)', v_evento.event_type, v_evento.cause using errcode = 'assert_failure';
  end if;

  -- RN-FIN-12 (aclarada 31/08/2026): "se detienen trabajos, publicaciones y
  -- contadores, **desde las +24 h**". Hasta la 6ª revisión los contadores
  -- se paraban ya aquí pero el trabajo en curso seguía en `in_progress` y
  -- sin retención, así que el restaurante lo veía "En curso" mientras el
  -- servicio estaba detenido. Detener y parar contadores van juntos.
  select state into v_job_estado from public.jobs where id = (select value::uuid from h7_ctx where key = 'job_a');
  if v_job_estado <> 'authorized_pause' then
    raise exception 'RN-FIN-12 FALLIDO: a las +24 h el trabajo en curso debería quedar retenido (authorized_pause), está en %', v_job_estado using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.blocks
    where job_id = (select value::uuid from h7_ctx where key = 'job_a')
      and reason_type = 'financial_hold' and ended_at is null
  ) then
    raise exception 'RN-FIN-12 FALLIDO: a las +24 h el trabajo en curso no quedó con retención por impago' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Pasan otras 48 horas sin cobrar (se retrasa el vencimiento, que es la
-- única forma de simularlo sin esperar tres días).
update public.charges set due_at = now() - interval '73 hours'
where id = (select value::uuid from h7_ctx where key = 'charge_a');

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_stage text;
  v_status text;
  v_job_state text;
  v_bloqueos integer;
begin
  v_stage := public.evaluate_establishment_dunning('b4000000-0000-0000-0000-000000000001');
  if v_stage <> 'suspended' then
    raise exception 'RN-FIN-11 FALLIDO: a las 73 h debería quedar "suspended", quedó "%"', v_stage using errcode = 'assert_failure';
  end if;

  select status into v_status from public.establishments where id = 'b4000000-0000-0000-0000-000000000001';
  if v_status <> 'suspended' then
    raise exception 'RN-FIN-11 FALLIDO: el establecimiento no quedó suspendido (estado %)', v_status using errcode = 'assert_failure';
  end if;

  -- RN-FIN-11/RN-FIN-12 + RN-JOB-07: el servicio se detiene, y el trabajo
  -- en curso queda en pausa con la razón financiera que el PRD ya prevé.
  select state into v_job_state from public.jobs where id = (select value::uuid from h7_ctx where key = 'job_a');
  if v_job_state <> 'authorized_pause' then
    raise exception 'RN-FIN-12 FALLIDO: el trabajo en curso no se detuvo (estado %)', v_job_state using errcode = 'assert_failure';
  end if;

  select count(*) into v_bloqueos from public.blocks
  where job_id = (select value::uuid from h7_ctx where key = 'job_a')
    and reason_type = 'financial_hold' and ended_at is null;
  if v_bloqueos <> 1 then
    raise exception 'RN-FIN-12 FALLIDO: no quedó registrado el bloqueo por impago (%)', v_bloqueos using errcode = 'assert_failure';
  end if;

  -- RN-FIN-12: "no se borra información".
  if not exists (select 1 from public.charges where id = (select value::uuid from h7_ctx where key = 'charge_a')) then
    raise exception 'RN-FIN-12 FALLIDO: la suspensión borró el cobro' using errcode = 'assert_failure';
  end if;

  -- RN-FIN-14: la suspensión no cancela el compromiso; la deuda sigue viva.
  if public.charge_outstanding_cents((select value::uuid from h7_ctx where key = 'charge_a')) <> 48279 then
    raise exception 'RN-FIN-14 FALLIDO: la deuda no se mantiene tras la suspensión' using errcode = 'assert_failure';
  end if;
  if public.charge_status((select value::uuid from h7_ctx where key = 'charge_a')) <> 'overdue' then
    raise exception 'RN-FIN-14 FALLIDO: el cobro suspendido dejó de estar vencido' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-FIN-06 — el restaurante sube el justificante, pero no confirma nada.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_charge_a uuid := (select value::uuid from h7_ctx where key = 'charge_a');
  v_file_id uuid;
  v_pagos integer;
begin
  v_file_id := public.register_file(
    'b4000000-0000-0000-0000-000000000001', 'billing', 'Justificante de la transferencia',
    'h7/transferencia.pdf', 'transferencia.pdf', 'application/pdf', 20000
  );
  perform public.upload_payment_receipt(v_charge_a, v_file_id, 'Transferencia hecha esta mañana');

  select count(*) into v_pagos from public.payments where charge_id = v_charge_a;
  if v_pagos <> 0 then
    raise exception 'RN-FIN-06 FALLIDO: subir un justificante creó un cobro confirmado' using errcode = 'assert_failure';
  end if;
  if public.charge_status(v_charge_a) <> 'overdue' then
    raise exception 'RN-FIN-06 FALLIDO: el justificante del cliente cambió el estado del cobro' using errcode = 'assert_failure';
  end if;
  if (select status from public.establishments where id = 'b4000000-0000-0000-0000-000000000001') <> 'suspended' then
    raise exception 'RN-FIN-06 FALLIDO: el justificante del cliente reactivó el establecimiento' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- HU-27 · RN-FIN-05 · RN-FIN-13 — la trabajadora marca el cobro como
-- pagado desde la ficha de su restaurante, y todo vuelve a su sitio.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_charge_a uuid := (select value::uuid from h7_ctx where key = 'charge_a');
  v_charge_b uuid := (select value::uuid from h7_ctx where key = 'charge_b');
  v_job_id uuid := (select value::uuid from h7_ctx where key = 'job_a');
  v_payment_id uuid;
  v_repetido uuid;
  v_justificante uuid;
begin
  -- RN-FIN-05: en un restaurante que no tiene asignado, no.
  begin
    perform public.register_payment(v_charge_b, 48279, 'transfer', now());
    raise exception 'RN-FIN-05 FALLIDO: una trabajadora cobró en un restaurante que no tiene asignado' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;

  -- Cobrar más de lo que se debe es un dato equivocado, no un pago.
  begin
    perform public.register_payment(v_charge_a, 99999, 'transfer', now());
    raise exception 'RN-FIN FALLIDO: se pudo cobrar más que la deuda viva' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;

  -- RN-FIN-05: "no puede ... perdonar deuda". Sobre `charge_a`, el cobro
  -- del establecimiento que Ana SÍ tiene asignado, y AQUÍ, antes de
  -- cobrarlo, porque es el único momento en que tiene deuda viva: si se
  -- intenta después, lo que rechaza la llamada es la guarda de "no hay
  -- deuda que perdonar" y la de `manage_finance` queda tapada.
  --
  -- Antes se intentaba sobre `charge_b`, de un establecimiento ajeno a
  -- Ana, así que lo que saltaba era la visibilidad financiera y el test
  -- seguía verde con la regla rota (mutación: `if false then` en lugar de
  -- la guarda de capacidad).
  begin
    perform public.waive_charge(v_charge_a, 'Regalo');
    raise exception 'RN-FIN-05 FALLIDO: una trabajadora pudo perdonar deuda viva de su propio establecimiento' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%perdonar un cobro%' then
        raise exception 'RN-FIN-05 FALLIDO: waive_charge() falló por otro motivo, no por falta de capacidad: %', sqlerrm
          using errcode = 'assert_failure';
      end if;
  end;

  -- HU-27, con el justificante que RN-FIN-05 le permite adjuntar.
  v_justificante := public.register_file(
    'b4000000-0000-0000-0000-000000000001', 'billing', 'Resguardo del banco',
    'h7/resguardo.pdf', 'resguardo.pdf', 'application/pdf', 15000
  );

  v_payment_id := public.register_payment(v_charge_a, 48279, 'transfer', now(), v_justificante, 'Confirmado con el banco', 'pago-1');
  insert into h7_ctx values ('payment_a', v_payment_id::text);

  -- RN-DAT-09: pulsar dos veces no cobra dos veces.
  v_repetido := public.register_payment(v_charge_a, 48279, 'transfer', now(), null, null, 'pago-1');
  if v_repetido <> v_payment_id then
    raise exception 'RN-DAT-09 FALLIDO: register_payment() duplicó el cobro con la misma clave de idempotencia' using errcode = 'assert_failure';
  end if;

  -- RN-FIN-05: no perdona deuda, no reembolsa y no corrige.
  --
  -- Sobre `charge_a`, el cobro del establecimiento que Ana SÍ tiene
  -- asignado, y comprobando el MENSAJE. Antes se intentaba sobre
  -- `charge_b`, de un establecimiento ajeno a Ana: lo que saltaba no era
  -- la comprobación de `manage_finance` sino la de visibilidad
  -- financiera, así que el test seguía verde con la regla rota
  -- (comprobado con una mutación: sustituir la guarda por `if false`).
  begin
    perform public.waive_charge(v_charge_b, 'Regalo');
    raise exception 'RN-FIN-05 FALLIDO: una trabajadora pudo perdonar deuda de un establecimiento ajeno' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;

  begin
    perform public.refund_charge(v_charge_a, 1000, 'Devolución');
    raise exception 'RN-FIN-05 FALLIDO: una trabajadora pudo reembolsar' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;

  begin
    perform public.reverse_payment(v_payment_id, 'Me equivoqué');
    raise exception 'RN-FIN-05 FALLIDO: una trabajadora pudo corregir un cobro' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

do $$
declare
  v_charge_a uuid := (select value::uuid from h7_ctx where key = 'charge_a');
  v_job_id uuid := (select value::uuid from h7_ctx where key = 'job_a');
  v_payment_id uuid := (select value::uuid from h7_ctx where key = 'payment_a');
  v_status text;
  v_job_state text;
  v_evento record;
  v_arranques integer;
  v_jobs integer;
  v_requests integer;
begin
  -- HU-26: el cobro queda confirmado, con fecha, importe, método y
  -- justificante, y con quién lo confirmó.
  if public.charge_status(v_charge_a) <> 'paid' then
    raise exception 'HU-26/HU-27 FALLIDO: el cobro no quedó pagado (%)', public.charge_status(v_charge_a) using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.payment_confirmations pc
    where pc.payment_id = v_payment_id
      and pc.confirmed_by = 'b0000000-0000-0000-0000-000000000003'
      and pc.confirmed_role = 'worker'
  ) then
    raise exception 'RN-FIN-06 FALLIDO: el cobro no dejó constancia de quién lo confirmó' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.payments where id = v_payment_id and receipt_file_id is not null and method = 'transfer') then
    raise exception 'HU-26 FALLIDO: el cobro no guardó método ni justificante' using errcode = 'assert_failure';
  end if;
  -- RN-FIN-05: "su acción queda auditada".
  if not exists (
    select 1 from public.audit_log
    where action = 'payment.registered' and actor_id = 'b0000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'RN-FIN-05/CA-16 FALLIDO: el cobro de la trabajadora no quedó auditado' using errcode = 'assert_failure';
  end if;

  -- RN-FIN-13: se reactiva, y al estado que tenía antes del impago.
  select status into v_status from public.establishments where id = 'b4000000-0000-0000-0000-000000000001';
  if v_status <> (select value from h7_ctx where key = 'estado_previo') then
    raise exception 'RN-FIN-13 FALLIDO: el establecimiento no volvió a su estado anterior (% en vez de %)',
      v_status, (select value from h7_ctx where key = 'estado_previo') using errcode = 'assert_failure';
  end if;

  select state into v_job_state from public.jobs where id = v_job_id;
  if v_job_state <> 'in_progress' then
    raise exception 'RN-FIN-13 FALLIDO: el trabajo no volvió a estar en curso (estado %)', v_job_state using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.blocks where job_id = v_job_id and reason_type = 'financial_hold' and ended_at is null) then
    raise exception 'RN-FIN-13 FALLIDO: el bloqueo por impago sigue abierto tras cobrar' using errcode = 'assert_failure';
  end if;

  -- RN-FIN-13: "los contadores continúan exactamente donde se pausaron".
  -- El último evento de T3 es una reanudación, y **no** hay un arranque
  -- nuevo: el contador no se reinicia, retoma. El tiempo consumido se
  -- recalcula sumando tramos cerrados (src/core/timer-events.ts, CA-10),
  -- así que el tramo pausado sencillamente no cuenta.
  select event_type, cause into v_evento
  from public.timer_events
  where entity_type = 'job' and entity_id = v_job_id and counter_kind = 't3'
  order by occurred_at desc, created_at desc limit 1;
  if v_evento.event_type <> 'resumed' or v_evento.cause is distinct from 'nonpayment' then
    raise exception 'RN-FIN-13 FALLIDO: T3 no se reanudó tras el pago (% / %)', v_evento.event_type, v_evento.cause using errcode = 'assert_failure';
  end if;

  select count(*) into v_arranques from public.timer_events
  where entity_type = 'job' and entity_id = v_job_id and counter_kind = 't3' and event_type = 'started';
  if v_arranques <> 1 then
    raise exception 'RN-FIN-13 FALLIDO: T3 se reinició desde cero (% arranques)', v_arranques using errcode = 'assert_failure';
  end if;

  -- RN-FIN-13: "los contadores continúan EXACTAMENTE donde se pausaron".
  -- El trabajo que el restaurante tenía bloqueado por falta de
  -- información no lo desbloquea un pago: su T3 sigue pausado, y su
  -- bloqueo sigue abierto. Cobrar la deuda reanuda lo que paró la deuda,
  -- nada más.
  select event_type, cause into v_evento
  from public.timer_events
  where entity_type = 'job'
    and entity_id = (select value::uuid from h7_ctx where key = 'job_bloqueado')
    and counter_kind = 't3'
  order by occurred_at desc, created_at desc limit 1;
  if v_evento.event_type <> 'paused' then
    raise exception 'RN-FIN-13 FALLIDO: la reactivación por pago reanudó un T3 que estaba pausado por el cliente, no por el impago (último evento: % / %)',
      v_evento.event_type, v_evento.cause using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.blocks
    where job_id = (select value::uuid from h7_ctx where key = 'job_bloqueado')
      and reason_type = 'client_information' and ended_at is null
  ) then
    raise exception 'RN-FIN-13 FALLIDO: el pago cerró un bloqueo por falta de información del cliente' using errcode = 'assert_failure';
  end if;

  -- RN-FIN-13: "sin duplicar solicitudes ni trabajos".
  select count(*) into v_jobs from public.jobs where establishment_id = 'b4000000-0000-0000-0000-000000000001';
  select count(*) into v_requests from public.requests where establishment_id = 'b4000000-0000-0000-0000-000000000001';
  if v_jobs::text <> (select value from h7_ctx where key = 'jobs_antes')
     or v_requests::text <> (select value from h7_ctx where key = 'requests_antes') then
    raise exception 'RN-FIN-13 FALLIDO: la reactivación duplicó trabajos o solicitudes (% trabajos, % solicitudes)', v_jobs, v_requests using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- HU-28 (segunda foto) — el panel refleja el cobro, sin tocar nada más.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_panel record;
begin
  select * into v_panel
  from public.financial_dashboard('b1000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day');

  if v_panel.collected_cents <> 48279 then
    raise exception 'HU-28 FALLIDO: cobrado debería ser 48279 y es %', v_panel.collected_cents using errcode = 'assert_failure';
  end if;
  if v_panel.overdue_cents <> 0 then
    raise exception 'HU-28 FALLIDO: ya no debería quedar nada vencido, y quedan %', v_panel.overdue_cents using errcode = 'assert_failure';
  end if;
  if v_panel.pending_cents <> 48279 then
    raise exception 'HU-28 FALLIDO: pendiente debería seguir siendo 48279 y es %', v_panel.pending_cents using errcode = 'assert_failure';
  end if;
end $$;

-- RN-FIN-04: el propietario sí corrige, y corregir es un apunte contrario.
do $$
declare
  v_charge_b uuid := (select value::uuid from h7_ctx where key = 'charge_b');
  v_payment_id uuid;
begin
  v_payment_id := public.register_payment(v_charge_b, 10000, 'bizum', now(), null, 'Entrega a cuenta');
  if public.charge_status(v_charge_b) <> 'partially_paid' then
    raise exception 'RN-FIN-02 FALLIDO: un cobro parcial en plazo debería estar "partially_paid", está "%"', public.charge_status(v_charge_b) using errcode = 'assert_failure';
  end if;

  perform public.reverse_payment(v_payment_id, 'El ingreso era de otro restaurante');

  if public.charge_status(v_charge_b) <> 'pending' then
    raise exception 'RN-FIN-04 FALLIDO: al corregir el cobro no volvió a "pending" (está "%")', public.charge_status(v_charge_b) using errcode = 'assert_failure';
  end if;
  if public.charge_collected_cents(v_charge_b) <> 0 then
    raise exception 'RN-FIN-04 FALLIDO: la corrección no anuló lo cobrado (%)', public.charge_collected_cents(v_charge_b) using errcode = 'assert_failure';
  end if;
  -- El pago original sigue en el libro: se corrige, no se borra.
  if not exists (select 1 from public.payments where id = v_payment_id) then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: corregir un cobro borró el pago original' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.financial_entries where charge_id = v_charge_b) <> 3 then
    raise exception 'RN-DAT-04 FALLIDO: la corrección no dejó su apunte contrario en el libro' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- CA-02 — ninguna identidad de otro espacio ve cobros, pagos ni apuntes.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000099', false);
set role authenticated;

do $$
declare
  v_visibles integer;
begin
  select count(*) into v_visibles from public.charges;
  if v_visibles <> 0 then
    raise exception 'CA-02 FALLIDO: una identidad ajena ve % cobros', v_visibles using errcode = 'assert_failure';
  end if;
  select count(*) into v_visibles from public.financial_entries;
  if v_visibles <> 0 then
    raise exception 'CA-02 FALLIDO: una identidad ajena ve % apuntes financieros', v_visibles using errcode = 'assert_failure';
  end if;

  begin
    perform * from public.financial_dashboard('b1000000-0000-0000-0000-000000000001', now() - interval '1 day', now());
    raise exception 'CA-02 FALLIDO: una identidad ajena pudo ver el panel financiero' using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

-- RN-FIN-07 — el restaurante ve sus cobros; Consulta, ninguno.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000008', false);
set role authenticated;

do $$
declare
  v_visibles integer;
begin
  select count(*) into v_visibles from public.charges;
  if v_visibles <> 0 then
    raise exception 'RN-FIN-07 FALLIDO: el rol Consulta ve % cobros', v_visibles using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_visibles integer;
begin
  select count(*) into v_visibles from public.charges;
  if v_visibles <> 2 then
    raise exception 'RN-FIN-07 FALLIDO: el propietario local debería ver sus 2 cobros, ve %', v_visibles using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-ARC-02 — los adjuntos de solicitud del Hito 4 aparecen en el
-- catálogo: "los archivos de este establecimiento" se responde en un solo
-- sitio, sin haber tocado la tabla del Hito 4 ni sus reglas.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h7_ctx where key = 'request_converted');
  v_antes integer;
  v_despues integer;
begin
  select count(*) into v_antes from public.files where establishment_id = 'b4000000-0000-0000-0000-000000000001';

  insert into public.request_attachments
    (request_id, space_id, establishment_id, storage_path, file_name, mime_type, size_bytes, created_by)
  values
    (v_request_id, 'b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001',
     'h7/adjunto-borrador.pdf', 'adjunto-borrador.pdf', 'application/pdf', 12000, auth.uid());

  select count(*) into v_despues from public.files where establishment_id = 'b4000000-0000-0000-0000-000000000001';
  if v_despues <> v_antes + 1 then
    raise exception 'RN-ARC-02 FALLIDO: el adjunto de la solicitud no llegó al catálogo de archivos' using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.files f
    join public.file_versions fv on fv.file_id = f.id
    join public.file_links fl on fl.file_id = f.id
    where f.establishment_id = 'b4000000-0000-0000-0000-000000000001'
      and fv.storage_path = 'h7/adjunto-borrador.pdf'
      and fv.version_number = 1
      and fl.entity_type = 'request' and fl.entity_id = v_request_id
  ) then
    raise exception 'RN-ARC-02/RN-ARC-03 FALLIDO: el adjunto llegó al catálogo sin su versión o sin su enlace' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CA-16 — todas las operaciones nuevas dejan auditoría.
-- ============================================================
do $$
declare
  v_missing text;
begin
  select string_agg(a.action, ', ')
  into v_missing
  from (values
    ('file.registered'), ('file.version_added'), ('file.shared_with_client'),
    ('file.archived'), ('file.deletion_requested'),
    ('charge.issued'), ('payment.registered'), ('payment.reversed'),
    ('charge.receipt_uploaded'), ('request.converted_from_conversation'),
    ('establishment.nonpayment_pause'), ('establishment.nonpayment_suspension'),
    ('establishment.nonpayment_reactivation')
  ) as a(action)
  where not exists (select 1 from public.audit_log al where al.action = a.action);

  if v_missing is not null then
    raise exception 'CA-16 FALLIDO: estas operaciones no dejaron auditoría: %', v_missing using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- N2 (auditoría) · RN-FIN-09 — adjuntar la factura a un cobro. Era la
-- única operación de usuario del hito sin ninguna cobertura.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000008', false);
set role authenticated;

do $$
begin
  -- El rol Consulta no gestiona facturación (RN-FIN-07).
  begin
    perform public.attach_invoice_to_charge(
      (select value::uuid from h7_ctx where key = 'charge_a'),
      (select value::uuid from h7_ctx where key = 'file_factura')
    );
    raise exception 'RN-FIN-09 FALLIDO: el rol Consulta pudo adjuntar la factura de un cobro' using errcode = 'assert_failure';
  exception
    when raise_exception then null; -- esperado
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_charge_id uuid := (select value::uuid from h7_ctx where key = 'charge_a');
  v_file_id uuid := (select value::uuid from h7_ctx where key = 'file_factura');
  v_links integer;
begin
  perform public.attach_invoice_to_charge(v_charge_id, v_file_id);

  -- Queda enlazada al cobro (y por RN-ARC-07, ya no se puede borrar).
  select count(*) into v_links from public.file_links
  where file_id = v_file_id and entity_type = 'charge' and entity_id = v_charge_id;
  if v_links <> 1 then
    raise exception 'RN-FIN-09 FALLIDO: la factura no quedó enlazada al cobro (enlaces=%)', v_links;
  end if;

  -- Idempotente: repetirla no duplica el enlace (CLAUDE.md MUST).
  perform public.attach_invoice_to_charge(v_charge_id, v_file_id);
  select count(*) into v_links from public.file_links
  where file_id = v_file_id and entity_type = 'charge' and entity_id = v_charge_id;
  if v_links <> 1 then
    raise exception 'RN-FIN-09 FALLIDO: adjuntar dos veces creó % enlaces (esperado 1)', v_links;
  end if;
end $$;

reset role;

-- ============================================================
-- N10 (auditoría) · un justificante tiene que ser un archivo que quien lo
-- adjunta pueda ver. Antes solo se comprobaba que fuera del mismo
-- establecimiento, así que el restaurante podía enlazar a su cobro un
-- archivo INTERNO del equipo: no lo leía, pero lo dejaba permanentemente
-- no archivable ni borrable (RN-ARC-07) y ensuciaba el expediente.
-- ============================================================
-- Un archivo interno recién creado por el equipo: `file_interno` del
-- fixture ya se compartió con el restaurante en la sección de RN-ARC-04,
-- así que leerlo sería legítimo y el test pasaría por el motivo
-- equivocado.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_file_id uuid;
begin
  v_file_id := public.register_file(
    'b4000000-0000-0000-0000-000000000001', 'documents', 'Documento interno del equipo',
    'h7/nota-interna.pdf', 'nota-interna.pdf', 'application/pdf', 5000
  );
  insert into h7_ctx values ('file_solo_interno', v_file_id::text);
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_file_interno uuid := (select value::uuid from h7_ctx where key = 'file_solo_interno');
  v_enlaces integer;
begin
  begin
    perform public.upload_payment_receipt(
      (select value::uuid from h7_ctx where key = 'charge_a'),
      v_file_interno,
      'intento con un archivo interno del equipo'
    );
    raise exception 'RN-ARC-04 FALLIDO: el restaurante adjuntó como justificante un archivo interno que no puede ver' using errcode = 'assert_failure';
  exception
    when raise_exception then null; -- esperado
  end;

  -- Y no quedó ningún rastro: ni el enlace que lo volvería indestructible.
  select count(*) into v_enlaces from public.file_links
  where file_id = v_file_interno and entity_type = 'charge';
  if v_enlaces <> 0 then
    raise exception 'RN-ARC-07 FALLIDO: quedó un enlace de cobro sobre un archivo interno (enlaces=%)', v_enlaces
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- N3 (auditoría) · RN-COR-08 — cerrada la ventana de corrección, la
-- conversación de esa solicitud queda de solo lectura **en el servidor**,
-- no solo en la lógica pura. Los dos caminos: la función y el INSERT
-- directo.
-- ============================================================
-- Precondición: se publica el trabajo y se da la ventana por vencida.
-- Se hace como postgres (sin RLS), igual que jobs.started_at en el Hito 5.
reset role;
update public.jobs
set state = 'published',
    published_at = now() - interval '5 days',
    correction_window_ends_at = now() - interval '1 day'
where id = (select value::uuid from h7_ctx where key = 'job_a');

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_conv_id uuid := (select value::uuid from h7_ctx where key = 'conv_a');
  v_inserted integer := 0;
begin
  if not public.conversation_is_read_only(v_conv_id) then
    raise exception 'RN-COR-08 FALLIDO: la conversación no se considera de solo lectura con la ventana vencida';
  end if;

  begin
    perform public.post_message(v_conv_id, 'quiero anadir algo mas');
    raise exception 'RN-COR-08 FALLIDO: se pudo escribir en una conversación con la ventana de corrección cerrada' using errcode = 'assert_failure';
  exception
    when raise_exception then null; -- esperado
  end;

  -- Y tampoco por la puerta de atrás, con un INSERT directo.
  begin
    insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
    values (v_conv_id, 'b1000000-0000-0000-0000-000000000001', auth.uid(), 'client', 'por la puerta de atras');
    v_inserted := 1;
  exception
    when insufficient_privilege then null; -- esperado
  end;
  if v_inserted <> 0 then
    raise exception 'RN-COR-08 FALLIDO: un INSERT directo saltó la conversación de solo lectura';
  end if;
end $$;

reset role;

-- ============================================================
-- N4 (auditoría) · dos casos negativos que faltaban: sin ellos, quitar la
-- comprobación de permiso de estas dos funciones no rompía ningún test.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  -- RN-ARC-04: compartir un archivo con el restaurante lo decide el
  -- equipo, no el propio restaurante.
  begin
    perform public.share_file_with_client((select value::uuid from h7_ctx where key = 'file_interno'));
    raise exception 'RN-ARC-04 FALLIDO: el restaurante pudo compartirse a sí mismo un archivo interno del equipo' using errcode = 'assert_failure';
  exception
    when raise_exception then null; -- esperado
  end;
end $$;

reset role;

-- Se guarda un mensaje real del hilo interno (como postgres: el
-- restaurante no puede leerlo, que es justo el punto). Sin un mensaje de
-- verdad, la llamada de abajo fallaría por "elige al menos un mensaje" y
-- el test pasaría por el motivo equivocado.
reset role;
insert into h7_ctx values ('msg_interno',
  (select id::text from public.messages
   where conversation_id = (select value::uuid from h7_ctx where key = 'conv_job')
   order by created_at limit 1));

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  -- Convertir una conversación en solicitud exige poder LEERLA. El caso
  -- que de verdad lo prueba no es un usuario ajeno (ese falla después, al
  -- crear el borrador, porque tampoco puede escribir en el
  -- establecimiento): es el propio restaurante sobre la conversación
  -- INTERNA de un trabajo. Sí puede escribir en su establecimiento, pero
  -- RN-MSG-04 le prohíbe leer ese hilo — así que si las comprobaciones
  -- desaparecieran, se llevaría a una solicitud nueva el contenido de una
  -- conversación interna del equipo.
  --
  -- Nota de cobertura, comprobada con mutación: convert_conversation_to_request()
  -- tiene DOS guardas que protegen esto (el tipo de conversación y
  -- can_read_conversation), y se tapan la una a la otra — quitar solo una
  -- no cambia el comportamiento observable, así que ningún test puede
  -- distinguirlo. Este test detecta que caigan las dos, que es la
  -- propiedad que de verdad importa. La segunda guarda es defensa en
  -- profundidad, no una puerta abierta.
  begin
    perform public.convert_conversation_to_request(
      (select value::uuid from h7_ctx where key = 'conv_job'),
      array[(select value::uuid from h7_ctx where key = 'msg_interno')],
      'intento sobre una conversación interna'
    );
    raise exception 'RN-MSG-04/HU-25 FALLIDO: el restaurante pudo convertir en solicitud una conversación interna del equipo' using errcode = 'assert_failure';
  exception
    when raise_exception then null; -- esperado
    when insufficient_privilege then null; -- esperado
  end;
end $$;

reset role;

-- ============================================================
-- X5 (segunda auditoría) · release_financial_holds() solo debe auditar
-- las transiciones que de verdad ocurrieron. Si el trabajo ya no estaba
-- en `authorized_pause`, el bloqueo se cierra pero NO se escribe un
-- state_event de un cambio que no pasó (CLAUDE.md: la auditoría no se
-- edita ni se borra, así que un asiento falso es permanente).
-- ============================================================
reset role;
do $$
declare
  v_job_id uuid := (select value::uuid from h7_ctx where key = 'job_a');
  v_eventos_antes integer;
  v_eventos_despues integer;
  v_bloqueo_abierto integer;
  v_devueltos integer;
begin
  -- Un bloqueo financiero abierto sobre un trabajo que NO está en
  -- authorized_pause (job_a quedó publicado en la sección de RN-COR-08).
  insert into public.blocks (space_id, job_id, reason_type, note, started_by)
  values ('b1000000-0000-0000-0000-000000000001', v_job_id, 'financial_hold', 'impago', 'b0000000-0000-0000-0000-000000000002');

  select count(*) into v_eventos_antes from public.state_events
  where entity_type = 'job' and entity_id = v_job_id;

  v_devueltos := public.release_financial_holds('b4000000-0000-0000-0000-000000000001');

  select count(*) into v_eventos_despues from public.state_events
  where entity_type = 'job' and entity_id = v_job_id;

  select count(*) into v_bloqueo_abierto from public.blocks
  where job_id = v_job_id and reason_type = 'financial_hold' and ended_at is null;

  if v_bloqueo_abierto <> 0 then
    raise exception 'RN-FIN-13 FALLIDO: el bloqueo financiero no se cerró'
      using errcode = 'assert_failure';
  end if;

  if v_eventos_despues <> v_eventos_antes then
    raise exception 'X5 FALLIDO: se auditó un cambio de estado que no ocurrió (eventos % -> %)',
      v_eventos_antes, v_eventos_despues using errcode = 'assert_failure';
  end if;

  if v_devueltos <> 0 then
    raise exception 'X5 FALLIDO: se contaron % reactivaciones sobre un trabajo que no estaba en pausa', v_devueltos
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- X1 / X3 (segunda auditoría) · las vistas que lee el restaurante son de
-- SOLO LECTURA, y `state_events` no le deja ver actor_id.
--
-- X1 fue un fallo real: una vista simple es auto-actualizable y, al
-- pertenecer a postgres, escribir por ella se saltaba el RLS de la tabla
-- base — el restaurante llegó a BORRAR sus eventos de estado. X3 es que
-- el arreglo de la política de state_events no tenía ningún test: se
-- podía revertir sin que nada fallara.
-- ============================================================
-- Un evento de estado de establecimiento, creado aquí de forma explícita
-- (como postgres) para no depender de que la sección de impago haya
-- dejado uno: lo que se prueba es la vista y la política, no el ciclo de
-- impago, que ya tiene su propia sección.
reset role;
insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
values ('b1000000-0000-0000-0000-000000000001', 'establishment', 'b4000000-0000-0000-0000-000000000001',
        'active', 'paused', 'b0000000-0000-0000-0000-000000000002', 'Ciclo de impago', 'nonpayment_pause');

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_borradas integer;
  v_actor_visible boolean;
  v_eventos integer;
begin
  -- Escritura: denegada en las dos vistas de cliente.
  begin
    delete from public.client_establishment_status_events
    where establishment_id = 'b4000000-0000-0000-0000-000000000001';
    get diagnostics v_borradas = row_count;
    if v_borradas > 0 then
      raise exception 'X1 FALLIDO: el restaurante borró % eventos de estado a través de la vista', v_borradas
        using errcode = 'assert_failure';
    end if;
  exception
    when insufficient_privilege then null; -- esperado
  end;

  begin
    update public.client_jobs set state = 'completed'
    where establishment_id = 'b4000000-0000-0000-0000-000000000001';
    get diagnostics v_borradas = row_count;
    if v_borradas > 0 then
      raise exception 'X1 FALLIDO: el restaurante cambió el estado de % trabajos a través de client_jobs', v_borradas
        using errcode = 'assert_failure';
    end if;
  exception
    when insufficient_privilege then null; -- esperado
  end;

  -- Lectura: sí ve el motivo de su estado (RN-EST-08)...
  select count(*) into v_eventos from public.client_establishment_status_events
  where establishment_id = 'b4000000-0000-0000-0000-000000000001';
  if v_eventos = 0 then
    raise exception 'RN-EST-08 FALLIDO: el restaurante no ve ningún cambio de estado de su establecimiento'
      using errcode = 'assert_failure';
  end if;

  -- ...pero no la identidad de quien lo hizo, ni por la tabla base.
  select count(*) > 0 into v_actor_visible from public.state_events
  where entity_type = 'establishment' and entity_id = 'b4000000-0000-0000-0000-000000000001';
  if v_actor_visible then
    raise exception 'X3 FALLIDO: el restaurante alcanza state_events (y con él actor_id) por la tabla base'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- X4 (segunda auditoría) · RN-FIN-07 en las funciones de dinero. El
-- arreglo que las cerró no tenía test: quitarle la comprobación pasaba
-- las cinco suites.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000008', false);
set role authenticated;

do $$
declare
  v_charge uuid := (select value::uuid from h7_ctx where key = 'charge_a');
  v_importe integer;
begin
  -- El rol Consulta no tiene visibilidad financiera: no ve el cobro por
  -- RLS, y tampoco puede sacarle el importe por RPC.
  --
  -- Nota de cobertura, comprobada con mutación: charge_status() delega en
  -- charge_outstanding_cents(), así que quitarle la comprobación a una
  -- sola de las tres no cambia el comportamiento (la otra la ataja). Este
  -- test detecta que se le quite a las tres, que es la regresión real.
  begin
    v_importe := public.charge_outstanding_cents(v_charge);
    raise exception 'RN-FIN-07 FALLIDO: el rol Consulta obtuvo el importe pendiente (%) por RPC', v_importe
      using errcode = 'assert_failure';
  exception
    when raise_exception then null; -- esperado
  end;

  begin
    perform public.charge_status(v_charge);
    raise exception 'RN-FIN-07 FALLIDO: el rol Consulta obtuvo el estado del cobro por RPC'
      using errcode = 'assert_failure';
  exception
    when raise_exception then null; -- esperado
  end;
end $$;

reset role;

-- Control positivo: quien SÍ tiene visibilidad financiera las sigue
-- usando (si el arreglo se pasara de celoso, esto lo detecta).
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000007', false);
set role authenticated;

do $$
declare
  v_estado text;
begin
  v_estado := public.charge_status((select value::uuid from h7_ctx where key = 'charge_a'));
  if v_estado is null then
    raise exception 'RN-FIN-07 FALLIDO: el Editor con visibilidad financiera no pudo consultar el estado del cobro'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- ============================================================
-- H10 (5ª revisión) · dos reglas implementadas sin test que las citara.
--
-- Las dos las hace cumplir un CHECK de la base, así que la comprobación es
-- corta; lo que faltaba era que existiera y llevara el número de la regla,
-- como pide CLAUDE.md.
-- ============================================================
do $$
declare
  v_def text;
begin
  -- RN-MSG-01: "no existen chats privados entre cliente y trabajador".
  -- Los únicos tipos de conversación posibles son los tres del PRD; si
  -- mañana alguien añadiera uno directo, este test lo vería.
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint where conname = 'conversations_type_check';
  if v_def is null then
    raise exception 'RN-MSG-01 FALLIDO: no existe el CHECK que limita los tipos de conversación' using errcode = 'assert_failure';
  end if;
  if v_def !~ 'request' or v_def !~ 'job_internal' or v_def !~ 'establishment' then
    raise exception 'RN-MSG-01 FALLIDO: los tipos de conversación no son los tres del PRD (%)', v_def using errcode = 'assert_failure';
  end if;
  if v_def ~ 'direct' or v_def ~ 'private' then
    raise exception 'RN-MSG-01 FALLIDO: existe un tipo de conversación privada entre cliente y trabajador (%)', v_def using errcode = 'assert_failure';
  end if;

  -- RN-ARC-01: las categorías de archivo son las ocho del PRD.
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint where conname = 'files_category_check';
  if v_def is null then
    raise exception 'RN-ARC-01 FALLIDO: no existe el CHECK de categorías de archivo' using errcode = 'assert_failure';
  end if;
  if (length(v_def) - length(replace(v_def, '''::text', ''))) / length('''::text') <> 8 then
    raise exception 'RN-ARC-01 FALLIDO: las categorías de archivo no son ocho (%)', v_def using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- H7 (5ª revisión) · `get_or_create_request_conversation()` comprueba
-- quién llama.
--
-- Es la puerta de HU-35: `conversations` no tiene política de INSERT, así
-- que abrir la conversación de una solicitud pasa por aquí. Sus dos
-- hermanas (`get_or_create_job_conversation`,
-- `get_or_create_establishment_conversation`) comprueban permisos; esta no
-- comprobaba NADA, ni que la solicitud existiera. Verificado en vivo sobre
-- una réplica del estado desplegado: `anon`, sin sesión ninguna, creaba la
-- fila.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000099', false);
set role authenticated;

do $$
begin
  -- Alguien de otro espacio no abre la conversación de esta solicitud (CA-02).
  begin
    perform public.get_or_create_request_conversation((select value::uuid from h7_ctx where key = 'request_a'));
    raise exception 'CA-02 FALLIDO: una identidad ajena pudo abrir la conversación de una solicitud' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%No tienes acceso a la conversación%' then
        raise exception 'CA-02 FALLIDO: get_or_create_request_conversation() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;

  -- Y una solicitud que no existe se dice, no se inventa.
  begin
    perform public.get_or_create_request_conversation('00000000-0000-0000-0000-0000000000ff');
    raise exception 'FALLIDO: se abrió la conversación de una solicitud inexistente' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%Solicitud no encontrada%' then
        raise exception 'FALLIDO: get_or_create_request_conversation() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

-- Sin sesión: `anon` no la ejecuta siquiera.
set role anon;

do $$
begin
  begin
    perform public.get_or_create_request_conversation((select value::uuid from h7_ctx where key = 'request_a'));
    raise exception 'CLAUDE.md MUST FALLIDO: anon pudo crear una conversación sin sesión' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ============================================================
-- H8 (5ª revisión) · Datos para que el barrido de identidad NO sea vacuo.
--
-- Reconocimiento honesto: las aserciones de `tasks` y de los
-- `state_events` de tarea que escribí en la 4ª revisión comparaban 0 con
-- 0. El fixture no creaba ni una tarea ni una corrección, así que dos
-- tercios del arreglo B2 y todo el de la migración 29 podían revertirse
-- sin que la suite se enterara — comprobado revirtiendo `tasks_select` y
-- `state_events_select` a su versión con fuga: verde.
--
-- Esto crea las filas que faltaban, con las funciones reales, para que las
-- comprobaciones de más abajo ejerciten datos de verdad:
--   · una tarea de `job_a`, creada por el administrador y asignada a Ana
--     (tasks.created_by y tasks.assignee_id son del equipo);
--   · un cambio de estado de esa tarea hecho por Ana
--     (state_events.actor_id de tipo 'task');
--   · una corrección por error del equipo, abierta y cerrada por el
--     equipo (corrections.requested_by y completed_by).
-- ============================================================
-- El trabajo sobre el que se monta todo esto: nuevo, para no depender del
-- estado en que hayan dejado a `job_a` las secciones anteriores.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_job_id uuid;
begin
  v_job_id := public.h7_make_job(
    'b4000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001',
    'H8: trabajo con tarea y corrección del equipo', 'small'
  );
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
  perform public.auto_assign_job(v_job_id);
  insert into h7_ctx values ('job_correccion', v_job_id::text);
end $$;

reset role;

-- La tarea: la crea el administrador y se la asigna a Ana. Las dos
-- identidades son del equipo, y ninguna le corresponde al restaurante.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_task_id uuid;
begin
  v_task_id := public.create_job_task(
    (select value::uuid from h7_ctx where key = 'job_correccion'),
    'Ajustar el horario en el pie de página', 30,
    'b0000000-0000-0000-0000-000000000003',
    'Lo hace Ana'
  );
  insert into h7_ctx values ('task_a', v_task_id::text);
end $$;

reset role;

-- Ana la mueve: eso escribe un state_event de tipo 'task' con su actor_id.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h7_ctx where key = 'job_correccion');
begin
  perform public.start_job(v_job_id);
  perform public.update_task_state((select value::uuid from h7_ctx where key = 'task_a'), 'in_progress');
  perform public.publish_job(v_job_id, now() + interval '30 days');
end $$;

reset role;

-- Y una corrección por error del equipo, que abre y cierra el equipo.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h7_ctx where key = 'job_correccion');
  v_correccion uuid;
begin
  v_correccion := public.open_team_error_correction(v_job_id, 'Se nos coló una errata en el teléfono');
  perform public.start_correction(v_correccion);
  perform public.complete_correction(v_correccion, 'Corregido');
  insert into h7_ctx values ('correccion_equipo', v_correccion::text);
end $$;

reset role;

-- Control de que el fixture hizo su trabajo: si alguna de estas tablas
-- vuelve a quedarse vacía, las comprobaciones de identidad de más abajo
-- dejarían de comprobar nada y hay que enterarse AQUÍ, no seis meses
-- después.
do $$
declare
  v_vacias text := '';
begin
  if (select count(*) from public.tasks) = 0 then v_vacias := v_vacias || ' tasks'; end if;
  if (select count(*) from public.state_events where entity_type = 'task') = 0 then v_vacias := v_vacias || ' state_events(task)'; end if;
  if (select count(*) from public.corrections where completed_by is not null) = 0 then v_vacias := v_vacias || ' corrections'; end if;
  if (select count(*) from public.assignments) = 0 then v_vacias := v_vacias || ' assignments'; end if;
  if v_vacias <> '' then
    raise exception 'FIXTURE INSUFICIENTE: sin filas en%, las comprobaciones de identidad de abajo serían vacuas', v_vacias
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- BARRIDO DE IDENTIDAD (4ª revisión, ampliado en la 5ª).
--
-- CLAUDE.md MUST NOT: "mostrar al cliente el nombre, foto o identidad
-- individual de nadie del equipo de mantenimiento". PRD, principio P7:
-- "El cliente no ve la organización interna".
--
-- Las tres primeras revisiones comprobaban esto con una lista blanca
-- escrita a mano, y por eso se escaparon tres veces columnas nuevas. La
-- cuarta la sustituyó por un barrido, pero solo sobre columnas con clave
-- ajena declarada a `profiles`. La quinta demostró cuatro formas de
-- filtrar identidad que ese barrido no veía, creándolas y comprobando que
-- la suite seguía verde:
--
--   A · una columna de texto con el correo del administrador;
--   B · una columna uuid SIN clave ajena declarada;
--   C · una vista que expone la identidad;
--   D · una función SECURITY DEFINER que la devuelve.
--
-- Así que ahora son cuatro pasadas, y ninguna depende de una lista de
-- columnas que haya que acordarse de ampliar.
--
-- LÍMITE, dicho para que nadie se confíe: las pasadas 1 y 2 solo ejercitan
-- una columna si el fixture tiene filas en ella. Por eso el bloque
-- anterior crea tareas, eventos de tarea y una corrección cerrada, y por
-- eso sigue existiendo más abajo la lista explícita de privilegios de
-- columna, que es estática y no depende de los datos. Se complementan: el
-- barrido caza fugas de FILA y de forma, la lista caza `grant select` de
-- más.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

-- Pasada 1 y 2 · TODA columna uuid o texto de TODA tabla de `public`, no
-- solo las que declaran clave ajena a `profiles`.
do $$
declare
  v_col record;
  v_hit text;
  v_expuestas text := '';
  v_equipo uuid[] := array[
    'b0000000-0000-0000-0000-000000000001'::uuid,
    'b0000000-0000-0000-0000-000000000002'::uuid,
    'b0000000-0000-0000-0000-000000000003'::uuid,
    'b0000000-0000-0000-0000-000000000004'::uuid
  ];
  v_textos text[] := array[
    'h7-owner@example.com', 'h7-admin@example.com',
    'h7-ana@example.com', 'h7-luis@example.com'
  ];
begin
  for v_col in
    select c.relname as tabla, a.attname as columna, t.typname as tipo
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public' and c.relkind = 'r'
      and t.typname in ('uuid', 'text', 'varchar')
    order by 1, 2
  loop
    begin
      if v_col.tipo = 'uuid' then
        execute format('select %I::text from public.%I where %I = any($1) limit 1',
                       v_col.columna, v_col.tabla, v_col.columna)
          into v_hit using v_equipo;
      else
        execute format('select %I from public.%I where %I = any($1) limit 1',
                       v_col.columna, v_col.tabla, v_col.columna)
          into v_hit using v_textos || (select array_agg(u::text) from unnest(v_equipo) u);
      end if;

      if v_hit is not null then
        v_expuestas := v_expuestas || ' ' || v_col.tabla || '.' || v_col.columna;
      end if;
    exception
      -- Columna revocada a nivel de privilegio: es justo lo que se busca.
      when insufficient_privilege then null;
    end;
  end loop;

  if v_expuestas <> '' then
    raise exception 'CLAUDE.md MUST NOT / P7 FALLIDO: el restaurante obtiene la identidad de miembros del equipo en:%', v_expuestas
      using errcode = 'assert_failure';
  end if;
end $$;

-- Pasada 3 · Las vistas. `client_jobs` y
-- `client_establishment_status_events` existen precisamente para tapar
-- identidad; si una tercera vista la dejara pasar, o si a estas se les
-- añadiera una columna de más, aquí se ve.
do $$
declare
  v_col record;
  v_hit text;
  v_expuestas text := '';
  v_equipo uuid[] := array[
    'b0000000-0000-0000-0000-000000000001'::uuid,
    'b0000000-0000-0000-0000-000000000002'::uuid,
    'b0000000-0000-0000-0000-000000000003'::uuid,
    'b0000000-0000-0000-0000-000000000004'::uuid
  ];
begin
  for v_col in
    select c.relname as vista, a.attname as columna
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public' and c.relkind = 'v' and t.typname = 'uuid'
    order by 1, 2
  loop
    begin
      execute format('select %I::text from public.%I where %I = any($1) limit 1',
                     v_col.columna, v_col.vista, v_col.columna)
        into v_hit using v_equipo;
      if v_hit is not null then
        v_expuestas := v_expuestas || ' ' || v_col.vista || '.' || v_col.columna;
      end if;
    exception
      when insufficient_privilege then null;
    end;
  end loop;

  if v_expuestas <> '' then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: una vista entrega identidad del equipo al restaurante:%', v_expuestas
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Pasada 4 · Las funciones, en falso-cerrado.
--
-- Toda función `SECURITY DEFINER` de `public` que sea ejecutable por
-- `anon` o `authenticated` y cuyo cuerpo NO mencione ninguna comprobación
-- de permisos tiene que estar en la lista de excepciones, con su motivo.
-- Cualquier función nueva que caiga aquí hace fallar el test hasta que
-- alguien la clasifique — que es exactamente lo que no pasó con
-- `job_assignee` (B1 de la 4ª revisión) ni con
-- `get_or_create_request_conversation` (H7 de la 5ª).
do $$
declare
  v_fn text;
  v_sin_clasificar text := '';
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'Sin rol authenticated: se omite la comprobación de funciones';
    return;
  end if;

  for v_fn in
    select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))
      -- Sobre el cuerpo SIN COMENTARIOS: la heurística miraba el texto
      -- crudo, así que una sola línea de comentario con la palabra
      -- `can_read` bastaba para colar una función que devolvía el nombre y
      -- el correo de todo el equipo (H-03 de la 6ª revisión, demostrado).
      --
      -- Y `auth.uid()` ya no absuelve: estampar el actor en un `audit_log`
      -- no es comprobar nada, y trece funciones pasaban el filtro solo por
      -- mencionarlo.
      and regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
          !~ 'has_capability|can_read|can_write|is_space_member|is_platform_owner|is_establishment_|is_group_member|is_authorized_worker|client_can_view_billing|current_supervisors'
      and p.proname not in (
        -- Las ocho que las políticas de RLS evalúan como el rol que
        -- consulta: sin su EXECUTE para `authenticated` las políticas se
        -- rompen. Documentado en la migración 20260830000032.
        'conversation_is_read_only', 'conversation_space_id', 'establishment_space_id',
        'group_space_id', 'message_conversation_id', 'request_establishment_id',
        'request_space_id', 'request_state',
        -- Disparadores: los ejecuta la base, no se invocan por RPC.
        'handle_new_user', 'set_establishment_code',
        -- Las primitivas de permisos: son el mecanismo con el que se
        -- comprueba, no pueden comprobarse a sí mismas.
        'has_capability', 'is_space_member', 'is_platform_owner',
        'is_group_member', 'is_establishment_member',
        'is_authorized_worker_establishment', 'can_write_establishment',
        'client_can_view_billing',
        -- Estas cinco SÍ comprueban permisos, pero a mano: comparan
        -- `auth.uid()` con el dueño de la fila y lanzan excepción si no
        -- coincide (el responsable asignado, el autor del mensaje, el
        -- destinatario de la invitación). Verificadas una a una el
        -- 01/09/2026. Se enumeran porque la heurística mira el texto y no
        -- entiende esa forma; si alguien las toca, hay que releerlas.
        'accept_space_invitation', 'edit_message', 'publish_job',
        'start_job', 'request_job_reassignment',
        -- Hito 8. `mark_notification_read` es de la misma familia que las
        -- cinco de arriba: compara `auth.uid()` con el destinatario del
        -- aviso y lanza excepción si no coincide.
        'mark_notification_read',
        -- `space_slug` no comprueba nada, y no debe: devuelve el segmento
        -- de URL del espacio, que no es un dato sensible —el restaurante
        -- ya navega por él— y la necesita `global_search()`, que es
        -- SECURITY INVOKER, para construir el enlace de cada resultado sin
        -- unirse a `spaces` (a la que el cliente no tiene acceso). Está
        -- revocada a `anon`.
        'space_slug'
      )
      -- Los ayudantes del propio fixture (`h7_make_job` y compañía), que
      -- este archivo crea y borra: son andamiaje del test, no producto.
      and p.proname not like 'h7\_%'
    order by 1
  loop
    v_sin_clasificar := v_sin_clasificar || ' ' || v_fn;
  end loop;

  if v_sin_clasificar <> '' then
    raise exception 'CLAUDE.md MUST FALLIDO: función SECURITY DEFINER sin comprobación de permisos y abierta por RPC:%. O le falta la comprobación, o hay que revocarla, o hay que justificarla en la lista de excepciones de este test.', v_sin_clasificar
      using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

-- B2 · Y explícitamente, las tres tablas que la 4ª revisión encontró
-- abiertas: la organización interna del equipo no es del restaurante, ni
-- fila ni columna (P7). No basta con taparle las columnas, como en
-- `messages` o `corrections`, donde la fila SÍ es suya.
do $$
declare
  v_filas integer;
begin
  select count(*) into v_filas from public.assignments;
  if v_filas <> 0 then
    raise exception 'P7 FALLIDO: el restaurante ve % asignaciones del equipo', v_filas using errcode = 'assert_failure';
  end if;

  select count(*) into v_filas from public.tasks;
  if v_filas <> 0 then
    raise exception 'P7 FALLIDO: el restaurante ve % tareas internas', v_filas using errcode = 'assert_failure';
  end if;

  select count(*) into v_filas from public.state_events where entity_type = 'task';
  if v_filas <> 0 then
    raise exception 'P7 FALLIDO: el restaurante ve % cambios de estado de tareas internas', v_filas using errcode = 'assert_failure';
  end if;
end $$;

-- M5 (4ª revisión) · RN-FIN-06: quien registra un pago es el equipo. El
-- restaurante no cobra su propia deuda.
--
-- Hasta ahora no había control negativo: con la comprobación de rol
-- neutralizada, lo único que frenaba al cliente era el NOT NULL de
-- `payments.recorded_role`. La regla se cumplía por accidente.
do $$
begin
  begin
    perform public.register_payment(
      (select value::uuid from h7_ctx where key = 'charge_b'), 1000, 'transfer', now()
    );
    raise exception 'RN-FIN-06 FALLIDO: el restaurante pudo registrar el pago de su propia deuda' using errcode = 'assert_failure';
  exception
    when raise_exception then
      -- Y por el motivo correcto. Sin esta comprobación el test se ponía
      -- rojo igual, pero por el NOT NULL de `payments.recorded_role`, no
      -- por la comprobación de rol: la regla se cumplía por accidente y el
      -- test no lo distinguía (H9 de la 5ª revisión).
      if sqlerrm not like '%Solo el equipo de mantenimiento%' then
        raise exception 'RN-FIN-06 FALLIDO: register_payment() rechazó al cliente por otro motivo (%), no por la comprobación de rol', sqlerrm
          using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

-- ============================================================
-- RN-FIN-03 (corregida 31/08/2026) · transferencia o Bizum, y nada más.
--
-- Sin Stripe ni pasarela no hay quien cobre una tarjeta ni gestione una
-- domiciliación, así que esos métodos no existen (decisión 10 de
-- docs/DECISIONES.md). Hasta ahora la regla solo se comprobaba en
-- TypeScript, contra una lista; esto la comprueba contra la base, que es
-- donde manda.
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_charge_b uuid := (select value::uuid from h7_ctx where key = 'charge_b');
  v_metodo text;
begin
  -- Bizum sí.
  perform public.register_payment(v_charge_b, 1000, 'bizum', now(), null, null, 'bizum-1');
  select method into v_metodo from public.payments
  where charge_id = v_charge_b and idempotency_key = 'bizum-1';
  if v_metodo <> 'bizum' then
    raise exception 'RN-FIN-03 FALLIDO: no se pudo registrar un pago por Bizum (método guardado: %)', v_metodo
      using errcode = 'assert_failure';
  end if;

  -- Tarjeta y domiciliación, no: no hay pasarela que las cobre.
  begin
    perform public.register_payment(v_charge_b, 1000, 'card', now(), null, null, 'tarjeta-1');
    raise exception 'RN-FIN-03 FALLIDO: se registró un pago con tarjeta' using errcode = 'assert_failure';
  exception
    when check_violation then null;
  end;

  begin
    perform public.register_payment(v_charge_b, 1000, 'direct_debit', now(), null, null, 'domiciliacion-1');
    raise exception 'RN-FIN-03 FALLIDO: se registró un pago por domiciliación' using errcode = 'assert_failure';
  exception
    when check_violation then null;
  end;
end $$;

reset role;

-- ============================================================
-- B3 (4ª revisión) · RN-FIN-11 / RN-FIN-12 — "servicio detenido" tiene
-- que detener el servicio, no solo lo que estuviera corriendo en el
-- instante en que se evaluó el impago.
--
-- `apply_financial_hold_on_jobs()` pausa los trabajos vivos en ese
-- momento, y hasta la 4ª revisión eso era todo: `start_job()`,
-- `publish_job()`, `submit_request()` y `accept_request()` no miraban el
-- estado del establecimiento, así que bastaba con pulsar un botón después
-- para arrancar un T3 nuevo, o un T1 nuevo, corriendo durante la
-- suspensión. Los contadores no estaban detenidos: solo lo estaban los
-- que existían al evaluar.
--
-- La transición impago -> `suspended` ya la cubre la sección de RN-FIN-10
-- / RN-FIN-11 de más arriba. Lo que se comprueba aquí es lo otro: DADO un
-- establecimiento suspendido, esas cuatro operaciones se niegan. Por eso
-- el estado se pone directamente, sin repetir el ciclo de impago entero.
--
-- Solo `suspended`. RN-FIN-10 deja el establecimiento "Pausado por impago"
-- a las +24 h y no dice que el servicio se detenga; se detiene a las +72 h
-- (RN-FIN-11). Guardar también `paused` sería una regla más dura que la
-- escrita.
-- ============================================================

-- Fixture, ANTES de suspender: un trabajo asignado sin comenzar, otro en
-- curso, una solicitud pendiente de aceptación y un borrador.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_job_asignado uuid;
  v_job_en_curso uuid;
  v_request_pendiente uuid;
begin
  v_job_asignado := public.h7_make_job(
    'b4000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001',
    'B3: trabajo asignado sin comenzar', 'small'
  );
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
  perform public.auto_assign_job(v_job_asignado);
  insert into h7_ctx values ('job_susp_asignado', v_job_asignado::text);

  v_job_en_curso := public.h7_make_job(
    'b4000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001',
    'B3: trabajo en curso', 'small'
  );
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
  perform public.auto_assign_job(v_job_en_curso);
  insert into h7_ctx values ('job_susp_en_curso', v_job_en_curso::text);

  -- Una solicitud que se queda a las puertas de aceptarse.
  v_request_pendiente := public.h7_make_pending_request(
    'b4000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001',
    'B3: pendiente de aceptación', 'small'
  );
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
  insert into h7_ctx values ('request_susp_pendiente', v_request_pendiente::text);
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  perform public.start_job((select value::uuid from h7_ctx where key = 'job_susp_en_curso'));
end $$;

reset role;

-- Más fixture para la 5ª revisión, todo creado ANTES de suspender:
--   · un trabajo sin asignar (para auto_assign_job, H4b);
--   · una solicitud esperando información del cliente (H2);
--   · una solicitud revisada pendiente de re-aceptación (H3);
--   · una corrección pedida sobre un trabajo publicado (H4).
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_job uuid;
  v_req uuid;
begin
  -- Trabajo aceptado y SIN asignar.
  v_job := public.h7_make_job(
    'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001', 'H4b: trabajo sin asignar', 'small');
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
  insert into h7_ctx values ('job_susp_sin_asignar', v_job::text);

  -- Solicitud parada esperando información del restaurante.
  v_req := public.h7_make_needs_information(
    'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001', 'H2: falta información');
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
  insert into h7_ctx values ('request_susp_info', v_req::text);
end $$;

reset role;

-- Una solicitud ya aceptada que el equipo reclasifica: vuelve a
-- `pending_client_acceptance` y hace falta accept_revised_request().
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_job uuid;
  v_req uuid;
begin
  v_job := public.h7_make_job(
    'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001', 'H3: solicitud revisada', 'small');
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
  select request_id into v_req from public.jobs where id = v_job;
  perform public.request_new_client_acceptance(
    v_job, 'medium', 'Es más grande de lo que parecía', 'Al abrirlo toca también la carta');
  insert into h7_ctx values ('request_susp_revisada', v_req::text);
end $$;

reset role;

-- Un trabajo publicado con una corrección pedida por el restaurante,
-- todavía sin empezar.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_job uuid;
begin
  v_job := public.h7_make_job(
    'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001', 'H4: trabajo con corrección pendiente', 'small');
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
  perform public.auto_assign_job(v_job);
  insert into h7_ctx values ('job_susp_correccion', v_job::text);
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_job uuid := (select value::uuid from h7_ctx where key = 'job_susp_correccion');
begin
  perform public.start_job(v_job);
  perform public.publish_job(v_job, now() + interval '30 days');
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  insert into h7_ctx values ('correccion_susp', public.request_free_correction(
    (select value::uuid from h7_ctx where key = 'job_susp_correccion'),
    'El teléfono sigue mal'
  )::text);
end $$;

reset role;

-- Y una SEGUNDA corrección, esta ya empezada antes del impago. Hace falta
-- porque `complete_correction()` exige el trabajo en `in_correction`, y
-- `start_correction()` está guardada: sin dejar una corrección en marcha
-- de antemano, la guarda de `complete_correction()` es inalcanzable desde
-- el test y no la observa ninguna mutación (H-01 de la 6ª revisión — el
-- commit 1bf6fe4 afirmaba haber mutado las cinco guardas una a una, y para
-- esta no era cierto).
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_job uuid;
  v_corr uuid;
begin
  v_job := public.h7_make_job(
    'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001', 'H-01: corrección ya empezada', 'small');
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
  perform public.auto_assign_job(v_job);
  insert into h7_ctx values ('job_corr_empezada', v_job::text);
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_job uuid := (select value::uuid from h7_ctx where key = 'job_corr_empezada');
begin
  perform public.start_job(v_job);
  perform public.publish_job(v_job, now() + interval '30 days');
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_corr uuid;
begin
  v_corr := public.open_team_error_correction(
    (select value::uuid from h7_ctx where key = 'job_corr_empezada'), 'Nos equivocamos otra vez');
  perform public.start_correction(v_corr);
  insert into h7_ctx values ('correccion_empezada', v_corr::text);
end $$;

reset role;

-- Un borrador del restaurante, todavía sin enviar.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  insert into h7_ctx values ('request_susp_borrador', public.create_request_draft(
    'b4000000-0000-0000-0000-000000000001', 'B3: borrador sin enviar', null
  )::text);
end $$;

reset role;

-- Y ahora, suspendido por impago.
do $$
begin
  insert into h7_ctx values ('estado_antes_susp',
    (select status from public.establishments where id = 'b4000000-0000-0000-0000-000000000001'));
  update public.establishments set status = 'suspended'
  where id = 'b4000000-0000-0000-0000-000000000001';
end $$;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  -- RN-FIN-12: "se detienen trabajos".
  begin
    perform public.start_job((select value::uuid from h7_ctx where key = 'job_susp_asignado'));
    raise exception 'RN-FIN-11/12 FALLIDO: se pudo COMENZAR un trabajo con el establecimiento suspendido por impago' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' then
        raise exception 'RN-FIN-11/12 FALLIDO: start_job() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;

  -- RN-FIN-12: "...y publicaciones".
  begin
    perform public.publish_job(
      (select value::uuid from h7_ctx where key = 'job_susp_en_curso'),
      now() + interval '30 days'
    );
    raise exception 'RN-FIN-11/12 FALLIDO: se pudo PUBLICAR un trabajo con el establecimiento suspendido por impago' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' then
        raise exception 'RN-FIN-11/12 FALLIDO: publish_job() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  -- RN-FIN-12: "...y contadores". Enviar una solicitud arranca un T1.
  begin
    perform public.submit_request((select value::uuid from h7_ctx where key = 'request_susp_borrador'));
    raise exception 'RN-FIN-11/12 FALLIDO: se pudo ENVIAR una solicitud con el establecimiento suspendido por impago' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' then
        raise exception 'RN-FIN-11/12 FALLIDO: submit_request() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;

  -- Aceptar crea un trabajo nuevo (RN-REQ-02) y arranca T2.
  begin
    perform public.accept_request((select value::uuid from h7_ctx where key = 'request_susp_pendiente'));
    raise exception 'RN-FIN-11/12 FALLIDO: se pudo ACEPTAR una solicitud con el establecimiento suspendido por impago' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' then
        raise exception 'RN-FIN-11/12 FALLIDO: accept_request() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

-- ============================================================
-- RN-FIN-10 (aclarada 31/08/2026) · el servicio se detiene a las 24 h,
-- no a las 72.
--
-- La quinta revisión encontró que el código hacía dos cosas
-- contradictorias: `evaluate_establishment_dunning()` paraba TODOS los
-- contadores ya en la etapa `paused` (+24 h), pero la guarda solo miraba
-- `suspended` (+72 h). Se paraban once contadores y acto seguido el
-- cliente enviaba una solicitud y el trabajador comenzaba un trabajo,
-- arrancando dos nuevos que corrían durante el impago.
--
-- No era un fallo de implementación sino una contradicción entre
-- documentos, así que se preguntó. Bosco: el servicio se detiene a las
-- 24 h (decisión 11 de docs/DECISIONES.md). Esto lo comprueba con el
-- establecimiento SOLO pausado, que es el caso que antes se colaba.
-- ============================================================
do $$
begin
  update public.establishments set status = 'paused'
  where id = 'b4000000-0000-0000-0000-000000000001';
end $$;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform public.start_job((select value::uuid from h7_ctx where key = 'job_susp_asignado'));
    raise exception 'RN-FIN-10 FALLIDO: se pudo COMENZAR un trabajo con el establecimiento PAUSADO por impago (+24 h)' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' then
        raise exception 'RN-FIN-10 FALLIDO: start_job() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  begin
    perform public.submit_request((select value::uuid from h7_ctx where key = 'request_susp_borrador'));
    raise exception 'RN-FIN-10 FALLIDO: se pudo ENVIAR una solicitud con el establecimiento PAUSADO por impago (+24 h)' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' then
        raise exception 'RN-FIN-10 FALLIDO: submit_request() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

-- Y de vuelta a `suspended`, que es donde lo dejan los bloques siguientes.
do $$
begin
  update public.establishments set status = 'suspended'
  where id = 'b4000000-0000-0000-0000-000000000001';
end $$;

-- ============================================================
-- H1 a H4 (5ª revisión) · el resto del pasillo.
--
-- La 4ª pasada guardó cuatro funciones y dio por hecho que ahí acababa la
-- lista. No acababa: había otras cinco por las que se podía reanudar el
-- servicio con el establecimiento suspendido, y una de ellas —
-- `unblock_job()` — levantaba directamente la retención por impago.
-- ============================================================

-- H1 (BLOQUEANTE): la retención por impago sobre un trabajo en curso.
-- `apply_financial_hold_on_jobs()` es interna (la llama el ciclo de
-- impago), así que aquí se invoca desde el rol de servicio, que es como se
-- ejecuta de verdad.
do $$
begin
  -- Las dos, en el mismo orden que `evaluate_establishment_dunning()`:
  -- primero se paran los contadores, luego se retienen los trabajos.
  perform public.pause_establishment_counters('b4000000-0000-0000-0000-000000000001');
  perform public.apply_financial_hold_on_jobs('b4000000-0000-0000-0000-000000000001');
end $$;

do $$
declare
  v_job uuid := (select value::uuid from h7_ctx where key = 'job_susp_en_curso');
begin
  if not exists (
    select 1 from public.blocks
    where job_id = v_job and reason_type = 'financial_hold' and ended_at is null
  ) then
    raise exception 'FIXTURE: la retención por impago no llegó a aplicarse sobre el trabajo en curso'
      using errcode = 'assert_failure';
  end if;
end $$;

-- Como ADMINISTRADOR, que es quien puede levantar una pausa autorizada:
-- el test tiene que ser contra quien de verdad podría hacerlo, no contra
-- alguien a quien ya frena otra comprobación distinta.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job uuid := (select value::uuid from h7_ctx where key = 'job_susp_en_curso');
begin
  -- RN-FIN-11/12: el mismo botón que reanuda un trabajo bloqueado por el
  -- cliente NO levanta una retención por impago.
  begin
    perform public.unblock_job(v_job, 'Venga, sigo');
    raise exception 'RN-FIN-11/12 FALLIDO: se pudo REANUDAR un trabajo retenido por impago' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' and sqlerrm not like '%retenido por impago%' then
        raise exception 'RN-FIN-11/12 FALLIDO: unblock_job() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;

  -- Y la retención sigue abierta y el T3 sigue parado: la llamada no dejó
  -- nada a medias.
  if not exists (
    select 1 from public.blocks
    where job_id = v_job and reason_type = 'financial_hold' and ended_at is null
  ) then
    raise exception 'RN-FIN-12 FALLIDO: unblock_job() cerró la retención por impago' using errcode = 'assert_failure';
  end if;
  -- `counter_is_running()` es interna (migración 24), así que el estado del
  -- contador se lee del libro directamente, que es lo que ella hace.
  if (
    select te.event_type in ('started', 'resumed')
    from public.timer_events te
    where te.counter_kind = 't3' and te.entity_type = 'job' and te.entity_id = v_job
    order by te.occurred_at desc, te.created_at desc limit 1
  ) then
    raise exception 'RN-FIN-12 FALLIDO: el T3 volvió a correr con el establecimiento suspendido' using errcode = 'assert_failure';
  end if;

  -- H4: una corrección no se ejecuta ni se publica durante la suspensión.
  begin
    perform public.start_correction((select value::uuid from h7_ctx where key = 'correccion_susp'));
    raise exception 'RN-FIN-11/12 FALLIDO: se pudo EMPEZAR una corrección con el establecimiento suspendido' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' then
        raise exception 'RN-FIN-11/12 FALLIDO: start_correction() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;

  -- Y una que YA estaba empezada tampoco se cierra: `complete_correction()`
  -- publica el trabajo (`update public.jobs set state = 'published'`), y
  -- RN-FIN-12 dice "se detienen trabajos, publicaciones y contadores".
  begin
    perform public.complete_correction((select value::uuid from h7_ctx where key = 'correccion_empezada'), 'Ya está');
    raise exception 'RN-FIN-11/12 FALLIDO: se pudo CERRAR (y publicar) una corrección con el establecimiento suspendido' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' then
        raise exception 'RN-FIN-11/12 FALLIDO: complete_correction() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  -- H2: una acción del cliente no rearranca T1 con el servicio detenido.
  begin
    perform public.provide_additional_information(
      (select value::uuid from h7_ctx where key = 'request_susp_info'), 'Aquí van las fotos'
    );
    raise exception 'RN-FIN-11/12 FALLIDO: se pudo APORTAR INFORMACIÓN (y reanudar T1) con el establecimiento suspendido' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' then
        raise exception 'RN-FIN-11/12 FALLIDO: provide_additional_information() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;

  -- H3: la hermana de accept_request tampoco acepta ni consume crédito.
  begin
    perform public.accept_revised_request((select value::uuid from h7_ctx where key = 'request_susp_revisada'));
    raise exception 'RN-FIN-11/12 FALLIDO: se pudo ACEPTAR UNA REVISIÓN (y consumir crédito) con el establecimiento suspendido' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' then
        raise exception 'RN-FIN-11/12 FALLIDO: accept_revised_request() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

-- H4b: asignar arranca T2 en la primera asignación (RN-SLA-05), así que
-- tampoco se asigna con el servicio detenido.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  begin
    perform public.auto_assign_job((select value::uuid from h7_ctx where key = 'job_susp_sin_asignar'));
    raise exception 'RN-FIN-11/12 FALLIDO: se pudo ASIGNAR un trabajo (y arrancar T2) con el establecimiento suspendido' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%detenido por impago%' then
        raise exception 'RN-FIN-11/12 FALLIDO: auto_assign_job() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

-- RN-FIN-12: "No se borra información". La suspensión detiene, no destruye.
do $$
declare
  v_estado text;
begin
  -- El trabajo queda RETENIDO (`authorized_pause` con su bloqueo
  -- `financial_hold`), que es lo que RN-FIN-12 pide: se detiene. Lo que no
  -- puede pasar es que se pierda — sigue ahí, con su solicitud, su
  -- responsable y su libro de contadores intactos.
  select state into v_estado from public.jobs
  where id = (select value::uuid from h7_ctx where key = 'job_susp_en_curso');
  if v_estado <> 'authorized_pause' then
    raise exception 'RN-FIN-12 FALLIDO: el trabajo retenido por impago debería quedar en authorized_pause, está en %', v_estado using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.jobs j
    where j.id = (select value::uuid from h7_ctx where key = 'job_susp_en_curso')
      and j.request_id is not null and j.assigned_to is not null and j.started_at is not null
  ) then
    raise exception 'RN-FIN-12 FALLIDO: la suspensión borró información del trabajo' using errcode = 'assert_failure';
  end if;

  update public.establishments
  set status = (select value from h7_ctx where key = 'estado_antes_susp')
  where id = 'b4000000-0000-0000-0000-000000000001';
end $$;

-- ============================================================
-- H-02 (6ª revisión) · un cobro perdonado o reembolsado no puede ocultar
-- deuda viva.
--
-- El ciclo de impago (RN-FIN-10/11) actúa sobre el SALDO; la pantalla
-- miraba el APUNTE. Resultado: el establecimiento quedaba suspendido por
-- un cobro que se mostraba como "Perdonado" o "Reembolsado", y
-- `waive_charge()` no podía arreglarlo porque su idempotencia miraba "¿ya
-- existe un perdón?" en vez de "¿queda deuda?".
-- ============================================================
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_sub uuid;
  v_charge uuid;
  v_pago uuid;
  v_estado text;
  v_deuda integer;
begin
  -- Un cobro propio para no tocar los de los bloques anteriores.
  select id into v_sub from public.subscriptions
  where establishment_id = 'b4000000-0000-0000-0000-000000000002' and kind = 'plan' limit 1;
  v_charge := public.generate_monthly_charge(v_sub, now() - interval '80 hours');
  if v_charge is null then
    raise exception 'FIXTURE H-02: no se pudo emitir el cobro' using errcode = 'assert_failure';
  end if;

  -- Camino 1: reembolso total. Sin revertir nada.
  v_pago := public.register_payment(v_charge, public.charge_outstanding_cents(v_charge), 'transfer', now(), null, null, 'h02-1');
  if public.charge_status(v_charge) <> 'paid' then
    raise exception 'FIXTURE H-02: el cobro debería quedar pagado, está %', public.charge_status(v_charge) using errcode = 'assert_failure';
  end if;

  perform public.refund_charge(v_charge, public.charge_collected_cents(v_charge), 'Servicio no prestado');
  v_deuda := public.charge_outstanding_cents(v_charge);
  v_estado := public.charge_status(v_charge);

  if v_deuda <= 0 then
    raise exception 'FIXTURE H-02: se esperaba deuda viva tras el reembolso, hay %', v_deuda using errcode = 'assert_failure';
  end if;
  if v_estado in ('refunded', 'waived', 'paid') then
    raise exception 'RN-DAT-05 FALLIDO: un cobro con % céntimos de deuda viva se muestra como "%" — el impago actúa sobre el saldo y la pantalla enseñaría lo contrario',
      v_deuda, v_estado using errcode = 'assert_failure';
  end if;

  -- RN-FIN-04b (decisión 12, 01/09/2026): reembolsar REABRE el cobro. Con
  -- el vencimiento ya pasado queda "Vencido"; con el vencimiento por
  -- delante quedaría "Pendiente" (la rama sin vencer se cubre en
  -- finance.test.ts, donde se puede mover el reloj). Devolver el dinero
  -- dejando al cliente a cero es otra operación —cancelación/abono— que no
  -- existe y que no se improvisa aquí.
  -- Este cobro todavía no ha vencido (`generate_monthly_charge` es
  -- idempotente por periodo y devuelve el que ya existe, con vencimiento
  -- por delante), así que le toca "Pendiente".
  if v_estado <> 'pending' then
    raise exception 'RN-FIN-04b FALLIDO: un cobro reembolsado SIN vencer debería quedar "pending", está "%"', v_estado using errcode = 'assert_failure';
  end if;

  insert into h7_ctx values ('charge_h02', v_charge::text);
end $$;

reset role;

-- La otra rama de RN-FIN-04b: el mismo cobro, con el vencimiento ya
-- pasado, queda "Vencido". La fecha se mueve desde fuera del rol porque
-- `charges` no tiene política de UPDATE (el libro es inmutable, RN-DAT-04),
-- así que hacerlo dentro del bloque no cambiaba nada y la aserción pasaba
-- por el motivo equivocado.
do $$
begin
  update public.charges set due_at = now() - interval '80 hours'
  where id = (select value::uuid from h7_ctx where key = 'charge_h02');
end $$;

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_charge uuid := (select value::uuid from h7_ctx where key = 'charge_h02');
begin
  if public.charge_status(v_charge) <> 'overdue' then
    raise exception 'RN-FIN-04b FALLIDO: un cobro reembolsado y ya vencido debería quedar "overdue", está "%"', public.charge_status(v_charge) using errcode = 'assert_failure';
  end if;

  -- Y el equipo puede perdonar esa deuda revivida: la idempotencia de
  -- waive_charge() va por saldo, no por "ya existe un perdón".
  perform public.waive_charge(v_charge, 'Lo damos por cerrado');
  if public.charge_outstanding_cents(v_charge) <> 0 then
    raise exception 'H-02 FALLIDO: waive_charge() no pudo perdonar la deuda revivida (quedan %)',
      public.charge_outstanding_cents(v_charge) using errcode = 'assert_failure';
  end if;
  if public.charge_status(v_charge) not in ('refunded', 'waived') then
    raise exception 'RN-FIN-02 FALLIDO: sin deuda viva, el cobro debería mostrarse cerrado, está %',
      public.charge_status(v_charge) using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- H-08 (6ª revisión) · las dos invariantes que CLAUDE.md marca como MUST,
-- comprobadas en falso-cerrado.
--
-- H-05 (`request_versions` sin `space_id`) y H-07 (`space_sequences` con
-- RLS y cero políticas) llevaban meses en el árbol y seis revisiones no
-- los vieron, porque ningún test comprobaba la invariante: se comprobaban
-- las tablas que uno se acordaba de mirar. Esto las recorre todas.
-- ============================================================
do $$
declare
  v_t record;
  v_sin_rls text := '';
  v_sin_politica text := '';
  v_sin_space text := '';
begin
  for v_t in
    select c.relname as tabla, c.relrowsecurity as rls,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas,
           exists (
             select 1 from pg_attribute a
             where a.attrelid = c.oid and a.attname = 'space_id'
               and a.attnum > 0 and not a.attisdropped and a.attnotnull
           ) as tiene_space_id
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by 1
  loop
    if not v_t.rls then
      v_sin_rls := v_sin_rls || ' ' || v_t.tabla;
    end if;

    -- Política explícita. `space_sequences` es la excepción justificada:
    -- no se toca desde la aplicación, solo desde next_space_sequence()
    -- (SECURITY DEFINER), y la migración 34 le quitó los privilegios de
    -- tabla en vez de darle una política que nadie usaría.
    if v_t.politicas = 0 and v_t.tabla not in ('space_sequences') then
      v_sin_politica := v_sin_politica || ' ' || v_t.tabla;
    end if;

    -- `space_id NOT NULL`. Las excepciones son tablas que no pertenecen a
    -- un espacio (son de plataforma, de identidad, o el espacio mismo).
    if not v_t.tiene_space_id and v_t.tabla not in (
         'spaces', 'profiles', 'platform_roles', 'space_memberships',
         'group_memberships', 'establishment_memberships',
         'establishment_permissions', 'space_sequences', 'audit_log'
       ) then
      v_sin_space := v_sin_space || ' ' || v_t.tabla;
    end if;
  end loop;

  -- `space_sequences` está exenta de tener política porque se cierra por
  -- privilegio de tabla. La exención SOLO vale mientras eso sea cierto: si
  -- alguien le devuelve el grant, se queda sin política Y sin privilegio
  -- restringido, o sea abierta.
  if has_table_privilege('authenticated', 'public.space_sequences', 'select')
     or has_table_privilege('authenticated', 'public.space_sequences', 'insert')
     or has_table_privilege('authenticated', 'public.space_sequences', 'update')
     or has_table_privilege('anon', 'public.space_sequences', 'select') then
    raise exception 'CLAUDE.md MUST FALLIDO: `space_sequences` está exenta de tener política de RLS porque no tiene privilegios de tabla, y alguien se los ha devuelto'
      using errcode = 'assert_failure';
  end if;

  if v_sin_rls <> '' then
    raise exception 'CLAUDE.md MUST FALLIDO: tablas sin RLS activado:%', v_sin_rls using errcode = 'assert_failure';
  end if;
  if v_sin_politica <> '' then
    raise exception 'CLAUDE.md MUST FALLIDO: tablas con RLS y sin ninguna política explícita:%. O le falta la política, o hay que justificarla en la lista de excepciones de este test.', v_sin_politica using errcode = 'assert_failure';
  end if;
  if v_sin_space <> '' then
    raise exception 'CLAUDE.md MUST FALLIDO: tablas de espacio sin `space_id NOT NULL`:%. O le falta la columna, o hay que justificarla en la lista de excepciones de este test.', v_sin_space using errcode = 'assert_failure';
  end if;
end $$;

-- Limpieza.
-- ============================================================
drop function public.h7_make_job(uuid, uuid, uuid, text, text);
drop function public.h7_make_pending_request(uuid, uuid, uuid, text, text);
drop function public.h7_make_needs_information(uuid, uuid, uuid, text);

delete from public.audit_log where space_id = 'b1000000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'b1000000-0000-0000-0000-000000000001';
delete from auth.users where id in (
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000004',
  'b0000000-0000-0000-0000-000000000005',
  'b0000000-0000-0000-0000-000000000006',
  'b0000000-0000-0000-0000-000000000007',
  'b0000000-0000-0000-0000-000000000008',
  'b0000000-0000-0000-0000-000000000099'
);

-- ============================================================
-- B2 (auditoría) · ninguna columna de identidad individual del equipo
-- puede quedar legible con un SELECT normal. RLS filtra filas, no
-- columnas, así que esto lo sostiene el privilegio de columna — y sin una
-- comprobación como esta, añadir una columna `*_by` a cualquiera de estas
-- tablas la dejaría expuesta al restaurante sin que nada avisara.
--
-- Se omite si no existen los roles (PostgreSQL desnudo sin el stub).
-- ============================================================
do $$
declare
  v_col record;
  v_abiertas text := '';
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'Sin rol authenticated: se omite la comprobación de columnas de identidad';
    return;
  end if;

  for v_col in
    select * from (values
      ('messages','sender_id'),
      ('message_edits','edited_by'),
      ('files','created_by'),
      ('file_versions','created_by'),
      ('file_links','created_by'),
      ('charges','issued_by'),
      ('payments','recorded_by'),
      ('payments','recorded_role'),
      ('payments','reversed_by'),
      ('payment_confirmations','confirmed_by'),
      ('payment_confirmations','confirmed_role'),
      ('receipts','uploaded_by'),
      ('financial_entries','created_by'),
      ('files','archived_by'),
      ('files','deletion_requested_by'),
      ('requests','validated_by'),
      ('requests','rejected_by'),
      ('subscriptions','created_by'),
      ('corrections','requested_by'),
      ('corrections','completed_by')
    ) as t(tabla, columna)
  loop
    if has_column_privilege('authenticated', ('public.' || v_col.tabla)::regclass, v_col.columna, 'select')
       or has_column_privilege('anon', ('public.' || v_col.tabla)::regclass, v_col.columna, 'select') then
      v_abiertas := v_abiertas || ' ' || v_col.tabla || '.' || v_col.columna;
    end if;
  end loop;

  if v_abiertas <> '' then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: el cliente puede leer columnas de identidad del equipo:%', v_abiertas
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Ninguna función interna del Hito 7 puede quedar invocable por RPC
-- (misma comprobación que cierra hito6_trabajos.sql, por el fallo real del
-- 30/08/2026: `revoke ... from public` no basta en Supabase).
-- ============================================================
do $$
declare
  v_fn text;
  v_abiertas text := '';
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'Sin rol authenticated: se omite la comprobacion de funciones internas';
    return;
  end if;

  foreach v_fn in array array[
    'link_file(uuid, text, uuid, uuid)',
    'pause_establishment_counters(uuid)',
    'resume_establishment_counters(uuid)',
    'apply_financial_hold_on_jobs(uuid)',
    'release_financial_holds(uuid)',
    'set_establishment_nonpayment_status(uuid, text, text)',
    'reactivate_establishment_after_payment(uuid)',
    'mirror_request_attachment_to_catalogue()',
    'file_current_version(uuid)',
    'conversation_establishment_id(uuid)',
    'counter_is_running(text, text, uuid)',
    'counter_pause_cause(text, text, uuid)',
    -- 4ª revisión · B1: `job_assignee()` es SECURITY DEFINER, no comprueba
    -- nada, devuelve `jobs.assigned_to` y no tiene ni un llamador. Estaba
    -- abierta a `anon`: sin sesión ninguna se obtenía por RPC la identidad
    -- que `client_jobs` existe para esconder (CA-04).
    'job_assignee(uuid)',
    'is_eligible_job_candidate(uuid, uuid)',
    'assert_establishment_service_running(uuid)']
  loop
    if has_function_privilege('authenticated', 'public.' || v_fn, 'execute')
       or has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      v_abiertas := v_abiertas || ' ' || v_fn;
    end if;
  end loop;

  if v_abiertas <> '' then
    raise exception 'FUNCIONES INTERNAS ABIERTAS por RPC a anon/authenticated:%', v_abiertas;
  end if;
end $$;

-- CLAUDE.md MUST NOT: `messages.sender_id` no es legible por nadie con un
-- SELECT normal — la identidad del equipo se resuelve en
-- list_conversation_messages(), que decide según quién pregunta.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    return;
  end if;
  if has_column_privilege('authenticated', 'public.messages', 'sender_id', 'select') then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: messages.sender_id es legible por `authenticated`';
  end if;
end $$;

select 'hito7_mensajes_archivos_finanzas.sql: HU-24 a HU-28, HU-35 y RN-FIN-13 cumplidos, base de datos limpia' as resultado;
