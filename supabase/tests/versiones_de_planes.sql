-- ============================================================
-- Suite 72 · Versiones de planes y servicios
--            (migración 131; decisión 72; PRD §6.5, RN-COM-19 a RN-COM-30)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-COM-19 · solo el propietario crea, edita y archiva; ni un
--     administrador, ni el restaurante, ni un UPDATE directo.
--   · RN-COM-21 · un plan que nadie tiene se edita en el sitio.
--   · RN-COM-20 · uno que alguien tiene crea versión nueva; el nombre se
--     corrige sin versión. Pulsar dos veces no crea dos versiones.
--   · RN-COM-22 · se pasa en la primera renovación a 30 días o más de
--     publicarla, y no antes.
--   · RN-COM-23/24 · lo que perjudica pide aceptación; sin ella, el
--     restaurante sigue en la versión que aceptó ("en versión anterior").
--     Lo que solo favorece pasa solo. Un término que el cliente no ve
--     (el turno en la cola) no le pide nada.
--   · RN-COM-25 · pasar de versión no reinicia la permanencia.
--   · RN-COM-27 · lo sustituido o archivado no se contrata ni se programa.
--   · RN-COM-28 · la bolsa y la mensualidad del periodo nuevo salen ya de
--     la versión nueva; el periodo en curso no cambia.
--   · RN-COM-29 · lo mismo para un servicio.
--   · RN-COM-30 · la comparativa, sin el turno en la cola para el cliente.
--   · P7 · quién del equipo registró una aceptación no lo ve el cliente.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/versiones_de_planes.sql
--
-- Prefijo de esta suite: f1600000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1600000-0000-0000-0000-000000000001', 'duena72@cuotly.test', 'authenticated', 'authenticated'),
  ('f1600000-0000-0000-0000-000000000002', 'admin72@cuotly.test', 'authenticated', 'authenticated'),
  ('f1600000-0000-0000-0000-000000000003', 'cliente72@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1600000-0000-0000-0000-000000000001', 'duena72@cuotly.test', 'Dueña 72'),
  ('f1600000-0000-0000-0000-000000000002', 'admin72@cuotly.test', 'Admin 72'),
  ('f1600000-0000-0000-0000-000000000003', 'cliente72@cuotly.test', 'Cliente 72')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1610000-0000-0000-0000-000000000001', 'Espacio 72', 'espacio-72', 'Europe/Madrid',
   'f1600000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1610000-0000-0000-0000-000000000001', 'f1600000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('f1610000-0000-0000-0000-000000000001', 'f1600000-0000-0000-0000-000000000002', 'admin', 'active');

insert into public.groups (id, space_id, name) values
  ('f1630000-0000-0000-0000-000000000001', 'f1610000-0000-0000-0000-000000000001', 'Grupo 72');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1640000-0000-0000-0000-000000000001', 'f1610000-0000-0000-0000-000000000001',
   'f1630000-0000-0000-0000-000000000001', 'EST-72-1', 'Casa Uno', 'active'),
  ('f1640000-0000-0000-0000-000000000002', 'f1610000-0000-0000-0000-000000000001',
   'f1630000-0000-0000-0000-000000000001', 'EST-72-2', 'Casa Dos', 'active'),
  ('f1640000-0000-0000-0000-000000000003', 'f1610000-0000-0000-0000-000000000001',
   'f1630000-0000-0000-0000-000000000001', 'EST-72-3', 'Casa Tres', 'active'),
  ('f1640000-0000-0000-0000-000000000004', 'f1610000-0000-0000-0000-000000000001',
   'f1630000-0000-0000-0000-000000000001', 'EST-72-4', 'Casa Cuatro', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f1640000-0000-0000-0000-000000000001', 'f1600000-0000-0000-0000-000000000003', 'local_owner'),
  ('f1640000-0000-0000-0000-000000000002', 'f1600000-0000-0000-0000-000000000003', 'local_owner');

insert into public.files (id, space_id, group_id, establishment_id, category, visibility, name, created_by) values
  ('f1670000-0000-0000-0000-000000000001', 'f1610000-0000-0000-0000-000000000001',
   'f1630000-0000-0000-0000-000000000001', 'f1640000-0000-0000-0000-000000000004',
   'documents', 'internal', 'Contrato 72', 'f1600000-0000-0000-0000-000000000001');

-- Las funciones nuevas: anon no ejecuta ninguna; authenticated sí, y
-- cada una comprueba el permiso por dentro.
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text)',
    'public.revise_plan(uuid, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text)',
    'public.rename_plan(uuid, text)', 'public.archive_plan(uuid)',
    'public.create_service(uuid, text, text, integer, integer, integer, text)',
    'public.revise_service(uuid, integer, integer, integer, text)',
    'public.accept_revision(uuid)', 'public.record_external_revision_acceptance(uuid, date, uuid)',
    'public.space_revision_status(uuid)', 'public.subscription_revision(uuid)',
    'public.revision_diff(text, uuid, uuid)', 'public.subscription_revision_terms(uuid)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: anon puede ejecutar %', v_fn using errcode = 'assert_failure';
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '% debería poder llamarla authenticated', v_fn using errcode = 'assert_failure';
    end if;
  end loop;

  foreach v_fn in array array[
    'public.apply_due_revision_internal(uuid)', 'public.plan_terms_diff_internal(uuid, uuid)',
    'public.revision_harms_internal(text, uuid, uuid)', 'public.notify_revision_published(uuid, text, uuid, uuid)'
  ] loop
    if has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: la interna % está abierta a authenticated', v_fn using errcode = 'assert_failure';
    end if;
  end loop;

  -- P7 · quién del equipo registró una aceptación.
  if has_column_privilege('authenticated', 'public.revision_acceptances', 'recorded_by', 'select') then
    raise exception 'P7 FALLIDO: authenticated puede leer revision_acceptances.recorded_by' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-COM-19 · solo el propietario
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1600000-0000-0000-0000-000000000002';

do $$
begin
  begin
    perform public.create_plan('f1610000-0000-0000-0000-000000000001', 'Del admin', 10000,
      1, 1, 0, 0, 24, 72, 72, 72, 120, false, false, 0, 'basic', false, null);
    raise exception 'RN-COM-19 FALLIDO: un administrador creó un plan' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

set local request.jwt.claim.sub = 'f1600000-0000-0000-0000-000000000001';

-- El plan de la suite: 100 €, 2 pequeños, 1 foto, 48 h.
do $$
declare
  v_id uuid;
  v_again uuid;
begin
  v_id := public.create_plan('f1610000-0000-0000-0000-000000000001', 'Plan 72', 10000,
    2, 1, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, 'crear-72');
  v_again := public.create_plan('f1610000-0000-0000-0000-000000000001', 'Plan 72', 10000,
    2, 1, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, 'crear-72');
  if v_id <> v_again then
    raise exception 'CLAUDE.md FALLIDO: la misma clave creó dos planes' using errcode = 'assert_failure';
  end if;
  perform set_config('suite72.plan', v_id::text, true);

  begin
    perform public.create_plan('f1610000-0000-0000-0000-000000000001', 'plan 72', 5000,
      0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, null);
    raise exception 'create_plan FALLIDO: aceptó un nombre repetido' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

-- ============================================================
-- RN-COM-21 · sin nadie en el plan, se edita en el sitio
-- ============================================================
do $$
declare
  v_plan uuid := current_setting('suite72.plan')::uuid;
  v_res uuid;
  v_updated int;
begin
  v_res := public.revise_plan(v_plan, 9000, 2, 1, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, 'sitio-72');
  if v_res <> v_plan then
    raise exception 'RN-COM-21 FALLIDO: un plan sin restaurantes creó versión nueva' using errcode = 'assert_failure';
  end if;
  if (select price_cents from public.plans where id = v_plan) <> 9000 then
    raise exception 'RN-COM-21 FALLIDO: el precio no cambió en el sitio' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where entity_id = v_plan and action = 'plan.edited'
                 and (old_value->>'price_cents')::int = 10000 and (new_value->>'price_cents')::int = 9000) then
    raise exception 'RN-COM-21 FALLIDO: la edición en el sitio no quedó en la auditoría con valor anterior y nuevo'
      using errcode = 'assert_failure';
  end if;

  -- RN-COM-19 · y nadie la esquiva con un UPDATE directo: cero filas.
  with intento as (update public.plans set price_cents = 1 where id = v_plan returning id)
  select count(*) into v_updated from intento;
  if v_updated <> 0 or (select price_cents from public.plans where id = v_plan) <> 9000 then
    raise exception 'RN-COM-19 FALLIDO: un UPDATE directo cambió el precio del plan' using errcode = 'assert_failure';
  end if;

  -- Sin cambios no hay nada que editar.
  begin
    perform public.revise_plan(v_plan, 9000, 2, 1, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, null);
    raise exception 'revise_plan FALLIDO: aceptó una edición sin cambios' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

-- Los cuatro restaurantes lo contratan (la dueña tiene manage_clients).
do $$
declare
  v_plan uuid := current_setting('suite72.plan')::uuid;
  v_i int;
begin
  for v_i in 1..4 loop
    perform public.create_plan_subscription(('f1640000-0000-0000-0000-00000000000' || v_i)::uuid, v_plan);
  end loop;
end $$;

-- ============================================================
-- RN-COM-20 · con restaurantes, versión nueva; el nombre no
-- ============================================================
do $$
declare
  v_plan uuid := current_setting('suite72.plan')::uuid;
  v_v2 uuid;
  v_again uuid;
begin
  -- Sube el precio: perjudica (RN-COM-23).
  v_v2 := public.revise_plan(v_plan, 12000, 2, 1, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, 'subir-72');
  v_again := public.revise_plan(v_plan, 12000, 2, 1, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, 'subir-72');

  if v_v2 = v_plan then
    raise exception 'RN-COM-20 FALLIDO: se editó en el sitio un plan que tienen cuatro restaurantes' using errcode = 'assert_failure';
  end if;
  if v_again <> v_v2 or (select count(*) from public.plans where lineage_id = v_plan) <> 2 then
    raise exception 'CLAUDE.md FALLIDO: la misma clave creó dos versiones' using errcode = 'assert_failure';
  end if;
  if (select revision from public.plans where id = v_v2) <> 2
     or (select superseded_at from public.plans where id = v_plan) is null
     or (select price_cents from public.plans where id = v_plan) <> 9000 then
    raise exception 'RN-COM-20 FALLIDO: la versión 1 no quedó intacta y sustituida' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.subscriptions where plan_id = v_v2) then
    raise exception 'RN-COM-22 FALLIDO: alguien pasó a la versión nueva al publicarla' using errcode = 'assert_failure';
  end if;

  -- Una versión sustituida no se edita.
  begin
    perform public.revise_plan(v_plan, 1, 2, 1, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, null);
    raise exception 'RN-COM-20 FALLIDO: se editó una versión sustituida' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- El nombre se corrige en todo el linaje, sin versión nueva.
  perform public.rename_plan(v_v2, 'Plan 72 bis');
  if (select count(*) from public.plans where lineage_id = v_plan and name = 'Plan 72 bis') <> 2
     or (select count(*) from public.plans where lineage_id = v_plan) <> 2 then
    raise exception 'RN-COM-20 FALLIDO: renombrar creó versión o no llegó a todo el linaje' using errcode = 'assert_failure';
  end if;

  perform set_config('suite72.v2', v_v2::text, true);
end $$;

-- RN-COM-23 · el aviso: al propietario del restaurante, no al equipo.
set local role postgres;
do $$
begin
  if not exists (select 1 from public.notifications
                 where recipient_id = 'f1600000-0000-0000-0000-000000000003'
                   and event_type = 'plan_revision_published') then
    raise exception 'RN-COM-23 FALLIDO: el restaurante no recibió el aviso de la versión nueva' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications
             where recipient_id = 'f1600000-0000-0000-0000-000000000001'
               and event_type = 'plan_revision_published') then
    raise exception 'RN-COM-23 FALLIDO: la dueña, que es quien publica, recibió el aviso' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-COM-27 · lo sustituido no se contrata ni se programa
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1600000-0000-0000-0000-000000000001';

do $$
declare
  v_plan uuid := current_setting('suite72.plan')::uuid;
  v_otro uuid;
begin
  -- Otro plan, para poder intentar cambios.
  v_otro := public.create_plan('f1610000-0000-0000-0000-000000000001', 'Otro 72', 5000,
    1, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, null);
  perform set_config('suite72.otro', v_otro::text, true);

  begin
    perform public.schedule_plan_change((select id from public.subscriptions
      where establishment_id = 'f1640000-0000-0000-0000-000000000001' and kind = 'plan'),
      current_setting('suite72.v2')::uuid);
    raise exception 'RN-COM-22 FALLIDO: se programó un "cambio" a otra versión del mismo plan' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

set local role postgres;
do $$
declare
  v_plan uuid := current_setting('suite72.plan')::uuid;
  v_v2 uuid := current_setting('suite72.v2')::uuid;
begin
  -- Ni un UPDATE directo pasa a nadie de versión saltándose la renovación.
  begin
    update public.subscriptions set plan_id = v_v2
    where establishment_id = 'f1640000-0000-0000-0000-000000000001' and kind = 'plan';
    raise exception 'RN-COM-22 FALLIDO: un UPDATE directo pasó un restaurante a la versión nueva' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- Ni se contrata la versión sustituida.
  update public.subscriptions set status = 'cancelled'
  where establishment_id = 'f1640000-0000-0000-0000-000000000004' and kind = 'plan';
  begin
    insert into public.subscriptions (space_id, establishment_id, kind, plan_id)
    values ('f1610000-0000-0000-0000-000000000001', 'f1640000-0000-0000-0000-000000000004', 'plan', v_plan);
    raise exception 'RN-COM-27 FALLIDO: se contrató una versión sustituida' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  update public.subscriptions set status = 'active'
  where establishment_id = 'f1640000-0000-0000-0000-000000000004' and kind = 'plan';
end $$;

-- ============================================================
-- RN-COM-22/24 · el paso en la renovación, con y sin aceptación
-- ============================================================
--
-- Se mueve el calendario: cada suscripción empezó hace 40 días, así que
-- su periodo en curso empezó hace unos 9 y todavía no tiene bolsa ni
-- mensualidad. La versión 2 se publicó hace 60 días: el periodo en curso
-- empieza más de 30 días después, así que ya le toca.
do $$
begin
  update public.subscriptions set started_at = now() - interval '40 days'
  where space_id = 'f1610000-0000-0000-0000-000000000001';
  update public.plans set published_at = now() - interval '60 days'
  where id = current_setting('suite72.v2')::uuid;
end $$;

-- Casa Dos acepta antes de que nazca su periodo (la aceptación es suya).
set local role authenticated;
set local request.jwt.claim.sub = 'f1600000-0000-0000-0000-000000000003';

do $$
declare
  v_sub uuid := (select id from public.subscriptions
                 where establishment_id = 'f1640000-0000-0000-0000-000000000002' and kind = 'plan');
  v_a uuid;
  v_b uuid;
  v_state text;
begin
  select state into v_state from public.subscription_revision(v_sub);
  if v_state is distinct from 'held_back' then
    raise exception 'RN-COM-24 FALLIDO: una versión que perjudica, sin aceptar y con la renovación pasada, dice %', v_state
      using errcode = 'assert_failure';
  end if;

  v_a := public.accept_revision(v_sub);
  v_b := public.accept_revision(v_sub);
  if v_a <> v_b then
    raise exception 'CLAUDE.md FALLIDO: aceptar dos veces escribió dos aceptaciones' using errcode = 'assert_failure';
  end if;

  -- RN-COM-30 · el cliente ve lo que cambia, sin el turno en la cola.
  if not exists (select 1 from public.revision_diff('plan', current_setting('suite72.plan')::uuid,
                                                     current_setting('suite72.v2')::uuid) d
                 where d.field = 'price_cents' and d.better = false) then
    raise exception 'RN-COM-30 FALLIDO: la comparativa no dice que el precio sube' using errcode = 'assert_failure';
  end if;
end $$;

-- El restaurante no acepta por otro (Casa Cuatro no es suya).
do $$
begin
  begin
    perform public.accept_revision((select id from public.subscriptions
      where establishment_id = 'f1640000-0000-0000-0000-000000000004' and kind = 'plan'));
    raise exception 'RN-COM-23 FALLIDO: aceptó la versión de un restaurante ajeno' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

-- Casa Cuatro acepta fuera de Cuotly: lo registra la dueña con contrato.
set local request.jwt.claim.sub = 'f1600000-0000-0000-0000-000000000001';
do $$
declare
  v_sub uuid := (select id from public.subscriptions
                 where establishment_id = 'f1640000-0000-0000-0000-000000000004' and kind = 'plan');
begin
  begin
    perform public.record_external_revision_acceptance(v_sub, current_date, null);
    raise exception 'RN-COM-23 FALLIDO: se registró una aceptación externa sin contrato' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  perform public.record_external_revision_acceptance(v_sub, current_date - 1, 'f1670000-0000-0000-0000-000000000001');
end $$;

-- Nace el periodo de cada uno (lo que haría el barrido de mensualidades).
set local role postgres;
do $$
declare
  v_plan uuid := current_setting('suite72.plan')::uuid;
  v_v2 uuid := current_setting('suite72.v2')::uuid;
  v_i int;
  v_sub uuid;
  v_commitments_before int;
begin
  select count(*) into v_commitments_before from public.plan_commitments
  where space_id = 'f1610000-0000-0000-0000-000000000001';

  for v_i in 1..4 loop
    select id into v_sub from public.subscriptions
    where establishment_id = ('f1640000-0000-0000-0000-00000000000' || v_i)::uuid and kind = 'plan';
    perform public.generate_monthly_charge_internal(v_sub, null);
  end loop;

  -- Casa Uno no aceptó: sigue en la versión 1 y se le cobra 90 € (RN-COM-24).
  if (select plan_id from public.subscriptions
      where establishment_id = 'f1640000-0000-0000-0000-000000000001' and kind = 'plan') <> v_plan then
    raise exception 'RN-COM-24 FALLIDO: pasó a una versión que le perjudica sin aceptarla' using errcode = 'assert_failure';
  end if;
  if (select base_cents from public.charges c join public.subscriptions s on s.id = c.subscription_id
      where s.establishment_id = 'f1640000-0000-0000-0000-000000000001' and s.kind = 'plan'
        and c.period_start = (select w.period_start from public.subscription_current_period(s.id) w)) <> 9000 then
    raise exception 'RN-COM-24 FALLIDO: se le cobró una versión que no aceptó' using errcode = 'assert_failure';
  end if;

  -- Casa Dos (aceptó en Cuotly) y Casa Cuatro (fuera) pasan a la 2.
  if (select count(*) from public.subscriptions
      where establishment_id in ('f1640000-0000-0000-0000-000000000002', 'f1640000-0000-0000-0000-000000000004')
        and kind = 'plan' and plan_id = v_v2) <> 2 then
    raise exception 'RN-COM-22 FALLIDO: quien aceptó no pasó a la versión nueva en su renovación' using errcode = 'assert_failure';
  end if;

  -- RN-COM-28 · su mensualidad y su bolsa de este periodo, ya con la 2.
  if (select base_cents from public.charges c join public.subscriptions s on s.id = c.subscription_id
      where s.establishment_id = 'f1640000-0000-0000-0000-000000000002' and s.kind = 'plan'
        and c.period_start = (select w.period_start from public.subscription_current_period(s.id) w)) <> 12000 then
    raise exception 'RN-COM-28 FALLIDO: la mensualidad del periodo nuevo no sale de la versión nueva' using errcode = 'assert_failure';
  end if;

  -- RN-COM-25 · ninguna permanencia nueva.
  if (select count(*) from public.plan_commitments
      where space_id = 'f1610000-0000-0000-0000-000000000001') <> v_commitments_before then
    raise exception 'RN-COM-25 FALLIDO: pasar de versión reinició una permanencia' using errcode = 'assert_failure';
  end if;

  if not exists (select 1 from public.audit_log where action = 'subscription.revision_applied'
                 and new_value->>'establishment_id' = 'f1640000-0000-0000-0000-000000000002') then
    raise exception 'CLAUDE.md FALLIDO: el paso de versión no quedó auditado' using errcode = 'assert_failure';
  end if;

  -- RN-COM-28 · el periodo que ya empezó no cambia: aceptar ahora no
  -- mueve a Casa Uno hasta su próxima renovación.
  insert into public.revision_acceptances
    (space_id, establishment_id, subscription_id, plan_id, channel, accepted_by, accepted_at)
  select s.space_id, s.establishment_id, s.id, v_v2, 'in_app', 'f1600000-0000-0000-0000-000000000003', now()
  from public.subscriptions s
  where s.establishment_id = 'f1640000-0000-0000-0000-000000000001' and s.kind = 'plan';

  select id into v_sub from public.subscriptions
  where establishment_id = 'f1640000-0000-0000-0000-000000000001' and kind = 'plan';
  perform public.get_or_create_consumption_cycle_internal(v_sub);
  if (select plan_id from public.subscriptions where id = v_sub) <> v_plan then
    raise exception 'RN-COM-28 FALLIDO: se cambió de versión a mitad de un periodo' using errcode = 'assert_failure';
  end if;
  if (select state from public.subscription_revision_state_internal(v_sub)) <> 'scheduled' then
    raise exception 'RN-COM-24 FALLIDO: tras aceptar, el estado no pasa a "pasa en su renovación"' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-COM-22 · antes de los 30 días, nadie pasa; lo que favorece, solo
-- ============================================================
set local role postgres;
do $$
declare
  v_otro uuid := current_setting('suite72.otro')::uuid;
  v_sub uuid;
begin
  -- Casa Tres pasa a "Otro" por un cambio programado que ya se aplica (el
  -- camino es de migraciones anteriores; aquí solo importa que alguien
  -- tenga "Otro" para que editarlo cree versión).
  select id into v_sub from public.subscriptions
  where establishment_id = 'f1640000-0000-0000-0000-000000000003' and kind = 'plan';
  insert into public.scheduled_plan_changes
    (space_id, establishment_id, subscription_id, from_plan_id, to_plan_id, direction, effective_at, state)
  select s.space_id, s.establishment_id, s.id, s.plan_id, v_otro, 'downgrade', now(), 'pending'
  from public.subscriptions s where s.id = v_sub;
  update public.subscriptions set plan_id = v_otro where id = v_sub;
  update public.scheduled_plan_changes set state = 'applied', applied_at = now() where subscription_id = v_sub;
  perform set_config('suite72.sub3', v_sub::text, true);
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'f1600000-0000-0000-0000-000000000001';

do $$
declare
  v_otro uuid := current_setting('suite72.otro')::uuid;
begin
  -- Solo favorece: baja el precio y sube un cambio pequeño. Y el turno en
  -- la cola baja, que el cliente no ve y no cuenta para pedirle nada.
  perform set_config('suite72.otro2',
    public.revise_plan(v_otro, 4000, 2, 0, 0, 0, 48, 72, 72, 72, 120, false, false, -1, 'basic', false, null)::text,
    true);
end $$;

set local role postgres;
do $$
declare
  v_otro uuid := current_setting('suite72.otro')::uuid;
  v_otro2 uuid := current_setting('suite72.otro2')::uuid;
  v_sub uuid := current_setting('suite72.sub3')::uuid;
  v_cycle uuid;
begin
  if v_otro2 = v_otro then
    raise exception 'preparación: "Otro" tiene a Casa Tres y debería haber creado versión' using errcode = 'assert_failure';
  end if;

  if public.revision_harms_internal('plan', v_otro, v_otro2) then
    raise exception 'RN-COM-23 FALLIDO: bajar precio, subir un cambio y bajar el turno en la cola cuenta como perjuicio'
      using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.plan_terms_diff_internal(v_otro, v_otro2) d
             where d.field = 'queue_rank' and d.client_visible) then
    raise exception 'RN-COM-03 FALLIDO: el turno en la cola sale como visible para el cliente' using errcode = 'assert_failure';
  end if;

  -- Un alta de hace 55 días: su periodo en curso empezó hace unos 24 y no
  -- tiene bolsa ni mensualidad. Publicada hace 25 días, no le toca.
  update public.subscriptions set started_at = now() - interval '55 days' where id = v_sub;
  update public.plans set published_at = now() - interval '25 days' where id = v_otro2;

  if public.apply_due_revision_internal(v_sub) then
    raise exception 'RN-COM-22 FALLIDO: pasó a la versión nueva sin 30 días de aviso' using errcode = 'assert_failure';
  end if;
  if (select moves_at from public.subscription_revision_state_internal(v_sub))
       < (select published_at from public.plans where id = v_otro2) + interval '30 days' then
    raise exception 'RN-COM-22 FALLIDO: la fecha de paso prevista cae antes de los 30 días' using errcode = 'assert_failure';
  end if;

  -- Publicada hace 60: le toca, y como solo favorece pasa sin aceptar. La
  -- bolsa nace ya con el cambio pequeño de más (RN-COM-28).
  update public.plans set published_at = now() - interval '60 days' where id = v_otro2;
  v_cycle := public.get_or_create_consumption_cycle_internal(v_sub);
  if (select plan_id from public.subscriptions where id = v_sub) <> v_otro2 then
    raise exception 'RN-COM-23 FALLIDO: una versión que solo favorece no pasó sola en la renovación' using errcode = 'assert_failure';
  end if;
  if (select included_small from public.consumption_cycles where id = v_cycle) <> 2 then
    raise exception 'RN-COM-28 FALLIDO: la bolsa del periodo nuevo no sale de la versión nueva' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-COM-27 · archivar
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1600000-0000-0000-0000-000000000001';
do $$
declare
  v_otro2 uuid := current_setting('suite72.otro2')::uuid;
  v_sub uuid := current_setting('suite72.sub3')::uuid;
begin
  perform public.archive_plan(v_otro2);
  perform public.archive_plan(v_otro2);
  if (select archived_at from public.plans where id = v_otro2) is null then
    raise exception 'RN-COM-27 FALLIDO: el plan no quedó archivado' using errcode = 'assert_failure';
  end if;
  if (select plan_id from public.subscriptions where id = v_sub) <> v_otro2 then
    raise exception 'RN-COM-27 FALLIDO: archivar sacó a quien lo tenía' using errcode = 'assert_failure';
  end if;
  begin
    perform public.revise_plan(v_otro2, 1, 0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, null);
    raise exception 'RN-COM-27 FALLIDO: se editó un plan archivado' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.schedule_plan_change((select id from public.subscriptions
      where establishment_id = 'f1640000-0000-0000-0000-000000000001' and kind = 'plan'), v_otro2);
    raise exception 'RN-COM-27 FALLIDO: se programó un cambio a un plan archivado' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

-- ============================================================
-- RN-COM-29 · un servicio, igual
-- ============================================================
do $$
declare
  v_svc uuid;
  v_svc2 uuid;
begin
  v_svc := public.create_service('f1610000-0000-0000-0000-000000000001', 'Menú 72', 'daily_menu',
    22900, 19900, 30, 'svc-72');
  perform public.create_service_subscription('f1640000-0000-0000-0000-000000000001', v_svc);

  -- Menos actualizaciones: perjudica.
  v_svc2 := public.revise_service(v_svc, 22900, 19900, 25, 'svc-rev-72');
  if v_svc2 = v_svc or (select revision from public.services where id = v_svc2) <> 2 then
    raise exception 'RN-COM-29 FALLIDO: un servicio contratado no creó versión nueva' using errcode = 'assert_failure';
  end if;
  perform set_config('suite72.svc', v_svc::text, true);
  perform set_config('suite72.svc2', v_svc2::text, true);
end $$;

set local role postgres;
do $$
declare
  v_svc uuid := current_setting('suite72.svc')::uuid;
  v_svc2 uuid := current_setting('suite72.svc2')::uuid;
  v_sub uuid;
begin
  if not public.revision_harms_internal('service', v_svc, v_svc2) then
    raise exception 'RN-COM-29 FALLIDO: bajar las actualizaciones no cuenta como perjuicio' using errcode = 'assert_failure';
  end if;

  select id into v_sub from public.subscriptions
  where establishment_id = 'f1640000-0000-0000-0000-000000000001' and kind = 'service';
  update public.subscriptions set started_at = now() - interval '40 days' where id = v_sub;
  update public.services set published_at = now() - interval '60 days' where id = v_svc2;

  perform public.get_or_create_menu_update_cycle(v_sub);
  if (select service_id from public.subscriptions where id = v_sub) <> v_svc then
    raise exception 'RN-COM-24 FALLIDO: un servicio pasó a una versión que perjudica sin aceptarla' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Las condiciones cuelgan del linaje (RN-DAT-07 sigue valiendo)
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1600000-0000-0000-0000-000000000001';
do $$
declare
  v_plan uuid := current_setting('suite72.plan')::uuid;
  v_v2 uuid := current_setting('suite72.v2')::uuid;
begin
  -- Se publican sobre la versión vigente y valen para la 1.
  perform public.publish_plan_conditions(v_v2, 'Condiciones del Plan 72.');
  if (select plan_id from public.plan_versions where conditions = 'Condiciones del Plan 72.') <> v_plan then
    raise exception 'RN-DAT-07 FALLIDO: las condiciones no se guardaron en el linaje' using errcode = 'assert_failure';
  end if;
end $$;

-- Casa Uno, que sigue en la versión 1, las ve como pendientes.
set local request.jwt.claim.sub = 'f1600000-0000-0000-0000-000000000003';
do $$
begin
  if (select status from public.subscription_terms((select id from public.subscriptions
        where establishment_id = 'f1640000-0000-0000-0000-000000000001' and kind = 'plan'))) <> 'pending' then
    raise exception 'RN-DAT-07 FALLIDO: quien está en una versión anterior no ve las condiciones del plan' using errcode = 'assert_failure';
  end if;
end $$;

rollback;

\echo 'Suite 72 · Versiones de planes y servicios: OK'
