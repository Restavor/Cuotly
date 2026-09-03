-- HU-07 · "asignar un plan **y servicios** a un establecimiento y ver su
-- ciclo de consumo vigente".
--
-- El plan ya tenía servidor entero desde la migración 40 (alta con
-- permanencia, mejora inmediata, cambio programado, prorrateo). Al ir a
-- construirle la pantalla aparecieron tres huecos que solo se ven cuando
-- alguien tiene que pulsar un botón — el mismo patrón que la migración 47
-- con las tareas:
--
--   1. **Los servicios no se podían contratar.** `subscriptions` admite
--      `kind = 'service'` desde el Hito 5 y NINGUNA función escribía una:
--      `create_plan_subscription()` solo crea planes. Menú Diario, que es
--      medio catálogo de Restavor (RN-COM-08 a 10), no se podía asignar a
--      un restaurante ni a mano. La primera mitad de HU-07 no existía.
--
--   2. **Un cambio programado no se podía deshacer.** `schedule_plan_change()`
--      escribe una fila `pending` y el índice único parcial impide una
--      segunda, así que una reducción programada por error dejaba la
--      suscripción bloqueada hasta la renovación, sin salida. La tabla ya
--      tenía el estado `cancelled` en su CHECK y no había quien lo pusiera.
--
--   3. **El prorrateo no se podía enseñar antes de cobrarlo.**
--      `plan_change_proration()` es interna con razón (no comprueba
--      permisos), así que la pantalla no tenía forma de decir "esto te va a
--      cobrar 213,45 €" antes de que el administrador confirme. Cobrar sin
--      enseñar la cifra es justo lo que P6 prohíbe.
--
-- Lo que este archivo NO hace, y se dice en vez de fingirlo:
--
--   · **La mensualidad de un servicio sigue siendo Fase 2.**
--     `generate_monthly_charge()` se para en seco con un servicio porque
--     RN-COM-08 fija dos precios para Menú Diario según el establecimiento
--     tenga o no plan Premium activo, y el esquema no sabe cuál de los
--     planes es "Premium": solo tienen nombre. Contratar el servicio queda
--     registrado y su cobro mensual llegará con Menú Diario. La pantalla lo
--     dice.
--   · **Dar de baja una suscripción no existe.** El PRD define la baja a
--     nivel de ESTABLECIMIENTO (RN-EST-09: `ending` → `read_only` →
--     `suspended`, ya implementada en el barrido de la migración 41) y no
--     dice qué pasa si se cancela un plan o un servicio sueltos estando
--     viva la permanencia de RN-COM-04/09. No me lo invento: no hay
--     función y la pantalla explica por qué.

-- ============================================================
-- 1 · La permanencia también es de los servicios (RN-COM-09).
--
-- `plan_commitments` nació en la migración 40 mirando solo a los planes:
-- `plan_id not null`. RN-COM-09 le pide a Menú Diario la misma permanencia
-- mínima de 3 meses que RN-COM-04 le pide a un plan, así que la tabla pasa
-- a admitir las dos cosas — una fila por permanencia, exactamente una
-- referencia, y sigue siendo un libro inmutable.
-- ============================================================
alter table public.plan_commitments
  alter column plan_id drop not null;

alter table public.plan_commitments
  add column service_id uuid references public.services (id);

alter table public.plan_commitments
  add constraint plan_commitments_one_reference
  check (num_nonnulls(plan_id, service_id) = 1);

comment on column public.plan_commitments.service_id is
  'RN-COM-09: la permanencia de 3 meses de un servicio adicional (Menú
   Diario). Exactamente una de `plan_id` / `service_id`, nunca las dos.';

-- CLAUDE.md · el privilegio de columna de esta tabla se enumeró entero en
-- la migración 40, así que una columna nueva no se concede sola: sin esta
-- línea, pedir `service_id` devolvería 403 y la pantalla no podría
-- distinguir la permanencia de un plan de la de un servicio.
grant select (service_id) on public.plan_commitments to authenticated;

-- ============================================================
-- 2 · RN-COM-11 y RN-COM-13 · contratar un servicio adicional.
--
-- "Un establecimiento puede tener un plan de mantenimiento, el servicio
-- Menú Diario, o ambos" y "los servicios adicionales pueden ser varios".
-- Varios servicios DISTINTOS, no el mismo dos veces: eso sería facturarle
-- dos mensualidades del mismo servicio.
-- ============================================================
create unique index subscriptions_one_active_service_idx
  on public.subscriptions (establishment_id, service_id)
  where kind = 'service' and status = 'active';

create or replace function public.create_service_subscription(
  p_establishment_id uuid,
  p_service_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_service_space_id uuid;
  v_subscription_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  -- Misma puerta que el alta de plan: `manage_clients`. No se hereda de
  -- "es miembro del espacio" — un trabajador no contrata servicios.
  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para contratar un servicio a este establecimiento';
  end if;

  select space_id into v_service_space_id from public.services where id = p_service_id;
  if v_service_space_id is null or v_service_space_id <> v_space_id then
    raise exception 'El servicio no pertenece al mismo espacio que el establecimiento';
  end if;

  -- CA-17: pulsar dos veces no contrata dos veces. Se devuelve la
  -- suscripción que ya hay en vez de romper con unique_violation, que es lo
  -- que le pasa hoy al alta de plan y no ayuda a nadie.
  select id into v_subscription_id
  from public.subscriptions
  where establishment_id = p_establishment_id
    and kind = 'service'
    and service_id = p_service_id
    and status = 'active';

  if v_subscription_id is not null then
    return v_subscription_id;
  end if;

  insert into public.subscriptions (space_id, establishment_id, kind, service_id, created_by)
  values (v_space_id, p_establishment_id, 'service', p_service_id, auth.uid())
  returning id into v_subscription_id;

  -- RN-COM-09: "permanencia mínima de 3 meses", igual que un plan.
  insert into public.plan_commitments
    (space_id, establishment_id, subscription_id, service_id, started_at, ends_at, cause, created_by)
  values
    (v_space_id, p_establishment_id, v_subscription_id, p_service_id,
     now(), now() + interval '3 months', 'initial', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id, auth.uid(), 'subscription.service_created', 'subscription', v_subscription_id,
    jsonb_build_object('establishment_id', p_establishment_id, 'service_id', p_service_id)
  );

  return v_subscription_id;
end;
$$;

comment on function public.create_service_subscription(uuid, uuid) is
  'HU-07 · contrata un servicio adicional (RN-COM-11/13) con su permanencia
   de 3 meses (RN-COM-09). Su mensualidad NO se emite todavía: RN-COM-08
   tiene dos precios según el plan sea Premium o no, y eso es Menú Diario
   (Fase 2). Comprueba `manage_clients` por su cuenta.';

-- ============================================================
-- 3 · Deshacer un cambio de plan programado.
--
-- Sin esto, `scheduled_plan_changes` es una vía de un solo sentido: el
-- índice único parcial `where state = 'pending'` deja como mucho uno vivo,
-- así que programar el plan equivocado bloquea la suscripción hasta la
-- renovación. El estado 'cancelled' estaba en el CHECK desde el principio
-- esperando a esta función.
-- ============================================================
create or replace function public.cancel_scheduled_plan_change(
  p_subscription_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change public.scheduled_plan_changes;
begin
  select * into v_change from public.scheduled_plan_changes
  where subscription_id = p_subscription_id and state = 'pending'
  for update;

  if v_change.id is null then
    -- CA-17: cancelar dos veces no es un error, simplemente ya no hay nada
    -- que cancelar.
    return false;
  end if;

  if not public.has_capability(v_change.space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden anular un cambio de plan programado';
  end if;

  update public.scheduled_plan_changes
  set state = 'cancelled'
  where id = v_change.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_change.space_id, auth.uid(), 'subscription.plan_change_cancelled', 'subscription', p_subscription_id,
    jsonb_build_object('state', 'pending', 'to_plan_id', v_change.to_plan_id,
                       'effective_at', v_change.effective_at),
    jsonb_build_object('state', 'cancelled', 'reason', p_reason)
  );

  return true;
end;
$$;

comment on function public.cancel_scheduled_plan_change(uuid, text) is
  'Anula el cambio de plan que esperaba a la renovación (RN-COM-16/17). No
   borra la fila —CLAUDE.md MUST NOT—: la deja en `cancelled`, que es lo que
   libera el índice único para poder programar otro.';

-- ============================================================
-- 4 · Enseñar el prorrateo ANTES de cobrarlo.
--
-- `plan_change_proration()` es interna y seguirá siéndolo: no comprueba
-- permisos. Esta es su puerta pública, con la misma capacidad que exige el
-- cambio real, para que la pantalla pueda decir cuánto se va a cobrar y
-- cuántos consumos se van a añadir antes de que nadie confirme.
--
-- Es una lectura: no escribe, no cobra y no cambia nada.
-- ============================================================
create or replace function public.plan_change_preview(
  p_subscription_id uuid,
  p_new_plan_id uuid
)
returns table (
  fraction numeric,
  difference_cents integer,
  extra_small integer,
  extra_photo integer,
  extra_medium integer,
  extra_large integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_new_space_id uuid;
begin
  select space_id into v_space_id from public.subscriptions
  where id = p_subscription_id and kind = 'plan' and status = 'active';

  if v_space_id is null then
    raise exception 'Suscripción de plan activa no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden ver el prorrateo de un cambio de plan';
  end if;

  select space_id into v_new_space_id from public.plans where id = p_new_plan_id;
  if v_new_space_id is null or v_new_space_id <> v_space_id then
    raise exception 'El plan no pertenece al mismo espacio que el establecimiento';
  end if;

  return query select * from public.plan_change_proration(p_subscription_id, p_new_plan_id);
end;
$$;

comment on function public.plan_change_preview(uuid, uuid) is
  'RN-COM-18 · lo que costaría la mejora inmediata y qué consumos añadiría,
   sin ejecutarla. Comprueba `manage_clients`, igual que
   change_plan_immediately(): quien no puede cambiar el plan tampoco
   necesita su cifra.';

-- ============================================================
-- 5 · El ciclo de consumo existe desde que existe el plan.
--
-- HU-07 pide "ver su ciclo de consumo vigente" y hasta hoy no había
-- ninguno que ver hasta que alguien aceptaba la primera solicitud o se
-- emitía la primera mensualidad: esas eran las únicas llamadas a
-- `get_or_create_consumption_cycle()`. Un restaurante recién dado de alta
-- enseñaba una bolsa vacía que no era la suya.
--
-- El ciclo no se inventa: `get_or_create_consumption_cycle_internal()` lo
-- deriva de `subscriptions.started_at` y del plan, así que crearlo al dar
-- de alta produce EXACTAMENTE el mismo que se habría creado más tarde. Lo
-- único que cambia es cuándo se ve.
-- ============================================================
create or replace function public.create_plan_subscription(
  p_establishment_id uuid,
  p_plan_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_plan_space_id uuid;
  v_subscription_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para asignar un plan a este establecimiento';
  end if;

  select space_id into v_plan_space_id from public.plans where id = p_plan_id;
  if v_plan_space_id is null or v_plan_space_id <> v_space_id then
    raise exception 'El plan no pertenece al mismo espacio que el establecimiento';
  end if;

  insert into public.subscriptions (space_id, establishment_id, kind, plan_id, created_by)
  values (v_space_id, p_establishment_id, 'plan', p_plan_id, auth.uid())
  returning id into v_subscription_id;

  -- RN-COM-04: "permanencia mínima inicial de 3 meses".
  insert into public.plan_commitments
    (space_id, establishment_id, subscription_id, plan_id, started_at, ends_at, cause, created_by)
  values
    (v_space_id, p_establishment_id, v_subscription_id, p_plan_id,
     now(), now() + interval '3 months', 'initial', auth.uid());

  -- RN-COM-06 · la bolsa del ciclo, desde el primer día. Se llama a la
  -- interna a propósito: el permiso ya se ha comprobado arriba y la
  -- pública lo volvería a comprobar con otro criterio.
  perform public.get_or_create_consumption_cycle_internal(v_subscription_id);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'subscription.plan_created', 'subscription', v_subscription_id, jsonb_build_object('establishment_id', p_establishment_id, 'plan_id', p_plan_id));

  return v_subscription_id;
end;
$$;

-- Y los planes que ya estaban dados de alta sin ciclo abierto: mismo
-- cálculo, así que esto no crea un ciclo distinto del que habrían tenido,
-- solo lo adelanta.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select s.id from public.subscriptions s
    where s.kind = 'plan' and s.status = 'active'
      and not exists (
        select 1 from public.consumption_cycles cc
        where cc.subscription_id = s.id and now() >= cc.cycle_start and now() < cc.cycle_end
      )
  loop
    perform public.get_or_create_consumption_cycle_internal(v_id);
  end loop;
end $$;

-- Las tres son públicas por RPC a propósito —las llama la pantalla— y las
-- tres comprueban permisos por su cuenta. `anon` no pinta nada aquí: sin
-- sesión, `auth.uid()` es null y `has_capability()` diría que no, pero
-- dejarla abierta sería confiar en eso.
revoke all on function public.create_service_subscription(uuid, uuid) from public, anon;
grant execute on function public.create_service_subscription(uuid, uuid) to authenticated;

revoke all on function public.cancel_scheduled_plan_change(uuid, text) from public, anon;
grant execute on function public.cancel_scheduled_plan_change(uuid, text) to authenticated;

revoke all on function public.plan_change_preview(uuid, uuid) from public, anon;
grant execute on function public.plan_change_preview(uuid, uuid) to authenticated;
