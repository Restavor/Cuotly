-- HU-21, segunda mitad: **repartir** una tarea ya creada
-- (migración 20260903000047). Verifica `assign_task()` y
-- `list_task_candidates()` contra la base de datos real.
--
-- Qué comprueba, y por qué cada cosa:
--   · que el reparto funcione y quede auditado (CLAUDE.md MUST);
--   · RN-ASG-01 / §4.3: repartir una tarea **no concede acceso** a un
--     establecimiento que la persona no tiene autorizado — es el agujero
--     que la revisión del Hito 6 tuvo que cerrarle a `create_job_task()`
--     (migración 23, arreglo I6), y esta función es la puerta de al lado;
--   · RN-ASG-17: los puntos de carga de los compañeros **no** se le
--     devuelven a un trabajador, porque son una comparación entre
--     trabajadores;
--   · CA-01: quien no es el responsable ni tiene `assign_jobs` no puede
--     repartir por llamada directa;
--   · CA-17: repartir dos veces a la misma persona no duplica nada.
--
-- Mismo patrón que hito6_trabajos.sql: bloques `do $$ ... end $$` que
-- lanzan una excepción real si algo no es lo esperado, cambio de identidad
-- con `set role authenticated`, y limpieza propia al final.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hu21_reparto_tareas.sql

-- ============================================================
-- Fixture: un espacio con propietario, un administrador, dos trabajadoras
-- (Eva, autorizada al establecimiento A; Nuria, autorizada solo al B) y un
-- cliente. El reparto cruzado entre A y B es lo que pone a prueba
-- RN-ASG-01.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('c0000000-0000-0000-0000-000000000001', 'hu21-owner@example.com', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000002', 'hu21-admin@example.com', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000003', 'hu21-eva@example.com', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000004', 'hu21-nuria@example.com', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000005', 'hu21-client@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'Espacio HU21', 'espacio-hu21-test', 'c0000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'worker', 'active');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Impulso HU21', 39900, 20, 12, 3, 0, 24);

insert into public.groups (id, space_id, name) values
  ('c3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Grupo HU21');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('c4000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'EST-HU21-A', 'Restaurante HU21 A'),
  ('c4000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'EST-HU21-B', 'Restaurante HU21 B');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('c4000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005', 'local_owner');

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.create_plan_subscription('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001');

  create temporary table hu21_ctx (key text primary key, value text);
  grant select, insert, update on hu21_ctx to authenticated, service_role;
end $$;

reset role;

-- Eva trabaja en el A; Nuria, solo en el B. Las dos con la misma
-- especialidad, para que lo único que las distinga sea la autorización.
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001');

insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'web', 'c0000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'web', 'c0000000-0000-0000-0000-000000000001');

-- Mismo atajo que hito6_trabajos.sql: lleva una solicitud de borrador a
-- `accepted` recorriendo el flujo real, para no repetir treinta líneas.
create or replace function public.hu21_make_job(
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
-- Preparación: un trabajo del establecimiento A, con Eva de responsable, y
-- una tarea creada SIN repartir — que es el caso que antes de la migración
-- 47 se quedaba sin responsable para siempre.
-- ============================================================
do $$
declare
  v_job_id uuid;
  v_task_id uuid;
begin
  v_job_id := public.hu21_make_job(
    'c4000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000005',
    'c0000000-0000-0000-0000-000000000001',
    'HU-21: rehacer la pagina de contacto', 'medium'
  );

  -- RN-ASG-03: con exactamente una candidata válida (Eva es la única
  -- autorizada al A), la asignación automática le adjudica el trabajo. La
  -- dispara el propietario, igual que en hito6_trabajos.sql: `accept_request()`
  -- crea el trabajo pero no asigna.
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', false);
  perform public.auto_assign_job(v_job_id);

  -- Se comprueba porque el resto del archivo depende de que Eva sea la
  -- responsable.
  if (select assigned_to from public.jobs where id = v_job_id)
     is distinct from 'c0000000-0000-0000-0000-000000000003' then
    raise exception 'FIXTURE HU-21: se esperaba a Eva como responsable del trabajo'
      using errcode = 'assert_failure';
  end if;

  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000003', false);
  v_task_id := public.create_job_task(v_job_id, 'Redactar los textos', 30);

  if (select assignee_id from public.tasks where id = v_task_id) is not null then
    raise exception 'FIXTURE HU-21: la tarea tenia que nacer sin repartir'
      using errcode = 'assert_failure';
  end if;

  insert into hu21_ctx values ('job', v_job_id::text), ('task', v_task_id::text);
end $$;

-- ============================================================
-- HU-21 · el responsable reparte su propia tarea, y queda auditado.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from hu21_ctx where key = 'task');
begin
  perform public.assign_task(v_task_id, 'c0000000-0000-0000-0000-000000000003');

  if (select assignee_id from public.tasks where id = v_task_id)
     is distinct from 'c0000000-0000-0000-0000-000000000003' then
    raise exception 'HU-21 FALLIDO: la tarea no quedo repartida'
      using errcode = 'assert_failure';
  end if;

  -- CLAUDE.md MUST: actor, valor anterior y valor nuevo.
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'task' and entity_id = v_task_id and action = 'task.assigned'
      and actor_id = 'c0000000-0000-0000-0000-000000000003'
      and new_value ->> 'assignee_id' = 'c0000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'CLAUDE.md MUST FALLIDO: repartir una tarea no dejo registro de auditoria'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- CA-17 · repartir dos veces a la misma persona no duplica nada. Es el
-- mismo criterio que `assign_job()`: pulsar dos veces no tiene efecto.
-- ============================================================
do $$
declare
  v_task_id uuid := (select value::uuid from hu21_ctx where key = 'task');
  v_antes integer;
  v_despues integer;
begin
  select count(*) into v_antes from public.audit_log
  where entity_type = 'task' and entity_id = v_task_id and action = 'task.assigned';

  perform public.assign_task(v_task_id, 'c0000000-0000-0000-0000-000000000003');

  select count(*) into v_despues from public.audit_log
  where entity_type = 'task' and entity_id = v_task_id and action = 'task.assigned';

  if v_despues <> v_antes then
    raise exception 'CA-17 FALLIDO: repartir dos veces a la misma persona escribio % apuntes de mas', v_despues - v_antes
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ASG-01 / §4.3 · repartir una tarea NO puede conceder acceso: Nuria no
-- tiene autorizado el establecimiento A, así que no puede recibir una
-- tarea de un trabajo de A por mucho que Eva se la quiera repartir.
-- ============================================================
do $$
declare
  v_task_id uuid := (select value::uuid from hu21_ctx where key = 'task');
begin
  begin
    perform public.assign_task(v_task_id, 'c0000000-0000-0000-0000-000000000004');
    raise exception 'RN-ASG-01 FALLIDO: se repartio una tarea a alguien sin acceso a ese establecimiento'
      using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;

  -- Y no se quedó a medias: el responsable sigue siendo Eva.
  if (select assignee_id from public.tasks where id = v_task_id)
     is distinct from 'c0000000-0000-0000-0000-000000000003' then
    raise exception 'RN-ASG-01 FALLIDO: el intento rechazado cambio el responsable'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ASG-17 · a un trabajador NO se le devuelve la carga de sus
-- compañeros: "no existe ranking público entre trabajadores", y las
-- comparaciones las ven solo propietario y administradores.
-- ============================================================
do $$
declare
  v_job_id uuid := (select value::uuid from hu21_ctx where key = 'job');
  v_con_carga integer;
begin
  select count(*) into v_con_carga
  from public.list_task_candidates(v_job_id)
  where active_load_points is not null;

  if v_con_carga > 0 then
    raise exception 'RN-ASG-17 FALLIDO: a un trabajador se le devolvieron los puntos de carga de % companeros', v_con_carga
      using errcode = 'assert_failure';
  end if;

  -- Y aun así ve la lista: sin ella no podría repartir (HU-21).
  if not exists (select 1 from public.list_task_candidates(v_job_id)) then
    raise exception 'HU-21 FALLIDO: el responsable no puede ver a quien repartir'
      using errcode = 'assert_failure';
  end if;

  -- RN-ASG-01 otra vez, ahora en la lista: Nuria no debe ni aparecer, para
  -- que la pantalla no ofrezca a quien el servidor va a rechazar.
  if exists (
    select 1 from public.list_task_candidates(v_job_id)
    where worker_id = 'c0000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'RN-ASG-01 FALLIDO: la lista ofrecio a alguien sin acceso al establecimiento'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-ASG-17, el otro lado · el administrador SÍ ve la carga.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from hu21_ctx where key = 'job');
begin
  if exists (
    select 1 from public.list_task_candidates(v_job_id) where active_load_points is null
  ) then
    raise exception 'RN-ASG-17 FALLIDO: al administrador se le ocultaron los puntos de carga'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CA-01 · quien no es el responsable ni tiene `assign_jobs` no reparte,
-- ni por llamada directa. Nuria es del espacio, pero ni es responsable de
-- este trabajo ni administradora.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from hu21_ctx where key = 'task');
  v_job_id uuid := (select value::uuid from hu21_ctx where key = 'job');
begin
  begin
    perform public.assign_task(v_task_id, 'c0000000-0000-0000-0000-000000000004');
    raise exception 'CA-01 FALLIDO: alguien sin permiso repartio una tarea ajena'
      using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;

  -- Tampoco puede mirar a quién se le podría repartir.
  begin
    perform * from public.list_task_candidates(v_job_id);
    raise exception 'CA-01 FALLIDO: alguien sin permiso vio los candidatos de un trabajo ajeno'
      using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md MUST NOT · una tarea completada no cambia de manos: sería
-- reescribir historial.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from hu21_ctx where key = 'task');
begin
  perform public.update_task_state(v_task_id, 'in_progress');
  perform public.update_task_state(v_task_id, 'completed');

  begin
    perform public.assign_task(v_task_id, 'c0000000-0000-0000-0000-000000000001');
    raise exception 'CLAUDE.md FALLIDO: se repartio una tarea ya completada'
      using errcode = 'assert_failure';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

-- ============================================================
-- Las dos funciones nuevas son puertas de entrada (comprueban permisos por
-- su cuenta), así que conservan `authenticated`; lo que NO pueden es estar
-- abiertas a `anon`. CLAUDE.md: en Supabase, revocar solo a PUBLIC deja la
-- función abierta por RPC a cualquiera, con sesión o sin ella.
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice 'Sin rol anon: se omite la comprobacion de privilegios';
    return;
  end if;

  if has_function_privilege('anon', 'public.assign_task(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.list_task_candidates(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: las funciones de reparto de tareas estan abiertas a anon'
      using errcode = 'assert_failure';
  end if;

  -- Y el falso-cerrado por el otro lado: si alguien les revoca
  -- `authenticated` "por seguridad", HU-21 deja de funcionar en silencio.
  if not has_function_privilege('authenticated', 'public.assign_task(uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.list_task_candidates(uuid)', 'execute') then
    raise exception 'HU-21 FALLIDO: el equipo no puede ejecutar las funciones de reparto'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
drop function public.hu21_make_job(uuid, uuid, uuid, text, text);

delete from public.audit_log where space_id = 'c1000000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'c1000000-0000-0000-0000-000000000001';
delete from auth.users where id in (
  'c0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
  'c0000000-0000-0000-0000-000000000003',
  'c0000000-0000-0000-0000-000000000004',
  'c0000000-0000-0000-0000-000000000005'
);

select 'hu21_reparto_tareas.sql: HU-21, RN-ASG-01, RN-ASG-17, CA-01 y CA-17 cumplidos, base de datos limpia' as resultado;
