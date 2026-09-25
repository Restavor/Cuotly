-- Cuotly elimina cuentas, espacios y restaurantes (decisión 81,
-- 25/09/2026; PRD §32, RN-ADM-14 a RN-ADM-20).
--
-- Bosco: *"el propietario de Cuotly y los administradores de Cuotly
-- pueden eliminar usuarios registrados, sus espacios y sus restaurantes"*.
-- Preguntado, decide: (1) los administradores, con un **permiso fino
-- nuevo** que concede él; (2) si la cuenta es la única propietaria de un
-- espacio, **la propiedad pasa a un administrador del espacio elegido, o
-- al azar, y si no hay ninguno a un trabajador elegido, o al azar**; (3)
-- **solo Cuotly lo recupera**, sin plazo.
--
-- **Eliminar no es borrar**, por lo mismo que en la 139: CLAUDE.md
-- prohíbe borrar registros de negocio (RN-DAT-06), la decisión 38 dejó
-- dicho que nada se elimina y el borrado real es del bloque legal
-- (pendiente 20). Aquí "eliminar" es:
--   · un **espacio**: el modo `archived_by_platform` de `cuotly_status`,
--     que hereda la solo lectura de la 90 en toda tabla con `space_id`
--     (RN-ADM-16). Como el archivado del propietario, pero sin plazo y
--     sin restauración por su dueño.
--   · un **restaurante**: `archived`, con `platform_archived_at` marcado
--     para que el equipo del espacio no lo reactive (RN-ADM-17).
--   · una **cuenta**: no puede entrar (`auth.users.banned_until`, y sus
--     sesiones abiertas se cierran), sale de todos los equipos por la 139,
--     pierde sus accesos a restaurantes y queda apuntada en
--     `platform_account_closures`, con lo necesario para devolvérselo
--     todo si Cuotly la recupera (RN-ADM-18, RN-ADM-19).
--
-- Se comprueba con `supabase/tests/cuotly_elimina_cuentas_espacios_y_restaurantes.sql`.

-- ============================================================
-- 1 · El permiso fino (RN-ADM-14)
-- ============================================================
alter table public.platform_roles
  add column can_delete_accounts boolean not null default false;

comment on column public.platform_roles.can_delete_accounts is
  'RN-ADM-14 · puede eliminar y recuperar cuentas, espacios y
   restaurantes. Lo concede Bosco (RN-ADM-03).';

create or replace function public.is_platform_account_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
      or (public.is_platform_admin()
          and exists (
            select 1 from public.platform_roles pr
            where pr.user_id = auth.uid() and pr.can_delete_accounts
          ));
$$;

comment on function public.is_platform_account_manager() is
  'RN-ADM-14 · Bosco, o un Administrador de Cuotly con `can_delete_accounts`,
   con la sesión en dos pasos (RN-ADM-02, heredado de is_platform_owner()
   e is_platform_admin()).';

revoke all on function public.is_platform_account_manager() from public, anon;
grant execute on function public.is_platform_account_manager() to authenticated;

-- Nombrar con el permiso nuevo. La firma cambia, así que la vieja se
-- retira: dos funciones con el mismo nombre dejarían a PostgREST eligiendo.
drop function public.set_platform_admin(uuid, boolean, boolean, boolean);

create or replace function public.set_platform_admin(
  p_user_id uuid,
  p_can_approve_spaces boolean default false,
  p_can_manage_subscriptions boolean default false,
  p_can_support boolean default false,
  p_can_delete_accounts boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.platform_roles;
  v_email text;
begin
  if not public.is_platform_owner() then
    raise exception 'Solo el propietario de Cuotly nombra Administradores de Cuotly (§167)';
  end if;

  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    raise exception 'Esa persona no tiene cuenta en Cuotly';
  end if;
  if lower(v_email) = lower('info@restavor.com') then
    raise exception 'El propietario de Cuotly no se nombra a sí mismo: lo identifica su correo';
  end if;
  if exists (select 1 from public.platform_account_closures c
             where c.user_id = p_user_id and c.restored_at is null) then
    raise exception 'Esa cuenta está eliminada: recupérala antes de nombrarla (RN-ADM-18)';
  end if;

  select * into v_previous from public.platform_roles where user_id = p_user_id;

  insert into public.platform_roles (user_id, role, can_approve_spaces, can_manage_subscriptions, can_support, can_delete_accounts)
  values (p_user_id, 'cuotly_admin', p_can_approve_spaces, p_can_manage_subscriptions, p_can_support, p_can_delete_accounts)
  on conflict (user_id) do update
    set can_approve_spaces = excluded.can_approve_spaces,
        can_manage_subscriptions = excluded.can_manage_subscriptions,
        can_support = excluded.can_support,
        can_delete_accounts = excluded.can_delete_accounts;

  if v_previous.user_id is null then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (null, auth.uid(), 'platform.admin_granted', 'platform_role', p_user_id,
            jsonb_build_object('can_approve_spaces', p_can_approve_spaces,
                               'can_manage_subscriptions', p_can_manage_subscriptions,
                               'can_support', p_can_support,
                               'can_delete_accounts', p_can_delete_accounts));
  elsif v_previous.can_approve_spaces is distinct from p_can_approve_spaces
     or v_previous.can_manage_subscriptions is distinct from p_can_manage_subscriptions
     or v_previous.can_support is distinct from p_can_support
     or v_previous.can_delete_accounts is distinct from p_can_delete_accounts then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (null, auth.uid(), 'platform.admin_updated', 'platform_role', p_user_id,
            jsonb_build_object('can_approve_spaces', v_previous.can_approve_spaces,
                               'can_manage_subscriptions', v_previous.can_manage_subscriptions,
                               'can_support', v_previous.can_support,
                               'can_delete_accounts', v_previous.can_delete_accounts),
            jsonb_build_object('can_approve_spaces', p_can_approve_spaces,
                               'can_manage_subscriptions', p_can_manage_subscriptions,
                               'can_support', p_can_support,
                               'can_delete_accounts', p_can_delete_accounts));
  end if;
end;
$$;

revoke all on function public.set_platform_admin(uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_platform_admin(uuid, boolean, boolean, boolean, boolean) to authenticated;

create or replace function public.revoke_platform_admin(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.platform_roles;
begin
  if not public.is_platform_owner() then
    raise exception 'Solo el propietario de Cuotly retira Administradores de Cuotly (§167)';
  end if;

  select * into v_previous from public.platform_roles where user_id = p_user_id;
  if v_previous.user_id is null then
    return false; -- CA-17.
  end if;

  update public.support_sessions
  set ended_at = now(), end_note = 'Rol de Administrador de Cuotly retirado'
  where actor_id = p_user_id and ended_at is null;

  delete from public.platform_roles where user_id = p_user_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value)
  values (null, auth.uid(), 'platform.admin_revoked', 'platform_role', p_user_id,
          jsonb_build_object('can_approve_spaces', v_previous.can_approve_spaces,
                             'can_manage_subscriptions', v_previous.can_manage_subscriptions,
                             'can_support', v_previous.can_support,
                             'can_delete_accounts', v_previous.can_delete_accounts));
  return true;
end;
$$;

create or replace function public.my_platform_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'is_owner', exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and lower(p.email) = lower('info@restavor.com')
    ),
    'is_admin', exists (select 1 from public.platform_roles pr where pr.user_id = auth.uid()),
    'can_approve_spaces', coalesce((select pr.can_approve_spaces from public.platform_roles pr where pr.user_id = auth.uid()), false),
    'can_manage_subscriptions', coalesce((select pr.can_manage_subscriptions from public.platform_roles pr where pr.user_id = auth.uid()), false),
    'can_support', coalesce((select pr.can_support from public.platform_roles pr where pr.user_id = auth.uid()), false),
    'can_delete_accounts', coalesce((select pr.can_delete_accounts from public.platform_roles pr where pr.user_id = auth.uid()), false),
    'two_factor', public.session_is_two_factor()
  );
$$;

-- ============================================================
-- 2 · El libro de las cuentas eliminadas (RN-ADM-18, RN-ADM-19)
-- ============================================================
--
-- Sin `space_id`: una cuenta no es de ningún espacio. La lee la
-- plataforma y nadie más; no tiene política de escritura: la escriben las
-- dos funciones de abajo.
create table public.platform_account_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  actor_id uuid not null references public.profiles (id),
  reason text not null check (length(btrim(reason)) > 0),
  closed_at timestamptz not null default now(),
  -- Lo que se le quitó, para devolvérselo al recuperarla: pertenencias a
  -- equipos (con su rol y estado), a quién pasó cada propiedad, los
  -- espacios que se archivaron por no tener a quién pasar, y sus accesos a
  -- restaurantes y grupos.
  details jsonb not null default '{}'::jsonb,
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),
  restore_reason text,
  constraint platform_account_closures_restore_shape check (
    (restored_at is null) = (restored_by is null)
  )
);

create unique index platform_account_closures_open_idx
  on public.platform_account_closures (user_id) where restored_at is null;

comment on table public.platform_account_closures is
  'RN-ADM-18/19 · cada cuenta que Cuotly elimina, con lo que se le quitó y,
   si se recupera, quién y cuándo. No se borra ni se edita desde la
   aplicación: una fila abierta es una cuenta eliminada.';

alter table public.platform_account_closures enable row level security;

create policy platform_account_closures_select on public.platform_account_closures
  for select using (public.is_platform_member());

-- ============================================================
-- 3 · Espacios: el modo `archived_by_platform` (RN-ADM-16)
-- ============================================================
-- El CHECK con nombre es de la 92; se ensancha con el sexto modo.
alter table public.spaces drop constraint if exists spaces_cuotly_status_check;
alter table public.spaces add constraint spaces_cuotly_status_check check (
  cuotly_status is null or cuotly_status in (
    'trial', 'active', 'archived_trial_ended', 'archived_nonpayment', 'archived_by_owner',
    'archived_by_platform'
  ));

create or replace function public.space_status_is_archived(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('archived_trial_ended', 'archived_nonpayment', 'archived_by_owner', 'archived_by_platform');
$$;

-- Los barridos de la suscripción de Cuotly no sacan a un espacio de donde
-- lo dejó la plataforma, igual que no lo sacan del archivado del
-- propietario: sale quien lo metió (RN-ADM-16).
create or replace function public.set_space_cuotly_status_internal(p_space_id uuid, p_status text, p_reason text, p_cause text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_now timestamptz := now();
  v_archiving boolean := p_status in ('archived_trial_ended', 'archived_nonpayment');
begin
  select cuotly_status into v_current from public.spaces where id = p_space_id for update;

  if v_current is not distinct from p_status then
    return;
  end if;

  if v_current in ('archived_by_owner', 'archived_by_platform') then
    return;
  end if;

  perform set_config('cuotly.space_status_change', 'on', true);
  update public.spaces
  set cuotly_status = p_status,
      cuotly_status_changed_at = v_now,
      cuotly_archived_at = case when v_archiving then v_now else null end,
      cuotly_reactivation_deadline_at =
        case when v_archiving then v_now + make_interval(days => public.cuotly_constant('reactivation_days')) else null end
  where id = p_space_id;

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (p_space_id, 'space', p_space_id, v_current, p_status, auth.uid(), p_reason, p_cause);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, auth.uid(),
          case
            when p_status = 'archived_trial_ended' then 'space.archived_trial_ended'
            when p_status = 'archived_nonpayment' then 'space.archived_nonpayment'
            when v_current = 'trial' then 'space.activated'
            else 'space.reactivated'
          end,
          'space', p_space_id,
          jsonb_build_object('cuotly_status', v_current),
          jsonb_build_object('cuotly_status', p_status, 'cause', p_cause),
          p_reason);
  perform set_config('cuotly.space_status_change', 'off', true);

  if v_archiving then
    perform public.notify_cuotly_event(
      p_space_id, 'cuotly_space_archived', 'space', p_space_id,
      'cuotly_space_archived:' || p_space_id::text || ':' || to_char(v_now, 'YYYYMMDDHH24MISS'));
  elsif v_current in ('archived_trial_ended', 'archived_nonpayment') then
    perform public.notify_cuotly_event(
      p_space_id, 'cuotly_space_reactivated', 'space', p_space_id,
      'cuotly_space_reactivated:' || p_space_id::text || ':' || to_char(v_now, 'YYYYMMDDHH24MISS'));
  end if;
end;
$$;

revoke all on function public.set_space_cuotly_status_internal(uuid, text, text, text) from public, anon, authenticated;

-- El cuerpo de eliminar y recuperar un espacio, sin comprobar permisos:
-- lo llaman las funciones de plataforma de abajo, que sí los comprueban.
create or replace function public.platform_set_space_archived_internal(
  p_space_id uuid,
  p_archive boolean,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_target text;
  v_now timestamptz := now();
  -- Quien la llama puede tener ya abierta la solo lectura (eliminar una
  -- cuenta la abre para todo su recorrido): se deja como estaba.
  v_switch text := coalesce(current_setting('cuotly.space_status_change', true), '');
begin
  select cuotly_status into v_current from public.spaces where id = p_space_id for update;
  if not found then
    raise exception 'Espacio no encontrado';
  end if;

  if p_archive then
    if v_current is not distinct from 'archived_by_platform' then
      return false; -- CA-17.
    end if;
    v_target := 'archived_by_platform';
  else
    if v_current is distinct from 'archived_by_platform' then
      return false; -- CA-17: no estaba eliminado por Cuotly.
    end if;
    -- Vuelve al modo del que salió, leído del libro de estados.
    select se.from_state into v_target
    from public.state_events se
    where se.entity_type = 'space' and se.entity_id = p_space_id
      and se.to_state = 'archived_by_platform'
    order by se.occurred_at desc
    limit 1;
  end if;

  perform set_config('cuotly.space_status_change', 'on', true);
  update public.spaces
  set cuotly_status = v_target,
      cuotly_status_changed_at = v_now,
      cuotly_archived_at = case
        when p_archive then coalesce(cuotly_archived_at, v_now)
        when public.space_status_is_archived(v_target) then cuotly_archived_at
        else null
      end
  where id = p_space_id;

  -- Un espacio sin suscripción de Cuotly tiene el modo vacío, y el libro
  -- exige un destino: se apunta `none`. Al recuperarlo, `from_state` nulo
  -- lo devuelve a vacío.
  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (p_space_id, 'space', p_space_id, v_current, coalesce(v_target, 'none'), auth.uid(), p_reason, 'platform');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, auth.uid(),
          case when p_archive then 'space.archived_by_platform' else 'space.restored_by_platform' end,
          'space', p_space_id,
          jsonb_build_object('cuotly_status', v_current),
          jsonb_build_object('cuotly_status', v_target),
          p_reason);
  perform set_config('cuotly.space_status_change', v_switch, true);

  return true;
end;
$$;

revoke all on function public.platform_set_space_archived_internal(uuid, boolean, text) from public, anon, authenticated;

create or replace function public.platform_delete_space(p_space_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done boolean;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Cuotly o un Administrador de Cuotly con permiso para eliminar elimina un espacio (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Eliminar un espacio exige motivo (§140, RN-ADM-15)';
  end if;

  v_done := public.platform_set_space_archived_internal(p_space_id, true, btrim(p_reason));

  if v_done then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
    values (null, auth.uid(), 'platform.space_deleted', 'space', p_space_id,
            jsonb_build_object('space_id', p_space_id), btrim(p_reason));
  end if;
  return v_done;
end;
$$;

comment on function public.platform_delete_space(uuid, text) is
  'RN-ADM-16 · Cuotly elimina un espacio: pasa a `archived_by_platform`,
   solo lectura para todo su equipo y sus restaurantes, sin plazo. No borra
   nada. Solo Cuotly lo recupera.';

revoke all on function public.platform_delete_space(uuid, text) from public, anon;
grant execute on function public.platform_delete_space(uuid, text) to authenticated;

create or replace function public.platform_restore_space(p_space_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done boolean;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Cuotly o un Administrador de Cuotly con permiso para eliminar recupera un espacio (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Recuperar un espacio exige motivo (§140, RN-ADM-15)';
  end if;

  v_done := public.platform_set_space_archived_internal(p_space_id, false, btrim(p_reason));

  if v_done then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
    values (null, auth.uid(), 'platform.space_restored', 'space', p_space_id,
            jsonb_build_object('space_id', p_space_id), btrim(p_reason));
  end if;
  return v_done;
end;
$$;

revoke all on function public.platform_restore_space(uuid, text) from public, anon;
grant execute on function public.platform_restore_space(uuid, text) to authenticated;

-- ============================================================
-- 4 · Restaurantes (RN-ADM-17)
-- ============================================================
alter table public.establishments add column platform_archived_at timestamptz;

comment on column public.establishments.platform_archived_at is
  'RN-ADM-17 · cuándo lo eliminó Cuotly. Mientras tenga fecha, el
   restaurante sigue archivado y solo Cuotly lo recupera. Quién fue está en
   la auditoría, no en una columna que la RLS enseñaría al restaurante.';

-- La marca solo la mueven las funciones de plataforma, y con ella puesta
-- el estado no se toca, venga el cambio de donde venga: el equipo desde la
-- ficha, el ciclo de impago o un `update` por PostgREST.
create or replace function public.guard_platform_archived_establishment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.platform_archived_at is distinct from old.platform_archived_at
     and coalesce(current_setting('cuotly.platform_change', true), '') <> 'on' then
    raise exception 'Solo Cuotly elimina o recupera un restaurante desde su panel (RN-ADM-17)';
  end if;

  if old.platform_archived_at is not null and new.platform_archived_at is not null
     and new.status is distinct from old.status then
    raise exception 'Este restaurante lo eliminó Cuotly: solo Cuotly lo recupera (RN-ADM-17)';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_platform_archived_establishment() from public, anon, authenticated;

create trigger establishments_guard_platform_archived
  before update on public.establishments
  for each row execute function public.guard_platform_archived_establishment();

create or replace function public.platform_delete_establishment(p_establishment_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_status text;
  v_flag timestamptz;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Cuotly o un Administrador de Cuotly con permiso para eliminar elimina un restaurante (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Eliminar un restaurante exige motivo (§140, RN-ADM-15)';
  end if;

  select space_id, status, platform_archived_at into v_space_id, v_status, v_flag
  from public.establishments where id = p_establishment_id for update;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if v_flag is not null then
    return false; -- CA-17.
  end if;

  -- La solo lectura de un espacio archivado es para las personas que
  -- trabajan en él; esto es la plataforma cerrando algo (RN-ADM-16).
  perform set_config('cuotly.space_status_change', 'on', true);
  perform public.set_establishment_status_internal(p_establishment_id, 'archived', btrim(p_reason));

  perform set_config('cuotly.platform_change', 'on', true);
  update public.establishments set platform_archived_at = now() where id = p_establishment_id;
  perform set_config('cuotly.platform_change', 'off', true);
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.archived_by_platform', 'establishment', p_establishment_id,
          jsonb_build_object('status', v_status), jsonb_build_object('status', 'archived'), btrim(p_reason));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, auth.uid(), 'platform.establishment_deleted', 'establishment', p_establishment_id,
          jsonb_build_object('space_id', v_space_id, 'status', v_status), btrim(p_reason));
  return true;
end;
$$;

comment on function public.platform_delete_establishment(uuid, text) is
  'RN-ADM-17 · Cuotly elimina un restaurante: queda archivado (sus
   integraciones se desconectan como en cualquier archivado) y marcado para
   que solo Cuotly lo recupere. No borra nada.';

revoke all on function public.platform_delete_establishment(uuid, text) from public, anon;
grant execute on function public.platform_delete_establishment(uuid, text) to authenticated;

create or replace function public.platform_restore_establishment(p_establishment_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_flag timestamptz;
  v_previous text;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Cuotly o un Administrador de Cuotly con permiso para eliminar recupera un restaurante (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Recuperar un restaurante exige motivo (§140, RN-ADM-15)';
  end if;

  select space_id, platform_archived_at into v_space_id, v_flag
  from public.establishments where id = p_establishment_id for update;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if v_flag is null then
    return false; -- CA-17: no lo eliminó Cuotly.
  end if;

  -- Vuelve al estado en que lo encontró Cuotly, apuntado al eliminarlo.
  -- Si el equipo ya lo tenía archivado, sigue archivado: lo reactiva el
  -- equipo si quiere. Si era `active` y hay deuda vencida, la guarda de
  -- RN-FIN-13 lo dice aquí mismo.
  select a.old_value ->> 'status' into v_previous
  from public.audit_log a
  where a.action = 'establishment.archived_by_platform' and a.entity_id = p_establishment_id
  order by a.created_at desc
  limit 1;
  v_previous := coalesce(v_previous, 'active');

  perform set_config('cuotly.space_status_change', 'on', true);
  perform set_config('cuotly.platform_change', 'on', true);
  update public.establishments set platform_archived_at = null where id = p_establishment_id;
  perform set_config('cuotly.platform_change', 'off', true);

  perform public.set_establishment_status_internal(p_establishment_id, v_previous, btrim(p_reason));
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.restored_by_platform', 'establishment', p_establishment_id,
          jsonb_build_object('status', 'archived'), jsonb_build_object('status', v_previous), btrim(p_reason));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, auth.uid(), 'platform.establishment_restored', 'establishment', p_establishment_id,
          jsonb_build_object('space_id', v_space_id, 'status', v_previous), btrim(p_reason));
  return true;
end;
$$;

revoke all on function public.platform_restore_establishment(uuid, text) from public, anon;
grant execute on function public.platform_restore_establishment(uuid, text) to authenticated;

-- El listado del panel: todos los restaurantes de todos los espacios.
create or replace function public.platform_list_establishments()
returns table (
  id uuid,
  name text,
  code text,
  status text,
  platform_archived_at timestamptz,
  space_id uuid,
  space_name text,
  space_slug text,
  space_status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select e.id, e.name, e.code, e.status, e.platform_archived_at,
           s.id, s.name, s.slug, s.cuotly_status, e.created_at
    from public.establishments e
    join public.spaces s on s.id = e.space_id
    order by s.name, e.name;
end;
$$;

revoke all on function public.platform_list_establishments() from public, anon;
grant execute on function public.platform_list_establishments() to authenticated;

-- ============================================================
-- 5 · Cuentas (RN-ADM-18, RN-ADM-19, RN-ADM-20)
-- ============================================================

-- Lo que el panel enseña antes de confirmar: qué espacios necesitan un
-- nuevo propietario y entre quién se puede elegir (RN-ADM-19).
create or replace function public.platform_account_deletion_preview(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
  v_spaces jsonb;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Cuotly o un Administrador de Cuotly con permiso para eliminar elimina una cuenta (RN-ADM-14)';
  end if;

  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    raise exception 'Esa cuenta no existe';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'space_id', s.id,
           'space_name', s.name,
           'candidates', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'user_id', c.user_id,
                      'name', coalesce(nullif(btrim(p.full_name), ''), p.email),
                      'role', c.role)
                    order by case c.role when 'admin' then 0 else 1 end,
                             coalesce(nullif(btrim(p.full_name), ''), p.email)), '[]'::jsonb)
             from public.space_memberships c
             join public.profiles p on p.id = c.user_id
             where c.space_id = s.id and c.status = 'active' and c.user_id <> p_user_id
               -- RN-ADM-19 · los administradores; los trabajadores, solo
               -- si no hay ninguno.
               and (c.role = 'admin'
                    or (c.role = 'worker' and not exists (
                          select 1 from public.space_memberships a
                          where a.space_id = s.id and a.status = 'active' and a.role = 'admin'
                            and a.user_id <> p_user_id))))
         ) order by s.name), '[]'::jsonb)
  into v_spaces
  from public.space_memberships sm
  join public.spaces s on s.id = sm.space_id
  where sm.user_id = p_user_id and sm.status = 'active' and sm.role = 'owner'
    and not exists (
      select 1 from public.space_memberships o
      where o.space_id = sm.space_id and o.role = 'owner' and o.status = 'active'
        and o.user_id <> p_user_id);

  return jsonb_build_object(
    'email', v_email,
    'protected', lower(v_email) = lower('info@restavor.com')
                 or exists (select 1 from public.platform_roles pr where pr.user_id = p_user_id),
    'closed', exists (select 1 from public.platform_account_closures c
                      where c.user_id = p_user_id and c.restored_at is null),
    'sole_owner_spaces', v_spaces,
    'team_memberships', (select count(*) from public.space_memberships sm
                         where sm.user_id = p_user_id and sm.status in ('active', 'temporarily_absent')),
    'client_accesses', (select count(*) from public.establishment_memberships em
                        where em.user_id = p_user_id and em.revoked_at is null)
                     + (select count(*) from public.group_memberships gm
                        where gm.user_id = p_user_id and gm.revoked_at is null)
  );
end;
$$;

revoke all on function public.platform_account_deletion_preview(uuid) from public, anon;
grant execute on function public.platform_account_deletion_preview(uuid) to authenticated;

create or replace function public.platform_delete_account(
  p_user_id uuid,
  p_reason text,
  p_successors jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_existing public.platform_account_closures;
  v_sm record;
  v_successor uuid;
  v_how text;
  v_requested text;
  v_memberships jsonb := '[]'::jsonb;
  v_transfers jsonb := '[]'::jsonb;
  v_archived jsonb := '[]'::jsonb;
  v_establishment_ids jsonb;
  v_group_ids jsonb;
  v_details jsonb;
  v_op_id uuid;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Cuotly o un Administrador de Cuotly con permiso para eliminar elimina una cuenta (RN-ADM-14)';
  end if;

  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    raise exception 'Esa cuenta no existe';
  end if;

  -- RN-ADM-20 · la plataforma no se elimina a sí misma.
  if lower(v_email) = lower('info@restavor.com') then
    raise exception 'La cuenta del propietario de Cuotly no se elimina (RN-ADM-20)';
  end if;
  if exists (select 1 from public.platform_roles pr where pr.user_id = p_user_id) then
    raise exception 'Es Administrador de Cuotly: el propietario de Cuotly le retira antes el rol (RN-ADM-03, RN-ADM-20)';
  end if;

  -- CA-17 · antes que el motivo: el segundo clic no es un error.
  select * into v_existing from public.platform_account_closures
  where user_id = p_user_id and restored_at is null;
  if v_existing.id is not null then
    return v_existing.details || jsonb_build_object('already_closed', true);
  end if;

  if v_reason = '' then
    raise exception 'Eliminar una cuenta exige motivo (§140, RN-ADM-15)';
  end if;

  -- Los espacios archivados son de solo lectura para las personas; esto
  -- es la plataforma cerrando una cuenta (RN-ADM-16).
  perform set_config('cuotly.space_status_change', 'on', true);
  perform set_config('cuotly.membership_end_reason', v_reason, true);

  -- RN-ADM-19 · de cada espacio del que es la única propietaria, la
  -- propiedad pasa a quien se eligió o, si no, a un administrador al azar
  -- y, si no hay, a un trabajador al azar.
  for v_sm in
    select sm.space_id
    from public.space_memberships sm
    where sm.user_id = p_user_id and sm.status = 'active' and sm.role = 'owner'
      and not exists (
        select 1 from public.space_memberships o
        where o.space_id = sm.space_id and o.role = 'owner' and o.status = 'active'
          and o.user_id <> p_user_id)
    order by sm.space_id
    for update
  loop
    v_successor := null;
    v_requested := p_successors ->> v_sm.space_id::text;

    if v_requested is not null and v_requested <> '' then
      -- Se elige entre los administradores; entre los trabajadores, solo
      -- si el espacio no tiene ningún administrador (RN-ADM-19).
      select c.user_id into v_successor
      from public.space_memberships c
      where c.space_id = v_sm.space_id and c.user_id = v_requested::uuid
        and c.status = 'active' and c.user_id <> p_user_id
        and (c.role = 'admin'
             or (c.role = 'worker' and not exists (
                   select 1 from public.space_memberships a
                   where a.space_id = v_sm.space_id and a.status = 'active' and a.role = 'admin'
                     and a.user_id <> p_user_id)));
      if v_successor is null then
        raise exception 'El espacio pasa a un administrador de su equipo en activo, y a un trabajador solo si no hay ningún administrador (RN-ADM-19)';
      end if;
      v_how := 'selected';
    else
      select c.user_id into v_successor
      from public.space_memberships c
      where c.space_id = v_sm.space_id and c.status = 'active' and c.role = 'admin'
        and c.user_id <> p_user_id
      order by random() limit 1;
      v_how := 'random_admin';

      if v_successor is null then
        select c.user_id into v_successor
        from public.space_memberships c
        where c.space_id = v_sm.space_id and c.status = 'active' and c.role = 'worker'
          and c.user_id <> p_user_id
        order by random() limit 1;
        v_how := 'random_worker';
      end if;
    end if;

    if v_successor is null then
      -- Nadie más en el equipo: no hay a quién pasar el espacio. Se
      -- elimina con la cuenta y la pertenencia se queda como estaba, para
      -- que al recuperarla vuelva entero (RN-ADM-19).
      perform public.platform_set_space_archived_internal(v_sm.space_id, true, v_reason);
      v_archived := v_archived || to_jsonb(v_sm.space_id::text);
      continue;
    end if;

    update public.space_memberships set role = 'owner'
    where space_id = v_sm.space_id and user_id = v_successor;

    insert into public.space_lifecycle_operations
      (space_id, kind, actor_id, from_owner_id, to_owner_id, reason)
    values (v_sm.space_id, 'ownership_transferred', v_actor, p_user_id, v_successor, v_reason)
    returning id into v_op_id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
    values (v_sm.space_id, v_actor, 'space.ownership_transferred', 'space', v_sm.space_id,
            jsonb_build_object('owner_id', p_user_id),
            jsonb_build_object('owner_id', v_successor, 'cause', 'account_deleted', 'chosen', v_how),
            v_reason);

    perform public.notify_space_lifecycle_event(
      v_sm.space_id, 'space_ownership_transferred',
      'space_ownership_transferred:' || v_op_id::text);

    v_transfers := v_transfers || jsonb_build_object(
      'space_id', v_sm.space_id, 'to_user_id', v_successor, 'how', v_how);
  end loop;

  -- RN-ADM-18 · sale de todos los equipos, con las consecuencias de la 139.
  for v_sm in
    select sm.space_id, sm.role, sm.status
    from public.space_memberships sm
    where sm.user_id = p_user_id and sm.status in ('active', 'temporarily_absent', 'invited')
      and not (v_archived ? sm.space_id::text)
    order by sm.space_id
    for update
  loop
    update public.space_memberships set status = 'access_revoked'
    where space_id = v_sm.space_id and user_id = p_user_id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
    values (v_sm.space_id, v_actor, 'membership.access_revoked', 'space_membership', p_user_id,
            jsonb_build_object('status', v_sm.status, 'role', v_sm.role),
            jsonb_build_object('status', 'access_revoked', 'role', v_sm.role, 'cause', 'account_deleted'),
            v_reason);

    v_memberships := v_memberships || jsonb_build_object(
      'space_id', v_sm.space_id, 'role', v_sm.role, 'status', v_sm.status);
  end loop;

  -- RN-ADM-18 · y de todos los restaurantes y grupos a los que tenía acceso.
  with r as (
    update public.establishment_memberships
    set revoked_at = now(), revoked_by = v_actor
    where user_id = p_user_id and revoked_at is null
    returning id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_establishment_ids from r;

  with r as (
    update public.group_memberships
    set revoked_at = now(), revoked_by = v_actor
    where user_id = p_user_id and revoked_at is null
    returning id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_group_ids from r;

  update public.push_devices
  set revoked_at = now(), revoked_reason = 'account_deleted'
  where user_id = p_user_id and revoked_at is null;

  perform set_config('cuotly.membership_end_reason', '', true);
  perform set_config('cuotly.space_status_change', 'off', true);

  -- RN-ADM-18 · no vuelve a entrar, y lo que tenía abierto se cierra.
  update auth.users set banned_until = now() + interval '100 years' where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;

  v_details := jsonb_build_object(
    'memberships', v_memberships,
    'transfers', v_transfers,
    'archived_spaces', v_archived,
    'establishment_memberships', v_establishment_ids,
    'group_memberships', v_group_ids);

  insert into public.platform_account_closures (user_id, actor_id, reason, details)
  values (p_user_id, v_actor, v_reason, v_details);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, v_actor, 'platform.account_deleted', 'profile', p_user_id, v_details, v_reason);

  return v_details || jsonb_build_object('already_closed', false);
end;
$$;

comment on function public.platform_delete_account(uuid, text, jsonb) is
  'RN-ADM-18/19/20 · Cuotly elimina una cuenta: no vuelve a entrar, sale de
   todos los equipos (con las consecuencias de la 139) y de todos los
   restaurantes, y los espacios de los que era única propietaria pasan a
   otra persona de su equipo —o, sin nadie, se eliminan con ella—. No borra
   nada; lo que quita queda en `platform_account_closures`.';

revoke all on function public.platform_delete_account(uuid, text, jsonb) from public, anon;
grant execute on function public.platform_delete_account(uuid, text, jsonb) to authenticated;

create or replace function public.platform_restore_account(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_closure public.platform_account_closures;
  v_item jsonb;
  v_role text;
  v_space text;
  v_skipped jsonb := '[]'::jsonb;
  v_restored integer := 0;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Cuotly o un Administrador de Cuotly con permiso para eliminar recupera una cuenta (RN-ADM-14)';
  end if;

  select * into v_closure from public.platform_account_closures
  where user_id = p_user_id and restored_at is null
  for update;
  if v_closure.id is null then
    return jsonb_build_object('already_restored', true, 'restored', 0, 'skipped', '[]'::jsonb);
  end if;

  if v_reason = '' then
    raise exception 'Recuperar una cuenta exige motivo (§140, RN-ADM-15)';
  end if;

  perform set_config('cuotly.space_status_change', 'on', true);

  -- Los espacios que se eliminaron con ella, de vuelta.
  for v_space in select jsonb_array_elements_text(v_closure.details -> 'archived_spaces') loop
    perform public.platform_set_space_archived_internal(v_space::uuid, false, v_reason);
  end loop;

  -- De vuelta a sus equipos. Donde era propietaria y la propiedad pasó a
  -- otra persona, vuelve como administradora: el espacio ya tiene dueño.
  -- Lo que no se puede devolver —el plan del espacio ya no admite más
  -- usuarios— se salta y se dice.
  for v_item in select * from jsonb_array_elements(v_closure.details -> 'memberships') loop
    v_role := v_item ->> 'role';
    if v_role = 'owner' and exists (
         select 1 from jsonb_array_elements(v_closure.details -> 'transfers') t
         where t ->> 'space_id' = v_item ->> 'space_id') then
      v_role := 'admin';
    end if;

    begin
      update public.space_memberships
      set status = (v_item ->> 'status')::public.member_status,
          role = v_role::public.space_role
      where space_id = (v_item ->> 'space_id')::uuid and user_id = p_user_id
        and status = 'access_revoked';
      if found then
        v_restored := v_restored + 1;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('space_id', v_item ->> 'space_id', 'error', sqlerrm);
    end;
  end loop;

  for v_item in select * from jsonb_array_elements(v_closure.details -> 'establishment_memberships') loop
    begin
      update public.establishment_memberships set revoked_at = null, revoked_by = null
      where id = (v_item #>> '{}')::uuid and revoked_at is not null;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('establishment_membership_id', v_item #>> '{}', 'error', sqlerrm);
    end;
  end loop;

  for v_item in select * from jsonb_array_elements(v_closure.details -> 'group_memberships') loop
    begin
      update public.group_memberships set revoked_at = null, revoked_by = null
      where id = (v_item #>> '{}')::uuid and revoked_at is not null;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('group_membership_id', v_item #>> '{}', 'error', sqlerrm);
    end;
  end loop;

  perform set_config('cuotly.space_status_change', 'off', true);

  update auth.users set banned_until = null where id = p_user_id;

  update public.platform_account_closures
  set restored_at = now(), restored_by = v_actor, restore_reason = v_reason
  where id = v_closure.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, v_actor, 'platform.account_restored', 'profile', p_user_id,
          jsonb_build_object('restored_memberships', v_restored, 'skipped', v_skipped), v_reason);

  return jsonb_build_object('already_restored', false, 'restored', v_restored, 'skipped', v_skipped);
end;
$$;

comment on function public.platform_restore_account(uuid, text) is
  'RN-ADM-18 · Cuotly recupera una cuenta eliminada: vuelve a entrar, vuelve
   a sus equipos (como administradora donde su propiedad pasó a otra
   persona) y a sus restaurantes, y sus espacios eliminados con ella
   vuelven. Los restaurantes autorizados y las especialidades no vuelven
   (RN-MIE-07).';

revoke all on function public.platform_restore_account(uuid, text) from public, anon;
grant execute on function public.platform_restore_account(uuid, text) to authenticated;

-- El listado de usuarios del panel, con el permiso nuevo y si la cuenta
-- está eliminada. Cambia lo que devuelve: se retira y se crea.
drop function public.platform_list_users(integer, integer);

create or replace function public.platform_list_users(p_limit integer default 200, p_offset integer default 0)
returns table (
  id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  spaces_count integer,
  is_owner boolean,
  is_admin boolean,
  can_approve_spaces boolean,
  can_manage_subscriptions boolean,
  can_support boolean,
  can_delete_accounts boolean,
  two_factor_enrolled boolean,
  closed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select p.id, p.email, p.full_name, p.created_at,
      (select count(*)::integer from public.space_memberships sm where sm.user_id = p.id and sm.status = 'active'),
      lower(p.email) = lower('info@restavor.com'),
      pr.user_id is not null,
      coalesce(pr.can_approve_spaces, false),
      coalesce(pr.can_manage_subscriptions, false),
      coalesce(pr.can_support, false),
      coalesce(pr.can_delete_accounts, false),
      exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
      (select c.closed_at from public.platform_account_closures c
        where c.user_id = p.id and c.restored_at is null)
    from public.profiles p
    left join public.platform_roles pr on pr.user_id = p.id
    order by p.created_at desc
    limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.platform_list_users(integer, integer) from public, anon;
grant execute on function public.platform_list_users(integer, integer) to authenticated;
