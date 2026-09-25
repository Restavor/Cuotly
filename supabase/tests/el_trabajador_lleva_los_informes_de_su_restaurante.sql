-- ============================================================
-- Suite 77 · El trabajador autorizado lleva los informes de su restaurante
-- (migración 138, decisión 79, PRD RN-REP-31)
-- ============================================================
--
-- Lo que vigila:
--
--   · Que el trabajador AUTORIZADO en un restaurante vea todos los informes
--     de ese restaurante —los de finanzas incluidos— con sus secciones,
--     versiones, entregas y textos, y los lleve de punta a punta: preparar,
--     generar, editar y subir.
--   · Que eso sea SOLO de ese restaurante: el trabajador autorizado en otro
--     no ve ni toca nada, ni el consolidado del espacio (decisión 30).
--   · Que dejar de estar autorizado, o dejar de estar activo en el espacio,
--     se lo quite en el acto (RN-EST-05).
--   · Que las funciones nuevas estén donde deben: las de las políticas,
--     abiertas a `authenticated` y cerradas a `anon`; las internas, a nadie
--     (CLAUDE.md).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_trabajador_lleva_los_informes_de_su_restaurante.sql
--
-- Prefijo de esta suite: e7700000-.

insert into auth.users (id, email, role, aud) values
  ('e7700000-0000-0000-0000-000000000001', 'rep77-duena@example.com', 'authenticated', 'authenticated'),
  -- Autorizada en Casa A: la protagonista.
  ('e7700000-0000-0000-0000-000000000002', 'rep77-ana@example.com', 'authenticated', 'authenticated'),
  -- Autorizado en Casa B, no en A.
  ('e7700000-0000-0000-0000-000000000003', 'rep77-beto@example.com', 'authenticated', 'authenticated'),
  -- Estuvo autorizada en A y se le retiró.
  ('e7700000-0000-0000-0000-000000000004', 'rep77-carla@example.com', 'authenticated', 'authenticated'),
  -- Autorizado en A, pero de baja temporal en el espacio.
  ('e7700000-0000-0000-0000-000000000005', 'rep77-dani@example.com', 'authenticated', 'authenticated'),
  -- El propietario del restaurante A, para ver que el aviso llega.
  ('e7700000-0000-0000-0000-000000000006', 'rep77-local@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('e7710000-0000-0000-0000-000000000001', 'Espacio 77', 'espacio-77-test', 'Europe/Madrid',
   'e7700000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status, can_approve_reports) values
  ('e7710000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000001', 'owner', 'active', false),
  ('e7710000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000002', 'worker', 'active', false),
  ('e7710000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000003', 'worker', 'active', false),
  ('e7710000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000004', 'worker', 'active', false),
  ('e7710000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000005', 'worker', 'temporarily_absent', false);

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours, grants_priority, report_level) values
  ('e7720000-0000-0000-0000-000000000001', 'e7710000-0000-0000-0000-000000000001', 'Premium+', 59900, 5, 2, 1, 1, 24, true, 'complete');

insert into public.groups (id, space_id, name) values
  ('e7730000-0000-0000-0000-000000000001', 'e7710000-0000-0000-0000-000000000001', 'Grupo 77');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('e7740000-0000-0000-0000-000000000001', 'e7710000-0000-0000-0000-000000000001',
   'e7730000-0000-0000-0000-000000000001', 'R77-A', 'Casa A', 'active'),
  ('e7740000-0000-0000-0000-000000000002', 'e7710000-0000-0000-0000-000000000001',
   'e7730000-0000-0000-0000-000000000001', 'R77-B', 'Casa B', 'active');

insert into public.subscriptions (space_id, establishment_id, kind, plan_id, status) values
  ('e7710000-0000-0000-0000-000000000001', 'e7740000-0000-0000-0000-000000000001', 'plan',
   'e7720000-0000-0000-0000-000000000001', 'active'),
  ('e7710000-0000-0000-0000-000000000001', 'e7740000-0000-0000-0000-000000000002', 'plan',
   'e7720000-0000-0000-0000-000000000001', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('e7750000-0000-0000-0000-000000000001', 'e7740000-0000-0000-0000-000000000001',
   'e7700000-0000-0000-0000-000000000006', 'local_owner');

insert into public.worker_establishments (space_id, user_id, establishment_id, created_by, revoked_at, revoked_by) values
  ('e7710000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000002',
   'e7740000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000001', null, null),
  ('e7710000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000003',
   'e7740000-0000-0000-0000-000000000002', 'e7700000-0000-0000-0000-000000000001', null, null),
  ('e7710000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000004',
   'e7740000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000001',
   now() - interval '1 day', 'e7700000-0000-0000-0000-000000000001'),
  ('e7710000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000005',
   'e7740000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000001', null, null);

create temp table r77 (k text primary key, v uuid);
grant select, insert, update on r77 to authenticated, service_role;

-- La propietaria prepara el consolidado del espacio y uno de finanzas de
-- Casa A, que es lo que el trabajador tiene que ver o no ver.
select set_config('request.jwt.claim.sub', 'e7700000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  insert into r77 values ('consolidado', public.create_report_draft(
    'e7710000-0000-0000-0000-000000000001', 'operation', 'Consolidado de agosto',
    '2026-08-01', '2026-08-31', null, null, '{}'::jsonb, 'operation::2026-08-01:2026-08-31'));
  insert into r77 values ('finanzas', public.create_report_draft(
    'e7710000-0000-0000-0000-000000000001', 'finance', 'Finanzas de agosto',
    '2026-08-01', '2026-08-31', 'e7740000-0000-0000-0000-000000000001', null, '{}'::jsonb,
    'finance:e7740000-0000-0000-0000-000000000001:2026-08-01:2026-08-31'));
  insert into r77 values ('de_b', public.create_report_draft(
    'e7710000-0000-0000-0000-000000000001', 'operation', 'Casa B de agosto',
    '2026-08-01', '2026-08-31', 'e7740000-0000-0000-0000-000000000002', null, '{}'::jsonb,
    'operation:e7740000-0000-0000-0000-000000000002:2026-08-01:2026-08-31'));
end $$;
reset role;

-- ============================================================
-- RN-REP-31 · la trabajadora autorizada lleva el informe de su restaurante
-- ============================================================
select set_config('request.jwt.claim.sub', 'e7700000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid;
begin
  if not public.is_report_worker('e7710000-0000-0000-0000-000000000001', 'e7740000-0000-0000-0000-000000000001') then
    raise exception 'RN-REP-31 FALLIDO: la trabajadora autorizada no cuenta como trabajadora del restaurante'
      using errcode = 'assert_failure';
  end if;

  -- Genera: prepara el borrador del mes y su versión.
  v_id := public.create_report_draft(
    'e7710000-0000-0000-0000-000000000001', 'operation', 'Informe de agosto de 2026',
    '2026-08-01', '2026-08-31', 'e7740000-0000-0000-0000-000000000001', null, '{}'::jsonb,
    'operation:e7740000-0000-0000-0000-000000000001:2026-08-01:2026-08-31');
  insert into r77 values ('mes', v_id);
  perform public.generate_report_version(v_id,
    '{"figures": [], "period": {"start": "2026-08-01", "end": "2026-08-31"}}'::jsonb);

  -- Revisa: secciones, textos y nombre.
  perform public.set_report_sections(v_id,
    '[{"key": "executive_summary", "included": true, "note": "Un mes con la carta nueva."}]'::jsonb);
  perform public.set_report_entry_texts(v_id, '[{"key": "change:SOL-77", "title": "Carta de otoño"}]'::jsonb);
  perform public.rename_report(v_id, 'Agosto en Casa A');

  -- Ve todo lo suyo, las tablas de dentro incluidas.
  if not exists (select 1 from public.reports where id = v_id)
     or not exists (select 1 from public.report_sections where report_id = v_id)
     or not exists (select 1 from public.report_versions where report_id = v_id)
     or not exists (select 1 from public.report_entry_texts where report_id = v_id) then
    raise exception 'RN-REP-31 FALLIDO: la trabajadora autorizada no ve el informe de su restaurante entero'
      using errcode = 'assert_failure';
  end if;

  -- Bosco eligió "todos los de ese restaurante": los de finanzas también.
  if not exists (select 1 from public.reports where id = (select v from r77 where k = 'finanzas')) then
    raise exception 'RN-REP-31 FALLIDO: la trabajadora autorizada no ve el informe de finanzas de su restaurante'
      using errcode = 'assert_failure';
  end if;

  -- Sube: aprueba y envía, con la confirmación de "sin revisar".
  if public.publish_report(v_id, true) < 1 then
    raise exception 'RN-REP-31 FALLIDO: la trabajadora autorizada no sube el informe de su restaurante'
      using errcode = 'assert_failure';
  end if;

  if (select status from public.reports where id = v_id) <> 'sent' then
    raise exception 'RN-REP-31 FALLIDO: el informe subido por la trabajadora no queda enviado'
      using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.report_deliveries where report_id = v_id) then
    raise exception 'RN-REP-31 FALLIDO: la trabajadora no ve las entregas del informe que subió'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- La aprobación queda a su nombre y con el motivo (RN-REP-14), y al
-- restaurante le llega (RN-REP-11).
do $$
declare
  v_id uuid := (select v from r77 where k = 'mes');
begin
  if not exists (
    select 1 from public.audit_log
    where entity_id = v_id and action = 'report.status_changed' and reason = 'Subido sin revisar'
      and actor_id = 'e7700000-0000-0000-0000-000000000002'
  ) then
    raise exception 'RN-REP-31 FALLIDO: la auditoría no dice que la trabajadora lo subió sin revisar'
      using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.notifications
    where entity_id = v_id and event_type = 'report_sent'
      and recipient_id = 'e7700000-0000-0000-0000-000000000006'
  ) then
    raise exception 'RN-REP-31 FALLIDO: el informe subido por la trabajadora no avisa al restaurante'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ...y lo que no es suyo sigue sin serlo.
select set_config('request.jwt.claim.sub', 'e7700000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  -- Decisión 30 · el consolidado es del espacio.
  if exists (select 1 from public.reports where id = (select v from r77 where k = 'consolidado')) then
    raise exception 'RN-REP-31 FALLIDO: la trabajadora ve el consolidado del espacio' using errcode = 'assert_failure';
  end if;
  begin
    perform public.create_report_draft(
      'e7710000-0000-0000-0000-000000000001', 'operation', 'Consolidado de Ana',
      '2026-07-01', '2026-07-31');
    raise exception 'RN-REP-31 FALLIDO: la trabajadora prepara un consolidado' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;
  begin
    perform public.publish_report((select v from r77 where k = 'consolidado'), true);
    raise exception 'RN-REP-31 FALLIDO: la trabajadora sube el consolidado' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;

  -- El de otro restaurante, ni verlo ni tocarlo.
  if exists (select 1 from public.reports where id = (select v from r77 where k = 'de_b')) then
    raise exception 'RN-REP-31 FALLIDO: la trabajadora ve el informe de un restaurante donde no está autorizada'
      using errcode = 'assert_failure';
  end if;
  begin
    perform public.set_report_entry_texts((select v from r77 where k = 'de_b'),
      '[{"key": "change:SOL-B", "title": "x"}]'::jsonb);
    raise exception 'RN-REP-31 FALLIDO: la trabajadora edita el informe de otro restaurante' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;
end $$;
reset role;

-- ============================================================
-- RN-REP-31 · quien no es "el trabajador de ese restaurante"
-- ============================================================
do $$
declare
  v_persona record;
begin
  for v_persona in
    select * from (values
      ('e7700000-0000-0000-0000-000000000003', 'el autorizado en otro restaurante'),
      ('e7700000-0000-0000-0000-000000000004', 'la que dejó de estar autorizada'),
      ('e7700000-0000-0000-0000-000000000005', 'el que está de baja en el espacio')
    ) as t(id, quien)
  loop
    perform set_config('request.jwt.claim.sub', v_persona.id, false);
    set local role authenticated;

    if exists (select 1 from public.reports where establishment_id = 'e7740000-0000-0000-0000-000000000001') then
      raise exception 'RN-REP-31 FALLIDO: % ve los informes de Casa A', v_persona.quien using errcode = 'assert_failure';
    end if;
    if exists (select 1 from public.report_versions where report_id = (select v from r77 where k = 'finanzas')) then
      raise exception 'RN-REP-31 FALLIDO: % ve las versiones de Casa A', v_persona.quien using errcode = 'assert_failure';
    end if;

    begin
      perform public.create_report_draft(
        'e7710000-0000-0000-0000-000000000001', 'operation', 'Intento',
        '2026-06-01', '2026-06-30', 'e7740000-0000-0000-0000-000000000001');
      raise exception 'RN-REP-31 FALLIDO: % prepara informes de Casa A', v_persona.quien using errcode = 'assert_failure';
    exception when assert_failure then raise;
    when others then null;
    end;

    begin
      perform public.set_report_status((select v from r77 where k = 'finanzas'), 'pending_review', null);
      raise exception 'RN-REP-31 FALLIDO: % mueve el estado de un informe de Casa A', v_persona.quien
        using errcode = 'assert_failure';
    exception when assert_failure then raise;
    when others then null;
    end;

    reset role;
  end loop;
end $$;

-- ============================================================
-- CLAUDE.md · dónde está cada función nueva
-- ============================================================
do $$
begin
  -- Las dos que viven en políticas: authenticated sí, anon no.
  if has_function_privilege('anon', 'public.is_report_worker(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.is_report_worker_for(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: una función de las políticas de informes está abierta a anon'
      using errcode = 'assert_failure';
  end if;
  if not has_function_privilege('authenticated', 'public.is_report_worker(uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.is_report_worker_for(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: se revocó a authenticated una función que está en una política: la política se rompería'
      using errcode = 'assert_failure';
  end if;
  -- Las internas, a nadie.
  if has_function_privilege('authenticated', 'public.report_can_prepare(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.report_can_prepare_report(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.report_actor_role_for(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: una función interna de informes está abierta por RPC'
      using errcode = 'assert_failure';
  end if;
end $$;

\echo 'Suite 77 · El trabajador autorizado lleva los informes de su restaurante: OK'
