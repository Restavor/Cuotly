-- ============================================================
-- Migración 109 · La foto de perfil (RN-GLO-09, decisión 53)
-- ============================================================
--
-- Punto 8 y último del orden acordado para el diseño definitivo móvil. La
-- página 7 ("Mi cuenta") dibuja un botón **"Cambiar foto"**; hasta hoy no
-- existía, y la pantalla decía por qué en vez de dejar un hueco.
--
-- **Por qué no cabía en `files`.** `files.space_id` es `NOT NULL` y una
-- cara no es de ningún espacio: la misma persona puede estar en dos
-- espacios y en el panel de un restaurante, y su cara no pertenece a
-- ninguno de los tres. Así que tiene sitio propio.
--
-- **La parte delicada es quién la ve, no dónde se guarda.** Una foto es
-- identidad, y CLAUDE.md prohíbe que el cliente vea la identidad
-- individual de nadie del equipo de mantenimiento. La respuesta es no
-- escribir ninguna regla nueva: `avatar_path` es una columna de
-- `profiles`, y `profiles_select` ya dice lo que hay que decir —tu fila, o
-- la de alguien con quien compartes `space_memberships`—. Un cliente no
-- está en esa tabla, así que no lee la fila de nadie del equipo, foto
-- incluida. Una regla nueva aquí sería una segunda copia de la política, y
-- el día que discreparan ganaría la copia peor.
--
-- Esa es también la razón de que la foto NO se añada a
-- `establishment_client_users()` ni a `establishment_panel_users()`: son
-- `SECURITY DEFINER` y se saltan `profiles_select` a propósito, para que
-- el equipo vea el nombre de un cliente. Meter la foto ahí abriría por esa
-- puerta justo lo que la política cierra.

-- ------------------------------------------------------------
-- 1 · El bucket
-- ------------------------------------------------------------
--
-- Privado, como el de archivos (RN-ARC-08): no hay URL pública de ninguna
-- foto. Se firma una cada vez, con caducidad corta, desde el servidor.
--
-- El tamaño y la lista de formatos son **técnicos**, no una regla de
-- producto que nadie haya decidido: 2 MB y solo imágenes. Se declaran aquí
-- y no solo en el navegador porque una URL firmada autoriza una ruta, no
-- un tamaño: sin esto, quien tuviera una podía dejar 25 MB de PDF ahí.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Igual que la migración 45: `storage.objects` se queda con RLS activado y
-- **cero políticas**, que en PostgreSQL significa "nadie". Las dos puertas
-- son el `service_role` —desde el servidor— y las URLs firmadas. Que RLS
-- siga activado no se da por hecho: si alguien lo desactivara, los GRANT
-- de fábrica de Supabase dejarían la tabla abierta a cualquiera con
-- sesión.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'storage.objects tiene RLS desactivado: el bucket privado no protegería nada. Actívalo desde el panel de Supabase antes de seguir.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2 · Dónde está la foto de cada quien
-- ------------------------------------------------------------
alter table public.profiles
  add column avatar_path text;

comment on column public.profiles.avatar_path is
  'RN-GLO-09 · la ruta de su foto dentro del bucket privado `avatars`,
   siempre `<uuid de la persona>/<archivo>`. Quién puede leerla lo decide
   `profiles_select` y nada más: un cliente no comparte `space_memberships`
   con el equipo, así que no ve su foto (CLAUDE.md).';

-- ------------------------------------------------------------
-- 3 · Cambiarla y quitarla
-- ------------------------------------------------------------
--
-- **La comprobación que importa es la del prefijo.** Sin ella, mandar la
-- ruta de otra persona sería ponerle a esa persona la foto que uno
-- quisiera: la función escribe la fila de quien llama, sí, pero apuntando
-- a un objeto ajeno. Con el prefijo, la ruta que una persona puede guardar
-- es siempre una que solo ella ha podido subir.
--
-- No deja apunte de auditoría, y es deliberado: `audit_log` es de un
-- espacio (`space_id NOT NULL`) y un perfil no es de ninguno. Es la misma
-- razón por la que `set_my_profile()` tampoco lo deja.
create or replace function public.set_my_avatar(p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar en Cuotly para cambiar tu foto';
  end if;

  if v_path is null then
    raise exception 'Falta la ruta de la foto';
  end if;

  -- RN-GLO-09 · la foto de uno vive bajo su propio uuid. Se comprueba con
  -- la barra dentro: sin ella, el uuid de alguien sería prefijo de
  -- cualquier ruta que empezara por esas letras.
  if v_path not like (auth.uid()::text || '/%') then
    raise exception 'Una foto de perfil se guarda bajo la carpeta de su dueño';
  end if;

  update public.profiles set avatar_path = v_path where id = auth.uid();
end;
$$;

comment on function public.set_my_avatar(text) is
  'RN-GLO-09 · la persona apunta su foto. Solo la suya, y solo a una ruta
   bajo su propio uuid: mandar la de otro le pondría a esa persona la foto
   que uno quiera.';

revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

-- Quitarla es volver a la inicial, no borrar a nadie. El objeto del bucket
-- lo borra el servidor aparte; que la fila deje de apuntarlo es lo que
-- hace que nadie la vea, y es lo que tiene que ser inmediato.
create or replace function public.clear_my_avatar()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar en Cuotly para quitar tu foto';
  end if;

  update public.profiles set avatar_path = null where id = auth.uid();
end;
$$;

comment on function public.clear_my_avatar() is
  'RN-GLO-09 · la persona quita su foto y vuelve a su inicial.';

revoke all on function public.clear_my_avatar() from public, anon;
grant execute on function public.clear_my_avatar() to authenticated;
