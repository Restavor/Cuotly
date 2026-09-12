-- El cuarto caso de RN-EST-04: "todos los actuales Y FUTUROS".
--
-- **Lo que se creía y no era.** La migración 70 dejó este caso fuera
-- diciendo que "necesita un modelo que no se ha decidido", y la pantalla
-- avisaba de que los restaurantes futuros no quedaban incluidos. Al
-- repasarlo (12/09/2026) resulta que el modelo estaba decidido desde la
-- migración 39: una fila en `group_memberships` con rol `editor` ES
-- "todos los actuales y futuros" — `can_read_establishment()` y
-- `can_write_establishment()` pasan por el grupo, así que un restaurante
-- dado de alta mañana queda cubierto sin tocar nada. Lo único que no
-- existía era la función que escribe esa fila. Es el mismo error que
-- `read_only`/`archived`: dar por no hecho lo que ya estaba, y preguntar
-- en vez de leer.
--
-- **Por qué solo `editor`.** RN-EST-04 habla de un Editor. El propietario
-- global es RN-EST-03 y nace con el grupo; `consulta` y `local_owner` no
-- existen a nivel de grupo (el CHECK de la 39 admite `global_owner` y
-- `editor`, y ampliarlo sería inventar una regla). La función rechaza
-- cualquier otro rol con su mensaje en vez de ignorar el parámetro: una
-- pantalla que mande "consulta" y reciba un editor de grupo sin que nadie
-- se lo diga es peor que un error.
--
-- **Lo que un editor de grupo puede y no puede**, que ya decidía la 39 y
-- aquí solo se enseña bien: escribe en todos los restaurantes del grupo y
-- NO ve la facturación (`client_can_view_billing()` exige `global_owner`
-- por el grupo). `establishment_client_users()` pintaba a todo miembro de
-- grupo con `view_billing = true` porque cuando se escribió solo existía
-- el propietario global; se corrige para que diga lo mismo que la guarda.
--
-- **RN-EST-05 · devolver el acceso reutiliza la fila.** Igual que en la
-- 70 para los restaurantes: la actividad histórica cuelga de la
-- membresía. Y a un propietario global NO se le rebaja a editor por esta
-- vía: lo tiene todo por serlo, y "dar acceso" no puede quitar.
--
-- Se comprueba con `supabase/tests/dar_acceso_a_un_restaurante.sql`.

create or replace function public.grant_group_future_establishments_access(
  p_group_id uuid,
  p_email text,
  p_role text default 'editor'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_user_id uuid;
  v_previo record;
  v_membership_id uuid;
begin
  select space_id into v_space_id from public.groups where id = p_group_id;

  if v_space_id is null then
    raise exception 'Grupo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden dar acceso a un grupo';
  end if;

  if p_role is distinct from 'editor' then
    raise exception 'El acceso a todos los restaurantes del grupo, incluidos los futuros, solo existe para un Editor (RN-EST-04)';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(btrim(coalesce(p_email, '')));

  if v_user_id is null then
    raise exception 'No hay ninguna cuenta de Cuotly con ese correo: esta pantalla añade a quien ya existe';
  end if;

  -- La unicidad es de los accesos VIVOS (índice parcial de la 39), así que
  -- puede haber varias filas retiradas de la misma persona: se reutiliza
  -- la viva si la hay y, si no, la última retirada.
  select * into v_previo
  from public.group_memberships
  where group_id = p_group_id and user_id = v_user_id
  order by (revoked_at is null) desc, created_at desc
  limit 1
  for update;

  if v_previo.id is not null and v_previo.revoked_at is null then
    if v_previo.role = 'global_owner' then
      raise exception 'Ya es propietario global del grupo: tiene ese acceso y más, y dar acceso no puede rebajarlo (RN-EST-03)';
    end if;
    -- Ya es editor de grupo. Idempotente: ni fila nueva ni segundo apunte.
    return v_previo.id;
  end if;

  if v_previo.id is null then
    insert into public.group_memberships (group_id, user_id, role)
    values (p_group_id, v_user_id, 'editor')
    returning id into v_membership_id;
  else
    v_membership_id := v_previo.id;
    update public.group_memberships
    set revoked_at = null, revoked_by = null, role = 'editor'
    where id = v_membership_id;
  end if;

  insert into public.audit_log
    (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'group_access.granted', 'group', p_group_id,
    case
      when v_previo.id is null then jsonb_build_object('user_id', v_user_id, 'had_access', false)
      else jsonb_build_object('user_id', v_user_id, 'had_access', false, 'role', v_previo.role)
    end,
    jsonb_build_object('user_id', v_user_id, 'email', lower(btrim(p_email)), 'had_access', true,
                       'role', 'editor', 'future_establishments', true)
  );

  return v_membership_id;
end;
$$;

comment on function public.grant_group_future_establishments_access(uuid, text, text) is
  'RN-EST-04 · "todos los actuales y futuros": una membresía de grupo con
   rol `editor` (modelo de la migración 39). Cubre los restaurantes que el
   grupo tiene hoy y los que se den de alta mañana, sin más filas.
   Reutiliza la membresía retirada si la hubo (RN-EST-05) y no rebaja a un
   propietario global. Solo Editor: los demás roles no existen a nivel de
   grupo.';

revoke all on function public.grant_group_future_establishments_access(uuid, text, text) from public, anon;
grant execute on function public.grant_group_future_establishments_access(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- Los comentarios de la 70 decían algo que ya no es verdad
-- ------------------------------------------------------------
--
-- Una migración aplicada no se edita (CLAUDE.md), pero un comentario de
-- función se puede volver a poner: quien lea `\df+` dentro de un año no
-- tiene por qué encontrarse "un modelo que no se ha decidido".
comment on function public.grant_establishment_access(uuid, text, text, boolean, boolean) is
  'RN-EST-04 · da acceso a UN restaurante a alguien que ya tiene cuenta.
   Normaliza los permisos finos según el rol (RN-EST-11, RN-FIN-07) y
   reactiva la membresía anterior si la hubo, para no perder la actividad
   histórica (RN-EST-05). El caso "y futuros" lo cubre
   grant_group_future_establishments_access() desde la migración 74.';

comment on function public.grant_group_current_establishments_access(uuid, text, text, boolean, boolean) is
  'RN-EST-04 · "todos los actuales": da acceso a los restaurantes que el
   grupo tiene HOY, en una sola transacción, y por eso el apunte deja
   escrito `future_establishments: false`. Para incluir también los de
   mañana está grant_group_future_establishments_access() (migración 74).';

-- ------------------------------------------------------------
-- La lista de la ficha dice lo mismo que la guarda
-- ------------------------------------------------------------
create or replace function public.establishment_client_users(p_establishment_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  source text,
  role text,
  edit_establishment_data boolean,
  view_billing boolean,
  granted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    nullif(btrim(p.full_name), ''),
    p.email,
    'establishment'::text,
    em.role,
    coalesce(ep.edit_establishment_data, false),
    coalesce(ep.view_billing, false),
    em.created_at
  from public.establishment_memberships em
  join public.profiles p on p.id = em.user_id
  left join public.establishment_permissions ep on ep.establishment_membership_id = em.id
  where em.establishment_id = p_establishment_id
    and em.revoked_at is null
    and public.is_space_member(public.establishment_space_id(p_establishment_id))

  union all

  select
    p.id,
    nullif(btrim(p.full_name), ''),
    p.email,
    'group'::text,
    gm.role,
    -- RN-EST-11 · a nivel de grupo no hay permisos finos: el propietario
    -- global lo tiene todo por serlo, y el editor de grupo escribe en
    -- todos los restaurantes pero NO ve la facturación — es exactamente
    -- lo que decide `client_can_view_billing()`, y esta lista tiene que
    -- decir lo mismo.
    true,
    gm.role = 'global_owner',
    gm.created_at
  from public.group_memberships gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = (select e.group_id from public.establishments e where e.id = p_establishment_id)
    and gm.revoked_at is null
    and public.is_space_member(public.establishment_space_id(p_establishment_id))

  order by 4, 2 nulls last, 3;
$$;

revoke all on function public.establishment_client_users(uuid) from public, anon;
grant execute on function public.establishment_client_users(uuid) to authenticated;
