-- ============================================================
-- Alérgenos en el menú (PRD §39, RN-ALE; decisión 45)
-- ============================================================
--
-- La última de las catorce piezas sueltas del diseño (vista R14). Se
-- declaran **plato a plato**, con las casillas de los catorce del
-- Reglamento UE 1169/2011 y una nota libre, y **no bloquean la
-- publicación**: se avisa de los que faltan y el menú sale igual.
--
-- Esta migración NO redacta ningún aviso legal: lo que se guarda lo escribe
-- el restaurante. El aviso legal sigue en el paso 4.
--
-- Se comprueba con `supabase/tests/alergenos_del_menu.sql`.

-- ------------------------------------------------------------
-- La lista, repetida a propósito
-- ------------------------------------------------------------
--
-- Vive en `src/core/allergens.ts` y aquí está otra vez. No es un descuido:
-- el servidor tiene que validar sin preguntarle al navegador (CLAUDE.md,
-- "el cliente nunca es la autoridad), y `listas-compartidas.test.ts`
-- compara las dos y se pone rojo si discrepan.
--
-- El orden es el del Anexo II del reglamento, no el alfabético: es el que
-- usan las cartas y las tablas de alérgenos que la gente ya ha visto.
create or replace function public.allergen_codes()
returns text[]
language sql
immutable
as $$
  select array[
    'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk',
    'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
  ]::text[];
$$;

comment on function public.allergen_codes() is
  'RN-ALE-02 · los catorce del Anexo II del Reglamento UE 1169/2011, en el
   orden del reglamento. Lista cerrada: no se añade ninguno desde la
   aplicación. La misma lista está en `src/core/allergens.ts` y un test
   compara las dos.';

grant execute on function public.allergen_codes() to authenticated, anon;

-- ------------------------------------------------------------
-- Dónde se guardan
-- ------------------------------------------------------------
--
-- Una columna en la versión, y no una tabla aparte, porque la declaración
-- **es** contenido de la versión: viaja con ella (RN-ALE-07), se escribe
-- con ella de una vez y no se edita nunca. Una tabla hija habría podido
-- quedar desparejada de su versión; una columna no.
--
-- La forma, con las posiciones atadas a las de los platos (RN-ALE-09):
--
--   {
--     "starters": [ {"allergens": ["gluten"], "note": "trazas"}, null ],
--     "mains":    [ {"allergens": [], "note": null} ],
--     "desserts": [],
--     "drink":    {"allergens": ["sulphites"], "note": null}
--   }
--
-- `null` en una posición es un plato sin declarar; un objeto con la lista
-- vacía es un plato del que alguien ha dicho que no lleva ninguno de los
-- catorce. **No son lo mismo** (RN-ALE-06), y por eso no se puede
-- representar con un `text[]` a secas.
alter table public.menu_versions
  add column allergens jsonb;

comment on column public.menu_versions.allergens is
  'RN-ALE · lo declarado plato a plato, por posición dentro de su categoría.
   `null` en la columna es una versión anterior a §39; `null` en una
   posición es un plato sin declarar, que NO es lo mismo que un plato sin
   alérgenos (RN-ALE-06).';

-- **Y su privilegio de columna.** `menu_versions` tiene los privilegios
-- revocados y las columnas concedidas una a una (CLAUDE.md), así que una
-- columna nueva nace **sin permiso para nadie**: sin esta línea, la
-- declaración se guardaría bien y no la leería ni quien la escribió. No da
-- ningún aviso — el `select` falla con "permission denied for table
-- menu_versions", que suena a un problema de la tabla entera.
--
-- `created_by` sigue fuera de la lista, como estaba: es identidad del
-- equipo y el cliente no la ve.
grant select (allergens) on public.menu_versions to authenticated;

-- ------------------------------------------------------------
-- La validación
-- ------------------------------------------------------------
--
-- Falso-cerrado: lo que no se entiende se rechaza. Una declaración torcida
-- —tres platos y cuatro declaraciones, o un código inventado— no la notaría
-- nadie hasta que alguien con alergia leyera el menú, así que la versión
-- entera se rechaza antes de guardarse.
create or replace function public.validate_dish_allergens(p_dish jsonb)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_codigo text;
  v_nota jsonb;
begin
  -- `null` es un plato sin declarar, y es válido.
  if p_dish is null or jsonb_typeof(p_dish) = 'null' then
    return;
  end if;

  if jsonb_typeof(p_dish) <> 'object' then
    raise exception 'La declaración de un plato tiene que ser un objeto';
  end if;

  if jsonb_typeof(coalesce(p_dish -> 'allergens', '[]'::jsonb)) <> 'array' then
    raise exception 'Los alérgenos de un plato tienen que ser una lista';
  end if;

  for v_codigo in select jsonb_array_elements_text(coalesce(p_dish -> 'allergens', '[]'::jsonb)) loop
    -- RN-ALE-02 · la lista es cerrada. Un código que no está en ella se
    -- rechaza en vez de guardarse: un alérgeno inventado se leería como uno
    -- de verdad.
    if not (v_codigo = any (public.allergen_codes())) then
      raise exception 'ALERGENO_DESCONOCIDO: "%" no es uno de los catorce del reglamento', v_codigo;
    end if;
  end loop;

  v_nota := p_dish -> 'note';
  if v_nota is not null and jsonb_typeof(v_nota) not in ('null', 'string') then
    raise exception 'La nota de un plato tiene que ser texto';
  end if;
end;
$$;

revoke all on function public.validate_dish_allergens(jsonb) from public, anon, authenticated;

create or replace function public.validate_menu_allergens(
  p_allergens jsonb,
  p_starters text[],
  p_mains text[],
  p_desserts text[],
  p_drink text
)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_curso text;
  v_platos integer;
  v_lista jsonb;
  v_entrada jsonb;
  v_codigo text;
begin
  -- Sin declaración no hay nada que validar: RN-ALE-05, la publicación no
  -- se bloquea y guardar tampoco. Un menú sin declarar es un menú al que le
  -- falta información, no un menú mal hecho.
  if p_allergens is null then
    return;
  end if;

  if jsonb_typeof(p_allergens) <> 'object' then
    raise exception 'La declaración de alérgenos tiene que ser un objeto con las cuatro categorías';
  end if;

  foreach v_curso in array array['starters', 'mains', 'desserts'] loop
    v_platos := case v_curso
      when 'starters' then coalesce(array_length(p_starters, 1), 0)
      when 'mains' then coalesce(array_length(p_mains, 1), 0)
      else coalesce(array_length(p_desserts, 1), 0)
    end;

    v_lista := p_allergens -> v_curso;

    if v_lista is null or jsonb_typeof(v_lista) = 'null' then
      -- Categoría entera sin declarar: válido, cuenta como platos sin
      -- declarar y ya está.
      continue;
    end if;

    if jsonb_typeof(v_lista) <> 'array' then
      raise exception 'La declaración de % tiene que ser una lista', v_curso;
    end if;

    -- RN-ALE-09 · tantas declaraciones como platos. Si no cuadran, la
    -- correspondencia por posición sería mentira y lo que se leería después
    -- serían los alérgenos de otro plato.
    if jsonb_array_length(v_lista) <> v_platos then
      raise exception 'La declaración de % tiene % entradas y hay % platos', v_curso, jsonb_array_length(v_lista), v_platos;
    end if;

    for v_entrada in select value from jsonb_array_elements(v_lista) loop
      perform public.validate_dish_allergens(v_entrada);
    end loop;
  end loop;

  -- La bebida: un objeto, no una lista, y solo si hay bebida.
  v_lista := p_allergens -> 'drink';
  if v_lista is not null and jsonb_typeof(v_lista) <> 'null' then
    if nullif(btrim(coalesce(p_drink, '')), '') is null then
      raise exception 'Hay declaración de bebida y no hay bebida';
    end if;
    perform public.validate_dish_allergens(v_lista);
  end if;

  -- Y nada más: una clave que no sea una de las cuatro es un error de quien
  -- llama, y tragárselo dejaría una declaración a medias guardada como si
  -- estuviera entera.
  for v_codigo in select * from jsonb_object_keys(p_allergens) loop
    if v_codigo not in ('starters', 'mains', 'desserts', 'drink') then
      raise exception 'La declaración de alérgenos no conoce la categoría "%"', v_codigo;
    end if;
  end loop;
end;
$$;

revoke all on function public.validate_menu_allergens(jsonb, text[], text[], text[], text)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- Guardar una versión con su declaración
-- ------------------------------------------------------------
--
-- Noveno argumento, **opcional**: sin él la función se comporta igual que
-- antes y guarda la versión sin declaración. Eso es RN-ALE-05 escrito en la
-- firma —no declarar no impide guardar ni publicar— y de paso deja intacta
-- a la app móvil, que llama con siete.
--
-- La de ocho se queda muerta por el mismo motivo que se quedó la de siete
-- en la migración 99: PostgreSQL trataría las dos como sobrecargas y
-- PostgREST elegiría cualquiera según los parámetros que le llegaran.
create or replace function public.save_menu_version(
  p_menu_id uuid,
  p_starters text[],
  p_mains text[],
  p_desserts text[],
  p_drink text default null,
  p_price_cents integer default null,
  p_note text default null,
  p_expected_version integer default null,
  p_allergens jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_version integer;
  v_after_cutoff boolean;
  v_id uuid;
  v_actual integer;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para editar este menú';
  end if;

  if v_menu.state in ('published', 'cancelled') then
    raise exception 'Un menú publicado o cancelado no se edita: copia el menú para crear un borrador nuevo';
  end if;

  -- RN-ALE-09 · antes de escribir nada. Una declaración torcida no la
  -- notaría nadie hasta que alguien con alergia leyera el menú.
  perform public.validate_menu_allergens(p_allergens, p_starters, p_mains, p_desserts, p_drink);

  select coalesce(max(version), 0) into v_actual
  from public.menu_versions where menu_id = p_menu_id;

  -- A17 · alguien guardó entre que esta persona abrió el editor y pulsó.
  if p_expected_version is not null and p_expected_version <> v_actual then
    raise exception 'EDICION_SIMULTANEA: el menú va por la versión %, no por la %', v_actual, p_expected_version
      using errcode = '40001';
  end if;

  v_version := v_actual + 1;
  v_after_cutoff := now() > public.menu_cutoff_at(v_menu.target_date, v_menu.space_id);

  insert into public.menu_versions
    (space_id, menu_id, version, starters, mains, desserts, drink, price_cents, note,
     allergens, after_cutoff, created_by)
  values
    (v_menu.space_id, p_menu_id, v_version, coalesce(p_starters, '{}'), coalesce(p_mains, '{}'),
     coalesce(p_desserts, '{}'), nullif(btrim(p_drink), ''), p_price_cents, nullif(btrim(p_note), ''),
     p_allergens, v_after_cutoff, auth.uid())
  returning id into v_id;

  update public.menus set current_version_id = v_id, updated_at = now() where id = p_menu_id;

  if v_menu.state = 'needs_information' then
    perform public.record_menu_event(p_menu_id,
      (select id from public.menu_publications where menu_id = p_menu_id and published_at is null and cancelled_at is null),
      'needs_information', 'reviewing', 'Versión ' || v_version || ' guardada por el restaurante');
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.version_saved', 'menu', p_menu_id,
          jsonb_build_object('version', v_version, 'version_id', v_id, 'after_cutoff', v_after_cutoff,
                             'has_allergens', p_allergens is not null));

  return v_id;
end;
$$;

comment on function public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer, jsonb) is
  'RN-MEN y RN-ALE · guarda una versión del menú, con su declaración de
   alérgenos plato a plato si la hay. `p_allergens` es opcional porque no
   declarar no impide guardar (RN-ALE-05); lo que sí impide guardar es una
   declaración que no cuadra con los platos (RN-ALE-09).';

revoke all on function public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer, jsonb)
  from public, anon;
grant execute on function public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer, jsonb)
  to authenticated;

drop function if exists public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer);

-- `copy_menu()` llamaba a la de ocho por posición y se quedaría sin
-- función. Se redefine para que copie también la declaración: un menú
-- copiado con sus platos y sin sus alérgenos sería la manera más silenciosa
-- de publicar un menú sin declarar creyendo que la llevaba.
create or replace function public.copy_menu(p_menu_id uuid, p_target_date date, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_version public.menu_versions;
  v_new_id uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para copiar este menú';
  end if;

  v_new_id := public.create_menu(
    v_menu.establishment_id, coalesce(nullif(btrim(p_name), ''), v_menu.name), v_menu.kind, p_target_date,
    case when exists (select 1 from public.menu_templates t where t.id = v_menu.template_id and t.archived_at is null)
         then v_menu.template_id else null end);

  if v_menu.current_version_id is not null then
    select * into v_version from public.menu_versions where id = v_menu.current_version_id;
    perform public.save_menu_version(v_new_id, v_version.starters, v_version.mains, v_version.desserts,
                                     v_version.drink, v_version.price_cents, v_version.note,
                                     null, v_version.allergens);
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.copied', 'menu', v_new_id,
          jsonb_build_object('copied_from', p_menu_id, 'target_date', p_target_date));

  return v_new_id;
end;
$$;

revoke all on function public.copy_menu(uuid, date, text) from public, anon;
grant execute on function public.copy_menu(uuid, date, text) to authenticated;
