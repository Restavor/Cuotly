-- Notas internas del restaurante (RN-EST-13, §29 de la especificación
-- maestra). La maqueta 18 las enseña en la columna derecha, con la
-- insignia "Solo equipo".
--
-- **Qué decidió Bosco (11/09/2026) y por qué hacía falta preguntarlo.**
-- RN-EST-13 dice: "las notas internas las ven propietario y
-- administradores en su totalidad; los trabajadores solo las notas
-- operativas de sus establecimientos autorizados; los clientes nunca". Ni
-- el PRD ni §29 definen en ningún sitio qué hace que una nota sea
-- "operativa", así que la regla presupone una división que no estaba
-- escrita. La decisión, literal: **un interruptor por nota**. Cada nota
-- nace operativa y quien la escribe puede marcarla "solo propietario y
-- administradores". Es la división mínima que la regla ya presupone —
-- operativa frente al resto— sin inventar una taxonomía de tipos que
-- nadie ha definido.
--
-- **Por qué el interruptor solo lo mueve quien puede ver las dos.** Marcar
-- una nota como no operativa exige `manage_clients`. Si un trabajador
-- pudiera marcarla, escribiría una nota y dejaría de verla en el acto:
-- una trampa para quien la usa, no un permiso.
--
-- **Por qué RLS y no privilegios de columna.** CLAUDE.md distingue los dos
-- casos y confundirlos fue el bloqueante B2 de la cuarta revisión: el
-- privilegio de columna es para tablas cuya FILA es del cliente y solo hay
-- que taparle una columna (su mensaje, su archivo). Una nota interna es
-- organización interna del equipo de principio a fin —la fila entera— así
-- que al cliente se le deja fuera de la fila, como en `tasks` y
-- `assignments` (P7).
--
-- **RN-MSG-04** ("las notas internas están estrictamente separadas de los
-- mensajes con el cliente. Un fallo aquí es un fallo grave") se cumple por
-- construcción: esto es otra tabla, con otra política, y no hay ni una
-- consulta que una las dos.
--
-- Se comprueba con `supabase/tests/notas_internas.sql`.

-- ------------------------------------------------------------
-- 1 · La tabla
-- ------------------------------------------------------------
create table public.establishment_notes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 4000),
  -- RN-EST-13 · el interruptor. `true` es lo normal: una nota nace
  -- operativa y la ve todo el equipo con el restaurante autorizado.
  operational boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  -- CLAUDE.md: los registros de negocio no se borran. Una nota que ya no
  -- sirve se archiva y deja de listarse, pero sigue estando.
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  archived_reason text
);

comment on table public.establishment_notes is
  'Notas internas de un restaurante (RN-EST-13, §29). El cliente NUNCA ve
   una: se le deja fuera de la fila con RLS, no con privilegios de columna,
   porque la fila entera es organización interna del equipo (P7). Están
   estrictamente separadas de los mensajes con el cliente (RN-MSG-04).';

comment on column public.establishment_notes.operational is
  'RN-EST-13 · si la nota es operativa. `true` (lo normal) la ve todo el
   equipo con el restaurante autorizado; `false` la reservan para sí el
   propietario y los administradores. Decisión de Bosco del 11/09/2026: un
   interruptor, no una taxonomía de tipos.';

alter table public.establishment_notes enable row level security;

create index establishment_notes_establishment_idx
  on public.establishment_notes (establishment_id, created_at desc);

-- ------------------------------------------------------------
-- 2 · Quién puede asomarse a las notas de un restaurante
-- ------------------------------------------------------------
--
-- Propietario y administradores del espacio (`manage_clients`), y el
-- trabajador que tenga ESE restaurante autorizado. Nadie más — y el
-- cliente, en particular, no entra por ninguna de las dos ramas.
create or replace function public.can_read_establishment_notes(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_capability(
           public.establishment_space_id(p_establishment_id), 'manage_clients')
      or public.is_authorized_for_establishment(p_establishment_id, auth.uid());
$$;

comment on function public.can_read_establishment_notes(uuid) is
  'Si quien llama puede asomarse a las notas internas de este restaurante:
   propietario y administradores del espacio, o el trabajador que lo tenga
   autorizado. QUÉ notas ve de las que hay lo decide además la política
   (RN-EST-13: el trabajador, solo las operativas).';

-- Aparece dentro de la expresión de una política de RLS, así que
-- `authenticated` NO puede perder el EXECUTE: PostgreSQL evalúa esas
-- expresiones con los privilegios de quien consulta, y revocárselo no
-- cerraría nada — rompería la política y la tabla empezaría a devolver
-- `permission denied for function` (CLAUDE.md, excepción documentada).
revoke all on function public.can_read_establishment_notes(uuid) from public, anon;
grant execute on function public.can_read_establishment_notes(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3 · La política
-- ------------------------------------------------------------
--
-- Sin políticas de INSERT/UPDATE/DELETE a propósito: toda mutación pasa
-- por las funciones de abajo, como en `tasks`. Así la regla de quién puede
-- marcar una nota como no operativa vive en un solo sitio.
create policy establishment_notes_select on public.establishment_notes
for select
using (
  public.can_read_establishment_notes(establishment_id)
  and (
    operational
    or public.has_capability(space_id, 'manage_clients')
  )
);

-- ------------------------------------------------------------
-- 4 · Escribir una nota
-- ------------------------------------------------------------
create or replace function public.create_establishment_note(
  p_establishment_id uuid,
  p_body text,
  p_operational boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_note_id uuid;
begin
  v_space_id := public.establishment_space_id(p_establishment_id);

  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  if not public.can_read_establishment_notes(p_establishment_id) then
    raise exception 'Las notas internas son del equipo de este restaurante';
  end if;

  -- El interruptor solo lo mueve quien ve las dos clases de nota. Un
  -- trabajador que pudiera marcarla dejaría de verla en el acto.
  if not coalesce(p_operational, true)
     and not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Reservar una nota al propietario y a los administradores solo lo hacen ellos';
  end if;

  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'La nota está vacía';
  end if;

  insert into public.establishment_notes
    (space_id, establishment_id, body, operational, created_by)
  values
    (v_space_id, p_establishment_id, btrim(p_body), coalesce(p_operational, true), auth.uid())
  returning id into v_note_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id, auth.uid(), 'establishment_note.created', 'establishment', p_establishment_id,
    -- El CUERPO de la nota no va al apunte: la auditoría registra que
    -- alguien escribió una nota, no la copia. Duplicarla aquí la sacaría
    -- de la política que la protege (RN-EST-13) — `audit_log` tiene la
    -- suya, y no es la misma.
    jsonb_build_object('note_id', v_note_id, 'operational', coalesce(p_operational, true))
  );

  return v_note_id;
end;
$$;

comment on function public.create_establishment_note(uuid, text, boolean) is
  'RN-EST-13 · escribe una nota interna del restaurante. Comprueba el
   permiso por su cuenta. Marcarla como NO operativa exige `manage_clients`:
   quien no las ve no puede crearlas.';

revoke all on function public.create_establishment_note(uuid, text, boolean) from public, anon;
grant execute on function public.create_establishment_note(uuid, text, boolean) to authenticated;

-- ------------------------------------------------------------
-- 5 · Archivar una nota
-- ------------------------------------------------------------
--
-- No hay borrar: CLAUDE.md lo prohíbe para los registros de negocio. La
-- archiva quien la escribió o quien gestiona clientes.
create or replace function public.archive_establishment_note(
  p_note_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.establishment_notes;
begin
  select * into v_note from public.establishment_notes where id = p_note_id for update;

  if v_note.id is null then
    raise exception 'Nota no encontrada';
  end if;

  if not (
    v_note.created_by = auth.uid()
    or public.has_capability(v_note.space_id, 'manage_clients')
  ) then
    raise exception 'Solo quien escribió la nota, el propietario o un administrador pueden archivarla';
  end if;

  if v_note.archived_at is not null then
    return false; -- CA-17: idempotente.
  end if;

  update public.establishment_notes
  set archived_at = now(), archived_by = auth.uid(), archived_reason = p_reason
  where id = p_note_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_note.space_id, auth.uid(), 'establishment_note.archived', 'establishment',
    v_note.establishment_id,
    jsonb_build_object('note_id', p_note_id, 'archived', false),
    jsonb_build_object('note_id', p_note_id, 'archived', true),
    p_reason
  );

  return true;
end;
$$;

comment on function public.archive_establishment_note(uuid, text) is
  'RN-EST-13 · archiva una nota interna. No se borra (CLAUDE.md): deja de
   listarse y sigue estando. Idempotente.';

revoke all on function public.archive_establishment_note(uuid, text) from public, anon;
grant execute on function public.archive_establishment_note(uuid, text) to authenticated;
