-- Semilla de Restavor (Hito 2 del ROADMAP), disparada por el botón
-- "Crear Restavor" que solo ve el Propietario de Cuotly. Todo en una
-- transacción: si algo falla, no queda nada a medias (RN-DAT-09), y
-- pulsarlo dos veces no duplica nada (falla la segunda vez, con un
-- mensaje claro) — CA-17.

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

  -- Planes de mantenimiento de Restavor (RN-COM-01 a 03). Los precios se
  -- guardan en céntimos para no arrastrar redondeos de coma flotante.
  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours)
  values
    (v_space_id, 'Básico', 9900, 0, 0, 0, 0, 48),
    (v_space_id, 'Impulso', 39900, 16, 12, 3, 0, 24),
    (v_space_id, 'Premium', 59900, 25, 24, 5, 1, 24);

  -- Servicio Menú Diario (RN-COM-08 a 10).
  insert into public.services (space_id, name, price_cents, price_premium_cents)
  values (v_space_id, 'Menú Diario', 22900, 19900);

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

comment on function public.create_restavor_space() is
  'Único punto de entrada para crear el espacio de Restavor. No hay
   ninguna otra vía (ni política de INSERT directo en spaces salvo esta
   función, que además exige is_platform_owner()). Pulsarlo dos veces
   lanza un error explícito en la segunda, en vez de duplicar el espacio.';
