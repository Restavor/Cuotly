-- ============================================================
-- RN-EST-18 · La foto del restaurante (decisión 62)
-- ============================================================
--
-- El diseño definitivo móvil enseña la foto del local en **cuatro**
-- pantallas —el Inicio del espacio, la lista de Restaurantes, la ficha y
-- Gestión— y no existía ninguna columna de imagen. Las cuatro se
-- construyeron sin ella, diciendo por qué, en vez de copiar la foto de
-- archivo del PDF.
--
-- Bosco, el 21/09/2026: **una foto por restaurante**, que puede subir el
-- equipo o el cliente, y la ven los dos.
--
-- ------------------------------------------------------------
-- Dónde vive, y por qué ahí
-- ------------------------------------------------------------
--
-- **En `files`, los archivos del espacio.** Un restaurante es de un
-- espacio, así que `files.space_id not null` le sirve — a diferencia de
-- la foto de perfil de una persona, que no es de ningún espacio y por eso
-- necesitó bucket propio (migración 109). Vivir en `files` le da gratis
-- tres cosas que una columna suelta no tendría:
--
--   · **Versiones** (RN-ARC-03). Sustituir la foto no borra la anterior,
--     que es lo que RN-EST-18 pide y lo que CLAUDE.md exige de cualquier
--     registro de negocio: se archiva, no se borra.
--   · El **bucket privado** y su enlace firmado (RN-ARC-08). No hay URL
--     pública de la foto de un local ajeno.
--   · El **almacenamiento** ya contado por restaurante (RN-ARC-10): una
--     foto ocupa, y ocupa donde se ve.
--
-- **Y una columna en `establishments` que apunta a ella.** Aquí sí, y no
-- como el responsable (migración 119): una foto **no es identidad del
-- equipo**. Es la cara del propio restaurante y RN-EST-18 dice que la ven
-- los dos lados, así que que el cliente lea este identificador en su
-- ficha no filtra nada (P7 intacto). `establishments` no tiene privilegios
-- por columna —su `select` es de tabla entera—, así que la columna nueva
-- nace legible para quien ya puede leer la fila, sin `grant` adicional.
--
-- **Por qué una columna y no "el último archivo de categoría fotos"**:
-- porque entonces subir una fotografía cualquiera de un trabajo cambiaría
-- la cara del restaurante sin que nadie lo decidiera. La foto es una
-- elección, y una elección se guarda.

alter table public.establishments
  add column photo_file_id uuid references public.files(id) on delete set null;

comment on column public.establishments.photo_file_id is
  'RN-EST-18 · la foto que identifica al local, elegida entre los archivos
   del restaurante. Nula: no tiene, que es un estado normal y se enseña sin
   foto, nunca con un hueco esperándola.';

-- ------------------------------------------------------------
-- Elegirla y quitarla
-- ------------------------------------------------------------
--
-- Una sola función para las dos cosas: `p_file_id` nulo **quita** la foto.
-- Quitarla no borra el archivo — sigue en sus archivos, con sus versiones:
-- deja de ser la que identifica al local, que es otra cosa.
create or replace function public.set_establishment_photo(
  p_establishment_id uuid,
  p_file_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
  v_anterior uuid;
  v_establecimiento uuid;
  v_archivada timestamptz;
  v_visibilidad text;
  v_mime text;
begin
  select e.space_id, e.photo_file_id into v_space, v_anterior
  from public.establishments e
  where e.id = p_establishment_id
  for update;

  if v_space is null then
    raise exception 'El restaurante no existe';
  end if;

  -- **La misma puerta que editar los datos** (RN-EST-11), no una nueva:
  -- el equipo con `manage_clients`, y el cliente con su permiso de editar
  -- los datos de su restaurante. RN-EST-18 dice que la suben los dos.
  --
  -- Subir el archivo es otra operación y pide otro permiso —`upload_files`,
  -- que comprueba `can_write_file()`—. Son dos cosas distintas a propósito:
  -- quien puede meter archivos no decide por eso la cara del local.
  if not (
    public.has_capability(v_space, 'manage_clients')
    or public.client_can_edit_establishment_data(p_establishment_id)
  ) then
    raise exception 'No tienes permiso para cambiar la foto de este restaurante';
  end if;

  if v_anterior is not distinct from p_file_id then
    -- Nada cambió: ni un apunte de auditoría que diga lo contrario.
    return;
  end if;

  if p_file_id is not null then
    select f.establishment_id, f.archived_at, f.visibility
    into v_establecimiento, v_archivada, v_visibilidad
    from public.files f
    where f.id = p_file_id;

    if not found then
      raise exception 'El archivo no existe';
    end if;

    -- **Tiene que ser un archivo de ESTE restaurante.** Sin esto, un id
    -- pegado a mano pondría de cara de un local un archivo de otro, y el
    -- enlace firmado lo serviría sin rechistar: la foto se lee por su
    -- identificador, no por quién la pidió.
    if v_establecimiento is distinct from p_establishment_id then
      raise exception 'El archivo no es de este restaurante';
    end if;

    -- Un archivo archivado no puede ser la cara de nadie (RN-ARC).
    if v_archivada is not null then
      raise exception 'Ese archivo está archivado';
    end if;

    -- RN-EST-18 · la ven los dos lados. Un archivo interno del equipo como
    -- foto del local sería enseñarle al cliente algo marcado como no suyo.
    if v_visibilidad <> 'shared_with_client' then
      raise exception 'La foto tiene que estar compartida con el restaurante';
    end if;

    -- **Una foto es una imagen.** `files` acepta PDF, Word y hojas de
    -- cálculo, y sin esto un PDF podría acabar de cara del restaurante:
    -- la pantalla pediría un enlace firmado, lo metería en un `<img>` y
    -- enseñaría un hueco roto. Se comprueba sobre la versión vigente,
    -- que es la que se sirve.
    select v.mime_type into v_mime
    from public.file_versions v
    where v.file_id = p_file_id
    order by v.version_number desc
    limit 1;

    if v_mime is null then
      raise exception 'Ese archivo todavía no tiene contenido';
    end if;

    if v_mime not like 'image/%' then
      raise exception 'La foto del restaurante tiene que ser una imagen';
    end if;
  end if;

  update public.establishments
  set photo_file_id = p_file_id
  where id = p_establishment_id;

  -- §21.2 · quitarla es un cambio como ponerla, y se anota igual.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id,
                                old_value, new_value)
  values (v_space, auth.uid(), 'establishment.photo_set', 'establishment',
          p_establishment_id,
          jsonb_build_object('photo_file_id', v_anterior),
          jsonb_build_object('photo_file_id', p_file_id));
end;
$$;

revoke all on function public.set_establishment_photo(uuid, uuid) from public, anon;
grant execute on function public.set_establishment_photo(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- Dónde está el fichero
-- ------------------------------------------------------------
--
-- La ruta de la versión vigente, para poder firmar el enlace. Existe como
-- función y no como consulta suelta en la pantalla por una razón: la
-- pantalla tendría que ir de `establishments` a `files` y de ahí a
-- `file_versions` **enumerando columnas** en las dos, porque las dos
-- tienen privilegios de columna (CLAUDE.md), y un `select *` devolvería
-- 403. Aquí se hace una vez y bien.
--
-- ------------------------------------------------------------
-- Por qué es `SECURITY DEFINER` y qué comprueba en su lugar
-- ------------------------------------------------------------
--
-- La versión evidente era `SECURITY INVOKER` y dejar que las políticas de
-- `files` filtraran solas. **No sirve**, y el motivo se ve al mirar
-- `can_read_file()`: un trabajador solo lee archivos de los
-- establecimientos que tiene autorizados (RN-ARC-05), pero **ve todos los
-- restaurantes del espacio** en la lista (la política de `establishments`
-- es `is_space_member`). El resultado sería una lista donde la cara de
-- unos locales aparece y la de otros no, sin que nada explique la
-- diferencia — y la foto de un local no es un archivo operativo que haya
-- que racionar: es su nombre en imagen.
--
-- Así que comprueba **ver el restaurante**, que es la regla que la foto
-- debe seguir, y lo hace con la misma expresión que la política de
-- `establishments`. No abre ninguna puerta nueva: solo devuelve la ruta
-- del único archivo designado como foto, que `set_establishment_photo()`
-- obliga a estar marcado "compartido con el restaurante" — es decir, un
-- archivo que el cliente ya ve. Que lo vea además un compañero del mismo
-- espacio es estrictamente menos exposición.
create or replace function public.establishment_photo_path(p_establishment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space uuid;
  v_archivo uuid;
  v_ruta text;
begin
  select e.space_id, e.photo_file_id into v_space, v_archivo
  from public.establishments e
  where e.id = p_establishment_id;

  if v_space is null then
    return null;
  end if;

  if not (
    public.is_space_member(v_space)
    or public.can_read_establishment_as_client(p_establishment_id)
  ) then
    return null;
  end if;

  if v_archivo is null then
    return null;
  end if;

  select v.storage_path into v_ruta
  from public.files f
  join public.file_versions v on v.file_id = f.id
  where f.id = v_archivo
    and f.archived_at is null
  order by v.version_number desc
  limit 1;

  return v_ruta;
end;
$$;

revoke all on function public.establishment_photo_path(uuid) from public, anon;
grant execute on function public.establishment_photo_path(uuid) to authenticated;
