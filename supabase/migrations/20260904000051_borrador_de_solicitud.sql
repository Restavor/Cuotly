-- §68 · RN-MSG-10 — el borrador que nadie podía revisar.
--
-- Qué faltaba. `convert_conversation_to_request()` existe y está probada
-- desde el Hito 7: coge los mensajes que se le señalan de la conversación
-- general del restaurante (§66.3), arrastra sus adjuntos y crea una
-- solicitud en estado `draft`. Ahí se acababa. §68 dice que "antes de
-- enviar se revisa alcance, destinatario y archivos", y para revisar hacen
-- falta tres cosas que el servidor no ofrecía:
--
--   · cambiar el alcance del borrador — el texto que salió de pegar unos
--     mensajes casi nunca es la redacción con la que uno quiere pedir un
--     cambio. `create_request_draft()` escribe la versión 1 de
--     `request_versions` y nadie escribía nunca la 2; la propia migración
--     20260830000017 lo dejó dicho: "no hay pantalla de edición de un
--     borrador todavía, así que no hay versión 2 hasta que exista esa
--     pantalla";
--   · quitar del borrador un archivo que se arrastró y no venía a cuento;
--   · añadirle uno que sí, y que no estaba en ningún mensaje.
--
-- Lo que NO cambia, y conviene dejarlo escrito porque parece un olvido:
--   · quién puede convertir y quién puede editar el borrador sigue siendo
--     `can_write_establishment()`, o sea el lado del restaurante y no el
--     equipo. Es la regla del Hito 4 ("el equipo de mantenimiento no crea
--     solicitudes en nombre del cliente, solo las valida") y §68 no la
--     toca;
--   · el destinatario no se elige. Una solicitud es de un establecimiento,
--     y la conversación general de la que sale ya es la de ese
--     establecimiento: revisarlo es confirmarlo antes de enviar, no
--     cambiarlo. Mover un borrador de restaurante sería inventar una
--     regla que el PRD no tiene (lo más parecido es RN-REQ-04, "copiar y
--     pegar dentro del mismo grupo", que es otra operación y ya existe).
--   · no hay forma de descartar un borrador. Ningún estado del PRD §9.2
--     lo recoge y CLAUDE.md prohíbe el borrado físico, así que un borrador
--     se envía o se queda. No se improvisa aquí.

-- ============================================================
-- De dónde salió el borrador.
-- ============================================================
-- Hasta ahora la única huella de la conversión estaba en `audit_log`, que
-- el cliente no lee. Sin esto, la pantalla de revisión no puede enseñar
-- "esto viene de tu conversación general" ni enlazar de vuelta al hilo
-- para comprobar lo que se arrastró — que es literalmente lo que §68 pide
-- revisar.
alter table public.requests
  add column if not exists source_conversation_id uuid references public.conversations (id) on delete set null;

comment on column public.requests.source_conversation_id is
  '§68 · RN-MSG-10: la conversación general de la que salió el borrador,
   cuando salió de una. NULL en las solicitudes que se escribieron
   directamente (HU-10) o que se pegaron de otra (RN-REQ-04).';

-- `requests` tiene privilegios de columna desde la migración
-- 20260830000027 (revoke select + grant select de columnas concretas), así
-- que una columna nueva nace ILEGIBLE para `authenticated` y la pantalla
-- recibiría un 403 al pedirla. No identifica a nadie del equipo —es el id
-- de una conversación que quien lee ya puede leer—, así que se concede.
grant select (source_conversation_id) on public.requests to authenticated;

-- ============================================================
-- convert_conversation_to_request — igual que estaba, más la procedencia.
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

  update public.requests
  set source_conversation_id = p_conversation_id
  where id = v_request_id;

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

comment on function public.convert_conversation_to_request(uuid, uuid[], text) is
  'RN-MSG-10 · §68: crea un BORRADOR con los mensajes señalados y sus
   adjuntos, nunca una solicitud enviada. Lo que lo separa de enviarla es
   la revisión de §68 (alcance, destinatario y archivos), que ocurre
   después sobre el borrador; el contador de primera atención no arranca
   hasta submit_request() (RN-SLA-01).';

-- ============================================================
-- update_request_draft — "se revisa el ALCANCE".
-- ============================================================
-- RN-DAT-07 (versionado): cada cambio del alcance deja su versión, así que
-- lo que se envía y lo que se pegó de la conversación se pueden comparar
-- después. La versión 1 la escribió `create_request_draft()`; esta función
-- escribe las siguientes, que es lo que la migración 20260830000017 dejó
-- pendiente de que existiera una pantalla.
--
-- Solo mientras es borrador. Un cambio de alcance con la solicitud ya
-- enviada tiene su propio camino en el PRD y no es este (RN-SLA-08: el
-- equipo cambia el alcance y el cliente vuelve a aceptar).
create or replace function public.update_request_draft(
  p_request_id uuid,
  p_description text,
  p_context text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_old_description text;
  v_old_context text;
  v_context text;
  v_version integer;
begin
  -- La fila se bloquea antes de mirarla: dos revisiones simultáneas del
  -- mismo borrador no pueden escribir la misma `version_number` (la tabla
  -- tiene unique (request_id, version_number), así que sin el bloqueo una
  -- de las dos reventaría con un error de clave duplicada).
  select r.space_id, r.establishment_id, r.state, r.description, r.context
  into v_space_id, v_establishment_id, v_state, v_old_description, v_old_context
  from public.requests r where r.id = p_request_id for update;

  if v_state is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state <> 'draft' then
    raise exception 'Solo se puede cambiar el alcance mientras la solicitud es un borrador';
  end if;

  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'La descripción de la solicitud no puede estar vacía';
  end if;

  v_context := nullif(btrim(coalesce(p_context, '')), '');

  -- Guardar sin cambiar nada no es una versión nueva: RN-DAT-07 versiona
  -- cambios, y un historial lleno de versiones idénticas no dice nada.
  if p_description = v_old_description and v_context is not distinct from v_old_context then
    select max(rv.version_number) into v_version
    from public.request_versions rv where rv.request_id = p_request_id;
    return v_version;
  end if;

  update public.requests
  set description = p_description, context = v_context
  where id = p_request_id;

  select coalesce(max(rv.version_number), 0) + 1 into v_version
  from public.request_versions rv where rv.request_id = p_request_id;

  insert into public.request_versions (space_id, request_id, version_number, description, context, created_by)
  values (v_space_id, p_request_id, v_version, p_description, v_context, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'request.draft_updated', 'request', p_request_id,
          jsonb_build_object('description', v_old_description, 'context', v_old_context),
          jsonb_build_object('description', p_description, 'context', v_context, 'version', v_version));

  return v_version;
end;
$$;

comment on function public.update_request_draft(uuid, text, text) is
  '§68 · "antes de enviar se revisa el alcance". Solo en estado draft y
   solo desde el lado del restaurante (can_write_establishment, la misma
   frontera que create_request_draft). Deja versión en request_versions
   (RN-DAT-07) y apunte en audit_log.';

-- ============================================================
-- Los archivos del borrador — "se revisan los ARCHIVOS".
-- ============================================================
-- Los adjuntos de una solicitud son los enlaces de `file_links` con
-- `entity_type = 'request'`: los que arrastró la conversión y los que
-- espeja `request_attachments` desde el Hito 4. Revisar quiere decir poder
-- quitar uno que no venía a cuento y poder añadir el que faltaba.
create or replace function public.attach_file_to_request_draft(
  p_request_id uuid,
  p_file_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_file_establishment uuid;
  v_file_name text;
begin
  select r.space_id, r.establishment_id, r.state
  into v_space_id, v_establishment_id, v_state
  from public.requests r where r.id = p_request_id;

  if v_state is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state <> 'draft' then
    raise exception 'Solo se pueden cambiar los archivos mientras la solicitud es un borrador';
  end if;

  -- Que quien adjunta pueda VER el archivo. Sin esto, adjuntar sería una
  -- forma de hacer visible a los demás un archivo ajeno con solo saber su
  -- identificador (el mismo control que attach_file_to_message()).
  if not public.can_read_file(p_file_id) then
    raise exception 'No tienes acceso a ese archivo';
  end if;

  select f.establishment_id, f.name into v_file_establishment, v_file_name
  from public.files f where f.id = p_file_id;

  if v_file_establishment is distinct from v_establishment_id then
    raise exception 'El archivo es de otro establecimiento';
  end if;

  perform public.link_file(p_file_id, 'request', p_request_id, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'request.draft_file_attached', 'request', p_request_id,
          jsonb_build_object('file_id', p_file_id, 'file_name', v_file_name));
end;
$$;

comment on function public.attach_file_to_request_draft(uuid, uuid) is
  '§68 · añadir un archivo al borrador antes de enviarlo. Solo en estado
   draft, solo un archivo del mismo establecimiento y solo si quien
   adjunta ya podía verlo (can_read_file).';

-- Quitar un archivo del borrador NO es el borrado físico que CLAUDE.md
-- prohíbe, y la diferencia importa: lo que se borra es la FILA DE ENLACE
-- entre un archivo y un borrador, creada hace un momento por la propia
-- conversión. El archivo sigue entero en el catálogo con todas sus
-- versiones (`files`, `file_versions`), sigue enlazado al mensaje del que
-- vino y se sigue viendo en la conversación. Y solo se puede mientras la
-- solicitud es un borrador: en cuanto se envía, ese enlace es lo que
-- RN-ARC-07 llama "vinculado a una operación" y ya no se toca.
--
-- La alternativa —marcar el enlace como retirado en vez de borrarlo—
-- obligaría a que las cinco pantallas que hoy leen `file_links` filtraran
-- la marca, y la que se olvidara enseñaría el archivo que alguien quitó a
-- propósito.
create or replace function public.detach_file_from_request_draft(
  p_request_id uuid,
  p_file_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_file_name text;
  v_removed integer;
begin
  select r.space_id, r.establishment_id, r.state
  into v_space_id, v_establishment_id, v_state
  from public.requests r where r.id = p_request_id;

  if v_state is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state <> 'draft' then
    raise exception 'Solo se pueden cambiar los archivos mientras la solicitud es un borrador';
  end if;

  select f.name into v_file_name from public.files f where f.id = p_file_id;

  delete from public.file_links
  where file_id = p_file_id and entity_type = 'request' and entity_id = p_request_id;

  get diagnostics v_removed = row_count;

  if v_removed = 0 then
    raise exception 'Ese archivo no está en este borrador';
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value)
  values (v_space_id, auth.uid(), 'request.draft_file_detached', 'request', p_request_id,
          jsonb_build_object('file_id', p_file_id, 'file_name', v_file_name));
end;
$$;

comment on function public.detach_file_from_request_draft(uuid, uuid) is
  '§68 · quitar del borrador un archivo que se arrastró y no venía a
   cuento. Borra el ENLACE, nunca el archivo: el catálogo y la
   conversación lo conservan. Solo en estado draft.';

-- ============================================================
-- Privilegios (CLAUDE.md: Supabase concede EXECUTE por defecto a `anon` y
-- `authenticated` sobre toda función nueva).
-- ============================================================
-- Las tres comprueban el permiso por su cuenta, así que `authenticated`
-- las conserva; `anon` no tiene nada que hacer aquí (sin sesión,
-- `auth.uid()` es null y `can_write_establishment()` es falso para todo,
-- pero no se confía en eso: se le quita el EXECUTE).
-- Ninguna aparece dentro de una política de RLS, así que revocarle a
-- `anon` no rompe ninguna.
-- Y de paso la que ya existía: `convert_conversation_to_request()` nació
-- en el Hito 7 con el EXECUTE que Supabase concede por defecto y nadie se
-- lo quitó a `anon`. No era explotable —comprueba `can_read_conversation()`
-- por su cuenta, y sin sesión `auth.uid()` es null, así que devuelve
-- falso—, pero dejar abierta a quien no ha iniciado sesión una función que
-- ESCRIBE es exactamente lo que CLAUDE.md manda cerrar, y comprobado en
-- vivo el 04/09/2026 seguía abierta en el proyecto.
revoke all on function public.convert_conversation_to_request(uuid, uuid[], text) from public, anon;
revoke all on function public.update_request_draft(uuid, text, text) from public, anon;
revoke all on function public.attach_file_to_request_draft(uuid, uuid) from public, anon;
revoke all on function public.detach_file_from_request_draft(uuid, uuid) from public, anon;
