-- Fase D de Restavor agents · Equipo con PIN, tablet del local y soporte
-- (EQU-01, EQU-02, SOP-01; PRD de agents §3.3, §3.4 y §8.3).
--
-- Las tablas de personas y dispositivos existen desde la 162 pero nadie escribía en
-- ellas. Esta migración les da su única vía de escritura (funciones SECURITY DEFINER,
-- como la agenda: decisión 112) y enseña a la agenda quién del Equipo actúa:
--
--   1 · Columnas nuevas: la clave de idempotencia del Equipo, el escalado del bloqueo de
--       PIN y quién del Equipo descartó una pareja de duplicadas.
--   2 · Funciones internas: quién es el Equipo que actúa, el rol de una persona en un
--       restaurante sin depender de su sesión, el tiempo de bloqueo por rondas.
--   3 · La agenda aprende a anotar al Equipo: `reservations_actor_type`,
--       `reservations_settings_actor`, `reservation_log_event`, `reservation_audit`,
--       `book_reservation` y `dismiss_duplicate` se vuelven a crear con el cambio mínimo
--       (una función no se edita a trozos; la 169 no se toca).
--   4 · Equipo: `add_reservation_staff`, `set_reservation_staff_pin`,
--       `remove_reservation_staff`, `set_my_reservation_pin`, `reservation_people`.
--   5 · Dispositivos: `activate_reservation_device`, `revoke_reservation_device` y, solo
--       para el servidor, `reservation_device_resolve`, `reservation_device_identify`
--       (PIN, bloqueo escalado) y `reservation_device_act` (una sola puerta que valida
--       dispositivo y PIN y llama a la MISMA función de la agenda, para que aforo,
--       bloqueos e idempotencia sean idénticos).
--   6 · Soporte de Reservas: abrir y cerrar la sesión (segundo paso, marca y motivo) y la
--       lista de restaurantes que se pueden abrir.
--   7 · Historial de Reservas del restaurante: ajustes, Equipo, dispositivos, bloqueos y
--       sesiones de soporte, sin el identificador de nadie del equipo de Restavor (P7).
--
-- El PIN llega siempre como HMAC hexadecimal calculado por el servidor con
-- `AGENTS_PIN_SECRET`: la base nunca ve un PIN en claro.
--
-- Cómo actúa el Equipo (decisión 121): el servidor valida el token del dispositivo y el PIN
-- y llama a `reservation_device_act`. Si el PIN es de un Propietario o Encargado, esa única
-- llamada corre «como esa persona» (la sesión de la transacción cambia a su usuario, solo
-- dentro de la función); si es del Equipo, se deja constancia en un ajuste local
-- (`restavor.device_staff`) que `reservations_actor_type` convierte en `staff`.
-- Ninguno de los dos ajustes se puede poner desde PostgREST.
--
-- Se comprueba con `supabase/tests/reservas_equipo_tablet_soporte.sql` (suite 92).

-- ------------------------------------------------------------
-- 1 · Columnas
-- ------------------------------------------------------------
alter table public.reservation_staff add column idempotency_key text;

create unique index reservation_staff_idempotency_idx
  on public.reservation_staff (establishment_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.reservation_staff.idempotency_key is
  'Clave del alta: pulsar dos veces "Añadir persona" crea una sola. Sin privilegio de select: solo la lee el servidor.';

-- Los fallos de PIN escalan: la primera tanda de 5 bloquea 1 minuto, la segunda 5, la tercera 30
-- y de la cuarta en adelante 2 horas (decisión 122). Se olvida tras 24 horas sin fallos.
alter table public.reservation_pin_attempts
  add column lock_rounds smallint not null default 0 check (lock_rounds >= 0),
  add column last_failed_at timestamptz;

alter table public.reservation_duplicate_dismissals
  add column dismissed_by_staff_id uuid references public.reservation_staff (id);

-- ------------------------------------------------------------
-- 2 · Funciones internas
-- ------------------------------------------------------------

-- El Equipo que actúa en esta transacción, o nulo. Solo vale sin sesión de usuario (el servidor) y
-- para el restaurante para el que `reservation_device_act` lo puso.
create or replace function public.reservations_device_staff(p_establishment_id uuid)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_ctx text := coalesce(current_setting('restavor.device_staff', true), '');
begin
  if auth.uid() is not null or v_ctx = '' or position('|' in v_ctx) = 0 then
    return null;
  end if;
  if split_part(v_ctx, '|', 2) <> p_establishment_id::text then
    return null;
  end if;
  return nullif(split_part(v_ctx, '|', 1), '')::uuid;
end;
$$;

revoke all on function public.reservations_device_staff(uuid) from public, anon, authenticated;

-- El rol de una persona en un restaurante, sin depender de su sesión: lo mismo que contesta
-- `reservations_my_role()` para `auth.uid()`. Lo usa el PIN: al quitar a alguien del restaurante o
-- quitarle «Gestionar Reservas», su PIN deja de valer en ese momento (PRD §3.3).
create or replace function public.reservations_role_of(p_user_id uuid, p_establishment_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user_id is null or public.establishment_is_gone(p_establishment_id) then null
    when exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id and em.user_id = p_user_id
        and em.revoked_at is null and em.role = 'local_owner'
    ) or exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id and gm.user_id = p_user_id
        and gm.revoked_at is null and gm.role = 'global_owner'
    ) then 'owner'
    when exists (
      select 1 from public.establishment_memberships em
      join public.establishment_permissions ep on ep.establishment_membership_id = em.id
      where em.establishment_id = p_establishment_id and em.user_id = p_user_id
        and em.revoked_at is null and em.role = 'editor' and ep.manage_reservations
    ) then 'manager'
    else null
  end;
$$;

revoke all on function public.reservations_role_of(uuid, uuid) from public, anon, authenticated;

-- Los segundos de bloqueo de la tanda `p_rounds` (0 = la primera).
create or replace function public.reservation_pin_lock_seconds(p_rounds integer)
returns integer
language sql
immutable
set search_path = public
as $$
  select case when p_rounds <= 0 then 60 when p_rounds = 1 then 300 when p_rounds = 2 then 1800 else 7200 end;
$$;

revoke all on function public.reservation_pin_lock_seconds(integer) from public, anon, authenticated;

-- Quién gestiona el Equipo y los dispositivos (tabla §3.2): el Propietario y el Encargado, el soporte
-- con sesión abierta y el equipo del espacio. Siempre con sesión de usuario: el Equipo con PIN nunca.
create or replace function public.reservations_manage_actor(p_establishment_id uuid)
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
    raise exception 'No tienes permiso para gestionar el Equipo de este restaurante';
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
  raise exception 'No tienes permiso para gestionar el Equipo de este restaurante';
end;
$$;

revoke all on function public.reservations_manage_actor(uuid) from public, anon, authenticated;

-- Una fila de auditoría de Reservas de un restaurante. Sin datos personales de comensales.
create or replace function public.reservations_audit_setting(
  p_establishment_id uuid, p_action text, p_old jsonb, p_new jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.reservations_device_staff(p_establishment_id);
begin
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    public.establishment_space_id(p_establishment_id), auth.uid(),
    case p_action
      when 'staff_added' then 'reservations.staff_added'
      when 'staff_pin_changed' then 'reservations.staff_pin_changed'
      when 'staff_removed' then 'reservations.staff_removed'
      when 'my_pin_set' then 'reservations.my_pin_set'
      when 'device_activated' then 'reservations.device_activated'
      when 'device_revoked' then 'reservations.device_revoked'
      when 'pin_locked' then 'reservations.pin_locked'
      when 'support_session_opened' then 'reservations.support_session_opened'
      when 'support_session_closed' then 'reservations.support_session_closed'
    end,
    'establishment', p_establishment_id, p_old,
    case when v_staff is null then p_new else coalesce(p_new, '{}'::jsonb) || jsonb_build_object('by_staff_id', v_staff) end
  );
end;
$$;

revoke all on function public.reservations_audit_setting(uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3 · La agenda aprende a anotar al Equipo
-- ------------------------------------------------------------

-- Quién hace la operación. Con sesión: 'member' (Propietario o Encargado) o 'restavor_support'. Sin
-- sesión (el servidor): el Equipo con PIN si `reservation_device_act` lo dejó puesto ('staff', siempre
-- manual) o el origen. Cualquier otro: error.
create or replace function public.reservations_actor_type(p_establishment_id uuid, p_source text default 'manual')
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    if public.reservations_device_staff(p_establishment_id) is not null then
      if coalesce(p_source, 'manual') <> 'manual' then
        raise exception 'Con sesión de usuario una reserva siempre es manual';
      end if;
      return 'staff';
    end if;
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

-- Quién cambia los ajustes: el Equipo con PIN, nunca (tabla §3.2: «Ajustes no aparece»).
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
    if coalesce(current_setting('restavor.device_staff', true), '') <> '' then
      raise exception 'El Equipo no puede cambiar los ajustes de Reservas';
    end if;
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

-- Quién del espacio lee la configuración de Reservas (turnos, ajustes, Equipo, dispositivos…): la 161 con una
-- puerta más. Quien tiene abierta una sesión de soporte de Reservas con segundo paso lee la configuración (no los
-- datos de los comensales: esos siguen su propia puerta, `reservations_can_read_diner_data`) de los restaurantes
-- de ESE espacio. Sin esto, alguien de la plataforma con `can_support` que no es miembro del espacio abriría la
-- sesión y vería las reservas pero no los turnos, y Hoy no se podría pintar. No amplía lo que ya podía abrir:
-- la sesión se abre sobre un restaurante concreto de ese espacio.
create or replace function public.reservations_team_can_read(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and not public.space_is_gone(p_space_id)
    and (
      exists (
        select 1 from public.space_memberships m
        where m.space_id = p_space_id and m.user_id = auth.uid()
          and m.status = 'active' and m.role in ('owner', 'admin')
      )
      or public.support_access_level(p_space_id) is not null
      or (
        public.session_is_two_factor()
        and exists (
          select 1 from public.reservation_support_sessions s
          where s.space_id = p_space_id and s.actor_id = auth.uid()
            and s.ended_at is null and s.expires_at > now()
        )
      )
    );
$$;

revoke all on function public.reservations_team_can_read(uuid) from public, anon;
grant execute on function public.reservations_team_can_read(uuid) to authenticated;

-- Un evento de la reserva. Nunca lleva nombre, teléfono, email ni nota (RN-RES-12). El Equipo se
-- anota por su identificador (`actor_staff_id`): el nombre se busca al enseñar el historial.
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
  insert into public.reservation_events (space_id, establishment_id, reservation_id, type, actor_type, actor_user_id, actor_staff_id, actor_label, data)
  values (v_space_id, p_establishment_id, p_reservation_id, p_type, p_actor_type,
          case when p_actor_type in ('member', 'restavor_support') then auth.uid() end,
          case when p_actor_type = 'staff' then public.reservations_device_staff(p_establishment_id) end,
          v_label, coalesce(p_data, '{}'::jsonb));
end;
$$;

revoke all on function public.reservation_log_event(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Auditoría de una operación de la agenda. Sin datos personales. Si actúa el Equipo, el apunte lleva su
-- identificador; si actúa el soporte, la sesión (PRD §3.4: «todo en audit_log con la sesión»).
create or replace function public.reservation_audit(
  p_establishment_id uuid, p_key text, p_reservation_id uuid, p_old jsonb, p_new jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.reservations_device_staff(p_establishment_id);
  v_session uuid;
  v_new jsonb := p_new;
begin
  if v_staff is not null then
    v_new := coalesce(v_new, '{}'::jsonb) || jsonb_build_object('by_staff_id', v_staff);
  elsif auth.uid() is not null
        and not coalesce(public.reservations_my_role(p_establishment_id) in ('owner', 'manager'), false) then
    select s.id into v_session
    from public.reservation_support_sessions s
    where s.establishment_id = p_establishment_id and s.actor_id = auth.uid()
      and s.ended_at is null and s.expires_at > now()
    order by s.started_at desc limit 1;
    if v_session is not null then
      v_new := coalesce(v_new, '{}'::jsonb) || jsonb_build_object('via', 'restavor_support', 'support_session_id', v_session);
    end if;
  end if;

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
    'reservation', p_reservation_id, p_old, v_new);
end;
$$;

revoke all on function public.reservation_audit(uuid, text, uuid, jsonb, jsonb) from public, anon, authenticated;

-- `book_reservation` de la 169 con una columna más: quién del Equipo creó la reserva (`created_by_staff_id`).
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
      language, status, source, platform_name, is_new, whatsapp_consent, created_by_user_id, created_by_staff_id, idempotency_key
    ) values (
      v_space_id, p_establishment_id, v_class.shift_id, p_date, p_time, v_starts, p_party_size, btrim(p_customer_name),
      v_phone, v_email, v_notes, p_language, v_status, v_source,
      case when v_source = 'platform' then p_platform_name end,
      v_source <> 'manual', coalesce(p_whatsapp_consent, false) or v_source = 'manual',
      case when v_actor in ('member', 'restavor_support') then auth.uid() end,
      case when v_actor = 'staff' then public.reservations_device_staff(p_establishment_id) end, p_idempotency_key
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

-- `dismiss_duplicate` de la 169 con quién del Equipo descartó la pareja.
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
  insert into public.reservation_duplicate_dismissals (space_id, establishment_id, reservation_a, reservation_b, dismissed_by, dismissed_by_staff_id)
  values (public.establishment_space_id(p_establishment_id), p_establishment_id, v_a, v_b,
          case when v_actor in ('member', 'restavor_support') then auth.uid() end,
          case when v_actor = 'staff' then public.reservations_device_staff(p_establishment_id) end)
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

revoke all on function public.dismiss_duplicate(uuid, uuid, uuid) from public, anon;
grant execute on function public.dismiss_duplicate(uuid, uuid, uuid) to authenticated, service_role;

-- El historial legible de una reserva (la 169 con una puerta más: el servidor, que atiende a la tablet
-- del local una vez validado el dispositivo; `anon` no la ejecuta y `authenticated` siempre trae usuario).
create or replace function public.reservation_history(p_establishment_id uuid, p_reservation_id uuid)
returns table (id uuid, type text, actor_type text, actor_name text, data jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.reservations_can_read(p_establishment_id) then
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
grant execute on function public.reservation_history(uuid, uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 4 · Equipo (EQU-01)
-- ------------------------------------------------------------

-- Las personas de Reservas de un restaurante: Propietarios y Encargados con cuenta (entran con su email) y
-- el Equipo sin cuenta (entra con su PIN en la tablet). Sin emails ni PIN.
create or replace function public.reservation_people(p_establishment_id uuid)
returns table (kind text, ref_id uuid, name text, role text, has_pin boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_group uuid;
begin
  perform public.reservations_manage_actor(p_establishment_id);
  select e.group_id into v_group from public.establishments e where e.id = p_establishment_id;

  return query
    select x.kind, x.ref_id, x.name, x.role, x.has_pin, x.created_at from (
    select 'member'::text as kind, m.user_id as ref_id,
           coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) as name,
           m.role as role,
           exists (select 1 from public.reservation_staff st
                   where st.establishment_id = p_establishment_id and st.user_id = m.user_id
                     and st.active and st.pin_hmac is not null) as has_pin,
           m.since as created_at
    from (
      select em.user_id, 'owner'::text as role, em.created_at as since
      from public.establishment_memberships em
      where em.establishment_id = p_establishment_id and em.revoked_at is null and em.role = 'local_owner'
      union
      select gm.user_id, 'owner', gm.created_at
      from public.group_memberships gm
      where gm.group_id = v_group and gm.revoked_at is null and gm.role = 'global_owner'
      union
      select em.user_id, 'manager', em.created_at
      from public.establishment_memberships em
      join public.establishment_permissions ep on ep.establishment_membership_id = em.id
      where em.establishment_id = p_establishment_id and em.revoked_at is null and em.role = 'editor' and ep.manage_reservations
    ) m
    join public.profiles p on p.id = m.user_id
    -- Si alguien es Propietario y además tiene otra fila, cuenta como Propietario.
    where m.role = 'owner' or not exists (
      select 1 from public.establishment_memberships e2
      where e2.establishment_id = p_establishment_id and e2.user_id = m.user_id and e2.revoked_at is null and e2.role = 'local_owner')
    union all
    select 'staff'::text, st.id, st.name, 'staff'::text, st.pin_hmac is not null, st.created_at
    from public.reservation_staff st
    where st.establishment_id = p_establishment_id and st.kind = 'staff' and st.active
    ) x
    -- Primero los Propietarios, luego los Encargados y al final el Equipo (como `AjustesEquipo`).
    order by case x.role when 'owner' then 0 when 'manager' then 1 else 2 end, x.name, x.ref_id;
end;
$$;

-- Añade a alguien del Equipo: nombre y PIN. Pulsar dos veces con la misma clave no duplica.
create or replace function public.add_reservation_staff(
  p_establishment_id uuid, p_name text, p_pin_hmac text, p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_constraint text;
begin
  perform public.reservations_manage_actor(p_establishment_id);
  if not exists (select 1 from public.reservation_settings where establishment_id = p_establishment_id and service_status <> 'closed') then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_name = '' then
    raise exception 'Falta el nombre';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'El nombre es demasiado largo';
  end if;
  if p_pin_hmac is null or p_pin_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'PIN no válido';
  end if;

  if p_idempotency_key is not null then
    select st.id into v_id from public.reservation_staff st
    where st.establishment_id = p_establishment_id and st.idempotency_key = p_idempotency_key;
    if v_id is not null then
      return jsonb_build_object('outcome', 'created', 'id', v_id);
    end if;
  end if;

  begin
    insert into public.reservation_staff (space_id, establishment_id, kind, name, pin_hmac, idempotency_key)
    values (v_space_id, p_establishment_id, 'staff', v_name, p_pin_hmac, p_idempotency_key)
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'reservation_staff_idempotency_idx' then
      select st.id into v_id from public.reservation_staff st
      where st.establishment_id = p_establishment_id and st.idempotency_key = p_idempotency_key;
      return jsonb_build_object('outcome', 'created', 'id', v_id);
    end if;
    return jsonb_build_object('outcome', 'pin_in_use');
  end;

  perform public.reservations_audit_setting(p_establishment_id, 'staff_added', null, jsonb_build_object('staff_id', v_id));
  return jsonb_build_object('outcome', 'created', 'id', v_id);
end;
$$;

-- Cambia el PIN de alguien del Equipo.
create or replace function public.set_reservation_staff_pin(p_establishment_id uuid, p_staff_id uuid, p_pin_hmac text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.reservation_staff;
  v_constraint text;
begin
  perform public.reservations_manage_actor(p_establishment_id);
  if p_pin_hmac is null or p_pin_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'PIN no válido';
  end if;
  select * into v_row from public.reservation_staff
  where id = p_staff_id and establishment_id = p_establishment_id and kind = 'staff' for update;
  if not found or not v_row.active then
    raise exception 'Esa persona no está en el Equipo';
  end if;
  if v_row.pin_hmac = p_pin_hmac then
    return jsonb_build_object('outcome', 'unchanged');
  end if;
  begin
    update public.reservation_staff set pin_hmac = p_pin_hmac where id = v_row.id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    return jsonb_build_object('outcome', 'pin_in_use');
  end;
  perform public.reservations_audit_setting(p_establishment_id, 'staff_pin_changed', null, jsonb_build_object('staff_id', v_row.id));
  return jsonb_build_object('outcome', 'done');
end;
$$;

-- Quita a alguien del Equipo: lo desactiva y libera su PIN; conserva su fila y su historial.
create or replace function public.remove_reservation_staff(p_establishment_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.reservation_staff;
begin
  perform public.reservations_manage_actor(p_establishment_id);
  select * into v_row from public.reservation_staff
  where id = p_staff_id and establishment_id = p_establishment_id and kind = 'staff' for update;
  if not found then
    raise exception 'Esa persona no está en el Equipo';
  end if;
  if not v_row.active then
    return jsonb_build_object('outcome', 'unchanged');
  end if;
  update public.reservation_staff set active = false, deactivated_at = now(), pin_hmac = null where id = v_row.id;
  perform public.reservations_audit_setting(p_establishment_id, 'staff_removed', jsonb_build_object('staff_id', v_row.id, 'active', true),
    jsonb_build_object('staff_id', v_row.id, 'active', false));
  return jsonb_build_object('outcome', 'done');
end;
$$;

-- «Mi PIN para la tablet» de un Propietario o Encargado: solo la propia persona, con su sesión.
create or replace function public.set_my_reservation_pin(p_establishment_id uuid, p_pin_hmac text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_name text;
  v_existing public.reservation_staff;
  v_constraint text;
begin
  if auth.uid() is null or not coalesce(public.reservations_my_role(p_establishment_id) in ('owner', 'manager'), false) then
    raise exception 'Solo un Propietario o un Encargado de este restaurante tiene PIN para la tablet';
  end if;
  if not exists (select 1 from public.reservation_settings where establishment_id = p_establishment_id and service_status <> 'closed') then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if p_pin_hmac is null or p_pin_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'PIN no válido';
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) into v_name from public.profiles p where p.id = auth.uid();
  v_name := left(coalesce(v_name, 'Sin nombre'), 80);

  select * into v_existing from public.reservation_staff
  where establishment_id = p_establishment_id and user_id = auth.uid() for update;
  if found and v_existing.active and v_existing.pin_hmac = p_pin_hmac then
    return jsonb_build_object('outcome', 'unchanged');
  end if;

  begin
    if found then
      update public.reservation_staff
      set pin_hmac = p_pin_hmac, active = true, deactivated_at = null, name = v_name
      where id = v_existing.id;
    else
      insert into public.reservation_staff (space_id, establishment_id, kind, name, user_id, pin_hmac)
      values (v_space_id, p_establishment_id, 'member', v_name, auth.uid(), p_pin_hmac);
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    return jsonb_build_object('outcome', 'pin_in_use');
  end;
  perform public.reservations_audit_setting(p_establishment_id, 'my_pin_set', null, jsonb_build_object('user_id', auth.uid()));
  return jsonb_build_object('outcome', 'done');
end;
$$;

-- ------------------------------------------------------------
-- 5 · Dispositivos del local (EQU-02)
-- ------------------------------------------------------------

-- Un Propietario o Encargado activa SU dispositivo: el servidor trae el hash del token que acaba de poner en
-- la cookie. El token en claro no pasa por aquí.
create or replace function public.activate_reservation_device(p_establishment_id uuid, p_name text, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if auth.uid() is null or not coalesce(public.reservations_my_role(p_establishment_id) in ('owner', 'manager'), false) then
    raise exception 'Solo un Propietario o un Encargado puede activar un dispositivo del local';
  end if;
  if not exists (select 1 from public.reservation_settings where establishment_id = p_establishment_id and service_status in ('active', 'past_due', 'paused', 'ending')) then
    raise exception 'Reservas no está disponible para este restaurante en este momento';
  end if;
  if v_name = '' then
    raise exception 'Falta el nombre del dispositivo';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'El nombre es demasiado largo';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token no válido';
  end if;
  insert into public.reservation_devices (space_id, establishment_id, name, token_hash, activated_by)
  values (v_space_id, p_establishment_id, v_name, p_token_hash, auth.uid())
  returning id into v_id;
  perform public.reservations_audit_setting(p_establishment_id, 'device_activated', null, jsonb_build_object('device_id', v_id));
  return v_id;
end;
$$;

-- Desactiva un dispositivo (perdido, robado, ya no se usa). Idempotente.
create or replace function public.revoke_reservation_device(p_establishment_id uuid, p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.reservation_devices;
begin
  perform public.reservations_manage_actor(p_establishment_id);
  select * into v_row from public.reservation_devices
  where id = p_device_id and establishment_id = p_establishment_id for update;
  if not found then
    raise exception 'Dispositivo no encontrado';
  end if;
  if v_row.revoked_at is not null then
    return jsonb_build_object('outcome', 'unchanged');
  end if;
  update public.reservation_devices set revoked_at = now() where id = v_row.id;
  perform public.reservations_audit_setting(p_establishment_id, 'device_revoked', null, jsonb_build_object('device_id', v_row.id));
  return jsonb_build_object('outcome', 'done');
end;
$$;

-- El dispositivo de un token, si sigue activo. Solo el servidor.
create or replace function public.reservation_device_resolve(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.reservation_devices;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'no_device');
  end if;
  select * into v_row from public.reservation_devices where token_hash = p_token_hash and revoked_at is null;
  if not found or public.establishment_is_gone(v_row.establishment_id) then
    return jsonb_build_object('outcome', 'no_device');
  end if;
  -- Una vez por minuto basta: no se escribe en cada pantalla.
  if v_row.last_used_at is null or v_row.last_used_at < now() - interval '1 minute' then
    update public.reservation_devices set last_used_at = now() where id = v_row.id;
  end if;
  return jsonb_build_object('outcome', 'ok', 'device_id', v_row.id, 'establishment_id', v_row.establishment_id, 'name', v_row.name);
end;
$$;

-- Quién es esta persona del restaurante, sin PIN: lo mira el servidor cuando ya tiene una prueba propia
-- (la cookie firmada de Ajustes) y solo necesita que siga siendo cierto.
create or replace function public.reservation_device_vouch(p_establishment_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.reservation_staff;
  v_role text;
begin
  select * into v_row from public.reservation_staff
  where id = p_staff_id and establishment_id = p_establishment_id and active and pin_hmac is not null;
  if not found then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  if v_row.kind = 'member' then
    v_role := public.reservations_role_of(v_row.user_id, p_establishment_id);
    if v_role is null then
      return jsonb_build_object('outcome', 'invalid');
    end if;
  else
    v_role := 'staff';
  end if;
  return jsonb_build_object('outcome', 'ok', 'staff_id', v_row.id, 'kind', v_row.kind, 'role', v_role,
                            'name', v_row.name, 'user_id', v_row.user_id);
end;
$$;

revoke all on function public.reservation_device_vouch(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reservation_device_vouch(uuid, uuid) to service_role;

-- ¿Quién eres? Comprueba un PIN en un dispositivo, con el bloqueo escalado. Los fallos se anotan y por eso
-- un PIN malo NO es una excepción (se desharía el recuento): vuelve como resultado.
create or replace function public.reservation_device_identify(p_token_hash text, p_pin_hmac text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dev public.reservation_devices;
  v_att public.reservation_pin_attempts;
  v_staff public.reservation_staff;
  v_role text;
  v_failed integer;
  v_rounds integer;
  v_until timestamptz;
begin
  if p_pin_hmac is null or p_pin_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'PIN no válido';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'no_device');
  end if;
  select * into v_dev from public.reservation_devices where token_hash = p_token_hash and revoked_at is null;
  if not found or public.establishment_is_gone(v_dev.establishment_id) then
    return jsonb_build_object('outcome', 'no_device');
  end if;

  insert into public.reservation_pin_attempts (space_id, establishment_id, device_id)
  values (v_dev.space_id, v_dev.establishment_id, v_dev.id)
  on conflict (device_id) do nothing;
  select * into v_att from public.reservation_pin_attempts where device_id = v_dev.id for update;

  if v_att.locked_until is not null and v_att.locked_until > now() then
    return jsonb_build_object('outcome', 'locked', 'locked_until', v_att.locked_until);
  end if;

  v_failed := v_att.failed_count;
  v_rounds := v_att.lock_rounds;
  -- Se olvida lo anterior tras 24 horas sin fallos.
  if v_att.last_failed_at is not null and v_att.last_failed_at < now() - interval '24 hours' then
    v_failed := 0;
    v_rounds := 0;
  end if;

  select * into v_staff from public.reservation_staff
  where establishment_id = v_dev.establishment_id and pin_hmac = p_pin_hmac and active;
  if found then
    if v_staff.kind = 'member' then
      v_role := public.reservations_role_of(v_staff.user_id, v_dev.establishment_id);
    else
      v_role := 'staff';
    end if;
  end if;

  if v_role is not null then
    update public.reservation_pin_attempts
    set failed_count = 0, lock_rounds = 0, locked_until = null, last_failed_at = null, updated_at = now()
    where id = v_att.id;
    update public.reservation_devices set last_used_at = now() where id = v_dev.id;
    return jsonb_build_object('outcome', 'ok', 'staff_id', v_staff.id, 'kind', v_staff.kind, 'role', v_role,
                              'name', v_staff.name, 'user_id', v_staff.user_id, 'device_id', v_dev.id);
  end if;

  v_failed := v_failed + 1;
  if v_failed >= 5 then
    v_until := now() + make_interval(secs => public.reservation_pin_lock_seconds(v_rounds));
    update public.reservation_pin_attempts
    set failed_count = 0, lock_rounds = least(v_rounds + 1, 32000), locked_until = v_until, last_failed_at = now(), updated_at = now()
    where id = v_att.id;
    perform public.reservations_audit_setting(v_dev.establishment_id, 'pin_locked', null,
      jsonb_build_object('device_id', v_dev.id, 'round', v_rounds + 1,
                         'seconds', public.reservation_pin_lock_seconds(v_rounds)));
    return jsonb_build_object('outcome', 'locked', 'locked_until', v_until);
  end if;

  update public.reservation_pin_attempts
  set failed_count = v_failed, lock_rounds = v_rounds, last_failed_at = now(), updated_at = now()
  where id = v_att.id;
  return jsonb_build_object('outcome', 'wrong', 'remaining', 5 - v_failed);
end;
$$;

-- La única puerta de la tablet del local: valida el dispositivo y a la persona (PIN o prueba del servidor) y
-- ejecuta UNA operación de la agenda, de los ajustes o del Equipo, siempre de SU restaurante. La
-- operación pide un rol mínimo: sin PIN solo «abrir la ficha»; con el del Equipo, la agenda; con el de un
-- Encargado o Propietario, además ajustes y Equipo.
create or replace function public.reservation_device_act(
  p_token_hash text, p_pin_hmac text, p_staff_id uuid, p_operation text, p_args jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dev jsonb := public.reservation_device_resolve(p_token_hash);
  v_est uuid;
  v_id jsonb;
  v_role text;
  v_min text;
  v_rank integer;
  v_need integer;
  v_a jsonb := coalesce(p_args, '{}'::jsonb);
  v_result jsonb;
  v_prev_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_prev_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_prev_staff text := coalesce(current_setting('restavor.device_staff', true), '');
begin
  if v_dev ->> 'outcome' <> 'ok' then
    return jsonb_build_object('outcome', 'no_device');
  end if;
  v_est := (v_dev ->> 'establishment_id')::uuid;

  v_min := case p_operation
    when 'open' then 'device'
    when 'book' then 'staff'
    when 'confirm' then 'staff'
    when 'reject' then 'staff'
    when 'cancel' then 'staff'
    when 'no_show' then 'staff'
    when 'undo_no_show' then 'staff'
    when 'dismiss_duplicate' then 'staff'
    when 'platform_cancel_done' then 'staff'
    when 'save_shifts' then 'manager'
    when 'set_closed_date' then 'manager'
    when 'save_settings' then 'manager'
    when 'complete_onboarding' then 'manager'
    when 'staff_add' then 'manager'
    when 'staff_set_pin' then 'manager'
    when 'staff_remove' then 'manager'
    when 'device_revoke' then 'manager'
    when 'people' then 'manager'
    when 'history_log' then 'manager'
    else null
  end;
  if v_min is null then
    raise exception 'Operación no permitida desde el dispositivo del local';
  end if;

  if p_pin_hmac is not null then
    v_id := public.reservation_device_identify(p_token_hash, p_pin_hmac);
    if v_id ->> 'outcome' <> 'ok' then
      return v_id;
    end if;
  elsif p_staff_id is not null then
    v_id := public.reservation_device_vouch(v_est, p_staff_id);
    if v_id ->> 'outcome' <> 'ok' then
      return jsonb_build_object('outcome', 'identity_invalid');
    end if;
  else
    v_id := jsonb_build_object('outcome', 'ok', 'role', 'device');
  end if;

  v_role := v_id ->> 'role';
  v_rank := case v_role when 'device' then 0 when 'staff' then 1 when 'manager' then 2 when 'owner' then 3 else -1 end;
  v_need := case v_min when 'device' then 0 when 'staff' then 1 else 2 end;
  if v_rank < v_need then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  -- Quién actúa. Un Propietario o Encargado: la transacción pasa a ser suya mientras dura la función.
  -- Del Equipo: el ajuste local que lee `reservations_actor_type`.
  if v_role in ('owner', 'manager') then
    perform set_config('request.jwt.claims',
      jsonb_build_object('role', 'authenticated', 'sub', v_id ->> 'user_id')::text, true);
    perform set_config('request.jwt.claim.sub', v_id ->> 'user_id', true);
  elsif v_role = 'staff' then
    perform set_config('restavor.device_staff', (v_id ->> 'staff_id') || '|' || v_est::text, true);
  end if;

  v_result := case p_operation
    when 'open' then public.open_reservation(v_est, (v_a ->> 'reservation_id')::uuid)
    when 'book' then public.book_reservation(
      v_est, nullif(v_a ->> 'reservation_id', '')::uuid, (v_a ->> 'date')::date, (v_a ->> 'time')::time,
      (v_a ->> 'party_size')::integer, v_a ->> 'customer_name', v_a ->> 'phone_e164', v_a ->> 'email', v_a ->> 'notes',
      coalesce(v_a ->> 'language', 'es'), 'manual', coalesce((v_a ->> 'force')::boolean, false),
      v_a ->> 'idempotency_key', false, null)
    when 'confirm' then public.confirm_reservation(v_est, (v_a ->> 'reservation_id')::uuid)
    when 'reject' then public.reject_reservation(v_est, (v_a ->> 'reservation_id')::uuid)
    when 'cancel' then public.cancel_reservation(v_est, (v_a ->> 'reservation_id')::uuid, coalesce(v_a ->> 'reason', 'other'))
    when 'no_show' then public.mark_no_show(v_est, (v_a ->> 'reservation_id')::uuid)
    when 'undo_no_show' then public.undo_no_show(v_est, (v_a ->> 'reservation_id')::uuid)
    when 'dismiss_duplicate' then public.dismiss_duplicate(v_est, (v_a ->> 'reservation_a')::uuid, (v_a ->> 'reservation_b')::uuid)
    when 'platform_cancel_done' then public.mark_platform_cancel_done(v_est, (v_a ->> 'reservation_id')::uuid)
    when 'save_shifts' then public.save_reservation_shifts(v_est, v_a -> 'shifts')
    when 'set_closed_date' then public.set_reservation_closed_date(
      v_est, (v_a ->> 'date')::date, v_a ->> 'reason', coalesce((v_a ->> 'closed')::boolean, true))
    when 'save_settings' then public.save_reservation_settings(
      v_est, (v_a ->> 'slot_interval_minutes')::integer, (v_a ->> 'large_group_threshold')::integer,
      (v_a ->> 'min_notice_minutes')::integer, (v_a ->> 'max_advance_days')::integer,
      (v_a ->> 'customer_cancel_limit_minutes')::integer)
    when 'complete_onboarding' then public.complete_reservations_onboarding(v_est)
    when 'staff_add' then public.add_reservation_staff(v_est, v_a ->> 'name', v_a ->> 'pin_hmac', v_a ->> 'idempotency_key')
    when 'staff_set_pin' then public.set_reservation_staff_pin(v_est, (v_a ->> 'staff_id')::uuid, v_a ->> 'pin_hmac')
    when 'staff_remove' then public.remove_reservation_staff(v_est, (v_a ->> 'staff_id')::uuid)
    when 'device_revoke' then public.revoke_reservation_device(v_est, (v_a ->> 'device_id')::uuid)
    -- Dos lecturas que comprueban permiso por la sesión de quien llama: con el PIN de un Encargado o Propietario corren como él.
    when 'people' then (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.reservation_people(v_est) p)
    when 'history_log' then (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
                             from public.reservation_history_log(v_est, nullif(v_a ->> 'limit', '')::integer) h)
  end;

  perform set_config('request.jwt.claims', v_prev_claims, true);
  perform set_config('request.jwt.claim.sub', v_prev_sub, true);
  perform set_config('restavor.device_staff', v_prev_staff, true);

  return jsonb_build_object('outcome', 'acted', 'actor_role', v_role, 'actor_name', v_id ->> 'name', 'result', v_result);
end;
$$;

-- ------------------------------------------------------------
-- 6 · Sesión de soporte de Reservas (SOP-01, decisión 92)
-- ------------------------------------------------------------

-- ¿Está marcada esta persona como soporte de Reservas de este restaurante? La marca del espacio o `can_support`
-- de plataforma. No dice nada de la sesión ni del segundo paso.
create or replace function public.reservations_is_support_marked(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      public.is_platform_supporter()
      or exists (
        select 1 from public.space_memberships m
        where m.space_id = public.establishment_space_id(p_establishment_id)
          and m.user_id = auth.uid() and m.status = 'active' and m.can_support_reservations
      )
    );
$$;

revoke all on function public.reservations_is_support_marked(uuid) from public, anon, authenticated;

-- Abre la sesión: marca de soporte, segundo paso y un motivo. Por defecto 60 minutos. Si ya hay una abierta
-- de la misma persona en ese restaurante, la devuelve (no abre otra).
create or replace function public.open_reservation_support_session(
  p_establishment_id uuid, p_reason text, p_minutes integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_minutes integer := coalesce(p_minutes, 60);
  v_row public.reservation_support_sessions;
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión';
  end if;
  if not public.session_is_two_factor() then
    raise exception 'Abrir Reservas como soporte pide el segundo paso de verificación';
  end if;
  if v_space_id is null or public.space_is_gone(v_space_id) or not public.reservations_is_support_marked(p_establishment_id) then
    raise exception 'No estás marcado como soporte de Reservas para este restaurante';
  end if;
  if not exists (select 1 from public.reservation_settings where establishment_id = p_establishment_id) then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_reason = '' then
    raise exception 'Hace falta un motivo';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'El motivo es demasiado largo';
  end if;
  if v_minutes < 5 or v_minutes > 240 then
    raise exception 'La sesión de soporte dura entre 5 y 240 minutos';
  end if;

  -- Las que caducaron sin cerrarse se cierran a su hora de caducidad.
  update public.reservation_support_sessions
  set ended_at = expires_at
  where establishment_id = p_establishment_id and actor_id = auth.uid() and ended_at is null and expires_at <= now();

  select * into v_row from public.reservation_support_sessions
  where establishment_id = p_establishment_id and actor_id = auth.uid() and ended_at is null and expires_at > now()
  order by started_at desc limit 1;
  if found then
    return jsonb_build_object('outcome', 'open', 'session_id', v_row.id, 'expires_at', v_row.expires_at, 'already_open', true);
  end if;

  insert into public.reservation_support_sessions (space_id, establishment_id, actor_id, reason, started_at, expires_at)
  values (v_space_id, p_establishment_id, auth.uid(), v_reason, now(), now() + make_interval(mins => v_minutes))
  returning * into v_row;

  -- La auditoría no guarda el texto del motivo (puede nombrar a un comensal): vive en la sesión.
  perform public.reservations_audit_setting(p_establishment_id, 'support_session_opened', null,
    jsonb_build_object('session_id', v_row.id, 'minutes', v_minutes, 'reason_length', char_length(v_reason)));
  return jsonb_build_object('outcome', 'open', 'session_id', v_row.id, 'expires_at', v_row.expires_at, 'already_open', false);
end;
$$;

-- Cierra la sesión («Salir»). Idempotente; solo quien la abrió.
create or replace function public.close_reservation_support_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.reservation_support_sessions;
begin
  select * into v_row from public.reservation_support_sessions where id = p_session_id for update;
  if not found or auth.uid() is null or v_row.actor_id <> auth.uid() then
    raise exception 'Sesión de soporte no encontrada';
  end if;
  if v_row.ended_at is not null then
    return jsonb_build_object('outcome', 'unchanged');
  end if;
  update public.reservation_support_sessions set ended_at = least(now(), v_row.expires_at) where id = v_row.id;
  perform public.reservations_audit_setting(v_row.establishment_id, 'support_session_closed', null,
    jsonb_build_object('session_id', v_row.id));
  return jsonb_build_object('outcome', 'closed');
end;
$$;

-- La sesión de soporte abierta de quien llama en un restaurante, o nada.
create or replace function public.my_reservation_support_session(p_establishment_id uuid)
returns table (session_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.expires_at
  from public.reservation_support_sessions s
  where auth.uid() is not null and s.establishment_id = p_establishment_id and s.actor_id = auth.uid()
    and s.ended_at is null and s.expires_at > now()
  order by s.started_at desc limit 1;
$$;

-- Los restaurantes con Reservas que quien llama puede abrir como soporte: los de los espacios donde está marcado
-- y, si es de la plataforma con `can_support`, cualquiera (con búsqueda por nombre o ciudad).
create or replace function public.reservation_support_candidates(p_query text default null)
returns table (establishment_id uuid, name text, city text, space_slug text, service_status text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_like text := '%' || replace(replace(replace(lower(btrim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if auth.uid() is null then
    return;
  end if;
  return query
    select e.id, e.name, e.city, sp.slug, rs.service_status
    from public.reservation_settings rs
    join public.establishments e on e.id = rs.establishment_id
    join public.spaces sp on sp.id = e.space_id
    where not public.space_is_gone(sp.id)
      and (
        public.is_platform_supporter()
        or exists (select 1 from public.space_memberships m
                   where m.space_id = sp.id and m.user_id = auth.uid() and m.status = 'active' and m.can_support_reservations)
      )
      and (btrim(coalesce(p_query, '')) = ''
           or lower(e.name) like v_like escape '\' or lower(coalesce(e.city, '')) like v_like escape '\')
    order by e.name, e.id
    limit 50;
end;
$$;

-- ------------------------------------------------------------
-- 7 · Historial de Reservas del restaurante
-- ------------------------------------------------------------

-- Cambios de ajustes, Equipo y dispositivos, bloqueos de PIN y sesiones de soporte, lo más reciente primero.
-- Quien cambió algo del restaurante sale con su nombre; el equipo de Restavor, como «Restavor»; el soporte, como
-- «Restavor (soporte)». Nunca el identificador de nadie del equipo (P7).
create or replace function public.reservation_history_log(p_establishment_id uuid, p_limit integer default 100)
returns table (at timestamptz, kind text, actor_label text, detail jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_group uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  perform public.reservations_manage_actor(p_establishment_id);
  select e.group_id into v_group from public.establishments e where e.id = p_establishment_id;

  return query
    select * from (
      select a.created_at as at, a.action as kind,
             case
               when a.new_value ? 'by_staff_id' then
                 coalesce((select st.name from public.reservation_staff st where st.id = (a.new_value ->> 'by_staff_id')::uuid), 'Equipo')
               when a.actor_id is null then 'Sistema'
               when exists (select 1 from public.establishment_memberships em where em.establishment_id = p_establishment_id and em.user_id = a.actor_id)
                 or exists (select 1 from public.group_memberships gm where gm.group_id = v_group and gm.user_id = a.actor_id)
                 then coalesce((select nullif(btrim(p.full_name), '') from public.profiles p where p.id = a.actor_id), 'Propietario')
               else 'Restavor'
             end as actor_label,
             (coalesce(a.new_value, '{}'::jsonb) - 'by_staff_id' - 'user_id')
               || case when a.new_value ? 'staff_id'
                       then jsonb_build_object('staff_name', (select st.name from public.reservation_staff st where st.id = (a.new_value ->> 'staff_id')::uuid))
                       else '{}'::jsonb end as detail
      from public.audit_log a
      where a.space_id = v_space_id and a.entity_type = 'establishment' and a.entity_id = p_establishment_id
        and a.action like 'reservations.%'
        and a.action not in ('reservations.support_session_opened', 'reservations.support_session_closed')
      union all
      select s.started_at, 'reservations.support_session', 'Restavor (soporte)',
             jsonb_build_object('reason', s.reason, 'expires_at', s.expires_at, 'ended_at', s.ended_at)
      from public.reservation_support_sessions s
      where s.establishment_id = p_establishment_id
    ) h
    order by h.at desc
    limit v_limit;
end;
$$;

-- ------------------------------------------------------------
-- Cierre: quién ejecuta qué
-- ------------------------------------------------------------
-- Las que se llaman con sesión de usuario: `authenticated`. Todas comprueban permiso por su cuenta.
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.reservation_people(uuid)',
    'public.add_reservation_staff(uuid, text, text, text)',
    'public.set_reservation_staff_pin(uuid, uuid, text)',
    'public.remove_reservation_staff(uuid, uuid)',
    'public.set_my_reservation_pin(uuid, text)',
    'public.activate_reservation_device(uuid, text, text)',
    'public.revoke_reservation_device(uuid, uuid)',
    'public.open_reservation_support_session(uuid, text, integer)',
    'public.close_reservation_support_session(uuid)',
    'public.my_reservation_support_session(uuid)',
    'public.reservation_support_candidates(text)',
    'public.reservation_history_log(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;

  -- Las del servidor (la tablet del local): solo `service_role`.
  foreach v_sig in array array[
    'public.reservation_device_resolve(text)',
    'public.reservation_device_identify(text, text)',
    'public.reservation_device_act(text, text, uuid, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_sig);
    execute format('grant execute on function %s to service_role', v_sig);
  end loop;
end $$;
