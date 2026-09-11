-- El motivo del estado era el código de la máquina, no la frase de nadie.
--
-- RN-EST-08: "en `paused` se puede consultar, pero no crear solicitudes ni
-- menús. **El motivo concreto (por ejemplo, impago) se muestra junto al
-- estado**." La función que sirve esa regla —`establishment_status_reason()`,
-- del Hito 7— leía `state_events.cause`, y esa columna no es el motivo.
--
-- Las dos columnas se añadieron juntas en la migración 25 y guardan cosas
-- distintas:
--
--   · `reason` es la **frase** que escribe quien cambia el estado
--     ("Impago de la cuota de septiembre"). La escribe
--     `record_state_event()`, que es por donde pasa `set_establishment_status()`.
--   · `cause` es el **código** del ciclo de impago (`'nonpayment'`), y solo
--     lo escribe ese ciclo.
--
-- Consecuencia, reproducida contra la base con el espacio de demostración
-- antes de tocar nada: se pausa Magariños con el motivo "Impago de la cuota
-- de septiembre" y la función devuelve NULL, porque `cause` está vacío en
-- todo cambio manual. Y en el único caso en que `cause` no está vacío —el
-- ciclo de impago— lo que habría devuelto es la cadena `nonpayment`, que es
-- un identificador de programa enseñado a un restaurante como si fuera una
-- explicación.
--
-- Así que la regla no se cumplía de ninguna de las dos maneras: ni había
-- pantalla que llamara a la función (eso lo cierra la maqueta 20), ni la
-- función devolvía el motivo.
--
-- El arreglo es leer `reason`. El ciclo de impago también lo escribe
-- ("Ciclo de impago"), así que los dos caminos devuelven una frase que se
-- puede enseñar tal cual.
--
-- Se comprueba con `supabase/tests/el_motivo_del_estado.sql`.

create or replace function public.establishment_status_reason(p_establishment_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select se.reason
  from public.state_events se
  where se.entity_type = 'establishment'
    and se.entity_id = p_establishment_id
    and (public.can_read_establishment(p_establishment_id))
  order by se.occurred_at desc
  limit 1;
$$;

comment on function public.establishment_status_reason(uuid) is
  'RN-EST-08 · el motivo concreto del último cambio de estado, para
   enseñarlo junto al estado. Devuelve `reason` (la frase que escribió
   quien lo cambió), NO `cause` (el código del ciclo de impago): un
   identificador de programa no es una explicación para un restaurante.';
