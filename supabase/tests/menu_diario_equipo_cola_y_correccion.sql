-- Menú Diario · la cola del equipo, el barrido de las 20:00 y las 08:00 y
-- la corrección mínima (Fase 2, Hito 11; migración 79; RN-MEN-08,
-- RN-MEN-07, RN-COR-01/02/06/07/10, RN-ASG-02/17, §18, §20.5, P7).
--
--   · Los candidatos con comprobación: quien no puede asignar no los ve;
--     solo entran los de Menú Diario autorizados y disponibles.
--   · La cola: el cliente no la llama, el trabajador ve sus restaurantes,
--     el corte y la garantía salen calculados, el asignado se enseña con
--     el criterio de la política.
--   · El barrido con la HORA FIJA: a las 19:59 no recuerda, a las 20:00
--     recuerda al propietario, al Editor y al propietario global (a
--     Consulta no), un borrador no cuenta como preparado, un restaurante
--     sin el servicio no recibe nada, dos pasadas no repiten. A las 07:59
--     no avisa; a las 08:00 avisa al equipo de la publicación pedida antes
--     del corte y sin publicar, no de la pedida después, y una sola vez.
--   · La corrección: una por publicación, sin consumir, el error del
--     equipo no cuenta, la ventana se cierra, la de después de las 21:00
--     queda sin garantía (RN-COR-10), la cierra el asignado o quien
--     gestiona, el restaurante no ve quién.
--   · Los menús se encuentran en la búsqueda global con RLS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/menu_diario_equipo_cola_y_correccion.sql

insert into auth.users (id, email, role, aud) values
  ('ee000000-0000-0000-0000-000000000001', 'eq-owner@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000002', 'eq-admin@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000003', 'eq-ana@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000004', 'eq-luis@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000005', 'eq-local@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000006', 'eq-editor@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000007', 'eq-consulta@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000008', 'eq-otro@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000009', 'eq-pepe@example.com', 'authenticated', 'authenticated'),
  ('ee000000-0000-0000-0000-000000000010', 'eq-global@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('ee100000-0000-0000-0000-000000000001', 'Espacio Equipo', 'espacio-equipo-test', 'Europe/Madrid',
   'ee000000-0000-0000-0000-000000000001'),
  ('ee100000-0000-0000-0000-000000000002', 'Espacio Ajeno E', 'espacio-ajeno-equipo-test', 'Europe/Madrid',
   'ee000000-0000-0000-0000-000000000008');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000004', 'worker', 'active'),
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000009', 'worker', 'active'),
  ('ee100000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000008', 'owner', 'active');

insert into public.services (id, space_id, name, price_cents, kind, included_updates) values
  ('ee250000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000001', 'Menú Diario', 22900, 'daily_menu', 30);

insert into public.groups (id, space_id, name) values
  ('ee300000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000001', 'Grupo E');

-- El propietario global del grupo (§4.3): también prepara menús, también
-- recibe el recordatorio.
insert into public.group_memberships (group_id, user_id) values
  ('ee300000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000010');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('ee400000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000001',
   'ee300000-0000-0000-0000-000000000001', 'EQU-0001', 'Casa Cola', 'active'),
  -- Sin Menú Diario: no se le recuerda nada.
  ('ee400000-0000-0000-0000-000000000002', 'ee100000-0000-0000-0000-000000000001',
   'ee300000-0000-0000-0000-000000000001', 'EQU-0002', 'Casa Sin Servicio', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('ee400000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000005', 'local_owner'),
  ('ee400000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000006', 'editor'),
  ('ee400000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000007', 'consulta'),
  ('ee400000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000005', 'local_owner');

insert into public.subscriptions (id, space_id, establishment_id, kind, service_id, status, started_at, created_by) values
  ('ee600000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000001',
   'ee400000-0000-0000-0000-000000000001', 'service', 'ee250000-0000-0000-0000-000000000001', 'active',
   now() - interval '3 days', 'ee000000-0000-0000-0000-000000000002');

-- Ana y Luis: Menú Diario y autorizados (dos candidatos). Pepe: Menú
-- Diario pero sin autorización en Casa Cola (no es candidato).
insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000003', 'daily_menu', 'ee000000-0000-0000-0000-000000000001'),
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000004', 'daily_menu', 'ee000000-0000-0000-0000-000000000001'),
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000009', 'daily_menu', 'ee000000-0000-0000-0000-000000000001');
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000003', 'ee400000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001'),
  ('ee100000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000004', 'ee400000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001');

create temp table eq_ids (k text primary key, v uuid);
grant select, insert on eq_ids to authenticated;

-- ============================================================
-- La plantilla (el equipo) y dos menús pedidos (el restaurante): uno para
-- dentro de tres días (antes del corte) y otro para HOY (después del
-- corte, que fue ayer a las 21:00).
-- ============================================================
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  insert into eq_ids values ('tpl', public.create_menu_template('ee400000-0000-0000-0000-000000000001', 'Clásica'));
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_m1 uuid; v_m3 uuid;
begin
  v_m1 := public.create_menu('ee400000-0000-0000-0000-000000000001', 'Menú del día', 'daily', current_date + 3, (select v from eq_ids where k = 'tpl'));
  perform public.save_menu_version(v_m1, array['Ensalada'], array['Merluza'], array['Flan'], 'Agua', 1450, null);
  perform public.prepare_menu(v_m1);
  perform public.request_menu_publication(v_m1, 'eq-clave-1');
  insert into eq_ids values ('m1', v_m1);
  if (select state from public.menus where id = v_m1) <> 'pending_assignment' then
    raise exception 'FIXTURE: con dos candidatos el menú debía quedar pendiente, está %', (select state from public.menus where id = v_m1);
  end if;

  v_m3 := public.create_menu('ee400000-0000-0000-0000-000000000001', 'Menú de hoy', 'daily', current_date, (select v from eq_ids where k = 'tpl'));
  perform public.save_menu_version(v_m3, array['Sopa'], array['Pollo'], array['Fruta'], null, 1200, null);
  perform public.prepare_menu(v_m3);
  perform public.request_menu_publication(v_m3, 'eq-clave-3');
  insert into eq_ids values ('m3', v_m3);
  if (select requested_before_cutoff from public.menu_publications where menu_id = v_m3) then
    raise exception 'FIXTURE: un menú de hoy pedido ahora llega después del corte';
  end if;

  -- ------------------------------------------------------------
  -- RN-ASG-17 · el restaurante no ve candidatos ni cola.
  -- ------------------------------------------------------------
  begin
    perform public.list_menu_candidates(v_m1);
    raise exception 'RN-ASG-17 FALLIDO: el restaurante vio los candidatos' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
  begin
    perform public.team_menu_queue('ee100000-0000-0000-0000-000000000001');
    raise exception 'P7 FALLIDO: el restaurante leyó la cola del equipo' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el equipo%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-ASG-02 · Los candidatos: Ana y Luis, Pepe no; un trabajador no los ve.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_ids uuid[];
begin
  select array_agg(worker_id order by worker_id) into v_ids
  from public.list_menu_candidates((select v from eq_ids where k = 'm1'));
  if v_ids <> array['ee000000-0000-0000-0000-000000000003'::uuid, 'ee000000-0000-0000-0000-000000000004'::uuid] then
    raise exception 'RN-ASG-02 FALLIDO: candidatos %, esperaba a Ana y Luis (Pepe no está autorizado)', v_ids using errcode = 'assert_failure';
  end if;
  if (select active_menu_count from public.list_menu_candidates((select v from eq_ids where k = 'm1')) where worker_id = 'ee000000-0000-0000-0000-000000000003') <> 0 then
    raise exception 'FALLIDO: Ana no tiene menús en curso todavía' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.list_menu_candidates((select v from eq_ids where k = 'm1'));
    raise exception 'RN-ASG-17 FALLIDO: una trabajadora sin assign_jobs vio los candidatos' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- La cola (RN-MEN-07, RN-DAT-05) · antes y después de asignar.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_row record;
begin
  select * into v_row from public.team_menu_queue('ee100000-0000-0000-0000-000000000001')
  where menu_id = (select v from eq_ids where k = 'm1');
  if v_row.menu_id is null then
    raise exception 'FALLIDO: Ana (autorizada) no ve el menú pendiente en la cola' using errcode = 'assert_failure';
  end if;
  if v_row.is_assigned or v_row.assigned_to is not null then
    raise exception 'FALLIDO: la cola dice que un menú pendiente está asignado' using errcode = 'assert_failure';
  end if;
  if v_row.cutoff_at <> (((current_date + 2)::timestamp + time '21:00') at time zone 'Europe/Madrid')
     or v_row.publish_by_at <> (((current_date + 3)::timestamp + time '08:00') at time zone 'Europe/Madrid') then
    raise exception 'RN-MEN-07 FALLIDO: la cola no calcula el corte y el límite en la zona del espacio' using errcode = 'assert_failure';
  end if;
  if v_row.guaranteed is distinct from true then
    raise exception 'RN-MEN-07 FALLIDO: pedido tres días antes, debía salir garantizado' using errcode = 'assert_failure';
  end if;
  if v_row.establishment_name <> 'Casa Cola' or v_row.pending_corrections <> 0 then
    raise exception 'FALLIDO: la fila de la cola no trae el restaurante o cuenta correcciones de más' using errcode = 'assert_failure';
  end if;
  if (select guaranteed from public.team_menu_queue('ee100000-0000-0000-0000-000000000001')
        where menu_id = (select v from eq_ids where k = 'm3')) is distinct from false then
    raise exception 'RN-MEN-07 FALLIDO: el menú de hoy, pedido después del corte, salía garantizado' using errcode = 'assert_failure';
  end if;
  -- El orden: por fecha objetivo. El de hoy va antes que el de dentro de tres días.
  if (select menu_id from public.team_menu_queue('ee100000-0000-0000-0000-000000000001') limit 1) <> (select v from eq_ids where k = 'm3') then
    raise exception 'FALLIDO: la cola no va por fecha objetivo' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Pepe (no autorizado en Casa Cola) no ve nada en la cola; otro espacio, tampoco.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000009', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.team_menu_queue('ee100000-0000-0000-0000-000000000001')) <> 0 then
    raise exception '§4.2 FALLIDO: un trabajador sin autorización en el restaurante ve sus menús en la cola' using errcode = 'assert_failure';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000008', false);
set role authenticated;
do $$
begin
  begin
    perform public.team_menu_queue('ee100000-0000-0000-0000-000000000001');
    raise exception 'CA-02 FALLIDO: otro espacio leyó la cola' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el equipo%' then raise; end if;
  end;
end $$;
reset role;

-- El propietario asigna a Ana. Después: el propietario ve a quién, Ana se
-- ve a sí misma, Luis solo ve que está asignado.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  perform public.assign_menu_publication((select v from eq_ids where k = 'm1'), 'ee000000-0000-0000-0000-000000000003', 'A Ana');
  if (select assigned_to from public.team_menu_queue('ee100000-0000-0000-0000-000000000001') where menu_id = (select v from eq_ids where k = 'm1'))
     <> 'ee000000-0000-0000-0000-000000000003' then
    raise exception 'FALLIDO: quien gestiona no ve a quién está asignado el menú' using errcode = 'assert_failure';
  end if;
  if (select active_menu_count from public.list_menu_candidates((select v from eq_ids where k = 'm3')) where worker_id = 'ee000000-0000-0000-0000-000000000003') <> 1 then
    raise exception 'RN-ASG-06 FALLIDO: la lista de candidatos no cuenta el menú que Ana ya tiene' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_row record;
begin
  select * into v_row from public.team_menu_queue('ee100000-0000-0000-0000-000000000001') where menu_id = (select v from eq_ids where k = 'm1');
  if not v_row.is_assigned or v_row.assigned_to is not null then
    raise exception 'RN-ASG-17 FALLIDO: Luis debía ver que está asignado, pero no a quién' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if (select assigned_to from public.team_menu_queue('ee100000-0000-0000-0000-000000000001') where menu_id = (select v from eq_ids where k = 'm1'))
     <> 'ee000000-0000-0000-0000-000000000003' then
    raise exception 'FALLIDO: Ana no se ve a sí misma como asignada' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- §62 · El aviso de las 08:00, con la hora fija.
--
-- Antes, una publicación fabricada que se pidió antes del corte pero cuyo
-- restaurante guardó una versión DESPUÉS: perdió la garantía (RN-MEN-07)
-- y no se avisa de ella.
-- ============================================================
do $$
declare v_m uuid; v_v1 uuid; v_v2 uuid; v_e uuid; v_cycle uuid;
begin
  v_cycle := public.get_or_create_menu_update_cycle('ee600000-0000-0000-0000-000000000001');
  insert into public.menus (id, space_id, establishment_id, name, kind, target_date, state, template_id, created_by)
  values ('ee800000-0000-0000-0000-000000000009', 'ee100000-0000-0000-0000-000000000001', 'ee400000-0000-0000-0000-000000000001',
          'Tardío', 'daily', current_date + 3, 'assigned', (select v from eq_ids where k = 'tpl'), 'ee000000-0000-0000-0000-000000000005')
  returning id into v_m;
  insert into public.menu_versions (space_id, menu_id, version, starters, mains, desserts, after_cutoff, created_by, created_at)
  values ('ee100000-0000-0000-0000-000000000001', v_m, 1, '{}', '{}', '{}', false, 'ee000000-0000-0000-0000-000000000005', now() - interval '2 hours')
  returning id into v_v1;
  insert into public.menu_update_entries (space_id, establishment_id, cycle_id, amount, entry_type, menu_id, created_by)
  values ('ee100000-0000-0000-0000-000000000001', 'ee400000-0000-0000-0000-000000000001', v_cycle, -1, 'debit', v_m, 'ee000000-0000-0000-0000-000000000005')
  returning id into v_e;
  insert into public.menu_publications (space_id, establishment_id, menu_id, requested_by, requested_at, requested_version_id,
                                        cycle_id, debit_entry_id, requested_before_cutoff, assigned_to, assigned_at, assignment_mode)
  values ('ee100000-0000-0000-0000-000000000001', 'ee400000-0000-0000-0000-000000000001', v_m, 'ee000000-0000-0000-0000-000000000005',
          now() - interval '1 hour', v_v1, v_cycle, v_e, true, 'ee000000-0000-0000-0000-000000000004', now() - interval '1 hour', 'auto');
  insert into public.menu_versions (space_id, menu_id, version, starters, mains, desserts, after_cutoff, created_by)
  values ('ee100000-0000-0000-0000-000000000001', v_m, 2, '{}', '{}', '{}', true, 'ee000000-0000-0000-0000-000000000005')
  returning id into v_v2;
  update public.menus set current_version_id = v_v2 where id = v_m;
end $$;

do $$
declare v_n integer; v_dia date := current_date + 3;
begin
  -- A las 07:59 del día objetivo, nada.
  v_n := public.run_daily_menu_sweep('ee100000-0000-0000-0000-000000000001',
           (v_dia::timestamp + time '07:59') at time zone 'Europe/Madrid');
  if (select count(*) from public.notifications where event_type = 'menu_publication_overdue') <> 0 then
    raise exception '§62 FALLIDO: avisó antes de las 08:00' using errcode = 'assert_failure';
  end if;

  -- A las 08:00: el menú pedido antes del corte y sin publicar → propietario, administrador y Ana.
  v_n := public.run_daily_menu_sweep('ee100000-0000-0000-0000-000000000001',
           (v_dia::timestamp + time '08:00') at time zone 'Europe/Madrid');
  if v_n <> 3 then
    raise exception '§62 FALLIDO: a las 08:00 debía avisar a 3 personas y avisó a %', v_n using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.notifications
        where event_type = 'menu_publication_overdue' and entity_type = 'menu' and entity_id = (select v from eq_ids where k = 'm1')
          and recipient_id in ('ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000003')) <> 3 then
    raise exception '§18 FALLIDO: el aviso de las 08:00 no llegó al propietario, al administrador y a la asignada' using errcode = 'assert_failure';
  end if;
  -- El de hoy se pidió después del corte: no había garantía, no se avisa.
  if (select count(*) from public.notifications where event_type = 'menu_publication_overdue' and entity_id = (select v from eq_ids where k = 'm3')) <> 0 then
    raise exception '§62 FALLIDO: avisó de una publicación pedida después del corte, que no estaba garantizada' using errcode = 'assert_failure';
  end if;
  -- El tardío se pidió antes del corte pero cambió después: perdió la garantía (RN-MEN-07), no se avisa.
  if (select count(*) from public.notifications where event_type = 'menu_publication_overdue' and entity_id = 'ee800000-0000-0000-0000-000000000009') <> 0 then
    raise exception 'RN-MEN-07 FALLIDO: avisó de una publicación que perdió la garantía por una versión tardía' using errcode = 'assert_failure';
  end if;
  if (select deep_link from public.notifications where event_type = 'menu_publication_overdue' limit 1)
     <> '/espacios/espacio-equipo-test/menu-diario/' || (select v from eq_ids where k = 'm1')::text then
    raise exception 'RN-NOT-04 FALLIDO: el aviso de las 08:00 no enlaza con la ficha del equipo' using errcode = 'assert_failure';
  end if;

  -- CA-17: la segunda pasada, una hora más tarde, no repite.
  v_n := public.run_daily_menu_sweep('ee100000-0000-0000-0000-000000000001',
           (v_dia::timestamp + time '09:00') at time zone 'Europe/Madrid');
  if v_n <> 0 then
    raise exception 'CA-17 FALLIDO: la segunda pasada del barrido repitió el aviso de las 08:00' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MEN-08 · El recordatorio de las 20:00, con la hora fija.
-- ============================================================
do $$
declare v_n integer; v_dia date := current_date + 10;
begin
  -- 19:59: todavía no.
  v_n := public.run_daily_menu_sweep('ee100000-0000-0000-0000-000000000001',
           (v_dia::timestamp + time '19:59') at time zone 'Europe/Madrid');
  if (select count(*) from public.notifications where event_type = 'menu_not_prepared_reminder') <> 0 then
    raise exception 'RN-MEN-08 FALLIDO: recordó antes de las 20:00' using errcode = 'assert_failure';
  end if;

  -- 20:00, sin menú para mañana: propietario local, Editor y propietario global. Consulta no.
  v_n := public.run_daily_menu_sweep('ee100000-0000-0000-0000-000000000001',
           (v_dia::timestamp + time '20:00') at time zone 'Europe/Madrid');
  if v_n <> 3 then
    raise exception 'RN-MEN-08 FALLIDO: debía recordar a 3 personas y recordó a %', v_n using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.notifications
        where event_type = 'menu_not_prepared_reminder' and entity_type = 'establishment'
          and entity_id = 'ee400000-0000-0000-0000-000000000001' and audience = 'client'
          and recipient_id in ('ee000000-0000-0000-0000-000000000005', 'ee000000-0000-0000-0000-000000000006', 'ee000000-0000-0000-0000-000000000010')) <> 3 then
    raise exception 'RN-MEN-08 FALLIDO: el recordatorio no fue al propietario, al Editor y al propietario global' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications where event_type = 'menu_not_prepared_reminder' and recipient_id = 'ee000000-0000-0000-0000-000000000007') then
    raise exception 'RN-MEN-08 FALLIDO: Consulta recibió el recordatorio' using errcode = 'assert_failure';
  end if;
  -- El restaurante sin el servicio no recibe nada.
  if exists (select 1 from public.notifications where event_type = 'menu_not_prepared_reminder' and entity_id = 'ee400000-0000-0000-0000-000000000002') then
    raise exception 'RN-MEN-08 FALLIDO: se recordó Menú Diario a un restaurante que no lo tiene' using errcode = 'assert_failure';
  end if;
  if (select deep_link from public.notifications where event_type = 'menu_not_prepared_reminder' limit 1)
     <> '/espacios/espacio-equipo-test/restaurantes/ee400000-0000-0000-0000-000000000001/menu-diario' then
    raise exception 'RN-NOT-04 FALLIDO: el recordatorio no enlaza con el Menú Diario del restaurante' using errcode = 'assert_failure';
  end if;

  -- CA-17: a las 23:00 del mismo día, nada nuevo.
  v_n := public.run_daily_menu_sweep('ee100000-0000-0000-0000-000000000001',
           (v_dia::timestamp + time '23:00') at time zone 'Europe/Madrid');
  if v_n <> 0 then
    raise exception 'CA-17 FALLIDO: la segunda pasada repitió el recordatorio' using errcode = 'assert_failure';
  end if;
end $$;

-- Un borrador para mañana no es un menú preparado; uno preparado, sí.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
declare v_d uuid; v_p uuid;
begin
  v_d := public.create_menu('ee400000-0000-0000-0000-000000000001', 'Borrador', 'daily', current_date + 13, (select v from eq_ids where k = 'tpl'));
  v_p := public.create_menu('ee400000-0000-0000-0000-000000000001', 'Preparado', 'daily', current_date + 15, (select v from eq_ids where k = 'tpl'));
  perform public.save_menu_version(v_p, array['A'], array['B'], array['C'], null, 1000, null);
  perform public.prepare_menu(v_p);
  insert into eq_ids values ('draft', v_d), ('prepared', v_p);
end $$;
reset role;
do $$
declare v_n integer;
begin
  v_n := public.run_daily_menu_sweep('ee100000-0000-0000-0000-000000000001',
           ((current_date + 12)::timestamp + time '20:30') at time zone 'Europe/Madrid');
  if v_n <> 3 then
    raise exception 'RN-MEN-08 FALLIDO: un borrador contó como menú preparado (recordó a %)', v_n using errcode = 'assert_failure';
  end if;
  v_n := public.run_daily_menu_sweep('ee100000-0000-0000-0000-000000000001',
           ((current_date + 14)::timestamp + time '20:30') at time zone 'Europe/Madrid');
  if v_n <> 0 then
    raise exception 'RN-MEN-08 FALLIDO: con un menú preparado para mañana recordó igual (%)', v_n using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- La cola periódica conoce el tipo nuevo: se encola y se despacha.
-- ============================================================
do $$
declare v_job uuid; v_n integer;
begin
  v_n := public.enqueue_due_scheduled_jobs(now());
  if not exists (select 1 from public.scheduled_jobs where space_id = 'ee100000-0000-0000-0000-000000000001' and kind = 'daily_menu_sweep') then
    raise exception 'FALLIDO: enqueue_due_scheduled_jobs no encola el barrido de Menú Diario' using errcode = 'assert_failure';
  end if;
  v_job := public.enqueue_scheduled_job('ee100000-0000-0000-0000-000000000001', 'daily_menu_sweep', now(), 'eq-menu-sweep-1');
  perform public.run_scheduled_job(v_job);
  if (select status from public.scheduled_jobs where id = v_job) <> 'done' then
    raise exception 'FALLIDO: el despachador no ejecuta el barrido de Menú Diario' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Ana publica m1. Luego, la corrección mínima (RN-COR-01/02/06/07/10).
-- ============================================================
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  perform public.mark_menu_published((select v from eq_ids where k = 'm1'));
  if (select state from public.menus where id = (select v from eq_ids where k = 'm1')) <> 'published' then
    raise exception 'FIXTURE: Ana no pudo publicar su menú asignado';
  end if;
  -- Publicado y sin corrección: fuera de la cola.
  if exists (select 1 from public.team_menu_queue('ee100000-0000-0000-0000-000000000001') where menu_id = (select v from eq_ids where k = 'm1')) then
    raise exception 'FALLIDO: un menú publicado sin corrección sigue en la cola' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Consulta no pide correcciones (§4.3).
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000007', false);
set role authenticated;
do $$
begin
  begin
    perform public.request_menu_correction((select v from eq_ids where k = 'm1'), 'Falta una tilde');
    raise exception '§4.3 FALLIDO: Consulta pidió una corrección' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_c uuid; v_row record; v_before integer; v_after integer;
begin
  -- Sobre un borrador, no: la corrección es de un menú publicado.
  begin
    perform public.request_menu_correction((select v from eq_ids where k = 'draft'), 'Nada');
    raise exception 'RN-COR-10 FALLIDO: se pidió corrección de un borrador' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%menú publicado%' then raise; end if;
  end;
  -- Sin texto, no.
  begin
    perform public.request_menu_correction((select v from eq_ids where k = 'm1'), '   ');
    raise exception 'FALLIDO: se admitió una corrección sin texto' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Di qué hay que corregir%' then raise; end if;
  end;

  select available into v_before from public.menu_update_balance('ee400000-0000-0000-0000-000000000001');
  v_c := public.request_menu_correction((select v from eq_ids where k = 'm1'), 'El precio es 14,90, no 14,50');
  insert into eq_ids values ('corr', v_c);
  select available into v_after from public.menu_update_balance('ee400000-0000-0000-0000-000000000001');
  if v_after <> v_before then
    raise exception 'RN-COR FALLIDO: pedir la corrección mínima consumió una actualización' using errcode = 'assert_failure';
  end if;

  select kind, requested_before_cutoff, completed_at into v_row from public.menu_corrections where id = v_c;
  if v_row.kind <> 'client_request' or v_row.requested_before_cutoff is distinct from true or v_row.completed_at is not null then
    raise exception 'RN-COR-10 FALLIDO: pedida tres días antes del menú, debía quedar garantizada y abierta' using errcode = 'assert_failure';
  end if;

  -- RN-COR-01: la segunda, no.
  begin
    perform public.request_menu_correction((select v from eq_ids where k = 'm1'), 'Y otra cosa');
    raise exception 'RN-COR-01 FALLIDO: se admitió una segunda corrección sobre la misma publicación' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%RN-COR-01%' then raise; end if;
  end;

  -- El historial lo cuenta (RN-MEN-10) y el menú sigue publicado.
  if (select count(*) from public.menu_events where menu_id = (select v from eq_ids where k = 'm1') and reason like 'Corrección pedida:%') <> 1 then
    raise exception 'RN-MEN-10 FALLIDO: la corrección no dejó evento en el historial' using errcode = 'assert_failure';
  end if;
  if (select state from public.menus where id = (select v from eq_ids where k = 'm1')) <> 'published' then
    raise exception 'FALLIDO: pedir una corrección cambió el estado del menú' using errcode = 'assert_failure';
  end if;

  -- P7: el restaurante lee su corrección, pero no quién la pidió ni quién la cerró.
  if (select count(*) from public.menu_corrections where menu_id = (select v from eq_ids where k = 'm1')) <> 1 then
    raise exception 'FALLIDO: el restaurante no lee su propia corrección' using errcode = 'assert_failure';
  end if;
  begin
    perform requested_by from public.menu_corrections where id = v_c;
    raise exception 'P7 FALLIDO: el restaurante lee requested_by de menu_corrections' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
  begin
    perform completed_by from public.menu_corrections where id = v_c;
    raise exception 'P7 FALLIDO: el restaurante lee completed_by de menu_corrections' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;

  -- El restaurante no cierra correcciones.
  begin
    perform public.complete_menu_correction(v_c, 'Hecho');
    raise exception 'RN-COR-06 FALLIDO: el restaurante cerró su propia corrección' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el trabajador asignado%' then raise; end if;
  end;
end $$;
reset role;

-- El aviso "Corrección pedida" va al equipo: propietario, administrador y Ana (asignada).
do $$
begin
  if (select count(*) from public.notifications
        where event_type = 'correction_requested' and entity_type = 'menu' and entity_id = (select v from eq_ids where k = 'm1')
          and recipient_id in ('ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000003')) <> 3 then
    raise exception '§18 FALLIDO: la corrección pedida no avisó al propietario, al administrador y a la asignada' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications where event_type = 'correction_requested' and entity_id = (select v from eq_ids where k = 'm1') and recipient_id = 'ee000000-0000-0000-0000-000000000004') then
    raise exception '§18 FALLIDO: Luis, que no está asignado, recibió el aviso de la corrección' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where action = 'menu.correction_requested' and entity_id = (select v from eq_ids where k = 'm1')
        and (new_value->>'consumes_free_correction')::boolean and (new_value->>'requested_before_cutoff')::boolean) <> 1 then
    raise exception 'CLAUDE.md MUST FALLIDO: la corrección pedida no dejó apunte de auditoría' using errcode = 'assert_failure';
  end if;
end $$;

-- Un menú publicado con corrección pendiente vuelve a la cola.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  if (select pending_corrections from public.team_menu_queue('ee100000-0000-0000-0000-000000000001') where menu_id = (select v from eq_ids where k = 'm1')) is distinct from 1 then
    raise exception 'FALLIDO: la cola no enseña el menú publicado con una corrección pendiente' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Luis (no asignado, sin manage_requests) ni abre por error del equipo ni cierra.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  begin
    perform public.open_menu_team_error_correction((select v from eq_ids where k = 'm1'), 'Subí la versión vieja');
    raise exception 'RN-MEN-06 FALLIDO: un trabajador no asignado abrió una corrección por error del equipo' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el trabajador asignado%' then raise; end if;
  end;
  begin
    perform public.complete_menu_correction((select v from eq_ids where k = 'corr'), null);
    raise exception 'RN-MEN-06 FALLIDO: un trabajador no asignado cerró la corrección' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el trabajador asignado%' then raise; end if;
  end;
end $$;
reset role;

-- Ana (asignada): abre por error propio sin límite ni consumo, y cierra la del restaurante.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_e1 uuid; v_e2 uuid; v_before integer; v_after integer;
begin
  v_e1 := public.open_menu_team_error_correction((select v from eq_ids where k = 'm1'), 'Subí la versión vieja');
  v_e2 := public.open_menu_team_error_correction((select v from eq_ids where k = 'm1'), 'Y la plantilla equivocada');
  insert into eq_ids values ('err1', v_e1);
  if (select count(*) from public.menu_corrections where menu_id = (select v from eq_ids where k = 'm1') and kind = 'team_error') <> 2 then
    raise exception 'RN-COR-07 FALLIDO: las correcciones por error del equipo están limitadas' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where action = 'menu.team_error_correction_opened' and entity_id = (select v from eq_ids where k = 'm1')
        and not (new_value->>'consumes_free_correction')::boolean) <> 2 then
    raise exception 'CLAUDE.md MUST FALLIDO: el error del equipo no dejó apunte, o dice que consume' using errcode = 'assert_failure';
  end if;

  perform public.complete_menu_correction((select v from eq_ids where k = 'corr'), 'Precio corregido en LandingSite');
  perform public.complete_menu_correction((select v from eq_ids where k = 'corr'), 'Otra vez'); -- CA-17
  if (select completed_at from public.menu_corrections where id = (select v from eq_ids where k = 'corr')) is null
     or (select completion_note from public.menu_corrections where id = (select v from eq_ids where k = 'corr')) <> 'Precio corregido en LandingSite' then
    raise exception 'FALLIDO: la corrección no quedó cerrada, o la segunda pulsación la pisó' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where action = 'menu.correction_completed'
        and new_value->>'correction_id' = (select v from eq_ids where k = 'corr')::text) <> 1 then
    raise exception 'CA-17 FALLIDO: cerrar dos veces dejó dos apuntes (o ninguno)' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.menu_events where menu_id = (select v from eq_ids where k = 'm1') and reason like 'Corrección aplicada:%') <> 1 then
    raise exception 'RN-MEN-10 FALLIDO: cerrar la corrección no dejó evento en el historial' using errcode = 'assert_failure';
  end if;
  -- Quedan las dos de error del equipo pendientes: sigue en la cola con 2.
  if (select pending_corrections from public.team_menu_queue('ee100000-0000-0000-0000-000000000001') where menu_id = (select v from eq_ids where k = 'm1')) <> 2 then
    raise exception 'FALLIDO: la cola no cuenta bien las correcciones pendientes' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El administrador (manage_requests) también cierra, en lugar de la asignada.
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  perform public.complete_menu_correction((select v from eq_ids where k = 'err1'), null);
  if (select completed_at from public.menu_corrections where id = (select v from eq_ids where k = 'err1')) is null then
    raise exception 'RN-COR-06 FALLIDO: quien gestiona no pudo cerrar una corrección' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-COR-02 y RN-COR-10 · la ventana cerrada, y la salvedad de las 21:00.
-- Dos publicaciones fabricadas a mano: una de hace cuatro días (fuera de
-- ventana) y una de hoy publicada hace una hora (dentro, pero después del
-- corte de ayer a las 21:00).
-- ============================================================
do $$
declare v_cycle uuid; v_m uuid; v_v uuid; v_e uuid; v_i integer;
begin
  v_cycle := public.get_or_create_menu_update_cycle('ee600000-0000-0000-0000-000000000001');
  for v_i in 1..2 loop
    insert into public.menus (id, space_id, establishment_id, name, kind, target_date, state, template_id, created_by, published_at)
    values (('ee800000-0000-0000-0000-00000000000' || v_i)::uuid, 'ee100000-0000-0000-0000-000000000001', 'ee400000-0000-0000-0000-000000000001',
            case v_i when 1 then 'Viejo' else 'De hoy' end, 'daily',
            case v_i when 1 then current_date - 4 else current_date end, 'published',
            (select v from eq_ids where k = 'tpl'), 'ee000000-0000-0000-0000-000000000005',
            case v_i when 1 then now() - interval '4 days' else now() - interval '1 hour' end)
    returning id into v_m;
    insert into public.menu_versions (space_id, menu_id, version, starters, mains, desserts, created_by)
    values ('ee100000-0000-0000-0000-000000000001', v_m, 1, '{}', '{}', '{}', 'ee000000-0000-0000-0000-000000000005')
    returning id into v_v;
    update public.menus set current_version_id = v_v, published_version_id = v_v where id = v_m;
    insert into public.menu_update_entries (space_id, establishment_id, cycle_id, amount, entry_type, menu_id, created_by)
    values ('ee100000-0000-0000-0000-000000000001', 'ee400000-0000-0000-0000-000000000001', v_cycle, -1, 'debit', v_m, 'ee000000-0000-0000-0000-000000000005')
    returning id into v_e;
    insert into public.menu_publications (space_id, establishment_id, menu_id, requested_by, requested_at, requested_version_id,
                                          cycle_id, debit_entry_id, requested_before_cutoff, assigned_to, published_at, published_by)
    values ('ee100000-0000-0000-0000-000000000001', 'ee400000-0000-0000-0000-000000000001', v_m, 'ee000000-0000-0000-0000-000000000005',
            case v_i when 1 then now() - interval '5 days' else now() - interval '2 hours' end, v_v, v_cycle, v_e, true,
            'ee000000-0000-0000-0000-000000000003',
            case v_i when 1 then now() - interval '4 days' else now() - interval '1 hour' end,
            'ee000000-0000-0000-0000-000000000003');
  end loop;
end $$;

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_c uuid;
begin
  begin
    perform public.request_menu_correction('ee800000-0000-0000-0000-000000000001', 'Tarde');
    raise exception 'RN-COR-02 FALLIDO: se admitió una corrección cuatro días después de publicar' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%RN-COR-02%' then raise; end if;
  end;

  v_c := public.request_menu_correction('ee800000-0000-0000-0000-000000000002', 'El postre de hoy es otro');
  if (select requested_before_cutoff from public.menu_corrections where id = v_c) then
    raise exception 'RN-COR-10 FALLIDO: una corrección del menú de hoy, pedida después de las 21:00 de ayer, salía garantizada' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- §20.5 · Los menús en la búsqueda global, con RLS.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.global_search('Casa Cola') where kind = 'menu';
  if v_n <> (select count(*) from public.menus where establishment_id = 'ee400000-0000-0000-0000-000000000001') then
    raise exception 'HU-33 FALLIDO: el restaurante no encuentra sus menús por el nombre del restaurante (% resultados)', v_n using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.global_search('Menú del día') where kind = 'menu' and id = (select v from eq_ids where k = 'm1')) <> 1 then
    raise exception 'HU-33 FALLIDO: no encuentra el menú por su nombre' using errcode = 'assert_failure';
  end if;
  if (select deep_link from public.global_search('Menú del día') where kind = 'menu' and id = (select v from eq_ids where k = 'm1'))
     <> '/espacios/espacio-equipo-test/menu-diario/' || (select v from eq_ids where k = 'm1')::text then
    raise exception 'HU-33 FALLIDO: el enlace del resultado no es la ficha del menú' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000009', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.global_search('Casa Cola') where kind = 'menu') <> 0 then
    raise exception '§4.2 FALLIDO: un trabajador sin autorización encuentra menús de ese restaurante' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000008', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.global_search('Casa Cola')) <> 0
     or (select count(*) from public.menu_corrections) <> 0 then
    raise exception 'CA-02 FALLIDO: otro espacio encuentra menús o correcciones ajenas' using errcode = 'assert_failure';
  end if;
  begin
    perform public.complete_menu_correction((select v from eq_ids where k = 'err1'), null);
    raise exception 'CA-02 FALLIDO: otro espacio cerró una corrección ajena' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like '%CA-02%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- Las internas están cerradas por RPC (CLAUDE.md MUST) y la tabla nueva
-- no admite escritura directa.
-- ============================================================
do $$
declare v_fn text; v_abiertas text := '';
begin
  foreach v_fn in array array[
    'run_daily_menu_sweep(uuid, timestamptz)',
    'menu_correction_window_ends_at(timestamptz)',
    'lock_published_menu_publication(uuid)',
    'menu_candidate_ids(uuid)'
  ] loop
    if has_function_privilege('authenticated', 'public.' || v_fn, 'execute')
       or has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      v_abiertas := v_abiertas || ' ' || v_fn;
    end if;
  end loop;
  if v_abiertas <> '' then
    raise exception 'CLAUDE.md MUST FALLIDO: funciones internas del Hito 11 abiertas por RPC:%', v_abiertas using errcode = 'assert_failure';
  end if;
  if exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname = 'menu_corrections' and p.polcmd <> 'r') then
    raise exception 'CLAUDE.md MUST FALLIDO: menu_corrections admite escritura directa' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza
-- ============================================================
drop table eq_ids;
delete from public.scheduled_jobs where space_id in ('ee100000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000002');
delete from public.audit_log where space_id in ('ee100000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000002');
delete from public.spaces where id in ('ee100000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000002');
delete from auth.users where id in (
  'ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000002',
  'ee000000-0000-0000-0000-000000000003', 'ee000000-0000-0000-0000-000000000004',
  'ee000000-0000-0000-0000-000000000005', 'ee000000-0000-0000-0000-000000000006',
  'ee000000-0000-0000-0000-000000000007', 'ee000000-0000-0000-0000-000000000008',
  'ee000000-0000-0000-0000-000000000009', 'ee000000-0000-0000-0000-000000000010'
);

select 'menu_diario_equipo_cola_y_correccion: OK' as resultado;
