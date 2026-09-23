-- ============================================================
-- Suite 74 · Lo que el equipo hace en nombre del restaurante no deja su
--            identidad a la vista del restaurante (P7; decisiones 21 y 73)
-- ============================================================
--
-- El barrido de identidad de `hito7_mensajes_archivos_finanzas.sql` solo
-- ejercita una columna si el fixture tiene filas en ella (lo dice su
-- propio LÍMITE). Ninguna suite tenía filas creadas por el equipo EN
-- NOMBRE del restaurante, y ahí es donde el equipo escribe en tablas cuya
-- fila es del restaurante:
--
--   · `accept_quote()` en su nombre (decisión 21), sin solicitud previa:
--     crea la solicitud (`requests.created_by`) y la acepta
--     (`requests.accepted_by`, `acceptances.accepted_by`).
--   · `accept_quote()` en su nombre sobre una solicitud que ya existía:
--     la acepta.
--   · `create_request_on_behalf()` (decisión 73, migración 132).
--   · `record_external_terms_acceptance()` (migración 75).
--
-- Esta suite recorre las cuatro y después, sentada como el restaurante,
-- barre TODA columna uuid o de texto de `public` buscando el uuid o el
-- correo de alguien del equipo. Si una ruta nueva en su nombre escribe
-- identidad en una columna que el restaurante lee, aquí se pone rojo.
--
-- Prefijo de esta suite: d7400000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('d7400000-0000-0000-0000-000000000001', 'duena@suite74.test', 'authenticated', 'authenticated'),
  ('d7400000-0000-0000-0000-000000000002', 'admin@suite74.test', 'authenticated', 'authenticated'),
  ('d7400000-0000-0000-0000-000000000004', 'cliente@suite74.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d7400000-0000-0000-0000-000000000001', 'duena@suite74.test', 'Dueña 74'),
  ('d7400000-0000-0000-0000-000000000002', 'admin@suite74.test', 'Admin 74'),
  ('d7400000-0000-0000-0000-000000000004', 'cliente@suite74.test', 'Cliente 74')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by)
values ('d7400000-0000-0000-0000-000000000010', 'Espacio 74', 'espacio-74', 'Europe/Madrid',
        'd7400000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d7400000-0000-0000-0000-000000000010', 'd7400000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d7400000-0000-0000-0000-000000000010', 'd7400000-0000-0000-0000-000000000002', 'admin', 'active');

insert into public.groups (id, space_id, name)
values ('d7400000-0000-0000-0000-000000000015', 'd7400000-0000-0000-0000-000000000010', 'Grupo 74');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('d7400000-0000-0000-0000-000000000020', 'd7400000-0000-0000-0000-000000000010',
   'd7400000-0000-0000-0000-000000000015', 'R74', 'Magariños 74', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('d7400000-0000-0000-0000-000000000020', 'd7400000-0000-0000-0000-000000000004', 'local_owner');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo,
                          included_medium, included_large, start_sla_hours) values
  ('d7400000-0000-0000-0000-000000000030', 'd7400000-0000-0000-0000-000000000010', 'Plan 74',
   29900, 5, 0, 1, 0, 24);

-- El contrato firmado fuera, que acompaña a la aceptación externa.
insert into public.files (id, space_id, group_id, establishment_id, category, visibility, name, created_by) values
  ('d7400000-0000-0000-0000-000000000040', 'd7400000-0000-0000-0000-000000000010',
   'd7400000-0000-0000-0000-000000000015', 'd7400000-0000-0000-0000-000000000020',
   'documents', 'internal', 'contrato.pdf', 'd7400000-0000-0000-0000-000000000001');

create temp table s74 (k text primary key, v uuid);
grant select, insert, update on s74 to authenticated;

-- ------------------------------------------------------------
-- El restaurante pide un cambio que se presupuesta aparte.
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'd7400000-0000-0000-0000-000000000001';

do $$
declare
  v_sub uuid;
  v_version uuid;
begin
  v_sub := public.create_plan_subscription(
    'd7400000-0000-0000-0000-000000000020', 'd7400000-0000-0000-0000-000000000030');
  insert into s74 values ('sub', v_sub);

  -- Migración 75 · las condiciones, aceptadas fuera y registradas por el equipo.
  v_version := public.publish_plan_conditions('d7400000-0000-0000-0000-000000000030', 'Condiciones del plan 74.');
  perform public.record_external_terms_acceptance(
    v_sub, v_version, current_date - 10, 'd7400000-0000-0000-0000-000000000040');
end;
$$;

set local "request.jwt.claim.sub" = 'd7400000-0000-0000-0000-000000000004';
do $$
declare
  v_req uuid;
begin
  v_req := public.create_request_draft(
    'd7400000-0000-0000-0000-000000000020', 'Una sección nueva de eventos', null, 'medium', 'Para la temporada.');
  perform public.submit_request(v_req);
  insert into s74 values ('req_cliente', v_req);
end;
$$;

-- ------------------------------------------------------------
-- Decisión 21 · el equipo acepta DOS presupuestos en su nombre: uno sin
-- solicitud (la crea `accept_quote()`) y otro sobre la del restaurante.
-- ------------------------------------------------------------
set local "request.jwt.claim.sub" = 'd7400000-0000-0000-0000-000000000002';
do $$
declare
  v_req uuid := (select v from s74 where k = 'req_cliente');
  v_q uuid;
begin
  -- La del restaurante: validada como grande, que su plan no incluye.
  perform public.begin_request_analysis(v_req);
  set local role postgres;
  update public.requests set state = 'pending_internal_validation' where id = v_req;
  set local role authenticated;
  perform public.validate_classification(v_req, 'large', 'Sección nueva de eventos.');

  v_q := public.create_quote('d7400000-0000-0000-0000-000000000020', 'Sección de eventos', 30000, 'job',
                             'large', null, v_req, false);
  perform public.send_quote(v_q);
  perform public.accept_quote(v_q, 'Aceptado por teléfono el 22/09 con la propietaria');

  -- Sin solicitud: nace al aceptar.
  v_q := public.create_quote('d7400000-0000-0000-0000-000000000020', 'Sesión de fotos', 15000, 'job',
                             'photo', 'Diez platos nuevos', null, false);
  perform public.send_quote(v_q);
  perform public.accept_quote(v_q, 'Aceptado por correo el 21/09');
  insert into s74 values ('q_sin_solicitud', v_q);

  -- Decisión 73 · y una solicitud creada en su nombre, que el equipo
  -- valida y el RESTAURANTE acepta.
  v_q := public.create_request_on_behalf(
    'd7400000-0000-0000-0000-000000000020', 'Cambiar el teléfono de la web', 'low', 'Cuando podáis.',
    'Por WhatsApp el 23/09.', 'suite74-1', null, 'small');
  perform public.validate_classification(v_q, 'small', 'Cambiar el teléfono de la web.');
  insert into s74 values ('req_equipo', v_q);
end;
$$;

set local "request.jwt.claim.sub" = 'd7400000-0000-0000-0000-000000000004';
do $$
begin
  perform public.accept_request((select v from s74 where k = 'req_equipo'));
end;
$$;
set local "request.jwt.claim.sub" = 'd7400000-0000-0000-0000-000000000002';

-- El fixture no es vacuo: las tres rutas escribieron donde se busca.
set local role postgres;
do $$
declare
  v_req uuid := (select request_id from public.quotes where id = (select v from s74 where k = 'q_sin_solicitud'));
begin
  if v_req is null then
    raise exception 'FIXTURE: accept_quote() no creó la solicitud';
  end if;
  if (select state from public.requests where id = v_req) <> 'accepted'
     or (select state from public.requests where id = (select v from s74 where k = 'req_cliente')) <> 'accepted' then
    raise exception 'FIXTURE: los presupuestos aceptados por el equipo no dejaron las solicitudes aceptadas';
  end if;
  if not exists (select 1 from public.acceptances where request_id = v_req) then
    raise exception 'FIXTURE: no hay fila de aceptación que barrer';
  end if;
  if not exists (select 1 from public.terms_acceptances
                 where subscription_id = (select v from s74 where k = 'sub')) then
    raise exception 'FIXTURE: no hay aceptación externa de condiciones que barrer';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Decisiones 21 y 73 · la solicitud que crea el equipo en su nombre está
-- marcada como tal, con el motivo que dio al aceptar.
-- ------------------------------------------------------------
do $$
declare
  v_req uuid := (select request_id from public.quotes where id = (select v from s74 where k = 'q_sin_solicitud'));
begin
  if (select created_by_team from public.requests where id = v_req) is not true
     or (select on_behalf_reason from public.requests where id = v_req) <> 'Aceptado por correo el 21/09' then
    raise exception 'Decisión 21 FALLIDA: la solicitud que nace de un presupuesto aceptado por el equipo no está marcada como creada en su nombre';
  end if;

  -- Y al revés: cuando acepta el restaurante, queda quién fue. Vaciar
  -- `accepted_by` siempre también pasaría el barrido, y no es lo que se
  -- quiere.
  if (select accepted_by from public.requests where id = (select v from s74 where k = 'req_equipo'))
       is distinct from 'd7400000-0000-0000-0000-000000000004'
     or (select accepted_by from public.acceptances where request_id = (select v from s74 where k = 'req_equipo'))
       is distinct from 'd7400000-0000-0000-0000-000000000004' then
    raise exception 'FALLIDO: cuando acepta el restaurante ya no queda quién aceptó';
  end if;

  -- Decisión 21 · las dos aceptaciones del equipo quedan sin nadie en la
  -- columna, y el actor sigue en la auditoría.
  if exists (select 1 from public.requests r
             join public.quotes q on q.request_id = r.id
             where q.decided_by_team and r.accepted_by is not null) then
    raise exception 'P7 FALLIDO: una aceptación registrada por el equipo deja su nombre en requests.accepted_by';
  end if;
  if (select count(*) from public.audit_log
      where action = 'quote.accepted' and actor_id = 'd7400000-0000-0000-0000-000000000002'
        and (new_value ->> 'on_behalf_of_client')::boolean) <> 2 then
    raise exception 'FALLIDO: la auditoría no dice quién del equipo aceptó en su nombre';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- P7 · el barrido, sentado como el restaurante
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'd7400000-0000-0000-0000-000000000004';

do $$
declare
  v_col record;
  v_hit text;
  v_expuestas text := '';
  v_equipo uuid[] := array[
    'd7400000-0000-0000-0000-000000000001'::uuid,
    'd7400000-0000-0000-0000-000000000002'::uuid
  ];
  v_textos text[] := array['duena@suite74.test', 'admin@suite74.test', 'Dueña 74', 'Admin 74'];
begin
  -- Que el restaurante ve sus filas: sin esto el barrido sería vacuo.
  if (select count(*) from public.requests where establishment_id = 'd7400000-0000-0000-0000-000000000020') < 3 then
    raise exception 'FIXTURE: el restaurante no ve sus tres solicitudes';
  end if;

  for v_col in
    select c.relname as tabla, a.attname as columna, t.typname as tipo
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public' and c.relkind = 'r'
      and t.typname in ('uuid', 'text', 'varchar')
      -- Las tablas del espacio que el cliente lee por ser suyas, con la
      -- identidad del EQUIPO legítimamente fuera: `spaces.created_by` es
      -- quien creó el espacio de mantenimiento, no alguien que haga
      -- trabajo en su restaurante, y ya la vigila el barrido de hito7.
      and not (c.relname = 'spaces' and a.attname = 'created_by')
    order by 1, 2
  loop
    begin
      if v_col.tipo = 'uuid' then
        execute format('select %I::text from public.%I where %I = any($1) limit 1',
                       v_col.columna, v_col.tabla, v_col.columna)
          into v_hit using v_equipo;
      else
        execute format('select %I from public.%I where %I = any($1) limit 1',
                       v_col.columna, v_col.tabla, v_col.columna)
          into v_hit using v_textos || (select array_agg(u::text) from unnest(v_equipo) u);
      end if;

      if v_hit is not null then
        v_expuestas := v_expuestas || ' ' || v_col.tabla || '.' || v_col.columna;
      end if;
    exception
      when insufficient_privilege then null;
    end;
  end loop;

  if v_expuestas <> '' then
    raise exception 'P7 FALLIDO: lo hecho en nombre del restaurante le deja ver quién del equipo fue en:%', v_expuestas
      using errcode = 'assert_failure';
  end if;
end;
$$;

rollback;
