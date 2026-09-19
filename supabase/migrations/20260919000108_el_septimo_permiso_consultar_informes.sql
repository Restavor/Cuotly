-- ============================================================
-- Migración 108 · El séptimo permiso: "Consultar informes" (decisión 52)
-- ============================================================
--
-- La 107 dejó parada la séptima casilla del diseño a propósito, porque
-- chocaba con una decisión de Bosco de cinco días antes. Era la pregunta
-- 26 de `docs/DECISIONES.md`, y la ha contestado: **manda el diseño**.
--
-- La contradicción, para quien la lea dentro de un año:
--
--   · El **diseño definitivo móvil**, página 153, dibuja "Consultar
--     informes" entre los permisos del Editor.
--   · La **decisión 28c** (14/09/2026) había quitado ese permiso entero
--     —columna `establishment_permissions.view_reports` y su función, de
--     la migración 85— con el argumento de que el informe lo ve cualquier
--     persona del restaurante con el acceso vigente.
--
-- Bosco elige el diseño (decisión 52, 19/09/2026). **La 28c queda
-- enmendada en ese punto y solo en ese**: a quién LLEGA el informe
-- (28d), cuándo se aprueba (28a), los avisos de §95 (28b) y que el
-- informe se guarda como PDF (28e) siguen igual.
--
-- **Lo que esta migración NO hace es quitarle el informe a nadie.** Todo
-- el que hoy ve informes los sigue viendo: el relleno de la parte 3 le
-- enciende la casilla a **todos** los Editores con acceso vivo, incluidos
-- los que la 107 convirtió desde `consulta` —que también los veían—. Lo
-- que cambia es de aquí en adelante: un Editor **nuevo** nace sin ver
-- informes hasta que su Propietario se lo encienda. Eso es lo que el
-- diseño pide y es la consecuencia que se puso por escrito antes de
-- preguntar.
--
-- La 107 está aplicada y CLAUDE.md prohíbe modificar una migración
-- existente, así que esto va en un archivo nuevo.

-- ------------------------------------------------------------
-- 1 · La columna
-- ------------------------------------------------------------
--
-- Nace en `false` como los demás, y la parte 3 la rellena. El orden
-- importa: sin relleno, aplicar esto dejaría a los Editores de hoy sin
-- informes de un día para otro y sin que nadie lo tocara.
alter table public.establishment_permissions
  add column view_reports boolean not null default false;

comment on column public.establishment_permissions.view_reports is
  'RN-EST-15 · "Consultar informes", el séptimo permiso del diseño
   (decisión 52). Existió en la migración 85, lo quitó la decisión 28c y
   lo devuelve esta. El Propietario lo tiene por su rol.';

-- ------------------------------------------------------------
-- 2 · La puerta única lo reconoce
-- ------------------------------------------------------------
--
-- Mismo cuerpo que dejó la 107 con dos líneas más: `view_reports` entra
-- en la lista de nombres válidos y en lo que puede un Editor de GRUPO
-- —que hasta hoy veía los informes de sus restaurantes, y se le conserva
-- (la rama de grupo de `client_can_view_reports()` tampoco cambia)—.
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
    'view_reports', 'view_billing', 'manage_users'
  ) then
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
    -- Lo que un Editor de grupo ya podía hacer: el contenido y los
    -- informes, sí; la facturación, no (RN-FIN-07); los accesos, tampoco
    -- —`grant_group_*` ni siquiera admite ese rol—.
    return p_permission in (
      'create_requests', 'edit_menus', 'use_messages', 'upload_files', 'view_reports'
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
-- 3 · Nadie pierde el informe que hoy ve
-- ------------------------------------------------------------
--
-- **La parte que no se puede saltar.** Hoy ve los informes *cualquiera*
-- con el acceso vivo, así que la casilla se enciende para **todos** los
-- Editores con acceso vivo, sin distinguir si tienen otras casillas: los
-- que la 107 convirtió desde `consulta` también los veían.
--
-- A quien tiene el acceso **retirado** no se le enciende: no los ve hoy
-- (RN-EST-05, que `client_can_view_reports()` comprueba desde la decisión
-- 28c) y encendérsela sería devolverle algo por la puerta de atrás. Si se
-- le restituye el acceso, `grant_establishment_access()` decide qué
-- permisos tiene.
insert into public.establishment_permissions (establishment_membership_id)
select em.id from public.establishment_memberships em
where em.role = 'editor'
  and em.revoked_at is null
  and not exists (
    select 1 from public.establishment_permissions ep
    where ep.establishment_membership_id = em.id
  );

update public.establishment_permissions ep
set view_reports = true
from public.establishment_memberships em
where em.id = ep.establishment_membership_id
  and em.role = 'editor'
  and em.revoked_at is null;

-- ------------------------------------------------------------
-- 4 · La puerta del informe
-- ------------------------------------------------------------
--
-- La rama del **grupo** no se toca (§14.1): el propietario global ve el
-- informe de cada establecimiento suyo, y el consolidado no —decisión 30,
-- que lo sostienen la política `reports_select` y el CHECK
-- `reports_scope`, no esta función—.
--
-- Lo que cambia es la rama del restaurante: tener el acceso vivo ya no
-- basta, hace falta la casilla. El `exists` sobre la membresía se queda
-- delante porque es lo que comprueba RN-EST-05 —el acceso retirado deja
-- de ver—, y `client_permission()` por su cuenta ya lo miraría, pero
-- dejarlo escrito aquí hace que la regla se lea sin abrir otra función.
create or replace function public.client_can_view_reports(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      -- §14.1 · el propietario global del grupo ve el informe de cada
      -- establecimiento suyo. El CONSOLIDADO no: decisión 30.
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id and gm.user_id = auth.uid()
    )
    or (
      -- RN-EST-15, decisión 52 · el acceso vivo Y el permiso. Hasta el
      -- 19/09/2026 bastaba con el acceso (decisión 28c); el diseño manda
      -- y la casilla vuelve.
      exists (
        select 1 from public.establishment_memberships em
        where em.establishment_id = p_establishment_id
          and em.user_id = auth.uid()
          and em.revoked_at is null
      )
      and public.client_permission(p_establishment_id, 'view_reports')
    );
$$;

comment on function public.client_can_view_reports(uuid) is
  'RN-REP-01, RN-EST-15 · quién ve los informes de un restaurante: el
   grupo (§14.1) y, dentro del panel, quien tenga el acceso vivo y la
   casilla "Consultar informes" (decisión 52). El Propietario, siempre.';

-- CLAUDE.md · vive DENTRO de la expresión de `reports_select`, y
-- PostgreSQL evalúa esas expresiones con los privilegios de QUIEN
-- CONSULTA. Revocarle el EXECUTE a `authenticated` no la cierra: rompe la
-- política entera y `reports` empieza a devolver "permission denied for
-- function".
revoke all on function public.client_can_view_reports(uuid) from public, anon;
grant execute on function public.client_can_view_reports(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5 · La pantalla guarda los siete
-- ------------------------------------------------------------
--
-- Mismo cuerpo que dejó la 107, con `view_reports` en el insert y en el
-- update. Se escriben juntos porque juntos se eligen, y porque así no hay
-- un instante con la mitad puestos.
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
    upload_files, view_reports, view_billing, manage_users
  ) values (
    v_membresia,
    coalesce((p_permissions ->> 'create_requests')::boolean, false),
    coalesce((p_permissions ->> 'edit_menus')::boolean, false),
    coalesce((p_permissions ->> 'use_messages')::boolean, false),
    coalesce((p_permissions ->> 'upload_files')::boolean, false),
    coalesce((p_permissions ->> 'view_reports')::boolean, false),
    coalesce((p_permissions ->> 'view_billing')::boolean, false),
    coalesce((p_permissions ->> 'manage_users')::boolean, false)
  )
  on conflict (establishment_membership_id) do update set
    create_requests = excluded.create_requests,
    edit_menus = excluded.edit_menus,
    use_messages = excluded.use_messages,
    upload_files = excluded.upload_files,
    view_reports = excluded.view_reports,
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
  'RN-EST-15/17 · los siete permisos de un Editor, de una vez. Los cambia
   el equipo (`manage_clients`) o quien tenga "Usuarios y accesos" dentro
   del panel. Al Propietario no: los tiene todos por su rol.';

revoke all on function public.set_establishment_permissions(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.set_establishment_permissions(uuid, uuid, jsonb)
  to authenticated;

-- ------------------------------------------------------------
-- 6 · La lista de usuarios que el PANEL puede leer
-- ------------------------------------------------------------
--
-- La pantalla "Usuarios y accesos" del panel (páginas 152 y 153 del
-- diseño) enseña nombre, correo, rol y las siete casillas de cada
-- persona. Nada de eso se puede leer desde el lado cliente con una
-- consulta normal: `profiles_select` no deja que un cliente lea el perfil
-- de otro —no comparten espacio—, y sin una función la pantalla enseñaría
-- uuids.
--
-- Existe `establishment_client_users()` desde la migración 55, pero **no
-- sirve aquí**: exige `is_space_member()`, es decir, contesta al EQUIPO y
-- devuelve cero filas a un restaurante mirando su propio panel. Esa se
-- queda como está —la usa la ficha del equipo— y esta es la del panel.
--
-- Quién puede llamarla: el equipo con `manage_clients`, o quien tenga
-- acceso vivo a ESTE restaurante. Nótese que **no** exige `manage_users`:
-- ver quién más entra en tu restaurante no es gestionarlo, y la pantalla
-- se lee en modo consulta. Lo que sí exige `manage_users` es cambiar algo,
-- y eso lo comprueban `set_establishment_permissions()`,
-- `grant_establishment_access()` y `revoke_establishment_access()` por su
-- cuenta (CLAUDE.md: ocultar un botón no es un control de acceso).
--
-- Solo accesos **vivos**. Un acceso retirado desaparece de la vista
-- (RN-EST-05) y su rastro está en el libro de auditoría, que es donde no
-- se puede editar ni borrar. El diseño del panel no dibuja accesos
-- retirados; la ficha del equipo sí los marca, y esa es otra función.
create or replace function public.establishment_panel_users(p_establishment_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  source text,
  role text,
  create_requests boolean,
  edit_menus boolean,
  use_messages boolean,
  upload_files boolean,
  view_reports boolean,
  view_billing boolean,
  manage_users boolean,
  granted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with permitido as (
    select
      public.has_capability(public.establishment_space_id(p_establishment_id), 'manage_clients')
      or exists (
        select 1 from public.establishment_memberships em
        where em.establishment_id = p_establishment_id
          and em.user_id = auth.uid()
          and em.revoked_at is null
      )
      or exists (
        select 1 from public.group_memberships gm
        join public.establishments e on e.group_id = gm.group_id
        where e.id = p_establishment_id
          and gm.user_id = auth.uid()
          and gm.revoked_at is null
      ) as si
  )
  select
    p.id,
    nullif(btrim(p.full_name), ''),
    p.email,
    'establishment'::text,
    em.role,
    -- RN-EST-15 · el Propietario los tiene los siete por su rol, no por
    -- casilla. Se dicen en `true` y no en lo que haya guardado, porque la
    -- pantalla enseña lo que esa persona PUEDE hacer: es la misma
    -- respuesta que daría `client_permission()`.
    em.role = 'local_owner' or coalesce(ep.create_requests, false),
    em.role = 'local_owner' or coalesce(ep.edit_menus, false),
    em.role = 'local_owner' or coalesce(ep.use_messages, false),
    em.role = 'local_owner' or coalesce(ep.upload_files, false),
    em.role = 'local_owner' or coalesce(ep.view_reports, false),
    em.role = 'local_owner' or coalesce(ep.view_billing, false),
    em.role = 'local_owner' or coalesce(ep.manage_users, false),
    em.created_at
  from public.establishment_memberships em
  join public.profiles p on p.id = em.user_id
  left join public.establishment_permissions ep on ep.establishment_membership_id = em.id
  where em.establishment_id = p_establishment_id
    and em.revoked_at is null
    and (select si from permitido)

  union all

  select
    p.id,
    nullif(btrim(p.full_name), ''),
    p.email,
    'group'::text,
    gm.role,
    -- El propietario global manda en todos sus restaurantes; el Editor de
    -- grupo, en el contenido y los informes (RN-FIN-07 le deja fuera la
    -- facturación, y `grant_group_*` no admite "Usuarios y accesos"). Es
    -- exactamente lo que contesta `client_permission()` para cada uno.
    true,
    true,
    true,
    true,
    true,
    gm.role = 'global_owner',
    gm.role = 'global_owner',
    gm.created_at
  from public.group_memberships gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = (select e.group_id from public.establishments e where e.id = p_establishment_id)
    and gm.revoked_at is null
    and (select si from permitido)

  order by 4, 2 nulls last, 3;
$$;

comment on function public.establishment_panel_users(uuid) is
  'RN-EST-15/17 (páginas 152 y 153 del diseño móvil) · quién entra en este
   restaurante y qué puede hacer, para la pantalla "Usuarios y accesos"
   del PANEL. Contesta al equipo con `manage_clients` y a quien tenga
   acceso vivo aquí; a nadie más. Solo accesos vivos: el retirado
   desaparece de la vista (RN-EST-05) y su rastro está en la auditoría.
   Las casillas salen resueltas —el Propietario en true por su rol—,
   porque la pantalla enseña lo que se PUEDE hacer, no cómo se guardó.';

-- Comprueba el permiso en su propio cuerpo, así que `authenticated` la
-- ejecuta: es una función de pantalla, no interna (CLAUDE.md). `anon` no:
-- sin sesión siempre devolvería vacío, pero dejar abierta por RPC una
-- función que toca `profiles` es una superficie que no hace falta.
revoke all on function public.establishment_panel_users(uuid) from public, anon;
grant execute on function public.establishment_panel_users(uuid) to authenticated;
