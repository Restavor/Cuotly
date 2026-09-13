-- Menú Diario · el diseño de las plantillas y las descargas (Fase 2,
-- Hito 10; migración 78; RN-MEN-04, RN-MEN-10, RN-MEN-11, §61 paso 4).
--
--   · Diseñar una plantilla es del equipo (manage_clients); un color que
--     no es hexadecimal y una disposición desconocida se rechazan; una
--     archivada no se rediseña; queda apunte con valor anterior y nuevo.
--   · Descargar exige contenido y plantilla, registra versión, plantilla
--     y formato, y NO escribe en el libro de actualizaciones (RN-MEN-04).
--   · La descarga del trabajador ASIGNADO pasa el menú a "Listo para
--     publicar"; la del restaurante, la de otro trabajador y la del
--     administrador, no. Desde otro estado, tampoco.
--   · P7: el restaurante lee sus descargas sin `downloaded_by`; otro
--     espacio no lee nada.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/menu_diario_descargas_y_plantillas.sql

insert into auth.users (id, email, role, aud) values
  ('de000000-0000-0000-0000-000000000001', 'dl-owner@example.com', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000002', 'dl-admin@example.com', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000003', 'dl-ana@example.com', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000004', 'dl-luis@example.com', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000005', 'dl-local@example.com', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000008', 'dl-otro@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('de100000-0000-0000-0000-000000000001', 'Espacio Descargas', 'espacio-descargas-test', 'Europe/Madrid',
   'de000000-0000-0000-0000-000000000001'),
  ('de100000-0000-0000-0000-000000000002', 'Espacio Ajeno D', 'espacio-ajeno-descargas-test', 'Europe/Madrid',
   'de000000-0000-0000-0000-000000000008');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('de100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('de100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('de100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('de100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000004', 'worker', 'active'),
  ('de100000-0000-0000-0000-000000000002', 'de000000-0000-0000-0000-000000000008', 'owner', 'active');

insert into public.services (id, space_id, name, price_cents, kind, included_updates) values
  ('de250000-0000-0000-0000-000000000001', 'de100000-0000-0000-0000-000000000001', 'Menú Diario', 22900, 'daily_menu', 30);

insert into public.groups (id, space_id, name) values
  ('de300000-0000-0000-0000-000000000001', 'de100000-0000-0000-0000-000000000001', 'Grupo D');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('de400000-0000-0000-0000-000000000001', 'de100000-0000-0000-0000-000000000001',
   'de300000-0000-0000-0000-000000000001', 'DES-0001', 'Casa Descarga', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('de400000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000005', 'local_owner');

insert into public.subscriptions (id, space_id, establishment_id, kind, service_id, status, started_at, created_by) values
  ('de600000-0000-0000-0000-000000000001', 'de100000-0000-0000-0000-000000000001',
   'de400000-0000-0000-0000-000000000001', 'service', 'de250000-0000-0000-0000-000000000001', 'active',
   now() - interval '3 days', 'de000000-0000-0000-0000-000000000002');

-- Ana y Luis, las dos de Menú Diario y autorizadas: dos candidatas, así
-- que la publicación queda pendiente y se asigna a mano.
insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('de100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000003', 'daily_menu', 'de000000-0000-0000-0000-000000000001'),
  ('de100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000004', 'daily_menu', 'de000000-0000-0000-0000-000000000001');
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('de100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000003', 'de400000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001'),
  ('de100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000004', 'de400000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001');

-- ============================================================
-- RN-MEN-11 · Diseñar la plantilla: el equipo, con valores válidos
-- ============================================================
select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000002', false);
set role authenticated;
-- Se crea como `authenticated` para que todas las sesiones del test la escriban.
create temp table dl_ids (k text primary key, v uuid);
do $$
declare v_t uuid; v_t2 uuid; v_row record;
begin
  v_t := public.create_menu_template('de400000-0000-0000-0000-000000000001', 'Clásica');
  v_t2 := public.create_menu_template('de400000-0000-0000-0000-000000000001', 'Vieja');
  insert into dl_ids values ('tpl', v_t), ('tpl2', v_t2);

  -- Por omisión ya se puede pintar: disposición y tres colores.
  select layout, background_color, accent_color, show_prices into v_row from public.menu_templates where id = v_t;
  if v_row.layout <> 'classic' or v_row.background_color <> '#FFFFFF' or not v_row.show_prices then
    raise exception 'FALLIDO: una plantilla nueva no nace con un diseño por omisión' using errcode = 'assert_failure';
  end if;

  begin
    perform public.update_menu_template_design(v_t, 'pizarra', '#FFFFFF', '#000000', '#145C4E');
    raise exception 'FALLIDO: se admitió una disposición desconocida' using errcode = 'assert_failure';
  exception when check_violation then null;
  end;
  begin
    perform public.update_menu_template_design(v_t, 'board', 'blanco', '#000000', '#145C4E');
    raise exception 'FALLIDO: se admitió un color que no es hexadecimal' using errcode = 'assert_failure';
  exception when check_violation then null;
  end;

  perform public.update_menu_template_design(v_t, 'board', '#0b2f2a', '#ffffff', '#d89524', 'Casa Descarga · Menú del día', 'IVA incluido', true);
  select layout, background_color, heading_text into v_row from public.menu_templates where id = v_t;
  if v_row.layout <> 'board' or v_row.background_color <> '#0B2F2A' or v_row.heading_text <> 'Casa Descarga · Menú del día' then
    raise exception 'FALLIDO: el diseño no se guardó (o no se normalizó a mayúsculas)' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where action = 'menu_template.design_updated' and entity_id = v_t
        and old_value->>'layout' = 'classic' and new_value->>'layout' = 'board') <> 1 then
    raise exception 'CLAUDE.md MUST FALLIDO: el rediseño no dejó apunte con valor anterior y nuevo' using errcode = 'assert_failure';
  end if;

  perform public.archive_menu_template(v_t2, 'No se usa');
  begin
    perform public.update_menu_template_design(v_t2, 'elegant', '#FFFFFF', '#000000', '#145C4E');
    raise exception 'FALLIDO: se rediseñó una plantilla archivada' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%archivada no se rediseña%' then raise; end if;
  end;
end $$;
reset role;

-- El restaurante no diseña.
select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  begin
    perform public.update_menu_template_design((select v from dl_ids where k = 'tpl'), 'elegant', '#FFFFFF', '#000000', '#145C4E');
    raise exception 'RN-MEN-11 FALLIDO: el restaurante rediseñó una plantilla' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
  -- Pero sí lee el diseño (lo necesita para previsualizar), y no quién lo hizo.
  if (select layout from public.menu_templates where id = (select v from dl_ids where k = 'tpl')) <> 'board' then
    raise exception 'FALLIDO: el restaurante no lee el diseño de su plantilla' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MEN-04 / RN-MEN-10 · La descarga del restaurante: se registra, no consume
-- ============================================================
do $$
declare v_m uuid; v_v uuid; v_d uuid; v_d2 uuid; v_row record;
begin
  v_m := public.create_menu('de400000-0000-0000-0000-000000000001', 'Menú', 'daily', current_date + 5);
  insert into dl_ids values ('menu', v_m);

  begin
    perform public.register_menu_download(v_m, 'png');
    raise exception 'FALLIDO: se descargó un menú sin contenido' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no tiene contenido%' then raise; end if;
  end;

  v_v := public.save_menu_version(v_m, array['Ensalada'], array['Merluza'], array['Flan'], 'Agua', 1450, null);
  begin
    perform public.register_menu_download(v_m, 'png');
    raise exception 'FALLIDO: se descargó un menú sin plantilla' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%necesita una plantilla%' then raise; end if;
  end;

  perform public.update_menu_details(v_m, 'Menú', 'daily', current_date + 5, (select v from dl_ids where k = 'tpl'));
  begin
    perform public.register_menu_download(v_m, 'jpg');
    raise exception 'FALLIDO: se admitió un formato desconocido' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Formato desconocido%' then raise; end if;
  end;

  v_d := public.register_menu_download(v_m, 'png');
  v_d2 := public.register_menu_download(v_m, 'pdf');
  select version_id, template_id, format, by_team into v_row from public.menu_downloads where id = v_d;
  if v_row.version_id <> v_v or v_row.template_id <> (select v from dl_ids where k = 'tpl') or v_row.format <> 'png' or v_row.by_team then
    raise exception 'RN-MEN-10 FALLIDO: la descarga no registra versión, plantilla y formato exactos' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.menu_downloads where menu_id = v_m) <> 2 then
    raise exception 'RN-MEN-10 FALLIDO: dos descargas, dos filas' using errcode = 'assert_failure';
  end if;

  -- RN-MEN-04: ni un apunte, ni ciclo creado, y el menú sigue en borrador.
  if exists (select 1 from public.menu_update_entries where menu_id = v_m)
     or exists (select 1 from public.menu_update_cycles where establishment_id = 'de400000-0000-0000-0000-000000000001')
     or (select available from public.menu_update_balance('de400000-0000-0000-0000-000000000001')) <> 30 then
    raise exception 'RN-MEN-04 FALLIDO: descargar consumió una actualización' using errcode = 'assert_failure';
  end if;
  if (select state from public.menus where id = v_m) <> 'draft' then
    raise exception 'FALLIDO: la descarga del restaurante cambió el estado' using errcode = 'assert_failure';
  end if;

  -- P7: sin downloaded_by.
  begin
    perform (select downloaded_by from public.menu_downloads limit 1);
    raise exception 'P7 FALLIDO: el restaurante lee menu_downloads.downloaded_by' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;

  -- Y lo manda a publicar: con dos candidatas, pendiente.
  perform public.prepare_menu(v_m);
  perform public.request_menu_publication(v_m, 'dl-1');
  if (select state from public.menus where id = v_m) <> 'pending_assignment' then
    raise exception 'FALLIDO: con dos candidatas debía quedar pendiente' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El administrador asigna a Ana. Su propia descarga (no asignada) no
-- cambia el estado; la de Luis (no asignado) tampoco; la de Ana sí.
select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_m uuid := (select v from dl_ids where k = 'menu');
begin
  perform public.assign_menu_publication(v_m, 'de000000-0000-0000-0000-000000000003');
  perform public.register_menu_download(v_m, 'pdf');
  if (select state from public.menus where id = v_m) <> 'assigned' then
    raise exception '§61 FALLIDO: la descarga del administrador (no asignado) cambió el estado' using errcode = 'assert_failure';
  end if;
  if not (select by_team from public.menu_downloads where menu_id = v_m order by downloaded_at desc limit 1) then
    raise exception 'FALLIDO: la descarga del equipo no queda marcada como del equipo' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_m uuid := (select v from dl_ids where k = 'menu');
begin
  perform public.register_menu_download(v_m, 'png');
  if (select state from public.menus where id = v_m) <> 'assigned' then
    raise exception '§61 FALLIDO: la descarga de un trabajador no asignado cambió el estado' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_m uuid := (select v from dl_ids where k = 'menu');
begin
  perform public.register_menu_download(v_m, 'png');
  if (select state from public.menus where id = v_m) <> 'ready_to_publish' then
    raise exception '§61 FALLIDO: la descarga de la trabajadora asignada no pasó el menú a listo para publicar' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.menu_events where menu_id = v_m and to_state = 'ready_to_publish') <> 1 then
    raise exception 'RN-MEN-10 FALLIDO: la descarga no dejó el evento' using errcode = 'assert_failure';
  end if;
  -- Otra descarga desde "listo" no duplica el evento.
  perform public.register_menu_download(v_m, 'pdf');
  if (select count(*) from public.menu_events where menu_id = v_m and to_state = 'ready_to_publish') <> 1 then
    raise exception 'CA-17 FALLIDO: dos descargas, dos eventos de listo para publicar' using errcode = 'assert_failure';
  end if;
  -- Y sigue sin consumir nada más que la actualización de la petición.
  if (select available from public.menu_update_balance('de400000-0000-0000-0000-000000000001')) <> 29 then
    raise exception 'RN-MEN-04 FALLIDO: las descargas del equipo consumieron' using errcode = 'assert_failure';
  end if;

end $$;
reset role;

-- ============================================================
-- CLAUDE.md MUST · el EVENTO no es el APUNTE
-- ============================================================
--
-- Lo de arriba comprueba `menu_events`: qué le pasó al menú. Esto
-- comprueba `audit_log`: QUIÉN lo hizo, que es otra cosa y es lo que lee
-- la pestaña Historial. Estaba sin vigilar, y no en teoría: la revisión
-- del 13/09/2026 borró los dos `insert into public.audit_log` de
-- `register_menu_download()` —uno cada vez— y la suite siguió en verde
-- las dos veces.
--
-- Va sentado como la PROPIETARIA y no como Ana: `audit_log` tiene RLS
-- (§21.2) y una trabajadora no ve los apuntes de sus compañeros, así que
-- desde su sesión el recuento saldría filtrado y este test fallaría por
-- un motivo que no es el suyo.
select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_m uuid := (select v from dl_ids where k = 'menu');
begin
  if (select count(*) from public.audit_log
      where entity_type = 'menu' and entity_id = v_m
        and action = 'menu.ready_to_publish'
        and new_value ->> 'via' = 'download') <> 1 then
    raise exception 'CLAUDE.md MUST FALLIDO: el paso a listo por descarga no dejó su apunte de auditoría (o lo dejó dos veces)'
      using errcode = 'assert_failure';
  end if;

  -- Un apunte por descarga. Se compara contra las filas registradas y no
  -- contra un número escrito a mano, que habría que corregir cada vez que
  -- la suite añade una descarga.
  if (select count(*) from public.audit_log
      where entity_type = 'menu' and entity_id = v_m and action = 'menu.downloaded')
     <> (select count(*) from public.menu_downloads where menu_id = v_m) then
    raise exception 'RN-MEN-10 FALLIDO: hay % descargas registradas y % apuntes de auditoría',
      (select count(*) from public.menu_downloads where menu_id = v_m),
      (select count(*) from public.audit_log where entity_type = 'menu' and entity_id = v_m and action = 'menu.downloaded')
      using errcode = 'assert_failure';
  end if;

  -- Y cada apunte nombra su fila, su versión y su plantilla: sin eso solo
  -- diría "alguien descargó algo".
  if exists (
    select 1 from public.audit_log a
    where a.entity_type = 'menu' and a.entity_id = v_m and a.action = 'menu.downloaded'
      and not exists (
        select 1 from public.menu_downloads d
        where d.id = (a.new_value ->> 'download_id')::uuid
          and (a.new_value ->> 'version_id')::uuid = d.version_id
          and (a.new_value ->> 'template_id')::uuid = d.template_id
          and (a.new_value ->> 'format') = d.format
      )
  ) then
    raise exception 'RN-MEN-10 FALLIDO: algún apunte de descarga no apunta a su fila, su versión y su plantilla'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Otro espacio no lee ninguna descarga ni ninguna plantilla.
select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000008', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.menu_downloads) <> 0 or (select count(*) from public.menu_templates) <> 0 then
    raise exception 'CA-02 FALLIDO: otro espacio lee descargas o plantillas ajenas' using errcode = 'assert_failure';
  end if;
  begin
    perform public.register_menu_download((select v from dl_ids where k = 'menu'), 'png');
    raise exception 'CA-02 FALLIDO: otro espacio descargó un menú ajeno' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Menú no encontrado%' then raise; end if;
  end;
end $$;
reset role;

-- Sin escritura directa en la tabla nueva.
do $$
begin
  if exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname = 'menu_downloads' and p.polcmd <> 'r') then
    raise exception 'CLAUDE.md MUST FALLIDO: menu_downloads admite escritura directa' using errcode = 'assert_failure';
  end if;
end $$;

drop table dl_ids;
delete from public.audit_log where space_id in ('de100000-0000-0000-0000-000000000001', 'de100000-0000-0000-0000-000000000002');
delete from public.spaces where id in ('de100000-0000-0000-0000-000000000001', 'de100000-0000-0000-0000-000000000002');
delete from auth.users where id in (
  'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000002',
  'de000000-0000-0000-0000-000000000003', 'de000000-0000-0000-0000-000000000004',
  'de000000-0000-0000-0000-000000000005', 'de000000-0000-0000-0000-000000000008'
);

select 'menu_diario_descargas_y_plantillas: OK' as resultado;
