-- ============================================================================
-- Migración 97 · Cómo se entra en Cuotly (PRD §37, RN-ACC-01 a RN-ACC-12)
-- Paso 2 del orden acordado (decisión 37) · decisión 41 del 16/09/2026
-- ============================================================================
--
-- Hasta hoy Cuotly tenía **tres** formas de entrar: registrarse en abierto
-- con correo y contraseña, entrar con Google, y aceptar una invitación
-- después de haberse registrado por una de las dos anteriores. Bosco las
-- redujo a dos, y ninguna de ellas es "me registro yo solo":
--
--   1. **Una solicitud de acceso que Cuotly aprueba.** El formulario de
--      solicitud ocupa el lugar del registro: quien va a registrarse
--      encuentra esto, y la cuenta se crea al aprobarla, no antes.
--   2. **Una invitación de un propietario**, que ya es la autorización de
--      alguien que responde por el invitado. Ese enlace crea la cuenta.
--
-- Lo que trae esta migración, en orden:
--
--   · La tabla de transiciones de una solicitud de acceso (RN-ACC-05),
--     duplicada a propósito con `src/core/access-requests.ts` y vigilada
--     por `listas-compartidas.test.ts`, como las cinco que ya lo están.
--   · Cuatro tablas: `access_requests`, su libro de estados,
--     `account_setup_tokens` (el enlace de un solo uso de RN-ACC-04) y
--     `platform_emails`, la cola de correo para gente **sin cuenta**.
--   · Las funciones del formulario público, las de la revisión, las dos
--     que materializan la cuenta y las tres de la cola de correo.
--
-- ---------------------------------------------------------------------------
-- Tres decisiones de diseño que conviene leer antes que el SQL
-- ---------------------------------------------------------------------------
--
-- **1 · Dónde se cierra el registro abierto.** No aquí dentro. Quien crea
-- de verdad una fila en `auth.users` es GoTrue, y a GoTrue no se le pone
-- un disparador: se le quita el alta pública (`enable_signup = false` en
-- `supabase/config.toml`, en `[auth]` y en `[auth.email]`, y ningún
-- proveedor externo activado). A partir de ahí la **única** vía que queda
-- es la API de administración con la clave de `service_role`, que solo
-- tiene el servidor de Cuotly, y el servidor solo la usa detrás de una de
-- las dos funciones de abajo —`consume_account_setup_token()` y
-- `accept_space_invitation_as()`—, las dos reservadas a `service_role` y
-- las dos en falso-cerrado: sin token vivo no devuelven nada y la cuenta
-- no llega a crearse. Eso es RN-ACC-01, y no es esconder un botón: es que
-- no hay ninguna puerta detrás del botón.
--
-- **2 · La cuenta se materializa cuando la persona pone la contraseña.**
-- RN-ACC-03 dice que aprobar crea la cuenta y RN-ACC-04 que la contraseña
-- no viaja por correo. Las dos a la vez solo caben así: aprobar crea el
-- **derecho** a la cuenta —un token de un solo uso, con caducidad y con el
-- correo dentro, que nadie puede fabricar— y la fila de `auth.users` nace
-- al gastarlo. Para quien lo vive es un solo paso: recibe el enlace, pone
-- su contraseña y está dentro. Y no existe ningún momento en el que haya
-- una cuenta a la que otro pueda entrar porque la contraseña esté escrita
-- en un buzón.
--
-- **3 · El formulario público escribe y no lee** (RN-ACC-12). Es el único
-- sitio del producto donde actúa alguien sin sesión, así que contesta
-- siempre lo mismo: ni dice si un correo ya tiene cuenta, ni si ya hay una
-- solicitud abierta, ni devuelve identificador ninguno. Lo que cambia
-- según el caso es **el correo que sale**, no lo que ve la pantalla.

-- ============================================================
-- 1 · Las transiciones de una solicitud de acceso (RN-ACC-05)
-- ============================================================
--
-- Cuatro estados, no seis: aquí no hay borrador. La solicitud de creación
-- de espacio (RN-PLA-01) la escribe alguien que ya ha entrado y puede
-- dejarla a medias; esta la escribe alguien sin cuenta desde un formulario
-- público, y un borrador sin dueño no tiene dónde guardarse ni a quién
-- pertenecer. Tampoco hay `in_review`: son cinco campos, y pasar por "en
-- revisión" antes de decidir sería un trámite inventado.
create or replace function public.access_request_transition_allowed(
  p_from text, p_to text, p_actor text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = 'submitted' and p_to in ('needs_information', 'approved', 'rejected')
      then p_actor in ('platform')
    -- Quien solicita contesta a lo que se le ha pedido y vuelve a la cola.
    -- Lo hace por el enlace con clave, sin cuenta (RN-ACC-12).
    when p_from = 'needs_information' and p_to = 'submitted' then p_actor in ('applicant')
    else false
  end;
$$;

comment on function public.access_request_transition_allowed(text, text, text) is
  'RN-ACC-05 · quién mueve cada transición de una solicitud de acceso.
   Duplicada con `src/core/access-requests.ts` a propósito; los vigila
   `listas-compartidas.test.ts`. "Aprobada" y "No aprobada" no salen: son
   finales, y de un rechazo no se sale reabriéndolo sino enviando otra.';

revoke all on function public.access_request_transition_allowed(text, text, text) from public, anon;
grant execute on function public.access_request_transition_allowed(text, text, text) to authenticated;

-- ============================================================
-- 2 · Las tablas
-- ============================================================

-- La solicitud. Tercera tabla del proyecto sin `space_id` **y** la primera
-- sin `requester_id`: quien la escribe todavía no es nadie en Cuotly.
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),

  -- RN-ACC-02 · los cinco campos de F01. Los cuatro primeros obligatorios.
  contact_name text not null check (length(btrim(contact_name)) > 0),
  business_name text not null check (length(btrim(business_name)) > 0),
  phone text not null check (length(btrim(phone)) > 0),
  email text not null check (position('@' in email) > 1),
  comments text,

  status text not null default 'submitted' check (status in (
    'submitted', 'needs_information', 'approved', 'rejected'
  )),
  -- RN-ACC-05 · el mensaje del equipo al pedir información, o el motivo
  -- del rechazo. Es la frase de una persona, no un código.
  status_reason text,
  -- Lo que contesta quien solicita cuando se le pide información. Se
  -- guarda la última: no es una conversación, es un campo del formulario.
  applicant_reply text,

  -- RN-ACC-12 · la clave del enlace de seguimiento. Es el único asidero de
  -- alguien sin cuenta, así que no se enseña a nadie más: no está en el
  -- `grant select` de columnas de abajo.
  follow_up_token uuid not null default gen_random_uuid(),

  decided_at timestamptz,
  -- RN-ACC-07 · quién decidió. Columna revocada: el solicitante ve el
  -- estado y el motivo, nunca el nombre. Sale de `audit_log`.
  decided_by uuid references public.profiles (id),
  -- La cuenta que salió de aquí, cuando se gastó el enlace. Nula mientras
  -- la persona no haya puesto su contraseña.
  account_id uuid references public.profiles (id),
  -- RN-ACC-08 · aprobar dos veces no crea dos cuentas ni manda dos enlaces.
  idempotency_key text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un estado final tiene fecha y quién, y uno que no lo es, no.
  constraint access_requests_decision check (
    (status in ('approved', 'rejected')) = (decided_at is not null)
  ),
  -- Una cuenta apuntada aquí solo puede venir de una aprobación. Al revés
  -- no: una aprobada puede estar esperando a que gasten el enlace.
  constraint access_requests_account check (
    account_id is null or status = 'approved'
  )
);

comment on table public.access_requests is
  '§37, RN-ACC-02 · la solicitud de acceso a Cuotly, que ocupa el lugar del
   registro (decisión 41). No lleva `space_id` —aprobarla no crea espacio
   ni panel (RN-ACC-03)— ni `requester_id`: quien la escribe todavía no
   tiene cuenta. La clasifica como tal el barrido de invariantes de RLS.';

create unique index access_requests_follow_up_idx on public.access_requests (follow_up_token);
create unique index access_requests_idempotency_idx
  on public.access_requests (idempotency_key) where idempotency_key is not null;
create index access_requests_status_idx on public.access_requests (status, created_at desc);
create index access_requests_email_idx on public.access_requests (lower(email));

-- Una solicitud abierta por correo, y no veinte. No es un adorno: es lo
-- que impide que el formulario público se use para llenar la bandeja de
-- quien revisa. El insert no choca contra este índice —la función de
-- abajo mira antes y calla (RN-ACC-12)—, pero si alguna vez se llama de
-- otra manera, falla cerrado.
create unique index access_requests_one_open_idx
  on public.access_requests (lower(email))
  where status in ('submitted', 'needs_information');

alter table public.access_requests enable row level security;

-- Solo la plataforma la lee, y solo con la sesión verificada en dos pasos
-- (RN-ACC-06: `is_platform_approver()` cuelga de `is_platform_owner()`,
-- que exige `aal2`). Quien la escribió **no** la lee por aquí: no tiene
-- sesión, y hace su seguimiento por el enlace con clave (RN-ACC-12).
create policy access_requests_select on public.access_requests
for select
using (public.is_platform_approver());

-- Sin políticas de insert, update ni delete: se escribe solo por las
-- funciones de abajo, que comprueban la transición y dejan auditoría
-- (CLAUDE.md, RN-DAT-08). Una no aprobada no se borra nunca.

-- RN-ACC-07 · `decided_by` fuera, como en `space_requests`. Y fuera
-- también `follow_up_token` e `idempotency_key`, que son secretos de
-- operación y no datos de la solicitud. Consecuencia práctica, la de
-- siempre: `select *` sobre esta tabla devuelve 403.
revoke select on public.access_requests from anon, authenticated;
grant select (id, contact_name, business_name, phone, email, comments,
              status, status_reason, applicant_reply, decided_at, account_id,
              created_at, updated_at)
  on public.access_requests to authenticated;

-- El recorrido, como libro inmutable (CLAUDE.md). No cabe en
-- `state_events` ni en `space_request_events`: la primera exige `space_id`
-- y la segunda apunta a otra tabla.
create table public.access_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.access_requests (id) on delete cascade,
  from_status text,
  to_status text not null,
  -- Nulo cuando lo mueve quien solicita: no hay cuenta a la que apuntar.
  actor_id uuid references public.profiles (id),
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.access_request_events is
  'RN-ACC-08 · el recorrido de una solicitud de acceso, como libro
   inmutable. Sin `space_id` por la misma razón que la tabla de la que
   cuelga.';

create index access_request_events_request_idx
  on public.access_request_events (request_id, created_at);

alter table public.access_request_events enable row level security;

create policy access_request_events_select on public.access_request_events
for select
using (public.is_platform_approver());

revoke select on public.access_request_events from anon, authenticated;
grant select (id, request_id, from_status, to_status, reason, created_at)
  on public.access_request_events to authenticated;

-- RN-ACC-04 · el enlace de un solo uso. Es una credencial, así que esta
-- tabla no la lee nadie por PostgREST: ni política, ni privilegio. Se
-- cierra por privilegio como `space_sequences` (migración 34), y el
-- barrido de invariantes lo comprueba.
create table public.account_setup_tokens (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  access_request_id uuid not null references public.access_requests (id) on delete cascade,
  -- El correo se copia aquí a propósito: es el que va a tener la cuenta, y
  -- congelarlo evita que un cambio posterior en la solicitud mande el alta
  -- a otra dirección.
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),

  constraint account_setup_tokens_used check ((used_at is null) = (used_by is null))
);

comment on table public.account_setup_tokens is
  'RN-ACC-04 · el enlace de un solo uso y con caducidad donde quien fue
   aprobado pone su contraseña. Es una credencial: sin política y sin
   privilegio para `anon` ni `authenticated`, como `space_sequences`.';

create index account_setup_tokens_request_idx
  on public.account_setup_tokens (access_request_id);

alter table public.account_setup_tokens enable row level security;
revoke all on public.account_setup_tokens from anon, authenticated;

-- La cola de correo para gente **sin cuenta**. `notification_deliveries`
-- (RN-NOT-05) no sirve: exige `space_id` y una fila de `notifications`, y
-- aquí no hay ni espacio ni destinatario registrado. Lo que sí se copia de
-- ella es la forma —estado, intentos, próximo intento, último error,
-- identificador del proveedor— para que la vacíe el mismo proceso con la
-- misma disciplina de reintentos.
create table public.platform_emails (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'access_request_received',
    'access_request_needs_information',
    'access_request_approved',
    'access_request_rejected',
    'access_request_already_registered'
  )),
  to_email text not null check (position('@' in to_email) > 1),
  -- Lo que el texto necesita: el nombre, el motivo, el enlace. No lleva
  -- nada que no vaya a salir en el correo.
  payload jsonb not null default '{}'::jsonb,
  -- RN-NOT-05 · idempotencia. Aprobar dos veces no manda dos enlaces.
  dedupe_key text unique,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'dead')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now()
);

comment on table public.platform_emails is
  'RN-ACC-04 · la cola de correo de Cuotly hacia direcciones que todavía no
   son de nadie. Lleva el enlace de alta dentro del `payload`, así que es
   tan credencial como `account_setup_tokens`: sin política y sin
   privilegio para `anon` ni `authenticated`.';

create index platform_emails_pending_idx
  on public.platform_emails (next_attempt_at) where status = 'pending';

alter table public.platform_emails enable row level security;
revoke all on public.platform_emails from anon, authenticated;

-- ============================================================
-- 3 · Encolar un correo (interna)
-- ============================================================
create or replace function public.queue_platform_email(
  p_kind text,
  p_to_email text,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.platform_emails (kind, to_email, payload, dedupe_key)
  values (p_kind, lower(btrim(p_to_email)), coalesce(p_payload, '{}'::jsonb), p_dedupe_key)
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.queue_platform_email(text, text, jsonb, text) is
  'RN-ACC-04 · encola un correo hacia alguien sin cuenta. Interna: la
   llaman las funciones de este archivo y nadie más.';

revoke all on function public.queue_platform_email(text, text, jsonb, text)
  from public, anon, authenticated;

-- ============================================================
-- 4 · El formulario público (RN-ACC-02, RN-ACC-12)
-- ============================================================
--
-- Devuelve `void` a propósito. Si devolviera el identificador o el token,
-- el formulario público sería un oráculo: escribiendo correos ajenos se
-- averiguaría quién está en Cuotly y, peor, se conseguiría el asidero de
-- seguimiento de una solicitud que no es tuya. Lo que sale por la pantalla
-- es siempre lo mismo; lo que cambia es el correo que se encola.
create or replace function public.submit_access_request(
  p_contact_name text,
  p_business_name text,
  p_phone text,
  p_email text,
  p_comments text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
  v_token uuid;
begin
  if coalesce(btrim(p_contact_name), '') = ''
     or coalesce(btrim(p_business_name), '') = ''
     or coalesce(btrim(p_phone), '') = ''
     or position('@' in v_email) < 2 then
    raise exception 'Faltan el nombre, el negocio, el teléfono o el correo';
  end if;

  -- Ya tiene cuenta: no se abre una solicitud que nadie podría aprobar
  -- —una persona, una cuenta, un correo— y quien se entera es la
  -- dirección, no la pantalla.
  if exists (select 1 from public.profiles p where lower(p.email) = v_email) then
    perform public.queue_platform_email(
      'access_request_already_registered', v_email,
      jsonb_build_object('contact_name', btrim(p_contact_name)),
      'already:' || v_email || ':' || to_char(now(), 'YYYY-MM-DD')
    );
    return;
  end if;

  -- Ya tiene una abierta: tampoco se abre otra, y se le recuerda por dónde
  -- va la suya. La clave del enlace NO se regenera: si se regenerara,
  -- cualquiera podría invalidar el seguimiento de otro reenviando el
  -- formulario con su correo.
  select id, follow_up_token into v_id, v_token
  from public.access_requests
  where lower(email) = v_email and status in ('submitted', 'needs_information')
  limit 1;

  if v_id is not null then
    perform public.queue_platform_email(
      'access_request_received', v_email,
      jsonb_build_object('contact_name', btrim(p_contact_name), 'follow_up_token', v_token),
      'received:' || v_id::text
    );
    return;
  end if;

  insert into public.access_requests (contact_name, business_name, phone, email, comments)
  values (btrim(p_contact_name), btrim(p_business_name), btrim(p_phone), v_email,
          nullif(btrim(coalesce(p_comments, '')), ''))
  returning id, follow_up_token into v_id, v_token;

  insert into public.access_request_events (request_id, from_status, to_status)
  values (v_id, null, 'submitted');

  -- RN-ACC-08 · con `space_id` nulo y `actor_id` nulo: no hay espacio, y
  -- quien la escribió no es nadie en Cuotly todavía.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (null, null, 'access_request.submitted', 'access_request', v_id,
          jsonb_build_object('status', 'submitted'));

  perform public.queue_platform_email(
    'access_request_received', v_email,
    jsonb_build_object('contact_name', btrim(p_contact_name), 'follow_up_token', v_token),
    'received:' || v_id::text
  );
end;
$$;

comment on function public.submit_access_request(text, text, text, text, text) is
  'RN-ACC-02 · el formulario público. Devuelve `void` para no ser un
   oráculo de correos (RN-ACC-12): conteste lo que conteste la base, la
   pantalla dice siempre lo mismo.';

revoke all on function public.submit_access_request(text, text, text, text, text) from public;
grant execute on function public.submit_access_request(text, text, text, text, text)
  to anon, authenticated;

-- El seguimiento por el enlace con clave. No devuelve `decided_by` jamás
-- (RN-ACC-07) ni el identificador de la solicitud: con la clave basta.
create or replace function public.access_request_follow_up(p_token uuid)
returns table (
  status text,
  status_reason text,
  applicant_reply text,
  contact_name text,
  business_name text,
  created_at timestamptz,
  decided_at timestamptz,
  can_reply boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.status, r.status_reason, r.applicant_reply, r.contact_name,
         r.business_name, r.created_at, r.decided_at,
         r.status = 'needs_information'
  from public.access_requests r
  where r.follow_up_token = p_token;
$$;

comment on function public.access_request_follow_up(uuid) is
  'RN-ACC-12 · el seguimiento de quien no tiene cuenta, por la clave que
   recibió en el correo. Nunca devuelve quién la revisó (RN-ACC-07).';

revoke all on function public.access_request_follow_up(uuid) from public;
grant execute on function public.access_request_follow_up(uuid) to anon, authenticated;

create or replace function public.reply_to_access_request(p_token uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.access_requests;
begin
  if coalesce(btrim(p_reply), '') = '' then
    raise exception 'Hace falta escribir la respuesta';
  end if;

  select * into v_req from public.access_requests
  where follow_up_token = p_token for update;

  if v_req.id is null then
    raise exception 'Enlace no válido';
  end if;

  if not public.access_request_transition_allowed(v_req.status, 'submitted', 'applicant') then
    raise exception 'Esta solicitud no está esperando una respuesta';
  end if;

  update public.access_requests
  set status = 'submitted',
      applicant_reply = btrim(p_reply),
      updated_at = now()
  where id = v_req.id;

  insert into public.access_request_events (request_id, from_status, to_status, reason)
  values (v_req.id, v_req.status, 'submitted', btrim(p_reply));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (null, null, 'access_request.replied', 'access_request', v_req.id,
          jsonb_build_object('status', v_req.status),
          jsonb_build_object('status', 'submitted'), btrim(p_reply));
end;
$$;

comment on function public.reply_to_access_request(uuid, text) is
  'RN-ACC-05 · quien solicita contesta a "necesita información" por el
   enlace con clave, sin cuenta, y la solicitud vuelve a la cola.';

revoke all on function public.reply_to_access_request(uuid, text) from public;
grant execute on function public.reply_to_access_request(uuid, text) to anon, authenticated;

-- ============================================================
-- 5 · Decidir (RN-ACC-05, RN-ACC-06)
-- ============================================================
--
-- Aprobar no pasa por aquí: hace tres cosas más y tiene su propia función
-- con clave de idempotencia (RN-ACC-08).
create or replace function public.decide_access_request(
  p_request_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.access_requests;
begin
  if not public.is_platform_approver() then
    raise exception 'Solo Cuotly decide sobre una solicitud de acceso';
  end if;

  select * into v_req from public.access_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if p_status = 'approved' then
    raise exception 'Aprobar una solicitud de acceso se hace con approve_access_request()';
  end if;

  if not public.access_request_transition_allowed(v_req.status, p_status, 'platform') then
    raise exception 'Una solicitud en % no pasa a %', v_req.status, p_status;
  end if;

  -- RN-ACC-05 · rechazar sin decir por qué, o pedir información sin decir
  -- cuál, deja a alguien mirando una pared.
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Hace falta un motivo para pasar a %', p_status;
  end if;

  update public.access_requests
  set status = p_status,
      status_reason = btrim(p_reason),
      decided_at = case when p_status = 'rejected' then now() else decided_at end,
      decided_by = case when p_status = 'rejected' then auth.uid() else decided_by end,
      updated_at = now()
  where id = p_request_id;

  insert into public.access_request_events (request_id, from_status, to_status, actor_id, reason)
  values (p_request_id, v_req.status, p_status, auth.uid(), btrim(p_reason));

  -- El nombre de la acción va LITERAL y no compuesto con `|| p_status`:
  -- `audit.test.ts` lee las migraciones para comprobar que el catálogo de
  -- `src/core/audit.ts` conoce todo lo que la base escribe, y un nombre
  -- construido en tiempo de ejecución no se puede leer ahí.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (null, auth.uid(),
          case p_status
            when 'needs_information' then 'access_request.needs_information'
            when 'rejected' then 'access_request.rejected'
          end,
          'access_request', p_request_id,
          jsonb_build_object('status', v_req.status),
          jsonb_build_object('status', p_status), btrim(p_reason));

  perform public.queue_platform_email(
    case p_status
      when 'needs_information' then 'access_request_needs_information'
      when 'rejected' then 'access_request_rejected'
    end,
    v_req.email,
    jsonb_build_object('contact_name', v_req.contact_name,
                       'reason', btrim(p_reason),
                       'follow_up_token', v_req.follow_up_token),
    p_status || ':' || p_request_id::text || ':' || extract(epoch from now())::bigint::text
  );
end;
$$;

comment on function public.decide_access_request(uuid, text, text) is
  'RN-ACC-05/06 · Cuotly pasa una solicitud de acceso a "Necesita
   información" o a "No aprobada", siempre con motivo escrito. Aprobar
   tiene su propia función.';

revoke all on function public.decide_access_request(uuid, text, text) from public, anon;
grant execute on function public.decide_access_request(uuid, text, text) to authenticated;

-- ============================================================
-- 6 · Aprobar: el derecho a la cuenta, y nada más (RN-ACC-03, RN-ACC-08)
-- ============================================================
--
-- Aprobar **no** crea espacio, ni panel, ni suscripción, ni cobro: eso
-- sigue pasando por `approve_space_request()` (RN-PLA-05), con todas sus
-- comprobaciones. Lo que crea es el enlace de un solo uso donde la persona
-- pondrá su contraseña, y el correo que se lo lleva. Con clave de
-- idempotencia: pulsar dos veces devuelve el mismo enlace y no manda un
-- segundo correo.
create or replace function public.approve_access_request(
  p_request_id uuid,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.access_requests;
  v_token uuid;
  v_expires timestamptz;
begin
  if not public.is_platform_approver() then
    raise exception 'Solo Cuotly aprueba una solicitud de acceso';
  end if;

  select * into v_req from public.access_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  -- Ya aprobada: se devuelve el mismo enlace vivo y no se toca nada.
  if v_req.status = 'approved' then
    select t.token into v_token
    from public.account_setup_tokens t
    where t.access_request_id = p_request_id and t.used_at is null
    order by t.created_at desc
    limit 1;
    return v_token;
  end if;

  if not public.access_request_transition_allowed(v_req.status, 'approved', 'platform') then
    raise exception 'Una solicitud en % no se aprueba', v_req.status;
  end if;

  -- Entre que se envió y se aprueba, ese correo puede haberse registrado
  -- por la otra puerta (una invitación). Aprobar entonces crearía una
  -- segunda cuenta para la misma persona, que es lo que §7.1 prohíbe.
  if exists (select 1 from public.profiles p where lower(p.email) = lower(v_req.email)) then
    raise exception 'Ese correo ya tiene cuenta en Cuotly';
  end if;

  -- Los mismos siete días que una invitación (HU-03): es el mismo tipo de
  -- enlace, y dos caducidades distintas para lo mismo solo se olvidan.
  v_expires := now() + interval '7 days';

  update public.access_requests
  set status = 'approved',
      status_reason = null,
      decided_at = now(),
      decided_by = auth.uid(),
      idempotency_key = coalesce(p_idempotency_key, idempotency_key),
      updated_at = now()
  where id = p_request_id;

  insert into public.account_setup_tokens (access_request_id, email, expires_at)
  values (p_request_id, lower(v_req.email), v_expires)
  returning token into v_token;

  insert into public.access_request_events (request_id, from_status, to_status, actor_id)
  values (p_request_id, v_req.status, 'approved', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (null, auth.uid(), 'access_request.approved', 'access_request', p_request_id,
          jsonb_build_object('status', v_req.status),
          jsonb_build_object('status', 'approved', 'expires_at', v_expires));

  perform public.queue_platform_email(
    'access_request_approved', v_req.email,
    jsonb_build_object('contact_name', v_req.contact_name,
                       'setup_token', v_token,
                       'expires_at', v_expires),
    'approved:' || p_request_id::text
  );

  return v_token;
end;
$$;

comment on function public.approve_access_request(uuid, text) is
  'RN-ACC-03/04/08 · aprobar crea el derecho a la cuenta —un enlace de un
   solo uso, con caducidad— y el correo que se lo lleva. No crea espacio ni
   panel. Idempotente: dos pulsaciones, un enlace.';

revoke all on function public.approve_access_request(uuid, text) from public, anon;
grant execute on function public.approve_access_request(uuid, text) to authenticated;

-- ============================================================
-- 7 · Gastar el enlace: la cuenta se materializa (RN-ACC-03, RN-ACC-04)
-- ============================================================
--
-- Lo que ve la pantalla de alta antes de pedir la contraseña. Devuelve el
-- correo para enseñarlo **prefijado y bloqueado**: el alta se hace contra
-- la dirección aprobada y no contra la que alguien escriba.
create or replace function public.account_setup_details(p_token uuid)
returns table (email text, contact_name text, state text)
language sql
stable
security definer
set search_path = public
as $$
  select case when t.used_at is null and t.expires_at > now() then t.email else null end,
         case when t.used_at is null and t.expires_at > now() then r.contact_name else null end,
         case
           when t.used_at is not null then 'used'
           when t.expires_at <= now() then 'expired'
           else 'valid'
         end
  from public.account_setup_tokens t
  join public.access_requests r on r.id = t.access_request_id
  where t.token = p_token;
$$;

comment on function public.account_setup_details(uuid) is
  'RN-ACC-04 · lo que la pantalla de alta necesita saber del enlace. Un
   enlace gastado o caducado no devuelve el correo: solo el motivo.';

revoke all on function public.account_setup_details(uuid) from public;
grant execute on function public.account_setup_details(uuid) to anon, authenticated;

-- Reservada a `service_role`. La llama el servidor **después** de crear la
-- cuenta con la API de administración, en la misma acción. Falla cerrado:
-- si el enlace ya se gastó, si caducó o si el correo no es el de la
-- cuenta recién creada, no marca nada y el servidor deshace el alta.
create or replace function public.consume_account_setup_token(
  p_token uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tok public.account_setup_tokens;
  v_email text;
begin
  select * into v_tok from public.account_setup_tokens where token = p_token for update;
  if v_tok.id is null then
    raise exception 'Enlace de alta no válido';
  end if;

  if v_tok.used_at is not null then
    raise exception 'Este enlace de alta ya se ha usado';
  end if;

  if v_tok.expires_at <= now() then
    raise exception 'Este enlace de alta ha caducado';
  end if;

  select lower(p.email) into v_email from public.profiles p where p.id = p_user_id;
  if v_email is null or v_email <> lower(v_tok.email) then
    raise exception 'La cuenta no coincide con el correo aprobado';
  end if;

  update public.account_setup_tokens
  set used_at = now(), used_by = p_user_id
  where id = v_tok.id;

  update public.access_requests
  set account_id = p_user_id, updated_at = now()
  where id = v_tok.access_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (null, p_user_id, 'access_request.account_created', 'access_request',
          v_tok.access_request_id, jsonb_build_object('account_id', p_user_id));

  return v_tok.access_request_id;
end;
$$;

comment on function public.consume_account_setup_token(uuid, uuid) is
  'RN-ACC-01/03 · gasta el enlace de un solo uso y ata la cuenta recién
   creada a su solicitud. Reservada a `service_role`: es la mitad del
   servidor de la única puerta que crea cuentas por solicitud.';

revoke all on function public.consume_account_setup_token(uuid, uuid)
  from public, anon, authenticated;

-- ============================================================
-- 8 · La otra puerta: la invitación también crea la cuenta (RN-ACC-09)
-- ============================================================
--
-- Lo que la pantalla de invitación necesita antes de pedir la contraseña.
-- El correo sale de aquí y se enseña **bloqueado**, porque
-- `accept_space_invitation()` exige desde la migración 7 que coincida con
-- el de la invitación: dejarlo escribir a mano solo produce un rechazo que
-- quien lo recibe no entiende.
create or replace function public.invitation_signup_details(p_token uuid)
returns table (email text, space_name text, state text, has_account boolean)
language sql
stable
security definer
set search_path = public
as $$
  select case when i.status = 'pending' and i.expires_at > now() then i.email else null end,
         case when i.status = 'pending' and i.expires_at > now() then s.name else null end,
         case
           when i.status <> 'pending' then i.status
           when i.expires_at <= now() then 'expired'
           else 'valid'
         end,
         exists (select 1 from public.profiles p where lower(p.email) = lower(i.email))
  from public.space_invitations i
  join public.spaces s on s.id = i.space_id
  where i.token = p_token;
$$;

comment on function public.invitation_signup_details(uuid) is
  'RN-ACC-09 · lo que la pantalla de invitación enseña antes de la
   contraseña: el correo prefijado, el espacio, y si esa dirección ya tiene
   cuenta (entonces no hay contraseña que poner: se entra y se acepta).';

revoke all on function public.invitation_signup_details(uuid) from public;
grant execute on function public.invitation_signup_details(uuid) to anon, authenticated;

-- `accept_space_invitation()` daba por hecho que quien acepta ya tiene
-- sesión (`auth.uid()`). Desde la decisión 41 la invitación es también un
-- alta, y el servidor tiene que aceptarla por cuenta de alguien que acaba
-- de nacer y aún no ha iniciado sesión. Se parte en dos: el cuerpo, que
-- recibe la persona, y la de siempre, que le pasa `auth.uid()`. No cambia
-- ninguna comprobación —el correo tiene que seguir coincidiendo—, solo de
-- dónde sale la persona.
create or replace function public.accept_space_invitation_as(
  p_token uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation record;
  v_email text;
begin
  if p_user_id is null then
    raise exception 'Hace falta una cuenta para aceptar una invitación';
  end if;

  select email into v_email from public.profiles where id = p_user_id;

  select * into v_invitation
  from public.space_invitations
  where token = p_token
    and status = 'pending'
    and expires_at > now()
  for update;

  if v_invitation is null then
    raise exception 'Invitación no válida o caducada';
  end if;

  if v_email is null or lower(v_invitation.email) <> lower(v_email) then
    raise exception 'Esta invitación no es para tu cuenta';
  end if;

  insert into public.space_memberships (space_id, user_id, role, status)
  values (v_invitation.space_id, p_user_id, v_invitation.role, 'active')
  on conflict (space_id, user_id) do update
    set status = 'active', role = excluded.role;

  update public.space_invitations
  set status = 'accepted'
  where id = v_invitation.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_invitation.space_id,
    p_user_id,
    'invitation.accepted',
    'space_invitation',
    v_invitation.id,
    jsonb_build_object('role', v_invitation.role)
  );

  return v_invitation.space_id;
end;
$$;

comment on function public.accept_space_invitation_as(uuid, uuid) is
  'RN-ACC-09 · acepta una invitación por cuenta de una persona concreta.
   Reservada a `service_role`: la usa el servidor justo después de crear la
   cuenta desde el enlace de invitación, cuando todavía no hay sesión.';

revoke all on function public.accept_space_invitation_as(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.accept_space_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar en Cuotly para aceptar una invitación';
  end if;
  return public.accept_space_invitation_as(p_token, auth.uid());
end;
$$;

comment on function public.accept_space_invitation(uuid) is
  'La persona invitada la llama tras iniciar sesión con el token que
   recibió. Transaccional: crea la membresía y marca la invitación como
   aceptada, o falla entera (RN-DAT-09). Desde la migración 97 el cuerpo
   está en `accept_space_invitation_as()`, que la invitación-alta necesita
   poder llamar sin sesión (RN-ACC-09).';

revoke all on function public.accept_space_invitation(uuid) from public, anon;
grant execute on function public.accept_space_invitation(uuid) to authenticated;

-- ============================================================
-- 9 · La cola de correo: reclamar y marcar (reservadas a service_role)
-- ============================================================
create or replace function public.claim_platform_emails(p_limit integer default 20)
returns table (
  email_id uuid,
  kind text,
  to_email text,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with tomados as (
    select e.id from public.platform_emails e
    where e.status = 'pending' and e.next_attempt_at <= now()
    order by e.next_attempt_at
    limit p_limit
    for update skip locked
  ),
  marcados as (
    update public.platform_emails e
    set attempts = e.attempts + 1
    from tomados t
    where e.id = t.id
    returning e.id, e.kind, e.to_email, e.payload, e.attempts
  )
  select m.id, m.kind, m.to_email, m.payload, m.attempts from marcados m;
end;
$$;

revoke all on function public.claim_platform_emails(integer) from public, anon, authenticated;

create or replace function public.mark_platform_email_sent(
  p_email_id uuid,
  p_provider_message_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.platform_emails
  set status = 'sent', sent_at = now(), last_error = null,
      provider_message_id = p_provider_message_id
  where id = p_email_id;
end;
$$;

revoke all on function public.mark_platform_email_sent(uuid, text)
  from public, anon, authenticated;

create or replace function public.mark_platform_email_failed(
  p_email_id uuid,
  p_error text,
  p_next_attempt_at timestamptz,
  p_dead boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.platform_emails
  set status = case when p_dead then 'dead' else 'pending' end,
      last_error = p_error,
      next_attempt_at = p_next_attempt_at
  where id = p_email_id;
end;
$$;

revoke all on function public.mark_platform_email_failed(uuid, text, timestamptz, boolean)
  from public, anon, authenticated;

comment on function public.claim_platform_emails(integer) is
  'RN-ACC-04 · el proceso de la cola reclama correos hacia direcciones sin
   cuenta, con `for update skip locked` como el resto. Reservada a
   `service_role`.';
