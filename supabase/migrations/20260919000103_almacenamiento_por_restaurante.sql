-- ============================================================
-- Migración 103 · Cuánto ocupa un restaurante (RN-ARC-10, decisión 48)
-- ============================================================
--
-- El diseño definitivo móvil (página 50) enseña, en los archivos del
-- restaurante, "Almacenamiento (Magariños) 6,4 GB". Hoy el almacenamiento
-- es **del espacio** (RN-SUB-13, migración 95): se mide, se avisa al 80 %
-- y al 100 %, y pasarse se presupuesta aparte. Eso **no cambia**.
--
-- Lo que esta migración añade es un dato informativo: cuánto de ese total
-- es de este restaurante.
--
-- **Por qué una función y no un `select` en la pantalla.** La RLS de
-- `files` enseña a cada quien lo suyo: el propietario y los
-- administradores ven todo el espacio, un trabajador solo los archivos
-- operativos de sus establecimientos y **nunca** la facturación
-- (RN-ARC-05), y el cliente solo lo compartido. Una suma hecha desde la
-- pantalla saldría filtrada por quien mira, así que el trabajador vería un
-- número más pequeño **llamándolo "lo que ocupa el restaurante"**: una
-- cifra falsa dicha con seguridad, que es peor que no dar ninguna.
--
-- Lo que impide eso es **el guarda**: solo llega a la suma quien puede ver
-- todos los archivos del establecimiento. A quien no, se le devuelve
-- `null` y la pantalla dice el motivo, en vez de pintar un cero
-- (CLAUDE.md MUST NOT: nada de datos de relleno).
--
-- **El `security definer` es cinturón además de tirantes, y conviene saber
-- que hoy no se nota.** Con este guarda, quien llega a la suma ve todos
-- esos archivos igualmente, así que `invoker` daría el mismo número: la
-- suite 53 lo comprobó cambiándolo y no se puso roja. Se deja `definer`
-- porque el día que el guarda se ablande —por ejemplo para que un
-- trabajador vea el dato de sus restaurantes— `invoker` empezaría a
-- devolver sumas parciales **en silencio**, y eso es justo el fallo que
-- esta función existe para no tener. Que siga siendo `definer` lo sujeta
-- un test de la suite, no la buena voluntad de quien la edite.

create or replace function public.establishment_storage_bytes(p_establishment_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select space_id into v_space_id
  from public.establishments where id = p_establishment_id;

  if v_space_id is null then
    return null;
  end if;

  -- El mismo umbral con el que `can_read_file()` deja ver TODO el espacio.
  -- Si aquí se pusiera `is_space_member()`, un trabajador recibiría la
  -- suma de la facturación que RN-ARC-05 le prohíbe ver: no el detalle,
  -- pero sí su tamaño, y de ahí se deduce más de lo que parece.
  if not public.has_capability(v_space_id, 'manage_requests') then
    return null;
  end if;

  return (
    select coalesce(sum(fv.size_bytes), 0)::bigint
    from public.file_versions fv
    join public.files f on f.id = fv.file_id
    where f.establishment_id = p_establishment_id
  );
end;
$$;

comment on function public.establishment_storage_bytes(uuid) is
  'RN-ARC-10 · cuánto ocupan los archivos de un restaurante, entero y sin
   filtrar por quien mira. Devuelve null a quien no puede ver todos los
   archivos del establecimiento: una suma parcial llamada "lo que ocupa el
   restaurante" sería una cifra falsa. NO es una cuota: el límite es del
   espacio (RN-SUB-13) y esto no lo cambia.';

-- Aparece en pantalla por RPC, así que `authenticated` la ejecuta; la
-- función comprueba el permiso por su cuenta antes de sumar nada.
revoke all on function public.establishment_storage_bytes(uuid) from public, anon;
grant execute on function public.establishment_storage_bytes(uuid) to authenticated;
