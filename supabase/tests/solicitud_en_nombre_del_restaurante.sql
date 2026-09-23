-- ============================================================
-- Suite 73 · Crear una solicitud en nombre del restaurante
--            (M77; PRD RN-REQ-08, decisión 73, migración 132)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · **Quién**: propietario y administradores del espacio. Un trabajador
--     y el propio restaurante reciben un "no" del SERVIDOR aunque llamen
--     por RPC (CLAUDE.md: ocultar un botón no es un control).
--   · **Se envía en un paso**: nace en `received`, con T1 en marcha y el
--     apunte `request.submitted` que lee el seguimiento del restaurante.
--   · **Constancia**: marca en la fila, motivo obligatorio, auditoría con
--     `on_behalf_of_client` y aviso a los propietarios del restaurante. El
--     restaurante lee la marca y el motivo, nunca quién (P7).
--   · **Idempotencia**: dos pulsaciones, una solicitud.
--   · **La categoría del equipo sustituye a la IA**: propuesta con
--     `source = 'team'`, a validación interna, sin apunte de IA.
--   · **La aceptación sigue siendo del restaurante**: el equipo no la da.
--   · **Las puertas del restaurante siguen cerradas al equipo**:
--     `create_request_draft()` no se abre por esto.
--
-- Prefijo de esta suite: d7700000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('d7700000-0000-0000-0000-000000000001', 'duena@suite73.test', 'authenticated', 'authenticated'),
  ('d7700000-0000-0000-0000-000000000002', 'admin@suite73.test', 'authenticated', 'authenticated'),
  ('d7700000-0000-0000-0000-000000000003', 'trabajador@suite73.test', 'authenticated', 'authenticated'),
  ('d7700000-0000-0000-0000-000000000004', 'cliente@suite73.test', 'authenticated', 'authenticated'),
  ('d7700000-0000-0000-0000-000000000005', 'global@suite73.test', 'authenticated', 'authenticated'),
  ('d7700000-0000-0000-0000-000000000006', 'editor@suite73.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d7700000-0000-0000-0000-000000000001', 'duena@suite73.test', 'Dueña 73'),
  ('d7700000-0000-0000-0000-000000000002', 'admin@suite73.test', 'Admin 73'),
  ('d7700000-0000-0000-0000-000000000003', 'trabajador@suite73.test', 'Trabajador 73'),
  ('d7700000-0000-0000-0000-000000000004', 'cliente@suite73.test', 'Cliente 73'),
  ('d7700000-0000-0000-0000-000000000005', 'global@suite73.test', 'Global 73'),
  ('d7700000-0000-0000-0000-000000000006', 'editor@suite73.test', 'Editor 73')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by)
values ('d7700000-0000-0000-0000-000000000010', 'Espacio 73', 'espacio-73', 'Europe/Madrid',
        'd7700000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d7700000-0000-0000-0000-000000000010', 'd7700000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d7700000-0000-0000-0000-000000000010', 'd7700000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('d7700000-0000-0000-0000-000000000010', 'd7700000-0000-0000-0000-000000000003', 'worker', 'active');

insert into public.groups (id, space_id, name)
values ('d7700000-0000-0000-0000-000000000015', 'd7700000-0000-0000-0000-000000000010', 'Grupo 73');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('d7700000-0000-0000-0000-000000000020', 'd7700000-0000-0000-0000-000000000010',
   'd7700000-0000-0000-0000-000000000015', 'R73A', 'Magariños 73', 'active'),
  ('d7700000-0000-0000-0000-000000000021', 'd7700000-0000-0000-0000-000000000010',
   'd7700000-0000-0000-0000-000000000015', 'R73B', 'Otro 73', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('d7700000-0000-0000-0000-000000000020', 'd7700000-0000-0000-0000-000000000004', 'local_owner'),
  ('d7700000-0000-0000-0000-000000000020', 'd7700000-0000-0000-0000-000000000006', 'editor');

insert into public.group_memberships (group_id, user_id, role)
values ('d7700000-0000-0000-0000-000000000015', 'd7700000-0000-0000-0000-000000000005', 'global_owner');

-- El trabajador, autorizado en el restaurante: si se le niega, es por la
-- capacidad y no por no llegar al restaurante.
insert into public.worker_establishments (space_id, user_id, establishment_id) values
  ('d7700000-0000-0000-0000-000000000010', 'd7700000-0000-0000-0000-000000000003',
   'd7700000-0000-0000-0000-000000000020');

-- Un archivo de cada restaurante.
insert into public.files (id, space_id, group_id, establishment_id, category, visibility, name, created_by) values
  ('d7700000-0000-0000-0000-000000000030', 'd7700000-0000-0000-0000-000000000010',
   'd7700000-0000-0000-0000-000000000015', 'd7700000-0000-0000-0000-000000000020',
   'requests_and_jobs', 'shared_with_client', 'nuevo-horario.pdf', 'd7700000-0000-0000-0000-000000000001'),
  ('d7700000-0000-0000-0000-000000000031', 'd7700000-0000-0000-0000-000000000010',
   'd7700000-0000-0000-0000-000000000015', 'd7700000-0000-0000-0000-000000000021',
   'requests_and_jobs', 'internal', 'de-otro.pdf', 'd7700000-0000-0000-0000-000000000001');

-- ------------------------------------------------------------
-- RN-REQ-08 · el propietario la crea y sale enviada, con su constancia
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'd7700000-0000-0000-0000-000000000001';

do $$
declare
  v_req uuid;
  v_row record;
begin
  v_req := public.create_request_on_behalf(
    'd7700000-0000-0000-0000-000000000020',
    'Actualizar el horario en la web, Google y redes: abrimos los lunes por la noche.',
    'high', 'Hay que publicarlo antes del 1 de octubre.',
    'Lo pidió la propietaria por teléfono el 23/09 a las 10:15.',
    'suite73-clave-1', null, null,
    array['d7700000-0000-0000-0000-000000000030']::uuid[]);

  set local role postgres;

  select state, created_by_team, on_behalf_reason, priority, created_by into v_row
  from public.requests where id = v_req;

  if v_row.state <> 'received' then
    raise exception 'RN-REQ-08 FALLA: nació en "%" y no enviada', v_row.state;
  end if;
  if v_row.created_by_team is not true
     or v_row.on_behalf_reason <> 'Lo pidió la propietaria por teléfono el 23/09 a las 10:15.' then
    raise exception 'RN-REQ-08 FALLA: la fila no quedó marcada con su motivo';
  end if;
  if v_row.priority <> 'high' then
    raise exception 'RN-REQ-08 FALLA: la prioridad no se guardó';
  end if;

  -- RN-SLA-01 · enviar arranca T1.
  if not exists (select 1 from public.timer_events
                 where entity_id = v_req and counter_kind = 't1' and event_type = 'started') then
    raise exception 'RN-REQ-08 FALLA: T1 no arrancó';
  end if;

  -- La versión 1 del alcance, como en cualquier otra.
  if not exists (select 1 from public.request_versions where request_id = v_req and version_number = 1) then
    raise exception 'RN-REQ-08 FALLA: no quedó la versión 1 del alcance';
  end if;

  -- El adjunto, enlazado.
  if not exists (select 1 from public.file_links
                 where entity_type = 'request' and entity_id = v_req
                   and file_id = 'd7700000-0000-0000-0000-000000000030') then
    raise exception 'RN-REQ-08 FALLA: el adjunto no quedó enlazado';
  end if;

  -- La auditoría: `request.submitted` (la fecha de envío del seguimiento)
  -- con actor, en nombre del cliente y con el motivo.
  if not exists (
    select 1 from public.audit_log
    where entity_id = v_req and action = 'request.submitted'
      and actor_id = 'd7700000-0000-0000-0000-000000000001'
      and (new_value ->> 'on_behalf_of_client')::boolean
      and new_value ->> 'reason' = 'Lo pidió la propietaria por teléfono el 23/09 a las 10:15.'
  ) then
    raise exception 'RN-REQ-08 FALLA: falta el apunte de auditoría en nombre del restaurante';
  end if;

  -- El seguimiento del restaurante tiene fecha de envío.
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'd7700000-0000-0000-0000-000000000004';
  if (select submitted_at from public.client_request_milestones(v_req)) is null then
    raise exception 'RN-REQ-08 FALLA: el seguimiento del restaurante no tiene fecha de envío';
  end if;
  set local role postgres;

  -- Avisos: los dos propietarios del restaurante (local y global), y no el
  -- Editor; el administrador del espacio, y no quien la creó.
  if (select count(*) from public.notifications
      where entity_id = v_req and event_type = 'request_created_on_behalf'
        and recipient_id in ('d7700000-0000-0000-0000-000000000004',
                             'd7700000-0000-0000-0000-000000000005')) <> 2 then
    raise exception 'RN-REQ-08 FALLA: no se avisó a los dos propietarios del restaurante';
  end if;
  if exists (select 1 from public.notifications
             where entity_id = v_req and recipient_id = 'd7700000-0000-0000-0000-000000000006') then
    raise exception 'RN-REQ-08 FALLA: se avisó al Editor, que no responde por el restaurante';
  end if;
  if not exists (select 1 from public.notifications
                 where entity_id = v_req and event_type = 'request_submitted'
                   and recipient_id = 'd7700000-0000-0000-0000-000000000002') then
    raise exception 'RN-REQ-08 FALLA: el administrador no se enteró de la solicitud nueva';
  end if;
  if exists (select 1 from public.notifications
             where entity_id = v_req and recipient_id = 'd7700000-0000-0000-0000-000000000001') then
    raise exception 'RN-REQ-08 FALLA: se avisó a quien la creó';
  end if;

  -- Sin categoría no hay propuesta del equipo: la hará la IA.
  if exists (select 1 from public.classifications where request_id = v_req) then
    raise exception 'RN-REQ-08 FALLA: sin categoría se inventó una propuesta';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-REQ-08 · pulsar dos veces es una solicitud
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'd7700000-0000-0000-0000-000000000002';

do $$
declare
  v_a uuid;
  v_b uuid;
begin
  v_a := public.create_request_on_behalf(
    'd7700000-0000-0000-0000-000000000020', 'Cambiar la foto de portada', 'low',
    'Cuando podáis.', 'Por correo el 22/09.', 'suite73-clave-2');
  v_b := public.create_request_on_behalf(
    'd7700000-0000-0000-0000-000000000020', 'Cambiar la foto de portada', 'low',
    'Cuando podáis.', 'Por correo el 22/09.', 'suite73-clave-2');

  if v_a <> v_b then
    raise exception 'RN-REQ-08 FALLA: la misma clave creó dos solicitudes';
  end if;

  set local role postgres;
  if (select count(*) from public.requests where creation_idempotency_key = 'suite73-clave-2') <> 1 then
    raise exception 'RN-REQ-08 FALLA: hay más de una fila con la misma clave';
  end if;
  if (select count(*) from public.audit_log where entity_id = v_a and action = 'request.submitted') <> 1 then
    raise exception 'RN-REQ-08 FALLA: la segunda pulsación dejó otro apunte';
  end if;
  set local role authenticated;

  -- La misma clave para otro restaurante no es "la misma pulsación".
  begin
    perform public.create_request_on_behalf(
      'd7700000-0000-0000-0000-000000000021', 'Otra', 'low', 'x', 'Por correo.', 'suite73-clave-2');
    raise exception 'RN-REQ-08 FALLA: una clave usada sirvió para otro restaurante';
  exception
    when others then
      if sqlerrm like 'RN-REQ-08 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- RN-REQ-08 · lo obligatorio lo exige el servidor
-- ------------------------------------------------------------
do $$
declare
  v_caso text;
begin
  foreach v_caso in array array['sin motivo', 'motivo largo', 'sin prioridad', 'sin motivo de prioridad',
                                'categoria rara', 'sin clave', 'sin descripcion', 'archivo ajeno'] loop
    begin
      perform public.create_request_on_behalf(
        'd7700000-0000-0000-0000-000000000020',
        case when v_caso = 'sin descripcion' then '  ' else 'Algo' end,
        case when v_caso = 'sin prioridad' then null else 'medium' end,
        case when v_caso = 'sin motivo de prioridad' then '' else 'Porque sí' end,
        case v_caso when 'sin motivo' then '   ' when 'motivo largo' then repeat('x', 501)
                    else 'Por teléfono.' end,
        case when v_caso = 'sin clave' then null else 'suite73-' || v_caso end,
        null,
        case when v_caso = 'categoria rara' then 'huge' else null end,
        case when v_caso = 'archivo ajeno'
             then array['d7700000-0000-0000-0000-000000000031']::uuid[] else null end);
      raise exception 'RN-REQ-08 FALLA: se aceptó el caso "%"', v_caso;
    exception
      when others then
        if sqlerrm like 'RN-REQ-08 FALLA%' then raise; end if;
    end;
  end loop;

  -- Ningún intento fallido dejó fila a medias.
  set local role postgres;
  if exists (select 1 from public.requests where creation_idempotency_key like 'suite73-%'
               and creation_idempotency_key not in ('suite73-clave-1', 'suite73-clave-2')) then
    raise exception 'RN-REQ-08 FALLA: un intento rechazado dejó una solicitud';
  end if;
  set local role authenticated;
end;
$$;

-- ------------------------------------------------------------
-- RN-REQ-08 · ni el trabajador ni el restaurante; y sin sesión, nada
-- ------------------------------------------------------------
do $$
declare
  v_quien uuid;
begin
  foreach v_quien in array array['d7700000-0000-0000-0000-000000000003',
                                 'd7700000-0000-0000-0000-000000000004',
                                 'd7700000-0000-0000-0000-000000000005']::uuid[] loop
    perform set_config('request.jwt.claim.sub', v_quien::text, true);
    begin
      perform public.create_request_on_behalf(
        'd7700000-0000-0000-0000-000000000020', 'Algo', 'medium', 'Porque sí',
        'Por teléfono.', 'suite73-intruso-' || v_quien::text);
      raise exception 'RN-REQ-08 FALLA: % creó una solicitud en nombre del restaurante', v_quien;
    exception
      when others then
        if sqlerrm like 'RN-REQ-08 FALLA%' then raise; end if;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub', 'd7700000-0000-0000-0000-000000000001', true);
end;
$$;

set local role postgres;
do $$
begin
  if has_function_privilege('anon',
       'public.create_request_on_behalf(uuid, text, text, text, text, text, text, text, uuid[])',
       'execute') then
    raise exception 'RN-REQ-08 FALLA: anon puede ejecutar create_request_on_behalf()';
  end if;
  if not has_function_privilege('authenticated',
       'public.create_request_on_behalf(uuid, text, text, text, text, text, text, text, uuid[])',
       'execute') then
    raise exception 'RN-REQ-08 FALLA: authenticated no puede ejecutar create_request_on_behalf()';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-REQ-08 · las puertas del restaurante siguen siendo suyas
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'd7700000-0000-0000-0000-000000000001';

do $$
begin
  begin
    perform public.create_request_draft(
      'd7700000-0000-0000-0000-000000000020', 'Un borrador del equipo', null, 'low', 'x');
    raise exception 'RN-REQ-08 FALLA: el equipo abrió un borrador por la puerta del restaurante';
  exception
    when others then
      if sqlerrm like 'RN-REQ-08 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- RN-REQ-08 · el restaurante lee la marca y el motivo, no quién (P7)
-- ------------------------------------------------------------
set local role postgres;
do $$
begin
  if not has_column_privilege('authenticated', 'public.requests', 'created_by_team', 'select')
     or not has_column_privilege('authenticated', 'public.requests', 'on_behalf_reason', 'select') then
    raise exception 'RN-REQ-08 FALLA: el restaurante no puede leer la marca o el motivo';
  end if;
  if has_column_privilege('authenticated', 'public.requests', 'creation_idempotency_key', 'select') then
    raise exception 'RN-REQ-08 FALLA: la clave de idempotencia se concedió a authenticated';
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = 'd7700000-0000-0000-0000-000000000004';
do $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.requests
  where establishment_id = 'd7700000-0000-0000-0000-000000000020'
    and created_by_team and on_behalf_reason is not null;
  if v_n < 2 then
    raise exception 'RN-REQ-08 FALLA: el restaurante no ve sus solicitudes creadas por el equipo (ve %)', v_n;
  end if;

  -- P7 · `created_by` de `requests` y de `request_versions` SÍ los lee el
  -- restaurante por columna (migración 27). En una solicitud del equipo
  -- no pueden llevar a nadie del equipo: van vacías.
  if exists (
    select 1 from public.requests r
    where r.establishment_id = 'd7700000-0000-0000-0000-000000000020'
      and r.created_by_team and r.created_by is not null
  ) then
    raise exception 'RN-REQ-08 FALLA (P7): el restaurante lee en created_by quién del equipo la creó';
  end if;
  if exists (
    select 1 from public.request_versions rv
    join public.requests r on r.id = rv.request_id
    where r.establishment_id = 'd7700000-0000-0000-0000-000000000020'
      and r.created_by_team and rv.created_by is not null
  ) then
    raise exception 'RN-REQ-08 FALLA (P7): el restaurante lee en request_versions.created_by quién del equipo la escribió';
  end if;
  if not exists (
    select 1 from public.request_versions rv
    join public.requests r on r.id = rv.request_id
    where r.establishment_id = 'd7700000-0000-0000-0000-000000000020' and r.created_by_team
  ) then
    raise exception 'RN-REQ-08 FALLA: la comprobación de request_versions no vio ninguna fila (sería vacua)';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-REQ-08 · la categoría del equipo sustituye a la IA y no a la
-- validación; la aceptación sigue siendo del restaurante
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'd7700000-0000-0000-0000-000000000001';

do $$
declare
  v_req uuid;
begin
  v_req := public.create_request_on_behalf(
    'd7700000-0000-0000-0000-000000000020', 'Subir la carta de otoño', 'medium',
    'La cambian el lunes.', 'En persona, en la visita del 20/09.', 'suite73-clave-3',
    'La carta en PDF la trae el lunes', 'small');

  set local role postgres;
  if (select state from public.requests where id = v_req) <> 'pending_internal_validation' then
    raise exception 'RN-REQ-08 FALLA: con categoría no quedó pendiente de validación interna';
  end if;
  if not exists (select 1 from public.classifications
                 where request_id = v_req and source = 'team' and proposed_category = 'small'
                   and decided_category is null) then
    raise exception 'RN-REQ-08 FALLA: la propuesta no es del equipo o ya salió validada';
  end if;
  if exists (select 1 from public.ai_usage where request_id = v_req) then
    raise exception 'RN-REQ-08 FALLA: se apuntó un consumo de IA que no hubo';
  end if;
  if (select validated_category from public.requests where id = v_req) is not null then
    raise exception 'RN-REQ-08 FALLA (RN-CLS-03): la categoría llegó validada sin pasar por validación';
  end if;
  set local role authenticated;

  -- La validación es la de siempre.
  perform public.validate_classification(v_req, 'small', 'Subir la carta de otoño.');

  set local role postgres;
  if (select state from public.requests where id = v_req) <> 'pending_client_acceptance' then
    raise exception 'RN-REQ-08 FALLA: validar no la llevó a pendiente de aceptación';
  end if;
  set local role authenticated;

  -- Y aceptar es del restaurante: el equipo no puede, aunque la creara.
  begin
    perform public.accept_request(v_req);
    raise exception 'RN-REQ-08 FALLA: el equipo aceptó la propuesta en nombre del restaurante';
  exception
    when others then
      if sqlerrm like 'RN-REQ-08 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- RN-REQ-08 · con el servicio detenido no entra (RN-EST-08)
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'd7700000-0000-0000-0000-000000000001';

do $$
begin
  perform public.set_establishment_status(
    'd7700000-0000-0000-0000-000000000021', 'paused', 'Impago de la cuota de septiembre');

  begin
    perform public.create_request_on_behalf(
      'd7700000-0000-0000-0000-000000000021', 'Algo', 'medium', 'x', 'Por teléfono.',
      'suite73-pausado');
    raise exception 'RN-REQ-08 FALLA: entró una solicitud en un restaurante con el servicio detenido';
  exception
    when others then
      if sqlerrm like 'RN-REQ-08 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- La marca y el motivo van juntos (el CHECK de la fila)
-- ------------------------------------------------------------
set local role postgres;
do $$
begin
  begin
    update public.requests set on_behalf_reason = null
    where creation_idempotency_key = 'suite73-clave-1';
    raise exception 'RN-REQ-08 FALLA: una solicitud del equipo se quedó sin motivo';
  exception
    when check_violation then null;
  end;

  -- Y una del equipo no puede llevar autor en la columna (P7).
  begin
    update public.requests set created_by = 'd7700000-0000-0000-0000-000000000001'
    where creation_idempotency_key = 'suite73-clave-1';
    raise exception 'RN-REQ-08 FALLA (P7): una solicitud del equipo aceptó un autor en created_by';
  exception
    when check_violation then null;
  end;
end;
$$;

rollback;
