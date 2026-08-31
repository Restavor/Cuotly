-- Corrige un fallo de seguridad real detectado al aplicar por primera vez
-- las migraciones de los Hitos 3 a 6 contra el proyecto real de Supabase
-- (30/08/2026). Es exactamente el riesgo que la auditoría del Hito 5 dejó
-- anotado como hallazgo F4 "no verificable sin una Supabase real".
--
-- El problema: todas las funciones internas de este repositorio se
-- protegían con `revoke all on function ... from public`. Eso basta en un
-- PostgreSQL desnudo, donde el único permiso de una función recién creada
-- es el EXECUTE implícito a PUBLIC. Pero un proyecto de Supabase trae
-- configurado `alter default privileges ... grant execute on functions to
-- anon, authenticated, service_role`: además del permiso a PUBLIC, cada
-- función nueva nace con una concesión EXPLÍCITA a esos tres roles, y
-- revocar solo a PUBLIC no la toca.
--
-- Verificado en vivo antes de este arreglo, con
-- has_function_privilege('authenticated', ...): las nueve funciones de
-- abajo devolvían `true` para `authenticated` Y para `anon`, es decir,
-- eran invocables por RPC (`/rest/v1/rpc/<nombre>`) por cualquiera, con
-- sesión o sin ella. Entre otras cosas eso permitía:
--   · record_classification()  — falsear qué propuso la IA y facturar a
--     Restavor un consumo que nunca ocurrió (el hallazgo 1 del Hito 4,
--     que se creía corregido desde 20260830000018).
--   · apply_job_assignment()   — asignar cualquier trabajo a cualquier
--     persona, sin ninguna comprobación de permiso (no la hace: asume que
--     ya la hizo quien la llama).
--   · record_state_event()     — escribir filas arbitrarias en el libro
--     inmutable de cambios de estado.
--   · can_write_establishment_as(), is_authorized_for_establishment(),
--     member_can_perform_jobs(), worker_active_load_points(),
--     job_candidate_ids() — oráculos de pertenencia y de carga entre
--     espacios ajenos (RN-ASG-17, CA-02).
-- get_or_create_consumption_cycle() era la única que aguantaba, gracias a
-- la comprobación interna que le añadió 20260830000021 (arreglo F4) — la
-- defensa en profundidad hizo justo su trabajo.
--
-- El arreglo: revocar también de `anon` y `authenticated` explícitamente.
-- Se mantiene el grant a `service_role` donde el diseño lo exige.
--
-- Regla para el futuro: en este proyecto, una función interna se protege
-- con `revoke all on function ... from public, anon, authenticated`, nunca
-- solo `from public`.

-- Internas puras: solo las invocan otras funciones SECURITY DEFINER del
-- mismo propietario, que no necesitan permiso del llamante.
revoke all on function public.record_state_event(uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.apply_job_assignment(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.job_candidate_ids(uuid) from public, anon, authenticated;
revoke all on function public.member_can_perform_jobs(uuid, uuid) from public, anon, authenticated;
revoke all on function public.worker_active_load_points(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_authorized_for_establishment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_or_create_consumption_cycle(uuid) from public, anon, authenticated;

-- Solo service_role: las llama el código de servidor con la clave de
-- servicio, nunca el navegador (ver 20260830000018 y 20260830000019).
revoke all on function public.record_classification(uuid, uuid, text, text, text, text[], text, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.record_classification(uuid, uuid, text, text, text, text[], text, integer, integer, integer, text) to service_role;

revoke all on function public.can_write_establishment_as(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_write_establishment_as(uuid, uuid) to service_role;
