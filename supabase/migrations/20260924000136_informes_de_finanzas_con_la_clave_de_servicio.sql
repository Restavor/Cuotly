-- ============================================================
-- Migración 136 · las cifras de finanzas de los informes, con la clave
-- de servicio
-- ============================================================
--
-- El fallo. `report_finance_dataset()` (migración 85) suma los cobros del
-- espacio llamando a `charge_collected_cents()`, `charge_outstanding_cents()`
-- y `charge_status()`. Las tres comprueban desde la migración 26 que quien
-- pregunta tiene visibilidad financiera del restaurante
-- (`can_read_establishment_finance()`), y lanzan una excepción si no.
--
-- Pero `report_finance_dataset()` está reservada a `service_role`: la llaman
-- la pestaña Finanzas de Informes (`informes/dashboard-load.ts`) y la
-- generación de informes (`services/report-generation.ts`) con la clave de
-- servicio, después de comprobar `manage_clients` con la sesión de quien
-- mira. Con esa clave no hay usuario, `auth.uid()` es nulo, la
-- comprobación da falso, y la función fallaba en cuanto el espacio tenía un
-- solo cobro en el periodo:
--
--   "No tienes visibilidad financiera de este establecimiento"
--
-- La pantalla decía "No se han podido calcular las cifras" y un informe
-- financiero no se podía generar. La suite de informes no lo vio porque
-- su espacio no tenía cobros; ahora los tiene.
--
-- El arreglo. `can_read_establishment_finance()` responde que sí a la
-- clave de servicio. No abre nada que no estuviera abierto: esa clave se
-- salta RLS en todas las tablas, solo la tiene el servidor, y quien la usa
-- ya ha comprobado el permiso con la sesión de la persona. Para cualquier
-- sesión de usuario la respuesta es la de siempre: la función sigue
-- en las políticas de `charges`, `payments` y `receipts`, que se evalúan
-- con el rol de quien consulta (`authenticated`), nunca `service_role`.
--
-- Se arregla aquí y no reescribiendo las cuentas dentro de
-- `report_finance_dataset()`: duplicar cómo se calcula lo cobrado o si un
-- cobro está vencido es la forma de que el informe y la pantalla de
-- Finanzas acaben diciendo cifras distintas del mismo mes.

create or replace function public.can_read_establishment_finance(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') = 'service_role'
    or public.can_read_billing(p_establishment_id)
    or public.is_authorized_worker_establishment(p_establishment_id);
$$;

comment on function public.can_read_establishment_finance(uuid) is
  'RN-FIN-07 · si quien pregunta puede ver las finanzas de un restaurante:
   quien ve su facturación o el trabajador autorizado en él. La clave de
   servicio también (migración 136): la usan los informes después de
   comprobar el permiso con la sesión de la persona.';
