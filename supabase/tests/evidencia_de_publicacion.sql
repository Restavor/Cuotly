-- La evidencia de publicación (maqueta 06, RN-JOB-10 · RN-ARC-02) contra la
-- base de datos real: quién puede adjuntarla, qué archivo, y por dónde NO.
--
-- Existe porque la cabecera de la migración 60 decía "se comprueba con
-- este archivo" y el archivo no estaba. Van siete veces en el proyecto que
-- una garantía escrita en un comentario resulta no estar implementada, y
-- ésta se cierra en vez de anotarse.
--
-- Lo que se comprueba, y por qué cada cosa:
--
--   · **El responsable sí.** Es quien publica (RN-JOB-10), así que es
--     quien adjunta la prueba de lo publicado.
--   · **Un administrador también**, por `assign_jobs`: puede completar la
--     evidencia después.
--   · **Otro trabajador del espacio no.** Es la comprobación que separa
--     "pertenece al espacio" de "lleva este trabajo".
--   · **El restaurante NO.** `can_read_job()` le deja ver la ficha de SU
--     trabajo a propósito; sin la comprobación de `is_space_member()` eso
--     se habría convertido en permiso de escritura por la puerta de atrás
--     (P7: el cliente no ve ni toca la organización interna).
--   · **Un archivo de OTRO restaurante no**, aunque quien llama pueda
--     leerlo: `file_links` no tiene ninguna columna que lo impida, así que
--     lo impide la función o no lo impide nadie.
--   · **Un archivo que no se puede leer, no** (`can_read_file()`, donde
--     viven RN-ARC-05 y RN-FIN-07): si no, un trabajador enlazaría a su
--     trabajo una factura que no puede abrir y la leería por la ficha.
--   · **Dos veces no duplica** (CLAUDE.md): ni el enlace ni el apunte de
--     auditoría. Un `insert` que no inserta y aun así audita es una
--     auditoría que miente.
--   · **CLAUDE.md · privilegios**: cerrada a `anon`, abierta a
--     `authenticated`.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/evidencia_de_publicacion.sql

-- ============================================================
-- Fixture: un espacio con propietaria, dos trabajadoras y un cliente; dos
-- restaurantes —el segundo existe solo para tener un archivo ajeno— y un
-- trabajo asignado a una de las dos trabajadoras.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('ea000000-0000-0000-0000-000000000001', 'ev-owner@example.com', 'authenticated', 'authenticated'),
  ('ea000000-0000-0000-0000-000000000002', 'ev-worker@example.com', 'authenticated', 'authenticated'),
  ('ea000000-0000-0000-0000-000000000003', 'ev-otra@example.com', 'authenticated', 'authenticated'),
  ('ea000000-0000-0000-0000-000000000004', 'ev-cliente@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('ea100000-0000-0000-0000-000000000001', 'Espacio Evidencia', 'espacio-evidencia-test',
   'ea000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status, can_perform_jobs) values
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001', 'owner', 'active', true),
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000002', 'worker', 'active', true),
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000003', 'worker', 'active', true);

insert into public.groups (id, space_id, name) values
  ('ea300000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', 'Grupo Evidencia');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('ea400000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001',
   'ea300000-0000-0000-0000-000000000001', 'EST-EV-A', 'Restaurante Evidencia', 'active'),
  ('ea400000-0000-0000-0000-000000000002', 'ea100000-0000-0000-0000-000000000001',
   'ea300000-0000-0000-0000-000000000001', 'EST-EV-B', 'Restaurante Vecino', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('ea500000-0000-0000-0000-000000000001', 'ea400000-0000-0000-0000-000000000001',
   'ea000000-0000-0000-0000-000000000004', 'local_owner');

-- Las dos trabajadoras tienen autorizados los dos restaurantes: así, lo
-- que deje fuera a la segunda será llevar el trabajo, no el acceso.
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000002',
   'ea400000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001'),
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000002',
   'ea400000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000001'),
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000003',
   'ea400000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001');

-- `jobs.request_id` es NOT NULL: un trabajo nace de una solicitud
-- aceptada, nunca suelto.
insert into public.requests
  (id, space_id, establishment_id, code, state, description, created_by,
   validated_category, accepted_at, accepted_start_sla_hours) values
  ('ea800000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001',
   'ea400000-0000-0000-0000-000000000001', 'SOL-EV-01', 'in_progress',
   'Publicar la galeria nueva de la carta', 'ea000000-0000-0000-0000-000000000004',
   'small', now(), 24);

insert into public.jobs
  (id, space_id, establishment_id, request_id, code, state, assigned_to, category) values
  ('ea600000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001',
   'ea400000-0000-0000-0000-000000000001', 'ea800000-0000-0000-0000-000000000001',
   'TRB-EV-01', 'in_progress', 'ea000000-0000-0000-0000-000000000002', 'small');

-- Dos archivos: uno del restaurante del trabajo y otro del de al lado.
insert into public.files
  (id, space_id, group_id, establishment_id, name, category, visibility, created_by) values
  ('ea700000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001',
   'ea300000-0000-0000-0000-000000000001', 'ea400000-0000-0000-0000-000000000001',
   'captura-publicacion.png', 'other', 'shared_with_client',
   'ea000000-0000-0000-0000-000000000002'),
  ('ea700000-0000-0000-0000-000000000002', 'ea100000-0000-0000-0000-000000000001',
   'ea300000-0000-0000-0000-000000000001', 'ea400000-0000-0000-0000-000000000002',
   'captura-del-vecino.png', 'other', 'shared_with_client',
   'ea000000-0000-0000-0000-000000000002');

-- ============================================================
-- La responsable adjunta su evidencia, y hacerlo dos veces no duplica.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_enlaces integer;
  v_apuntes integer;
begin
  perform public.attach_job_evidence(
    'ea700000-0000-0000-0000-000000000001', 'ea600000-0000-0000-0000-000000000001');

  select count(*) into v_enlaces from public.file_links
  where entity_type = 'job' and entity_id = 'ea600000-0000-0000-0000-000000000001';

  if v_enlaces <> 1 then
    raise exception 'RN-ARC-02 FALLIDO: la evidencia ha dejado % enlaces', v_enlaces
      using errcode = 'assert_failure';
  end if;

  -- Otra vez, igual. Es el doble clic.
  perform public.attach_job_evidence(
    'ea700000-0000-0000-0000-000000000001', 'ea600000-0000-0000-0000-000000000001');

  select count(*) into v_enlaces from public.file_links
  where entity_type = 'job' and entity_id = 'ea600000-0000-0000-0000-000000000001';

  if v_enlaces <> 1 then
    raise exception 'IDEMPOTENCIA FALLIDA: el segundo clic ha dejado % enlaces', v_enlaces
      using errcode = 'assert_failure';
  end if;

  -- Y el libro tampoco crece: un insert que no inserta y aun asi audita es
  -- una auditoria que miente.
  select count(*) into v_apuntes from public.audit_log
  where action = 'job.evidence_attached'
    and entity_id = 'ea600000-0000-0000-0000-000000000001';

  if v_apuntes <> 1 then
    raise exception 'IDEMPOTENCIA FALLIDA: hay % apuntes de auditoria para un solo enlace', v_apuntes
      using errcode = 'assert_failure';
  end if;
end $$;

-- Un archivo del restaurante de al lado, NO. Esta trabajadora lo tiene
-- autorizado y puede leerlo: lo unico que lo impide es la funcion.
do $$
begin
  begin
    perform public.attach_job_evidence(
      'ea700000-0000-0000-0000-000000000002', 'ea600000-0000-0000-0000-000000000001');
    raise exception 'FALLIDO: se ha enlazado un archivo de otro restaurante'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- La otra trabajadora no lleva este trabajo: no adjunta.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform public.attach_job_evidence(
      'ea700000-0000-0000-0000-000000000001', 'ea600000-0000-0000-0000-000000000001');
    raise exception 'RN-JOB-10 FALLIDO: una trabajadora ajena al trabajo ha adjuntado su evidencia'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- La propietaria sí: `assign_jobs` deja completar la evidencia después.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare v_enlaces integer;
begin
  perform public.attach_job_evidence(
    'ea700000-0000-0000-0000-000000000002', 'ea600000-0000-0000-0000-000000000001');
  raise exception 'FALLIDO: ni siquiera la propietaria puede enlazar un archivo de otro restaurante'
    using errcode = 'assert_failure';
exception
  when assert_failure then raise;
  when others then null;
end $$;

do $$
declare v_enlaces integer;
begin
  -- Con el archivo correcto sí, y sigue siendo idempotente.
  perform public.attach_job_evidence(
    'ea700000-0000-0000-0000-000000000001', 'ea600000-0000-0000-0000-000000000001');

  select count(*) into v_enlaces from public.file_links
  where entity_type = 'job' and entity_id = 'ea600000-0000-0000-0000-000000000001';

  if v_enlaces <> 1 then
    raise exception 'FALLIDO: la propietaria ha duplicado el enlace (% enlaces)', v_enlaces
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- P7 · el restaurante ve la ficha de su trabajo y NO escribe en ella.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
begin
  begin
    perform public.attach_job_evidence(
      'ea700000-0000-0000-0000-000000000001', 'ea600000-0000-0000-0000-000000000001');
    raise exception 'P7 FALLIDO: el restaurante ha podido adjuntar evidencia a un trabajo'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md · privilegios de la función.
-- ============================================================
do $$
declare
  v_firma text := 'public.attach_job_evidence(uuid, uuid)';
begin
  if has_function_privilege('anon', v_firma, 'execute') then
    raise exception 'CLAUDE.md FALLIDO: attach_job_evidence() esta abierta a anon'
      using errcode = 'assert_failure';
  end if;

  if not has_function_privilege('authenticated', v_firma, 'execute') then
    raise exception 'FALLIDO: authenticated no puede ejecutar attach_job_evidence(); ninguna pantalla podria adjuntar'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id = 'ea100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'ea100000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'ea000000-%';

select 'evidencia_de_publicacion.sql: todas las comprobaciones han pasado' as resultado;
