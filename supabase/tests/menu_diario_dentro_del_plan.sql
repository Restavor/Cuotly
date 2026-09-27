-- ============================================================
-- Suite 86 · Menú Diario dentro del plan
--            (migración 152; decisiones 85 y 86; PRD RN-CRE-21 a 24 y 30)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-CRE-21 · un plan que incluye Menú Diario lo da sin contratar el
--     servicio; `establishment_daily_menu_access()` dice de dónde le viene;
--     no se contrata suelto a quien lo tiene en su plan; quitarlo del plan
--     perjudica y ponerlo favorece (RN-COM-23).
--   · RN-CRE-22 · pedir la publicación no consume; un menú del día por
--     fecha y los otros tipos sin límite.
--   · RN-CRE-30 · el menú del día publicado se cambia editándolo: vuelve a
--     borrador, la web sigue con lo publicado, y al volver a publicarlo lo
--     sustituye. Los otros tipos publicados no se editan.
--   · RN-CRE-23 · una plantilla incluida para publicar y otra para
--     imprimir; una activa de cada; el menú toma la de publicar; el papel
--     sale en la de imprimir; sin plantilla para publicar no se prepara.
--   · RN-CRE-24 · ni barrido ni corrección mínima del restaurante.
--   · CLAUDE.md · privilegios de lo nuevo.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/menu_diario_dentro_del_plan.sql
--
-- Prefijo de esta suite: f1520000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1520000-0000-0000-0000-000000000001', 'duena-mdp@cuotly.test', 'authenticated', 'authenticated'),
  ('f1520000-0000-0000-0000-000000000002', 'cliente-mdp@cuotly.test', 'authenticated', 'authenticated'),
  ('f1520000-0000-0000-0000-000000000003', 'ana-mdp@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1520000-0000-0000-0000-000000000001', 'duena-mdp@cuotly.test', 'Dueña Menú'),
  ('f1520000-0000-0000-0000-000000000002', 'cliente-mdp@cuotly.test', 'Cliente Menú'),
  ('f1520000-0000-0000-0000-000000000003', 'ana-mdp@cuotly.test', 'Ana Menú')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1521000-0000-0000-0000-000000000001', 'Espacio Menú Plan', 'espacio-menu-plan', 'Europe/Madrid',
   'f1520000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1521000-0000-0000-0000-000000000001', 'f1520000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('f1521000-0000-0000-0000-000000000001', 'f1520000-0000-0000-0000-000000000003', 'worker', 'active');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium,
                          included_large, start_sla_hours, included_credits_half, includes_daily_menu) values
  ('f1522000-0000-0000-0000-000000000001', 'f1521000-0000-0000-0000-000000000001', 'Con menú', 9900,
   0, 0, 0, 0, 24, 40, true),
  ('f1522000-0000-0000-0000-000000000002', 'f1521000-0000-0000-0000-000000000001', 'Sin menú', 2000,
   0, 0, 0, 0, 48, 0, false);

insert into public.services (id, space_id, name, price_cents, kind, included_updates) values
  ('f1522500-0000-0000-0000-000000000001', 'f1521000-0000-0000-0000-000000000001', 'Menú Diario', 19900, 'daily_menu', 30);

insert into public.groups (id, space_id, name) values
  ('f1523000-0000-0000-0000-000000000001', 'f1521000-0000-0000-0000-000000000001', 'Grupo Menú Plan');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1524000-0000-0000-0000-000000000001', 'f1521000-0000-0000-0000-000000000001',
   'f1523000-0000-0000-0000-000000000001', 'EST-MDP-1', 'Casa con menú', 'active'),
  ('f1524000-0000-0000-0000-000000000002', 'f1521000-0000-0000-0000-000000000001',
   'f1523000-0000-0000-0000-000000000001', 'EST-MDP-2', 'Casa sin menú', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f1524000-0000-0000-0000-000000000001', 'f1520000-0000-0000-0000-000000000002', 'local_owner');

-- Ana publica menús y está autorizada: con una sola candidata se asigna sola.
insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('f1521000-0000-0000-0000-000000000001', 'f1520000-0000-0000-0000-000000000003', 'daily_menu',
   'f1520000-0000-0000-0000-000000000001');
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('f1521000-0000-0000-0000-000000000001', 'f1520000-0000-0000-0000-000000000003',
   'f1524000-0000-0000-0000-000000000001', 'f1520000-0000-0000-0000-000000000001');

create temp table mdp_ids (k text primary key, v uuid);
grant select, insert, update on mdp_ids to authenticated;

-- ============================================================
-- CLAUDE.md · privilegios
-- ============================================================
do $$
declare v_fn text;
begin
  if has_function_privilege('anon', 'public.establishment_daily_menu_access(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.establishment_daily_menu_access(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: establishment_daily_menu_access mal abierta' using errcode = 'assert_failure';
  end if;
  foreach v_fn in array array[
    'public.assert_one_daily_menu_internal(uuid, text, date, uuid)',
    'public.establishment_publish_template_internal(uuid)',
    'public.establishment_daily_menu_subscription(uuid)'
  ] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: % abierta por RPC', v_fn using errcode = 'assert_failure';
    end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.menu_templates', 'purpose', 'select') then
    raise exception 'RN-CRE-23 FALLIDO: el restaurante no lee para qué es su plantilla' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-21 · Menú Diario incluido en el plan
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1520000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.create_plan_subscription('f1524000-0000-0000-0000-000000000001', 'f1522000-0000-0000-0000-000000000001');
  perform public.create_plan_subscription('f1524000-0000-0000-0000-000000000002', 'f1522000-0000-0000-0000-000000000002');

  if public.establishment_daily_menu_access('f1524000-0000-0000-0000-000000000001') is distinct from 'plan'
     or public.establishment_daily_menu_access('f1524000-0000-0000-0000-000000000002') is not null then
    raise exception 'RN-CRE-21 FALLIDO: el acceso a Menú Diario no sale del plan' using errcode = 'assert_failure';
  end if;

  -- No se contrata suelto a quien ya lo tiene en su plan.
  begin
    perform public.create_service_subscription('f1524000-0000-0000-0000-000000000001', 'f1522500-0000-0000-0000-000000000001');
    raise exception 'RN-CRE-21 FALLIDO: se contrató Menú Diario suelto a quien lo tiene en su plan' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%RN-CRE-21%' then raise; end if;
  end;

  -- Al que no lo tiene, sí: suelto.
  perform public.create_service_subscription('f1524000-0000-0000-0000-000000000002', 'f1522500-0000-0000-0000-000000000001');
  if public.establishment_daily_menu_access('f1524000-0000-0000-0000-000000000002') is distinct from 'service' then
    raise exception 'RN-CRE-21 FALLIDO: contratado suelto no da acceso' using errcode = 'assert_failure';
  end if;

  -- Las plantillas, del equipo: la de publicar y la de imprimir.
  insert into mdp_ids values
    ('pub', public.create_menu_template('f1524000-0000-0000-0000-000000000001', 'Web', 'included', null, 'publish'));

  -- RN-CRE-23 · una activa de cada.
  begin
    perform public.create_menu_template('f1524000-0000-0000-0000-000000000001', 'Otra web', 'included', null, 'publish');
    raise exception 'RN-CRE-23 FALLIDO: dos plantillas para publicar activas' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%archívala antes%' then raise; end if;
  end;
end $$;

-- RN-COM-23 · quitar Menú Diario del plan perjudica; ponerlo favorece.
set local role postgres;
do $$
begin
  if (select better from public.plan_terms_diff_internal('f1522000-0000-0000-0000-000000000001',
        'f1522000-0000-0000-0000-000000000002') where field = 'includes_daily_menu') is distinct from false
     or (select better from public.plan_terms_diff_internal('f1522000-0000-0000-0000-000000000002',
        'f1522000-0000-0000-0000-000000000001') where field = 'includes_daily_menu') is distinct from true then
    raise exception 'RN-COM-23 FALLIDO: la comparación no sabe que Menú Diario en el plan es mejor' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-22 y RN-CRE-30 · el menú del día, sin contador, se cambia editándolo
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1520000-0000-0000-0000-000000000002', true);
do $$
declare v_m uuid; v_v1 uuid; v_v2 uuid; v_p1 uuid; v_p2 uuid;
begin
  v_m := public.create_menu('f1524000-0000-0000-0000-000000000001', 'Menú del día', 'daily', current_date + 2);
  -- RN-CRE-23 · el restaurante no elige: nace con la de publicar.
  if (select template_id from public.menus where id = v_m) is distinct from (select v from mdp_ids where k = 'pub') then
    raise exception 'RN-CRE-23 FALLIDO: el menú no toma la plantilla para publicar' using errcode = 'assert_failure';
  end if;

  -- RN-CRE-22 · otro menú del día para esa fecha, no; otro tipo, sí.
  begin
    perform public.create_menu('f1524000-0000-0000-0000-000000000001', 'Otro', 'daily', current_date + 2);
    raise exception 'RN-CRE-22 FALLIDO: dos menús del día para la misma fecha' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Ya hay un menú del día%' then raise; end if;
  end;
  insert into mdp_ids values
    ('grupos', public.create_menu('f1524000-0000-0000-0000-000000000001', 'Grupos', 'groups', current_date + 2));

  v_v1 := public.save_menu_version(v_m, array['Ensalada'], array['Merluza'], array['Flan'], null, 1450, null);
  perform public.prepare_menu(v_m);
  v_p1 := public.request_menu_publication(v_m, 'mdp-1');

  -- RN-CRE-22 · no consume.
  if exists (select 1 from public.menu_update_entries where menu_id = v_m)
     or exists (select 1 from public.menu_update_balance('f1524000-0000-0000-0000-000000000001')) then
    raise exception 'RN-CRE-22 FALLIDO: pedir la publicación consumió' using errcode = 'assert_failure';
  end if;
  insert into mdp_ids values ('menu', v_m), ('v1', v_v1), ('p1', v_p1);
end $$;

-- Ana, la única candidata, lo publica.
select set_config('request.jwt.claim.sub', 'f1520000-0000-0000-0000-000000000003', true);
do $$
begin
  perform public.mark_menu_published((select v from mdp_ids where k = 'menu'));
end $$;

-- El restaurante lo cambia: vuelve a borrador y la web sigue con la v1.
select set_config('request.jwt.claim.sub', 'f1520000-0000-0000-0000-000000000002', true);
do $$
declare v_m uuid := (select v from mdp_ids where k = 'menu'); v_v2 uuid; v_p2 uuid;
begin
  v_v2 := public.save_menu_version(v_m, array['Ensalada'], array['Lubina'], array['Flan'], null, 1450, null);
  if (select state from public.menus where id = v_m) <> 'draft'
     or (select published_version_id from public.menus where id = v_m) <> (select v from mdp_ids where k = 'v1') then
    raise exception 'RN-CRE-30 FALLIDO: cambiar lo publicado no deja la web intacta y el menú en borrador' using errcode = 'assert_failure';
  end if;

  perform public.prepare_menu(v_m);
  v_p2 := public.request_menu_publication(v_m, 'mdp-2');
  if v_p2 = (select v from mdp_ids where k = 'p1') then
    raise exception 'RN-CRE-30 FALLIDO: volver a publicar no abrió una publicación nueva' using errcode = 'assert_failure';
  end if;
  insert into mdp_ids values ('v2', v_v2);
end $$;

select set_config('request.jwt.claim.sub', 'f1520000-0000-0000-0000-000000000003', true);
do $$
begin
  perform public.mark_menu_published((select v from mdp_ids where k = 'menu'));
end $$;

set local role postgres;
do $$
declare v_m uuid := (select v from mdp_ids where k = 'menu');
begin
  -- Sustituye: la web lleva la v2, y hay dos publicaciones, ninguna con consumo.
  if (select published_version_id from public.menus where id = v_m) <> (select v from mdp_ids where k = 'v2')
     or (select count(*) from public.menu_publications where menu_id = v_m and published_at is not null) <> 2
     or exists (select 1 from public.menu_publications where menu_id = v_m and debit_entry_id is not null) then
    raise exception 'RN-CRE-30 FALLIDO: la segunda publicación no sustituyó a la primera sin coste' using errcode = 'assert_failure';
  end if;
end $$;

-- Un menú de otro tipo publicado no se edita (RN-MEN-03 sigue para ellos).
do $$
declare v_g uuid := (select v from mdp_ids where k = 'grupos'); v_ver uuid;
begin
  insert into public.menu_versions (space_id, menu_id, version, starters, mains, desserts, created_by)
  values ('f1521000-0000-0000-0000-000000000001', v_g, 1, '{}', '{}', '{}', 'f1520000-0000-0000-0000-000000000002')
  returning id into v_ver;
  update public.menus set state = 'published', current_version_id = v_ver, published_version_id = v_ver,
                          published_at = now() where id = v_g;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1520000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.save_menu_version((select v from mdp_ids where k = 'grupos'), array['A'], array['B'], array['C'], null, null, null);
    raise exception 'RN-MEN-03 FALLIDO: se editó un menú de grupos publicado' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no se edita%' then raise; end if;
  end;

  -- RN-CRE-24 · ni corrección mínima del restaurante.
  begin
    perform public.request_menu_correction((select v from mdp_ids where k = 'menu'), 'Falta una tilde');
    raise exception 'RN-CRE-24 FALLIDO: se pidió una corrección mínima' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%RN-CRE-24%' then raise; end if;
  end;

  -- RN-CRE-23 · sin plantilla para imprimir, el papel no sale.
  begin
    perform public.register_menu_download((select v from mdp_ids where k = 'menu'), 'pdf', true);
    raise exception 'RN-CRE-23 FALLIDO: se imprimió sin plantilla para imprimir' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%plantilla para imprimir%' then raise; end if;
  end;
end $$;

-- Con la de imprimir, el papel sale en ella y el archivo en la de publicar.
select set_config('request.jwt.claim.sub', 'f1520000-0000-0000-0000-000000000001', true);
do $$
begin
  insert into mdp_ids values
    ('print', public.create_menu_template('f1524000-0000-0000-0000-000000000001', 'Papel', 'included', null, 'print'));
end $$;
select set_config('request.jwt.claim.sub', 'f1520000-0000-0000-0000-000000000002', true);
do $$
declare v_d1 uuid; v_d2 uuid;
begin
  v_d1 := public.register_menu_download((select v from mdp_ids where k = 'menu'), 'pdf', true);
  v_d2 := public.register_menu_download((select v from mdp_ids where k = 'menu'), 'png');
  if (select template_id from public.menu_downloads where id = v_d1) <> (select v from mdp_ids where k = 'print')
     or (select template_id from public.menu_downloads where id = v_d2) <> (select v from mdp_ids where k = 'pub') then
    raise exception 'RN-CRE-23 FALLIDO: cada descarga no sale en su plantilla' using errcode = 'assert_failure';
  end if;
end $$;

-- RN-CRE-23 · sin plantilla para publicar, el menú no se prepara.
set local role postgres;
update public.menu_templates set archived_at = now() where id = (select v from mdp_ids where k = 'pub');
set local role authenticated;
do $$
declare v_m uuid;
begin
  v_m := public.create_menu('f1524000-0000-0000-0000-000000000001', 'Sin plantilla', 'daily', current_date + 5);
  perform public.save_menu_version(v_m, array['A'], array['B'], array['C'], null, null, null);
  begin
    perform public.prepare_menu(v_m);
    raise exception 'RN-CRE-23 FALLIDO: se preparó un menú sin plantilla para publicar' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%plantilla para publicar%' then raise; end if;
  end;
end $$;

-- RN-CRE-24 · el barrido no avisa a ninguna hora.
set local role postgres;
do $$
begin
  if public.run_daily_menu_sweep('f1521000-0000-0000-0000-000000000001',
       ((current_date + 1)::timestamp + time '20:30') at time zone 'Europe/Madrid') <> 0
     or public.run_daily_menu_sweep('f1521000-0000-0000-0000-000000000001',
       ((current_date + 2)::timestamp + time '08:30') at time zone 'Europe/Madrid') <> 0 then
    raise exception 'RN-CRE-24 FALLIDO: el barrido de Menú Diario sigue avisando' using errcode = 'assert_failure';
  end if;
end $$;

select 'menu_diario_dentro_del_plan.sql: RN-CRE-21 a 24 y RN-CRE-30 cumplidos' as resultado;

rollback;
