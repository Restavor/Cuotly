-- Lo eliminado definitivamente ya no lo ve nadie (decisión 82, 26/09/2026;
-- PRD §32, RN-ADM-24 y RN-ADM-26).
--
-- Bosco, sobre el eliminado definitivo de la 142: *"yo creo que se
-- elimina definitivamente y no se puede ver más"*. Hasta aquí, un espacio
-- eliminado definitivamente seguía en solo lectura para su equipo y sus
-- clientes, como cuando estaba archivado. Ahora:
--
--   · un **espacio** eliminado definitivamente no lo ve **nadie**: ni su
--     equipo, ni los clientes de sus restaurantes, ni Modo soporte.
--   · un **restaurante** eliminado definitivamente no lo ven **sus
--     clientes** —propietario local, editores, consulta, ni el grupo—.
--     Su **equipo de mantenimiento** conserva su historial (cobros,
--     trabajos, libro de consumos): son los registros del espacio, que
--     sigue vivo, y RN-FIN-14 no deja perder la deuda de quien se va. Lo
--     que el equipo deja de ver es el restaurante en sus listas (la 142).
--
-- **No se borra nada** (CLAUDE.md, RN-DAT-06) y **no se toca ninguna
-- pertenencia**: la puerta se cierra en las funciones de las que cuelgan
-- todas las políticas, que es donde §134 dice que viven las excepciones.
-- `is_space_member()` y `has_capability_as()` para el equipo y el soporte;
-- para el cliente, las que leen `establishment_memberships` o
-- `group_memberships` por su cuenta, una por una, porque no todas pasan
-- por `is_establishment_member()`. Las demás (`can_read_job`,
-- `can_read_file`, `can_read_conversation`, `can_read_billing`…) delegan
-- en estas. Las funciones se reescriben tal como estaban, con la puerta
-- añadida delante.
--
-- Se comprueba con `supabase/tests/archivados_recuperar_y_eliminar.sql`.

-- ============================================================
-- 1 · ¿Se ha ido? (internas)
-- ============================================================
create or replace function public.space_is_gone(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space_id and s.permanently_deleted_at is not null
  );
$$;

comment on function public.space_is_gone(uuid) is
  'RN-ADM-24 · el espacio lo eliminó Cuotly definitivamente. Interna.';

create or replace function public.establishment_space_is_gone(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.establishments e
    join public.spaces s on s.id = e.space_id
    where e.id = p_establishment_id and s.permanently_deleted_at is not null
  );
$$;

comment on function public.establishment_space_is_gone(uuid) is
  'RN-ADM-24 · el espacio del restaurante lo eliminó Cuotly
   definitivamente. Interna.';

create or replace function public.establishment_is_gone(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.establishments e
    join public.spaces s on s.id = e.space_id
    where e.id = p_establishment_id
      and (e.permanently_deleted_at is not null or s.permanently_deleted_at is not null)
  );
$$;

comment on function public.establishment_is_gone(uuid) is
  'RN-ADM-24 · el restaurante, o su espacio, lo eliminó Cuotly
   definitivamente. Interna.';

create or replace function public.group_is_gone(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.groups g
    join public.spaces s on s.id = g.space_id
    where g.id = p_group_id and s.permanently_deleted_at is not null
  );
$$;

comment on function public.group_is_gone(uuid) is
  'RN-ADM-24 · el espacio del grupo lo eliminó Cuotly definitivamente.
   Interna.';

-- Las cuatro se llaman desde funciones SECURITY DEFINER, nunca desde la
-- expresión de una política: se cierran del todo (CLAUDE.md).
revoke all on function public.space_is_gone(uuid) from public, anon, authenticated;
revoke all on function public.establishment_space_is_gone(uuid) from public, anon, authenticated;
revoke all on function public.establishment_is_gone(uuid) from public, anon, authenticated;
revoke all on function public.group_is_gone(uuid) from public, anon, authenticated;

-- ============================================================
-- 2 · Las puertas, tal como estaban y con la nueva delante
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_space_member(p_space_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- RN-ADM-24 · un espacio eliminado definitivamente ya no lo ve nadie: ni su equipo ni Modo soporte.
  if public.space_is_gone(p_space_id) then
    return false;
  end if;

  if exists (
    select 1
    from public.space_memberships sm
    where sm.space_id = p_space_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
  ) then
    return true;
  end if;

  -- §134 · "salvo soporte autorizado". La única excepción, y está aquí y
  -- no en las tablas.
  return public.support_access_level(p_space_id) is not null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_capability_as(p_space_id uuid, p_user_id uuid, p_capability text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role public.space_role;
  v_can_perform_jobs boolean;
  v_can_approve_reports boolean;
  v_support text;
begin
  -- RN-ADM-24 · un espacio eliminado definitivamente ya no lo ve nadie: ni su equipo ni Modo soporte.
  if public.space_is_gone(p_space_id) then
    return false;
  end if;

  select sm.role, sm.can_perform_jobs, sm.can_approve_reports
  into v_role, v_can_perform_jobs, v_can_approve_reports
  from public.space_memberships sm
  where sm.space_id = p_space_id
    and sm.user_id = p_user_id
    and sm.status = 'active';

  if v_role is null and p_user_id = auth.uid() then
    v_support := public.support_access_level(p_space_id);
    -- RN-ADM-07 · `read` no tiene NINGUNA capacidad; `admin` opera como un
    -- administrador sin permisos concedidos; `owner`, como el propietario.
    if v_support in ('admin', 'owner') then
      v_role := v_support::public.space_role;
      v_can_perform_jobs := false;
      v_can_approve_reports := false;
    end if;
  end if;

  if v_role is null then
    return false;
  end if;

  return case p_capability
    when 'manage_space' then v_role = 'owner'
    -- RN-ADM-07 · lo único que Modo soporte no puede hacer ni como
    -- propietario: dejar a alguien dentro cuando la sesión acabe.
    when 'invite_member' then v_role = 'owner' and v_support is null
    when 'create_establishment' then v_role in ('owner', 'admin')
    when 'manage_clients' then v_role in ('owner', 'admin')
    when 'view_team' then true
    when 'manage_holidays' then v_role in ('owner', 'admin')
    when 'manage_requests' then v_role in ('owner', 'admin')
    when 'assign_jobs' then v_role in ('owner', 'admin')
    when 'perform_jobs' then
      v_role = 'worker'
      or v_role = 'owner'
      or (v_role = 'admin' and coalesce(v_can_perform_jobs, false))
    when 'manage_finance' then v_role in ('owner', 'admin')
    -- RN-SOP-01 · abrir una incidencia a Cuotly: propietario y
    -- administrador, y NUNCA una sesión de Modo soporte, ni en nivel
    -- `owner`: hablar con Cuotly en nombre de un espacio ajeno es lo que
    -- RN-ADM-07 prohíbe con invitar, un piso más arriba.
    when 'contact_cuotly' then v_role in ('owner', 'admin') and v_support is null
    when 'manage_files' then v_role in ('owner', 'admin', 'worker')
    when 'manage_absences' then v_role in ('owner', 'admin')
    when 'approve_reports' then
      v_role = 'owner'
      or (v_role = 'admin' and coalesce(v_can_approve_reports, false))
    else false
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.group_is_gone(p_group_id)
    and (exists (
    select 1 from public.group_memberships
    where group_id = p_group_id
      and user_id = auth.uid()
      and revoked_at is null
  )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_establishment_member(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_is_gone(p_establishment_id)
    and (exists (
    select 1 from public.establishment_memberships
    where establishment_id = p_establishment_id
      and user_id = auth.uid()
      and revoked_at is null
  )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_establishment_client(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_is_gone(p_establishment_id)
    and (public.is_group_member((select e.group_id from public.establishments e where e.id = p_establishment_id))
    or public.is_establishment_member(p_establishment_id)
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_read_establishment_as_client(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_is_gone(p_establishment_id)
    and (public.is_group_member((select e.group_id from public.establishments e where e.id = p_establishment_id))
    or public.is_establishment_member(p_establishment_id)
    );
$function$
;

CREATE OR REPLACE FUNCTION public.client_permission(p_establishment_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol text;
  v_grupo text;
  v_membresia uuid;
  v_concedido boolean;
begin
  -- RN-ADM-24 · un restaurante eliminado definitivamente, o de un espacio eliminado, ya no lo ve su cliente.
  if public.establishment_is_gone(p_establishment_id) then
    return false;
  end if;

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
$function$
;

CREATE OR REPLACE FUNCTION public.client_can_view_billing(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_is_gone(p_establishment_id)
    and (exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = auth.uid()
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    )
    or public.client_permission(p_establishment_id, 'view_billing')
    );
$function$
;

CREATE OR REPLACE FUNCTION public.client_can_view_reports(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_is_gone(p_establishment_id)
    and (exists (
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
    )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.client_can_accept_terms(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_is_gone(p_establishment_id)
    and (exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id
        and em.user_id = auth.uid()
        and em.revoked_at is null
        and em.role = 'local_owner'
    )
    or exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = auth.uid()
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.client_can_edit_establishment_data(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_is_gone(p_establishment_id)
    and (exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = auth.uid()
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    )
    or exists (
      select 1 from public.establishment_memberships em
      left join public.establishment_permissions ep
        on ep.establishment_membership_id = em.id
      where em.establishment_id = p_establishment_id
        and em.user_id = auth.uid()
        and em.revoked_at is null
        and (
          em.role = 'local_owner'
          or (em.role = 'editor' and coalesce(ep.edit_establishment_data, false))
        )
    )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_write_establishment(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_is_gone(p_establishment_id)
    and (exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id
        and em.user_id = auth.uid()
        and em.revoked_at is null
        and em.role in ('local_owner', 'editor')
    )
    or exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = auth.uid()
        and gm.revoked_at is null
    )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_write_establishment_as(p_establishment_id uuid, p_actor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_is_gone(p_establishment_id)
    and (exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id
        and em.user_id = p_actor_id
        and em.revoked_at is null
        and em.role in ('local_owner', 'editor')
    )
    or exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = p_actor_id
        and gm.revoked_at is null
    )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_establishment_owner_user(p_establishment_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_is_gone(p_establishment_id)
    and (exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id
        and em.user_id = p_user_id
        and em.revoked_at is null
        and em.role = 'local_owner'
    )
    or exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = p_user_id
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.integration_client_owner_as(p_establishment_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_is_gone(p_establishment_id)
    and (exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id
        and em.user_id = p_user_id
        and em.revoked_at is null
        and em.role = 'local_owner'
    )
    or exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = p_user_id
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_export_scope(p_space_id uuid, p_scope text, p_group_id uuid, p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not (public.space_is_gone(p_space_id)
         or (p_scope = 'establishment' and public.establishment_is_gone(p_establishment_id)))
    and (case p_scope
    -- §141 · "Propietario del espacio exporta todo su espacio."
    when 'space' then public.has_capability(p_space_id, 'manage_space')
    -- §141 · "Propietario de restaurante exporta grupo o establecimientos
    -- propios." El grupo, su propietario global (§14.1).
    when 'group' then exists (
      select 1 from public.groups g
      where g.id = p_group_id and g.space_id = p_space_id
    ) and public.is_group_member(p_group_id)
    -- Un establecimiento, su propietario local (§14.2) o el propietario
    -- global del grupo al que pertenece. Editor y Consulta no exportan:
    -- §141 dice "propietario".
    when 'establishment' then exists (
      select 1 from public.establishments e
      where e.id = p_establishment_id and e.space_id = p_space_id
        and (
          exists (
            select 1 from public.establishment_memberships em
            where em.establishment_id = e.id and em.user_id = auth.uid()
              and em.revoked_at is null and em.role = 'local_owner'
          )
          or public.is_group_member(e.group_id)
        )
    )
    else false
  end
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_authorized_worker_establishment(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_space_is_gone(p_establishment_id)
    and (exists (
    select 1 from public.worker_establishments we
    where we.user_id = auth.uid()
      and we.establishment_id = p_establishment_id
      and we.revoked_at is null
  )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_authorized_for_establishment(p_establishment_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.establishment_space_is_gone(p_establishment_id)
    and (exists (
    select 1 from public.worker_establishments we
    where we.user_id = p_user_id
      and we.establishment_id = p_establishment_id
      and we.revoked_at is null
  )
    );
$function$
;


-- El equipo de un espacio vivo sigue leyendo el restaurante eliminado
-- (su historial); el cliente, no, tampoco por el grupo.
CREATE OR REPLACE FUNCTION public.can_read_establishment(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.is_space_member((select e.space_id from public.establishments e where e.id = p_establishment_id))
    or (
      not public.establishment_is_gone(p_establishment_id)
      and (
        public.is_group_member((select e.group_id from public.establishments e where e.id = p_establishment_id))
        or public.is_establishment_member(p_establishment_id)
      )
    );
$function$
;

-- ============================================================
-- 3 · La fila del restaurante
-- ============================================================
-- La política llama a `is_group_member()` con el grupo, que sigue vivo
-- aunque uno de sus restaurantes se haya ido: el cliente del grupo lo
-- dejaría de ver solo por la columna de la propia fila.
drop policy establishments_select on public.establishments;
create policy establishments_select on public.establishments
  for select
  using (
    public.is_space_member(space_id)
    or (
      permanently_deleted_at is null
      and (public.is_group_member(group_id) or public.is_establishment_member(id))
    )
  );
