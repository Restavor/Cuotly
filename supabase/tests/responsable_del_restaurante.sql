-- ============================================================
-- Suite 64 · El responsable de un restaurante
--            (migración 119; RN-EST-19; decisión 63)
-- ============================================================
--
-- Lo que comprueba, y por qué cada cosa:
--
--   · **El cliente no ve quién lleva su restaurante.** Es lo primero y lo
--     más importante: el responsable es alguien del equipo, y CLAUDE.md
--     prohíbe enseñarle al cliente la identidad de nadie del equipo de
--     mantenimiento (P7). Aquí la barrera no es un privilegio de columna
--     sino la fila entera: el cliente no es miembro del espacio.
--   · **Opcional de verdad** (RN-EST-19): sin responsable no hay fila, y
--     eso no rompe nada ni se puede confundir con un error.
--   · **Solo alguien del equipo**, y con pertenencia activa. Un invitado
--     que todavía no ha entrado no puede llevar un restaurante.
--   · **Quien sale del equipo deja de ser responsable**, y el restaurante
--     se queda sin ninguno — no se reasigna solo a nadie.
--   · **No concede permisos**: ser responsable no acerca a nadie ni un
--     paso a un restaurante que no tuviera.
--   · **Deja auditoría**, también al quitarlo.
--   · CLAUDE.md: la tabla lleva los dos disparadores de solo lectura, está
--     declarada en el traspaso y las funciones internas están cerradas.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/responsable_del_restaurante.sql
--
-- Prefijo de esta suite: d0900000-.

begin;

set local role postgres;

-- ------------------------------------------------------------
-- El decorado
-- ------------------------------------------------------------
insert into auth.users (id, email, role, aud) values
  ('d0900000-0000-0000-0000-000000000001', 'duena64@cuotly.test', 'authenticated', 'authenticated'),
  ('d0900000-0000-0000-0000-000000000002', 'trabajador64@cuotly.test', 'authenticated', 'authenticated'),
  ('d0900000-0000-0000-0000-000000000003', 'cliente64@cuotly.test', 'authenticated', 'authenticated'),
  ('d0900000-0000-0000-0000-000000000004', 'invitado64@cuotly.test', 'authenticated', 'authenticated'),
  ('d0900000-0000-0000-0000-000000000005', 'fuera64@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d0900000-0000-0000-0000-000000000001', 'duena64@cuotly.test', 'Dueña 64'),
  ('d0900000-0000-0000-0000-000000000002', 'trabajador64@cuotly.test', 'Trabajador 64'),
  ('d0900000-0000-0000-0000-000000000003', 'cliente64@cuotly.test', 'Cliente 64'),
  ('d0900000-0000-0000-0000-000000000004', 'invitado64@cuotly.test', 'Invitado 64'),
  ('d0900000-0000-0000-0000-000000000005', 'fuera64@cuotly.test', 'Fuera 64')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('d0910000-0000-0000-0000-000000000001', 'Espacio 64', 'espacio-64', 'Europe/Madrid',
   'd0900000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d0910000-0000-0000-0000-000000000001', 'd0900000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d0910000-0000-0000-0000-000000000001', 'd0900000-0000-0000-0000-000000000002', 'worker', 'active'),
  -- Invitado: pertenece, pero todavía no ha entrado. No puede ser
  -- responsable de nada.
  ('d0910000-0000-0000-0000-000000000001', 'd0900000-0000-0000-0000-000000000004', 'worker', 'invited');

insert into public.groups (id, space_id, name) values
  ('d0930000-0000-0000-0000-000000000001', 'd0910000-0000-0000-0000-000000000001', 'Grupo 64');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('d0940000-0000-0000-0000-000000000001', 'd0910000-0000-0000-0000-000000000001',
   'd0930000-0000-0000-0000-000000000001', 'EST-64-1', 'Casa Responsable', 'active');

-- El cliente, con su acceso al panel de SU restaurante.
insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('d0940000-0000-0000-0000-000000000001', 'd0900000-0000-0000-0000-000000000003', 'local_owner');

-- ============================================================
-- RN-EST-19 · sin responsable es un estado normal
-- ============================================================
do $$
begin
  if exists (select 1 from public.establishment_managers
             where establishment_id = 'd0940000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · un restaurante recién creado no debería tener responsable';
  end if;
end $$;

-- ============================================================
-- Asignarlo: solo con `manage_clients`
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'd0900000-0000-0000-0000-000000000002';

do $$
begin
  -- Un trabajador no tiene `manage_clients`.
  begin
    perform public.set_establishment_manager(
      'd0940000-0000-0000-0000-000000000001', 'd0900000-0000-0000-0000-000000000002');
    raise exception 'FALLO · un trabajador no debería poder asignar el responsable';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;
end $$;

set local request.jwt.claim.sub = 'd0900000-0000-0000-0000-000000000001';

do $$
begin
  perform public.set_establishment_manager(
    'd0940000-0000-0000-0000-000000000001', 'd0900000-0000-0000-0000-000000000002');

  if not exists (
    select 1 from public.establishment_managers
    where establishment_id = 'd0940000-0000-0000-0000-000000000001'
      and manager_id = 'd0900000-0000-0000-0000-000000000002'
      -- El espacio lo copia el disparador, no lo escribe quien llama.
      and space_id = 'd0910000-0000-0000-0000-000000000001'
  ) then
    raise exception 'FALLO · la propietaria debería poder asignar el responsable';
  end if;
end $$;

-- ============================================================
-- RN-EST-19 · solo alguien del equipo, y con pertenencia ACTIVA
-- ============================================================
do $$
begin
  -- Alguien de fuera del espacio.
  begin
    perform public.set_establishment_manager(
      'd0940000-0000-0000-0000-000000000001', 'd0900000-0000-0000-0000-000000000005');
    raise exception 'FALLO · alguien de fuera del espacio no puede ser responsable';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;

  -- Un invitado que todavía no ha entrado.
  begin
    perform public.set_establishment_manager(
      'd0940000-0000-0000-0000-000000000001', 'd0900000-0000-0000-0000-000000000004');
    raise exception 'FALLO · un invitado sin pertenencia activa no puede ser responsable';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;

  -- Y el intento fallido no ha tocado al que ya estaba.
  if not exists (
    select 1 from public.establishment_managers
    where establishment_id = 'd0940000-0000-0000-0000-000000000001'
      and manager_id = 'd0900000-0000-0000-0000-000000000002'
  ) then
    raise exception 'FALLO · un intento rechazado no debería quitar al responsable vigente';
  end if;
end $$;

-- ============================================================
-- P7 · el cliente NO ve quién lleva su restaurante
-- ============================================================
--
-- Es la razón por la que esto es una tabla aparte y no una columna de
-- `establishments`: ahí el cliente lee su propia fila y se llevaría el
-- uuid de alguien del equipo.
set local request.jwt.claim.sub = 'd0900000-0000-0000-0000-000000000003';

do $$
declare
  v_filas integer;
begin
  select count(*) into v_filas from public.establishment_managers;
  if v_filas <> 0 then
    raise exception 'FALLO · el cliente ve % filas de responsables y no debería ver ninguna', v_filas;
  end if;

  -- Y su propio restaurante sí lo sigue viendo: lo que se le tapa es el
  -- responsable, no la ficha.
  if not exists (select 1 from public.establishments
                 where id = 'd0940000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · el cliente debería seguir viendo su restaurante';
  end if;
end $$;

-- Alguien de fuera del espacio tampoco.
set local request.jwt.claim.sub = 'd0900000-0000-0000-0000-000000000005';

do $$
begin
  if exists (select 1 from public.establishment_managers) then
    raise exception 'FALLO · alguien de fuera del espacio no debería ver ningún responsable';
  end if;
end $$;

-- El equipo sí.
set local request.jwt.claim.sub = 'd0900000-0000-0000-0000-000000000002';

do $$
begin
  if not exists (
    select 1 from public.establishment_managers
    where establishment_id = 'd0940000-0000-0000-0000-000000000001'
  ) then
    raise exception 'FALLO · el equipo del espacio debería ver quién lleva cada restaurante';
  end if;
end $$;

-- ============================================================
-- RN-EST-19 · ser responsable NO concede permisos
-- ============================================================
--
-- El trabajador es el responsable y **no** tiene el restaurante
-- autorizado: seguir sin poder editarlo es lo que dice que esto es una
-- atribución y no una llave.
do $$
begin
  if public.has_capability('d0910000-0000-0000-0000-000000000001', 'manage_clients') then
    raise exception 'FALLO · ser responsable no puede conceder `manage_clients`';
  end if;
end $$;

-- ============================================================
-- §21.2 · deja auditoría, con valor anterior y nuevo
-- ============================================================
set local role postgres;

do $$
declare
  v_nuevo uuid;
begin
  /*
    Por contenido, no por "el último". Aquí todavía hay un solo apunte, así
    que ordenar funcionaba — pero `audit_log.created_at` es `now()`, igual
    para toda la transacción, y en cuanto hubiera dos este `order by` los
    desempataría por un uuid aleatorio. Es lo que le pasó al bloque de
    quitar el responsable, más abajo.
  */
  select (new_value->>'manager_id')::uuid into v_nuevo
  from public.audit_log
  where action = 'establishment.manager_set'
    and entity_id = 'd0940000-0000-0000-0000-000000000001'
    and old_value->>'manager_id' is null
  limit 1;

  if v_nuevo is distinct from 'd0900000-0000-0000-0000-000000000002' then
    raise exception 'FALLO · la auditoría no anotó a quién se asignó';
  end if;
end $$;

-- ============================================================
-- Pulsar dos veces no deja dos rastros
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'd0900000-0000-0000-0000-000000000001';

do $$
declare
  v_antes integer;
  v_despues integer;
begin
  select count(*) into v_antes from public.audit_log
  where action = 'establishment.manager_set';

  perform public.set_establishment_manager(
    'd0940000-0000-0000-0000-000000000001', 'd0900000-0000-0000-0000-000000000002');

  select count(*) into v_despues from public.audit_log
  where action = 'establishment.manager_set';

  if v_despues <> v_antes then
    raise exception 'FALLO · asignar al mismo responsable otra vez no debería anotar nada';
  end if;
end $$;

-- ============================================================
-- Quitarlo: también es un cambio, y también se anota
-- ============================================================
do $$
declare
  v_anterior uuid;
  v_nuevo uuid;
begin
  perform public.set_establishment_manager('d0940000-0000-0000-0000-000000000001', null);

  if exists (select 1 from public.establishment_managers
             where establishment_id = 'd0940000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · quitar el responsable debería borrar la fila';
  end if;

  /*
    El apunte **de quitarlo**, buscado por lo que es y no por ser "el
    último". `audit_log.created_at` vale `now()`, que dentro de una
    transacción es el mismo instante para todas las filas, así que
    `order by created_at desc, id desc` desempataba por un uuid aleatorio
    y elegía a cara o cruz entre asignar y quitar. Esta suite falló así una
    de cada dos o tres ejecuciones desde que se escribió, y solo se vio al
    correrla ocho veces seguidas.

    `audit_log` no tiene ninguna columna monótona —ni secuencia ni número
    de orden—, así que no hay forma de pedir "el último" de verdad. Lo que
    sí hay es una forma de pedir EL QUE INTERESA, que además dice mejor qué
    se está comprobando.
  */
  select (old_value->>'manager_id')::uuid, (new_value->>'manager_id')::uuid
  into v_anterior, v_nuevo
  from public.audit_log
  where action = 'establishment.manager_set'
    and entity_id = 'd0940000-0000-0000-0000-000000000001'
    and new_value->>'manager_id' is null
  limit 1;

  if v_anterior is distinct from 'd0900000-0000-0000-0000-000000000002' or v_nuevo is not null then
    raise exception 'FALLO · quitar el responsable debería anotarse con su valor anterior';
  end if;

  -- Y el de asignarlo sigue estando, con el suyo: son dos apuntes, no uno
  -- que se sobrescribe.
  if not exists (
    select 1 from public.audit_log
    where action = 'establishment.manager_set'
      and entity_id = 'd0940000-0000-0000-0000-000000000001'
      and old_value->>'manager_id' is null
      and new_value->>'manager_id' = 'd0900000-0000-0000-0000-000000000002'
  ) then
    raise exception 'FALLO · el apunte de asignar el responsable debería seguir ahí';
  end if;
end $$;

-- ============================================================
-- RN-EST-19 · quien sale del equipo deja de ser responsable
-- ============================================================
do $$
begin
  perform public.set_establishment_manager(
    'd0940000-0000-0000-0000-000000000001', 'd0900000-0000-0000-0000-000000000002');
end $$;

set local role postgres;

do $$
begin
  update public.space_memberships
  set status = 'inactive'
  where space_id = 'd0910000-0000-0000-0000-000000000001'
    and user_id = 'd0900000-0000-0000-0000-000000000002';

  if exists (select 1 from public.establishment_managers
             where establishment_id = 'd0940000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · quien sale del equipo debería dejar de ser responsable';
  end if;
end $$;

-- ============================================================
-- CLAUDE.md · los dos disparadores de solo lectura
-- ============================================================
do $$
declare
  v_falta text;
begin
  select string_agg(esperado, ', ') into v_falta
  from (values
    ('establishment_managers_guard_support_read_only'),
    ('establishment_managers_cuotly_read_only')
  ) as t(esperado)
  where not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.establishment_managers'::regclass
      and tgname = t.esperado
  );

  if v_falta is not null then
    raise exception 'FALLO · a `establishment_managers` le faltan disparadores: %', v_falta;
  end if;
end $$;

-- ============================================================
-- CLAUDE.md · las internas, cerradas por RPC
-- ============================================================
do $$
declare
  v_abiertas text;
begin
  select string_agg(p.proname, ', ') into v_abiertas
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('establishment_managers_space_guard', 'clear_managers_on_membership_end')
    and (has_function_privilege('authenticated', p.oid, 'execute')
      or has_function_privilege('anon', p.oid, 'execute'));

  if v_abiertas is not null then
    raise exception 'FALLO · funciones internas abiertas por RPC: %', v_abiertas;
  end if;
end $$;

-- ============================================================
-- RN-TRA-08 · el traspaso la declara, y NO viaja
-- ============================================================
do $$
declare
  v_viaja boolean;
begin
  select travels into v_viaja
  from public.establishment_transfer_tables()
  where table_name = 'establishment_managers';

  if v_viaja is null then
    raise exception 'FALLO · `establishment_managers` no está declarada en el traspaso';
  end if;

  if v_viaja then
    raise exception 'FALLO · el responsable es del equipo de origen y no debería viajar';
  end if;
end $$;

rollback;
