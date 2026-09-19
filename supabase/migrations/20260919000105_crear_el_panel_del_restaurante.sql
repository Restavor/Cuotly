-- ============================================================
-- Migración 105 · Crear el panel del restaurante (RN-PAN-09 a 13, decisión 48)
-- ============================================================
--
-- El diseño definitivo móvil dibuja el panel como algo que **se crea**: la
-- ficha dice "Panel del restaurante · No creado" y la página 56 es el
-- formulario. Hasta ahora el panel no se creaba: existía en cuanto alguien
-- del lado cliente tenía acceso.
--
-- **Esta migración NO añade ninguna columna de estado, y eso es la mitad
-- de la decisión.** "Panel creado" se DERIVA de que haya un acceso vivo
-- (RN-PAN-09). Una bandera `panel_created_at` puede quedarse en `true` con
-- todos los accesos revocados, y entonces la ficha diría "panel creado"
-- mientras nadie puede entrar. Tener panel **es** que alguien pueda
-- entrar. El "cuándo" ya está en `audit_log`.
--
-- Lo único que falta del lado del servidor es el aviso: hasta hoy se daba
-- acceso a un restaurante **en silencio** y quien lo recibía se enteraba
-- entrando. El diseño dice "Se enviará una invitación con las
-- instrucciones de acceso", y eso es esto (RN-PAN-12).

-- ------------------------------------------------------------
-- 1 · El tipo de aviso
-- ------------------------------------------------------------
alter table public.notifications
  drop constraint notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check check (event_type in (
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
    'absence_uncovered_jobs',
    -- RN-PAN-12 · la "invitación con las instrucciones de acceso" de la
    -- página 56 del diseño.
    'establishment_access_granted'
  ));

-- ------------------------------------------------------------
-- 2 · Dar acceso avisa a quien lo recibe (RN-PAN-12)
-- ------------------------------------------------------------
--
-- El resto de la función no cambia: mismos permisos, mismo tratamiento de
-- quien ya tuvo acceso —se reactiva su membresía y no se crea otra, porque
-- su actividad histórica cuelga de ella (RN-EST-05)— y misma auditoría. Lo
-- que se añade es el `emit_notification` del final.
create or replace function public.grant_establishment_access(
  p_establishment_id uuid,
  p_email text,
  p_role text,
  p_edit_establishment_data boolean default false,
  p_view_billing boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_user_id uuid;
  v_membership_id uuid;
  v_previo public.establishment_memberships;
  v_edit boolean;
  v_billing boolean;
  v_slug text;
  v_tenia boolean;
begin
  v_space_id := public.establishment_space_id(p_establishment_id);

  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden dar acceso a un restaurante';
  end if;

  if p_role not in ('local_owner', 'editor', 'consulta') then
    raise exception 'El rol tiene que ser propietario local, editor o consulta';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(btrim(coalesce(p_email, '')));

  if v_user_id is null then
    -- No se crea nada a medias: en Cuotly se invita al espacio, no a un
    -- restaurante (HU-03), y una membresía apuntando a alguien que no
    -- existe no es un acceso, es una fila rota.
    raise exception 'No hay ninguna cuenta de Cuotly con ese correo: esta pantalla añade a quien ya existe';
  end if;

  -- RN-EST-11 y RN-FIN-07 · los permisos finos solo los elige un Editor.
  if p_role = 'local_owner' then
    v_edit := true;
    v_billing := true;
  elsif p_role = 'consulta' then
    v_edit := false;
    v_billing := false;
  else
    v_edit := coalesce(p_edit_establishment_data, false);
    v_billing := coalesce(p_view_billing, false);
  end if;

  select * into v_previo
  from public.establishment_memberships
  where establishment_id = p_establishment_id and user_id = v_user_id
  for update;

  v_tenia := v_previo.id is not null and v_previo.revoked_at is null;

  if v_previo.id is null then
    insert into public.establishment_memberships (establishment_id, user_id, role)
    values (p_establishment_id, v_user_id, p_role)
    returning id into v_membership_id;
  else
    -- Devolverle el acceso a quien lo tuvo NO es una fila nueva: la tabla
    -- tiene `unique (establishment_id, user_id)` y, sobre todo, la
    -- actividad histórica de esa persona cuelga de esta misma membresía
    -- (RN-EST-05). Se reactiva y se le pone el rol que se pide.
    v_membership_id := v_previo.id;
    update public.establishment_memberships
    set revoked_at = null, revoked_by = null, role = p_role
    where id = v_membership_id;
  end if;

  insert into public.establishment_permissions
    (establishment_membership_id, edit_establishment_data, view_billing)
  values (v_membership_id, v_edit, v_billing)
  on conflict (establishment_membership_id) do update
    set edit_establishment_data = excluded.edit_establishment_data,
        view_billing = excluded.view_billing;

  insert into public.audit_log
    (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'establishment_access.granted', 'establishment', p_establishment_id,
    case
      when v_previo.id is null then jsonb_build_object('user_id', v_user_id, 'had_access', false)
      else jsonb_build_object('user_id', v_user_id, 'had_access', v_previo.revoked_at is null,
                              'role', v_previo.role)
    end,
    jsonb_build_object('user_id', v_user_id, 'had_access', true, 'role', p_role,
                       'edit_establishment_data', v_edit, 'view_billing', v_billing)
  );

  -- RN-PAN-12 · se avisa a quien RECIBE el acceso, no al equipo: es quien
  -- tiene algo que hacer con esto.
  --
  -- A quien ya lo tenía no se le avisa: cambiarle el rol o repasarle los
  -- permisos no es "te han dado acceso", y pulsar Guardar dos veces en la
  -- pantalla de accesos no puede mandarle dos correos (CLAUDE.md: pulsar
  -- dos veces nunca duplica el efecto).
  --
  -- **La clave de deduplicación es de un solo uso a propósito**, y esto
  -- tiene dos historias detrás que conviene no repetir.
  --
  -- La primera versión llevaba `…:<restaurante>:<persona>` y la suite 54 la
  -- tumbó: a quien se le revocaba el acceso y luego se le devolvía **no se
  -- le avisaba**, porque la clave seguía gastada del primer aviso. Se
  -- habría quedado sin saber que puede volver a entrar.
  --
  -- La segunda versión la puso a `null`, y eso es peor: `dedupe_key` es
  -- **NOT NULL**, y `emit_notification()` se traga el fallo —su
  -- `on conflict ... do nothing` lo absorbe— y devuelve `null` **sin dar
  -- error**. El aviso no se crea y nada lo dice. Si alguna vez un aviso no
  -- aparece y no hay error en ningún sitio, mira esto primero.
  --
  -- Lo que de verdad impide el doble aviso no es la clave: es `v_tenia`,
  -- que se lee **dentro del `for update`** de la membresía, así que dos
  -- llamadas a la vez se ponen en fila y solo una ve el paso de "sin
  -- acceso" a "con acceso". Las claves sirven a los barridos, que se
  -- repiten solos; esto no se repite solo, lo pulsa una persona.
  if not v_tenia then
    select slug into v_slug from public.spaces where id = v_space_id;

    perform public.emit_notification(
      v_space_id, v_user_id, 'establishment_access_granted', 'client',
      'establishment', p_establishment_id,
      '/espacios/' || v_slug || '/restaurantes/' || p_establishment_id::text,
      'establishment_access_granted:' || gen_random_uuid()::text,
      p_establishment_id, null, null, true);
  end if;

  return v_membership_id;
end;
$$;

comment on function public.grant_establishment_access(uuid, text, text, boolean, boolean) is
  'RN-EST-11, RN-PAN-10/12 · da acceso a un restaurante a quien YA tiene
   cuenta en Cuotly, y le avisa la primera vez. Dárselo a la primera
   persona es lo que el diseño llama "crear el panel": no hay panel sin
   alguien que pueda entrar (RN-PAN-09).';

revoke all on function public.grant_establishment_access(uuid, text, text, boolean, boolean)
  from public, anon;
grant execute on function public.grant_establishment_access(uuid, text, text, boolean, boolean)
  to authenticated;
