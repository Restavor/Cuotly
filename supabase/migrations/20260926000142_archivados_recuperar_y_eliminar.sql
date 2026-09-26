-- Archivados: recuperar de un clic y eliminar definitivamente (decisión
-- 82, 26/09/2026; PRD §32, RN-ADM-22 a RN-ADM-25).
--
-- Bosco: *"que haya una parte de archivados y ahí puedas ver los espacios
-- y restaurantes y todo lo que esté archivado. Así separamos lo que está
-- activo con lo que está archivado. Y dentro de la parte de archivados
-- habrá dos botones: uno que es recuperar, que nada más darle se activa de
-- nuevo, y otro que es eliminar, que necesitarías confirmar antes"*.
-- Preguntado, decide:
--   (1) lo que la 140 llamaba "eliminar" se llama ahora **archivar**; el
--       "eliminar" de Archivados es un **eliminado definitivo**: deja de
--       salir en el panel y ya no se recupera, pero **no se borra nada**
--       (CLAUDE.md, RN-DAT-06: los datos siguen en la base).
--   (2) recuperar es **un clic**: el motivo que exigía RN-ADM-15 es fijo,
--       "Recuperado desde Archivados", y queda en la auditoría con el
--       actor y la fecha.
--   (3) en Archivados está **todo lo archivado a mano**: lo que archivó
--       Cuotly, el espacio que archivó su propietario y el restaurante
--       que archivó su equipo. Lo que se archiva solo —prueba sin pago,
--       impago— sigue en la lista de activos, que enseña siempre el estado.
--
-- Recuperar "activa de nuevo" (RN-ADM-23): un restaurante vuelve a
-- `active` aunque su equipo lo tuviera archivado antes de que Cuotly lo
-- archivara —cambia RN-ADM-17, que lo dejaba archivado—, y un espacio
-- vuelve al modo que tenía, deshaciendo también el archivado de su
-- propietario si lo había. Si hay deuda vencida (RN-FIN-13) o el plan de
-- Cuotly no admite más restaurantes activos, las guardas de siempre lo
-- dicen y no se recupera.
--
-- Se comprueba con `supabase/tests/archivados_recuperar_y_eliminar.sql`.

-- ============================================================
-- 1 · La marca del eliminado definitivo (RN-ADM-24)
-- ============================================================
alter table public.spaces add column permanently_deleted_at timestamptz;
alter table public.establishments add column permanently_deleted_at timestamptz;

comment on column public.spaces.permanently_deleted_at is
  'RN-ADM-24 · cuándo lo eliminó Cuotly definitivamente desde Archivados.
   Con fecha, el espacio se queda en `archived_by_platform` para siempre y
   no sale en el panel. No se borra nada. Quién fue está en la auditoría.';
comment on column public.establishments.permanently_deleted_at is
  'RN-ADM-24 · cuándo lo eliminó Cuotly definitivamente desde Archivados.
   Con fecha, el restaurante se queda archivado y marcado para siempre y
   no sale en el panel ni en los archivados de su espacio. No se borra
   nada. Quién fue está en la auditoría.';

-- La marca solo la pone una función de plataforma, y una vez puesta no
-- se quita ni se mueve nada de lo que la sostiene, venga el cambio de
-- donde venga: una función vieja, un barrido o un `update` por PostgREST.
create or replace function public.guard_space_permanently_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.permanently_deleted_at is distinct from old.permanently_deleted_at
     and (old.permanently_deleted_at is not null
          or coalesce(current_setting('cuotly.platform_change', true), '') <> 'on') then
    raise exception 'Solo Cuotly elimina definitivamente un espacio, y eso no se deshace (RN-ADM-24)';
  end if;

  if old.permanently_deleted_at is not null
     and new.cuotly_status is distinct from old.cuotly_status then
    raise exception 'Este espacio lo eliminó Cuotly definitivamente: ya no se recupera (RN-ADM-24)';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_space_permanently_deleted() from public, anon, authenticated;

create trigger spaces_guard_permanently_deleted
  before update on public.spaces
  for each row execute function public.guard_space_permanently_deleted();

create or replace function public.guard_establishment_permanently_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.permanently_deleted_at is distinct from old.permanently_deleted_at
     and (old.permanently_deleted_at is not null
          or coalesce(current_setting('cuotly.platform_change', true), '') <> 'on') then
    raise exception 'Solo Cuotly elimina definitivamente un restaurante, y eso no se deshace (RN-ADM-24)';
  end if;

  if old.permanently_deleted_at is not null
     and (new.status is distinct from old.status
          or new.platform_archived_at is distinct from old.platform_archived_at) then
    raise exception 'Este restaurante lo eliminó Cuotly definitivamente: ya no se recupera (RN-ADM-24)';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_establishment_permanently_deleted() from public, anon, authenticated;

create trigger establishments_guard_permanently_deleted
  before update on public.establishments
  for each row execute function public.guard_establishment_permanently_deleted();

-- ============================================================
-- 2 · Lo de la 140 que tiene que saber de la marca
-- ============================================================

-- Igual que en la 140, con una línea más: un espacio eliminado
-- definitivamente no se archiva ni se recupera, tampoco al recuperar la
-- cuenta con la que se eliminó (`platform_restore_account()` lo salta en
-- vez de fallar entera).
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
  v_gone timestamptz;
  v_now timestamptz := now();
  v_switch text := coalesce(current_setting('cuotly.space_status_change', true), '');
begin
  select cuotly_status, permanently_deleted_at into v_current, v_gone
  from public.spaces where id = p_space_id for update;
  if not found then
    raise exception 'Espacio no encontrado';
  end if;

  if v_gone is not null then
    return false; -- RN-ADM-24.
  end if;

  if p_archive then
    if v_current is not distinct from 'archived_by_platform' then
      return false; -- CA-17.
    end if;
    v_target := 'archived_by_platform';
  else
    if v_current is distinct from 'archived_by_platform' then
      return false; -- CA-17: no estaba archivado por Cuotly.
    end if;
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

-- Igual que en la 92, con una diferencia: quien tiene el permiso de
-- archivar y recuperar (RN-ADM-14) también restaura el archivado de un
-- propietario, porque Archivados lo enseña y lo recupera (RN-ADM-23).
create or replace function public.restore_space_by_owner(
  p_space_id uuid,
  p_reason text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_current text;
  v_deadline timestamptz;
  v_previous text;
  v_platform boolean := public.is_platform_owner()
                        or public.is_platform_subscription_manager()
                        or public.is_platform_account_manager();
  v_op_id uuid;
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión para restaurar un espacio';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing
    from public.space_lifecycle_operations
    where space_id = p_space_id and idempotency_key = p_idempotency_key
      and actor_id = v_actor;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  select cuotly_status, cuotly_reactivation_deadline_at
  into v_current, v_deadline
  from public.spaces where id = p_space_id for update;

  if v_current is distinct from 'archived_by_owner' then
    raise exception 'Este espacio no lo archivó su propietario: si está archivado por prueba o impago, se reactiva pagando (§4.6, RN-SUB-09)';
  end if;

  if not v_platform then
    if public.support_access_level(p_space_id) is not null then
      raise exception 'Modo soporte no restaura un espacio (§129, RN-ADM-07, RN-CIC-08)';
    end if;
    if not public.has_capability(p_space_id, 'manage_space') then
      raise exception 'Solo el propietario restaura su espacio dentro de los 30 días (§127, RN-CIC-08)';
    end if;
    if v_deadline is not null and now() > v_deadline then
      raise exception 'Pasados los 30 días, restaurar este espacio es de la plataforma (RN-CIC-08, como RN-SUB-09)';
    end if;
  end if;

  -- Al modo que tenía antes de que lo archivara su propietario. El paso
  -- de `archived_by_platform` a `archived_by_owner` es Cuotly devolviéndolo
  -- a donde estaba, no el propietario archivándolo: se salta, o el espacio
  -- volvería al archivado de Cuotly del que acaba de salir.
  select se.from_state into v_previous
  from public.state_events se
  where se.space_id = p_space_id and se.entity_type = 'space'
    and se.to_state = 'archived_by_owner'
    and se.from_state is distinct from 'archived_by_platform'
  order by se.occurred_at desc, se.id desc
  limit 1;

  perform set_config('cuotly.space_status_change', 'on', true);
  update public.spaces
  set cuotly_status = coalesce(v_previous, 'active'),
      cuotly_status_changed_at = now(),
      cuotly_archived_at = null,
      cuotly_reactivation_deadline_at = null,
      cuotly_deletion_scheduled_at = null
  where id = p_space_id;
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.space_lifecycle_operations
    (space_id, kind, actor_id, reason, idempotency_key)
  values (p_space_id, 'restored', v_actor, p_reason, p_idempotency_key)
  returning id into v_op_id;

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (p_space_id, 'space', p_space_id, 'archived_by_owner', coalesce(v_previous, 'active'),
          v_actor, p_reason, case when v_platform then 'platform_restore' else 'owner_request' end);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, v_actor, 'space.restored_by_owner', 'space', p_space_id,
          jsonb_build_object('cuotly_status', 'archived_by_owner'),
          jsonb_build_object('cuotly_status', coalesce(v_previous, 'active'),
                             'by_platform', v_platform),
          p_reason);

  return v_op_id;
end;
$$;

-- ============================================================
-- 3 · Lo que enseña el panel (RN-ADM-22, RN-ADM-25)
-- ============================================================

-- Cambia lo que devuelve: dos columnas más, así que se rehace. Los
-- eliminados definitivamente ya no salen, y cada restaurante dice si tiene
-- deuda vencida, que es lo que distingue "pausado" de "pausado por impago"
-- (RN-FIN-13).
drop function public.platform_list_establishments();

create function public.platform_list_establishments()
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
  created_at timestamptz,
  has_overdue_debt boolean
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
           s.id, s.name, s.slug, s.cuotly_status, e.created_at,
           public.establishment_has_overdue_debt_internal(e.id)
    from public.establishments e
    join public.spaces s on s.id = e.space_id
    where e.permanently_deleted_at is null
    order by s.name, e.name;
end;
$$;

revoke all on function public.platform_list_establishments() from public, anon;
grant execute on function public.platform_list_establishments() to authenticated;

-- Archivados: lo archivado a mano, sin lo eliminado definitivamente.
-- Quién lo archivó, cuándo y por qué salen del libro de estados y de la
-- auditoría; el nombre de la persona no, que el panel ya tiene la
-- auditoría para eso.
create or replace function public.platform_list_archived()
returns table (
  kind text,
  id uuid,
  name text,
  code text,
  space_id uuid,
  space_name text,
  space_slug text,
  space_status text,
  archived_by text,
  archived_at timestamptz,
  reason text
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
    select 'space'::text, s.id, s.name, null::text, s.id, s.name, s.slug, s.cuotly_status,
           case s.cuotly_status when 'archived_by_platform' then 'platform' else 'owner' end,
           coalesce(ev.occurred_at, s.cuotly_archived_at, s.cuotly_status_changed_at),
           ev.reason
    from public.spaces s
    left join lateral (
      select se.occurred_at, se.reason
      from public.state_events se
      where se.entity_type = 'space' and se.entity_id = s.id and se.to_state = s.cuotly_status
      order by se.occurred_at desc
      limit 1
    ) ev on true
    where s.cuotly_status in ('archived_by_platform', 'archived_by_owner')
      and s.permanently_deleted_at is null
  union all
    select 'establishment'::text, e.id, e.name, e.code, s.id, s.name, s.slug, s.cuotly_status,
           case when e.platform_archived_at is not null then 'platform' else 'team' end,
           coalesce(e.platform_archived_at, ev.occurred_at),
           case when e.platform_archived_at is not null then pa.reason else ev.reason end
    from public.establishments e
    join public.spaces s on s.id = e.space_id
    left join lateral (
      select se.occurred_at, se.reason
      from public.state_events se
      where se.entity_type = 'establishment' and se.entity_id = e.id and se.to_state = 'archived'
      order by se.occurred_at desc
      limit 1
    ) ev on true
    left join lateral (
      select a.reason
      from public.audit_log a
      where a.action = 'establishment.archived_by_platform' and a.entity_id = e.id
      order by a.created_at desc
      limit 1
    ) pa on true
    where e.status = 'archived'
      and e.permanently_deleted_at is null
  order by 10 desc nulls last, 3;
end;
$$;

comment on function public.platform_list_archived() is
  'RN-ADM-22 · Archivados del panel: los espacios archivados por Cuotly o
   por su propietario y los restaurantes archivados por Cuotly o por su
   equipo, sin los eliminados definitivamente.';

revoke all on function public.platform_list_archived() from public, anon;
grant execute on function public.platform_list_archived() to authenticated;

-- ============================================================
-- 4 · Recuperar de un clic (RN-ADM-23)
-- ============================================================

create or replace function public.platform_recover_space(p_space_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason constant text := 'Recuperado desde Archivados';
  v_status text;
  v_gone timestamptz;
  v_done boolean := false;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Cuotly o un Administrador de Cuotly con permiso para eliminar recupera un espacio (RN-ADM-14)';
  end if;

  select cuotly_status, permanently_deleted_at into v_status, v_gone
  from public.spaces where id = p_space_id for update;
  if not found then
    raise exception 'Espacio no encontrado';
  end if;
  if v_gone is not null then
    raise exception 'Este espacio lo eliminó Cuotly definitivamente: ya no se recupera (RN-ADM-24)';
  end if;

  if v_status = 'archived_by_platform' then
    v_done := public.platform_set_space_archived_internal(p_space_id, false, v_reason);
    select cuotly_status into v_status from public.spaces where id = p_space_id;
  end if;

  -- Si antes de Cuotly lo había archivado su propietario, "se activa de
  -- nuevo" también deshace eso.
  if v_status = 'archived_by_owner' then
    perform public.restore_space_by_owner(p_space_id, v_reason, null);
    v_done := true;
  end if;

  if v_done then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
    values (null, auth.uid(), 'platform.space_restored', 'space', p_space_id,
            jsonb_build_object('space_id', p_space_id,
                               'cuotly_status', (select cuotly_status from public.spaces where id = p_space_id)),
            v_reason);
  end if;
  return v_done; -- CA-17: el segundo clic no encuentra nada archivado a mano.
end;
$$;

comment on function public.platform_recover_space(uuid) is
  'RN-ADM-23 · Recuperar desde Archivados, un clic: vuelve al modo que
   tenía, deshaciendo también el archivado de su propietario. El motivo es
   fijo. Pulsar dos veces no hace nada la segunda.';

revoke all on function public.platform_recover_space(uuid) from public, anon;
grant execute on function public.platform_recover_space(uuid) to authenticated;

create or replace function public.platform_recover_establishment(p_establishment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason constant text := 'Recuperado desde Archivados';
  v_space_id uuid;
  v_status text;
  v_flag timestamptz;
  v_gone timestamptz;
  v_target text;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Cuotly o un Administrador de Cuotly con permiso para eliminar recupera un restaurante (RN-ADM-14)';
  end if;

  select space_id, status, platform_archived_at, permanently_deleted_at
  into v_space_id, v_status, v_flag, v_gone
  from public.establishments where id = p_establishment_id for update;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if v_gone is not null then
    raise exception 'Este restaurante lo eliminó Cuotly definitivamente: ya no se recupera (RN-ADM-24)';
  end if;
  if v_flag is null and v_status <> 'archived' then
    return false; -- CA-17.
  end if;

  -- Al estado en que lo encontró Cuotly, salvo que fuera `archived`: se
  -- activa de nuevo (RN-ADM-23, cambia RN-ADM-17). Archivado por su
  -- equipo, también a `active`.
  if v_flag is not null then
    select a.old_value ->> 'status' into v_target
    from public.audit_log a
    where a.action = 'establishment.archived_by_platform' and a.entity_id = p_establishment_id
    order by a.created_at desc
    limit 1;
  end if;
  if v_target is null or v_target = 'archived' then
    v_target := 'active';
  end if;

  perform set_config('cuotly.space_status_change', 'on', true);
  if v_flag is not null then
    perform set_config('cuotly.platform_change', 'on', true);
    update public.establishments set platform_archived_at = null where id = p_establishment_id;
    perform set_config('cuotly.platform_change', 'off', true);
  end if;
  -- La deuda vencida (RN-FIN-13) y el límite del plan de Cuotly lo paran
  -- aquí mismo, con su mensaje, y no se recupera nada.
  perform public.set_establishment_status_internal(p_establishment_id, v_target, v_reason);
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.restored_by_platform', 'establishment', p_establishment_id,
          jsonb_build_object('status', 'archived', 'archived_by', case when v_flag is null then 'team' else 'platform' end),
          jsonb_build_object('status', v_target), v_reason);
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, auth.uid(), 'platform.establishment_restored', 'establishment', p_establishment_id,
          jsonb_build_object('space_id', v_space_id, 'status', v_target), v_reason);
  return true;
end;
$$;

comment on function public.platform_recover_establishment(uuid) is
  'RN-ADM-23 · Recuperar desde Archivados, un clic: lo archivara Cuotly o
   su equipo, vuelve a `active` (o al estado no archivado en que lo
   encontró Cuotly). Las guardas de deuda y de límite del plan siguen.';

revoke all on function public.platform_recover_establishment(uuid) from public, anon;
grant execute on function public.platform_recover_establishment(uuid) to authenticated;

-- ============================================================
-- 5 · Eliminar definitivamente (RN-ADM-24)
-- ============================================================

create or replace function public.platform_delete_space_permanently(p_space_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_gone timestamptz;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Cuotly o un Administrador de Cuotly con permiso para eliminar elimina un espacio (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Eliminar un espacio exige motivo (§140, RN-ADM-15)';
  end if;

  select cuotly_status, permanently_deleted_at into v_status, v_gone
  from public.spaces where id = p_space_id for update;
  if not found then
    raise exception 'Espacio no encontrado';
  end if;
  if v_gone is not null then
    return false; -- CA-17.
  end if;
  if v_status is null or v_status not in ('archived_by_platform', 'archived_by_owner') then
    raise exception 'Solo se elimina definitivamente lo que está en Archivados: archívalo antes (RN-ADM-24)';
  end if;

  -- El archivado de un propietario lo podría deshacer él: pasa antes a
  -- Cuotly, con su evento, para que la marca lo deje quieto.
  if v_status = 'archived_by_owner' then
    perform public.platform_set_space_archived_internal(p_space_id, true, btrim(p_reason));
  end if;

  -- La solo lectura del espacio archivado es para quien trabaja en él.
  perform set_config('cuotly.space_status_change', 'on', true);
  perform set_config('cuotly.platform_change', 'on', true);
  update public.spaces set permanently_deleted_at = now() where id = p_space_id;
  perform set_config('cuotly.platform_change', 'off', true);
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, auth.uid(), 'space.permanently_deleted_by_platform', 'space', p_space_id,
          jsonb_build_object('cuotly_status', v_status),
          jsonb_build_object('cuotly_status', 'archived_by_platform'),
          btrim(p_reason));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, auth.uid(), 'platform.space_permanently_deleted', 'space', p_space_id,
          jsonb_build_object('space_id', p_space_id), btrim(p_reason));
  return true;
end;
$$;

comment on function public.platform_delete_space_permanently(uuid, text) is
  'RN-ADM-24 · Eliminar desde Archivados: el espacio se queda en
   `archived_by_platform` para siempre y sale del panel. No borra nada.';

revoke all on function public.platform_delete_space_permanently(uuid, text) from public, anon;
grant execute on function public.platform_delete_space_permanently(uuid, text) to authenticated;

create or replace function public.platform_delete_establishment_permanently(p_establishment_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_status text;
  v_flag timestamptz;
  v_gone timestamptz;
begin
  if not public.is_platform_account_manager() then
    raise exception 'Solo el propietario de Cuotly o un Administrador de Cuotly con permiso para eliminar elimina un restaurante (RN-ADM-14)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Eliminar un restaurante exige motivo (§140, RN-ADM-15)';
  end if;

  select space_id, status, platform_archived_at, permanently_deleted_at
  into v_space_id, v_status, v_flag, v_gone
  from public.establishments where id = p_establishment_id for update;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if v_gone is not null then
    return false; -- CA-17.
  end if;
  if v_status <> 'archived' then
    raise exception 'Solo se elimina definitivamente lo que está en Archivados: archívalo antes (RN-ADM-24)';
  end if;

  -- Con la marca de Cuotly, el equipo tampoco lo reactiva (RN-ADM-17).
  perform set_config('cuotly.space_status_change', 'on', true);
  perform set_config('cuotly.platform_change', 'on', true);
  update public.establishments
  set platform_archived_at = coalesce(platform_archived_at, now()),
      permanently_deleted_at = now()
  where id = p_establishment_id;
  perform set_config('cuotly.platform_change', 'off', true);
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.permanently_deleted_by_platform', 'establishment', p_establishment_id,
          jsonb_build_object('archived_by', case when v_flag is null then 'team' else 'platform' end),
          jsonb_build_object('status', 'archived'), btrim(p_reason));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, auth.uid(), 'platform.establishment_permanently_deleted', 'establishment', p_establishment_id,
          jsonb_build_object('space_id', v_space_id), btrim(p_reason));
  return true;
end;
$$;

comment on function public.platform_delete_establishment_permanently(uuid, text) is
  'RN-ADM-24 · Eliminar desde Archivados: el restaurante se queda
   archivado y marcado para siempre, sale del panel y de los archivados de
   su espacio. No borra nada.';

revoke all on function public.platform_delete_establishment_permanently(uuid, text) from public, anon;
grant execute on function public.platform_delete_establishment_permanently(uuid, text) to authenticated;
