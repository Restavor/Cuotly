-- Compartir con el restaurante (RN-ARC-04) contra la base de datos real,
-- desde la pantalla que ahora lo usa: el bloque Archivos de la ficha
-- (§15.2, Gestión) y el catálogo del restaurante en su propia pantalla.
--
-- Lo que ya estaba probado y NO se repite aquí: que `share_file_with_client()`
-- exija `manage_files`, que un archivo interno no lo vea el restaurante y
-- que compartirlo lo haga visible. Eso lo comprueba
-- `hito7_mensajes_archivos_finanzas.sql` desde el Hito 7. Lo que se
-- comprueba aquí es lo que las dos pantallas nuevas apoyan encima, y una
-- cosa del Hito 7 que estaba a medias:
--
--   · **La idempotencia era vacua.** El Hito 7 llama dos veces a
--     `share_file_with_client()` y no comprueba nada después: si la
--     segunda llamada escribiera un segundo apunte de auditoría, aquel
--     test pasaría igual. Aquí se cuentan los apuntes. Importa porque el
--     botón de la ficha se puede pulsar dos veces (CLAUDE.md: pulsar dos
--     veces nunca duplica el efecto).
--   · **La consulta que hace la pantalla del restaurante**, tal cual:
--     columnas enumeradas, y solo lo compartido. Y su reverso, que es el
--     motivo de enumerarlas: `select *` sobre `files` devuelve error de
--     privilegios (CLAUDE.md), así que una pantalla que lo hiciera se
--     rompería para todo el mundo.
--   · **RN-FIN-07 en ese catálogo**: un editor sin visibilidad financiera
--     no ve la facturación compartida, aunque esté marcada como
--     compartida con el restaurante.
--   · **RN-ARC-05 por la puerta de compartir**: un trabajador no puede
--     compartir lo que no puede ver.
--   · **`files` no tiene ninguna política de UPDATE**, así que la
--     visibilidad no se mueve por PostgREST: solo por la función, que es
--     la que audita. Es lo que sostiene el "y queda auditado" de la regla.
--   · **La migración 56**: las siete funciones que escriben archivos ya no
--     son ejecutables por `anon`, y siguen siéndolo por `authenticated`.
--
-- Mismo patrón que las demás suites: bloques `do $$ ... end $$` que lanzan
-- una excepción real si algo no es lo esperado, cambio de identidad con
-- `set role authenticated`, y limpieza propia al final.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/compartir_con_el_restaurante.sql

-- ============================================================
-- Fixture: un espacio con propietario y una trabajadora autorizada, un
-- restaurante con dos identidades de cliente —el propietario local y un
-- editor SIN visibilidad financiera, que es lo que separa RN-FIN-07— y
-- tres archivos: dos internos del equipo y una factura compartida.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('ac000000-0000-0000-0000-000000000001', 'arc-owner@example.com', 'authenticated', 'authenticated'),
  ('ac000000-0000-0000-0000-000000000002', 'arc-ana@example.com', 'authenticated', 'authenticated'),
  ('ac000000-0000-0000-0000-000000000003', 'arc-client@example.com', 'authenticated', 'authenticated'),
  ('ac000000-0000-0000-0000-000000000004', 'arc-editor@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('ac100000-0000-0000-0000-000000000001', 'Espacio Compartir', 'espacio-compartir-test', 'ac000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('ac100000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('ac100000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('ac300000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000001', 'Grupo Compartir');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('ac400000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000001', 'ac300000-0000-0000-0000-000000000001', 'EST-ARC-A', 'Restaurante Compartir');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('ac500000-0000-0000-0000-000000000001', 'ac400000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000003', 'local_owner'),
  ('ac500000-0000-0000-0000-000000000002', 'ac400000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000004', 'editor');

-- RN-FIN-07: el editor puede editar datos y NO ve facturación.
insert into public.establishment_permissions (establishment_membership_id, edit_establishment_data, view_billing) values
  ('ac500000-0000-0000-0000-000000000002', true, false);

-- RN-ASG-01: Ana tiene este restaurante autorizado, que es lo que le deja
-- ver sus archivos operativos (y solo esos).
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('ac100000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002', 'ac400000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001');

create temporary table arc_ctx (key text primary key, value text);
grant select, insert on arc_ctx to authenticated, service_role;

select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  insert into arc_ctx values ('documento', public.register_file(
    'ac400000-0000-0000-0000-000000000001', 'documents', 'Textos de la web',
    'arc/textos.docx', 'textos.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 40000,
    'internal')::text);

  insert into arc_ctx values ('foto', public.register_file(
    'ac400000-0000-0000-0000-000000000001', 'photos', 'Fachada retocada',
    'arc/fachada.png', 'fachada.png', 'image/png', 120000, 'internal')::text);

  -- Una factura YA compartida: sirve para RN-FIN-07, no para compartir.
  insert into arc_ctx values ('factura', public.register_file(
    'ac400000-0000-0000-0000-000000000001', 'billing', 'Factura de septiembre',
    'arc/factura.pdf', 'factura.pdf', 'application/pdf', 50000, 'shared_with_client')::text);
end $$;

reset role;

-- ============================================================
-- La consulta de la pantalla del restaurante, tal cual la escribe: solo
-- lo compartido, y con las columnas enumeradas.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_filas integer;
begin
  -- Antes de compartir nada, el catálogo del restaurante tiene solo su
  -- factura: los dos archivos internos del equipo no están.
  select count(*) into v_filas
  from (select id, name, category, created_at from public.files
        where establishment_id = 'ac400000-0000-0000-0000-000000000001') t;

  if v_filas <> 1 then
    raise exception 'RN-ARC-04 FALLIDO: el restaurante ve % archivos y solo debería ver la factura compartida', v_filas
      using errcode = 'assert_failure';
  end if;
end $$;

-- El reverso, y el motivo de enumerar columnas en todas las pantallas
-- (CLAUDE.md): `files` tiene privilegios de columna, así que `select *`
-- NO devuelve menos columnas — falla entero. Una pantalla que lo hiciera
-- se rompería para todo el mundo, no solo para el cliente.
do $$
declare
  v_falla boolean := false;
begin
  begin
    perform * from public.files where establishment_id = 'ac400000-0000-0000-0000-000000000001';
  exception
    when insufficient_privilege then v_falla := true;
  end;

  if not v_falla then
    raise exception 'CLAUDE.md FALLIDO: `select *` sobre files no da error de privilegios; las columnas de identidad están concedidas'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-ARC-04 · el botón de la ficha: la trabajadora comparte, y pulsar dos
-- veces no duplica nada (CLAUDE.md: idempotencia de las operaciones).
-- ============================================================
select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_file uuid := (select value::uuid from arc_ctx where key = 'documento');
begin
  perform public.share_file_with_client(v_file);
  perform public.share_file_with_client(v_file);
end $$;

reset role;

do $$
declare
  v_file uuid := (select value::uuid from arc_ctx where key = 'documento');
  v_apuntes integer;
  v_visibilidad text;
begin
  select count(*) into v_apuntes from public.audit_log
  where action = 'file.shared_with_client' and entity_id = v_file;

  -- Uno, no dos: la segunda llamada sale por el `return` de la función
  -- antes de escribir. Sin esta cuenta, la comprobación del Hito 7 —que
  -- llama dos veces y no mira nada— pasaría igual con la idempotencia rota.
  if v_apuntes <> 1 then
    raise exception 'RN-ARC-04 FALLIDO: compartir dos veces dejó % apuntes de auditoría, esperaba 1', v_apuntes
      using errcode = 'assert_failure';
  end if;

  -- Y el apunte dice de qué a qué, que es lo que pide CLAUDE.md de todo
  -- cambio de estado: actor, valor anterior y valor nuevo.
  if not exists (
    select 1 from public.audit_log
    where action = 'file.shared_with_client' and entity_id = v_file
      and actor_id = 'ac000000-0000-0000-0000-000000000002'
      and old_value ->> 'visibility' = 'internal'
      and new_value ->> 'visibility' = 'shared_with_client'
  ) then
    raise exception 'RN-ARC-04/CA-16 FALLIDO: el apunte de compartir no lleva actor, valor anterior y valor nuevo'
      using errcode = 'assert_failure';
  end if;

  select visibility into v_visibilidad from public.files where id = v_file;
  if v_visibilidad <> 'shared_with_client' then
    raise exception 'RN-ARC-04 FALLIDO: el archivo quedó en visibilidad %', v_visibilidad
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- El otro extremo: el restaurante ya lo tiene en su catálogo, con su
-- versión vigente (que es lo que descarga /api/archivos/<id>).
-- ============================================================
select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_file uuid := (select value::uuid from arc_ctx where key = 'documento');
  v_filas integer;
  v_versiones integer;
begin
  select count(*) into v_filas
  from (select id, name, category, created_at from public.files
        where establishment_id = 'ac400000-0000-0000-0000-000000000001') t;

  if v_filas <> 2 then
    raise exception 'RN-ARC-04 FALLIDO: tras compartir, el restaurante ve % archivos, esperaba 2', v_filas
      using errcode = 'assert_failure';
  end if;

  -- La foto sigue siendo interna: compartir uno no comparte el resto.
  if exists (select 1 from public.files where id = (select value::uuid from arc_ctx where key = 'foto')) then
    raise exception 'RN-ARC-04 FALLIDO: compartir un archivo dejó visible otro que seguía siendo interno'
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_versiones
  from (select id, version_number, file_name, mime_type, size_bytes, created_at
        from public.file_versions where file_id = v_file) t;

  if v_versiones <> 1 then
    raise exception 'RN-ARC-04 FALLIDO: el restaurante ve % versiones del archivo compartido, esperaba 1', v_versiones
      using errcode = 'assert_failure';
  end if;
end $$;

-- El cliente no comparte: quien decide qué sale del equipo es el equipo
-- (RN-ARC-04 habla del trabajador). Aquí lo intenta sobre la foto, que
-- ni siquiera puede ver.
do $$
declare
  v_prohibido boolean := false;
begin
  begin
    perform public.share_file_with_client((select value::uuid from arc_ctx where key = 'foto'));
  exception
    when others then v_prohibido := true;
  end;

  if not v_prohibido then
    raise exception 'RN-ARC-04 FALLIDO: el restaurante se compartió a sí mismo un archivo interno del equipo'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-FIN-07 · el mismo catálogo, con un editor sin visibilidad
-- financiera: la factura compartida no es para él.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_filas integer;
begin
  select count(*) into v_filas
  from (select id, name, category, created_at from public.files
        where establishment_id = 'ac400000-0000-0000-0000-000000000001') t;

  -- Ve el documento compartido y NO la factura.
  if v_filas <> 1 then
    raise exception 'RN-FIN-07 FALLIDO: el editor sin visibilidad financiera ve % archivos, esperaba 1', v_filas
      using errcode = 'assert_failure';
  end if;

  if exists (select 1 from public.files where id = (select value::uuid from arc_ctx where key = 'factura')) then
    raise exception 'RN-FIN-07 FALLIDO: un editor sin visibilidad financiera ve la facturación compartida'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-ARC-05 · un trabajador no comparte lo que no puede ver. La
-- facturación no es suya ni para leerla ni para enseñársela a nadie.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_factura uuid := (select value::uuid from arc_ctx where key = 'factura');
  v_prohibido boolean := false;
begin
  begin
    perform public.share_file_with_client(v_factura);
  exception
    when others then v_prohibido := true;
  end;

  if not v_prohibido then
    raise exception 'RN-ARC-05 FALLIDO: un trabajador compartió un archivo de facturación'
      using errcode = 'assert_failure';
  end if;

  if exists (select 1 from public.files where id = v_factura) then
    raise exception 'RN-ARC-05 FALLIDO: un trabajador ve un archivo de facturación'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- "Y queda auditado" solo se sostiene si no hay otra puerta: `files` no
-- tiene ninguna política de UPDATE, así que la visibilidad no se puede
-- mover por PostgREST sin pasar por la función que audita. En falso
-- cerrado: si alguien le añade una política de UPDATE, este test falla y
-- tendrá que explicar por qué.
-- ============================================================
do $$
declare
  v_politicas text;
begin
  select string_agg(polname, ', ') into v_politicas
  from pg_policy
  where polrelid = 'public.files'::regclass and polcmd in ('w', '*');

  if v_politicas is not null then
    raise exception 'RN-ARC-04 FALLIDO: files tiene política(s) de UPDATE (%), así que la visibilidad se puede cambiar sin auditar',
      v_politicas using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Migración 56 · las siete funciones que ESCRIBEN archivos no se llaman
-- sin sesión. Revocar solo a PUBLIC no cierra nada en Supabase
-- (CLAUDE.md), así que se comprueba `anon` explícitamente.
-- ============================================================
do $$
declare
  v_fn text;
  v_abiertas text := '';
  v_cerradas text := '';
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'Sin rol authenticated: se omite la comprobación de privilegios';
    return;
  end if;

  foreach v_fn in array array[
    'public.share_file_with_client(uuid)',
    'public.register_file(uuid, text, text, text, text, text, bigint, text, text, text)',
    'public.add_file_version(uuid, text, text, text, bigint, text, text)',
    'public.archive_file(uuid, text)',
    'public.request_file_permanent_deletion(uuid, text)',
    'public.attach_file_to_message(uuid, uuid)',
    'public.upload_payment_receipt(uuid, uuid, text)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      v_abiertas := v_abiertas || ' ' || v_fn;
    end if;
    -- Y la positiva, que sin ella la negativa se cumpliría también
    -- revocándoselas a todo el mundo y rompiendo las dos pantallas.
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      v_cerradas := v_cerradas || ' ' || v_fn;
    end if;
  end loop;

  if v_abiertas <> '' then
    raise exception 'CLAUDE.md FALLIDO: funciones de escritura de archivos abiertas a anon:%', v_abiertas
      using errcode = 'assert_failure';
  end if;

  if v_cerradas <> '' then
    raise exception 'FALLIDO: authenticated no puede escribir archivos:%', v_cerradas
      using errcode = 'assert_failure';
  end if;

  -- `can_read_file()` está DENTRO de las políticas de RLS de files,
  -- file_versions y file_links, y PostgreSQL las evalúa con los
  -- privilegios de quien consulta: si se le revoca a `authenticated`, las
  -- tres tablas dejan de leerse (CLAUDE.md, excepción de la migración 32).
  if not has_function_privilege('authenticated', 'public.can_read_file(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: can_read_file() sin EXECUTE para authenticated rompe las políticas de files'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id = 'ac100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'ac100000-0000-0000-0000-000000000001';
delete from auth.users where id in (
  'ac000000-0000-0000-0000-000000000001',
  'ac000000-0000-0000-0000-000000000002',
  'ac000000-0000-0000-0000-000000000003',
  'ac000000-0000-0000-0000-000000000004'
);
drop table if exists arc_ctx;

select 'compartir_con_el_restaurante.sql: RN-ARC-04, RN-ARC-05, RN-FIN-07 y la migración 56 cumplidos, base de datos limpia' as resultado;
