-- Paso 2 del orden acordado · cómo se entra en Cuotly (migración 97;
-- PRD §37, RN-ACC-01 a RN-ACC-12; decisión 41 del 16/09/2026).
--
--   · RN-ACC-01: dos puertas y ninguna más. Sin solicitud aprobada ni
--     invitación viva, las dos funciones que materializan una cuenta
--     fallan cerradas.
--   · RN-ACC-02: los cinco campos, y el formulario público que escribe.
--   · RN-ACC-03: aprobar NO crea espacio, ni panel, ni suscripción.
--   · RN-ACC-04: enlace de un solo uso y con caducidad; la contraseña no
--     viaja por correo, y el correo que la anuncia se encola con
--     idempotencia.
--   · RN-ACC-05: cuatro estados, transiciones en el servidor, motivo
--     obligatorio al pedir información y al rechazar.
--   · RN-ACC-06: la revisa "Aprobar espacios" con la sesión en dos pasos.
--   · RN-ACC-07: el solicitante no ve quién la revisó (columna revocada).
--   · RN-ACC-08: auditoría con `space_id` nulo, e idempotencia al aprobar.
--   · RN-ACC-09: la invitación también crea cuenta, con el correo atado.
--   · RN-ACC-12: el formulario público no es un oráculo de correos.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/como_se_entra_en_cuotly.sql

-- Bosco: el correo que reconoce `is_platform_owner()`. Mismo id que en las
-- suites de plataforma, que lo dejan creado si corren antes que esta.
insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('ffe00000-0000-0000-0000-000000000002', 'acc-admin-con@example.com', 'authenticated', 'authenticated'),
  ('ffe00000-0000-0000-0000-000000000003', 'acc-admin-sin@example.com', 'authenticated', 'authenticated'),
  ('ffe00000-0000-0000-0000-000000000004', 'acc-duena@casa-lola.test', 'authenticated', 'authenticated'),
  ('ffe00000-0000-0000-0000-000000000007', 'acc-intrusa@ajena.test', 'authenticated', 'authenticated');

-- Las dos cuentas que NACEN durante esta suite —la del enlace aprobado y
-- la de la invitación— no se crean aquí a propósito: el orden es parte de
-- lo que se comprueba. Antes de que existan, la solicitud tiene que poder
-- enviarse y la invitación tiene que pedir contraseña; si estuvieran
-- creadas desde el principio, las dos ramas se probarían al revés y la
-- suite pasaría en verde sin haber probado nada. En el proyecto real las
-- crea GoTrue con la API de administración, que es lo que la migración
-- explica: el alta pública se cierra en `config.toml`, no aquí dentro.

-- §167 · un Administrador de Cuotly CON "Aprobar espacios" y otro SIN él.
insert into public.platform_roles (user_id, role, can_approve_spaces) values
  ('ffe00000-0000-0000-0000-000000000002', 'cuotly_admin', true),
  ('ffe00000-0000-0000-0000-000000000003', 'cuotly_admin', false);

-- RN-ADM-02 · sin este reclamo la plataforma no existe y la suite pasaría
-- en verde por el lado equivocado.
select set_config('request.jwt.claim.aal', 'aal2', false);

create temp table acc_ids (k text primary key, v uuid);
grant select, insert, update on acc_ids to anon, authenticated, service_role;

-- ============================================================
-- RN-ACC-02 · la forma de la tabla: sin `space_id` y sin `requester_id`
-- ============================================================
do $$
begin
  -- Es la primera tabla del proyecto sin dueño: quien la escribe todavía
  -- no es nadie en Cuotly. Si algún día alguien le ata un `requester_id`
  -- "por coherencia", el formulario dejaría de ser público y la puerta se
  -- cerraría sin que nadie lo dijera.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'access_requests'
      and column_name in ('space_id', 'requester_id')
  ) then
    raise exception 'RN-ACC-02 FALLIDO: access_requests tiene dueño o espacio, y no puede tener ninguno de los dos'
      using errcode = 'assert_failure';
  end if;

  -- Los cinco campos de F01.
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'access_requests'
        and column_name in ('contact_name', 'business_name', 'phone', 'email', 'comments')) <> 5 then
    raise exception 'RN-ACC-02 FALLIDO: faltan campos de F01' using errcode = 'assert_failure';
  end if;

  -- Los cuatro primeros son obligatorios; los comentarios, no.
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'access_requests'
        and column_name in ('contact_name', 'business_name', 'phone', 'email')
        and is_nullable = 'NO') <> 4
     or (select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'access_requests'
           and column_name = 'comments') <> 'YES' then
    raise exception 'RN-ACC-02 FALLIDO: los obligatorios de F01 no son los cuatro primeros'
      using errcode = 'assert_failure';
  end if;

  -- Las cuatro tablas llevan RLS. No llevar `space_id` no es no llevarla.
  if not (select relrowsecurity from pg_class where oid = 'public.access_requests'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.access_request_events'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.account_setup_tokens'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.platform_emails'::regclass) then
    raise exception 'RN-ACC-02 FALLIDO: una tabla de esta migración sin RLS' using errcode = 'assert_failure';
  end if;

  -- RN-ACC-04 · el enlace y la cola de correo son credenciales: no se
  -- leen por PostgREST ni con sesión ni sin ella. Se cierran por
  -- privilegio, como `space_sequences`.
  if has_table_privilege('authenticated', 'public.account_setup_tokens', 'select')
     or has_table_privilege('anon', 'public.account_setup_tokens', 'select')
     or has_table_privilege('authenticated', 'public.platform_emails', 'select')
     or has_table_privilege('anon', 'public.platform_emails', 'select') then
    raise exception 'RN-ACC-04 FALLIDO: el enlace de alta o la cola de correo se pueden leer por PostgREST'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ACC-07 · `decided_by` revocada, y con ella los dos secretos
-- ============================================================
do $$
begin
  -- Quién decidió sale de `audit_log`, nunca de la columna. Y la clave de
  -- seguimiento tampoco se enseña: con ella se leería la solicitud de
  -- otro.
  if has_column_privilege('authenticated', 'public.access_requests', 'decided_by', 'select')
     or has_column_privilege('authenticated', 'public.access_requests', 'follow_up_token', 'select')
     or has_column_privilege('authenticated', 'public.access_requests', 'idempotency_key', 'select') then
    raise exception 'RN-ACC-07 FALLIDO: una columna que no debe verse sigue concedida'
      using errcode = 'assert_failure';
  end if;

  -- Y las que sí son de la solicitud siguen concedidas: revocar de más
  -- rompería la pantalla de revisión y se notaría tarde.
  if not has_column_privilege('authenticated', 'public.access_requests', 'status', 'select')
     or not has_column_privilege('authenticated', 'public.access_requests', 'status_reason', 'select') then
    raise exception 'RN-ACC-07 FALLIDO: la pantalla de revisión se ha quedado sin columnas'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ACC-02 y RN-ACC-12 · el formulario público, sentado como `anon`
-- ============================================================
set role anon;
do $$
begin
  perform public.submit_access_request(
    'Nuria Vela', 'Bar Nuevo', '600111222', 'acc-nueva@bar-nuevo.test',
    'Tengo una web de 2019 y quiero mantenerla');

  -- Faltando cualquiera de los cuatro obligatorios, no pasa.
  begin
    perform public.submit_access_request('', 'Bar Nuevo', '600111222', 'otro@bar-nuevo.test');
    raise exception 'RN-ACC-02 FALLIDO: una solicitud sin nombre se envió' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;

  begin
    perform public.submit_access_request('Nuria', 'Bar Nuevo', '600111222', 'esto-no-es-un-correo');
    raise exception 'RN-ACC-02 FALLIDO: una solicitud sin correo válido se envió' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;
end $$;
reset role;

do $$
declare v_id uuid; v_n integer;
begin
  select count(*) into v_n from public.access_requests;
  if v_n <> 1 then
    raise exception 'RN-ACC-02 FALLIDO: se esperaba UNA solicitud y hay %', v_n using errcode = 'assert_failure';
  end if;

  select id into v_id from public.access_requests where email = 'acc-nueva@bar-nuevo.test';
  insert into acc_ids values ('sol', v_id);
  insert into acc_ids values ('clave', (select follow_up_token from public.access_requests where id = v_id));

  if (select status from public.access_requests where id = v_id) <> 'submitted' then
    raise exception 'RN-ACC-05 FALLIDO: una solicitud recién enviada no nace "Enviada"' using errcode = 'assert_failure';
  end if;

  -- RN-ACC-08 · el libro y la auditoría, con `space_id` y `actor_id`
  -- nulos: no hay espacio, y quien la escribió no es nadie todavía.
  if not exists (select 1 from public.access_request_events
                 where request_id = v_id and to_status = 'submitted' and from_status is null) then
    raise exception 'RN-ACC-08 FALLIDO: la solicitud no dejó apunte en su libro' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log
                 where action = 'access_request.submitted' and entity_id = v_id
                   and space_id is null and actor_id is null) then
    raise exception 'RN-ACC-08 FALLIDO: la auditoría de una solicitud sin cuenta no es la que se prometió'
      using errcode = 'assert_failure';
  end if;

  -- RN-ACC-04 · el acuse se encola, no lo escribe una pantalla.
  if not exists (select 1 from public.platform_emails
                 where kind = 'access_request_received' and to_email = 'acc-nueva@bar-nuevo.test') then
    raise exception 'RN-ACC-04 FALLIDO: no se encoló el acuse de recibo' using errcode = 'assert_failure';
  end if;
end $$;

-- RN-ACC-12 · el formulario no es un oráculo. Reenviarlo con el mismo
-- correo no abre una segunda solicitud, no cambia la clave de seguimiento
-- de la primera, y no devuelve nada distinto: por fuera, lo mismo.
set role anon;
do $$
begin
  perform public.submit_access_request('Nuria Vela', 'Bar Nuevo', '600111222', 'acc-nueva@bar-nuevo.test');
  -- Y con un correo que YA tiene cuenta, tampoco pasa nada visible.
  perform public.submit_access_request('Intrusa', 'Lo que sea', '600000000', 'info@restavor.com');
end $$;
reset role;

do $$
begin
  if (select count(*) from public.access_requests) <> 1 then
    raise exception 'RN-ACC-12 FALLIDO: reenviar el formulario abrió una segunda solicitud'
      using errcode = 'assert_failure';
  end if;

  if (select follow_up_token from public.access_requests where id = (select v from acc_ids where k = 'sol'))
     <> (select v from acc_ids where k = 'clave') then
    raise exception 'RN-ACC-12 FALLIDO: reenviar el formulario cambió la clave de seguimiento de otro'
      using errcode = 'assert_failure';
  end if;

  if exists (select 1 from public.access_requests where email = 'info@restavor.com') then
    raise exception 'RN-ACC-12 FALLIDO: se abrió una solicitud para un correo que ya tiene cuenta'
      using errcode = 'assert_failure';
  end if;

  -- Lo que sí cambia es el correo que sale: quien se entera es la
  -- dirección, no la pantalla.
  if not exists (select 1 from public.platform_emails
                 where kind = 'access_request_already_registered' and to_email = 'info@restavor.com') then
    raise exception 'RN-ACC-12 FALLIDO: a quien ya tiene cuenta no se le avisó por correo'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ACC-12 · el seguimiento por la clave, sin cuenta
-- ============================================================
set role anon;
do $$
declare v_estado text; v_quien boolean;
begin
  select status into v_estado from public.access_request_follow_up((select v from acc_ids where k = 'clave'));
  if v_estado <> 'submitted' then
    raise exception 'RN-ACC-12 FALLIDO: el enlace con clave no devuelve el estado' using errcode = 'assert_failure';
  end if;

  -- Una clave inventada no devuelve nada, y no dice si existe o no.
  if exists (select 1 from public.access_request_follow_up('00000000-0000-0000-0000-0000000000ff')) then
    raise exception 'RN-ACC-12 FALLIDO: una clave inventada devuelve una solicitud' using errcode = 'assert_failure';
  end if;

  -- Y `anon` no puede leer la tabla por su cuenta, ni con clave ni sin ella.
  begin
    select true into v_quien from public.access_requests limit 1;
    raise exception 'RN-ACC-12 FALLIDO: anon lee access_requests directamente' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-ACC-06 · quién decide: ni un usuario normal, ni un Admin sin permiso
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffe00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  begin
    perform public.decide_access_request((select v from acc_ids where k = 'sol'), 'rejected', 'porque sí');
    raise exception 'RN-ACC-06 FALLIDO: un usuario normal decidió sobre una solicitud de acceso'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;

  -- Tampoco la ve: la lista de solicitudes es de la plataforma.
  if exists (select id from public.access_requests) then
    raise exception 'RN-ACC-06 FALLIDO: un usuario normal ve las solicitudes de acceso'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffe00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.approve_access_request((select v from acc_ids where k = 'sol'), 'acc-1');
    raise exception 'RN-ACC-06 FALLIDO: un Administrador de Cuotly SIN "Aprobar espacios" aprobó'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;
end $$;
reset role;

-- Y con el permiso pero SIN la sesión verificada en dos pasos, tampoco
-- (RN-ADM-02). Sin esta comprobación, la 2FA sería decorativa.
select set_config('request.jwt.claim.aal', 'aal1', false);
select set_config('request.jwt.claim.sub', 'ffe00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  begin
    perform public.approve_access_request((select v from acc_ids where k = 'sol'), 'acc-1');
    raise exception 'RN-ACC-06 FALLIDO: se aprobó sin la sesión verificada en dos pasos'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.aal', 'aal2', false);

-- ============================================================
-- RN-ACC-05 · pedir información exige motivo, y la respuesta vuelve
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffe00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  begin
    perform public.decide_access_request((select v from acc_ids where k = 'sol'), 'needs_information', '  ');
    raise exception 'RN-ACC-05 FALLIDO: se pidió información sin decir cuál' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;

  perform public.decide_access_request(
    (select v from acc_ids where k = 'sol'), 'needs_information',
    '¿La web la tienes en WordPress o en otra cosa?');
end $$;
reset role;

do $$
begin
  if (select status from public.access_requests where id = (select v from acc_ids where k = 'sol'))
     <> 'needs_information' then
    raise exception 'RN-ACC-05 FALLIDO: la solicitud no quedó en "Necesita información"'
      using errcode = 'assert_failure';
  end if;

  -- RN-ACC-05 · "necesita información" NO es un estado final: no lleva
  -- fecha de decisión, porque no se ha decidido nada.
  if (select decided_at from public.access_requests where id = (select v from acc_ids where k = 'sol')) is not null then
    raise exception 'RN-ACC-05 FALLIDO: pedir información se anotó como una decisión'
      using errcode = 'assert_failure';
  end if;

  if not exists (select 1 from public.platform_emails
                 where kind = 'access_request_needs_information' and to_email = 'acc-nueva@bar-nuevo.test') then
    raise exception 'RN-ACC-04 FALLIDO: no se encoló el correo de "necesita información"'
      using errcode = 'assert_failure';
  end if;
end $$;

-- Quien solicita contesta por el enlace, sin cuenta, y vuelve a la cola.
set role anon;
do $$
begin
  begin
    perform public.reply_to_access_request((select v from acc_ids where k = 'clave'), '   ');
    raise exception 'RN-ACC-05 FALLIDO: se aceptó una respuesta vacía' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;

  perform public.reply_to_access_request(
    (select v from acc_ids where k = 'clave'), 'Es WordPress, versión 6.');
end $$;
reset role;

do $$
begin
  if (select status from public.access_requests where id = (select v from acc_ids where k = 'sol')) <> 'submitted' then
    raise exception 'RN-ACC-05 FALLIDO: la respuesta no devolvió la solicitud a la cola'
      using errcode = 'assert_failure';
  end if;
  if (select applicant_reply from public.access_requests where id = (select v from acc_ids where k = 'sol'))
     <> 'Es WordPress, versión 6.' then
    raise exception 'RN-ACC-05 FALLIDO: no se guardó la respuesta de quien solicita'
      using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log
                 where action = 'access_request.replied'
                   and entity_id = (select v from acc_ids where k = 'sol')
                   and space_id is null and actor_id is null) then
    raise exception 'RN-ACC-08 FALLIDO: la respuesta no dejó auditoría' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ACC-03, RN-ACC-04 y RN-ACC-08 · aprobar
-- ============================================================
create temp table acc_fotos (k text primary key, n integer);
insert into acc_fotos values ('espacios_antes', (select count(*) from public.spaces));

select set_config('request.jwt.claim.sub', 'ffe00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_token uuid; v_otra uuid;
begin
  v_token := public.approve_access_request((select v from acc_ids where k = 'sol'), 'acc-aprueba');
  if v_token is null then
    raise exception 'RN-ACC-04 FALLIDO: aprobar no devolvió el enlace de alta' using errcode = 'assert_failure';
  end if;
  insert into acc_ids values ('alta', v_token);

  -- RN-ACC-08 · pulsar dos veces devuelve el MISMO enlace.
  v_otra := public.approve_access_request((select v from acc_ids where k = 'sol'), 'acc-aprueba');
  if v_otra <> v_token then
    raise exception 'RN-ACC-08 FALLIDO: aprobar dos veces creó un segundo enlace' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
begin
  -- RN-ACC-03 · aprobar NO crea espacio, ni panel, ni suscripción. Se
  -- cuenta contra la foto tomada justo antes de aprobar, porque esta suite
  -- corre detrás de otras que sí crean espacios.
  if (select count(*) from public.spaces) <> (select n from acc_fotos where k = 'espacios_antes') then
    raise exception 'RN-ACC-03 FALLIDO: aprobar una solicitud de acceso creó un espacio'
      using errcode = 'assert_failure';
  end if;

  -- Y tampoco crea la cuenta todavía: la contraseña no ha viajado por
  -- ningún sitio, y sin contraseña no hay cuenta a la que entrar.
  if (select account_id from public.access_requests where id = (select v from acc_ids where k = 'sol')) is not null then
    raise exception 'RN-ACC-04 FALLIDO: hay cuenta antes de que nadie haya puesto una contraseña'
      using errcode = 'assert_failure';
  end if;

  -- RN-ACC-08 · un solo enlace y un solo correo, aunque se pulsara dos veces.
  if (select count(*) from public.account_setup_tokens
      where access_request_id = (select v from acc_ids where k = 'sol')) <> 1 then
    raise exception 'RN-ACC-08 FALLIDO: hay más de un enlace de alta para la misma solicitud'
      using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.platform_emails where kind = 'access_request_approved') <> 1 then
    raise exception 'RN-ACC-08 FALLIDO: se encoló el correo de aprobación dos veces'
      using errcode = 'assert_failure';
  end if;

  if not exists (select 1 from public.audit_log
                 where action = 'access_request.approved'
                   and entity_id = (select v from acc_ids where k = 'sol')
                   and space_id is null
                   and actor_id = 'ffe00000-0000-0000-0000-000000000002') then
    raise exception 'RN-ACC-08 FALLIDO: aprobar no dejó auditoría con actor' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ACC-04 · el enlace: lo que enseña, y que es de un solo uso
-- ============================================================
set role anon;
do $$
declare v_correo text; v_estado text;
begin
  select email, state into v_correo, v_estado
  from public.account_setup_details((select v from acc_ids where k = 'alta'));

  if v_estado <> 'valid' or v_correo <> 'acc-nueva@bar-nuevo.test' then
    raise exception 'RN-ACC-04 FALLIDO: el enlace vivo no devuelve el correo aprobado'
      using errcode = 'assert_failure';
  end if;

  -- Un enlace inventado no dice de quién era.
  select email, state into v_correo, v_estado
  from public.account_setup_details('00000000-0000-0000-0000-0000000000aa');
  if v_estado is not null then
    raise exception 'RN-ACC-04 FALLIDO: un enlace inventado devuelve algo' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- RN-ACC-01 · gastar el enlace es cosa de `service_role`, y de nadie más.
select set_config('request.jwt.claim.sub', 'ffe00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  begin
    perform public.consume_account_setup_token(
      (select v from acc_ids where k = 'alta'), 'ffe00000-0000-0000-0000-000000000005');
    raise exception 'RN-ACC-01 FALLIDO: una sesión normal puede gastar un enlace de alta'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;
end $$;
reset role;

-- El servidor crea la cuenta con la clave de administración (aquí, a
-- mano: no hay GoTrue) y solo entonces gasta el enlace, en la misma
-- acción. Si el enlace no vale, el servidor deshace el alta.
insert into auth.users (id, email, role, aud) values
  ('ffe00000-0000-0000-0000-000000000005', 'acc-nueva@bar-nuevo.test', 'authenticated', 'authenticated');

set role service_role;
do $$
begin
  -- Falla cerrado si el correo de la cuenta no es el aprobado: sin esto,
  -- un enlace aprobado serviría para dar de alta a cualquiera.
  begin
    perform public.consume_account_setup_token(
      (select v from acc_ids where k = 'alta'), 'ffe00000-0000-0000-0000-000000000007');
    raise exception 'RN-ACC-01 FALLIDO: el enlace dio de alta a un correo que no era el aprobado'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;

  perform public.consume_account_setup_token(
    (select v from acc_ids where k = 'alta'), 'ffe00000-0000-0000-0000-000000000005');

  -- Y es de UN SOLO uso: el segundo intento no pasa.
  begin
    perform public.consume_account_setup_token(
      (select v from acc_ids where k = 'alta'), 'ffe00000-0000-0000-0000-000000000005');
    raise exception 'RN-ACC-04 FALLIDO: el enlace de alta se pudo gastar dos veces'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;
end $$;
reset role;

do $$
begin
  if (select account_id from public.access_requests where id = (select v from acc_ids where k = 'sol'))
     <> 'ffe00000-0000-0000-0000-000000000005' then
    raise exception 'RN-ACC-03 FALLIDO: la cuenta no quedó atada a su solicitud' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log
                 where action = 'access_request.account_created'
                   and entity_id = (select v from acc_ids where k = 'sol') and space_id is null) then
    raise exception 'RN-ACC-08 FALLIDO: crear la cuenta no dejó auditoría' using errcode = 'assert_failure';
  end if;
end $$;

-- Un enlace caducado no vale, aunque esté sin usar.
do $$
declare v_tok uuid;
begin
  insert into public.access_requests (contact_name, business_name, phone, email, status, decided_at)
  values ('Tarde Tarde', 'Bar Tarde', '600999888', 'acc-tarde@bar-tarde.test', 'approved', now());
  insert into public.account_setup_tokens (access_request_id, email, expires_at)
  values ((select id from public.access_requests where email = 'acc-tarde@bar-tarde.test'),
          'acc-tarde@bar-tarde.test', now() - interval '1 minute')
  returning token into v_tok;
  insert into acc_ids values ('caducado', v_tok);
end $$;

set role anon;
do $$
declare v_estado text; v_correo text;
begin
  select email, state into v_correo, v_estado
  from public.account_setup_details((select v from acc_ids where k = 'caducado'));
  if v_estado <> 'expired' or v_correo is not null then
    raise exception 'RN-ACC-04 FALLIDO: un enlace caducado sigue enseñando el correo'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ACC-09 · la otra puerta: la invitación también crea cuenta
-- ============================================================
--
-- Hace falta un espacio de verdad, con su propietaria, y el camino de
-- siempre: una solicitud de creación de espacio aprobada (RN-PLA-05).
select set_config('request.jwt.claim.sub', 'ffe00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Casa Lola', 'Lola Serra', 'acc-duena@casa-lola.test', 'pro', '600222333');
  perform public.submit_space_request(v_id);
  insert into acc_ids values ('sol_espacio', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  insert into acc_ids values ('espacio',
    public.approve_space_request((select v from acc_ids where k = 'sol_espacio'), 'acc-espacio'));
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffe00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_token uuid;
begin
  insert into public.space_invitations (space_id, email, role, invited_by)
  values ((select v from acc_ids where k = 'espacio'), 'acc-invitada@casa-lola.test',
          'worker', 'ffe00000-0000-0000-0000-000000000004')
  returning token into v_token;
  insert into acc_ids values ('invitacion', v_token);
end $$;
reset role;

set role anon;
do $$
declare v_correo text; v_estado text; v_tiene boolean; v_espacio text;
begin
  select email, space_name, state, has_account into v_correo, v_espacio, v_estado, v_tiene
  from public.invitation_signup_details((select v from acc_ids where k = 'invitacion'));

  -- RN-ACC-09 · el correo viene prefijado, y con él el nombre del espacio,
  -- para que quien lo recibe sepa a dónde entra.
  if v_estado <> 'valid' or v_correo <> 'acc-invitada@casa-lola.test' or v_espacio is null then
    raise exception 'RN-ACC-09 FALLIDO: la invitación no enseña el correo prefijado y su espacio'
      using errcode = 'assert_failure';
  end if;

  -- Ese correo todavía NO tiene cuenta, así que lo que toca es poner
  -- contraseña. La rama contraria se comprueba más abajo, cuando exista.
  if v_tiene then
    raise exception 'RN-ACC-09 FALLIDO: se dice que hay cuenta donde no la hay'
      using errcode = 'assert_failure';
  end if;

  -- Una invitación inventada no dice nada.
  select state into v_estado
  from public.invitation_signup_details('00000000-0000-0000-0000-0000000000bb');
  if v_estado is not null then
    raise exception 'RN-ACC-09 FALLIDO: una invitación inventada devuelve algo' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El servidor crea la cuenta con el correo de la invitación —el que la
-- pantalla enseñaba bloqueado— y acepta en la misma acción.
insert into auth.users (id, email, role, aud) values
  ('ffe00000-0000-0000-0000-000000000006', 'acc-invitada@casa-lola.test', 'authenticated', 'authenticated');

-- Y ahora sí: con la cuenta creada, la misma invitación deja de pedir
-- contraseña y pasa a pedir que se entre (HU-04 desde el otro lado).
set role anon;
do $$
declare v_tiene boolean;
begin
  select has_account into v_tiene
  from public.invitation_signup_details((select v from acc_ids where k = 'invitacion'));
  if not v_tiene then
    raise exception 'RN-ACC-09 FALLIDO: con la cuenta ya creada sigue diciendo que no la hay'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- RN-ACC-01 · aceptar por cuenta de alguien es de `service_role`.
select set_config('request.jwt.claim.sub', 'ffe00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  begin
    perform public.accept_space_invitation_as(
      (select v from acc_ids where k = 'invitacion'), 'ffe00000-0000-0000-0000-000000000006');
    raise exception 'RN-ACC-01 FALLIDO: una sesión normal acepta invitaciones por cuenta de otro'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;
end $$;
reset role;

set role service_role;
do $$
begin
  -- El correo tiene que coincidir: es lo que la migración 7 exige desde
  -- siempre, y por eso la pantalla lo enseña bloqueado.
  begin
    perform public.accept_space_invitation_as(
      (select v from acc_ids where k = 'invitacion'), 'ffe00000-0000-0000-0000-000000000007');
    raise exception 'RN-ACC-09 FALLIDO: una invitación se aceptó desde otro correo'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;

  perform public.accept_space_invitation_as(
    (select v from acc_ids where k = 'invitacion'), 'ffe00000-0000-0000-0000-000000000006');
end $$;
reset role;

do $$
begin
  if not exists (select 1 from public.space_memberships
                 where space_id = (select v from acc_ids where k = 'espacio')
                   and user_id = 'ffe00000-0000-0000-0000-000000000006'
                   and status = 'active' and role = 'worker') then
    raise exception 'RN-ACC-09 FALLIDO: la invitación no dejó a la persona dentro de su espacio'
      using errcode = 'assert_failure';
  end if;
  if (select status from public.space_invitations
      where token = (select v from acc_ids where k = 'invitacion')) <> 'accepted' then
    raise exception 'RN-ACC-09 FALLIDO: la invitación no quedó aceptada' using errcode = 'assert_failure';
  end if;
end $$;

-- La de siempre sigue funcionando con la sesión de quien acepta: la
-- migración 97 partió el cuerpo en dos, no cambió ninguna comprobación.
select set_config('request.jwt.claim.sub', 'ffe00000-0000-0000-0000-000000000007', false);
set role authenticated;
do $$
begin
  begin
    perform public.accept_space_invitation((select v from acc_ids where k = 'invitacion'));
    raise exception 'RN-ACC-09 FALLIDO: se aceptó dos veces una invitación ya aceptada'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ACC%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-ACC-01 · el barrido: las cuatro funciones que crean o autorizan una
-- cuenta siguen reservadas, y las tres públicas siguen siendo las tres
-- ============================================================
do $$
declare v_mal text := '';
begin
  -- Reservadas a `service_role`: ni `anon` ni `authenticated`.
  for v_mal in
    select string_agg(p.proname, ', ')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('consume_account_setup_token', 'accept_space_invitation_as',
                        'queue_platform_email', 'claim_platform_emails',
                        'mark_platform_email_sent', 'mark_platform_email_failed')
      and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    if v_mal is not null then
      raise exception 'RN-ACC-01 FALLIDO: función interna abierta por RPC: %', v_mal
        using errcode = 'assert_failure';
    end if;
  end loop;

  -- Y las del formulario público siguen abiertas a `anon`: si alguien las
  -- revoca "por seguridad", la puerta se cierra entera y nadie entra.
  if not has_function_privilege('anon', 'public.submit_access_request(text, text, text, text, text)', 'execute')
     or not has_function_privilege('anon', 'public.access_request_follow_up(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.reply_to_access_request(uuid, text)', 'execute')
     or not has_function_privilege('anon', 'public.account_setup_details(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.invitation_signup_details(uuid)', 'execute') then
    raise exception 'RN-ACC-02 FALLIDO: el formulario público se ha quedado sin poder llamar a su función'
      using errcode = 'assert_failure';
  end if;
end $$;

select 'como_se_entra_en_cuotly: OK' as resultado;
