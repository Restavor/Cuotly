-- ============================================================
-- Migración 114 · Invitaciones al panel del restaurante
--                 (RN-ACC-13, RN-PAN-14/15, decisión 59)
-- ============================================================
--
-- **El agujero que cierra.** Hasta hoy `grant_establishment_access()`
-- rechazaba un correo sin cuenta: *"No hay ninguna cuenta de Cuotly con
-- ese correo"*. Eso significaba que un restaurante **no podía meter a su
-- encargado** — cada empleado de cada restaurante dependía de que el
-- equipo lo diera de alta a mano. RN-PAN-12 lo dejó escrito como pendiente
-- de decidir, porque abrir una puerta de creación de cuentas no se
-- improvisa (CLAUDE.md).
--
-- Bosco eligió el 20/09/2026 entre tres opciones: **"el restaurante
-- invita, tú apruebas"**. Y la manda quien ya puede dar accesos; no se
-- cambia ningún permiso.
--
-- **Cuatro cosas que hay que respetar al tocar esto:**
--
--   1. **Dos caminos según el correo, y no los elige quien invita.** Con
--      cuenta, se da el acceso en el momento, como hasta hoy. Sin cuenta,
--      se crea una invitación y entra la aprobación. Meter a alguien que
--      ya está dentro nunca necesitó permiso y sigue sin necesitarlo.
--   2. **Una invitación del propio equipo nace aprobada.** Pedirle al
--      espacio que apruebe su propia invitación no es un control, es una
--      pantalla de más. La aprobación existe para lo que Bosco quiso
--      controlar: que un RESTAURANTE cree cuentas de Cuotly.
--   3. **La caducidad cuenta desde la aprobación**, no desde el envío. Si
--      contara desde el envío, lo que tardara el equipo en mirarla se lo
--      comería al invitado y el enlace podría llegarle ya muerto.
--   4. **Una invitación NO es un acceso.** Mientras está pendiente o
--      aprobada, esa persona no cuenta para RN-PAN-09: el restaurante
--      sigue sin panel, porque nadie puede entrar todavía.
--
-- **El reparto con el servidor**, copiado de la migración 97 porque es el
-- mismo problema: SQL no crea cuentas. `establishment_invitation_details()`
-- es lo que la pantalla pública lee para enseñar el correo prefijado, y
-- `consume_establishment_invitation()` la llama el servidor con
-- `service_role` **después** de crear la cuenta, en la misma acción. Falla
-- cerrado: si el enlace se gastó, caducó o el correo no coincide, no marca
-- nada y el servidor deshace el alta.

-- ------------------------------------------------------------
-- 1 · La tabla
-- ------------------------------------------------------------
create table public.establishment_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- El correo al que va, congelado aquí: es el que va a tener la cuenta.
  email text not null check (length(btrim(email)) > 0),
  -- RN-EST-15 · los dos roles del lado cliente. `consulta` se retiró el
  -- 19/09/2026: era un Editor con todos los permisos apagados.
  role text not null check (role in ('local_owner', 'editor')),
  -- RN-EST-11 y RN-FIN-07 · los permisos finos que tendrá al entrar. Se
  -- guardan con la invitación y no se recalculan al aceptarla: lo que se
  -- aprobó es lo que se concede, aunque la pantalla haya cambiado después.
  edit_establishment_data boolean not null default false,
  view_billing boolean not null default false,
  -- RN-PAN-14 · los cinco estados. `accepted`, `rejected` y `expired` son
  -- finales.
  status text not null default 'pending_review' check (status in (
    'pending_review', 'approved', 'accepted', 'rejected', 'cancelled', 'expired'
  )),
  token uuid not null unique default gen_random_uuid(),
  -- Nulo mientras está pendiente: la caducidad empieza a correr cuando se
  -- aprueba, no cuando se manda (RN-PAN-14).
  expires_at timestamptz,
  invited_by uuid not null references public.profiles (id),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  rejection_reason text,
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint establishment_invitations_reviewed
    check ((reviewed_at is null) = (reviewed_by is null)),
  constraint establishment_invitations_accepted
    check ((accepted_at is null) = (accepted_by is null)),
  -- Un rechazo sin motivo no le dice nada a quien invitó.
  constraint establishment_invitations_rejection
    check (status <> 'rejected' or length(btrim(coalesce(rejection_reason, ''))) > 0)
);

comment on table public.establishment_invitations is
  'RN-ACC-13, RN-PAN-14 · la tercera puerta de Cuotly: una invitación al
   panel de UN restaurante, que crea la cuenta al aceptarse. La manda quien
   puede dar accesos; si la manda el restaurante, la aprueba el equipo del
   espacio. No crea espacio, ni membresía de espacio, ni suscripción.';

-- Una sola invitación viva por correo y restaurante: dos pendientes para
-- la misma persona son dos enlaces que crean dos cuentas.
create unique index establishment_invitations_live_idx
  on public.establishment_invitations (establishment_id, lower(email))
  where status in ('pending_review', 'approved');

create unique index establishment_invitations_idempotency_idx
  on public.establishment_invitations (establishment_id, idempotency_key)
  where idempotency_key is not null;

create index establishment_invitations_space_idx
  on public.establishment_invitations (space_id, status, created_at desc);

alter table public.establishment_invitations enable row level security;

-- CLAUDE.md · toda tabla con `space_id` lleva el disparador de solo
-- lectura en Modo soporte, y esta con más motivo que ninguna: en soporte
-- se mira, no se toca (§129, RN-ADM-06/07), y lo que se tocaría aquí es
-- la creación de una cuenta de Cuotly. Lo cazó la suite 41.
create trigger establishment_invitations_guard_support_read_only
  before insert or update or delete on public.establishment_invitations
  for each row execute function public.guard_support_read_only();

-- RN-SUB-08 · y el otro guardián, que es distinto y va aparte: un espacio
-- **archivado por impago** está congelado. Lo que esa regla deja hacer es
-- pagar, exportar y hablar con soporte; invitar a alguien nuevo al panel
-- de un restaurante no está en esa lista, y además crearía una cuenta de
-- Cuotly dentro de un espacio que no está pagando. Lo cazó la suite 41.
create trigger establishment_invitations_cuotly_read_only
  before insert or update or delete on public.establishment_invitations
  for each row execute function public.guard_space_read_only();

-- ------------------------------------------------------------
-- 2 · Quién las ve, y qué columnas (RN-PAN-15)
-- ------------------------------------------------------------
--
-- El equipo del espacio ve las de su espacio; dentro del panel las ve
-- quien puede gestionar accesos, y solo las de su restaurante.
--
-- Sin INSERT, UPDATE ni DELETE a propósito: todo pasa por función, que es
-- donde viven las comprobaciones (CLAUDE.md).
create policy establishment_invitations_select on public.establishment_invitations
for select
using (
  public.has_capability(space_id, 'manage_clients')
  or public.client_permission(establishment_id, 'manage_users')
);

-- CLAUDE.md · RLS filtra filas y **no columnas**. `invited_by`,
-- `reviewed_by` y `accepted_by` son identidades, y al restaurante no se le
-- dice quién revisó su invitación (RN-PAN-15, igual que RN-ACC-07 y
-- RN-PLA-07). Se cierra con privilegio de columna, que es el único
-- mecanismo que distingue columnas.
--
-- Consecuencia práctica: `select *` sobre esta tabla devuelve 403, y toda
-- consulta tiene que enumerar columnas.
revoke select on public.establishment_invitations from anon, authenticated;
grant select (id, space_id, establishment_id, email, role, edit_establishment_data,
              view_billing, status, expires_at, reviewed_at, rejection_reason,
              accepted_at, created_at, updated_at)
  on public.establishment_invitations to authenticated;

-- El `token` tampoco se concede: es una credencial. Quien invita no lo
-- necesita —el enlace va por correo a quien se invita— y dárselo
-- convertiría la lista en un llavero.

-- ------------------------------------------------------------
-- 3 · Los estados, en una tabla de transiciones
-- ------------------------------------------------------------
--
-- Como los informes (RN-REP-08) y las solicitudes de espacio (RN-PLA-03),
-- y por lo mismo: comparaciones sueltas repartidas por cinco funciones se
-- contradicen en cuanto alguien añade un estado.
create or replace function public.establishment_invitation_transition_allowed(
  p_from text,
  p_to text,
  p_actor text
)
returns boolean
language sql
immutable
as $$
  select case
    -- El equipo del espacio decide sobre lo que manda un restaurante.
    when p_from = 'pending_review' and p_to in ('approved', 'rejected') then p_actor = 'team'
    -- Cancelar es de quien invitó, y también del equipo.
    when p_from in ('pending_review', 'approved') and p_to = 'cancelled'
      then p_actor in ('inviter', 'team')
    -- Aceptar la acepta quien la recibe, por el enlace.
    when p_from = 'approved' and p_to = 'accepted' then p_actor = 'invitee'
    -- Caducar no lo hace nadie: lo hace el tiempo.
    when p_from = 'approved' and p_to = 'expired' then p_actor = 'clock'
    else false
  end;
$$;

comment on function public.establishment_invitation_transition_allowed(text, text, text) is
  'RN-PAN-14 · los cinco estados de una invitación al panel y quién mueve
   cada uno. Lo que no está aquí no pasa: en la duda, false.';

revoke all on function public.establishment_invitation_transition_allowed(text, text, text)
  from public, anon;
grant execute on function public.establishment_invitation_transition_allowed(text, text, text)
  to authenticated;

-- El estado **vivo** de una invitación: `approved` con la fecha pasada ya
-- no vale, aunque la columna siga diciendo `approved`. Se deriva y no se
-- guarda (RN-DAT-05), como `charge_status()`: un barrido que marcara
-- `expired` a mano dejaría una ventana en la que el enlace sigue abierto.
create or replace function public.establishment_invitation_status(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when i.status = 'approved' and i.expires_at is not null and i.expires_at <= now()
      then 'expired'
    else i.status
  end
  from public.establishment_invitations i
  where i.id = p_id
    -- Es `SECURITY DEFINER`, así que salta la RLS de la tabla y tiene que
    -- traerse su propia comprobación: sin esto, cualquiera con sesión
    -- sabría el estado de cualquier invitación con solo tener su id. Son
    -- las mismas dos ramas que `establishment_invitations_select`, y lo
    -- cazó el barrido en falso-cerrado de la suite 7.
    and (
      public.has_capability(i.space_id, 'manage_clients')
      or public.client_permission(i.establishment_id, 'manage_users')
    );
$$;

comment on function public.establishment_invitation_status(uuid) is
  'RN-PAN-14 · el estado vivo. `approved` con la fecha pasada es
   `expired`, se derive cuando se derive: un estado caducado no espera a
   que pase un barrido.';

revoke all on function public.establishment_invitation_status(uuid) from public, anon;
grant execute on function public.establishment_invitation_status(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4 · El aviso nuevo
-- ------------------------------------------------------------
--
-- Dos audiencias distintas: al equipo se le dice que hay una invitación
-- que mirar; a quien invitó, en qué quedó.
-- La lista se copia **entera de la definición viva**, no de memoria: ya
-- se ha reescrito varias veces y teclearla a mano se come los tipos que
-- añadieron las migraciones de en medio. Lo único nuevo son las dos
-- últimas líneas.
alter table public.notifications drop constraint if exists notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
  check (event_type in (
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
    'absence_uncovered_jobs', 'establishment_access_granted',
    -- RN-PAN-14 · la invitación al panel: una para el equipo, que tiene
    -- que mirarla, y una para quien invitó, que espera respuesta.
    'panel_invitation_pending_review',
    'panel_invitation_decided'
  ));

-- ------------------------------------------------------------
-- 4 bis · Los eventos de estado admiten la invitación
-- ------------------------------------------------------------
--
-- `record_state_event()` escribe en `state_events`, cuyo `entity_type`
-- tiene su propia lista cerrada. Sin esto, cada movimiento de una
-- invitación falla al intentar dejar su evento — y CLAUDE.md exige que
-- todo cambio de estado deje uno.
--
-- La lista se copia entera de la definición viva, por lo mismo que la de
-- `notifications`: reescribirla de memoria se come lo que añadió otra
-- migración.
alter table public.state_events drop constraint if exists state_events_entity_type_check;
alter table public.state_events add constraint state_events_entity_type_check
  check (entity_type in (
    'job', 'task', 'establishment', 'opportunity', 'report', 'space',
    -- RN-PAN-14 (migración 114).
    'establishment_invitation'
  ));

-- ------------------------------------------------------------
-- 5 · Invitar (RN-PAN-14)
-- ------------------------------------------------------------
--
-- La puerta de entrada, y **decide ella sola cuál de los dos caminos
-- toca**: quien llama no elige si crea una invitación o da el acceso, solo
-- dice a quién quiere meter. Así la pantalla no puede equivocarse.
--
-- Devuelve el id de la invitación, o `null` cuando el correo ya tenía
-- cuenta y el acceso se dio en el momento.
create or replace function public.invite_to_establishment_panel(
  p_establishment_id uuid,
  p_email text,
  p_role text,
  p_edit_establishment_data boolean default false,
  p_view_billing boolean default false,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  -- valga: meter a alguien que ya está dentro de Cuotly nunca necesitó
  -- permiso de nadie (RN-PAN-14).
  select id into v_user_id from public.profiles where lower(email) = v_email;
  if v_user_id is not null then
    perform public.grant_establishment_access(
      p_establishment_id, v_email, p_role, p_edit_establishment_data, p_view_billing);
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
    status, expires_at, invited_by, reviewed_by, reviewed_at, idempotency_key
  )
  values (
    v_space_id, p_establishment_id, v_email, p_role,
    -- RN-EST-11 · un propietario del restaurante los lleva los dos; los
    -- finos solo se eligen para un Editor.
    case when p_role = 'local_owner' then true else coalesce(p_edit_establishment_data, false) end,
    case when p_role = 'local_owner' then true else coalesce(p_view_billing, false) end,
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
                             'status', v_estado));

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
$$;

comment on function public.invite_to_establishment_panel(uuid, text, text, boolean, boolean, text) is
  'RN-ACC-13, RN-PAN-14 · invita a alguien al panel de un restaurante.
   Decide ella sola el camino: con cuenta da el acceso en el momento y
   devuelve null; sin cuenta crea la invitación, aprobada si la manda el
   equipo y pendiente de revisión si la manda el restaurante.';

revoke all on function public.invite_to_establishment_panel(uuid, text, text, boolean, boolean, text)
  from public, anon;
grant execute on function public.invite_to_establishment_panel(uuid, text, text, boolean, boolean, text)
  to authenticated;

-- ------------------------------------------------------------
-- 6 · Revisarla: aprobar o rechazar (RN-PAN-14)
-- ------------------------------------------------------------
--
-- Es lo que Bosco pidió: *"el restaurante invita, tú apruebas"*. Solo el
-- equipo del espacio, y solo sobre lo que está pendiente.
create or replace function public.review_establishment_invitation(
  p_invitation_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.establishment_invitations;
  v_destino text;
  v_motivo text := nullif(btrim(coalesce(p_reason, '')), '');
  v_slug text;
begin
  select * into v_inv
  from public.establishment_invitations
  where id = p_invitation_id
  for update;

  if v_inv.id is null then
    raise exception 'Invitación no encontrada';
  end if;

  if not public.has_capability(v_inv.space_id, 'manage_clients') then
    raise exception 'Solo el equipo del espacio revisa una invitación al panel';
  end if;

  v_destino := case when p_approve then 'approved' else 'rejected' end;

  -- CA-17 · revisarla dos veces con la misma respuesta no vuelve a
  -- avisar ni mueve la caducidad. Con otra distinta, falla abajo.
  if v_inv.status = v_destino then
    return v_destino;
  end if;

  if not public.establishment_invitation_transition_allowed(v_inv.status, v_destino, 'team') then
    raise exception 'Una invitación en % no se puede %', v_inv.status,
      case when p_approve then 'aprobar' else 'rechazar' end;
  end if;

  if not p_approve and v_motivo is null then
    -- Un rechazo sin motivo no le dice nada a quien invitó, y quien invitó
    -- tiene que poder arreglarlo o explicárselo a su gente.
    raise exception 'Un rechazo lleva motivo';
  end if;

  update public.establishment_invitations
  set status = v_destino,
      -- RN-PAN-14 · los siete días empiezan AQUÍ, no cuando se mandó.
      expires_at = case when p_approve then now() + interval '7 days' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case when p_approve then null else v_motivo end,
      updated_at = now()
  where id = p_invitation_id;

  perform public.record_state_event(
    v_inv.space_id, 'establishment_invitation', p_invitation_id, v_inv.status, v_destino, v_motivo);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id,
                                old_value, new_value, reason)
  values (v_inv.space_id, auth.uid(), 'panel_invitation.reviewed', 'establishment_invitation',
          p_invitation_id, jsonb_build_object('status', v_inv.status),
          jsonb_build_object('status', v_destino), v_motivo);

  -- A quien invitó se le dice en qué quedó. RN-PAN-15 · el aviso NO dice
  -- quién la revisó: eso sale de la auditoría, que es del equipo.
  select slug into v_slug from public.spaces where id = v_inv.space_id;
  perform public.emit_notification(
    v_inv.space_id, v_inv.invited_by, 'panel_invitation_decided', 'client',
    'establishment_invitation', p_invitation_id,
    '/espacios/' || v_slug || '/restaurantes/' || v_inv.establishment_id::text || '/usuarios',
    'panel_invitation_decided:' || p_invitation_id::text || ':' || v_destino,
    v_inv.establishment_id, null, null, true);

  return v_destino;
end;
$$;

comment on function public.review_establishment_invitation(uuid, boolean, text) is
  'RN-PAN-14 · el equipo del espacio aprueba o rechaza una invitación al
   panel. Aprobar arranca los siete días; rechazar exige motivo. A quien
   invitó se le dice en qué quedó, nunca quién lo decidió (RN-PAN-15).';

revoke all on function public.review_establishment_invitation(uuid, boolean, text)
  from public, anon;
grant execute on function public.review_establishment_invitation(uuid, boolean, text)
  to authenticated;

-- ------------------------------------------------------------
-- 7 · Cancelarla
-- ------------------------------------------------------------
--
-- De quien la mandó, y también del equipo. Mientras no se haya aceptado:
-- una invitación aceptada ya es un acceso, y los accesos se retiran con
-- `revoke_establishment_access()`, que es otra cosa y deja otro rastro.
create or replace function public.cancel_establishment_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.establishment_invitations;
  v_actor text;
begin
  select * into v_inv
  from public.establishment_invitations
  where id = p_invitation_id
  for update;

  if v_inv.id is null then
    raise exception 'Invitación no encontrada';
  end if;

  if public.has_capability(v_inv.space_id, 'manage_clients') then
    v_actor := 'team';
  elsif v_inv.invited_by = auth.uid()
        and public.client_permission(v_inv.establishment_id, 'manage_users') then
    v_actor := 'inviter';
  else
    raise exception 'No puedes cancelar esta invitación';
  end if;

  -- CA-17 · idempotente. Ya cancelada, o ya resuelta de otra forma: no se
  -- dice cuál, que sería contar por esta vía lo que la fila no enseña.
  if not public.establishment_invitation_transition_allowed(v_inv.status, 'cancelled', v_actor) then
    return false;
  end if;

  update public.establishment_invitations
  set status = 'cancelled', updated_at = now()
  where id = p_invitation_id;

  perform public.record_state_event(
    v_inv.space_id, 'establishment_invitation', p_invitation_id, v_inv.status, 'cancelled', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id,
                                old_value, new_value)
  values (v_inv.space_id, auth.uid(), 'panel_invitation.cancelled', 'establishment_invitation',
          p_invitation_id, jsonb_build_object('status', v_inv.status),
          jsonb_build_object('status', 'cancelled'));

  return true;
end;
$$;

comment on function public.cancel_establishment_invitation(uuid) is
  'RN-PAN-14 · cancela una invitación que todavía no se ha aceptado. De
   quien la mandó o del equipo. Idempotente: cancelar lo ya resuelto
   devuelve false y no dice en qué quedó.';

revoke all on function public.cancel_establishment_invitation(uuid) from public, anon;
grant execute on function public.cancel_establishment_invitation(uuid) to authenticated;

-- ------------------------------------------------------------
-- 8 · El enlace: lo que ve la pantalla de alta (RN-ACC-13)
-- ------------------------------------------------------------
--
-- Abierta a `anon` **a propósito**: quien la abre todavía no tiene cuenta.
-- Por eso devuelve lo mínimo y **falla en silencio**: un enlace gastado,
-- caducado o inventado no dice el correo ni el restaurante, solo el
-- motivo. Si dijera el correo, sería un comprobador de direcciones.
create or replace function public.establishment_invitation_details(p_token uuid)
returns table (email text, establishment_name text, state text)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when i.status = 'approved' and i.expires_at > now() then i.email end,
    case when i.status = 'approved' and i.expires_at > now() then e.name end,
    case
      when i.status = 'accepted' then 'used'
      when i.status in ('rejected', 'cancelled') then 'void'
      when i.status = 'pending_review' then 'pending_review'
      when i.expires_at is not null and i.expires_at <= now() then 'expired'
      when i.status = 'approved' then 'valid'
      else 'void'
    end
  from public.establishment_invitations i
  join public.establishments e on e.id = i.establishment_id
  where i.token = p_token;
$$;

comment on function public.establishment_invitation_details(uuid) is
  'RN-ACC-13 · lo que la pantalla de alta necesita del enlace. Un enlace
   que no vale no devuelve el correo ni el restaurante: solo el motivo, o
   sería un comprobador de direcciones abierto.';

revoke all on function public.establishment_invitation_details(uuid) from public;
grant execute on function public.establishment_invitation_details(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 9 · Gastar el enlace: la cuenta entra en su panel (RN-ACC-13)
-- ------------------------------------------------------------
--
-- Reservada a `service_role`. La llama el servidor **después** de crear la
-- cuenta con la API de administración, en la misma acción, igual que
-- `consume_account_setup_token()` de la migración 97. Falla cerrado: si el
-- enlace se gastó, caducó o el correo no es el de la cuenta recién creada,
-- no marca nada y el servidor deshace el alta.
--
-- Da el acceso **por dentro** y no llamando a `grant_establishment_access()`:
-- aquella comprueba los permisos de `auth.uid()`, y aquí no hay sesión de
-- nadie con permisos — hay un servidor cumpliendo lo que ya se aprobó.
create or replace function public.consume_establishment_invitation(
  p_token uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
    (establishment_membership_id, edit_establishment_data, view_billing)
  values (v_membership_id, v_inv.edit_establishment_data, v_inv.view_billing)
  on conflict (establishment_membership_id) do update
    set edit_establishment_data = excluded.edit_establishment_data,
        view_billing = excluded.view_billing;

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
$$;

comment on function public.consume_establishment_invitation(uuid, uuid) is
  'RN-ACC-13, RN-PAN-14 · gasta el enlace y mete la cuenta recién creada
   en su panel, con el rol y los permisos que se APROBARON. Reservada a
   `service_role`: es la mitad del servidor de la tercera puerta.';

revoke all on function public.consume_establishment_invitation(uuid, uuid)
  from public, anon, authenticated;


-- ------------------------------------------------------------
-- 10 · Qué pasa si el restaurante cambia de espacio (RN-TRA-13)
-- ------------------------------------------------------------
--
-- **Se queda**, como `worker_establishments`, y por la misma razón: una
-- invitación la autorizó el espacio de ORIGEN y la aprobó su equipo. Si
-- viajara, alguien podría gastarla y entrar en un restaurante que ya es de
-- otro —con una cuenta creada por decisión de un espacio que ya no manda
-- ahí—, y si estaba pendiente, el destino heredaría una petición que nunca
-- ha visto.
--
-- Quedarse deja la fila como historia de lo que hizo el origen, que es lo
-- que un libro de invitaciones tiene que contar.
create or replace function public.establishment_transfer_tables()
returns table (table_name text, travels boolean)
language sql
immutable
as $$
  select * from (values
    -- Viaja: el trabajo del restaurante.
    ('requests', true), ('request_attachments', true),
    ('jobs', true), ('tasks', true), ('corrections', true),
    ('conversations', true), ('files', true),
    ('menus', true), ('menu_templates', true), ('menu_publications', true),
    ('menu_corrections', true), ('menu_downloads', true),
    ('integrations', true), ('metric_points', true), ('sync_runs', true),
    ('opportunities', true), ('opportunity_detections', true), ('opportunity_notes', true),
    ('reports', true),
    ('establishment_notes', true), ('internal_notes', true),
    -- Se queda: el dinero y el plan que cobró el origen (RN-TRA-04),
    -- sus ciclos de consumo (RN-TRA-12), lo que se le aceptó a él y los
    -- avisos que recibió su equipo.
    ('charges', false), ('payments', false), ('receipts', false),
    ('financial_entries', false), ('quotes', false),
    ('subscriptions', false), ('plan_commitments', false), ('scheduled_plan_changes', false),
    ('consumption_cycles', false), ('consumption_entries', false),
    ('menu_update_cycles', false), ('menu_update_entries', false),
    ('acceptances', false), ('terms_acceptances', false),
    ('space_exports', false), ('notifications', false),
    -- Las copias son del espacio que las hizo: llevan dentro material de
    -- SU equipo —conversaciones internas incluidas— y quien lo generó
    -- responde de ello. El destino empieza a hacer las suyas al día
    -- siguiente, con el barrido de RN-BCK-02.
    ('establishment_backups', false),
    -- Se queda y además se retira: RN-TRA-08, el acceso del EQUIPO de
    -- origen no significa nada en otro espacio, y dejarlo vivo sería una
    -- puerta abierta a un restaurante que ya no es suyo.
    ('worker_establishments', false),
    -- RN-ACC-13 (migración 114) · se queda, y además deja de poder
    -- gastarse: lo garantiza la comprobación de espacio de
    -- `consume_establishment_invitation()`, no esta lista.
    ('establishment_invitations', false)
  ) as t(table_name, travels);
$$;

comment on function public.establishment_transfer_tables() is
  'RN-TRA-13 · qué viaja y qué se queda, declarado en un sitio para que la
   suite pueda barrerlo. Solo cubre las tablas con `space_id` Y
   `establishment_id`.';
