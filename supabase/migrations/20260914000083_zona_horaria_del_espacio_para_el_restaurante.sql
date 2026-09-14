-- Fase 3 · Hito 14 · la zona horaria del espacio, legible por el
-- restaurante (CLAUDE.md: "las fechas se guardan en `timestamptz` y se
-- calculan en la zona horaria del espacio").
--
-- **El agujero.** Esa regla se cumplía en todas las pantallas del equipo
-- leyendo `spaces.timezone`, y en ninguna de las del restaurante: un
-- restaurante no es miembro del espacio, `spaces_select` le devuelve cero
-- filas, y las cuatro pantallas que tiene (Menú Diario, la ficha de un
-- menú, "Informes y datos" y "Autorizar fuentes") acabaron con
-- `"Europe/Madrid"` escrito en el código. Mientras Cuotly fuese solo el
-- espacio de Restavor eso daba la hora correcta por casualidad; en cuanto
-- hay un segundo espacio con otra zona, su restaurante ve las fechas
-- corridas y nada falla de forma visible. Cuotly es multiempresa
-- (CLAUDE.md, "decisiones que no deben reaparecer), así que la casualidad
-- no vale.
--
-- **Por qué una función y no una política.** Abrirle `spaces` al
-- restaurante le daría también el nombre, el slug, el plan y el resto de
-- la organización del espacio, que no le incumbe (P7). Lo único que
-- necesita para pintar una fecha es el identificador de la zona horaria,
-- así que eso es lo único que se le da, por la puerta estrecha de una
-- función que comprueba con `can_read_establishment()` —la misma que ya
-- guarda `establishment_integrations()`— que quien pregunta es de ese
-- restaurante, de su grupo o del espacio.
--
-- No es interna: hace su propia comprobación de permisos y la llama una
-- sesión de persona, así que conserva el EXECUTE de `authenticated` y
-- pierde el de `public` y `anon` (CLAUDE.md).
--
-- Se comprueba con `supabase/tests/zona_horaria_del_restaurante.sql`, cuyo
-- espacio está en Atlantic/Canary a propósito: sobre un espacio en
-- Europe/Madrid, devolver el valor por defecto de la columna pasaría por
-- correcto y el fallo seguiría dentro.

create or replace function public.establishment_timezone(p_establishment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
begin
  if not exists (select 1 from public.establishments e where e.id = p_establishment_id) then
    raise exception 'Establecimiento no encontrado';
  end if;

  -- La misma guarda que el resto de lecturas del restaurante: miembro del
  -- espacio, del grupo, o del propio restaurante. Un restaurante de otro
  -- espacio no pasa de aquí.
  if not public.can_read_establishment(p_establishment_id) then
    raise exception 'No tienes acceso a este restaurante';
  end if;

  select s.timezone
    into v_timezone
    from public.establishments e
    join public.spaces s on s.id = e.space_id
   where e.id = p_establishment_id;

  return v_timezone;
end;
$$;

comment on function public.establishment_timezone(uuid) is
  'La zona horaria del espacio al que pertenece un restaurante, y nada
   más de `spaces` (P7). Para las pantallas del restaurante, que no
   pueden leer esa tabla y tienen que pintar las fechas en la zona del
   espacio (CLAUDE.md). Comprueba `can_read_establishment()`.';

revoke all on function public.establishment_timezone(uuid) from public, anon;
grant execute on function public.establishment_timezone(uuid) to authenticated;
