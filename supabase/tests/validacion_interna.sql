-- Lo que la pantalla de validación interna (maqueta 05 · §20.4, HU-11)
-- lee y hace, comprobado contra la base y no contra la pantalla.
--
-- La pantalla nueva no añade ni una tabla ni una función: se apoya entera
-- en lo que ya existía (requests, classifications, timer_events,
-- audit_log, file_links + files + file_versions, y
-- establishment_cycle_allowance). Precisamente por eso hace falta esta
-- suite: una pantalla que solo consulta se rompe en silencio si una de
-- esas lecturas deja de estar permitida —vuelve vacía y parece "todavía no
-- hay nada"— y se convierte en una fuga si una de ellas empieza a estar
-- permitida de más.
--
-- Se comprueban las cinco cosas de las que depende:
--
--   1. Que el equipo puede leer TODO lo que la pantalla pinta.
--   2. Que el restaurante NO puede leer la propuesta (RN-CLS-04): el
--      cliente no ve nada de la clasificación hasta que se valida
--      (RN-CLS-03), y esta pantalla es justo el sitio donde vive esa
--      propuesta.
--   3. Que validar es cosa de propietario o administrador, y que el botón
--      no es lo que lo impide: un trabajador que llame a la función
--      directamente se lleva un error (CLAUDE.md, MUST).
--   4. Que "Validar propuesta" —el botón de un clic, que manda la
--      categoría y el resumen propuestos tal cual— deja exactamente lo
--      mismo que escribir esos valores a mano.
--   5. Que al validar se para el contador de primera atención (RN-SLA-03),
--      que es lo que la pantalla dice en el recuadro del plazo.
--
-- Mismo patrón que el resto de `supabase/tests/`: bloques `do $$ ... end
-- $$` que lanzan una excepción real, `set role` (sin LOCAL) para que RLS
-- de verdad se active, y limpieza al final.
--
-- Cómo ejecutarlo:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/validacion_interna.sql

-- ============================================================
-- Preparación: un espacio con propietario y trabajador, un restaurante
-- con su propietario local, plan con bolsa de pequeños y SLA de 24 h, y
-- una solicitud enviada con un adjunto.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('a0000000-0000-0000-0000-000000000001', 'vi-owner@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000002', 'vi-worker@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000003', 'vi-client@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('a1000000-0000-0000-0000-000000000001', 'Espacio VI', 'espacio-vi-test', 'Europe/Madrid',
   'a0000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Grupo VI');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001', 'EST-VI-A', 'Restaurante VI');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'local_owner');

-- El trabajador queda autorizado en el restaurante: así, cuando más abajo
-- se le niegue validar, se le niega por la capacidad y no por no tener
-- acceso al restaurante, que es otra cosa.
insert into public.worker_establishments (space_id, user_id, establishment_id) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'a3000000-0000-0000-0000-000000000001');

-- Plan con bolsa de pequeños y primera atención de 24 h (RN-SLA-02,
-- RN-COM-02): es de donde salen "1 cambio pequeño" y "quedan N h".
insert into public.plans
  (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours)
values
  ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'Plan VI', 59900, 25, 24, 5, 1, 24);

-- El alta va con su función y no con un INSERT: `create_plan_subscription()`
-- crea además el ciclo de consumos, y sin ciclo abierto
-- `establishment_cycle_allowance()` devuelve cero filas —que es justo el
-- caso "no se ha podido calcular" de la pantalla, no el que se quiere
-- probar aquí—.
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', false);

do $$
begin
  perform public.create_plan_subscription(
    'a3000000-0000-0000-0000-000000000001'::uuid,
    'a4000000-0000-0000-0000-000000000001'::uuid);
end $$;

reset role;

-- El restaurante redacta, adjunta y envía. Todo con sus funciones, que es
-- como ocurre de verdad.
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', false);

do $$
declare
  v_req uuid;
begin
  v_req := public.create_request_draft(
    'a3000000-0000-0000-0000-000000000001',
    'Actualizar los precios de la carta. Cambiar el precio del menú de 18 € a 19 € en la carta.',
    null);

  -- El adjunto entra con la solicitud en borrador, que es cuando la
  -- política de `request_attachments` lo permite. El disparador de la
  -- migración 25 lo vuelca al catálogo, y es del catálogo de donde lo lee
  -- la pantalla.
  insert into public.request_attachments
    (request_id, space_id, establishment_id, storage_path, file_name, mime_type, size_bytes, created_by)
  values
    (v_req, 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
     'vi/carta-actual.pdf', 'Carta actual.pdf', 'application/pdf', 327680,
     'a0000000-0000-0000-0000-000000000003');

  perform public.submit_request(v_req);
  perform public.begin_request_analysis(v_req);
end $$;

reset role;

-- La propuesta la graba el servidor de confianza, nunca el cliente
-- (RN-CLS-01: la llamada a Anthropic sale del servidor).
set role service_role;

do $$
declare
  v_req uuid;
begin
  select id into v_req from public.requests where space_id = 'a1000000-0000-0000-0000-000000000001';

  perform public.record_classification(
    v_req, 'a0000000-0000-0000-0000-000000000003'::uuid, 'rules', 'small',
    'Actualizar un precio existente.',
    null, null, null, null, null, 'Sin clave de IA configurada');
end $$;

reset role;

-- ============================================================
-- 1 · El equipo lee todo lo que la pantalla pinta.
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', false);

do $$
declare
  v_req uuid;
  v_estado text;
  v_propuestas integer;
  v_eventos integer;
  v_auditoria integer;
  v_adjuntos integer;
  v_versiones integer;
  v_bolsa integer;
  v_puede boolean;
begin
  select id, state into v_req, v_estado
  from public.requests where space_id = 'a1000000-0000-0000-0000-000000000001';

  if v_req is null then
    raise exception 'El equipo no ve la solicitud de su propio espacio' using errcode = 'assert_failure';
  end if;

  -- Estado de la maqueta: analizada y esperando al equipo (RN-CLS-03).
  if v_estado <> 'pending_internal_validation' then
    raise exception 'La solicitud tenía que estar pendiente de validación interna y está en %', v_estado
      using errcode = 'assert_failure';
  end if;

  -- La propuesta, que es la tarjeta de la derecha (RN-CLS-04: solo el equipo).
  select count(*) into v_propuestas
  from public.classifications
  where request_id = v_req and proposed_category = 'small'
    and proposed_summary = 'Actualizar un precio existente.'
    and source = 'rules' and fallback_reason is not null;
  if v_propuestas <> 1 then
    raise exception 'El equipo no lee la propuesta de clasificación (encontradas %)', v_propuestas
      using errcode = 'assert_failure';
  end if;

  -- El reloj de primera atención, que es el recuadro del plazo. Se
  -- recalcula desde estos eventos, nunca desde un contador guardado (CA-10).
  select count(*) into v_eventos
  from public.timer_events
  where entity_type = 'request' and entity_id = v_req and counter_kind = 't1';
  if v_eventos < 1 then
    raise exception 'El equipo no lee los eventos de T1 de la solicitud' using errcode = 'assert_failure';
  end if;

  -- El historial, que sale del libro de auditoría y no de una tabla propia
  -- (§21.2, CA-15). Tienen que estar el envío y la clasificación.
  select count(*) into v_auditoria
  from public.audit_log
  where entity_type = 'request' and entity_id = v_req
    and action in ('request.submitted', 'request.classified');
  if v_auditoria < 2 then
    raise exception 'El historial de la solicitud no llega entero al equipo (% acciones)', v_auditoria
      using errcode = 'assert_failure';
  end if;

  -- El adjunto, por el mismo camino que lo lee la pantalla: el enlace del
  -- catálogo, no `request_attachments`.
  select count(*) into v_adjuntos
  from public.file_links l
  join public.files f on f.id = l.file_id
  where l.entity_type = 'request' and l.entity_id = v_req;
  if v_adjuntos <> 1 then
    raise exception 'El adjunto no llega al equipo por el catálogo (encontrados %)', v_adjuntos
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_versiones
  from public.file_versions v
  join public.file_links l on l.file_id = v.file_id
  where l.entity_type = 'request' and l.entity_id = v_req
    and v.file_name = 'Carta actual.pdf' and v.mime_type = 'application/pdf'
    and v.size_bytes = 327680;
  if v_versiones <> 1 then
    raise exception 'El tipo y el tamaño del adjunto no llegan al equipo' using errcode = 'assert_failure';
  end if;

  -- La bolsa del ciclo, que es de donde sale "Consumo estimado".
  select remaining into v_bolsa
  from public.establishment_cycle_allowance('a3000000-0000-0000-0000-000000000001')
  where category = 'small';
  if coalesce(v_bolsa, 0) <> 25 then
    raise exception 'La bolsa de pequeños tenía que estar entera (25) y vale %', coalesce(v_bolsa, -1)
      using errcode = 'assert_failure';
  end if;

  select public.has_capability('a1000000-0000-0000-0000-000000000001', 'manage_requests') into v_puede;
  if not v_puede then
    raise exception 'El propietario tenía que poder gestionar solicitudes' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- 2 · RN-CLS-04 · el restaurante NO ve la propuesta. Ve su solicitud y su
-- adjunto, que son suyos, y nada de la clasificación hasta que se valide.
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', false);

do $$
declare
  v_req uuid;
  v_propuestas integer;
  v_suyas integer;
  v_adjuntos integer;
  v_resumen text;
begin
  select id, validated_summary into v_req, v_resumen
  from public.requests where space_id = 'a1000000-0000-0000-0000-000000000001';

  select count(*) into v_suyas from public.requests where id = v_req;
  if v_suyas <> 1 then
    raise exception 'El restaurante no ve su propia solicitud' using errcode = 'assert_failure';
  end if;

  select count(*) into v_propuestas from public.classifications where request_id = v_req;
  if v_propuestas <> 0 then
    raise exception 'RN-CLS-04 FALLIDO: el restaurante lee la propuesta antes de validarla (% filas)', v_propuestas
      using errcode = 'assert_failure';
  end if;

  if v_resumen is not null then
    raise exception 'RN-CLS-03 FALLIDO: el restaurante ya tiene un resumen validado que nadie ha validado'
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_adjuntos
  from public.file_links l where l.entity_type = 'request' and l.entity_id = v_req;
  if v_adjuntos <> 1 then
    raise exception 'El restaurante no ve el archivo que él mismo adjuntó (encontrados %)', v_adjuntos
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- 3 · Validar es de propietario o administrador (RN-CLS-03). Que el botón
-- no se le pinte a un trabajador NO es el control: el control es que la
-- función le diga que no.
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', false);

do $$
declare
  v_req uuid;
  v_puede boolean;
begin
  select id into v_req from public.requests where space_id = 'a1000000-0000-0000-0000-000000000001';

  select public.has_capability('a1000000-0000-0000-0000-000000000001', 'manage_requests') into v_puede;
  if v_puede then
    raise exception 'Un trabajador no puede tener manage_requests' using errcode = 'assert_failure';
  end if;

  begin
    perform public.validate_classification(v_req, 'small', 'Validado por quien no debe.');
    raise exception 'CLAUDE.md FALLIDO: un trabajador ha validado la clasificación'
      using errcode = 'assert_failure';
  exception
    when insufficient_privilege or raise_exception then
      null; -- lo esperado: la función lo rechaza
  end;

  -- Y tampoco por el otro lado: pedir información y rechazar son la misma
  -- capacidad, y los dos formularios están en esta misma pantalla.
  begin
    perform public.request_more_information(v_req, 'Cuéntame más.');
    raise exception 'CLAUDE.md FALLIDO: un trabajador ha pedido información'
      using errcode = 'assert_failure';
  exception
    when insufficient_privilege or raise_exception then
      null;
  end;
end $$;

reset role;

-- ============================================================
-- 4 y 5 · "Validar propuesta": el botón de un clic manda la categoría y el
-- resumen propuestos tal cual, y eso deja la solicitud esperando al
-- cliente con el contador de primera atención PARADO (RN-SLA-03).
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', false);

do $$
declare
  v_req uuid;
  v_categoria text;
  v_resumen text;
  v_estado text;
  v_ultimo text;
  v_validada integer;
begin
  select id into v_req from public.requests where space_id = 'a1000000-0000-0000-0000-000000000001';

  -- Lo que el botón envía es lo que la pantalla acaba de leer.
  select proposed_category, proposed_summary into v_categoria, v_resumen
  from public.classifications where request_id = v_req
  order by created_at desc limit 1;

  perform public.validate_classification(v_req, v_categoria, v_resumen);

  select state, validated_category, validated_summary into v_estado, v_categoria, v_resumen
  from public.requests where id = v_req;

  if v_estado <> 'pending_client_acceptance' then
    raise exception 'Tras validar, la solicitud tenía que quedar esperando al cliente y está en %', v_estado
      using errcode = 'assert_failure';
  end if;

  if v_categoria <> 'small' or v_resumen <> 'Actualizar un precio existente.' then
    raise exception 'Validar la propuesta tal cual no guardó los valores propuestos (% / %)', v_categoria, v_resumen
      using errcode = 'assert_failure';
  end if;

  -- RN-SLA-03 · T1 se detiene al pasar a `pending_client_acceptance`. Es
  -- lo que hace que el recuadro del plazo deje de decir "quedan N h" y
  -- pase a decir por qué está parado.
  select event_type into v_ultimo
  from public.timer_events
  where entity_type = 'request' and entity_id = v_req and counter_kind = 't1'
  order by occurred_at desc, created_at desc
  limit 1;

  if v_ultimo not in ('stopped', 'paused') then
    raise exception 'RN-SLA-03 FALLIDO: T1 sigue corriendo después de validar (último evento: %)', v_ultimo
      using errcode = 'assert_failure';
  end if;

  -- Y queda en el historial, que es la línea nueva de la lista de abajo.
  select count(*) into v_validada
  from public.audit_log
  where entity_type = 'request' and entity_id = v_req
    and action = 'request.classification_validated';
  if v_validada <> 1 then
    raise exception 'La validación no quedó en el historial (% apuntes)', v_validada
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Ahora sí: lo validado es lo único de la clasificación que el
-- restaurante llega a leer, y lo lee de su propia solicitud.
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', false);

do $$
declare
  v_resumen text;
  v_propuestas integer;
begin
  select validated_summary into v_resumen
  from public.requests where space_id = 'a1000000-0000-0000-0000-000000000001';

  if v_resumen is distinct from 'Actualizar un precio existente.' then
    raise exception 'El restaurante no lee el alcance validado (leyó %)', coalesce(v_resumen, 'NULL')
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_propuestas from public.classifications;
  if v_propuestas <> 0 then
    raise exception 'RN-CLS-04 FALLIDO: el restaurante lee la propuesta después de validarla (% filas)', v_propuestas
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- Limpieza: no deja nada de esto en la base de datos real.
-- ============================================================
select set_config('request.jwt.claims', '', false);

delete from public.audit_log where space_id = 'a1000000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'a1000000-0000-0000-0000-000000000001';
delete from auth.users where email like 'vi-%@example.com';

do $$
declare
  v_spaces int;
  v_users int;
begin
  select count(*) into v_spaces from public.spaces where slug = 'espacio-vi-test';
  select count(*) into v_users from auth.users where email like 'vi-%@example.com';

  if v_spaces <> 0 or v_users <> 0 then
    raise exception 'LIMPIEZA FALLIDA: spaces=%, auth.users=% (todo debía ser 0)', v_spaces, v_users;
  end if;
end $$;

select 'validacion_interna.sql: la pantalla de la maqueta 05 lee lo suyo, el cliente no ve la propuesta y validar para T1' as resultado;
