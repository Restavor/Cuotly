-- ============================================================
-- Migración 146 · El plan Básico de la ficha del 26/09/2026
--                 (decisión 83, PRD §6.1, RN-COM-01 y RN-COM-03)
-- ============================================================
--
-- Restavor rehace su catálogo: quedarán Básico, Impulso y Premium. Bosco
-- manda las fichas una a una y esta es la del **Básico**, la primera. Lo
-- que cambia respecto de lo que había (migración 96, decisión 39):
--
--   · **20 € + IVA al mes**, antes 99 €.
--   · **Informe trimestral** en vez de mensual (RN-REP-32, migración 145),
--     con el tráfico de la web dentro (RN-REP-33).
--   · **Turno por detrás de Impulso y Premium.** La ficha lo dice así:
--     "las solicitudes del Plan Básico tendrán prioridad inferior a los
--     planes Impulso y Premium". Hasta hoy Básico, Impulso e Impulso+
--     compartían el turno 0. Se sube un escalón **a todos los demás** en
--     vez de bajar el Básico: un restaurante sin plan (solo Menú Diario)
--     sigue en 0, que es el turno de Básico (RN-COM-12 dice que se comporta
--     como Básico), y el orden de siempre entre los otros no se toca
--     —Premium+ sigue delante de Premium, y Premium delante de Impulso—.
--
-- Lo que **no** cambia: sigue sin incluir ningún cambio (RN-COM-01), 48 h
-- laborables para empezar, 3 meses de permanencia, sin bolsas de horas,
-- y las condiciones publicadas, que Bosco confirmó que no han cambiado.
--
-- Lo que **no** hace este archivo: no toca Impulso, Impulso+, Premium ni
-- Premium+ más allá del turno. Sus fichas llegan después y cada una irá en
-- su migración. La vigilancia de la web, las copias y la analítica de la
-- ficha las hace Restavor por su cuenta (decisión 83, punto 2): son
-- descripción comercial del plan (PRD §6.1), no una regla del servidor.
--
-- **Dónde se aplica.** En la semilla (`create_restavor_space()`) y en el
-- espacio `restavor`, donde ningún restaurante tiene Básico ni los demás
-- planes: se editan en el sitio con su apunte de auditoría (RN-COM-21). Si
-- el día que se aplique alguien ya tuviera uno de estos planes, la
-- migración **se para** en vez de reescribirle el contrato: entonces el
-- cambio va por una versión nueva desde la pantalla de planes (RN-COM-20),
-- que es lo que la protege. El espacio de demostración no lo toca: se
-- rehace entero con `supabase/seed/espacio-demo.sql`, que ya lo trae.
--
-- Se comprueba con `supabase/tests/planes_de_restavor.sql`.

-- ------------------------------------------------------------
-- 1 · La semilla de Restavor
-- ------------------------------------------------------------
--
-- Mismo cuerpo que la migración 134; solo cambian la fila del Básico y los
-- turnos.
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

  -- Los planes de mantenimiento de Restavor (PRD §6.1). Precios en
  -- céntimos, más IVA. Básico, de la ficha del 26/09/2026 (decisión 83);
  -- los demás, de las del 16/09/2026 hasta que lleguen las suyas.
  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium,
     included_large, start_sla_hours, grants_priority, queue_rank, can_order_requests,
     report_level, report_period, watches_reviews,
     execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large)
  values
    -- RN-COM-03 · `queue_rank` es el turno dentro del mismo plazo. Básico
    -- en 0, por detrás de todos (decisión 83); Premium+ delante de Premium
    -- y Premium delante del resto (decisión 55).
    -- RN-REP-32 · el Básico recibe su informe cada trimestre.
    (v_space_id, 'Básico',    2000,  0,  0, 0, 0, 48, false, 0, false, 'basic',         'quarter', false, 72, 72, 72, 120),
    (v_space_id, 'Impulso',  29900,  6,  6, 1, 0, 48, false, 1, false, 'standard',      'month',   false, 72, 72, 72, 120),
    (v_space_id, 'Impulso+', 39900, 16, 12, 3, 0, 24, false, 1, false, 'standard_plus', 'month',   false, 72, 72, 72, 120),
    (v_space_id, 'Premium',  49900, 10, 12, 2, 0, 24, false, 2, true,  'advanced',      'month',   false, 72, 72, 72, 120),
    (v_space_id, 'Premium+', 59900, 25, 24, 5, 1, 24, true,  3, true,  'complete',      'month',   true,  48, 48, 72,  96);

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

-- ------------------------------------------------------------
-- 2 · El espacio de Restavor que ya existe
-- ------------------------------------------------------------
--
-- En una función, como la migración 96, para que la suite pueda ejecutarla
-- sobre un espacio de prueba con el catálogo viejo y comprobar qué hace y
-- qué no. Es interna: nadie la llama por RPC (CLAUDE.md).
--
-- Idempotente: el Básico solo se toca si todavía es el de 99 € y los
-- turnos solo se suben si el Básico todavía empata con alguien. Aplicarla
-- dos veces no sube dos escalones.
create or replace function public.apply_basic_plan_sheet_internal(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_basico public.plans%rowtype;
  v_precio boolean;
  v_turnos boolean;
  r record;
begin
  select * into v_basico
  from public.plans
  where space_id = p_space_id and name = 'Básico' and superseded_at is null and archived_at is null;

  if v_basico.id is null then
    return;
  end if;

  -- Qué queda por hacer. El precio, si todavía es el de 99 €; los turnos,
  -- si el Básico todavía empata con alguno (y entonces se suben todos).
  v_precio := v_basico.price_cents = 9900;
  v_turnos := exists (
    select 1 from public.plans p
    where p.space_id = p_space_id and p.id <> v_basico.id
      and p.superseded_at is null and p.archived_at is null
      and p.queue_rank <= v_basico.queue_rank
  );

  -- RN-COM-20 · lo que alguien tiene contratado no se reescribe en el
  -- sitio. Aquí no debería haber nadie; si lo hay, se para.
  if exists (
    select 1 from public.plans p
    where p.space_id = p_space_id and p.superseded_at is null and p.archived_at is null
      and public.plan_lineage_in_use(p.lineage_id)
      and ((v_precio and p.id = v_basico.id) or (v_turnos and p.id <> v_basico.id))
  ) then
    raise exception 'Un plan de Restavor que cambia ya lo tiene algún restaurante: publícalo como versión nueva desde Planes (RN-COM-20)';
  end if;

  -- 1 · El Básico de la ficha: 20 € y el informe cada trimestre.
  if v_precio then
    update public.plans
    set price_cents = 2000, report_period = 'quarter'
    where id = v_basico.id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (p_space_id, null, 'plan.edited', 'plan', v_basico.id,
            jsonb_build_object('price_cents', v_basico.price_cents, 'report_period', v_basico.report_period),
            jsonb_build_object('price_cents', 2000, 'report_period', 'quarter',
                               'in_place', true, 'via', 'migración 146 · ficha del Básico del 26/09/2026'));
  end if;

  -- 2 · Los demás, un escalón por delante del Básico. Solo si todavía
  --     empata con alguno: así no se suben dos veces.
  if v_turnos then
    for r in
      select p.id, p.queue_rank from public.plans p
      where p.space_id = p_space_id and p.id <> v_basico.id
        and p.superseded_at is null and p.archived_at is null
    loop
      update public.plans set queue_rank = r.queue_rank + 1 where id = r.id;

      insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
      values (p_space_id, null, 'plan.edited', 'plan', r.id,
              jsonb_build_object('queue_rank', r.queue_rank),
              jsonb_build_object('queue_rank', r.queue_rank + 1,
                                 'in_place', true, 'via', 'migración 146 · el Básico va por detrás'));
    end loop;
  end if;
end;
$$;

comment on function public.apply_basic_plan_sheet_internal(uuid) is
  'Interna, 26/09/2026 (decisión 83) · el Básico de la ficha nueva en un
   espacio con el catálogo de Restavor: 20 € + IVA, informe trimestral y un
   escalón por detrás de todos los demás en la cola. Idempotente. Se para
   si alguien tiene ya uno de los planes que cambia (RN-COM-20).';

revoke all on function public.apply_basic_plan_sheet_internal(uuid) from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in select id from public.spaces where slug = 'restavor' loop
    perform public.apply_basic_plan_sheet_internal(r.id);
  end loop;
end $$;
