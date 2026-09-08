-- El Inicio del espacio (§20.4), migración 20260908000054, contra la base
-- de datos real.
--
-- Qué comprueba, y por qué cada cosa:
--   · **RN-COM-15/17** · el plazo con el que se aceptó una solicitud está
--     congelado en `requests.accepted_start_sla_hours`, y hasta esta
--     migración `authenticated` no podía leerlo: la columna nació después
--     del `revoke select` de la migración 27, así que pedirla devolvía
--     403. Sin ella la pantalla usaría el plazo del plan de HOY, que es
--     exactamente lo que la migración 40 arregló en el servidor.
--   · **CLAUDE.md MUST NOT** · conceder esa columna NO abre la identidad:
--     `validated_by`, `accepted_by` y compañía siguen revocadas.
--   · **§20.5 aplicado a §20.4** · `space_job_counters()` es SECURITY
--     INVOKER, así que filtra RLS y no una lista escrita a mano: el
--     restaurante no ve ningún contador (son del equipo) y un miembro de
--     otro espacio tampoco.
--   · un trabajo publicado no sale: su contador está parado y contarlo
--     entre los que pueden vencer sería contar dos veces algo hecho.
--   · **RN-ASG-17 y CA-01** · `space_team_load()` devuelve el equipo entero
--     a quien puede asignar trabajos, solo la propia fila a quien no, y
--     una excepción a quien no es del espacio.
--   · **CLAUDE.md** · ninguna de las dos funciones está abierta a `anon`.
--
-- Mismo patrón que las demás suites: bloques `do $$ ... end $$` que lanzan
-- una excepción real si algo no es lo esperado, cambio de identidad con
-- `set role authenticated`, y limpieza propia al final.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/inicio_del_espacio.sql

-- ============================================================
-- Fixture: un espacio con propietario, trabajador y restaurante; un plan
-- de 48 h; una solicitud aceptada con 24 h CONGELADAS (para que se note la
-- diferencia entre el plazo del plan y el que se aceptó); dos trabajos, uno
-- vivo con su T2 en marcha y otro ya publicado. Y un segundo espacio ajeno
-- con su propio miembro.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('e0000000-0000-0000-0000-000000000001', 'inicio-owner@example.com', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000002', 'inicio-worker@example.com', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000003', 'inicio-client@example.com', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000004', 'inicio-ajeno@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'Espacio Inicio', 'espacio-inicio-test', 'e0000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000002', 'Espacio Inicio ajeno', 'espacio-inicio-ajeno', 'e0000000-0000-0000-0000-000000000004');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'worker', 'active'),
  ('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004', 'owner', 'active');

-- Básico: 48 h de plazo de inicio (RN-SLA-02). La solicitud de abajo se
-- aceptó con 24, y esa es la que tiene que ganar.
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Basico Inicio', 9900, 4, 2, 0, 0, 48);

insert into public.groups (id, space_id, name) values
  ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Grupo Inicio');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('e4000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'EST-INI-A', 'Restaurante Inicio', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('e4000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'local_owner');

insert into public.subscriptions (id, space_id, establishment_id, kind, plan_id, status, started_at) values
  ('e5000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'plan', 'e2000000-0000-0000-0000-000000000001', 'active', now());

insert into public.requests (id, space_id, establishment_id, code, state, description, created_by, validated_category, accepted_at, accepted_start_sla_hours) values
  ('e6000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'SOL-INI-1', 'accepted', 'Cambiar el horario del sabado', 'e0000000-0000-0000-0000-000000000003', 'small', now(), 24),
  ('e6000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'SOL-INI-2', 'published', 'Actualizar la carta', 'e0000000-0000-0000-0000-000000000003', 'small', now(), 24);

insert into public.jobs (id, space_id, establishment_id, request_id, code, state, category) values
  ('e7000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', 'TRA-INI-1', 'assigned', 'small'),
  ('e7000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000002', 'TRA-INI-2', 'published', 'small');

insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at) values
  ('e1000000-0000-0000-0000-000000000001', 't2', 'job', 'e7000000-0000-0000-0000-000000000001', 'started', now() - interval '3 hours'),
  ('e1000000-0000-0000-0000-000000000001', 't2', 'job', 'e7000000-0000-0000-0000-000000000002', 'started', now() - interval '9 hours'),
  ('e1000000-0000-0000-0000-000000000001', 't2', 'job', 'e7000000-0000-0000-0000-000000000002', 'stopped', now() - interval '8 hours');

-- ============================================================
-- RN-COM-15/17 · el plazo congelado se puede leer, la identidad no.
-- ============================================================
do $$
begin
  if not has_column_privilege('authenticated', 'public.requests', 'accepted_start_sla_hours', 'select') then
    raise exception 'INICIO FALLIDO: authenticated no puede leer requests.accepted_start_sla_hours'
      using errcode = 'assert_failure';
  end if;

  -- El privilegio de columna de `requests` existe para tapar la IDENTIDAD
  -- del equipo (CLAUDE.md MUST NOT). Conceder un número de horas no puede
  -- haber abierto de paso quién validó o quién rechazó.
  if has_column_privilege('authenticated', 'public.requests', 'validated_by', 'select')
     or has_column_privilege('authenticated', 'public.requests', 'rejected_by', 'select') then
    raise exception 'CLAUDE.md FALLIDO: la identidad del equipo se lee en requests'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- El equipo ve los contadores vivos, con el plazo que se aceptó.
-- ============================================================
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_filas integer;
  v_horas integer;
  v_publicado integer;
begin
  select count(*) into v_filas
  from public.space_job_counters('e1000000-0000-0000-0000-000000000001');

  if v_filas <> 1 then
    raise exception 'INICIO FALLIDO: el propietario ve % contadores, esperaba 1', v_filas
      using errcode = 'assert_failure';
  end if;

  select start_sla_hours into v_horas
  from public.space_job_counters('e1000000-0000-0000-0000-000000000001')
  where job_id = 'e7000000-0000-0000-0000-000000000001';

  -- RN-COM-15/17: manda el plazo congelado al aceptar (24 h), no el del
  -- plan vigente (48 h). Si esto devolviera 48, un cambio de plan estaría
  -- reescribiendo hacia atrás un plazo ya aceptado.
  if v_horas is distinct from 24 then
    raise exception 'RN-COM-17 FALLIDO: el plazo es % en vez del congelado 24', v_horas
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_publicado
  from public.space_job_counters('e1000000-0000-0000-0000-000000000001')
  where job_id = 'e7000000-0000-0000-0000-000000000002';

  if v_publicado <> 0 then
    raise exception 'INICIO FALLIDO: un trabajo publicado sigue contando como proximo a vencer'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ASG-17 y CA-01 · la carga del equipo, según quién pregunte.
-- ============================================================
do $$
declare
  v_filas integer;
begin
  select count(*) into v_filas from public.space_team_load('e1000000-0000-0000-0000-000000000001');
  if v_filas <> 2 then
    raise exception 'INICIO FALLIDO: el propietario ve % cargas, esperaba 2', v_filas
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_filas integer;
  v_quien uuid;
begin
  -- Un trabajador no tiene `assign_jobs`: ve la suya y nada más. §20.4 le
  -- promete "Mi trabajo", no el de los demás.
  select count(*) into v_filas from public.space_team_load('e1000000-0000-0000-0000-000000000001');
  if v_filas <> 1 then
    raise exception 'CA-01 FALLIDO: un trabajador ve % cargas, esperaba solo la suya', v_filas
      using errcode = 'assert_failure';
  end if;

  select user_id into v_quien from public.space_team_load('e1000000-0000-0000-0000-000000000001');
  if v_quien <> 'e0000000-0000-0000-0000-000000000002' then
    raise exception 'CA-01 FALLIDO: la carga que ve un trabajador no es la suya'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- El restaurante no ve contadores: son organización del equipo (P7).
-- ============================================================
reset role;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_filas integer;
begin
  select count(*) into v_filas
  from public.space_job_counters('e1000000-0000-0000-0000-000000000001');
  if v_filas <> 0 then
    raise exception 'P7 FALLIDO: el restaurante ve % contadores del equipo', v_filas
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.space_team_load('e1000000-0000-0000-0000-000000000001');
    raise exception 'CA-01 FALLIDO: el restaurante ha podido pedir la carga del equipo'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null; -- La negativa esperada.
  end;
end $$;

-- ============================================================
-- Un miembro de OTRO espacio tampoco: el aislamiento no lo decide el
-- parámetro que le pasen a la función, lo decide RLS.
-- ============================================================
reset role;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_filas integer;
begin
  select count(*) into v_filas
  from public.space_job_counters('e1000000-0000-0000-0000-000000000001');
  if v_filas <> 0 then
    raise exception 'CA-02 FALLIDO: un miembro de otro espacio ve % contadores ajenos', v_filas
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- CLAUDE.md · quién puede llamarlas por RPC.
-- ============================================================
reset role;

do $$
begin
  if not has_function_privilege('authenticated', 'public.space_job_counters(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.space_team_load(uuid)', 'execute') then
    raise exception 'INICIO FALLIDO: el equipo no puede ejecutar las funciones del Inicio'
      using errcode = 'assert_failure';
  end if;

  -- Revocar solo a PUBLIC no cierra nada en Supabase (CLAUDE.md): sin
  -- sesión no se llama a ninguna de las dos.
  if has_function_privilege('anon', 'public.space_job_counters(uuid)', 'execute')
     or has_function_privilege('anon', 'public.space_team_load(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: las funciones del Inicio estan abiertas a anon'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id in (
  'e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002');
delete from public.spaces where id in (
  'e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002');
delete from auth.users where id in (
  'e0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000003',
  'e0000000-0000-0000-0000-000000000004'
);

select 'inicio_del_espacio.sql: §20.4, RN-COM-17, RN-ASG-17, CA-01, CA-02 y P7 cumplidos, base de datos limpia' as resultado;
