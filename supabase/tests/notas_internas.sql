-- Las notas internas, y las tres visibilidades de RN-EST-13.
--
-- La regla: "las notas internas las ven propietario y administradores en
-- su totalidad; los trabajadores solo las notas operativas de sus
-- establecimientos autorizados; los clientes nunca". Aquí se comprueban
-- las tres, y la tercera dos veces: RN-MSG-04 marca como **fallo grave**
-- mezclar lo interno con lo que ve el cliente, así que no basta con que la
-- pantalla no lo enseñe — la base tiene que negarlo.
--
-- Y la decisión de producto del 11/09/2026: el interruptor por nota, con
-- su condición — marcar una nota como NO operativa exige `manage_clients`,
-- porque un trabajador que pudiera hacerlo dejaría de ver su propia nota
-- en el acto.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/notas_internas.sql

-- ============================================================
-- Fixture: un espacio con propietaria, un administrador, dos trabajadores
-- (uno con el restaurante autorizado y otro no) y un cliente.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('bd000000-0000-0000-0000-000000000001', 'nota-owner@example.com', 'authenticated', 'authenticated'),
  ('bd000000-0000-0000-0000-000000000002', 'nota-admin@example.com', 'authenticated', 'authenticated'),
  ('bd000000-0000-0000-0000-000000000003', 'nota-worker@example.com', 'authenticated', 'authenticated'),
  ('bd000000-0000-0000-0000-000000000004', 'nota-otro@example.com', 'authenticated', 'authenticated'),
  ('bd000000-0000-0000-0000-000000000005', 'nota-cliente@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('bd100000-0000-0000-0000-000000000001', 'Espacio Notas', 'espacio-notas-test',
   'bd000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('bd100000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('bd100000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('bd100000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('bd100000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000004', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('bd300000-0000-0000-0000-000000000001', 'bd100000-0000-0000-0000-000000000001', 'Grupo Notas');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('bd400000-0000-0000-0000-000000000001', 'bd100000-0000-0000-0000-000000000001',
   'bd300000-0000-0000-0000-000000000001', 'EST-NOTA-A', 'Restaurante Notas', 'active');

-- El trabajador 3 tiene el restaurante autorizado; el 4 no.
insert into public.worker_establishments (space_id, user_id, establishment_id) values
  ('bd100000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000003',
   'bd400000-0000-0000-0000-000000000001');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('bd500000-0000-0000-0000-000000000001', 'bd400000-0000-0000-0000-000000000001',
   'bd000000-0000-0000-0000-000000000005', 'local_owner');

-- ============================================================
-- La propietaria escribe las dos clases de nota.
-- ============================================================
select set_config('request.jwt.claim.sub', 'bd000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_operativa uuid;
  v_reservada uuid;
begin
  v_operativa := public.create_establishment_note(
    'bd400000-0000-0000-0000-000000000001', 'Revisar el enlace de la carta en móvil', true);
  v_reservada := public.create_establishment_note(
    'bd400000-0000-0000-0000-000000000001', 'Renegociar el plan en la próxima renovación', false);

  if v_operativa is null or v_reservada is null then
    raise exception 'FALLIDO: no se ha podido escribir alguna de las dos notas'
      using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.establishment_notes) <> 2 then
    raise exception 'FALLIDO: la propietaria no ve sus dos notas'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- El administrador ve las dos: "en su totalidad".
-- ============================================================
select set_config('request.jwt.claim.sub', 'bd000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  if (select count(*) from public.establishment_notes) <> 2 then
    raise exception 'FALLIDO: un administrador tiene que ver las dos notas (RN-EST-13)'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- El trabajador autorizado ve SOLO la operativa.
-- ============================================================
select set_config('request.jwt.claim.sub', 'bd000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare v_cuerpos text;
begin
  select string_agg(body, ' | ' order by body) into v_cuerpos
  from public.establishment_notes;

  if v_cuerpos is distinct from 'Revisar el enlace de la carta en móvil' then
    raise exception 'FALLIDO: el trabajador ve "%" y solo debería ver la operativa (RN-EST-13)', coalesce(v_cuerpos, '(nada)')
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y no puede reservarse una nota para el propietario: escribirla y dejar
-- de verla en el acto sería una trampa, no un permiso.
do $$
declare v_error text := '';
begin
  begin
    perform public.create_establishment_note(
      'bd400000-0000-0000-0000-000000000001', 'Nota que no debería poder reservar', false);
    v_error := 'un trabajador ha podido marcar una nota como no operativa';
  exception when others then
      -- Comprobar POR QUÉ falló. Tragarse cualquier error hace que el
      -- test pase también cuando la llamada revienta por un motivo
      -- que no es el que se está probando — un uuid mal escrito, una
      -- fila que no existe— y entonces no prueba nada.
    if sqlerrm not like '%Reservar una nota%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;

  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;

  -- Una operativa sí puede escribirla: es su restaurante autorizado.
  perform public.create_establishment_note(
    'bd400000-0000-0000-0000-000000000001', 'El pie de foto de la portada está cortado', true);
end $$;

reset role;

-- ============================================================
-- El trabajador SIN ese restaurante autorizado no ve ninguna, ni escribe.
-- ============================================================
select set_config('request.jwt.claim.sub', 'bd000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare v_error text := '';
begin
  if (select count(*) from public.establishment_notes) <> 0 then
    raise exception 'FALLIDO: un trabajador sin el restaurante autorizado ve sus notas'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.create_establishment_note(
      'bd400000-0000-0000-0000-000000000001', 'Nota de un restaurante que no es suyo', true);
    v_error := 'ha podido escribir una nota en un restaurante que no tiene autorizado';
  exception when others then
      -- Comprobar POR QUÉ falló. Tragarse cualquier error hace que el
      -- test pase también cuando la llamada revienta por un motivo
      -- que no es el que se está probando — un uuid mal escrito, una
      -- fila que no existe— y entonces no prueba nada.
    if sqlerrm not like '%son del equipo de este restaurante%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;

  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- EL CLIENTE: ninguna. Ni la operativa. RN-MSG-04 lo llama fallo grave.
-- ============================================================
select set_config('request.jwt.claim.sub', 'bd000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare v_error text := '';
begin
  if (select count(*) from public.establishment_notes) <> 0 then
    raise exception 'FALLIDO GRAVE: el cliente ve notas internas de su restaurante (RN-EST-13, RN-MSG-04)'
      using errcode = 'assert_failure';
  end if;

  -- Tampoco puede asomarse por la función.
  if public.can_read_establishment_notes('bd400000-0000-0000-0000-000000000001') then
    raise exception 'FALLIDO GRAVE: can_read_establishment_notes() le dice que sí al cliente'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.create_establishment_note(
      'bd400000-0000-0000-0000-000000000001', 'Una nota escrita por el cliente', true);
    v_error := 'el cliente ha podido escribir una nota interna';
  exception when others then
      -- Comprobar POR QUÉ falló. Tragarse cualquier error hace que el
      -- test pase también cuando la llamada revienta por un motivo
      -- que no es el que se está probando — un uuid mal escrito, una
      -- fila que no existe— y entonces no prueba nada.
    if sqlerrm not like '%son del equipo de este restaurante%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;

  if v_error <> '' then
    raise exception 'FALLIDO GRAVE: %', v_error using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- Archivar: no se borra, deja de listarse, y es idempotente.
-- ============================================================
select set_config('request.jwt.claim.sub', 'bd000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_nota uuid;
  v_primera boolean;
  v_segunda boolean;
begin
  select id into v_nota from public.establishment_notes
  where body = 'Renegociar el plan en la próxima renovación';

  v_primera := public.archive_establishment_note(v_nota, 'Ya no aplica');
  v_segunda := public.archive_establishment_note(v_nota, 'Otra vez');

  if not v_primera or v_segunda then
    raise exception 'FALLIDO: archivar no es idempotente (CA-17): primera=% segunda=%', v_primera, v_segunda
      using errcode = 'assert_failure';
  end if;

  -- CLAUDE.md · la fila sigue estando, marcada.
  if (select archived_at from public.establishment_notes where id = v_nota) is null then
    raise exception 'FALLIDO: archivar no ha dejado marca' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md · los privilegios de las funciones.
-- ============================================================
do $$
begin
  -- `can_read_establishment_notes()` vive DENTRO de la política, así que
  -- authenticated tiene que conservar el EXECUTE: revocárselo no cerraría
  -- nada, rompería la política.
  if not has_function_privilege('authenticated', 'public.can_read_establishment_notes(uuid)', 'execute') then
    raise exception 'FALLIDO: authenticated ha perdido can_read_establishment_notes() y la política se rompe'
      using errcode = 'assert_failure';
  end if;
  if has_function_privilege('anon', 'public.can_read_establishment_notes(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: can_read_establishment_notes() esta abierta a anon'
      using errcode = 'assert_failure';
  end if;

  if has_function_privilege('anon', 'public.create_establishment_note(uuid, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.archive_establishment_note(uuid, text)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: alguna funcion de notas esta abierta a anon'
      using errcode = 'assert_failure';
  end if;

  -- RLS activado y con política explícita (CLAUDE.md MUST).
  if not (select relrowsecurity from pg_class where oid = 'public.establishment_notes'::regclass) then
    raise exception 'CLAUDE.md FALLIDO: establishment_notes sin RLS' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.establishment_notes'::regclass) then
    raise exception 'CLAUDE.md FALLIDO: establishment_notes sin politica' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id = 'bd100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'bd100000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'bd000000-%';

select 'notas_internas.sql: todas las comprobaciones han pasado' as resultado;
