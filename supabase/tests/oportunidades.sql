-- Fase 3 · Hito 15 · oportunidades por reglas deterministas (migración 84;
-- PRD §28, RN-OPP-01 a 10; §96 a §101 de la maestra; decisión 26 de
-- `docs/DECISIONES.md`; P7; §21.2).
--
--   · RN-OPP-01: una detección crea la oportunidad con su evidencia; sin
--     evidencia no se guarda (§96), y una regla que no existe tampoco.
--   · RN-OPP-05: los ocho estados de §98; el trabajador recomienda y NO
--     aprueba (§97); descartar exige motivo; de descartada no se sale a
--     mano.
--   · RN-OPP-06: §99 · una detección repetida actualiza la que hay (no
--     duplica), escribe en el libro de detecciones, y una descartada solo
--     reaparece si empeora o en otro periodo, conservando el descarte.
--   · RN-OPP-07: detectar no es enseñar. El restaurante no ve una
--     oportunidad hasta que alguien la aprueba, ni por pantalla ni por
--     llamada directa.
--   · RN-OPP-08: §101 · Básico ninguna; Impulso, Impulso+ y Premium las
--     básicas; Premium+ (el que concede prioridad) también las avanzadas.
--   · RN-OPP-09: §100 · las tres acciones crean un borrador de solicitud
--     con la oportunidad enganchada, y pulsar dos veces no crea dos.
--   · RN-OPP-10: auditoría de la familia `opportunity`, y las columnas con
--     identidad del equipo tapadas al restaurante.
--   · Las internas están cerradas por RPC.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/oportunidades.sql

insert into auth.users (id, email, role, aud) values
  ('ee000000-0000-0000-0000-000000000001', 'op-owner@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000002', 'op-admin@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000003', 'op-ana@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000004', 'op-luis@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000005', 'op-local@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000006', 'op-consulta@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000007', 'op-basico@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000008', 'op-premium@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000009', 'op-otro@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('ee100000-0000-0000-0000-000000000001', 'Espacio Oportunidades', 'espacio-oportunidades-test', 'Europe/Madrid',
   'ee000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status, can_approve_reports) values
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001', 'owner', 'active', false),
  -- El administrador CON "Aprobar informes" y la trabajadora sin ella (§97).
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000002', 'admin', 'active', true),
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000003', 'worker', 'active', false),
  -- Un administrador SIN la capacidad, para que "propietario y
  -- administradores CON Aprobar informes" no sea una frase decorativa.
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000004', 'admin', 'active', false);

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours, grants_priority) values
  ('ee200000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000001', 'Básico', 9900, 0, 0, 0, 0, 24, false),
  ('ee200000-0000-0000-0000-000000000002', 'ee100000-0000-0000-0000-000000000001', 'Impulso+', 39900, 16, 12, 3, 0, 8, false),
  ('ee200000-0000-0000-0000-000000000003', 'ee100000-0000-0000-0000-000000000001', 'Premium+', 59900, 25, 24, 5, 1, 4, true);

insert into public.groups (id, space_id, name) values
  ('ee300000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000001', 'Grupo O');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('ee400000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000001',
   'ee300000-0000-0000-0000-000000000001', 'OPP-0001', 'Casa Impulso', 'active'),
  ('ee400000-0000-0000-0000-000000000002', 'ee100000-0000-0000-0000-000000000001',
   'ee300000-0000-0000-0000-000000000001', 'OPP-0002', 'Casa Básico', 'active'),
  ('ee400000-0000-0000-0000-000000000003', 'ee100000-0000-0000-0000-000000000001',
   'ee300000-0000-0000-0000-000000000001', 'OPP-0003', 'Casa Premium', 'active');

insert into public.subscriptions (space_id, establishment_id, kind, plan_id, status) values
  ('ee100000-0000-0000-0000-000000000001', 'ee400000-0000-0000-0000-000000000001', 'plan', 'ee200000-0000-0000-0000-000000000002', 'active'),
  ('ee100000-0000-0000-0000-000000000001', 'ee400000-0000-0000-0000-000000000002', 'plan', 'ee200000-0000-0000-0000-000000000001', 'active'),
  ('ee100000-0000-0000-0000-000000000001', 'ee400000-0000-0000-0000-000000000003', 'plan', 'ee200000-0000-0000-0000-000000000003', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('ee400000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000005', 'local_owner'),
  ('ee400000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000006', 'consulta'),
  ('ee400000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000007', 'local_owner'),
  ('ee400000-0000-0000-0000-000000000003', 'ee000000-0000-0000-0000-000000000008', 'local_owner');

-- Ana está autorizada en Casa Impulso; Luis no (§97: "el trabajador asignado").
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000003', 'ee400000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001');

create temp table op_ids (k text primary key, v uuid);
grant select, insert, update on op_ids to authenticated, service_role;

-- ============================================================
-- El catálogo de reglas, compartido con src/core/opportunities.ts
-- ============================================================
do $$
begin
  -- Decisión 26e · avanzada es la que cruza dos fuentes, y hoy solo hay una.
  if public.opportunity_rule_scope('low_button_use') <> 'advanced' then
    raise exception 'RN-OPP-08 FALLIDO: "poco uso de botones" cruza dos fuentes y no cuenta como avanzada' using errcode = 'assert_failure';
  end if;
  if public.opportunity_rule_scope('traffic_drop') <> 'basic'
     or public.opportunity_rule_scope('low_ctr') <> 'basic'
     or public.opportunity_rule_scope('technical_error') <> 'basic' then
    raise exception 'RN-OPP-08 FALLIDO: una regla de una sola fuente no es básica' using errcode = 'assert_failure';
  end if;
  if public.opportunity_rule_scope('invented_rule') is not null then
    raise exception 'RN-OPP-01 FALLIDO: una regla que no existe tiene alcance' using errcode = 'assert_failure';
  end if;

  -- Las nueve de §96 y ninguna más.
  if (select count(*) from unnest(array[
        'traffic_drop', 'low_ctr', 'position_loss', 'slowness', 'heavy_images',
        'technical_error', 'low_mobile_conversion', 'queries_without_content', 'low_button_use'
      ]) r where public.opportunity_rule_providers(r) is null) > 0 then
    raise exception 'RN-OPP-01 FALLIDO: alguna de las nueve reglas de §96 no tiene fuentes' using errcode = 'assert_failure';
  end if;

  if public.opportunity_default_priority('high') <> 1
     or public.opportunity_default_priority('medium') <> 2
     or public.opportunity_default_priority('low') <> 3 then
    raise exception 'RN-OPP-03 FALLIDO: la prioridad propuesta no sale del impacto' using errcode = 'assert_failure';
  end if;

  -- RN-OPP-07 · qué estados ve el restaurante.
  if public.opportunity_is_visible_to_client('detected') is distinct from false
     or public.opportunity_is_visible_to_client('recommended') is distinct from false
     or public.opportunity_is_visible_to_client('under_review') is distinct from false
     or public.opportunity_is_visible_to_client('discarded') is distinct from false
     or public.opportunity_is_visible_to_client('approved_for_report') is distinct from true
     or public.opportunity_is_visible_to_client('implemented') is distinct from true then
    raise exception 'RN-OPP-07 FALLIDO: el restaurante ve estados que son conversación interna del equipo' using errcode = 'assert_failure';
  end if;

end $$;

-- §101 · lo que deja ver cada plan, por lo que el plan ES. Se pregunta
-- como el propietario del espacio: la función exige poder leer ese
-- restaurante, para que una llamada RPC suelta no diga de qué plan es
-- cualquier restaurante de cualquier espacio.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  if public.client_opportunity_access('ee400000-0000-0000-0000-000000000002') <> 'none' then
    raise exception 'RN-OPP-08 FALLIDO: Básico (sin ningún cambio incluido) deja ver oportunidades' using errcode = 'assert_failure';
  end if;
  if public.client_opportunity_access('ee400000-0000-0000-0000-000000000001') <> 'basic' then
    raise exception 'RN-OPP-08 FALLIDO: Impulso+ no deja ver las básicas' using errcode = 'assert_failure';
  end if;
  if public.client_opportunity_access('ee400000-0000-0000-0000-000000000003') <> 'advanced' then
    raise exception 'RN-OPP-08 FALLIDO: Premium+ (el que concede prioridad) no deja ver las avanzadas' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Y quien no pinta nada en ese restaurante no averigua su plan por RPC.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000009', false);
set role authenticated;
do $$
begin
  if public.client_opportunity_access('ee400000-0000-0000-0000-000000000003') <> 'none' then
    raise exception 'P7 FALLIDO: un extraño averigua de qué plan es un restaurante llamando a client_opportunity_access()'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-OPP-01 · detectar: la oportunidad nace con su evidencia
-- ============================================================
set role service_role;
do $$
declare
  v_id uuid;
begin
  v_id := public.upsert_detected_opportunity(
    'ee400000-0000-0000-0000-000000000001', 'traffic_drop', '', 'medium', 38.5,
    '2026-08-17', '2026-09-13',
    '[{"provider":"ga4","metric":"sessions","dimension":"","value":840,"previous":1365,"unit":"count"}]'::jsonb
  );
  insert into op_ids values ('traffic', v_id);

  if (select status from public.opportunities where id = v_id) <> 'detected' then
    raise exception 'RN-OPP-05 FALLIDO: una oportunidad recién detectada no nace "detectada"' using errcode = 'assert_failure';
  end if;
  if (select priority from public.opportunities where id = v_id) <> 2 then
    raise exception 'RN-OPP-03 FALLIDO: la prioridad propuesta no sale del impacto' using errcode = 'assert_failure';
  end if;
  if (select effort_category from public.opportunities where id = v_id) <> 'medium' then
    raise exception 'RN-OPP-04 FALLIDO: el esfuerzo propuesto no es la categoría del cambio de la regla' using errcode = 'assert_failure';
  end if;
  if (select detection_count from public.opportunities where id = v_id) <> 1
     or (select count(*) from public.opportunity_detections where opportunity_id = v_id) <> 1 then
    raise exception 'RN-OPP-06 FALLIDO: la primera detección no quedó en el libro' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where entity_id = v_id and action = 'opportunity.detected') <> 1 then
    raise exception 'RN-OPP-10 FALLIDO: detectar no dejó apunte de auditoría' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.state_events where entity_type = 'opportunity' and entity_id = v_id) <> 1 then
    raise exception 'RN-OPP-05 FALLIDO: detectar no dejó evento de estado' using errcode = 'assert_failure';
  end if;

  -- §96 · "no debe afirmarse algo sin evidencia suficiente".
  begin
    perform public.upsert_detected_opportunity(
      'ee400000-0000-0000-0000-000000000001', 'low_ctr', 'sin evidencia', 'low', 1,
      '2026-08-17', '2026-09-13', '[]'::jsonb
    );
    raise exception 'RN-OPP-01 FALLIDO: se guardó una oportunidad sin evidencia' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%sin evidencia%' then raise; end if;
  end;

  -- Una regla que no existe no entra por la puerta de atrás.
  begin
    perform public.upsert_detected_opportunity(
      'ee400000-0000-0000-0000-000000000001', 'corazonada', '', 'high', 1,
      '2026-08-17', '2026-09-13', '[{"metric":"x","value":1}]'::jsonb
    );
    raise exception 'RN-OPP-01 FALLIDO: se guardó una oportunidad de una regla inventada' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%desconocida%' then raise; end if;
  end;
end $$;

-- ============================================================
-- RN-OPP-06 · §99 · repetida ACTUALIZA, no duplica
-- ============================================================
do $$
declare
  v_id uuid;
  v_otra uuid;
begin
  v_id := (select v from op_ids where k = 'traffic');

  v_otra := public.upsert_detected_opportunity(
    'ee400000-0000-0000-0000-000000000001', 'traffic_drop', '', 'high', 55.0,
    '2026-08-18', '2026-09-14',
    '[{"provider":"ga4","metric":"sessions","dimension":"","value":600,"previous":1365,"unit":"count"}]'::jsonb
  );

  if v_otra <> v_id then
    raise exception 'RN-OPP-06 FALLIDO: la segunda detección de la misma regla y sujeto creó otra oportunidad' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.opportunities
      where establishment_id = 'ee400000-0000-0000-0000-000000000001' and rule_key = 'traffic_drop') <> 1 then
    raise exception 'RN-OPP-06 FALLIDO: hay dos oportunidades para la misma regla y el mismo sujeto' using errcode = 'assert_failure';
  end if;
  if (select detection_count from public.opportunities where id = v_id) <> 2
     or (select count(*) from public.opportunity_detections where opportunity_id = v_id) <> 2 then
    raise exception 'RN-OPP-06 FALLIDO: la detección repetida no quedó en el libro' using errcode = 'assert_failure';
  end if;
  if (select severity from public.opportunities where id = v_id) <> 55.0
     or (select impact from public.opportunities where id = v_id) <> 'high' then
    raise exception 'RN-OPP-06 FALLIDO: la oportunidad no se actualizó con la cuenta nueva' using errcode = 'assert_failure';
  end if;

  -- Un sujeto distinto de la misma regla SÍ es otra oportunidad: son dos
  -- consultas distintas, no la misma vista dos veces.
  perform public.upsert_detected_opportunity(
    'ee400000-0000-0000-0000-000000000001', 'low_ctr', 'menú del día', 'low', 1.4,
    '2026-08-17', '2026-09-13',
    '[{"provider":"search_console","metric":"ctr_by_query","dimension":"menú del día","value":0.006,"previous":null,"unit":"ratio"}]'::jsonb
  );
  perform public.upsert_detected_opportunity(
    'ee400000-0000-0000-0000-000000000001', 'low_ctr', 'arroz con bogavante', 'low', 1.1,
    '2026-08-17', '2026-09-13',
    '[{"provider":"search_console","metric":"ctr_by_query","dimension":"arroz con bogavante","value":0.009,"previous":null,"unit":"ratio"}]'::jsonb
  );
  if (select count(*) from public.opportunities
      where establishment_id = 'ee400000-0000-0000-0000-000000000001' and rule_key = 'low_ctr') <> 2 then
    raise exception 'RN-OPP-06 FALLIDO: dos consultas distintas no son dos oportunidades' using errcode = 'assert_failure';
  end if;
end $$;

-- Una avanzada en Casa Premium y otra en Casa Impulso, para §101.
do $$
begin
  insert into op_ids values ('avanzada_impulso', public.upsert_detected_opportunity(
    'ee400000-0000-0000-0000-000000000001', 'low_button_use', 'profile', 'high', 1.2,
    '2026-08-17', '2026-09-13',
    '[{"provider":"business_profile","metric":"profile_impressions","dimension":"","value":900,"previous":null,"unit":"count"}]'::jsonb
  ));
  insert into op_ids values ('avanzada_premium', public.upsert_detected_opportunity(
    'ee400000-0000-0000-0000-000000000003', 'low_button_use', 'profile', 'high', 1.2,
    '2026-08-17', '2026-09-13',
    '[{"provider":"business_profile","metric":"profile_impressions","dimension":"","value":900,"previous":null,"unit":"count"}]'::jsonb
  ));
  insert into op_ids values ('basica_basico', public.upsert_detected_opportunity(
    'ee400000-0000-0000-0000-000000000002', 'traffic_drop', '', 'high', 60,
    '2026-08-17', '2026-09-13',
    '[{"provider":"ga4","metric":"sessions","dimension":"","value":100,"previous":500,"unit":"count"}]'::jsonb
  ));
end $$;
reset role;

-- ============================================================
-- RN-OPP-05 · §97 · el trabajador recomienda; NO aprueba
-- ============================================================
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from op_ids where k = 'traffic');
begin
  -- Ve la automática de su restaurante (§97).
  if (select count(*) from public.opportunities where id = v_id) <> 1 then
    raise exception '§97 FALLIDO: la trabajadora autorizada no ve las oportunidades automáticas de su restaurante' using errcode = 'assert_failure';
  end if;

  perform public.set_opportunity_status(v_id, 'recommended', 'La caída coincide con el cambio de carta');
  if (select status from public.opportunities where id = v_id) <> 'recommended' then
    raise exception '§97 FALLIDO: la trabajadora no pudo recomendar' using errcode = 'assert_failure';
  end if;

  begin
    perform public.set_opportunity_status(v_id, 'approved_for_report');
    raise exception '§97 FALLIDO: una trabajadora aprobó una oportunidad definitivamente' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%No puedes pasar%' then raise; end if;
  end;

  -- Y aporta evidencia y observaciones (§97).
  perform public.add_opportunity_note(v_id, 'observation', 'Revisado el 14 de septiembre');
  perform public.add_opportunity_note(v_id, 'evidence', 'Captura de la caída en GA4');
  if (select count(*) from public.opportunity_notes where opportunity_id = v_id) <> 2 then
    raise exception '§97 FALLIDO: la trabajadora no pudo aportar evidencia ni observaciones' using errcode = 'assert_failure';
  end if;

  -- Y añade una a mano (§97: "Existe Añadir oportunidad").
  insert into op_ids values ('manual', public.add_manual_opportunity(
    'ee400000-0000-0000-0000-000000000001', 'Las fotos de la carta son de 2019', 'conversion', 'medium',
    'Se ven pixeladas en móvil', 'photo'
  ));
end $$;
reset role;

-- Un administrador SIN "Aprobar informes" tampoco aprueba (§97).
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from op_ids where k = 'traffic');
begin
  begin
    perform public.set_opportunity_status(v_id, 'approved_for_report');
    raise exception '§97 FALLIDO: un administrador SIN "Aprobar informes" aprobó una oportunidad' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%No puedes pasar%' then raise; end if;
  end;

  begin
    perform public.update_opportunity_proposal(v_id, 'low');
    raise exception '§96 FALLIDO: un administrador SIN "Aprobar informes" editó la propuesta' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%aprobar informes%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-OPP-03/04 · la propuesta es editable, y editarla la protege
-- ============================================================
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from op_ids where k = 'traffic');
begin
  perform public.update_opportunity_proposal(v_id, 'medium', 1, 'small', null, 'Revisar la carta y los enlaces rotos');

  if (select impact from public.opportunities where id = v_id) <> 'medium'
     or (select priority from public.opportunities where id = v_id) <> 1
     or (select effort_category from public.opportunities where id = v_id) <> 'small' then
    raise exception '§96 FALLIDO: impacto, prioridad y esfuerzo no son editables' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where entity_id = v_id and action = 'opportunity.proposal_edited') <> 1 then
    raise exception 'RN-OPP-10 FALLIDO: editar la propuesta no dejó apunte con el valor anterior' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

set role service_role;
do $$
declare
  v_id uuid := (select v from op_ids where k = 'traffic');
begin
  perform public.upsert_detected_opportunity(
    'ee400000-0000-0000-0000-000000000001', 'traffic_drop', '', 'high', 61.0,
    '2026-08-19', '2026-09-15',
    '[{"provider":"ga4","metric":"sessions","dimension":"","value":500,"previous":1365,"unit":"count"}]'::jsonb
  );
  if (select impact from public.opportunities where id = v_id) <> 'medium'
     or (select effort_category from public.opportunities where id = v_id) <> 'small' then
    raise exception '§96 FALLIDO: una detección posterior pisó la propuesta que el equipo había editado' using errcode = 'assert_failure';
  end if;
  if (select severity from public.opportunities where id = v_id) <> 61.0 then
    raise exception 'RN-OPP-06 FALLIDO: la detección posterior no actualizó la evidencia' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-OPP-05 · aprobar, y RN-OPP-07 · antes de aprobar el cliente no la ve
-- ============================================================
-- Antes: el propietario del restaurante no ve NINGUNA (todas sin aprobar).
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.opportunities) <> 0 then
    raise exception 'RN-OPP-07 FALLIDO: el restaurante ve oportunidades que nadie ha aprobado' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from op_ids where k = 'traffic');
begin
  perform public.set_opportunity_status(v_id, 'approved_for_report');
  if (select status from public.opportunities where id = v_id) <> 'approved_for_report' then
    raise exception 'RN-OPP-05 FALLIDO: quien aprueba informes no pudo aprobar' using errcode = 'assert_failure';
  end if;
  if (select include_in_report from public.opportunities where id = v_id) is distinct from true then
    raise exception '§96 FALLIDO: aprobar para el informe no marcó "Incluir en informe"' using errcode = 'assert_failure';
  end if;
  if (select approved_at from public.opportunities where id = v_id) is null then
    raise exception 'RN-OPP-10 FALLIDO: aprobar no guardó cuándo' using errcode = 'assert_failure';
  end if;

  -- Idempotente (RN-DAT-09): aprobar dos veces no escribe dos apuntes.
  perform public.set_opportunity_status(v_id, 'approved_for_report');
  if (select count(*) from public.state_events
      where entity_type = 'opportunity' and entity_id = v_id and to_state = 'approved_for_report') <> 1 then
    raise exception 'RN-OPP-05 FALLIDO: aprobar dos veces dejó dos eventos' using errcode = 'assert_failure';
  end if;

  -- Descartar exige motivo (§99: la descartada conserva historial).
  begin
    perform public.set_opportunity_status((select v from op_ids where k = 'manual'), 'discarded');
    raise exception '§99 FALLIDO: se descartó una oportunidad sin motivo' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%motivo%' then raise; end if;
  end;
end $$;
reset role;

-- Aprobadas también las dos avanzadas y la básica del plan Básico.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  perform public.set_opportunity_status((select v from op_ids where k = 'avanzada_impulso'), 'approved_for_report');
  perform public.set_opportunity_status((select v from op_ids where k = 'avanzada_premium'), 'approved_for_report');
  perform public.set_opportunity_status((select v from op_ids where k = 'basica_basico'), 'approved_for_report');
end $$;
reset role;

-- ============================================================
-- RN-OPP-08 · §101 · qué ve cada plan
-- ============================================================
-- Impulso+: la básica aprobada sí, la avanzada no.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.opportunities where id = (select v from op_ids where k = 'traffic')) <> 1 then
    raise exception 'RN-OPP-08 FALLIDO: Impulso+ no ve una oportunidad básica aprobada' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.opportunities where id = (select v from op_ids where k = 'avanzada_impulso')) <> 0 then
    raise exception 'RN-OPP-08 FALLIDO: Impulso+ ve una oportunidad avanzada' using errcode = 'assert_failure';
  end if;
  -- Y no ve las de otros restaurantes, aprobadas o no.
  if (select count(*) from public.opportunities where establishment_id <> 'ee400000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'P7 FALLIDO: el restaurante ve oportunidades de otro restaurante' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Básico: ninguna, aunque esté aprobada (§101: "detección interna").
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000007', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.opportunities) <> 0 then
    raise exception 'RN-OPP-08 FALLIDO: el plan Básico deja ver oportunidades' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Premium+: también las avanzadas.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000008', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.opportunities where id = (select v from op_ids where k = 'avanzada_premium')) <> 1 then
    raise exception 'RN-OPP-08 FALLIDO: Premium+ no ve una oportunidad avanzada aprobada' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-OPP-09 · §100 · la acción del restaurante
-- ============================================================
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from op_ids where k = 'traffic');
  v_request uuid;
  v_otra_vez uuid;
begin
  v_request := public.act_on_opportunity(v_id, 'request_change', 'Queremos recuperar el tráfico perdido');
  insert into op_ids values ('solicitud', v_request);

  if (select state from public.requests where id = v_request) <> 'draft' then
    raise exception 'RN-OPP-09 FALLIDO: la acción no creó un BORRADOR de solicitud' using errcode = 'assert_failure';
  end if;
  if (select opportunity_id from public.requests where id = v_request) <> v_id then
    raise exception 'RN-OPP-09 FALLIDO: el borrador no lleva la oportunidad enganchada (la evidencia adjunta)' using errcode = 'assert_failure';
  end if;
  if (select opportunity_action from public.requests where id = v_request) <> 'request_change' then
    raise exception 'RN-OPP-09 FALLIDO: el borrador no guarda cuál de las tres acciones fue' using errcode = 'assert_failure';
  end if;

  -- Pulsar dos veces no crea dos borradores (CLAUDE.md).
  v_otra_vez := public.act_on_opportunity(v_id, 'request_change', 'Queremos recuperar el tráfico perdido');
  if v_otra_vez <> v_request then
    raise exception 'RN-OPP-09 FALLIDO: pulsar dos veces creó dos solicitudes' using errcode = 'assert_failure';
  end if;

  -- Nada de esto consume bolsa: el consumo nace al aceptar (RN-CON-06).
  if (select count(*) from public.consumption_entries
      where establishment_id = 'ee400000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'RN-CON-06 FALLIDO: actuar sobre una oportunidad consumió bolsa' using errcode = 'assert_failure';
  end if;

  -- Sobre una que no puede ver, ni por llamada directa (CLAUDE.md: ocultar
  -- el botón no es un control de acceso).
  begin
    perform public.act_on_opportunity((select v from op_ids where k = 'avanzada_impulso'), 'request_quote', 'Presupuesto');
    raise exception 'RN-OPP-08 FALLIDO: el restaurante actuó sobre una oportunidad que su plan no le deja ver' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%no está disponible%' then raise; end if;
  end;
end $$;
reset role;

-- Consulta mira y no pide (§4.3).
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
begin
  begin
    perform public.act_on_opportunity((select v from op_ids where k = 'traffic'), 'ask_question', '¿Qué pasó?');
    raise exception '§4.3 FALLIDO: un usuario de Consulta creó una solicitud desde una oportunidad' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%escritura%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-OPP-06 · §99 · descartar, y cuándo reaparece
-- ============================================================
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from op_ids where k = 'manual');
begin
  perform public.set_opportunity_status(v_id, 'discarded', 'Las fotos se cambiaron el mes pasado');
  if (select discard_reason from public.opportunities where id = v_id) is null then
    raise exception '§99 FALLIDO: la descartada no conserva el motivo' using errcode = 'assert_failure';
  end if;

  -- De descartada no se sale a mano.
  begin
    perform public.set_opportunity_status(v_id, 'approved_for_report');
    raise exception '§99 FALLIDO: se reabrió una descartada a mano' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%No puedes pasar%' then raise; end if;
  end;
end $$;
reset role;

set role service_role;
do $$
declare
  v_id uuid;
begin
  -- Una regla nueva que se descarta, para probar la reaparición.
  v_id := public.upsert_detected_opportunity(
    'ee400000-0000-0000-0000-000000000001', 'technical_error', '', 'high', 6.0,
    '2026-08-17', '2026-09-13',
    '[{"provider":"clarity","metric":"script_errors","dimension":"","value":60,"previous":null,"unit":"count"}]'::jsonb
  );
  insert into op_ids values ('error', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  perform public.set_opportunity_status((select v from op_ids where k = 'error'), 'discarded', 'Es un error de un script de terceros que ya se quitó');
end $$;
reset role;

set role service_role;
do $$
declare
  v_id uuid := (select v from op_ids where k = 'error');
begin
  -- La misma ventana y la misma severidad: sigue descartada, pero la
  -- detección queda en el libro.
  perform public.upsert_detected_opportunity(
    'ee400000-0000-0000-0000-000000000001', 'technical_error', '', 'high', 6.0,
    '2026-08-17', '2026-09-13',
    '[{"provider":"clarity","metric":"script_errors","dimension":"","value":60,"previous":null,"unit":"count"}]'::jsonb
  );
  if (select status from public.opportunities where id = v_id) <> 'discarded' then
    raise exception '§99 FALLIDO: una descartada volvió con el mismo dato y el mismo periodo' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.opportunity_detections where opportunity_id = v_id) <> 2 then
    raise exception '§99 FALLIDO: la detección de una descartada no quedó en el libro' using errcode = 'assert_failure';
  end if;

  -- Peor que cuando se descartó: vuelve, y se sabe que hubo un descarte.
  perform public.upsert_detected_opportunity(
    'ee400000-0000-0000-0000-000000000001', 'technical_error', '', 'high', 11.0,
    '2026-08-17', '2026-09-13',
    '[{"provider":"clarity","metric":"script_errors","dimension":"","value":110,"previous":null,"unit":"count"}]'::jsonb
  );
  if (select status from public.opportunities where id = v_id) <> 'detected' then
    raise exception '§99 FALLIDO: una descartada que empeora no reaparece' using errcode = 'assert_failure';
  end if;
  if (select discarded_at from public.opportunities where id = v_id) is null
     or (select discard_reason from public.opportunities where id = v_id) is null
     or (select reopened_at from public.opportunities where id = v_id) is null then
    raise exception '§99 FALLIDO: al reaparecer no se indica el descarte anterior' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where entity_id = v_id and action = 'opportunity.reopened') <> 1 then
    raise exception 'RN-OPP-10 FALLIDO: reaparecer no dejó apunte de auditoría' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- P7 / CLAUDE.md · lo que el restaurante NO ve
-- ============================================================
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from op_ids where k = 'traffic');
begin
  -- Las notas del equipo son organización interna: ni la fila.
  if (select count(*) from public.opportunity_notes) <> 0 then
    raise exception 'P7 FALLIDO: el restaurante ve las notas internas del equipo sobre sus oportunidades' using errcode = 'assert_failure';
  end if;
  -- El libro de detecciones, tampoco.
  if (select count(*) from public.opportunity_detections) <> 0 then
    raise exception 'P7 FALLIDO: el restaurante ve el registro de detecciones' using errcode = 'assert_failure';
  end if;
  -- Ni quién aprobó o descartó.
  if (select count(*) from public.state_events where entity_type = 'opportunity') <> 0 then
    raise exception 'P7 FALLIDO: el restaurante ve quién movió la oportunidad de estado' using errcode = 'assert_failure';
  end if;

  begin
    perform (select approved_by from public.opportunities where id = v_id);
    raise exception 'CLAUDE.md MUST NOT FALLIDO: el restaurante lee opportunities.approved_by' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ============================================================
-- Las internas, cerradas por RPC (CLAUDE.md, fallo real del 30/08/2026)
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
      and p.proname in ('upsert_detected_opportunity', 'establishments_for_opportunity_detection')
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    v_abiertas := v_abiertas || ' ' || v_fn;
  end loop;

  if v_abiertas <> '' then
    raise exception 'CLAUDE.md MUST FALLIDO: función interna del Hito 15 invocable por RPC:%', v_abiertas
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza
-- ============================================================
delete from public.request_versions where request_id in (select id from public.requests where space_id = 'ee100000-0000-0000-0000-000000000001');
delete from public.requests where space_id = 'ee100000-0000-0000-0000-000000000001';
delete from public.opportunity_notes where space_id = 'ee100000-0000-0000-0000-000000000001';
delete from public.opportunity_detections where space_id = 'ee100000-0000-0000-0000-000000000001';
delete from public.state_events where space_id = 'ee100000-0000-0000-0000-000000000001';
delete from public.audit_log where space_id = 'ee100000-0000-0000-0000-000000000001';
delete from public.opportunities where space_id = 'ee100000-0000-0000-0000-000000000001';
delete from public.subscriptions where space_id = 'ee100000-0000-0000-0000-000000000001';
delete from public.worker_establishments where space_id = 'ee100000-0000-0000-0000-000000000001';
delete from public.establishment_memberships where establishment_id in
  (select id from public.establishments where space_id = 'ee100000-0000-0000-0000-000000000001');
delete from public.establishments where space_id = 'ee100000-0000-0000-0000-000000000001';
delete from public.plans where space_id = 'ee100000-0000-0000-0000-000000000001';
delete from public.groups where space_id = 'ee100000-0000-0000-0000-000000000001';
-- Sin borrar `space_memberships` a mano: la clave ajena en cascada se las
-- lleva al borrar el espacio, y hacerlo antes deja al espacio sin
-- propietario un instante, que es exactamente lo que el disparador de
-- RN-CIC-06 (migración 92) impide. El desmontaje era redundante.
delete from public.spaces where id = 'ee100000-0000-0000-0000-000000000001';
delete from auth.users where email like 'op-%@example.com';
drop table op_ids;

select 'oportunidades.sql: todas las comprobaciones pasaron' as resultado;
