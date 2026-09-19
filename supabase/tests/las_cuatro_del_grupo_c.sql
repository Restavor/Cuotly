-- Paso 2 · las cuatro del grupo C (migración 100, PRD §38).
--
--   · RN-TRA: transferir un restaurante a otro espacio, con dos firmas.
--   · RN-BCK: las copias de seguridad, una al día y treinta guardadas.
--   · RN-CAN: los canales internos del espacio, con miembros a mano.
--   · RN-REC: el aviso del día del vencimiento de un cobro.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/las_cuatro_del_grupo_c.sql

insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('bb100000-0000-0000-0000-000000000001', 'gc-origen@example.com', 'authenticated', 'authenticated'),
  ('bb100000-0000-0000-0000-000000000002', 'gc-destino@example.com', 'authenticated', 'authenticated'),
  ('bb100000-0000-0000-0000-000000000003', 'gc-trabajadora@example.com', 'authenticated', 'authenticated'),
  ('bb100000-0000-0000-0000-000000000004', 'gc-cliente@bar-grupoc.test', 'authenticated', 'authenticated'),
  ('bb100000-0000-0000-0000-000000000005', 'gc-ajena@example.com', 'authenticated', 'authenticated');

select set_config('request.jwt.claim.aal', 'aal2', false);

create temp table gc_ids (k text primary key, v uuid);
grant select, insert, update on gc_ids to anon, authenticated, service_role;

-- ============================================================
-- Fixtures · dos espacios, cada uno con su propietario
-- ============================================================
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Origen SL', 'Dueño Origen', 'gc-origen@example.com', 'pro', '600111333');
  perform public.submit_space_request(v_id);
  insert into gc_ids values ('sol_origen', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Destino SL', 'Dueña Destino', 'gc-destino@example.com', 'pro', '600111444');
  perform public.submit_space_request(v_id);
  insert into gc_ids values ('sol_destino', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  insert into gc_ids values ('origen',
    public.approve_space_request((select v from gc_ids where k = 'sol_origen'), 'gc-origen'));
  insert into gc_ids values ('destino',
    public.approve_space_request((select v from gc_ids where k = 'sol_destino'), 'gc-destino'));
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_est uuid;
begin
  insert into public.space_memberships (space_id, user_id, role, status)
  values ((select v from gc_ids where k = 'origen'),
          'bb100000-0000-0000-0000-000000000003', 'worker', 'active');

  v_est := public.create_establishment_with_data(
    (select v from gc_ids where k = 'origen'), 'Bar Grupo C', null, 'Grupo C');
  insert into gc_ids values ('rest', v_est);

  perform public.grant_establishment_access(
    v_est, 'gc-cliente@bar-grupoc.test', 'local_owner', false, true);

  -- Una autorización de la trabajadora sobre ese restaurante: RN-TRA-08
  -- tiene que retirarla al transferir.
  insert into public.worker_establishments (space_id, user_id, establishment_id, created_by)
  values ((select v from gc_ids where k = 'origen'),
          'bb100000-0000-0000-0000-000000000003', v_est,
          'bb100000-0000-0000-0000-000000000001');
end $$;
reset role;

-- Trabajo del restaurante: una solicitud enviada, para comprobar que viaja.
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_req uuid;
begin
  v_req := public.create_request_draft(
    (select v from gc_ids where k = 'rest'), 'Cambiar el teléfono de la web', null);
  perform public.submit_request(v_req);
  insert into gc_ids values ('sol_rest', v_req);
end $$;
reset role;

-- ============================================================
-- RN-TRA-02 · hacen falta dos firmas: el origen propone
-- ============================================================
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  -- Una trabajadora del origen no propone una transferencia: esto saca al
  -- restaurante del espacio entero, no lo administra dentro.
  begin
    perform public.propose_establishment_transfer(
      (select v from gc_ids where k = 'rest'), (select v from gc_ids where k = 'destino'), 'Prueba');
    raise exception 'RN-TRA-02 FALLIDO: una trabajadora propuso una transferencia'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-TRA-02 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_t uuid;
begin
  v_t := public.propose_establishment_transfer(
    (select v from gc_ids where k = 'rest'),
    (select v from gc_ids where k = 'destino'),
    'El grupo se lleva la gestión a otro proveedor');
  insert into gc_ids values ('transfer', v_t);

  -- RN-TRA-03 · mientras la propuesta está abierta el restaurante sigue
  -- ENTERO en el origen. No hay limbo.
  if (select space_id from public.establishments where id = (select v from gc_ids where k = 'rest'))
     <> (select v from gc_ids where k = 'origen') then
    raise exception 'RN-TRA-03 FALLIDO: proponer movió el restaurante'
      using errcode = 'assert_failure';
  end if;

  -- RN-TRA-06 · una propuesta viva por restaurante.
  begin
    perform public.propose_establishment_transfer(
      (select v from gc_ids where k = 'rest'), (select v from gc_ids where k = 'destino'), 'Otra');
    raise exception 'RN-TRA-06 FALLIDO: se abrió una segunda propuesta'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-TRA-06 FALLIDO%' then raise; end if;
  end;

  -- RN-TRA-09 · en el libro del origen. El del destino se comprueba desde
  -- el destino, y no desde aquí, por una razón que este test aprendió a
  -- base de ponerse rojo: la política de `audit_log` deja leer a cada uno
  -- lo SUYO, así que contar dos desde una sola sesión no es que fallara la
  -- función, es que el propietario del origen no puede ver el libro ajeno.
  -- Que no se pueda es justamente lo que hay que comprobar.
  if not exists (
    select 1 from public.audit_log
    where action = 'establishment_transfer.proposed'
      and entity_id = (select v from gc_ids where k = 'rest')
      and space_id = (select v from gc_ids where k = 'origen')
  ) then
    raise exception 'RN-TRA-09 FALLIDO: la propuesta no quedó en el libro del origen'
      using errcode = 'assert_failure';
  end if;

  if exists (
    select 1 from public.audit_log
    where entity_id = (select v from gc_ids where k = 'rest')
      and space_id = (select v from gc_ids where k = 'destino')
  ) then
    raise exception 'RN-TRA-09 FALLIDO: el origen lee el libro de auditoría del destino'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  -- Y en el del destino, que es quien tiene que poder leer que le han
  -- ofrecido un restaurante sin depender de una pantalla.
  if not exists (
    select 1 from public.audit_log
    where action = 'establishment_transfer.proposed'
      and entity_id = (select v from gc_ids where k = 'rest')
      and space_id = (select v from gc_ids where k = 'destino')
  ) then
    raise exception 'RN-TRA-09 FALLIDO: la propuesta no quedó en el libro del destino'
      using errcode = 'assert_failure';
  end if;

  -- Y la ve en la tabla de propuestas, que es lo que hará su pantalla.
  if not exists (
    select 1 from public.establishment_transfers
    where id = (select v from gc_ids where k = 'transfer') and state = 'pending'
  ) then
    raise exception 'RN-TRA FALLIDO: el destino no ve la propuesta que tiene que decidir'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El origen NO puede aceptar su propia propuesta: eso sería una firma.
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  begin
    perform public.accept_establishment_transfer((select v from gc_ids where k = 'transfer'));
    raise exception 'RN-TRA-02 FALLIDO: el origen aceptó su propia propuesta'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-TRA-02 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

-- Y quien no es de ninguno de los dos espacios ni la ve.
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.establishment_transfers
             where id = (select v from gc_ids where k = 'transfer')) then
    raise exception 'RN-TRA FALLIDO: una cuenta ajena ve la propuesta'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-TRA-05 · con deuda vencida no se transfiere
-- ============================================================
--
-- Se prueba antes de aceptar, porque es la guarda que impide usar la
-- transferencia para escapar de una deuda. Se emite un cobro vencido, se
-- comprueba que la aceptación se para, y se cobra para seguir.
set role postgres;
do $$
declare v_charge uuid;
begin
  insert into public.charges
    (space_id, establishment_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_by)
  values
    ((select v from gc_ids where k = 'origen'), (select v from gc_ids where k = 'rest'),
     'Mensualidad de prueba', now() - interval '40 days', now() - interval '10 days',
     10000, 21, 2100, 12100, now() - interval '5 days',
     'bb100000-0000-0000-0000-000000000001')
  returning id into v_charge;

  -- El apunte del libro. Un cobro sin su `financial_entries` es un cobro
  -- que nadie debe: RN-FIN-02 dice que la deuda viva sale del libro, no de
  -- la fila de `charges`, y este fixture tiene que decir lo mismo que
  -- `generate_monthly_charge_internal()` para que la prueba sirva de algo.
  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    ((select v from gc_ids where k = 'origen'), (select v from gc_ids where k = 'rest'),
     v_charge, 'charge', 12100, 'Mensualidad de prueba',
     'bb100000-0000-0000-0000-000000000001');

  insert into gc_ids values ('cobro', v_charge);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  begin
    perform public.accept_establishment_transfer((select v from gc_ids where k = 'transfer'));
    raise exception 'RN-TRA-05 FALLIDO: se transfirió un restaurante con deuda vencida'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-TRA-05 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-REC · el aviso del día del vencimiento
-- ============================================================
--
-- Aprovecha el cobro de arriba: se le mueve el vencimiento a hoy y se
-- dispara el barrido. Va aquí y no al final porque el cobro existe ahora.
set role postgres;
do $$
declare v_avisados integer;
begin
  update public.charges set due_at = now() where id = (select v from gc_ids where k = 'cobro');

  v_avisados := public.run_charge_reminders((select v from gc_ids where k = 'origen'));
  if v_avisados < 1 then
    raise exception 'RN-REC-02 FALLIDO: el vencimiento de hoy no avisó a nadie'
      using errcode = 'assert_failure';
  end if;

  -- RN-REC-05 · avisa al RESTAURANTE, no al equipo. Los otros dos avisos de
  -- los tres de M52 son los que ya emiten la pausa y la suspensión.
  if not exists (
    select 1 from public.notifications
    where event_type = 'charge_due_today'
      and recipient_id = 'bb100000-0000-0000-0000-000000000004'
  ) then
    raise exception 'RN-REC-05 FALLIDO: el aviso no llegó al restaurante'
      using errcode = 'assert_failure';
  end if;

  if exists (
    select 1 from public.notifications
    where event_type = 'charge_due_today'
      and recipient_id = 'bb100000-0000-0000-0000-000000000001'
  ) then
    raise exception 'RN-REC-05 FALLIDO: el aviso del vencimiento fue al equipo'
      using errcode = 'assert_failure';
  end if;

  -- RN-REC-03 · una vez por umbral. Que el barrido corra dos veces no
  -- manda dos avisos.
  perform public.run_charge_reminders((select v from gc_ids where k = 'origen'));
  if (select count(*) from public.notifications
      where event_type = 'charge_due_today'
        and recipient_id = 'bb100000-0000-0000-0000-000000000004') <> 1 then
    raise exception 'RN-REC-03 FALLIDO: el barrido mandó el aviso dos veces'
      using errcode = 'assert_failure';
  end if;

  -- RN-REC-01 · no se inventa ningún plazo: el aviso del vencimiento NO
  -- es obligatorio, porque no corta el servicio. Los dos que sí lo cortan
  -- siguen siendo obligatorios.
  if public.notification_event_is_mandatory('charge_due_today') then
    raise exception 'RN-REC-05 FALLIDO: el aviso del vencimiento se declaró obligatorio'
      using errcode = 'assert_failure';
  end if;
  if not public.notification_event_is_mandatory('establishment_paused_nonpayment')
     or not public.notification_event_is_mandatory('establishment_suspended_nonpayment') then
    raise exception 'RN-REC-01 FALLIDO: los dos avisos que paran el servicio dejaron de ser obligatorios'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- RN-REC-04 · un cobro sin deuda viva no avisa, aunque llegue su fecha.
-- Lo decide el LIBRO, no el estado guardado. Y de paso deja el camino
-- libre para la transferencia.
set role postgres;
do $$
begin
  insert into public.payments
    (space_id, establishment_id, charge_id, amount_cents, method, paid_at, recorded_by, recorded_role)
  values
    ((select v from gc_ids where k = 'origen'), (select v from gc_ids where k = 'rest'),
     (select v from gc_ids where k = 'cobro'), 12100, 'transfer', now(),
     'bb100000-0000-0000-0000-000000000001', 'owner');

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    ((select v from gc_ids where k = 'origen'), (select v from gc_ids where k = 'rest'),
     (select v from gc_ids where k = 'cobro'), 'payment', -12100, 'Cobrado',
     'bb100000-0000-0000-0000-000000000001');

  delete from public.notifications where event_type = 'charge_due_today';

  if public.run_charge_reminders((select v from gc_ids where k = 'origen')) <> 0 then
    raise exception 'RN-REC-04 FALLIDO: un cobro ya pagado volvió a avisar'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-TRA · el destino acepta, y entonces sí se mueve
-- ============================================================
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  perform public.accept_establishment_transfer((select v from gc_ids where k = 'transfer'));
end $$;
reset role;

set role postgres;
do $$
declare v_origen uuid := (select v from gc_ids where k = 'origen');
        v_destino uuid := (select v from gc_ids where k = 'destino');
        v_rest uuid := (select v from gc_ids where k = 'rest');
begin
  -- El restaurante está en el destino.
  if (select space_id from public.establishments where id = v_rest) <> v_destino then
    raise exception 'RN-TRA FALLIDO: el restaurante no se movió' using errcode = 'assert_failure';
  end if;

  -- RN-TRA-01 · su trabajo viajó con él.
  if (select space_id from public.requests where id = (select v from gc_ids where k = 'sol_rest'))
     <> v_destino then
    raise exception 'RN-TRA-01 FALLIDO: la solicitud no viajó' using errcode = 'assert_failure';
  end if;

  -- Y lo que cuelga de ella también: `request_versions` llega por su padre.
  if exists (
    select 1 from public.request_versions rv
    where rv.request_id = (select v from gc_ids where k = 'sol_rest') and rv.space_id <> v_destino
  ) then
    raise exception 'RN-TRA-01 FALLIDO: las versiones de la solicitud se quedaron atrás'
      using errcode = 'assert_failure';
  end if;

  -- La conversación de la solicitud también, con sus mensajes.
  if exists (
    select 1 from public.conversations c
    where c.request_id = (select v from gc_ids where k = 'sol_rest') and c.space_id <> v_destino
  ) then
    raise exception 'RN-TRA-01 FALLIDO: la conversación se quedó atrás'
      using errcode = 'assert_failure';
  end if;

  -- RN-TRA-04 · el dinero NO viajó. Es del espacio que lo emitió.
  if (select space_id from public.charges where id = (select v from gc_ids where k = 'cobro'))
     <> v_origen then
    raise exception 'RN-TRA-04 FALLIDO: el cobro viajó con el restaurante'
      using errcode = 'assert_failure';
  end if;
  if exists (
    select 1 from public.financial_entries
    where charge_id = (select v from gc_ids where k = 'cobro') and space_id <> v_origen
  ) then
    raise exception 'RN-TRA-04 FALLIDO: el libro financiero viajó' using errcode = 'assert_failure';
  end if;
  -- Acotado a ESTE restaurante: las suites anteriores dejan pagos suyos en
  -- sus propios espacios, y un `where space_id <> v_origen` a secas los
  -- contaba como pagos que habían viajado.
  if exists (
    select 1 from public.payments where establishment_id = v_rest and space_id <> v_origen
  ) then
    raise exception 'RN-TRA-04 FALLIDO: los pagos viajaron' using errcode = 'assert_failure';
  end if;

  -- RN-TRA-11 · el libro de auditoría del origen se queda donde estaba.
  -- Lo que hizo el equipo de origen es su registro, y CLAUDE.md dice que
  -- un registro de auditoría no se edita desde la aplicación: cambiarle el
  -- espacio es cambiar quién puede leerlo.
  if not exists (
    select 1 from public.audit_log
    where entity_id = v_rest and space_id = v_origen and action = 'establishment.created'
  ) then
    raise exception 'RN-TRA-11 FALLIDO: la auditoría del origen se movió'
      using errcode = 'assert_failure';
  end if;

  -- RN-TRA-08 · el acceso del EQUIPO de origen se retira. El del cliente no.
  if exists (
    select 1 from public.worker_establishments
    where establishment_id = v_rest and revoked_at is null
  ) then
    raise exception 'RN-TRA-08 FALLIDO: la autorización del equipo de origen sigue viva'
      using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.establishment_memberships
    where establishment_id = v_rest
      and user_id = 'bb100000-0000-0000-0000-000000000004' and revoked_at is null
  ) then
    raise exception 'RN-TRA-08 FALLIDO: el cliente perdió el acceso a su propio restaurante'
      using errcode = 'assert_failure';
  end if;

  -- RN-TRA-10 · el grupo no se parte: llega a uno del destino con el
  -- mismo nombre, y el del origen sigue existiendo donde estaba.
  if (select g.space_id from public.groups g
      join public.establishments e on e.group_id = g.id where e.id = v_rest) <> v_destino then
    raise exception 'RN-TRA-10 FALLIDO: el restaurante quedó en un grupo del origen'
      using errcode = 'assert_failure';
  end if;
  if (select g.name from public.groups g
      join public.establishments e on e.group_id = g.id where e.id = v_rest) <> 'Grupo C' then
    raise exception 'RN-TRA-10 FALLIDO: el grupo del destino no se llama igual'
      using errcode = 'assert_failure';
  end if;

  -- CA-17 · aceptarla dos veces no mueve nada la segunda.
  if (select state from public.establishment_transfers
      where id = (select v from gc_ids where k = 'transfer')) <> 'accepted' then
    raise exception 'RN-TRA FALLIDO: la propuesta no quedó aceptada' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  -- Idempotente: la segunda no lanza y no vuelve a mover.
  perform public.accept_establishment_transfer((select v from gc_ids where k = 'transfer'));
end $$;
reset role;

-- El equipo de ORIGEN ya no ve el restaurante: se fue de su espacio.
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.establishments where id = (select v from gc_ids where k = 'rest')) then
    raise exception 'RN-TRA FALLIDO: el origen sigue viendo un restaurante que ya no es suyo'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-TRA-13 · el barrido de las dos listas
-- ============================================================
--
-- La comprobación en falso-cerrado: recorre TODAS las tablas con
-- `space_id` y `establishment_id` y falla si alguna no está clasificada
-- como "viaja" o "se queda". Una tabla nueva rompe este test hasta que
-- alguien decida de qué lado está, que es lo contrario de descubrirlo el
-- día que un restaurante se transfiera de verdad.
set role postgres;
do $$
declare v_faltan text;
begin
  select string_agg(t.table_name, ', ' order by t.table_name) into v_faltan
  from information_schema.tables t
  where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
    and exists (select 1 from information_schema.columns c
                where c.table_schema = 'public' and c.table_name = t.table_name
                  and c.column_name = 'space_id')
    and exists (select 1 from information_schema.columns c
                where c.table_schema = 'public' and c.table_name = t.table_name
                  and c.column_name = 'establishment_id')
    and not exists (select 1 from public.establishment_transfer_tables() e
                    where e.table_name = t.table_name);

  if v_faltan is not null then
    raise exception 'RN-TRA-13 FALLIDO: estas tablas tienen space_id y establishment_id y nadie ha dicho si viajan o se quedan: %', v_faltan
      using errcode = 'assert_failure';
  end if;

  -- Y al revés: una lista que nombre una tabla que ya no existe es una
  -- lista que nadie ha mirado desde hace tiempo.
  select string_agg(e.table_name, ', ' order by e.table_name) into v_faltan
  from public.establishment_transfer_tables() e
  where not exists (select 1 from information_schema.tables t
                    where t.table_schema = 'public' and t.table_name = e.table_name);

  if v_faltan is not null then
    raise exception 'RN-TRA-13 FALLIDO: la lista nombra tablas que no existen: %', v_faltan
      using errcode = 'assert_failure';
  end if;

  select string_agg(c.table_name, ', ' order by c.table_name) into v_faltan
  from public.establishment_transfer_child_tables() c
  where not exists (select 1 from information_schema.tables t
                    where t.table_schema = 'public' and t.table_name = c.table_name)
     or not exists (select 1 from information_schema.tables t
                    where t.table_schema = 'public' and t.table_name = c.parent_table);

  if v_faltan is not null then
    raise exception 'RN-TRA-13 FALLIDO: la lista de hijos nombra tablas o padres que no existen: %', v_faltan
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-BCK · las copias de seguridad
-- ============================================================
--
-- El restaurante vive ahora en el destino, así que las copias las hace su
-- propietaria. Va bien así: comprueba de paso que la transferencia dejó el
-- restaurante utilizable en su casa nueva.
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  -- RN-BCK-07 · una copia es una herramienta de administración. Una
  -- trabajadora del espacio de ORIGEN, que además ya no tiene nada que ver
  -- con este restaurante, no la genera.
  begin
    perform public.create_establishment_backup((select v from gc_ids where k = 'rest'));
    raise exception 'RN-BCK-07 FALLIDO: quien no gestiona clientes generó una copia'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-BCK-07 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_backup uuid;
        v_contenido jsonb;
begin
  v_backup := public.create_establishment_backup((select v from gc_ids where k = 'rest'));
  insert into gc_ids values ('copia', v_backup);

  -- RN-BCK-01 · lo que hay DENTRO de Cuotly. La solicitud que viajó tiene
  -- que estar: si no, la copia no respalda el trabajo del restaurante.
  select content into v_contenido from public.establishment_backups where id = v_backup;
  if jsonb_array_length(v_contenido -> 'requests') < 1 then
    raise exception 'RN-BCK-01 FALLIDO: la copia no lleva las solicitudes'
      using errcode = 'assert_failure';
  end if;

  -- RN-BCK-09 · el inventario de los archivos, no los archivos. La copia
  -- no lleva bytes: si algún día alguien mete `storage_path` aquí dentro,
  -- estará duplicando material privado fuera de `can_read_file()`.
  if v_contenido -> 'files' is null then
    raise exception 'RN-BCK-09 FALLIDO: la copia no lleva el inventario de archivos'
      using errcode = 'assert_failure';
  end if;
  if v_contenido::text like '%storage_path%' then
    raise exception 'RN-BCK-09 FALLIDO: la copia lleva rutas de Storage dentro'
      using errcode = 'assert_failure';
  end if;

  -- RN-BCK-06 · descargar deja apunte.
  perform public.download_establishment_backup(v_backup);
  if not exists (
    select 1 from public.establishment_backup_downloads
    where backup_id = v_backup and downloaded_by = 'bb100000-0000-0000-0000-000000000002'
  ) then
    raise exception 'RN-BCK-06 FALLIDO: la descarga no quedó registrada'
      using errcode = 'assert_failure';
  end if;

  -- RN-BCK-04 · no existe ninguna función de restaurar, y eso es el diseño
  -- y no una pieza que falte: reponer los datos de una fecha anterior
  -- machacaría apuntes de auditoría, consumos y cobros posteriores.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%restore%backup%'
  ) then
    raise exception 'RN-BCK-04 FALLIDO: alguien ha escrito una función de restaurar'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El cliente no ve las copias: son del equipo (RN-BCK-07).
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  if exists (
    select 1 from public.establishment_backups
    where establishment_id = (select v from gc_ids where k = 'rest')
  ) then
    raise exception 'RN-BCK-07 FALLIDO: el restaurante ve las copias del equipo'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- RN-BCK-02 y RN-BCK-03 · treinta, y la treinta y uno desaparece.
set role postgres;
do $$
declare v_rest uuid := (select v from gc_ids where k = 'rest');
        i integer;
begin
  for i in 1..35 loop
    perform public.create_establishment_backup_internal(v_rest, null);
    -- Las copias del mismo segundo empatarían en `taken_at` y el "quédate
    -- las treinta últimas" no podría desempatarlas. Se separan a mano, que
    -- es lo que hace el reloj de verdad: una al día.
    update public.establishment_backups
    set taken_at = now() - (35 - i) * interval '1 day'
    where id = (select b.id from public.establishment_backups b
                where b.establishment_id = v_rest order by b.taken_at desc nulls first limit 1);
  end loop;

  if (select count(*) from public.establishment_backups where establishment_id = v_rest) > 30 then
    raise exception 'RN-BCK-03 FALLIDO: se guardan más de treinta copias'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- RN-BCK-02 · el barrido hace una al día y no dos.
set role postgres;
do $$
declare v_espacio uuid := (select v from gc_ids where k = 'destino');
        v_antes integer;
begin
  delete from public.establishment_backups;

  perform public.run_backup_sweep(v_espacio);
  select count(*) into v_antes from public.establishment_backups;
  if v_antes < 1 then
    raise exception 'RN-BCK-02 FALLIDO: el barrido no hizo ninguna copia'
      using errcode = 'assert_failure';
  end if;

  -- CA-17 · que la cola corra dos veces el mismo día no hace dos copias.
  perform public.run_backup_sweep(v_espacio);
  if (select count(*) from public.establishment_backups) <> v_antes then
    raise exception 'RN-BCK-02 FALLIDO: el barrido hizo una segunda copia el mismo día'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-CAN · los canales internos del espacio
-- ============================================================
--
-- RN-CAN-03 · los SEIS de fábrica nacen con el espacio.
--
-- Eran cuatro hasta el 19/09/2026 (decisión 43, maqueta M76). El diseño
-- definitivo móvil (página 74) enseña dos más y la migración 104 los
-- siembra. Se comprueban por nombre y no por número: "son seis" pasaría
-- igual si alguien cambiara "Menú diario" por otra cosa.
set role postgres;
do $$
declare
  v_espacio uuid := (select v from gc_ids where k = 'origen');
  v_esperados text[] := array[
    'General', 'Proyectos web', 'Menú diario', 'Redes sociales',
    'Diseño y creatividad', 'Soporte interno'
  ];
  v_faltan text;
  v_sobran text;
begin
  select string_agg(e, ', ') into v_faltan
  from unnest(v_esperados) e
  where not exists (
    select 1 from public.conversations c
    where c.space_id = v_espacio and c.type = 'channel' and c.name = e
  );

  if v_faltan is not null then
    raise exception 'RN-CAN-03 FALLIDO: al espacio le faltan canales de fábrica: %', v_faltan
      using errcode = 'assert_failure';
  end if;

  select string_agg(c.name, ', ') into v_sobran
  from public.conversations c
  where c.space_id = v_espacio and c.type = 'channel' and not (c.name = any(v_esperados));

  if v_sobran is not null then
    raise exception 'RN-CAN-03 FALLIDO: el espacio nació con canales que no son de fábrica: %', v_sobran
      using errcode = 'assert_failure';
  end if;

  -- Nacen SIN miembros (RN-CAN-07): nadie entra en un canal sin que
  -- alguien lo meta, ni siquiera el propietario.
  if exists (
    select 1 from public.channel_members cm
    join public.conversations c on c.id = cm.conversation_id
    where c.space_id = (select v from gc_ids where k = 'origen') and cm.revoked_at is null
  ) then
    raise exception 'RN-CAN-07 FALLIDO: los canales de fábrica nacieron con miembros'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- RN-CAN-03 · sembrar dos veces NO duplica, y NO resucita lo archivado.
--
-- Las dos propiedades que la migración 104 promete, y que son fáciles de
-- romper al editarla: basta con añadir `and archived_at is null` a la
-- comprobación por nombre para que resembrar le devuelva a un equipo el
-- canal que decidió archivar, encima vacío.
set role postgres;
do $$
declare
  v_espacio uuid := (select v from gc_ids where k = 'origen');
  v_antes integer;
  v_creados integer;
  v_archivado uuid;
begin
  select count(*) into v_antes from public.conversations
  where space_id = v_espacio and type = 'channel';

  v_creados := public.seed_default_channels(v_espacio);

  if v_creados <> 0 then
    raise exception 'RN-CAN-03 FALLIDO: resembrar creó % canales; es idempotente o no lo es', v_creados
      using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.conversations
      where space_id = v_espacio and type = 'channel') <> v_antes then
    raise exception 'RN-CAN-03 FALLIDO: resembrar cambió el número de canales'
      using errcode = 'assert_failure';
  end if;

  -- Se archiva uno (RN-CAN-05: se archiva, no se borra) y se resiembra.
  select id into v_archivado from public.conversations
  where space_id = v_espacio and type = 'channel' and name = 'Soporte interno';

  update public.conversations set archived_at = now() where id = v_archivado;

  if public.seed_default_channels(v_espacio) <> 0 then
    raise exception 'RN-CAN-03 FALLIDO: resembrar resucitó un canal archivado. Un equipo que archiva "Soporte interno" lo vería volver, y vacío'
      using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.conversations
      where space_id = v_espacio and type = 'channel' and name = 'Soporte interno') <> 1 then
    raise exception 'RN-CAN-03 FALLIDO: hay dos "Soporte interno", uno archivado y otro no'
      using errcode = 'assert_failure';
  end if;

  update public.conversations set archived_at = null where id = v_archivado;
end $$;
reset role;

-- RN-CAN-08 · ver que un canal existe no es leerlo. El propietario los ve
-- en la lista sin ser miembro; si no, los cuatro de fábrica nacerían
-- invisibles y nadie podría entrar en ellos.
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_espacio uuid := (select v from gc_ids where k = 'origen');
        v_canal uuid;
        v_ve integer;
        v_hay integer;
begin
  -- Contra el número REAL de canales del espacio y no contra un literal.
  -- Aquí había un `4` escrito a mano y se quedó viejo el día que los
  -- canales de fábrica pasaron a seis (migración 104): el test falló por
  -- el número, no por la regla, que es la peor manera de fallar. Lo que
  -- RN-CAN-08 dice es "los ve TODOS sin ser miembro de ninguno", y eso se
  -- comprueba comparando las dos cuentas.
  select count(*) into v_ve from public.my_channels(v_espacio);

  set local role postgres;
  select count(*) into v_hay from public.conversations
  where space_id = v_espacio and type = 'channel' and archived_at is null;
  set local role authenticated;

  if v_ve <> v_hay then
    raise exception 'RN-CAN-08 FALLIDO: el propietario ve % canales de los % que tiene su espacio', v_ve, v_hay
      using errcode = 'assert_failure';
  end if;

  if v_hay = 0 then
    raise exception 'RN-CAN-08 FALLIDO: el espacio no tiene canales, así que esto no comprueba nada'
      using errcode = 'assert_failure';
  end if;

  if exists (select 1 from public.my_channels(v_espacio) where i_am_member) then
    raise exception 'RN-CAN-08 FALLIDO: la lista dice que es miembro de canales en los que no está'
      using errcode = 'assert_failure';
  end if;

  select id into v_canal from public.my_channels(v_espacio) where name = 'General';
  insert into gc_ids values ('canal', v_canal);

  -- Pero NO lee lo que se dice dentro: la lista de miembros es la llave.
  if public.can_read_conversation(v_canal) then
    raise exception 'RN-CAN-02 FALLIDO: lee un canal del que no es miembro'
      using errcode = 'assert_failure';
  end if;

  -- RN-CAN-04 · y sí puede meterse, que es lo que hace alcanzable un canal
  -- de fábrica: gestionar los miembros es una capacidad, no una
  -- pertenencia.
  perform public.add_channel_member(v_canal, 'bb100000-0000-0000-0000-000000000001');
  if not public.can_read_conversation(v_canal) then
    raise exception 'RN-CAN-01 FALLIDO: entrar en el canal no le dio acceso'
      using errcode = 'assert_failure';
  end if;

  -- CA-17 · añadir dos veces no duplica.
  perform public.add_channel_member(v_canal, 'bb100000-0000-0000-0000-000000000001');
  if (select count(*) from public.channel_members
      where conversation_id = v_canal and revoked_at is null) <> 1 then
    raise exception 'RN-CAN FALLIDO: añadir dos veces creó dos filas'
      using errcode = 'assert_failure';
  end if;

  -- RN-CAN-02 · el cliente no entra en un canal, nunca.
  begin
    perform public.add_channel_member(v_canal, 'bb100000-0000-0000-0000-000000000004');
    raise exception 'RN-CAN-02 FALLIDO: se metió a un cliente en un canal del equipo'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-CAN-02 FALLIDO%' then raise; end if;
  end;

  -- Un canal nuevo: quien lo crea entra en él en el mismo acto.
  insert into gc_ids values ('canal_nuevo', public.create_channel(v_espacio, 'Obras'));
  if not public.is_channel_member((select v from gc_ids where k = 'canal_nuevo')) then
    raise exception 'RN-CAN-07 FALLIDO: quien crea un canal se queda fuera'
      using errcode = 'assert_failure';
  end if;

  -- No hay dos canales vivos con el mismo nombre.
  begin
    perform public.create_channel(v_espacio, 'obras');
    raise exception 'RN-CAN FALLIDO: se crearon dos canales con el mismo nombre'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-CAN FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

-- RN-CAN-04 · una trabajadora escribe en los suyos y no administra a nadie.
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_canal uuid := (select v from gc_ids where k = 'canal');
begin
  begin
    perform public.add_channel_member(v_canal, 'bb100000-0000-0000-0000-000000000003');
    raise exception 'RN-CAN-04 FALLIDO: una trabajadora se añadió sola a un canal'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-CAN-04 FALLIDO%' then raise; end if;
  end;

  begin
    perform public.create_channel((select v from gc_ids where k = 'origen'), 'Mío');
    raise exception 'RN-CAN-04 FALLIDO: una trabajadora creó un canal'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-CAN-04 FALLIDO%' then raise; end if;
  end;

  -- Y no lee un canal del que no es miembro, ni aparece en su lista: una
  -- trabajadora no tiene `manage_space`, así que RN-CAN-08 no le aplica.
  if public.can_read_conversation(v_canal) then
    raise exception 'RN-CAN-02 FALLIDO: una trabajadora lee un canal ajeno'
      using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.my_channels((select v from gc_ids where k = 'origen'))) then
    raise exception 'RN-CAN-08 FALLIDO: una trabajadora ve canales de los que no es miembro'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El cliente no ve NINGÚN canal, ni en la lista ni por RLS (RN-CAN-02).
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.conversations where type = 'channel') then
    raise exception 'RN-CAN-02 FALLIDO: el cliente ve canales del equipo'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- RN-CAN-05 y RN-CAN-06 · se escribe, se archiva y entonces se lee pero no
-- se escribe. Lo que se dijo dentro se dijo.
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_canal uuid := (select v from gc_ids where k = 'canal');
begin
  perform public.post_message(v_canal, 'Primera del canal', null);

  if (select count(*) from public.list_conversation_messages(v_canal)) <> 1 then
    raise exception 'RN-CAN-06 FALLIDO: el mensaje del canal no se lee'
      using errcode = 'assert_failure';
  end if;

  perform public.archive_channel(v_canal, true);

  if not public.can_read_conversation(v_canal) then
    raise exception 'RN-CAN-05 FALLIDO: archivar un canal borró lo que se dijo dentro'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.post_message(v_canal, 'Después de archivar', null);
    raise exception 'RN-CAN-05 FALLIDO: se escribió en un canal archivado'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-CAN-05 FALLIDO%' then raise; end if;
  end;

  -- Y se desarchiva, que es lo contrario de borrar.
  perform public.archive_channel(v_canal, false);
  perform public.post_message(v_canal, 'Y otra vez', null);
end $$;
reset role;

-- Los otros tres tipos de conversación siguen comportándose igual: el
-- cuarto tipo no podía cambiarles la respuesta a nadie.
select set_config('request.jwt.claim.sub', 'bb100000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_conv uuid;
begin
  v_conv := public.get_or_create_request_conversation((select v from gc_ids where k = 'sol_rest'));
  if not public.can_read_conversation(v_conv) then
    raise exception 'RN-CAN FALLIDO: el cliente dejó de leer la conversación de su solicitud'
      using errcode = 'assert_failure';
  end if;
  if not public.can_write_conversation(v_conv) then
    raise exception 'RN-CAN FALLIDO: el cliente dejó de escribir en su solicitud'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;
