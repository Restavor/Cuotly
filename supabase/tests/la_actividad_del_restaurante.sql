-- ============================================================
-- Suite 69 · La actividad del restaurante
--            (migración 128; R41; P7, RN-FIN-07)
-- ============================================================
--
-- `client_activity()` le cuenta al restaurante lo que ha pasado en un
-- periodo, leyendo la fecha de cada hecho en su tabla y sin ninguna
-- identidad. Lo que esta suite vigila:
--
--   · **Los hechos llegan con su fecha de verdad**: la de envío es la del
--     apunte `request.submitted`, y el comienzo y la publicación son los
--     del trabajo, contados por la solicitud.
--   · **Un borrador no cuenta**: no se ha enviado.
--   · **El periodo recorta**: lo de septiembre no sale en octubre.
--   · **Cada clase tiene la visibilidad de su tabla**: una persona del
--     restaurante sin "Ver facturación" (RN-FIN-07) ve sus solicitudes y
--     no los cobros ni los pagos.
--   · **Ninguna columna dice quién** (P7): la única columna uuid es la de
--     la cosa, y ningún valor es de una persona.
--   · **Un pago revertido no pasó** (RN-FIN-04).
--   · **Otro restaurante no pregunta por lo ajeno**, `anon` no puede
--     ejecutarla y un periodo al revés se rechaza.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/la_actividad_del_restaurante.sql
--
-- Prefijo de esta suite: f1300000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1300000-0000-0000-0000-000000000001', 'duena69@cuotly.test', 'authenticated', 'authenticated'),
  ('f1300000-0000-0000-0000-000000000003', 'cliente69@cuotly.test', 'authenticated', 'authenticated'),
  ('f1300000-0000-0000-0000-000000000004', 'vecino69@cuotly.test', 'authenticated', 'authenticated'),
  ('f1300000-0000-0000-0000-000000000005', 'editor69@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1300000-0000-0000-0000-000000000001', 'duena69@cuotly.test', 'Dueña 69'),
  ('f1300000-0000-0000-0000-000000000003', 'cliente69@cuotly.test', 'Cliente 69'),
  ('f1300000-0000-0000-0000-000000000004', 'vecino69@cuotly.test', 'Vecino 69'),
  ('f1300000-0000-0000-0000-000000000005', 'editor69@cuotly.test', 'Editor 69')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1310000-0000-0000-0000-000000000001', 'Espacio 69', 'espacio-69', 'Europe/Madrid',
   'f1300000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1310000-0000-0000-0000-000000000001', 'f1300000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('f1330000-0000-0000-0000-000000000001', 'f1310000-0000-0000-0000-000000000001', 'Grupo 69'),
  ('f1330000-0000-0000-0000-000000000002', 'f1310000-0000-0000-0000-000000000001', 'Grupo vecino 69');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1340000-0000-0000-0000-000000000001', 'f1310000-0000-0000-0000-000000000001',
   'f1330000-0000-0000-0000-000000000001', 'EST-69-1', 'Casa Actividad', 'active'),
  ('f1340000-0000-0000-0000-000000000002', 'f1310000-0000-0000-0000-000000000001',
   'f1330000-0000-0000-0000-000000000002', 'EST-69-2', 'Casa Vecina 69', 'active');

-- La propietaria del restaurante ve la facturación; el editor, sin el
-- permiso "Ver facturación", no (RN-FIN-07, migración 107).
insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f1340000-0000-0000-0000-000000000001', 'f1300000-0000-0000-0000-000000000003', 'local_owner'),
  ('f1340000-0000-0000-0000-000000000001', 'f1300000-0000-0000-0000-000000000005', 'editor'),
  ('f1340000-0000-0000-0000-000000000002', 'f1300000-0000-0000-0000-000000000004', 'local_owner');

insert into public.requests
  (id, space_id, establishment_id, code, state, description, created_by, created_at, accepted_at) values
  ('f1350000-0000-0000-0000-000000000001', 'f1310000-0000-0000-0000-000000000001',
   'f1340000-0000-0000-0000-000000000001', 'SOL-69-1', 'published',
   'Cambiar el horario de la web', 'f1300000-0000-0000-0000-000000000003',
   '2026-09-01 08:00+00', '2026-09-04 12:00+00'),
  -- FUERA: un borrador que nadie ha enviado.
  ('f1350000-0000-0000-0000-000000000002', 'f1310000-0000-0000-0000-000000000001',
   'f1340000-0000-0000-0000-000000000001', 'SOL-69-2', 'draft',
   'Idea a medias', 'f1300000-0000-0000-0000-000000000003', '2026-09-02 08:00+00', null);

insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, created_at) values
  ('f1310000-0000-0000-0000-000000000001', 'f1300000-0000-0000-0000-000000000003',
   'request.submitted', 'request', 'f1350000-0000-0000-0000-000000000001', '2026-09-03 09:15+00');

insert into public.jobs
  (id, space_id, establishment_id, request_id, code, state, category, assigned_to,
   started_at, started_by, published_at, published_by) values
  ('f1360000-0000-0000-0000-000000000001', 'f1310000-0000-0000-0000-000000000001',
   'f1340000-0000-0000-0000-000000000001', 'f1350000-0000-0000-0000-000000000001',
   'TRA-69-1', 'published', 'small', 'f1300000-0000-0000-0000-000000000001',
   '2026-09-05 11:30+00', 'f1300000-0000-0000-0000-000000000001',
   '2026-09-06 16:20+00', 'f1300000-0000-0000-0000-000000000001');

insert into public.charges
  (id, space_id, establishment_id, concept, period_start, period_end,
   base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_at, issued_by) values
  ('f1390000-0000-0000-0000-000000000001', 'f1310000-0000-0000-0000-000000000001',
   'f1340000-0000-0000-0000-000000000001', 'Cuota de septiembre',
   '2026-09-01T00:00:00Z', '2026-09-30T23:59:59Z',
   39900, 21, 8379, 48279, '2026-09-30T23:59:59Z', '2026-09-10T08:00:00Z',
   'f1300000-0000-0000-0000-000000000001');

insert into public.payments
  (space_id, establishment_id, charge_id, amount_cents, method, paid_at,
   recorded_by, recorded_role, reversed_at) values
  ('f1310000-0000-0000-0000-000000000001', 'f1340000-0000-0000-0000-000000000001',
   'f1390000-0000-0000-0000-000000000001', 48279, 'transfer', '2026-09-12T10:00:00Z',
   'f1300000-0000-0000-0000-000000000001', 'owner', null),
  -- FUERA: revertido (RN-FIN-04).
  ('f1310000-0000-0000-0000-000000000001', 'f1340000-0000-0000-0000-000000000001',
   'f1390000-0000-0000-0000-000000000001', 1000, 'bizum', '2026-09-13T10:00:00Z',
   'f1300000-0000-0000-0000-000000000001', 'owner', '2026-09-14T10:00:00Z');

-- ============================================================
-- P7 · la única columna uuid es la de la cosa, y anon no entra
-- ============================================================
do $$
declare
  v_uuids int;
begin
  select count(*) into v_uuids
  from pg_proc p,
       lateral unnest(p.proallargtypes, p.proargmodes) as a(tipo, modo)
  where p.proname = 'client_activity'
    and a.modo = 't'
    and a.tipo = 'uuid'::regtype;

  if v_uuids <> 1 then
    raise exception 'FALLO P7 · client_activity() devuelve % columnas uuid y solo puede devolver entity_id', v_uuids;
  end if;

  if has_function_privilege('anon', 'public.client_activity(uuid, timestamptz, timestamptz)', 'execute') then
    raise exception 'FALLO · anon puede ejecutar client_activity()';
  end if;
end $$;

-- ============================================================
-- R41 · la propietaria del restaurante recibe su mes
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1300000-0000-0000-0000-000000000003';

do $$
declare
  v_clases text[];
  v_envio timestamptz;
  v_personas int;
begin
  select array_agg(kind order by at, kind) into v_clases
  from public.client_activity('f1340000-0000-0000-0000-000000000001', '2026-09-01', '2026-10-01');

  if v_clases is distinct from array[
    'request_sent', 'request_accepted', 'work_started', 'work_published', 'charge_issued', 'payment_recorded'
  ] then
    raise exception 'FALLO R41 · los hechos del mes no son los esperados: %', v_clases;
  end if;

  select at into v_envio
  from public.client_activity('f1340000-0000-0000-0000-000000000001', '2026-09-01', '2026-10-01')
  where kind = 'request_sent';
  if v_envio is distinct from '2026-09-03 09:15+00'::timestamptz then
    raise exception 'FALLO R41 · la fecha de envío debía ser la del apunte y es %', v_envio;
  end if;

  -- P7 · ningún valor es de una persona.
  select count(*) into v_personas
  from public.client_activity('f1340000-0000-0000-0000-000000000001', '2026-09-01', '2026-10-01') a
  where a.entity_id in (
    'f1300000-0000-0000-0000-000000000001', 'f1300000-0000-0000-0000-000000000003',
    'f1300000-0000-0000-0000-000000000004', 'f1300000-0000-0000-0000-000000000005');
  if v_personas <> 0 then
    raise exception 'FALLO P7 · client_activity() ha devuelto el uuid de una persona';
  end if;

  -- El periodo recorta.
  if exists (select 1 from public.client_activity('f1340000-0000-0000-0000-000000000001', '2026-10-01', '2026-11-01')) then
    raise exception 'FALLO R41 · lo de septiembre ha salido en octubre';
  end if;

  -- Un periodo al revés no es un periodo.
  begin
    perform public.client_activity('f1340000-0000-0000-0000-000000000001', '2026-10-01', '2026-09-01');
    raise exception 'FALLO · un periodo al revés se ha aceptado';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- ============================================================
-- RN-FIN-07 · sin "Ver facturación", ni cobros ni pagos
-- ============================================================
set local request.jwt.claim.sub = 'f1300000-0000-0000-0000-000000000005';

do $$
declare
  v_clases text[];
begin
  select array_agg(distinct kind order by kind) into v_clases
  from public.client_activity('f1340000-0000-0000-0000-000000000001', '2026-09-01', '2026-10-01');

  if 'charge_issued' = any(v_clases) or 'payment_recorded' = any(v_clases) then
    raise exception 'FALLO RN-FIN-07 · un editor sin facturación ve cobros o pagos: %', v_clases;
  end if;
  if not 'request_sent' = any(v_clases) then
    raise exception 'FALLO R41 · el editor no ve la actividad de las solicitudes: %', v_clases;
  end if;
end $$;

-- ============================================================
-- Otro restaurante del mismo espacio no pregunta por lo ajeno
-- ============================================================
set local request.jwt.claim.sub = 'f1300000-0000-0000-0000-000000000004';

do $$
begin
  begin
    perform public.client_activity('f1340000-0000-0000-0000-000000000001', '2026-09-01', '2026-10-01');
    raise exception 'FALLO · el restaurante vecino ha leído la actividad de otro';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

rollback;
