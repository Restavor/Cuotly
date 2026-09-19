-- ============================================================
-- Migración 107 · Los siete permisos del cliente (RN-EST-15/16/17, decisión 51)
-- ============================================================
--
-- Las páginas 152 y 153 del diseño definitivo móvil dibujan "Usuarios y
-- accesos" del panel del restaurante: **dos roles** —Propietario y
-- Editor— y **siete permisos** con casilla sobre el Editor.
--
-- **De los siete, esta migración cablea SEIS.** El séptimo, "Consultar
-- informes", está **parado a la espera de Bosco** y por eso no aparece
-- aquí: ni columna, ni entrada en `client_permission()`, ni cambio en
-- `client_can_view_reports()`. El motivo es que ese permiso ya existió
-- —columna `establishment_permissions.view_reports` y su función, de la
-- migración 85— y **Bosco lo quitó entero el 14/09/2026** (decisión 28c,
-- RN-REP-01): el informe lo ve cualquier persona del restaurante con el
-- acceso vigente, sin distinguir rol ni permiso. Volver a ponerlo cinco
-- días después es deshacer una decisión suya, y CLAUDE.md dice que una
-- contradicción no se resuelve por cuenta propia. Hasta que la resuelva,
-- quien trabaja en el restaurante sigue viendo los informes: la conducta
-- de hoy no cambia en ningún sentido.
--
-- Hasta hoy había tres roles (`local_owner`, `editor`, `consulta`) y
-- **dos** permisos finos (`edit_establishment_data`, `view_billing`); lo
-- demás salía del rol.
--
-- **Tres cosas que esta migración hace a propósito y conviene no
-- deshacer:**
--
--   1. **Los permisos afinan hacia ABAJO.** El Propietario los tiene todos
--      y no se le pueden quitar. Un restaurante cuyo propietario perdiera
--      `manage_users` no podría volver a tocar sus accesos nunca, y no
--      habría nadie dentro que pudiera devolvérselos.
--   2. **Una sola puerta.** `client_permission()` decide, y las funciones
--      de negocio la llaman. Siete copias de la misma regla acabarían
--      diciendo siete cosas: es el mismo motivo por el que la lista de
--      alérgenos se retiró de dos sitios.
--   3. **`consulta` se convierte, no se borra.** Un Editor con las seis
--      casillas apagadas hace exactamente lo que hacía un Consulta: leer
--      —los informes incluidos, que los ve todo el restaurante—.
--      Las filas se quedan donde están (CLAUDE.md), cambia su rol y nacen
--      con todo en `false`.

-- ------------------------------------------------------------
-- 1 · Las cinco columnas nuevas
-- ------------------------------------------------------------
--
-- `view_billing` y `edit_establishment_data` ya existían. `view_billing`
-- es el sexto permiso del diseño; `edit_establishment_data` **no está**
-- entre los siete y se queda como estaba (RN-EST-11: los datos fiscales).
alter table public.establishment_permissions
  add column create_requests boolean not null default false,
  add column edit_menus boolean not null default false,
  add column use_messages boolean not null default false,
  add column upload_files boolean not null default false,
  add column manage_users boolean not null default false;

comment on table public.establishment_permissions is
  'RN-EST-15 · los permisos finos de un acceso al restaurante. Solo
   configuran al EDITOR: el Propietario los tiene todos por su rol y
   `client_permission()` ni los mira. Un permiso nuevo nace en false.';

-- ------------------------------------------------------------
-- 2 · La puerta única
-- ------------------------------------------------------------
--
-- Devuelve `false` para quien no es del lado cliente de este
-- restaurante: **no dice que no sea del equipo**, dice que no tiene ESTE
-- permiso de cliente. Las funciones que sirven a los dos lados siguen
-- preguntando por la capacidad del equipo aparte, como hacían.
create or replace function public.client_permission(
  p_establishment_id uuid,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_grupo text;
  v_membresia uuid;
  v_concedido boolean;
begin
  if p_permission not in (
    'create_requests', 'edit_menus', 'use_messages', 'upload_files',
    'view_billing', 'manage_users'
  ) then
    -- 'view_reports' NO está en la lista a propósito: ver la cabecera.
    -- Que reviente si alguien lo pregunta es lo que se quiere; el día que
    -- Bosco decida, se añade aquí y en `client_can_view_reports()`.
    raise exception 'Permiso de cliente desconocido: %', p_permission;
  end if;

  -- El grupo (migración 74), y **no todos sus miembros igual**. Esto
  -- empezó siendo un `return true` para cualquier miembro de grupo y la
  -- suite del Hito 2 lo tumbó: un Editor de grupo veía la facturación, que
  -- RN-FIN-07 reserva al propietario global. Se escribe cada caso.
  select gm.role into v_grupo
  from public.group_memberships gm
  join public.establishments e on e.group_id = gm.group_id
  where e.id = p_establishment_id
    and gm.user_id = auth.uid()
    and gm.revoked_at is null;

  if v_grupo = 'global_owner' then
    -- Manda en todos sus restaurantes, facturación incluida.
    return true;
  end if;

  if v_grupo = 'editor' then
    -- Lo que un Editor de grupo ya podía hacer antes de RN-EST-15: el
    -- contenido, sí; la facturación, no (RN-FIN-07); los accesos, tampoco
    -- —`grant_group_*` ni siquiera admite ese rol—.
    return p_permission in (
      'create_requests', 'edit_menus', 'use_messages', 'upload_files'
    );
  end if;

  select em.role, em.id into v_rol, v_membresia
  from public.establishment_memberships em
  where em.establishment_id = p_establishment_id
    and em.user_id = auth.uid()
    and em.revoked_at is null;

  if v_rol is null then
    return false;
  end if;

  -- RN-EST-15 · el Propietario los tiene todos y no se le pueden quitar.
  if v_rol = 'local_owner' then
    return true;
  end if;

  execute format('select coalesce(%I, false) from public.establishment_permissions where establishment_membership_id = $1', p_permission)
  into v_concedido
  using v_membresia;

  return coalesce(v_concedido, false);
end;
$$;

comment on function public.client_permission(uuid, text) is
  'RN-EST-15 · la ÚNICA puerta de los siete permisos del cliente. El
   Propietario los tiene todos; al Editor se le miran las casillas; quien
   no es del lado cliente recibe false —que no significa "no es del
   equipo", eso se pregunta aparte—.';

-- Aparece dentro de expresiones de RLS a través de las funciones que la
-- llaman, así que `authenticated` la ejecuta (CLAUDE.md: revocársela
-- rompería la política en vez de cerrarla).
revoke all on function public.client_permission(uuid, text) from public, anon;
grant execute on function public.client_permission(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3 · Los Editores de HOY conservan lo que ya podían hacer
-- ------------------------------------------------------------
--
-- **Esta es la parte peligrosa de la migración.** Las columnas nacen en
-- `false`, y un Editor de hoy ya podía crear solicitudes, pedir cambios de
-- menú, escribir mensajes y adjuntar archivos: eso salía de su rol, no de
-- una casilla. Aplicar esto sin rellenar dejaría a todos los
-- Editores existentes sin poder hacer nada, de un día para otro y sin que
-- nadie lo tocara.
--
-- Así que se les concede lo que ya tenían. Dos excepciones:
--
--   · `manage_users` NO se rellena: es una capacidad nueva y nadie la
--     tenía. Un relleno aquí le daría a cada Editor del mundo la llave de
--     los accesos de su restaurante sin que nadie lo decidiera.
--   · `view_billing` se deja **como está**: ya era una columna de verdad
--     con valores de verdad, elegidos uno a uno. Rellenarla sería
--     enseñarle la facturación a quien se decidió que no la viera.
--
-- Se hace ANTES de convertir los `consulta`, porque después ya serían
-- editores y se llevarían permisos que nunca tuvieron.
insert into public.establishment_permissions (establishment_membership_id)
select em.id from public.establishment_memberships em
where em.role = 'editor'
  and not exists (
    select 1 from public.establishment_permissions ep
    where ep.establishment_membership_id = em.id
  );

update public.establishment_permissions ep
set create_requests = true, edit_menus = true, use_messages = true,
    upload_files = true
from public.establishment_memberships em
where em.id = ep.establishment_membership_id
  and em.role = 'editor'
  and em.revoked_at is null;

-- ------------------------------------------------------------
-- 4 · `consulta` se convierte en Editor sin permisos (RN-EST-16)
-- ------------------------------------------------------------
--
-- Hace exactamente lo mismo que hacía: leer. Primero se asegura de que
-- tiene fila de permisos —con todo en false— y después se le cambia el
-- rol, en ese orden: al revés habría un instante en que sería un Editor
-- sin fila, y `client_permission()` le devolvería false igualmente, pero
-- el orden correcto se lee mejor y no depende de eso.
insert into public.establishment_permissions (establishment_membership_id)
select em.id from public.establishment_memberships em
where em.role = 'consulta'
  and not exists (
    select 1 from public.establishment_permissions ep
    where ep.establishment_membership_id = em.id
  );

update public.establishment_permissions ep
set create_requests = false, edit_menus = false, use_messages = false,
    upload_files = false, manage_users = false,
    view_billing = false, edit_establishment_data = false
from public.establishment_memberships em
where em.id = ep.establishment_membership_id and em.role = 'consulta';

update public.establishment_memberships
set role = 'editor'
where role = 'consulta';

-- Y el rol deja de existir en el catálogo.
alter table public.establishment_memberships
  drop constraint establishment_memberships_role_check;

alter table public.establishment_memberships
  add constraint establishment_memberships_role_check
  check (role in ('local_owner', 'editor'));

comment on column public.establishment_memberships.role is
  'RN-EST-15/16 · Propietario (`local_owner`) o Editor (`editor`). El rol
   `consulta` se retiró el 19/09/2026: era un Editor con todos los
   permisos apagados, que es lo mismo dicho con una pieza menos.';

-- ------------------------------------------------------------
-- 5 · Las puertas: cada permiso manda de verdad
-- ------------------------------------------------------------
--
-- Hasta aquí los permisos son columnas. Esto es lo que los convierte en
-- permisos: **el servidor dice que no**. Ocultar la casilla no es un
-- control (CLAUDE.md), así que cada uno se comprueba donde se ejerce.
--
-- `can_write_establishment()` **no se toca**: es la puerta genérica de "el
-- cliente escribe en este restaurante" y la usan muchas cosas que no son
-- ninguno de los siete. Lo que cambia son las puertas de cada dominio.

-- Editar menús.
create or replace function public.can_write_menus(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      public.can_write_establishment(p_establishment_id)
      and public.client_permission(p_establishment_id, 'edit_menus')
    )
    or public.has_capability(
         (select e.space_id from public.establishments e where e.id = p_establishment_id),
         'manage_requests');
$$;

comment on function public.can_write_menus(uuid) is
  'RN-MEN, RN-EST-15 · quién escribe el contenido de un menú: el equipo con
   `manage_requests`, y del lado cliente quien tenga el permiso "Editar
   menús".';

revoke all on function public.can_write_menus(uuid) from public, anon;
grant execute on function public.can_write_menus(uuid) to authenticated;

-- Consultar informes: `client_can_view_reports()` NO se toca. Sigue
-- diciendo lo que dice desde la decisión 28c (14/09/2026): lo ve cualquier
-- persona del restaurante con el acceso vigente. El permiso "Consultar
-- informes" del diseño está parado a la espera de Bosco (ver la cabecera),
-- y hasta entonces nadie deja de ver un informe que hoy ve.

-- Pagos y facturas. Ya tenía su columna desde el Hito 7; lo que cambia es
-- que la regla deja de estar escrita aquí y pasa a salir de la puerta
-- única, para que no haya dos sitios que decidan lo mismo. También vive
-- dentro de una política.
create or replace function public.client_can_view_billing(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = auth.uid()
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    )
    or public.client_permission(p_establishment_id, 'view_billing');
$$;

revoke all on function public.client_can_view_billing(uuid) from public, anon;
grant execute on function public.client_can_view_billing(uuid) to authenticated;

-- Subir archivos.
create or replace function public.can_write_file(p_establishment_id uuid, p_category text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
begin
  if v_space_id is null then
    return false;
  end if;

  if public.is_space_member(v_space_id) then
    if p_category = 'billing' then
      return public.has_capability(v_space_id, 'manage_finance')
        or public.is_authorized_worker_establishment(p_establishment_id);
    end if;
    return public.has_capability(v_space_id, 'manage_requests')
      or public.is_authorized_worker_establishment(p_establishment_id);
  end if;

  -- Lado cliente: hace falta el permiso "Subir archivos" (RN-EST-15).
  -- Antes bastaba con poder escribir en el establecimiento. Para un
  -- justificante de pago (RN-FIN-06) hace falta ADEMÁS visibilidad
  -- financiera (RN-FIN-07): son dos permisos, no uno.
  if not public.client_permission(p_establishment_id, 'upload_files') then
    return false;
  end if;

  if p_category = 'billing' then
    return public.client_permission(p_establishment_id, 'view_billing');
  end if;

  return public.can_write_establishment(p_establishment_id);
end;
$$;

revoke all on function public.can_write_file(uuid, text) from public, anon;
grant execute on function public.can_write_file(uuid, text) to authenticated;

-- Mensajes.
create or replace function public.can_write_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
  v_space_id uuid;
  v_establishment_id uuid;
  v_archived timestamptz;
begin
  select c.type, c.space_id, c.archived_at into v_type, v_space_id, v_archived
  from public.conversations c where c.id = p_conversation_id;

  if v_type is null then
    return false;
  end if;

  if v_type = 'channel' then
    -- RN-CAN-05 · un canal archivado se lee y no se escribe: lo que se
    -- dijo dentro se dijo, y no se sigue diciendo.
    return v_archived is null and public.can_read_conversation(p_conversation_id);
  end if;

  if public.is_space_member(v_space_id) then
    return public.can_read_conversation(p_conversation_id);
  end if;

  if v_type = 'job_internal' then
    return false;
  end if;

  -- Lado cliente: hace falta el permiso "Mensajes" (RN-EST-15). Antes
  -- bastaba con poder escribir en el establecimiento.
  v_establishment_id := public.conversation_establishment_id(p_conversation_id);
  return public.can_write_establishment(v_establishment_id)
    and public.client_permission(v_establishment_id, 'use_messages');
end;
$$;

revoke all on function public.can_write_conversation(uuid) from public, anon;
grant execute on function public.can_write_conversation(uuid) to authenticated;

-- Crear solicitudes. Las dos puertas del borrador y el envío: crear uno y
-- no poder mandarlo sería un callejón, y poder mandar sin poder crear no
-- existe.
create or replace function public.create_request_draft(
  p_establishment_id uuid,
  p_description text,
  p_context text default null,
  p_priority text default null,
  p_priority_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_request_id uuid;
  v_code text;
  v_priority text := nullif(btrim(coalesce(p_priority, '')), '');
  v_reason text := nullif(btrim(coalesce(p_priority_reason, '')), '');
begin
  if not public.can_write_establishment(p_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  -- RN-EST-15 · "Crear solicitudes".
  if not public.client_permission(p_establishment_id, 'create_requests') then
    raise exception 'No tienes permiso para crear solicitudes en este restaurante';
  end if;

  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'La descripción de la solicitud no puede estar vacía';
  end if;

  if v_priority is not null and v_priority not in ('high', 'medium', 'low') then
    raise exception 'La prioridad tiene que ser alta, media o baja';
  end if;

  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'El motivo de la prioridad no puede pasar de 200 caracteres';
  end if;

  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  v_code := public.next_request_code(p_establishment_id);

  insert into public.requests
    (space_id, establishment_id, code, state, description, context, priority, priority_reason, created_by)
  values
    (v_space_id, p_establishment_id, v_code, 'draft', p_description, p_context,
     v_priority, v_reason, auth.uid())
  returning id into v_request_id;

  insert into public.request_versions (space_id, request_id, version_number, description, context, created_by)
  values (v_space_id, v_request_id, 1, p_description, p_context, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'request.draft_created', 'request', v_request_id,
          jsonb_build_object('code', v_code, 'priority', v_priority));

  return v_request_id;
end;
$$;

revoke all on function public.create_request_draft(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.create_request_draft(uuid, text, text, text, text)
  to authenticated;

-- ------------------------------------------------------------
-- 6 · Usuarios y accesos (RN-EST-17)
-- ------------------------------------------------------------
--
-- "Usuarios y accesos". Quién puede tocar los accesos de un restaurante: el
-- **equipo** con `manage_clients` —que es como se crea el panel
-- (RN-PAN-10)— y, dentro del panel, el **Propietario del restaurante**.
--
-- Un Editor con `manage_users` gestiona a los **demás Editores** y **no al
-- Propietario**: si pudiera, el permiso sería una manera de quedarse con
-- el restaurante. Esa distinción la hace `assert_can_manage_access()`, que
-- mira a QUIÉN se toca y no solo quién toca.
create or replace function public.client_can_manage_users(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.client_permission(p_establishment_id, 'manage_users');
$$;

revoke all on function public.client_can_manage_users(uuid) from public, anon;
grant execute on function public.client_can_manage_users(uuid) to authenticated;

-- Los permisos de una persona, en una llamada. Se escriben juntos
-- porque juntos se eligen en la pantalla, y porque así no hay un instante
-- con la mitad puestos.
create or replace function public.set_establishment_permissions(
  p_establishment_id uuid,
  p_user_id uuid,
  p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_membresia uuid;
  v_rol text;
  v_soy_equipo boolean;
  v_anterior jsonb;
begin
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  v_soy_equipo := public.has_capability(v_space_id, 'manage_clients');

  if not v_soy_equipo and not public.client_can_manage_users(p_establishment_id) then
    raise exception 'No tienes permiso para gestionar los accesos de este restaurante';
  end if;

  select em.id, em.role into v_membresia, v_rol
  from public.establishment_memberships em
  where em.establishment_id = p_establishment_id
    and em.user_id = p_user_id
    and em.revoked_at is null;

  if v_membresia is null then
    raise exception 'Esa persona no tiene acceso vivo a este restaurante';
  end if;

  -- RN-EST-15 · al Propietario no se le quitan permisos: los tiene por su
  -- rol y `client_permission()` ni mira las casillas. Dejar guardar aquí
  -- haría creer que se le han quitado.
  if v_rol = 'local_owner' then
    raise exception 'El propietario del restaurante tiene acceso completo: sus permisos no se configuran';
  end if;

  select to_jsonb(ep) - 'establishment_membership_id' into v_anterior
  from public.establishment_permissions ep
  where ep.establishment_membership_id = v_membresia;

  insert into public.establishment_permissions (
    establishment_membership_id, create_requests, edit_menus, use_messages,
    upload_files, view_billing, manage_users
  ) values (
    v_membresia,
    coalesce((p_permissions ->> 'create_requests')::boolean, false),
    coalesce((p_permissions ->> 'edit_menus')::boolean, false),
    coalesce((p_permissions ->> 'use_messages')::boolean, false),
    coalesce((p_permissions ->> 'upload_files')::boolean, false),
    coalesce((p_permissions ->> 'view_billing')::boolean, false),
    coalesce((p_permissions ->> 'manage_users')::boolean, false)
  )
  on conflict (establishment_membership_id) do update set
    create_requests = excluded.create_requests,
    edit_menus = excluded.edit_menus,
    use_messages = excluded.use_messages,
    upload_files = excluded.upload_files,
    view_billing = excluded.view_billing,
    manage_users = excluded.manage_users;

  -- CLAUDE.md · todo cambio de estado relevante deja actor, fecha, valor
  -- anterior y valor nuevo. Un permiso que cambia sin rastro es el que
  -- nadie sabe explicar tres meses después.
  insert into public.audit_log
    (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'establishment_permissions.set', 'establishment', p_establishment_id,
    jsonb_build_object('user_id', p_user_id, 'permissions', v_anterior),
    jsonb_build_object('user_id', p_user_id, 'permissions', p_permissions,
                       'by_team', v_soy_equipo)
  );
end;
$$;

comment on function public.set_establishment_permissions(uuid, uuid, jsonb) is
  'RN-EST-15/17 · los permisos de un Editor, de una vez. Los cambia
   el equipo (`manage_clients`) o quien tenga "Usuarios y accesos" dentro
   del panel. Al Propietario no: los tiene todos por su rol.';

revoke all on function public.set_establishment_permissions(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.set_establishment_permissions(uuid, uuid, jsonb)
  to authenticated;

-- ------------------------------------------------------------
-- 7 · Dar y retirar acceso: también desde el panel (RN-EST-17)
-- ------------------------------------------------------------
--
-- Dos cambios, y el primero es obligatorio: **`consulta` ya no existe** y
-- la lista de roles que estas funciones aceptaban lo nombraba. Dejarla
-- produciría un fallo de restricción con un mensaje que no explica nada.
--
-- El segundo es RN-EST-17: el Propietario del restaurante gestiona a los
-- suyos desde el panel. Con una regla que no es simétrica y por eso se
-- escribe aparte: **quien no es del equipo no toca al Propietario** —ni
-- para darle acceso, ni para quitárselo—. Si pudiera, "Usuarios y accesos"
-- sería una manera de quedarse con el restaurante.
create or replace function public.assert_can_manage_access(
  p_establishment_id uuid,
  p_target_role text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
begin
  if public.has_capability(v_space_id, 'manage_clients') then
    return;
  end if;

  if not public.client_permission(p_establishment_id, 'manage_users') then
    raise exception 'No tienes permiso para gestionar los accesos de este restaurante';
  end if;

  -- Desde dentro del panel, al Propietario solo lo toca el equipo.
  if p_target_role = 'local_owner' then
    raise exception 'El propietario del restaurante solo lo cambia el equipo de mantenimiento';
  end if;
end;
$$;

revoke all on function public.assert_can_manage_access(uuid, text) from public, anon;
grant execute on function public.assert_can_manage_access(uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION public.grant_establishment_access(p_establishment_id uuid, p_email text, p_role text, p_edit_establishment_data boolean DEFAULT false, p_view_billing boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_user_id uuid;
  v_membership_id uuid;
  v_previo public.establishment_memberships;
  v_edit boolean;
  v_billing boolean;
  v_slug text;
  v_tenia boolean;
begin
  v_space_id := public.establishment_space_id(p_establishment_id);

  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  -- RN-EST-15 · `consulta` se retiró el 19/09/2026: era un Editor con
  -- todos los permisos apagados.
  if p_role not in ('local_owner', 'editor') then
    raise exception 'El rol tiene que ser propietario del restaurante o editor';
  end if;

  -- RN-EST-17 · el equipo, o quien tenga "Usuarios y accesos" dentro del
  -- panel. Desde dentro no se toca al Propietario.
  perform public.assert_can_manage_access(p_establishment_id, p_role);

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(btrim(coalesce(p_email, '')));

  if v_user_id is null then
    -- No se crea nada a medias: en Cuotly se invita al espacio, no a un
    -- restaurante (HU-03), y una membresía apuntando a alguien que no
    -- existe no es un acceso, es una fila rota.
    raise exception 'No hay ninguna cuenta de Cuotly con ese correo: esta pantalla añade a quien ya existe';
  end if;

  -- RN-EST-11 y RN-FIN-07 · los permisos finos solo los elige un Editor.
  if p_role = 'local_owner' then
    v_edit := true;
    v_billing := true;
  else
    v_edit := coalesce(p_edit_establishment_data, false);
    v_billing := coalesce(p_view_billing, false);
  end if;

  select * into v_previo
  from public.establishment_memberships
  where establishment_id = p_establishment_id and user_id = v_user_id
  for update;

  v_tenia := v_previo.id is not null and v_previo.revoked_at is null;

  if v_previo.id is null then
    insert into public.establishment_memberships (establishment_id, user_id, role)
    values (p_establishment_id, v_user_id, p_role)
    returning id into v_membership_id;
  else
    -- Devolverle el acceso a quien lo tuvo NO es una fila nueva: la tabla
    -- tiene `unique (establishment_id, user_id)` y, sobre todo, la
    -- actividad histórica de esa persona cuelga de esta misma membresía
    -- (RN-EST-05). Se reactiva y se le pone el rol que se pide.
    v_membership_id := v_previo.id;
    update public.establishment_memberships
    set revoked_at = null, revoked_by = null, role = p_role
    where id = v_membership_id;
  end if;

  insert into public.establishment_permissions
    (establishment_membership_id, edit_establishment_data, view_billing)
  values (v_membership_id, v_edit, v_billing)
  on conflict (establishment_membership_id) do update
    set edit_establishment_data = excluded.edit_establishment_data,
        view_billing = excluded.view_billing;

  insert into public.audit_log
    (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'establishment_access.granted', 'establishment', p_establishment_id,
    case
      when v_previo.id is null then jsonb_build_object('user_id', v_user_id, 'had_access', false)
      else jsonb_build_object('user_id', v_user_id, 'had_access', v_previo.revoked_at is null,
                              'role', v_previo.role)
    end,
    jsonb_build_object('user_id', v_user_id, 'had_access', true, 'role', p_role,
                       'edit_establishment_data', v_edit, 'view_billing', v_billing)
  );

  -- RN-PAN-12 · se avisa a quien RECIBE el acceso, no al equipo: es quien
  -- tiene algo que hacer con esto.
  --
  -- A quien ya lo tenía no se le avisa: cambiarle el rol o repasarle los
  -- permisos no es "te han dado acceso", y pulsar Guardar dos veces en la
  -- pantalla de accesos no puede mandarle dos correos (CLAUDE.md: pulsar
  -- dos veces nunca duplica el efecto).
  --
  -- **La clave de deduplicación es de un solo uso a propósito**, y esto
  -- tiene dos historias detrás que conviene no repetir.
  --
  -- La primera versión llevaba `…:<restaurante>:<persona>` y la suite 54 la
  -- tumbó: a quien se le revocaba el acceso y luego se le devolvía **no se
  -- le avisaba**, porque la clave seguía gastada del primer aviso. Se
  -- habría quedado sin saber que puede volver a entrar.
  --
  -- La segunda versión la puso a `null`, y eso es peor: `dedupe_key` es
  -- **NOT NULL**, y `emit_notification()` se traga el fallo —su
  -- `on conflict ... do nothing` lo absorbe— y devuelve `null` **sin dar
  -- error**. El aviso no se crea y nada lo dice. Si alguna vez un aviso no
  -- aparece y no hay error en ningún sitio, mira esto primero.
  --
  -- Lo que de verdad impide el doble aviso no es la clave: es `v_tenia`,
  -- que se lee **dentro del `for update`** de la membresía, así que dos
  -- llamadas a la vez se ponen en fila y solo una ve el paso de "sin
  -- acceso" a "con acceso". Las claves sirven a los barridos, que se
  -- repiten solos; esto no se repite solo, lo pulsa una persona.
  if not v_tenia then
    select slug into v_slug from public.spaces where id = v_space_id;

    perform public.emit_notification(
      v_space_id, v_user_id, 'establishment_access_granted', 'client',
      'establishment', p_establishment_id,
      '/espacios/' || v_slug || '/restaurantes/' || p_establishment_id::text,
      'establishment_access_granted:' || gen_random_uuid()::text,
      p_establishment_id, null, null, true);
  end if;

  return v_membership_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_establishment_access(p_establishment_id uuid, p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_membership_id uuid;
  v_role text;
begin
  v_space_id := public.establishment_space_id(p_establishment_id);

  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  select id, role into v_membership_id, v_role
  from public.establishment_memberships
  where establishment_id = p_establishment_id and user_id = p_user_id and revoked_at is null
  for update;

  if v_membership_id is null then
    return false; -- CA-17: idempotente. Ya estaba retirado o nunca existió.
  end if;

  -- RN-EST-17 · va aquí y no antes a propósito: depende del rol de QUIEN
  -- se toca, y para saberlo hay que haberlo leído. Una llamada sobre
  -- alguien que ya no tiene acceso sigue siendo idempotente y no dice si
  -- existió: no se filtra por esta vía.
  perform public.assert_can_manage_access(p_establishment_id, v_role);

  update public.establishment_memberships
  set revoked_at = now(), revoked_by = auth.uid()
  where id = v_membership_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'establishment_access.revoked', 'establishment', p_establishment_id,
    jsonb_build_object('user_id', p_user_id, 'role', v_role, 'revoked', false),
    jsonb_build_object('user_id', p_user_id, 'role', v_role, 'revoked', true),
    p_reason
  );

  return true;
end;
$function$;


revoke all on function public.grant_establishment_access(uuid, text, text, boolean, boolean)
  from public, anon;
grant execute on function public.grant_establishment_access(uuid, text, text, boolean, boolean)
  to authenticated;

revoke all on function public.revoke_establishment_access(uuid, uuid, text) from public, anon;
grant execute on function public.revoke_establishment_access(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 8 · Editar y enviar un borrador también es "Crear solicitudes"
-- ------------------------------------------------------------
--
-- Hueco que destapó la conversión de `consulta`: esas dos funciones solo
-- miraban `can_write_establishment()`, que un Editor cumple por su rol. Un
-- ex-Consulta —Editor sin ninguna casilla— habría pasado a poder editar y
-- ENVIAR un borrador existente, que es justo lo que no podía hacer antes.
--
-- El permiso se llama "Crear solicitudes" y su texto en el diseño es
-- "Puede enviar solicitudes al equipo de mantenimiento": enviar está
-- dentro.

create or replace function public.update_request_draft(p_request_id uuid, p_description text, p_context text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_priority_reason text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_old_description text;
  v_old_context text;
  v_context text;
  v_version integer;
  v_priority text;
  v_reason text;
begin
  -- La fila se bloquea antes de mirarla: dos revisiones simultáneas del
  -- mismo borrador no pueden escribir la misma `version_number` (la tabla
  -- tiene unique (request_id, version_number), así que sin el bloqueo una
  -- de las dos reventaría con un error de clave duplicada).
  select r.space_id, r.establishment_id, r.state, r.description, r.context
  into v_space_id, v_establishment_id, v_state, v_old_description, v_old_context
  from public.requests r where r.id = p_request_id for update;

  if v_state is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if not public.client_permission(v_establishment_id, 'create_requests') then
    raise exception 'No tienes permiso para editar solicitudes en este restaurante';
  end if;

  if v_state <> 'draft' then
    raise exception 'Solo se puede cambiar el alcance mientras la solicitud es un borrador';
  end if;

  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'La descripción de la solicitud no puede estar vacía';
  end if;

  v_context := nullif(btrim(coalesce(p_context, '')), '');

  -- RN-REQ-05 · la prioridad y su motivo, si vienen.
  if p_priority is not null then
    v_priority := nullif(btrim(p_priority), '');
    if v_priority is not null and v_priority not in ('high', 'medium', 'low') then
      raise exception 'La prioridad tiene que ser alta, media o baja';
    end if;
    update public.requests set priority = v_priority where id = p_request_id;
  end if;

  if p_priority_reason is not null then
    v_reason := nullif(btrim(p_priority_reason), '');
    if v_reason is not null and char_length(v_reason) > 200 then
      raise exception 'El motivo de la prioridad no puede pasar de 200 caracteres';
    end if;
    update public.requests set priority_reason = v_reason where id = p_request_id;
  end if;

  -- Guardar sin cambiar nada no es una versión nueva: RN-DAT-07 versiona
  -- cambios, y un historial lleno de versiones idénticas no dice nada.
  if p_description = v_old_description and v_context is not distinct from v_old_context then
    select max(rv.version_number) into v_version
    from public.request_versions rv where rv.request_id = p_request_id;
    return v_version;
  end if;

  update public.requests
  set description = p_description, context = v_context
  where id = p_request_id;

  select coalesce(max(rv.version_number), 0) + 1 into v_version
  from public.request_versions rv where rv.request_id = p_request_id;

  insert into public.request_versions (space_id, request_id, version_number, description, context, created_by)
  values (v_space_id, p_request_id, v_version, p_description, v_context, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'request.draft_updated', 'request', p_request_id,
          jsonb_build_object('description', v_old_description, 'context', v_old_context),
          jsonb_build_object('description', p_description, 'context', v_context, 'version', v_version));

  return v_version;
end;
$function$;

create or replace function public.submit_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_priority text;
  v_reason text;
begin
  select space_id, establishment_id, state, priority, priority_reason
  into v_space_id, v_establishment_id, v_state, v_priority, v_reason
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state <> 'draft' then
    return; -- idempotente: ya se envió.
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if not public.client_permission(v_establishment_id, 'create_requests') then
    raise exception 'No tienes permiso para enviar solicitudes en este restaurante';
  end if;

  -- RN-REQ-05 · los dos, y con este orden de mensajes: primero falta la
  -- prioridad y después su motivo, que es el orden en que están en la
  -- pantalla.
  if v_priority is null then
    raise exception 'Elige la prioridad antes de enviar la solicitud';
  end if;

  if nullif(btrim(coalesce(v_reason, '')), '') is null then
    raise exception 'Escribe el motivo de la prioridad antes de enviar la solicitud';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.requests set state = 'received' where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'started', now(), auth.uid());

  -- §18, fila 1: "Nueva solicitud sin asignar -> propietario y todos los
  -- administradores".
  declare
    v_destinatario uuid;
  begin
    for v_destinatario in
      select sm.user_id from public.space_memberships sm
      where sm.space_id = v_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
    loop
      perform public.emit_notification(
        v_space_id, v_destinatario, 'request_submitted', 'staff', 'request', p_request_id,
        '/espacios/' || public.space_slug(v_space_id) || '/solicitudes/' || p_request_id::text,
        'request_submitted:' || p_request_id::text, v_establishment_id);
    end loop;
  end;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'request.submitted', 'request', p_request_id,
          jsonb_build_object('state', 'draft'),
          jsonb_build_object('state', 'received', 'priority', v_priority));
end;
$function$;


revoke all on function public.update_request_draft(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_request_draft(uuid, text, text, text, text) to authenticated;
revoke all on function public.submit_request(uuid) from public, anon;
grant execute on function public.submit_request(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9 · Ordenar los cambios es de quien los pide
-- ------------------------------------------------------------
--
-- Otro hueco que destapó la conversión de `consulta`: el orden 1..N
-- (RN-PRI, migración 62) solo miraba `can_write_establishment()`, y un
-- ex-Consulta lo cumple por ser Editor. Antes no podía reordenar nada y
-- habría pasado a poder, sin que nadie lo decidiera.
--
-- El orden no es ninguno de los siete permisos del diseño, así que se ata
-- al que le corresponde por sentido: **quien puede pedir cambios decide
-- cuál va antes**. Sin "Crear solicitudes" no hay cambios propios que
-- ordenar.
create or replace function public.client_can_set_priority(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.client_permission(p_establishment_id, 'create_requests')
     and exists (
       select 1
       from public.subscriptions s
       join public.plans p on p.id = s.plan_id
       where s.establishment_id = p_establishment_id
         and s.kind = 'plan'
         and s.status = 'active'
         and p.grants_priority
     );
$$;

revoke all on function public.client_can_set_priority(uuid) from public, anon;
grant execute on function public.client_can_set_priority(uuid) to authenticated;

-- ------------------------------------------------------------
-- 10 · El recordatorio de Menú Diario va a quien puede prepararlo
-- ------------------------------------------------------------
--
-- Tercer hueco que destapó la conversión: `run_daily_menu_sweep()` elegía
-- destinatarios **por rol**, así que un ex-Consulta habría empezado a
-- recibir un recordatorio para hacer algo que no puede hacer. Lo cazó la
-- suite 32, que cuenta a quién se recuerda.
create or replace function public.run_daily_menu_sweep(p_space_id uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tz text;
  v_slug text;
  v_local timestamp;
  v_today date;
  v_hour integer;
  v_est record;
  v_pub record;
  v_recipient uuid;
  v_emitidos integer := 0;
begin
  select s.timezone, s.slug into v_tz, v_slug from public.spaces s where s.id = p_space_id;
  if v_tz is null then
    return 0;
  end if;

  -- RN-CLK-06: las horas se miran en la zona del espacio.
  v_local := p_now at time zone v_tz;
  v_today := v_local::date;
  v_hour := extract(hour from v_local)::integer;

  -- ------------------------------------------------------------
  -- RN-MEN-08 · A las 20:00 se recuerda al propietario y a los Editores
  -- si no hay menú preparado para el día siguiente. "Preparado" es
  -- cualquier menú de mañana que no sea un borrador ni esté cancelado.
  -- Todos los días del año (RN-CLK-09): no se mira ningún calendario.
  -- Solo restaurantes con el servicio en marcha: a uno pausado o
  -- suspendido no se le recuerda un servicio que tiene detenido (§85).
  -- ------------------------------------------------------------
  if v_hour >= 20 then
    for v_est in
      select e.id
      from public.establishments e
      where e.space_id = p_space_id
        and e.status in ('active', 'ending')
        and public.establishment_daily_menu_subscription(e.id) is not null
        and not exists (
          select 1 from public.menus m
          where m.establishment_id = e.id
            and m.target_date = v_today + 1
            and m.state not in ('draft', 'cancelled')
        )
    loop
      for v_recipient in
        -- RN-EST-15 · a quien puede PREPARAR el menú, no a todo el que
        -- tenga un rol que suene a que puede. Antes decía
        -- `role in ('local_owner','editor')`, y al retirarse `consulta`
        -- (RN-EST-16) eso habría empezado a recordárselo a quien solo
        -- lee: el permiso "Editar menús" es el que decide.
        select em.user_id from public.establishment_memberships em
        left join public.establishment_permissions ep
          on ep.establishment_membership_id = em.id
        where em.establishment_id = v_est.id and em.revoked_at is null
          and (em.role = 'local_owner' or coalesce(ep.edit_menus, false))
        union
        select gm.user_id from public.group_memberships gm
        join public.establishments e2 on e2.group_id = gm.group_id
        where e2.id = v_est.id and gm.revoked_at is null
      loop
        if public.emit_notification(
             p_space_id, v_recipient, 'menu_not_prepared_reminder', 'client', 'establishment', v_est.id,
             '/espacios/' || v_slug || '/restaurantes/' || v_est.id::text || '/menu-diario',
             'menu_not_prepared_reminder:' || v_est.id::text || ':' || to_char(v_today + 1, 'YYYY-MM-DD'),
             v_est.id) is not null then
          v_emitidos := v_emitidos + 1;
        end if;
      end loop;
    end loop;
  end if;

  -- ------------------------------------------------------------
  -- §62 · Las publicaciones pedidas antes del corte se garantizan antes
  -- de las 08:00. A esa hora, las que siguen sin publicar son un
  -- incumplimiento y se avisa a quien gestiona y al asignado. Una vez por
  -- publicación: la clave lleva su id. "Garantizada" es lo mismo que
  -- deriva menu_deadlines() (RN-MEN-07): pedida antes del corte Y sin
  -- ninguna versión guardada después de él desde la petición; una versión
  -- tardía pierde la garantía y el equipo no debe esa hora.
  -- ------------------------------------------------------------
  if v_hour >= 8 then
    for v_pub in
      select p.id, p.menu_id, p.assigned_to, m.establishment_id
      from public.menu_publications p
      join public.menus m on m.id = p.menu_id
      where p.space_id = p_space_id
        and p.published_at is null and p.cancelled_at is null
        and p.requested_before_cutoff
        and not exists (
          select 1 from public.menu_versions v
          where v.menu_id = m.id and v.after_cutoff and v.created_at >= p.requested_at
        )
        and m.target_date <= v_today
        and m.state not in ('published', 'cancelled')
    loop
      for v_recipient in
        select sm.user_id from public.space_memberships sm
        where sm.space_id = p_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
        union
        select v_pub.assigned_to where v_pub.assigned_to is not null
      loop
        if public.emit_notification(
             p_space_id, v_recipient, 'menu_publication_overdue', 'staff', 'menu', v_pub.menu_id,
             '/espacios/' || v_slug || '/menu-diario/' || v_pub.menu_id::text,
             'menu_publication_overdue:' || v_pub.id::text,
             v_pub.establishment_id) is not null then
          v_emitidos := v_emitidos + 1;
        end if;
      end loop;
    end loop;
  end if;

  return v_emitidos;
end;
$function$;

revoke all on function public.run_daily_menu_sweep(uuid, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 11 · Actuar sobre una oportunidad es crear una solicitud
-- ------------------------------------------------------------
--
-- Quinto sitio que decidía por rol. Lo cazó la suite de oportunidades.
create or replace function public.act_on_opportunity(p_opportunity_id uuid, p_action text, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_status text;
  v_scope text;
  v_request_id uuid;
  v_code text;
begin
  if p_action not in ('request_change', 'request_quote', 'ask_question') then
    raise exception 'Acción de oportunidad desconocida: %', p_action;
  end if;

  select space_id, establishment_id, status, scope
  into v_space_id, v_establishment_id, v_status, v_scope
  from public.opportunities where id = p_opportunity_id;

  if v_space_id is null then
    raise exception 'Oportunidad no encontrada';
  end if;

  -- Quien actúa es el restaurante, y solo sobre lo que puede ver: una
  -- oportunidad sin aprobar o fuera de su plan no existe para él, ni por
  -- pantalla ni por llamada directa (CLAUDE.md).
  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este restaurante';
  end if;

  -- RN-EST-15 · actuar sobre una oportunidad crea una solicitud o pide un
  -- presupuesto: es "Crear solicitudes". Antes bastaba con el rol, y al
  -- retirarse `consulta` (RN-EST-16) un Editor sin casillas habría
  -- empezado a poder hacerlo.
  if not public.client_permission(v_establishment_id, 'create_requests') then
    raise exception 'No tienes permiso para crear solicitudes en este restaurante';
  end if;

  if not (public.opportunity_is_visible_to_client(v_status)
          and public.client_sees_opportunity(v_establishment_id, v_scope)) then
    raise exception 'Esa oportunidad no está disponible para este restaurante';
  end if;

  if btrim(coalesce(p_message, '')) = '' then
    raise exception 'La solicitud necesita una descripción';
  end if;

  select id into v_request_id
  from public.requests
  where opportunity_id = p_opportunity_id
    and created_by = auth.uid()
    and state = 'draft'
  limit 1;

  if v_request_id is not null then
    return v_request_id;
  end if;

  v_code := public.next_request_code(v_establishment_id);

  insert into public.requests (space_id, establishment_id, code, state, description, created_by,
                               opportunity_id, opportunity_action)
  values (v_space_id, v_establishment_id, v_code, 'draft', btrim(p_message), auth.uid(),
          p_opportunity_id, p_action)
  returning id into v_request_id;

  insert into public.request_versions (space_id, request_id, version_number, description, created_by)
  values (v_space_id, v_request_id, 1, btrim(p_message), auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'opportunity.client_action', 'opportunity', p_opportunity_id,
          jsonb_build_object('action', p_action, 'request_id', v_request_id, 'code', v_code));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'request.draft_created', 'request', v_request_id,
          jsonb_build_object('code', v_code, 'opportunity_id', p_opportunity_id));

  return v_request_id;
end;
$function$;

-- ------------------------------------------------------------
-- 12 · La familia nueva del libro de auditoría
-- ------------------------------------------------------------
--
-- `set_establishment_permissions()` escribe `establishment_permissions.set`,
-- una **familia que no existía**, y `audit_action_capability()` devolvía
-- `null` para ella: eso no significa "la ve cualquiera", significa que su
-- visibilidad la decide la fila (`audit_entity_is_visible()`). Para un
-- apunte de permisos eso es quedarse corto: quién tocó los accesos de un
-- restaurante es cartera de clientes, exactamente igual que
-- `establishment_access`, y esa es la capacidad que se le pone.
--
-- Lo cazó `audit.test.ts`, que recorre las migraciones y falla si aparece
-- una acción que el catálogo de `src/core/audit.ts` no conoce o si el
-- reparto por familias de los dos lados deja de coincidir. Las dos listas
-- están escritas a mano y solo se enteran de que se han separado porque
-- algo las compara.
create or replace function public.audit_action_capability(p_action text)
returns text
language sql
immutable
as $$
  select case split_part(coalesce(p_action, ''), '.', 1)
    when 'space' then 'manage_space'
    when 'membership' then 'manage_space'
    when 'supervision' then 'manage_space'
    when 'plan' then 'manage_space'
    when 'service' then 'manage_space'
    when 'channel' then 'manage_space'
    when 'invitation' then 'invite_member'
    when 'charge' then 'manage_finance'
    when 'payment' then 'manage_finance'
    when 'subscription' then 'manage_finance'
    when 'financial' then 'manage_finance'
    when 'establishment' then 'manage_clients'
    when 'establishment_access' then 'manage_clients'
    when 'establishment_note' then 'manage_clients'
    when 'establishment_permissions' then 'manage_clients'
    when 'establishment_transfer' then 'manage_clients'
    when 'group' then 'manage_clients'
    when 'group_access' then 'manage_clients'
    when 'holiday' then 'manage_holidays'
    when 'menu_template' then 'manage_clients'
    when 'integration' then 'manage_clients'
    when 'opportunity' then 'manage_clients'
    when 'report' then 'manage_clients'
    when 'cuotly_charge' then 'manage_space'
    when 'cuotly_payment' then 'manage_space'
    when 'support' then 'manage_space'
    else null
  end;
$$;

-- CLAUDE.md · aparece dentro de la política de RLS de `audit_log`, así que
-- `authenticated` conserva su EXECUTE: revocárselo rompería la política en
-- vez de cerrarla.
revoke all on function public.audit_action_capability(text) from public, anon;
grant execute on function public.audit_action_capability(text) to authenticated;
