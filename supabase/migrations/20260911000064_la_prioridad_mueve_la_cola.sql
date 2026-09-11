-- El orden que pone el restaurante mueve la cola del equipo.
--
-- Encargo de Bosco (11/09/2026) sobre el punto que quedó abierto al
-- implementar la prioridad: hasta ahora el orden del restaurante se
-- guardaba y se enseñaba en la ficha del trabajo, pero el equipo seguía
-- viendo su bandeja por fecha. Es decir, el cliente ordenaba y no pasaba
-- nada. Esto lo cierra.
--
-- **Lo que hace falta en la base de datos para que eso sea honesto.**
-- Nada del orden en sí: ordenar la bandeja es de la aplicación, y ahí lo
-- hace `orderTeamJobs()` en `src/core/priority.ts`, con sus tests. Lo que
-- hace falta aquí es que `priority_rank` signifique de verdad "el puesto
-- que ocupa ahora entre los cambios pendientes". Hoy no lo significa:
--
--   · `set_request_priority_order()` escribe 1..N sobre los cambios
--     pendientes, pero cuando uno se publica **se queda con su número**.
--     Un cambio publicado con `priority_rank = 1` no molestaba mientras
--     nadie ordenaba por esa columna; en cuanto la bandeja ordena por
--     ella, un trabajo terminado se sube al primer puesto de la lista y
--     empuja hacia abajo lo que sí hay que hacer.
--   · Y al salir el 2 de cinco, los que quedan son 1, 3, 4 y 5. El orden
--     sigue siendo un orden —no hay empates—, pero el "Nº 3 de sus
--     cambios pendientes" de la ficha pasa a ser mentira: son cuatro y él
--     es el segundo.
--
-- Las dos se arreglan con lo mismo: cuando una solicitud sale del conjunto
-- ordenable, suelta su puesto y las que quedan se compactan a 1..k
-- **conservando el orden relativo** que les dio el cliente. Es el servidor
-- quien lo hace, en la misma transacción que el cambio de estado, y no la
-- pantalla (CLAUDE.md: los estados derivados se calculan en el servidor).
--
-- **Por qué no genera apunte de auditoría.** Compactar no es la decisión
-- de nadie: es la consecuencia aritmética de un cambio de estado que ya
-- queda auditado por su lado. Lo que sí se audita es cada vez que el
-- restaurante ordena (`request.priority_set`), porque eso sí lo decide
-- alguien. Un apunte automático por cada publicación enterraría los que
-- importan.
--
-- Se comprueba con `supabase/tests/la_prioridad_mueve_la_cola.sql`.

-- ------------------------------------------------------------
-- 1 · Compactar el orden del restaurante
-- ------------------------------------------------------------
create or replace function public.compact_request_priority_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- La que acaba de salir suelta su puesto. Se comprueba el estado NUEVO,
  -- no el viejo: el disparador salta en cualquier cambio de estado, y de
  -- `received` a `analyzing` no hay nada que soltar.
  if not public.request_is_rankable(new.state) then
    update public.requests
       set priority_rank = null
     where id = new.id
       and priority_rank is not null;
  end if;

  -- Y las que quedan se compactan a 1..k. `order by priority_rank` es lo
  -- que conserva la decisión del cliente: si él puso A, B, C y sale B, el
  -- resultado es A, C — nunca C, A. `created_at` solo desempata lo que no
  -- puede empatar (dos rangos iguales son imposibles por construcción),
  -- y está ahí para que el resultado sea reproducible pase lo que pase.
  with pendientes as (
    select r.id,
           row_number() over (order by r.priority_rank, r.created_at, r.id) as posicion
    from public.requests r
    where r.establishment_id = new.establishment_id
      and r.priority_rank is not null
      and public.request_is_rankable(r.state)
  )
  update public.requests r
     set priority_rank = pendientes.posicion
    from pendientes
   where r.id = pendientes.id
     and r.priority_rank is distinct from pendientes.posicion;

  return null;
end;
$$;

comment on function public.compact_request_priority_order() is
  'Mantiene `requests.priority_rank` significando "el puesto que ocupa
   ahora entre los cambios pendientes de su restaurante": la solicitud que
   sale del conjunto ordenable suelta su puesto y las que quedan se
   compactan a 1..k conservando el orden relativo que les dio el cliente.';

revoke all on function public.compact_request_priority_order() from public, anon, authenticated;

-- El disparador. `when (old.state is distinct from new.state)` hace dos
-- cosas, y la segunda es la importante: además de no trabajar de balde,
-- **corta la recursión**. El `update` de dentro no toca `state`, así que
-- ni entra por `update of state` ni pasaría la condición.
drop trigger if exists requests_compact_priority on public.requests;
create trigger requests_compact_priority
after update of state on public.requests
for each row
when (old.state is distinct from new.state)
execute function public.compact_request_priority_order();

-- ------------------------------------------------------------
-- 2 · Y las que ya estaban mal
-- ------------------------------------------------------------
--
-- El disparador solo actúa de ahora en adelante. Lo que se publicó antes
-- de esta migración conserva su número, así que se limpia una vez.
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
