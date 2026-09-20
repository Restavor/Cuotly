-- ============================================================
-- Suite 63 · El plan puede acortar el plazo de realización
--            (migración 118; RN-SLA-18; decisión 61)
-- ============================================================
--
--   · RN-SLA-18: el plazo sale de la columna del plan que corresponde a la
--     CATEGORÍA del cambio, y se congela en el trabajo al aceptarlo.
--   · RN-SLA-18, RN-COM-15: cambiar de plan después NO reescribe el plazo
--     de un trabajo que ya está corriendo.
--   · Sin plan vigente se queda a null, que significa "el de RN-SLA-12".
--   · Los dos contadores —el del barrido de avisos y el del Inicio del
--     espacio— devuelven el congelado, no el del plan de hoy.
--
-- **Por qué los dos contadores y no solo uno:** si el barrido mide con el
-- plazo nuevo y el Inicio con el viejo, el equipo ve "va sobrado" en una
-- pantalla y recibe un aviso de vencimiento por correo. Dos relojes
-- distintos para el mismo trabajo es peor que uno mal, porque deja de
-- fiarse de los dos.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plazo_de_realizacion_del_plan.sql
--
-- Prefijo de esta suite: d0800000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('d0800000-0000-0000-0000-000000000001', 'duena63@cuotly.test', 'authenticated', 'authenticated'),
  ('d0800000-0000-0000-0000-000000000002', 'cliente63@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d0800000-0000-0000-0000-000000000001', 'duena63@cuotly.test', 'Dueña 63'),
  ('d0800000-0000-0000-0000-000000000002', 'cliente63@cuotly.test', 'Cliente 63')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('d0810000-0000-0000-0000-000000000001', 'Espacio 63', 'espacio-63', 'Europe/Madrid',
   'd0800000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d0810000-0000-0000-0000-000000000001', 'd0800000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('d0830000-0000-0000-0000-000000000001', 'd0810000-0000-0000-0000-000000000001', 'Grupo 63');

-- Los dos planes que se comparan. El alto lleva los números de Bosco del
-- 20/09/2026; el bajo se queda con los de la tabla de RN-SLA-12.
insert into public.plans
  (id, space_id, name, price_cents, included_small, included_photo, included_medium,
   included_large, start_sla_hours, grants_priority,
   execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large) values
  ('d0820000-0000-0000-0000-000000000001', 'd0810000-0000-0000-0000-000000000001',
   'Premium+ 63', 59900, 20, 15, 4, 1, 24, true, 48, 48, 72, 96),
  ('d0820000-0000-0000-0000-000000000002', 'd0810000-0000-0000-0000-000000000001',
   'Básico 63', 9900, 20, 15, 4, 1, 48, false, 72, 72, 72, 120);

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('d0840000-0000-0000-0000-000000000001', 'd0810000-0000-0000-0000-000000000001',
   'd0830000-0000-0000-0000-000000000001', 'EST-63-1', 'Casa del Plazo', 'active'),
  -- Sin plan a propósito: es el caso en que el plazo tiene que quedarse a
  -- null y valer el de la tabla.
  ('d0840000-0000-0000-0000-000000000002', 'd0810000-0000-0000-0000-000000000001',
   'd0830000-0000-0000-0000-000000000001', 'EST-63-2', 'Sin Plan', 'active');

insert into public.subscriptions (space_id, establishment_id, kind, plan_id, status) values
  ('d0810000-0000-0000-0000-000000000001', 'd0840000-0000-0000-0000-000000000001', 'plan',
   'd0820000-0000-0000-0000-000000000001', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('d0840000-0000-0000-0000-000000000001', 'd0800000-0000-0000-0000-000000000002', 'local_owner'),
  ('d0840000-0000-0000-0000-000000000002', 'd0800000-0000-0000-0000-000000000002', 'local_owner');

-- Cuatro solicitudes listas para aceptar, una por categoría, y una quinta
-- en el restaurante sin plan.
insert into public.requests
  (id, space_id, establishment_id, code, state, description, validated_category, created_by) values
  ('d0850000-0000-0000-0000-000000000001', 'd0810000-0000-0000-0000-000000000001',
   'd0840000-0000-0000-0000-000000000001', 'SOL-63-1', 'pending_client_acceptance',
   'Cambiar el precio del menú', 'small', 'd0800000-0000-0000-0000-000000000002'),
  ('d0850000-0000-0000-0000-000000000002', 'd0810000-0000-0000-0000-000000000001',
   'd0840000-0000-0000-0000-000000000001', 'SOL-63-2', 'pending_client_acceptance',
   'Fotos de los postres', 'photo', 'd0800000-0000-0000-0000-000000000002'),
  ('d0850000-0000-0000-0000-000000000003', 'd0810000-0000-0000-0000-000000000001',
   'd0840000-0000-0000-0000-000000000001', 'SOL-63-3', 'pending_client_acceptance',
   'Rehacer la página de reservas', 'medium', 'd0800000-0000-0000-0000-000000000002'),
  ('d0850000-0000-0000-0000-000000000004', 'd0810000-0000-0000-0000-000000000001',
   'd0840000-0000-0000-0000-000000000001', 'SOL-63-4', 'pending_client_acceptance',
   'Rediseño entero', 'large', 'd0800000-0000-0000-0000-000000000002'),
  ('d0850000-0000-0000-0000-000000000005', 'd0810000-0000-0000-0000-000000000001',
   'd0840000-0000-0000-0000-000000000002', 'SOL-63-5', 'pending_client_acceptance',
   'Un cambio sin plan', 'small', 'd0800000-0000-0000-0000-000000000002');

-- ============================================================
-- RN-SLA-18 · el plazo se congela al aceptar, por categoría
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0800000-0000-0000-0000-000000000002', true);

do $$
begin
  perform public.accept_request('d0850000-0000-0000-0000-000000000001');
  perform public.accept_request('d0850000-0000-0000-0000-000000000002');
  perform public.accept_request('d0850000-0000-0000-0000-000000000003');
  perform public.accept_request('d0850000-0000-0000-0000-000000000004');
  perform public.accept_request('d0850000-0000-0000-0000-000000000005');
end;
$$;

set local role postgres;

do $$
declare
  v_hours integer;
begin
  -- Cada categoría con SU columna. Confundirlas es el fallo silencioso de
  -- esta migración: el plazo sería plausible y estaría mal.
  select execution_sla_hours into v_hours from public.jobs
  where request_id = 'd0850000-0000-0000-0000-000000000001';
  if v_hours is distinct from 48 then
    raise exception 'RN-SLA-18 FALLA: un cambio pequeño de Premium+ congeló % h, esperaba 48', v_hours;
  end if;

  select execution_sla_hours into v_hours from public.jobs
  where request_id = 'd0850000-0000-0000-0000-000000000002';
  if v_hours is distinct from 48 then
    raise exception 'RN-SLA-18 FALLA: una fotografía de Premium+ congeló % h, esperaba 48', v_hours;
  end if;

  -- El mediano NO baja: Bosco lo dejó en 1–3 días a propósito.
  select execution_sla_hours into v_hours from public.jobs
  where request_id = 'd0850000-0000-0000-0000-000000000003';
  if v_hours is distinct from 72 then
    raise exception 'RN-SLA-18 FALLA: un mediano de Premium+ congeló % h, esperaba 72', v_hours;
  end if;

  select execution_sla_hours into v_hours from public.jobs
  where request_id = 'd0850000-0000-0000-0000-000000000004';
  if v_hours is distinct from 96 then
    raise exception 'RN-SLA-18 FALLA: un grande de Premium+ congeló % h, esperaba 96', v_hours;
  end if;

  -- Sin plan vigente no hay a quién preguntarle el plazo: se queda a null,
  -- y `src/core/sla-timers.ts` lo lee como "el de RN-SLA-12". Poner aquí
  -- un 72 sería inventarse un plan que no existe.
  select execution_sla_hours into v_hours from public.jobs
  where request_id = 'd0850000-0000-0000-0000-000000000005';
  if v_hours is not null then
    raise exception 'RN-SLA-18 FALLA: un establecimiento sin plan congeló % h en vez de null', v_hours;
  end if;
end;
$$;

-- ============================================================
-- RN-SLA-18, RN-COM-15 · cambiar de plan no reescribe lo aceptado
-- ============================================================
do $$
declare
  v_hours integer;
begin
  -- El restaurante baja a Básico DESPUÉS de que le acepten los cambios.
  update public.subscriptions
  set plan_id = 'd0820000-0000-0000-0000-000000000002'
  where establishment_id = 'd0840000-0000-0000-0000-000000000001' and kind = 'plan';

  select execution_sla_hours into v_hours from public.jobs
  where request_id = 'd0850000-0000-0000-0000-000000000001';

  -- Sigue siendo 48: el compromiso se adquirió con el plan de entonces.
  -- Si esto devolviera 72, bajar de plan alargaría a mitad de camino el
  -- plazo de todo lo que está en marcha, y el equipo vería desaparecer
  -- avisos de trabajos que iban justos.
  if v_hours is distinct from 48 then
    raise exception 'RN-COM-15 FALLA: bajar de plan reescribió el plazo de un trabajo aceptado (% h)', v_hours;
  end if;
end;
$$;

-- ============================================================
-- Los dos contadores dicen lo mismo (RN-SLA-15, RN-SLA-18)
-- ============================================================
do $$
declare
  v_job_id uuid;
  v_barrido integer;
  v_inicio integer;
begin
  select id into v_job_id from public.jobs
  where request_id = 'd0850000-0000-0000-0000-000000000001';

  -- Un evento de T3 para que el trabajo aparezca en los dos contadores.
  insert into public.timer_events
    (space_id, entity_type, entity_id, counter_kind, event_type, occurred_at)
  values
    ('d0810000-0000-0000-0000-000000000001', 'job', v_job_id, 't3', 'started',
     '2026-09-07T07:00:00Z');

  update public.jobs set state = 'in_progress' where id = v_job_id;

  select c.execution_sla_hours into v_barrido
  from public.sla_sweep_counters('d0810000-0000-0000-0000-000000000001') c
  where c.job_id = v_job_id and c.counter_kind = 't3';

  select c.execution_sla_hours into v_inicio
  from public.space_job_counters('d0810000-0000-0000-0000-000000000001') c
  where c.job_id = v_job_id and c.counter_kind = 't3';

  if v_barrido is distinct from 48 then
    raise exception 'RN-SLA-18 FALLA: el barrido de avisos mide con % h en vez de 48', v_barrido;
  end if;

  -- Y el del Inicio. Esta comprobación existe porque el typecheck encontró
  -- que el plazo se lee en TRES sitios y no en uno.
  if v_inicio is distinct from 48 then
    raise exception 'RN-SLA-18 FALLA: el Inicio del espacio mide con % h en vez de 48', v_inicio;
  end if;
end;
$$;

-- ============================================================
-- El relleno de la migración y lo que NO toca
-- ============================================================
do $$
declare
  v_otros integer;
begin
  -- Solo baja en el plan alto. Si el `update` de la migración no llevara
  -- `where grants_priority`, todos los planes del mundo habrían bajado de
  -- plazo de golpe.
  select count(*) into v_otros from public.plans
  where not grants_priority and (execution_sla_small <> 72 or execution_sla_large <> 120);

  if v_otros > 0 then
    raise exception 'RN-SLA-18 FALLA: % planes sin prioridad tienen plazos acortados', v_otros;
  end if;

  -- Y ningún plazo puede ser cero o negativo: eso no es "más rápido", es
  -- un trabajo fuera de plazo desde el segundo cero.
  if exists (select 1 from public.plans where execution_sla_small <= 0 or execution_sla_large <= 0) then
    raise exception 'RN-SLA-18 FALLA: hay un plazo de realización menor o igual que cero';
  end if;
end;
$$;

rollback;
