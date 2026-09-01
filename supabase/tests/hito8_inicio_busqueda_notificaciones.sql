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

-- Atajo del fixture: lleva una solicitud de borrador a `accepted` (y por
-- tanto crea su trabajo, RN-REQ-02) recorriendo el flujo real, cambiando
-- de identidad en cada paso igual que lo haría la aplicación. Es SECURITY
-- DEFINER porque `record_classification()` está reservada a `service_role`.
-- Se borra al final del archivo.
create or replace function public.h8_make_job(
  p_establishment_id uuid, p_client uuid, p_staff uuid, p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  perform set_config('request.jwt.claim.sub', p_client::text, false);
  v_request_id := public.create_request_draft(p_establishment_id, p_description, null);
  perform public.submit_request(v_request_id);
  perform public.begin_request_analysis(v_request_id);
  perform public.record_classification(
    v_request_id, p_client, 'rules', 'small', p_description, null, null, null, null, null, null);

  perform set_config('request.jwt.claim.sub', p_staff::text, false);
  perform public.validate_classification(v_request_id, 'small', p_description);

  perform set_config('request.jwt.claim.sub', p_client::text, false);
  perform public.accept_request(v_request_id);

  return (select id from public.jobs where request_id = v_request_id);
end;
$$;

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
    'emit_notification(uuid, uuid, text, text, text, uuid, text, text, uuid, integer, bigint, boolean)',
    'notify_job_event(uuid, text, integer)',
    'notify_establishment_event(uuid, text)',
    'establishment_has_overdue_debt(uuid)']
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

-- ============================================================
-- B4 (revisión de cierre) · RN-ASG-12: "una ausencia aprobada marca
-- automáticamente al trabajador como no disponible y, si deja trabajos sin
-- cobertura, se avisa para reasignar".
--
-- Antes no hacía ninguna de las dos cosas: con la ausencia APROBADA,
-- `auto_assign_job()` seguía asignándole trabajos a la persona ausente.
-- ============================================================
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003', '84000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001');
insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003', 'web', '80000000-0000-0000-0000-000000000001');

-- Un trabajo pendiente de asignar, para poder mirar su lista de candidatos.
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours)
values ('82000000-0000-0000-0000-000000000009', '81000000-0000-0000-0000-000000000001', 'Plan RNASG12', 39900, 20, 12, 3, 0, 24);

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.create_plan_subscription('84000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000009');
  insert into h8_ctx values ('job_rnasg12', public.h8_make_job(
    '84000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005',
    '80000000-0000-0000-0000-000000000001', 'RN-ASG-12: trabajo sin asignar')::text);
  perform set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', false);
end $$;

reset role;

-- Control positivo: sin ausencia, Ana SÍ es candidata. Sin esto, la
-- aserción de abajo pasaría igual si nunca lo fuera por cualquier otro
-- motivo — que es justo cómo se cuelan las comprobaciones vacías.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  if not exists (
    select 1 from public.list_job_candidates((select value::uuid from h8_ctx where key = 'job_rnasg12'))
    where worker_id = '80000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'FIXTURE RN-ASG-12: Ana debería ser candidata antes de la ausencia; sin eso el test no prueba nada'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_absence uuid;
begin
  -- Una ausencia que incluye HOY, para que la indisponibilidad esté viva.
  v_absence := public.request_absence('81000000-0000-0000-0000-000000000001',
    current_date, current_date + 5, 'Baja');
  insert into h8_ctx values ('ausencia_hoy', v_absence::text);
end $$;

reset role;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_absence uuid := (select value::uuid from h8_ctx where key = 'ausencia_hoy');
begin
  perform public.decide_absence(v_absence, true, 'Aprobada');

  -- RN-ASG-12, primera mitad: deja de ser candidata mientras dure. Se
  -- comprueba por su EFECTO —la lista de candidatos que ve quien
  -- asigna— y no llamando a `is_eligible_job_candidate()`, que es interna
  -- desde la migración 30. Además así se prueba lo que de verdad importa.
  if exists (
    select 1 from public.list_job_candidates((select value::uuid from h8_ctx where key = 'job_rnasg12'))
    where worker_id = '80000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'RN-ASG-12 FALLIDO: una trabajadora con ausencia aprobada sigue apareciendo como candidata'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Y fuera de las fechas de la ausencia vuelve a serlo: la indisponibilidad
-- se deriva de la ausencia, no pisa la disponibilidad que declara ella.
-- Las fechas se mueven FUERA del rol: `absences` no tiene política de
-- UPDATE (el libro de ausencias no se edita desde la aplicación), así que
-- hacerlo dentro no cambiaba nada y la aserción pasaba por el motivo
-- equivocado.
do $$
begin
  update public.absences set starts_on = current_date + 30, ends_on = current_date + 35
  where id = (select value::uuid from h8_ctx where key = 'ausencia_hoy');
end $$;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  if not exists (
    select 1 from public.list_job_candidates((select value::uuid from h8_ctx where key = 'job_rnasg12'))
    where worker_id = '80000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'RN-ASG-12 FALLIDO: una ausencia FUTURA deja indisponible a la trabajadora hoy'
      using errcode = 'assert_failure';
  end if;

end $$;

reset role;

do $$
begin
  update public.absences set starts_on = current_date, ends_on = current_date + 5
  where id = (select value::uuid from h8_ctx where key = 'ausencia_hoy');
end $$;

reset role;

-- ============================================================
-- R6 (segunda pasada) · la ausencia se calculaba con `current_date`, que
-- es la fecha del SERVIDOR, no la del espacio. CLAUDE.md es explícito:
-- "las fechas se guardan en timestamptz y se calculan en la zona horaria
-- del espacio". Era la única aparición de `current_date` en las 38
-- migraciones.
--
-- Para que el test sea determinista y no dependa de la hora a la que se
-- ejecute, se elige la zona horaria del espacio de forma que su fecha
-- local NO coincida con la del servidor: entre UTC+14 y UTC-12 hay 26
-- horas, así que en cualquier instante al menos una de las dos difiere de
-- la fecha UTC. La ausencia se pone en la fecha LOCAL del espacio. Si el
-- cálculo usara `current_date`, la ausencia caería "mañana" o "ayer" y
-- Ana seguiría siendo candidata.
-- ============================================================
set timezone = 'UTC';

do $$
declare
  v_tz text;
  v_local date;
begin
  if (now() at time zone 'Etc/GMT-14')::date <> (now() at time zone 'UTC')::date then
    v_tz := 'Etc/GMT-14';   -- UTC+14
  else
    v_tz := 'Etc/GMT+12';   -- UTC-12
  end if;
  v_local := (now() at time zone v_tz)::date;

  if v_local = current_date then
    raise exception 'FIXTURE R6: la zona elegida no desplaza la fecha; el test no probaría nada'
      using errcode = 'assert_failure';
  end if;

  update public.spaces set timezone = v_tz where id = '81000000-0000-0000-0000-000000000001';
  update public.absences set starts_on = v_local, ends_on = v_local
  where id = (select value::uuid from h8_ctx where key = 'ausencia_hoy');
end $$;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  if exists (
    select 1 from public.list_job_candidates((select value::uuid from h8_ctx where key = 'job_rnasg12'))
    where worker_id = '80000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'R6/RN-ASG-12 FALLIDO: la ausencia se calcula con la fecha del servidor, no con la del espacio'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Se deja todo como estaba: la zona del espacio y la ausencia en el
-- futuro, que es lo que esperan los bloques siguientes.
do $$
begin
  update public.spaces set timezone = 'Europe/Madrid' where id = '81000000-0000-0000-0000-000000000001';
  update public.absences set starts_on = current_date + 30, ends_on = current_date + 35
  where id = (select value::uuid from h8_ctx where key = 'ausencia_hoy');
end $$;

-- ============================================================
-- Ana apagó `job_assigned` más arriba, al comprobar RN-NOT-02. Si sigue
-- apagado, el bloque B1 comprobaría que "la responsable recibió el aviso"
-- contra el aviso fósil que dejó el bloque de RN-NOT-05, y pasaría aunque
-- `notify_job_event()` no avisara a nadie. Se vuelve a encender aquí, y se
-- comprueba que se encendió: sin esto la aserción de abajo es hueca.
-- ============================================================
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  perform public.set_notification_preference('81000000-0000-0000-0000-000000000001', 'job_assigned', true, true);
end $$;

reset role;

do $$
begin
  if (select in_app from public.notification_preferences
      where profile_id = '80000000-0000-0000-0000-000000000003'
        and event_type = 'job_assigned') is distinct from true then
    raise exception 'B1 FALLIDO: no se pudo reactivar la preferencia de Ana antes del bloque B1'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- B1 (revisión de cierre) · las operaciones de negocio emiten avisos.
--
-- Toda la maquinaria estaba montada y nadie la usaba: un trabajo asignado,
-- comenzado y publicado dejaba CERO avisos. Aquí se comprueba el recorrido
-- de verdad, y de paso RN-NOT-01 sobre datos reales: el trabajador que NO
-- está asignado no recibe nada.
-- ============================================================
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  insert into h8_ctx values ('job_b1', public.h8_make_job(
    '84000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005',
    '80000000-0000-0000-0000-000000000001', 'B1: cambiar el teléfono')::text);
  perform set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', false);
end $$;

reset role;

do $$
declare
  v_job uuid := (select value::uuid from h8_ctx where key = 'job_b1');
  v_antes integer;
begin
  select count(*) into v_antes from public.notifications where event_type = 'job_assigned';

  perform public.apply_job_assignment(v_job, '80000000-0000-0000-0000-000000000003', 'manual', 'Para Ana');

  if (select count(*) from public.notifications where event_type = 'job_assigned') <= v_antes then
    raise exception '§18/B1 FALLIDO: asignar un trabajo no emitió ningún aviso' using errcode = 'assert_failure';
  end if;

  -- RN-NOT-01 sobre datos reales: Luis no está asignado y no recibe nada.
  if exists (
    select 1 from public.notifications
    where event_type = 'job_assigned' and entity_id = v_job
      and recipient_id = '80000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'RN-NOT-01 FALLIDO: un trabajador sin asignar recibió el aviso del trabajo'
      using errcode = 'assert_failure';
  end if;

  -- Y la responsable sí.
  if not exists (
    select 1 from public.notifications
    where event_type = 'job_assigned' and entity_id = v_job
      and recipient_id = '80000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'RN-NOT-01 FALLIDO: la responsable asignada no recibió el aviso' using errcode = 'assert_failure';
  end if;

  -- RN-NOT-04: el aviso apunta al trabajo exacto.
  if not exists (
    select 1 from public.notifications
    where event_type = 'job_assigned' and deep_link like '%/trabajos/' || v_job::text
  ) then
    raise exception 'RN-NOT-04 FALLIDO: el aviso no apunta al trabajo exacto' using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_job uuid := (select value::uuid from h8_ctx where key = 'job_b1');
begin
  perform public.start_job(v_job);
  if not exists (select 1 from public.notifications where event_type = 'job_started' and entity_id = v_job) then
    raise exception '§18/B1 FALLIDO: comenzar un trabajo no emitió ningún aviso' using errcode = 'assert_failure';
  end if;

  perform public.publish_job(v_job, now() + interval '30 days');
  if not exists (select 1 from public.notifications where event_type = 'job_published' and entity_id = v_job) then
    raise exception '§18/B1 FALLIDO: publicar un trabajo no emitió ningún aviso' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- R4 (segunda pasada) · el §18 tiene siete filas y solo se cubrían dos y
-- media. Aquí se comprueban las que sí deben emitirse hoy, una por una y
-- con su audiencia y su canal, porque el §18 distingue entre lo que se ve
-- dentro de Cuotly y lo que además sale por correo.
--
-- Lo que sigue SIN emitirse está dicho en el ROADMAP, no aquí: consumo de
-- bolsa al 80 %/100 % y los umbrales de T2 y T3, que necesitan el barrido
-- de la cola.
-- ============================================================
do $$
declare
  v_job uuid := (select value::uuid from h8_ctx where key = 'job_b1');
  v_request uuid := (select request_id from public.jobs where id = (select value::uuid from h8_ctx where key = 'job_b1'));
  v_aviso uuid;
begin
  -- §18 fila 1: "Nueva solicitud sin asignar -> propietario y todos los
  -- administradores". No se emitía en absoluto.
  if not exists (
    select 1 from public.notifications
    where event_type = 'request_submitted' and entity_id = v_request
      and recipient_id = '80000000-0000-0000-0000-000000000001'
  ) then
    raise exception '§18/R4 FALLIDO: el propietario no recibe la solicitud nueva' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.notifications
    where event_type = 'request_submitted' and entity_id = v_request
      and recipient_id = '80000000-0000-0000-0000-000000000002'
  ) then
    raise exception '§18/R4 FALLIDO: el administrador no recibe la solicitud nueva' using errcode = 'assert_failure';
  end if;
  -- RN-NOT-01: y los trabajadores no, que la solicitud todavía no es de nadie.
  if exists (
    select 1 from public.notifications
    where event_type = 'request_submitted' and entity_id = v_request
      and recipient_id in ('80000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000004')
  ) then
    raise exception 'RN-NOT-01 FALLIDO: un trabajador recibió el aviso de una solicitud sin asignar'
      using errcode = 'assert_failure';
  end if;

  -- §18 fila 3: "Inicio de un trabajo -> visible DENTRO de Cuotly para el
  -- cliente, sin correo ni push". Estaba al revés: iba al equipo y
  -- encolaba correos, y el cliente no recibía nada.
  select id into v_aviso from public.notifications
  where event_type = 'job_started' and entity_id = v_job
    and audience = 'client' and recipient_id = '80000000-0000-0000-0000-000000000005';
  if v_aviso is null then
    raise exception '§18/R4 FALLIDO: el cliente no ve dentro de Cuotly que su trabajo ha comenzado'
      using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notification_deliveries where notification_id = v_aviso) then
    raise exception '§18/R4 FALLIDO: el aviso de inicio encoló un correo, y el §18 dice "sin correo ni push"'
      using errcode = 'assert_failure';
  end if;

  -- §18 fila 4: "Publicación -> cliente y supervisión". Esta sí sale por
  -- correo, y es lo que separa esta fila de la anterior.
  select id into v_aviso from public.notifications
  where event_type = 'job_published' and entity_id = v_job
    and audience = 'client' and recipient_id = '80000000-0000-0000-0000-000000000005';
  if v_aviso is null then
    raise exception '§18/R4 FALLIDO: el cliente no recibe el aviso de publicación' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.notification_deliveries where notification_id = v_aviso) then
    raise exception '§18/R4 FALLIDO: la publicación no encoló correo para el cliente' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- R2 (segunda pasada) · dos de los siete emisores estaban DETRÁS del
-- `return` de su función, que en PL/pgSQL no se ejecuta nunca. Este cubre
-- el de la corrección; el de la reactivación por pago está en el bloque
-- R1, más abajo.
-- ============================================================
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  perform public.request_free_correction(
    (select value::uuid from h8_ctx where key = 'job_b1'),
    'El teléfono nuevo se ve cortado en el móvil');
end $$;

reset role;

-- La comprobación va FUERA del rol a propósito: `notifications` solo deja
-- ver a cada uno los suyos (`recipient_id = auth.uid()`), así que sentado
-- como el cliente no se ve el aviso de la responsable y la aserción
-- fallaría por el motivo equivocado.
do $$
declare
  v_job uuid := (select value::uuid from h8_ctx where key = 'job_b1');
begin
  if (select assigned_to from public.jobs where id = v_job) is distinct from '80000000-0000-0000-0000-000000000003' then
    raise exception 'FIXTURE R2: el trabajo no sigue asignado a Ana; el aviso no probaría nada'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.notifications
    where event_type = 'correction_requested' and entity_id = v_job
      and recipient_id = '80000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'R2/§18 FALLIDO: pedir una corrección no avisó a la responsable del trabajo'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- R4, resto de la fila 2 del §18 · "Asignación de un trabajo -> el
-- trabajador asignado". Se emitía al asignar, pero NO al aprobar una
-- reasignación: el nuevo responsable no se enteraba de que el trabajo era
-- suyo.
-- ============================================================
-- Para que la reasignación tenga a quién ir: Luis pasa a estar autorizado
-- en el restaurante. Hasta aquí no lo estaba a propósito, porque el bloque
-- B1 comprueba justo lo contrario (RN-NOT-01: no recibe avisos de un
-- trabajo que no es suyo).
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000004',
   '84000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001');
insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000004',
   'web', '80000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  insert into h8_ctx values ('job_reasig', public.h8_make_job(
    '84000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005',
    '80000000-0000-0000-0000-000000000001', 'R4: trabajo que se reasigna')::text);
  perform set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', false);
end $$;

reset role;

do $$
declare
  v_job uuid := (select value::uuid from h8_ctx where key = 'job_reasig');
begin
  perform public.apply_job_assignment(v_job, '80000000-0000-0000-0000-000000000003', 'manual', 'Para Ana');
end $$;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  perform public.request_job_reassignment(
    (select value::uuid from h8_ctx where key = 'job_reasig'), 'Me sale una urgencia');
end $$;

reset role;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', false);
set role authenticated;

-- Control de vacuidad, fuera del rol porque cada uno solo ve sus propios
-- avisos: Luis no tiene todavía ninguno de este trabajo.
reset role;

do $$
begin
  if exists (
    select 1 from public.notifications
    where event_type = 'job_assigned'
      and entity_id = (select value::uuid from h8_ctx where key = 'job_reasig')
      and recipient_id = '80000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'FIXTURE R4: Luis ya tenía el aviso antes de la reasignación; el test no probaría nada'
      using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.approve_job_reassignment(
    (select value::uuid from h8_ctx where key = 'job_reasig'),
    '80000000-0000-0000-0000-000000000004', 'Se lo pasa a Luis');
end $$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.notifications
    where event_type = 'job_assigned'
      and entity_id = (select value::uuid from h8_ctx where key = 'job_reasig')
      and recipient_id = '80000000-0000-0000-0000-000000000004'
  ) then
    raise exception '§18/R4 FALLIDO: aprobar una reasignación no avisó al nuevo responsable'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- R7 (segunda pasada) · CA-18 y RN-NOT-05: "el fallo de una notificación
-- nunca revierte la operación principal".
--
-- La cola cubría el fallo TARDÍO (Resend caído). El temprano no lo cubría
-- nadie: un `threshold_percent` fuera del CHECK (0..100) lanzaba una
-- excepción que salía de `emit_notification()` y se llevaba por delante la
-- operación de negocio que la había originado.
--
-- Se llama fuera de `set role` a propósito: la función es interna desde la
-- migración 36 y `authenticated` no la puede ejecutar por RPC.
-- ============================================================
do $$
declare
  v_job uuid := (select value::uuid from h8_ctx where key = 'job_b1');
  v_resultado uuid;
begin
  -- La "operación principal" de este test: una fila propia que tiene que
  -- sobrevivir al aviso mal formado.
  insert into h8_ctx values ('r7_marca', 'viva');

  begin
    v_resultado := public.emit_notification(
      '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003',
      'job_assigned', 'staff', 'job', v_job,
      '/espacios/espacio-h8-test/trabajos/' || v_job::text,
      'r7-umbral-imposible:' || v_job::text, null, 150);
  exception when others then
    raise exception 'R7/CA-18 FALLIDO: un aviso mal formado tumbó la operación principal (%)', sqlerrm
      using errcode = 'assert_failure';
  end;

  if v_resultado is not null then
    raise exception 'R7 FALLIDO: se creó un aviso con un umbral fuera de rango' using errcode = 'assert_failure';
  end if;

  if (select value from h8_ctx where key = 'r7_marca') is distinct from 'viva' then
    raise exception 'R7/CA-18 FALLIDO: el fallo del aviso revirtió la operación principal'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- B2 (revisión de cierre) · el estado de un establecimiento no se cambia
-- con un UPDATE directo.
--
-- Antes, el administrador levantaba una suspensión por impago con
--   update public.establishments set status = 'active' …
-- y el servicio volvía a estar en marcha con cero pagos y cero auditoría,
-- con los contadores todavía pausados.
-- ============================================================
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_sub uuid;
begin
  -- La suscripción ya existe (la creó el bloque de RN-ASG-12): un
  -- establecimiento solo puede tener un plan activo a la vez.
  select id into v_sub from public.subscriptions
  where establishment_id = '84000000-0000-0000-0000-000000000001' and kind = 'plan' and status = 'active';
  perform public.generate_monthly_charge(v_sub, now() - interval '80 hours');
  perform public.evaluate_establishment_dunning('84000000-0000-0000-0000-000000000001');

  if (select status from public.establishments where id = '84000000-0000-0000-0000-000000000001') <> 'suspended' then
    raise exception 'FIXTURE B2: el establecimiento debería quedar suspendido por impago' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  -- CLAUDE.md MUST: todo cambio de estado deja evento y auditoría.
  begin
    update public.establishments set status = 'active'
    where id = '84000000-0000-0000-0000-000000000001';
    raise exception 'CLAUDE.md MUST FALLIDO: se cambió el estado de un establecimiento con un UPDATE directo, sin auditoría ni evento'
      using errcode = 'assert_failure';
  exception
    -- R5: desde la migración 38 esto ya no lo para un trigger sino un
    -- privilegio de columna, así que el UPDATE ni siquiera llega al
    -- trigger. Se aceptan las dos formas de rechazo y ninguna otra.
    when insufficient_privilege then
      null;
    when raise_exception then
      if sqlerrm not like '%set_establishment_status%' then
        raise exception 'B2 FALLIDO: el UPDATE falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;

  -- RN-FIN-13: y tampoco por la puerta buena se sale de un impago sin cobrar.
  begin
    perform public.set_establishment_status('84000000-0000-0000-0000-000000000001', 'active', 'Venga va');
    raise exception 'RN-FIN-13 FALLIDO: se salió de una parada por impago sin registrar ningún pago'
      using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%se reactiva al cobrar%' then
        raise exception 'B2 FALLIDO: set_establishment_status() falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;

  if (select status from public.establishments where id = '84000000-0000-0000-0000-000000000001') <> 'suspended' then
    raise exception 'B2 FALLIDO: el establecimiento dejó de estar suspendido' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- R5 (segunda pasada) · lo que impedía el UPDATE directo del bloque
-- anterior era un trigger que miraba una bandera de sesión
-- (`cuotly.status_change`), y esa bandera la puede poner cualquiera con
-- `select set_config('cuotly.status_change', 'on', true)`. Una convención,
-- no un control. Ahora es un privilegio de columna, que no se puede
-- imitar desde la sesión.
-- ============================================================
do $$
begin
  if has_column_privilege('authenticated', 'public.establishments', 'status', 'update') then
    raise exception 'R5 FALLIDO: `authenticated` sigue pudiendo escribir directamente en establishments.status'
      using errcode = 'assert_failure';
  end if;
  if has_column_privilege('authenticated', 'public.establishments', 'space_id', 'update') then
    raise exception 'R5 FALLIDO: `authenticated` puede mover un restaurante de espacio con un UPDATE'
      using errcode = 'assert_failure';
  end if;

  -- Control positivo: lo que la aplicación sí edita sigue editándose. Sin
  -- esto, revocar de más pasaría el test y rompería el producto.
  if not has_column_privilege('authenticated', 'public.establishments', 'name', 'update') then
    raise exception 'R5 FALLIDO: se revocó de más; ya no se puede renombrar un restaurante'
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y la bandera de sesión, puesta a mano, ya no abre nada.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  perform set_config('cuotly.status_change', 'on', true);
  begin
    update public.establishments set status = 'active'
    where id = '84000000-0000-0000-0000-000000000001';
    raise exception 'R5 FALLIDO: poniendo la bandera a mano se cambió el estado con un UPDATE directo'
      using errcode = 'assert_failure';
  exception
    when insufficient_privilege then
      null;
  end;
  perform set_config('cuotly.status_change', 'off', true);
end $$;

reset role;

-- ============================================================
-- R1 (segunda pasada) · la guarda anterior miraba el ESTADO DE DESTINO
-- (`active` y `configuring`) en vez de la DEUDA.
-- `assert_establishment_service_running()` solo para el servicio en
-- `paused` y `suspended`, así que cualquier otro estado es servicio en
-- marcha: bastaba `suspended -> ending` para volver a dar servicio con la
-- deuda viva, y `suspended -> archived -> active` para lavar el estado
-- entero. Encima quedaba irreversible, porque
-- `reactivate_establishment_after_payment()` salía por la puerta de atrás
-- y no reanudaba los contadores nunca más.
-- ============================================================
do $$
begin
  -- Sin esto el resto del bloque no probaría nada.
  if not public.establishment_has_overdue_debt('84000000-0000-0000-0000-000000000001') then
    raise exception 'FIXTURE R1: no hay deuda vencida; el test no probaría nada' using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_destino text;
begin
  -- Ninguno de los estados que equivalen a "servicio en marcha" es
  -- alcanzable mientras haya deuda vencida.
  foreach v_destino in array array['active', 'configuring', 'ending', 'read_only'] loop
    begin
      perform public.set_establishment_status('84000000-0000-0000-0000-000000000001', v_destino, 'A ver si cuela');
      raise exception 'R1/RN-FIN-13 FALLIDO: con deuda vencida se llegó al estado %', v_destino
        using errcode = 'assert_failure';
    exception
      when raise_exception then
        if sqlerrm not like '%se reactiva al cobrar%' then
          raise exception 'R1 FALLIDO: el paso a % falló por otro motivo: %', v_destino, sqlerrm
            using errcode = 'assert_failure';
        end if;
    end;
  end loop;

  if (select status from public.establishments where id = '84000000-0000-0000-0000-000000000001') <> 'suspended' then
    raise exception 'R1 FALLIDO: el establecimiento salió de la suspensión' using errcode = 'assert_failure';
  end if;

  -- RN-FIN-14: la suspensión no cancela el compromiso y la deuda se
  -- mantiene, así que archivar a un moroso SÍ es legítimo. Control
  -- positivo: sin esto, prohibirlo todo pasaría el test.
  perform public.set_establishment_status('84000000-0000-0000-0000-000000000001', 'archived', 'Se marcha debiendo');
  if (select status from public.establishments where id = '84000000-0000-0000-0000-000000000001') <> 'archived' then
    raise exception 'RN-FIN-14 FALLIDO: no se puede archivar a un moroso' using errcode = 'assert_failure';
  end if;

  -- Y desde ahí tampoco se vuelve al servicio sin cobrar: el lavado en
  -- dos pasos era el agujero.
  begin
    perform public.set_establishment_status('84000000-0000-0000-0000-000000000001', 'active', 'Como si nada');
    raise exception 'R1 FALLIDO: suspended -> archived -> active devolvió el servicio con la deuda viva'
      using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%se reactiva al cobrar%' then
        raise exception 'R1 FALLIDO: el lavado falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;

  -- Se deja donde estaba para que pagar pueda reactivarlo de verdad.
  perform public.set_establishment_status('84000000-0000-0000-0000-000000000001', 'suspended', 'Vuelve a la suspensión');
end $$;

reset role;

-- ============================================================
-- Y por la puerta buena sí: se cobra y se reactiva. Esto cubre además el
-- segundo emisor muerto de R2 —`establishment_reactivated` estaba detrás
-- del `return` de `reactivate_establishment_after_payment()`— y que los
-- contadores se reanudan, que es lo que quedaba congelado para siempre.
-- ============================================================
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_charge uuid;
  v_pendiente integer;
begin
  select c.id into v_charge from public.charges c
  where c.establishment_id = '84000000-0000-0000-0000-000000000001'
    and now() > c.due_at and public.charge_outstanding_cents(c.id) > 0
  limit 1;

  v_pendiente := public.charge_outstanding_cents(v_charge);
  perform public.register_payment(v_charge, v_pendiente, 'transfer', now(), null, 'Pagado por transferencia', 'r1-pago');
end $$;

reset role;

do $$
begin
  if public.establishment_has_overdue_debt('84000000-0000-0000-0000-000000000001') then
    raise exception 'R1 FALLIDO: el pago no saldó la deuda vencida' using errcode = 'assert_failure';
  end if;

  if (select status from public.establishments where id = '84000000-0000-0000-0000-000000000001')
     in ('paused', 'suspended') then
    raise exception 'RN-FIN-13 FALLIDO: pagar no levantó la parada por impago' using errcode = 'assert_failure';
  end if;

  -- R2: el aviso de reactivación estaba detrás del `return` y no se
  -- emitía nunca.
  if not exists (
    select 1 from public.notifications
    where event_type = 'establishment_reactivated'
      and entity_id = '84000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'R2/§18 FALLIDO: reactivar por pago no emitió ningún aviso' using errcode = 'assert_failure';
  end if;
end $$;

-- Ahora que no hay deuda, el cambio de estado a mano vuelve a estar
-- permitido: la guarda depende de la deuda, no del estado del que se venga.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  perform public.set_establishment_status('84000000-0000-0000-0000-000000000001', 'ending', 'Nos deja a fin de mes');
  if (select status from public.establishments where id = '84000000-0000-0000-0000-000000000001') <> 'ending' then
    raise exception 'R1 FALLIDO: sin deuda, la guarda sigue bloqueando un cambio legítimo'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- H1/H2 (tercera pasada) · `read_only` y `archived` tienen que detener el
-- servicio, y no lo detenían.
--
-- El arreglo R1 cerró `ending` y dejó `archived` abierto a propósito
-- —RN-FIN-14 permite archivar a un moroso—, pero
-- `assert_establishment_service_running()` seguía parando el servicio solo
-- en `paused` y `suspended`, así que archivar era exactamente la misma
-- puerta con otro nombre: comprobado, un establecimiento archivado con
-- deuda viva dejaba enviar una solicitud nueva y arrancaba su contador T1.
--
-- Y `read_only`, que RN-EST-09 y RN-EST-10 describen como las 24 h de
-- SOLO LECTURA previas a la suspensión, no lo hacía cumplir nadie: estaba
-- en el CHECK de la tabla y en los nombres, en ninguna guarda.
-- ============================================================

-- Control positivo primero: en `ending` el servicio SIGUE activo
-- (RN-EST-09, "hasta el final del periodo pagado"). Sin esto, prohibirlo
-- todo pasaría el test.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_draft uuid;
begin
  if (select status from public.establishments where id = '84000000-0000-0000-0000-000000000001') <> 'ending' then
    raise exception 'FIXTURE H1: el establecimiento debería estar en `ending` aquí' using errcode = 'assert_failure';
  end if;

  v_draft := public.create_request_draft('84000000-0000-0000-0000-000000000001', 'H1: en ending sí se puede', null);
  perform public.submit_request(v_draft);
  if (select state from public.requests where id = v_draft) <> 'received' then
    raise exception 'RN-EST-09 FALLIDO: en `ending` el servicio debe seguir activo' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  perform public.set_establishment_status('84000000-0000-0000-0000-000000000001', 'read_only', 'Se acaba el periodo');
end $$;

reset role;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_draft uuid;
begin
  v_draft := public.create_request_draft('84000000-0000-0000-0000-000000000001', 'H2: en solo lectura no', null);
  begin
    perform public.submit_request(v_draft);
    raise exception 'RN-EST-10 FALLIDO: en `read_only` se envió una solicitud; "solo lectura" no significaba nada'
      using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%solo lectura%' then
        raise exception 'H2 FALLIDO: el envío falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

-- Y archivado, igual: RN-FIN-14 deja archivar a un moroso, pero archivar
-- es la salida, no una forma de seguir trabajando.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  perform public.set_establishment_status('84000000-0000-0000-0000-000000000001', 'archived', 'Cierra');
end $$;

reset role;

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_draft uuid;
  v_antes integer;
begin
  select count(*) into v_antes from public.timer_events where counter_kind = 't1' and event_type = 'started';

  v_draft := public.create_request_draft('84000000-0000-0000-0000-000000000001', 'H1: archivado tampoco', null);
  begin
    perform public.submit_request(v_draft);
    raise exception 'H1 FALLIDO: un establecimiento archivado admitió una solicitud nueva'
      using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%archivado%' then
        raise exception 'H1 FALLIDO: el envío falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

-- Ningún contador arrancó por el camino: era el daño concreto de la
-- decisión 11 ("se paraban once contadores y el cliente encendía dos
-- más").
do $$
begin
  if exists (
    select 1 from public.timer_events te
    join public.requests r on r.id = te.entity_id
    where te.counter_kind = 't1' and te.event_type = 'started'
      and r.description in ('H2: en solo lectura no', 'H1: archivado tampoco')
  ) then
    raise exception 'RN-FIN-12 FALLIDO: se arrancó un contador con el servicio detenido'
      using errcode = 'assert_failure';
  end if;
end $$;

-- Se deja donde lo esperaba el bloque siguiente.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  perform public.set_establishment_status('84000000-0000-0000-0000-000000000001', 'ending', 'Vuelve a ending');
end $$;

reset role;

-- HU-09 / RN-EST-08: el cambio legítimo sí ocurre, y deja rastro.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  perform public.set_establishment_status('84000000-0000-0000-0000-000000000001', 'archived', 'Cierra el local');

  if (select status from public.establishments where id = '84000000-0000-0000-0000-000000000001') <> 'archived' then
    raise exception 'HU-09 FALLIDO: el cambio legítimo de estado no se aplicó' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.audit_log
    where action = 'establishment.status_changed'
      and entity_id = '84000000-0000-0000-0000-000000000001'
      and reason = 'Cierra el local'
  ) then
    raise exception 'CA-15/CA-16 FALLIDO: el cambio de estado no quedó auditado con su motivo' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.state_events
    where entity_type = 'establishment' and entity_id = '84000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'RN-EST-08 FALLIDO: el cambio de estado no dejó evento' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- B3 (revisión de cierre) · CA-03: un trabajador no ve finanzas globales,
-- tampoco por la auditoría.
--
-- Las tablas financieras estaban bien cerradas, pero `audit_log` guarda
-- los importes en `new_value` y su política se lo abría a todo miembro del
-- espacio. El test de CA-03 del Hito 7 solo miraba la puerta estrecha.
-- ============================================================
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_financieras integer;
begin
  -- Ojo: NO se comprueba que vea cero cobros. RN-FIN-05 le deja marcar
  -- como pagado un cobro de un restaurante que tenga asignado, así que
  -- verlos es correcto. Lo que CA-03 prohíbe son las finanzas GLOBALES, y
  -- por ahí es por donde se colaba la auditoría: `audit_log` guarda los
  -- importes en `new_value` y su política se lo abría a todo el espacio,
  -- incluidos establecimientos que no tiene asignados.
  select count(*) into v_financieras from public.audit_log
  where action like 'charge.%' or action like 'payment.%' or action like 'subscription.%';

  if v_financieras <> 0 then
    raise exception 'CA-03 FALLIDO: un trabajador lee % filas financieras de la auditoría (importes incluidos)', v_financieras
      using errcode = 'assert_failure';
  end if;

  -- Control positivo: lo que NO es financiero sigue viéndose (CA-16).
  if (select count(*) from public.audit_log where action = 'absence.decided') = 0 then
    raise exception 'CA-16 FALLIDO: el equipo dejó de ver la auditoría no financiera' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Y quien sí lleva finanzas la ve.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  if (select count(*) from public.audit_log where action like 'charge.%') = 0 then
    raise exception 'CA-16 FALLIDO: el propietario no ve la auditoría financiera de su espacio' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Limpieza. `audit_log` no borra en cascada a propósito (CLAUDE.md: los
-- registros de auditoría no se editan ni se borran desde la aplicación),
-- así que aquí se quita a mano lo que este fixture escribió.
delete from public.audit_log where space_id in (
  '81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000009');
delete from public.spaces where id in (
  '81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000009');
delete from auth.users where email like 'h8-%@example.com';
drop function public.h8_make_job(uuid, uuid, uuid, text);
drop table if exists h8_ctx;

do $$
begin
  raise notice 'hito8_inicio_busqueda_notificaciones.sql: HU-30, HU-31, HU-33, HU-34 y RN-NOT-01 a 05 cumplidos, base de datos limpia';
end $$;
