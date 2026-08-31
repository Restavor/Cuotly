-- Hito 7 · Mensajes, archivos y finanzas (PRD §16 RN-MSG, §19 RN-ARC,
-- §17 RN-FIN, §15.2 RN-EST-13; ROADMAP Hito 7).
--
-- La lógica de dominio pura vive en src/core/ y tiene sus tests unitarios:
--   · messages.ts           — ventana de edición, interlocutor visible,
--                             leído/no leído, separación de notas internas.
--   · files.ts              — categorías, versiones, visibilidad y límites.
--   · finance.ts            — impuestos, estado derivado del cobro, ciclo
--                             de impago, panel financiero y permisos.
--   · consumption-ledger.ts — bolsa restante del ciclo (HU-24) y lectura
--                             del libro de consumos (HU-25).
-- Este archivo guarda los datos y hace cumplir en el servidor exactamente
-- las mismas reglas (CLAUDE.md, MUST: "toda operación se valida en el
-- servidor; ocultar un botón NO es un control de acceso").
--
-- Tres decisiones de fondo, y por qué:
--
-- 1. **El estado de un cobro no se guarda.** RN-FIN-02 enumera seis
--    estados y RN-DAT-05 dice que los estados derivados se calculan a
--    partir de eventos. `financial_entries` es el libro inmutable de
--    apuntes con signo (CLAUDE.md MUST, RN-DAT-04) y `charge_status()` lo
--    deriva. No existe ninguna columna `charges.status` que pueda
--    desincronizarse de sus apuntes, igual que no existe ningún contador
--    de consumos desde el Hito 5.
--
-- 2. **Corregir un cobro es escribir el apunte contrario**, no editar el
--    anterior (RN-FIN-04 "corregir"): `reverse_payment()` añade un apunte
--    `payment_reversal` y marca el pago como revertido. Ninguna tabla de
--    este archivo tiene política de UPDATE sobre importes ni de DELETE.
--
-- 3. **Los contadores no guardan tiempo restante**, así que RN-FIN-13
--    ("los contadores continúan exactamente donde se pausaron") no
--    necesita ninguna aritmética especial: la pausa financiera escribe un
--    `paused` en `timer_events` y la reactivación un `resumed`. El tramo
--    pausado deja de existir para la suma de src/core/timer-events.ts, que
--    es la única definición de "tiempo consumido" del proyecto (CA-10).
--    Por eso `timer_events` y `state_events` ganan aquí una columna
--    `cause`: para saber, sin adivinar, qué pausas hay que reanudar al
--    cobrar y cuáles no eran financieras.
--
-- Lo que este hito **no** hace, a propósito:
--   · No genera mensualidades del servicio Menú Diario: el precio reducido
--     de RN-COM-08 depende de identificar el plan Premium, que el esquema
--     todavía no modela (los planes solo tienen nombre), y todo Menú
--     Diario es Fase 2. `generate_monthly_charge()` lo rechaza con un
--     mensaje explícito en vez de inventarse el precio.
--   · No emite facturas (RN-FIN-09): permite adjuntar la factura oficial
--     emitida fuera. La numeración fiscal está en el bloque legal
--     pendiente (CLAUDE.md, "no inventes lo que está pendiente").
--   · No decide un plazo de pago: el PRD no define ninguno, así que
--     `due_at` es un parámetro y su valor por defecto es la propia fecha
--     de renovación en la que se emite la mensualidad (RN-FIN-01).
--   · No implementa la cuota de almacenamiento de RN-ARC-09 (20/100 GB):
--     depende de las suscripciones Pro/Agency, que son Fase 4.
--   · No hay pantallas todavía, igual que en los Hitos 5 y 6: este hito
--     entrega el servidor y el dominio. Los textos visibles nuevos ya
--     están en src/i18n/es.ts para que ninguna pantalla futura invente
--     literales.

-- ============================================================
-- Capacidades nuevas y tipo impositivo del espacio.
--
--   · 'manage_finance' — emitir, confirmar, corregir, perdonar y
--     reembolsar cobros, y ver el panel financiero (RN-FIN-04). Propietario
--     y administrador. **El trabajador no**: CA-03 ("un trabajador no puede
--     ver finanzas globales") y RN-FIN-05. Lo único que el trabajador hace
--     es marcar "Pagado" en un establecimiento asignado, y eso lo autoriza
--     `register_payment()` por su cuenta, sin capacidad global.
--   · 'manage_files'   — compartir con el restaurante un archivo interno,
--     archivarlo y solicitar su borrado definitivo (RN-ARC-04/07).
-- ============================================================
alter table public.spaces
  add column tax_rate_percent numeric(5, 2) not null default 21;

comment on column public.spaces.tax_rate_percent is
  'RN-FIN-08: "Restavor usa IVA 21 %; otros espacios configuran el suyo."
   Es del espacio, no del plan: un mismo plan facturado por dos espacios
   lleva el impuesto de cada uno.';

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
    -- Hito 7:
    when 'manage_finance' then v_role in ('owner', 'admin')
    when 'manage_files' then v_role in ('owner', 'admin', 'worker')
    else false
  end;
end;
$$;

-- ============================================================
-- §66 · Los tres tipos de conversación.
--
-- El Hito 4 creó `conversations` con un CHECK de un solo valor y dejó
-- escrito que los otros dos llegarían "ampliando este CHECK con una
-- migración nueva, nunca editando esta". Esto es esa migración.
-- ============================================================
alter table public.conversations
  drop constraint conversations_type_check;

alter table public.conversations
  add column job_id uuid references public.jobs (id) on delete cascade,
  add column establishment_id uuid references public.establishments (id) on delete cascade,
  add constraint conversations_type_check
    check (type in ('request', 'job_internal', 'establishment')),
  -- Cada tipo apunta exactamente a su dueño y a nada más: una conversación
  -- interna de trabajo sin trabajo, o con establecimiento además, sería
  -- una fila ambigua sobre quién puede leerla — y quién puede leerla es
  -- precisamente lo que separa RN-MSG-03 de RN-MSG-04.
  add constraint conversations_owner_by_type check (
    (type = 'request' and request_id is not null and job_id is null and establishment_id is null)
    or (type = 'job_internal' and job_id is not null and request_id is null and establishment_id is null)
    or (type = 'establishment' and establishment_id is not null and request_id is null and job_id is null)
  );

create unique index conversations_job_id_idx on public.conversations (job_id) where job_id is not null;
create unique index conversations_establishment_id_idx
  on public.conversations (establishment_id) where establishment_id is not null;

comment on table public.conversations is
  '§66: los tres tipos de conversación. De solicitud (información,
   aclaraciones y archivos de una solicitud), interna de trabajo
   (coordinación del equipo — el cliente no la ve nunca, RN-MSG-04) y
   general del establecimiento (lo que todavía no es una solicitud, y que
   puede convertirse en una con convert_conversation_to_request()).';

-- conversation_establishment_id: ahora resuelve los tres tipos. Misma
-- firma, así que las políticas del Hito 4 que ya la usan siguen valiendo.
create or replace function public.conversation_establishment_id(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case c.type
    when 'request' then public.request_establishment_id(c.request_id)
    when 'job_internal' then (select j.establishment_id from public.jobs j where j.id = c.job_id)
    else c.establishment_id
  end
  from public.conversations c
  where c.id = p_conversation_id;
$$;

-- RN-MSG-03: "propietario y administradores ven todas las conversaciones
-- del espacio; el trabajador solo las de establecimientos y trabajos
-- autorizados." RN-MSG-04: la interna de trabajo no llega al cliente
-- jamás, y esa es la razón de que este helper mire el tipo antes que nada.
create or replace function public.can_read_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
  v_space_id uuid;
  v_job_id uuid;
  v_establishment_id uuid;
begin
  select c.type, c.space_id, c.job_id into v_type, v_space_id, v_job_id
  from public.conversations c where c.id = p_conversation_id;

  if v_type is null then
    return false;
  end if;

  if public.has_capability(v_space_id, 'manage_requests') then
    return true;
  end if;

  if v_type = 'job_internal' then
    -- is_space_member() es la barrera contra el cliente: can_read_job()
    -- incluye al restaurante a propósito (ve el estado de su trabajo),
    -- pero la conversación interna es del equipo (§66.2).
    return public.is_space_member(v_space_id) and public.can_read_job(v_job_id);
  end if;

  v_establishment_id := public.conversation_establishment_id(p_conversation_id);

  return public.can_read_establishment_as_client(v_establishment_id)
    or public.is_authorized_worker_establishment(v_establishment_id);
end;
$$;

-- RN-MSG-05: "Consulta puede leer, pero no responder". Quien escribe del
-- lado cliente es quien puede escribir en el establecimiento; del lado
-- equipo, quien puede leer la conversación (un trabajador autorizado
-- participa en la conversación de su establecimiento y en la interna de
-- su trabajo, RN-MSG-03).
create or replace function public.can_write_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
  v_space_id uuid;
  v_establishment_id uuid;
begin
  select c.type, c.space_id into v_type, v_space_id
  from public.conversations c where c.id = p_conversation_id;

  if v_type is null then
    return false;
  end if;

  if public.is_space_member(v_space_id) then
    return public.can_read_conversation(p_conversation_id);
  end if;

  if v_type = 'job_internal' then
    return false;
  end if;

  v_establishment_id := public.conversation_establishment_id(p_conversation_id);
  return public.can_write_establishment(v_establishment_id);
end;
$$;

drop policy conversations_select on public.conversations;

create policy conversations_select on public.conversations
for select
using (public.can_read_conversation(id));

-- get_or_create_job_conversation / get_or_create_establishment_conversation:
-- mismo patrón que get_or_create_request_conversation() del Hito 4 (sin
-- política de INSERT en la tabla; solo estas funciones la escriben), pero
-- con comprobación de permiso propia, porque a estas sí las llama la capa
-- de aplicación directamente y no otra función que ya validó.
create or replace function public.get_or_create_job_conversation(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_space_id uuid;
begin
  select space_id into v_space_id from public.jobs where id = p_job_id;
  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not (public.is_space_member(v_space_id) and public.can_read_job(p_job_id)) then
    raise exception 'No tienes acceso a la conversación interna de este trabajo';
  end if;

  select id into v_conversation_id from public.conversations where job_id = p_job_id;
  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (space_id, type, job_id)
  values (v_space_id, 'job_internal', p_job_id)
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

create or replace function public.get_or_create_establishment_conversation(p_establishment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_space_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not (
    public.can_read_establishment_as_client(p_establishment_id)
    or public.has_capability(v_space_id, 'manage_requests')
    or public.is_authorized_worker_establishment(p_establishment_id)
  ) then
    raise exception 'No tienes acceso a la conversación de este establecimiento';
  end if;

  select id into v_conversation_id from public.conversations where establishment_id = p_establishment_id;
  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (space_id, type, establishment_id)
  values (v_space_id, 'establishment', p_establishment_id)
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

-- ============================================================
-- Mensajes: edición de 10 minutos con versión anterior conservada
-- (RN-MSG-07), sin eliminación nunca (RN-MSG-08), leído/no leído
-- (RN-MSG-06) y el interlocutor que ve el cliente (RN-MSG-02, HU-35).
-- ============================================================
alter table public.messages
  add column edited_at timestamptz,
  add column edit_count integer not null default 0 check (edit_count >= 0),
  add column idempotency_key text;

comment on column public.messages.edit_count is
  'RN-MSG-07: en cuanto vale más de 0, la interfaz muestra la marca
   "Editado". La versión anterior está en message_edits — editar nunca
   pierde lo que se dijo antes (P4).';

-- CLAUDE.md MUST NOT: "mostrar al cliente el nombre, foto o identidad
-- individual de nadie del equipo de mantenimiento". Eso no puede quedar en
-- manos de la interfaz: RLS filtra filas, no columnas, así que mientras
-- `sender_id` fuera legible por cualquiera con acceso a la fila, el
-- cliente podía distinguir a las personas del equipo (aunque no pudiera
-- resolver sus nombres, porque profiles_select no se lo permite: un uuid
-- estable ya identifica individualmente).
--
-- El Hito 6 resolvió el mismo problema en `jobs` con una vista barrera
-- (`client_jobs`), pero aquí no sirve: desde el Hito 4 el cliente lee
-- `public.messages` directamente para ver el cuerpo de los mensajes de su
-- solicitud, y quitarle ese acceso rompería un contrato ya en uso. El
-- privilegio de columna es el único mecanismo que conserva esa lectura y
-- esconde exactamente la columna que sobra.
--
-- Se quita el privilegio a nivel de columna, para todos: nadie lee
-- `sender_id` con un SELECT normal. Quien necesita saber quién escribió
-- (el equipo, §15 "internamente, Cuotly registra quién realizó cada
-- acción") lo obtiene de list_conversation_messages(), que decide según
-- quién pregunta.
revoke select on public.messages from anon, authenticated;
grant select (id, conversation_id, space_id, sender_role, body, created_at, edited_at, edit_count)
  on public.messages to authenticated;

-- RN-COR-08 (PRD §13) y §67 de la especificación maestra: "al terminar la
-- ventana de corrección, la conversación de esa solicitud pasa a solo
-- lectura. Una necesidad nueva exige una solicitud nueva."
--
-- Son dos formas de que se acabe la misma conversación y las dos cuentan:
-- el Hito 6 la cerraba cuando la solicitud llegaba a un estado terminal
-- (cerrada, rechazada o cancelada); aquí se añade la otra mitad literal de
-- la regla, la ventana de corrección vencida, que puede cerrarse antes de
-- que nadie mueva el estado de la solicitud.
--
-- La ventana la calculó publish_job() con el reloj laborable en el Hito 6
-- (RN-COR-02) y está guardada en jobs.correction_window_ends_at: aquí solo
-- se compara, nunca se recalcula — el reloj tiene un único dueño
-- (src/core/business-clock.ts).
create or replace function public.conversation_is_read_only(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      public.request_state(c.request_id) in (
        'closed', 'rejected', 'cancelled_before_start', 'cancelled_after_start'
      )
      or coalesce((
        select j.correction_window_ends_at is not null and now() > j.correction_window_ends_at
        from public.jobs j where j.request_id = c.request_id
      ), false)
    from public.conversations c
    where c.id = p_conversation_id and c.type = 'request'
  ), false);
$$;

drop policy messages_select on public.messages;

create policy messages_select on public.messages
for select
using (public.can_read_conversation(conversation_id));

drop policy messages_insert on public.messages;

create policy messages_insert on public.messages
for insert
with check (
  sender_id = auth.uid()
  and space_id = public.conversation_space_id(conversation_id)
  and public.can_write_conversation(conversation_id)
  -- RN-COR-08: la conversación de una solicitud cerrada, rechazada,
  -- cancelada o con la ventana de corrección vencida es de solo lectura
  -- para todos, equipo incluido. Lo ya escrito no se toca (RN-MSG-08).
  and not public.conversation_is_read_only(conversation_id)
  -- El rol declarado tiene que coincidir con el lado real de quien
  -- escribe: si no, un cliente podría publicar un mensaje que la interfaz
  -- presentaría como del "Equipo de mantenimiento" (RN-MSG-02 al revés).
  and (
    (sender_role = 'staff' and public.is_space_member(space_id))
    or (sender_role = 'client' and not public.is_space_member(space_id))
  )
);

-- Sin política de UPDATE ni de DELETE, a propósito: RN-MSG-08 ("los
-- mensajes no se eliminan nunca") y RN-MSG-07 (la edición tiene ventana,
-- autor y versión anterior) — editar pasa por edit_message(), nunca por un
-- UPDATE directo.

create or replace function public.message_conversation_id(p_message_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select conversation_id from public.messages where id = p_message_id;
$$;

create table public.message_edits (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  version integer not null check (version >= 1),
  previous_body text not null,
  edited_by uuid not null references public.profiles (id),
  edited_at timestamptz not null default now(),
  unique (message_id, version)
);

comment on table public.message_edits is
  'RN-MSG-07/RN-DAT-07: "se conserva la versión anterior". Libro inmutable
   como state_events o timer_events: solo SELECT, y solo lo escribe
   edit_message().';

alter table public.message_edits enable row level security;

create index message_edits_message_id_idx on public.message_edits (message_id);

create policy message_edits_select on public.message_edits
for select
using (public.can_read_conversation(public.message_conversation_id(message_id)));

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

comment on table public.conversation_reads is
  'RN-MSG-06: hasta dónde ha leído cada persona una conversación. Es la
   única tabla de este hito que se actualiza con UPDATE, y puede: no es un
   dato de negocio ni un apunte contable, es una marca personal de lectura
   (CLAUDE.md prohíbe el contador mutable para consumos y movimientos
   financieros, que aquí no intervienen).';

alter table public.conversation_reads enable row level security;

create policy conversation_reads_select on public.conversation_reads
for select
using (user_id = auth.uid());

create policy conversation_reads_insert on public.conversation_reads
for insert
with check (user_id = auth.uid() and public.can_read_conversation(conversation_id));

create policy conversation_reads_update on public.conversation_reads
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- post_message — HU-13, HU-35 y §66. Escribe con el rol correcto según de
-- qué lado está quien llama, respeta la ventana de solo lectura de §67 y
-- es idempotente (RN-DAT-09: "pulsar dos veces nunca duplica el efecto",
-- aquí, nunca publica el mismo mensaje dos veces).
create or replace function public.post_message(
  p_conversation_id uuid,
  p_body text,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_type text;
  v_sender_role text;
  v_message_id uuid;
  v_read_only boolean;
begin
  select c.space_id, c.type into v_space_id, v_type
  from public.conversations c where c.id = p_conversation_id;

  if v_space_id is null then
    raise exception 'Conversación no encontrada';
  end if;

  if not public.can_write_conversation(p_conversation_id) then
    raise exception 'No puedes escribir en esta conversación';
  end if;

  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  select public.conversation_is_read_only(p_conversation_id) into v_read_only;
  if v_read_only then
    raise exception 'Esta conversación es de solo lectura: la ventana de corrección ya se cerró';
  end if;

  if p_idempotency_key is not null then
    select id into v_message_id from public.messages
    where conversation_id = p_conversation_id and idempotency_key = p_idempotency_key;
    if v_message_id is not null then
      return v_message_id;
    end if;
  end if;

  v_sender_role := case when public.is_space_member(v_space_id) then 'staff' else 'client' end;

  insert into public.messages (conversation_id, space_id, sender_id, sender_role, body, idempotency_key)
  values (p_conversation_id, v_space_id, auth.uid(), v_sender_role, btrim(p_body), p_idempotency_key)
  returning id into v_message_id;

  return v_message_id;
end;
$$;

-- edit_message — RN-MSG-07: 10 minutos, solo el autor, la versión anterior
-- se conserva y el mensaje queda marcado como editado. RN-MSG-08 sigue
-- valiendo: no hay forma de borrarlo, ni aquí ni por RLS.
create or replace function public.edit_message(p_message_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid;
  v_space_id uuid;
  v_conversation_id uuid;
  v_created_at timestamptz;
  v_body text;
  v_edit_count integer;
begin
  select sender_id, space_id, conversation_id, created_at, body, edit_count
  into v_sender_id, v_space_id, v_conversation_id, v_created_at, v_body, v_edit_count
  from public.messages where id = p_message_id
  for update;

  if v_sender_id is null then
    raise exception 'Mensaje no encontrado';
  end if;

  if v_sender_id <> auth.uid() then
    raise exception 'Solo puedes editar tus propios mensajes';
  end if;

  if public.conversation_is_read_only(v_conversation_id) then
    raise exception 'Esta conversación es de solo lectura: la ventana de corrección ya se cerró';
  end if;

  -- RN-MSG-07: 10 minutos naturales. No es un plazo contractual, así que
  -- no pasa por el reloj laborable (RN-CLK) a propósito.
  if now() > v_created_at + interval '10 minutes' then
    raise exception 'La ventana de edición de 10 minutos ya se cerró';
  end if;

  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  insert into public.message_edits (message_id, space_id, version, previous_body, edited_by)
  values (p_message_id, v_space_id, v_edit_count + 1, v_body, auth.uid());

  update public.messages
  set body = btrim(p_body),
      edited_at = now(),
      edit_count = v_edit_count + 1
  where id = p_message_id;
end;
$$;

-- mark_conversation_read — RN-MSG-06.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  if not public.can_read_conversation(p_conversation_id) then
    raise exception 'No tienes acceso a esta conversación';
  end if;

  select space_id into v_space_id from public.conversations where id = p_conversation_id;

  insert into public.conversation_reads (conversation_id, user_id, space_id, last_read_at)
  values (p_conversation_id, auth.uid(), v_space_id, now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
end;
$$;

-- list_conversation_messages — RN-MSG-02 · HU-35 · CLAUDE.md MUST NOT.
--
-- Es la única forma de leer quién escribió un mensaje, y decide según
-- quién pregunta: al equipo le devuelve la persona; al cliente, el
-- interlocutor "Equipo de mantenimiento" (`sender_display = 'maintenance_team'`)
-- y `sender_id` en null. No es una cortesía de la interfaz: `sender_id` ni
-- siquiera es legible con un SELECT (ver el REVOKE de más arriba), así que
-- no hay ninguna consulta que devuelva al cliente la identidad individual
-- de nadie del equipo.
--
-- `sender_display` es un identificador para el diccionario de i18n
-- (src/i18n/es.ts: space.messages.maintenanceTeam), nunca un texto en
-- español: en la base de datos no se guardan literales de interfaz.
create or replace function public.list_conversation_messages(p_conversation_id uuid)
returns table (
  id uuid,
  body text,
  sender_role text,
  sender_display text,
  sender_id uuid,
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

-- ============================================================
-- internal_notes — RN-MSG-04 ("las notas internas están estrictamente
-- separadas de los mensajes con el cliente. Un fallo aquí es un fallo
-- grave") y RN-EST-13.
--
-- La separación es estructural: otra tabla, sin ninguna política que
-- alcance al cliente. No es un mensaje con una marca `internal` que un
-- error de filtro pudiera dejar escapar a una lista de mensajes.
-- ============================================================
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete cascade,
  -- RN-EST-13: "los trabajadores solo las notas operativas de sus
  -- establecimientos autorizados" — la propia regla nombra las dos clases.
  kind text not null default 'operational' check (kind in ('operational', 'management')),
  body text not null check (length(btrim(body)) > 0),
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.internal_notes is
  'RN-MSG-04 y RN-EST-13. Sin política de UPDATE ni de DELETE: una nota
   interna es historial del espacio (P4), no un borrador.';

alter table public.internal_notes enable row level security;

create index internal_notes_establishment_idx on public.internal_notes (establishment_id, created_at);
create index internal_notes_job_idx on public.internal_notes (job_id) where job_id is not null;

create policy internal_notes_select on public.internal_notes
for select
using (
  public.has_capability(space_id, 'manage_requests')
  or (kind = 'operational' and public.is_authorized_worker_establishment(establishment_id))
);

create policy internal_notes_insert on public.internal_notes
for insert
with check (
  author_id = auth.uid()
  and space_id = public.establishment_space_id(establishment_id)
  and (
    public.has_capability(space_id, 'manage_requests')
    or (kind = 'operational' and public.is_authorized_worker_establishment(establishment_id))
  )
);

-- ============================================================
-- Archivos (PRD §19 RN-ARC). Catálogo único con versiones, marca
-- interno/compartido y enlaces al elemento con el que se relacionan.
--
-- `request_attachments` (Hito 4) no se toca ni se vacía —el Hito 4 la usa
-- para los adjuntos de un borrador de solicitud y sus tests dependen de
-- ella—, pero deja de ser un almacén paralelo: un disparador vuelca cada
-- adjunto nuevo en este catálogo, y las filas anteriores se vuelcan al
-- aplicar esta migración. Así "los archivos de este establecimiento" se
-- responde en un solo sitio (RN-ARC-02), sin borrar nada (CLAUDE.md MUST NOT).
-- ============================================================
create table public.files (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- RN-ARC-01: las ocho categorías, sin inventar ninguna más.
  category text not null check (category in (
    'logos', 'photos', 'menus', 'documents', 'reports', 'billing', 'requests_and_jobs', 'other'
  )),
  -- RN-ARC-04: todo archivo está marcado como una de las dos cosas.
  visibility text not null default 'internal' check (visibility in ('internal', 'shared_with_client')),
  name text not null check (length(btrim(name)) > 0),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  -- RN-ARC-07: "solo el propietario puede **solicitar** borrado
  -- definitivo". Solicitarlo no lo ejecuta: ninguna función de Cuotly
  -- borra la fila (CLAUDE.md MUST NOT).
  deletion_requested_at timestamptz,
  deletion_requested_by uuid references public.profiles (id),
  deletion_reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.files is
  'RN-ARC-02: "cada archivo registra nombre, categoría, espacio, grupo,
   establecimiento, elemento relacionado, usuario, fecha, tamaño y
   formato" — el elemento relacionado está en file_links y el tamaño y el
   formato en file_versions, porque pertenecen a la versión concreta, no
   al archivo.';

alter table public.files enable row level security;

create index files_establishment_idx on public.files (establishment_id, category);

create table public.file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  storage_path text not null,
  file_name text not null,
  -- RN-ARC-06 / RN-MSG-09: lista blanca. Lo que no está aquí no entra —
  -- ni vídeos ni ejecutables. Misma lista que src/core/files.ts y que
  -- request_attachments desde el Hito 4.
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  )),
  -- RN-ARC-06: máximo 25 MB por archivo.
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  -- RN-ARC-03: "en fotografía se separan original, retocada y publicada".
  variant text check (variant in ('original', 'retouched', 'published')),
  -- §111: detección de duplicados binarios. Se guarda si quien sube lo
  -- calcula; no se inventa nada cuando falta.
  checksum text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (file_id, version_number)
);

comment on table public.file_versions is
  'RN-ARC-03: "sustituir un archivo crea una versión nueva; la anterior
   permanece". Sin política de UPDATE ni de DELETE: una versión publicada
   es historial (P4).';

alter table public.file_versions enable row level security;

create index file_versions_file_idx on public.file_versions (file_id, version_number desc);

create table public.file_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  entity_type text not null check (entity_type in (
    'message', 'request', 'job', 'charge', 'payment', 'establishment'
  )),
  entity_id uuid not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (file_id, entity_type, entity_id)
);

comment on table public.file_links is
  'RN-ARC-02 ("elemento relacionado") y RN-ARC-07: es esta tabla la que
   decide si un archivo está "vinculado a operación, factura, aceptación o
   registro obligatorio" y por tanto no admite solicitud de borrado.';

alter table public.file_links enable row level security;

create index file_links_entity_idx on public.file_links (entity_type, entity_id);

-- RN-FIN-07: quién, del lado cliente, ve facturación. Consulta nunca; el
-- Editor solo con el permiso `view_billing`; los propietarios siempre.
create or replace function public.client_can_view_billing(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id and gm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.establishment_memberships em
      left join public.establishment_permissions ep on ep.establishment_membership_id = em.id
      where em.establishment_id = p_establishment_id
        and em.user_id = auth.uid()
        and (em.role = 'local_owner' or (em.role = 'editor' and coalesce(ep.view_billing, false)))
    );
$$;

-- Quién puede ver la facturación de un establecimiento, de los dos lados.
-- El trabajador **no aparece**: RN-ARC-05 y CA-03 dicen "nunca".
create or replace function public.can_read_billing(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_capability(public.establishment_space_id(p_establishment_id), 'manage_finance')
    or public.client_can_view_billing(p_establishment_id);
$$;

-- RN-ARC-05 + §110: quién ve un archivo. Mismo reparto que
-- src/core/files.ts `canViewFile()`.
create or replace function public.can_read_file(p_file_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_category text;
  v_visibility text;
begin
  select space_id, establishment_id, category, visibility
  into v_space_id, v_establishment_id, v_category, v_visibility
  from public.files where id = p_file_id;

  if v_space_id is null then
    return false;
  end if;

  -- Propietario y administradores: todo el espacio (§110).
  if public.has_capability(v_space_id, 'manage_requests') then
    return true;
  end if;

  -- Trabajador: archivos operativos de sus establecimientos autorizados, y
  -- **nunca** facturación (RN-ARC-05, CA-03). Ni siquiera el justificante
  -- que él mismo adjuntó al marcar un cobro como pagado: RN-FIN-05 le deja
  -- adjuntarlo, RN-ARC-05 no le deja verlo después, y entre "puede
  -- adjuntar" y "nunca ve facturación" gana la prohibición explícita.
  if public.is_space_member(v_space_id) then
    return v_category <> 'billing' and public.is_authorized_worker_establishment(v_establishment_id);
  end if;

  -- Cliente: solo lo marcado "Compartido con el restaurante" (RN-ARC-04),
  -- y la facturación solo con visibilidad financiera (RN-FIN-07).
  if v_visibility <> 'shared_with_client' then
    return false;
  end if;

  if v_category = 'billing' then
    return public.client_can_view_billing(v_establishment_id);
  end if;

  return public.can_read_establishment_as_client(v_establishment_id);
end;
$$;

create policy files_select on public.files
for select
using (public.can_read_file(id));

create policy file_versions_select on public.file_versions
for select
using (public.can_read_file(file_id));

create policy file_links_select on public.file_links
for select
using (public.can_read_file(file_id));

-- Ninguna de las tres tablas tiene política de INSERT/UPDATE/DELETE: todo
-- pasa por las funciones de abajo, que son las que comprueban categoría,
-- visibilidad y permiso. Un INSERT directo podría crear un archivo de
-- facturación marcado como compartido en un establecimiento ajeno.

create or replace function public.file_current_version(p_file_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(version_number), 0) from public.file_versions where file_id = p_file_id;
$$;

-- Quién puede subir o sustituir un archivo de un establecimiento.
create or replace function public.can_write_file(p_establishment_id uuid, p_category text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
begin
  if v_space_id is null then
    return false;
  end if;

  if public.is_space_member(v_space_id) then
    if p_category = 'billing' then
      -- RN-ARC-05/CA-03: la facturación es cosa de quien gestiona finanzas.
      return public.has_capability(v_space_id, 'manage_finance');
    end if;
    return public.has_capability(v_space_id, 'manage_requests')
      or public.is_authorized_worker_establishment(p_establishment_id);
  end if;

  -- Lado cliente: quien puede escribir en el establecimiento (RN-MSG-05
  -- deja fuera a Consulta). Para un justificante de pago (RN-FIN-06) hace
  -- falta además visibilidad financiera (RN-FIN-07).
  if p_category = 'billing' then
    return public.can_write_establishment(p_establishment_id) and public.client_can_view_billing(p_establishment_id);
  end if;

  return public.can_write_establishment(p_establishment_id);
end;
$$;

-- register_file — RN-ARC-02/04/06. Crea el archivo con su primera versión.
create or replace function public.register_file(
  p_establishment_id uuid,
  p_category text,
  p_name text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_visibility text default 'internal',
  p_variant text default null,
  p_checksum text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_group_id uuid;
  v_visibility text := p_visibility;
  v_file_id uuid;
begin
  select space_id, group_id into v_space_id, v_group_id
  from public.establishments where id = p_establishment_id;

  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.can_write_file(p_establishment_id, p_category) then
    raise exception 'No tienes permiso para subir archivos de esta categoría a este establecimiento';
  end if;

  -- Lo que sube el restaurante es suyo: marcarlo "interno" lo escondería
  -- de quien lo subió (RN-ARC-04 describe la marca desde el punto de vista
  -- del equipo, no del cliente).
  if not public.is_space_member(v_space_id) then
    v_visibility := 'shared_with_client';
  end if;

  insert into public.files (space_id, group_id, establishment_id, category, visibility, name, created_by)
  values (v_space_id, v_group_id, p_establishment_id, p_category, v_visibility, p_name, auth.uid())
  returning id into v_file_id;

  insert into public.file_versions
    (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, variant, checksum, created_by)
  values
    (v_file_id, v_space_id, 1, p_storage_path, p_file_name, p_mime_type, p_size_bytes, p_variant, p_checksum, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'file.registered', 'file', v_file_id,
          jsonb_build_object('category', p_category, 'visibility', v_visibility, 'establishment_id', p_establishment_id));

  return v_file_id;
end;
$$;

-- add_file_version — RN-ARC-03: sustituir crea una versión nueva; la
-- anterior permanece. El número lo decide el servidor, no quien llama.
create or replace function public.add_file_version(
  p_file_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_variant text default null,
  p_checksum text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_category text;
  v_version integer;
begin
  select space_id, establishment_id, category into v_space_id, v_establishment_id, v_category
  from public.files where id = p_file_id
  for update;

  if v_space_id is null then
    raise exception 'Archivo no encontrado';
  end if;

  if not public.can_write_file(v_establishment_id, v_category) then
    raise exception 'No tienes permiso para sustituir este archivo';
  end if;

  v_version := public.file_current_version(p_file_id) + 1;

  insert into public.file_versions
    (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, variant, checksum, created_by)
  values
    (p_file_id, v_space_id, v_version, p_storage_path, p_file_name, p_mime_type, p_size_bytes, p_variant, p_checksum, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'file.version_added', 'file', p_file_id,
          jsonb_build_object('version', v_version - 1), jsonb_build_object('version', v_version));

  return v_version;
end;
$$;

-- share_file_with_client — RN-ARC-04: "un trabajador puede compartir
-- después uno interno, y queda auditado".
create or replace function public.share_file_with_client(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_visibility text;
begin
  select space_id, visibility into v_space_id, v_visibility
  from public.files where id = p_file_id
  for update;

  if v_space_id is null then
    raise exception 'Archivo no encontrado';
  end if;

  -- can_read_file() ya deja fuera al trabajador para la facturación
  -- (RN-ARC-05) y a cualquiera sin acceso al establecimiento.
  if not (public.has_capability(v_space_id, 'manage_files') and public.can_read_file(p_file_id)) then
    raise exception 'No tienes permiso para compartir este archivo con el restaurante';
  end if;

  if v_visibility = 'shared_with_client' then
    return; -- Idempotente: ya estaba compartido.
  end if;

  update public.files set visibility = 'shared_with_client' where id = p_file_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'file.shared_with_client', 'file', p_file_id,
          jsonb_build_object('visibility', v_visibility),
          jsonb_build_object('visibility', 'shared_with_client'));
end;
$$;

-- link_file — uso interno: enlaza un archivo con el elemento del que
-- cuelga. Sin comprobación propia (mismo principio que record_state_event()
-- del Hito 6): solo la llaman funciones de este archivo que ya validaron.
create or replace function public.link_file(
  p_file_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.file_links (file_id, space_id, entity_type, entity_id, created_by)
  select p_file_id, f.space_id, p_entity_type, p_entity_id, p_actor_id
  from public.files f where f.id = p_file_id
  on conflict (file_id, entity_type, entity_id) do nothing;
end;
$$;

-- attach_file_to_message — HU-35: el restaurante conversa **y adjunta
-- archivos**. Solo el autor del mensaje, y solo con un archivo que pueda
-- ver (nadie adjunta a un hilo un archivo ajeno para hacérselo visible a
-- quien lea el hilo).
create or replace function public.attach_file_to_message(p_message_id uuid, p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid;
  v_conversation_id uuid;
  v_message_establishment uuid;
  v_file_establishment uuid;
begin
  select sender_id, conversation_id into v_sender_id, v_conversation_id
  from public.messages where id = p_message_id;

  if v_sender_id is null then
    raise exception 'Mensaje no encontrado';
  end if;

  if v_sender_id <> auth.uid() then
    raise exception 'Solo puedes adjuntar archivos a tus propios mensajes';
  end if;

  if not public.can_read_file(p_file_id) then
    raise exception 'No tienes acceso a ese archivo';
  end if;

  v_message_establishment := public.conversation_establishment_id(v_conversation_id);
  select establishment_id into v_file_establishment from public.files where id = p_file_id;

  if v_message_establishment is distinct from v_file_establishment then
    raise exception 'El archivo pertenece a otro establecimiento';
  end if;

  perform public.link_file(p_file_id, 'message', p_message_id, auth.uid());
end;
$$;

-- archive_file — RN-ARC-07: "el resto se archiva, no se borra"; los
-- adjuntos de mensajes ni eso.
create or replace function public.archive_file(p_file_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select space_id into v_space_id from public.files where id = p_file_id for update;

  if v_space_id is null then
    raise exception 'Archivo no encontrado';
  end if;

  if not (public.has_capability(v_space_id, 'manage_files') and public.can_read_file(p_file_id)) then
    raise exception 'No tienes permiso para archivar este archivo';
  end if;

  if exists (select 1 from public.file_links where file_id = p_file_id and entity_type = 'message') then
    raise exception 'Los adjuntos de mensajes no se archivan ni se eliminan';
  end if;

  update public.files set archived_at = now(), archived_by = auth.uid()
  where id = p_file_id and archived_at is null;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_space_id, auth.uid(), 'file.archived', 'file', p_file_id,
          jsonb_build_object('archived', true), p_reason);
end;
$$;

-- request_file_permanent_deletion — RN-ARC-07. Deja constancia de la
-- solicitud; no borra nada, ni aquí ni en ningún otro sitio del proyecto.
create or replace function public.request_file_permanent_deletion(p_file_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_links text[];
begin
  select space_id into v_space_id from public.files where id = p_file_id for update;

  if v_space_id is null then
    raise exception 'Archivo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede solicitar el borrado definitivo de un archivo';
  end if;

  select array_agg(distinct entity_type) into v_links from public.file_links where file_id = p_file_id;

  if v_links is not null then
    raise exception 'El archivo está vinculado a un registro obligatorio (%) y no admite borrado definitivo',
      array_to_string(v_links, ', ');
  end if;

  update public.files
  set deletion_requested_at = now(), deletion_requested_by = auth.uid(), deletion_reason = p_reason
  where id = p_file_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_space_id, auth.uid(), 'file.deletion_requested', 'file', p_file_id,
          jsonb_build_object('deletion_requested', true), p_reason);
end;
$$;

-- Volcado de los adjuntos de solicitud (Hito 4) al catálogo, para que
-- "los archivos de este establecimiento" tenga una sola respuesta.
create or replace function public.mirror_request_attachment_to_catalogue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_file_id uuid;
begin
  select group_id into v_group_id from public.establishments where id = new.establishment_id;

  insert into public.files
    (space_id, group_id, establishment_id, category, visibility, name, created_by, created_at)
  values
    (new.space_id, v_group_id, new.establishment_id, 'requests_and_jobs', 'shared_with_client',
     new.file_name, new.created_by, new.created_at)
  returning id into v_file_id;

  insert into public.file_versions
    (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, created_by, created_at)
  values
    (v_file_id, new.space_id, 1, new.storage_path, new.file_name, new.mime_type, new.size_bytes,
     new.created_by, new.created_at);

  insert into public.file_links (file_id, space_id, entity_type, entity_id, created_by, created_at)
  values (v_file_id, new.space_id, 'request', new.request_id, new.created_by, new.created_at);

  return new;
end;
$$;

create trigger request_attachments_mirror_to_catalogue
  after insert on public.request_attachments
  for each row execute function public.mirror_request_attachment_to_catalogue();

-- Filas anteriores a esta migración (en un proyecto recién creado no hay
-- ninguna; el volcado existe para los que ya venían del Hito 4).
with volcado as (
  insert into public.files
    (space_id, group_id, establishment_id, category, visibility, name, created_by, created_at)
  select ra.space_id, e.group_id, ra.establishment_id, 'requests_and_jobs', 'shared_with_client',
         ra.file_name, ra.created_by, ra.created_at
  from public.request_attachments ra
  join public.establishments e on e.id = ra.establishment_id
  returning id as file_id, space_id, establishment_id, created_by, created_at
),
emparejado as (
  -- El emparejamiento va por (establecimiento, autor, instante), que es
  -- exactamente lo que copió el INSERT de arriba: request_attachments no
  -- tiene ninguna columna que apunte al catálogo, y no se le añade una
  -- porque el Hito 4 no debe cambiar de forma.
  select v.file_id, ra.*
  from volcado v
  join public.request_attachments ra
    on ra.establishment_id = v.establishment_id
   and ra.created_by = v.created_by
   and ra.created_at = v.created_at
),
versiones as (
  insert into public.file_versions
    (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, created_by, created_at)
  select file_id, space_id, 1, storage_path, file_name, mime_type, size_bytes, created_by, created_at
  from emparejado
  returning 1
)
insert into public.file_links (file_id, space_id, entity_type, entity_id, created_by, created_at)
select file_id, space_id, 'request', request_id, created_by, created_at
from emparejado
on conflict (file_id, entity_type, entity_id) do nothing;

-- ============================================================
-- Finanzas (PRD §17 RN-FIN). Control financiero operativo: Cuotly registra
-- cuotas, cobros, vencimientos, justificantes e impagos. No procesa pagos
-- (sin Stripe, decisión cerrada en CLAUDE.md) ni emite facturas (RN-FIN-09).
-- ============================================================
create table public.charges (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- Nulo en un cobro puntual (un presupuesto aprobado, §84): no todo cobro
  -- nace de una suscripción.
  subscription_id uuid references public.subscriptions (id),
  concept text not null check (length(btrim(concept)) > 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  -- RN-FIN-08: base imponible, impuesto y total, los tres guardados. El
  -- tipo se copia del espacio en el momento de emitir: cambiar el IVA
  -- mañana no puede reescribir lo que se facturó ayer (P4).
  base_cents integer not null check (base_cents >= 0),
  tax_rate_percent numeric(5, 2) not null check (tax_rate_percent >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  due_at timestamptz not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint charges_amounts_add_up check (total_cents = base_cents + tax_cents),
  constraint charges_period check (period_end > period_start),
  -- RN-FIN-01 + RN-DAT-09: la mensualidad de un periodo se genera una vez.
  -- Dos llamadas concurrentes chocan aquí, no crean dos cobros.
  unique (subscription_id, period_start)
);

comment on table public.charges is
  'Cuota o cobro de un establecimiento (RN-FIN-01). **No tiene columna de
   estado**: RN-FIN-02 enumera seis estados y RN-DAT-05 exige que un estado
   derivado se calcule, no se guarde — charge_status() lo deriva de
   financial_entries y de due_at.';

alter table public.charges enable row level security;

create index charges_establishment_idx on public.charges (establishment_id, due_at);
create index charges_space_issued_idx on public.charges (space_id, issued_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  charge_id uuid not null references public.charges (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  -- RN-FIN-03: los cinco métodos registrados, sin inventar ninguno más.
  method text not null check (method in ('transfer', 'card', 'cash', 'direct_debit', 'other')),
  paid_at timestamptz not null,
  -- RN-FIN-05: "puede adjuntar justificante".
  receipt_file_id uuid references public.files (id),
  recorded_by uuid not null references public.profiles (id),
  recorded_role text not null check (recorded_role in ('owner', 'admin', 'worker')),
  idempotency_key text,
  -- RN-FIN-04, "corregir": un cobro mal registrado no se edita ni se
  -- borra; se revierte con su apunte contrario y queda marcado aquí.
  reversed_at timestamptz,
  reversed_by uuid references public.profiles (id),
  reversal_reason text,
  created_at timestamptz not null default now(),
  unique (charge_id, idempotency_key)
);

comment on table public.payments is
  'Un cobro confirmado por el equipo (RN-FIN-04/05). El importe no se
   edita nunca: reverse_payment() escribe el apunte contrario.';

alter table public.payments enable row level security;

create index payments_charge_idx on public.payments (charge_id);

-- RN-FIN-06: "el restaurante puede subir un justificante, pero la
-- confirmación siempre corresponde al equipo". Esta tabla es esa
-- confirmación, y solo la escribe register_payment(), que exige ser del
-- equipo. Un justificante subido por el cliente vive en `receipts` y no
-- genera ninguna fila aquí ni ningún apunte en el libro.
create table public.payment_confirmations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  payment_id uuid not null unique references public.payments (id) on delete cascade,
  confirmed_by uuid not null references public.profiles (id),
  confirmed_role text not null check (confirmed_role in ('owner', 'admin', 'worker')),
  confirmed_at timestamptz not null default now(),
  note text
);

alter table public.payment_confirmations enable row level security;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  charge_id uuid not null references public.charges (id) on delete cascade,
  file_id uuid not null references public.files (id),
  payment_id uuid references public.payments (id),
  uploaded_by uuid not null references public.profiles (id),
  uploaded_side text not null check (uploaded_side in ('staff', 'client')),
  note text,
  created_at timestamptz not null default now()
);

comment on table public.receipts is
  'Justificantes de un cobro (RN-FIN-06). Que exista uno no significa que
   el cobro esté confirmado: eso lo dice payment_confirmations.';

alter table public.receipts enable row level security;

create index receipts_charge_idx on public.receipts (charge_id);

-- financial_entries — libro inmutable de apuntes con signo (CLAUDE.md
-- MUST, RN-DAT-04). El signo es el que mueve la **deuda viva**: emitir
-- sube, cobrar baja, perdonar baja, reembolsar y revertir vuelven a subir.
-- Sin política de UPDATE ni de DELETE. Nunca hay un saldo guardado.
create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  charge_id uuid not null references public.charges (id) on delete cascade,
  entry_type text not null check (entry_type in ('charge', 'payment', 'waiver', 'refund', 'payment_reversal')),
  amount_cents integer not null check (amount_cents <> 0),
  payment_id uuid references public.payments (id),
  related_entry_id uuid references public.financial_entries (id),
  reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint financial_entries_sign check (
    (entry_type = 'charge' and amount_cents > 0)
    or (entry_type in ('payment', 'waiver') and amount_cents < 0)
    or (entry_type in ('refund', 'payment_reversal') and amount_cents > 0)
  )
);

alter table public.financial_entries enable row level security;

create index financial_entries_charge_idx on public.financial_entries (charge_id);
create index financial_entries_establishment_idx on public.financial_entries (establishment_id, created_at);

-- Visibilidad financiera: can_read_billing() para el equipo de finanzas y
-- el cliente autorizado (RN-FIN-07), más el trabajador **solo** en los
-- establecimientos que tiene asignados, que es lo que HU-27 necesita para
-- marcar un cobro como pagado desde la ficha. CA-03 sigue en pie: eso no
-- es "finanzas globales" — financial_dashboard() sí lo es y le está vedado.
create or replace function public.can_read_establishment_finance(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_read_billing(p_establishment_id)
    or public.is_authorized_worker_establishment(p_establishment_id);
$$;

create policy charges_select on public.charges
for select using (public.can_read_establishment_finance(establishment_id));

create policy payments_select on public.payments
for select using (public.can_read_establishment_finance(establishment_id));

create policy payment_confirmations_select on public.payment_confirmations
for select using (
  public.can_read_establishment_finance(
    (select p.establishment_id from public.payments p where p.id = payment_id)
  )
);

create policy receipts_select on public.receipts
for select using (public.can_read_establishment_finance(establishment_id));

create policy financial_entries_select on public.financial_entries
for select using (public.can_read_establishment_finance(establishment_id));

-- ============================================================
-- Estado derivado de un cobro (RN-FIN-02 + RN-DAT-05). Misma decisión, y
-- en el mismo orden, que src/core/finance.ts `chargeStatus()`.
-- ============================================================
create or replace function public.charge_outstanding_cents(p_charge_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount_cents), 0)::integer
  from public.financial_entries where charge_id = p_charge_id;
$$;

create or replace function public.charge_collected_cents(p_charge_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(-sum(amount_cents), 0)::integer
  from public.financial_entries
  where charge_id = p_charge_id
    and entry_type in ('payment', 'payment_reversal', 'refund');
$$;

create or replace function public.charge_status(p_charge_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_due_at timestamptz;
  v_outstanding integer;
begin
  select due_at into v_due_at from public.charges where id = p_charge_id;
  if v_due_at is null then
    return null;
  end if;

  if exists (select 1 from public.financial_entries where charge_id = p_charge_id and entry_type = 'refund') then
    return 'refunded';
  end if;
  if exists (select 1 from public.financial_entries where charge_id = p_charge_id and entry_type = 'waiver') then
    return 'waived';
  end if;

  v_outstanding := public.charge_outstanding_cents(p_charge_id);
  if v_outstanding <= 0 then
    return 'paid';
  end if;

  -- 'overdue' por delante de 'partially_paid': pasada la fecha con deuda
  -- viva, lo que importa es que hay un impago en marcha — es exactamente
  -- la condición que dispara RN-FIN-10/11, y un pago parcial no la detiene.
  if now() > v_due_at then
    return 'overdue';
  end if;

  return case when public.charge_collected_cents(p_charge_id) > 0 then 'partially_paid' else 'pending' end;
end;
$$;

-- generate_monthly_charge — RN-FIN-01: "la mensualidad se genera
-- automáticamente en la fecha de renovación según plan, impuestos y
-- condiciones vigentes."
--
-- El periodo es el mismo que el ciclo de consumo del Hito 5 (la fecha de
-- renovación del establecimiento), y por eso se pide a
-- get_or_create_consumption_cycle(): que la mensualidad y la bolsa de
-- cambios corten el mes por el mismo sitio no es casualidad, es RN-COM-06.
--
-- `p_due_at`: el PRD no define plazo de pago. Sin uno, la mensualidad
-- vence en la propia fecha de renovación en la que se emite. Si algún
-- espacio concede días de cortesía, es un parámetro de esta llamada, no
-- una constante inventada aquí (CLAUDE.md, "no inventes lo que está
-- pendiente").
create or replace function public.generate_monthly_charge(
  p_subscription_id uuid,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_kind text;
  v_plan_name text;
  v_base_cents integer;
  v_tax_rate numeric(5, 2);
  v_tax_cents integer;
  v_cycle_id uuid;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_charge_id uuid;
begin
  select s.space_id, s.establishment_id, s.kind, p.name, p.price_cents
  into v_space_id, v_establishment_id, v_kind, v_plan_name, v_base_cents
  from public.subscriptions s
  left join public.plans p on p.id = s.plan_id
  where s.id = p_subscription_id and s.status = 'active';

  if v_space_id is null then
    raise exception 'Suscripción activa no encontrada';
  end if;

  if v_kind <> 'plan' then
    -- RN-COM-08 fija dos precios para Menú Diario según el establecimiento
    -- tenga o no plan Premium activo, y el esquema todavía no sabe cuál de
    -- los planes es "Premium" (solo tienen nombre). Menú Diario entero es
    -- Fase 2: aquí se para en vez de adivinar el precio.
    raise exception 'La mensualidad de un servicio se implementa con Menú Diario (Fase 2)';
  end if;

  if not public.has_capability(v_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para emitir cobros en este espacio';
  end if;

  v_cycle_id := public.get_or_create_consumption_cycle(p_subscription_id);
  select cycle_start, cycle_end into v_cycle_start, v_cycle_end
  from public.consumption_cycles where id = v_cycle_id;

  select id into v_charge_id from public.charges
  where subscription_id = p_subscription_id and period_start = v_cycle_start;
  if v_charge_id is not null then
    return v_charge_id; -- RN-DAT-09: emitir dos veces no cobra dos veces.
  end if;

  select tax_rate_percent into v_tax_rate from public.spaces where id = v_space_id;
  v_tax_cents := round(v_base_cents * v_tax_rate / 100)::integer;

  insert into public.charges
    (space_id, establishment_id, subscription_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_by)
  values
    (v_space_id, v_establishment_id, p_subscription_id, v_plan_name, v_cycle_start, v_cycle_end,
     v_base_cents, v_tax_rate, v_tax_cents, v_base_cents + v_tax_cents,
     coalesce(p_due_at, v_cycle_start), auth.uid())
  returning id into v_charge_id;

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    (v_space_id, v_establishment_id, v_charge_id, 'charge', v_base_cents + v_tax_cents,
     'Mensualidad ' || v_plan_name, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'charge.issued', 'charge', v_charge_id,
          jsonb_build_object('establishment_id', v_establishment_id, 'total_cents', v_base_cents + v_tax_cents,
                             'period_start', v_cycle_start));

  return v_charge_id;
end;
$$;

-- RN-FIN-05: el trabajador "puede adjuntar justificante". RN-ARC-05: "la
-- facturación nunca es visible para los trabajadores". Las dos reglas se
-- cumplen a la vez de la única forma posible: el trabajador puede
-- **escribir** un justificante en un establecimiento asignado, y no puede
-- **leer** ningún archivo de facturación, ni siquiera ese (can_read_file()
-- se lo niega). Entre "puede adjuntar" y "nunca ve facturación", gana la
-- prohibición explícita.
create or replace function public.can_write_file(p_establishment_id uuid, p_category text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
begin
  if v_space_id is null then
    return false;
  end if;

  if public.is_space_member(v_space_id) then
    if p_category = 'billing' then
      return public.has_capability(v_space_id, 'manage_finance')
        or public.is_authorized_worker_establishment(p_establishment_id);
    end if;
    return public.has_capability(v_space_id, 'manage_requests')
      or public.is_authorized_worker_establishment(p_establishment_id);
  end if;

  -- Lado cliente: quien puede escribir en el establecimiento (RN-MSG-05
  -- deja fuera a Consulta). Para un justificante de pago (RN-FIN-06) hace
  -- falta además visibilidad financiera (RN-FIN-07).
  if p_category = 'billing' then
    return public.can_write_establishment(p_establishment_id) and public.client_can_view_billing(p_establishment_id);
  end if;

  return public.can_write_establishment(p_establishment_id);
end;
$$;

-- ============================================================
-- Ciclo de impago (RN-FIN-10 a 14) y reactivación (RN-FIN-13).
--
-- `cause` en timer_events y state_events: sin ella, al cobrar no habría
-- forma de distinguir un contador pausado por impago de uno pausado
-- porque el trabajo está esperando información del restaurante (RN-JOB-08).
-- Reanudar el segundo por error sería exactamente el fallo que RN-FIN-13
-- prohíbe: contadores que no continúan donde se pausaron.
-- ============================================================
alter table public.timer_events add column cause text;
alter table public.state_events add column cause text;

comment on column public.timer_events.cause is
  'Por qué se escribió el evento, cuando importa para poder deshacerlo:
   "nonpayment" marca las pausas del ciclo de impago, que son las únicas
   que reanuda la reactivación por pago (RN-FIN-13).';

alter table public.state_events drop constraint state_events_entity_type_check;
alter table public.state_events add constraint state_events_entity_type_check
  check (entity_type in ('job', 'task', 'establishment'));

drop policy state_events_select on public.state_events;

create policy state_events_select on public.state_events
for select
using (
  public.has_capability(space_id, 'assign_jobs')
  or (entity_type = 'job' and public.can_read_job(entity_id) and public.is_space_member(space_id))
  or (entity_type = 'task' and public.can_read_task(entity_id))
  -- RN-EST-08: "el motivo concreto (por ejemplo, impago) se muestra junto
  -- al estado", así que el restaurante ve los cambios de estado de su
  -- propio establecimiento. No ve los de trabajos ni tareas.
  or (entity_type = 'establishment' and public.can_read_establishment_as_client(entity_id))
);

create or replace function public.counter_is_running(
  p_counter_kind text,
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select te.event_type in ('started', 'resumed')
    from public.timer_events te
    where te.counter_kind = p_counter_kind
      and te.entity_type = p_entity_type
      and te.entity_id = p_entity_id
    order by te.occurred_at desc, te.created_at desc
    limit 1
  ), false);
$$;

create or replace function public.counter_pause_cause(
  p_counter_kind text,
  p_entity_type text,
  p_entity_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when te.event_type = 'paused' then te.cause end
  from public.timer_events te
  where te.counter_kind = p_counter_kind
    and te.entity_type = p_entity_type
    and te.entity_id = p_entity_id
  order by te.occurred_at desc, te.created_at desc
  limit 1;
$$;

-- RN-FIN-12: "se detienen trabajos, publicaciones y contadores. No se
-- borra información." Pausar es escribir un `paused` en el libro de
-- eventos, no tocar ningún número: por eso el tiempo restante sobrevive
-- intacto (RN-FIN-13, CA-10).
create or replace function public.pause_establishment_counters(p_establishment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_paused integer;
begin
  with vivos as (
    select distinct te.counter_kind, te.entity_type, te.entity_id
    from public.timer_events te
    where (te.entity_type = 'request'
             and te.entity_id in (select id from public.requests where establishment_id = p_establishment_id))
       or (te.entity_type = 'job'
             and te.entity_id in (select id from public.jobs where establishment_id = p_establishment_id))
  ),
  insertados as (
    insert into public.timer_events
      (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id, cause)
    select v_space_id, v.counter_kind, v.entity_type, v.entity_id, 'paused', now(), auth.uid(), 'nonpayment'
    from vivos v
    where public.counter_is_running(v.counter_kind, v.entity_type, v.entity_id)
    returning 1
  )
  select count(*)::integer into v_paused from insertados;

  return v_paused;
end;
$$;

-- RN-FIN-13: se reanudan **solo** las pausas del ciclo de impago.
create or replace function public.resume_establishment_counters(p_establishment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_resumed integer;
begin
  with pausados as (
    select distinct te.counter_kind, te.entity_type, te.entity_id
    from public.timer_events te
    where (te.entity_type = 'request'
             and te.entity_id in (select id from public.requests where establishment_id = p_establishment_id))
       or (te.entity_type = 'job'
             and te.entity_id in (select id from public.jobs where establishment_id = p_establishment_id))
  ),
  insertados as (
    insert into public.timer_events
      (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id, cause)
    select v_space_id, p.counter_kind, p.entity_type, p.entity_id, 'resumed', now(), auth.uid(), 'nonpayment'
    from pausados p
    where public.counter_pause_cause(p.counter_kind, p.entity_type, p.entity_id) = 'nonpayment'
    returning 1
  )
  select count(*)::integer into v_resumed from insertados;

  return v_resumed;
end;
$$;

-- RN-FIN-11: a las 72 h el servicio queda **detenido**. RN-JOB-07 ya
-- contempla la "pausa financiera por impago" como razón de bloqueo válida,
-- y `blocks.reason_type` la tiene desde el Hito 6 ('financial_hold'), así
-- que no hace falta ningún estado nuevo: el trabajo pasa a la pausa
-- autorizada de RN-JOB-01, como cualquier otra pausa no imputable al
-- trabajador.
--
-- No escribe eventos de contador: pause_establishment_counters() ya corrió
-- antes y pausó T3. Un segundo `paused` sería inofensivo para la suma
-- (src/core/timer-events.ts cierra el tramo una sola vez), pero ensuciaría
-- el libro con eventos que no ocurrieron.
create or replace function public.apply_financial_hold_on_jobs(p_establishment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_job record;
  v_count integer := 0;
begin
  for v_job in
    select id, state from public.jobs
    where establishment_id = p_establishment_id and state = 'in_progress'
    for update
  loop
    insert into public.blocks (space_id, job_id, reason_type, note, started_by)
    values (v_space_id, v_job.id, 'financial_hold', 'Impago del establecimiento', auth.uid());

    update public.jobs set state = 'authorized_pause' where id = v_job.id;

    insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
    values (v_space_id, 'job', v_job.id, v_job.state, 'authorized_pause', auth.uid(),
            'Impago del establecimiento', 'nonpayment');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.release_financial_holds(p_establishment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_block record;
  v_count integer := 0;
begin
  for v_block in
    select b.id, b.job_id from public.blocks b
    join public.jobs j on j.id = b.job_id
    where j.establishment_id = p_establishment_id
      and b.reason_type = 'financial_hold'
      and b.ended_at is null
  loop
    update public.blocks set ended_at = now(), ended_by = auth.uid() where id = v_block.id;
    update public.jobs set state = 'in_progress' where id = v_block.job_id and state = 'authorized_pause';

    insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
    values (v_space_id, 'job', v_block.job_id, 'authorized_pause', 'in_progress', auth.uid(),
            'Pago confirmado', 'nonpayment_reactivation');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- El estado del establecimiento durante el ciclo de impago. No se llama
-- desde fuera: lo usan evaluate_establishment_dunning() y la reactivación.
create or replace function public.set_establishment_nonpayment_status(
  p_establishment_id uuid,
  p_status text,
  p_cause text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_current text;
begin
  select space_id, status into v_space_id, v_current
  from public.establishments where id = p_establishment_id
  for update;

  if v_current = p_status then
    return; -- Idempotente.
  end if;

  update public.establishments set status = p_status where id = p_establishment_id;

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (v_space_id, 'establishment', p_establishment_id, v_current, p_status, auth.uid(),
          'Ciclo de impago', p_cause);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.' || p_cause, 'establishment', p_establishment_id,
          jsonb_build_object('status', v_current), jsonb_build_object('status', p_status), 'Ciclo de impago');
end;
$$;

-- RN-EST-08: "el motivo concreto (por ejemplo, impago) se muestra junto al
-- estado". Derivado del libro de cambios de estado, no guardado (RN-DAT-05).
create or replace function public.establishment_status_reason(p_establishment_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select se.cause
  from public.state_events se
  where se.entity_type = 'establishment'
    and se.entity_id = p_establishment_id
    and (public.can_read_establishment(p_establishment_id))
  order by se.occurred_at desc
  limit 1;
$$;

-- evaluate_establishment_dunning — RN-FIN-10/11.
--
-- En Fase 1 no hay planificador: la evaluación la dispara el equipo (al
-- abrir Finanzas, al emitir o al cobrar). La cola con reintentos llega en
-- el Hito 8 (RN-NOT-05) y podrá llamar a esta misma función sin cambiarla:
-- es idempotente y solo depende de los datos, no de cuándo se la invoque.
create or replace function public.evaluate_establishment_dunning(p_establishment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_oldest_due timestamptz;
  v_hours numeric;
  v_stage text;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para gestionar el impago de este establecimiento';
  end if;

  -- Manda el cobro vencido más antiguo que siga con deuda viva: uno nuevo
  -- todavía en plazo no rescata a un establecimiento ya suspendido.
  select min(c.due_at) into v_oldest_due
  from public.charges c
  where c.establishment_id = p_establishment_id
    and now() > c.due_at
    and public.charge_outstanding_cents(c.id) > 0;

  if v_oldest_due is null then
    perform public.reactivate_establishment_after_payment(p_establishment_id);
    return 'current';
  end if;

  -- RN-FIN-10/11: horas **naturales**, no laborables. Es la única familia
  -- de plazos de Cuotly que no pasa por el reloj contractual, y el PRD lo
  -- dice con esa palabra exacta.
  v_hours := extract(epoch from (now() - v_oldest_due)) / 3600;

  if v_hours >= 72 then
    v_stage := 'suspended';
  elsif v_hours >= 24 then
    v_stage := 'paused';
  else
    return 'current';
  end if;

  perform public.pause_establishment_counters(p_establishment_id);

  if v_stage = 'suspended' then
    perform public.set_establishment_nonpayment_status(p_establishment_id, 'suspended', 'nonpayment_suspension');
    perform public.apply_financial_hold_on_jobs(p_establishment_id);
  else
    perform public.set_establishment_nonpayment_status(p_establishment_id, 'paused', 'nonpayment_pause');
  end if;

  return v_stage;
end;
$$;

-- reactivate_establishment_after_payment — RN-FIN-13. Interna: la llaman
-- register_payment(), waive_charge() y evaluate_establishment_dunning().
--
-- El estado al que se vuelve es el que tenía **antes** del episodio de
-- impago, leído del libro de cambios de estado — no un 'active' supuesto:
-- un establecimiento en `ending` (RN-EST-09) que paga vuelve a `ending`,
-- no a activo.
create or replace function public.reactivate_establishment_after_payment(p_establishment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_status text;
  v_restore text;
  v_last_reactivation timestamptz;
begin
  select space_id, status into v_space_id, v_status
  from public.establishments where id = p_establishment_id
  for update;

  if v_status not in ('paused', 'suspended') then
    return false;
  end if;

  -- RN-FIN-14: la deuda no desaparece al reactivar. Si queda algún cobro
  -- vencido sin saldar, no se reactiva nada.
  if exists (
    select 1 from public.charges c
    where c.establishment_id = p_establishment_id
      and now() > c.due_at
      and public.charge_outstanding_cents(c.id) > 0
  ) then
    return false;
  end if;

  select max(se.occurred_at) into v_last_reactivation
  from public.state_events se
  where se.entity_type = 'establishment' and se.entity_id = p_establishment_id
    and se.cause = 'nonpayment_reactivation';

  select se.from_state into v_restore
  from public.state_events se
  where se.entity_type = 'establishment' and se.entity_id = p_establishment_id
    and se.cause in ('nonpayment_pause', 'nonpayment_suspension')
    and se.occurred_at > coalesce(v_last_reactivation, '-infinity'::timestamptz)
  order by se.occurred_at asc
  limit 1;

  perform public.release_financial_holds(p_establishment_id);
  perform public.set_establishment_nonpayment_status(
    p_establishment_id, coalesce(v_restore, 'active'), 'nonpayment_reactivation'
  );
  perform public.resume_establishment_counters(p_establishment_id);

  return true;
end;
$$;

-- ============================================================
-- Registrar, corregir, perdonar y reembolsar (RN-FIN-04, RN-FIN-05,
-- HU-26, HU-27).
-- ============================================================

-- register_payment — HU-26 ("registrar la confirmación de un cobro con
-- fecha, importe, método y justificante") y HU-27 ("marcar como pagado un
-- cobro de un restaurante asignado, sin entrar en Finanzas").
--
-- Es la misma función para los tres roles del espacio a propósito: lo que
-- cambia es quién puede llamarla, no lo que hace. RN-FIN-05 acota al
-- trabajador aquí, en el servidor, y no en una pantalla que se le oculte
-- (CLAUDE.md MUST).
--
-- Transacción + idempotencia (CLAUDE.md MUST, RN-DAT-09): el cobro se
-- bloquea con FOR UPDATE, el apunte y la confirmación se escriben con el
-- pago, y `p_idempotency_key` hace que pulsar dos veces no cobre dos veces.
create or replace function public.register_payment(
  p_charge_id uuid,
  p_amount_cents integer,
  p_method text,
  p_paid_at timestamptz default now(),
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
  v_establishment_id uuid;
  v_outstanding integer;
  v_role public.space_role;
  v_recorded_role text;
  v_payment_id uuid;
begin
  select space_id, establishment_id into v_space_id, v_establishment_id
  from public.charges where id = p_charge_id
  for update;

  if v_space_id is null then
    raise exception 'Cobro no encontrado';
  end if;

  select sm.role into v_role
  from public.space_memberships sm
  where sm.space_id = v_space_id and sm.user_id = auth.uid() and sm.status = 'active';

  -- RN-FIN-06: "la confirmación siempre corresponde al equipo". El cliente
  -- sube justificantes con upload_payment_receipt(), no confirma cobros.
  if v_role is null then
    raise exception 'Solo el equipo de mantenimiento confirma un cobro';
  end if;

  if v_role = 'worker' and not public.is_authorized_worker_establishment(v_establishment_id) then
    raise exception 'Solo puedes marcar como pagado un cobro de un restaurante que tengas asignado';
  end if;

  v_recorded_role := v_role::text;

  if p_idempotency_key is not null then
    select id into v_payment_id from public.payments
    where charge_id = p_charge_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe cobrado debe ser mayor que cero';
  end if;

  v_outstanding := public.charge_outstanding_cents(p_charge_id);
  if p_amount_cents > v_outstanding then
    -- Cobrar más de lo que se debe no es un pago parcial ni total: es un
    -- dato equivocado. Se para en vez de dejar el libro con saldo
    -- negativo, que ningún estado de RN-FIN-02 sabría describir.
    raise exception 'El importe (%) supera la deuda viva del cobro (%)', p_amount_cents, v_outstanding;
  end if;

  if p_receipt_file_id is not null then
    if (select establishment_id from public.files where id = p_receipt_file_id) is distinct from v_establishment_id then
      raise exception 'El justificante pertenece a otro establecimiento';
    end if;
  end if;

  insert into public.payments
    (space_id, establishment_id, charge_id, amount_cents, method, paid_at,
     receipt_file_id, recorded_by, recorded_role, idempotency_key)
  values
    (v_space_id, v_establishment_id, p_charge_id, p_amount_cents, p_method, p_paid_at,
     p_receipt_file_id, auth.uid(), v_recorded_role, p_idempotency_key)
  returning id into v_payment_id;

  insert into public.payment_confirmations (space_id, payment_id, confirmed_by, confirmed_role, note)
  values (v_space_id, v_payment_id, auth.uid(), v_recorded_role, p_note);

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, payment_id, reason, created_by)
  values
    (v_space_id, v_establishment_id, p_charge_id, 'payment', -p_amount_cents, v_payment_id, p_note, auth.uid());

  if p_receipt_file_id is not null then
    insert into public.receipts
      (space_id, establishment_id, charge_id, file_id, payment_id, uploaded_by, uploaded_side, note)
    values
      (v_space_id, v_establishment_id, p_charge_id, p_receipt_file_id, v_payment_id, auth.uid(), 'staff', p_note);
    perform public.link_file(p_receipt_file_id, 'payment', v_payment_id, auth.uid());
  end if;

  -- CLAUDE.md MUST: todo cambio de estado relevante deja auditoría con
  -- actor, fecha y valores. RN-FIN-05: "su acción queda auditada".
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'payment.registered', 'charge', p_charge_id,
          jsonb_build_object('outstanding_cents', v_outstanding),
          jsonb_build_object('outstanding_cents', v_outstanding - p_amount_cents,
                             'amount_cents', p_amount_cents, 'method', p_method,
                             'paid_at', p_paid_at, 'recorded_role', v_recorded_role),
          p_note);

  -- RN-FIN-13: al confirmarse el pago, se reactiva.
  perform public.reactivate_establishment_after_payment(v_establishment_id);

  return v_payment_id;
end;
$$;

-- reverse_payment — RN-FIN-04, "corregir". No edita el pago: escribe el
-- apunte contrario. El trabajador no corrige (RN-FIN-05).
create or replace function public.reverse_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_charge_id uuid;
  v_amount integer;
  v_reversed timestamptz;
begin
  select space_id, establishment_id, charge_id, amount_cents, reversed_at
  into v_space_id, v_establishment_id, v_charge_id, v_amount, v_reversed
  from public.payments where id = p_payment_id
  for update;

  if v_space_id is null then
    raise exception 'Pago no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_finance') then
    raise exception 'Solo el propietario o un administrador pueden corregir un cobro';
  end if;

  if v_reversed is not null then
    return; -- Idempotente.
  end if;

  update public.payments
  set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = p_reason
  where id = p_payment_id;

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, payment_id, reason, created_by)
  values
    (v_space_id, v_establishment_id, v_charge_id, 'payment_reversal', v_amount, p_payment_id, p_reason, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'payment.reversed', 'payment', p_payment_id,
          jsonb_build_object('amount_cents', v_amount), jsonb_build_object('reversed', true), p_reason);
end;
$$;

-- waive_charge / refund_charge — RN-FIN-02 ('waived', 'refunded') y
-- RN-FIN-05 ("no perdona deuda, no reembolsa").
create or replace function public.waive_charge(p_charge_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_outstanding integer;
begin
  select space_id, establishment_id into v_space_id, v_establishment_id
  from public.charges where id = p_charge_id
  for update;

  if v_space_id is null then
    raise exception 'Cobro no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_finance') then
    raise exception 'Solo el propietario o un administrador pueden perdonar un cobro';
  end if;

  if exists (select 1 from public.financial_entries where charge_id = p_charge_id and entry_type = 'waiver') then
    return; -- Idempotente.
  end if;

  v_outstanding := public.charge_outstanding_cents(p_charge_id);
  if v_outstanding <= 0 then
    raise exception 'Este cobro no tiene deuda viva que perdonar';
  end if;

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    (v_space_id, v_establishment_id, p_charge_id, 'waiver', -v_outstanding, p_reason, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'charge.waived', 'charge', p_charge_id,
          jsonb_build_object('outstanding_cents', v_outstanding),
          jsonb_build_object('outstanding_cents', 0), p_reason);

  perform public.reactivate_establishment_after_payment(v_establishment_id);
end;
$$;

create or replace function public.refund_charge(p_charge_id uuid, p_amount_cents integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_collected integer;
begin
  select space_id, establishment_id into v_space_id, v_establishment_id
  from public.charges where id = p_charge_id
  for update;

  if v_space_id is null then
    raise exception 'Cobro no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_finance') then
    raise exception 'Solo el propietario o un administrador pueden reembolsar un cobro';
  end if;

  v_collected := public.charge_collected_cents(p_charge_id);
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > v_collected then
    raise exception 'Solo se puede reembolsar lo efectivamente cobrado (%)', v_collected;
  end if;

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    (v_space_id, v_establishment_id, p_charge_id, 'refund', p_amount_cents, p_reason, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'charge.refunded', 'charge', p_charge_id,
          jsonb_build_object('collected_cents', v_collected),
          jsonb_build_object('refunded_cents', p_amount_cents), p_reason);
end;
$$;

-- upload_payment_receipt — RN-FIN-06: "el restaurante puede subir un
-- justificante, pero la confirmación siempre corresponde al equipo". Deja
-- constancia del justificante y **no** escribe ningún apunte: el cobro
-- sigue debiéndose hasta que alguien del equipo lo confirme.
create or replace function public.upload_payment_receipt(
  p_charge_id uuid,
  p_file_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_side text;
  v_receipt_id uuid;
begin
  select space_id, establishment_id into v_space_id, v_establishment_id
  from public.charges where id = p_charge_id;

  if v_space_id is null then
    raise exception 'Cobro no encontrado';
  end if;

  if (select establishment_id from public.files where id = p_file_id) is distinct from v_establishment_id then
    raise exception 'El justificante pertenece a otro establecimiento';
  end if;

  if public.is_space_member(v_space_id) then
    v_side := 'staff';
    if not public.can_write_file(v_establishment_id, 'billing') then
      raise exception 'No tienes permiso para adjuntar justificantes a este cobro';
    end if;
  else
    v_side := 'client';
    if not public.client_can_view_billing(v_establishment_id) then
      raise exception 'No tienes visibilidad financiera de este establecimiento';
    end if;
  end if;

  insert into public.receipts
    (space_id, establishment_id, charge_id, file_id, uploaded_by, uploaded_side, note)
  values
    (v_space_id, v_establishment_id, p_charge_id, p_file_id, auth.uid(), v_side, p_note)
  returning id into v_receipt_id;

  perform public.link_file(p_file_id, 'charge', p_charge_id, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_space_id, auth.uid(), 'charge.receipt_uploaded', 'charge', p_charge_id,
          jsonb_build_object('file_id', p_file_id, 'side', v_side), p_note);

  return v_receipt_id;
end;
$$;

-- attach_invoice_to_charge — RN-FIN-09: "en Fase 1 Cuotly no emite
-- facturas: permite adjuntar la factura oficial emitida externamente para
-- su descarga". La numeración fiscal sigue en el bloque legal pendiente y
-- no se inventa aquí (CLAUDE.md).
create or replace function public.attach_invoice_to_charge(p_charge_id uuid, p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
begin
  select space_id, establishment_id into v_space_id, v_establishment_id
  from public.charges where id = p_charge_id;

  if v_space_id is null then
    raise exception 'Cobro no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_finance') then
    raise exception 'Solo el propietario o un administrador pueden adjuntar la factura de un cobro';
  end if;

  if (select category from public.files where id = p_file_id) is distinct from 'billing' then
    raise exception 'La factura debe estar catalogada como facturación';
  end if;

  if (select establishment_id from public.files where id = p_file_id) is distinct from v_establishment_id then
    raise exception 'La factura pertenece a otro establecimiento';
  end if;

  perform public.link_file(p_file_id, 'charge', p_charge_id, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'charge.invoice_attached', 'charge', p_charge_id,
          jsonb_build_object('file_id', p_file_id));
end;
$$;

-- ============================================================
-- RN-MSG-10 · §68 — "Convertir en solicitud".
--
-- Crea un **borrador**: eso es literalmente lo que pide la regla ("crea un
-- borrador arrastrando los mensajes y adjuntos relevantes, y antes de
-- enviarlo se revisan alcance, destinatario y archivos"). La revisión es
-- el borrador mismo — quien convierte edita y envía después con
-- submit_request(), y hasta entonces no ha empezado ningún plazo.
--
-- Los mensajes se copian, no se mueven: RN-MSG-08 (nada se borra) y el
-- hilo general del establecimiento sigue intacto.
-- ============================================================
create or replace function public.convert_conversation_to_request(
  p_conversation_id uuid,
  p_message_ids uuid[],
  p_context text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_establishment_id uuid;
  v_description text;
  v_request_id uuid;
  v_file record;
begin
  select type into v_type from public.conversations where id = p_conversation_id;

  if v_type is null then
    raise exception 'Conversación no encontrada';
  end if;

  if v_type <> 'establishment' then
    raise exception 'Solo la conversación general del establecimiento se convierte en solicitud';
  end if;

  if not public.can_read_conversation(p_conversation_id) then
    raise exception 'No tienes acceso a esta conversación';
  end if;

  select string_agg(m.body, E'\n\n' order by m.created_at asc) into v_description
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.id = any(coalesce(p_message_ids, array[]::uuid[]));

  if btrim(coalesce(v_description, '')) = '' then
    raise exception 'Elige al menos un mensaje para convertir en solicitud';
  end if;

  v_establishment_id := public.conversation_establishment_id(p_conversation_id);

  -- create_request_draft() comprueba can_write_establishment() por su
  -- cuenta: RN-MSG-05 (Consulta no escribe) sigue valiendo aquí.
  v_request_id := public.create_request_draft(v_establishment_id, v_description, p_context);

  -- "arrastrando los mensajes **y adjuntos** relevantes".
  for v_file in
    select distinct fl.file_id
    from public.file_links fl
    where fl.entity_type = 'message'
      and fl.entity_id = any(coalesce(p_message_ids, array[]::uuid[]))
  loop
    perform public.link_file(v_file.file_id, 'request', v_request_id, auth.uid());
  end loop;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (public.establishment_space_id(v_establishment_id), auth.uid(),
          'request.converted_from_conversation', 'request', v_request_id,
          jsonb_build_object('conversation_id', p_conversation_id, 'messages', array_length(p_message_ids, 1)));

  return v_request_id;
end;
$$;

-- ============================================================
-- HU-24 · HU-25 — lo que el restaurante ve de su bolsa y lo que el
-- administrador ve de su libro.
-- ============================================================

-- HU-24: "ver cuántos cambios de cada categoría me quedan en el ciclo
-- actual y cuándo se renuevan". Una fila por categoría, con la bolsa
-- incluida al lado del resto: "0 restantes" y "no incluido en tu plan" son
-- cosas distintas y la pantalla tiene que poder distinguirlas (P6).
create or replace function public.establishment_cycle_allowance(p_establishment_id uuid)
returns table (
  category text,
  included integer,
  remaining integer,
  renews_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with ciclo as (
    select cc.*
    from public.consumption_cycles cc
    join public.subscriptions s on s.id = cc.subscription_id
    where cc.establishment_id = p_establishment_id
      and s.kind = 'plan' and s.status = 'active'
      and now() >= cc.cycle_start and now() < cc.cycle_end
    order by cc.cycle_start desc
    limit 1
  ),
  incluido as (
    select 'small' as category, included_small as included, cycle_end from ciclo
    union all select 'photo', included_photo, cycle_end from ciclo
    union all select 'medium', included_medium, cycle_end from ciclo
    union all select 'large', included_large, cycle_end from ciclo
  )
  select
    i.category,
    i.included,
    -- CA-08: el saldo es la bolsa del ciclo más la suma de sus apuntes.
    (i.included + coalesce((
      select sum(ce.amount)
      from public.consumption_entries ce
      where ce.consumption_cycle_id = (select id from ciclo) and ce.category = i.category
    ), 0))::integer as remaining,
    i.cycle_end as renews_at
  from incluido i
  where public.can_read_establishment(p_establishment_id);
$$;

comment on function public.establishment_cycle_allowance(uuid) is
  'HU-24. Devuelve cero filas si el establecimiento no tiene plan activo
   (RN-COM-11/12: el plan es opcional) — la pantalla debe decir "sin plan
   de mantenimiento", no enseñar una bolsa vacía como si tuviera una.';

-- HU-25: "ver el libro de consumos de un establecimiento con cada apunte,
-- su motivo y su autor".
--
-- `author_display` sigue la misma regla que los mensajes (RN-MSG-02,
-- CLAUDE.md MUST NOT): al equipo se le dice quién fue; al cliente, que fue
-- el equipo de mantenimiento. Sus propios apuntes (aceptó él) sí se
-- identifican como suyos.
create or replace function public.establishment_consumption_ledger(p_establishment_id uuid)
returns table (
  entry_id uuid,
  occurred_at timestamptz,
  category text,
  amount integer,
  entry_type text,
  reason text,
  request_code text,
  author_display text,
  author_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ce.id,
    ce.created_at,
    ce.category,
    ce.amount,
    ce.entry_type,
    ce.reason,
    r.code,
    case
      when ce.created_by is null then 'system'
      when ce.created_by = auth.uid() then 'self'
      -- Primero, de qué lado es el autor; después, de qué lado es quien
      -- mira. Un apunte que generó el restaurante al aceptar es del
      -- restaurante para todo el mundo; uno que generó el equipo se
      -- presenta al cliente como el equipo, nunca como una persona.
      when not exists (
        select 1 from public.space_memberships sm
        where sm.space_id = ce.space_id and sm.user_id = ce.created_by
      ) then 'client'
      when public.is_space_member(ce.space_id) then 'person'
      else 'maintenance_team'
    end as author_display,
    case when public.is_space_member(ce.space_id) then ce.created_by else null end as author_id
  from public.consumption_entries ce
  left join public.requests r on r.id = ce.request_id
  where ce.establishment_id = p_establishment_id
    and public.can_read_establishment(p_establishment_id)
  order by ce.created_at desc;
$$;

-- ============================================================
-- HU-28 · §17.2 — Panel financiero (versión operativa de la Fase 1).
--
-- Gated con 'manage_finance': CA-03 ("un trabajador no puede ver finanzas
-- globales") no es una pantalla que se oculte, es una excepción del
-- servidor.
-- ============================================================
create or replace function public.financial_dashboard(
  p_space_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  forecast_base_cents bigint,
  forecast_total_cents bigint,
  collected_cents bigint,
  pending_cents bigint,
  overdue_cents bigint,
  recurring_monthly_base_cents bigint,
  recurring_monthly_total_cents bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_capability(p_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para ver el panel financiero de este espacio';
  end if;

  return query
  with emitidos as (
    select c.id, c.base_cents, c.total_cents, c.due_at,
           public.charge_outstanding_cents(c.id) as outstanding_cents,
           public.charge_collected_cents(c.id) as collected_cents
    from public.charges c
    where c.space_id = p_space_id
      and c.issued_at >= p_from and c.issued_at < p_to
  ),
  recurrente as (
    -- Ingreso recurrente mensual: lo que se espera facturar cada mes
    -- mientras nada cambie. Sale de las suscripciones vigentes, no del
    -- histórico emitido (P6: es una previsión declarada, no una
    -- extrapolación de tendencias).
    select
      coalesce(sum(p.price_cents), 0)::bigint as base_cents,
      coalesce(sum(p.price_cents + round(p.price_cents * sp.tax_rate_percent / 100)), 0)::bigint as total_cents
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    join public.spaces sp on sp.id = s.space_id
    where s.space_id = p_space_id and s.kind = 'plan' and s.status = 'active'
  )
  select
    coalesce(sum(e.base_cents), 0)::bigint,
    coalesce(sum(e.total_cents), 0)::bigint,
    coalesce(sum(e.collected_cents), 0)::bigint,
    coalesce(sum(case when e.outstanding_cents > 0 and now() <= e.due_at then e.outstanding_cents else 0 end), 0)::bigint,
    coalesce(sum(case when e.outstanding_cents > 0 and now() > e.due_at then e.outstanding_cents else 0 end), 0)::bigint,
    (select base_cents from recurrente),
    (select total_cents from recurrente)
  from emitidos e;
end;
$$;

-- §17.2: "ingresos por plan".
create or replace function public.financial_income_by_plan(
  p_space_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (plan_id uuid, plan_name text, base_cents bigint, total_cents bigint, collected_cents bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_capability(p_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para ver el panel financiero de este espacio';
  end if;

  return query
  select p.id, p.name,
         coalesce(sum(c.base_cents), 0)::bigint,
         coalesce(sum(c.total_cents), 0)::bigint,
         coalesce(sum(public.charge_collected_cents(c.id)), 0)::bigint
  from public.charges c
  join public.subscriptions s on s.id = c.subscription_id
  join public.plans p on p.id = s.plan_id
  where c.space_id = p_space_id and c.issued_at >= p_from and c.issued_at < p_to
  group by p.id, p.name
  order by p.name;
end;
$$;

-- §17.2: "próximas renovaciones".
create or replace function public.upcoming_renewals(p_space_id uuid, p_days integer default 30)
returns table (
  establishment_id uuid,
  establishment_name text,
  plan_name text,
  renews_at timestamptz,
  monthly_total_cents bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_capability(p_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para ver el panel financiero de este espacio';
  end if;

  return query
  select e.id, e.name, p.name, cc.cycle_end,
         (p.price_cents + round(p.price_cents * sp.tax_rate_percent / 100))::bigint
  from public.consumption_cycles cc
  join public.subscriptions s on s.id = cc.subscription_id
  join public.plans p on p.id = s.plan_id
  join public.establishments e on e.id = cc.establishment_id
  join public.spaces sp on sp.id = e.space_id
  where cc.space_id = p_space_id
    and s.status = 'active'
    and cc.cycle_end >= now()
    and cc.cycle_end < now() + make_interval(days => p_days)
  order by cc.cycle_end asc;
end;
$$;

-- §17.2: "restaurantes con impago".
create or replace function public.establishments_with_nonpayment(p_space_id uuid)
returns table (
  establishment_id uuid,
  establishment_name text,
  status text,
  oldest_due_at timestamptz,
  outstanding_cents bigint,
  stage text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_capability(p_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para ver el panel financiero de este espacio';
  end if;

  return query
  with vencidos as (
    select c.establishment_id,
           min(c.due_at) as oldest_due_at,
           sum(public.charge_outstanding_cents(c.id)) as outstanding_cents
    from public.charges c
    where c.space_id = p_space_id
      and now() > c.due_at
      and public.charge_outstanding_cents(c.id) > 0
    group by c.establishment_id
  )
  select e.id, e.name, e.status, v.oldest_due_at, v.outstanding_cents::bigint,
         case
           when extract(epoch from (now() - v.oldest_due_at)) / 3600 >= 72 then 'suspended'
           when extract(epoch from (now() - v.oldest_due_at)) / 3600 >= 24 then 'paused'
           else 'current'
         end
  from vencidos v
  join public.establishments e on e.id = v.establishment_id
  order by v.oldest_due_at asc;
end;
$$;

-- ============================================================
-- Funciones internas: se protegen con `revoke all ... from public, anon,
-- authenticated`, **nunca solo from public** (CLAUDE.md, regla escrita
-- después del fallo real de la migración 20260830000024).
--
-- Todas las de esta lista no comprueban permisos por su cuenta: asumen que
-- quien las llama ya validó los suyos. Si `authenticated` pudiera
-- invocarlas por RPC, cualquiera podría pausar contadores ajenos, liberar
-- bloqueos financieros o enlazar archivos a entidades de otro espacio.
-- ============================================================
revoke all on function public.link_file(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.pause_establishment_counters(uuid) from public, anon, authenticated;
revoke all on function public.resume_establishment_counters(uuid) from public, anon, authenticated;
revoke all on function public.apply_financial_hold_on_jobs(uuid) from public, anon, authenticated;
revoke all on function public.release_financial_holds(uuid) from public, anon, authenticated;
revoke all on function public.set_establishment_nonpayment_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.reactivate_establishment_after_payment(uuid) from public, anon, authenticated;
revoke all on function public.mirror_request_attachment_to_catalogue() from public, anon, authenticated;
