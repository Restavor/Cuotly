-- Paso 2 del orden acordado · el contexto global (migración 98;
-- PRD §36, RN-GLO-01 a RN-GLO-08; diseño definitivo, vistas G01 a G08).
--
--   · RN-GLO-01: aquí no nace ninguna capacidad nueva. `my_contexts()` es
--     SECURITY INVOKER y las otras dos se apoyan en las políticas de
--     siempre; ninguna está abierta a `anon`.
--   · RN-GLO-03: mis contextos son los míos, sin repetir y sin los ajenos.
--   · RN-GLO-05: la bandeja reúne y no duplica; al cliente no le llega una
--     conversación interna de trabajo ni el nombre del espacio.
--   · RN-GLO-02: lo que espera al restaurante es suyo y de nadie más.
--   · RN-GLO-06: Mi cuenta es de la persona; la zona horaria de la cuenta
--     no toca la del espacio; la preferencia del espacio manda sobre la de
--     la persona; y un aviso obligatorio no se apaga tampoco desde aquí.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_contexto_global.sql

-- Bosco: el correo que reconoce `is_platform_owner()`. Mismo id que en las
-- suites de plataforma, que lo dejan creado si corren antes que esta.
insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('fff00000-0000-0000-0000-000000000001', 'glo-duena@example.com', 'authenticated', 'authenticated'),
  ('fff00000-0000-0000-0000-000000000002', 'glo-trabajadora@example.com', 'authenticated', 'authenticated'),
  ('fff00000-0000-0000-0000-000000000003', 'glo-cliente@bar-global.test', 'authenticated', 'authenticated'),
  ('fff00000-0000-0000-0000-000000000004', 'glo-ajena@example.com', 'authenticated', 'authenticated');

select set_config('request.jwt.claim.aal', 'aal2', false);

create temp table glo_ids (k text primary key, v uuid);
grant select, insert, update on glo_ids to anon, authenticated, service_role;

-- ============================================================
-- Fixtures · un espacio con dos personas, un restaurante y su cliente
-- ============================================================
select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Global SL', 'Dueña Global', 'glo-duena@example.com', 'pro', '600111222');
  perform public.submit_space_request(v_id);
  insert into glo_ids values ('sol', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  insert into glo_ids values ('espacio',
    public.approve_space_request((select v from glo_ids where k = 'sol'), 'glo-espacio'));
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_est uuid;
begin
  -- Una trabajadora más en el MISMO espacio. Sin ella no se puede
  -- comprobar la trampa de `space_memberships`, que deja ver a todo el
  -- equipo y haría salir el espacio repetido.
  insert into public.space_memberships (space_id, user_id, role, status)
  values ((select v from glo_ids where k = 'espacio'),
          'fff00000-0000-0000-0000-000000000002', 'worker', 'active');

  v_est := public.create_establishment_with_data(
    (select v from glo_ids where k = 'espacio'), 'Bar Global', null, 'Grupo Global');
  insert into glo_ids values ('rest', v_est);

  perform public.grant_establishment_access(
    v_est, 'glo-cliente@bar-global.test', 'local_owner', false, true);
end $$;
reset role;

-- ============================================================
-- RN-GLO-01 · aquí no nace ninguna capacidad nueva
-- ============================================================
do $$
begin
  -- `my_contexts()` NO es SECURITY DEFINER: lo que se ve lo decide la RLS
  -- de siempre. Si alguien se la pone "para que vaya más rápido", la
  -- función deja de estar sujeta a las políticas y se convierte justo en
  -- la consulta privilegiada que RN-GLO-01 prohíbe.
  if (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'my_contexts') then
    raise exception 'RN-GLO-01 FALLIDO: my_contexts() es SECURITY DEFINER y deja de pasar por RLS'
      using errcode = 'assert_failure';
  end if;

  -- Sin sesión no hay contexto global: `auth.uid()` es null y las tres no
  -- tendrían a quién contestar.
  if has_function_privilege('anon', 'public.my_contexts()', 'execute')
     or has_function_privilege('anon', 'public.list_my_conversations()', 'execute')
     or has_function_privilege('anon', 'public.my_client_attention()', 'execute')
     or has_function_privilege('anon', 'public.my_notification_preferences()', 'execute') then
    raise exception 'RN-GLO-01 FALLIDO: una función del contexto global está abierta a anon'
      using errcode = 'assert_failure';
  end if;

  -- El dictamen de preferencias es interno: lo usa `emit_notification()` y
  -- nadie más.
  if has_function_privilege('authenticated', 'public.effective_notification_preference(uuid, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.effective_notification_preference(uuid, uuid, text)', 'execute') then
    raise exception 'RN-GLO-06 FALLIDO: effective_notification_preference() está abierta por RPC'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-GLO-03 · mis contextos son los míos, sin repetir
-- ============================================================
select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_espacios integer; v_rest integer; v_nombre text; v_rol text;
begin
  select count(*) filter (where kind = 'space'),
         count(*) filter (where kind = 'establishment')
  into v_espacios, v_rest
  from public.my_contexts();

  -- UNA fila de espacio, no dos: el espacio tiene dos miembros y la
  -- política de `space_memberships` deja ver a los dos.
  if v_espacios <> 1 then
    raise exception 'RN-GLO-03 FALLIDO: la dueña ve % filas de espacio y tiene uno', v_espacios
      using errcode = 'assert_failure';
  end if;

  -- Y NINGÚN panel de restaurante: es del equipo, no cliente. El
  -- restaurante ya lo ve dentro de su espacio; contarlo aquí otra vez lo
  -- convertiría en un contexto suyo que no es.
  if v_rest <> 0 then
    raise exception 'RN-GLO-03 FALLIDO: al equipo se le cuenta el restaurante como contexto propio'
      using errcode = 'assert_failure';
  end if;

  select space_name, role into v_nombre, v_rol from public.my_contexts() where kind = 'space';
  if v_nombre <> 'Global SL' or v_rol <> 'owner' then
    raise exception 'RN-GLO-03 FALLIDO: el espacio no viene con su nombre y su rol'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El cliente: su contexto es su restaurante, con el slug del espacio para
-- poder navegar. `spaces` le está tapada, así que el slug NO puede venir de
-- un join: si viniera, aquí saldría nulo y no podría entrar a lo suyo.
select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_kind text; v_slug text; v_nombre text; v_espacio text; v_n integer;
begin
  select count(*) into v_n from public.my_contexts();
  if v_n <> 1 then
    raise exception 'RN-GLO-03 FALLIDO: el cliente ve % contextos y tiene uno', v_n
      using errcode = 'assert_failure';
  end if;

  select kind, space_slug, establishment_name, space_name
  into v_kind, v_slug, v_nombre, v_espacio
  from public.my_contexts();

  if v_kind <> 'establishment' or v_nombre <> 'Bar Global' then
    raise exception 'RN-GLO-03 FALLIDO: el contexto del cliente no es su restaurante'
      using errcode = 'assert_failure';
  end if;
  if v_slug is null then
    raise exception 'RN-GLO-03 FALLIDO: el cliente se queda sin slug y no puede navegar a lo suyo'
      using errcode = 'assert_failure';
  end if;
  -- P7 · el nombre del espacio no se le da por esta vía.
  if v_espacio is not null then
    raise exception 'RN-GLO-03 FALLIDO: al cliente se le devuelve el nombre del espacio'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Quien no tiene nada, no ve nada. Es el caso de quien acaba de entrar por
-- una solicitud de acceso aprobada (RN-ACC-03), y tiene que poder pasar por
-- aquí sin error.
select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.my_contexts()) <> 0 then
    raise exception 'RN-GLO-03 FALLIDO: alguien sin contextos ve contextos ajenos'
      using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.my_client_attention()) <> 0 then
    raise exception 'RN-GLO-02 FALLIDO: alguien sin contextos ve atención ajena'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-GLO-02 · lo que espera al restaurante es suyo y de nadie más
-- ============================================================
--
-- Una solicitud del restaurante que vuelve a él esperando información.
select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_req uuid;
begin
  v_req := public.create_request_draft((select v from glo_ids where k = 'rest'), 'Cambiar el teléfono de la web', null, 'medium', 'Prueba de suite: la prioridad es obligatoria desde RN-REQ-05.');
  perform public.submit_request(v_req);
  insert into glo_ids values ('sol_trabajo', v_req);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  update public.requests set state = 'needs_information'
  where id = (select v from glo_ids where k = 'sol_trabajo');
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_kind text; v_rest text; v_due timestamptz;
begin
  select kind, establishment_name, due_at into v_kind, v_rest, v_due
  from public.my_client_attention()
  where entity_id = (select v from glo_ids where k = 'sol_trabajo');

  if v_kind <> 'request_needs_information' then
    raise exception 'RN-GLO-02 FALLIDO: una solicitud que espera al restaurante no aparece'
      using errcode = 'assert_failure';
  end if;
  if v_rest <> 'Bar Global' then
    raise exception 'RN-GLO-02 FALLIDO: la fila no dice de qué restaurante es'
      using errcode = 'assert_failure';
  end if;
  -- Una solicitud no tiene plazo escrito en ninguna parte: inventarle uno
  -- para poder ordenarla sería inventar un umbral (CLAUDE.md).
  if v_due is not null then
    raise exception 'RN-GLO-02 FALLIDO: a una solicitud se le ha inventado un vencimiento'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Y el equipo NO la ve por aquí: esta lista es la del restaurante. La suya
-- sale del Inicio de su espacio, con el reloj laborable.
select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.my_client_attention()) <> 0 then
    raise exception 'RN-GLO-02 FALLIDO: al equipo se le cuela la lista del restaurante'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-GLO-05 · la bandeja reúne, y no enseña de más
-- ============================================================
select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_conv uuid;
begin
  v_conv := public.get_or_create_establishment_conversation((select v from glo_ids where k = 'rest'));
  insert into glo_ids values ('conv', v_conv);
  perform public.post_message(v_conv, 'Hola, una duda del mes que viene', 'glo-1');
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_lado text; v_nombre text; v_sin integer;
begin
  select side, space_name, unread_count into v_lado, v_nombre, v_sin
  from public.list_my_conversations()
  where id = (select v from glo_ids where k = 'conv');

  if v_lado <> 'maintenance' then
    raise exception 'RN-GLO-05 FALLIDO: al equipo la conversación no le sale del lado de mantenimiento'
      using errcode = 'assert_failure';
  end if;
  if v_nombre <> 'Global SL' then
    raise exception 'RN-GLO-05 FALLIDO: al equipo no se le dice de qué espacio es'
      using errcode = 'assert_failure';
  end if;
  -- Lo escribió el cliente y el equipo no lo ha leído: va sin leer.
  if v_sin <> 1 then
    raise exception 'RN-GLO-05 FALLIDO: el contador de no leídos dice % y debería decir 1', v_sin
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_lado text; v_nombre text; v_sin integer;
begin
  select side, space_name, unread_count into v_lado, v_nombre, v_sin
  from public.list_my_conversations()
  where id = (select v from glo_ids where k = 'conv');

  if v_lado <> 'restaurant' then
    raise exception 'RN-GLO-05 FALLIDO: al cliente la conversación no le sale del lado del restaurante'
      using errcode = 'assert_failure';
  end if;
  -- P7 · el nombre del espacio no se le enseña tampoco aquí.
  if v_nombre is not null then
    raise exception 'RN-GLO-05 FALLIDO: al cliente se le devuelve el nombre del espacio'
      using errcode = 'assert_failure';
  end if;
  -- RN-MSG-06 · lo propio no cuenta nunca como sin leer.
  if v_sin <> 0 then
    raise exception 'RN-GLO-05 FALLIDO: al cliente su propio mensaje le cuenta como sin leer'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Y a alguien de fuera no le llega nada, que es lo que
-- `can_read_conversation()` ya garantizaba: esta función no abre ninguna
-- puerta nueva (RN-GLO-01).
select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.list_my_conversations()) <> 0 then
    raise exception 'RN-GLO-05 FALLIDO: la bandeja global enseña conversaciones ajenas'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-GLO-06 · Mi cuenta es de la persona
-- ============================================================
select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_full text; v_tz text;
begin
  perform public.set_my_profile('Dueña', 'Global Vela', '600999111', 'Atlantic/Canary');

  select full_name, display_timezone into v_full, v_tz
  from public.profiles where id = auth.uid();

  -- `full_name` se recompone: todo lo demás de la aplicación lo lee.
  if v_full <> 'Dueña Global Vela' then
    raise exception 'RN-GLO-06 FALLIDO: full_name no se recompuso (%)' , v_full
      using errcode = 'assert_failure';
  end if;
  if v_tz <> 'Atlantic/Canary' then
    raise exception 'RN-GLO-06 FALLIDO: no se guardó la zona horaria de lectura'
      using errcode = 'assert_failure';
  end if;

  -- Y la del ESPACIO no se ha movido: es la que manda en los plazos
  -- (CLAUDE.md MUST, RN-CLK). Esto es lo que separa las dos zonas.
  if (select timezone from public.spaces where id = (select v from glo_ids where k = 'espacio'))
     = 'Atlantic/Canary' then
    raise exception 'RN-GLO-06 FALLIDO: la zona de la cuenta ha cambiado la del espacio'
      using errcode = 'assert_failure';
  end if;

  -- Un nombre en blanco no se guarda: la ficha se quedaría sin con quién.
  begin
    perform public.set_my_profile('   ', 'Global');
    raise exception 'RN-GLO-06 FALLIDO: se guardó un perfil sin nombre' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-GLO%' then raise; end if;
  end;

  -- Una zona que PostgreSQL no conoce tampoco: con ella dentro, cualquier
  -- pantalla que formatee una fecha reventaría.
  begin
    perform public.set_my_profile('Dueña', 'Global', null, 'Marte/Olympus');
    raise exception 'RN-GLO-06 FALLIDO: se guardó una zona horaria inexistente'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-GLO%' then raise; end if;
  end;
end $$;
reset role;

-- Las preferencias de la persona, y quién manda sobre quién.
select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_in_app boolean; v_email boolean;
begin
  -- RN-NOT-03 · un aviso obligatorio no se apaga tampoco desde la cuenta.
  -- Si se pudiera, se apagaría en TODOS los espacios de una vez.
  begin
    perform public.set_my_notification_preference('support_session_started', false, false, false);
    raise exception 'RN-GLO-06 FALLIDO: se apagó un aviso obligatorio desde la cuenta'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-GLO%' then raise; end if;
  end;

  -- Uno que sí se puede apagar, para toda la cuenta.
  perform public.set_my_notification_preference('quote_sent', false, false, false);

  select in_app, email into v_in_app, v_email
  from public.my_notification_preferences() where event_type = 'quote_sent';
  if v_in_app is not false or v_email is not false then
    raise exception 'RN-GLO-06 FALLIDO: la preferencia de la persona no se guardó'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
declare v_in_app boolean;
begin
  -- Sin nada por espacio, manda la de la persona.
  select in_app into v_in_app
  from public.effective_notification_preference(
    'fff00000-0000-0000-0000-000000000001',
    (select v from glo_ids where k = 'espacio'),
    'quote_sent');
  if v_in_app is not false then
    raise exception 'RN-GLO-06 FALLIDO: la preferencia de la persona no llega al dictamen'
      using errcode = 'assert_failure';
  end if;

  -- Y con algo por espacio, manda el espacio: es la decisión más
  -- específica y no se pisa.
  insert into public.notification_preferences (space_id, profile_id, event_type, in_app, email, push)
  values ((select v from glo_ids where k = 'espacio'),
          'fff00000-0000-0000-0000-000000000001', 'quote_sent', true, true, true);

  select in_app into v_in_app
  from public.effective_notification_preference(
    'fff00000-0000-0000-0000-000000000001',
    (select v from glo_ids where k = 'espacio'),
    'quote_sent');
  if v_in_app is not true then
    raise exception 'RN-GLO-06 FALLIDO: la preferencia del espacio no manda sobre la de la persona'
      using errcode = 'assert_failure';
  end if;

  -- Un evento que nadie ha tocado sigue encendido.
  select in_app into v_in_app
  from public.effective_notification_preference(
    'fff00000-0000-0000-0000-000000000001',
    (select v from glo_ids where k = 'espacio'),
    'job_assigned');
  if v_in_app is not true then
    raise exception 'RN-GLO-06 FALLIDO: un evento sin preferencia no está encendido'
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y nadie lee las preferencias de nadie: la tabla es de identidad.
select set_config('request.jwt.claim.sub', 'fff00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.profile_notification_preferences) then
    raise exception 'RN-GLO-06 FALLIDO: se leen las preferencias de otra persona'
      using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.my_notification_preferences()) <> 0 then
    raise exception 'RN-GLO-06 FALLIDO: my_notification_preferences() devuelve las de otro'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select 'el_contexto_global: OK' as resultado;
