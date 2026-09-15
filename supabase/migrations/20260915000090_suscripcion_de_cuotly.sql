-- Fase 4 · Hito 18 · la suscripción de Cuotly: Pro, Agency, prueba, cobro
-- manual e impago (PRD §31, RN-SUB-01 a 13; §4.1 a §4.7 de la maestra).
--
-- **Es el mismo problema que el Hito 7 con otro pagador.** Allí un espacio
-- le cobra a sus restaurantes; aquí el propietario del espacio le paga a
-- Cuotly. Las piezas son las mismas y a propósito: un libro inmutable de
-- apuntes con signo, un estado del cobro que se deriva del libro, una
-- confirmación humana del pago (sin Stripe) y un barrido que emite, avisa
-- y corta. Lo que cambia es quién está a cada lado.
--
-- **Tres cosas que este archivo sostiene en el servidor y no en la
-- pantalla**, porque CLAUDE.md dice que ocultar un botón no es un control
-- de acceso:
--
--   · Los **límites** de Pro y de la prueba (RN-SUB-03): un disparador en
--     `establishments` y otro en `space_memberships`. El sexto
--     establecimiento en Pro sin adicional falla al insertarse, venga de
--     donde venga.
--   · El **modo lectura** de un espacio archivado (RN-SUB-08): un
--     disparador en TODA tabla que lleve `space_id`, con una lista corta
--     de exentas que tiene su motivo escrito y un barrido en la suite que
--     exige que cualquier tabla futura lo lleve también.
--   · El **estado del espacio** (RN-SUB-02) solo lo mueven las funciones
--     que dejan evento y auditoría: un `UPDATE` suelto lo rechaza un
--     disparador, como en `establishments`.
--
-- Lo que NO hace, dicho aquí y en el PRD: no elimina nada a los 30 días
-- (bloque legal, pendiente 20), no mide el "uso razonable" (17), no cobra
-- el almacenamiento (18) y no comprueba "una prueba por negocio" (19).

-- ============================================================
-- 1 · El segundo permiso fino de plataforma (§167, RN-SUB-06)
-- ============================================================
--
-- §167: "gestionar suscripciones: Bosco sí; Admin Cuotly si recibe
-- permiso". El primero de los tres (`can_approve_spaces`) llegó con la 89;
-- el de Modo soporte llega con el Hito 19.
alter table public.platform_roles
  add column if not exists can_manage_subscriptions boolean not null default false;

comment on column public.platform_roles.can_manage_subscriptions is
  '§167 · "Gestionar suscripciones: Bosco sí; Admin Cuotly si recibe
   permiso". Confirmar, registrar, rechazar o revertir un pago a Cuotly y
   reactivar un espacio. Concederlo es de Bosco y de nadie más.';

-- Aparece dentro de las políticas de las cuatro tablas de la suscripción,
-- así que CONSERVA el EXECUTE de `authenticated` (CLAUDE.md).
create or replace function public.is_platform_subscription_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
      or exists (
        select 1 from public.platform_roles pr
        where pr.user_id = auth.uid() and pr.can_manage_subscriptions
      );
$$;

comment on function public.is_platform_subscription_manager() is
  '§167, RN-SUB-06 · quién gestiona la suscripción de Cuotly de un espacio:
   Bosco siempre, o un Administrador de Cuotly con el permiso. Vive dentro
   de las políticas de `cuotly_*`, así que conserva el EXECUTE de
   `authenticated` (CLAUDE.md).';

revoke all on function public.is_platform_subscription_manager() from public, anon;
grant execute on function public.is_platform_subscription_manager() to authenticated;

-- ============================================================
-- 2 · El catálogo y las constantes (RN-SUB-01, RN-SUB-05, RN-SUB-07)
-- ============================================================
--
-- Una sola vez a cada lado de la frontera: esto y `CUOTLY_PLAN_TERMS` de
-- `src/core/cuotly-subscription.ts`, vigilados por
-- `listas-compartidas.test.ts`. Los números son los de §4.1 y §4.2, en
-- céntimos; `null` es "ilimitado" o "no aplica".
create or replace function public.cuotly_plan_terms(p_plan text)
returns table (
  price_cents integer,
  included_establishments integer,
  included_users integer,
  storage_gb integer,
  extra_establishment_cents integer,
  extra_user_cents integer
)
language sql
immutable
as $$
  select t.price_cents, t.included_establishments, t.included_users, t.storage_gb,
         t.extra_establishment_cents, t.extra_user_cents
  from (values
    ('pro', 14900, 5, 5, 20, 2500, 1500),
    ('agency', 49900, null::integer, null::integer, 100, null::integer, null::integer)
  ) as t(plan, price_cents, included_establishments, included_users, storage_gb,
         extra_establishment_cents, extra_user_cents)
  where t.plan = p_plan;
$$;

comment on function public.cuotly_plan_terms(text) is
  'RN-SUB-01 · §4.1 y §4.2 en céntimos. Duplicado a propósito con
   `CUOTLY_PLAN_TERMS`; lo vigila `listas-compartidas.test.ts`.';

-- Los enteros del apartado, con nombre, para que ninguno viva suelto en un
-- cuerpo de función. Mismo espejo en TypeScript (`CUOTLY_CONSTANTS`).
create or replace function public.cuotly_constant(p_name text)
returns integer
language sql
immutable
as $$
  select case p_name
    when 'trial_days' then 7                  -- §4.4
    when 'trial_max_establishments' then 2    -- §4.4
    when 'grace_hours' then 72                -- §4.6
    when 'reactivation_days' then 30          -- §4.4 y §4.6
    when 'charge_lead_days' then 7            -- RN-SUB-11
    when 'tax_rate_percent' then 21           -- RN-SUB-01, "+ IVA"
  end;
$$;

-- RN-SUB-07 · los cinco avisos de §4.5, como horas respecto al vencimiento.
-- El último, "antes de las 72 h", a las 60 (lectura, pendiente 21).
create or replace function public.cuotly_reminder_offset_hours(p_event_type text)
returns integer
language sql
immutable
as $$
  select case p_event_type
    when 'cuotly_payment_due_soon' then -72
    when 'cuotly_payment_due_today' then 0
    when 'cuotly_payment_overdue_24h' then 24
    when 'cuotly_payment_overdue_48h' then 48
    when 'cuotly_payment_final_notice' then 60
  end;
$$;

-- ============================================================
-- 3 · El modo del espacio (RN-SUB-02) y su guarda
-- ============================================================
alter table public.spaces add column if not exists cuotly_status text
  check (cuotly_status is null or cuotly_status in (
    'trial', 'active', 'archived_trial_ended', 'archived_nonpayment'
  ));
alter table public.spaces add column if not exists cuotly_status_changed_at timestamptz;
alter table public.spaces add column if not exists cuotly_archived_at timestamptz;
alter table public.spaces add column if not exists cuotly_reactivation_deadline_at timestamptz;

comment on column public.spaces.cuotly_status is
  'RN-SUB-02 · el modo del espacio respecto a Cuotly: prueba, activo, o
   archivado (por prueba sin pago o por impago) en solo lectura. Nulo en los
   espacios anteriores al Hito 17: Cuotly no se cobra a sí misma. Lo mueven
   solo las funciones que dejan evento y auditoría (RN-SUB-12).';
comment on column public.spaces.cuotly_plan is
  '§4 · el plan de Cuotly vigente del espacio (lo que su propietario le
   paga a Bosco), no el que ese espacio le vende a sus restaurantes (§5).
   Nació con la solicitud (Hito 17) y lo cambia `change_cuotly_plan()`
   (Hito 18). Nulo en los espacios anteriores al Hito 17.';
comment on column public.spaces.cuotly_reactivation_deadline_at is
  'RN-SUB-09 · hasta cuándo el pago reactiva solo. Pasada, la reactivación
   es de la plataforma. La eliminación operativa a los 30 días NO se
   implementa (pendiente 20).';

-- Como `guard_establishment_status_change()`: la barrera es el disparador,
-- no el privilegio, y así cubre cualquier camino futuro.
create or replace function public.guard_space_cuotly_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('cuotly.space_status_change', true), '') = 'on' then
    return new;
  end if;

  if new.cuotly_status is distinct from old.cuotly_status
     or new.cuotly_plan is distinct from old.cuotly_plan
     or new.cuotly_trial_ends_at is distinct from old.cuotly_trial_ends_at
     or new.cuotly_archived_at is distinct from old.cuotly_archived_at
     or new.cuotly_reactivation_deadline_at is distinct from old.cuotly_reactivation_deadline_at
     or new.cuotly_status_changed_at is distinct from old.cuotly_status_changed_at then
    raise exception 'La suscripción de Cuotly de un espacio se mueve con sus funciones, que la auditan';
  end if;

  -- RN-SUB-08 · el espacio mismo también es de solo lectura (renombrarlo,
  -- cambiar la zona horaria) mientras está archivado.
  if auth.uid() is not null
     and old.cuotly_status in ('archived_trial_ended', 'archived_nonpayment') then
    raise exception 'Este espacio está archivado y es de solo lectura: se puede pagar, exportar y contactar con soporte (§4.6)';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_space_cuotly_columns() from public, anon, authenticated;

create trigger spaces_guard_cuotly_columns
  before update on public.spaces
  for each row execute function public.guard_space_cuotly_columns();

-- ============================================================
-- 4 · La suscripción (RN-SUB-02, RN-SUB-04, RN-SUB-10)
-- ============================================================
create table public.cuotly_subscriptions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null unique references public.spaces (id) on delete cascade,
  plan text not null check (plan in ('pro', 'agency')),
  -- RN-SUB-04 · los adicionales de Pro, contratados como enteros.
  extra_establishments integer not null default 0 check (extra_establishments >= 0),
  extra_users integer not null default 0 check (extra_users >= 0),
  -- RN-SUB-11 · el periodo en curso. El primero empieza al acabar la prueba.
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  -- RN-SUB-10 · el cambio a Pro que espera a la renovación, con los
  -- adicionales con los que se contrató.
  pending_plan text check (pending_plan is null or pending_plan in ('pro', 'agency')),
  pending_extra_establishments integer not null default 0 check (pending_extra_establishments >= 0),
  pending_extra_users integer not null default 0 check (pending_extra_users >= 0),
  pending_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cuotly_subscriptions_period check (current_period_end > current_period_start),
  -- Los adicionales son de Pro: en Agency no existen (RN-SUB-04).
  constraint cuotly_subscriptions_extras_only_pro check (
    plan = 'pro' or (extra_establishments = 0 and extra_users = 0)
  ),
  constraint cuotly_subscriptions_pending_shape check (
    (pending_plan is null) = (pending_requested_at is null)
  )
);

comment on table public.cuotly_subscriptions is
  '§4.2.1, RN-SUB-02 · una suscripción por espacio: lo que su propietario
   le paga a Cuotly. Los cobros están en `cuotly_charges` y el dinero en
   `cuotly_ledger_entries`; aquí solo el contrato vigente.';

alter table public.cuotly_subscriptions enable row level security;

-- El propietario ve la suya; la plataforma, todas. Ningún administrador del
-- espacio: §4.2.1 dice que paga el propietario.
create policy cuotly_subscriptions_select on public.cuotly_subscriptions
for select using (
  public.has_capability(space_id, 'manage_space') or public.is_platform_subscription_manager()
);

-- ============================================================
-- 5 · Los cobros, los pagos y el libro (RN-SUB-06)
-- ============================================================
create table public.cuotly_charges (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  subscription_id uuid not null references public.cuotly_subscriptions (id) on delete cascade,
  -- `period`: la mensualidad. `proration`: la diferencia proporcional de
  -- una mejora de plan o de un adicional contratado a mitad de periodo.
  kind text not null check (kind in ('period', 'proration')),
  concept text not null check (length(btrim(concept)) > 0),
  -- §4.5 · "Cuotly genera importe, concepto y referencia". Es una
  -- referencia bancaria para casar la transferencia, NO un número fiscal:
  -- la numeración de facturas es del bloque legal (pendiente 20).
  reference text not null unique,
  period_start timestamptz not null,
  period_end timestamptz not null,
  -- RN-FIN-08, aplicado a Cuotly: base, impuesto y total, los tres, con el
  -- tipo congelado al emitir.
  base_cents integer not null check (base_cents >= 0),
  tax_rate_percent numeric(5, 2) not null check (tax_rate_percent >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  -- De qué se compone: plan, adicionales y fracción, para que la pantalla
  -- no tenga que reconstruirlo.
  breakdown jsonb not null default '{}'::jsonb,
  due_at timestamptz not null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint cuotly_charges_amounts_add_up check (total_cents = base_cents + tax_cents),
  constraint cuotly_charges_period check (period_end > period_start)
);

comment on table public.cuotly_charges is
  'RN-SUB-06 · un cobro de Cuotly a un espacio. **Sin columna de estado**:
   `cuotly_charge_status()` lo deriva del libro y del vencimiento
   (RN-DAT-05). La mensualidad de un periodo se emite una sola vez.';

-- RN-SUB-11 · una mensualidad por periodo y suscripción.
create unique index cuotly_charges_period_idx
  on public.cuotly_charges (subscription_id, period_start) where kind = 'period';
create index cuotly_charges_space_idx on public.cuotly_charges (space_id, due_at);

alter table public.cuotly_charges enable row level security;

create policy cuotly_charges_select on public.cuotly_charges
for select using (
  public.has_capability(space_id, 'manage_space') or public.is_platform_subscription_manager()
);

create table public.cuotly_payments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  charge_id uuid not null references public.cuotly_charges (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  -- §4.5 · transferencia o Bizum. Ningún otro.
  method text not null check (method in ('transfer', 'bizum')),
  paid_at timestamptz not null,
  -- "El propietario puede adjuntar justificante": la referencia del banco
  -- o de Bizum como texto, y un archivo del espacio si ya lo tiene. Subir
  -- uno nuevo en modo lectura no se puede (la tabla `files` está
  -- congelada); la referencia en texto sí.
  receipt_reference text,
  receipt_file_id uuid references public.files (id),
  note text,
  -- Quién lo declaró y desde qué lado: el propietario, o la plataforma al
  -- verlo en el banco sin declaración previa.
  declared_by uuid not null references public.profiles (id),
  declared_side text not null check (declared_side in ('owner', 'platform')),
  declared_at timestamptz not null default now(),
  -- La confirmación humana de §4.5. Quién, no lo ve el propietario
  -- (privilegio de columna, RN-SUB-12).
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  rejected_at timestamptz,
  rejected_by uuid references public.profiles (id),
  rejection_reason text,
  -- RN-FIN-04, "corregir": una confirmación equivocada no se edita ni se
  -- borra; se revierte con su apunte contrario y queda marcada aquí.
  reversed_at timestamptz,
  reversed_by uuid references public.profiles (id),
  reversal_reason text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (charge_id, idempotency_key),
  -- Un pago se confirma o se rechaza, nunca las dos cosas; y solo se
  -- revierte lo confirmado.
  constraint cuotly_payments_decision check (confirmed_at is null or rejected_at is null),
  constraint cuotly_payments_reversal check (reversed_at is null or confirmed_at is not null),
  constraint cuotly_payments_rejection_reason check (
    rejected_at is null or length(btrim(coalesce(rejection_reason, ''))) > 0
  )
);

comment on table public.cuotly_payments is
  'RN-SUB-06 · un pago a Cuotly, declarado por el propietario o registrado
   por la plataforma, y confirmado a mano. El importe no se edita nunca:
   `reverse_cuotly_payment()` escribe el apunte contrario.';

create index cuotly_payments_charge_idx on public.cuotly_payments (charge_id);
create index cuotly_payments_pending_idx
  on public.cuotly_payments (charge_id) where confirmed_at is null and rejected_at is null;

alter table public.cuotly_payments enable row level security;

create policy cuotly_payments_select on public.cuotly_payments
for select using (
  public.has_capability(space_id, 'manage_space') or public.is_platform_subscription_manager()
);

-- RN-SUB-12 · quién en Cuotly confirmó, rechazó o revirtió no lo ve el
-- propietario desde la tabla (RN-PLA-07, un piso más arriba). Como RLS
-- filtra filas y no columnas, se sostiene con privilegio de columna.
-- Consecuencia práctica: `select *` sobre esta tabla devuelve 403.
revoke select on public.cuotly_payments from anon, authenticated;
grant select (id, space_id, charge_id, amount_cents, method, paid_at, receipt_reference,
              receipt_file_id, note, declared_by, declared_side, declared_at,
              confirmed_at, rejected_at, rejection_reason, reversed_at, reversal_reason,
              idempotency_key, created_at)
  on public.cuotly_payments to authenticated;

-- El libro. Inmutable: solo SELECT. El signo mueve la deuda viva: emitir
-- sube, cobrar baja, revertir vuelve a subir. Nunca hay un saldo guardado
-- (CLAUDE.md MUST).
create table public.cuotly_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  charge_id uuid not null references public.cuotly_charges (id) on delete cascade,
  entry_type text not null check (entry_type in ('charge', 'payment', 'payment_reversal')),
  amount_cents integer not null check (amount_cents <> 0),
  payment_id uuid references public.cuotly_payments (id),
  reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint cuotly_ledger_entries_sign check (
    (entry_type = 'charge' and amount_cents > 0)
    or (entry_type = 'payment' and amount_cents < 0)
    or (entry_type = 'payment_reversal' and amount_cents > 0)
  )
);

comment on table public.cuotly_ledger_entries is
  'RN-SUB-06 · libro inmutable de apuntes con signo de lo que un espacio le
   debe a Cuotly. Sin política de UPDATE ni DELETE.';

create index cuotly_ledger_entries_charge_idx on public.cuotly_ledger_entries (charge_id);

alter table public.cuotly_ledger_entries enable row level security;

create policy cuotly_ledger_entries_select on public.cuotly_ledger_entries
for select using (
  public.has_capability(space_id, 'manage_space') or public.is_platform_subscription_manager()
);

-- `created_by` en el libro es quien confirmó o revirtió: la plataforma.
revoke select on public.cuotly_ledger_entries from anon, authenticated;
grant select (id, space_id, charge_id, entry_type, amount_cents, payment_id, reason, created_at)
  on public.cuotly_ledger_entries to authenticated;

-- ============================================================
-- 6 · Lo derivado (RN-DAT-05): la deuda viva y el estado del cobro
-- ============================================================
--
-- SECURITY INVOKER a propósito: leen el libro con la RLS de quien
-- pregunta, así que no necesitan comprobar nada y no entran en el barrido
-- de funciones internas.
create or replace function public.cuotly_charge_outstanding_cents(p_charge_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(sum(e.amount_cents), 0)::integer
  from public.cuotly_ledger_entries e
  where e.charge_id = p_charge_id;
$$;

create or replace function public.cuotly_charge_has_pending_declaration(p_charge_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.cuotly_payments p
    where p.charge_id = p_charge_id and p.confirmed_at is null and p.rejected_at is null
  );
$$;

-- `pending` · `declared` · `paid` · `overdue`. La misma cuenta que
-- `cuotlyChargeStatus()` en `src/core`.
create or replace function public.cuotly_charge_status(p_charge_id uuid, p_now timestamptz default now())
returns text
language sql
stable
set search_path = public
as $$
  select case
    when public.cuotly_charge_outstanding_cents(p_charge_id) <= 0 then 'paid'
    when public.cuotly_charge_has_pending_declaration(p_charge_id) then 'declared'
    when (select c.due_at from public.cuotly_charges c where c.id = p_charge_id) < p_now then 'overdue'
    else 'pending'
  end;
$$;

comment on function public.cuotly_charge_status(uuid, timestamptz) is
  'RN-SUB-06 · el estado de un cobro de Cuotly se deriva del libro y del
   vencimiento; no se guarda (RN-DAT-05).';

-- ============================================================
-- 7 · El uso y los límites (RN-SUB-03, RN-SUB-13)
-- ============================================================
--
-- Lo que se mide: establecimientos activos (todo el que no está
-- archivado), usuarios internos (miembros activos del espacio, propietario
-- incluido) y bytes de las versiones de archivo. El almacenamiento se mide
-- y no se limita (pendiente 18).
create or replace function public.cuotly_space_usage(p_space_id uuid)
returns table (active_establishments integer, internal_users integer, storage_bytes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_capability(p_space_id, 'manage_space') or public.is_platform_subscription_manager()) then
    raise exception 'Solo el propietario del espacio o Cuotly ven el uso de la suscripción';
  end if;

  return query
    select
      (select count(*)::integer from public.establishments e
        where e.space_id = p_space_id and e.status <> 'archived'),
      (select count(*)::integer from public.space_memberships sm
        where sm.space_id = p_space_id and sm.status = 'active'),
      (select coalesce(sum(fv.size_bytes), 0)::bigint from public.file_versions fv
        where fv.space_id = p_space_id);
end;
$$;

comment on function public.cuotly_space_usage(uuid) is
  'RN-SUB-03 y RN-SUB-13 · lo que ocupa un espacio en su plan de Cuotly.
   El almacenamiento se mide y no se limita: pendiente 18.';

revoke all on function public.cuotly_space_usage(uuid) from public, anon;
grant execute on function public.cuotly_space_usage(uuid) to authenticated;

-- Los límites vigentes. `null` es "sin límite". Interna: la usan los dos
-- disparadores y las funciones de cambio.
--
--   · Sin plan (espacios anteriores al Hito 17): sin límite.
--   · En prueba: 2 establecimientos (§4.4); los usuarios, los del plan.
--   · Pro: lo incluido más los adicionales. Agency: sin límite.
--   · Con un cambio a Pro programado, rige el MENOR de los dos (RN-SUB-10):
--     desde que se programa no se puede crecer por encima de Pro, para que
--     en la renovación no haya exceso que resolver.
create or replace function public.cuotly_space_limits(p_space_id uuid)
returns table (max_establishments integer, max_users integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space public.spaces;
  v_sub public.cuotly_subscriptions;
  v_est integer;
  v_users integer;
  v_pending_est integer;
  v_pending_users integer;
begin
  select * into v_space from public.spaces where id = p_space_id;
  if v_space.id is null or v_space.cuotly_plan is null then
    return query select null::integer, null::integer;
    return;
  end if;

  select * into v_sub from public.cuotly_subscriptions where space_id = p_space_id;

  select t.included_establishments, t.included_users into v_est, v_users
  from public.cuotly_plan_terms(coalesce(v_sub.plan, v_space.cuotly_plan)) t;
  if v_est is not null then
    v_est := v_est + coalesce(v_sub.extra_establishments, 0);
    v_users := v_users + coalesce(v_sub.extra_users, 0);
  end if;

  if v_sub.pending_plan is not null then
    select t.included_establishments, t.included_users into v_pending_est, v_pending_users
    from public.cuotly_plan_terms(v_sub.pending_plan) t;
    if v_pending_est is not null then
      v_pending_est := v_pending_est + v_sub.pending_extra_establishments;
      v_pending_users := v_pending_users + v_sub.pending_extra_users;
      v_est := least(coalesce(v_est, v_pending_est), v_pending_est);
      v_users := least(coalesce(v_users, v_pending_users), v_pending_users);
    end if;
  end if;

  if v_space.cuotly_status = 'trial' then
    v_est := least(coalesce(v_est, public.cuotly_constant('trial_max_establishments')),
                   public.cuotly_constant('trial_max_establishments'));
  end if;

  return query select v_est, v_users;
end;
$$;

revoke all on function public.cuotly_space_limits(uuid) from public, anon, authenticated;

-- RN-SUB-03 · el sexto establecimiento en Pro sin adicional falla aquí,
-- venga de la pantalla, de una función o de un INSERT directo.
create or replace function public.guard_cuotly_establishment_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if tg_op = 'INSERT' and new.status = 'archived' then
    return new;
  end if;
  if tg_op = 'UPDATE' and not (old.status = 'archived' and new.status <> 'archived') then
    return new;
  end if;

  select l.max_establishments into v_limit from public.cuotly_space_limits(new.space_id) l;
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_count from public.establishments e
  where e.space_id = new.space_id and e.status <> 'archived' and e.id <> new.id;

  if v_count >= v_limit then
    raise exception 'El plan de Cuotly de este espacio admite % establecimientos activos; para tener más hay que contratar un establecimiento adicional (§4.1) o archivar uno', v_limit;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_cuotly_establishment_limit() from public, anon, authenticated;

create trigger establishments_guard_cuotly_limit
  before insert or update of status on public.establishments
  for each row execute function public.guard_cuotly_establishment_limit();

create or replace function public.guard_cuotly_user_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  select l.max_users into v_limit from public.cuotly_space_limits(new.space_id) l;
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_count from public.space_memberships sm
  where sm.space_id = new.space_id and sm.status = 'active' and sm.id <> new.id;

  if v_count >= v_limit then
    raise exception 'El plan de Cuotly de este espacio admite % usuarios internos; para tener más hay que contratar un usuario adicional (§4.1)', v_limit;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_cuotly_user_limit() from public, anon, authenticated;

create trigger space_memberships_guard_cuotly_limit
  before insert or update of status on public.space_memberships
  for each row execute function public.guard_cuotly_user_limit();

-- ============================================================
-- 8 · El modo lectura (RN-SUB-08)
-- ============================================================
--
-- Un disparador en TODA tabla con `space_id`. Lo que rechaza: cualquier
-- escritura hecha **con identidad de persona** en un espacio archivado.
-- Lo que deja pasar:
--
--   · Los procesos del sistema (la cola entra como `service_role`, sin
--     `auth.uid()`): los restaurantes del espacio siguen teniendo sus
--     contratos con él, y sus relojes no se paran por la deuda de su
--     proveedor con Cuotly (lectura, pendiente 21).
--   · Las funciones que mueven el estado del espacio, que encienden el
--     mismo GUC que la guarda de `spaces`.
--   · Las tablas exentas de abajo, cada una con su motivo. Son las que
--     hacen posible lo que §4.6 permite —pagar— y el rastro que eso deja.
create or replace function public.guard_space_read_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
  v_status text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if coalesce(current_setting('cuotly.space_status_change', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_space := case when tg_op = 'DELETE' then old.space_id else new.space_id end;
  if v_space is null then
    return coalesce(new, old);
  end if;

  select s.cuotly_status into v_status from public.spaces s where s.id = v_space;
  if v_status in ('archived_trial_ended', 'archived_nonpayment') then
    raise exception 'Este espacio está archivado y es de solo lectura: se puede pagar, exportar y contactar con soporte (§4.6)';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_space_read_only() from public, anon, authenticated;

-- Las exentas. La misma lista, con los mismos motivos, está en la suite
-- `supabase/tests/plataforma_suscripcion_de_cuotly.sql`, que exige que toda
-- tabla con `space_id` lleve el disparador o esté aquí.
--
--   · `audit_log`, `state_events`: los libros que la propia operación de
--     pagar y de archivar tienen que escribir.
--   · `notifications`, `notification_deliveries`: los avisos de §4.5 llegan
--     mientras el espacio está archivado, y el pago declarado deja aviso.
-- --   · `space_requests`: es de plataforma; su `space_id` es anulable.
--   · `cuotly_subscriptions`, `cuotly_charges`, `cuotly_payments`,
--     `cuotly_ledger_entries`: "en ese modo se puede pagar" (§4.6).
do $$
declare
  v_tabla text;
begin
  for v_tabla in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'space_id' and a.attnum > 0 and not a.attisdropped
      )
      and c.relname not in (
        'audit_log', 'state_events', 'notifications', 'notification_deliveries',
        'space_requests',
        'cuotly_subscriptions', 'cuotly_charges', 'cuotly_payments', 'cuotly_ledger_entries'
      )
    order by 1
  loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function public.guard_space_read_only()',
      v_tabla || '_cuotly_read_only', v_tabla);
  end loop;
end $$;

-- ============================================================
-- 9 · Eventos y avisos (RN-SUB-07, RN-SUB-12)
-- ============================================================
alter table public.state_events drop constraint state_events_entity_type_check;
alter table public.state_events add constraint state_events_entity_type_check
  check (entity_type in ('job', 'task', 'establishment', 'opportunity', 'report', 'space'));

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
  -- Hito 18 · los cinco avisos de §4.5 y los dos del modo del espacio.
  'cuotly_payment_due_soon', 'cuotly_payment_due_today', 'cuotly_payment_overdue_24h',
  'cuotly_payment_overdue_48h', 'cuotly_payment_final_notice',
  'cuotly_space_archived', 'cuotly_space_reactivated',
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
  'cuotly_charge', 'space'
));

-- RN-NOT-03 · "impagos graves y pérdida de acceso no pueden desactivarse":
-- el último aviso antes del corte y el archivado. Los otros cuatro son
-- recordatorios y se pueden apagar (RN-NOT-02). Mismo espejo en
-- `MANDATORY_EVENTS`.
create or replace function public.notification_event_is_mandatory(p_event_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_event_type in (
    't2_threshold_100',
    't3_threshold_100',
    'establishment_paused_nonpayment',
    'establishment_suspended_nonpayment',
    'cuotly_payment_final_notice',
    'cuotly_space_archived'
  );
$$;

-- A los propietarios del espacio (§4.2.1: son quienes pagan). El enlace
-- abre la suscripción en los ajustes del espacio; la pantalla llega con
-- el panel del Hito 19, y el enlace no autoriza nada por sí mismo
-- (RN-NOT-04).
create or replace function public.notify_cuotly_event(
  p_space_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_dedupe_key text,
  p_amount_cents bigint default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text;
  v_recipient uuid;
  v_sent integer := 0;
begin
  v_link := '/espacios/' || public.space_slug(p_space_id) || '/ajustes/suscripcion';

  for v_recipient in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = p_space_id and sm.status = 'active' and sm.role = 'owner'
  loop
    if public.emit_notification(
         p_space_id, v_recipient, p_event_type, 'staff',
         p_entity_type, p_entity_id, v_link, p_dedupe_key, null, null, p_amount_cents) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.notify_cuotly_event(uuid, text, text, uuid, text, bigint) from public, anon, authenticated;

-- ============================================================
-- 10 · Mover el modo del espacio (RN-SUB-02, RN-SUB-12)
-- ============================================================
--
-- La única puerta. Idempotente: al mismo estado, no hace nada. Escribe el
-- estado, el evento (entidad `space`), la auditoría con el nombre LITERAL
-- de la acción —`audit.test.ts` lee las migraciones— y el aviso.
create or replace function public.set_space_cuotly_status_internal(
  p_space_id uuid,
  p_status text,
  p_reason text,
  p_cause text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_now timestamptz := now();
  v_archiving boolean := p_status in ('archived_trial_ended', 'archived_nonpayment');
begin
  select cuotly_status into v_current from public.spaces where id = p_space_id for update;

  if v_current is not distinct from p_status then
    return;
  end if;

  perform set_config('cuotly.space_status_change', 'on', true);
  update public.spaces
  set cuotly_status = p_status,
      cuotly_status_changed_at = v_now,
      cuotly_archived_at = case when v_archiving then v_now else null end,
      cuotly_reactivation_deadline_at =
        case when v_archiving then v_now + make_interval(days => public.cuotly_constant('reactivation_days')) else null end
  where id = p_space_id;

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (p_space_id, 'space', p_space_id, v_current, p_status, auth.uid(), p_reason, p_cause);

  -- El nombre de la acción va LITERAL dentro del INSERT y no en una
  -- variable: `audit.test.ts` lee las sentencias de auditoría de las
  -- migraciones, y un nombre asignado tres líneas antes no lo encuentra.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, auth.uid(),
          case
            when p_status = 'archived_trial_ended' then 'space.archived_trial_ended'
            when p_status = 'archived_nonpayment' then 'space.archived_nonpayment'
            when v_current = 'trial' then 'space.activated'
            else 'space.reactivated'
          end,
          'space', p_space_id,
          jsonb_build_object('cuotly_status', v_current),
          jsonb_build_object('cuotly_status', p_status, 'cause', p_cause),
          p_reason);
  perform set_config('cuotly.space_status_change', 'off', true);

  if v_archiving then
    perform public.notify_cuotly_event(
      p_space_id, 'cuotly_space_archived', 'space', p_space_id,
      'cuotly_space_archived:' || p_space_id::text || ':' || to_char(v_now, 'YYYYMMDDHH24MISS'));
  elsif v_current in ('archived_trial_ended', 'archived_nonpayment') then
    perform public.notify_cuotly_event(
      p_space_id, 'cuotly_space_reactivated', 'space', p_space_id,
      'cuotly_space_reactivated:' || p_space_id::text || ':' || to_char(v_now, 'YYYYMMDDHH24MISS'));
  end if;
end;
$$;

revoke all on function public.set_space_cuotly_status_internal(uuid, text, text, text) from public, anon, authenticated;

-- ============================================================
-- 11 · Emitir un cobro (RN-SUB-06, RN-SUB-11)
-- ============================================================
create or replace function public.cuotly_charge_reference(p_space_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  -- Referencia bancaria, legible y única; NO un número fiscal (pendiente 20).
  -- No usa `next_space_sequence()`: esa exige ser miembro del espacio, y
  -- quien emite es la cola o la plataforma. Quien llama tiene bloqueada la
  -- suscripción (`for update`), y el índice único de `reference` cierra la
  -- puerta a cualquier carrera que se cuele.
  select count(*) + 1 into v_n from public.cuotly_charges where space_id = p_space_id;
  return 'CUO-' || upper(left(md5(p_space_id::text), 6)) || '-' || lpad(v_n::text, 4, '0');
end;
$$;

revoke all on function public.cuotly_charge_reference(uuid) from public, anon, authenticated;

-- La base de una mensualidad: el plan más los adicionales de Pro.
create or replace function public.cuotly_monthly_base_cents(
  p_plan text, p_extra_establishments integer, p_extra_users integer
)
returns integer
language sql
immutable
as $$
  select t.price_cents
       + coalesce(t.extra_establishment_cents, 0) * coalesce(p_extra_establishments, 0)
       + coalesce(t.extra_user_cents, 0) * coalesce(p_extra_users, 0)
  from public.cuotly_plan_terms(p_plan) t;
$$;

-- RN-COM-18, aplicada a Cuotly: fracción NATURAL restante del periodo.
create or replace function public.cuotly_remaining_fraction(
  p_start timestamptz, p_end timestamptz, p_now timestamptz
)
returns numeric
language sql
immutable
as $$
  select case
    when p_end <= p_start then 0
    else least(1, greatest(0,
      extract(epoch from (p_end - greatest(p_now, p_start))) / extract(epoch from (p_end - p_start))))
  end;
$$;

create or replace function public.issue_cuotly_charge_internal(
  p_subscription_id uuid,
  p_kind text,
  p_concept text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_due_at timestamptz,
  p_base_cents integer,
  p_breakdown jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_tax_rate numeric(5, 2) := public.cuotly_constant('tax_rate_percent');
  v_tax_cents integer;
  v_charge_id uuid;
begin
  select space_id into v_space_id from public.cuotly_subscriptions where id = p_subscription_id;
  if v_space_id is null then
    raise exception 'Suscripción de Cuotly no encontrada';
  end if;

  -- Decisión 7: a dos decimales, en céntimos.
  v_tax_cents := round(p_base_cents * v_tax_rate / 100)::integer;

  insert into public.cuotly_charges
    (space_id, subscription_id, kind, concept, reference, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, breakdown, due_at)
  values
    (v_space_id, p_subscription_id, p_kind, p_concept, public.cuotly_charge_reference(v_space_id),
     p_period_start, p_period_end, p_base_cents, v_tax_rate, v_tax_cents,
     p_base_cents + v_tax_cents, p_breakdown, p_due_at)
  returning id into v_charge_id;

  if p_base_cents + v_tax_cents > 0 then
    insert into public.cuotly_ledger_entries
      (space_id, charge_id, entry_type, amount_cents, reason, created_by)
    values
      (v_space_id, v_charge_id, 'charge', p_base_cents + v_tax_cents, p_concept, auth.uid());
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'cuotly_charge.issued', 'cuotly_charge', v_charge_id,
          jsonb_build_object('kind', p_kind, 'total_cents', p_base_cents + v_tax_cents,
                             'due_at', p_due_at, 'breakdown', p_breakdown));

  return v_charge_id;
end;
$$;

revoke all on function public.issue_cuotly_charge_internal(uuid, text, text, timestamptz, timestamptz, timestamptz, integer, jsonb)
  from public, anon, authenticated;

-- La mensualidad de un periodo: el concepto lleva las fechas en la zona
-- del espacio (CLAUDE.md), y el desglose lo que la compone.
create or replace function public.issue_cuotly_period_charge_internal(
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.cuotly_subscriptions;
  v_tz text;
  v_plan text;
  v_extra_est integer;
  v_extra_users integer;
  v_base integer;
  v_terms record;
begin
  select * into v_sub from public.cuotly_subscriptions where id = p_subscription_id;
  select timezone into v_tz from public.spaces where id = v_sub.space_id;

  -- RN-SUB-11 · con un cambio a Pro programado, la mensualidad ya sale con
  -- Pro y con los adicionales con los que se programó.
  if v_sub.pending_plan is not null then
    v_plan := v_sub.pending_plan;
    v_extra_est := v_sub.pending_extra_establishments;
    v_extra_users := v_sub.pending_extra_users;
  else
    v_plan := v_sub.plan;
    v_extra_est := v_sub.extra_establishments;
    v_extra_users := v_sub.extra_users;
  end if;

  select * into v_terms from public.cuotly_plan_terms(v_plan);
  v_base := public.cuotly_monthly_base_cents(v_plan, v_extra_est, v_extra_users);

  return public.issue_cuotly_charge_internal(
    p_subscription_id, 'period',
    'Cuotly ' || initcap(v_plan) || ' · del '
      || to_char(p_period_start at time zone v_tz, 'DD/MM/YYYY') || ' al '
      || to_char(p_period_end at time zone v_tz, 'DD/MM/YYYY'),
    p_period_start, p_period_end, p_period_start, v_base,
    jsonb_build_object(
      'plan', v_plan, 'plan_cents', v_terms.price_cents,
      'extra_establishments', v_extra_est,
      'extra_establishment_cents', coalesce(v_terms.extra_establishment_cents, 0),
      'extra_users', v_extra_users,
      'extra_user_cents', coalesce(v_terms.extra_user_cents, 0)));
end;
$$;

revoke all on function public.issue_cuotly_period_charge_internal(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

-- ============================================================
-- 12 · Aprobar arranca también la suscripción (RN-SUB-05)
-- ============================================================
--
-- La misma función de la 89 con tres líneas más: el espacio nace en
-- `trial`, con su suscripción y con la primera mensualidad emitida, que
-- vence al acabar la prueba. Así el propietario tiene importe, concepto y
-- referencia desde el primer día.
create or replace function public.approve_space_request(
  p_request_id uuid,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.space_requests;
  v_space_id uuid;
  v_sub_id uuid;
  v_slug text;
  v_trial_ends timestamptz;
begin
  if not public.is_platform_approver() then
    raise exception 'Solo Cuotly aprueba una solicitud de espacio';
  end if;

  select * into v_req from public.space_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_req.status = 'approved' then
    return v_req.space_id;
  end if;

  if not public.space_request_transition_allowed(v_req.status, 'approved', 'platform') then
    raise exception 'Una solicitud en % no se aprueba', v_req.status;
  end if;

  -- RN-PLA-09 · por persona sí; por negocio no se finge (pendiente 19).
  if exists (
    select 1 from public.space_requests r
    where r.requester_id = v_req.requester_id
      and r.status = 'approved'
      and r.id <> v_req.id
  ) then
    raise exception 'Esta persona ya tuvo su prueba gratuita (§4.4)';
  end if;

  v_slug := public.space_slug_from_name(v_req.business_name);
  v_trial_ends := now() + make_interval(days => public.cuotly_constant('trial_days'));

  insert into public.spaces (name, slug, created_by, cuotly_plan, cuotly_trial_ends_at,
                             cuotly_status, cuotly_status_changed_at)
  values (btrim(v_req.business_name), v_slug, v_req.requester_id, v_req.plan, v_trial_ends,
          'trial', now())
  returning id into v_space_id;

  insert into public.space_memberships (space_id, user_id, role, status)
  values (v_space_id, v_req.requester_id, 'owner', 'active');

  -- RN-SUB-05 · la suscripción y la primera mensualidad. El primer periodo
  -- empieza cuando acaba la prueba.
  insert into public.cuotly_subscriptions (space_id, plan, current_period_start, current_period_end)
  values (v_space_id, v_req.plan, v_trial_ends, v_trial_ends + interval '1 month')
  returning id into v_sub_id;

  perform public.issue_cuotly_period_charge_internal(v_sub_id, v_trial_ends, v_trial_ends + interval '1 month');

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (v_space_id, 'space', v_space_id, null, 'trial', auth.uid(), null, 'approved');

  update public.space_requests
  set status = 'approved',
      status_reason = null,
      decided_at = now(),
      decided_by = auth.uid(),
      space_id = v_space_id,
      idempotency_key = coalesce(p_idempotency_key, idempotency_key),
      updated_at = now()
  where id = p_request_id;

  insert into public.space_request_events (request_id, from_status, to_status, actor_id)
  values (p_request_id, v_req.status, 'approved', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (null, auth.uid(), 'space_request.approved', 'space_request', p_request_id,
          jsonb_build_object('status', v_req.status),
          jsonb_build_object('status', 'approved', 'space_id', v_space_id));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'space.created', 'space', v_space_id,
          jsonb_build_object('from_request', p_request_id, 'plan', v_req.plan,
                             'trial_ends_at', v_trial_ends, 'owner', v_req.requester_id));

  return v_space_id;
end;
$$;

-- Los espacios que la 89 ya aprobó antes de esta migración —si los hay—
-- reciben su suscripción y su primera mensualidad ahora, en prueba; el
-- barrido decide después, con las mismas reglas que a los demás.
do $$
declare
  v_space record;
  v_sub_id uuid;
begin
  for v_space in
    select s.id, s.cuotly_plan, s.cuotly_trial_ends_at
    from public.spaces s
    where s.cuotly_plan is not null and s.cuotly_status is null
      and not exists (select 1 from public.cuotly_subscriptions cs where cs.space_id = s.id)
  loop
    perform set_config('cuotly.space_status_change', 'on', true);
    update public.spaces set cuotly_status = 'trial', cuotly_status_changed_at = now() where id = v_space.id;
    perform set_config('cuotly.space_status_change', 'off', true);

    insert into public.cuotly_subscriptions (space_id, plan, current_period_start, current_period_end)
    values (v_space.id, v_space.cuotly_plan, v_space.cuotly_trial_ends_at, v_space.cuotly_trial_ends_at + interval '1 month')
    returning id into v_sub_id;

    perform public.issue_cuotly_period_charge_internal(
      v_sub_id, v_space.cuotly_trial_ends_at, v_space.cuotly_trial_ends_at + interval '1 month');

    insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, reason, cause)
    values (v_space.id, 'space', v_space.id, null, 'trial', 'Migración 90: espacio aprobado antes del Hito 18', 'approved');
  end loop;
end $$;

-- ============================================================
-- 13 · El cobro manual (RN-SUB-06, RN-SUB-09)
-- ============================================================
--
-- Qué pasa con el espacio después de un pago: en prueba, el primer pago lo
-- activa; archivado, si no queda nada vencido y no ha pasado el plazo, se
-- reactiva con sus datos. Pasado el plazo, la reactivación es de la
-- plataforma (`platform_reactivate_space`).
create or replace function public.cuotly_after_payment_internal(p_space_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.spaces;
  v_overdue boolean;
begin
  select * into v_space from public.spaces where id = p_space_id;

  select exists (
    select 1 from public.cuotly_charges c
    where c.space_id = p_space_id
      and public.cuotly_charge_outstanding_cents(c.id) > 0
      and c.due_at <= now()
  ) into v_overdue;

  if v_space.cuotly_status = 'trial' then
    if not exists (
      select 1 from public.cuotly_charges c
      where c.space_id = p_space_id and public.cuotly_charge_outstanding_cents(c.id) > 0
    ) then
      perform public.set_space_cuotly_status_internal(p_space_id, 'active', 'Primera mensualidad pagada', 'payment_confirmed');
      return 'activated';
    end if;
    return 'trial';
  end if;

  if v_space.cuotly_status in ('archived_trial_ended', 'archived_nonpayment') and not v_overdue then
    if now() <= v_space.cuotly_reactivation_deadline_at then
      perform public.set_space_cuotly_status_internal(p_space_id, 'active', 'Pago confirmado', 'payment_confirmed');
      return 'reactivated';
    end if;
    return 'requires_platform';
  end if;

  return coalesce(v_space.cuotly_status, 'none');
end;
$$;

revoke all on function public.cuotly_after_payment_internal(uuid) from public, anon, authenticated;

-- El apunte de un pago confirmado. Interna: la llaman confirmar y registrar.
create or replace function public.cuotly_confirm_payment_internal(p_payment_id uuid, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.cuotly_payments;
  v_outstanding integer;
  v_after text;
begin
  select * into v_pay from public.cuotly_payments where id = p_payment_id for update;

  if v_pay.confirmed_at is not null then
    return 'already_confirmed'; -- CA-17.
  end if;
  if v_pay.rejected_at is not null then
    raise exception 'Este pago se rechazó y no se puede confirmar; regístralo de nuevo si llegó después';
  end if;

  v_outstanding := public.cuotly_charge_outstanding_cents(v_pay.charge_id);
  if v_pay.amount_cents > v_outstanding then
    raise exception 'El importe (%) supera la deuda viva del cobro (%)', v_pay.amount_cents, v_outstanding;
  end if;

  update public.cuotly_payments
  set confirmed_at = now(), confirmed_by = auth.uid(), note = coalesce(p_note, note)
  where id = p_payment_id;

  insert into public.cuotly_ledger_entries
    (space_id, charge_id, entry_type, amount_cents, payment_id, reason, created_by)
  values
    (v_pay.space_id, v_pay.charge_id, 'payment', -v_pay.amount_cents, p_payment_id, p_note, auth.uid());

  v_after := public.cuotly_after_payment_internal(v_pay.space_id);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_pay.space_id, auth.uid(), 'cuotly_payment.confirmed', 'cuotly_payment', p_payment_id,
          jsonb_build_object('outstanding_cents', v_outstanding),
          jsonb_build_object('outstanding_cents', v_outstanding - v_pay.amount_cents,
                             'amount_cents', v_pay.amount_cents, 'method', v_pay.method,
                             'space_after', v_after),
          p_note);

  return v_after;
end;
$$;

revoke all on function public.cuotly_confirm_payment_internal(uuid, text) from public, anon, authenticated;

-- El propietario declara que ha pagado. Solo él (§4.2.1), y también desde
-- el modo lectura: `cuotly_payments` está exenta de la congelación.
create or replace function public.declare_cuotly_payment(
  p_charge_id uuid,
  p_amount_cents integer,
  p_method text,
  p_paid_at timestamptz default now(),
  p_receipt_reference text default null,
  p_receipt_file_id uuid default null,
  p_note text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_outstanding integer;
  v_payment_id uuid;
begin
  select space_id into v_space_id from public.cuotly_charges where id = p_charge_id for update;
  if v_space_id is null then
    raise exception 'Cobro de Cuotly no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio declara un pago a Cuotly';
  end if;

  if p_idempotency_key is not null then
    select id into v_payment_id from public.cuotly_payments
    where charge_id = p_charge_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  if p_method not in ('transfer', 'bizum') then
    raise exception 'Cuotly se paga por transferencia o Bizum (§4.5), no por %', p_method;
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe pagado debe ser mayor que cero';
  end if;

  v_outstanding := public.cuotly_charge_outstanding_cents(p_charge_id);
  if p_amount_cents > v_outstanding then
    raise exception 'El importe (%) supera la deuda viva del cobro (%)', p_amount_cents, v_outstanding;
  end if;

  if p_receipt_file_id is not null
     and (select f.space_id from public.files f where f.id = p_receipt_file_id) is distinct from v_space_id then
    raise exception 'El justificante pertenece a otro espacio';
  end if;

  insert into public.cuotly_payments
    (space_id, charge_id, amount_cents, method, paid_at, receipt_reference, receipt_file_id, note,
     declared_by, declared_side, idempotency_key)
  values
    (v_space_id, p_charge_id, p_amount_cents, p_method, p_paid_at, p_receipt_reference, p_receipt_file_id, p_note,
     auth.uid(), 'owner', p_idempotency_key)
  returning id into v_payment_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_space_id, auth.uid(), 'cuotly_payment.declared', 'cuotly_payment', v_payment_id,
          jsonb_build_object('charge_id', p_charge_id, 'amount_cents', p_amount_cents,
                             'method', p_method, 'paid_at', p_paid_at),
          p_note);

  return v_payment_id;
end;
$$;

comment on function public.declare_cuotly_payment(uuid, integer, text, timestamptz, text, uuid, text, text) is
  'RN-SUB-06 · el propietario declara un pago a Cuotly; lo confirma la
   plataforma. Un pago declarado detiene el corte por impago hasta que se
   decida (RN-SUB-08). Idempotente por clave (CA-17).';

revoke all on function public.declare_cuotly_payment(uuid, integer, text, timestamptz, text, uuid, text, text) from public, anon;
grant execute on function public.declare_cuotly_payment(uuid, integer, text, timestamptz, text, uuid, text, text) to authenticated;

create or replace function public.confirm_cuotly_payment(p_payment_id uuid, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_subscription_manager() then
    raise exception 'Solo Cuotly confirma un pago (§4.5)';
  end if;
  if not exists (select 1 from public.cuotly_payments where id = p_payment_id) then
    raise exception 'Pago no encontrado';
  end if;
  return public.cuotly_confirm_payment_internal(p_payment_id, p_note);
end;
$$;

comment on function public.confirm_cuotly_payment(uuid, text) is
  'RN-SUB-06 · "Bosco o un Administrador de Cuotly autorizado confirma
   manualmente el pago" (§4.5). Devuelve qué pasó con el espacio:
   activated, reactivated, requires_platform, o su modo si no cambió.';

revoke all on function public.confirm_cuotly_payment(uuid, text) from public, anon;
grant execute on function public.confirm_cuotly_payment(uuid, text) to authenticated;

-- La plataforma lo ve en el banco sin que nadie lo haya declarado.
create or replace function public.record_cuotly_payment(
  p_charge_id uuid,
  p_amount_cents integer,
  p_method text,
  p_paid_at timestamptz default now(),
  p_note text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_payment_id uuid;
begin
  if not public.is_platform_subscription_manager() then
    raise exception 'Solo Cuotly registra un pago (§4.5)';
  end if;

  select space_id into v_space_id from public.cuotly_charges where id = p_charge_id for update;
  if v_space_id is null then
    raise exception 'Cobro de Cuotly no encontrado';
  end if;

  if p_idempotency_key is not null then
    select id into v_payment_id from public.cuotly_payments
    where charge_id = p_charge_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  if p_method not in ('transfer', 'bizum') then
    raise exception 'Cuotly se paga por transferencia o Bizum (§4.5), no por %', p_method;
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe pagado debe ser mayor que cero';
  end if;

  insert into public.cuotly_payments
    (space_id, charge_id, amount_cents, method, paid_at, note, declared_by, declared_side, idempotency_key)
  values
    (v_space_id, p_charge_id, p_amount_cents, p_method, p_paid_at, p_note, auth.uid(), 'platform', p_idempotency_key)
  returning id into v_payment_id;

  perform public.cuotly_confirm_payment_internal(v_payment_id, p_note);

  return v_payment_id;
end;
$$;

comment on function public.record_cuotly_payment(uuid, integer, text, timestamptz, text, text) is
  'RN-SUB-06 · la plataforma registra y confirma de una vez un pago que ve
   en el banco sin declaración previa. Idempotente por clave (CA-17).';

revoke all on function public.record_cuotly_payment(uuid, integer, text, timestamptz, text, text) from public, anon;
grant execute on function public.record_cuotly_payment(uuid, integer, text, timestamptz, text, text) to authenticated;

create or replace function public.reject_cuotly_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.cuotly_payments;
begin
  if not public.is_platform_subscription_manager() then
    raise exception 'Solo Cuotly rechaza un pago declarado';
  end if;

  select * into v_pay from public.cuotly_payments where id = p_payment_id for update;
  if v_pay.id is null then
    raise exception 'Pago no encontrado';
  end if;
  if v_pay.rejected_at is not null then
    return; -- CA-17.
  end if;
  if v_pay.confirmed_at is not null then
    raise exception 'Un pago confirmado no se rechaza: se revierte con reverse_cuotly_payment()';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Hace falta un motivo para rechazar un pago declarado';
  end if;

  update public.cuotly_payments
  set rejected_at = now(), rejected_by = auth.uid(), rejection_reason = btrim(p_reason)
  where id = p_payment_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_pay.space_id, auth.uid(), 'cuotly_payment.rejected', 'cuotly_payment', p_payment_id,
          jsonb_build_object('amount_cents', v_pay.amount_cents),
          jsonb_build_object('rejected', true), btrim(p_reason));
end;
$$;

comment on function public.reject_cuotly_payment(uuid, text) is
  'RN-SUB-06 · un pago declarado que no llegó. Con motivo, que el
   propietario ve. No toca el libro: nunca entró en él.';

revoke all on function public.reject_cuotly_payment(uuid, text) from public, anon;
grant execute on function public.reject_cuotly_payment(uuid, text) to authenticated;

create or replace function public.reverse_cuotly_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.cuotly_payments;
begin
  if not public.is_platform_subscription_manager() then
    raise exception 'Solo Cuotly revierte un pago confirmado';
  end if;

  select * into v_pay from public.cuotly_payments where id = p_payment_id for update;
  if v_pay.id is null then
    raise exception 'Pago no encontrado';
  end if;
  if v_pay.reversed_at is not null then
    return; -- CA-17.
  end if;
  if v_pay.confirmed_at is null then
    raise exception 'Solo se revierte un pago confirmado; uno declarado se rechaza';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Hace falta un motivo para revertir un pago';
  end if;

  update public.cuotly_payments
  set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = btrim(p_reason)
  where id = p_payment_id;

  insert into public.cuotly_ledger_entries
    (space_id, charge_id, entry_type, amount_cents, payment_id, reason, created_by)
  values
    (v_pay.space_id, v_pay.charge_id, 'payment_reversal', v_pay.amount_cents, p_payment_id, btrim(p_reason), auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_pay.space_id, auth.uid(), 'cuotly_payment.reversed', 'cuotly_payment', p_payment_id,
          jsonb_build_object('amount_cents', v_pay.amount_cents),
          jsonb_build_object('reversed', true), btrim(p_reason));
end;
$$;

comment on function public.reverse_cuotly_payment(uuid, text) is
  'RN-FIN-04 aplicada a Cuotly: una confirmación equivocada no se edita ni
   se borra; se escribe el apunte contrario. Si vuelve a haber deuda vencida,
   el barrido decide con las mismas reglas.';

revoke all on function public.reverse_cuotly_payment(uuid, text) from public, anon;
grant execute on function public.reverse_cuotly_payment(uuid, text) to authenticated;

-- ============================================================
-- 14 · Adicionales y cambio de plan (RN-SUB-04, RN-SUB-10)
-- ============================================================
create or replace function public.set_cuotly_extras(
  p_space_id uuid,
  p_extra_establishments integer,
  p_extra_users integer,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.spaces;
  v_sub public.cuotly_subscriptions;
  v_terms record;
  v_usage record;
  v_key text;
  v_fraction numeric;
  v_delta_cents integer;
  v_charge_id uuid;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio contrata adicionales de Cuotly';
  end if;

  select * into v_space from public.spaces where id = p_space_id;
  select * into v_sub from public.cuotly_subscriptions where space_id = p_space_id for update;
  if v_sub.id is null then
    raise exception 'Este espacio no tiene suscripción de Cuotly';
  end if;
  if v_sub.plan <> 'pro' then
    raise exception 'Los adicionales son de Pro (§4.1); Agency no tiene límite';
  end if;
  if v_space.cuotly_status <> 'active' then
    raise exception 'Los adicionales se contratan con la suscripción activa; en la prueba el tope es otro (§4.4)';
  end if;
  if p_extra_establishments is null or p_extra_establishments < 0
     or p_extra_users is null or p_extra_users < 0 then
    raise exception 'Los adicionales son números enteros no negativos';
  end if;

  if p_extra_establishments = v_sub.extra_establishments and p_extra_users = v_sub.extra_users then
    return null; -- CA-17.
  end if;

  v_key := coalesce(p_idempotency_key,
                    'extras:' || v_sub.id::text || ':' || p_extra_establishments || ':' || p_extra_users);
  if exists (
    select 1 from public.audit_log
    where action = 'space.extras_changed' and entity_id = p_space_id
      and new_value ->> 'idempotency_key' = v_key
  ) then
    return null;
  end if;

  -- RN-SUB-04 · bajar, nunca por debajo del uso.
  select * into v_terms from public.cuotly_plan_terms('pro');
  select
    (select count(*) from public.establishments e where e.space_id = p_space_id and e.status <> 'archived') as est,
    (select count(*) from public.space_memberships sm where sm.space_id = p_space_id and sm.status = 'active') as users
  into v_usage;
  if v_usage.est > v_terms.included_establishments + p_extra_establishments then
    raise exception 'Con % adicionales caben % establecimientos activos y hay %; archiva alguno antes de bajar',
      p_extra_establishments, v_terms.included_establishments + p_extra_establishments, v_usage.est;
  end if;
  if v_usage.users > v_terms.included_users + p_extra_users then
    raise exception 'Con % adicionales caben % usuarios internos y hay %; da de baja alguno antes de bajar',
      p_extra_users, v_terms.included_users + p_extra_users, v_usage.users;
  end if;

  -- Subir se cobra en proporción al periodo restante (RN-COM-18). Bajar,
  -- sin devolución: la mensualidad siguiente ya sale con la cifra nueva.
  v_fraction := public.cuotly_remaining_fraction(v_sub.current_period_start, v_sub.current_period_end, now());
  v_delta_cents := round((
      greatest(p_extra_establishments - v_sub.extra_establishments, 0) * v_terms.extra_establishment_cents
    + greatest(p_extra_users - v_sub.extra_users, 0) * v_terms.extra_user_cents) * v_fraction)::integer;

  if v_delta_cents > 0 then
    v_charge_id := public.issue_cuotly_charge_internal(
      v_sub.id, 'proration', 'Adicionales de Cuotly Pro (parte proporcional)',
      now(), v_sub.current_period_end, v_sub.current_period_end, v_delta_cents,
      jsonb_build_object(
        'fraction', v_fraction,
        'added_establishments', greatest(p_extra_establishments - v_sub.extra_establishments, 0),
        'added_users', greatest(p_extra_users - v_sub.extra_users, 0)));
  end if;

  update public.cuotly_subscriptions
  set extra_establishments = p_extra_establishments, extra_users = p_extra_users, updated_at = now()
  where id = v_sub.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (p_space_id, auth.uid(), 'space.extras_changed', 'space', p_space_id,
          jsonb_build_object('extra_establishments', v_sub.extra_establishments, 'extra_users', v_sub.extra_users),
          jsonb_build_object('extra_establishments', p_extra_establishments, 'extra_users', p_extra_users,
                             'charge_id', v_charge_id, 'idempotency_key', v_key));

  return v_charge_id;
end;
$$;

comment on function public.set_cuotly_extras(uuid, integer, integer, text) is
  'RN-SUB-04 · los adicionales de Pro. Subir es inmediato y proporcional;
   bajar es inmediato para el límite, nunca por debajo del uso, y sin
   devolución. Devuelve el cobro proporcional, si lo hubo.';

revoke all on function public.set_cuotly_extras(uuid, integer, integer, text) from public, anon;
grant execute on function public.set_cuotly_extras(uuid, integer, integer, text) to authenticated;

create or replace function public.change_cuotly_plan(
  p_space_id uuid,
  p_new_plan text,
  p_extra_establishments integer default 0,
  p_extra_users integer default 0,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.spaces;
  v_sub public.cuotly_subscriptions;
  v_old record;
  v_new record;
  v_usage record;
  v_key text;
  v_fraction numeric;
  v_diff integer;
  v_charge_id uuid;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio cambia el plan de Cuotly';
  end if;
  if p_new_plan not in ('pro', 'agency') then
    raise exception 'El plan de Cuotly es Pro o Agency, no %', p_new_plan;
  end if;

  select * into v_space from public.spaces where id = p_space_id;
  select * into v_sub from public.cuotly_subscriptions where space_id = p_space_id for update;
  if v_sub.id is null then
    raise exception 'Este espacio no tiene suscripción de Cuotly';
  end if;
  if v_space.cuotly_status <> 'active' then
    raise exception 'El plan se cambia con la suscripción activa; en la prueba se elige antes de empezar (§4.4)';
  end if;

  if p_new_plan = v_sub.plan and v_sub.pending_plan is null then
    return null; -- CA-17: cambiar al mismo plan no hace nada.
  end if;

  v_key := coalesce(p_idempotency_key, 'plan_change:' || v_sub.id::text || ':' || p_new_plan);
  if exists (
    select 1 from public.audit_log
    where action in ('space.plan_changed', 'space.plan_change_scheduled') and entity_id = p_space_id
      and new_value ->> 'idempotency_key' = v_key
  ) then
    return null;
  end if;

  select * into v_old from public.cuotly_plan_terms(v_sub.plan);
  select * into v_new from public.cuotly_plan_terms(p_new_plan);

  if p_new_plan = 'agency' then
    if v_sub.plan = 'agency' then
      -- Volver a Agency es anular el cambio a Pro programado.
      perform public.cancel_cuotly_plan_change(p_space_id);
      return null;
    end if;

    -- §4.7 · Pro → Agency: inmediato, con diferencia proporcional
    -- (RN-COM-18). Los adicionales de Pro dejan de aplicarse.
    v_fraction := public.cuotly_remaining_fraction(v_sub.current_period_start, v_sub.current_period_end, now());
    v_diff := round((v_new.price_cents - v_old.price_cents) * v_fraction)::integer;

    if v_diff > 0 then
      v_charge_id := public.issue_cuotly_charge_internal(
        v_sub.id, 'proration', 'Mejora a Cuotly Agency (parte proporcional)',
        now(), v_sub.current_period_end, v_sub.current_period_end, v_diff,
        jsonb_build_object('from_plan', 'pro', 'to_plan', 'agency', 'fraction', v_fraction));
    end if;

    update public.cuotly_subscriptions
    set plan = 'agency', extra_establishments = 0, extra_users = 0,
        pending_plan = null, pending_extra_establishments = 0, pending_extra_users = 0,
        pending_requested_at = null, updated_at = now()
    where id = v_sub.id;

    perform set_config('cuotly.space_status_change', 'on', true);
    update public.spaces set cuotly_plan = 'agency' where id = p_space_id;
    perform set_config('cuotly.space_status_change', 'off', true);

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (p_space_id, auth.uid(), 'space.plan_changed', 'space', p_space_id,
            jsonb_build_object('plan', 'pro', 'extra_establishments', v_sub.extra_establishments,
                               'extra_users', v_sub.extra_users),
            jsonb_build_object('plan', 'agency', 'kind', 'immediate_upgrade', 'fraction', v_fraction,
                               'difference_cents', v_diff, 'charge_id', v_charge_id,
                               'idempotency_key', v_key));
    return v_charge_id;
  end if;

  -- §4.7 · Agency → Pro: en la siguiente renovación, y solo si el uso cabe
  -- en Pro con los adicionales que se contraten ahora.
  if p_extra_establishments is null or p_extra_establishments < 0
     or p_extra_users is null or p_extra_users < 0 then
    raise exception 'Los adicionales son números enteros no negativos';
  end if;

  select
    (select count(*) from public.establishments e where e.space_id = p_space_id and e.status <> 'archived') as est,
    (select count(*) from public.space_memberships sm where sm.space_id = p_space_id and sm.status = 'active') as users
  into v_usage;
  if v_usage.est > v_new.included_establishments + p_extra_establishments then
    raise exception 'Antes de bajar a Pro hay que resolver el exceso (§4.7): caben % establecimientos activos y hay %',
      v_new.included_establishments + p_extra_establishments, v_usage.est;
  end if;
  if v_usage.users > v_new.included_users + p_extra_users then
    raise exception 'Antes de bajar a Pro hay que resolver el exceso (§4.7): caben % usuarios internos y hay %',
      v_new.included_users + p_extra_users, v_usage.users;
  end if;

  update public.cuotly_subscriptions
  set pending_plan = 'pro', pending_extra_establishments = p_extra_establishments,
      pending_extra_users = p_extra_users, pending_requested_at = now(), updated_at = now()
  where id = v_sub.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (p_space_id, auth.uid(), 'space.plan_change_scheduled', 'space', p_space_id,
          jsonb_build_object('plan', 'agency'),
          jsonb_build_object('pending_plan', 'pro', 'applies_at', v_sub.current_period_end,
                             'extra_establishments', p_extra_establishments, 'extra_users', p_extra_users,
                             'idempotency_key', v_key));
  return null;
end;
$$;

comment on function public.change_cuotly_plan(uuid, text, integer, integer, text) is
  '§4.7, RN-SUB-10 · Pro → Agency inmediato y proporcional; Agency → Pro en
   la renovación, solo si el uso cabe, y desde entonces rigen los límites de
   Pro para crecer. Devuelve el cobro proporcional, si lo hubo.';

revoke all on function public.change_cuotly_plan(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.change_cuotly_plan(uuid, text, integer, integer, text) to authenticated;

create or replace function public.cancel_cuotly_plan_change(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.cuotly_subscriptions;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio anula un cambio de plan de Cuotly';
  end if;

  select * into v_sub from public.cuotly_subscriptions where space_id = p_space_id for update;
  if v_sub.id is null or v_sub.pending_plan is null then
    return; -- CA-17.
  end if;

  update public.cuotly_subscriptions
  set pending_plan = null, pending_extra_establishments = 0, pending_extra_users = 0,
      pending_requested_at = null, updated_at = now()
  where id = v_sub.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (p_space_id, auth.uid(), 'space.plan_change_cancelled', 'space', p_space_id,
          jsonb_build_object('pending_plan', v_sub.pending_plan),
          jsonb_build_object('pending_plan', null));
end;
$$;

revoke all on function public.cancel_cuotly_plan_change(uuid) from public, anon;
grant execute on function public.cancel_cuotly_plan_change(uuid) to authenticated;

-- ============================================================
-- 15 · Reactivar desde la plataforma (RN-SUB-09)
-- ============================================================
create or replace function public.platform_reactivate_space(p_space_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_platform_subscription_manager() then
    raise exception 'Solo Cuotly reactiva un espacio archivado';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Hace falta un motivo para reactivar un espacio';
  end if;

  select cuotly_status into v_status from public.spaces where id = p_space_id;
  if v_status is null then
    raise exception 'Espacio no encontrado o sin suscripción de Cuotly';
  end if;
  if v_status not in ('archived_trial_ended', 'archived_nonpayment') then
    return; -- CA-17.
  end if;

  perform public.set_space_cuotly_status_internal(p_space_id, 'active', btrim(p_reason), 'platform');
end;
$$;

comment on function public.platform_reactivate_space(uuid, text) is
  'RN-SUB-09 · pasado el plazo de 30 días, o cuando Bosco lo decida, la
   reactivación es de la plataforma y lleva motivo.';

revoke all on function public.platform_reactivate_space(uuid, text) from public, anon;
grant execute on function public.platform_reactivate_space(uuid, text) to authenticated;

-- ============================================================
-- 16 · El barrido (RN-SUB-05, RN-SUB-07, RN-SUB-08, RN-SUB-11)
-- ============================================================
--
-- Lo llama la cola, espacio por espacio, y toma `p_now` para que la suite
-- pueda mover el reloj. Cuatro pasos, en este orden:
--   1. la renovación: aplicar el cambio a Pro programado y avanzar el periodo;
--   2. emitir la mensualidad siguiente 7 días antes de la renovación;
--   3. los cinco avisos de cada cobro con deuda viva;
--   4. el corte: la prueba, al vencer; la suscripción activa, a las 72 h.
-- Un espacio archivado ni renueva ni emite: solo recibe los avisos que le
-- falten y espera el pago.
create or replace function public.run_cuotly_billing_sweep(p_space_id uuid, p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.spaces;
  v_sub public.cuotly_subscriptions;
  v_charge record;
  v_event text;
  v_actions integer := 0;
  v_grace interval := make_interval(hours => public.cuotly_constant('grace_hours'));
  v_lead interval := make_interval(days => public.cuotly_constant('charge_lead_days'));
begin
  select * into v_space from public.spaces where id = p_space_id;
  if v_space.id is null or v_space.cuotly_status is null then
    return 0;
  end if;
  select * into v_sub from public.cuotly_subscriptions where space_id = p_space_id for update;
  if v_sub.id is null then
    return 0;
  end if;

  -- 1 · la renovación.
  while v_space.cuotly_status in ('trial', 'active') and v_sub.current_period_end <= p_now loop
    if v_sub.pending_plan is not null then
      update public.cuotly_subscriptions
      set plan = v_sub.pending_plan,
          extra_establishments = v_sub.pending_extra_establishments,
          extra_users = v_sub.pending_extra_users,
          pending_plan = null, pending_extra_establishments = 0, pending_extra_users = 0,
          pending_requested_at = null
      where id = v_sub.id;

      perform set_config('cuotly.space_status_change', 'on', true);
      update public.spaces set cuotly_plan = v_sub.pending_plan where id = p_space_id;
      perform set_config('cuotly.space_status_change', 'off', true);

      insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
      values (p_space_id, null, 'space.plan_changed', 'space', p_space_id,
              jsonb_build_object('plan', v_sub.plan),
              jsonb_build_object('plan', v_sub.pending_plan, 'kind', 'at_renewal',
                                 'extra_establishments', v_sub.pending_extra_establishments,
                                 'extra_users', v_sub.pending_extra_users));
      v_actions := v_actions + 1;
    end if;

    update public.cuotly_subscriptions
    set current_period_start = v_sub.current_period_end,
        current_period_end = v_sub.current_period_end + interval '1 month',
        updated_at = p_now
    where id = v_sub.id;

    select * into v_sub from public.cuotly_subscriptions where id = v_sub.id;
  end loop;

  -- 2 · la mensualidad siguiente, 7 días antes.
  if v_space.cuotly_status in ('trial', 'active')
     and p_now >= v_sub.current_period_end - v_lead
     and not exists (
       select 1 from public.cuotly_charges c
       where c.subscription_id = v_sub.id and c.kind = 'period' and c.period_start = v_sub.current_period_end
     ) then
    perform public.issue_cuotly_period_charge_internal(
      v_sub.id, v_sub.current_period_end, v_sub.current_period_end + interval '1 month');
    v_actions := v_actions + 1;
  end if;

  -- 3 · los avisos, una vez cada uno por cobro (CA-17: la clave lo garantiza).
  for v_charge in
    select c.id, c.due_at, c.total_cents from public.cuotly_charges c
    where c.space_id = p_space_id and public.cuotly_charge_outstanding_cents(c.id) > 0
  loop
    foreach v_event in array array[
      'cuotly_payment_due_soon', 'cuotly_payment_due_today', 'cuotly_payment_overdue_24h',
      'cuotly_payment_overdue_48h', 'cuotly_payment_final_notice']
    loop
      if p_now >= v_charge.due_at + make_interval(hours => public.cuotly_reminder_offset_hours(v_event)) then
        v_actions := v_actions + public.notify_cuotly_event(
          p_space_id, v_event, 'cuotly_charge', v_charge.id,
          v_event || ':' || v_charge.id::text, v_charge.total_cents);
      end if;
    end loop;
  end loop;

  -- 4 · el corte. Un pago declarado y pendiente detiene el reloj (RN-SUB-08).
  if v_space.cuotly_status = 'trial' and exists (
    select 1 from public.cuotly_charges c
    where c.space_id = p_space_id
      and public.cuotly_charge_outstanding_cents(c.id) > 0
      and not public.cuotly_charge_has_pending_declaration(c.id)
      and c.due_at <= p_now
  ) then
    perform public.set_space_cuotly_status_internal(
      p_space_id, 'archived_trial_ended', 'La prueba terminó sin pago (§4.4)', 'trial_ended');
    v_actions := v_actions + 1;
  elsif v_space.cuotly_status = 'active' and exists (
    select 1 from public.cuotly_charges c
    where c.space_id = p_space_id
      and public.cuotly_charge_outstanding_cents(c.id) > 0
      and not public.cuotly_charge_has_pending_declaration(c.id)
      and c.due_at + v_grace <= p_now
  ) then
    perform public.set_space_cuotly_status_internal(
      p_space_id, 'archived_nonpayment', 'Impago: 72 horas desde el vencimiento (§4.6)', 'nonpayment');
    v_actions := v_actions + 1;
  end if;

  -- 5 · a los 30 días: nada. La eliminación operativa es del bloque legal
  -- (pendiente 20) y aquí solo está escrita la fecha límite.

  return v_actions;
end;
$$;

comment on function public.run_cuotly_billing_sweep(uuid, timestamptz) is
  'RN-SUB-05/07/08/11 · renueva, emite, avisa y corta. Reservada a la cola
   (service_role). `p_now` existe para que la suite mueva el reloj.';

revoke all on function public.run_cuotly_billing_sweep(uuid, timestamptz) from public, anon, authenticated;

-- La cola: un tipo de trabajo más, solo para los espacios con suscripción.
alter table public.scheduled_jobs drop constraint scheduled_jobs_kind_check;
alter table public.scheduled_jobs add constraint scheduled_jobs_kind_check
  check (kind in ('monthly_charges', 'dunning_sweep', 'sla_sweep', 'lifecycle_sweep',
                  'consumption_sweep', 'daily_menu_sweep', 'cuotly_billing_sweep'));

create or replace function public.run_scheduled_job(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_space uuid;
  v_hechos integer := 0;
begin
  select kind, space_id into v_kind, v_space
  from public.scheduled_jobs where id = p_job_id;

  if v_kind is null then
    raise exception 'Trabajo de cola no encontrado';
  end if;

  if v_kind = 'monthly_charges' then
    v_hechos := public.run_monthly_charges(v_space);
  elsif v_kind = 'dunning_sweep' then
    v_hechos := public.run_dunning_sweep(v_space);
  elsif v_kind = 'lifecycle_sweep' then
    v_hechos := public.run_lifecycle_sweep(v_space);
  elsif v_kind = 'consumption_sweep' then
    v_hechos := public.run_consumption_thresholds(v_space);
  elsif v_kind = 'daily_menu_sweep' then
    v_hechos := public.run_daily_menu_sweep(v_space);
  elsif v_kind = 'cuotly_billing_sweep' then
    v_hechos := public.run_cuotly_billing_sweep(v_space);
  elsif v_kind = 'sla_sweep' then
    raise exception 'El barrido de plazos lo ejecuta src/services/queue-runner.ts, no SQL';
  else
    raise exception 'Tipo de trabajo de cola desconocido: %', v_kind;
  end if;

  perform public.finish_scheduled_job(p_job_id, true, null);
  return v_hechos;
end;
$$;

revoke all on function public.run_scheduled_job(uuid) from public, anon, authenticated;

create or replace function public.enqueue_due_scheduled_jobs(
  p_run_after timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space record;
  v_kind text;
  v_hora text := to_char(p_run_after at time zone 'UTC', 'YYYYMMDDHH24');
  v_encolados integer := 0;
begin
  for v_space in select id, cuotly_plan from public.spaces loop
    foreach v_kind in array array[
      'monthly_charges',   -- RN-FIN-01
      'dunning_sweep',     -- RN-FIN-10 y RN-FIN-11
      'lifecycle_sweep',   -- RN-EST-09, RN-EST-10 y §6.4
      'consumption_sweep', -- §18, avisos al 80 % y al 100 %
      'daily_menu_sweep'   -- RN-MEN-08 y §62 (Hito 11)
    ]
    loop
      if public.enqueue_scheduled_job(
           v_space.id, v_kind, p_run_after,
           v_kind || ':' || v_space.id::text || ':' || v_hora) is not null then
        v_encolados := v_encolados + 1;
      end if;
    end loop;

    -- Hito 18 · solo los espacios con suscripción de Cuotly.
    if v_space.cuotly_plan is not null
       and public.enqueue_scheduled_job(
             v_space.id, 'cuotly_billing_sweep', p_run_after,
             'cuotly_billing_sweep:' || v_space.id::text || ':' || v_hora) is not null then
      v_encolados := v_encolados + 1;
    end if;
  end loop;

  return v_encolados;
end;
$$;

revoke all on function public.enqueue_due_scheduled_jobs(timestamptz)
  from public, anon, authenticated;

-- ============================================================
-- 17 · La auditoría conoce las dos familias nuevas (§21.2)
-- ============================================================
--
-- `cuotly_charge` y `cuotly_payment` son del propietario, como `space`:
-- §4.2.1 dice que es él quien paga. No `manage_finance`: eso es el dinero
-- de los restaurantes, y lo tienen los administradores.
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
    when 'menu_template' then 'manage_clients'
    when 'integration' then 'manage_clients'
    when 'opportunity' then 'manage_clients'
    when 'report' then 'manage_clients'
    when 'cuotly_charge' then 'manage_space'
    when 'cuotly_payment' then 'manage_space'
    else null
  end;
$$;

-- Se comprueba con `supabase/tests/plataforma_suscripcion_de_cuotly.sql`.
