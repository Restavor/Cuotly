-- ============================================================
-- Suite 66 · Las subtareas y las evidencias bajo la solicitud
--            (RN-REQ-07; decisión 64)
-- ============================================================
--
-- La decisión 64 trae las subtareas y las evidencias del trabajo al panel
-- de la solicitud, **en solo lectura**. Eso no es una pantalla nueva: es
-- enseñar en otro sitio filas que ya existen, y ahí está el riesgo que
-- esta suite vigila.
--
-- **Lo que comprueba es que el panel no abre ninguna puerta.** Las filas
-- salen de `tasks` y de `file_links`, con sus políticas de siempre, y por
-- eso:
--
--   · **El cliente no ve ni una tarea** de su propia solicitud. Las tareas
--     son organización interna del equipo (P7), y la barrera no es un
--     privilegio de columna sino la fila entera — fue el bloqueante B2 de
--     la cuarta revisión y no puede volver por la puerta de atrás de una
--     pantalla nueva.
--   · **Un trabajador sin ese restaurante autorizado tampoco**, aunque sea
--     del espacio: RN-ARC-05 y `can_read_job()` valen aquí igual que en la
--     pantalla del trabajo.
--   · **Quien sí puede, las ve todas**, o el panel estaría enseñando media
--     verdad, que es peor que no enseñar nada.
--   · Y lo mismo con la **evidencia**: `file_links` la filtra
--     `can_read_file()`, así que un archivo interno del equipo no se cuela
--     al cliente por estar enlazado a un trabajo.
--
-- **No hay migración detrás de esta suite**, y es a propósito: RN-REQ-07
-- no necesitó ninguna. Lo que hace falta comprobar es justamente que no
-- hizo falta — que las políticas que ya estaban bastan— porque la manera
-- de equivocarse aquí habría sido añadir una excepción para que el panel
-- "pudiera pintar".
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/subtareas_bajo_la_solicitud.sql
--
-- Prefijo de esta suite: f0900000-.

begin;

set local role postgres;

-- ------------------------------------------------------------
-- El decorado
-- ------------------------------------------------------------
insert into auth.users (id, email, role, aud) values
  ('f0900000-0000-0000-0000-000000000001', 'duena66@cuotly.test', 'authenticated', 'authenticated'),
  ('f0900000-0000-0000-0000-000000000002', 'autorizado66@cuotly.test', 'authenticated', 'authenticated'),
  ('f0900000-0000-0000-0000-000000000003', 'ajeno66@cuotly.test', 'authenticated', 'authenticated'),
  ('f0900000-0000-0000-0000-000000000004', 'cliente66@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f0900000-0000-0000-0000-000000000001', 'duena66@cuotly.test', 'Dueña 66'),
  ('f0900000-0000-0000-0000-000000000002', 'autorizado66@cuotly.test', 'Trabajador Autorizado 66'),
  ('f0900000-0000-0000-0000-000000000003', 'ajeno66@cuotly.test', 'Trabajador Ajeno 66'),
  ('f0900000-0000-0000-0000-000000000004', 'cliente66@cuotly.test', 'Cliente 66')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f0910000-0000-0000-0000-000000000001', 'Espacio 66', 'espacio-66', 'Europe/Madrid',
   'f0900000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f0910000-0000-0000-0000-000000000001', 'f0900000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('f0910000-0000-0000-0000-000000000001', 'f0900000-0000-0000-0000-000000000002', 'worker', 'active'),
  -- Del espacio, pero SIN este restaurante autorizado. Es quien demuestra
  -- que pertenecer al equipo no basta.
  ('f0910000-0000-0000-0000-000000000001', 'f0900000-0000-0000-0000-000000000003', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('f0930000-0000-0000-0000-000000000001', 'f0910000-0000-0000-0000-000000000001', 'Grupo 66');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f0940000-0000-0000-0000-000000000001', 'f0910000-0000-0000-0000-000000000001',
   'f0930000-0000-0000-0000-000000000001', 'EST-66-1', 'Casa Subtarea', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f0940000-0000-0000-0000-000000000001', 'f0900000-0000-0000-0000-000000000004', 'local_owner');

insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('f0910000-0000-0000-0000-000000000001', 'f0900000-0000-0000-0000-000000000002',
   'f0940000-0000-0000-0000-000000000001', 'f0900000-0000-0000-0000-000000000001');

-- La solicitud del cliente, ya aceptada, y su trabajo.
insert into public.requests
  (id, space_id, establishment_id, code, state, description, created_by) values
  ('f0950000-0000-0000-0000-000000000001', 'f0910000-0000-0000-0000-000000000001',
   'f0940000-0000-0000-0000-000000000001', 'SOL-66-1', 'accepted',
   'Sustituir las fotos de la terraza', 'f0900000-0000-0000-0000-000000000004');

insert into public.jobs
  (id, space_id, establishment_id, request_id, code, state, category, assigned_to) values
  ('f0960000-0000-0000-0000-000000000001', 'f0910000-0000-0000-0000-000000000001',
   'f0940000-0000-0000-0000-000000000001', 'f0950000-0000-0000-0000-000000000001',
   'TRA-66-1', 'in_progress', 'photo', 'f0900000-0000-0000-0000-000000000002');

-- Dos subtareas: una hecha y otra no, que es lo que el panel cuenta.
insert into public.tasks
  (id, space_id, job_id, title, state, weight, estimated_minutes, created_by, completed_at) values
  ('f0970000-0000-0000-0000-000000000001', 'f0910000-0000-0000-0000-000000000001',
   'f0960000-0000-0000-0000-000000000001', 'Recortar las fotos', 'completed', 'light', 30,
   'f0900000-0000-0000-0000-000000000001', now()),
  ('f0970000-0000-0000-0000-000000000002', 'f0910000-0000-0000-0000-000000000001',
   'f0960000-0000-0000-0000-000000000001', 'Subirlas a la web', 'pending', 'normal', 45,
   'f0900000-0000-0000-0000-000000000001', null);

-- La evidencia: un archivo compartido y otro interno, los dos enlazados al
-- trabajo. Sirve para separar "no lo ve porque no es del espacio" de "no
-- lo ve porque está marcado interno".
insert into public.files
  (id, space_id, group_id, establishment_id, category, visibility, name, created_by) values
  ('f0980000-0000-0000-0000-000000000001', 'f0910000-0000-0000-0000-000000000001',
   'f0930000-0000-0000-0000-000000000001', 'f0940000-0000-0000-0000-000000000001',
   'photos', 'shared_with_client', 'Terraza publicada', 'f0900000-0000-0000-0000-000000000001'),
  ('f0980000-0000-0000-0000-000000000002', 'f0910000-0000-0000-0000-000000000001',
   'f0930000-0000-0000-0000-000000000001', 'f0940000-0000-0000-0000-000000000001',
   'photos', 'internal', 'Original sin retocar', 'f0900000-0000-0000-0000-000000000001');

insert into public.file_versions
  (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, created_by) values
  ('f0980000-0000-0000-0000-000000000001', 'f0910000-0000-0000-0000-000000000001', 1,
   'espacio-66/terraza.jpg', 'terraza.jpg', 'image/jpeg', 2048,
   'f0900000-0000-0000-0000-000000000001'),
  ('f0980000-0000-0000-0000-000000000002', 'f0910000-0000-0000-0000-000000000001', 1,
   'espacio-66/original.jpg', 'original.jpg', 'image/jpeg', 4096,
   'f0900000-0000-0000-0000-000000000001');

insert into public.file_links (file_id, space_id, entity_type, entity_id, created_by) values
  ('f0980000-0000-0000-0000-000000000001', 'f0910000-0000-0000-0000-000000000001',
   'job', 'f0960000-0000-0000-0000-000000000001', 'f0900000-0000-0000-0000-000000000001'),
  ('f0980000-0000-0000-0000-000000000002', 'f0910000-0000-0000-0000-000000000001',
   'job', 'f0960000-0000-0000-0000-000000000001', 'f0900000-0000-0000-0000-000000000001');

-- ============================================================
-- RN-REQ-07 · quien lleva el espacio ve las dos subtareas
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f0900000-0000-0000-0000-000000000001';

do $$
declare
  v_tareas int;
  v_hechas int;
begin
  select count(*), count(*) filter (where state = 'completed') into v_tareas, v_hechas
  from public.tasks where job_id = 'f0960000-0000-0000-0000-000000000001';

  if v_tareas <> 2 then
    raise exception 'FALLO · la propietaria debería ver las 2 subtareas y ve %', v_tareas;
  end if;

  -- El panel enseña "1 de 2": si la consulta perdiera el estado, el
  -- recuento saldría igual y la pantalla mentiría.
  if v_hechas <> 1 then
    raise exception 'FALLO · esperaba 1 subtarea completada y hay %', v_hechas;
  end if;
end $$;

-- ============================================================
-- RN-REQ-07 · el trabajador autorizado también
-- ============================================================
set local request.jwt.claim.sub = 'f0900000-0000-0000-0000-000000000002';

do $$
begin
  if (select count(*) from public.tasks
      where job_id = 'f0960000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'FALLO · el trabajador autorizado debería ver las subtareas de su trabajo';
  end if;
end $$;

-- ============================================================
-- RN-REQ-07 · un trabajador SIN ese restaurante autorizado, ninguna
-- ============================================================
--
-- Es del espacio, así que `is_space_member` no le cierra nada. Lo que le
-- cierra es `can_read_job()`, la misma regla que en la pantalla del
-- trabajo (RN-ARC-05): traer las tareas a otra pantalla no la cambia.
set local request.jwt.claim.sub = 'f0900000-0000-0000-0000-000000000003';

do $$
begin
  -- Primero, que la premisa siga siendo cierta.
  if public.can_read_job('f0960000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · la premisa ya no se sostiene: este trabajador lee el trabajo';
  end if;

  if exists (select 1 from public.tasks
             where job_id = 'f0960000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · un trabajador sin este restaurante autorizado no debería ver sus subtareas';
  end if;

  -- Y tampoco la evidencia: `can_read_file()` le niega los archivos de un
  -- establecimiento que no tiene autorizado.
  if exists (select 1 from public.file_links
             where entity_type = 'job'
               and entity_id = 'f0960000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · tampoco debería ver la evidencia de ese trabajo';
  end if;
end $$;

-- ============================================================
-- RN-REQ-07 · el CLIENTE no ve ni una subtarea de su propia solicitud
-- ============================================================
--
-- Lo más importante de esta suite. El panel vive en la ficha del equipo,
-- pero la garantía no puede depender de en qué pantalla se pinte: las
-- tareas son organización interna y al cliente se le deja fuera de la
-- FILA, no se le tapa una columna (P7, bloqueante B2 de la 4ª revisión).
set local request.jwt.claim.sub = 'f0900000-0000-0000-0000-000000000004';

do $$
begin
  -- La solicitud sí es suya y la ve: si no, este bloque estaría pasando
  -- por el motivo equivocado.
  if not exists (select 1 from public.requests
                 where id = 'f0950000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · el cliente debería ver su propia solicitud';
  end if;

  if exists (select 1 from public.tasks
             where job_id = 'f0960000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · el cliente NO debería ver ninguna subtarea (P7)';
  end if;

  -- Ni las tareas sueltas del espacio, por si algún día dejan de colgar
  -- de un trabajo.
  if exists (select 1 from public.tasks
             where space_id = 'f0910000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · el cliente NO debería ver ninguna tarea del espacio';
  end if;
end $$;

-- ============================================================
-- RN-REQ-07 · la evidencia, cada quien la suya
-- ============================================================
do $$
declare
  v_enlaces int;
begin
  -- El cliente ve el archivo compartido y NO el interno, aunque los dos
  -- cuelguen del mismo trabajo (RN-ARC-04).
  select count(*) into v_enlaces
  from public.file_links
  where entity_type = 'job' and entity_id = 'f0960000-0000-0000-0000-000000000001';

  if v_enlaces <> 1 then
    raise exception 'FALLO · el cliente debería ver 1 evidencia compartida y ve %', v_enlaces;
  end if;

  if not exists (
    select 1 from public.file_links
    where entity_type = 'job'
      and entity_id = 'f0960000-0000-0000-0000-000000000001'
      and file_id = 'f0980000-0000-0000-0000-000000000001'
  ) then
    raise exception 'FALLO · la que ve el cliente debería ser la compartida, no la interna';
  end if;
end $$;

set local request.jwt.claim.sub = 'f0900000-0000-0000-0000-000000000001';

do $$
begin
  if (select count(*) from public.file_links
      where entity_type = 'job'
        and entity_id = 'f0960000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'FALLO · el equipo debería ver las dos evidencias';
  end if;
end $$;

-- ============================================================
-- RN-REQ-07 · se ven aquí, se marcan allí
-- ============================================================
--
-- La regla que impide que una casilla acabe marcada en una pantalla y no
-- en la otra. No se sostiene con no pintar el botón: se sostiene con que
-- `authenticated` no pueda escribir en `tasks` por el lado.
--
-- **`tasks` solo tiene política de lectura.** Con RLS activado y ninguna
-- política de `update`, PostgreSQL no lanza: afecta a **cero filas** y
-- devuelve que todo fue bien. Esa diferencia importa, porque un `update`
-- que "no da error" es exactamente lo que haría creer a alguien que se
-- puede marcar desde aquí. Lo que se comprueba es el efecto, no el error.
do $$
declare
  v_filas int;
  v_estado text;
begin
  update public.tasks set state = 'completed'
  where id = 'f0970000-0000-0000-0000-000000000002';
  get diagnostics v_filas = row_count;

  if v_filas <> 0 then
    raise exception 'FALLO · un UPDATE directo sobre una subtarea tocó % filas', v_filas;
  end if;

  -- Y visto desde fuera de la sesión, por si la política de lectura
  -- estuviera escondiendo un cambio que sí ocurrió.
  perform set_config('role', 'postgres', true);
  select state into v_estado from public.tasks
  where id = 'f0970000-0000-0000-0000-000000000002';

  if v_estado is distinct from 'pending' then
    raise exception 'FALLO · la subtarea cambió de estado con un UPDATE directo (quedó %)', v_estado;
  end if;
end $$;

rollback;
