-- Fase 3 · Hito 16 · informes (migración 85; PRD §29, RN-REP-01 a 14;
-- §89 a §95 de la maestra; P7; §21.2).
--
--   · RN-REP-01: quién ve los informes de un restaurante — §89 — y quién
--     no: el trabajador no entra, y Consulta solo con permiso.
--   · RN-REP-02: §90 · el informe personal es de cada uno; propietario y
--     administradores ven el de cualquiera.
--   · RN-REP-08: los seis estados de §95 y quién mueve cada uno. Un
--     administrador SIN "Aprobar informes" no aprueba.
--   · RN-REP-09: editar un informe aprobado lo devuelve a revisión; lo
--     enviado no se edita.
--   · RN-REP-10: un informe solo objetivo se programa sin aprobar; uno con
--     una sección de criterio, no. Y con oportunidades pendientes NO SALE:
--     el envío se detiene y vuelve a revisión.
--   · RN-REP-12: cada versión se conserva — regenerar añade, no pisa — y
--     aprobar sin cifras no se puede.
--   · RN-REP-13: el restaurante ve el informe ENVIADO y nada más, no ve
--     las secciones en edición ni los envíos, y las columnas con identidad
--     del equipo están revocadas (P7).
--   · RN-REP-14: auditoría de la familia `report`.
--   · Las internas están cerradas por RPC.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/informes.sql

insert into auth.users (id, email, role, aud) values
  ('ff000000-0000-0000-0000-000000000001', 'rep-owner@example.com', 'authenticated', 'authenticated'),
  ('ff000000-0000-0000-0000-000000000002', 'rep-admin@example.com', 'authenticated', 'authenticated'),
  ('ff000000-0000-0000-0000-000000000003', 'rep-ana@example.com', 'authenticated', 'authenticated'),
  ('ff000000-0000-0000-0000-000000000004', 'rep-luis@example.com', 'authenticated', 'authenticated'),
  ('ff000000-0000-0000-0000-000000000005', 'rep-local@example.com', 'authenticated', 'authenticated'),
  ('ff000000-0000-0000-0000-000000000006', 'rep-consulta@example.com', 'authenticated', 'authenticated'),
  ('ff000000-0000-0000-0000-000000000007', 'rep-editor@example.com', 'authenticated', 'authenticated'),
  ('ff000000-0000-0000-0000-000000000008', 'rep-global@example.com', 'authenticated', 'authenticated'),
  ('ff000000-0000-0000-0000-000000000009', 'rep-otro@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('ff100000-0000-0000-0000-000000000001', 'Espacio Informes', 'espacio-informes-test', 'Europe/Madrid',
   'ff000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status, can_approve_reports) values
  ('ff100000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000001', 'owner', 'active', false),
  -- El administrador CON "Aprobar informes" (§95.4) y otro SIN ella, para
  -- que "administradores con Aprobar informes" no sea una frase decorativa.
  ('ff100000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000002', 'admin', 'active', true),
  ('ff100000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000004', 'admin', 'active', false),
  ('ff100000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000003', 'worker', 'active', false);

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours, grants_priority) values
  ('ff200000-0000-0000-0000-000000000001', 'ff100000-0000-0000-0000-000000000001', 'Impulso', 39900, 16, 12, 3, 0, 24, false);

insert into public.groups (id, space_id, name) values
  ('ff300000-0000-0000-0000-000000000001', 'ff100000-0000-0000-0000-000000000001', 'Grupo R');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('ff400000-0000-0000-0000-000000000001', 'ff100000-0000-0000-0000-000000000001',
   'ff300000-0000-0000-0000-000000000001', 'REP-0001', 'Casa Informes', 'active');

insert into public.subscriptions (space_id, establishment_id, kind, plan_id, status) values
  ('ff100000-0000-0000-0000-000000000001', 'ff400000-0000-0000-0000-000000000001', 'plan',
   'ff200000-0000-0000-0000-000000000001', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('ff500000-0000-0000-0000-000000000001', 'ff400000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000005', 'local_owner'),
  ('ff500000-0000-0000-0000-000000000002', 'ff400000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000006', 'consulta'),
  ('ff500000-0000-0000-0000-000000000003', 'ff400000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000007', 'editor');

insert into public.group_memberships (group_id, user_id, role) values
  ('ff300000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000008', 'global_owner');

-- Ana está autorizada en el restaurante: aun así, §89 no le da sus informes.
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('ff100000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000003',
   'ff400000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000001');

create temp table rep_ids (k text primary key, v uuid);
grant select, insert, update on rep_ids to authenticated, service_role;

-- ============================================================
-- El catálogo, compartido con src/core/reports.ts
-- ============================================================
do $$
begin
  -- §95.3 · las tres que requieren criterio, y ninguna más.
  if not public.report_section_requires_judgement('executive_summary')
     or not public.report_section_requires_judgement('digital_opportunities')
     or not public.report_section_requires_judgement('recommendations') then
    raise exception 'RN-REP-09 FALLIDO: una sección que requiere criterio no lo dice' using errcode = 'assert_failure';
  end if;
  if public.report_section_requires_judgement('operation_requests')
     or public.report_section_requires_judgement('finance_income') then
    raise exception 'RN-REP-09 FALLIDO: una sección de cifras pide criterio' using errcode = 'assert_failure';
  end if;

  -- §89 · las tres familias, y ninguna más.
  if public.report_default_sections('operation') is null
     or public.report_default_sections('finance') is null
     or public.report_default_sections('digital') is null then
    raise exception 'RN-REP-01 FALLIDO: falta una de las tres familias de §89' using errcode = 'assert_failure';
  end if;
  if public.report_default_sections('marketing') is not null then
    raise exception 'RN-REP-01 FALLIDO: hay una familia de informe que §89 no da' using errcode = 'assert_failure';
  end if;

  -- RN-REP-08 · quién mueve cada transición.
  if not public.report_transition_allowed('preparing', 'pending_review', 'editor') then
    raise exception 'RN-REP-08 FALLIDO: quien prepara no puede mandar a revisión' using errcode = 'assert_failure';
  end if;
  if public.report_transition_allowed('pending_review', 'approved', 'editor') then
    raise exception 'RN-REP-08 FALLIDO: aprueba alguien sin "Aprobar informes"' using errcode = 'assert_failure';
  end if;
  if public.report_transition_allowed('sent', 'approved', 'approver')
     or public.report_transition_allowed('sent', 'pending_review', 'approver')
     or public.report_transition_allowed('archived', 'preparing', 'approver') then
    raise exception 'RN-REP-12 FALLIDO: un informe enviado o archivado vuelve atrás' using errcode = 'assert_failure';
  end if;

  -- RN-REP-13 · qué estados alcanza el restaurante.
  if public.report_is_visible_to_client('preparing')
     or public.report_is_visible_to_client('pending_review')
     or public.report_is_visible_to_client('approved')
     or public.report_is_visible_to_client('scheduled') then
    raise exception 'RN-REP-13 FALLIDO: el restaurante alcanza un informe que no se le ha enviado' using errcode = 'assert_failure';
  end if;
  if not public.report_is_visible_to_client('sent') then
    raise exception 'RN-REP-13 FALLIDO: el restaurante no ve un informe enviado' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-REP-01 · quién puede ver informes por el lado cliente (§89)
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
begin
  -- §89 · "Consulta necesita permiso de su propietario": sin él, no.
  if public.client_can_view_reports('ff400000-0000-0000-0000-000000000001') then
    raise exception 'RN-REP-01 FALLIDO: Consulta ve informes sin el permiso de §89' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000007', false);
set role authenticated;
do $$
begin
  -- §89 · "Editor ve informes siempre".
  if not public.client_can_view_reports('ff400000-0000-0000-0000-000000000001') then
    raise exception 'RN-REP-01 FALLIDO: el Editor no ve informes, y §89 dice que siempre' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000008', false);
set role authenticated;
do $$
begin
  -- §14.1 · el propietario global ve el consolidado y el detalle.
  if not public.client_can_view_reports('ff400000-0000-0000-0000-000000000001') then
    raise exception 'RN-REP-01 FALLIDO: el propietario global no ve los informes de su grupo' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El permiso lo concede el propietario del restaurante, y solo a Consulta.
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  begin
    perform public.set_client_report_permission(
      'ff400000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000007', true);
    raise exception 'RN-REP-01 FALLIDO: se le concede a un Editor un permiso que ya tiene por serlo' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-REP-01 FALLIDO%' then raise; end if;
  end;

  perform public.set_client_report_permission(
    'ff400000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000006', true);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
begin
  if not public.client_can_view_reports('ff400000-0000-0000-0000-000000000001') then
    raise exception 'RN-REP-01 FALLIDO: Consulta con permiso sigue sin ver informes' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-REP-08 · preparar: solo quien gestiona la cartera
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.create_report_draft(
      'ff100000-0000-0000-0000-000000000001', 'operation', 'Informe de Ana',
      '2026-08-01', '2026-08-31', 'ff400000-0000-0000-0000-000000000001');
    raise exception 'RN-REP-08 FALLIDO: un trabajador prepara informes de un restaurante' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-REP-08 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid;
  v_otra uuid;
begin
  v_id := public.create_report_draft(
    'ff100000-0000-0000-0000-000000000001', 'operation', 'Informe mensual',
    '2026-08-01', '2026-08-31', 'ff400000-0000-0000-0000-000000000001',
    null, '{}'::jsonb, 'clave-1');
  insert into rep_ids values ('operacion', v_id);

  -- CA-17 · pulsarlo dos veces devuelve el mismo borrador.
  v_otra := public.create_report_draft(
    'ff100000-0000-0000-0000-000000000001', 'operation', 'Informe mensual',
    '2026-08-01', '2026-08-31', 'ff400000-0000-0000-0000-000000000001',
    null, '{}'::jsonb, 'clave-1');
  if v_otra <> v_id then
    raise exception 'CA-17 FALLIDO: preparar el mismo informe dos veces crea dos' using errcode = 'assert_failure';
  end if;

  if (select status from public.reports where id = v_id) <> 'preparing' then
    raise exception 'RN-REP-08 FALLIDO: un informe recién preparado no nace "Preparando"' using errcode = 'assert_failure';
  end if;

  -- §95.2 · el borrador nace con sus secciones, y las de criterio apagadas.
  if (select count(*) from public.report_sections where report_id = v_id) <> 10 then
    raise exception 'RN-REP-09 FALLIDO: el borrador no trae las secciones de su familia' using errcode = 'assert_failure';
  end if;
  if (select included from public.report_sections where report_id = v_id and section_key = 'executive_summary') then
    raise exception 'RN-REP-09 FALLIDO: una sección que requiere criterio entra encendida y sin texto' using errcode = 'assert_failure';
  end if;
  if not (select included from public.report_sections where report_id = v_id and section_key = 'operation_requests') then
    raise exception 'RN-REP-09 FALLIDO: una sección de cifras entra apagada' using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.audit_log where entity_id = v_id and action = 'report.created') <> 1 then
    raise exception 'RN-REP-14 FALLIDO: preparar un informe no dejó apunte de auditoría' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.state_events where entity_type = 'report' and entity_id = v_id) <> 1 then
    raise exception 'RN-REP-14 FALLIDO: preparar un informe no dejó evento de estado' using errcode = 'assert_failure';
  end if;

  -- §89 · una familia que no existe no se prepara.
  begin
    perform public.create_report_draft(
      'ff100000-0000-0000-0000-000000000001', 'marketing', 'Inventado',
      '2026-08-01', '2026-08-31', 'ff400000-0000-0000-0000-000000000001');
    raise exception 'RN-REP-01 FALLIDO: se prepara un informe de una familia que §89 no da' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-REP-01 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-REP-12 · sin cifras no se aprueba, y regenerar AÑADE
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from rep_ids where k = 'operacion');
begin
  begin
    perform public.set_report_status(v_id, 'approved');
    raise exception 'RN-REP-12 FALLIDO: se aprueba un informe sin cifras generadas' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-REP-12 FALLIDO%' then raise; end if;
  end;

  perform public.generate_report_version(v_id, '{"figures": [], "period": {"start": "2026-08-01", "end": "2026-08-31"}}'::jsonb);
  perform public.generate_report_version(v_id, '{"figures": [], "period": {"start": "2026-08-01", "end": "2026-08-31"}}'::jsonb);

  if (select count(*) from public.report_versions where report_id = v_id) <> 2 then
    raise exception 'RN-REP-12 FALLIDO: regenerar pisó la versión anterior en vez de añadir' using errcode = 'assert_failure';
  end if;
  if (select max(version_number) from public.report_versions where report_id = v_id) <> 2 then
    raise exception 'RN-REP-12 FALLIDO: la versión nueva no se numera detrás de la anterior' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-REP-08 · un administrador SIN "Aprobar informes" no aprueba
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from rep_ids where k = 'operacion');
begin
  begin
    perform public.set_report_status(v_id, 'approved');
    raise exception 'RN-REP-08 FALLIDO: un administrador sin "Aprobar informes" aprueba' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-REP-08 FALLIDO%' then raise; end if;
  end;

  -- Lo que sí puede: editar y mandar a revisión (§95.1-3).
  perform public.set_report_status(v_id, 'pending_review');
  if (select status from public.reports where id = v_id) <> 'pending_review' then
    raise exception 'RN-REP-08 FALLIDO: quien gestiona la cartera no puede mandar un informe a revisión' using errcode = 'assert_failure';
  end if;

  -- RN-DAT-09 · mover al mismo estado dos veces no escribe dos apuntes.
  perform public.set_report_status(v_id, 'pending_review');
  if (select count(*) from public.state_events
      where entity_type = 'report' and entity_id = v_id and to_state = 'pending_review') <> 1 then
    raise exception 'RN-DAT-09 FALLIDO: mover al mismo estado dos veces escribió dos apuntes' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-REP-10 · lo objetivo se programa solo; lo que pide criterio, no
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid;
begin
  v_id := public.create_report_draft(
    'ff100000-0000-0000-0000-000000000001', 'digital', 'Rendimiento digital',
    '2026-08-01', '2026-08-31', 'ff400000-0000-0000-0000-000000000001');
  insert into rep_ids values ('digital', v_id);
  perform public.generate_report_version(v_id, '{"figures": []}'::jsonb);

  -- Nace objetivo (las de criterio entran apagadas): se puede programar
  -- sin pasar por aprobación. Se programa con `schedule_report()`, que es
  -- la única puerta: un informe "Programado" sin fecha no existe, y la
  -- restricción de la tabla lo impide.
  perform public.schedule_report(v_id, now() + interval '2 days', 'email', false);
  if (select status from public.reports where id = v_id) <> 'scheduled' then
    raise exception 'RN-REP-10 FALLIDO: un informe solo objetivo no se puede programar sin aprobación' using errcode = 'assert_failure';
  end if;

  -- Y con una sección de criterio encendida, ya no.
  perform public.set_report_sections(v_id, '[{"key": "digital_opportunities", "included": true}]'::jsonb);
  if (select status from public.reports where id = v_id) <> 'pending_review' then
    raise exception 'RN-REP-09 FALLIDO: editar las secciones de un informe programado no lo devolvió a revisión' using errcode = 'assert_failure';
  end if;

  perform public.set_report_status(v_id, 'preparing');
  begin
    perform public.schedule_report(v_id, now() + interval '2 days', 'email', false);
    raise exception 'RN-REP-10 FALLIDO: se programa sin aprobar un informe con una sección que requiere criterio' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-REP-10 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-REP-10 · con oportunidades pendientes el informe NO SALE (§95)
-- ============================================================
set role service_role;
do $$
declare
  v_op uuid;
begin
  v_op := public.upsert_detected_opportunity(
    'ff400000-0000-0000-0000-000000000001', 'traffic_drop', '', 'medium', 40,
    '2026-08-01', '2026-08-31',
    '[{"provider":"ga4","metric":"sessions","dimension":"","value":700,"previous":1200,"unit":"count"}]'::jsonb
  );
  insert into rep_ids values ('oportunidad', v_op);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from rep_ids where k = 'digital');
  v_resultado integer;
begin
  if public.report_pending_opportunities(v_id) <> 1 then
    raise exception 'RN-REP-10 FALLIDO: no se ve la oportunidad pendiente del periodo del informe' using errcode = 'assert_failure';
  end if;

  perform public.set_report_status(v_id, 'pending_review');
  perform public.set_report_status(v_id, 'approved');
  v_resultado := public.send_report(v_id);

  if v_resultado <> -1 then
    raise exception 'RN-REP-10 FALLIDO: el informe salió con una oportunidad pendiente de aprobar' using errcode = 'assert_failure';
  end if;
  if (select status from public.reports where id = v_id) <> 'pending_review' then
    raise exception 'RN-REP-10 FALLIDO: el envío detenido no devolvió el informe a revisión' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where entity_id = v_id and action = 'report.send_blocked') <> 1 then
    raise exception 'RN-REP-14 FALLIDO: el envío detenido no dejó apunte de auditoría' using errcode = 'assert_failure';
  end if;

  -- Aprobada la oportunidad, el freno se levanta.
  perform public.set_opportunity_status((select v from rep_ids where k = 'oportunidad'), 'approved_for_report');
  if public.report_pending_opportunities(v_id) <> 0 then
    raise exception 'RN-REP-10 FALLIDO: una oportunidad aprobada sigue contando como pendiente' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El mismo freno, por el camino que de verdad importa: el de la cola, que
-- envía con `service_role` y sin nadie mirando. Se comprueba aparte porque
-- la comprobación de permisos de `report_pending_opportunities()` podría
-- dejar fuera al proceso —y entonces el freno de §95 no saltaría nunca en
-- el envío automático, que es justo donde hace falta.
-- Sin claim de sesión: así es como llega la cola, y es la diferencia que
-- importa — con el claim puesto, `auth.uid()` sigue devolviendo al último
-- que se sentó y la comprobación de permisos contesta que sí aunque el rol
-- sea `service_role`. Con él vacío se reproduce el proceso de verdad.
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
do $$
declare
  v_id uuid := (select v from rep_ids where k = 'digital');
  v_op uuid := (select v from rep_ids where k = 'oportunidad');
begin
  if auth.uid() is not null then
    raise exception 'El fixture no reproduce la cola: hay sesión puesta' using errcode = 'assert_failure';
  end if;
  -- Se vuelve a dejar pendiente la oportunidad y el informe, listo y con
  -- su sección de oportunidades encendida.
  update public.opportunities set status = 'under_review' where id = v_op;
  perform public.set_report_status(v_id, 'approved');

  if public.report_pending_opportunities(v_id) <> 1 then
    raise exception 'RN-REP-10 FALLIDO: la cola no ve la oportunidad pendiente y enviaría el informe'
      using errcode = 'assert_failure';
  end if;
  if public.send_report(v_id) <> -1 then
    raise exception 'RN-REP-10 FALLIDO: el envío automático salió con una oportunidad pendiente'
      using errcode = 'assert_failure';
  end if;

  -- Y se deja aprobada otra vez para lo que viene después.
  update public.opportunities set status = 'approved_for_report' where id = v_op;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000002', false);

-- ============================================================
-- RN-REP-12 · el envío: a quién, con qué versión, y una sola vez
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from rep_ids where k = 'operacion');
  v_enviados integer;
begin
  perform public.set_report_status(v_id, 'approved');
  perform public.schedule_report(v_id, now() + interval '2 hours', 'email', true);

  if (select status from public.reports where id = v_id) <> 'scheduled'
     or (select scheduled_for from public.reports where id = v_id) is null then
    raise exception 'RN-REP-08 FALLIDO: programar no dejó el informe programado con su fecha' using errcode = 'assert_failure';
  end if;

  v_enviados := public.send_report(v_id);

  -- §93 · el correo va a quien puede ver informes de ese restaurante:
  -- propietario local, Editor, Consulta CON permiso y propietario global.
  if v_enviados <> 4 then
    raise exception 'RN-REP-11 FALLIDO: el informe no llegó a quien §89 dice que puede verlo (llegó a %)', v_enviados
      using errcode = 'assert_failure';
  end if;
  if (select status from public.reports where id = v_id) <> 'sent' then
    raise exception 'RN-REP-08 FALLIDO: enviar no dejó el informe en "Enviado"' using errcode = 'assert_failure';
  end if;
  -- CA-17 · enviar dos veces produce un solo efecto.
  if public.send_report(v_id) <> 0 then
    raise exception 'CA-17 FALLIDO: enviar dos veces el mismo informe vuelve a enviarlo' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.report_deliveries where report_id = v_id) <> 4 then
    raise exception 'CA-17 FALLIDO: el segundo envío duplicó los apuntes de entrega' using errcode = 'assert_failure';
  end if;

  -- RN-REP-09 · lo enviado no se edita ni se regenera.
  begin
    perform public.set_report_sections(v_id, '[{"key": "operation_jobs", "included": false}]'::jsonb);
    raise exception 'RN-REP-09 FALLIDO: se editan las secciones de un informe ya enviado' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-REP-09 FALLIDO%' then raise; end if;
  end;
  begin
    perform public.generate_report_version(v_id, '{"figures": []}'::jsonb);
    raise exception 'RN-REP-12 FALLIDO: se regenera un informe ya enviado' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-REP-12 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

-- Los avisos del envío se cuentan con `service_role` y no con la sesión
-- del administrador: `notifications` solo deja ver a cada uno los suyos
-- (RN-NOT-01), y estos son de los usuarios del restaurante.
set role service_role;
do $$
declare
  v_id uuid := (select v from rep_ids where k = 'operacion');
begin
  if (select count(*) from public.notifications
      where entity_type = 'report' and entity_id = v_id and event_type = 'report_sent') <> 4 then
    raise exception 'RN-REP-11 FALLIDO: el envío no avisó a los cuatro destinatarios de §89' using errcode = 'assert_failure';
  end if;
  -- Y el aviso es del lado cliente: es el "correo programado" de §93.
  if exists (select 1 from public.notifications
             where entity_type = 'report' and entity_id = v_id and audience <> 'client') then
    raise exception 'RN-REP-11 FALLIDO: el aviso del envío no va dirigido al restaurante' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-REP-11 · el aviso de las 24 h, una sola vez por fecha (§95)
-- ============================================================
set role service_role;
do $$
declare
  v_id uuid := (select v from rep_ids where k = 'digital');
  v_avisados integer;
begin
  -- Se aprueba y se programa a menos de 24 h: es lo que la cola reclama.
  perform public.set_report_status(v_id, 'approved');
  perform public.schedule_report(v_id, now() + interval '6 hours', 'email', false);

  if not exists (select 1 from public.reports_due_for_reminder(10) where report_id = v_id) then
    raise exception 'RN-REP-11 FALLIDO: un informe a seis horas de salir no entra en el aviso de las 24 h' using errcode = 'assert_failure';
  end if;

  v_avisados := public.notify_report_schedule_due_soon(v_id);
  -- Va a quien puede pararlo: el propietario y el administrador CON
  -- "Aprobar informes". El administrador sin ella y la trabajadora, no.
  if v_avisados <> 2 then
    raise exception 'RN-REP-11 FALLIDO: el aviso de la fecha no fue a quien puede pararlo (fue a %)', v_avisados
      using errcode = 'assert_failure';
  end if;

  -- CA-17 · una sola vez por fecha.
  if public.notify_report_schedule_due_soon(v_id) <> 0 then
    raise exception 'CA-17 FALLIDO: el aviso de la fecha programada se repite' using errcode = 'assert_failure';
  end if;

  -- Y un informe cuya fecha ya pasó es de la otra lista.
  perform public.schedule_report(v_id, now() - interval '1 minute', 'email', false);
  if not exists (select 1 from public.reports_due_for_send(10) where report_id = v_id) then
    raise exception 'RN-REP-11 FALLIDO: un informe vencido no entra en la lista de envío' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-REP-13 · qué ve el restaurante, y qué no (P7)
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare
  v_enviado uuid := (select v from rep_ids where k = 'operacion');
  v_en_curso uuid := (select v from rep_ids where k = 'digital');
begin
  if not exists (select 1 from public.reports where id = v_enviado) then
    raise exception 'RN-REP-13 FALLIDO: el restaurante no ve el informe que se le envió' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.reports where id = v_en_curso) then
    raise exception 'RN-REP-13 FALLIDO: el restaurante ve un informe que todavía no se le ha enviado' using errcode = 'assert_failure';
  end if;

  -- Las secciones en edición son organización interna: fuera de la fila.
  if exists (select 1 from public.report_sections where report_id = v_enviado) then
    raise exception 'RN-REP-13 FALLIDO: el restaurante ve las secciones en edición de un informe' using errcode = 'assert_failure';
  end if;
  -- Y el libro de envíos, tampoco.
  if exists (select 1 from public.report_deliveries where report_id = v_enviado) then
    raise exception 'RN-REP-13 FALLIDO: el restaurante ve el libro de envíos del equipo' using errcode = 'assert_failure';
  end if;

  -- La versión enviada sí: es lo que se le mandó.
  if not exists (select 1 from public.report_versions where report_id = v_enviado) then
    raise exception 'RN-REP-13 FALLIDO: el restaurante no alcanza las cifras del informe que recibió' using errcode = 'assert_failure';
  end if;

  -- P7 · `select *` sobre reports devuelve 403, y las columnas con
  -- identidad del equipo no se leen (CLAUDE.md).
  begin
    perform (select count(*) from (select * from public.reports) z);
    raise exception 'P7 FALLIDO: select * sobre reports no está revocado' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate 'P0001' then
      if sqlerrm like 'P7 FALLIDO%' then raise; end if;
  end;

  begin
    perform (select approved_by from public.reports where id = v_enviado);
    raise exception 'P7 FALLIDO: el restaurante lee quién aprobó su informe' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate 'P0001' then
      if sqlerrm like 'P7 FALLIDO%' then raise; end if;
  end;

  begin
    perform (select generated_by from public.report_versions where report_id = v_enviado);
    raise exception 'P7 FALLIDO: el restaurante lee quién generó las cifras' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate 'P0001' then
      if sqlerrm like 'P7 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

-- El trabajador autorizado en el restaurante tampoco los ve: §89 no se los
-- da, y lo que §90 le da es su informe personal.
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.reports where space_id = 'ff100000-0000-0000-0000-000000000001') then
    raise exception 'RN-REP-01 FALLIDO: un trabajador ve los informes de un restaurante' using errcode = 'assert_failure';
  end if;

  -- §90 · el suyo sí.
  if public.worker_report_dataset('ff100000-0000-0000-0000-000000000001',
                                  'ff000000-0000-0000-0000-000000000003',
                                  '2026-08-01', '2026-08-31') is null then
    raise exception 'RN-REP-02 FALLIDO: el trabajador no puede pedir su propio informe personal' using errcode = 'assert_failure';
  end if;

  -- Y el de otro, no.
  begin
    perform public.worker_report_dataset('ff100000-0000-0000-0000-000000000001',
                                         'ff000000-0000-0000-0000-000000000004',
                                         '2026-08-01', '2026-08-31');
    raise exception 'RN-REP-02 FALLIDO: un trabajador pide el informe personal de otro' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-REP-02 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

-- Un extraño no alcanza nada, ni por tabla ni por RPC.
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000009', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.reports where space_id = 'ff100000-0000-0000-0000-000000000001') then
    raise exception 'RN-REP-13 FALLIDO: un extraño lee los informes de otro espacio' using errcode = 'assert_failure';
  end if;
  if public.report_pending_opportunities((select v from rep_ids where k = 'operacion')) <> 0 then
    raise exception 'P7 FALLIDO: un extraño averigua las oportunidades pendientes de un informe ajeno' using errcode = 'assert_failure';
  end if;
  if public.client_can_view_reports('ff400000-0000-0000-0000-000000000001') then
    raise exception 'RN-REP-01 FALLIDO: un extraño puede ver los informes de un restaurante ajeno' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-REP-14 · la auditoría de la familia `report` es de la cartera
-- ============================================================
do $$
begin
  if public.audit_action_capability('report.sent') <> 'manage_clients' then
    raise exception 'RN-REP-14 FALLIDO: la familia `report` no está clasificada como de la cartera' using errcode = 'assert_failure';
  end if;
  if not public.audit_entity_is_visible('report', (select v from rep_ids where k = 'operacion')) then
    raise exception 'RN-REP-14 FALLIDO: la auditoría no reconoce la entidad `report`' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Las internas están cerradas por RPC
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

  for v_fn in
    select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'report_operation_dataset', 'report_finance_dataset',
        'reports_due_for_send', 'reports_due_for_reminder',
        'notify_report_schedule_due_soon', 'report_recipients', 'report_actor_role'
      )
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    v_abiertas := v_abiertas || ' ' || v_fn;
  end loop;

  if v_abiertas <> '' then
    raise exception 'CLAUDE.md MUST FALLIDO: función interna de informes abierta por RPC:%', v_abiertas
      using errcode = 'assert_failure';
  end if;
end $$;

select 'informes.sql OK' as resultado;
