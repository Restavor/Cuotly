-- ============================================================
-- Migración 110 · El plan manda tres cosas distintas (RN-COM-03, decisión 55)
-- ============================================================
--
-- Bosco contestó el 19/09/2026 los dos cabos que la decisión 48 dejó
-- abiertos sobre la prioridad del plan, y sus dos respuestas juntas
-- **parten en dos algo que hoy es un solo booleano**:
--
--   · *"Todos tienen de máximo 24 h, pero si hay una solicitud de Premium+
--     y otra de Premium, se contestaría primero la de Premium+."*
--   · *"Solo pueden organizar por prioridad sus solicitudes los de Premium
--     y Premium+."*
--
-- Lo primero es un **turno** dentro del mismo plazo. Lo segundo es una
-- **capacidad del cliente**. Hasta hoy las dos salían de
-- `plans.grants_priority`, y con el booleano solo no se pueden decir a la
-- vez: si se le pone a Premium para que ordene, deja de poder distinguirse
-- de Premium+ a la hora de atender.
--
-- **Y hay una razón más fuerte para NO tocar ese booleano.** Está
-- sobrecargado: hoy decide CUATRO cosas, y dos de ellas Bosco no las ha
-- tocado —las fijó el 16/09/2026 en la decisión 39 y CLAUDE.md las
-- enumera—:
--
--   1. Ordenar las solicitudes propias (migración 62).
--   2. El turno interno de la cola (`worker-queue.ts`).
--   3. **Menú Diario a 199 € en vez de 229 €** (RN-COM-08, migración 80).
--   4. **Las oportunidades avanzadas** (RN-OPP, migración 84).
--
-- Poner `grants_priority = true` en Premium le habría dado también la 3 y
-- la 4 **en silencio**, deshaciendo dos decisiones suyas sin que nadie lo
-- pidiera. Así que esta migración **no toca `grants_priority`**: sigue
-- siendo solo de Premium+ y sigue significando lo que significaba para el
-- precio y las oportunidades. Lo que hace es sacarle las otras dos
-- responsabilidades y ponerle nombre propio a cada una.
--
-- **El plazo NO cambia.** `start_sla_hours` se queda en 48 h para Básico e
-- Impulso y 24 h para Impulso+, Premium y Premium+. No hay ningún número
-- nuevo que inventar, y era la otra mitad de la pregunta.

-- ------------------------------------------------------------
-- 1 · Las dos columnas, cada una con su nombre
-- ------------------------------------------------------------
alter table public.plans
  add column queue_rank smallint not null default 0,
  add column can_order_requests boolean not null default false;

comment on column public.plans.queue_rank is
  'RN-COM-03 · el turno del plan dentro del mismo plazo: a igualdad de todo
   lo demás se atiende primero al número más alto. NO es un plazo más corto
   —`start_sla_hours` no cambia— y **el cliente no lo ve**: es el orden de
   trabajo del equipo.';

comment on column public.plans.can_order_requests is
  'RN-COM-03, RN-PRI · si el restaurante puede ordenar 1..N sus propias
   solicitudes pendientes. Esto SÍ es visible: es lo que la ficha de plan
   del diseño llama "Prioridad", y es una capacidad que se compra, no la
   posición de nadie en una cola.';

-- ------------------------------------------------------------
-- 2 · Lo que hay hoy conserva lo que hacía, y Premium gana lo suyo
-- ------------------------------------------------------------
--
-- El relleno va por `grants_priority` y no por el nombre del plan, porque
-- Cuotly es multiempresa (CLAUDE.md): otro espacio llamará "Total" a su
-- plan alto. Lo que se sabe de cualquier espacio es que el plan con
-- `grants_priority` es el más alto.
--
-- Premium es el caso nuevo y **no se puede deducir de ninguna columna**:
-- no tiene `grants_priority` y sus cambios incluidos no lo distinguen de
-- Impulso+ de forma fiable. Se identifica por nombre a propósito y solo
-- para el relleno de HOY, que es un dato de Restavor (decisión 39); de aquí
-- en adelante quien cree un plan elige sus columnas.
update public.plans set queue_rank = 2, can_order_requests = true
where grants_priority;

update public.plans set queue_rank = 1, can_order_requests = true
where not grants_priority and name = 'Premium';

-- ------------------------------------------------------------
-- 3 · Ordenar los cambios propios deja de leer el booleano sobrecargado
-- ------------------------------------------------------------
--
-- Mismo cuerpo que dejó la migración 107 con una palabra cambiada:
-- `grants_priority` pasa a `can_order_requests`. Es la línea que hace que
-- Premium pueda ordenar sin llevarse el precio de Menú Diario ni las
-- oportunidades avanzadas.
create or replace function public.client_can_set_priority(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.client_permission(p_establishment_id, 'create_requests')
     and exists (
       select 1
       from public.subscriptions s
       join public.plans p on p.id = s.plan_id
       where s.establishment_id = p_establishment_id
         and s.kind = 'plan'
         and s.status = 'active'
         and p.can_order_requests
     );
$$;

comment on function public.client_can_set_priority(uuid) is
  'RN-COM-03, RN-PRI · si quien llama puede ordenar los cambios pendientes
   de este restaurante: tiene "Crear solicitudes" (RN-EST-15) Y su plan
   vigente lo concede (`can_order_requests`, desde el 19/09/2026 Premium y
   Premium+). NO mira `grants_priority`: ese decide el precio de Menú
   Diario y las oportunidades avanzadas, que son de Premium+ solo.';

revoke all on function public.client_can_set_priority(uuid) from public, anon;
grant execute on function public.client_can_set_priority(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4 · El turno del plan de un restaurante, para la cola del equipo
-- ------------------------------------------------------------
--
-- Lo lee el lado del EQUIPO para ordenar su trabajo. No se le da a
-- `authenticated` a secas: se comprueba dentro que quien pregunta es del
-- espacio, porque el turno de un restaurante frente a otros es
-- organización interna y el cliente no lo ve (RN-COM-03).
--
-- Sin plan vigente devuelve 0, que es el mismo turno que Básico: no tener
-- plan no adelanta a nadie.
create or replace function public.establishment_queue_rank(p_establishment_id uuid)
returns smallint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_rank smallint;
begin
  if v_space_id is null or not public.is_space_member(v_space_id) then
    return 0::smallint;
  end if;

  select p.queue_rank into v_rank
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = p_establishment_id
    and s.kind = 'plan'
    and s.status = 'active'
  order by p.queue_rank desc
  limit 1;

  return coalesce(v_rank, 0::smallint);
end;
$$;

comment on function public.establishment_queue_rank(uuid) is
  'RN-COM-03 · el turno del plan de este restaurante para la cola del
   EQUIPO. Devuelve 0 a quien no es del espacio: el turno frente a otros
   restaurantes no viaja hacia el cliente.';

revoke all on function public.establishment_queue_rank(uuid) from public, anon;
grant execute on function public.establishment_queue_rank(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5 · Un espacio nuevo nace ya con las tres columnas dichas
-- ------------------------------------------------------------
--
-- El relleno de la parte 2 arregla los planes que YA existen, y en el
-- proyecto real son los de Restavor. Pero los planes no los crea ninguna
-- migración: los crea `create_restavor_space()`, así que sin tocarla **cada
-- espacio nuevo nacería con Premium sin poder ordenar sus cambios y con
-- todo el catálogo empatado a turno 0**. Se vio al ejecutar las suites
-- sobre una base limpia, donde no hay más planes que los que crea esa
-- función.
--
-- Los dos cuerpos se copiaron de la definición viva y se les cambió
-- **solo** la lista de columnas de los `insert into public.plans`. Lo
-- demás no se toca.
CREATE OR REPLACE FUNCTION public.create_restavor_space()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_owner_id uuid := auth.uid();
begin
  if not public.is_platform_owner() then
    raise exception 'Solo el propietario de Cuotly puede crear el espacio de Restavor';
  end if;

  if exists (select 1 from public.spaces where slug = 'restavor') then
    raise exception 'El espacio de Restavor ya existe';
  end if;

  insert into public.spaces (name, slug, timezone, created_by)
  values ('Restavor', 'restavor', 'Europe/Madrid', v_owner_id)
  returning id into v_space_id;

  insert into public.space_memberships (space_id, user_id, role, status)
  values (v_space_id, v_owner_id, 'owner', 'active');

  -- Los planes de mantenimiento de Restavor (PRD §6.1, fichas del
  -- 16/09/2026). Precios en céntimos, más IVA. Solo Premium+ concede la
  -- prioridad, y solo Premium+ incluye un cambio grande.
  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium,
     included_large, start_sla_hours, grants_priority, queue_rank, can_order_requests)
  values
    -- RN-COM-03 (decisión 55) · las tres últimas columnas dicen tres cosas
    -- distintas: `grants_priority` es el plan alto —precio de Menú Diario y
    -- oportunidades avanzadas, solo Premium+—, `queue_rank` es el turno
    -- dentro del mismo plazo, y `can_order_requests` es si el restaurante
    -- puede ordenar sus cambios (Premium y Premium+).
    (v_space_id, 'Básico',   9900,   0,  0, 0, 0, 48, false, 0, false),
    (v_space_id, 'Impulso',  29900,  6,  6, 1, 0, 48, false, 0, false),
    (v_space_id, 'Impulso+', 39900, 16, 12, 3, 0, 24, false, 0, false),
    (v_space_id, 'Premium',  49900, 10, 12, 2, 0, 24, false, 1, true),
    (v_space_id, 'Premium+', 59900, 25, 24, 5, 1, 24, true,  2, true);

  -- Servicio Menú Diario (RN-COM-08 a 10): 229 € + IVA, o 199 € + IVA con
  -- el plan que concede prioridad (Premium+); 30 actualizaciones por ciclo.
  insert into public.services (space_id, name, price_cents, price_premium_cents, kind, included_updates)
  values (v_space_id, 'Menú Diario', 22900, 19900, 'daily_menu', 30);

  insert into public.space_working_hours (space_id, calendar_kind, timezone, created_by)
  values
    (v_space_id, 'contractual', 'Europe/Madrid', v_owner_id),
    (v_space_id, 'support', 'Europe/Madrid', v_owner_id),
    (v_space_id, 'menu_diario', 'Europe/Madrid', v_owner_id);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id,
    v_owner_id,
    'space.created',
    'space',
    v_space_id,
    jsonb_build_object('name', 'Restavor', 'slug', 'restavor', 'via', 'create_restavor_space')
  );

  return v_space_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.upgrade_restavor_plan_catalogue(p_space_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Impulso+') then
    update public.plans
      set name = 'Impulso+'
    where space_id = p_space_id and name = 'Impulso' and price_cents = 39900;
  end if;

  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Premium+') then
    update public.plans
      set name = 'Premium+'
    where space_id = p_space_id and name = 'Premium' and price_cents = 59900;
  end if;

  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Impulso') then
    insert into public.plans
      (space_id, name, price_cents, included_small, included_photo, included_medium,
       included_large, start_sla_hours, grants_priority, queue_rank, can_order_requests)
    values (p_space_id, 'Impulso', 29900, 6, 6, 1, 0, 48, false, 0, false);
  end if;

  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Premium') then
    insert into public.plans
      (space_id, name, price_cents, included_small, included_photo, included_medium,
       included_large, start_sla_hours, grants_priority, queue_rank, can_order_requests)
    values (p_space_id, 'Premium', 49900, 10, 12, 2, 0, 24, false, 1, true);
  end if;
end;
$function$;
