-- Fase 3 · Hito 16 · el trabajador autorizado en un restaurante lleva sus
-- informes (decisión 79, PRD RN-REP-31; enmienda RN-REP-01 y RN-REP-08).
--
-- Bosco, 25/09/2026: "quien también puede acceder es el trabajador de ese
-- restaurante". Preguntado: genera, revisa y SUBE; son los AUTORIZADOS en
-- ese restaurante; y ve TODOS los informes de ese restaurante, los de
-- finanzas incluidos. Los consolidados, no: son del espacio (decisión 30).
--
-- Cómo se hace, y por qué así:
--
--   1 · `is_report_worker(space, restaurante)` dice si quien pregunta es
--       ese trabajador: miembro ACTIVO del espacio como trabajador y
--       autorizado en el restaurante sin revocar. Quitarle cualquiera de
--       las dos cosas le quita los informes en ese momento (RN-EST-05).
--   2 · `report_actor_role_for(informe)` es `report_actor_role()` mirando
--       también el restaurante del informe: al trabajador autorizado le
--       contesta 'approver' en los informes de ese restaurante. Así las
--       funciones de estado, programar, enviar y subir no se duplican:
--       cambia a quién le preguntan, no lo que hacen.
--   3 · `report_can_prepare(...)` sustituye a `has_capability(...,
--       'manage_clients')` en las que preparan y editan.
--   4 · Las cinco políticas de lectura suman al trabajador autorizado.
--
-- Las funciones se redefinen enteras (CLAUDE.md: la 85, 86, 111 y 137 ya
-- están aplicadas y no se tocan). El único cambio en cada una es la línea
-- que decide quién puede; el resto es copia de su última definición.

-- ============================================================
-- 1 · Quién es "el trabajador de ese restaurante"
-- ============================================================
create or replace function public.is_report_worker(p_space_id uuid, p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_establishment_id is not null
    and exists (
      select 1 from public.space_memberships sm
      where sm.space_id = p_space_id
        and sm.user_id = auth.uid()
        and sm.role = 'worker'
        and sm.status = 'active'
    )
    and exists (
      select 1 from public.establishments e
      where e.id = p_establishment_id and e.space_id = p_space_id
    )
    and public.is_authorized_worker_establishment(p_establishment_id);
$$;

comment on function public.is_report_worker(uuid, uuid) is
  'RN-REP-31 · quien pregunta es trabajador activo del espacio y está
   autorizado en ese restaurante. Vive en las políticas de los informes: se
   le revoca a anon y NO a authenticated (CLAUDE.md).';

revoke all on function public.is_report_worker(uuid, uuid) from public, anon;
grant execute on function public.is_report_worker(uuid, uuid) to authenticated;

-- Lo mismo, por informe: para las tablas que cuelgan de `reports` y no
-- llevan el restaurante. Comprueba la autorización aquí mismo (no a través
-- de `is_report_worker`) para que el barrido de funciones de `hito7` vea
-- la comprobación en su cuerpo.
create or replace function public.is_report_worker_for(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reports r
    join public.space_memberships sm
      on sm.space_id = r.space_id and sm.user_id = auth.uid()
     and sm.role = 'worker' and sm.status = 'active'
    where r.id = p_report_id
      and r.establishment_id is not null
      and public.is_authorized_worker_establishment(r.establishment_id)
  );
$$;

comment on function public.is_report_worker_for(uuid) is
  'RN-REP-31 · is_report_worker() por informe, para las políticas de
   report_sections, report_versions, report_deliveries y
   report_entry_texts. Un consolidado nunca: no tiene restaurante.';

revoke all on function public.is_report_worker_for(uuid) from public, anon;
grant execute on function public.is_report_worker_for(uuid) to authenticated;

-- Preparar y editar: quien gestiona la cartera, o el trabajador autorizado
-- en ese restaurante. Interna: solo la llaman las funciones de informes.
create or replace function public.report_can_prepare(p_space_id uuid, p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_capability(p_space_id, 'manage_clients')
      or public.is_report_worker(p_space_id, p_establishment_id);
$$;

revoke all on function public.report_can_prepare(uuid, uuid) from public, anon, authenticated;

create or replace function public.report_can_prepare_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.report_can_prepare(r.space_id, r.establishment_id)
    from public.reports r where r.id = p_report_id
  ), false);
$$;

revoke all on function public.report_can_prepare_report(uuid) from public, anon, authenticated;

-- `report_actor_role()` mirando el restaurante del informe. La cola (sin
-- sesión) sigue siendo 'approver', como decía la de la 85.
create or replace function public.report_actor_role_for(p_report_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then 'approver'
    else coalesce(
      public.report_actor_role(r.space_id),
      case when public.is_report_worker(r.space_id, r.establishment_id) then 'approver' end
    )
  end
  from public.reports r
  where r.id = p_report_id;
$$;

revoke all on function public.report_actor_role_for(uuid) from public, anon, authenticated;

-- ============================================================
-- 2 · Las funciones de informes preguntan por el informe, no por el espacio
-- ============================================================

-- RN-REP-31 · el trabajador autorizado prepara informes de su restaurante; un consolidado, no.
CREATE OR REPLACE FUNCTION public.create_report_draft(p_space_id uuid, p_category text, p_name text, p_period_start date, p_period_end date, p_establishment_id uuid DEFAULT NULL::uuid, p_group_id uuid DEFAULT NULL::uuid, p_filters jsonb DEFAULT '{}'::jsonb, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_report_id uuid;
  v_sections text[];
  v_section text;
  v_position integer := 0;
  -- RN-REP-15 · el nivel del plan del restaurante. Un consolidado no
  -- tiene restaurante y por tanto no tiene plan: se le da el nivel más
  -- alto, porque es del ESPACIO y no lo recibe ningún cliente
  -- (decisión 30). Limitarlo sería recortarle el informe al equipo.
  v_level text;
begin
  if not public.report_can_prepare(p_space_id, p_establishment_id) then
    raise exception 'Solo quien gestiona la cartera prepara informes';
  end if;

  if p_category not in ('operation', 'finance', 'digital') then
    raise exception 'Familia de informe desconocida: %', p_category;
  end if;
  v_sections := public.report_sections_catalogue();

  if p_period_end < p_period_start then
    raise exception 'El periodo del informe está al revés';
  end if;

  if p_establishment_id is not null
     and public.establishment_space_id(p_establishment_id) <> p_space_id then
    raise exception 'Ese restaurante no es de este espacio';
  end if;

  -- CA-17 · pulsarlo dos veces devuelve el mismo borrador.
  if p_idempotency_key is not null then
    select id into v_report_id
    from public.reports
    where space_id = p_space_id and idempotency_key = p_idempotency_key;

    if v_report_id is not null then
      return v_report_id;
    end if;
  end if;

  v_level := case
    when p_establishment_id is null then 'complete'
    else public.establishment_report_level(p_establishment_id)
  end;

  insert into public.reports (
    space_id, establishment_id, group_id, category, name, period_start, period_end,
    filters, status, idempotency_key, created_by, updated_by
  )
  values (
    p_space_id, p_establishment_id, p_group_id, p_category, btrim(p_name),
    p_period_start, p_period_end, coalesce(p_filters, '{}'::jsonb), 'preparing',
    p_idempotency_key, auth.uid(), auth.uid()
  )
  returning id into v_report_id;

  foreach v_section in array v_sections loop
    v_position := v_position + 1;
    insert into public.report_sections (space_id, report_id, section_key, position, included, updated_by)
    values (
      p_space_id, v_report_id, v_section, v_position,
      -- El resumen ejecutivo, la sección de su familia y los anexos, que
      -- es lo que dibuja la maqueta 10.04. Requerir criterio no es entrar
      -- apagado: el resumen entra marcado y lo escribe quien revisa.
      public.report_section_default_for_level(p_category, v_section, v_level),
      auth.uid()
    );
  end loop;

  perform public.record_state_event(p_space_id, 'report', v_report_id, null, 'preparing', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (p_space_id, auth.uid(), 'report.created', 'report', v_report_id,
          jsonb_build_object('category', p_category, 'establishment_id', p_establishment_id,
                             'period_start', p_period_start, 'period_end', p_period_end));

  return v_report_id;
end;
$function$;

-- RN-REP-31 · set_report_sections: quien prepara, por informe.
CREATE OR REPLACE FUNCTION public.set_report_sections(p_report_id uuid, p_sections jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_status text;
  v_establishment_id uuid;
  v_level text;
  v_allowed text[];
  v_item jsonb;
  v_key text;
  v_position integer := 0;
begin
  select space_id, status, establishment_id
  into v_space_id, v_status, v_establishment_id
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;

  if not public.report_can_prepare_report(p_report_id) then
    raise exception 'No puedes editar los informes de este espacio';
  end if;

  if v_status in ('sent', 'archived') then
    -- Lo enviado no se edita: una corrección es una versión nueva de otro
    -- informe, no un cambio retroactivo de lo que el cliente ya leyó (P4).
    raise exception 'Un informe % no se edita', v_status;
  end if;

  -- Cualquier sección del catálogo vale para cualquier informe: la
  -- maqueta dibuja uno de operación con "Rendimiento digital" dentro.
  v_allowed := public.report_sections_catalogue();
  v_level := case
    when v_establishment_id is null then 'complete'
    else public.establishment_report_level(v_establishment_id)
  end;

  for v_item in select * from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb)) loop
    v_key := v_item ->> 'key';
    if not (v_key = any (v_allowed)) then
      raise exception 'La sección % no existe', v_key;
    end if;

    -- RN-REP-15 · el nivel del plan es una BARRERA, no una sugerencia. Sin
    -- esto, marcar la casilla a mano le daría a un Básico el informe que
    -- no paga: preparar el borrador ya respeta el nivel, pero eso es el
    -- valor por omisión, no un control (CLAUDE.md).
    --
    -- Solo para informes de un restaurante: un consolidado es del espacio
    -- (decisión 30) y no hay plan que mirar.
    if v_establishment_id is not null
       and coalesce((v_item ->> 'included')::boolean, false)
       and not public.report_level_allows(v_level, v_key) then
      raise exception 'El plan de este restaurante no incluye la sección % en su informe', v_key;
    end if;
    v_position := v_position + 1;

    update public.report_sections
    set position = v_position,
        included = coalesce((v_item ->> 'included')::boolean, included),
        note = case when v_item ? 'note' then nullif(btrim(v_item ->> 'note'), '') else note end,
        updated_by = auth.uid(),
        updated_at = now()
    where report_id = p_report_id and section_key = v_key;
  end loop;

  -- RN-REP-09 · editar un informe aprobado o programado lo devuelve a
  -- revisión: un informe aprobado es un texto concreto, no una carpeta
  -- que sigue cambiando.
  if v_status in ('approved', 'scheduled') then
    update public.reports
    set status = 'pending_review',
        status_reason = 'Se editaron las secciones después de aprobar',
        approved_at = null,
        approved_by = null,
        scheduled_for = null,
        reminder_sent_at = null,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_report_id;

    perform public.record_state_event(v_space_id, 'report', p_report_id, v_status, 'pending_review',
                                      'Se editaron las secciones después de aprobar');
  else
    update public.reports
    set updated_by = auth.uid(), updated_at = now()
    where id = p_report_id;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'report.sections_changed', 'report', p_report_id, p_sections);
end;
$function$;

-- RN-REP-31 · rename_report: quien prepara, por informe.
CREATE OR REPLACE FUNCTION public.rename_report(p_report_id uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_before text;
begin
  select space_id, name into v_space_id, v_before
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;
  if not public.report_can_prepare_report(p_report_id) then
    raise exception 'No puedes editar los informes de este espacio';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'El informe necesita un nombre';
  end if;

  update public.reports
  set name = btrim(p_name), updated_by = auth.uid(), updated_at = now()
  where id = p_report_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'report.renamed', 'report', p_report_id,
          jsonb_build_object('name', v_before), jsonb_build_object('name', btrim(p_name)));
end;
$function$;

-- RN-REP-31 · set_report_entry_texts: quien prepara, por informe.
CREATE OR REPLACE FUNCTION public.set_report_entry_texts(p_report_id uuid, p_entries jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_status text;
  v_item jsonb;
  v_key text;
  v_title text;
  v_body text;
  v_before jsonb := '[]'::jsonb;
  v_after jsonb := '[]'::jsonb;
  v_old record;
  v_changed boolean := false;
begin
  select space_id, status into v_space_id, v_status
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;

  -- Los mismos que editan las secciones (RN-REP-08): quien gestiona la
  -- cartera. El trabajador no entra en los informes de un restaurante.
  if not public.report_can_prepare_report(p_report_id) then
    raise exception 'No puedes editar los informes de este espacio';
  end if;

  if v_status in ('sent', 'archived') then
    raise exception 'Un informe % no se edita', v_status;
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Los textos del informe llegan como una lista';
  end if;

  for v_item in select * from jsonb_array_elements(p_entries) loop
    v_key := v_item ->> 'key';
    if v_key is null or v_key !~ '^(change|entry):.+' or length(v_key) > 300 then
      raise exception 'Esa entrada del informe no existe';
    end if;
    v_title := nullif(btrim(coalesce(v_item ->> 'title', '')), '');
    v_body := nullif(btrim(coalesce(v_item ->> 'body', '')), '');

    select title, body into v_old
    from public.report_entry_texts
    where report_id = p_report_id and entry_key = v_key;

    if found then
      if v_old.title is not distinct from v_title and v_old.body is not distinct from v_body then
        continue;
      end if;
      v_before := v_before || jsonb_build_object('key', v_key, 'title', v_old.title, 'body', v_old.body);
      update public.report_entry_texts
      set title = v_title, body = v_body, updated_by = auth.uid(), updated_at = now()
      where report_id = p_report_id and entry_key = v_key;
    else
      -- Nada que guardar: no se crea una fila para decir "el original".
      if v_title is null and v_body is null then
        continue;
      end if;
      insert into public.report_entry_texts (space_id, report_id, entry_key, title, body, updated_by)
      values (v_space_id, p_report_id, v_key, v_title, v_body, auth.uid());
    end if;

    v_after := v_after || jsonb_build_object('key', v_key, 'title', v_title, 'body', v_body);
    v_changed := true;
  end loop;

  -- RN-DAT-09 · guardar lo mismo dos veces no escribe dos apuntes.
  if not v_changed then
    return;
  end if;

  -- RN-REP-09 · editar un informe aprobado lo devuelve a revisión: lo
  -- aprobado era un texto concreto y este ya es otro.
  if v_status in ('approved', 'scheduled') then
    update public.reports
    set status = 'pending_review',
        status_reason = 'Se editaron los textos después de aprobar',
        approved_at = null,
        approved_by = null,
        scheduled_for = null,
        reminder_sent_at = null,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_report_id;

    perform public.record_state_event(v_space_id, 'report', p_report_id, v_status, 'pending_review',
                                      'Se editaron los textos después de aprobar');
  else
    update public.reports
    set updated_by = auth.uid(), updated_at = now()
    where id = p_report_id;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'report.entry_texts_changed', 'report', p_report_id,
          jsonb_build_object('entries', v_before), jsonb_build_object('entries', v_after));
end;
$function$;

-- RN-REP-31 · generar una versión.
CREATE OR REPLACE FUNCTION public.generate_report_version(p_report_id uuid, p_snapshot jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_status text;
  v_next integer;
  v_version_id uuid;
begin
  select space_id, status into v_space_id, v_status
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;

  -- Lo llama el servidor con service_role (la cola) o una persona que
  -- gestiona la cartera desde la pantalla. Nadie más.
  if auth.uid() is not null and not public.report_can_prepare_report(p_report_id) then
    raise exception 'No puedes generar informes de este espacio';
  end if;

  if v_status in ('sent', 'archived') then
    raise exception 'Un informe % no se regenera', v_status;
  end if;

  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'La versión de un informe necesita sus cifras';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
  from public.report_versions where report_id = p_report_id;

  insert into public.report_versions (space_id, report_id, version_number, snapshot, generated_by)
  values (v_space_id, p_report_id, v_next, p_snapshot, auth.uid())
  returning id into v_version_id;

  update public.reports
  set updated_by = auth.uid(), updated_at = now()
  where id = p_report_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'report.version_generated', 'report', p_report_id,
          jsonb_build_object('version_number', v_next));

  return v_version_id;
end;
$function$;

-- RN-REP-31 · set_report_status: quién aprueba, por informe.
CREATE OR REPLACE FUNCTION public.set_report_status(p_report_id uuid, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_status text;
  v_actor text;
  v_sections_need_judgement boolean;
  v_versions integer;
begin
  select space_id, status into v_space_id, v_status
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;

  v_actor := public.report_actor_role_for(p_report_id);
  if v_actor is null then
    raise exception 'No tienes acceso a los informes de este espacio';
  end if;

  if v_status = p_status then
    return;
  end if;

  if not public.report_transition_allowed(v_status, p_status, v_actor) then
    raise exception 'No puedes pasar un informe de % a %', v_status, p_status;
  end if;

  if p_status in ('approved', 'scheduled', 'sent') then
    select count(*) into v_versions from public.report_versions where report_id = p_report_id;
    if v_versions = 0 then
      -- §95.1: primero los datos, luego la decisión. Aprobar un informe
      -- sin cifras sería aprobar un papel en blanco.
      raise exception 'Este informe todavía no tiene cifras generadas';
    end if;
  end if;

  if p_status = 'archived' and btrim(coalesce(p_reason, '')) = '' and v_status <> 'sent' then
    raise exception 'Archivar un informe sin enviar exige un motivo';
  end if;

  select exists (
    select 1 from public.report_sections s
    where s.report_id = p_report_id
      and s.included
      and public.report_section_requires_judgement(s.section_key)
  ) into v_sections_need_judgement;

  -- §95 · "Informes solo objetivos pueden enviarse automáticamente": de
  -- `preparing` a `scheduled` solo pasa el que no lleva criterio dentro.
  if v_status = 'preparing' and p_status = 'scheduled' and v_sections_need_judgement then
    raise exception 'Un informe con secciones que requieren criterio se aprueba antes de programarlo';
  end if;

  update public.reports
  set status = p_status,
      status_reason = p_reason,
      approved_at = case when p_status = 'approved' then now() else approved_at end,
      approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
      archived_at = case when p_status = 'archived' then now() else archived_at end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_report_id;

  perform public.record_state_event(v_space_id, 'report', p_report_id, v_status, p_status, p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'report.status_changed', 'report', p_report_id,
          jsonb_build_object('status', v_status), jsonb_build_object('status', p_status), p_reason);
end;
$function$;

-- RN-REP-31 · schedule_report: quién aprueba, por informe.
CREATE OR REPLACE FUNCTION public.schedule_report(p_report_id uuid, p_scheduled_for timestamp with time zone, p_channel text DEFAULT 'email'::text, p_include_csv boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_status text;
begin
  select space_id, status into v_space_id, v_status
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;

  if public.report_actor_role_for(p_report_id) <> 'approver' then
    raise exception 'Solo quien puede aprobar informes programa un envío';
  end if;

  if p_scheduled_for is null then
    raise exception 'Programar un envío necesita una fecha';
  end if;

  if p_channel not in ('none', 'email') then
    raise exception 'Canal de envío desconocido: %', p_channel;
  end if;

  update public.reports
  set scheduled_for = p_scheduled_for,
      delivery_channel = p_channel,
      include_csv = coalesce(p_include_csv, false),
      -- La fecha nueva vuelve a avisar: el aviso es de ESTA fecha.
      reminder_sent_at = case when scheduled_for is distinct from p_scheduled_for then null else reminder_sent_at end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_report_id;

  if v_status <> 'scheduled' then
    perform public.set_report_status(p_report_id, 'scheduled', null);
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'report.scheduled', 'report', p_report_id,
          jsonb_build_object('scheduled_for', p_scheduled_for, 'channel', p_channel,
                             'include_csv', coalesce(p_include_csv, false)));
end;
$function$;

-- RN-REP-31 · send_report: quién aprueba, por informe.
CREATE OR REPLACE FUNCTION public.send_report(p_report_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_report public.reports;
  v_version_id uuid;
  v_pending integer;
  v_slug text;
  v_link text;
  v_recipient record;
  v_sent integer := 0;
begin
  select * into v_report from public.reports where id = p_report_id for update;

  if v_report.id is null then
    raise exception 'Informe no encontrado';
  end if;

  if public.report_actor_role_for(p_report_id) <> 'approver' then
    raise exception 'Solo quien puede aprobar informes lo envía';
  end if;

  -- CA-17 · enviar dos veces produce un solo efecto.
  if v_report.status = 'sent' then
    return 0;
  end if;

  -- RN-REP-08 · **lo que faltaba**. Un informe llega a "Enviado" desde
  -- "Aprobado" o desde "Programado", y desde ningún otro sitio.
  if not public.report_transition_allowed(v_report.status, 'sent', 'approver') then
    raise exception 'Un informe en % no se envía: antes se aprueba', v_report.status;
  end if;

  select id into v_version_id
  from public.report_versions
  where report_id = p_report_id
  order by version_number desc
  limit 1;

  if v_version_id is null then
    raise exception 'Este informe todavía no tiene cifras generadas';
  end if;

  -- §95 · el freno de las oportunidades pendientes. Se comprueba AQUÍ y no
  -- al aprobar porque una oportunidad puede detectarse después.
  v_pending := public.report_pending_opportunities(p_report_id);
  if v_pending > 0 then
    update public.reports
    set status = 'pending_review',
        status_reason = 'Hay oportunidades pendientes de aprobar',
        updated_at = now()
    where id = p_report_id;

    perform public.record_state_event(v_report.space_id, 'report', p_report_id, v_report.status,
                                      'pending_review', 'Hay oportunidades pendientes de aprobar');

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
    values (v_report.space_id, auth.uid(), 'report.send_blocked', 'report', p_report_id,
            jsonb_build_object('pending_opportunities', v_pending),
            'Hay oportunidades pendientes de aprobar');

    return -1;
  end if;

  v_slug := public.space_slug(v_report.space_id);
  v_link := case
    when v_report.establishment_id is not null
      then '/espacios/' || v_slug || '/restaurantes/' || v_report.establishment_id::text || '/datos?seccion=informes'
    else '/espacios/' || v_slug || '/informes/' || p_report_id::text
  end;

  for v_recipient in select * from public.report_recipients(p_report_id) loop
    insert into public.report_deliveries (space_id, report_id, version_id, recipient_id, channel)
    values (v_report.space_id, p_report_id, v_version_id, v_recipient.recipient_id, 'email')
    on conflict (version_id, recipient_id, channel) do nothing;

    if found then
      v_sent := v_sent + 1;
    end if;

    perform public.emit_notification(
      v_report.space_id, v_recipient.recipient_id, 'report_sent', v_recipient.audience,
      'report', p_report_id, v_link,
      'report_sent:' || v_version_id::text || ':' || v_recipient.recipient_id::text,
      v_report.establishment_id,
      null, null,
      v_report.delivery_channel = 'email'
    );
  end loop;

  update public.reports
  set status = 'sent',
      sent_at = now(),
      status_reason = null,
      updated_at = now()
  where id = p_report_id;

  perform public.record_state_event(v_report.space_id, 'report', p_report_id, v_report.status, 'sent', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_report.space_id, auth.uid(), 'report.sent', 'report', p_report_id,
          jsonb_build_object('version_id', v_version_id, 'recipients', v_sent,
                             'channel', v_report.delivery_channel));

  return v_sent;
end;
$function$;

-- RN-REP-31 · publish_report: quién aprueba, por informe.
CREATE OR REPLACE FUNCTION public.publish_report(p_report_id uuid, p_confirm_unreviewed boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_report public.reports;
  v_reason constant text := 'Subido sin revisar';
begin
  select * into v_report from public.reports where id = p_report_id for update;

  if v_report.id is null then
    raise exception 'Informe no encontrado';
  end if;

  -- Una persona, no la cola: la cola envía lo programado con `send_report`.
  -- Sin esto, `report_actor_role()` diría 'approver' a una llamada sin
  -- sesión, que es su lectura para la cola y no para este botón.
  if auth.uid() is null then
    raise exception 'Subir un informe lo hace una persona';
  end if;

  if public.report_actor_role_for(p_report_id) is distinct from 'approver' then
    raise exception 'Solo quien puede aprobar informes lo sube';
  end if;

  -- CA-17 · subir dos veces es subirlo una.
  if v_report.status = 'sent' then
    return 0;
  end if;

  if v_report.status = 'archived' then
    raise exception 'Un informe archivado no se sube';
  end if;

  -- Decisión 30 · un consolidado mezcla varios restaurantes y no es de
  -- ninguno: no hay a quién subírselo.
  if v_report.establishment_id is null then
    raise exception 'Un informe consolidado no se sube a ningún restaurante';
  end if;

  -- RN-REP-29 · sin aprobar, solo con la confirmación. La exige el
  -- servidor: la alerta de la pantalla es cómo se pide, no el control.
  if v_report.status in ('preparing', 'pending_review') then
    if not coalesce(p_confirm_unreviewed, false) then
      raise exception 'Este informe no se ha revisado: confirma que quieres subirlo sin revisar';
    end if;
    -- Confirmar ES la aprobación de quien pulsa, con su evento, su apunte
    -- y su motivo (RN-REP-14). `set_report_status()` comprueba la tabla de
    -- transiciones y que haya cifras generadas.
    perform public.set_report_status(p_report_id, 'approved', v_reason);
  end if;

  -- RN-REP-11 y RN-MOV-04 · el aviso al restaurante lleva push, y el push
  -- viaja con el canal de correo: con 'none' solo saldría la campana.
  if v_report.delivery_channel <> 'email' then
    update public.reports
    set delivery_channel = 'email', updated_by = auth.uid(), updated_at = now()
    where id = p_report_id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_report.space_id, auth.uid(), 'report.channel_changed', 'report', p_report_id,
            jsonb_build_object('channel', v_report.delivery_channel), jsonb_build_object('channel', 'email'));
  end if;

  -- El resto es el envío de siempre: la tabla de transiciones, la versión
  -- más reciente, el freno de las oportunidades (RN-REP-10), las entregas
  -- y los avisos a todos los que trabajan en ese restaurante.
  return public.send_report(p_report_id);
end;
$function$;

-- RN-REP-31 · el trabajador autorizado también pregunta por el freno de §95.
CREATE OR REPLACE FUNCTION public.report_pending_opportunities(p_report_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    -- Quién puede preguntarlo: quien gestiona la cartera de ese espacio.
    -- Sin esto, cualquiera con sesión sabría cuántas oportunidades
    -- pendientes tiene cualquier restaurante de cualquier espacio con una
    -- llamada RPC — que es exactamente lo que el barrido de funciones
    -- internas de `hito7_mensajes_archivos_finanzas.sql` busca.
    --
    -- El proceso de la cola (service_role, sin sesión) SÍ pregunta, y la
    -- condición empieza por ahí a propósito: si `auth.uid() is null`
    -- contara como "no puede", esta función devolvería 0 al envío
    -- automático y el freno de §95 —el único que importa de verdad, porque
    -- ahí no hay nadie mirando— no saltaría nunca.
    when auth.uid() is not null and not public.report_can_prepare_report(p_report_id) then 0
    when not exists (
      select 1 from public.report_sections s
      where s.report_id = p_report_id and s.section_key = 'opportunities' and s.included
    ) then 0
    else (
      select count(*)::integer
      from public.opportunities o
      join public.reports r on r.id = p_report_id
      where o.establishment_id = r.establishment_id
        and o.status in ('detected', 'recommended', 'under_review')
        and (o.period_end is null or o.period_end >= r.period_start)
        and (o.period_start is null or o.period_start <= r.period_end)
    )
  end;
$function$;

-- ============================================================
-- 3 · Las cinco políticas de lectura
-- ============================================================
drop policy reports_select on public.reports;
create policy reports_select on public.reports
for select
using (
  public.has_capability(space_id, 'manage_clients')
  -- RN-REP-31 · el trabajador autorizado en ese restaurante.
  or public.is_report_worker(space_id, establishment_id)
  or (
    establishment_id is not null
    and public.report_is_visible_to_client(status)
    and public.client_can_view_reports(establishment_id)
    and ((not public.report_includes_finance(id)) or public.client_can_view_billing(establishment_id))
  )
);

drop policy report_sections_select on public.report_sections;
create policy report_sections_select on public.report_sections
for select
using (public.has_capability(space_id, 'manage_clients') or public.is_report_worker_for(report_id));

drop policy report_versions_select on public.report_versions;
create policy report_versions_select on public.report_versions
for select
using (
  public.has_capability(space_id, 'manage_clients')
  or public.is_report_worker_for(report_id)
  or (
    public.report_version_was_delivered(id)
    and exists (
      select 1 from public.reports r
      where r.id = report_versions.report_id
        and r.establishment_id is not null
        and public.report_is_visible_to_client(r.status)
        and public.client_can_view_reports(r.establishment_id)
    )
  )
);

drop policy report_deliveries_select on public.report_deliveries;
create policy report_deliveries_select on public.report_deliveries
for select
using (public.has_capability(space_id, 'manage_clients') or public.is_report_worker_for(report_id));

drop policy report_entry_texts_select on public.report_entry_texts;
create policy report_entry_texts_select on public.report_entry_texts
for select
using (public.has_capability(space_id, 'manage_clients') or public.is_report_worker_for(report_id));
