-- Compartir con el restaurante (RN-ARC-04), la mitad que faltaba.
--
-- La regla dice dos cosas: que cada archivo está marcado **Interno** o
-- **Compartido con el restaurante**, y que "un trabajador puede compartir
-- después uno interno, y queda auditado". Lo primero lo hace
-- `register_file()` desde el Hito 7; lo segundo lo hace
-- `share_file_with_client()`, que existe desde entonces con su capacidad
-- (`manage_files`), su idempotencia y su apunte en `audit_log` — y que
-- **no la llamaba ninguna pantalla**. Es el mismo patrón que ya han
-- destapado la migración 47 con las tareas, la 48 con los planes y la 50
-- con las conversaciones: una función del servidor no está terminada
-- hasta que algo la usa.
--
-- Esta migración no añade lógica: la lógica ya estaba y está probada en
-- `hito7_mensajes_archivos_finanzas.sql`. Lo que hace es cerrar la puerta
-- que se abrió sola al crearla.
--
-- **Las siete funciones que ESCRIBEN archivos están abiertas a `anon`.**
-- Un proyecto de Supabase concede `EXECUTE` por defecto a `anon` y
-- `authenticated` sobre toda función nueva (CLAUDE.md), y el Hito 7 no
-- revocó ninguna de estas siete. No son explotables —las siete
-- comprueban el permiso por su cuenta y sin sesión `auth.uid()` es null,
-- así que `has_capability()` y `can_write_file()` dicen que no—, pero
-- siete funciones de escritura accesibles por RPC sin haber iniciado
-- sesión son superficie que no hace falta. Es exactamente lo que la
-- migración 51 encontró con `convert_conversation_to_request()` y cerró
-- de la misma manera.
--
-- Comprobado en vivo antes de escribirla, sobre un PostgreSQL 16 con las
-- 55 migraciones aplicadas: las siete devolvían `t` para
-- `has_function_privilege('anon', ..., 'execute')`.
--
-- Lo que NO se toca, y conviene decir por qué: `can_read_file()` y
-- `can_write_file()` aparecen dentro de las políticas de RLS de `files`,
-- `file_versions` y `file_links`. PostgreSQL evalúa esas expresiones con
-- los privilegios de **quien consulta**, así que quitarles el `EXECUTE`
-- de `authenticated` no las cerraría: rompería las tres políticas y las
-- tablas empezarían a devolver `permission denied for function`
-- (CLAUDE.md, excepción documentada en la migración 20260830000032).
--
-- Se comprueba con `supabase/tests/compartir_con_el_restaurante.sql`.

revoke all on function public.share_file_with_client(uuid) from public, anon;
grant execute on function public.share_file_with_client(uuid) to authenticated;

revoke all on function public.register_file(uuid, text, text, text, text, text, bigint, text, text, text) from public, anon;
grant execute on function public.register_file(uuid, text, text, text, text, text, bigint, text, text, text) to authenticated;

revoke all on function public.add_file_version(uuid, text, text, text, bigint, text, text) from public, anon;
grant execute on function public.add_file_version(uuid, text, text, text, bigint, text, text) to authenticated;

revoke all on function public.archive_file(uuid, text) from public, anon;
grant execute on function public.archive_file(uuid, text) to authenticated;

revoke all on function public.request_file_permanent_deletion(uuid, text) from public, anon;
grant execute on function public.request_file_permanent_deletion(uuid, text) to authenticated;

revoke all on function public.attach_file_to_message(uuid, uuid) from public, anon;
grant execute on function public.attach_file_to_message(uuid, uuid) to authenticated;

revoke all on function public.upload_payment_receipt(uuid, uuid, text) from public, anon;
grant execute on function public.upload_payment_receipt(uuid, uuid, text) to authenticated;

comment on function public.share_file_with_client(uuid) is
  'RN-ARC-04 · "un trabajador puede compartir después uno interno, y queda
   auditado". Solo de ida: no existe la operación contraria, porque la
   regla no la tiene y desandar lo compartido no es lo mismo que no
   haberlo compartido — el restaurante ya lo ha visto. Idempotente
   (compartir dos veces no escribe dos apuntes) y con la capacidad
   `manage_files` más `can_read_file()`, que es lo que deja fuera al
   trabajador para la facturación (RN-ARC-05).';
