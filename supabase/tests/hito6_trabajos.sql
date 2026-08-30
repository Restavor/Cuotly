-- Verificación del Hito 6 (Trabajos, tareas, asignación y carga) contra la
-- base de datos real: HU-16, HU-17, HU-18, HU-19, HU-20, HU-21, HU-22,
-- HU-23 y CA-12, CA-13, CA-14 en el lado servidor, más los controles
-- negativos de CA-01/CA-02 que cada operación nueva trae consigo.
--
-- Lo que NO está aquí, y por qué: la aritmética del reloj laborable
-- (cuántos minutos consumió T2/T3, si un trabajo está fuera de plazo, si
-- la ventana de 72 h laborables sigue abierta) vive en src/core y se prueba
-- con Vitest — apps/web/src/core/job-timers.test.ts (CA-12/CA-13/CA-14),
-- free-correction.test.ts (RN-COR), assignment.test.ts (RN-ASG-06),
-- load-points.test.ts (§14.4) y worker-queue.test.ts (HU-17). Este archivo
-- comprueba lo otro: que el servidor escriba exactamente los eventos de los
-- que ese cálculo se alimenta, que no escriba los que no debe (una
-- reasignación no reinicia T2) y que nadie sin permiso pueda ejecutar la
-- operación por llamada directa.
--
-- Mismo patrón que hito2_permisos.sql, hito4_solicitudes.sql y
-- hito5_consumos.sql: bloques `do $$ ... end $$` que lanzan una excepción
-- real si algo no es lo esperado, `set role authenticated`/`reset role`
-- para cambiar de identidad con RLS activo, y limpieza propia al final.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hito6_trabajos.sql

-- ============================================================
-- Fixture: un espacio con propietario, administrador y dos trabajadores
-- (Ana y Luis), un grupo con dos establecimientos y un plan con bolsa
-- suficiente para todos los escenarios.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('a0000000-0000-0000-0000-000000000001', 'h6-owner@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000002', 'h6-admin@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000003', 'h6-ana@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000004', 'h6-luis@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000005', 'h6-client@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000099', 'h6-ajeno@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('a1000000-0000-0000-0000-000000000001', 'Espacio H6', 'espacio-h6-test', 'a0000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'worker', 'active');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Impulso H6', 39900, 20, 12, 3, 0, 24);

insert into public.groups (id, space_id, name) values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Grupo H6');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'EST-H6-A', 'Restaurante H6 A'),
  ('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'EST-H6-B', 'Restaurante H6 B');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'local_owner'),
  ('a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'local_owner');

-- Suscripción de plan para los dos establecimientos (la crea el propietario).
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.create_plan_subscription('a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001');
  perform public.create_plan_subscription('a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001');

  create temporary table h6_ctx (key text primary key, value text);
  grant select, insert, update on h6_ctx to authenticated, service_role;
end $$;

reset role;

-- RN-ASG-01 / §4.6: Ana está asignada al establecimiento A con la
-- especialidad `web`; Luis, de momento, a ninguno.
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');

insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'web', 'a0000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'web', 'a0000000-0000-0000-0000-000000000001');

-- Atajo del fixture: lleva una solicitud de borrador a `accepted` (y por
-- tanto crea su trabajo, RN-REQ-02) recorriendo el flujo real del Hito 4 y
-- del Hito 5, cambiando de identidad en cada paso igual que lo haría la
-- aplicación. Existe solo para no repetir treinta líneas por escenario; se
-- borra al final del archivo.
create or replace function public.h6_make_job(
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
-- HU-16 · RN-ASG-03: con exactamente un candidato válido, Cuotly asigna
-- automáticamente. Solo Ana está asignada al establecimiento A.
-- ============================================================
do $$
declare
  v_job_id uuid;
begin
  v_job_id := public.h6_make_job(
    'a4000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'HU-16: cambiar el telefono de contacto', 'small'
  );
  insert into h6_ctx values ('job_auto', v_job_id::text);
end $$;

-- Control negativo (CA-01): un trabajador no puede asignar ni disparar la
-- asignación automática, aunque conozca el UUID del trabajo.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
begin
  begin
    perform public.auto_assign_job(v_job_id);
    raise exception 'CA-01 FALLIDO: un Trabajador pudo disparar la asignación automática (RN-ASG-04)';
  exception
    when raise_exception then null;
  end;

  begin
    perform public.assign_job(v_job_id, 'a0000000-0000-0000-0000-000000000003');
    raise exception 'CA-01 FALLIDO: un Trabajador pudo asignarse un trabajo a sí mismo (RN-ASG-04)';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
  v_assigned uuid;
  v_state text;
  v_kind text;
  v_t2_starts int;
begin
  v_assigned := public.auto_assign_job(v_job_id);

  if v_assigned is distinct from 'a0000000-0000-0000-0000-000000000003' then
    raise exception 'HU-16/RN-ASG-03 FALLIDO: con un único candidato válido no se asignó automáticamente (devolvió %)', v_assigned;
  end if;

  select state into v_state from public.jobs where id = v_job_id;
  if v_state <> 'assigned' then
    raise exception 'HU-16 FALLIDO: el trabajo no quedó en estado assigned sino en %', v_state;
  end if;

  select kind into v_kind from public.assignments where job_id = v_job_id and released_at is null;
  if v_kind <> 'auto' then
    raise exception 'RN-ASG-03 FALLIDO: la asignación no quedó registrada como automática (kind = %)', v_kind;
  end if;

  -- RN-SLA-05: T2 arranca cuando el trabajo queda asignado.
  select count(*) into v_t2_starts from public.timer_events
  where entity_type = 'job' and entity_id = v_job_id and counter_kind = 't2' and event_type = 'started';
  if v_t2_starts <> 1 then
    raise exception 'RN-SLA-05 FALLIDO: se esperaba un único arranque de T2 y hay %', v_t2_starts;
  end if;

  -- CA-17: repetirlo no duplica nada.
  perform public.auto_assign_job(v_job_id);
  select count(*) into v_t2_starts from public.timer_events
  where entity_type = 'job' and entity_id = v_job_id and counter_kind = 't2' and event_type = 'started';
  if v_t2_starts <> 1 then
    raise exception 'CA-17 FALLIDO: repetir la asignación automática duplicó el arranque de T2';
  end if;
end $$;

reset role;

-- ============================================================
-- HU-16 · RN-ASG-04: con varios candidatos válidos NO se asigna solo — se
-- recomienda. Se autoriza a Luis en el establecimiento A y se crea un
-- segundo trabajo.
-- ============================================================
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');

do $$
declare
  v_job_id uuid;
begin
  v_job_id := public.h6_make_job(
    'a4000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'RN-ASG-04: actualizar el horario de los domingos', 'small'
  );
  insert into h6_ctx values ('job_varios', v_job_id::text);
end $$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_varios');
  v_assigned uuid;
  v_state text;
  v_candidates int;
  v_first uuid;
begin
  v_assigned := public.auto_assign_job(v_job_id);
  if v_assigned is not null then
    raise exception 'RN-ASG-04 FALLIDO: con varios candidatos válidos se asignó automáticamente';
  end if;

  select state into v_state from public.jobs where id = v_job_id;
  if v_state <> 'pending_assignment' then
    raise exception 'RN-ASG-04 FALLIDO: el trabajo debería seguir pendiente de asignación, está en %', v_state;
  end if;

  select count(*) into v_candidates from public.list_job_candidates(v_job_id);
  if v_candidates <> 2 then
    raise exception 'RN-ASG-02 FALLIDO: se esperaban 2 candidatos válidos y hay %', v_candidates;
  end if;

  -- RN-ASG-06, primer criterio de desempate: menor carga actual en puntos.
  -- Ana ya tiene un trabajo "small" asignado (1 punto), Luis ninguno.
  select worker_id into v_first from public.list_job_candidates(v_job_id) limit 1;
  if v_first <> 'a0000000-0000-0000-0000-000000000004' then
    raise exception 'RN-ASG-06 FALLIDO: el primer candidato debería ser el de menor carga';
  end if;

  -- RN-ASG-04: una persona autorizada elige; RN-ASG-15: nada bloquea por carga.
  perform public.assign_job(v_job_id, 'a0000000-0000-0000-0000-000000000004', 'RN-ASG-04: elegido por el administrador');

  select state into v_state from public.jobs where id = v_job_id;
  if v_state <> 'assigned' then
    raise exception 'RN-ASG-04 FALLIDO: la asignación manual no dejó el trabajo asignado';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-ASG-05: sin ningún candidato válido, el trabajo queda pendiente de
-- asignación (nadie está autorizado en el establecimiento B).
-- ============================================================
do $$
declare
  v_job_id uuid;
begin
  v_job_id := public.h6_make_job(
    'a4000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'RN-ASG-05: cambiar una foto de la carta', 'photo'
  );
  insert into h6_ctx values ('job_sin_candidatos', v_job_id::text);
end $$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_sin_candidatos');
  v_state text;
begin
  if public.auto_assign_job(v_job_id) is not null then
    raise exception 'RN-ASG-05 FALLIDO: se asignó un trabajo sin candidatos válidos';
  end if;

  select state into v_state from public.jobs where id = v_job_id;
  if v_state <> 'pending_assignment' then
    raise exception 'RN-ASG-05 FALLIDO: el trabajo sin candidatos no quedó pendiente de asignación';
  end if;

  -- Y tampoco se puede forzar a mano a alguien que no es candidato válido:
  -- asignar a Ana el establecimiento B le daría acceso por la puerta de atrás.
  begin
    perform public.assign_job(v_job_id, 'a0000000-0000-0000-0000-000000000003');
    raise exception 'RN-ASG-01 FALLIDO: se asignó un trabajo a alguien sin acceso a ese establecimiento';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

-- ============================================================
-- §4.3 · CA-01: "el Trabajador tiene acceso operativo limitado a los
-- establecimientos, trabajos y tareas autorizados". Luis está autorizado
-- en el establecimiento A, no en el B: no debe ver ni una fila del trabajo
-- del B, aunque pertenezca al mismo espacio.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_visible int;
begin
  select count(*) into v_visible from public.jobs
  where id = (select value::uuid from h6_ctx where key = 'job_sin_candidatos');
  if v_visible <> 0 then
    raise exception '§4.3 FALLIDO: un Trabajador ve trabajos de un establecimiento que no tiene autorizado';
  end if;

  select count(*) into v_visible from public.jobs
  where id = (select value::uuid from h6_ctx where key = 'job_auto');
  if v_visible <> 1 then
    raise exception '§4.3 FALLIDO: un Trabajador no ve los trabajos de sus establecimientos autorizados';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-ASG-01 / §4.6: la especialidad que exige el trabajo excluye a quien
-- no la tiene, y `general` habilita cualquiera.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_sin_candidatos');
  v_candidates int;
begin
  -- Se autoriza a Ana en el establecimiento B, pero se le exige al trabajo
  -- una especialidad que ella no tiene (`seo`).
  insert into public.worker_establishments (space_id, user_id, establishment_id, created_by)
  values ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a4000000-0000-0000-0000-000000000002', auth.uid());

  perform public.set_job_required_specialty(v_job_id, 'seo');

  select count(*) into v_candidates from public.list_job_candidates(v_job_id);
  if v_candidates <> 0 then
    raise exception 'RN-ASG-01 FALLIDO: la especialidad exigida no excluyó a quien no la tiene (hay % candidatos)', v_candidates;
  end if;

  -- §4.6: `general` habilita cualquier categoría.
  insert into public.worker_specialties (space_id, user_id, specialty, created_by)
  values ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'general', auth.uid());

  select count(*) into v_candidates from public.list_job_candidates(v_job_id);
  if v_candidates <> 1 then
    raise exception '§4.6 FALLIDO: `general` no habilitó la especialidad exigida (hay % candidatos)', v_candidates;
  end if;

  -- Se deja el escenario como estaba para el resto del archivo.
  update public.worker_specialties set revoked_at = now(), revoked_by = auth.uid()
  where user_id = 'a0000000-0000-0000-0000-000000000003' and specialty = 'general';
  update public.worker_establishments set revoked_at = now(), revoked_by = auth.uid()
  where user_id = 'a0000000-0000-0000-0000-000000000003' and establishment_id = 'a4000000-0000-0000-0000-000000000002';
  perform public.set_job_required_specialty(v_job_id, null);
end $$;

reset role;

-- ============================================================
-- RN-ASG-10/11/12: la disponibilidad declarada excluye de la
-- recomendación, y la ausencia (temporarily_absent) también.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
begin
  insert into public.worker_availability (space_id, user_id, available, note)
  values ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', false, 'RN-ASG-10: no disponible esta semana');
end $$;

reset role;

do $$
declare
  v_job_id uuid;
begin
  v_job_id := public.h6_make_job(
    'a4000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'RN-ASG-10: corregir una errata del pie de pagina', 'small'
  );
  insert into h6_ctx values ('job_disponibilidad', v_job_id::text);
end $$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_disponibilidad');
  v_candidates int;
begin
  select count(*) into v_candidates from public.list_job_candidates(v_job_id);
  if v_candidates <> 1 then
    raise exception 'RN-ASG-10/11 FALLIDO: quien se declaró no disponible sigue entre los candidatos (hay %)', v_candidates;
  end if;

  -- Con un único candidato válido, vuelve a asignarse solo (RN-ASG-03).
  if public.auto_assign_job(v_job_id) is distinct from 'a0000000-0000-0000-0000-000000000003' then
    raise exception 'RN-ASG-03 FALLIDO: la disponibilidad no dejó un único candidato asignable';
  end if;
end $$;

reset role;

-- Luis vuelve a estar disponible para el resto del archivo.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  update public.worker_availability set available = true
  where user_id = 'a0000000-0000-0000-0000-000000000004';
end $$;
reset role;

-- ============================================================
-- HU-18 · RN-JOB-03 / RN-SLA-07/11: Comenzar detiene T2 y arranca T3.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
begin
  -- Control negativo: Luis no es el responsable de ese trabajo.
  begin
    perform public.start_job(v_job_id);
    raise exception 'CA-01 FALLIDO: alguien que no es el responsable pudo comenzar el trabajo';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
  v_state text;
  v_request_state text;
  v_t2_stops int;
  v_t3_starts int;
begin
  perform public.start_job(v_job_id);
  -- CA-17: pulsar Comenzar dos veces produce un único efecto.
  perform public.start_job(v_job_id);

  select j.state, r.state into v_state, v_request_state
  from public.jobs j join public.requests r on r.id = j.request_id
  where j.id = v_job_id;

  if v_state <> 'in_progress' then
    raise exception 'HU-18 FALLIDO: el trabajo no quedó en curso sino en %', v_state;
  end if;

  -- CA-21: el mismo nombre de estado en la solicitud y en el trabajo.
  if v_request_state <> 'in_progress' then
    raise exception 'CA-21 FALLIDO: la solicitud no acompañó al trabajo (está en %)', v_request_state;
  end if;

  select count(*) into v_t2_stops from public.timer_events
  where entity_id = v_job_id and counter_kind = 't2' and event_type = 'stopped';
  select count(*) into v_t3_starts from public.timer_events
  where entity_id = v_job_id and counter_kind = 't3' and event_type = 'started';

  if v_t2_stops <> 1 or v_t3_starts <> 1 then
    raise exception 'RN-SLA-07/11 + CA-17 FALLIDO: T2 parado % veces, T3 arrancado % veces', v_t2_stops, v_t3_starts;
  end if;
end $$;

reset role;

-- ============================================================
-- HU-19 · RN-JOB-08/09 · CA-13: el bloqueo pausa T3 y al reanudar se
-- escribe el evento que conserva el tiempo restante exacto.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
  v_state text;
  v_open_blocks int;
  v_events text;
begin
  -- RN-JOB-07: un trabajador no puede autorizar una pausa; eso es del
  -- propietario o del administrador.
  begin
    perform public.block_job(v_job_id, 'authorized_pause', 'no me apetece seguir');
    raise exception 'RN-JOB-07 FALLIDO: un Trabajador pudo autorizarse una pausa';
  exception
    when raise_exception then null;
  end;

  -- RN-JOB-09: el bloqueo por falta de información sí lo marca él.
  perform public.block_job(v_job_id, 'client_information', 'Falta la fotografía del plato');
  -- Idempotente: repetirlo no abre un segundo bloqueo ni pausa dos veces.
  perform public.block_job(v_job_id, 'client_information', 'Falta la fotografía del plato');

  select state into v_state from public.jobs where id = v_job_id;
  if v_state <> 'blocked_by_client' then
    raise exception 'HU-19 FALLIDO: el trabajo no quedó bloqueado sino en %', v_state;
  end if;

  select count(*) into v_open_blocks from public.blocks where job_id = v_job_id and ended_at is null;
  if v_open_blocks <> 1 then
    raise exception 'CA-17 FALLIDO: hay % bloqueos abiertos a la vez', v_open_blocks;
  end if;
end $$;

-- El desbloqueo va en su propio bloque, es decir, en su propia
-- transacción: `now()` es el instante de inicio de la transacción, así que
-- pausar y reanudar dentro del mismo bloque daría a los dos eventos la
-- misma marca de tiempo y no habría orden que comprobar. En la aplicación
-- real cada operación es su propia transacción, que es lo que este bloque
-- reproduce.
do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
  v_state text;
  v_events text;
begin
  perform public.unblock_job(v_job_id, 'Recibida la fotografía');

  select state into v_state from public.jobs where id = v_job_id;
  if v_state <> 'in_progress' then
    raise exception 'CA-13 FALLIDO: el trabajo no volvió a En curso tras desbloquearlo';
  end if;

  -- CA-13: la secuencia de T3 es exactamente arranque · pausa ·
  -- reanudación — que es de lo que src/core/timer-events.ts obtiene el
  -- tiempo restante exacto (el cálculo en minutos se prueba en Vitest).
  select string_agg(event_type, ',' order by occurred_at) into v_events
  from public.timer_events where entity_id = v_job_id and counter_kind = 't3';

  if v_events <> 'started,paused,resumed' then
    raise exception 'CA-13 FALLIDO: la secuencia de eventos de T3 es "%" en vez de "started,paused,resumed"', v_events;
  end if;
end $$;

reset role;

-- RN-JOB-09: el administrador puede revertir un bloqueo del trabajador, y
-- queda registrado.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  perform public.block_job(
    (select value::uuid from h6_ctx where key = 'job_auto'),
    'client_information', 'Segundo bloqueo, este no procedía'
  );
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
  v_reverted boolean;
begin
  perform public.unblock_job(v_job_id, 'El cliente ya había respondido', true);

  select reverted into v_reverted from public.blocks
  where job_id = v_job_id order by started_at desc limit 1;

  if not v_reverted then
    raise exception 'RN-JOB-09 FALLIDO: la reversión del bloqueo no quedó registrada';
  end if;

  if not exists (
    select 1 from public.audit_log
    where entity_id = v_job_id and action = 'job.unblocked' and new_value->>'reverted' = 'true'
  ) then
    raise exception 'RN-JOB-09 FALLIDO: la reversión no dejó registro de auditoría';
  end if;
end $$;

reset role;

-- ============================================================
-- CA-14 · RN-SLA-17: "Fuera de plazo" es una condición calculada, no un
-- estado. En la base de datos eso se comprueba de dos formas: no existe
-- ninguna columna que lo guarde, y no es un valor admisible del estado del
-- trabajo — que sigue siendo En curso o Bloqueado mientras lo esté.
-- ============================================================
do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
  v_state text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('jobs', 'tasks', 'requests')
      and column_name in ('out_of_deadline', 'overdue', 'fuera_de_plazo')
  ) then
    raise exception 'CA-14 FALLIDO: hay una columna que almacena "fuera de plazo" como dato';
  end if;

  begin
    update public.jobs set state = 'out_of_deadline' where id = v_job_id;
    raise exception 'CA-14 FALLIDO: "out_of_deadline" se aceptó como estado de un trabajo';
  exception
    when check_violation then null; -- esperado: no es un estado
  end;

  select state into v_state from public.jobs where id = v_job_id;
  if v_state <> 'in_progress' then
    raise exception 'CA-14 FALLIDO: el estado del trabajo cambió al comprobar la condición (está en %)', v_state;
  end if;
end $$;

-- ============================================================
-- HU-21 · RN-ASG-14/16 · RN-JOB-01: desglosar en tareas y repartirlas.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
  v_task_ana uuid;
  v_task_luis uuid;
  v_weight text;
  v_puntos_ana int;
begin
  -- RN-ASG-16: más de 4 h no tiene categoría de puntos; la tarea debe
  -- dividirse y el servidor no la acepta.
  begin
    perform public.create_job_task(v_job_id, 'Rehacer la carta entera', 300, 'a0000000-0000-0000-0000-000000000003');
    raise exception 'RN-ASG-16 FALLIDO: se aceptó una tarea de más de 4 horas';
  exception
    when raise_exception then null;
  end;

  v_task_ana := public.create_job_task(v_job_id, 'Preparar el texto nuevo', 30, 'a0000000-0000-0000-0000-000000000003');
  v_task_luis := public.create_job_task(v_job_id, 'Subir la fotografía y colocarla', 90, 'a0000000-0000-0000-0000-000000000004');
  insert into h6_ctx values ('task_ana', v_task_ana::text), ('task_luis', v_task_luis::text);

  -- §14.4: 30 min = Normal (3 puntos), 90 min = Alta (6 puntos).
  select weight into v_weight from public.tasks where id = v_task_ana;
  if v_weight <> 'normal' then
    raise exception '§14.4 FALLIDO: una tarea de 30 min debería ser Normal, es %', v_weight;
  end if;
  select weight into v_weight from public.tasks where id = v_task_luis;
  if v_weight <> 'high' then
    raise exception '§14.4 FALLIDO: una tarea de 90 min debería ser Alta, es %', v_weight;
  end if;

  -- RN-ASG-14: al desglosarse, los puntos generales del trabajo dejan de
  -- sumar y cada participante recibe los de sus tareas. Ana tiene además
  -- otro trabajo "small" sin desglosar (1 punto) del escenario de
  -- disponibilidad.
  v_puntos_ana := public.worker_load('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003');
  -- RN-ASG-17: Ana no puede consultar la carga de Luis; la comprobación de
  -- los puntos de Luis se hace más abajo con el administrador.
  begin
    perform public.worker_load('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004');
    raise exception 'RN-ASG-17 FALLIDO: un Trabajador pudo consultar la carga de otro';
  exception
    when raise_exception then null;
  end;

  if v_puntos_ana <> 1 + 3 then
    raise exception 'RN-ASG-14 FALLIDO: Ana debería sumar 4 puntos (1 del trabajo sin desglosar + 3 de su tarea) y suma %', v_puntos_ana;
  end if;

  -- RN-JOB-01: el trabajador no puede cancelar una tarea.
  begin
    perform public.cancel_task(v_task_ana, 'ya no hace falta');
    raise exception 'RN-JOB-01 FALLIDO: un Trabajador pudo cancelar una tarea';
  exception
    when raise_exception then null;
  end;

  begin
    perform public.update_task_state(v_task_ana, 'cancelled');
    raise exception 'RN-JOB-01 FALLIDO: un Trabajador canceló una tarea por la puerta de atrás';
  exception
    when raise_exception then null;
  end;

  -- Lo que sí puede: avanzarla y completarla.
  perform public.update_task_state(v_task_ana, 'in_progress');
  perform public.update_task_state(v_task_ana, 'completed');

  -- RN-ASG-13: al completarse deja de sumar.
  v_puntos_ana := public.worker_load('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003');
  if v_puntos_ana <> 1 then
    raise exception 'RN-ASG-13 FALLIDO: una tarea completada sigue sumando (Ana suma %)', v_puntos_ana;
  end if;
end $$;

reset role;

-- RN-JOB-01: el administrador sí puede cancelar la tarea (y sí puede ver
-- la carga del equipo, §20.4).
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_task_luis uuid := (select value::uuid from h6_ctx where key = 'task_luis');
  v_state text;
  v_puntos_luis int;
begin
  -- RN-ASG-14: Luis suma 1 punto de su trabajo "small" sin desglosar más 6
  -- de su tarea Alta; los 1 punto del trabajo desglosado no cuentan.
  v_puntos_luis := public.worker_load('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004');
  if v_puntos_luis <> 1 + 6 then
    raise exception 'RN-ASG-14 FALLIDO: Luis debería sumar 7 puntos y suma %', v_puntos_luis;
  end if;

  perform public.cancel_task(v_task_luis, 'La hará el mismo responsable');
  select state into v_state from public.tasks where id = v_task_luis;
  if v_state <> 'cancelled' then
    raise exception 'RN-JOB-01 FALLIDO: el administrador no pudo cancelar la tarea';
  end if;
end $$;

reset role;

-- ============================================================
-- HU-20 · RN-JOB-10: el trabajador publica directamente, sin aprobación
-- previa del supervisor. Se le da un supervisor precisamente para que la
-- prueba demuestre que no hace falta que intervenga.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_principales int;
  v_supervisores int;
begin
  -- RN-SUP-01/02/05: la supervisión la crea el propietario, y es una
  -- relación Administrador–Trabajador, no un rol.
  perform public.set_principal_supervisor('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002');
  -- RN-SUP-02: exactamente un principal — repetirlo sustituye al anterior,
  -- no acumula (el anterior queda revocado, con su historial).
  perform public.set_principal_supervisor('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002');

  select count(*) into v_principales from public.supervisions
  where worker_id = 'a0000000-0000-0000-0000-000000000003' and kind = 'principal' and revoked_at is null;
  if v_principales <> 1 then
    raise exception 'RN-SUP-02 FALLIDO: el trabajador tiene % supervisores principales vigentes', v_principales;
  end if;

  -- RN-SUP-03: un sustituto temporal con fecha de inicio y fin.
  perform public.set_substitute_supervisor(
    'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
    now() - interval '1 day', now() + interval '7 days'
  );

  begin
    perform public.set_substitute_supervisor(
      'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', now(), null
    );
    raise exception 'RN-SUP-03 FALLIDO: se aceptó una sustitución sin fecha de fin';
  exception
    when raise_exception then null;
  end;

  -- RN-SUP-04: mientras la sustitución esté vigente, los avisos van a los dos.
  select count(*) into v_supervisores from public.current_supervisors('a0000000-0000-0000-0000-000000000003');
  if v_supervisores <> 2 then
    raise exception 'RN-SUP-04 FALLIDO: se esperaban 2 supervisores vigentes (principal y sustituto) y hay %', v_supervisores;
  end if;
end $$;

reset role;

-- RN-SUP-05: solo el propietario del espacio crea o cambia relaciones de
-- supervisión — un administrador no, aunque él mismo sea supervisor.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  begin
    perform public.set_principal_supervisor('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002');
    raise exception 'RN-SUP-05 FALLIDO: un Administrador pudo cambiar una relación de supervisión';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
begin
  begin
    perform public.publish_job(v_job_id, now() + interval '3 days');
    raise exception 'CA-01 FALLIDO: alguien que no es el responsable pudo publicar el trabajo';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
  v_state text;
  v_request_state text;
  v_t3_stops int;
  v_supervisor_approvals int;
begin
  -- Cota de seguridad de la ventana de corrección: un valor absurdo se
  -- rechaza (ver la nota de publish_job()).
  begin
    perform public.publish_job(v_job_id, now() + interval '400 days');
    raise exception 'FALLIDO: se aceptó una ventana de corrección fuera de toda medida';
  exception
    when raise_exception then null;
  end;

  perform public.publish_job(v_job_id, now() + interval '3 days');
  -- CA-17: publicar dos veces produce un único efecto.
  perform public.publish_job(v_job_id, now() + interval '3 days');

  select j.state, r.state into v_state, v_request_state
  from public.jobs j join public.requests r on r.id = j.request_id where j.id = v_job_id;

  if v_state <> 'published' or v_request_state <> 'published' then
    raise exception 'HU-20 FALLIDO: publicar dejó el trabajo en % y la solicitud en %', v_state, v_request_state;
  end if;

  select count(*) into v_t3_stops from public.timer_events
  where entity_id = v_job_id and counter_kind = 't3' and event_type = 'stopped';
  if v_t3_stops <> 1 then
    raise exception 'RN-SLA-13 + CA-17 FALLIDO: T3 se detuvo % veces', v_t3_stops;
  end if;

  -- RN-JOB-10: no existe ningún registro de aprobación previa del
  -- supervisor en el camino — la ausencia es la regla.
  select count(*) into v_supervisor_approvals from public.state_events
  where entity_id = v_job_id and to_state = 'published' and actor_id <> 'a0000000-0000-0000-0000-000000000003';
  if v_supervisor_approvals <> 0 then
    raise exception 'RN-JOB-10 FALLIDO: la publicación pasó por alguien distinto del responsable';
  end if;
end $$;

reset role;

-- ============================================================
-- HU-23 · RN-COR-01/02/07: la corrección mínima gratuita.
-- ============================================================
-- Control negativo (CA-02): alguien ajeno al establecimiento no puede
-- pedirla, aunque conozca el UUID del trabajo.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000099', false);
set role authenticated;

do $$
begin
  begin
    perform public.request_free_correction(
      (select value::uuid from h6_ctx where key = 'job_auto'), 'Quiero cambiar otra cosa'
    );
    raise exception 'CA-02 FALLIDO: alguien ajeno pudo pedir la corrección de un trabajo que no es suyo';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
  v_correction_id uuid;
  v_used_at timestamptz;
  v_request_state text;
begin
  v_correction_id := public.request_free_correction(v_job_id, 'El teléfono tiene un dígito mal');
  insert into h6_ctx values ('correction', v_correction_id::text);

  select free_correction_used_at into v_used_at from public.jobs where id = v_job_id;
  if v_used_at is null then
    raise exception 'RN-COR-01 FALLIDO: la corrección no quedó marcada como usada';
  end if;

  select r.state into v_request_state
  from public.requests r join public.jobs j on j.request_id = r.id where j.id = v_job_id;
  if v_request_state <> 'correction_requested' then
    raise exception 'HU-23 FALLIDO: la solicitud no refleja la corrección pedida (está en %)', v_request_state;
  end if;

  -- RN-COR-01: una sola corrección en total por trabajo.
  begin
    perform public.request_free_correction(v_job_id, 'Y ya que estamos, cambiadme la foto de inicio');
    raise exception 'RN-COR-01 FALLIDO: se aceptó una segunda corrección mínima sobre el mismo trabajo';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

-- RN-COR-06: la ejecuta el responsable; RN-COR-08 deja el trabajo listo
-- para cerrarse cuando la ventana expire.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_correction_id uuid := (select value::uuid from h6_ctx where key = 'correction');
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_auto');
  v_state text;
begin
  perform public.start_correction(v_correction_id);
  select state into v_state from public.jobs where id = v_job_id;
  if v_state <> 'in_correction' then
    raise exception 'RN-COR-06 FALLIDO: el trabajo no pasó a corrección (está en %)', v_state;
  end if;

  perform public.complete_correction(v_correction_id, 'Corregido el dígito');
  select state into v_state from public.jobs where id = v_job_id;
  if v_state <> 'published' then
    raise exception 'RN-COR-06 FALLIDO: al terminar la corrección el trabajo no volvió a publicado';
  end if;
end $$;

reset role;

-- RN-COR-02: pasada la ventana, ya no se puede pedir. Se simula sobre el
-- segundo trabajo, publicándolo y adelantando el cierre de su ventana
-- desde fuera de la aplicación (aquí, como postgres: ninguna función de
-- Cuotly permite mover esa fecha).
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_varios');
begin
  perform public.start_job(v_job_id);
  perform public.publish_job(v_job_id, now() + interval '3 days');
end $$;

reset role;

update public.jobs set correction_window_ends_at = now() - interval '1 minute'
where id = (select value::uuid from h6_ctx where key = 'job_varios');

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  begin
    perform public.request_free_correction(
      (select value::uuid from h6_ctx where key = 'job_varios'), 'Fuera de plazo'
    );
    raise exception 'RN-COR-02 FALLIDO: se aceptó una corrección con la ventana ya cerrada';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

-- RN-COR-07 / RN-JOB-12: un error imputable al equipo se corrige sin
-- consumir la corrección mínima del cliente.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_varios');
  v_used_at timestamptz;
  v_correction_id uuid;
begin
  v_correction_id := public.open_team_error_correction(v_job_id, 'Se publicó con la tipografía equivocada');

  select free_correction_used_at into v_used_at from public.jobs where id = v_job_id;
  if v_used_at is not null then
    raise exception 'RN-COR-07 FALLIDO: un error del equipo gastó la corrección mínima del cliente';
  end if;

  if not exists (
    select 1 from public.corrections where id = v_correction_id and kind = 'team_error'
  ) then
    raise exception 'RN-COR-07 FALLIDO: la corrección por error del equipo no quedó registrada como tal';
  end if;
end $$;

reset role;

-- RN-COR-08: con la ventana cerrada, el trabajo se cierra y la solicitud
-- pasa a `closed`.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_varios');
  v_state text;
  v_request_state text;
begin
  perform public.complete_correction(
    (select id from public.corrections where job_id = v_job_id and kind = 'team_error'), 'Tipografía corregida'
  );

  perform public.complete_job(v_job_id);
  perform public.complete_job(v_job_id); -- CA-17

  select j.state, r.state into v_state, v_request_state
  from public.jobs j join public.requests r on r.id = j.request_id where j.id = v_job_id;

  if v_state <> 'completed' or v_request_state <> 'closed' then
    raise exception 'RN-COR-08 FALLIDO: cerrar dejó el trabajo en % y la solicitud en %', v_state, v_request_state;
  end if;

  -- Y un trabajo cuya ventana sigue abierta no se puede cerrar todavía.
  begin
    perform public.complete_job((select value::uuid from h6_ctx where key = 'job_auto'));
    raise exception 'RN-COR-02 FALLIDO: se cerró un trabajo con la ventana de corrección abierta';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

-- ============================================================
-- HU-22 · RN-ASG-07/08/09 · CA-12 (segunda mitad): una reasignación NO
-- reinicia T2, y el historial se conserva entero.
-- ============================================================
do $$
declare
  v_job_id uuid;
begin
  v_job_id := public.h6_make_job(
    'a4000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'HU-22: cambiar el enlace de reservas', 'small'
  );
  insert into h6_ctx values ('job_reasignacion', v_job_id::text);
end $$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  perform public.assign_job(
    (select value::uuid from h6_ctx where key = 'job_reasignacion'),
    'a0000000-0000-0000-0000-000000000003'
  );
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_reasignacion');
  v_state text;
begin
  -- RN-ASG-07: hay que explicar el motivo.
  begin
    perform public.request_job_reassignment(v_job_id, '   ');
    raise exception 'RN-ASG-07 FALLIDO: se aceptó una reasignación sin motivo';
  exception
    when raise_exception then null;
  end;

  perform public.request_job_reassignment(v_job_id, 'Estoy cubriendo una ausencia y no llego');

  select state into v_state from public.jobs where id = v_job_id;
  if v_state <> 'reassignment_requested' then
    raise exception 'HU-22 FALLIDO: el trabajo no quedó con la reasignación pedida (está en %)', v_state;
  end if;

  -- RN-ASG-08: no la aprueba el propio trabajador.
  begin
    perform public.approve_job_reassignment(v_job_id, 'a0000000-0000-0000-0000-000000000004');
    raise exception 'RN-ASG-08 FALLIDO: un Trabajador aprobó su propia reasignación';
  exception
    when raise_exception then null;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_reasignacion');
  v_t2_events_before int;
  v_t2_events_after int;
  v_state text;
  v_assigned_to uuid;
  v_history int;
  v_active int;
begin
  select count(*) into v_t2_events_before from public.timer_events
  where entity_id = v_job_id and counter_kind = 't2';

  perform public.approve_job_reassignment(v_job_id, 'a0000000-0000-0000-0000-000000000004', 'Ana está cubriendo una ausencia');

  select count(*) into v_t2_events_after from public.timer_events
  where entity_id = v_job_id and counter_kind = 't2';

  -- CA-12 / RN-SLA-09: ni un solo evento nuevo de T2 — el contador sigue
  -- exactamente donde estaba y el nuevo responsable recibe el tiempo
  -- restante exacto.
  if v_t2_events_after <> v_t2_events_before then
    raise exception 'CA-12 FALLIDO: la reasignación tocó T2 (% eventos antes, % después)', v_t2_events_before, v_t2_events_after;
  end if;

  select state, assigned_to into v_state, v_assigned_to from public.jobs where id = v_job_id;
  if v_state <> 'assigned' or v_assigned_to <> 'a0000000-0000-0000-0000-000000000004' then
    raise exception 'HU-22 FALLIDO: tras aprobar la reasignación el trabajo está en % y asignado a %', v_state, v_assigned_to;
  end if;

  -- RN-ASG-09: se conserva todo el historial.
  select count(*) into v_history from public.assignments where job_id = v_job_id;
  select count(*) into v_active from public.assignments where job_id = v_job_id and released_at is null;
  if v_history <> 2 or v_active <> 1 then
    raise exception 'RN-ASG-09 FALLIDO: el historial de asignaciones tiene % filas y % activas', v_history, v_active;
  end if;
end $$;

reset role;

-- ============================================================
-- CA-12 (primera mitad) · RN-SLA-08 / RN-CLS-09: una nueva aceptación por
-- cambio de clasificación reinicia T2 desde cero, conservando los intentos
-- anteriores.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_reasignacion');
begin
  perform public.request_new_client_acceptance(
    v_job_id, 'medium', 'Al revisarlo, el cambio afecta a toda la sección de reservas',
    'RN-CLS-09: cambia la clasificación y el consumo'
  );
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_reasignacion');
  v_request_id uuid;
begin
  select request_id into v_request_id from public.jobs where id = v_job_id;

  perform public.accept_revised_request(v_request_id);
  perform public.accept_revised_request(v_request_id); -- CA-17
end $$;

reset role;

-- La comprobación se hace con la identidad del administrador: los
-- `timer_events` son internos del espacio (RN-SLA-16: el cliente ve rangos
-- o fechas aproximadas, no el contador exacto), así que el cliente no los
-- ve — y ese es justamente el comportamiento correcto.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_job_id uuid := (select value::uuid from h6_ctx where key = 'job_reasignacion');
  v_request_id uuid;
  v_t2_starts int;
  v_acceptances int;
  v_category text;
  v_devoluciones int;
  v_debitos_medium int;
begin
  select request_id into v_request_id from public.jobs where id = v_job_id;

  -- CA-12: T2 arranca de nuevo. Los eventos anteriores siguen ahí (el
  -- libro es inmutable): lo que reinicia el contador es este arranque
  -- nuevo, del que parte eventsSinceLastStart() en src/core.
  select count(*) into v_t2_starts from public.timer_events
  where entity_id = v_job_id and counter_kind = 't2' and event_type = 'started';
  if v_t2_starts <> 2 then
    raise exception 'CA-12 FALLIDO: se esperaban 2 arranques de T2 (uno por intento) y hay %', v_t2_starts;
  end if;

  -- RN-SLA-08: "la solicitud conserva todos los intentos anteriores".
  select count(*) into v_acceptances from public.acceptances where request_id = v_request_id;
  if v_acceptances <> 2 then
    raise exception 'RN-SLA-08 FALLIDO: se esperaban 2 aceptaciones registradas y hay %', v_acceptances;
  end if;

  select category into v_category from public.jobs where id = v_job_id;
  if v_category <> 'medium' then
    raise exception 'RN-CLS-09 FALLIDO: el trabajo no recogió la categoría nueva (sigue en %)', v_category;
  end if;

  -- RN-CON-04 / CA-08: el libro es inmutable — el consumo anterior se
  -- devuelve con un apunte nuevo y se debita la categoría nueva; nada se
  -- corrige con UPDATE.
  select count(*) into v_devoluciones from public.consumption_entries
  where job_id = v_job_id and entry_type in ('return', 'compensatory_credit') and category = 'small';
  select count(*) into v_debitos_medium from public.consumption_entries
  where job_id = v_job_id and entry_type = 'debit' and category = 'medium';

  if v_devoluciones <> 1 or v_debitos_medium <> 1 then
    raise exception 'RN-CLS-09 FALLIDO: devoluciones = %, débitos nuevos = %', v_devoluciones, v_debitos_medium;
  end if;
end $$;

reset role;

-- ============================================================
-- CA-02 · aislamiento: alguien de otro espacio no lee ni una fila de la
-- operación de este.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000099', false);
set role authenticated;

do $$
declare
  v_jobs int;
  v_tasks int;
  v_assignments int;
  v_state_events int;
  v_candidates_ok boolean := false;
begin
  select count(*) into v_jobs from public.jobs;
  select count(*) into v_tasks from public.tasks;
  select count(*) into v_assignments from public.assignments;
  select count(*) into v_state_events from public.state_events;

  if v_jobs <> 0 or v_tasks <> 0 or v_assignments <> 0 or v_state_events <> 0 then
    raise exception 'CA-02 FALLIDO: un ajeno leyó % trabajos, % tareas, % asignaciones y % eventos de estado',
      v_jobs, v_tasks, v_assignments, v_state_events;
  end if;

  begin
    perform public.list_job_candidates((select value::uuid from h6_ctx where key = 'job_auto'));
  exception
    when raise_exception then v_candidates_ok := true;
  end;

  if not v_candidates_ok then
    raise exception 'CA-01 FALLIDO: un ajeno pudo listar los candidatos de un trabajo de otro espacio';
  end if;
end $$;

reset role;

-- ============================================================
-- CA-16 · la auditoría del hito existe y no se puede tocar desde la
-- aplicación (el Hito 2 ya lo probó para UPDATE/DELETE; aquí se comprueba
-- que las operaciones nuevas dejan rastro).
-- ============================================================
do $$
declare
  v_missing text;
begin
  select string_agg(a.action, ', ')
  into v_missing
  from (values
    ('job.assigned'), ('job.started'), ('job.blocked'), ('job.unblocked'),
    ('job.published'), ('job.completed'), ('job.reassignment_requested'), ('job.reassigned'),
    ('task.created'), ('task.cancelled'), ('correction.requested'),
    ('correction.team_error_opened'), ('request.accepted_again')
  ) as a(action)
  where not exists (select 1 from public.audit_log al where al.action = a.action);

  if v_missing is not null then
    raise exception 'CA-16/§21.2 FALLIDO: estas operaciones no dejaron auditoría: %', v_missing;
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
drop function public.h6_make_job(uuid, uuid, uuid, text, text);

delete from public.audit_log where space_id = 'a1000000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'a1000000-0000-0000-0000-000000000001';
delete from auth.users where id in (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000099'
);
