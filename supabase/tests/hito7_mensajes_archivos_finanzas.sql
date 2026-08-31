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
  begin
    perform public.waive_charge(v_charge_b, 'Regalo');
    raise exception 'RN-FIN-05 FALLIDO: una trabajadora pudo perdonar deuda' using errcode = 'assert_failure';
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
  v_payment_id := public.register_payment(v_charge_b, 10000, 'cash', now(), null, 'Entrega a cuenta');
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
-- Limpieza.
-- ============================================================
drop function public.h7_make_job(uuid, uuid, uuid, text, text);

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
    'mirror_request_attachment_to_catalogue()'
  ]
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
