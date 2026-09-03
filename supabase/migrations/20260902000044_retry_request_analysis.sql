-- ============================================================
-- Reintentar el análisis: darle al equipo el permiso que le faltaba.
--
-- Decisión de producto (Bosco, 02/09/2026): el análisis se intenta solo al
-- enviarse la solicitud —RN-CLS-01, "al enviarse una solicitud"— y, si ESE
-- primer intento falla, el equipo autorizado ve un botón "Reintentar
-- análisis". Ni en el camino normal, ni para el cliente.
--
-- Lo que faltaba era el permiso. `begin_request_analysis()` exigía
-- `can_write_establishment()`, que es permiso de CLIENTE: el paso
-- automático lo da el envío del restaurante y por eso funcionaba, pero
-- nadie del equipo podía darlo a mano. El botón existía y siempre fallaba.
--
-- Se añade el permiso del equipo SIN quitar el del cliente, porque los dos
-- caminos son reales: el automático lo ejecuta el cliente al enviar, el
-- reintento lo ejecuta el equipo. La capacidad es `manage_requests`
-- (propietario o administrador), la misma que ya piden validar, pedir
-- información y rechazar en esa misma pantalla — no se inventa una nueva.
--
-- Y hay una segunda mitad que es fácil pasar por alto:
-- `record_classification()` comprueba que el ACTOR tenga escritura sobre
-- el establecimiento. En un reintento del equipo el actor es alguien del
-- equipo, así que grabar el resultado habría fallado después de haber
-- movido el estado. Se le añade la misma alternativa.
--
-- Para eso hace falta preguntar por la capacidad de UN USUARIO CONCRETO, y
-- `has_capability()` mira siempre `auth.uid()`. En vez de repetir la
-- matriz de capacidades en otra función —dos sitios que se
-- desincronizan—, la matriz se muda a `has_capability_as(space, user,
-- cap)` y `has_capability()` pasa a ser una llamada a esa con
-- `auth.uid()`. Sigue habiendo un único sitio donde vive quién puede qué.
-- ============================================================

-- La matriz, con actor explícito. Copiada tal cual de `has_capability()`:
-- lo único que cambia es de dónde sale el usuario.
create or replace function public.has_capability_as(
  p_space_id uuid,
  p_user_id uuid,
  p_capability text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.space_role;
  v_can_perform_jobs boolean;
begin
  select sm.role, sm.can_perform_jobs into v_role, v_can_perform_jobs
  from public.space_memberships sm
  where sm.space_id = p_space_id
    and sm.user_id = p_user_id
    and sm.status = 'active';

  if v_role is null then
    return false;
  end if;

  return case p_capability
    when 'manage_space' then v_role = 'owner'
    when 'invite_member' then v_role = 'owner'
    when 'create_establishment' then v_role in ('owner', 'admin')
    when 'manage_clients' then v_role in ('owner', 'admin')
    when 'view_team' then true
    when 'manage_holidays' then v_role in ('owner', 'admin')
    when 'manage_requests' then v_role in ('owner', 'admin')
    when 'assign_jobs' then v_role in ('owner', 'admin')
    when 'perform_jobs' then
      v_role = 'worker'
      or v_role = 'owner'
      or (v_role = 'admin' and coalesce(v_can_perform_jobs, false))
    when 'manage_finance' then v_role in ('owner', 'admin')
    when 'manage_files' then v_role in ('owner', 'admin', 'worker')
    when 'manage_absences' then v_role in ('owner', 'admin')
    else false
  end;
end;
$$;

-- Interna: recibe el usuario por parámetro, así que abierta por RPC sería
-- una forma de preguntar por los permisos de cualquiera. La llaman otras
-- funciones `security definer`, que la ejecutan con los privilegios del
-- dueño y no necesitan este permiso. Se revoca también a `authenticated`,
-- no solo a PUBLIC: un proyecto de Supabase concede EXECUTE por defecto a
-- `anon` y `authenticated` sobre toda función nueva (CLAUDE.md).
revoke all on function public.has_capability_as(uuid, uuid, text) from public, anon, authenticated;

-- `has_capability()` conserva su firma —la usan medio centenar de
-- políticas de RLS— y pasa a delegar. Es `security definer`, así que la
-- llamada de dentro se ejecuta con los privilegios del dueño y la revocación
-- de arriba no rompe ninguna política.
create or replace function public.has_capability(p_space_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.has_capability_as(p_space_id, auth.uid(), p_capability);
end;
$$;

-- El paso received -> analyzing. Dos caminos legítimos: el cliente al
-- enviar (automático) y el equipo al reintentar.
create or replace function public.begin_request_analysis(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
  v_space_id uuid;
  v_state text;
begin
  select establishment_id, space_id, state into v_establishment_id, v_space_id, v_state
  from public.requests where id = p_request_id
  for update;

  if v_establishment_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state <> 'received' then
    return; -- idempotente.
  end if;

  if not (
    public.can_write_establishment(v_establishment_id)
    or public.has_capability(v_space_id, 'manage_requests')
  ) then
    raise exception 'No tienes permiso para analizar esta solicitud';
  end if;

  update public.requests set state = 'analyzing' where id = p_request_id;
end;
$$;

-- Grabar lo que propuso la IA. Sigue reservada a `service_role`
-- (migración 20260830000018): RN-CLS-01 dice que la clave nunca se expone
-- al cliente y RN-CLS-04 que se guarda qué propuso de verdad la IA, y eso
-- no puede depender de lo que afirme el navegador. Lo único que cambia es
-- quién vale como actor.
create or replace function public.record_classification(
  p_request_id uuid,
  p_actor_id uuid,
  p_source text,
  p_category text,
  p_summary text,
  p_matched_keywords text[] default null,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_estimated_cost_cents integer default null,
  p_fallback_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_classification_id uuid;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state = 'pending_internal_validation' then
    -- Idempotente: ya se registró un análisis para esta solicitud, se
    -- devuelve el último en vez de duplicarlo.
    select id into v_classification_id from public.classifications
    where request_id = p_request_id order by created_at desc limit 1;
    return v_classification_id;
  end if;

  if v_state <> 'analyzing' then
    raise exception 'La solicitud no está en análisis';
  end if;

  -- El cliente que envió, o quien del equipo esté reintentando. En los dos
  -- casos el actor queda en la auditoría, que es lo que importa: el
  -- registro tiene que decir quién lo hizo de verdad.
  if not (
    public.can_write_establishment_as(v_establishment_id, p_actor_id)
    or public.has_capability_as(v_space_id, p_actor_id, 'manage_requests')
  ) then
    raise exception 'El actor indicado no puede analizar esta solicitud';
  end if;

  insert into public.classifications
    (request_id, space_id, source, proposed_category, proposed_summary, matched_keywords, model, input_tokens, output_tokens, fallback_reason)
  values
    (p_request_id, v_space_id, p_source, p_category, p_summary, p_matched_keywords, p_model, p_input_tokens, p_output_tokens, p_fallback_reason)
  returning id into v_classification_id;

  if p_source = 'ai' then
    insert into public.ai_usage (space_id, request_id, classification_id, model, input_tokens, output_tokens, estimated_cost_cents)
    values (v_space_id, p_request_id, v_classification_id, p_model, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), coalesce(p_estimated_cost_cents, 0));
  end if;

  update public.requests set state = 'pending_internal_validation' where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, p_actor_id, 'request.classified', 'request', p_request_id,
    jsonb_build_object('state', 'analyzing'),
    jsonb_build_object('state', 'pending_internal_validation', 'source', p_source, 'category', p_category)
  );

  return v_classification_id;
end;
$$;

revoke all on function public.record_classification(uuid, uuid, text, text, text, text[], text, integer, integer, integer, text)
  from public, anon, authenticated;
