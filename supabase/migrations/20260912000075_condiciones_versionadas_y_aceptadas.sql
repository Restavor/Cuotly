-- Condiciones versionadas de planes y servicios, y su aceptación.
--
-- Maqueta 13: la tarjeta del servicio enseña "Versión aceptada v2.1 · Ver
-- condiciones". Hasta hoy no había versiones que aceptar ni condiciones
-- que abrir: el bloque legal estaba aplazado en CLAUDE.md. Bosco lo
-- desbloqueó el 12/09/2026 para esto, y decidió (c): **las dos** maneras
-- de aceptar.
--
--   (a) El propietario del restaurante acepta en Cuotly, con un botón.
--   (b) El equipo registra que se aceptaron fuera —un contrato firmado—,
--       con la fecha y el contrato adjunto.
--
-- **Lo que NO se inventa.** El texto de las condiciones lo escribe el
-- espacio (Restavor) para su propio plan; Cuotly guarda versiones y
-- aceptaciones. Los términos de uso de Cuotly, la privacidad, las
-- retenciones, la numeración fiscal y la jurisdicción siguen aplazados:
-- no hay texto que se pueda escribir aquí sin inventarlo.
--
-- **Versionado, no edición (RN-DAT-07, P4, §104 de la maestra: "se
-- conserva versión aceptada").** Publicar condiciones nuevas es una fila
-- más con `version + 1`; la anterior no se toca, porque hay restaurantes
-- que aceptaron ESA. La aceptación apunta a la versión concreta, así que
-- siempre se sabe qué texto leyó cada uno y cuándo. Las tablas se llaman
-- `plan_versions` y `service_versions` porque así las nombra el modelo de
-- datos del PRD (§5); hoy versionan las condiciones, y el día que §104
-- pida versionar precio y consumos, es aquí donde caben.
--
-- **"Vigente" y "aceptada" son dos cosas.** Un restaurante puede haber
-- aceptado la v1 y estar el plan en la v2: eso es `outdated`, y se
-- enseña como tal —no como "pendiente", que borraría el hecho de que sí
-- aceptó algo—. Los cuatro estados los calcula `subscription_terms()`,
-- en el servidor, que es quien manda sobre un estado derivado.
--
-- **Sobre los servicios contratados desde Cuotly.** Bosco dijo que ahí la
-- aceptación va implícita en contratar. Pero hoy `create_service_
-- subscription()` la ejecuta el EQUIPO (`manage_clients`), no el
-- restaurante: no hay ningún acto del cliente en el que apoyar una
-- aceptación implícita, y escribirla sería registrar que alguien aceptó
-- algo que no ha visto. Así que un servicio contratado por el equipo
-- sigue la misma regla que un plan: (a) o (b). Cuando exista un flujo en
-- que el propio restaurante contrate, la aceptación irá implícita AHÍ.
--
-- Se comprueba con `supabase/tests/condiciones_versionadas.sql`.

-- ============================================================
-- 1 · Las versiones
-- ============================================================
create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete cascade,
  version integer not null check (version >= 1),
  conditions text not null check (length(btrim(conditions)) > 0 and length(conditions) <= 40000),
  published_by uuid not null references public.profiles (id),
  published_at timestamptz not null default now(),
  unique (plan_id, version)
);

comment on table public.plan_versions is
  'RN-DAT-07 · las condiciones de un plan, versionadas. Cada publicación
   es una fila nueva; ninguna se edita ni se borra, porque hay
   restaurantes que aceptaron esa versión concreta (§104: "se conserva
   versión aceptada"). Solo la escribe publish_plan_conditions().';

alter table public.plan_versions enable row level security;

create table public.service_versions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  version integer not null check (version >= 1),
  conditions text not null check (length(btrim(conditions)) > 0 and length(conditions) <= 40000),
  published_by uuid not null references public.profiles (id),
  published_at timestamptz not null default now(),
  unique (service_id, version)
);

comment on table public.service_versions is
  'RN-DAT-07 · las condiciones de un servicio adicional, versionadas.
   Misma regla que plan_versions. Solo la escribe
   publish_service_conditions().';

alter table public.service_versions enable row level security;

-- Quién lee una versión: el equipo del espacio, y el restaurante que tiene
-- contratado ESE plan o servicio. Un restaurante no lee las condiciones de
-- un plan que no es el suyo: son parte de la oferta comercial del espacio,
-- y la oferta la enseña el espacio cuando quiere.
create policy plan_versions_select on public.plan_versions
for select using (
  public.is_space_member(space_id)
  or exists (
    select 1 from public.subscriptions s
    where s.plan_id = plan_versions.plan_id
      and s.status = 'active'
      and public.can_read_establishment(s.establishment_id)
  )
);

create policy service_versions_select on public.service_versions
for select using (
  public.is_space_member(space_id)
  or exists (
    select 1 from public.subscriptions s
    where s.service_id = service_versions.service_id
      and s.status = 'active'
      and public.can_read_establishment(s.establishment_id)
  )
);

-- `published_by` es alguien del equipo, y la fila la lee el restaurante:
-- privilegio de columna (CLAUDE.md MUST NOT). Quién publicó cada versión
-- está en audit_log, para quien pueda verlo.
revoke select on public.plan_versions from anon, authenticated;
grant select (id, space_id, plan_id, version, conditions, published_at)
  on public.plan_versions to authenticated;

revoke select on public.service_versions from anon, authenticated;
grant select (id, space_id, service_id, version, conditions, published_at)
  on public.service_versions to authenticated;

-- ============================================================
-- 2 · Las aceptaciones
-- ============================================================
--
-- Un libro: se añade, no se edita ni se borra. Una aceptación retirada
-- sería otra fila con otro significado, y no existe todavía porque nadie
-- ha pedido que exista.
create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  plan_version_id uuid references public.plan_versions (id),
  service_version_id uuid references public.service_versions (id),
  -- (a) `in_app`: la aceptó el propietario del restaurante en Cuotly.
  -- (b) `external`: la registró el equipo con fecha y contrato adjunto.
  channel text not null check (channel in ('in_app', 'external')),
  -- Quién aceptó, cuando fue en Cuotly. Es alguien del RESTAURANTE, así
  -- que el restaurante puede leerlo: es su propia gente.
  accepted_by uuid references public.profiles (id),
  -- Quién lo registró, cuando fue fuera. Es alguien del EQUIPO: la columna
  -- se tapa con privilegio de columna más abajo.
  recorded_by uuid references public.profiles (id),
  accepted_at timestamptz not null,
  evidence_file_id uuid references public.files (id),
  created_at timestamptz not null default now(),
  constraint terms_acceptances_one_subject check (
    (plan_version_id is not null and service_version_id is null)
    or (plan_version_id is null and service_version_id is not null)
  ),
  -- Cada canal lleva exactamente lo suyo. Una aceptación "externa" sin
  -- contrato es una afirmación sin prueba; una "en Cuotly" con contrato es
  -- un dato que nadie sabe de dónde salió.
  constraint terms_acceptances_channel_shape check (
    (channel = 'in_app' and accepted_by is not null and recorded_by is null and evidence_file_id is null)
    or (channel = 'external' and recorded_by is not null and accepted_by is null and evidence_file_id is not null)
  ),
  -- CA-17: una versión se acepta una vez por suscripción.
  unique (subscription_id, plan_version_id),
  unique (subscription_id, service_version_id)
);

comment on table public.terms_acceptances is
  'Qué versión de las condiciones aceptó cada suscripción, cuándo y por
   qué canal (decisión de Bosco del 12/09/2026, opción c). Libro: solo
   escriben accept_subscription_terms() y
   record_external_terms_acceptance(); nada lo edita ni lo borra.';

alter table public.terms_acceptances enable row level security;

create index terms_acceptances_subscription_idx on public.terms_acceptances (subscription_id);

create policy terms_acceptances_select on public.terms_acceptances
for select using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

revoke select on public.terms_acceptances from anon, authenticated;
grant select (id, space_id, establishment_id, subscription_id, plan_version_id, service_version_id,
              channel, accepted_by, accepted_at, evidence_file_id, created_at)
  on public.terms_acceptances to authenticated;

-- El contrato adjunto queda VINCULADO a la suscripción (RN-ARC-02), y con
-- eso RN-ARC-07 lo protege: un archivo "vinculado a ... aceptación" no
-- admite solicitud de borrado definitivo. El CHECK de file_links no tenía
-- ese tipo de elemento.
alter table public.file_links drop constraint file_links_entity_type_check;
alter table public.file_links add constraint file_links_entity_type_check check (entity_type in (
  'message', 'request', 'job', 'charge', 'payment', 'establishment', 'subscription'
));

-- ============================================================
-- 3 · Publicar condiciones (el espacio, sobre su propio plan)
-- ============================================================
--
-- `manage_space`: "configuración contractual, planes y servicios: solo el
-- propietario" (§16.1 de la maestra, migración 7). El plan se bloquea
-- para que dos publicaciones a la vez no se peleen por el mismo número.
create or replace function public.publish_plan_conditions(p_plan_id uuid, p_conditions text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_previous integer;
  v_version_id uuid;
begin
  select space_id into v_space_id from public.plans where id = p_plan_id for update;

  if v_space_id is null then
    raise exception 'Plan no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio publica las condiciones de un plan';
  end if;

  if length(btrim(coalesce(p_conditions, ''))) = 0 then
    raise exception 'Las condiciones no pueden estar vacías';
  end if;

  select max(version) into v_previous from public.plan_versions where plan_id = p_plan_id;

  insert into public.plan_versions (space_id, plan_id, version, conditions, published_by)
  values (v_space_id, p_plan_id, coalesce(v_previous, 0) + 1, p_conditions, auth.uid())
  returning id into v_version_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'plan.conditions_published', 'plan', p_plan_id,
    jsonb_build_object('version', v_previous),
    jsonb_build_object('version', coalesce(v_previous, 0) + 1, 'version_id', v_version_id)
  );

  return v_version_id;
end;
$$;

comment on function public.publish_plan_conditions(uuid, text) is
  'RN-DAT-07 · publica una versión nueva de las condiciones de un plan.
   Nunca edita la anterior. Solo `manage_space`.';

revoke all on function public.publish_plan_conditions(uuid, text) from public, anon;
grant execute on function public.publish_plan_conditions(uuid, text) to authenticated;

create or replace function public.publish_service_conditions(p_service_id uuid, p_conditions text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_previous integer;
  v_version_id uuid;
begin
  select space_id into v_space_id from public.services where id = p_service_id for update;

  if v_space_id is null then
    raise exception 'Servicio no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio publica las condiciones de un servicio';
  end if;

  if length(btrim(coalesce(p_conditions, ''))) = 0 then
    raise exception 'Las condiciones no pueden estar vacías';
  end if;

  select max(version) into v_previous from public.service_versions where service_id = p_service_id;

  insert into public.service_versions (space_id, service_id, version, conditions, published_by)
  values (v_space_id, p_service_id, coalesce(v_previous, 0) + 1, p_conditions, auth.uid())
  returning id into v_version_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'service.conditions_published', 'service', p_service_id,
    jsonb_build_object('version', v_previous),
    jsonb_build_object('version', coalesce(v_previous, 0) + 1, 'version_id', v_version_id)
  );

  return v_version_id;
end;
$$;

comment on function public.publish_service_conditions(uuid, text) is
  'RN-DAT-07 · publica una versión nueva de las condiciones de un servicio.
   Nunca edita la anterior. Solo `manage_space`.';

revoke all on function public.publish_service_conditions(uuid, text) from public, anon;
grant execute on function public.publish_service_conditions(uuid, text) to authenticated;

-- ============================================================
-- 4 · El catálogo, para la pantalla que publica
-- ============================================================
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
    from public.plan_versions v where v.plan_id = p.id
    order by v.version desc limit 1
  ) pv on true
  where p.space_id = p_space_id and public.is_space_member(p_space_id)

  union all

  select 'service'::text, s.id, s.name, sv.id, sv.version, sv.published_at, sv.conditions
  from public.services s
  left join lateral (
    select v.id, v.version, v.published_at, v.conditions
    from public.service_versions v where v.service_id = s.id
    order by v.version desc limit 1
  ) sv on true
  where s.space_id = p_space_id and public.is_space_member(p_space_id)

  order by 1, 3;
$$;

comment on function public.conditions_catalogue(uuid) is
  'Los planes y servicios del espacio con su ÚLTIMA versión de
   condiciones (o nada, si no se ha publicado ninguna). Para el equipo:
   devuelve cero filas a quien no es miembro.';

revoke all on function public.conditions_catalogue(uuid) from public, anon;
grant execute on function public.conditions_catalogue(uuid) to authenticated;

-- ============================================================
-- 5 · Quién acepta, del lado del restaurante
-- ============================================================
--
-- El propietario: local del restaurante o global del grupo. Un Editor
-- escribe en el restaurante pero no firma por él, y Consulta menos. Es
-- la misma línea que traza `client_can_view_billing()` para las cuentas:
-- lo que compromete al restaurante es de su propietario.
create or replace function public.client_can_accept_terms(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id
        and em.user_id = auth.uid()
        and em.revoked_at is null
        and em.role = 'local_owner'
    )
    or exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = auth.uid()
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    );
$$;

comment on function public.client_can_accept_terms(uuid) is
  'Quién puede aceptar las condiciones por el restaurante: su propietario
   local o el propietario global de su grupo. No el Editor ni Consulta.';

revoke all on function public.client_can_accept_terms(uuid) from public, anon;
grant execute on function public.client_can_accept_terms(uuid) to authenticated;

-- ============================================================
-- 6 · La versión vigente de una suscripción, comprobada
-- ============================================================
--
-- Las dos funciones que escriben una aceptación necesitan lo mismo: que
-- la versión sea de ESTE plan o servicio y que sea la VIGENTE. Aceptar una
-- versión vieja no tiene sentido — si hay una más reciente, es ésa la que
-- rige y ésa la que hay que leer. Interna: no comprueba permisos.
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
  v_version integer;
  v_latest integer;
begin
  select kind, plan_id, service_id into v_sub from public.subscriptions where id = p_subscription_id;

  if v_sub.kind = 'plan' then
    select version into v_version from public.plan_versions
    where id = p_version_id and plan_id = v_sub.plan_id;
    select max(version) into v_latest from public.plan_versions where plan_id = v_sub.plan_id;
  else
    select version into v_version from public.service_versions
    where id = p_version_id and service_id = v_sub.service_id;
    select max(version) into v_latest from public.service_versions where service_id = v_sub.service_id;
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

-- ============================================================
-- 7 · (a) El propietario del restaurante acepta en Cuotly
-- ============================================================
create or replace function public.accept_subscription_terms(p_subscription_id uuid, p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_version integer;
  v_acceptance_id uuid;
begin
  select id, space_id, establishment_id, kind, status into v_sub
  from public.subscriptions where id = p_subscription_id
  for update;

  if v_sub.id is null then
    raise exception 'Suscripción no encontrada';
  end if;

  if not public.client_can_accept_terms(v_sub.establishment_id) then
    raise exception 'Solo el propietario del restaurante puede aceptar las condiciones';
  end if;

  if v_sub.status <> 'active' then
    raise exception 'Esta suscripción ya no está activa';
  end if;

  v_version := public.assert_terms_version_current(p_subscription_id, p_version_id);

  -- CA-17: la segunda pulsación devuelve la misma aceptación.
  select id into v_acceptance_id from public.terms_acceptances
  where subscription_id = p_subscription_id
    and (plan_version_id = p_version_id or service_version_id = p_version_id);
  if v_acceptance_id is not null then
    return v_acceptance_id;
  end if;

  insert into public.terms_acceptances
    (space_id, establishment_id, subscription_id, plan_version_id, service_version_id,
     channel, accepted_by, accepted_at)
  values
    (v_sub.space_id, v_sub.establishment_id, p_subscription_id,
     case when v_sub.kind = 'plan' then p_version_id end,
     case when v_sub.kind = 'service' then p_version_id end,
     'in_app', auth.uid(), now())
  returning id into v_acceptance_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_sub.space_id, auth.uid(), 'subscription.terms_accepted', 'subscription', p_subscription_id,
    jsonb_build_object('version', v_version, 'version_id', p_version_id, 'channel', 'in_app',
                       'establishment_id', v_sub.establishment_id)
  );

  return v_acceptance_id;
end;
$$;

comment on function public.accept_subscription_terms(uuid, uuid) is
  'Opción (a) de la decisión del 12/09/2026: el propietario del
   restaurante acepta la versión VIGENTE de las condiciones de su plan o
   servicio. Idempotente (CA-17). Rechaza una versión vieja.';

revoke all on function public.accept_subscription_terms(uuid, uuid) from public, anon;
grant execute on function public.accept_subscription_terms(uuid, uuid) to authenticated;

-- ============================================================
-- 8 · (b) El equipo registra una aceptación de fuera
-- ============================================================
--
-- La fecha es un DÍA, el del contrato, y se guarda como el inicio de ese
-- día en la zona del espacio (CLAUDE.md: timestamptz, calculado en la
-- zona del espacio). No puede ser futura. Puede ser anterior a la
-- publicación de la versión a propósito: Restavor tiene contratos
-- firmados antes de que Cuotly existiera, y publicar hoy como v1 el
-- mismo texto que firmaron entonces es exactamente el caso.
create or replace function public.record_external_terms_acceptance(
  p_subscription_id uuid,
  p_version_id uuid,
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
  v_timezone text;
  v_version integer;
  v_file record;
  v_accepted_at timestamptz;
  v_acceptance_id uuid;
begin
  select id, space_id, establishment_id, kind, status into v_sub
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
    raise exception 'Hace falta la fecha en que se aceptaron las condiciones';
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

  v_version := public.assert_terms_version_current(p_subscription_id, p_version_id);

  select id into v_acceptance_id from public.terms_acceptances
  where subscription_id = p_subscription_id
    and (plan_version_id = p_version_id or service_version_id = p_version_id);
  if v_acceptance_id is not null then
    return v_acceptance_id;
  end if;

  v_accepted_at := (p_accepted_on::timestamp) at time zone v_timezone;

  insert into public.terms_acceptances
    (space_id, establishment_id, subscription_id, plan_version_id, service_version_id,
     channel, recorded_by, accepted_at, evidence_file_id)
  values
    (v_sub.space_id, v_sub.establishment_id, p_subscription_id,
     case when v_sub.kind = 'plan' then p_version_id end,
     case when v_sub.kind = 'service' then p_version_id end,
     'external', auth.uid(), v_accepted_at, p_file_id)
  returning id into v_acceptance_id;

  -- RN-ARC-02 · el contrato queda vinculado a la suscripción, y con eso
  -- RN-ARC-07 le cierra el borrado definitivo.
  perform public.link_file(p_file_id, 'subscription', p_subscription_id, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_sub.space_id, auth.uid(), 'subscription.terms_recorded', 'subscription', p_subscription_id,
    jsonb_build_object('version', v_version, 'version_id', p_version_id, 'channel', 'external',
                       'accepted_on', p_accepted_on, 'file_id', p_file_id,
                       'establishment_id', v_sub.establishment_id)
  );

  return v_acceptance_id;
end;
$$;

comment on function public.record_external_terms_acceptance(uuid, uuid, date, uuid) is
  'Opción (b) de la decisión del 12/09/2026: el equipo registra que el
   restaurante aceptó fuera de Cuotly la versión VIGENTE, con la fecha del
   contrato y el contrato como archivo del restaurante. Vincula el archivo
   a la suscripción (RN-ARC-07). Idempotente. Solo `manage_clients`.';

revoke all on function public.record_external_terms_acceptance(uuid, uuid, date, uuid) from public, anon;
grant execute on function public.record_external_terms_acceptance(uuid, uuid, date, uuid) to authenticated;

-- ============================================================
-- 9 · El estado, para las pantallas
-- ============================================================
--
-- Cuatro estados, calculados aquí y no en el navegador:
--   no_terms  · el plan o servicio no tiene condiciones publicadas;
--   pending   · las tiene y esta suscripción no ha aceptado ninguna;
--   accepted  · aceptó la vigente;
--   outdated  · aceptó una anterior y hay una más reciente.
-- "Aceptada" es la de número más alto, no la de fecha más reciente: el
-- equipo puede registrar hoy una aceptación externa de la v1 aunque el
-- restaurante ya aceptara ayer la v2, y eso no le quita la v2.
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
    subject_name := (select p.name from public.plans p where p.id = v_sub.plan_id);
    select v.id, v.version, v.published_at, v.conditions into v_cur
    from public.plan_versions v where v.plan_id = v_sub.plan_id
    order by v.version desc limit 1;
    select ta.plan_version_id as version_id, v.version, ta.accepted_at, ta.channel, ta.evidence_file_id into v_acc
    from public.terms_acceptances ta
    join public.plan_versions v on v.id = ta.plan_version_id
    where ta.subscription_id = v_sub.id
    order by v.version desc limit 1;
  else
    subject_name := (select sv.name from public.services sv where sv.id = v_sub.service_id);
    select v.id, v.version, v.published_at, v.conditions into v_cur
    from public.service_versions v where v.service_id = v_sub.service_id
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

comment on function public.subscription_terms(uuid) is
  'La versión vigente de las condiciones de una suscripción, la que tiene
   aceptada, y el estado derivado (no_terms · pending · accepted ·
   outdated). Para el equipo y para el restaurante; a quien no pueda ver
   la suscripción no le devuelve nada.';

revoke all on function public.subscription_terms(uuid) from public, anon;
grant execute on function public.subscription_terms(uuid) to authenticated;

-- ============================================================
-- 10 · Auditoría: dos familias nuevas
-- ============================================================
--
-- `plan.*` y `service.*` son configuración contractual del espacio, que es
-- de `manage_space` (§16.1). `src/core/audit.ts` lleva la misma
-- clasificación y `audit.test.ts` falla si se separan.
create or replace function public.audit_action_capability(p_action text)
returns text
language sql
immutable
as $$
  select case split_part(coalesce(p_action, ''), '.', 1)
    -- Configuración del espacio y composición del equipo: del propietario.
    when 'space' then 'manage_space'
    when 'membership' then 'manage_space'
    when 'supervision' then 'manage_space'
    when 'plan' then 'manage_space'
    when 'service' then 'manage_space'
    when 'invitation' then 'invite_member'
    -- Dinero (RN-FIN, RN-ARC-05): propietario y administradores.
    when 'charge' then 'manage_finance'
    when 'payment' then 'manage_finance'
    when 'subscription' then 'manage_finance'
    when 'financial' then 'manage_finance'
    -- Cartera de clientes: propietario y administradores.
    when 'establishment' then 'manage_clients'
    when 'establishment_access' then 'manage_clients'
    -- Las notas internas del restaurante (RN-EST-13, migración 66). El
    -- apunte registra que alguien escribió o archivó una nota; el CUERPO
    -- no está en él, a propósito.
    when 'establishment_note' then 'manage_clients'
    when 'group' then 'manage_clients'
    when 'group_access' then 'manage_clients'
    -- Festivos y cierres del espacio (§125, HU-32).
    when 'holiday' then 'manage_holidays'
    else null
  end;
$$;

revoke all on function public.audit_action_capability(text) from public, anon;
grant execute on function public.audit_action_capability(text) to authenticated;
