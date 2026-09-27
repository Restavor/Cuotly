-- ============================================================
-- Suite 88 · El catálogo de Restavor en créditos (migración 154;
--            decisión 85; PRD §6.1 y §41)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · §6.1 y RN-CRE-01 · `create_restavor_space()` siembra Básico (20 €,
--     sin créditos, trimestral), Impulso (99 €, 20 créditos) y Premium
--     (199 €, 40 créditos), los dos con 24 h (RN-CRE-20), Menú Diario
--     incluido (RN-CRE-21), los dos informes (RN-CRE-26), ninguno ordena
--     (RN-CRE-28), turnos 0, 1 y 2, y ningún cambio por categoría.
--   · RN-CRE-21 y RN-CRE-22 · Menú Diario suelto a 199 €, sin precio
--     reducido y sin contador; un servicio Menú Diario sin actualizaciones
--     ya se puede crear.
--   · La función que lo aplica a un espacio que ya existe: pone el
--     catálogo, deja apunte, no toca el Básico ni un plan de otro nombre,
--     repetirla no hace nada más, y se para si alguien ya tiene uno de los
--     planes que cambian (RN-COM-20).
--   · CLAUDE.md · la función de la migración es interna.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_catalogo_en_creditos.sql
--
-- Prefijo de esta suite: f1540000-.

begin;

set local role postgres;

-- Bosco: el correo que reconoce `is_platform_owner()`.
insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;
insert into auth.users (id, email, role, aud) values
  ('f1540000-0000-0000-0000-000000000002', 'duena154@cuotly.test', 'authenticated', 'authenticated');
insert into public.profiles (id, email, full_name) values
  ('f1540000-0000-0000-0000-000000000002', 'duena154@cuotly.test', 'Dueña 154')
on conflict (id) do update set full_name = excluded.full_name;

create temporary table s154 (k text primary key, v uuid) on commit drop;
grant all on s154 to authenticated;

-- ============================================================
-- CLAUDE.md · la función de la migración no se llama por RPC
-- ============================================================
do $$
begin
  if has_function_privilege('authenticated', 'public.apply_credit_catalogue_internal(uuid)', 'execute')
     or has_function_privilege('anon', 'public.apply_credit_catalogue_internal(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: apply_credit_catalogue_internal está abierta por RPC' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- §6.1 · La semilla de Restavor
-- ============================================================
-- Otra suite puede haber dejado creado el espacio de Restavor: se aparta
-- el nombre dentro de esta transacción para que la semilla pueda nacer.
update public.spaces set slug = 'restavor-apartado-154' where slug = 'restavor';

set local request.jwt.claim.sub = 'ffb00000-0000-0000-0000-000000000001';
-- RN-ADM-02 · el sombrero de plataforma solo existe en dos pasos.
set local request.jwt.claim.aal = 'aal2';
set local role authenticated;
do $$
declare
  v_space uuid;
  r record;
begin
  v_space := public.create_restavor_space();
  insert into s154 values ('restavor', v_space);

  if (select count(*) from public.plans where space_id = v_space) <> 3 then
    raise exception '§6.1 FALLIDO: Restavor no nace con tres planes' using errcode = 'assert_failure';
  end if;

  for r in
    select * from (values
      ('Básico',   2000,  0, 48, 0, 'basic',    'quarter', false),
      ('Impulso',  9900, 40, 24, 1, 'standard', 'both',    true),
      ('Premium', 19900, 80, 24, 2, 'advanced', 'both',    true)
    ) as f(name, price, credits, sla, rank, level, period, menu)
  loop
    if not exists (
      select 1 from public.plans p
      where p.space_id = v_space and p.name = r.name
        and p.price_cents = r.price and p.included_credits_half = r.credits
        and p.start_sla_hours = r.sla and p.queue_rank = r.rank
        and p.report_level = r.level and p.report_period = r.period
        and p.includes_daily_menu = r.menu
        and p.included_small + p.included_photo + p.included_medium + p.included_large = 0
        and not p.can_order_requests and not p.grants_priority
    ) then
      raise exception '§6.1 / RN-CRE-01 FALLIDO: el plan % no nace como dice su ficha (decisión 85)', r.name
        using errcode = 'assert_failure';
    end if;
  end loop;

  if exists (select 1 from public.plans where space_id = v_space and can_order_requests) then
    raise exception 'RN-CRE-28 FALLIDO: un plan de Restavor ordena sus solicitudes' using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.services
    where space_id = v_space and kind = 'daily_menu'
      and price_cents = 19900 and price_premium_cents is null and included_updates = 0
  ) then
    raise exception 'RN-CRE-21 FALLIDO: Menú Diario suelto no nace a 199 €, sin precio reducido ni contador'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-22 · un Menú Diario sin actualizaciones ya se puede crear
-- ============================================================
set local role postgres;
do $$
begin
  perform public.assert_service_terms('daily_menu', 19900, null, 0);
exception when others then
  raise exception 'RN-CRE-22 FALLIDO: un servicio Menú Diario sin actualizaciones se rechaza (%)', sqlerrm
    using errcode = 'assert_failure';
end $$;

do $$
begin
  begin
    perform public.assert_service_terms('daily_menu', 19900, null, -1);
    raise exception 'RN-CRE-22 FALLIDO: se aceptaron actualizaciones negativas' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;
end $$;

-- ============================================================
-- El espacio que ya existe: del catálogo de antes al de créditos
-- ============================================================
insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1541000-0000-0000-0000-000000000001', 'Espacio 154', 'espacio-154', 'Europe/Madrid',
   'f1540000-0000-0000-0000-000000000002');

-- El catálogo tal como lo dejó la migración 148, más un plan propio.
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium,
                          included_large, start_sla_hours, queue_rank, can_order_requests, report_level, report_period)
values
  ('f1542000-0000-0000-0000-000000000001', 'f1541000-0000-0000-0000-000000000001', 'Básico', 2000, 0, 0, 0, 0, 48, 0, false, 'basic', 'quarter'),
  ('f1542000-0000-0000-0000-000000000002', 'f1541000-0000-0000-0000-000000000001', 'Impulso', 29900, 6, 6, 1, 0, 48, 1, false, 'standard', 'month'),
  ('f1542000-0000-0000-0000-000000000003', 'f1541000-0000-0000-0000-000000000001', 'Premium', 49900, 10, 12, 2, 0, 24, 2, true, 'advanced', 'month'),
  ('f1542000-0000-0000-0000-000000000004', 'f1541000-0000-0000-0000-000000000001', 'Propio', 12300, 1, 1, 0, 0, 48, 1, false, 'standard', 'month');

insert into public.services (id, space_id, name, price_cents, price_premium_cents, kind, included_updates) values
  ('f1543000-0000-0000-0000-000000000001', 'f1541000-0000-0000-0000-000000000001', 'Menú Diario', 22900, 19900, 'daily_menu', 30);

do $$
declare
  v_apuntes integer;
begin
  perform public.apply_credit_catalogue_internal('f1541000-0000-0000-0000-000000000001');

  if not exists (select 1 from public.plans where id = 'f1542000-0000-0000-0000-000000000002'
                 and price_cents = 9900 and included_credits_half = 40 and start_sla_hours = 24
                 and included_small + included_photo + included_medium + included_large = 0
                 and report_period = 'both' and includes_daily_menu and queue_rank = 1) then
    raise exception 'RN-CRE-01 FALLIDO: el Impulso que ya existía no quedó en 99 € y 20 créditos' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.plans where id = 'f1542000-0000-0000-0000-000000000003'
                 and price_cents = 19900 and included_credits_half = 80 and not can_order_requests
                 and report_period = 'both' and includes_daily_menu and queue_rank = 2) then
    raise exception 'RN-CRE-28 FALLIDO: el Premium que ya existía no quedó en 199 €, 40 créditos y sin ordenar'
      using errcode = 'assert_failure';
  end if;
  -- Ni el Básico ni un plan de otro nombre se tocan.
  if not exists (select 1 from public.plans where id = 'f1542000-0000-0000-0000-000000000001'
                 and price_cents = 2000 and included_credits_half = 0 and report_period = 'quarter'
                 and not includes_daily_menu) then
    raise exception '§6.1 FALLIDO: la función tocó el Básico' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.plans where id = 'f1542000-0000-0000-0000-000000000004'
                 and price_cents = 12300 and included_small = 1 and included_credits_half = 0) then
    raise exception '§6.1 FALLIDO: la función tocó un plan que no es de la ficha' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.services where id = 'f1543000-0000-0000-0000-000000000001'
                 and price_cents = 19900 and price_premium_cents is null and included_updates = 0) then
    raise exception 'RN-CRE-21 FALLIDO: Menú Diario suelto no quedó a 199 €, sin precio reducido ni contador'
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_apuntes from public.audit_log
  where space_id = 'f1541000-0000-0000-0000-000000000001' and new_value->>'via' like 'migración 154%';
  if v_apuntes <> 3 then
    raise exception 'CLAUDE.md FALLIDO: el cambio de catálogo no dejó un apunte por plan y servicio (hay %)', v_apuntes
      using errcode = 'assert_failure';
  end if;

  -- Repetirla no hace nada más.
  perform public.apply_credit_catalogue_internal('f1541000-0000-0000-0000-000000000001');
  if (select count(*) from public.audit_log
      where space_id = 'f1541000-0000-0000-0000-000000000001' and new_value->>'via' like 'migración 154%') <> 3 then
    raise exception 'CA-17 FALLIDO: aplicar la función dos veces volvió a escribir' using errcode = 'assert_failure';
  end if;
end $$;

-- RN-COM-20 · con alguien dentro, no se reescribe en el sitio.
insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1541000-0000-0000-0000-000000000002', 'Espacio 154 b', 'espacio-154-b', 'Europe/Madrid',
   'f1540000-0000-0000-0000-000000000002');
insert into public.groups (id, space_id, name) values
  ('f1544000-0000-0000-0000-000000000001', 'f1541000-0000-0000-0000-000000000002', 'Grupo 154');
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1545000-0000-0000-0000-000000000001', 'f1541000-0000-0000-0000-000000000002',
   'f1544000-0000-0000-0000-000000000001', 'EST-154', 'Casa 154', 'active');
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium,
                          included_large, start_sla_hours, queue_rank, report_level, report_period)
values ('f1542000-0000-0000-0000-000000000009', 'f1541000-0000-0000-0000-000000000002', 'Impulso',
        29900, 6, 6, 1, 0, 48, 1, 'standard', 'month');
insert into public.subscriptions (space_id, establishment_id, kind, plan_id)
values ('f1541000-0000-0000-0000-000000000002', 'f1545000-0000-0000-0000-000000000001', 'plan',
        'f1542000-0000-0000-0000-000000000009');

do $$
begin
  begin
    perform public.apply_credit_catalogue_internal('f1541000-0000-0000-0000-000000000002');
    raise exception 'RN-COM-20 FALLIDO: se reescribió en el sitio un plan que alguien tiene' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when raise_exception then
    if sqlerrm not like '%RN-COM-20%' then raise; end if;
  end;
  if (select price_cents from public.plans where id = 'f1542000-0000-0000-0000-000000000009') <> 29900 then
    raise exception 'RN-COM-20 FALLIDO: el plan con alguien dentro cambió de precio' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- La guía del centro de ayuda ya no cuenta las reglas de antes
-- ============================================================
do $$
begin
  if exists (select 1 from public.help_articles
             where body ~* '30 actualizaciones|contador de actualizaciones|ordenar tus cambios|no incluye cambios ni fotografías') then
    raise exception 'RN-SOP-10 FALLIDO: una guía sigue contando las reglas de antes de la decisión 85' using errcode = 'assert_failure';
  end if;
end $$;

rollback;
