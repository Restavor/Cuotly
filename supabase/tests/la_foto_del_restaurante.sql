-- ============================================================
-- Suite 65 · La foto del restaurante
--            (migración 120; RN-EST-18; decisión 62)
-- ============================================================
--
-- Lo que comprueba, y por qué cada cosa:
--
--   · **Sin foto es un estado normal**, no un error ni un hueco: una
--     columna nula y una ruta nula, que es lo que la pantalla enseña
--     diciendo el motivo (CA-20).
--   · **La suben los dos lados** (RN-EST-18): el equipo con
--     `manage_clients` y el cliente con su permiso de editar los datos de
--     su restaurante. Nadie más.
--   · **El archivo tiene que ser de ESTE restaurante.** Es la comprobación
--     que impide que un identificador pegado a mano ponga de cara de un
--     local una imagen de otro — la foto se lee por su identificador, no
--     por quién la pidió.
--   · **Ni archivado, ni interno, ni un PDF.** Tres formas distintas de
--     acabar con una cara rota o con algo del equipo enseñado al cliente.
--   · **Quitarla no borra el archivo** (CLAUDE.md: nada se borra
--     físicamente). Sigue en sus archivos, con sus versiones.
--   · **La ve todo el espacio.** Un trabajador sin ese restaurante
--     autorizado no lee sus archivos (RN-ARC-05) pero sí ve el restaurante
--     en la lista: la foto sigue la regla de ver el restaurante, no la de
--     leer archivos, o la lista tendría caras que aparecen y desaparecen
--     sin explicación.
--   · **Y no la ve quien no ve el restaurante**, que es el otro lado de lo
--     mismo y lo que hace que ser `SECURITY DEFINER` no abra una puerta.
--   · **Deja auditoría con el antes y el después**, también al quitarla.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/la_foto_del_restaurante.sql
--
-- Prefijo de esta suite: e0900000-.

begin;

set local role postgres;

-- ------------------------------------------------------------
-- El decorado
-- ------------------------------------------------------------
insert into auth.users (id, email, role, aud) values
  ('e0900000-0000-0000-0000-000000000001', 'duena65@cuotly.test', 'authenticated', 'authenticated'),
  ('e0900000-0000-0000-0000-000000000002', 'trabajador65@cuotly.test', 'authenticated', 'authenticated'),
  ('e0900000-0000-0000-0000-000000000003', 'cliente65@cuotly.test', 'authenticated', 'authenticated'),
  ('e0900000-0000-0000-0000-000000000004', 'ajeno65@cuotly.test', 'authenticated', 'authenticated'),
  ('e0900000-0000-0000-0000-000000000005', 'lector65@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('e0900000-0000-0000-0000-000000000001', 'duena65@cuotly.test', 'Dueña 65'),
  ('e0900000-0000-0000-0000-000000000002', 'trabajador65@cuotly.test', 'Trabajador 65'),
  ('e0900000-0000-0000-0000-000000000003', 'cliente65@cuotly.test', 'Cliente 65'),
  ('e0900000-0000-0000-0000-000000000004', 'ajeno65@cuotly.test', 'Ajeno 65'),
  ('e0900000-0000-0000-0000-000000000005', 'lector65@cuotly.test', 'Lector 65')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('e0910000-0000-0000-0000-000000000001', 'Espacio 65', 'espacio-65', 'Europe/Madrid',
   'e0900000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('e0910000-0000-0000-0000-000000000001', 'e0900000-0000-0000-0000-000000000001', 'owner', 'active'),
  -- Trabajador **sin** este restaurante autorizado: es quien demuestra que
  -- la foto se ve con la regla del restaurante y no con la de archivos.
  ('e0910000-0000-0000-0000-000000000001', 'e0900000-0000-0000-0000-000000000002', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('e0930000-0000-0000-0000-000000000001', 'e0910000-0000-0000-0000-000000000001', 'Grupo 65');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('e0940000-0000-0000-0000-000000000001', 'e0910000-0000-0000-0000-000000000001',
   'e0930000-0000-0000-0000-000000000001', 'EST-65-1', 'Casa Retrato', 'active'),
  -- El segundo restaurante del MISMO espacio: sin él, "el archivo no es de
  -- este restaurante" se confundiría con "no lo puedo leer".
  ('e0940000-0000-0000-0000-000000000002', 'e0910000-0000-0000-0000-000000000001',
   'e0930000-0000-0000-0000-000000000001', 'EST-65-2', 'Casa Vecina', 'active');

-- El cliente, dueño local de SU restaurante y con permiso de editar datos.
insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('e0950000-0000-0000-0000-000000000001', 'e0940000-0000-0000-0000-000000000001',
   'e0900000-0000-0000-0000-000000000003', 'local_owner');

-- Un lector del restaurante: lo ve, pero no edita sus datos. Sirve para
-- separar "ver la foto" de "cambiarla".
insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('e0950000-0000-0000-0000-000000000002', 'e0940000-0000-0000-0000-000000000001',
   'e0900000-0000-0000-0000-000000000005', 'editor');

insert into public.establishment_permissions (establishment_membership_id, edit_establishment_data) values
  ('e0950000-0000-0000-0000-000000000002', false);

-- ------------------------------------------------------------
-- Los archivos del decorado
-- ------------------------------------------------------------
insert into public.files (id, space_id, group_id, establishment_id, category, visibility, name, created_by) values
  -- La buena.
  ('e0960000-0000-0000-0000-000000000001', 'e0910000-0000-0000-0000-000000000001',
   'e0930000-0000-0000-0000-000000000001', 'e0940000-0000-0000-0000-000000000001',
   'photos', 'shared_with_client', 'Fachada', 'e0900000-0000-0000-0000-000000000001'),
  -- Interna del equipo.
  ('e0960000-0000-0000-0000-000000000002', 'e0910000-0000-0000-0000-000000000001',
   'e0930000-0000-0000-0000-000000000001', 'e0940000-0000-0000-0000-000000000001',
   'photos', 'internal', 'Notas del fotógrafo', 'e0900000-0000-0000-0000-000000000001'),
  -- Archivada.
  ('e0960000-0000-0000-0000-000000000003', 'e0910000-0000-0000-0000-000000000001',
   'e0930000-0000-0000-0000-000000000001', 'e0940000-0000-0000-0000-000000000001',
   'photos', 'shared_with_client', 'Fachada vieja', 'e0900000-0000-0000-0000-000000000001'),
  -- Un PDF, compartido y sin archivar: todo bien menos que no es una foto.
  ('e0960000-0000-0000-0000-000000000004', 'e0910000-0000-0000-0000-000000000001',
   'e0930000-0000-0000-0000-000000000001', 'e0940000-0000-0000-0000-000000000001',
   'documents', 'shared_with_client', 'Contrato', 'e0900000-0000-0000-0000-000000000001'),
  -- Del restaurante de al lado.
  ('e0960000-0000-0000-0000-000000000005', 'e0910000-0000-0000-0000-000000000001',
   'e0930000-0000-0000-0000-000000000001', 'e0940000-0000-0000-0000-000000000002',
   'photos', 'shared_with_client', 'Fachada vecina', 'e0900000-0000-0000-0000-000000000001');

update public.files set archived_at = now()
where id = 'e0960000-0000-0000-0000-000000000003';

insert into public.file_versions
  (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, created_by) values
  ('e0960000-0000-0000-0000-000000000001', 'e0910000-0000-0000-0000-000000000001', 1,
   'espacio-65/fachada-v1.jpg', 'fachada.jpg', 'image/jpeg', 1024,
   'e0900000-0000-0000-0000-000000000001'),
  ('e0960000-0000-0000-0000-000000000002', 'e0910000-0000-0000-0000-000000000001', 1,
   'espacio-65/notas.png', 'notas.png', 'image/png', 1024,
   'e0900000-0000-0000-0000-000000000001'),
  ('e0960000-0000-0000-0000-000000000003', 'e0910000-0000-0000-0000-000000000001', 1,
   'espacio-65/vieja.jpg', 'vieja.jpg', 'image/jpeg', 1024,
   'e0900000-0000-0000-0000-000000000001'),
  ('e0960000-0000-0000-0000-000000000004', 'e0910000-0000-0000-0000-000000000001', 1,
   'espacio-65/contrato.pdf', 'contrato.pdf', 'application/pdf', 1024,
   'e0900000-0000-0000-0000-000000000001'),
  ('e0960000-0000-0000-0000-000000000005', 'e0910000-0000-0000-0000-000000000001', 1,
   'espacio-65/vecina.jpg', 'vecina.jpg', 'image/jpeg', 1024,
   'e0900000-0000-0000-0000-000000000001');

-- ============================================================
-- RN-EST-18 · sin foto es un estado normal
-- ============================================================
do $$
begin
  if (select photo_file_id from public.establishments
      where id = 'e0940000-0000-0000-0000-000000000001') is not null then
    raise exception 'FALLO · un restaurante recién creado no debería tener foto';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000001';

do $$
begin
  if public.establishment_photo_path('e0940000-0000-0000-0000-000000000001') is not null then
    raise exception 'FALLO · sin foto, la ruta debería ser nula y no una cadena vacía';
  end if;
end $$;

-- ============================================================
-- Ponerla: quien tiene `manage_clients`
-- ============================================================
do $$
begin
  perform public.set_establishment_photo(
    'e0940000-0000-0000-0000-000000000001', 'e0960000-0000-0000-0000-000000000001');

  if (select photo_file_id from public.establishments
      where id = 'e0940000-0000-0000-0000-000000000001')
     is distinct from 'e0960000-0000-0000-0000-000000000001'::uuid then
    raise exception 'FALLO · la propietaria debería poder poner la foto';
  end if;

  if public.establishment_photo_path('e0940000-0000-0000-0000-000000000001')
     is distinct from 'espacio-65/fachada-v1.jpg' then
    raise exception 'FALLO · la ruta debería ser la de la versión vigente';
  end if;
end $$;

-- ============================================================
-- RN-EST-18 · la ruta es la de la ÚLTIMA versión, no la primera
-- ============================================================
--
-- Sustituir la foto por una versión nueva del mismo archivo no puede
-- seguir sirviendo la de antes: RN-ARC-03 guarda la vieja, no la enseña.
set local role postgres;

insert into public.file_versions
  (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, created_by) values
  ('e0960000-0000-0000-0000-000000000001', 'e0910000-0000-0000-0000-000000000001', 2,
   'espacio-65/fachada-v2.jpg', 'fachada.jpg', 'image/jpeg', 2048,
   'e0900000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000001';

do $$
begin
  if public.establishment_photo_path('e0940000-0000-0000-0000-000000000001')
     is distinct from 'espacio-65/fachada-v2.jpg' then
    raise exception 'FALLO · la ruta debería ser la de la versión 2, no la de la 1';
  end if;
end $$;

-- ============================================================
-- El archivo tiene que ser de ESTE restaurante
-- ============================================================
do $$
begin
  begin
    perform public.set_establishment_photo(
      'e0940000-0000-0000-0000-000000000001', 'e0960000-0000-0000-0000-000000000005');
    raise exception 'FALLO · un archivo del restaurante de al lado no debería valer como foto';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;

  -- Y no ha cambiado nada por intentarlo.
  if (select photo_file_id from public.establishments
      where id = 'e0940000-0000-0000-0000-000000000001')
     is distinct from 'e0960000-0000-0000-0000-000000000001'::uuid then
    raise exception 'FALLO · un intento rechazado no debería tocar la foto';
  end if;
end $$;

-- ============================================================
-- Ni archivado, ni interno, ni un PDF
-- ============================================================
do $$
begin
  begin
    perform public.set_establishment_photo(
      'e0940000-0000-0000-0000-000000000001', 'e0960000-0000-0000-0000-000000000003');
    raise exception 'FALLO · un archivo archivado no debería poder ser la foto';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;

  begin
    perform public.set_establishment_photo(
      'e0940000-0000-0000-0000-000000000001', 'e0960000-0000-0000-0000-000000000002');
    raise exception 'FALLO · un archivo interno del equipo no debería poder ser la foto';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;

  begin
    perform public.set_establishment_photo(
      'e0940000-0000-0000-0000-000000000001', 'e0960000-0000-0000-0000-000000000004');
    raise exception 'FALLO · un PDF no debería poder ser la foto de un restaurante';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;

  begin
    perform public.set_establishment_photo(
      'e0940000-0000-0000-0000-000000000001', 'e0900000-0000-0000-0000-000000000001');
    raise exception 'FALLO · un identificador que no es de ningún archivo no debería colar';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;
end $$;

-- ============================================================
-- RN-EST-18 · el cliente con `edit_establishment_data` también
-- ============================================================
set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000003';

do $$
begin
  perform public.set_establishment_photo(
    'e0940000-0000-0000-0000-000000000001', 'e0960000-0000-0000-0000-000000000003');
  raise exception 'FALLO · al cliente tampoco le vale un archivo archivado';
exception
  when others then
    if position('FALLO' in sqlerrm) > 0 then raise; end if;
end $$;

do $$
begin
  -- Quitarla: el cliente puede, porque es editar los datos de su local.
  perform public.set_establishment_photo('e0940000-0000-0000-0000-000000000001', null);

  if (select photo_file_id from public.establishments
      where id = 'e0940000-0000-0000-0000-000000000001') is not null then
    raise exception 'FALLO · el dueño local debería poder quitar la foto';
  end if;

  -- **Quitarla no borra el archivo.** CLAUDE.md: nada se borra.
  if not exists (select 1 from public.files
                 where id = 'e0960000-0000-0000-0000-000000000001'
                   and archived_at is null) then
    raise exception 'FALLO · quitar la foto no debería borrar ni archivar el archivo';
  end if;

  if not exists (select 1 from public.file_versions
                 where file_id = 'e0960000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · quitar la foto no debería borrar sus versiones';
  end if;

  -- Y volver a ponerla.
  perform public.set_establishment_photo(
    'e0940000-0000-0000-0000-000000000001', 'e0960000-0000-0000-0000-000000000001');
end $$;

-- ============================================================
-- Quien solo mira, no cambia
-- ============================================================
set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000005';

do $$
begin
  -- Ve la foto: está en su restaurante.
  if public.establishment_photo_path('e0940000-0000-0000-0000-000000000001') is null then
    raise exception 'FALLO · quien ve el restaurante debería ver su foto';
  end if;

  begin
    perform public.set_establishment_photo('e0940000-0000-0000-0000-000000000001', null);
    raise exception 'FALLO · sin `edit_establishment_data` no se debería poder quitar la foto';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;
end $$;

-- ============================================================
-- RN-ARC-05 · el trabajador sin este restaurante autorizado SÍ ve la foto
-- ============================================================
--
-- Es la razón de que `establishment_photo_path()` sea `SECURITY DEFINER`.
-- Este trabajador no puede leer los archivos de este restaurante —
-- `can_read_file()` se lo niega — pero sí lo ve en la lista, y una lista
-- con caras que aparecen y desaparecen sin motivo es peor que ninguna.
set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000002';

do $$
begin
  -- Primero, que la premisa sea cierta: NO puede leer ese archivo.
  if public.can_read_file('e0960000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · la premisa de esta comprobación ya no se sostiene: el trabajador lee el archivo';
  end if;

  if public.establishment_photo_path('e0940000-0000-0000-0000-000000000001')
     is distinct from 'espacio-65/fachada-v2.jpg' then
    raise exception 'FALLO · el equipo del espacio debería ver la foto de cualquiera de sus restaurantes';
  end if;
end $$;

-- ============================================================
-- Y quien no ve el restaurante, no ve su foto
-- ============================================================
set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000004';

do $$
begin
  if public.establishment_photo_path('e0940000-0000-0000-0000-000000000001') is not null then
    raise exception 'FALLO · alguien de fuera no debería sacar la ruta de la foto';
  end if;

  begin
    perform public.set_establishment_photo(
      'e0940000-0000-0000-0000-000000000001', 'e0960000-0000-0000-0000-000000000001');
    raise exception 'FALLO · alguien de fuera no debería poder cambiar la foto';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;
end $$;

-- ============================================================
-- §21.2 · auditoría con el antes y el después, y sin apuntes de más
-- ============================================================
set local role postgres;

do $$
declare
  v_apuntes int;
  v_quitar jsonb;
begin
  select count(*) into v_apuntes
  from public.audit_log
  where action = 'establishment.photo_set'
    and entity_id = 'e0940000-0000-0000-0000-000000000001';

  -- Poner, quitar, volver a poner: tres. Ni uno más por los intentos
  -- rechazados, que no cambiaron nada.
  if v_apuntes <> 3 then
    raise exception 'FALLO · esperaba 3 apuntes de foto y hay %', v_apuntes;
  end if;

  select old_value into v_quitar
  from public.audit_log
  where action = 'establishment.photo_set'
    and entity_id = 'e0940000-0000-0000-0000-000000000001'
    and new_value->>'photo_file_id' is null;

  if v_quitar->>'photo_file_id' is distinct from 'e0960000-0000-0000-0000-000000000001' then
    raise exception 'FALLO · al quitar la foto, la auditoría debería guardar cuál era';
  end if;
end $$;

-- ============================================================
-- No cambiar nada no es un cambio
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000001';

do $$
begin
  perform public.set_establishment_photo(
    'e0940000-0000-0000-0000-000000000001', 'e0960000-0000-0000-0000-000000000001');
end $$;

set local role postgres;

do $$
declare
  v_apuntes int;
begin
  select count(*) into v_apuntes
  from public.audit_log
  where action = 'establishment.photo_set'
    and entity_id = 'e0940000-0000-0000-0000-000000000001';

  if v_apuntes <> 3 then
    raise exception 'FALLO · poner la misma foto otra vez no debería dejar apunte (hay %)', v_apuntes;
  end if;
end $$;

-- ============================================================
-- `authenticated` no cambia la columna por `update` directo
-- ============================================================
--
-- La función es la puerta; que exista no sirve de nada si la columna se
-- puede escribir por el lado (CLAUDE.md: ocultar un control no es un
-- control de acceso).
set local role authenticated;
set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000001';

do $$
begin
  begin
    update public.establishments
    set photo_file_id = 'e0960000-0000-0000-0000-000000000005'
    where id = 'e0940000-0000-0000-0000-000000000001';
    raise exception 'FALLO · `authenticated` no debería poder escribir `photo_file_id` a mano';
  exception
    when insufficient_privilege then null;
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;
end $$;

-- ============================================================
-- La versión de lista dice lo mismo que la de uno (migración 121)
-- ============================================================
--
-- Es la que pintan el Inicio y la lista de Restaurantes, y si decidiera
-- por su cuenta acabaría diciendo algo distinto. Aquí se comprueban las
-- tres cosas que tienen que coincidir: la ruta, a quién se la da y a quién
-- no, y que un restaurante sin foto **no salga** en vez de salir con nulo.
set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000002';

do $$
declare
  v_filas int;
  v_ruta text;
begin
  select count(*) into v_filas
  from public.establishment_photo_paths(array[
    'e0940000-0000-0000-0000-000000000001'::uuid,
    'e0940000-0000-0000-0000-000000000002'::uuid
  ]);

  -- El segundo restaurante no tiene foto: no sale. Una fila con la ruta a
  -- nulo obligaría a la pantalla a distinguir dos formas de "no hay".
  if v_filas <> 1 then
    raise exception 'FALLO · esperaba una sola fila con foto y hay %', v_filas;
  end if;

  select storage_path into v_ruta
  from public.establishment_photo_paths(array['e0940000-0000-0000-0000-000000000001'::uuid]);

  if v_ruta is distinct from public.establishment_photo_path('e0940000-0000-0000-0000-000000000001') then
    raise exception 'FALLO · la de lista y la de uno deberían dar la misma ruta';
  end if;

  if v_ruta is distinct from 'espacio-65/fachada-v2.jpg' then
    raise exception 'FALLO · la de lista debería dar la versión vigente';
  end if;
end $$;

set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000004';

do $$
begin
  if exists (
    select 1 from public.establishment_photo_paths(array[
      'e0940000-0000-0000-0000-000000000001'::uuid,
      'e0940000-0000-0000-0000-000000000002'::uuid
    ])
  ) then
    raise exception 'FALLO · alguien de fuera no debería sacar ninguna ruta por la de lista';
  end if;
end $$;

set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000001';

-- ============================================================
-- Archivar la foto la retira de la cara del local
-- ============================================================
--
-- `set_establishment_photo()` rechaza elegir un archivo ya archivado, pero
-- el otro orden también pasa: se elige y **después** se archiva. Entonces
-- la columna sigue apuntando ahí y es la lectura la que tiene que dejar de
-- servirla — si no, un archivo retirado seguiría siendo la cara del
-- restaurante hasta que alguien se diera cuenta.
set local role postgres;

update public.files set archived_at = now()
where id = 'e0960000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = 'e0900000-0000-0000-0000-000000000001';

do $$
begin
  if public.establishment_photo_path('e0940000-0000-0000-0000-000000000001') is not null then
    raise exception 'FALLO · una foto archivada no debería seguir sirviéndose';
  end if;

  if exists (
    select 1 from public.establishment_photo_paths(
      array['e0940000-0000-0000-0000-000000000001'::uuid])
  ) then
    raise exception 'FALLO · la de lista tampoco debería servir una foto archivada';
  end if;
end $$;

set local role postgres;

update public.files set archived_at = null
where id = 'e0960000-0000-0000-0000-000000000001';

-- ============================================================
-- CLAUDE.md · lo que se abre por RPC y lo que no
-- ============================================================
set local role postgres;

do $$
declare
  v_mal text;
begin
  select string_agg(p.proname || ' → ' || r.rolname, ', ') into v_mal
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('public')) as r(rolname)
  where n.nspname = 'public'
    and p.proname in ('set_establishment_photo', 'establishment_photo_path',
                      'establishment_photo_paths')
    and has_function_privilege(
      case when r.rolname = 'public' then 'anon' else r.rolname end, p.oid, 'execute')
    and r.rolname = 'anon';

  if v_mal is not null then
    raise exception 'FALLO · funciones de la foto abiertas a anon: %', v_mal;
  end if;

  -- Y sí a `authenticated`, o las pantallas no pueden llamarlas.
  if not has_function_privilege('authenticated',
       'public.set_establishment_photo(uuid, uuid)', 'execute') then
    raise exception 'FALLO · `set_establishment_photo` debería estar abierta a authenticated';
  end if;

  if not has_function_privilege('authenticated',
       'public.establishment_photo_path(uuid)', 'execute') then
    raise exception 'FALLO · `establishment_photo_path` debería estar abierta a authenticated';
  end if;

  if not has_function_privilege('authenticated',
       'public.establishment_photo_paths(uuid[])', 'execute') then
    raise exception 'FALLO · `establishment_photo_paths` debería estar abierta a authenticated';
  end if;
end $$;

rollback;
