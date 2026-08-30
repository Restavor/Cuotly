-- Corrige un hallazgo introducido por la propia migración anterior
-- (20260830000018): can_write_establishment_as(uuid, uuid) se creó sin
-- ningún REVOKE, así que quedó con el EXECUTE por defecto de PostgreSQL
-- abierto a PUBLIC — a diferencia de can_write_establishment(uuid), que
-- solo responde sobre auth.uid() (autoconsulta), esta toma un p_actor_id
-- arbitrario como parámetro. Cualquier `authenticated` podía llamarla
-- directamente por RPC con cualquier par (establishment_id, actor_id) y
-- usarla como oráculo de membresía: sin poder leer ni escribir ningún
-- dato de negocio, revelaba igualmente si un usuario cualquiera tiene rol
-- de escritura sobre un establecimiento de un espacio con el que quien
-- pregunta no tiene ninguna relación — un canal de enumeración cruzada
-- entre tenants (descubierto y verificado contra una base de datos real
-- en la revisión adversarial posterior a 20260830000018).
--
-- Único uso en todo el repositorio: record_classification() (migración
-- 20260830000018), que ya es service_role-only. No hay ninguna razón
-- funcional para que quede abierta al cliente — mismo arreglo que ya se
-- aplicó ahí.

revoke all on function public.can_write_establishment_as(uuid, uuid) from public;
grant execute on function public.can_write_establishment_as(uuid, uuid) to service_role;

comment on function public.can_write_establishment_as(uuid, uuid) is
  'Solo service_role puede ejecutarla (ver REVOKE/GRANT en
   20260830000019) — a diferencia de can_write_establishment(uuid), que
   solo se autoconsulta sobre auth.uid(), esta recibe un actor arbitrario
   como parámetro y sin restringir su ejecución era un oráculo de
   membresía entre tenants para cualquier usuario autenticado. Solo la usa
   record_classification(), ya restringida al mismo rol.';
