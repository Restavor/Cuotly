-- ============================================================
-- Suite 68 · El seguimiento de la solicitud, con sus fechas
--            (migración 127; R08, R11; P7)
-- ============================================================
--
-- `client_request_milestones()` le da al restaurante las fechas del
-- camino de su solicitud que no puede leer de las tablas: cuándo se
-- envió (`audit_log`) y cuándo empezó, se publicó, se cerró o se canceló
-- el trabajo (`jobs`). Lo que esta suite vigila:
--
--   · **El restaurante recibe sus fechas**, las de verdad, y la de envío
--     es la del apunte `request.submitted`, no la de creación del
--     borrador.
--   · **Ninguna columna dice quién** (P7): la función no devuelve ningún
--     `uuid`.
--   · **Otro restaurante del mismo espacio no puede preguntar** por una
--     solicitud que no es suya, y la puerta del equipo es la misma que la
--     de `client_request_job()`.
--   · **Sin trabajo, sale una fila vacía** y no un error: la pantalla
--     dice "sin fecha todavía".
--   · **La cancelación del restaurante** (R12, que no crea trabajo) tiene
--     su fecha.
--   · **`anon` no puede ejecutarla** (CLAUDE.md: nunca solo `from public`).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_seguimiento_de_la_solicitud.sql
--
-- Prefijo de esta suite: f1200000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1200000-0000-0000-0000-000000000001', 'duena68@cuotly.test', 'authenticated', 'authenticated'),
  ('f1200000-0000-0000-0000-000000000002', 'ajeno68@cuotly.test', 'authenticated', 'authenticated'),
  ('f1200000-0000-0000-0000-000000000003', 'cliente68@cuotly.test', 'authenticated', 'authenticated'),
  ('f1200000-0000-0000-0000-000000000004', 'vecino68@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1200000-0000-0000-0000-000000000001', 'duena68@cuotly.test', 'Dueña 68'),
  ('f1200000-0000-0000-0000-000000000002', 'ajeno68@cuotly.test', 'Trabajador Ajeno 68'),
  ('f1200000-0000-0000-0000-000000000003', 'cliente68@cuotly.test', 'Cliente 68'),
  ('f1200000-0000-0000-0000-000000000004', 'vecino68@cuotly.test', 'Vecino 68')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1210000-0000-0000-0000-000000000001', 'Espacio 68', 'espacio-68', 'Europe/Madrid',
   'f1200000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1210000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000001', 'owner', 'active'),
  -- Del espacio, pero sin este restaurante autorizado.
  ('f1210000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000002', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('f1230000-0000-0000-0000-000000000001', 'f1210000-0000-0000-0000-000000000001', 'Grupo 68'),
  ('f1230000-0000-0000-0000-000000000002', 'f1210000-0000-0000-0000-000000000001', 'Grupo vecino 68');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1240000-0000-0000-0000-000000000001', 'f1210000-0000-0000-0000-000000000001',
   'f1230000-0000-0000-0000-000000000001', 'EST-68-1', 'Casa Seguimiento', 'active'),
  ('f1240000-0000-0000-0000-000000000002', 'f1210000-0000-0000-0000-000000000001',
   'f1230000-0000-0000-0000-000000000002', 'EST-68-2', 'Casa Vecina', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f1240000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000003', 'local_owner'),
  ('f1240000-0000-0000-0000-000000000002', 'f1200000-0000-0000-0000-000000000004', 'local_owner');

-- Una publicada (con trabajo) y otra cancelada por el restaurante (sin él).
insert into public.requests
  (id, space_id, establishment_id, code, state, description, created_by, created_at) values
  ('f1250000-0000-0000-0000-000000000001', 'f1210000-0000-0000-0000-000000000001',
   'f1240000-0000-0000-0000-000000000001', 'SOL-68-1', 'published',
   'Cambiar el horario de la web', 'f1200000-0000-0000-0000-000000000003', '2026-09-01 08:00+00'),
  ('f1250000-0000-0000-0000-000000000002', 'f1210000-0000-0000-0000-000000000001',
   'f1240000-0000-0000-0000-000000000001', 'SOL-68-2', 'cancelled_before_start',
   'Quitar la carta de verano', 'f1200000-0000-0000-0000-000000000003', '2026-09-02 08:00+00');

-- El borrador se creó el 1 y se envió el 3: la fecha de envío es la del 3.
insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, created_at) values
  ('f1210000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000003',
   'request.submitted', 'request', 'f1250000-0000-0000-0000-000000000001', '2026-09-03 09:15+00'),
  ('f1210000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000003',
   'request.submitted', 'request', 'f1250000-0000-0000-0000-000000000002', '2026-09-02 08:05+00'),
  ('f1210000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000003',
   'request.cancelled', 'request', 'f1250000-0000-0000-0000-000000000002', '2026-09-04 10:00+00');

insert into public.jobs
  (id, space_id, establishment_id, request_id, code, state, category, assigned_to,
   started_at, started_by, published_at, published_by) values
  ('f1260000-0000-0000-0000-000000000001', 'f1210000-0000-0000-0000-000000000001',
   'f1240000-0000-0000-0000-000000000001', 'f1250000-0000-0000-0000-000000000001',
   'TRA-68-1', 'published', 'small', 'f1200000-0000-0000-0000-000000000001',
   '2026-09-05 11:30+00', 'f1200000-0000-0000-0000-000000000001',
   '2026-09-06 16:20+00', 'f1200000-0000-0000-0000-000000000001');

-- ============================================================
-- P7 · la función no devuelve ninguna identidad
-- ============================================================
do $$
declare
  v_uuids int;
begin
  select count(*) into v_uuids
  from pg_proc p,
       lateral unnest(p.proallargtypes, p.proargmodes) as a(tipo, modo)
  where p.proname = 'client_request_milestones'
    and a.modo = 't'
    and a.tipo = 'uuid'::regtype;

  if v_uuids <> 0 then
    raise exception 'FALLO P7 · client_request_milestones() devuelve % columnas uuid', v_uuids;
  end if;

  if has_function_privilege('anon', 'public.client_request_milestones(uuid)', 'execute') then
    raise exception 'FALLO · anon puede ejecutar client_request_milestones()';
  end if;
end $$;

-- ============================================================
-- R08 y R11 · el restaurante recibe sus fechas
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1200000-0000-0000-0000-000000000003';

do $$
declare
  v record;
begin
  select * into v from public.client_request_milestones('f1250000-0000-0000-0000-000000000001');

  if v.submitted_at is distinct from '2026-09-03 09:15+00'::timestamptz then
    raise exception 'FALLO R08 · la fecha de envío debía ser la del apunte y es %', v.submitted_at;
  end if;
  if v.started_at is distinct from '2026-09-05 11:30+00'::timestamptz then
    raise exception 'FALLO R11 · la fecha de comienzo no es la del trabajo: %', v.started_at;
  end if;
  if v.published_at is distinct from '2026-09-06 16:20+00'::timestamptz then
    raise exception 'FALLO R11 · la fecha de publicación no es la del trabajo: %', v.published_at;
  end if;
  if v.closed_at is not null or v.cancelled_at is not null then
    raise exception 'FALLO R11 · una solicitud publicada no está cerrada ni cancelada';
  end if;

  -- R12 · cancelada por el restaurante antes de ser trabajo.
  select * into v from public.client_request_milestones('f1250000-0000-0000-0000-000000000002');
  if v.cancelled_at is distinct from '2026-09-04 10:00+00'::timestamptz then
    raise exception 'FALLO R12 · la cancelación sin trabajo no trae su fecha: %', v.cancelled_at;
  end if;
  if v.started_at is not null or v.published_at is not null then
    raise exception 'FALLO R12 · sin trabajo no hay comienzo ni publicación';
  end if;
end $$;

-- ============================================================
-- Otro restaurante del mismo espacio no pregunta por lo ajeno
-- ============================================================
set local request.jwt.claim.sub = 'f1200000-0000-0000-0000-000000000004';

do $$
begin
  begin
    perform public.client_request_milestones('f1250000-0000-0000-0000-000000000001');
    raise exception 'FALLO · el restaurante vecino ha leído las fechas de una solicitud ajena';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- ============================================================
-- La puerta es la de `client_request_job()`, ni más ancha ni más
-- estrecha: quien del equipo pueda leer el trabajo puede leer sus fechas
-- y quien no, no. Aquí no se inventa una regla de visibilidad nueva.
-- ============================================================
set local request.jwt.claim.sub = 'f1200000-0000-0000-0000-000000000002';

do $$
declare
  v_trabajo boolean := true;
  v_fechas boolean := true;
begin
  begin
    perform public.client_request_job('f1250000-0000-0000-0000-000000000001');
  exception when others then
    v_trabajo := false;
  end;
  begin
    perform public.client_request_milestones('f1250000-0000-0000-0000-000000000001');
  exception when others then
    v_fechas := false;
  end;
  if v_trabajo <> v_fechas then
    raise exception 'FALLO · las fechas (%) y el trabajo (%) no tienen la misma puerta', v_fechas, v_trabajo;
  end if;
end $$;

-- ============================================================
-- Quien lleva el espacio sí, que es la misma puerta de siempre
-- ============================================================
set local request.jwt.claim.sub = 'f1200000-0000-0000-0000-000000000001';

do $$
declare
  v_enviada timestamptz;
begin
  select submitted_at into v_enviada
  from public.client_request_milestones('f1250000-0000-0000-0000-000000000001');
  if v_enviada is null then
    raise exception 'FALLO · la propietaria del espacio no recibe la fecha de envío';
  end if;
end $$;

rollback;
