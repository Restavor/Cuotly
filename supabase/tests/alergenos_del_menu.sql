-- Alérgenos en el menú (migración 101, PRD §39, RN-ALE; decisión 45).
--
--   · RN-ALE-02: los catorce del reglamento, lista cerrada.
--   · RN-ALE-05: no declarar NO impide guardar ni publicar.
--   · RN-ALE-06: "sin alérgenos" y "sin declarar" no son lo mismo.
--   · RN-ALE-07: la declaración viaja con la versión.
--   · RN-ALE-09: tantas declaraciones como platos, o no se guarda.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/alergenos_del_menu.sql

insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('cc100000-0000-0000-0000-000000000001', 'al-duena@example.com', 'authenticated', 'authenticated'),
  ('cc100000-0000-0000-0000-000000000002', 'al-cliente@bar-alergenos.test', 'authenticated', 'authenticated');

select set_config('request.jwt.claim.aal', 'aal2', false);

create temp table al_ids (k text primary key, v uuid);
grant select, insert, update on al_ids to anon, authenticated, service_role;

-- ============================================================
-- Fixtures · un espacio con su restaurante y su Menú Diario
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Alergenos SL', 'Dueña Alergenos', 'al-duena@example.com', 'pro', '600111555');
  perform public.submit_space_request(v_id);
  insert into al_ids values ('sol', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  insert into al_ids values ('espacio',
    public.approve_space_request((select v from al_ids where k = 'sol'), 'al-espacio'));
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_est uuid;
begin
  v_est := public.create_establishment_with_data(
    (select v from al_ids where k = 'espacio'), 'Bar Alergenos', null, 'Grupo Alergenos');
  insert into al_ids values ('rest', v_est);

  perform public.grant_establishment_access(
    v_est, 'al-cliente@bar-alergenos.test', 'local_owner', false, true);
end $$;
reset role;

-- El servicio de Menú Diario, que `create_menu()` exige.
set role postgres;
do $$
declare v_serv uuid;
begin
  -- Un servicio de Menú Diario necesita sus actualizaciones incluidas: son
  -- las treinta de la decisión que no debe reaparecer.
  insert into public.services (space_id, kind, name, price_cents, price_premium_cents, included_updates)
  values ((select v from al_ids where k = 'espacio'), 'daily_menu', 'Menú Diario', 22900, 19900, 30)
  returning id into v_serv;

  insert into public.subscriptions
    (space_id, establishment_id, kind, service_id, status, started_at, created_by)
  values ((select v from al_ids where k = 'espacio'), (select v from al_ids where k = 'rest'),
          'service', v_serv, 'active', now() - interval '10 days',
          'cc100000-0000-0000-0000-000000000001');
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  insert into al_ids values ('menu', public.create_menu(
    (select v from al_ids where k = 'rest'), 'Menú del martes', 'daily',
    (current_date + 1)::date, null));
end $$;
reset role;

-- ============================================================
-- RN-ALE-02 · la lista es cerrada, y es la misma de los catorce
-- ============================================================
do $$
begin
  if array_length(public.allergen_codes(), 1) <> 14 then
    raise exception 'RN-ALE-02 FALLIDO: la lista no tiene catorce alérgenos, tiene %',
      array_length(public.allergen_codes(), 1) using errcode = 'assert_failure';
  end if;

  -- El orden es el del reglamento, no el alfabético: el primero y el último
  -- lo fijan, y que no esté ordenado alfabéticamente lo confirma.
  if (public.allergen_codes())[1] <> 'gluten' or (public.allergen_codes())[14] <> 'molluscs' then
    raise exception 'RN-ALE-02 FALLIDO: la lista no va en el orden del reglamento'
      using errcode = 'assert_failure';
  end if;

  if (select array_agg(c order by c) from unnest(public.allergen_codes()) as t(c))
     = public.allergen_codes() then
    raise exception 'RN-ALE-02 FALLIDO: la lista está en orden alfabético, no en el del reglamento'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ALE-05 · no declarar no impide guardar
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_v uuid;
begin
  v_v := public.save_menu_version(
    (select v from al_ids where k = 'menu'),
    array['Crema de calabaza', 'Ensalada'], array['Merluza'], array['Flan'],
    'Vino de la casa', 1450, null);

  if (select allergens from public.menu_versions where id = v_v) is not null then
    raise exception 'RN-ALE-05 FALLIDO: se inventó una declaración que nadie escribió'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ALE-09 · tantas declaraciones como platos, o no se guarda
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_menu uuid := (select v from al_ids where k = 'menu');
begin
  -- Dos primeros y UNA declaración: la correspondencia por posición sería
  -- mentira, y lo que se leería después serían los alérgenos de otro plato.
  begin
    perform public.save_menu_version(
      v_menu, array['Crema', 'Ensalada'], array['Merluza'], array['Flan'], 'Vino', 1450, null, null,
      '{"starters": [{"allergens": ["milk"], "note": null}]}'::jsonb);
    raise exception 'RN-ALE-09 FALLIDO: se guardó una declaración que no cuadra con los platos'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ALE-09 FALLIDO%' then raise; end if;
  end;

  -- RN-ALE-02 · un código que no es del reglamento se rechaza. Un alérgeno
  -- inventado se leería como uno de verdad.
  begin
    perform public.save_menu_version(
      v_menu, array['Crema'], array[]::text[], array[]::text[], null, null, null, null,
      '{"starters": [{"allergens": ["tomate"], "note": null}]}'::jsonb);
    raise exception 'RN-ALE-02 FALLIDO: se guardó un alérgeno que no es del reglamento'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ALE-02 FALLIDO%' then raise; end if;
  end;

  -- Una categoría que no existe tampoco cuela: se tragaría media
  -- declaración y quedaría guardada como si estuviera entera.
  begin
    perform public.save_menu_version(
      v_menu, array['Crema'], array[]::text[], array[]::text[], null, null, null, null,
      '{"starters": [null], "entrantes": []}'::jsonb);
    raise exception 'RN-ALE FALLIDO: se guardó una categoría inventada'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ALE FALLIDO%' then raise; end if;
  end;

  -- Y una declaración de bebida sin bebida: alguien se dejó el vino y no la
  -- declaración, y lo que quedaría es un alérgeno colgando de nada.
  begin
    perform public.save_menu_version(
      v_menu, array[]::text[], array[]::text[], array[]::text[], null, null, null, null,
      '{"drink": {"allergens": ["sulphites"], "note": null}}'::jsonb);
    raise exception 'RN-ALE FALLIDO: se guardó la declaración de una bebida que no existe'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'RN-ALE FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-ALE-06 · "sin alérgenos" y "sin declarar" no son lo mismo
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_menu uuid := (select v from al_ids where k = 'menu');
        v_v uuid;
        v_decl jsonb;
begin
  v_v := public.save_menu_version(
    v_menu,
    array['Crema de calabaza', 'Ensalada'], array['Merluza'], array['Flan'],
    'Vino de la casa', 1450, null, null,
    jsonb_build_object(
      -- El primero declarado con leche; el segundo, sin declarar.
      'starters', jsonb_build_array(
        jsonb_build_object('allergens', jsonb_build_array('milk'), 'note', 'puede contener trazas'),
        null),
      -- Declarado que NO lleva ninguno de los catorce: es un acto, no un hueco.
      'mains', jsonb_build_array(jsonb_build_object('allergens', jsonb_build_array(), 'note', null)),
      'desserts', jsonb_build_array(
        jsonb_build_object('allergens', jsonb_build_array('eggs', 'milk'), 'note', null)),
      'drink', jsonb_build_object('allergens', jsonb_build_array('sulphites'), 'note', null)));

  insert into al_ids values ('version_con', v_v);

  select allergens into v_decl from public.menu_versions where id = v_v;

  if v_decl is null then
    raise exception 'RN-ALE-07 FALLIDO: la declaración no se guardó con la versión'
      using errcode = 'assert_failure';
  end if;

  -- El hueco se guarda COMO hueco, no como lista vacía.
  if jsonb_typeof(v_decl -> 'starters' -> 1) <> 'null' then
    raise exception 'RN-ALE-06 FALLIDO: el plato sin declarar se guardó como declarado'
      using errcode = 'assert_failure';
  end if;

  -- Y el "ninguno" se guarda como declaración con lista vacía, no como hueco.
  if jsonb_typeof(v_decl -> 'mains' -> 0) <> 'object'
     or jsonb_array_length(v_decl -> 'mains' -> 0 -> 'allergens') <> 0 then
    raise exception 'RN-ALE-06 FALLIDO: el plato declarado sin alérgenos no se guardó como declarado'
      using errcode = 'assert_failure';
  end if;

  if v_decl -> 'starters' -> 0 ->> 'note' is distinct from 'puede contener trazas' then
    raise exception 'RN-ALE-03 FALLIDO: la nota libre del plato no se guardó'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ALE-07 · la declaración viaja con la versión, y la copia del menú
-- se la lleva
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_copia uuid;
        v_decl jsonb;
begin
  v_copia := public.copy_menu(
    (select v from al_ids where k = 'menu'), (current_date + 8)::date, 'Menú copiado');

  select mv.allergens into v_decl
  from public.menus m
  join public.menu_versions mv on mv.id = m.current_version_id
  where m.id = v_copia;

  if v_decl is null then
    raise exception 'RN-ALE-07 FALLIDO: copiar el menú perdió la declaración de alérgenos. Un menú copiado con sus platos y sin sus alérgenos es la manera más silenciosa de publicar un menú sin declarar creyendo que la llevaba'
      using errcode = 'assert_failure';
  end if;

  if v_decl -> 'desserts' -> 0 -> 'allergens' <> '["eggs", "milk"]'::jsonb then
    raise exception 'RN-ALE-07 FALLIDO: la copia no se llevó los alérgenos de los postres'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- La versión anterior a §39 sigue leyéndose: `allergens` es nulo y eso
-- quiere decir "esta versión es de antes", no "este menú no lleva nada".
-- ============================================================
do $$
begin
  if not exists (
    select 1 from public.menu_versions
    where menu_id = (select v from al_ids where k = 'menu') and version = 1 and allergens is null
  ) then
    raise exception 'RN-ALE FALLIDO: la primera versión, guardada sin declaración, no quedó nula'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- El cliente lee la declaración de su menú; quien no es de este
-- restaurante no lee ni el menú
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc100000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if not exists (
    select 1 from public.menu_versions
    where id = (select v from al_ids where k = 'version_con') and allergens is not null
  ) then
    raise exception 'RN-ALE FALLIDO: el restaurante no lee la declaración de su propio menú'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;
