-- Fase 4 · Hito 20 · onboarding del espacio nuevo y ciclo de vida del
-- espacio (migración 92; PRD §33, RN-CIC-01 a 15; §9, §127 y §141 de la
-- maestra).
--
--   · RN-CIC-01/02/03: los diez pasos, derivados del dato o confirmados,
--     y solo por el propietario.
--   · RN-CIC-04: el sello del final, una vez.
--   · RN-CIC-05: transferir mueve la propiedad y deja administrador a
--     quien la da; Modo soporte no la transfiere.
--   · RN-CIC-06: el último propietario no se puede quitar, ni por función
--     ni por UPDATE directo.
--   · RN-CIC-07/08/09: archivar congela el espacio, lo deja recuperable
--     30 días y PROGRAMA la eliminación sin borrar nada.
--   · RN-CIC-10/11: exportar, y que el restaurante no se lleve ni una
--     fila ni una columna de más.
--   · RN-CIC-12: qué impide cerrar una cuenta.
--   · RN-CIC-13/15: auditoría y los dos avisos obligatorios.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/onboarding_y_ciclo_de_vida_del_espacio.sql

insert into auth.users (id, email, role, aud) values
  ('c1c00000-0000-0000-0000-000000000001', 'cic-propietaria@example.com', 'authenticated', 'authenticated'),
  ('c1c00000-0000-0000-0000-000000000002', 'cic-admin@example.com', 'authenticated', 'authenticated'),
  ('c1c00000-0000-0000-0000-000000000003', 'cic-trabajador@example.com', 'authenticated', 'authenticated'),
  ('c1c00000-0000-0000-0000-000000000004', 'cic-restaurante@example.com', 'authenticated', 'authenticated'),
  ('c1c00000-0000-0000-0000-000000000005', 'cic-cuotly@example.com', 'authenticated', 'authenticated'),
  ('c1c00000-0000-0000-0000-000000000006', 'cic-ajena@example.com', 'authenticated', 'authenticated');

-- §167 · un Administrador de Cuotly con los tres permisos, para Modo
-- soporte y para la restauración tardía.
insert into public.platform_roles (user_id, role, can_approve_spaces, can_manage_subscriptions, can_support) values
  ('c1c00000-0000-0000-0000-000000000005', 'cuotly_admin', true, true, true);

-- RN-ADM-02 · sin este reclamo, quien lleva el sombrero de plataforma es
-- un usuario normal y media suite pasaría por el motivo equivocado.
select set_config('request.jwt.claim.aal', 'aal2', false);

create temp table cic_ids (k text primary key, v uuid);
grant select, insert, update on cic_ids to authenticated, service_role;

-- ============================================================
-- Fixture · un espacio recién aprobado, como lo deja el Hito 17
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  -- Con los datos fiscales de §10: son los que el espacio hereda al
  -- aprobarse, y lo que hace que el paso 1 del asistente nazca hecho.
  v_id := public.save_space_request_draft(
    'Bodega Miralles', 'Nuria Miralles', 'nuria@miralles.test', 'pro',
    '600111222', 2, 4, 'Webs y menús',
    'Bodega Miralles SL', 'B12345678', 'Calle del Puerto 4, Vigo');
  perform public.submit_space_request(v_id);
  insert into cic_ids values ('sol', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  insert into cic_ids values ('espacio',
    public.approve_space_request((select v from cic_ids where k = 'sol'), 'cic-clave-1'));
end $$;
reset role;

-- El resto del equipo y un restaurante, sin RLS: es fixture, no lo que se
-- comprueba. La identidad vuelve a la propietaria porque
-- `next_space_sequence()` —que numera el establecimiento— exige ser
-- miembro del espacio, y eso lo mira por `auth.uid()`, no por el rol.
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
do $$
declare
  v_space uuid := (select v from cic_ids where k = 'espacio');
  v_group uuid;
  v_est uuid;
begin
  insert into public.space_memberships (space_id, user_id, role, status) values
    (v_space, 'c1c00000-0000-0000-0000-000000000002', 'admin', 'active');

  insert into public.groups (space_id, name) values (v_space, 'Grupo Miralles')
  returning id into v_group;
  insert into public.establishments (space_id, group_id, name) values (v_space, v_group, 'Bodega Centro')
  returning id into v_est;
  insert into public.group_memberships (group_id, user_id, role) values
    (v_group, 'c1c00000-0000-0000-0000-000000000004', 'global_owner');

  insert into cic_ids values ('grupo', v_group), ('est', v_est);
end $$;

-- Datos del restaurante en las tablas que SÍ llevan identidad del equipo
-- en una columna revocada: un cobro (`issued_by`), un mensaje del equipo
-- (`sender_id`), un archivo compartido (`created_by`) y una solicitud
-- validada (`validated_by`). Sin esto, el barrido de P7 de más abajo
-- recorrería dos tablas y pasaría por el motivo equivocado: el fixture
-- tiene que contener justo lo que podría filtrarse.
do $$
declare
  v_space uuid := (select v from cic_ids where k = 'espacio');
  v_group uuid := (select v from cic_ids where k = 'grupo');
  v_est uuid := (select v from cic_ids where k = 'est');
  v_plan uuid;
  v_sub uuid;
  v_req uuid;
  v_conv uuid;
  v_file uuid;
begin
  insert into public.plans (space_id, name, price_cents, start_sla_hours)
  values (v_space, 'Impulso', 39900, 24) returning id into v_plan;

  insert into public.subscriptions (space_id, establishment_id, kind, plan_id, created_by)
  values (v_space, v_est, 'plan', v_plan, 'c1c00000-0000-0000-0000-000000000001')
  returning id into v_sub;

  insert into public.charges
    (space_id, establishment_id, subscription_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_by)
  values (v_space, v_est, v_sub, 'Impulso · septiembre',
          now(), now() + interval '30 days', 39900, 21, 8379, 48279, now() + interval '7 days',
          'c1c00000-0000-0000-0000-000000000001');

  insert into public.requests
    (space_id, establishment_id, code, description, created_by, validated_by, validated_at,
     validated_category, state)
  values (v_space, v_est, 'SOL-CIC-1', 'Cambiar el teléfono de la web',
          'c1c00000-0000-0000-0000-000000000004',
          'c1c00000-0000-0000-0000-000000000003', now(), 'small', 'pending_client_acceptance')
  returning id into v_req;

  -- Una conversación de solicitud no lleva establecimiento: lo dice
  -- `conversations_owner_by_type`, que solo admite uno de los tres.
  insert into public.conversations (space_id, type, request_id)
  values (v_space, 'request', v_req) returning id into v_conv;

  insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
  values (v_conv, v_space, 'c1c00000-0000-0000-0000-000000000003', 'staff', 'Lo vemos hoy mismo.');

  insert into public.files
    (space_id, group_id, establishment_id, category, visibility, name, created_by)
  values (v_space, v_group, v_est, 'documents', 'shared_with_client', 'Presupuesto.pdf',
          'c1c00000-0000-0000-0000-000000000003')
  returning id into v_file;

  insert into public.file_versions
    (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, created_by)
  values (v_file, v_space, 1, 'files/cic/presupuesto.pdf', 'Presupuesto.pdf',
          'application/pdf', 1024, 'c1c00000-0000-0000-0000-000000000003');
end $$;

-- ============================================================
-- RN-CIC-01 · los diez pasos de §9, en su orden y sin ninguno más
-- ============================================================
do $$
declare v_pasos text[];
begin
  select array_agg(s.step order by s.ordinal) into v_pasos from public.onboarding_steps() s;

  if v_pasos <> array[
       'space_details', 'logo', 'timezone', 'working_hours', 'taxes',
       'plans_and_services', 'first_establishment', 'first_worker',
       'notifications', 'security'] then
    raise exception 'RN-CIC-01 FALLIDO: el asistente no son los diez pasos de §9 en su orden, sino %', v_pasos
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CIC-03 · el asistente es del propietario, y de nadie más
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_n integer;
begin
  begin
    select count(*) into v_n from public.space_onboarding_progress((select v from cic_ids where k = 'espacio'));
    raise exception 'RN-CIC-03 FALLIDO: un administrador del espacio ha visto el asistente'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  begin
    perform public.confirm_onboarding_step((select v from cic_ids where k = 'espacio'), 'timezone');
    raise exception 'RN-CIC-03 FALLIDO: un administrador del espacio ha confirmado un paso'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;
reset role;

-- ============================================================
-- RN-CIC-02 · seis pasos salen del dato y cuatro solo de una confirmación
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from cic_ids where k = 'espacio');
  v record;
begin
  -- Los datos fiscales llegaron de la solicitud aprobada, así que el paso
  -- 1 ya está hecho POR DATO y sin que nadie lo confirme.
  select * into v from public.space_onboarding_progress(v_space) p where p.step = 'space_details';
  if not v.done or v.source <> 'data' then
    raise exception 'RN-CIC-02 FALLIDO: los datos del espacio no se heredaron de la solicitud (hecho %, origen %)',
      v.done, v.source using errcode = 'assert_failure';
  end if;

  -- El primer establecimiento existe, y el primer trabajador todavía no.
  select * into v from public.space_onboarding_progress(v_space) p where p.step = 'first_establishment';
  if not v.done or v.source <> 'data' then
    raise exception 'RN-CIC-02 FALLIDO: el establecimiento del fixture no cuenta como paso hecho'
      using errcode = 'assert_failure';
  end if;

  select * into v from public.space_onboarding_progress(v_space) p where p.step = 'first_worker';
  if v.done then
    raise exception 'RN-CIC-02 FALLIDO: el paso del primer trabajador está hecho sin ningún trabajador'
      using errcode = 'assert_failure';
  end if;
  if v.source is not null then
    raise exception 'RN-CIC-02 FALLIDO: un paso pendiente se ha inventado un origen: %', v.source
      using errcode = 'assert_failure';
  end if;

  -- Los cuatro no derivables están pendientes por mucho que la base tenga
  -- ya `Europe/Madrid` y el 21 %: un valor por omisión no es una decisión.
  if exists (
    select 1 from public.space_onboarding_progress(v_space) p
    where p.step in ('timezone', 'taxes', 'notifications', 'security') and p.done
  ) then
    raise exception 'RN-CIC-02 FALLIDO: un paso no derivable se da por hecho sin que nadie lo confirme'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-CIC-02 · confirmar un paso lo completa, y se nota que fue confirmado
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from cic_ids where k = 'espacio');
  v record;
  v_confirmado timestamptz;
begin
  perform public.confirm_onboarding_step(v_space, 'timezone');

  select * into v from public.space_onboarding_progress(v_space) p where p.step = 'timezone';
  if not v.done or v.source <> 'confirmed' then
    raise exception 'RN-CIC-02 FALLIDO: confirmar la zona horaria no completó el paso (hecho %, origen %)',
      v.done, v.source using errcode = 'assert_failure';
  end if;
  v_confirmado := v.confirmed_at;

  -- Confirmarlo dos veces no escribe una fila nueva ni mueve la fecha: la
  -- confirmación es de cuando se hizo.
  perform public.confirm_onboarding_step(v_space, 'timezone');
  if (select count(*) from public.space_onboarding_confirmations
      where space_id = v_space and step = 'timezone') <> 1 then
    raise exception 'RN-CIC-02 FALLIDO: confirmar dos veces el mismo paso escribió dos filas'
      using errcode = 'assert_failure';
  end if;
  select * into v from public.space_onboarding_progress(v_space) p where p.step = 'timezone';
  if v.confirmed_at <> v_confirmado then
    raise exception 'RN-CIC-02 FALLIDO: reconfirmar movió la fecha del hecho'
      using errcode = 'assert_failure';
  end if;

  -- Un paso que no es de §9 no existe.
  begin
    perform public.confirm_onboarding_step(v_space, 'agente_cuotly');
    raise exception 'RN-CIC-01 FALLIDO: se ha confirmado un paso que §9 no nombra'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;
reset role;

-- ============================================================
-- RN-CIC-02 · un paso derivable se puede confirmar, y entonces el origen
-- lo dice: "confirmado", no "hecho"
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from cic_ids where k = 'espacio');
  v record;
begin
  -- Este espacio no quiere logotipo.
  perform public.confirm_onboarding_step(v_space, 'logo');

  select * into v from public.space_onboarding_progress(v_space) p where p.step = 'logo';
  if not v.done or v.source <> 'confirmed' then
    raise exception 'RN-CIC-02 FALLIDO: un paso derivable confirmado no se distingue de uno hecho por dato'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-CIC-04 · el asistente termina cuando los diez están hechos, y el
-- sello se pone una sola vez
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from cic_ids where k = 'espacio');
  v_paso text;
  v_terminado boolean;
  v_sello timestamptz;
begin
  -- Antes de completarlos, el sello no está puesto.
  if (select onboarding_completed_at from public.spaces where id = v_space) is not null then
    raise exception 'RN-CIC-04 FALLIDO: el asistente se selló con pasos pendientes'
      using errcode = 'assert_failure';
  end if;

  for v_paso in select s.step from public.onboarding_steps() s loop
    v_terminado := public.confirm_onboarding_step(v_space, v_paso);
  end loop;

  if not v_terminado then
    raise exception 'RN-CIC-04 FALLIDO: con los diez pasos hechos, el asistente no ha terminado'
      using errcode = 'assert_failure';
  end if;

  select onboarding_completed_at into v_sello from public.spaces where id = v_space;
  if v_sello is null then
    raise exception 'RN-CIC-04 FALLIDO: terminar el asistente no dejó fecha'
      using errcode = 'assert_failure';
  end if;

  -- RN-CIC-13 · terminar deja apunte.
  if not exists (
    select 1 from public.audit_log
    where space_id = v_space and action = 'space.onboarding_completed'
  ) then
    raise exception 'RN-CIC-13 FALLIDO: terminar el asistente no dejó apunte de auditoría'
      using errcode = 'assert_failure';
  end if;

  -- El sello no se vuelve a poner: es un hecho del pasado (§3.4).
  perform pg_sleep(0.01);
  perform public.confirm_onboarding_step(v_space, 'security');
  if (select onboarding_completed_at from public.spaces where id = v_space) <> v_sello then
    raise exception 'RN-CIC-04 FALLIDO: el sello del final se ha vuelto a escribir'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El trabajador entra en el equipo AQUÍ y no en el fixture, a propósito:
-- arriba se comprueba que el paso 8 del asistente está pendiente mientras
-- no hay ninguno, y meterlo antes habría hecho pasar esa comprobación por
-- el motivo equivocado. De aquí en adelante hace falta que esté dentro
-- para ver a quién avisa el archivado (RN-CIC-15).
insert into public.space_memberships (space_id, user_id, role, status)
values ((select v from cic_ids where k = 'espacio'),
        'c1c00000-0000-0000-0000-000000000003', 'worker', 'active');

-- ============================================================
-- RN-CIC-06 · el último propietario no se puede quitar, y el disparador
-- lo sostiene también contra un UPDATE directo
-- ============================================================
--
-- La comprobación clave del hito: `space_memberships_update_owner` deja al
-- propietario escribir su propia fila por PostgREST, así que si esto
-- viviera dentro de una función bastaría un `update` de una línea para
-- dejar el espacio sin dueño.
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_space uuid := (select v from cic_ids where k = 'espacio');
begin
  begin
    update public.space_memberships
    set role = 'admin'
    where space_id = v_space and user_id = 'c1c00000-0000-0000-0000-000000000001';
    raise exception 'RN-CIC-06 FALLIDO: el único propietario se ha degradado a sí mismo con un UPDATE directo'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  begin
    update public.space_memberships
    set status = 'inactive'
    where space_id = v_space and user_id = 'c1c00000-0000-0000-0000-000000000001';
    raise exception 'RN-CIC-06 FALLIDO: el único propietario se ha desactivado a sí mismo'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  -- El propietario siga siendo propietario activo después de los dos
  -- intentos: comprobar que salta la excepción no basta si mañana el
  -- camino cambia y deja de saltar.
  if not exists (
    select 1 from public.space_memberships
    where space_id = v_space and user_id = 'c1c00000-0000-0000-0000-000000000001'
      and role = 'owner' and status = 'active'
  ) then
    raise exception 'RN-CIC-06 FALLIDO: el espacio se ha quedado sin propietario activo'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Y el borrado, **sin RLS**: como `postgres`, que es como entran la cola y
-- los procesos del sistema. Aquí no hay política que valga y lo único que
-- protege al espacio es el disparador, que es justo lo que se comprueba.
do $$
declare v_space uuid := (select v from cic_ids where k = 'espacio');
begin
  begin
    delete from public.space_memberships
    where space_id = v_space and user_id = 'c1c00000-0000-0000-0000-000000000001';
    raise exception 'RN-CIC-06 FALLIDO: se ha borrado la pertenencia del único propietario sin RLS de por medio'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  if not exists (
    select 1 from public.space_memberships
    where space_id = v_space and user_id = 'c1c00000-0000-0000-0000-000000000001'
      and role = 'owner' and status = 'active'
  ) then
    raise exception 'RN-CIC-06 FALLIDO: el espacio se ha quedado sin propietario'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CIC-05 · transferir mueve la propiedad: el destinatario pasa a
-- propietario y quien transfiere, a administrador
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from cic_ids where k = 'espacio');
  v_op uuid;
  v_otra uuid;
begin
  -- A alguien que no está dentro, no: eso es invitar (HU-03).
  begin
    perform public.transfer_space_ownership(v_space, 'c1c00000-0000-0000-0000-000000000006', 'prueba');
    raise exception 'RN-CIC-05 FALLIDO: se ha transferido la propiedad a quien no es miembro del espacio'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  v_op := public.transfer_space_ownership(
    v_space, 'c1c00000-0000-0000-0000-000000000002', 'Nuria deja la empresa', 'cic-transfer-1');
  insert into cic_ids values ('transfer', v_op);

  if (select role from public.space_memberships
      where space_id = v_space and user_id = 'c1c00000-0000-0000-0000-000000000002') <> 'owner' then
    raise exception 'RN-CIC-05 FALLIDO: el destinatario no es propietario'
      using errcode = 'assert_failure';
  end if;
  if (select role from public.space_memberships
      where space_id = v_space and user_id = 'c1c00000-0000-0000-0000-000000000001') <> 'admin' then
    raise exception 'RN-CIC-05 FALLIDO: quien transfiere no quedó como administrador'
      using errcode = 'assert_failure';
  end if;

  -- RN-CIC-14 · pulsar dos veces con la misma clave devuelve la misma
  -- operación y no vuelve a mover nada.
  v_otra := public.transfer_space_ownership(
    v_space, 'c1c00000-0000-0000-0000-000000000001', 'repetido', 'cic-transfer-1');
  if v_otra <> v_op then
    raise exception 'RN-CIC-14 FALLIDO: la clave de idempotencia no detuvo la segunda transferencia'
      using errcode = 'assert_failure';
  end if;
  if (select role from public.space_memberships
      where space_id = v_space and user_id = 'c1c00000-0000-0000-0000-000000000002') <> 'owner' then
    raise exception 'RN-CIC-14 FALLIDO: la segunda llamada con la misma clave sí movió la propiedad'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- RN-CIC-13 y RN-CIC-15 · la transferencia deja apunte y avisa, y el
-- aviso es obligatorio.
do $$
declare v_space uuid := (select v from cic_ids where k = 'espacio');
begin
  if not exists (
    select 1 from public.audit_log
    where space_id = v_space and action = 'space.ownership_transferred'
      and new_value ->> 'owner_id' = 'c1c00000-0000-0000-0000-000000000002'
  ) then
    raise exception 'RN-CIC-13 FALLIDO: transferir la propiedad no dejó apunte con el nuevo dueño'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.notifications
    where space_id = v_space and event_type = 'space_ownership_transferred'
  ) then
    raise exception 'RN-CIC-15 FALLIDO: transferir la propiedad no avisó a nadie'
      using errcode = 'assert_failure';
  end if;

  if not public.notification_event_is_mandatory('space_ownership_transferred')
     or not public.notification_event_is_mandatory('space_archived_by_owner') then
    raise exception 'RN-CIC-15 FALLIDO: los dos avisos del hito se pueden desactivar'
      using errcode = 'assert_failure';
  end if;

  -- El trabajador no manda en el espacio y no recibe este aviso.
  if exists (
    select 1 from public.notifications
    where space_id = v_space and event_type = 'space_ownership_transferred'
      and recipient_id = 'c1c00000-0000-0000-0000-000000000003'
  ) then
    raise exception 'RN-CIC-15 FALLIDO: el aviso de la propiedad ha llegado a quien no manda'
      using errcode = 'assert_failure';
  end if;
end $$;

-- La propiedad vuelve a Nuria para lo que queda de suite.
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  perform public.transfer_space_ownership(
    (select v from cic_ids where k = 'espacio'),
    'c1c00000-0000-0000-0000-000000000001', 'vuelve', 'cic-transfer-2');
end $$;
reset role;

-- ============================================================
-- RN-CIC-10 y RN-CIC-11 · exportar (§141), antes de archivar
-- ============================================================
--
-- Se hace aquí y no al final a propósito: hace falta un espacio con datos
-- dentro, y más abajo lo archivamos.
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from cic_ids where k = 'espacio');
  v_export jsonb;
begin
  v_export := public.export_space(v_space, 'space');

  if (v_export ->> 'scope') <> 'space' or (v_export ->> 'table_count')::integer = 0 then
    raise exception 'RN-CIC-10 FALLIDO: la exportación del espacio ha salido vacía'
      using errcode = 'assert_failure';
  end if;
  -- Lo que el propietario se lleva incluye su auditoría, que es de donde
  -- §139 dice que sale quién hizo qué (CLAUDE.md).
  if not (v_export -> 'tables' ? 'audit_log') then
    raise exception 'RN-CIC-10 FALLIDO: la exportación del espacio no incluye su auditoría'
      using errcode = 'assert_failure';
  end if;

  insert into cic_ids values ('export', (v_export ->> 'export_id')::uuid);
end $$;
reset role;

-- RN-CIC-13 · §139 nombra las exportaciones, y el apunte no lo escribe
-- quien exporta: lo estampa el disparador.
do $$
begin
  if not exists (
    select 1 from public.audit_log
    where action = 'export.requested' and entity_type = 'export'
      and entity_id = (select v from cic_ids where k = 'export')
  ) then
    raise exception 'RN-CIC-13 FALLIDO: exportar no dejó apunte de auditoría'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CIC-11 · LA COMPROBACIÓN DELICADA DEL HITO
--
-- El propietario del restaurante exporta su grupo, y no se lleva ni una
-- fila ni una columna de la organización interna del equipo. El barrido
-- es el mismo que el del Hito 7: recorre lo exportado buscando el uuid de
-- alguien del equipo, en vez de fiarse de una lista escrita a mano.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from cic_ids where k = 'espacio');
  v_export jsonb;
  v_tabla text;
  v_fila jsonb;
  v_clave text;
  v_equipo uuid[] := array[
    'c1c00000-0000-0000-0000-000000000001'::uuid,
    'c1c00000-0000-0000-0000-000000000002'::uuid,
    'c1c00000-0000-0000-0000-000000000003'::uuid
  ];
  v_fugas text := '';
begin
  v_export := public.export_space(v_space, 'group', (select v from cic_ids where k = 'grupo'));

  -- El restaurante no ve la organización interna del equipo (P7), así que
  -- esas tablas no pueden salir en su exportación ni vacías ni llenas.
  for v_tabla in select jsonb_object_keys(v_export -> 'tables') loop
    if v_tabla in ('assignments', 'tasks', 'space_memberships', 'internal_notes') then
      v_fugas := v_fugas || ' tabla:' || v_tabla;
    end if;

    for v_fila in select * from jsonb_array_elements(v_export -> 'tables' -> v_tabla) loop
      for v_clave in select jsonb_object_keys(v_fila) loop
        if jsonb_typeof(v_fila -> v_clave) = 'string'
           and (v_fila ->> v_clave)::text = any (select unnest(v_equipo)::text) then
          v_fugas := v_fugas || ' ' || v_tabla || '.' || v_clave;
        end if;
      end loop;
    end loop;
  end loop;

  if v_fugas <> '' then
    raise exception 'RN-CIC-11 FALLIDO (P7): la exportación del restaurante lleva identidad del equipo:%', v_fugas
      using errcode = 'assert_failure';
  end if;

  -- Y que no sea vacuo: el barrido tiene que haber recorrido algo.
  if (v_export ->> 'table_count')::integer = 0 then
    raise exception 'RN-CIC-11 FALLIDO: la exportación del grupo salió vacía, así que el barrido no ha mirado nada'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- RN-CIC-11 · y lo que NO puede hacer el restaurante: exportar el espacio
-- entero, que es lo que §141 le reserva a su propietario.
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  begin
    perform public.export_space((select v from cic_ids where k = 'espacio'), 'space');
    raise exception 'RN-CIC-10 FALLIDO: el propietario de un restaurante ha exportado el espacio entero'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;
reset role;

-- Ni nadie de fuera, ni el trabajador del equipo (§141 dice "propietario").
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.export_space((select v from cic_ids where k = 'espacio'), 'space');
    raise exception 'RN-CIC-10 FALLIDO: un trabajador ha exportado el espacio'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
  begin
    perform public.export_space(
      (select v from cic_ids where k = 'espacio'), 'group', (select v from cic_ids where k = 'grupo'));
    raise exception 'RN-CIC-11 FALLIDO: un trabajador ha exportado el grupo de un restaurante'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;
reset role;

-- El barrido de arriba solo vale si de verdad ha recorrido las tablas que
-- llevan identidad del equipo en una columna revocada. Si el fixture
-- dejara de producirlas, el barrido pasaría mirando dos tablas vacías.
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare
  v_export jsonb;
  v_falta text := '';
  v_t text;
begin
  v_export := public.export_space(
    (select v from cic_ids where k = 'espacio'), 'group', (select v from cic_ids where k = 'grupo'));

  foreach v_t in array array['messages', 'files', 'charges', 'requests'] loop
    if not (v_export -> 'tables' ? v_t) then
      v_falta := v_falta || ' ' || v_t;
    end if;
  end loop;

  if v_falta <> '' then
    raise exception 'FIXTURE: el barrido de P7 no ha mirado las tablas con identidad revocada:%. Sin ellas pasa por el motivo equivocado.', v_falta
      using errcode = 'assert_failure';
  end if;

  -- Y la columna concreta que se escapó tres veces en el Hito 7.
  if v_export -> 'tables' -> 'messages' -> 0 ? 'sender_id' then
    raise exception 'RN-CIC-11 FALLIDO (P7): la exportación del restaurante lleva `messages.sender_id`'
      using errcode = 'assert_failure';
  end if;
  if v_export -> 'tables' -> 'charges' -> 0 ? 'issued_by' then
    raise exception 'RN-CIC-11 FALLIDO (P7): la exportación del restaurante lleva `charges.issued_by`'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-CIC-07 · archivar congela el espacio, y RN-CIC-09 solo PROGRAMA
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from cic_ids where k = 'espacio');
  v_op uuid;
  v_s record;
begin
  -- §140 · archivar exige motivo.
  begin
    perform public.archive_space_by_owner(v_space, '   ');
    raise exception 'RN-CIC-07 FALLIDO: se ha archivado un espacio sin motivo'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  v_op := public.archive_space_by_owner(v_space, 'La bodega cierra', 'cic-archivar-1');
  insert into cic_ids values ('archivo', v_op);

  select * into v_s from public.spaces where id = v_space;
  if v_s.cuotly_status <> 'archived_by_owner' then
    raise exception 'RN-CIC-07 FALLIDO: el espacio no quedó archivado por su dueño, sino en "%"', v_s.cuotly_status
      using errcode = 'assert_failure';
  end if;

  -- RN-CIC-08 · recuperable 30 días, los mismos de §4.6.
  if v_s.cuotly_reactivation_deadline_at::date
     <> (v_s.cuotly_archived_at + make_interval(days => public.cuotly_constant('reactivation_days')))::date then
    raise exception 'RN-CIC-08 FALLIDO: el plazo de recuperación no son los 30 días de §127'
      using errcode = 'assert_failure';
  end if;

  -- RN-CIC-09 · "después se programa eliminación": la fecha está, y nada más.
  if v_s.cuotly_deletion_scheduled_at is null then
    raise exception 'RN-CIC-09 FALLIDO: archivar no programó la eliminación'
      using errcode = 'assert_failure';
  end if;

  -- RN-CIC-14 · el segundo clic devuelve la misma operación.
  if public.archive_space_by_owner(v_space, 'otra vez', 'cic-archivar-1') <> v_op then
    raise exception 'RN-CIC-14 FALLIDO: la clave de idempotencia no detuvo el segundo archivado'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- RN-CIC-09 · **y no se ha borrado nada**. Es el placeholder del bloque
-- legal (§170.1, pendiente 20) escrito como comprobación, no como
-- comentario: el día que alguien añada un barrido que borre, esto salta.
do $$
declare v_space uuid := (select v from cic_ids where k = 'espacio');
begin
  if not exists (select 1 from public.spaces where id = v_space)
     or not exists (select 1 from public.establishments where space_id = v_space)
     or not exists (select 1 from public.messages where space_id = v_space) then
    raise exception 'RN-CIC-09 FALLIDO: archivar ha borrado datos. §127 dice PROGRAMAR la eliminación, y el borrado es del bloque legal'
      using errcode = 'assert_failure';
  end if;
end $$;

-- RN-CIC-07 · el espacio archivado es de solo lectura para las personas,
-- por el mismo disparador que instaló RN-SUB-08.
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_space uuid := (select v from cic_ids where k = 'espacio');
begin
  begin
    insert into public.plans (space_id, name, price_cents, start_sla_hours)
    values (v_space, 'Plan nuevo', 100, 24);
    raise exception 'RN-CIC-07 FALLIDO: se ha escrito en un espacio archivado por su propietario'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  -- Y RN-SUB-08 lo dice con todas las letras: archivado se puede exportar.
  if (public.export_space(v_space, 'space') ->> 'table_count')::integer = 0 then
    raise exception 'RN-CIC-10 FALLIDO: no se ha podido exportar un espacio archivado, que es cuando más falta hace'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- RN-CIC-15 · archivar avisa a TODO el equipo, no solo a quien manda: es
-- quien se encuentra con el espacio congelado.
do $$
declare v_space uuid := (select v from cic_ids where k = 'espacio');
begin
  if not exists (
    select 1 from public.notifications
    where space_id = v_space and event_type = 'space_archived_by_owner'
      and recipient_id = 'c1c00000-0000-0000-0000-000000000003'
  ) then
    raise exception 'RN-CIC-15 FALLIDO: el trabajador no se ha enterado de que su espacio está archivado'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CIC-08 · dentro del plazo restaura el propietario
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_space uuid := (select v from cic_ids where k = 'espacio');
begin
  perform public.restore_space_by_owner(v_space, 'Sigue abierta', 'cic-restaurar-1');

  if (select cuotly_status from public.spaces where id = v_space) <> 'trial' then
    raise exception 'RN-CIC-08 FALLIDO: restaurar no devolvió el espacio al modo que tenía'
      using errcode = 'assert_failure';
  end if;
  if (select cuotly_deletion_scheduled_at from public.spaces where id = v_space) is not null then
    raise exception 'RN-CIC-08 FALLIDO: restaurar dejó la eliminación programada'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-CIC-08 · pasado el plazo, restaurar es de la plataforma
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  perform public.archive_space_by_owner(
    (select v from cic_ids where k = 'espacio'), 'Cierre definitivo', 'cic-archivar-2');
end $$;
reset role;

-- Se adelanta el reloj moviendo la fecha límite, que es la única forma de
-- simular treinta días sin esperarlos. Como `postgres` y con el GUC de la
-- 90, que es por donde pasan las funciones que mueven el modo.
do $$
begin
  perform set_config('cuotly.space_status_change', 'on', true);
  update public.spaces
  set cuotly_reactivation_deadline_at = now() - interval '1 day'
  where id = (select v from cic_ids where k = 'espacio');
  perform set_config('cuotly.space_status_change', 'off', true);
end $$;

select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  begin
    perform public.restore_space_by_owner((select v from cic_ids where k = 'espacio'), 'tarde');
    raise exception 'RN-CIC-08 FALLIDO: el propietario ha restaurado su espacio pasados los 30 días'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  perform public.restore_space_by_owner(
    (select v from cic_ids where k = 'espacio'), 'Lo pide su propietaria', 'cic-restaurar-2');

  if (select cuotly_status from public.spaces where id = (select v from cic_ids where k = 'espacio'))
     = 'archived_by_owner' then
    raise exception 'RN-CIC-08 FALLIDO: la plataforma no ha podido restaurar el espacio pasado el plazo'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-CIC-05 y RN-CIC-07 · Modo soporte no transfiere ni archiva
-- ============================================================
--
-- RN-ADM-07 le quita `invite_member` porque es lo único que dejaría un
-- acceso vivo después de la sesión. Estas dos dejan algo peor: un dueño
-- distinto y un espacio cerrado treinta días.
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_space uuid := (select v from cic_ids where k = 'espacio');
begin
  perform public.start_support_session(v_space, 'Revisar un cobro', 'owner', 60);

  begin
    perform public.transfer_space_ownership(v_space, 'c1c00000-0000-0000-0000-000000000002', 'desde soporte');
    raise exception 'RN-CIC-05 FALLIDO: Modo soporte ha transferido la propiedad de un espacio ajeno'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  begin
    perform public.archive_space_by_owner(v_space, 'desde soporte');
    raise exception 'RN-CIC-07 FALLIDO: Modo soporte ha archivado un espacio ajeno'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  -- Y el espacio sigue como estaba.
  if (select role from public.space_memberships
      where space_id = v_space and user_id = 'c1c00000-0000-0000-0000-000000000001') <> 'owner' then
    raise exception 'RN-CIC-05 FALLIDO: el espacio ha cambiado de dueño desde Modo soporte'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-CIC-12 · qué impide cerrar una cuenta (§141)
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_b record;
begin
  select * into v_b from public.account_deletion_blockers() where kind = 'space';

  if v_b.entity_id is null then
    raise exception 'RN-CIC-12 FALLIDO: la única propietaria de un espacio puede cerrar su cuenta'
      using errcode = 'assert_failure';
  end if;
  -- §141: "Primero transfiere propiedad o cierra entidades": la respuesta
  -- dice qué hacer, no solo que no.
  if v_b.remedy <> 'transfer_ownership' or v_b.entity_name is null then
    raise exception 'RN-CIC-12 FALLIDO: el bloqueo no dice qué hacer ni de qué espacio habla'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El propietario global del grupo tiene el suyo, y no ve el del espacio.
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_kinds text[];
begin
  select array_agg(kind order by kind) into v_kinds from public.account_deletion_blockers();

  if v_kinds is distinct from array['group'] then
    raise exception 'RN-CIC-12 FALLIDO: los bloqueos del restaurante son %, esperaba solo el de su grupo', v_kinds
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Quien no es único propietario de nada, no tiene ningún bloqueo.
select set_config('request.jwt.claim.sub', 'c1c00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.account_deletion_blockers()) then
    raise exception 'RN-CIC-12 FALLIDO: un trabajador tiene bloqueos para cerrar su cuenta'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- Limpieza
-- ============================================================
delete from public.audit_log where space_id = (select v from cic_ids where k = 'espacio');
delete from public.audit_log where actor_id in (
  'c1c00000-0000-0000-0000-000000000001', 'c1c00000-0000-0000-0000-000000000005');
delete from public.space_requests where requester_id = 'c1c00000-0000-0000-0000-000000000001';
-- Sin borrar `space_memberships` a mano: la cascada se las lleva, y
-- hacerlo antes dejaría el espacio sin propietario (RN-CIC-06).
delete from public.spaces where id = (select v from cic_ids where k = 'espacio');
delete from public.platform_roles where user_id = 'c1c00000-0000-0000-0000-000000000005';
delete from auth.users where email like 'cic-%@example.com';
drop table cic_ids;

select 'onboarding_y_ciclo_de_vida_del_espacio.sql: todas las comprobaciones pasaron' as resultado;
