-- Condiciones versionadas y su aceptación (maqueta 13, RN-DAT-07, §104).
--
-- Decisión de Bosco (12/09/2026), opción (c): el propietario del
-- restaurante acepta en Cuotly, Y el equipo puede registrar una
-- aceptación de fuera con fecha y contrato. Lo que se comprueba:
--
--   · Publicar es VERSIONAR: la v1 sigue ahí después de publicar la v2, y
--     solo publica `manage_space` (RN-DAT-07, P4).
--   · Los cuatro estados en el orden en que le pasan a una suscripción:
--     no_terms → pending → accepted → outdated. Y que `outdated` no borra
--     el hecho de que se aceptó la v1 (§104: "se conserva versión
--     aceptada").
--   · Quién acepta: el propietario local sí; un Editor del mismo
--     restaurante NO; el equipo tampoco por esta vía.
--   · Aceptar una versión vieja se rechaza: la que rige es la vigente.
--   · La aceptación externa exige `manage_clients`, fecha no futura y un
--     archivo de ESTE restaurante; y deja el contrato vinculado a la
--     suscripción, con lo que RN-ARC-07 le cierra el borrado definitivo.
--   · CA-17: aceptar dos veces devuelve la misma fila.
--   · P7: el restaurante no lee `published_by` ni `recorded_by`, y un
--     restaurante sin ese plan no lee sus condiciones.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/condiciones_versionadas.sql

-- ============================================================
-- Fixture
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('cc000000-0000-0000-0000-000000000001', 'cond-owner@example.com', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000002', 'cond-admin@example.com', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000003', 'cond-local@example.com', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000004', 'cond-editor@example.com', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000005', 'cond-otro@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('cc100000-0000-0000-0000-000000000001', 'Espacio Condiciones', 'espacio-condiciones-test',
   'cc000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('cc100000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('cc100000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000002', 'admin', 'active');

insert into public.plans
  (id, space_id, name, price_cents, included_small, included_photo, included_medium,
   included_large, start_sla_hours) values
  ('cc200000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001',
   'Plan A', 39900, 16, 12, 3, 0, 24),
  ('cc200000-0000-0000-0000-000000000002', 'cc100000-0000-0000-0000-000000000001',
   'Plan B', 9900, 0, 0, 0, 0, 48);

insert into public.services (id, space_id, name, price_cents) values
  ('cc250000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'Servicio S', 22900);

insert into public.groups (id, space_id, name) values
  ('cc300000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'Grupo Condiciones');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('cc400000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001',
   'cc300000-0000-0000-0000-000000000001', 'EST-CND-A', 'Restaurante A', 'active'),
  ('cc400000-0000-0000-0000-000000000002', 'cc100000-0000-0000-0000-000000000001',
   'cc300000-0000-0000-0000-000000000001', 'EST-CND-B', 'Restaurante B', 'active');

-- A tiene el plan A y el servicio S; B tiene el plan B.
insert into public.subscriptions (id, space_id, establishment_id, kind, plan_id, service_id, status) values
  ('cc600000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001',
   'cc400000-0000-0000-0000-000000000001', 'plan', 'cc200000-0000-0000-0000-000000000001', null, 'active'),
  ('cc600000-0000-0000-0000-000000000002', 'cc100000-0000-0000-0000-000000000001',
   'cc400000-0000-0000-0000-000000000001', 'service', null, 'cc250000-0000-0000-0000-000000000001', 'active'),
  ('cc600000-0000-0000-0000-000000000003', 'cc100000-0000-0000-0000-000000000001',
   'cc400000-0000-0000-0000-000000000002', 'plan', 'cc200000-0000-0000-0000-000000000002', null, 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('cc400000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000003', 'local_owner'),
  ('cc400000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000004', 'editor'),
  ('cc400000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-000000000005', 'local_owner');

-- Un contrato como archivo del restaurante A, y otro del B.
insert into public.files (id, space_id, group_id, establishment_id, category, visibility, name, created_by) values
  ('cc700000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001',
   'cc300000-0000-0000-0000-000000000001', 'cc400000-0000-0000-0000-000000000001',
   'documents', 'shared_with_client', 'Contrato A', 'cc000000-0000-0000-0000-000000000001'),
  ('cc700000-0000-0000-0000-000000000002', 'cc100000-0000-0000-0000-000000000001',
   'cc300000-0000-0000-0000-000000000001', 'cc400000-0000-0000-0000-000000000002',
   'documents', 'internal', 'Contrato B', 'cc000000-0000-0000-0000-000000000001');

insert into public.file_versions (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, created_by) values
  ('cc700000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 1,
   'cc1/contrato-a.pdf', 'contrato-a.pdf', 'application/pdf', 1234, 'cc000000-0000-0000-0000-000000000001'),
  ('cc700000-0000-0000-0000-000000000002', 'cc100000-0000-0000-0000-000000000001', 1,
   'cc1/contrato-b.pdf', 'contrato-b.pdf', 'application/pdf', 1234, 'cc000000-0000-0000-0000-000000000001');

-- ============================================================
-- Sin condiciones publicadas: `no_terms`, y nada que aceptar.
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare v_fila record;
begin
  select * into v_fila from public.subscription_terms('cc600000-0000-0000-0000-000000000001');
  if v_fila.status is distinct from 'no_terms' or v_fila.current_version_id is not null then
    raise exception 'FALLIDO: sin condiciones publicadas el estado es % (esperado no_terms)', v_fila.status
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- Publicar: solo `manage_space`. Un administrador NO.
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare v_error text := '';
begin
  begin
    perform public.publish_plan_conditions('cc200000-0000-0000-0000-000000000001', 'Texto');
    v_error := 'un administrador ha publicado condiciones';
  exception when others then
    if sqlerrm not like '%Solo el propietario del espacio%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;

  if v_error <> '' then
    raise exception 'RN-DAT-07 FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- La propietaria publica la v1. Vacío se rechaza.
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare v_v1 uuid; v_version integer; v_error text := '';
begin
  begin
    perform public.publish_plan_conditions('cc200000-0000-0000-0000-000000000001', '   ');
    v_error := 'se han publicado condiciones vacias';
  exception when others then
    if sqlerrm not like '%no pueden estar vacías%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;
  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;

  v_v1 := public.publish_plan_conditions('cc200000-0000-0000-0000-000000000001', 'Condiciones del plan A, primera versión.');
  select version into v_version from public.plan_versions where id = v_v1;
  if v_version <> 1 then
    raise exception 'RN-DAT-07 FALLIDO: la primera publicacion es la v%', v_version using errcode = 'assert_failure';
  end if;

  -- Y el servicio.
  perform public.publish_service_conditions('cc250000-0000-0000-0000-000000000001', 'Condiciones del servicio S.');
end $$;

reset role;

-- ============================================================
-- `pending`: hay condiciones y el restaurante no ha aceptado. Quien acepta
-- es el propietario local; el Editor NO.
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare v_fila record; v_error text := '';
begin
  select * into v_fila from public.subscription_terms('cc600000-0000-0000-0000-000000000001');
  if v_fila.status is distinct from 'pending' or v_fila.current_version <> 1 then
    raise exception 'FALLIDO: con v1 publicada y sin aceptar el estado es % / v%', v_fila.status, v_fila.current_version
      using errcode = 'assert_failure';
  end if;

  if public.client_can_accept_terms('cc400000-0000-0000-0000-000000000001') then
    raise exception 'FALLIDO: un Editor puede aceptar las condiciones por el restaurante'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.accept_subscription_terms('cc600000-0000-0000-0000-000000000001', v_fila.current_version_id);
    v_error := 'un Editor ha aceptado las condiciones';
  exception when others then
    if sqlerrm not like '%Solo el propietario del restaurante%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;

  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- El equipo tampoco acepta por el restaurante: su vía es la externa.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare v_error text := ''; v_version uuid;
begin
  select id into v_version from public.plan_versions where plan_id = 'cc200000-0000-0000-0000-000000000001' and version = 1;
  begin
    perform public.accept_subscription_terms('cc600000-0000-0000-0000-000000000001', v_version);
    v_error := 'la propietaria del ESPACIO ha aceptado por el restaurante';
  exception when others then
    if sqlerrm not like '%Solo el propietario del restaurante%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;
  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- (a) El propietario local acepta la v1. Dos veces: una fila (CA-17).
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare v_fila record; v_a uuid; v_b uuid; v_cuantas integer;
begin
  if not public.client_can_accept_terms('cc400000-0000-0000-0000-000000000001') then
    raise exception 'FALLIDO: el propietario local no puede aceptar' using errcode = 'assert_failure';
  end if;

  select * into v_fila from public.subscription_terms('cc600000-0000-0000-0000-000000000001');
  v_a := public.accept_subscription_terms('cc600000-0000-0000-0000-000000000001', v_fila.current_version_id);
  v_b := public.accept_subscription_terms('cc600000-0000-0000-0000-000000000001', v_fila.current_version_id);

  if v_a <> v_b then
    raise exception 'CA-17 FALLIDO: aceptar dos veces ha creado dos aceptaciones' using errcode = 'assert_failure';
  end if;

  select count(*) into v_cuantas from public.terms_acceptances where subscription_id = 'cc600000-0000-0000-0000-000000000001';
  if v_cuantas <> 1 then
    raise exception 'CA-17 FALLIDO: hay % aceptaciones', v_cuantas using errcode = 'assert_failure';
  end if;

  select * into v_fila from public.subscription_terms('cc600000-0000-0000-0000-000000000001');
  if v_fila.status is distinct from 'accepted' or v_fila.accepted_version <> 1 or v_fila.accepted_channel <> 'in_app' then
    raise exception 'FALLIDO: tras aceptar, el estado es % / aceptada v% por %', v_fila.status, v_fila.accepted_version, v_fila.accepted_channel
      using errcode = 'assert_failure';
  end if;

  -- P7 · el restaurante lee la version y NO lee quien la publico.
  begin
    perform published_by from public.plan_versions where plan_id = 'cc200000-0000-0000-0000-000000000001';
    raise exception 'CLAUDE.md MUST NOT FALLIDO: el restaurante lee plan_versions.published_by' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;

  if (select count(*) from public.plan_versions where plan_id = 'cc200000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FALLIDO: el restaurante no lee las condiciones de SU plan' using errcode = 'assert_failure';
  end if;

  -- Y no lee las del plan B, que no es el suyo.
  if (select count(*) from public.plan_versions where plan_id = 'cc200000-0000-0000-0000-000000000002') <> 0 then
    raise exception 'P7 FALLIDO: el restaurante lee las condiciones de un plan que no tiene' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- La v2: versionar, no editar. La v1 sigue, y el estado pasa a `outdated`
-- sin perder que se acepto la v1 (§104).
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare v_v2 uuid; v_cuantas integer;
begin
  v_v2 := public.publish_plan_conditions('cc200000-0000-0000-0000-000000000001', 'Condiciones del plan A, segunda versión.');

  select count(*) into v_cuantas from public.plan_versions where plan_id = 'cc200000-0000-0000-0000-000000000001';
  if v_cuantas <> 2 then
    raise exception 'RN-DAT-07 FALLIDO: publicar la v2 ha dejado % versiones (la v1 tiene que seguir)', v_cuantas
      using errcode = 'assert_failure';
  end if;

  if (select conditions from public.plan_versions where plan_id = 'cc200000-0000-0000-0000-000000000001' and version = 1)
     <> 'Condiciones del plan A, primera versión.' then
    raise exception 'P4 FALLIDO: la v1 ha cambiado de texto' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare v_fila record; v_error text := ''; v_v1 uuid;
begin
  select * into v_fila from public.subscription_terms('cc600000-0000-0000-0000-000000000001');
  if v_fila.status is distinct from 'outdated' or v_fila.current_version <> 2 or v_fila.accepted_version <> 1 then
    raise exception '§104 FALLIDO: con v2 publicada y v1 aceptada el estado es % (vigente v%, aceptada v%)',
      v_fila.status, v_fila.current_version, v_fila.accepted_version using errcode = 'assert_failure';
  end if;

  -- Aceptar la v1 otra vez (la vieja) se rechaza: rige la v2.
  select id into v_v1 from public.plan_versions where plan_id = 'cc200000-0000-0000-0000-000000000001' and version = 1;
  begin
    perform public.accept_subscription_terms('cc600000-0000-0000-0000-000000000001', v_v1);
    -- Ojo: la v1 YA esta aceptada, asi que la idempotencia podria devolverla.
    -- Que no: la comprobacion de version va antes.
    v_error := 'se ha aceptado una version vieja';
  exception when others then
    if sqlerrm not like '%versión más reciente%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;
  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- (b) La aceptacion externa: `manage_clients`, fecha no futura, archivo
-- de ESTE restaurante. Deja el contrato vinculado a la suscripcion.
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare v_error text := ''; v_v2 uuid;
begin
  select id into v_v2 from public.plan_versions where plan_id = 'cc200000-0000-0000-0000-000000000001' and version = 2;
  begin
    perform public.record_external_terms_acceptance(
      'cc600000-0000-0000-0000-000000000001', v_v2, current_date, 'cc700000-0000-0000-0000-000000000001');
    v_error := 'el propietario del restaurante ha registrado una aceptacion externa';
  exception when others then
    if sqlerrm not like '%Solo el propietario o un administrador%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;
  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare v_error text := ''; v_v2 uuid; v_a uuid; v_b uuid; v_fila record;
begin
  select id into v_v2 from public.plan_versions where plan_id = 'cc200000-0000-0000-0000-000000000001' and version = 2;

  -- Fecha futura.
  begin
    perform public.record_external_terms_acceptance(
      'cc600000-0000-0000-0000-000000000001', v_v2, current_date + 2, 'cc700000-0000-0000-0000-000000000001');
    v_error := 'se ha registrado una aceptacion con fecha futura';
  exception when others then
    if sqlerrm not like '%no puede ser futura%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;

  -- Archivo de otro restaurante.
  begin
    perform public.record_external_terms_acceptance(
      'cc600000-0000-0000-0000-000000000001', v_v2, current_date, 'cc700000-0000-0000-0000-000000000002');
    v_error := v_error || ' / se ha registrado con el contrato de otro restaurante';
  exception when others then
    if sqlerrm not like '%archivo de este restaurante%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;

  -- Sin archivo.
  begin
    perform public.record_external_terms_acceptance(
      'cc600000-0000-0000-0000-000000000001', v_v2, current_date, null);
    v_error := v_error || ' / se ha registrado una aceptacion externa sin contrato';
  exception when others then
    if sqlerrm not like '%lleva el contrato adjunto%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;

  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;

  -- La buena, con fecha de hace un año (puede ser anterior a la publicacion).
  v_a := public.record_external_terms_acceptance(
    'cc600000-0000-0000-0000-000000000001', v_v2, current_date - 365, 'cc700000-0000-0000-0000-000000000001');
  v_b := public.record_external_terms_acceptance(
    'cc600000-0000-0000-0000-000000000001', v_v2, current_date - 365, 'cc700000-0000-0000-0000-000000000001');
  if v_a <> v_b then
    raise exception 'CA-17 FALLIDO: registrar dos veces ha creado dos aceptaciones' using errcode = 'assert_failure';
  end if;

  select * into v_fila from public.subscription_terms('cc600000-0000-0000-0000-000000000001');
  if v_fila.status is distinct from 'accepted' or v_fila.accepted_version <> 2
     or v_fila.accepted_channel <> 'external' or v_fila.evidence_file_id <> 'cc700000-0000-0000-0000-000000000001' then
    raise exception 'FALLIDO: tras la aceptacion externa el estado es % / v% / %', v_fila.status, v_fila.accepted_version, v_fila.accepted_channel
      using errcode = 'assert_failure';
  end if;

  -- RN-ARC-02/07 · el contrato queda vinculado a la suscripcion.
  if not exists (
    select 1 from public.file_links
    where file_id = 'cc700000-0000-0000-0000-000000000001'
      and entity_type = 'subscription' and entity_id = 'cc600000-0000-0000-0000-000000000001'
  ) then
    raise exception 'RN-ARC-07 FALLIDO: el contrato no ha quedado vinculado a la suscripcion' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- La fecha se guardo en la zona del espacio: el inicio de ese dia.
do $$
declare v_at timestamptz; v_tz text;
begin
  select timezone into v_tz from public.spaces where id = 'cc100000-0000-0000-0000-000000000001';
  select accepted_at into v_at from public.terms_acceptances
  where subscription_id = 'cc600000-0000-0000-0000-000000000001' and channel = 'external';
  if (v_at at time zone v_tz)::date <> current_date - 365 or (v_at at time zone v_tz)::time <> '00:00' then
    raise exception 'CLAUDE.md MUST FALLIDO: la fecha externa no se ha guardado como el inicio del dia en la zona del espacio (%)', v_at
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- P7 · el restaurante lee su aceptacion externa pero NO quien la registro.
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  if (select count(*) from public.terms_acceptances where subscription_id = 'cc600000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'FALLIDO: el restaurante no lee sus propias aceptaciones' using errcode = 'assert_failure';
  end if;

  begin
    perform recorded_by from public.terms_acceptances where subscription_id = 'cc600000-0000-0000-0000-000000000001';
    raise exception 'CLAUDE.md MUST NOT FALLIDO: el restaurante lee terms_acceptances.recorded_by' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- El propietario del restaurante B no ve nada de la suscripcion de A.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  if exists (select 1 from public.subscription_terms('cc600000-0000-0000-0000-000000000001')) then
    raise exception 'P7 FALLIDO: otro restaurante lee el estado de las condiciones de A' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.terms_acceptances) <> 0 then
    raise exception 'P7 FALLIDO: otro restaurante lee aceptaciones ajenas' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- El catalogo para publicar: el equipo lo ve, el restaurante no.
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare v_fila record;
begin
  select * into v_fila from public.conditions_catalogue('cc100000-0000-0000-0000-000000000001')
  where subject_type = 'plan' and subject_id = 'cc200000-0000-0000-0000-000000000001';
  if v_fila.version <> 2 then
    raise exception 'FALLIDO: el catalogo no da la ULTIMA version (da v%)', v_fila.version using errcode = 'assert_failure';
  end if;

  select * into v_fila from public.conditions_catalogue('cc100000-0000-0000-0000-000000000001')
  where subject_type = 'plan' and subject_id = 'cc200000-0000-0000-0000-000000000002';
  if v_fila.subject_id is null or v_fila.version is not null then
    raise exception 'FALLIDO: un plan sin condiciones tiene que salir en el catalogo, sin version' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  if exists (select 1 from public.conditions_catalogue('cc100000-0000-0000-0000-000000000001')) then
    raise exception 'P7 FALLIDO: el restaurante lee el catalogo de condiciones del espacio' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md · privilegios.
-- ============================================================
do $$
begin
  if has_function_privilege('anon', 'public.publish_plan_conditions(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.publish_service_conditions(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.accept_subscription_terms(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.record_external_terms_acceptance(uuid, uuid, date, uuid)', 'execute')
     or has_function_privilege('anon', 'public.subscription_terms(uuid)', 'execute')
     or has_function_privilege('anon', 'public.conditions_catalogue(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.assert_terms_version_current(uuid, uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: alguna funcion de condiciones esta abierta a quien no debe'
      using errcode = 'assert_failure';
  end if;

  if has_column_privilege('authenticated', 'public.plan_versions', 'published_by', 'select')
     or has_column_privilege('authenticated', 'public.service_versions', 'published_by', 'select')
     or has_column_privilege('authenticated', 'public.terms_acceptances', 'recorded_by', 'select') then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: una columna de identidad del equipo esta abierta al cliente'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id = 'cc100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'cc100000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'cc000000-%';

select 'condiciones_versionadas.sql: todas las comprobaciones han pasado' as resultado;
