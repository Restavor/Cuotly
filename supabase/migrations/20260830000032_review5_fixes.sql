-- Quinta pasada de revisión del Hito 7. Un bloqueante y tres importantes
-- de la misma clase, más una lista de funciones internas abiertas.
--
-- El resumen del revisor lo dice mejor que yo: la cuarta pasada "cerró
-- cuatro puertas de un pasillo que tiene ocho". La guarda de suspensión
-- se puso en `start_job`, `publish_job`, `submit_request` y
-- `accept_request`, y se dio por hecho que ahí acababa la lista. No
-- acababa.
--
-- ============================================================
-- H1 (BLOQUEANTE) · `unblock_job()` deshacía la suspensión entera.
--
-- `apply_financial_hold_on_jobs()` deja el trabajo en `authorized_pause`
-- con un bloqueo de tipo `financial_hold`. `unblock_job()` cerraba TODOS
-- los bloqueos abiertos del trabajo —el financiero incluido—, lo ponía en
-- curso y reanudaba T3, sin mirar el estado del establecimiento. Es decir:
-- el mismo botón que reanuda un trabajo parado por falta de información
-- levantaba la retención por impago.
--
-- Verificado en vivo: con el establecimiento suspendido y la retención
-- aplicada (1 trabajo pausado, 9 contadores parados), `unblock_job()`
-- devolvía el trabajo a `in_progress` con T3 corriendo.
--
-- Se arregla por dos sitios, porque uno solo no basta:
--   · la guarda de suspensión, como en las otras;
--   · y la retención financiera deja de ser algo que esta función pueda
--     cerrar. La abre `apply_financial_hold_on_jobs()` y la cierra
--     `release_financial_holds()` al cobrar. Sin esta segunda parte, en
--     cuanto el establecimiento dejara de estar `suspended` por cualquier
--     otra vía, la retención se podría levantar a mano.
--
-- Honestidad sobre la cobertura de esa segunda parte: NO hay ninguna
-- mutación que la ponga en rojo por sí sola, y se comprobó. Quitando solo
-- la comprobación de `financial_hold` y dejando la guarda de suspensión,
-- la suite sigue verde — porque una retención por impago únicamente existe
-- mientras el establecimiento está `suspended`, y ahí ya frena la guarda.
-- Es defensa en profundidad real (la propiedad queda sostenida por dos
-- sitios), no una comprobación probada. Se deja escrito aquí en vez de
-- aparentar que un test la cubre.
-- ============================================================
-- H2 · `provide_additional_information()` reanudaba T1 con el servicio
--      detenido: una acción del cliente rearrancaba un contador
--      contractual. Misma clase que `submit_request`, que sí se guardó.
--
-- H3 · `accept_revised_request()` —la hermana de `accept_request()`, que
--      sí se guardó— aceptaba la solicitud y consumía un crédito del
--      ciclo con el establecimiento suspendido.
--
-- H4 · `start_correction()` y `complete_correction()` ejecutaban y
--      publicaban durante la suspensión. RN-FIN-12 dice "se detienen
--      trabajos, publicaciones y contadores", y `complete_correction()`
--      hace `update public.jobs set state = 'published'`.
--
-- H4b · `apply_job_assignment()` arranca T2 en la primera asignación
--      (RN-SLA-05). Es interna, la llaman `assign_job()`,
--      `auto_assign_job()` y `approve_job_reassignment()`, así que
--      guardarla aquí cubre los tres caminos de una vez.
--
-- Todas las guardas van después de las comprobaciones de permiso y de los
-- retornos idempotentes, y antes de la primera escritura: pulsar dos veces
-- con el establecimiento suspendido sigue teniendo un único efecto
-- (CA-17), en vez de cambiar de error.
-- ============================================================

CREATE OR REPLACE FUNCTION public.unblock_job(p_job_id uuid, p_note text DEFAULT NULL::text, p_reverted boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_establishment_id uuid;
begin
  select space_id, state, assigned_to, establishment_id
  into v_space_id, v_state, v_assigned_to, v_establishment_id
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden reanudar este trabajo';
  end if;

  if p_reverted and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el propietario o un administrador pueden revertir un bloqueo';
  end if;

  -- RN-JOB-07: una pausa autorizada la levanta quien la autorizó, no el
  -- trabajador (a diferencia del bloqueo por falta de información, que
  -- termina cuando llega lo que faltaba).
  if v_state = 'authorized_pause' and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el propietario o un administrador pueden levantar una pausa autorizada';
  end if;

  if v_state = 'in_progress' then
    return; -- Idempotente: ya está en curso.
  end if;

  if v_state not in ('blocked_by_client', 'authorized_pause') then
    raise exception 'El trabajo no está bloqueado ni en pausa';
  end if;

  perform public.assert_establishment_not_suspended(v_establishment_id);

  -- RN-FIN-12 / RN-FIN-13: una retención por impago NO se levanta desde
  -- aquí. La abre `apply_financial_hold_on_jobs()` y la cierra
  -- `release_financial_holds()` cuando se cobra, y nada más. Sin esto, el
  -- mismo botón que reanuda un trabajo bloqueado por el cliente deshacía
  -- la suspensión entera.
  if exists (
    select 1 from public.blocks
    where job_id = p_job_id and ended_at is null and reason_type = 'financial_hold'
  ) then
    raise exception 'Este trabajo está retenido por impago: se reanuda al cobrar, no desde aquí';
  end if;

  update public.blocks
  set ended_at = now(), ended_by = auth.uid(), reverted = p_reverted
  where job_id = p_job_id and ended_at is null;

  update public.jobs set state = 'in_progress' where id = p_job_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't3', 'job', p_job_id, 'resumed', now(), auth.uid());

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, 'in_progress', p_note);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'job.unblocked', 'job', p_job_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'in_progress', 'reverted', p_reverted),
    p_note
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.provide_additional_information(p_request_id uuid, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_conversation_id uuid;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state <> 'needs_information' then
    raise exception 'La solicitud no está esperando información adicional';
  end if;

  if btrim(coalesce(p_message, '')) = '' then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  perform public.assert_establishment_not_suspended(v_establishment_id);

  update public.requests set state = 'pending_internal_validation' where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'resumed', now(), auth.uid());

  v_conversation_id := public.get_or_create_request_conversation(p_request_id);
  insert into public.messages (conversation_id, space_id, sender_id, sender_role, body)
  values (v_conversation_id, v_space_id, auth.uid(), 'client', p_message);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.information_provided', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'pending_internal_validation')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_revised_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_category text;
  v_job_id uuid;
  v_job_state text;
  v_old_category text;
  v_debit_entry_id uuid;
  v_original_cycle_id uuid;
  v_subscription_id uuid;
  v_current_cycle_id uuid;
  v_included integer;
  v_cycle_included integer;
  v_balance integer;
  v_budgeted boolean := true;
  v_cycle_id uuid;
  v_entry_id uuid;
begin
  select space_id, establishment_id, state, validated_category
  into v_space_id, v_establishment_id, v_state, v_category
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  select id, state, category into v_job_id, v_job_state, v_old_category
  from public.jobs where request_id = p_request_id
  for update;

  if v_job_id is null then
    raise exception 'Esta solicitud todavía no tiene trabajo: la primera aceptación es accept_request()';
  end if;

  if v_state = 'accepted' then
    return; -- CA-17: aceptar dos veces produce un único efecto.
  end if;

  if v_state <> 'pending_client_acceptance' then
    raise exception 'La solicitud no está pendiente de aceptación';
  end if;

  if v_job_state not in ('pending_assignment', 'assigned') then
    raise exception 'El trabajo ya comenzó: no cabe una nueva aceptación (RN-SLA-08)';
  end if;

  perform public.assert_establishment_not_suspended(v_establishment_id);

  -- Si la categoría cambió, el débito anterior se devuelve y se registra
  -- el de la categoría nueva. El libro es inmutable: se añaden apuntes con
  -- signo, nunca se corrige el anterior (RN-DAT-04, CA-08).
  if v_old_category is distinct from v_category then
    select ce.id, ce.consumption_cycle_id into v_debit_entry_id, v_original_cycle_id
    from public.consumption_entries ce
    where ce.job_id = v_job_id and ce.entry_type = 'debit'
    order by ce.created_at desc
    limit 1;

    if v_debit_entry_id is not null then
      select subscription_id into v_subscription_id from public.consumption_cycles where id = v_original_cycle_id;
      v_current_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);

      insert into public.consumption_entries
        (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, related_entry_id, reason, created_by)
      values (
        v_space_id, v_establishment_id,
        case when v_current_cycle_id = v_original_cycle_id then v_original_cycle_id else v_current_cycle_id end,
        v_old_category, 1,
        -- RN-CON-10: si el ciclo original ya cerró, no se reabre — el
        -- apunte es un crédito compensatorio en el ciclo vigente.
        case when v_current_cycle_id = v_original_cycle_id then 'return' else 'compensatory_credit' end,
        p_request_id, v_job_id, v_debit_entry_id,
        'Nueva aceptación por cambio de clasificación (RN-CLS-09)', auth.uid()
      );
    end if;
  end if;

  -- Consumo de la categoría nueva, con las mismas reglas que
  -- accept_request() (RN-COM-01/02/12, RN-CON-03/06).
  select s.id, case v_category
      when 'small' then p.included_small
      when 'photo' then p.included_photo
      when 'medium' then p.included_medium
      when 'large' then p.included_large
    end
  into v_subscription_id, v_included
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = v_establishment_id and s.kind = 'plan' and s.status = 'active'
  limit 1;

  if v_subscription_id is not null and v_included > 0 then
    v_budgeted := false;
    v_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);

    select case v_category
      when 'small' then included_small
      when 'photo' then included_photo
      when 'medium' then included_medium
      when 'large' then included_large
    end into v_cycle_included
    from public.consumption_cycles where id = v_cycle_id;

    select v_cycle_included + coalesce(sum(amount), 0) into v_balance
    from public.consumption_entries
    where consumption_cycle_id = v_cycle_id and category = v_category;

    if v_balance <= 0 then
      raise exception 'Sin crédito disponible en el ciclo actual para la categoría %', v_category;
    end if;

    -- Solo se debita de nuevo si la categoría cambió: si es la misma, el
    -- débito original sigue en pie y volver a debitar cobraría dos veces
    -- el mismo cambio.
    if v_old_category is distinct from v_category then
      insert into public.consumption_entries
        (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, reason, created_by)
      values (
        v_space_id, v_establishment_id, v_cycle_id, v_category, -1, 'debit', p_request_id, v_job_id,
        'Nueva aceptación por cambio de clasificación (RN-CLS-09)', auth.uid()
      )
      returning id into v_entry_id;
    else
      -- Misma categoría: el débito original sigue en pie, y la nueva
      -- aceptación apunta a él para que el rastro no se rompa (CA-15).
      select ce.id into v_entry_id
      from public.consumption_entries ce
      where ce.job_id = v_job_id and ce.entry_type = 'debit'
      order by ce.created_at desc
      limit 1;
    end if;
  end if;

  update public.jobs set category = v_category where id = v_job_id;

  insert into public.acceptances
    (space_id, establishment_id, request_id, job_id, category, consumption_cycle_id, consumption_entry_id, budgeted, accepted_by)
  values
    (v_space_id, v_establishment_id, p_request_id, v_job_id, v_category, v_cycle_id, v_entry_id, v_budgeted, auth.uid());

  update public.requests set state = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = p_request_id;

  -- CA-12 / RN-SLA-08: T2 se reinicia **desde cero**. El libro conserva
  -- todos los eventos anteriores (nada se borra); es el arranque nuevo el
  -- que hace que el contador vigente empiece de cero
  -- (eventsSinceLastStart() en src/core/timer-events.ts).
  if v_job_state = 'assigned' then
    insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
    values (v_space_id, 't2', 'job', v_job_id, 'started', now(), auth.uid());
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.accepted_again', 'request', p_request_id,
    jsonb_build_object('state', v_state, 'category', v_old_category),
    jsonb_build_object('state', 'accepted', 'category', v_category, 'job_id', v_job_id, 't2_restarted', v_job_state = 'assigned')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_correction(p_correction_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_job_id uuid;
  v_request_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_establishment_id uuid;
begin
  select c.space_id, c.job_id, c.request_id, c.establishment_id
  into v_space_id, v_job_id, v_request_id, v_establishment_id
  from public.corrections c where c.id = p_correction_id;

  if v_space_id is null then
    raise exception 'Corrección no encontrada';
  end if;

  select state, assigned_to into v_state, v_assigned_to from public.jobs where id = v_job_id for update;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden empezar esta corrección';
  end if;

  if v_state = 'in_correction' then
    return; -- Idempotente.
  end if;

  if v_state <> 'published' then
    raise exception 'Solo se puede corregir un trabajo publicado';
  end if;

  perform public.assert_establishment_not_suspended(v_establishment_id);

  update public.corrections set started_at = now() where id = p_correction_id and started_at is null;
  update public.jobs set state = 'in_correction' where id = v_job_id;
  update public.requests set state = 'in_correction' where id = v_request_id;

  perform public.record_state_event(v_space_id, 'job', v_job_id, 'published', 'in_correction', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'correction.started', 'correction', p_correction_id,
    jsonb_build_object('job_state', 'published'), jsonb_build_object('job_state', 'in_correction')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_correction(p_correction_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_job_id uuid;
  v_request_id uuid;
  v_completed_at timestamptz;
  v_state text;
  v_assigned_to uuid;
  v_establishment_id uuid;
begin
  select c.space_id, c.job_id, c.request_id, c.completed_at, c.establishment_id
  into v_space_id, v_job_id, v_request_id, v_completed_at, v_establishment_id
  from public.corrections c where c.id = p_correction_id;

  if v_space_id is null then
    raise exception 'Corrección no encontrada';
  end if;

  select state, assigned_to into v_state, v_assigned_to from public.jobs where id = v_job_id for update;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden cerrar esta corrección';
  end if;

  if v_completed_at is not null then
    return; -- CA-17: cerrarla dos veces produce un único efecto.
  end if;

  if v_state <> 'in_correction' then
    raise exception 'Esta corrección todavía no se ha empezado (start_correction)';
  end if;

  perform public.assert_establishment_not_suspended(v_establishment_id);

  update public.corrections set completed_at = now(), completed_by = auth.uid() where id = p_correction_id;
  update public.jobs set state = 'published' where id = v_job_id;
  update public.requests set state = 'published' where id = v_request_id;

  perform public.record_state_event(v_space_id, 'job', v_job_id, 'in_correction', 'published', p_note);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'correction.completed', 'correction', p_correction_id,
    jsonb_build_object('job_state', 'in_correction'), jsonb_build_object('job_state', 'published'), p_note
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_job_assignment(p_job_id uuid, p_worker_id uuid, p_kind text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_state text;
  v_previous_assignee uuid;
  v_establishment_id uuid;
begin
  select space_id, state, assigned_to, establishment_id
  into v_space_id, v_state, v_previous_assignee, v_establishment_id
  from public.jobs where id = p_job_id;

  perform public.assert_establishment_not_suspended(v_establishment_id);

  update public.assignments set released_at = now()
  where job_id = p_job_id and released_at is null;

  insert into public.assignments (space_id, job_id, assignee_id, assigned_by, kind, reason)
  values (v_space_id, p_job_id, p_worker_id, auth.uid(), p_kind, p_reason);

  update public.jobs
  set assigned_to = p_worker_id, assigned_at = now(), state = 'assigned'
  where id = p_job_id;

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, 'assigned', p_reason);

  -- RN-SLA-05: T2 arranca cuando el trabajo queda asignado. Una
  -- reasignación NO vuelve a arrancarlo (RN-SLA-09, CA-12) — por eso el
  -- evento solo se escribe en la primera asignación, cuando el trabajo
  -- venía de pending_assignment.
  if v_state = 'pending_assignment' then
    insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
    values (v_space_id, 't2', 'job', p_job_id, 'started', now(), auth.uid());
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'job.assigned', 'job', p_job_id,
    jsonb_build_object('state', v_state, 'assigned_to', v_previous_assignee),
    jsonb_build_object('state', 'assigned', 'assigned_to', p_worker_id, 'kind', p_kind),
    p_reason
  );
end;
$function$;

-- ============================================================
-- H7 · Doce funciones internas seguían invocables por RPC, y una de ellas
-- ESCRIBE.
--
-- Es la tercera vez que aparece esta clase (migración 24, nueve
-- funciones; migración 30, `job_assignee` e
-- `is_eligible_job_candidate`). En Supabase, toda función nueva nace con
-- EXECUTE concedido a `anon` y `authenticated`, así que una función
-- `SECURITY DEFINER` que no comprueba permisos por su cuenta está abierta
-- salvo que se la revoque explícitamente.
--
-- Verificado en vivo sobre una réplica del estado desplegado, con
-- `set role anon` y sin sesión ninguna:
--
--   conversaciones antes: 0
--   anon creó: 16381d6c-9aea-4a47-9077-9885c64ea325
--   conversaciones después: 1
--
--   request_state -> accepted
--   request_establishment_id -> c4000000-...-000000000001
--   job_establishment_id -> c6000000-...-000000000001
--
-- `get_or_create_request_conversation()` escribía una fila sin sesión. Las
-- demás entregaban estado de negocio a cualquiera que tuviera un uuid.
-- Adivinar un uuid v4 no es práctico, pero eso es una dificultad, no un
-- control de acceso — y CLAUDE.md dice que toda operación se valida en el
-- servidor.
--
-- Diez de las doce son de migraciones ya desplegadas (15, 17, 22, 23), así
-- que este bloque va también en el arreglo que se aplica a mano.
--
-- CUIDADO, porque aquí el informe proponía el arreglo equivocado y de
-- haberlo aplicado tal cual habría roto la aplicación en dos sitios.
--
-- 1) OCHO de las doce se usan dentro de expresiones de políticas de RLS, y
--    PostgreSQL evalúa esas expresiones con los privilegios de QUIEN
--    CONSULTA, no del dueño de la política. Revocarles el EXECUTE a
--    `authenticated` no las cierra: rompe la política entera. Comprobado
--    al intentarlo — `hito4_solicitudes.sql` pasó de verde a
--
--      ERROR: permission denied for function request_space_id
--
--    porque `request_versions_select` y `request_attachments_insert`
--    llaman a `request_space_id()` desde su propio `using`.
--
-- 2) `get_or_create_request_conversation()` NO es interna. `conversations`
--    no tiene política de INSERT, así que esa función es la única puerta
--    para abrir la conversación de una solicitud, igual que sus dos
--    hermanas `get_or_create_job_conversation()` y
--    `get_or_create_establishment_conversation()`, que sí son llamables
--    por `authenticated` a propósito. Revocarla dejaría sin conversación a
--    la pantalla de HU-35.
--
--    Lo que le pasa es otra cosa, y es peor: es la única de las tres que
--    **no comprueba absolutamente nada**. Ni que la solicitud exista, ni
--    quién llama. Por eso `anon` podía escribir una fila sin sesión. El
--    arreglo no es quitarle el permiso: es ponerle la comprobación que le
--    falta, calcada de la que ya tiene su hermana de establecimiento y de
--    la que usa `can_read_conversation()` para este mismo tipo de
--    conversación.
--
-- Así que la línea divisoria no es "interna o no", sino qué le pasa a cada
-- una:
--
--   · `get_or_create_request_conversation()` -> le falta la comprobación.
--   · Las TRES que no usa ninguna política y no llama nadie se cierran del
--     todo: `conversation_request_state()` quedó huérfana cuando la
--     migración 25 reescribió `messages_insert`, y `job_space_id()` y
--     `job_establishment_id()` no tienen un solo llamador en todo el
--     repositorio — código muerto, como `job_assignee` en la migración 30.
--   · Las OCHO que las políticas necesitan conservan el EXECUTE de
--     `authenticated` por obligación técnica, y se les revoca `public` y
--     `anon`. Un usuario CON SESIÓN que llame `request_state('<uuid>')` a
--     mano sigue pudiendo saber el estado de una solicitud si adivina su
--     uuid. Es una fuga menor que se acepta a cambio de no romper quince
--     políticas, y queda escrita aquí para que nadie la descubra dentro de
--     seis meses creyendo que es nueva. Cerrarla del todo exige reescribir
--     esas políticas para que no llamen a ninguna función, y eso es un
--     cambio de más calado que no toca meter en un arreglo de revisión.
-- ============================================================

-- El arreglo de verdad: la comprobación que le faltaba. Misma regla que
-- `can_read_conversation()` aplica a una conversación de solicitud, y
-- misma forma que `get_or_create_establishment_conversation()`.
create or replace function public.get_or_create_request_conversation(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_space_id uuid;
  v_establishment_id uuid;
begin
  select space_id, establishment_id into v_space_id, v_establishment_id
  from public.requests where id = p_request_id;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not (
    public.has_capability(v_space_id, 'manage_requests')
    or public.can_read_establishment_as_client(v_establishment_id)
    or public.is_authorized_worker_establishment(v_establishment_id)
  ) then
    raise exception 'No tienes acceso a la conversación de esta solicitud';
  end if;

  select id into v_conversation_id from public.conversations where request_id = p_request_id;
  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (space_id, type, request_id)
  values (v_space_id, 'request', p_request_id)
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

comment on function public.get_or_create_request_conversation(uuid) is
  'HU-35: abre (o crea) la conversación de una solicitud. Comprueba quién
   llama, igual que sus dos hermanas — hasta la migración 32 no comprobaba
   nada y `anon` podía crear filas sin sesión.';

-- Las tres que no usa ninguna política y no llama nadie: cerradas del todo.
revoke all on function public.conversation_request_state(uuid) from public, anon, authenticated;
revoke all on function public.job_space_id(uuid) from public, anon, authenticated;
revoke all on function public.job_establishment_id(uuid) from public, anon, authenticated;

-- Las ocho que las políticas de RLS evalúan como el rol que consulta:
-- `authenticated` conserva el EXECUTE por obligación técnica; `anon`, que
-- no tiene ninguna razón para preguntar, no.
revoke all on function public.conversation_space_id(uuid) from public, anon;
revoke all on function public.conversation_is_read_only(uuid) from public, anon;
revoke all on function public.establishment_space_id(uuid) from public, anon;
revoke all on function public.group_space_id(uuid) from public, anon;
revoke all on function public.message_conversation_id(uuid) from public, anon;
revoke all on function public.request_establishment_id(uuid) from public, anon;
revoke all on function public.request_space_id(uuid) from public, anon;
revoke all on function public.request_state(uuid) from public, anon;

-- Y `get_or_create_request_conversation()` conserva `authenticated`, que
-- es quien la necesita, pero `anon` no la toca.
revoke all on function public.get_or_create_request_conversation(uuid) from public, anon;
