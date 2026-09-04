-- §66 · La bandeja de conversaciones del equipo.
--
-- Qué faltaba. Los tres tipos de conversación existen en la base de datos
-- desde la migración 20260830000025, pero solo uno tenía pantalla: la de
-- solicitud. La interna de trabajo (§66.2) y la general del
-- establecimiento (§66.3) se podían crear por RPC y nadie las veía nunca.
-- Y no había ninguna forma de preguntar "qué conversaciones tengo y
-- cuántos mensajes sin leer hay en cada una", que es lo que RN-MSG-03
-- ("propietario y administradores ven todas las conversaciones del
-- espacio; el trabajador solo las de establecimientos y trabajos
-- autorizados") y RN-MSG-06 ("se muestran los estados leído y no leído")
-- piden juntos.
--
-- Por qué es una función y no una consulta de la pantalla. Lo sin leer se
-- define contra `messages.sender_id` —"escrito por otra persona"— y esa
-- columna NO es legible con un SELECT normal: el REVOKE de la migración 25
-- se la quitó a todo el mundo para que el cliente no pueda distinguir
-- individualmente a nadie del equipo (CLAUDE.md MUST NOT). Así que el
-- contador no puede calcularse en el cliente ni en el servidor de Next:
-- solo aquí dentro, y sin devolver jamás la columna.

-- El índice que la bandeja necesita. `messages_conversation_id_idx`
-- (Hito 4) sirve para traer una conversación entera, pero la bandeja pide
-- el ÚLTIMO mensaje de cada una y ordena por él: sin la fecha en el
-- índice, cada carga recorre el hilo completo de cada conversación del
-- espacio. Los hilos solo crecen.
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

-- list_conversations — RN-MSG-03 · RN-MSG-06 · RN-MSG-04.
--
-- Qué filas devuelve NO lo decide esta función: lo decide
-- `can_read_conversation()`, la misma que sostiene la política de
-- `conversations`. Por eso un trabajador ve las de sus establecimientos y
-- trabajos autorizados y nada más, y por eso al cliente no le llega jamás
-- una `job_internal` (RN-MSG-04: esa comprobación exige
-- `is_space_member()`). Duplicar aquí ese filtro sería una segunda regla
-- que podría discrepar de la primera.
--
-- Qué columnas devuelve sí importa, y son las que no identifican a nadie:
-- el asunto de la conversación, la fecha y el principio del último
-- mensaje, y el rol —no la persona— de quien lo escribió. `sender_id` no
-- sale de aquí ni siquiera para el equipo: para eso está
-- `list_conversation_messages()`, que ya decide según quién pregunta.
create or replace function public.list_conversations(p_space_id uuid)
returns table (
  id uuid,
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
    c.type,
    est.id,
    est.name,
    c.request_id,
    r.code,
    c.job_id,
    j.code,
    ultimo.created_at,
    -- El principio del mensaje, no el mensaje: la bandeja es una lista.
    -- Se corta por caracteres y no por palabras a propósito; partir por
    -- palabras es una decisión de presentación y no se toma en SQL.
    left(btrim(ultimo.body), 140),
    ultimo.sender_role,
    sin_leer.total::integer,
    public.conversation_is_read_only(c.id)
  from public.conversations c
  -- El establecimiento sale de `conversation_establishment_id()`, que
  -- resuelve los tres tipos (la interna de trabajo lo hereda del trabajo).
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
    -- RN-MSG-06, la misma definición que `list_conversation_messages()`:
    -- sin leer = lo que escribió otra persona después de la última lectura
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
  where c.space_id = p_space_id
    and public.can_read_conversation(c.id)
  -- Una conversación recién creada y todavía sin mensajes existe y tiene
  -- que verse: es la que alguien acaba de abrir para escribir la primera
  -- vez. Va al final, no se esconde.
  order by ultimo.created_at desc nulls last;
$$;

comment on function public.list_conversations(uuid) is
  '§66 · la bandeja: las conversaciones del espacio que quien pregunta
   puede leer (RN-MSG-03, vía can_read_conversation) con sus mensajes sin
   leer (RN-MSG-06). No devuelve `sender_id` a nadie: la identidad de quien
   escribe sale solo de list_conversation_messages(), que decide según
   quién pregunta (RN-MSG-02, CLAUDE.md MUST NOT).';

-- `anon` no tiene bandeja: sin sesión, `auth.uid()` es null y la función no
-- tendría a quién responder. Se le quita el EXECUTE que Supabase concede
-- por defecto a toda función nueva (CLAUDE.md, verificado el 30/08/2026).
-- A `authenticated` se le deja: la función comprueba el permiso por su
-- cuenta en el WHERE, que es justo lo que la hace segura.
revoke all on function public.list_conversations(uuid) from public, anon;

-- ============================================================
-- list_conversation_messages — se le añade `is_mine`.
--
-- El fallo que arregla, y que no era pequeño: la pantalla decidía si un
-- mensaje era tuyo comparando `sender_id` con quien mira, y al restaurante
-- esta función le devuelve `sender_id` en null SIEMPRE —también en sus
-- propios mensajes—, porque solo se lo da a los miembros del espacio. Así
-- que para el restaurante ningún mensaje era suyo, y la etiqueta de autor
-- caía en su última rama: **sus propios mensajes aparecían firmados como
-- "Equipo de mantenimiento"**. Nadie lo vio antes porque las dos
-- pantallas que montaban una conversación lo hacían igual de mal.
--
-- La solución no es devolverle `sender_id` —eso es justo lo que CLAUDE.md
-- prohíbe—, sino contestar la pregunta que la pantalla necesita sin
-- revelar la columna: "¿lo escribiste tú?". Saber lo que uno mismo ha
-- escrito no identifica a nadie.
--
-- Y de paso hace posible RN-MSG-07 en el lado del restaurante: sin esto,
-- un cliente no podía ver el botón "Editar" de su propio mensaje dentro
-- de los 10 minutos, porque la pantalla no tenía forma de saber cuál era
-- suyo.
--
-- Cambia el tipo de retorno, así que hay que soltarla y volver a crearla:
-- `create or replace` no puede cambiar la forma de una tabla devuelta.
drop function public.list_conversation_messages(uuid);

create function public.list_conversation_messages(p_conversation_id uuid)
returns table (
  id uuid,
  body text,
  sender_role text,
  sender_display text,
  sender_id uuid,
  is_mine boolean,
  created_at timestamptz,
  edited_at timestamptz,
  edit_count integer,
  is_unread boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.body,
    m.sender_role,
    case
      when m.sender_role = 'client' then 'client'
      when public.is_space_member(m.space_id) then 'person'
      else 'maintenance_team'
    end as sender_display,
    case when public.is_space_member(m.space_id) then m.sender_id else null end as sender_id,
    -- Lo único que se añade. No es `sender_id` disfrazado: solo es cierto
    -- para quien pregunta, y quien pregunta ya sabía lo que escribió.
    (m.sender_id = auth.uid()) as is_mine,
    m.created_at,
    m.edited_at,
    m.edit_count,
    -- RN-MSG-06: sin leer = escrito por otra persona después de la
    -- última lectura registrada. Nunca lo propio.
    (
      m.sender_id <> auth.uid()
      and m.created_at > coalesce(
        (select r.last_read_at from public.conversation_reads r
         where r.conversation_id = m.conversation_id and r.user_id = auth.uid()),
        '-infinity'::timestamptz
      )
    ) as is_unread
  from public.messages m
  where m.conversation_id = p_conversation_id
    and public.can_read_conversation(p_conversation_id)
  order by m.created_at asc;
$$;

comment on function public.list_conversation_messages(uuid) is
  'RN-MSG-02 · HU-35 · CLAUDE.md MUST NOT: la única forma de leer quién
   escribió un mensaje, y decide según quién pregunta. Al equipo le
   devuelve la persona; al restaurante, `maintenance_team` y `sender_id`
   en null. `is_mine` contesta "¿lo escribiste tú?" sin revelar la
   columna, que es lo que la pantalla necesita para firmar tus mensajes
   como tuyos y para ofrecerte los 10 minutos de RN-MSG-07.';

-- Sin sesión no hay conversación que leer: `auth.uid()` sería null y
-- `can_read_conversation()` devolvería falso para todo. Se le quita a
-- `anon` el EXECUTE que Supabase concede por defecto a toda función nueva
-- —y que esta tenía desde el Hito 7— en vez de confiar en que la
-- comprobación de dentro la salve (CLAUDE.md).
revoke all on function public.list_conversation_messages(uuid) from public, anon;
