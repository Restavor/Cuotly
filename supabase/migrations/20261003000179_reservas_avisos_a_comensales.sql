-- Fase F de Restavor agents · avisos a los comensales (PRD de agents §6.11, §10.3, §10.4 y §15; AVI-01 a AVI-06).
--
-- Hasta aquí la agenda dejaba el evento y nada más (decisión 119). Esta migración añade:
--
--   1 · Tres interruptores de canal por restaurante —correo, WhatsApp y SMS— que sustituyen a `messaging_enabled`
--       (decisiones 151 y 152: Bosco, 03/10/2026).
--   2 · El aviso nace del propio evento de la agenda, en la misma transacción: `reservation_log_event()` llama a
--       `reservation_notice_enqueue()`, que SOLO inserta (decisión 153). Un fallo al preparar el aviso nunca impide
--       guardar la reserva.
--   3 · La elección de canal (correo → WhatsApp → SMS) en UNA función, usada al encolar, al reclamar y en el
--       respaldo (`reservation_notice_pick_channel()`).
--   4 · El reclamo de avisos (`claim_reservation_notices()`), el informe del envío (`report_reservation_notice()`) y
--       los sucesos del proveedor (`reservation_notice_provider_event()`), con el orden de bloqueo único ajustes →
--       aviso → libro (decisión 120) y un restaurante por llamada.
--   5 · El coste real (RN-AGT-07, decisión 156): se cobra al reclamar, bajo el bloqueo de los ajustes, con clave de
--       idempotencia `notice:<id>:charge`; toda salida sin enviar liquida (devuelve) una sola vez; el SMS se corrige
--       con el precio real que informa el proveedor.
--   6 · El enlace del comensal: `reservation_customer_view()` y `reservation_customer_cancel()` (decisión 154).
--   7 · Incidentes de Reservas con contactos enmascarados, límites de uso y respuesta automática de WhatsApp.
--
-- Los errores del proveedor se guardan SIEMPRE como código (`^[a-z0-9_.:-]{1,60}$`), nunca su texto: puede llevar el
-- teléfono o el correo del comensal (RN-RES-12). `reservation_events`, `audit_log` e `reservation_incidents.data` no
-- guardan datos personales de comensales.
--
-- Se comprueba con `supabase/tests/reservas_avisos.sql` y `reservas_avisos_enlace.sql`.

-- ------------------------------------------------------------
-- 1 · Los tres interruptores de canal
-- ------------------------------------------------------------
alter table public.reservation_settings
  add column notify_email boolean not null default true,
  add column notify_whatsapp boolean not null default true,
  add column notify_sms boolean not null default true;

-- Lo que estaba apagado en `messaging_enabled` (WhatsApp y SMS) sigue apagado.
update public.reservation_settings set notify_whatsapp = messaging_enabled, notify_sms = messaging_enabled;

alter table public.reservation_settings drop column messaging_enabled;

grant select (notify_email, notify_whatsapp, notify_sms) on public.reservation_settings to authenticated;

comment on column public.reservation_settings.notify_email is
  'Decisión 152 · avisos a los comensales por correo (por defecto sí). Los cambia una persona desde su cuenta.';
comment on column public.reservation_settings.notify_whatsapp is
  'Decisión 152 · avisos a los comensales por WhatsApp (de pago, del saldo; por defecto sí).';
comment on column public.reservation_settings.notify_sms is
  'Decisión 152 · avisos a los comensales por SMS (de pago, del saldo; por defecto sí).';

-- ------------------------------------------------------------
-- 2 · El historial se ordena por una secuencia, no por la hora de la transacción
-- ------------------------------------------------------------
-- `created_at` es el inicio de la transacción: el evento de la reserva y el de su aviso comparten hora y un orden por
-- `id` aleatorio podía poner «aviso no enviado» antes de «reserva creada».
alter table public.reservation_events add column seq bigint generated always as identity;

create or replace function public.reservation_history(p_establishment_id uuid, p_reservation_id uuid)
returns table(id uuid, type text, actor_type text, actor_name text, data jsonb, created_at timestamptz)
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
    order by e.created_at, e.seq;
end;
$$;

-- ------------------------------------------------------------
-- 3 · reservation_notifications: lo que hace falta para enviar, cobrar y seguir el envío
-- ------------------------------------------------------------
alter table public.reservation_notifications
  add column event_id uuid references public.reservation_events(id),
  add column fallback_of uuid references public.reservation_notifications(id),
  add column provider text,
  add column sent_at timestamptz,
  add column delivered_at timestamptz,
  add column price_final_at timestamptz,
  add column price_checked_at timestamptz,
  add column price_checks smallint not null default 0,
  add column price_original numeric,
  add column price_currency text;

-- Un aviso que se omite antes de elegir canal (`no_contact`, `messaging_disabled`...) no tiene canal.
alter table public.reservation_notifications alter column channel drop not null;
alter table public.reservation_notifications
  add constraint reservation_notifications_channel_required
  check (channel is not null or status = 'skipped');

alter table public.reservation_notifications drop constraint reservation_notifications_skip_reason_check;
alter table public.reservation_notifications
  add constraint reservation_notifications_skip_reason_check
  check (skip_reason in ('no_balance', 'messaging_disabled', 'platform_source', 'no_contact', 'no_consent',
                         'no_rate', 'obsolete', 'not_allowed', 'missing_data'));

-- El error es un CÓDIGO, nunca el texto del proveedor (puede llevar el contacto del comensal).
alter table public.reservation_notifications
  add constraint reservation_notifications_error_is_code
  check (error is null or error ~ '^[a-z0-9_.:-]{1,60}$');

alter table public.reservation_notifications
  add constraint reservation_notifications_provider_check
  check (provider is null or provider in ('fake', 'resend', 'meta', 'sms'));

-- Un aviso por (evento, canal): el respaldo por SMS de un WhatsApp comparte evento pero no canal.
create unique index reservation_notifications_event_channel_idx
  on public.reservation_notifications (event_id, channel)
  where event_id is not null and channel is not null;
create unique index reservation_notifications_event_nochannel_idx
  on public.reservation_notifications (event_id)
  where event_id is not null and channel is null;
create unique index reservation_notifications_provider_msg_idx
  on public.reservation_notifications (provider, provider_message_id)
  where provider_message_id is not null;
create index reservation_notifications_whatsapp_recipient_idx
  on public.reservation_notifications (recipient, created_at desc)
  where channel = 'whatsapp' and recipient is not null;

-- Saldo sin recorrer filas enteras: se lee antes de cada cobro.
create index agent_balance_entries_balance_idx
  on public.agent_balance_entries (establishment_id) include (amount_micros);

-- Toda columna nueva de esta tabla quedaría abierta con un `grant select` de tabla entera: ahora, por lista. El
-- destinatario, el identificador del proveedor y el código de error no los lee ninguna pantalla.
revoke select on public.reservation_notifications from authenticated;
grant select (id, space_id, establishment_id, reservation_id, template, channel, language, status, skip_reason,
              attempts, next_attempt_at, cost_micros, sent_at, delivered_at, anonymized_at, created_at, updated_at)
  on public.reservation_notifications to authenticated;

-- ------------------------------------------------------------
-- 4 · Incidentes: sin datos personales y uno abierto por tipo
-- ------------------------------------------------------------
alter table public.reservation_incidents
  add constraint reservation_incidents_data_no_personal
  check (data::text !~* '"(customer_name|name|phone|phone_e164|email|notes|note|caller|caller_e164|recipient|summary)"[[:space:]]*:')
  not valid;

create unique index reservation_incidents_open_code_idx
  on public.reservation_incidents (establishment_id, kind, (data ->> 'code'))
  where resolved_at is null and data ? 'code';

-- ------------------------------------------------------------
-- 5 · Ayudas puras: país del número, móvil, tarifa y enmascarado
-- ------------------------------------------------------------
-- Prefijo → país para los mercados habituales. Lo que no está aquí no tiene país y, sin país, no hay tarifa y el aviso
-- no sale (`no_rate`): nunca se aplica la tarifa de otro país.
create or replace function public.reservation_phone_country(p_phone text)
returns text
language sql
immutable
set search_path = public
as $$
  select v.iso
  from (values
    ('34', 'ES'), ('351', 'PT'), ('33', 'FR'), ('39', 'IT'), ('49', 'DE'), ('44', 'GB'), ('353', 'IE'),
    ('31', 'NL'), ('32', 'BE'), ('41', 'CH'), ('43', 'AT'), ('376', 'AD'), ('377', 'MC'), ('352', 'LU'),
    ('45', 'DK'), ('46', 'SE'), ('47', 'NO'), ('358', 'FI'), ('48', 'PL'), ('30', 'GR'), ('420', 'CZ'),
    ('36', 'HU'), ('40', 'RO'), ('359', 'BG'), ('385', 'HR'), ('356', 'MT'), ('357', 'CY'), ('212', 'MA'),
    ('1', 'US'), ('52', 'MX'), ('54', 'AR'), ('55', 'BR'), ('56', 'CL'), ('57', 'CO'), ('51', 'PE'),
    ('58', 'VE'), ('598', 'UY'), ('593', 'EC'), ('591', 'BO'), ('595', 'PY'), ('506', 'CR'), ('507', 'PA'),
    ('503', 'SV'), ('502', 'GT'), ('504', 'HN'), ('505', 'NI'), ('81', 'JP'), ('86', 'CN'), ('91', 'IN'),
    ('61', 'AU'), ('64', 'NZ'), ('971', 'AE'), ('966', 'SA'), ('972', 'IL'), ('90', 'TR'), ('27', 'ZA')
  ) as v(prefix, iso)
  where p_phone like '+' || v.prefix || '%'
  order by length(v.prefix) desc
  limit 1;
$$;

-- Un fijo español (+34 8… o +34 9…) no recibe WhatsApp ni SMS. En otros países no se puede saber desde el número.
create or replace function public.reservation_phone_is_mobile(p_phone text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_phone is not null and p_phone !~ '^\+34[89]';
$$;

-- Precio de un mensaje, en millonésimas de euro, vigente en una fecha. Una tarifa en otra moneda se convierte con
-- `fx_rates` (`rate_to_eur` multiplica); sin cambio, no hay precio.
create or replace function public.messaging_rate_micros(p_channel text, p_country text, p_on date)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rate public.messaging_rates;
  v_fx numeric;
begin
  if p_country is null then
    return null;
  end if;
  select * into v_rate from public.messaging_rates r
  where r.channel = p_channel and r.country = p_country and r.valid_from <= p_on
  order by r.valid_from desc limit 1;
  if v_rate.id is null then
    return null;
  end if;
  if v_rate.currency = 'EUR' then
    return v_rate.price_micros;
  end if;
  select f.rate_to_eur into v_fx from public.fx_rates f
  where f.currency = v_rate.currency and f.date <= p_on
  order by f.date desc limit 1;
  if v_fx is null then
    return null;
  end if;
  return round(v_rate.price_micros * v_fx)::bigint;
end;
$$;

-- Un importe en la moneda del proveedor → millonésimas de euro (null si no hay cambio).
create or replace function public.reservation_to_eur_micros(p_amount numeric, p_currency text, p_on date)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fx numeric;
begin
  if p_amount is null or p_amount < 0 then
    return null;
  end if;
  if upper(coalesce(p_currency, 'EUR')) = 'EUR' then
    return round(p_amount * 1000000)::bigint;
  end if;
  select f.rate_to_eur into v_fx from public.fx_rates f
  where f.currency = upper(p_currency) and f.date <= p_on
  order by f.date desc limit 1;
  if v_fx is null then
    return null;
  end if;
  return round(p_amount * 1000000 * v_fx)::bigint;
end;
$$;

-- Contactos para los incidentes: nunca el contacto entero.
create or replace function public.reservations_mask_contact(p_contact text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_contact is null or btrim(p_contact) = '' then null
    when position('@' in p_contact) > 0 then
      left(split_part(p_contact, '@', 1), 1) || '***@' || left(split_part(p_contact, '@', 2), 1) || '***'
    else
      left(p_contact, 3) || repeat('•', greatest(length(p_contact) - 5, 0)) || right(p_contact, 2)
  end;
$$;

-- ------------------------------------------------------------
-- 6 · Qué canal: UNA función para encolar, reclamar y el respaldo (decisión 153)
-- ------------------------------------------------------------
-- Orden: correo (1) → WhatsApp (2) → SMS (3), solo entre los canales activados y que el comensal puede recibir. El
-- permiso del comensal (`whatsapp_consent`) vale para WhatsApp y SMS. `p_after_order` descarta los de orden menor o
-- igual: el respaldo de un WhatsApp no entregable solo mira el SMS (3).
create or replace function public.reservation_notice_pick_channel(
  p_email text, p_phone text, p_consent boolean,
  p_notify_email boolean, p_notify_whatsapp boolean, p_notify_sms boolean,
  p_after_order integer default 0
)
returns table(channel text, reason text)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_has_email boolean := nullif(btrim(coalesce(p_email, '')), '') is not null;
  v_phone_usable boolean := nullif(btrim(coalesce(p_phone, '')), '') is not null
                            and public.reservation_phone_is_mobile(btrim(p_phone));
  v_can_phone boolean := v_phone_usable and coalesce(p_consent, false);
  v_email_possible boolean := coalesce(p_after_order, 0) < 1 and v_has_email;
  v_wa_possible boolean := coalesce(p_after_order, 0) < 2 and v_can_phone;
  v_sms_possible boolean := coalesce(p_after_order, 0) < 3 and v_can_phone;
begin
  if v_email_possible and coalesce(p_notify_email, false) then
    return query select 'email'::text, null::text;
  elsif v_wa_possible and coalesce(p_notify_whatsapp, false) then
    return query select 'whatsapp'::text, null::text;
  elsif v_sms_possible and coalesce(p_notify_sms, false) then
    return query select 'sms'::text, null::text;
  elsif v_email_possible or v_wa_possible or v_sms_possible then
    return query select null::text, 'messaging_disabled'::text;
  elsif v_phone_usable and not coalesce(p_consent, false) then
    return query select null::text, 'no_consent'::text;
  else
    return query select null::text, 'no_contact'::text;
  end if;
end;
$$;

-- Qué aviso nace de qué evento de la agenda (PRD §6.8, §6.9 y §6.11). `null` = ninguno.
create or replace function public.reservation_notice_template(p_type text, p_data jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_type
    when 'created' then case p_data ->> 'status' when 'pending' then 'pending_received' when 'confirmed' then 'confirmed' end
    when 'confirmed' then 'group_confirmed'
    when 'rejected' then 'group_rejected'
    when 'cancelled' then 'cancelled'
    when 'updated' then
      case
        when p_data ->> 'status_from' = 'confirmed' and p_data ->> 'status_to' = 'pending' then 'pending_received'
        when (p_data -> 'changed') ?| array['date', 'time', 'party_size'] then 'modified'
      end
  end;
$$;

-- ------------------------------------------------------------
-- 7 · Incidentes de Reservas (decisión 161)
-- ------------------------------------------------------------
-- Uno abierto por (restaurante, tipo, código): repetir el mismo problema no llena la lista. Los datos llevan solo
-- códigos; el contacto, enmascarado y en el texto.
create or replace function public.reservations_open_incident(
  p_establishment_id uuid, p_kind text, p_severity text, p_title text, p_detail text, p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
begin
  if v_space is null then
    return;
  end if;
  insert into public.reservation_incidents (space_id, establishment_id, kind, severity, title, detail, data)
  values (v_space, p_establishment_id, p_kind, p_severity, p_title, p_detail, coalesce(p_data, '{}'::jsonb))
  on conflict (establishment_id, kind, (data ->> 'code')) where resolved_at is null and data ? 'code'
  do nothing;
end;
$$;

-- ------------------------------------------------------------
-- 8 · Encolar: solo inserta (decisión 153)
-- ------------------------------------------------------------
-- Se llama desde `reservation_log_event()`, dentro de la transacción de la agenda. NUNCA actualiza ni bloquea: la
-- agenda ya tiene el día y la fila de la reserva, y los avisos se cruzarían con ella. Lo que decide aquí se vuelve a
-- decidir al reclamar.
create or replace function public.reservation_notice_enqueue(
  p_event_id uuid, p_establishment_id uuid, p_reservation_id uuid, p_type text, p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template text := public.reservation_notice_template(p_type, p_data);
  v_r public.reservations;
  v_set public.reservation_settings;
  v_pick record;
begin
  if v_template is null then
    return;
  end if;
  select * into v_r from public.reservations where id = p_reservation_id and establishment_id = p_establishment_id;
  -- Una reserva de plataforma nunca avisa (la plataforma ya lo hace): no se escribe nada.
  if v_r.id is null or v_r.source = 'platform' or v_r.anonymized_at is not null then
    return;
  end if;
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id;
  -- Con Reservas cerrada no se avisa a nadie (decisión 158).
  if v_set.id is null or v_set.service_status = 'closed' then
    return;
  end if;

  select * into v_pick from public.reservation_notice_pick_channel(
    v_r.email, v_r.phone_e164, v_r.whatsapp_consent, v_set.notify_email, v_set.notify_whatsapp, v_set.notify_sms);

  if v_pick.channel is null then
    insert into public.reservation_notifications (space_id, establishment_id, reservation_id, template, channel, language,
                                                  status, skip_reason, event_id)
    values (v_r.space_id, p_establishment_id, p_reservation_id, v_template, null, v_r.language, 'skipped', v_pick.reason, p_event_id)
    on conflict do nothing;
    perform public.reservation_log_event(p_establishment_id, p_reservation_id, 'notification_skipped', 'system', null,
      jsonb_build_object('template', v_template, 'reason', v_pick.reason));
  else
    insert into public.reservation_notifications (space_id, establishment_id, reservation_id, template, channel, language,
                                                  status, next_attempt_at, event_id)
    values (v_r.space_id, p_establishment_id, p_reservation_id, v_template, v_pick.channel, v_r.language,
            'queued', now(), p_event_id)
    on conflict do nothing;
  end if;
end;
$$;

-- `reservation_log_event()` con el gancho. Mismo comportamiento que la de la migración 170 y, para los eventos que
-- avisan, el aviso. Un fallo al preparar el aviso se anota (evento e incidente, sin datos personales) y la reserva se
-- guarda igual: el aviso es lo secundario.
create or replace function public.reservation_log_event(
  p_establishment_id uuid, p_reservation_id uuid, p_type text, p_actor_type text,
  p_platform_name text default null, p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_label text;
  v_event_id uuid;
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
          v_label, coalesce(p_data, '{}'::jsonb))
  returning id into v_event_id;

  if p_type in ('created', 'updated', 'confirmed', 'rejected', 'cancelled') then
    begin
      perform public.reservation_notice_enqueue(v_event_id, p_establishment_id, p_reservation_id, p_type, coalesce(p_data, '{}'::jsonb));
    exception when others then
      begin
        perform public.reservation_log_event(p_establishment_id, p_reservation_id, 'notification_skipped', 'system', null,
          jsonb_build_object('reason', 'enqueue_error'));
        perform public.reservations_open_incident(p_establishment_id, 'system', 'error',
          'No se pudo preparar un aviso a un cliente',
          'Una reserva se guardó, pero su aviso no se pudo preparar. Avisa al cliente por teléfono y díselo a Restavor.',
          jsonb_build_object('code', 'enqueue_error'));
      exception when others then
        null;
      end;
    end;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 9 · Cerrar un aviso y liquidar lo cobrado (RN-AGT-07, decisión 156)
-- ------------------------------------------------------------
-- La devolución es lo NETO del libro de ese aviso (cobro, correcciones y devoluciones anteriores), una sola vez por
-- canal y NUNCA de cero. Quien la llama ya tiene bloqueada la fila de ajustes del restaurante (orden único de la
-- decisión 120: ajustes → aviso → libro); el disparador del libro la vuelve a pedir y ya es suya.
create or replace function public.reservation_notice_settle(p_notice_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n public.reservation_notifications;
  v_net bigint;
  v_prior integer;
begin
  select * into v_n from public.reservation_notifications where id = p_notice_id;
  if v_n.id is null then
    return 0;
  end if;
  select coalesce(sum(e.amount_micros), 0)::bigint into v_net
  from public.agent_balance_entries e
  where e.establishment_id = v_n.establishment_id and e.source_type = 'notification' and e.source_id = p_notice_id;
  if v_net >= 0 then
    return 0;
  end if;
  -- Una devolución por cobro: si el aviso se volvió a cobrar y se vuelve a devolver, la clave lleva un sufijo.
  select count(*) into v_prior from public.agent_balance_entries e
  where e.establishment_id = v_n.establishment_id
    and e.idempotency_key like 'notice:' || p_notice_id::text || ':refund:' || coalesce(v_n.channel, 'none') || '%';
  insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, source_id, idempotency_key)
  values (v_n.space_id, v_n.establishment_id, 'refund', -v_net, 'notification', p_notice_id,
          'notice:' || p_notice_id::text || ':refund:' || coalesce(v_n.channel, 'none') || case when v_prior > 0 then ':' || v_prior::text else '' end)
  on conflict (establishment_id, idempotency_key) where idempotency_key is not null do nothing;
  update public.reservation_notifications set cost_micros = 0, updated_at = now() where id = p_notice_id;
  return -v_net;
end;
$$;

-- Deja el aviso en un estado final (`skipped` o `failed`), lo apunta en el historial y liquida lo cobrado. El motivo
-- es un código. Los avisos obsoletos se cierran sin ruido en el historial: ya salió el último.
create or replace function public.reservation_notice_close(
  p_notice_id uuid, p_status text, p_reason text, p_extra jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n public.reservation_notifications;
begin
  select * into v_n from public.reservation_notifications where id = p_notice_id;
  if v_n.id is null then
    return;
  end if;
  if p_status = 'skipped' then
    update public.reservation_notifications
    set status = 'skipped', skip_reason = p_reason, error = null, next_attempt_at = null, updated_at = now()
    where id = p_notice_id;
    if p_reason <> 'obsolete' then
      perform public.reservation_log_event(v_n.establishment_id, v_n.reservation_id, 'notification_skipped', 'system', null,
        jsonb_build_object('template', v_n.template, 'reason', p_reason) || coalesce(p_extra, '{}'::jsonb));
    end if;
  else
    update public.reservation_notifications
    set status = 'failed', skip_reason = null, error = p_reason, next_attempt_at = null, updated_at = now()
    where id = p_notice_id;
    perform public.reservation_log_event(v_n.establishment_id, v_n.reservation_id, 'notification_failed', 'system', null,
      jsonb_build_object('template', v_n.template, 'channel', v_n.channel, 'reason', p_reason) || coalesce(p_extra, '{}'::jsonb));
  end if;
  perform public.reservation_notice_settle(p_notice_id);
end;
$$;

-- Un WhatsApp que no se puede entregar sale por SMS (decisión 157): fila nueva, mismo evento, en la misma transacción
-- que marca el WhatsApp como fallido. Sin SMS activado (o sin permiso o con un fijo), no hay respaldo.
create or replace function public.reservation_notice_fail_over(p_notice_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n public.reservation_notifications;
  v_r public.reservations;
  v_set public.reservation_settings;
  v_pick record;
  v_new uuid;
begin
  select * into v_n from public.reservation_notifications where id = p_notice_id;
  if v_n.id is null then
    return false;
  end if;
  select * into v_r from public.reservations where id = v_n.reservation_id;
  select * into v_set from public.reservation_settings where establishment_id = v_n.establishment_id;
  if v_r.id is null or v_r.anonymized_at is not null or v_set.id is null or v_set.service_status = 'closed' then
    return false;
  end if;
  select * into v_pick from public.reservation_notice_pick_channel(
    v_r.email, v_r.phone_e164, v_r.whatsapp_consent, v_set.notify_email, v_set.notify_whatsapp, v_set.notify_sms, 2);
  if v_pick.channel is distinct from 'sms' then
    return false;
  end if;
  insert into public.reservation_notifications (space_id, establishment_id, reservation_id, template, channel, language,
                                                status, next_attempt_at, event_id, fallback_of)
  values (v_n.space_id, v_n.establishment_id, v_n.reservation_id, v_n.template, 'sms', v_r.language,
          'queued', now(), v_n.event_id, v_n.id)
  on conflict do nothing
  returning id into v_new;
  return v_new is not null;
end;
$$;

-- ------------------------------------------------------------
-- 10 · Reclamar avisos (decisiones 155, 156, 164 y 165)
-- ------------------------------------------------------------
-- Prepara UN aviso: relee la reserva, descarta lo obsoleto, vuelve a decidir el canal, comprueba los datos del
-- restaurante y el destino, y cobra. Devuelve lo necesario para redactar y enviar, o null si el aviso ya quedó resuelto
-- (omitido o fallido). Quien la llama tiene bloqueada la fila de ajustes del restaurante.
create or replace function public.reservation_notice_prepare(
  p_notice_id uuid, p_allowlist text[], p_enforce_allowlist boolean, p_block_reserved boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n public.reservation_notifications;
  v_r public.reservations;
  v_set public.reservation_settings;
  v_e public.establishments;
  v_pick record;
  v_dest text;
  v_domain text;
  v_country text;
  v_rate bigint;
  v_balance bigint;
  v_charged boolean;
  v_net bigint;
  v_prior integer;
  v_today date;
  v_attempt integer;
begin
  select * into v_n from public.reservation_notifications
  where id = p_notice_id and status = 'queued' and next_attempt_at <= now()
  for update skip locked;
  if v_n.id is null then
    return null;
  end if;
  select * into v_set from public.reservation_settings where establishment_id = v_n.establishment_id;
  select * into v_r from public.reservations where id = v_n.reservation_id;
  select * into v_e from public.establishments where id = v_n.establishment_id;
  v_today := (now() at time zone v_set.timezone)::date;

  -- 1 · Tope de intentos: el cuarto es el último (se aplica aquí, al reclamar, y no solo al informar).
  if v_n.attempts >= 4 then
    perform public.reservation_notice_close(v_n.id, 'failed', 'max_attempts');
    return null;
  end if;

  -- 2 · Obsoleto: la reserva ya no existe para avisar (anonimizada, plataforma, servicio cerrado), ya está cancelada y
  -- el aviso era de otra cosa, o existe un aviso posterior de la misma reserva (solo sale el último).
  if v_r.id is null or v_r.anonymized_at is not null or v_r.source = 'platform' or v_set.service_status = 'closed'
     or (v_n.template in ('confirmed', 'pending_received', 'group_confirmed', 'modified') and v_r.status = 'cancelled')
     or exists (
       select 1
       from public.reservation_notifications n2
       join public.reservation_events e2 on e2.id = n2.event_id
       join public.reservation_events e1 on e1.id = v_n.event_id
       where n2.reservation_id = v_n.reservation_id and n2.id <> v_n.id and n2.status <> 'skipped' and e2.seq > e1.seq
     ) then
    perform public.reservation_notice_close(v_n.id, 'skipped', 'obsolete');
    return null;
  end if;

  -- 3 · Canal: se vuelve a decidir con lo de ahora (el restaurante pudo cambiar los interruptores).
  select * into v_pick from public.reservation_notice_pick_channel(
    v_r.email, v_r.phone_e164, v_r.whatsapp_consent, v_set.notify_email, v_set.notify_whatsapp, v_set.notify_sms,
    case when v_n.fallback_of is not null then 2 else 0 end);
  if v_pick.channel is null then
    perform public.reservation_notice_close(v_n.id, 'skipped', v_pick.reason);
    return null;
  end if;
  if v_pick.channel is distinct from v_n.channel then
    -- Lo cobrado por el canal anterior se devuelve antes de cambiar.
    perform public.reservation_notice_settle(v_n.id);
    update public.reservation_notifications set channel = v_pick.channel, updated_at = now() where id = v_n.id;
    v_n.channel := v_pick.channel;
  end if;

  -- 4 · Datos del restaurante: sin teléfono (y sin dirección en «confirmada» y «grupo aceptado») el texto no sería el
  -- de `textos-avisos.md`: no sale y deja un incidente.
  if nullif(btrim(coalesce(v_set.local_phone_e164, '')), '') is null
     or (v_n.template in ('confirmed', 'group_confirmed') and nullif(btrim(coalesce(v_e.address, '')), '') is null) then
    perform public.reservation_notice_close(v_n.id, 'skipped', 'missing_data');
    perform public.reservations_open_incident(v_n.establishment_id, 'system', 'error',
      'Faltan datos del restaurante para avisar a los clientes',
      'Un aviso no ha salido porque falta el teléfono del local o la dirección del restaurante. Complétalos y avisa al cliente por teléfono.',
      jsonb_build_object('code', 'missing_data'));
    return null;
  end if;

  -- 5 · Destino: nunca a un dominio reservado ni, fuera de producción con proveedor real, a quien no esté en la lista.
  v_dest := btrim(case v_n.channel when 'email' then v_r.email else v_r.phone_e164 end);
  if p_block_reserved and v_n.channel = 'email' then
    v_domain := lower(split_part(v_dest, '@', 2));
    if v_domain ~ '(^|\.)(test|example|invalid|localhost)$' or v_domain in ('example.com', 'example.org', 'example.net') then
      perform public.reservation_notice_close(v_n.id, 'skipped', 'not_allowed');
      return null;
    end if;
  end if;
  if coalesce(p_enforce_allowlist, false)
     and not exists (select 1 from unnest(coalesce(p_allowlist, '{}'::text[])) a where lower(btrim(a)) = lower(v_dest)) then
    perform public.reservation_notice_close(v_n.id, 'skipped', 'not_allowed');
    return null;
  end if;

  -- 6 · Coste real (RN-AGT-07): tarifa del país del número y saldo ≥ tarifa, con la fila de ajustes bloqueada. Un
  -- reintento no vuelve a cobrar ni a mirar el saldo: la clave de idempotencia es la del cobro.
  if v_n.channel in ('whatsapp', 'sms') then
    -- «Ya cobrado» es lo NETO del libro de ese aviso, no que exista la clave: si se cobró y se devolvió (cambió de canal
    -- y volvió) hay que cobrar de nuevo, con una clave nueva, o saldría gratis.
    select coalesce(sum(e.amount_micros), 0)::bigint into v_net
    from public.agent_balance_entries e
    where e.establishment_id = v_n.establishment_id and e.source_type = 'notification' and e.source_id = v_n.id;
    v_charged := v_net < 0;
    if not v_charged then
      v_country := public.reservation_phone_country(v_dest);
      v_rate := public.messaging_rate_micros(case v_n.channel when 'whatsapp' then 'whatsapp_utility' else 'sms' end,
                                             v_country, v_today);
      if v_rate is null then
        perform public.reservation_notice_close(v_n.id, 'skipped', 'no_rate');
        perform public.reservations_open_incident(v_n.establishment_id, v_n.channel, 'error',
          'Falta la tarifa de un país para avisar por ' || case v_n.channel when 'whatsapp' then 'WhatsApp' else 'SMS' end,
          'Un aviso no ha salido porque no hay tarifa cargada para el país ' || coalesce(v_country, 'desconocido') || '.',
          jsonb_build_object('code', 'no_rate_' || lower(coalesce(v_country, 'xx'))));
        return null;
      end if;
      select coalesce(sum(e.amount_micros), 0)::bigint into v_balance
      from public.agent_balance_entries e where e.establishment_id = v_n.establishment_id;
      if v_balance < v_rate then
        perform public.reservation_notice_close(v_n.id, 'skipped', 'no_balance');
        return null;
      end if;
      select count(*) into v_prior from public.agent_balance_entries e
      where e.establishment_id = v_n.establishment_id and e.idempotency_key like 'notice:' || v_n.id::text || ':charge:' || v_n.channel || '%';
      insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, source_id, idempotency_key)
      values (v_n.space_id, v_n.establishment_id, v_n.channel, -v_rate, 'notification', v_n.id,
              'notice:' || v_n.id::text || ':charge:' || v_n.channel || case when v_prior > 0 then ':' || v_prior::text else '' end)
      on conflict (establishment_id, idempotency_key) where idempotency_key is not null do nothing;
      update public.reservation_notifications set cost_micros = v_rate where id = v_n.id;
    end if;
  end if;

  -- 7 · Arrendar cinco minutos: si el servidor se cae, el aviso vuelve a la cola solo.
  update public.reservation_notifications
  set recipient = v_dest, attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes',
      language = v_r.language, updated_at = now()
  where id = v_n.id
  returning attempts into v_attempt;

  return jsonb_build_object(
    'notice_id', v_n.id,
    'attempt', v_attempt,
    'template', v_n.template,
    'channel', v_n.channel,
    'language', v_r.language,
    'recipient', v_dest,
    'customer_name', v_r.customer_name,
    'date', v_r.date,
    'time', to_char(v_r.time, 'HH24:MI'),
    'party_size', v_r.party_size,
    'link_token', left(v_r.cancel_token, 32),
    'restaurant', jsonb_build_object(
      'name', v_e.name,
      'phone', v_set.local_phone_e164,
      'address', nullif(btrim(coalesce(v_e.address, '')), ''),
      'city', nullif(btrim(coalesce(v_e.city, '')), ''),
      'email', nullif(btrim(coalesce(v_e.contact_email, '')), '')));
end;
$$;

-- Los restaurantes con avisos por enviar (lo que mira la tarea de cada minuto).
create or replace function public.reservation_notice_due_establishments(p_limit integer default 50)
returns table(establishment_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select n.establishment_id
  from public.reservation_notifications n
  where n.status = 'queued' and n.next_attempt_at <= now()
  group by n.establishment_id
  order by min(n.next_attempt_at), n.establishment_id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Un restaurante por llamada, bloqueando la fila de ajustes UNA vez (ajustes → aviso → libro). Un aviso que da un
-- error inesperado se marca fallido FUERA de su bloque, con un incidente: no se queda a la cabeza de la cola.
create or replace function public.claim_reservation_notices(
  p_establishment_id uuid,
  p_limit integer default 10,
  p_allowlist text[] default null,
  p_enforce_allowlist boolean default false,
  p_block_reserved boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.reservation_settings;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_ids uuid[];
  v_id uuid;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id for update;
  if v_set.id is null then
    return v_items;
  end if;

  select coalesce(array_agg(c.id order by c.created_at, c.id), '{}'::uuid[]) into v_ids
  from (
    select n.id, n.created_at from public.reservation_notifications n
    where n.establishment_id = p_establishment_id and n.status = 'queued' and n.next_attempt_at <= now()
    order by n.created_at, n.id
    limit v_limit
  ) c;

  foreach v_id in array v_ids loop
    begin
      v_item := public.reservation_notice_prepare(v_id, p_allowlist, coalesce(p_enforce_allowlist, false),
                                                  coalesce(p_block_reserved, true));
      if v_item is not null then
        v_items := v_items || jsonb_build_array(v_item);
      end if;
    exception when others then
      begin
        update public.reservation_notifications
        set status = 'failed', skip_reason = null, error = 'claim_error', next_attempt_at = null, updated_at = now()
        where id = v_id and status = 'queued';
        perform public.reservation_notice_settle(v_id);
        perform public.reservations_open_incident(p_establishment_id, 'system', 'error',
          'No se pudo preparar el envío de un aviso',
          'Un aviso a un cliente no se pudo enviar por un fallo interno. Avisa al cliente por teléfono y díselo a Restavor.',
          jsonb_build_object('code', 'claim_error'));
      exception when others then
        -- Ni siquiera se pudo marcar fallido: que no se quede a la cabeza de la cola cada minuto.
        begin
          update public.reservation_notifications
          set attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes', updated_at = now()
          where id = v_id and status = 'queued';
        exception when others then
          null;
        end;
      end;
    end;
  end loop;
  return v_items;
end;
$$;

-- ------------------------------------------------------------
-- 11 · Informar del envío (decisión 155)
-- ------------------------------------------------------------
-- Solo vale si el aviso sigue en cola y `p_attempt` es su intento vigente: el informe del intento 1 que llega después
-- del 2 no cambia nada. `sent` · `retry` (1, 5 y 15 minutos) · `failed` · `undeliverable` · `config`.
create or replace function public.report_reservation_notice(
  p_notice_id uuid, p_attempt integer, p_result text,
  p_provider text default null, p_provider_message_id text default null, p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_est uuid;
  v_set public.reservation_settings;
  v_n public.reservation_notifications;
  v_code text;
  v_fb boolean;
  v_wait integer[] := array[1, 5, 15];
begin
  if p_result is null or p_result not in ('sent', 'retry', 'failed', 'undeliverable', 'config') then
    raise exception 'Resultado de envío no válido';
  end if;
  if p_provider is not null and p_provider not in ('fake', 'resend', 'meta', 'sms') then
    raise exception 'Proveedor no válido';
  end if;
  v_code := case when p_error ~ '^[a-z0-9_.:-]{1,60}$' then p_error else null end;

  select n.establishment_id into v_est from public.reservation_notifications n where n.id = p_notice_id;
  if v_est is null then
    return jsonb_build_object('outcome', 'unknown');
  end if;
  select * into v_set from public.reservation_settings where establishment_id = v_est for update;
  select * into v_n from public.reservation_notifications where id = p_notice_id for update;
  if v_n.status <> 'queued' or v_n.attempts <> p_attempt then
    return jsonb_build_object('outcome', 'stale', 'status', v_n.status);
  end if;

  if p_result = 'sent' then
    update public.reservation_notifications
    set status = 'sent', sent_at = now(), provider = coalesce(p_provider, provider),
        provider_message_id = coalesce(provider_message_id, p_provider_message_id),
        next_attempt_at = null, error = null, updated_at = now()
    where id = p_notice_id;
    perform public.reservation_log_event(v_n.establishment_id, v_n.reservation_id, 'notification_sent', 'system', null,
      jsonb_build_object('template', v_n.template, 'channel', v_n.channel));
    return jsonb_build_object('outcome', 'sent');
  elsif p_result = 'retry' then
    if v_n.attempts >= 4 then
      perform public.reservation_notice_close(p_notice_id, 'failed', 'max_attempts');
      return jsonb_build_object('outcome', 'failed');
    end if;
    update public.reservation_notifications
    set next_attempt_at = now() + make_interval(mins => v_wait[v_n.attempts]), error = v_code, updated_at = now()
    where id = p_notice_id;
    return jsonb_build_object('outcome', 'retry', 'in_minutes', v_wait[v_n.attempts]);
  elsif p_result = 'undeliverable' then
    if v_n.channel = 'whatsapp' then
      v_fb := public.reservation_notice_fail_over(p_notice_id);
      perform public.reservation_notice_close(p_notice_id, 'failed', 'whatsapp_undeliverable',
        case when v_fb then jsonb_build_object('fallback', 'sms') else '{}'::jsonb end);
      return jsonb_build_object('outcome', 'failed', 'fallback', v_fb);
    elsif v_n.channel = 'email' then
      perform public.reservation_notice_close(p_notice_id, 'failed', 'email_undeliverable');
      perform public.reservations_open_incident(v_n.establishment_id, 'email', 'error',
        'Un correo a un cliente no se pudo entregar',
        'La dirección ' || coalesce(public.reservations_mask_contact(v_n.recipient), 'del cliente') || ' no existe o no acepta correo.',
        jsonb_build_object('code', 'bounce'));
      return jsonb_build_object('outcome', 'failed');
    end if;
    perform public.reservation_notice_close(p_notice_id, 'failed', 'sms_undeliverable');
    return jsonb_build_object('outcome', 'failed');
  elsif p_result = 'config' then
    perform public.reservation_notice_close(p_notice_id, 'failed', 'provider_not_configured');
    if v_code = 'no_site_url' then
      perform public.reservations_open_incident(v_n.establishment_id, v_n.channel, 'error',
        'Falta la dirección pública del sitio para escribir el enlace de cancelar',
        'Un aviso a un cliente no ha salido porque el servidor no tiene configurada la dirección pública del sitio. Díselo a Restavor.',
        jsonb_build_object('code', 'no_site_url'));
    else
      perform public.reservations_open_incident(v_n.establishment_id, v_n.channel, 'error',
        'El envío de ' || case v_n.channel when 'email' then 'correos' when 'whatsapp' then 'WhatsApp' else 'SMS' end || ' no está configurado',
        'Un aviso a un cliente no ha salido porque el proveedor no está configurado o rechaza las credenciales. Díselo a Restavor.',
        jsonb_build_object('code', 'not_configured'));
    end if;
    return jsonb_build_object('outcome', 'failed');
  end if;

  perform public.reservation_notice_close(p_notice_id, 'failed', coalesce(v_code, 'provider_error'));
  return jsonb_build_object('outcome', 'failed');
end;
$$;

-- ------------------------------------------------------------
-- 12 · Lo que cuenta el proveedor después (webhooks y botones de Pruebas)
-- ------------------------------------------------------------
-- Estados monótonos: `queued` < `sent` < `delivered`; `failed` y `skipped` son finales. Un `delivered` nunca vuelve
-- a `failed`. `price`: el precio real del SMS decide el cobro (no el estado): una sola corrección por aviso.
create or replace function public.reservation_notice_provider_event(
  p_notice_id uuid, p_provider text, p_provider_message_id text, p_event text,
  p_price_amount numeric default null, p_price_currency text default null, p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_est uuid;
  v_set public.reservation_settings;
  v_n public.reservation_notifications;
  v_code text;
  v_fb boolean;
  v_net bigint;
  v_final bigint;
  v_adj bigint;
  v_today date;
begin
  if p_event is null or p_event not in ('delivered', 'failed', 'undeliverable', 'not_charged', 'price') then
    raise exception 'Suceso de proveedor no válido';
  end if;
  if p_provider is not null and p_provider not in ('fake', 'resend', 'meta', 'sms') then
    raise exception 'Proveedor no válido';
  end if;
  v_code := case when p_error ~ '^[a-z0-9_.:-]{1,60}$' then p_error else null end;

  if p_notice_id is not null then
    select n.id, n.establishment_id into v_id, v_est from public.reservation_notifications n where n.id = p_notice_id;
  elsif p_provider is not null and p_provider_message_id is not null then
    select n.id, n.establishment_id into v_id, v_est from public.reservation_notifications n
    where n.provider = p_provider and n.provider_message_id = p_provider_message_id;
  end if;
  if v_id is null then
    return jsonb_build_object('outcome', 'unknown');
  end if;

  select * into v_set from public.reservation_settings where establishment_id = v_est for update;
  select * into v_n from public.reservation_notifications where id = v_id for update;
  v_today := (now() at time zone coalesce(v_set.timezone, 'Europe/Madrid'))::date;

  if p_event = 'delivered' then
    if v_n.status in ('queued', 'sent') then
      update public.reservation_notifications
      set status = 'delivered', delivered_at = now(), sent_at = coalesce(sent_at, now()), next_attempt_at = null, error = null,
          provider = coalesce(provider, p_provider),
          provider_message_id = coalesce(provider_message_id, p_provider_message_id), updated_at = now()
      where id = v_id;
      return jsonb_build_object('outcome', 'delivered');
    end if;
    return jsonb_build_object('outcome', 'ignored', 'status', v_n.status);

  elsif p_event = 'failed' then
    if v_n.status in ('queued', 'sent') then
      perform public.reservation_notice_close(v_id, 'failed', coalesce(v_code, 'provider_failed'));
      return jsonb_build_object('outcome', 'failed');
    end if;
    return jsonb_build_object('outcome', 'ignored', 'status', v_n.status);

  elsif p_event = 'undeliverable' then
    if v_n.status not in ('queued', 'sent') then
      return jsonb_build_object('outcome', 'ignored', 'status', v_n.status);
    end if;
    if v_n.channel = 'whatsapp' then
      v_fb := public.reservation_notice_fail_over(v_id);
      perform public.reservation_notice_close(v_id, 'failed', 'whatsapp_undeliverable',
        case when v_fb then jsonb_build_object('fallback', 'sms') else '{}'::jsonb end);
      return jsonb_build_object('outcome', 'failed', 'fallback', v_fb);
    elsif v_n.channel = 'email' then
      perform public.reservation_notice_close(v_id, 'failed', 'email_undeliverable');
      perform public.reservations_open_incident(v_n.establishment_id, 'email', 'error',
        'Un correo a un cliente no se pudo entregar',
        'La dirección ' || coalesce(public.reservations_mask_contact(v_n.recipient), 'del cliente') || ' no existe o no acepta correo.',
        jsonb_build_object('code', 'bounce'));
      return jsonb_build_object('outcome', 'failed');
    end if;
    perform public.reservation_notice_close(v_id, 'failed', 'sms_undeliverable');
    return jsonb_build_object('outcome', 'failed');

  elsif p_event = 'not_charged' then
    -- Solo si Meta dice que ese mensaje no se cobra (`pricing.billable = false`).
    if v_n.channel = 'whatsapp' and v_n.status in ('queued', 'sent', 'delivered') then
      perform public.reservation_notice_settle(v_id);
      update public.reservation_notifications set price_final_at = now(), cost_micros = 0, updated_at = now() where id = v_id;
      return jsonb_build_object('outcome', 'refunded');
    end if;
    return jsonb_build_object('outcome', 'ignored', 'status', v_n.status);

  end if;

  -- price
  if v_n.channel is distinct from 'sms' or v_n.price_final_at is not null or v_n.status = 'skipped' then
    return jsonb_build_object('outcome', 'ignored', 'status', v_n.status);
  end if;
  v_final := public.reservation_to_eur_micros(p_price_amount, p_price_currency, v_today);
  if v_final is null then
    -- Sin cambio de moneda se queda el precio provisional y se avisa; nunca se toma el importe como euros.
    update public.reservation_notifications
    set price_original = p_price_amount, price_currency = upper(p_price_currency), updated_at = now()
    where id = v_id;
    perform public.reservations_open_incident(v_n.establishment_id, 'sms', 'error',
      'No se pudo ajustar el precio real de un SMS',
      'El proveedor cobra en una moneda sin cambio a euros cargado. Queda el precio provisional.',
      jsonb_build_object('code', 'no_fx'));
    return jsonb_build_object('outcome', 'no_fx');
  end if;
  select coalesce(sum(e.amount_micros), 0)::bigint into v_net
  from public.agent_balance_entries e
  where e.establishment_id = v_est and e.source_type = 'notification' and e.source_id = v_id;
  v_adj := (-v_final) - v_net;
  if v_adj <> 0 then
    insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, source_id, idempotency_key)
    values (v_n.space_id, v_est, case when v_adj < 0 then 'sms' else 'refund' end, v_adj, 'notification', v_id,
            'notice:' || v_id::text || ':price')
    on conflict (establishment_id, idempotency_key) where idempotency_key is not null do nothing;
  end if;
  update public.reservation_notifications
  set price_final_at = now(), price_original = p_price_amount, price_currency = upper(coalesce(p_price_currency, 'EUR')),
      cost_micros = v_final, updated_at = now()
  where id = v_id;
  return jsonb_build_object('outcome', 'priced', 'adjustment_micros', v_adj);
end;
$$;

-- Los SMS cuyo precio real falta por consultar: cada 10 minutos, hasta 20 veces, desde 2 minutos después del envío.
-- Marca la consulta al devolverlos (no los cobra: solo los reparte).
create or replace function public.reservation_notices_price_pending(p_limit integer default 50)
returns table(notice_id uuid, provider text, provider_message_id text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select n.id from public.reservation_notifications n
    where n.channel = 'sms' and n.provider = 'sms' and n.provider_message_id is not null and n.price_final_at is null
      and n.status in ('sent', 'delivered', 'failed')
      and n.sent_at is not null and n.sent_at <= now() - interval '2 minutes' and n.sent_at > now() - interval '2 days'
      and n.price_checks < 20
      and (n.price_checked_at is null or n.price_checked_at <= now() - interval '10 minutes')
    order by n.sent_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked
  )
  update public.reservation_notifications n
  set price_checked_at = now(), price_checks = n.price_checks + 1
  from due
  where n.id = due.id
  returning n.id, n.provider, n.provider_message_id;
end;
$$;

-- ------------------------------------------------------------
-- 13 · El enlace del comensal (decisión 154)
-- ------------------------------------------------------------
-- El enlace usa los 32 primeros caracteres del token (128 bits): el token entero no cabe en un SMS. Ver no escribe
-- nada. Ninguna de las dos funciones devuelve más que lo del propio comensal y lo público del restaurante.
create unique index reservations_cancel_token_short_idx on public.reservations (left(cancel_token, 32));

create or replace function public.reservation_customer_view(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r public.reservations;
  v_set public.reservation_settings;
  v_e public.establishments;
  v_deadline timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  select * into v_r from public.reservations where left(cancel_token, 32) = p_token;
  if v_r.id is null or v_r.source = 'platform' or v_r.anonymized_at is not null then
    return jsonb_build_object('found', false);
  end if;
  select * into v_set from public.reservation_settings where establishment_id = v_r.establishment_id;
  select * into v_e from public.establishments where id = v_r.establishment_id;
  if v_set.id is null then
    return jsonb_build_object('found', false);
  end if;
  v_deadline := v_r.starts_at - make_interval(mins => v_set.customer_cancel_limit_minutes);
  return jsonb_build_object(
    'found', true,
    'status', v_r.status,
    'cancel_reason', v_r.cancel_reason,
    'date', v_r.date,
    'time', to_char(v_r.time, 'HH24:MI'),
    'starts_at', v_r.starts_at,
    'party_size', v_r.party_size,
    'customer_name', v_r.customer_name,
    'language', v_r.language,
    'service_status', v_set.service_status,
    'timezone', v_set.timezone,
    'cancel_deadline', v_deadline,
    'server_now', now(),
    'can_cancel', v_r.status in ('pending', 'confirmed') and v_set.service_status in ('active', 'past_due', 'paused', 'ending')
                  and now() <= v_deadline,
    'restaurant', jsonb_build_object(
      'name', v_e.name,
      'city', nullif(btrim(coalesce(v_e.city, '')), ''),
      'address', nullif(btrim(coalesce(v_e.address, '')), ''),
      'phone', v_set.local_phone_e164));
end;
$$;

-- Cancelar desde el enlace: actor `customer`, motivo `customer_link`, plazo exacto, y repetir no duplica el efecto. Con
-- Reservas en pausa funciona (PRD §6.12); cerrada, no. La cancelación del propio comensal también avisa (PRD §6.9).
create or replace function public.reservation_customer_cancel(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_est uuid;
  v_source text;
  v_set public.reservation_settings;
  v_row public.reservations;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  select r.id, r.establishment_id, r.source into v_id, v_est, v_source
  from public.reservations r where left(r.cancel_token, 32) = p_token;
  if v_id is null or v_source = 'platform' then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  select * into v_set from public.reservation_settings where establishment_id = v_est;
  if v_set.id is null or v_set.service_status not in ('active', 'past_due', 'paused', 'ending') then
    return jsonb_build_object('outcome', 'closed');
  end if;

  -- El día primero y la fila después (decisión 120): la misma puerta que el restaurante.
  v_row := public.reservation_for_update(v_est, v_id);
  if v_row.anonymized_at is not null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_row.status = 'cancelled' then
    return jsonb_build_object('outcome', 'already_cancelled', 'cancel_reason', v_row.cancel_reason);
  end if;
  if v_row.status not in ('pending', 'confirmed') then
    return jsonb_build_object('outcome', 'not_cancellable');
  end if;
  if now() > v_row.starts_at - make_interval(mins => v_set.customer_cancel_limit_minutes) then
    return jsonb_build_object('outcome', 'deadline_passed');
  end if;
  perform public.reservation_set_status(v_row, 'cancelled', 'cancelled', 'customer', 'customer_link',
    jsonb_build_object('reason', 'customer_link'));
  -- El restaurante lo usa el servidor para enviar al momento el aviso de «cancelada»; la página no se lo enseña a nadie.
  return jsonb_build_object('outcome', 'cancelled', 'establishment_id', v_est);
end;
$$;

-- ------------------------------------------------------------
-- 14 · Límites de uso y respuesta automática de WhatsApp
-- ------------------------------------------------------------
-- `true` = permitido. Cubos con nombre `ruta:número`: un número fijo por ruta, así la tabla no crece sin límite.
create or replace function public.reservation_rate_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_bucket is null or p_bucket !~ '^[a-z_]{1,24}:[0-9]{1,5}$' or p_max is null or p_max < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'Cubo de límite no válido';
  end if;
  insert into public.reservations_rate_limits as l (bucket, count, window_start)
  values (p_bucket, 1, now())
  on conflict (bucket) do update
    set count = case when l.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else l.count + 1 end,
        window_start = case when l.window_start <= now() - make_interval(secs => p_window_seconds) then now() else l.window_start end
  returning l.count into v_count;
  return v_count <= p_max;
end;
$$;

-- A quién responder y en qué idioma (decisión 162): el del último WhatsApp que se le mandó a ese número, con el
-- teléfono del restaurante que se lo mandó. Una respuesta por número y hora.
create or replace function public.whatsapp_autoreply_context(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
begin
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{6,14}$' then
    return jsonb_build_object('allowed', false);
  end if;
  if not public.reservation_rate_limit_hit('autoreply:' || (abs(hashtextextended(p_phone, 0)) % 4096)::text, 1, 3600) then
    return jsonb_build_object('allowed', false);
  end if;
  select n.language, e.name as restaurant_name, s.local_phone_e164 as restaurant_phone into v_ctx
  from public.reservation_notifications n
  join public.establishments e on e.id = n.establishment_id
  join public.reservation_settings s on s.establishment_id = n.establishment_id
  where n.channel = 'whatsapp' and n.recipient = p_phone and n.anonymized_at is null
  order by n.created_at desc
  limit 1;
  if v_ctx.language is null then
    return jsonb_build_object('allowed', true, 'found', false);
  end if;
  return jsonb_build_object('allowed', true, 'found', true, 'language', v_ctx.language,
                            'restaurant_name', v_ctx.restaurant_name, 'restaurant_phone', v_ctx.restaurant_phone);
end;
$$;

-- ------------------------------------------------------------
-- 15 · Cambiar los canales desde la cuenta (decisión 152)
-- ------------------------------------------------------------
-- Con una cuenta (la tablet no los cambia): Propietario, Encargado, Restavor y el soporte dentro de su sesión. Va a
-- la auditoría con quién, cuándo y el valor anterior y el nuevo.
create or replace function public.reservations_audit_setting(p_establishment_id uuid, p_action text, p_old jsonb, p_new jsonb)
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
    -- Lo que hace el soporte dentro de su sesión queda con la sesión (PRD §3.4).
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
    case p_action
      when 'staff_added' then 'reservations.staff_added'
      when 'staff_pin_changed' then 'reservations.staff_pin_changed'
      when 'staff_removed' then 'reservations.staff_removed'
      when 'my_pin_set' then 'reservations.my_pin_set'
      when 'device_activated' then 'reservations.device_activated'
      when 'device_revoked' then 'reservations.device_revoked'
      when 'pin_locked' then 'reservations.pin_locked'
      when 'pin_collision' then 'reservations.pin_collision'
      when 'support_session_opened' then 'reservations.support_session_opened'
      when 'support_session_closed' then 'reservations.support_session_closed'
      when 'notice_channels_changed' then 'reservations.notice_channels_changed'
    end,
    'establishment', p_establishment_id, p_old, v_new
  );
end;
$$;

create or replace function public.set_notice_channels(p_establishment_id uuid, p_email boolean, p_whatsapp boolean, p_sms boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_set public.reservation_settings;
begin
  if p_email is null or p_whatsapp is null or p_sms is null then
    raise exception 'Elige, para cada canal, si se usa o no';
  end if;
  v_actor := public.reservations_settings_actor(p_establishment_id);
  if v_actor = 'system' then
    raise exception 'Hace falta una sesión';
  end if;
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id for update;
  if v_set.id is null then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_set.notify_email = p_email and v_set.notify_whatsapp = p_whatsapp and v_set.notify_sms = p_sms then
    return;
  end if;
  update public.reservation_settings
  set notify_email = p_email, notify_whatsapp = p_whatsapp, notify_sms = p_sms, updated_at = now()
  where id = v_set.id;
  perform public.reservations_audit_setting(p_establishment_id, 'notice_channels_changed',
    jsonb_build_object('email', v_set.notify_email, 'whatsapp', v_set.notify_whatsapp, 'sms', v_set.notify_sms),
    jsonb_build_object('email', p_email, 'whatsapp', p_whatsapp, 'sms', p_sms));
end;
$$;

-- ------------------------------------------------------------
-- 16 · Pruebas › Mensajes con el proveedor falso (decisión 159)
-- ------------------------------------------------------------
-- El proveedor falso no tiene tabla propia: sus mensajes son los avisos con `provider = 'fake'`, y la pantalla de
-- Pruebas los redacta al vuelo con los datos de ahora. Solo los ve el equipo de Restavor que gestiona clientes (la
-- misma puerta que el umbral de saldo bajo) y SOLO los de proveedor falso: en producción el proveedor falso no se
-- elige nunca (`selectProviders()`), así que aquí no hay filas que ver. Sin la clave `ENABLE_FAKE_MESSAGING` la
-- pantalla ni se enseña.
create or replace function public.reservation_fake_notices(p_space_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_space_id is null or not public.has_capability(p_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para ver los mensajes de prueba';
  end if;
  return coalesce((
    select jsonb_agg(x.item order by x.created_at desc)
    from (
      select n.created_at,
             jsonb_build_object(
               'notice_id', n.id,
               'establishment_id', n.establishment_id,
               'establishment_name', e.name,
               'template', n.template,
               'channel', n.channel,
               'language', n.language,
               'status', n.status,
               'attempts', n.attempts,
               'cost_micros', n.cost_micros,
               'price_final', n.price_final_at is not null,
               'recipient', n.recipient,
               'customer_name', r.customer_name,
               'date', r.date,
               'time', to_char(r.time, 'HH24:MI'),
               'party_size', r.party_size,
               'link_token', left(r.cancel_token, 32),
               'created_at', n.created_at,
               'restaurant', jsonb_build_object(
                 'name', e.name,
                 'phone', s.local_phone_e164,
                 'address', nullif(btrim(coalesce(e.address, '')), ''),
                 'email', nullif(btrim(coalesce(e.contact_email, '')), ''))
             ) as item
      from public.reservation_notifications n
      join public.reservations r on r.id = n.reservation_id
      join public.establishments e on e.id = n.establishment_id
      join public.reservation_settings s on s.establishment_id = n.establishment_id
      where n.space_id = p_space_id and n.provider = 'fake'
      order by n.created_at desc
      limit 100
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Los botones de Pruebas › Mensajes (entregado, no entregable, precio real…): llaman a la MISMA función que los webhooks.
create or replace function public.reservation_fake_notice_event(p_notice_id uuid, p_event text, p_price_amount numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
  v_provider text;
begin
  select n.space_id, n.provider into v_space, v_provider from public.reservation_notifications n where n.id = p_notice_id;
  if v_space is null then
    raise exception 'Aviso no encontrado';
  end if;
  if auth.uid() is null or not public.has_capability(v_space, 'manage_clients') then
    raise exception 'No tienes permiso para simular sucesos de mensajes de prueba';
  end if;
  if v_provider is distinct from 'fake' then
    raise exception 'Solo se simulan sucesos de los mensajes de prueba';
  end if;
  if p_event is null or p_event not in ('delivered', 'undeliverable', 'failed', 'not_charged', 'price') then
    raise exception 'Suceso no válido';
  end if;
  return public.reservation_notice_provider_event(p_notice_id, 'fake', null, p_event, p_price_amount,
    case when p_event = 'price' then 'EUR' end, case when p_event = 'failed' then 'fake_failed' end);
end;
$$;

-- ------------------------------------------------------------
-- 17 · Privilegios (CLAUDE.md: «nunca solo `from public`»)
-- ------------------------------------------------------------
-- Internas: ninguna puerta por RPC.
revoke all on function public.reservation_phone_country(text) from public, anon, authenticated;
revoke all on function public.reservation_phone_is_mobile(text) from public, anon, authenticated;
revoke all on function public.messaging_rate_micros(text, text, date) from public, anon, authenticated;
revoke all on function public.reservation_to_eur_micros(numeric, text, date) from public, anon, authenticated;
revoke all on function public.reservations_mask_contact(text) from public, anon, authenticated;
revoke all on function public.reservation_notice_pick_channel(text, text, boolean, boolean, boolean, boolean, integer) from public, anon, authenticated;
revoke all on function public.reservation_notice_template(text, jsonb) from public, anon, authenticated;
revoke all on function public.reservations_open_incident(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.reservation_notice_enqueue(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.reservation_notice_settle(uuid) from public, anon, authenticated;
revoke all on function public.reservation_notice_close(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.reservation_notice_fail_over(uuid) from public, anon, authenticated;
revoke all on function public.reservation_notice_prepare(uuid, text[], boolean, boolean) from public, anon, authenticated;

-- Del servidor (`service_role`): el motor de avisos y el enlace del comensal.
revoke all on function public.reservation_notice_due_establishments(integer) from public, anon, authenticated;
grant execute on function public.reservation_notice_due_establishments(integer) to service_role;
revoke all on function public.claim_reservation_notices(uuid, integer, text[], boolean, boolean) from public, anon, authenticated;
grant execute on function public.claim_reservation_notices(uuid, integer, text[], boolean, boolean) to service_role;
revoke all on function public.report_reservation_notice(uuid, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.report_reservation_notice(uuid, integer, text, text, text, text) to service_role;
revoke all on function public.reservation_notice_provider_event(uuid, text, text, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.reservation_notice_provider_event(uuid, text, text, text, numeric, text, text) to service_role;
revoke all on function public.reservation_notices_price_pending(integer) from public, anon, authenticated;
grant execute on function public.reservation_notices_price_pending(integer) to service_role;
revoke all on function public.reservation_customer_view(text) from public, anon, authenticated;
grant execute on function public.reservation_customer_view(text) to service_role;
revoke all on function public.reservation_customer_cancel(text) from public, anon, authenticated;
grant execute on function public.reservation_customer_cancel(text) to service_role;
revoke all on function public.reservation_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.reservation_rate_limit_hit(text, integer, integer) to service_role;
revoke all on function public.whatsapp_autoreply_context(text) from public, anon, authenticated;
grant execute on function public.whatsapp_autoreply_context(text) to service_role;

-- Desde la cuenta de una persona.
revoke all on function public.set_notice_channels(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_notice_channels(uuid, boolean, boolean, boolean) to authenticated;

-- Pruebas › Mensajes: desde la sesión de quien gestiona clientes en Restavor (la función comprueba el permiso).
revoke all on function public.reservation_fake_notices(uuid) from public, anon;
grant execute on function public.reservation_fake_notices(uuid) to authenticated;
revoke all on function public.reservation_fake_notice_event(uuid, text, numeric) from public, anon;
grant execute on function public.reservation_fake_notice_event(uuid, text, numeric) to authenticated;
