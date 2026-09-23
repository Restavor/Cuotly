-- ============================================================
-- Migración 135 · Grupos: crear, renombrar y mover un restaurante de grupo
--                 (M82; PRD RN-EST-20, decisión 74)
-- ============================================================
--
-- Hasta hoy un grupo solo nacía con su primer restaurante
-- (`create_establishment_with_data()`), no se podía renombrar y un
-- restaurante no podía cambiar de grupo. La pantalla M82 del diseño
-- definitivo tiene los tres botones, y Bosco fijó las reglas el 23/09/2026:
--
--   · un grupo se puede crear **vacío**, con nombre y descripción;
--   · renombrarlo es libre;
--   · mover un restaurante lo puede hacer el equipo o el propietario del
--     restaurante, y quien entraba por el grupo de origen **se queda como
--     Editor o pierde el acceso**, según elija quien lo mueve. El grupo de
--     destino entra en el acto.
--
-- Lo que se añadió al programarlo está en la decisión 74 y en RN-EST-20:
-- el propietario del restaurante solo puede moverlo a un grupo del que
-- también sea propietario global (si no, estaría dando su restaurante a
-- desconocidos), y quien pasa a Editor conserva los permisos operativos y
-- no los de propietario.
--
-- Se comprueba con `supabase/tests/grupos_crear_editar_y_mover.sql`
-- (suite 75).

-- ------------------------------------------------------------
-- 1 · Las dos columnas nuevas de `groups`
-- ------------------------------------------------------------
--
-- La descripción es lo que dibuja M82 ("Restaurantes del centro de
-- Madrid"). La clave de idempotencia es la de CLAUDE.md: pulsar dos veces
-- "Crear grupo" crea uno. No se hace único el nombre: podría haber ya dos
-- grupos con el mismo nombre en producción y el índice no se aplicaría; lo
-- que se impide es crear uno NUEVO con un nombre repetido.
alter table public.groups
  add column description text,
  add column idempotency_key text;

create unique index groups_idempotency_key
  on public.groups (space_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.groups.description is
  'RN-EST-20 · lo que el equipo escribe del grupo. Opcional.';
comment on column public.groups.idempotency_key is
  'RN-EST-20 · la clave de `create_group()`: la misma clave, el mismo grupo.';

-- ------------------------------------------------------------
-- 2 · Crear un grupo
-- ------------------------------------------------------------
create or replace function public.create_group(
  p_space_id uuid,
  p_name text,
  p_description text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_group_id uuid;
begin
  if not public.has_capability(p_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador del espacio pueden crear un grupo';
  end if;

  if v_name = '' then
    raise exception 'El grupo necesita un nombre';
  end if;

  if length(v_name) > 120 then
    raise exception 'El nombre del grupo es demasiado largo (120 caracteres como mucho)';
  end if;

  -- CLAUDE.md · la misma clave devuelve el mismo grupo, sin un segundo
  -- apunte. Va ANTES de la comprobación del nombre: la segunda pulsación
  -- encontraría "ya hay un grupo con ese nombre" —el suyo— y fallaría.
  if p_idempotency_key is not null then
    select id into v_group_id
    from public.groups
    where space_id = p_space_id and idempotency_key = p_idempotency_key;
    if v_group_id is not null then
      return v_group_id;
    end if;
  end if;

  if exists (
    select 1 from public.groups
    where space_id = p_space_id and lower(btrim(name)) = lower(v_name)
  ) then
    raise exception 'Ya hay un grupo con ese nombre en este espacio';
  end if;

  insert into public.groups (space_id, name, description, idempotency_key)
  values (p_space_id, v_name, v_description, p_idempotency_key)
  returning id into v_group_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (p_space_id, auth.uid(), 'group.created', 'group', v_group_id, null,
          jsonb_build_object('name', v_name, 'description', v_description));

  return v_group_id;
end;
$$;

comment on function public.create_group(uuid, text, text, text) is
  'RN-EST-20 · crea un grupo vacío con nombre y descripción. Exige
   `manage_clients`. La misma clave de idempotencia devuelve el mismo
   grupo; un nombre repetido en el espacio se rechaza.';

revoke all on function public.create_group(uuid, text, text, text) from public, anon;
grant execute on function public.create_group(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 3 · Renombrar y describir un grupo
-- ------------------------------------------------------------
--
-- Recibe los dos campos enteros, como el formulario: una descripción que
-- llega vacía se vacía. Si nada cambia, ni UPDATE ni apunte: guardar dos
-- veces es un solo efecto.
create or replace function public.update_group(
  p_group_id uuid,
  p_name text,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups;
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  select * into v_group from public.groups where id = p_group_id for update;
  if v_group.id is null then
    raise exception 'Grupo no encontrado';
  end if;

  if not public.has_capability(v_group.space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador del espacio pueden editar un grupo';
  end if;

  if v_name = '' then
    raise exception 'El grupo necesita un nombre';
  end if;

  if length(v_name) > 120 then
    raise exception 'El nombre del grupo es demasiado largo (120 caracteres como mucho)';
  end if;

  if v_name = v_group.name and v_description is not distinct from v_group.description then
    return;
  end if;

  if lower(v_name) <> lower(btrim(v_group.name)) and exists (
    select 1 from public.groups
    where space_id = v_group.space_id and id <> p_group_id and lower(btrim(name)) = lower(v_name)
  ) then
    raise exception 'Ya hay un grupo con ese nombre en este espacio';
  end if;

  update public.groups
  set name = v_name, description = v_description
  where id = p_group_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_group.space_id, auth.uid(), 'group.updated', 'group', p_group_id,
          jsonb_build_object('name', v_group.name, 'description', v_group.description),
          jsonb_build_object('name', v_name, 'description', v_description));
end;
$$;

comment on function public.update_group(uuid, text, text) is
  'RN-EST-20 · renombra un grupo y cambia su descripción. Exige
   `manage_clients`. Sin cambios, no escribe nada.';

revoke all on function public.update_group(uuid, text, text) from public, anon;
grant execute on function public.update_group(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 4 · Quién es propietario de un restaurante (interna)
-- ------------------------------------------------------------
--
-- Propietario local del restaurante o propietario global de su grupo, con
-- el acceso vivo. Es la misma regla que `client_can_accept_terms()`, pero
-- para una persona cualquiera y no para quien llama: la usan las dos
-- funciones de abajo. Interna: no comprueba nada.
create or replace function public.is_establishment_owner_user(
  p_establishment_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
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
    );
$$;

comment on function public.is_establishment_owner_user(uuid, uuid) is
  'Interna · si esa persona es propietaria del restaurante (local, o global
   de su grupo). No comprueba quién pregunta: la llaman las funciones de
   RN-EST-20, que sí lo comprueban.';

revoke all on function public.is_establishment_owner_user(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5 · A qué grupos puede mover un restaurante quien mira
-- ------------------------------------------------------------
--
-- El equipo (`manage_clients`), a todos los grupos del espacio menos el
-- suyo. El propietario del restaurante, a los grupos del mismo espacio de
-- los que también es propietario global. Nadie más: la lista vacía quiere
-- decir "no puedes moverlo", y la pantalla no pinta el botón. Quien decide
-- de verdad es `move_establishment_to_group()`, que vuelve a mirarlo.
create or replace function public.establishment_move_targets(p_establishment_id uuid)
returns table (id uuid, name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_group_id uuid;
begin
  select e.space_id, e.group_id into v_space_id, v_group_id
  from public.establishments e where e.id = p_establishment_id;

  if v_space_id is null then
    return;
  end if;

  if public.has_capability(v_space_id, 'manage_clients') then
    return query
      select g.id, g.name from public.groups g
      where g.space_id = v_space_id and g.id <> v_group_id
      order by lower(g.name), g.id;
    return;
  end if;

  if public.is_establishment_owner_user(p_establishment_id, auth.uid()) then
    return query
      select g.id, g.name from public.groups g
      join public.group_memberships gm on gm.group_id = g.id
      where g.space_id = v_space_id
        and g.id <> v_group_id
        and gm.user_id = auth.uid()
        and gm.revoked_at is null
        and gm.role = 'global_owner'
      order by lower(g.name), g.id;
  end if;
end;
$$;

comment on function public.establishment_move_targets(uuid) is
  'RN-EST-20 · los grupos a los que quien mira puede mover este
   restaurante. Vacía si no puede moverlo.';

revoke all on function public.establishment_move_targets(uuid) from public, anon;
grant execute on function public.establishment_move_targets(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6 · Mover un restaurante de grupo
-- ------------------------------------------------------------
--
-- `p_previous_access`:
--   · 'keep_as_editor' · quien entraba por el grupo de origen y no sigue
--     entrando por otra vía se queda como Editor del restaurante, con los
--     permisos operativos y sin los de propietario (RN-EST-20);
--   · 'revoke' · pierde el acceso. No hay nada que retirar a mano: el
--     acceso por grupo se deriva del grupo, y el restaurante ya no está en
--     él. Se apunta quién lo perdió.
--
-- "Por otra vía" es: también está en el grupo de destino, o tiene su propia
-- membresía viva en el restaurante. A esos no se les toca.
--
-- Todo en una transacción: o se mueve entero o no se mueve nada.
create or replace function public.move_establishment_to_group(
  p_establishment_id uuid,
  p_group_id uuid,
  p_previous_access text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_est public.establishments;
  v_target public.groups;
  v_old_name text;
  v_person record;
  v_previo record;
  v_membership_id uuid;
  v_kept uuid[] := '{}';
  v_lost uuid[] := '{}';
begin
  select * into v_est from public.establishments where id = p_establishment_id for update;
  if v_est.id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  select * into v_target from public.groups where id = p_group_id;
  if v_target.id is null or v_target.space_id <> v_est.space_id then
    raise exception 'Ese grupo no es de este espacio';
  end if;

  -- RN-EST-20 · el equipo a cualquier grupo; el propietario del
  -- restaurante, solo a uno del que también sea propietario global.
  if not public.has_capability(v_est.space_id, 'manage_clients') then
    if not public.is_establishment_owner_user(p_establishment_id, auth.uid()) then
      raise exception 'Mover un restaurante de grupo lo hacen el equipo o su propietario';
    end if;
    if not exists (
      select 1 from public.group_memberships gm
      where gm.group_id = p_group_id
        and gm.user_id = auth.uid()
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    ) then
      raise exception 'Solo puedes moverlo a un grupo del que también seas propietario';
    end if;
  end if;

  if p_previous_access is null or p_previous_access not in ('keep_as_editor', 'revoke') then
    raise exception 'Hay que elegir qué pasa con quien entraba por el grupo de origen: quedarse como Editor o perder el acceso';
  end if;

  -- Moverlo adonde ya está no hace nada: pulsar dos veces es un solo efecto.
  if v_est.group_id = p_group_id then
    return jsonb_build_object('moved', false, 'kept_as_editor', 0, 'lost_access', 0);
  end if;

  select name into v_old_name from public.groups where id = v_est.group_id;

  -- Quién entraba por el grupo de origen y no seguirá entrando.
  for v_person in
    select gm.user_id, gm.role
    from public.group_memberships gm
    where gm.group_id = v_est.group_id
      and gm.revoked_at is null
      and not exists (
        select 1 from public.group_memberships d
        where d.group_id = p_group_id and d.user_id = gm.user_id and d.revoked_at is null
      )
      and not exists (
        select 1 from public.establishment_memberships em
        where em.establishment_id = p_establishment_id
          and em.user_id = gm.user_id
          and em.revoked_at is null
      )
    order by gm.created_at, gm.user_id
  loop
    if p_previous_access = 'revoke' then
      v_lost := v_lost || v_person.user_id;
      continue;
    end if;

    -- RN-EST-05 · devolver el acceso reutiliza la membresía que tuvo, si
    -- la tuvo: su actividad histórica cuelga de ella.
    select * into v_previo
    from public.establishment_memberships
    where establishment_id = p_establishment_id and user_id = v_person.user_id
    order by (revoked_at is null) desc, created_at desc
    limit 1
    for update;

    if v_previo.id is null then
      insert into public.establishment_memberships (establishment_id, user_id, role)
      values (p_establishment_id, v_person.user_id, 'editor')
      returning id into v_membership_id;
    else
      v_membership_id := v_previo.id;
      update public.establishment_memberships
      set revoked_at = null, revoked_by = null, role = 'editor'
      where id = v_membership_id;
    end if;

    -- Los operativos que ya usaba, sin los de propietario (RN-EST-20).
    insert into public.establishment_permissions (
      establishment_membership_id, edit_establishment_data, view_billing,
      create_requests, edit_menus, use_messages, upload_files, view_reports, manage_users)
    values (v_membership_id, false, false, true, true, true, true, true, false)
    on conflict (establishment_membership_id) do update
      set edit_establishment_data = false, view_billing = false,
          create_requests = true, edit_menus = true, use_messages = true,
          upload_files = true, view_reports = true, manage_users = false;

    v_kept := v_kept || v_person.user_id;
  end loop;

  -- El restaurante, y lo que guarda su grupo con él: sus archivos
  -- (RN-ARC-02) y sus informes individuales. Los consolidados del grupo de
  -- origen (sin restaurante) se quedan: son historia de ese grupo.
  update public.establishments set group_id = p_group_id where id = p_establishment_id;

  update public.files set group_id = p_group_id
  where establishment_id = p_establishment_id and group_id is distinct from p_group_id;

  update public.reports set group_id = p_group_id
  where establishment_id = p_establishment_id
    and group_id is not null
    and group_id <> p_group_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_est.space_id, auth.uid(), 'establishment.group_changed', 'establishment', p_establishment_id,
    jsonb_build_object('group_id', v_est.group_id, 'group_name', v_old_name),
    jsonb_build_object('group_id', p_group_id, 'group_name', v_target.name,
                       'previous_access', p_previous_access,
                       'kept_as_editor', to_jsonb(v_kept),
                       'lost_access', to_jsonb(v_lost))
  );

  return jsonb_build_object(
    'moved', true,
    'kept_as_editor', coalesce(array_length(v_kept, 1), 0),
    'lost_access', coalesce(array_length(v_lost, 1), 0)
  );
end;
$$;

comment on function public.move_establishment_to_group(uuid, uuid, text) is
  'RN-EST-20 · mueve un restaurante a otro grupo del mismo espacio. El
   equipo a cualquiera; su propietario, solo a uno del que también sea
   propietario global. Quien entraba por el grupo de origen se queda como
   Editor o pierde el acceso; el de destino entra en el acto. Se lleva sus
   archivos y sus informes individuales. Al mismo grupo, no hace nada.';

revoke all on function public.move_establishment_to_group(uuid, uuid, text) from public, anon;
grant execute on function public.move_establishment_to_group(uuid, uuid, text) to authenticated;
