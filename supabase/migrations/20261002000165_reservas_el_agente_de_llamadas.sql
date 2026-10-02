-- Fase B de Restavor agents (AGT-01) · quinta de siete migraciones.
--
-- El agente de llamadas (PRD de agents §7 y §8.5): su estado, su horario, lo que
-- sabe del restaurante, sus llamadas y su clave de API. Solo la estructura: las
-- RPC que las escriben llegan en la Fase G.
--
--   1 · `agent_state` y `agent_state_events`: encendido/apagado y su historial.
--   2 · `agent_schedule_windows`: "En estas horas".
--   3 · `agent_knowledge_*`: documentos, preguntas frecuentes, instrucciones y la
--       ficha de conocimiento compilada.
--   4 · `agent_calls`: una fila por llamada, sin grabación ni transcripción. El
--       número y el resumen son datos de comensales: los lee quien lee las reservas.
--   5 · `agent_api_keys`: solo el prefijo es visible; la clave completa se ve una vez.
--
-- Se comprueba con `supabase/tests/reservas_cimientos.sql`.

-- ------------------------------------------------------------
-- 1 · Estado del agente
-- ------------------------------------------------------------
create table public.agent_state (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  manual_state text not null default 'on' check (manual_state in ('on', 'off')),
  off_until timestamptz,
  off_mode text check (off_mode in ('one_hour', 'end_of_shift', 'until_on')),
  -- Identidad: puede ser de soporte. Privilegio de columna.
  changed_by_user_id uuid references public.profiles (id),
  changed_by_staff_id uuid references public.reservation_staff (id),
  changed_at timestamptz,
  schedule_mode text not null default 'always' check (schedule_mode in ('always', 'windows')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (establishment_id),
  -- Encendido no lleva modo ni hora de reencendido; apagado, sí modo.
  check ((manual_state = 'off') = (off_mode is not null)),
  check (manual_state = 'off' or off_until is null)
);

comment on table public.agent_state is
  'RN-LLA-01 · una fila por restaurante: si el agente está encendido o apagado a mano y hasta cuándo.';

create table public.agent_state_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  state text not null check (state in ('on', 'off')),
  mode text check (mode in ('one_hour', 'end_of_shift', 'until_on', 'automatic')),
  off_until timestamptz,
  actor_user_id uuid references public.profiles (id),
  actor_staff_id uuid references public.reservation_staff (id),
  created_at timestamptz not null default now()
);

comment on table public.agent_state_events is
  'RN-LLA-01 · cada encendido y apagado del agente, con quién, cuándo y hasta cuándo. Solo se añaden filas.';

create index agent_state_events_establishment_idx
  on public.agent_state_events (establishment_id, created_at desc);

-- ------------------------------------------------------------
-- 2 · Horario
-- ------------------------------------------------------------
create table public.agent_schedule_windows (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  weekdays smallint[] not null check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

comment on table public.agent_schedule_windows is
  'RN-LLA-05 · las franjas en las que el agente atiende cuando `agent_state.schedule_mode` es windows.';

-- ------------------------------------------------------------
-- 3 · Lo que sabe el agente
-- ------------------------------------------------------------
create table public.agent_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  file_id uuid not null references public.files (id),
  title text not null check (btrim(title) <> ''),
  kind text not null check (kind in ('pdf', 'docx', 'image')),
  status text not null default 'reading' check (status in ('reading', 'ready', 'failed')),
  extracted_text text,
  -- El texto corregido es el que usa el agente.
  corrected_text text,
  pages smallint check (pages is null or pages > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agent_knowledge_documents is
  'RN-LLA-07 · documentos del restaurante que el agente lee (carta, alérgenos, menús de grupos). Quitar uno lo archiva; no se borra.';

create index agent_knowledge_documents_establishment_idx
  on public.agent_knowledge_documents (establishment_id) where archived_at is null;

create table public.agent_knowledge_faqs (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  question text not null check (btrim(question) <> ''),
  answer text not null check (btrim(answer) <> ''),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agent_knowledge_faqs is
  'RN-LLA-09 · preguntas frecuentes con su respuesta exacta. Quitar una la archiva.';

create table public.agent_knowledge_settings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  read_website boolean not null default false,
  website_url text,
  website_text text,
  website_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (establishment_id)
);

comment on table public.agent_knowledge_settings is
  'RN-LLA-10 y RN-LLA-08 · instrucciones libres (máximo 2.000 caracteres) y lectura de la web del restaurante.';

create table public.agent_knowledge_snapshots (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- Sube de uno en uno: es el ETag de la API del agente.
  version integer not null check (version >= 1),
  content text not null,
  content_hash text not null,
  delivered_at timestamptz,
  delivery_status text not null default 'not_needed' check (delivery_status in (
    'not_needed', 'pending', 'delivered', 'failed'
  )),
  created_at timestamptz not null default now(),
  unique (establishment_id, version)
);

comment on table public.agent_knowledge_snapshots is
  'RN-LLA-12 · la ficha de conocimiento compilada y versionada. Solo se añaden versiones.';

-- ------------------------------------------------------------
-- 4 · Llamadas
-- ------------------------------------------------------------
create table public.agent_calls (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- El identificador de la llamada en la plataforma del agente: idempotencia.
  external_call_id text not null unique,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  -- Datos de comensales: se anonimizan a los 24 meses (RN-RES-12).
  caller_e164 text,
  outcome text not null check (outcome in (
    'booked', 'group_pending', 'modified', 'cancelled', 'question', 'transferred',
    'forwarded', 'hung_up', 'other'
  )),
  forward_reason text check (forward_reason in (
    'service_paused', 'manual_off', 'outside_hours', 'no_balance'
  )),
  summary text,
  transferred_to_e164 text,
  reservation_id uuid references public.reservations (id),
  -- Coste a precio real, en millonésimas (decisión 94): importe original, moneda,
  -- cambio aplicado e importe en euros.
  cost_original_micros bigint check (cost_original_micros is null or cost_original_micros >= 0),
  cost_currency text,
  fx_rate numeric check (fx_rate is null or fx_rate > 0),
  cost_eur_micros bigint check (cost_eur_micros is null or cost_eur_micros >= 0),
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  -- Una llamada que no se cogió dice por qué; una cogida no.
  check ((outcome = 'forwarded') = (forward_reason is not null))
);

comment on table public.agent_calls is
  'RN-LLA-13 · una fila por llamada, también las que no coge. Sin grabación ni transcripción: solo resumen. El número y el resumen son datos de comensales.';

create index agent_calls_establishment_idx
  on public.agent_calls (establishment_id, started_at desc);

-- La reserva creada en una llamada apunta a su llamada (migración 164).
alter table public.reservations
  add constraint reservations_agent_call_fk
  foreign key (agent_call_id) references public.agent_calls (id);

-- ------------------------------------------------------------
-- 5 · Clave de API del agente
-- ------------------------------------------------------------
create table public.agent_api_keys (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- Lo único visible; la clave completa se enseña una sola vez al crearla.
  prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.agent_api_keys is
  'PRD de agents §8.5 · clave de API del agente por restaurante. Solo el hash en la base; la gestiona Restavor.';

-- ------------------------------------------------------------
-- RLS, privilegios y solo lectura en soporte
-- ------------------------------------------------------------
alter table public.agent_state enable row level security;
alter table public.agent_state_events enable row level security;
alter table public.agent_schedule_windows enable row level security;
alter table public.agent_knowledge_documents enable row level security;
alter table public.agent_knowledge_faqs enable row level security;
alter table public.agent_knowledge_settings enable row level security;
alter table public.agent_knowledge_snapshots enable row level security;
alter table public.agent_calls enable row level security;
alter table public.agent_api_keys enable row level security;

-- Estado, horario y conocimiento: el restaurante (Propietario y Encargado) y el
-- equipo del espacio (PRD §3.2: Restavor ve y cambia la configuración).
create policy agent_state_select on public.agent_state
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));
create policy agent_state_events_select on public.agent_state_events
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));
create policy agent_schedule_windows_select on public.agent_schedule_windows
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));
create policy agent_knowledge_documents_select on public.agent_knowledge_documents
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));
create policy agent_knowledge_faqs_select on public.agent_knowledge_faqs
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));
create policy agent_knowledge_settings_select on public.agent_knowledge_settings
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));
create policy agent_knowledge_snapshots_select on public.agent_knowledge_snapshots
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));

-- Llamadas: número y resumen son datos de comensales (decisión 108).
create policy agent_calls_select on public.agent_calls
  for select to authenticated
  using (public.reservations_can_read(establishment_id));

-- La clave del agente la gestiona solo Restavor: el restaurante no la ve.
create policy agent_api_keys_select on public.agent_api_keys
  for select to authenticated
  using (public.is_space_member(space_id));

revoke all on public.agent_state from anon, authenticated;
revoke all on public.agent_state_events from anon, authenticated;
revoke all on public.agent_schedule_windows from anon, authenticated;
revoke all on public.agent_knowledge_documents from anon, authenticated;
revoke all on public.agent_knowledge_faqs from anon, authenticated;
revoke all on public.agent_knowledge_settings from anon, authenticated;
revoke all on public.agent_knowledge_snapshots from anon, authenticated;
revoke all on public.agent_calls from anon, authenticated;
revoke all on public.agent_api_keys from anon, authenticated;

grant select (id, space_id, establishment_id, manual_state, off_until, off_mode, changed_by_staff_id,
              changed_at, schedule_mode, created_at, updated_at)
  on public.agent_state to authenticated;
grant select (id, space_id, establishment_id, state, mode, off_until, actor_staff_id, created_at)
  on public.agent_state_events to authenticated;
grant select on public.agent_schedule_windows to authenticated;
grant select on public.agent_knowledge_documents to authenticated;
grant select on public.agent_knowledge_faqs to authenticated;
grant select on public.agent_knowledge_settings to authenticated;
grant select on public.agent_knowledge_snapshots to authenticated;
grant select on public.agent_calls to authenticated;
grant select (id, space_id, establishment_id, prefix, last_used_at, revoked_at, created_at)
  on public.agent_api_keys to authenticated;

create trigger agent_state_guard_support_read_only
  before insert or update or delete on public.agent_state
  for each row execute function public.guard_support_read_only();
create trigger agent_state_cuotly_read_only
  before insert or update or delete on public.agent_state
  for each row execute function public.guard_space_read_only();
create trigger agent_state_events_guard_support_read_only
  before insert or update or delete on public.agent_state_events
  for each row execute function public.guard_support_read_only();
create trigger agent_state_events_cuotly_read_only
  before insert or update or delete on public.agent_state_events
  for each row execute function public.guard_space_read_only();
create trigger agent_schedule_windows_guard_support_read_only
  before insert or update or delete on public.agent_schedule_windows
  for each row execute function public.guard_support_read_only();
create trigger agent_schedule_windows_cuotly_read_only
  before insert or update or delete on public.agent_schedule_windows
  for each row execute function public.guard_space_read_only();
create trigger agent_knowledge_documents_guard_support_read_only
  before insert or update or delete on public.agent_knowledge_documents
  for each row execute function public.guard_support_read_only();
create trigger agent_knowledge_documents_cuotly_read_only
  before insert or update or delete on public.agent_knowledge_documents
  for each row execute function public.guard_space_read_only();
create trigger agent_knowledge_faqs_guard_support_read_only
  before insert or update or delete on public.agent_knowledge_faqs
  for each row execute function public.guard_support_read_only();
create trigger agent_knowledge_faqs_cuotly_read_only
  before insert or update or delete on public.agent_knowledge_faqs
  for each row execute function public.guard_space_read_only();
create trigger agent_knowledge_settings_guard_support_read_only
  before insert or update or delete on public.agent_knowledge_settings
  for each row execute function public.guard_support_read_only();
create trigger agent_knowledge_settings_cuotly_read_only
  before insert or update or delete on public.agent_knowledge_settings
  for each row execute function public.guard_space_read_only();
create trigger agent_knowledge_snapshots_guard_support_read_only
  before insert or update or delete on public.agent_knowledge_snapshots
  for each row execute function public.guard_support_read_only();
create trigger agent_knowledge_snapshots_cuotly_read_only
  before insert or update or delete on public.agent_knowledge_snapshots
  for each row execute function public.guard_space_read_only();
create trigger agent_calls_guard_support_read_only
  before insert or update or delete on public.agent_calls
  for each row execute function public.guard_support_read_only();
create trigger agent_calls_cuotly_read_only
  before insert or update or delete on public.agent_calls
  for each row execute function public.guard_space_read_only();
create trigger agent_api_keys_guard_support_read_only
  before insert or update or delete on public.agent_api_keys
  for each row execute function public.guard_support_read_only();
create trigger agent_api_keys_cuotly_read_only
  before insert or update or delete on public.agent_api_keys
  for each row execute function public.guard_space_read_only();
