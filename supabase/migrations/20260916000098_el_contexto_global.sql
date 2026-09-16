-- ============================================================================
-- Migración 98 · El contexto global (PRD §36, RN-GLO-01 a RN-GLO-08)
-- Paso 2 del orden acordado (decisión 37) · diseño definitivo, vistas G01-G08
-- ============================================================================
--
-- Los treinta y cinco apartados anteriores ocurren **dentro** de un espacio
-- de mantenimiento o de un panel de restaurante. Este es el primero que
-- ocurre **fuera de los dos**: la zona que una persona ve por lo que **es**
-- —su cuenta— y no por dónde está.
--
-- Lo que esta migración trae es poco a propósito, y conviene decir por qué
-- antes de leer el SQL.
--
-- ---------------------------------------------------------------------------
-- 1 · Aquí no nace ninguna capacidad nueva (RN-GLO-01)
-- ---------------------------------------------------------------------------
--
-- Nada de lo que el contexto global enseña sale de una consulta nueva y
-- privilegiada. Sale de **las mismas políticas** que ya deciden qué ve esa
-- persona en cada sitio: `can_read_conversation()`, `is_space_member()`,
-- `is_establishment_client()`, `can_read_establishment_finance()`. Si
-- alguien pierde el acceso a un espacio, deja de verlo aquí en la misma
-- consulta, sin que haya que acordarse de nada.
--
-- Por eso `my_contexts()` es **SECURITY INVOKER** —la RLS de siempre
-- decide— y las otras dos son DEFINER solo por el motivo por el que ya lo
-- era `list_conversations()`: leen columnas revocadas (`messages.sender_id`
-- para contar lo no leído) que no pueden salir de la función.
--
-- ---------------------------------------------------------------------------
-- 2 · Lo que necesita tu atención NO se calcula aquí (RN-GLO-02)
-- ---------------------------------------------------------------------------
--
-- Podría parecer que falta una función. No falta: falta a propósito.
--
-- El lado del **equipo** de esa lista es el riesgo de plazo de cada
-- trabajo, y eso se calcula con el reloj laborable —festivos del espacio
-- incluidos, y los que se conocían cuando arrancó el contador (RN-CLK-10)—,
-- que vive en `src/core/business-clock.ts`. CLAUDE.md prohíbe duplicar la
-- lógica de dominio en SQL, y ya hay un sitio donde se hace bien:
-- `loadSpaceAttention()`, que alimenta el Inicio del espacio (§20.4) y la
-- columna "Necesita atención" del listado de restaurantes. El Inicio global
-- **llama a esa misma función** una vez por espacio y junta el resultado.
-- Escribir aquí un segundo criterio de "urgente" sería tener dos
-- definiciones y verlas discrepar en la misma sesión.
--
-- Lo que SÍ está aquí es el lado del **restaurante** (`my_client_attention`),
-- que no es reloj sino estado: una solicitud que espera su respuesta, un
-- presupuesto sin decidir, un cobro con deuda viva, un menú por preparar y
-- unas condiciones nuevas sin aceptar. Eso es una consulta, no un cálculo.
--
-- ---------------------------------------------------------------------------
-- 3 · Reúne, no duplica (RN-GLO-05)
-- ---------------------------------------------------------------------------
--
-- `list_my_conversations()` es `list_conversations()` sin el filtro de
-- espacio. Las conversaciones son **las mismas**, con las mismas políticas,
-- los mismos diez minutos de edición y la misma imposibilidad de borrar. Lo
-- único que se añade es de qué lado se mira cada una, que es lo que separa
-- las dos pestañas de G07 y G08.

-- ============================================================
-- 1 · Mis contextos (RN-GLO-03)
-- ============================================================
--
-- El selector de HU-02 de siempre, que no desaparece: cambia de sitio y
-- gana compañía. Hoy la raíz lo arma con dos consultas y una llamada a
-- `space_slug()` **por restaurante**; esto lo deja en una.
--
-- SECURITY INVOKER a propósito (RN-GLO-01): no lleva `security definer`, así
-- que la RLS de `space_memberships`, `spaces` y `establishments` decide
-- exactamente lo mismo que decide en cualquier otra pantalla.
--
-- Dos trampas que esta función evita y que ya costaron un fallo cada una:
--
--   · **`user_id = auth.uid()` va explícito.** La política de
--     `space_memberships` es `is_space_member(space_id)`, que deja ver a
--     TODO el equipo —tiene que hacerlo, o la pantalla de equipo no
--     funcionaría—. Sin esta línea salía una fila por miembro y el mismo
--     espacio aparecía repetido.
--   · **El slug sale de `space_slug()`, no de un join con `spaces`.** El
--     cliente no es miembro del espacio, así que `spaces_select` le tapa la
--     tabla y el join le devolvería null: se quedaría sin poder navegar a su
--     propio restaurante. Es el mismo problema que la migración 36 resolvió
--     para la búsqueda global, y la misma solución.
create or replace function public.my_contexts()
returns table (
  kind text,
  space_id uuid,
  space_slug text,
  space_name text,
  space_timezone text,
  establishment_id uuid,
  establishment_name text,
  role text
)
language sql
stable
set search_path = public
as $$
  -- Los espacios de mantenimiento donde soy miembro activo, con mi rol.
  select 'space'::text,
         s.id,
         s.slug,
         s.name,
         s.timezone,
         null::uuid,
         null::text,
         m.role::text
  from public.space_memberships m
  join public.spaces s on s.id = m.space_id
  where m.user_id = auth.uid() and m.status = 'active'

  union all

  -- Los paneles de restaurante a los que tengo acceso COMO CLIENTE. La
  -- condición no es `can_read_establishment()`: esa también es cierta para
  -- el equipo, que ya ve el restaurante dentro de su espacio y lo vería
  -- aquí otra vez como si fuera un contexto suyo.
  select 'establishment'::text,
         e.space_id,
         public.space_slug(e.space_id),
         null::text,
         public.establishment_timezone(e.id),
         e.id,
         e.name,
         null::text
  from public.establishments e
  where public.is_establishment_client(e.id)
  order by 1, 7 nulls first, 4;
$$;

comment on function public.my_contexts() is
  'RN-GLO-03 · los contextos de quien pregunta: sus espacios de
   mantenimiento y sus paneles de restaurante, en una sola consulta.
   SECURITY INVOKER a propósito (RN-GLO-01): lo que se ve lo decide la RLS
   de siempre, no esta función. El nombre del espacio va nulo en las filas
   de restaurante porque el cliente no lee `spaces`.';

revoke all on function public.my_contexts() from public, anon;
grant execute on function public.my_contexts() to authenticated;

-- ============================================================
-- 2 · La bandeja global de mensajes (RN-GLO-05)
-- ============================================================
--
-- Es `list_conversations()` sin el filtro de espacio, y con dos columnas
-- más: de dónde es cada conversación y de qué lado la mira quien pregunta,
-- que es lo que separa las pestañas "Mantenimiento" y "Restaurantes" de
-- G07 y G08.
--
-- SECURITY DEFINER por el mismo motivo que su hermana, y no por uno nuevo:
-- lo sin leer se define contra `messages.sender_id` —"escrito por otra
-- persona"— y esa columna está revocada para que el cliente no pueda
-- distinguir individualmente a nadie del equipo (CLAUDE.md MUST NOT). El
-- contador solo se puede calcular aquí dentro, y la columna no sale.
--
-- Qué filas devuelve NO lo decide esta función: lo decide
-- `can_read_conversation()`, la misma que sostiene la política de
-- `conversations`. Por eso un trabajador ve las de sus establecimientos y
-- trabajos autorizados y nada más, y por eso al cliente no le llega jamás
-- una `job_internal` (RN-MSG-04).
create or replace function public.list_my_conversations()
returns table (
  id uuid,
  side text,
  space_id uuid,
  space_slug text,
  space_name text,
  type text,
  establishment_id uuid,
  establishment_name text,
  request_id uuid,
  request_code text,
  job_id uuid,
  job_code text,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_role text,
  unread_count integer,
  is_read_only boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    -- De qué lado se mira. No es un permiso nuevo: es la misma pregunta
    -- que ya decide si alguien ve la organización interna del espacio (P7).
    case when public.is_space_member(c.space_id) then 'maintenance' else 'restaurant' end,
    c.space_id,
    public.space_slug(c.space_id),
    -- El nombre del espacio, solo para quien es de dentro. Al cliente le
    -- basta el del restaurante, y así esta función no se convierte en una
    -- vía para leer `spaces` sin ser miembro.
    case when public.is_space_member(c.space_id)
         then (select s.name from public.spaces s where s.id = c.space_id) end,
    c.type,
    est.id,
    est.name,
    c.request_id,
    r.code,
    c.job_id,
    j.code,
    ultimo.created_at,
    -- El principio del mensaje, no el mensaje: la bandeja es una lista.
    left(btrim(ultimo.body), 140),
    ultimo.sender_role,
    sin_leer.total::integer,
    public.conversation_is_read_only(c.id)
  from public.conversations c
  left join public.establishments est on est.id = public.conversation_establishment_id(c.id)
  left join public.requests r on r.id = c.request_id
  left join public.jobs j on j.id = c.job_id
  left join lateral (
    select m.body, m.created_at, m.sender_role
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) ultimo on true
  left join lateral (
    -- RN-MSG-06, la misma definición que en la bandeja del espacio: sin
    -- leer = lo que escribió otra persona después de la última lectura
    -- registrada. Lo propio no cuenta nunca.
    select count(*) as total
    from public.messages m
    where m.conversation_id = c.id
      and m.sender_id <> auth.uid()
      and m.created_at > coalesce(
        (select cr.last_read_at from public.conversation_reads cr
         where cr.conversation_id = c.id and cr.user_id = auth.uid()),
        '-infinity'::timestamptz
      )
  ) sin_leer on true
  where public.can_read_conversation(c.id)
  order by ultimo.created_at desc nulls last;
$$;

comment on function public.list_my_conversations() is
  'RN-GLO-05 · la bandeja global: las conversaciones de TODOS los contextos
   de quien pregunta, con su lado (mantenimiento o restaurante) para las dos
   pestañas de G07/G08. Reúne, no duplica: son las mismas de RN-MSG, con las
   mismas políticas. No devuelve `sender_id` a nadie.';

revoke all on function public.list_my_conversations() from public, anon;
grant execute on function public.list_my_conversations() to authenticated;

-- ============================================================
-- 3 · Lo que espera al restaurante, en todos sus restaurantes (RN-GLO-02)
-- ============================================================
--
-- La mitad de "Necesita tu atención" que es estado y no reloj. La otra
-- mitad —el riesgo de plazo de los trabajos del equipo— la calcula
-- `loadSpaceAttention()` con el reloj laborable, y no se duplica aquí.
--
-- Cinco motivos, y ninguno inventado: los cinco son filas que existen en un
-- estado concreto y que **esperan a quien pregunta**.
--
-- `due_at` va relleno solo donde hay un vencimiento de verdad:
--
--   · el cobro tiene `charges.due_at`, que es su fecha;
--   · el menú tiene el **día al que corresponde**, que es lo que lo vence.
--     No se inventa ninguna hora de corte: se toma el comienzo de ese día
--     en la zona del establecimiento, y quien mira ordena por ahí;
--   · una solicitud, un presupuesto y unas condiciones **no tienen plazo**
--     escrito en ninguna parte, así que va nulo. Poner uno sería inventarlo
--     (CLAUDE.md), y la pantalla los ordena por antigüedad.
create or replace function public.my_client_attention()
returns table (
  kind text,
  space_id uuid,
  space_slug text,
  establishment_id uuid,
  establishment_name text,
  entity_type text,
  entity_id uuid,
  title text,
  due_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  -- Una solicitud que espera su respuesta, o su aceptación.
  select case r.state
           when 'needs_information' then 'request_needs_information'
           else 'request_pending_acceptance'
         end,
         r.space_id,
         public.space_slug(r.space_id),
         r.establishment_id,
         e.name,
         'request',
         r.id,
         r.code,
         null::timestamptz,
         r.created_at
  from public.requests r
  join public.establishments e on e.id = r.establishment_id
  where r.state in ('needs_information', 'pending_client_acceptance')
    and public.is_establishment_client(r.establishment_id)

  union all

  -- Un presupuesto enviado y sin decidir (§84).
  select 'quote_to_decide',
         q.space_id,
         public.space_slug(q.space_id),
         q.establishment_id,
         e.name,
         'quote',
         q.id,
         q.code,
         null::timestamptz,
         coalesce(q.sent_at, q.created_at)
  from public.quotes q
  join public.establishments e on e.id = q.establishment_id
  where q.state = 'sent'
    and public.is_establishment_client(q.establishment_id)

  union all

  -- Un cobro con deuda viva. `charge_outstanding_cents()` exige
  -- visibilidad financiera y lanza si no la hay, así que se pregunta antes:
  -- un cliente sin acceso a facturación no ve cobros aquí, no recibe un
  -- error a mitad de lista.
  select 'charge_to_pay',
         c.space_id,
         public.space_slug(c.space_id),
         c.establishment_id,
         e.name,
         'charge',
         c.id,
         c.concept,
         c.due_at,
         c.created_at
  from public.charges c
  join public.establishments e on e.id = c.establishment_id
  where public.is_establishment_client(c.establishment_id)
    and public.can_read_establishment_finance(c.establishment_id)
    and public.charge_outstanding_cents(c.id) > 0

  union all

  -- Un menú que todavía no está preparado para su día (RN-MEN).
  select 'menu_to_prepare',
         m.space_id,
         public.space_slug(m.space_id),
         m.establishment_id,
         e.name,
         'menu',
         m.id,
         m.name,
         (m.target_date::timestamp at time zone public.establishment_timezone(m.establishment_id)),
         m.created_at
  from public.menus m
  join public.establishments e on e.id = m.establishment_id
  where m.state in ('draft', 'needs_information')
    and m.target_date >= (now() at time zone public.establishment_timezone(m.establishment_id))::date
    and public.is_establishment_client(m.establishment_id)

  union all

  -- Condiciones nuevas sin aceptar (RN-DAT-07). `subscription_terms()` ya
  -- dice si están pendientes o desactualizadas y comprueba quién pregunta.
  select 'terms_to_accept',
         s.space_id,
         public.space_slug(s.space_id),
         s.establishment_id,
         e.name,
         'subscription',
         s.id,
         t.subject_name,
         null::timestamptz,
         coalesce(t.current_published_at, s.created_at)
  from public.subscriptions s
  join public.establishments e on e.id = s.establishment_id
  cross join lateral public.subscription_terms(s.id) t
  where public.is_establishment_client(s.establishment_id)
    and public.client_can_accept_terms(s.establishment_id)
    and t.status in ('pending', 'outdated');
$$;

comment on function public.my_client_attention() is
  'RN-GLO-02 · lo que espera al restaurante en TODOS sus restaurantes a la
   vez: solicitudes que le tocan, presupuestos sin decidir, cobros con deuda
   viva, menús por preparar y condiciones nuevas sin aceptar. Es la mitad de
   "Necesita tu atención" que es estado; la del reloj laborable la calcula
   `loadSpaceAttention()` en `src/core`, donde CLAUDE.md manda que esté.';

revoke all on function public.my_client_attention() from public, anon;
grant execute on function public.my_client_attention() to authenticated;

-- ============================================================
-- 4 · Mi cuenta es de la persona, no del espacio (RN-GLO-06)
-- ============================================================
--
-- `profiles` tenía correo, nombre y poco más. G05 pide una ficha de
-- persona: nombre, apellidos, teléfono y zona horaria.
--
-- **Nombre y apellidos van separados y `full_name` se sigue escribiendo.**
-- Toda la aplicación lee hoy `full_name` —la ficha del equipo, la
-- auditoría, la supervisión—, así que partirlo sin más rompería veinte
-- pantallas. Lo que hace `set_my_profile()` es guardar las dos piezas Y
-- recomponer `full_name` con ellas: quien ya lo leía sigue leyendo lo
-- mismo, y quien necesita las piezas las tiene.
--
-- **La zona horaria de aquí sirve para ENSEÑAR fechas, y no sustituye a la
-- del espacio**, que es la que manda en todo cálculo de plazos y
-- vencimientos (CLAUDE.md MUST, RN-CLK). El comentario de la columna lo
-- dice para que nadie la use por error en un cálculo.
--
-- **La foto no está, y se dice por qué.** El almacenamiento de archivos de
-- este proyecto es por espacio: `files` lleva `space_id NOT NULL` y su
-- política cuelga de la pertenencia al espacio. Una foto de perfil no es
-- de ningún espacio —la misma persona está en varios, o en ninguno—, así
-- que necesita su propio sitio y sus propias políticas. Se deja fuera con
-- su motivo en vez de meterla a la fuerza en un bucket que la repartiría
-- mal (CLAUDE.md: si no hay dato, se dice el motivo).
alter table public.profiles add column if not exists given_name text;
alter table public.profiles add column if not exists family_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists display_timezone text;

comment on column public.profiles.given_name is
  'RN-GLO-06 · el nombre, separado del apellido. `full_name` se recompone
   con los dos en `set_my_profile()` y sigue siendo lo que lee el resto de
   la aplicación.';
comment on column public.profiles.family_name is 'RN-GLO-06 · los apellidos.';
comment on column public.profiles.phone is 'RN-GLO-06 · el teléfono de la persona.';
comment on column public.profiles.display_timezone is
  'RN-GLO-06 · la zona en la que esta persona quiere LEER las fechas. NO
   se usa para calcular nada: los plazos, los vencimientos y el reloj
   contractual salen de `spaces.timezone` (CLAUDE.md MUST, RN-CLK).';

create or replace function public.set_my_profile(
  p_given_name text,
  p_family_name text,
  p_phone text default null,
  p_display_timezone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_given text := nullif(btrim(coalesce(p_given_name, '')), '');
  v_family text := nullif(btrim(coalesce(p_family_name, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar en Cuotly para cambiar tu perfil';
  end if;

  if v_given is null then
    raise exception 'El nombre no puede quedar en blanco';
  end if;

  -- Una zona horaria que PostgreSQL no conoce no se guarda: con ella
  -- dentro, cualquier pantalla que formatee una fecha reventaría.
  if p_display_timezone is not null
     and not exists (select 1 from pg_timezone_names where name = p_display_timezone) then
    raise exception 'Esa zona horaria no existe: %', p_display_timezone;
  end if;

  update public.profiles
  set given_name = v_given,
      family_name = v_family,
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      display_timezone = p_display_timezone,
      full_name = btrim(v_given || ' ' || coalesce(v_family, ''))
  where id = auth.uid();
end;
$$;

comment on function public.set_my_profile(text, text, text, text) is
  'RN-GLO-06 · la persona cambia su propia ficha. Recompone `full_name`
   para que el resto de la aplicación siga leyendo lo mismo.';

revoke all on function public.set_my_profile(text, text, text, text) from public, anon;
grant execute on function public.set_my_profile(text, text, text, text) to authenticated;

-- ============================================================
-- 5 · Las preferencias de aviso de la PERSONA (RN-GLO-06)
-- ============================================================
--
-- `notification_preferences` es del par (persona, espacio): sirve para
-- "en este espacio no me avises de esto", y tiene que seguir siendo así.
-- Lo que G05 pide es otra cosa: la preferencia **de la persona**, que vale
-- en todos sus contextos y también en el espacio al que entre mañana.
--
-- Va en tabla aparte y no relajando el `space_id NOT NULL` de aquella, por
-- dos motivos que no son de estilo:
--
--   · el barrido de invariantes de RLS exige `space_id NOT NULL` en toda
--     tabla de espacio, y hacerla anulable la sacaría de esa garantía para
--     todas las filas, no solo para las nuevas;
--   · son dos cosas distintas y conviene que se note: esta es de
--     identidad, como `profiles` o `push_devices`, y por eso no tiene
--     `space_id` en absoluto.
--
-- Quién gana: **el espacio manda sobre la persona**. Si alguien afinó los
-- avisos dentro de un espacio, esa decisión es más específica y no se
-- pisa; la de la cuenta es el valor por omisión para todo lo demás.
create table public.profile_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  in_app boolean not null default true,
  email boolean not null default true,
  push boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (profile_id, event_type)
);

comment on table public.profile_notification_preferences is
  'RN-GLO-06 · las preferencias de aviso de la PERSONA, las de G05. Sin
   `space_id` a propósito: son de identidad, como `push_devices`, y valen
   en todos sus contextos. La preferencia por espacio
   (`notification_preferences`) manda sobre esta cuando existe.';

alter table public.profile_notification_preferences enable row level security;

create policy profile_notification_preferences_select
  on public.profile_notification_preferences
  for select using (profile_id = auth.uid());

-- Se escribe solo por la función de abajo, que comprueba RN-NOT-03. Sin
-- política de insert ni de update: un UPDATE suelto podría apagar un aviso
-- obligatorio.

create or replace function public.set_my_notification_preference(
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
  if auth.uid() is null then
    raise exception 'Hay que entrar en Cuotly para cambiar tus avisos';
  end if;

  -- RN-NOT-03 · "seguridad, pérdida de acceso, impagos graves y
  -- vencimientos críticos no pueden desactivarse dentro de Cuotly". Por
  -- ningún canal (RN-MOV-06), y tampoco desde la cuenta: si esta puerta no
  -- lo comprobara, apagarlos aquí sería apagarlos en todos los espacios de
  -- una vez, que es justo lo contrario de lo que la regla protege.
  if public.notification_event_is_mandatory(p_event_type)
     and (p_in_app is not true or p_email is not true or p_push is false) then
    raise exception 'Este aviso no se puede desactivar: es un vencimiento crítico o un impago grave';
  end if;

  insert into public.profile_notification_preferences (profile_id, event_type, in_app, email, push)
  values (auth.uid(), p_event_type, p_in_app, p_email, coalesce(p_push, true))
  on conflict (profile_id, event_type)
  do update set in_app = excluded.in_app,
                email = excluded.email,
                push = coalesce(p_push, public.profile_notification_preferences.push),
                updated_at = now();
end;
$$;

comment on function public.set_my_notification_preference(text, boolean, boolean, boolean) is
  'RN-GLO-06 · la persona ajusta sus avisos para todos sus contextos. Los
   obligatorios de RN-NOT-03 no se pueden apagar tampoco desde aquí.';

revoke all on function public.set_my_notification_preference(text, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.set_my_notification_preference(text, boolean, boolean, boolean)
  to authenticated;

-- El dictamen: qué preferencia gana para un aviso concreto. Existe como
-- función y no como un `left join` repetido para que haya UN solo sitio
-- donde se decide quién manda.
create or replace function public.effective_notification_preference(
  p_profile_id uuid,
  p_space_id uuid,
  p_event_type text
)
returns table (in_app boolean, email boolean, push boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(np.in_app, pp.in_app, true),
    coalesce(np.email, pp.email, true),
    coalesce(np.push, pp.push, true)
  from (select 1) z
  left join public.notification_preferences np
    on np.profile_id = p_profile_id
   and np.space_id = p_space_id
   and np.event_type = p_event_type
  left join public.profile_notification_preferences pp
    on pp.profile_id = p_profile_id
   and pp.event_type = p_event_type;
$$;

comment on function public.effective_notification_preference(uuid, uuid, text) is
  'RN-GLO-06 · quién manda: la preferencia del espacio si existe, si no la
   de la persona, si no todo encendido. Un solo sitio donde se decide.';

revoke all on function public.effective_notification_preference(uuid, uuid, text)
  from public, anon, authenticated;

-- `emit_notification()` se redefine para preguntar por ahí. Es lo MISMO
-- que hacía —un `left join` contra `notification_preferences`— con la
-- segunda capa detrás; el resto del cuerpo no cambia ni una línea.
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
  select e.in_app, e.email, e.push
  into v_in_app_enabled, v_email_enabled, v_push_enabled
  from public.effective_notification_preference(p_recipient_id, p_space_id, p_event_type) e;

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

-- Lo que la pantalla de la cuenta necesita: las preferencias que esta
-- persona ha tocado alguna vez. Las que no están valen "todo encendido",
-- que es el valor por omisión de `effective_notification_preference()`.
--
-- El catálogo de eventos NO se devuelve desde aquí a propósito: vive en el
-- CHECK de `notifications.event_type` y en `src/core/notifications.ts`, y
-- `listas-compartidas.test.ts` ya vigila que los dos no se separen. Una
-- tercera copia sería una tercera cosa que mantener.
create or replace function public.my_notification_preferences()
returns table (
  event_type text,
  in_app boolean,
  email boolean,
  push boolean,
  mandatory boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select pp.event_type,
         pp.in_app,
         pp.email,
         pp.push,
         public.notification_event_is_mandatory(pp.event_type)
  from public.profile_notification_preferences pp
  where pp.profile_id = auth.uid();
$$;

comment on function public.my_notification_preferences() is
  'RN-GLO-06 · las preferencias de aviso que esta persona ha tocado. Lo que
   no aparece está encendido; el catálogo de eventos lo pone la pantalla
   desde `src/core/notifications.ts`.';

revoke all on function public.my_notification_preferences() from public, anon;
grant execute on function public.my_notification_preferences() to authenticated;
