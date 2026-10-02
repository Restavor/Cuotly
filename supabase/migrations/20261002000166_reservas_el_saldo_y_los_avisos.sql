-- Fase B de Restavor agents (AGT-01) · sexta de siete migraciones.
--
-- El saldo y la mensajería (PRD de agents §5.2 y §8.6):
--
--   1 · `agent_balance_entries`: el libro inmutable del saldo, con signo y en
--       millonésimas de euro (decisión 94, RN-AGT-01). Nunca un contador que se
--       actualiza: el saldo se DERIVA con `agent_balance()`.
--   2 · `agent_topups`: lo que paga el restaurante, en céntimos.
--   3 · `messaging_rates` y `fx_rates`: tarifas de mensajería y cambio de moneda,
--       de la plataforma (sin espacio).
--   4 · `reservation_notifications`: los avisos a los comensales (distinta de
--       `notifications`, que es para usuarios). El destinatario es dato personal.
--
-- Se comprueba con `supabase/tests/reservas_cimientos.sql`.

-- ------------------------------------------------------------
-- 1 · El libro del saldo
-- ------------------------------------------------------------
create table public.agent_balance_entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  kind text not null check (kind in ('topup', 'call', 'whatsapp', 'sms', 'refund', 'adjustment', 'payout')),
  -- Con signo, en millonésimas de euro: un WhatsApp cuesta menos de dos céntimos.
  amount_micros bigint not null,
  agent text not null default 'reservations',
  source_type text,
  source_id uuid,
  -- Idempotencia de la recarga: el mismo webhook de Stripe dos veces es un apunte.
  stripe_checkout_session_id text unique,
  note text,
  -- Quién lo registró: puede ser del equipo de Restavor (ajustes y recargas a
  -- mano). Privilegio de columna (P7).
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  -- RN-AGT-02 · el signo lo fija el tipo de apunte. Un uso gratuito vale cero;
  -- si el proveedor no lo cobra, se devuelve con un `refund`.
  check (
    case kind
      when 'topup' then amount_micros > 0
      when 'refund' then amount_micros > 0
      when 'call' then amount_micros <= 0
      when 'whatsapp' then amount_micros <= 0
      when 'sms' then amount_micros <= 0
      when 'payout' then amount_micros < 0
      else amount_micros <> 0
    end
  ),
  -- Un ajuste de Restavor siempre dice por qué.
  check (kind <> 'adjustment' or (note is not null and btrim(note) <> ''))
);

comment on table public.agent_balance_entries is
  'RN-AGT-01 · libro inmutable del saldo de un restaurante, en millonésimas de euro. Un apunte no se edita ni se borra: una corrección es otro apunte.';

create index agent_balance_entries_establishment_idx
  on public.agent_balance_entries (establishment_id, created_at desc);

-- El saldo se deriva; no se guarda. Para quien tiene derecho a verlo (el
-- restaurante, el equipo del espacio o el servidor).
create or replace function public.agent_balance(p_establishment_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
begin
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  -- El servidor (service_role) no tiene sesión de usuario; todo lo demás, sí.
  -- `coalesce`: sin rol, `reservations_my_role()` devuelve nulo y `nulo in (...)` no es
  -- falso, es nulo; sin ello el `if` no saltaría y se enseñaría el saldo a un extraño.
  if auth.uid() is not null
     and not (public.is_space_member(v_space_id)
              or coalesce(public.reservations_my_role(p_establishment_id) in ('owner', 'manager'), false)) then
    raise exception 'No tienes acceso al saldo de este restaurante';
  end if;

  return coalesce((
    select sum(e.amount_micros)
    from public.agent_balance_entries e
    where e.establishment_id = p_establishment_id
  ), 0)::bigint;
end;
$$;

-- El saldo tal como se enseña: al céntimo, con el redondeo de siempre (medio
-- céntimo se aleja de cero). No es SECURITY DEFINER: quien comprueba el permiso es
-- `agent_balance()`, que es de la que depende.
create or replace function public.agent_balance_cents(p_establishment_id uuid)
returns bigint
language sql
stable
set search_path = public
as $$
  select round(public.agent_balance(p_establishment_id)::numeric / 10000)::bigint;
$$;

revoke all on function public.agent_balance(uuid) from public, anon;
grant execute on function public.agent_balance(uuid) to authenticated, service_role;
revoke all on function public.agent_balance_cents(uuid) from public, anon;
grant execute on function public.agent_balance_cents(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 2 · Recargas
-- ------------------------------------------------------------
create table public.agent_topups (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  stripe_checkout_session_id text unique,
  -- Lo que sube el saldo (sin IVA), el IVA y lo que se paga, en céntimos.
  net_cents integer not null check (net_cents > 0),
  vat_cents integer not null check (vat_cents >= 0),
  total_cents integer not null check (total_cents > 0),
  vat_rate_percent numeric not null check (vat_rate_percent >= 0),
  status text not null default 'created' check (status in ('created', 'paid', 'expired')),
  receipt_sent_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents = net_cents + vat_cents)
);

comment on table public.agent_topups is
  'RN-AGT-04 · una recarga de saldo con tarjeta. Al pagarse, un apunte `topup` por el importe sin IVA; el IVA no es saldo.';

-- ------------------------------------------------------------
-- 3 · Tarifas y cambio de moneda (de la plataforma, sin espacio)
-- ------------------------------------------------------------
create table public.messaging_rates (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp_utility', 'sms')),
  country text not null default 'ES',
  price_micros bigint not null check (price_micros >= 0),
  currency text not null default 'EUR',
  valid_from date not null,
  created_at timestamptz not null default now(),
  unique (channel, country, valid_from)
);

comment on table public.messaging_rates is
  'RN-AGT-03 · precio por mensaje (Meta no lo devuelve en cada mensaje). Solo la edita Restavor. Sin espacio: es de la plataforma.';

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  currency text not null,
  rate_to_eur numeric not null check (rate_to_eur > 0),
  created_at timestamptz not null default now(),
  unique (date, currency)
);

comment on table public.fx_rates is
  'RN-AGT-03 · cambio diario del Banco Central Europeo para convertir el coste de las llamadas. Sin espacio: es de la plataforma.';

-- ------------------------------------------------------------
-- 4 · Avisos a los comensales
-- ------------------------------------------------------------
create table public.reservation_notifications (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  reservation_id uuid not null references public.reservations (id),
  template text not null check (template in (
    'confirmed', 'pending_received', 'group_confirmed', 'group_rejected', 'modified', 'cancelled'
  )),
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  language text not null default 'es' check (language in ('es', 'en')),
  -- Dato personal: se anonimiza con la reserva (RN-RES-12).
  recipient text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  skip_reason text check (skip_reason in (
    'no_balance', 'messaging_disabled', 'platform_source', 'no_contact', 'no_consent'
  )),
  attempts smallint not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  provider_message_id text,
  cost_micros bigint check (cost_micros is null or cost_micros >= 0),
  error text,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'skipped') = (skip_reason is not null))
);

comment on table public.reservation_notifications is
  'RN-RES-10 · avisos a comensales (email, WhatsApp, SMS). Distinta de `notifications`, que es para usuarios. El destinatario es dato personal.';

create index reservation_notifications_reservation_idx
  on public.reservation_notifications (reservation_id);
create index reservation_notifications_queue_idx
  on public.reservation_notifications (next_attempt_at) where status = 'queued';

-- ------------------------------------------------------------
-- RLS, privilegios y solo lectura en soporte
-- ------------------------------------------------------------
alter table public.agent_balance_entries enable row level security;
alter table public.agent_topups enable row level security;
alter table public.messaging_rates enable row level security;
alter table public.fx_rates enable row level security;
alter table public.reservation_notifications enable row level security;

-- Saldo y recargas: el Propietario, el Encargado y el equipo del espacio (PRD §3.2).
create policy agent_balance_entries_select on public.agent_balance_entries
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));
create policy agent_topups_select on public.agent_topups
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));

-- Las dos tablas de la plataforma las lee quien es de la plataforma; el servidor
-- las lee con la clave de servicio.
create policy messaging_rates_select on public.messaging_rates
  for select to authenticated using (public.is_platform_member());
create policy fx_rates_select on public.fx_rates
  for select to authenticated using (public.is_platform_member());

-- Datos de comensales: NUNCA `is_space_member()` (decisión 108).
create policy reservation_notifications_select on public.reservation_notifications
  for select to authenticated
  using (public.reservations_can_read(establishment_id));

revoke all on public.agent_balance_entries from anon, authenticated;
revoke all on public.agent_topups from anon, authenticated;
revoke all on public.messaging_rates from anon, authenticated;
revoke all on public.fx_rates from anon, authenticated;
revoke all on public.reservation_notifications from anon, authenticated;

grant select (id, space_id, establishment_id, kind, amount_micros, agent, source_type, source_id,
              stripe_checkout_session_id, note, created_at)
  on public.agent_balance_entries to authenticated;
-- `created_by` puede ser del equipo de Restavor (recarga registrada a mano): fuera.
grant select (id, space_id, establishment_id, stripe_checkout_session_id, net_cents, vat_cents,
              total_cents, vat_rate_percent, status, receipt_sent_at, created_at, updated_at)
  on public.agent_topups to authenticated;
grant select on public.messaging_rates to authenticated;
grant select on public.fx_rates to authenticated;
grant select on public.reservation_notifications to authenticated;

create trigger agent_balance_entries_guard_support_read_only
  before insert or update or delete on public.agent_balance_entries
  for each row execute function public.guard_support_read_only();
create trigger agent_balance_entries_cuotly_read_only
  before insert or update or delete on public.agent_balance_entries
  for each row execute function public.guard_space_read_only();
create trigger agent_topups_guard_support_read_only
  before insert or update or delete on public.agent_topups
  for each row execute function public.guard_support_read_only();
create trigger agent_topups_cuotly_read_only
  before insert or update or delete on public.agent_topups
  for each row execute function public.guard_space_read_only();
create trigger reservation_notifications_guard_support_read_only
  before insert or update or delete on public.reservation_notifications
  for each row execute function public.guard_support_read_only();
create trigger reservation_notifications_cuotly_read_only
  before insert or update or delete on public.reservation_notifications
  for each row execute function public.guard_space_read_only();
