-- ============================================================
-- Suite 92 · Equipo con PIN, tablet del local y soporte de Reservas
--            (Fase D de agents; migración 170; RN-APP-06 a RN-APP-09)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-APP-06 · el Equipo y su PIN: añadir, cambiar y quitar (desactivar) con permiso;
--     el PIN llega ya como HMAC y es único entre los activos del restaurante; añadir dos
--     veces con la misma clave no duplica; «Mi PIN» solo de un Propietario o Encargado, y
--     la base no devuelve ningún PIN a quien consulta.
--   · RN-APP-07 · 5 PIN erróneos bloquean el dispositivo 1 minuto; la segunda tanda, 5; la
--     tercera, 30; de la cuarta, 2 horas; un PIN bueno lo reinicia y a las 24 h sin fallos se
--     olvida; bloqueado, ni el PIN bueno entra.
--   · RN-APP-08 · la tablet: activarla es de un Propietario o Encargado; el servidor la
--     reconoce por el hash de su token; cada acción pide PIN y corre con los permisos de esa
--     persona; sin PIN solo se abre una ficha; los ajustes y el Equipo, solo con PIN de
--     Encargado o Propietario; nunca otro restaurante; al quitar a alguien o quitarle
--     «Gestionar Reservas» su PIN deja de valer en ese momento; desactivar el dispositivo lo
--     corta; las acciones quedan anotadas con quién fue (sin datos personales).
--   · RN-APP-09 · la sesión de soporte de Reservas: pide marca, segundo paso (`aal2`) y motivo;
--     abre la puerta a los datos de los comensales solo mientras dura; se cierra y caduca; las
--     acciones del soporte quedan etiquetadas con la sesión; el Historial del restaurante la
--     enseña como «Restavor (soporte)» sin el identificador de nadie del equipo (P7).
--   · Cierre · las funciones internas, cerradas por RPC; las del servidor, solo `service_role`.
--
-- La tablet no necesita la sesión personal de quien la activó: todo el bloque de la tablet se
-- ejecuta como `service_role` sin usuario, que es lo que hace el servidor.
--
-- Prefijo de esta suite: db000000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name)
values ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'Bosco')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('db000000-0000-0000-0000-000000000001', 'duena@suite92.test', 'authenticated', 'authenticated'),
  ('db000000-0000-0000-0000-000000000002', 'admin@suite92.test', 'authenticated', 'authenticated'),
  ('db000000-0000-0000-0000-000000000003', 'soporte@suite92.test', 'authenticated', 'authenticated'),
  ('db000000-0000-0000-0000-000000000004', 'propietario-a@suite92.test', 'authenticated', 'authenticated'),
  ('db000000-0000-0000-0000-000000000005', 'encargado-a@suite92.test', 'authenticated', 'authenticated'),
  ('db000000-0000-0000-0000-000000000006', 'editor-a@suite92.test', 'authenticated', 'authenticated'),
  ('db000000-0000-0000-0000-000000000007', 'propietario-b@suite92.test', 'authenticated', 'authenticated'),
  ('db000000-0000-0000-0000-000000000008', 'extrano@suite92.test', 'authenticated', 'authenticated'),
  ('db000000-0000-0000-0000-000000000009', 'trabajador@suite92.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('db000000-0000-0000-0000-000000000001', 'duena@suite92.test', 'Dueña 92'),
  ('db000000-0000-0000-0000-000000000002', 'admin@suite92.test', 'Admin 92'),
  ('db000000-0000-0000-0000-000000000003', 'soporte@suite92.test', 'Soporte 92'),
  ('db000000-0000-0000-0000-000000000004', 'propietario-a@suite92.test', 'Propietario A 92'),
  ('db000000-0000-0000-0000-000000000005', 'encargado-a@suite92.test', 'Encargado A 92'),
  ('db000000-0000-0000-0000-000000000006', 'editor-a@suite92.test', 'Editor A 92'),
  ('db000000-0000-0000-0000-000000000007', 'propietario-b@suite92.test', 'Propietario B 92'),
  ('db000000-0000-0000-0000-000000000008', 'extrano@suite92.test', 'Extraño 92'),
  ('db000000-0000-0000-0000-000000000009', 'trabajador@suite92.test', 'Trabajador 92')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by, reservations_enabled) values
  ('db000000-0000-0000-0000-000000000010', 'Espacio 92', 'espacio-92', 'Europe/Madrid',
   'db000000-0000-0000-0000-000000000001', false);

insert into public.space_memberships (space_id, user_id, role, status) values
  ('db000000-0000-0000-0000-000000000010', 'db000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('db000000-0000-0000-0000-000000000010', 'db000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('db000000-0000-0000-0000-000000000010', 'db000000-0000-0000-0000-000000000003', 'admin', 'active'),
  ('db000000-0000-0000-0000-000000000010', 'db000000-0000-0000-0000-000000000009', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('db000000-0000-0000-0000-000000000015', 'db000000-0000-0000-0000-000000000010', 'Grupo A 92'),
  ('db000000-0000-0000-0000-000000000016', 'db000000-0000-0000-0000-000000000010', 'Grupo B 92');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('db000000-0000-0000-0000-000000000020', 'db000000-0000-0000-0000-000000000010', 'db000000-0000-0000-0000-000000000015', 'R92A', 'Casa Pepe 92', 'active'),
  ('db000000-0000-0000-0000-000000000021', 'db000000-0000-0000-0000-000000000010', 'db000000-0000-0000-0000-000000000016', 'R92B', 'Bar La Plaza 92', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('db000000-0000-0000-0000-000000000040', 'db000000-0000-0000-0000-000000000020', 'db000000-0000-0000-0000-000000000004', 'local_owner'),
  ('db000000-0000-0000-0000-000000000041', 'db000000-0000-0000-0000-000000000020', 'db000000-0000-0000-0000-000000000005', 'editor'),
  ('db000000-0000-0000-0000-000000000042', 'db000000-0000-0000-0000-000000000020', 'db000000-0000-0000-0000-000000000006', 'editor'),
  ('db000000-0000-0000-0000-000000000043', 'db000000-0000-0000-0000-000000000021', 'db000000-0000-0000-0000-000000000007', 'local_owner');

insert into public.establishment_permissions (establishment_membership_id, manage_reservations) values
  ('db000000-0000-0000-0000-000000000041', true),
  ('db000000-0000-0000-0000-000000000042', false);

insert into public.reservation_settings (id, space_id, establishment_id, service_status, public_slug) values
  ('db000000-0000-0000-0000-000000000060', 'db000000-0000-0000-0000-000000000010', 'db000000-0000-0000-0000-000000000020', 'active', 'casa-pepe-92'),
  ('db000000-0000-0000-0000-000000000061', 'db000000-0000-0000-0000-000000000010', 'db000000-0000-0000-0000-000000000021', 'active', 'bar-la-plaza-92');

insert into public.reservation_shifts (id, space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity) values
  ('db000000-0000-0000-0000-000000000070', 'db000000-0000-0000-0000-000000000010', 'db000000-0000-0000-0000-000000000020', 'Cena', '{1,2,3,4,5,6,7}', '20:00', '23:30', '22:30', 60),
  ('db000000-0000-0000-0000-000000000071', 'db000000-0000-0000-0000-000000000010', 'db000000-0000-0000-0000-000000000021', 'Cena', '{1,2,3,4,5,6,7}', '20:00', '23:30', '22:30', 30);

-- Soporte de Reservas: 03 marcado; 02 (administrador) sin marcar.
update public.space_memberships set can_support_reservations = true
where space_id = 'db000000-0000-0000-0000-000000000010' and user_id = 'db000000-0000-0000-0000-000000000003';

-- ------------------------------------------------------------
-- Ayudantes del test
-- ------------------------------------------------------------
create function public.s92_as(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.aal', p_aal, true);
  execute 'set local role authenticated';
end $$;

-- Lo que hace el servidor: sin usuario, con la clave de servicio.
create function public.s92_server() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
  execute 'set local role service_role';
end $$;

-- El HMAC de un PIN, como lo calcula el servidor (aquí con otro secreto).
create function public.s92_pin(p_pin text) returns text
language sql immutable as $$ select encode(extensions.hmac(p_pin, 'secreto-suite-92', 'sha256'), 'hex') $$;

create function public.s92_tok(p_n integer) returns text
language sql immutable as $$ select encode(extensions.digest('token-suite-92-' || p_n::text, 'sha256'), 'hex') $$;

create function public.s92_expect_error(p_sql text, p_pattern text, p_what text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      return;
    end if;
    raise exception '% FALLIDO: falló, pero con otro mensaje: %', p_what, sqlerrm;
  end;
  raise exception '% FALLIDO: tenía que fallar y no falló', p_what;
end $$;

create function public.s92_is(p_actual jsonb, p_key text, p_expected text, p_what text) returns void
language plpgsql as $$
begin
  if (p_actual ->> p_key) is distinct from p_expected then
    raise exception '% FALLIDO: %=% (esperado %); resultado completo: %', p_what, p_key, p_actual ->> p_key, p_expected, p_actual;
  end if;
end $$;

-- Una acción de la tablet, como el servidor: token, PIN en HMAC, operación y argumentos.
create function public.s92_act(p_token text, p_pin text, p_op text, p_args jsonb default '{}'::jsonb) returns jsonb
language sql as $$
  select public.reservation_device_act(p_token, case when p_pin is null then null else public.s92_pin(p_pin) end, null, p_op, p_args)
$$;

create function public.s92_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;

grant execute on function
  public.s92_as(uuid, text), public.s92_server(), public.s92_pin(text), public.s92_tok(integer),
  public.s92_expect_error(text, text, text), public.s92_is(jsonb, text, text, text),
  public.s92_act(text, text, text, jsonb), public.s92_today()
to authenticated, service_role;

-- ------------------------------------------------------------
-- RN-APP-06 · el Equipo: añadir, idempotencia, PIN único, permisos
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v2 jsonb;
  v_ana uuid;
  v_n integer;
begin
  perform public.s92_as('db000000-0000-0000-0000-000000000004');

  v := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Ana Ruiz', public.s92_pin('1234'), 'alta-ana');
  perform public.s92_is(v, 'outcome', 'created', 'RN-APP-06 añadir');
  v_ana := (v ->> 'id')::uuid;

  -- Pulsar dos veces: la misma clave devuelve la misma persona, no crea otra.
  v2 := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Ana Ruiz', public.s92_pin('1234'), 'alta-ana');
  perform public.s92_is(v2, 'outcome', 'created', 'RN-APP-06 idempotencia');
  if (v2 ->> 'id')::uuid <> v_ana then
    raise exception 'RN-APP-06 FALLIDO: la misma clave creó otra persona';
  end if;

  -- El PIN es único entre los activos del restaurante.
  v := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Otra Persona', public.s92_pin('1234'), 'alta-otra');
  perform public.s92_is(v, 'outcome', 'pin_in_use', 'RN-APP-06 PIN repetido');

  -- Pero el mismo PIN en OTRO restaurante no choca.
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  v := public.add_reservation_staff('db000000-0000-0000-0000-000000000021', 'Ana en B', public.s92_pin('1234'), 'alta-ana-b');
  perform public.s92_is(v, 'outcome', 'created', 'RN-APP-06 el mismo PIN en otro restaurante');

  -- El Encargado también gestiona el Equipo (tabla §3.2).
  perform public.s92_as('db000000-0000-0000-0000-000000000005');
  v := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Diego Navas', public.s92_pin('5678'), 'alta-diego');
  perform public.s92_is(v, 'outcome', 'created', 'RN-APP-06 el Encargado añade');

  -- El equipo del espacio (Restavor) también lo gestiona.
  perform public.s92_as('db000000-0000-0000-0000-000000000002');
  v := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Luz Soto', public.s92_pin('9012'), 'alta-luz');
  perform public.s92_is(v, 'outcome', 'created', 'RN-APP-06 Restavor añade');

  set local role postgres;
  select count(*) into v_n from public.reservation_staff where establishment_id = 'db000000-0000-0000-0000-000000000020' and kind = 'staff';
  if v_n <> 3 then
    raise exception 'RN-APP-06 FALLIDO: hay % personas del Equipo y tenían que ser 3', v_n;
  end if;
  -- La auditoría anota cada alta con quién fue, sin PIN.
  if (select count(*) from public.audit_log where action = 'reservations.staff_added' and entity_id = 'db000000-0000-0000-0000-000000000020') <> 3 then
    raise exception 'RN-APP-06 FALLIDO: faltan apuntes de auditoría del alta (la repetida no debe duplicarlos)';
  end if;
  if exists (select 1 from public.audit_log where action like 'reservations.%' and (new_value::text like '%' || public.s92_pin('1234') || '%')) then
    raise exception 'RN-APP-06 FALLIDO: la auditoría guarda un PIN';
  end if;
end $$;

do $$
begin
  -- Quien no tiene permiso, no: el Editor sin «Gestionar Reservas», el extraño, el trabajador, el dueño de otro restaurante.
  perform public.s92_as('db000000-0000-0000-0000-000000000006');
  perform public.s92_expect_error($q$select public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'X', public.s92_pin('1111'), null)$q$,
    'no tienes permiso', 'RN-APP-06 el Editor sin Gestionar Reservas no añade');
  perform public.s92_as('db000000-0000-0000-0000-000000000008');
  perform public.s92_expect_error($q$select public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'X', public.s92_pin('1111'), null)$q$,
    'no tienes permiso', 'RN-APP-06 un extraño no añade');
  perform public.s92_as('db000000-0000-0000-0000-000000000009');
  perform public.s92_expect_error($q$select public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'X', public.s92_pin('1111'), null)$q$,
    'no tienes permiso', 'RN-APP-06 un trabajador del espacio no añade');
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  perform public.s92_expect_error($q$select public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'X', public.s92_pin('1111'), null)$q$,
    'no tienes permiso', 'RN-APP-06 el dueño de otro restaurante no añade');
  -- Sin sesión (anon): ni siquiera ejecuta la función.
  set local role anon;
  perform public.s92_expect_error($q$select public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'X', public.s92_pin('1111'), null)$q$,
    'permission denied', 'RN-APP-06 anon no añade');
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  -- Validaciones: nombre, PIN con forma de HMAC.
  perform public.s92_expect_error($q$select public.add_reservation_staff('db000000-0000-0000-0000-000000000020', '   ', public.s92_pin('1111'), null)$q$,
    'falta el nombre', 'RN-APP-06 sin nombre');
  perform public.s92_expect_error($q$select public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'X', '1234', null)$q$,
    'pin no válido', 'RN-APP-06 un PIN en claro no entra');
  perform public.s92_expect_error($q$select public.add_reservation_staff('db000000-0000-0000-0000-000000000020', repeat('x', 81), public.s92_pin('1111'), null)$q$,
    'demasiado largo', 'RN-APP-06 nombre largo');
end $$;

-- La base no devuelve ningún PIN a quien consulta, y cada restaurante ve a los suyos.
do $$
declare
  v_n integer;
begin
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  perform public.s92_expect_error($q$select pin_hmac from public.reservation_staff$q$, 'permission denied', 'RN-APP-06 el PIN no sale ni al Propietario');
  perform public.s92_expect_error($q$select idempotency_key from public.reservation_staff$q$, 'permission denied', 'RN-APP-06 la clave no sale');
  perform public.s92_expect_error($q$select * from public.reservation_staff$q$, 'permission denied', 'RN-APP-06 select * devuelve 403, como dice CLAUDE.md');
  select count(*) into v_n from public.reservation_staff where kind = 'staff';
  if v_n <> 3 then
    raise exception 'RN-APP-06 FALLIDO: el Propietario de A ve % personas del Equipo y son 3', v_n;
  end if;
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  select count(*) into v_n from public.reservation_staff where establishment_id = 'db000000-0000-0000-0000-000000000020';
  if v_n <> 0 then
    raise exception 'RN-APP-06 FALLIDO: el dueño de otro restaurante lee % personas del Equipo de A', v_n;
  end if;
  perform public.s92_as('db000000-0000-0000-0000-000000000006');
  select count(*) into v_n from public.reservation_staff where establishment_id = 'db000000-0000-0000-0000-000000000020';
  if v_n <> 0 then
    raise exception 'RN-APP-06 FALLIDO: el Editor sin Gestionar Reservas lee el Equipo';
  end if;
  perform public.s92_as('db000000-0000-0000-0000-000000000009');
  select count(*) into v_n from public.reservation_staff where establishment_id = 'db000000-0000-0000-0000-000000000020';
  if v_n <> 0 then
    raise exception 'RN-APP-06 FALLIDO: un trabajador del espacio lee el Equipo';
  end if;
  -- Ninguna escritura directa.
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  perform public.s92_expect_error($q$update public.reservation_staff set active = false$q$, 'permission denied', 'RN-APP-06 sin UPDATE directo');
  perform public.s92_expect_error($q$delete from public.reservation_staff$q$, 'permission denied', 'RN-APP-06 sin DELETE directo');
end $$;

-- Cambiar el PIN y quitar a alguien (se desactiva: no se borra).
do $$
declare
  v jsonb;
  v_ana uuid;
  v_diego uuid;
  v_n integer;
begin
  set local role postgres;
  select id into v_ana from public.reservation_staff where name = 'Ana Ruiz' and establishment_id = 'db000000-0000-0000-0000-000000000020';
  select id into v_diego from public.reservation_staff where name = 'Diego Navas' and establishment_id = 'db000000-0000-0000-0000-000000000020';

  perform public.s92_as('db000000-0000-0000-0000-000000000005');
  v := public.set_reservation_staff_pin('db000000-0000-0000-0000-000000000020', v_ana, public.s92_pin('4321'));
  perform public.s92_is(v, 'outcome', 'done', 'RN-APP-06 cambiar PIN');
  v := public.set_reservation_staff_pin('db000000-0000-0000-0000-000000000020', v_ana, public.s92_pin('4321'));
  perform public.s92_is(v, 'outcome', 'unchanged', 'RN-APP-06 el mismo PIN no cambia nada');
  v := public.set_reservation_staff_pin('db000000-0000-0000-0000-000000000020', v_ana, public.s92_pin('5678'));
  perform public.s92_is(v, 'outcome', 'pin_in_use', 'RN-APP-06 cambiar a un PIN en uso');
  -- Ana vuelve a su 1234 de siempre para lo que sigue.
  v := public.set_reservation_staff_pin('db000000-0000-0000-0000-000000000020', v_ana, public.s92_pin('1234'));
  perform public.s92_is(v, 'outcome', 'done', 'RN-APP-06 cambiar PIN de vuelta');
  -- Una persona de otro restaurante no se toca desde este.
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  perform public.s92_expect_error(format($q$select public.set_reservation_staff_pin('db000000-0000-0000-0000-000000000021', %L, %L)$q$, v_ana, public.s92_pin('0000')),
    'no está en el equipo', 'RN-APP-06 no se cambia el PIN de otro restaurante');
  perform public.s92_expect_error(format($q$select public.remove_reservation_staff('db000000-0000-0000-0000-000000000021', %L)$q$, v_ana),
    'no está en el equipo', 'RN-APP-06 no se quita a alguien de otro restaurante');

  -- Quitar: desactiva, libera el PIN, conserva la fila; repetir no hace nada.
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  v := public.remove_reservation_staff('db000000-0000-0000-0000-000000000020', v_diego);
  perform public.s92_is(v, 'outcome', 'done', 'RN-APP-06 quitar');
  v := public.remove_reservation_staff('db000000-0000-0000-0000-000000000020', v_diego);
  perform public.s92_is(v, 'outcome', 'unchanged', 'RN-APP-06 quitar dos veces');
  set local role postgres;
  if not exists (select 1 from public.reservation_staff where id = v_diego and not active and deactivated_at is not null and pin_hmac is null) then
    raise exception 'RN-APP-06 FALLIDO: quitar no desactivó y liberó el PIN (la fila se conserva)';
  end if;
  select count(*) into v_n from public.audit_log where action = 'reservations.staff_removed' and entity_id = 'db000000-0000-0000-0000-000000000020';
  if v_n <> 1 then
    raise exception 'RN-APP-06 FALLIDO: quitar dejó % apuntes y tenía que dejar 1', v_n;
  end if;
  -- El PIN liberado se puede reutilizar.
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  v := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Diego Navas (otra vez)', public.s92_pin('5678'), 'alta-diego-2');
  perform public.s92_is(v, 'outcome', 'created', 'RN-APP-06 un PIN liberado se reutiliza');
end $$;

-- «Mi PIN»: solo un Propietario o un Encargado, y no puede repetir el de otra persona.
do $$
declare
  v jsonb;
  v_n integer;
begin
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  v := public.set_my_reservation_pin('db000000-0000-0000-0000-000000000020', public.s92_pin('2468'));
  perform public.s92_is(v, 'outcome', 'done', 'RN-APP-06 Mi PIN del Propietario');
  v := public.set_my_reservation_pin('db000000-0000-0000-0000-000000000020', public.s92_pin('2468'));
  perform public.s92_is(v, 'outcome', 'unchanged', 'RN-APP-06 Mi PIN repetido');
  v := public.set_my_reservation_pin('db000000-0000-0000-0000-000000000020', public.s92_pin('1234'));
  perform public.s92_is(v, 'outcome', 'pin_in_use', 'RN-APP-06 Mi PIN no repite el de otra persona');

  perform public.s92_as('db000000-0000-0000-0000-000000000005');
  v := public.set_my_reservation_pin('db000000-0000-0000-0000-000000000020', public.s92_pin('1357'));
  perform public.s92_is(v, 'outcome', 'done', 'RN-APP-06 Mi PIN del Encargado');

  perform public.s92_as('db000000-0000-0000-0000-000000000006');
  perform public.s92_expect_error($q$select public.set_my_reservation_pin('db000000-0000-0000-0000-000000000020', public.s92_pin('7777'))$q$,
    'solo un propietario o un encargado', 'RN-APP-06 el Editor sin Gestionar Reservas no tiene PIN');
  perform public.s92_as('db000000-0000-0000-0000-000000000002');
  perform public.s92_expect_error($q$select public.set_my_reservation_pin('db000000-0000-0000-0000-000000000020', public.s92_pin('7777'))$q$,
    'solo un propietario o un encargado', 'RN-APP-06 el equipo de Restavor no tiene PIN en un restaurante ajeno');
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  perform public.s92_expect_error($q$select public.set_my_reservation_pin('db000000-0000-0000-0000-000000000020', public.s92_pin('7777'))$q$,
    'solo un propietario o un encargado', 'RN-APP-06 el dueño de otro restaurante no tiene PIN aquí');

  set local role postgres;
  select count(*) into v_n from public.reservation_staff where kind = 'member' and establishment_id = 'db000000-0000-0000-0000-000000000020';
  if v_n <> 2 then
    raise exception 'RN-APP-06 FALLIDO: hay % PIN de miembros y tenían que ser 2', v_n;
  end if;
end $$;

-- La lista de personas: Propietarios y Encargados con cuenta y el Equipo sin ella, sin PIN ni correo.
do $$
declare
  v_n integer;
begin
  perform public.s92_as('db000000-0000-0000-0000-000000000005');
  select count(*) into v_n from public.reservation_people('db000000-0000-0000-0000-000000000020');
  -- Propietario A, Encargado A + Ana, Luz, Diego (otra vez) = 5.
  if v_n <> 5 then
    raise exception 'RN-APP-06 FALLIDO: la lista trae % personas y eran 5', v_n;
  end if;
  if exists (select 1 from public.reservation_people('db000000-0000-0000-0000-000000000020') where name = 'Editor A 92') then
    raise exception 'RN-APP-06 FALLIDO: un Editor sin «Gestionar Reservas» sale en la lista';
  end if;
  if (select role from public.reservation_people('db000000-0000-0000-0000-000000000020') where name = 'Propietario A 92') is distinct from 'owner'
     or (select role from public.reservation_people('db000000-0000-0000-0000-000000000020') where name = 'Encargado A 92') is distinct from 'manager'
     or (select role from public.reservation_people('db000000-0000-0000-0000-000000000020') where name = 'Ana Ruiz') is distinct from 'staff' then
    raise exception 'RN-APP-06 FALLIDO: los roles de la lista no son los de cada persona';
  end if;
  perform public.s92_as('db000000-0000-0000-0000-000000000008');
  perform public.s92_expect_error($q$select * from public.reservation_people('db000000-0000-0000-0000-000000000020')$q$,
    'no tienes permiso', 'RN-APP-06 un extraño no ve la lista');
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  perform public.s92_expect_error($q$select * from public.reservation_people('db000000-0000-0000-0000-000000000020')$q$,
    'no tienes permiso', 'RN-APP-06 el dueño de otro restaurante no ve la lista');
end $$;

-- ------------------------------------------------------------
-- RN-APP-08 · activar, reconocer y desactivar el dispositivo
-- ------------------------------------------------------------
do $$
declare
  v_dev uuid;
  v jsonb;
  v_n integer;
begin
  -- Solo un Propietario o un Encargado activa (el token se pone en SU navegador).
  perform public.s92_as('db000000-0000-0000-0000-000000000006');
  perform public.s92_expect_error(format($q$select public.activate_reservation_device('db000000-0000-0000-0000-000000000020', 'Tablet', %L)$q$, public.s92_tok(1)),
    'solo un propietario o un encargado', 'RN-APP-08 el Editor sin Gestionar Reservas no activa');
  perform public.s92_as('db000000-0000-0000-0000-000000000002');
  perform public.s92_expect_error(format($q$select public.activate_reservation_device('db000000-0000-0000-0000-000000000020', 'Tablet', %L)$q$, public.s92_tok(1)),
    'solo un propietario o un encargado', 'RN-APP-08 el equipo de Restavor no activa un dispositivo del local');
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  perform public.s92_expect_error(format($q$select public.activate_reservation_device('db000000-0000-0000-0000-000000000020', 'Tablet', %L)$q$, public.s92_tok(1)),
    'solo un propietario o un encargado', 'RN-APP-08 el dueño de otro restaurante no activa');
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  perform public.s92_expect_error($q$select public.activate_reservation_device('db000000-0000-0000-0000-000000000020', 'Tablet', 'no-es-un-hash')$q$,
    'token no válido', 'RN-APP-08 el token llega ya con hash');
  perform public.s92_expect_error(format($q$select public.activate_reservation_device('db000000-0000-0000-0000-000000000020', '  ', %L)$q$, public.s92_tok(1)),
    'falta el nombre', 'RN-APP-08 sin nombre');

  v_dev := public.activate_reservation_device('db000000-0000-0000-0000-000000000020', 'Tablet de la barra', public.s92_tok(1));
  if v_dev is null then
    raise exception 'RN-APP-08 FALLIDO: activar no devolvió el dispositivo';
  end if;
  perform public.s92_as('db000000-0000-0000-0000-000000000005');
  perform public.activate_reservation_device('db000000-0000-0000-0000-000000000020', 'Móvil de la cocina', public.s92_tok(2));

  -- El servidor reconoce la tablet por el hash de su token; un token inventado, no.
  perform public.s92_server();
  v := public.reservation_device_resolve(public.s92_tok(1));
  perform public.s92_is(v, 'outcome', 'ok', 'RN-APP-08 reconoce el dispositivo');
  perform public.s92_is(v, 'establishment_id', 'db000000-0000-0000-0000-000000000020', 'RN-APP-08 es de su restaurante');
  v := public.reservation_device_resolve(public.s92_tok(99));
  perform public.s92_is(v, 'outcome', 'no_device', 'RN-APP-08 un token inventado no es un dispositivo');
  v := public.reservation_device_resolve('x');
  perform public.s92_is(v, 'outcome', 'no_device', 'RN-APP-08 un token mal formado no es un dispositivo');

  -- Quien consulta ve los dispositivos de su restaurante, sin el hash ni quién lo activó.
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  select count(*) into v_n from public.reservation_devices;
  if v_n <> 2 then
    raise exception 'RN-APP-08 FALLIDO: el Propietario ve % dispositivos y son 2', v_n;
  end if;
  perform public.s92_expect_error($q$select token_hash from public.reservation_devices$q$, 'permission denied', 'RN-APP-08 el hash del token no sale');
  perform public.s92_expect_error($q$select activated_by from public.reservation_devices$q$, 'permission denied', 'RN-APP-08 quién lo activó no sale');
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  select count(*) into v_n from public.reservation_devices where establishment_id = 'db000000-0000-0000-0000-000000000020';
  if v_n <> 0 then
    raise exception 'RN-APP-08 FALLIDO: el dueño de otro restaurante ve los dispositivos de A';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-APP-07 · el bloqueo de PIN y su escalado
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_secs numeric;
  v_dev uuid;
  i integer;
begin
  perform public.s92_server();
  -- Cuatro PIN malos avisan de los que quedan; el bueno reinicia la cuenta.
  for i in 1..4 loop
    v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('0000'));
    perform public.s92_is(v, 'outcome', 'wrong', 'RN-APP-07 PIN erróneo ' || i);
    perform public.s92_is(v, 'remaining', (5 - i)::text, 'RN-APP-07 intentos que quedan');
  end loop;
  v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('1234'));
  perform public.s92_is(v, 'outcome', 'ok', 'RN-APP-07 el PIN bueno entra');
  perform public.s92_is(v, 'role', 'staff', 'RN-APP-07 Ana es del Equipo');
  perform public.s92_is(v, 'name', 'Ana Ruiz', 'RN-APP-07 la saluda por su nombre');
  -- La cuenta empezó de nuevo: otros 4 malos no bloquean.
  for i in 1..4 loop
    v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('0000'));
    perform public.s92_is(v, 'outcome', 'wrong', 'RN-APP-07 tras un acierto la cuenta se reinicia');
  end loop;

  -- El quinto bloquea 1 minuto.
  v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('0000'));
  perform public.s92_is(v, 'outcome', 'locked', 'RN-APP-07 5 PIN erróneos bloquean');
  set local role postgres;
  select extract(epoch from (locked_until - now())) into v_secs from public.reservation_pin_attempts where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
  if v_secs not between 55 and 61 then
    raise exception 'RN-APP-07 FALLIDO: el primer bloqueo dura % s y tenía que durar 60', v_secs;
  end if;
  perform public.s92_server();
  -- Bloqueada, ni el PIN bueno entra.
  v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('1234'));
  perform public.s92_is(v, 'outcome', 'locked', 'RN-APP-07 bloqueada, ni el PIN bueno entra');
  -- Y tampoco una acción con el PIN bueno.
  v := public.s92_act(public.s92_tok(1), '1234', 'confirm', jsonb_build_object('reservation_id', gen_random_uuid()));
  perform public.s92_is(v, 'outcome', 'locked', 'RN-APP-07 bloqueada, ninguna acción pasa');
  -- El otro dispositivo no queda bloqueado: es por dispositivo.
  v := public.reservation_device_identify(public.s92_tok(2), public.s92_pin('1234'));
  perform public.s92_is(v, 'outcome', 'ok', 'RN-APP-07 el bloqueo es por dispositivo');

  -- Segunda tanda: 5 minutos. (Se simula que pasó el minuto.)
  set local role postgres;
  update public.reservation_pin_attempts set locked_until = now() - interval '1 second' where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
  perform public.s92_server();
  for i in 1..5 loop
    v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('0000'));
  end loop;
  perform public.s92_is(v, 'outcome', 'locked', 'RN-APP-07 segunda tanda');
  set local role postgres;
  select extract(epoch from (locked_until - now())) into v_secs from public.reservation_pin_attempts where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
  if v_secs not between 295 and 301 then
    raise exception 'RN-APP-07 FALLIDO: el segundo bloqueo dura % s y tenía que durar 300', v_secs;
  end if;

  -- Tercera: 30 minutos. Cuarta y siguientes: 2 horas.
  update public.reservation_pin_attempts set locked_until = now() - interval '1 second' where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
  perform public.s92_server();
  for i in 1..5 loop
    v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('0000'));
  end loop;
  set local role postgres;
  select extract(epoch from (locked_until - now())) into v_secs from public.reservation_pin_attempts where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
  if v_secs not between 1795 and 1801 then
    raise exception 'RN-APP-07 FALLIDO: el tercer bloqueo dura % s y tenía que durar 1800', v_secs;
  end if;
  update public.reservation_pin_attempts set locked_until = now() - interval '1 second' where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
  perform public.s92_server();
  for i in 1..5 loop
    v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('0000'));
  end loop;
  set local role postgres;
  select extract(epoch from (locked_until - now())) into v_secs from public.reservation_pin_attempts where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
  if v_secs not between 7195 and 7201 then
    raise exception 'RN-APP-07 FALLIDO: el cuarto bloqueo dura % s y tenía que durar 7200', v_secs;
  end if;
  update public.reservation_pin_attempts set locked_until = now() - interval '1 second' where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
  perform public.s92_server();
  for i in 1..5 loop
    v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('0000'));
  end loop;
  set local role postgres;
  select extract(epoch from (locked_until - now())) into v_secs from public.reservation_pin_attempts where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
  if v_secs not between 7195 and 7201 then
    raise exception 'RN-APP-07 FALLIDO: del cuarto en adelante sigue siendo 2 horas, y dura % s', v_secs;
  end if;
  -- Cada bloqueo deja su apunte de auditoría, que la base de datos del restaurante enseña en el Historial.
  if (select count(*) from public.audit_log where action = 'reservations.pin_locked' and entity_id = 'db000000-0000-0000-0000-000000000020') <> 5 then
    raise exception 'RN-APP-07 FALLIDO: hay % apuntes de bloqueo y eran 5', (select count(*) from public.audit_log where action = 'reservations.pin_locked' and entity_id = 'db000000-0000-0000-0000-000000000020');
  end if;

  -- Un PIN bueno tras el bloqueo reinicia las tandas; a las 24 h sin fallos también se olvidan.
  update public.reservation_pin_attempts set locked_until = now() - interval '1 second' where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
  perform public.s92_server();
  v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('1234'));
  perform public.s92_is(v, 'outcome', 'ok', 'RN-APP-07 pasado el bloqueo, el PIN bueno entra');
  set local role postgres;
  if (select lock_rounds from public.reservation_pin_attempts where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1))) <> 0 then
    raise exception 'RN-APP-07 FALLIDO: un acierto no reinicia las tandas';
  end if;
  update public.reservation_pin_attempts set lock_rounds = 3, failed_count = 4, last_failed_at = now() - interval '25 hours' where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
  perform public.s92_server();
  v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('0000'));
  perform public.s92_is(v, 'outcome', 'wrong', 'RN-APP-07 tras 24 h sin fallos, un fallo no bloquea');
  perform public.s92_is(v, 'remaining', '4', 'RN-APP-07 tras 24 h sin fallos, se empieza de nuevo');
  set local role postgres;
  if (select lock_rounds from public.reservation_pin_attempts where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1))) <> 0 then
    raise exception 'RN-APP-07 FALLIDO: a las 24 h sin fallos no se olvidan las tandas';
  end if;
  -- El PIN en claro no entra: solo HMAC.
  perform public.s92_server();
  perform public.s92_expect_error($q$select public.reservation_device_identify(public.s92_tok(1), '1234')$q$, 'pin no válido', 'RN-APP-07 un PIN en claro no entra');
  update public.reservation_pin_attempts set failed_count = 0, locked_until = null, last_failed_at = null, lock_rounds = 0 where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
end $$;

-- ------------------------------------------------------------
-- RN-APP-08 · la tablet actúa con los permisos de quien pone el PIN
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_id uuid;
  v_d date := public.s92_today() + 10;
  v_staff uuid;
begin
  perform public.s92_server();

  -- Sin PIN no se crea nada.
  v := public.s92_act(public.s92_tok(1), null, 'book', jsonb_build_object('date', v_d, 'time', '21:00', 'party_size', 2, 'customer_name', 'Sin PIN', 'phone_e164', '+34600000001'));
  perform public.s92_is(v, 'outcome', 'forbidden', 'RN-APP-08 sin PIN no se crea');

  -- Con el PIN de Ana (Equipo): se crea, y queda anotada ella.
  v := public.s92_act(public.s92_tok(1), '1234', 'book',
    jsonb_build_object('date', v_d, 'time', '21:00', 'party_size', 4, 'customer_name', 'Lucía Fernández', 'phone_e164', '+34612345678', 'idempotency_key', 'tablet-1'));
  perform public.s92_is(v, 'outcome', 'acted', 'RN-APP-08 con PIN se crea');
  perform public.s92_is(v, 'actor_role', 'staff', 'RN-APP-08 la crea el Equipo');
  perform public.s92_is(v, 'actor_name', 'Ana Ruiz', 'RN-APP-08 con el nombre de Ana');
  perform public.s92_is(v -> 'result', 'outcome', 'accepted', 'RN-APP-08 la agenda la acepta');
  v_id := (v -> 'result' ->> 'reservation_id')::uuid;

  -- Pulsar dos veces con la misma clave: no duplica.
  v := public.s92_act(public.s92_tok(1), '1234', 'book',
    jsonb_build_object('date', v_d, 'time', '21:00', 'party_size', 4, 'customer_name', 'Lucía Fernández', 'phone_e164', '+34612345678', 'idempotency_key', 'tablet-1'));
  perform public.s92_is(v -> 'result', 'replayed', 'true', 'RN-APP-08 idempotencia desde la tablet');
  if (select count(*) from public.reservations where idempotency_key = 'tablet-1') <> 1 then
    raise exception 'RN-APP-08 FALLIDO: pulsar dos veces creó dos reservas';
  end if;

  set local role postgres;
  select id into v_staff from public.reservation_staff where name = 'Ana Ruiz' and establishment_id = 'db000000-0000-0000-0000-000000000020';
  if not exists (select 1 from public.reservations where id = v_id and created_by_staff_id = v_staff and created_by_user_id is null and source = 'manual') then
    raise exception 'RN-APP-08 FALLIDO: la reserva no lleva quién del Equipo la creó (o no es manual)';
  end if;
  if not exists (select 1 from public.reservation_events where reservation_id = v_id and type = 'created' and actor_type = 'staff'
                   and actor_staff_id = v_staff and actor_user_id is null and actor_label is null) then
    raise exception 'RN-APP-08 FALLIDO: el evento no anota al Equipo por su identificador';
  end if;
  if not exists (select 1 from public.audit_log where entity_id = v_id and action = 'reservations.booking_created'
                   and actor_id is null and (new_value ->> 'by_staff_id')::uuid = v_staff) then
    raise exception 'RN-APP-08 FALLIDO: la auditoría no anota al Equipo';
  end if;
  -- Ni el evento ni la auditoría guardan datos personales de comensales (RN-RES-12).
  if exists (select 1 from public.reservation_events where reservation_id = v_id and data::text ~* 'Lucía|612345678')
     or exists (select 1 from public.audit_log where entity_id = v_id and (new_value::text ~* 'Lucía|612345678' or old_value::text ~* 'Lucía|612345678')) then
    raise exception 'RN-RES-12 FALLIDO: un evento o la auditoría guardan datos del comensal';
  end if;
  -- El ajuste del Equipo no se queda puesto al terminar.
  perform public.s92_server();
  if coalesce(current_setting('restavor.device_staff', true), '') <> '' then
    raise exception 'RN-APP-08 FALLIDO: el ajuste del Equipo se quedó puesto tras la acción';
  end if;
end $$;

-- Lo que el Equipo puede y no puede, y que cada operación corre con el rol de quien pone el PIN.
do $$
declare
  v jsonb;
  v_id uuid;
  v_d date := public.s92_today() + 10;
begin
  perform public.s92_server();
  select id into v_id from public.reservations where idempotency_key = 'tablet-1';

  -- Sin PIN solo se abre la ficha (y se anota como el sistema, no como una persona).
  v := public.s92_act(public.s92_tok(1), null, 'open', jsonb_build_object('reservation_id', v_id));
  perform public.s92_is(v, 'outcome', 'acted', 'RN-APP-08 sin PIN se abre la ficha');
  v := public.s92_act(public.s92_tok(1), null, 'cancel', jsonb_build_object('reservation_id', v_id));
  perform public.s92_is(v, 'outcome', 'forbidden', 'RN-APP-08 sin PIN no se cancela');
  v := public.s92_act(public.s92_tok(1), null, 'no_show', jsonb_build_object('reservation_id', v_id));
  perform public.s92_is(v, 'outcome', 'forbidden', 'RN-APP-08 sin PIN no se marca «No vino»');

  -- El Equipo: cancela (con su nombre en el historial), pero no toca ajustes ni Equipo.
  v := public.s92_act(public.s92_tok(1), '1234', 'cancel', jsonb_build_object('reservation_id', v_id, 'reason', 'customer'));
  perform public.s92_is(v, 'outcome', 'acted', 'RN-APP-08 el Equipo cancela');
  perform public.s92_is(v -> 'result', 'outcome', 'done', 'RN-APP-08 cancelada');
  v := public.s92_act(public.s92_tok(1), '1234', 'save_settings',
    jsonb_build_object('slot_interval_minutes', 15, 'large_group_threshold', 9, 'min_notice_minutes', 0, 'max_advance_days', 60, 'customer_cancel_limit_minutes', 120));
  perform public.s92_is(v, 'outcome', 'forbidden', 'RN-APP-08 el Equipo no cambia ajustes');
  v := public.s92_act(public.s92_tok(1), '1234', 'save_shifts', jsonb_build_object('shifts', '[]'::jsonb));
  perform public.s92_is(v, 'outcome', 'forbidden', 'RN-APP-08 el Equipo no cambia turnos');
  v := public.s92_act(public.s92_tok(1), '1234', 'staff_add', jsonb_build_object('name', 'Intruso', 'pin_hmac', public.s92_pin('3333')));
  perform public.s92_is(v, 'outcome', 'forbidden', 'RN-APP-08 el Equipo no añade Equipo');
  v := public.s92_act(public.s92_tok(1), '1234', 'device_revoke', jsonb_build_object('device_id', gen_random_uuid()));
  perform public.s92_is(v, 'outcome', 'forbidden', 'RN-APP-08 el Equipo no desactiva dispositivos');
  perform public.s92_expect_error($q$select public.s92_act(public.s92_tok(1), '1234', 'drop_everything')$q$,
    'operación no permitida', 'RN-APP-08 una operación desconocida no existe');

  -- Con el PIN del Encargado: ajustes y Equipo sí, y corre como esa persona.
  v := public.s92_act(public.s92_tok(1), '1357', 'save_settings',
    jsonb_build_object('slot_interval_minutes', 15, 'large_group_threshold', 9, 'min_notice_minutes', 0, 'max_advance_days', 60, 'customer_cancel_limit_minutes', 120));
  perform public.s92_is(v, 'outcome', 'acted', 'RN-APP-08 el Encargado cambia ajustes desde la tablet');
  perform public.s92_is(v, 'actor_role', 'manager', 'RN-APP-08 es el Encargado');
  set local role postgres;
  if not exists (select 1 from public.audit_log where action = 'reservations.settings_saved'
                   and actor_id = 'db000000-0000-0000-0000-000000000005' and entity_id = 'db000000-0000-0000-0000-000000000020') then
    raise exception 'RN-APP-08 FALLIDO: el cambio de ajustes con PIN no queda a nombre del Encargado';
  end if;
  perform public.s92_server();
  v := public.s92_act(public.s92_tok(1), '1357', 'staff_add', jsonb_build_object('name', 'Marta Gil', 'pin_hmac', public.s92_pin('3030'), 'idempotency_key', 'tablet-marta'));
  perform public.s92_is(v, 'outcome', 'acted', 'RN-APP-08 el Encargado añade Equipo desde la tablet');
  perform public.s92_is(v -> 'result', 'outcome', 'created', 'RN-APP-08 Marta creada');
  -- Las dos lecturas de Ajustes por la tablet: la lista de personas y el Historial, solo con el PIN de un Encargado o un Propietario.
  v := public.s92_act(public.s92_tok(1), '1234', 'people');
  perform public.s92_is(v, 'outcome', 'forbidden', 'RN-APP-08 el Equipo no lee la lista de personas');
  v := public.s92_act(public.s92_tok(1), '1234', 'history_log');
  perform public.s92_is(v, 'outcome', 'forbidden', 'RN-APP-08 el Equipo no lee el Historial');
  v := public.s92_act(public.s92_tok(1), '1357', 'people');
  perform public.s92_is(v, 'outcome', 'acted', 'RN-APP-08 el Encargado lee la lista desde la tablet');
  if jsonb_typeof(v -> 'result') <> 'array' or not (v -> 'result') @> '[{"name": "Ana Ruiz", "role": "staff"}]'::jsonb then
    raise exception 'RN-APP-08 FALLIDO: la lista de personas por la tablet no trae a Ana Ruiz del Equipo: %', v;
  end if;
  v := public.s92_act(public.s92_tok(1), '2468', 'history_log', jsonb_build_object('limit', 20));
  perform public.s92_is(v, 'outcome', 'acted', 'RN-APP-08 el Propietario lee el Historial desde la tablet');
  if jsonb_typeof(v -> 'result') <> 'array' or jsonb_array_length(v -> 'result') = 0 then
    raise exception 'RN-APP-08 FALLIDO: el Historial por la tablet viene vacío: %', v;
  end if;
  -- Con el PIN del Propietario: puede lo mismo, y su sesión vuelve a ser la del servidor al terminar.
  v := public.s92_act(public.s92_tok(1), '2468', 'set_closed_date', jsonb_build_object('date', v_d + 20, 'reason', 'Obras', 'closed', true));
  perform public.s92_is(v, 'outcome', 'acted', 'RN-APP-08 el Propietario cierra un día desde la tablet');
  if auth.uid() is not null then
    raise exception 'RN-APP-08 FALLIDO: tras la acción de un Propietario la sesión sigue siendo la suya';
  end if;
  -- Un fallo de la agenda llega tal cual (aquí, una reserva que no existe).
  perform public.s92_expect_error(format($q$select public.s92_act(public.s92_tok(1), '1234', 'confirm', jsonb_build_object('reservation_id', %L))$q$, gen_random_uuid()),
    'reserva no encontrada', 'RN-APP-08 una reserva que no existe');
end $$;

-- Una tablet solo toca su restaurante.
do $$
declare
  v_b uuid;
  v_est_b uuid := 'db000000-0000-0000-0000-000000000021';
begin
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  v_b := ((public.book_reservation(v_est_b, null, public.s92_today() + 11, '21:00', 2, 'Cliente de B', '+34600000099', null, null, 'es', 'manual', false, 'b-1', false, null)) ->> 'reservation_id')::uuid;
  perform public.s92_server();
  perform public.s92_expect_error(format($q$select public.s92_act(public.s92_tok(1), '1234', 'confirm', jsonb_build_object('reservation_id', %L))$q$, v_b),
    'reserva no encontrada', 'RN-APP-08 la tablet de A no toca una reserva de B');
  perform public.s92_expect_error(format($q$select public.s92_act(public.s92_tok(1), '1234', 'cancel', jsonb_build_object('reservation_id', %L))$q$, v_b),
    'reserva no encontrada', 'RN-APP-08 la tablet de A no cancela una de B');
  perform public.s92_expect_error(format($q$select public.s92_act(public.s92_tok(1), '1357', 'staff_remove', jsonb_build_object('staff_id', %L))$q$,
      (select id from public.reservation_staff where name = 'Ana en B')),
    'no está en el equipo', 'RN-APP-08 la tablet de A no quita Equipo de B');
  -- El PIN de Ana en B (el mismo 1234) no vale en la tablet de A para nada de B: la tablet manda su restaurante.
  set local role postgres;
  if exists (select 1 from public.reservations where id = v_b and status <> 'confirmed') then
    raise exception 'RN-APP-08 FALLIDO: la reserva de B cambió desde la tablet de A';
  end if;
end $$;

-- Quitar a alguien o quitarle «Gestionar Reservas»: su PIN deja de valer en ese momento.
do $$
declare
  v jsonb;
begin
  perform public.s92_server();
  v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('1357'));
  perform public.s92_is(v, 'outcome', 'ok', 'RN-APP-08 el Encargado entra con su PIN');
  set local role postgres;
  update public.establishment_permissions set manage_reservations = false where establishment_membership_id = 'db000000-0000-0000-0000-000000000041';
  perform public.s92_server();
  v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('1357'));
  perform public.s92_is(v, 'outcome', 'wrong', 'RN-APP-08 sin «Gestionar Reservas» su PIN deja de valer');
  v := public.s92_act(public.s92_tok(1), '1357', 'save_settings',
    jsonb_build_object('slot_interval_minutes', 30, 'large_group_threshold', 9, 'min_notice_minutes', 0, 'max_advance_days', 60, 'customer_cancel_limit_minutes', 120));
  perform public.s92_is(v, 'outcome', 'wrong', 'RN-APP-08 ni para cambiar ajustes');
  set local role postgres;
  update public.establishment_permissions set manage_reservations = true where establishment_membership_id = 'db000000-0000-0000-0000-000000000041';
  update public.reservation_pin_attempts set failed_count = 0 where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));

  -- Un Propietario quitado del restaurante.
  perform public.s92_server();
  v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('2468'));
  perform public.s92_is(v, 'outcome', 'ok', 'RN-APP-08 el Propietario entra con su PIN');
  set local role postgres;
  update public.establishment_memberships set revoked_at = now() where id = 'db000000-0000-0000-0000-000000000040';
  perform public.s92_server();
  v := public.reservation_device_identify(public.s92_tok(1), public.s92_pin('2468'));
  perform public.s92_is(v, 'outcome', 'wrong', 'RN-APP-08 quitado del restaurante su PIN deja de valer');
  set local role postgres;
  update public.establishment_memberships set revoked_at = null where id = 'db000000-0000-0000-0000-000000000040';
  update public.reservation_pin_attempts set failed_count = 0 where device_id = (select id from public.reservation_devices where token_hash = public.s92_tok(1));
end $$;

-- «Ajustes abiertos con PIN»: la tablet pide la acción con la persona ya identificada (la prueba del servidor), sin
-- volver a pedir el PIN, y la base de datos vuelve a comprobar que sigue siendo quien dijo.
do $$
declare
  v jsonb;
  v_luis uuid;
  v_ana uuid;
  v_ana_b uuid;
begin
  set local role postgres;
  select id into v_luis from public.reservation_staff where user_id = 'db000000-0000-0000-0000-000000000005' and establishment_id = 'db000000-0000-0000-0000-000000000020';
  select id into v_ana from public.reservation_staff where name = 'Ana Ruiz' and establishment_id = 'db000000-0000-0000-0000-000000000020';
  select id into v_ana_b from public.reservation_staff where name = 'Ana en B';
  perform public.s92_server();

  v := public.reservation_device_act(public.s92_tok(1), null, v_luis, 'people', '{}'::jsonb);
  perform public.s92_is(v, 'outcome', 'acted', 'RN-APP-08 el Encargado de «Ajustes abiertos» lee la lista');
  perform public.s92_is(v, 'actor_role', 'manager', 'RN-APP-08 es el Encargado');
  v := public.reservation_device_act(public.s92_tok(1), null, v_ana, 'people', '{}'::jsonb);
  perform public.s92_is(v, 'outcome', 'forbidden', 'RN-APP-08 el Equipo no abre Ajustes con la prueba del servidor');
  -- Lo que le toca al Equipo sí lo hace: llega a la agenda (que dice que esa reserva no existe).
  perform public.s92_expect_error(format($q$select public.reservation_device_act(public.s92_tok(1), null, %L, 'cancel', jsonb_build_object('reservation_id', gen_random_uuid()))$q$, v_ana),
    'reserva no encontrada', 'RN-APP-08 el Equipo actúa con la prueba del servidor solo lo que le toca');
end $$;

do $$
declare
  v jsonb;
  v_luis uuid;
  v_ana_b uuid;
begin
  set local role postgres;
  select id into v_luis from public.reservation_staff where user_id = 'db000000-0000-0000-0000-000000000005' and establishment_id = 'db000000-0000-0000-0000-000000000020';
  select id into v_ana_b from public.reservation_staff where name = 'Ana en B';
  perform public.s92_server();

  -- Una persona que no existe, o que es de otro restaurante, no vale.
  v := public.reservation_device_act(public.s92_tok(1), null, gen_random_uuid(), 'people', '{}'::jsonb);
  perform public.s92_is(v, 'outcome', 'identity_invalid', 'RN-APP-08 una persona inventada no vale');
  v := public.reservation_device_act(public.s92_tok(1), null, v_ana_b, 'people', '{}'::jsonb);
  perform public.s92_is(v, 'outcome', 'identity_invalid', 'RN-APP-08 una persona de otro restaurante no vale en esta tablet');

  -- Y si el Encargado pierde «Gestionar Reservas», los Ajustes que abrió dejan de valer en ese momento.
  set local role postgres;
  update public.establishment_permissions set manage_reservations = false where establishment_membership_id = 'db000000-0000-0000-0000-000000000041';
  perform public.s92_server();
  v := public.reservation_device_act(public.s92_tok(1), null, v_luis, 'people', '{}'::jsonb);
  perform public.s92_is(v, 'outcome', 'identity_invalid', 'RN-APP-08 sin «Gestionar Reservas» los Ajustes abiertos dejan de valer');
  v := public.reservation_device_vouch('db000000-0000-0000-0000-000000000020', v_luis);
  perform public.s92_is(v, 'outcome', 'invalid', 'RN-APP-08 `reservation_device_vouch` lo dice igual');
  set local role postgres;
  update public.establishment_permissions set manage_reservations = true where establishment_membership_id = 'db000000-0000-0000-0000-000000000041';
end $$;

-- «Mi PIN» y `reservations_role_of` dicen lo mismo que `reservations_my_role` para cada persona.
do $$
declare
  r record;
  v_mine text;
begin
  for r in select * from (values
    ('db000000-0000-0000-0000-000000000004'::uuid), ('db000000-0000-0000-0000-000000000005'::uuid),
    ('db000000-0000-0000-0000-000000000006'::uuid), ('db000000-0000-0000-0000-000000000007'::uuid),
    ('db000000-0000-0000-0000-000000000008'::uuid), ('db000000-0000-0000-0000-000000000002'::uuid)) as t(u)
  loop
    perform public.s92_as(r.u);
    v_mine := public.reservations_my_role('db000000-0000-0000-0000-000000000020');
    set local role postgres;
    if public.reservations_role_of(r.u, 'db000000-0000-0000-0000-000000000020') is distinct from v_mine then
      raise exception 'RN-APP-08 FALLIDO: reservations_role_of (%) y reservations_my_role (%) no coinciden para %',
        public.reservations_role_of(r.u, 'db000000-0000-0000-0000-000000000020'), v_mine, r.u;
    end if;
  end loop;
end $$;

-- Desactivar el dispositivo lo corta; repetirlo no hace nada; otro restaurante no puede.
do $$
declare
  v jsonb;
  v_dev uuid;
begin
  set local role postgres;
  select id into v_dev from public.reservation_devices where name = 'Móvil de la cocina';
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  perform public.s92_expect_error(format($q$select public.revoke_reservation_device('db000000-0000-0000-0000-000000000021', %L)$q$, v_dev),
    'dispositivo no encontrado', 'RN-APP-08 no se desactiva el dispositivo de otro restaurante');
  perform public.s92_as('db000000-0000-0000-0000-000000000006');
  perform public.s92_expect_error(format($q$select public.revoke_reservation_device('db000000-0000-0000-0000-000000000020', %L)$q$, v_dev),
    'no tienes permiso', 'RN-APP-08 el Editor sin Gestionar Reservas no desactiva');
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  v := public.revoke_reservation_device('db000000-0000-0000-0000-000000000020', v_dev);
  perform public.s92_is(v, 'outcome', 'done', 'RN-APP-08 desactivar');
  v := public.revoke_reservation_device('db000000-0000-0000-0000-000000000020', v_dev);
  perform public.s92_is(v, 'outcome', 'unchanged', 'RN-APP-08 desactivar dos veces');
  perform public.s92_server();
  v := public.reservation_device_resolve(public.s92_tok(2));
  perform public.s92_is(v, 'outcome', 'no_device', 'RN-APP-08 un dispositivo desactivado deja de valer');
  v := public.s92_act(public.s92_tok(2), '1234', 'open', jsonb_build_object('reservation_id', gen_random_uuid()));
  perform public.s92_is(v, 'outcome', 'no_device', 'RN-APP-08 y no actúa');
  v := public.reservation_device_identify(public.s92_tok(2), public.s92_pin('1234'));
  perform public.s92_is(v, 'outcome', 'no_device', 'RN-APP-08 ni identifica');
end $$;

-- La puerta de la tablet no se abre desde fuera, y el ajuste del Equipo no se puede fabricar con una sesión.
do $$
declare
  v_ana uuid;
  v_id uuid;
begin
  set local role postgres;
  select id into v_ana from public.reservation_staff where name = 'Ana Ruiz' and establishment_id = 'db000000-0000-0000-0000-000000000020';
  select id into v_id from public.reservations where idempotency_key = 'tablet-1';

  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  perform public.s92_expect_error($q$select public.reservation_device_act(public.s92_tok(1), public.s92_pin('1234'), null, 'open', '{}'::jsonb)$q$,
    'permission denied', 'RN-APP-08 un usuario no entra por la puerta de la tablet');
  perform public.s92_expect_error($q$select public.reservation_device_identify(public.s92_tok(1), public.s92_pin('1234'))$q$,
    'permission denied', 'RN-APP-08 un usuario no prueba PIN');
  perform public.s92_expect_error($q$select public.reservation_device_resolve(public.s92_tok(1))$q$,
    'permission denied', 'RN-APP-08 un usuario no resuelve dispositivos');
  set local role anon;
  perform public.s92_expect_error($q$select public.reservation_device_act(public.s92_tok(1), public.s92_pin('1234'), null, 'open', '{}'::jsonb)$q$,
    'permission denied', 'RN-APP-08 anon no entra por la puerta de la tablet');

  -- Un usuario con sesión que se pone a mano el ajuste del Equipo no consigue ser «Equipo»: con sesión, el ajuste no vale.
  perform public.s92_as('db000000-0000-0000-0000-000000000008');
  perform set_config('restavor.device_staff', v_ana::text || '|db000000-0000-0000-0000-000000000020', true);
  perform public.s92_expect_error(format($q$select public.cancel_reservation('db000000-0000-0000-0000-000000000020', %L, 'other')$q$, v_id),
    'no tienes permiso', 'RN-APP-08 con sesión, el ajuste del Equipo no vale');

  -- Y el servidor, con el ajuste puesto a mano, es Equipo: no puede cambiar ajustes (defensa en profundidad).
  perform public.s92_server();
  perform set_config('restavor.device_staff', v_ana::text || '|db000000-0000-0000-0000-000000000020', true);
  perform public.s92_expect_error($q$select public.save_reservation_settings('db000000-0000-0000-0000-000000000020', 30, 9, 0, 60, 120)$q$,
    'el equipo no puede cambiar los ajustes', 'RN-APP-08 el Equipo no cambia ajustes ni saltándose la puerta');
  -- Ni siquiera para forzar un origen que no sea manual.
  perform public.s92_expect_error(format($q$select public.book_reservation('db000000-0000-0000-0000-000000000020', null, public.s92_today() + 12, '21:00', 2, 'X', '+34600000007', null, null, 'es', 'agent', false, null, false, null)$q$),
    'siempre es manual', 'RN-APP-08 el Equipo no firma como agente');
  perform set_config('restavor.device_staff', '', true);
end $$;

-- ------------------------------------------------------------
-- RN-APP-09 · la sesión de soporte de Reservas
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v2 jsonb;
  v_n integer;
  v_session uuid;
begin
  -- Sin el segundo paso, no.
  perform public.s92_as('db000000-0000-0000-0000-000000000003', 'aal1');
  perform public.s92_expect_error($q$select public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', 'Revisar una duda de aforo', 60)$q$,
    'segundo paso', 'RN-APP-09 sin aal2 no se abre');
  -- Sin la marca de soporte, no (el administrador del espacio sin marcar).
  perform public.s92_as('db000000-0000-0000-0000-000000000002', 'aal2');
  perform public.s92_expect_error($q$select public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', 'Quiero mirar', 60)$q$,
    'no estás marcado como soporte', 'RN-APP-09 sin la marca no se abre');
  perform public.s92_as('db000000-0000-0000-0000-000000000004', 'aal2');
  perform public.s92_expect_error($q$select public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', 'Soy el dueño', 60)$q$,
    'no estás marcado como soporte', 'RN-APP-09 el propietario del restaurante no abre soporte');
  perform public.s92_as('db000000-0000-0000-0000-000000000009', 'aal2');
  perform public.s92_expect_error($q$select public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', 'Trabajador', 60)$q$,
    'no estás marcado como soporte', 'RN-APP-09 un trabajador no abre soporte');

  -- Marcado + segundo paso: motivo obligatorio, duración acotada.
  perform public.s92_as('db000000-0000-0000-0000-000000000003', 'aal2');
  perform public.s92_expect_error($q$select public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', '   ', 60)$q$,
    'hace falta un motivo', 'RN-APP-09 sin motivo');
  perform public.s92_expect_error($q$select public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', 'x', 1)$q$,
    'entre 5 y 240', 'RN-APP-09 duración mínima');
  perform public.s92_expect_error($q$select public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', 'x', 241)$q$,
    'entre 5 y 240', 'RN-APP-09 duración máxima');

  -- Antes de abrir no ve a los comensales; abre; ahora sí; y el mismo usuario sin aal2 sigue sin verlos.
  select count(*) into v_n from public.reservations where establishment_id = 'db000000-0000-0000-0000-000000000020';
  if v_n <> 0 then
    raise exception 'RN-APP-09 FALLIDO: el soporte ve % reservas sin sesión abierta', v_n;
  end if;
  v := public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', 'Revisar una duda de aforo', 60);
  perform public.s92_is(v, 'outcome', 'open', 'RN-APP-09 abrir');
  perform public.s92_is(v, 'already_open', 'false', 'RN-APP-09 abrir');
  v_session := (v ->> 'session_id')::uuid;
  select count(*) into v_n from public.reservations where establishment_id = 'db000000-0000-0000-0000-000000000020';
  if v_n = 0 then
    raise exception 'RN-APP-09 FALLIDO: con la sesión abierta el soporte no ve las reservas';
  end if;
  select count(*) into v_n from public.reservations where establishment_id = 'db000000-0000-0000-0000-000000000021';
  if v_n <> 0 then
    raise exception 'RN-APP-09 FALLIDO: la sesión de A deja ver las reservas de B';
  end if;
  perform public.s92_as('db000000-0000-0000-0000-000000000003', 'aal1');
  select count(*) into v_n from public.reservations where establishment_id = 'db000000-0000-0000-0000-000000000020';
  if v_n <> 0 then
    raise exception 'RN-APP-09 FALLIDO: sin el segundo paso el soporte ve las reservas';
  end if;

  -- Abrirla otra vez devuelve la misma (no abre otra).
  perform public.s92_as('db000000-0000-0000-0000-000000000003', 'aal2');
  v2 := public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', 'Otro motivo', 30);
  perform public.s92_is(v2, 'already_open', 'true', 'RN-APP-09 idempotente');
  if (v2 ->> 'session_id')::uuid <> v_session then
    raise exception 'RN-APP-09 FALLIDO: abrir otra vez abrió una segunda sesión';
  end if;
  if (select count(*) from public.my_reservation_support_session('db000000-0000-0000-0000-000000000020')) <> 1 then
    raise exception 'RN-APP-09 FALLIDO: my_reservation_support_session no devuelve la sesión abierta';
  end if;

  -- Una acción del soporte queda etiquetada con la sesión, sin datos personales.
  v := public.book_reservation('db000000-0000-0000-0000-000000000020', null, public.s92_today() + 13, '21:30', 2, 'Cliente Soporte', '+34600000013',
                               null, null, 'es', 'manual', false, 'soporte-1', false, null);
  perform public.s92_is(v, 'outcome', 'accepted', 'RN-APP-09 el soporte actúa en sesión');
  set local role postgres;
  if not exists (select 1 from public.reservation_events where reservation_id = (v ->> 'reservation_id')::uuid and actor_type = 'restavor_support'
                   and actor_label = 'Restavor (soporte)') then
    raise exception 'RN-APP-09 FALLIDO: el evento del soporte no va etiquetado';
  end if;
  if not exists (select 1 from public.audit_log where entity_id = (v ->> 'reservation_id')::uuid and action = 'reservations.booking_created'
                   and new_value ->> 'via' = 'restavor_support' and (new_value ->> 'support_session_id')::uuid = v_session) then
    raise exception 'RN-APP-09 FALLIDO: la auditoría del soporte no lleva la sesión';
  end if;

  -- Cerrarla: solo quien la abrió; repetir no hace nada; después ya no ve nada.
  perform public.s92_as('db000000-0000-0000-0000-000000000002', 'aal2');
  perform public.s92_expect_error(format($q$select public.close_reservation_support_session(%L)$q$, v_session),
    'no encontrada', 'RN-APP-09 otra persona no cierra tu sesión');
  perform public.s92_as('db000000-0000-0000-0000-000000000003', 'aal2');
  v := public.close_reservation_support_session(v_session);
  perform public.s92_is(v, 'outcome', 'closed', 'RN-APP-09 cerrar');
  v := public.close_reservation_support_session(v_session);
  perform public.s92_is(v, 'outcome', 'unchanged', 'RN-APP-09 cerrar dos veces');
  select count(*) into v_n from public.reservations where establishment_id = 'db000000-0000-0000-0000-000000000020';
  if v_n <> 0 then
    raise exception 'RN-APP-09 FALLIDO: cerrada la sesión el soporte sigue viendo las reservas';
  end if;
  perform public.s92_expect_error($q$select public.book_reservation('db000000-0000-0000-0000-000000000020', null, public.s92_today() + 13, '22:00', 2, 'X', '+34600000014', null, null, 'es', 'manual', false, null, false, null)$q$,
    'no tienes permiso', 'RN-APP-09 cerrada la sesión el soporte no escribe');
end $$;

-- Caducidad: una sesión pasada de hora deja de valer sola, y abrir otra cierra la caducada.
do $$
declare
  v jsonb;
  v_old uuid;
  v_n integer;
begin
  perform public.s92_as('db000000-0000-0000-0000-000000000003', 'aal2');
  v := public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', 'Segunda visita', 15);
  v_old := (v ->> 'session_id')::uuid;
  set local role postgres;
  update public.reservation_support_sessions set started_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = v_old;
  perform public.s92_as('db000000-0000-0000-0000-000000000003', 'aal2');
  select count(*) into v_n from public.reservations where establishment_id = 'db000000-0000-0000-0000-000000000020';
  if v_n <> 0 then
    raise exception 'RN-APP-09 FALLIDO: una sesión caducada sigue dando acceso';
  end if;
  v := public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', 'Tercera visita', 15);
  perform public.s92_is(v, 'already_open', 'false', 'RN-APP-09 tras caducar se puede abrir otra');
  set local role postgres;
  if (select ended_at from public.reservation_support_sessions where id = v_old) is distinct from (select expires_at from public.reservation_support_sessions where id = v_old) then
    raise exception 'RN-APP-09 FALLIDO: la sesión caducada no se cerró a su hora de caducidad';
  end if;
end $$;

-- Quién se puede abrir como soporte: los restaurantes del espacio donde estás marcado; la plataforma, cualquiera.
do $$
declare
  v_n integer;
begin
  perform public.s92_as('db000000-0000-0000-0000-000000000003');
  select count(*) into v_n from public.reservation_support_candidates();
  if v_n <> 2 then
    raise exception 'RN-APP-09 FALLIDO: el soporte marcado ve % restaurantes y son 2', v_n;
  end if;
  select count(*) into v_n from public.reservation_support_candidates('plaza');
  if v_n <> 1 then
    raise exception 'RN-APP-09 FALLIDO: la búsqueda «plaza» devuelve % restaurantes', v_n;
  end if;
  perform public.s92_as('db000000-0000-0000-0000-000000000002');
  select count(*) into v_n from public.reservation_support_candidates();
  if v_n <> 0 then
    raise exception 'RN-APP-09 FALLIDO: el administrador sin marca ve % restaurantes para abrir', v_n;
  end if;
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  select count(*) into v_n from public.reservation_support_candidates();
  if v_n <> 0 then
    raise exception 'RN-APP-09 FALLIDO: el propietario de un restaurante ve restaurantes para abrir como soporte';
  end if;
  -- La plataforma (Bosco, con segundo paso): cualquiera, y abre la sesión sin pertenecer al espacio.
  perform public.s92_as('ffb00000-0000-0000-0000-000000000001', 'aal2');
  select count(*) into v_n from public.reservation_support_candidates('casa pepe 92');
  if v_n <> 1 then
    raise exception 'RN-APP-09 FALLIDO: la plataforma no ve el restaurante buscado (%)', v_n;
  end if;
  -- Sin sesión, Bosco (que no es miembro de este espacio) no lee ni la configuración.
  if (select count(*) from public.reservation_shifts where establishment_id = 'db000000-0000-0000-0000-000000000021') <> 0 then
    raise exception 'RN-APP-09 FALLIDO: la plataforma lee la configuración de un restaurante sin sesión abierta';
  end if;
  perform public.s92_is(public.open_reservation_support_session('db000000-0000-0000-0000-000000000021', 'Revisión de plataforma', 30), 'outcome', 'open', 'RN-APP-09 la plataforma abre');
  -- Con la sesión abierta lee los turnos y los ajustes de ese espacio (sin eso Hoy no se podría pintar) y los datos de B, no los de nadie más.
  if (select count(*) from public.reservation_shifts where establishment_id = 'db000000-0000-0000-0000-000000000021') <> 1
     or (select count(*) from public.reservation_settings where establishment_id = 'db000000-0000-0000-0000-000000000021') <> 1 then
    raise exception 'RN-APP-09 FALLIDO: con la sesión abierta la plataforma no lee la configuración del restaurante';
  end if;
  if (select count(*) from public.reservations where establishment_id = 'db000000-0000-0000-0000-000000000021') = 0 then
    raise exception 'RN-APP-09 FALLIDO: con la sesión abierta la plataforma no lee las reservas del restaurante';
  end if;
  -- La sesión cerrada, ni configuración ni reservas; el segundo paso también cuenta para la configuración.
  perform public.s92_as('ffb00000-0000-0000-0000-000000000001', 'aal1');
  if (select count(*) from public.reservation_shifts where establishment_id = 'db000000-0000-0000-0000-000000000021') <> 0 then
    raise exception 'RN-APP-09 FALLIDO: sin el segundo paso la sesión de soporte da la configuración';
  end if;
  perform public.s92_as('ffb00000-0000-0000-0000-000000000001', 'aal2');
  -- Sin segundo paso, ni Bosco.
  perform public.s92_as('ffb00000-0000-0000-0000-000000000001', 'aal1');
  perform public.s92_expect_error($q$select public.open_reservation_support_session('db000000-0000-0000-0000-000000000020', 'Sin segundo paso', 30)$q$,
    'segundo paso', 'RN-APP-09 la plataforma sin segundo paso no abre');
end $$;

-- ------------------------------------------------------------
-- RN-APP-09 · el Historial del restaurante
-- ------------------------------------------------------------
do $$
declare
  v_n integer;
  v_text text;
  v_labels text;
begin
  -- Un cambio del propio restaurante y uno del equipo de Restavor, para ver cómo se etiquetan.
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  perform public.save_reservation_settings('db000000-0000-0000-0000-000000000020', 15, 9, 0, 60, 120);
  perform public.s92_as('db000000-0000-0000-0000-000000000002');
  perform public.save_reservation_settings('db000000-0000-0000-0000-000000000020', 30, 9, 0, 60, 120);

  perform public.s92_as('db000000-0000-0000-0000-000000000005');
  select string_agg(h.kind || '=' || h.actor_label, '; ' order by h.at desc) into v_labels from public.reservation_history_log('db000000-0000-0000-0000-000000000020') h;
  if v_labels is null then
    raise exception 'RN-APP-09 FALLIDO: el Historial viene vacío';
  end if;
  -- Lo que tiene que haber: altas del Equipo, dispositivos, bloqueos, ajustes y sesiones de soporte.
  foreach v_text in array array['reservations.staff_added', 'reservations.staff_pin_changed', 'reservations.staff_removed', 'reservations.my_pin_set',
                                'reservations.device_activated', 'reservations.device_revoked', 'reservations.pin_locked',
                                'reservations.settings_saved', 'reservations.support_session'] loop
    if not exists (select 1 from public.reservation_history_log('db000000-0000-0000-0000-000000000020') h where h.kind = v_text) then
      raise exception 'RN-APP-09 FALLIDO: al Historial le falta «%»; trae: %', v_text, v_labels;
    end if;
  end loop;
  -- Quién hizo cada cosa: el restaurante con su nombre, el equipo como «Restavor», el soporte como «Restavor (soporte)».
  if not exists (select 1 from public.reservation_history_log('db000000-0000-0000-0000-000000000020') h where h.kind = 'reservations.settings_saved' and h.actor_label = 'Propietario A 92')
     or not exists (select 1 from public.reservation_history_log('db000000-0000-0000-0000-000000000020') h where h.kind = 'reservations.settings_saved' and h.actor_label = 'Restavor') then
    raise exception 'RN-APP-09 FALLIDO: los ajustes no salen con «Propietario A 92» y «Restavor»; trae: %', v_labels;
  end if;
  if not exists (select 1 from public.reservation_history_log('db000000-0000-0000-0000-000000000020') h where h.kind = 'reservations.support_session' and h.actor_label = 'Restavor (soporte)'
                   and h.detail ->> 'reason' = 'Revisar una duda de aforo') then
    raise exception 'RN-APP-09 FALLIDO: la sesión de soporte no sale como «Restavor (soporte)» con su motivo';
  end if;
  -- Lo hecho desde la tablet sale con el nombre de quien tenía el PIN.
  if not exists (select 1 from public.reservation_history_log('db000000-0000-0000-0000-000000000020') h where h.kind = 'reservations.staff_added' and h.actor_label = 'Encargado A 92') then
    raise exception 'RN-APP-09 FALLIDO: el alta de Equipo hecha con el PIN del Encargado no sale a su nombre; trae: %', v_labels;
  end if;
  -- P7: ni en la etiqueta ni en el detalle aparece el identificador de nadie del equipo de Restavor.
  select string_agg(h::text, ' ') into v_text from public.reservation_history_log('db000000-0000-0000-0000-000000000020') h;
  if v_text like '%db000000-0000-0000-0000-000000000001%' or v_text like '%db000000-0000-0000-0000-000000000002%'
     or v_text like '%db000000-0000-0000-0000-000000000003%' or v_text like '%ffb00000-0000-0000-0000-000000000001%' then
    raise exception 'RN-APP-09 FALLIDO (P7): el Historial deja ver el identificador de alguien del equipo de Restavor';
  end if;
  -- Y tampoco hay datos de comensales ni PIN.
  if v_text ~* 'Lucía|Cliente Soporte|612345678' or v_text like '%' || public.s92_pin('1234') || '%' then
    raise exception 'RN-APP-09 FALLIDO: el Historial guarda datos de un comensal o un PIN';
  end if;
  -- La sesión de soporte se cuenta una vez, no por duplicado (sesión + apunte de auditoría).
  select count(*) into v_n from public.reservation_history_log('db000000-0000-0000-0000-000000000020') h where h.kind like 'reservations.support_session%';
  if v_n <> 3 then
    raise exception 'RN-APP-09 FALLIDO: hay % sesiones de soporte en el Historial y son 3', v_n;
  end if;
  -- Quién lo puede leer.
  perform public.s92_as('db000000-0000-0000-0000-000000000006');
  perform public.s92_expect_error($q$select * from public.reservation_history_log('db000000-0000-0000-0000-000000000020')$q$,
    'no tienes permiso', 'RN-APP-09 el Editor sin Gestionar Reservas no ve el Historial');
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  perform public.s92_expect_error($q$select * from public.reservation_history_log('db000000-0000-0000-0000-000000000020')$q$,
    'no tienes permiso', 'RN-APP-09 el dueño de otro restaurante no ve el Historial');
  perform public.s92_as('db000000-0000-0000-0000-000000000008');
  perform public.s92_expect_error($q$select * from public.reservation_history_log('db000000-0000-0000-0000-000000000020')$q$,
    'no tienes permiso', 'RN-APP-09 un extraño no ve el Historial');
  -- Las sesiones de soporte, con sus columnas sin identidad, las lee el Propietario pero no sabe quién fue (privilegio de columna).
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  perform public.s92_expect_error($q$select actor_id from public.reservation_support_sessions$q$, 'permission denied', 'RN-APP-09 quién abrió la sesión no sale');
  if (select count(*) from public.reservation_support_sessions where establishment_id = 'db000000-0000-0000-0000-000000000020') = 0 then
    raise exception 'RN-APP-09 FALLIDO: el Propietario no ve las sesiones de soporte de su restaurante';
  end if;
end $$;

-- ------------------------------------------------------------
-- Tras la revisión independiente · lo que una sesión de soporte NO abre, restaurantes eliminados, PIN probados y tope de tablets
-- ------------------------------------------------------------

-- La sesión de soporte es de UN restaurante: la de Bosco en B (abierta más arriba) no da ni lectura ni gestión en A,
-- aunque sean del mismo espacio.
do $$
declare
  v_n integer;
begin
  perform public.s92_as('ffb00000-0000-0000-0000-000000000001', 'aal2');
  if (select count(*) from public.reservation_shifts where establishment_id = 'db000000-0000-0000-0000-000000000021') <> 1 then
    raise exception 'RN-APP-09 FALLIDO: la sesión abierta en B no lee su propia configuración (el caso de control)';
  end if;
  select count(*) into v_n from public.reservation_shifts where establishment_id = 'db000000-0000-0000-0000-000000000020';
  if v_n <> 0 then
    raise exception 'RN-APP-09 FALLIDO: la sesión de soporte de B lee % turnos de A', v_n;
  end if;
  if (select count(*) from public.reservation_settings where establishment_id = 'db000000-0000-0000-0000-000000000020') <> 0
     or (select count(*) from public.reservation_staff where establishment_id = 'db000000-0000-0000-0000-000000000020') <> 0
     or (select count(*) from public.reservation_devices where establishment_id = 'db000000-0000-0000-0000-000000000020') <> 0
     or (select count(*) from public.agent_balance_entries where establishment_id = 'db000000-0000-0000-0000-000000000020') <> 0 then
    raise exception 'RN-APP-09 FALLIDO: la sesión de soporte de B lee ajustes, Equipo, dispositivos o saldo de A';
  end if;
  perform public.s92_expect_error($q$select public.reservation_people('db000000-0000-0000-0000-000000000020')$q$,
    'no tienes permiso', 'RN-APP-09 la sesión de B no lista a las personas de A');
  perform public.s92_expect_error(format($q$select public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Intruso', %L, 'intruso-1')$q$, public.s92_pin('7777')),
    'no tienes permiso', 'RN-APP-09 la sesión de B no añade Equipo en A');
  perform public.s92_expect_error($q$select public.revoke_reservation_device('db000000-0000-0000-0000-000000000020', 'db000000-0000-0000-0000-0000000000ff')$q$,
    'no tienes permiso', 'RN-APP-09 la sesión de B no revoca dispositivos de A');
  perform public.s92_expect_error($q$select public.set_reservation_closed_date('db000000-0000-0000-0000-000000000020', current_date + 30, 'Intruso', true)$q$,
    'no tienes permiso', 'RN-APP-09 la sesión de B no cambia los ajustes de A');
  -- En el restaurante de la sesión sí gestiona (RN-APP-09: el soporte actúa dentro de su sesión).
  select count(*) into v_n from public.reservation_people('db000000-0000-0000-0000-000000000021');
  if v_n < 1 then
    raise exception 'RN-APP-09 FALLIDO: la sesión de B no ve a las personas de B';
  end if;
  -- Lo que hace dentro de su sesión queda con la sesión y el Historial lo enseña como «Restavor (soporte)».
  perform public.s92_is(public.add_reservation_staff('db000000-0000-0000-0000-000000000021', 'Alta de soporte', public.s92_pin('5151'), 'alta-soporte-92'),
    'outcome', 'created', 'RN-APP-09 el soporte da de alta dentro de su sesión');
  if not exists (
    select 1 from public.reservation_history_log('db000000-0000-0000-0000-000000000021', 200) h
    where h.kind = 'reservations.staff_added' and h.actor_label = 'Restavor (soporte)'
  ) then
    raise exception 'RN-APP-09 FALLIDO: el alta del soporte no sale en el Historial como «Restavor (soporte)»';
  end if;
  execute 'set local role postgres';
  if not exists (
    select 1 from public.audit_log a
    where a.action = 'reservations.staff_added' and a.entity_id = 'db000000-0000-0000-0000-000000000021'
      and a.new_value ->> 'via' = 'restavor_support' and a.new_value ? 'support_session_id'
  ) then
    raise exception 'RN-APP-09 FALLIDO: el alta del soporte no lleva la sesión en auditoría';
  end if;
end $$;

-- Un restaurante eliminado definitivamente ya no se lee ni se abre como soporte (RN-ADM-24); todo dentro de un
-- bloque que se deshace.
do $$
begin
  begin
    execute 'set local role postgres';
    perform set_config('cuotly.platform_change', 'on', true);
    update public.establishments set permanently_deleted_at = now() where id = 'db000000-0000-0000-0000-000000000021';
    perform set_config('cuotly.platform_change', '', true);
    perform public.s92_as('ffb00000-0000-0000-0000-000000000001', 'aal2');
    if public.reservations_can_read_diner_data('db000000-0000-0000-0000-000000000021') then
      raise exception 'RN-ADM-24 FALLIDO: la sesión de soporte lee un restaurante eliminado definitivamente';
    end if;
    if (select count(*) from public.reservation_support_candidates('plaza 92')) <> 0 then
      raise exception 'RN-ADM-24 FALLIDO: un restaurante eliminado definitivamente sigue saliendo para abrir como soporte';
    end if;
    perform public.s92_expect_error($q$select public.open_reservation_support_session('db000000-0000-0000-0000-000000000021', 'Reabrir', 30)$q$,
      'no estás marcado', 'RN-ADM-24 no se abre soporte en un restaurante eliminado');
    raise exception 'DESHACER_92';
  exception when others then
    if sqlerrm <> 'DESHACER_92' then
      raise;
    end if;
  end;
end $$;

-- «Ese PIN ya lo usa otra persona» no se puede preguntar sin límite: cinco topetazos en 24 horas y esa persona no
-- puede probar más PIN en ese restaurante (ni uno libre: la respuesta no distingue).
do $$
declare
  v jsonb;
  v_before integer;
  v_i integer;
begin
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  v := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Sonda 92', public.s92_pin('9999'), 'sonda-92');
  perform public.s92_is(v, 'outcome', 'created', 'RN-APP-06 se crea a quien se va a sondear');

  perform public.s92_as('db000000-0000-0000-0000-000000000005');
  execute 'set local role postgres';
  select count(*) into v_before from public.audit_log
  where action = 'reservations.pin_collision' and actor_id = 'db000000-0000-0000-0000-000000000005';
  perform public.s92_as('db000000-0000-0000-0000-000000000005');
  for v_i in 1 .. (5 - v_before) loop
    v := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Probador ' || v_i, public.s92_pin('9999'), 'probador-92-' || v_i);
    perform public.s92_is(v, 'outcome', 'pin_in_use', 'RN-APP-06 el topetazo ' || v_i || ' sigue contestando «en uso»');
  end loop;
  v := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Probador libre', public.s92_pin('0001'), 'probador-92-libre');
  perform public.s92_is(v, 'outcome', 'pin_probes_locked', 'RN-APP-06 tras cinco topetazos no se prueban más PIN (un PIN libre)');
  v := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Probador otro', public.s92_pin('9999'), 'probador-92-otro');
  perform public.s92_is(v, 'outcome', 'pin_probes_locked', 'RN-APP-06 tras cinco topetazos no se prueban más PIN (uno en uso)');
  v := public.set_my_reservation_pin('db000000-0000-0000-0000-000000000020', public.s92_pin('0002'));
  perform public.s92_is(v, 'outcome', 'pin_probes_locked', 'RN-APP-06 tampoco desde «Mi PIN»');
  -- Es por persona: el Propietario sigue pudiendo.
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  v := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Persona nueva 92', public.s92_pin('0003'), 'nueva-92');
  perform public.s92_is(v, 'outcome', 'created', 'RN-APP-06 el bloqueo es por persona');
  -- Y pasadas 24 horas se levanta.
  execute 'set local role postgres';
  update public.audit_log set created_at = now() - interval '25 hours'
  where action = 'reservations.pin_collision' and actor_id = 'db000000-0000-0000-0000-000000000005';
  perform public.s92_as('db000000-0000-0000-0000-000000000005');
  v := public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Probador libre', public.s92_pin('0001'), 'probador-92-libre');
  perform public.s92_is(v, 'outcome', 'created', 'RN-APP-06 a las 24 horas se puede volver a poner un PIN');
end $$;

-- En un espacio archivado (solo lectura) el Equipo con PIN tampoco escribe: corre sin usuario y el disparador de solo
-- lectura lo dejaría pasar si la puerta de la tablet no lo cerrara.
do $$
begin
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  perform public.activate_reservation_device('db000000-0000-0000-0000-000000000020', 'Tablet archivo', public.s92_tok(150));
  perform public.add_reservation_staff('db000000-0000-0000-0000-000000000020', 'Camarero archivo', public.s92_pin('6262'), 'archivo-92');
  begin
    execute 'set local role postgres';
    perform set_config('cuotly.space_status_change', 'on', true);
    update public.spaces set cuotly_status = 'archived_nonpayment' where id = 'db000000-0000-0000-0000-000000000010';
    perform set_config('cuotly.space_status_change', '', true);
    perform public.s92_server();
    perform public.s92_expect_error(
      format($q$select public.s92_act(%L, '6262', 'cancel', jsonb_build_object('reservation_id', 'db000000-0000-0000-0000-0000000000ee'))$q$, public.s92_tok(150)),
      'archivado', 'RN-APP-08 el Equipo no escribe en un espacio archivado');
    raise exception 'DESHACER_92';
  exception when others then
    if sqlerrm <> 'DESHACER_92' then
      raise;
    end if;
  end;
end $$;

-- Un restaurante no activa dispositivos sin tope: con veinte activos, el siguiente espera.
do $$
declare
  v_n integer;
  v_i integer;
begin
  perform public.s92_as('db000000-0000-0000-0000-000000000004');
  select count(*) into v_n from public.reservation_devices where establishment_id = 'db000000-0000-0000-0000-000000000020' and revoked_at is null;
  for v_i in 1 .. (20 - v_n) loop
    perform public.activate_reservation_device('db000000-0000-0000-0000-000000000020', 'Tablet tope ' || v_i, public.s92_tok(200 + v_i));
  end loop;
  perform public.s92_expect_error(format($q$select public.activate_reservation_device('db000000-0000-0000-0000-000000000020', 'Una más', %L)$q$, public.s92_tok(300)),
    'veinte dispositivos', 'RN-APP-08 el dispositivo veintiuno no se activa');
  -- El tope es por restaurante.
  perform public.s92_as('db000000-0000-0000-0000-000000000007');
  perform public.activate_reservation_device('db000000-0000-0000-0000-000000000021', 'Tablet de B', public.s92_tok(301));
end $$;

-- ------------------------------------------------------------
-- RN-EST-17 (decisión 131) · el Propietario añade y quita Propietarios; el Encargado y un Editor con «Usuarios y accesos», no
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_ok boolean;
begin
  begin
    -- El Encargado (05) no invita a un Propietario ni quita a uno.
    perform public.s92_as('db000000-0000-0000-0000-000000000005');
    perform public.s92_expect_error($q$select public.invite_to_establishment_panel('db000000-0000-0000-0000-000000000020', 'extrano@suite92.test', 'local_owner')$q$,
      'no tienes permiso', 'RN-EST-17 un Encargado no nombra a un Propietario');
    perform public.s92_expect_error($q$select public.revoke_establishment_access('db000000-0000-0000-0000-000000000020', 'db000000-0000-0000-0000-000000000004')$q$,
      'no tienes permiso', 'RN-EST-17 un Encargado no quita a un Propietario');
    -- Un Editor con «Usuarios y accesos» (06) tampoco: si pudiera, el permiso sería una manera de quedarse con el restaurante.
    execute 'set local role postgres';
    update public.establishment_permissions set manage_users = true
    where establishment_membership_id = 'db000000-0000-0000-0000-000000000042';
    perform public.s92_as('db000000-0000-0000-0000-000000000006');
    perform public.s92_expect_error($q$select public.invite_to_establishment_panel('db000000-0000-0000-0000-000000000020', 'extrano@suite92.test', 'local_owner')$q$,
      'solo lo cambia', 'RN-EST-17 un Editor con «Usuarios y accesos» no nombra a un Propietario');
    perform public.s92_expect_error($q$select public.revoke_establishment_access('db000000-0000-0000-0000-000000000020', 'db000000-0000-0000-0000-000000000004')$q$,
      'solo lo cambia', 'RN-EST-17 un Editor con «Usuarios y accesos» no quita a un Propietario');

    -- El Propietario (04) nombra a otro Propietario (08, que ya tiene cuenta: entra al momento).
    perform public.s92_as('db000000-0000-0000-0000-000000000004');
    if (select count(*) from public.reservation_removable_owners('db000000-0000-0000-0000-000000000020')) <> 1 then
      raise exception 'RN-EST-17 FALLIDO: antes de nombrar a otro hay que ver un único Propietario del restaurante quitable';
    end if;
    perform public.invite_to_establishment_panel('db000000-0000-0000-0000-000000000020', 'extrano@suite92.test', 'local_owner');
    if (select count(*) from public.reservation_removable_owners('db000000-0000-0000-0000-000000000020')) <> 2 then
      raise exception 'RN-EST-17 FALLIDO: el Propietario no pudo nombrar a otro Propietario';
    end if;
    perform public.s92_as('db000000-0000-0000-0000-000000000008');
    if public.reservations_my_role('db000000-0000-0000-0000-000000000020') is distinct from 'owner' then
      raise exception 'RN-EST-17 FALLIDO: el nuevo Propietario no lo es en Reservas';
    end if;

    -- El nuevo Propietario quita al primero (un Propietario quita a otro) y queda como único.
    v_ok := public.revoke_establishment_access('db000000-0000-0000-0000-000000000020', 'db000000-0000-0000-0000-000000000004', 'prueba');
    if not v_ok then
      raise exception 'RN-EST-17 FALLIDO: un Propietario no pudo quitar a otro Propietario';
    end if;
    -- Y no puede dejar el restaurante sin Propietario, ni quitándose a sí mismo.
    perform public.s92_expect_error($q$select public.revoke_establishment_access('db000000-0000-0000-0000-000000000020', 'db000000-0000-0000-0000-000000000008')$q$,
      'al menos un propietario', 'RN-EST-17 el último Propietario no se quita');
    -- El equipo del espacio sí lo arregla (es quien crea el panel).
    perform public.s92_as('db000000-0000-0000-0000-000000000002');
    v_ok := public.revoke_establishment_access('db000000-0000-0000-0000-000000000020', 'db000000-0000-0000-0000-000000000008', 'prueba');
    if not v_ok then
      raise exception 'RN-EST-17 FALLIDO: el equipo del espacio no pudo quitar al último Propietario';
    end if;
    raise exception 'DESHACER_92';
  exception when others then
    if sqlerrm <> 'DESHACER_92' then
      raise;
    end if;
  end;
end $$;

-- ------------------------------------------------------------
-- Cierre · quién ejecuta qué
-- ------------------------------------------------------------
do $$
declare
  v_sig text;
begin
  -- Internas: nadie con sesión ni sin ella.
  foreach v_sig in array array[
    'public.reservations_device_staff(uuid)', 'public.reservations_role_of(uuid, uuid)',
    'public.reservation_pin_lock_seconds(integer)', 'public.reservations_manage_actor(uuid)',
    'public.reservations_audit_setting(uuid, text, jsonb, jsonb)', 'public.reservation_device_vouch(uuid, uuid)',
    'public.reservations_is_support_marked(uuid)', 'public.reservations_pin_probe_blocked(uuid)'
  ] loop
    if has_function_privilege('authenticated', v_sig, 'execute') or has_function_privilege('anon', v_sig, 'execute') then
      raise exception 'RN-RES-12 FALLIDO: % es interna y está abierta por RPC', v_sig;
    end if;
  end loop;
  -- Del servidor: solo `service_role`.
  foreach v_sig in array array[
    'public.reservation_device_resolve(text)', 'public.reservation_device_identify(text, text)',
    'public.reservation_device_act(text, text, uuid, text, jsonb)'
  ] loop
    if has_function_privilege('authenticated', v_sig, 'execute') or has_function_privilege('anon', v_sig, 'execute')
       or not has_function_privilege('service_role', v_sig, 'execute') then
      raise exception 'RN-APP-08 FALLIDO: % tiene que ser solo de service_role', v_sig;
    end if;
  end loop;
  -- Las de las personas: `authenticated` sí, `anon` no.
  foreach v_sig in array array[
    'public.reservation_people(uuid)', 'public.reservation_removable_owners(uuid)', 'public.add_reservation_staff(uuid, text, text, text)',
    'public.set_reservation_staff_pin(uuid, uuid, text)', 'public.remove_reservation_staff(uuid, uuid)',
    'public.set_my_reservation_pin(uuid, text)', 'public.activate_reservation_device(uuid, text, text)',
    'public.revoke_reservation_device(uuid, uuid)', 'public.open_reservation_support_session(uuid, text, integer)',
    'public.close_reservation_support_session(uuid)', 'public.my_reservation_support_session(uuid)',
    'public.reservation_support_candidates(text)', 'public.reservation_history_log(uuid, integer)'
  ] loop
    if has_function_privilege('anon', v_sig, 'execute') or not has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception 'RN-APP-06 FALLIDO: % tiene que ser de authenticated y no de anon', v_sig;
    end if;
  end loop;
end $$;

select 'reservas_equipo_tablet_soporte: OK' as resultado;

rollback;
