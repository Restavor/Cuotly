-- ============================================================
-- Suite 57 · La foto de perfil (PRD RN-GLO-09, decisión 53)
-- ============================================================
--
-- Lo que vigila, y por qué cada cosa:
--
--   · **Cada quien cambia la suya, y solo la suya.** `set_my_avatar()`
--     escribe la fila de quien llama, pero eso no basta: hay que rechazar
--     una RUTA ajena. Sin esa comprobación, mandar `<uuid de otro>/cara.png`
--     dejaría la fila propia apuntando a un objeto que no es de uno —y al
--     revés, la ruta de uno en la fila de otro es la misma trampa vista
--     desde el otro lado—.
--   · **El cliente no ve la cara de nadie del equipo.** Es el MUST NOT de
--     CLAUDE.md: la foto es identidad. No lo sostiene ninguna regla nueva,
--     lo sostiene `profiles_select`, y esta suite lo comprueba sentándose
--     como cliente y mirando.
--   · **El bucket es privado** y solo admite imágenes. Un bucket público
--     habría hecho irrelevante todo lo anterior: quien tuviera la URL
--     vería la cara.
--
-- Prefijo de esta suite: d0200000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('d0200000-0000-0000-0000-000000000001', 'duena@suite57.test', 'authenticated', 'authenticated'),
  ('d0200000-0000-0000-0000-000000000002', 'trabajador@suite57.test', 'authenticated', 'authenticated'),
  ('d0200000-0000-0000-0000-000000000003', 'restaurante@suite57.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name, given_name) values
  ('d0200000-0000-0000-0000-000000000001', 'duena@suite57.test', 'Dueña 57', 'Dueña'),
  ('d0200000-0000-0000-0000-000000000002', 'trabajador@suite57.test', 'Trabajador 57', 'Trabajador'),
  ('d0200000-0000-0000-0000-000000000003', 'restaurante@suite57.test', 'Restaurante 57', 'Restaurante')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by)
values ('d0200000-0000-0000-0000-000000000010', 'Espacio 57', 'espacio-57', 'Europe/Madrid',
        'd0200000-0000-0000-0000-000000000001');

-- Los dos del EQUIPO comparten espacio. El del restaurante no está en
-- `space_memberships` y ahí está la frontera entera.
insert into public.space_memberships (space_id, user_id, role, status) values
  ('d0200000-0000-0000-0000-000000000010', 'd0200000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d0200000-0000-0000-0000-000000000010', 'd0200000-0000-0000-0000-000000000002', 'worker', 'active');

insert into public.groups (id, space_id, name)
values ('d0200000-0000-0000-0000-000000000015', 'd0200000-0000-0000-0000-000000000010', 'Grupo 57');

insert into public.establishments (id, space_id, group_id, code, name, status)
values ('d0200000-0000-0000-0000-000000000020', 'd0200000-0000-0000-0000-000000000010',
        'd0200000-0000-0000-0000-000000000015', 'R57', 'Magariños 57', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role)
values ('d0200000-0000-0000-0000-000000000030', 'd0200000-0000-0000-0000-000000000020',
        'd0200000-0000-0000-0000-000000000003', 'local_owner');

-- ------------------------------------------------------------
-- RN-ARC-08, RN-GLO-09 · el bucket es privado y solo admite imágenes
-- ------------------------------------------------------------
do $$
declare
  v_bucket record;
begin
  select * into v_bucket from storage.buckets where id = 'avatars';

  if v_bucket.id is null then
    raise exception 'RN-GLO-09 FALLA: no existe el bucket `avatars`';
  end if;

  if v_bucket.public then
    raise exception 'RN-GLO-09 FALLA: el bucket de fotos es PÚBLICO; quien tuviera la URL vería la cara de cualquiera';
  end if;

  -- Una foto de perfil no es un PDF ni un vídeo. La lista es blanca: lo
  -- que no está, no entra.
  if v_bucket.allowed_mime_types is null
     or 'application/pdf' = any(v_bucket.allowed_mime_types)
     or not ('image/jpeg' = any(v_bucket.allowed_mime_types)) then
    raise exception 'RN-GLO-09 FALLA: el bucket de fotos admite lo que no debe';
  end if;

  if coalesce(v_bucket.file_size_limit, 0) <= 0 then
    raise exception 'RN-GLO-09 FALLA: el bucket de fotos no tiene límite de tamaño';
  end if;
end;
$$;

-- `storage.objects` sin ninguna política es lo que cierra el bucket: la
-- migración 45 lo dejó así a propósito y la 109 se apoya en ello.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'RN-GLO-09 FALLA: storage.objects tiene RLS desactivado';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-GLO-09 · cada quien cambia la suya
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'd0200000-0000-0000-0000-000000000002';

do $$
begin
  perform public.set_my_avatar('d0200000-0000-0000-0000-000000000002/cara.png');

  if (select avatar_path from public.profiles
      where id = 'd0200000-0000-0000-0000-000000000002')
     is distinct from 'd0200000-0000-0000-0000-000000000002/cara.png' then
    raise exception 'RN-GLO-09 FALLA: la foto propia no se guardó';
  end if;
end;
$$;

-- ...y NO la de otro. Esta es la comprobación que justifica la función:
-- sin el prefijo, la fila propia acabaría apuntando a un objeto ajeno.
do $$
begin
  begin
    perform public.set_my_avatar('d0200000-0000-0000-0000-000000000001/cara.png');
    raise exception 'RN-GLO-09 FALLA: se guardó como foto propia la ruta de otra persona';
  exception
    when others then
      if sqlerrm like 'RN-GLO-09 FALLA%' then raise; end if;
  end;

  -- Y la fila de la dueña sigue sin foto: nadie se la ha puesto.
  if (select avatar_path from public.profiles
      where id = 'd0200000-0000-0000-0000-000000000001') is not null then
    raise exception 'RN-GLO-09 FALLA: alguien le puso una foto a otra persona';
  end if;
end;
$$;

-- El uuid como prefijo, pero sin la barra, no vale: un uuid distinto que
-- empezara por las mismas letras pasaría.
do $$
begin
  begin
    perform public.set_my_avatar('d0200000-0000-0000-0000-000000000002cara.png');
    raise exception 'RN-GLO-09 FALLA: una ruta sin carpeta propia pasó la comprobación';
  exception
    when others then
      if sqlerrm like 'RN-GLO-09 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- CLAUDE.md MUST NOT · el cliente no ve la cara del equipo
-- ------------------------------------------------------------
--
-- La foto es identidad. Aquí el cliente se sienta y mira: tiene que ver la
-- suya y **ninguna** de las dos del equipo. No lo sostiene una regla nueva
-- sino `profiles_select`, y por eso se comprueba con una consulta normal a
-- `profiles`, que es lo que haría una pantalla.
set local "request.jwt.claim.sub" = 'd0200000-0000-0000-0000-000000000003';

do $$
declare
  v_ajenas integer;
begin
  perform public.set_my_avatar('d0200000-0000-0000-0000-000000000003/cara.png');

  if (select avatar_path from public.profiles
      where id = 'd0200000-0000-0000-0000-000000000003')
     is distinct from 'd0200000-0000-0000-0000-000000000003/cara.png' then
    raise exception 'RN-GLO-09 FALLA: el restaurante no puede poner su propia foto';
  end if;

  select count(*) into v_ajenas
  from public.profiles
  where id in ('d0200000-0000-0000-0000-000000000001',
               'd0200000-0000-0000-0000-000000000002');

  if v_ajenas <> 0 then
    raise exception 'CLAUDE.md FALLA: el cliente alcanza % perfiles del equipo, y con ellos su foto', v_ajenas;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-GLO-09 · el equipo sí se ve entre sí
-- ------------------------------------------------------------
--
-- Es lo que el diseño enseña en la página 22 (carga de trabajo y actividad
-- reciente), y las dos personas comparten espacio. Si esto fallara, la
-- foto no serviría para nada.
set local "request.jwt.claim.sub" = 'd0200000-0000-0000-0000-000000000001';

do $$
begin
  if (select avatar_path from public.profiles
      where id = 'd0200000-0000-0000-0000-000000000002')
     is distinct from 'd0200000-0000-0000-0000-000000000002/cara.png' then
    raise exception 'RN-GLO-09 FALLA: el equipo no ve la foto de su compañero';
  end if;

  -- Y la del cliente no: la dueña del espacio tampoco comparte
  -- `space_memberships` con él.
  if exists (select 1 from public.profiles
             where id = 'd0200000-0000-0000-0000-000000000003') then
    raise exception 'RN-GLO-09 FALLA: el equipo lee el perfil de un cliente por consulta directa';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-GLO-09 · quitarla es volver a la inicial
-- ------------------------------------------------------------
set local "request.jwt.claim.sub" = 'd0200000-0000-0000-0000-000000000002';

do $$
begin
  perform public.clear_my_avatar();

  if (select avatar_path from public.profiles
      where id = 'd0200000-0000-0000-0000-000000000002') is not null then
    raise exception 'RN-GLO-09 FALLA: quitar la foto no la quitó';
  end if;
end;
$$;

-- Nadie se ha borrado: quitar la foto no es borrar la persona (CLAUDE.md).
set local role postgres;
do $$
begin
  if not exists (select 1 from public.profiles
                 where id = 'd0200000-0000-0000-0000-000000000002') then
    raise exception 'CLAUDE.md FALLA: quitar la foto borró el perfil';
  end if;
end;
$$;

rollback;
