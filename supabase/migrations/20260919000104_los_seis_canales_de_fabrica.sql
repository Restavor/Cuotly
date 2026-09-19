-- ============================================================
-- Migración 104 · Los seis canales de fábrica (RN-CAN-03, decisión 48)
-- ============================================================
--
-- La migración 100 sembraba cuatro —General, Proyectos web, Menú diario,
-- Redes sociales—, que son los de la maqueta M76 y la decisión 43. El
-- diseño definitivo móvil (página 74) enseña esos cuatro y dos más:
-- **Diseño y creatividad** y **Soporte interno**. Los nombres son suyos;
-- aquí no se inventa ninguno.
--
-- **Se resiembra sobre los espacios que ya existen**, igual que hizo la
-- 100 al nacer. Dos propiedades que lo hacen seguro y que conviene decir
-- en alto porque son fáciles de romper al editar esta función:
--
--   · **Es idempotente.** La comprobación es por nombre, sin mayúsculas ni
--     espacios de sobra, así que un espacio que ya tenga "General" no
--     recibe otro.
--   · **No resucita un canal archivado.** Un canal se archiva y no se
--     borra (RN-CAN-05), así que sigue en la tabla con su `archived_at`.
--     La comprobación **no filtra por archivado** a propósito: si
--     filtrara, resembrar le devolvería a un equipo el canal que decidió
--     archivar, y encima vacío.
--
-- Nacen **sin miembros** (RN-CAN-07), como los cuatro anteriores: nadie
-- entra en un canal sin que alguien lo meta, ni siquiera el propietario.

create or replace function public.seed_default_channels(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_creados integer := 0;
begin
  foreach v_nombre in array array[
    'General', 'Proyectos web', 'Menú diario', 'Redes sociales',
    'Diseño y creatividad', 'Soporte interno'
  ]
  loop
    -- Sin filtrar por `archived_at`: lo archivado sigue existiendo, y
    -- devolvérselo a quien lo archivó sería peor que no sembrarlo.
    if not exists (
      select 1 from public.conversations
      where space_id = p_space_id and type = 'channel'
        and lower(btrim(name)) = lower(v_nombre)
    ) then
      insert into public.conversations (space_id, type, name)
      values (p_space_id, 'channel', v_nombre);
      v_creados := v_creados + 1;
    end if;
  end loop;

  return v_creados;
end;
$$;

comment on function public.seed_default_channels(uuid) is
  'RN-CAN-03 · los seis canales de fábrica del diseño definitivo (página
   74). Idempotente y sin resucitar archivados: la comprobación por nombre
   NO filtra por `archived_at`, a propósito (RN-CAN-05).';

revoke all on function public.seed_default_channels(uuid) from public, anon, authenticated;

-- Los espacios que ya existen reciben los dos nuevos. Los cuatro que ya
-- tienen no se duplican.
select public.seed_default_channels(id) from public.spaces;
