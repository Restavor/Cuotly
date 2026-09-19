-- ============================================================
-- Migración 102 · Los alérgenos vuelven a ser una nota (PRD §39, decisión 47)
-- ============================================================
--
-- La migración 101, del 17/09/2026, guardaba los alérgenos **plato a
-- plato**: los catorce del Anexo II del Reglamento UE 1169/2011 en un
-- documento por posición, más una nota por plato, distinguiendo un plato
-- sin declarar de uno del que se ha dicho que no lleva ninguno. Eso era la
-- decisión 45.
--
-- El diseño definitivo móvil (página 125) los pone de otra manera: **una
-- sola nota de texto libre para todo el menú**, de 200 caracteres. Se
-- preguntó con el coste delante y manda el diseño (decisión 47).
--
-- **La 101 no se edita.** CLAUDE.md lo prohíbe y con razón: ya está
-- aplicada en producción. Su columna `allergens` se queda donde está, sin
-- uso, y esta migración escribe al lado la columna nueva. Lo que había
-- guardado **se convierte**, que es lo que Bosco pidió: no se tira
-- información que escribió un restaurante.

-- ------------------------------------------------------------
-- 1 · La columna nueva, con su privilegio
-- ------------------------------------------------------------
--
-- `menu_versions` tiene los privilegios revocados y las columnas
-- concedidas una a una (CLAUDE.md), así que una columna nueva nace **sin
-- permiso para nadie**: se guardaría bien y no la leería ni quien la
-- escribió, con un "permission denied for table menu_versions" que suena a
-- problema de la tabla entera. Pasó al escribir la 101 y lo pilló su suite.
alter table public.menu_versions
  add column allergen_note text;

comment on column public.menu_versions.allergen_note is
  'RN-ALE-01 · la nota de alérgenos del menú entero, texto libre de hasta
   200 caracteres. La escribe quien edita el menú (RN-ALE-02) y la
   información es del restaurante: Cuotly no la comprueba (RN-ALE-03).';

grant select (allergen_note) on public.menu_versions to authenticated;

-- El límite va en la base y no solo en la pantalla: el cliente nunca es la
-- autoridad (CLAUDE.md).
alter table public.menu_versions
  add constraint menu_versions_allergen_note_length
  check (allergen_note is null or char_length(allergen_note) <= 200);

comment on column public.menu_versions.allergens is
  'SIN USO desde la migración 102 (PRD §39 reescrito, decisión 47). Guardaba
   la declaración plato a plato de la decisión 45, que el diseño definitivo
   móvil sustituyó por una nota única (`allergen_note`). No se borra porque
   lleva lo que algún restaurante llegara a declarar; no se escribe más.';

-- ------------------------------------------------------------
-- 2 · Lo declarado se convierte en nota
-- ------------------------------------------------------------
--
-- Se recorre cada versión con declaración y se junta en una frase lo que
-- de verdad se declaró, en el orden del reglamento y sin repetir. Las
-- notas por plato de la 101 se añaden detrás, porque eran información que
-- alguien escribió a mano y tirarla sería peor que una frase larga.
--
-- Es un `update` de una vez y no un disparador: es una conversión que
-- ocurre una sola vez, y dejar un disparador vivo para algo que no volverá
-- a pasar es dejar una puerta abierta.
-- El nombre en español de cada código, solo para esta conversión. Se crea
-- aquí y se borra al final: es un ayudante de un `update` que ocurre una
-- vez, no una función del producto. Los nombres son los mismos que enseña
-- la web (`es.allergens.names`), que son los del Anexo II.
create or replace function public.allergen_label(p_code text)
returns text
language sql
immutable
as $lbl$
  select case p_code
    when 'gluten' then 'cereales con gluten'
    when 'crustaceans' then 'crustáceos'
    when 'eggs' then 'huevos'
    when 'fish' then 'pescado'
    when 'peanuts' then 'cacahuetes'
    when 'soy' then 'soja'
    when 'milk' then 'leche'
    when 'nuts' then 'frutos de cáscara'
    when 'celery' then 'apio'
    when 'mustard' then 'mostaza'
    when 'sesame' then 'granos de sésamo'
    when 'sulphites' then 'dióxido de azufre y sulfitos'
    when 'lupin' then 'altramuces'
    when 'molluscs' then 'moluscos'
    else p_code
  end;
$lbl$;

do $conv$
declare
  v_fila record;
  v_codigo text;
  v_nombres text[];
  v_notas text[];
  v_frase text;
begin
  for v_fila in
    select id, allergens from public.menu_versions
    where allergens is not null and jsonb_typeof(allergens) = 'object'
  loop
    v_nombres := '{}';
    v_notas := '{}';

    -- Los códigos declarados en cualquier plato de cualquier categoría, en
    -- el orden del reglamento, que es el de `allergen_codes()`.
    foreach v_codigo in array public.allergen_codes() loop
      if exists (
        select 1
        from jsonb_each(v_fila.allergens) as cat(clave, valor),
             lateral (
               select case
                 when jsonb_typeof(cat.valor) = 'array' then cat.valor
                 when jsonb_typeof(cat.valor) = 'object' then jsonb_build_array(cat.valor)
                 else '[]'::jsonb
               end as platos
             ) p,
             lateral jsonb_array_elements(p.platos) as plato(dato)
        where jsonb_typeof(plato.dato) = 'object'
          and plato.dato -> 'allergens' @> to_jsonb(v_codigo)
      ) then
        v_nombres := v_nombres || public.allergen_label(v_codigo);
      end if;
    end loop;

    -- Las notas por plato, sin repetir y sin las vacías.
    select coalesce(array_agg(distinct nota), '{}')
    into v_notas
    from (
      select btrim(plato.dato ->> 'note') as nota
      from jsonb_each(v_fila.allergens) as cat(clave, valor),
           lateral (
             select case
               when jsonb_typeof(cat.valor) = 'array' then cat.valor
               when jsonb_typeof(cat.valor) = 'object' then jsonb_build_array(cat.valor)
               else '[]'::jsonb
             end as platos
           ) p,
           lateral jsonb_array_elements(p.platos) as plato(dato)
      where jsonb_typeof(plato.dato) = 'object'
        and nullif(btrim(coalesce(plato.dato ->> 'note', '')), '') is not null
    ) z;

    v_frase := null;
    if array_length(v_nombres, 1) is not null then
      v_frase := 'Contiene ' || array_to_string(v_nombres, ', ') || '.';
    end if;
    if array_length(v_notas, 1) is not null then
      v_frase := btrim(coalesce(v_frase || ' ', '') || array_to_string(v_notas, ' '));
    end if;

    if v_frase is not null then
      -- El límite manda: lo que no cabe se corta, porque la restricción de
      -- arriba es la que vale y una conversión no puede saltársela.
      update public.menu_versions
      set allergen_note = left(v_frase, 200)
      where id = v_fila.id;
    end if;
  end loop;
end
$conv$;

-- ------------------------------------------------------------
-- 3 · Guardar una versión, con la nota en vez del documento
-- ------------------------------------------------------------
--
-- Novena posición otra vez, y otra vez opcional: sin ella la función se
-- comporta igual que antes (RN-ALE-04, no declarar no impide guardar) y la
-- app móvil, que llama con siete, sigue igual.
--
-- La de nueve con `jsonb` se borra por el mismo motivo por el que la 101
-- borró la de ocho y la 99 la de siete: dos funciones con el mismo nombre
-- y distinta idea de los alérgenos es justo lo que esto viene a evitar.
create or replace function public.save_menu_version(
  p_menu_id uuid,
  p_starters text[],
  p_mains text[],
  p_desserts text[],
  p_drink text default null,
  p_price_cents integer default null,
  p_note text default null,
  p_expected_version integer default null,
  p_allergen_note text default null
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
  v_alergenos text := nullif(btrim(coalesce(p_allergen_note, '')), '');
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  -- RN-ALE-02 · la misma puerta que el resto del contenido del menú. El
  -- restaurante desde su panel y el equipo desde la ficha: la nota es una
  -- línea más del menú, no un permiso aparte.
  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para editar este menú';
  end if;

  if v_menu.state in ('published', 'cancelled') then
    raise exception 'Un menú publicado o cancelado no se edita: copia el menú para crear un borrador nuevo';
  end if;

  if v_alergenos is not null and char_length(v_alergenos) > 200 then
    raise exception 'La nota de alérgenos no puede pasar de 200 caracteres';
  end if;

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
     allergen_note, after_cutoff, created_by)
  values
    (v_menu.space_id, p_menu_id, v_version, coalesce(p_starters, '{}'), coalesce(p_mains, '{}'),
     coalesce(p_desserts, '{}'), nullif(btrim(p_drink), ''), p_price_cents, nullif(btrim(p_note), ''),
     v_alergenos, v_after_cutoff, auth.uid())
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
                             'has_allergen_note', v_alergenos is not null));

  return v_id;
end;
$$;

comment on function public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer, text) is
  'RN-MEN y RN-ALE · guarda una versión del menú, con su nota de alérgenos
   si la hay. Es opcional porque no declarar no impide guardar ni publicar
   (RN-ALE-04).';

revoke all on function public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer, text)
  from public, anon;
grant execute on function public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer, text)
  to authenticated;

drop function if exists public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer, jsonb);

-- ------------------------------------------------------------
-- 4 · Copiar un menú copia su nota (RN-ALE-05)
-- ------------------------------------------------------------
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
    -- RN-ALE-05 · la nota viaja. Un menú copiado con sus platos y sin su
    -- nota sería la manera más silenciosa de publicar un menú sin declarar
    -- creyendo que la llevaba.
    perform public.save_menu_version(v_new_id, v_version.starters, v_version.mains, v_version.desserts,
                                     v_version.drink, v_version.price_cents, v_version.note,
                                     null, v_version.allergen_note);
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.copied', 'menu', v_new_id,
          jsonb_build_object('copied_from', p_menu_id, 'target_date', p_target_date));

  return v_new_id;
end;
$$;

revoke all on function public.copy_menu(uuid, date, text) from public, anon;
grant execute on function public.copy_menu(uuid, date, text) to authenticated;

-- ------------------------------------------------------------
-- 5 · Lo que la 101 trajo y ya no hace falta
-- ------------------------------------------------------------
--
-- Las dos validadoras del documento por plato se quedan sin nadie que las
-- llame. Se borran en vez de dejarlas: una función interna viva que no
-- usa nadie es una puerta que algún día alguien abre por error.
--
-- `allergen_codes()` se borra **después** de la conversión de arriba, que
-- la necesita para poner los nombres en el orden del reglamento.
drop function if exists public.validate_menu_allergens(jsonb, text[], text[], text[], text);
drop function if exists public.validate_dish_allergens(jsonb);
drop function if exists public.allergen_label(text);
drop function if exists public.allergen_codes();
