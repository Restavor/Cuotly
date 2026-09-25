-- ============================================================
-- Suite 76 · El informe del mes desde la ficha (migración 137, decisión 78,
-- PRD RN-REP-27 a RN-REP-30)
-- ============================================================
--
-- Lo que vigila:
--
--   · RN-REP-27 · generar dos veces el informe del mismo mes es UNO: la
--     clave de idempotencia de la biblioteca encuentra el mismo informe.
--   · RN-REP-29 · "Subir informe" (`publish_report`):
--       - solo quien tiene "Aprobar informes"; ni un administrador sin
--         ella, ni el trabajador, ni la cola sin sesión;
--       - sin aprobar, el servidor EXIGE la confirmación, y confirmar deja
--         la aprobación con el motivo "Subido sin revisar";
--       - sale por el canal de correo, y con él el push a quien tiene
--         teléfono registrado;
--       - subir dos veces es subirlo una;
--       - un consolidado no se sube, y uno sin cifras tampoco.
--   · RN-REP-30 · los textos editables (`set_report_entry_texts`):
--       - el restaurante no ve la fila (P7), el trabajador no la escribe;
--       - editar lo aprobado lo devuelve a revisión; lo enviado no se edita;
--       - guardar lo mismo dos veces no escribe dos apuntes (RN-DAT-09);
--       - vaciar un texto no borra la fila (CLAUDE.md), la deja en nulo.
--   · CLAUDE.md · la tabla nueva lleva RLS y sus dos disparadores de solo
--     lectura, y las dos funciones están cerradas a `anon`.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_informe_del_mes_desde_la_ficha.sql
--
-- Prefijo de esta suite: e7600000-.

insert into auth.users (id, email, role, aud) values
  ('e7600000-0000-0000-0000-000000000001', 'mes-duena@example.com', 'authenticated', 'authenticated'),
  ('e7600000-0000-0000-0000-000000000002', 'mes-aprueba@example.com', 'authenticated', 'authenticated'),
  ('e7600000-0000-0000-0000-000000000003', 'mes-admin@example.com', 'authenticated', 'authenticated'),
  ('e7600000-0000-0000-0000-000000000004', 'mes-trabaja@example.com', 'authenticated', 'authenticated'),
  ('e7600000-0000-0000-0000-000000000005', 'mes-local@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('e7610000-0000-0000-0000-000000000001', 'Espacio del Mes', 'espacio-del-mes-test', 'Europe/Madrid',
   'e7600000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status, can_approve_reports) values
  ('e7610000-0000-0000-0000-000000000001', 'e7600000-0000-0000-0000-000000000001', 'owner', 'active', false),
  -- El administrador CON "Aprobar informes" y otro SIN ella: los dos ven el
  -- botón "Revisar", solo uno sube.
  ('e7610000-0000-0000-0000-000000000001', 'e7600000-0000-0000-0000-000000000002', 'admin', 'active', true),
  ('e7610000-0000-0000-0000-000000000001', 'e7600000-0000-0000-0000-000000000003', 'admin', 'active', false),
  ('e7610000-0000-0000-0000-000000000001', 'e7600000-0000-0000-0000-000000000004', 'worker', 'active', false);

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours, grants_priority, report_level) values
  ('e7620000-0000-0000-0000-000000000001', 'e7610000-0000-0000-0000-000000000001', 'Impulso', 29900, 5, 2, 0, 0, 48, false, 'standard');

insert into public.groups (id, space_id, name) values
  ('e7630000-0000-0000-0000-000000000001', 'e7610000-0000-0000-0000-000000000001', 'Grupo del Mes');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('e7640000-0000-0000-0000-000000000001', 'e7610000-0000-0000-0000-000000000001',
   'e7630000-0000-0000-0000-000000000001', 'MES-0001', 'Casa del Mes', 'active');

insert into public.subscriptions (space_id, establishment_id, kind, plan_id, status) values
  ('e7610000-0000-0000-0000-000000000001', 'e7640000-0000-0000-0000-000000000001', 'plan',
   'e7620000-0000-0000-0000-000000000001', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('e7650000-0000-0000-0000-000000000001', 'e7640000-0000-0000-0000-000000000001',
   'e7600000-0000-0000-0000-000000000005', 'local_owner');

-- RN-MOV-04 · el propietario del restaurante tiene la app con el push
-- permitido: si el envío saliera por el canal 'none', no le llegaría.
insert into public.push_devices (user_id, expo_push_token, platform) values
  ('e7600000-0000-0000-0000-000000000005', 'ExponentPushToken[suite-76-mes]', 'ios');

create temp table mes_ids (k text primary key, v uuid);
grant select, insert, update on mes_ids to authenticated, service_role;

-- ============================================================
-- RN-REP-27 · generar dos veces el mismo mes es un informe
-- ============================================================
select set_config('request.jwt.claim.sub', 'e7600000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  v_id uuid;
  v_otra uuid;
begin
  v_id := public.create_report_draft(
    'e7610000-0000-0000-0000-000000000001', 'operation', 'Informe de agosto de 2026',
    '2026-08-01', '2026-08-31', 'e7640000-0000-0000-0000-000000000001', null, '{}'::jsonb,
    'operation:e7640000-0000-0000-0000-000000000001:2026-08-01:2026-08-31');
  v_otra := public.create_report_draft(
    'e7610000-0000-0000-0000-000000000001', 'operation', 'Informe de agosto de 2026',
    '2026-08-01', '2026-08-31', 'e7640000-0000-0000-0000-000000000001', null, '{}'::jsonb,
    'operation:e7640000-0000-0000-0000-000000000001:2026-08-01:2026-08-31');
  if v_id <> v_otra then
    raise exception 'RN-REP-27 FALLIDO: pulsar "Generar informe" dos veces crea dos informes del mismo mes'
      using errcode = 'assert_failure';
  end if;
  insert into mes_ids values ('agosto', v_id);

  -- Una versión, como la que escribe la generación.
  perform public.generate_report_version(v_id,
    '{"figures": [], "period": {"start": "2026-08-01", "end": "2026-08-31"}}'::jsonb);

  -- Un segundo informe, sin cifras, para comprobar que no se sube.
  insert into mes_ids values ('vacio', public.create_report_draft(
    'e7610000-0000-0000-0000-000000000001', 'operation', 'Informe vacío',
    '2026-07-01', '2026-07-31', 'e7640000-0000-0000-0000-000000000001', null, '{}'::jsonb,
    'operation:e7640000-0000-0000-0000-000000000001:2026-07-01:2026-07-31'));
end $$;
reset role;

-- ============================================================
-- RN-REP-30 · los textos editables del relato del mes
-- ============================================================

-- El trabajador no entra en los informes de un restaurante (RN-REP-08).
select set_config('request.jwt.claim.sub', 'e7600000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  begin
    perform public.set_report_entry_texts((select v from mes_ids where k = 'agosto'),
      '[{"key": "change:SOL-1", "title": "Otro título"}]'::jsonb);
    raise exception 'RN-REP-30 FALLIDO: el trabajador reescribe el informe de un restaurante'
      using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;
end $$;
reset role;

-- El administrador sin "Aprobar informes" sí prepara: editar es preparar.
select set_config('request.jwt.claim.sub', 'e7600000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from mes_ids where k = 'agosto');
  v_apuntes integer;
begin
  perform public.set_report_entry_texts(v_id, '[
    {"key": "change:SOL-1", "title": "Nueva carta de verano", "body": "Cambiamos los precios del menú."},
    {"key": "entry:menu_published:2026-08-04T10:00:00Z:2026-08-04", "body": "Menú del día del 4 de agosto"}
  ]'::jsonb);

  if (select count(*) from public.report_entry_texts where report_id = v_id) <> 2 then
    raise exception 'RN-REP-30 FALLIDO: los textos editados no se guardan' using errcode = 'assert_failure';
  end if;

  -- RN-DAT-09 · guardar lo mismo otra vez no escribe un segundo apunte.
  select count(*) into v_apuntes from public.audit_log
  where entity_id = v_id and action = 'report.entry_texts_changed';
  perform public.set_report_entry_texts(v_id,
    '[{"key": "change:SOL-1", "title": "Nueva carta de verano", "body": "Cambiamos los precios del menú."}]'::jsonb);
  if (select count(*) from public.audit_log where entity_id = v_id and action = 'report.entry_texts_changed') <> v_apuntes then
    raise exception 'RN-DAT-09 FALLIDO: guardar el mismo texto dos veces escribe dos apuntes' using errcode = 'assert_failure';
  end if;

  -- Una clave que no es de ninguna cosa del relato no entra.
  begin
    perform public.set_report_entry_texts(v_id, '[{"key": "otra-cosa", "title": "x"}]'::jsonb);
    raise exception 'RN-REP-30 FALLIDO: se guarda un texto para algo que no es del relato' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;
end $$;
reset role;

-- P7 · el restaurante no alcanza la fila: es preparación del equipo.
select set_config('request.jwt.claim.sub', 'e7600000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.report_entry_texts) then
    raise exception 'RN-REP-30 FALLIDO: el restaurante lee los textos que el equipo está preparando'
      using errcode = 'assert_failure';
  end if;
  begin
    perform public.set_report_entry_texts((select v from mes_ids where k = 'agosto'),
      '[{"key": "change:SOL-1", "title": "Lo escribo yo"}]'::jsonb);
    raise exception 'RN-REP-30 FALLIDO: el restaurante reescribe su propio informe' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;
end $$;
reset role;

-- ============================================================
-- RN-REP-29 · quién sube
-- ============================================================
do $$
declare
  v_persona text;
begin
  -- El administrador SIN "Aprobar informes", el trabajador y el propio
  -- restaurante: ninguno sube, ni con la confirmación.
  foreach v_persona in array array[
    'e7600000-0000-0000-0000-000000000003',
    'e7600000-0000-0000-0000-000000000004',
    'e7600000-0000-0000-0000-000000000005'] loop
    perform set_config('request.jwt.claim.sub', v_persona, false);
    set local role authenticated;
    begin
      perform public.publish_report((select v from mes_ids where k = 'agosto'), true);
      raise exception 'RN-REP-29 FALLIDO: % sube un informe sin "Aprobar informes"', v_persona
        using errcode = 'assert_failure';
    exception when assert_failure then raise;
    when others then null;
    end;
    reset role;
  end loop;
end $$;

-- La cola no pasa por este botón: sin sesión no hay persona que confirme.
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
do $$
begin
  begin
    perform public.publish_report((select v from mes_ids where k = 'agosto'), true);
    raise exception 'RN-REP-29 FALLIDO: se sube un informe sin una persona detrás' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;
end $$;
reset role;

-- ============================================================
-- RN-REP-29 · subir sin revisar exige confirmar, y confirmar aprueba
-- ============================================================
select set_config('request.jwt.claim.sub', 'e7600000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from mes_ids where k = 'agosto');
begin
  -- Sin la confirmación, el servidor se niega aunque se le llame a mano.
  begin
    perform public.publish_report(v_id, false);
    raise exception 'RN-REP-29 FALLIDO: se sube sin revisar y sin confirmar' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;
  if (select status from public.reports where id = v_id) <> 'preparing' then
    raise exception 'RN-REP-29 FALLIDO: la negativa deja el informe cambiado' using errcode = 'assert_failure';
  end if;

  -- Un informe sin cifras no se sube: aprobaría un papel en blanco.
  begin
    perform public.publish_report((select v from mes_ids where k = 'vacio'), true);
    raise exception 'RN-REP-29 FALLIDO: se sube un informe sin cifras generadas' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;
  if (select status from public.reports where id = (select v from mes_ids where k = 'vacio')) <> 'preparing' then
    raise exception 'RN-REP-29 FALLIDO: un intento fallido deja el informe aprobado a medias' using errcode = 'assert_failure';
  end if;
end $$;

do $$
declare
  v_id uuid := (select v from mes_ids where k = 'agosto');
  v_enviados integer;
begin
  v_enviados := public.publish_report(v_id, true);
  if v_enviados < 1 then
    raise exception 'RN-REP-29 FALLIDO: confirmar no sube el informe (devolvió %)', v_enviados using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
declare
  v_id uuid := (select v from mes_ids where k = 'agosto');
begin
  if (select status from public.reports where id = v_id) <> 'sent' then
    raise exception 'RN-REP-29 FALLIDO: el informe no queda enviado' using errcode = 'assert_failure';
  end if;

  -- Confirmar ES la aprobación, con su motivo, en el libro de estados y en
  -- la auditoría (RN-REP-14).
  if not exists (
    select 1 from public.state_events
    where entity_id = v_id and to_state = 'approved' and reason = 'Subido sin revisar'
  ) then
    raise exception 'RN-REP-29 FALLIDO: la aprobación por confirmación no deja su evento con motivo' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.audit_log
    where entity_id = v_id and action = 'report.status_changed' and reason = 'Subido sin revisar'
      and actor_id = 'e7600000-0000-0000-0000-000000000002'
  ) then
    raise exception 'RN-REP-29 FALLIDO: la auditoría no dice quién lo subió sin revisar' using errcode = 'assert_failure';
  end if;

  -- RN-REP-11 y RN-MOV-04 · el aviso al restaurante, con push.
  if (select delivery_channel from public.reports where id = v_id) <> 'email' then
    raise exception 'RN-REP-29 FALLIDO: el informe subido no sale por el canal que lleva el push' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.notifications n
    join public.notification_deliveries d on d.notification_id = n.id
    where n.entity_id = v_id and n.event_type = 'report_sent'
      and n.recipient_id = 'e7600000-0000-0000-0000-000000000005'
      and d.channel = 'push'
  ) then
    raise exception 'RN-REP-29 FALLIDO: al restaurante no le llega el push del informe subido' using errcode = 'assert_failure';
  end if;
end $$;

-- CA-17 · subir dos veces es subirlo una; y lo subido no se edita (P4).
select set_config('request.jwt.claim.sub', 'e7600000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from mes_ids where k = 'agosto');
  v_antes integer;
begin
  select count(*) into v_antes from public.report_deliveries where report_id = v_id;
  if public.publish_report(v_id, true) <> 0 then
    raise exception 'RN-REP-29 FALLIDO: subir dos veces vuelve a enviar' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.report_deliveries where report_id = v_id) <> v_antes then
    raise exception 'RN-REP-29 FALLIDO: el segundo pulso escribe entregas nuevas' using errcode = 'assert_failure';
  end if;

  begin
    perform public.set_report_entry_texts(v_id, '[{"key": "change:SOL-1", "title": "Tarde"}]'::jsonb);
    raise exception 'RN-REP-30 FALLIDO: se edita un informe ya subido' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;
end $$;
reset role;

-- ============================================================
-- RN-REP-29 · lo aprobado sube sin preguntar; RN-REP-30 · editarlo lo
-- devuelve a revisión; un consolidado no se sube
-- ============================================================
select set_config('request.jwt.claim.sub', 'e7600000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid;
  v_consolidado uuid;
begin
  v_id := public.create_report_draft(
    'e7610000-0000-0000-0000-000000000001', 'operation', 'Informe de junio de 2026',
    '2026-06-01', '2026-06-30', 'e7640000-0000-0000-0000-000000000001', null, '{}'::jsonb,
    'operation:e7640000-0000-0000-0000-000000000001:2026-06-01:2026-06-30');
  perform public.generate_report_version(v_id,
    '{"figures": [], "period": {"start": "2026-06-01", "end": "2026-06-30"}}'::jsonb);
  perform public.set_report_status(v_id, 'approved', null);

  -- RN-REP-09 · editar lo aprobado lo devuelve a revisión.
  perform public.set_report_entry_texts(v_id, '[{"key": "change:SOL-9", "title": "Otro"}]'::jsonb);
  if (select status from public.reports where id = v_id) <> 'pending_review' then
    raise exception 'RN-REP-30 FALLIDO: editar los textos de un informe aprobado no lo devuelve a revisión'
      using errcode = 'assert_failure';
  end if;

  -- CLAUDE.md · vaciar un texto no borra la fila: la deja en el original.
  perform public.set_report_entry_texts(v_id, '[{"key": "change:SOL-9", "title": "", "body": null}]'::jsonb);
  if not exists (
    select 1 from public.report_entry_texts
    where report_id = v_id and entry_key = 'change:SOL-9' and title is null and body is null
  ) then
    raise exception 'RN-REP-30 FALLIDO: vaciar un texto borra la fila en vez de volver al original'
      using errcode = 'assert_failure';
  end if;

  -- Aprobado de nuevo, sube sin confirmación.
  perform public.set_report_status(v_id, 'approved', null);
  if public.publish_report(v_id, false) < 1 then
    raise exception 'RN-REP-29 FALLIDO: un informe aprobado pide confirmación para subirse' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.state_events where entity_id = v_id and reason = 'Subido sin revisar') then
    raise exception 'RN-REP-29 FALLIDO: un informe revisado queda como subido sin revisar' using errcode = 'assert_failure';
  end if;

  -- Decisión 30 · un consolidado no es de ningún restaurante.
  v_consolidado := public.create_report_draft(
    'e7610000-0000-0000-0000-000000000001', 'operation', 'Consolidado de junio',
    '2026-06-01', '2026-06-30', null, null, '{}'::jsonb, 'operation::2026-06-01:2026-06-30');
  perform public.generate_report_version(v_consolidado,
    '{"figures": [], "period": {"start": "2026-06-01", "end": "2026-06-30"}}'::jsonb);
  begin
    perform public.publish_report(v_consolidado, true);
    raise exception 'RN-REP-29 FALLIDO: se sube un consolidado a un restaurante' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;
end $$;
reset role;

-- ============================================================
-- CLAUDE.md · RLS, disparadores y privilegios
-- ============================================================
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.report_entry_texts'::regclass) then
    raise exception 'CLAUDE.md FALLIDO: report_entry_texts sin RLS' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.report_entry_texts'::regclass and polcmd <> 'r') then
    raise exception 'RN-REP-30 FALLIDO: report_entry_texts tiene una política de escritura: se escribe solo por función'
      using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'report_entry_texts_guard_support_read_only')
     or not exists (select 1 from pg_trigger where tgname = 'report_entry_texts_cuotly_read_only') then
    raise exception 'RN-ADM-07/RN-SUB-08 FALLIDO: report_entry_texts sin sus disparadores de solo lectura'
      using errcode = 'assert_failure';
  end if;
  if has_function_privilege('anon', 'public.publish_report(uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.set_report_entry_texts(uuid, jsonb)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: las funciones del informe del mes están abiertas a anon'
      using errcode = 'assert_failure';
  end if;
end $$;

\echo 'Suite 76 · El informe del mes desde la ficha: OK'
