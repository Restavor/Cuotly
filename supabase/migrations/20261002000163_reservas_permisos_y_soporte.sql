-- Fase B de Restavor agents (AGT-01 y AGT-02) · tercera de siete migraciones.
--
-- Quién puede qué en Reservas, en la base (PRD de agents §3.1, §3.2 y §8.1):
--
--   1 · `space_memberships.can_support_reservations`: la marca "Soporte de
--       Reservas" del equipo del espacio, y `set_member_can_support_reservations()`,
--       que solo ejecuta el propietario del espacio (decisión 92).
--   2 · `establishment_invitations.manage_reservations` y las cuatro funciones
--       que llevan los permisos del restaurante, para que la casilla "Gestionar
--       Reservas" se guarde, se lea y viaje en una invitación. Sin esto la casilla
--       se descartaría en silencio: `set_establishment_permissions()` guarda siete
--       columnas con nombre.
--   3 · `reservations_can_read_diner_data()` y `reservations_can_read()`: quién
--       lee los datos de los comensales (decisión 108). Nunca `is_space_member()`,
--       que reconoce a cualquier miembro del espacio y al Modo soporte en lectura.
--
-- Las cuatro funciones de permisos son COPIAS de su definición vigente con el
-- cambio mínimo (migraciones 108, 109 y 114): se vuelven a crear enteras porque
-- una función no se edita a trozos.
--
-- Se comprueba con `supabase/tests/reservas_cimientos.sql`.

-- ------------------------------------------------------------
-- 1 · Soporte de Reservas
-- ------------------------------------------------------------
alter table public.space_memberships
  add column can_support_reservations boolean not null default false;

comment on column public.space_memberships.can_support_reservations is
  'Decisión 92 · quien lo tiene puede abrir una sesión de soporte de Reservas (con motivo y segundo paso) y ver los datos de los comensales de un restaurante. Solo lo cambia el propietario del espacio, con set_member_can_support_reservations().';

grant select (can_support_reservations) on public.space_memberships to authenticated;

-- Esta tabla tiene UPDATE e INSERT de tabla entera para `authenticated` y su política
-- de escritura deja pasar a quien invita miembros: sin más, un administrador podría
-- marcarse a sí mismo como soporte con un UPDATE directo. Un privilegio de columna no
-- lo cierra (el de tabla entera lo cubre), así que lo cierra este disparador: la marca
-- solo cambia con sesión de usuario si lo hace `set_member_can_support_reservations()`,
-- que lo avisa con un ajuste local. Sin sesión de usuario (servidor, sembrado) no estorba.
create or replace function public.guard_support_reservations_flag()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('restavor.support_reservations_rpc', true), '') <> 'on'
     and (case when tg_op = 'INSERT' then new.can_support_reservations
               else new.can_support_reservations is distinct from old.can_support_reservations end) then
    raise exception 'La marca de soporte de Reservas solo la cambia el propietario del espacio, desde su pantalla del equipo';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_support_reservations_flag() from public, anon, authenticated;

create trigger space_memberships_guard_support_reservations_flag
  before insert or update on public.space_memberships
  for each row execute function public.guard_support_reservations_flag();

create or replace function public.set_member_can_support_reservations(
  p_space_id uuid, p_user_id uuid, p_value boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous boolean;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede marcar a alguien como soporte de Reservas';
  end if;

  select can_support_reservations into v_previous
  from public.space_memberships
  where space_id = p_space_id and user_id = p_user_id;

  if v_previous is null then
    raise exception 'Esa persona no pertenece a este espacio';
  end if;

  -- Sin cambio no hay apunte: la auditoría cuenta lo que cambió.
  if v_previous = coalesce(p_value, false) then
    return;
  end if;

  -- Avisa al disparador de que este cambio es el bueno (solo vale en esta transacción).
  perform set_config('restavor.support_reservations_rpc', 'on', true);
  update public.space_memberships
  set can_support_reservations = coalesce(p_value, false)
  where space_id = p_space_id and user_id = p_user_id;
  perform set_config('restavor.support_reservations_rpc', 'off', true);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    p_space_id, auth.uid(), 'membership.support_reservations_changed', 'space_membership', p_user_id,
    jsonb_build_object('can_support_reservations', v_previous),
    jsonb_build_object('can_support_reservations', coalesce(p_value, false))
  );
end;
$$;

revoke all on function public.set_member_can_support_reservations(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_member_can_support_reservations(uuid, uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 2 · "Gestionar Reservas" en los permisos y en las invitaciones
-- ------------------------------------------------------------
alter table public.establishment_invitations
  add column manage_reservations boolean not null default false;

comment on column public.establishment_invitations.manage_reservations is
  'Se copia a establishment_permissions.manage_reservations al aceptar la invitación (solo cuenta para un Editor).';

grant select (manage_reservations) on public.establishment_invitations to authenticated;

-- set_establishment_permissions(): copia de la migración 108 que también guarda manage_reservations.
CREATE OR REPLACE FUNCTION public.set_establishment_permissions(p_establishment_id uuid, p_user_id uuid, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_membresia uuid;
  v_rol text;
  v_soy_equipo boolean;
  v_anterior jsonb;
begin
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  v_soy_equipo := public.has_capability(v_space_id, 'manage_clients');

  if not v_soy_equipo and not public.client_can_manage_users(p_establishment_id) then
    raise exception 'No tienes permiso para gestionar los accesos de este restaurante';
  end if;

  select em.id, em.role into v_membresia, v_rol
  from public.establishment_memberships em
  where em.establishment_id = p_establishment_id
    and em.user_id = p_user_id
    and em.revoked_at is null;

  if v_membresia is null then
    raise exception 'Esa persona no tiene acceso vivo a este restaurante';
  end if;

  -- RN-EST-15 · al Propietario no se le quitan permisos: los tiene por su
  -- rol y `client_permission()` ni mira las casillas. Dejar guardar aquí
  -- haría creer que se le han quitado.
  if v_rol = 'local_owner' then
    raise exception 'El propietario del restaurante tiene acceso completo: sus permisos no se configuran';
  end if;

  select to_jsonb(ep) - 'establishment_membership_id' into v_anterior
  from public.establishment_permissions ep
  where ep.establishment_membership_id = v_membresia;

  -- (`coalesce`: sin rol, `reservations_my_role()` es nulo y `nulo = 'owner'` no es falso, es nulo: el `if` no saltaría.)
  -- Migración 163 · dar o quitar «Gestionar Reservas» (el Encargado) es de quien añade Encargados:
  -- el propietario del restaurante o el equipo del espacio (PRD de agents §3.2). Un Editor con
  -- «Usuarios y accesos» puede cambiar los otros siete permisos, no este: si no, se ascendería
  -- a sí mismo y leería los datos de los comensales. Mandar la casilla sin cambiarla vale.
  if p_permissions ? 'manage_reservations'
     and coalesce((p_permissions ->> 'manage_reservations')::boolean, false)
         is distinct from coalesce((select ep0.manage_reservations from public.establishment_permissions ep0
                                    where ep0.establishment_membership_id = v_membresia), false)
     and not (v_soy_equipo or coalesce(public.reservations_my_role(p_establishment_id) = 'owner', false)) then
    raise exception 'Solo el propietario del restaurante o el equipo de mantenimiento pueden dar o quitar «Gestionar Reservas»';
  end if;

  insert into public.establishment_permissions (
    establishment_membership_id, create_requests, edit_menus, use_messages,
    upload_files, view_reports, view_billing, manage_users, manage_reservations
  ) values (
    v_membresia,
    coalesce((p_permissions ->> 'create_requests')::boolean, false),
    coalesce((p_permissions ->> 'edit_menus')::boolean, false),
    coalesce((p_permissions ->> 'use_messages')::boolean, false),
    coalesce((p_permissions ->> 'upload_files')::boolean, false),
    coalesce((p_permissions ->> 'view_reports')::boolean, false),
    coalesce((p_permissions ->> 'view_billing')::boolean, false),
    coalesce((p_permissions ->> 'manage_users')::boolean, false),
    -- Migración 163 · "Gestionar Reservas". Si quien llama no manda la clave (una
    -- pantalla anterior a esta casilla), se conserva lo que había: guardar los
    -- otros siete permisos no puede quitar el de Reservas sin que nadie lo vea.
    coalesce(
      (p_permissions ->> 'manage_reservations')::boolean,
      (select ep0.manage_reservations from public.establishment_permissions ep0
        where ep0.establishment_membership_id = v_membresia),
      false
    )
  )
  on conflict (establishment_membership_id) do update set
    create_requests = excluded.create_requests,
    edit_menus = excluded.edit_menus,
    use_messages = excluded.use_messages,
    upload_files = excluded.upload_files,
    view_reports = excluded.view_reports,
    view_billing = excluded.view_billing,
    manage_users = excluded.manage_users,
    manage_reservations = excluded.manage_reservations;

  -- CLAUDE.md · todo cambio de estado relevante deja actor, fecha, valor
  -- anterior y valor nuevo. Un permiso que cambia sin rastro es el que
  -- nadie sabe explicar tres meses después.
  insert into public.audit_log
    (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'establishment_permissions.set', 'establishment', p_establishment_id,
    jsonb_build_object('user_id', p_user_id, 'permissions', v_anterior),
    jsonb_build_object('user_id', p_user_id, 'permissions', p_permissions,
                       'by_team', v_soy_equipo)
  );
end;
$function$;

-- establishment_panel_users(): copia de la migración 108 con una columna más. Cambia el tipo
-- que devuelve, así que hay que soltarla y volver a crearla.
drop function public.establishment_panel_users(uuid);
CREATE OR REPLACE FUNCTION public.establishment_panel_users(p_establishment_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, email text, source text, role text, create_requests boolean, edit_menus boolean, use_messages boolean, upload_files boolean, view_reports boolean, view_billing boolean, manage_users boolean, manage_reservations boolean, granted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with permitido as (
    select
      public.has_capability(public.establishment_space_id(p_establishment_id), 'manage_clients')
      or exists (
        select 1 from public.establishment_memberships em
        where em.establishment_id = p_establishment_id
          and em.user_id = auth.uid()
          and em.revoked_at is null
      )
      or exists (
        select 1 from public.group_memberships gm
        join public.establishments e on e.group_id = gm.group_id
        where e.id = p_establishment_id
          and gm.user_id = auth.uid()
          and gm.revoked_at is null
      ) as si
  )
  select
    p.id,
    nullif(btrim(p.full_name), ''),
    p.email,
    'establishment'::text,
    em.role,
    -- RN-EST-15 · el Propietario los tiene los siete por su rol, no por
    -- casilla. Se dicen en `true` y no en lo que haya guardado, porque la
    -- pantalla enseña lo que esa persona PUEDE hacer: es la misma
    -- respuesta que daría `client_permission()`.
    em.role = 'local_owner' or coalesce(ep.create_requests, false),
    em.role = 'local_owner' or coalesce(ep.edit_menus, false),
    em.role = 'local_owner' or coalesce(ep.use_messages, false),
    em.role = 'local_owner' or coalesce(ep.upload_files, false),
    em.role = 'local_owner' or coalesce(ep.view_reports, false),
    em.role = 'local_owner' or coalesce(ep.view_billing, false),
    em.role = 'local_owner' or coalesce(ep.manage_users, false),
    -- Migración 163 · lo mismo que contesta `reservations_my_role()`: el
    -- Propietario lo tiene por su rol y el Editor, por su casilla.
    em.role = 'local_owner' or coalesce(ep.manage_reservations, false),
    em.created_at
  from public.establishment_memberships em
  join public.profiles p on p.id = em.user_id
  left join public.establishment_permissions ep on ep.establishment_membership_id = em.id
  where em.establishment_id = p_establishment_id
    and em.revoked_at is null
    and (select si from permitido)

  union all

  select
    p.id,
    nullif(btrim(p.full_name), ''),
    p.email,
    'group'::text,
    gm.role,
    -- El propietario global manda en todos sus restaurantes; el Editor de
    -- grupo, en el contenido y los informes (RN-FIN-07 le deja fuera la
    -- facturación, y `grant_group_*` no admite "Usuarios y accesos"). Es
    -- exactamente lo que contesta `client_permission()` para cada uno.
    true,
    true,
    true,
    true,
    true,
    gm.role = 'global_owner',
    gm.role = 'global_owner',
    -- Un Editor de grupo nunca es Encargado de Reservas (`reservations_my_role()`).
    gm.role = 'global_owner',
    gm.created_at
  from public.group_memberships gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = (select e.group_id from public.establishments e where e.id = p_establishment_id)
    and gm.revoked_at is null
    and (select si from permitido)

  order by 4, 2 nulls last, 3;
$function$;
revoke all on function public.establishment_panel_users(uuid) from public, anon;
grant execute on function public.establishment_panel_users(uuid) to authenticated;

-- invite_to_establishment_panel(): copia de la migración 114 con un parámetro más (al final, con
-- valor por defecto: quien llame por nombre sigue funcionando). Cambia la firma, así que se suelta la antigua.
drop function public.invite_to_establishment_panel(uuid, text, text, boolean, boolean, text);
CREATE OR REPLACE FUNCTION public.invite_to_establishment_panel(p_establishment_id uuid, p_email text, p_role text, p_edit_establishment_data boolean DEFAULT false, p_view_billing boolean DEFAULT false, p_idempotency_key text DEFAULT NULL::text, p_manage_reservations boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user_id uuid;
  v_id uuid;
  v_equipo boolean;
  v_estado text;
  v_slug text;
  v_persona uuid;
begin
  v_space_id := public.establishment_space_id(p_establishment_id);
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Hace falta un correo para invitar';
  end if;

  if p_role not in ('local_owner', 'editor') then
    raise exception 'El rol tiene que ser propietario del restaurante o editor';
  end if;

  -- RN-EST-17 · los mismos permisos que dar un acceso, ni uno más: el
  -- equipo, o quien tenga "Usuarios y accesos" dentro del panel. Desde
  -- dentro no se toca al Propietario. Esta es la comprobación que hace que
  -- la tercera puerta no sea más ancha que la que ya había.
  perform public.assert_can_manage_access(p_establishment_id, p_role);

  -- Migración 163 · invitar con «Gestionar Reservas» es dar el permiso del Encargado: lo mismo que
  -- en `set_establishment_permissions()`, solo el propietario del restaurante o el equipo.
  if p_role = 'editor' and coalesce(p_manage_reservations, false)
     and not (public.has_capability(v_space_id, 'manage_clients')
              or coalesce(public.reservations_my_role(p_establishment_id) = 'owner', false)) then
    raise exception 'Solo el propietario del restaurante o el equipo de mantenimiento pueden dar «Gestionar Reservas»';
  end if;

  -- CA-17 · pulsar dos veces devuelve lo mismo y no manda dos enlaces.
  if p_idempotency_key is not null then
    select id into v_id
    from public.establishment_invitations
    where establishment_id = p_establishment_id and idempotency_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  -- CAMINO 1 · ya tiene cuenta. No hay invitación ni aprobación que
  -- valga: meter a alguien que ya está dentro de Restavor web nunca necesitó
  -- permiso de nadie (RN-PAN-14).
  select id into v_user_id from public.profiles where lower(email) = v_email;
  if v_user_id is not null then
    perform public.grant_establishment_access(
      p_establishment_id, v_email, p_role, p_edit_establishment_data, p_view_billing);
    -- Migración 163 · "Gestionar Reservas" solo cuenta para un Editor; el
    -- Propietario lo tiene por su rol. `grant_establishment_access()` ya creó la
    -- fila de permisos y sigue con su firma de siempre.
    if p_role = 'editor' and coalesce(p_manage_reservations, false) then
      update public.establishment_permissions ep
      set manage_reservations = true
      from public.establishment_memberships em
      where ep.establishment_membership_id = em.id
        and em.establishment_id = p_establishment_id and em.user_id = v_user_id;
    end if;
    return null;
  end if;

  -- CAMINO 2 · no tiene cuenta. Se crea la invitación.
  --
  -- Si la manda el equipo del espacio, nace aprobada: pedirle al espacio
  -- que apruebe su propia invitación no es un control, es una pantalla de
  -- más (RN-PAN-14). La aprobación existe para cuando invita el
  -- restaurante.
  v_equipo := public.has_capability(v_space_id, 'manage_clients');
  v_estado := case when v_equipo then 'approved' else 'pending_review' end;

  insert into public.establishment_invitations (
    space_id, establishment_id, email, role, edit_establishment_data, view_billing,
    manage_reservations, status, expires_at, invited_by, reviewed_by, reviewed_at, idempotency_key
  )
  values (
    v_space_id, p_establishment_id, v_email, p_role,
    -- RN-EST-11 · un propietario del restaurante los lleva los dos; los
    -- finos solo se eligen para un Editor.
    case when p_role = 'local_owner' then true else coalesce(p_edit_establishment_data, false) end,
    case when p_role = 'local_owner' then true else coalesce(p_view_billing, false) end,
    case when p_role = 'editor' then coalesce(p_manage_reservations, false) else false end,
    v_estado,
    -- Los siete días de HU-03, y corriendo desde ya solo si nace aprobada.
    case when v_equipo then now() + interval '7 days' end,
    auth.uid(),
    case when v_equipo then auth.uid() end,
    case when v_equipo then now() end,
    p_idempotency_key
  )
  returning id into v_id;

  perform public.record_state_event(
    v_space_id, 'establishment_invitation', v_id, null, v_estado, null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'panel_invitation.created', 'establishment_invitation', v_id,
          jsonb_build_object('establishment_id', p_establishment_id, 'role', p_role,
                             'status', v_estado,
                             'manage_reservations', p_role = 'editor' and coalesce(p_manage_reservations, false)));

  -- Al equipo se le avisa solo de lo que tiene que mirar. Una invitación
  -- que nace aprobada no la tiene que mirar nadie.
  if not v_equipo then
    select slug into v_slug from public.spaces where id = v_space_id;
    for v_persona in
      select m.user_id
      from public.space_memberships m
      where m.space_id = v_space_id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    loop
      perform public.emit_notification(
        v_space_id, v_persona, 'panel_invitation_pending_review', 'team',
        'establishment_invitation', v_id,
        '/espacios/' || v_slug || '/restaurantes/' || p_establishment_id::text || '/usuarios',
        'panel_invitation_pending_review:' || v_id::text,
        p_establishment_id, null, null, true);
    end loop;
  end if;

  return v_id;
end;
$function$;
revoke all on function public.invite_to_establishment_panel(uuid, text, text, boolean, boolean, text, boolean) from public, anon;
grant execute on function public.invite_to_establishment_panel(uuid, text, text, boolean, boolean, text, boolean) to authenticated;

-- consume_establishment_invitation(): copia de la migración 114 que también copia manage_reservations.
CREATE OR REPLACE FUNCTION public.consume_establishment_invitation(p_token uuid, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inv public.establishment_invitations;
  v_email text;
  v_membership_id uuid;
  v_previo public.establishment_memberships;
  v_slug text;
begin
  select * into v_inv
  from public.establishment_invitations
  where token = p_token
  for update;

  if v_inv.id is null then
    raise exception 'Invitación no válida';
  end if;

  if v_inv.status = 'accepted' then
    raise exception 'Esta invitación ya se ha usado';
  end if;

  if v_inv.status <> 'approved' then
    raise exception 'Esta invitación no está aprobada';
  end if;

  if v_inv.expires_at is null or v_inv.expires_at <= now() then
    raise exception 'Esta invitación ha caducado';
  end if;

  -- RN-TRA-13 · una invitación **se queda** en el espacio que la autorizó
  -- cuando el restaurante se transfiere a otro. Quedarse deja la fila
  -- viva, así que lo que impide gastarla es esto: el restaurante ya no es
  -- de quien aprobó la invitación, y nadie de ese espacio puede seguir
  -- repartiendo accesos a algo que ya no es suyo.
  if public.establishment_space_id(v_inv.establishment_id) <> v_inv.space_id then
    raise exception 'Este restaurante ya no pertenece al espacio que autorizó la invitación';
  end if;

  select lower(p.email) into v_email from public.profiles p where p.id = p_user_id;
  if v_email is null or v_email <> lower(v_inv.email) then
    raise exception 'La cuenta no coincide con el correo invitado';
  end if;

  -- El acceso, con lo que se APROBÓ. La forma es la misma que en
  -- `grant_establishment_access()` y no por gusto: la membresía y los
  -- permisos finos viven en **dos tablas**, y a quien tuvo acceso antes se
  -- le reactiva la suya en vez de crearle otra, porque su actividad
  -- histórica cuelga de esa fila (RN-EST-05).
  --
  -- Una cuenta recién creada no puede tener membresía previa, pero el
  -- `select ... for update` se queda igualmente: esta función la llama un
  -- servidor, y darla por imposible es como se cuelan las filas dobles.
  select * into v_previo
  from public.establishment_memberships
  where establishment_id = v_inv.establishment_id and user_id = p_user_id
  for update;

  if v_previo.id is null then
    insert into public.establishment_memberships (establishment_id, user_id, role)
    values (v_inv.establishment_id, p_user_id, v_inv.role)
    returning id into v_membership_id;
  else
    v_membership_id := v_previo.id;
    update public.establishment_memberships
    set revoked_at = null, revoked_by = null, role = v_inv.role
    where id = v_membership_id;
  end if;

  insert into public.establishment_permissions
    (establishment_membership_id, edit_establishment_data, view_billing, manage_reservations)
  values (v_membership_id, v_inv.edit_establishment_data, v_inv.view_billing, v_inv.manage_reservations)
  on conflict (establishment_membership_id) do update
    set edit_establishment_data = excluded.edit_establishment_data,
        view_billing = excluded.view_billing,
        manage_reservations = excluded.manage_reservations;

  update public.establishment_invitations
  set status = 'accepted', accepted_by = p_user_id, accepted_at = now(), updated_at = now()
  where id = v_inv.id;

  perform public.record_state_event(
    v_inv.space_id, 'establishment_invitation', v_inv.id, 'approved', 'accepted', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_inv.space_id, p_user_id, 'panel_invitation.accepted', 'establishment_invitation',
          v_inv.id, jsonb_build_object('establishment_id', v_inv.establishment_id,
                                       'role', v_inv.role, 'membership_id', v_membership_id));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_inv.space_id, p_user_id, 'establishment_access.granted', 'establishment',
          v_inv.establishment_id, jsonb_build_object('user_id', p_user_id, 'role', v_inv.role,
                                                     'via', 'panel_invitation'));

  select slug into v_slug from public.spaces where id = v_inv.space_id;
  perform public.emit_notification(
    v_inv.space_id, p_user_id, 'establishment_access_granted', 'client',
    'establishment', v_inv.establishment_id,
    '/espacios/' || v_slug || '/restaurantes/' || v_inv.establishment_id::text,
    'establishment_access_granted:' || v_membership_id::text,
    v_inv.establishment_id, null, null, true);

  return v_membership_id;
end;
$function$;
revoke all on function public.consume_establishment_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_establishment_invitation(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 3 · Quién lee los datos de los comensales
-- ------------------------------------------------------------
-- Decisión 92 y PRD §3.4 / §8.8: el equipo del espacio no ve nombres, teléfonos
-- ni notas de comensales salvo en una sesión de soporte de Reservas abierta, con
-- el segundo paso hecho, por alguien marcado como soporte (o con `can_support`
-- de plataforma). La sesión de soporte de la plataforma (`support_sessions`) NO
-- abre esta puerta: es otra cosa y por eso no se mira `is_space_member()`.
create or replace function public.reservations_can_read_diner_data(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.session_is_two_factor()
    and exists (
      select 1
      from public.reservation_support_sessions s
      where s.establishment_id = p_establishment_id
        and s.actor_id = auth.uid()
        and s.ended_at is null
        and s.expires_at > now()
        and (
          public.is_platform_supporter()
          or exists (
            select 1 from public.space_memberships m
            where m.space_id = s.space_id and m.user_id = auth.uid()
              and m.status = 'active' and m.can_support_reservations
          )
        )
    );
$$;

-- Los dos aparecen en políticas de RLS: PostgreSQL las evalúa con los privilegios
-- de quien consulta, así que conservan EXECUTE para `authenticated` (CLAUDE.md).
revoke all on function public.reservations_can_read_diner_data(uuid) from public, anon;
grant execute on function public.reservations_can_read_diner_data(uuid) to authenticated;

-- Lo que usan las políticas de `reservations`, `reservation_events`,
-- `reservation_notifications` y `agent_calls`: el Propietario o el Encargado del
-- restaurante, o el soporte con sesión abierta.
create or replace function public.reservations_can_read(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.reservations_my_role(p_establishment_id) in ('owner', 'manager'), false)
      or public.reservations_can_read_diner_data(p_establishment_id);
$$;

revoke all on function public.reservations_can_read(uuid) from public, anon;
grant execute on function public.reservations_can_read(uuid) to authenticated;
