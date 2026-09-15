-- Fase 4 · Hito 17 · la solicitud de creación de espacio, su aprobación y
-- el alta (PRD §30, RN-PLA-01 a 09; §10, §167 y §4.4 de la maestra).
--
-- **Lo que hace distinta a esta migración.** Todo lo anterior ocurre dentro
-- de un espacio. Esto ocurre ANTES de que exista: alguien lo pide, Cuotly
-- lo revisa, y si lo aprueba, lo crea. Es lo que convierte a Cuotly en
-- multiempresa de verdad — hasta hoy los espacios se creaban a mano.
--
-- **Dos tablas sin `space_id`, y no es un descuido.** CLAUDE.md exige
-- `space_id NOT NULL` y RLS a "toda tabla que pertenezca a un espacio".
-- `space_requests` y `space_request_events` no le pertenecen a ninguno:
-- nacen antes. El barrido de invariantes de RLS las va a señalar por eso, y
-- se clasifican ahí con este motivo escrito. Lo que NO se relaja es la RLS:
-- las dos la llevan activada con políticas explícitas.
--
-- Tampoco caben en los libros de siempre, y por la misma razón:
-- `state_events.space_id` y `notifications.space_id` son NOT NULL. Por eso
-- el recorrido de una solicitud tiene su propio libro inmutable y por eso
-- este hito **no manda ningún aviso**: el solicitante ve el estado y el
-- motivo en su pantalla. `audit_log.space_id` sí es anulable desde la Fase
-- 1, así que la auditoría es la de siempre.

-- ============================================================
-- 1 · El permiso fino de plataforma (§167, RN-PLA-04)
-- ============================================================
--
-- §167 concede por separado "aprobar espacios", "gestionar suscripciones" y
-- "Modo soporte". `platform_roles` existe desde la Fase 1 con el rol y sin
-- permisos. Se añade **solo el de este hito**: los otros dos llegan con el
-- 18 y el 19. Una columna que nadie lee todavía es exactamente el error de
-- `reports.filters`, que se guardaba y no se aplicaba nunca.
alter table public.platform_roles
  add column if not exists can_approve_spaces boolean not null default false;

comment on column public.platform_roles.can_approve_spaces is
  '§167 · "Aprobar espacios: Bosco sí; Admin Cuotly si recibe permiso".
   Concederlo es de Bosco y de nadie más.';

-- Aparece dentro de la expresión de la política de `space_requests`, así
-- que CONSERVA el EXECUTE de `authenticated`: PostgreSQL evalúa esas
-- expresiones con los privilegios de quien consulta, y revocárselo no la
-- cierra, rompe la política entera (CLAUDE.md).
create or replace function public.is_platform_approver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
      or exists (
        select 1 from public.platform_roles pr
        where pr.user_id = auth.uid() and pr.can_approve_spaces
      );
$$;

comment on function public.is_platform_approver() is
  '§167, RN-PLA-04 · quién decide sobre una solicitud de espacio: Bosco
   siempre, o un Administrador de Cuotly con el permiso. Vive dentro de la
   política de `space_requests`, así que conserva el EXECUTE de
   `authenticated` (CLAUDE.md).';

revoke all on function public.is_platform_approver() from public, anon;
grant execute on function public.is_platform_approver() to authenticated;

-- ============================================================
-- 2 · La tabla de transiciones (RN-PLA-03)
-- ============================================================
--
-- La misma que `TRANSITIONS` de `src/core/space-requests.ts`, duplicada a
-- propósito: son dos sistemas que no pueden importarse el uno al otro, y
-- `listas-compartidas.test.ts` vigila que no se separen. Es lo que ya se
-- hizo con los informes y con las oportunidades.
create or replace function public.space_request_transition_allowed(
  p_from text, p_to text, p_actor text
)
returns boolean
language sql
immutable
as $$
  select case
    -- El borrador es del solicitante y la plataforma no lo ve, así que no
    -- puede rechazar lo que no ha visto (RN-PLA-02).
    when p_from = 'draft' and p_to = 'submitted' then p_actor in ('requester')
    when p_from = 'submitted' and p_to in ('in_review', 'needs_information', 'approved', 'rejected')
      then p_actor in ('platform')
    when p_from = 'in_review' and p_to in ('needs_information', 'approved', 'rejected')
      then p_actor in ('platform')
    when p_from = 'needs_information' and p_to = 'submitted' then p_actor in ('requester')
    else false
  end;
$$;

comment on function public.space_request_transition_allowed(text, text, text) is
  'RN-PLA-03 · quién mueve cada transición de una solicitud de espacio.
   Duplicada con `src/core/space-requests.ts` a propósito; los vigila
   `listas-compartidas.test.ts`. "Aprobada" y "Rechazada" no salen: son
   finales.';

revoke all on function public.space_request_transition_allowed(text, text, text) from public, anon;
grant execute on function public.space_request_transition_allowed(text, text, text) to authenticated;

-- ============================================================
-- 3 · Las tablas
-- ============================================================
create table public.space_requests (
  id uuid primary key default gen_random_uuid(),
  -- RN-PLA-02 · la escribe una persona registrada. No hay `insert` para
  -- `anon`: un formulario público sería una superficie de abuso sin dueño,
  -- y dejaría la solicitud sin nadie a quien entregarle el espacio.
  requester_id uuid not null references public.profiles (id) on delete cascade,

  -- §10 · los nueve campos, tal cual.
  business_name text not null check (length(btrim(business_name)) > 0),
  contact_name text not null check (length(btrim(contact_name)) > 0),
  email text not null check (position('@' in email) > 1),
  phone text,
  estimated_establishments integer check (estimated_establishments is null or estimated_establishments >= 0),
  estimated_users integer check (estimated_users is null or estimated_users >= 0),
  intended_use text,
  plan text not null check (plan in ('pro', 'agency')),
  -- "Datos fiscales básicos" (§10), y básicos de verdad: se guardan como
  -- los escribe quien los escribe. No se valida ningún identificador ni se
  -- numera nada — eso es del bloque legal, que sigue aplazado (§170.1).
  tax_name text,
  tax_id text,
  tax_address text,

  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'in_review', 'needs_information', 'approved', 'rejected'
  )),
  -- RN-PLA-06 · lo que escribe quien decide: por qué se rechaza, o qué
  -- falta. Se guarda porque es la frase de una persona, no un código.
  status_reason text,

  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  -- El espacio que salió de aquí, cuando salió.
  space_id uuid references public.spaces (id),
  -- RN-PLA-05 · pulsar "Aprobar" dos veces no crea dos espacios.
  idempotency_key text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un estado final tiene fecha y quién, y uno que no lo es, no.
  constraint space_requests_decision check (
    (status in ('approved', 'rejected')) = (decided_at is not null)
  ),
  -- Un espacio apuntado aquí existe si y solo si la solicitud se aprobó.
  -- Con `>=` o `<=` solo se cierra una de las dos puertas; con `=` se
  -- cierran las dos, y es lo que se quiere decir.
  constraint space_requests_space check ((status = 'approved') = (space_id is not null))
);

comment on table public.space_requests is
  '§10, RN-PLA-01 · la solicitud de creación de espacio. **No lleva
   `space_id` obligatorio a propósito**: nace antes de que el espacio
   exista, y solo lo apunta cuando la aprobación lo crea. Es una de las dos
   tablas de plataforma, clasificadas como tales en el barrido de
   invariantes de RLS.';

create unique index space_requests_idempotency_idx
  on public.space_requests (idempotency_key) where idempotency_key is not null;
create index space_requests_status_idx on public.space_requests (status, created_at desc);
create index space_requests_requester_idx on public.space_requests (requester_id);

-- Un borrador a medias por persona, y no veinte: §10 dice "Borrador" en
-- singular, y así "seguir con lo que empecé" no obliga a elegir.
create unique index space_requests_one_draft_idx
  on public.space_requests (requester_id) where status = 'draft';

alter table public.space_requests enable row level security;

-- RN-PLA-02 y RN-PLA-07 · quien la escribió ve la suya, siempre; la
-- plataforma las ve todas MENOS los borradores.
create policy space_requests_select on public.space_requests
for select
using (
  requester_id = auth.uid()
  or (status <> 'draft' and public.is_platform_approver())
);

-- Se escribe solo por las funciones de abajo, que comprueban la transición
-- y dejan auditoría. Sin políticas de insert, update ni delete: nadie mueve
-- una solicitud con un UPDATE suelto (CLAUDE.md, RN-DAT-08).

-- RN-PLA-07 · el solicitante ve el estado y el motivo, y NO quién la
-- revisó. Como RLS filtra filas y no columnas, se sostiene con privilegio
-- de columna, igual que la identidad del equipo en `messages` o `reports`.
-- Consecuencia práctica: `select *` sobre esta tabla devuelve 403.
revoke select on public.space_requests from anon, authenticated;
grant select (id, requester_id, business_name, contact_name, email, phone,
              estimated_establishments, estimated_users, intended_use, plan,
              tax_name, tax_id, tax_address, status, status_reason,
              submitted_at, decided_at, space_id, created_at, updated_at)
  on public.space_requests to authenticated;

-- El recorrido de la solicitud. Libro inmutable: se escribe y no se toca
-- (CLAUDE.md). No cabe en `state_events` porque aquella exige `space_id`.
create table public.space_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.space_requests (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles (id),
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.space_request_events is
  'RN-PLA-08 · el recorrido de una solicitud, como libro inmutable. La
   segunda tabla de plataforma sin `space_id`: la solicitud tampoco lo
   tiene hasta que se aprueba.';

create index space_request_events_request_idx
  on public.space_request_events (request_id, created_at);

alter table public.space_request_events enable row level security;

-- Lo ve quien puede ver la solicitud. `actor_id` no: quién decidió sale de
-- `audit_log` (RN-PLA-07), no de aquí.
create policy space_request_events_select on public.space_request_events
for select
using (
  exists (
    select 1 from public.space_requests r
    where r.id = request_id
      and (r.requester_id = auth.uid() or (r.status <> 'draft' and public.is_platform_approver()))
  )
);

revoke select on public.space_request_events from anon, authenticated;
grant select (id, request_id, from_status, to_status, reason, created_at)
  on public.space_request_events to authenticated;

-- ============================================================
-- 4 · El espacio recuerda con qué plan de Cuotly nació (§4.4)
-- ============================================================
--
-- RN-PLA-05 · "la prueba comienza cuando Bosco aprueba y se crea el
-- espacio". Se guarda aquí, que es de quien es: un espacio tiene un plan de
-- Cuotly igual que tiene zona horaria. El precio, los límites, los cobros y
-- el impago son el Hito 18 (§4.1 a §4.7) y no se adelantan.
--
-- Anulables a propósito: los espacios que existían antes de esta migración
-- —Restavor, y los de prueba— no nacieron de una solicitud y no están en
-- ninguna prueba. Poner un valor por omisión sería inventarles un contrato.
alter table public.spaces add column if not exists cuotly_plan text
  check (cuotly_plan is null or cuotly_plan in ('pro', 'agency'));
alter table public.spaces add column if not exists cuotly_trial_ends_at timestamptz;

comment on column public.spaces.cuotly_plan is
  '§4 · el plan de Cuotly con el que nació el espacio (lo que su
   propietario le paga a Bosco), no el que ese espacio le vende a sus
   restaurantes (§5). Nulo en los espacios anteriores al Hito 17.';
comment on column public.spaces.cuotly_trial_ends_at is
  '§4.4 · fin de la prueba de 7 días, que arranca al aprobar la solicitud.
   Lo que pasa cuando llega —archivar en modo lectura— es el Hito 18.';

-- ============================================================
-- 5 · El slug, que es mecánica y no regla de negocio
-- ============================================================
--
-- `spaces.slug` es único y no había forma de fabricar uno: `space_slug()`
-- devuelve el de un espacio, no lo construye. Se hace sin `unaccent`, que
-- es una extensión que este proyecto no instala: `translate()` con las
-- vocales acentuadas del español y la eñe basta y es determinista.
create or replace function public.space_slug_from_name(p_name text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_base text;
  v_slug text;
  v_n integer := 1;
begin
  v_base := lower(btrim(coalesce(p_name, '')));
  v_base := translate(v_base, 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc');
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  if v_base = '' then
    v_base := 'espacio';
  end if;
  v_base := left(v_base, 40);

  v_slug := v_base;
  -- Dos negocios pueden llamarse igual. El segundo no falla: se numera.
  while exists (select 1 from public.spaces s where s.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;

  return v_slug;
end;
$$;

comment on function public.space_slug_from_name(text) is
  'Construye un slug libre a partir del nombre del negocio. Mecánica, no
   regla de negocio. Interna: solo la usa `approve_space_request()`.';

revoke all on function public.space_slug_from_name(text) from public, anon, authenticated;

-- ============================================================
-- 6 · Escribir y enviar la solicitud (RN-PLA-02, RN-PLA-03)
-- ============================================================
create or replace function public.save_space_request_draft(
  p_business_name text,
  p_contact_name text,
  p_email text,
  p_plan text,
  p_phone text default null,
  p_estimated_establishments integer default null,
  p_estimated_users integer default null,
  p_intended_use text default null,
  p_tax_name text default null,
  p_tax_id text default null,
  p_tax_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar en Cuotly para pedir un espacio';
  end if;

  if p_plan not in ('pro', 'agency') then
    raise exception 'El plan de Cuotly es Pro o Agency, no %', p_plan;
  end if;

  -- Un borrador por persona (el índice lo garantiza); esto lo actualiza en
  -- vez de chocar, que es lo que "seguir con lo que empecé" significa.
  select id into v_id
  from public.space_requests
  where requester_id = auth.uid() and status = 'draft'
  for update;

  if v_id is null then
    insert into public.space_requests (
      requester_id, business_name, contact_name, email, phone,
      estimated_establishments, estimated_users, intended_use, plan,
      tax_name, tax_id, tax_address
    ) values (
      auth.uid(), btrim(p_business_name), btrim(p_contact_name), btrim(p_email), p_phone,
      p_estimated_establishments, p_estimated_users, p_intended_use, p_plan,
      p_tax_name, p_tax_id, p_tax_address
    )
    returning id into v_id;

    insert into public.space_request_events (request_id, from_status, to_status, actor_id)
    values (v_id, null, 'draft', auth.uid());
  else
    update public.space_requests
    set business_name = btrim(p_business_name),
        contact_name = btrim(p_contact_name),
        email = btrim(p_email),
        phone = p_phone,
        estimated_establishments = p_estimated_establishments,
        estimated_users = p_estimated_users,
        intended_use = p_intended_use,
        plan = p_plan,
        tax_name = p_tax_name,
        tax_id = p_tax_id,
        tax_address = p_tax_address,
        updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end;
$$;

comment on function public.save_space_request_draft(text, text, text, text, text, integer, integer, text, text, text, text) is
  'RN-PLA-01/02 · crea o actualiza EL borrador de quien llama. Un borrador
   por persona: §10 dice "Borrador" en singular.';

revoke all on function public.save_space_request_draft(text, text, text, text, text, integer, integer, text, text, text, text) from public, anon;
grant execute on function public.save_space_request_draft(text, text, text, text, text, integer, integer, text, text, text, text) to authenticated;

create or replace function public.submit_space_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.space_requests;
begin
  select * into v_req from public.space_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_req.requester_id <> auth.uid() then
    raise exception 'Solo quien escribió la solicitud la envía';
  end if;

  -- CA-17 · enviar dos veces no hace nada la segunda.
  if v_req.status = 'submitted' then
    return;
  end if;

  if not public.space_request_transition_allowed(v_req.status, 'submitted', 'requester') then
    raise exception 'Una solicitud en % no se envía', v_req.status;
  end if;

  -- §10 · los campos que no pueden ir en blanco al enviarla. Los demás son
  -- estimaciones y pueden faltar; el plan y los datos de contacto, no.
  if coalesce(btrim(v_req.business_name), '') = ''
     or coalesce(btrim(v_req.contact_name), '') = ''
     or coalesce(btrim(v_req.email), '') = '' then
    raise exception 'Faltan el nombre del negocio, el responsable o el correo';
  end if;

  update public.space_requests
  set status = 'submitted',
      submitted_at = coalesce(submitted_at, now()),
      status_reason = null,
      updated_at = now()
  where id = p_request_id;

  insert into public.space_request_events (request_id, from_status, to_status, actor_id)
  values (p_request_id, v_req.status, 'submitted', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (null, auth.uid(), 'space_request.submitted', 'space_request', p_request_id,
          jsonb_build_object('status', v_req.status), jsonb_build_object('status', 'submitted'));
end;
$$;

comment on function public.submit_space_request(uuid) is
  'RN-PLA-03 · el solicitante envía su borrador, o lo vuelve a enviar
   después de "Necesita información". Enviar dos veces no hace nada la
   segunda (CA-17).';

revoke all on function public.submit_space_request(uuid) from public, anon;
grant execute on function public.submit_space_request(uuid) to authenticated;

-- ============================================================
-- 7 · Decidir: revisar, pedir información o rechazar (RN-PLA-03/04/06)
-- ============================================================
--
-- Aprobar NO pasa por aquí: hace cuatro cosas más y tiene su propia
-- función con clave de idempotencia (RN-PLA-05).
create or replace function public.decide_space_request(
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
  v_req public.space_requests;
begin
  if not public.is_platform_approver() then
    raise exception 'Solo Cuotly decide sobre una solicitud de espacio';
  end if;

  select * into v_req from public.space_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if p_status = 'approved' then
    raise exception 'Aprobar una solicitud se hace con approve_space_request()';
  end if;

  if not public.space_request_transition_allowed(v_req.status, p_status, 'platform') then
    raise exception 'Una solicitud en % no pasa a %', v_req.status, p_status;
  end if;

  -- RN-PLA-06 · rechazar sin decir por qué, o pedir información sin decir
  -- cuál, deja a alguien mirando una pared.
  if p_status in ('needs_information', 'rejected')
     and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Hace falta un motivo para pasar a %', p_status;
  end if;

  update public.space_requests
  set status = p_status,
      status_reason = btrim(p_reason),
      decided_at = case when p_status = 'rejected' then now() else decided_at end,
      decided_by = case when p_status = 'rejected' then auth.uid() else decided_by end,
      updated_at = now()
  where id = p_request_id;

  insert into public.space_request_events (request_id, from_status, to_status, actor_id, reason)
  values (p_request_id, v_req.status, p_status, auth.uid(), btrim(p_reason));

  -- El nombre de la acción va LITERAL y no compuesto con `|| p_status`.
  -- Parece lo mismo y no lo es: `audit.test.ts` lee las migraciones para
  -- comprobar que el catálogo de `src/core/audit.ts` conoce todo lo que la
  -- base escribe, y un nombre construido en tiempo de ejecución no se
  -- puede leer ahí — ni encontrar con grep el día que alguien lo busque.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (null, auth.uid(),
          case p_status
            when 'in_review' then 'space_request.in_review'
            when 'needs_information' then 'space_request.needs_information'
            when 'rejected' then 'space_request.rejected'
          end,
          'space_request', p_request_id,
          jsonb_build_object('status', v_req.status), jsonb_build_object('status', p_status),
          btrim(p_reason));
end;
$$;

comment on function public.decide_space_request(uuid, text, text) is
  'RN-PLA-03/04/06 · la plataforma pasa una solicitud a "En revisión",
   "Necesita información" o "Rechazada", con motivo obligatorio en las dos
   últimas. Aprobar tiene su propia función.';

revoke all on function public.decide_space_request(uuid, text, text) from public, anon;
grant execute on function public.decide_space_request(uuid, text, text) to authenticated;

-- ============================================================
-- 8 · Aprobar: una sola operación que hace cuatro cosas (RN-PLA-05)
-- ============================================================
--
-- Crea el espacio, hace propietario al solicitante, arranca la prueba de 7
-- días del plan que eligió (§4.4) y deja evento y auditoría. Todo dentro de
-- la misma transacción —una función de PostgreSQL ya lo es— y con clave de
-- idempotencia: **pulsar dos veces no crea dos espacios**, que es el MUST
-- de CLAUDE.md sobre operaciones críticas.
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

  -- CA-17 · ya aprobada: se devuelve el mismo espacio y no se toca nada.
  if v_req.status = 'approved' then
    return v_req.space_id;
  end if;

  if not public.space_request_transition_allowed(v_req.status, 'approved', 'platform') then
    raise exception 'Una solicitud en % no se aprueba', v_req.status;
  end if;

  -- RN-PLA-09 · "una sola prueba gratuita por persona o negocio" (§4.4).
  -- Por PERSONA se puede comprobar, porque una cuenta es un correo (§7.1).
  -- Por NEGOCIO **no se finge**: la maestra no dice qué identifica a un
  -- negocio y eso es la pendiente 19 de docs/DECISIONES.md. Inventar aquí
  -- un criterio por datos fiscales o por dominio de correo sería
  -- exactamente lo que CLAUDE.md prohíbe.
  if exists (
    select 1 from public.space_requests r
    where r.requester_id = v_req.requester_id
      and r.status = 'approved'
      and r.id <> v_req.id
  ) then
    raise exception 'Esta persona ya tuvo su prueba gratuita (§4.4)';
  end if;

  v_slug := public.space_slug_from_name(v_req.business_name);
  v_trial_ends := now() + interval '7 days';

  insert into public.spaces (name, slug, created_by, cuotly_plan, cuotly_trial_ends_at)
  values (btrim(v_req.business_name), v_slug, v_req.requester_id, v_req.plan, v_trial_ends)
  returning id into v_space_id;

  -- El solicitante es el propietario. §127: siempre debe existir al menos
  -- un propietario, y aquí es donde nace el primero.
  insert into public.space_memberships (space_id, user_id, role, status)
  values (v_space_id, v_req.requester_id, 'owner', 'active');

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

  -- Dos apuntes, y los dos hacen falta: uno cuenta la decisión (sin espacio
  -- todavía, `space_id` nulo) y el otro cuenta el nacimiento del espacio,
  -- que ya sí lo tiene. Quien mire la auditoría de ese espacio desde dentro
  -- tiene que ver cómo empezó.
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

comment on function public.approve_space_request(uuid, text) is
  '§10, §4.4, RN-PLA-05 · aprobar es UNA operación: crea el espacio, hace
   propietario al solicitante, arranca la prueba de 7 días y deja evento y
   auditoría. Pulsarlo dos veces devuelve el mismo espacio (CA-17).';

revoke all on function public.approve_space_request(uuid, text) from public, anon;
grant execute on function public.approve_space_request(uuid, text) to authenticated;

-- Se comprueba con `supabase/tests/plataforma_solicitud_de_espacio.sql`.
