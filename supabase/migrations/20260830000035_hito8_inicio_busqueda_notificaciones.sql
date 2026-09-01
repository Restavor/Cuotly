-- Hito 8 · Inicio por rol, búsqueda global, notificaciones, calendario y
-- cierre de la Fase 1 (PRD §18 RN-NOT, §20.4 y §20.5, §14.3 RN-ASG-10/12,
-- HU-30 a HU-34; ROADMAP Hito 8).
--
-- Lo que este archivo añade al servidor, y por qué cada pieza está donde
-- está:
--
-- 1. **Centro de notificaciones y cola de correo** (RN-NOT). El aviso
--    dentro de Cuotly y el envío por correo son dos tablas distintas a
--    propósito: `notifications` es lo que la persona ve, y
--    `notification_deliveries` es la cola de envío con sus reintentos.
--    Separarlas es lo que hace cierto RN-NOT-05 y CA-18 —"el fallo de una
--    notificación nunca revierte la operación principal"—: la operación de
--    negocio, la notificación y el encolado ocurren en la misma
--    transacción (tres INSERT locales, sin red), y el envío real ocurre
--    después, fuera, contra Resend. Si Resend está caído, lo que falla es
--    una fila de la cola, no la publicación del trabajo.
--
-- 2. **Sin `payload jsonb` en las notificaciones.** El barrido de
--    identidad de supabase/tests/hito7_mensajes_archivos_finanzas.sql
--    recorre columnas `uuid`, `text` y `varchar`; un `jsonb` libre sería
--    justo el hueco por el que volvería a colarse la identidad del equipo
--    (CLAUDE.md MUST NOT), que ya se escapó tres veces. Así que los datos
--    que el texto del aviso necesita son columnas tipadas y contadas
--    —`threshold_percent`, `amount_cents`— y nada más.
--
-- 3. **Cola de trabajos programados** (`scheduled_jobs`). El ROADMAP dejó
--    escrito que `generate_monthly_charge()` y
--    `evaluate_establishment_dunning()` existen pero "no se disparan
--    solas", y que la cola que las dispare pertenece a este hito. Aquí
--    está: encolado idempotente, reintentos con espera creciente y una
--    ejecución por bloque de excepción, de modo que un trabajo que falle
--    no tumbe el lote entero.
--
-- 4. **Los umbrales de T2 y T3 no se calculan aquí.** El reloj laboral
--    vive en `src/core/business-clock.ts` con su batería de tests (CA-10,
--    CA-11) y es la única definición de "tiempo consumido" del proyecto.
--    Reescribirlo en PL/pgSQL sería tener dos reglas distintas para el
--    mismo número. El servidor expone `emit_sla_notification()` reservada
--    a `service_role`, y quien decide que se ha cruzado el 80 % es el
--    proceso de cola en TypeScript (`src/services/queue-runner.ts`), que
--    usa `crossesThreshold()` de `src/core/sla-timers.ts`.
--
-- 5. **La búsqueda global es `SECURITY INVOKER`, a propósito.** PRD §20.5:
--    "nunca devuelve resultados a los que el usuario no tenga acceso (el
--    filtrado ocurre en servidor)". La forma de garantizarlo no es
--    escribir a mano una lista de permisos dentro de la consulta —eso es
--    otra copia de las reglas que se desincroniza—, sino ejecutarla con
--    los privilegios de quien pregunta y dejar que RLS haga exactamente lo
--    mismo que hace en el resto de la aplicación.
--
-- 6. **Las ausencias son organización interna del equipo** (P7). El
--    cliente no ve la fila, no se le tapa una columna: es el caso de
--    `assignments` y `tasks`, no el de `messages` (CLAUDE.md, bloqueante
--    B2 de la cuarta revisión).
--
-- Lo que este hito **no** hace, a propósito:
--   · No inventa la escalada de RN-ASG-05 ("las alertas crecen mientras
--     nadie lo asuma"): el PRD no da ni umbrales ni cadencia, así que se
--     emite el aviso una vez y se deja dicho aquí en vez de improvisar una
--     progresión.
--   · No manda push (Fase 4) ni WhatsApp automático (§18: WhatsApp es un
--     botón manual, nunca un canal).
--   · No sincroniza calendarios en ninguna dirección (pendiente
--     deliberado de CLAUDE.md), ni crea una tabla de eventos de
--     calendario: `space_calendar()` los deriva de los datos que ya
--     existen. Un evento automático guardado sería un estado derivado
--     duplicado, que es justo lo que RN-DAT-05 prohíbe.

-- ============================================================
-- Capacidad nueva: 'manage_absences'.
--
-- HU-31 ("como administrador, quiero aprobar una ausencia") y RN-ASG-12.
-- Aprobar es de propietario y administrador; pedirla es de cualquier
-- miembro que realice trabajos, y eso lo comprueba request_absence() por
-- su cuenta, sin capacidad global.
-- ============================================================
create or replace function public.has_capability(p_space_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.space_role;
  v_can_perform_jobs boolean;
begin
  select sm.role, sm.can_perform_jobs into v_role, v_can_perform_jobs
  from public.space_memberships sm
  where sm.space_id = p_space_id
    and sm.user_id = auth.uid()
    and sm.status = 'active';

  if v_role is null then
    return false;
  end if;

  return case p_capability
    when 'manage_space' then v_role = 'owner'
    when 'invite_member' then v_role = 'owner'
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
    when 'manage_files' then v_role in ('owner', 'admin', 'worker')
    -- Hito 8:
    when 'manage_absences' then v_role in ('owner', 'admin')
    else false
  end;
end;
$$;

-- ============================================================
-- §18 · Catálogo de eventos de notificación.
--
-- Es un CHECK y no una tabla de configuración: un evento nuevo es una
-- decisión de producto que se escribe en el PRD y llega con su migración,
-- no algo que se dé de alta por pantalla. El mismo catálogo existe en
-- `src/core/notifications.ts`, y hay un test que compara los dos ficheros
-- para que no puedan separarse.
--
-- RN-NOT-03: "seguridad, pérdida de acceso, impagos graves y vencimientos
-- críticos no pueden desactivarse". Esos son los cuatro eventos que
-- notification_event_is_mandatory() devuelve como obligatorios.
-- ============================================================
create or replace function public.notification_event_is_mandatory(p_event_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_event_type in (
    -- Vencimientos críticos: el plazo de inicio o el de ejecución al 100 %.
    't2_threshold_100',
    't3_threshold_100',
    -- Impagos graves (RN-FIN-10 y RN-FIN-11): el servicio se detiene.
    'establishment_paused_nonpayment',
    'establishment_suspended_nonpayment'
  );
$$;

comment on function public.notification_event_is_mandatory(text) is
  'RN-NOT-03: los avisos que nadie puede desactivar dentro de Cuotly. No
   es una preferencia con valor por defecto: set_notification_preference()
   rechaza apagarlos.';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in (
    'request_submitted',
    'job_unassigned',
    'job_assigned',
    'job_started',
    'job_published',
    'correction_requested',
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
  )),
  -- Audiencia de la fila, para que una pantalla no tenga que deducirla:
  -- un aviso para el equipo y uno para el restaurante no se redactan
  -- igual, y el del restaurante no puede nombrar a nadie (CA-04).
  audience text not null check (audience in ('staff', 'client')),
  entity_type text not null check (entity_type in (
    'request', 'job', 'establishment', 'charge', 'absence'
  )),
  entity_id uuid not null,
  establishment_id uuid references public.establishments (id) on delete cascade,
  -- RN-NOT-04: "cada aviso lleva un enlace profundo que abre el elemento
  -- exacto". El enlace es una ruta relativa; el acceso se verifica al
  -- abrirla, con las mismas políticas que cualquier otra pantalla — la
  -- ruta guardada no autoriza nada por sí misma.
  deep_link text not null check (deep_link like '/espacios/%'),
  -- Los dos únicos datos numéricos que necesita el texto de un aviso.
  -- Tipados y contados, en vez de un jsonb libre: ver la cabecera.
  threshold_percent integer check (threshold_percent between 0 and 100),
  amount_cents bigint,
  -- CA-17 · "pulsar dos veces produce un único efecto y una única
  -- notificación": la unicidad es de base de datos, no de código.
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_id, dedupe_key)
);

create index notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (recipient_id) where read_at is null;

comment on table public.notifications is
  'PRD §18 y HU-34: el centro de notificaciones dentro de Cuotly. Una fila
   por persona y evento. No guarda texto: guarda el evento y a qué apunta,
   y la pantalla lo redacta desde src/i18n/es.ts — así el mismo estado se
   llama igual en pantalla, en el correo y en el historial (CA-21).';

alter table public.notifications enable row level security;

-- Cada uno ve las suyas y solo las suyas. No hay política de UPDATE:
-- marcar como leído pasa por mark_notification_read(), que comprueba el
-- destinatario y no deja tocar ninguna otra columna.
create policy notifications_select on public.notifications
for select
using (recipient_id = auth.uid());

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  in_app boolean not null default true,
  email boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (profile_id, space_id, event_type)
);

comment on table public.notification_preferences is
  'RN-NOT-02: "los propietarios reciben todo por defecto y pueden
   desactivar avisos secundarios". La ausencia de fila significa "todo
   activado" — no hace falta sembrar una fila por persona y evento.';

alter table public.notification_preferences enable row level security;

create policy notification_preferences_select on public.notification_preferences
for select
using (profile_id = auth.uid());

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('email')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'dead')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  provider_message_id text,
  -- RN-NOT-05: idempotencia. Una notificación tiene como mucho un envío
  -- por canal, aunque el encolado se repita.
  unique (notification_id, channel)
);

create index notification_deliveries_pending_idx
  on public.notification_deliveries (next_attempt_at)
  where status = 'pending';

comment on table public.notification_deliveries is
  'RN-NOT-05: la cola de envío por correo, con reintentos e idempotencia.
   No guarda la dirección de correo: la resuelve el proceso de envío desde
   `profiles` en el momento del envío, para no duplicar un dato personal
   en una segunda tabla.';

alter table public.notification_deliveries enable row level security;

-- Solo el propietario del espacio, y solo para diagnosticar la cola. Nadie
-- escribe esta tabla desde la aplicación: la escriben emit_notification()
-- y el proceso de envío con `service_role`.
create policy notification_deliveries_select on public.notification_deliveries
for select
using (public.has_capability(space_id, 'manage_space'));
