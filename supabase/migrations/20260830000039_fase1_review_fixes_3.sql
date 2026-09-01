-- Tercera pasada de la revisión de cierre de la Fase 1.
--
-- ============================================================
-- H1 (BLOQUEANTE) · el arreglo R1 abrió la puerta que él mismo describió.
--
-- R1 razonaba bien hasta la última frase: "archivar a un moroso es
-- legítimo — lo que no lo es es seguir dándole servicio". Hizo lo primero
-- y no hizo lo segundo. `assert_establishment_service_running()` seguía
-- deteniendo el servicio SOLO en `paused` y `suspended`, así que
-- `suspended -> archived` es exactamente el mismo agujero que
-- `suspended -> ending`, con otro nombre: comprobado en vivo, un
-- establecimiento archivado con un cobro vencido dejaba al cliente enviar
-- una solicitud nueva y arrancaba su contador T1.
--
-- Y de paso `read_only`, que hasta hoy no lo hacía cumplir nadie:
-- RN-EST-09 y RN-EST-10 lo describen como las 24 h de SOLO LECTURA
-- previas a la suspensión, y admitía escrituras completas. Estaba en el
-- CHECK de la tabla, en los nombres y en la lista de estados desde los que
-- se reactiva; en ninguna guarda de escritura.
--
-- `ending` NO entra: RN-EST-09 dice que ahí el servicio sigue activo
-- hasta el final del periodo pagado. `configuring` tampoco: es el alta.
-- ============================================================

create or replace function public.assert_establishment_service_running(p_establishment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.establishments where id = p_establishment_id;

  -- RN-FIN-10 (+24 h, `paused`) y RN-FIN-11 (`suspended`): las dos etapas
  -- del impago (RN-FIN-12: "se detienen trabajos, publicaciones y
  -- contadores").
  if v_status in ('paused', 'suspended') then
    raise exception 'El servicio de este establecimiento está detenido por impago';
  end if;

  -- RN-EST-10: las 24 h de solo lectura antes de la suspensión. "Solo
  -- lectura" tiene que significar algo o el estado sobra.
  if v_status = 'read_only' then
    raise exception 'Este establecimiento está en solo lectura: se puede consultar, no crear ni cambiar nada';
  end if;

  -- Un establecimiento archivado no recibe servicio. RN-FIN-14 permite
  -- archivar a un moroso —la deuda se mantiene— pero archivar es la
  -- salida, no una forma de seguir trabajando.
  if v_status = 'archived' then
    raise exception 'Este establecimiento está archivado: no admite solicitudes ni trabajos nuevos';
  end if;
end;
$$;

comment on function public.assert_establishment_service_running(uuid) is
  'RN-FIN-10 a RN-FIN-12, RN-EST-10: con el establecimiento pausado o
   suspendido por impago, en solo lectura o archivado, no se comienzan ni
   publican trabajos, ni se asignan, ni se envían o aceptan solicitudes, ni
   se reanuda nada que arranque un contador. `ending` NO está en la lista:
   RN-EST-09 mantiene el servicio hasta el final del periodo pagado.
   Interna: no comprueba permisos por su cuenta, la llaman funciones que sí
   lo hacen.';

revoke all on function public.assert_establishment_service_running(uuid)
  from public, anon, authenticated;

-- ============================================================
-- H4 · RN-EST-05: "al retirar un acceso desaparece de inmediato, pero la
-- actividad histórica permanece".
--
-- No había forma de retirar el acceso de un cliente a un restaurante. Las
-- dos tablas de acceso del lado cliente —`establishment_memberships` y
-- `group_memberships`— no tenían ninguna columna de revocación, y borrar
-- la fila lo prohíbe CLAUDE.md ("no borrar físicamente registros de
-- negocio") además de llevarse por delante la actividad histórica que la
-- propia RN-EST-05 manda conservar. Resultado: el acceso de un Editor, un
-- Consulta o un propietario local era permanente.
--
-- El patrón ya existía en el lado del equipo (`worker_establishments`
-- tiene `revoked_at` y `revoked_by`); aquí se aplica igual.
-- ============================================================

alter table public.establishment_memberships
  add column revoked_at timestamptz,
  add column revoked_by uuid references public.profiles(id);

alter table public.group_memberships
  add column revoked_at timestamptz,
  add column revoked_by uuid references public.profiles(id);

-- La unicidad pasa a ser de los accesos VIVOS: revocado el de alguien, se
-- le puede volver a dar sin borrar el rastro del anterior.
alter table public.establishment_memberships
  drop constraint establishment_memberships_establishment_id_user_id_key;
create unique index establishment_memberships_live_key
  on public.establishment_memberships (establishment_id, user_id)
  where revoked_at is null;

alter table public.group_memberships
  drop constraint group_memberships_group_id_user_id_key;
create unique index group_memberships_live_key
  on public.group_memberships (group_id, user_id)
  where revoked_at is null;

comment on column public.establishment_memberships.revoked_at is
  'RN-EST-05: al retirar el acceso desaparece de inmediato. La fila se
   queda —la actividad histórica permanece— y deja de contar en
   is_establishment_member(), can_write_establishment() y
   client_can_view_billing().';

-- ============================================================
-- RN-EST-04 · "un Editor puede asignarse a uno, varios, todos los
-- actuales, o todos los actuales Y FUTUROS".
--
-- Lo último solo se puede expresar a nivel de grupo, y `group_memberships`
-- tenía `check (role = 'global_owner')`: la única forma de dar acceso a
-- los establecimientos futuros estaba reservada al propietario global
-- (RN-EST-03). Para un Editor no existía.
--
-- El mecanismo ya estaba montado —`can_read_establishment()` y
-- `can_write_establishment()` pasan por el grupo, así que un
-- establecimiento nuevo queda cubierto sin tocar nada—: lo único que
-- faltaba era dejar que el rol existiera.
-- ============================================================

alter table public.group_memberships
  drop constraint group_memberships_role_check;
alter table public.group_memberships
  add constraint group_memberships_role_check
  check (role in ('global_owner', 'editor'));

comment on column public.group_memberships.role is
  'RN-EST-03 (`global_owner`: acceso automático a los establecimientos
   nuevos del grupo) y RN-EST-04 (`editor`: "todos los actuales y
   futuros"). El editor de grupo escribe igual que el editor de un
   establecimiento, pero NO ve la facturación: eso es del propietario, y
   para el editor de un establecimiento requiere un permiso explícito
   (`establishment_permissions.view_billing`).';

-- ============================================================
-- Los seis consumidores de las dos tablas. Un acceso revocado deja de
-- contar en todos, que es lo que quiere decir "desaparece de inmediato".
-- ============================================================

create or replace function public.is_establishment_member(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.establishment_memberships
    where establishment_id = p_establishment_id
      and user_id = auth.uid()
      and revoked_at is null
  );
$$;

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_memberships
    where group_id = p_group_id
      and user_id = auth.uid()
      and revoked_at is null
  );
$$;

create or replace function public.can_write_establishment(p_establishment_id uuid)
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
    );
$$;

create or replace function public.can_write_establishment_as(p_establishment_id uuid, p_actor_id uuid)
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
    );
$$;

create or replace function public.client_can_view_billing(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = auth.uid()
        and gm.revoked_at is null
        -- El editor de grupo escribe, pero la facturación es del
        -- propietario: RN-EST-04 habla de asignarse a establecimientos, no
        -- de ver las cuentas.
        and gm.role = 'global_owner'
    )
    or exists (
      select 1 from public.establishment_memberships em
      left join public.establishment_permissions ep on ep.establishment_membership_id = em.id
      where em.establishment_id = p_establishment_id
        and em.user_id = auth.uid()
        and em.revoked_at is null
        and (em.role = 'local_owner' or (em.role = 'editor' and coalesce(ep.view_billing, false)))
    );
$$;

create or replace function public.notify_job_event(
  p_job_id uuid,
  p_event_type text,
  p_threshold_percent integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_assigned_to uuid;
  v_slug text;
  v_link text;
  v_recipient uuid;
  v_sent integer := 0;
  v_key text;
begin
  select j.space_id, j.establishment_id, j.assigned_to
  into v_space_id, v_establishment_id, v_assigned_to
  from public.jobs j where j.id = p_job_id;

  if v_space_id is null then
    return 0;
  end if;

  v_slug := public.space_slug(v_space_id);
  v_link := '/espacios/' || v_slug || '/trabajos/' || p_job_id::text;
  v_key := p_event_type || ':' || p_job_id::text
           || coalesce(':' || p_threshold_percent::text, '');

  for v_recipient in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = v_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
    union
    select v_assigned_to where v_assigned_to is not null
  loop
    if public.emit_notification(
         v_space_id, v_recipient, p_event_type, 'staff', 'job', p_job_id,
         v_link, v_key, v_establishment_id, p_threshold_percent) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  if p_event_type in ('job_started', 'job_published') then
    for v_recipient in
      select em.user_id from public.establishment_memberships em
      where em.establishment_id = v_establishment_id
        -- RN-EST-05: a quien se le retiró el acceso no se le sigue
        -- avisando de lo que pasa en el restaurante.
        and em.revoked_at is null
    loop
      if public.emit_notification(
           v_space_id, v_recipient, p_event_type, 'client', 'job', p_job_id,
           v_link, v_key || ':client', v_establishment_id, p_threshold_percent, null,
           p_event_type <> 'job_started') is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end if;

  return v_sent;
end;
$$;

revoke all on function public.notify_job_event(uuid, text, integer)
  from public, anon, authenticated;

-- ============================================================
-- Y la operación de retirar el acceso, que es lo que no existía. Como en
-- R5, la barrera no es una convención: se revoca el UPDATE de tabla y solo
-- se concede sobre `role`, así que las columnas de revocación no se pueden
-- tocar con un UPDATE directo y la única vía deja auditoría.
-- ============================================================

revoke update on public.establishment_memberships from anon, authenticated;
grant update (role) on public.establishment_memberships to authenticated;

revoke update on public.group_memberships from anon, authenticated;
grant update (role) on public.group_memberships to authenticated;

create or replace function public.revoke_establishment_access(
  p_establishment_id uuid,
  p_user_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_membership_id uuid;
  v_role text;
begin
  v_space_id := public.establishment_space_id(p_establishment_id);

  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden retirar el acceso de un cliente';
  end if;

  select id, role into v_membership_id, v_role
  from public.establishment_memberships
  where establishment_id = p_establishment_id and user_id = p_user_id and revoked_at is null
  for update;

  if v_membership_id is null then
    return false; -- CA-17: idempotente. Ya estaba retirado o nunca existió.
  end if;

  update public.establishment_memberships
  set revoked_at = now(), revoked_by = auth.uid()
  where id = v_membership_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'establishment_access.revoked', 'establishment', p_establishment_id,
    jsonb_build_object('user_id', p_user_id, 'role', v_role, 'revoked', false),
    jsonb_build_object('user_id', p_user_id, 'role', v_role, 'revoked', true),
    p_reason
  );

  return true;
end;
$$;

comment on function public.revoke_establishment_access(uuid, uuid, text) is
  'RN-EST-05: retira el acceso de un cliente a un establecimiento. El
   acceso desaparece de inmediato (deja de contar en las funciones de
   permiso) y la actividad histórica permanece: la fila se marca, no se
   borra. Idempotente.';

create or replace function public.revoke_group_access(
  p_group_id uuid,
  p_user_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_membership_id uuid;
  v_role text;
begin
  v_space_id := public.group_space_id(p_group_id);

  if v_space_id is null then
    raise exception 'Grupo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden retirar el acceso de un cliente';
  end if;

  select id, role into v_membership_id, v_role
  from public.group_memberships
  where group_id = p_group_id and user_id = p_user_id and revoked_at is null
  for update;

  if v_membership_id is null then
    return false;
  end if;

  update public.group_memberships
  set revoked_at = now(), revoked_by = auth.uid()
  where id = v_membership_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'group_access.revoked', 'group', p_group_id,
    jsonb_build_object('user_id', p_user_id, 'role', v_role, 'revoked', false),
    jsonb_build_object('user_id', p_user_id, 'role', v_role, 'revoked', true),
    p_reason
  );

  return true;
end;
$$;

comment on function public.revoke_group_access(uuid, uuid, text) is
  'RN-EST-05 aplicada al acceso de grupo (RN-EST-03 y RN-EST-04).';
