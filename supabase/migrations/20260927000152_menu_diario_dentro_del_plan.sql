-- ============================================================
-- Migración 152 · Menú Diario dentro del plan (decisiones 85 y 86,
--                 PRD §41.6, RN-CRE-21 a RN-CRE-24 y RN-CRE-30)
-- ============================================================
--
-- Punto 5 del plan de la decisión 85. Lo que cambia en el servidor:
--
--   · RN-CRE-21 · Menú Diario va **incluido en el plan** si el plan lo dice
--     (`plans.includes_daily_menu`, término versionado como los demás) o
--     contratado suelto como hasta ahora. `establishment_daily_menu_subscription()`
--     responde a las dos: todo lo que ya preguntaba "¿tiene Menú Diario?"
--     sigue preguntando lo mismo. No se contrata suelto a quien ya lo tiene
--     en su plan.
--   · RN-CRE-22 · **sin contador**: pedir la publicación no consume nada.
--     Un menú del día (`daily`) por restaurante y fecha; los otros tipos se
--     quedan sin límite (decisión 86).
--   · RN-CRE-30 · un menú del día **publicado se cambia editándolo**: la
--     versión nueva lo devuelve a borrador y el equipo lo vuelve a publicar.
--   · RN-CRE-23 · **dos plantillas**, una para publicar y otra para imprimir
--     (`menu_templates.purpose`), una activa de cada; el restaurante no elige.
--   · RN-CRE-24 · **sin hora de corte**: el barrido deja de recordar a las
--     20:00 y de avisar a las 08:00, y la corrección mínima del menú
--     publicado desaparece. Las columnas que dicen si algo se pidió antes de
--     las 21:00 siguen apuntándose: son hechos, no una promesa.
--
-- Lo que no se toca: el libro de actualizaciones (`menu_update_entries`) y
-- sus ciclos se quedan como historia inmutable (CLAUDE.md); una publicación
-- antigua que consumió se sigue devolviendo al cancelarla.
--
-- Se comprueba con `supabase/tests/menu_diario_dentro_del_plan.sql`.

-- ------------------------------------------------------------
-- 1 · RN-CRE-21 · el plan incluye Menú Diario
-- ------------------------------------------------------------
alter table public.plans add column includes_daily_menu boolean not null default false;

comment on column public.plans.includes_daily_menu is
  'RN-CRE-21 · el plan incluye Menú Diario (Impulso y Premium en Restavor). Término versionado.';

create or replace function public.establishment_daily_menu_subscription(p_establishment_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- El servicio contratado suelto, y si no, el plan que lo incluye.
  select coalesce(
    (select s.id
     from public.subscriptions s
     join public.services sv on sv.id = s.service_id
     where s.establishment_id = p_establishment_id
       and s.kind = 'service'
       and s.status = 'active'
       and sv.kind = 'daily_menu'
     order by s.started_at
     limit 1),
    (select s.id
     from public.subscriptions s
     join public.plans p on p.id = s.plan_id
     where s.establishment_id = p_establishment_id
       and s.kind = 'plan'
       and s.status = 'active'
       and p.includes_daily_menu
     order by s.started_at
     limit 1)
  );
$function$;

-- RN-CRE-21 · de dónde le viene Menú Diario a un restaurante, para que la
-- pantalla diga "incluido en tu plan" o "contratado aparte" sin adivinarlo.
create or replace function public.establishment_daily_menu_access(p_establishment_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.can_read_establishment(p_establishment_id) then null
    when exists (
      select 1 from public.subscriptions s join public.services sv on sv.id = s.service_id
      where s.establishment_id = p_establishment_id and s.kind = 'service' and s.status = 'active'
        and sv.kind = 'daily_menu') then 'service'
    when exists (
      select 1 from public.subscriptions s join public.plans p on p.id = s.plan_id
      where s.establishment_id = p_establishment_id and s.kind = 'plan' and s.status = 'active'
        and p.includes_daily_menu) then 'plan'
    else null
  end;
$$;

comment on function public.establishment_daily_menu_access(uuid) is
  'RN-CRE-21 · de dónde le viene Menú Diario: ''service'' (contratado suelto), ''plan'' (incluido en su
   plan) o null (no lo tiene, o quien pregunta no puede leer el restaurante).';

revoke all on function public.establishment_daily_menu_access(uuid) from public, anon;
grant execute on function public.establishment_daily_menu_access(uuid) to authenticated;

-- No se contrata suelto a quien ya lo tiene en su plan.
create or replace function public.create_service_subscription(p_establishment_id uuid, p_service_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_service_space_id uuid;
  v_service_kind text;
  v_subscription_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para contratar un servicio a este establecimiento';
  end if;

  select space_id, kind into v_service_space_id, v_service_kind from public.services where id = p_service_id;
  if v_service_space_id is null or v_service_space_id <> v_space_id then
    raise exception 'El servicio no pertenece al mismo espacio que el establecimiento';
  end if;

  -- CA-17: pulsar dos veces no contrata dos veces.
  select id into v_subscription_id
  from public.subscriptions
  where establishment_id = p_establishment_id
    and kind = 'service'
    and service_id = p_service_id
    and status = 'active';

  if v_subscription_id is not null then
    return v_subscription_id;
  end if;

  -- RN-CRE-21 · lo tiene en su plan: contratarlo aparte sería cobrarlo dos veces.
  if v_service_kind = 'daily_menu' and exists (
    select 1 from public.subscriptions s join public.plans p on p.id = s.plan_id
    where s.establishment_id = p_establishment_id and s.kind = 'plan' and s.status = 'active'
      and p.includes_daily_menu
  ) then
    raise exception 'Su plan ya incluye Menú Diario: no se contrata aparte (RN-CRE-21)';
  end if;

  insert into public.subscriptions (space_id, establishment_id, kind, service_id, created_by)
  values (v_space_id, p_establishment_id, 'service', p_service_id, auth.uid())
  returning id into v_subscription_id;

  -- RN-COM-09: "permanencia mínima de 3 meses", igual que un plan.
  insert into public.plan_commitments
    (space_id, establishment_id, subscription_id, service_id, started_at, ends_at, cause, created_by)
  values
    (v_space_id, p_establishment_id, v_subscription_id, p_service_id,
     now(), now() + interval '3 months', 'initial', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id, auth.uid(), 'subscription.service_created', 'subscription', v_subscription_id,
    jsonb_build_object('establishment_id', p_establishment_id, 'service_id', p_service_id)
  );

  perform public.generate_monthly_charge_internal(v_subscription_id, null);

  return v_subscription_id;
end;
$function$;

-- ------------------------------------------------------------
-- 2 · RN-CRE-22 · pedir la publicación no consume
-- ------------------------------------------------------------
alter table public.menu_publications alter column cycle_id drop not null;
alter table public.menu_publications alter column debit_entry_id drop not null;

create or replace function public.request_menu_publication(p_menu_id uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_menu public.menus;
  v_publication_id uuid;
  v_before_cutoff boolean;
  v_candidate_count integer;
  v_worker_id uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para pedir la publicación de este menú';
  end if;

  -- CA-17 / RN-CON-07: la misma petición dos veces devuelve la misma fila.
  if p_idempotency_key is not null then
    select id into v_publication_id from public.menu_publications
    where menu_id = p_menu_id and idempotency_key = p_idempotency_key;
    if v_publication_id is not null then
      return v_publication_id;
    end if;
  end if;

  select id into v_publication_id from public.menu_publications
  where menu_id = p_menu_id and published_at is null and cancelled_at is null;
  if v_publication_id is not null then
    return v_publication_id;
  end if;

  if v_menu.state <> 'prepared' then
    raise exception 'Solo un menú preparado se puede mandar a publicar (estado actual: %)', v_menu.state;
  end if;

  -- RN-MEN-13 / §85 / RN-FIN-12: con el servicio detenido no se piden publicaciones.
  perform public.assert_establishment_service_running(v_menu.establishment_id);

  if public.establishment_daily_menu_subscription(v_menu.establishment_id) is null then
    raise exception 'El restaurante no tiene Menú Diario, ni contratado ni en su plan';
  end if;

  -- RN-CRE-22 · no se consume nada. Si se pidió antes de las 21:00 del día
  -- anterior se sigue apuntando como hecho; ya no promete nada (RN-CRE-24).
  v_before_cutoff := now() <= public.menu_cutoff_at(v_menu.target_date, v_menu.space_id);

  insert into public.menu_publications
    (space_id, establishment_id, menu_id, requested_by, requested_version_id, idempotency_key,
     cycle_id, debit_entry_id, requested_before_cutoff)
  values
    (v_menu.space_id, v_menu.establishment_id, p_menu_id, auth.uid(), v_menu.current_version_id,
     p_idempotency_key, null, null, v_before_cutoff)
  returning id into v_publication_id;

  perform public.record_menu_event(p_menu_id, v_publication_id, 'prepared', 'publication_requested');
  perform public.record_menu_event(p_menu_id, v_publication_id, 'publication_requested', 'pending_assignment');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.publication_requested', 'menu', p_menu_id,
          jsonb_build_object('publication_id', v_publication_id, 'version_id', v_menu.current_version_id,
                             'consumes', false, 'republication', v_menu.published_version_id is not null));

  -- RN-ASG-04, aplicado a Menú Diario: con un único candidato válido se
  -- asigna solo; con varios o ninguno queda pendiente y avisa al equipo.
  select count(*), min(c::text)::uuid into v_candidate_count, v_worker_id
  from public.menu_candidate_ids(p_menu_id) as c;

  if v_candidate_count = 1 then
    update public.menu_publications
    set assigned_to = v_worker_id, assigned_at = now(), assignment_mode = 'auto'
    where id = v_publication_id;

    perform public.record_menu_event(p_menu_id, v_publication_id, 'pending_assignment', 'assigned', 'Asignación automática');

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (v_menu.space_id, auth.uid(), 'menu.assigned', 'menu', p_menu_id,
            jsonb_build_object('publication_id', v_publication_id, 'assigned_to', v_worker_id, 'mode', 'auto'));

    perform public.notify_menu_event(p_menu_id, 'menu_assigned');
  else
    perform public.notify_menu_event(p_menu_id, 'menu_publication_requested');
  end if;

  return v_publication_id;
end;
$function$;

create or replace function public.cancel_menu(p_menu_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
  v_credit_id uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para cancelar este menú';
  end if;

  if v_menu.state = 'cancelled' then
    return; -- CA-17
  end if;

  if v_menu.state = 'published' then
    raise exception 'Un menú publicado no se cancela (§60): cámbialo si hace falta (RN-CRE-30)';
  end if;

  select * into v_pub from public.menu_publications
  where menu_id = p_menu_id and published_at is null and cancelled_at is null
  for update;

  if v_pub.id is not null then
    if p_reason is null or length(btrim(p_reason)) = 0 then
      raise exception 'Cancelar una publicación pedida necesita un motivo (RN-CON-12)';
    end if;

    update public.menu_publications
    set cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = btrim(p_reason)
    where id = v_pub.id;

    -- RN-CON-08 · solo si consumió: las de antes de la migración 152.
    if v_pub.debit_entry_id is not null then
      v_credit_id := public.credit_menu_update(v_pub, btrim(p_reason));
    end if;
  end if;

  update public.menus set cancelled_at = now() where id = p_menu_id;
  perform public.record_menu_event(p_menu_id, v_pub.id, v_menu.state, 'cancelled', nullif(btrim(p_reason), ''));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_menu.space_id, auth.uid(), 'menu.cancelled', 'menu', p_menu_id,
          jsonb_build_object('state', v_menu.state),
          jsonb_build_object('state', 'cancelled', 'publication_id', v_pub.id, 'credit_entry_id', v_credit_id),
          nullif(btrim(p_reason), ''));
end;
$function$;

create or replace function public.refund_menu_update(p_publication_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pub public.menu_publications;
  v_existing uuid;
  v_id uuid;
begin
  select * into v_pub from public.menu_publications where id = p_publication_id for update;
  if v_pub.id is null then
    raise exception 'Publicación no encontrada';
  end if;

  if not public.has_capability(v_pub.space_id, 'manage_requests') then
    raise exception 'Solo el propietario o un administrador devuelven una actualización';
  end if;

  -- RN-CRE-22 · una publicación que no consumió no tiene nada que devolver.
  if v_pub.debit_entry_id is null then
    raise exception 'Esta publicación no gastó nada: no hay nada que devolver (RN-CRE-22)';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'La devolución necesita un motivo (RN-CON-12)';
  end if;

  select id into v_existing from public.menu_update_entries
  where publication_id = p_publication_id and entry_type in ('return', 'compensatory_credit');
  if v_existing is not null then
    return v_existing; -- CA-17
  end if;

  v_id := public.credit_menu_update(v_pub, btrim(p_reason));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_pub.space_id, auth.uid(), 'menu.update_refunded', 'menu', v_pub.menu_id,
          jsonb_build_object('publication_id', p_publication_id, 'credit_entry_id', v_id), btrim(p_reason));

  return v_id;
end;
$function$;

-- Sin contador no hay saldo: sin filas, como sin servicio. La pantalla ya
-- no la pregunta; se queda para quien la llame y no reciba un error.
create or replace function public.menu_update_balance(p_establishment_id uuid)
 RETURNS TABLE(cycle_id uuid, cycle_start timestamp with time zone, cycle_end timestamp with time zone, included_updates integer, consumed integer, available integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_read_establishment(p_establishment_id) then
    raise exception 'No tienes acceso a este restaurante';
  end if;
  return; -- RN-CRE-22 · ya no hay contador de actualizaciones.
end;
$function$;

-- ------------------------------------------------------------
-- 3 · RN-CRE-22 · un menú del día por restaurante y fecha
-- ------------------------------------------------------------
create unique index menus_one_daily_per_date
  on public.menus (establishment_id, target_date)
  where kind = 'daily' and state <> 'cancelled';

create or replace function public.assert_one_daily_menu_internal(
  p_establishment_id uuid, p_kind text, p_target_date date, p_except uuid)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_kind = 'daily' and exists (
    select 1 from public.menus m
    where m.establishment_id = p_establishment_id and m.target_date = p_target_date
      and m.kind = 'daily' and m.state <> 'cancelled'
      and (p_except is null or m.id <> p_except)
  ) then
    raise exception 'Ya hay un menú del día para el % en este restaurante: edítalo (RN-CRE-22)',
      to_char(p_target_date, 'DD/MM/YYYY');
  end if;
end;
$$;

revoke all on function public.assert_one_daily_menu_internal(uuid, text, date, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4 · RN-CRE-23 · la plantilla para publicar y la de imprimir
-- ------------------------------------------------------------
alter table public.menu_templates
  add column purpose text not null default 'publish' check (purpose in ('publish', 'print'));

comment on column public.menu_templates.purpose is
  'RN-CRE-23 · para qué sirve: publish (la web) o print (imprimir en blanco y negro). Una activa de cada.';

grant select (purpose) on public.menu_templates to authenticated;

create unique index menu_templates_one_active_per_purpose
  on public.menu_templates (establishment_id, purpose)
  where archived_at is null;

-- La plantilla para publicar vigente del restaurante.
create or replace function public.establishment_publish_template_internal(p_establishment_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select t.id from public.menu_templates t
  where t.establishment_id = p_establishment_id and t.purpose = 'publish' and t.archived_at is null
  limit 1;
$$;

revoke all on function public.establishment_publish_template_internal(uuid) from public, anon, authenticated;

drop function public.create_menu_template(uuid, text, text, uuid);

create function public.create_menu_template(p_establishment_id uuid, p_name text, p_origin text DEFAULT 'included'::text, p_quote_id uuid DEFAULT NULL::uuid, p_purpose text DEFAULT 'publish'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_quote public.quotes;
  v_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para crear plantillas de Menú Diario en este restaurante';
  end if;

  if public.establishment_daily_menu_subscription(p_establishment_id) is null then
    raise exception 'El restaurante no tiene Menú Diario, ni contratado ni en su plan';
  end if;

  if p_origin not in ('included', 'quoted') then
    raise exception 'Origen de plantilla desconocido: %', p_origin;
  end if;

  if p_purpose not in ('publish', 'print') then
    raise exception 'Una plantilla es para publicar o para imprimir';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'La plantilla necesita un nombre';
  end if;

  perform 1 from public.establishments where id = p_establishment_id for update;

  -- RN-CRE-23 · una activa de cada: la nueva sustituye a la anterior, que
  -- se archiva antes (y queda en el historial).
  if exists (
    select 1 from public.menu_templates
    where establishment_id = p_establishment_id and purpose = p_purpose and archived_at is null
  ) then
    raise exception 'Ya tiene una plantilla para % activa: archívala antes de crear la nueva (RN-CRE-23)',
      case p_purpose when 'publish' then 'publicar' else 'imprimir' end;
  end if;

  if p_origin = 'included' then
    if p_quote_id is not null then
      raise exception 'Una plantilla incluida no lleva presupuesto';
    end if;

    -- RN-CRE-23 · una incluida de cada, una sola vez: archivarla no libera la plaza.
    if exists (
      select 1 from public.menu_templates
      where establishment_id = p_establishment_id and origin = 'included' and purpose = p_purpose
    ) then
      raise exception 'La plantilla incluida para % ya se usó (RN-CRE-23): una nueva gasta créditos o se presupuesta',
        case p_purpose when 'publish' then 'publicar' else 'imprimir' end;
    end if;
  else
    -- RN-MEN-11 / RN-CRE-23: una plantilla nueva cuelga de un presupuesto
    -- aceptado de ESTE restaurante y de plantilla.
    if p_quote_id is null then
      raise exception 'Una plantilla presupuestada cuelga de un presupuesto aceptado (RN-MEN-11)';
    end if;

    select * into v_quote from public.quotes where id = p_quote_id;
    if v_quote.id is null or v_quote.establishment_id <> p_establishment_id then
      raise exception 'El presupuesto no es de este restaurante';
    end if;
    if v_quote.outcome <> 'menu_template' then
      raise exception 'Ese presupuesto no es de una plantilla de Menú Diario';
    end if;
    if v_quote.state <> 'accepted' then
      raise exception 'El presupuesto de la plantilla no está aceptado';
    end if;
  end if;

  insert into public.menu_templates (space_id, establishment_id, name, origin, quote_id, purpose, created_by)
  values (v_space_id, p_establishment_id, btrim(p_name), p_origin, p_quote_id, p_purpose, auth.uid())
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'menu_template.created', 'menu_template', v_id,
          jsonb_build_object('establishment_id', p_establishment_id, 'name', btrim(p_name), 'origin', p_origin,
                             'quote_id', p_quote_id, 'purpose', p_purpose));

  return v_id;
end;
$function$;

revoke all on function public.create_menu_template(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.create_menu_template(uuid, text, text, uuid, text) to authenticated;

-- Crear: un menú del día por fecha, y la plantilla la pone el servidor.
create or replace function public.create_menu(p_establishment_id uuid, p_name text, p_kind text, p_target_date date, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_template uuid;
  v_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.can_write_menus(p_establishment_id) then
    raise exception 'No tienes permiso para preparar menús en este restaurante';
  end if;

  if public.establishment_daily_menu_subscription(p_establishment_id) is null then
    raise exception 'El restaurante no tiene Menú Diario, ni contratado ni en su plan';
  end if;

  -- RN-CRE-23 · el restaurante no elige: la plantilla para publicar vigente.
  -- Si alguien manda una, tiene que ser esa misma o, al menos, una para
  -- publicar de este restaurante.
  if p_template_id is not null and not exists (
    select 1 from public.menu_templates t
    where t.id = p_template_id and t.establishment_id = p_establishment_id and t.archived_at is null
      and t.purpose = 'publish'
  ) then
    raise exception 'La plantilla no es la de publicar de este restaurante o está archivada';
  end if;
  v_template := coalesce(p_template_id, public.establishment_publish_template_internal(p_establishment_id));

  -- RN-CRE-22 · un menú del día por fecha.
  perform public.assert_one_daily_menu_internal(p_establishment_id, p_kind, p_target_date, null);

  insert into public.menus (space_id, establishment_id, name, kind, target_date, template_id, created_by)
  values (v_space_id, p_establishment_id, btrim(p_name), p_kind, p_target_date, v_template, auth.uid())
  returning id into v_id;

  perform public.record_menu_event(v_id, null, null, 'draft');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'menu.created', 'menu', v_id,
          jsonb_build_object('establishment_id', p_establishment_id, 'name', btrim(p_name),
                             'kind', p_kind, 'target_date', p_target_date));

  return v_id;
end;
$function$;

create or replace function public.update_menu_details(p_menu_id uuid, p_name text, p_kind text, p_target_date date, p_template_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_menu public.menus;
  v_template uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para editar este menú';
  end if;

  if v_menu.state in ('published', 'cancelled') then
    raise exception 'Un menú publicado o cancelado no cambia de nombre, tipo ni fecha';
  end if;

  if p_template_id is not null and not exists (
    select 1 from public.menu_templates t
    where t.id = p_template_id and t.establishment_id = v_menu.establishment_id and t.archived_at is null
      and t.purpose = 'publish'
  ) then
    raise exception 'La plantilla no es la de publicar de este restaurante o está archivada';
  end if;
  v_template := coalesce(p_template_id, v_menu.template_id,
                         public.establishment_publish_template_internal(v_menu.establishment_id));

  perform public.assert_one_daily_menu_internal(v_menu.establishment_id, p_kind, p_target_date, p_menu_id);

  update public.menus
  set name = btrim(p_name), kind = p_kind, target_date = p_target_date,
      template_id = v_template, updated_at = now()
  where id = p_menu_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.details_updated', 'menu', p_menu_id,
          jsonb_build_object('name', v_menu.name, 'kind', v_menu.kind, 'target_date', v_menu.target_date,
                             'template_id', v_menu.template_id),
          jsonb_build_object('name', btrim(p_name), 'kind', p_kind, 'target_date', p_target_date,
                             'template_id', v_template));
end;
$function$;

-- Preparar: si todavía no tiene plantilla, la de publicar vigente.
create or replace function public.prepare_menu(p_menu_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_menu public.menus;
  v_template uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para preparar este menú';
  end if;

  if v_menu.state = 'prepared' then
    return; -- CA-17
  end if;

  if v_menu.state <> 'draft' then
    raise exception 'Solo un borrador se marca como preparado (estado actual: %)', v_menu.state;
  end if;

  if v_menu.current_version_id is null then
    raise exception 'El menú no tiene contenido guardado';
  end if;

  -- RN-CRE-23 · la plantilla la pone el servidor: la de publicar vigente.
  v_template := coalesce(
    (select t.id from public.menu_templates t where t.id = v_menu.template_id and t.archived_at is null),
    public.establishment_publish_template_internal(v_menu.establishment_id));
  if v_template is null then
    raise exception 'Tu plantilla para publicar todavía no está lista: la prepara el equipo (RN-CRE-23)';
  end if;
  if v_template is distinct from v_menu.template_id then
    update public.menus set template_id = v_template where id = p_menu_id;
  end if;

  perform public.record_menu_event(p_menu_id, null, 'draft', 'prepared');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.prepared', 'menu', p_menu_id,
          jsonb_build_object('state', 'draft'), jsonb_build_object('state', 'prepared'));
end;
$function$;

-- Descargar: la de publicar para el archivo de la web y la de imprimir
-- para el papel (RN-CRE-23). Mismo cuerpo que la migración 144 con la
-- plantilla que toca según se imprima o no.
create or replace function public.register_menu_download(p_menu_id uuid, p_format text, p_print boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
  v_by_team boolean;
  v_template uuid;
  v_id uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null or not public.can_read_menu_establishment(v_menu.establishment_id) then
    raise exception 'Menú no encontrado';
  end if;

  if p_format not in ('png', 'pdf') then
    raise exception 'Formato desconocido: %', p_format;
  end if;

  if coalesce(p_print, false) and p_format <> 'pdf' then
    raise exception 'Solo se imprime el PDF';
  end if;

  if v_menu.current_version_id is null then
    raise exception 'El menú no tiene contenido guardado';
  end if;

  if coalesce(p_print, false) then
    -- RN-CRE-23 · el papel sale en la plantilla para imprimir en blanco y negro.
    select t.id into v_template from public.menu_templates t
    where t.establishment_id = v_menu.establishment_id and t.purpose = 'print' and t.archived_at is null
    limit 1;
    if v_template is null then
      raise exception 'Tu plantilla para imprimir todavía no está lista: la prepara el equipo (RN-CRE-23)';
    end if;
  else
    v_template := coalesce(v_menu.template_id, public.establishment_publish_template_internal(v_menu.establishment_id));
    if v_template is null then
      raise exception 'El menú necesita una plantilla';
    end if;
  end if;

  v_by_team := public.is_space_member(v_menu.space_id);

  insert into public.menu_downloads
    (space_id, establishment_id, menu_id, version_id, template_id, format, by_team, downloaded_by, printed)
  values
    (v_menu.space_id, v_menu.establishment_id, p_menu_id, v_menu.current_version_id, v_template,
     p_format, v_by_team, auth.uid(), coalesce(p_print, false))
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.downloaded', 'menu', p_menu_id,
          jsonb_build_object('download_id', v_id, 'format', p_format,
                             'version_id', v_menu.current_version_id, 'template_id', v_template,
                             'by_team', v_by_team, 'printed', coalesce(p_print, false)));

  -- §61, paso 4: el trabajador asignado descarga la plantilla generada →
  -- "Listo para publicar". Solo él, solo desde asignado o revisando, y
  -- solo si descarga: imprimir no es preparar la publicación.
  if v_by_team and not coalesce(p_print, false) and v_menu.state in ('assigned', 'reviewing') then
    select * into v_pub from public.menu_publications
    where menu_id = p_menu_id and published_at is null and cancelled_at is null;

    if v_pub.id is not null and v_pub.assigned_to = auth.uid() then
      perform public.record_menu_event(p_menu_id, v_pub.id, v_menu.state, 'ready_to_publish',
                                       'Archivo descargado por el equipo');

      insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
      values (v_menu.space_id, auth.uid(), 'menu.ready_to_publish', 'menu', p_menu_id,
              jsonb_build_object('state', v_menu.state), jsonb_build_object('state', 'ready_to_publish', 'via', 'download'));
    end if;
  end if;

  return v_id;
end;
$function$;

-- ------------------------------------------------------------
-- 5 · RN-CRE-30 · un menú del día publicado se cambia editándolo
-- ------------------------------------------------------------
create or replace function public.save_menu_version(p_menu_id uuid, p_starters text[], p_mains text[], p_desserts text[], p_drink text DEFAULT NULL::text, p_price_cents integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text, p_expected_version integer DEFAULT NULL::integer, p_allergen_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_menu public.menus;
  v_version integer;
  v_after_cutoff boolean;
  v_id uuid;
  v_actual integer;
  v_alergenos text := nullif(btrim(coalesce(p_allergen_note, '')), '');
  v_republica boolean;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para editar este menú';
  end if;

  -- RN-CRE-30 · el menú del día publicado se cambia editándolo; los demás
  -- tipos siguen como RN-MEN-03 (publicado, se copia).
  v_republica := v_menu.state = 'published' and v_menu.kind = 'daily';

  if v_menu.state = 'cancelled' or (v_menu.state = 'published' and not v_republica) then
    raise exception 'Un menú publicado o cancelado no se edita: copia el menú para crear un borrador nuevo';
  end if;

  if v_republica then
    -- §85 · con el servicio detenido no se cambia lo publicado.
    perform public.assert_establishment_service_running(v_menu.establishment_id);
  end if;

  if v_alergenos is not null and char_length(v_alergenos) > 200 then
    raise exception 'La nota de alérgenos no puede pasar de 200 caracteres';
  end if;

  select coalesce(max(version), 0) into v_actual
  from public.menu_versions where menu_id = p_menu_id;

  -- A17 · alguien guardó entre que esta persona abrió el editor y pulsó.
  if p_expected_version is not null and p_expected_version <> v_actual then
    raise exception 'EDICION_SIMULTANEA: el menú va por la versión %, no por la %', v_actual, p_expected_version
      using errcode = '40001';
  end if;

  v_version := v_actual + 1;
  -- Un hecho, no una promesa (RN-CRE-24).
  v_after_cutoff := now() > public.menu_cutoff_at(v_menu.target_date, v_menu.space_id);

  insert into public.menu_versions
    (space_id, menu_id, version, starters, mains, desserts, drink, price_cents, note,
     allergen_note, after_cutoff, created_by)
  values
    (v_menu.space_id, p_menu_id, v_version, coalesce(p_starters, '{}'), coalesce(p_mains, '{}'),
     coalesce(p_desserts, '{}'), nullif(btrim(p_drink), ''), p_price_cents, nullif(btrim(p_note), ''),
     v_alergenos, v_after_cutoff, auth.uid())
  returning id into v_id;

  update public.menus set current_version_id = v_id, updated_at = now() where id = p_menu_id;

  if v_republica then
    -- La web sigue con `published_version_id` hasta que el equipo publique
    -- la nueva; el menú vuelve a borrador con cambios sin publicar.
    perform public.record_menu_event(p_menu_id, null, 'published', 'draft',
      'Cambio tras publicar: versión ' || v_version || ' (RN-CRE-30)');
  elsif v_menu.state = 'needs_information' then
    perform public.record_menu_event(p_menu_id,
      (select id from public.menu_publications where menu_id = p_menu_id and published_at is null and cancelled_at is null),
      'needs_information', 'reviewing', 'Versión ' || v_version || ' guardada por el restaurante');
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.version_saved', 'menu', p_menu_id,
          jsonb_build_object('version', v_version, 'version_id', v_id, 'after_cutoff', v_after_cutoff,
                             'has_allergen_note', v_alergenos is not null, 'after_publication', v_republica));

  return v_id;
end;
$function$;

-- ------------------------------------------------------------
-- 6 · RN-CRE-24 · sin hora de corte: ni recordatorio ni aviso ni corrección
-- ------------------------------------------------------------
create or replace function public.run_daily_menu_sweep(p_space_id uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- RN-CRE-24 · desaparecen el recordatorio de las 20:00 (RN-MEN-08) y el
  -- aviso de las 08:00 (§62). El barrido sigue en la cola por si un día
  -- vuelve a tener algo que hacer; hoy no emite nada.
  return 0;
end;
$function$;

-- Sin `security definer`: no toca nada, solo dice por qué ya no existe.
create or replace function public.request_menu_correction(p_menu_id uuid, p_description text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
begin
  raise exception 'Ya no hay corrección del menú publicado: cámbialo y pide publicarlo otra vez (RN-CRE-24, RN-CRE-30)';
end;
$function$;

-- ------------------------------------------------------------
-- 7 · RN-CRE-21 · crear y editar planes con Menú Diario incluido
-- ------------------------------------------------------------
drop function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, boolean, boolean, integer, text, boolean, text, text, integer);

create function public.create_plan(p_space_id uuid, p_name text, p_price_cents integer, p_included_small integer, p_included_photo integer, p_included_medium integer, p_included_large integer, p_start_sla_hours integer, p_execution_sla_small integer, p_execution_sla_photo integer, p_execution_sla_medium integer, p_execution_sla_large integer, p_can_order_requests boolean, p_grants_priority boolean, p_queue_rank integer, p_report_level text, p_watches_reviews boolean, p_idempotency_key text, p_report_period text DEFAULT NULL::text, p_included_credits_half integer DEFAULT NULL::integer, p_includes_daily_menu boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_period text := coalesce(p_report_period, 'month');
  v_credits integer := coalesce(p_included_credits_half, 0);
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio crea planes (RN-COM-19)';
  end if;

  if p_idempotency_key is not null then
    select id into v_id from public.plans where space_id = p_space_id and publish_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if v_name = '' then
    raise exception 'El plan necesita un nombre';
  end if;

  if exists (
    select 1 from public.plans
    where space_id = p_space_id and superseded_at is null and archived_at is null
      and lower(name) = lower(v_name)
  ) then
    raise exception 'Ya hay un plan con ese nombre';
  end if;

  perform public.assert_plan_terms(p_price_cents, p_included_small, p_included_photo, p_included_medium,
    p_included_large, p_start_sla_hours, p_execution_sla_small, p_execution_sla_photo,
    p_execution_sla_medium, p_execution_sla_large, p_report_level);

  if v_period not in ('month', 'quarter') then
    raise exception 'Periodo de informe desconocido: %', v_period;
  end if;

  if v_credits < 0 then
    raise exception 'Los créditos incluidos no pueden ser negativos';
  end if;

  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium, included_large,
     start_sla_hours, execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large,
     can_order_requests, grants_priority, queue_rank, report_level, report_period, watches_reviews,
     included_credits_half, includes_daily_menu, published_by, publish_key)
  values
    (p_space_id, v_name, p_price_cents, p_included_small, p_included_photo, p_included_medium, p_included_large,
     p_start_sla_hours, p_execution_sla_small, p_execution_sla_photo, p_execution_sla_medium, p_execution_sla_large,
     coalesce(p_can_order_requests, false), coalesce(p_grants_priority, false), coalesce(p_queue_rank, 0),
     p_report_level, v_period, coalesce(p_watches_reviews, false),
     v_credits, coalesce(p_includes_daily_menu, false), auth.uid(), p_idempotency_key)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  select p_space_id, auth.uid(), 'plan.created', 'plan', v_id, to_jsonb(p) - 'publish_key'
  from public.plans p where p.id = v_id;

  return v_id;
end;
$function$;

revoke all on function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, boolean, boolean, integer, text, boolean, text, text, integer, boolean) from public, anon;
grant execute on function public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, boolean, boolean, integer, text, boolean, text, text, integer, boolean) to authenticated;

drop function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, boolean, boolean, integer, text, boolean, text, text, integer);

create function public.revise_plan(p_plan_id uuid, p_price_cents integer, p_included_small integer, p_included_photo integer, p_included_medium integer, p_included_large integer, p_start_sla_hours integer, p_execution_sla_small integer, p_execution_sla_photo integer, p_execution_sla_medium integer, p_execution_sla_large integer, p_can_order_requests boolean, p_grants_priority boolean, p_queue_rank integer, p_report_level text, p_watches_reviews boolean, p_idempotency_key text, p_report_period text DEFAULT NULL::text, p_included_credits_half integer DEFAULT NULL::integer, p_includes_daily_menu boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_head public.plans%rowtype;
  v_new public.plans%rowtype;
  v_id uuid;
  v_changes jsonb;
begin
  select * into v_head from public.plans where id = p_plan_id for update;

  if v_head.id is null then
    raise exception 'Plan no encontrado';
  end if;

  if not public.has_capability(v_head.space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio edita planes (RN-COM-19)';
  end if;

  if p_idempotency_key is not null then
    select id into v_id from public.plans
    where space_id = v_head.space_id and publish_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if v_head.superseded_at is not null then
    raise exception 'Esta versión ya está sustituida: edita la vigente';
  end if;

  if v_head.archived_at is not null then
    raise exception 'Un plan archivado no se edita';
  end if;

  perform public.assert_plan_terms(p_price_cents, p_included_small, p_included_photo, p_included_medium,
    p_included_large, p_start_sla_hours, p_execution_sla_small, p_execution_sla_photo,
    p_execution_sla_medium, p_execution_sla_large, p_report_level);

  if coalesce(p_report_period, v_head.report_period) not in ('month', 'quarter') then
    raise exception 'Periodo de informe desconocido: %', p_report_period;
  end if;

  if coalesce(p_included_credits_half, v_head.included_credits_half) < 0 then
    raise exception 'Los créditos incluidos no pueden ser negativos';
  end if;

  v_new := v_head;
  v_new.price_cents := p_price_cents;
  v_new.included_small := p_included_small;
  v_new.included_photo := p_included_photo;
  v_new.included_medium := p_included_medium;
  v_new.included_large := p_included_large;
  v_new.start_sla_hours := p_start_sla_hours;
  v_new.execution_sla_small := p_execution_sla_small;
  v_new.execution_sla_photo := p_execution_sla_photo;
  v_new.execution_sla_medium := p_execution_sla_medium;
  v_new.execution_sla_large := p_execution_sla_large;
  v_new.can_order_requests := coalesce(p_can_order_requests, false);
  v_new.grants_priority := coalesce(p_grants_priority, false);
  v_new.queue_rank := coalesce(p_queue_rank, 0);
  v_new.report_level := p_report_level;
  v_new.report_period := coalesce(p_report_period, v_head.report_period);
  v_new.watches_reviews := coalesce(p_watches_reviews, false);
  v_new.included_credits_half := coalesce(p_included_credits_half, v_head.included_credits_half);
  v_new.includes_daily_menu := coalesce(p_includes_daily_menu, v_head.includes_daily_menu);

  select coalesce(jsonb_object_agg(o.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}'::jsonb)
  into v_changes
  from jsonb_each(to_jsonb(v_head)) o
  join jsonb_each(to_jsonb(v_new)) n on n.key = o.key
  where o.value is distinct from n.value;

  if v_changes = '{}'::jsonb then
    raise exception 'No has cambiado ninguna condición del plan';
  end if;

  if not public.plan_lineage_in_use(v_head.lineage_id) then
    update public.plans set
      price_cents = v_new.price_cents,
      included_small = v_new.included_small,
      included_photo = v_new.included_photo,
      included_medium = v_new.included_medium,
      included_large = v_new.included_large,
      start_sla_hours = v_new.start_sla_hours,
      execution_sla_small = v_new.execution_sla_small,
      execution_sla_photo = v_new.execution_sla_photo,
      execution_sla_medium = v_new.execution_sla_medium,
      execution_sla_large = v_new.execution_sla_large,
      can_order_requests = v_new.can_order_requests,
      grants_priority = v_new.grants_priority,
      queue_rank = v_new.queue_rank,
      report_level = v_new.report_level,
      report_period = v_new.report_period,
      watches_reviews = v_new.watches_reviews,
      included_credits_half = v_new.included_credits_half,
      includes_daily_menu = v_new.includes_daily_menu,
      publish_key = coalesce(p_idempotency_key, publish_key)
    where id = v_head.id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_head.space_id, auth.uid(), 'plan.edited', 'plan', v_head.id,
            (select jsonb_object_agg(key, value->'old') from jsonb_each(v_changes)),
            (select jsonb_object_agg(key, value->'new') from jsonb_each(v_changes))
              || jsonb_build_object('in_place', true));

    return v_head.id;
  end if;

  update public.plans set superseded_at = now() where id = v_head.id;

  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium, included_large,
     start_sla_hours, execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large,
     can_order_requests, grants_priority, queue_rank, report_level, report_period, watches_reviews,
     included_credits_half, includes_daily_menu, lineage_id, revision, supersedes_id, published_by, publish_key)
  values
    (v_head.space_id, v_head.name, v_new.price_cents, v_new.included_small, v_new.included_photo,
     v_new.included_medium, v_new.included_large, v_new.start_sla_hours, v_new.execution_sla_small,
     v_new.execution_sla_photo, v_new.execution_sla_medium, v_new.execution_sla_large,
     v_new.can_order_requests, v_new.grants_priority, v_new.queue_rank, v_new.report_level,
     v_new.report_period, v_new.watches_reviews, v_new.included_credits_half, v_new.includes_daily_menu,
     v_head.lineage_id, v_head.revision + 1, v_head.id,
     auth.uid(), p_idempotency_key)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_head.space_id, auth.uid(), 'plan.revised', 'plan', v_head.lineage_id,
          (select jsonb_object_agg(key, value->'old') from jsonb_each(v_changes))
            || jsonb_build_object('plan_id', v_head.id, 'revision', v_head.revision),
          (select jsonb_object_agg(key, value->'new') from jsonb_each(v_changes))
            || jsonb_build_object('plan_id', v_id, 'revision', v_head.revision + 1,
                                  'harms', public.revision_harms_internal('plan', v_head.id, v_id)));

  perform public.notify_revision_published(v_head.space_id, 'plan', v_head.lineage_id, v_id);

  return v_id;
end;
$function$;

revoke all on function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, boolean, boolean, integer, text, boolean, text, text, integer, boolean) from public, anon;
grant execute on function public.revise_plan(uuid, integer, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, boolean, boolean, integer, text, boolean, text, text, integer, boolean) to authenticated;

-- RN-COM-23 y RN-CRE-21 · quitar Menú Diario del plan perjudica; ponerlo, favorece.
create or replace function public.plan_terms_diff_internal(p_from uuid, p_to uuid)
 RETURNS TABLE(field text, old_value text, new_value text, better boolean, client_visible boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.field, d.o, d.n, d.better, d.visible
  from public.plans a
  join public.plans b on b.id = p_to
  cross join lateral (values
    ('price_cents', a.price_cents::text, b.price_cents::text, b.price_cents < a.price_cents, true, 1),
    ('included_credits_half', a.included_credits_half::text, b.included_credits_half::text,
      b.included_credits_half > a.included_credits_half, true, 2),
    ('includes_daily_menu', a.includes_daily_menu::text, b.includes_daily_menu::text,
      b.includes_daily_menu and not a.includes_daily_menu, true, 2),
    ('included_small', a.included_small::text, b.included_small::text, b.included_small > a.included_small, true, 3),
    ('included_photo', a.included_photo::text, b.included_photo::text, b.included_photo > a.included_photo, true, 4),
    ('included_medium', a.included_medium::text, b.included_medium::text, b.included_medium > a.included_medium, true, 5),
    ('included_large', a.included_large::text, b.included_large::text, b.included_large > a.included_large, true, 6),
    ('start_sla_hours', a.start_sla_hours::text, b.start_sla_hours::text, b.start_sla_hours < a.start_sla_hours, true, 7),
    ('execution_sla_small', a.execution_sla_small::text, b.execution_sla_small::text, b.execution_sla_small < a.execution_sla_small, true, 8),
    ('execution_sla_photo', a.execution_sla_photo::text, b.execution_sla_photo::text, b.execution_sla_photo < a.execution_sla_photo, true, 9),
    ('execution_sla_medium', a.execution_sla_medium::text, b.execution_sla_medium::text, b.execution_sla_medium < a.execution_sla_medium, true, 10),
    ('execution_sla_large', a.execution_sla_large::text, b.execution_sla_large::text, b.execution_sla_large < a.execution_sla_large, true, 11),
    ('can_order_requests', a.can_order_requests::text, b.can_order_requests::text, b.can_order_requests and not a.can_order_requests, true, 12),
    ('grants_priority', a.grants_priority::text, b.grants_priority::text, b.grants_priority and not a.grants_priority, true, 13),
    ('report_level', a.report_level, b.report_level,
      public.report_level_rank(b.report_level) > public.report_level_rank(a.report_level), true, 14),
    ('report_period', a.report_period, b.report_period, b.report_period = 'month' and a.report_period = 'quarter', true, 15),
    ('watches_reviews', a.watches_reviews::text, b.watches_reviews::text, b.watches_reviews and not a.watches_reviews, true, 16),
    ('queue_rank', a.queue_rank::text, b.queue_rank::text, b.queue_rank > a.queue_rank, false, 17)
  ) as d(field, o, n, better, visible, ord)
  where a.id = p_from and d.o is distinct from d.n
  order by d.ord;
$function$;
