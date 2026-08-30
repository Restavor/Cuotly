-- Verificación de los criterios de aceptación CA-01, CA-02 y CA-16 del
-- Hito 2, con consultas directas a la base de datos usando identidades
-- simuladas (tal como exige la propia redacción de CA-02). No usa la API
-- HTTP de Supabase ni el cliente JS: prueba las políticas RLS en el sitio
-- donde viven, la base de datos.
--
-- Cómo ejecutarlo:
--   - Con la CLI de Supabase conectada al proyecto: pega este archivo en
--     el SQL Editor del panel de Supabase, o `psql "$DATABASE_URL" -f
--     supabase/tests/hito2_permisos.sql`.
--   - Desde una sesión de Claude Code con el conector de Supabase activo:
--     pégalo por partes con la herramienta execute_sql.
--
-- El script crea usuarios y espacios de prueba, comprueba los tres
-- criterios, e imprime cuánto queda al final (debe ser todo cero: no deja
-- basura en la base de datos real).
--
-- Verificado por última vez el 30/08/2026 contra el proyecto real de
-- Supabase de Cuotly. Resultado: los tres criterios se cumplen.

-- ============================================================
-- Preparación: dos espacios ("A" y "B"), cada uno con su propietario, y
-- un trabajador en el espacio A.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('a0000000-0000-0000-0000-000000000001', 'test-a@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000002', 'test-b@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000003', 'test-worker@example.com', 'authenticated', 'authenticated');

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

insert into public.establishments (space_id, group_id, name) values
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Restaurante A'),
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Restaurante B');

insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'test.seed', 'space', 'b0000000-0000-0000-0000-000000000001');

-- ============================================================
-- CA-02 · "Un usuario de un espacio no puede leer ni una sola fila de
-- otro espacio, verificado con consultas directas a la base de datos
-- usando su identidad."
--
-- También es, literalmente, el test que pidió Bosco: "un test que
-- intente leer datos de otro espacio con identidad ajena y compruebe que
-- falla".
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select * from (
  select 1 as orden, 'CA-02 · leer spaces de B (ajeno)' as test, count(*) as filas_visibles, 0 as esperado from public.spaces where slug = 'espacio-b-test'
  union all
  select 2, 'CA-02 · leer establishments de B (ajeno)', count(*), 0 from public.establishments where space_id = 'b0000000-0000-0000-0000-000000000002'
  union all
  select 3, 'CA-02 · leer groups de B (ajeno)', count(*), 0 from public.groups where space_id = 'b0000000-0000-0000-0000-000000000002'
  union all
  select 4, 'CA-02 · leer space_memberships de B (ajeno)', count(*), 0 from public.space_memberships where space_id = 'b0000000-0000-0000-0000-000000000002'
  union all
  select 5, 'control · leer su propio espacio A', count(*), 1 from public.spaces where slug = 'espacio-a-test'
  union all
  select 6, 'control · leer su propio establishment A', count(*), 1 from public.establishments where space_id = 'b0000000-0000-0000-0000-000000000001'
) t
order by orden;

reset role;

-- ============================================================
-- CA-01 · "Un usuario sin permiso no puede ejecutar la operación ni por
-- URL directa, ni por llamada a la API, ni manipulando el cliente."
--
-- Dos filas relevantes de la matriz de permisos: un Trabajador no puede
-- crear un establecimiento (RN-EST-02) ni invitar a nadie (PRD §4.2).
-- Ambos INSERT deben fallar con "row-level security policy" — si en vez
-- de fallar se ejecutan, este script se detiene aquí con el error real.
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
set local role authenticated;

insert into public.establishments (space_id, group_id, name)
values ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Intento no autorizado');
-- Esperado: ERROR 42501 "new row violates row-level security policy for table establishments"

insert into public.space_invitations (space_id, email, role, invited_by)
values ('b0000000-0000-0000-0000-000000000001', 'nuevo@example.com', 'worker', 'a0000000-0000-0000-0000-000000000003');
-- Esperado: ERROR 42501 "new row violates row-level security policy for table space_invitations"

reset role;

-- Control positivo: el propietario SÍ puede hacer lo mismo. Confirma que
-- la política no bloquea a quien sí tiene el permiso.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
set local role authenticated;

insert into public.establishments (space_id, group_id, name)
values ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Creado por el propietario')
returning code, name;
-- Esperado: una fila, con un código EST-000N correlativo.

reset role;

-- ============================================================
-- CA-16 · "Ninguna operación de la aplicación puede editar o borrar una
-- fila de auditoría."
-- ============================================================
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
set local role authenticated;

with intento_editar as (
  update public.audit_log
  set reason = 'manipulado'
  where space_id = 'b0000000-0000-0000-0000-000000000001'
  returning id
),
intento_borrar as (
  delete from public.audit_log
  where space_id = 'b0000000-0000-0000-0000-000000000001'
  returning id
)
select
  (select count(*) from intento_editar) as filas_editadas_esperado_0,
  (select count(*) from intento_borrar) as filas_borradas_esperado_0,
  (select count(*) from public.audit_log where space_id = 'b0000000-0000-0000-0000-000000000001') as filas_que_siguen_ahi_esperado_1;

reset role;

-- ============================================================
-- Limpieza: no deja nada de esto en la base de datos real. El orden
-- importa por las claves foráneas (audit_log → spaces → auth.users).
-- ============================================================
delete from public.audit_log where space_id in (
  select id from public.spaces where slug in ('espacio-a-test', 'espacio-b-test')
);
delete from public.spaces where slug in ('espacio-a-test', 'espacio-b-test');
delete from auth.users where id in (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003'
);

select
  (select count(*) from public.spaces) as spaces_deben_ser_0,
  (select count(*) from public.profiles) as profiles_deben_ser_0,
  (select count(*) from auth.users) as auth_users_deben_ser_0;
