-- ============================================================
-- Migración 134 · Un Restavor recién creado nace con Premium+ entero
--                 (RN-SLA-18, decisión 61; RN-INT-10, decisión 60)
-- ============================================================
--
-- Las migraciones 117 (vigilancia de reseñas) y 118 (plazo de realización
-- del plan) añadieron a `plans` las columnas `watches_reviews` y
-- `execution_sla_*`, y rellenaron con un `update` los planes que YA
-- existían. Pero no tocaron `create_restavor_space()`, que siembra los
-- cinco planes de Restavor en un proyecto nuevo: un Restavor creado desde
-- cero nacía con Premium+ sin vigilancia de reseñas y con los plazos de
-- todos (72, 72, 72 y 120 h) en vez de 48, 48, 72 y 96.
--
-- En el proyecto real no pasa: el espacio `restavor` ya existía cuando se
-- aplicaron la 117 y la 118, y sus planes tienen los valores buenos
-- (comprobado en vivo el 23/09/2026). Es el mismo hueco que tenía el
-- sembrado `espacio-demo.sql`, arreglado en el commit anterior.
--
-- Lo único que cambia en la función es el `insert` de los planes. Y de
-- paso se le retira el EXECUTE a `anon`: la función comprueba
-- `is_platform_owner()` por su cuenta y sin sesión no hace nada, pero una
-- función de escritura abierta por RPC sin sesión es superficie que no
-- hace falta (el mismo criterio que la migración 56).
--
-- Se comprueba con `supabase/tests/planes_de_restavor.sql`.

create or replace function public.create_restavor_space()
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
     included_large, start_sla_hours, grants_priority, queue_rank, can_order_requests,
     report_level, watches_reviews,
     execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large)
  values
    -- RN-COM-03 (decisión 55) y RN-REP-15 (decisión 56) · `grants_priority`
    -- es el plan alto —precio de Menú Diario y oportunidades avanzadas, solo
    -- Premium+—, `queue_rank` es el turno dentro del mismo plazo,
    -- `can_order_requests` es si el restaurante puede ordenar sus cambios,
    -- y `report_level` es qué informe recibe.
    -- Migración 134 · y las dos que faltaban: `watches_reviews` (RN-INT-10,
    -- decisión 60) y los plazos de realización (RN-SLA-18, decisión 61),
    -- que solo cambian en Premium+. Los demás, la tabla de RN-SLA-12.
    (v_space_id, 'Básico',   9900,   0,  0, 0, 0, 48, false, 0, false, 'basic',         false, 72, 72, 72, 120),
    (v_space_id, 'Impulso',  29900,  6,  6, 1, 0, 48, false, 0, false, 'standard',      false, 72, 72, 72, 120),
    (v_space_id, 'Impulso+', 39900, 16, 12, 3, 0, 24, false, 0, false, 'standard_plus', false, 72, 72, 72, 120),
    (v_space_id, 'Premium',  49900, 10, 12, 2, 0, 24, false, 1, true,  'advanced',      false, 72, 72, 72, 120),
    (v_space_id, 'Premium+', 59900, 25, 24, 5, 1, 24, true,  2, true,  'complete',      true,  48, 48, 72,  96);

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

revoke all on function public.create_restavor_space() from public, anon;
grant execute on function public.create_restavor_space() to authenticated;
