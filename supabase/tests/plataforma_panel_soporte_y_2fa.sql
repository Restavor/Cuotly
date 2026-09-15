-- Fase 4 · Hito 19 · el panel de Administración de Cuotly, Modo soporte y
-- 2FA (migración 91; PRD §32, RN-ADM-01 a 12; §128, §129, §134, §136 y
-- §167 de la maestra).
--
-- Es la suite que ATACA la puerta que el aislamiento multiempresa (§134)
-- cierra en todas las demás. Lo que comprueba, en orden:
--
--   · RN-ADM-02: sin 2FA no hay plataforma: ni Bosco ni un Administrador
--     de Cuotly hacen nada con una sesión `aal1`.
--   · RN-ADM-03: nombrar y retirar Administradores es solo de Bosco, por
--     función y con auditoría; la escritura directa ya no existe.
--   · RN-ADM-06: abrir soporte exige permiso, motivo, nivel y duración
--     válidos, no se abre sobre un espacio propio, y pulsar dos veces
--     devuelve la misma sesión.
--   · RN-ADM-07: `read` ve y no escribe —ni por RLS ni por función—;
--     `admin` opera sin `manage_space`; `owner` opera sin `invite_member`
--     y nunca queda en `space_memberships`; retirar el permiso, perder la
--     2FA o agotar el tiempo cierra la puerta.
--   · RN-ADM-08: el rastro: apuntes con identidad en el espacio, sello en
--     cada acción, aviso obligatorio al propietario, y quién lo ve.
--   · RN-ADM-09: un espacio archivado sigue en solo lectura para el soporte.
--   · RN-ADM-04/01: el panel responde a la plataforma con 2FA y a nadie más.
--   · Barridos: toda tabla con `space_id` lleva el disparador de solo
--     lectura en soporte o está justificada; `platform_roles` no tiene
--     política de escritura.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plataforma_panel_soporte_y_2fa.sql

insert into auth.users (id, email, role, aud) values
  -- Bosco: el correo que reconoce `is_platform_owner()`.
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated'),
  ('ffb00000-0000-0000-0000-000000000002', 'adm-con-soporte@example.com', 'authenticated', 'authenticated'),
  ('ffb00000-0000-0000-0000-000000000003', 'adm-sin-permisos@example.com', 'authenticated', 'authenticated'),
  ('ffb00000-0000-0000-0000-000000000004', 'adm-propietaria@example.com', 'authenticated', 'authenticated'),
  ('ffb00000-0000-0000-0000-000000000005', 'adm-trabajador@example.com', 'authenticated', 'authenticated'),
  ('ffb00000-0000-0000-0000-000000000006', 'adm-cliente@example.com', 'authenticated', 'authenticated'),
  ('ffb00000-0000-0000-0000-000000000007', 'adm-candidata@example.com', 'authenticated', 'authenticated');

insert into public.platform_roles (user_id, role, can_support) values
  ('ffb00000-0000-0000-0000-000000000002', 'cuotly_admin', true),
  ('ffb00000-0000-0000-0000-000000000003', 'cuotly_admin', false);

-- Un espacio AJENO a la plataforma, con su equipo y su restaurante.
insert into public.spaces (id, name, slug, timezone, created_by) values
  ('ffb10000-0000-0000-0000-000000000001', 'Espacio Soporte', 'espacio-soporte-test', 'Europe/Madrid',
   'ffb00000-0000-0000-0000-000000000004');
insert into public.space_working_hours (space_id, calendar_kind, timezone, created_by) values
  ('ffb10000-0000-0000-0000-000000000001', 'contractual', 'Europe/Madrid', 'ffb00000-0000-0000-0000-000000000004'),
  ('ffb10000-0000-0000-0000-000000000001', 'support', 'Europe/Madrid', 'ffb00000-0000-0000-0000-000000000004'),
  ('ffb10000-0000-0000-0000-000000000001', 'menu_diario', 'Europe/Madrid', 'ffb00000-0000-0000-0000-000000000004');
insert into public.space_memberships (space_id, user_id, role, status) values
  ('ffb10000-0000-0000-0000-000000000001', 'ffb00000-0000-0000-0000-000000000004', 'owner', 'active'),
  ('ffb10000-0000-0000-0000-000000000001', 'ffb00000-0000-0000-0000-000000000005', 'worker', 'active');
insert into public.groups (id, space_id, name) values
  ('ffb20000-0000-0000-0000-000000000001', 'ffb10000-0000-0000-0000-000000000001', 'Grupo Soporte');
insert into public.establishments (id, space_id, group_id, code, name) values
  ('ffb30000-0000-0000-0000-000000000001', 'ffb10000-0000-0000-0000-000000000001',
   'ffb20000-0000-0000-0000-000000000001', 'EST-SOP-A', 'Restaurante Soporte A');
insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('ffb30000-0000-0000-0000-000000000001', 'ffb00000-0000-0000-0000-000000000006', 'local_owner');

-- Y un espacio PROPIO de Bosco, para comprobar que sobre él no hay soporte.
insert into public.spaces (id, name, slug, timezone, created_by) values
  ('ffb10000-0000-0000-0000-000000000002', 'Espacio de Bosco', 'espacio-de-bosco-test', 'Europe/Madrid',
   'ffb00000-0000-0000-0000-000000000001');
insert into public.space_memberships (space_id, user_id, role, status) values
  ('ffb10000-0000-0000-0000-000000000002', 'ffb00000-0000-0000-0000-000000000001', 'owner', 'active');

create temp table adm_ids (k text primary key, v uuid);
grant select, insert, update on adm_ids to authenticated, service_role;

-- ============================================================
-- RN-ADM-02 · sin 2FA no hay plataforma
-- ============================================================
select set_config('request.jwt.claim.aal', 'aal1', false);
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_access jsonb;
begin
  if public.is_platform_owner() then
    raise exception 'RN-ADM-02 FALLIDO: Bosco es plataforma sin haber pasado el segundo factor' using errcode = 'assert_failure';
  end if;
  if public.is_platform_approver() or public.is_platform_subscription_manager() or public.is_platform_supporter() then
    raise exception 'RN-ADM-02 FALLIDO: un permiso de plataforma responde con sesión aal1' using errcode = 'assert_failure';
  end if;

  begin
    perform public.platform_panel_summary();
    raise exception 'RN-ADM-02 FALLIDO: el panel responde sin 2FA' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;

  -- La identidad sí se sabe: es lo que manda a Bosco a registrar la 2FA.
  v_access := public.my_platform_access();
  if not (v_access ->> 'is_owner')::boolean or (v_access ->> 'two_factor')::boolean then
    raise exception 'RN-ADM-02 FALLIDO: my_platform_access() no distingue identidad de cerradura' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El Administrador de Cuotly con permiso tampoco, sin 2FA.
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if public.is_platform_supporter() or public.is_platform_admin() then
    raise exception 'RN-ADM-02 FALLIDO: un Admin de Cuotly es plataforma sin 2FA' using errcode = 'assert_failure';
  end if;
  begin
    perform public.start_support_session('ffb10000-0000-0000-0000-000000000001', 'Sin segundo factor', 'read', 60);
    raise exception 'RN-ADM-02 FALLIDO: se abre Modo soporte sin 2FA' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
end $$;
reset role;

-- Desde aquí, todas las sesiones de esta suite han pasado el segundo factor.
select set_config('request.jwt.claim.aal', 'aal2', false);

-- ============================================================
-- RN-ADM-03 · nombrar Administrador de Cuotly es de Bosco
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  begin
    perform public.set_platform_admin('ffb00000-0000-0000-0000-000000000007', true, true, true);
    raise exception 'RN-ADM-03 FALLIDO: un Admin de Cuotly nombra a otro' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_before integer;
begin
  if not public.is_platform_owner() then
    raise exception 'RN-ADM-02 FALLIDO: Bosco con 2FA no es plataforma' using errcode = 'assert_failure';
  end if;

  -- La segunda puerta se ha cerrado: ni Bosco escribe `platform_roles` a mano.
  begin
    insert into public.platform_roles (user_id, role, can_support)
    values ('ffb00000-0000-0000-0000-000000000007', 'cuotly_admin', true);
    raise exception 'RN-ADM-03 FALLIDO: platform_roles se escribe por PostgREST sin auditoría' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate '42501' then null;
  end;

  -- Bosco no se nombra a sí mismo.
  begin
    perform public.set_platform_admin('ffb00000-0000-0000-0000-000000000001', true, true, true);
    raise exception 'RN-ADM-03 FALLIDO: Bosco se nombra Administrador de Cuotly' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;

  perform public.set_platform_admin('ffb00000-0000-0000-0000-000000000007', false, false, true);
  if not exists (select 1 from public.platform_roles where user_id = 'ffb00000-0000-0000-0000-000000000007' and can_support) then
    raise exception 'RN-ADM-03 FALLIDO: nombrar no deja el permiso' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log
                 where action = 'platform.admin_granted' and entity_id = 'ffb00000-0000-0000-0000-000000000007'
                   and space_id is null and actor_id = auth.uid()) then
    raise exception 'RN-ADM-03 FALLIDO: nombrar no deja auditoría' using errcode = 'assert_failure';
  end if;

  -- CA-17 · lo mismo otra vez no escribe un apunte que diría "de X a X".
  select count(*) into v_before from public.audit_log where entity_id = 'ffb00000-0000-0000-0000-000000000007';
  perform public.set_platform_admin('ffb00000-0000-0000-0000-000000000007', false, false, true);
  if (select count(*) from public.audit_log where entity_id = 'ffb00000-0000-0000-0000-000000000007') <> v_before then
    raise exception 'RN-ADM-03/CA-17 FALLIDO: repetir el nombramiento deja un apunte vacío' using errcode = 'assert_failure';
  end if;

  perform public.set_platform_admin('ffb00000-0000-0000-0000-000000000007', true, false, true);
  if not exists (select 1 from public.audit_log where action = 'platform.admin_updated' and entity_id = 'ffb00000-0000-0000-0000-000000000007') then
    raise exception 'RN-ADM-03 FALLIDO: cambiar un permiso no deja auditoría' using errcode = 'assert_failure';
  end if;

  if not public.revoke_platform_admin('ffb00000-0000-0000-0000-000000000007') then
    raise exception 'RN-ADM-03 FALLIDO: retirar devuelve falso con rol vigente' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.platform_roles where user_id = 'ffb00000-0000-0000-0000-000000000007') then
    raise exception 'RN-ADM-03 FALLIDO: retirar no retira' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where action = 'platform.admin_revoked' and entity_id = 'ffb00000-0000-0000-0000-000000000007') then
    raise exception 'RN-ADM-03 FALLIDO: retirar no deja auditoría' using errcode = 'assert_failure';
  end if;
  if public.revoke_platform_admin('ffb00000-0000-0000-0000-000000000007') then
    raise exception 'RN-ADM-03/CA-17 FALLIDO: retirar dos veces devuelve verdadero' using errcode = 'assert_failure';
  end if;

  -- RN-ADM-06 · sobre un espacio propio no hay soporte.
  begin
    perform public.start_support_session('ffb10000-0000-0000-0000-000000000002', 'Mi propio espacio', 'read', 60);
    raise exception 'RN-ADM-06 FALLIDO: se abre soporte sobre un espacio del que se es miembro' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-ADM-06 · abrir Modo soporte: permiso, motivo, nivel, duración
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  -- Es Administrador de Cuotly y lee el panel (RN-ADM-01)…
  if (public.platform_panel_summary() ->> 'spaces_total')::integer < 2 then
    raise exception 'RN-ADM-01 FALLIDO: un Admin de Cuotly sin permisos no lee el panel' using errcode = 'assert_failure';
  end if;
  -- …pero sin `can_support` no entra en ningún espacio.
  begin
    perform public.start_support_session('ffb10000-0000-0000-0000-000000000001', 'Sin permiso', 'read', 60);
    raise exception 'RN-ADM-06 FALLIDO: abre soporte un Admin de Cuotly sin can_support' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_space uuid := 'ffb10000-0000-0000-0000-000000000001';
  v_id uuid;
begin
  -- Antes de abrir, el espacio ajeno no se ve: es el aislamiento de §134.
  if exists (select 1 from public.establishments where space_id = v_space) then
    raise exception '§134 FALLIDO: la plataforma ve un espacio ajeno sin sesión de soporte' using errcode = 'assert_failure';
  end if;

  begin
    perform public.start_support_session(v_space, '   ', 'read', 60);
    raise exception 'RN-ADM-06 FALLIDO: se abre soporte sin motivo' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
  begin
    perform public.start_support_session(v_space, 'Nivel inventado', 'root', 60);
    raise exception 'RN-ADM-06 FALLIDO: se abre soporte con un nivel que no existe' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
  begin
    perform public.start_support_session(v_space, 'Demasiado larga', 'read', 480);
    raise exception 'RN-ADM-06 FALLIDO: se abre soporte de ocho horas' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;

  v_id := public.start_support_session(v_space, 'Revisar por qué no llegan los avisos', 'read', 60, 'sop-clave-1');
  insert into adm_ids values ('read', v_id);

  -- CA-17 · con la clave, y sin ella mientras haya una activa.
  if public.start_support_session(v_space, 'Otra vez', 'read', 60, 'sop-clave-1') <> v_id
     or public.start_support_session(v_space, 'Y otra', 'owner', 30) <> v_id then
    raise exception 'RN-ADM-06/CA-17 FALLIDO: pulsar dos veces abre dos sesiones' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.support_sessions where actor_id = auth.uid() and space_id = v_space) <> 1 then
    raise exception 'RN-ADM-06 FALLIDO: más de una sesión por persona y espacio' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ADM-08 · el rastro de abrir: apunte con identidad y aviso obligatorio
-- ============================================================
do $$
declare
  v_id uuid := (select v from adm_ids where k = 'read');
  v_space uuid := 'ffb10000-0000-0000-0000-000000000001';
begin
  if not exists (select 1 from public.audit_log
                 where action = 'support.session_started' and entity_id = v_id and space_id = v_space
                   and actor_id = 'ffb00000-0000-0000-0000-000000000002' and support_session_id = v_id
                   and reason = 'Revisar por qué no llegan los avisos') then
    raise exception 'RN-ADM-08 FALLIDO: abrir soporte no deja apunte con identidad, motivo y sello en el espacio' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.notifications
                 where event_type = 'support_session_started' and entity_type = 'support_session' and entity_id = v_id
                   and recipient_id = 'ffb00000-0000-0000-0000-000000000004') then
    raise exception 'RN-ADM-08 FALLIDO: el propietario del espacio no recibe el aviso de soporte' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications where event_type = 'support_session_started' and entity_id = v_id
             and recipient_id <> 'ffb00000-0000-0000-0000-000000000004') then
    raise exception 'RN-ADM-08 FALLIDO: el aviso de soporte llega a quien no es propietario' using errcode = 'assert_failure';
  end if;
  if not public.notification_event_is_mandatory('support_session_started') then
    raise exception 'RN-ADM-08/RN-NOT-03 FALLIDO: el aviso de soporte se puede desactivar' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ADM-07 · `read`: ve como un miembro y no escribe ni por RLS ni por función
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_space uuid := 'ffb10000-0000-0000-0000-000000000001';
begin
  if not public.is_space_member(v_space) then
    raise exception 'RN-ADM-07 FALLIDO: con sesión de soporte no se es miembro' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.establishments where space_id = v_space) <> 1 then
    raise exception 'RN-ADM-07 FALLIDO: en soporte no se ven los restaurantes del espacio' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.spaces where id = v_space) <> 1 then
    raise exception 'RN-ADM-07 FALLIDO: en soporte no se lee el espacio' using errcode = 'assert_failure';
  end if;
  if public.has_capability(v_space, 'manage_clients') or public.has_capability(v_space, 'view_team')
     or public.has_capability(v_space, 'manage_files') then
    raise exception 'RN-ADM-07 FALLIDO: `read` tiene alguna capacidad' using errcode = 'assert_failure';
  end if;

  -- La política de `worker_availability` solo pregunta pertenencia: RLS
  -- dejaría pasar. Lo que cierra es el disparador.
  begin
    insert into public.worker_availability (space_id, user_id, available) values (v_space, auth.uid(), true);
    raise exception 'RN-ADM-07 FALLIDO: `read` escribe por RLS en una tabla del espacio' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
      if sqlerrm not like '%solo lectura%' then raise; end if;
  end;
  -- Y por función tampoco: `create_establishment_note()` es SECURITY
  -- DEFINER, corre como el dueño, y el disparador mira `auth.uid()`.
  begin
    perform public.create_establishment_note('ffb30000-0000-0000-0000-000000000001', 'Nota en solo lectura');
    raise exception 'RN-ADM-07 FALLIDO: `read` escribe por función' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
  if exists (select 1 from public.worker_availability where user_id = auth.uid())
     or exists (select 1 from public.establishment_notes where created_by = auth.uid()) then
    raise exception 'RN-ADM-07 FALLIDO: algo quedó escrito en solo lectura' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Perder la 2FA a mitad de sesión cierra la puerta.
select set_config('request.jwt.claim.aal', 'aal1', false);
set role authenticated;
do $$
begin
  if public.is_space_member('ffb10000-0000-0000-0000-000000000001')
     or exists (select 1 from public.establishments where space_id = 'ffb10000-0000-0000-0000-000000000001') then
    raise exception 'RN-ADM-07 FALLIDO: la sesión de soporte sigue abierta sin 2FA' using errcode = 'assert_failure';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.aal', 'aal2', false);

-- Retirar el permiso a mitad de sesión cierra la puerta, sin tocar la sesión.
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.set_platform_admin('ffb00000-0000-0000-0000-000000000002', false, false, false);
reset role;
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if public.is_space_member('ffb10000-0000-0000-0000-000000000001') then
    raise exception 'RN-ADM-07 FALLIDO: sin can_support la sesión de soporte sigue abriendo' using errcode = 'assert_failure';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.set_platform_admin('ffb00000-0000-0000-0000-000000000002', false, false, true);
reset role;

-- Agotar el tiempo cierra la puerta, sin que nadie haga nada.
update public.support_sessions set started_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = (select v from adm_ids where k = 'read');
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if public.is_space_member('ffb10000-0000-0000-0000-000000000001') then
    raise exception 'RN-ADM-07 FALLIDO: una sesión caducada sigue abriendo' using errcode = 'assert_failure';
  end if;
end $$;
reset role;
update public.support_sessions set started_at = now(), expires_at = now() + interval '30 minutes' where id = (select v from adm_ids where k = 'read');

-- ============================================================
-- RN-ADM-08 · quién ve la sesión y el apunte: el propietario sí; el
-- trabajador y el restaurante, no
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_id uuid := (select v from adm_ids where k = 'read');
begin
  if not exists (select 1 from public.support_sessions where id = v_id and actor_id = 'ffb00000-0000-0000-0000-000000000002') then
    raise exception 'RN-ADM-08 FALLIDO: el propietario no ve quién de Cuotly entró en su espacio' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where action = 'support.session_started' and entity_id = v_id) then
    raise exception 'RN-ADM-08 FALLIDO: el propietario no ve el apunte de soporte en su auditoría' using errcode = 'assert_failure';
  end if;
  -- Y no puede cerrarla ni abrir una: no es plataforma.
  begin
    perform public.end_support_session(v_id);
    raise exception 'RN-ADM-06 FALLIDO: el propietario del espacio cierra la sesión de Cuotly' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_id uuid := (select v from adm_ids where k = 'read');
begin
  if exists (select 1 from public.support_sessions where id = v_id) then
    raise exception 'RN-ADM-08 FALLIDO: un trabajador ve las sesiones de soporte' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.audit_log where action = 'support.session_started' and entity_id = v_id) then
    raise exception 'RN-ADM-08 FALLIDO: un trabajador ve el apunte de soporte, que es del propietario' using errcode = 'assert_failure';
  end if;
  begin
    perform public.platform_panel_summary();
    raise exception 'RN-ADM-04 FALLIDO: un trabajador con 2FA lee el panel de Cuotly' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.support_sessions) then
    raise exception 'RN-ADM-08 FALLIDO: un restaurante ve sesiones de soporte' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ADM-06/08 · cerrar: apunte con duración, y dos veces no hace nada
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_id uuid := (select v from adm_ids where k = 'read');
begin
  if not public.end_support_session(v_id, 'Visto: era la preferencia de aviso') then
    raise exception 'RN-ADM-06 FALLIDO: cerrar devuelve falso con la sesión abierta' using errcode = 'assert_failure';
  end if;
  if public.end_support_session(v_id) then
    raise exception 'RN-ADM-06/CA-17 FALLIDO: cerrar dos veces devuelve verdadero' using errcode = 'assert_failure';
  end if;
  if public.is_space_member('ffb10000-0000-0000-0000-000000000001') then
    raise exception 'RN-ADM-07 FALLIDO: la sesión cerrada sigue abriendo' using errcode = 'assert_failure';
  end if;
  -- Y con la puerta cerrada, la auditoría del espacio deja de verse: es
  -- lo que significa "cerrada".
  if exists (select 1 from public.audit_log where space_id = 'ffb10000-0000-0000-0000-000000000001') then
    raise exception 'RN-ADM-07 FALLIDO: con la sesión cerrada se sigue leyendo la auditoría del espacio' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El apunte de cierre se mira desde fuera: quien cerró ya no ve el espacio.
do $$
declare v_id uuid := (select v from adm_ids where k = 'read');
begin
  if not exists (select 1 from public.audit_log
                 where action = 'support.session_ended' and entity_id = v_id and support_session_id = v_id
                   and (new_value ->> 'duration_minutes') is not null
                   and reason = 'Visto: era la preferencia de aviso') then
    raise exception 'RN-ADM-08 FALLIDO: cerrar no deja apunte con duración y nota' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ADM-07 · `admin`: opera como un administrador; cada acción lleva el sello
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_space uuid := 'ffb10000-0000-0000-0000-000000000001';
  v_id uuid;
  v_note uuid;
begin
  v_id := public.start_support_session(v_space, 'Añadir la nota que el equipo no encuentra', 'admin', 30);
  insert into adm_ids values ('admin', v_id);

  if not public.has_capability(v_space, 'manage_clients') or not public.has_capability(v_space, 'manage_requests') then
    raise exception 'RN-ADM-07 FALLIDO: `admin` no opera como un administrador' using errcode = 'assert_failure';
  end if;
  if public.has_capability(v_space, 'manage_space') or public.has_capability(v_space, 'invite_member')
     or public.has_capability(v_space, 'perform_jobs') or public.has_capability(v_space, 'approve_reports') then
    raise exception 'RN-ADM-07 FALLIDO: `admin` tiene lo que un administrador sin permisos no tiene' using errcode = 'assert_failure';
  end if;

  v_note := public.create_establishment_note('ffb30000-0000-0000-0000-000000000001', 'Nota escrita en Modo soporte');
  if not exists (select 1 from public.audit_log
                 where action = 'establishment_note.created' and actor_id = auth.uid() and support_session_id = v_id) then
    raise exception 'RN-ADM-08 FALLIDO: la acción de una sesión de soporte no lleva su sello' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.support_session_actions(v_id)) <> 1 then
    raise exception 'RN-ADM-08 FALLIDO: "acciones realizadas" no cuenta la acción' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El propietario del espacio ve lo que se hizo; el trabajador, no.
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.support_session_actions((select v from adm_ids where k = 'admin'))) <> 1 then
    raise exception 'RN-ADM-08 FALLIDO: el propietario no ve las acciones de la sesión de soporte' using errcode = 'assert_failure';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  begin
    perform public.support_session_actions((select v from adm_ids where k = 'admin'));
    raise exception 'RN-ADM-08 FALLIDO: un trabajador ve las acciones de la sesión de soporte' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
end $$;
reset role;

-- Un Admin de Cuotly sin permiso no cierra la sesión de otro; Bosco, sí.
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.end_support_session((select v from adm_ids where k = 'admin'));
    raise exception 'RN-ADM-06 FALLIDO: un Admin de Cuotly cierra la sesión de otro' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  if not public.end_support_session((select v from adm_ids where k = 'admin'), 'Cerrada por Bosco') then
    raise exception 'RN-ADM-06 FALLIDO: Bosco no puede cerrar una sesión ajena' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ADM-07 · `owner`: todo menos dejar a alguien dentro
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_space uuid := 'ffb10000-0000-0000-0000-000000000001';
  v_id uuid;
begin
  v_id := public.start_support_session(v_space, 'Corregir la zona horaria del espacio', 'owner', 15);
  insert into adm_ids values ('owner', v_id);

  if not public.has_capability(v_space, 'manage_space') then
    raise exception 'RN-ADM-07 FALLIDO: `owner` no opera como el propietario' using errcode = 'assert_failure';
  end if;
  if public.has_capability(v_space, 'invite_member') then
    raise exception 'RN-ADM-07 FALLIDO: `owner` puede invitar, que es dejar a alguien dentro' using errcode = 'assert_failure';
  end if;

  begin
    insert into public.space_memberships (space_id, user_id, role, status)
    values (v_space, 'ffb00000-0000-0000-0000-000000000007', 'admin', 'active');
    raise exception 'RN-ADM-07 FALLIDO: en soporte se añade gente al equipo' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate '42501' then null;
  end;
  begin
    insert into public.space_invitations (space_id, email, role, invited_by)
    values (v_space, 'colada@example.com', 'admin', auth.uid());
    raise exception 'RN-ADM-07 FALLIDO: en soporte se invita gente al equipo' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate '42501' then null;
  end;

  -- Y lo que sí puede: un cambio del propietario, con su apunte sellado.
  perform public.set_space_timezone(v_space, 'Atlantic/Canary', 'El espacio opera desde Canarias');
  if not exists (select 1 from public.audit_log
                 where action = 'space.timezone_changed' and space_id = v_space and support_session_id = v_id) then
    raise exception 'RN-ADM-08 FALLIDO: el cambio hecho como `owner` no lleva el sello' using errcode = 'assert_failure';
  end if;

  -- Nunca figura como miembro: la sesión es la ÚNICA vía (§134).
  if exists (select 1 from public.space_memberships where user_id = auth.uid()) then
    raise exception '§134 FALLIDO: la persona de Cuotly aparece en space_memberships' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ADM-09 · un espacio archivado sigue en solo lectura para el soporte
-- ============================================================
do $$
begin
  perform set_config('cuotly.space_status_change', 'on', false);
  update public.spaces set cuotly_status = 'archived_nonpayment', cuotly_archived_at = now()
  where id = 'ffb10000-0000-0000-0000-000000000001';
  perform set_config('cuotly.space_status_change', 'off', false);
end $$;
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  begin
    insert into public.groups (space_id, name) values ('ffb10000-0000-0000-0000-000000000001', 'Grupo en modo lectura');
    raise exception 'RN-ADM-09 FALLIDO: el soporte escribe en un espacio archivado' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
      if sqlerrm not like '%archivado%' then raise; end if;
  end;
  -- Ver, sí: para eso está.
  if (select count(*) from public.establishments where space_id = 'ffb10000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'RN-ADM-09 FALLIDO: en un espacio archivado el soporte no ve nada' using errcode = 'assert_failure';
  end if;
  perform public.end_support_session((select v from adm_ids where k = 'owner'));
end $$;
reset role;
do $$
begin
  perform set_config('cuotly.space_status_change', 'on', false);
  update public.spaces set cuotly_status = null, cuotly_archived_at = null
  where id = 'ffb10000-0000-0000-0000-000000000001';
  perform set_config('cuotly.space_status_change', 'off', false);
end $$;

-- ============================================================
-- RN-ADM-04 · el panel: los doce bloques, con la identidad que Bosco sí ve
-- ============================================================
-- En `auth.mfa_factors` NINGUNA de las obligatorias tiene valor por
-- omisión en Supabase: `id`, `created_at` y `updated_at` se ponen a mano.
-- Omitirlas pasaba en local y fallaba en el proyecto real, hasta que
-- `bootstrap-postgres-local.sql` dejó de regalar `default`s que allí no
-- existen.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('ffb20000-0000-0000-0000-000000000002', 'ffb00000-0000-0000-0000-000000000002', 'Móvil', 'totp', 'verified', now(), now()),
  ('ffb20000-0000-0000-0000-000000000003', 'ffb00000-0000-0000-0000-000000000003', 'Móvil', 'totp', 'unverified', now(), now());

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_summary jsonb;
  v_row record;
begin
  v_summary := public.platform_panel_summary();
  if (v_summary ->> 'users_total')::integer < 7
     or (v_summary ->> 'spaces_total')::integer < 2
     or (v_summary ->> 'support_sessions_total')::integer < 3
     or (v_summary ->> 'support_sessions_active')::integer <> 0 then
    raise exception 'RN-ADM-04 FALLIDO: el resumen del panel no cuenta lo que hay: %', v_summary using errcode = 'assert_failure';
  end if;
  -- Las incidencias son el Hito 21: nulo, no cero (CA-20).
  if v_summary ? 'incidents' and v_summary -> 'incidents' <> 'null'::jsonb then
    raise exception 'RN-ADM-04 FALLIDO: el panel inventa una cifra de incidencias' using errcode = 'assert_failure';
  end if;

  select * into v_row from public.platform_list_spaces() where slug = 'espacio-soporte-test';
  if v_row.id is null or v_row.owner_emails <> 'adm-propietaria@example.com'
     or v_row.active_establishments <> 1 or v_row.internal_users <> 2 or v_row.support_active then
    raise exception 'RN-ADM-04 FALLIDO: la fila del espacio en el panel no dice lo que hay' using errcode = 'assert_failure';
  end if;

  select * into v_row from public.platform_list_users(500, 0) where email = 'adm-con-soporte@example.com';
  if v_row.id is null or not v_row.is_admin or not v_row.can_support or not v_row.two_factor_enrolled then
    raise exception 'RN-ADM-04 FALLIDO: la fila del Admin de Cuotly no dice su permiso ni su 2FA' using errcode = 'assert_failure';
  end if;
  select * into v_row from public.platform_list_users(500, 0) where email = 'adm-sin-permisos@example.com';
  if v_row.two_factor_enrolled then
    raise exception 'RN-ADM-04 FALLIDO: un factor sin verificar cuenta como 2FA' using errcode = 'assert_failure';
  end if;

  select * into v_row from public.platform_list_support_sessions(100) where id = (select v from adm_ids where k = 'admin');
  if v_row.id is null or v_row.actions_count <> 1 or v_row.is_active or v_row.actor_email <> 'adm-con-soporte@example.com' then
    raise exception 'RN-ADM-04 FALLIDO: el bloque de soporte no cuenta las acciones de la sesión' using errcode = 'assert_failure';
  end if;

  if not exists (select 1 from public.platform_audit('platform', 200, 0) where action = 'platform.admin_granted')
     or not exists (select 1 from public.platform_audit('platform', 200, 0) where action = 'support.session_started') then
    raise exception 'RN-ADM-04 FALLIDO: la auditoría de plataforma no enseña sus apuntes' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.platform_audit('all', 500, 0) where action = 'establishment_note.created') then
    raise exception 'RN-ADM-04 FALLIDO: la actividad no enseña lo de los espacios' using errcode = 'assert_failure';
  end if;

  -- Corren, aunque esta suite no tenga cobros: que no revienten es lo que
  -- se comprueba; lo que devuelven lo comprueba la suite del Hito 18.
  perform public.platform_list_charges(true);
  perform public.platform_list_pending_payments();
  perform public.platform_revenue_by_month(12);
end $$;
reset role;

-- ============================================================
-- Barridos: el disparador de solo lectura en soporte en toda tabla con
-- `space_id`, el sello en `audit_log`, y `platform_roles` sin escritura
-- ============================================================
do $$
declare
  v_t record;
  v_sin text := '';
begin
  for v_t in
    select c.relname as tabla,
           exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = c.relname || '_guard_support_read_only') as guardada
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'space_id' and a.attnum > 0 and not a.attisdropped
      )
    order by 1
  loop
    if not v_t.guardada and v_t.tabla not in (
         -- Los libros y los avisos que la propia sesión escribe.
         'audit_log', 'state_events', 'notifications', 'notification_deliveries',
         -- De plataforma: su `space_id` es anulable.
         'space_requests',
         -- La sesión misma: cerrarla es una escritura de quien está en solo lectura.
         'support_sessions'
       ) then
      v_sin := v_sin || ' ' || v_t.tabla;
    end if;
  end loop;

  if v_sin <> '' then
    raise exception 'RN-ADM-07 FALLIDO: tablas de espacio sin el disparador de solo lectura en soporte:%. O le falta el disparador, o hay que justificarla en la lista de exentas de este test Y de la migración.', v_sin
      using errcode = 'assert_failure';
  end if;

  if not exists (select 1 from pg_trigger where tgrelid = 'public.audit_log'::regclass and tgname = 'audit_log_stamp_support_session') then
    raise exception 'RN-ADM-08 FALLIDO: audit_log no estampa la sesión de soporte' using errcode = 'assert_failure';
  end if;

  if exists (select 1 from pg_policy where polrelid = 'public.platform_roles'::regclass and polcmd <> 'r') then
    raise exception 'RN-ADM-03 FALLIDO: platform_roles vuelve a tener una política de escritura' using errcode = 'assert_failure';
  end if;

  -- Las cinco funciones de plataforma llevan la cerradura: si alguien
  -- redefine una sin `session_is_two_factor()` ni `is_platform_owner()`,
  -- la 2FA deja de ser obligatoria sin que nadie lo diga.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_platform_owner', 'is_platform_admin', 'is_platform_member',
                        'is_platform_approver', 'is_platform_subscription_manager', 'is_platform_supporter')
      and p.prosrc !~ 'session_is_two_factor|is_platform_owner|is_platform_admin'
  ) then
    raise exception 'RN-ADM-02 FALLIDO: una función de plataforma no exige la sesión verificada en dos pasos' using errcode = 'assert_failure';
  end if;
end $$;

select 'plataforma_panel_soporte_y_2fa: OK' as resultado;
