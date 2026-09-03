-- ============================================================
-- El bucket de archivos (PRD §19 RN-ARC).
--
-- Hasta hoy el catálogo de archivos existía entero —`files`,
-- `file_versions`, `file_links`, `register_file()`, `can_read_file()`,
-- `attach_file_to_message()`, `upload_payment_receipt()`— y no había
-- ningún sitio donde poner los bytes. Toda la interfaz de archivos estaba
-- parada por esto.
--
-- Tres decisiones que conviene dejar escritas, porque no se ven en el
-- código de la aplicación:
--
-- 1. **El bucket es privado.** RN-ARC-08 pide "enlaces privados y
--    temporales para la descarga", así que no hay URL pública de ningún
--    archivo: se firma una cada vez, con caducidad corta, después de
--    comprobar `can_read_file()`. Un bucket público habría hecho
--    irrelevantes RN-ARC-04 (interno / compartido) y RN-ARC-05 (la
--    facturación nunca la ve un trabajador): quien tuviera la URL vería
--    el archivo.
--
-- 2. **`storage.objects` se queda SIN NINGUNA POLÍTICA, a propósito.**
--    Tiene RLS activado y cero políticas, que en PostgreSQL significa
--    "nadie", así que ni `anon` ni `authenticated` pueden leer, escribir
--    ni borrar un objeto aunque tengan los GRANT de tabla que Supabase
--    concede de fábrica. Las dos únicas puertas son el `service_role`
--    —sólo desde el servidor de la aplicación— y las URLs firmadas, que
--    autorizan por sí mismas una ruta concreta y las emite el servidor
--    tras comprobar el permiso.
--
--    Esto es deliberado y es lo contrario de lo que suele hacerse
--    (replicar las reglas de negocio en políticas sobre el nombre del
--    objeto). Las reglas de quién puede subir y quién puede ver ya están
--    escritas una vez, en `can_write_file()` y `can_read_file()`, con los
--    casos de RN-ARC-04, RN-ARC-05 y RN-FIN-07 dentro. Escribirlas otra
--    vez parseando `storage.objects.name` sería tenerlas en dos sitios,
--    y el día que discreparan ganaría la copia peor.
--
-- 3. **El límite de tamaño y la lista blanca se declaran también aquí.**
--    Ya están en `src/core/files.ts` (cortesía para el navegador) y en el
--    CHECK de `file_versions` (la fila). Faltaba el objeto: sin esto,
--    alguien con una URL firmada podía dejar 300 MB de vídeo en el bucket
--    y limitarse a no registrarlo. Storage rechaza la subida ahora.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'files',
  'files',
  false,
  -- RN-ARC-06: máximo 25 MB por archivo. El mismo número que
  -- MAX_FILE_SIZE_BYTES y que el CHECK de file_versions.size_bytes.
  26214400,
  -- RN-ARC-06 / RN-MSG-09: imágenes, PDF, Word, Excel y texto. Ni vídeos
  -- ni ejecutables. Lista blanca, no lista negra: lo que no está, no
  -- entra. Misma lista que src/core/files.ts y que el CHECK de
  -- file_versions.mime_type.
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Que RLS siga activado no es una suposición: si alguien lo desactivara,
-- los GRANT de fábrica de Supabase dejarían `storage.objects` abierto de
-- par en par a cualquiera con sesión. No se puede activar desde aquí
-- —esa tabla es de Supabase y la migración no es su dueña—, así que se
-- comprueba y se para si no lo está, en vez de darlo por hecho.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'storage.objects tiene RLS desactivado: el bucket privado no protegería nada. Actívalo desde el panel de Supabase antes de seguir.';
  end if;

  if exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass) then
    raise warning 'storage.objects tiene políticas: esta migración las da por inexistentes (ver punto 2 de la cabecera). Reviselas.';
  end if;
end $$;
