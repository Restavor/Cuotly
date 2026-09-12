-- El aviso que faltaba: publicar condiciones nuevas avisa al restaurante.
--
-- Decisión de Bosco (12/09/2026), literal: "El equipo de mantenimiento
-- pulsará un botón cuando lo haya publicado y le llegará un push al
-- restaurante".
--
-- **El hueco que cierra.** La migración 75 dejó escrito que publicar una
-- versión nueva de las condiciones no avisaba a nadie, y la pantalla de
-- publicar lo decía. Un restaurante que había aceptado la v1 pasaba a
-- tener la v2 pendiente sin enterarse hasta que entrara a mirar su ficha.
--
-- **El botón es el de publicar.** No se añade un segundo botón "Avisar":
-- publicar es el único acto que deja al restaurante con algo pendiente,
-- y un aviso que hay que acordarse de mandar es un aviso que un día no
-- se manda. Es el mismo criterio que llevó el llenado de la cola dentro
-- de `runScheduledJobs()` (decisión 15).
--
-- **"Push" en Fase 1 son los dos canales del §18**: el centro de avisos
-- dentro de Cuotly y el correo. El push de verdad llega con la app móvil
-- (Fase 4, §18 y §24.1), y cuando llegue saldrá de la misma fila de
-- `notifications` que esto escribe: no hay que tocar nada aquí.
--
-- **A quién.** A quien puede aceptarlas por el restaurante: su
-- propietario local y el propietario global de su grupo — la misma lista
-- que `client_can_accept_terms()`, porque el aviso pide una acción y
-- mandárselo a quien no puede hacerla (un Editor, Consulta) es ruido. Un
-- aviso por restaurante con suscripción ACTIVA a ese plan o servicio; un
-- propietario global con tres restaurantes en el mismo plan recibe tres,
-- porque son tres aceptaciones distintas. Nadie del equipo: es quien
-- acaba de publicar.
--
-- **La clave de deduplicación lleva la versión y el restaurante.** Cada
-- publicación es una versión nueva y necesita su aviso; lo que no puede
-- pasar es que la misma versión avise dos veces al mismo restaurante.
--
-- Se comprueba con `supabase/tests/el_aviso_de_las_condiciones_nuevas.sql`.

-- ------------------------------------------------------------
-- 1 · El catálogo de eventos admite el nuevo
-- ------------------------------------------------------------
--
-- Este CHECK está duplicado a propósito en `src/core/notifications.ts`
-- (NOTIFICATION_EVENTS); que no se separen lo comprueba
-- `listas-compartidas.test.ts`, que lee la ÚLTIMA definición.
alter table public.notifications
  drop constraint notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check check (event_type in (
    'request_submitted',
    'job_unassigned',
    'job_assigned',
    'job_started',
    'job_published',
    'correction_requested',
    'job_reassignment_requested',
    'task_reassignment_requested',
    'terms_version_published',
    'consumption_threshold_80',
    'consumption_threshold_100',
    't2_threshold_50',
    't2_threshold_80',
    't2_threshold_100',
    't2_critical_alert',
    't2_reassignment_suggestion',
    't3_threshold_75',
    't3_threshold_90',
    't3_threshold_100',
    'establishment_paused_nonpayment',
    'establishment_suspended_nonpayment',
    'establishment_reactivated',
    'absence_requested',
    'absence_decided',
    'absence_uncovered_jobs'
  ));

-- ------------------------------------------------------------
-- 2 · Quién recibe el aviso de una versión nueva, en un solo sitio
-- ------------------------------------------------------------
--
-- Interna: la llaman las dos funciones de publicar y nadie más. Sin
-- `EXECUTE` para nadie por RPC (CLAUDE.md): quien pudiera llamarla
-- suelta mandaría avisos de una versión que no ha publicado.
--
-- El enlace apunta a la ficha del restaurante, que es donde vive el
-- botón "Acepto la versión N" para su propietario (RN-NOT-04). Audiencia
-- `client`: el texto se redacta para quien tiene que aceptar.
create or replace function public.notify_terms_version_published(
  p_space_id uuid,
  p_kind text,
  p_subject_id uuid,
  p_version_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_sub record;
  v_recipient uuid;
  v_sent integer := 0;
begin
  if p_kind not in ('plan', 'service') then
    raise exception 'Tipo de condiciones desconocido: %', p_kind;
  end if;

  v_slug := public.space_slug(p_space_id);

  for v_sub in
    select s.id, s.establishment_id
    from public.subscriptions s
    where s.space_id = p_space_id
      and s.status = 'active'
      and s.kind = p_kind
      and ((p_kind = 'plan' and s.plan_id = p_subject_id)
        or (p_kind = 'service' and s.service_id = p_subject_id))
  loop
    for v_recipient in
      -- La misma lista que `client_can_accept_terms()`, para todos en vez
      -- de para quien pregunta: propietario local del restaurante y
      -- propietario global de su grupo. RN-EST-05: a quien se le retiró
      -- el acceso no se le avisa.
      select em.user_id
      from public.establishment_memberships em
      where em.establishment_id = v_sub.establishment_id
        and em.revoked_at is null
        and em.role = 'local_owner'
      union
      select gm.user_id
      from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = v_sub.establishment_id
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    loop
      if public.emit_notification(
           p_space_id, v_recipient, 'terms_version_published', 'client',
           'establishment', v_sub.establishment_id,
           '/espacios/' || v_slug || '/restaurantes/' || v_sub.establishment_id::text,
           'terms_version_published:' || p_version_id::text || ':' || v_sub.establishment_id::text,
           v_sub.establishment_id) is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end loop;

  return v_sent;
end;
$$;

comment on function public.notify_terms_version_published(uuid, text, uuid, uuid) is
  'Avisa de una versión nueva de las condiciones a quien puede aceptarla
   por cada restaurante con suscripción activa a ese plan o servicio:
   propietario local y propietario global del grupo (decisión de Bosco,
   12/09/2026). Audiencia `client`; nadie del equipo, que es quien
   publica. En Fase 1 el aviso sale por el centro de Cuotly y por correo;
   el push llega con la app móvil (Fase 4).';

revoke all on function public.notify_terms_version_published(uuid, text, uuid, uuid)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3 · Publicar las de un plan, ahora con el aviso al final
-- ------------------------------------------------------------
--
-- Igual que en la 75; lo único que cambia es la última línea. El aviso
-- va DESPUÉS del apunte de auditoría: si publicar fallara, no habría
-- avisado de nada. Y `emit_notification()` se traga sus propios errores
-- (RN-NOT-05): un aviso que no se puede escribir nunca deshace la
-- publicación.
create or replace function public.publish_plan_conditions(p_plan_id uuid, p_conditions text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_previous integer;
  v_version_id uuid;
begin
  select space_id into v_space_id from public.plans where id = p_plan_id for update;

  if v_space_id is null then
    raise exception 'Plan no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio publica las condiciones de un plan';
  end if;

  if length(btrim(coalesce(p_conditions, ''))) = 0 then
    raise exception 'Las condiciones no pueden estar vacías';
  end if;

  select max(version) into v_previous from public.plan_versions where plan_id = p_plan_id;

  insert into public.plan_versions (space_id, plan_id, version, conditions, published_by)
  values (v_space_id, p_plan_id, coalesce(v_previous, 0) + 1, p_conditions, auth.uid())
  returning id into v_version_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'plan.conditions_published', 'plan', p_plan_id,
    jsonb_build_object('version', v_previous),
    jsonb_build_object('version', coalesce(v_previous, 0) + 1, 'version_id', v_version_id)
  );

  perform public.notify_terms_version_published(v_space_id, 'plan', p_plan_id, v_version_id);

  return v_version_id;
end;
$$;

comment on function public.publish_plan_conditions(uuid, text) is
  'RN-DAT-07 · publica una versión nueva de las condiciones de un plan.
   Nunca edita la anterior. Solo `manage_space`. Avisa a quien puede
   aceptarla por cada restaurante con ese plan (migración 76).';

-- ------------------------------------------------------------
-- 4 · Y las de un servicio
-- ------------------------------------------------------------
create or replace function public.publish_service_conditions(p_service_id uuid, p_conditions text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_previous integer;
  v_version_id uuid;
begin
  select space_id into v_space_id from public.services where id = p_service_id for update;

  if v_space_id is null then
    raise exception 'Servicio no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio publica las condiciones de un servicio';
  end if;

  if length(btrim(coalesce(p_conditions, ''))) = 0 then
    raise exception 'Las condiciones no pueden estar vacías';
  end if;

  select max(version) into v_previous from public.service_versions where service_id = p_service_id;

  insert into public.service_versions (space_id, service_id, version, conditions, published_by)
  values (v_space_id, p_service_id, coalesce(v_previous, 0) + 1, p_conditions, auth.uid())
  returning id into v_version_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'service.conditions_published', 'service', p_service_id,
    jsonb_build_object('version', v_previous),
    jsonb_build_object('version', coalesce(v_previous, 0) + 1, 'version_id', v_version_id)
  );

  perform public.notify_terms_version_published(v_space_id, 'service', p_service_id, v_version_id);

  return v_version_id;
end;
$$;

comment on function public.publish_service_conditions(uuid, text) is
  'RN-DAT-07 · publica una versión nueva de las condiciones de un servicio.
   Nunca edita la anterior. Solo `manage_space`. Avisa a quien puede
   aceptarla por cada restaurante con ese servicio (migración 76).';

-- Los privilegios, restablecidos a mano. `create or replace` los conserva,
-- pero escribirlos aquí es lo que hace que la migración diga la verdad
-- entera si alguien la lee dentro de un año.
revoke all on function public.publish_plan_conditions(uuid, text) from public, anon;
grant execute on function public.publish_plan_conditions(uuid, text) to authenticated;
revoke all on function public.publish_service_conditions(uuid, text) from public, anon;
grant execute on function public.publish_service_conditions(uuid, text) to authenticated;
