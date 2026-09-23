-- ============================================================
-- Suite 71 · Los permisos del equipo
--            (migración 130; M70, M71; RN-ASG-01, §4.6, CLAUDE.md auditoría)
-- ============================================================
--
--   · **Restaurantes autorizados y especialidades se cambian por conjunto**:
--     lo que sobra se retira (sin borrar), lo que falta se añade.
--   · **Cada cambio audita una vez**, con el antes y el después; repetir el
--     mismo conjunto no cambia nada ni audita nada.
--   · **Nada de otro espacio** ni especialidades que no existen.
--   · **Solo con `assign_jobs`**: un trabajador no cambia los permisos de
--     nadie. Y la persona tiene que ser del espacio.
--   · **Cancelar una invitación** pendiente, con `invite_member`, audita;
--     cancelarla dos veces no hace nada; una aceptada no se cancela.
--   · `anon` no ejecuta ninguna de las tres.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/los_permisos_del_equipo.sql
--
-- Prefijo de esta suite: f1500000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1500000-0000-0000-0000-000000000001', 'duena71@cuotly.test', 'authenticated', 'authenticated'),
  ('f1500000-0000-0000-0000-000000000002', 'trabajador71@cuotly.test', 'authenticated', 'authenticated'),
  ('f1500000-0000-0000-0000-000000000003', 'ajena71@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1500000-0000-0000-0000-000000000001', 'duena71@cuotly.test', 'Dueña 71'),
  ('f1500000-0000-0000-0000-000000000002', 'trabajador71@cuotly.test', 'Trabajador 71'),
  ('f1500000-0000-0000-0000-000000000003', 'ajena71@cuotly.test', 'Ajena 71')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1510000-0000-0000-0000-000000000001', 'Espacio 71', 'espacio-71', 'Europe/Madrid', 'f1500000-0000-0000-0000-000000000001'),
  ('f1510000-0000-0000-0000-000000000002', 'Espacio ajeno 71', 'espacio-ajeno-71', 'Europe/Madrid', 'f1500000-0000-0000-0000-000000000003');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1510000-0000-0000-0000-000000000001', 'f1500000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('f1510000-0000-0000-0000-000000000001', 'f1500000-0000-0000-0000-000000000002', 'worker', 'active'),
  ('f1510000-0000-0000-0000-000000000002', 'f1500000-0000-0000-0000-000000000003', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('f1530000-0000-0000-0000-000000000001', 'f1510000-0000-0000-0000-000000000001', 'Grupo 71'),
  ('f1530000-0000-0000-0000-000000000002', 'f1510000-0000-0000-0000-000000000002', 'Grupo ajeno 71');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1540000-0000-0000-0000-000000000001', 'f1510000-0000-0000-0000-000000000001', 'f1530000-0000-0000-0000-000000000001', 'EST-71-1', 'Casa Uno', 'active'),
  ('f1540000-0000-0000-0000-000000000002', 'f1510000-0000-0000-0000-000000000001', 'f1530000-0000-0000-0000-000000000001', 'EST-71-2', 'Casa Dos', 'active'),
  ('f1540000-0000-0000-0000-000000000009', 'f1510000-0000-0000-0000-000000000002', 'f1530000-0000-0000-0000-000000000002', 'EST-71-9', 'Casa Ajena', 'active');

insert into public.space_invitations (id, space_id, email, role, invited_by, status) values
  ('f1560000-0000-0000-0000-000000000001', 'f1510000-0000-0000-0000-000000000001', 'nueva71@cuotly.test', 'worker', 'f1500000-0000-0000-0000-000000000001', 'pending'),
  ('f1560000-0000-0000-0000-000000000002', 'f1510000-0000-0000-0000-000000000001', 'vieja71@cuotly.test', 'worker', 'f1500000-0000-0000-0000-000000000001', 'accepted');

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.set_worker_establishments(uuid, uuid, uuid[])',
    'public.set_worker_specialties(uuid, uuid, text[])',
    'public.cancel_space_invitation(uuid)'
  ] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: anon puede ejecutar %', f using errcode = 'assert_failure';
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception '% debería poder llamarla authenticated: comprueba el permiso por dentro', f using errcode = 'assert_failure';
    end if;
  end loop;
end $$;

-- ============================================================
-- Un trabajador no cambia permisos de nadie, ni cancela invitaciones
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1500000-0000-0000-0000-000000000002';

do $$
begin
  begin
    perform public.set_worker_establishments('f1510000-0000-0000-0000-000000000001', 'f1500000-0000-0000-0000-000000000002',
      array['f1540000-0000-0000-0000-000000000001']::uuid[]);
    raise exception 'assign_jobs FALLIDO: un trabajador se autorizó a sí mismo en un restaurante' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.set_worker_specialties('f1510000-0000-0000-0000-000000000001', 'f1500000-0000-0000-0000-000000000002', array['web']);
    raise exception 'assign_jobs FALLIDO: un trabajador cambió sus especialidades' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.cancel_space_invitation('f1560000-0000-0000-0000-000000000001');
    raise exception 'invite_member FALLIDO: un trabajador canceló una invitación' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

-- ============================================================
-- La dueña cambia restaurantes y especialidades
-- ============================================================
set local request.jwt.claim.sub = 'f1500000-0000-0000-0000-000000000001';

do $$
declare
  v_space uuid := 'f1510000-0000-0000-0000-000000000001';
  v_worker uuid := 'f1500000-0000-0000-0000-000000000002';
  v_activos int;
  v_retirados int;
  v_audit int;
begin
  perform public.set_worker_establishments(v_space, v_worker,
    array['f1540000-0000-0000-0000-000000000001', 'f1540000-0000-0000-0000-000000000002']::uuid[]);
  -- El mismo conjunto otra vez: nada cambia, nada se audita.
  perform public.set_worker_establishments(v_space, v_worker,
    array['f1540000-0000-0000-0000-000000000002', 'f1540000-0000-0000-0000-000000000001']::uuid[]);

  select count(*) into v_activos from public.worker_establishments where user_id = v_worker and revoked_at is null;
  select count(*) into v_audit from public.audit_log where entity_id = v_worker and action = 'membership.establishments_changed';
  if v_activos <> 2 or v_audit <> 1 then
    raise exception 'RN-ASG-01 FALLIDO: % autorizaciones activas y % auditorías (se esperaban 2 y 1)', v_activos, v_audit
      using errcode = 'assert_failure';
  end if;

  -- Quitar uno lo retira, no lo borra.
  perform public.set_worker_establishments(v_space, v_worker, array['f1540000-0000-0000-0000-000000000002']::uuid[]);
  select count(*) filter (where revoked_at is null), count(*) filter (where revoked_at is not null)
    into v_activos, v_retirados
  from public.worker_establishments where user_id = v_worker;
  select count(*) into v_audit from public.audit_log where entity_id = v_worker and action = 'membership.establishments_changed';
  if v_activos <> 1 or v_retirados <> 1 or v_audit <> 2 then
    raise exception 'CLAUDE.md FALLIDO: tras quitar uno hay % activas, % retiradas y % auditorías', v_activos, v_retirados, v_audit
      using errcode = 'assert_failure';
  end if;

  -- Un restaurante de otro espacio no se cuela.
  begin
    perform public.set_worker_establishments(v_space, v_worker, array['f1540000-0000-0000-0000-000000000009']::uuid[]);
    raise exception 'set_worker_establishments FALLIDO: autorizó un restaurante de otro espacio' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- Especialidades: una que no existe se rechaza; el conjunto se aplica una vez.
  begin
    perform public.set_worker_specialties(v_space, v_worker, array['magia']);
    raise exception '§4.6 FALLIDO: aceptó una especialidad que no existe' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  perform public.set_worker_specialties(v_space, v_worker, array['web', 'design']);
  perform public.set_worker_specialties(v_space, v_worker, array['design', 'web']);
  select count(*) into v_activos from public.worker_specialties where user_id = v_worker and revoked_at is null;
  select count(*) into v_audit from public.audit_log where entity_id = v_worker and action = 'membership.specialties_changed';
  if v_activos <> 2 or v_audit <> 1 then
    raise exception '§4.6 FALLIDO: % especialidades activas y % auditorías (se esperaban 2 y 1)', v_activos, v_audit
      using errcode = 'assert_failure';
  end if;

  -- Alguien que no es del espacio no recibe permisos aquí.
  begin
    perform public.set_worker_specialties(v_space, 'f1500000-0000-0000-0000-000000000003', array['web']);
    raise exception 'set_worker_specialties FALLIDO: dio especialidades a alguien de fuera del espacio' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- Invitaciones: cancelar audita una vez; la segunda no hace nada.
  perform public.cancel_space_invitation('f1560000-0000-0000-0000-000000000001');
  perform public.cancel_space_invitation('f1560000-0000-0000-0000-000000000001');
  select count(*) into v_audit from public.audit_log
  where entity_id = 'f1560000-0000-0000-0000-000000000001' and action = 'invitation.cancelled';
  if v_audit <> 1 or (select status from public.space_invitations where id = 'f1560000-0000-0000-0000-000000000001') <> 'cancelled' then
    raise exception 'cancel_space_invitation FALLIDO: estado o auditoría incorrectos (% auditorías)', v_audit using errcode = 'assert_failure';
  end if;

  -- Una aceptada no se cancela.
  begin
    perform public.cancel_space_invitation('f1560000-0000-0000-0000-000000000002');
    raise exception 'cancel_space_invitation FALLIDO: canceló una invitación ya aceptada' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

rollback;

\echo 'Suite 71 · Los permisos del equipo: OK'
