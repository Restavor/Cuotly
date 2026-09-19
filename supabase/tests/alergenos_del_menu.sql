-- ============================================================
-- Suite 52 · La nota de alérgenos del menú (PRD §39, RN-ALE-01 a 06)
-- ============================================================
--
-- Reescrita el 19/09/2026 (decisión 47). Hasta ese día comprobaba la
-- declaración plato a plato de la decisión 45: los catorce del reglamento
-- por posición, la distinción entre "sin declarar" y "sin alérgenos", y el
-- rechazo de una declaración que no cuadrara con los platos.
--
-- El diseño definitivo móvil los puso como **una sola nota de texto libre
-- para todo el menú**, y eso es lo que se comprueba ahora.
--
-- Prefijo de esta suite: cc100000-.

begin;

set local role postgres;

-- ------------------------------------------------------------
-- Montaje
-- ------------------------------------------------------------
insert into auth.users (id, email, role, aud) values
  ('cc100000-0000-0000-0000-000000000001', 'duena@suite52.test', 'authenticated', 'authenticated'),
  ('cc100000-0000-0000-0000-000000000002', 'cliente@suite52.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('cc100000-0000-0000-0000-000000000001', 'duena@suite52.test', 'Dueña 52'),
  ('cc100000-0000-0000-0000-000000000002', 'cliente@suite52.test', 'Cliente 52')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by)
values ('cc100000-0000-0000-0000-000000000010', 'Espacio 52', 'espacio-52', 'Europe/Madrid',
        'cc100000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status)
values ('cc100000-0000-0000-0000-000000000010', 'cc100000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name)
values ('cc100000-0000-0000-0000-000000000015', 'cc100000-0000-0000-0000-000000000010', 'Grupo 52');

-- Con `code` puesto a mano: el disparador que lo genera pide sesión de
-- alguien del espacio, y aquí seguimos montando como `postgres`.
insert into public.establishments (id, space_id, group_id, code, name, status)
values ('cc100000-0000-0000-0000-000000000020', 'cc100000-0000-0000-0000-000000000010',
        'cc100000-0000-0000-0000-000000000015', 'R52', 'Restaurante 52', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role)
values ('cc100000-0000-0000-0000-000000000020', 'cc100000-0000-0000-0000-000000000002', 'local_owner');

-- Menú Diario contratado: sin la suscripción `create_menu()` no deja ni
-- empezar, y esta suite va de lo que se escribe DENTRO del menú.
insert into public.services (id, space_id, name, price_cents, price_premium_cents, kind, included_updates)
values ('cc100000-0000-0000-0000-000000000030', 'cc100000-0000-0000-0000-000000000010',
        'Menú Diario', 22900, 19900, 'daily_menu', 30);

insert into public.subscriptions (id, space_id, establishment_id, kind, service_id, status, started_at, created_by)
values ('cc100000-0000-0000-0000-000000000040', 'cc100000-0000-0000-0000-000000000010',
        'cc100000-0000-0000-0000-000000000020', 'service', 'cc100000-0000-0000-0000-000000000030',
        'active', now() - interval '10 days', 'cc100000-0000-0000-0000-000000000001');

-- ------------------------------------------------------------
-- RN-ALE-01 · la nota existe, es del menú entero y cabe en 200
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'cc100000-0000-0000-0000-000000000002';

do $$
declare
  v_menu uuid;
  v_version uuid;
  v_nota text;
begin
  v_menu := public.create_menu(
    'cc100000-0000-0000-0000-000000000020', 'Menú de prueba', 'daily',
    (now() + interval '3 days')::date, null);

  v_version := public.save_menu_version(
    v_menu,
    array['Ensalada', 'Crema'],
    array['Merluza'],
    array['Tarta'],
    null, 1650, null, null,
    'Contiene gluten, lácteos y frutos secos.');

  select allergen_note into v_nota from public.menu_versions where id = v_version;

  if v_nota is distinct from 'Contiene gluten, lácteos y frutos secos.' then
    raise exception 'RN-ALE-01 FALLA: la nota no se guardó tal cual, llegó "%"', v_nota;
  end if;
end;
$$;

-- RN-ALE-01 · el límite de 200 lo impone el SERVIDOR, no la pantalla.
do $$
declare
  v_menu uuid;
begin
  v_menu := public.create_menu(
    'cc100000-0000-0000-0000-000000000020', 'Menú largo', 'daily',
    (now() + interval '4 days')::date, null);

  begin
    perform public.save_menu_version(
      v_menu, array['Uno'], array['Dos'], array['Tres'], null, 1000, null, null,
      repeat('x', 201));
    raise exception 'RN-ALE-01 FALLA: se aceptó una nota de 201 caracteres';
  exception
    when others then
      if sqlerrm like 'RN-ALE-01 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- RN-ALE-04 · no declarar no impide guardar ni publicar
-- ------------------------------------------------------------
do $$
declare
  v_menu uuid;
  v_version uuid;
  v_nota text;
begin
  v_menu := public.create_menu(
    'cc100000-0000-0000-0000-000000000020', 'Menú sin nota', 'daily',
    (now() + interval '5 days')::date, null);

  -- Con siete argumentos, como llama la app móvil: ni se menciona la nota.
  v_version := public.save_menu_version(
    v_menu, array['Uno'], array['Dos'], array['Tres'], null, 1200, null);

  select allergen_note into v_nota from public.menu_versions where id = v_version;
  if v_nota is not null then
    raise exception 'RN-ALE-04 FALLA: sin declarar debería quedar nulo, quedó "%"', v_nota;
  end if;
end;
$$;

-- La nota en blanco es lo mismo que no declarar: no se guarda una cadena
-- vacía que luego se lea como "declarado sin alérgenos".
do $$
declare
  v_menu uuid;
  v_version uuid;
  v_nota text;
begin
  v_menu := public.create_menu(
    'cc100000-0000-0000-0000-000000000020', 'Menú con blancos', 'daily',
    (now() + interval '6 days')::date, null);

  v_version := public.save_menu_version(
    v_menu, array['Uno'], array['Dos'], array['Tres'], null, 1200, null, null, '   ');

  select allergen_note into v_nota from public.menu_versions where id = v_version;
  if v_nota is not null then
    raise exception 'FALLA: una nota de solo espacios debería quedar nula, quedó "%"', v_nota;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-ALE-05 · la nota viaja con la versión al copiar el menú
-- ------------------------------------------------------------
do $$
declare
  v_menu uuid;
  v_copia uuid;
  v_nota text;
begin
  v_menu := public.create_menu(
    'cc100000-0000-0000-0000-000000000020', 'Menú que se copia', 'daily',
    (now() + interval '7 days')::date, null);

  perform public.save_menu_version(
    v_menu, array['Uno'], array['Dos'], array['Tres'], null, 1400, null, null,
    'Contiene apio.');

  v_copia := public.copy_menu(v_menu, (now() + interval '8 days')::date, null);

  select mv.allergen_note into v_nota
  from public.menus m
  join public.menu_versions mv on mv.id = m.current_version_id
  where m.id = v_copia;

  if v_nota is distinct from 'Contiene apio.' then
    raise exception 'RN-ALE-05 FALLA: la copia perdió la nota, llegó "%"', v_nota;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-ALE-02 · la escribe quien edita el menú, y solo quien puede
-- ------------------------------------------------------------
--
-- El equipo también: la nota es una línea más del contenido y pasa por la
-- misma puerta que el resto (`can_write_menus()`).
set local "request.jwt.claim.sub" = 'cc100000-0000-0000-0000-000000000001';

do $$
declare
  v_menu uuid;
  v_version uuid;
begin
  v_menu := public.create_menu(
    'cc100000-0000-0000-0000-000000000020', 'Menú del equipo', 'daily',
    (now() + interval '9 days')::date, null);

  v_version := public.save_menu_version(
    v_menu, array['Uno'], array['Dos'], array['Tres'], null, 1500, null, null,
    'Contiene mostaza.');

  if v_version is null then
    raise exception 'RN-ALE-02 FALLA: el equipo no pudo escribir la nota';
  end if;
end;
$$;

-- Y quien no tiene nada que ver con el restaurante, no.
set local role postgres;
insert into auth.users (id, email, role, aud) values
  ('cc100000-0000-0000-0000-000000000003', 'ajena@suite52.test', 'authenticated', 'authenticated');
insert into public.profiles (id, email, full_name) values
  ('cc100000-0000-0000-0000-000000000003', 'ajena@suite52.test', 'Ajena 52')
on conflict (id) do nothing;

set local role authenticated;
set local "request.jwt.claim.sub" = 'cc100000-0000-0000-0000-000000000003';

do $$
declare
  v_existente uuid;
begin
  set local role postgres;
  select id into v_existente from public.menus
  where establishment_id = 'cc100000-0000-0000-0000-000000000020'
    and state not in ('published', 'cancelled')
  limit 1;
  set local role authenticated;

  begin
    perform public.save_menu_version(
      v_existente, array['Uno'], array['Dos'], array['Tres'], null, 1000, null, null, 'Contiene soja.');
    raise exception 'RN-ALE-02 FALLA: una persona ajena escribió la nota';
  exception
    when others then
      if sqlerrm like 'RN-ALE-02 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Privilegio de columna · la nota se LEE
-- ------------------------------------------------------------
--
-- `menu_versions` tiene los privilegios revocados y las columnas
-- concedidas una a una: una columna nueva nace sin permiso para nadie y el
-- error suena a problema de la tabla entera. Es el fallo que la suite de
-- la 101 encontró, y por eso se vuelve a comprobar aquí.
set local role postgres;
do $$
begin
  if not has_column_privilege('authenticated', 'public.menu_versions', 'allergen_note', 'select') then
    raise exception 'FALLA: `authenticated` no puede leer `allergen_note` (falta el grant de columna)';
  end if;

  -- Y la identidad del equipo sigue tapada, que es lo que el privilegio de
  -- columna existe para sostener (CLAUDE.md).
  if has_column_privilege('authenticated', 'public.menu_versions', 'created_by', 'select') then
    raise exception 'FALLA: `created_by` de menu_versions dejó de estar tapada';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Decisión 47 · lo que la 101 trajo ya no está
-- ------------------------------------------------------------
--
-- Falso-cerrado: si alguien vuelve a crear las validadoras del documento
-- por plato sin reescribir §39, esto se pone rojo y hay que venir a
-- explicarlo.
do $$
declare
  v_resto text;
begin
  select string_agg(p.proname, ', ')
  into v_resto
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('allergen_codes', 'allergen_label', 'validate_dish_allergens', 'validate_menu_allergens');

  if v_resto is not null then
    raise exception 'FALLA: la decisión 47 quitó estas funciones y siguen ahí: %', v_resto;
  end if;

  -- `save_menu_version` tiene UNA sola firma, y la novena es la nota.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'save_menu_version') <> 1 then
    raise exception 'FALLA: hay más de una `save_menu_version`, y PostgREST elegiría cualquiera';
  end if;

  if (select pg_get_function_identity_arguments(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'save_menu_version') not like '%p_allergen_note text' then
    raise exception 'FALLA: la última firma de `save_menu_version` no termina en la nota';
  end if;
end;
$$;

-- La columna de la 101 sigue existiendo, sin uso y con su motivo escrito:
-- no se borra porque lleva lo que algún restaurante llegara a declarar.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'menu_versions' and column_name = 'allergens'
  ) then
    raise exception 'FALLA: se borró `menu_versions.allergens`, que la decisión 47 dijo de conservar';
  end if;

  if coalesce(col_description('public.menu_versions'::regclass,
       (select ordinal_position from information_schema.columns
        where table_schema = 'public' and table_name = 'menu_versions' and column_name = 'allergens')::int), '')
     not like 'SIN USO%' then
    raise exception 'FALLA: `allergens` no dice que está sin uso, y alguien la escribirá por error';
  end if;
end;
$$;

rollback;
