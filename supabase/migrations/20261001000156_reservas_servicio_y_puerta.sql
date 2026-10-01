-- Fase A de Restavor agents (APP-00) · primera de tres migraciones.
--
-- Restavor app pasa a ser la puerta común de Restavor web y Restavor agents
-- (decisión 88). Esta migración prepara el catálogo del espacio para ofrecer
-- Reservas, el primer agente (decisión 89), sin tocar nada del comportamiento
-- de Restavor web:
--
--   1 · `services.kind` admite 'reservations' y `assert_service_terms` lo acepta.
--   2 · Una suscripción a Reservas SOLO la crea la aprobación de la solicitud
--       (decisión 91, RN-APP-03). La política `subscriptions_insert` deja
--       insertar directo a quien tiene `manage_clients`, así que lo impide un
--       disparador: sin el ajuste local `restavor.reservations_approval = on`
--       —que solo pondrá `approve_reservation_request()`, de la Fase E— no entra.
--   3 · `spaces.reservations_enabled`: qué espacios ofrecen Reservas. Solo lo
--       cambia la plataforma (RN-ADM-02). Activa en el espacio `restavor`.
--   4 · `ensure_reservations_service_internal()`: el servicio Reservas del
--       catálogo del espacio, con su versión 1 de condiciones. Idempotente.
--   5 · `create_restavor_space()` lo crea también en un espacio nuevo.
--
-- Reservas no crea `plan_commitments` (decisión 95): su permanencia, su cobro
-- y su ciclo de vida son los suyos, y llegan con las fases que los usan.
--
-- Se comprueba con `supabase/tests/restavor_app_puerta_comun.sql`.

-- ------------------------------------------------------------
-- 1 · El tipo de servicio
-- ------------------------------------------------------------
alter table public.services drop constraint services_kind_check;
alter table public.services
  add constraint services_kind_check check (kind in ('daily_menu', 'reservations', 'other'));

create or replace function public.assert_service_terms(
  p_kind text, p_price_cents integer, p_price_premium_cents integer, p_included_updates integer)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_kind not in ('daily_menu', 'reservations', 'other') then
    raise exception 'Tipo de servicio desconocido: %', p_kind;
  end if;
  if p_price_cents is null or p_price_cents < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;
  if p_price_premium_cents is not null and p_price_premium_cents < 0 then
    raise exception 'El precio con Premium+ no puede ser negativo';
  end if;
  if p_included_updates is null or p_included_updates < 0 then
    raise exception 'Las actualizaciones incluidas no pueden ser negativas';
  end if;
  -- RN-CRE-22 · Menú Diario ya no lleva contador: puede no incluir ninguna.
end;
$$;

-- ------------------------------------------------------------
-- 2 · Nadie suscribe a Reservas por la puerta de atrás
-- ------------------------------------------------------------
create or replace function public.guard_reservations_subscription()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind <> 'service' or new.service_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.service_id is not distinct from old.service_id then
    return new;
  end if;
  if not exists (select 1 from public.services s where s.id = new.service_id and s.kind = 'reservations') then
    return new;
  end if;
  if coalesce(current_setting('restavor.reservations_approval', true), '') <> 'on' then
    raise exception 'Reservas solo se contrata aprobando la solicitud del restaurante (RN-APP-03)';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_reservations_subscription() from public, anon, authenticated;

create trigger subscriptions_guard_reservations
  before insert or update of service_id on public.subscriptions
  for each row execute function public.guard_reservations_subscription();

-- ------------------------------------------------------------
-- 3 · Qué espacios ofrecen Reservas
-- ------------------------------------------------------------
alter table public.spaces
  add column reservations_enabled boolean not null default false;

comment on column public.spaces.reservations_enabled is
  'Decisión 89 · el espacio ofrece Reservas (Restavor agents) a sus restaurantes. Solo la plataforma lo cambia.';

-- Lo declaro antes de usarlo desde `set_space_reservations_enabled`.
create or replace function public.ensure_reservations_service_internal(p_space_id uuid, p_published_by uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.services
  where space_id = p_space_id and kind = 'reservations' and superseded_at is null and archived_at is null
  order by created_at
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  -- Reservas cuesta 48 € + IVA al mes (4800 céntimos, decisión 89). Sin
  -- contador de actualizaciones: no es un servicio de cambios.
  insert into public.services
    (space_id, name, price_cents, price_premium_cents, kind, included_updates, published_by)
  values
    (p_space_id, 'Reservas', 4800, null, 'reservations', 0, p_published_by)
  returning id into v_id;

  -- La versión 1 de sus condiciones. El texto es PROVISIONAL: Restavor web no
  -- redacta textos legales (CLAUDE.md, bloque legal aplazado). Quien administra
  -- el espacio lo sustituye publicando una versión nueva desde Planes y
  -- servicios (`publish_service_conditions`).
  insert into public.service_versions (space_id, service_id, version, conditions, published_by)
  values (p_space_id, v_id, 1,
    E'PROVISIONAL, pendiente de revisión legal. Resumen de lo principal:\n'
    || E'1. Qué contratas: la agenda de reservas y el agente de llamadas de Restavor agents.\n'
    || E'2. Precio y pagos: 48 € + IVA al mes, sin permanencia. Pago por transferencia o Bizum.\n'
    || E'3. Saldo del agente y mensajes: las llamadas, los WhatsApp y los SMS se pagan con un saldo que recarga el restaurante, a lo que cuestan, sin recargo.\n'
    || E'4. Protección de datos: Restavor trata los datos de los comensales como encargado del tratamiento, solo para dar el servicio, y solo los consulta con permiso, en modo soporte.\n'
    || E'5. Baja y datos al terminar: la baja se pide cuando se quiera y el servicio sigue hasta el final del periodo pagado. Si un pago se retrasa más de 7 días, no se apuntan reservas nuevas hasta que se pague; las existentes no se pierden.',
    p_published_by);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (p_space_id, null, 'service.created', 'service', v_id,
          jsonb_build_object('name', 'Reservas', 'kind', 'reservations', 'price_cents', 4800,
                             'via', 'ensure_reservations_service_internal'));

  return v_id;
end;
$$;

revoke all on function public.ensure_reservations_service_internal(uuid, uuid) from public, anon, authenticated;

create or replace function public.set_space_reservations_enabled(p_space_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old boolean;
begin
  if not public.is_platform_owner() then
    raise exception 'Solo Restavor web decide qué espacios ofrecen Reservas';
  end if;

  select reservations_enabled into v_old from public.spaces where id = p_space_id;
  if not found then
    raise exception 'Espacio no encontrado';
  end if;

  if v_old is not distinct from p_enabled then
    return;
  end if;

  update public.spaces set reservations_enabled = p_enabled where id = p_space_id;

  -- Para ofrecerlo hace falta el servicio con sus condiciones en el catálogo.
  if p_enabled then
    perform public.ensure_reservations_service_internal(p_space_id, auth.uid());
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (p_space_id, auth.uid(), 'space.reservations_enabled_changed', 'space', p_space_id,
          jsonb_build_object('reservations_enabled', v_old),
          jsonb_build_object('reservations_enabled', p_enabled));
end;
$$;

revoke all on function public.set_space_reservations_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_space_reservations_enabled(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 4 · El espacio de Restavor ya la ofrece
-- ------------------------------------------------------------
do $$
declare
  v_space uuid;
  v_owner uuid;
begin
  select id, created_by into v_space, v_owner from public.spaces where slug = 'restavor';
  if v_space is not null then
    update public.spaces set reservations_enabled = true where id = v_space;
    perform public.ensure_reservations_service_internal(v_space, v_owner);
  end if;
end $$;

-- ------------------------------------------------------------
-- 5 · Un espacio de Restavor nuevo nace con Reservas
-- ------------------------------------------------------------
-- Copia viva de la definición de la migración 155 con dos cambios: el espacio
-- nace con `reservations_enabled` y con el servicio Reservas en su catálogo.
create or replace function public.create_restavor_space()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_owner_id uuid := auth.uid();
begin
  if not public.is_platform_owner() then
    raise exception 'Solo el propietario de Restavor web puede crear el espacio de Restavor';
  end if;

  if exists (select 1 from public.spaces where slug = 'restavor') then
    raise exception 'El espacio de Restavor ya existe';
  end if;

  insert into public.spaces (name, slug, timezone, created_by, reservations_enabled)
  values ('Restavor', 'restavor', 'Europe/Madrid', v_owner_id, true)
  returning id into v_space_id;

  insert into public.space_memberships (space_id, user_id, role, status)
  values (v_space_id, v_owner_id, 'owner', 'active');

  -- Los planes de mantenimiento de Restavor (PRD §6.1 y §41): Básico,
  -- Impulso y Premium (decisiones 84 y 85). Precios en céntimos, más IVA.
  -- Los créditos van en medios créditos: 40 = 20 créditos (RN-CRE-04).
  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium,
     included_large, included_credits_half, start_sla_hours, grants_priority, queue_rank,
     can_order_requests, report_level, report_period, watches_reviews, includes_daily_menu,
     execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large)
  values
    -- RN-COM-03 · `queue_rank` es el turno dentro del mismo plazo: Básico
    -- 0, Impulso 1, Premium 2 (decisiones 55 y 83).
    -- RN-REP-32 y RN-CRE-26 · el Básico recibe el trimestral; Impulso y
    -- Premium, el mensual y el trimestral.
    -- RN-CRE-20 · Impulso y Premium confirman el inicio en 24 h; el Básico, 48.
    -- RN-CRE-21 · Menú Diario incluido en Impulso y Premium.
    -- RN-CRE-28 · ninguno ordena sus solicitudes.
    (v_space_id, 'Básico',    2000, 0, 0, 0, 0,  0, 48, false, 0, false, 'basic',    'quarter', false, false, 72, 72, 72, 120),
    (v_space_id, 'Impulso',   9900, 0, 0, 0, 0, 40, 24, false, 1, false, 'standard', 'both',    false, true,  72, 72, 72, 120),
    (v_space_id, 'Premium',  19900, 0, 0, 0, 0, 80, 24, false, 2, false, 'advanced', 'both',    false, true,  72, 72, 72, 120);

  -- Servicio Menú Diario suelto (RN-CRE-21): 199 € + IVA para quien no lo
  -- tiene en su plan, también con Básico. Sin precio reducido y sin
  -- contador de actualizaciones (RN-CRE-22).
  insert into public.services (space_id, name, price_cents, price_premium_cents, kind, included_updates)
  values (v_space_id, 'Menú Diario', 19900, null, 'daily_menu', 0);

  -- Reservas (decisión 89): 48 € + IVA al mes, con sus condiciones v1.
  perform public.ensure_reservations_service_internal(v_space_id, v_owner_id);

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
$$;
