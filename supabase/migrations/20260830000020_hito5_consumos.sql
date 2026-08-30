-- Hito 5 · Consumos y aceptación (PRD §12 RN-CON, §11 RN-JOB (solo lo que
-- exige RN-REQ-02/RN-CLS-08), §6 RN-COM (solo lo que exige el consumo:
-- "un establecimiento tiene un plan, Menú Diario, o ambos" / "como máximo
-- un plan activo a la vez" — RN-COM-15 a 18, el prorrateo de cambio de
-- plan, NO se implementa aquí: ni el ROADMAP ni ningún CA de este hito lo
-- exige, y no hay todavía pantalla de cambio de plan que lo dispare).
--
-- Alcance deliberado (ROADMAP Hito 5): `consumption_cycles`,
-- `consumption_entries`, `acceptances`; libro inmutable, saldos
-- calculados, créditos compensatorios, devoluciones; aceptación del
-- cliente con transacción, bloqueo de fila e idempotencia; creación del
-- trabajo a partir de la aceptación.
--
-- `jobs` se crea aquí con las columnas mínimas que RN-REQ-02 exige (existe
-- porque una solicitud aceptada lo exige, RN-CLS-08/RN-CON-01) y con el
-- enum completo de estados de RN-JOB-01 (mismo principio que
-- request-states.ts: un único nombre por estado desde ya, aunque el Hito 6
-- sea quien implemente asignación, "Comenzar", bloqueos, publicación y
-- corrección). `started_at` es la única pieza de ese futuro que este hito
-- necesita adelantar: RN-JOB-04/CA-06 exige distinguir "antes de Comenzar"
-- de "después", y sin esa columna no hay forma de que cancel_accepted_request()
-- sepa cuál de las dos es. Nada de este hito escribe `started_at` — lo
-- hará "Comenzar" (RN-JOB-03) en el Hito 6; aquí solo se lee.
--
-- `subscriptions`: el contrato de un establecimiento con un plan o un
-- servicio (RN-COM-11 a 14). Solo lo necesario para saber, en el momento
-- de aceptar, si el establecimiento tiene un plan activo que incluya la
-- categoría del cambio — no hay flujo de alta/cambio de plan con
-- pantalla todavía, solo la tabla y su función de escritura mínima
-- (create_plan_subscription), gated por 'manage_clients' igual que
-- establishment_memberships.

-- ============================================================
-- subscriptions -----------------------------------------------------------
-- ============================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  kind text not null check (kind in ('plan', 'service')),
  plan_id uuid references public.plans (id),
  service_id uuid references public.services (id),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  started_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint subscriptions_kind_reference check (
    (kind = 'plan' and plan_id is not null and service_id is null)
    or (kind = 'service' and service_id is not null and plan_id is null)
  )
);

comment on table public.subscriptions is
  'Contrato vigente de un establecimiento con un plan de mantenimiento o un
   servicio (RN-COM-11). Sin flujo de cambio de plan (RN-COM-15 a 18) —
   fuera de alcance de este hito, ver cabecera del archivo.';

alter table public.subscriptions enable row level security;

create index subscriptions_establishment_id_idx on public.subscriptions (establishment_id);

-- RN-COM-13: "como máximo un plan de mantenimiento activo a la vez. Los
-- servicios adicionales pueden ser varios." — el índice solo restringe
-- kind = 'plan'.
create unique index subscriptions_one_active_plan_idx
  on public.subscriptions (establishment_id)
  where kind = 'plan' and status = 'active';

create policy subscriptions_select on public.subscriptions
for select
using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

create policy subscriptions_insert on public.subscriptions
for insert
with check (public.has_capability(space_id, 'manage_clients') and created_by = auth.uid());

create policy subscriptions_update on public.subscriptions
for update
using (public.has_capability(space_id, 'manage_clients'))
with check (public.has_capability(space_id, 'manage_clients'));

-- Sin política de DELETE (CLAUDE.md MUST NOT: no se borra físicamente un
-- registro de negocio) — para dar de baja un plan se pone status =
-- 'cancelled' con UPDATE, nunca se borra la fila.

create or replace function public.create_plan_subscription(p_establishment_id uuid, p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_plan_space_id uuid;
  v_subscription_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para asignar un plan a este establecimiento';
  end if;

  select space_id into v_plan_space_id from public.plans where id = p_plan_id;
  if v_plan_space_id is null or v_plan_space_id <> v_space_id then
    raise exception 'El plan no pertenece al mismo espacio que el establecimiento';
  end if;

  insert into public.subscriptions (space_id, establishment_id, kind, plan_id, created_by)
  values (v_space_id, p_establishment_id, 'plan', p_plan_id, auth.uid())
  returning id into v_subscription_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'subscription.plan_created', 'subscription', v_subscription_id, jsonb_build_object('establishment_id', p_establishment_id, 'plan_id', p_plan_id));

  return v_subscription_id;
end;
$$;

comment on function public.create_plan_subscription(uuid, uuid) is
  'Asigna un plan de mantenimiento a un establecimiento (RN-COM-11/13). La
   propia tabla, con su índice único parcial, es quien hace cumplir "como
   máximo un plan activo a la vez" — un intento repetido falla con
   unique_violation, no con una excepción de esta función.';

-- ============================================================
-- jobs ----------------------------------------------------------------
-- Ver la nota de cabecera del archivo: alcance mínimo de RN-REQ-02, con el
-- enum completo de RN-JOB-01 ya presente. Sin política de INSERT/UPDATE:
-- solo accept_request()/cancel_accepted_request() escriben esta tabla.
-- Se crea antes que consumption_cycles/consumption_entries porque ambas
-- lo referencian (job_id).
-- ============================================================
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  code text not null,
  state text not null default 'pending_assignment' check (state in (
    'pending_assignment', 'assigned', 'reassignment_requested', 'in_progress',
    'blocked_by_client', 'authorized_pause', 'published', 'in_correction',
    'completed', 'cancelled_before_start', 'cancelled_after_start'
  )),
  category text not null check (category in ('small', 'photo', 'medium', 'large')),
  -- RN-JOB-03 (Hito 6, "Comenzar") es quien la escribe. Aquí solo se lee,
  -- para decidir si una cancelación es "antes" o "después" (RN-JOB-04,
  -- CA-06).
  started_at timestamptz,
  cancelled_reason text,
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  -- RN-REQ-02, alcance de este hito: una solicitud aceptada crea como
  -- mucho un trabajo (la reapertura de una solicitud ya aceptada —
  -- RN-CLS-09, "una corrección interna cambia el consumo" — no está
  -- implementada todavía; ver cabecera del archivo).
  unique (request_id),
  unique (space_id, code)
);

comment on table public.jobs is
  'Unidad operativa creada al aceptar una solicitud (RN-REQ-02). Alcance
   mínimo del Hito 5 — asignación, "Comenzar", bloqueos, publicación y
   corrección llegan con el Hito 6, ampliando esta tabla con migraciones
   nuevas, nunca editando esta.';

alter table public.jobs enable row level security;

create index jobs_request_id_idx on public.jobs (request_id);
create index jobs_establishment_id_idx on public.jobs (establishment_id);

create policy jobs_select on public.jobs
for select
using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

-- ============================================================
-- consumption_cycles -------------------------------------------------------
-- ============================================================
create table public.consumption_cycles (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  cycle_start timestamptz not null,
  cycle_end timestamptz not null,
  -- Bolsa de cambios incluida, copiada del plan en el momento en que se
  -- crea el ciclo (RN-CON-05/CA-09: una renovación no altera el ciclo al
  -- que pertenece un consumo ya aceptado — si el plan cambiara más
  -- adelante, un ciclo ya creado no debe moverse con él).
  included_small integer not null check (included_small >= 0),
  included_photo integer not null check (included_photo >= 0),
  included_medium integer not null check (included_medium >= 0),
  included_large integer not null check (included_large >= 0),
  created_at timestamptz not null default now(),
  unique (subscription_id, cycle_start),
  constraint consumption_cycles_window check (cycle_end > cycle_start)
);

comment on table public.consumption_cycles is
  'Periodo mensual de una suscripción de plan (RN-COM-04/06). Sin política
   de INSERT/UPDATE/DELETE a propósito, mismo motivo que timer_events: solo
   lo escribe get_or_create_consumption_cycle() (SECURITY DEFINER, más
   abajo), nunca una llamada directa a la API.';

alter table public.consumption_cycles enable row level security;

create index consumption_cycles_subscription_id_idx on public.consumption_cycles (subscription_id);
create index consumption_cycles_establishment_id_idx on public.consumption_cycles (establishment_id);

create policy consumption_cycles_select on public.consumption_cycles
for select
using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

-- get_or_create_consumption_cycle --------------------------------------
-- Encuentra el ciclo vigente para "ahora" de una suscripción de plan,
-- creándolo si aún no existe (RN-COM-04: facturación mensual). El INSERT
-- ... ON CONFLICT ... DO UPDATE es a la vez el generador idempotente del
-- ciclo Y el punto de bloqueo de fila que exige RN-CON-06: dos llamadas
-- concurrentes con la misma (subscription_id, cycle_start) serializan
-- aquí — la segunda espera a que la primera confirme o deshaga antes de
-- devolver la fila, con los apuntes ya visibles (CA-05).
--
-- REVOKE de más abajo: sin ninguna comprobación de permiso propia (asume
-- que quien la llama ya validó el acceso al establecimiento), así que solo
-- puede invocarla otra función SECURITY DEFINER de este archivo — nunca
-- una llamada RPC directa (mismo principio que corrigió el hallazgo 1 del
-- Hito 4 para record_classification()).
create or replace function public.get_or_create_consumption_cycle(p_subscription_id uuid)
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

  -- RN-DAT-08/RN-CLK-06: el ciclo se calcula en la zona horaria del
  -- espacio, no en UTC, para que el corte de mes coincida con la fecha
  -- civil del establecimiento.
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
  -- No-op real (RN-CON-05: un ciclo ya creado no se mueve). La cláusula
  -- DO UPDATE existe solo para que INSERT ... ON CONFLICT tome el bloqueo
  -- de fila también en el camino de "ya existía" — un DO NOTHING no
  -- bloquea ni devuelve la fila con RETURNING.
  do update set cycle_start = excluded.cycle_start
  returning id into v_cycle_id;

  return v_cycle_id;
end;
$$;

comment on function public.get_or_create_consumption_cycle(uuid) is
  'Solo invocable desde accept_request()/cancel_accepted_request() (REVOKE
   de más abajo) — el bloqueo de fila de RN-CON-06/CA-05 depende de que la
   transacción que la llama sea la misma que hace el resto del trabajo de
   aceptación, no una llamada RPC suelta.';

revoke all on function public.get_or_create_consumption_cycle(uuid) from public;

-- ============================================================
-- consumption_entries -------------------------------------------------------
-- Libro inmutable de apuntes con signo (CLAUDE.md MUST, RN-DAT-04, CA-08).
-- El saldo de una categoría en un ciclo es sum(amount) — nunca hay una
-- columna de saldo que se actualice con UPDATE, y esta tabla no tiene
-- ninguna política de UPDATE/DELETE: solo SELECT, y el INSERT únicamente
-- lo hacen accept_request()/cancel_accepted_request() (SECURITY DEFINER).
-- ============================================================
create table public.consumption_entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  consumption_cycle_id uuid not null references public.consumption_cycles (id) on delete cascade,
  category text not null check (category in ('small', 'photo', 'medium', 'large')),
  amount integer not null check (amount <> 0),
  entry_type text not null check (entry_type in ('debit', 'return', 'compensatory_credit')),
  request_id uuid references public.requests (id),
  job_id uuid references public.jobs (id),
  -- RN-CON-12: toda devolución conserva motivo y trazabilidad completa —
  -- related_entry_id enlaza una devolución o un crédito compensatorio con
  -- el apunte de débito original.
  related_entry_id uuid references public.consumption_entries (id),
  reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint consumption_entries_sign check (
    (entry_type = 'debit' and amount < 0)
    or (entry_type in ('return', 'compensatory_credit') and amount > 0)
  )
);

comment on table public.consumption_entries is
  'Libro inmutable de consumos (RN-CON, CA-08). "El saldo mostrado siempre
   es igual a la suma de los apuntes del libro" — no existe ninguna
   columna de saldo mutable en todo el esquema de Cuotly.';

alter table public.consumption_entries enable row level security;

create index consumption_entries_cycle_category_idx on public.consumption_entries (consumption_cycle_id, category);
create index consumption_entries_establishment_id_idx on public.consumption_entries (establishment_id);

create policy consumption_entries_select on public.consumption_entries
for select
using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

-- ============================================================
-- acceptances -----------------------------------------------------------
-- Una fila por aceptación válida del cliente (RN-SLA-08 prevé varios
-- intentos por solicitud en el futuro, cuando exista reclasificación
-- post-aceptación — Hito 6 en adelante; este hito crea como mucho una).
-- ============================================================
create table public.acceptances (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  job_id uuid references public.jobs (id),
  category text not null check (category in ('small', 'photo', 'medium', 'large')),
  consumption_cycle_id uuid references public.consumption_cycles (id),
  consumption_entry_id uuid references public.consumption_entries (id),
  -- RN-COM-01/02/12: sin plan que incluya la categoría, el cambio se
  -- presupuesta aparte (RN-CON-03: no consume la bolsa). `quotes` (§5.2)
  -- sigue sin flujo completo — esta columna solo distingue el caso para
  -- que consumption_cycle_id/consumption_entry_id null tengan un motivo
  -- explícito en vez de ambiguo.
  budgeted boolean not null default false,
  accepted_by uuid not null references public.profiles (id),
  accepted_at timestamptz not null default now()
);

comment on table public.acceptances is
  'Una aceptación válida del cliente (RN-CLS-08, RN-REQ-02). Sin política
   de INSERT/UPDATE/DELETE: solo accept_request() la escribe.';

alter table public.acceptances enable row level security;

create index acceptances_request_id_idx on public.acceptances (request_id);
create index acceptances_establishment_id_idx on public.acceptances (establishment_id);

create policy acceptances_select on public.acceptances
for select
using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

-- ============================================================
-- accept_request — se sustituye por completo (misma firma que la
-- migración 20260830000017/18): además de mover pending_client_acceptance
-- -> accepted, ahora registra el consumo (RN-CLS-08) y crea el trabajo
-- (RN-REQ-02) en la misma transacción. Sigue siendo idempotente (CA-17):
-- si ya está accepted, no hace nada — ni vuelve a crear el trabajo ni
-- vuelve a consumir.
-- ============================================================
create or replace function public.accept_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_category text;
  v_subscription_id uuid;
  v_included_small integer;
  v_included_photo integer;
  v_included_medium integer;
  v_included_large integer;
  v_included integer;
  v_budgeted boolean := true;
  v_cycle_id uuid;
  v_cycle_included integer;
  v_balance integer;
  v_seq bigint;
  v_job_code text;
  v_job_id uuid;
  v_entry_id uuid;
begin
  select space_id, establishment_id, state, validated_category
  into v_space_id, v_establishment_id, v_state, v_category
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state = 'accepted' then
    return; -- CA-17: pulsar aceptar dos veces no duplica el efecto.
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state <> 'pending_client_acceptance' then
    raise exception 'La solicitud no está pendiente de aceptación';
  end if;

  if v_category is null then
    raise exception 'La solicitud no tiene una categoría validada';
  end if;

  -- RN-COM-01/02/12 + RN-CON-03: solo consume si hay un plan activo que
  -- incluya la categoría del cambio. Sin plan, o con un plan que no la
  -- incluye (p. ej. "large" en Impulso), el trabajo queda presupuestado
  -- aparte y no toca ningún ciclo.
  select s.id, p.included_small, p.included_photo, p.included_medium, p.included_large
  into v_subscription_id, v_included_small, v_included_photo, v_included_medium, v_included_large
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = v_establishment_id and s.kind = 'plan' and s.status = 'active'
  limit 1;

  if v_subscription_id is not null then
    v_included := case v_category
      when 'small' then v_included_small
      when 'photo' then v_included_photo
      when 'medium' then v_included_medium
      when 'large' then v_included_large
    end;

    if v_included > 0 then
      v_budgeted := false;
      v_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);
      -- El bloqueo de fila real ya lo toma el INSERT ... ON CONFLICT DO
      -- UPDATE de get_or_create_consumption_cycle() (RN-CON-06/CA-05): la
      -- fila del ciclo queda bloqueada para el resto de esta transacción,
      -- así que la lectura del saldo de abajo ya es consistente con
      -- cualquier otra aceptación que esté en curso sobre el mismo ciclo.
      --
      -- CA-08: el saldo es la bolsa incluida del propio ciclo (su
      -- instantánea, no el plan en vivo — RN-CON-05/CA-09) más la suma de
      -- los apuntes del libro (que son deltas: -1 débito, +1 devolución o
      -- crédito compensatorio) — nunca un contador que se actualiza con
      -- UPDATE.
      select case v_category
        when 'small' then included_small
        when 'photo' then included_photo
        when 'medium' then included_medium
        when 'large' then included_large
      end into v_cycle_included
      from public.consumption_cycles where id = v_cycle_id;

      select v_cycle_included + coalesce(sum(amount), 0) into v_balance
      from public.consumption_entries
      where consumption_cycle_id = v_cycle_id and category = v_category;

      if v_balance <= 0 then
        raise exception 'Sin crédito disponible en el ciclo actual para la categoría %', v_category;
      end if;
    end if;
  end if;

  -- Código humano del trabajo (RN-DAT-01), correlativo por espacio. Se
  -- suma aquí directamente (sin una función RPC nueva e invocable por su
  -- cuenta) porque quien acepta es el cliente, no un miembro del espacio:
  -- next_space_sequence() exige is_space_member() (migración
  -- 20260830000012) y lo rechazaría. El acceso de escritura ya se
  -- comprobó arriba con can_write_establishment().
  insert into public.space_sequences (space_id, sequence_name, next_value)
  values (v_space_id, 'job', 2)
  on conflict (space_id, sequence_name)
  do update set next_value = public.space_sequences.next_value + 1
  returning next_value - 1 into v_seq;
  v_job_code := 'TRB-' || lpad(v_seq::text, 4, '0');

  -- RN-REQ-02: el trabajo solo se crea desde una solicitud accepted.
  insert into public.jobs (space_id, establishment_id, request_id, code, category)
  values (v_space_id, v_establishment_id, p_request_id, v_job_code, v_category)
  returning id into v_job_id;

  if not v_budgeted then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, created_by)
    values
      (v_space_id, v_establishment_id, v_cycle_id, v_category, -1, 'debit', p_request_id, v_job_id, auth.uid())
    returning id into v_entry_id;
  end if;

  insert into public.acceptances
    (space_id, establishment_id, request_id, job_id, category, consumption_cycle_id, consumption_entry_id, budgeted, accepted_by)
  values
    (v_space_id, v_establishment_id, p_request_id, v_job_id, v_category, v_cycle_id, v_entry_id, v_budgeted, auth.uid());

  update public.requests set state = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.accepted', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'accepted', 'job_id', v_job_id, 'job_code', v_job_code, 'budgeted', v_budgeted)
  );
end;
$$;

comment on function public.accept_request(uuid) is
  'HU-12/RN-REQ-02/RN-CLS-08/RN-CON-06. Sustituye por completo a la
   versión de la migración 20260830000017: además de mover el estado,
   registra el consumo y crea el trabajo en la misma transacción, con
   bloqueo de fila sobre el ciclo (CA-05) e idempotencia (CA-17).';

-- ============================================================
-- cancel_accepted_request — RN-JOB-04/CA-06/CA-07. El cliente cancela una
-- solicitud ya aceptada. Antes de que el trabajo empiece (jobs.started_at
-- todavía null) se devuelve el consumo; después, se mantiene. Idempotente:
-- si ya está cancelada, no hace nada.
-- ============================================================
create or replace function public.cancel_accepted_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_request_state text;
  v_job_id uuid;
  v_job_state text;
  v_started_at timestamptz;
  v_new_state text;
  v_before_start boolean;
  v_debit_entry_id uuid;
  v_original_cycle_id uuid;
  v_category text;
  v_subscription_id uuid;
  v_current_cycle_id uuid;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_request_state
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  select id, state, started_at into v_job_id, v_job_state, v_started_at
  from public.jobs where request_id = p_request_id
  for update;

  if v_job_id is null then
    raise exception 'La solicitud no tiene un trabajo asociado, no se puede cancelar';
  end if;

  if v_job_state in ('cancelled_before_start', 'cancelled_after_start') then
    return; -- Idempotente: ya se canceló.
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_request_state <> 'accepted' then
    raise exception 'La solicitud no está en un estado que se pueda cancelar';
  end if;

  -- RN-JOB-04: antes de "Comenzar" (started_at todavía null) se devuelve
  -- el consumo; después, se mantiene.
  v_before_start := v_started_at is null;
  v_new_state := case when v_before_start then 'cancelled_before_start' else 'cancelled_after_start' end;

  update public.jobs
  set state = v_new_state, cancelled_reason = p_reason, cancelled_by = auth.uid(), cancelled_at = now()
  where id = v_job_id;

  update public.requests set state = v_new_state where id = p_request_id;

  if v_before_start then
    select ce.id, ce.consumption_cycle_id, ce.category
    into v_debit_entry_id, v_original_cycle_id, v_category
    from public.consumption_entries ce
    where ce.job_id = v_job_id and ce.entry_type = 'debit'
    order by ce.created_at desc
    limit 1;

    -- Solo hay algo que devolver si el trabajo consumió de verdad
    -- (RN-CON-03: uno presupuestado aparte no tiene apunte de débito).
    if v_debit_entry_id is not null then
      select subscription_id into v_subscription_id
      from public.consumption_cycles where id = v_original_cycle_id;

      v_current_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);

      if v_current_cycle_id = v_original_cycle_id then
        -- RN-CON-08/09: el ciclo original sigue vigente, la devolución
        -- entra en él.
        insert into public.consumption_entries
          (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, related_entry_id, reason, created_by)
        values
          (v_space_id, v_establishment_id, v_original_cycle_id, v_category, 1, 'return', p_request_id, v_job_id, v_debit_entry_id, p_reason, auth.uid());
      else
        -- RN-CON-10/CA-07: el ciclo original ya cerró — no se reabre, se
        -- crea un crédito compensatorio en el ciclo actual (RN-CON-11:
        -- caduca con él, como cualquier otro consumo, porque el saldo es
        -- sum(amount) dentro de ese ciclo — sin traspaso entre ciclos).
        insert into public.consumption_entries
          (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, related_entry_id, reason, created_by)
        values
          (v_space_id, v_establishment_id, v_current_cycle_id, v_category, 1, 'compensatory_credit', p_request_id, v_job_id, v_debit_entry_id,
           coalesce(p_reason || ' ', '') || '(crédito compensatorio: el ciclo original ya había cerrado)', auth.uid());
      end if;
    end if;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'request.cancelled', 'request', p_request_id,
    jsonb_build_object('state', 'accepted', 'job_state', v_job_state),
    jsonb_build_object('state', v_new_state, 'consumption_returned', v_before_start and v_debit_entry_id is not null),
    p_reason
  );
end;
$$;

comment on function public.cancel_accepted_request(uuid, text) is
  'RN-JOB-04/CA-06/CA-07. Solo el cliente (can_write_establishment) — el
   equipo no cancela en nombre del cliente en este hito, mismo criterio que
   accept_request()/decline_request().';
