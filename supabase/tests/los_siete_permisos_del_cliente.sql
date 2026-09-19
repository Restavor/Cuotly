-- ============================================================
-- Suite 56 · Los siete permisos del cliente (PRD RN-EST-15/16/17)
-- ============================================================
--
-- Lo que vigila:
--
--   · **El Propietario los tiene todos** y no se le configuran. Si se le
--     pudiera quitar "Usuarios y accesos", su restaurante se quedaría sin
--     nadie dentro que pudiera devolvérselo.
--   · **Un Editor sin casillas no puede nada**, y cada casilla abre **solo
--     lo suyo**. Es la mitad que de verdad importa: un permiso que se
--     guarda pero no se comprueba es una casilla decorativa.
--   · **`consulta` ya no existe** (RN-EST-16).
--   · **Desde dentro del panel no se toca al Propietario** (RN-EST-17).
--
-- Prefijo de esta suite: d0100000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('d0100000-0000-0000-0000-000000000001', 'duena@suite56.test', 'authenticated', 'authenticated'),
  ('d0100000-0000-0000-0000-000000000002', 'propietario@suite56.test', 'authenticated', 'authenticated'),
  ('d0100000-0000-0000-0000-000000000003', 'editor@suite56.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d0100000-0000-0000-0000-000000000001', 'duena@suite56.test', 'Dueña 56'),
  ('d0100000-0000-0000-0000-000000000002', 'propietario@suite56.test', 'Propietario 56'),
  ('d0100000-0000-0000-0000-000000000003', 'editor@suite56.test', 'Editor 56')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by)
values ('d0100000-0000-0000-0000-000000000010', 'Espacio 56', 'espacio-56', 'Europe/Madrid',
        'd0100000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status)
values ('d0100000-0000-0000-0000-000000000010', 'd0100000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name)
values ('d0100000-0000-0000-0000-000000000015', 'd0100000-0000-0000-0000-000000000010', 'Grupo 56');

insert into public.establishments (id, space_id, group_id, code, name, status)
values ('d0100000-0000-0000-0000-000000000020', 'd0100000-0000-0000-0000-000000000010',
        'd0100000-0000-0000-0000-000000000015', 'R56', 'Magariños 56', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('d0100000-0000-0000-0000-000000000030', 'd0100000-0000-0000-0000-000000000020',
   'd0100000-0000-0000-0000-000000000002', 'local_owner'),
  ('d0100000-0000-0000-0000-000000000031', 'd0100000-0000-0000-0000-000000000020',
   'd0100000-0000-0000-0000-000000000003', 'editor');

-- ------------------------------------------------------------
-- RN-EST-16 · `consulta` ya no existe
-- ------------------------------------------------------------
do $$
begin
  begin
    insert into public.establishment_memberships (establishment_id, user_id, role)
    values ('d0100000-0000-0000-0000-000000000020', 'd0100000-0000-0000-0000-000000000001', 'consulta');
    raise exception 'RN-EST-16 FALLA: se pudo crear un acceso con rol `consulta`';
  exception
    when others then
      if sqlerrm like 'RN-EST-16 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- RN-EST-15 · el Propietario los tiene los siete
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'd0100000-0000-0000-0000-000000000002';

do $$
declare
  v_permiso text;
begin
  foreach v_permiso in array array[
    'create_requests', 'edit_menus', 'use_messages', 'upload_files',
    'view_reports', 'view_billing', 'manage_users'
  ] loop
    if not public.client_permission('d0100000-0000-0000-0000-000000000020', v_permiso) then
      raise exception 'RN-EST-15 FALLA: al Propietario le falta "%"', v_permiso;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- RN-EST-15 · un Editor recién creado no puede NADA
-- ------------------------------------------------------------
set local "request.jwt.claim.sub" = 'd0100000-0000-0000-0000-000000000003';

do $$
declare
  v_permiso text;
begin
  foreach v_permiso in array array[
    'create_requests', 'edit_menus', 'use_messages', 'upload_files',
    'view_reports', 'view_billing', 'manage_users'
  ] loop
    if public.client_permission('d0100000-0000-0000-0000-000000000020', v_permiso) then
      raise exception 'RN-EST-15 FALLA: un Editor sin casillas tiene "%"', v_permiso;
    end if;
  end loop;
end;
$$;

-- Y no es teoría: las puertas de verdad dicen que no.
do $$
begin
  begin
    perform public.create_request_draft(
      'd0100000-0000-0000-0000-000000000020', 'Algo', null, 'medium', 'porque sí');
    raise exception 'RN-EST-15 FALLA: un Editor sin permiso creó una solicitud';
  exception
    when others then
      if sqlerrm like 'RN-EST-15 FALLA%' then raise; end if;
  end;

  if public.can_write_menus('d0100000-0000-0000-0000-000000000020') then
    raise exception 'RN-EST-15 FALLA: un Editor sin permiso escribe menús';
  end if;

  if public.can_write_file('d0100000-0000-0000-0000-000000000020', 'menus') then
    raise exception 'RN-EST-15 FALLA: un Editor sin permiso sube archivos';
  end if;

  -- Decisión 52 · "Consultar informes" es el séptimo permiso, y un Editor
  -- nuevo nace sin él. Esto estuvo al revés entre la 28c y la 52: si
  -- alguien lo vuelve a dar la vuelta, que sea leyendo por qué.
  if public.client_can_view_reports('d0100000-0000-0000-0000-000000000020') then
    raise exception 'RN-EST-15 FALLA: un Editor sin permiso ve informes';
  end if;

  if public.client_can_view_billing('d0100000-0000-0000-0000-000000000020') then
    raise exception 'RN-EST-15 FALLA: un Editor sin permiso ve la facturación';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-REP-01 · el séptimo permiso abre los informes y nada más
-- ------------------------------------------------------------
--
-- Migración 108, decisión 52. Es la casilla con más historia de las
-- siete —existió, se quitó y ha vuelto—, así que se prueba entera: que
-- abre lo suyo, y que no abre nada más.
set local role postgres;
insert into public.establishment_permissions (establishment_membership_id, view_reports)
values ('d0100000-0000-0000-0000-000000000031', true)
on conflict (establishment_membership_id) do update set view_reports = true;

set local role authenticated;
set local "request.jwt.claim.sub" = 'd0100000-0000-0000-0000-000000000003';

do $$
begin
  if not public.client_can_view_reports('d0100000-0000-0000-0000-000000000020') then
    raise exception 'RN-REP-01 FALLA: con "Consultar informes" no ve los informes';
  end if;

  if public.can_write_menus('d0100000-0000-0000-0000-000000000020') then
    raise exception 'RN-REP-01 FALLA: "Consultar informes" abrió también los menús';
  end if;

  if public.client_can_view_billing('d0100000-0000-0000-0000-000000000020') then
    raise exception 'RN-REP-01 FALLA: "Consultar informes" abrió también la facturación';
  end if;
end;
$$;

-- Y se apaga otra vez, que el bloque siguiente prueba una casilla sola.
set local role postgres;
update public.establishment_permissions
set view_reports = false
where establishment_membership_id = 'd0100000-0000-0000-0000-000000000031';

-- ------------------------------------------------------------
-- RN-EST-15 · cada casilla abre SOLO lo suyo
-- ------------------------------------------------------------
--
-- El fallo que esto busca es el de copiar y pegar: una puerta que mira el
-- permiso equivocado pasa desapercibida si solo se prueba con todo
-- encendido.
set local role postgres;
insert into public.establishment_permissions (establishment_membership_id, edit_menus)
values ('d0100000-0000-0000-0000-000000000031', true)
on conflict (establishment_membership_id) do update set edit_menus = true;

set local role authenticated;
set local "request.jwt.claim.sub" = 'd0100000-0000-0000-0000-000000000003';

do $$
begin
  if not public.can_write_menus('d0100000-0000-0000-0000-000000000020') then
    raise exception 'RN-EST-15 FALLA: con "Editar menús" no escribe menús';
  end if;

  -- Y NADA más se ha abierto.
  if public.can_write_file('d0100000-0000-0000-0000-000000000020', 'menus') then
    raise exception 'RN-EST-15 FALLA: "Editar menús" abrió también la subida de archivos';
  end if;

  if public.client_can_view_reports('d0100000-0000-0000-0000-000000000020') then
    raise exception 'RN-EST-15 FALLA: "Editar menús" abrió también los informes';
  end if;

  if public.client_permission('d0100000-0000-0000-0000-000000000020', 'use_messages') then
    raise exception 'RN-EST-15 FALLA: "Editar menús" abrió también los mensajes';
  end if;

  begin
    perform public.create_request_draft(
      'd0100000-0000-0000-0000-000000000020', 'Algo', null, 'medium', 'porque sí');
    raise exception 'RN-EST-15 FALLA: "Editar menús" abrió también crear solicitudes';
  exception
    when others then
      if sqlerrm like 'RN-EST-15 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- RN-EST-15 · al Propietario no se le configuran los permisos
-- ------------------------------------------------------------
set local "request.jwt.claim.sub" = 'd0100000-0000-0000-0000-000000000001';

do $$
begin
  begin
    perform public.set_establishment_permissions(
      'd0100000-0000-0000-0000-000000000020',
      'd0100000-0000-0000-0000-000000000002',
      '{"manage_users": false}'::jsonb);
    raise exception 'RN-EST-15 FALLA: se le quitaron permisos al Propietario del restaurante';
  exception
    when others then
      if sqlerrm like 'RN-EST-15 FALLA%' then raise; end if;
  end;
end;
$$;

-- El equipo sí configura a un Editor, y queda auditado.
do $$
declare
  v_apuntes integer;
begin
  perform public.set_establishment_permissions(
    'd0100000-0000-0000-0000-000000000020',
    'd0100000-0000-0000-0000-000000000003',
    '{"create_requests": true, "use_messages": true}'::jsonb);

  set local role postgres;
  select count(*) into v_apuntes from public.audit_log
  where action = 'establishment_permissions.set'
    and entity_id = 'd0100000-0000-0000-0000-000000000020';
  set local role authenticated;

  if v_apuntes < 1 then
    raise exception 'FALLA: cambiar permisos no dejó apunte de auditoría';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-EST-17 · desde dentro del panel no se toca al Propietario
-- ------------------------------------------------------------
set local role postgres;
update public.establishment_permissions set manage_users = true
where establishment_membership_id = 'd0100000-0000-0000-0000-000000000031';

set local role authenticated;
set local "request.jwt.claim.sub" = 'd0100000-0000-0000-0000-000000000003';

do $$
begin
  -- Con "Usuarios y accesos" gestiona a los demás Editores...
  if not public.client_can_manage_users('d0100000-0000-0000-0000-000000000020') then
    raise exception 'RN-EST-17 FALLA: con el permiso no puede gestionar usuarios';
  end if;

  -- ...y NO al Propietario. Si pudiera, el permiso sería una manera de
  -- quedarse con el restaurante.
  begin
    perform public.revoke_establishment_access(
      'd0100000-0000-0000-0000-000000000020',
      'd0100000-0000-0000-0000-000000000002', 'prueba');
    raise exception 'RN-EST-17 FALLA: un Editor retiró al Propietario del restaurante';
  exception
    when others then
      if sqlerrm like 'RN-EST-17 FALLA%' then raise; end if;
  end;

  begin
    perform public.grant_establishment_access(
      'd0100000-0000-0000-0000-000000000020', 'duena@suite56.test', 'local_owner');
    raise exception 'RN-EST-17 FALLA: un Editor nombró a otro Propietario';
  exception
    when others then
      if sqlerrm like 'RN-EST-17 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- RN-EST-15/17 · la lista que lee la pantalla del panel
-- ------------------------------------------------------------
--
-- `establishment_panel_users()` (migración 108). Lo que se vigila aquí es
-- lo que una pantalla puede filtrar mal sin que se note: que el
-- Propietario salga con las siete en `true` aunque no tenga fila de
-- casillas, que el Editor salga con lo suyo, y que **a un extraño no le
-- conteste**. La otra función, `establishment_client_users()`, no sirve
-- para esto: exige ser del espacio y le devolvería cero filas al
-- restaurante mirando su propio panel.
do $$
declare
  v_filas integer;
  v_prop record;
  v_editor record;
begin
  select count(*) into v_filas
  from public.establishment_panel_users('d0100000-0000-0000-0000-000000000020');

  if v_filas <> 2 then
    raise exception 'RN-EST-17 FALLA: el panel ve % accesos y hay 2', v_filas;
  end if;

  select * into v_prop
  from public.establishment_panel_users('d0100000-0000-0000-0000-000000000020')
  where role = 'local_owner';

  if not (v_prop.create_requests and v_prop.edit_menus and v_prop.use_messages
          and v_prop.upload_files and v_prop.view_reports and v_prop.view_billing
          and v_prop.manage_users) then
    raise exception 'RN-EST-17 FALLA: al Propietario le falta alguna casilla en la lista del panel';
  end if;

  select * into v_editor
  from public.establishment_panel_users('d0100000-0000-0000-0000-000000000020')
  where role = 'editor';

  -- A estas alturas de la suite este Editor tiene exactamente tres:
  -- "Crear solicitudes" y "Mensajes" se las dejó el bloque del equipo
  -- —`set_establishment_permissions()` escribe las SIETE, así que apagó
  -- las demás—, y "Usuarios y accesos" se la encendió a mano el bloque de
  -- RN-EST-17. Se comprueban las siete, una a una: media comprobación
  -- aquí es lo que deja pasar una pantalla que pinta la casilla
  -- equivocada.
  if not (v_editor.create_requests and v_editor.use_messages and v_editor.manage_users) then
    raise exception 'RN-EST-17 FALLA: al Editor le falta alguna casilla que sí tiene';
  end if;
  if v_editor.edit_menus or v_editor.upload_files or v_editor.view_reports
     or v_editor.view_billing then
    raise exception 'RN-EST-17 FALLA: el Editor sale con casillas que no tiene';
  end if;
  if v_editor.email is null then
    raise exception 'RN-EST-17 FALLA: la lista del panel no trae el correo y la pantalla pintaría uuids';
  end if;
end;
$$;

-- Y a quien no tiene nada que ver con este restaurante, nada. Se prueba
-- con la dueña del espacio ANTES de que se la use como equipo: aquí entra
-- como miembro del espacio, así que se usa un usuario de fuera.
set local role postgres;
insert into auth.users (id, email, role, aud)
values ('d0100000-0000-0000-0000-000000000009', 'fuera@suite56.test', 'authenticated', 'authenticated');
insert into public.profiles (id, email, full_name)
values ('d0100000-0000-0000-0000-000000000009', 'fuera@suite56.test', 'De fuera')
on conflict (id) do nothing;

set local role authenticated;
set local "request.jwt.claim.sub" = 'd0100000-0000-0000-0000-000000000009';

do $$
begin
  if exists (select 1 from public.establishment_panel_users('d0100000-0000-0000-0000-000000000020')) then
    raise exception 'RN-EST-17 FALLA: alguien de fuera lee los usuarios de un restaurante ajeno';
  end if;
end;
$$;

-- El equipo sí puede con el Propietario: es quien crea el panel.
set local "request.jwt.claim.sub" = 'd0100000-0000-0000-0000-000000000001';

do $$
begin
  if not public.revoke_establishment_access(
       'd0100000-0000-0000-0000-000000000020',
       'd0100000-0000-0000-0000-000000000002', 'prueba') then
    raise exception 'RN-EST-17 FALLA: el equipo no pudo retirar al Propietario';
  end if;
end;
$$;

rollback;
