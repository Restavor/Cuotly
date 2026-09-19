-- Menú Diario · menús, versiones, estados, publicaciones y actualizaciones
-- (Fase 2, Hito 9; migración 77; PRD RN-MEN-01 a 13, §57 a §64).
--
-- Lo que se comprueba, en el orden en que le pasa a un menú:
--
--   · RN-MEN-11 / RN-COM-10: tres plantillas incluidas y no una más,
--     archivar no libera la plaza, la cuarta es presupuestada; solo el
--     equipo con manage_clients las crea.
--   · RN-MEN-01/02/03: el Editor crea el menú y cada guardado es una
--     versión nueva que nadie edita; Consulta no escribe; otro espacio no
--     ve nada.
--   · RN-MEN-09: preparar exige contenido y plantilla; los estados van en
--     el orden de §63 y el historial (`menu_events`) los conserva
--     (RN-MEN-10).
--   · RN-MEN-05 / RN-CON-06 / RN-CON-07: pedir la publicación consume UNA
--     actualización, la misma petición dos veces devuelve la misma fila,
--     el último crédito solo lo consume una petición, cancelar antes de
--     Publicado lo devuelve y después no; el equipo puede devolverlo con
--     motivo, una sola vez (RN-CON-12).
--   · RN-CON-10: si el ciclo del consumo ya cerró, la devolución es un
--     crédito compensatorio en el ciclo vigente.
--   · RN-ASG-04 aplicado: con un único candidato de Menú Diario se asigna
--     solo; con dos queda pendiente y avisa al equipo.
--   · RN-MEN-06: marcar publicado registra fecha, versión, plantilla y
--     consumo, avisa al restaurante y al equipo, y dos pulsaciones son un
--     efecto (CA-17). Sin botón Comenzar: no hay estado "en curso".
--   · RN-MEN-07: el corte es las 21:00 del día anterior en la zona del
--     espacio; una versión guardada después queda marcada y pierde la
--     garantía; la publicación se garantiza antes de las 08:00.
--   · RN-MEN-12 / P7: el restaurante no lee `menu_publications`, ni el
--     actor de `menu_events`, ni `created_by` de menús y versiones.
--   · RN-MEN-13 / §85: suspendido por impago, ni se pide ni se publica.
--   · Las internas están cerradas por RPC (CLAUDE.md MUST).
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/menu_diario_menus_y_actualizaciones.sql

-- ============================================================
-- Fixture
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('dd000000-0000-0000-0000-000000000001', 'md-owner@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000002', 'md-admin@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000003', 'md-ana@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000004', 'md-luis@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000005', 'md-local@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000006', 'md-editor@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000007', 'md-consulta@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000008', 'md-otro@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000009', 'md-marta@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('dd100000-0000-0000-0000-000000000001', 'Espacio Menú', 'espacio-menu-test', 'Europe/Madrid',
   'dd000000-0000-0000-0000-000000000001'),
  ('dd100000-0000-0000-0000-000000000002', 'Espacio Ajeno', 'espacio-ajeno-menu-test', 'Europe/Madrid',
   'dd000000-0000-0000-0000-000000000008');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000004', 'worker', 'active'),
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000009', 'worker', 'active'),
  ('dd100000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000008', 'owner', 'active');

-- Dos actualizaciones por ciclo, para poder agotarlas en un test. Restavor
-- tiene 30 (RN-COM-09); el número lo pone el espacio, no la función.
insert into public.services (id, space_id, name, price_cents, price_premium_cents, kind, included_updates) values
  ('dd250000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000001', 'Menú Diario', 22900, 19900, 'daily_menu', 2);

insert into public.groups (id, space_id, name) values
  ('dd300000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000001', 'Grupo Menú');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('dd400000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000001',
   'dd300000-0000-0000-0000-000000000001', 'MEN-0001', 'Casa Menú', 'active'),
  ('dd400000-0000-0000-0000-000000000002', 'dd100000-0000-0000-0000-000000000001',
   'dd300000-0000-0000-0000-000000000001', 'MEN-0002', 'Sin Servicio', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('dd400000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000005', 'local_owner'),
  ('dd400000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000006', 'editor'),
  ('dd400000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000007', 'editor');

-- RN-EST-15 (migración 107) · los Editores de esta suite reciben los cuatro
-- permisos de contenido, que es lo que `grant_establishment_access()` les
-- habría dado al crearlos: aquí las membresías se insertan a mano y una
-- membresía sin fila de permisos no puede nada.
--
-- Se excluye a quien hasta el 19/09/2026 era **Consulta**: ese rol se
-- retiró (RN-EST-16) y su equivalente exacto es un Editor con todo
-- apagado, que es justo lo que esta suite espera de él.
insert into public.establishment_permissions
  (establishment_membership_id, create_requests, edit_menus, use_messages, upload_files)
select em.id, true, true, true, true
from public.establishment_memberships em
where em.role = 'editor'
  and em.user_id not in ('dd000000-0000-0000-0000-000000000007')
on conflict (establishment_membership_id) do update set
  create_requests = true, edit_menus = true, use_messages = true,
  upload_files = true;

insert into public.subscriptions (id, space_id, establishment_id, kind, service_id, status, started_at, created_by) values
  ('dd600000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000001',
   'dd400000-0000-0000-0000-000000000001', 'service', 'dd250000-0000-0000-0000-000000000001', 'active',
   now() - interval '10 days', 'dd000000-0000-0000-0000-000000000002');

-- Ana: Menú Diario y autorizada en Casa Menú. Luis: web, autorizado.
-- Marta: Menú Diario pero NO autorizada (entra a mitad del test).
insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000003', 'daily_menu', 'dd000000-0000-0000-0000-000000000001'),
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000004', 'web', 'dd000000-0000-0000-0000-000000000001'),
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000009', 'daily_menu', 'dd000000-0000-0000-0000-000000000001');

insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000003', 'dd400000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001'),
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000004', 'dd400000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001');

-- ============================================================
-- El esquema: un Menú Diario sin actualizaciones no existe.
-- ============================================================
do $$
begin
  begin
    insert into public.services (space_id, name, price_cents, kind, included_updates)
    values ('dd100000-0000-0000-0000-000000000001', 'Sin bolsa', 100, 'daily_menu', 0);
    raise exception 'RN-COM-09 FALLIDO: se admite un servicio de Menú Diario con 0 actualizaciones' using errcode = 'assert_failure';
  exception when check_violation then null;
  end;
end $$;

-- ============================================================
-- RN-MEN-11 / RN-COM-10 · Las plantillas
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
begin
  begin
    perform public.create_menu_template('dd400000-0000-0000-0000-000000000001', 'La del cliente');
    raise exception 'RN-MEN-11 FALLIDO: el propietario local ha creado una plantilla' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;

reset role;
create temp table md_quote (k text primary key, v uuid);
grant select, insert on md_quote to authenticated;
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_q uuid;
begin
  begin
    perform public.create_menu_template('dd400000-0000-0000-0000-000000000002', 'Sin servicio');
    raise exception 'RN-MEN-11 FALLIDO: plantilla en un restaurante sin Menú Diario' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no tiene contratado Menú Diario%' then raise; end if;
  end;

  v_t1 := public.create_menu_template('dd400000-0000-0000-0000-000000000001', 'Clásica');
  v_t2 := public.create_menu_template('dd400000-0000-0000-0000-000000000001', 'Pizarra');
  v_t3 := public.create_menu_template('dd400000-0000-0000-0000-000000000001', 'Moderna');

  begin
    perform public.create_menu_template('dd400000-0000-0000-0000-000000000001', 'Cuarta');
    raise exception 'RN-COM-10 FALLIDO: se ha creado una cuarta plantilla incluida' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%tres plantillas incluidas ya se usaron%' then raise; end if;
  end;

  -- Archivar no libera la plaza: "incluidas una sola vez".
  perform public.archive_menu_template(v_t3, 'Ya no gusta');
  perform public.archive_menu_template(v_t3, 'Ya no gusta'); -- CA-17
  begin
    perform public.create_menu_template('dd400000-0000-0000-0000-000000000001', 'Cuarta');
    raise exception 'RN-COM-10 FALLIDO: archivar una incluida liberó su plaza' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%tres plantillas incluidas ya se usaron%' then raise; end if;
  end;

  -- La cuarta se presupuesta aparte (RN-MEN-11). Desde el Hito 12 "aparte"
  -- es un presupuesto aceptado (migración 80): sin él, no hay plantilla.
  begin
    perform public.create_menu_template('dd400000-0000-0000-0000-000000000001', 'Navidad 2026', 'quoted');
    raise exception 'RN-MEN-11 FALLIDO: se creó una plantilla presupuestada sin presupuesto' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%cuelga de un presupuesto aceptado%' then raise; end if;
  end;

  v_q := public.create_quote('dd400000-0000-0000-0000-000000000001', 'Plantilla Navidad 2026', 12000, 'menu_template');
  perform public.send_quote(v_q);
  insert into md_quote values ('q', v_q);

  if (select count(*) from public.audit_log where action = 'menu_template.archived' and entity_id = v_t3) <> 1 then
    raise exception 'CLAUDE.md MUST FALLIDO: archivar dos veces dejó % apuntes (esperado 1)',
      (select count(*) from public.audit_log where action = 'menu_template.archived' and entity_id = v_t3) using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- El propietario local acepta el presupuesto de la plantilla...
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  perform public.accept_quote((select v from md_quote where k = 'q'));
end $$;
reset role;

-- ...y el equipo la crea colgando de él.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  perform public.create_menu_template('dd400000-0000-0000-0000-000000000001', 'Navidad 2026', 'quoted',
                                      (select v from md_quote where k = 'q'));
  if (select count(*) from public.menu_templates where establishment_id = 'dd400000-0000-0000-0000-000000000001') <> 4 then
    raise exception 'RN-COM-10 FALLIDO: se esperaban 4 plantillas (3 incluidas + 1 presupuestada)' using errcode = 'assert_failure';
  end if;
  if (select quote_id from public.menu_templates where name = 'Navidad 2026') is distinct from (select v from md_quote where k = 'q') then
    raise exception 'RN-MEN-11 FALLIDO: la plantilla presupuestada no cuelga de su presupuesto' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-MEN-01/02/03 · El Editor crea el menú y lo versiona
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000007', false);
set role authenticated;

do $$
begin
  begin
    perform public.create_menu('dd400000-0000-0000-0000-000000000001', 'Menú del día', 'daily', current_date + 7);
    raise exception 'RN-MEN-01 FALLIDO: Consulta ha creado un menú' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000006', false);
set role authenticated;

create temp table md_ids (k text primary key, v uuid);

do $$
declare
  v_menu uuid; v_v1 uuid; v_v2 uuid; v_tpl uuid;
begin
  begin
    perform public.create_menu('dd400000-0000-0000-0000-000000000002', 'Menú', 'daily', current_date + 7);
    raise exception 'RN-MEN-01 FALLIDO: menú en un restaurante sin Menú Diario' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no tiene contratado Menú Diario%' and sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;

  select id into v_tpl from public.menu_templates where name = 'Clásica';
  v_menu := public.create_menu('dd400000-0000-0000-0000-000000000001', 'Menú del día', 'daily', current_date + 7, v_tpl);
  insert into md_ids values ('menu', v_menu), ('tpl', v_tpl);

  if (select state from public.menus where id = v_menu) <> 'draft' then
    raise exception 'RN-MEN-09 FALLIDO: un menú recién creado no es borrador' using errcode = 'assert_failure';
  end if;

  -- Preparar sin contenido: no.
  begin
    perform public.prepare_menu(v_menu);
    raise exception 'RN-MEN-09 FALLIDO: se ha preparado un menú sin contenido' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no tiene contenido%' then raise; end if;
  end;

  v_v1 := public.save_menu_version(v_menu, array['Ensalada', 'Sopa'], array['Merluza'], array['Flan'], 'Vino o agua', 1450, null);
  v_v2 := public.save_menu_version(v_menu, array['Ensalada', 'Sopa'], array['Merluza', 'Pollo'], array['Flan'], 'Vino o agua', 1450, 'Pan incluido');
  insert into md_ids values ('v1', v_v1), ('v2', v_v2);

  if (select count(*) from public.menu_versions where menu_id = v_menu) <> 2
     or (select version from public.menu_versions where id = v_v2) <> 2
     or (select current_version_id from public.menus where id = v_menu) <> v_v2 then
    raise exception 'RN-MEN-03 FALLIDO: dos guardados no son dos versiones con la segunda vigente' using errcode = 'assert_failure';
  end if;

  -- Una versión no se edita (P4): sin política de UPDATE, 0 filas.
  update public.menu_versions set note = 'cambiado' where id = v_v1;
  if (select note from public.menu_versions where id = v_v1) is not null then
    raise exception 'RN-MEN-03 FALLIDO: una versión guardada se ha podido editar' using errcode = 'assert_failure';
  end if;

  -- La versión 1 sigue intacta.
  if (select mains from public.menu_versions where id = v_v1) <> array['Merluza'] then
    raise exception 'RN-MEN-03 FALLIDO: la versión 1 cambió al guardar la 2' using errcode = 'assert_failure';
  end if;
end $$;

-- El Editor no lee quién creó nada (RN-MEN-12): la columna está revocada.
do $$
declare v_x uuid;
begin
  begin
    select created_by into v_x from public.menus limit 1;
    raise exception 'P7 FALLIDO: el restaurante lee menus.created_by' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
  begin
    select created_by into v_x from public.menu_versions limit 1;
    raise exception 'P7 FALLIDO: el restaurante lee menu_versions.created_by' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
  begin
    select actor_id into v_x from public.menu_events limit 1;
    raise exception 'P7 FALLIDO: el restaurante lee menu_events.actor_id' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
  begin
    select created_by into v_x from public.menu_templates limit 1;
    raise exception 'P7 FALLIDO: el restaurante lee menu_templates.created_by' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Otro espacio no ve nada.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000008', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.menus) <> 0 or (select count(*) from public.menu_templates) <> 0 then
    raise exception 'CA-02 FALLIDO: otro espacio ve menús ajenos' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-MEN-09 / RN-MEN-05 · Preparar y pedir la publicación
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_menu uuid := (select v from md_ids where k = 'menu');
  v_pub uuid; v_pub2 uuid; v_bal record;
begin
  begin
    perform public.request_menu_publication(v_menu);
    raise exception 'RN-MEN-09 FALLIDO: se ha pedido publicar un borrador' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo un menú preparado%' then raise; end if;
  end;

  perform public.prepare_menu(v_menu);
  perform public.prepare_menu(v_menu); -- CA-17
  if (select state from public.menus where id = v_menu) <> 'prepared' then
    raise exception 'RN-MEN-09 FALLIDO: preparar no deja el menú preparado' using errcode = 'assert_failure';
  end if;

  select * into v_bal from public.menu_update_balance('dd400000-0000-0000-0000-000000000001');
  if v_bal.available <> 2 or v_bal.consumed <> 0 or v_bal.cycle_id is not null then
    raise exception 'RN-COM-09 FALLIDO: antes de consumir, el saldo debía ser 2 sin ciclo creado (available=%, cycle=%)', v_bal.available, v_bal.cycle_id using errcode = 'assert_failure';
  end if;

  v_pub := public.request_menu_publication(v_menu, 'clave-1');
  v_pub2 := public.request_menu_publication(v_menu, 'clave-1');
  if v_pub <> v_pub2 then
    raise exception 'RN-CON-07 FALLIDO: la misma clave de idempotencia creó dos publicaciones' using errcode = 'assert_failure';
  end if;
  if public.request_menu_publication(v_menu) <> v_pub then
    raise exception 'CA-17 FALLIDO: pedir otra vez sin clave creó otra publicación' using errcode = 'assert_failure';
  end if;
  insert into md_ids values ('pub', v_pub);

  select * into v_bal from public.menu_update_balance('dd400000-0000-0000-0000-000000000001');
  if v_bal.available <> 1 or v_bal.consumed <> 1 then
    raise exception 'RN-MEN-05 FALLIDO: pedir la publicación debía consumir exactamente 1 (available=%, consumed=%)', v_bal.available, v_bal.consumed using errcode = 'assert_failure';
  end if;

  -- RN-ASG-04: Ana es la única candidata (Luis es web, Marta no está
  -- autorizada): asignación automática.
  if (select state from public.menus where id = v_menu) <> 'assigned' then
    raise exception 'RN-ASG-04 FALLIDO: con un único candidato el menú debía quedar asignado, está %', (select state from public.menus where id = v_menu) using errcode = 'assert_failure';
  end if;

  -- El historial conserva los estados intermedios de §63 (RN-MEN-10).
  if (select string_agg(to_state, '>' order by occurred_at, id) from public.menu_events where menu_id = v_menu)
     <> 'draft>prepared>publication_requested>pending_assignment>assigned' then
    raise exception 'RN-MEN-10 FALLIDO: historial inesperado: %', (select string_agg(to_state, '>' order by occurred_at, id) from public.menu_events where menu_id = v_menu) using errcode = 'assert_failure';
  end if;

  -- P7: el restaurante no lee la publicación (fila interna).
  if (select count(*) from public.menu_publications) <> 0 then
    raise exception 'RN-MEN-12 / P7 FALLIDO: el restaurante lee menu_publications' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- El aviso de asignación: Ana, propietario y administrador. Ni Luis ni el
-- restaurante (RN-NOT-01).
do $$
begin
  if (select count(*) from public.notifications where event_type = 'menu_assigned'
        and recipient_id in ('dd000000-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002')) <> 3
     or exists (select 1 from public.notifications where event_type = 'menu_assigned'
        and recipient_id in ('dd000000-0000-0000-0000-000000000004', 'dd000000-0000-0000-0000-000000000005')) then
    raise exception 'RN-NOT-01 FALLIDO: destinatarios inesperados de menu_assigned' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications where event_type = 'menu_publication_requested') then
    raise exception 'RN-ASG-04 FALLIDO: se avisó "sin asignar" cuando se asignó solo' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MEN-07 · El corte de las 21:00 y la garantía
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_menu uuid := (select v from md_ids where k = 'menu');
  v_d record;
  v_late uuid; v_v uuid;
begin
  select * into v_d from public.menu_deadlines(v_menu);
  if v_d.cutoff_at <> (((current_date + 6)::timestamp + time '21:00') at time zone 'Europe/Madrid')
     or v_d.publish_by_at <> (((current_date + 7)::timestamp + time '08:00') at time zone 'Europe/Madrid') then
    raise exception 'RN-MEN-07 FALLIDO: corte % / límite % no son las 21:00 del día anterior y las 08:00 en Europe/Madrid', v_d.cutoff_at, v_d.publish_by_at using errcode = 'assert_failure';
  end if;
  if v_d.guaranteed is distinct from true then
    raise exception 'RN-MEN-07 FALLIDO: pedida seis días antes, la publicación debía estar garantizada' using errcode = 'assert_failure';
  end if;

  -- Un menú para HOY: el corte fue ayer a las 21:00. Todo lo que se guarde
  -- llega tarde, queda marcado y no se garantiza.
  v_late := public.create_menu('dd400000-0000-0000-0000-000000000001', 'Menú de hoy', 'daily', current_date, (select v from md_ids where k = 'tpl'));
  v_v := public.save_menu_version(v_late, array['Gazpacho'], array['Lubina'], array['Fruta'], null, 1600, null);
  if not (select after_cutoff from public.menu_versions where id = v_v) then
    raise exception 'RN-MEN-07 FALLIDO: una versión guardada después del corte no queda marcada' using errcode = 'assert_failure';
  end if;
  perform public.prepare_menu(v_late);
  perform public.request_menu_publication(v_late, 'clave-hoy');
  insert into md_ids values ('late', v_late);

  select * into v_d from public.menu_deadlines(v_late);
  if v_d.guaranteed is distinct from false then
    raise exception 'RN-MEN-07 FALLIDO: pedida después del corte, la publicación no puede estar garantizada' using errcode = 'assert_failure';
  end if;

  -- Y se consumió la segunda actualización. El servicio va por dos ciclos:
  -- ya no queda ninguna.
  if (select available from public.menu_update_balance('dd400000-0000-0000-0000-000000000001')) <> 0 then
    raise exception 'RN-MEN-05 FALLIDO: dos publicaciones debían dejar el saldo a 0' using errcode = 'assert_failure';
  end if;
end $$;

-- RN-CON-06: el tercer menú no encuentra crédito.
do $$
declare v_m3 uuid;
begin
  v_m3 := public.create_menu('dd400000-0000-0000-0000-000000000001', 'Tercero', 'kids', current_date + 3, (select v from md_ids where k = 'tpl'));
  perform public.save_menu_version(v_m3, array['Macarrones'], array['Nuggets'], array['Helado'], null, 900, null);
  perform public.prepare_menu(v_m3);
  insert into md_ids values ('m3', v_m3);
  begin
    perform public.request_menu_publication(v_m3);
    raise exception 'RN-CON-06 FALLIDO: se consumió una actualización que no existía' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No quedan actualizaciones%' then raise; end if;
  end;
  if (select state from public.menus where id = v_m3) <> 'prepared' then
    raise exception 'RN-CON-06 FALLIDO: la petición fallida cambió el estado' using errcode = 'assert_failure';
  end if;
end $$;

-- Cancelar el de hoy antes de publicar devuelve la actualización
-- (RN-CON-08 aplicado, §60), con motivo obligatorio (RN-CON-12).
do $$
declare
  v_late uuid := (select v from md_ids where k = 'late');
  v_m3 uuid := (select v from md_ids where k = 'm3');
begin
  begin
    perform public.cancel_menu(v_late);
    raise exception 'RN-CON-12 FALLIDO: se canceló una publicación pedida sin motivo' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%necesita un motivo%' then raise; end if;
  end;

  perform public.cancel_menu(v_late, 'Cerramos hoy');
  perform public.cancel_menu(v_late, 'Cerramos hoy'); -- CA-17

  if (select state from public.menus where id = v_late) <> 'cancelled' then
    raise exception 'RN-MEN-09 FALLIDO: cancelar no deja el menú cancelado' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.menu_update_entries where menu_id = v_late and entry_type = 'return') <> 1
     or (select available from public.menu_update_balance('dd400000-0000-0000-0000-000000000001')) <> 1 then
    raise exception 'RN-MEN-05 FALLIDO: cancelar antes de Publicado debía devolver exactamente 1' using errcode = 'assert_failure';
  end if;

  -- Ahora el tercero sí entra.
  perform public.request_menu_publication(v_m3, 'clave-3');
  if (select available from public.menu_update_balance('dd400000-0000-0000-0000-000000000001')) <> 0 then
    raise exception 'RN-CON-06 FALLIDO: la devolución no volvió a estar disponible' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- RN-MEN-13 / §85 · Suspendido por impago: nada se pide ni se publica
-- ============================================================
do $$
begin
  perform set_config('cuotly.status_change', 'on', true);
  update public.establishments set status = 'suspended' where id = 'dd400000-0000-0000-0000-000000000001';
  perform set_config('cuotly.status_change', 'off', true);
end $$;

select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_m uuid;
begin
  v_m := public.create_menu('dd400000-0000-0000-0000-000000000001', 'Suspendido', 'daily', current_date + 9, (select v from md_ids where k = 'tpl'));
  perform public.save_menu_version(v_m, array['A'], array['B'], array['C'], null, null, null);
  perform public.prepare_menu(v_m);
  begin
    perform public.request_menu_publication(v_m);
    raise exception 'RN-MEN-13 FALLIDO: suspendido por impago se ha pedido una publicación' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%detenido por impago%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.mark_menu_published((select v from md_ids where k = 'menu'));
    raise exception 'RN-MEN-13 FALLIDO: suspendido por impago se ha publicado' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%detenido por impago%' then raise; end if;
  end;
end $$;
reset role;

do $$
begin
  perform set_config('cuotly.status_change', 'on', true);
  update public.establishments set status = 'active' where id = 'dd400000-0000-0000-0000-000000000001';
  perform set_config('cuotly.status_change', 'off', true);
end $$;

-- ============================================================
-- El equipo: pedir información, contestar, listo, publicado
-- ============================================================

-- Luis (web, no asignado) no toca la publicación.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  begin
    perform public.request_menu_information((select v from md_ids where k = 'menu'), '¿Con o sin gluten?');
    raise exception 'RN-MEN-06 FALLIDO: un trabajador no asignado actúa sobre la publicación' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el trabajador asignado%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_menu uuid := (select v from md_ids where k = 'menu');
begin
  begin
    perform public.request_menu_information(v_menu, '   ');
    raise exception 'RN-MEN-06 FALLIDO: se pidió información sin decir cuál' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Di qué información falta%' then raise; end if;
  end;

  perform public.request_menu_information(v_menu, '¿El flan es casero?');
  perform public.request_menu_information(v_menu, '¿El flan es casero?'); -- CA-17
  if (select state from public.menus where id = v_menu) <> 'needs_information' then
    raise exception 'RN-MEN-09 FALLIDO: pedir información no deja el menú en needs_information' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El restaurante recibe el aviso (y el equipo no), y contesta guardando.
do $$
begin
  if (select count(*) from public.notifications where event_type = 'menu_needs_information' and audience = 'client'
        and recipient_id in ('dd000000-0000-0000-0000-000000000005', 'dd000000-0000-0000-0000-000000000006', 'dd000000-0000-0000-0000-000000000007')) <> 3
     or exists (select 1 from public.notifications where event_type = 'menu_needs_information' and audience = 'staff') then
    raise exception '§18 FALLIDO: menu_needs_information no llegó a los tres del restaurante y solo a ellos' using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
declare v_menu uuid := (select v from md_ids where k = 'menu'); v_v3 uuid;
begin
  v_v3 := public.save_menu_version(v_menu, array['Ensalada', 'Sopa'], array['Merluza', 'Pollo'], array['Flan casero'], 'Vino o agua', 1450, 'Pan incluido');
  insert into md_ids values ('v3', v_v3);
  if (select state from public.menus where id = v_menu) <> 'reviewing' then
    raise exception 'RN-MEN-09 FALLIDO: guardar una versión mientras falta información no pasa a revisando' using errcode = 'assert_failure';
  end if;
  perform public.provide_menu_information(v_menu, 'Sí'); -- ya contestado: no hace nada
  if (select count(*) from public.menu_events where menu_id = v_menu and to_state = 'reviewing') <> 1 then
    raise exception 'CA-17 FALLIDO: contestar dos veces dejó dos eventos' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Ana: listo, error de publicación (avisa al equipo) y, al final, publicado.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  v_menu uuid := (select v from md_ids where k = 'menu');
  v_pub uuid := (select v from md_ids where k = 'pub');
  v_audit jsonb;
begin
  perform public.mark_menu_ready_to_publish(v_menu);
  if (select state from public.menus where id = v_menu) <> 'ready_to_publish' then
    raise exception 'RN-MEN-09 FALLIDO: listo para publicar' using errcode = 'assert_failure';
  end if;

  perform public.report_menu_publication_error(v_menu, 'LandingSite no responde');
  if (select state from public.menus where id = v_menu) <> 'publication_error' then
    raise exception 'RN-MEN-09 FALLIDO: error de publicación' using errcode = 'assert_failure';
  end if;

  perform public.mark_menu_published(v_menu);
  perform public.mark_menu_published(v_menu); -- CA-17 / RN-CON-07

  if (select state from public.menus where id = v_menu) <> 'published'
     or (select published_version_id from public.menus where id = v_menu) <> (select v from md_ids where k = 'v3')
     or (select published_template_id from public.menus where id = v_menu) <> (select v from md_ids where k = 'tpl')
     or (select published_at from public.menus where id = v_menu) is null then
    raise exception 'RN-MEN-06 FALLIDO: publicado sin fecha, versión vigente o plantilla' using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.menu_events where menu_id = v_menu and to_state = 'published') <> 1 then
    raise exception 'CA-17 FALLIDO: dos pulsaciones de Marcar como publicado dejaron dos eventos' using errcode = 'assert_failure';
  end if;

  -- El trabajador ve la publicación (es suya) con quién publicó.
  if (select published_by from public.menu_publications where id = v_pub) <> 'dd000000-0000-0000-0000-000000000003' then
    raise exception 'RN-MEN-06 FALLIDO: la publicación no registra al usuario que publicó' using errcode = 'assert_failure';
  end if;

  -- §61: fecha, usuario, versión, plantilla y consumo en la auditoría.
  select new_value into v_audit from public.audit_log where action = 'menu.published' and entity_id = v_menu;
  if v_audit->>'version_id' is null or v_audit->>'template_id' is null or v_audit->>'entry_id' is null or v_audit->>'published_at' is null then
    raise exception 'RN-MEN-06 FALLIDO: el apunte de publicación no lleva versión, plantilla, consumo y fecha: %', v_audit using errcode = 'assert_failure';
  end if;

  -- Sin botón Comenzar: ningún evento "en curso".
  if exists (select 1 from public.menu_events where menu_id = v_menu and to_state = 'in_progress') then
    raise exception 'RN-MEN-06 FALLIDO: Menú Diario no tiene Comenzar' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Avisos: error → equipo; publicado → restaurante Y equipo. Ni Luis ni Marta.
do $$
begin
  if (select count(*) from public.notifications where event_type = 'menu_publication_error' and audience = 'staff'
        and recipient_id in ('dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002')) <> 2
     or exists (select 1 from public.notifications where event_type = 'menu_publication_error' and audience = 'client') then
    raise exception '§18 FALLIDO: menu_publication_error debía llegar al propietario y al administrador, y a nadie más' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.notifications where event_type = 'menu_published' and audience = 'client') <> 3
     or (select count(*) from public.notifications where event_type = 'menu_published' and audience = 'staff') <> 2
     or exists (select 1 from public.notifications where event_type = 'menu_published'
                and recipient_id in ('dd000000-0000-0000-0000-000000000004', 'dd000000-0000-0000-0000-000000000009')) then
    raise exception '§18 FALLIDO: menu_published debía llegar a los tres del restaurante y a propietario y administrador' using errcode = 'assert_failure';
  end if;
  -- Correo en cola para el restaurante (§18: la publicación sí sale por correo).
  if not exists (select 1 from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
                 where n.event_type = 'menu_published' and n.audience = 'client' and d.channel = 'email') then
    raise exception '§18 FALLIDO: la publicación no encoló correo al restaurante' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Después de Publicado: no se cancela, no se edita, se copia; y el equipo
-- puede devolver el consumo con motivo, una sola vez.
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_menu uuid := (select v from md_ids where k = 'menu'); v_copy uuid;
begin
  begin
    perform public.cancel_menu(v_menu, 'Me arrepiento');
    raise exception 'RN-MEN-05 FALLIDO: se canceló un menú publicado' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no se cancela%' then raise; end if;
  end;
  begin
    perform public.save_menu_version(v_menu, array['X'], array['Y'], array['Z'], null, null, null);
    raise exception 'RN-MEN-03 FALLIDO: se editó un menú publicado' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no se edita%' then raise; end if;
  end;

  v_copy := public.copy_menu(v_menu, current_date + 8);
  if (select state from public.menus where id = v_copy) <> 'draft'
     or (select desserts from public.menu_versions v join public.menus m on m.current_version_id = v.id where m.id = v_copy) <> array['Flan casero']
     or (select version from public.menu_versions v join public.menus m on m.current_version_id = v.id where m.id = v_copy) <> 1 then
    raise exception 'RN-MEN-03 FALLIDO: copiar no crea un borrador con el contenido vigente como versión 1' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.refund_menu_update((select v from md_ids where k = 'pub'), 'Error nuestro');
    raise exception 'RN-CON-04 FALLIDO: un trabajador devolvió una actualización' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el propietario o un administrador%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_pub uuid := (select v from md_ids where k = 'pub'); v_e1 uuid; v_e2 uuid;
begin
  begin
    perform public.refund_menu_update(v_pub, '');
    raise exception 'RN-CON-12 FALLIDO: devolución sin motivo' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%necesita un motivo%' then raise; end if;
  end;
  v_e1 := public.refund_menu_update(v_pub, 'Publicamos la versión equivocada');
  v_e2 := public.refund_menu_update(v_pub, 'Publicamos la versión equivocada');
  if v_e1 <> v_e2 then
    raise exception 'CA-17 FALLIDO: devolver dos veces creó dos créditos' using errcode = 'assert_failure';
  end if;
  if (select entry_type from public.menu_update_entries where id = v_e1) <> 'return'
     or (select related_entry_id from public.menu_update_entries where id = v_e1) is null
     or (select available from public.menu_update_balance('dd400000-0000-0000-0000-000000000001')) <> 1 then
    raise exception 'RN-CON-12 FALLIDO: la devolución no enlaza con el débito o no cuenta en el saldo' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-CON-10 · Un consumo de un ciclo ya cerrado se devuelve como crédito
-- compensatorio en el ciclo vigente. Se fabrica el ciclo viejo a mano:
-- no hay forma de esperar un mes en un test.
-- ============================================================
do $$
declare
  v_old_cycle uuid; v_old_entry uuid; v_old_pub uuid; v_old_menu uuid; v_ver uuid;
begin
  insert into public.menu_update_cycles (id, space_id, establishment_id, subscription_id, cycle_start, cycle_end, included_updates)
  values ('dd700000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000001', 'dd400000-0000-0000-0000-000000000001',
          'dd600000-0000-0000-0000-000000000001', now() - interval '3 months', now() - interval '2 months', 2)
  returning id into v_old_cycle;

  insert into public.menus (id, space_id, establishment_id, name, kind, target_date, state, created_by)
  values ('dd800000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000001', 'dd400000-0000-0000-0000-000000000001',
          'Viejo', 'daily', current_date - 70, 'published', 'dd000000-0000-0000-0000-000000000005')
  returning id into v_old_menu;
  insert into public.menu_versions (space_id, menu_id, version, starters, mains, desserts, created_by)
  values ('dd100000-0000-0000-0000-000000000001', v_old_menu, 1, '{}', '{}', '{}', 'dd000000-0000-0000-0000-000000000005')
  returning id into v_ver;
  update public.menus set current_version_id = v_ver where id = v_old_menu;

  insert into public.menu_update_entries (space_id, establishment_id, cycle_id, amount, entry_type, menu_id, created_by)
  values ('dd100000-0000-0000-0000-000000000001', 'dd400000-0000-0000-0000-000000000001', v_old_cycle, -1, 'debit', v_old_menu,
          'dd000000-0000-0000-0000-000000000005')
  returning id into v_old_entry;

  insert into public.menu_publications (id, space_id, establishment_id, menu_id, requested_by, requested_at, requested_version_id,
                                        cycle_id, debit_entry_id, requested_before_cutoff, published_at, published_by)
  values ('dd900000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000001', 'dd400000-0000-0000-0000-000000000001',
          v_old_menu, 'dd000000-0000-0000-0000-000000000005', now() - interval '70 days', v_ver, v_old_cycle, v_old_entry, true,
          now() - interval '69 days', 'dd000000-0000-0000-0000-000000000003');
end $$;

select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_e uuid; v_bal record;
begin
  v_e := public.refund_menu_update('dd900000-0000-0000-0000-000000000001', 'Nos equivocamos hace dos meses');
  if (select entry_type from public.menu_update_entries where id = v_e) <> 'compensatory_credit'
     or (select cycle_id from public.menu_update_entries where id = v_e) = 'dd700000-0000-0000-0000-000000000001' then
    raise exception 'RN-CON-10 FALLIDO: la devolución revivió el ciclo cerrado en vez de crear un crédito compensatorio en el vigente' using errcode = 'assert_failure';
  end if;
  select * into v_bal from public.menu_update_balance('dd400000-0000-0000-0000-000000000001');
  if v_bal.available <> 2 then
    raise exception 'RN-CON-11 FALLIDO: el crédito compensatorio no cuenta en el ciclo vigente (available=%)', v_bal.available using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ASG-04 · Con dos candidatos, pendiente de asignación y aviso al
-- equipo; asignar a mano solo a quien puede; reasignar avisa otra vez.
-- ============================================================
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000009', 'dd400000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
declare v_m uuid;
begin
  v_m := public.create_menu('dd400000-0000-0000-0000-000000000001', 'Con dos candidatas', 'groups', current_date + 12, (select v from md_ids where k = 'tpl'));
  perform public.save_menu_version(v_m, array['A'], array['B'], array['C'], null, 2000, null);
  perform public.prepare_menu(v_m);
  perform public.request_menu_publication(v_m, 'clave-dos');
  insert into md_ids values ('m4', v_m);
  if (select state from public.menus where id = v_m) <> 'pending_assignment' then
    raise exception 'RN-ASG-04 FALLIDO: con dos candidatas debía quedar pendiente, está %', (select state from public.menus where id = v_m) using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
begin
  if (select count(*) from public.notifications n where n.event_type = 'menu_publication_requested'
        and n.entity_id = (select v from md_ids where k = 'm4')
        and n.recipient_id in ('dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002')) <> 2 then
    raise exception '§18 FALLIDO: sin asignar debía avisar al propietario y al administrador' using errcode = 'assert_failure';
  end if;
end $$;

-- Ana no asigna (no tiene assign_jobs); el administrador sí, y no a Luis.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.assign_menu_publication((select v from md_ids where k = 'm4'), 'dd000000-0000-0000-0000-000000000003');
    raise exception 'RN-ASG FALLIDO: una trabajadora se asignó a sí misma' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_m uuid := (select v from md_ids where k = 'm4');
begin
  begin
    perform public.assign_menu_publication(v_m, 'dd000000-0000-0000-0000-000000000004');
    raise exception 'RN-ASG-01 FALLIDO: se asignó a alguien sin la especialidad Menú Diario' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no puede publicar menús%' then raise; end if;
  end;

  perform public.assign_menu_publication(v_m, 'dd000000-0000-0000-0000-000000000009');
  perform public.assign_menu_publication(v_m, 'dd000000-0000-0000-0000-000000000009'); -- CA-17
  if (select state from public.menus where id = v_m) <> 'assigned' then
    raise exception 'RN-ASG FALLIDO: asignar a mano no deja el menú asignado' using errcode = 'assert_failure';
  end if;

  -- Reasignar a Ana: evento de auditoría de reasignación y aviso a Ana.
  perform public.assign_menu_publication(v_m, 'dd000000-0000-0000-0000-000000000003', 'Marta está desbordada');
  if (select count(*) from public.audit_log where action = 'menu.reassigned' and entity_id = v_m) <> 1 then
    raise exception 'CLAUDE.md MUST FALLIDO: la reasignación no dejó su apunte' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
begin
  if (select count(*) from public.notifications where event_type = 'menu_assigned' and entity_id = (select v from md_ids where k = 'm4')
        and recipient_id in ('dd000000-0000-0000-0000-000000000009', 'dd000000-0000-0000-0000-000000000003')) <> 2 then
    raise exception '§18 FALLIDO: cada asignación avisa a su trabajadora (una a Marta, otra a Ana)' using errcode = 'assert_failure';
  end if;
end $$;

-- Marta, ya no asignada, no puede publicar; Ana sí.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000009', false);
set role authenticated;
do $$
begin
  begin
    perform public.mark_menu_published((select v from md_ids where k = 'm4'));
    raise exception 'RN-MEN-06 FALLIDO: la trabajadora reasignada aún puede publicar' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el trabajador asignado%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- El trabajador autorizado lee los menús del restaurante; el que no lo
-- está, no. El equipo lee todo lo que el cliente no (P7 al revés no aplica).
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.menus where establishment_id = 'dd400000-0000-0000-0000-000000000001') = 0 then
    raise exception '§4.2 FALLIDO: un trabajador autorizado en el restaurante no lee sus menús' using errcode = 'assert_failure';
  end if;
  -- Y las publicaciones ajenas, no: no gestiona ni está asignado.
  if (select count(*) from public.menu_publications) <> 0 then
    raise exception 'P7 FALLIDO: un trabajador no asignado lee publicaciones de otros' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- Las internas están cerradas por RPC (CLAUDE.md MUST).
-- ============================================================
do $$
declare v_fn text; v_abiertas text := '';
begin
  foreach v_fn in array array[
    'establishment_daily_menu_subscription(uuid)',
    'menu_update_cycle_window(uuid, timestamptz)',
    'get_or_create_menu_update_cycle(uuid)',
    'record_menu_event(uuid, uuid, text, text, text)',
    'notify_menu_event(uuid, text)',
    'menu_candidate_ids(uuid)',
    'lock_active_menu_publication(uuid)',
    'assert_can_write_menu_publication(public.menus, public.menu_publications)',
    'credit_menu_update(public.menu_publications, text)',
    'menu_cutoff_at(date, uuid)',
    'menu_publish_by_at(date, uuid)'
  ] loop
    if has_function_privilege('authenticated', 'public.' || v_fn, 'execute')
       or has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      v_abiertas := v_abiertas || ' ' || v_fn;
    end if;
  end loop;
  if v_abiertas <> '' then
    raise exception 'CLAUDE.md MUST FALLIDO: funciones internas de Menú Diario abiertas por RPC:%', v_abiertas using errcode = 'assert_failure';
  end if;

  -- Y ninguna tabla nueva admite escritura directa: sin políticas de
  -- INSERT/UPDATE/DELETE, todo pasa por funciones que auditan.
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname in ('menus', 'menu_versions', 'menu_publications', 'menu_events', 'menu_templates',
                        'menu_update_cycles', 'menu_update_entries')
      and p.polcmd <> 'r'
  ) then
    raise exception 'CLAUDE.md MUST FALLIDO: una tabla de Menú Diario admite escritura directa por RLS' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza
-- ============================================================
drop table md_ids;
delete from public.audit_log where space_id in ('dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000002');
delete from public.spaces where id in ('dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000002');
delete from auth.users where id in (
  'dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002',
  'dd000000-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-000000000004',
  'dd000000-0000-0000-0000-000000000005', 'dd000000-0000-0000-0000-000000000006',
  'dd000000-0000-0000-0000-000000000007', 'dd000000-0000-0000-0000-000000000008',
  'dd000000-0000-0000-0000-000000000009'
);

select 'menu_diario_menus_y_actualizaciones: OK' as resultado;
