-- Espacio de prueba para recorrer los flujos completos a mano y con
-- Playwright. NO es una migración: no describe el esquema, solo mete
-- datos, y por eso vive fuera de `supabase/migrations/` — si estuviera
-- ahí, `supabase db reset` lo aplicaría como parte del esquema y el
-- proyecto real acabaría con datos de prueba dentro de su historial de
-- migraciones.
--
-- Es IDEMPOTENTE: se puede ejecutar las veces que haga falta. Empieza
-- borrando el espacio de demostración entero (y solo ese, por su slug) y
-- lo vuelve a construir. Ese borrado no contradice el "no borrar
-- físicamente registros de negocio" de CLAUDE.md: esto no son registros
-- de negocio, son datos de prueba con correos @cuotly.test que nunca
-- existieron.
--
-- Cómo ejecutarlo:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/espacio-demo.sql
--   o pegándolo en el SQL Editor del panel, o con la herramienta
--   execute_sql del conector de Supabase.
--
-- Las tres identidades, todas con la contraseña `Cuotly-demo-2026`:
--   owner@cuotly.test         Propietario del espacio (equipo)
--   trabajadora@cuotly.test   Trabajadora que ejecuta los trabajos
--   restaurante@cuotly.test   Propietario local del restaurante (cliente)
--
-- Los flujos NO se fabrican metiendo filas a mano en `requests`, `jobs` y
-- `timer_events`: se ejecutan llamando a las mismas funciones que llama la
-- aplicación (submit_request, accept_request, apply_job_assignment,
-- start_job, publish_job…). Así los libros de consumos, los contadores,
-- la auditoría y los avisos quedan como quedarían de verdad, en vez de
-- como un decorado que se desmonta en cuanto una pantalla lee el estado
-- derivado. Para eso se suplanta la identidad de cada actor con
-- `request.jwt.claims`, que es de donde lee `auth.uid()`.

-- ============================================================
-- 0 · Limpieza del espacio de demostración anterior, si lo hay.
-- ============================================================
do $$
declare
  v_space_id uuid;
begin
  select id into v_space_id from public.spaces where slug = 'demo';

  if v_space_id is not null then
    -- `audit_log.space_id` no tiene borrado en cascada (es un libro: la
    -- cascada se la puso a propósito nadie), así que va a mano y primero.
    delete from public.audit_log where space_id = v_space_id;
    delete from public.spaces where id = v_space_id;
  end if;
end $$;

-- Fuera del bloque anterior a propósito: si el espacio no existe pero los
-- usuarios sí (porque una resiembra se quedó a medias), salir antes de
-- borrarlos dejaba el sembrado sin poder repetirse — la inserción de la
-- sección 1 fallaba por clave duplicada. Las identidades caen solas: su
-- clave ajena a `auth.users` es ON DELETE CASCADE.
delete from auth.users where email like '%@cuotly.test';

-- ============================================================
-- 1 · Las tres identidades.
--
-- Crear un usuario a mano en `auth.users` NO basta para poder entrar, y
-- esto costó una tanda entera de tests en rojo. Que una columna acepte
-- NULL no significa que GoTrue —el servicio de autenticación de Supabase,
-- escrito en Go— sepa leerla. Hacen falta las tres cosas:
--
--   · Los CUATRO campos de texto que son nullable y no tienen valor por
--     defecto (`confirmation_token`, `recovery_token`, `email_change` y
--     `email_change_token_new`) van a cadena vacía, NUNCA a NULL. Go los
--     lee como `string`, y un NULL revienta el escaneo de la fila con
--     "converting NULL to string is unsupported". El login devuelve un
--     error del servidor que la pantalla enseña como "Correo o contraseña
--     incorrectos", así que parece un problema de credenciales y no lo es.
--
--   · Una fila en `auth.identities` por usuario. GoTrue resuelve el login
--     por correo a través de la identidad, no de `auth.users`: sin ella
--     el usuario existe y aun así "no existe".
--
--   · La contraseña con coste 10, que es el que usa Supabase.
--     `gen_salt('bf')` a secas usa 6.
--
-- El disparador `on insert on auth.users` de la migración 01 crea solo el
-- `profiles` correspondiente: no hace falta insertarlo aquí.
-- ============================================================
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@cuotly.test',
   extensions.crypt('Cuotly-demo-2026', extensions.gen_salt('bf', 10)), now(),
   '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Elena Ruiz (propietaria)"}'::jsonb, now(), now()),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'trabajadora@cuotly.test',
   extensions.crypt('Cuotly-demo-2026', extensions.gen_salt('bf', 10)), now(),
   '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Marta Gil (trabajadora)"}'::jsonb, now(), now()),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'restaurante@cuotly.test',
   extensions.crypt('Cuotly-demo-2026', extensions.gen_salt('bf', 10)), now(),
   '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Bar Demo"}'::jsonb, now(), now());

-- La identidad de cada uno. `provider_id` para el proveedor `email` es el
-- propio id del usuario, y `identity_data` tiene que llevar `sub` y
-- `email`: es de ahí de donde GoTrue saca a quién pertenece la identidad.
insert into auth.identities
  (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false),
  'email',
  now(), now(), now()
from auth.users u
where u.email like '%@cuotly.test';

-- El disparador puede no rellenar el nombre visible según cómo esté
-- escrito; se asegura aquí para que las pantallas no muestren el correo.
update public.profiles p
set full_name = u.raw_user_meta_data ->> 'full_name'
from auth.users u
where u.id = p.id and u.email like '%@cuotly.test';

-- ============================================================
-- 2 · El espacio, su equipo y su catálogo.
--
-- Los precios son los de CLAUDE.md ("Planes: Básico 99 €, Impulso 399 €,
-- Premium 599 €, todos + IVA") y los mismos que siembra
-- create_restavor_space(). No se usa esa función porque es de Restavor y
-- Cuotly es multiempresa: este es otro espacio.
-- ============================================================
insert into public.spaces (id, name, slug, timezone, created_by, tax_rate_percent)
values ('d1000000-0000-0000-0000-000000000001', 'Demo Cuotly', 'demo',
        'Europe/Madrid', 'd0000000-0000-0000-0000-000000000001', 21);

insert into public.space_memberships (space_id, user_id, role, status, can_perform_jobs)
values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'owner',  'active', true),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'worker', 'active', true);

insert into public.plans
  (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours)
values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Básico',   9900,  0,  0, 0, 0, 48),
  ('d2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'Impulso', 39900, 16, 12, 3, 0, 24),
  ('d2000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'Premium', 59900, 25, 24, 5, 1, 24);

insert into public.services (space_id, name, price_cents, price_premium_cents)
values ('d1000000-0000-0000-0000-000000000001', 'Menú Diario', 22900, 19900);

-- ============================================================
-- 3 · El restaurante y su acceso de cliente.
--
-- A partir de aquí hay que suplantar ya al propietario del espacio, y no
-- solo en la sección 6: el INSERT en `establishments` dispara
-- `set_establishment_code()`, que pide el siguiente código a
-- `next_space_sequence()`, y esa comprueba `is_space_member()` con
-- `auth.uid()`. Sin identidad, el sembrado falla con "No perteneces a
-- este espacio" — aunque lo esté ejecutando el superusuario, porque la
-- comprobación es del cuerpo de la función, no de RLS.
--
-- La membresía de la sección 2 ya está puesta, así que `is_space_member()`
-- devuelve cierto desde este punto.
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'd0000000-0000-0000-0000-000000000001',
                    'role', 'authenticated')::text, false);

insert into public.groups (id, space_id, name)
values ('d3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Grupo Demo');

insert into public.establishments (id, space_id, group_id, name, status)
values ('d4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
        'd3000000-0000-0000-0000-000000000001', 'Bar Demo', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role)
values ('d5000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000003', 'local_owner');

-- El propietario local ve su facturación por serlo (client_can_view_billing),
-- pero la fila de permisos se crea igual para que la pantalla de permisos
-- tenga algo que enseñar.
insert into public.establishment_permissions (establishment_membership_id, edit_establishment_data, view_billing)
values ('d5000000-0000-0000-0000-000000000001', true, true);

-- ============================================================
-- 4 · La trabajadora: especialidad, disponibilidad y autorización.
--
-- Sin las tres, `is_eligible_job_candidate()` la descarta y no hay a quién
-- asignar nada — que es justo lo que se quiere poder probar.
-- ============================================================
insert into public.worker_specialties (space_id, user_id, specialty, created_by)
values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
        'general', 'd0000000-0000-0000-0000-000000000001');

insert into public.worker_availability (space_id, user_id, available)
values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', true);

insert into public.worker_establishments (space_id, user_id, establishment_id, created_by)
values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
        'd4000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001');

-- ============================================================
-- 5 · La suscripción al plan Impulso, con su permanencia (RN-COM-04).
--
-- A mano y no con create_plan_subscription() porque esa función exige
-- `manage_clients` de quien llama y aquí todavía no se ha suplantado a
-- nadie; la permanencia inicial se crea igual, que es lo que esa función
-- añade sobre el INSERT.
-- ============================================================
insert into public.subscriptions
  (id, space_id, establishment_id, kind, plan_id, status, started_at, created_by)
values
  ('d6000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   'd4000000-0000-0000-0000-000000000001', 'plan', 'd2000000-0000-0000-0000-000000000002',
   'active', now() - interval '10 days', 'd0000000-0000-0000-0000-000000000001');

insert into public.plan_commitments
  (space_id, establishment_id, subscription_id, plan_id, started_at, ends_at, cause, created_by)
values
  ('d1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001',
   'd6000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002',
   now() - interval '10 days', now() + interval '80 days', 'initial',
   'd0000000-0000-0000-0000-000000000001');


-- ============================================================
-- 6 · Los flujos, ejecutados con las funciones de verdad.
--
-- El recorrido de una solicitud no es "poner un estado": son cinco pasos
-- y cada uno lo da un actor distinto, que es exactamente lo que hay que
-- poder probar. Escrito tal como lo comprueban las propias funciones:
--
--   1. create_request_draft + submit_request .......... cliente  (arranca T1)
--   2. begin_request_analysis ......................... cliente
--   3. record_classification .......................... servidor (RN-CLS-01)
--   4. validate_classification ........................ equipo   (para T1)
--   5. accept_request ................................. cliente  (gasta bolsa, crea el trabajo)
--
-- El paso 3 va sin identidad a propósito: es la función reservada al
-- servidor, la única que puede grabar qué propuso de verdad el
-- clasificador, y por eso recibe el actor como parámetro en vez de
-- leerlo de `auth.uid()`. Su comprobación es que ESE actor tenga acceso
-- de escritura al establecimiento, así que el actor es el cliente que
-- envió la solicitud, no quien la validará después.
--
-- `source` va como 'rules' y no 'ai' porque este sembrado no llama a
-- Anthropic: es el motor de reglas por palabras clave de RN-CLS-02. Poner
-- 'ai' sería decir que la clasificó una IA que nunca se ejecutó.
-- ============================================================
do $$
declare
  v_cliente constant text := 'd0000000-0000-0000-0000-000000000003';
  v_owner   constant text := 'd0000000-0000-0000-0000-000000000001';
  v_worker  constant text := 'd0000000-0000-0000-0000-000000000002';
  v_est     constant uuid := 'd4000000-0000-0000-0000-000000000001';
  v_req_borrador uuid;
  v_req_enviada  uuid;
  v_req_curso    uuid;
  v_req_publica  uuid;
  v_job_curso    uuid;
  v_job_publico  uuid;
begin
  ----------------------------------------------------------------
  -- 6.1 · El cliente. Cuatro solicitudes que acabarán en cuatro estados
  -- distintos, para que ninguna pantalla se quede sin caso que enseñar.
  ----------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cliente, 'role', 'authenticated')::text, false);

  -- Se queda en borrador: el cliente la empezó y no la ha enviado.
  v_req_borrador := public.create_request_draft(
    v_est, 'Cambiar el horario de apertura de los domingos en la web.',
    'Ahora pone 12:00 y abrimos a las 13:00.');

  -- Enviada y sin tocar: el equipo la tiene esperando, con T1 corriendo.
  v_req_enviada := public.create_request_draft(
    v_est, 'Añadir tres fotografías nuevas de los postres a la carta.',
    'Se las paso por el chat en cuanto las tenga.');
  perform public.submit_request(v_req_enviada);

  -- Las dos que van a recorrer el flujo entero.
  v_req_curso := public.create_request_draft(
    v_est, 'Actualizar los precios de los menús del mediodía.', 'Suben 0,50 € todos.');
  perform public.submit_request(v_req_curso);
  perform public.begin_request_analysis(v_req_curso);

  v_req_publica := public.create_request_draft(
    v_est, 'Corregir el teléfono de contacto del pie de página.', null);
  perform public.submit_request(v_req_publica);
  perform public.begin_request_analysis(v_req_publica);

  ----------------------------------------------------------------
  -- 6.2 · El servidor graba lo que propuso el clasificador.
  ----------------------------------------------------------------
  perform set_config('request.jwt.claims', '', false);

  perform public.record_classification(
    v_req_curso, v_cliente::uuid, 'rules', 'small',
    'Actualización de precios de los menús del mediodía.',
    array['precios','menú'], null, null, null, null, 'Sin clave de IA configurada');

  perform public.record_classification(
    v_req_publica, v_cliente::uuid, 'rules', 'small',
    'Corrección del teléfono del pie de página.',
    array['teléfono','pie'], null, null, null, null, 'Sin clave de IA configurada');

  ----------------------------------------------------------------
  -- 6.3 · El equipo valida la clasificación (RN-CLS-03). Para T1.
  ----------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, false);

  perform public.validate_classification(v_req_curso, 'small',
    'Actualización de precios de los menús del mediodía.');
  perform public.validate_classification(v_req_publica, 'small',
    'Corrección del teléfono del pie de página.');

  ----------------------------------------------------------------
  -- 6.4 · El cliente acepta. Cada aceptación gasta un consumo de la bolsa
  -- del plan Impulso y crea el trabajo.
  ----------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cliente, 'role', 'authenticated')::text, false);

  perform public.accept_request(v_req_curso);
  perform public.accept_request(v_req_publica);

  select id into v_job_curso   from public.jobs where request_id = v_req_curso;
  select id into v_job_publico from public.jobs where request_id = v_req_publica;

  ----------------------------------------------------------------
  -- 6.5 · El equipo asigna los dos trabajos a la trabajadora (arranca T2).
  ----------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, false);

  perform public.apply_job_assignment(v_job_curso,   v_worker::uuid, 'manual', null);
  perform public.apply_job_assignment(v_job_publico, v_worker::uuid, 'manual', null);

  ----------------------------------------------------------------
  -- 6.6 · La trabajadora comienza los dos y publica uno.
  --
  -- Queda uno EN CURSO (con T3 corriendo, que es lo que hace interesante
  -- la pantalla de trabajos) y otro PUBLICADO con su ventana de
  -- corrección abierta, para poder probar la corrección gratuita.
  ----------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker, 'role', 'authenticated')::text, false);

  perform public.start_job(v_job_curso);
  perform public.start_job(v_job_publico);
  perform public.publish_job(v_job_publico, now() + interval '5 days');
end $$;

-- ============================================================
-- 7 · Un cobro emitido y pagado, para que Finanzas no esté vacía.
--
-- `generate_monthly_charge()` exige `manage_finance` y `register_payment()`
-- también, así que sigue puesta la identidad del propietario. El pago se
-- registra con la función real: escribe el apunte con signo en el libro
-- inmutable, en vez de tocar un contador (CLAUDE.md).
--
-- Impulso son 399 € + 21 % de IVA = 482,79 €.
-- ============================================================
do $$
declare v_charge uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'd0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, false);

  v_charge := public.generate_monthly_charge(
    'd6000000-0000-0000-0000-000000000001'::uuid, now() + interval '20 days');

  if v_charge is not null then
    -- Argumentos nombrados a propósito: la firma lleva `p_receipt_file_id`
    -- en quinta posición, así que la nota no se puede pasar por sitio.
    perform public.register_payment(
      p_charge_id    => v_charge,
      p_amount_cents => (select total_cents from public.charges where id = v_charge),
      p_method       => 'transfer',
      p_paid_at      => now(),
      p_note         => 'Transferencia de demostración');
  end if;
end $$;

-- ============================================================
-- 8 · Comprobación final. Si algo de lo de arriba no cuajó, esto falla y
-- el sembrado no se da por bueno en silencio.
--
-- Sigue con la identidad del propietario puesta desde la sección 7: las
-- funciones de dinero (`charge_status`) exigen visibilidad financiera y
-- devuelven un error, no un nulo, a quien no la tiene. Soltar la
-- identidad antes de comprobar haría fallar la comprobación en vez del
-- sembrado.
-- ============================================================
do $$
declare
  v_space uuid := 'd1000000-0000-0000-0000-000000000001';
  v_solicitudes integer;
  v_trabajos integer;
  v_publicados integer;
  v_consumos integer;
  v_contadores integer;
  v_cobros integer;
  v_deuda integer;
  v_entrables integer;
begin
  -- Lo primero, que se pueda ENTRAR. El sembrado anterior daba todo esto
  -- por bueno y dejaba tres usuarios que no autenticaban: comprobaba los
  -- datos de negocio y no la puerta. Aquí se comprueba que la contraseña
  -- verifica contra el hash y que cada uno tiene su identidad.
  select count(*) into v_entrables
  from auth.users u
  where u.email like '%@cuotly.test'
    and u.encrypted_password = extensions.crypt('Cuotly-demo-2026', u.encrypted_password)
    and u.email_confirmed_at is not null
    and u.confirmation_token is not null
    and u.recovery_token is not null
    and u.email_change is not null
    and u.email_change_token_new is not null
    and exists (select 1 from auth.identities i
                where i.user_id = u.id and i.provider = 'email');

  if v_entrables <> 3 then
    raise exception 'Solo % de los 3 usuarios pueden entrar: revisa tokens NULL o identidades que falten', v_entrables;
  end if;

  select count(*) into v_solicitudes from public.requests where space_id = v_space;
  select count(*) into v_trabajos    from public.jobs where space_id = v_space;
  select count(*) into v_publicados  from public.jobs where space_id = v_space and state = 'published';
  select count(*) into v_consumos    from public.consumption_entries where space_id = v_space;
  select count(*) into v_contadores  from public.timer_events where space_id = v_space;
  select count(*) into v_cobros      from public.charges where space_id = v_space;
  select coalesce(sum(public.charge_outstanding_cents(id)), 0) into v_deuda
    from public.charges where space_id = v_space;

  if v_solicitudes <> 4 then
    raise exception 'Se esperaban 4 solicitudes y hay %', v_solicitudes;
  end if;
  if v_trabajos <> 2 then
    raise exception 'Se esperaban 2 trabajos y hay %', v_trabajos;
  end if;
  if v_publicados <> 1 then
    raise exception 'Se esperaba 1 trabajo publicado y hay %', v_publicados;
  end if;
  if v_consumos < 2 then
    raise exception 'Se esperaban al menos 2 apuntes de consumo y hay %', v_consumos;
  end if;
  if v_contadores < 6 then
    raise exception 'Se esperaban al menos 6 eventos de contador y hay %', v_contadores;
  end if;
  if v_cobros <> 1 then
    raise exception 'Se esperaba 1 cobro y hay %', v_cobros;
  end if;
  if v_deuda <> 0 then
    raise exception 'El cobro tenía que quedar pagado y quedan % céntimos', v_deuda;
  end if;

  raise notice 'Espacio de demostración sembrado: % solicitudes, % trabajos (% publicado), % consumos, % eventos de contador, % cobro sin deuda',
    v_solicitudes, v_trabajos, v_publicados, v_consumos, v_contadores, v_cobros;
end $$;

-- Se suelta la identidad al final, para no dejar la sesión suplantando a
-- nadie si esto se ejecuta dentro de una sesión más larga.
select set_config('request.jwt.claims', '', false);
