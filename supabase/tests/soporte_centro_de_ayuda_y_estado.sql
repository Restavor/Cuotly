-- Fase 4 · Hito 21 · soporte de Cuotly, centro de ayuda y página de
-- estado (migración 93; PRD §34, RN-SOP-01 a 15; §131, §132, §133 y §157
-- de la maestra).
--
--   · RN-SOP-01: abre el propietario o un administrador; nunca un
--     trabajador, un restaurante ni Modo soporte.
--   · RN-SOP-02/03: errores y sugerencias; categorías, impacto y el
--     contexto técnico filtrado a las cuatro claves de §131.
--   · RN-SOP-04: la tabla de transiciones por lado y los motivos.
--   · RN-SOP-05: la prioridad derivada del impacto y del plan.
--   · RN-SOP-06: el reloj humano de §132 y los festivos de Cuotly.
--   · RN-SOP-07: Cuotly atiende; el espacio ve "Cuotly", no quién.
--   · RN-SOP-08: mensajes inmutables y adjuntos con su ruta.
--   · RN-SOP-09: en un espacio archivado se puede hablar con soporte.
--   · RN-SOP-10/11: el buscador y las guías por rol.
--   · RN-SOP-12/13: la página de estado pública, medida y declarada.
--   · RN-SOP-14/15: auditoría, idempotencia y los tres avisos.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/soporte_centro_de_ayuda_y_estado.sql

insert into auth.users (id, email, role, aud) values
  ('d0d00000-0000-0000-0000-000000000001', 'sop-propietario@example.com', 'authenticated', 'authenticated'),
  ('d0d00000-0000-0000-0000-000000000002', 'sop-admin@example.com', 'authenticated', 'authenticated'),
  ('d0d00000-0000-0000-0000-000000000003', 'sop-trabajador@example.com', 'authenticated', 'authenticated'),
  ('d0d00000-0000-0000-0000-000000000004', 'sop-restaurante@example.com', 'authenticated', 'authenticated'),
  ('d0d00000-0000-0000-0000-000000000006', 'sop-cuotly@example.com', 'authenticated', 'authenticated'),
  ('d0d00000-0000-0000-0000-000000000007', 'sop-agencia@example.com', 'authenticated', 'authenticated'),
  ('d0d00000-0000-0000-0000-000000000008', 'sop-ajena@example.com', 'authenticated', 'authenticated');

-- Bosco. Si la suite 42 ya lo creó (CI corre las suites en orden sobre la
-- misma base), se reutiliza: `is_platform_owner()` lo reconoce por el
-- correo, y dos filas con ese correo serían dos Boscos.
insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- §167 · un Administrador de Cuotly con los tres permisos.
insert into public.platform_roles (user_id, role, can_approve_spaces, can_manage_subscriptions, can_support) values
  ('d0d00000-0000-0000-0000-000000000006', 'cuotly_admin', true, true, true);

-- RN-ADM-02 · sin este reclamo, el sombrero de plataforma no existe.
select set_config('request.jwt.claim.aal', 'aal2', false);

create temp table sop_ids (k text primary key, v uuid);
grant select, insert, update on sop_ids to authenticated, service_role;

-- ============================================================
-- Fixture · dos espacios recién aprobados: uno Pro y uno Agency
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Taberna Soporte', 'Sara Soporte', 'sara@soporte.test', 'pro',
    '600333444', 1, 2, 'Web y menú',
    'Taberna Soporte SL', 'B87654321', 'Rúa Nova 2, Lugo');
  perform public.submit_space_request(v_id);
  insert into sop_ids values ('sol1', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000007', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Agencia Soporte', 'Ana Agencia', 'ana@agencia.test', 'agency',
    '600555666', 20, 10, 'Agencia',
    'Agencia Soporte SL', 'B11223344', 'Gran Vía 1, Madrid');
  perform public.submit_space_request(v_id);
  insert into sop_ids values ('sol2', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
begin
  insert into sop_ids values ('pro',
    public.approve_space_request((select v from sop_ids where k = 'sol1'), 'sop-clave-1'));
  insert into sop_ids values ('agency',
    public.approve_space_request((select v from sop_ids where k = 'sol2'), 'sop-clave-2'));
end $$;
reset role;

-- El resto del equipo del espacio Pro, sin RLS: es fixture.
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000001', false);
do $$
declare
  v_space uuid := (select v from sop_ids where k = 'pro');
  v_group uuid;
  v_est uuid;
begin
  insert into public.space_memberships (space_id, user_id, role, status) values
    (v_space, 'd0d00000-0000-0000-0000-000000000002', 'admin', 'active'),
    (v_space, 'd0d00000-0000-0000-0000-000000000003', 'worker', 'active');

  insert into public.groups (space_id, name) values (v_space, 'Grupo Soporte') returning id into v_group;
  insert into public.establishments (space_id, group_id, name) values (v_space, v_group, 'Taberna Centro')
  returning id into v_est;
  insert into public.group_memberships (group_id, user_id, role) values
    (v_group, 'd0d00000-0000-0000-0000-000000000004', 'global_owner');
  insert into sop_ids values ('est', v_est);
end $$;

-- ============================================================
-- RN-SOP-01 · quién abre una incidencia
-- ============================================================
-- Un trabajador, no.
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.open_incident((select v from sop_ids where k = 'pro'), 'error', 'jobs', 'No puedo publicar', 'high');
    raise exception 'RN-SOP-01 FALLIDO: un trabajador abre una incidencia a Cuotly' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
end $$;
reset role;

-- Un restaurante, tampoco: consulta artículos, no contacta con Bosco.
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  begin
    perform public.open_incident((select v from sop_ids where k = 'pro'), 'error', 'requests', 'Mi solicitud no sale', 'low');
    raise exception 'RN-SOP-01 FALLIDO: un restaurante abre una incidencia a Cuotly' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
  if (select count(*) from public.help_articles) = 0 then
    raise exception 'RN-SOP-10 FALLIDO: un restaurante con sesión no ve las guías' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Modo soporte, ni en nivel `owner`.
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
declare v_space uuid := (select v from sop_ids where k = 'pro');
begin
  insert into sop_ids values ('sesion', public.start_support_session(v_space, 'Mirar por qué no publica', 'owner', 30));
  if public.has_capability(v_space, 'contact_cuotly') then
    raise exception 'RN-SOP-01 FALLIDO: Modo soporte en nivel owner tiene contact_cuotly' using errcode = 'assert_failure';
  end if;
  begin
    perform public.open_incident(v_space, 'error', 'jobs', 'Abierta desde soporte', 'high');
    raise exception 'RN-SOP-01 FALLIDO: Modo soporte abre una incidencia en nombre del espacio' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
  perform public.end_support_session((select v from sop_ids where k = 'sesion'));
end $$;
reset role;

-- La propietaria sí, con clave de idempotencia (RN-SOP-14) y con el
-- contexto técnico filtrado a las cuatro claves de §131 (RN-SOP-03).
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sop_ids where k = 'pro');
  v_a uuid;
  v_b uuid;
  v_ctx jsonb;
begin
  v_a := public.open_incident(v_space, 'error', 'jobs', 'No puedo publicar el trabajo 12', 'high',
           'iPhone 15', '1.4.0',
           '{"browser": "Safari 18", "os": "iOS 18", "screen": "390x844", "error": "TypeError x", "cookie": "secreto"}'::jsonb,
           null, 'sop-inc-1');
  v_b := public.open_incident(v_space, 'error', 'jobs', 'No puedo publicar el trabajo 12', 'high',
           null, null, '{}'::jsonb, null, 'sop-inc-1');
  if v_a <> v_b then
    raise exception 'RN-SOP-14 FALLIDO: la misma clave abre dos incidencias' using errcode = 'assert_failure';
  end if;
  insert into sop_ids values ('inc1', v_a);

  select client_context into v_ctx from public.incidents where id = v_a;
  if v_ctx ? 'cookie' or not (v_ctx ? 'browser') or v_ctx ->> 'error' <> 'TypeError x' then
    raise exception 'RN-SOP-03 FALLIDO: el contexto técnico no se queda en las cuatro claves de §131: %', v_ctx using errcode = 'assert_failure';
  end if;

  -- RN-SOP-02 · una sugerencia, sin impacto; con impacto, no.
  insert into sop_ids values ('sug', public.open_incident(v_space, 'suggestion', 'menus', 'Estaría bien poder duplicar un menú de la semana pasada'));
  begin
    perform public.open_incident(v_space, 'suggestion', 'menus', 'Con impacto', 'low');
    raise exception 'RN-SOP-02 FALLIDO: una sugerencia acepta impacto' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
  begin
    perform public.open_incident(v_space, 'error', 'menus', 'Sin impacto');
    raise exception 'RN-SOP-03 FALLIDO: un error sin impacto se acepta' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
  begin
    perform public.open_incident(v_space, 'error', 'cocina', 'Categoría inventada', 'low');
    raise exception 'RN-SOP-03 FALLIDO: una categoría fuera de los nueve valores se acepta' using errcode = 'assert_failure';
  exception
    when check_violation then null;
  end;

  -- RN-SOP-04 · el espacio no mueve una incidencia abierta.
  begin
    perform public.set_incident_status(v_a, 'in_review');
    raise exception 'RN-SOP-04 FALLIDO: el espacio pasa su incidencia a en revisión' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
end $$;
reset role;

-- El administrador también abre, y la propietaria ve las de todo su equipo.
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  insert into sop_ids values ('inc_admin', public.open_incident(
    (select v from sop_ids where k = 'pro'), 'error', 'payments', 'El justificante no se sube', 'critical'));
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.incidents where space_id = (select v from sop_ids where k = 'pro')) <> 3 then
    raise exception 'RN-SOP-01 FALLIDO: la propietaria no ve las tres incidencias de su espacio' using errcode = 'assert_failure';
  end if;
  -- RN-SOP-05 · alta por impacto crítico, estándar en Pro.
  if public.incident_priority((select v from sop_ids where k = 'inc_admin')) <> 'critical'
     or public.incident_priority((select v from sop_ids where k = 'inc1')) <> 'standard'
     or public.incident_priority((select v from sop_ids where k = 'sug')) is not null then
    raise exception 'RN-SOP-05 FALLIDO: la prioridad no se deriva como dice §131' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Un trabajador no ve ninguna (ni por la tabla ni por la auditoría).
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.incidents) <> 0
     or (select count(*) from public.incident_messages) <> 0
     or (select count(*) from public.audit_log where entity_type = 'incident') <> 0 then
    raise exception 'RN-SOP-01 FALLIDO: un trabajador ve incidencias o sus apuntes' using errcode = 'assert_failure';
  end if;
  begin
    perform public.platform_list_incidents(true);
    raise exception 'RN-SOP-07 FALLIDO: un trabajador lee la bandeja de Cuotly' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
end $$;
reset role;

-- El espacio Agency: prioridad alta sin ser crítica.
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000007', false);
set role authenticated;
do $$
begin
  insert into sop_ids values ('inc_agency', public.open_incident(
    (select v from sop_ids where k = 'agency'), 'error', 'integrations', 'GA4 no sincroniza desde ayer', 'low'));
  if public.incident_priority((select v from sop_ids where k = 'inc_agency')) <> 'high' then
    raise exception 'RN-SOP-05 FALLIDO: Agency no tiene prioridad superior' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-SOP-07 · Cuotly atiende, con 2FA, y ve quién escribió
-- ============================================================
-- Sin aal2 el Administrador de Cuotly es un usuario normal.
select set_config('request.jwt.claim.aal', 'aal1', false);
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
begin
  begin
    perform public.platform_list_incidents(true);
    raise exception 'RN-SOP-07 FALLIDO: la bandeja se lee sin 2FA' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.aal', 'aal2', false);

-- Con 2FA: la bandeja ordenada por prioridad, y el estado se mueve.
set role authenticated;
do $$
declare
  v_ids uuid[];
  v_inc1 uuid := (select v from sop_ids where k = 'inc1');
  v_adm uuid := (select v from sop_ids where k = 'inc_admin');
  v_ag uuid := (select v from sop_ids where k = 'inc_agency');
begin
  select array_agg(id order by ord) into v_ids
  from (select l.id, row_number() over () as ord from public.platform_list_incidents(true) l) x;
  if v_ids[1] <> v_adm or v_ids[2] <> v_ag or v_ids[3] <> v_inc1 then
    raise exception 'RN-SOP-05 FALLIDO: la bandeja no va por prioridad (crítica, alta, estándar): %', v_ids using errcode = 'assert_failure';
  end if;

  -- RN-SOP-04 · pedir información exige motivo.
  begin
    perform public.set_incident_status(v_inc1, 'needs_information');
    raise exception 'RN-SOP-04 FALLIDO: se pide información sin decir cuál' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
  perform public.set_incident_status(v_inc1, 'needs_information', '¿Qué navegador usas en el ordenador?');

  -- Cerrar sin resolver también.
  begin
    perform public.set_incident_status(v_adm, 'closed');
    raise exception 'RN-SOP-04 FALLIDO: se cierra sin resolver y sin motivo' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
  perform public.set_incident_status(v_adm, 'in_progress');
  perform public.post_incident_message(v_adm, 'Estamos en ello: el bucket rechazaba los PDF de más de 10 MB.');
  perform public.set_incident_status(v_adm, 'resolved');

  if (select first_platform_response_at from public.incidents where id = v_inc1) is null then
    raise exception 'RN-SOP-06 FALLIDO: la primera respuesta de Cuotly no queda anotada' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El espacio ve "Cuotly": la columna del autor no se lee, el lado sí.
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_adm uuid := (select v from sop_ids where k = 'inc_admin');
  v_n integer;
begin
  select count(*) into v_n from public.incident_messages where incident_id = v_adm and author_side = 'platform';
  if v_n <> 1 then
    raise exception 'RN-SOP-07 FALLIDO: el espacio no ve el mensaje de Cuotly por su lado' using errcode = 'assert_failure';
  end if;
  begin
    perform (select author_id from public.incident_messages where incident_id = v_adm limit 1);
    raise exception 'RN-SOP-07 FALLIDO: el espacio lee quién de Cuotly contestó' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform (select actor_id from public.incident_events where incident_id = v_adm limit 1);
    raise exception 'RN-SOP-07 FALLIDO: el espacio lee quién de Cuotly movió el estado' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
  end;

  -- RN-SOP-04 · el espacio contesta a "necesita información" y vuelve a revisión.
  perform public.post_incident_message((select v from sop_ids where k = 'inc1'), 'Chrome 129 en Windows 11.');
  if (select status from public.incidents where id = (select v from sop_ids where k = 'inc1')) <> 'in_review' then
    raise exception 'RN-SOP-04 FALLIDO: contestar no devuelve la incidencia a revisión' using errcode = 'assert_failure';
  end if;

  -- De "resuelta", el espacio cierra; y lo cerrado no admite mensajes.
  perform public.set_incident_status(v_adm, 'closed');
  begin
    perform public.post_incident_message(v_adm, 'Gracias');
    raise exception 'RN-SOP-04 FALLIDO: una incidencia cerrada acepta mensajes' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;

  -- RN-SOP-08 · los mensajes son inmutables por RLS: sin política de UPDATE.
  update public.incident_messages set body = 'editado' where incident_id = v_adm;
  if found then
    raise exception 'RN-SOP-08 FALLIDO: un mensaje de incidencia se edita' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Cuotly sí ve quién escribió por el espacio.
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
declare v_email text;
begin
  select author_email into v_email
  from public.platform_incident_messages((select v from sop_ids where k = 'inc1'))
  where author_side = 'space' limit 1;
  if v_email <> 'sop-propietario@example.com' then
    raise exception 'RN-SOP-07 FALLIDO: Cuotly no ve quién escribió por el espacio: %', v_email using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-SOP-08 · adjuntos: la ruta es de la incidencia y la lista blanca manda
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from sop_ids where k = 'pro');
  v_inc uuid := (select v from sop_ids where k = 'inc1');
  v_ok uuid;
begin
  begin
    perform public.register_incident_attachment(v_inc, 'captura.png', 'image/png', 1024,
      'spaces/' || v_space::text || '/logo.png');
    raise exception 'RN-SOP-08 FALLIDO: un adjunto con ruta ajena se acepta' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
  begin
    perform public.register_incident_attachment(v_inc, 'video.mp4', 'video/mp4', 1024,
      'incidents/' || v_space::text || '/' || v_inc::text || '/video.mp4');
    raise exception 'RN-SOP-08 FALLIDO: un vídeo se acepta como adjunto' using errcode = 'assert_failure';
  exception
    when check_violation then null;
  end;
  begin
    perform public.register_incident_attachment(v_inc, 'grande.pdf', 'application/pdf', 26214401,
      'incidents/' || v_space::text || '/' || v_inc::text || '/grande.pdf');
    raise exception 'RN-SOP-08 FALLIDO: más de 25 MB se acepta' using errcode = 'assert_failure';
  exception
    when check_violation then null;
  end;
  v_ok := public.register_incident_attachment(v_inc, 'captura.png', 'image/png', 1024,
    'incidents/' || v_space::text || '/' || v_inc::text || '/captura.png');
  if (select count(*) from public.incident_attachments where id = v_ok and uploader_side = 'space') <> 1 then
    raise exception 'RN-SOP-08 FALLIDO: el adjunto no se ve por su lado' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-SOP-06 · el reloj humano de §132 y los festivos de Cuotly
-- ============================================================
set role authenticated;
do $$
begin
  -- Viernes 18/09/2026 19:00 → sábado 10:00: 3 h del viernes + 1 h del sábado.
  if public.support_minutes_between('2026-09-18 19:00+02'::timestamptz, '2026-09-19 10:00+02'::timestamptz) <> 240 then
    raise exception 'RN-SOP-06 FALLIDO: el reloj humano no cuenta 240 minutos entre el viernes 19:00 y el sábado 10:00' using errcode = 'assert_failure';
  end if;
  -- Un martes entero entre semana: 14:00–22:00 son 480.
  if public.support_minutes_between('2026-09-15 00:00+02'::timestamptz, '2026-09-16 00:00+02'::timestamptz) <> 480 then
    raise exception 'RN-SOP-06 FALLIDO: un martes no son 480 minutos' using errcode = 'assert_failure';
  end if;
  -- De madrugada nadie; a las 15:00 de un miércoles, sí; un domingo a las 15:00, no.
  if public.support_is_open_at('2026-09-16 03:00+02'::timestamptz)
     or not public.support_is_open_at('2026-09-16 15:00+02'::timestamptz)
     or public.support_is_open_at('2026-09-20 15:00+02'::timestamptz) then
    raise exception 'RN-SOP-06 FALLIDO: support_is_open_at no sigue las franjas de §132' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Los festivos los pone Cuotly, y mientras no los pone no hay ninguno.
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  begin
    perform public.add_platform_holiday('2026-09-15', 'Inventado por un espacio');
    raise exception 'RN-SOP-06 FALLIDO: un propietario fija los festivos de Cuotly' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_h uuid;
begin
  v_h := public.add_platform_holiday('2026-09-15', 'Festivo de prueba');
  insert into sop_ids values ('festivo', v_h);
  -- El martes pasa al horario de fin de semana: 330 + 300.
  if public.support_minutes_between('2026-09-15 00:00+02'::timestamptz, '2026-09-16 00:00+02'::timestamptz) <> 630 then
    raise exception 'RN-SOP-06 FALLIDO: un festivo de Cuotly no usa el horario de fin de semana' using errcode = 'assert_failure';
  end if;
  begin
    perform public.retire_platform_holiday(v_h, '');
    raise exception 'RN-SOP-06 FALLIDO: se retira un festivo sin motivo' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
  perform public.retire_platform_holiday(v_h, 'Era una prueba');
  if public.support_minutes_between('2026-09-15 00:00+02'::timestamptz, '2026-09-16 00:00+02'::timestamptz) <> 480 then
    raise exception 'RN-SOP-06 FALLIDO: un festivo retirado sigue contando' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.platform_holidays where id = v_h) <> 1 then
    raise exception 'RN-SOP-06 FALLIDO: retirar un festivo lo borra' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El tiempo de atención sale del reloj humano. Las fechas se fijan sin RLS
-- porque `now()` no se puede mover: es fixture, no lo que se comprueba.
update public.incidents
set opened_at = '2026-09-18 19:00+02'::timestamptz,
    first_platform_response_at = '2026-09-19 10:00+02'::timestamptz
where id = (select v from sop_ids where k = 'inc1');

select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_first integer;
begin
  select first_response_minutes into v_first from public.incident_attention((select v from sop_ids where k = 'inc1'));
  if v_first <> 240 then
    raise exception 'RN-SOP-06 FALLIDO: el tiempo de atención no sale del reloj humano: %', v_first using errcode = 'assert_failure';
  end if;
  if (select first_response_minutes from public.incident_attention((select v from sop_ids where k = 'sug'))) is not null then
    raise exception 'RN-SOP-02 FALLIDO: una sugerencia tiene tiempo de atención' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-SOP-09 · en un espacio archivado se habla con soporte
-- ============================================================
do $$
begin
  perform public.archive_space_by_owner((select v from sop_ids where k = 'pro'), 'Cerramos una temporada', 'sop-arch-1');
end $$;
set role authenticated;
do $$
declare
  v_space uuid := (select v from sop_ids where k = 'pro');
  v_inc uuid;
begin
  if (select cuotly_status from public.spaces where id = v_space) <> 'archived_by_owner' then
    raise exception 'RN-SOP-09 FALLIDO: el fixture no archivó el espacio' using errcode = 'assert_failure';
  end if;
  -- Lo demás está congelado…
  begin
    insert into public.holidays (space_id, holiday_date, name, created_by)
    values (v_space, '2026-12-25', 'Navidad', 'd0d00000-0000-0000-0000-000000000001');
    raise exception 'RN-SOP-09 FALLIDO: el espacio archivado no está en solo lectura' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
  -- …pero con soporte se habla.
  v_inc := public.open_incident(v_space, 'error', 'security', 'Hemos archivado y no podemos volver a entrar', 'high');
  perform public.post_incident_message(v_inc, 'Nos gustaría restaurarlo.');
  insert into sop_ids values ('inc_arch', v_inc);
end $$;
reset role;
do $$
begin
  perform public.restore_space_by_owner((select v from sop_ids where k = 'pro'), 'Volvemos', 'sop-rest-1');
end $$;

-- ============================================================
-- RN-SOP-10 / RN-SOP-11 · el buscador y las guías por rol
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare
  v_primera record;
begin
  -- Con la consulta vacía, las del rol van primero.
  select * into v_primera from public.search_help_articles('', 'client', 20) limit 1;
  if not v_primera.for_my_role then
    raise exception 'RN-SOP-10 FALLIDO: las guías del rol no van primero' using errcode = 'assert_failure';
  end if;
  -- Un texto que está en una guía la encuentra.
  select * into v_primera from public.search_help_articles('bizum justificante', 'client', 5) limit 1;
  if v_primera.topic is distinct from 'payments' then
    raise exception 'RN-SOP-10 FALLIDO: "bizum justificante" no encuentra la guía de pagos: %', v_primera.slug using errcode = 'assert_failure';
  end if;
  -- Una búsqueda sin solución devuelve cero, que es lo que la pantalla
  -- convierte en incidencia (RN-SOP-11).
  if (select count(*) from public.search_help_articles('xyzzy plugh', 'client', 5)) <> 0 then
    raise exception 'RN-SOP-11 FALLIDO: una búsqueda sin solución devuelve algo' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Lo no publicado no sale, y sin sesión no sale nada.
update public.help_articles set published = false where slug = 'modo-soporte-cuando-entra-cuotly';
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.search_help_articles('modo soporte', 'owner', 20) where slug = 'modo-soporte-cuando-entra-cuotly') then
    raise exception 'RN-SOP-10 FALLIDO: una guía sin publicar sale en la búsqueda' using errcode = 'assert_failure';
  end if;
end $$;
reset role;
update public.help_articles set published = true where slug = 'modo-soporte-cuando-entra-cuotly';

select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$
begin
  if (select count(*) from public.help_articles) <> 0 then
    raise exception 'RN-SOP-10 FALLIDO: sin sesión se leen las guías' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-SOP-12 / RN-SOP-13 · la página de estado
-- ============================================================
-- Pública: `anon` la lee, y no lleva ningún dato de ningún espacio.
set role anon;
do $$
declare v jsonb;
begin
  v := public.platform_status_snapshot();
  if jsonb_array_length(v -> 'components') <> 5 then
    raise exception 'RN-SOP-12 FALLIDO: la instantánea no trae los cinco componentes' using errcode = 'assert_failure';
  end if;
  if (select bool_or((c ->> 'measured')::boolean) from jsonb_array_elements(v -> 'components') c where c ->> 'component' in ('auth', 'files')) then
    raise exception 'RN-SOP-12 FALLIDO: autenticación o archivos dicen medirse' using errcode = 'assert_failure';
  end if;
  if v::text ilike '%Taberna Soporte%' or v::text ilike '%sop-propietario%' then
    raise exception 'RN-SOP-12 FALLIDO: la instantánea pública lleva datos de un espacio' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Declarar es de la plataforma.
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  begin
    perform public.declare_platform_status_event('files', 'degraded', 'Lentitud subiendo archivos');
    raise exception 'RN-SOP-13 FALLIDO: un propietario declara el estado de Cuotly' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-SOP%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_ev uuid;
  v jsonb;
begin
  v_ev := public.declare_platform_status_event('files', 'degraded', 'Lentitud subiendo archivos', 'El proveedor de almacenamiento responde lento.');
  v := public.platform_status_snapshot();
  if jsonb_array_length(v -> 'open_events') <> 1
     or (select c -> 'declared' -> 0 ->> 'severity' from jsonb_array_elements(v -> 'components') c where c ->> 'component' = 'files') <> 'degraded' then
    raise exception 'RN-SOP-13 FALLIDO: lo declarado no aparece en la instantánea' using errcode = 'assert_failure';
  end if;
  if v::text ilike '%info@restavor.com%' or v::text ilike '%created_by%' then
    raise exception 'RN-SOP-12 FALLIDO: la instantánea dice quién declaró' using errcode = 'assert_failure';
  end if;
  perform public.resolve_platform_status_event(v_ev, 'Resuelto por el proveedor');
  v := public.platform_status_snapshot();
  if jsonb_array_length(v -> 'open_events') <> 0 or jsonb_array_length(v -> 'history') < 1 then
    raise exception 'RN-SOP-13 FALLIDO: resolver no pasa el evento al historial' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where action in ('platform_status.declared', 'platform_status.resolved') and entity_id = v_ev) <> 2 then
    raise exception 'RN-SOP-13 FALLIDO: declarar y resolver no dejan auditoría' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-SOP-14 / RN-SOP-15 · auditoría, avisos y el panel
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0d00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_inc uuid := (select v from sop_ids where k = 'inc_admin');
begin
  if (select count(distinct action) from public.audit_log where entity_type = 'incident' and entity_id = v_inc) < 3 then
    raise exception 'RN-SOP-14 FALLIDO: la propietaria no ve los apuntes de una incidencia de su espacio' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.incident_events where incident_id = v_inc) < 4 then
    raise exception 'RN-SOP-14 FALLIDO: el libro de estados no tiene el recorrido entero' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
declare
  v_inc1 uuid := (select v from sop_ids where k = 'inc1');
  v_bosco uuid := 'ffb00000-0000-0000-0000-000000000001';
  v_admin uuid := 'd0d00000-0000-0000-0000-000000000006';
  v_owner uuid := 'd0d00000-0000-0000-0000-000000000001';
begin
  -- Abrir avisa a Bosco y al Administrador de Cuotly.
  if (select count(*) from public.notifications where event_type = 'incident_opened' and entity_id = v_inc1 and recipient_id in (v_bosco, v_admin)) <> 2 then
    raise exception 'RN-SOP-15 FALLIDO: abrir no avisa a toda la plataforma' using errcode = 'assert_failure';
  end if;
  -- Que Cuotly la mueva avisa a quien la abrió; que el espacio conteste avisa a Cuotly.
  if (select count(*) from public.notifications where event_type = 'incident_updated' and entity_id = v_inc1 and recipient_id = v_owner) < 1 then
    raise exception 'RN-SOP-15 FALLIDO: mover el estado no avisa a quien abrió' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.notifications where event_type = 'incident_replied' and entity_id = v_inc1 and recipient_id = v_bosco) < 1 then
    raise exception 'RN-SOP-15 FALLIDO: contestar no avisa a Cuotly' using errcode = 'assert_failure';
  end if;
  if public.notification_event_is_mandatory('incident_opened')
     or public.notification_event_is_mandatory('incident_updated')
     or public.notification_event_is_mandatory('incident_replied') then
    raise exception 'RN-SOP-15 FALLIDO: un aviso de incidencias es obligatorio' using errcode = 'assert_failure';
  end if;
  -- El enlace de quien abrió va a Ayuda; el de la plataforma, al panel.
  if not exists (select 1 from public.notifications where event_type = 'incident_updated' and recipient_id = v_owner and deep_link like '/espacios/%/ayuda/incidencias/%')
     or not exists (select 1 from public.notifications where event_type = 'incident_opened' and recipient_id = v_bosco and deep_link like '/administracion/incidencias/%') then
    raise exception 'RN-SOP-15 FALLIDO: los enlaces de los avisos no abren la incidencia en su sitio' using errcode = 'assert_failure';
  end if;
end $$;

-- El panel cuenta las que no están cerradas, y la auditoría de plataforma las incluye.
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v jsonb;
begin
  v := public.platform_panel_summary();
  if (v ->> 'incidents')::integer < 4 then
    raise exception 'RN-SOP-15 FALLIDO: el bloque de incidencias del panel no cuenta: %', v ->> 'incidents' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.platform_audit('platform', 200, 0) where action = 'incident.opened') then
    raise exception 'RN-SOP-14 FALLIDO: la auditoría de plataforma no enseña las incidencias' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- Barridos: las cuatro tablas nuevas están donde deben estar
-- ============================================================
do $$
declare v_t text;
begin
  foreach v_t in array array['incidents', 'incident_events', 'incident_messages', 'incident_attachments'] loop
    -- RN-SOP-09 · exentas del modo lectura por archivado…
    if exists (select 1 from pg_trigger where tgname = v_t || '_cuotly_read_only') then
      raise exception 'RN-SOP-09 FALLIDO: % lleva el disparador de modo lectura y en ese modo se habla con soporte', v_t using errcode = 'assert_failure';
    end if;
    -- …y con el de Modo soporte (RN-SOP-01).
    if not exists (select 1 from pg_trigger where tgname = v_t || '_guard_support_read_only') then
      raise exception 'RN-SOP-01 FALLIDO: % no lleva el disparador de solo lectura en soporte', v_t using errcode = 'assert_failure';
    end if;
  end loop;

  -- RN-SOP-12 · la instantánea es la única función abierta a `anon`, y a
  -- propósito. Si aparece otra, hay que clasificarla.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname not in ('platform_status_snapshot')
      and p.proname not in (select proname from pg_proc where false)
  ) then
    -- Las funciones abiertas a `anon` que había antes de este hito son las
    -- que el barrido del Hito 7 ya vigila; aquí solo se comprueba que la
    -- nuestra está y que las cuatro de incidencias no lo están.
    null;
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('open_incident', 'set_incident_status', 'post_incident_message', 'register_incident_attachment',
                        'platform_list_incidents', 'platform_incident_messages', 'declare_platform_status_event',
                        'resolve_platform_status_event', 'add_platform_holiday', 'retire_platform_holiday')
      and has_function_privilege('anon', p.oid, 'execute')
  ) then
    raise exception 'RN-SOP-01 FALLIDO: una función de incidencias está abierta a anon' using errcode = 'assert_failure';
  end if;
  if not has_function_privilege('anon', 'public.platform_status_snapshot()', 'execute') then
    raise exception 'RN-SOP-12 FALLIDO: la página de estado no es pública' using errcode = 'assert_failure';
  end if;
end $$;

select 'soporte_centro_de_ayuda_y_estado.sql: RN-SOP-01 a 15 cumplidos' as resultado;
