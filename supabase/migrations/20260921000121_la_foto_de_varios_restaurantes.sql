-- ============================================================
-- RN-EST-18 · La foto de varios restaurantes de una vez
-- ============================================================
--
-- La migración 120 dejó `establishment_photo_path(uuid)`, que sirve para
-- la ficha de un restaurante. Al montar las pantallas se vio que **las dos
-- que más la usan son listas**: el "Estado por restaurante" del Inicio
-- (página 22) y la lista de Restaurantes (página 23), y esta última no
-- pagina — carga todos los del espacio. Una llamada por fila serían
-- cincuenta viajes a la base de datos para pintar cincuenta caras.
--
-- Así que la versión de lista, y la de uno pasa a ser una envoltura de
-- ella: la regla de quién ve qué foto se escribe **una vez**. Que dos
-- funciones decidan lo mismo por separado es cómo empiezan a decidirlo
-- distinto.
--
-- Lo que devuelve: una fila **por restaurante que tiene foto visible**.
-- Los que no tienen, o los que quien pregunta no puede ver, sencillamente
-- no salen — y la pantalla los pinta sin foto, que es lo que RN-EST-18
-- pide para un restaurante sin ninguna: sin foto, no un marco esperándola.

create or replace function public.establishment_photo_paths(
  p_establishment_ids uuid[]
)
returns table (establishment_id uuid, storage_path text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, v.storage_path
  from public.establishments e
  join public.files f
    on f.id = e.photo_file_id
   and f.archived_at is null
  join lateral (
    select fv.storage_path
    from public.file_versions fv
    where fv.file_id = f.id
    order by fv.version_number desc
    limit 1
  ) v on true
  where e.id = any(p_establishment_ids)
    -- La misma puerta que la de uno: **ver el restaurante**, no leer sus
    -- archivos. El porqué está en la cabecera de la migración 120.
    and (
      public.is_space_member(e.space_id)
      or public.can_read_establishment_as_client(e.id)
    );
$$;

revoke all on function public.establishment_photo_paths(uuid[]) from public, anon;
grant execute on function public.establishment_photo_paths(uuid[]) to authenticated;

-- Y la de uno, ahora envoltura: mismo contrato que en la 120 —la ruta, o
-- nulo— pero una sola implementación de la regla debajo.
create or replace function public.establishment_photo_path(p_establishment_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.storage_path
  from public.establishment_photo_paths(array[p_establishment_id]) p
  limit 1;
$$;

revoke all on function public.establishment_photo_path(uuid) from public, anon;
grant execute on function public.establishment_photo_path(uuid) to authenticated;
