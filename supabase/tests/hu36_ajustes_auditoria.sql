-- HU-36 · Ajustes del espacio y consulta de la auditoría
-- (migración 20260903000049), verificado contra la base de datos real.
--
-- Qué comprueba, y por qué cada cosa:
--   · §124 · el nombre del espacio solo lo cambia el propietario, y el
--     cambio deja rastro con valor anterior y nuevo (CLAUDE.md MUST);
--   · que el UPDATE directo sobre `spaces` ya no existe — era la puerta
--     por la que se podía renombrar el espacio, o moverle la zona horaria
--     a todos los plazos vivos, sin escribir una línea de auditoría;
--   · §125 y RN-CLK-10 · cambiar la zona horaria versiona los calendarios
--     contractual y de Menú Diario, deja en paz el de soporte (§132) y
--     exige motivo (§21.1);
--   · §21.2 · quién ve qué en la auditoría: el propietario todo lo de su
--     espacio, el administrador la operativa, el trabajador sus propias
--     acciones y las filas que ya puede ver, y el cliente nada. Qué es "la
--     operativa" lo fija la decisión 14 de docs/DECISIONES.md (04/09/2026):
--     todo salvo la configuración del espacio y la composición del equipo
--     —invitaciones, permisos y supervisores—, y las tres familias de esa
--     frase se comprueban una por una;
--   · CA-16 · ninguna operación de la aplicación edita ni borra una fila
--     de auditoría, tampoco el propietario;
--   · falso-cerrado: toda acción que aparezca en el libro tiene que estar
--     clasificada, por capacidad o por entidad, o este test falla.
--
-- Cada comprobación negativa ("no lo ve") va acompañada de su positiva
-- ("pero el propietario sí"), porque una comprobación negativa sola pasa
-- también cuando la fila no existe — que es como la 5ª revisión descubrió
-- que dos comprobaciones del Hito 7 eran vacuas.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hu36_ajustes_auditoria.sql

-- ============================================================
-- Fixture: un espacio con propietario, administrador, dos trabajadoras
-- (Eva autorizada al restaurante A, Nuria solo al B) y un cliente del A.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('e0000000-0000-0000-0000-000000000001', 'hu36-owner@example.com', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000002', 'hu36-admin@example.com', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000003', 'hu36-eva@example.com', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000004', 'hu36-nuria@example.com', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000005', 'hu36-client@example.com', 'authenticated', 'authenticated'),
  -- La sexta identidad existe solo para la familia `invitation`: alguien a
  -- quien se invita y acepta, que es la única forma de que se escriba un
  -- apunte `invitation.accepted`. La decisión 14 nombra las invitaciones
  -- entre lo que un administrador NO ve, y sin esta fila la comprobación
  -- de abajo pasaba porque no había nada que ver.
  ('e0000000-0000-0000-0000-000000000006', 'hu36-invitada@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'Espacio HU36', 'espacio-hu36-test', 'Europe/Madrid',
   'e0000000-0000-0000-0000-000000000001');

-- Los tres calendarios del espacio, como los crea create_restavor_space().
insert into public.space_working_hours (space_id, calendar_kind, timezone, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'contractual', 'Europe/Madrid', 'e0000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000001', 'support', 'Europe/Madrid', 'e0000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000001', 'menu_diario', 'Europe/Madrid', 'e0000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004', 'worker', 'active');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Impulso HU36', 39900, 20, 12, 3, 0, 24);

insert into public.groups (id, space_id, name) values
  ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Grupo HU36');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('e4000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'EST-HU36-A', 'Restaurante HU36 A'),
  ('e4000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'EST-HU36-B', 'Restaurante HU36 B');

-- El cliente es dueño de los dos restaurantes: así los dos trabajos nacen
-- del mismo sitio y lo único que distingue lo que ve cada trabajadora es
-- su autorización, no quién pidió el cambio.
insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('e4000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005', 'local_owner'),
  ('e4000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000005', 'local_owner');

insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'e4000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004', 'e4000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001');

insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'web', 'e0000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004', 'web', 'e0000000-0000-0000-0000-000000000001');

-- Mismo atajo que hito6_trabajos.sql y hu21_reparto_tareas.sql: lleva una
-- solicitud desde el borrador hasta el trabajo aceptado por el camino real.
create or replace function public.hu36_make_job(
  p_establishment_id uuid,
  p_client uuid,
  p_staff uuid,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_job_id uuid;
begin
  perform set_config('request.jwt.claim.sub', p_client::text, false);
  v_request_id := public.create_request_draft(p_establishment_id, p_description, null);
  perform public.submit_request(v_request_id);
  perform public.begin_request_analysis(v_request_id);

  perform public.record_classification(
    v_request_id, p_client, 'rules', 'small', p_description, null, null, null, null, null, null
  );

  perform set_config('request.jwt.claim.sub', p_staff::text, false);
  perform public.validate_classification(v_request_id, 'small', p_description);

  perform set_config('request.jwt.claim.sub', p_client::text, false);
  perform public.accept_request(v_request_id);

  select id into v_job_id from public.jobs where request_id = v_request_id;
  return v_job_id;
end;
$$;

-- ============================================================
-- Operaciones que llenan el libro. Cada una es de una familia distinta,
-- que es lo que después se mira desde cinco identidades.
-- ============================================================
-- Estas operaciones corren como `postgres`, igual que en hito6_trabajos.sql
-- y hu21_reparto_tareas.sql: montar el escenario no es lo que se está
-- probando, y el actor de cada apunte sale de `auth.uid()` (o sea, del
-- `set_config` de abajo), no del rol de base de datos. Todo lo que sí se
-- prueba —el UPDATE directo y quién ve qué— se hace más abajo con
-- `set role authenticated`, que es donde RLS decide.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', false);

do $$
declare
  v_job_a uuid;
  v_job_b uuid;
begin
  -- Suscripciones de los dos restaurantes (familia `subscription`,
  -- capacidad manage_finance).
  perform public.create_plan_subscription('e4000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001');
  perform public.create_plan_subscription('e4000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001');

  -- Familia `membership` y familia `supervision`: configuración del
  -- equipo, reservada al propietario.
  perform public.set_admin_can_perform_jobs(
    'e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', true);
  perform public.set_principal_supervisor(
    'e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003',
    'e0000000-0000-0000-0000-000000000002');

  -- Familia `invitation`: composición del equipo, reservada al propietario
  -- (§21.2, decisión 14). El apunte lo escribe QUIEN ACEPTA, no quien
  -- invita, así que su actor es la invitada: eso hace la comprobación del
  -- administrador de más abajo no vacua y a la vez comprueba la otra mitad
  -- de la regla —cada cual ve siempre sus propias acciones.
  insert into public.space_invitations (space_id, email, role, invited_by, token)
  values ('e1000000-0000-0000-0000-000000000001', 'hu36-invitada@example.com', 'worker',
          'e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000f0036');

  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000006', false);
  perform public.accept_space_invitation('00000000-0000-0000-0000-0000000f0036');
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', false);

  -- Familia `establishment`: cartera de clientes (manage_clients).
  perform public.set_establishment_status(
    'e4000000-0000-0000-0000-000000000002', 'paused', 'Prueba HU-36');
  perform public.set_establishment_status(
    'e4000000-0000-0000-0000-000000000002', 'active', 'Prueba HU-36');

  -- Dos trabajos, uno en cada restaurante, y cada uno asignado a la
  -- trabajadora autorizada. Familias `request` y `job`, que no se
  -- clasifican por capacidad sino por la fila.
  v_job_a := public.hu36_make_job(
    'e4000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005',
    'e0000000-0000-0000-0000-000000000001', 'Cambiar el teléfono del pie de página');
  v_job_b := public.hu36_make_job(
    'e4000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000005',
    'e0000000-0000-0000-0000-000000000001', 'Actualizar la foto de portada');

  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', false);
  perform public.assign_job(v_job_a, 'e0000000-0000-0000-0000-000000000003');
  perform public.assign_job(v_job_b, 'e0000000-0000-0000-0000-000000000004');

  create temporary table hu36_ctx (key text primary key, value text);
  grant select, insert on hu36_ctx to authenticated, service_role;
  insert into hu36_ctx values ('job_a', v_job_a::text), ('job_b', v_job_b::text);
end $$;

-- ============================================================
-- §124 · El nombre del espacio
-- ============================================================
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_changed boolean;
  v_name text;
begin
  v_changed := public.set_space_name('e1000000-0000-0000-0000-000000000001', '  Espacio HU36 renombrado  ');
  if not v_changed then
    raise exception '§124 FALLIDO: renombrar el espacio devolvió false' using errcode = 'assert_failure';
  end if;

  select name into v_name from public.spaces where id = 'e1000000-0000-0000-0000-000000000001';
  if v_name <> 'Espacio HU36 renombrado' then
    raise exception '§124 FALLIDO: el nombre quedó como "%" (se esperaba sin espacios sobrantes)', v_name
      using errcode = 'assert_failure';
  end if;

  -- CLAUDE.md MUST: con actor, valor anterior y valor nuevo.
  if not exists (
    select 1 from public.audit_log
    where space_id = 'e1000000-0000-0000-0000-000000000001'
      and action = 'space.renamed'
      and actor_id = 'e0000000-0000-0000-0000-000000000001'
      and old_value ->> 'name' = 'Espacio HU36'
      and new_value ->> 'name' = 'Espacio HU36 renombrado'
  ) then
    raise exception '§124 FALLIDO: renombrar el espacio no dejó rastro con valor anterior y nuevo'
      using errcode = 'assert_failure';
  end if;

  -- Guardar lo mismo no es un cambio y no ensucia el libro.
  if public.set_space_name('e1000000-0000-0000-0000-000000000001', 'Espacio HU36 renombrado') then
    raise exception '§124 FALLIDO: guardar el mismo nombre se contabilizó como cambio'
      using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.audit_log
      where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'space.renamed') <> 1 then
    raise exception '§124 FALLIDO: guardar el mismo nombre escribió una segunda fila de auditoría'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.set_space_name('e1000000-0000-0000-0000-000000000001', '   ');
    raise exception '§124 FALLIDO: se aceptó un nombre vacío' using errcode = 'assert_failure';
  exception
    when others then
      if sqlerrm not like '%no puede quedar vacío%' then raise; end if;
  end;
end $$;

-- El agujero que cerró la migración 49: el UPDATE directo. `spaces` ya no
-- tiene política de UPDATE, así que la sentencia no falla — no afecta a
-- ninguna fila, que es como RLS dice "no".
do $$
declare
  v_name text;
begin
  update public.spaces set name = 'Renombrado por la puerta de atrás', timezone = 'Pacific/Auckland'
  where id = 'e1000000-0000-0000-0000-000000000001';

  select name into v_name from public.spaces where id = 'e1000000-0000-0000-0000-000000000001';
  if v_name <> 'Espacio HU36 renombrado' then
    raise exception 'CLAUDE.md MUST FALLIDO: el propietario puede cambiar el espacio por UPDATE directo, sin auditoría'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- §125 y RN-CLK-10 · La zona horaria contractual
-- ============================================================
do $$
declare
  v_tz text;
begin
  begin
    perform public.set_space_timezone('e1000000-0000-0000-0000-000000000001', 'America/Mexico_City', '   ');
    raise exception '§21.1 FALLIDO: se cambió la zona horaria sin motivo' using errcode = 'assert_failure';
  exception
    when others then
      if sqlerrm not like '%exige un motivo%' then raise; end if;
  end;

  begin
    perform public.set_space_timezone('e1000000-0000-0000-0000-000000000001', 'Europa/Inventada', 'Prueba');
    raise exception '§125 FALLIDO: se aceptó una zona horaria que no existe' using errcode = 'assert_failure';
  exception
    when others then
      if sqlerrm not like '%no existe%' then raise; end if;
  end;

  if not public.set_space_timezone(
       'e1000000-0000-0000-0000-000000000001', 'America/Mexico_City', 'Mudanza de la operación') then
    raise exception '§125 FALLIDO: cambiar la zona horaria devolvió false' using errcode = 'assert_failure';
  end if;

  select timezone into v_tz from public.spaces where id = 'e1000000-0000-0000-0000-000000000001';
  if v_tz <> 'America/Mexico_City' then
    raise exception '§125 FALLIDO: la zona horaria quedó en %', v_tz using errcode = 'assert_failure';
  end if;

  -- RN-CLK-10 · una versión no se edita: se añade otra.
  if (select count(*) from public.space_working_hours
      where space_id = 'e1000000-0000-0000-0000-000000000001' and calendar_kind = 'contractual') <> 2
     or (select count(*) from public.space_working_hours
      where space_id = 'e1000000-0000-0000-0000-000000000001' and calendar_kind = 'menu_diario') <> 2 then
    raise exception 'RN-CLK-10 FALLIDO: cambiar la zona no versionó los calendarios contractual y de Menú Diario'
      using errcode = 'assert_failure';
  end if;

  -- §132 · el reloj de soporte es otro y no se mueve con el espacio.
  if (select count(*) from public.space_working_hours
      where space_id = 'e1000000-0000-0000-0000-000000000001' and calendar_kind = 'support') <> 1
     or (select timezone from public.space_working_hours
      where space_id = 'e1000000-0000-0000-0000-000000000001' and calendar_kind = 'support') <> 'Europe/Madrid' then
    raise exception '§132 FALLIDO: la zona del espacio arrastró al calendario de soporte'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.audit_log
    where space_id = 'e1000000-0000-0000-0000-000000000001'
      and action = 'space.timezone_changed'
      and old_value ->> 'timezone' = 'Europe/Madrid'
      and new_value ->> 'timezone' = 'America/Mexico_City'
      and reason = 'Mudanza de la operación'
  ) then
    raise exception '§125 FALLIDO: el cambio de zona horaria no quedó auditado con su motivo'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Un administrador no toca ni el nombre ni la zona (CA-01: por llamada
-- directa, no porque la pantalla le esconda el botón).
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  begin
    perform public.set_space_name('e1000000-0000-0000-0000-000000000001', 'El administrador manda');
    raise exception '§124 FALLIDO: un administrador renombró el espacio' using errcode = 'assert_failure';
  exception
    when others then
      if sqlerrm not like '%Solo el propietario%' then raise; end if;
  end;

  begin
    perform public.set_space_timezone('e1000000-0000-0000-0000-000000000001', 'Europe/Lisbon', 'Porque sí');
    raise exception '§125 FALLIDO: un administrador cambió la zona horaria contractual'
      using errcode = 'assert_failure';
  exception
    when others then
      if sqlerrm not like '%Solo el propietario%' then raise; end if;
  end;
end $$;

reset role;
-- ============================================================
-- Un cobro y su pago, registrado por la TRABAJADORA (HU-27, RN-FIN-05).
-- Sirve para la comprobación más fina de §21.2: la familia `payment`
-- exige manage_finance, que Eva no tiene, y aun así tiene que ver ESA
-- fila porque la acción es suya. Ninguna otra.
-- ============================================================
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', false);

do $$
declare
  v_sub uuid;
  v_charge uuid;
begin
  select id into v_sub from public.subscriptions
  where establishment_id = 'e4000000-0000-0000-0000-000000000001' and kind = 'plan';

  v_charge := public.generate_monthly_charge(v_sub);
  insert into hu36_ctx values ('charge', v_charge::text);
end $$;

select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000003', false);

do $$
begin
  perform public.register_payment(
    (select value::uuid from hu36_ctx where key = 'charge'),
    1000, 'transfer', now(), null, 'Entrega a cuenta HU-36', 'hu36:1'
  );
end $$;

-- ============================================================
-- §21.2 · Quién ve qué
-- ============================================================

-- 1 · El propietario ve la auditoría COMPLETA de su espacio.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_visibles bigint;
  v_totales bigint;
begin
  select count(*) into v_visibles from public.audit_log
  where space_id = 'e1000000-0000-0000-0000-000000000001';

  -- El total real se calcula fuera de RLS más abajo; aquí basta con que
  -- estén las seis familias, que es lo que "completa" significa.
  if not exists (select 1 from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'space.renamed')
     or not exists (select 1 from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'supervision.principal_set')
     or not exists (select 1 from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'membership.perform_jobs_changed')
     or not exists (select 1 from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'invitation.accepted')
     or not exists (select 1 from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'establishment.status_changed')
     or not exists (select 1 from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'subscription.plan_created')
     or not exists (select 1 from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'payment.registered')
     or not exists (select 1 from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'job.assigned') then
    raise exception '§21.2 FALLIDO: al propietario le falta alguna familia de su propia auditoría (ve % filas)', v_visibles
      using errcode = 'assert_failure';
  end if;

  insert into hu36_ctx values ('visibles_owner', v_visibles::text);
end $$;

reset role;

-- El contraste sin RLS: si el propietario no ve exactamente lo mismo que
-- hay en la tabla, "completa" es mentira.
do $$
declare
  v_totales bigint;
  v_owner bigint;
begin
  select count(*) into v_totales from public.audit_log
  where space_id = 'e1000000-0000-0000-0000-000000000001';
  select value::bigint into v_owner from hu36_ctx where key = 'visibles_owner';

  if v_totales <> v_owner then
    raise exception '§21.2 FALLIDO: el propietario ve % de las % filas de su espacio', v_owner, v_totales
      using errcode = 'assert_failure';
  end if;
end $$;

-- 2 · El administrador ve la operativa, no la configuración del espacio.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_prohibida text;
begin
  select string_agg(distinct action, ', ') into v_prohibida
  from public.audit_log
  where space_id = 'e1000000-0000-0000-0000-000000000001'
    and action in ('space.renamed', 'space.timezone_changed',
                   'membership.perform_jobs_changed', 'supervision.principal_set',
                   'invitation.accepted')
    and actor_id <> auth.uid();

  if v_prohibida is not null then
    raise exception '§21.2 FALLIDO: un administrador ve la configuración del espacio y del equipo: %', v_prohibida
      using errcode = 'assert_failure';
  end if;

  -- Y la otra mitad, para que la anterior no sea vacua: la operativa sí.
  if not exists (select 1 from public.audit_log
                 where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'establishment.status_changed')
     or not exists (select 1 from public.audit_log
                 where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'subscription.plan_created')
     or not exists (select 1 from public.audit_log
                 where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'payment.registered')
     or (select count(*) from public.audit_log
         where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'job.assigned') <> 2 then
    raise exception '§21.2 FALLIDO: un administrador no ve la operativa completa de su espacio'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- 3 · La trabajadora: sus propias acciones y las filas que ya puede ver.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_asignaciones bigint;
  v_prohibida text;
begin
  select string_agg(distinct action, ', ') into v_prohibida
  from public.audit_log
  where space_id = 'e1000000-0000-0000-0000-000000000001'
    and action in ('space.renamed', 'space.timezone_changed', 'supervision.principal_set',
                   'membership.perform_jobs_changed', 'invitation.accepted',
                   'subscription.plan_created', 'establishment.status_changed', 'charge.issued');

  if v_prohibida is not null then
    raise exception '§21.2 FALLIDO: una trabajadora ve la configuración o las finanzas del espacio: %', v_prohibida
      using errcode = 'assert_failure';
  end if;

  -- "Las operaciones autorizadas": el trabajo del restaurante que tiene
  -- asignado, sí; el del otro, no. Son dos filas `job.assigned` idénticas
  -- salvo en la fila a la que apuntan, así que esto no puede pasar por
  -- casualidad.
  select count(*) into v_asignaciones from public.audit_log
  where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'job.assigned';

  if v_asignaciones <> 1 then
    raise exception '§21.2 FALLIDO: la trabajadora del restaurante A ve % asignaciones de trabajo (debería ver 1)',
      v_asignaciones using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.audit_log
    where space_id = 'e1000000-0000-0000-0000-000000000001'
      and action = 'job.assigned'
      and entity_id = (select value::uuid from hu36_ctx where key = 'job_a')
  ) then
    raise exception '§21.2 FALLIDO: la trabajadora ve una asignación, pero no la de SU restaurante'
      using errcode = 'assert_failure';
  end if;

  -- "Sus propias acciones": el pago que registró ella, aunque la familia
  -- entera exija manage_finance y ella no lo tenga.
  if not exists (
    select 1 from public.audit_log
    where space_id = 'e1000000-0000-0000-0000-000000000001'
      and action = 'payment.registered' and actor_id = auth.uid()
  ) then
    raise exception '§21.2 FALLIDO: la trabajadora no ve su propia acción en la auditoría'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- 4 · La otra trabajadora no ve nada de lo anterior: ni el trabajo del A
-- ni el pago que registró Eva.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
begin
  if exists (
    select 1 from public.audit_log
    where space_id = 'e1000000-0000-0000-0000-000000000001'
      and action = 'job.assigned'
      and entity_id = (select value::uuid from hu36_ctx where key = 'job_a')
  ) then
    raise exception '§21.2 FALLIDO: una trabajadora ve la asignación de un restaurante que no tiene autorizado'
      using errcode = 'assert_failure';
  end if;

  if exists (
    select 1 from public.audit_log
    where space_id = 'e1000000-0000-0000-0000-000000000001' and action = 'payment.registered'
  ) then
    raise exception '§21.2 FALLIDO: una trabajadora ve un pago que no registró ella'
      using errcode = 'assert_failure';
  end if;

  -- No vacuo: la suya sí la ve.
  if not exists (
    select 1 from public.audit_log
    where space_id = 'e1000000-0000-0000-0000-000000000001'
      and action = 'job.assigned'
      and entity_id = (select value::uuid from hu36_ctx where key = 'job_b')
  ) then
    raise exception '§21.2 FALLIDO: la trabajadora del restaurante B no ve la asignación de su propio trabajo'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- 5 · El cliente no ve auditoría. No es un matiz: cada fila lleva
-- `actor_id`, y enseñárselas rompería el MUST NOT de CLAUDE.md.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_filas bigint;
begin
  select count(*) into v_filas from public.audit_log;
  if v_filas <> 0 then
    raise exception 'CLAUDE.md MUST NOT FALLIDO: el cliente ve % filas de auditoría', v_filas
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CA-16 · Ninguna operación de la aplicación edita ni borra auditoría,
-- tampoco el propietario del espacio.
-- ============================================================
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_antes bigint;
begin
  select count(*) into v_antes from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001';

  update public.audit_log set reason = 'manipulado' where space_id = 'e1000000-0000-0000-0000-000000000001';
  delete from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001';

  if (select count(*) from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001') <> v_antes
     or exists (select 1 from public.audit_log
                where space_id = 'e1000000-0000-0000-0000-000000000001' and reason = 'manipulado') then
    raise exception 'CA-16 FALLIDO: el propietario puede editar o borrar su auditoría'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- Falso-cerrado: toda acción del libro tiene que estar clasificada, o por
-- capacidad (`audit_action_capability`) o por entidad
-- (`audit_entity_is_visible`). Una acción nueva sin clasificar solo la
-- verían el propietario y quien la ejecutó, en silencio y sin que nadie se
-- entere de que su regla de visibilidad no está escrita.
-- ============================================================
do $$
declare
  v_sin_clasificar text;
begin
  select string_agg(distinct action || ' (' || entity_type || ')', ', ') into v_sin_clasificar
  from public.audit_log
  where space_id = 'e1000000-0000-0000-0000-000000000001'
    and public.audit_action_capability(action) is null
    and entity_type not in ('request', 'job', 'task', 'file', 'absence', 'correction');

  if v_sin_clasificar is not null then
    raise exception 'HU-36 FALLIDO: acciones de auditoría sin clasificar: %. Clasifícalas en audit_action_capability() o en audit_entity_is_visible(), y en src/core/audit.ts', v_sin_clasificar
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Privilegios de las funciones nuevas (CLAUDE.md).
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice 'Sin rol anon: se omite la comprobacion de privilegios';
    return;
  end if;

  if has_function_privilege('anon', 'public.set_space_name(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.set_space_timezone(uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.audit_action_capability(text)', 'execute')
     or has_function_privilege('anon', 'public.audit_entity_is_visible(text, uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: las funciones de Ajustes están abiertas a anon'
      using errcode = 'assert_failure';
  end if;

  -- Y el otro lado: las dos que viven DENTRO de la política de RLS no
  -- pueden perder `authenticated`, o la tabla entera empieza a responder
  -- "permission denied for function" (excepción documentada en CLAUDE.md).
  if not has_function_privilege('authenticated', 'public.audit_action_capability(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.audit_entity_is_visible(text, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_space_name(uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_space_timezone(uuid, text, text)', 'execute') then
    raise exception 'HU-36 FALLIDO: al equipo le falta EXECUTE en alguna función de Ajustes'
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y que `spaces` siga sin política de UPDATE, que es lo que obliga a pasar
-- por las funciones auditadas.
do $$
begin
  if exists (select 1 from pg_policy where polrelid = 'public.spaces'::regclass and polcmd = 'w') then
    raise exception 'CLAUDE.md MUST FALLIDO: alguien ha devuelto una política de UPDATE a `spaces`; el nombre y la zona horaria volverían a poder cambiarse sin auditoría'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
drop function public.hu36_make_job(uuid, uuid, uuid, text);
drop table if exists hu36_ctx;

delete from public.audit_log where space_id = 'e1000000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'e1000000-0000-0000-0000-000000000001';
delete from auth.users where id in (
  'e0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000003',
  'e0000000-0000-0000-0000-000000000004',
  'e0000000-0000-0000-0000-000000000005',
  'e0000000-0000-0000-0000-000000000006'
);

select 'hu36_ajustes_auditoria.sql: §124, §125, §21.2, RN-CLK-10 y CA-16 cumplidos, base de datos limpia' as resultado;
