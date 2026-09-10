-- Premium concede la prioridad, también en los espacios nuevos.
--
-- La migración 62 añadió `plans.grants_priority` con `default false`, que
-- es lo correcto —ningún plan concede nada hasta que alguien lo diga— pero
-- deja un cabo: `create_restavor_space()` sigue creando los tres planes sin
-- marcar ninguno, así que un espacio creado a partir de ahora tendría
-- `set_request_priority_order()` en pie y ningún restaurante capaz de
-- llamarla. Sería la octava vez que una función del servidor no tiene
-- quien la use, y esta vez por un valor por omisión.
--
-- Se arreglan las dos mitades: la función, para los espacios que vengan, y
-- los planes que YA existen, para los que hay.
--
-- El nombre 'Premium' aparece aquí y no en una regla: esto es la semilla
-- del espacio de Restavor, donde el plan alto se llama así por decisión de
-- producto (CLAUDE.md). Lo que NO hace ninguna función es mirar ese nombre
-- para decidir nada — eso se rompería con el segundo cliente de la
-- plataforma, y por eso la cualidad vive en una columna.

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
    (space_id, name, price_cents, included_small, included_photo, included_medium,
     included_large, start_sla_hours, grants_priority)
  values
    (v_space_id, 'Básico', 9900, 0, 0, 0, 0, 48, false),
    (v_space_id, 'Impulso', 39900, 16, 12, 3, 0, 24, false),
    -- Premium es el que deja al restaurante ordenar sus cambios por
    -- importancia (migración 62). Se marca AQUÍ, al crear el espacio: si
    -- no, cada espacio nuevo nacería con la función existiendo y sin que
    -- ningún plan la concediera, o sea sin que nadie pudiera usarla.
    (v_space_id, 'Premium', 59900, 25, 24, 5, 1, 24, true);

  -- Servicio Menú Diario (RN-COM-08 a 10).
  insert into public.services (space_id, name, price_cents, price_premium_cents)
  values (v_space_id, 'Menú Diario', 22900, 19900);

  -- Versión inicial de los tres calendarios (RN-CLK-10, Hito 3): las
  -- ventanas en sí las define src/core/business-clock.ts, esto solo dice
  -- desde cuándo están vigentes para este espacio.
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

-- Los espacios que ya existen. `where name = 'Premium'` es aceptable en una
-- migración de datos —está corrigiendo filas concretas que se crearon con
-- ese nombre— y no en una regla, que es la diferencia que importa.
update public.plans set grants_priority = true
where name = 'Premium' and not grants_priority;
