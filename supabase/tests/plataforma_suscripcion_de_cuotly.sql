-- Fase 4 · Hito 18 · la suscripción de Cuotly (migración 90; PRD §31,
-- RN-SUB-01 a 13; §4.1 a §4.7 de la maestra).
--
--   · RN-SUB-01: el catálogo, el IVA y la referencia.
--   · RN-SUB-02: el modo del espacio lo mueven solo las funciones.
--   · RN-SUB-03: los límites de la prueba y de Pro, en el servidor.
--   · RN-SUB-04: los adicionales de Pro, con su parte proporcional.
--   · RN-SUB-05: la primera mensualidad nace al aprobar; la prueba
--     termina sin gracia.
--   · RN-SUB-06: declarar, confirmar, registrar, rechazar y revertir; el
--     libro con signo y el estado derivado.
--   · RN-SUB-07: los cinco avisos, una vez cada uno.
--   · RN-SUB-08: el corte a las 72 h, el pago declarado que lo detiene, y
--     el modo lectura sostenido por disparador en toda tabla del espacio.
--   · RN-SUB-09: la reactivación al pagar, y la de la plataforma.
--   · RN-SUB-10: Pro → Agency inmediato; Agency → Pro en la renovación.
--   · RN-SUB-11: la mensualidad siguiente, 7 días antes.
--   · RN-SUB-12: eventos, auditoría y la identidad de quien confirmó.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plataforma_suscripcion_de_cuotly.sql

insert into auth.users (id, email, role, aud) values
  ('ffa00000-0000-0000-0000-000000000001', 'sub-propietaria@example.com', 'authenticated', 'authenticated'),
  ('ffa00000-0000-0000-0000-000000000002', 'sub-cuotly-con@example.com', 'authenticated', 'authenticated'),
  ('ffa00000-0000-0000-0000-000000000003', 'sub-cuotly-sin@example.com', 'authenticated', 'authenticated'),
  ('ffa00000-0000-0000-0000-000000000004', 'sub-admin@example.com', 'authenticated', 'authenticated'),
  ('ffa00000-0000-0000-0000-000000000005', 'sub-u5@example.com', 'authenticated', 'authenticated'),
  ('ffa00000-0000-0000-0000-000000000006', 'sub-u6@example.com', 'authenticated', 'authenticated'),
  ('ffa00000-0000-0000-0000-000000000007', 'sub-u7@example.com', 'authenticated', 'authenticated'),
  ('ffa00000-0000-0000-0000-000000000008', 'sub-u8@example.com', 'authenticated', 'authenticated');

-- §167 · un Administrador de Cuotly CON los dos permisos y otro SIN ninguno.
insert into public.platform_roles (user_id, role, can_approve_spaces, can_manage_subscriptions) values
  ('ffa00000-0000-0000-0000-000000000002', 'cuotly_admin', true, true),
  ('ffa00000-0000-0000-0000-000000000003', 'cuotly_admin', false, false);

-- Hito 19 (RN-ADM-02) · la plataforma solo existe en una sesión verificada
-- en dos pasos: sin este reclamo, Bosco y los Administradores de Cuotly
-- de esta suite serían usuarios normales y nada de lo de abajo pasaría.
select set_config('request.jwt.claim.aal', 'aal2', false);

create temp table sub_ids (k text primary key, v uuid);
grant select, insert, update on sub_ids to authenticated, service_role;

-- ============================================================
-- Fixture · una solicitud aprobada, como en el Hito 17
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Taberna del Puerto', 'Lucía Ferro', 'lucia@puerto.test', 'pro', '600333444', 2, 3, 'Webs de restaurantes');
  perform public.submit_space_request(v_id);
  insert into sub_ids values ('sol', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  insert into sub_ids values ('espacio', public.approve_space_request((select v from sub_ids where k = 'sol'), 'sub-clave-1'));
end $$;
reset role;

-- ============================================================
-- RN-SUB-05 y RN-SUB-01 · aprobar deja el espacio en prueba, con su
-- suscripción y la primera mensualidad emitida, que vence al acabar la prueba
-- ============================================================
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_charge record;
  v_sub record;
begin
  if (select cuotly_status from public.spaces where id = v_space) <> 'trial' then
    raise exception 'RN-SUB-05 FALLIDO: el espacio no nace en prueba' using errcode = 'assert_failure';
  end if;

  select * into v_sub from public.cuotly_subscriptions where space_id = v_space;
  if v_sub.id is null or v_sub.plan <> 'pro' then
    raise exception 'RN-SUB-02 FALLIDO: aprobar no creó la suscripción con el plan pedido' using errcode = 'assert_failure';
  end if;
  if v_sub.current_period_start <> (select cuotly_trial_ends_at from public.spaces where id = v_space) then
    raise exception 'RN-SUB-11 FALLIDO: el primer periodo no empieza al acabar la prueba' using errcode = 'assert_failure';
  end if;
  insert into sub_ids values ('sub', v_sub.id);

  select * into v_charge from public.cuotly_charges where space_id = v_space;
  if v_charge.id is null then
    raise exception 'RN-SUB-05 FALLIDO: aprobar no emitió la primera mensualidad' using errcode = 'assert_failure';
  end if;
  insert into sub_ids values ('cobro1', v_charge.id);

  -- RN-SUB-01 · 149 € + 21 % de IVA = 180,29 €, base, impuesto y total.
  if v_charge.base_cents <> 14900 or v_charge.tax_cents <> 3129 or v_charge.total_cents <> 18029
     or v_charge.tax_rate_percent <> 21 then
    raise exception 'RN-SUB-01 FALLIDO: la mensualidad de Pro no es 149 € + IVA (base %, iva %, total %)',
      v_charge.base_cents, v_charge.tax_cents, v_charge.total_cents using errcode = 'assert_failure';
  end if;
  if v_charge.reference not like 'CUO-%' then
    raise exception 'RN-SUB-01 FALLIDO: el cobro no lleva referencia' using errcode = 'assert_failure';
  end if;
  if v_charge.due_at <> v_sub.current_period_start then
    raise exception 'RN-SUB-05 FALLIDO: la primera mensualidad no vence al acabar la prueba' using errcode = 'assert_failure';
  end if;

  -- RN-SUB-06 · el libro tiene el apunte de emisión, y el estado se deriva.
  if public.cuotly_charge_outstanding_cents(v_charge.id) <> 18029 then
    raise exception 'RN-SUB-06 FALLIDO: el libro no refleja la deuda emitida' using errcode = 'assert_failure';
  end if;
  if public.cuotly_charge_status(v_charge.id) <> 'pending' then
    raise exception 'RN-SUB-06 FALLIDO: un cobro recién emitido no está pendiente' using errcode = 'assert_failure';
  end if;

  -- RN-SUB-12 · el evento y la auditoría del nacimiento.
  if not exists (select 1 from public.state_events where entity_type = 'space' and entity_id = v_space and to_state = 'trial') then
    raise exception 'RN-SUB-12 FALLIDO: entrar en prueba no dejó evento' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where action = 'cuotly_charge.issued' and entity_id = v_charge.id) then
    raise exception 'RN-SUB-12 FALLIDO: emitir un cobro no dejó apunte' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-SUB-02 · el modo del espacio no se cambia con un UPDATE suelto
-- ============================================================
do $$
begin
  begin
    update public.spaces set cuotly_status = 'active' where id = (select v from sub_ids where k = 'espacio');
    raise exception 'RN-SUB-02 FALLIDO: el modo del espacio se cambia a mano' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;
end $$;

-- ============================================================
-- RN-SUB-03 · en la prueba caben 2 establecimientos activos, y el tercero no
-- ============================================================
-- Los crea la propietaria por la puerta de siempre (la política de
-- `establishments`): el límite lo pone el disparador, no la política.
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_group uuid;
  v_viejo uuid;
begin
  insert into public.groups (space_id, name) values (v_space, 'Grupo Puerto') returning id into v_group;
  insert into sub_ids values ('grupo', v_group);

  perform public.create_establishment_with_data(v_space, 'Puerto 1', v_group);
  v_viejo := public.create_establishment_with_data(v_space, 'Puerto viejo', v_group);

  begin
    perform public.create_establishment_with_data(v_space, 'Puerto 2', v_group);
    raise exception 'RN-SUB-03 FALLIDO: la prueba admite un tercer establecimiento activo (§4.4)' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;

  -- Un archivado no cuenta (§4.1: "establecimientos archivados: ilimitados").
  perform public.set_establishment_status(v_viejo, 'archived', 'Cerró');
  perform public.create_establishment_with_data(v_space, 'Puerto 2', v_group);
end $$;
reset role;

-- ============================================================
-- RN-SUB-08 (el reloj se detiene) y RN-SUB-05 (la prueba termina sin gracia)
-- ============================================================
-- La propietaria declara que ha pagado; el corte espera a la decisión.
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_pay uuid;
begin
  v_pay := public.declare_cuotly_payment(
    (select v from sub_ids where k = 'cobro1'), 18029, 'transfer', now(), 'TRF-0001', null, 'Pagado hoy', 'decl-1');
  insert into sub_ids values ('pago1', v_pay);

  -- CA-17 · la misma clave devuelve el mismo pago.
  if public.declare_cuotly_payment((select v from sub_ids where k = 'cobro1'), 18029, 'transfer', now(), null, null, null, 'decl-1') <> v_pay then
    raise exception 'RN-SUB-06 FALLIDO: declarar dos veces con la misma clave creó dos pagos' using errcode = 'assert_failure';
  end if;

  if public.cuotly_charge_status((select v from sub_ids where k = 'cobro1')) <> 'declared' then
    raise exception 'RN-SUB-06 FALLIDO: un cobro con pago declarado no está en "declarado"' using errcode = 'assert_failure';
  end if;

  -- §4.5 · ni tarjeta ni efectivo.
  begin
    perform public.declare_cuotly_payment((select v from sub_ids where k = 'cobro1'), 100, 'card');
    raise exception 'RN-SUB-06 FALLIDO: se declara un pago con tarjeta (§4.5)' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;

  -- RN-SUB-12 · quién en Cuotly confirmó no lo ve la propietaria.
  begin
    perform (select confirmed_by from public.cuotly_payments where id = v_pay);
    raise exception 'RN-SUB-12 FALLIDO: la propietaria lee confirmed_by' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- El barrido, con el reloj puesto una hora después del fin de la prueba:
-- con el pago declarado, NO se archiva.
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_fin timestamptz := (select cuotly_trial_ends_at from public.spaces where id = v_space);
begin
  perform public.run_cuotly_billing_sweep(v_space, v_fin + interval '1 hour');
  if (select cuotly_status from public.spaces where id = v_space) <> 'trial' then
    raise exception 'RN-SUB-08 FALLIDO: se archivó con un pago declarado pendiente de confirmar' using errcode = 'assert_failure';
  end if;
end $$;

-- Cuotly rechaza el pago (no llegó), con motivo; el siguiente barrido corta.
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  begin
    perform public.reject_cuotly_payment((select v from sub_ids where k = 'pago1'), '   ');
    raise exception 'RN-SUB-06 FALLIDO: se rechaza un pago sin motivo' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;
  perform public.reject_cuotly_payment((select v from sub_ids where k = 'pago1'), 'No consta ninguna transferencia');
end $$;
reset role;

-- Y el Administrador de Cuotly SIN permiso no decide nada (§167).
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.confirm_cuotly_payment((select v from sub_ids where k = 'pago1'));
    raise exception 'RN-SUB-06 FALLIDO: un Admin de Cuotly sin permiso confirma pagos' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;
  if exists (select 1 from public.cuotly_charges) then
    raise exception 'RN-SUB-06 FALLIDO: un Admin de Cuotly sin permiso ve los cobros' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_fin timestamptz := (select cuotly_trial_ends_at from public.spaces where id = v_space);
  v_s public.spaces;
begin
  if (select rejection_reason from public.cuotly_payments where id = (select v from sub_ids where k = 'pago1')) is null then
    raise exception 'RN-SUB-06 FALLIDO: el motivo del rechazo no se guarda' using errcode = 'assert_failure';
  end if;

  perform public.run_cuotly_billing_sweep(v_space, v_fin + interval '1 hour');
  select * into v_s from public.spaces where id = v_space;
  if v_s.cuotly_status <> 'archived_trial_ended' then
    raise exception 'RN-SUB-05 FALLIDO: la prueba terminó sin pago y el espacio no se archivó' using errcode = 'assert_failure';
  end if;
  if v_s.cuotly_reactivation_deadline_at not between now() + interval '29 days' and now() + interval '31 days' then
    raise exception 'RN-SUB-09 FALLIDO: el plazo de reactivación no son 30 días' using errcode = 'assert_failure';
  end if;

  -- RN-SUB-12 · evento, auditoría y aviso obligatorio.
  if not exists (select 1 from public.state_events where entity_type = 'space' and entity_id = v_space and to_state = 'archived_trial_ended') then
    raise exception 'RN-SUB-12 FALLIDO: archivar no dejó evento' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where action = 'space.archived_trial_ended' and entity_id = v_space) then
    raise exception 'RN-SUB-12 FALLIDO: archivar no dejó apunte de auditoría' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.notifications
    where recipient_id = 'ffa00000-0000-0000-0000-000000000001' and event_type = 'cuotly_space_archived'
  ) then
    raise exception 'RN-SUB-07 FALLIDO: archivar no avisó a la propietaria' using errcode = 'assert_failure';
  end if;
  if not public.notification_event_is_mandatory('cuotly_space_archived')
     or not public.notification_event_is_mandatory('cuotly_payment_final_notice')
     or public.notification_event_is_mandatory('cuotly_payment_due_soon') then
    raise exception 'RN-SUB-07 FALLIDO: los avisos obligatorios no son el último y el archivado (RN-NOT-03)' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-SUB-08 · el modo lectura lo sostiene el servidor
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_est uuid := (select id from public.establishments where space_id = v_space and name = 'Puerto 1');
begin
  -- Una operación legítima del propietario, por su función de siempre.
  begin
    perform public.set_establishment_status(v_est, 'paused', 'probando');
    raise exception 'RN-SUB-08 FALLIDO: en modo lectura se cambia el estado de un restaurante' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
      if sqlerrm not like '%solo lectura%' then raise; end if;
  end;

  -- Y el espacio mismo, por su función de ajustes (HU-36): la política de
  -- `spaces` no admite un UPDATE suelto, así que la puerta es esa.
  begin
    perform public.set_space_name(v_space, 'Otro nombre');
    raise exception 'RN-SUB-08 FALLIDO: en modo lectura se renombra el espacio' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
      if sqlerrm not like '%solo lectura%' then raise; end if;
  end;

  -- Pero se lee.
  if (select count(*) from public.establishments where space_id = v_space) <> 3 then
    raise exception 'RN-SUB-08 FALLIDO: en modo lectura la propietaria no lee sus restaurantes' using errcode = 'assert_failure';
  end if;

  -- Y "en ese modo se puede pagar" (§4.6).
  insert into sub_ids values ('pago2', public.declare_cuotly_payment(
    (select v from sub_ids where k = 'cobro1'), 18029, 'bizum', now(), 'BZ-77', null, null, 'decl-2'));
end $$;
reset role;

-- El barrido de invariantes: toda tabla con `space_id` lleva el disparador,
-- salvo las exentas, que están aquí con el mismo motivo que en la migración.
do $$
declare
  v_t record;
  v_sin text := '';
begin
  for v_t in
    select c.relname as tabla,
           exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = c.relname || '_cuotly_read_only') as guardada
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
         -- Los libros que pagar y archivar tienen que escribir.
         'audit_log', 'state_events',
         -- Los avisos de §4.5 llegan mientras el espacio está archivado.
         'notifications', 'notification_deliveries',
         -- De plataforma: su `space_id` es anulable.
         'space_requests',
         -- "En ese modo se puede pagar" (§4.6).
         'cuotly_subscriptions', 'cuotly_charges', 'cuotly_payments', 'cuotly_ledger_entries',
         -- Hito 19 (RN-ADM-09) · Modo soporte se abre también sobre un espacio
         -- archivado, para poder mirar por qué; lo que la sesión toque
         -- dentro sigue congelado, porque las tablas del espacio sí llevan
         -- el disparador. La sesión misma no es un dato del espacio.
         'support_sessions',
         -- Hito 20 (RN-CIC-08) · archivar y restaurar escriben aquí justo
         -- cuando el espacio está archivado: con el disparador puesto,
         -- restaurar un espacio sería imposible. Solo lo escriben
         -- `archive_space_by_owner()` y `restore_space_by_owner()`, que
         -- comprueban el permiso por su cuenta y no tienen política de
         -- INSERT.
         'space_lifecycle_operations',
         -- Hito 20 (RN-CIC-10) · esta misma regla, RN-SUB-08, dice con
         -- todas las letras que un espacio archivado "se puede pagar,
         -- **exportar** y contactar con soporte". Con el disparador
         -- puesto, el propietario no podría llevarse sus datos justo
         -- cuando más falta le hace.
         'space_exports',
         -- Hito 21 (RN-SOP-09) · esta misma regla dice "contactar con
         -- soporte". Con el disparador puesto, un espacio archivado no
         -- podría abrir la incidencia que dice "no puedo entrar". Las cuatro
         -- sí llevan el de Modo soporte (RN-SOP-01), y la suite 44 lo exige.
         'incidents', 'incident_events', 'incident_messages', 'incident_attachments'
       ) then
      v_sin := v_sin || ' ' || v_t.tabla;
    end if;
  end loop;

  if v_sin <> '' then
    raise exception 'RN-SUB-08 FALLIDO: tablas de espacio sin el disparador de modo lectura:%. O le falta el disparador, o hay que justificarla en la lista de exentas de este test Y de la migración.', v_sin
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-SUB-09 · confirmar el pago reactiva el espacio con sus datos
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_res text;
begin
  v_res := public.confirm_cuotly_payment((select v from sub_ids where k = 'pago2'), 'Visto en el banco');
  if v_res <> 'reactivated' then
    raise exception 'RN-SUB-09 FALLIDO: confirmar el pago no reactivó (%)', v_res using errcode = 'assert_failure';
  end if;
  -- CA-17 · confirmar dos veces no hace nada la segunda.
  if public.confirm_cuotly_payment((select v from sub_ids where k = 'pago2')) <> 'already_confirmed' then
    raise exception 'RN-SUB-06 FALLIDO: confirmar dos veces no es idempotente' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
declare v_space uuid := (select v from sub_ids where k = 'espacio');
begin
  if (select cuotly_status from public.spaces where id = v_space) <> 'active' then
    raise exception 'RN-SUB-09 FALLIDO: el espacio no volvió a activo' using errcode = 'assert_failure';
  end if;
  if (select cuotly_reactivation_deadline_at from public.spaces where id = v_space) is not null then
    raise exception 'RN-SUB-09 FALLIDO: un espacio activo conserva plazo de reactivación' using errcode = 'assert_failure';
  end if;
  if public.cuotly_charge_status((select v from sub_ids where k = 'cobro1')) <> 'paid' then
    raise exception 'RN-SUB-06 FALLIDO: el cobro pagado no está "pagado"' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.cuotly_ledger_entries where charge_id = (select v from sub_ids where k = 'cobro1')) <> 2 then
    raise exception 'RN-SUB-06 FALLIDO: el libro no tiene emisión y pago' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where action = 'space.reactivated' and entity_id = v_space)
     or not exists (select 1 from public.audit_log where action = 'cuotly_payment.confirmed') then
    raise exception 'RN-SUB-12 FALLIDO: reactivar o confirmar no dejó apunte' using errcode = 'assert_failure';
  end if;
  -- Sus datos siguen ahí.
  if (select count(*) from public.establishments where space_id = v_space) <> 3 then
    raise exception 'RN-SUB-09 FALLIDO: el espacio no se reactivó con sus datos' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-SUB-03 · ya en Pro activo: 5 establecimientos y 5 usuarios, ni uno más
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_group uuid := (select v from sub_ids where k = 'grupo');
begin
  perform public.create_establishment_with_data(v_space, 'Puerto 3', v_group);
  perform public.create_establishment_with_data(v_space, 'Puerto 4', v_group);
  perform public.create_establishment_with_data(v_space, 'Puerto 5', v_group);
  begin
    perform public.create_establishment_with_data(v_space, 'Puerto 6', v_group);
    raise exception 'RN-SUB-03 FALLIDO: Pro admite un sexto establecimiento sin adicional (§4.1)' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;

  -- Usuarios internos: la propietaria más cuatro; el sexto no.
  insert into public.space_memberships (space_id, user_id, role, status) values
    (v_space, 'ffa00000-0000-0000-0000-000000000004', 'admin', 'active'),
    (v_space, 'ffa00000-0000-0000-0000-000000000005', 'worker', 'active'),
    (v_space, 'ffa00000-0000-0000-0000-000000000006', 'worker', 'active'),
    (v_space, 'ffa00000-0000-0000-0000-000000000007', 'worker', 'active');
  begin
    insert into public.space_memberships (space_id, user_id, role, status)
    values (v_space, 'ffa00000-0000-0000-0000-000000000008', 'worker', 'active');
    raise exception 'RN-SUB-03 FALLIDO: Pro admite un sexto usuario interno sin adicional (§4.1)' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;
  -- Invitado (no activo) no cuenta.
  insert into public.space_memberships (space_id, user_id, role, status)
  values (v_space, 'ffa00000-0000-0000-0000-000000000008', 'worker', 'invited');
end $$;
reset role;

-- El administrador del espacio no ve la suscripción ni paga: §4.2.1, paga
-- el propietario.
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.cuotly_charges) or exists (select 1 from public.cuotly_subscriptions) then
    raise exception 'RN-SUB-02 FALLIDO: un administrador del espacio ve la suscripción de Cuotly' using errcode = 'assert_failure';
  end if;
  begin
    perform public.set_cuotly_extras((select v from sub_ids where k = 'espacio'), 1, 0);
    raise exception 'RN-SUB-04 FALLIDO: un administrador contrata adicionales' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-SUB-04 · los adicionales: subir es proporcional, bajar nunca por
-- debajo del uso
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_charge uuid;
  v_sub record;
  v_fraction numeric;
begin
  v_charge := public.set_cuotly_extras(v_space, 1, 1, 'extras-1');
  if v_charge is null then
    raise exception 'RN-SUB-04 FALLIDO: subir un adicional no cobró la parte proporcional' using errcode = 'assert_failure';
  end if;
  insert into sub_ids values ('cobro_extras', v_charge);

  select * into v_sub from public.cuotly_subscriptions where space_id = v_space;
  v_fraction := public.cuotly_remaining_fraction(v_sub.current_period_start, v_sub.current_period_end, now());
  if (select base_cents from public.cuotly_charges where id = v_charge)
     <> round((2500 + 1500) * v_fraction)::integer then
    raise exception 'RN-SUB-04 FALLIDO: la parte proporcional de los adicionales no es (25 € + 15 €) × fracción' using errcode = 'assert_failure';
  end if;
  if v_sub.extra_establishments <> 1 or v_sub.extra_users <> 1 then
    raise exception 'RN-SUB-04 FALLIDO: los adicionales no se guardaron' using errcode = 'assert_failure';
  end if;

  -- CA-17 · la misma clave no cobra dos veces.
  if public.set_cuotly_extras(v_space, 1, 1, 'extras-1') is not null
     or (select count(*) from public.cuotly_charges where space_id = v_space and kind = 'proration') <> 1 then
    raise exception 'RN-SUB-04 FALLIDO: contratar dos veces con la misma clave cobró dos veces' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_group uuid := (select v from sub_ids where k = 'grupo');
begin
  -- Con el adicional, el sexto cabe.
  perform public.create_establishment_with_data(v_space, 'Puerto 6', v_group);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_space uuid := (select v from sub_ids where k = 'espacio');
begin
  -- Bajar por debajo del uso (6 activos con 5 incluidos) no se puede.
  begin
    perform public.set_cuotly_extras(v_space, 0, 1, 'extras-2');
    raise exception 'RN-SUB-04 FALLIDO: se baja un adicional por debajo del uso' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;
  -- Bajar el de usuarios (5 activos) sí, y sin cobro ni devolución.
  if public.set_cuotly_extras(v_space, 1, 0, 'extras-3') is not null then
    raise exception 'RN-SUB-04 FALLIDO: bajar un adicional emitió un cobro' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-SUB-10 · Pro → Agency inmediato y proporcional; Agency → Pro en la
-- renovación y solo si cabe
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_charge uuid;
  v_sub record;
  v_fraction numeric;
begin
  v_charge := public.change_cuotly_plan(v_space, 'agency', 0, 0, 'plan-1');
  if v_charge is null then
    raise exception 'RN-SUB-10 FALLIDO: mejorar a Agency no cobró la diferencia proporcional' using errcode = 'assert_failure';
  end if;

  select * into v_sub from public.cuotly_subscriptions where space_id = v_space;
  v_fraction := public.cuotly_remaining_fraction(v_sub.current_period_start, v_sub.current_period_end, now());
  if (select base_cents from public.cuotly_charges where id = v_charge) <> round((49900 - 14900) * v_fraction)::integer then
    raise exception 'RN-SUB-10 FALLIDO: la diferencia proporcional no es (499 − 149) × fracción' using errcode = 'assert_failure';
  end if;
  if v_sub.plan <> 'agency' or v_sub.extra_establishments <> 0
     or (select cuotly_plan from public.spaces where id = v_space) <> 'agency' then
    raise exception 'RN-SUB-10 FALLIDO: la mejora no es inmediata, o los adicionales de Pro siguen' using errcode = 'assert_failure';
  end if;

  -- CA-17.
  if public.change_cuotly_plan(v_space, 'agency', 0, 0, 'plan-1') is not null then
    raise exception 'RN-SUB-10 FALLIDO: mejorar dos veces cobró dos veces' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_group uuid := (select v from sub_ids where k = 'grupo');
begin
  -- Agency: el séptimo cabe.
  perform public.create_establishment_with_data(v_space, 'Puerto 7', v_group);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_space uuid := (select v from sub_ids where k = 'espacio');
begin
  -- Bajar a Pro con 7 activos y 1 adicional (caben 6): exceso sin resolver.
  begin
    perform public.change_cuotly_plan(v_space, 'pro', 1, 0, 'plan-2');
    raise exception 'RN-SUB-10 FALLIDO: se programa la bajada a Pro con exceso (§4.7)' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;

  -- Con 2 adicionales (caben 7) sí, y queda programada.
  if public.change_cuotly_plan(v_space, 'pro', 2, 0, 'plan-3') is not null then
    raise exception 'RN-SUB-10 FALLIDO: bajar a Pro cobró algo' using errcode = 'assert_failure';
  end if;
  if (select pending_plan from public.cuotly_subscriptions where space_id = v_space) <> 'pro'
     or (select plan from public.cuotly_subscriptions where space_id = v_space) <> 'agency' then
    raise exception 'RN-SUB-10 FALLIDO: la bajada no quedó programada para la renovación' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_group uuid := (select v from sub_ids where k = 'grupo');
begin
  -- Desde que se programa rigen los límites de Pro para crecer: el octavo no.
  begin
    perform public.create_establishment_with_data(v_space, 'Puerto 8', v_group);
    raise exception 'RN-SUB-10 FALLIDO: con la bajada programada se crece por encima de Pro' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;
end $$;
reset role;

do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_sub record;
  v_charge record;
begin
  -- RN-SUB-11 · la mensualidad siguiente se emite 7 días antes, y ya con Pro.
  select * into v_sub from public.cuotly_subscriptions where space_id = v_space;
  perform public.run_cuotly_billing_sweep(v_space, v_sub.current_period_end - interval '8 days');
  if exists (select 1 from public.cuotly_charges where subscription_id = v_sub.id and kind = 'period' and period_start = v_sub.current_period_end) then
    raise exception 'RN-SUB-11 FALLIDO: la mensualidad siguiente se emitió antes de los 7 días' using errcode = 'assert_failure';
  end if;
  perform public.run_cuotly_billing_sweep(v_space, v_sub.current_period_end - interval '7 days' + interval '1 hour');
  select * into v_charge from public.cuotly_charges where subscription_id = v_sub.id and kind = 'period' and period_start = v_sub.current_period_end;
  if v_charge.id is null then
    raise exception 'RN-SUB-11 FALLIDO: la mensualidad siguiente no se emitió a los 7 días' using errcode = 'assert_failure';
  end if;
  if v_charge.breakdown ->> 'plan' <> 'pro' or v_charge.base_cents <> 14900 + 2 * 2500 then
    raise exception 'RN-SUB-11 FALLIDO: la mensualidad siguiente no sale con Pro y sus adicionales' using errcode = 'assert_failure';
  end if;
  if v_charge.due_at <> v_sub.current_period_end then
    raise exception 'RN-SUB-11 FALLIDO: la mensualidad no vence el día de la renovación' using errcode = 'assert_failure';
  end if;
  insert into sub_ids values ('cobro2', v_charge.id);
  -- Se emite una sola vez.
  perform public.run_cuotly_billing_sweep(v_space, v_sub.current_period_end - interval '6 days');
  if (select count(*) from public.cuotly_charges where subscription_id = v_sub.id and kind = 'period') <> 2 then
    raise exception 'RN-SUB-11 FALLIDO: la mensualidad se emitió dos veces' using errcode = 'assert_failure';
  end if;

  -- RN-SUB-07 · los cinco avisos, cada uno cuando toca y una sola vez.
  perform public.run_cuotly_billing_sweep(v_space, v_charge.due_at - interval '73 hours');
  if exists (select 1 from public.notifications where event_type = 'cuotly_payment_due_soon' and entity_id = v_charge.id) then
    raise exception 'RN-SUB-07 FALLIDO: el aviso de 3 días llegó antes de tiempo' using errcode = 'assert_failure';
  end if;
  perform public.run_cuotly_billing_sweep(v_space, v_charge.due_at - interval '72 hours');
  perform public.run_cuotly_billing_sweep(v_space, v_charge.due_at - interval '71 hours');
  if (select count(*) from public.notifications where event_type = 'cuotly_payment_due_soon' and entity_id = v_charge.id) <> 1 then
    raise exception 'RN-SUB-07 FALLIDO: el aviso de 3 días no llegó una sola vez' using errcode = 'assert_failure';
  end if;

  -- RN-SUB-10 · en la renovación se aplica la bajada.
  perform public.run_cuotly_billing_sweep(v_space, v_sub.current_period_end);
  select * into v_sub from public.cuotly_subscriptions where space_id = v_space;
  if v_sub.plan <> 'pro' or v_sub.extra_establishments <> 2 or v_sub.pending_plan is not null
     or (select cuotly_plan from public.spaces where id = v_space) <> 'pro' then
    raise exception 'RN-SUB-10 FALLIDO: la bajada a Pro no se aplicó en la renovación' using errcode = 'assert_failure';
  end if;
  if v_sub.current_period_start <> v_charge.period_start then
    raise exception 'RN-SUB-11 FALLIDO: el periodo no avanzó en la renovación' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where action = 'space.plan_changed' and entity_id = v_space and new_value ->> 'kind' = 'at_renewal') then
    raise exception 'RN-SUB-12 FALLIDO: aplicar la bajada no dejó apunte' using errcode = 'assert_failure';
  end if;

  -- El día del vencimiento, a las 24 h y a las 48 h.
  perform public.run_cuotly_billing_sweep(v_space, v_charge.due_at + interval '49 hours');
  if (select count(*) from public.notifications where entity_id = v_charge.id
      and event_type in ('cuotly_payment_due_today', 'cuotly_payment_overdue_24h', 'cuotly_payment_overdue_48h')) <> 3 then
    raise exception 'RN-SUB-07 FALLIDO: faltan avisos del día, de las 24 h o de las 48 h' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications where event_type = 'cuotly_payment_final_notice' and entity_id = v_charge.id) then
    raise exception 'RN-SUB-07 FALLIDO: el último aviso llegó a las 49 h' using errcode = 'assert_failure';
  end if;

  -- RN-SUB-08 · el último aviso a las 60 h, y todavía sin corte.
  perform public.run_cuotly_billing_sweep(v_space, v_charge.due_at + interval '60 hours');
  if not exists (select 1 from public.notifications where event_type = 'cuotly_payment_final_notice' and entity_id = v_charge.id) then
    raise exception 'RN-SUB-07 FALLIDO: el último aviso no llegó a las 60 h' using errcode = 'assert_failure';
  end if;
  if (select cuotly_status from public.spaces where id = v_space) <> 'active' then
    raise exception 'RN-SUB-08 FALLIDO: se cortó antes de las 72 h de gracia (§4.6)' using errcode = 'assert_failure';
  end if;

  -- A las 72 h: archivado por impago.
  perform public.run_cuotly_billing_sweep(v_space, v_charge.due_at + interval '72 hours');
  if (select cuotly_status from public.spaces where id = v_space) <> 'archived_nonpayment' then
    raise exception 'RN-SUB-08 FALLIDO: a las 72 h no se archivó por impago' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where action = 'space.archived_nonpayment' and entity_id = v_space) then
    raise exception 'RN-SUB-12 FALLIDO: archivar por impago no dejó apunte' using errcode = 'assert_failure';
  end if;

  -- RN-SUB-09 · un espacio archivado no emite mensualidades nuevas.
  perform public.run_cuotly_billing_sweep(v_space, v_sub.current_period_end + interval '10 days');
  if (select count(*) from public.cuotly_charges where subscription_id = v_sub.id and kind = 'period') <> 2 then
    raise exception 'RN-SUB-09 FALLIDO: un espacio archivado emitió una mensualidad' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-SUB-09 · la plataforma registra el pago que ve en el banco; dentro del
-- plazo reactiva solo; pasado el plazo, la reactivación es de la plataforma
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_pay uuid;
begin
  v_pay := public.record_cuotly_payment((select v from sub_ids where k = 'cobro2'),
    (select total_cents from public.cuotly_charges where id = (select v from sub_ids where k = 'cobro2')),
    'transfer', now(), 'Visto en el banco', 'rec-1');
  insert into sub_ids values ('pago3', v_pay);
  -- Lo que pasó con el espacio lo comprueba el bloque de abajo, fuera de
  -- RLS: quien registra no es miembro del espacio y no ve su fila.
  if public.cuotly_charge_outstanding_cents((select v from sub_ids where k = 'cobro2')) <> 0 then
    raise exception 'RN-SUB-06 FALLIDO: registrar el pago no saldó el cobro' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
begin
  if (select cuotly_status from public.spaces where id = (select v from sub_ids where k = 'espacio')) <> 'active' then
    raise exception 'RN-SUB-09 FALLIDO: registrar el pago no reactivó el espacio' using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_pay uuid := (select v from sub_ids where k = 'pago3');
begin
  -- RN-FIN-04 aplicada a Cuotly · revertir escribe el apunte contrario.
  perform public.reverse_cuotly_payment(v_pay, 'Era de otro espacio');
  if public.cuotly_charge_outstanding_cents((select v from sub_ids where k = 'cobro2')) <>
     (select total_cents from public.cuotly_charges where id = (select v from sub_ids where k = 'cobro2')) then
    raise exception 'RN-SUB-06 FALLIDO: revertir no devolvió la deuda al libro' using errcode = 'assert_failure';
  end if;
  perform public.reverse_cuotly_payment(v_pay, 'otra vez'); -- CA-17.
  if (select count(*) from public.cuotly_ledger_entries where payment_id = v_pay) <> 2 then
    raise exception 'RN-SUB-06 FALLIDO: revertir dos veces escribió dos apuntes' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_due timestamptz := (select due_at from public.cuotly_charges where id = (select v from sub_ids where k = 'cobro2'));
begin
  -- Vuelve la deuda vencida: el barrido corta otra vez.
  perform public.run_cuotly_billing_sweep(v_space, v_due + interval '80 hours');
  if (select cuotly_status from public.spaces where id = v_space) <> 'archived_nonpayment' then
    raise exception 'RN-SUB-08 FALLIDO: tras revertir el pago no se volvió a archivar' using errcode = 'assert_failure';
  end if;

  -- Y se pone el plazo de 30 días en el pasado, para probar lo que pasa después.
  perform set_config('cuotly.space_status_change', 'on', false);
  update public.spaces set cuotly_reactivation_deadline_at = now() - interval '1 day' where id = v_space;
  perform set_config('cuotly.space_status_change', 'off', false);
end $$;

select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sub_ids where k = 'espacio');
  v_pay uuid;
begin
  v_pay := public.record_cuotly_payment((select v from sub_ids where k = 'cobro2'),
    (select total_cents from public.cuotly_charges where id = (select v from sub_ids where k = 'cobro2')),
    'bizum', now(), 'Llegó tarde', 'rec-2');
end $$;
reset role;

-- El pago se registra, pero pasado el plazo no reactiva solo. Se mira fuera
-- de RLS, por lo mismo que arriba.
do $$
declare v_space uuid := (select v from sub_ids where k = 'espacio');
begin
  if (select cuotly_status from public.spaces where id = v_space) <> 'archived_nonpayment' then
    raise exception 'RN-SUB-09 FALLIDO: pasado el plazo de 30 días el pago reactivó solo' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where action = 'cuotly_payment.confirmed'
                 and space_id = v_space and new_value ->> 'space_after' = 'requires_platform') then
    raise exception 'RN-SUB-09 FALLIDO: la auditoría no dice que la reactivación es de la plataforma' using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_space uuid := (select v from sub_ids where k = 'espacio');
begin
  begin
    perform public.platform_reactivate_space(v_space, '');
    raise exception 'RN-SUB-09 FALLIDO: se reactiva sin motivo' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;
  perform public.platform_reactivate_space(v_space, 'Pagó fuera de plazo; se reactiva');
end $$;
reset role;

do $$
begin
  if (select cuotly_status from public.spaces where id = (select v from sub_ids where k = 'espacio')) <> 'active' then
    raise exception 'RN-SUB-09 FALLIDO: la plataforma no pudo reactivar' using errcode = 'assert_failure';
  end if;
end $$;

-- El Admin de Cuotly sin permiso tampoco reactiva.
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.platform_reactivate_space((select v from sub_ids where k = 'espacio'), 'motivo');
    raise exception 'RN-SUB-09 FALLIDO: un Admin de Cuotly sin permiso reactiva espacios' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-SUB-13 · el almacenamiento se mide y no se limita; el uso lo ve el
-- propietario y Cuotly, y nadie más
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_u record;
begin
  select * into v_u from public.cuotly_space_usage((select v from sub_ids where k = 'espacio'));
  if v_u.active_establishments <> 7 or v_u.internal_users <> 5 or v_u.storage_bytes <> 0 then
    raise exception 'RN-SUB-13 FALLIDO: el uso no se mide bien (% establecimientos, % usuarios, % bytes)',
      v_u.active_establishments, v_u.internal_users, v_u.storage_bytes using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffa00000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  begin
    perform public.cuotly_space_usage((select v from sub_ids where k = 'espacio'));
    raise exception 'RN-SUB-13 FALLIDO: un trabajador ve el uso de la suscripción' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SUB%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- Privilegios: las internas cerradas, las públicas para `authenticated`
-- ============================================================
do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'run_cuotly_billing_sweep(uuid, timestamptz)',
    'set_space_cuotly_status_internal(uuid, text, text, text)',
    'issue_cuotly_charge_internal(uuid, text, text, timestamptz, timestamptz, timestamptz, integer, jsonb)',
    'issue_cuotly_period_charge_internal(uuid, timestamptz, timestamptz)',
    'cuotly_confirm_payment_internal(uuid, text)',
    'cuotly_after_payment_internal(uuid)',
    'cuotly_charge_reference(uuid)',
    'cuotly_space_limits(uuid)',
    'notify_cuotly_event(uuid, text, text, uuid, text, bigint)',
    'guard_space_read_only()',
    'guard_space_cuotly_columns()',
    'guard_cuotly_establishment_limit()',
    'guard_cuotly_user_limit()']
  loop
    if has_function_privilege('anon', 'public.' || v_fn, 'execute')
       or has_function_privilege('authenticated', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % está abierta por RPC', v_fn using errcode = 'assert_failure';
    end if;
  end loop;

  foreach v_fn in array array[
    'declare_cuotly_payment(uuid, integer, text, timestamptz, text, uuid, text, text)',
    'confirm_cuotly_payment(uuid, text)',
    'record_cuotly_payment(uuid, integer, text, timestamptz, text, text)',
    'reject_cuotly_payment(uuid, text)',
    'reverse_cuotly_payment(uuid, text)',
    'set_cuotly_extras(uuid, integer, integer, text)',
    'change_cuotly_plan(uuid, text, integer, integer, text)',
    'cancel_cuotly_plan_change(uuid)',
    'platform_reactivate_space(uuid, text)',
    'cuotly_space_usage(uuid)',
    'is_platform_subscription_manager()']
  loop
    if has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % está abierta a anon', v_fn using errcode = 'assert_failure';
    end if;
    if not has_function_privilege('authenticated', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % no la puede llamar nadie', v_fn using errcode = 'assert_failure';
    end if;
  end loop;
end $$;

-- ============================================================
-- Limpieza: el fixture se va entero, para que la suite se pueda repetir.
-- ============================================================
do $$
declare v_space uuid := (select v from sub_ids where k = 'espacio');
begin
  delete from public.audit_log where space_id = v_space or entity_id = (select v from sub_ids where k = 'sol');
  -- La solicitud apunta al espacio (FK sin cascada): primero ella, luego él.
  delete from public.space_requests where id = (select v from sub_ids where k = 'sol');
  delete from public.spaces where id = v_space;
  delete from public.platform_roles where user_id in (
    'ffa00000-0000-0000-0000-000000000002', 'ffa00000-0000-0000-0000-000000000003');
  delete from auth.users where id in (
    'ffa00000-0000-0000-0000-000000000001', 'ffa00000-0000-0000-0000-000000000002',
    'ffa00000-0000-0000-0000-000000000003', 'ffa00000-0000-0000-0000-000000000004',
    'ffa00000-0000-0000-0000-000000000005', 'ffa00000-0000-0000-0000-000000000006',
    'ffa00000-0000-0000-0000-000000000007', 'ffa00000-0000-0000-0000-000000000008');
end $$;

select 'plataforma_suscripcion_de_cuotly.sql: RN-SUB-01 a 13 cumplidos' as resultado;
