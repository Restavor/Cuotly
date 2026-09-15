-- Fase 4 · Hito 17 · la solicitud de creación de espacio (migración 89;
-- PRD §30, RN-PLA-01 a 09; §10, §167 y §4.4 de la maestra).
--
--   · RN-PLA-01: los nueve campos de §10 y los seis estados. La tabla NO
--     lleva `space_id` obligatorio, a propósito: nace antes que el espacio.
--   · RN-PLA-02: la escribe una persona registrada; `anon` no puede;
--     el borrador es suyo y la plataforma no lo ve.
--   · RN-PLA-03: la tabla de transiciones manda en el servidor, no la
--     pantalla.
--   · RN-PLA-04: Bosco siempre; un Admin de Cuotly SOLO con el permiso.
--   · RN-PLA-05: aprobar crea espacio, propietario y prueba de 7 días, y
--     pulsarlo dos veces devuelve el mismo espacio (CA-17).
--   · RN-PLA-06: rechazar y pedir información exigen motivo.
--   · RN-PLA-07: el solicitante no ve quién la revisó.
--   · RN-PLA-08: auditoría, con `space_id` nulo antes del espacio.
--   · RN-PLA-09: una prueba por persona; por negocio NO se finge.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plataforma_solicitud_de_espacio.sql

insert into auth.users (id, email, role, aud) values
  ('ff900000-0000-0000-0000-000000000001', 'pla-solicitante@example.com', 'authenticated', 'authenticated'),
  ('ff900000-0000-0000-0000-000000000002', 'pla-otro@example.com', 'authenticated', 'authenticated'),
  ('ff900000-0000-0000-0000-000000000003', 'pla-admin-con@example.com', 'authenticated', 'authenticated'),
  ('ff900000-0000-0000-0000-000000000004', 'pla-admin-sin@example.com', 'authenticated', 'authenticated'),
  ('ff900000-0000-0000-0000-000000000005', 'pla-segundo@example.com', 'authenticated', 'authenticated');

-- §167 · un Administrador de Cuotly CON el permiso y otro SIN él. Sin los
-- dos, "si recibe permiso" sería una frase decorativa.
insert into public.platform_roles (user_id, role, can_approve_spaces) values
  ('ff900000-0000-0000-0000-000000000003', 'cuotly_admin', true),
  ('ff900000-0000-0000-0000-000000000004', 'cuotly_admin', false);

-- Hito 19 (RN-ADM-02) · la plataforma solo existe en una sesión verificada
-- en dos pasos: sin este reclamo, Bosco y los Administradores de Cuotly
-- de esta suite serían usuarios normales y nada de lo de abajo pasaría.
select set_config('request.jwt.claim.aal', 'aal2', false);

create temp table pla_ids (k text primary key, v uuid);
grant select, insert, update on pla_ids to authenticated, service_role;

-- ============================================================
-- RN-PLA-01 · la forma de la tabla: sin `space_id` obligatorio
-- ============================================================
do $$
begin
  -- Es de plataforma: si algún día alguien le pone `space_id NOT NULL`
  -- "por coherencia con CLAUDE.md", una solicitud dejaría de poder existir
  -- antes que su espacio, que es su razón de ser.
  if (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'space_requests' and column_name = 'space_id') <> 'YES' then
    raise exception 'RN-PLA-01 FALLIDO: space_requests.space_id es obligatorio, y la solicitud nace antes que el espacio'
      using errcode = 'assert_failure';
  end if;

  -- Y aun así lleva RLS: no llevar `space_id` no es no llevar política.
  if not (select relrowsecurity from pg_class where oid = 'public.space_requests'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.space_request_events'::regclass) then
    raise exception 'RN-PLA-01 FALLIDO: una tabla de plataforma sin RLS' using errcode = 'assert_failure';
  end if;

  -- Los nueve campos de §10.
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'space_requests'
        and column_name in ('business_name', 'contact_name', 'email', 'phone',
                            'estimated_establishments', 'estimated_users', 'intended_use',
                            'plan', 'tax_name', 'tax_id', 'tax_address')) <> 11 then
    raise exception 'RN-PLA-01 FALLIDO: faltan campos de §10' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-PLA-02 · quién la escribe y quién ve el borrador
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Bar Magariños', 'Ana Magariños', 'ana@magarinos.test', 'pro',
    '600111222', 3, 2, 'Mantenimiento de webs de restaurantes',
    'Magariños SL', 'B00000000', 'Calle Mayor 1');
  insert into pla_ids values ('sol', v_id);

  if (select status from public.space_requests where id = v_id) <> 'draft' then
    raise exception 'RN-PLA-01 FALLIDO: una solicitud recién escrita no nace "Borrador"' using errcode = 'assert_failure';
  end if;

  -- §10 dice "Borrador" en singular: escribir otra vez continúa el mismo.
  if public.save_space_request_draft('Bar Magariños', 'Ana Magariños', 'ana@magarinos.test', 'agency') <> v_id then
    raise exception 'RN-PLA-02 FALLIDO: se abrió un segundo borrador de la misma persona' using errcode = 'assert_failure';
  end if;

  -- Un `insert` directo no existe: se escribe por la función, que es la
  -- que comprueba y deja rastro (CLAUDE.md).
  begin
    insert into public.space_requests (requester_id, business_name, contact_name, email, plan)
    values (auth.uid(), 'Por la puerta de atrás', 'Ana', 'ana@magarinos.test', 'pro');
    raise exception 'RN-PLA-02 FALLIDO: se puede insertar una solicitud sin pasar por la función'
      using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- El borrador es suyo: ni otro cualquiera ni la plataforma lo ven.
select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.space_requests where id = (select v from pla_ids where k = 'sol')) then
    raise exception 'RN-PLA-02 FALLIDO: un tercero ve el borrador de otro' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.space_requests where id = (select v from pla_ids where k = 'sol')) then
    raise exception 'RN-PLA-02 FALLIDO: la plataforma ve un borrador que nadie le ha enviado'
      using errcode = 'assert_failure';
  end if;

  -- Y no puede decidir sobre lo que no ve.
  begin
    perform public.decide_space_request((select v from pla_ids where k = 'sol'), 'in_review');
    raise exception 'RN-PLA-03 FALLIDO: la plataforma mueve un borrador' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PLA%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-PLA-03 · enviar, y que el solicitante no decida sobre lo suyo
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid := (select v from pla_ids where k = 'sol');
begin
  perform public.submit_space_request(v_id);
  if (select status from public.space_requests where id = v_id) <> 'submitted' then
    raise exception 'RN-PLA-03 FALLIDO: enviar no deja la solicitud en "Enviada"' using errcode = 'assert_failure';
  end if;

  -- CA-17 · enviar dos veces no hace nada la segunda.
  perform public.submit_space_request(v_id);

  -- El solicitante no se aprueba a sí mismo.
  begin
    perform public.approve_space_request(v_id);
    raise exception 'RN-PLA-04 FALLIDO: el solicitante se aprueba su propio espacio' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PLA%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-PLA-04 · "si recibe permiso" no es decorativo
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_id uuid := (select v from pla_ids where k = 'sol');
begin
  -- Es Administrador de Cuotly, pero sin el permiso de §167.
  if public.is_platform_approver() then
    raise exception 'RN-PLA-04 FALLIDO: un Admin de Cuotly SIN permiso aprueba espacios' using errcode = 'assert_failure';
  end if;

  begin
    perform public.decide_space_request(v_id, 'in_review');
    raise exception 'RN-PLA-04 FALLIDO: decide un Admin de Cuotly sin permiso' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PLA%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-PLA-06 · rechazar y pedir información exigen motivo
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_id uuid := (select v from pla_ids where k = 'sol');
begin
  if not public.is_platform_approver() then
    raise exception 'RN-PLA-04 FALLIDO: un Admin de Cuotly CON permiso no puede decidir' using errcode = 'assert_failure';
  end if;

  perform public.decide_space_request(v_id, 'in_review');

  begin
    perform public.decide_space_request(v_id, 'needs_information', '   ');
    raise exception 'RN-PLA-06 FALLIDO: se pide información sin decir cuál' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PLA%' then raise; end if;
  end;

  perform public.decide_space_request(v_id, 'needs_information', 'Faltan los datos fiscales');
  if (select status_reason from public.space_requests where id = v_id) <> 'Faltan los datos fiscales' then
    raise exception 'RN-PLA-06 FALLIDO: el motivo no se guarda' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El solicitante lo lee, lo corrige y lo vuelve a enviar.
select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid := (select v from pla_ids where k = 'sol');
begin
  if (select status_reason from public.space_requests where id = v_id) is null then
    raise exception 'RN-PLA-06 FALLIDO: el solicitante no ve por qué le piden información'
      using errcode = 'assert_failure';
  end if;

  perform public.submit_space_request(v_id);
  if (select status from public.space_requests where id = v_id) <> 'submitted' then
    raise exception 'RN-PLA-03 FALLIDO: de "Necesita información" no se vuelve a enviar' using errcode = 'assert_failure';
  end if;

  -- RN-PLA-07 · el estado y el motivo sí; quién decidió, no.
  begin
    perform (select decided_by from public.space_requests where id = v_id);
    raise exception 'RN-PLA-07 FALLIDO: el solicitante lee decided_by' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- ============================================================
-- RN-PLA-05 · aprobar: cuatro cosas de una vez, y una sola vez
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from pla_ids where k = 'sol');
  v_space uuid;
  v_otra_vez uuid;
begin
  v_space := public.approve_space_request(v_id, 'clave-1');
  insert into pla_ids values ('espacio', v_space);

  if v_space is null then
    raise exception 'RN-PLA-05 FALLIDO: aprobar no devolvió ningún espacio' using errcode = 'assert_failure';
  end if;

  -- CA-17 · pulsarlo dos veces devuelve el MISMO espacio y no crea otro.
  v_otra_vez := public.approve_space_request(v_id, 'clave-1');
  if v_otra_vez <> v_space then
    raise exception 'RN-PLA-05 FALLIDO: aprobar dos veces devolvió dos espacios distintos' using errcode = 'assert_failure';
  end if;
  -- Que no haya creado un segundo espacio se cuenta más abajo, FUERA de
  -- RLS: quien aprueba no es miembro del espacio que acaba de crear, así
  -- que `select count(*) from spaces` le devuelve los suyos y no el nuevo.
  -- Contarlo desde aquí daba un falso negativo.

  -- Y de "Aprobada" no se sale (RN-PLA-03).
  begin
    perform public.decide_space_request(v_id, 'rejected', 'me lo he pensado mejor');
    raise exception 'RN-PLA-03 FALLIDO: una solicitud aprobada se puede rechazar después' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PLA%' then raise; end if;
  end;
end $$;
reset role;

-- Lo que aprobar dejó hecho lo comprueba **el propietario nuevo**, y no
-- quien aprobó. No es un capricho: el administrador de Cuotly NO es miembro
-- de ese espacio, así que la RLS de `space_memberships` no le enseña la
-- fila y la comprobación daba un falso negativo. Hacerlo desde dentro
-- prueba además lo que de verdad importa — que el solicitante entra en su
-- espacio y lo ve.
select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_space uuid := (select v from pla_ids where k = 'espacio');
begin
  -- 1 · el espacio existe, lo ve, y se llama como su negocio.
  if (select name from public.spaces where id = v_space) is distinct from 'Bar Magariños' then
    raise exception 'RN-PLA-05 FALLIDO: el propietario no ve su espacio, o no se llama como el negocio'
      using errcode = 'assert_failure';
  end if;

  -- 2 · es su propietario (§127: siempre debe existir al menos uno).
  if not exists (
    select 1 from public.space_memberships
    where space_id = v_space and user_id = auth.uid()
      and role = 'owner' and status = 'active'
  ) then
    raise exception 'RN-PLA-05 FALLIDO: el solicitante no quedó como propietario' using errcode = 'assert_failure';
  end if;

  -- 3 · con el plan que pidió y la prueba de 7 días corriendo (§4.4).
  --
  -- Se compara contra el plan de LA SOLICITUD y no contra 'pro' escrito a
  -- mano, y por una razón que este mismo test enseñó: el bloque de arriba
  -- vuelve a guardar el borrador con 'agency' para comprobar que no se
  -- abre un segundo borrador, así que el plan pedido acabó siendo ese. Un
  -- literal aquí comprobaba lo que el test creía recordar en vez de lo que
  -- había pasado.
  if (select s.cuotly_plan from public.spaces s where s.id = v_space)
     is distinct from (select r.plan from public.space_requests r where r.id = (select v from pla_ids where k = 'sol')) then
    raise exception 'RN-PLA-05 FALLIDO: el espacio no nació con el plan que se pidió' using errcode = 'assert_failure';
  end if;
  if (select cuotly_trial_ends_at from public.spaces where id = v_space) not between
       now() + interval '6 days' and now() + interval '8 days' then
    raise exception 'RN-PLA-05 FALLIDO: la prueba de 7 días no arrancó al aprobar (§4.4)' using errcode = 'assert_failure';
  end if;

  -- 4 · y su solicitud quedó apuntando al espacio que salió de ella.
  if (select space_id from public.space_requests where id = (select v from pla_ids where k = 'sol'))
     is distinct from v_space then
    raise exception 'RN-PLA-05 FALLIDO: la solicitud no apunta al espacio que creó' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-PLA-08 · la auditoría, con y sin espacio
-- ============================================================
do $$
declare
  v_id uuid := (select v from pla_ids where k = 'sol');
  v_space uuid := (select v from pla_ids where k = 'espacio');
begin
  -- Antes del espacio, los apuntes van con `space_id` nulo: no había
  -- espacio al que atribuirlos, y `audit_log.space_id` es anulable desde la
  -- Fase 1 precisamente para esto.
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'space_request' and entity_id = v_id
      and action = 'space_request.submitted' and space_id is null
  ) then
    raise exception 'RN-PLA-08 FALLIDO: enviar no dejó apunte de auditoría' using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.audit_log
    where entity_type = 'space_request' and entity_id = v_id
      and action = 'space_request.needs_information' and reason = 'Faltan los datos fiscales'
  ) then
    raise exception 'RN-PLA-08 FALLIDO: pedir información no dejó apunte con su motivo' using errcode = 'assert_failure';
  end if;

  -- Y el nacimiento del espacio sí lleva el espacio: quien mire su
  -- auditoría desde dentro tiene que poder ver cómo empezó.
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'space' and entity_id = v_space
      and action = 'space.created' and space_id = v_space
  ) then
    raise exception 'RN-PLA-08 FALLIDO: la creación del espacio no consta en la auditoría del espacio'
      using errcode = 'assert_failure';
  end if;

  -- El libro del recorrido, completo y en orden.
  if (select count(*) from public.space_request_events where request_id = v_id) < 5 then
    raise exception 'RN-PLA-08 FALLIDO: el recorrido de la solicitud no está entero' using errcode = 'assert_failure';
  end if;

  -- RN-PLA-05 · y aprobar dos veces no creó dos espacios. Se cuenta aquí,
  -- fuera de RLS, porque es la única identidad que ve todos los espacios.
  if (select count(*) from public.spaces where id = v_space) <> 1
     or (select count(*) from public.spaces s
         where s.created_by = 'ff900000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'RN-PLA-05 FALLIDO: aprobar dos veces creó dos espacios' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-PLA-09 · una prueba por persona; por negocio, no se finge
-- ============================================================
select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  insert into pla_ids values ('segunda', public.save_space_request_draft(
    'Otro Bar de la misma persona', 'Ana Magariños', 'ana@magarinos.test', 'agency'));
  perform public.submit_space_request((select v from pla_ids where k = 'segunda'));
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.approve_space_request((select v from pla_ids where k = 'segunda'));
    raise exception 'RN-PLA-09 FALLIDO: la misma persona consigue una segunda prueba gratuita (§4.4)'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PLA%' then raise; end if;
  end;
end $$;
reset role;

-- Y lo que HOY no se comprueba, dicho en una prueba y no en un comentario:
-- otra persona con el MISMO negocio sí pasa. No es un descuido, es la
-- pendiente 19 de docs/DECISIONES.md — la maestra no dice qué identifica a
-- un negocio, y CLAUDE.md prohíbe inventarlo. Cuando se cierre, este
-- bloque se da la vuelta y pasa a exigir el rechazo.
select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  insert into pla_ids values ('mismo_negocio', public.save_space_request_draft(
    'Bar Magariños', 'Otro Responsable', 'otro@magarinos.test', 'pro'));
  perform public.submit_space_request((select v from pla_ids where k = 'mismo_negocio'));
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ff900000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_espacio uuid;
begin
  v_espacio := public.approve_space_request((select v from pla_ids where k = 'mismo_negocio'));
  if v_espacio is null then
    raise exception 'RN-PLA-09 FALLIDO: se está fingiendo una comprobación por negocio que no existe'
      using errcode = 'assert_failure';
  end if;

  -- Dos negocios con el mismo nombre no chocan: el slug se numera.
  if (select slug from public.spaces where id = v_espacio)
     = (select slug from public.spaces where id = (select v from pla_ids where k = 'espacio')) then
    raise exception 'RN-PLA-05 FALLIDO: dos espacios con el mismo nombre comparten slug' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- Privilegios: la interna cerrada, las públicas para `authenticated`
-- ============================================================
do $$
declare v_fn text;
begin
  if has_function_privilege('anon', 'public.space_slug_from_name(text)', 'execute')
     or has_function_privilege('authenticated', 'public.space_slug_from_name(text)', 'execute') then
    raise exception 'CLAUDE.md MUST FALLIDO: space_slug_from_name está abierta por RPC' using errcode = 'assert_failure';
  end if;

  foreach v_fn in array array[
    'save_space_request_draft(text, text, text, text, text, integer, integer, text, text, text, text)',
    'submit_space_request(uuid)',
    'decide_space_request(uuid, text, text)',
    'approve_space_request(uuid, text)',
    'is_platform_approver()',
    'space_request_transition_allowed(text, text, text)']
  loop
    if has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % está abierta a anon', v_fn using errcode = 'assert_failure';
    end if;
    if not has_function_privilege('authenticated', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % no la puede llamar nadie', v_fn using errcode = 'assert_failure';
    end if;
  end loop;
end $$;

select 'plataforma_solicitud_de_espacio.sql: RN-PLA-01 a 09 cumplidos' as resultado;
