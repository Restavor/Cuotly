-- Capa central de permisos (CLAUDE.md: "permisos antes que ocultación
-- visual"; PRD §21.1: aislamiento en base de datos, no solo en la
-- interfaz). Todas las políticas RLS de este proyecto pasan por aquí.

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.space_memberships sm
    where sm.space_id = p_space_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
  );
$$;

comment on function public.is_space_member(uuid) is
  'SECURITY DEFINER a propósito: evita la recursión de RLS al consultar
   space_memberships desde sus propias políticas. No decide permisos
   finos, solo "¿pertenece este usuario a este espacio, en activo?".';

-- Capacidades de la Fase 1. Se amplía con migraciones nuevas a medida que
-- aparecen más (nunca editando esta función después de aplicada: se
-- sustituye con CREATE OR REPLACE en un archivo nuevo).
create or replace function public.has_capability(p_space_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.space_role;
begin
  select sm.role into v_role
  from public.space_memberships sm
  where sm.space_id = p_space_id
    and sm.user_id = auth.uid()
    and sm.status = 'active';

  if v_role is null then
    return false;
  end if;

  return case p_capability
    -- Configuración contractual, planes y servicios: solo el propietario
    -- (PRD §4.2 y §16.1 de la especificación maestra).
    when 'manage_space' then v_role = 'owner'
    -- Invitar y añadir miembros al equipo: solo el propietario (PRD §4.2:
    -- "Es el único que invita trabajadores").
    when 'invite_member' then v_role = 'owner'
    -- Crear establecimientos y gestionar clientes: propietario o
    -- administrador (RN-EST-02).
    when 'create_establishment' then v_role in ('owner', 'admin')
    when 'manage_clients' then v_role in ('owner', 'admin')
    -- Ver el equipo del espacio: cualquier miembro activo.
    when 'view_team' then true
    else false
  end;
end;
$$;

comment on function public.has_capability(uuid, text) is
  'Único punto de verdad de permisos dentro de un espacio. Las políticas
   RLS y las acciones del servidor llaman siempre a esta función — nunca
   se decide un permiso comparando roles a mano en otro sitio.';

-- Reservada para cuando el selector de contexto se propague como reclamo
-- de la sesión (JWT) en un hito posterior. Por ahora no la usa ninguna
-- política — la seguridad real siempre pasa por has_capability() e
-- is_space_member() contra la pertenencia real, nunca por "el espacio que
-- el cliente dice tener seleccionado".
create or replace function public.current_space_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_space_id', true), '')::uuid;
$$;

comment on function public.current_space_id() is
  'Todavía no está conectada a nada (no hay reclamo JWT de espacio activo
   en la Fase 1). Existe para no romper compatibilidad cuando se conecte.
   No la uses como control de seguridad.';

create or replace function public.accept_space_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation record;
  v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();

  select * into v_invitation
  from public.space_invitations
  where token = p_token
    and status = 'pending'
    and expires_at > now();

  if v_invitation is null then
    raise exception 'Invitación no válida o caducada';
  end if;

  if v_email is null or lower(v_invitation.email) <> lower(v_email) then
    raise exception 'Esta invitación no es para tu cuenta';
  end if;

  insert into public.space_memberships (space_id, user_id, role, status)
  values (v_invitation.space_id, auth.uid(), v_invitation.role, 'active')
  on conflict (space_id, user_id) do update
    set status = 'active', role = excluded.role;

  update public.space_invitations
  set status = 'accepted'
  where id = v_invitation.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_invitation.space_id,
    auth.uid(),
    'invitation.accepted',
    'space_invitation',
    v_invitation.id,
    jsonb_build_object('role', v_invitation.role)
  );

  return v_invitation.space_id;
end;
$$;

comment on function public.accept_space_invitation(uuid) is
  'La persona invitada la llama tras iniciar sesión con el token que
   recibió. Transaccional: crea la membresía y marca la invitación como
   aceptada, o falla entera (RN-DAT-09).';
