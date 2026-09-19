-- ============================================================
-- Suite 54 · Crear el panel del restaurante (PRD §40.1, RN-PAN-09 a 13)
-- ============================================================
--
-- El diseño definitivo móvil (página 56) dibuja "Crear panel del
-- restaurante" como un acto. Lo que aquí se comprueba es que ese acto no
-- inventa un estado nuevo:
--
--   · **"Panel creado" se DERIVA** de que haya un acceso vivo (RN-PAN-09).
--     La suite falla si aparece una columna de estado en `establishments`,
--     porque una bandera guardada puede decir "creado" con todos los
--     accesos revocados.
--   · **Crear el panel es dar el primer acceso** (RN-PAN-10) y **no crea
--     espacio ni membresía del espacio ni suscripción** (RN-PAN-11). Lo
--     dice la propia pantalla del diseño.
--   · **Se avisa a quien lo recibe, y UNA vez** (RN-PAN-12). Antes se le
--     daba acceso en silencio. Y repasarle los permisos a quien ya entraba
--     no es "te han dado acceso": pulsar Guardar dos veces no puede
--     mandarle dos correos.
--   · **Quitar el último acceso deja el restaurante sin panel**
--     (RN-PAN-13). Parece un fallo cuando pasa; es la única lectura que no
--     miente.
--
-- Prefijo de esta suite: ce100000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('ce100000-0000-0000-0000-000000000001', 'duena@suite54.test', 'authenticated', 'authenticated'),
  ('ce100000-0000-0000-0000-000000000002', 'cliente@suite54.test', 'authenticated', 'authenticated'),
  ('ce100000-0000-0000-0000-000000000003', 'segundo@suite54.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('ce100000-0000-0000-0000-000000000001', 'duena@suite54.test', 'Dueña 54'),
  ('ce100000-0000-0000-0000-000000000002', 'cliente@suite54.test', 'Cliente 54'),
  ('ce100000-0000-0000-0000-000000000003', 'segundo@suite54.test', 'Segundo 54')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by)
values ('ce100000-0000-0000-0000-000000000010', 'Espacio 54', 'espacio-54', 'Europe/Madrid',
        'ce100000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status)
values ('ce100000-0000-0000-0000-000000000010', 'ce100000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name)
values ('ce100000-0000-0000-0000-000000000015', 'ce100000-0000-0000-0000-000000000010', 'Grupo 54');

insert into public.establishments (id, space_id, group_id, code, name, status)
values ('ce100000-0000-0000-0000-000000000020', 'ce100000-0000-0000-0000-000000000010',
        'ce100000-0000-0000-0000-000000000015', 'R54', 'Magariños 54', 'active');

-- ------------------------------------------------------------
-- RN-PAN-09 · el estado se deriva, y no hay columna que lo guarde
-- ------------------------------------------------------------
do $$
declare
  v_sospechosas text;
begin
  select string_agg(a.attname, ', ')
  into v_sospechosas
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'establishments'
    and a.attnum > 0 and not a.attisdropped
    and (a.attname like '%panel%');

  if v_sospechosas is not null then
    raise exception
      'RN-PAN-09 FALLA: `establishments` guarda estado de panel (%). Una bandera puede decir "creado" con todos los accesos revocados: el estado se DERIVA. Si esto es a propósito, reescribe RN-PAN-09',
      v_sospechosas;
  end if;
end;
$$;

-- Sin nadie del lado cliente, no hay panel.
do $$
begin
  if exists (
    select 1 from public.establishment_memberships
    where establishment_id = 'ce100000-0000-0000-0000-000000000020' and revoked_at is null
  ) then
    raise exception 'RN-PAN-09 FALLA: el restaurante nació con panel';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-PAN-10/11/12 · crear el panel es dar el primer acceso, y avisa
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'ce100000-0000-0000-0000-000000000001';

do $$
declare
  v_membresia uuid;
  v_avisos integer;
  v_aviso public.notifications;
begin
  v_membresia := public.grant_establishment_access(
    'ce100000-0000-0000-0000-000000000020', 'cliente@suite54.test', 'local_owner');

  if v_membresia is null then
    raise exception 'RN-PAN-10 FALLA: no se creó el acceso';
  end if;

  -- RN-PAN-12 · UN aviso, para quien lo recibe.
  set local role postgres;
  select count(*) into v_avisos from public.notifications
  where event_type = 'establishment_access_granted'
    and recipient_id = 'ce100000-0000-0000-0000-000000000002';

  if v_avisos <> 1 then
    raise exception 'RN-PAN-12 FALLA: esperaba 1 aviso y hay %', v_avisos;
  end if;

  select * into v_aviso from public.notifications
  where event_type = 'establishment_access_granted'
    and recipient_id = 'ce100000-0000-0000-0000-000000000002';

  if v_aviso.audience <> 'client' then
    raise exception 'RN-PAN-12 FALLA: el aviso salió con audiencia "%", y es del cliente', v_aviso.audience;
  end if;

  -- Lleva a SU panel, no a la ficha del equipo: son la misma dirección y
  -- cada quien ve la suya (RN-PAN-01, RN-PAN-08).
  if v_aviso.deep_link is distinct from
     '/espacios/espacio-54/restaurantes/ce100000-0000-0000-0000-000000000020' then
    raise exception 'RN-PAN-12 FALLA: el aviso no lleva al panel, lleva a "%"', v_aviso.deep_link;
  end if;
  set local role authenticated;
end;
$$;

-- RN-PAN-11 · no creó espacio, ni membresía del espacio, ni suscripción.
set local role postgres;
do $$
begin
  if exists (
    select 1 from public.space_memberships
    where space_id = 'ce100000-0000-0000-0000-000000000010'
      and user_id = 'ce100000-0000-0000-0000-000000000002'
  ) then
    raise exception 'RN-PAN-11 FALLA: crear el panel metió al cliente en el ESPACIO de mantenimiento';
  end if;

  if (select count(*) from public.spaces) <> (
      select count(*) from public.spaces where id <> '00000000-0000-0000-0000-000000000000')
     and exists (select 1 from public.spaces where created_by = 'ce100000-0000-0000-0000-000000000002') then
    raise exception 'RN-PAN-11 FALLA: crear el panel creó un espacio';
  end if;

  if exists (
    select 1 from public.subscriptions
    where establishment_id = 'ce100000-0000-0000-0000-000000000020'
      and created_at >= now() - interval '1 minute'
  ) then
    raise exception 'RN-PAN-11 FALLA: crear el panel contrató una suscripción';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-PAN-12 · a quien YA entraba no se le vuelve a avisar
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'ce100000-0000-0000-0000-000000000001';

do $$
declare
  v_avisos integer;
begin
  -- Repasarle los permisos no es "te han dado acceso". Y pulsar Guardar
  -- dos veces no puede mandar dos correos (CLAUDE.md).
  perform public.grant_establishment_access(
    'ce100000-0000-0000-0000-000000000020', 'cliente@suite54.test', 'editor', true, false);
  perform public.grant_establishment_access(
    'ce100000-0000-0000-0000-000000000020', 'cliente@suite54.test', 'editor', true, false);

  set local role postgres;
  select count(*) into v_avisos from public.notifications
  where event_type = 'establishment_access_granted'
    and recipient_id = 'ce100000-0000-0000-0000-000000000002';

  if v_avisos <> 1 then
    raise exception 'RN-PAN-12 FALLA: a quien ya entraba se le avisó otra vez (% avisos)', v_avisos;
  end if;
  set local role authenticated;
end;
$$;

-- ------------------------------------------------------------
-- RN-PAN-10 · sin cuenta de Cuotly no hay acceso que dar
-- ------------------------------------------------------------
do $$
begin
  begin
    perform public.grant_establishment_access(
      'ce100000-0000-0000-0000-000000000020', 'nadie@suite54.test', 'local_owner');
    raise exception 'RN-PAN-10 FALLA: se dio acceso a un correo sin cuenta';
  exception
    when others then
      if sqlerrm like 'RN-PAN-10 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- RN-PAN-13 · quitar el último acceso deja el restaurante sin panel
-- ------------------------------------------------------------
do $$
declare
  v_vivos integer;
begin
  -- Se añade un segundo y se quita: con uno vivo, sigue habiendo panel.
  perform public.grant_establishment_access(
    'ce100000-0000-0000-0000-000000000020', 'segundo@suite54.test', 'consulta');
  perform public.revoke_establishment_access(
    'ce100000-0000-0000-0000-000000000020', 'ce100000-0000-0000-0000-000000000003', 'prueba');

  set local role postgres;
  select count(*) into v_vivos from public.establishment_memberships
  where establishment_id = 'ce100000-0000-0000-0000-000000000020' and revoked_at is null;
  set local role authenticated;

  if v_vivos <> 1 then
    raise exception 'RN-PAN-13 FALLA: quedan % accesos vivos y esperaba 1', v_vivos;
  end if;

  -- Y al quitar el último, el restaurante se queda sin panel.
  perform public.revoke_establishment_access(
    'ce100000-0000-0000-0000-000000000020', 'ce100000-0000-0000-0000-000000000002', 'prueba');

  set local role postgres;
  select count(*) into v_vivos from public.establishment_memberships
  where establishment_id = 'ce100000-0000-0000-0000-000000000020' and revoked_at is null;
  set local role authenticated;

  if v_vivos <> 0 then
    raise exception 'RN-PAN-13 FALLA: el restaurante sigue teniendo % accesos vivos', v_vivos;
  end if;
end;
$$;

-- Y devolverle el acceso SÍ vuelve a avisar: se fue y ha vuelto, que es
-- justo lo que el aviso cuenta.
do $$
declare
  v_avisos integer;
begin
  perform public.grant_establishment_access(
    'ce100000-0000-0000-0000-000000000020', 'cliente@suite54.test', 'local_owner');

  set local role postgres;
  select count(*) into v_avisos from public.notifications
  where event_type = 'establishment_access_granted'
    and recipient_id = 'ce100000-0000-0000-0000-000000000002';
  set local role authenticated;

  if v_avisos <> 2 then
    raise exception 'RN-PAN-12 FALLA: devolver un acceso revocado no avisó (% avisos)', v_avisos;
  end if;
end;
$$;

rollback;
