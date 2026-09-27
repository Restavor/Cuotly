-- ============================================================
-- Migración 153 · Informes y oportunidades (decisión 85, PRD §41.7,
--                 RN-CRE-26 y RN-CRE-27)
-- ============================================================
--
-- Punto 6 del plan de la decisión 85.
--
--   · RN-CRE-26 · **un plan puede recibir el informe mensual y además el
--     trimestral**: `plans.report_period` gana el valor `both`. Es un término
--     del plan, versionado como los demás (RN-COM-20): `create_plan()` y
--     `revise_plan()` lo aceptan, y la comparativa de versiones lo ordena
--     trimestral < mensual < los dos (más informes, mejor; RN-COM-23).
--     `establishment_report_period()` lo devuelve tal cual; qué informes
--     tocan con cada valor lo resuelve la pantalla con el mismo dato.
--   · RN-CRE-27 · **el restaurante ve las oportunidades que el equipo le
--     sube al informe**, sin distinguir básicas de avanzadas, si su plan
--     incluye algo (créditos o cambios por categoría); el de entrada (nada
--     incluido, el Básico) no ve ninguna. `client_opportunity_access()` pasa
--     de `none` / `basic` / `advanced` a `none` / `report`. La detección para
--     el equipo no cambia (RN-OPP-01 a RN-OPP-07).
--
-- Por qué hace falta ya: con los planes en créditos (RN-CRE-01) Impulso y
-- Premium no incluyen ningún cambio por categoría, y la regla de antes los
-- trataba como el de entrada: no habrían visto ninguna oportunidad.
--
-- Se comprueba con `supabase/tests/informes_y_oportunidades.sql`.

-- ------------------------------------------------------------
-- 1 · RN-CRE-26 · el mensual y además el trimestral
-- ------------------------------------------------------------
alter table public.plans drop constraint plans_report_period_check;
alter table public.plans add constraint plans_report_period_check
  check (report_period in ('month', 'quarter', 'both'));

comment on column public.plans.report_period is
  'RN-REP-32 y RN-CRE-26 · cada cuánto recibe su informe el restaurante con este plan:
   `month` (el último mes natural cerrado), `quarter` (el último trimestre natural
   cerrado) o `both` (los dos). Se versiona como el resto de lo que se contrata.';

-- Trimestral < mensual < los dos. Para la comparativa de versiones.
create or replace function public.report_period_rank(p_period text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_period when 'quarter' then 1 when 'month' then 2 when 'both' then 3 else 0 end;
$$;

revoke all on function public.report_period_rank(text) from public, anon, authenticated;

create or replace function public.establishment_report_period(p_establishment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_period text;
begin
  if v_space_id is null then
    return 'month';
  end if;

  if not public.is_space_member(v_space_id)
     and not exists (
       select 1 from public.establishment_memberships em
       where em.establishment_id = p_establishment_id
         and em.user_id = auth.uid()
         and em.revoked_at is null
     ) then
    return 'month';
  end if;

  -- Con más de un plan vivo —no debería, RN-COM-13— manda el que da más
  -- informes al restaurante (RN-CRE-26: los dos, luego el mensual).
  select p.report_period into v_period
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = p_establishment_id
    and s.kind = 'plan'
    and s.status = 'active'
  order by public.report_period_rank(p.report_period) desc
  limit 1;

  return coalesce(v_period, 'month');
end;
$function$;

create or replace function public.create_plan(p_space_id uuid, p_name text, p_price_cents integer, p_included_small integer, p_included_photo integer, p_included_medium integer, p_included_large integer, p_start_sla_hours integer, p_execution_sla_small integer, p_execution_sla_photo integer, p_execution_sla_medium integer, p_execution_sla_large integer, p_can_order_requests boolean, p_grants_priority boolean, p_queue_rank integer, p_report_level text, p_watches_reviews boolean, p_idempotency_key text, p_report_period text DEFAULT NULL::text, p_included_credits_half integer DEFAULT NULL::integer, p_includes_daily_menu boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_period text := coalesce(p_report_period, 'month');
  v_credits integer := coalesce(p_included_credits_half, 0);
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio crea planes (RN-COM-19)';
  end if;

  if p_idempotency_key is not null then
    select id into v_id from public.plans where space_id = p_space_id and publish_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if v_name = '' then
    raise exception 'El plan necesita un nombre';
  end if;

  if exists (
    select 1 from public.plans
    where space_id = p_space_id and superseded_at is null and archived_at is null
      and lower(name) = lower(v_name)
  ) then
    raise exception 'Ya hay un plan con ese nombre';
  end if;

  perform public.assert_plan_terms(p_price_cents, p_included_small, p_included_photo, p_included_medium,
    p_included_large, p_start_sla_hours, p_execution_sla_small, p_execution_sla_photo,
    p_execution_sla_medium, p_execution_sla_large, p_report_level);

  -- RN-CRE-26 · `both`: el mensual y además el trimestral.
  if v_period not in ('month', 'quarter', 'both') then
    raise exception 'Periodo de informe desconocido: %', v_period;
  end if;

  if v_credits < 0 then
    raise exception 'Los créditos incluidos no pueden ser negativos';
  end if;

  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium, included_large,
     start_sla_hours, execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large,
     can_order_requests, grants_priority, queue_rank, report_level, report_period, watches_reviews,
     included_credits_half, includes_daily_menu, published_by, publish_key)
  values
    (p_space_id, v_name, p_price_cents, p_included_small, p_included_photo, p_included_medium, p_included_large,
     p_start_sla_hours, p_execution_sla_small, p_execution_sla_photo, p_execution_sla_medium, p_execution_sla_large,
     coalesce(p_can_order_requests, false), coalesce(p_grants_priority, false), coalesce(p_queue_rank, 0),
     p_report_level, v_period, coalesce(p_watches_reviews, false),
     v_credits, coalesce(p_includes_daily_menu, false), auth.uid(), p_idempotency_key)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  select p_space_id, auth.uid(), 'plan.created', 'plan', v_id, to_jsonb(p) - 'publish_key'
  from public.plans p where p.id = v_id;

  return v_id;
end;
$function$;

create or replace function public.revise_plan(p_plan_id uuid, p_price_cents integer, p_included_small integer, p_included_photo integer, p_included_medium integer, p_included_large integer, p_start_sla_hours integer, p_execution_sla_small integer, p_execution_sla_photo integer, p_execution_sla_medium integer, p_execution_sla_large integer, p_can_order_requests boolean, p_grants_priority boolean, p_queue_rank integer, p_report_level text, p_watches_reviews boolean, p_idempotency_key text, p_report_period text DEFAULT NULL::text, p_included_credits_half integer DEFAULT NULL::integer, p_includes_daily_menu boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_head public.plans%rowtype;
  v_new public.plans%rowtype;
  v_id uuid;
  v_changes jsonb;
begin
  select * into v_head from public.plans where id = p_plan_id for update;

  if v_head.id is null then
    raise exception 'Plan no encontrado';
  end if;

  if not public.has_capability(v_head.space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio edita planes (RN-COM-19)';
  end if;

  if p_idempotency_key is not null then
    select id into v_id from public.plans
    where space_id = v_head.space_id and publish_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if v_head.superseded_at is not null then
    raise exception 'Esta versión ya está sustituida: edita la vigente';
  end if;

  if v_head.archived_at is not null then
    raise exception 'Un plan archivado no se edita';
  end if;

  perform public.assert_plan_terms(p_price_cents, p_included_small, p_included_photo, p_included_medium,
    p_included_large, p_start_sla_hours, p_execution_sla_small, p_execution_sla_photo,
    p_execution_sla_medium, p_execution_sla_large, p_report_level);

  -- RN-CRE-26 · `both`: el mensual y además el trimestral.
  if coalesce(p_report_period, v_head.report_period) not in ('month', 'quarter', 'both') then
    raise exception 'Periodo de informe desconocido: %', p_report_period;
  end if;

  if coalesce(p_included_credits_half, v_head.included_credits_half) < 0 then
    raise exception 'Los créditos incluidos no pueden ser negativos';
  end if;

  v_new := v_head;
  v_new.price_cents := p_price_cents;
  v_new.included_small := p_included_small;
  v_new.included_photo := p_included_photo;
  v_new.included_medium := p_included_medium;
  v_new.included_large := p_included_large;
  v_new.start_sla_hours := p_start_sla_hours;
  v_new.execution_sla_small := p_execution_sla_small;
  v_new.execution_sla_photo := p_execution_sla_photo;
  v_new.execution_sla_medium := p_execution_sla_medium;
  v_new.execution_sla_large := p_execution_sla_large;
  v_new.can_order_requests := coalesce(p_can_order_requests, false);
  v_new.grants_priority := coalesce(p_grants_priority, false);
  v_new.queue_rank := coalesce(p_queue_rank, 0);
  v_new.report_level := p_report_level;
  v_new.report_period := coalesce(p_report_period, v_head.report_period);
  v_new.watches_reviews := coalesce(p_watches_reviews, false);
  v_new.included_credits_half := coalesce(p_included_credits_half, v_head.included_credits_half);
  v_new.includes_daily_menu := coalesce(p_includes_daily_menu, v_head.includes_daily_menu);

  select coalesce(jsonb_object_agg(o.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}'::jsonb)
  into v_changes
  from jsonb_each(to_jsonb(v_head)) o
  join jsonb_each(to_jsonb(v_new)) n on n.key = o.key
  where o.value is distinct from n.value;

  if v_changes = '{}'::jsonb then
    raise exception 'No has cambiado ninguna condición del plan';
  end if;

  if not public.plan_lineage_in_use(v_head.lineage_id) then
    update public.plans set
      price_cents = v_new.price_cents,
      included_small = v_new.included_small,
      included_photo = v_new.included_photo,
      included_medium = v_new.included_medium,
      included_large = v_new.included_large,
      start_sla_hours = v_new.start_sla_hours,
      execution_sla_small = v_new.execution_sla_small,
      execution_sla_photo = v_new.execution_sla_photo,
      execution_sla_medium = v_new.execution_sla_medium,
      execution_sla_large = v_new.execution_sla_large,
      can_order_requests = v_new.can_order_requests,
      grants_priority = v_new.grants_priority,
      queue_rank = v_new.queue_rank,
      report_level = v_new.report_level,
      report_period = v_new.report_period,
      watches_reviews = v_new.watches_reviews,
      included_credits_half = v_new.included_credits_half,
      includes_daily_menu = v_new.includes_daily_menu,
      publish_key = coalesce(p_idempotency_key, publish_key)
    where id = v_head.id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_head.space_id, auth.uid(), 'plan.edited', 'plan', v_head.id,
            (select jsonb_object_agg(key, value->'old') from jsonb_each(v_changes)),
            (select jsonb_object_agg(key, value->'new') from jsonb_each(v_changes))
              || jsonb_build_object('in_place', true));

    return v_head.id;
  end if;

  update public.plans set superseded_at = now() where id = v_head.id;

  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium, included_large,
     start_sla_hours, execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large,
     can_order_requests, grants_priority, queue_rank, report_level, report_period, watches_reviews,
     included_credits_half, includes_daily_menu, lineage_id, revision, supersedes_id, published_by, publish_key)
  values
    (v_head.space_id, v_head.name, v_new.price_cents, v_new.included_small, v_new.included_photo,
     v_new.included_medium, v_new.included_large, v_new.start_sla_hours, v_new.execution_sla_small,
     v_new.execution_sla_photo, v_new.execution_sla_medium, v_new.execution_sla_large,
     v_new.can_order_requests, v_new.grants_priority, v_new.queue_rank, v_new.report_level,
     v_new.report_period, v_new.watches_reviews, v_new.included_credits_half, v_new.includes_daily_menu,
     v_head.lineage_id, v_head.revision + 1, v_head.id,
     auth.uid(), p_idempotency_key)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_head.space_id, auth.uid(), 'plan.revised', 'plan', v_head.lineage_id,
          (select jsonb_object_agg(key, value->'old') from jsonb_each(v_changes))
            || jsonb_build_object('plan_id', v_head.id, 'revision', v_head.revision),
          (select jsonb_object_agg(key, value->'new') from jsonb_each(v_changes))
            || jsonb_build_object('plan_id', v_id, 'revision', v_head.revision + 1,
                                  'harms', public.revision_harms_internal('plan', v_head.id, v_id)));

  perform public.notify_revision_published(v_head.space_id, 'plan', v_head.lineage_id, v_id);

  return v_id;
end;
$function$;

create or replace function public.plan_terms_diff_internal(p_from uuid, p_to uuid)
 RETURNS TABLE(field text, old_value text, new_value text, better boolean, client_visible boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.field, d.o, d.n, d.better, d.visible
  from public.plans a
  join public.plans b on b.id = p_to
  cross join lateral (values
    ('price_cents', a.price_cents::text, b.price_cents::text, b.price_cents < a.price_cents, true, 1),
    ('included_credits_half', a.included_credits_half::text, b.included_credits_half::text,
      b.included_credits_half > a.included_credits_half, true, 2),
    ('includes_daily_menu', a.includes_daily_menu::text, b.includes_daily_menu::text,
      b.includes_daily_menu and not a.includes_daily_menu, true, 2),
    ('included_small', a.included_small::text, b.included_small::text, b.included_small > a.included_small, true, 3),
    ('included_photo', a.included_photo::text, b.included_photo::text, b.included_photo > a.included_photo, true, 4),
    ('included_medium', a.included_medium::text, b.included_medium::text, b.included_medium > a.included_medium, true, 5),
    ('included_large', a.included_large::text, b.included_large::text, b.included_large > a.included_large, true, 6),
    ('start_sla_hours', a.start_sla_hours::text, b.start_sla_hours::text, b.start_sla_hours < a.start_sla_hours, true, 7),
    ('execution_sla_small', a.execution_sla_small::text, b.execution_sla_small::text, b.execution_sla_small < a.execution_sla_small, true, 8),
    ('execution_sla_photo', a.execution_sla_photo::text, b.execution_sla_photo::text, b.execution_sla_photo < a.execution_sla_photo, true, 9),
    ('execution_sla_medium', a.execution_sla_medium::text, b.execution_sla_medium::text, b.execution_sla_medium < a.execution_sla_medium, true, 10),
    ('execution_sla_large', a.execution_sla_large::text, b.execution_sla_large::text, b.execution_sla_large < a.execution_sla_large, true, 11),
    ('can_order_requests', a.can_order_requests::text, b.can_order_requests::text, b.can_order_requests and not a.can_order_requests, true, 12),
    ('grants_priority', a.grants_priority::text, b.grants_priority::text, b.grants_priority and not a.grants_priority, true, 13),
    ('report_level', a.report_level, b.report_level,
      public.report_level_rank(b.report_level) > public.report_level_rank(a.report_level), true, 14),
    -- RN-CRE-26 · trimestral < mensual < los dos: más informes es mejor.
    ('report_period', a.report_period, b.report_period,
      public.report_period_rank(b.report_period) > public.report_period_rank(a.report_period), true, 15),
    ('watches_reviews', a.watches_reviews::text, b.watches_reviews::text, b.watches_reviews and not a.watches_reviews, true, 16),
    ('queue_rank', a.queue_rank::text, b.queue_rank::text, b.queue_rank > a.queue_rank, false, 17)
  ) as d(field, o, n, better, visible, ord)
  where a.id = p_from and d.o is distinct from d.n
  order by d.ord;
$function$;

-- ------------------------------------------------------------
-- 2 · RN-CRE-27 · las oportunidades que el equipo sube al informe
-- ------------------------------------------------------------
create or replace function public.client_opportunity_access(p_establishment_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Quién puede preguntarlo: quien puede leer ese restaurante (el equipo
  -- del espacio y el propio restaurante). Sin esto, cualquiera con sesión
  -- sabría de qué plan es cualquier restaurante de cualquier espacio.
  --
  -- RN-CRE-27 · con algo incluido —créditos o cambios por categoría— ve
  -- las que el equipo le sube al informe (`report`); el plan de entrada,
  -- sin nada incluido, ninguna. Por lo que el plan ES, no por su nombre.
  select coalesce(
    (
      select case
        when not public.can_read_establishment(p_establishment_id) then 'none'
        when p.included_credits_half
             + p.included_small + p.included_photo + p.included_medium + p.included_large = 0 then 'none'
        else 'report'
      end
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
      where s.establishment_id = p_establishment_id
        and s.kind = 'plan'
        and s.status = 'active'
      order by s.started_at desc
      limit 1
    ),
    'none'
  );
$function$;

-- Está en la política `opportunities_select`: conserva el `execute` de
-- `authenticated` (CLAUDE.md). Ya no mira el alcance: sin diferencia entre
-- básicas y avanzadas para el cliente (RN-CRE-27). El estado (subida al
-- informe) lo sigue mirando `opportunity_is_visible_to_client()`.
create or replace function public.client_sees_opportunity(p_establishment_id uuid, p_scope text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.can_read_establishment_as_client(p_establishment_id)
     and public.client_opportunity_access(p_establishment_id) = 'report';
$function$;
