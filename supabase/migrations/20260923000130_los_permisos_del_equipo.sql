-- M70 y M71 · Equipo: los permisos de cada persona y las invitaciones.
--
-- Hasta hoy, a qué restaurantes está autorizado un trabajador
-- (`worker_establishments`, RN-ASG-01) y con qué especialidades
-- (`worker_specialties`, §4.6) solo se podía cambiar escribiendo en la
-- tabla: la política deja a quien tiene `assign_jobs`, pero **nada quedaba
-- en la auditoría**. Y CLAUDE.md es explícito: todo cambio de estado
-- relevante deja actor, fecha, valor anterior y valor nuevo. Con las
-- invitaciones pasaba lo mismo: cancelar una era un `update` suelto.
--
-- Tres funciones, las únicas que usa la pantalla:
--
--   · `set_worker_establishments()` y `set_worker_specialties()` reciben
--     **el conjunto entero** que tiene que quedar. Lo que sobra se retira
--     (`revoked_at`, nunca se borra: RN-EST-05 y CLAUDE.md) y lo que falta
--     se añade. Enviar dos veces el mismo conjunto no cambia nada y no
--     audita nada: un apunte que no cambió nada sería una auditoría que
--     miente. Así el doble clic es inocuo sin necesidad de clave.
--   · `cancel_space_invitation()` cancela una invitación **pendiente**,
--     con el mismo permiso que invitar (`invite_member`), y lo audita.
--
-- Quién puede: lo mismo que ya decía la política de cada tabla
-- (`assign_jobs` para los permisos, `invite_member` para las
-- invitaciones). No se amplía ni se estrecha nada; se hace auditable.
--
-- Se comprueba con `supabase/tests/los_permisos_del_equipo.sql`.

create or replace function public.set_worker_establishments(
  p_space_id uuid,
  p_user_id uuid,
  p_establishment_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_establishment_ids, '{}');
  v_before uuid[];
  v_after uuid[];
begin
  if not public.has_capability(p_space_id, 'assign_jobs') then
    raise exception 'Solo quien asigna trabajos puede cambiar a qué restaurantes está autorizada una persona';
  end if;

  if not exists (
    select 1 from public.space_memberships
    where space_id = p_space_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'Esa persona no pertenece a este espacio';
  end if;

  -- Todos los restaurantes, de ESTE espacio: un identificador de otro
  -- espacio colaría una autorización ajena.
  if exists (
    select 1 from unnest(v_ids) as x(id)
    where not exists (select 1 from public.establishments e where e.id = x.id and e.space_id = p_space_id)
  ) then
    raise exception 'Alguno de esos restaurantes no es de este espacio';
  end if;

  select coalesce(array_agg(establishment_id order by establishment_id), '{}') into v_before
  from public.worker_establishments
  where space_id = p_space_id and user_id = p_user_id and revoked_at is null;

  update public.worker_establishments
  set revoked_at = now(), revoked_by = auth.uid()
  where space_id = p_space_id and user_id = p_user_id and revoked_at is null
    and not (establishment_id = any (v_ids));

  insert into public.worker_establishments (space_id, user_id, establishment_id, created_by)
  select p_space_id, p_user_id, x.id, auth.uid()
  from (select distinct unnest(v_ids) as id) x
  where not exists (
    select 1 from public.worker_establishments w
    where w.space_id = p_space_id and w.user_id = p_user_id and w.establishment_id = x.id and w.revoked_at is null
  );

  select coalesce(array_agg(establishment_id order by establishment_id), '{}') into v_after
  from public.worker_establishments
  where space_id = p_space_id and user_id = p_user_id and revoked_at is null;

  if v_before is distinct from v_after then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (
      p_space_id, auth.uid(), 'membership.establishments_changed', 'space_membership', p_user_id,
      jsonb_build_object('establishment_ids', to_jsonb(v_before)),
      jsonb_build_object('establishment_ids', to_jsonb(v_after))
    );
  end if;
end;
$$;

revoke all on function public.set_worker_establishments(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_worker_establishments(uuid, uuid, uuid[]) to authenticated;

create or replace function public.set_worker_specialties(
  p_space_id uuid,
  p_user_id uuid,
  p_specialties text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items text[] := coalesce(p_specialties, '{}');
  v_before text[];
  v_after text[];
begin
  if not public.has_capability(p_space_id, 'assign_jobs') then
    raise exception 'Solo quien asigna trabajos puede cambiar las especialidades de una persona';
  end if;

  if not exists (
    select 1 from public.space_memberships
    where space_id = p_space_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'Esa persona no pertenece a este espacio';
  end if;

  -- §4.6 · las siete, las mismas que el CHECK de la tabla. Se dice antes
  -- de tocar nada, con un mensaje que se entiende.
  if exists (
    select 1 from unnest(v_items) as x(s)
    where x.s not in ('web', 'design', 'copy', 'seo', 'daily_menu', 'analytics', 'general')
  ) then
    raise exception 'Esa especialidad no existe';
  end if;

  select coalesce(array_agg(specialty order by specialty), '{}') into v_before
  from public.worker_specialties
  where space_id = p_space_id and user_id = p_user_id and revoked_at is null;

  update public.worker_specialties
  set revoked_at = now(), revoked_by = auth.uid()
  where space_id = p_space_id and user_id = p_user_id and revoked_at is null
    and not (specialty = any (v_items));

  insert into public.worker_specialties (space_id, user_id, specialty, created_by)
  select p_space_id, p_user_id, x.s, auth.uid()
  from (select distinct unnest(v_items) as s) x
  where not exists (
    select 1 from public.worker_specialties w
    where w.space_id = p_space_id and w.user_id = p_user_id and w.specialty = x.s and w.revoked_at is null
  );

  select coalesce(array_agg(specialty order by specialty), '{}') into v_after
  from public.worker_specialties
  where space_id = p_space_id and user_id = p_user_id and revoked_at is null;

  if v_before is distinct from v_after then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (
      p_space_id, auth.uid(), 'membership.specialties_changed', 'space_membership', p_user_id,
      jsonb_build_object('specialties', to_jsonb(v_before)),
      jsonb_build_object('specialties', to_jsonb(v_after))
    );
  end if;
end;
$$;

revoke all on function public.set_worker_specialties(uuid, uuid, text[]) from public, anon;
grant execute on function public.set_worker_specialties(uuid, uuid, text[]) to authenticated;

create or replace function public.cancel_space_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_status text;
  v_email text;
begin
  select space_id, status, email into v_space_id, v_status, v_email
  from public.space_invitations where id = p_invitation_id
  for update;

  if v_space_id is null then
    raise exception 'Invitación no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'invite_member') then
    raise exception 'Solo quien puede invitar puede cancelar una invitación';
  end if;

  -- Cancelar una ya cancelada es el doble clic: no hace nada.
  if v_status = 'cancelled' then
    return;
  end if;

  if v_status <> 'pending' then
    raise exception 'Solo se cancela una invitación pendiente';
  end if;

  update public.space_invitations set status = 'cancelled' where id = p_invitation_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'invitation.cancelled', 'space_invitation', p_invitation_id,
    jsonb_build_object('status', v_status, 'email', v_email),
    jsonb_build_object('status', 'cancelled')
  );
end;
$$;

revoke all on function public.cancel_space_invitation(uuid) from public, anon;
grant execute on function public.cancel_space_invitation(uuid) to authenticated;
