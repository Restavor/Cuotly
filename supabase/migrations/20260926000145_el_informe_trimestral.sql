-- ============================================================
-- Migración 145 · El informe trimestral y el tráfico de la web
--                 (decisión 83, RN-REP-32 y RN-REP-33)
-- ============================================================
--
-- La ficha nueva del plan Básico (26/09/2026) dice que su informe es un
-- **resumen trimestral automático** con visitas, usuarios, páginas más
-- visitadas, dispositivos y la evolución general del tráfico. Hasta hoy
-- Cuotly solo sabía hacer el informe del mes, y el informe de un Básico no
-- llevaba ni una cifra de la web. Bosco eligió el 26/09/2026 construirlo
-- como **una característica más del plan**: el Básico recibe el trimestral
-- y deja de recibir el mensual.
--
-- Lo que hace este archivo es la parte genérica —sirve a cualquier plan
-- de cualquier espacio—; ponérsela al Básico de Restavor es la migración
-- 146, junto con su precio nuevo.
--
--   1. `plans.report_period`: `month` o `quarter`. Es un término de lo que
--      el restaurante contrata, así que se versiona como los demás
--      (RN-COM-20): `create_plan()` y `revise_plan()` lo reciben, y la
--      comparativa de versiones lo cuenta. Pasar de mensual a trimestral
--      **perjudica** (recibe menos informes) y pide aceptación (RN-COM-23).
--   2. `establishment_report_period()`: el periodo del informe de un
--      restaurante, con la misma puerta que `establishment_report_level()`.
--      Sin plan, `month`: un restaurante solo con Menú Diario sigue
--      recibiendo el suyo cada mes, como hasta hoy.
--   3. La sección nueva **"Tráfico de la web"** (`web_traffic`, RN-REP-33),
--      en los cinco niveles y marcada por omisión en las tres familias. Es
--      "lo que pasó" y no una valoración (decisión 58): no rompe la
--      escalera, porque la llevan todos.
--
-- Lo que NO hace: no programa ningún envío. "Automático" en la ficha es lo
-- que ya hace el informe del mes (RN-REP-27, RN-REP-28): Cuotly lo genera
-- con un botón y sin nada que rellenar, con el resumen escrito por frases
-- fijas, y el equipo lo sube. Qué periodo toca lo decide el servidor con
-- el plan, no la pantalla.
--
-- Se comprueba con `supabase/tests/el_informe_trimestral.sql`.

-- ------------------------------------------------------------
-- 1 · El periodo del informe, en el plan
-- ------------------------------------------------------------
alter table public.plans
  add column report_period text not null default 'month'
    check (report_period in ('month', 'quarter'));

comment on column public.plans.report_period is
  'RN-REP-32 · cada cuánto recibe su informe el restaurante con este plan:
   `month` (el último mes natural cerrado) o `quarter` (el último trimestre
   natural cerrado). Se versiona como el resto de lo que se contrata
   (RN-COM-20). No se deduce del nombre del plan: Cuotly es multiempresa.';

-- ------------------------------------------------------------
-- 2 · El periodo del informe de un restaurante
-- ------------------------------------------------------------
--
-- Misma puerta que `establishment_report_level()` (migración 111): el plan
-- que paga un restaurante lo ven su espacio y él, nadie más. A quien no le
-- corresponde se le contesta `month`, que es la misma respuesta que a un
-- restaurante sin plan, así que de la respuesta no se deduce nada.
create or replace function public.establishment_report_period(p_establishment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
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

  -- Con más de un plan vivo —no debería, RN-COM-13— manda el más
  -- frecuente: es el que da más al restaurante.
  select p.report_period into v_period
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = p_establishment_id
    and s.kind = 'plan'
    and s.status = 'active'
  order by (p.report_period = 'month') desc
  limit 1;

  return coalesce(v_period, 'month');
end;
$$;

comment on function public.establishment_report_period(uuid) is
  'RN-REP-32 · cada cuánto recibe su informe este restaurante, del plan
   vigente. Sin plan, `month`. Contesta `month` también a quien no es de su
   espacio ni tiene acceso vivo: qué plan paga un restaurante no es de nadie
   más.';

revoke all on function public.establishment_report_period(uuid) from public, anon;
grant execute on function public.establishment_report_period(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3 · Qué cambia entre dos versiones: el periodo cuenta
-- ------------------------------------------------------------
--
-- Mismo cuerpo que la migración 131 con una fila más. Mensual es mejor que
-- trimestral para el restaurante: son más informes por el mismo precio.
create or replace function public.plan_terms_diff_internal(p_from uuid, p_to uuid)
returns table (field text, old_value text, new_value text, better boolean, client_visible boolean)
language sql
stable
security definer
set search_path = public
as $$
  select d.field, d.o, d.n, d.better, d.visible
  from public.plans a
  join public.plans b on b.id = p_to
  cross join lateral (values
    ('price_cents', a.price_cents::text, b.price_cents::text, b.price_cents < a.price_cents, true, 1),
    ('included_small', a.included_small::text, b.included_small::text, b.included_small > a.included_small, true, 2),
    ('included_photo', a.included_photo::text, b.included_photo::text, b.included_photo > a.included_photo, true, 3),
    ('included_medium', a.included_medium::text, b.included_medium::text, b.included_medium > a.included_medium, true, 4),
    ('included_large', a.included_large::text, b.included_large::text, b.included_large > a.included_large, true, 5),
    ('start_sla_hours', a.start_sla_hours::text, b.start_sla_hours::text, b.start_sla_hours < a.start_sla_hours, true, 6),
    ('execution_sla_small', a.execution_sla_small::text, b.execution_sla_small::text, b.execution_sla_small < a.execution_sla_small, true, 7),
    ('execution_sla_photo', a.execution_sla_photo::text, b.execution_sla_photo::text, b.execution_sla_photo < a.execution_sla_photo, true, 8),
    ('execution_sla_medium', a.execution_sla_medium::text, b.execution_sla_medium::text, b.execution_sla_medium < a.execution_sla_medium, true, 9),
    ('execution_sla_large', a.execution_sla_large::text, b.execution_sla_large::text, b.execution_sla_large < a.execution_sla_large, true, 10),
    ('can_order_requests', a.can_order_requests::text, b.can_order_requests::text, b.can_order_requests and not a.can_order_requests, true, 11),
    ('grants_priority', a.grants_priority::text, b.grants_priority::text, b.grants_priority and not a.grants_priority, true, 12),
    ('report_level', a.report_level, b.report_level,
      public.report_level_rank(b.report_level) > public.report_level_rank(a.report_level), true, 13),
    -- RN-REP-32 · más frecuente es mejor.
    ('report_period', a.report_period, b.report_period, b.report_period = 'month' and a.report_period = 'quarter', true, 14),
    ('watches_reviews', a.watches_reviews::text, b.watches_reviews::text, b.watches_reviews and not a.watches_reviews, true, 15),
    ('queue_rank', a.queue_rank::text, b.queue_rank::text, b.queue_rank > a.queue_rank, false, 16)
  ) as d(field, o, n, better, visible, ord)
  where a.id = p_from and d.o is distinct from d.n
  order by d.ord;
$$;

revoke all on function public.plan_terms_diff_internal(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4 · Crear y editar un plan, con el periodo
-- ------------------------------------------------------------
--
-- Mismos cuerpos que la migración 131 con un parámetro más, al final y con
-- valor por omisión. Cambia la firma, así que se borran y se crean: dejar
-- las dos convivir haría que una llamada sin el parámetro nuevo fuera
-- ambigua.
--
-- En `create_plan()` el valor por omisión es `month`, lo de siempre. En
-- `revise_plan()` es "el que tiene": una llamada que no lo manda no le
-- cambia a nadie el periodo sin querer.
drop function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text);
drop function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text);

create function public.create_plan(
  p_space_id uuid,
  p_name text,
  p_price_cents integer,
  p_included_small integer,
  p_included_photo integer,
  p_included_medium integer,
  p_included_large integer,
  p_start_sla_hours integer,
  p_execution_sla_small integer,
  p_execution_sla_photo integer,
  p_execution_sla_medium integer,
  p_execution_sla_large integer,
  p_can_order_requests boolean,
  p_grants_priority boolean,
  p_queue_rank integer,
  p_report_level text,
  p_watches_reviews boolean,
  p_idempotency_key text,
  p_report_period text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_period text := coalesce(p_report_period, 'month');
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

  if v_period not in ('month', 'quarter') then
    raise exception 'Periodo de informe desconocido: %', v_period;
  end if;

  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium, included_large,
     start_sla_hours, execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large,
     can_order_requests, grants_priority, queue_rank, report_level, report_period, watches_reviews,
     published_by, publish_key)
  values
    (p_space_id, v_name, p_price_cents, p_included_small, p_included_photo, p_included_medium, p_included_large,
     p_start_sla_hours, p_execution_sla_small, p_execution_sla_photo, p_execution_sla_medium, p_execution_sla_large,
     coalesce(p_can_order_requests, false), coalesce(p_grants_priority, false), coalesce(p_queue_rank, 0),
     p_report_level, v_period, coalesce(p_watches_reviews, false),
     auth.uid(), p_idempotency_key)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  select p_space_id, auth.uid(), 'plan.created', 'plan', v_id, to_jsonb(p) - 'publish_key'
  from public.plans p where p.id = v_id;

  return v_id;
end;
$$;

comment on function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text, text) is
  'RN-COM-19 · crea un plan (su versión 1). Solo `manage_space`. Clave de
   idempotencia: la misma clave devuelve el mismo plan. RN-REP-32 · el
   periodo del informe, `month` si no se dice.';

revoke all on function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text, text) from public, anon;
grant execute on function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text, text) to authenticated;

create function public.revise_plan(
  p_plan_id uuid,
  p_price_cents integer,
  p_included_small integer,
  p_included_photo integer,
  p_included_medium integer,
  p_included_large integer,
  p_start_sla_hours integer,
  p_execution_sla_small integer,
  p_execution_sla_photo integer,
  p_execution_sla_medium integer,
  p_execution_sla_large integer,
  p_can_order_requests boolean,
  p_grants_priority boolean,
  p_queue_rank integer,
  p_report_level text,
  p_watches_reviews boolean,
  p_idempotency_key text,
  p_report_period text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  if coalesce(p_report_period, v_head.report_period) not in ('month', 'quarter') then
    raise exception 'Periodo de informe desconocido: %', p_report_period;
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

  -- Lo que cambia, término a término, para la auditoría.
  select coalesce(jsonb_object_agg(o.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}'::jsonb)
  into v_changes
  from jsonb_each(to_jsonb(v_head)) o
  join jsonb_each(to_jsonb(v_new)) n on n.key = o.key
  where o.value is distinct from n.value;

  if v_changes = '{}'::jsonb then
    raise exception 'No has cambiado ninguna condición del plan';
  end if;

  if not public.plan_lineage_in_use(v_head.lineage_id) then
    -- RN-COM-21 · nadie lo tiene: se edita en el sitio.
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
      publish_key = coalesce(p_idempotency_key, publish_key)
    where id = v_head.id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_head.space_id, auth.uid(), 'plan.edited', 'plan', v_head.id,
            (select jsonb_object_agg(key, value->'old') from jsonb_each(v_changes)),
            (select jsonb_object_agg(key, value->'new') from jsonb_each(v_changes))
              || jsonb_build_object('in_place', true));

    return v_head.id;
  end if;

  -- RN-COM-20 · alguien lo tiene: versión nueva, la anterior sustituida.
  update public.plans set superseded_at = now() where id = v_head.id;

  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium, included_large,
     start_sla_hours, execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large,
     can_order_requests, grants_priority, queue_rank, report_level, report_period, watches_reviews,
     lineage_id, revision, supersedes_id, published_by, publish_key)
  values
    (v_head.space_id, v_head.name, v_new.price_cents, v_new.included_small, v_new.included_photo,
     v_new.included_medium, v_new.included_large, v_new.start_sla_hours, v_new.execution_sla_small,
     v_new.execution_sla_photo, v_new.execution_sla_medium, v_new.execution_sla_large,
     v_new.can_order_requests, v_new.grants_priority, v_new.queue_rank, v_new.report_level,
     v_new.report_period, v_new.watches_reviews, v_head.lineage_id, v_head.revision + 1, v_head.id,
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
$$;

comment on function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text, text) is
  'RN-COM-20 y 21 · edita lo que se contrata: en el sitio si nadie lo
   tiene, versión nueva si alguien lo tiene. RN-REP-32 · sin periodo, se
   queda el que tenía.';

revoke all on function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text, text) from public, anon;
grant execute on function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5 · La sección "Tráfico de la web" (RN-REP-33)
-- ------------------------------------------------------------
--
-- Va la tercera, detrás de "Lo que ha pasado": primero se cuenta lo que se
-- hizo en la web y después quién la visitó.
create or replace function public.report_sections_catalogue()
returns text[]
language sql
immutable
as $$
  select array[
    'executive_summary', 'month_activity', 'web_traffic', 'operation', 'finance',
    'digital', 'opportunities', 'annexes'
  ];
$$;

revoke all on function public.report_sections_catalogue() from public, anon;
grant execute on function public.report_sections_catalogue() to authenticated;

-- Mismo cuerpo que la migración 113 con una rama más: en los cinco
-- niveles, igual que "Lo que ha pasado este mes".
create or replace function public.report_level_allows(p_level text, p_section text)
returns boolean
language sql
immutable
as $$
  select case p_section
    when 'executive_summary' then public.report_level_rank(p_level) >= 0
    -- RN-REP-18 · el relato del mes, con la bolsa y la ficha de cada
    -- cambio, en los cinco niveles. Es lo que pasó, no una valoración.
    when 'month_activity' then public.report_level_rank(p_level) >= 0
    -- RN-REP-33 (decisión 83) · las visitas, los usuarios, las páginas y
    -- los dispositivos de la web, en los cinco. También es lo que pasó.
    when 'web_traffic' then public.report_level_rank(p_level) >= 0
    -- RN-REP-15 (decisión 58) · los plazos y los tiempos, desde Impulso.
    when 'operation' then public.report_level_rank(p_level) >= 1
    when 'digital' then public.report_level_rank(p_level) >= 2
    when 'opportunities' then public.report_level_rank(p_level) >= 3
    when 'annexes' then public.report_level_rank(p_level) >= 3
    when 'finance' then public.report_level_rank(p_level) >= 3
    else false
  end;
$$;

comment on function public.report_level_allows(text, text) is
  'RN-REP-15 · si un nivel de informe admite una sección. Una sección
   desconocida es false, no true: en la duda no se manda de más.
   RN-REP-18 · `month_activity` entra en los cinco niveles; `operation`,
   desde `standard` (decisión 58). RN-REP-33 · `web_traffic`, en los cinco
   (decisión 83).';

revoke all on function public.report_level_allows(text, text) from public, anon;
grant execute on function public.report_level_allows(text, text) to authenticated;

-- Mismo cuerpo que la migración 112 con tres filas más: marcada en las
-- tres familias, porque es lo que el Básico paga y lo que la ficha promete.
create or replace function public.report_section_default_included(
  p_category text,
  p_section text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_category = 'operation' and p_section = 'executive_summary' then true
    when p_category = 'operation' and p_section = 'month_activity' then true
    when p_category = 'operation' and p_section = 'web_traffic' then true
    when p_category = 'operation' and p_section = 'operation' then true
    when p_category = 'operation' and p_section = 'finance' then false
    when p_category = 'operation' and p_section = 'digital' then false
    when p_category = 'operation' and p_section = 'opportunities' then false
    when p_category = 'operation' and p_section = 'annexes' then true
    when p_category = 'finance' and p_section = 'executive_summary' then true
    when p_category = 'finance' and p_section = 'month_activity' then true
    when p_category = 'finance' and p_section = 'web_traffic' then true
    when p_category = 'finance' and p_section = 'operation' then false
    when p_category = 'finance' and p_section = 'finance' then true
    when p_category = 'finance' and p_section = 'digital' then false
    when p_category = 'finance' and p_section = 'opportunities' then false
    when p_category = 'finance' and p_section = 'annexes' then true
    when p_category = 'digital' and p_section = 'executive_summary' then true
    when p_category = 'digital' and p_section = 'month_activity' then true
    when p_category = 'digital' and p_section = 'web_traffic' then true
    when p_category = 'digital' and p_section = 'operation' then false
    when p_category = 'digital' and p_section = 'finance' then false
    when p_category = 'digital' and p_section = 'digital' then true
    when p_category = 'digital' and p_section = 'opportunities' then false
    when p_category = 'digital' and p_section = 'annexes' then true
    else null
  end;
$$;

revoke all on function public.report_section_default_included(text, text) from public, anon;
grant execute on function public.report_section_default_included(text, text) to authenticated;

-- ------------------------------------------------------------
-- 6 · Los informes que ya existen y todavía se pueden editar
-- ------------------------------------------------------------
--
-- El mismo criterio que la migración 112 con "Lo que ha pasado este mes":
-- `set_report_sections()` actualiza por clave, así que sin la fila la
-- sección quedaría inalcanzable en ese informe para siempre. Lo enviado o
-- archivado no se toca (RN-REP-12, P4), y entra **desmarcada**: en un
-- borrador que alguien ya revisó, marcarla sola cambiaría el informe sin
-- que nadie lo pidiera.
insert into public.report_sections (space_id, report_id, section_key, position, included, updated_by)
select r.space_id, r.id, 'web_traffic',
       coalesce((select max(rs.position) from public.report_sections rs where rs.report_id = r.id), 0) + 1,
       false,
       r.updated_by
from public.reports r
where r.status not in ('sent', 'archived')
  and not exists (
    select 1 from public.report_sections rs
    where rs.report_id = r.id and rs.section_key = 'web_traffic'
  );
