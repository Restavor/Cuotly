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
    where event_type = 'job_assigned' and recipient_id = '80000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'RN-NOT-01 FALLIDO: un trabajador sin asignar recibió el aviso del trabajo'
      using errcode = 'assert_failure';
  end if;

  -- Y la responsable sí.
  if not exists (
    select 1 from public.notifications
    where event_type = 'job_assigned' and recipient_id = '80000000-0000-0000-0000-000000000003'
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
