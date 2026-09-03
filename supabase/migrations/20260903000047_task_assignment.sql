-- HU-21, segunda mitad: **repartir** una tarea que ya existe.
--
-- Por qué falta esto. El Hito 6 dejó el desglose entero salvo un detalle
-- que no se ve hasta que hay pantalla: `create_job_task()` acepta un
-- responsable **al crearla** (`p_assignee_id default null`), y no había
-- ninguna función para ponerle responsable después. Una tarea creada sin
-- nadie —que es lo natural cuando el responsable desglosa primero el
-- trabajo y reparte luego— se quedaba sin repartir para siempre: no hay
-- política de UPDATE sobre `tasks` (a propósito: toda mutación pasa por
-- estas funciones), así que tampoco se podía tocar por la puerta de atrás.
--
-- HU-21 dice "desglosar un trabajo en tareas **y repartirlas**". Sin esta
-- función solo estaba la primera mitad, y solo si se acertaba a la
-- primera.
--
-- Las dos funciones repiten las guardas de `create_job_task()` porque son
-- la misma decisión: quién puede repartir, y quién puede recibir. No se
-- relajan aquí.

-- ============================================================
-- assign_task — poner (o cambiar) el responsable de una tarea.
-- ============================================================
create or replace function public.assign_task(p_task_id uuid, p_assignee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_job_id uuid;
  v_state text;
  v_assignee_id uuid;
  v_job_assigned_to uuid;
  v_job_state text;
  v_assignee_role public.space_role;
begin
  select t.space_id, t.establishment_id, t.job_id, t.state, t.assignee_id
  into v_space_id, v_establishment_id, v_job_id, v_state, v_assignee_id
  from public.tasks t where t.id = p_task_id
  for update;

  if v_space_id is null then
    raise exception 'Tarea no encontrada';
  end if;

  -- Mismo criterio que para desglosar: el responsable del trabajo reparte
  -- sus propias tareas, y un administrador reparte las de cualquiera
  -- (§4.2). Una tarea suelta (sin `job_id`, el caso del glosario §3) no
  -- tiene responsable de trabajo del que colgarse, así que la reparte
  -- quien tiene `assign_jobs`.
  if v_job_id is not null then
    select j.assigned_to, j.state into v_job_assigned_to, v_job_state
    from public.jobs j where j.id = v_job_id;

    if (v_job_assigned_to is distinct from auth.uid())
       and not public.has_capability(v_space_id, 'assign_jobs') then
      raise exception 'Solo el responsable asignado o un administrador pueden repartir las tareas de este trabajo';
    end if;

    if v_job_state in ('published', 'completed', 'cancelled_before_start', 'cancelled_after_start') then
      raise exception 'No se reparten tareas de un trabajo ya terminado';
    end if;
  elsif not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para repartir esta tarea';
  end if;

  -- Una tarea terminada o cancelada no cambia de manos: sería reescribir
  -- historial (CLAUDE.md MUST NOT).
  if v_state in ('completed', 'cancelled') then
    raise exception 'Una tarea % no se reparte', v_state;
  end if;

  if p_assignee_id is null then
    raise exception 'Hay que decir a quién se le reparte la tarea';
  end if;

  -- Idempotente: repartirle otra vez a la misma persona no escribe nada ni
  -- ensucia la auditoría con un cambio que no ocurrió (CA-17, el mismo
  -- criterio que `assign_job()`).
  if v_assignee_id is not distinct from p_assignee_id then
    return;
  end if;

  if not public.member_can_perform_jobs(v_space_id, p_assignee_id) then
    raise exception 'Esa persona no puede recibir tareas en este espacio';
  end if;

  -- RN-ASG-01 / §4.3: repartir una tarea **no puede conceder acceso** a un
  -- establecimiento que esa persona no tiene autorizado. Es la misma
  -- comprobación que la revisión del Hito 6 tuvo que añadirle a
  -- `create_job_task()` (migración 23, arreglo I6); sin ella, esta función
  -- sería exactamente el agujero que aquella cerró, abierto de nuevo por
  -- la puerta de al lado.
  if v_establishment_id is not null then
    select sm.role into v_assignee_role
    from public.space_memberships sm
    where sm.space_id = v_space_id and sm.user_id = p_assignee_id and sm.status = 'active';

    if v_assignee_role = 'worker'
       and not public.is_authorized_for_establishment(v_establishment_id, p_assignee_id) then
      raise exception 'Esa persona no tiene autorizado el establecimiento de esta tarea';
    end if;
  end if;

  update public.tasks set assignee_id = p_assignee_id where id = p_task_id;

  -- CLAUDE.md MUST: actor, valor anterior, valor nuevo. El estado de la
  -- tarea no cambia al repartirla, así que esto no es un `state_event`:
  -- es un cambio de responsable, y va a auditoría.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'task.assigned', 'task', p_task_id,
    jsonb_build_object('assignee_id', v_assignee_id),
    jsonb_build_object('assignee_id', p_assignee_id)
  );
end;
$$;

comment on function public.assign_task(uuid, uuid) is
  'HU-21 · repartir una tarea ya creada. Repite las guardas de
   create_job_task(): quién reparte (responsable del trabajo o
   assign_jobs) y quién puede recibir (member_can_perform_jobs y
   RN-ASG-01, que impide conceder acceso a un establecimiento repartiendo
   una tarea).';

-- ============================================================
-- list_task_candidates — a quién se le puede repartir una tarea.
-- ============================================================
--
-- Toma el **trabajo** y no la tarea, y no es un detalle: quien desglosa
-- necesita la lista para el alta de la PRIMERA tarea, cuando todavía no
-- hay ninguna tarea de la que colgarla. Pedirla por tarea dejaba el
-- desplegable vacío justo la primera vez. Además el establecimiento —que
-- es lo que decide quién puede recibirla (RN-ASG-01)— lo hereda la tarea
-- del trabajo, así que el trabajo es el contexto correcto.
--
-- No vale `list_job_candidates()`: aquella responde "quién es candidato a
-- ejecutar ESTE trabajo" y filtra por la especialidad que el trabajo exige
-- y por la elegibilidad completa de RN-ASG-02. Una tarea es un paso
-- interno de ese trabajo y puede recaer en alguien que no sería candidato
-- a llevárselo entero. Lo que sí comparte es el suelo: poder ejecutar
-- trabajos en el espacio y tener autorizado el establecimiento.
--
-- Y hay una segunda diferencia que importa: `list_job_candidates()` exige
-- `assign_jobs`, pero aquí el responsable del trabajo —un trabajador
-- normal— también reparte, así que tiene que poder ver la lista.
create or replace function public.list_task_candidates(p_job_id uuid)
returns table (
  worker_id uuid,
  active_load_points integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_assigned_to uuid;
  v_puede_ver_carga boolean;
begin
  select j.space_id, j.establishment_id, j.assigned_to
  into v_space_id, v_establishment_id, v_assigned_to
  from public.jobs j where j.id = p_job_id;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if (v_assigned_to is distinct from auth.uid())
     and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para ver a quién se le pueden repartir las tareas de este trabajo';
  end if;

  -- RN-ASG-17: "no existe ranking público entre trabajadores", y las
  -- comparaciones de desempeño solo las ven propietario y administradores.
  -- La carga de cada compañero es justo esa clase de dato, así que al
  -- responsable que reparte sus propias tareas se le da la lista de
  -- personas **sin** los puntos. Quien tiene `assign_jobs` sí los ve: es
  -- la misma información que ya le da `list_job_candidates()` para asignar.
  v_puede_ver_carga := public.has_capability(v_space_id, 'assign_jobs');

  return query
  select
    sm.user_id,
    case when v_puede_ver_carga
      then public.worker_active_load_points(v_space_id, sm.user_id)
      else null
    end
  from public.space_memberships sm
  where sm.space_id = v_space_id
    and sm.status = 'active'
    and public.member_can_perform_jobs(v_space_id, sm.user_id)
    -- RN-ASG-01: quien no tiene autorizado el establecimiento no aparece,
    -- para que la pantalla no ofrezca a alguien a quien `assign_task()`
    -- va a rechazar después.
    and (
      v_establishment_id is null
      or sm.role <> 'worker'
      or public.is_authorized_for_establishment(v_establishment_id, sm.user_id)
    )
  order by 2 nulls last, 1;
end;
$$;

comment on function public.list_task_candidates(uuid) is
  'HU-21 · a quién se le pueden repartir las tareas de un trabajo.
   RN-ASG-17: los puntos de carga solo se devuelven a quien tiene
   `assign_jobs`; al responsable que reparte sus propias tareas se le da la
   lista sin ellos, porque la carga de un compañero es una comparación
   entre trabajadores.';

-- Las dos comprueban permisos por su cuenta (`has_capability`, y el
-- responsable del trabajo), así que son puertas de entrada y conservan el
-- EXECUTE de `authenticated`. Se le retira a `anon`: sin sesión,
-- `auth.uid()` es nulo y no hay nada que repartir ni que mirar.
-- CLAUDE.md: revocar solo a PUBLIC no basta, porque un proyecto de
-- Supabase concede EXECUTE por defecto a `anon` y `authenticated`.
revoke all on function public.assign_task(uuid, uuid) from public, anon;
revoke all on function public.list_task_candidates(uuid) from public, anon;
grant execute on function public.assign_task(uuid, uuid) to authenticated;
grant execute on function public.list_task_candidates(uuid) to authenticated;
