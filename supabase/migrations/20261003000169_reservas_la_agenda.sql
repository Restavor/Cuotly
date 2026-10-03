-- Fase C de Restavor agents · La agenda (RES-01 a RES-13).
--
-- Hasta aquí las tablas de Reservas no tenían ninguna vía de escritura (RLS sin política
-- de insert/update/delete, sin privilegio de tabla). Esta migración les da la única que
-- hay: funciones SECURITY DEFINER que comprueban permisos, validan la transición, toman el
-- bloqueo, escriben el evento y la auditoría —sin datos personales de comensales— y
-- son idempotentes.
--
--   1 · `reservations.idempotency_key` (única por restaurante, fuera del `grant select`).
--   2 · Funciones internas: quién actúa, dónde cae una hora (turno / día cerrado / no es
--       hueco), ocupación, hora local → UTC, evento, recálculo de posibles duplicadas.
--   3 · `book_reservation`: crear, y editar fecha / hora / personas / contacto (RN-RES-02,
--       03, 05, 07). Bloquea restaurante + fecha + turno con `pg_advisory_xact_lock`.
--   4 · `confirm_reservation`, `reject_reservation`, `cancel_reservation`,
--       `mark_no_show`, `undo_no_show`, `dismiss_duplicate`, `open_reservation`,
--       `mark_platform_cancel_done` (RN-RES-05, 06, 08, 09).
--   5 · Horarios (RN-RES-01): `save_reservation_shifts`, `set_reservation_closed_date`,
--       `save_reservation_settings`, `complete_reservations_onboarding`.
--   6 · Lecturas que no caben en un `select` de PostgREST: `reservations_search`,
--       `reservations_calendar`, `reservation_history`.
--
-- Quién puede escribir: el Propietario o el Encargado del restaurante, y el soporte con
-- sesión de Reservas abierta y segundo paso (tabla §3.2 del PRD). Sin sesión de usuario
-- (el servidor: agente, web, plataformas) la función acepta cualquier origen; con sesión
-- de usuario, siempre es `manual` (el restaurante o el soporte, §6.8). El equipo del
-- espacio sin sesión de soporte no entra: no ve datos de comensales (decisión 108).
--
-- Se comprueba con `supabase/tests/la_agenda.sql` (suite 91) y con el script de
-- concurrencia `apps/web/scripts/agenda-concurrency-test.mjs`.

-- ------------------------------------------------------------
-- 1 · Idempotencia de las altas
-- ------------------------------------------------------------
alter table public.reservations add column idempotency_key text;

create unique index reservations_idempotency_idx
  on public.reservations (establishment_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.reservations.idempotency_key is
  'Clave de idempotencia del alta: pulsar dos veces "Guardar" crea una sola reserva. Sin privilegio de select: solo la lee el servidor.';

-- Reabrir un día cerrado no borra su fila (CLAUDE.md: nunca se borran registros de negocio): la
-- marca como quitada. La unicidad (restaurante, fecha) sigue valiendo: volver a cerrarlo la reactiva.
alter table public.reservation_closed_dates add column removed_at timestamptz;

comment on column public.reservation_closed_dates.removed_at is
  'Fase C · el día se reabrió (no se borra la fila). Un día cerrado es el que tiene removed_at nulo.';

-- ------------------------------------------------------------
-- 2 · Funciones internas (cerradas por RPC)
-- ------------------------------------------------------------

-- Quién hace la operación. Con sesión: 'member' (Propietario o Encargado) o
-- 'restavor_support' (sesión de soporte de Reservas abierta). Sin sesión (servidor):
-- el origen. Cualquier otro: error.
create or replace function public.reservations_actor_type(p_establishment_id uuid, p_source text default 'manual')
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return case p_source when 'agent' then 'agent' when 'web' then 'web' when 'platform' then 'platform' else 'system' end;
  end if;
  if coalesce(public.reservations_my_role(p_establishment_id) in ('owner', 'manager'), false) then
    return 'member';
  end if;
  if public.reservations_can_read_diner_data(p_establishment_id) then
    return 'restavor_support';
  end if;
  raise exception 'No tienes permiso para manejar las reservas de este restaurante';
end;
$$;

revoke all on function public.reservations_actor_type(uuid, text) from public, anon, authenticated;

-- Quién cambia los ajustes de horarios: además de los anteriores, el equipo del espacio
-- (tabla §3.2: "Restavor" sí cambia horarios, aforo y límites).
create or replace function public.reservations_settings_actor(p_establishment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
begin
  if auth.uid() is null then
    return 'system';
  end if;
  if coalesce(public.reservations_my_role(p_establishment_id) in ('owner', 'manager'), false) then
    return 'member';
  end if;
  if public.reservations_can_read_diner_data(p_establishment_id) then
    return 'restavor_support';
  end if;
  if v_space_id is not null and public.reservations_team_can_read(v_space_id) then
    return 'restavor_team';
  end if;
  raise exception 'No tienes permiso para cambiar los ajustes de Reservas de este restaurante';
end;
$$;

revoke all on function public.reservations_settings_actor(uuid) from public, anon, authenticated;

-- Hora local → instante UTC. Un hueco que no existe (el salto de primavera) devuelve
-- nulo; uno que ocurre dos veces (el de otoño) es el PRIMERO, como en `localToUtc()` de
-- `src/core/reservations/dates.ts`. PostgreSQL elige el segundo por su cuenta.
create or replace function public.reservation_local_to_utc(p_date date, p_time time, p_timezone text)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  v_local timestamp := p_date + p_time;
  v_utc timestamptz := v_local at time zone p_timezone;
begin
  if (v_utc at time zone p_timezone) <> v_local then
    return null;
  end if;
  if ((v_utc - interval '1 hour') at time zone p_timezone) = v_local then
    return v_utc - interval '1 hour';
  end if;
  return v_utc;
end;
$$;

revoke all on function public.reservation_local_to_utc(date, time, text) from public, anon, authenticated;

-- Dónde cae una hora: un hueco de un turno ('slot'), un día cerrado o una hora que no
-- es hueco. Día cerrado = fecha cerrada a propósito o ningún turno activo ese día.
create or replace function public.reservation_classify_slot(p_establishment_id uuid, p_date date, p_time time)
returns table (status text, shift_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_interval integer;
  v_shift_id uuid;
begin
  select s.slot_interval_minutes into v_interval
  from public.reservation_settings s where s.establishment_id = p_establishment_id;

  if exists (select 1 from public.reservation_closed_dates c where c.establishment_id = p_establishment_id and c.date = p_date and c.removed_at is null)
     or not exists (
       select 1 from public.reservation_shifts sh
       where sh.establishment_id = p_establishment_id and sh.active
         and extract(isodow from p_date)::smallint = any (sh.weekdays)
     ) then
    return query select 'closed_day'::text, null::uuid;
    return;
  end if;

  select sh.id into v_shift_id
  from public.reservation_shifts sh
  where sh.establishment_id = p_establishment_id and sh.active
    and extract(isodow from p_date)::smallint = any (sh.weekdays)
    and p_time >= sh.start_time and p_time <= sh.last_booking_time
    and (extract(epoch from (p_time - sh.start_time))::integer / 60) % v_interval = 0
  limit 1;

  if v_shift_id is null then
    return query select 'not_a_slot'::text, null::uuid;
  else
    return query select 'slot'::text, v_shift_id;
  end if;
end;
$$;

revoke all on function public.reservation_classify_slot(uuid, date, time) from public, anon, authenticated;

-- Ocupación de un turno un día: personas de reservas pendientes y confirmadas.
create or replace function public.reservation_occupancy(
  p_establishment_id uuid, p_shift_id uuid, p_date date, p_exclude_reservation_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(r.party_size), 0)::integer
  from public.reservations r
  where r.establishment_id = p_establishment_id and r.shift_id = p_shift_id and r.date = p_date
    and r.status in ('pending', 'confirmed')
    and r.id is distinct from p_exclude_reservation_id;
$$;

revoke all on function public.reservation_occupancy(uuid, uuid, date, uuid) from public, anon, authenticated;

-- El ORDEN DE BLOQUEO de toda la agenda (RN-RES-02, garantía contra reservas simultáneas), siempre
-- el mismo para que dos operaciones no se esperen una a otra:
--
--   1 · la clave de idempotencia (solo el alta);
--   2 · el restaurante, en COMPARTIDO (`reservation_lock_day`) o en EXCLUSIVO (`reservation_lock_schedule`);
--   3 · el DÍA, de menor a mayor fecha, uno por restaurante y fecha;
--   4 · las filas (`for update`), y solo después de tener el día.
--
-- Con el día bloqueado, quien lo tiene es el único que lee la ocupación, recalcula las posibles
-- duplicadas y toca las reservas de esa fecha. Cambiar los horarios pide el restaurante en
-- exclusivo: espera a las operaciones de agenda en curso y las siguientes esperan a que termine.
create or replace function public.reservation_lock_schedule(p_establishment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('reservation:schedule:' || p_establishment_id::text, 0));
end;
$$;

revoke all on function public.reservation_lock_schedule(uuid) from public, anon, authenticated;

create or replace function public.reservation_lock_day(p_establishment_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('reservation:schedule:' || p_establishment_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('reservation:day:' || p_establishment_id::text || ':' || p_date::text, 0));
end;
$$;

revoke all on function public.reservation_lock_day(uuid, date) from public, anon, authenticated;

-- Reservas disponible para la agenda: devuelve la zona del restaurante o falla. Lo piden todas las
-- órdenes sobre una reserva (en `closed` solo entra el Propietario, a descargar, PRD §6.12).
create or replace function public.reservation_require_agenda(p_establishment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
begin
  select timezone into v_tz from public.reservation_settings
  where establishment_id = p_establishment_id and service_status in ('active', 'past_due', 'paused', 'ending');
  if v_tz is null then
    raise exception 'Reservas no está disponible para este restaurante en este momento';
  end if;
  return v_tz;
end;
$$;

revoke all on function public.reservation_require_agenda(uuid) from public, anon, authenticated;

-- Un evento de la reserva. Nunca lleva nombre, teléfono, email ni nota (RN-RES-12): lo
-- impide una restricción de la tabla, también en objetos anidados.
create or replace function public.reservation_log_event(
  p_establishment_id uuid, p_reservation_id uuid, p_type text, p_actor_type text, p_platform_name text default null,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_label text;
begin
  v_label := case p_actor_type
    when 'agent' then 'Agente'
    when 'web' then 'Web'
    when 'platform' then coalesce(p_platform_name, 'Plataforma')
    when 'customer' then 'Cliente'
    when 'restavor_support' then 'Restavor (soporte)'
    when 'system' then 'Sistema'
    else null
  end;
  insert into public.reservation_events (space_id, establishment_id, reservation_id, type, actor_type, actor_user_id, actor_label, data)
  values (v_space_id, p_establishment_id, p_reservation_id, p_type, p_actor_type,
          case when p_actor_type in ('member', 'restavor_support') then auth.uid() end, v_label, coalesce(p_data, '{}'::jsonb));
end;
$$;

revoke all on function public.reservation_log_event(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Auditoría de una operación de la agenda. Mismas reglas: sin datos personales. La clave es
-- corta ('created', 'cancelled'…) y el nombre de la acción sale de una lista cerrada, escrita
-- aquí con sus literales: una clave que no está en ella no escribe nada (la columna es NOT NULL)
-- y la operación entera falla, en vez de dejar en el libro una acción que nadie sabe leer.
create or replace function public.reservation_audit(
  p_establishment_id uuid, p_key text, p_reservation_id uuid, p_old jsonb, p_new jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    public.establishment_space_id(p_establishment_id), auth.uid(),
    case p_key
      when 'created' then 'reservations.booking_created'
      when 'updated' then 'reservations.booking_updated'
      when 'confirmed' then 'reservations.booking_confirmed'
      when 'rejected' then 'reservations.booking_rejected'
      when 'cancelled' then 'reservations.booking_cancelled'
      when 'no_show' then 'reservations.booking_no_show'
      when 'no_show_undone' then 'reservations.booking_no_show_undone'
      when 'duplicate_dismissed' then 'reservations.duplicate_dismissed'
    end,
    'reservation', p_reservation_id, p_old, p_new);
$$;

revoke all on function public.reservation_audit(uuid, text, uuid, jsonb, jsonb) from public, anon, authenticated;

-- RN-RES-06 · recalcula la marca de posible duplicada de un día: dos reservas activas del
-- mismo restaurante, mismo día y mismo teléfono forman un par, salvo par descartado.
create or replace function public.reservation_recompute_duplicates(p_establishment_id uuid, p_date date)
returns void
language sql
security definer
set search_path = public
as $$
  with calc as (
    select r.id,
           case when r.status in ('pending', 'confirmed') and r.phone_e164 is not null and exists (
                  select 1 from public.reservations o
                  where o.establishment_id = r.establishment_id and o.date = r.date and o.id <> r.id
                    and o.status in ('pending', 'confirmed') and o.phone_e164 = r.phone_e164
                    and not exists (
                      select 1 from public.reservation_duplicate_dismissals d
                      where d.reservation_a = least(r.id, o.id) and d.reservation_b = greatest(r.id, o.id)))
                then 'possible' else 'none' end as flag
    from public.reservations r
    where r.establishment_id = p_establishment_id and r.date = p_date
  )
  update public.reservations r set duplicate_flag = c.flag
  from calc c where c.id = r.id and r.duplicate_flag <> c.flag;
$$;

revoke all on function public.reservation_recompute_duplicates(uuid, date) from public, anon, authenticated;

-- Los avisos de la agenda al Propietario y al Encargado del restaurante (PRD §6.6 y §6.14):
-- reserva nueva de agente, web o plataforma, grupo pendiente y el recordatorio de las 2 horas.
-- En la campana y solo en la campana: el correo y el push salen por el sistema de avisos de
-- Restavor agents (PRD §9.4, decisión 99), que se construye con los avisos a comensales. Con
-- `p_send_email = false` `emit_notification()` no encola ni correo ni push, así que nada sale
-- por la cola de dos veces al día. Cada aviso lleva su clave: repetirlo no crea otro.
create or replace function public.reservations_notify_team(
  p_establishment_id uuid, p_reservation_id uuid, p_event_type text, p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_user uuid;
begin
  for v_user in
    select em.user_id from public.establishment_memberships em
    where em.establishment_id = p_establishment_id and em.revoked_at is null and em.role = 'local_owner'
    union
    select gm.user_id from public.group_memberships gm
    join public.establishments e on e.group_id = gm.group_id
    where e.id = p_establishment_id and gm.revoked_at is null and gm.role = 'global_owner'
    union
    select em.user_id from public.establishment_memberships em
    join public.establishment_permissions ep on ep.establishment_membership_id = em.id
    where em.establishment_id = p_establishment_id and em.revoked_at is null and em.role = 'editor' and ep.manage_reservations
  loop
    perform public.emit_notification(
      v_space_id, v_user, p_event_type, 'client', 'reservation', p_reservation_id,
      '/agents/' || p_establishment_id::text || '/reservas/' || p_reservation_id::text,
      p_dedupe_key, p_establishment_id, null, null, false);
  end loop;
end;
$$;

revoke all on function public.reservations_notify_team(uuid, uuid, text, text) from public, anon, authenticated;

-- RN-RES-05 · un grupo pendiente sin respuesta a las 2 horas: un aviso más, una sola vez. Nunca
-- caduca solo. Solo mira los de hoy en adelante: un grupo de un día que ya pasó no necesita
-- recordatorio. Lo lanza la tarea de cada 15 minutos (`/api/agents/cron/pendientes`, PRD §10.6).
create or replace function public.reservations_remind_pending()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select r.id, r.establishment_id
    from public.reservations r
    join public.reservation_settings s on s.establishment_id = r.establishment_id
    where r.status = 'pending' and r.pending_reminded_at is null
      and r.created_at <= now() - interval '2 hours'
      and r.date >= (now() at time zone s.timezone)::date
      and s.service_status in ('active', 'past_due', 'paused', 'ending')
    order by r.created_at
    limit 500
    for update of r skip locked
  loop
    update public.reservations set pending_reminded_at = now() where id = v_row.id;
    perform public.reservations_notify_team(v_row.establishment_id, v_row.id, 'reservation_group_pending_reminder',
      'reservation_group_pending_reminder:' || v_row.id::text);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.reservations_remind_pending() from public, anon, authenticated;
grant execute on function public.reservations_remind_pending() to service_role;

-- ------------------------------------------------------------
-- 3 · Crear y editar (RN-RES-02, 03, 05, 07)
-- ------------------------------------------------------------
-- Devuelve un resultado, no una excepción, para los casos de negocio:
--   {outcome:'accepted', reservation_id, status, shift_id, out_of_shift, over_capacity_by, replayed}
--   {outcome:'needs_confirmation', shift_id, overflow_by, occupied_after, capacity}   (manual, hay que repetir con p_force)
--   {outcome:'rejected', reason}   full | too_soon | too_far | closed_day | not_a_slot | service_paused |
--                                  past_date | platform_locked | not_editable | invalid_time
create or replace function public.book_reservation(
  p_establishment_id uuid,
  p_reservation_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_customer_name text,
  p_phone_e164 text,
  p_email text,
  p_notes text,
  p_language text default 'es',
  p_source text default 'manual',
  p_force boolean default false,
  p_idempotency_key text default null,
  p_whatsapp_consent boolean default false,
  p_platform_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_actor text;
  v_settings public.reservation_settings%rowtype;
  v_old public.reservations%rowtype;
  v_is_edit boolean := p_reservation_id is not null;
  v_source text;
  v_tz text;
  v_now timestamptz := now();
  v_today date;
  v_starts timestamptz;
  v_class record;
  v_shift public.reservation_shifts%rowtype;
  v_occupied integer;
  v_over integer;
  v_status text;
  v_changed text[] := '{}';
  v_scheduling_changed boolean := false;
  v_existing public.reservations%rowtype;
  v_new_id uuid;
  v_notice_limit date;
  v_data jsonb;
  v_pre_date date;
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone_e164, '')), '');
begin
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;
  -- Con NULL, `not in (...)` no es falso sino nulo y no saltaría: se comprueba el NULL aparte.
  if p_source is null or p_source not in ('agent', 'platform', 'web', 'manual') then
    raise exception 'Origen no válido';
  end if;
  if p_date is null or p_time is null then
    raise exception 'Faltan la fecha o la hora';
  end if;
  -- Con sesión de usuario el origen es siempre manual (§6.8): quien cambia es el restaurante.
  if auth.uid() is not null and p_source <> 'manual' then
    raise exception 'Con sesión de usuario una reserva siempre es manual';
  end if;
  v_actor := public.reservations_actor_type(p_establishment_id, p_source);

  select * into v_settings from public.reservation_settings where establishment_id = p_establishment_id;
  if not found then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_settings.service_status not in ('active', 'past_due', 'paused', 'ending') then
    raise exception 'Reservas no está disponible para este restaurante en este momento';
  end if;
  v_tz := v_settings.timezone;
  v_today := (v_now at time zone v_tz)::date;

  -- Los mismos topes que `booking-input.ts` (el formulario y el servidor): la base de datos no se fía de quien la llama.
  if p_party_size is null or p_party_size < 1 or p_party_size > 500 then
    raise exception 'Las personas tienen que ser entre 1 y 500';
  end if;
  if btrim(coalesce(p_customer_name, '')) = '' then
    raise exception 'Falta el nombre';
  end if;
  if char_length(btrim(p_customer_name)) > 120 then
    raise exception 'El nombre es demasiado largo';
  end if;
  if p_language is null or p_language not in ('es', 'en') then
    raise exception 'Idioma no válido';
  end if;
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Email no válido';
  end if;
  -- Un hueco es una hora en punto del minuto: '21:00:30' no es el hueco de las 21:00.
  if p_time <> date_trunc('minute', p_time::interval)::time then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'not_a_slot');
  end if;
  if v_notes is not null and char_length(v_notes) > 300 then
    raise exception 'La nota es demasiado larga';
  end if;

  v_source := p_source;

  -- Alta repetida con la misma clave: devuelve lo que ya se creó (no duplica el efecto).
  if not v_is_edit and p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('reservation:idem:' || p_establishment_id::text || ':' || p_idempotency_key, 0));
    select * into v_existing from public.reservations
    where establishment_id = p_establishment_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('outcome', 'accepted', 'reservation_id', v_existing.id, 'status', v_existing.status,
                                'shift_id', v_existing.shift_id, 'out_of_shift', v_existing.shift_id is null,
                                'over_capacity_by', 0, 'replayed', true);
    end if;
  end if;

  -- El orden de bloqueo de la agenda (ver `reservation_lock_day`): el día o los días primero, la fila después.
  -- Al editar se bloquean la fecha de la reserva y la de destino, de menor a mayor.
  if v_is_edit then
    select r.date into v_pre_date from public.reservations r
    where r.id = p_reservation_id and r.establishment_id = p_establishment_id;
    if not found then
      raise exception 'Reserva no encontrada';
    end if;
    perform public.reservation_lock_day(p_establishment_id, least(p_date, v_pre_date));
    if p_date <> v_pre_date then
      perform public.reservation_lock_day(p_establishment_id, greatest(p_date, v_pre_date));
    end if;
  else
    perform public.reservation_lock_day(p_establishment_id, p_date);
  end if;

  if v_is_edit then
    select * into v_old from public.reservations
    where id = p_reservation_id and establishment_id = p_establishment_id for update;
    if not found then
      raise exception 'Reserva no encontrada';
    end if;
    -- Si otra operación movió la reserva de día entre la lectura y el bloqueo (rarísimo), se bloquea también ese día.
    if v_old.date <> v_pre_date and v_old.date <> p_date then
      perform public.reservation_lock_day(p_establishment_id, v_old.date);
    end if;
    if v_old.status = 'cancelled' then
      return jsonb_build_object('outcome', 'rejected', 'reason', 'not_editable');
    end if;
    -- Editar: las reglas son las de quien cambia (§6.8). Sin sesión, el origen que llega.
    v_source := case when auth.uid() is not null then 'manual' else p_source end;
    v_scheduling_changed := v_old.date <> p_date or v_old.time <> p_time or v_old.party_size <> p_party_size;
  end if;

  if v_phone is null and v_email is null then
    raise exception 'Hace falta un teléfono o un email';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'Teléfono no válido';
  end if;

  -- Editar solo el contacto (nombre, teléfono, email, idioma, nota): no reaplica ninguna regla.
  if v_is_edit and not v_scheduling_changed then
    if v_old.customer_name <> btrim(p_customer_name) then v_changed := array_append(v_changed, 'name'); end if;
    if v_old.phone_e164 is distinct from v_phone then v_changed := array_append(v_changed, 'phone'); end if;
    if v_old.email is distinct from v_email then v_changed := array_append(v_changed, 'email'); end if;
    if v_old.language <> p_language then v_changed := array_append(v_changed, 'language'); end if;
    if v_old.notes is distinct from v_notes then v_changed := array_append(v_changed, 'notes'); end if;
    if coalesce(array_length(v_changed, 1), 0) = 0 then
      return jsonb_build_object('outcome', 'accepted', 'reservation_id', v_old.id, 'status', v_old.status,
                                'shift_id', v_old.shift_id, 'out_of_shift', v_old.shift_id is null,
                                'over_capacity_by', 0, 'unchanged', true);
    end if;
    update public.reservations set customer_name = btrim(p_customer_name), phone_e164 = v_phone, email = v_email,
      language = p_language, notes = v_notes, updated_at = now()
    where id = v_old.id;
    perform public.reservation_recompute_duplicates(p_establishment_id, v_old.date);
    perform public.reservation_log_event(p_establishment_id, v_old.id, 'updated', v_actor, v_old.platform_name,
      jsonb_build_object('changed', to_jsonb(v_changed)));
    perform public.reservation_audit(p_establishment_id, 'updated', v_old.id, null,
      jsonb_build_object('changed', to_jsonb(v_changed)));
    return jsonb_build_object('outcome', 'accepted', 'reservation_id', v_old.id, 'status', v_old.status,
                              'shift_id', v_old.shift_id, 'out_of_shift', v_old.shift_id is null, 'over_capacity_by', 0);
  end if;

  -- A partir de aquí cambia (o nace) la fecha, la hora o las personas.
  if v_settings.service_status = 'paused' and v_source <> 'platform' then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'service_paused');
  end if;
  if v_is_edit and v_old.source = 'platform' then
    -- Sin conector que modifique (Fase I) la fecha, la hora y las personas se cambian en la plataforma.
    return jsonb_build_object('outcome', 'rejected', 'reason', 'platform_locked');
  end if;
  if not v_is_edit and v_source = 'manual' and p_date < v_today then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'past_date');
  end if;

  v_starts := public.reservation_local_to_utc(p_date, p_time, v_tz);
  if v_starts is null then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'invalid_time');
  end if;

  select * into v_class from public.reservation_classify_slot(p_establishment_id, p_date, p_time);

  v_status := case when v_is_edit then v_old.status else 'confirmed' end;

  if v_source = 'platform' then
    -- Una plataforma entra siempre; fuera de turno o en día cerrado, sin turno.
    if v_class.status <> 'slot' then
      v_class.shift_id := null;
    end if;
  elsif v_class.status <> 'slot' then
    return jsonb_build_object('outcome', 'rejected', 'reason', v_class.status);
  else
    select * into v_shift from public.reservation_shifts where id = v_class.shift_id;
    v_occupied := public.reservation_occupancy(p_establishment_id, v_class.shift_id, p_date, p_reservation_id);

    if v_source in ('agent', 'web') then
      -- Antelación (RN-RES-03).
      if v_starts < v_now + make_interval(mins => v_settings.min_notice_minutes) then
        return jsonb_build_object('outcome', 'rejected', 'reason', 'too_soon');
      end if;
      if p_date > v_today + v_settings.max_advance_days then
        return jsonb_build_object('outcome', 'rejected', 'reason', 'too_far');
      end if;
      if v_settings.service_status = 'ending' and v_settings.ending_at is not null
         and p_date > (v_settings.ending_at at time zone v_tz)::date then
        return jsonb_build_object('outcome', 'rejected', 'reason', 'too_far');
      end if;
      -- Aforo (RN-RES-02): agente y web, si no cabe, no entra.
      if v_occupied + p_party_size > v_shift.capacity then
        return jsonb_build_object('outcome', 'rejected', 'reason', 'full');
      end if;
      -- Grupos grandes (RN-RES-05): pendientes, y cuentan para el aforo.
      if not v_is_edit and p_party_size >= v_settings.large_group_threshold then
        v_status := 'pending';
      end if;
    else
      v_over := greatest(0, v_occupied + p_party_size - v_shift.capacity);
      if v_over > 0 and not coalesce(p_force, false) then
        return jsonb_build_object('outcome', 'needs_confirmation', 'shift_id', v_shift.id, 'overflow_by', v_over,
                                  'occupied_after', v_occupied + p_party_size, 'capacity', v_shift.capacity);
      end if;
    end if;
  end if;

  -- El agente que sube una confirmada al umbral o más la deja pendiente (§6.8). Bajar una
  -- pendiente por debajo del umbral NO la confirma sola.
  if v_is_edit and v_source = 'agent' and v_old.status = 'confirmed' and p_party_size >= v_settings.large_group_threshold then
    v_status := 'pending';
  end if;

  v_over := 0;
  if v_class.shift_id is not null then
    select * into v_shift from public.reservation_shifts where id = v_class.shift_id;
    v_over := greatest(0, public.reservation_occupancy(p_establishment_id, v_class.shift_id, p_date, p_reservation_id)
                          + p_party_size - v_shift.capacity);
  end if;

  if v_is_edit then
    if v_old.date <> p_date then v_changed := array_append(v_changed, 'date'); end if;
    if v_old.time <> p_time then v_changed := array_append(v_changed, 'time'); end if;
    if v_old.party_size <> p_party_size then v_changed := array_append(v_changed, 'party_size'); end if;
    if v_old.customer_name <> btrim(p_customer_name) then v_changed := array_append(v_changed, 'name'); end if;
    if v_old.phone_e164 is distinct from v_phone then v_changed := array_append(v_changed, 'phone'); end if;
    if v_old.email is distinct from v_email then v_changed := array_append(v_changed, 'email'); end if;
    if v_old.language <> p_language then v_changed := array_append(v_changed, 'language'); end if;
    if v_old.notes is distinct from v_notes then v_changed := array_append(v_changed, 'notes'); end if;

    update public.reservations set
      shift_id = v_class.shift_id, date = p_date, time = p_time, starts_at = v_starts, party_size = p_party_size,
      customer_name = btrim(p_customer_name), phone_e164 = v_phone, email = v_email, notes = v_notes,
      language = p_language, status = v_status, updated_at = now()
    where id = v_old.id;

    perform public.reservation_recompute_duplicates(p_establishment_id, p_date);
    if v_old.date <> p_date then
      perform public.reservation_recompute_duplicates(p_establishment_id, v_old.date);
    end if;

    v_data := jsonb_build_object('changed', to_jsonb(v_changed));
    if v_old.date <> p_date then v_data := v_data || jsonb_build_object('date_from', v_old.date, 'date_to', p_date); end if;
    if v_old.time <> p_time then v_data := v_data || jsonb_build_object('time_from', v_old.time, 'time_to', p_time); end if;
    if v_old.party_size <> p_party_size then
      v_data := v_data || jsonb_build_object('party_size_from', v_old.party_size, 'party_size_to', p_party_size);
    end if;
    if v_status <> v_old.status then
      v_data := v_data || jsonb_build_object('status_from', v_old.status, 'status_to', v_status);
    end if;
    perform public.reservation_log_event(p_establishment_id, v_old.id, 'updated', v_actor, v_old.platform_name, v_data);
    perform public.reservation_audit(p_establishment_id, 'updated', v_old.id,
      jsonb_build_object('date', v_old.date, 'time', v_old.time, 'party_size', v_old.party_size, 'status', v_old.status),
      jsonb_build_object('date', p_date, 'time', p_time, 'party_size', p_party_size, 'status', v_status));
    v_new_id := v_old.id;
    -- El agente que sube una confirmada al umbral la deja pendiente: aviso de grupo pendiente.
    if v_status = 'pending' and v_old.status <> 'pending' then
      perform public.reservations_notify_team(p_establishment_id, v_old.id, 'reservation_group_pending',
        'reservation_group_pending:' || v_old.id::text);
    end if;
  else
    insert into public.reservations (
      space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, email, notes,
      language, status, source, platform_name, is_new, whatsapp_consent, created_by_user_id, idempotency_key
    ) values (
      v_space_id, p_establishment_id, v_class.shift_id, p_date, p_time, v_starts, p_party_size, btrim(p_customer_name),
      v_phone, v_email, v_notes, p_language, v_status, v_source,
      case when v_source = 'platform' then p_platform_name end,
      v_source <> 'manual', coalesce(p_whatsapp_consent, false) or v_source = 'manual',
      case when v_actor in ('member', 'restavor_support') then auth.uid() end, p_idempotency_key
    ) returning id into v_new_id;

    perform public.reservation_recompute_duplicates(p_establishment_id, p_date);
    perform public.reservation_log_event(p_establishment_id, v_new_id, 'created', v_actor, p_platform_name,
      jsonb_build_object('source', v_source, 'status', v_status, 'date', p_date, 'time', p_time, 'party_size', p_party_size,
                         'shift_id', v_class.shift_id));
    perform public.reservation_audit(p_establishment_id, 'created', v_new_id, null,
      jsonb_build_object('source', v_source, 'status', v_status, 'date', p_date, 'time', p_time, 'party_size', p_party_size));
    -- Una reserva que no es del restaurante (agente, web, plataforma) avisa en la campana; un grupo pendiente, con su propio aviso.
    if v_source <> 'manual' then
      perform public.reservations_notify_team(p_establishment_id, v_new_id,
        case when v_status = 'pending' then 'reservation_group_pending' else 'reservation_new' end,
        case when v_status = 'pending' then 'reservation_group_pending:' else 'reservation_new:' end || v_new_id::text);
    end if;
  end if;

  return jsonb_build_object('outcome', 'accepted', 'reservation_id', v_new_id, 'status', v_status, 'shift_id', v_class.shift_id,
                            'out_of_shift', v_class.shift_id is null, 'over_capacity_by', v_over);
end;
$$;

revoke all on function public.book_reservation(uuid, uuid, date, time, integer, text, text, text, text, text, text, boolean, text, boolean, text) from public, anon;
grant execute on function public.book_reservation(uuid, uuid, date, time, integer, text, text, text, text, text, text, boolean, text, boolean, text) to authenticated, service_role;

-- ------------------------------------------------------------
-- 4 · Confirmar, rechazar, cancelar, "No vino", duplicadas, abrir la ficha
-- ------------------------------------------------------------

-- Lee y bloquea la reserva de un restaurante, o falla si no es de él.
create or replace function public.reservation_for_update(p_establishment_id uuid, p_reservation_id uuid)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.reservations%rowtype;
  v_date date;
begin
  -- El día primero, la fila después (ver `reservation_lock_day`): si no, dos órdenes sobre el mismo día se esperan
  -- una a otra (una tiene la fila y pide recalcular las duplicadas, que toca la fila de la otra).
  select r.date into v_date from public.reservations r
  where r.id = p_reservation_id and r.establishment_id = p_establishment_id;
  if not found then
    raise exception 'Reserva no encontrada';
  end if;
  perform public.reservation_lock_day(p_establishment_id, v_date);
  select * into v_row from public.reservations
  where id = p_reservation_id and establishment_id = p_establishment_id for update;
  if not found then
    raise exception 'Reserva no encontrada';
  end if;
  if v_row.date <> v_date then
    perform public.reservation_lock_day(p_establishment_id, v_row.date);
  end if;
  return v_row;
end;
$$;

revoke all on function public.reservation_for_update(uuid, uuid) from public, anon, authenticated;

-- Cambia el estado de una reserva con su evento y su auditoría. Interna.
create or replace function public.reservation_set_status(
  p_row public.reservations, p_status text, p_event text, p_actor text, p_cancel_reason text default null,
  p_extra jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reservations set
    status = p_status,
    cancel_reason = case when p_status = 'cancelled' then p_cancel_reason else null end,
    cancelled_at = case when p_status = 'cancelled' then now() else null end,
    pending_platform_cancel = case when p_status = 'cancelled' then (p_row.source = 'platform' and p_cancel_reason is distinct from 'platform') else false end,
    updated_at = now()
  where id = p_row.id;

  perform public.reservation_recompute_duplicates(p_row.establishment_id, p_row.date);
  perform public.reservation_log_event(p_row.establishment_id, p_row.id, p_event, p_actor, p_row.platform_name,
    jsonb_build_object('status_from', p_row.status, 'status_to', p_status) || p_extra);
  perform public.reservation_audit(p_row.establishment_id, p_event, p_row.id,
    jsonb_build_object('status', p_row.status), jsonb_build_object('status', p_status) || p_extra);
end;
$$;

revoke all on function public.reservation_set_status(public.reservations, text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.confirm_reservation(p_establishment_id uuid, p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_actor_type(p_establishment_id);
  v_row public.reservations;
  v_status text;
begin
  perform public.reservation_require_agenda(p_establishment_id);
  v_row := public.reservation_for_update(p_establishment_id, p_reservation_id);
  if v_row.status = 'confirmed' then
    return jsonb_build_object('outcome', 'unchanged', 'status', 'confirmed');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'invalid_transition');
  end if;
  perform public.reservation_set_status(v_row, 'confirmed', 'confirmed', v_actor);
  return jsonb_build_object('outcome', 'done', 'status', 'confirmed');
end;
$$;

create or replace function public.reject_reservation(p_establishment_id uuid, p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_actor_type(p_establishment_id);
  v_row public.reservations;
  v_status text;
begin
  perform public.reservation_require_agenda(p_establishment_id);
  v_row := public.reservation_for_update(p_establishment_id, p_reservation_id);
  if v_row.status = 'cancelled' and v_row.cancel_reason = 'rejected' then
    return jsonb_build_object('outcome', 'unchanged', 'status', 'cancelled');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'invalid_transition');
  end if;
  perform public.reservation_set_status(v_row, 'cancelled', 'rejected', v_actor, 'rejected');
  return jsonb_build_object('outcome', 'done', 'status', 'cancelled');
end;
$$;

create or replace function public.cancel_reservation(p_establishment_id uuid, p_reservation_id uuid, p_reason text default 'other')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_actor_type(p_establishment_id);
  v_row public.reservations;
  v_status text;
begin
  -- Con sesión de usuario solo los tres motivos de la ficha (§6.9); el servidor, además, el
  -- del agente, el del enlace del cliente y el de la plataforma.
  if p_reason not in ('customer', 'error', 'other')
     and not (auth.uid() is null and p_reason in ('agent', 'customer_link', 'platform')) then
    raise exception 'Motivo de cancelación no válido';
  end if;
  perform public.reservation_require_agenda(p_establishment_id);
  v_row := public.reservation_for_update(p_establishment_id, p_reservation_id);
  if v_row.status = 'cancelled' then
    return jsonb_build_object('outcome', 'unchanged', 'status', 'cancelled');
  end if;
  if v_row.status not in ('pending', 'confirmed') then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'invalid_transition');
  end if;
  perform public.reservation_set_status(v_row, 'cancelled', 'cancelled', v_actor, p_reason, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('outcome', 'done', 'status', 'cancelled',
                            'pending_platform_cancel', v_row.source = 'platform' and p_reason <> 'platform');
end;
$$;

-- "Hecho": ya la cancelé también en la plataforma (§6.9).
create or replace function public.mark_platform_cancel_done(p_establishment_id uuid, p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_actor_type(p_establishment_id);
  v_row public.reservations;
begin
  perform public.reservation_require_agenda(p_establishment_id);
  v_row := public.reservation_for_update(p_establishment_id, p_reservation_id);
  if not v_row.pending_platform_cancel then
    return jsonb_build_object('outcome', 'unchanged');
  end if;
  update public.reservations set pending_platform_cancel = false, updated_at = now() where id = v_row.id;
  perform public.reservation_log_event(p_establishment_id, v_row.id, 'platform_cancel_done', v_actor, v_row.platform_name);
  return jsonb_build_object('outcome', 'done');
end;
$$;

-- "No vino" (RN-RES-09): solo una confirmada y solo cuando ya pasó la hora.
create or replace function public.mark_no_show(p_establishment_id uuid, p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_actor_type(p_establishment_id);
  v_row public.reservations;
  v_status text;
begin
  perform public.reservation_require_agenda(p_establishment_id);
  v_row := public.reservation_for_update(p_establishment_id, p_reservation_id);
  if v_row.status = 'no_show' then
    return jsonb_build_object('outcome', 'unchanged', 'status', 'no_show');
  end if;
  if v_row.status <> 'confirmed' then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'invalid_transition');
  end if;
  if now() < v_row.starts_at then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'not_yet_started', 'available_from', to_char(v_row.time, 'HH24:MI'));
  end if;
  perform public.reservation_set_status(v_row, 'no_show', 'no_show', v_actor);
  return jsonb_build_object('outcome', 'done', 'status', 'no_show');
end;
$$;

-- Deshacer "No vino": solo el mismo día, en la zona del restaurante.
create or replace function public.undo_no_show(p_establishment_id uuid, p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_actor_type(p_establishment_id);
  v_row public.reservations;
  v_tz text;
begin
  v_tz := public.reservation_require_agenda(p_establishment_id);
  v_row := public.reservation_for_update(p_establishment_id, p_reservation_id);
  if v_row.status = 'confirmed' then
    return jsonb_build_object('outcome', 'unchanged', 'status', 'confirmed');
  end if;
  if v_row.status <> 'no_show' then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'invalid_transition');
  end if;
  if (now() at time zone v_tz)::date <> v_row.date then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'not_same_day');
  end if;
  perform public.reservation_set_status(v_row, 'confirmed', 'no_show_undone', v_actor);
  return jsonb_build_object('outcome', 'done', 'status', 'confirmed');
end;
$$;

-- "No es duplicada" (RN-RES-06): guarda el par ordenado y recalcula.
create or replace function public.dismiss_duplicate(p_establishment_id uuid, p_reservation_a uuid, p_reservation_b uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_actor_type(p_establishment_id);
  v_a uuid := least(p_reservation_a, p_reservation_b);
  v_b uuid := greatest(p_reservation_a, p_reservation_b);
  v_date date;
  v_inserted integer;
begin
  perform public.reservation_require_agenda(p_establishment_id);
  if v_a = v_b then
    raise exception 'Hacen falta dos reservas distintas';
  end if;
  if (select count(*) from public.reservations where id in (v_a, v_b) and establishment_id = p_establishment_id) <> 2 then
    raise exception 'Reserva no encontrada';
  end if;
  select date into v_date from public.reservations where id = v_a;
  -- Una pareja de posibles duplicadas es del mismo día (RN-RES-06).
  if (select date from public.reservations where id = v_b) <> v_date then
    raise exception 'Las dos reservas tienen que ser del mismo día';
  end if;
  perform public.reservation_lock_day(p_establishment_id, v_date);
  insert into public.reservation_duplicate_dismissals (space_id, establishment_id, reservation_a, reservation_b, dismissed_by)
  values (public.establishment_space_id(p_establishment_id), p_establishment_id, v_a, v_b,
          case when v_actor in ('member', 'restavor_support') then auth.uid() end)
  on conflict (reservation_a, reservation_b) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('outcome', 'unchanged');
  end if;
  perform public.reservation_recompute_duplicates(p_establishment_id, v_date);
  perform public.reservation_log_event(p_establishment_id, v_a, 'duplicate_dismissed', v_actor, null, jsonb_build_object('other', v_b));
  perform public.reservation_log_event(p_establishment_id, v_b, 'duplicate_dismissed', v_actor, null, jsonb_build_object('other', v_a));
  perform public.reservation_audit(p_establishment_id, 'duplicate_dismissed', v_a, null, jsonb_build_object('other', v_b));
  return jsonb_build_object('outcome', 'done');
end;
$$;

-- Abrir la ficha quita "Nueva" (RN-RES-02 §6.1) y lo deja en el historial.
create or replace function public.open_reservation(p_establishment_id uuid, p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_actor_type(p_establishment_id);
  v_row public.reservations;
begin
  perform public.reservation_require_agenda(p_establishment_id);
  v_row := public.reservation_for_update(p_establishment_id, p_reservation_id);
  if not v_row.is_new then
    return jsonb_build_object('outcome', 'unchanged');
  end if;
  update public.reservations set is_new = false where id = v_row.id;
  perform public.reservation_log_event(p_establishment_id, v_row.id, 'opened', v_actor, v_row.platform_name);
  return jsonb_build_object('outcome', 'done');
end;
$$;

do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.confirm_reservation(uuid, uuid)',
    'public.reject_reservation(uuid, uuid)',
    'public.cancel_reservation(uuid, uuid, text)',
    'public.mark_platform_cancel_done(uuid, uuid)',
    'public.mark_no_show(uuid, uuid)',
    'public.undo_no_show(uuid, uuid)',
    'public.dismiss_duplicate(uuid, uuid, uuid)',
    'public.open_reservation(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5 · Horarios y ajustes (RN-RES-01)
-- ------------------------------------------------------------

-- Cuántas reservas futuras activas dejaría sin sitio un cambio de turnos (§6.2). Cuenta,
-- no enseña: la usa `save_reservation_shifts` con quien puede cambiar horarios aunque no
-- lea datos de comensales. «Futura» es la que todavía no ha empezado: una reserva de hoy a
-- las 13:00 ya servida no impide quitar el turno de comida (si no, la única salida sería
-- cancelarla o marcarla «No vino», que falsea «Ha venido / ha fallado»).
create or replace function public.reservations_affected_by_schedule(
  p_establishment_id uuid, p_shifts jsonb
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with new_shifts as (
    select (e ->> 'id')::uuid as id,
           coalesce((e ->> 'active')::boolean, true) as active,
           array(select jsonb_array_elements_text(e -> 'weekdays')::smallint) as weekdays
    from jsonb_array_elements(p_shifts) e
    where e ? 'id' and nullif(e ->> 'id', '') is not null
  )
  select count(*)::integer
  from public.reservations r
  left join new_shifts n on n.id = r.shift_id
  where r.establishment_id = p_establishment_id and r.starts_at > now()
    and r.status in ('pending', 'confirmed') and r.shift_id is not null
    and (n.id is null or not n.active or not (extract(isodow from r.date)::smallint = any (n.weekdays)));
$$;

revoke all on function public.reservations_affected_by_schedule(uuid, jsonb) from public, anon, authenticated;

create or replace function public.save_reservation_shifts(p_establishment_id uuid, p_shifts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_settings_actor(p_establishment_id);
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_settings public.reservation_settings%rowtype;
  v_el jsonb;
  v_idx integer := 0;
  v_affected integer;
  v_weekdays smallint[];
  v_id uuid;
  v_name text;
  v_start time;
  v_last time;
  v_end time;
  v_capacity integer;
  v_active boolean;
  v_ids uuid[] := '{}';
  v_a record;
begin
  select * into v_settings from public.reservation_settings where establishment_id = p_establishment_id;
  if not found or v_settings.service_status = 'closed' then
    raise exception 'Este restaurante no tiene Reservas disponibles';
  end if;
  if jsonb_typeof(p_shifts) <> 'array' then
    raise exception 'Los turnos tienen que ser una lista';
  end if;
  -- El restaurante en exclusivo (ver `reservation_lock_day`): espera a las altas y cambios en curso y
  -- las siguientes esperan a que termine, así ninguna reserva cae en un turno que se está quitando.
  perform public.reservation_lock_schedule(p_establishment_id);

  -- Validación de cada turno (RN-RES-01).
  for v_el in select * from jsonb_array_elements(p_shifts) loop
    v_name := btrim(coalesce(v_el ->> 'name', ''));
    v_weekdays := array(select jsonb_array_elements_text(v_el -> 'weekdays')::smallint);
    v_start := (v_el ->> 'start_time')::time;
    v_last := (v_el ->> 'last_booking_time')::time;
    v_end := (v_el ->> 'end_time')::time;
    v_capacity := (v_el ->> 'capacity')::integer;
    v_active := coalesce((v_el ->> 'active')::boolean, true);
    if v_name = '' or char_length(v_name) > 60 then
      return jsonb_build_object('outcome', 'invalid', 'issue', 'name_empty');
    end if;
    if coalesce(array_length(v_weekdays, 1), 0) = 0 or exists (select 1 from unnest(v_weekdays) d where d < 1 or d > 7) then
      return jsonb_build_object('outcome', 'invalid', 'issue', 'weekdays_empty');
    end if;
    if v_capacity is null or v_capacity <= 0 then
      return jsonb_build_object('outcome', 'invalid', 'issue', 'capacity_not_positive');
    end if;
    if not (v_start < v_last) then
      return jsonb_build_object('outcome', 'invalid', 'issue', 'start_not_before_last_booking');
    end if;
    if not (v_last <= v_end) then
      return jsonb_build_object('outcome', 'invalid', 'issue', 'last_booking_after_end');
    end if;
  end loop;

  -- Dos turnos activos del mismo día no se solapan en horas de reserva.
  if exists (
    select 1
    from jsonb_array_elements(p_shifts) with ordinality a(e, i)
    join jsonb_array_elements(p_shifts) with ordinality b(e, j) on a.i < b.j
    where coalesce((a.e ->> 'active')::boolean, true) and coalesce((b.e ->> 'active')::boolean, true)
      and array(select jsonb_array_elements_text(a.e -> 'weekdays')::smallint) && array(select jsonb_array_elements_text(b.e -> 'weekdays')::smallint)
      and (a.e ->> 'start_time')::time <= (b.e ->> 'last_booking_time')::time
      and (b.e ->> 'start_time')::time <= (a.e ->> 'last_booking_time')::time
  ) then
    return jsonb_build_object('outcome', 'invalid', 'issue', 'overlap');
  end if;

  -- No se quita un turno, ni un día, si hay reservas futuras activas afectadas (§6.2).
  v_affected := public.reservations_affected_by_schedule(p_establishment_id, p_shifts);
  if v_affected > 0 then
    return jsonb_build_object('outcome', 'blocked', 'affected', v_affected);
  end if;

  -- Aplicar: los de la lista se actualizan o se crean; los que ya no están se desactivan
  -- (los turnos no se borran: hay reservas que los citan).
  for v_el in select * from jsonb_array_elements(p_shifts) loop
    v_idx := v_idx + 1;
    v_id := nullif(v_el ->> 'id', '')::uuid;
    v_weekdays := array(select jsonb_array_elements_text(v_el -> 'weekdays')::smallint order by 1);
    if v_id is not null then
      update public.reservation_shifts set
        name = btrim(v_el ->> 'name'), weekdays = v_weekdays, start_time = (v_el ->> 'start_time')::time,
        last_booking_time = (v_el ->> 'last_booking_time')::time, end_time = (v_el ->> 'end_time')::time,
        capacity = (v_el ->> 'capacity')::integer, active = coalesce((v_el ->> 'active')::boolean, true),
        sort_order = v_idx, updated_at = now()
      where id = v_id and establishment_id = p_establishment_id;
      if not found then
        raise exception 'Turno no encontrado';
      end if;
    else
      insert into public.reservation_shifts (space_id, establishment_id, name, weekdays, start_time, last_booking_time,
                                             end_time, capacity, sort_order, active)
      values (v_space_id, p_establishment_id, btrim(v_el ->> 'name'), v_weekdays, (v_el ->> 'start_time')::time,
              (v_el ->> 'last_booking_time')::time, (v_el ->> 'end_time')::time, (v_el ->> 'capacity')::integer, v_idx,
              coalesce((v_el ->> 'active')::boolean, true))
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;
  update public.reservation_shifts set active = false, updated_at = now()
  where establishment_id = p_establishment_id and active and not (id = any (v_ids));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'reservations.schedule_saved', 'establishment', p_establishment_id,
          jsonb_build_object('shifts', jsonb_array_length(p_shifts), 'actor', v_actor));
  -- Los identificadores, en el orden de la lista: un turno nuevo ya existe y el siguiente «Guardar» lo actualiza en vez de crear otro.
  return jsonb_build_object('outcome', 'saved', 'shift_ids', to_jsonb(v_ids));
end;
$$;

create or replace function public.set_reservation_closed_date(
  p_establishment_id uuid, p_date date, p_reason text, p_closed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_settings_actor(p_establishment_id);
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_settings public.reservation_settings%rowtype;
  v_today date;
  v_affected integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_settings from public.reservation_settings where establishment_id = p_establishment_id;
  if not found or v_settings.service_status = 'closed' then
    raise exception 'Este restaurante no tiene Reservas disponibles';
  end if;
  v_today := (now() at time zone v_settings.timezone)::date;
  perform public.reservation_lock_schedule(p_establishment_id);
  perform public.reservation_lock_day(p_establishment_id, p_date);

  if p_closed then
    if p_date < v_today then
      return jsonb_build_object('outcome', 'rejected', 'reason', 'past_date');
    end if;
    if v_reason is null or char_length(v_reason) > 200 then
      return jsonb_build_object('outcome', 'invalid', 'issue', 'reason_empty');
    end if;
    -- Ya cerrado a propósito: solo cambia el motivo.
    if not exists (select 1 from public.reservation_closed_dates where establishment_id = p_establishment_id and date = p_date and removed_at is null) then
      select count(*)::integer into v_affected from public.reservations
      where establishment_id = p_establishment_id and date = p_date and status in ('pending', 'confirmed') and starts_at > now();
      if v_affected > 0 then
        return jsonb_build_object('outcome', 'blocked', 'affected', v_affected);
      end if;
    end if;
    insert into public.reservation_closed_dates (space_id, establishment_id, date, reason)
    values (v_space_id, p_establishment_id, p_date, v_reason)
    on conflict (establishment_id, date) do update set reason = excluded.reason, removed_at = null;
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (v_space_id, auth.uid(), 'reservations.closed_date_set', 'establishment', p_establishment_id,
            jsonb_build_object('date', p_date, 'reason', v_reason, 'actor', v_actor));
  else
    -- Reabrir un día no borra su fila (CLAUDE.md): la marca como quitada y queda en la auditoría.
    update public.reservation_closed_dates set removed_at = now()
    where establishment_id = p_establishment_id and date = p_date and removed_at is null;
    if not found then
      return jsonb_build_object('outcome', 'unchanged');
    end if;
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value)
    values (v_space_id, auth.uid(), 'reservations.closed_date_removed', 'establishment', p_establishment_id,
            jsonb_build_object('date', p_date, 'actor', v_actor));
  end if;
  return jsonb_build_object('outcome', 'saved');
end;
$$;

create or replace function public.save_reservation_settings(
  p_establishment_id uuid,
  p_slot_interval_minutes integer,
  p_large_group_threshold integer,
  p_min_notice_minutes integer,
  p_max_advance_days integer,
  p_customer_cancel_limit_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_settings_actor(p_establishment_id);
  v_old public.reservation_settings%rowtype;
begin
  perform public.reservation_lock_schedule(p_establishment_id);
  select * into v_old from public.reservation_settings where establishment_id = p_establishment_id for update;
  if not found or v_old.service_status = 'closed' then
    raise exception 'Este restaurante no tiene Reservas disponibles';
  end if;
  if p_slot_interval_minutes not in (15, 30) then
    return jsonb_build_object('outcome', 'invalid', 'issue', 'slot_interval');
  end if;
  if p_large_group_threshold is null or p_large_group_threshold < 2 then
    return jsonb_build_object('outcome', 'invalid', 'issue', 'large_group_threshold');
  end if;
  if p_min_notice_minutes is null or p_min_notice_minutes < 0 then
    return jsonb_build_object('outcome', 'invalid', 'issue', 'min_notice');
  end if;
  if p_max_advance_days is null or p_max_advance_days < 1 then
    return jsonb_build_object('outcome', 'invalid', 'issue', 'max_advance');
  end if;
  if p_customer_cancel_limit_minutes is null or p_customer_cancel_limit_minutes < 0 then
    return jsonb_build_object('outcome', 'invalid', 'issue', 'customer_cancel_limit');
  end if;
  update public.reservation_settings set
    slot_interval_minutes = p_slot_interval_minutes, large_group_threshold = p_large_group_threshold,
    min_notice_minutes = p_min_notice_minutes, max_advance_days = p_max_advance_days,
    customer_cancel_limit_minutes = p_customer_cancel_limit_minutes, updated_at = now()
  where id = v_old.id;
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_old.space_id, auth.uid(), 'reservations.settings_saved', 'establishment', p_establishment_id,
          jsonb_build_object('slot_interval_minutes', v_old.slot_interval_minutes, 'large_group_threshold', v_old.large_group_threshold,
                             'min_notice_minutes', v_old.min_notice_minutes, 'max_advance_days', v_old.max_advance_days,
                             'customer_cancel_limit_minutes', v_old.customer_cancel_limit_minutes),
          jsonb_build_object('slot_interval_minutes', p_slot_interval_minutes, 'large_group_threshold', p_large_group_threshold,
                             'min_notice_minutes', p_min_notice_minutes, 'max_advance_days', p_max_advance_days,
                             'customer_cancel_limit_minutes', p_customer_cancel_limit_minutes, 'actor', v_actor));
  return jsonb_build_object('outcome', 'saved');
end;
$$;

-- Primer uso terminado (RES-13). Pide al menos un turno activo.
create or replace function public.complete_reservations_onboarding(p_establishment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_settings_actor(p_establishment_id);
  v_row public.reservation_settings%rowtype;
begin
  select * into v_row from public.reservation_settings where establishment_id = p_establishment_id for update;
  if not found or v_row.service_status = 'closed' then
    raise exception 'Este restaurante no tiene Reservas disponibles';
  end if;
  if v_row.onboarding_completed_at is not null then
    return jsonb_build_object('outcome', 'unchanged');
  end if;
  if not exists (select 1 from public.reservation_shifts where establishment_id = p_establishment_id and active) then
    return jsonb_build_object('outcome', 'rejected', 'reason', 'no_shifts');
  end if;
  update public.reservation_settings set onboarding_completed_at = now(), updated_at = now() where id = v_row.id;
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_row.space_id, auth.uid(), 'reservations.onboarding_completed', 'establishment', p_establishment_id,
          jsonb_build_object('actor', v_actor));
  return jsonb_build_object('outcome', 'saved');
end;
$$;

do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.save_reservation_shifts(uuid, jsonb)',
    'public.set_reservation_closed_date(uuid, date, text, boolean)',
    'public.save_reservation_settings(uuid, integer, integer, integer, integer, integer)',
    'public.complete_reservations_onboarding(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 6 · Lecturas
-- ------------------------------------------------------------

-- Sin tildes y en minúsculas, para buscar "andres" y encontrar "Andrés" y "joao" y encontrar "João":
-- descompone cada letra (NFD) y quita las marcas, igual que `fold()` de `core/reservations/search.ts`,
-- así que la base de datos y la pantalla no discrepan (la letra «ł» no se descompone y se queda como está en las dos).
create or replace function public.reservations_fold(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(normalize(coalesce(p_text, ''), nfd), '[\u0300-\u036f]', '', 'g'));
$$;

revoke all on function public.reservations_fold(text) from public, anon;
grant execute on function public.reservations_fold(text) to authenticated, service_role;

-- RES-09 · buscar por nombre o por teléfono (bastan los 3 últimos números), en los últimos
-- 30 días y todas las futuras. SECURITY INVOKER: el permiso lo pone la RLS de `reservations`
-- (decisión 108), y solo lee columnas con privilegio.
create or replace function public.reservations_search(p_establishment_id uuid, p_query text)
returns table (
  id uuid, date date, "time" time, customer_name text, phone_e164 text, party_size integer,
  status text, source text, platform_name text, duplicate_flag text
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_text text := btrim(coalesce(p_query, ''));
  v_digits text;
  v_tz text;
  v_today date;
  v_from date;
  v_like text;
begin
  select s.timezone into v_tz from public.reservation_settings s where s.establishment_id = p_establishment_id;
  if v_tz is null then
    return;
  end if;
  v_today := (now() at time zone v_tz)::date;
  v_from := v_today - 30;

  if v_text ~ '^[+0-9\s.()\-]+$' then
    v_digits := regexp_replace(v_text, '\D', '', 'g');
    if char_length(v_digits) < 3 then
      return;
    end if;
    return query
      select r.id, r.date, r.time, r.customer_name, r.phone_e164, r.party_size, r.status, r.source, r.platform_name, r.duplicate_flag
      from public.reservations r
      where r.establishment_id = p_establishment_id and r.date >= v_from and r.phone_e164 like '%' || v_digits
      -- Los 200 más cercanos a hoy (futuras y pasadas): si hubiera más, se pierden las más lejanas, no las de mañana.
      order by abs(r.date - v_today), r.date, r.time limit 200;
  elsif char_length(v_text) >= 2 then
    -- El texto buscado no es un patrón: `%` y `_` son letras, no comodines.
    v_like := replace(replace(replace(public.reservations_fold(v_text), '\', '\\'), '%', '\%'), '_', '\_');
    return query
      select r.id, r.date, r.time, r.customer_name, r.phone_e164, r.party_size, r.status, r.source, r.platform_name, r.duplicate_flag
      from public.reservations r
      where r.establishment_id = p_establishment_id and r.date >= v_from
        and public.reservations_fold(r.customer_name) like '%' || v_like || '%' escape '\'
      order by abs(r.date - v_today), r.date, r.time limit 200;
  end if;
end;
$$;

revoke all on function public.reservations_search(uuid, text) from public, anon;
grant execute on function public.reservations_search(uuid, text) to authenticated;

-- RES-10 · el calendario del mes, agregado (un `select` de PostgREST se cortaría en 1000 filas).
create or replace function public.reservations_calendar(p_establishment_id uuid, p_month date)
returns table (date date, source text, status text, reservations integer, people integer)
language sql
stable
set search_path = public
as $$
  select r.date, r.source, r.status, count(*)::integer, sum(r.party_size)::integer
  from public.reservations r
  where r.establishment_id = p_establishment_id
    and r.date >= date_trunc('month', p_month)::date
    and r.date < (date_trunc('month', p_month) + interval '1 month')::date
    and r.status in ('pending', 'confirmed')
  group by r.date, r.source, r.status
  order by r.date;
$$;

revoke all on function public.reservations_calendar(uuid, date) from public, anon;
grant execute on function public.reservations_calendar(uuid, date) to authenticated;

-- El historial legible de una reserva: quién hizo qué, con el nombre de quien es del
-- restaurante y las etiquetas genéricas del resto ("Agente", "Web", "Restavor (soporte)").
-- Nunca el identificador interno de nadie del equipo de Restavor (P7).
create or replace function public.reservation_history(p_establishment_id uuid, p_reservation_id uuid)
returns table (id uuid, type text, actor_type text, actor_name text, data jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.reservations_can_read(p_establishment_id) then
    raise exception 'No tienes acceso a las reservas de este restaurante';
  end if;
  return query
    select e.id, e.type, e.actor_type,
           case e.actor_type
             when 'member' then (select p.full_name from public.profiles p where p.id = e.actor_user_id)
             when 'staff' then (select st.name from public.reservation_staff st where st.id = e.actor_staff_id)
             else e.actor_label
           end,
           e.data, e.created_at
    from public.reservation_events e
    where e.establishment_id = p_establishment_id and e.reservation_id = p_reservation_id
    order by e.created_at, e.id;
end;
$$;

revoke all on function public.reservation_history(uuid, uuid) from public, anon;
grant execute on function public.reservation_history(uuid, uuid) to authenticated;
