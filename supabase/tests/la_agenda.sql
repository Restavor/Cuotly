-- ============================================================
-- Suite 91 · La agenda de Reservas
--            (Fase C de agents; migración 169; RN-RES-01 a RN-RES-09, RN-RES-11, RN-RES-12)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-RES-02 · crear una reserva respeta el aforo según el origen (agente y web: no
--     cabe → `full`; plataforma: entra siempre; manual: avisa y pide `force`), y fuera
--     de turno una plataforma entra sin turno.
--   · RN-RES-03 · antelación mínima y máxima (solo agente y web); las manuales no se
--     crean en fechas pasadas.
--   · RN-RES-05 · grupo grande del agente o la web → pendiente; confirmar y rechazar.
--   · RN-RES-06 · posibles duplicadas: se marcan, se desmarcan al cancelar una y "No es
--     duplicada" las deja en paz.
--   · RN-RES-07 · editar: reaplica las reglas solo si cambia fecha, hora o personas;
--     una reserva de plataforma no cambia de fecha ni hora; el agente que sube al umbral
--     la deja pendiente.
--   · RN-RES-08 · cancelar con motivo, repetir no duplica, la de plataforma queda con
--     el aviso "Cancélala también en…".
--   · RN-RES-09 · "No vino" solo cuando ya pasó la hora y se deshace el mismo día.
--   · RN-RES-11 · con las reservas en pausa no se crea ni se cambia fecha, hora o personas;
--     sí se cancela, se confirma y se rechaza.
--   · RN-RES-12 · ni los eventos ni el `audit_log` guardan datos de comensales; solo
--     el Propietario, el Encargado y el soporte con sesión escriben; el administrador
--     del espacio sin sesión de soporte, el Editor sin "Gestionar Reservas", un
--     extraño y el dueño de otro restaurante, no; ninguna escritura directa; las
--     funciones internas, cerradas.
--   · RN-RES-01 · guardar horarios: validaciones, solapes, no quitar turnos, días ni
--     marcar un día cerrado con reservas futuras (dice cuántas); Restavor cambia horarios.
--   · RN-RES-09 · buscar, calendario del mes e historial legible.
--   · RN-RES-01 · la hora local → UTC en los cambios de hora de Madrid.
--
-- La concurrencia (dos altas a la vez para las últimas plazas) no cabe en un archivo
-- `psql -f`: la prueba `apps/web/scripts/agenda-concurrency-test.mjs`.
--
-- Prefijo de esta suite: da000000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name)
values ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'Bosco')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('da000000-0000-0000-0000-000000000001', 'duena@suite91.test', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000002', 'admin@suite91.test', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000003', 'soporte@suite91.test', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000004', 'propietario-a@suite91.test', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000005', 'encargado-a@suite91.test', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000006', 'editor-a@suite91.test', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000007', 'propietario-b@suite91.test', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000008', 'extrano@suite91.test', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000009', 'trabajador@suite91.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('da000000-0000-0000-0000-000000000001', 'duena@suite91.test', 'Dueña 91'),
  ('da000000-0000-0000-0000-000000000002', 'admin@suite91.test', 'Admin 91'),
  ('da000000-0000-0000-0000-000000000003', 'soporte@suite91.test', 'Soporte 91'),
  ('da000000-0000-0000-0000-000000000004', 'propietario-a@suite91.test', 'Propietario A 91'),
  ('da000000-0000-0000-0000-000000000005', 'encargado-a@suite91.test', 'Encargado A 91'),
  ('da000000-0000-0000-0000-000000000006', 'editor-a@suite91.test', 'Editor A 91'),
  ('da000000-0000-0000-0000-000000000007', 'propietario-b@suite91.test', 'Propietario B 91'),
  ('da000000-0000-0000-0000-000000000008', 'extrano@suite91.test', 'Extraño 91'),
  ('da000000-0000-0000-0000-000000000009', 'trabajador@suite91.test', 'Trabajador 91')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by, reservations_enabled) values
  ('da000000-0000-0000-0000-000000000010', 'Espacio 91', 'espacio-91', 'Europe/Madrid',
   'da000000-0000-0000-0000-000000000001', false);

insert into public.space_memberships (space_id, user_id, role, status) values
  ('da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000003', 'admin', 'active'),
  ('da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000009', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('da000000-0000-0000-0000-000000000015', 'da000000-0000-0000-0000-000000000010', 'Grupo A 91'),
  ('da000000-0000-0000-0000-000000000016', 'da000000-0000-0000-0000-000000000010', 'Grupo B 91');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('da000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000015', 'R91A', 'Casa Pepe 91', 'active'),
  ('da000000-0000-0000-0000-000000000021', 'da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000016', 'R91B', 'Bar La Plaza 91', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('da000000-0000-0000-0000-000000000040', 'da000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000004', 'local_owner'),
  ('da000000-0000-0000-0000-000000000041', 'da000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000005', 'editor'),
  ('da000000-0000-0000-0000-000000000042', 'da000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000006', 'editor'),
  ('da000000-0000-0000-0000-000000000043', 'da000000-0000-0000-0000-000000000021', 'da000000-0000-0000-0000-000000000007', 'local_owner');

insert into public.establishment_permissions (establishment_membership_id, manage_reservations) values
  ('da000000-0000-0000-0000-000000000041', true),
  ('da000000-0000-0000-0000-000000000042', false);

insert into public.reservation_settings (id, space_id, establishment_id, service_status, public_slug) values
  ('da000000-0000-0000-0000-000000000060', 'da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000020', 'active', 'casa-pepe-91'),
  ('da000000-0000-0000-0000-000000000061', 'da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000021', 'active', 'bar-la-plaza-91');

-- Casa Pepe: Cena todos los días, 20:00–23:30 (última 22:30), aforo 60. Bar La Plaza: aforo 30.
insert into public.reservation_shifts (id, space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity) values
  ('da000000-0000-0000-0000-000000000070', 'da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000020', 'Cena', '{1,2,3,4,5,6,7}', '20:00', '23:30', '22:30', 60),
  ('da000000-0000-0000-0000-000000000071', 'da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000021', 'Cena', '{1,2,3,4,5,6,7}', '20:00', '23:30', '22:30', 30);

-- Soporte de Reservas: 03 marcado, con sesión abierta sobre A.
update public.space_memberships set can_support_reservations = true
where space_id = 'da000000-0000-0000-0000-000000000010' and user_id = 'da000000-0000-0000-0000-000000000003';
insert into public.reservation_support_sessions (id, space_id, establishment_id, actor_id, reason, started_at, expires_at, ended_at) values
  ('da000000-0000-0000-0000-0000000000a0', 'da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000003', 'Revisar una duda de aforo', now() - interval '5 minutes', now() + interval '55 minutes', null);

-- ------------------------------------------------------------
-- Ayudantes del test
-- ------------------------------------------------------------
create function public.s91_as(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.aal', p_aal, true);
  execute 'set local role authenticated';
end $$;

create function public.s91_server() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
  execute 'set local role service_role';
end $$;

create function public.s91_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;

-- La fecha de prueba: hoy + n, en la zona del restaurante.
create function public.s91_d(p_n integer) returns date
language sql stable as $$ select public.s91_today() + p_n $$;

-- Reserva con los valores por defecto del test (Casa Pepe, manual, es).
create function public.s91_book(
  p_date date, p_time time, p_party integer, p_name text, p_phone text,
  p_source text default 'manual', p_force boolean default false, p_idem text default null,
  p_est uuid default 'da000000-0000-0000-0000-000000000020', p_id uuid default null,
  p_email text default null, p_notes text default null, p_platform text default null
) returns jsonb
language sql as $$
  select public.book_reservation(p_est, p_id, p_date, p_time, p_party, p_name, p_phone, p_email, p_notes, 'es',
                                 p_source, p_force, p_idem, false, p_platform)
$$;

-- Comprueba que una sentencia falla con un mensaje que casa con el patrón.
create function public.s91_expect_error(p_sql text, p_pattern text, p_what text) returns void
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

create function public.s91_is(p_actual jsonb, p_key text, p_expected text, p_what text) returns void
language plpgsql as $$
begin
  if (p_actual ->> p_key) is distinct from p_expected then
    raise exception '% FALLIDO: %=% (esperado %); resultado completo: %', p_what, p_key, p_actual ->> p_key, p_expected, p_actual;
  end if;
end $$;

grant execute on function
  public.s91_as(uuid, text), public.s91_server(), public.s91_today(), public.s91_d(integer),
  public.s91_book(date, time, integer, text, text, text, boolean, text, uuid, uuid, text, text, text),
  public.s91_expect_error(text, text, text), public.s91_is(jsonb, text, text, text)
to authenticated, service_role;

-- Los días cerrados de Casa Pepe: hoy + 12.
insert into public.reservation_closed_dates (space_id, establishment_id, date, reason)
values ('da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000020', public.s91_d(12), 'Fiesta local');

-- ------------------------------------------------------------
-- RN-RES-02 · crear, idempotencia, aforo por origen
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v2 jsonb;
  v_id uuid;
  v_n integer;
begin
  perform public.s91_as('da000000-0000-0000-0000-000000000004');

  v := public.s91_book(public.s91_d(10), '21:00', 4, 'Lucía Fernández', '+34612345678', 'manual', false, 'clave-1');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-02');
  perform public.s91_is(v, 'status', 'confirmed', 'RN-RES-02');
  v_id := (v ->> 'reservation_id')::uuid;

  -- Pulsar dos veces: la misma clave devuelve lo mismo y no crea otra.
  v2 := public.s91_book(public.s91_d(10), '21:00', 4, 'Lucía Fernández', '+34612345678', 'manual', false, 'clave-1');
  perform public.s91_is(v2, 'replayed', 'true', 'RN-RES-02 idempotencia');
  if (v2 ->> 'reservation_id')::uuid <> v_id then
    raise exception 'RN-RES-02 FALLIDO: la misma clave creó otra reserva';
  end if;
  perform public.s91_server();
  set local role postgres;
  select count(*) into v_n from public.reservations where idempotency_key = 'clave-1';
  if v_n <> 1 then
    raise exception 'RN-RES-02 FALLIDO: la clave de idempotencia creó % reservas', v_n;
  end if;

  -- Evento y auditoría de la creación.
  if not exists (select 1 from public.reservation_events where reservation_id = v_id and type = 'created' and actor_type = 'member' and actor_label is null) then
    raise exception 'RN-RES-12 FALLIDO: falta el evento "created" de un miembro';
  end if;
  if not exists (select 1 from public.audit_log where entity_id = v_id and action = 'reservations.booking_created' and actor_id = 'da000000-0000-0000-0000-000000000004') then
    raise exception 'RN-RES-12 FALLIDO: falta el apunte de auditoría de la creación';
  end if;
  if not exists (select 1 from public.reservations where id = v_id and is_new = false and whatsapp_consent and created_by_user_id = 'da000000-0000-0000-0000-000000000004') then
    raise exception 'RN-RES-02 FALLIDO: una manual no es "Nueva", lleva el consentimiento y quién la creó';
  end if;
end $$;

do $$
declare
  v jsonb;
begin
  -- La plataforma llena el turno (53 + 4 = 57); entra siempre. Sin sesión (servidor).
  perform public.s91_server();
  v := public.s91_book(public.s91_d(10), '21:30', 53, 'Grupo TheFork', '+34600000053', 'platform', false, null,
                       'da000000-0000-0000-0000-000000000020', null, null, null, 'TheFork');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-02 plataforma');
  perform public.s91_is(v, 'over_capacity_by', '0', 'RN-RES-02 plataforma');

  -- Manual de 6: se pasa en 3 → avisa y NO guarda.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(public.s91_d(10), '22:00', 6, 'Mesa Seis', '+34600000006');
  perform public.s91_is(v, 'outcome', 'needs_confirmation', 'RN-RES-02 manual avisa');
  perform public.s91_is(v, 'overflow_by', '3', 'RN-RES-02 manual avisa');
  perform public.s91_is(v, 'occupied_after', '63', 'RN-RES-02 manual avisa');
  perform public.s91_is(v, 'capacity', '60', 'RN-RES-02 manual avisa');
  set local role postgres;
  if exists (select 1 from public.reservations where customer_name = 'Mesa Seis') then
    raise exception 'RN-RES-02 FALLIDO: el aviso de aforo guardó la reserva';
  end if;

  -- Con `force` entra y el turno queda 63/60.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(public.s91_d(10), '22:00', 6, 'Mesa Seis', '+34600000006', 'manual', true);
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-02 manual forzada');
  perform public.s91_is(v, 'over_capacity_by', '3', 'RN-RES-02 manual forzada');

  -- La misma desde el agente o la web: `full`.
  perform public.s91_server();
  v := public.s91_book(public.s91_d(10), '20:30', 2, 'Del Agente', '+34600000011', 'agent');
  perform public.s91_is(v, 'reason', 'full', 'RN-RES-02 agente');
  v := public.s91_book(public.s91_d(10), '20:30', 2, 'De la Web', '+34600000012', 'web');
  perform public.s91_is(v, 'reason', 'full', 'RN-RES-02 web');
  -- Una plataforma, otra vez: entra aunque el turno esté pasado de aforo.
  v := public.s91_book(public.s91_d(10), '20:30', 2, 'Otra Plataforma', '+34600000013', 'platform', false, null,
                       'da000000-0000-0000-0000-000000000020', null, null, null, 'CoverManager');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-02 plataforma sobre aforo');

  -- Fuera de turno (17:00) una plataforma entra SIN turno ("Fuera de turno").
  v := public.s91_book(public.s91_d(10), '17:00', 4, 'Fuera De Turno', '+34600000014', 'platform', false, null,
                       'da000000-0000-0000-0000-000000000020', null, null, null, 'TheFork');
  perform public.s91_is(v, 'out_of_shift', 'true', 'RN-RES-02 fuera de turno');
  -- Y en un día cerrado también.
  v := public.s91_book(public.s91_d(12), '21:00', 4, 'Dia Cerrado', '+34600000015', 'platform', false, null,
                       'da000000-0000-0000-0000-000000000020', null, null, null, 'TheFork');
  perform public.s91_is(v, 'out_of_shift', 'true', 'RN-RES-02 día cerrado');
  set local role postgres;
  if (select count(*) from public.reservations where shift_id is null and source = 'platform') <> 2 then
    raise exception 'RN-RES-02 FALLIDO: las dos de plataforma fuera de turno deberían tener shift_id nulo';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-RES-03 · antelación y fechas
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  perform public.s91_server();
  -- Con un mínimo de 5 días (7200 min), pasado mañana es too_soon y dentro de 6 días, no.
  set local role postgres;
  update public.reservation_settings set min_notice_minutes = 7200 where establishment_id = 'da000000-0000-0000-0000-000000000020';
  perform public.s91_server();
  v := public.s91_book(public.s91_d(2), '21:00', 2, 'Tarde', '+34600000021', 'agent');
  perform public.s91_is(v, 'reason', 'too_soon', 'RN-RES-03 mínimo (agente)');
  v := public.s91_book(public.s91_d(2), '21:00', 2, 'Tarde', '+34600000021', 'web');
  perform public.s91_is(v, 'reason', 'too_soon', 'RN-RES-03 mínimo (web)');
  v := public.s91_book(public.s91_d(6), '21:00', 2, 'Con Antelacion', '+34600000020', 'agent');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-03 pasado el mínimo');
  -- Un cambio de hora que se queda dentro del mínimo también se rechaza.
  v := public.s91_book(public.s91_d(2), '21:00', 2, 'Con Antelacion', '+34600000020', 'agent', false, null, 'da000000-0000-0000-0000-000000000020', (v ->> 'reservation_id')::uuid);
  perform public.s91_is(v, 'reason', 'too_soon', 'RN-RES-03 editar hacia dentro del mínimo');
  -- La manual y la plataforma no tienen mínimo.
  v := public.s91_book(public.s91_d(2), '21:00', 2, 'Manual Cerca', '+34600000029', 'platform', false, null, 'da000000-0000-0000-0000-000000000020', null, null, null, 'TheFork');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-03 plataforma sin mínimo');
  set local role postgres;
  update public.reservation_settings set min_notice_minutes = 120 where establishment_id = 'da000000-0000-0000-0000-000000000020';
  perform public.s91_server();
  -- Más allá de 60 días → too_far.
  v := public.s91_book(public.s91_d(61), '21:00', 2, 'Lejos', '+34600000022', 'agent');
  perform public.s91_is(v, 'reason', 'too_far', 'RN-RES-03 máximo');
  -- La plataforma no tiene límite de antelación.
  v := public.s91_book(public.s91_d(90), '21:00', 2, 'Lejos Plataforma', '+34600000023', 'platform', false, null,
                       'da000000-0000-0000-0000-000000000020', null, null, null, 'TheFork');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-03 plataforma sin límite');

  -- Manual: sin límite de antelación (mañana a primera hora vale), pero no en fechas pasadas.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(public.s91_d(1), '20:00', 2, 'Mañana', '+34600000024');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-03 manual sin límite');
  v := public.s91_book(public.s91_d(-1), '21:00', 2, 'Ayer', '+34600000025');
  perform public.s91_is(v, 'reason', 'past_date', 'RN-RES-03 manual en el pasado');
  -- Día cerrado y hora que no es hueco.
  v := public.s91_book(public.s91_d(12), '21:00', 2, 'Cerrado', '+34600000026');
  perform public.s91_is(v, 'reason', 'closed_day', 'RN-RES-01 día cerrado');
  v := public.s91_book(public.s91_d(11), '21:15', 2, 'Sin Hueco', '+34600000027');
  perform public.s91_is(v, 'reason', 'not_a_slot', 'RN-RES-01 hora que no es hueco');
  v := public.s91_book(public.s91_d(11), '23:00', 2, 'Tarde Del Todo', '+34600000028');
  perform public.s91_is(v, 'reason', 'not_a_slot', 'RN-RES-01 después de la última hora');
end $$;

-- ------------------------------------------------------------
-- RN-RES-05 · grupos grandes, confirmar y rechazar
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_pend uuid;
  v_pend2 uuid;
begin
  perform public.s91_server();
  v := public.s91_book(public.s91_d(11), '21:00', 9, 'Grupo Agente', '+34600000031', 'agent');
  perform public.s91_is(v, 'status', 'pending', 'RN-RES-05 agente ≥ umbral');
  v_pend := (v ->> 'reservation_id')::uuid;
  v := public.s91_book(public.s91_d(11), '21:00', 8, 'Casi Grupo', '+34600000032', 'agent');
  perform public.s91_is(v, 'status', 'confirmed', 'RN-RES-05 agente por debajo del umbral');
  v := public.s91_book(public.s91_d(11), '21:30', 12, 'Grupo Web', '+34600000033', 'web');
  perform public.s91_is(v, 'status', 'pending', 'RN-RES-05 web ≥ umbral');
  v_pend2 := (v ->> 'reservation_id')::uuid;
  set local role postgres;
  if not exists (select 1 from public.reservations where id = v_pend and is_new) then
    raise exception 'RN-RES-02 FALLIDO: una reserva del agente nace como "Nueva"';
  end if;

  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  -- Manual de 12: confirmada.
  v := public.s91_book(public.s91_d(11), '22:00', 12, 'Grupo Manual', '+34600000034');
  perform public.s91_is(v, 'status', 'confirmed', 'RN-RES-05 manual ≥ umbral');

  -- Confirmar: pending → confirmed; repetir no duplica el evento.
  v := public.confirm_reservation('da000000-0000-0000-0000-000000000020', v_pend);
  perform public.s91_is(v, 'outcome', 'done', 'RN-RES-05 confirmar');
  v := public.confirm_reservation('da000000-0000-0000-0000-000000000020', v_pend);
  perform public.s91_is(v, 'outcome', 'unchanged', 'RN-RES-05 confirmar dos veces');
  -- Rechazar una pendiente: cancelled con motivo `rejected`.
  v := public.reject_reservation('da000000-0000-0000-0000-000000000020', v_pend2);
  perform public.s91_is(v, 'outcome', 'done', 'RN-RES-05 rechazar');
  -- Rechazar una ya confirmada: transición no válida.
  v := public.reject_reservation('da000000-0000-0000-0000-000000000020', v_pend);
  perform public.s91_is(v, 'reason', 'invalid_transition', 'RN-RES-05 rechazar una confirmada');
  -- Confirmar una rechazada: no vuelve (una cancelada es final).
  v := public.confirm_reservation('da000000-0000-0000-0000-000000000020', v_pend2);
  perform public.s91_is(v, 'reason', 'invalid_transition', 'RN-RES-05 una cancelada es final');

  set local role postgres;
  if (select count(*) from public.reservation_events where reservation_id = v_pend and type = 'confirmed') <> 1 then
    raise exception 'RN-RES-05 FALLIDO: confirmar dos veces duplicó el evento';
  end if;
  if not exists (select 1 from public.reservations where id = v_pend2 and status = 'cancelled' and cancel_reason = 'rejected') then
    raise exception 'RN-RES-05 FALLIDO: rechazar debería dejar cancel_reason = rejected';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-RES-07 · editar
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_id uuid;
  v_plat uuid;
  v_agent uuid;
  v_ev jsonb;
begin
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(public.s91_d(20), '21:00', 4, 'Edita Pepe', '+34600000041');
  v_id := (v ->> 'reservation_id')::uuid;

  -- Cambiar la hora y las personas: reaplica reglas y deja el cambio sin datos personales.
  v := public.s91_book(public.s91_d(20), '21:30', 6, 'Edita Pepe', '+34600000041', 'manual', false, null, 'da000000-0000-0000-0000-000000000020', v_id);
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-07 cambiar hora y personas');
  set local role postgres;
  select e.data into v_ev from public.reservation_events e where e.reservation_id = v_id and e.type = 'updated' order by e.created_at desc limit 1;
  if v_ev -> 'changed' <> '["time", "party_size"]'::jsonb or v_ev ->> 'time_from' <> '21:00:00' or v_ev ->> 'time_to' <> '21:30:00'
     or v_ev ->> 'party_size_from' <> '4' or v_ev ->> 'party_size_to' <> '6' then
    raise exception 'RN-RES-07 FALLIDO: el evento de edición no dice qué cambió: %', v_ev;
  end if;

  -- Solo el contacto: no reaplica reglas (aunque el turno estuviera lleno) y no mueve nada.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(public.s91_d(20), '21:30', 6, 'Edita Pepe Segundo', '+34600000041', 'manual', false, null, 'da000000-0000-0000-0000-000000000020', v_id, null, 'Una trona');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-07 solo contacto');
  -- Sin cambios: no escribe otro evento.
  v := public.s91_book(public.s91_d(20), '21:30', 6, 'Edita Pepe Segundo', '+34600000041', 'manual', false, null, 'da000000-0000-0000-0000-000000000020', v_id, null, 'Una trona');
  perform public.s91_is(v, 'unchanged', 'true', 'RN-RES-07 sin cambios');
  set local role postgres;
  if (select count(*) from public.reservation_events where reservation_id = v_id and type = 'updated') <> 2 then
    raise exception 'RN-RES-07 FALLIDO: una edición sin cambios escribió un evento';
  end if;

  -- Una reserva de plataforma no cambia fecha, hora ni personas desde aquí.
  perform public.s91_server();
  v := public.s91_book(public.s91_d(20), '21:00', 2, 'De Plataforma', '+34600000042', 'platform', false, null, 'da000000-0000-0000-0000-000000000020', null, null, null, 'TheFork');
  v_plat := (v ->> 'reservation_id')::uuid;
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(public.s91_d(20), '22:00', 2, 'De Plataforma', '+34600000042', 'manual', false, null, 'da000000-0000-0000-0000-000000000020', v_plat);
  perform public.s91_is(v, 'reason', 'platform_locked', 'RN-RES-07 plataforma bloqueada');
  -- Nombre y nota sí.
  v := public.s91_book(public.s91_d(20), '21:00', 2, 'De Plataforma Cambiado', '+34600000042', 'manual', false, null, 'da000000-0000-0000-0000-000000000020', v_plat, null, 'Nota local');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-07 plataforma, solo contacto');

  -- El agente sube una confirmada al umbral → pendiente; bajarla no la confirma.
  perform public.s91_server();
  v := public.s91_book(public.s91_d(21), '21:00', 4, 'Sube Agente', '+34600000043', 'agent');
  v_agent := (v ->> 'reservation_id')::uuid;
  v := public.s91_book(public.s91_d(21), '21:00', 10, 'Sube Agente', '+34600000043', 'agent', false, null, 'da000000-0000-0000-0000-000000000020', v_agent);
  perform public.s91_is(v, 'status', 'pending', 'RN-RES-07 agente sube al umbral');
  v := public.s91_book(public.s91_d(21), '21:00', 3, 'Sube Agente', '+34600000043', 'agent', false, null, 'da000000-0000-0000-0000-000000000020', v_agent);
  perform public.s91_is(v, 'status', 'pending', 'RN-RES-07 bajar una pendiente no la confirma');
  -- Un cambio de personas hecho por el restaurante no cambia el estado.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(public.s91_d(21), '21:00', 12, 'Sube Agente', '+34600000043', 'manual', false, null, 'da000000-0000-0000-0000-000000000020', v_agent);
  perform public.s91_is(v, 'status', 'pending', 'RN-RES-07 el restaurante no cambia el estado');

  -- Una cancelada no se edita.
  v := public.cancel_reservation('da000000-0000-0000-0000-000000000020', v_id, 'other');
  v := public.s91_book(public.s91_d(20), '21:30', 6, 'Edita Pepe', '+34600000041', 'manual', false, null, 'da000000-0000-0000-0000-000000000020', v_id);
  perform public.s91_is(v, 'reason', 'not_editable', 'RN-RES-07 una cancelada no se edita');
end $$;

-- ------------------------------------------------------------
-- RN-RES-06 · posibles duplicadas
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_d1 date := public.s91_d(30);
begin
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(v_d1, '21:00', 2, 'Laura Vega', '+34600000051');
  v_a := (v ->> 'reservation_id')::uuid;
  v := public.s91_book(v_d1, '22:00', 2, 'Laura V.', '+34600000051');
  v_b := (v ->> 'reservation_id')::uuid;
  v := public.s91_book(v_d1 + 1, '21:00', 2, 'Laura Vega otro día', '+34600000051');
  v_c := (v ->> 'reservation_id')::uuid;
  set local role postgres;
  if (select count(*) from public.reservations where id in (v_a, v_b) and duplicate_flag = 'possible') <> 2 then
    raise exception 'RN-RES-06 FALLIDO: mismo día y mismo teléfono deberían marcarse las dos';
  end if;
  if (select duplicate_flag from public.reservations where id = v_c) <> 'none' then
    raise exception 'RN-RES-06 FALLIDO: otro día no es duplicada';
  end if;

  -- Al cancelar una, la otra vuelve a none.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.cancel_reservation('da000000-0000-0000-0000-000000000020', v_b, 'error');
  set local role postgres;
  if (select count(*) from public.reservations where id in (v_a, v_b) and duplicate_flag = 'possible') <> 0 then
    raise exception 'RN-RES-06 FALLIDO: al cancelar una, la otra debe dejar de estar marcada';
  end if;

  -- "No es duplicada": dos nuevas del mismo teléfono y un día, descartadas, no se vuelven a marcar.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(v_d1 + 2, '21:00', 2, 'Pareja Uno', '+34600000052');
  v_a := (v ->> 'reservation_id')::uuid;
  v := public.s91_book(v_d1 + 2, '21:30', 2, 'Pareja Dos', '+34600000052');
  v_b := (v ->> 'reservation_id')::uuid;
  v := public.dismiss_duplicate('da000000-0000-0000-0000-000000000020', v_b, v_a);
  perform public.s91_is(v, 'outcome', 'done', 'RN-RES-06 No es duplicada');
  v := public.dismiss_duplicate('da000000-0000-0000-0000-000000000020', v_a, v_b);
  perform public.s91_is(v, 'outcome', 'unchanged', 'RN-RES-06 descartar dos veces');
  -- Editar una de ellas recalcula, y el par descartado sigue sin marcarse.
  v := public.s91_book(v_d1 + 2, '22:00', 2, 'Pareja Uno', '+34600000052', 'manual', false, null, 'da000000-0000-0000-0000-000000000020', v_a);
  set local role postgres;
  if (select count(*) from public.reservations where id in (v_a, v_b) and duplicate_flag = 'possible') <> 0 then
    raise exception 'RN-RES-06 FALLIDO: un par descartado se volvió a marcar al editar';
  end if;
  -- Y el par se guardó ordenado.
  if not exists (select 1 from public.reservation_duplicate_dismissals where reservation_a = least(v_a, v_b) and reservation_b = greatest(v_a, v_b)) then
    raise exception 'RN-RES-06 FALLIDO: el par descartado no está ordenado';
  end if;
  -- Cambiar el día de una reserva marcada desmarca a la que dejó atrás.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(v_d1 + 3, '21:00', 2, 'Trio Uno', '+34600000053');
  v_a := (v ->> 'reservation_id')::uuid;
  v := public.s91_book(v_d1 + 3, '21:30', 2, 'Trio Dos', '+34600000053');
  v_b := (v ->> 'reservation_id')::uuid;
  v := public.s91_book(v_d1 + 4, '21:30', 2, 'Trio Dos', '+34600000053', 'manual', false, null, 'da000000-0000-0000-0000-000000000020', v_b);
  set local role postgres;
  if (select count(*) from public.reservations where id in (v_a, v_b) and duplicate_flag = 'possible') <> 0 then
    raise exception 'RN-RES-06 FALLIDO: mover una a otro día debería desmarcar las dos';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-RES-08 · cancelar
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_a uuid;
  v_p uuid;
begin
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(public.s91_d(40), '21:00', 2, 'Cancela Uno', '+34600000061');
  v_a := (v ->> 'reservation_id')::uuid;

  perform public.s91_expect_error(
    format('select public.cancel_reservation(%L, %L, %L)', 'da000000-0000-0000-0000-000000000020', v_a, 'agent'),
    'Motivo de cancelación', 'RN-RES-08 un usuario no cancela con el motivo del agente');

  v := public.cancel_reservation('da000000-0000-0000-0000-000000000020', v_a, 'customer');
  perform public.s91_is(v, 'outcome', 'done', 'RN-RES-08 cancelar');
  v := public.cancel_reservation('da000000-0000-0000-0000-000000000020', v_a, 'customer');
  perform public.s91_is(v, 'outcome', 'unchanged', 'RN-RES-08 cancelar dos veces');
  set local role postgres;
  if (select count(*) from public.reservation_events where reservation_id = v_a and type = 'cancelled') <> 1 then
    raise exception 'RN-RES-08 FALLIDO: cancelar dos veces duplicó el evento';
  end if;
  if not exists (select 1 from public.reservations where id = v_a and status = 'cancelled' and cancel_reason = 'customer' and cancelled_at is not null) then
    raise exception 'RN-RES-08 FALLIDO: cancelar no dejó motivo y hora';
  end if;

  -- La de plataforma se cancela en la app y queda el aviso "Cancélala también en…" hasta "Hecho".
  perform public.s91_server();
  v := public.s91_book(public.s91_d(41), '21:00', 2, 'Plataforma Cancela', '+34600000062', 'platform', false, null, 'da000000-0000-0000-0000-000000000020', null, null, null, 'TheFork');
  v_p := (v ->> 'reservation_id')::uuid;
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.cancel_reservation('da000000-0000-0000-0000-000000000020', v_p, 'other');
  perform public.s91_is(v, 'pending_platform_cancel', 'true', 'RN-RES-08 plataforma');
  v := public.mark_platform_cancel_done('da000000-0000-0000-0000-000000000020', v_p);
  perform public.s91_is(v, 'outcome', 'done', 'RN-RES-08 Hecho');
  v := public.mark_platform_cancel_done('da000000-0000-0000-0000-000000000020', v_p);
  perform public.s91_is(v, 'outcome', 'unchanged', 'RN-RES-08 Hecho dos veces');
  set local role postgres;
  if (select pending_platform_cancel from public.reservations where id = v_p) then
    raise exception 'RN-RES-08 FALLIDO: "Hecho" no apagó el aviso';
  end if;
  -- Cancelar libera aforo: no cuenta para la ocupación.
  if public.reservation_occupancy('da000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000070', public.s91_d(40)) <> 0 then
    raise exception 'RN-RES-02 FALLIDO: una cancelada sigue contando para el aforo';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-RES-09 · No vino
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_ayer uuid := gen_random_uuid();
  v_hoy uuid := gen_random_uuid();
  v_man uuid := gen_random_uuid();
begin
  set local role postgres;
  -- Reservas ya pasadas (un alta manual no las admite): se insertan directamente.
  insert into public.reservations (id, space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, source) values
    (v_ayer, 'da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000070',
     public.s91_d(-1), '21:00', public.reservation_local_to_utc(public.s91_d(-1), '21:00', 'Europe/Madrid'), 2, 'Ayer Pepe', '+34600000071', 'manual'),
    (v_hoy, 'da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000070',
     public.s91_today(), '00:00', public.reservation_local_to_utc(public.s91_today(), '00:00', 'Europe/Madrid'), 2, 'Hoy Pepe', '+34600000072', 'manual'),
    (v_man, 'da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000070',
     public.s91_d(5), '21:00', public.reservation_local_to_utc(public.s91_d(5), '21:00', 'Europe/Madrid'), 2, 'Mañana Pepe', '+34600000073', 'manual');

  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  -- Todavía no es la hora: dice desde cuándo.
  v := public.mark_no_show('da000000-0000-0000-0000-000000000020', v_man);
  perform public.s91_is(v, 'reason', 'not_yet_started', 'RN-RES-09 antes de la hora');
  perform public.s91_is(v, 'available_from', '21:00', 'RN-RES-09 desde las HH:MM');

  v := public.mark_no_show('da000000-0000-0000-0000-000000000020', v_ayer);
  perform public.s91_is(v, 'outcome', 'done', 'RN-RES-09 después de la hora');
  v := public.mark_no_show('da000000-0000-0000-0000-000000000020', v_ayer);
  perform public.s91_is(v, 'outcome', 'unchanged', 'RN-RES-09 dos veces');
  -- Deshacer: solo el mismo día. La de ayer, no.
  v := public.undo_no_show('da000000-0000-0000-0000-000000000020', v_ayer);
  perform public.s91_is(v, 'reason', 'not_same_day', 'RN-RES-09 deshacer otro día');
  -- La de hoy: se marca y se deshace.
  v := public.mark_no_show('da000000-0000-0000-0000-000000000020', v_hoy);
  perform public.s91_is(v, 'outcome', 'done', 'RN-RES-09 hoy');
  v := public.undo_no_show('da000000-0000-0000-0000-000000000020', v_hoy);
  perform public.s91_is(v, 'outcome', 'done', 'RN-RES-09 deshacer el mismo día');
  v := public.undo_no_show('da000000-0000-0000-0000-000000000020', v_hoy);
  perform public.s91_is(v, 'outcome', 'unchanged', 'RN-RES-09 deshacer dos veces');
  -- Una cancelada no se marca; una pendiente tampoco.
  v := public.cancel_reservation('da000000-0000-0000-0000-000000000020', v_man, 'other');
  v := public.mark_no_show('da000000-0000-0000-0000-000000000020', v_man);
  perform public.s91_is(v, 'reason', 'invalid_transition', 'RN-RES-09 una cancelada no se marca');

  -- "No vino" no cuenta para el aforo ni forma duplicadas.
  set local role postgres;
  if public.reservation_occupancy('da000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000070', public.s91_d(-1)) <> 0 then
    raise exception 'RN-RES-02 FALLIDO: "No vino" cuenta para el aforo';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-RES-11 · con las reservas en pausa
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_id uuid;
  v_pend uuid;
begin
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(public.s91_d(50), '21:00', 2, 'Antes Pausa', '+34600000081');
  v_id := (v ->> 'reservation_id')::uuid;
  perform public.s91_server();
  v := public.s91_book(public.s91_d(50), '22:00', 10, 'Grupo Pausa', '+34600000082', 'agent');
  v_pend := (v ->> 'reservation_id')::uuid;

  set local role postgres;
  update public.reservation_settings set service_status = 'paused' where establishment_id = 'da000000-0000-0000-0000-000000000020';

  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  -- No se crea (ni se cambia fecha, hora o personas).
  v := public.s91_book(public.s91_d(50), '21:30', 2, 'En Pausa', '+34600000083');
  perform public.s91_is(v, 'reason', 'service_paused', 'RN-RES-11 crear en pausa');
  v := public.s91_book(public.s91_d(50), '22:00', 2, 'Antes Pausa', '+34600000081', 'manual', false, null, 'da000000-0000-0000-0000-000000000020', v_id);
  perform public.s91_is(v, 'reason', 'service_paused', 'RN-RES-11 cambiar la hora en pausa');
  -- Sí se cambian nombre y nota, se cancela, se confirma y se rechaza.
  v := public.s91_book(public.s91_d(50), '21:00', 2, 'Antes Pausa Cambiada', '+34600000081', 'manual', false, null, 'da000000-0000-0000-0000-000000000020', v_id, null, 'Nota');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-11 nombre y nota en pausa');
  v := public.confirm_reservation('da000000-0000-0000-0000-000000000020', v_pend);
  perform public.s91_is(v, 'outcome', 'done', 'RN-RES-11 confirmar en pausa');
  v := public.cancel_reservation('da000000-0000-0000-0000-000000000020', v_id, 'other');
  perform public.s91_is(v, 'outcome', 'done', 'RN-RES-11 cancelar en pausa');
  -- Una plataforma sigue entrando.
  perform public.s91_server();
  v := public.s91_book(public.s91_d(50), '21:00', 2, 'Plataforma En Pausa', '+34600000084', 'platform', false, null, 'da000000-0000-0000-0000-000000000020', null, null, null, 'TheFork');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-11 plataforma en pausa');

  -- Con la baja pedida, el agente no acepta más allá del final del periodo pagado.
  set local role postgres;
  update public.reservation_settings set service_status = 'ending', ending_at = (public.s91_d(20)::timestamp at time zone 'Europe/Madrid')
  where establishment_id = 'da000000-0000-0000-0000-000000000020';
  perform public.s91_server();
  v := public.s91_book(public.s91_d(21), '21:00', 2, 'Tras La Baja', '+34600000085', 'agent');
  perform public.s91_is(v, 'reason', 'too_far', 'RN-RES-03 agente tras el fin del periodo pagado');
  v := public.s91_book(public.s91_d(19), '21:00', 2, 'Antes De La Baja', '+34600000086', 'agent');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-03 agente antes del fin del periodo pagado');

  -- Sin servicio (pendiente de pago o cerrada) no hay agenda.
  set local role postgres;
  update public.reservation_settings set service_status = 'approved_pending_payment' where establishment_id = 'da000000-0000-0000-0000-000000000020';
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  perform public.s91_expect_error(
    format('select public.s91_book(%L, %L, 2, %L, %L)', public.s91_d(50), '21:00', 'Sin Servicio', '+34600000087'),
    'no está disponible', 'RN-RES-11 sin servicio no hay agenda');
  set local role postgres;
  update public.reservation_settings set service_status = 'active', ending_at = null where establishment_id = 'da000000-0000-0000-0000-000000000020';
end $$;

-- ------------------------------------------------------------
-- RN-RES-12 · quién escribe y qué queda escrito
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_n integer;
begin
  -- El Encargado (Editor con "Gestionar Reservas") escribe.
  perform public.s91_as('da000000-0000-0000-0000-000000000005');
  v := public.s91_book(public.s91_d(60), '21:00', 2, 'Del Encargado', '+34600000091');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-12 el Encargado escribe');

  -- Quien no: el Editor sin el permiso, un extraño, el trabajador, el administrador del
  -- espacio sin sesión de soporte y el propietario de OTRO restaurante.
  perform public.s91_as('da000000-0000-0000-0000-000000000006');
  perform public.s91_expect_error(format('select public.s91_book(%L, %L, 2, %L, %L)', public.s91_d(61), '21:00', 'No Debe', '+34600000092'),
    'No tienes permiso', 'RN-RES-12 un Editor sin "Gestionar Reservas" no escribe');
  perform public.s91_as('da000000-0000-0000-0000-000000000008');
  perform public.s91_expect_error(format('select public.s91_book(%L, %L, 2, %L, %L)', public.s91_d(61), '21:00', 'No Debe', '+34600000092'),
    'No tienes permiso', 'RN-RES-12 un extraño no escribe');
  perform public.s91_as('da000000-0000-0000-0000-000000000009');
  perform public.s91_expect_error(format('select public.s91_book(%L, %L, 2, %L, %L)', public.s91_d(61), '21:00', 'No Debe', '+34600000092'),
    'No tienes permiso', 'RN-RES-12 un trabajador del espacio no escribe');
  perform public.s91_as('da000000-0000-0000-0000-000000000002', 'aal2');
  perform public.s91_expect_error(format('select public.s91_book(%L, %L, 2, %L, %L)', public.s91_d(61), '21:00', 'No Debe', '+34600000092'),
    'No tienes permiso', 'RN-RES-12 el administrador del espacio sin sesión de soporte no escribe');
  perform public.s91_as('da000000-0000-0000-0000-000000000007');
  perform public.s91_expect_error(format('select public.s91_book(%L, %L, 2, %L, %L)', public.s91_d(61), '21:00', 'No Debe', '+34600000092'),
    'No tienes permiso', 'RN-RES-12 el propietario de otro restaurante no escribe');
  -- Tampoco las demás operaciones.
  perform public.s91_as('da000000-0000-0000-0000-000000000007');
  perform public.s91_expect_error(
    format('select public.cancel_reservation(%L, (select id from public.reservations where customer_name = %L), %L)', 'da000000-0000-0000-0000-000000000020', 'Del Encargado', 'other'),
    'No tienes permiso|Reserva no encontrada', 'RN-RES-12 el propietario de otro restaurante no cancela');
  perform public.s91_server();
  perform public.s91_expect_error(
    format('select public.cancel_reservation(%L, %L, %L)', 'da000000-0000-0000-0000-000000000021', (select id from public.reservations where customer_name = 'Del Encargado'), 'other'),
    'Reserva no encontrada', 'RN-RES-12 una reserva no se toca desde otro restaurante');

  -- Soporte con sesión abierta, pero sin segundo paso: no.
  perform public.s91_as('da000000-0000-0000-0000-000000000003', 'aal1');
  perform public.s91_expect_error(format('select public.s91_book(%L, %L, 2, %L, %L)', public.s91_d(61), '21:00', 'Sin Aal2', '+34600000093'),
    'No tienes permiso', 'RN-RES-12 el soporte sin segundo paso no escribe');
  -- Con segundo paso: escribe, etiquetado como soporte y sin dejar su identidad al restaurante.
  perform public.s91_as('da000000-0000-0000-0000-000000000003', 'aal2');
  v := public.s91_book(public.s91_d(61), '21:00', 2, 'Del Soporte', '+34600000094');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-12 el soporte con sesión escribe');
  set local role postgres;
  if not exists (select 1 from public.reservation_events e join public.reservations r on r.id = e.reservation_id
                 where r.customer_name = 'Del Soporte' and e.type = 'created' and e.actor_type = 'restavor_support' and e.actor_label = 'Restavor (soporte)') then
    raise exception 'RN-RES-12 FALLIDO: la creación del soporte debe quedar como "Restavor (soporte)"';
  end if;

  -- Ninguna escritura directa en las tablas, ni de quien sí tiene permiso.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  perform public.s91_expect_error(
    format($f$update public.reservations set status = 'cancelled' where customer_name = %L$f$, 'Del Encargado'),
    'permission denied', 'CLAUDE.md una escritura directa en reservations');
  perform public.s91_expect_error(
    format($f$insert into public.reservation_events (space_id, establishment_id, reservation_id, type, actor_type) select space_id, establishment_id, id, 'opened', 'member' from public.reservations where customer_name = %L$f$, 'Del Encargado'),
    'permission denied|row-level security', 'CLAUDE.md una escritura directa en reservation_events');
  perform public.s91_expect_error(
    $f$delete from public.reservation_closed_dates$f$, 'permission denied', 'CLAUDE.md un borrado directo de días cerrados');

  -- Ni los eventos ni la auditoría guardan datos de comensales.
  set local role postgres;
  select count(*) into v_n from public.reservation_events
  where data::text ~* '(Lucía|Fernández|Laura|Pepe|Mesa Seis|\+34600|34612345678|@)';
  if v_n <> 0 then
    raise exception 'RN-RES-12 FALLIDO: % evento(s) con datos de comensales', v_n;
  end if;
  select count(*) into v_n from public.audit_log
  where action like 'reservations.%' and coalesce(new_value::text, '') || coalesce(old_value::text, '') ~* '(Lucía|Fernández|Laura|Pepe|Mesa Seis|\+34600|34612345678|@|customer_name|phone)';
  if v_n <> 0 then
    raise exception 'RN-RES-12 FALLIDO: % apunte(s) de auditoría con datos de comensales', v_n;
  end if;
  -- Y la restricción de la tabla sigue impidiéndolo si alguien lo intenta.
  perform public.s91_expect_error(
    $f$insert into public.reservation_events (space_id, establishment_id, reservation_id, type, actor_type, data)
       select space_id, establishment_id, id, 'updated', 'system', '{"nested":{"phone":"+34600000000"}}'::jsonb from public.reservations limit 1$f$,
    'check constraint', 'RN-RES-12 un evento con un teléfono');
end $$;

-- Las funciones internas no se abren por RPC; las públicas no están abiertas a anon.
do $$
declare
  v_f text;
  v_internas text[] := array[
    'public.reservations_actor_type(uuid, text)', 'public.reservations_settings_actor(uuid)',
    'public.reservation_local_to_utc(date, time, text)', 'public.reservation_classify_slot(uuid, date, time)',
    'public.reservation_occupancy(uuid, uuid, date, uuid)', 'public.reservation_lock_slot(uuid, date, uuid)',
    'public.reservation_log_event(uuid, uuid, text, text, text, jsonb)', 'public.reservation_audit(uuid, text, uuid, jsonb, jsonb)',
    'public.reservation_recompute_duplicates(uuid, date)', 'public.reservation_for_update(uuid, uuid)',
    'public.reservation_set_status(public.reservations, text, text, text, text, jsonb)',
    'public.reservations_affected_by_schedule(uuid, jsonb, date)', 'public.reservations_notify_team(uuid, uuid, text, text)',
    'public.reservations_remind_pending()'];
  v_publicas text[] := array[
    'public.book_reservation(uuid, uuid, date, time, integer, text, text, text, text, text, text, boolean, text, boolean, text)',
    'public.confirm_reservation(uuid, uuid)', 'public.reject_reservation(uuid, uuid)', 'public.cancel_reservation(uuid, uuid, text)',
    'public.mark_platform_cancel_done(uuid, uuid)', 'public.mark_no_show(uuid, uuid)', 'public.undo_no_show(uuid, uuid)',
    'public.dismiss_duplicate(uuid, uuid, uuid)', 'public.open_reservation(uuid, uuid)', 'public.save_reservation_shifts(uuid, jsonb)',
    'public.set_reservation_closed_date(uuid, date, text, boolean)', 'public.save_reservation_settings(uuid, integer, integer, integer, integer, integer)',
    'public.complete_reservations_onboarding(uuid)', 'public.reservations_search(uuid, text)', 'public.reservations_calendar(uuid, date)',
    'public.reservation_history(uuid, uuid)'];
begin
  set local role postgres;
  foreach v_f in array v_internas loop
    if has_function_privilege('anon', v_f::regprocedure, 'execute') or has_function_privilege('authenticated', v_f::regprocedure, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: la función interna % está abierta por RPC', v_f;
    end if;
  end loop;
  foreach v_f in array v_publicas loop
    if has_function_privilege('anon', v_f::regprocedure, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: la función % está abierta a anon', v_f;
    end if;
    if not has_function_privilege('authenticated', v_f::regprocedure, 'execute') then
      raise exception 'FALLIDO: la función % debería poder ejecutarla authenticated', v_f;
    end if;
  end loop;
  -- Lo que escribe la agenda solo lo lee el servidor: la clave de idempotencia no es de nadie.
  if has_column_privilege('authenticated', 'public.reservations', 'idempotency_key', 'select') then
    raise exception 'RN-RES-12 FALLIDO: authenticated lee reservations.idempotency_key';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-RES-01 · guardar horarios
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_shift uuid := 'da000000-0000-0000-0000-000000000070';
  v_new uuid;
  v_n integer;
  v_d date := public.s91_d(70);
begin
  perform public.s91_as('da000000-0000-0000-0000-000000000004');

  -- Validaciones de un turno.
  v := public.save_reservation_shifts('da000000-0000-0000-0000-000000000020',
    '[{"id":"da000000-0000-0000-0000-000000000070","name":"Cena","weekdays":[1,2,3,4,5,6,7],"start_time":"20:00","last_booking_time":"20:00","end_time":"23:30","capacity":60}]');
  perform public.s91_is(v, 'issue', 'start_not_before_last_booking', 'RN-RES-01 apertura < última reserva');
  v := public.save_reservation_shifts('da000000-0000-0000-0000-000000000020',
    '[{"id":"da000000-0000-0000-0000-000000000070","name":"Cena","weekdays":[1,2,3,4,5,6,7],"start_time":"20:00","last_booking_time":"23:45","end_time":"23:30","capacity":60}]');
  perform public.s91_is(v, 'issue', 'last_booking_after_end', 'RN-RES-01 última reserva ≤ cierre');
  v := public.save_reservation_shifts('da000000-0000-0000-0000-000000000020',
    '[{"id":"da000000-0000-0000-0000-000000000070","name":"Cena","weekdays":[1,2,3,4,5,6,7],"start_time":"20:00","last_booking_time":"22:30","end_time":"23:30","capacity":0}]');
  perform public.s91_is(v, 'issue', 'capacity_not_positive', 'RN-RES-01 aforo > 0');
  v := public.save_reservation_shifts('da000000-0000-0000-0000-000000000020',
    '[{"id":"da000000-0000-0000-0000-000000000070","name":"Cena","weekdays":[],"start_time":"20:00","last_booking_time":"22:30","end_time":"23:30","capacity":60}]');
  perform public.s91_is(v, 'issue', 'weekdays_empty', 'RN-RES-01 al menos un día');

  -- Dos turnos del mismo día no se solapan en horas de reserva.
  v := public.save_reservation_shifts('da000000-0000-0000-0000-000000000020',
    '[{"id":"da000000-0000-0000-0000-000000000070","name":"Cena","weekdays":[1,2,3,4,5,6,7],"start_time":"20:00","last_booking_time":"22:30","end_time":"23:30","capacity":60},
      {"name":"Cena tardía","weekdays":[5,6],"start_time":"22:00","last_booking_time":"23:00","end_time":"23:30","capacity":20}]');
  perform public.s91_is(v, 'issue', 'overlap', 'RN-RES-01 solape de turnos');
  -- En días distintos sí pueden coincidir.
  v := public.save_reservation_shifts('da000000-0000-0000-0000-000000000020',
    '[{"id":"da000000-0000-0000-0000-000000000070","name":"Cena","weekdays":[1,2,3,4,7],"start_time":"20:00","last_booking_time":"22:30","end_time":"23:30","capacity":60},
      {"name":"Cena fin de semana","weekdays":[5,6],"start_time":"20:30","last_booking_time":"23:00","end_time":"23:59","capacity":80}]');
  perform public.s91_is(v, 'outcome', 'blocked', 'RN-RES-01 quitar viernes y sábado con reservas futuras');
  set local role postgres;
  select count(*) into v_n from public.reservations r
    where r.establishment_id = 'da000000-0000-0000-0000-000000000020' and r.date >= public.s91_today() and r.status in ('pending', 'confirmed')
      and r.shift_id = v_shift and extract(isodow from r.date) in (5, 6);
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  if (v ->> 'affected')::integer <> v_n or v_n = 0 then
    raise exception 'RN-RES-01 FALLIDO: dice % afectadas y hay % (el test necesita al menos una)', v ->> 'affected', v_n;
  end if;

  -- Nada cambió al bloquearse.
  set local role postgres;
  if (select weekdays from public.reservation_shifts where id = v_shift) <> '{1,2,3,4,5,6,7}'::smallint[]
     or exists (select 1 from public.reservation_shifts where name = 'Cena fin de semana') then
    raise exception 'RN-RES-01 FALLIDO: un cambio bloqueado modificó los turnos';
  end if;

  -- Quitar el turno entero con reservas futuras: bloqueado; añadir un turno nuevo no lo está.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.save_reservation_shifts('da000000-0000-0000-0000-000000000020', '[]');
  perform public.s91_is(v, 'outcome', 'blocked', 'RN-RES-01 quitar el único turno');
  v := public.save_reservation_shifts('da000000-0000-0000-0000-000000000020',
    '[{"id":"da000000-0000-0000-0000-000000000070","name":"Cena","weekdays":[1,2,3,4,5,6,7],"start_time":"20:00","last_booking_time":"22:30","end_time":"23:30","capacity":65},
      {"name":"Comida","weekdays":[2,3,4,5,6,7],"start_time":"13:00","last_booking_time":"15:00","end_time":"16:00","capacity":40}]');
  perform public.s91_is(v, 'outcome', 'saved', 'RN-RES-01 añadir un turno y cambiar el aforo');
  set local role postgres;
  select id into v_new from public.reservation_shifts where name = 'Comida' and establishment_id = 'da000000-0000-0000-0000-000000000020';
  if v_new is null or (select capacity from public.reservation_shifts where id = v_shift) <> 65 then
    raise exception 'RN-RES-01 FALLIDO: guardar horarios no aplicó los cambios';
  end if;

  -- Quitar un turno SIN reservas futuras: se desactiva (no se borra).
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.save_reservation_shifts('da000000-0000-0000-0000-000000000020',
    '[{"id":"da000000-0000-0000-0000-000000000070","name":"Cena","weekdays":[1,2,3,4,5,6,7],"start_time":"20:00","last_booking_time":"22:30","end_time":"23:30","capacity":65}]');
  perform public.s91_is(v, 'outcome', 'saved', 'RN-RES-01 quitar un turno sin reservas');
  set local role postgres;
  if not exists (select 1 from public.reservation_shifts where id = v_new and not active) then
    raise exception 'RN-RES-01 FALLIDO: quitar un turno debe desactivarlo, no borrarlo';
  end if;

  -- Días cerrados: con reservas ese día, bloqueado (y dice cuántas); sin ellas, se marca y se reabre.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(v_d, '21:00', 2, 'Para Cerrar', '+34600000101');
  v := public.set_reservation_closed_date('da000000-0000-0000-0000-000000000020', v_d, 'Obras', true);
  perform public.s91_is(v, 'outcome', 'blocked', 'RN-RES-01 cerrar un día con reservas');
  perform public.s91_is(v, 'affected', '1', 'RN-RES-01 dice cuántas');
  v := public.set_reservation_closed_date('da000000-0000-0000-0000-000000000020', public.s91_d(71), 'Obras', true);
  perform public.s91_is(v, 'outcome', 'saved', 'RN-RES-01 cerrar un día sin reservas');
  v := public.s91_book(public.s91_d(71), '21:00', 2, 'En Cerrado', '+34600000102');
  perform public.s91_is(v, 'reason', 'closed_day', 'RN-RES-01 un día cerrado no admite reservas');
  v := public.set_reservation_closed_date('da000000-0000-0000-0000-000000000020', public.s91_d(71), null, false);
  perform public.s91_is(v, 'outcome', 'saved', 'RN-RES-01 reabrir un día');
  v := public.set_reservation_closed_date('da000000-0000-0000-0000-000000000020', public.s91_d(71), null, false);
  perform public.s91_is(v, 'outcome', 'unchanged', 'RN-RES-01 reabrir dos veces');
  v := public.set_reservation_closed_date('da000000-0000-0000-0000-000000000020', public.s91_d(-3), 'Pasado', true);
  perform public.s91_is(v, 'reason', 'past_date', 'RN-RES-01 un día pasado no se cierra');
  set local role postgres;
  if (select count(*) from public.audit_log where action in ('reservations.closed_date_set', 'reservations.closed_date_removed')
      and entity_id = 'da000000-0000-0000-0000-000000000020') <> 2 then
    raise exception 'RN-RES-01 FALLIDO: cerrar y reabrir un día debe dejar dos apuntes de auditoría';
  end if;

  -- Los ajustes: validaciones y auditoría con el valor anterior y el nuevo.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.save_reservation_settings('da000000-0000-0000-0000-000000000020', 20, 9, 120, 60, 120);
  perform public.s91_is(v, 'issue', 'slot_interval', 'RN-RES-01 huecos cada 15 o 30');
  v := public.save_reservation_settings('da000000-0000-0000-0000-000000000020', 15, 1, 120, 60, 120);
  perform public.s91_is(v, 'issue', 'large_group_threshold', 'RN-RES-05 umbral de grupo');
  v := public.save_reservation_settings('da000000-0000-0000-0000-000000000020', 15, 10, 90, 45, 60);
  perform public.s91_is(v, 'outcome', 'saved', 'RN-RES-01 ajustes');
  set local role postgres;
  if not exists (select 1 from public.audit_log where action = 'reservations.settings_saved'
       and old_value ->> 'slot_interval_minutes' = '30' and new_value ->> 'slot_interval_minutes' = '15' and new_value ->> 'large_group_threshold' = '10') then
    raise exception 'RN-RES-01 FALLIDO: los ajustes no dejaron valor anterior y nuevo en la auditoría';
  end if;
  -- Con huecos cada 15, 20:15 ya es un hueco.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.s91_book(public.s91_d(72), '20:15', 2, 'Cada Quince', '+34600000103');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-01 huecos cada 15 minutos');
  -- Y se restablece para lo que sigue.
  v := public.save_reservation_settings('da000000-0000-0000-0000-000000000020', 30, 9, 120, 60, 120);
end $$;

-- Quién cambia los horarios: Propietario, Encargado, soporte con sesión y el equipo del
-- espacio (Restavor, sin ver datos de comensales); no el Editor sin permiso ni un extraño.
do $$
declare
  v jsonb;
begin
  perform public.s91_as('da000000-0000-0000-0000-000000000002', 'aal1');
  v := public.save_reservation_settings('da000000-0000-0000-0000-000000000020', 30, 9, 120, 60, 120);
  perform public.s91_is(v, 'outcome', 'saved', 'RN-RES-01 el equipo del espacio cambia los ajustes');
  -- ...pero sigue sin poder escribir una reserva ni leerlas.
  perform public.s91_expect_error(format('select public.s91_book(%L, %L, 2, %L, %L)', public.s91_d(80), '21:00', 'No Debe', '+34600000104'),
    'No tienes permiso', 'RN-RES-12 el equipo del espacio no escribe reservas');
  perform public.s91_as('da000000-0000-0000-0000-000000000005');
  v := public.save_reservation_settings('da000000-0000-0000-0000-000000000020', 30, 9, 120, 60, 120);
  perform public.s91_is(v, 'outcome', 'saved', 'RN-RES-01 el Encargado cambia los ajustes');
  perform public.s91_as('da000000-0000-0000-0000-000000000003', 'aal2');
  v := public.save_reservation_settings('da000000-0000-0000-0000-000000000020', 30, 9, 120, 60, 120);
  perform public.s91_is(v, 'outcome', 'saved', 'RN-RES-01 el soporte con sesión cambia los ajustes');
end $$;

do $$
begin
  perform public.s91_as('da000000-0000-0000-0000-000000000006');
  perform public.s91_expect_error(format('select public.save_reservation_settings(%L, 30, 9, 120, 60, 120)', 'da000000-0000-0000-0000-000000000020'),
    'No tienes permiso', 'RN-RES-01 un Editor sin "Gestionar Reservas" no cambia ajustes');
  perform public.s91_expect_error(format('select public.save_reservation_shifts(%L, %L::jsonb)', 'da000000-0000-0000-0000-000000000020', '[]'),
    'No tienes permiso', 'RN-RES-01 un Editor sin "Gestionar Reservas" no cambia turnos');
  perform public.s91_as('da000000-0000-0000-0000-000000000007');
  perform public.s91_expect_error(format('select public.complete_reservations_onboarding(%L)', 'da000000-0000-0000-0000-000000000020'),
    'No tienes permiso', 'RN-RES-01 el dueño de otro restaurante no termina el Primer uso');
  perform public.s91_as('da000000-0000-0000-0000-000000000009');
  perform public.s91_expect_error(format('select public.set_reservation_closed_date(%L, %L, %L, true)', 'da000000-0000-0000-0000-000000000020', public.s91_d(90), 'Obras'),
    'No tienes permiso', 'RN-RES-01 un trabajador del espacio no cierra días');
end $$;

-- Primer uso (RES-13): exige al menos un turno.
do $$
declare
  v jsonb;
begin
  set local role postgres;
  perform public.s91_as('da000000-0000-0000-0000-000000000007');
  v := public.complete_reservations_onboarding('da000000-0000-0000-0000-000000000021');
  perform public.s91_is(v, 'outcome', 'saved', 'RES-13 Primer uso terminado');
  v := public.complete_reservations_onboarding('da000000-0000-0000-0000-000000000021');
  perform public.s91_is(v, 'outcome', 'unchanged', 'RES-13 Primer uso, dos veces');
  set local role postgres;
  update public.reservation_shifts set active = false where establishment_id = 'da000000-0000-0000-0000-000000000020';
  update public.reservation_settings set onboarding_completed_at = null where establishment_id = 'da000000-0000-0000-0000-000000000020';
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.complete_reservations_onboarding('da000000-0000-0000-0000-000000000020');
  perform public.s91_is(v, 'reason', 'no_shifts', 'RES-13 sin turnos no se termina');
  set local role postgres;
  update public.reservation_shifts set active = true where id = 'da000000-0000-0000-0000-000000000070';
end $$;

-- ------------------------------------------------------------
-- RN-RES-09 · buscar, calendario e historial
-- ------------------------------------------------------------
do $$
declare
  v_n integer;
  v_id uuid;
  v_hist integer;
  v_nombre text;
begin
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  -- Por los 3 últimos números; por nombre sin tildes ni mayúsculas.
  select count(*) into v_n from public.reservations_search('da000000-0000-0000-0000-000000000020', '678');
  if v_n <> 1 then raise exception 'RES-09 FALLIDO: buscar "678" devolvió % filas (esperaba la de Lucía)', v_n; end if;
  select count(*) into v_n from public.reservations_search('da000000-0000-0000-0000-000000000020', '+34 612 345 678');
  if v_n <> 1 then raise exception 'RES-09 FALLIDO: buscar el teléfono entero devolvió % filas', v_n; end if;
  select count(*) into v_n from public.reservations_search('da000000-0000-0000-0000-000000000020', 'lucia fernandez');
  if v_n <> 1 then raise exception 'RES-09 FALLIDO: buscar "lucia fernandez" (sin tildes) devolvió % filas', v_n; end if;
  select count(*) into v_n from public.reservations_search('da000000-0000-0000-0000-000000000020', 'LUCÍA');
  if v_n <> 1 then raise exception 'RES-09 FALLIDO: buscar "LUCÍA" devolvió % filas', v_n; end if;
  -- Con poco texto no busca.
  select count(*) into v_n from public.reservations_search('da000000-0000-0000-0000-000000000020', '67');
  if v_n <> 0 then raise exception 'RES-09 FALLIDO: dos cifras no bastan y devolvió % filas', v_n; end if;
  select count(*) into v_n from public.reservations_search('da000000-0000-0000-0000-000000000020', 'l');
  if v_n <> 0 then raise exception 'RES-09 FALLIDO: una letra no basta y devolvió % filas', v_n; end if;
  -- Ventana: 30 días atrás y todas las futuras.
  set local role postgres;
  insert into public.reservations (space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, source)
  select 'da000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000070', d, '21:00',
         public.reservation_local_to_utc(d, '21:00', 'Europe/Madrid'), 2, 'Ventana Pepe', '+34600000199', 'manual'
  from (values (public.s91_d(-30)), (public.s91_d(-31)), (public.s91_d(300))) t(d);
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  select count(*) into v_n from public.reservations_search('da000000-0000-0000-0000-000000000020', 'ventana pepe');
  if v_n <> 2 then raise exception 'RES-09 FALLIDO: la ventana (hoy-30 y futuras, no hoy-31) devolvió % filas', v_n; end if;
  -- Un extraño o el dueño de otro restaurante no ve nada (la RLS manda: decisión 108).
  perform public.s91_as('da000000-0000-0000-0000-000000000007');
  select count(*) into v_n from public.reservations_search('da000000-0000-0000-0000-000000000020', 'lucia');
  if v_n <> 0 then raise exception 'RN-RES-12 FALLIDO: el dueño de otro restaurante busca y ve % filas', v_n; end if;
  perform public.s91_as('da000000-0000-0000-0000-000000000002', 'aal2');
  select count(*) into v_n from public.reservations_search('da000000-0000-0000-0000-000000000020', 'lucia');
  if v_n <> 0 then raise exception 'RN-RES-12 FALLIDO: el administrador del espacio sin soporte busca y ve % filas', v_n; end if;

  -- Calendario: agregado por día, origen y estado; solo pendientes y confirmadas.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  select coalesce(sum(c.reservations), 0) into v_n
  from public.reservations_calendar('da000000-0000-0000-0000-000000000020', public.s91_d(10)) c
  where c.date = public.s91_d(10);
  if v_n < 5 then raise exception 'RES-10 FALLIDO: el calendario del día 10 devolvió % reservas', v_n; end if;
  select coalesce(sum(c.people), 0) into v_n
  from public.reservations_calendar('da000000-0000-0000-0000-000000000020', public.s91_d(10)) c
  where c.date = public.s91_d(10) and c.source = 'platform';
  if v_n <> 53 + 2 + 4 then
    raise exception 'RES-10 FALLIDO: las personas de plataforma ese día suman % (esperaba 59)', v_n;
  end if;
  select count(*) into v_n from public.reservations_calendar('da000000-0000-0000-0000-000000000020', public.s91_d(10)) c where c.reservations = 0;
  if v_n <> 0 then raise exception 'RES-10 FALLIDO: aparece un día sin reservas'; end if;

  -- Historial legible: nombre de quien es del restaurante y etiquetas para el resto.
  set local role postgres;
  select id into v_id from public.reservations where customer_name = 'Sube Agente' limit 1;
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  select count(*) into v_hist from public.reservation_history('da000000-0000-0000-0000-000000000020', v_id);
  if v_hist < 3 then raise exception 'RES-03 FALLIDO: el historial de una reserva editada tiene % eventos', v_hist; end if;
  select h.actor_name into v_nombre from public.reservation_history('da000000-0000-0000-0000-000000000020', v_id) h where h.actor_type = 'agent' limit 1;
  if v_nombre <> 'Agente' then raise exception 'RES-03 FALLIDO: el agente sale como %', v_nombre; end if;
  select h.actor_name into v_nombre from public.reservation_history('da000000-0000-0000-0000-000000000020', v_id) h where h.actor_type = 'member' limit 1;
  if v_nombre <> 'Propietario A 91' then raise exception 'RES-03 FALLIDO: el propietario sale como %', v_nombre; end if;
  perform public.s91_as('da000000-0000-0000-0000-000000000003', 'aal2');
  perform public.s91_as('da000000-0000-0000-0000-000000000007');
  perform public.s91_expect_error(format('select * from public.reservation_history(%L, %L)', 'da000000-0000-0000-0000-000000000020', v_id),
    'No tienes acceso', 'RN-RES-12 el historial de otro restaurante');
  perform public.s91_as('da000000-0000-0000-0000-000000000002', 'aal2');
  perform public.s91_expect_error(format('select * from public.reservation_history(%L, %L)', 'da000000-0000-0000-0000-000000000020', v_id),
    'No tienes acceso', 'RN-RES-12 el historial sin sesión de soporte');
end $$;

-- Abrir la ficha quita "Nueva" y lo deja en el historial, una sola vez.
do $$
declare
  v jsonb;
  v_id uuid;
begin
  set local role postgres;
  select id into v_id from public.reservations where customer_name = 'Grupo Agente' limit 1;
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  v := public.open_reservation('da000000-0000-0000-0000-000000000020', v_id);
  perform public.s91_is(v, 'outcome', 'done', 'RN-RES-02 abrir quita Nueva');
  v := public.open_reservation('da000000-0000-0000-0000-000000000020', v_id);
  perform public.s91_is(v, 'outcome', 'unchanged', 'RN-RES-02 abrir dos veces');
  set local role postgres;
  if (select count(*) from public.reservation_events where reservation_id = v_id and type = 'opened') <> 1 then
    raise exception 'RN-RES-02 FALLIDO: abrir dos veces escribió dos eventos';
  end if;
  if (select is_new from public.reservations where id = v_id) then
    raise exception 'RN-RES-02 FALLIDO: abrir la ficha no quitó "Nueva"';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-RES-05 · los avisos de la agenda (campana) y el recordatorio de las 2 horas
-- ------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_n integer;
  v_destinatarios text;
begin
  set local role postgres;

  -- Una reserva nueva del agente avisa al Propietario y al Encargado, y a nadie más.
  select id into v_id from public.reservations where customer_name = 'Casi Grupo';
  select string_agg(recipient_id::text, ',' order by recipient_id::text) into v_destinatarios
  from public.notifications where entity_id = v_id and event_type = 'reservation_new';
  if v_destinatarios is distinct from 'da000000-0000-0000-0000-000000000004,da000000-0000-0000-0000-000000000005' then
    raise exception 'RN-RES-05 FALLIDO: una reserva nueva del agente avisa a % (esperaba el Propietario y el Encargado)', v_destinatarios;
  end if;
  if exists (select 1 from public.notifications where entity_id = v_id and recipient_id in (
       'da000000-0000-0000-0000-000000000006', 'da000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000009')) then
    raise exception 'RN-RES-05 FALLIDO: un Editor sin "Gestionar Reservas", el administrador del espacio o un trabajador reciben el aviso';
  end if;

  -- Un grupo pendiente tiene su propio aviso, no el de reserva nueva.
  select id into v_id from public.reservations where customer_name = 'Grupo Agente';
  if (select count(*) from public.notifications where entity_id = v_id and event_type = 'reservation_group_pending') <> 2
     or exists (select 1 from public.notifications where entity_id = v_id and event_type = 'reservation_new') then
    raise exception 'RN-RES-05 FALLIDO: un grupo pendiente avisa con "reservation_group_pending" (a dos personas) y no con "reservation_new"';
  end if;

  -- El agente que sube una confirmada al umbral deja el aviso de grupo pendiente.
  select id into v_id from public.reservations where customer_name = 'Sube Agente';
  if (select count(*) from public.notifications where entity_id = v_id and event_type = 'reservation_group_pending') <> 2 then
    raise exception 'RN-RES-05 FALLIDO: subir al umbral de grupo grande debe avisar de grupo pendiente';
  end if;

  -- Una reserva a mano no avisa a nadie: la hace el propio restaurante.
  select id into v_id from public.reservations where customer_name = 'Lucía Fernández';
  if exists (select 1 from public.notifications where entity_id = v_id) then
    raise exception 'RN-RES-05 FALLIDO: una reserva a mano no debe avisar';
  end if;

  -- Los avisos están en la campana y NADA más: ni correo ni push por la cola.
  select count(*) into v_n from public.notification_deliveries d
  join public.notifications n on n.id = d.notification_id
  where n.event_type in ('reservation_new', 'reservation_group_pending', 'reservation_group_pending_reminder');
  if v_n <> 0 then
    raise exception 'RN-RES-05 FALLIDO: % entrega(s) por correo o push en la cola de dos veces al día', v_n;
  end if;
end $$;

do $$
declare
  v_viejo uuid;
  v_nuevo uuid;
  v_n integer;
  v_recordados integer;
begin
  set local role postgres;
  -- «Sube Agente» sigue pendiente (el agente la subió al umbral) y es de una fecha futura.
  select id into v_viejo from public.reservations where customer_name = 'Sube Agente';
  -- Y un grupo recién llegado del agente, que todavía no lleva 2 horas.
  perform public.s91_server();
  v_nuevo := (public.s91_book(public.s91_d(22), '21:00', 10, 'Grupo Reciente', '+34600000199', 'agent') ->> 'reservation_id')::uuid;
  set local role postgres;

  -- A las 2 horas, un aviso más; el que lleva menos, no.
  update public.reservations set created_at = now() - interval '3 hours' where id = v_viejo;
  perform public.s91_server();
  select public.reservations_remind_pending() into v_recordados;
  set local role postgres;
  if v_recordados < 1 then
    raise exception 'RN-RES-05 FALLIDO: un grupo pendiente de hace 3 horas debía recordarse';
  end if;
  if (select pending_reminded_at from public.reservations where id = v_viejo) is null then
    raise exception 'RN-RES-05 FALLIDO: el recordatorio no dejó pending_reminded_at';
  end if;
  if (select pending_reminded_at from public.reservations where id = v_nuevo) is not null then
    raise exception 'RN-RES-05 FALLIDO: un grupo de hace menos de 2 horas no se recuerda todavía';
  end if;
  select count(*) into v_n from public.notifications where entity_id = v_viejo and event_type = 'reservation_group_pending_reminder';
  if v_n <> 2 then
    raise exception 'RN-RES-05 FALLIDO: el recordatorio llega a % persona(s) (esperaba el Propietario y el Encargado)', v_n;
  end if;

  -- Una sola vez, y nunca caduca solo (sigue pendiente).
  perform public.s91_server();
  select public.reservations_remind_pending() into v_recordados;
  set local role postgres;
  if v_recordados <> 0 then
    raise exception 'RN-RES-05 FALLIDO: repetir la tarea volvió a recordar % grupo(s)', v_recordados;
  end if;
  select count(*) into v_n from public.notifications where entity_id = v_viejo and event_type = 'reservation_group_pending_reminder';
  if v_n <> 2 then
    raise exception 'RN-RES-05 FALLIDO: repetir la tarea duplicó el recordatorio (% avisos)', v_n;
  end if;
  if (select status from public.reservations where id = v_viejo) <> 'pending' then
    raise exception 'RN-RES-05 FALLIDO: un grupo pendiente no caduca solo';
  end if;

  -- Un grupo cancelado o de un día pasado no se recuerda.
  update public.reservations set created_at = now() - interval '3 hours' where id = v_nuevo;
  update public.reservations set status = 'cancelled', cancel_reason = 'rejected', cancelled_at = now() where id = v_nuevo;
  perform public.s91_server();
  perform public.reservations_remind_pending();
  set local role postgres;
  if (select pending_reminded_at from public.reservations where id = v_nuevo) is not null then
    raise exception 'RN-RES-05 FALLIDO: un grupo ya rechazado no se recuerda';
  end if;

  -- La tarea es del servidor: ni una persona con sesión ni anon la lanzan por RPC.
  perform public.s91_as('da000000-0000-0000-0000-000000000004');
  perform public.s91_expect_error('select public.reservations_remind_pending()', 'permission denied', 'CLAUDE.md el recordatorio solo lo lanza el servidor');
  set local role postgres;
end $$;

-- ------------------------------------------------------------
-- RN-RES-01 · la hora local → UTC en los cambios de hora de Madrid
-- ------------------------------------------------------------
do $$
begin
  set local role postgres;
  -- Verano (CEST, +02:00) y invierno (CET, +01:00).
  if public.reservation_local_to_utc('2026-09-26', '21:00', 'Europe/Madrid') <> '2026-09-26 19:00+00'::timestamptz then
    raise exception 'RN-RES-01 FALLIDO: 26/09 21:00 en Madrid no es 19:00 UTC';
  end if;
  if public.reservation_local_to_utc('2026-12-24', '21:00', 'Europe/Madrid') <> '2026-12-24 20:00+00'::timestamptz then
    raise exception 'RN-RES-01 FALLIDO: 24/12 21:00 en Madrid no es 20:00 UTC';
  end if;
  -- La hora que no existe (29/03/2026, 02:00 → 03:00): nula.
  if public.reservation_local_to_utc('2026-03-29', '02:30', 'Europe/Madrid') is not null then
    raise exception 'RN-RES-01 FALLIDO: 02:30 del 29/03 no existe y debería devolver nulo';
  end if;
  -- La que ocurre dos veces (25/10/2026, 03:00 → 02:00): la primera, la del horario de verano (00:30 UTC).
  if public.reservation_local_to_utc('2026-10-25', '02:30', 'Europe/Madrid') <> '2026-10-25 00:30+00'::timestamptz then
    raise exception 'RN-RES-01 FALLIDO: 02:30 del 25/10 debería ser la primera (00:30 UTC), la del horario de verano';
  end if;
end $$;

-- Una reserva de plataforma (sin límite de fecha) a una hora que no existe se rechaza; a la
-- que ocurre dos veces, se guarda con la primera.
do $$
declare
  v jsonb;
  v_id uuid;
begin
  perform public.s91_server();
  v := public.s91_book('2026-03-29', '02:30', 2, 'Hora Inexistente', '+34600000301', 'platform', false, null,
                       'da000000-0000-0000-0000-000000000020', null, null, null, 'TheFork');
  perform public.s91_is(v, 'reason', 'invalid_time', 'RN-RES-01 hora que no existe');
  v := public.s91_book('2026-10-25', '02:30', 2, 'Hora Doble', '+34600000302', 'platform', false, null,
                       'da000000-0000-0000-0000-000000000020', null, null, null, 'TheFork');
  perform public.s91_is(v, 'outcome', 'accepted', 'RN-RES-01 hora que ocurre dos veces');
  v_id := (v ->> 'reservation_id')::uuid;
  set local role postgres;
  if (select starts_at from public.reservations where id = v_id) <> '2026-10-25 00:30+00'::timestamptz then
    raise exception 'RN-RES-01 FALLIDO: la reserva de las 02:30 del 25/10 debería guardarse como la primera (00:30 UTC)';
  end if;
end $$;

select 'la_agenda: OK' as resultado;

rollback;
