-- Fase 2 · Hito 9 · Menú Diario: menús, versiones, estados, publicaciones
-- y el contador de actualizaciones.
--
-- Es la primera migración de la Fase 2. Lo que trae es el SERVIDOR y el
-- DOMINIO del servicio (§57 a §64 de la especificación maestra, recogidos
-- en el PRD como RN-MEN-01 a 13): un restaurante prepara menús con
-- versiones inmutables, pide que el equipo los publique, eso consume una
-- actualización de su ciclo, un trabajador de Menú Diario lo publica a
-- mano en LandingSite y pulsa "Marcar como publicado". Las plantillas
-- visuales, la generación de PNG y PDF y las pantallas llegan en los hitos
-- siguientes (ROADMAP, Fase 2): aquí `menu_templates` solo sabe cuántas
-- hay y de dónde salen (RN-COM-10), que es lo que el flujo necesita.
--
-- **Qué se apoya en lo que ya había, y qué no.**
--
--   · El contador de actualizaciones es SEPARADO del de cambios
--     (RN-CON-02), así que no se ensancha `consumption_cycles`: tendría las
--     cuatro categorías a cero en cada ciclo de servicio y toda pantalla
--     que hoy lee "el ciclo del establecimiento" encontraría dos. Son dos
--     tablas nuevas, `menu_update_cycles` y `menu_update_entries`, con el
--     MISMO molde: ciclo mensual desde el alta de la suscripción en la zona
--     del espacio, libro inmutable de apuntes con signo, saldo = suma
--     (CLAUDE.md MUST), bloqueo de fila sobre el ciclo para el último
--     crédito (RN-CON-06) y crédito compensatorio si el ciclo ya cerró
--     (RN-CON-10).
--   · Qué servicio ES Menú Diario no se decide por el nombre (misma razón
--     que `plans.grants_priority`, migración 62): `services.kind` y
--     `services.included_updates` lo dicen, y `create_restavor_space()`
--     los siembra.
--   · Los estados viven en `menus.state` con su CHECK en la línea de la
--     columna, que es donde `state-catalogue.test.ts` los lee para que
--     `naming.ts` y el diccionario no se separen (CA-21). Son los once de
--     §63. "Publicación solicitada" y "Pendiente de asignación" son dos
--     estados por los que pasa la misma llamada: el primero deja constancia
--     de que el restaurante pidió y consumió, el segundo de que el equipo
--     aún no tiene a nadie; el historial (`menu_events`) enseña los dos.
--   · Quién es el trabajador es organización interna (P7): la fila entera
--     de `menu_publications` queda fuera del cliente con RLS, y lo que el
--     cliente sí necesita (estado, fecha de publicación, versión publicada)
--     está copiado en `menus`. En las tablas cuya fila SÍ es del cliente
--     (`menus`, `menu_versions`, `menu_events`, `menu_update_entries`) la
--     columna con el actor va con privilegio de columna, como manda
--     CLAUDE.md; el barrido de `hito7_mensajes_archivos_finanzas.sql` lo
--     comprueba sin lista escrita a mano.
--   · Sin botón Comenzar (§61): el trabajador asignado marca publicado, y
--     entre medias puede pedir información, marcar "listo para publicar"
--     (lo hará la descarga del Hito 10) o registrar un error de
--     publicación.
--
-- **La garantía de las 21:00 (§62, RN-MEN-07).** El corte es las 21:00 del
-- día anterior a la fecha objetivo, en la zona del espacio, y la
-- publicación se garantiza antes de las 08:00 si la versión definitiva y la
-- petición llegaron antes del corte. Un cambio posterior se acepta y queda
-- marcado (`menu_versions.after_cutoff`), y `menu_deadlines()`
-- lo deriva en el servidor. El recordatorio de las 20:00 es del Hito 11
-- (va por la cola de barridos).
--
-- Se comprueba con `supabase/tests/menu_diario_menus_y_actualizaciones.sql`.

-- ============================================================
-- 1 · Qué servicio es Menú Diario, y cuántas actualizaciones incluye
-- ============================================================
alter table public.services
  add column kind text not null default 'other' check (kind in ('daily_menu', 'other')),
  add column included_updates integer not null default 0 check (included_updates >= 0);

comment on column public.services.kind is
  'Qué servicio es Menú Diario no se mira por el nombre (se rompería con
   el segundo espacio de la plataforma): lo dice esta columna.';

comment on column public.services.included_updates is
  'RN-COM-09: actualizaciones incluidas por ciclo mensual, no acumulables.
   Se copia al ciclo al crearlo (RN-CON-05), como included_* en los planes.';

update public.services
set kind = 'daily_menu', included_updates = 30
where name = 'Menú Diario' and kind = 'other';

-- Al menos un servicio de Menú Diario por espacio como máximo... no: un
-- espacio podría ofrecer dos variantes. Lo que sí es imposible es un Menú
-- Diario sin actualizaciones, que dejaría el flujo entero sin crédito.
alter table public.services
  add constraint services_daily_menu_has_updates
  check (kind <> 'daily_menu' or included_updates > 0);

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

  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium,
     included_large, start_sla_hours, grants_priority)
  values
    (v_space_id, 'Básico', 9900, 0, 0, 0, 0, 48, false),
    (v_space_id, 'Impulso', 39900, 16, 12, 3, 0, 24, false),
    (v_space_id, 'Premium', 59900, 25, 24, 5, 1, 24, true);

  -- Servicio Menú Diario (RN-COM-08 a 10): 30 actualizaciones por ciclo.
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
$$;

-- La suscripción activa de Menú Diario de un restaurante, o null. Es lo
-- que decide si el módulo existe para él (§21.3 / §21.4).
create or replace function public.establishment_daily_menu_subscription(p_establishment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.subscriptions s
  join public.services sv on sv.id = s.service_id
  where s.establishment_id = p_establishment_id
    and s.kind = 'service'
    and s.status = 'active'
    and sv.kind = 'daily_menu'
  order by s.started_at
  limit 1;
$$;

comment on function public.establishment_daily_menu_subscription(uuid) is
  'La suscripción activa de Menú Diario del restaurante, o null si no
   tiene el servicio. No comprueba permisos: solo devuelve un uuid, y lo
   llaman funciones que sí lo hacen.';

revoke all on function public.establishment_daily_menu_subscription(uuid) from public, anon, authenticated;

-- ============================================================
-- 2 · Las plantillas (RN-COM-10, RN-MEN-11)
--
-- "Tres plantillas personalizadas iniciales incluidas una sola vez.
-- Sustituciones, nuevas plantillas y rediseños se presupuestan aparte."
-- Lo que este hito guarda de una plantilla es su existencia, su nombre y
-- de dónde salió; el diseño visual que se convierte en PNG y PDF llega
-- con el Hito 10 en columnas nuevas. "Una sola vez" quiere decir que
-- archivar una incluida no libera su plaza: el límite cuenta las tres
-- de siempre, archivadas o no.
-- ============================================================
create table public.menu_templates (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  origin text not null check (origin in ('included', 'quoted')),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.menu_templates is
  'RN-COM-10 · las plantillas de Menú Diario de un restaurante. `included`
   son las tres iniciales, una sola vez; `quoted` las que se presupuestan
   aparte. Solo la escribe create_menu_template(); archivar es poner
   archived_at, nunca borrar.';

alter table public.menu_templates enable row level security;

create index menu_templates_establishment_idx on public.menu_templates (establishment_id);

create policy menu_templates_select on public.menu_templates
for select using (
  public.has_capability(space_id, 'manage_requests')
  or public.is_authorized_worker_establishment(establishment_id)
  or public.can_read_establishment_as_client(establishment_id)
);

-- Quién la creó o archivó es alguien del equipo: privilegio de columna.
revoke select on public.menu_templates from anon, authenticated;
grant select (id, space_id, establishment_id, name, origin, archived_at, created_at)
  on public.menu_templates to authenticated;

create or replace function public.create_menu_template(
  p_establishment_id uuid,
  p_name text,
  p_origin text default 'included'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_included integer;
  v_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  -- Las plantillas las hace el equipo para el restaurante ("personalizadas").
  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para crear plantillas de Menú Diario en este restaurante';
  end if;

  if public.establishment_daily_menu_subscription(p_establishment_id) is null then
    raise exception 'El restaurante no tiene contratado Menú Diario';
  end if;

  if p_origin not in ('included', 'quoted') then
    raise exception 'Origen de plantilla desconocido: %', p_origin;
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'La plantilla necesita un nombre';
  end if;

  if p_origin = 'included' then
    -- Bloqueo por restaurante para que dos altas simultáneas no dejen cuatro.
    perform 1 from public.establishments where id = p_establishment_id for update;

    select count(*) into v_included
    from public.menu_templates
    where establishment_id = p_establishment_id and origin = 'included';

    if v_included >= 3 then
      raise exception 'Las tres plantillas incluidas ya se usaron (RN-COM-10): una plantilla nueva se presupuesta aparte';
    end if;
  end if;

  insert into public.menu_templates (space_id, establishment_id, name, origin, created_by)
  values (v_space_id, p_establishment_id, btrim(p_name), p_origin, auth.uid())
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'menu_template.created', 'menu_template', v_id,
          jsonb_build_object('establishment_id', p_establishment_id, 'name', btrim(p_name), 'origin', p_origin));

  return v_id;
end;
$$;

revoke all on function public.create_menu_template(uuid, text, text) from public, anon;
grant execute on function public.create_menu_template(uuid, text, text) to authenticated;

create or replace function public.archive_menu_template(p_template_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.menu_templates;
begin
  select * into v_row from public.menu_templates where id = p_template_id for update;
  if v_row.id is null then
    raise exception 'Plantilla no encontrada';
  end if;

  if not public.has_capability(v_row.space_id, 'manage_clients') then
    raise exception 'No tienes permiso para archivar plantillas de Menú Diario';
  end if;

  if v_row.archived_at is not null then
    return; -- CA-17
  end if;

  update public.menu_templates
  set archived_at = now(), archived_by = auth.uid()
  where id = p_template_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_row.space_id, auth.uid(), 'menu_template.archived', 'menu_template', p_template_id,
          jsonb_build_object('archived_at', null), jsonb_build_object('archived_at', now()), p_reason);
end;
$$;

revoke all on function public.archive_menu_template(uuid, text) from public, anon;
grant execute on function public.archive_menu_template(uuid, text) to authenticated;

-- ============================================================
-- 3 · El ciclo de actualizaciones y su libro (RN-COM-09, RN-CON-02)
-- ============================================================
create table public.menu_update_cycles (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  cycle_start timestamptz not null,
  cycle_end timestamptz not null,
  -- Copiado del servicio al crear el ciclo (RN-CON-05): un ciclo ya creado
  -- no se mueve aunque cambie el servicio.
  included_updates integer not null check (included_updates >= 0),
  created_at timestamptz not null default now(),
  unique (subscription_id, cycle_start),
  constraint menu_update_cycles_window check (cycle_end > cycle_start)
);

comment on table public.menu_update_cycles is
  'RN-COM-09 / RN-CON-02 · el ciclo mensual de actualizaciones de Menú
   Diario, separado del de cambios. Sin política de escritura: solo lo
   escribe get_or_create_menu_update_cycle().';

alter table public.menu_update_cycles enable row level security;

create index menu_update_cycles_subscription_idx on public.menu_update_cycles (subscription_id);
create index menu_update_cycles_establishment_idx on public.menu_update_cycles (establishment_id);

create policy menu_update_cycles_select on public.menu_update_cycles
for select using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

create table public.menu_update_entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  cycle_id uuid not null references public.menu_update_cycles (id) on delete cascade,
  amount integer not null check (amount <> 0),
  entry_type text not null check (entry_type in ('debit', 'return', 'compensatory_credit')),
  menu_id uuid,
  publication_id uuid,
  -- RN-CON-12: toda devolución conserva motivo y trazabilidad completa.
  related_entry_id uuid references public.menu_update_entries (id),
  reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint menu_update_entries_sign check (
    (entry_type = 'debit' and amount < 0)
    or (entry_type in ('return', 'compensatory_credit') and amount > 0)
  )
);

comment on table public.menu_update_entries is
  'Libro inmutable de actualizaciones de Menú Diario (CLAUDE.md MUST,
   RN-CON-02). El saldo del ciclo es included_updates + sum(amount); no
   existe columna de saldo. Solo escriben request_menu_publication(),
   cancel_menu_publication() y refund_menu_update().';

alter table public.menu_update_entries enable row level security;

create index menu_update_entries_cycle_idx on public.menu_update_entries (cycle_id);
create index menu_update_entries_establishment_idx on public.menu_update_entries (establishment_id);

-- Una publicación se devuelve como mucho una vez (CA-17): la segunda
-- devolución del mismo consumo es un crédito inventado.
create unique index menu_update_entries_one_credit_per_publication_idx
  on public.menu_update_entries (publication_id)
  where entry_type in ('return', 'compensatory_credit');

create policy menu_update_entries_select on public.menu_update_entries
for select using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

-- La devolución la registra alguien del equipo: privilegio de columna.
revoke select on public.menu_update_entries from anon, authenticated;
grant select (id, space_id, establishment_id, cycle_id, amount, entry_type, menu_id, publication_id,
              related_entry_id, reason, created_at)
  on public.menu_update_entries to authenticated;

-- La ventana del ciclo que contiene `p_at`, calculada como en
-- get_or_create_consumption_cycle(): meses naturales desde el alta de la
-- suscripción, en la zona del espacio (RN-DAT-08, RN-CLK-06). Pura, para
-- que leer el saldo no tenga que crear filas.
create or replace function public.menu_update_cycle_window(p_subscription_id uuid, p_at timestamptz default now())
returns table (cycle_start timestamptz, cycle_end timestamptz)
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
  from public.subscriptions s
  join public.spaces sp on sp.id = s.space_id
  where s.id = p_subscription_id and s.kind = 'service';

  if v_started_at is null then
    raise exception 'Suscripción de servicio no encontrada';
  end if;

  v_local_start := v_started_at at time zone v_timezone;
  v_local_at := p_at at time zone v_timezone;

  while (v_local_start + ((v_k + 1) || ' months')::interval) <= v_local_at loop
    v_k := v_k + 1;
  end loop;

  cycle_start := (v_local_start + (v_k || ' months')::interval) at time zone v_timezone;
  cycle_end := (v_local_start + ((v_k + 1) || ' months')::interval) at time zone v_timezone;
  return next;
end;
$$;

revoke all on function public.menu_update_cycle_window(uuid, timestamptz) from public, anon, authenticated;

-- El ciclo vigente, creándolo si no existe. INSERT ... ON CONFLICT DO
-- UPDATE es el generador idempotente Y el bloqueo de fila de RN-CON-06:
-- dos peticiones a la vez por el último crédito serializan aquí.
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

-- El saldo de actualizaciones del ciclo vigente, para la pantalla del
-- restaurante y la del equipo. No crea el ciclo: si aún no existe, dice
-- la bolsa entera del servicio. Comprueba el acceso por su cuenta.
create or replace function public.menu_update_balance(p_establishment_id uuid)
returns table (
  cycle_id uuid,
  cycle_start timestamptz,
  cycle_end timestamptz,
  included_updates integer,
  consumed integer,
  available integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_subscription_id uuid;
  v_included integer;
begin
  if not public.can_read_establishment(p_establishment_id) then
    raise exception 'No tienes acceso a este restaurante';
  end if;

  v_subscription_id := public.establishment_daily_menu_subscription(p_establishment_id);
  if v_subscription_id is null then
    return; -- sin servicio, sin filas: la pantalla dice el motivo.
  end if;

  select sv.included_updates into v_included
  from public.subscriptions s join public.services sv on sv.id = s.service_id
  where s.id = v_subscription_id;

  return query
  with w as (select * from public.menu_update_cycle_window(v_subscription_id, now())),
  c as (
    select mc.id, mc.cycle_start, mc.cycle_end, mc.included_updates
    from public.menu_update_cycles mc, w
    where mc.subscription_id = v_subscription_id and mc.cycle_start = w.cycle_start
  ),
  ledger as (
    select coalesce(sum(e.amount), 0)::integer as delta
    from public.menu_update_entries e, c
    where e.cycle_id = c.id
  )
  select
    c.id,
    coalesce(c.cycle_start, w.cycle_start),
    coalesce(c.cycle_end, w.cycle_end),
    coalesce(c.included_updates, v_included),
    (-least(ledger.delta, 0))::integer,
    (coalesce(c.included_updates, v_included) + ledger.delta)::integer
  from w
  left join c on true
  cross join ledger;
end;
$$;

revoke all on function public.menu_update_balance(uuid) from public, anon;
grant execute on function public.menu_update_balance(uuid) to authenticated;

-- ============================================================
-- 4 · Menús, versiones, publicaciones e historial
-- ============================================================
create table public.menus (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  -- §57: "diario, Navidad, infantil, grupos o evento especial". Los cinco
  -- que nombra la maestra, ni uno más: añadir un tipo es una decisión.
  kind text not null check (kind in ('daily', 'christmas', 'kids', 'groups', 'special_event')),
  target_date date not null,
  template_id uuid references public.menu_templates (id),
  -- §63, los once estados. `state-catalogue.test.ts` lee este CHECK.
  state text not null default 'draft' check (state in (
    'draft', 'prepared', 'publication_requested', 'pending_assignment', 'assigned',
    'needs_information', 'reviewing', 'ready_to_publish', 'published', 'cancelled',
    'publication_error'
  )),
  current_version_id uuid,
  -- Lo que el cliente puede saber de la publicación (§61): fecha, versión
  -- y plantilla. Quién la hizo está en menu_publications, que no lee.
  published_at timestamptz,
  published_version_id uuid,
  published_template_id uuid references public.menu_templates (id),
  cancelled_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.menus is
  'RN-MEN-01 · un menú de Menú Diario: nombre, tipo, fecha objetivo,
   plantilla, versión vigente y estado (§57). Varios por restaurante y
   fecha. Sin política de escritura: todo pasa por las funciones de este
   archivo, que registran evento, auditoría y consumo.';

alter table public.menus enable row level security;

create index menus_establishment_date_idx on public.menus (establishment_id, target_date);
create index menus_space_state_idx on public.menus (space_id, state);

create table public.menu_versions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  menu_id uuid not null references public.menus (id) on delete cascade,
  version integer not null check (version >= 1),
  -- §58: primeros, segundos, postres, bebida, precio, nota.
  starters text[] not null default '{}',
  mains text[] not null default '{}',
  desserts text[] not null default '{}',
  drink text,
  price_cents integer check (price_cents >= 0),
  note text check (note is null or length(note) <= 2000),
  -- §62: guardada después de las 21:00 del día anterior a la fecha objetivo.
  after_cutoff boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (menu_id, version)
);

comment on table public.menu_versions is
  'RN-MEN-03 · cada guardado es una versión nueva e inmutable; ninguna se
   edita ni se borra (P4, §64: el historial conserva platos, precio y
   nota de cada versión). Solo la escribe save_menu_version().';

alter table public.menu_versions enable row level security;

alter table public.menus
  add constraint menus_current_version_fk
  foreign key (current_version_id) references public.menu_versions (id);

alter table public.menus
  add constraint menus_published_version_fk
  foreign key (published_version_id) references public.menu_versions (id);

create table public.menu_publications (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  menu_id uuid not null references public.menus (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  requested_at timestamptz not null default now(),
  requested_version_id uuid not null references public.menu_versions (id),
  idempotency_key text,
  cycle_id uuid not null references public.menu_update_cycles (id),
  debit_entry_id uuid not null references public.menu_update_entries (id),
  -- §62: si la petición llegó antes del corte. La garantía FINAL la deriva
  -- menu_deadlines(), porque una versión posterior la pierde.
  requested_before_cutoff boolean not null,
  assigned_to uuid references public.profiles (id),
  assigned_at timestamptz,
  assignment_mode text check (assignment_mode in ('auto', 'manual')),
  published_by uuid references public.profiles (id),
  published_at timestamptz,
  published_version_id uuid references public.menu_versions (id),
  published_template_id uuid references public.menu_templates (id),
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now()
);

comment on table public.menu_publications is
  'RN-MEN-05/06 · una petición de publicación: quién la pidió, qué versión,
   qué consumió, a quién se asignó y quién la publicó. Fila interna del
   equipo (P7): el cliente no la lee; lo que le corresponde saber está en
   menus. Solo la escriben las funciones de este archivo.';

alter table public.menu_publications enable row level security;

create index menu_publications_menu_idx on public.menu_publications (menu_id);
create index menu_publications_assignee_idx on public.menu_publications (assigned_to) where published_at is null and cancelled_at is null;

-- Como mucho una publicación viva por menú.
create unique index menu_publications_one_active_idx
  on public.menu_publications (menu_id)
  where published_at is null and cancelled_at is null;

create unique index menu_publications_idempotency_idx
  on public.menu_publications (menu_id, idempotency_key)
  where idempotency_key is not null;

alter table public.menu_update_entries
  add constraint menu_update_entries_menu_fk foreign key (menu_id) references public.menus (id),
  add constraint menu_update_entries_publication_fk foreign key (publication_id) references public.menu_publications (id);

create table public.menu_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  menu_id uuid not null references public.menus (id) on delete cascade,
  publication_id uuid references public.menu_publications (id),
  from_state text,
  to_state text not null,
  actor_id uuid references public.profiles (id),
  reason text,
  -- clock_timestamp() y no now(): una misma llamada deja varios eventos
  -- (pedir la publicación pasa por dos estados de §63 y a veces tres), y
  -- now() les daría a todos la misma hora, con lo que el historial no
  -- tendría orden.
  occurred_at timestamptz not null default clock_timestamp()
);

comment on table public.menu_events is
  'RN-MEN-10 · libro inmutable de cambios de estado de un menú (§64). Sin
   política de escritura. El cliente lo lee sin actor_id (privilegio de
   columna): el actor puede ser alguien del equipo.';

alter table public.menu_events enable row level security;

create index menu_events_menu_idx on public.menu_events (menu_id, occurred_at);

-- ------------------------------------------------------------
-- Quién lee qué.
-- ------------------------------------------------------------
create or replace function public.can_read_menu_establishment(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_capability((select e.space_id from public.establishments e where e.id = p_establishment_id), 'manage_requests')
    or public.is_authorized_worker_establishment(p_establishment_id)
    or public.can_read_establishment_as_client(p_establishment_id);
$$;

comment on function public.can_read_menu_establishment(uuid) is
  'Quién lee los menús de un restaurante: propietario y administradores
   del espacio, los trabajadores autorizados en ese restaurante (§4.2) y
   el lado cliente, Consulta incluida. Aparece en políticas de RLS, así
   que conserva el EXECUTE de authenticated (CLAUDE.md).';

revoke all on function public.can_read_menu_establishment(uuid) from public, anon;
grant execute on function public.can_read_menu_establishment(uuid) to authenticated;

create policy menus_select on public.menus
for select using (public.can_read_menu_establishment(establishment_id));

create policy menu_versions_select on public.menu_versions
for select using (
  public.can_read_menu_establishment((select m.establishment_id from public.menus m where m.id = menu_id))
);

create policy menu_events_select on public.menu_events
for select using (
  public.can_read_menu_establishment((select m.establishment_id from public.menus m where m.id = menu_id))
);

-- P7: la publicación es organización interna. El cliente queda fuera de
-- la FILA, no de una columna (CLAUDE.md, bloqueante B2 de la cuarta revisión).
create policy menu_publications_select on public.menu_publications
for select using (
  public.has_capability(space_id, 'manage_requests')
  or assigned_to = auth.uid()
);

-- Las filas que SÍ son del cliente tapan la columna del actor.
revoke select on public.menus from anon, authenticated;
grant select (id, space_id, establishment_id, name, kind, target_date, template_id, state,
              current_version_id, published_at, published_version_id, published_template_id,
              cancelled_at, created_at, updated_at)
  on public.menus to authenticated;

revoke select on public.menu_versions from anon, authenticated;
grant select (id, space_id, menu_id, version, starters, mains, desserts, drink, price_cents, note,
              after_cutoff, created_at)
  on public.menu_versions to authenticated;

revoke select on public.menu_events from anon, authenticated;
grant select (id, space_id, menu_id, publication_id, from_state, to_state, reason, occurred_at)
  on public.menu_events to authenticated;

-- ============================================================
-- 5 · El corte de las 21:00 y la garantía (§62, RN-MEN-07)
-- ============================================================
create or replace function public.menu_cutoff_at(p_target_date date, p_space_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((p_target_date - 1)::timestamp + time '21:00') at time zone
         (select timezone from public.spaces where id = p_space_id);
$$;

create or replace function public.menu_publish_by_at(p_target_date date, p_space_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (p_target_date::timestamp + time '08:00') at time zone
         (select timezone from public.spaces where id = p_space_id);
$$;

-- Internas: no comprueban nada. Lo que la pantalla necesita sale de
-- menu_deadlines(), que sí comprueba; para una fecha que aún no es de
-- ningún menú, `src/core/daily-menu.ts` calcula lo mismo.
revoke all on function public.menu_cutoff_at(date, uuid) from public, anon, authenticated;
revoke all on function public.menu_publish_by_at(date, uuid) from public, anon, authenticated;

-- Los plazos de un menú y si su publicación está garantizada (§62):
-- garantizada si la petición Y la última versión llegaron antes del
-- corte. `guaranteed` es null mientras no hay publicación pedida. Quien
-- lee el menú lee esto; la publicación (fila interna) no se expone.
create or replace function public.menu_deadlines(p_menu_id uuid)
returns table (
  cutoff_at timestamptz,
  publish_by_at timestamptz,
  requested_at timestamptz,
  guaranteed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_requested_at timestamptz;
begin
  select * into v_menu from public.menus where id = p_menu_id;
  if v_menu.id is null or not public.can_read_menu_establishment(v_menu.establishment_id) then
    raise exception 'Menú no encontrado';
  end if;

  select p.requested_at into v_requested_at
  from public.menu_publications p
  where p.menu_id = p_menu_id and p.cancelled_at is null
  order by p.requested_at desc limit 1;

  cutoff_at := public.menu_cutoff_at(v_menu.target_date, v_menu.space_id);
  publish_by_at := public.menu_publish_by_at(v_menu.target_date, v_menu.space_id);
  requested_at := v_requested_at;
  guaranteed := case
    when v_requested_at is null then null
    else v_requested_at <= cutoff_at
      and not exists (
        select 1 from public.menu_versions v
        where v.menu_id = p_menu_id and v.after_cutoff and v.created_at >= v_requested_at
      )
  end;
  return next;
end;
$$;

revoke all on function public.menu_deadlines(uuid) from public, anon;
grant execute on function public.menu_deadlines(uuid) to authenticated;

-- ============================================================
-- 6 · Helpers internos: permisos, eventos y avisos
-- ============================================================
create or replace function public.can_write_menus(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_write_establishment(p_establishment_id)
    or public.has_capability((select e.space_id from public.establishments e where e.id = p_establishment_id), 'manage_requests');
$$;

comment on function public.can_write_menus(uuid) is
  'Quién prepara menús: el propietario local, el Editor y el propietario
   global (§4.3; Consulta no), y el equipo con manage_requests. El
   trabajador de Menú Diario publica, no escribe el menú del cliente.';

revoke all on function public.can_write_menus(uuid) from public, anon;
grant execute on function public.can_write_menus(uuid) to authenticated;

create or replace function public.record_menu_event(
  p_menu_id uuid,
  p_publication_id uuid,
  p_from_state text,
  p_to_state text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.menu_events (space_id, menu_id, publication_id, from_state, to_state, actor_id, reason)
  select m.space_id, m.id, p_publication_id, p_from_state, p_to_state, auth.uid(), p_reason
  from public.menus m where m.id = p_menu_id;

  update public.menus set state = p_to_state, updated_at = now() where id = p_menu_id;
end;
$$;

revoke all on function public.record_menu_event(uuid, uuid, text, text, text) from public, anon, authenticated;

-- El catálogo de eventos admite los cinco de Menú Diario. Duplicado a
-- propósito en `src/core/notifications.ts`; `listas-compartidas.test.ts`
-- lee esta ÚLTIMA definición.
alter table public.notifications
  drop constraint notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check check (event_type in (
    'request_submitted',
    'job_unassigned',
    'job_assigned',
    'job_started',
    'job_published',
    'correction_requested',
    'job_reassignment_requested',
    'task_reassignment_requested',
    'terms_version_published',
    'menu_publication_requested',
    'menu_assigned',
    'menu_needs_information',
    'menu_published',
    'menu_publication_error',
    'consumption_threshold_80',
    'consumption_threshold_100',
    't2_threshold_50',
    't2_threshold_80',
    't2_threshold_100',
    't2_critical_alert',
    't2_reassignment_suggestion',
    't3_threshold_75',
    't3_threshold_90',
    't3_threshold_100',
    'establishment_paused_nonpayment',
    'establishment_suspended_nonpayment',
    'establishment_reactivated',
    'absence_requested',
    'absence_decided',
    'absence_uncovered_jobs'
  ));

-- Y la entidad a la que apunta el enlace profundo (RN-NOT-04): un menú.
-- Sin esto emit_notification() se traga el CHECK (RN-NOT-05: el fallo de
-- un aviso nunca revierte la operación) y nadie se entera — que es
-- exactamente lo que pasó al escribir esta migración, y lo que la suite
-- caza contando destinatarios.
alter table public.notifications
  drop constraint notifications_entity_type_check;

alter table public.notifications
  add constraint notifications_entity_type_check check (entity_type in (
    'request', 'job', 'task', 'establishment', 'charge', 'absence', 'menu'
  ));

-- A quién avisa cada evento de un menú (§18, RN-NOT-01):
--   · menu_publication_requested, menu_publication_error → propietario y
--     administradores (es una cola que alguien tiene que atender).
--   · menu_assigned → el trabajador asignado, además del equipo que gestiona.
--   · menu_needs_information → el restaurante (todos los miembros no
--     revocados, RN-EST-05), que es a quien se le pide algo.
--   · menu_published → el restaurante y el equipo que gestiona (§18:
--     "Publicación → cliente y supervisión correspondiente").
create or replace function public.notify_menu_event(p_menu_id uuid, p_event_type text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_assigned_to uuid;
  v_publication_id uuid;
  v_link text;
  v_key text;
  v_recipient uuid;
  v_sent integer := 0;
begin
  select m.space_id, m.establishment_id into v_space_id, v_establishment_id
  from public.menus m where m.id = p_menu_id;

  if v_space_id is null then
    return 0;
  end if;

  select p.id, p.assigned_to into v_publication_id, v_assigned_to
  from public.menu_publications p
  where p.menu_id = p_menu_id and p.published_at is null and p.cancelled_at is null
  order by p.requested_at desc limit 1;

  if v_publication_id is null then
    select p.id, p.assigned_to into v_publication_id, v_assigned_to
    from public.menu_publications p
    where p.menu_id = p_menu_id order by p.requested_at desc limit 1;
  end if;

  v_link := '/espacios/' || public.space_slug(v_space_id) || '/menu-diario/' || p_menu_id::text;
  -- Cada publicación es un aviso nuevo; la misma no repite (CA-17).
  v_key := p_event_type || ':' || p_menu_id::text || ':' || coalesce(v_publication_id::text, '-')
           || case when p_event_type = 'menu_assigned' then ':' || coalesce(v_assigned_to::text, '-') else '' end;

  if p_event_type in ('menu_publication_requested', 'menu_publication_error', 'menu_assigned', 'menu_published') then
    for v_recipient in
      select sm.user_id from public.space_memberships sm
      where sm.space_id = v_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
      union
      select v_assigned_to where v_assigned_to is not null and p_event_type = 'menu_assigned'
    loop
      if public.emit_notification(
           v_space_id, v_recipient, p_event_type, 'staff', 'menu', p_menu_id,
           v_link, v_key, v_establishment_id) is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end if;

  if p_event_type in ('menu_needs_information', 'menu_published') then
    for v_recipient in
      select em.user_id from public.establishment_memberships em
      where em.establishment_id = v_establishment_id and em.revoked_at is null
    loop
      if public.emit_notification(
           v_space_id, v_recipient, p_event_type, 'client', 'menu', p_menu_id,
           v_link, v_key || ':client', v_establishment_id) is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end if;

  return v_sent;
end;
$$;

revoke all on function public.notify_menu_event(uuid, text) from public, anon, authenticated;

-- Candidatos a publicar un menú: quien puede ejecutar trabajos, con la
-- especialidad daily_menu (o general), autorizado en el restaurante si es
-- trabajador, y disponible. Es el mismo criterio que
-- is_eligible_job_candidate() con la especialidad fijada.
create or replace function public.menu_candidate_ids(p_menu_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select sm.user_id
  from public.menus m
  join public.space_memberships sm on sm.space_id = m.space_id
  where m.id = p_menu_id
    and sm.status = 'active'
    and sm.role <> 'owner'
    and public.member_can_perform_jobs(m.space_id, sm.user_id)
    and (sm.role <> 'worker' or public.is_authorized_for_establishment(m.establishment_id, sm.user_id))
    and exists (
      select 1 from public.worker_specialties ws
      where ws.user_id = sm.user_id and ws.space_id = m.space_id and ws.revoked_at is null
        and ws.specialty in ('general', 'daily_menu')
    )
    and not exists (
      select 1 from public.worker_availability wa
      where wa.space_id = m.space_id and wa.user_id = sm.user_id and wa.available = false
    );
$$;

-- Interna: no comprueba permisos (la pantalla de asignar del Hito 11
-- tendrá su lista con comprobación, como list_job_candidates()).
revoke all on function public.menu_candidate_ids(uuid) from public, anon, authenticated;

-- ============================================================
-- 7 · Preparar un menú: crear, guardar versiones, copiar, preparar
-- ============================================================
create or replace function public.create_menu(
  p_establishment_id uuid,
  p_name text,
  p_kind text,
  p_target_date date,
  p_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.can_write_menus(p_establishment_id) then
    raise exception 'No tienes permiso para preparar menús en este restaurante';
  end if;

  if public.establishment_daily_menu_subscription(p_establishment_id) is null then
    raise exception 'El restaurante no tiene contratado Menú Diario';
  end if;

  if p_template_id is not null and not exists (
    select 1 from public.menu_templates t
    where t.id = p_template_id and t.establishment_id = p_establishment_id and t.archived_at is null
  ) then
    raise exception 'La plantilla no es de este restaurante o está archivada';
  end if;

  insert into public.menus (space_id, establishment_id, name, kind, target_date, template_id, created_by)
  values (v_space_id, p_establishment_id, btrim(p_name), p_kind, p_target_date, p_template_id, auth.uid())
  returning id into v_id;

  perform public.record_menu_event(v_id, null, null, 'draft');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'menu.created', 'menu', v_id,
          jsonb_build_object('establishment_id', p_establishment_id, 'name', btrim(p_name),
                             'kind', p_kind, 'target_date', p_target_date));

  return v_id;
end;
$$;

revoke all on function public.create_menu(uuid, text, text, date, uuid) from public, anon;
grant execute on function public.create_menu(uuid, text, text, date, uuid) to authenticated;

create or replace function public.update_menu_details(
  p_menu_id uuid,
  p_name text,
  p_kind text,
  p_target_date date,
  p_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para editar este menú';
  end if;

  if v_menu.state in ('published', 'cancelled') then
    raise exception 'Un menú publicado o cancelado no se edita: copia el menú para crear un borrador nuevo';
  end if;

  if p_template_id is not null and not exists (
    select 1 from public.menu_templates t
    where t.id = p_template_id and t.establishment_id = v_menu.establishment_id and t.archived_at is null
  ) then
    raise exception 'La plantilla no es de este restaurante o está archivada';
  end if;

  update public.menus
  set name = btrim(p_name), kind = p_kind, target_date = p_target_date,
      template_id = p_template_id, updated_at = now()
  where id = p_menu_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.details_updated', 'menu', p_menu_id,
          jsonb_build_object('name', v_menu.name, 'kind', v_menu.kind, 'target_date', v_menu.target_date,
                             'template_id', v_menu.template_id),
          jsonb_build_object('name', btrim(p_name), 'kind', p_kind, 'target_date', p_target_date,
                             'template_id', p_template_id));
end;
$$;

revoke all on function public.update_menu_details(uuid, text, text, date, uuid) from public, anon;
grant execute on function public.update_menu_details(uuid, text, text, date, uuid) to authenticated;

-- Cada guardado es una versión (RN-MEN-03). Si el menú estaba esperando
-- información del restaurante, el guardado ES la respuesta: pasa a
-- "revisando" para que el trabajador lo mire (§63).
create or replace function public.save_menu_version(
  p_menu_id uuid,
  p_starters text[],
  p_mains text[],
  p_desserts text[],
  p_drink text default null,
  p_price_cents integer default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_version integer;
  v_after_cutoff boolean;
  v_id uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para editar este menú';
  end if;

  if v_menu.state in ('published', 'cancelled') then
    raise exception 'Un menú publicado o cancelado no se edita: copia el menú para crear un borrador nuevo';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.menu_versions where menu_id = p_menu_id;

  v_after_cutoff := now() > public.menu_cutoff_at(v_menu.target_date, v_menu.space_id);

  insert into public.menu_versions
    (space_id, menu_id, version, starters, mains, desserts, drink, price_cents, note, after_cutoff, created_by)
  values
    (v_menu.space_id, p_menu_id, v_version, coalesce(p_starters, '{}'), coalesce(p_mains, '{}'),
     coalesce(p_desserts, '{}'), nullif(btrim(p_drink), ''), p_price_cents, nullif(btrim(p_note), ''),
     v_after_cutoff, auth.uid())
  returning id into v_id;

  update public.menus set current_version_id = v_id, updated_at = now() where id = p_menu_id;

  if v_menu.state = 'needs_information' then
    perform public.record_menu_event(p_menu_id,
      (select id from public.menu_publications where menu_id = p_menu_id and published_at is null and cancelled_at is null),
      'needs_information', 'reviewing', 'Versión ' || v_version || ' guardada por el restaurante');
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.version_saved', 'menu', p_menu_id,
          jsonb_build_object('version', v_version, 'version_id', v_id, 'after_cutoff', v_after_cutoff));

  return v_id;
end;
$$;

revoke all on function public.save_menu_version(uuid, text[], text[], text[], text, integer, text) from public, anon;
grant execute on function public.save_menu_version(uuid, text[], text[], text[], text, integer, text) to authenticated;

-- "Guardado / Preparado" (§63): el restaurante dice que el menú está
-- completo. Exige contenido y plantilla, que es lo que el equipo va a
-- necesitar para publicarlo.
create or replace function public.prepare_menu(p_menu_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para preparar este menú';
  end if;

  if v_menu.state = 'prepared' then
    return; -- CA-17
  end if;

  if v_menu.state <> 'draft' then
    raise exception 'Solo un borrador se marca como preparado (estado actual: %)', v_menu.state;
  end if;

  if v_menu.current_version_id is null then
    raise exception 'El menú no tiene contenido guardado';
  end if;

  if v_menu.template_id is null then
    raise exception 'El menú necesita una plantilla';
  end if;

  perform public.record_menu_event(p_menu_id, null, 'draft', 'prepared');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.prepared', 'menu', p_menu_id,
          jsonb_build_object('state', 'draft'), jsonb_build_object('state', 'prepared'));
end;
$$;

revoke all on function public.prepare_menu(uuid) from public, anon;
grant execute on function public.prepare_menu(uuid) to authenticated;

-- "Copiar menú anterior crea un borrador" (§59): mismo contenido como
-- versión 1 del nuevo, con la fecha que se pida.
create or replace function public.copy_menu(p_menu_id uuid, p_target_date date, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_version public.menu_versions;
  v_new_id uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para copiar este menú';
  end if;

  v_new_id := public.create_menu(
    v_menu.establishment_id, coalesce(nullif(btrim(p_name), ''), v_menu.name), v_menu.kind, p_target_date,
    case when exists (select 1 from public.menu_templates t where t.id = v_menu.template_id and t.archived_at is null)
         then v_menu.template_id else null end);

  if v_menu.current_version_id is not null then
    select * into v_version from public.menu_versions where id = v_menu.current_version_id;
    perform public.save_menu_version(v_new_id, v_version.starters, v_version.mains, v_version.desserts,
                                     v_version.drink, v_version.price_cents, v_version.note);
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.copied', 'menu', v_new_id,
          jsonb_build_object('copied_from', p_menu_id, 'target_date', p_target_date));

  return v_new_id;
end;
$$;

revoke all on function public.copy_menu(uuid, date, text) from public, anon;
grant execute on function public.copy_menu(uuid, date, text) to authenticated;

-- ============================================================
-- 8 · Pedir la publicación: consume una actualización (RN-MEN-05)
-- ============================================================
create or replace function public.request_menu_publication(p_menu_id uuid, p_idempotency_key text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_subscription_id uuid;
  v_cycle_id uuid;
  v_included integer;
  v_available integer;
  v_entry_id uuid;
  v_publication_id uuid;
  v_before_cutoff boolean;
  v_candidate_count integer;
  v_worker_id uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para pedir la publicación de este menú';
  end if;

  -- CA-17 / RN-CON-07: la misma petición dos veces devuelve la misma fila.
  if p_idempotency_key is not null then
    select id into v_publication_id from public.menu_publications
    where menu_id = p_menu_id and idempotency_key = p_idempotency_key;
    if v_publication_id is not null then
      return v_publication_id;
    end if;
  end if;

  select id into v_publication_id from public.menu_publications
  where menu_id = p_menu_id and published_at is null and cancelled_at is null;
  if v_publication_id is not null then
    return v_publication_id;
  end if;

  if v_menu.state <> 'prepared' then
    raise exception 'Solo un menú preparado se puede mandar a publicar (estado actual: %)', v_menu.state;
  end if;

  -- RN-MEN-13 / §85 / RN-FIN-12: con el servicio detenido no se piden publicaciones.
  perform public.assert_establishment_service_running(v_menu.establishment_id);

  v_subscription_id := public.establishment_daily_menu_subscription(v_menu.establishment_id);
  if v_subscription_id is null then
    raise exception 'El restaurante no tiene contratado Menú Diario';
  end if;

  -- RN-CON-06: el ciclo queda bloqueado hasta que esta transacción acabe.
  v_cycle_id := public.get_or_create_menu_update_cycle(v_subscription_id);

  select c.included_updates + coalesce((select sum(e.amount) from public.menu_update_entries e where e.cycle_id = c.id), 0)
  into v_available
  from public.menu_update_cycles c where c.id = v_cycle_id;

  if v_available < 1 then
    raise exception 'No quedan actualizaciones en este ciclo (RN-COM-09): se renuevan al empezar el siguiente';
  end if;

  insert into public.menu_update_entries
    (space_id, establishment_id, cycle_id, amount, entry_type, menu_id, reason, created_by)
  values
    (v_menu.space_id, v_menu.establishment_id, v_cycle_id, -1, 'debit', p_menu_id,
     'Publicación solicitada', auth.uid())
  returning id into v_entry_id;

  v_before_cutoff := now() <= public.menu_cutoff_at(v_menu.target_date, v_menu.space_id);

  insert into public.menu_publications
    (space_id, establishment_id, menu_id, requested_by, requested_version_id, idempotency_key,
     cycle_id, debit_entry_id, requested_before_cutoff)
  values
    (v_menu.space_id, v_menu.establishment_id, p_menu_id, auth.uid(), v_menu.current_version_id,
     p_idempotency_key, v_cycle_id, v_entry_id, v_before_cutoff)
  returning id into v_publication_id;

  update public.menu_update_entries set publication_id = v_publication_id where id = v_entry_id;

  perform public.record_menu_event(p_menu_id, v_publication_id, 'prepared', 'publication_requested');
  perform public.record_menu_event(p_menu_id, v_publication_id, 'publication_requested', 'pending_assignment');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.publication_requested', 'menu', p_menu_id,
          jsonb_build_object('publication_id', v_publication_id, 'version_id', v_menu.current_version_id,
                             'cycle_id', v_cycle_id, 'entry_id', v_entry_id,
                             'requested_before_cutoff', v_before_cutoff));

  -- RN-ASG-04, aplicado a Menú Diario: con un único candidato válido se
  -- asigna solo; con varios o ninguno queda pendiente y avisa al equipo.
  select count(*), min(c::text)::uuid into v_candidate_count, v_worker_id
  from public.menu_candidate_ids(p_menu_id) as c;

  if v_candidate_count = 1 then
    update public.menu_publications
    set assigned_to = v_worker_id, assigned_at = now(), assignment_mode = 'auto'
    where id = v_publication_id;

    perform public.record_menu_event(p_menu_id, v_publication_id, 'pending_assignment', 'assigned', 'Asignación automática');

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (v_menu.space_id, auth.uid(), 'menu.assigned', 'menu', p_menu_id,
            jsonb_build_object('publication_id', v_publication_id, 'assigned_to', v_worker_id, 'mode', 'auto'));

    perform public.notify_menu_event(p_menu_id, 'menu_assigned');
  else
    perform public.notify_menu_event(p_menu_id, 'menu_publication_requested');
  end if;

  return v_publication_id;
end;
$$;

revoke all on function public.request_menu_publication(uuid, text) from public, anon;
grant execute on function public.request_menu_publication(uuid, text) to authenticated;

-- ============================================================
-- 9 · El equipo: asignar, pedir información, listo, publicado, error
-- ============================================================

-- La publicación viva de un menú, bloqueada, o excepción.
create or replace function public.lock_active_menu_publication(p_menu_id uuid)
returns public.menu_publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pub public.menu_publications;
begin
  select * into v_pub from public.menu_publications
  where menu_id = p_menu_id and published_at is null and cancelled_at is null
  for update;

  if v_pub.id is null then
    raise exception 'El menú no tiene ninguna publicación pendiente';
  end if;

  return v_pub;
end;
$$;

revoke all on function public.lock_active_menu_publication(uuid) from public, anon, authenticated;

create or replace function public.assign_menu_publication(p_menu_id uuid, p_worker_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.has_capability(v_menu.space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para asignar publicaciones de Menú Diario';
  end if;

  v_pub := public.lock_active_menu_publication(p_menu_id);

  if v_pub.assigned_to = p_worker_id then
    return; -- CA-17
  end if;

  if not exists (select 1 from public.menu_candidate_ids(p_menu_id) c where c = p_worker_id) then
    raise exception 'Esa persona no puede publicar menús de este restaurante: necesita la especialidad Menú Diario, autorización en el restaurante y estar disponible';
  end if;

  update public.menu_publications
  set assigned_to = p_worker_id, assigned_at = now(), assignment_mode = 'manual'
  where id = v_pub.id;

  if v_menu.state = 'pending_assignment' then
    perform public.record_menu_event(p_menu_id, v_pub.id, 'pending_assignment', 'assigned', p_reason);
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_menu.space_id, auth.uid(),
          case when v_pub.assigned_to is null then 'menu.assigned' else 'menu.reassigned' end,
          'menu', p_menu_id,
          jsonb_build_object('assigned_to', v_pub.assigned_to),
          jsonb_build_object('publication_id', v_pub.id, 'assigned_to', p_worker_id, 'mode', 'manual'),
          p_reason);

  perform public.notify_menu_event(p_menu_id, 'menu_assigned');
end;
$$;

revoke all on function public.assign_menu_publication(uuid, uuid, text) from public, anon;
grant execute on function public.assign_menu_publication(uuid, uuid, text) to authenticated;

-- Quién actúa sobre una publicación por el equipo: el asignado, o quien
-- gestiona (manage_requests) cuando no hay nadie o hay que suplirle.
create or replace function public.assert_can_write_menu_publication(p_menu public.menus, p_pub public.menu_publications)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pub.assigned_to = auth.uid() then
    return;
  end if;
  if public.has_capability(p_menu.space_id, 'manage_requests') then
    return;
  end if;
  raise exception 'Solo el trabajador asignado, el propietario o un administrador actúan sobre esta publicación';
end;
$$;

revoke all on function public.assert_can_write_menu_publication(public.menus, public.menu_publications) from public, anon, authenticated;

create or replace function public.request_menu_information(p_menu_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  v_pub := public.lock_active_menu_publication(p_menu_id);
  perform public.assert_can_write_menu_publication(v_menu, v_pub);

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Di qué información falta: el restaurante tiene que saber qué contestar';
  end if;

  if v_menu.state = 'needs_information' then
    return; -- CA-17
  end if;

  if v_menu.state not in ('assigned', 'reviewing', 'ready_to_publish') then
    raise exception 'No se puede pedir información en el estado %', v_menu.state;
  end if;

  perform public.record_menu_event(p_menu_id, v_pub.id, v_menu.state, 'needs_information', btrim(p_reason));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_menu.space_id, auth.uid(), 'menu.information_requested', 'menu', p_menu_id,
          jsonb_build_object('state', v_menu.state), jsonb_build_object('state', 'needs_information'), btrim(p_reason));

  perform public.notify_menu_event(p_menu_id, 'menu_needs_information');
end;
$$;

revoke all on function public.request_menu_information(uuid, text) from public, anon;
grant execute on function public.request_menu_information(uuid, text) to authenticated;

-- El restaurante contesta sin cambiar el menú ("está bien como está").
create or replace function public.provide_menu_information(p_menu_id uuid, p_answer text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para contestar por este restaurante';
  end if;

  if v_menu.state <> 'needs_information' then
    return; -- CA-17: ya contestado, o nunca se pidió.
  end if;

  v_pub := public.lock_active_menu_publication(p_menu_id);
  perform public.record_menu_event(p_menu_id, v_pub.id, 'needs_information', 'reviewing', nullif(btrim(p_answer), ''));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_menu.space_id, auth.uid(), 'menu.information_provided', 'menu', p_menu_id,
          jsonb_build_object('state', 'needs_information'), jsonb_build_object('state', 'reviewing'),
          nullif(btrim(p_answer), ''));
end;
$$;

revoke all on function public.provide_menu_information(uuid, text) from public, anon;
grant execute on function public.provide_menu_information(uuid, text) to authenticated;

-- "Listo para publicar" (§63): el trabajador ya tiene el archivo. En el
-- Hito 10 lo pondrá la descarga; hasta entonces, el botón.
create or replace function public.mark_menu_ready_to_publish(p_menu_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  v_pub := public.lock_active_menu_publication(p_menu_id);
  perform public.assert_can_write_menu_publication(v_menu, v_pub);

  if v_menu.state = 'ready_to_publish' then
    return;
  end if;

  if v_menu.state not in ('assigned', 'reviewing') then
    raise exception 'No se puede marcar listo para publicar en el estado %', v_menu.state;
  end if;

  perform public.record_menu_event(p_menu_id, v_pub.id, v_menu.state, 'ready_to_publish');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.ready_to_publish', 'menu', p_menu_id,
          jsonb_build_object('state', v_menu.state), jsonb_build_object('state', 'ready_to_publish'));
end;
$$;

revoke all on function public.mark_menu_ready_to_publish(uuid) from public, anon;
grant execute on function public.mark_menu_ready_to_publish(uuid) to authenticated;

-- "Marcar como publicado" (§61): registra fecha y hora, usuario, versión,
-- plantilla y consumo, y avisa al restaurante. Sin botón Comenzar.
create or replace function public.mark_menu_published(p_menu_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if v_menu.state = 'published' then
    return; -- CA-17 / RN-CON-07: dos pulsaciones, un efecto.
  end if;

  v_pub := public.lock_active_menu_publication(p_menu_id);
  perform public.assert_can_write_menu_publication(v_menu, v_pub);

  if v_menu.state not in ('assigned', 'reviewing', 'ready_to_publish', 'publication_error') then
    raise exception 'No se puede marcar publicado en el estado %', v_menu.state;
  end if;

  -- §85: con el restaurante suspendido se detienen las publicaciones.
  perform public.assert_establishment_service_running(v_menu.establishment_id);

  if v_menu.current_version_id is null then
    raise exception 'El menú no tiene contenido';
  end if;

  update public.menu_publications
  set published_by = auth.uid(), published_at = now(),
      published_version_id = v_menu.current_version_id, published_template_id = v_menu.template_id
  where id = v_pub.id;

  update public.menus
  set published_at = now(), published_version_id = current_version_id, published_template_id = template_id
  where id = p_menu_id;

  perform public.record_menu_event(p_menu_id, v_pub.id, v_menu.state, 'published');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.published', 'menu', p_menu_id,
          jsonb_build_object('state', v_menu.state),
          jsonb_build_object('state', 'published', 'publication_id', v_pub.id,
                             'version_id', v_menu.current_version_id, 'template_id', v_menu.template_id,
                             'entry_id', v_pub.debit_entry_id, 'published_at', now()));

  perform public.notify_menu_event(p_menu_id, 'menu_published');
end;
$$;

revoke all on function public.mark_menu_published(uuid) from public, anon;
grant execute on function public.mark_menu_published(uuid) to authenticated;

-- "Error de publicación" (§63): LandingSite no lo admitió. Se avisa al
-- equipo; la salida es volver a intentarlo (mark_menu_published admite
-- este estado) o reasignar.
create or replace function public.report_menu_publication_error(p_menu_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  v_pub := public.lock_active_menu_publication(p_menu_id);
  perform public.assert_can_write_menu_publication(v_menu, v_pub);

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Di qué ha fallado: sin motivo nadie puede resolverlo';
  end if;

  if v_menu.state = 'publication_error' then
    return;
  end if;

  if v_menu.state not in ('assigned', 'reviewing', 'ready_to_publish') then
    raise exception 'No se puede registrar un error de publicación en el estado %', v_menu.state;
  end if;

  perform public.record_menu_event(p_menu_id, v_pub.id, v_menu.state, 'publication_error', btrim(p_reason));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_menu.space_id, auth.uid(), 'menu.publication_error', 'menu', p_menu_id,
          jsonb_build_object('state', v_menu.state), jsonb_build_object('state', 'publication_error'), btrim(p_reason));

  perform public.notify_menu_event(p_menu_id, 'menu_publication_error');
end;
$$;

revoke all on function public.report_menu_publication_error(uuid, text) from public, anon;
grant execute on function public.report_menu_publication_error(uuid, text) to authenticated;

-- ============================================================
-- 10 · Cancelar y devolver (RN-MEN-05, RN-CON-08/10/12)
-- ============================================================

-- La devolución de un consumo: al ciclo original si sigue abierto; si ya
-- cerró, crédito compensatorio en el ciclo vigente (RN-CON-10/11).
create or replace function public.credit_menu_update(p_pub public.menu_publications, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_end timestamptz;
  v_subscription_id uuid;
  v_target_cycle uuid;
  v_type text;
  v_id uuid;
begin
  select cycle_end, subscription_id into v_cycle_end, v_subscription_id
  from public.menu_update_cycles where id = p_pub.cycle_id for update;

  if now() < v_cycle_end then
    v_target_cycle := p_pub.cycle_id;
    v_type := 'return';
  else
    v_target_cycle := public.get_or_create_menu_update_cycle(v_subscription_id);
    v_type := 'compensatory_credit';
  end if;

  insert into public.menu_update_entries
    (space_id, establishment_id, cycle_id, amount, entry_type, menu_id, publication_id, related_entry_id, reason, created_by)
  values
    (p_pub.space_id, p_pub.establishment_id, v_target_cycle, 1, v_type, p_pub.menu_id, p_pub.id,
     p_pub.debit_entry_id, p_reason, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.credit_menu_update(public.menu_publications, text) from public, anon, authenticated;

create or replace function public.cancel_menu(p_menu_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
  v_credit_id uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para cancelar este menú';
  end if;

  if v_menu.state = 'cancelled' then
    return; -- CA-17
  end if;

  if v_menu.state = 'published' then
    raise exception 'Un menú publicado no se cancela ni devuelve la actualización (§60)';
  end if;

  select * into v_pub from public.menu_publications
  where menu_id = p_menu_id and published_at is null and cancelled_at is null
  for update;

  if v_pub.id is not null then
    if p_reason is null or length(btrim(p_reason)) = 0 then
      raise exception 'Cancelar una publicación pedida necesita un motivo (RN-CON-12)';
    end if;

    update public.menu_publications
    set cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = btrim(p_reason)
    where id = v_pub.id;

    -- RN-CON-08 aplicado a Menú Diario: antes de Publicado, se devuelve.
    v_credit_id := public.credit_menu_update(v_pub, btrim(p_reason));
  end if;

  update public.menus set cancelled_at = now() where id = p_menu_id;
  perform public.record_menu_event(p_menu_id, v_pub.id, v_menu.state, 'cancelled', nullif(btrim(p_reason), ''));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_menu.space_id, auth.uid(), 'menu.cancelled', 'menu', p_menu_id,
          jsonb_build_object('state', v_menu.state),
          jsonb_build_object('state', 'cancelled', 'publication_id', v_pub.id, 'credit_entry_id', v_credit_id),
          nullif(btrim(p_reason), ''));
end;
$$;

revoke all on function public.cancel_menu(uuid, text) from public, anon;
grant execute on function public.cancel_menu(uuid, text) to authenticated;

-- "Un error del equipo provoca devolución o corrección sin perjuicio para
-- el cliente" (§60): después de Publicado el consumo no se devuelve solo,
-- pero el equipo puede devolverlo con motivo. Una vez por publicación.
create or replace function public.refund_menu_update(p_publication_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pub public.menu_publications;
  v_existing uuid;
  v_id uuid;
begin
  select * into v_pub from public.menu_publications where id = p_publication_id for update;
  if v_pub.id is null then
    raise exception 'Publicación no encontrada';
  end if;

  if not public.has_capability(v_pub.space_id, 'manage_requests') then
    raise exception 'Solo el propietario o un administrador devuelven una actualización';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'La devolución necesita un motivo (RN-CON-12)';
  end if;

  select id into v_existing from public.menu_update_entries
  where publication_id = p_publication_id and entry_type in ('return', 'compensatory_credit');
  if v_existing is not null then
    return v_existing; -- CA-17
  end if;

  v_id := public.credit_menu_update(v_pub, btrim(p_reason));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_pub.space_id, auth.uid(), 'menu.update_refunded', 'menu', v_pub.menu_id,
          jsonb_build_object('publication_id', p_publication_id, 'credit_entry_id', v_id), btrim(p_reason));

  return v_id;
end;
$$;

revoke all on function public.refund_menu_update(uuid, text) from public, anon;
grant execute on function public.refund_menu_update(uuid, text) to authenticated;

-- ============================================================
-- 11 · Auditoría: quién lee los apuntes de menú
-- ============================================================
create or replace function public.audit_action_capability(p_action text)
returns text
language sql
immutable
as $$
  select case split_part(coalesce(p_action, ''), '.', 1)
    when 'space' then 'manage_space'
    when 'membership' then 'manage_space'
    when 'supervision' then 'manage_space'
    when 'plan' then 'manage_space'
    when 'service' then 'manage_space'
    when 'invitation' then 'invite_member'
    when 'charge' then 'manage_finance'
    when 'payment' then 'manage_finance'
    when 'subscription' then 'manage_finance'
    when 'financial' then 'manage_finance'
    when 'establishment' then 'manage_clients'
    when 'establishment_access' then 'manage_clients'
    when 'establishment_note' then 'manage_clients'
    when 'group' then 'manage_clients'
    when 'group_access' then 'manage_clients'
    when 'holiday' then 'manage_holidays'
    -- Menú Diario: las plantillas son cartera (quien contrata el servicio).
    -- Los menús NO están aquí a propósito: como solicitudes y trabajos, los
    -- decide la fila (audit_entity_is_visible), así que el trabajador ve
    -- los apuntes de los menús que puede ver y ninguno más.
    when 'menu_template' then 'manage_clients'
    else null
  end;
$$;

revoke all on function public.audit_action_capability(text) from public, anon;
grant execute on function public.audit_action_capability(text) to authenticated;

create or replace function public.audit_entity_is_visible(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_entity_id is null then false
    when p_entity_type = 'request' then exists (select 1 from public.requests r where r.id = p_entity_id)
    when p_entity_type = 'job' then exists (select 1 from public.jobs j where j.id = p_entity_id)
    when p_entity_type = 'task' then exists (select 1 from public.tasks t where t.id = p_entity_id)
    when p_entity_type = 'file' then exists (select 1 from public.files f where f.id = p_entity_id)
    when p_entity_type = 'absence' then exists (select 1 from public.absences a where a.id = p_entity_id)
    when p_entity_type = 'correction' then exists (select 1 from public.corrections c where c.id = p_entity_id)
    when p_entity_type = 'menu' then exists (select 1 from public.menus m where m.id = p_entity_id)
    else false
  end;
$$;

revoke all on function public.audit_entity_is_visible(text, uuid) from public, anon;
grant execute on function public.audit_entity_is_visible(text, uuid) to authenticated;
