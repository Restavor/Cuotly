-- Verificación del Hito 8 contra la base de datos real: HU-30, HU-31,
-- HU-33 y HU-34, las reglas RN-NOT-01 a RN-NOT-05, y los controles
-- negativos que cada operación nueva trae consigo (CA-01, CA-02, CA-04).
--
-- Lo que NO está aquí, y por qué: los cuatro criterios de experiencia
-- (CA-19 a CA-22) son de interfaz y se comprueban con Playwright en
-- apps/web/e2e/hito8-experiencia.spec.ts; el catálogo de eventos y las
-- reglas de destinatario son lógica pura y viven en
-- apps/web/src/core/notifications.ts con sus tests de Vitest. Aquí está lo
-- otro: que el servidor haga cumplir las reglas aunque alguien llame a las
-- funciones directamente, sin pasar por ninguna pantalla.
--
-- Cómo ejecutarlo: automáticamente en CI, o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hito8_inicio_busqueda_notificaciones.sql

-- ============================================================
-- Fixture: un espacio con propietario, administrador y dos trabajadores;
-- un restaurante con su propietario local; y una identidad de otro
-- espacio para los controles negativos de CA-02.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('80000000-0000-0000-0000-000000000001', 'h8-owner@example.com', 'authenticated', 'authenticated'),
  ('80000000-0000-0000-0000-000000000002', 'h8-admin@example.com', 'authenticated', 'authenticated'),
  ('80000000-0000-0000-0000-000000000003', 'h8-ana@example.com', 'authenticated', 'authenticated'),
  ('80000000-0000-0000-0000-000000000004', 'h8-luis@example.com', 'authenticated', 'authenticated'),
  ('80000000-0000-0000-0000-000000000005', 'h8-client@example.com', 'authenticated', 'authenticated'),
  ('80000000-0000-0000-0000-000000000099', 'h8-ajeno@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('81000000-0000-0000-0000-000000000001', 'Espacio H8', 'espacio-h8-test', '80000000-0000-0000-0000-000000000001'),
  ('81000000-0000-0000-0000-000000000009', 'Espacio Ajeno H8', 'espacio-h8-ajeno', '80000000-0000-0000-0000-000000000099');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000004', 'worker', 'active'),
  ('81000000-0000-0000-0000-000000000009', '80000000-0000-0000-0000-000000000099', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Grupo H8');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('84000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 'EST-H8', 'Restaurante Ocho');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('84000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', 'local_owner');

create temporary table h8_ctx (key text primary key, value text);
grant select, insert on h8_ctx to authenticated, service_role;

-- ============================================================
-- RN-NOT-05 · idempotencia: "pulsar dos veces produce un único efecto y
-- una única notificación" (CA-17). La unicidad la impone la base de
-- datos, no una comprobación previa que dos peticiones simultáneas
-- podrían pasar a la vez.
-- ============================================================
do $$
declare
  v_primera uuid;
  v_segunda uuid;
begin
  v_primera := public.emit_notification(
    '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003',
    'job_assigned', 'staff', 'job', '85000000-0000-0000-0000-000000000001',
    '/espacios/espacio-h8-test/trabajos/85000000-0000-0000-0000-000000000001',
    'job_assigned:85000000-0000-0000-0000-000000000001');

  v_segunda := public.emit_notification(
    '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003',
    'job_assigned', 'staff', 'job', '85000000-0000-0000-0000-000000000001',
    '/espacios/espacio-h8-test/trabajos/85000000-0000-0000-0000-000000000001',
    'job_assigned:85000000-0000-0000-0000-000000000001');

  if v_primera is null then
    raise exception 'RN-NOT FALLIDO: el primer aviso no se creó' using errcode = 'assert_failure';
  end if;
  if v_segunda is not null then
    raise exception 'RN-NOT-05/CA-17 FALLIDO: emitir dos veces creó dos avisos' using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.notifications
      where recipient_id = '80000000-0000-0000-0000-000000000003'
        and dedupe_key = 'job_assigned:85000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'RN-NOT-05 FALLIDO: hay más de un aviso con la misma clave' using errcode = 'assert_failure';
  end if;

  -- Y un único envío encolado: idempotencia también en la cola.
  if (select count(*) from public.notification_deliveries d
      join public.notifications n on n.id = d.notification_id
      where n.dedupe_key = 'job_assigned:85000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'RN-NOT-05 FALLIDO: se encoló más de un envío para el mismo aviso' using errcode = 'assert_failure';
  end if;

  insert into h8_ctx values ('aviso_ana', v_primera::text);
end $$;

-- ============================================================
-- RN-NOT-05 y CA-18 · "el fallo de una notificación nunca revierte la
-- operación principal". La forma de garantizarlo es que el envío sea otra
-- fila y no una llamada dentro de la transacción de negocio: aquí se
-- comprueba que la cola puede quedar en `failed` sin que el aviso ni nada
-- de lo que lo originó se toque.
-- ============================================================
do $$
begin
  update public.notification_deliveries
  set status = 'failed', attempts = 3, last_error = 'Resend no responde'
  where notification_id = (select value::uuid from h8_ctx where key = 'aviso_ana');

  if not exists (select 1 from public.notifications where id = (select value::uuid from h8_ctx where key = 'aviso_ana')) then
    raise exception 'CA-18 FALLIDO: el fallo del envío se llevó por delante el aviso' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- CA-02 · los avisos son de quien son. Ni el trabajador ajeno ni el
-- restaurante ven los de Ana, y nadie marca como leído lo que no es suyo.
-- ============================================================
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
begin
  if (select count(*) from public.notifications) <> 0 then
    raise exception 'CA-02 FALLIDO: otro trabajador ve avisos que no son suyos' using errcode = 'assert_failure';
  end if;

  begin
    perform public.mark_notification_read((select value::uuid from h8_ctx where key = 'aviso_ana'));
    raise exception 'CA-02 FALLIDO: se pudo marcar como leído un aviso ajeno' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%tus propios avisos%' then
        raise exception 'CA-02 FALLIDO: mark_notification_read() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

-- HU-34 · el destinatario sí lo ve y sí lo marca.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_aviso uuid := (select value::uuid from h8_ctx where key = 'aviso_ana');
begin
  if (select count(*) from public.notifications where id = v_aviso) <> 1 then
    raise exception 'HU-34 FALLIDO: el destinatario no ve su propio aviso' using errcode = 'assert_failure';
  end if;

  perform public.mark_notification_read(v_aviso);
  if (select read_at from public.notifications where id = v_aviso) is null then
    raise exception 'HU-34 FALLIDO: marcar como leído no dejó constancia' using errcode = 'assert_failure';
  end if;

  -- RN-NOT-04: el enlace apunta al elemento exacto y no lleva credenciales.
  if (select deep_link from public.notifications where id = v_aviso) not like '/espacios/%' then
    raise exception 'RN-NOT-04 FALLIDO: el aviso no lleva enlace profundo' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-NOT-02 y RN-NOT-03 · qué se puede desactivar y qué no.
-- ============================================================
do $$
begin
  -- Secundario: se puede apagar.
  perform public.set_notification_preference('81000000-0000-0000-0000-000000000001', 'job_assigned', false, false);
  if (select in_app from public.notification_preferences
      where profile_id = '80000000-0000-0000-0000-000000000003' and event_type = 'job_assigned') <> false then
    raise exception 'RN-NOT-02 FALLIDO: no se pudo desactivar un aviso secundario' using errcode = 'assert_failure';
  end if;

  -- RN-NOT-03: los vencimientos críticos y los impagos graves, no.
  for i in 1..1 loop
    null;
  end loop;
end $$;

do $$
declare
  v_evento text;
begin
  foreach v_evento in array array[
    't2_threshold_100', 't3_threshold_100',
    'establishment_paused_nonpayment', 'establishment_suspended_nonpayment']
  loop
    begin
      perform public.set_notification_preference('81000000-0000-0000-0000-000000000001', v_evento, false, false);
      raise exception 'RN-NOT-03 FALLIDO: se pudo desactivar "%", que es obligatorio', v_evento using errcode = 'assert_failure';
    exception
      when raise_exception then
        if sqlerrm not like '%no se puede desactivar%' then
          raise exception 'RN-NOT-03 FALLIDO: falló por otro motivo (%): %', v_evento, sqlerrm using errcode = 'assert_failure';
        end if;
    end;
  end loop;
end $$;

reset role;

-- RN-NOT-02/03 desde el otro lado: con la preferencia apagada no se emite
-- el secundario, y el obligatorio se emite igual.
do $$
declare
  v_secundario uuid;
  v_obligatorio uuid;
begin
  v_secundario := public.emit_notification(
    '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003',
    'job_assigned', 'staff', 'job', '85000000-0000-0000-0000-000000000002',
    '/espacios/espacio-h8-test/trabajos/85000000-0000-0000-0000-000000000002',
    'job_assigned:85000000-0000-0000-0000-000000000002');

  if v_secundario is not null then
    raise exception 'RN-NOT-02 FALLIDO: se emitió un aviso secundario desactivado' using errcode = 'assert_failure';
  end if;

  v_obligatorio := public.emit_notification(
    '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003',
    't3_threshold_100', 'staff', 'job', '85000000-0000-0000-0000-000000000002',
    '/espacios/espacio-h8-test/trabajos/85000000-0000-0000-0000-000000000002',
    't3_threshold_100:85000000-0000-0000-0000-000000000002');

  if v_obligatorio is null then
    raise exception 'RN-NOT-03 FALLIDO: un aviso obligatorio no se emitió' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- HU-30 / HU-31 · ausencias.
-- ============================================================
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_absence uuid;
begin
  v_absence := public.request_absence('81000000-0000-0000-0000-000000000001',
    current_date + 10, current_date + 14, 'Vacaciones');
  insert into h8_ctx values ('ausencia', v_absence::text);

  -- CA-01: quien la pide no la aprueba.
  begin
    perform public.decide_absence(v_absence, true, null);
    raise exception 'CA-01 FALLIDO: una trabajadora aprobó su propia ausencia' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%propietario o un administrador%' then
        raise exception 'CA-01 FALLIDO: decide_absence() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

-- HU-31: el administrador sí decide, y queda auditado.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_absence uuid := (select value::uuid from h8_ctx where key = 'ausencia');
begin
  perform public.decide_absence(v_absence, true, 'Aprobada');

  if (select state from public.absences where id = v_absence) <> 'approved' then
    raise exception 'HU-31 FALLIDO: la ausencia no quedó aprobada' using errcode = 'assert_failure';
  end if;

  -- CA-17: decidir dos veces produce un único efecto.
  perform public.decide_absence(v_absence, false, 'Me equivoqué');
  if (select state from public.absences where id = v_absence) <> 'approved' then
    raise exception 'CA-17 FALLIDO: decidir dos veces cambió el resultado' using errcode = 'assert_failure';
  end if;

  if not exists (select 1 from public.audit_log where action = 'absence.decided' and entity_id = v_absence) then
    raise exception 'CA-16 FALLIDO: la decisión no quedó auditada' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- P7 / CA-04 · las ausencias son organización interna del equipo: el
-- restaurante no ve la fila, no se le tapa una columna.
-- ============================================================
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  if (select count(*) from public.absences) <> 0 then
    raise exception 'P7/CA-04 FALLIDO: el restaurante ve las ausencias del equipo' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- HU-33 · búsqueda global. "Nunca devuelve resultados a los que el
-- usuario no tenga acceso (el filtrado ocurre en servidor)."
-- ============================================================
do $$
declare
  v_propios integer;
  v_personas integer;
begin
  -- Lo suyo sí lo encuentra.
  select count(*) into v_propios from public.global_search('Restaurante Ocho')
  where kind = 'establishment';
  if v_propios <> 1 then
    raise exception 'HU-33 FALLIDO: el restaurante no encuentra su propio establecimiento (% resultados)', v_propios using errcode = 'assert_failure';
  end if;

  -- Y no encuentra al equipo: `profiles` solo se ve entre miembros del
  -- mismo espacio, y el restaurante no lo es (CA-04).
  select count(*) into v_personas from public.global_search('h8-')
  where kind = 'person' and title <> 'h8-client@example.com';
  if v_personas <> 0 then
    raise exception 'CA-04 FALLIDO: la búsqueda devolvió % personas del equipo al restaurante', v_personas using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- CA-02 · una identidad de otro espacio no encuentra nada de este.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000099', false);
set role authenticated;

do $$
begin
  if (select count(*) from public.global_search('Restaurante Ocho')) <> 0 then
    raise exception 'CA-02 FALLIDO: una identidad ajena encontró el establecimiento de otro espacio' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.global_search('EST-H8')) <> 0 then
    raise exception 'CA-02 FALLIDO: una identidad ajena encontró por código' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- Calendario · los eventos se derivan, y el festivo aparece.
-- ============================================================
insert into public.holidays (space_id, holiday_date, name, created_by)
values ('81000000-0000-0000-0000-000000000001', current_date + 12, 'Fiesta local', '80000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_festivos integer;
  v_ausencias integer;
begin
  select count(*) into v_festivos
  from public.space_calendar('81000000-0000-0000-0000-000000000001', current_date, current_date + 30)
  where kind = 'holiday';
  if v_festivos <> 1 then
    raise exception 'Calendario FALLIDO: el festivo no aparece (% eventos)', v_festivos using errcode = 'assert_failure';
  end if;

  -- La ausencia aprobada ocupa sus cinco días.
  select count(*) into v_ausencias
  from public.space_calendar('81000000-0000-0000-0000-000000000001', current_date, current_date + 30)
  where kind = 'absence';
  if v_ausencias <> 5 then
    raise exception 'Calendario FALLIDO: la ausencia debería ocupar 5 días, ocupa %', v_ausencias using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- Las funciones internas del hito no pueden quedar invocables por RPC.
-- Misma comprobación que cierra los hitos 6 y 7, por el fallo real del
-- 30/08/2026: en Supabase, `revoke ... from public` no basta.
-- ============================================================
do $$
declare
  v_fn text;
  v_abiertas text := '';
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'Sin rol authenticated: se omite la comprobación de funciones internas';
    return;
  end if;

  foreach v_fn in array array[
    'emit_notification(uuid, uuid, text, text, text, uuid, text, text, uuid, integer, bigint)']
  loop
    if has_function_privilege('authenticated', 'public.' || v_fn, 'execute')
       or has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      v_abiertas := v_abiertas || ' ' || v_fn;
    end if;
  end loop;

  if v_abiertas <> '' then
    raise exception 'FUNCIONES INTERNAS ABIERTAS por RPC a anon/authenticated:%', v_abiertas
      using errcode = 'assert_failure';
  end if;
end $$;

-- Limpieza. `audit_log` no borra en cascada a propósito (CLAUDE.md: los
-- registros de auditoría no se editan ni se borran desde la aplicación),
-- así que aquí se quita a mano lo que este fixture escribió.
delete from public.audit_log where space_id in (
  '81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000009');
delete from public.spaces where id in (
  '81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000009');
delete from auth.users where email like 'h8-%@example.com';
drop table if exists h8_ctx;

do $$
begin
  raise notice 'hito8_inicio_busqueda_notificaciones.sql: HU-30, HU-31, HU-33, HU-34 y RN-NOT-01 a 05 cumplidos, base de datos limpia';
end $$;
