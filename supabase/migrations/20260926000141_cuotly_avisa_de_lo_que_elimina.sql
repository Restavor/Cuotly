-- Decisión 81, lo que Bosco confirmó el 26/09/2026 (PRD RN-ADM-18, 20 y 21).
--
-- Bosco, sobre las cinco propuestas de la 140: *"1. Sí. 2. Sí. 3. No,
-- vuelve como trabajador. 4. Correcto, y si quiero yo, info@restavor.com,
-- el propietario de Cuotly, le quito los permisos y le elimino. 5. Sí se
-- le avisa, le llega un mensaje diciendo: su cuenta ha sido eliminada."*
--
-- Tres cambios, y ninguno toca una migración ya escrita:
--   1. RN-ADM-18 · al recuperar una cuenta, donde su propiedad pasó a otra
--      persona vuelve como **trabajadora**, no como administradora.
--   2. RN-ADM-20 · Bosco puede eliminar a un Administrador de Cuotly: le
--      retira el rol y lo elimina en el mismo acto. Un administrador con el
--      permiso sigue sin poder eliminar a otro.
--   3. RN-ADM-21 · se avisa. A la cuenta eliminada, **por correo** —ya no
--      puede entrar a leer un aviso—: "Su cuenta ha sido eliminada". Al
--      equipo de un espacio eliminado y a quien lleva un restaurante
--      eliminado —su equipo y sus propietarios—, con un aviso obligatorio
--      (RN-NOT-03: es pérdida de acceso).
--
-- Se comprueba con `supabase/tests/cuotly_elimina_cuentas_espacios_y_restaurantes.sql`.

-- ============================================================
-- 1 · Los avisos nuevos (RN-ADM-21)
-- ============================================================
alter table public.notifications drop constraint notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
  check (event_type = any (array[
    'request_submitted', 'job_unassigned', 'job_assigned', 'job_started', 'job_published',
    'correction_requested', 'job_reassignment_requested', 'task_reassignment_requested',
    'terms_version_published', 'menu_publication_requested', 'menu_assigned',
    'menu_needs_information', 'menu_published', 'menu_publication_error',
    'menu_not_prepared_reminder', 'menu_publication_overdue', 'quote_sent', 'quote_accepted',
    'quote_rejected', 'integration_sync_failed', 'integration_reauthorization_required',
    'report_schedule_due_soon', 'report_sent', 'cuotly_payment_due_soon',
    'cuotly_payment_due_today', 'cuotly_payment_overdue_24h', 'cuotly_payment_overdue_48h',
    'cuotly_payment_final_notice', 'cuotly_space_archived', 'cuotly_space_reactivated',
    'support_session_started', 'space_ownership_transferred', 'space_archived_by_owner',
    'incident_opened', 'incident_updated', 'incident_replied', 'storage_threshold_80',
    'storage_threshold_100', 'security_incident', 'consumption_threshold_80',
    'consumption_threshold_100', 't2_threshold_50', 't2_threshold_80', 't2_threshold_100',
    't2_critical_alert', 't2_reassignment_suggestion', 't3_threshold_75', 't3_threshold_90',
    't3_threshold_100', 'establishment_paused_nonpayment', 'establishment_suspended_nonpayment',
    'establishment_reactivated', 'charge_due_today', 'absence_requested', 'absence_decided',
    'absence_uncovered_jobs', 'establishment_access_granted', 'panel_invitation_pending_review',
    'panel_invitation_decided', 'review_received', 'low_review_received',
    'plan_revision_published', 'request_created_on_behalf',
    'space_deleted_by_platform', 'establishment_deleted_by_platform'
  ]));

create or replace function public.notification_event_is_mandatory(p_event_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_event_type in (
    't2_threshold_100',
    't3_threshold_100',
    'establishment_paused_nonpayment',
    'establishment_suspended_nonpayment',
    'cuotly_payment_final_notice',
    'cuotly_space_archived',
    'support_session_started',
    'space_ownership_transferred',
    'space_archived_by_owner',
    'security_incident',
    'space_deleted_by_platform',
    'establishment_deleted_by_platform'
  );
$$;

-- El correo a la cuenta eliminada. Va por la cola de correos de la
-- plataforma (migración 97), la que escribe a direcciones sin sesión.
alter table public.platform_emails drop constraint platform_emails_kind_check;
alter table public.platform_emails add constraint platform_emails_kind_check
  check (kind in (
    'access_request_received',
    'access_request_needs_information',
    'access_request_approved',
    'access_request_rejected',
    'access_request_already_registered',
    'account_deleted'
  ));

-- Un restaurante eliminado: se entera quien lo lleva en el equipo
-- (propietario y administradores del espacio, como en el impago) y quien
-- responde por él (propietario local y propietario global del grupo, la
-- lista de `request_created_on_behalf`).
create or replace function public.notify_establishment_deleted_by_platform(p_establishment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_slug text;
  v_recipient uuid;
  v_key text := 'establishment_deleted_by_platform:' || p_establishment_id::text || ':'
                || to_char(now(), 'YYYYMMDDHH24MISS');
  v_sent integer := 0;
begin
  select e.space_id into v_space_id from public.establishments e where e.id = p_establishment_id;
  if v_space_id is null then
    return 0;
  end if;
  v_slug := public.space_slug(v_space_id);

  for v_recipient in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = v_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
  loop
    if public.emit_notification(
         v_space_id, v_recipient, 'establishment_deleted_by_platform', 'staff', 'establishment',
         p_establishment_id, '/espacios/' || v_slug || '/restaurantes/' || p_establishment_id::text,
         v_key, p_establishment_id) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  for v_recipient in
    select em.user_id from public.establishment_memberships em
    where em.establishment_id = p_establishment_id and em.revoked_at is null and em.role = 'local_owner'
    union
    select gm.user_id from public.group_memberships gm
    join public.establishments e on e.group_id = gm.group_id
    where e.id = p_establishment_id and gm.revoked_at is null and gm.role = 'global_owner'
  loop
    if public.emit_notification(
         v_space_id, v_recipient, 'establishment_deleted_by_platform', 'client', 'establishment',
         p_establishment_id, '/espacios/' || v_slug || '/restaurantes/' || p_establishment_id::text,
         v_key, p_establishment_id) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.notify_establishment_deleted_by_platform(uuid) from public, anon, authenticated;

-- ============================================================
-- 2 · Las funciones de la 140, con lo confirmado
-- ============================================================

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

    -- RN-ADM-21 · todo su equipo en activo se entera: pierde la escritura.
    perform public.notify_space_lifecycle_event(
      p_space_id, 'space_deleted_by_platform',
      'space_deleted_by_platform:' || p_space_id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS'));
  end if;
  return v_done;
end;
$$;

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

  perform public.notify_establishment_deleted_by_platform(p_establishment_id);
  return true;
end;
$$;

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
    -- RN-ADM-20 · Bosco no se elimina nunca; un Administrador de Cuotly,
    -- solo si quien elimina es Bosco, que le retira el rol en el mismo acto.
    'protected', lower(v_email) = lower('info@restavor.com')
                 or (exists (select 1 from public.platform_roles pr where pr.user_id = p_user_id)
                     and not public.is_platform_owner()),
    'platform_admin', exists (select 1 from public.platform_roles pr where pr.user_id = p_user_id),
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
  -- RN-ADM-20 · a un Administrador de Cuotly solo lo elimina Bosco, que le
  -- retira el rol en el mismo acto (más abajo, ya pasado el motivo).
  if exists (select 1 from public.platform_roles pr where pr.user_id = p_user_id)
     and not public.is_platform_owner() then
    raise exception 'Es Administrador de Cuotly: solo el propietario de Cuotly lo elimina, retirándole el rol (RN-ADM-03, RN-ADM-20)';
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

  -- RN-ADM-20 · Bosco elimina a un Administrador de Cuotly: primero le
  -- retira el rol, con su propio apunte (`platform.admin_revoked`).
  if exists (select 1 from public.platform_roles pr where pr.user_id = p_user_id) then
    perform public.revoke_platform_admin(p_user_id);
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
  values (p_user_id, v_actor, v_reason, v_details)
  returning id into v_op_id;

  -- RN-ADM-21 · se le avisa: "Su cuenta ha sido eliminada". Por correo,
  -- porque ya no puede entrar a leer un aviso dentro de Cuotly. La clave
  -- lleva el cierre: si se recupera y se vuelve a eliminar, vuelve a
  -- avisar; pulsar dos veces, no.
  perform public.queue_platform_email(
    'account_deleted', v_email, '{}'::jsonb, 'account_deleted:' || v_op_id::text);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (null, v_actor, 'platform.account_deleted', 'profile', p_user_id, v_details, v_reason);

  return v_details || jsonb_build_object('already_closed', false);
end;
$$;

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
  -- otra persona, vuelve como trabajadora: el espacio ya tiene dueño
  -- (RN-ADM-18, decisión 81 confirmada el 26/09/2026).
  -- Lo que no se puede devolver —el plan del espacio ya no admite más
  -- usuarios— se salta y se dice.
  for v_item in select * from jsonb_array_elements(v_closure.details -> 'memberships') loop
    v_role := v_item ->> 'role';
    if v_role = 'owner' and exists (
         select 1 from jsonb_array_elements(v_closure.details -> 'transfers') t
         where t ->> 'space_id' = v_item ->> 'space_id') then
      v_role := 'worker';
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

-- Los privilegios se conservan con `create or replace`; se repiten para
-- que esta migración se lea sola.
revoke all on function public.platform_delete_space(uuid, text) from public, anon;
grant execute on function public.platform_delete_space(uuid, text) to authenticated;
revoke all on function public.platform_delete_establishment(uuid, text) from public, anon;
grant execute on function public.platform_delete_establishment(uuid, text) to authenticated;
revoke all on function public.platform_account_deletion_preview(uuid) from public, anon;
grant execute on function public.platform_account_deletion_preview(uuid) to authenticated;
revoke all on function public.platform_delete_account(uuid, text, jsonb) from public, anon;
grant execute on function public.platform_delete_account(uuid, text, jsonb) to authenticated;
revoke all on function public.platform_restore_account(uuid, text) from public, anon;
grant execute on function public.platform_restore_account(uuid, text) to authenticated;
