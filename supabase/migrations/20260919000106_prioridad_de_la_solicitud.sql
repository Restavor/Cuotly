-- ============================================================
-- Migración 106 · La prioridad de la solicitud (RN-REQ-05/06, decisión 49)
-- ============================================================
--
-- El diseño definitivo móvil (página 63, "Nueva solicitud") pide dos
-- campos nuevos, los dos **obligatorios**: "Prioridad" —Alta, Media,
-- Baja— y "Motivo de la prioridad", de 200 caracteres.
--
-- **Esto NO sustituye al orden 1..N de la migración 62**, y esa fue la
-- decisión difícil. Bosco razonó el 10/09/2026 que una etiqueta no dice
-- cuál va antes entre dos "Media", y sigue siendo verdad. Lo que el diseño
-- añade es otra cosa: que **cualquier** restaurante pueda decir cuánto le
-- corre cada solicitud **al pedirla**, y por qué. El orden 1..N sigue
-- siendo del plan que lo concede y se pone después, sobre lo pendiente.
--
-- Dos datos parecidos con nombres parecidos se confunden, así que en
-- pantalla se llaman distinto: "Prioridad" es esto, y al 1..N se le llama
-- "Orden de importancia", que ya es como se titula su propia pantalla.
--
-- **Dónde se exige.** No al guardar el borrador —el diseño tiene un botón
-- "Guardar borrador" y a medio escribir todavía no se sabe— sino al
-- **enviar**. Un borrador incompleto es un borrador; una solicitud enviada
-- sin decir cuánto corre es la que obliga a preguntar por mensaje.

-- ------------------------------------------------------------
-- 1 · Los dos campos
-- ------------------------------------------------------------
alter table public.requests
  add column priority text
    check (priority is null or priority in ('high', 'medium', 'low')),
  add column priority_reason text
    check (priority_reason is null or char_length(priority_reason) <= 200);

comment on column public.requests.priority is
  'RN-REQ-05 · cuánto le corre al restaurante esta solicitud: high, medium
   o low (Alta, Media, Baja). La pone el cliente al crearla y NO es un
   compromiso de Cuotly (RN-REQ-06): no cambia plazos ni reordena la cola.
   No confundir con `priority_rank`, que es el orden 1..N del plan que
   concede prioridad (RN-PRI, migración 62).';

comment on column public.requests.priority_reason is
  'RN-REQ-05 · por qué le corre, en 200 caracteres. Obligatorio al enviar,
   como la prioridad.';

-- `requests` tiene los privilegios revocados y las columnas concedidas una
-- a una (CLAUDE.md), así que una columna nueva nace sin permiso para
-- nadie: se guardaría y no la leería ni quien la escribió.
grant select (priority, priority_reason) on public.requests to authenticated;

-- ------------------------------------------------------------
-- 2 · Se escriben mientras es borrador
-- ------------------------------------------------------------
--
-- Los dos parámetros son opcionales y `null` significa **no tocar**, no
-- "borrar": esta función se llama desde la pantalla de alcance, que no
-- tiene estos campos, y un `null` que borrara dejaría sin prioridad una
-- solicitud por editarle la descripción.
--
-- Para vaciarlos a propósito se manda cadena vacía, que es lo que envía un
-- formulario con el campo en blanco.
create or replace function public.update_request_draft(
  p_request_id uuid,
  p_description text,
  p_context text default null,
  p_priority text default null,
  p_priority_reason text default null
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
  v_priority text;
  v_reason text;
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

  -- RN-REQ-05 · la prioridad y su motivo, si vienen.
  if p_priority is not null then
    v_priority := nullif(btrim(p_priority), '');
    if v_priority is not null and v_priority not in ('high', 'medium', 'low') then
      raise exception 'La prioridad tiene que ser alta, media o baja';
    end if;
    update public.requests set priority = v_priority where id = p_request_id;
  end if;

  if p_priority_reason is not null then
    v_reason := nullif(btrim(p_priority_reason), '');
    if v_reason is not null and char_length(v_reason) > 200 then
      raise exception 'El motivo de la prioridad no puede pasar de 200 caracteres';
    end if;
    update public.requests set priority_reason = v_reason where id = p_request_id;
  end if;

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

comment on function public.update_request_draft(uuid, text, text, text, text) is
  'RN-REQ-05 · el alcance del borrador, con su prioridad y motivo. Los dos
   últimos son opcionales y `null` es NO TOCAR: la pantalla de alcance no
   los trae, y un null que borrara dejaría sin prioridad una solicitud por
   editarle la descripción.';

revoke all on function public.update_request_draft(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.update_request_draft(uuid, text, text, text, text)
  to authenticated;

-- La de tres se borra: dos firmas del mismo nombre con distinta idea de lo
-- que lleva un borrador es justo lo que esto viene a evitar, y PostgREST
-- elegiría cualquiera.
drop function if exists public.update_request_draft(uuid, text, text);

-- ------------------------------------------------------------
-- 2b · Y se pueden poner ya al crear el borrador
-- ------------------------------------------------------------
--
-- La pantalla del diseño es **una sola**: los platos, la prioridad y su
-- motivo se escriben antes de pulsar nada. Que crear el borrador los
-- acepte evita el ida y vuelta de crear y luego actualizar, que es una
-- llamada más para escribir lo que ya estaba en el formulario.
--
-- Siguen siendo opcionales **aquí**: el botón "Guardar borrador" del
-- diseño existe justamente para guardar a medias. Lo que no se puede es
-- enviarlo así (parte 3).
create or replace function public.create_request_draft(
  p_establishment_id uuid,
  p_description text,
  p_context text default null,
  p_priority text default null,
  p_priority_reason text default null
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
  v_priority text := nullif(btrim(coalesce(p_priority, '')), '');
  v_reason text := nullif(btrim(coalesce(p_priority_reason, '')), '');
begin
  if not public.can_write_establishment(p_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'La descripción de la solicitud no puede estar vacía';
  end if;

  if v_priority is not null and v_priority not in ('high', 'medium', 'low') then
    raise exception 'La prioridad tiene que ser alta, media o baja';
  end if;

  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'El motivo de la prioridad no puede pasar de 200 caracteres';
  end if;

  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  v_code := public.next_request_code(p_establishment_id);

  insert into public.requests
    (space_id, establishment_id, code, state, description, context, priority, priority_reason, created_by)
  values
    (v_space_id, p_establishment_id, v_code, 'draft', p_description, p_context,
     v_priority, v_reason, auth.uid())
  returning id into v_request_id;

  insert into public.request_versions (space_id, request_id, version_number, description, context, created_by)
  values (v_space_id, v_request_id, 1, p_description, p_context, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'request.draft_created', 'request', v_request_id,
          jsonb_build_object('code', v_code, 'priority', v_priority));

  return v_request_id;
end;
$$;

comment on function public.create_request_draft(uuid, text, text, text, text) is
  'RN-REQ-05 · el borrador, con su prioridad y motivo si ya se saben. Son
   opcionales aquí porque "Guardar borrador" existe para guardar a medias;
   lo que no se puede es ENVIARLO sin ellos.';

revoke all on function public.create_request_draft(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.create_request_draft(uuid, text, text, text, text)
  to authenticated;

drop function if exists public.create_request_draft(uuid, text, text);

-- ------------------------------------------------------------
-- 3 · Se exigen al ENVIAR, no al guardar
-- ------------------------------------------------------------
--
-- El diseño tiene dos botones —"Guardar borrador" y "Enviar solicitud"— y
-- la regla se pone en el segundo. A medio escribir todavía no se sabe
-- cuánto corre; lo que no puede pasar es que una solicitud llegue al
-- equipo sin decirlo, porque entonces hay que preguntarlo por mensaje y se
-- pierde un día.
--
-- **Se comprueba en el servidor y no solo con el `required` del
-- formulario** (CLAUDE.md): quien llame a la función por RPC recibe el
-- mismo "no".
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
  v_priority text;
  v_reason text;
begin
  select space_id, establishment_id, state, priority, priority_reason
  into v_space_id, v_establishment_id, v_state, v_priority, v_reason
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

  -- RN-REQ-05 · los dos, y con este orden de mensajes: primero falta la
  -- prioridad y después su motivo, que es el orden en que están en la
  -- pantalla.
  if v_priority is null then
    raise exception 'Elige la prioridad antes de enviar la solicitud';
  end if;

  if nullif(btrim(coalesce(v_reason, '')), '') is null then
    raise exception 'Escribe el motivo de la prioridad antes de enviar la solicitud';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.requests set state = 'received' where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'started', now(), auth.uid());

  -- §18, fila 1: "Nueva solicitud sin asignar -> propietario y todos los
  -- administradores".
  declare
    v_destinatario uuid;
  begin
    for v_destinatario in
      select sm.user_id from public.space_memberships sm
      where sm.space_id = v_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
    loop
      perform public.emit_notification(
        v_space_id, v_destinatario, 'request_submitted', 'staff', 'request', p_request_id,
        '/espacios/' || public.space_slug(v_space_id) || '/solicitudes/' || p_request_id::text,
        'request_submitted:' || p_request_id::text, v_establishment_id);
    end loop;
  end;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'request.submitted', 'request', p_request_id,
          jsonb_build_object('state', 'draft'),
          jsonb_build_object('state', 'received', 'priority', v_priority));
end;
$$;

comment on function public.submit_request(uuid) is
  'RN-REQ-05 · envía la solicitud, y no la deja salir sin prioridad ni
   motivo. Sigue siendo idempotente: enviar dos veces no hace nada la
   segunda.';

revoke all on function public.submit_request(uuid) from public, anon;
grant execute on function public.submit_request(uuid) to authenticated;
