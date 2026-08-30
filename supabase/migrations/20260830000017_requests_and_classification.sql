-- Hito 4 · Solicitudes y clasificación (PRD §9 RN-REQ, §10 RN-CLS, ROADMAP
-- Hito 4). El cálculo del estado de la solicitud es un enum abierto por
-- reglas (src/core/request-states.ts) y la clasificación por palabras
-- clave es lógica pura (src/core/classification-rules.ts); la llamada a
-- Anthropic vive en src/services/ai-classifier.ts, que nunca se bloquea
-- si la IA falla (RN-CLS-02) — este archivo solo guarda los datos y hace
-- cumplir en el servidor exactamente las mismas transiciones que esos
-- módulos ya prueban con tests unitarios (CLAUDE.md, MUST: "toda
-- operación se valida en el servidor").
--
-- Alcance deliberado de este hito (ROADMAP): del borrador a la aceptación
-- o el rechazo del cliente (PRD §9.1, pasos 1-7). La creación del trabajo
-- (RN-REQ-02), el registro de consumo (RN-CLS-08) y los estados
-- posteriores a `accepted` llegan con el Hito 5 en adelante — no se
-- adelanta nada de eso aquí.
--
-- `conversations`/`messages`: solo lo mínimo para que el cliente pueda
-- leer por qué se le pide información (HU-13) o por qué se rechaza su
-- solicitud (HU-14, RN-REQ-03). El sistema completo de mensajería (los
-- tres tipos de conversación, edición de 10 minutos, notas internas
-- separadas — RN-MSG) llega en el Hito 7; hasta entonces estas dos tablas
-- solo sirven al hilo de una solicitud, sin edición ni notas.
--
-- `request_attachments`: metadatos mínimos para que HU-10 ("crear una
-- solicitud con descripción y archivos") funcione ya, con los límites
-- de RN-ARC-06 (25 MB, tipos permitidos) aplicados como CHECK. No es el
-- catálogo `files`/`file_versions` completo de RN-ARC (categorías,
-- versiones, marca interno/compartido) — ese llega en el Hito 7 y
-- sustituirá a esta tabla scoped a solicitudes.

-- has_capability: añade 'manage_requests' (validar clasificación, pedir
-- información, rechazar — HU-11/13/14). Solo propietario o administrador:
-- RN-CLS-03 dice "Propietario o administrador la valida o corrige", y un
-- trabajador no interviene en este tramo (RN-SLA-04, un trabajador solo
-- recibe aviso cuando ya existe una asignación válida, que no existe
-- todavía en el Hito 4). CREATE OR REPLACE en un archivo nuevo — las
-- migraciones 20260830000007/20260830000016 nunca se tocan.
create or replace function public.has_capability(p_space_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.space_role;
begin
  select sm.role into v_role
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
    -- HU-11/13/14: validar la clasificación, pedir información o rechazar
    -- una solicitud.
    when 'manage_requests' then v_role in ('owner', 'admin')
    else false
  end;
end;
$$;

-- can_read_establishment / can_write_establishment ------------------------
-- El lado cliente de la autorización de solicitudes: quién puede leer o
-- crear/enviar solicitudes de un establecimiento (HU-10, HU-12, HU-15).
-- Mismo patrón SECURITY DEFINER que is_group_member()/is_establishment_member()
-- (migración 20260830000015) para evitar recursión de RLS al usarlas
-- desde las políticas de requests/conversations/messages.
create or replace function public.can_read_establishment(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_space_member((select e.space_id from public.establishments e where e.id = p_establishment_id))
    or public.is_group_member((select e.group_id from public.establishments e where e.id = p_establishment_id))
    or public.is_establishment_member(p_establishment_id);
$$;

comment on function public.can_read_establishment(uuid) is
  'Cualquier rol con acceso al establecimiento puede leerlo, incluido
   Consulta (§4.3: "solo lectura", pero lectura al fin). El equipo de
   mantenimiento del espacio también lee siempre (is_space_member).';

-- RN-EST (§4.3): Propietario local y Editor pueden escribir (crear y
-- enviar solicitudes); Consulta no (§4.3: "no responde mensajes", y por
-- extensión no inicia solicitudes en su nombre). El Propietario global de
-- un grupo (group_memberships) siempre puede, en cualquier establecimiento
-- del grupo.
create or replace function public.can_write_establishment(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id
        and em.user_id = auth.uid()
        and em.role in ('local_owner', 'editor')
    )
    or exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = auth.uid()
    );
$$;

comment on function public.can_write_establishment(uuid) is
  'HU-10/HU-12/HU-15: quién puede crear, enviar, aceptar/rechazar o pegar
   una solicitud. A propósito NO incluye is_space_member(): el equipo de
   mantenimiento no crea solicitudes en nombre del cliente (las HU son
   literalmente "Como restaurante..."), solo las valida.';

-- next_request_code --------------------------------------------------------
-- Genera el código humano de una solicitud (RN-DAT-01: "SOL-0001",
-- correlativo por espacio). No reutiliza next_space_sequence() porque esa
-- función exige is_space_member() (migración 20260830000012) y quien crea
-- una solicitud es el cliente, no un miembro del espacio — así que hace
-- su propia comprobación de acceso (can_write_establishment) antes de
-- mutar el contador, con el mismo patrón atómico ON CONFLICT.
create or replace function public.next_request_code(p_establishment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_value bigint;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;

  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.can_write_establishment(p_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  insert into public.space_sequences (space_id, sequence_name, next_value)
  values (v_space_id, 'request', 2)
  on conflict (space_id, sequence_name)
  do update set next_value = public.space_sequences.next_value + 1
  returning next_value - 1 into v_value;

  return 'SOL-' || lpad(v_value::text, 4, '0');
end;
$$;

-- requests ------------------------------------------------------------
-- PRD §9.2: los catorce estados exactos de src/core/request-states.ts
-- (RN-REQ-01, un único nombre interno). Sin política de INSERT/UPDATE:
-- toda mutación pasa por las funciones SECURITY DEFINER de más abajo, que
-- son las que hacen cumplir la máquina de estados — mismo principio que
-- timer_events ("el componente más delicado", aquí aplicado también al
-- flujo de solicitudes).
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  code text not null,
  state text not null default 'draft' check (state in (
    'draft', 'received', 'analyzing', 'needs_information',
    'pending_internal_validation', 'pending_client_acceptance',
    'accepted', 'in_progress', 'published', 'correction_requested',
    'in_correction', 'closed', 'cancelled_before_start',
    'cancelled_after_start', 'rejected'
  )),
  description text not null check (length(btrim(description)) > 0),
  context text,
  created_by uuid not null references public.profiles (id),
  copied_from_request_id uuid references public.requests (id),
  validated_category text check (validated_category in ('small', 'photo', 'medium', 'large')),
  validated_summary text,
  validated_by uuid references public.profiles (id),
  validated_at timestamptz,
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz,
  rejected_reason text,
  rejected_by uuid references public.profiles (id),
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (space_id, code)
);

comment on table public.requests is
  'Solicitud de cambio de un restaurante (RN-REQ, HU-10 a HU-15). Este
   hito solo implementa hasta "accepted"/"rejected" — el resto del enum
   existe para que RN-REQ-01 tenga un único nombre por estado desde ya,
   aunque nadie los alcance todavía (ver src/core/request-states.ts).';

alter table public.requests enable row level security;

create index requests_space_id_idx on public.requests (space_id);
create index requests_establishment_id_idx on public.requests (establishment_id);
create index requests_state_idx on public.requests (state);

create policy requests_select on public.requests
for select
using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

-- Funciones auxiliares para las políticas de las tablas que cuelgan de una
-- solicitud (mismo motivo que group_space_id()/establishment_space_id() en
-- la migración 20260830000015: evitar que su política haga un subselect
-- en crudo contra `requests`, protegida por RLS, y provoque recursión).
create or replace function public.request_space_id(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select space_id from public.requests where id = p_request_id;
$$;

create or replace function public.request_establishment_id(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select establishment_id from public.requests where id = p_request_id;
$$;

create or replace function public.request_state(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select state from public.requests where id = p_request_id;
$$;

-- request_versions ------------------------------------------------------
-- RN-DAT-07 (versionado). Este hito crea la versión 1 al redactar el
-- borrador (create_request_draft/copy_paste_request); no hay pantalla de
-- edición de un borrador todavía, así que no hay versión 2 hasta que
-- exista esa pantalla — la tabla ya está lista para cuando la haya.
create table public.request_versions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  description text not null,
  context text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (request_id, version_number)
);

comment on table public.request_versions is 'Historial versionado del contenido de una solicitud (RN-DAT-07).';

alter table public.request_versions enable row level security;

create index request_versions_request_id_idx on public.request_versions (request_id);

create policy request_versions_select on public.request_versions
for select
using (
  public.is_space_member(public.request_space_id(request_id))
  or public.can_read_establishment(public.request_establishment_id(request_id))
);

-- request_attachments -----------------------------------------------------
-- Ver la nota de cabecera: alcance mínimo para HU-10, con los límites de
-- RN-ARC-06 ya aplicados. A diferencia de requests/request_versions, esta
-- sí acepta INSERT directo desde el cliente (tras subir el archivo a
-- Storage) porque no participa en ninguna máquina de estados: solo puede
-- añadirse mientras la solicitud sigue en borrador.
create table public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  )),
  -- RN-ARC-06: 25 MB máximo por archivo, sin vídeos ni ejecutables (la
  -- lista de mime_type de arriba ya los excluye).
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.request_attachments is
  'Adjuntos de una solicitud (HU-10, RN-ARC-06). Alcance mínimo scoped a
   solicitudes — el catálogo files/file_versions completo llega en el
   Hito 7 y sustituirá a esta tabla.';

alter table public.request_attachments enable row level security;

create index request_attachments_request_id_idx on public.request_attachments (request_id);

create policy request_attachments_select on public.request_attachments
for select
using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

create policy request_attachments_insert on public.request_attachments
for insert
with check (
  created_by = auth.uid()
  and establishment_id = public.request_establishment_id(request_id)
  and public.can_write_establishment(establishment_id)
  and public.request_state(request_id) = 'draft'
);

-- classifications -----------------------------------------------------
-- Una fila por intento de análisis (RN-CLS-01/02/04): qué propuso el
-- origen (IA o reglas) y, cuando se valida, qué decidió la persona y
-- quién fue. Sin política de SELECT para el cliente a propósito: RN-CLS-03
-- exige que la IA nunca cierre una clasificación por sí sola y que nadie
-- vea la propuesta cruda antes de la validación humana — el cliente solo
-- ve `requests.validated_category`/`validated_summary`, nunca esta tabla.
create table public.classifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  source text not null check (source in ('ai', 'rules')),
  proposed_category text not null check (proposed_category in ('small', 'photo', 'medium', 'large')),
  proposed_summary text not null,
  matched_keywords text[],
  model text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  fallback_reason text,
  decided_category text check (decided_category in ('small', 'photo', 'medium', 'large')),
  decided_summary text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.classifications is
  'Un intento de clasificación por solicitud (RN-CLS-01/02/04). Solo el
   equipo del espacio la lee — nunca el cliente (RN-CLS-03).';

alter table public.classifications enable row level security;

create index classifications_request_id_idx on public.classifications (request_id);

create policy classifications_select on public.classifications
for select
using (public.is_space_member(space_id));

-- ai_usage --------------------------------------------------------------
-- RN-CLS-05: un apunte por llamada real a la IA (nunca por una caída a
-- reglas, que no tiene consumo que medir). Solo propietario/administrador
-- lo leen (has_capability 'manage_requests') — es el dato que se
-- facturará aparte al propietario del espacio (§5.3).
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  classification_id uuid not null references public.classifications (id) on delete cascade,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  estimated_cost_cents integer not null check (estimated_cost_cents >= 0),
  created_at timestamptz not null default now()
);

comment on table public.ai_usage is 'Medición del consumo de IA por espacio (RN-CLS-05, §5.3).';

alter table public.ai_usage enable row level security;

create index ai_usage_space_id_idx on public.ai_usage (space_id);

create policy ai_usage_select on public.ai_usage
for select
using (public.has_capability(space_id, 'manage_requests'));

-- conversations / messages ---------------------------------------------
-- Ver la nota de cabecera: solo el hilo de una solicitud, sin edición ni
-- notas internas (eso llega con el RN-MSG completo del Hito 7). RN-MSG-02
-- ("el cliente siempre ve 'Equipo de mantenimiento'") no se aplica en la
-- base de datos — la interfaz nunca muestra `sender_id` al cliente,
-- solo `sender_role`; `sender_id` existe para la auditoría interna,
-- visible solo al equipo (mismo principio que CLAUDE.md MUST NOT sobre no
-- mostrar identidades individuales al cliente).
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  type text not null check (type in ('request')),
  request_id uuid references public.requests (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_request_id_required check (type <> 'request' or request_id is not null),
  unique (request_id)
);

comment on table public.conversations is
  'Solo el tipo "request" existe en este hito. "job_internal" y
   "establishment" llegan con el RN-MSG completo (Hito 6/7), ampliando
   este CHECK con una migración nueva, nunca editando esta.';

alter table public.conversations enable row level security;

create policy conversations_select on public.conversations
for select
using (
  public.is_space_member(space_id)
  or (request_id is not null and public.can_read_establishment(public.request_establishment_id(request_id)))
);

-- Sin política de INSERT: las conversaciones de solicitud las crea
-- get_or_create_request_conversation() (SECURITY DEFINER, más abajo), no
-- un INSERT directo del cliente.

create or replace function public.conversation_establishment_id(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.request_establishment_id(c.request_id)
  from public.conversations c
  where c.id = p_conversation_id;
$$;

create or replace function public.conversation_space_id(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select space_id from public.conversations where id = p_conversation_id;
$$;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  -- RN-MSG-02: el cliente nunca ve quién del equipo escribió — la
  -- interfaz debe mostrar "Equipo de mantenimiento" para sender_role='staff'
  -- y nunca resolver sender_id a un nombre cuando quien lee es el cliente.
  sender_role text not null check (sender_role in ('staff', 'client')),
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.messages is
  'Mensajes del hilo de una solicitud (HU-13, HU-14, RN-REQ-03). Sin
   edición ni borrado todavía — eso es RN-MSG-07/08, Hito 7.';

alter table public.messages enable row level security;

create index messages_conversation_id_idx on public.messages (conversation_id);

create policy messages_select on public.messages
for select
using (
  public.is_space_member(space_id)
  or public.can_read_establishment(public.conversation_establishment_id(conversation_id))
);

create policy messages_insert on public.messages
for insert
with check (
  sender_id = auth.uid()
  and (
    -- RN-MSG-05 en miniatura: el equipo escribe con la misma capacidad
    -- que valida/rechaza (manage_requests) — un Trabajador no participa
    -- en este hilo todavía (RN-SLA-04).
    (sender_role = 'staff' and public.has_capability(space_id, 'manage_requests'))
    -- El cliente escribe si puede escribir en el establecimiento de la
    -- solicitud; Consulta queda fuera porque can_write_establishment()
    -- no lo incluye (RN-MSG-05: "Consulta... no responde mensajes").
    or (sender_role = 'client' and public.can_write_establishment(public.conversation_establishment_id(conversation_id)))
  )
);

create or replace function public.get_or_create_request_conversation(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_space_id uuid;
begin
  select id into v_conversation_id from public.conversations where request_id = p_request_id;
  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  select space_id into v_space_id from public.requests where id = p_request_id;

  insert into public.conversations (space_id, type, request_id)
  values (v_space_id, 'request', p_request_id)
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

comment on function public.get_or_create_request_conversation(uuid) is
  'SECURITY DEFINER a propósito: crea la conversación de una solicitud la
   primera vez que hace falta (al pedir información o al rechazar), sin
   política de INSERT directa en conversations. No comprueba permisos por
   su cuenta porque solo la llaman otras funciones SECURITY DEFINER de
   este archivo que ya comprobaron los suyos antes de invocarla.';

-- ============================================================
-- Máquina de estados (src/core/request-states.ts, RN-REQ, RN-SLA-01 a 03).
-- Cada función de aquí abajo hace cumplir en el servidor exactamente la
-- misma transición (origen, destino, actor) que su contrapartida en
-- REQUEST_TRANSITIONS, y el mismo efecto sobre T1 (start/pause/resume/stop).
-- ============================================================

-- create_request_draft — HU-10 (parte 1: redactar el borrador).
create or replace function public.create_request_draft(
  p_establishment_id uuid,
  p_description text,
  p_context text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_request_id uuid;
  v_code text;
begin
  if not public.can_write_establishment(p_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'La descripción de la solicitud no puede estar vacía';
  end if;

  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  v_code := public.next_request_code(p_establishment_id);

  insert into public.requests (space_id, establishment_id, code, state, description, context, created_by)
  values (v_space_id, p_establishment_id, v_code, 'draft', p_description, p_context, auth.uid())
  returning id into v_request_id;

  insert into public.request_versions (request_id, version_number, description, context, created_by)
  values (v_request_id, 1, p_description, p_context, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'request.draft_created', 'request', v_request_id, jsonb_build_object('code', v_code));

  return v_request_id;
end;
$$;

-- submit_request — HU-10 (parte 2: enviar). draft -> received, arranca T1
-- (RN-SLA-01). Idempotente: si ya no está en borrador, no hace nada
-- (RN-DAT-09) — pulsarlo dos veces no duplica el envío ni el evento de T1.
create or replace function public.submit_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state <> 'draft' then
    return; -- idempotente: ya se envió.
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  update public.requests set state = 'received' where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'started', now(), auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'request.submitted', 'request', p_request_id, jsonb_build_object('state', 'draft'), jsonb_build_object('state', 'received'));
end;
$$;

-- begin_request_analysis — RN-CLS-01, paso automático nada más enviarse.
-- received -> analyzing, sin efecto sobre T1 (sigue corriendo). Lo llama
-- el servidor justo antes de invocar al clasificador (src/services/ai-classifier.ts),
-- con la misma sesión que envió la solicitud.
create or replace function public.begin_request_analysis(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
  v_state text;
begin
  select establishment_id, state into v_establishment_id, v_state
  from public.requests where id = p_request_id
  for update;

  if v_establishment_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state <> 'received' then
    return; -- idempotente.
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  update public.requests set state = 'analyzing' where id = p_request_id;
end;
$$;

-- record_classification — RN-CLS-01/02/04/05. analyzing -> pending_internal_validation.
-- Guarda la propuesta (de IA o de reglas) en `classifications`, y si
-- viene de la IA, también el consumo en `ai_usage` (RN-CLS-05). No toca T1.
create or replace function public.record_classification(
  p_request_id uuid,
  p_source text,
  p_category text,
  p_summary text,
  p_matched_keywords text[] default null,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_estimated_cost_cents integer default null,
  p_fallback_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_classification_id uuid;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state = 'pending_internal_validation' then
    -- Idempotente: ya se registró un análisis para esta solicitud, se
    -- devuelve el último en vez de duplicarlo.
    select id into v_classification_id from public.classifications
    where request_id = p_request_id order by created_at desc limit 1;
    return v_classification_id;
  end if;

  if v_state <> 'analyzing' then
    raise exception 'La solicitud no está en análisis';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  insert into public.classifications
    (request_id, space_id, source, proposed_category, proposed_summary, matched_keywords, model, input_tokens, output_tokens, fallback_reason)
  values
    (p_request_id, v_space_id, p_source, p_category, p_summary, p_matched_keywords, p_model, p_input_tokens, p_output_tokens, p_fallback_reason)
  returning id into v_classification_id;

  if p_source = 'ai' then
    insert into public.ai_usage (space_id, request_id, classification_id, model, input_tokens, output_tokens, estimated_cost_cents)
    values (v_space_id, p_request_id, v_classification_id, p_model, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), coalesce(p_estimated_cost_cents, 0));
  end if;

  update public.requests set state = 'pending_internal_validation' where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'request.classified', 'request', p_request_id, jsonb_build_object('source', p_source, 'category', p_category));

  return v_classification_id;
end;
$$;

-- validate_classification — HU-11. pending_internal_validation -> pending_client_acceptance.
-- Solo propietario o administrador (RN-CLS-03). T1 se detiene (RN-SLA-03).
create or replace function public.validate_classification(
  p_request_id uuid,
  p_category text,
  p_summary text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_classification_id uuid;
begin
  select space_id, state into v_space_id, v_state from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_requests') then
    raise exception 'No tienes permiso para validar esta solicitud';
  end if;

  if v_state <> 'pending_internal_validation' then
    raise exception 'La solicitud no está pendiente de validación interna';
  end if;

  select id into v_classification_id from public.classifications
  where request_id = p_request_id order by created_at desc limit 1;

  update public.classifications
  set decided_category = p_category, decided_summary = p_summary, decided_by = auth.uid(), decided_at = now()
  where id = v_classification_id;

  update public.requests
  set state = 'pending_client_acceptance',
      validated_category = p_category,
      validated_summary = p_summary,
      validated_by = auth.uid(),
      validated_at = now()
  where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'stopped', now(), auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'request.classification_validated', 'request', p_request_id, jsonb_build_object('category', p_category));
end;
$$;

-- request_more_information — HU-13. pending_internal_validation -> needs_information.
-- Solo propietario o administrador. T1 se pausa (RN-SLA-03).
create or replace function public.request_more_information(p_request_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_conversation_id uuid;
begin
  select space_id, state into v_space_id, v_state from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_requests') then
    raise exception 'No tienes permiso para pedir información en esta solicitud';
  end if;

  if v_state <> 'pending_internal_validation' then
    raise exception 'La solicitud no está pendiente de validación interna';
  end if;

  if btrim(coalesce(p_message, '')) = '' then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  update public.requests set state = 'needs_information' where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'paused', now(), auth.uid());

  v_conversation_id := public.get_or_create_request_conversation(p_request_id);
  insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
  values (v_conversation_id, v_space_id, auth.uid(), 'staff', p_message);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, reason)
  values (v_space_id, auth.uid(), 'request.information_requested', 'request', p_request_id, p_message);
end;
$$;

-- provide_additional_information — HU-13 (respuesta del cliente).
-- needs_information -> pending_internal_validation. T1 se reanuda.
create or replace function public.provide_additional_information(p_request_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_conversation_id uuid;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state <> 'needs_information' then
    raise exception 'La solicitud no está esperando información adicional';
  end if;

  if btrim(coalesce(p_message, '')) = '' then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  update public.requests set state = 'pending_internal_validation' where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'resumed', now(), auth.uid());

  v_conversation_id := public.get_or_create_request_conversation(p_request_id);
  insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
  values (v_conversation_id, v_space_id, auth.uid(), 'client', p_message);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id)
  values (v_space_id, auth.uid(), 'request.information_provided', 'request', p_request_id);
end;
$$;

-- reject_request — HU-14 / RN-REQ-03. pending_internal_validation -> rejected.
-- Solo propietario o administrador. Motivo obligatorio (RN-REQ-03: "se
-- explica el motivo al cliente"), no consume cambios (no se toca ninguna
-- tabla de consumo — no existe todavía, Hito 5). T1 se detiene.
create or replace function public.reject_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_conversation_id uuid;
begin
  select space_id, state into v_space_id, v_state from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_requests') then
    raise exception 'No tienes permiso para rechazar esta solicitud';
  end if;

  if v_state <> 'pending_internal_validation' then
    raise exception 'La solicitud no está pendiente de validación interna';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'El motivo del rechazo es obligatorio';
  end if;

  update public.requests
  set state = 'rejected', rejected_reason = p_reason, rejected_by = auth.uid(), rejected_at = now()
  where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'stopped', now(), auth.uid());

  v_conversation_id := public.get_or_create_request_conversation(p_request_id);
  insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
  values (v_conversation_id, v_space_id, auth.uid(), 'staff', p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, reason)
  values (v_space_id, auth.uid(), 'request.rejected', 'request', p_request_id, p_reason);
end;
$$;

-- accept_request — HU-12. pending_client_acceptance -> accepted.
-- Idempotente (CLAUDE.md MUST: operaciones críticas con idempotencia).
-- No crea trabajo (RN-REQ-02) ni registra consumo (RN-CLS-08): eso es
-- del Hito 5, deliberadamente fuera de este.
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
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state = 'accepted' then
    return; -- idempotente.
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state <> 'pending_client_acceptance' then
    raise exception 'La solicitud no está pendiente de aceptación';
  end if;

  update public.requests set state = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id)
  values (v_space_id, auth.uid(), 'request.accepted', 'request', p_request_id);
end;
$$;

-- decline_request — HU-12 (el cliente rechaza la propuesta final).
-- pending_client_acceptance -> rejected. Idempotente.
create or replace function public.decline_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_conversation_id uuid;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state = 'rejected' then
    return; -- idempotente.
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state <> 'pending_client_acceptance' then
    raise exception 'La solicitud no está pendiente de aceptación';
  end if;

  update public.requests
  set state = 'rejected',
      rejected_reason = coalesce(p_reason, 'Rechazada por el restaurante'),
      rejected_by = auth.uid(),
      rejected_at = now()
  where id = p_request_id;

  if p_reason is not null and btrim(p_reason) <> '' then
    v_conversation_id := public.get_or_create_request_conversation(p_request_id);
    insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
    values (v_conversation_id, v_space_id, auth.uid(), 'client', p_reason);
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, reason)
  values (v_space_id, auth.uid(), 'request.declined_by_client', 'request', p_request_id, p_reason);
end;
$$;

-- copy_paste_request — HU-15 / RN-REQ-04. Crea un borrador nuevo en otro
-- establecimiento del mismo grupo, copiando descripción, contexto y
-- adjuntos. No envía nada ni reanaliza todavía: eso ocurre cuando el
-- cliente envíe el nuevo borrador, igual que cualquier otra solicitud
-- (RN-REQ-04: "al pegar se crea un borrador... se vuelve a analizar el
-- contenido" — el reanálisis ya pasa, sin duplicar código, en
-- submit_request/begin_request_analysis del nuevo borrador).
create or replace function public.copy_paste_request(p_source_request_id uuid, p_target_establishment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_establishment_id uuid;
  v_source_group_id uuid;
  v_target_group_id uuid;
  v_target_space_id uuid;
  v_description text;
  v_context text;
  v_new_request_id uuid;
  v_code text;
begin
  select establishment_id, description, context into v_source_establishment_id, v_description, v_context
  from public.requests where id = p_source_request_id;

  if v_source_establishment_id is null then
    raise exception 'Solicitud de origen no encontrada';
  end if;

  if not public.can_read_establishment(v_source_establishment_id) then
    raise exception 'No tienes acceso a la solicitud de origen';
  end if;

  if not public.can_write_establishment(p_target_establishment_id) then
    raise exception 'No tienes acceso de escritura al establecimiento de destino';
  end if;

  select group_id into v_source_group_id from public.establishments where id = v_source_establishment_id;
  select group_id, space_id into v_target_group_id, v_target_space_id from public.establishments where id = p_target_establishment_id;

  -- RN-REQ-04: "Copiar solicitud" y "Pegar solicitud" funcionan solo
  -- dentro del mismo grupo.
  if v_source_group_id is null or v_source_group_id <> v_target_group_id then
    raise exception 'Solo se puede copiar una solicitud dentro del mismo grupo';
  end if;

  v_code := public.next_request_code(p_target_establishment_id);

  insert into public.requests
    (space_id, establishment_id, code, state, description, context, created_by, copied_from_request_id)
  values
    (v_target_space_id, p_target_establishment_id, v_code, 'draft', v_description, v_context, auth.uid(), p_source_request_id)
  returning id into v_new_request_id;

  insert into public.request_versions (request_id, version_number, description, context, created_by)
  values (v_new_request_id, 1, v_description, v_context, auth.uid());

  -- Los adjuntos copiados se muestran para revisión, sin enviarse
  -- automáticamente (RN-REQ-04): el nuevo borrador nace en 'draft' igual
  -- que cualquier otro, así que ya cumple esa condición sin código extra.
  insert into public.request_attachments (request_id, space_id, establishment_id, storage_path, file_name, mime_type, size_bytes, created_by)
  select v_new_request_id, v_target_space_id, p_target_establishment_id, storage_path, file_name, mime_type, size_bytes, auth.uid()
  from public.request_attachments
  where request_id = p_source_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_target_space_id, auth.uid(), 'request.copied', 'request', v_new_request_id,
    jsonb_build_object('source_request_id', p_source_request_id),
    jsonb_build_object('code', v_code, 'establishment_id', p_target_establishment_id)
  );

  return v_new_request_id;
end;
$$;
