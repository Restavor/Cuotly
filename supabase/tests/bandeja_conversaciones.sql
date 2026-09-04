-- §66 · La bandeja de conversaciones (migración 20260904000050),
-- verificada contra la base de datos real.
--
-- Qué comprueba, y por qué cada cosa:
--   · RN-MSG-03 · quién ve qué conversaciones: propietario y
--     administradores todas las del espacio, el trabajador solo las de sus
--     establecimientos y trabajos autorizados, y quien no tiene el
--     establecimiento no ve ninguna;
--   · RN-MSG-04 · la conversación interna de trabajo NO llega al cliente
--     por la bandeja. Es la regla que el PRD marca como "un fallo aquí es
--     un fallo grave", así que se comprueba en los dos sentidos: que el
--     cliente no la ve y que el equipo sí;
--   · RN-MSG-06 · el contador de sin leer cuenta lo que escribió otra
--     persona después de la última lectura, nunca lo propio, y se pone a
--     cero al marcar leído;
--   · RN-MSG-02 y CLAUDE.md MUST NOT · la bandeja no devuelve `sender_id`
--     a nadie. Comprobado sobre la FIRMA de la función, no sobre una
--     consulta: una comprobación por datos pasaría también el día que
--     alguien añada la columna y el fixture no la ejercite;
--   · que `anon` no puede llamarla (CLAUDE.md: Supabase concede EXECUTE
--     por defecto a toda función nueva).
--
-- Cada comprobación negativa ("no lo ve") va con su positiva ("pero el
-- equipo sí"), porque una negativa sola pasa también cuando la fila no
-- existe.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/bandeja_conversaciones.sql

-- ============================================================
-- Fixture: un espacio con propietario, administrador y dos trabajadoras
-- (Eva autorizada al restaurante A, Nuria a ninguno), dos restaurantes y
-- un cliente del A con un trabajo en marcha.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('f0000000-0000-0000-0000-000000000001', 'bandeja-owner@example.com', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000002', 'bandeja-admin@example.com', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000003', 'bandeja-eva@example.com', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000004', 'bandeja-nuria@example.com', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000005', 'bandeja-client@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('f1000000-0000-0000-0000-000000000001', 'Espacio Bandeja', 'espacio-bandeja-test',
   'f0000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000004', 'worker', 'active');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Impulso Bandeja', 39900, 16, 12, 3, 0, 24);

insert into public.groups (id, space_id, name) values
  ('f3000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Grupo Bandeja');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('f4000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'EST-BAN-A', 'Restaurante Bandeja A'),
  ('f4000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'EST-BAN-B', 'Restaurante Bandeja B');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('f5000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000005', 'local_owner');

-- Eva tiene el restaurante A autorizado; Nuria no tiene ninguno.
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'f4000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001');

insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'web', 'f0000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.create_plan_subscription('f4000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001');

  create temporary table bandeja_ctx (key text primary key, value text);
  grant select, insert, update on bandeja_ctx to authenticated, service_role;
end $$;

reset role;

-- Atajo del fixture, igual que h7_make_job: lleva una solicitud de
-- borrador a `accepted` recorriendo el flujo real de los Hitos 4 y 5, con
-- lo que queda creado su trabajo (RN-REQ-02). Se borra al final.
create or replace function public.bandeja_make_job(
  p_establishment_id uuid,
  p_client uuid,
  p_staff uuid,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_job_id uuid;
begin
  perform set_config('request.jwt.claim.sub', p_client::text, false);
  v_request_id := public.create_request_draft(p_establishment_id, p_description, null);
  perform public.submit_request(v_request_id);
  perform public.begin_request_analysis(v_request_id);

  perform public.record_classification(
    v_request_id, p_client, 'rules', 'small', p_description, null, null, null, null, null, null
  );

  perform set_config('request.jwt.claim.sub', p_staff::text, false);
  perform public.validate_classification(v_request_id, 'small', p_description);

  perform set_config('request.jwt.claim.sub', p_client::text, false);
  perform public.accept_request(v_request_id);

  select id into v_job_id from public.jobs where request_id = v_request_id;
  return v_job_id;
end;
$$;

-- Las tres conversaciones del restaurante A: la de la solicitud (la crea
-- el flujo), la interna del trabajo y la general del establecimiento.
do $$
declare
  v_job_id uuid;
  v_request_id uuid;
begin
  v_job_id := public.bandeja_make_job(
    'f4000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000005',
    'f0000000-0000-0000-0000-000000000001',
    'Cambiar el teléfono del pie de página'
  );
  select request_id into v_request_id from public.jobs where id = v_job_id;

  insert into bandeja_ctx values ('job', v_job_id::text), ('request', v_request_id::text);
end $$;

set role authenticated;

do $$
declare
  v_conv_request uuid;
  v_conv_job uuid;
  v_conv_est uuid;
begin
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', false);

  v_conv_request := public.get_or_create_request_conversation(
    (select value::uuid from bandeja_ctx where key = 'request'));
  v_conv_job := public.get_or_create_job_conversation(
    (select value::uuid from bandeja_ctx where key = 'job'));
  v_conv_est := public.get_or_create_establishment_conversation('f4000000-0000-0000-0000-000000000001');

  insert into bandeja_ctx values
    ('conv_request', v_conv_request::text),
    ('conv_job', v_conv_job::text),
    ('conv_est', v_conv_est::text);

  -- Un mensaje del equipo en la interna y otro del cliente en la general,
  -- para que las dos tengan último mensaje y contador que mirar.
  perform public.post_message(v_conv_job, 'Ojo, el cliente tiene el dominio en otro proveedor', 'bandeja-1');

  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000005', false);
  perform public.post_message(v_conv_est, '¿Podéis mirar el horario de la ficha de Google?', 'bandeja-2');
end $$;

-- ============================================================
-- RN-MSG-03 · quién ve qué en la bandeja.
-- ============================================================
do $$
declare
  v_tipos text[];
begin
  -- El propietario: las tres del espacio.
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', false);
  select array_agg(type order by type) into v_tipos
  from public.list_conversations('f1000000-0000-0000-0000-000000000001');

  if v_tipos is distinct from array['establishment', 'job_internal', 'request'] then
    raise exception 'RN-MSG-03 FALLIDO: el propietario debería ver las tres conversaciones del espacio, ve %', v_tipos
      using errcode = 'assert_failure';
  end if;

  -- El administrador, lo mismo: RN-MSG-03 los nombra juntos.
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', false);
  select array_agg(type order by type) into v_tipos
  from public.list_conversations('f1000000-0000-0000-0000-000000000001');

  if v_tipos is distinct from array['establishment', 'job_internal', 'request'] then
    raise exception 'RN-MSG-03 FALLIDO: el administrador debería ver las tres, ve %', v_tipos
      using errcode = 'assert_failure';
  end if;

  -- Eva, trabajadora con el restaurante A autorizado: las tres también,
  -- porque las tres son de ese restaurante.
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000003', false);
  select array_agg(type order by type) into v_tipos
  from public.list_conversations('f1000000-0000-0000-0000-000000000001');

  if v_tipos is distinct from array['establishment', 'job_internal', 'request'] then
    raise exception 'RN-MSG-03 FALLIDO: la trabajadora autorizada al restaurante debería ver sus tres conversaciones, ve %', v_tipos
      using errcode = 'assert_failure';
  end if;

  -- Nuria, trabajadora sin ningún restaurante autorizado: ninguna.
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', false);
  select array_agg(type order by type) into v_tipos
  from public.list_conversations('f1000000-0000-0000-0000-000000000001');

  if v_tipos is not null then
    raise exception 'RN-MSG-03 FALLIDO: una trabajadora sin el restaurante autorizado no debería ver ninguna conversación, ve %', v_tipos
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MSG-04 · la interna de trabajo no llega al cliente. "Un fallo aquí
-- es un fallo grave" (PRD §16).
-- ============================================================
do $$
declare
  v_tipos text[];
  v_conv_job uuid := (select value::uuid from bandeja_ctx where key = 'conv_job');
  v_filas integer;
begin
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000005', false);

  select array_agg(type order by type) into v_tipos
  from public.list_conversations('f1000000-0000-0000-0000-000000000001');

  if v_tipos is distinct from array['establishment', 'request'] then
    raise exception 'RN-MSG-04 FALLIDO: el cliente debería ver solo la de su solicitud y la general de su restaurante, ve %', v_tipos
      using errcode = 'assert_failure';
  end if;

  -- Y tampoco por el camino directo: pedirla por su identificador no la
  -- devuelve, ni sus mensajes.
  select count(*) into v_filas
  from public.list_conversations('f1000000-0000-0000-0000-000000000001')
  where id = v_conv_job;

  if v_filas <> 0 then
    raise exception 'RN-MSG-04 FALLIDO: la conversación interna del trabajo aparece en la bandeja del cliente'
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_filas from public.list_conversation_messages(v_conv_job);

  if v_filas <> 0 then
    raise exception 'RN-MSG-04 FALLIDO: el cliente lee los mensajes de la conversación interna del trabajo'
      using errcode = 'assert_failure';
  end if;
end $$;

-- La positiva de la anterior: la conversación interna existe y tiene un
-- mensaje, y el equipo sí lo ve. Sin esto, la comprobación de arriba
-- pasaría igual con la conversación vacía.
do $$
declare
  v_filas integer;
  v_conv_job uuid := (select value::uuid from bandeja_ctx where key = 'conv_job');
begin
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000003', false);

  select count(*) into v_filas from public.list_conversation_messages(v_conv_job);

  if v_filas <> 1 then
    raise exception 'Fixture vacuo: la trabajadora autorizada debería leer el mensaje de la conversación interna, lee % filas', v_filas
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MSG-06 · leído y no leído.
-- ============================================================
do $$
declare
  v_conv_est uuid := (select value::uuid from bandeja_ctx where key = 'conv_est');
  v_sin_leer integer;
begin
  -- Para el propietario, el mensaje del cliente está sin leer.
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', false);
  select unread_count into v_sin_leer
  from public.list_conversations('f1000000-0000-0000-0000-000000000001')
  where id = v_conv_est;

  if v_sin_leer <> 1 then
    raise exception 'RN-MSG-06 FALLIDO: el mensaje del cliente debería contar como sin leer para el equipo, cuenta %', v_sin_leer
      using errcode = 'assert_failure';
  end if;

  -- Para el propio cliente que lo escribió, no: lo propio no cuenta nunca.
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000005', false);
  select unread_count into v_sin_leer
  from public.list_conversations('f1000000-0000-0000-0000-000000000001')
  where id = v_conv_est;

  if v_sin_leer <> 0 then
    raise exception 'RN-MSG-06 FALLIDO: el mensaje propio no puede contar como sin leer, cuenta %', v_sin_leer
      using errcode = 'assert_failure';
  end if;

  -- Y al marcar leído, se apaga.
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', false);
  perform public.mark_conversation_read(v_conv_est);

  select unread_count into v_sin_leer
  from public.list_conversations('f1000000-0000-0000-0000-000000000001')
  where id = v_conv_est;

  if v_sin_leer <> 0 then
    raise exception 'RN-MSG-06 FALLIDO: tras marcar leído no debería quedar nada sin leer, quedan %', v_sin_leer
      using errcode = 'assert_failure';
  end if;
end $$;

-- El último mensaje que la bandeja enseña es el último de verdad, y el
-- rol de quien lo escribió es el que corresponde: la bandeja del equipo
-- necesita distinguir "ha escrito el restaurante" de "hemos escrito
-- nosotros" para saber qué está esperando respuesta.
do $$
declare
  v_conv_est uuid := (select value::uuid from bandeja_ctx where key = 'conv_est');
  v_fila record;
begin
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', false);

  select last_message_preview, last_sender_role, establishment_name into v_fila
  from public.list_conversations('f1000000-0000-0000-0000-000000000001')
  where id = v_conv_est;

  if v_fila.last_message_preview not like '¿Podéis mirar%' then
    raise exception 'La bandeja no enseña el último mensaje de la conversación general: %', v_fila.last_message_preview
      using errcode = 'assert_failure';
  end if;

  if v_fila.last_sender_role <> 'client' then
    raise exception 'La bandeja debería decir que el último mensaje lo escribió el restaurante, dice %', v_fila.last_sender_role
      using errcode = 'assert_failure';
  end if;

  if v_fila.establishment_name <> 'Restaurante Bandeja A' then
    raise exception 'La bandeja debería nombrar el restaurante de la conversación, dice %', v_fila.establishment_name
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MSG-02 · `is_mine` sin `sender_id`.
--
-- El fallo que esto impide volver: al restaurante, esta función le
-- devuelve `sender_id` en null también en SUS PROPIOS mensajes, así que
-- la pantalla, que decidía "es mío" comparando esa columna, firmaba los
-- mensajes del propio restaurante como "Equipo de mantenimiento".
-- ============================================================
do $$
declare
  v_conv_est uuid := (select value::uuid from bandeja_ctx where key = 'conv_est');
  v_fila record;
begin
  -- El cliente, sobre el mensaje que escribió él.
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000005', false);

  select is_mine, sender_id, sender_display into v_fila
  from public.list_conversation_messages(v_conv_est)
  order by created_at desc limit 1;

  if not v_fila.is_mine then
    raise exception 'RN-MSG-02 FALLIDO: el restaurante no reconoce como suyo el mensaje que acaba de escribir'
      using errcode = 'assert_failure';
  end if;

  -- Y sigue sin poder distinguir a nadie: la columna no vuelve.
  if v_fila.sender_id is not null then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: al restaurante le llega sender_id (%)', v_fila.sender_id
      using errcode = 'assert_failure';
  end if;

  -- La positiva: para el equipo ese mismo mensaje NO es suyo, y ahí
  -- `sender_id` sí llega (§15, "internamente Cuotly registra quién
  -- realizó cada acción").
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', false);

  select is_mine, sender_id into v_fila
  from public.list_conversation_messages(v_conv_est)
  order by created_at desc limit 1;

  if v_fila.is_mine then
    raise exception 'RN-MSG-02 FALLIDO: el equipo tiene por suyo un mensaje que escribió el restaurante'
      using errcode = 'assert_failure';
  end if;

  if v_fila.sender_id is null then
    raise exception 'El equipo debería saber quién escribió cada mensaje y no lo sabe'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md MUST NOT · la bandeja no puede devolver la identidad de nadie
-- del equipo. Sobre la FIRMA, no sobre los datos: así sigue valiendo el
-- día que alguien añada la columna y el fixture no la ejercite.
-- ============================================================
do $$
declare
  v_firma text := pg_get_function_result('public.list_conversations(uuid)'::regprocedure);
begin
  if v_firma ~* '(sender_id|author_id|actor_id|created_by|assigned_to|user_id|full_name|email)' then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: list_conversations() devuelve una columna de identidad: %', v_firma
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y sin sesión no hay bandeja: `anon` no puede llamarla. Supabase concede
-- EXECUTE por defecto a toda función nueva, así que esto no se cumple solo.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice 'Sin rol anon: se omite la comprobación de privilegios';
    return;
  end if;

  if has_function_privilege('anon', 'public.list_conversations(uuid)'::regprocedure, 'execute') then
    raise exception 'CLAUDE.md FALLIDO: list_conversations() está abierta a `anon`'
      using errcode = 'assert_failure';
  end if;

  if not has_function_privilege('authenticated', 'public.list_conversations(uuid)'::regprocedure, 'execute') then
    raise exception 'list_conversations() ha perdido el EXECUTE de `authenticated`: la bandeja no puede cargarse'
      using errcode = 'assert_failure';
  end if;

  -- La misma pareja para la función que se ha vuelto a crear con
  -- `is_mine`: soltarla y recrearla le devuelve el EXECUTE de `anon` que
  -- Supabase concede por defecto, y la migración se lo vuelve a quitar.
  if has_function_privilege('anon', 'public.list_conversation_messages(uuid)'::regprocedure, 'execute') then
    raise exception 'CLAUDE.md FALLIDO: list_conversation_messages() está abierta a `anon`'
      using errcode = 'assert_failure';
  end if;

  if not has_function_privilege('authenticated', 'public.list_conversation_messages(uuid)'::regprocedure, 'execute') then
    raise exception 'list_conversation_messages() ha perdido el EXECUTE de `authenticated`: ninguna conversación puede leerse'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
drop function public.bandeja_make_job(uuid, uuid, uuid, text);
drop table if exists bandeja_ctx;

delete from public.audit_log where space_id = 'f1000000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'f1000000-0000-0000-0000-000000000001';
delete from auth.users where id in (
  'f0000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000002',
  'f0000000-0000-0000-0000-000000000003',
  'f0000000-0000-0000-0000-000000000004',
  'f0000000-0000-0000-0000-000000000005'
);

select 'bandeja_conversaciones.sql: RN-MSG-02, RN-MSG-03, RN-MSG-04 y RN-MSG-06 cumplidos, base de datos limpia' as resultado;
