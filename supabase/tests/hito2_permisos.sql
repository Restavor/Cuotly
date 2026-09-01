-- Verificación de los criterios de aceptación CA-01, CA-02 y CA-16 del
-- Hito 2, más las reglas RN-DAT-03, RN-DAT-06 y RN-EST-03 corregidas tras
-- la auditoría del 30/08/2026, con consultas directas a la base de datos
-- usando identidades simuladas (tal como exige la propia redacción de
-- CA-02). No usa la API HTTP de Supabase ni el cliente JS: prueba las
-- políticas RLS en el sitio donde viven, la base de datos.
--
-- A diferencia de la versión anterior, cada comprobación usa un bloque
-- `do $$ ... end $$` que lanza una excepción real (RAISE EXCEPTION) si el
-- resultado no es el esperado. Esto hace que el script entero falle con
-- código de salida distinto de cero en cuanto una sola regla se rompe —
-- ya no depende de que una persona compare una columna "esperado" a ojo.
--
-- Cómo ejecutarlo:
--   - Automáticamente en CI (.github/workflows/ci.yml, job
--     "rls-tests"): `supabase start` levanta una base local con Docker,
--     aplica las migraciones, y este archivo se ejecuta con
--     `psql -v ON_ERROR_STOP=1`. Si algo falla, el job de CI falla.
--   - A mano contra el proyecto real: pégalo en el SQL Editor del panel
--     de Supabase, con `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f
--     supabase/tests/hito2_permisos.sql`, o con la herramienta
--     execute_sql si tienes el conector de Supabase activo en Claude Code.
--
-- El script crea sus propios usuarios y espacios de prueba y los borra al
-- final (comprobado con una aserción final de que no queda ningún rastro).
--
-- El cambio de identidad usa `set role authenticated` (sin LOCAL) seguido
-- de `reset role`, y `set_config(..., false)` (tampoco LOCAL) — nunca
-- `set local`. Corregido durante la auditoría del Hito 5: fuera de un
-- bloque de transacción explícito, `set local` no tiene ningún efecto
-- (PostgreSQL lo advierte y lo ignora) y `psql -f` ejecuta cada sentencia
-- de nivel superior como su propia transacción implícita, así que la
-- versión anterior de este archivo (con LOCAL) nunca cambiaba de
-- identidad de verdad al ejecutarse así — solo funcionaba por casualidad
-- cuando se pegaba a mano dentro de una transacción explícita (el SQL
-- Editor de Supabase, o la herramienta execute_sql). Mismo motivo y mismo
-- arreglo que ya documentaba hito4_solicitudes.sql.

-- ============================================================
-- Preparación: dos espacios ("A" y "B"). A tiene un propietario, un
-- trabajador, y un "cliente" (Propietario global de un grupo de A sin
-- pertenecer al espacio de mantenimiento — RN-EST-03).
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('a0000000-0000-0000-0000-000000000001', 'test-a@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000002', 'test-b@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000003', 'test-worker@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000004', 'test-cliente@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000005', 'test-editor@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('b0000000-0000-0000-0000-000000000001', 'Espacio A (test)', 'espacio-a-test', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'Espacio B (test)', 'espacio-b-test', 'a0000000-0000-0000-0000-000000000002');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'owner', 'active'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Grupo A'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Grupo B');

-- El código se da explícito (en vez de dejar que lo genere el trigger)
-- porque esta parte de la semilla se ejecuta como postgres, sin una
-- identidad autenticada todavía — set_establishment_code() llama a
-- next_space_sequence(), que desde el arreglo de RN-DAT-03 exige
-- is_space_member() (auth.uid()), y auth.uid() es null fuera de una
-- sesión autenticada. La generación real del código se prueba más abajo,
-- en el INSERT que sí hace el propietario autenticado (control positivo
-- de CA-01).
insert into public.establishments (id, space_id, group_id, code, name) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'EST-TEST-A', 'Restaurante A'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'EST-TEST-B', 'Restaurante B');

-- El "cliente" es Propietario global del grupo A, sin fila en
-- space_memberships (no es miembro del equipo de mantenimiento).
insert into public.group_memberships (group_id, user_id) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004');

insert into public.plans (id, space_id, name, price_cents, start_sla_hours) values
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Plan de prueba', 9900, 24);

insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'test.seed', 'space', 'b0000000-0000-0000-0000-000000000001');

-- ============================================================
-- CA-02 · "Un usuario de un espacio no puede leer ni una sola fila de
-- otro espacio, verificado con consultas directas a la base de datos
-- usando su identidad." También es, literalmente, el test que pidió
-- Bosco: "un test que intente leer datos de otro espacio con identidad
-- ajena y compruebe que falla".
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.spaces where slug = 'espacio-b-test';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de spaces de un espacio ajeno visibles (esperado 0)', v_count using errcode = 'assert_failure';
  end if;

  select count(*) into v_count from public.establishments where space_id = 'b0000000-0000-0000-0000-000000000002';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de establishments de un espacio ajeno visibles (esperado 0)', v_count using errcode = 'assert_failure';
  end if;

  select count(*) into v_count from public.groups where space_id = 'b0000000-0000-0000-0000-000000000002';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de groups de un espacio ajeno visibles (esperado 0)', v_count using errcode = 'assert_failure';
  end if;

  select count(*) into v_count from public.space_memberships where space_id = 'b0000000-0000-0000-0000-000000000002';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de space_memberships de un espacio ajeno visibles (esperado 0)', v_count using errcode = 'assert_failure';
  end if;

  select count(*) into v_count from public.spaces where slug = 'espacio-a-test';
  if v_count <> 1 then
    raise exception 'CA-02 control FALLIDO: no se pudo leer el propio espacio (esperado 1, encontrado %)', v_count using errcode = 'assert_failure';
  end if;

  select count(*) into v_count from public.establishments where space_id = 'b0000000-0000-0000-0000-000000000001';
  if v_count <> 1 then
    raise exception 'CA-02 control FALLIDO: no se pudo leer el propio establishment (esperado 1, encontrado %)', v_count using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CA-01 · "Un usuario sin permiso no puede ejecutar la operación ni por
-- URL directa, ni por llamada a la API, ni manipulando el cliente."
--
-- Dos filas de la matriz de permisos: un Trabajador no puede crear un
-- establecimiento (RN-EST-02) ni invitar a nadie (PRD §4.2). Ambos INSERT
-- deben fallar con SQLSTATE 42501 (insufficient_privilege / RLS). Si en
-- vez de fallar se ejecutan, el bloque los detecta y lanza su propia
-- excepción con el motivo.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    insert into public.establishments (space_id, group_id, name)
    values ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Intento no autorizado');
    raise exception 'CA-01 FALLIDO: un Trabajador pudo crear un establecimiento sin permiso (RN-EST-02)' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then
      null; -- esperado
  end;

  begin
    insert into public.space_invitations (space_id, email, role, invited_by)
    values ('b0000000-0000-0000-0000-000000000001', 'nuevo@example.com', 'worker', 'a0000000-0000-0000-0000-000000000003');
    raise exception 'CA-01 FALLIDO: un Trabajador pudo invitar a alguien sin permiso (PRD §4.2)' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then
      null; -- esperado
  end;
end $$;

reset role;

-- Control positivo: el propietario SÍ puede crear un establecimiento, y
-- recibe un código EST-000N correlativo. Confirma que la política no
-- bloquea a quien sí tiene el permiso.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_code text;
begin
  insert into public.establishments (space_id, group_id, name)
  values ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Creado por el propietario')
  returning code into v_code;

  if v_code !~ '^EST-\d{4}$' then
    raise exception 'CA-01 control positivo FALLIDO: código inesperado "%"', v_code using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-DAT-03 · next_space_sequence() debe rechazar a quien no pertenece al
-- espacio, aunque llame a la función directamente por RPC en vez de pasar
-- por el INSERT de establishments (hallazgo de la auditoría del
-- 30/08/2026: antes del arreglo, esta llamada mutaba el contador de un
-- espacio ajeno).
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform public.next_space_sequence('b0000000-0000-0000-0000-000000000002', 'establishment');
    raise exception 'RN-DAT-03 FALLIDO: un usuario ajeno al espacio B pudo mutar su contador vía RPC directa' using errcode = 'assert_failure';
  exception
    when raise_exception then
      null; -- esperado: next_space_sequence() lanza 'No perteneces a este espacio'
  end;
end $$;

reset role;

-- ============================================================
-- RN-DAT-06 / MUST NOT de CLAUDE.md ("no se borra físicamente un registro
-- de negocio") · un propietario no puede borrar un plan por DELETE
-- directo, ni con permiso de escritura. Sin política de DELETE, RLS
-- descarta la fila en vez de devolver un error: se comprueba con el
-- recuento de filas afectadas.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_deleted int;
  v_remaining int;
begin
  with intento_borrar as (
    delete from public.plans where id = 'e0000000-0000-0000-0000-000000000001'
    returning id
  )
  select count(*) into v_deleted from intento_borrar;

  select count(*) into v_remaining from public.plans where id = 'e0000000-0000-0000-0000-000000000001';

  if v_deleted <> 0 or v_remaining <> 1 then
    raise exception 'RN-DAT-06 FALLIDO: borradas=% (esperado 0), restantes=% (esperado 1)', v_deleted, v_remaining using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-EST-03 · el Propietario global de un grupo (lado cliente, sin fila
-- en space_memberships) debe poder leer su grupo y sus establecimientos,
-- aunque no pertenezca al espacio de mantenimiento. Y sigue sin poder ver
-- el espacio en sí (eso es del equipo de mantenimiento, no del cliente).
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.groups where id = 'c0000000-0000-0000-0000-000000000001';
  if v_count <> 1 then
    raise exception 'RN-EST-03 FALLIDO: el Propietario global no pudo leer su propio grupo (esperado 1, encontrado %)', v_count using errcode = 'assert_failure';
  end if;

  select count(*) into v_count from public.establishments where group_id = 'c0000000-0000-0000-0000-000000000001';
  if v_count <> 2 then
    raise exception 'RN-EST-03 FALLIDO: el Propietario global no pudo leer los establecimientos de su grupo (esperado 2, encontrado %)', v_count using errcode = 'assert_failure';
  end if;

  select count(*) into v_count from public.spaces where id = 'b0000000-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'RN-EST-03 control FALLIDO: el Propietario global pudo leer el espacio de mantenimiento (esperado 0, encontrado %)', v_count using errcode = 'assert_failure';
  end if;

  select count(*) into v_count from public.groups where id = 'c0000000-0000-0000-0000-000000000002';
  if v_count <> 0 then
    raise exception 'RN-EST-03 control FALLIDO: el Propietario global pudo leer un grupo ajeno (esperado 0, encontrado %)', v_count using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CA-16 · "Ninguna operación de la aplicación puede editar o borrar una
-- fila de auditoría."
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_updated int;
  v_deleted int;
  v_remaining int;
begin
  with intento_editar as (
    update public.audit_log
    set reason = 'manipulado'
    where space_id = 'b0000000-0000-0000-0000-000000000001'
    returning id
  )
  select count(*) into v_updated from intento_editar;

  with intento_borrar as (
    delete from public.audit_log
    where space_id = 'b0000000-0000-0000-0000-000000000001'
    returning id
  )
  select count(*) into v_deleted from intento_borrar;

  select count(*) into v_remaining from public.audit_log where space_id = 'b0000000-0000-0000-0000-000000000001';

  if v_updated <> 0 or v_deleted <> 0 or v_remaining <> 1 then
    raise exception 'CA-16 FALLIDO: editadas=% (esperado 0), borradas=% (esperado 0), restantes=% (esperado 1)', v_updated, v_deleted, v_remaining using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- Limpieza: no deja nada de esto en la base de datos real. El orden
-- importa por las claves foráneas (audit_log / plans / establishments →
-- spaces → auth.users). Se ejecuta con el rol postgres (sin RLS) para no
-- depender de ninguna política de DELETE.
-- ============================================================
-- ============================================================
-- RN-EST-04 · "un Editor puede asignarse a uno, varios, todos los
-- actuales, o todos los actuales **y futuros**".
--
-- Lo último solo se expresa a nivel de grupo, y `group_memberships` tenía
-- `check (role = 'global_owner')`: para un Editor no existía la forma.
-- ============================================================
reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  insert into public.group_memberships (group_id, user_id, role)
  values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'editor');
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  -- "Todos los actuales": el establecimiento que ya existe en el grupo.
  if not public.can_write_establishment('d0000000-0000-0000-0000-000000000001') then
    raise exception 'RN-EST-04 FALLIDO: un Editor de grupo no puede escribir en un establecimiento del grupo'
      using errcode = 'assert_failure';
  end if;

  -- Y no se le cuela lo ajeno (CA-02).
  if public.can_write_establishment('d0000000-0000-0000-0000-000000000002') then
    raise exception 'CA-02 FALLIDO: un Editor de grupo escribe en el establecimiento de otro espacio'
      using errcode = 'assert_failure';
  end if;

  -- RN-EST-04 vs facturación: el Editor escribe, pero las cuentas son del
  -- propietario. Para el editor de UN establecimiento hace falta el
  -- permiso explícito `view_billing`; para el de grupo no hay ninguno.
  if public.client_can_view_billing('d0000000-0000-0000-0000-000000000001') then
    raise exception 'RN-EST-04 FALLIDO: un Editor de grupo ve la facturación sin permiso explícito'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- "Y futuros": un establecimiento creado DESPUÉS en el mismo grupo queda
-- cubierto sin tocar nada. Ese es todo el sentido de la regla.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

insert into public.establishments (id, space_id, group_id, name) values
  ('d0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001', 'Restaurante Futuro');

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  if not public.can_write_establishment('d0000000-0000-0000-0000-000000000009') then
    raise exception 'RN-EST-04 FALLIDO: el Editor de grupo no alcanza a un establecimiento creado después'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-EST-05 · "al retirar un acceso desaparece de inmediato, pero la
-- actividad histórica permanece".
--
-- No existía: `establishment_memberships` y `group_memberships` no tenían
-- ninguna columna de revocación, borrar la fila lo prohíbe CLAUDE.md, y el
-- DELETE se lo tragaba RLS en silencio. El acceso de un cliente a un
-- restaurante era permanente.
-- ============================================================

-- Control positivo antes de retirar nada: el propietario global lee su
-- establecimiento y ve la facturación.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
begin
  if not public.can_read_establishment('d0000000-0000-0000-0000-000000000001') then
    raise exception 'FIXTURE RN-EST-05: el propietario global no leía su establecimiento; el test no probaría nada'
      using errcode = 'assert_failure';
  end if;
  if not public.client_can_view_billing('d0000000-0000-0000-0000-000000000001') then
    raise exception 'FIXTURE RN-EST-05: el propietario global no veía la facturación; el test no probaría nada'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Y la vía directa no existe: las columnas de revocación no se pueden
-- tocar con un UPDATE. Como en el arreglo de `establishments.status`, la
-- barrera es un privilegio de columna, no una convención.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  begin
    update public.group_memberships set revoked_at = now()
    where group_id = 'c0000000-0000-0000-0000-000000000001'
      and user_id = 'a0000000-0000-0000-0000-000000000004';
    raise exception 'RN-EST-05 FALLIDO: se retiró un acceso con un UPDATE directo, sin auditoría'
      using errcode = 'assert_failure';
  exception
    when insufficient_privilege then
      null;
  end;
end $$;

-- La vía buena sí, y deja rastro.
do $$
begin
  if not public.revoke_group_access(
       'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004',
       'El grupo cambia de manos') then
    raise exception 'RN-EST-05 FALLIDO: revoke_group_access() no retiró un acceso vivo'
      using errcode = 'assert_failure';
  end if;

  -- CA-17: pulsar dos veces produce un único efecto.
  if public.revoke_group_access(
       'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', null) then
    raise exception 'CA-17 FALLIDO: revocar dos veces el mismo acceso no fue idempotente'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'group_access.revoked'
      and entity_id = 'c0000000-0000-0000-0000-000000000001'
      and reason = 'El grupo cambia de manos'
  ) then
    raise exception 'CLAUDE.md MUST FALLIDO: retirar un acceso no dejó registro de auditoría'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- "Desaparece de inmediato": ya no lee nada.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
begin
  if public.can_read_establishment('d0000000-0000-0000-0000-000000000001') then
    raise exception 'RN-EST-05 FALLIDO: el acceso retirado sigue leyendo el establecimiento'
      using errcode = 'assert_failure';
  end if;
  if public.client_can_view_billing('d0000000-0000-0000-0000-000000000001') then
    raise exception 'RN-EST-05 FALLIDO: el acceso retirado sigue viendo la facturación'
      using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.establishments where id = 'd0000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'RN-EST-05 FALLIDO: el acceso retirado sigue viendo la fila del establecimiento'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- "Pero la actividad histórica permanece": la fila sigue ahí, con quién y
-- cuándo. CLAUDE.md prohíbe el borrado físico y RN-EST-05 pide el rastro.
do $$
begin
  if not exists (
    select 1 from public.group_memberships
    where group_id = 'c0000000-0000-0000-0000-000000000001'
      and user_id = 'a0000000-0000-0000-0000-000000000004'
      and revoked_at is not null
      and revoked_by = 'a0000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'RN-EST-05 FALLIDO: retirar el acceso borró el rastro en vez de marcarlo'
      using errcode = 'assert_failure';
  end if;
end $$;

-- Lo mismo por el lado del establecimiento, que es la otra tabla de
-- acceso del cliente.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'editor');

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
begin
  if not public.can_write_establishment('d0000000-0000-0000-0000-000000000001') then
    raise exception 'FIXTURE RN-EST-05: el editor no escribía; el test no probaría nada'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  if not public.revoke_establishment_access(
       'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'Deja de llevar la web') then
    raise exception 'RN-EST-05 FALLIDO: revoke_establishment_access() no retiró un acceso vivo'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
begin
  if public.can_write_establishment('d0000000-0000-0000-0000-000000000001') then
    raise exception 'RN-EST-05 FALLIDO: el acceso retirado sigue escribiendo en el establecimiento'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Y se le puede volver a dar sin borrar el rastro del anterior: la
-- unicidad es de los accesos VIVOS, no de todos los que hubo.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'consulta');

reset role;

do $$
begin
  if (select count(*) from public.establishment_memberships
      where establishment_id = 'd0000000-0000-0000-0000-000000000001'
        and user_id = 'a0000000-0000-0000-0000-000000000004') <> 2 then
    raise exception 'RN-EST-05 FALLIDO: volver a dar el acceso pisó el histórico en vez de añadirse'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

delete from public.audit_log where space_id in (
  select id from public.spaces where slug in ('espacio-a-test', 'espacio-b-test')
);
delete from public.plans where space_id in (
  select id from public.spaces where slug in ('espacio-a-test', 'espacio-b-test')
);
delete from public.spaces where slug in ('espacio-a-test', 'espacio-b-test');
delete from auth.users where id in (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000005'
);

do $$
declare
  v_spaces int;
  v_profiles int;
  v_users int;
begin
  select count(*) into v_spaces from public.spaces where slug in ('espacio-a-test', 'espacio-b-test');
  select count(*) into v_profiles from public.profiles where email like 'test-%@example.com';
  select count(*) into v_users from auth.users where email like 'test-%@example.com';

  if v_spaces <> 0 or v_profiles <> 0 or v_users <> 0 then
    raise exception 'LIMPIEZA FALLIDA: spaces=%, profiles=%, auth.users=% (todo debía ser 0)', v_spaces, v_profiles, v_users;
  end if;
end $$;

-- Si el script llega hasta aquí sin lanzar ninguna excepción, los seis
-- criterios/reglas se cumplen y no queda ningún dato de prueba.
select 'hito2_permisos.sql: todos los criterios cumplidos, base de datos limpia' as resultado;
