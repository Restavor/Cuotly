-- Retirar a una persona del equipo de mantenimiento (decisión 80,
-- 25/09/2026; PRD §4.5, RN-MIE-01 a RN-MIE-07).
--
-- Bosco: *"quiero que el propietario del espacio de mantenimiento pueda
-- [...] eliminar a personas de su equipo, no del de restaurante, solo del
-- mantenimiento"*.
--
-- **Retirar no es borrar.** CLAUDE.md prohíbe borrar registros de negocio
-- (RN-DAT-06) y §4.5 ya dice qué pasa cuando alguien sale: *"Al pasar a
-- `inactive` o `access_revoked`: pierde acceso de inmediato, deja de
-- recibir asignaciones y notificaciones, el sistema marca sus trabajos
-- pendientes como necesitados de reasignación y se conserva todo su
-- historial."* Ese estado existía desde la migración 2 y nada lo ponía.
-- Aquí se pone, y lo que §4.5 manda que ocurra al ponerlo, ocurre.
--
-- **Lo que ya estaba hecho y no se duplica:**
--   · Perder el acceso: `is_space_member()` y `has_capability_as()` solo
--     reconocen `status = 'active'` (migración 91). Cambiar el estado
--     basta: no hay ninguna fila que borrar.
--   · Dejar de recibir asignaciones y avisos: los candidatos a un trabajo,
--     a una tarea y a un menú, y los destinatarios de los avisos, se
--     buscan entre miembros activos.
--   · Dejar de ser responsable de un restaurante: el disparador
--     `space_memberships_clear_managers` (migración 119).
--   · No dejar el espacio sin propietario: `guard_last_space_owner()`
--     (migración 92, RN-CIC-06).
--   · Volver a entrar: una invitación nueva; `accept_space_invitation_as()`
--     reactiva la fila que ya existe.
--
-- **Lo que faltaba, y por qué va en un disparador y no en la función.**
-- `space_memberships_update_owner` deja al propietario escribir esa tabla
-- **directamente por PostgREST**, igual que recordaba la migración 92 para
-- el último propietario. Si "marcar sus trabajos para reasignar" viviera
-- solo dentro de `remove_space_member()`, un `update` de una línea dejaría
-- a alguien fuera con trabajos a su nombre que nadie puede reasignar (solo
-- su responsable pide una reasignación, RN-ASG-07). Por eso las
-- consecuencias de §4.5 van en `end_membership_consequences()`, que corre
-- se entre por donde se entre y también para `inactive`, que §4.5 trata
-- igual. La función pone lo que un disparador no sabe: quién puede, el
-- motivo y la auditoría de la persona.
--
-- **No toca a nadie de un restaurante.** Las personas del restaurante
-- están en `establishment_memberships` y `group_memberships`, que tienen
-- su propio "retirar acceso" (RN-EST-05). Esta migración no las lee ni las
-- escribe.
--
-- Se comprueba con `supabase/tests/retirar_a_alguien_del_equipo.sql`.

-- ------------------------------------------------------------
-- 1 · El libro de estados admite la pertenencia (CLAUDE.md, "todo cambio
--     de estado relevante genera un evento")
-- ------------------------------------------------------------
--
-- La política `state_events_select` enseña a quien tiene `assign_jobs` —
-- propietario y administradores— todo lo que no sea de un trabajo, una
-- tarea, una oportunidad o un informe. Un restaurante no es miembro del
-- espacio: no ve estas filas.
alter table public.state_events drop constraint if exists state_events_entity_type_check;
alter table public.state_events add constraint state_events_entity_type_check
  check (entity_type in (
    'job', 'task', 'establishment', 'opportunity', 'report', 'space',
    'establishment_invitation',
    -- RN-MIE-05 (migración 139).
    'space_membership'
  ));

-- ------------------------------------------------------------
-- 2 · Las consecuencias de salir (§4.5, RN-MIE-03 y RN-MIE-04)
-- ------------------------------------------------------------
create or replace function public.end_membership_consequences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('cuotly.membership_end_reason', true), '');
  v_job record;
  v_task record;
  v_audit_id uuid;
  v_request_id uuid;
  v_slug text;
  v_link text;
begin
  -- Solo cuando la persona DEJA de estar dentro. `invited` y
  -- `temporarily_absent` siguen siendo del equipo: una ausencia tiene su
  -- propio camino (RN-ASG-12).
  if old.status not in ('active', 'temporarily_absent', 'invited')
     or new.status not in ('inactive', 'access_revoked') then
    return new;
  end if;

  v_slug := public.space_slug(new.space_id);

  -- RN-MIE-03 · sus trabajos vivos pasan a "reasignación pedida", que es
  -- la marca que ya existe para esto y la bandeja donde el propietario y
  -- los administradores la resuelven (M72, RN-ASG-08). `approve_job_
  -- reassignment()` devuelve cada uno al estado del que salió leyéndolo de
  -- `state_events`, así que un trabajo bloqueado o en pausa vuelve
  -- bloqueado o en pausa, con sus contadores donde estaban: aquí no se
  -- escribe ningún `timer_events` (reasignar no reinicia contadores,
  -- RN-ASG-09).
  for v_job in
    select j.id, j.state, j.establishment_id
    from public.jobs j
    where j.space_id = new.space_id
      and j.assigned_to = new.user_id
      and j.state in ('assigned', 'in_progress', 'blocked_by_client', 'authorized_pause')
    order by j.code
    for update
  loop
    update public.jobs set state = 'reassignment_requested' where id = v_job.id;

    insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
    values (new.space_id, 'job', v_job.id, v_job.state, 'reassignment_requested', auth.uid(), v_reason, 'member_left');

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
    values (new.space_id, auth.uid(), 'job.reassignment_requested', 'job', v_job.id,
            jsonb_build_object('state', v_job.state, 'assigned_to', new.user_id),
            jsonb_build_object('state', 'reassignment_requested', 'cause', 'member_left'),
            v_reason)
    returning id into v_audit_id;

    perform public.notify_reassignment_deciders(
      new.space_id, 'job_reassignment_requested', 'job', v_job.id,
      '/espacios/' || v_slug || '/trabajos/' || v_job.id::text,
      'job_reassignment_requested:' || v_audit_id::text,
      v_job.establishment_id);
  end loop;

  -- RN-MIE-03 · sus tareas vivas quedan con la reasignación pendiente, la
  -- misma fila que pediría él (migración 65). Las de un trabajo terminado
  -- no: `request_task_reassignment()` tampoco las acepta.
  for v_task in
    select t.id, t.job_id, j.establishment_id
    from public.tasks t
    left join public.jobs j on j.id = t.job_id
    where t.space_id = new.space_id
      and t.assignee_id = new.user_id
      and t.state in ('pending', 'in_progress', 'blocked')
      and (j.id is null or j.state not in ('published', 'completed', 'cancelled_before_start', 'cancelled_after_start'))
      and not exists (
        select 1 from public.task_reassignment_requests r
        where r.task_id = t.id and r.state = 'pending'
      )
    for update of t
  loop
    insert into public.task_reassignment_requests (space_id, task_id, requested_by, reason)
    values (new.space_id, v_task.id, coalesce(auth.uid(), new.user_id),
            coalesce(v_reason, 'Ya no está en el equipo'))
    returning id into v_request_id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
    values (new.space_id, auth.uid(), 'task.reassignment_requested', 'task', v_task.id,
            jsonb_build_object('assignee_id', new.user_id, 'reassignment_pending', false),
            jsonb_build_object('assignee_id', new.user_id, 'reassignment_pending', true, 'cause', 'member_left'),
            v_reason);

    v_link := case
      when v_task.job_id is null then '/espacios/' || v_slug || '/tareas'
      else '/espacios/' || v_slug || '/trabajos/' || v_task.job_id::text || '/tareas?tarea=' || v_task.id::text
    end;

    perform public.notify_reassignment_deciders(
      new.space_id, 'task_reassignment_requested', 'task', v_task.id, v_link,
      'task_reassignment_requested:' || v_request_id::text,
      v_task.establishment_id);
  end loop;

  -- RN-MIE-04 · sus supervisiones vigentes, las dos direcciones: quien se
  -- va no supervisa a nadie ni tiene a nadie que lo supervise. Se retiran
  -- con `revoked_at`, como `revoke_supervision()`; la fila queda.
  with retiradas as (
    update public.supervisions
    set revoked_at = now()
    where space_id = new.space_id
      and (worker_id = new.user_id or admin_id = new.user_id)
      and revoked_at is null
      and (ends_at is null or ends_at > now())
    returning id, kind
  )
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  select new.space_id, auth.uid(), 'supervision.revoked', 'supervision', r.id,
         jsonb_build_object('kind', r.kind, 'cause', 'member_left'), v_reason
  from retiradas r;

  -- RN-MIE-04 · sus restaurantes autorizados y sus especialidades. Si
  -- vuelve con una invitación nueva, vuelve sin ellos y se le conceden de
  -- nuevo: una autorización nunca se da por defecto (RN-ASG-01). Retirar
  -- es `revoked_at`, nunca borrar (RN-EST-05).
  update public.worker_establishments
  set revoked_at = now(), revoked_by = auth.uid()
  where space_id = new.space_id and user_id = new.user_id and revoked_at is null;

  update public.worker_specialties
  set revoked_at = now(), revoked_by = auth.uid()
  where space_id = new.space_id and user_id = new.user_id and revoked_at is null;

  -- RN-MIE-05 · el cambio de estado de la persona, en el libro de estados.
  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (new.space_id, 'space_membership', new.user_id, old.status::text, new.status::text,
          auth.uid(), v_reason, 'member_left');

  return new;
end;
$$;

comment on function public.end_membership_consequences() is
  '§4.5, RN-MIE-03/04/05 · lo que pasa cuando alguien deja de estar en el
   equipo, se entre por `remove_space_member()` o por un `update` directo:
   sus trabajos y tareas vivos quedan para reasignar, sus supervisiones,
   restaurantes y especialidades se retiran (sin borrar) y el cambio queda
   en `state_events`.';

revoke all on function public.end_membership_consequences() from public, anon, authenticated;

create trigger space_memberships_end_consequences
  after update of status on public.space_memberships
  for each row execute function public.end_membership_consequences();

-- ------------------------------------------------------------
-- 3 · La puerta (RN-MIE-01, RN-MIE-02, RN-MIE-06)
-- ------------------------------------------------------------
create or replace function public.remove_space_member(
  p_space_id uuid,
  p_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.space_role;
  v_status public.member_status;
  v_jobs integer;
  v_tasks integer;
  v_menus integer;
  v_other_jobs integer;
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión para retirar a alguien del equipo';
  end if;

  -- RN-MIE-02 · la sesión de soporte dura horas y esto no se deshace al
  -- cerrarla. Lo mismo que archivar o transferir (RN-CIC-05, RN-CIC-07).
  if public.support_access_level(p_space_id) is not null then
    raise exception 'Modo soporte no retira a nadie del equipo (§129, RN-ADM-07, RN-MIE-02)';
  end if;

  -- RN-MIE-01 · §4.2: el propietario es el único que invita trabajadores
  -- y nombra o retira administradores.
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio retira a alguien del equipo (§4.2, RN-MIE-01)';
  end if;

  select role, status into v_role, v_status
  from public.space_memberships
  where space_id = p_space_id and user_id = p_user_id
  for update;

  if v_role is null then
    raise exception 'Esa persona no pertenece a este espacio';
  end if;

  -- RN-MIE-06 · pulsar dos veces no hace nada la segunda: ni otro apunte
  -- ni otro aviso. Antes que el motivo, para que el doble clic no se
  -- encuentre con un error por algo que sí ocurrió.
  if v_status = 'access_revoked' then
    return jsonb_build_object('already_removed', true, 'jobs', 0, 'tasks', 0,
                              'menus', 0, 'other_jobs', 0);
  end if;

  -- RN-MIE-02 · a un propietario no se le retira: se le transfiere antes
  -- la propiedad (RN-CIC-05). Tampoco a uno mismo, que es el mismo caso.
  if v_role = 'owner' then
    raise exception 'Al propietario no se le retira del equipo: transfiere antes la propiedad (§127, RN-CIC-05, RN-MIE-02)';
  end if;

  -- RN-MIE-01 · §140: "roles, permisos [...] eliminación exigen
  -- confirmación adicional". El motivo es esa confirmación y lo que
  -- contestará dentro de seis meses por qué salió.
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Retirar a alguien del equipo exige motivo (§140, RN-MIE-01)';
  end if;

  -- Lo que se va a marcar, contado antes de marcarlo, para decírselo a
  -- quien lo retira. Lo marca el disparador.
  select count(*) into v_jobs
  from public.jobs
  where space_id = p_space_id and assigned_to = p_user_id
    and state in ('assigned', 'in_progress', 'blocked_by_client', 'authorized_pause');

  select count(*) into v_tasks
  from public.tasks t
  left join public.jobs j on j.id = t.job_id
  where t.space_id = p_space_id and t.assignee_id = p_user_id
    and t.state in ('pending', 'in_progress', 'blocked')
    and (j.id is null or j.state not in ('published', 'completed', 'cancelled_before_start', 'cancelled_after_start'));

  -- RN-MIE-03 · lo que NO se marca y hay que decir: los menús que tiene
  -- asignados (se reasignan desde Menú Diario en cualquier momento con
  -- `assign_menu_publication()`, no necesitan marca) y los trabajos en
  -- corrección, que el estado de trabajo no permite pasar a reasignación.
  select count(*) into v_menus
  from public.menu_publications mp
  join public.menus m on m.id = mp.menu_id
  where mp.space_id = p_space_id and mp.assigned_to = p_user_id
    and m.state in ('assigned', 'needs_information', 'reviewing', 'ready_to_publish', 'publication_error');

  select count(*) into v_other_jobs
  from public.jobs
  where space_id = p_space_id and assigned_to = p_user_id and state = 'in_correction';

  perform set_config('cuotly.membership_end_reason', btrim(p_reason), true);

  update public.space_memberships
  set status = 'access_revoked'
  where space_id = p_space_id and user_id = p_user_id;

  perform set_config('cuotly.membership_end_reason', '', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, v_actor, 'membership.access_revoked', 'space_membership', p_user_id,
          jsonb_build_object('status', v_status, 'role', v_role),
          jsonb_build_object('status', 'access_revoked', 'role', v_role,
                             'jobs_to_reassign', v_jobs, 'tasks_to_reassign', v_tasks),
          btrim(p_reason));

  return jsonb_build_object('already_removed', false, 'jobs', v_jobs, 'tasks', v_tasks,
                            'menus', v_menus, 'other_jobs', v_other_jobs);
end;
$$;

comment on function public.remove_space_member(uuid, uuid, text) is
  'RN-MIE-01/02/06, §4.5 · el propietario retira a un administrador o a un
   trabajador del equipo: pasa a `access_revoked`, pierde el acceso en ese
   instante y todo su historial se queda. No borra nada ni toca a las
   personas de los restaurantes. Las consecuencias las pone el disparador
   `space_memberships_end_consequences`. Devuelve lo que ha quedado para
   reasignar.';

revoke all on function public.remove_space_member(uuid, uuid, text) from public, anon;
grant execute on function public.remove_space_member(uuid, uuid, text) to authenticated;
