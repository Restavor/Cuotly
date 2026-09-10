-- El alta de un restaurante (maqueta 02, RN-EST-06) contra la base de
-- datos real: quién puede darlo de alta, qué rastro deja, qué pasa al
-- pulsar dos veces y por dónde NO se puede crear uno.
--
-- Lo que se comprueba, y por qué cada cosa:
--
--   · **La transacción.** El alta crea el grupo y el establecimiento a la
--     vez. Antes eran dos `insert` sueltos por PostgREST desde el
--     navegador: si el segundo fallaba, quedaba un grupo vacío que nadie
--     había pedido.
--   · **La idempotencia (CLAUDE.md MUST).** Dos llamadas con la misma
--     clave devuelven el MISMO restaurante y no crean ni un grupo de más.
--     Sin ella, un doble clic dejaba "Casa Sol" y "Casa Sol" con dos
--     códigos, dos fichas y dos conversaciones.
--   · **La auditoría.** `establishment.created`, `group.created` cuando el
--     grupo es nuevo, y `establishment.data_changed` con la ficha. Son
--     hechos distintos y por eso son apuntes distintos.
--   · **La barrera.** `establishments` se quedó sin política de INSERT en
--     la migración 58: crear un restaurante con la clave pública y un
--     `curl`, sin actor y sin apunte, ya no es posible.
--   · **RN-EST-06 por los tres lados**: propietario y administrador sí;
--     trabajadora no; cliente no.
--   · **El grupo.** Por id, y entonces tiene que ser de este espacio; o
--     por nombre, y entonces "Grupo La Encina" y "grupo la encina" son el
--     mismo cliente — crear el segundo partiría su facturación en dos.
--   · **El estado.** Un restaurante nace 'configuring' y eso no es un
--     parámetro: el alta no puede colocar uno directamente en 'active'
--     saltándose `set_establishment_status()` y su apunte.
--   · **La normalización de Instagram (migración 59).** Los tres casos que
--     la 58 guardaba mal: sin esquema, con `www.` y con parámetros
--     pegados. Escribir el perfil sin "https://" es lo normal, así que no
--     era un caso raro: era el caso.
--   · **CLAUDE.md · privilegios**: la función nueva cerrada a `anon`,
--     abierta a `authenticated`.
--
-- Mismo patrón que las demás suites: bloques `do $$ ... end $$` que lanzan
-- una excepción real si algo no es lo esperado, cambio de identidad con
-- `set role authenticated`, y limpieza propia al final.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/alta_del_restaurante.sql

-- ============================================================
-- Fixture: un espacio con propietario, administrador y trabajadora; un
-- grupo que ya existe (para comprobar que se reutiliza); un cliente; y un
-- SEGUNDO espacio con su propio grupo, que existe solo para comprobar que
-- un grupo no viaja de un espacio a otro.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('ab000000-0000-0000-0000-000000000001', 'alta-owner@example.com', 'authenticated', 'authenticated'),
  ('ab000000-0000-0000-0000-000000000002', 'alta-admin@example.com', 'authenticated', 'authenticated'),
  ('ab000000-0000-0000-0000-000000000003', 'alta-worker@example.com', 'authenticated', 'authenticated'),
  ('ab000000-0000-0000-0000-000000000004', 'alta-cliente@example.com', 'authenticated', 'authenticated'),
  ('ab000000-0000-0000-0000-000000000005', 'alta-otro-owner@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('ab100000-0000-0000-0000-000000000001', 'Espacio Alta', 'espacio-alta-test', 'ab000000-0000-0000-0000-000000000001'),
  ('ab100000-0000-0000-0000-000000000002', 'Espacio Vecino', 'espacio-vecino-test', 'ab000000-0000-0000-0000-000000000005');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('ab100000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('ab100000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('ab100000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('ab100000-0000-0000-0000-000000000002', 'ab000000-0000-0000-0000-000000000005', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('ab300000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001', 'Grupo La Encina'),
  ('ab300000-0000-0000-0000-000000000002', 'ab100000-0000-0000-0000-000000000002', 'Grupo Del Vecino');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('ab200000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001', 'Impulso Alta', 39900, 8, 6, 1, 0, 24);

-- El cliente necesita una fila de la que colgar: se le da un restaurante
-- ya existente en el espacio.
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('ab400000-0000-0000-0000-000000000009', 'ab100000-0000-0000-0000-000000000001', 'ab300000-0000-0000-0000-000000000001', 'EST-ALTA-Z', 'Restaurante Previo', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('ab500000-0000-0000-0000-000000000001', 'ab400000-0000-0000-0000-000000000009', 'ab000000-0000-0000-0000-000000000004', 'local_owner');

-- ============================================================
-- La barrera, antes de nada: `establishments` no tiene política de INSERT
-- ni de UPDATE. Se crea y se edita por función, o no se hace.
-- ============================================================
do $$
declare
  v_politicas integer;
begin
  select count(*) into v_politicas
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  where c.relname = 'establishments'
    and p.polcmd in ('a', 'w');  -- 'a' = INSERT, 'w' = UPDATE

  if v_politicas <> 0 then
    raise exception 'MIGRACION 58 FALLIDA: establishments tiene % politicas de escritura; un restaurante se crea por funcion, no por PostgREST', v_politicas
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-EST-06 · el propietario da de alta un restaurante entero.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_id uuid;
  v_repetida uuid;
  v_fila public.establishments;
  v_grupos integer;
  v_apuntes integer;
  v_planes integer;
begin
  v_id := public.create_establishment_with_data(
    p_space_id := 'ab100000-0000-0000-0000-000000000001',
    p_name := '  Casa Sol  ',
    -- En minusculas y con espacios: tiene que reutilizar "Grupo La Encina".
    p_group_name := '  grupo la encina  ',
    p_plan_id := 'ab200000-0000-0000-0000-000000000001',
    p_legal_name := 'Casa Sol, S.L.',
    p_tax_id := ' b1234 5678 ',
    p_address := 'Calle Mayor, 123',
    p_postal_code := '28001',
    p_city := 'Madrid',
    p_contact_name := '  Ana Torres  ',
    p_contact_email := ' ANA.TORRES@casasol.com ',
    p_phone_primary := '600 123 456',
    p_website_url := 'www.casasol.es',
    p_instagram := 'instagram.com/casasol',
    p_facebook_url := 'www.facebook.com/casasol',
    p_idempotency_key := 'alta-de-prueba-1'
  );

  if v_id is null then
    raise exception 'RN-EST-06 FALLIDO: el alta no ha devuelto ningun id'
      using errcode = 'assert_failure';
  end if;

  select * into v_fila from public.establishments where id = v_id;

  -- El codigo lo pone el disparador de la migracion 3, no quien da de alta.
  if v_fila.code is null or v_fila.code = '' then
    raise exception 'RN-EST-06 FALLIDO: el restaurante se ha creado sin codigo'
      using errcode = 'assert_failure';
  end if;

  -- El nombre llega con espacios y se guarda sin ellos.
  if v_fila.name <> 'Casa Sol' then
    raise exception 'FALLIDO: el nombre comercial se ha guardado como "%"', v_fila.name
      using errcode = 'assert_failure';
  end if;

  -- Un restaurante nace en configuracion. Que el alta pudiera colocarlo en
  -- 'active' seria saltarse set_establishment_status() y su apunte.
  if v_fila.status <> 'configuring' then
    raise exception 'FALLIDO: el restaurante ha nacido en estado "%" y no en configuring', v_fila.status
      using errcode = 'assert_failure';
  end if;

  -- El grupo se ha reutilizado, no duplicado.
  if v_fila.group_id <> 'ab300000-0000-0000-0000-000000000001' then
    raise exception 'FALLIDO: se ha creado un grupo nuevo en vez de reutilizar Grupo La Encina'
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_grupos from public.groups
  where space_id = 'ab100000-0000-0000-0000-000000000001';
  if v_grupos <> 1 then
    raise exception 'FALLIDO: el espacio tiene % grupos; "grupo la encina" y "Grupo La Encina" son el mismo cliente', v_grupos
      using errcode = 'assert_failure';
  end if;

  -- La ficha, normalizada por set_establishment_data().
  if v_fila.tax_id <> 'B12345678' then
    raise exception 'FALLIDO: el CIF se ha guardado como "%"', v_fila.tax_id
      using errcode = 'assert_failure';
  end if;
  if v_fila.contact_email <> 'ana.torres@casasol.com' then
    raise exception 'FALLIDO: el correo se ha guardado como "%"', v_fila.contact_email
      using errcode = 'assert_failure';
  end if;
  if v_fila.contact_name <> 'Ana Torres' then
    raise exception 'FALLIDO: la persona de contacto se ha guardado como "%"', v_fila.contact_name
      using errcode = 'assert_failure';
  end if;
  if v_fila.website_url <> 'https://www.casasol.es' then
    raise exception 'FALLIDO: el sitio web se ha guardado como "%"', v_fila.website_url
      using errcode = 'assert_failure';
  end if;
  if v_fila.facebook_url <> 'https://www.facebook.com/casasol' then
    raise exception 'FALLIDO: Facebook se ha guardado como "%"', v_fila.facebook_url
      using errcode = 'assert_failure';
  end if;
  -- MIGRACION 59: sin esquema, la 58 guardaba aqui "@instagram.com".
  if v_fila.instagram <> '@casasol' then
    raise exception 'MIGRACION 59 FALLIDA: Instagram se ha guardado como "%" en vez de @casasol', v_fila.instagram
      using errcode = 'assert_failure';
  end if;

  -- El plan.
  select count(*) into v_planes from public.subscriptions
  where establishment_id = v_id and kind = 'plan' and status = 'active';
  if v_planes <> 1 then
    raise exception 'RN-COM-13 FALLIDO: el restaurante tiene % planes activos', v_planes
      using errcode = 'assert_failure';
  end if;

  -- La auditoria: el alta y la ficha son dos hechos distintos.
  select count(*) into v_apuntes from public.audit_log
  where action = 'establishment.created' and entity_id = v_id;
  if v_apuntes <> 1 then
    raise exception 'CLAUDE.md FALLIDO: el alta ha dejado % apuntes establishment.created', v_apuntes
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_apuntes from public.audit_log
  where action = 'establishment.data_changed' and entity_id = v_id;
  if v_apuntes <> 1 then
    raise exception 'FALLIDO: la ficha del alta ha dejado % apuntes establishment.data_changed', v_apuntes
      using errcode = 'assert_failure';
  end if;

  -- El grupo ya existia, asi que NO se ha escrito group.created.
  select count(*) into v_apuntes from public.audit_log where action = 'group.created';
  if v_apuntes <> 0 then
    raise exception 'FALLIDO: se ha auditado la creacion de un grupo que ya existia'
      using errcode = 'assert_failure';
  end if;

  -- ------------------------------------------------------------
  -- CLAUDE.md MUST · pulsar dos veces no duplica el efecto.
  -- ------------------------------------------------------------
  v_repetida := public.create_establishment_with_data(
    p_space_id := 'ab100000-0000-0000-0000-000000000001',
    p_name := 'Casa Sol',
    p_group_name := 'grupo la encina',
    p_idempotency_key := 'alta-de-prueba-1'
  );

  if v_repetida <> v_id then
    raise exception 'IDEMPOTENCIA FALLIDA: el segundo clic ha creado un restaurante distinto (% frente a %)', v_repetida, v_id
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_apuntes from public.audit_log
  where action = 'establishment.created' and entity_id = v_id;
  if v_apuntes <> 1 then
    raise exception 'IDEMPOTENCIA FALLIDA: el segundo clic ha escrito otro apunte (% en total)', v_apuntes
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- El grupo nuevo: se crea y se audita.
-- ============================================================
do $$
declare
  v_id uuid;
  v_grupo uuid;
  v_apuntes integer;
begin
  v_id := public.create_establishment_with_data(
    p_space_id := 'ab100000-0000-0000-0000-000000000001',
    p_name := 'Bar Nuevo',
    p_group_name := 'Grupo Recien Llegado',
    p_idempotency_key := 'alta-de-prueba-2'
  );

  select group_id into v_grupo from public.establishments where id = v_id;

  select count(*) into v_apuntes from public.audit_log
  where action = 'group.created' and entity_id = v_grupo;
  if v_apuntes <> 1 then
    raise exception 'FALLIDO: crear un grupo nuevo ha dejado % apuntes group.created', v_apuntes
      using errcode = 'assert_failure';
  end if;

  -- Sin ficha: no hay nada que cambiar, asi que no hay apunte de datos.
  select count(*) into v_apuntes from public.audit_log
  where action = 'establishment.data_changed' and entity_id = v_id;
  if v_apuntes <> 0 then
    raise exception 'CA-17 FALLIDO: un alta sin ficha ha escrito % apuntes de datos', v_apuntes
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- El grupo por id, y de este espacio.
-- ============================================================
do $$
declare
  v_error text := '';
begin
  begin
    perform public.create_establishment_with_data(
      p_space_id := 'ab100000-0000-0000-0000-000000000001',
      p_name := 'Con grupo del vecino',
      -- El grupo existe, pero es del OTRO espacio.
      p_group_id := 'ab300000-0000-0000-0000-000000000002'
    );
    v_error := v_error || ' / un grupo de otro espacio se ha aceptado';
  exception when others then
    null;
  end;

  begin
    perform public.create_establishment_with_data(
      p_space_id := 'ab100000-0000-0000-0000-000000000001',
      p_name := 'Sin grupo ninguno'
    );
    v_error := v_error || ' / un alta sin grupo se ha aceptado';
  exception when others then
    null;
  end;

  begin
    perform public.create_establishment_with_data(
      p_space_id := 'ab100000-0000-0000-0000-000000000001',
      p_name := '   ',
      p_group_name := 'Grupo La Encina'
    );
    v_error := v_error || ' / un nombre comercial vacio se ha aceptado';
  exception when others then
    null;
  end;

  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-EST-06 · el administrador sí.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  if public.create_establishment_with_data(
    p_space_id := 'ab100000-0000-0000-0000-000000000001',
    p_name := 'Alta del administrador',
    p_group_id := 'ab300000-0000-0000-0000-000000000001'
  ) is null then
    raise exception 'RN-EST-06 FALLIDO: el administrador no ha podido dar de alta'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- La trabajadora no. Tiene `manage_files` y `perform_jobs`, no la cartera
-- de clientes.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform public.create_establishment_with_data(
      p_space_id := 'ab100000-0000-0000-0000-000000000001',
      p_name := 'Alta de la trabajadora',
      p_group_id := 'ab300000-0000-0000-0000-000000000001'
    );
    raise exception 'RN-EST-06 FALLIDO: la trabajadora ha podido dar de alta un restaurante'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- El cliente tampoco. Es propietario local de un restaurante del espacio,
-- que es justo lo que separa "pertenece" de "puede".
-- ============================================================
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
begin
  begin
    perform public.create_establishment_with_data(
      p_space_id := 'ab100000-0000-0000-0000-000000000001',
      p_name := 'Alta del cliente',
      p_group_id := 'ab300000-0000-0000-0000-000000000001'
    );
    raise exception 'RN-EST-06 FALLIDO: un cliente ha podido dar de alta un restaurante'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- MIGRACION 59 · los tres casos de Instagram que la 58 guardaba mal.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_id uuid;
  v_guardado text;
  v_caso record;
begin
  v_id := public.create_establishment_with_data(
    p_space_id := 'ab100000-0000-0000-0000-000000000001',
    p_name := 'Pruebas de Instagram',
    p_group_id := 'ab300000-0000-0000-0000-000000000001',
    p_idempotency_key := 'alta-de-prueba-instagram'
  );

  for v_caso in
    select * from (values
      ('instagram.com/magarinos',                  '@magarinos'),
      ('www.instagram.com/magarinos',              '@magarinos'),
      ('https://www.instagram.com/magarinos?hl=es', '@magarinos'),
      ('https://instagram.com/magarinos/',         '@magarinos'),
      ('@magarinos',                               '@magarinos'),
      ('magarinos',                                '@magarinos'),
      ('@@magarinos',                              '@magarinos')
    ) as casos(entrada, esperado)
  loop
    -- Se pasa por un valor distinto entre caso y caso: si no, el segundo
    -- guardado de "@magarinos" no cambiaria nada y no probaria nada.
    perform public.set_establishment_data(
      p_establishment_id := v_id,
      p_name := 'Pruebas de Instagram',
      p_instagram := 'otro-perfil-cualquiera'
    );

    perform public.set_establishment_data(
      p_establishment_id := v_id,
      p_name := 'Pruebas de Instagram',
      p_instagram := v_caso.entrada
    );

    select instagram into v_guardado from public.establishments where id = v_id;

    if v_guardado is distinct from v_caso.esperado then
      raise exception 'MIGRACION 59 FALLIDA: "%" se ha guardado como "%" en vez de "%"',
        v_caso.entrada, v_guardado, v_caso.esperado
        using errcode = 'assert_failure';
    end if;
  end loop;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md · privilegios de la funcion nueva.
-- ============================================================
do $$
declare
  v_firma text := 'public.create_establishment_with_data(uuid, text, uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text)';
begin
  if has_function_privilege('anon', v_firma, 'execute') then
    raise exception 'CLAUDE.md FALLIDO: create_establishment_with_data() esta abierta a anon'
      using errcode = 'assert_failure';
  end if;

  if not has_function_privilege('authenticated', v_firma, 'execute') then
    raise exception 'FALLIDO: create_establishment_with_data() no la puede ejecutar authenticated; ninguna pantalla podria dar de alta'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log
where space_id in ('ab100000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000002');
delete from public.spaces
where id in ('ab100000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000002');
delete from auth.users where id::text like 'ab000000-%';

select 'alta_del_restaurante.sql: todas las comprobaciones han pasado' as resultado;
