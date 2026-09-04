-- §68 · RN-MSG-10 — "Convertir en solicitud" y la revisión del borrador
-- (migración 20260904000051), verificado contra la base de datos real.
--
-- Qué comprueba, y por qué cada cosa:
--   · RN-MSG-10 · convertir crea un BORRADOR, no una solicitud enviada, y
--     arrastra los mensajes señalados con sus adjuntos. El borrador guarda
--     de qué conversación salió, que es lo que permite volver al hilo para
--     comprobar lo que se arrastró;
--   · RN-SLA-01 · el contador de primera atención NO arranca al convertir.
--     Si arrancara, el plazo contractual estaría corriendo mientras nadie
--     ha pedido nada todavía — que es justo lo que §68 evita al exigir una
--     revisión antes de enviar;
--   · §68 "se revisa el ALCANCE" · el borrador se puede reescribir, y cada
--     cambio real deja versión en `request_versions` (RN-DAT-07). Guardar
--     sin cambiar nada no inventa una versión;
--   · §68 "se revisan los ARCHIVOS" · se puede quitar del borrador un
--     adjunto que no venía a cuento y añadir uno que sí. Quitarlo borra el
--     ENLACE y no el archivo: el catálogo y el mensaje del que vino lo
--     conservan (CLAUDE.md MUST NOT, "no se borra físicamente un registro
--     de negocio");
--   · CLAUDE.md MUST · el control está en el servidor y no en la pantalla:
--     el rol Consulta (RN-MSG-05) lee la conversación y no puede
--     convertirla; el equipo de mantenimiento no redacta solicitudes en
--     nombre del cliente (la frontera del Hito 4,
--     `can_write_establishment`); un cliente de otro restaurante no toca
--     este borrador ni sabiendo su identificador;
--   · la ventana se cierra al enviar: con la solicitud ya enviada no se
--     cambia el alcance ni se tocan los archivos (RN-ARC-07, "vinculado a
--     una operación");
--   · que `anon` no puede llamar a ninguna de las tres funciones nuevas
--     (CLAUDE.md: Supabase concede EXECUTE por defecto a toda función
--     nueva).
--
-- Cada comprobación negativa ("no puede") va con su positiva ("pero quien
-- corresponde sí"), porque una negativa sola pasa también cuando la fila
-- no existe o cuando la función está rota para todo el mundo.
--
-- Comprobado por mutación: quitarle a `update_request_draft()` la
-- comprobación `v_state <> 'draft'` hace fallar este archivo, y quitarle
-- el `can_write_establishment()` también.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/conversion_a_solicitud.sql

-- ============================================================
-- Fixture: un espacio con propietario y una trabajadora, un grupo con dos
-- restaurantes, y en el A un propietario local (escribe) y una cuenta de
-- Consulta (solo lee, RN-MSG-05). El B tiene su propio cliente y sirve
-- para el archivo que no es de este establecimiento.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('68000000-0000-0000-0000-000000000001', 'conv-owner@example.com', 'authenticated', 'authenticated'),
  ('68000000-0000-0000-0000-000000000002', 'conv-eva@example.com', 'authenticated', 'authenticated'),
  ('68000000-0000-0000-0000-000000000003', 'conv-cliente-a@example.com', 'authenticated', 'authenticated'),
  ('68000000-0000-0000-0000-000000000004', 'conv-consulta-a@example.com', 'authenticated', 'authenticated'),
  ('68000000-0000-0000-0000-000000000005', 'conv-cliente-b@example.com', 'authenticated', 'authenticated'),
  ('68000000-0000-0000-0000-000000000006', 'conv-grupo@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('68100000-0000-0000-0000-000000000001', 'Espacio Conversion', 'espacio-conversion-test',
   '68000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('68100000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('68100000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000002', 'worker', 'active');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('68200000-0000-0000-0000-000000000001', '68100000-0000-0000-0000-000000000001', 'Impulso Conversion', 39900, 16, 12, 3, 0, 24);

insert into public.groups (id, space_id, name) values
  ('68300000-0000-0000-0000-000000000001', '68100000-0000-0000-0000-000000000001', 'Grupo Conversion');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('68400000-0000-0000-0000-000000000001', '68100000-0000-0000-0000-000000000001', '68300000-0000-0000-0000-000000000001', 'EST-CNV-A', 'Restaurante Conversion A'),
  ('68400000-0000-0000-0000-000000000002', '68100000-0000-0000-0000-000000000001', '68300000-0000-0000-0000-000000000001', 'EST-CNV-B', 'Restaurante Conversion B');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('68500000-0000-0000-0000-000000000001', '68400000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000003', 'local_owner'),
  ('68500000-0000-0000-0000-000000000002', '68400000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000004', 'consulta'),
  ('68500000-0000-0000-0000-000000000003', '68400000-0000-0000-0000-000000000002', '68000000-0000-0000-0000-000000000005', 'local_owner');

-- El propietario global del grupo escribe en los DOS restaurantes y ve los
-- archivos de los dos. Es la única identidad con la que se puede probar de
-- verdad que un archivo del B no entra en un borrador del A: cualquier
-- otra se estrellaría antes contra `can_read_file()`, y la comprobación
-- del establecimiento pasaría sin ejercitarse (se comprobó por mutación:
-- quitándola, el test seguía en verde hasta que apareció esta cuenta).
insert into public.group_memberships (group_id, user_id, role) values
  ('68300000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000006', 'global_owner');

select set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.create_plan_subscription('68400000-0000-0000-0000-000000000001', '68200000-0000-0000-0000-000000000001');

  create temporary table conv_ctx (key text primary key, value text);
  grant select, insert, update on conv_ctx to authenticated, service_role;
end $$;

reset role;

-- ============================================================
-- RN-MSG-10 · convertir la conversación general en un BORRADOR, con sus
-- mensajes y sus adjuntos. Y RN-SLA-01: sin arrancar el contador.
-- ============================================================
select set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_conversation_id uuid;
  v_relevante uuid;
  v_suelto uuid;
  v_file_id uuid;
  v_request_id uuid;
  v_state text;
  v_description text;
  v_source uuid;
  v_adjuntos integer;
begin
  v_conversation_id := public.get_or_create_establishment_conversation('68400000-0000-0000-0000-000000000001');

  v_relevante := public.post_message(v_conversation_id, 'Queremos cambiar la foto de la portada por una del salón nuevo.');
  v_suelto := public.post_message(v_conversation_id, 'Por cierto, el jueves cerramos por la tarde.');

  v_file_id := public.register_file(
    '68400000-0000-0000-0000-000000000001', 'photos', 'Salón nuevo',
    'cnv/salon.jpg', 'salon.jpg', 'image/jpeg', 900000
  );
  perform public.attach_file_to_message(v_relevante, v_file_id);

  -- Solo el mensaje relevante. El otro se queda en la conversación: §68
  -- habla de "los mensajes RELEVANTES", no del hilo entero.
  v_request_id := public.convert_conversation_to_request(
    v_conversation_id, array[v_relevante], 'Portada de la web'
  );

  insert into conv_ctx values
    ('conversation', v_conversation_id::text),
    ('message_relevante', v_relevante::text),
    ('message_suelto', v_suelto::text),
    ('file_salon', v_file_id::text),
    ('request', v_request_id::text);

  select state, description, source_conversation_id
  into v_state, v_description, v_source
  from public.requests where id = v_request_id;

  if v_state <> 'draft' then
    raise exception 'RN-MSG-10 FALLIDO: convertir debería crear un borrador, creó una solicitud en estado %', v_state
      using errcode = 'assert_failure';
  end if;

  if v_description !~ 'salón nuevo' then
    raise exception 'RN-MSG-10 FALLIDO: el borrador no arrastró el texto del mensaje señalado'
      using errcode = 'assert_failure';
  end if;

  -- La positiva de la negativa que viene: el mensaje que no se señaló no
  -- entra en el borrador.
  if v_description ~ 'jueves cerramos' then
    raise exception 'RN-MSG-10 FALLIDO: el borrador arrastró un mensaje que nadie señaló'
      using errcode = 'assert_failure';
  end if;

  if v_source is distinct from v_conversation_id then
    raise exception '§68 FALLIDO: el borrador no guarda de qué conversación salió (source_conversation_id = %)', v_source
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_adjuntos from public.file_links
  where entity_type = 'request' and entity_id = v_request_id;
  if v_adjuntos <> 1 then
    raise exception 'RN-MSG-10 FALLIDO: el borrador no arrastró el adjunto del mensaje (enlaces = %)', v_adjuntos
      using errcode = 'assert_failure';
  end if;

end $$;

reset role;

-- RN-SLA-01 · T1 arranca al ENVIAR, no al convertir: un borrador que
-- arrancara el contador pondría a correr el plazo contractual antes de que
-- nadie haya pedido nada.
--
-- Se comprueba SIN sesión de cliente a propósito: `timer_events` es del
-- equipo y el restaurante no lee esa tabla, así que contar desde su sesión
-- daría cero siempre y esta comprobación —y la simétrica de más abajo, la
-- que exige que al enviar SÍ arranque— pasarían por el motivo equivocado.
do $$
declare
  v_request_id uuid := (select value::uuid from conv_ctx where key = 'request');
  v_timers integer;
begin
  select count(*) into v_timers from public.timer_events
  where entity_type = 'request' and entity_id = v_request_id;
  if v_timers <> 0 then
    raise exception 'RN-SLA-01 FALLIDO: convertir arrancó el contador de primera atención (% eventos)', v_timers
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- §68 · "antes de enviar se revisa el ALCANCE". Y RN-DAT-07: cada cambio
-- real deja su versión.
-- ============================================================
select set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from conv_ctx where key = 'request');
  v_version integer;
  v_versiones integer;
  v_description text;
  v_context text;
begin
  v_version := public.update_request_draft(
    v_request_id,
    'Cambiar la foto de la portada por la del salón nuevo, en horizontal.',
    'Página de inicio'
  );

  if v_version <> 2 then
    raise exception 'RN-DAT-07 FALLIDO: reescribir el borrador debería dejar la versión 2, dejó la %', v_version
      using errcode = 'assert_failure';
  end if;

  select description, context into v_description, v_context
  from public.requests where id = v_request_id;

  if v_description !~ 'en horizontal' then
    raise exception '§68 FALLIDO: el alcance revisado no se guardó'
      using errcode = 'assert_failure';
  end if;

  if v_context is distinct from 'Página de inicio' then
    raise exception '§68 FALLIDO: el contexto revisado no se guardó (quedó %)', v_context
      using errcode = 'assert_failure';
  end if;

  -- La versión 1 sigue ahí: es la que salió de pegar los mensajes, y es
  -- con la que se compara lo que acabó enviándose (RN-DAT-07).
  if not exists (
    select 1 from public.request_versions
    where request_id = v_request_id and version_number = 1 and description ~ 'salón nuevo'
  ) then
    raise exception 'RN-DAT-07 FALLIDO: se perdió la versión 1 del borrador'
      using errcode = 'assert_failure';
  end if;

  -- Guardar sin cambiar nada no es una versión nueva.
  v_version := public.update_request_draft(
    v_request_id,
    'Cambiar la foto de la portada por la del salón nuevo, en horizontal.',
    'Página de inicio'
  );

  select count(*) into v_versiones from public.request_versions where request_id = v_request_id;
  if v_versiones <> 2 then
    raise exception 'RN-DAT-07 FALLIDO: guardar sin cambios inventó una versión (versiones = %)', v_versiones
      using errcode = 'assert_failure';
  end if;

end $$;

reset role;

-- El apunte de auditoría del cambio de alcance, con el antes y el después
-- (CLAUDE.md MUST). Se comprueba SIN sesión de cliente a propósito: el
-- restaurante no lee `audit_log` (§21.2, "cliente: nada"), así que
-- preguntarlo desde su sesión daría cero filas y el test pasaría por el
-- motivo equivocado.
do $$
declare
  v_request_id uuid := (select value::uuid from conv_ctx where key = 'request');
begin
  if not exists (
    select 1 from public.audit_log
    where action = 'request.draft_updated' and entity_id = v_request_id
      and old_value ? 'description' and new_value ? 'description'
  ) then
    raise exception 'CLAUDE.md MUST FALLIDO: cambiar el alcance del borrador no dejó apunte de auditoría con valor anterior y nuevo'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- §68 · "antes de enviar se revisan los ARCHIVOS".
-- ============================================================
select set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from conv_ctx where key = 'request');
  v_message_id uuid := (select value::uuid from conv_ctx where key = 'message_relevante');
  v_file_salon uuid := (select value::uuid from conv_ctx where key = 'file_salon');
  v_file_plano uuid;
  v_adjuntos integer;
begin
  -- Quitar el que se arrastró y no venía a cuento.
  perform public.detach_file_from_request_draft(v_request_id, v_file_salon);

  select count(*) into v_adjuntos from public.file_links
  where entity_type = 'request' and entity_id = v_request_id;
  if v_adjuntos <> 0 then
    raise exception '§68 FALLIDO: quitar un archivo del borrador no lo quitó (enlaces = %)', v_adjuntos
      using errcode = 'assert_failure';
  end if;

  -- CLAUDE.md MUST NOT: lo que se borró es el ENLACE con el borrador. El
  -- archivo sigue en el catálogo, con su versión, y sigue colgando del
  -- mensaje del que vino.
  if not exists (select 1 from public.files where id = v_file_salon) then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: quitar el archivo del borrador borró el archivo del catálogo'
      using errcode = 'assert_failure';
  end if;

  if not exists (select 1 from public.file_versions where file_id = v_file_salon) then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: quitar el archivo del borrador borró sus versiones'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.file_links
    where file_id = v_file_salon and entity_type = 'message' and entity_id = v_message_id
  ) then
    raise exception 'RN-MSG-08 FALLIDO: quitar el archivo del borrador lo quitó del mensaje original'
      using errcode = 'assert_failure';
  end if;

  -- Y añadir el que sí venía a cuento.
  v_file_plano := public.register_file(
    '68400000-0000-0000-0000-000000000001', 'photos', 'Salón en horizontal',
    'cnv/salon-horizontal.jpg', 'salon-horizontal.jpg', 'image/jpeg', 850000
  );
  perform public.attach_file_to_request_draft(v_request_id, v_file_plano);

  select count(*) into v_adjuntos from public.file_links
  where entity_type = 'request' and entity_id = v_request_id and file_id = v_file_plano;
  if v_adjuntos <> 1 then
    raise exception '§68 FALLIDO: añadir un archivo al borrador no lo añadió'
      using errcode = 'assert_failure';
  end if;

  insert into conv_ctx values ('file_plano', v_file_plano::text);
end $$;

reset role;

-- Un archivo de OTRO restaurante no entra en este borrador, ni sabiendo su
-- identificador. Lo prueba el cliente del B subiéndolo en el suyo.
select set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_file_b uuid;
begin
  v_file_b := public.register_file(
    '68400000-0000-0000-0000-000000000002', 'photos', 'Carta del B',
    'cnv/carta-b.jpg', 'carta-b.jpg', 'image/jpeg', 500000
  );
  insert into conv_ctx values ('file_b', v_file_b::text);
end $$;

reset role;

select set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000006', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from conv_ctx where key = 'request');
  v_file_b uuid := (select value::uuid from conv_ctx where key = 'file_b');
begin
  -- La positiva primero, o la negativa no valdría nada: esta cuenta SÍ
  -- puede ver el archivo del B y SÍ puede escribir en el borrador del A.
  -- Lo único que la para es que el archivo no sea de este establecimiento.
  if not public.can_read_file(v_file_b) then
    raise exception 'El propietario global no ve el archivo del otro restaurante: la negativa que viene sería vacua'
      using errcode = 'assert_failure';
  end if;

  if not public.can_write_establishment('68400000-0000-0000-0000-000000000001') then
    raise exception 'El propietario global no puede escribir en el restaurante A: la negativa que viene sería vacua'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.attach_file_to_request_draft(v_request_id, v_file_b);
    raise exception '§68 FALLIDO: se adjuntó al borrador un archivo de otro restaurante'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null; -- lo esperado
  end;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md MUST · el control está en el servidor, no en la pantalla.
-- ============================================================

-- RN-MSG-05 · la cuenta de Consulta LEE la conversación y no la convierte.
-- Las dos mitades, porque la negativa sola pasaría también si no viera
-- nada.
select set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_conversation_id uuid := (select value::uuid from conv_ctx where key = 'conversation');
  v_relevante uuid := (select value::uuid from conv_ctx where key = 'message_relevante');
  v_request_id uuid := (select value::uuid from conv_ctx where key = 'request');
  v_mensajes integer;
begin
  select count(*) into v_mensajes from public.list_conversation_messages(v_conversation_id);
  if v_mensajes = 0 then
    raise exception 'RN-MSG-05 FALLIDO: el rol Consulta no puede ni leer la conversación'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.convert_conversation_to_request(v_conversation_id, array[v_relevante], null);
    raise exception 'RN-MSG-05 FALLIDO: el rol Consulta convirtió la conversación en solicitud'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  begin
    perform public.update_request_draft(v_request_id, 'Lo cambio yo', null);
    raise exception 'RN-MSG-05 FALLIDO: el rol Consulta reescribió el alcance del borrador'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- El equipo de mantenimiento no redacta solicitudes en nombre del cliente
-- (frontera del Hito 4: `can_write_establishment` excluye a propósito a
-- `is_space_member`). El propietario del espacio LEE el borrador —tiene
-- que poder— y no lo reescribe.
select set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from conv_ctx where key = 'request');
  v_file_plano uuid := (select value::uuid from conv_ctx where key = 'file_plano');
begin
  if not exists (select 1 from public.requests where id = v_request_id) then
    raise exception 'El propietario del espacio no ve el borrador de su cliente: la negativa que viene sería vacua'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.update_request_draft(v_request_id, 'Se lo redacto yo al cliente', null);
    raise exception 'CLAUDE.md MUST FALLIDO: el equipo reescribió el borrador del cliente'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  begin
    perform public.detach_file_from_request_draft(v_request_id, v_file_plano);
    raise exception 'CLAUDE.md MUST FALLIDO: el equipo quitó un archivo del borrador del cliente'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- Un cliente de otro restaurante del mismo grupo: ni lo ve ni lo toca.
select set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from conv_ctx where key = 'request');
begin
  begin
    perform public.update_request_draft(v_request_id, 'El borrador del vecino', null);
    raise exception 'CA-01 FALLIDO: el cliente de otro restaurante reescribió este borrador'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- La ventana se cierra al enviar: enviada la solicitud, ni alcance ni
-- archivos (RN-ARC-07, "vinculado a una operación").
-- ============================================================
select set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from conv_ctx where key = 'request');
  v_file_plano uuid := (select value::uuid from conv_ctx where key = 'file_plano');
  v_state text;
begin
  perform public.submit_request(v_request_id);

  select state into v_state from public.requests where id = v_request_id;
  if v_state <> 'received' then
    raise exception '§68 FALLIDO: enviar el borrador revisado no lo envió (estado %)', v_state
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.update_request_draft(v_request_id, 'Ya que está enviada, la reescribo', null);
    raise exception '§68 FALLIDO: se cambió el alcance de una solicitud ya enviada'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  begin
    perform public.detach_file_from_request_draft(v_request_id, v_file_plano);
    raise exception 'RN-ARC-07 FALLIDO: se quitó un archivo de una solicitud ya enviada'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  -- El archivo revisado sigue en la solicitud enviada: es lo que el equipo
  -- va a mirar.
  if not exists (
    select 1 from public.file_links
    where entity_type = 'request' and entity_id = v_request_id and file_id = v_file_plano
  ) then
    raise exception '§68 FALLIDO: la solicitud se envió sin el archivo que se revisó'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- RN-SLA-01 · y al enviar sí arranca. La pareja de la comprobación de
-- arriba, y por el mismo motivo fuera de la sesión del cliente.
do $$
declare
  v_request_id uuid := (select value::uuid from conv_ctx where key = 'request');
  v_timers integer;
begin
  select count(*) into v_timers from public.timer_events
  where entity_type = 'request' and entity_id = v_request_id and event_type = 'started';
  if v_timers <> 1 then
    raise exception 'RN-SLA-01 FALLIDO: enviar la solicitud no arrancó el contador (% eventos)', v_timers
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Privilegios: `anon` no llama a ninguna de las tres, `authenticated` sí
-- (CLAUDE.md: Supabase concede EXECUTE por defecto a toda función nueva,
-- así que esto no se cumple solo).
-- ============================================================
do $$
declare
  v_fn text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice 'Sin rol anon: se omite la comprobación de privilegios';
    return;
  end if;

  foreach v_fn in array array[
    -- La cuarta es la del Hito 7: nació abierta a `anon` y la migración
    -- 20260904000051 se lo quita. Sin esta línea, nadie se habría enterado.
    'convert_conversation_to_request(uuid, uuid[], text)',
    'update_request_draft(uuid, text, text)',
    'attach_file_to_request_draft(uuid, uuid)',
    'detach_file_from_request_draft(uuid, uuid)']
  loop
    if has_function_privilege('anon', ('public.' || v_fn)::regprocedure, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: %s está abierta a `anon`', v_fn
        using errcode = 'assert_failure';
    end if;

    if not has_function_privilege('authenticated', ('public.' || v_fn)::regprocedure, 'execute') then
      raise exception '%s ha perdido el EXECUTE de `authenticated`: la revisión del borrador no puede funcionar', v_fn
        using errcode = 'assert_failure';
    end if;
  end loop;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
drop table if exists conv_ctx;

delete from public.audit_log where space_id = '68100000-0000-0000-0000-000000000001';
delete from public.spaces where id = '68100000-0000-0000-0000-000000000001';
delete from auth.users where id in (
  '68000000-0000-0000-0000-000000000001',
  '68000000-0000-0000-0000-000000000002',
  '68000000-0000-0000-0000-000000000003',
  '68000000-0000-0000-0000-000000000004',
  '68000000-0000-0000-0000-000000000005',
  '68000000-0000-0000-0000-000000000006'
);

select 'conversion_a_solicitud.sql: RN-MSG-10 y §68 cumplidos, base de datos limpia' as resultado;
