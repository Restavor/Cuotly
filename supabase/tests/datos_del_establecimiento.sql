-- Los datos del establecimiento (§15.2) contra la base de datos real:
-- quién puede editarlos (RN-EST-11), qué rastro dejan y por dónde NO se
-- pueden tocar.
--
-- Lo que se comprueba, y por qué cada cosa:
--
--   · **RN-EST-11 por los seis lados.** El propietario del espacio sí; el
--     propietario global del grupo sí; el propietario local sí; el editor
--     CON `edit_establishment_data` sí; el editor SIN el permiso no; el
--     rol Consulta no. Y un trabajador del espacio tampoco: tiene
--     `manage_files` y `perform_jobs`, no la cartera de clientes.
--   · **Un cliente de OTRO restaurante no.** Es la comprobación que
--     separa "tiene permiso" de "tiene permiso aquí".
--   · **La barrera de la migración 57.** `establishments` ya no tiene
--     política de UPDATE, y además el disparador rechaza el UPDATE directo
--     aunque alguien vuelva a crearla. Sin esto, un administrador
--     reescribía el CIF de un cliente por PostgREST sin dejar rastro —el
--     mismo agujero que el bloqueante B2 de la migración 37 encontró con
--     `status`—.
--   · **Que `set_establishment_status()` sigue funcionando.** El
--     disparador nuevo mira trece columnas y podría haber roto el cambio
--     de estado, que escribe otra. Una barrera que rompe la puerta de al
--     lado no es una barrera.
--   · **La auditoría dice qué cambió y solo qué cambió.** Un apunte con
--     los trece campos en cada guardado esconde el único dato que importa.
--   · **CA-17 · guardar dos veces lo mismo no duplica nada**: ni fila de
--     auditoría ni efecto.
--   · **La normalización**: el CIF en mayúsculas y sin espacios, el correo
--     en minúsculas, el sitio web con esquema (un enlace sin `https://` lo
--     resuelve el navegador como ruta relativa), el dominio sin esquema, y
--     un campo vacío guardado como nulo.
--   · **Las dos validaciones**: nombre comercial vacío y correo sin arroba.
--   · **CLAUDE.md · privilegios de las funciones nuevas**: cerradas a
--     `anon`, abiertas a `authenticated`.
--
-- Mismo patrón que las demás suites: bloques `do $$ ... end $$` que lanzan
-- una excepción real si algo no es lo esperado, cambio de identidad con
-- `set role authenticated`, y limpieza propia al final.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/datos_del_establecimiento.sql

-- ============================================================
-- Fixture: un espacio con propietario, administrador y trabajadora; un
-- grupo con DOS restaurantes —el segundo existe solo para comprobar que un
-- permiso no viaja de uno a otro— y las cuatro identidades de cliente que
-- RN-EST-11 distingue.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('da000000-0000-0000-0000-000000000001', 'dat-owner@example.com', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000002', 'dat-admin@example.com', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000003', 'dat-worker@example.com', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000004', 'dat-global@example.com', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000005', 'dat-local@example.com', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000006', 'dat-editor-si@example.com', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000007', 'dat-editor-no@example.com', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000008', 'dat-consulta@example.com', 'authenticated', 'authenticated'),
  ('da000000-0000-0000-0000-000000000009', 'dat-ajeno@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('da100000-0000-0000-0000-000000000001', 'Espacio Datos', 'espacio-datos-test', 'da000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('da100000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('da100000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('da100000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000003', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('da300000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001', 'Grupo Datos');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('da400000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001', 'da300000-0000-0000-0000-000000000001', 'EST-DAT-A', 'Restaurante Datos', 'active'),
  ('da400000-0000-0000-0000-000000000002', 'da100000-0000-0000-0000-000000000001', 'da300000-0000-0000-0000-000000000001', 'EST-DAT-B', 'Restaurante Vecino', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('da500000-0000-0000-0000-000000000001', 'da400000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000005', 'local_owner'),
  ('da500000-0000-0000-0000-000000000002', 'da400000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000006', 'editor'),
  ('da500000-0000-0000-0000-000000000003', 'da400000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000007', 'editor'),
  ('da500000-0000-0000-0000-000000000004', 'da400000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000008', 'consulta'),
  -- El ajeno es propietario local del restaurante de al lado: tiene el
  -- permiso, pero no aquí.
  ('da500000-0000-0000-0000-000000000005', 'da400000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000009', 'local_owner');

-- RN-EST-11 · el permiso fino: uno de los dos editores lo tiene.
insert into public.establishment_permissions (establishment_membership_id, edit_establishment_data, view_billing) values
  ('da500000-0000-0000-0000-000000000002', true, false),
  ('da500000-0000-0000-0000-000000000003', false, false);

insert into public.group_memberships (group_id, user_id, role) values
  ('da300000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000004', 'global_owner');

-- ============================================================
-- La barrera, antes de nada: `establishments` no tiene política de UPDATE.
-- ============================================================
do $$
declare
  v_politicas integer;
begin
  select count(*) into v_politicas
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  where c.relname = 'establishments'
    and p.polcmd = 'w';  -- 'w' = UPDATE

  if v_politicas <> 0 then
    raise exception 'MIGRACION 57 FALLIDA: establishments tiene % politicas de UPDATE; la ficha se edita por funcion, no por PostgREST', v_politicas
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-EST-11 · el equipo: propietario y administrador sí, trabajadora no.
-- ============================================================
select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_cambio boolean;
  v_nombre text;
  v_cif text;
  v_web text;
  v_dominio text;
  v_correo text;
begin
  v_cambio := public.set_establishment_data(
    'da400000-0000-0000-0000-000000000001',
    'Magarinos',                       -- nombre comercial
    'Restauracion Magarinos, S.L.',    -- razon social
    ' b12345678 ',                     -- identificacion fiscal, sin normalizar
    'Calle Velazquez, 18',
    '28001',
    'Madrid',
    'INFO@Magarinos.ES',               -- correo en mayusculas
    '910 123 456',
    '620 987 654',
    'www.magarinos.es',                -- sitio web sin esquema
    'https://magarinos.es/carta',      -- dominio pegado como URL entera
    E'Lunes a Domingo\n13:00 - 16:00\n20:00 - 23:30',
    'landing_site'
  );

  if not v_cambio then
    raise exception 'RN-EST-11 FALLIDO: el propietario del espacio no ha podido rellenar la ficha'
      using errcode = 'assert_failure';
  end if;

  select name, tax_id, website_url, domain, contact_email
  into v_nombre, v_cif, v_web, v_dominio, v_correo
  from public.establishments where id = 'da400000-0000-0000-0000-000000000001';

  if v_nombre <> 'Magarinos' then
    raise exception 'FALLIDO: el nombre comercial es "%"', v_nombre using errcode = 'assert_failure';
  end if;

  -- El CIF se guarda en mayusculas y sin espacios: el mismo numero escrito
  -- de tres formas no puede ser tres datos distintos.
  if v_cif <> 'B12345678' then
    raise exception 'FALLIDO: el CIF se ha guardado como "%" en vez de B12345678', v_cif
      using errcode = 'assert_failure';
  end if;

  -- Sin esquema, el navegador resuelve el enlace de la ficha como una ruta
  -- relativa y lleva a ninguna parte.
  if v_web <> 'https://www.magarinos.es' then
    raise exception 'FALLIDO: el sitio web se ha guardado como "%"', v_web
      using errcode = 'assert_failure';
  end if;

  if v_dominio <> 'magarinos.es' then
    raise exception 'FALLIDO: el dominio se ha guardado como "%" en vez de magarinos.es', v_dominio
      using errcode = 'assert_failure';
  end if;

  if v_correo <> 'info@magarinos.es' then
    raise exception 'FALLIDO: el correo se ha guardado como "%"', v_correo
      using errcode = 'assert_failure';
  end if;
end $$;

-- CA-17 · guardar exactamente lo mismo no cambia nada y no escribe apunte.
do $$
declare
  v_cambio boolean;
  v_apuntes integer;
begin
  select count(*) into v_apuntes from public.audit_log
  where action = 'establishment.data_changed'
    and entity_id = 'da400000-0000-0000-0000-000000000001';

  if v_apuntes <> 1 then
    raise exception 'FALLIDO: el primer guardado ha dejado % apuntes de auditoria, esperaba 1', v_apuntes
      using errcode = 'assert_failure';
  end if;

  v_cambio := public.set_establishment_data(
    'da400000-0000-0000-0000-000000000001',
    'Magarinos', 'Restauracion Magarinos, S.L.', 'B12345678',
    'Calle Velazquez, 18', '28001', 'Madrid', 'info@magarinos.es',
    '910 123 456', '620 987 654', 'https://www.magarinos.es', 'magarinos.es',
    E'Lunes a Domingo\n13:00 - 16:00\n20:00 - 23:30', 'landing_site'
  );

  if v_cambio then
    raise exception 'CA-17 FALLIDO: guardar lo mismo se ha contado como un cambio'
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_apuntes from public.audit_log
  where action = 'establishment.data_changed'
    and entity_id = 'da400000-0000-0000-0000-000000000001';

  if v_apuntes <> 1 then
    raise exception 'CA-17 FALLIDO: guardar lo mismo ha escrito un segundo apunte (% en total)', v_apuntes
      using errcode = 'assert_failure';
  end if;
end $$;

-- La auditoria dice QUE cambio, y solo eso.
do $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_cambio boolean;
begin
  v_cambio := public.set_establishment_data(
    'da400000-0000-0000-0000-000000000001',
    'Magarinos', 'Restauracion Magarinos, S.L.', 'B12345678',
    'Calle Velazquez, 18', '28001', 'Madrid', 'info@magarinos.es',
    '910 999 999',                     -- lo unico que cambia
    '620 987 654', 'https://www.magarinos.es', 'magarinos.es',
    E'Lunes a Domingo\n13:00 - 16:00\n20:00 - 23:30', 'landing_site'
  );

  if not v_cambio then
    raise exception 'FALLIDO: cambiar el telefono no se ha contado como un cambio'
      using errcode = 'assert_failure';
  end if;

  select old_value, new_value into v_antes, v_despues
  from public.audit_log
  where action = 'establishment.data_changed'
    and entity_id = 'da400000-0000-0000-0000-000000000001'
  order by created_at desc, id
  limit 1;

  if v_despues <> jsonb_build_object('phone_primary', '910 999 999') then
    raise exception 'FALLIDO: el apunte de auditoria dice % en vez de solo el telefono nuevo', v_despues
      using errcode = 'assert_failure';
  end if;

  if v_antes <> jsonb_build_object('phone_primary', '910 123 456') then
    raise exception 'CLAUDE.md FALLIDO: el apunte no lleva el valor anterior correcto: %', v_antes
      using errcode = 'assert_failure';
  end if;
end $$;

-- Un campo que llega vacio se guarda como nulo, no como cadena vacia:
-- "sin rellenar" tiene que ser UN valor para que la pantalla pueda decir
-- el motivo en vez de enseñar un hueco.
do $$
declare
  v_segundo text;
begin
  perform public.set_establishment_data(
    'da400000-0000-0000-0000-000000000001',
    'Magarinos', 'Restauracion Magarinos, S.L.', 'B12345678',
    'Calle Velazquez, 18', '28001', 'Madrid', 'info@magarinos.es',
    '910 999 999',
    '   ',                             -- el telefono secundario se borra
    'https://www.magarinos.es', 'magarinos.es',
    E'Lunes a Domingo\n13:00 - 16:00\n20:00 - 23:30', 'landing_site'
  );

  select phone_secondary into v_segundo
  from public.establishments where id = 'da400000-0000-0000-0000-000000000001';

  if v_segundo is not null then
    raise exception 'FALLIDO: un campo vacio se ha guardado como "%" en vez de nulo', v_segundo
      using errcode = 'assert_failure';
  end if;
end $$;

-- Las dos validaciones.
do $$
declare
  v_error text := '';
begin
  begin
    perform public.set_establishment_data('da400000-0000-0000-0000-000000000001', '   ');
    v_error := 'un nombre comercial vacio se ha aceptado';
  exception when others then
    null;
  end;

  begin
    perform public.set_establishment_data(
      'da400000-0000-0000-0000-000000000001', 'Magarinos', null, null, null, null, null,
      'esto-no-es-un-correo'
    );
    v_error := v_error || ' / un correo sin arroba se ha aceptado';
  exception when others then
    null;
  end;

  begin
    perform public.set_establishment_data(
      'da400000-0000-0000-0000-000000000001', 'Magarinos', null, null, null, null, null,
      null, null, null, null, null, null, 'wordpress'
    );
    v_error := v_error || ' / una plataforma web inventada se ha aceptado';
  exception when others then
    null;
  end;

  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;
end $$;

-- La barrera, primera mitad: el propietario del espacio TAMPOCO puede
-- escribir la ficha por UPDATE directo. Es lo que sostiene la auditoria.
do $$
begin
  begin
    update public.establishments set tax_id = 'X0000000X'
    where id = 'da400000-0000-0000-0000-000000000001';
    raise exception 'CLAUDE.md FALLIDO: la ficha se ha reescrito por UPDATE directo, sin actor ni valor anterior'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;  -- lo esperado: sin politica de UPDATE, RLS lo niega
  end;
end $$;

-- Y la puerta de al lado sigue abierta: el disparador nuevo no puede haber
-- roto el cambio de estado, que escribe otra columna.
do $$
declare
  v_estado text;
begin
  perform public.set_establishment_status('da400000-0000-0000-0000-000000000001', 'read_only', 'Prueba del disparador');

  select status into v_estado from public.establishments
  where id = 'da400000-0000-0000-0000-000000000001';

  if v_estado <> 'read_only' then
    raise exception 'FALLIDO: el disparador de la ficha ha roto set_establishment_status() (estado: %)', v_estado
      using errcode = 'assert_failure';
  end if;

  perform public.set_establishment_status('da400000-0000-0000-0000-000000000001', 'active', 'Prueba del disparador');
end $$;

reset role;

-- La barrera, segunda mitad, y es la que importa: **el disparador**. Lo de
-- arriba lo negaba RLS por no haber politica de UPDATE, asi que ese bloque
-- pasaria igual sin disparador alguno y no prueba nada de la migracion 57.
-- Aqui se escribe sin RLS —como el dueño de la tabla, que es por donde
-- entra cualquier funcion `security definer` futura— y el que tiene que
-- decir no es el disparador, por su nombre.
do $$
declare
  v_mensaje text;
begin
  begin
    update public.establishments set tax_id = 'X0000000X'
    where id = 'da400000-0000-0000-0000-000000000001';
    raise exception 'MIGRACION 57 FALLIDA: sin RLS por delante, la ficha se reescribe por UPDATE directo: el disparador no es una barrera'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then v_mensaje := sqlerrm;
  end;

  -- Y que haya hablado EL disparador, no otra cosa: un fallo por otro
  -- motivo (una restriccion, un privilegio) dejaria este test verde con la
  -- barrera desmontada.
  if v_mensaje not like '%set_establishment_data()%' then
    raise exception 'MIGRACION 57 FALLIDA: el UPDATE directo ha fallado por otro motivo ("%"), no por el disparador', v_mensaje
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y un UPDATE que no toca la ficha pasa: el disparador mira trece columnas
-- y no puede convertirse en un "esta tabla no se escribe nunca".
do $$
begin
  update public.establishments set created_at = created_at
  where id = 'da400000-0000-0000-0000-000000000001';
end $$;

-- El administrador sí (RN-EST-11: `manage_clients`).
select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  if not public.set_establishment_data(
    'da400000-0000-0000-0000-000000000001', 'Magarinos', 'Restauracion Magarinos, S.L.',
    'B12345678', 'Calle Velazquez, 20'
  ) then
    raise exception 'RN-EST-11 FALLIDO: el administrador no ha podido editar la ficha'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- La trabajadora no. Tiene `manage_files` y `perform_jobs`, no la cartera
-- de clientes: puede marcar un pago (RN-FIN-05) y subir archivos, no
-- reescribir la razon social de un cliente.
select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform public.set_establishment_data('da400000-0000-0000-0000-000000000001', 'Renombrado por la trabajadora');
    raise exception 'RN-EST-11 FALLIDO: una trabajadora del espacio ha editado la ficha fiscal de un cliente'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- RN-EST-11 · el lado cliente, uno por uno.
-- ============================================================

-- Propietario global del grupo: sí, por serlo (RN-EST-03).
select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  if not public.client_can_edit_establishment_data('da400000-0000-0000-0000-000000000001') then
    raise exception 'RN-EST-11 FALLIDO: el propietario global del grupo no puede editar datos'
      using errcode = 'assert_failure';
  end if;

  if not public.set_establishment_data(
    'da400000-0000-0000-0000-000000000001', 'Magarinos', 'Restauracion Magarinos, S.L.',
    'B12345678', 'Calle Velazquez, 18', '28001', 'Madrid', 'reservas@magarinos.es'
  ) then
    raise exception 'RN-EST-11 FALLIDO: el propietario global no ha podido guardar'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Propietario local: sí.
select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  if not public.set_establishment_data(
    'da400000-0000-0000-0000-000000000001', 'Magarinos', 'Restauracion Magarinos, S.L.',
    'B12345678', 'Calle Velazquez, 18', '28001', 'Madrid', 'hola@magarinos.es'
  ) then
    raise exception 'RN-EST-11 FALLIDO: el propietario local no ha podido editar su ficha'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Editor CON el permiso: sí. Es la primera vez en el proyecto que
-- `establishment_permissions.edit_establishment_data` decide algo.
select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
begin
  if not public.set_establishment_data(
    'da400000-0000-0000-0000-000000000001', 'Magarinos', 'Restauracion Magarinos, S.L.',
    'B12345678', 'Calle Velazquez, 18', '28001', 'Madrid', 'editor@magarinos.es'
  ) then
    raise exception 'RN-EST-11 FALLIDO: el editor CON edit_establishment_data no ha podido editar'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Editor SIN el permiso: no. Si esto pasara, el permiso seria decorativo.
select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000007', false);
set role authenticated;
do $$
begin
  if public.client_can_edit_establishment_data('da400000-0000-0000-0000-000000000001') then
    raise exception 'RN-EST-11 FALLIDO: un editor SIN edit_establishment_data figura como que puede'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.set_establishment_data('da400000-0000-0000-0000-000000000001', 'Renombrado sin permiso');
    raise exception 'RN-EST-11 FALLIDO: un editor SIN edit_establishment_data ha editado la ficha'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;
reset role;

-- Consulta: no. Lee y no escribe (mismo reparto que RN-MSG-05).
select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000008', false);
set role authenticated;
do $$
begin
  begin
    perform public.set_establishment_data('da400000-0000-0000-0000-000000000001', 'Renombrado por consulta');
    raise exception 'RN-EST-11 FALLIDO: el rol Consulta ha editado la ficha'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;
reset role;

-- El propietario local del restaurante DE AL LADO: no. Tiene el permiso,
-- pero no aquí — y los dos restaurantes son del mismo grupo, que es lo que
-- hace la prueba interesante.
select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000009', false);
set role authenticated;
do $$
begin
  if public.client_can_edit_establishment_data('da400000-0000-0000-0000-000000000001') then
    raise exception 'RN-EST-11 FALLIDO: el propietario de otro restaurante puede editar esta ficha'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.set_establishment_data('da400000-0000-0000-0000-000000000001', 'Renombrado por el vecino');
    raise exception 'RN-EST-11 FALLIDO: el propietario de otro restaurante ha editado esta ficha'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;
reset role;

-- RN-EST-05 · un acceso revocado deja de contar de inmediato. El editor
-- que sí podía deja de poder.
update public.establishment_memberships set revoked_at = now()
where id = 'da500000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
begin
  if public.client_can_edit_establishment_data('da400000-0000-0000-0000-000000000001') then
    raise exception 'RN-EST-05 FALLIDO: un acceso revocado sigue permitiendo editar la ficha'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- CLAUDE.md · privilegios de las funciones nuevas. Ninguna aparece en una
-- politica de RLS, asi que las dos van cerradas a `anon` y abiertas a
-- `authenticated` (comprobar solo lo primero se cumpliria tambien
-- revocandoselas a todo el mundo y rompiendo la pantalla).
-- ============================================================
do $$
declare
  v_fn text;
  v_abiertas text := '';
  v_cerradas text := '';
begin
  foreach v_fn in array array[
    'public.set_establishment_data(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text)',
    'public.client_can_edit_establishment_data(uuid)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      v_abiertas := v_abiertas || ' ' || v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      v_cerradas := v_cerradas || ' ' || v_fn;
    end if;
  end loop;

  if v_abiertas <> '' then
    raise exception 'CLAUDE.md FALLIDO: funciones de la ficha abiertas a anon:%', v_abiertas
      using errcode = 'assert_failure';
  end if;

  if v_cerradas <> '' then
    raise exception 'FALLIDO: authenticated no puede usar la ficha:%', v_cerradas
      using errcode = 'assert_failure';
  end if;

  -- Y la del disparador, al contrario: la ejecuta la base al escribir la
  -- tabla, nunca nadie por RPC. Cerrada a los tres (CLAUDE.md), y el
  -- bloque de arriba demuestra que sigue disparando igual.
  if has_function_privilege('anon', 'public.guard_establishment_data_change()', 'execute')
     or has_function_privilege('authenticated', 'public.guard_establishment_data_change()', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: la funcion del disparador de la ficha es ejecutable por RPC'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id = 'da100000-0000-0000-0000-000000000001';
delete from public.state_events where space_id = 'da100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'da100000-0000-0000-0000-000000000001';
delete from auth.users where id in (
  'da000000-0000-0000-0000-000000000001',
  'da000000-0000-0000-0000-000000000002',
  'da000000-0000-0000-0000-000000000003',
  'da000000-0000-0000-0000-000000000004',
  'da000000-0000-0000-0000-000000000005',
  'da000000-0000-0000-0000-000000000006',
  'da000000-0000-0000-0000-000000000007',
  'da000000-0000-0000-0000-000000000008',
  'da000000-0000-0000-0000-000000000009'
);

select 'datos_del_establecimiento.sql: §15.2, RN-EST-11, RN-EST-05 y CA-17 cumplidos, base de datos limpia' as resultado;
