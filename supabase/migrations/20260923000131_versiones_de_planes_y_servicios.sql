-- ============================================================
-- Migración 131 · Crear, editar y archivar planes y servicios
--                 (decisión 72, PRD §6.5, RN-COM-19 a RN-COM-30)
-- ============================================================
--
-- Hasta hoy el precio, las cuotas y los plazos de un plan vivían en su
-- fila de `plans` sin versión, y cualquiera con `manage_space` podía
-- cambiarlos con un UPDATE directo: el contrato de todos los restaurantes
-- que lo tenían cambiaba en el acto, sin aviso ni aceptación.
--
-- **Cómo se versiona.** Cada versión es una fila nueva de `plans` (o de
-- `services`) enlazada con la anterior: mismo `lineage_id`, `revision` + 1
-- y `supersedes_id` apuntando a la que sustituye. Se hace así, y no con una
-- tabla aparte, porque decenas de funciones leen el contrato de una
-- suscripción con `subscriptions.plan_id → plans.*` (el precio de la
-- mensualidad, la bolsa del ciclo, los plazos que se congelan al aceptar,
-- la prioridad, el nivel de informe…). Con la versión en su propia fila,
-- todas siguen diciendo la verdad sin tocarlas: una suscripción apunta a
-- la versión que tiene, y pasar de versión es cambiar a qué fila apunta.
--
-- Lo que hace esta migración:
--
--   1. Las columnas de linaje y archivo en `plans` y `services`, y el
--      cierre de los UPDATE/INSERT directos: desde hoy solo se escribe por
--      las funciones de abajo (RN-COM-19).
--   2. Las condiciones (migración 75) pasan a colgar del linaje, no de la
--      fila: son del producto, no de cada versión de su precio.
--   3. Qué cambia y a favor de quién (`plan_terms_diff_internal`), que
--      decide si una versión pide aceptación (RN-COM-23) y alimenta la
--      comparativa de M55 (RN-COM-30).
--   4. Crear, editar, renombrar y archivar planes y servicios.
--   5. La aceptación de una versión que perjudica: en Cuotly o registrada
--      por el equipo con contrato, igual que las condiciones.
--   6. El paso de versión en la renovación (RN-COM-22, RN-COM-24): se
--      engancha donde nace cada ciclo —la bolsa, las actualizaciones de
--      Menú Diario y la mensualidad—, para que el ciclo nuevo empiece ya
--      con la versión que le toca y el que está en curso no cambie nunca
--      (RN-COM-28).
--   7. Las guardas: nadie contrata ni cambia a una versión sustituida o
--      archivada (RN-COM-27), y el paso de versión no se hace por ningún
--      otro camino.
--   8. Lo que leen las pantallas: el estado de cada restaurante frente a
--      la versión vigente y la comparativa.
--   9. El aviso al restaurante cuando se publica una versión.

-- ------------------------------------------------------------
-- 1 · Linaje y archivo
-- ------------------------------------------------------------
alter table public.plans
  add column lineage_id uuid references public.plans (id),
  add column revision integer not null default 1 check (revision >= 1),
  add column supersedes_id uuid references public.plans (id),
  add column published_at timestamptz,
  add column published_by uuid references public.profiles (id),
  add column superseded_at timestamptz,
  add column archived_at timestamptz,
  add column publish_key text;

update public.plans set lineage_id = id, published_at = created_at;

alter table public.plans
  alter column lineage_id set not null,
  alter column published_at set not null,
  alter column published_at set default now();

create unique index plans_lineage_revision_idx on public.plans (lineage_id, revision);
create unique index plans_supersedes_idx on public.plans (supersedes_id) where supersedes_id is not null;
create unique index plans_one_head_idx on public.plans (lineage_id) where superseded_at is null;
create unique index plans_publish_key_idx on public.plans (space_id, publish_key) where publish_key is not null;

comment on column public.plans.lineage_id is
  'RN-COM-20 · el plan al que pertenece esta versión. En la primera versión
   es su propio id. Las condiciones (plan_versions) cuelgan de aquí.';
comment on column public.plans.revision is
  'RN-COM-20 · número de versión del precio y las cuotas dentro del linaje.';
comment on column public.plans.superseded_at is
  'Cuándo se publicó la versión que sustituye a esta. `null` es la vigente:
   solo hay una por linaje (plans_one_head_idx).';
comment on column public.plans.archived_at is
  'RN-COM-27 · archivado: no admite altas ni cambios nuevos; quien lo tiene
   lo conserva. Nunca se borra.';

alter table public.services
  add column lineage_id uuid references public.services (id),
  add column revision integer not null default 1 check (revision >= 1),
  add column supersedes_id uuid references public.services (id),
  add column published_at timestamptz,
  add column published_by uuid references public.profiles (id),
  add column superseded_at timestamptz,
  add column archived_at timestamptz,
  add column publish_key text;

update public.services set lineage_id = id, published_at = created_at;

alter table public.services
  alter column lineage_id set not null,
  alter column published_at set not null,
  alter column published_at set default now();

create unique index services_lineage_revision_idx on public.services (lineage_id, revision);
create unique index services_supersedes_idx on public.services (supersedes_id) where supersedes_id is not null;
create unique index services_one_head_idx on public.services (lineage_id) where superseded_at is null;
create unique index services_publish_key_idx on public.services (space_id, publish_key) where publish_key is not null;

-- La primera versión es su propio linaje. Lo pone un disparador para que
-- las altas que no pasan por create_plan() —el sembrado, el catálogo de
-- Restavor— sigan funcionando sin saber que el linaje existe.
create or replace function public.catalogue_default_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.lineage_id is null then
    new.lineage_id := new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.catalogue_default_lineage() from public, anon, authenticated;

create trigger plans_default_lineage
  before insert on public.plans
  for each row execute function public.catalogue_default_lineage();

create trigger services_default_lineage
  before insert on public.services
  for each row execute function public.catalogue_default_lineage();

-- RN-COM-19 · desde hoy solo escriben las funciones. El UPDATE directo era
-- justo lo que esta migración viene a impedir: cambiar el precio de un
-- plan contratado sin versión, sin aviso y sin aceptación.
drop policy if exists plans_insert on public.plans;
drop policy if exists plans_update on public.plans;
drop policy if exists services_insert on public.services;
drop policy if exists services_update on public.services;

-- Sin política de INSERT ni de UPDATE, RLS rechaza el alta y deja el
-- UPDATE en cero filas. No se revocan los privilegios de tabla: con RLS
-- basta, y la suite 2 cuenta con que un DELETE directo afecte a cero filas
-- en vez de fallar.

-- ------------------------------------------------------------
-- 2 · Las condiciones cuelgan del linaje
-- ------------------------------------------------------------
create or replace function public.plan_lineage(p_plan_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select lineage_id from public.plans where id = p_plan_id;
$$;

create or replace function public.service_lineage(p_service_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select lineage_id from public.services where id = p_service_id;
$$;

comment on function public.plan_lineage(uuid) is
  'El linaje de una versión de plan. Está dentro de la política de
   plan_versions: por eso conserva el EXECUTE de authenticated (CLAUDE.md).
   Solo devuelve un identificador; no dice nada del plan.';
comment on function public.service_lineage(uuid) is
  'El linaje de una versión de servicio. Dentro de la política de
   service_versions: conserva el EXECUTE de authenticated (CLAUDE.md).';

revoke all on function public.plan_lineage(uuid) from public, anon;
grant execute on function public.plan_lineage(uuid) to authenticated;
revoke all on function public.service_lineage(uuid) from public, anon;
grant execute on function public.service_lineage(uuid) to authenticated;

drop policy plan_versions_select on public.plan_versions;
create policy plan_versions_select on public.plan_versions
for select using (
  public.is_space_member(space_id)
  or exists (
    select 1 from public.subscriptions s
    where s.kind = 'plan'
      and s.status = 'active'
      and public.plan_lineage(s.plan_id) = plan_versions.plan_id
      and public.can_read_establishment(s.establishment_id)
  )
);

drop policy service_versions_select on public.service_versions;
create policy service_versions_select on public.service_versions
for select using (
  public.is_space_member(space_id)
  or exists (
    select 1 from public.subscriptions s
    where s.kind = 'service'
      and s.status = 'active'
      and public.service_lineage(s.service_id) = service_versions.service_id
      and public.can_read_establishment(s.establishment_id)
  )
);

-- Publicar condiciones: se guardan en el linaje, se pase la versión que se
-- pase. El aviso llega a todos los que tienen cualquier versión del plan.
create or replace function public.notify_terms_version_published(
  p_space_id uuid,
  p_kind text,
  p_subject_id uuid,
  p_version_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_sub record;
  v_recipient uuid;
  v_sent integer := 0;
begin
  if p_kind not in ('plan', 'service') then
    raise exception 'Tipo de condiciones desconocido: %', p_kind;
  end if;

  v_slug := public.space_slug(p_space_id);

  for v_sub in
    select s.id, s.establishment_id
    from public.subscriptions s
    where s.space_id = p_space_id
      and s.status = 'active'
      and s.kind = p_kind
      and ((p_kind = 'plan' and public.plan_lineage(s.plan_id) = public.plan_lineage(p_subject_id))
        or (p_kind = 'service' and public.service_lineage(s.service_id) = public.service_lineage(p_subject_id)))
  loop
    for v_recipient in
      select em.user_id
      from public.establishment_memberships em
      where em.establishment_id = v_sub.establishment_id
        and em.revoked_at is null
        and em.role = 'local_owner'
      union
      select gm.user_id
      from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = v_sub.establishment_id
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    loop
      if public.emit_notification(
           p_space_id, v_recipient, 'terms_version_published', 'client',
           'establishment', v_sub.establishment_id,
           '/espacios/' || v_slug || '/restaurantes/' || v_sub.establishment_id::text,
           'terms_version_published:' || p_version_id::text || ':' || v_sub.establishment_id::text,
           v_sub.establishment_id) is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.notify_terms_version_published(uuid, text, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.publish_plan_conditions(p_plan_id uuid, p_conditions text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_lineage uuid;
  v_previous integer;
  v_version_id uuid;
begin
  select space_id, lineage_id into v_space_id, v_lineage from public.plans where id = p_plan_id;

  if v_space_id is null then
    raise exception 'Plan no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio publica las condiciones de un plan';
  end if;

  if length(btrim(coalesce(p_conditions, ''))) = 0 then
    raise exception 'Las condiciones no pueden estar vacías';
  end if;

  perform 1 from public.plans where id = v_lineage for update;

  select max(version) into v_previous from public.plan_versions where plan_id = v_lineage;

  insert into public.plan_versions (space_id, plan_id, version, conditions, published_by)
  values (v_space_id, v_lineage, coalesce(v_previous, 0) + 1, p_conditions, auth.uid())
  returning id into v_version_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'plan.conditions_published', 'plan', v_lineage,
    jsonb_build_object('version', v_previous),
    jsonb_build_object('version', coalesce(v_previous, 0) + 1, 'version_id', v_version_id)
  );

  perform public.notify_terms_version_published(v_space_id, 'plan', v_lineage, v_version_id);

  return v_version_id;
end;
$$;

comment on function public.publish_plan_conditions(uuid, text) is
  'RN-DAT-07 · publica una versión nueva de las condiciones de un plan. Se
   guardan en su linaje (migración 131): valen para todas las versiones de
   su precio. Nunca edita la anterior. Solo `manage_space`.';

create or replace function public.publish_service_conditions(p_service_id uuid, p_conditions text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_lineage uuid;
  v_previous integer;
  v_version_id uuid;
begin
  select space_id, lineage_id into v_space_id, v_lineage from public.services where id = p_service_id;

  if v_space_id is null then
    raise exception 'Servicio no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio publica las condiciones de un servicio';
  end if;

  if length(btrim(coalesce(p_conditions, ''))) = 0 then
    raise exception 'Las condiciones no pueden estar vacías';
  end if;

  perform 1 from public.services where id = v_lineage for update;

  select max(version) into v_previous from public.service_versions where service_id = v_lineage;

  insert into public.service_versions (space_id, service_id, version, conditions, published_by)
  values (v_space_id, v_lineage, coalesce(v_previous, 0) + 1, p_conditions, auth.uid())
  returning id into v_version_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'service.conditions_published', 'service', v_lineage,
    jsonb_build_object('version', v_previous),
    jsonb_build_object('version', coalesce(v_previous, 0) + 1, 'version_id', v_version_id)
  );

  perform public.notify_terms_version_published(v_space_id, 'service', v_lineage, v_version_id);

  return v_version_id;
end;
$$;

comment on function public.publish_service_conditions(uuid, text) is
  'RN-DAT-07 · publica una versión nueva de las condiciones de un servicio,
   en su linaje (migración 131). Nunca edita la anterior. Solo `manage_space`.';

-- El catálogo de condiciones: una fila por plan o servicio VIGENTE (la
-- versión cabeza de su linaje), con la última versión de sus condiciones.
create or replace function public.conditions_catalogue(p_space_id uuid)
returns table (
  subject_type text,
  subject_id uuid,
  subject_name text,
  version_id uuid,
  version integer,
  published_at timestamptz,
  conditions text
)
language sql
stable
security definer
set search_path = public
as $$
  select 'plan'::text, p.id, p.name, pv.id, pv.version, pv.published_at, pv.conditions
  from public.plans p
  left join lateral (
    select v.id, v.version, v.published_at, v.conditions
    from public.plan_versions v where v.plan_id = p.lineage_id
    order by v.version desc limit 1
  ) pv on true
  where p.space_id = p_space_id and p.superseded_at is null and public.is_space_member(p_space_id)

  union all

  select 'service'::text, s.id, s.name, sv.id, sv.version, sv.published_at, sv.conditions
  from public.services s
  left join lateral (
    select v.id, v.version, v.published_at, v.conditions
    from public.service_versions v where v.service_id = s.lineage_id
    order by v.version desc limit 1
  ) sv on true
  where s.space_id = p_space_id and s.superseded_at is null and public.is_space_member(p_space_id)

  order by 1, 3;
$$;

create or replace function public.assert_terms_version_current(
  p_subscription_id uuid,
  p_version_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_lineage uuid;
  v_version integer;
  v_latest integer;
begin
  select kind, plan_id, service_id into v_sub from public.subscriptions where id = p_subscription_id;

  if v_sub.kind = 'plan' then
    v_lineage := public.plan_lineage(v_sub.plan_id);
    select version into v_version from public.plan_versions
    where id = p_version_id and plan_id = v_lineage;
    select max(version) into v_latest from public.plan_versions where plan_id = v_lineage;
  else
    v_lineage := public.service_lineage(v_sub.service_id);
    select version into v_version from public.service_versions
    where id = p_version_id and service_id = v_lineage;
    select max(version) into v_latest from public.service_versions where service_id = v_lineage;
  end if;

  if v_version is null then
    raise exception 'Esa versión de las condiciones no es de este plan o servicio';
  end if;

  if v_version <> v_latest then
    raise exception 'Hay una versión más reciente de las condiciones (v%): es la que hay que aceptar', v_latest;
  end if;

  return v_version;
end;
$$;

revoke all on function public.assert_terms_version_current(uuid, uuid) from public, anon, authenticated;

create or replace function public.subscription_terms(p_subscription_id uuid)
returns table (
  subject_type text,
  subject_name text,
  current_version_id uuid,
  current_version integer,
  current_published_at timestamptz,
  current_conditions text,
  accepted_version_id uuid,
  accepted_version integer,
  accepted_at timestamptz,
  accepted_channel text,
  evidence_file_id uuid,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_cur record;
  v_acc record;
  v_lineage uuid;
begin
  select s.id, s.space_id, s.establishment_id, s.kind, s.plan_id, s.service_id into v_sub
  from public.subscriptions s where s.id = p_subscription_id;

  if v_sub.id is null then
    return;
  end if;

  if not (public.is_space_member(v_sub.space_id) or public.can_read_establishment(v_sub.establishment_id)) then
    return;
  end if;

  if v_sub.kind = 'plan' then
    v_lineage := public.plan_lineage(v_sub.plan_id);
    subject_name := (select p.name from public.plans p where p.id = v_sub.plan_id);
    select v.id, v.version, v.published_at, v.conditions into v_cur
    from public.plan_versions v where v.plan_id = v_lineage
    order by v.version desc limit 1;
    select ta.plan_version_id as version_id, v.version, ta.accepted_at, ta.channel, ta.evidence_file_id into v_acc
    from public.terms_acceptances ta
    join public.plan_versions v on v.id = ta.plan_version_id
    where ta.subscription_id = v_sub.id
    order by v.version desc limit 1;
  else
    v_lineage := public.service_lineage(v_sub.service_id);
    subject_name := (select sv.name from public.services sv where sv.id = v_sub.service_id);
    select v.id, v.version, v.published_at, v.conditions into v_cur
    from public.service_versions v where v.service_id = v_lineage
    order by v.version desc limit 1;
    select ta.service_version_id as version_id, v.version, ta.accepted_at, ta.channel, ta.evidence_file_id into v_acc
    from public.terms_acceptances ta
    join public.service_versions v on v.id = ta.service_version_id
    where ta.subscription_id = v_sub.id
    order by v.version desc limit 1;
  end if;

  subject_type := v_sub.kind;
  current_version_id := v_cur.id;
  current_version := v_cur.version;
  current_published_at := v_cur.published_at;
  current_conditions := v_cur.conditions;
  accepted_version_id := v_acc.version_id;
  accepted_version := v_acc.version;
  accepted_at := v_acc.accepted_at;
  accepted_channel := v_acc.channel;
  evidence_file_id := v_acc.evidence_file_id;
  status := case
    when v_cur.id is null then 'no_terms'
    when v_acc.version_id is null then 'pending'
    when v_acc.version_id = v_cur.id then 'accepted'
    else 'outdated'
  end;

  return next;
end;
$$;

-- ------------------------------------------------------------
-- 3 · Qué cambia entre dos versiones, y a favor de quién
-- ------------------------------------------------------------
--
-- Una fila por término que cambia, con su valor anterior y el nuevo como
-- texto y `better` = el cambio favorece al restaurante. `client_visible`
-- es falso solo para `queue_rank`: el turno en la cola es el orden de
-- trabajo del equipo y el cliente no lo ve (RN-COM-03). Por eso tampoco
-- cuenta para decidir si una versión le perjudica: no se le puede pedir
-- que acepte algo que no se le enseña. Sí crea versión, porque cambia
-- cómo se presta el servicio.
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
    ('watches_reviews', a.watches_reviews::text, b.watches_reviews::text, b.watches_reviews and not a.watches_reviews, true, 14),
    ('queue_rank', a.queue_rank::text, b.queue_rank::text, b.queue_rank > a.queue_rank, false, 15)
  ) as d(field, o, n, better, visible, ord)
  where a.id = p_from and d.o is distinct from d.n
  order by d.ord;
$$;

-- En un servicio, el precio con Premium+ vacío es "paga el normal"; por eso
-- se compara el precio EFECTIVO para quien tiene Premium+ (RN-COM-08).
create or replace function public.service_terms_diff_internal(p_from uuid, p_to uuid)
returns table (field text, old_value text, new_value text, better boolean, client_visible boolean)
language sql
stable
security definer
set search_path = public
as $$
  select d.field, d.o, d.n, d.better, true
  from public.services a
  join public.services b on b.id = p_to
  cross join lateral (values
    ('price_cents', a.price_cents::text, b.price_cents::text, b.price_cents < a.price_cents, 1),
    ('price_premium_cents', a.price_premium_cents::text, b.price_premium_cents::text,
      coalesce(b.price_premium_cents, b.price_cents) < coalesce(a.price_premium_cents, a.price_cents), 2),
    ('included_updates', a.included_updates::text, b.included_updates::text, b.included_updates > a.included_updates, 3)
  ) as d(field, o, n, better, ord)
  where a.id = p_from and d.o is distinct from d.n
  order by d.ord;
$$;

revoke all on function public.plan_terms_diff_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_terms_diff_internal(uuid, uuid) from public, anon, authenticated;

-- RN-COM-23 · perjudica si UN término visible empeora, aunque otros mejoren.
create or replace function public.revision_harms_internal(p_kind text, p_from uuid, p_to uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_kind
    when 'plan' then exists (
      select 1 from public.plan_terms_diff_internal(p_from, p_to) d
      where d.client_visible and not d.better)
    else exists (
      select 1 from public.service_terms_diff_internal(p_from, p_to) d
      where not d.better)
  end;
$$;

revoke all on function public.revision_harms_internal(text, uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4 · Crear, editar, renombrar y archivar (RN-COM-19 a 21, 27)
-- ------------------------------------------------------------
--
-- Validar los términos es lo mismo al crear y al editar: se escribe una
-- vez. Los CHECK de la tabla vigilan igual, pero su mensaje no se entiende.
create or replace function public.assert_plan_terms(
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
  p_report_level text
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_price_cents is null or p_price_cents < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;
  if least(p_included_small, p_included_photo, p_included_medium, p_included_large) < 0
     or p_included_small is null or p_included_photo is null
     or p_included_medium is null or p_included_large is null then
    raise exception 'Los cambios incluidos no pueden ser negativos';
  end if;
  if p_start_sla_hours is null or p_start_sla_hours <= 0 then
    raise exception 'El plazo para comenzar tiene que ser de al menos una hora';
  end if;
  if least(p_execution_sla_small, p_execution_sla_photo, p_execution_sla_medium, p_execution_sla_large) <= 0
     or p_execution_sla_small is null or p_execution_sla_photo is null
     or p_execution_sla_medium is null or p_execution_sla_large is null then
    raise exception 'Los plazos de realización tienen que ser de al menos una hora';
  end if;
  if public.report_level_rank(p_report_level) < 0 then
    raise exception 'Nivel de informe desconocido: %', p_report_level;
  end if;
end;
$$;

revoke all on function public.assert_plan_terms(integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, text) from public, anon, authenticated;

-- ¿Tiene alguien este linaje, o lo va a tener por un cambio ya programado?
create or replace function public.plan_lineage_in_use(p_lineage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where p.lineage_id = p_lineage_id and s.status = 'active'
  ) or exists (
    select 1 from public.scheduled_plan_changes c
    join public.plans p on p.id = c.to_plan_id
    where p.lineage_id = p_lineage_id and c.state = 'pending'
  );
$$;

create or replace function public.service_lineage_in_use(p_lineage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    join public.services sv on sv.id = s.service_id
    where sv.lineage_id = p_lineage_id and s.status = 'active'
  );
$$;

revoke all on function public.plan_lineage_in_use(uuid) from public, anon, authenticated;
revoke all on function public.service_lineage_in_use(uuid) from public, anon, authenticated;

create or replace function public.create_plan(
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
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
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

  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium, included_large,
     start_sla_hours, execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large,
     can_order_requests, grants_priority, queue_rank, report_level, watches_reviews,
     published_by, publish_key)
  values
    (p_space_id, v_name, p_price_cents, p_included_small, p_included_photo, p_included_medium, p_included_large,
     p_start_sla_hours, p_execution_sla_small, p_execution_sla_photo, p_execution_sla_medium, p_execution_sla_large,
     coalesce(p_can_order_requests, false), coalesce(p_grants_priority, false), coalesce(p_queue_rank, 0),
     p_report_level, coalesce(p_watches_reviews, false),
     auth.uid(), p_idempotency_key)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  select p_space_id, auth.uid(), 'plan.created', 'plan', v_id, to_jsonb(p) - 'publish_key'
  from public.plans p where p.id = v_id;

  return v_id;
end;
$$;

comment on function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text) is
  'RN-COM-19 · crea un plan (su versión 1). Solo `manage_space`. Clave de
   idempotencia: la misma clave devuelve el mismo plan.';

revoke all on function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text) from public, anon;
grant execute on function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text) to authenticated;

-- RN-COM-20 y 21 · editar lo que se contrata.
--   · Sin nadie en el linaje: se edita la fila vigente, con auditoría.
--   · Con alguien: nace una versión nueva y la anterior queda sustituida.
-- Devuelve la fila vigente después de editar.
create or replace function public.revise_plan(
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
  p_idempotency_key text
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
     can_order_requests, grants_priority, queue_rank, report_level, watches_reviews,
     lineage_id, revision, supersedes_id, published_by, publish_key)
  values
    (v_head.space_id, v_head.name, v_new.price_cents, v_new.included_small, v_new.included_photo,
     v_new.included_medium, v_new.included_large, v_new.start_sla_hours, v_new.execution_sla_small,
     v_new.execution_sla_photo, v_new.execution_sla_medium, v_new.execution_sla_large,
     v_new.can_order_requests, v_new.grants_priority, v_new.queue_rank, v_new.report_level,
     v_new.watches_reviews, v_head.lineage_id, v_head.revision + 1, v_head.id, auth.uid(),
     p_idempotency_key)
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

create or replace function public.rename_plan(p_plan_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_name text := btrim(coalesce(p_name, ''));
begin
  select id, space_id, lineage_id, name into v_plan from public.plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plan no encontrado';
  end if;
  if not public.has_capability(v_plan.space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio edita planes (RN-COM-19)';
  end if;
  if v_name = '' then
    raise exception 'El plan necesita un nombre';
  end if;
  if v_name = v_plan.name then
    return;
  end if;
  if exists (
    select 1 from public.plans
    where space_id = v_plan.space_id and lineage_id <> v_plan.lineage_id
      and superseded_at is null and archived_at is null and lower(name) = lower(v_name)
  ) then
    raise exception 'Ya hay un plan con ese nombre';
  end if;

  -- RN-COM-20 · el nombre no crea versión: se corrige en todo el linaje.
  update public.plans set name = v_name where lineage_id = v_plan.lineage_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_plan.space_id, auth.uid(), 'plan.renamed', 'plan', v_plan.lineage_id,
          jsonb_build_object('name', v_plan.name), jsonb_build_object('name', v_name));
end;
$$;

create or replace function public.archive_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_head uuid;
begin
  select id, space_id, lineage_id into v_plan from public.plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plan no encontrado';
  end if;
  if not public.has_capability(v_plan.space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio archiva planes (RN-COM-19)';
  end if;

  select id into v_head from public.plans
  where lineage_id = v_plan.lineage_id and superseded_at is null for update;

  if (select archived_at from public.plans where id = v_head) is not null then
    return; -- Idempotente.
  end if;

  -- RN-COM-27 · solo sale de las altas y de los cambios nuevos.
  update public.plans set archived_at = now() where id = v_head;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_plan.space_id, auth.uid(), 'plan.archived', 'plan', v_plan.lineage_id,
          jsonb_build_object('plan_id', v_head, 'in_use', public.plan_lineage_in_use(v_plan.lineage_id)));
end;
$$;

revoke all on function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text) from public, anon;
grant execute on function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text) to authenticated;
revoke all on function public.rename_plan(uuid, text) from public, anon;
grant execute on function public.rename_plan(uuid, text) to authenticated;
revoke all on function public.archive_plan(uuid) from public, anon;
grant execute on function public.archive_plan(uuid) to authenticated;

-- Servicios: lo mismo, con sus tres términos (RN-COM-29).
create or replace function public.assert_service_terms(
  p_kind text,
  p_price_cents integer,
  p_price_premium_cents integer,
  p_included_updates integer
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_kind not in ('daily_menu', 'other') then
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
  if p_kind = 'daily_menu' and p_included_updates <= 0 then
    raise exception 'Menú Diario tiene que incluir al menos una actualización';
  end if;
end;
$$;

revoke all on function public.assert_service_terms(text, integer, integer, integer) from public, anon, authenticated;

create or replace function public.create_service(
  p_space_id uuid,
  p_name text,
  p_kind text,
  p_price_cents integer,
  p_price_premium_cents integer,
  p_included_updates integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio crea servicios (RN-COM-19)';
  end if;

  if p_idempotency_key is not null then
    select id into v_id from public.services where space_id = p_space_id and publish_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if v_name = '' then
    raise exception 'El servicio necesita un nombre';
  end if;

  if exists (
    select 1 from public.services
    where space_id = p_space_id and superseded_at is null and archived_at is null
      and lower(name) = lower(v_name)
  ) then
    raise exception 'Ya hay un servicio con ese nombre';
  end if;

  perform public.assert_service_terms(p_kind, p_price_cents, p_price_premium_cents, p_included_updates);

  insert into public.services
    (space_id, name, kind, price_cents, price_premium_cents, included_updates, published_by, publish_key)
  values
    (p_space_id, v_name, p_kind, p_price_cents, p_price_premium_cents, p_included_updates,
     auth.uid(), p_idempotency_key)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  select p_space_id, auth.uid(), 'service.created', 'service', v_id, to_jsonb(s) - 'publish_key'
  from public.services s where s.id = v_id;

  return v_id;
end;
$$;

create or replace function public.revise_service(
  p_service_id uuid,
  p_price_cents integer,
  p_price_premium_cents integer,
  p_included_updates integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_head public.services%rowtype;
  v_id uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  select * into v_head from public.services where id = p_service_id for update;

  if v_head.id is null then
    raise exception 'Servicio no encontrado';
  end if;

  if not public.has_capability(v_head.space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio edita servicios (RN-COM-19)';
  end if;

  if p_idempotency_key is not null then
    select id into v_id from public.services
    where space_id = v_head.space_id and publish_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if v_head.superseded_at is not null then
    raise exception 'Esta versión ya está sustituida: edita la vigente';
  end if;

  if v_head.archived_at is not null then
    raise exception 'Un servicio archivado no se edita';
  end if;

  perform public.assert_service_terms(v_head.kind, p_price_cents, p_price_premium_cents, p_included_updates);

  if v_head.price_cents is distinct from p_price_cents then
    v_old := v_old || jsonb_build_object('price_cents', v_head.price_cents);
    v_new := v_new || jsonb_build_object('price_cents', p_price_cents);
  end if;
  if v_head.price_premium_cents is distinct from p_price_premium_cents then
    v_old := v_old || jsonb_build_object('price_premium_cents', v_head.price_premium_cents);
    v_new := v_new || jsonb_build_object('price_premium_cents', p_price_premium_cents);
  end if;
  if v_head.included_updates is distinct from p_included_updates then
    v_old := v_old || jsonb_build_object('included_updates', v_head.included_updates);
    v_new := v_new || jsonb_build_object('included_updates', p_included_updates);
  end if;

  if v_new = '{}'::jsonb then
    raise exception 'No has cambiado ninguna condición del servicio';
  end if;

  if not public.service_lineage_in_use(v_head.lineage_id) then
    update public.services set
      price_cents = p_price_cents,
      price_premium_cents = p_price_premium_cents,
      included_updates = p_included_updates,
      publish_key = coalesce(p_idempotency_key, publish_key)
    where id = v_head.id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_head.space_id, auth.uid(), 'service.edited', 'service', v_head.id,
            v_old, v_new || jsonb_build_object('in_place', true));

    return v_head.id;
  end if;

  update public.services set superseded_at = now() where id = v_head.id;

  insert into public.services
    (space_id, name, kind, price_cents, price_premium_cents, included_updates,
     lineage_id, revision, supersedes_id, published_by, publish_key)
  values
    (v_head.space_id, v_head.name, v_head.kind, p_price_cents, p_price_premium_cents, p_included_updates,
     v_head.lineage_id, v_head.revision + 1, v_head.id, auth.uid(), p_idempotency_key)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_head.space_id, auth.uid(), 'service.revised', 'service', v_head.lineage_id,
          v_old || jsonb_build_object('service_id', v_head.id, 'revision', v_head.revision),
          v_new || jsonb_build_object('service_id', v_id, 'revision', v_head.revision + 1,
                                      'harms', public.revision_harms_internal('service', v_head.id, v_id)));

  perform public.notify_revision_published(v_head.space_id, 'service', v_head.lineage_id, v_id);

  return v_id;
end;
$$;

create or replace function public.rename_service(p_service_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service record;
  v_name text := btrim(coalesce(p_name, ''));
begin
  select id, space_id, lineage_id, name into v_service from public.services where id = p_service_id;
  if v_service.id is null then
    raise exception 'Servicio no encontrado';
  end if;
  if not public.has_capability(v_service.space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio edita servicios (RN-COM-19)';
  end if;
  if v_name = '' then
    raise exception 'El servicio necesita un nombre';
  end if;
  if v_name = v_service.name then
    return;
  end if;
  if exists (
    select 1 from public.services
    where space_id = v_service.space_id and lineage_id <> v_service.lineage_id
      and superseded_at is null and archived_at is null and lower(name) = lower(v_name)
  ) then
    raise exception 'Ya hay un servicio con ese nombre';
  end if;

  update public.services set name = v_name where lineage_id = v_service.lineage_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_service.space_id, auth.uid(), 'service.renamed', 'service', v_service.lineage_id,
          jsonb_build_object('name', v_service.name), jsonb_build_object('name', v_name));
end;
$$;

create or replace function public.archive_service(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service record;
  v_head uuid;
begin
  select id, space_id, lineage_id into v_service from public.services where id = p_service_id;
  if v_service.id is null then
    raise exception 'Servicio no encontrado';
  end if;
  if not public.has_capability(v_service.space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio archiva servicios (RN-COM-19)';
  end if;

  select id into v_head from public.services
  where lineage_id = v_service.lineage_id and superseded_at is null for update;

  if (select archived_at from public.services where id = v_head) is not null then
    return;
  end if;

  update public.services set archived_at = now() where id = v_head;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_service.space_id, auth.uid(), 'service.archived', 'service', v_service.lineage_id,
          jsonb_build_object('service_id', v_head, 'in_use', public.service_lineage_in_use(v_service.lineage_id)));
end;
$$;

revoke all on function public.create_service(uuid, text, text, integer, integer, integer, text) from public, anon;
grant execute on function public.create_service(uuid, text, text, integer, integer, integer, text) to authenticated;
revoke all on function public.revise_service(uuid, integer, integer, integer, text) from public, anon;
grant execute on function public.revise_service(uuid, integer, integer, integer, text) to authenticated;
revoke all on function public.rename_service(uuid, text) from public, anon;
grant execute on function public.rename_service(uuid, text) to authenticated;
revoke all on function public.archive_service(uuid) from public, anon;
grant execute on function public.archive_service(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5 · Aceptar una versión que perjudica (RN-COM-23)
-- ------------------------------------------------------------
create table public.revision_acceptances (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  plan_id uuid references public.plans (id),
  service_id uuid references public.services (id),
  channel text not null check (channel in ('in_app', 'external')),
  accepted_by uuid references public.profiles (id),
  recorded_by uuid references public.profiles (id),
  accepted_at timestamptz not null,
  evidence_file_id uuid references public.files (id),
  created_at timestamptz not null default now(),
  constraint revision_acceptances_one_subject check (
    (plan_id is not null and service_id is null)
    or (plan_id is null and service_id is not null)
  ),
  constraint revision_acceptances_channel_shape check (
    (channel = 'in_app' and accepted_by is not null and recorded_by is null and evidence_file_id is null)
    or (channel = 'external' and recorded_by is not null and accepted_by is null and evidence_file_id is not null)
  ),
  unique (subscription_id, plan_id),
  unique (subscription_id, service_id)
);

comment on table public.revision_acceptances is
  'RN-COM-23 · qué versión que le perjudicaba aceptó cada suscripción,
   cuándo y por qué canal. Libro: solo escriben accept_revision() y
   record_external_revision_acceptance(); nada lo edita ni lo borra.';

alter table public.revision_acceptances enable row level security;

create index revision_acceptances_subscription_idx on public.revision_acceptances (subscription_id);

create policy revision_acceptances_select on public.revision_acceptances
for select using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

-- `recorded_by` es la persona del equipo que registró la aceptación: el
-- restaurante no la ve (P7).
revoke select on public.revision_acceptances from anon, authenticated;
grant select (id, space_id, establishment_id, subscription_id, plan_id, service_id,
              channel, accepted_by, accepted_at, evidence_file_id, created_at)
  on public.revision_acceptances to authenticated;
revoke insert, update, delete on public.revision_acceptances from anon, authenticated;

create trigger revision_acceptances_guard_support_read_only
  before insert or update or delete on public.revision_acceptances
  for each row execute function public.guard_support_read_only();

-- RN-SUB-08 · un espacio congelado por impago tampoco acepta versiones.
create trigger revision_acceptances_cuotly_read_only
  before insert or update or delete on public.revision_acceptances
  for each row execute function public.guard_space_read_only();

-- RN-TRA-13 · al transferir el restaurante, sus aceptaciones se quedan con
-- la suscripción del espacio de origen, como las de las condiciones.
create or replace function public.establishment_transfer_tables()
returns table(table_name text, travels boolean)
language sql
immutable
as $$
  select * from (values
    -- Viaja: el trabajo del restaurante.
    ('requests', true), ('request_attachments', true),
    ('jobs', true), ('tasks', true), ('corrections', true),
    ('conversations', true), ('files', true),
    ('menus', true), ('menu_templates', true), ('menu_publications', true),
    ('menu_corrections', true), ('menu_downloads', true),
    ('integrations', true), ('metric_points', true), ('sync_runs', true),
    -- RN-INT-10 (migración 117) · su ficha de Google es suya.
    ('reviews', true),
    ('opportunities', true), ('opportunity_detections', true), ('opportunity_notes', true),
    ('reports', true),
    ('establishment_notes', true), ('internal_notes', true),
    -- Se queda: el dinero y el plan que cobró el origen (RN-TRA-04),
    -- sus ciclos de consumo (RN-TRA-12), lo que se le aceptó a él y los
    -- avisos que recibió su equipo.
    ('charges', false), ('payments', false), ('receipts', false),
    ('financial_entries', false), ('quotes', false),
    ('subscriptions', false), ('plan_commitments', false), ('scheduled_plan_changes', false),
    ('consumption_cycles', false), ('consumption_entries', false),
    ('menu_update_cycles', false), ('menu_update_entries', false),
    ('acceptances', false), ('terms_acceptances', false),
    -- RN-COM-23 (migración 131) · lo que aceptó, con el plan de origen.
    ('revision_acceptances', false),
    ('space_exports', false), ('notifications', false),
    -- Las copias son del espacio que las hizo: llevan dentro material de
    -- SU equipo —conversaciones internas incluidas— y quien lo generó
    -- responde de ello. El destino empieza a hacer las suyas al día
    -- siguiente, con el barrido de RN-BCK-02.
    ('establishment_backups', false),
    -- Se queda y además se retira: RN-TRA-08, el acceso del EQUIPO de
    -- origen no significa nada en otro espacio, y dejarlo vivo sería una
    -- puerta abierta a un restaurante que ya no es suyo.
    ('worker_establishments', false),
    -- RN-EST-19 (migración 119) · lo mismo, y por lo mismo: quien lo
    -- llevaba es del equipo de origen.
    ('establishment_managers', false),
    -- RN-ACC-13 (migración 114) · se queda, y además deja de poder
    -- gastarse: lo garantiza la comprobación de espacio de
    -- `consume_establishment_invitation()`, no esta lista.
    ('establishment_invitations', false)
  ) as t(table_name, travels);
$$;

-- La versión cabeza del linaje de lo que tiene una suscripción, y la que
-- tiene ahora.
create or replace function public.subscription_revision_pair(p_subscription_id uuid)
returns table (kind text, current_id uuid, head_id uuid, head_published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select 'plan'::text, s.plan_id, h.id, h.published_at
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  join public.plans h on h.lineage_id = p.lineage_id and h.superseded_at is null
  where s.id = p_subscription_id and s.kind = 'plan'
  union all
  select 'service'::text, s.service_id, h.id, h.published_at
  from public.subscriptions s
  join public.services sv on sv.id = s.service_id
  join public.services h on h.lineage_id = sv.lineage_id and h.superseded_at is null
  where s.id = p_subscription_id and s.kind = 'service';
$$;

revoke all on function public.subscription_revision_pair(uuid) from public, anon, authenticated;

create or replace function public.revision_accepted_internal(p_subscription_id uuid, p_kind text, p_head_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.revision_acceptances ra
    where ra.subscription_id = p_subscription_id
      and ((p_kind = 'plan' and ra.plan_id = p_head_id)
        or (p_kind = 'service' and ra.service_id = p_head_id))
  );
$$;

revoke all on function public.revision_accepted_internal(uuid, text, uuid) from public, anon, authenticated;

-- Lo común a los dos canales: qué se acepta y si hace falta.
create or replace function public.assert_revision_acceptable(p_subscription_id uuid)
returns table (kind text, head_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pair record;
begin
  select * into v_pair from public.subscription_revision_pair(p_subscription_id);

  if v_pair.current_id is null or v_pair.current_id = v_pair.head_id then
    raise exception 'No hay ninguna versión nueva que aceptar';
  end if;

  if not public.revision_harms_internal(v_pair.kind, v_pair.current_id, v_pair.head_id) then
    raise exception 'Esta versión solo mejora las condiciones: no necesita aceptación';
  end if;

  kind := v_pair.kind;
  head_id := v_pair.head_id;
  return next;
end;
$$;

revoke all on function public.assert_revision_acceptable(uuid) from public, anon, authenticated;

create or replace function public.accept_revision(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_target record;
  v_id uuid;
begin
  select id, space_id, establishment_id, status into v_sub
  from public.subscriptions where id = p_subscription_id
  for update;

  if v_sub.id is null then
    raise exception 'Suscripción no encontrada';
  end if;

  if not public.client_can_accept_terms(v_sub.establishment_id) then
    raise exception 'Solo el propietario del restaurante puede aceptar la versión nueva';
  end if;

  if v_sub.status <> 'active' then
    raise exception 'Esta suscripción ya no está activa';
  end if;

  select * into v_target from public.assert_revision_acceptable(p_subscription_id);

  select id into v_id from public.revision_acceptances
  where subscription_id = p_subscription_id
    and (plan_id = v_target.head_id or service_id = v_target.head_id);
  if v_id is not null then
    return v_id;
  end if;

  insert into public.revision_acceptances
    (space_id, establishment_id, subscription_id, plan_id, service_id, channel, accepted_by, accepted_at)
  values
    (v_sub.space_id, v_sub.establishment_id, p_subscription_id,
     case when v_target.kind = 'plan' then v_target.head_id end,
     case when v_target.kind = 'service' then v_target.head_id end,
     'in_app', auth.uid(), now())
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_sub.space_id, auth.uid(), 'subscription.revision_accepted', 'subscription', p_subscription_id,
          jsonb_build_object('kind', v_target.kind, 'accepted_id', v_target.head_id, 'channel', 'in_app',
                             'establishment_id', v_sub.establishment_id));

  return v_id;
end;
$$;

comment on function public.accept_revision(uuid) is
  'RN-COM-23 · el propietario del restaurante acepta la versión vigente de
   su plan o servicio cuando le perjudica en algo. Idempotente.';

revoke all on function public.accept_revision(uuid) from public, anon;
grant execute on function public.accept_revision(uuid) to authenticated;

create or replace function public.record_external_revision_acceptance(
  p_subscription_id uuid,
  p_accepted_on date,
  p_file_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_target record;
  v_timezone text;
  v_file record;
  v_id uuid;
begin
  select id, space_id, establishment_id, status into v_sub
  from public.subscriptions where id = p_subscription_id
  for update;

  if v_sub.id is null then
    raise exception 'Suscripción no encontrada';
  end if;

  if not public.has_capability(v_sub.space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden registrar una aceptación externa';
  end if;

  if v_sub.status <> 'active' then
    raise exception 'Esta suscripción ya no está activa';
  end if;

  if p_accepted_on is null then
    raise exception 'Hace falta la fecha en que se aceptó la versión nueva';
  end if;

  select timezone into v_timezone from public.spaces where id = v_sub.space_id;
  if p_accepted_on > (now() at time zone v_timezone)::date then
    raise exception 'La fecha de aceptación no puede ser futura';
  end if;

  if p_file_id is null then
    raise exception 'Una aceptación externa lleva el contrato adjunto';
  end if;

  select establishment_id, archived_at into v_file from public.files where id = p_file_id;
  if v_file.establishment_id is null or v_file.establishment_id <> v_sub.establishment_id then
    raise exception 'El contrato tiene que ser un archivo de este restaurante';
  end if;
  if v_file.archived_at is not null then
    raise exception 'Ese archivo está archivado: sube o elige el contrato vigente';
  end if;

  select * into v_target from public.assert_revision_acceptable(p_subscription_id);

  select id into v_id from public.revision_acceptances
  where subscription_id = p_subscription_id
    and (plan_id = v_target.head_id or service_id = v_target.head_id);
  if v_id is not null then
    return v_id;
  end if;

  insert into public.revision_acceptances
    (space_id, establishment_id, subscription_id, plan_id, service_id, channel, recorded_by,
     accepted_at, evidence_file_id)
  values
    (v_sub.space_id, v_sub.establishment_id, p_subscription_id,
     case when v_target.kind = 'plan' then v_target.head_id end,
     case when v_target.kind = 'service' then v_target.head_id end,
     'external', auth.uid(), (p_accepted_on::timestamp) at time zone v_timezone, p_file_id)
  returning id into v_id;

  perform public.link_file(p_file_id, 'subscription', p_subscription_id, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_sub.space_id, auth.uid(), 'subscription.revision_recorded', 'subscription', p_subscription_id,
          jsonb_build_object('kind', v_target.kind, 'accepted_id', v_target.head_id, 'channel', 'external',
                             'accepted_on', p_accepted_on, 'file_id', p_file_id,
                             'establishment_id', v_sub.establishment_id));

  return v_id;
end;
$$;

comment on function public.record_external_revision_acceptance(uuid, date, uuid) is
  'RN-COM-23 · el equipo registra que el restaurante aceptó fuera de Cuotly
   la versión nueva, con la fecha y el contrato. Solo `manage_clients`.';

revoke all on function public.record_external_revision_acceptance(uuid, date, uuid) from public, anon;
grant execute on function public.record_external_revision_acceptance(uuid, date, uuid) to authenticated;

-- ------------------------------------------------------------
-- 6 · El paso de versión en la renovación (RN-COM-22, 24, 25, 28)
-- ------------------------------------------------------------
--
-- Pasa a la versión vigente si, y solo si:
--   · el periodo que empieza ahora arranca 30 días naturales o más después
--     de publicarla (RN-COM-22);
--   · ese periodo todavía no ha empezado con la versión vieja: no tiene
--     ni bolsa, ni ciclo de actualizaciones, ni mensualidad (RN-COM-28);
--   · y la versión no le perjudica, o la ha aceptado (RN-COM-23/24). Si
--     le perjudica y no la ha aceptado, se queda donde está: opción A.
-- La permanencia no se toca (RN-COM-25).
create or replace function public.apply_due_revision_internal(p_subscription_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_pair record;
  v_period_start timestamptz;
  v_harms boolean;
  v_accepted boolean;
  v_old_revision integer;
  v_new_revision integer;
begin
  select id, space_id, establishment_id, kind, status into v_sub
  from public.subscriptions where id = p_subscription_id;

  if v_sub.id is null or v_sub.status <> 'active' then
    return false;
  end if;

  select * into v_pair from public.subscription_revision_pair(p_subscription_id);
  if v_pair.current_id is null or v_pair.current_id = v_pair.head_id then
    return false;
  end if;

  select w.period_start into v_period_start from public.subscription_current_period(p_subscription_id) w;

  if v_period_start < v_pair.head_published_at + interval '30 days' then
    return false;
  end if;

  if exists (select 1 from public.charges c
             where c.subscription_id = p_subscription_id and c.period_start = v_period_start) then
    return false;
  end if;

  if v_sub.kind = 'plan' and exists (
    select 1 from public.consumption_cycles cc
    where cc.subscription_id = p_subscription_id and cc.cycle_start = v_period_start) then
    return false;
  end if;

  if v_sub.kind = 'service' and exists (
    select 1 from public.menu_update_cycles mc
    where mc.subscription_id = p_subscription_id and mc.cycle_start = v_period_start) then
    return false;
  end if;

  v_harms := public.revision_harms_internal(v_sub.kind, v_pair.current_id, v_pair.head_id);
  v_accepted := public.revision_accepted_internal(p_subscription_id, v_sub.kind, v_pair.head_id);

  if v_harms and not v_accepted then
    return false; -- RN-COM-24 · sigue en la versión que aceptó.
  end if;

  perform set_config('cuotly.applying_revision', 'on', true);
  if v_sub.kind = 'plan' then
    select revision into v_old_revision from public.plans where id = v_pair.current_id;
    select revision into v_new_revision from public.plans where id = v_pair.head_id;
    update public.subscriptions set plan_id = v_pair.head_id where id = p_subscription_id;
  else
    select revision into v_old_revision from public.services where id = v_pair.current_id;
    select revision into v_new_revision from public.services where id = v_pair.head_id;
    update public.subscriptions set service_id = v_pair.head_id where id = p_subscription_id;
  end if;
  perform set_config('cuotly.applying_revision', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_sub.space_id, null, 'subscription.revision_applied', 'subscription', p_subscription_id,
          jsonb_build_object('kind', v_sub.kind, 'id', v_pair.current_id, 'revision', v_old_revision),
          jsonb_build_object('kind', v_sub.kind, 'id', v_pair.head_id, 'revision', v_new_revision,
                             'period_start', v_period_start, 'harms', v_harms, 'accepted', v_accepted,
                             'establishment_id', v_sub.establishment_id));

  return true;
end;
$$;

comment on function public.apply_due_revision_internal(uuid) is
  'RN-COM-22, 24, 25 y 28 · pasa una suscripción a la versión vigente de su
   plan o servicio cuando empieza un periodo que le toca y todavía no ha
   arrancado. La llaman los tres sitios donde nace un periodo: la bolsa, el
   ciclo de Menú Diario y la mensualidad. Interna.';

revoke all on function public.apply_due_revision_internal(uuid) from public, anon, authenticated;

-- Los tres sitios donde nace un periodo llaman primero al paso de versión.
-- Son las definiciones vigentes (migraciones 41, 77 y 80) con esa línea al
-- principio y nada más.
create or replace function public.get_or_create_consumption_cycle_internal(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
  v_space_id uuid;
  v_started_at timestamptz;
  v_timezone text;
  v_included_small integer;
  v_included_photo integer;
  v_included_medium integer;
  v_included_large integer;
  v_local_start timestamp;
  v_local_now timestamp;
  v_k integer := 0;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_cycle_id uuid;
begin
  -- Migración 131 · si al periodo le toca una versión nueva, la bolsa nace
  -- ya con ella.
  perform public.apply_due_revision_internal(p_subscription_id);

  select s.establishment_id, s.space_id, s.started_at,
         p.included_small, p.included_photo, p.included_medium, p.included_large
  into v_establishment_id, v_space_id, v_started_at,
       v_included_small, v_included_photo, v_included_medium, v_included_large
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.id = p_subscription_id and s.kind = 'plan';

  if v_establishment_id is null then
    raise exception 'Suscripción de plan no encontrada';
  end if;

  select timezone into v_timezone from public.spaces where id = v_space_id;

  v_local_start := v_started_at at time zone v_timezone;
  v_local_now := now() at time zone v_timezone;

  while (v_local_start + ((v_k + 1) || ' months')::interval) <= v_local_now loop
    v_k := v_k + 1;
  end loop;

  v_cycle_start := (v_local_start + (v_k || ' months')::interval) at time zone v_timezone;
  v_cycle_end := (v_local_start + ((v_k + 1) || ' months')::interval) at time zone v_timezone;

  insert into public.consumption_cycles
    (space_id, establishment_id, subscription_id, cycle_start, cycle_end, included_small, included_photo, included_medium, included_large)
  values
    (v_space_id, v_establishment_id, p_subscription_id, v_cycle_start, v_cycle_end, v_included_small, v_included_photo, v_included_medium, v_included_large)
  on conflict (subscription_id, cycle_start)
  do update set cycle_start = excluded.cycle_start
  returning id into v_cycle_id;

  return v_cycle_id;
end;
$$;

revoke all on function public.get_or_create_consumption_cycle_internal(uuid)
  from public, anon, authenticated;

create or replace function public.get_or_create_menu_update_cycle(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_included integer;
  v_start timestamptz;
  v_end timestamptz;
  v_cycle_id uuid;
begin
  -- Migración 131 · el ciclo nace ya con la versión que le toca.
  perform public.apply_due_revision_internal(p_subscription_id);

  select s.space_id, s.establishment_id, sv.included_updates
  into v_space_id, v_establishment_id, v_included
  from public.subscriptions s
  join public.services sv on sv.id = s.service_id
  where s.id = p_subscription_id and s.kind = 'service' and sv.kind = 'daily_menu';

  if v_space_id is null then
    raise exception 'Suscripción de Menú Diario no encontrada';
  end if;

  select w.cycle_start, w.cycle_end into v_start, v_end
  from public.menu_update_cycle_window(p_subscription_id, now()) w;

  insert into public.menu_update_cycles
    (space_id, establishment_id, subscription_id, cycle_start, cycle_end, included_updates)
  values
    (v_space_id, v_establishment_id, p_subscription_id, v_start, v_end, v_included)
  on conflict (subscription_id, cycle_start)
  do update set cycle_start = excluded.cycle_start
  returning id into v_cycle_id;

  return v_cycle_id;
end;
$$;

revoke all on function public.get_or_create_menu_update_cycle(uuid) from public, anon, authenticated;

create or replace function public.generate_monthly_charge_internal(
  p_subscription_id uuid,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_kind text;
  v_concept text;
  v_base_cents integer;
  v_premium boolean := false;
  v_tax_rate numeric(5, 2);
  v_tax_cents integer;
  v_term_days integer;
  v_cycle_id uuid;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_charge_id uuid;
begin
  -- Migración 131 · la mensualidad se cobra con la versión que le toca a
  -- este periodo, no con la del anterior.
  perform public.apply_due_revision_internal(p_subscription_id);

  select s.space_id, s.establishment_id, s.kind, p.name, p.price_cents
  into v_space_id, v_establishment_id, v_kind, v_concept, v_base_cents
  from public.subscriptions s
  left join public.plans p on p.id = s.plan_id
  where s.id = p_subscription_id and s.status = 'active';

  if v_space_id is null then
    raise exception 'Suscripción activa no encontrada';
  end if;

  if v_kind = 'plan' then
    v_cycle_id := public.get_or_create_consumption_cycle_internal(p_subscription_id);
    select cycle_start, cycle_end into v_cycle_start, v_cycle_end
    from public.consumption_cycles where id = v_cycle_id;
  else
    select i.base_cents, i.premium_applied, i.service_name
    into v_base_cents, v_premium, v_concept
    from public.service_monthly_price_internal(p_subscription_id) i;

    if v_base_cents is null then
      raise exception 'El servicio de la suscripción no tiene precio';
    end if;

    select w.period_start, w.period_end into v_cycle_start, v_cycle_end
    from public.subscription_current_period(p_subscription_id) w;
  end if;

  select id into v_charge_id from public.charges
  where subscription_id = p_subscription_id and period_start = v_cycle_start;
  if v_charge_id is not null then
    return v_charge_id; -- RN-DAT-09: emitir dos veces no cobra dos veces.
  end if;

  select tax_rate_percent, payment_term_days
  into v_tax_rate, v_term_days
  from public.spaces where id = v_space_id;
  v_tax_cents := round(v_base_cents * v_tax_rate / 100)::integer;

  insert into public.charges
    (space_id, establishment_id, subscription_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_by)
  values
    (v_space_id, v_establishment_id, p_subscription_id, v_concept, v_cycle_start, v_cycle_end,
     v_base_cents, v_tax_rate, v_tax_cents, v_base_cents + v_tax_cents,
     coalesce(p_due_at, greatest(now(), v_cycle_start) + (v_term_days || ' days')::interval),
     auth.uid())
  returning id into v_charge_id;

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    (v_space_id, v_establishment_id, v_charge_id, 'charge', v_base_cents + v_tax_cents,
     'Mensualidad ' || v_concept, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'charge.issued', 'charge', v_charge_id,
          jsonb_build_object('establishment_id', v_establishment_id, 'total_cents', v_base_cents + v_tax_cents,
                             'period_start', v_cycle_start, 'kind', v_kind, 'premium_price', v_premium));

  return v_charge_id;
end;
$$;

revoke all on function public.generate_monthly_charge_internal(uuid, timestamptz)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 7 · Las guardas (RN-COM-27 y el paso de versión)
-- ------------------------------------------------------------
--
-- En `subscriptions`:
--   · Nadie contrata una versión sustituida o archivada.
--   · Pasar a otra versión del MISMO plan solo lo hace
--     apply_due_revision_internal() (marca `cuotly.applying_revision`):
--     ni un "cambio de plan" ni un UPDATE directo se saltan la renovación
--     ni la aceptación.
--   · Cambiar a una versión sustituida o archivada de OTRO plan solo se
--     admite si ya estaba programado antes (scheduled_plan_changes
--     pendiente): lo que se acordó se cumple.
create or replace function public.guard_subscription_revision()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_new record;
  v_old_lineage uuid;
  v_applying boolean := coalesce(current_setting('cuotly.applying_revision', true), 'off') = 'on';
begin
  if new.kind = 'plan' and new.plan_id is not null
     and (tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id) then
    select lineage_id, superseded_at, archived_at into v_new from public.plans where id = new.plan_id;
    if tg_op = 'UPDATE' and old.plan_id is not null then
      select lineage_id into v_old_lineage from public.plans where id = old.plan_id;
    end if;

    if tg_op = 'UPDATE' and v_old_lineage = v_new.lineage_id then
      if not v_applying then
        raise exception 'Es el mismo plan: pasará a la versión nueva en su renovación (RN-COM-22)';
      end if;
    elsif v_new.superseded_at is not null or v_new.archived_at is not null then
      if not (tg_op = 'UPDATE' and exists (
        select 1 from public.scheduled_plan_changes c
        where c.subscription_id = new.id and c.state = 'pending' and c.to_plan_id = new.plan_id)) then
        raise exception 'Ese plan ya no se ofrece: está archivado o tiene una versión más reciente (RN-COM-27)';
      end if;
    end if;
  end if;

  if new.kind = 'service' and new.service_id is not null
     and (tg_op = 'INSERT' or new.service_id is distinct from old.service_id) then
    select lineage_id, superseded_at, archived_at into v_new from public.services where id = new.service_id;
    if tg_op = 'UPDATE' and old.service_id is not null then
      select lineage_id into v_old_lineage from public.services where id = old.service_id;
    end if;

    if tg_op = 'UPDATE' and v_old_lineage = v_new.lineage_id then
      if not v_applying then
        raise exception 'Es el mismo servicio: pasará a la versión nueva en su renovación (RN-COM-22)';
      end if;
    elsif v_new.superseded_at is not null or v_new.archived_at is not null then
      raise exception 'Ese servicio ya no se ofrece: está archivado o tiene una versión más reciente (RN-COM-27)';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_subscription_revision() from public, anon, authenticated;

create trigger subscriptions_guard_revision
  before insert or update of plan_id, service_id on public.subscriptions
  for each row execute function public.guard_subscription_revision();

create or replace function public.guard_scheduled_change_target()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_target record;
  v_from_lineage uuid;
begin
  select lineage_id, superseded_at, archived_at into v_target from public.plans where id = new.to_plan_id;
  select lineage_id into v_from_lineage from public.plans where id = new.from_plan_id;

  if v_target.lineage_id = v_from_lineage then
    raise exception 'Es el mismo plan: pasará a la versión nueva en su renovación (RN-COM-22)';
  end if;

  if v_target.superseded_at is not null or v_target.archived_at is not null then
    raise exception 'Ese plan ya no se ofrece: está archivado o tiene una versión más reciente (RN-COM-27)';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_scheduled_change_target() from public, anon, authenticated;

create trigger scheduled_plan_changes_guard_target
  before insert on public.scheduled_plan_changes
  for each row execute function public.guard_scheduled_change_target();

-- ------------------------------------------------------------
-- 8 · Lo que leen las pantallas
-- ------------------------------------------------------------
--
-- El primer inicio de periodo de la suscripción que cae en `p_at` o
-- después: la renovación en la que pasaría.
create or replace function public.subscription_period_start_after(p_subscription_id uuid, p_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_started_at timestamptz;
  v_timezone text;
  v_local_start timestamp;
  v_local_at timestamp;
  v_k integer := 0;
begin
  select s.started_at, sp.timezone into v_started_at, v_timezone
  from public.subscriptions s join public.spaces sp on sp.id = s.space_id
  where s.id = p_subscription_id;

  if v_started_at is null then
    return null;
  end if;

  v_local_start := v_started_at at time zone v_timezone;
  v_local_at := p_at at time zone v_timezone;

  while (v_local_start + (v_k || ' months')::interval) < v_local_at loop
    v_k := v_k + 1;
  end loop;

  return (v_local_start + (v_k || ' months')::interval) at time zone v_timezone;
end;
$$;

revoke all on function public.subscription_period_start_after(uuid, timestamptz) from public, anon, authenticated;

-- Una fila por suscripción activa que NO está en la versión vigente de lo
-- suyo, con cuándo pasa y qué le falta. `state`:
--   · scheduled            pasa sola en `moves_at` (le favorece o ya aceptó);
--   · awaiting_acceptance  le perjudica y todavía no ha aceptado; si no
--                          acepta antes de `moves_at`, se queda;
--   · held_back            le perjudica, no ha aceptado y ya pasó una
--                          renovación en la que tocaba: sigue en la versión
--                          que aceptó (RN-COM-24, "en versión anterior").
create or replace function public.subscription_revision_state_internal(p_subscription_id uuid)
returns table (
  kind text,
  current_id uuid,
  current_revision integer,
  head_id uuid,
  head_revision integer,
  head_published_at timestamptz,
  moves_at timestamptz,
  harms boolean,
  accepted boolean,
  state text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pair record;
  v_due timestamptz;
  v_period_start timestamptz;
  v_next timestamptz;
begin
  select * into v_pair from public.subscription_revision_pair(p_subscription_id);
  if v_pair.current_id is null or v_pair.current_id = v_pair.head_id then
    return;
  end if;

  kind := v_pair.kind;
  current_id := v_pair.current_id;
  head_id := v_pair.head_id;
  head_published_at := v_pair.head_published_at;
  if v_pair.kind = 'plan' then
    select revision into current_revision from public.plans where id = v_pair.current_id;
    select revision into head_revision from public.plans where id = v_pair.head_id;
  else
    select revision into current_revision from public.services where id = v_pair.current_id;
    select revision into head_revision from public.services where id = v_pair.head_id;
  end if;

  harms := public.revision_harms_internal(v_pair.kind, v_pair.current_id, v_pair.head_id);
  accepted := public.revision_accepted_internal(p_subscription_id, v_pair.kind, v_pair.head_id);

  v_due := v_pair.head_published_at + interval '30 days';
  select w.period_start into v_period_start from public.subscription_current_period(p_subscription_id) w;
  -- El periodo en curso ya empezó sin pasar: la próxima renovación que
  -- cumpla los 30 días.
  v_next := public.subscription_period_start_after(p_subscription_id, greatest(v_due, v_period_start + interval '1 second'));
  moves_at := v_next;

  state := case
    when harms and not accepted and v_period_start >= v_due then 'held_back'
    when harms and not accepted then 'awaiting_acceptance'
    else 'scheduled'
  end;

  return next;
end;
$$;

revoke all on function public.subscription_revision_state_internal(uuid) from public, anon, authenticated;

create or replace function public.space_revision_status(p_space_id uuid)
returns table (
  subscription_id uuid,
  establishment_id uuid,
  kind text,
  current_id uuid,
  current_revision integer,
  head_id uuid,
  head_revision integer,
  head_published_at timestamptz,
  moves_at timestamptz,
  harms boolean,
  accepted boolean,
  state text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.establishment_id, r.kind, r.current_id, r.current_revision, r.head_id, r.head_revision,
         r.head_published_at, r.moves_at, r.harms, r.accepted, r.state
  from public.subscriptions s
  cross join lateral public.subscription_revision_state_internal(s.id) r
  where s.space_id = p_space_id and s.status = 'active'
    and public.is_space_member(p_space_id)
  order by r.state, r.moves_at;
$$;

comment on function public.space_revision_status(uuid) is
  'RN-COM-22 y 24 · para el equipo: cada restaurante que no está en la
   versión vigente de su plan o servicio, cuándo pasa y si falta su
   aceptación ("en versión anterior" es `held_back`). Cero filas a quien no
   es del espacio.';

revoke all on function public.space_revision_status(uuid) from public, anon;
grant execute on function public.space_revision_status(uuid) to authenticated;

create or replace function public.subscription_revision(p_subscription_id uuid)
returns table (
  kind text,
  current_id uuid,
  current_revision integer,
  head_id uuid,
  head_revision integer,
  head_published_at timestamptz,
  moves_at timestamptz,
  harms boolean,
  accepted boolean,
  state text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub record;
begin
  select id, space_id, establishment_id into v_sub from public.subscriptions where id = p_subscription_id;
  if v_sub.id is null then
    return;
  end if;
  if not (public.is_space_member(v_sub.space_id) or public.can_read_establishment(v_sub.establishment_id)) then
    return;
  end if;
  return query select * from public.subscription_revision_state_internal(p_subscription_id);
end;
$$;

comment on function public.subscription_revision(uuid) is
  'RN-COM-22 y 23 · la versión nueva pendiente de una suscripción, para el
   equipo y para el restaurante. Sin identidades.';

revoke all on function public.subscription_revision(uuid) from public, anon;
grant execute on function public.subscription_revision(uuid) to authenticated;

-- RN-COM-30 · la comparativa de dos versiones del mismo plan o servicio.
-- El equipo ve todos los términos; el restaurante, los que le afectan y
-- solo de lo que tiene.
create or replace function public.revision_diff(p_kind text, p_from uuid, p_to uuid)
returns table (field text, old_value text, new_value text, better boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_lineage uuid;
  v_to_lineage uuid;
  v_member boolean;
begin
  if p_kind = 'plan' then
    select space_id, lineage_id into v_space_id, v_lineage from public.plans where id = p_from;
    select lineage_id into v_to_lineage from public.plans where id = p_to;
  elsif p_kind = 'service' then
    select space_id, lineage_id into v_space_id, v_lineage from public.services where id = p_from;
    select lineage_id into v_to_lineage from public.services where id = p_to;
  else
    raise exception 'Tipo desconocido: %', p_kind;
  end if;

  if v_space_id is null or v_to_lineage is distinct from v_lineage then
    return;
  end if;

  v_member := public.is_space_member(v_space_id);
  if not v_member and not exists (
    select 1 from public.subscriptions s
    where s.status = 'active' and s.kind = p_kind
      and ((p_kind = 'plan' and public.plan_lineage(s.plan_id) = v_lineage)
        or (p_kind = 'service' and public.service_lineage(s.service_id) = v_lineage))
      and public.can_read_establishment(s.establishment_id)
  ) then
    return;
  end if;

  if p_kind = 'plan' then
    return query
      select d.field, d.old_value, d.new_value, d.better
      from public.plan_terms_diff_internal(p_from, p_to) d
      where v_member or d.client_visible;
  else
    return query
      select d.field, d.old_value, d.new_value, d.better
      from public.service_terms_diff_internal(p_from, p_to) d;
  end if;
end;
$$;

revoke all on function public.revision_diff(text, uuid, uuid) from public, anon;
grant execute on function public.revision_diff(text, uuid, uuid) to authenticated;

-- El restaurante no puede leer `plans` ni `services`: lo que tiene y lo
-- que le llega, término a término, sale de aquí.
create or replace function public.subscription_revision_terms(p_subscription_id uuid)
returns table (which text, name text, revision integer, terms jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_pair record;
begin
  select id, space_id, establishment_id into v_sub from public.subscriptions where id = p_subscription_id;
  if v_sub.id is null then
    return;
  end if;
  if not (public.is_space_member(v_sub.space_id) or public.can_read_establishment(v_sub.establishment_id)) then
    return;
  end if;

  select * into v_pair from public.subscription_revision_pair(p_subscription_id);
  if v_pair.current_id is null then
    return;
  end if;

  if v_pair.kind = 'plan' then
    return query
      select case when p.id = v_pair.current_id then 'current' else 'head' end,
             p.name, p.revision,
             to_jsonb(p) - 'queue_rank' - 'publish_key' - 'published_by' - 'space_id' - 'lineage_id'
               - 'supersedes_id' - 'created_at'
      from public.plans p where p.id in (v_pair.current_id, v_pair.head_id);
  else
    return query
      select case when sv.id = v_pair.current_id then 'current' else 'head' end,
             sv.name, sv.revision,
             to_jsonb(sv) - 'publish_key' - 'published_by' - 'space_id' - 'lineage_id'
               - 'supersedes_id' - 'created_at'
      from public.services sv where sv.id in (v_pair.current_id, v_pair.head_id);
  end if;
end;
$$;

revoke all on function public.subscription_revision_terms(uuid) from public, anon;
grant execute on function public.subscription_revision_terms(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9 · El aviso al publicar una versión
-- ------------------------------------------------------------
--
-- Las listas se reescriben desde la definición viva de la migración 117,
-- con una entrada más.
alter table public.notifications drop constraint if exists notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
  check (event_type = any (array[
    'request_submitted', 'job_unassigned', 'job_assigned', 'job_started', 'job_published',
    'correction_requested', 'job_reassignment_requested', 'task_reassignment_requested',
    'terms_version_published', 'menu_publication_requested', 'menu_assigned',
    'menu_needs_information', 'menu_published', 'menu_publication_error',
    'menu_not_prepared_reminder', 'menu_publication_overdue', 'quote_sent', 'quote_accepted',
    'quote_rejected', 'integration_sync_failed', 'integration_reauthorization_required',
    'report_schedule_due_soon', 'report_sent', 'cuotly_payment_due_soon',
    'cuotly_payment_due_today', 'cuotly_payment_overdue_24h', 'cuotly_payment_overdue_48h',
    'cuotly_payment_final_notice', 'cuotly_space_archived', 'cuotly_space_reactivated',
    'support_session_started', 'space_ownership_transferred', 'space_archived_by_owner',
    'incident_opened', 'incident_updated', 'incident_replied', 'storage_threshold_80',
    'storage_threshold_100', 'security_incident', 'consumption_threshold_80',
    'consumption_threshold_100', 't2_threshold_50', 't2_threshold_80', 't2_threshold_100',
    't2_critical_alert', 't2_reassignment_suggestion', 't3_threshold_75', 't3_threshold_90',
    't3_threshold_100', 'establishment_paused_nonpayment', 'establishment_suspended_nonpayment',
    'establishment_reactivated', 'charge_due_today', 'absence_requested', 'absence_decided',
    'absence_uncovered_jobs', 'establishment_access_granted', 'panel_invitation_pending_review',
    'panel_invitation_decided', 'review_received', 'low_review_received',
    -- RN-COM-23 (migración 131) · una versión nueva del plan o servicio.
    'plan_revision_published'
  ]));

create or replace function public.notify_revision_published(
  p_space_id uuid,
  p_kind text,
  p_lineage_id uuid,
  p_head_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_sub record;
  v_recipient uuid;
  v_sent integer := 0;
begin
  v_slug := public.space_slug(p_space_id);

  for v_sub in
    select s.id, s.establishment_id
    from public.subscriptions s
    where s.space_id = p_space_id
      and s.status = 'active'
      and s.kind = p_kind
      and ((p_kind = 'plan' and public.plan_lineage(s.plan_id) = p_lineage_id)
        or (p_kind = 'service' and public.service_lineage(s.service_id) = p_lineage_id))
  loop
    for v_recipient in
      select em.user_id
      from public.establishment_memberships em
      where em.establishment_id = v_sub.establishment_id
        and em.revoked_at is null
        and em.role = 'local_owner'
      union
      select gm.user_id
      from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = v_sub.establishment_id
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    loop
      if public.emit_notification(
           p_space_id, v_recipient, 'plan_revision_published', 'client',
           'establishment', v_sub.establishment_id,
           '/espacios/' || v_slug || '/restaurantes/' || v_sub.establishment_id::text || '/plan',
           'plan_revision_published:' || p_head_id::text || ':' || v_sub.establishment_id::text,
           v_sub.establishment_id) is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end loop;

  return v_sent;
end;
$$;

comment on function public.notify_revision_published(uuid, text, uuid, uuid) is
  'RN-COM-23 · avisa a quien puede aceptar por cada restaurante con ese plan
   o servicio (cualquier versión) de que hay una versión nueva. El mismo
   aviso vale si solo le favorece: se le cuenta, no se le pide nada.';

revoke all on function public.notify_revision_published(uuid, text, uuid, uuid) from public, anon, authenticated;
