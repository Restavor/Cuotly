-- Un trabajo que ya se está haciendo no se mueve de sitio.
--
-- Decisión de Bosco (12/09/2026), literal: "solo los premium podrán
-- ordenar sus tareas. Eso sí importante, si un trabajo ya se está haciendo
-- no se puede mover, no se puede reordenar".
--
-- La primera mitad ya era así desde la migración 62 y no cambia:
-- `client_can_set_priority()` exige un plan que lo conceda
-- (`plans.grants_priority`, que en el espacio de Restavor tiene Premium).
-- Lo que cambia es la segunda.
--
-- **Qué sale del conjunto ordenable: `in_progress`.** Es el estado que
-- tiene la solicitud cuando su trabajo ya arrancó — alguien del equipo le
-- dio a Comenzar, el contador T3 corre y hay horas metidas dentro.
-- Ordenarlo no adelanta nada y, peor, promete algo que no se va a cumplir:
-- lo que está en marcha no se detiene para empezar otra cosa antes.
--
-- **Qué NO sale: `accepted`.** Un cambio aceptado tiene trabajo creado
-- pero todavía no comenzado, y ése es justo el momento en que el orden del
-- restaurante sirve para algo: decide cuál de los aceptados se coge
-- primero. "Ya se está haciendo" es comenzar, no aceptar.
--
-- **Lo que esto arrastra solo.** `compact_request_priority_order()`
-- (migración 64) se apoya en esta misma función, así que en cuanto una
-- solicitud pasa a `in_progress` suelta su puesto y las que quedan se
-- compactan a 1..k conservando el orden relativo. No hay que tocar el
-- disparador: había un único sitio donde estaba escrito qué se ordena, y
-- es éste. Lo que sí hay que hacer una vez es limpiar lo que ya estaba
-- numerado antes de esta migración, igual que hizo la 64.
--
-- Se comprueba con `supabase/tests/prioridad_del_restaurante.sql` y
-- `supabase/tests/la_prioridad_mueve_la_cola.sql`.

create or replace function public.request_is_rankable(p_state text)
returns boolean
language sql
immutable
as $$
  select p_state in (
    'received', 'analyzing', 'needs_information',
    'pending_internal_validation', 'pending_client_acceptance',
    'accepted'
  );
$$;

comment on function public.request_is_rankable(text) is
  'Los estados en los que un cambio se puede ordenar por importancia: lo
   pedido y todavía no comenzado. `in_progress` quedó fuera el 12/09/2026
   (decisión de Bosco): lo que ya se está haciendo no se mueve. `draft`
   nunca entró —no se prioriza lo que no se ha pedido— ni lo publicado,
   rechazado o cancelado.';

revoke all on function public.request_is_rankable(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Y las que ya estaban numeradas
-- ------------------------------------------------------------
--
-- El disparador solo actúa cuando cambia un estado. Las solicitudes que ya
-- estaban en curso con su número puesto conservan uno que esta migración
-- acaba de dejar sin significado, así que se limpia una vez y se compacta
-- lo que queda — el mismo par de sentencias de la migración 64, por el
-- mismo motivo.
update public.requests r
   set priority_rank = null
 where r.priority_rank is not null
   and not public.request_is_rankable(r.state);

with pendientes as (
  select r.id,
         row_number() over (
           partition by r.establishment_id
           order by r.priority_rank, r.created_at, r.id
         ) as posicion
  from public.requests r
  where r.priority_rank is not null
    and public.request_is_rankable(r.state)
)
update public.requests r
   set priority_rank = pendientes.posicion
  from pendientes
 where r.id = pendientes.id
   and r.priority_rank is distinct from pendientes.posicion;
