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
-- Las siete identidades, todas con la contraseña `Cuotly-demo-2026`:
--   owner@cuotly.test          Propietaria del espacio (equipo)
--   trabajadora@cuotly.test    Trabajadora que ejecuta los trabajos
--   trabajador2@cuotly.test    Segundo trabajador (equipo)
--   restaurante@cuotly.test    Propietario local de "Bar Demo" (cliente)
--   cliente2@cuotly.test       Propietario local de "Café Prueba" (cliente)
--   magarinos@cuotly.test      Propietaria local de "Magariños" (cliente)
--   sala.magarinos@cuotly.test Acceso de solo consulta a "Magariños"
--
-- Y una octava que NO es de mentira ni la crea este archivo:
-- info@restavor.com, el correo con el que se usa Cuotly de verdad. La
-- sección 11 le da la pertenencia al espacio como propietario si ya se ha
-- registrado en la aplicación; si no, lo dice y no falla. El porqué de no
-- crearla está ahí escrito.
--
-- Tres restaurantes, y la separación es deliberada:
--
--   "Bar Demo" ..... el de los tests que LEEN (cuentan solicitudes, miran
--                    la bolsa). No lo toca nadie.
--   "Café Prueba" .. donde ocurren los recorridos que ESCRIBEN, para que
--                    no le muevan el suelo al anterior. Ver la sección 5 bis.
--   "Magariños" .... el que se MIRA. Los otros dos son pequeños a
--                    propósito y dejan la ficha del PRD §15.2 medio vacía,
--                    que no sirve para juzgar si está bien resuelta. Este
--                    llena las cinco pestañas y los cinco bloques de
--                    Gestión. Ver la sección 9.
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
-- 1 · Las identidades del equipo y del primer cliente.
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
-- 5 bis · El segundo restaurante, para los recorridos que ESCRIBEN.
--
-- Los tests de lectura miran "Bar Demo" y cuentan cosas exactas —cuatro
-- solicitudes, catorce de dieciséis en la bolsa—, así que un recorrido que
-- cree una solicitud y la lleve hasta publicar les cambiaría el suelo bajo
-- los pies. Se separan los datos: "Bar Demo" no lo toca nadie, y todo lo
-- que muta ocurre en "Café Prueba".
--
-- Con plan **Básico**, y no es un detalle menor: Básico no incluye ningún
-- cambio (CLAUDE.md), así que `accept_request()` marca la aceptación como
-- presupuestada y NO escribe ningún apunte de consumo. El recorrido se
-- puede repetir tantas veces como haga falta sin agotar una bolsa — con
-- Impulso, a la dieciseisava ejecución empezaría a fallar por falta de
-- crédito. Y de paso es un caso de producto real, no un apaño: un cambio
-- en Básico se presupuesta aparte.
--
-- Y con su propio cliente, porque si "Bar Demo" y "Café Prueba" fueran del
-- mismo, ese cliente pasaría a tener dos contextos y dejaría de entrar
-- directo a su restaurante (PRD §20.1) — que es justo lo que comprueban
-- tres de los tests de lectura.
-- ============================================================
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cliente2@cuotly.test',
   extensions.crypt('Cuotly-demo-2026', extensions.gen_salt('bf', 10)), now(),
   '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Café Prueba"}'::jsonb, now(), now());

insert into auth.identities
  (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email,
                     'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
from auth.users u
where u.id = 'd0000000-0000-0000-0000-000000000004';

update public.profiles set full_name = 'Café Prueba'
where id = 'd0000000-0000-0000-0000-000000000004';

insert into public.establishments (id, space_id, group_id, name, status)
values ('d4000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001',
        'd3000000-0000-0000-0000-000000000001', 'Café Prueba', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role)
values ('d5000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000004', 'local_owner');

insert into public.establishment_permissions (establishment_membership_id, edit_establishment_data, view_billing)
values ('d5000000-0000-0000-0000-000000000002', true, true);

-- La trabajadora también autorizada aquí, o no sería candidata a los
-- trabajos de este restaurante y no se podría probar la asignación.
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by)
values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
        'd4000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001');

insert into public.subscriptions
  (id, space_id, establishment_id, kind, plan_id, status, started_at, created_by)
values
  ('d6000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001',
   'd4000000-0000-0000-0000-000000000002', 'plan', 'd2000000-0000-0000-0000-000000000001',
   'active', now() - interval '5 days', 'd0000000-0000-0000-0000-000000000001');

insert into public.plan_commitments
  (space_id, establishment_id, subscription_id, plan_id, started_at, ends_at, cause, created_by)
values
  ('d1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000002',
   'd6000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001',
   now() - interval '5 days', now() + interval '85 days', 'initial',
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

  -- Y uno del segundo restaurante que se queda SIN pagar, para que el
  -- recorrido de CA-19 tenga sobre qué registrar un pago. Básico son 99 €
  -- + 21 % = 119,79 €. Vence dentro de 20 días: pendiente, no vencido, así
  -- que el ciclo de impago no lo toca.
  perform public.generate_monthly_charge(
    'd6000000-0000-0000-0000-000000000002'::uuid, now() + interval '20 days');
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

  -- Cuatro y no siete: las tres identidades de "Magariños" se crean en la
  -- sección 9, que va después de esta comprobación a propósito. Las suyas
  -- las comprueba la sección 10.
  if v_entrables <> 4 then
    raise exception 'Solo % de los 4 usuarios pueden entrar: revisa tokens NULL o identidades que falten', v_entrables;
  end if;

  select count(*) into v_solicitudes from public.requests where space_id = v_space;
  select count(*) into v_trabajos    from public.jobs where space_id = v_space;
  select count(*) into v_publicados  from public.jobs where space_id = v_space and state = 'published';
  select count(*) into v_consumos    from public.consumption_entries where space_id = v_space;
  select count(*) into v_contadores  from public.timer_events where space_id = v_space;
  select count(*) into v_cobros      from public.charges where space_id = v_space;
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
  if v_cobros <> 2 then
    raise exception 'Se esperaban 2 cobros y hay %', v_cobros;
  end if;

  -- El de Bar Demo, pagado. El de Café Prueba, pendiente a propósito: es
  -- sobre el que el recorrido de CA-19 registra un pago.
  select coalesce(public.charge_outstanding_cents(id), 0) into v_deuda
  from public.charges where establishment_id = 'd4000000-0000-0000-0000-000000000001';
  if v_deuda <> 0 then
    raise exception 'El cobro de Bar Demo tenía que quedar pagado y quedan % céntimos', v_deuda;
  end if;

  select coalesce(public.charge_outstanding_cents(id), 0) into v_deuda
  from public.charges where establishment_id = 'd4000000-0000-0000-0000-000000000002';
  if v_deuda <= 0 then
    raise exception 'El cobro de Café Prueba tenía que quedar pendiente y está a %', v_deuda;
  end if;

  raise notice 'Espacio de demostración sembrado: % solicitudes, % trabajos (% publicado), % consumos, % eventos de contador, % cobro sin deuda',
    v_solicitudes, v_trabajos, v_publicados, v_consumos, v_contadores, v_cobros;
end $$;

-- ============================================================
-- 9 · "Magariños": el restaurante con la ficha llena.
--
-- Va DESPUÉS de la comprobación de la sección 8 a propósito: aquella
-- cuenta solicitudes, trabajos y cobros de TODO el espacio y afirma
-- números exactos. Sembrar este restaurante antes se los cambiaría bajo
-- los pies, y bajar aquellas comprobaciones a "al menos tantos" sería
-- perder justo lo que sirve de ellas.
--
-- Para qué existe. "Bar Demo" y "Café Prueba" están hechos para los tests
-- —cuatro solicitudes contadas, una bolsa a catorce de dieciséis— y por eso
-- son pequeños: sirven para comprobar, no para MIRAR. Con ellos la ficha
-- del PRD §15.2 se ve, pero se ve medio vacía, y una pantalla medio vacía
-- no dice si está bien resuelta. Este restaurante llena las cinco
-- pestañas y los cinco bloques de Gestión: bolsas del ciclo con consumo de
-- verdad, solicitudes en siete estados distintos, trabajos repartidos
-- entre dos personas, archivos con sus versiones, dos usuarios del
-- restaurante con permisos distintos, un cobro pagado e historial.
--
-- Nada de esto se mete a mano en las tablas de estado. Los quince
-- consumos salen de quince aceptaciones reales, los trabajos de sus
-- solicitudes y el pago del libro de apuntes, por las mismas funciones que
-- llama la aplicación. Un decorado montado con INSERTs se desmonta en
-- cuanto una pantalla recalcula algo, que es exactamente lo que hacen
-- todas las de esta ficha.
--
-- Es un restaurante de demostración con correos @cuotly.test, igual que
-- los otros dos, y vive en el espacio `demo`. No es un dato de ejemplo
-- pintado en una pantalla de producción, que es lo que prohíbe CLAUDE.md:
-- es una fila de verdad en una base de datos de pruebas.
-- ============================================================

-- 9.1 · Tres identidades más: dos del restaurante, con permisos
-- distintos para que el bloque Usuarios tenga algo que distinguir, y un
-- segundo trabajador para que la carga del equipo del Inicio no sea una
-- sola fila.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'magarinos@cuotly.test',
   extensions.crypt('Cuotly-demo-2026', extensions.gen_salt('bf', 10)), now(),
   '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Nuria Ferreiro (Magariños)"}'::jsonb, now(), now()),
  ('d0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sala.magarinos@cuotly.test',
   extensions.crypt('Cuotly-demo-2026', extensions.gen_salt('bf', 10)), now(),
   '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Iván Cortés (sala)"}'::jsonb, now(), now()),
  ('d0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'trabajador2@cuotly.test',
   extensions.crypt('Cuotly-demo-2026', extensions.gen_salt('bf', 10)), now(),
   '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Diego Sanz (trabajador)"}'::jsonb, now(), now());

insert into auth.identities
  (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email,
                     'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
from auth.users u
where u.id in ('d0000000-0000-0000-0000-000000000005',
               'd0000000-0000-0000-0000-000000000006',
               'd0000000-0000-0000-0000-000000000007');

update public.profiles p
set full_name = u.raw_user_meta_data ->> 'full_name'
from auth.users u
where u.id = p.id
  and u.id in ('d0000000-0000-0000-0000-000000000005',
               'd0000000-0000-0000-0000-000000000006',
               'd0000000-0000-0000-0000-000000000007');

-- 9.2 · El segundo trabajador, con lo que le hace candidato.
insert into public.space_memberships (space_id, user_id, role, status, can_perform_jobs)
values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007',
        'worker', 'active', true);

insert into public.worker_specialties (space_id, user_id, specialty, created_by)
values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007',
        'general', 'd0000000-0000-0000-0000-000000000001');

insert into public.worker_availability (space_id, user_id, available)
values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', true);

-- 9.3 · El restaurante, en su propio grupo. Un segundo grupo, y no el
-- "Grupo Demo" que ya hay, para que el filtro de grupo del listado
-- (§20.2) tenga más de una opción y se pueda ver filtrar de verdad.
select set_config('request.jwt.claims',
  json_build_object('sub', 'd0000000-0000-0000-0000-000000000001',
                    'role', 'authenticated')::text, false);

insert into public.groups (id, space_id, name)
values ('d3000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001',
        'Grupo Magariños');

insert into public.establishments (id, space_id, group_id, name, status)
values ('d4000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001',
        'd3000000-0000-0000-0000-000000000002', 'Magariños', 'active');

-- Dos accesos con permisos distintos: la propietaria local lo ve todo, y
-- la persona de sala entra en modo Consulta —lee y no responde
-- (RN-MSG-05)— y sin facturación (RN-FIN-07). El bloque Usuarios de la
-- ficha enseña justo esa diferencia, y con un solo usuario no se ve.
insert into public.establishment_memberships (id, establishment_id, user_id, role)
values
  ('d5000000-0000-0000-0000-000000000003', 'd4000000-0000-0000-0000-000000000003',
   'd0000000-0000-0000-0000-000000000005', 'local_owner'),
  ('d5000000-0000-0000-0000-000000000004', 'd4000000-0000-0000-0000-000000000003',
   'd0000000-0000-0000-0000-000000000006', 'consulta');

insert into public.establishment_permissions (establishment_membership_id, edit_establishment_data, view_billing)
values
  ('d5000000-0000-0000-0000-000000000003', true, true),
  ('d5000000-0000-0000-0000-000000000004', false, false);

-- Los dos trabajadores autorizados aquí, o no serían candidatos.
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by)
values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
   'd4000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007',
   'd4000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001');

-- 9.4 · Plan Premium y Menú Diario, con las funciones de verdad y no a
-- mano como en la sección 5: `create_plan_subscription()` crea además la
-- permanencia de RN-COM-04, el ciclo de RN-COM-06 y la mensualidad de
-- RN-FIN-01, que es lo que hace falta para que la ficha tenga ciclo,
-- bolsas y un cobro que enseñar.
do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'd0000000-0000-0000-0000-000000000001',
                      'role', 'authenticated')::text, false);

  perform public.create_plan_subscription(
    'd4000000-0000-0000-0000-000000000003'::uuid,
    'd2000000-0000-0000-0000-000000000003'::uuid);

  -- RN-COM-13: los servicios adicionales van aparte del plan. Menú Diario
  -- entero es Fase 2; lo que existe hoy es la contratación, y con ella la
  -- ficha puede decir "Contratado" sin inventarse nada. Su mensualidad NO
  -- se emite: `generate_monthly_charge()` se para a propósito ante un
  -- servicio porque el precio de RN-COM-08 depende de si el plan es
  -- Premium y el esquema todavía no sabe cuál lo es.
  perform public.create_service_subscription(
    'd4000000-0000-0000-0000-000000000003'::uuid,
    (select id from public.services
     where space_id = 'd1000000-0000-0000-0000-000000000001' and name = 'Menú Diario'));
end $$;

-- 9.5 · Diecinueve solicitudes, cada una llevada hasta donde toca.
--
-- La tabla de abajo es el sembrado entero: categoría, texto y hasta dónde
-- llega. El recorrido es siempre el mismo —el de la sección 6— y lo único
-- que cambia es dónde se para, así que se escribe una vez y se recorre.
-- Escribir diecinueve bloques a mano habría sido diecinueve sitios donde
-- se puede colar un paso distinto sin que se note.
--
-- Los ocho destinos, en orden del recorrido:
--
--   borrador ...... el cliente la empezó y no la ha enviado.
--   recibida ...... enviada, con T1 corriendo y nadie mirándola aún.
--   por_validar ... clasificada y esperando al equipo (RN-CLS-03). Es la
--                   que sale en "Necesita atención" como "Pendiente de
--                   validación".
--   por_aceptar ... validada y esperando al restaurante.
--   sin_asignar ... aceptada, con trabajo y sin nadie que lo asuma
--                   (RN-ASG-05: el reloj de inicio ni ha arrancado).
--   por_comenzar .. asignada, con T2 corriendo.
--   en_curso ...... comenzada, con T3 corriendo.
--   publicado ..... publicada, con su ventana de corrección abierta.
--
-- El consumo se gasta al ACEPTAR, así que las cuatro primeras no tocan la
-- bolsa y las cuatro últimas sí. La cuenta que sale, sobre las bolsas del
-- plan Premium (25 pequeños, 24 fotográficos, 5 medianos, 1 grande):
-- ocho pequeños, seis fotográficos y un mediano usados, y el grande
-- entero sin tocar — que es una bolsa a cero muy a propósito, porque el
-- Resumen tiene que saber pintar también la que no se ha usado.
do $$
declare
  v_owner constant text := 'd0000000-0000-0000-0000-000000000001';
  v_marta constant text := 'd0000000-0000-0000-0000-000000000002';
  v_diego constant text := 'd0000000-0000-0000-0000-000000000007';
  v_cli   constant text := 'd0000000-0000-0000-0000-000000000005';
  v_est   constant uuid := 'd4000000-0000-0000-0000-000000000003';
  v_req uuid;
  v_job uuid;
  v_trabajador text;
  v_n integer := 0;
  r record;
begin
  for r in
    select * from (values
      ('small',  'Actualizar los horarios de Navidad en la web.',
                 'Cambiar los horarios de un periodo concreto.',                 'publicado'),
      ('small',  'Cambiar el teléfono de reservas del pie de página.',
                 'Actualizar un dato de contacto existente.',                    'publicado'),
      ('small',  'Corregir una errata en la descripción del arroz de la casa.',
                 'Corregir un texto ya publicado.',                              'publicado'),
      ('small',  'Añadir el enlace al nuevo perfil de Instagram.',
                 'Añadir un enlace a una red social.',                           'publicado'),
      ('small',  'Actualizar los precios del menú del mediodía.',
                 'Actualizar precios ya publicados.',                            'publicado'),
      ('photo',  'Sustituir la fotografía de portada por la de la terraza.',
                 'Sustituir una fotografía entregada por el restaurante.',       'publicado'),
      ('photo',  'Publicar las fotografías nuevas de los postres.',
                 'Publicar fotografías entregadas por el restaurante.',          'publicado'),
      ('photo',  'Fotografía del comedor privado para la página de grupos.',
                 'Colocar una fotografía en una página existente.',              'en_curso'),
      ('photo',  'Actualizar la fotografía del equipo de cocina.',
                 'Sustituir una fotografía existente.',                          'en_curso'),
      ('photo',  'Añadir la fotografía de la barra a la galería.',
                 'Añadir una fotografía a la galería.',                          'publicado'),
      ('medium', 'Rehacer la página de grupos y celebraciones.',
                 'Rehacer el contenido de una sección existente.',               'publicado'),
      ('photo',  'Reportaje de las tapas de temporada.',
                 'Publicar un conjunto de fotografías entregadas.',              'en_curso'),
      ('small',  'Cambiar el horario del sábado.',
                 'Cambiar un día del horario.',                                  'por_comenzar'),
      ('small',  'Retirar el banner de las fiestas de agosto.',
                 'Retirar un elemento temporal de la portada.',                  'sin_asignar'),
      ('small',  'Añadir el aviso de cierre por vacaciones.',
                 'Añadir un aviso breve en la portada.',                         'por_comenzar'),
      ('medium', 'Nueva sección de eventos con formulario de reserva.',
                 'Añadir una sección con formulario de reserva.',                'por_aceptar'),
      -- La de la maqueta 05 · "Solicitudes — Validación interna": es la
      -- que se queda esperando al equipo, y por eso es la única que lleva
      -- adjunto y la única con dos frases. La primera hace de titular en
      -- la pantalla (`requestHeadline()` se queda con la primera frase) y
      -- el mensaje completo se lee entero debajo, tal como está aquí.
      ('small',  'Actualizar los precios de la carta. Cambiar el precio del menú de 18 € a 19 € en la carta.',
                 'Actualizar un precio existente.',                              'por_validar'),
      ('small',  'Añadir los alérgenos a los platos nuevos.',
                 'Añadir información a platos existentes.',                      'recibida'),
      ('small',  'Cambiar la foto de portada por la del plato nuevo.',
                 'Sustituir la fotografía de portada.',                          'borrador')
    ) as t(categoria, descripcion, resumen, destino)
  loop
    ------------------------------------------------------------------
    -- El cliente: borrador, envío y arranque del análisis.
    ------------------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_cli, 'role', 'authenticated')::text, false);

    v_req := public.create_request_draft(v_est, r.descripcion, null);

    ------------------------------------------------------------------
    -- El adjunto de la maqueta 05 ("Carta actual.pdf", 320 KB). Va
    -- aquí, con la solicitud todavía en BORRADOR, porque es el único
    -- momento en que un adjunto puede entrar: la política de INSERT de
    -- `request_attachments` lo exige (migración 17). Metérselo después a
    -- una solicitud ya enviada sería sembrar un camino que la
    -- aplicación no tiene.
    --
    -- No hace falta crear nada en el catálogo: el disparador
    -- `request_attachments_mirror_to_catalogue` (migración 25) crea el
    -- `files`, su primera versión y el `file_links` de tipo 'request',
    -- que es de donde la pantalla lee los adjuntos. Por eso Magariños
    -- pasa a tener CINCO archivos y no cuatro (el quinto, de categoría
    -- "solicitudes y trabajos"), y la comprobación de la sección 10 lo
    -- cuenta así.
    --
    -- La ruta apunta a un objeto que NO existe en el bucket, igual que
    -- las de la sección 9.6: esto siembra la base, no sube bytes. La
    -- fila del adjunto se ve entera y la descarga devuelve el 404 del
    -- Storage.
    if r.destino = 'por_validar' then
      insert into public.request_attachments
        (request_id, space_id, establishment_id, storage_path, file_name,
         mime_type, size_bytes, created_by)
      values
        (v_req, 'd1000000-0000-0000-0000-000000000001', v_est,
         'demo/magarinos/carta-actual.pdf', 'Carta actual.pdf',
         'application/pdf', 327680, v_cli::uuid);
    end if;

    continue when r.destino = 'borrador';

    perform public.submit_request(v_req);
    continue when r.destino = 'recibida';

    perform public.begin_request_analysis(v_req);

    ------------------------------------------------------------------
    -- El servidor graba lo que propuso el clasificador. Sin identidad y
    -- con `source` = 'rules', por lo mismo que en la sección 6: este
    -- sembrado no llama a Anthropic y decir 'ai' sería afirmar que la
    -- clasificó una IA que nunca se ejecutó.
    ------------------------------------------------------------------
    perform set_config('request.jwt.claims', '', false);
    --
    -- El resumen propuesto es el ALCANCE, no una copia de lo que
    -- escribió el restaurante: es lo que el equipo lee en "Propuesta de
    -- clasificación" y lo que el restaurante leerá al aceptarla
    -- (RN-CLS-01). Copiar ahí la descripción dejaba la pantalla
    -- diciendo la misma frase dos veces, que es exactamente lo que una
    -- propuesta no es.
    perform public.record_classification(
      v_req, v_cli::uuid, 'rules', r.categoria, r.resumen,
      null, null, null, null, null, 'Sin clave de IA configurada');

    continue when r.destino = 'por_validar';

    ------------------------------------------------------------------
    -- El equipo valida (RN-CLS-03). Para T1.
    ------------------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, false);
    perform public.validate_classification(v_req, r.categoria, r.resumen);

    continue when r.destino = 'por_aceptar';

    ------------------------------------------------------------------
    -- El cliente acepta: gasta el consumo de su bolsa y crea el trabajo.
    ------------------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_cli, 'role', 'authenticated')::text, false);
    perform public.accept_request(v_req);
    select id into v_job from public.jobs where request_id = v_req;

    continue when r.destino = 'sin_asignar';

    ------------------------------------------------------------------
    -- El equipo asigna, alternando entre los dos trabajadores para que
    -- la carga del Inicio tenga dos filas con números distintos.
    ------------------------------------------------------------------
    v_n := v_n + 1;
    v_trabajador := case when v_n % 3 = 0 then v_diego else v_marta end;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, false);
    perform public.apply_job_assignment(v_job, v_trabajador::uuid, 'manual', null);

    continue when r.destino = 'por_comenzar';

    ------------------------------------------------------------------
    -- Quien lo tiene asignado lo comienza y, si toca, lo publica.
    ------------------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_trabajador, 'role', 'authenticated')::text, false);
    perform public.start_job(v_job);

    continue when r.destino = 'en_curso';

    perform public.publish_job(v_job, now() + interval '5 days');
  end loop;
end $$;

-- 9.6 · Los archivos, con sus versiones y su visibilidad.
--
-- Cuatro archivos de cuatro categorías distintas (RN-ARC-01), y no cuatro
-- del mismo tipo: el desplegable de "Categoría" del bloque Archivos se
-- construye con las categorías que este restaurante TIENE, así que con
-- una sola no hay filtro que ver.
--
-- Las rutas de almacenamiento apuntan a objetos que NO existen en el
-- bucket: esto siembra la base, no sube bytes. La consecuencia hay que
-- saberla antes de encontrársela — la lista, las versiones y la
-- visibilidad se ven enteras, y al pulsar la descarga la URL firmada
-- devuelve un 404 del Storage. Subir de verdad se prueba con
-- `pnpm comprobar:storage`, que es lo que hay para eso.
do $$
declare
  v_est constant uuid := 'd4000000-0000-0000-0000-000000000003';
  v_logo uuid;
  v_carta uuid;
  v_notas uuid;
  v_fachada uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'd0000000-0000-0000-0000-000000000001',
                      'role', 'authenticated')::text, false);

  -- Nace interno y se comparte después con `share_file_with_client()`,
  -- que es la segunda mitad de RN-ARC-04 y la que deja el apunte de
  -- auditoría. Marcarlo compartido al subir también vale, y así se hace
  -- con la carta: las dos formas existen y conviene ver las dos.
  v_logo := public.register_file(
    v_est, 'logos', 'Logo principal.png',
    'demo/magarinos/logo-principal-v1.png', 'logo-principal-v1.png',
    'image/png', 184320);
  perform public.add_file_version(
    v_logo, 'demo/magarinos/logo-principal-v2.png', 'logo-principal-v2.png',
    'image/png', 191488);
  perform public.share_file_with_client(v_logo);

  v_carta := public.register_file(
    v_est, 'menus', 'Carta septiembre.pdf',
    'demo/magarinos/carta-septiembre.pdf', 'carta-septiembre.pdf',
    'application/pdf', 1258291, 'shared_with_client');

  -- Este se queda INTERNO, y es el que demuestra que la marca sirve para
  -- algo: el restaurante no lo ve en su pantalla, y el equipo sí lo ve en
  -- la ficha. Con todos compartidos no se distinguiría una cosa de la otra.
  v_notas := public.register_file(
    v_est, 'documents', 'Notas de publicación.docx',
    'demo/magarinos/notas-publicacion.docx', 'notas-publicacion.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 45056);

  -- Las tres variantes de una fotografía (RN-ARC-03), que es el caso para
  -- el que existe el panel de versiones: original, retocada y publicada.
  v_fachada := public.register_file(
    v_est, 'photos', 'Fachada.jpg',
    'demo/magarinos/fachada-original.jpg', 'fachada-original.jpg',
    'image/jpeg', 2516582, 'shared_with_client', 'original');
  perform public.add_file_version(
    v_fachada, 'demo/magarinos/fachada-retocada.jpg', 'fachada-retocada.jpg',
    'image/jpeg', 2726297, 'retouched');
  perform public.add_file_version(
    v_fachada, 'demo/magarinos/fachada-publicada.jpg', 'fachada-publicada.jpg',
    'image/jpeg', 2621440, 'published');
end $$;

-- 9.7 · La mensualidad, pagada.
--
-- El cobro no se emite aquí: lo emitió `create_plan_subscription()` al dar
-- de alta el plan (RN-FIN-01), que es como ocurre de verdad. Lo que falta
-- es el pago, y va con `register_payment()` para que quede el apunte con
-- signo en el libro inmutable en vez de un estado escrito a mano
-- (CLAUDE.md). Premium son 599 € + 21 % de IVA = 724,79 €.
do $$
declare v_charge uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'd0000000-0000-0000-0000-000000000001',
                      'role', 'authenticated')::text, false);

  select id into v_charge from public.charges
  where establishment_id = 'd4000000-0000-0000-0000-000000000003';

  if v_charge is null then
    raise exception 'El alta del plan Premium tenía que haber emitido su mensualidad';
  end if;

  perform public.register_payment(
    p_charge_id    => v_charge,
    p_amount_cents => (select total_cents from public.charges where id = v_charge),
    p_method       => 'transfer',
    p_paid_at      => now(),
    p_note         => 'Transferencia de demostración');
end $$;

-- ============================================================
-- 10 · Comprobación de "Magariños".
--
-- No comprueba que las filas estén: comprueba lo que la ficha va a LEER,
-- que es otra cosa. Las bolsas salen de `establishment_cycle_allowance()`,
-- el estado del cobro de `charge_status()` y los usuarios de
-- `establishment_client_users()` — las mismas funciones que llaman
-- `sheet-load.ts` y la pantalla del restaurante. Si una de ellas devuelve
-- algo distinto de lo que dice la tabla de la sección 9.5, el sembrado no
-- se da por bueno.
--
-- Sigue puesta la identidad del propietario desde la sección 9.7: las
-- funciones de dinero devuelven error, no nulo, a quien no tiene
-- visibilidad financiera.
-- ============================================================
do $$
declare
  v_est constant uuid := 'd4000000-0000-0000-0000-000000000003';
  v_solicitudes integer;
  v_trabajos integer;
  v_publicados integer;
  v_pequenos integer;
  v_fotos integer;
  v_medianos integer;
  v_grandes integer;
  v_archivos integer;
  v_versiones integer;
  v_usuarios integer;
  v_deuda integer;
  v_por_validar integer;
  v_entrables integer;
  v_solicitud_maqueta uuid;
  v_adjuntos integer;
  v_propuestas integer;
begin
  select count(*) into v_entrables
  from auth.users u
  where u.email in ('magarinos@cuotly.test', 'sala.magarinos@cuotly.test', 'trabajador2@cuotly.test')
    and u.encrypted_password = extensions.crypt('Cuotly-demo-2026', u.encrypted_password)
    and u.email_confirmed_at is not null
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');
  if v_entrables <> 3 then
    raise exception 'Solo % de las 3 identidades nuevas pueden entrar', v_entrables;
  end if;

  select count(*) into v_solicitudes from public.requests where establishment_id = v_est;
  if v_solicitudes <> 19 then
    raise exception 'Se esperaban 19 solicitudes en Magariños y hay %', v_solicitudes;
  end if;

  select count(*) into v_trabajos   from public.jobs where establishment_id = v_est;
  select count(*) into v_publicados from public.jobs where establishment_id = v_est and state = 'published';
  if v_trabajos <> 15 then
    raise exception 'Se esperaban 15 trabajos en Magariños y hay %', v_trabajos;
  end if;
  if v_publicados <> 9 then
    raise exception 'Se esperaban 9 trabajos publicados y hay %', v_publicados;
  end if;

  -- La solicitud que espera al equipo: es la que pone la fila "Pendiente
  -- de validación" en "Necesita atención" del Inicio y de la ficha.
  select id, count(*) over () into v_solicitud_maqueta, v_por_validar
  from public.requests
  where establishment_id = v_est and state = 'pending_internal_validation';
  if coalesce(v_por_validar, 0) <> 1 then
    raise exception 'Se esperaba 1 solicitud pendiente de validación y hay %', coalesce(v_por_validar, 0);
  end if;

  -- Lo que la pantalla de esa solicitud (maqueta 05) va a leer: su
  -- adjunto, por el mismo camino que lo lee ella —el enlace del catálogo,
  -- no `request_attachments`—, y la propuesta que hay que validar. Sin
  -- las dos cosas, la pantalla se ve pero no se ve resuelta.
  select count(*) into v_adjuntos
  from public.file_links
  where entity_type = 'request' and entity_id = v_solicitud_maqueta;
  if v_adjuntos <> 1 then
    raise exception 'La solicitud pendiente de validar tenía que llevar 1 adjunto y lleva %', v_adjuntos;
  end if;

  select count(*) into v_propuestas
  from public.classifications
  where request_id = v_solicitud_maqueta and proposed_category = 'small';
  if v_propuestas <> 1 then
    raise exception 'La solicitud pendiente de validar tenía que tener 1 propuesta y tiene %', v_propuestas;
  end if;

  -- Las bolsas, leídas como las lee el Resumen. `included - remaining` es
  -- lo consumido, y esa resta la hace aquí a propósito el mismo camino que
  -- la pantalla, no una consulta a `consumption_entries`: lo que hay que
  -- comprobar es lo que se va a VER.
  select included - remaining into v_pequenos from public.establishment_cycle_allowance(v_est) where category = 'small';
  select included - remaining into v_fotos    from public.establishment_cycle_allowance(v_est) where category = 'photo';
  select included - remaining into v_medianos from public.establishment_cycle_allowance(v_est) where category = 'medium';
  select included - remaining into v_grandes  from public.establishment_cycle_allowance(v_est) where category = 'large';
  if (v_pequenos, v_fotos, v_medianos, v_grandes) is distinct from (8, 6, 1, 0) then
    raise exception 'Las bolsas tenían que quedar en 8/6/1/0 y están en %/%/%/%',
      v_pequenos, v_fotos, v_medianos, v_grandes;
  end if;

  -- Cinco archivos, no cuatro: los cuatro de la sección 9.6 más el
  -- adjunto de la solicitud pendiente de validar, que el disparador de la
  -- migración 25 vuelca al catálogo con su propia versión.
  select count(*) into v_archivos from public.files where establishment_id = v_est;
  select count(*) into v_versiones from public.file_versions v
  join public.files f on f.id = v.file_id where f.establishment_id = v_est;
  if v_archivos <> 5 then
    raise exception 'Se esperaban 5 archivos y hay %', v_archivos;
  end if;
  if v_versiones <> 8 then
    raise exception 'Se esperaban 8 versiones de archivo y hay %', v_versiones;
  end if;

  select count(*) into v_usuarios from public.establishment_client_users(v_est);
  if v_usuarios <> 2 then
    raise exception 'Se esperaban 2 usuarios del restaurante y hay %', v_usuarios;
  end if;

  select coalesce(public.charge_outstanding_cents(id), 0) into v_deuda
  from public.charges where establishment_id = v_est;
  if v_deuda <> 0 then
    raise exception 'La mensualidad de Magariños tenía que quedar pagada y quedan % céntimos', v_deuda;
  end if;

  raise notice 'Magariños sembrado: % solicitudes (1 por validar, con adjunto y propuesta), % trabajos (% publicados), bolsas %/%/%/%, % archivos con % versiones, % usuarios, mensualidad sin deuda',
    v_solicitudes, v_trabajos, v_publicados, v_pequenos, v_fotos, v_medianos, v_grandes,
    v_archivos, v_versiones, v_usuarios;
end $$;

-- ============================================================
-- 11 · El acceso de Bosco: info@restavor.com entra al espacio sembrado.
--
-- Los siete usuarios de arriba son de mentira (@cuotly.test) y sirven
-- para probar cada papel por separado. El correo con el que se entra a
-- Cuotly de verdad es info@restavor.com —el mismo que reconoce
-- `is_platform_owner()` (migración 06) y el mismo de `CUOTLY_OWNER_EMAIL`—
-- y ese no es un usuario de demostración: es una cuenta real, con su
-- contraseña, creada al registrarse en la aplicación.
--
-- Por eso este bloque NO la crea. Crear aquí una cuenta real con la
-- contraseña de demostración —que está escrita en este archivo, en un
-- repositorio— sería publicar la credencial del administrador. Lo que
-- hace es lo único que le falta cuando ya existe: darle la pertenencia al
-- espacio de demostración como PROPIETARIO, que es lo que hace que vea
-- Magariños, sus solicitudes y todo lo demás. Ser propietario de la
-- plataforma no da acceso a los espacios: el Modo soporte es de la Fase 4
-- (PRD §4.1), así que hasta entonces hace falta una membresía como la de
-- cualquiera.
--
-- Si la cuenta todavía no existe, no falla ni inventa nada: lo dice y se
-- vuelve a ejecutar el sembrado después de haberse registrado una vez.
--
-- A Elena (owner@cuotly.test) no se la toca: es la que suplantan las
-- secciones 6 y 9 para construir los flujos, y quitarla dejaría el
-- sembrado sin poder repetirse. Un espacio con dos propietarios es
-- exactamente lo que dice el modelo que puede haber.
-- ============================================================
do $$
declare
  v_space constant uuid := 'd1000000-0000-0000-0000-000000000001';
  v_bosco uuid;
begin
  select id into v_bosco
  from public.profiles
  where lower(email) = lower('info@restavor.com');

  if v_bosco is null then
    raise notice 'info@restavor.com todavía no tiene cuenta: regístrate una vez en la aplicación con ese correo y vuelve a ejecutar este archivo para que sea propietario del espacio de demostración';
  else
    insert into public.space_memberships (space_id, user_id, role, status, can_perform_jobs)
    values (v_space, v_bosco, 'owner', 'active', true)
    on conflict (space_id, user_id) do update
      set role = 'owner', status = 'active';

    raise notice 'info@restavor.com es propietario del espacio de demostración';
  end if;
end $$;

-- Se suelta la identidad al final, para no dejar la sesión suplantando a
-- nadie si esto se ejecuta dentro de una sesión más larga.
select set_config('request.jwt.claims', '', false);
