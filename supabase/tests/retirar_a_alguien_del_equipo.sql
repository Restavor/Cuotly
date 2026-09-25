-- ============================================================
-- Suite 78 · Retirar a alguien del equipo de mantenimiento
-- (migración 139, decisión 80, PRD §4.5, RN-MIE-01 a RN-MIE-07)
-- ============================================================
--
-- Lo que vigila:
--
--   · RN-MIE-01 · solo el propietario retira, y con motivo. Ni un
--     administrador ni un trabajador, ni nadie sin sesión.
--   · RN-MIE-02 · al propietario no se le retira (se transfiere antes), y
--     Modo soporte no retira a nadie.
--   · RN-MIE-03 · sus trabajos vivos —también los bloqueados y en pausa—
--     quedan en "reasignación pedida", con aviso a propietario y
--     administradores; sus tareas vivas, con la reasignación pendiente. Y
--     al aprobar la reasignación, el trabajo bloqueado vuelve bloqueado.
--   · RN-MIE-04 · pierde el acceso en el acto; sus supervisiones,
--     restaurantes autorizados y especialidades se retiran SIN borrarse.
--   · RN-MIE-05 · queda en auditoría y en `state_events`, y su historial
--     sigue ahí.
--   · RN-MIE-06 · retirarlo dos veces no hace nada la segunda.
--   · RN-MIE-07 · no toca a nadie de un restaurante; y una invitación nueva
--     le devuelve la entrada, sin sus autorizaciones de antes.
--   · Un `update` directo por PostgREST tiene las mismas consecuencias.
--   · `anon` no ejecuta la función; el disparador no lo ejecuta nadie.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/retirar_a_alguien_del_equipo.sql
--
-- Prefijo de esta suite: e7800000-.

insert into auth.users (id, email, role, aud) values
  ('e7800000-0000-0000-0000-000000000001', 'mie78-duena@example.com', 'authenticated', 'authenticated'),
  ('e7800000-0000-0000-0000-000000000002', 'mie78-admin@example.com', 'authenticated', 'authenticated'),
  -- La que se va.
  ('e7800000-0000-0000-0000-000000000003', 'mie78-eva@example.com', 'authenticated', 'authenticated'),
  -- La que se queda y recibe lo de Eva.
  ('e7800000-0000-0000-0000-000000000004', 'mie78-hugo@example.com', 'authenticated', 'authenticated'),
  -- Del restaurante: no se toca.
  ('e7800000-0000-0000-0000-000000000005', 'mie78-cliente@example.com', 'authenticated', 'authenticated'),
  -- Otro trabajador, retirado por un `update` directo.
  ('e7800000-0000-0000-0000-000000000006', 'mie78-ivan@example.com', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('e7800000-0000-0000-0000-000000000001', 'mie78-duena@example.com', 'Dueña 78'),
  ('e7800000-0000-0000-0000-000000000002', 'mie78-admin@example.com', 'Admin 78'),
  ('e7800000-0000-0000-0000-000000000003', 'mie78-eva@example.com', 'Eva 78'),
  ('e7800000-0000-0000-0000-000000000004', 'mie78-hugo@example.com', 'Hugo 78'),
  ('e7800000-0000-0000-0000-000000000005', 'mie78-cliente@example.com', 'Cliente 78'),
  ('e7800000-0000-0000-0000-000000000006', 'mie78-ivan@example.com', 'Iván 78')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('e7810000-0000-0000-0000-000000000001', 'Espacio 78', 'espacio-78', 'Europe/Madrid',
   'e7800000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('e7810000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('e7810000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('e7810000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('e7810000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000004', 'worker', 'active'),
  ('e7810000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000006', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('e7830000-0000-0000-0000-000000000001', 'e7810000-0000-0000-0000-000000000001', 'Grupo 78');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('e7840000-0000-0000-0000-000000000001', 'e7810000-0000-0000-0000-000000000001',
   'e7830000-0000-0000-0000-000000000001', 'EST-78-A', 'Casa 78', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('e7840000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000005', 'local_owner');

insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('e7810000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000003',
   'e7840000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000001'),
  ('e7810000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000004',
   'e7840000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000001'),
  ('e7810000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000006',
   'e7840000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000001');

insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('e7810000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000003', 'general', 'e7800000-0000-0000-0000-000000000001'),
  ('e7810000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000004', 'general', 'e7800000-0000-0000-0000-000000000001'),
  ('e7810000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000006', 'general', 'e7800000-0000-0000-0000-000000000001');

-- Eva tiene de principal al administrador.
insert into public.supervisions (id, space_id, worker_id, admin_id, kind, created_by) values
  ('e7850000-0000-0000-0000-000000000001', 'e7810000-0000-0000-0000-000000000001',
   'e7800000-0000-0000-0000-000000000003', 'e7800000-0000-0000-0000-000000000002', 'principal',
   'e7800000-0000-0000-0000-000000000001');

-- Tres trabajos de Eva vivos (asignado, en curso, bloqueado por el
-- cliente) y uno ya publicado, que no se toca.
insert into public.requests (id, space_id, establishment_id, code, state, description, created_by, validated_category, accepted_at, accepted_start_sla_hours) values
  ('e7860000-0000-0000-0000-000000000001', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'SOL-78-1', 'accepted', 'Cambiar el horario', 'e7800000-0000-0000-0000-000000000005', 'small', now(), 24),
  ('e7860000-0000-0000-0000-000000000002', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'SOL-78-2', 'accepted', 'Actualizar la carta', 'e7800000-0000-0000-0000-000000000005', 'small', now(), 24),
  ('e7860000-0000-0000-0000-000000000003', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'SOL-78-3', 'accepted', 'Fotos nuevas', 'e7800000-0000-0000-0000-000000000005', 'small', now(), 24),
  ('e7860000-0000-0000-0000-000000000004', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'SOL-78-4', 'published', 'Cambiar el teléfono', 'e7800000-0000-0000-0000-000000000005', 'small', now(), 24);

insert into public.jobs (id, space_id, establishment_id, request_id, code, state, category, assigned_to, assigned_at) values
  ('e7870000-0000-0000-0000-000000000001', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'e7860000-0000-0000-0000-000000000001', 'TRA-78-1', 'assigned', 'small', 'e7800000-0000-0000-0000-000000000003', now()),
  ('e7870000-0000-0000-0000-000000000002', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'e7860000-0000-0000-0000-000000000002', 'TRA-78-2', 'in_progress', 'small', 'e7800000-0000-0000-0000-000000000003', now()),
  ('e7870000-0000-0000-0000-000000000003', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'e7860000-0000-0000-0000-000000000003', 'TRA-78-3', 'blocked_by_client', 'small', 'e7800000-0000-0000-0000-000000000003', now()),
  ('e7870000-0000-0000-0000-000000000004', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'e7860000-0000-0000-0000-000000000004', 'TRA-78-4', 'published', 'small', 'e7800000-0000-0000-0000-000000000003', now());

-- Dos tareas de Eva vivas en el trabajo en curso y una terminada.
insert into public.tasks (id, space_id, establishment_id, job_id, title, weight, estimated_minutes, created_by, assignee_id, state) values
  ('e7880000-0000-0000-0000-000000000001', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'e7870000-0000-0000-0000-000000000002', 'Revisar enlaces', 'normal', 30, 'e7800000-0000-0000-0000-000000000003', 'e7800000-0000-0000-0000-000000000003', 'pending'),
  ('e7880000-0000-0000-0000-000000000002', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'e7870000-0000-0000-0000-000000000002', 'Subir fotos', 'normal', 30, 'e7800000-0000-0000-0000-000000000003', 'e7800000-0000-0000-0000-000000000003', 'in_progress'),
  ('e7880000-0000-0000-0000-000000000003', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'e7870000-0000-0000-0000-000000000002', 'Hecha', 'normal', 30, 'e7800000-0000-0000-0000-000000000003', 'e7800000-0000-0000-0000-000000000003', 'completed');

-- ============================================================
-- La función está donde debe; el disparador, cerrado a todos
-- ============================================================
do $$
begin
  if has_function_privilege('anon', 'public.remove_space_member(uuid, uuid, text)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: anon puede ejecutar remove_space_member' using errcode = 'assert_failure';
  end if;
  if not has_function_privilege('authenticated', 'public.remove_space_member(uuid, uuid, text)', 'execute') then
    raise exception 'remove_space_member debería poder llamarla authenticated: comprueba el permiso por dentro'
      using errcode = 'assert_failure';
  end if;
  if has_function_privilege('authenticated', 'public.end_membership_consequences()', 'execute')
     or has_function_privilege('anon', 'public.end_membership_consequences()', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: el disparador end_membership_consequences está abierto por RPC'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MIE-01 · ni un administrador ni un trabajador retiran a nadie
-- ============================================================
set role authenticated;

do $$
declare
  v_space uuid := 'e7810000-0000-0000-0000-000000000001';
  v_eva uuid := 'e7800000-0000-0000-0000-000000000003';
begin
  perform set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000002', false);
  begin
    perform public.remove_space_member(v_space, v_eva, 'Probando');
    raise exception 'RN-MIE-01 FALLIDO: un administrador retiró a alguien del equipo' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  perform set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000004', false);
  begin
    perform public.remove_space_member(v_space, v_eva, 'Probando');
    raise exception 'RN-MIE-01 FALLIDO: un trabajador retiró a una compañera' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- El cliente tampoco: no es del espacio.
  perform set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000005', false);
  begin
    perform public.remove_space_member(v_space, v_eva, 'Probando');
    raise exception 'RN-MIE-01 FALLIDO: alguien del restaurante retiró a alguien del equipo' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- Sin motivo, ni la dueña.
  perform set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000001', false);
  begin
    perform public.remove_space_member(v_space, v_eva, '   ');
    raise exception 'RN-MIE-01 FALLIDO: se retiró a alguien sin motivo' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  if (select status from public.space_memberships where space_id = v_space and user_id = v_eva) <> 'active' then
    raise exception 'RN-MIE-01 FALLIDO: un intento rechazado cambió el estado de Eva' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MIE-02 · al propietario no se le retira
-- ============================================================
do $$
begin
  perform set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000001', false);
  begin
    perform public.remove_space_member('e7810000-0000-0000-0000-000000000001',
      'e7800000-0000-0000-0000-000000000001', 'Me voy');
    raise exception 'RN-MIE-02 FALLIDO: la propietaria se retiró a sí misma' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- RN-MIE-03 / RN-MIE-04 / RN-MIE-05 · la dueña retira a Eva
-- ============================================================
set role authenticated;

do $$
declare
  v_space uuid := 'e7810000-0000-0000-0000-000000000001';
  v_eva uuid := 'e7800000-0000-0000-0000-000000000003';
  v_result jsonb;
  v_n integer;
begin
  perform set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000001', false);
  v_result := public.remove_space_member(v_space, v_eva, 'Deja la empresa a final de mes');

  if (v_result->>'jobs')::int <> 3 or (v_result->>'tasks')::int <> 2
     or (v_result->>'already_removed')::boolean then
    raise exception 'RN-MIE-03 FALLIDO: el resumen dice %', v_result using errcode = 'assert_failure';
  end if;

  -- RN-MIE-04 · en el acto: ya no es miembro, y su fila sigue ahí.
  select count(*) into v_n from public.space_memberships
  where space_id = v_space and user_id = v_eva and status = 'access_revoked';
  if v_n <> 1 then
    raise exception 'RN-MIE-04 FALLIDO: Eva no quedó en access_revoked (o su fila se borró)' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

do $$
declare
  v_space uuid := 'e7810000-0000-0000-0000-000000000001';
  v_eva uuid := 'e7800000-0000-0000-0000-000000000003';
  v_n integer;
begin
  -- RN-MIE-03 · los tres vivos, a reasignación; el publicado, igual.
  select count(*) into v_n from public.jobs
  where assigned_to = v_eva and state = 'reassignment_requested';
  if v_n <> 3 then
    raise exception 'RN-MIE-03 FALLIDO: % trabajos de Eva quedaron para reasignar (se esperaban 3)', v_n
      using errcode = 'assert_failure';
  end if;
  if (select state from public.jobs where id = 'e7870000-0000-0000-0000-000000000004') <> 'published' then
    raise exception 'RN-MIE-03 FALLIDO: se tocó un trabajo ya publicado' using errcode = 'assert_failure';
  end if;

  -- Cada uno con su evento, de dónde venía, y el motivo.
  select count(*) into v_n from public.state_events
  where entity_type = 'job' and to_state = 'reassignment_requested' and cause = 'member_left'
    and reason = 'Deja la empresa a final de mes'
    and entity_id in ('e7870000-0000-0000-0000-000000000001', 'e7870000-0000-0000-0000-000000000002',
                      'e7870000-0000-0000-0000-000000000003');
  if v_n <> 3 then
    raise exception 'RN-MIE-05 FALLIDO: % eventos de estado de trabajo (se esperaban 3)', v_n using errcode = 'assert_failure';
  end if;

  -- Aviso a propietaria y administrador, uno por trabajo; a nadie más.
  select count(*) into v_n from public.notifications
  where event_type = 'job_reassignment_requested' and space_id = v_space
    and recipient_id in ('e7800000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000002');
  if v_n <> 6 then
    raise exception 'RN-MIE-03 FALLIDO: % avisos de reasignación a quien decide (se esperaban 6)', v_n
      using errcode = 'assert_failure';
  end if;
  select count(*) into v_n from public.notifications
  where space_id = v_space and event_type in ('job_reassignment_requested', 'task_reassignment_requested')
    and recipient_id not in ('e7800000-0000-0000-0000-000000000001', 'e7800000-0000-0000-0000-000000000002');
  if v_n <> 0 then
    raise exception 'RN-MIE-03 FALLIDO: el aviso de reasignación llegó a quien no decide (% avisos)', v_n
      using errcode = 'assert_failure';
  end if;

  -- Las dos tareas vivas, pendientes de reasignar; la terminada, no.
  select count(*) into v_n from public.task_reassignment_requests
  where task_id in ('e7880000-0000-0000-0000-000000000001', 'e7880000-0000-0000-0000-000000000002')
    and state = 'pending' and requested_by = 'e7800000-0000-0000-0000-000000000001';
  if v_n <> 2 then
    raise exception 'RN-MIE-03 FALLIDO: % tareas pendientes de reasignar (se esperaban 2)', v_n using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.task_reassignment_requests where task_id = 'e7880000-0000-0000-0000-000000000003') then
    raise exception 'RN-MIE-03 FALLIDO: se pidió reasignar una tarea terminada' using errcode = 'assert_failure';
  end if;

  -- RN-MIE-04 · supervisión, restaurantes y especialidades: retirados, no borrados.
  if exists (select 1 from public.supervisions where id = 'e7850000-0000-0000-0000-000000000001' and revoked_at is null)
     or not exists (select 1 from public.supervisions where id = 'e7850000-0000-0000-0000-000000000001') then
    raise exception 'RN-MIE-04 FALLIDO: la supervisión de Eva sigue vigente o se borró' using errcode = 'assert_failure';
  end if;
  select count(*) into v_n from public.worker_establishments where user_id = v_eva and revoked_at is not null;
  if v_n <> 1 or exists (select 1 from public.worker_establishments where user_id = v_eva and revoked_at is null) then
    raise exception 'RN-MIE-04 FALLIDO: los restaurantes de Eva no se retiraron como debían' using errcode = 'assert_failure';
  end if;
  select count(*) into v_n from public.worker_specialties where user_id = v_eva and revoked_at is not null;
  if v_n <> 1 or exists (select 1 from public.worker_specialties where user_id = v_eva and revoked_at is null) then
    raise exception 'RN-MIE-04 FALLIDO: las especialidades de Eva no se retiraron como debían' using errcode = 'assert_failure';
  end if;

  -- RN-MIE-05 · auditoría de la persona y evento de su pertenencia.
  if not exists (
    select 1 from public.audit_log
    where space_id = v_space and action = 'membership.access_revoked' and entity_id = v_eva
      and actor_id = 'e7800000-0000-0000-0000-000000000001'
      and old_value->>'status' = 'active' and new_value->>'status' = 'access_revoked'
      and reason = 'Deja la empresa a final de mes'
  ) then
    raise exception 'RN-MIE-05 FALLIDO: falta la auditoría de la salida de Eva' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.state_events
    where entity_type = 'space_membership' and entity_id = v_eva
      and from_state = 'active' and to_state = 'access_revoked'
  ) then
    raise exception 'RN-MIE-05 FALLIDO: falta el evento de estado de la pertenencia de Eva' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MIE-04 · Eva ya no entra; el restaurante no ve nada de esto
-- ============================================================
set role authenticated;

do $$
declare
  v_n integer;
begin
  perform set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000003', false);
  if public.is_space_member('e7810000-0000-0000-0000-000000000001') then
    raise exception 'RN-MIE-04 FALLIDO: Eva sigue siendo miembro tras retirarla' using errcode = 'assert_failure';
  end if;
  select count(*) into v_n from public.jobs where space_id = 'e7810000-0000-0000-0000-000000000001';
  if v_n <> 0 then
    raise exception 'RN-MIE-04 FALLIDO: Eva sigue viendo % trabajos del espacio', v_n using errcode = 'assert_failure';
  end if;

  -- RN-MIE-07 · el cliente sigue en su restaurante, y no ve la salida.
  perform set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000005', false);
  select count(*) into v_n from public.state_events where entity_type = 'space_membership';
  if v_n <> 0 then
    raise exception 'P7 FALLIDO: el restaurante ve % eventos de pertenencia del equipo', v_n using errcode = 'assert_failure';
  end if;
end $$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.establishment_memberships
    where establishment_id = 'e7840000-0000-0000-0000-000000000001'
      and user_id = 'e7800000-0000-0000-0000-000000000005' and revoked_at is null
  ) then
    raise exception 'RN-MIE-07 FALLIDO: retirar a alguien del equipo tocó el acceso del restaurante' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MIE-06 · retirarla otra vez no hace nada
-- ============================================================
set role authenticated;

do $$
declare
  v_result jsonb;
  v_n integer;
begin
  perform set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000001', false);
  v_result := public.remove_space_member('e7810000-0000-0000-0000-000000000001',
    'e7800000-0000-0000-0000-000000000003', 'Otra vez');
  if not (v_result->>'already_removed')::boolean then
    raise exception 'RN-MIE-06 FALLIDO: la segunda vez no dijo que ya estaba retirada: %', v_result
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.audit_log
  where action = 'membership.access_revoked' and entity_id = 'e7800000-0000-0000-0000-000000000003';
  if v_n <> 1 then
    raise exception 'RN-MIE-06 FALLIDO: % auditorías de la salida de Eva (se esperaba 1)', v_n using errcode = 'assert_failure';
  end if;
  select count(*) into v_n from public.notifications
  where event_type = 'job_reassignment_requested' and space_id = 'e7810000-0000-0000-0000-000000000001';
  if v_n <> 6 then
    raise exception 'RN-MIE-06 FALLIDO: la segunda vez avisó otra vez (% avisos)', v_n using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MIE-03 · aprobar la reasignación devuelve el bloqueado bloqueado
-- ============================================================
set role authenticated;

do $$
begin
  perform set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000001', false);
  perform public.approve_job_reassignment('e7870000-0000-0000-0000-000000000003',
    'e7800000-0000-0000-0000-000000000004', 'Lo lleva Hugo');
  perform public.approve_task_reassignment('e7880000-0000-0000-0000-000000000001',
    'e7800000-0000-0000-0000-000000000004', 'Lo lleva Hugo');
end $$;

reset role;

do $$
begin
  if (select state from public.jobs where id = 'e7870000-0000-0000-0000-000000000003') <> 'blocked_by_client'
     or (select assigned_to from public.jobs where id = 'e7870000-0000-0000-0000-000000000003')
        <> 'e7800000-0000-0000-0000-000000000004' then
    raise exception 'RN-MIE-03 FALLIDO: el trabajo bloqueado no volvió bloqueado y a nombre de Hugo'
      using errcode = 'assert_failure';
  end if;
  if (select assignee_id from public.tasks where id = 'e7880000-0000-0000-0000-000000000001')
     <> 'e7800000-0000-0000-0000-000000000004' then
    raise exception 'RN-MIE-03 FALLIDO: la tarea de Eva no pasó a Hugo' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MIE-02 · Modo soporte no retira a nadie
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('e7800000-0000-0000-0000-000000000007', 'mie78-cuotly@example.com', 'authenticated', 'authenticated');
insert into public.platform_roles (user_id, role, can_approve_spaces, can_manage_subscriptions, can_support) values
  ('e7800000-0000-0000-0000-000000000007', 'cuotly_admin', false, false, true);

-- RN-ADM-02 · sin el reclamo `aal2`, el sombrero de plataforma no existe y
-- este bloque pasaría por el motivo equivocado.
select set_config('request.jwt.claim.aal', 'aal2', false);
select set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000007', false);
set role authenticated;

do $$
declare
  v_space uuid := 'e7810000-0000-0000-0000-000000000001';
begin
  perform public.start_support_session(v_space, 'Revisar el equipo', 'owner', 60);

  begin
    perform public.remove_space_member(v_space, 'e7800000-0000-0000-0000-000000000004', 'desde soporte');
    raise exception 'RN-MIE-02 FALLIDO: Modo soporte ha retirado a alguien de un equipo ajeno'
      using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.aal', '', false);

do $$
begin
  if (select status from public.space_memberships
      where space_id = 'e7810000-0000-0000-0000-000000000001'
        and user_id = 'e7800000-0000-0000-0000-000000000004') <> 'active' then
    raise exception 'RN-MIE-02 FALLIDO: Hugo ya no está activo tras el intento desde soporte'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Un `update` directo tiene las mismas consecuencias (§4.5)
-- ============================================================
insert into public.requests (id, space_id, establishment_id, code, state, description, created_by, validated_category, accepted_at, accepted_start_sla_hours) values
  ('e7860000-0000-0000-0000-000000000009', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'SOL-78-9', 'accepted', 'Menú de otoño', 'e7800000-0000-0000-0000-000000000005', 'small', now(), 24);
insert into public.jobs (id, space_id, establishment_id, request_id, code, state, category, assigned_to, assigned_at) values
  ('e7870000-0000-0000-0000-000000000009', 'e7810000-0000-0000-0000-000000000001', 'e7840000-0000-0000-0000-000000000001', 'e7860000-0000-0000-0000-000000000009', 'TRA-78-9', 'assigned', 'small', 'e7800000-0000-0000-0000-000000000006', now());

set role authenticated;
select set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000001', false);
update public.space_memberships set status = 'inactive'
where space_id = 'e7810000-0000-0000-0000-000000000001' and user_id = 'e7800000-0000-0000-0000-000000000006';
reset role;

do $$
begin
  if (select state from public.jobs where id = 'e7870000-0000-0000-0000-000000000009') <> 'reassignment_requested' then
    raise exception '§4.5 FALLIDO: un update directo a inactive dejó el trabajo de Iván sin marcar'
      using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.worker_establishments
             where user_id = 'e7800000-0000-0000-0000-000000000006' and revoked_at is null) then
    raise exception '§4.5 FALLIDO: un update directo dejó a Iván autorizado en un restaurante'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MIE-07 · una invitación nueva le devuelve la entrada, sin lo de antes
-- ============================================================
insert into public.space_invitations (id, space_id, email, role, invited_by, status) values
  ('e7890000-0000-0000-0000-000000000001', 'e7810000-0000-0000-0000-000000000001',
   'mie78-eva@example.com', 'worker', 'e7800000-0000-0000-0000-000000000001', 'pending');

set role authenticated;

do $$
declare
  v_token uuid := (select token from public.space_invitations where id = 'e7890000-0000-0000-0000-000000000001');
begin
  perform set_config('request.jwt.claim.sub', 'e7800000-0000-0000-0000-000000000003', false);
  perform public.accept_space_invitation(v_token);
  if not public.is_space_member('e7810000-0000-0000-0000-000000000001') then
    raise exception 'RN-MIE-07 FALLIDO: la invitación nueva no devolvió la entrada a Eva' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

do $$
begin
  if exists (select 1 from public.worker_establishments
             where user_id = 'e7800000-0000-0000-0000-000000000003' and revoked_at is null) then
    raise exception 'RN-MIE-07 FALLIDO: Eva volvió con sus restaurantes de antes (RN-ASG-01)' using errcode = 'assert_failure';
  end if;
  -- Su historial sigue: los trabajos que hizo, y la auditoría de su salida.
  if (select assigned_to from public.jobs where id = 'e7870000-0000-0000-0000-000000000004')
     <> 'e7800000-0000-0000-0000-000000000003' then
    raise exception 'RN-MIE-05 FALLIDO: el trabajo publicado de Eva perdió su autora' using errcode = 'assert_failure';
  end if;
end $$;

\echo 'Suite 78 · Retirar a alguien del equipo: OK'
