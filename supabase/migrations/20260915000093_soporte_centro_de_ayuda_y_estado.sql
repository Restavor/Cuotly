-- Fase 4 · Hito 21 · soporte de Cuotly, centro de ayuda y página de
-- estado (PRD §34, RN-SOP-01 a 15; §131, §132, §133 y §157 de la
-- maestra).
--
-- **Lo que este archivo es.** El canal entre un espacio y Cuotly cuando
-- algo no va: las incidencias de §131, el reloj humano de §132 con el que
-- Cuotly las atiende, las guías de §133 que evitan muchas de ellas y la
-- página de estado de §133/§157 que dice si el problema es de Cuotly.
--
-- **Lo que NO es.** No es el soporte AL restaurante de §130 —eso es la
-- conversación de una solicitud, Hito 7— ni Modo soporte de §129, que es
-- Cuotly entrando en un espacio (migración 91).
--
-- **Tres decisiones que conviene leer antes que el resto:**
--
--   1. **No hay tiempo de respuesta**, ni guardado ni enseñado: §131 dice
--      que "no existe inicialmente un tiempo contractual de respuesta
--      público". Lo que sí se mide es el tiempo de atención dentro de las
--      franjas de §132, para que Cuotly sepa cuánto tarda; no es una
--      promesa a nadie.
--   2. **El espacio ve "Cuotly", no quién contestó** (RN-SOP-07): el autor
--      de los mensajes y el actor de los cambios van tapados con
--      privilegio de columna, y un `*_side` visible dice de qué lado vino.
--      La misma lectura que RN-PLA-07 con las solicitudes de espacio.
--   3. **La página de estado no inventa un "todo operativo"** (RN-SOP-12):
--      cada componente dice si su estado se mide o solo se declara, y los
--      dos que no se pueden medir desde la base —autenticación y
--      archivos— lo dicen con todas las letras.
--
-- Se comprueba con `supabase/tests/soporte_centro_de_ayuda_y_estado.sql`.

-- ============================================================
-- 1 · La capacidad `contact_cuotly` (RN-SOP-01)
-- ============================================================
--
-- La misma `has_capability_as()` de la 91 con una rama más. Propietario y
-- administrador; NUNCA Modo soporte, ni en nivel `owner`.
create or replace function public.has_capability_as(
  p_space_id uuid,
  p_user_id uuid,
  p_capability text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.space_role;
  v_can_perform_jobs boolean;
  v_can_approve_reports boolean;
  v_support text;
begin
  select sm.role, sm.can_perform_jobs, sm.can_approve_reports
  into v_role, v_can_perform_jobs, v_can_approve_reports
  from public.space_memberships sm
  where sm.space_id = p_space_id
    and sm.user_id = p_user_id
    and sm.status = 'active';

  if v_role is null and p_user_id = auth.uid() then
    v_support := public.support_access_level(p_space_id);
    -- RN-ADM-07 · `read` no tiene NINGUNA capacidad; `admin` opera como un
    -- administrador sin permisos concedidos; `owner`, como el propietario.
    if v_support in ('admin', 'owner') then
      v_role := v_support::public.space_role;
      v_can_perform_jobs := false;
      v_can_approve_reports := false;
    end if;
  end if;

  if v_role is null then
    return false;
  end if;

  return case p_capability
    when 'manage_space' then v_role = 'owner'
    -- RN-ADM-07 · lo único que Modo soporte no puede hacer ni como
    -- propietario: dejar a alguien dentro cuando la sesión acabe.
    when 'invite_member' then v_role = 'owner' and v_support is null
    when 'create_establishment' then v_role in ('owner', 'admin')
    when 'manage_clients' then v_role in ('owner', 'admin')
    when 'view_team' then true
    when 'manage_holidays' then v_role in ('owner', 'admin')
    when 'manage_requests' then v_role in ('owner', 'admin')
    when 'assign_jobs' then v_role in ('owner', 'admin')
    when 'perform_jobs' then
      v_role = 'worker'
      or v_role = 'owner'
      or (v_role = 'admin' and coalesce(v_can_perform_jobs, false))
    when 'manage_finance' then v_role in ('owner', 'admin')
    -- RN-SOP-01 · abrir una incidencia a Cuotly: propietario y
    -- administrador, y NUNCA una sesión de Modo soporte, ni en nivel
    -- `owner`: hablar con Cuotly en nombre de un espacio ajeno es lo que
    -- RN-ADM-07 prohíbe con invitar, un piso más arriba.
    when 'contact_cuotly' then v_role in ('owner', 'admin') and v_support is null
    when 'manage_files' then v_role in ('owner', 'admin', 'worker')
    when 'manage_absences' then v_role in ('owner', 'admin')
    when 'approve_reports' then
      v_role = 'owner'
      or (v_role = 'admin' and coalesce(v_can_approve_reports, false))
    else false
  end;
end;
$$;

-- ============================================================
-- 2 · Los catálogos: transiciones, motivo y prioridad (RN-SOP-04, RN-SOP-05)
-- ============================================================
--
-- Duplicados a propósito con `src/core/support.ts`, como los estados de
-- la solicitud de espacio; `listas-compartidas.test.ts` vigila que no se
-- separen.
--
-- Quién mueve qué (RN-SOP-04): Cuotly lleva una incidencia por los
-- estados de trabajo; "necesita información" devuelve la pelota al
-- espacio, que al contestar la deja en revisión; de "resuelta" el espacio
-- cierra (conforme) o reabre; "cerrada" es final y NADIE cierra sola.
create or replace function public.incident_transition_allowed(p_from text, p_to text, p_actor text)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = p_to then false
    when p_actor = 'platform' then
      (p_from in ('open', 'in_review', 'in_progress')
        and p_to in ('in_review', 'needs_information', 'in_progress', 'resolved', 'closed'))
      or (p_from = 'needs_information' and p_to in ('in_review', 'closed'))
      or (p_from = 'resolved' and p_to in ('in_progress', 'closed'))
    when p_actor = 'space' then
      (p_from = 'needs_information' and p_to = 'in_review')
      or (p_from = 'resolved' and p_to in ('in_review', 'closed'))
    else false
  end;
$$;

comment on function public.incident_transition_allowed(text, text, text) is
  'RN-SOP-04 · la tabla de transiciones de una incidencia, por lado.
   Duplicada a propósito con `incidentTransitionAllowed()` de
   `src/core/support.ts`; lo vigila `listas-compartidas.test.ts`.';

-- RN-SOP-04 · las dos que no se pueden dejar sin explicar: pedir
-- información sin decir cuál, y cerrar sin haber resuelto.
create or replace function public.incident_needs_reason(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select p_to = 'needs_information' or (p_to = 'closed' and p_from <> 'resolved');
$$;

-- RN-SOP-05 · crítica por encima del plan; Agency por encima de Pro; un
-- espacio sin plan de Cuotly, estándar. Una sugerencia no tiene prioridad.
create or replace function public.incident_priority_for(p_kind text, p_impact text, p_plan text)
returns text
language sql
immutable
as $$
  select case
    when p_kind <> 'error' then null
    when p_impact = 'critical' then 'critical'
    when p_plan = 'agency' then 'high'
    else 'standard'
  end;
$$;

revoke all on function public.incident_transition_allowed(text, text, text) from public, anon;
revoke all on function public.incident_needs_reason(text, text) from public, anon;
revoke all on function public.incident_priority_for(text, text, text) from public, anon;
grant execute on function public.incident_transition_allowed(text, text, text) to authenticated;
grant execute on function public.incident_needs_reason(text, text) to authenticated;
grant execute on function public.incident_priority_for(text, text, text) to authenticated;

-- ============================================================
-- 3 · Los festivos de Cuotly y el reloj humano (RN-SOP-06)
-- ============================================================
--
-- §132 es el horario de Bosco, no el de cada espacio: sus festivos son
-- los de Cuotly y viven aquí, en una lista de plataforma que **nace
-- vacía**. Hasta que se rellene no hay festivos, y la pantalla lo dice.
-- Sin `space_id`: no pertenece a ningún espacio (exenta en el barrido de
-- invariantes, como `platform_roles`).
create table public.platform_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null check (length(btrim(name)) > 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  -- No se borra (CLAUDE.md): un festivo puesto por error se retira con
  -- motivo y deja de contar desde ese momento.
  removed_at timestamptz,
  removed_by uuid references public.profiles (id),
  removal_reason text,
  constraint platform_holidays_removal check ((removed_at is null) = (removed_by is null))
);

comment on table public.platform_holidays is
  'RN-SOP-06, §132 · los festivos del horario humano de Cuotly. Nace vacía:
   ningún calendario se supone. Un festivo no se borra, se retira con
   motivo.';

create unique index platform_holidays_active_date_idx
  on public.platform_holidays (holiday_date) where removed_at is null;

alter table public.platform_holidays enable row level security;

-- Los festivos de Cuotly no son un secreto: los lee cualquiera con sesión,
-- porque `support_minutes_between()` los necesita con la identidad de
-- quien pregunta. Quién los puso y quién los retiró no se enseña por aquí.
create policy platform_holidays_select on public.platform_holidays
for select using (auth.uid() is not null);

revoke select on public.platform_holidays from anon, authenticated;
grant select (id, holiday_date, name, created_at, removed_at, removal_reason)
  on public.platform_holidays to authenticated;

create or replace function public.add_platform_holiday(p_date date, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, fija sus festivos (§132, RN-SOP-06)';
  end if;
  if p_date is null or coalesce(btrim(p_name), '') = '' then
    raise exception 'Un festivo lleva fecha y nombre';
  end if;

  select id into v_id from public.platform_holidays where holiday_date = p_date and removed_at is null;
  if v_id is not null then
    return v_id; -- CA-17.
  end if;

  insert into public.platform_holidays (holiday_date, name, created_by)
  values (p_date, btrim(p_name), auth.uid())
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (null, auth.uid(), 'platform_holiday.added', 'platform_holiday', v_id,
          jsonb_build_object('holiday_date', p_date, 'name', btrim(p_name)));
  return v_id;
end;
$$;

create or replace function public.retire_platform_holiday(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_holidays;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, retira un festivo (§132, RN-SOP-06)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Retirar un festivo exige motivo';
  end if;

  select * into v_row from public.platform_holidays where id = p_id for update;
  if v_row.id is null then
    raise exception 'Festivo no encontrado';
  end if;
  if v_row.removed_at is not null then
    return; -- CA-17.
  end if;

  update public.platform_holidays
  set removed_at = now(), removed_by = auth.uid(), removal_reason = btrim(p_reason)
  where id = p_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (null, auth.uid(), 'platform_holiday.retired', 'platform_holiday', p_id,
          jsonb_build_object('holiday_date', v_row.holiday_date, 'name', v_row.name),
          jsonb_build_object('removed', true), btrim(p_reason));
end;
$$;

revoke all on function public.add_platform_holiday(date, text) from public, anon;
revoke all on function public.retire_platform_holiday(uuid, text) from public, anon;
grant execute on function public.add_platform_holiday(date, text) to authenticated;
grant execute on function public.retire_platform_holiday(uuid, text) to authenticated;

-- §132 en SQL, la misma cuenta que `supportCalendar()` de
-- `src/core/business-clock.ts`: Europa/Madrid; lunes a viernes de 14:00
-- a 22:00; sábados, domingos y festivos de 09:00 a 14:30 y de 16:30 a
-- 21:30. Los límites de cada franja se convierten día a día con la zona
-- horaria, así que el cambio de hora de marzo y octubre sale bien solo.
-- `SECURITY INVOKER` a propósito: solo lee los festivos, que cualquiera
-- con sesión puede leer, y no autoriza nada.
create or replace function public.support_minutes_between(p_from timestamptz, p_to timestamptz)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz constant text := 'Europe/Madrid';
  v_day date;
  v_last date;
  v_weekend boolean;
  v_total numeric := 0;
  v_win record;
  v_ws timestamptz;
  v_we timestamptz;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    return 0;
  end if;

  v_day := (p_from at time zone v_tz)::date;
  v_last := (p_to at time zone v_tz)::date;

  while v_day <= v_last loop
    v_weekend := extract(isodow from v_day) >= 6
      or exists (select 1 from public.platform_holidays h
                 where h.holiday_date = v_day and h.removed_at is null);

    for v_win in
      select w.s, w.e
      from (values
        ('09:00'::time, '14:30'::time, true),
        ('16:30'::time, '21:30'::time, true),
        ('14:00'::time, '22:00'::time, false)
      ) as w(s, e, weekend)
      where w.weekend = v_weekend
    loop
      v_ws := (v_day + v_win.s) at time zone v_tz;
      v_we := (v_day + v_win.e) at time zone v_tz;
      v_total := v_total + greatest(0,
        extract(epoch from (least(v_we, p_to) - greatest(v_ws, p_from))) / 60);
    end loop;

    v_day := v_day + 1;
  end loop;

  return floor(v_total)::integer;
end;
$$;

comment on function public.support_minutes_between(timestamptz, timestamptz) is
  'RN-SOP-06, §132 · minutos de atención humana entre dos instantes: solo
   los que caen dentro de las franjas del horario de soporte de Cuotly. No
   toca el reloj contractual (RN-CLK-08).';

-- Si ahora mismo hay alguien de soporte en horario. Para la pantalla.
create or replace function public.support_is_open_at(p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = public
as $$
  select public.support_minutes_between(p_at, p_at + interval '1 minute') > 0;
$$;

revoke all on function public.support_minutes_between(timestamptz, timestamptz) from public, anon;
revoke all on function public.support_is_open_at(timestamptz) from public, anon;
grant execute on function public.support_minutes_between(timestamptz, timestamptz) to authenticated;
grant execute on function public.support_is_open_at(timestamptz) to authenticated;

-- ============================================================
-- 4 · Las incidencias (RN-SOP-01 a 05, RN-SOP-14)
-- ============================================================
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  opened_by uuid not null references public.profiles (id),
  -- RN-SOP-02 · errores y sugerencias, separados.
  kind text not null check (kind in ('error', 'suggestion')),
  -- RN-SOP-03 · los ocho temas de §133 más "otra".
  category text not null check (category in (
    'first_steps', 'requests', 'jobs', 'menus', 'payments', 'users', 'integrations', 'security', 'other'
  )),
  description text not null check (length(btrim(description)) > 0),
  -- RN-SOP-03 · cuatro niveles; solo para los errores.
  impact text check (impact is null or impact in ('low', 'medium', 'high', 'critical')),
  device text,
  app_version text,
  -- Lo que "Cuotly puede recoger informando al usuario" (§131): navegador,
  -- sistema, pantalla y error no sensible. `open_incident()` solo deja
  -- pasar esas cuatro claves.
  client_context jsonb not null default '{}'::jsonb,
  -- RN-SOP-11 · la búsqueda que no encontró respuesta, si la incidencia
  -- nació de una.
  help_query text,
  status text not null default 'open' check (status in (
    'open', 'in_review', 'needs_information', 'in_progress', 'resolved', 'closed'
  )),
  status_reason text,
  opened_at timestamptz not null default now(),
  first_platform_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  idempotency_key text,
  constraint incidents_impact_shape check ((kind = 'error') = (impact is not null))
);

comment on table public.incidents is
  'RN-SOP-01 a 05, §131 · una incidencia de un espacio a Cuotly, o una
   sugerencia. La prioridad NO se guarda: la deriva `incident_priority()`
   del impacto y del plan (RN-DAT-05). No se borra: se cierra.';

create unique index incidents_idempotency_idx
  on public.incidents (space_id, idempotency_key) where idempotency_key is not null;
create index incidents_space_idx on public.incidents (space_id, last_activity_at desc);
create index incidents_open_idx on public.incidents (status, opened_at) where status <> 'closed';

alter table public.incidents enable row level security;

-- El espacio —propietario y administradores— ve todas las suyas; Cuotly,
-- todas. Sin INSERT ni UPDATE: todo pasa por función.
create policy incidents_select on public.incidents
for select using (
  public.has_capability(space_id, 'contact_cuotly') or public.is_platform_member()
);

-- El libro de estados (RN-SOP-14). Inmutable.
create table public.incident_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  incident_id uuid not null references public.incidents (id) on delete cascade,
  from_status text,
  to_status text not null,
  -- RN-SOP-07 · quién lo movió no lo ve el espacio (privilegio de
  -- columna); de qué lado vino, sí.
  actor_id uuid not null references public.profiles (id),
  actor_side text not null check (actor_side in ('space', 'platform')),
  reason text,
  occurred_at timestamptz not null default now()
);

create index incident_events_incident_idx on public.incident_events (incident_id, occurred_at);

alter table public.incident_events enable row level security;

create policy incident_events_select on public.incident_events
for select using (
  public.has_capability(space_id, 'contact_cuotly') or public.is_platform_member()
);

revoke select on public.incident_events from anon, authenticated;
grant select (id, space_id, incident_id, from_status, to_status, actor_side, reason, occurred_at)
  on public.incident_events to authenticated;

-- El hilo (RN-SOP-08). Mensajes inmutables: sin UPDATE ni DELETE.
create table public.incident_messages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  incident_id uuid not null references public.incidents (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  author_side text not null check (author_side in ('space', 'platform')),
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index incident_messages_incident_idx on public.incident_messages (incident_id, created_at);

alter table public.incident_messages enable row level security;

create policy incident_messages_select on public.incident_messages
for select using (
  public.has_capability(space_id, 'contact_cuotly') or public.is_platform_member()
);

revoke select on public.incident_messages from anon, authenticated;
grant select (id, space_id, incident_id, author_side, body, created_at)
  on public.incident_messages to authenticated;

-- Los adjuntos (RN-SOP-08). Los bytes van al bucket privado `files`; aquí
-- solo la ruta. No a la tabla `files`: exige establecimiento.
create table public.incident_attachments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  incident_id uuid not null references public.incidents (id) on delete cascade,
  message_id uuid references public.incident_messages (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  uploader_side text not null check (uploader_side in ('space', 'platform')),
  name text not null check (length(btrim(name)) > 0),
  -- RN-ARC-06, la misma lista blanca que `file_versions.mime_type`.
  content_type text not null check (content_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  )),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index incident_attachments_incident_idx on public.incident_attachments (incident_id, created_at);

alter table public.incident_attachments enable row level security;

create policy incident_attachments_select on public.incident_attachments
for select using (
  public.has_capability(space_id, 'contact_cuotly') or public.is_platform_member()
);

revoke select on public.incident_attachments from anon, authenticated;
grant select (id, space_id, incident_id, message_id, uploader_side, name, content_type, size_bytes, storage_path, created_at)
  on public.incident_attachments to authenticated;

-- ============================================================
-- 5 · Los avisos (RN-SOP-15): a la plataforma y al espacio
-- ============================================================
--
-- A Bosco y a los Administradores de Cuotly. No son miembros del espacio,
-- pero `notifications` se lee por destinatario, así que el aviso les llega
-- igual; el enlace abre la incidencia en el panel.
create or replace function public.notify_platform_incident(
  p_incident_id uuid,
  p_event_type text,
  p_dedupe_key text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
  v_recipient uuid;
  v_sent integer := 0;
begin
  select space_id into v_space from public.incidents where id = p_incident_id;

  for v_recipient in
    select p.id from public.profiles p where lower(p.email) = lower('info@restavor.com')
    union
    select pr.user_id from public.platform_roles pr
  loop
    if public.emit_notification(
         v_space, v_recipient, p_event_type, 'staff',
         'incident', p_incident_id, '/administracion/incidencias/' || p_incident_id::text,
         p_dedupe_key || ':' || v_recipient::text) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

-- A quien abrió la incidencia. El enlace abre la incidencia en Ayuda.
create or replace function public.notify_incident_opener(
  p_incident_id uuid,
  p_event_type text,
  p_dedupe_key text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inc public.incidents;
begin
  select * into v_inc from public.incidents where id = p_incident_id;
  if public.emit_notification(
       v_inc.space_id, v_inc.opened_by, p_event_type, 'staff',
       'incident', p_incident_id,
       '/espacios/' || public.space_slug(v_inc.space_id) || '/ayuda/incidencias/' || p_incident_id::text,
       p_dedupe_key) is not null then
    return 1;
  end if;
  return 0;
end;
$$;

revoke all on function public.notify_platform_incident(uuid, text, text) from public, anon, authenticated;
revoke all on function public.notify_incident_opener(uuid, text, text) from public, anon, authenticated;

-- ============================================================
-- 6 · Abrir, contestar, mover y adjuntar (RN-SOP-01 a 04, 08, 14)
-- ============================================================
create or replace function public.open_incident(
  p_space_id uuid,
  p_kind text,
  p_category text,
  p_description text,
  p_impact text default null,
  p_device text default null,
  p_app_version text default null,
  p_client_context jsonb default '{}'::jsonb,
  p_help_query text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_id uuid;
  v_context jsonb;
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión para abrir una incidencia';
  end if;

  -- La clave, antes del permiso (RN-SOP-14): el segundo clic recibe la
  -- misma respuesta que el primero. Acotada a quien la abrió.
  if p_idempotency_key is not null then
    select id into v_existing from public.incidents
    where space_id = p_space_id and idempotency_key = p_idempotency_key and opened_by = v_actor;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if not public.has_capability(p_space_id, 'contact_cuotly') then
    raise exception 'Solo el propietario o un administrador del espacio abren una incidencia a Cuotly (§131, RN-SOP-01)';
  end if;
  if p_kind not in ('error', 'suggestion') then
    raise exception 'Una incidencia es un error o una sugerencia (§133), no %', p_kind;
  end if;
  if p_kind = 'error' and (p_impact is null or p_impact not in ('low', 'medium', 'high', 'critical')) then
    raise exception 'Un error lleva impacto: bajo, medio, alto o crítico (§131, RN-SOP-03)';
  end if;
  if p_kind = 'suggestion' and p_impact is not null then
    raise exception 'Una sugerencia no lleva impacto (RN-SOP-02)';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'Hace falta una descripción';
  end if;

  -- Solo las cuatro claves que §131 nombra; lo demás, aunque llegue, no
  -- entra. "Informando al usuario" lo hace la pantalla antes de enviar.
  v_context := jsonb_strip_nulls(jsonb_build_object(
    'browser', p_client_context ->> 'browser',
    'os', p_client_context ->> 'os',
    'screen', p_client_context ->> 'screen',
    'error', p_client_context ->> 'error'));

  insert into public.incidents
    (space_id, opened_by, kind, category, description, impact, device, app_version,
     client_context, help_query, idempotency_key)
  values
    (p_space_id, v_actor, p_kind, p_category, btrim(p_description), p_impact,
     nullif(btrim(p_device), ''), nullif(btrim(p_app_version), ''),
     v_context, nullif(btrim(p_help_query), ''), p_idempotency_key)
  returning id into v_id;

  insert into public.incident_events (space_id, incident_id, from_status, to_status, actor_id, actor_side)
  values (p_space_id, v_id, null, 'open', v_actor, 'space');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (p_space_id, v_actor, 'incident.opened', 'incident', v_id,
          jsonb_build_object('kind', p_kind, 'category', p_category, 'impact', p_impact,
                             'from_help_query', p_help_query is not null));

  perform public.notify_platform_incident(v_id, 'incident_opened', 'incident_opened:' || v_id::text);

  return v_id;
end;
$$;

comment on function public.open_incident(uuid, text, text, text, text, text, text, jsonb, text, text) is
  'RN-SOP-01/02/03, §131 · abre una incidencia o una sugerencia a Cuotly.
   Propietario y administradores; nunca Modo soporte. Con clave de
   idempotencia (RN-SOP-14). Solo guarda las cuatro claves de contexto
   técnico que §131 nombra.';

revoke all on function public.open_incident(uuid, text, text, text, text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.open_incident(uuid, text, text, text, text, text, text, jsonb, text, text) to authenticated;

-- De qué lado habla quien llama sobre esta incidencia, o excepción.
create or replace function public.incident_side_of_caller(p_incident_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space uuid;
begin
  select space_id into v_space from public.incidents where id = p_incident_id;
  if v_space is null then
    raise exception 'Incidencia no encontrada';
  end if;
  if public.is_platform_member() then
    return 'platform';
  end if;
  if public.has_capability(v_space, 'contact_cuotly') then
    return 'space';
  end if;
  raise exception 'No puedes escribir en esta incidencia (§131, RN-SOP-01)';
end;
$$;

revoke all on function public.incident_side_of_caller(uuid) from public, anon, authenticated;

create or replace function public.set_incident_status(
  p_incident_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_side text := public.incident_side_of_caller(p_incident_id);
  v_inc public.incidents;
  v_now timestamptz := now();
begin
  select * into v_inc from public.incidents where id = p_incident_id for update;

  if v_inc.status = p_status then
    return; -- CA-17.
  end if;
  if not public.incident_transition_allowed(v_inc.status, p_status, v_side) then
    raise exception 'Una incidencia en % no pasa a % desde el lado de %', v_inc.status, p_status, v_side;
  end if;
  if public.incident_needs_reason(v_inc.status, p_status) and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Pasar a % exige motivo (RN-SOP-04)', p_status;
  end if;

  update public.incidents
  set status = p_status,
      status_reason = nullif(btrim(p_reason), ''),
      first_platform_response_at = case
        when v_side = 'platform' then coalesce(first_platform_response_at, v_now)
        else first_platform_response_at end,
      resolved_at = case when p_status = 'resolved' then v_now
                         when p_status in ('in_review', 'in_progress') then null
                         else resolved_at end,
      closed_at = case when p_status = 'closed' then v_now else closed_at end,
      last_activity_at = v_now
  where id = p_incident_id;

  insert into public.incident_events (space_id, incident_id, from_status, to_status, actor_id, actor_side, reason)
  values (v_inc.space_id, p_incident_id, v_inc.status, p_status, auth.uid(), v_side, nullif(btrim(p_reason), ''));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_inc.space_id, auth.uid(), 'incident.status_changed', 'incident', p_incident_id,
          jsonb_build_object('status', v_inc.status),
          jsonb_build_object('status', p_status, 'side', v_side),
          nullif(btrim(p_reason), ''));

  -- RN-SOP-15 · al otro lado. La clave lleva el instante: cada cambio es
  -- un aviso, y el mismo cambio dos veces es uno.
  if v_side = 'platform' then
    perform public.notify_incident_opener(p_incident_id, 'incident_updated',
      'incident_updated:' || p_incident_id::text || ':' || to_char(v_now, 'YYYYMMDDHH24MISS'));
  else
    perform public.notify_platform_incident(p_incident_id, 'incident_updated',
      'incident_updated:' || p_incident_id::text || ':' || to_char(v_now, 'YYYYMMDDHH24MISS'));
  end if;
end;
$$;

comment on function public.set_incident_status(uuid, text, text) is
  'RN-SOP-04 · mueve una incidencia por la tabla de transiciones, según el
   lado de quien llama. Motivo obligatorio en "necesita información" y al
   cerrar sin resolver. Deja evento, auditoría y aviso.';

revoke all on function public.set_incident_status(uuid, text, text) from public, anon;
grant execute on function public.set_incident_status(uuid, text, text) to authenticated;

create or replace function public.post_incident_message(p_incident_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_side text := public.incident_side_of_caller(p_incident_id);
  v_inc public.incidents;
  v_now timestamptz := now();
  v_id uuid;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'Un mensaje no puede estar vacío';
  end if;

  select * into v_inc from public.incidents where id = p_incident_id for update;
  if v_inc.status = 'closed' then
    raise exception 'Esta incidencia está cerrada: si hace falta algo más, abre otra (RN-SOP-04)';
  end if;

  insert into public.incident_messages (space_id, incident_id, author_id, author_side, body)
  values (v_inc.space_id, p_incident_id, auth.uid(), v_side, btrim(p_body))
  returning id into v_id;

  update public.incidents
  set last_activity_at = v_now,
      first_platform_response_at = case
        when v_side = 'platform' then coalesce(first_platform_response_at, v_now)
        else first_platform_response_at end
  where id = p_incident_id;

  -- RN-SOP-04 · el espacio contesta a "necesita información": vuelve a
  -- revisión sin que tenga que pulsar nada más.
  if v_side = 'space' and v_inc.status = 'needs_information' then
    update public.incidents set status = 'in_review', status_reason = null where id = p_incident_id;
    insert into public.incident_events (space_id, incident_id, from_status, to_status, actor_id, actor_side)
    values (v_inc.space_id, p_incident_id, 'needs_information', 'in_review', auth.uid(), 'space');
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_inc.space_id, auth.uid(), 'incident.replied', 'incident', p_incident_id,
          jsonb_build_object('message_id', v_id, 'side', v_side));

  if v_side = 'platform' then
    perform public.notify_incident_opener(p_incident_id, 'incident_replied', 'incident_replied:' || v_id::text);
  else
    perform public.notify_platform_incident(p_incident_id, 'incident_replied', 'incident_replied:' || v_id::text);
  end if;

  return v_id;
end;
$$;

comment on function public.post_incident_message(uuid, text) is
  'RN-SOP-08 · un mensaje en el hilo, inmutable. Si el espacio contesta a
   "necesita información", la incidencia vuelve a revisión (RN-SOP-04).';

revoke all on function public.post_incident_message(uuid, text) from public, anon;
grant execute on function public.post_incident_message(uuid, text) to authenticated;

-- La fila del adjunto se acepta ANTES de subir los bytes, como el
-- logotipo: si el servidor dice que no, no hay nada que subir.
create or replace function public.register_incident_attachment(
  p_incident_id uuid,
  p_name text,
  p_content_type text,
  p_size_bytes bigint,
  p_storage_path text,
  p_message_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_side text := public.incident_side_of_caller(p_incident_id);
  v_inc public.incidents;
  v_id uuid;
begin
  select * into v_inc from public.incidents where id = p_incident_id for update;
  if v_inc.status = 'closed' then
    raise exception 'Esta incidencia está cerrada';
  end if;
  if p_message_id is not null and not exists (
       select 1 from public.incident_messages m where m.id = p_message_id and m.incident_id = p_incident_id) then
    raise exception 'El mensaje no es de esta incidencia';
  end if;
  if p_storage_path is null or p_storage_path !~ ('^incidents/' || v_inc.space_id::text || '/' || p_incident_id::text || '/') then
    raise exception 'La ruta del adjunto no es de esta incidencia';
  end if;

  insert into public.incident_attachments
    (space_id, incident_id, message_id, uploaded_by, uploader_side, name, content_type, size_bytes, storage_path)
  values
    (v_inc.space_id, p_incident_id, p_message_id, auth.uid(), v_side, btrim(p_name), p_content_type, p_size_bytes, p_storage_path)
  returning id into v_id;

  update public.incidents set last_activity_at = now() where id = p_incident_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_inc.space_id, auth.uid(), 'incident.attachment_added', 'incident', p_incident_id,
          jsonb_build_object('attachment_id', v_id, 'name', btrim(p_name), 'size_bytes', p_size_bytes, 'side', v_side));

  return v_id;
end;
$$;

revoke all on function public.register_incident_attachment(uuid, text, text, bigint, text, uuid) from public, anon;
grant execute on function public.register_incident_attachment(uuid, text, text, bigint, text, uuid) to authenticated;

-- ============================================================
-- 7 · Lo derivado (RN-DAT-05): prioridad y tiempo de atención
-- ============================================================
--
-- `SECURITY DEFINER` porque leen `spaces.cuotly_plan`, que la plataforma
-- no ve por RLS (no es miembro). Comprueban por su cuenta que quien
-- pregunta puede ver la incidencia.
create or replace function public.incident_priority(p_incident_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inc public.incidents;
  v_plan text;
begin
  select * into v_inc from public.incidents where id = p_incident_id;
  if v_inc.id is null then
    return null;
  end if;
  if not (public.has_capability(v_inc.space_id, 'contact_cuotly') or public.is_platform_member()) then
    raise exception 'No puedes ver esta incidencia (§131, RN-SOP-01)';
  end if;
  select cuotly_plan into v_plan from public.spaces where id = v_inc.space_id;
  return public.incident_priority_for(v_inc.kind, v_inc.impact, v_plan);
end;
$$;

create or replace function public.incident_attention(p_incident_id uuid)
returns table (first_response_minutes integer, resolution_minutes integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inc public.incidents;
begin
  select * into v_inc from public.incidents where id = p_incident_id;
  if v_inc.id is null then
    return;
  end if;
  if not (public.has_capability(v_inc.space_id, 'contact_cuotly') or public.is_platform_member()) then
    raise exception 'No puedes ver esta incidencia (§131, RN-SOP-01)';
  end if;
  -- Una sugerencia no tiene tiempo de atención (RN-SOP-02).
  if v_inc.kind <> 'error' then
    return query select null::integer, null::integer;
    return;
  end if;
  return query select
    public.support_minutes_between(v_inc.opened_at, coalesce(v_inc.first_platform_response_at, now())),
    public.support_minutes_between(v_inc.opened_at, coalesce(v_inc.resolved_at, v_inc.closed_at, now()));
end;
$$;

revoke all on function public.incident_priority(uuid) from public, anon;
revoke all on function public.incident_attention(uuid) from public, anon;
grant execute on function public.incident_priority(uuid) to authenticated;
grant execute on function public.incident_attention(uuid) to authenticated;

-- ============================================================
-- 8 · La bandeja de Cuotly (RN-SOP-07, RN-SOP-15)
-- ============================================================
create or replace function public.platform_list_incidents(
  p_open_only boolean default true,
  p_incident_id uuid default null
)
returns table (
  id uuid, space_id uuid, space_name text, space_slug text, space_plan text,
  kind text, category text, impact text, status text, status_reason text, priority text,
  description text, device text, app_version text, client_context jsonb, help_query text,
  opened_by uuid, opened_by_email text, opened_by_name text,
  opened_at timestamptz, first_platform_response_at timestamptz, resolved_at timestamptz, closed_at timestamptz,
  last_activity_at timestamptz, first_response_minutes integer, resolution_minutes integer,
  message_count integer, attachment_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee las incidencias (§131, RN-SOP-07)';
  end if;

  return query
    select i.id, i.space_id, s.name, s.slug, s.cuotly_plan,
      i.kind, i.category, i.impact, i.status, i.status_reason,
      public.incident_priority_for(i.kind, i.impact, s.cuotly_plan),
      i.description, i.device, i.app_version, i.client_context, i.help_query,
      i.opened_by, p.email, p.full_name,
      i.opened_at, i.first_platform_response_at, i.resolved_at, i.closed_at,
      i.last_activity_at,
      case when i.kind = 'error' then public.support_minutes_between(i.opened_at, coalesce(i.first_platform_response_at, now())) end,
      case when i.kind = 'error' then public.support_minutes_between(i.opened_at, coalesce(i.resolved_at, i.closed_at, now())) end,
      (select count(*)::integer from public.incident_messages m where m.incident_id = i.id),
      (select count(*)::integer from public.incident_attachments a where a.incident_id = i.id)
    from public.incidents i
    join public.spaces s on s.id = i.space_id
    join public.profiles p on p.id = i.opened_by
    where (p_incident_id is null or i.id = p_incident_id)
      and (not p_open_only or i.status <> 'closed')
    order by
      case public.incident_priority_for(i.kind, i.impact, s.cuotly_plan)
        when 'critical' then 0 when 'high' then 1 when 'standard' then 2 else 3 end,
      i.opened_at;
end;
$$;

-- El hilo con la identidad de quien escribió por el espacio: Cuotly sí la
-- ve (RN-SOP-07). Los mensajes de la propia plataforma llevan quién de
-- Cuotly contestó, para que Bosco sepa qué hizo cada Administrador.
create or replace function public.platform_incident_messages(p_incident_id uuid)
returns table (
  id uuid, author_side text, author_id uuid, author_email text, author_name text,
  body text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee las incidencias (§131, RN-SOP-07)';
  end if;
  return query
    select m.id, m.author_side, m.author_id, p.email, p.full_name, m.body, m.created_at
    from public.incident_messages m
    join public.profiles p on p.id = m.author_id
    where m.incident_id = p_incident_id
    order by m.created_at;
end;
$$;

revoke all on function public.platform_list_incidents(boolean, uuid) from public, anon;
revoke all on function public.platform_incident_messages(uuid) from public, anon;
grant execute on function public.platform_list_incidents(boolean, uuid) to authenticated;
grant execute on function public.platform_incident_messages(uuid) to authenticated;

-- ============================================================
-- 9 · El centro de ayuda (RN-SOP-10, RN-SOP-11)
-- ============================================================
--
-- Contenido de Cuotly, en español, versionado por migración y sin editor
-- (RN-SOP-10). Sin `space_id`: no es de ningún espacio.
create table public.help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  -- §133 · los ocho temas, los mismos que las categorías de una incidencia.
  topic text not null check (topic in (
    'first_steps', 'requests', 'jobs', 'menus', 'payments', 'users', 'integrations', 'security'
  )),
  -- §133 · "guías por rol". Un artículo puede ser de varios.
  audience text[] not null check (
    cardinality(audience) > 0
    and audience <@ array['owner', 'admin', 'worker', 'client']::text[]
  ),
  title text not null check (length(btrim(title)) > 0),
  body text not null check (length(btrim(body)) > 0),
  version integer not null default 1 check (version >= 1),
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('spanish', title || ' ' || body)) stored
);

comment on table public.help_articles is
  'RN-SOP-10, §133 · las guías del centro de ayuda. Contenido de Cuotly,
   versionado por migración: cambiar una guía deja rastro en el
   repositorio, que es donde se revisa. Sin editor en pantalla.';

create index help_articles_search_idx on public.help_articles using gin (search);

alter table public.help_articles enable row level security;

-- Cualquiera con sesión, equipo o restaurante (§131: "trabajadores y
-- clientes consultan artículos").
create policy help_articles_select on public.help_articles
for select using (auth.uid() is not null and published);

-- La búsqueda, de texto completo en español, con la identidad de quien
-- pregunta (RLS: solo lo publicado). Las guías del rol de quien busca van
-- primero; las demás también salen, porque §133 no esconde nada.
create or replace function public.search_help_articles(
  p_query text,
  p_role text default null,
  p_limit integer default 10
)
returns table (
  id uuid, slug text, topic text, title text, excerpt text, audience text[],
  for_my_role boolean, rank real
)
language sql
stable
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('spanish', coalesce(p_query, '')) as tsq
  )
  select a.id, a.slug, a.topic, a.title,
    left(regexp_replace(a.body, '\s+', ' ', 'g'), 180) as excerpt,
    a.audience,
    (p_role is not null and p_role = any(a.audience)) as for_my_role,
    ts_rank(a.search, q.tsq) as rank
  from public.help_articles a, q
  where a.published
    and (coalesce(btrim(p_query), '') = '' or a.search @@ q.tsq)
  order by for_my_role desc, rank desc, a.topic, a.title
  limit greatest(coalesce(p_limit, 10), 1);
$$;

comment on function public.search_help_articles(text, text, integer) is
  'RN-SOP-10/11, §133 · el buscador del centro de ayuda. Con la consulta
   vacía devuelve las guías del rol; con texto, las que casan. Si no
   devuelve nada, la pantalla ofrece abrir una incidencia con la consulta
   dentro (RN-SOP-11).';

revoke all on function public.search_help_articles(text, text, integer) from public, anon;
grant execute on function public.search_help_articles(text, text, integer) to authenticated;

insert into public.help_articles (slug, topic, audience, title, body) values
  ('poner-en-marcha-tu-espacio', 'first_steps', array['owner'], 'Poner en marcha tu espacio', 'Tu espacio funciona entero desde el minuto uno: el asistente de puesta en marcha no bloquea nada. Es una lista de diez pasos que puedes completar en el orden que quieras: datos del espacio, logotipo, zona horaria, horario operativo, impuestos, planes y servicios, primer establecimiento, primer trabajador, notificaciones y seguridad.
Seis pasos se dan por hechos cuando existe el dato (por ejemplo, el primer establecimiento). Los otros cuatro ya tienen un valor de partida y solo tú puedes confirmarlos: la pantalla dice "confirmado por el propietario", no "hecho", para que quede claro de dónde sale cada marca.
Lo encuentras en Puesta en marcha, dentro de tu espacio, y en el Inicio mientras quede algo pendiente. Cuando los diez estén hechos, el asistente se cierra y no vuelve a abrirse.'),
  ('tu-primer-acceso-como-restaurante', 'first_steps', array['client'], 'Tu primer acceso como restaurante', 'Entras en Cuotly con la invitación que te envió tu equipo de mantenimiento. Al aceptarla, tu cuenta queda vinculada a tu restaurante o a tu grupo, y desde ese momento ves tu inicio: tus solicitudes, tus mensajes, tu facturación y tus datos.
Nunca verás el nombre ni la foto de una persona concreta del equipo: Cuotly te enseña siempre "Equipo de mantenimiento". Es una regla del producto, no un fallo.
Si tienes varios restaurantes, el selector de contexto de arriba te deja cambiar de uno a otro. Todo lo que pidas y todo lo que te contesten queda guardado en la ficha del restaurante correspondiente.'),
  ('pedir-un-cambio-a-tu-equipo', 'requests', array['client'], 'Pedir un cambio a tu equipo', 'Desde la ficha de tu restaurante pulsa "Pedir un cambio". Puedes guardar un borrador y volver más tarde: nadie lo ve hasta que lo envías. Adjunta capturas, documentos o imágenes de hasta 25 MB; no se admiten vídeos.
Cada solicitud tiene una conversación. Un mensaje se puede editar durante diez minutos después de enviarlo y no se elimina nunca. Cuando el trabajo termina y pasa la ventana de corrección, la conversación queda en solo lectura: si necesitas algo más, abre una solicitud nueva.
Si tu plan lo permite, puedes ordenar tus cambios pendientes por importancia desde la lista de solicitudes. Ese orden lo ve el equipo y mueve su cola.'),
  ('que-pasa-con-una-solicitud', 'requests', array['owner', 'admin', 'worker'], 'Qué pasa con una solicitud cuando llega', 'Una solicitud nueva llega sin asignar y avisa al propietario y a todos los administradores. Nadie más recibe el aviso hasta que se asigna: a los trabajadores solo se les avisa de lo que es suyo.
Al asignarla nace un trabajo con su plazo de inicio y su plazo de ejecución, contados con el reloj contractual (de lunes a las 09:00 a sábado a las 14:30, con los festivos del espacio cerrados). Los avisos del 50 %, 80 % y 100 % del plazo salen solos; el del 100 % no se puede desactivar.
Un trabajador puede pedir la reasignación de un trabajo; la decide un administrador o el propietario. El supervisor de un trabajador ve sus trabajos, pero no aprueba nada antes de publicar: el trabajador publica directamente.'),
  ('trabajos-comenzar-publicar-y-plazos', 'jobs', array['worker'], 'Trabajos: comenzar, publicar y plazos', 'En "Mi trabajo" tienes tu cola y una recomendación de por dónde seguir. La recomendación no obliga: puedes empezar cualquier trabajo que tengas autorizado.
Pulsar "Comenzar" avisa al restaurante dentro de Cuotly y arranca el plazo de ejecución. Cuando termines, adjunta la evidencia de lo publicado y pulsa "Publicar": no hace falta que nadie lo apruebe antes. Pulsar dos veces nunca duplica nada.
Los plazos se cuentan con el reloj contractual, no con el reloj de pared: el sábado por la tarde y el domingo no corren, y los festivos del espacio tampoco. Tu disponibilidad personal no cambia ese reloj; si vas a faltar, pide la ausencia desde el calendario para que se reasignen tus trabajos.'),
  ('plazos-reasignacion-y-carga-del-equipo', 'jobs', array['owner', 'admin'], 'Plazos, reasignación y carga del equipo', 'El Inicio te enseña los trabajos próximos a vencer y la carga de cada persona, calculada en puntos según el tipo de trabajo. Cuando un plazo llega al 80 % te sugerimos reasignar; al 100 % el incumplimiento ya ha ocurrido y el aviso no se puede desactivar.
"Supervisor" no es un rol: es una relación entre un administrador y los trabajadores que supervisa. Un supervisor ve el trabajo de los suyos y recibe sus avisos, pero el trabajador publica sin esperar aprobación.
Un trabajo bloqueado por causa del restaurante para el reloj hasta que se desbloquea, y queda registrado quién lo bloqueó y por qué. Todo cambio de estado deja un apunte en la auditoría del espacio.'),
  ('menu-diario-preparar-y-publicar', 'menus', array['client'], 'Menú Diario: preparar y publicar', 'Si tienes contratado Menú Diario, en tu ficha aparece la sección con tus menús. Preparas el menú del día, eliges plantilla y pides la publicación; el equipo lo publica en tu web. No hay botón "Comenzar": un menú se pide y se publica.
El servicio incluye 30 actualizaciones al mes. Si un menú no está preparado a tiempo recibes un recordatorio, y si un menú garantizado sigue sin publicarse pasadas las 08:00 se te avisa y se avisa al equipo.
Si al publicar hay un error o te falta información, te lo decimos con el motivo. Puedes pedir una corrección menor durante las 72 horas siguientes a la publicación.'),
  ('menu-diario-para-el-equipo', 'menus', array['owner', 'admin', 'worker'], 'Menú Diario para el equipo', 'Las publicaciones pendientes entran en la cola de Menú Diario, separada de la de trabajos. Se asignan como un trabajo pero usan un tercer calendario: todos los días del año, festivos incluidos, porque un restaurante abre cuando abre.
Al publicar se guarda la evidencia y el menú queda como publicado para el restaurante. Si la publicación falla, el error queda registrado sin datos sensibles y el restaurante recibe el aviso con el motivo.
Una corrección menor pedida dentro de las 72 horas siguientes no consume una actualización nueva. El contador de actualizaciones es un libro de apuntes: cada consumo y cada devolución quedan escritos y nunca se editan.'),
  ('como-pagas-y-que-pasa-si-no', 'payments', array['client'], 'Cómo pagas y qué pasa si no pagas', 'Cuotly no cobra con tarjeta. Cada cobro lleva importe, concepto y referencia, y lo pagas por transferencia o Bizum. Puedes declarar el pago y adjuntar el justificante desde Facturación; el equipo lo confirma a mano y el cobro pasa a pagado.
Un cobro vencido sin pagar pausa el servicio a las 24 horas: se detienen los trabajos y los contadores. A las 72 horas el restaurante queda suspendido. En los dos casos sigues viendo tus datos y puedes pagar; al confirmarse el pago, el servicio se reactiva.
Un reembolso no borra nada: el cobro vuelve a quedar pendiente. La facturación es visible para el propietario del restaurante y nunca para los trabajadores del equipo.'),
  ('cobros-a-tus-restaurantes-y-tu-suscripcion', 'payments', array['owner', 'admin'], 'Cobros a tus restaurantes y tu suscripción a Cuotly', 'Las mensualidades de tus restaurantes se emiten solas el día uno y quedan registradas en un libro de apuntes con signo: emitir suma, cobrar resta y reembolsar vuelve a sumar. Nunca hay un saldo que se edite a mano. El estado de cada cobro se deriva del libro y del vencimiento.
Los planes que vendes son Básico, Impulso y Premium, más IVA, con tres meses de permanencia y sin bolsas de horas. El Básico no incluye cambios ni fotografías.
Tu suscripción a Cuotly es otra cosa: Pro (149 € al mes, 5 establecimientos y 5 usuarios, adicionales a 25 € y 15 €) o Agency (499 € al mes), más IVA, con 7 días de prueba. Se paga también por transferencia o Bizum, la confirma Cuotly, y un impago archiva el espacio en solo lectura a las 72 horas del vencimiento, recuperable durante 30 días pagando. Todo esto lo ves en Ajustes, en Suscripción.'),
  ('roles-e-invitaciones', 'users', array['owner'], 'Roles e invitaciones en tu espacio', 'Hay tres roles de equipo: propietario, administrador y trabajador, y el rol de consulta, que solo lee. El propietario gestiona el espacio, invita y decide finanzas; el administrador opera el día a día; el trabajador hace y publica trabajos.
"Supervisor" no es un rol: es una relación entre un administrador y los trabajadores que supervisa, y se configura desde Equipo. Un administrador puede recibir además el permiso de hacer trabajos o de aprobar informes, persona a persona.
Invitas desde Equipo; la invitación caduca si nadie la acepta. Un espacio siempre tiene al menos un propietario: para dejar de serlo, transfiere la propiedad desde Ajustes, y quien la recibe pasa a propietario mientras tú quedas como administrador.'),
  ('quien-puede-hacer-que-en-tu-restaurante', 'users', array['client'], 'Quién puede hacer qué en tu restaurante', 'En un restaurante hay un propietario local, que decide por él, y en un grupo un propietario global, que decide por todos los restaurantes del grupo. Los dos pueden pedir cambios, aceptar presupuestos y condiciones, ver la facturación y exportar sus datos.
Un editor puede pedir cambios y escribir en las conversaciones. Un usuario de consulta solo lee, no responde mensajes ni ve la facturación, y necesita permiso de su propietario para ver los informes.
El acceso lo concede y lo retira tu equipo de mantenimiento, y queda registrado cuándo y quién. Si alguien ya no debe entrar, pídeselo a tu equipo desde la conversación de cualquier solicitud.'),
  ('conectar-las-fuentes-de-datos', 'integrations', array['owner', 'admin'], 'Conectar las fuentes de datos de un restaurante', 'Cada restaurante puede conectar cinco fuentes: Google Analytics 4, Search Console, Business Profile, Microsoft Clarity y PageSpeed. Las de Google se autorizan con la cuenta del restaurante; Clarity y PageSpeed van con clave o con la dirección del sitio.
La sincronización es automática y por cola; no existe un botón "Sincronizar ahora". Si una fuente falla varias veces seguidas te avisamos una vez, y si Google revoca el permiso, el restaurante recibe el aviso de volver a autorizar.
Con las fuentes conectadas, los informes y las oportunidades se calculan con reglas fijas y sin inventar cifras: donde falta el dato, la pantalla dice por qué (no conectado, sin datos todavía, error o periodo insuficiente).'),
  ('autorizar-fuentes-y-ver-tus-datos', 'integrations', array['client'], 'Autorizar fuentes y ver tus datos', 'En "Autorizar fuentes" ves qué fuentes ha conectado tu equipo y cuáles esperan tu autorización. Autorizar una fuente de Google la vincula con tu cuenta; Cuotly guarda el permiso cifrado y nunca tu contraseña.
En "Informes y datos" ves los informes que tu equipo te ha enviado y las cifras de tus fuentes. Un dato que falta lleva siempre su motivo; nunca verás un cero que parezca un dato.
Puedes desautorizar una fuente cuando quieras desde la misma pantalla. Ni las reservas ni el delivery se monitorizan: no son integraciones de Cuotly.'),
  ('verificacion-en-dos-pasos-y-sesiones', 'security', array['owner', 'admin', 'worker', 'client'], 'Verificación en dos pasos y sesiones', 'Desde Cuenta, en Seguridad, puedes activar la verificación en dos pasos con una aplicación de códigos. Para propietarios, administradores, trabajadores y restaurantes es opcional; para el personal de Cuotly es obligatoria. Con ella activada, cada inicio de sesión pide el código.
En "Mis sesiones" ves desde qué dispositivos hay una sesión abierta con tu cuenta y puedes cerrar cualquiera de ellas al momento.
Si eres el único propietario de un espacio o de un grupo, no puedes cerrar tu cuenta: primero transfiere la propiedad o cierra lo que dependa de ti. La pantalla de cierre te dice exactamente qué lo impide.'),
  ('modo-soporte-cuando-entra-cuotly', 'security', array['owner'], 'Modo soporte: cuándo entra Cuotly en tu espacio', 'Nadie de Cuotly puede entrar en tu espacio salvo por Modo soporte: una sesión con motivo escrito, duración limitada (entre 15 minutos y 4 horas) y el nivel mínimo necesario, de solo lectura, de administrador o de propietario.
Cuando alguien entra, recibes un aviso que no se puede desactivar, y en tu auditoría queda quién entró, cuándo, por qué y cada acción que hizo. En nivel de solo lectura no puede escribir nada.
Ni siquiera en nivel de propietario puede invitar a nadie, transferir la propiedad, archivar tu espacio ni abrir una incidencia a Cuotly en tu nombre. Lo que necesites de Cuotly lo pides tú desde Ayuda.')
on conflict (slug) do update set
  topic = excluded.topic,
  audience = excluded.audience,
  title = excluded.title,
  body = excluded.body,
  version = public.help_articles.version + 1,
  updated_at = now()
where public.help_articles.body is distinct from excluded.body
   or public.help_articles.title is distinct from excluded.title
   or public.help_articles.topic is distinct from excluded.topic
   or public.help_articles.audience is distinct from excluded.audience;

-- ============================================================
-- 10 · La página de estado (RN-SOP-12, RN-SOP-13, §157)
-- ============================================================
--
-- Lo que Cuotly DECLARA: un evento con componente, gravedad, inicio y fin.
-- Sin `space_id`: es de la plataforma.
create table public.platform_status_events (
  id uuid primary key default gen_random_uuid(),
  component text not null check (component in ('app', 'auth', 'files', 'notifications', 'integrations')),
  severity text not null check (severity in ('degraded', 'outage', 'maintenance')),
  title text not null check (length(btrim(title)) > 0),
  body text,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text,
  created_by uuid not null references public.profiles (id),
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint platform_status_events_window check (resolved_at is null or resolved_at >= started_at)
);

comment on table public.platform_status_events is
  'RN-SOP-12/13, §157 · lo que Cuotly declara sobre sus cinco componentes.
   El historial público son los resueltos; lo que se mide va aparte y lo
   calcula `platform_status_snapshot()`.';

create index platform_status_events_open_idx on public.platform_status_events (component) where resolved_at is null;

alter table public.platform_status_events enable row level security;

-- La tabla la lee la plataforma; el público la lee a través de la
-- instantánea, que no enseña quién declaró nada.
create policy platform_status_events_select on public.platform_status_events
for select using (public.is_platform_member());

create or replace function public.declare_platform_status_event(
  p_component text,
  p_severity text,
  p_title text,
  p_body text default null,
  p_started_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, declara el estado (§157, RN-SOP-13)';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Un evento de estado lleva título';
  end if;

  insert into public.platform_status_events (component, severity, title, body, started_at, created_by)
  values (p_component, p_severity, btrim(p_title), nullif(btrim(p_body), ''), coalesce(p_started_at, now()), auth.uid())
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (null, auth.uid(), 'platform_status.declared', 'platform_status_event', v_id,
          jsonb_build_object('component', p_component, 'severity', p_severity, 'title', btrim(p_title),
                             'started_at', coalesce(p_started_at, now())));
  return v_id;
end;
$$;

create or replace function public.resolve_platform_status_event(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_status_events;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, resuelve un evento de estado (§157, RN-SOP-13)';
  end if;
  select * into v_row from public.platform_status_events where id = p_id for update;
  if v_row.id is null then
    raise exception 'Evento de estado no encontrado';
  end if;
  if v_row.resolved_at is not null then
    return; -- CA-17.
  end if;

  update public.platform_status_events
  set resolved_at = now(), resolved_by = auth.uid(), resolution_note = nullif(btrim(p_note), '')
  where id = p_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (null, auth.uid(), 'platform_status.resolved', 'platform_status_event', p_id,
          jsonb_build_object('component', v_row.component, 'severity', v_row.severity),
          jsonb_build_object('resolved', true), nullif(btrim(p_note), ''));
end;
$$;

revoke all on function public.declare_platform_status_event(text, text, text, text, timestamptz) from public, anon;
revoke all on function public.resolve_platform_status_event(uuid, text) from public, anon;
grant execute on function public.declare_platform_status_event(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.resolve_platform_status_event(uuid, text) to authenticated;

-- La instantánea pública (§157: "página de estado pública"). **Abierta a
-- `anon` a propósito y es la única función del proyecto que lo está**:
-- no recibe argumentos, no lee nada de ningún espacio y solo devuelve
-- recuentos agregados de la plataforma y los eventos declarados sin quién
-- los declaró. Está clasificada con ese motivo en el barrido de
-- `hito7_mensajes_archivos_finanzas.sql`.
--
-- Cada componente dice de dónde sale su estado (RN-SOP-12):
--   · `measured`: si se mide desde la base. Aplicación, notificaciones e
--     integraciones sí; autenticación y archivos NO, y se dice.
--   · `declared`: lo que Cuotly ha declarado y sigue abierto.
-- No se inventa un "todo operativo": lo que no se mide ni se declara sale
-- como "sin medición automática".
create or replace function public.platform_status_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dead integer;
  v_stuck integer;
  v_int_total integer;
  v_int_error integer;
  v_components jsonb;
  v_open jsonb;
  v_history jsonb;
begin
  -- Notificaciones: entregas de correo muertas o atascadas en 24 h.
  select count(*) filter (where d.status = 'dead' and d.next_attempt_at >= now() - interval '24 hours'),
         count(*) filter (where d.status = 'pending' and d.next_attempt_at < now() - interval '1 hour')
  into v_dead, v_stuck
  from public.notification_deliveries d;

  -- Integraciones: conexiones vivas, y cuántas llevan tres fallos seguidos.
  select count(*) filter (where i.status in ('connected', 'syncing', 'needs_attention', 'error')),
         count(*) filter (where i.status = 'error' and i.consecutive_failures >= 3)
  into v_int_total, v_int_error
  from public.integrations i;

  select jsonb_agg(jsonb_build_object(
    'component', c.component,
    'measured', c.measured,
    'measured_state', c.measured_state,
    'measured_detail', c.measured_detail,
    'declared', (select jsonb_agg(jsonb_build_object(
                   'severity', e.severity, 'title', e.title, 'body', e.body, 'started_at', e.started_at)
                   order by e.started_at desc)
                 from public.platform_status_events e
                 where e.component = c.component and e.resolved_at is null)
  ) order by c.ordinal)
  into v_components
  from (values
    (1, 'app', true, 'operational', jsonb_build_object('reason', 'responds')),
    (2, 'auth', false, null, jsonb_build_object('reason', 'not_measured')),
    (3, 'files', false, null, jsonb_build_object('reason', 'not_measured')),
    (4, 'notifications', true,
        case when v_dead > 0 or v_stuck > 0 then 'degraded' else 'operational' end,
        jsonb_build_object('dead_24h', v_dead, 'stuck_over_1h', v_stuck)),
    (5, 'integrations',
        v_int_total > 0,
        case when v_int_total = 0 then null
             when v_int_error * 4 > v_int_total then 'degraded'
             else 'operational' end,
        jsonb_build_object('connected', v_int_total, 'failing', v_int_error,
                           'reason', case when v_int_total = 0 then 'nothing_connected' else null end))
  ) as c(ordinal, component, measured, measured_state, measured_detail);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'component', e.component, 'severity', e.severity, 'title', e.title,
      'body', e.body, 'started_at', e.started_at) order by e.started_at desc), '[]'::jsonb)
  into v_open
  from public.platform_status_events e where e.resolved_at is null;

  select coalesce(jsonb_agg(h order by (h ->> 'started_at') desc), '[]'::jsonb)
  into v_history
  from (
    select jsonb_build_object(
      'id', e.id, 'component', e.component, 'severity', e.severity, 'title', e.title,
      'body', e.body, 'started_at', e.started_at, 'resolved_at', e.resolved_at,
      'resolution_note', e.resolution_note) as h
    from public.platform_status_events e
    where e.resolved_at is not null
    order by e.started_at desc
    limit 20
  ) x;

  return jsonb_build_object(
    'generated_at', now(),
    'support_open_now', public.support_minutes_between(now(), now() + interval '1 minute') > 0,
    'components', coalesce(v_components, '[]'::jsonb),
    'open_events', v_open,
    'history', v_history
  );
end;
$$;

comment on function public.platform_status_snapshot() is
  'RN-SOP-12, §133/§157 · la página de estado pública. Abierta a `anon` a
   propósito: sin argumentos, sin datos de ningún espacio, solo recuentos
   agregados y lo declarado, sin quién lo declaró.';

revoke all on function public.platform_status_snapshot() from public;
grant execute on function public.platform_status_snapshot() to anon, authenticated;

-- ============================================================
-- 11 · Avisos, auditoría y panel (RN-SOP-14, RN-SOP-15)
-- ============================================================
alter table public.notifications drop constraint notifications_event_type_check;

-- Sin paréntesis en los comentarios de esta lista, a propósito:
-- `listas-compartidas.test.ts` la lee con una expresión que se corta en el
-- primer cierre.
alter table public.notifications add constraint notifications_event_type_check check (event_type in (
  'request_submitted', 'job_unassigned', 'job_assigned', 'job_started', 'job_published',
  'correction_requested', 'job_reassignment_requested', 'task_reassignment_requested',
  'terms_version_published',
  'menu_publication_requested', 'menu_assigned', 'menu_needs_information', 'menu_published',
  'menu_publication_error', 'menu_not_prepared_reminder', 'menu_publication_overdue',
  'quote_sent', 'quote_accepted', 'quote_rejected',
  'integration_sync_failed', 'integration_reauthorization_required',
  'report_schedule_due_soon', 'report_sent',
  'cuotly_payment_due_soon', 'cuotly_payment_due_today', 'cuotly_payment_overdue_24h',
  'cuotly_payment_overdue_48h', 'cuotly_payment_final_notice',
  'cuotly_space_archived', 'cuotly_space_reactivated',
  'support_session_started',
  -- Hito 20 · el espacio cambia de dueño, o su dueño lo archiva.
  'space_ownership_transferred', 'space_archived_by_owner',
  -- Hito 21 · una incidencia abierta, movida o contestada, RN-SOP-15.
  'incident_opened', 'incident_updated', 'incident_replied',
  'consumption_threshold_80', 'consumption_threshold_100',
  't2_threshold_50', 't2_threshold_80', 't2_threshold_100',
  't2_critical_alert', 't2_reassignment_suggestion',
  't3_threshold_75', 't3_threshold_90', 't3_threshold_100',
  'establishment_paused_nonpayment', 'establishment_suspended_nonpayment',
  'establishment_reactivated',
  'absence_requested', 'absence_decided', 'absence_uncovered_jobs'
));

alter table public.notifications drop constraint notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check check (entity_type in (
  'request', 'job', 'task', 'establishment', 'charge', 'absence', 'menu', 'quote', 'integration', 'report',
  'cuotly_charge', 'space', 'support_session', 'incident'
));

-- RN-NOT-04 · el enlace profundo de un aviso "abre el elemento exacto".
-- Hasta hoy todos abrían algo de un espacio; los de la plataforma abren
-- la incidencia en el panel, y el panel verifica el acceso antes como
-- cualquier otra pantalla. El CHECK se ensancha para esa segunda raíz y
-- ninguna más.
alter table public.notifications drop constraint notifications_deep_link_check;
alter table public.notifications add constraint notifications_deep_link_check
  check (deep_link like '/espacios/%' or deep_link like '/administracion/%');

-- `incident` la decide la fila (RN-SOP-14): quien ve la incidencia ve sus
-- apuntes, sea del espacio o de Cuotly. `audit_action_capability()` no se
-- toca: `incident` no está en su `case` y cae en el `else null`.
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
    when p_entity_type = 'quote' then exists (select 1 from public.quotes q where q.id = p_entity_id)
    when p_entity_type = 'opportunity' then exists (select 1 from public.opportunities o where o.id = p_entity_id)
    when p_entity_type = 'report' then exists (select 1 from public.reports r where r.id = p_entity_id)
    when p_entity_type = 'export' then exists (select 1 from public.space_exports x where x.id = p_entity_id)
    when p_entity_type = 'incident' then exists (select 1 from public.incidents i where i.id = p_entity_id)
    else false
  end;
$$;

revoke all on function public.audit_entity_is_visible(text, uuid) from public, anon;
grant execute on function public.audit_entity_is_visible(text, uuid) to authenticated;

-- El bloque "incidencias" del panel deja de estar vacío (RN-ADM-04,
-- RN-SOP-15), y la auditoría de plataforma incluye la familia.
create or replace function public.platform_panel_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'spaces_total', (select count(*) from public.spaces),
    'spaces_trial', (select count(*) from public.spaces where cuotly_status = 'trial'),
    'spaces_active', (select count(*) from public.spaces where cuotly_status = 'active'),
    'spaces_archived', (select count(*) from public.spaces where cuotly_status in ('archived_trial_ended', 'archived_nonpayment')),
    'spaces_without_plan', (select count(*) from public.spaces where cuotly_status is null),
    'requests_pending', (select count(*) from public.space_requests where status in ('submitted', 'in_review', 'needs_information')),
    'requests_submitted', (select count(*) from public.space_requests where status in ('submitted', 'in_review')),
    'subscriptions_total', (select count(*) from public.cuotly_subscriptions),
    'revenue_total_cents', (select coalesce(-sum(amount_cents), 0) from public.cuotly_ledger_entries where entry_type in ('payment', 'payment_reversal')),
    'revenue_month_cents', (select coalesce(-sum(amount_cents), 0) from public.cuotly_ledger_entries
                              where entry_type in ('payment', 'payment_reversal')
                                and created_at >= date_trunc('month', now())),
    'overdue_charges', (select count(*) from public.cuotly_charges c where public.cuotly_charge_status(c.id) = 'overdue'),
    'overdue_cents', (select coalesce(sum(public.cuotly_charge_outstanding_cents(c.id)), 0) from public.cuotly_charges c where public.cuotly_charge_status(c.id) = 'overdue'),
    'declared_payments_pending', (select count(*) from public.cuotly_payments where confirmed_at is null and rejected_at is null),
    'storage_bytes_total', (select coalesce(sum(size_bytes), 0) from public.file_versions),
    'activity_24h', (select count(*) from public.audit_log where created_at >= now() - interval '24 hours'),
    -- Hito 21 · las que no están cerradas, que es lo que Cuotly tiene
    -- entre manos (RN-SOP-15).
    'incidents', (select count(*) from public.incidents where status <> 'closed'),
    'incidents_critical', (select count(*) from public.incidents i where i.status <> 'closed' and public.incident_priority(i.id) = 'critical'),
    'support_sessions_active', (select count(*) from public.support_sessions where ended_at is null and expires_at > now()),
    'support_sessions_total', (select count(*) from public.support_sessions),
    'platform_audit_total', (select count(*) from public.audit_log
                               where space_id is null
                                  or split_part(action, '.', 1) in ('space_request', 'cuotly_charge', 'cuotly_payment', 'support', 'platform', 'incident'))
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_panel_summary() from public, anon;
grant execute on function public.platform_panel_summary() to authenticated;

create or replace function public.platform_audit(
  p_scope text default 'platform',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, created_at timestamptz, space_id uuid, space_name text,
  actor_id uuid, actor_email text, action text, entity_type text, entity_id uuid,
  old_value jsonb, new_value jsonb, reason text, support_session_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;
  if p_scope not in ('platform', 'all') then
    raise exception 'Ámbito desconocido: platform o all';
  end if;

  return query
    select a.id, a.created_at, a.space_id, s.name,
      a.actor_id, p.email, a.action, a.entity_type, a.entity_id,
      a.old_value, a.new_value, a.reason, a.support_session_id
    from public.audit_log a
    left join public.spaces s on s.id = a.space_id
    left join public.profiles p on p.id = a.actor_id
    where p_scope = 'all'
       or a.space_id is null
       or split_part(a.action, '.', 1) in ('space_request', 'cuotly_charge', 'cuotly_payment', 'support', 'platform', 'incident')
    order by a.created_at desc
    limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.platform_audit(text, integer, integer) from public, anon;
grant execute on function public.platform_audit(text, integer, integer) to authenticated;

-- ============================================================
-- 12 · Las cuatro tablas nuevas de espacio, dentro de los dos barridos
-- ============================================================
--
--   · **Exentas del disparador de modo lectura** (RN-SOP-09): RN-SUB-08
--     dice que en un espacio archivado "se puede pagar, exportar y
--     **contactar con soporte**". Con el disparador puesto, un espacio
--     archivado no podría abrir la incidencia que dice "no puedo entrar".
--   · **Con el disparador de Modo soporte**: una sesión de soporte no
--     habla con Cuotly en nombre del espacio (RN-SOP-01). Dos cerraduras:
--     la capacidad ya lo impide, y el disparador también.
create trigger incidents_guard_support_read_only
  before insert or update or delete on public.incidents
  for each row execute function public.guard_support_read_only();

create trigger incident_events_guard_support_read_only
  before insert or update or delete on public.incident_events
  for each row execute function public.guard_support_read_only();

create trigger incident_messages_guard_support_read_only
  before insert or update or delete on public.incident_messages
  for each row execute function public.guard_support_read_only();

create trigger incident_attachments_guard_support_read_only
  before insert or update or delete on public.incident_attachments
  for each row execute function public.guard_support_read_only();
