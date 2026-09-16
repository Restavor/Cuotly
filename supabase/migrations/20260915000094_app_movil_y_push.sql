-- Fase 4 · Hito 22 · app móvil y push (PRD §35, RN-MOV-04 a 06 y 10;
-- §70, §144 y §176 de la maestra).
--
-- **Lo que este archivo es.** La mitad de servidor de la app móvil: el push
-- como un canal más de la cola de avisos de §18. Casi todo lo demás del
-- hito —los once flujos de §176, la navegación, la caché, los borradores—
-- no necesita ni una línea de SQL, porque la app llama a las mismas
-- funciones que la web con la sesión de quien mira (RN-MOV-01).
--
-- **Lo que NO es.** No es un segundo sistema de avisos: no hay tabla de
-- "push", no hay texto guardado, no hay un proceso aparte. Una fila más
-- en `notification_deliveries` con `channel = 'push'`, que reclama y marca
-- el mismo proceso de la cola que ya envía el correo (migración 41).
--
-- **Tres decisiones que conviene leer antes que el resto:**
--
--   1. **Un dispositivo es de una persona** (RN-MOV-05). El token de Expo
--      identifica a un teléfono, no a quien lo usa, así que si otra
--      persona inicia sesión en el mismo teléfono el token pasa a ella: el
--      aviso nunca llega a quien ya no está dentro. Es la razón de que
--      `register_push_device()` sea SECURITY DEFINER: tiene que poder
--      tocar una fila que hoy pertenece a otra persona.
--   2. **El push respeta las preferencias de §18** (RN-MOV-06): columna
--      `push` en `notification_preferences`, activada por omisión
--      (RN-NOT-02), y los obligatorios de RN-NOT-03 no se apagan tampoco
--      por este canal. `set_notification_preference()` cambia de firma
--      para admitirla; la de cuatro parámetros se retira, porque dos
--      firmas con una por omisión son una llamada ambigua.
--   3. **Un token que el proveedor da por inexistente se cierra sin
--      reintentos** (RN-MOV-05). `revoke_push_token()` es del proceso de
--      la cola (`service_role`), no de nadie con sesión: la app se da de
--      baja con `unregister_push_device()`, que solo toca lo suyo.
--
-- Se comprueba con `supabase/tests/app_movil_y_push.sql`.

-- ============================================================
-- 1 · Los dispositivos (RN-MOV-05)
-- ============================================================
--
-- Sin `space_id` a propósito: un teléfono es de una persona, y esa persona
-- puede pertenecer a varios espacios o a ninguno (un restaurante). Es una
-- tabla de identidad, como `profiles`, y así se clasifica en el barrido de
-- invariantes de RLS de la suite del Hito 7.
create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- El token de Expo (`ExponentPushToken[...]`). Único: un teléfono no
  -- puede ser de dos personas a la vez.
  expo_push_token text not null unique
    check (length(expo_push_token) between 10 and 200),
  platform text not null check (platform in ('ios', 'android')),
  device_name text check (device_name is null or length(device_name) <= 120),
  app_version text check (app_version is null or length(app_version) <= 40),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  -- Por qué se cerró: 'signed_out' (la persona cerró sesión),
  -- 'replaced' (otra persona entró en el mismo teléfono) o
  -- 'provider_rejected' (el proveedor dijo que ya no existe).
  revoked_reason text check (revoked_reason in ('signed_out', 'replaced', 'provider_rejected'))
);

create index push_devices_user_active_idx
  on public.push_devices (user_id) where revoked_at is null;

comment on table public.push_devices is
  'RN-MOV-05 · los teléfonos con push de cada persona. Sin space_id: es
   identidad, no espacio. Un token pertenece a una persona; si otra entra
   en el mismo teléfono, pasa a ella. Se cierra (revoked_at) al cerrar
   sesión o cuando el proveedor lo da por inexistente; nunca se borra.';

alter table public.push_devices enable row level security;

-- Cada uno ve los suyos y solo los suyos. No hay política de escritura:
-- registrar y dar de baja pasan por las dos funciones de abajo.
create policy push_devices_select on public.push_devices
for select
using (user_id = auth.uid());

-- Registrar (o refrescar) el teléfono desde el que se está hablando.
-- Devuelve el id de la fila. Idempotente: el mismo token de la misma
-- persona solo actualiza `last_seen_at`.
create or replace function public.register_push_device(
  p_expo_push_token text,
  p_platform text,
  p_device_name text default null,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.push_devices%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Hace falta una sesión para registrar un dispositivo';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'Plataforma desconocida: solo iOS y Android (§145)';
  end if;

  select * into v_row from public.push_devices where expo_push_token = p_expo_push_token;

  if v_row.id is null then
    insert into public.push_devices (user_id, expo_push_token, platform, device_name, app_version)
    values (v_uid, p_expo_push_token, p_platform, p_device_name, p_app_version)
    returning id into v_id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (null, v_uid, 'push_device.registered', 'push_device', v_id, null,
            jsonb_build_object('platform', p_platform, 'device_name', p_device_name, 'app_version', p_app_version));
    return v_id;
  end if;

  -- RN-MOV-05 · el token pasa a quien entra. Si era de otra persona, la
  -- fila cambia de dueño y queda dicho en la auditoría de las dos.
  if v_row.user_id <> v_uid then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
    values (null, v_row.user_id, 'push_device.revoked', 'push_device', v_row.id,
            jsonb_build_object('platform', v_row.platform, 'device_name', v_row.device_name),
            null, 'replaced');
    update public.push_devices
    set user_id = v_uid, platform = p_platform, device_name = p_device_name,
        app_version = p_app_version, last_seen_at = now(), revoked_at = null, revoked_reason = null
    where id = v_row.id;
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (null, v_uid, 'push_device.registered', 'push_device', v_row.id, null,
            jsonb_build_object('platform', p_platform, 'device_name', p_device_name, 'app_version', p_app_version));
    return v_row.id;
  end if;

  -- El mismo teléfono de la misma persona: se refresca, y si estaba dado
  -- de baja (cerró sesión y volvió a entrar) vuelve a estar vigente.
  update public.push_devices
  set platform = p_platform, device_name = p_device_name, app_version = p_app_version,
      last_seen_at = now(), revoked_at = null, revoked_reason = null
  where id = v_row.id;

  if v_row.revoked_at is not null then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (null, v_uid, 'push_device.registered', 'push_device', v_row.id,
            jsonb_build_object('revoked_reason', v_row.revoked_reason),
            jsonb_build_object('platform', p_platform, 'device_name', p_device_name, 'app_version', p_app_version));
  end if;

  return v_row.id;
end;
$$;

comment on function public.register_push_device(text, text, text, text) is
  'RN-MOV-05 · registra el teléfono de quien pregunta. Solo toca filas del
   propio token: la suya, o la de otra persona que usó ese mismo teléfono,
   que pasa a ser suya. No autoriza nada más y no lee nada de nadie.';

-- Dar de baja el propio teléfono al cerrar sesión. Solo el propio: un
-- token ajeno no se toca, y ni siquiera se dice si existe.
create or replace function public.unregister_push_device(p_expo_push_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.push_devices%rowtype;
begin
  if v_uid is null then
    raise exception 'Hace falta una sesión para dar de baja un dispositivo';
  end if;

  select * into v_row
  from public.push_devices
  where expo_push_token = p_expo_push_token and user_id = v_uid and revoked_at is null;

  if v_row.id is null then
    return false;
  end if;

  update public.push_devices
  set revoked_at = now(), revoked_reason = 'signed_out'
  where id = v_row.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (null, v_uid, 'push_device.revoked', 'push_device', v_row.id,
          jsonb_build_object('platform', v_row.platform, 'device_name', v_row.device_name),
          null, 'signed_out');
  return true;
end;
$$;

comment on function public.unregister_push_device(text) is
  'RN-MOV-05 · da de baja el propio teléfono al cerrar sesión. Devuelve
   false si no era suyo o ya estaba cerrado, sin distinguir los dos casos.';

-- Las dos son de quien tiene sesión: `anon` no tiene teléfono.
revoke all on function public.register_push_device(text, text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text, text) to authenticated;
revoke all on function public.unregister_push_device(text) from public, anon;
grant execute on function public.unregister_push_device(text) to authenticated;

-- El proveedor dice que el token ya no existe (`DeviceNotRegistered`): lo
-- cierra el proceso de la cola, con `service_role`. Nadie con sesión.
create or replace function public.revoke_push_token(p_expo_push_token text, p_reason text default 'provider_rejected')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.push_devices%rowtype;
begin
  if p_reason not in ('signed_out', 'replaced', 'provider_rejected') then
    raise exception 'Motivo de baja desconocido: %', p_reason;
  end if;

  select * into v_row
  from public.push_devices
  where expo_push_token = p_expo_push_token and revoked_at is null;

  if v_row.id is null then
    return false;
  end if;

  update public.push_devices
  set revoked_at = now(), revoked_reason = p_reason
  where id = v_row.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (null, v_row.user_id, 'push_device.revoked', 'push_device', v_row.id,
          jsonb_build_object('platform', v_row.platform, 'device_name', v_row.device_name),
          null, p_reason);
  return true;
end;
$$;

revoke all on function public.revoke_push_token(text, text) from public, anon, authenticated;

-- ============================================================
-- 2 · La preferencia de push (RN-MOV-06)
-- ============================================================
alter table public.notification_preferences
  add column push boolean not null default true;

comment on column public.notification_preferences.push is
  'RN-MOV-06 · el tercer canal. Activado por omisión (RN-NOT-02); los
   avisos obligatorios de RN-NOT-03 no se apagan tampoco aquí.';

-- La firma de cuatro parámetros se retira: con la nueva (cinco, el último
-- por omisión) una llamada con cuatro argumentos sería ambigua.
drop function public.set_notification_preference(uuid, text, boolean, boolean);

create or replace function public.set_notification_preference(
  p_space_id uuid,
  p_event_type text,
  p_in_app boolean,
  p_email boolean,
  p_push boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'No perteneces a este espacio';
  end if;

  -- RN-NOT-03: "seguridad, pérdida de acceso, impagos graves y
  -- vencimientos críticos no pueden desactivarse dentro de Cuotly". Por
  -- ningún canal (RN-MOV-06).
  if public.notification_event_is_mandatory(p_event_type)
     and (p_in_app is not true or p_email is not true or p_push is false) then
    raise exception 'Este aviso no se puede desactivar: es un vencimiento crítico o un impago grave';
  end if;

  -- `p_push` nulo significa "no lo toques": la web de escritorio guarda
  -- los dos canales de siempre y deja el del teléfono como estuviera.
  insert into public.notification_preferences (space_id, profile_id, event_type, in_app, email, push)
  values (p_space_id, auth.uid(), p_event_type, p_in_app, p_email, coalesce(p_push, true))
  on conflict (profile_id, space_id, event_type)
  do update set in_app = excluded.in_app,
                email = excluded.email,
                push = coalesce(p_push, public.notification_preferences.push),
                updated_at = now();
end;
$$;

revoke all on function public.set_notification_preference(uuid, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_notification_preference(uuid, text, boolean, boolean, boolean) to authenticated;

-- ============================================================
-- 3 · El canal `push` en la cola (RN-MOV-04)
-- ============================================================
alter table public.notification_deliveries
  drop constraint notification_deliveries_channel_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_channel_check check (channel in ('email', 'push'));

comment on table public.notification_deliveries is
  'RN-NOT-05: la cola de envío, con reintentos e idempotencia. Dos
   canales: correo (migración 35) y push (migración 94, RN-MOV-04). No
   guarda direcciones ni tokens: los resuelve el proceso de envío en el
   momento, desde `profiles` y `push_devices`.';

-- La misma `emit_notification()` de la 38 con el tercer canal. `p_send_email`
-- sigue llamándose así por compatibilidad con quien la llama, pero desde
-- aquí significa "canales externos": §18 dice "visible dentro de Cuotly,
-- sin correo ni push", y lo uno y lo otro van juntos.
create or replace function public.emit_notification(
  p_space_id uuid,
  p_recipient_id uuid,
  p_event_type text,
  p_audience text,
  p_entity_type text,
  p_entity_id uuid,
  p_deep_link text,
  p_dedupe_key text,
  p_establishment_id uuid default null,
  p_threshold_percent integer default null,
  p_amount_cents bigint default null,
  p_send_email boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
  v_email_enabled boolean;
  v_in_app_enabled boolean;
  v_push_enabled boolean;
  v_mandatory boolean := public.notification_event_is_mandatory(p_event_type);
begin
  select coalesce(np.in_app, true), coalesce(np.email, true), coalesce(np.push, true)
  into v_in_app_enabled, v_email_enabled, v_push_enabled
  from (select 1) z
  left join public.notification_preferences np
    on np.profile_id = p_recipient_id
   and np.space_id = p_space_id
   and np.event_type = p_event_type;

  if not v_mandatory and not coalesce(v_in_app_enabled, true) then
    return null;
  end if;

  insert into public.notifications (
    space_id, recipient_id, event_type, audience, entity_type, entity_id,
    establishment_id, deep_link, threshold_percent, amount_cents, dedupe_key
  ) values (
    p_space_id, p_recipient_id, p_event_type, p_audience, p_entity_type, p_entity_id,
    p_establishment_id, p_deep_link, p_threshold_percent, p_amount_cents, p_dedupe_key
  )
  on conflict (recipient_id, dedupe_key) do nothing
  returning id into v_notification_id;

  if v_notification_id is null then
    return null;
  end if;

  if p_send_email and (v_mandatory or coalesce(v_email_enabled, true)) then
    insert into public.notification_deliveries (space_id, notification_id, channel)
    values (p_space_id, v_notification_id, 'email')
    on conflict (notification_id, channel) do nothing;
  end if;

  -- RN-MOV-04 · push solo si hay un teléfono vigente al que mandarlo: una
  -- entrega sin destino se moriría en la cola tras cinco reintentos.
  if p_send_email
     and (v_mandatory or coalesce(v_push_enabled, true))
     and exists (
       select 1 from public.push_devices d
       where d.user_id = p_recipient_id and d.revoked_at is null
     ) then
    insert into public.notification_deliveries (space_id, notification_id, channel)
    values (p_space_id, v_notification_id, 'push')
    on conflict (notification_id, channel) do nothing;
  end if;

  return v_notification_id;

exception
  -- CA-18 y RN-NOT-05, igual que arriba.
  when others then
    return null;
end;
$$;

revoke all on function public.emit_notification(uuid, uuid, text, text, text, uuid, text, text, uuid, integer, bigint, boolean)
  from public, anon, authenticated;

-- El reclamo devuelve ahora el canal y, para el push, los tokens vigentes
-- del destinatario. Cambia la forma de la tabla devuelta, y eso obliga a
-- retirar la función y crearla de nuevo; al crearla, los privilegios por
-- omisión de Supabase la abrirían a `anon` y `authenticated`, así que la
-- revocación va justo detrás (CLAUDE.md).
drop function public.claim_notification_deliveries(integer);

create function public.claim_notification_deliveries(p_limit integer default 20)
returns table (
  delivery_id uuid,
  notification_id uuid,
  attempts integer,
  channel text,
  recipient_email text,
  push_tokens text[],
  event_type text,
  audience text,
  deep_link text,
  space_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with tomados as (
    select d.id from public.notification_deliveries d
    where d.status = 'pending' and d.next_attempt_at <= now()
    order by d.next_attempt_at
    limit p_limit
    for update skip locked
  ),
  marcados as (
    update public.notification_deliveries d
    set attempts = d.attempts + 1
    from tomados t
    where d.id = t.id
    returning d.id, d.notification_id, d.attempts, d.channel
  )
  select m.id, m.notification_id, m.attempts, m.channel,
         p.email,
         case when m.channel = 'push' then
           coalesce((
             select array_agg(pd.expo_push_token order by pd.last_seen_at desc)
             from public.push_devices pd
             where pd.user_id = n.recipient_id and pd.revoked_at is null
           ), '{}'::text[])
         else null end,
         n.event_type, n.audience, n.deep_link, s.name
  from marcados m
  join public.notifications n on n.id = m.notification_id
  join public.profiles p on p.id = n.recipient_id
  join public.spaces s on s.id = n.space_id;
end;
$$;

revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;

-- ============================================================
-- 4 · La página de estado mide también el push (RN-SOP-12)
-- ============================================================
--
-- `platform_status_snapshot()` cuenta las entregas muertas o atascadas de
-- las últimas 24 h sin mirar el canal, así que el push entra solo en la
-- medición de "notificaciones" sin tocar la función. Queda dicho para que
-- nadie lo busque.
