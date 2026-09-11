-- El aviso de una reasignación pedida (migración 71).
--
-- Decisión de Bosco (12/09/2026): "se avisa al propietario del
-- mantenimiento y a los administradores".
--
-- Lo que se comprueba, y por qué cada cosa:
--
--   · **Llega a quien decide.** Propietario y administradores del espacio,
--     en trabajos y en tareas. Hasta la migración 71 no llegaba a nadie:
--     `request_job_reassignment()` arrastraba el hueco desde el Hito 6 y
--     `request_task_reassignment()` desde la 65.
--   · **NO llega a quien la pide.** El responsable es quien escribe la
--     petición; devolvérsela por correo es el ruido que acaba con alguien
--     apagando los avisos que sí importan. Se comprueba contando: cero.
--   · **NO llega a otro trabajador** que no pinta nada en la decisión.
--   · **NO llega al cliente** (P7 y CA-04): una reasignación es
--     organización interna del equipo, y el restaurante no debe ni
--     enterarse de que el trabajo ha cambiado de manos.
--   · **CA-17** · pedirla dos veces no crea un segundo aviso. En el
--     trabajo la segunda llamada sale por el estado; en la tarea, por la
--     solicitud pendiente. Las dos salen ANTES de escribir el apunte del
--     que cuelga la clave de deduplicación.
--   · **El enlace apunta al elemento exacto** (RN-NOT-04): el trabajo, y
--     la tarea abierta en su panel.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_aviso_de_la_reasignacion.sql

-- ============================================================
-- Fixture: propietario, administrador, dos trabajadoras y un cliente.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('ea000000-0000-0000-0000-000000000001', 'aviso-owner@example.com', 'authenticated', 'authenticated'),
  ('ea000000-0000-0000-0000-000000000002', 'aviso-admin@example.com', 'authenticated', 'authenticated'),
  ('ea000000-0000-0000-0000-000000000003', 'aviso-eva@example.com', 'authenticated', 'authenticated'),
  ('ea000000-0000-0000-0000-000000000004', 'aviso-hugo@example.com', 'authenticated', 'authenticated'),
  ('ea000000-0000-0000-0000-000000000005', 'aviso-cliente@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('ea100000-0000-0000-0000-000000000001', 'Espacio Aviso', 'espacio-aviso-test',
   'ea000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000004', 'worker', 'active');

insert into public.plans
  (id, space_id, name, price_cents, included_small, included_photo, included_medium,
   included_large, start_sla_hours) values
  ('ea200000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001',
   'Impulso Aviso', 39900, 20, 12, 3, 0, 24);

insert into public.groups (id, space_id, name) values
  ('ea300000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', 'Grupo Aviso');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('ea400000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001',
   'ea300000-0000-0000-0000-000000000001', 'EST-AVISO-A', 'Restaurante Aviso');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('ea400000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000005', 'local_owner');

select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.create_plan_subscription(
    'ea400000-0000-0000-0000-000000000001', 'ea200000-0000-0000-0000-000000000001');

  create temporary table aviso_ctx (key text primary key, value text);
  grant select, insert, update on aviso_ctx to authenticated, service_role;
end $$;

reset role;

-- Dos candidatas al mismo establecimiento: con una sola, `assign_job()`
-- asignaría automáticamente y no habría nada que reasignar a nadie.
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000003',
   'ea400000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001'),
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000004',
   'ea400000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001');

insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000003', 'web', 'ea000000-0000-0000-0000-000000000001'),
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000004', 'web', 'ea000000-0000-0000-0000-000000000001');

-- El mismo atajo que el resto de suites: una solicitud recorre el flujo
-- real hasta ser un trabajo.
create or replace function public.aviso_make_job(
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

-- ============================================================
-- Preparación: un trabajo con Eva de responsable, y una tarea suya.
-- ============================================================
do $$
declare
  v_job_id uuid;
  v_task_id uuid;
begin
  v_job_id := public.aviso_make_job(
    'ea400000-0000-0000-0000-000000000001',
    'ea000000-0000-0000-0000-000000000005',
    'ea000000-0000-0000-0000-000000000001',
    'Actualizar la carta de otoño', 'medium'
  );

  perform set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000001', false);
  perform public.assign_job(v_job_id, 'ea000000-0000-0000-0000-000000000003', null);

  perform set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000003', false);
  v_task_id := public.create_job_task(
    v_job_id, 'Comprobar enlaces', 30,
    'ea000000-0000-0000-0000-000000000003', 'Revisar que la carta abre'
  );

  insert into aviso_ctx (key, value) values
    ('job', v_job_id::text), ('task', v_task_id::text);
end $$;

-- El aviso de la asignación ya está emitido y no debe confundirse con los
-- de esta suite: se cuenta solo lo que empieza por `*_reassignment_*`.

-- ============================================================
-- Eva pide la reasignación del TRABAJO.
-- ============================================================
do $$
declare
  v_job_id uuid := (select value::uuid from aviso_ctx where key = 'job');
  v_avisos integer;
  v_enlace text;
begin
  perform set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000003', false);
  perform public.request_job_reassignment(v_job_id, 'Me he quedado sin horas esta semana');

  -- Propietario y administrador: uno cada uno.
  select count(*) into v_avisos
  from public.notifications n
  where n.event_type = 'job_reassignment_requested'
    and n.recipient_id in ('ea000000-0000-0000-0000-000000000001',
                           'ea000000-0000-0000-0000-000000000002');

  if v_avisos <> 2 then
    raise exception 'FALLIDO: quien decide sobre la reasignación de un trabajo ha recibido % avisos, se esperaban 2', v_avisos
      using errcode = 'assert_failure';
  end if;

  -- Y nadie más: ni Eva, que la pide, ni Hugo, ni el cliente.
  select count(*) into v_avisos
  from public.notifications n
  where n.event_type = 'job_reassignment_requested'
    and n.recipient_id in ('ea000000-0000-0000-0000-000000000003',
                           'ea000000-0000-0000-0000-000000000004',
                           'ea000000-0000-0000-0000-000000000005');

  if v_avisos <> 0 then
    raise exception 'FALLIDO: el aviso de reasignación ha llegado a quien no decide (% avisos)', v_avisos
      using errcode = 'assert_failure';
  end if;

  -- Audiencia y elemento al que apunta (RN-NOT-04).
  select n.deep_link into v_enlace
  from public.notifications n
  where n.event_type = 'job_reassignment_requested'
    and n.recipient_id = 'ea000000-0000-0000-0000-000000000001';

  if v_enlace <> '/espacios/espacio-aviso-test/trabajos/' || v_job_id::text then
    raise exception 'FALLIDO: el enlace del aviso es "%"', v_enlace using errcode = 'assert_failure';
  end if;

  if exists (
    select 1 from public.notifications n
    where n.event_type = 'job_reassignment_requested'
      and (n.audience <> 'staff' or n.entity_type <> 'job' or n.entity_id <> v_job_id)
  ) then
    raise exception 'FALLIDO: el aviso de un trabajo no apunta al trabajo, o no es del equipo'
      using errcode = 'assert_failure';
  end if;

  -- CA-17 · pedirla otra vez no avisa dos veces.
  perform public.request_job_reassignment(v_job_id, 'Insisto');

  select count(*) into v_avisos
  from public.notifications n
  where n.event_type = 'job_reassignment_requested';

  if v_avisos <> 2 then
    raise exception 'CA-17 FALLIDO: pedir dos veces la reasignación ha dejado % avisos', v_avisos
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Eva pide la reasignación de la TAREA.
-- ============================================================
do $$
declare
  v_job_id uuid := (select value::uuid from aviso_ctx where key = 'job');
  v_task_id uuid := (select value::uuid from aviso_ctx where key = 'task');
  v_avisos integer;
  v_enlace text;
begin
  perform set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000003', false);
  perform public.request_task_reassignment(v_task_id, 'Esta tarea la hace mejor Hugo');

  select count(*) into v_avisos
  from public.notifications n
  where n.event_type = 'task_reassignment_requested'
    and n.recipient_id in ('ea000000-0000-0000-0000-000000000001',
                           'ea000000-0000-0000-0000-000000000002');

  if v_avisos <> 2 then
    raise exception 'FALLIDO: quien decide sobre la reasignación de una tarea ha recibido % avisos, se esperaban 2', v_avisos
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_avisos
  from public.notifications n
  where n.event_type = 'task_reassignment_requested'
    and n.recipient_id in ('ea000000-0000-0000-0000-000000000003',
                           'ea000000-0000-0000-0000-000000000004',
                           'ea000000-0000-0000-0000-000000000005');

  if v_avisos <> 0 then
    raise exception 'FALLIDO: el aviso de reasignación de tarea ha llegado a quien no decide (% avisos)', v_avisos
      using errcode = 'assert_failure';
  end if;

  select n.deep_link into v_enlace
  from public.notifications n
  where n.event_type = 'task_reassignment_requested'
    and n.recipient_id = 'ea000000-0000-0000-0000-000000000002';

  if v_enlace <> '/espacios/espacio-aviso-test/trabajos/' || v_job_id::text
                 || '/tareas?tarea=' || v_task_id::text then
    raise exception 'FALLIDO: el enlace del aviso de la tarea es "%"', v_enlace
      using errcode = 'assert_failure';
  end if;

  if exists (
    select 1 from public.notifications n
    where n.event_type = 'task_reassignment_requested'
      and (n.audience <> 'staff' or n.entity_type <> 'task' or n.entity_id <> v_task_id)
  ) then
    raise exception 'FALLIDO: el aviso de una tarea no apunta a la tarea, o no es del equipo'
      using errcode = 'assert_failure';
  end if;

  -- CA-17, por la otra puerta: la solicitud pendiente.
  perform public.request_task_reassignment(v_task_id, 'Insisto');

  select count(*) into v_avisos
  from public.notifications n
  where n.event_type = 'task_reassignment_requested';

  if v_avisos <> 2 then
    raise exception 'CA-17 FALLIDO: pedir dos veces la reasignación de la tarea ha dejado % avisos', v_avisos
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza del fixture.
-- ============================================================
drop function if exists public.aviso_make_job(uuid, uuid, uuid, text, text);

delete from public.notifications where space_id = 'ea100000-0000-0000-0000-000000000001';
delete from public.audit_log where space_id = 'ea100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'ea100000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'ea000000-%';

select 'el_aviso_de_la_reasignacion: OK' as resultado;
