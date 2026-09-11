-- Maqueta 07 · "Tareas — asignación y coordinación" (migración 65).
--
-- Lo que se comprueba, y por qué cada cosa:
--
--   · **RN-ASG-07** — la pide el responsable de la tarea explicando el
--     motivo. Los cuatro modos de romperlo (otra persona, sin motivo,
--     motivo en blanco, tarea terminada) se rechazan.
--   · **RN-ASG-08** — "la aprueba el propietario o el administrador". Un
--     trabajador no la aprueba **aunque sea el responsable del trabajo y
--     reparta las tareas todos los días**: ese es el caso que importa,
--     porque `assign_task()` sí le deja repartir y la puerta de al lado
--     tenía que cerrarse a mano.
--   · **RN-ASG-09** — aprobar no reinicia ningún contador. Se comprueba
--     contando `timer_events` antes y después: la ausencia es la regla,
--     igual que en `approve_job_reassignment()`.
--   · **RN-ASG-01** — aprobar una reasignación no puede conceder acceso a
--     un establecimiento ajeno. Es el mismo agujero que la revisión del
--     Hito 6 cerró en `create_job_task()` y la 47 en `assign_task()`;
--     ésta es la tercera puerta y por eso las tres comparten
--     `task_assignee_is_valid()`.
--   · **P7 / CLAUDE.md MUST NOT** — el restaurante no ve ni la solicitud
--     ni su motivo ni quién la pidió. `can_read_task()` sola le dejaría
--     pasar (bloqueante B2 de la 4ª revisión), y por eso la política
--     lleva además `is_space_member()`.
--   · **CA-17** — pedirla dos veces no crea dos solicitudes.
--   · **§37** — una tarea sigue teniendo cinco estados: pedir la
--     reasignación NO le añade un sexto ni le cambia el que tiene.
--   · **La fecha de planificación no es un plazo** — no escribe
--     `timer_events` y una tarea pasada de fecha no queda "fuera de
--     plazo".
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/coordinacion_de_tareas.sql

-- ============================================================
-- Fixture: un espacio con propietario, administrador, dos trabajadoras
-- (Eva, autorizada al establecimiento A; Nuria, solo al B) y un cliente.
-- El reparto cruzado entre A y B es lo que pone a prueba RN-ASG-01.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('d0000000-0000-0000-0000-000000000001', 'coord-owner@example.com', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000002', 'coord-admin@example.com', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000003', 'coord-eva@example.com', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000004', 'coord-nuria@example.com', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000005', 'coord-client@example.com', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000006', 'coord-hugo@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('d1000000-0000-0000-0000-000000000001', 'Espacio Coord', 'espacio-coord-test',
   'd0000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'worker', 'active'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'worker', 'active');

insert into public.plans
  (id, space_id, name, price_cents, included_small, included_photo, included_medium,
   included_large, start_sla_hours) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   'Impulso Coord', 39900, 20, 12, 3, 0, 24);

insert into public.groups (id, space_id, name) values
  ('d3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Grupo Coord');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('d4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   'd3000000-0000-0000-0000-000000000001', 'EST-COORD-A', 'Restaurante Coord A'),
  ('d4000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001',
   'd3000000-0000-0000-0000-000000000001', 'EST-COORD-B', 'Restaurante Coord B');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('d4000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005', 'local_owner');

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.create_plan_subscription(
    'd4000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001');

  create temporary table coord_ctx (key text primary key, value text);
  grant select, insert, update on coord_ctx to authenticated, service_role;
end $$;

reset role;

-- Eva y Hugo trabajan en el A; Nuria, solo en el B. Las tres con la misma
-- especialidad, para que lo único que las distinga sea la autorización.
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003',
   'd4000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006',
   'd4000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004',
   'd4000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001');

insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'web', 'd0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'web', 'd0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'web', 'd0000000-0000-0000-0000-000000000001');

-- Mismo atajo que hito6_trabajos.sql y hu21_reparto_tareas.sql: lleva una
-- solicitud de borrador a `accepted` recorriendo el flujo real.
create or replace function public.coord_make_job(
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
-- Preparación: un trabajo del A con Eva de responsable y una tarea suya.
-- ============================================================
do $$
declare
  v_job_id uuid;
  v_task_id uuid;
begin
  v_job_id := public.coord_make_job(
    'd4000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000005',
    'd0000000-0000-0000-0000-000000000001',
    'Maqueta 07: actualizar la carta de verano', 'medium'
  );

  -- El trabajo se lo lleva Eva. Hay dos candidatos en el A (Eva y Hugo),
  -- así que la asignación no puede ser automática: la hace el propietario.
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', false);
  perform public.assign_job(v_job_id, 'd0000000-0000-0000-0000-000000000003', null);

  if (select assigned_to from public.jobs where id = v_job_id)
     is distinct from 'd0000000-0000-0000-0000-000000000003' then
    raise exception 'FIXTURE: se esperaba a Eva como responsable del trabajo'
      using errcode = 'assert_failure';
  end if;

  -- Eva desglosa y se queda la tarea.
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', false);
  v_task_id := public.create_job_task(
    v_job_id, 'Comprobar enlaces y funcionamiento', 30,
    'd0000000-0000-0000-0000-000000000003', 'Verificar que los enlaces de la carta funcionan'
  );

  insert into coord_ctx values ('job', v_job_id::text), ('task', v_task_id::text);
end $$;

-- ============================================================
-- La fecha de planificación (maqueta 07 · "Fecha estimada").
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
  v_timers_antes bigint := (select count(*) from public.timer_events);
begin
  perform public.set_task_planned_date(v_task_id, date '2026-09-13');

  if (select planned_date from public.tasks where id = v_task_id) <> date '2026-09-13' then
    raise exception 'FALLIDO: la fecha de planificación no se guardó'
      using errcode = 'assert_failure';
  end if;

  -- CLAUDE.md MUST: queda auditado con valor anterior y nuevo.
  if not exists (
    select 1 from public.audit_log
    where action = 'task.planned_date_set' and entity_id = v_task_id
      and actor_id = 'd0000000-0000-0000-0000-000000000003'
      and old_value->>'planned_date' is null
      and new_value->>'planned_date' = '2026-09-13'
  ) then
    raise exception 'FALLIDO: planificar una tarea no quedó auditado'
      using errcode = 'assert_failure';
  end if;

  -- **No es un plazo.** Si lo fuera, habría un contador detrás.
  if (select count(*) from public.timer_events) <> v_timers_antes then
    raise exception 'FALLIDO: la fecha de planificación ha escrito un timer_event: es un plazo, y no debe serlo'
      using errcode = 'assert_failure';
  end if;

  -- CA-17: repetir la misma fecha no es un cambio y no deja apunte.
  perform public.set_task_planned_date(v_task_id, date '2026-09-13');

  if (select count(*) from public.audit_log
      where action = 'task.planned_date_set' and entity_id = v_task_id) <> 1 then
    raise exception 'CA-17 FALLIDO: poner la misma fecha otra vez ha duplicado el apunte'
      using errcode = 'assert_failure';
  end if;

  -- Y se puede quitar: "ya no sé cuándo" es una respuesta legítima.
  perform public.set_task_planned_date(v_task_id, null);

  if (select planned_date from public.tasks where id = v_task_id) is not null then
    raise exception 'FALLIDO: no se pudo quitar la fecha de planificación'
      using errcode = 'assert_failure';
  end if;

  perform public.set_task_planned_date(v_task_id, date '2026-09-13');
end $$;

reset role;

-- Nuria no tiene nada que ver con este trabajo: ni es la responsable ni
-- tiene `assign_jobs`. No planifica.
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
begin
  begin
    perform public.set_task_planned_date(v_task_id, date '2026-12-31');
    raise exception 'CA-01 FALLIDO: una trabajadora ajena al trabajo ha podido planificar su tarea'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like '%FALLIDO%' then raise; end if;
  end;
end $$;

reset role;

-- ============================================================
-- RN-ASG-07 · la pide el responsable de la tarea, explicando el motivo.
-- ============================================================

-- Primero, los cuatro modos de romperlo.
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000006', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
begin
  -- Hugo no es el responsable de la tarea: no la pide por él.
  begin
    perform public.request_task_reassignment(v_task_id, 'Me la quedo yo');
    raise exception 'RN-ASG-07 FALLIDO: alguien que no es el responsable ha pedido la reasignación'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like '%FALLIDO%' then raise; end if;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
begin
  -- Sin motivo, y con un motivo de solo espacios: RN-ASG-07 dice
  -- "explicando el motivo", y un motivo en blanco no explica nada.
  begin
    perform public.request_task_reassignment(v_task_id, null);
    raise exception 'RN-ASG-07 FALLIDO: se ha admitido una reasignación sin motivo'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like '%FALLIDO%' then raise; end if;
  end;

  begin
    perform public.request_task_reassignment(v_task_id, '    ');
    raise exception 'RN-ASG-07 FALLIDO: se ha admitido una reasignación con el motivo en blanco'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like '%FALLIDO%' then raise; end if;
  end;

  if exists (select 1 from public.task_reassignment_requests where task_id = v_task_id) then
    raise exception 'FALLIDO: un intento rechazado ha dejado una solicitud escrita'
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y ahora, bien.
do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
  v_estado_antes text := (select state from public.tasks where id = v_task_id);
begin
  perform public.request_task_reassignment(
    v_task_id, 'Estoy con la publicación del menú y no llego al jueves');

  if not exists (
    select 1 from public.task_reassignment_requests
    where task_id = v_task_id and state = 'pending'
      and requested_by = 'd0000000-0000-0000-0000-000000000003'
      and reason = 'Estoy con la publicación del menú y no llego al jueves'
  ) then
    raise exception 'RN-ASG-07 FALLIDO: la solicitud no se guardó con su motivo'
      using errcode = 'assert_failure';
  end if;

  -- §37 · los estados de tarea son CINCO. Pedir la reasignación no le
  -- añade un sexto ni le cambia el que tiene: mientras alguien decide, la
  -- tarea sigue donde estaba, que es la verdad.
  if (select state from public.tasks where id = v_task_id) is distinct from v_estado_antes then
    raise exception '§37 FALLIDO: pedir la reasignación ha cambiado el estado de la tarea'
      using errcode = 'assert_failure';
  end if;

  if exists (
    select 1 from public.state_events
    where entity_type = 'task' and entity_id = v_task_id and to_state = 'reassignment_requested'
  ) then
    raise exception '§37 FALLIDO: se ha escrito un estado de tarea que no existe'
      using errcode = 'assert_failure';
  end if;

  -- CA-17 · pedirla dos veces no crea dos solicitudes.
  perform public.request_task_reassignment(v_task_id, 'Otra vez, por si acaso');

  if (select count(*) from public.task_reassignment_requests
      where task_id = v_task_id and state = 'pending') <> 1 then
    raise exception 'CA-17 FALLIDO: pedir la reasignación dos veces ha creado dos solicitudes'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-ASG-08 · con una solicitud abierta, la tarea NO cambia de manos por
-- la puerta de al lado.
--
-- Éste es el caso que importa de toda la suite. Eva es la responsable del
-- trabajo, y `assign_task()` le deja repartir sus tareas todos los días.
-- Si además pudiera repartir ÉSTA, la solicitud se quedaría abierta para
-- siempre y RN-ASG-08 —"la aprueba el propietario o el administrador"— no
-- significaría nada: bastaría con no llamar a la función que aprueba.
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
begin
  begin
    perform public.assign_task(v_task_id, 'd0000000-0000-0000-0000-000000000006');
    raise exception 'RN-ASG-08 FALLIDO: la responsable del trabajo ha repartido una tarea con reasignación pendiente'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like '%FALLIDO%' then raise; end if;
  end;

  if (select assignee_id from public.tasks where id = v_task_id)
     is distinct from 'd0000000-0000-0000-0000-000000000003' then
    raise exception 'RN-ASG-08 FALLIDO: el intento rechazado ha cambiado el responsable igualmente'
      using errcode = 'assert_failure';
  end if;

  -- Y tampoco la aprueba ella, que es la otra mitad de RN-ASG-08.
  begin
    perform public.approve_task_reassignment(v_task_id, 'd0000000-0000-0000-0000-000000000006', null);
    raise exception 'RN-ASG-08 FALLIDO: una trabajadora ha aprobado su propia reasignación'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like '%FALLIDO%' then raise; end if;
  end;
end $$;

reset role;

-- ============================================================
-- P7 · el restaurante no ve la solicitud, ni su motivo, ni quién la pidió.
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
begin
  -- La tarea es de SU trabajo, en SU restaurante: `can_read_task()` dice
  -- que sí a través de `can_read_job()`. Lo que le deja fuera es
  -- `is_space_member()`, y por eso está en la política.
  if exists (select 1 from public.task_reassignment_requests where task_id = v_task_id) then
    raise exception 'P7 FALLIDO: el restaurante ve las solicitudes de reasignación de su trabajo'
      using errcode = 'assert_failure';
  end if;

  -- Y sigue sin ver la tarea, que es de donde cuelga todo lo anterior.
  if exists (select 1 from public.tasks where id = v_task_id) then
    raise exception 'P7 FALLIDO: el restaurante ve las tareas internas del equipo'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-ASG-01 · aprobar no concede acceso a un establecimiento ajeno.
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
begin
  -- Nuria solo está autorizada al B. La tarea es del A.
  begin
    perform public.approve_task_reassignment(v_task_id, 'd0000000-0000-0000-0000-000000000004', null);
    raise exception 'RN-ASG-01 FALLIDO: aprobar una reasignación ha concedido acceso a un establecimiento ajeno'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like '%FALLIDO%' then raise; end if;
  end;

  -- Aprobar dejando al mismo responsable no es aprobar nada: para eso
  -- está rechazarla, con su motivo.
  begin
    perform public.approve_task_reassignment(v_task_id, 'd0000000-0000-0000-0000-000000000003', null);
    raise exception 'FALLIDO: se ha "aprobado" una reasignación que no cambia de responsable'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like '%FALLIDO%' then raise; end if;
  end;

  if (select state from public.task_reassignment_requests where task_id = v_task_id) <> 'pending' then
    raise exception 'FALLIDO: un intento rechazado ha resuelto la solicitud igualmente'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ASG-08/09 · el administrador aprueba, y no se reinicia ningún
-- contador.
-- ============================================================
do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
  v_timers_antes bigint := (select count(*) from public.timer_events);
begin
  perform public.approve_task_reassignment(
    v_task_id, 'd0000000-0000-0000-0000-000000000006', 'Hugo tiene hueco esta semana');

  if (select assignee_id from public.tasks where id = v_task_id)
     is distinct from 'd0000000-0000-0000-0000-000000000006' then
    raise exception 'RN-ASG-08 FALLIDO: la tarea no ha cambiado de responsable'
      using errcode = 'assert_failure';
  end if;

  -- RN-ASG-09 · "el contador no se reinicia". Ni un solo timer_event: la
  -- ausencia es la regla, igual que en approve_job_reassignment().
  if (select count(*) from public.timer_events) <> v_timers_antes then
    raise exception 'RN-ASG-09 FALLIDO: aprobar la reasignación ha tocado los contadores'
      using errcode = 'assert_failure';
  end if;

  -- RN-ASG-09 · "se conserva todo el historial". La solicitud no se borra:
  -- se resuelve, con quién, cuándo y a favor de quién.
  if not exists (
    select 1 from public.task_reassignment_requests
    where task_id = v_task_id and state = 'approved'
      and decided_by = 'd0000000-0000-0000-0000-000000000002'
      and decided_at is not null
      and new_assignee_id = 'd0000000-0000-0000-0000-000000000006'
      and reason = 'Estoy con la publicación del menú y no llego al jueves'
  ) then
    raise exception 'RN-ASG-09 FALLIDO: la solicitud resuelta no conserva su historia'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'task.reassigned' and entity_id = v_task_id
      and old_value->>'assignee_id' = 'd0000000-0000-0000-0000-000000000003'
      and new_value->>'assignee_id' = 'd0000000-0000-0000-0000-000000000006'
      and new_value->>'timers_restarted' = 'false'
  ) then
    raise exception 'FALLIDO: la reasignación aprobada no quedó auditada'
      using errcode = 'assert_failure';
  end if;

  -- Resuelta la solicitud, la tarea vuelve a repartirse con normalidad.
  perform public.assign_task(v_task_id, 'd0000000-0000-0000-0000-000000000003');

  if (select assignee_id from public.tasks where id = v_task_id)
     is distinct from 'd0000000-0000-0000-0000-000000000003' then
    raise exception 'FALLIDO: sin solicitud abierta, assign_task() tendría que repartir'
      using errcode = 'assert_failure';
  end if;

  -- Y no hay dos solicitudes pendientes donde había una resuelta.
  if exists (
    select 1 from public.task_reassignment_requests where task_id = v_task_id and state = 'pending'
  ) then
    raise exception 'FALLIDO: ha quedado una solicitud pendiente después de aprobarla'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- Rechazarla: la fila se queda, con su motivo.
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
begin
  perform public.request_task_reassignment(v_task_id, 'Sigo sin llegar');
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
begin
  perform public.reject_task_reassignment(v_task_id, 'Esta semana no hay a quién pasarla');

  -- CLAUDE.md MUST NOT: no se borra. Se conserva que alguien lo pidió y
  -- que se le dijo que no, con el motivo de las dos partes.
  if not exists (
    select 1 from public.task_reassignment_requests
    where task_id = v_task_id and state = 'rejected'
      and reason = 'Sigo sin llegar'
      and decision_reason = 'Esta semana no hay a quién pasarla'
      and decided_by = 'd0000000-0000-0000-0000-000000000001'
      and new_assignee_id is null
  ) then
    raise exception 'FALLIDO: la solicitud rechazada no conserva su historia'
      using errcode = 'assert_failure';
  end if;

  -- La tarea se queda con quien estaba.
  if (select assignee_id from public.tasks where id = v_task_id)
     is distinct from 'd0000000-0000-0000-0000-000000000003' then
    raise exception 'FALLIDO: rechazar una reasignación ha cambiado el responsable'
      using errcode = 'assert_failure';
  end if;

  -- Rechazada la anterior, se puede volver a pedir: el índice parcial solo
  -- prohíbe DOS ABIERTAS a la vez, no dos en la historia de la tarea.
  if (select count(*) from public.task_reassignment_requests where task_id = v_task_id) <> 2 then
    raise exception 'FALLIDO: la historia de la tarea tendría que tener dos solicitudes'
      using errcode = 'assert_failure';
  end if;

  -- Y resolver lo que ya está resuelto no cuela.
  begin
    perform public.reject_task_reassignment(v_task_id, 'Otra vez');
    raise exception 'FALLIDO: se ha rechazado una solicitud que ya estaba resuelta'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like '%FALLIDO%' then raise; end if;
  end;
end $$;

reset role;

-- ============================================================
-- Una tarea terminada no se reasigna.
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task');
  v_job_id uuid := (select value::uuid from coord_ctx where key = 'job');
begin
  perform public.start_job(v_job_id);
  perform public.update_task_state(v_task_id, 'in_progress');
  perform public.update_task_state(v_task_id, 'completed');

  begin
    perform public.request_task_reassignment(v_task_id, 'Ya no puedo');
    raise exception 'FALLIDO: se ha pedido la reasignación de una tarea completada'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like '%FALLIDO%' then raise; end if;
  end;

  -- Y tampoco se replanifica lo que ya está hecho.
  begin
    perform public.set_task_planned_date(v_task_id, date '2026-10-01');
    raise exception 'FALLIDO: se ha planificado una tarea completada'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like '%FALLIDO%' then raise; end if;
  end;
end $$;

reset role;

-- ============================================================
-- El agujero que apareció al comprobar los privilegios de la migración 65:
-- `anon` movía el estado de una tarea SIN RESPONSABLE.
--
-- No es una hipótesis: se reprodujo. La guarda de `update_task_state()`
-- era `v_assignee_id is distinct from auth.uid()`, y sobre una tarea sin
-- repartir y sin sesión eso es `null is distinct from null` = FALSO, así
-- que `has_capability()` ni se evaluaba. Y una tarea sin repartir es el
-- caso normal: nace así cuando el responsable desglosa primero y reparte
-- después.
--
-- La tarea de la prueba se crea SIN responsable a propósito. Con
-- responsable la comprobación sería vacua: la guarda vieja también
-- rechazaba a `anon` en ese caso.
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from coord_ctx where key = 'job');
  v_task_id uuid;
begin
  v_task_id := public.create_job_task(v_job_id, 'Tarea sin repartir', 30);

  if (select assignee_id from public.tasks where id = v_task_id) is not null then
    raise exception 'FIXTURE: la tarea tenía que nacer sin responsable'
      using errcode = 'assert_failure';
  end if;

  insert into coord_ctx values ('task_sin_repartir', v_task_id::text);
end $$;

reset role;

do $$
declare
  v_task_id uuid := (select value::uuid from coord_ctx where key = 'task_sin_repartir');
  v_estado text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice 'Sin rol anon: se omite la comprobación';
    return;
  end if;

  -- Sin sesión ninguna.
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;

  begin
    perform public.update_task_state(v_task_id, 'in_progress');
  exception
    when others then null; -- Lo que tiene que pasar.
  end;

  reset role;

  select state into v_estado from public.tasks where id = v_task_id;

  if v_estado <> 'pending' then
    raise exception 'FALLIDO: anon ha movido una tarea sin responsable a %', v_estado
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- CLAUDE.md · privilegios. `anon` no escribe nada sin sesión, y el
-- ayudante interno no está abierto por RPC.
-- ============================================================
do $$
declare
  v_abiertas text := '';
  v_fn text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice 'Sin rol anon: se omite la comprobación de privilegios';
    return;
  end if;

  -- Las cuatro puertas comprueban permisos, así que `authenticated` las
  -- conserva; `anon` no pinta nada en ninguna. El motivo concreto está en
  -- la migración 65: `set_task_planned_date()` comparaba
  -- `assigned_to is distinct from auth.uid()`, que sobre un trabajo SIN
  -- responsable y sin sesión es `null is distinct from null` = falso.
  foreach v_fn in array array[
    'public.request_task_reassignment(uuid, text)',
    'public.approve_task_reassignment(uuid, uuid, text)',
    'public.reject_task_reassignment(uuid, text)',
    'public.set_task_planned_date(uuid, date)',
    'public.assign_task(uuid, uuid)',
    'public.update_task_state(uuid, text)',
    'public.cancel_task(uuid, text)',
    'public.create_job_task(uuid, text, integer, uuid, text)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      v_abiertas := v_abiertas || ' ' || v_fn;
    end if;
  end loop;

  if v_abiertas <> '' then
    raise exception 'CLAUDE.md FALLIDO: anon puede ejecutar:%', v_abiertas
      using errcode = 'assert_failure';
  end if;

  if has_function_privilege('anon', 'public.task_assignee_is_valid(uuid, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.task_assignee_is_valid(uuid, uuid, uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: task_assignee_is_valid() es interna y está abierta por RPC'
      using errcode = 'assert_failure';
  end if;
end $$;

-- La tabla nueva, con RLS y con política: las dos cosas. Una tabla con RLS
-- y cero políticas es la que se encontró en `space_sequences`.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.task_reassignment_requests'::regclass) then
    raise exception 'CLAUDE.md FALLIDO: task_reassignment_requests sin RLS'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from pg_policy where polrelid = 'public.task_reassignment_requests'::regclass
  ) then
    raise exception 'CLAUDE.md FALLIDO: task_reassignment_requests con RLS y cero políticas'
      using errcode = 'assert_failure';
  end if;

  -- Sin política de escritura: toda mutación pasa por las funciones.
  if exists (
    select 1 from pg_policy
    where polrelid = 'public.task_reassignment_requests'::regclass and polcmd <> 'r'
  ) then
    raise exception 'FALLIDO: task_reassignment_requests tiene una política de escritura'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
drop function if exists public.coord_make_job(uuid, uuid, uuid, text, text);
delete from public.audit_log where space_id = 'd1000000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'd1000000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'd0000000-%';

select 'coordinacion_de_tareas.sql: todas las comprobaciones han pasado' as resultado;
