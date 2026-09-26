-- ============================================================
-- Migración 148 · El catálogo de Restavor queda en Básico, Impulso y
--                 Premium (decisión 84, PRD §6.1, RN-COM-27)
-- ============================================================
--
-- Decisión 83: "Van a ser solo básico, impulso y premium". Impulso+ y
-- Premium+ iban a archivarse cuando llegaran las fichas de Impulso y
-- Premium. Bosco, 26/09/2026, preguntado si se quitan ya ahora que no hay
-- ningún restaurante: **"Sí, ya"** (decisión 84).
--
-- Qué hace:
--
--   1. `create_restavor_space()` siembra solo Básico, Impulso y Premium.
--      Mismo cuerpo que la migración 146 sin las filas de Impulso+ y
--      Premium+. Los turnos no cambian: Básico 0, Impulso 1, Premium 2.
--   2. En el espacio `restavor`, **archiva** Impulso+ y Premium+ (RN-COM-27):
--      salen de las altas y de los cambios de plan nuevos, y nada más.
--      No se borran —siguen en el historial de versiones— y si alguien los
--      tuviera los conservaría hasta pasar a otro. Mismo apunte que
--      `archive_plan()` (`plan.archived`), sin actor porque lo hace la
--      migración.
--   3. La guía del centro de ayuda que nombraba los cinco planes nombra
--      los tres (decisión 84: "que solo nombre básico, impulso y premium").
--
-- Lo que **no** hace: no toca Impulso ni Premium, que siguen con sus
-- condiciones del 16/09/2026 hasta que lleguen sus fichas, ni el servicio
-- Menú Diario. Bosco decidió el mismo día que Menú Diario deja de venderse
-- aparte y va incluido en Impulso y Premium; eso irá en su propia
-- migración con las reglas del PRD escritas antes (decisión 84, punto 3).
--
-- Consecuencia que hay que tener presente: Premium+ era el único plan con
-- `grants_priority` (precio reducido de Menú Diario y oportunidades
-- avanzadas), con un cambio grande incluido, con la vigilancia de reseñas
-- y con los plazos de realización cortos. Desde hoy ningún plan que se
-- pueda contratar en Restavor tiene nada de eso. El servidor lo sigue
-- sabiendo hacer —son columnas del plan— y la ficha del Premium dirá qué
-- vuelve y a qué plan.
--
-- Se comprueba con `supabase/tests/planes_de_restavor.sql`.

-- ------------------------------------------------------------
-- 1 · La semilla de Restavor
-- ------------------------------------------------------------
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

  -- Los planes de mantenimiento de Restavor (PRD §6.1): Básico, Impulso y
  -- Premium (decisión 84). Precios en céntimos, más IVA. Básico, de la
  -- ficha del 26/09/2026 (decisión 83); Impulso y Premium, de las del
  -- 16/09/2026 hasta que lleguen las suyas.
  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium,
     included_large, start_sla_hours, grants_priority, queue_rank, can_order_requests,
     report_level, report_period, watches_reviews,
     execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large)
  values
    -- RN-COM-03 · `queue_rank` es el turno dentro del mismo plazo. Básico
    -- en 0, por detrás de todos (decisión 83); Premium delante de Impulso
    -- (decisión 55).
    -- RN-REP-32 · el Básico recibe su informe cada trimestre.
    (v_space_id, 'Básico',    2000,  0,  0, 0, 0, 48, false, 0, false, 'basic',    'quarter', false, 72, 72, 72, 120),
    (v_space_id, 'Impulso',  29900,  6,  6, 1, 0, 48, false, 1, false, 'standard', 'month',   false, 72, 72, 72, 120),
    (v_space_id, 'Premium',  49900, 10, 12, 2, 0, 24, false, 2, true,  'advanced', 'month',   false, 72, 72, 72, 120);

  -- Servicio Menú Diario (RN-COM-08 a 10): 229 € + IVA, o 199 € + IVA con
  -- un plan que conceda prioridad (hoy ninguno); 30 actualizaciones por
  -- ciclo. Cambiará cuando se construya Menú Diario dentro de Impulso y
  -- Premium (decisión 84).
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
-- 2 · Impulso+ y Premium+ archivados en el espacio que ya existe
-- ------------------------------------------------------------
--
-- En una función, como las migraciones 96 y 146, para que la suite pueda
-- ejecutarla sobre un espacio de prueba con el catálogo viejo. Es interna:
-- nadie la llama por RPC (CLAUDE.md).
--
-- Idempotente: solo archiva la cabeza de cada linaje que siga sin
-- archivar, así que la segunda vez no hace nada ni escribe otro apunte.
create or replace function public.retire_plus_plans_internal(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select p.id, p.lineage_id
    from public.plans p
    where p.space_id = p_space_id
      and p.name in ('Impulso+', 'Premium+')
      and p.superseded_at is null
      and p.archived_at is null
    order by p.name
    for update
  loop
    -- RN-COM-27 · solo sale de las altas y de los cambios nuevos.
    update public.plans set archived_at = now() where id = r.id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (p_space_id, null, 'plan.archived', 'plan', r.lineage_id,
            jsonb_build_object('plan_id', r.id,
                               'in_use', public.plan_lineage_in_use(r.lineage_id),
                               'via', 'migración 148 · el catálogo de Básico, Impulso y Premium'));
  end loop;
end;
$$;

comment on function public.retire_plus_plans_internal(uuid) is
  'Interna, 26/09/2026 (decisión 84) · archiva Impulso+ y Premium+ en un
   espacio con el catálogo de Restavor (RN-COM-27): salen de las altas y de
   los cambios de plan nuevos, quien los tenga los conserva, y nada se
   borra. Idempotente.';

revoke all on function public.retire_plus_plans_internal(uuid) from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in select id from public.spaces where slug = 'restavor' loop
    perform public.retire_plus_plans_internal(r.id);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3 · La guía del centro de ayuda (RN-SOP-10)
-- ------------------------------------------------------------
--
-- Las guías se versionan por migración: cambiar una es una versión más.
-- La frase de Premium+ (el cambio grande y el precio reducido de Menú
-- Diario) se va con él.
update public.help_articles
set
  body = 'Las mensualidades de tus restaurantes se emiten solas el día uno y quedan registradas en un libro de apuntes con signo: emitir suma, cobrar resta y reembolsar vuelve a sumar. Nunca hay un saldo que se edite a mano. El estado de cada cobro se deriva del libro y del vencimiento.
Los planes que vendes son Básico, Impulso y Premium, más IVA, con tres meses de permanencia y sin bolsas de horas. El Básico no incluye cambios ni fotografías.
Tu suscripción a Cuotly es otra cosa: Pro (149 € al mes, 5 establecimientos y 5 usuarios, adicionales a 25 € y 15 €) o Agency (499 € al mes), más IVA, con 7 días de prueba. Se paga también por transferencia o Bizum, la confirma Cuotly, y un impago archiva el espacio en solo lectura a las 72 horas del vencimiento, recuperable durante 30 días pagando. Todo esto lo ves en Ajustes, en Suscripción.',
  version = version + 1,
  updated_at = now()
where slug = 'cobros-a-tus-restaurantes-y-tu-suscripcion'
  and (body like '%Impulso+%' or body like '%Premium+%');
