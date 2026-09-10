-- La prioridad la pone el restaurante, y solo si su plan se la da.
--
-- Decisión de producto de Bosco (10/09/2026), literal: "los clientes
-- premium son los únicos que pueden indicar la prioridad, y lo hacen
-- organizando sus cambios por cuál es más importante: 5 cambios, pues
-- ponerlos en orden del 1 más importante al 5 menos importante".
--
-- Tres cosas de esa frase que cambian el diseño respecto de la maqueta 06,
-- donde "Prioridad" salía como una etiqueta suelta con el valor "Media":
--
--   1. **No es una etiqueta, es un ORDEN.** No hay Alta/Media/Baja: hay un
--      1, un 2 y un 3 dentro de los cambios pendientes de ESE restaurante.
--      Una etiqueta no dice cuál va antes entre dos "Media"; un orden sí,
--      que es justo lo que el restaurante quiere expresar.
--   2. **Es del restaurante, y "los únicos" es literal.** Ni el
--      propietario del espacio ni un administrador la ponen. Es la
--      preferencia del cliente sobre su propio trabajo, y que la fijara el
--      equipo la convertiría en otra cosa.
--   3. **Depende del plan.** Solo el plan que la conceda.
--
-- **Por qué `plans.grants_priority` y no comparar el nombre con 'Premium'.**
-- CLAUDE.md fija que Cuotly es multiempresa, no solo el espacio de
-- Restavor: otro espacio puede llamar a su plan alto "Total" o "Avanzado"
-- y seguiría siendo el que da prioridad. Un `name = 'Premium'` escrito en
-- una función es una regla que se rompe en silencio con el segundo cliente
-- de la plataforma. La cualidad se guarda como lo que es —algo que el plan
-- concede— y cada espacio marca el suyo.
--
-- **Por qué la función recibe la lista ENTERA y no un número suelto.**
-- Escribir "pon esta la 3" invita a que haya dos terceras, o un hueco
-- entre la 2 y la 4, y entonces el orden deja de ser un orden. Recibiendo
-- la lista ordenada y reescribiendo 1..N de una vez, los empates y los
-- huecos son imposibles por construcción, no por cuidado.
--
-- Se comprueba con `supabase/tests/prioridad_del_restaurante.sql`.

-- ------------------------------------------------------------
-- 1 · Qué plan concede la prioridad
-- ------------------------------------------------------------
alter table public.plans
  add column if not exists grants_priority boolean not null default false;

comment on column public.plans.grants_priority is
  'Si este plan deja al restaurante ordenar sus cambios pendientes por
   importancia. Es una cualidad del plan y NO su nombre: Cuotly es
   multiempresa (CLAUDE.md) y cada espacio llama como quiera a su plan
   alto. Hoy lo concede Premium en el espacio de Restavor.';

-- ------------------------------------------------------------
-- 2 · El orden, en la solicitud
-- ------------------------------------------------------------
alter table public.requests
  add column if not exists priority_rank integer check (priority_rank >= 1);

-- **Y su privilegio de columna.** `requests` tiene el `select` revocado y
-- concedido columna a columna para que el cliente no vea la identidad del
-- equipo (CLAUDE.md), y una columna NUEVA no se concede sola: sin esta
-- línea, `priority_rank` existe, la función la escribe y ninguna pantalla
-- puede leerla — `select` sobre ella devuelve "permission denied for table
-- requests", que es un error que no menciona la columna y manda a buscar
-- donde no es. Lo cazó el propio test de esta migración a la primera
-- ejecución.
grant select (priority_rank) on public.requests to authenticated;

comment on column public.requests.priority_rank is
  '1 = el cambio más importante para el restaurante. Nulo = sin ordenar.
   Lo escribe SOLO `set_request_priority_order()`, que reescribe la lista
   entera: `requests` no tiene política de UPDATE, así que no hay otra
   puerta por la que puedan aparecer dos primeros o un hueco.';

-- ------------------------------------------------------------
-- 3 · Quién puede ordenar
-- ------------------------------------------------------------
--
-- Las dos condiciones a la vez: poder escribir en el restaurante (que es
-- lo que ya distingue a un propietario o editor de un Consulta) y que el
-- plan vigente lo conceda. Sin plan activo, no.
--
-- El equipo del espacio NO aparece por ninguna parte, y es a propósito:
-- "los clientes premium son los únicos". Si mañana se decide que un
-- administrador pueda reordenar en nombre del cliente, será otra función
-- con su propio apunte, no un `or has_capability(...)` colado aquí.
create or replace function public.client_can_set_priority(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_write_establishment(p_establishment_id)
     and exists (
       select 1
       from public.subscriptions s
       join public.plans p on p.id = s.plan_id
       where s.establishment_id = p_establishment_id
         and s.kind = 'plan'
         and s.status = 'active'
         and p.grants_priority
     );
$$;

comment on function public.client_can_set_priority(uuid) is
  'Si quien llama puede ordenar los cambios pendientes de este restaurante:
   escribe en él Y su plan vigente lo concede. El equipo del espacio no
   entra: la prioridad es la preferencia del cliente sobre su propio
   trabajo.';

revoke all on function public.client_can_set_priority(uuid) from public, anon;
grant execute on function public.client_can_set_priority(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4 · Los estados que se pueden ordenar
-- ------------------------------------------------------------
--
-- Lo que está pendiente de hacerse, ni más ni menos:
--
--   · `draft` NO: es un borrador que el restaurante todavía no ha enviado.
--     No se prioriza lo que no se ha pedido.
--   · Publicado y lo que viene después tampoco: el cambio ya está en la
--     web, ordenarlo no adelanta nada.
--   · Rechazado y cancelado, obviamente no.
create or replace function public.request_is_rankable(p_state text)
returns boolean
language sql
immutable
as $$
  select p_state in (
    'received', 'analyzing', 'needs_information',
    'pending_internal_validation', 'pending_client_acceptance',
    'accepted', 'in_progress'
  );
$$;

revoke all on function public.request_is_rankable(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5 · La puerta: la lista entera de una vez
-- ------------------------------------------------------------
create or replace function public.set_request_priority_order(
  p_establishment_id uuid,
  p_request_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_esperadas integer;
  v_recibidas integer;
begin
  select space_id into v_space_id
  from public.establishments where id = p_establishment_id;

  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  if not public.client_can_set_priority(p_establishment_id) then
    raise exception 'Ordenar los cambios por importancia es del restaurante, y solo con un plan que lo incluya';
  end if;

  v_recibidas := coalesce(array_length(p_request_ids, 1), 0);

  -- Ni repetidas ni de otro restaurante ni en un estado que no se ordena.
  -- Se comprueba ANTES de escribir nada: media lista reordenada es peor
  -- que ninguna.
  if v_recibidas <> (select count(distinct x) from unnest(p_request_ids) as x) then
    raise exception 'La lista trae solicitudes repetidas';
  end if;

  if exists (
    select 1 from unnest(p_request_ids) as x
    where not exists (
      select 1 from public.requests r
      where r.id = x
        and r.establishment_id = p_establishment_id
        and public.request_is_rankable(r.state)
    )
  ) then
    raise exception 'La lista trae alguna solicitud que no es de este restaurante o que ya no está pendiente';
  end if;

  -- Y tiene que venir ENTERA. Ordenar tres de cinco dejaría dos sin sitio,
  -- y "sin sitio" no es lo mismo que "las menos importantes": la pantalla
  -- no sabría cuál de las dos cosas enseñar.
  select count(*) into v_esperadas
  from public.requests r
  where r.establishment_id = p_establishment_id
    and public.request_is_rankable(r.state);

  if v_recibidas <> v_esperadas then
    raise exception 'Hay % cambios pendientes y la lista trae %: se ordenan todos o ninguno', v_esperadas, v_recibidas;
  end if;

  update public.requests r
  set priority_rank = orden.posicion
  from (
    select x as id, ordinality::integer as posicion
    from unnest(p_request_ids) with ordinality as t(x, ordinality)
  ) as orden
  where r.id = orden.id
    and r.priority_rank is distinct from orden.posicion;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id, auth.uid(), 'request.priority_set', 'establishment', p_establishment_id,
    jsonb_build_object('order', p_request_ids)
  );
end;
$$;

comment on function public.set_request_priority_order(uuid, uuid[]) is
  'El restaurante ordena sus cambios pendientes por importancia (1 = el más
   importante). Recibe la lista ENTERA y reescribe 1..N de una vez, así que
   los empates y los huecos son imposibles por construcción. Solo el
   cliente, y solo con un plan que lo conceda.';

revoke all on function public.set_request_priority_order(uuid, uuid[]) from public, anon;
grant execute on function public.set_request_priority_order(uuid, uuid[]) to authenticated;
