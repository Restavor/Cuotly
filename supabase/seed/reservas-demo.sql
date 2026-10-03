-- Sembrado de Reservas (Restavor agents) · Fase B, AGT-05 (PRD de agents §16).
--
-- NO es una migración: solo mete datos de demostración, y se ejecuta DESPUÉS de
-- `espacio-demo.sql` (el proceso de Restavor pruebas ejecuta los `.sql` de esta carpeta por orden
-- alfabético). Todo va en el espacio `demo`, que ya ofrece Reservas (sección 14 del otro archivo).
-- Nunca contra producción.
--
-- Es IDEMPOTENTE: empieza quitando lo que él mismo creó (por sus identificadores y correos fijos)
-- y lo vuelve a construir. Ese borrado no contradice el «no borrar registros de negocio» de
-- CLAUDE.md: son datos de prueba que nunca existieron. Si se rehace `espacio-demo.sql`, el espacio
-- entero se va con sus Reservas y este archivo las vuelve a poner.
--
-- Lo que crea, con la contraseña `Restavor-demo-2026` en todas las cuentas nuevas:
--
--   Casa Pepe ............ (Sevilla, grupo «Casa Pepe») un plan de mantenimiento Y Reservas activa.
--                          cierra los lunes; Comida y Cena de martes a domingo; cerrada el 12/10;
--                          saldo 7,40 €; el agente encendido; la información, las 8 llamadas de hoy
--                          y las 12 reservas del sábado 26/09/2026 de la maqueta.
--       jose@casapepe.test     José García, Propietario (y Encargado de Casa Pepe Centro)
--       maria@casapepe.test    María García, Propietaria
--       luis@casapepe.test     Luis Martín, Encargado (Editor con «Gestionar Reservas»)
--       Equipo sin cuenta: Ana Ruiz (PIN 1234) y Diego Navas (PIN 5678). PIN de la tablet de José 4321 y de
--       Luis 8765 (María, sin PIN todavía).
--   Casa Pepe Centro ..... para el selector de restaurante; sin saldo.
--   Taberna Sol .......... solo Reservas (sin plan de mantenimiento); dos tandas de cena de martes a
--                          sábado (para las alternativas); sin saldo (el caso «sin saldo»).
--       rosa@tabernasol.test   Rosa Prieto, Propietaria
--   Bar La Plaza ......... otro grupo y otra dueña, para el aislamiento; saldo 1,80 €.
--       carla@barlaplaza.test  Carla Sanz, Propietaria
--   Un restaurante por cada estado de Reservas, de quien es Propietario estados@casapepe.test:
--       Bodega Norte (aprobada, sin pagar) · Mesón del Puerto (cobro vencido) · Cervecería Roma
--       (en pausa) · Asador Vega (en baja) · Casa Mar (cerrada), y dos solicitudes:
--       Taberna Levante (pendiente de aprobar) y Café Rechazado (rechazada).
--   soporte@cuotly.test .. un administrador del espacio CON la marca de soporte de Reservas y el segundo
--                          paso (app autenticadora) ya registrado con un secreto de prueba fijo
--                          (`RESTAVORSOPORTEPRUEBASSEGUNDOPAS`, en `docs/agents/PRUEBAS.md`): para
--                          probar «Abrir como soporte» (Fase D, `aal2`). Los e2e generan el código.
--   admin@cuotly.test .... un administrador del espacio SIN la marca de soporte de Reservas, para
--                          comprobar que no ve a los comensales. La marca la llevan Elena
--                          (owner@cuotly.test) e info@restavor.com si ya tiene cuenta.
--   Magariños ............ ya existe (espacio-demo.sql): solo Restavor web, para «Contratar Reservas».
--
-- Lo que NO hace, y por qué:
--
--   · No registra ningún factor TOTP a Elena ni a `info@restavor.com`: `proxy.ts` manda a
--     `/cuenta/verificar` a cualquiera con un factor verificado en cada entrada, y a Elena le
--     rompería todos los recorridos que entran con ella sin código (decisión 106). El segundo paso
--     de prueba (Fase D) lo lleva un usuario de soporte propio, `soporte@cuotly.test`.
--   · No emite cobros ni recibos de Reservas (Fase E): el estado de cada restaurante es el de
--     `reservation_settings`, tal como lo dejaría la aprobación y el barrido.
--   · No sube archivos de verdad: los tres documentos del agente apuntan a rutas del almacenamiento
--     que no existen. La lectura y la subida llegan en la Fase G.
--   · Los PIN del Equipo van cifrados con el secreto de PRUEBAS, `restavor-pruebas-pin-secret`
--     (`AGENTS_PIN_SECRET` de la vista previa de la rama `agents` tiene que valer eso para que
--     1234 y 5678 abran algo en la Fase D).
--
-- Fechas: el sábado 26/09/2026 a las 14:10 (`Europe/Madrid`) es el instante fijo de los tests (los
-- e2e congelan el reloj ahí). Además se copian las reservas de ese día al próximo día abierto desde
-- hoy (sin «No vino»), para tener algo que mirar a mano en cualquier fecha.
--
-- Cómo ejecutarlo:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/espacio-demo.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/reservas-demo.sql

-- ============================================================
-- Guarda: este archivo crea cuentas con una contraseña que está escrita en el repositorio y borra
-- cuentas por su correo. Solo se ejecuta sobre una base que ya tenga el espacio de demostración
-- (`espacio-demo.sql`), que es lo que distingue a Restavor pruebas y a una base local de producción,
-- donde ese espacio nunca existe (decisión 84).
-- ============================================================
do $$
begin
  if not exists (select 1 from public.spaces where slug = 'demo' and id = 'd1000000-0000-0000-0000-000000000001') then
    raise exception 'reservas-demo.sql: falta el espacio de demostración. Ejecuta antes espacio-demo.sql, y solo sobre Restavor pruebas o una base local';
  end if;
end $$;

-- ============================================================
-- 0 · Quitar lo que este archivo creó antes (idempotencia).
-- ============================================================
-- Las tablas de Reservas, los accesos y las suscripciones cuelgan de los restaurantes con
-- `on delete cascade`, así que basta quitar los restaurantes, los grupos y las cuentas.
delete from public.audit_log
where space_id = 'd1000000-0000-0000-0000-000000000001'
  and entity_id in (select id from public.establishments where id::text like 'e5200000-%');
delete from public.establishments where id::text like 'e5200000-%';
delete from public.groups where id::text like 'e5100000-%';
delete from auth.users
where email like '%@casapepe.test' or email like '%@tabernasol.test' or email like '%@barlaplaza.test'
   or email = 'admin@cuotly.test' or email = 'soporte@cuotly.test';

-- ============================================================
-- 1 · Las cuentas.
--
-- Mismas tres cosas que en `espacio-demo.sql` (campos de texto a cadena vacía, una fila en
-- `auth.identities` y la contraseña con coste 10): sin ellas el usuario existe y aun así no entra.
-- ============================================================
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email,
  extensions.crypt('Restavor-demo-2026', extensions.gen_salt('bf', 10)), now(),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', v.nombre), now(), now()
from (values
  ('e5000000-0000-0000-0000-000000000001', 'jose@casapepe.test', 'José García'),
  ('e5000000-0000-0000-0000-000000000002', 'maria@casapepe.test', 'María García'),
  ('e5000000-0000-0000-0000-000000000003', 'luis@casapepe.test', 'Luis Martín'),
  ('e5000000-0000-0000-0000-000000000004', 'rosa@tabernasol.test', 'Rosa Prieto'),
  ('e5000000-0000-0000-0000-000000000005', 'carla@barlaplaza.test', 'Carla Sanz'),
  ('e5000000-0000-0000-0000-000000000006', 'estados@casapepe.test', 'Propietario de los restaurantes de estado'),
  ('e5000000-0000-0000-0000-000000000007', 'admin@cuotly.test', 'Administrador sin soporte de Reservas'),
  ('e5000000-0000-0000-0000-000000000008', 'soporte@cuotly.test', 'Soporte de Reservas')
) as v(id, email, nombre);

insert into auth.identities
  (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
from auth.users u
where u.id::text like 'e5000000-%';

update public.profiles p
set full_name = u.raw_user_meta_data ->> 'full_name'
from auth.users u
where u.id = p.id and u.id::text like 'e5000000-%';

-- Un administrador del espacio, sin la marca de soporte de Reservas. Elena y, si ya tiene cuenta,
-- info@restavor.com sí la llevan (decisión 92: quien abre una sesión de soporte de Reservas).
insert into public.space_memberships (space_id, user_id, role, status)
values ('d1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000007', 'admin', 'active')
on conflict (space_id, user_id) do update set role = 'admin', status = 'active';

-- Un usuario de soporte propio (decisión 106, Fase D): administrador del espacio, con la marca y con el segundo paso.
insert into public.space_memberships (space_id, user_id, role, status)
values ('d1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000008', 'admin', 'active')
on conflict (space_id, user_id) do update set role = 'admin', status = 'active';

update public.space_memberships
set can_support_reservations = true
where space_id = 'd1000000-0000-0000-0000-000000000001'
  and user_id in (
    'd0000000-0000-0000-0000-000000000001',
    'e5000000-0000-0000-0000-000000000008',
    (select id from public.profiles where lower(email) = lower('info@restavor.com'))
  );

-- El segundo paso de `soporte@cuotly.test`: un factor TOTP ya verificado, con un secreto de prueba fijo (base32). En el
-- Supabase real la tabla tiene la columna `secret`; la emulación de las suites (`bootstrap-postgres-local.sql`) no, y
-- sin ella el factor existe pero no hay código que generar (ahí solo se comprueba lo que la base lee: que hay un factor).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'auth' and table_name = 'mfa_factors' and column_name = 'secret') then
    execute $q$
      insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
      values ('e5000000-0000-0000-0000-0000000000f8', 'e5000000-0000-0000-0000-000000000008', 'Autenticador de pruebas',
              'totp', 'verified', now(), now(), 'RESTAVORSOPORTEPRUEBASSEGUNDOPAS')
    $q$;
  else
    execute $q$
      insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
      values ('e5000000-0000-0000-0000-0000000000f8', 'e5000000-0000-0000-0000-000000000008', 'Autenticador de pruebas',
              'totp', 'verified', now(), now())
    $q$;
  end if;
end $$;

-- ============================================================
-- 2 · Grupos, restaurantes y accesos.
--
-- El INSERT en `establishments` dispara `set_establishment_code()`, que pide el siguiente código a
-- `next_space_sequence()` y esa comprueba `is_space_member()` con `auth.uid()`: se suplanta a Elena,
-- que es miembro del espacio (propietaria en CI, administradora en Restavor pruebas).
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'd0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, false);

insert into public.groups (id, space_id, name) values
  ('e5100000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Casa Pepe'),
  ('e5100000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'Taberna Sol'),
  ('e5100000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'Bar La Plaza'),
  ('e5100000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 'Restaurantes de prueba de Reservas');

insert into public.establishments (id, space_id, group_id, name, status, city, phone_primary, website_url) values
  ('e5200000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'Casa Pepe', 'active', 'Sevilla', '954 000 000', 'https://casapepe.es'),
  ('e5200000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'Casa Pepe Centro', 'active', 'Sevilla', null, null),
  ('e5200000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000002', 'Taberna Sol', 'active', null, null, null),
  ('e5200000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000003', 'Bar La Plaza', 'active', null, null, null),
  ('e5200000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000004', 'Bodega Norte', 'active', null, null, null),
  ('e5200000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000004', 'Mesón del Puerto', 'active', null, null, null),
  ('e5200000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000004', 'Cervecería Roma', 'active', null, null, null),
  ('e5200000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000004', 'Asador Vega', 'active', null, null, null),
  ('e5200000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000004', 'Casa Mar', 'active', null, null, null),
  ('e5200000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000004', 'Taberna Levante', 'active', null, null, null),
  ('e5200000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000004', 'Café Rechazado', 'active', null, null, null);

-- Quién entra en cada uno. José: Propietario de Casa Pepe y Encargado de Casa Pepe Centro (para el
-- selector de restaurante). Luis: Encargado de Casa Pepe. El de «estados» es el Propietario de los
-- siete restaurantes de prueba de estados y solicitudes.
insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('e5500000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'local_owner'),
  ('e5500000-0000-0000-0000-000000000002', 'e5200000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000002', 'local_owner'),
  ('e5500000-0000-0000-0000-000000000003', 'e5200000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000003', 'editor'),
  ('e5500000-0000-0000-0000-000000000004', 'e5200000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001', 'editor'),
  ('e5500000-0000-0000-0000-000000000005', 'e5200000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000004', 'local_owner'),
  ('e5500000-0000-0000-0000-000000000006', 'e5200000-0000-0000-0000-000000000004', 'e5000000-0000-0000-0000-000000000005', 'local_owner');

insert into public.establishment_memberships (establishment_id, user_id, role)
select e.id, 'e5000000-0000-0000-0000-000000000006', 'local_owner'
from public.establishments e
where e.id::text like 'e5200000-%' and e.id::text >= 'e5200000-0000-0000-0000-000000000005';

insert into public.establishment_permissions (establishment_membership_id, manage_reservations) values
  ('e5500000-0000-0000-0000-000000000003', true),
  ('e5500000-0000-0000-0000-000000000004', true);

-- ============================================================
-- 3 · El plan de mantenimiento de Casa Pepe (Impulso en créditos, el que ya existe en `demo`) y el
-- servicio Reservas de cada restaurante que lo tiene.
--
-- A mano y no con las funciones de verdad, por lo mismo que en `espacio-demo.sql`: aprobar una
-- solicitud de Reservas, el cobro y el pago son de la Fase E. La suscripción a Reservas solo la
-- admite un disparador si se avisa de que viene de la aprobación (RN-APP-03): el ajuste de sesión
-- `restavor.reservations_approval` lo hace, y se vuelve a apagar al final.
-- ============================================================
insert into public.subscriptions (id, space_id, establishment_id, kind, plan_id, status, started_at, created_by)
values ('e5300000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
        'e5200000-0000-0000-0000-000000000001', 'plan', 'd2000000-0000-0000-0000-000000000004',
        'active', now() - interval '40 days', 'd0000000-0000-0000-0000-000000000001');

insert into public.plan_commitments
  (space_id, establishment_id, subscription_id, plan_id, started_at, ends_at, cause, created_by)
values ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001',
        'e5300000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000004',
        now() - interval '40 days', now() + interval '50 days', 'initial',
        'd0000000-0000-0000-0000-000000000001');

select set_config('restavor.reservations_approval', 'on', false);

-- (restaurante, estado del servicio, suscripción activa o cancelada)
insert into public.subscriptions (id, space_id, establishment_id, kind, service_id, status, started_at, created_by)
select v.sub::uuid, 'd1000000-0000-0000-0000-000000000001', v.est::uuid, 'service',
       (select id from public.services where space_id = 'd1000000-0000-0000-0000-000000000001' and kind = 'reservations'),
       v.estado, now() - interval '60 days', 'd0000000-0000-0000-0000-000000000001'
from (values
  ('e5300000-0000-0000-0000-000000000011', 'e5200000-0000-0000-0000-000000000001', 'active'),
  ('e5300000-0000-0000-0000-000000000012', 'e5200000-0000-0000-0000-000000000002', 'active'),
  ('e5300000-0000-0000-0000-000000000013', 'e5200000-0000-0000-0000-000000000003', 'active'),
  ('e5300000-0000-0000-0000-000000000014', 'e5200000-0000-0000-0000-000000000004', 'active'),
  ('e5300000-0000-0000-0000-000000000015', 'e5200000-0000-0000-0000-000000000005', 'active'),
  ('e5300000-0000-0000-0000-000000000016', 'e5200000-0000-0000-0000-000000000006', 'active'),
  ('e5300000-0000-0000-0000-000000000017', 'e5200000-0000-0000-0000-000000000007', 'active'),
  ('e5300000-0000-0000-0000-000000000018', 'e5200000-0000-0000-0000-000000000008', 'active'),
  ('e5300000-0000-0000-0000-000000000019', 'e5200000-0000-0000-0000-000000000009', 'cancelled')
) as v(sub, est, estado);

select set_config('restavor.reservations_approval', 'off', false);

-- ============================================================
-- 4 · El ciclo de vida de Reservas de cada restaurante (`reservation_settings`) y sus apuntes.
-- ============================================================
insert into public.reservation_settings
  (id, space_id, establishment_id, subscription_id, service_status, activated_at, ending_at, closed_at,
   onboarding_completed_at, public_slug, local_phone_e164, transfer_phone_e164, forwarding_note)
select
  v.id::uuid, 'd1000000-0000-0000-0000-000000000001', v.est::uuid, v.sub::uuid, v.estado,
  case when v.estado = 'approved_pending_payment' then null else now() - interval '55 days' end,
  case when v.estado = 'ending' then now() + interval '12 days' end,
  case when v.estado = 'closed' then now() - interval '9 days' end,
  case when v.estado in ('active', 'past_due', 'paused', 'ending') then now() - interval '54 days' end,
  v.slug, v.local_phone, v.transfer_phone, v.nota
from (values
  ('e5400000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000011', 'active', 'casa-pepe', '+34954000000', '+34600123456', 'No contestáis en 4 tonos.'),
  ('e5400000-0000-0000-0000-000000000002', 'e5200000-0000-0000-0000-000000000002', 'e5300000-0000-0000-0000-000000000012', 'active', 'casa-pepe-centro', null, null, null),
  ('e5400000-0000-0000-0000-000000000003', 'e5200000-0000-0000-0000-000000000003', 'e5300000-0000-0000-0000-000000000013', 'active', 'taberna-sol', null, null, null),
  ('e5400000-0000-0000-0000-000000000004', 'e5200000-0000-0000-0000-000000000004', 'e5300000-0000-0000-0000-000000000014', 'active', 'bar-la-plaza', null, null, null),
  ('e5400000-0000-0000-0000-000000000005', 'e5200000-0000-0000-0000-000000000005', 'e5300000-0000-0000-0000-000000000015', 'approved_pending_payment', 'bodega-norte', null, null, null),
  ('e5400000-0000-0000-0000-000000000006', 'e5200000-0000-0000-0000-000000000006', 'e5300000-0000-0000-0000-000000000016', 'past_due', 'meson-del-puerto', null, null, null),
  ('e5400000-0000-0000-0000-000000000007', 'e5200000-0000-0000-0000-000000000007', 'e5300000-0000-0000-0000-000000000017', 'paused', 'cerveceria-roma', null, null, null),
  ('e5400000-0000-0000-0000-000000000008', 'e5200000-0000-0000-0000-000000000008', 'e5300000-0000-0000-0000-000000000018', 'ending', 'asador-vega', null, null, null),
  ('e5400000-0000-0000-0000-000000000009', 'e5200000-0000-0000-0000-000000000009', 'e5300000-0000-0000-0000-000000000019', 'closed', 'casa-mar', null, null, null)
) as v(id, est, sub, estado, slug, local_phone, transfer_phone, nota);

-- Los teléfonos y la nota de Casa Pepe son de PRD §16; el resto de restaurantes no los tiene todavía.

-- Los apuntes del ciclo de vida: de cada restaurante, los que llevan hasta su estado.
insert into public.reservation_service_events (space_id, establishment_id, type, data)
select s.space_id, s.establishment_id, t.tipo, '{}'::jsonb
from public.reservation_settings s
join lateral (values ('approved'), ('activated'), ('past_due'), ('paused'), ('ending'), ('closed')) as t(tipo)
  on (
    t.tipo = 'approved'
    or (t.tipo = 'activated' and s.service_status <> 'approved_pending_payment')
    or (t.tipo = 'past_due' and s.service_status in ('past_due', 'paused'))
    or (t.tipo = 'paused' and s.service_status = 'paused')
    or (t.tipo = 'ending' and s.service_status in ('ending', 'closed'))
    or (t.tipo = 'closed' and s.service_status = 'closed')
  )
where s.id::text like 'e5400000-%';

-- Las dos solicitudes: una pendiente de aprobar y una rechazada (con su motivo).
insert into public.reservation_service_requests
  (id, space_id, establishment_id, requested_by, status, rejection_reason, service_version_id,
   terms_accepted_by, terms_accepted_at, reviewed_by, reviewed_at)
select
  v.id::uuid, 'd1000000-0000-0000-0000-000000000001', v.est::uuid,
  'e5000000-0000-0000-0000-000000000006', v.estado, v.motivo,
  (select sv.id from public.service_versions sv
     join public.services s on s.lineage_id = sv.service_id
    where s.space_id = 'd1000000-0000-0000-0000-000000000001' and s.kind = 'reservations'
    order by sv.version desc limit 1),
  'e5000000-0000-0000-0000-000000000006', now() - interval '6 days',
  case when v.estado = 'rejected' then 'd0000000-0000-0000-0000-000000000001'::uuid end,
  case when v.estado = 'rejected' then now() - interval '3 days' end
from (values
  ('e5600000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000010', 'requested', null),
  ('e5600000-0000-0000-0000-000000000002', 'e5200000-0000-0000-0000-000000000011', 'rejected', 'De momento no damos de alta restaurantes de esa zona.')
) as v(id, est, estado, motivo);

insert into public.reservation_service_events (space_id, establishment_id, request_id, type, data)
select r.space_id, r.establishment_id, r.id, t.tipo, '{}'::jsonb
from public.reservation_service_requests r
join lateral (values ('requested'), ('terms_accepted'), ('rejected')) as t(tipo)
  on (t.tipo in ('requested', 'terms_accepted') or r.status = 'rejected')
where r.id::text like 'e5600000-%';

-- ============================================================
-- 5 · Turnos y días cerrados.
-- ============================================================
insert into public.reservation_shifts
  (id, space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity, sort_order)
values
  -- Casa Pepe: cierra los lunes; Comida y Cena de martes (2) a domingo (7).
  ('e5700000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'Comida', '{2,3,4,5,6,7}', '13:00', '16:00', '15:00', 40, 1),
  ('e5700000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'Cena', '{2,3,4,5,6,7}', '20:00', '23:30', '22:30', 60, 2),
  -- Casa Pepe Centro: solo cena.
  ('e5700000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000002', 'Cena', '{2,3,4,5,6,7}', '20:00', '23:30', '22:30', 40, 1),
  -- Taberna Sol: dos tandas de martes a sábado (las alternativas de RN-RES-04).
  ('e5700000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000003', 'Cena 1ª tanda', '{2,3,4,5,6}', '20:00', '21:30', '21:00', 30, 1),
  ('e5700000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000003', 'Cena 2ª tanda', '{2,3,4,5,6}', '22:00', '23:30', '23:00', 30, 2),
  -- Bar La Plaza.
  ('e5700000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000004', 'Cena', '{2,3,4,5,6,7}', '20:00', '23:30', '22:30', 30, 1);

insert into public.reservation_closed_dates (space_id, establishment_id, date, reason) values
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', '2026-10-12', 'Fiesta Nacional');

-- ============================================================
-- 6 · El Equipo de Casa Pepe (sin cuenta, con PIN) y las personas con cuenta.
--
-- El PIN se guarda cifrado con el secreto de PRUEBAS, que no es ningún secreto de producción.
-- Ana 1234 y Diego 5678 (Equipo); José, Propietario, 4321 y Luis, Encargado, 8765 (para «Ajustes con PIN» en la
-- tablet); María, Propietaria, sin PIN todavía (para ver «Sin PIN todavía»).
-- ============================================================
insert into public.reservation_staff (id, space_id, establishment_id, kind, name, user_id, pin_hmac) values
  ('e5800000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'staff', 'Ana Ruiz', null,
   encode(extensions.hmac('1234', 'restavor-pruebas-pin-secret', 'sha256'), 'hex')),
  ('e5800000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'staff', 'Diego Navas', null,
   encode(extensions.hmac('5678', 'restavor-pruebas-pin-secret', 'sha256'), 'hex')),
  ('e5800000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'member', 'José García', 'e5000000-0000-0000-0000-000000000001',
   encode(extensions.hmac('4321', 'restavor-pruebas-pin-secret', 'sha256'), 'hex')),
  ('e5800000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'member', 'María García', 'e5000000-0000-0000-0000-000000000002', null),
  ('e5800000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'member', 'Luis Martín', 'e5000000-0000-0000-0000-000000000003',
   encode(extensions.hmac('8765', 'restavor-pruebas-pin-secret', 'sha256'), 'hex'));

-- ============================================================
-- 7 · Las conexiones de Casa Pepe y su error.
--
-- Sin credenciales: no hay ninguna plataforma real detrás (los conectores reales llegan en la Fase I).
-- ============================================================
insert into public.reservation_platform_connections
  (id, space_id, establishment_id, provider, display_name, status, capabilities, last_sync_at, last_error, last_error_at)
values
  ('e5900000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001',
   'demo', 'TheFork', 'connected', '{"can_cancel": true, "can_modify": false, "has_webhooks": true}',
   timestamptz '2026-09-26 14:05+02', null, null),
  ('e5900000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001',
   'demo', 'CoverManager', 'error', '{"can_cancel": true, "can_modify": false, "has_webhooks": false}',
   timestamptz '2026-09-26 11:50+02', 'Las credenciales ya no son válidas.', timestamptz '2026-09-26 12:00+02');

insert into public.reservation_incidents (space_id, establishment_id, kind, severity, title, detail, created_at)
values ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'platform', 'error',
        'CoverManager no conecta', 'Las credenciales ya no son válidas. Desde las 12:00 no entran reservas de CoverManager.',
        timestamptz '2026-09-26 12:00+02');

-- ============================================================
-- 8 · Las reservas.
--
-- Primero las 12 del sábado 26/09/2026 de la maqueta (AgentsHoy), con nombres y notas del PRD §16.
-- Los teléfonos son de mentira (rango 600 00x xxx). Se guardan con su hora local de Madrid.
-- ============================================================
drop table if exists seed_reservas;
create temp table seed_reservas (
  clave text primary key, fecha date, hora time, personas int, nombre text, telefono text, email text,
  nota text, origen text, estado text, nueva boolean, plataforma text, externo text, turno uuid, motivo text,
  creada_por uuid
);

insert into seed_reservas
  (clave, fecha, hora, personas, nombre, telefono, email, nota, origen, estado, nueva, plataforma, externo, turno, motivo, creada_por)
values
  ('lucia',  '2026-09-26', '13:30', 2, 'Lucía Fernández', '+34600000101', null, null, 'platform', 'confirmed', false, 'TheFork', 'TF-1001', 'e5700000-0000-0000-0000-000000000001', null, null),
  ('raul',   '2026-09-26', '13:30', 2, 'Raúl Moreno', '+34600000102', null, null, 'manual', 'no_show', false, null, null, 'e5700000-0000-0000-0000-000000000001', null, 'e5800000-0000-0000-0000-000000000001'),
  ('javier', '2026-09-26', '14:00', 4, 'Javier Ruiz', '+34612345678', null, 'Una trona', 'agent', 'confirmed', true, null, null, 'e5700000-0000-0000-0000-000000000001', null, null),
  ('carmen', '2026-09-26', '14:00', 3, 'Carmen Ortiz', '+34600000104', null, null, 'manual', 'confirmed', false, null, null, 'e5700000-0000-0000-0000-000000000001', null, 'e5800000-0000-0000-0000-000000000001'),
  ('andres', '2026-09-26', '14:30', 12, 'Andrés Martínez', '+34699874120', null, null, 'agent', 'pending', false, null, null, 'e5700000-0000-0000-0000-000000000001', null, null),
  ('pablo',  '2026-09-26', '14:30', 2, 'Pablo Serrano', '+34600000106', 'pablo.serrano@example.test', 'Terraza si es posible', 'web', 'confirmed', false, null, null, 'e5700000-0000-0000-0000-000000000001', null, null),
  ('elena',  '2026-09-26', '15:00', 2, 'Elena Castro', '+34600000107', null, null, 'platform', 'cancelled', false, 'CoverManager', 'CM-2001', 'e5700000-0000-0000-0000-000000000001', 'platform', null),
  ('marta',  '2026-09-26', '20:30', 4, 'Marta López', '+34687440219', null, null, 'agent', 'confirmed', true, null, null, 'e5700000-0000-0000-0000-000000000002', null, null),
  ('sergio', '2026-09-26', '21:00', 6, 'Sergio Gil', '+34600000109', null, 'Alergia al marisco', 'platform', 'confirmed', false, 'TheFork', 'TF-1002', 'e5700000-0000-0000-0000-000000000002', null, null),
  ('nuria',  '2026-09-26', '21:00', 2, 'Nuria Vidal', '+34600000110', 'nuria.vidal@example.test', null, 'web', 'confirmed', false, null, null, 'e5700000-0000-0000-0000-000000000002', null, null),
  ('tomas',  '2026-09-26', '21:30', 2, 'Tomás Herrera', '+34600000111', null, null, 'manual', 'confirmed', false, null, null, 'e5700000-0000-0000-0000-000000000002', null, 'e5800000-0000-0000-0000-000000000002'),
  ('ivan',   '2026-09-26', '22:00', 5, 'Iván Rojas', '+34600000112', null, null, 'platform', 'confirmed', false, 'TheFork', 'TF-1003', 'e5700000-0000-0000-0000-000000000002', null, null),
  -- Lo que cuentan las llamadas de la maqueta (AgentsAgente): un cambio y una cancelación.
  ('carlos', '2026-09-30', '21:00', 6, 'Carlos Vega', '+34644118776', null, null, 'agent', 'confirmed', false, null, null, 'e5700000-0000-0000-0000-000000000002', null, null),
  ('rocio',  '2026-09-27', '21:00', 2, 'Rocío Díaz', '+34622915330', null, null, 'agent', 'cancelled', false, null, null, 'e5700000-0000-0000-0000-000000000002', 'agent', null),
  -- Dos posibles duplicadas: mismo teléfono y mismo día (RN-RES-06).
  ('laura1', '2026-09-27', '13:30', 2, 'Laura Vega', '+34677001122', null, null, 'agent', 'confirmed', false, null, null, 'e5700000-0000-0000-0000-000000000001', null, null),
  ('laura2', '2026-09-27', '14:00', 2, 'Laura Vega', '+34677001122', 'laura.vega@example.test', null, 'web', 'confirmed', false, null, null, 'e5700000-0000-0000-0000-000000000001', null, null);

-- Más reservas repartidas por septiembre: tres por día abierto, con nombres, orígenes y tamaños que
-- se reparten por turnos. Deterministas: la misma base da siempre las mismas.
insert into seed_reservas
  (clave, fecha, hora, personas, nombre, telefono, email, nota, origen, estado, nueva, plataforma, externo, turno, motivo, creada_por)
select
  'mes-' || d.dia || '-' || n.i,
  d.dia,
  (array['13:30', '14:00', '15:00', '20:30', '21:00', '22:00'])[1 + ((extract(day from d.dia)::int + n.i * 2) % 6)]::time,
  2 + ((extract(day from d.dia)::int + n.i) % 5),
  (array['Alba Moreno', 'Bruno Sáez', 'Clara Ibáñez', 'Daniel Pons', 'Eva Quirós', 'Félix Ramos', 'Gloria Soto',
         'Hugo Tena', 'Inés Ugarte', 'Jaime Valls', 'Lola Zamora', 'Mario Arce', 'Nora Belda', 'Óscar Cano',
         'Paula Diez', 'Rubén Esteve'])[1 + ((extract(day from d.dia)::int * 3 + n.i * 5) % 16)],
  '+346' || lpad((1000 + extract(day from d.dia)::int * 10 + n.i)::text, 8, '0'),
  null, null,
  (array['agent', 'web', 'manual', 'agent'])[1 + ((extract(day from d.dia)::int + n.i) % 4)],
  'confirmed', false, null, null, null, null, null
from (
  select g::date as dia
  from generate_series(date '2026-09-01', date '2026-09-30', interval '1 day') g
  where extract(isodow from g) <> 1 and g::date <> date '2026-09-26'
) d
cross join (values (0), (1), (2)) as n(i);

-- El turno de cada reserva del mes, según su hora: antes de las 17:00 es Comida; si no, Cena.
update seed_reservas
set turno = case when hora < time '17:00' then 'e5700000-0000-0000-0000-000000000001'::uuid
                 else 'e5700000-0000-0000-0000-000000000002'::uuid end
where turno is null;

-- Además, una copia de las 12 del 26/09 (sin «No vino») al próximo día abierto desde hoy, en Madrid.
do $$
declare
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_dia date := v_hoy;
begin
  -- Casa Pepe cierra los lunes (isodow 1) y el 12/10/2026.
  while extract(isodow from v_dia) = 1 or v_dia = date '2026-10-12' loop
    v_dia := v_dia + 1;
  end loop;

  if v_dia <> date '2026-09-26' then
    insert into seed_reservas
      (clave, fecha, hora, personas, nombre, telefono, email, nota, origen, estado, nueva, plataforma, externo, turno, motivo, creada_por)
    select
      'copia-' || r.clave, v_dia, r.hora, r.personas, r.nombre, r.telefono, r.email, r.nota, r.origen, r.estado, r.nueva,
      r.plataforma, case when r.externo is null then null else r.externo || '-' || to_char(v_dia, 'YYYYMMDD') end,
      r.turno, r.motivo, r.creada_por
    from seed_reservas r
    where r.fecha = date '2026-09-26' and r.estado <> 'no_show';
  end if;
end $$;

-- Casa Pepe: las reservas, con su hora local de Madrid y los rastros de cada una.
insert into public.reservations
  (id, space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, email,
   notes, language, status, source, platform_connection_id, external_id, platform_name, is_new, duplicate_flag,
   whatsapp_consent, cancel_reason, cancelled_at, created_by_staff_id)
select
  gen_random_uuid(), 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', r.turno,
  r.fecha, r.hora, (r.fecha + r.hora) at time zone 'Europe/Madrid', r.personas, r.nombre, r.telefono, r.email,
  r.nota, 'es', r.estado, r.origen,
  case r.plataforma when 'TheFork' then 'e5900000-0000-0000-0000-000000000001'::uuid
                    when 'CoverManager' then 'e5900000-0000-0000-0000-000000000002'::uuid end,
  r.externo, r.plataforma, r.nueva,
  case when r.clave in ('laura1', 'laura2') then 'possible' else 'none' end,
  r.origen in ('agent', 'web'), r.motivo,
  case when r.estado = 'cancelled' then (r.fecha + r.hora) at time zone 'Europe/Madrid' - interval '40 minutes' end,
  r.creada_por
from seed_reservas r;

drop table seed_reservas;

-- Lo que cuentan las llamadas del día (sección 9) se enlaza al final de esa sección.

-- ============================================================
-- 9 · El agente de llamadas de Casa Pepe: estado, horario, información y las 8 llamadas de hoy.
-- ============================================================
insert into public.agent_state (space_id, establishment_id, manual_state, schedule_mode, changed_at)
select 'd1000000-0000-0000-0000-000000000001', e.id, 'on', 'always', now()
from public.establishments e
where e.id::text like 'e5200000-%' and e.id::text <= 'e5200000-0000-0000-0000-000000000004';

-- Las ocho llamadas del sábado 26/09/2026 (AgentsAgente), con su coste y su resultado.
insert into public.agent_calls
  (id, space_id, establishment_id, external_call_id, started_at, ended_at, duration_seconds, caller_e164, outcome,
   forward_reason, summary, transferred_to_e164, cost_original_micros, cost_currency, fx_rate, cost_eur_micros)
select
  v.id::uuid, 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001',
  'call-20260926-' || replace(v.hora, ':', ''),
  (date '2026-09-26' + v.hora::time) at time zone 'Europe/Madrid',
  (date '2026-09-26' + v.hora::time) at time zone 'Europe/Madrid' + make_interval(secs => v.segundos),
  v.segundos, v.telefono, v.resultado, null, v.resumen,
  case when v.resultado = 'transferred' then '+34600123456' end,
  v.coste, 'EUR', 1, v.coste
from (values
  ('e5a00000-0000-0000-0000-000000000001', '13:52', 95, '+34687440219', 'booked', 'Marta López · hoy 20:30 · 4 personas.', 170000),
  ('e5a00000-0000-0000-0000-000000000002', '13:41', 52, '+34655210998', 'question', 'Preguntó si hay aparcamiento. Le explicó que hay un parking público a 2 minutos.', 90000),
  ('e5a00000-0000-0000-0000-000000000003', '12:58', 40, '+34611003457', 'transferred', 'Quería hablar con el encargado. Pasó la llamada al 600 123 456.', 70000),
  ('e5a00000-0000-0000-0000-000000000004', '12:15', 151, '+34699874120', 'group_pending', 'Andrés Martínez · hoy 14:30 · 12 personas. Queda pendiente de que la confirméis.', 260000),
  ('e5a00000-0000-0000-0000-000000000005', '11:32', 108, '+34612345678', 'booked', 'Javier Ruiz · hoy 14:00 · 4 personas. Pidió una trona.', 190000),
  ('e5a00000-0000-0000-0000-000000000006', '11:05', 31, '+34633781004', 'hung_up', 'Colgó antes de decir qué quería.', 50000),
  ('e5a00000-0000-0000-0000-000000000007', '10:48', 62, '+34644118776', 'modified', 'Carlos Vega cambió su reserva del miércoles 30 a las 21:00: de 4 a 6 personas.', 110000),
  ('e5a00000-0000-0000-0000-000000000008', '10:20', 72, '+34622915330', 'cancelled', 'Rocío Díaz canceló su reserva de mañana a las 21:00 (2 personas).', 130000)
) as v(id, hora, segundos, telefono, resultado, resumen, coste);

-- La reserva de cada llamada y, en las que la crearon, el identificador de la llamada (PRD §8.4).
update public.reservations r
set agent_call_id = c.id, agent_external_call_id = c.external_call_id
from public.agent_calls c
where r.establishment_id = 'e5200000-0000-0000-0000-000000000001'
  and r.date = date '2026-09-26'
  and ((r.customer_name = 'Marta López' and c.id = 'e5a00000-0000-0000-0000-000000000001')
    or (r.customer_name = 'Javier Ruiz' and c.id = 'e5a00000-0000-0000-0000-000000000005')
    or (r.customer_name = 'Andrés Martínez' and c.id = 'e5a00000-0000-0000-0000-000000000004'));

update public.agent_calls c
set reservation_id = r.id
from public.reservations r
where c.establishment_id = r.establishment_id
  and ((c.id = 'e5a00000-0000-0000-0000-000000000001' and r.customer_name = 'Marta López' and r.date = date '2026-09-26')
    or (c.id = 'e5a00000-0000-0000-0000-000000000005' and r.customer_name = 'Javier Ruiz' and r.date = date '2026-09-26')
    or (c.id = 'e5a00000-0000-0000-0000-000000000004' and r.customer_name = 'Andrés Martínez' and r.date = date '2026-09-26')
    or (c.id = 'e5a00000-0000-0000-0000-000000000007' and r.customer_name = 'Carlos Vega')
    or (c.id = 'e5a00000-0000-0000-0000-000000000008' and r.customer_name = 'Rocío Díaz'));

-- Información del agente: instrucciones, web, ficha de conocimiento, preguntas y documentos.
insert into public.agent_knowledge_settings (space_id, establishment_id, instructions, read_website, website_url, website_text, website_read_at)
values ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001',
        E'Si preguntan por celebraciones de más de 20 personas, pasa la llamada al encargado.\nNo prometas mesa en la terraza: apúntalo en la reserva como preferencia.\nSi preguntan si hay menú del día un domingo, di que solo lo hay de martes a viernes.',
        true, 'https://casapepe.es', null, null);

insert into public.agent_knowledge_snapshots (space_id, establishment_id, version, content, content_hash, delivery_status, created_at)
values ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 1,
        'Ficha de conocimiento de Casa Pepe (sembrado de prueba).', 'sembrado-v1', 'not_needed',
        date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid' + interval '12 hours 40 minutes');

insert into public.agent_knowledge_faqs (space_id, establishment_id, question, answer, sort_order) values
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', '¿Hay aparcamiento?', 'No tenemos parking propio. Hay un parking público a 2 minutos andando.', 1),
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', '¿Tenéis menú del día?', 'Sí, de martes a viernes a mediodía, con bebida y postre. El precio está en la carta.', 2),
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', '¿Se puede ir con perro?', 'Sí, en la terraza. Dentro, solo perros de asistencia.', 3),
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', '¿Tenéis terraza?', 'Sí. No se puede reservar una mesa concreta en la terraza, pero lo apuntamos como preferencia.', 4),
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', '¿Tenéis opciones sin gluten?', 'Sí, varios platos. Díganos la alergia al reservar y la cocina lo tendrá en cuenta.', 5);

-- Los tres documentos. Los archivos apuntan a rutas que NO existen en el almacenamiento: la subida y
-- la lectura de verdad son de la Fase G (la categoría `agent_knowledge` está pendiente de decidir,
-- decisión 109, así que se guardan como «documentos»).
insert into public.files (id, space_id, group_id, establishment_id, category, visibility, name, created_by) values
  ('e5b00000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'documents', 'internal', 'Carta de otoño', 'd0000000-0000-0000-0000-000000000001'),
  ('e5b00000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'documents', 'internal', 'Alérgenos de la carta', 'd0000000-0000-0000-0000-000000000001'),
  ('e5b00000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'documents', 'internal', 'Menú de grupos 2026', 'd0000000-0000-0000-0000-000000000001');

insert into public.file_versions (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, created_by) values
  ('e5b00000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 1, 'sembrado/no-existe/carta-de-otono.pdf', 'carta-de-otoño.pdf', 'application/pdf', 1024, 'd0000000-0000-0000-0000-000000000001'),
  ('e5b00000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 1, 'sembrado/no-existe/alergenos.pdf', 'alérgenos.pdf', 'application/pdf', 1024, 'd0000000-0000-0000-0000-000000000001'),
  ('e5b00000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 1, 'sembrado/no-existe/menu-de-grupos.jpg', 'menu-de-grupos.jpg', 'image/jpeg', 1024, 'd0000000-0000-0000-0000-000000000001');

insert into public.agent_knowledge_documents
  (space_id, establishment_id, file_id, title, kind, status, extracted_text, pages, created_at)
values
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'e5b00000-0000-0000-0000-000000000001', 'Carta de otoño', 'pdf', 'ready', 'Texto de la carta de otoño (sembrado de prueba).', 4, timestamptz '2026-09-20 11:00+02'),
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'e5b00000-0000-0000-0000-000000000002', 'Alérgenos de la carta', 'pdf', 'ready', 'Texto de los alérgenos (sembrado de prueba).', 2, timestamptz '2026-09-20 11:05+02'),
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'e5b00000-0000-0000-0000-000000000003', 'Menú de grupos 2026', 'image', 'reading', null, 1, timestamptz '2026-09-26 12:38+02');

-- ============================================================
-- 10 · El saldo.
--
-- Casa Pepe termina en 7,40 € con el gasto de septiembre de la maqueta (AgentsSaldo): 212 llamadas,
-- 182 avisos de WhatsApp y 6 SMS. Un apunte por cada uso, en millonésimas de euro (decisión 94):
--   · hoy, las 8 llamadas de arriba (1,07 €) y 5 WhatsApp (0,08 €);
--   · el viernes 25, 11 llamadas (1,52 €); el resto del mes, las llamadas y avisos que faltan.
--   · jueves 24, una recarga de 20 € (sin IVA: el IVA no es saldo), otra de 20 € el 3 de septiembre y
--     un ajuste de apertura de 5,76 € para que cuadre.
-- Bar La Plaza termina en 1,80 €. El resto, a cero.
-- ============================================================
insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, source_id, note, created_at)
values
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'adjustment', 5760000, null, null,
   'Saldo de apertura del sembrado de prueba', timestamptz '2026-09-01 08:00+02'),
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'topup', 20000000, 'topup', null,
   'Recarga con tarjeta (sembrado)', timestamptz '2026-09-03 10:00+02'),
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'topup', 20000000, 'topup', null,
   'Recarga con tarjeta (sembrado)', timestamptz '2026-09-24 10:00+02');

-- Las 8 llamadas de hoy, cada una con su apunte y el identificador de su llamada.
insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, source_id, created_at)
select c.space_id, c.establishment_id, 'call', -c.cost_eur_micros, 'call', c.id, c.ended_at
from public.agent_calls c
where c.id::text like 'e5a00000-%';

-- 5 WhatsApp de hoy: 0,016 € cada uno.
insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, created_at)
select 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'whatsapp', -16000, 'notification',
       timestamptz '2026-09-26 09:00+02' + make_interval(mins => i * 40)
from generate_series(1, 5) i;

-- El viernes 25, 11 llamadas: 10 de 0,138 € y una de 0,140 € (1,52 € en total).
insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, created_at)
select 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'call',
       -(case when i = 11 then 140000 else 138000 end), 'call',
       timestamptz '2026-09-25 12:00+02' + make_interval(mins => i * 35)
from generate_series(1, 11) i;

-- El resto de septiembre: 193 llamadas por 32,27 € (167.202 µ€ y 14 apuntes con una millonésima más)…
insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, created_at)
select 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'call',
       -(case when i <= 14 then 167203 else 167202 end), 'call',
       timestamptz '2026-09-01 12:00+02' + make_interval(hours => (i * 3) % 580)
from generate_series(1, 193) i;

-- …177 WhatsApp por 2,94 € (16.610 µ€ y 30 apuntes con una millonésima más)…
insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, created_at)
select 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'whatsapp',
       -(case when i <= 30 then 16611 else 16610 end), 'notification',
       timestamptz '2026-09-01 11:00+02' + make_interval(hours => (i * 4) % 580)
from generate_series(1, 177) i;

-- …y 6 SMS por 0,48 € (0,08 € cada uno).
insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, created_at)
select 'd1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'sms', -80000, 'notification',
       timestamptz '2026-09-05 11:00+02' + make_interval(days => i * 4)
from generate_series(1, 6) i;

insert into public.agent_topups
  (space_id, establishment_id, net_cents, vat_cents, total_cents, vat_rate_percent, status, created_at)
values
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 2000, 420, 2420, 21, 'paid', timestamptz '2026-09-03 10:00+02'),
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 2000, 420, 2420, 21, 'paid', timestamptz '2026-09-24 10:00+02');

-- Bar La Plaza: 1,80 €. Una recarga de 10 € y llamadas por 8,20 €.
insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, note, created_at) values
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000004', 'topup', 10000000, 'topup', 'Recarga con tarjeta (sembrado)', timestamptz '2026-09-10 10:00+02'),
  ('d1000000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000004', 'call', -8200000, 'call', 'Llamadas del mes (sembrado)', timestamptz '2026-09-20 10:00+02');

-- ============================================================
-- 11 · Los rastros de cada reserva (`reservation_events`, SIN datos personales) y las cifras del mes.
-- ============================================================
insert into public.reservation_events (space_id, establishment_id, reservation_id, type, actor_type, actor_staff_id, actor_label, data, created_at)
select r.space_id, r.establishment_id, r.id, 'created',
       case r.source when 'agent' then 'agent' when 'platform' then 'platform' when 'web' then 'web' else 'staff' end,
       r.created_by_staff_id,
       case r.source when 'agent' then 'Agente' when 'platform' then r.platform_name when 'web' then 'Web' end,
       jsonb_build_object('source', r.source, 'party_size', r.party_size),
       r.starts_at - interval '2 days'
from public.reservations r
where r.establishment_id = 'e5200000-0000-0000-0000-000000000001';

insert into public.reservation_events (space_id, establishment_id, reservation_id, type, actor_type, actor_staff_id, actor_label, data, created_at)
select r.space_id, r.establishment_id, r.id,
       case r.status when 'cancelled' then 'cancelled' else 'no_show' end,
       case when r.platform_name is not null then 'platform' when r.cancel_reason = 'agent' then 'agent' else 'staff' end,
       null,
       case when r.platform_name is not null then r.platform_name when r.cancel_reason = 'agent' then 'Agente' end,
       jsonb_build_object('reason', coalesce(r.cancel_reason, 'no_show')),
       r.starts_at
from public.reservations r
where r.establishment_id = 'e5200000-0000-0000-0000-000000000001' and r.status in ('cancelled', 'no_show');

-- El cambio de Carlos Vega por teléfono: cuenta QUÉ cambió, nunca el dato (RN-RES-12).
insert into public.reservation_events (space_id, establishment_id, reservation_id, type, actor_type, actor_label, data, created_at)
select r.space_id, r.establishment_id, r.id, 'updated', 'agent', 'Agente',
       '{"changed": ["party_size"], "party_size_from": 4, "party_size_to": 6}'::jsonb,
       timestamptz '2026-09-26 10:48+02'
from public.reservations r
where r.establishment_id = 'e5200000-0000-0000-0000-000000000001' and r.customer_name = 'Carlos Vega';

-- Cifras de septiembre de Casa Pepe por origen: las reservas vivas y, para el agente, las llamadas de la maqueta.
insert into public.reservation_monthly_stats
  (space_id, establishment_id, month, source, reservations_count, people_count, calls_count, call_minutes)
select r.space_id, r.establishment_id, date '2026-09-01', r.source,
       count(*) filter (where r.status in ('pending', 'confirmed')),
       coalesce(sum(r.party_size) filter (where r.status in ('pending', 'confirmed')), 0),
       case when r.source = 'agent' then 212 else 0 end,
       case when r.source = 'agent' then 332 else 0 end
from public.reservations r
where r.establishment_id = 'e5200000-0000-0000-0000-000000000001' and r.date between date '2026-09-01' and date '2026-09-30'
group by r.space_id, r.establishment_id, r.source;

-- Se suelta la identidad al final, para no dejar la sesión suplantando a nadie.
select set_config('request.jwt.claims', '', false);

-- ============================================================
-- 12 · Comprobación: lo que el sembrado promete, comprobado con las funciones de verdad.
-- ============================================================
do $$
declare
  v_casa constant uuid := 'e5200000-0000-0000-0000-000000000001';
  v_n integer;
begin
  -- El saldo de Casa Pepe es 7,40 € y el de Bar La Plaza, 1,80 €.
  if public.agent_balance(v_casa) <> 7400000 then
    raise exception 'El saldo de Casa Pepe tenía que ser 7,40 € (7.400.000 µ€) y es % µ€', public.agent_balance(v_casa);
  end if;
  if public.agent_balance('e5200000-0000-0000-0000-000000000004') <> 1800000 then
    raise exception 'El saldo de Bar La Plaza tenía que ser 1,80 €';
  end if;

  -- El 26/09: 12 reservas de la maqueta, 42 personas vivas (23 en la comida) y una pendiente.
  select count(*) into v_n from public.reservations where establishment_id = v_casa and date = date '2026-09-26';
  if v_n <> 12 then raise exception 'El 26/09 tenía que haber 12 reservas y hay %', v_n; end if;
  select coalesce(sum(party_size), 0) into v_n from public.reservations
  where establishment_id = v_casa and date = date '2026-09-26' and status in ('pending', 'confirmed');
  if v_n <> 42 then raise exception 'El 26/09 tenía que haber 42 personas vivas y hay %', v_n; end if;
  select coalesce(sum(party_size), 0) into v_n from public.reservations
  where establishment_id = v_casa and date = date '2026-09-26' and status in ('pending', 'confirmed') and time < time '17:00';
  if v_n <> 23 then raise exception 'La comida del 26/09 tenía que tener 23 personas y tiene %', v_n; end if;

  -- Las ocho llamadas cuestan 1,07 €.
  select coalesce(sum(cost_eur_micros), 0) into v_n from public.agent_calls where establishment_id = v_casa;
  if v_n <> 1070000 then raise exception 'Las 8 llamadas tenían que costar 1,07 € y cuestan % µ€', v_n; end if;

  -- Cada restaurante con Reservas está en su estado.
  select count(distinct service_status) into v_n from public.reservation_settings where id::text like 'e5400000-%';
  if v_n <> 6 then raise exception 'Tenía que haber un restaurante en cada uno de los 6 estados de Reservas y hay %', v_n; end if;

  -- Una solicitud pendiente y otra rechazada.
  if (select count(*) from public.reservation_service_requests where id::text like 'e5600000-%' and status = 'requested') <> 1
     or (select count(*) from public.reservation_service_requests where id::text like 'e5600000-%' and status = 'rejected') <> 1 then
    raise exception 'Tenía que haber una solicitud pendiente y otra rechazada';
  end if;

  -- Solo Reservas: Taberna Sol no tiene plan de mantenimiento ni otro servicio (lo contesta su dueña:
  -- la función pregunta por quien llama), y Casa Pepe, que sí tiene plan, no lo es.
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e5000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, false);
  set local role authenticated;
  if public.establishment_is_reservations_only('e5200000-0000-0000-0000-000000000003') is not true then
    reset role;
    raise exception 'Taberna Sol tenía que ser un restaurante «solo Reservas»';
  end if;
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e5000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, false);
  set local role authenticated;
  if public.establishment_is_reservations_only(v_casa) is not false then
    reset role;
    raise exception 'Casa Pepe tiene plan de mantenimiento: no es «solo Reservas»';
  end if;
  reset role;

  -- Quién ve qué (RLS): el Propietario de La Plaza no lee ni una reserva de Casa Pepe.
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text, false);
  set local role authenticated;
  if exists (select 1 from public.reservations where establishment_id = v_casa) then
    reset role;
    raise exception 'Carla (Bar La Plaza) lee reservas de Casa Pepe';
  end if;
  reset role;

  -- El administrador del espacio sin la marca de soporte no ve a los comensales.
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e5000000-0000-0000-0000-000000000007', 'role', 'authenticated', 'aal', 'aal2')::text, false);
  set local role authenticated;
  if exists (select 1 from public.reservations) then
    reset role;
    raise exception 'El administrador sin soporte de Reservas lee reservas';
  end if;
  reset role;

  -- José entra como Propietario en Casa Pepe y como Encargado en Casa Pepe Centro.
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e5000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, false);
  set local role authenticated;
  if public.reservations_my_role(v_casa) is distinct from 'owner'
     or public.reservations_my_role('e5200000-0000-0000-0000-000000000002') is distinct from 'manager' then
    reset role;
    raise exception 'José tenía que ser Propietario de Casa Pepe y Encargado de Casa Pepe Centro';
  end if;
  reset role;

  -- Soporte de Reservas: marcado y con segundo paso; el administrador de al lado, no.
  if not exists (select 1 from public.space_memberships
                 where space_id = 'd1000000-0000-0000-0000-000000000001' and user_id = 'e5000000-0000-0000-0000-000000000008'
                   and can_support_reservations)
     or exists (select 1 from public.space_memberships
                where space_id = 'd1000000-0000-0000-0000-000000000001' and user_id = 'e5000000-0000-0000-0000-000000000007'
                  and can_support_reservations) then
    raise exception 'La marca de soporte de Reservas la lleva soporte@cuotly.test y no admin@cuotly.test';
  end if;
  if not exists (select 1 from auth.mfa_factors
                 where user_id = 'e5000000-0000-0000-0000-000000000008' and factor_type = 'totp' and status = 'verified') then
    raise exception 'soporte@cuotly.test tenía que tener un factor TOTP verificado';
  end if;

  perform set_config('request.jwt.claims', '', false);
  raise notice 'Reservas: Casa Pepe, Casa Pepe Centro, Taberna Sol, Bar La Plaza y los restaurantes de estado están sembrados';
end $$;
