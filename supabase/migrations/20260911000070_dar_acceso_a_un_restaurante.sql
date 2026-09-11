-- Dar acceso a un restaurante (RN-EST-04, maqueta 15).
--
-- La pestaña Usuarios sabe retirar un acceso desde la maqueta 15 y no
-- sabía darlo: no existía ninguna función que creara una membresía de
-- cliente. Las que hay —`revoke_establishment_access()` y su hermana de
-- grupo— solo quitan.
--
-- **Qué parte de RN-EST-04 entra aquí y cuál no.** La regla dice: "un
-- Editor puede asignarse a uno, varios, todos los actuales, o todos los
-- actuales **y futuros**". Las tres primeras son una lista de
-- establecimientos que existe hoy y se resuelve escribiendo filas. La
-- cuarta no: "y futuros" es una regla permanente que tiene que actuar
-- sobre restaurantes que aún no existen, y eso necesita un modelo —una
-- marca en la membresía de grupo, como la que ya tiene el propietario
-- global por RN-EST-03— que nadie ha decidido. **No se inventa**: esta
-- migración cubre uno, varios y todos los actuales, y el "y futuros" queda
-- pendiente, dicho en la pantalla.
--
-- **Existente, no invitado.** La maqueta dice "Añadir usuario existente" y
-- es literal: en Cuotly se invita al ESPACIO (`space_invitations`, HU-03),
-- no a un restaurante. A quien todavía no tiene cuenta no se le puede dar
-- acceso aquí, y la función lo dice con esas palabras en vez de crear a
-- medias algo que no existe.
--
-- **Los permisos finos no son libres.** RN-EST-11 y RN-FIN-07 dicen quién
-- puede tener cada uno, así que la función los normaliza en vez de creerse
-- lo que le manden:
--
--   · Propietario local: los dos, por serlo.
--   · Editor: los que se le concedan (es el único caso con elección).
--   · Consulta: ninguno — "solo lectura. No ve facturación".
--
-- Se comprueba con `supabase/tests/dar_acceso_a_un_restaurante.sql`.

create or replace function public.grant_establishment_access(
  p_establishment_id uuid,
  p_email text,
  p_role text,
  p_edit_establishment_data boolean default false,
  p_view_billing boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_user_id uuid;
  v_membership_id uuid;
  v_previo public.establishment_memberships;
  v_edit boolean;
  v_billing boolean;
begin
  v_space_id := public.establishment_space_id(p_establishment_id);

  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden dar acceso a un restaurante';
  end if;

  if p_role not in ('local_owner', 'editor', 'consulta') then
    raise exception 'El rol tiene que ser propietario local, editor o consulta';
  end if;

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
  elsif p_role = 'consulta' then
    v_edit := false;
    v_billing := false;
  else
    v_edit := coalesce(p_edit_establishment_data, false);
    v_billing := coalesce(p_view_billing, false);
  end if;

  select * into v_previo
  from public.establishment_memberships
  where establishment_id = p_establishment_id and user_id = v_user_id
  for update;

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

  return v_membership_id;
end;
$$;

comment on function public.grant_establishment_access(uuid, text, text, boolean, boolean) is
  'RN-EST-04 · da acceso a UN restaurante a alguien que ya tiene cuenta.
   Normaliza los permisos finos según el rol (RN-EST-11, RN-FIN-07) y
   reactiva la membresía anterior si la hubo, para no perder la actividad
   histórica (RN-EST-05). El caso "y futuros" de RN-EST-04 NO está: exige
   un modelo que no se ha decidido.';

revoke all on function public.grant_establishment_access(uuid, text, text, boolean, boolean) from public, anon;
grant execute on function public.grant_establishment_access(uuid, text, text, boolean, boolean) to authenticated;

-- ------------------------------------------------------------
-- "Todos los actuales", que es una lista, no una regla permanente
-- ------------------------------------------------------------
--
-- Se resuelve aquí y no en la pantalla por dos motivos: el bucle se hace
-- en una transacción —o entra en todos o en ninguno— y el apunte de
-- auditoría dice lo que se pidió ("a todos los de este grupo"), no
-- veintitrés apuntes sueltos que nadie relaciona.
create or replace function public.grant_group_current_establishments_access(
  p_group_id uuid,
  p_email text,
  p_role text,
  p_edit_establishment_data boolean default false,
  p_view_billing boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment record;
  v_count integer := 0;
begin
  select space_id into v_space_id from public.groups where id = p_group_id;

  if v_space_id is null then
    raise exception 'Grupo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden dar acceso a un grupo';
  end if;

  -- Los archivados no entran: dar acceso a un restaurante archivado no es
  -- dar acceso a nada, y ensuciaría la lista de quien lo reciba.
  for v_establishment in
    select id from public.establishments
    where group_id = p_group_id and status <> 'archived'
    order by code
  loop
    perform public.grant_establishment_access(
      v_establishment.id, p_email, p_role, p_edit_establishment_data, p_view_billing);
    v_count := v_count + 1;
  end loop;

  insert into public.audit_log
    (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id, auth.uid(), 'group_access.granted', 'group', p_group_id,
    jsonb_build_object('email', lower(btrim(p_email)), 'role', p_role, 'establishments', v_count,
                       'future_establishments', false)
  );

  return v_count;
end;
$$;

comment on function public.grant_group_current_establishments_access(uuid, text, text, boolean, boolean) is
  'RN-EST-04 · "todos los actuales": da acceso a los restaurantes que el
   grupo tiene HOY, en una sola transacción. NO cubre "y futuros" — eso es
   una regla permanente y necesita un modelo que no se ha decidido, y por
   eso el apunte deja escrito `future_establishments: false`.';

revoke all on function public.grant_group_current_establishments_access(uuid, text, text, boolean, boolean) from public, anon;
grant execute on function public.grant_group_current_establishments_access(uuid, text, text, boolean, boolean) to authenticated;
