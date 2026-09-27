-- ============================================================
-- Migración 154 · El catálogo de Restavor en créditos (decisión 85,
--                 PRD §6.1 y §41, RN-CRE-01, 20, 21, 22, 26 y 28)
-- ============================================================
--
-- Punto 7 del plan de la decisión 85: ponerle al catálogo de Restavor lo
-- que dicen las fichas de Impulso y Premium y el documento de créditos.
--
--   · Básico · 20 € + IVA, sin créditos, 48 h, turno 0, informe trimestral.
--     No cambia.
--   · Impulso · **99 €** + IVA, **20 créditos** al mes, 24 h, turno 1,
--     informe mensual y trimestral, **Menú Diario incluido**.
--   · Premium · **199 €** + IVA, **40 créditos** al mes, 24 h, turno 2,
--     informe mensual y trimestral, Menú Diario incluido, y **deja de
--     ordenar sus solicitudes** (RN-CRE-28).
--   · Menú Diario suelto · **199 €** + IVA, sin precio reducido (RN-CRE-21)
--     y sin contador de actualizaciones (RN-CRE-22).
--
-- Impulso y Premium ya no incluyen cambios por categoría: se miden en
-- créditos (decisión 85). El nivel de informe de cada uno no cambia
-- (RN-CRE-26: Impulso `standard`, Premium `advanced`).
--
-- Qué hace:
--
--   1. RN-CRE-22 · quita la regla de que Menú Diario incluya al menos una
--      actualización (`services_daily_menu_has_updates` y la misma
--      comprobación en `assert_service_terms()`): ya no hay contador.
--   2. `create_restavor_space()` siembra el catálogo nuevo.
--   3. En el espacio `restavor` que ya existe, pone el catálogo nuevo en el
--      sitio con `apply_credit_catalogue_internal()`. No hay nadie suscrito
--      (comprobado el 27/09/2026), así que no hacen falta versiones
--      (RN-COM-20); si alguien tuviera uno de estos planes, la función se
--      para y pide publicarlo como versión desde Planes. Idempotente.
--   4. Las guías del centro de ayuda que contaban las reglas de antes
--      (actualizaciones, hora de corte, corrección mínima, ordenar
--      solicitudes) cuentan las de ahora.
--
-- Se comprueba con `supabase/tests/el_catalogo_en_creditos.sql`.

-- ------------------------------------------------------------
-- 1 · RN-CRE-22 · Menú Diario sin contador de actualizaciones
-- ------------------------------------------------------------
alter table public.services drop constraint services_daily_menu_has_updates;

create or replace function public.assert_service_terms(p_kind text, p_price_cents integer, p_price_premium_cents integer, p_included_updates integer)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
begin
  if p_kind not in ('daily_menu', 'other') then
    raise exception 'Tipo de servicio desconocido: %', p_kind;
  end if;
  if p_price_cents is null or p_price_cents < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;
  if p_price_premium_cents is not null and p_price_premium_cents < 0 then
    raise exception 'El precio con Premium+ no puede ser negativo';
  end if;
  if p_included_updates is null or p_included_updates < 0 then
    raise exception 'Las actualizaciones incluidas no pueden ser negativas';
  end if;
  -- RN-CRE-22 · Menú Diario ya no lleva contador: puede no incluir ninguna.
end;
$function$;

-- ------------------------------------------------------------
-- 2 · La semilla de Restavor
-- ------------------------------------------------------------
create or replace function public.create_restavor_space()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_owner_id uuid := auth.uid();
begin
  if not public.is_platform_owner() then
    raise exception 'Solo el propietario de Cuotly puede crear el espacio de Restavor';
  end if;

  if exists (select 1 from public.spaces where slug = 'restavor') then
    raise exception 'El espacio de Restavor ya existe';
  end if;

  insert into public.spaces (name, slug, timezone, created_by)
  values ('Restavor', 'restavor', 'Europe/Madrid', v_owner_id)
  returning id into v_space_id;

  insert into public.space_memberships (space_id, user_id, role, status)
  values (v_space_id, v_owner_id, 'owner', 'active');

  -- Los planes de mantenimiento de Restavor (PRD §6.1 y §41): Básico,
  -- Impulso y Premium (decisiones 84 y 85). Precios en céntimos, más IVA.
  -- Los créditos van en medios créditos: 40 = 20 créditos (RN-CRE-04).
  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium,
     included_large, included_credits_half, start_sla_hours, grants_priority, queue_rank,
     can_order_requests, report_level, report_period, watches_reviews, includes_daily_menu,
     execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large)
  values
    -- RN-COM-03 · `queue_rank` es el turno dentro del mismo plazo: Básico
    -- 0, Impulso 1, Premium 2 (decisiones 55 y 83).
    -- RN-REP-32 y RN-CRE-26 · el Básico recibe el trimestral; Impulso y
    -- Premium, el mensual y el trimestral.
    -- RN-CRE-20 · Impulso y Premium confirman el inicio en 24 h; el Básico, 48.
    -- RN-CRE-21 · Menú Diario incluido en Impulso y Premium.
    -- RN-CRE-28 · ninguno ordena sus solicitudes.
    (v_space_id, 'Básico',    2000, 0, 0, 0, 0,  0, 48, false, 0, false, 'basic',    'quarter', false, false, 72, 72, 72, 120),
    (v_space_id, 'Impulso',   9900, 0, 0, 0, 0, 40, 24, false, 1, false, 'standard', 'both',    false, true,  72, 72, 72, 120),
    (v_space_id, 'Premium',  19900, 0, 0, 0, 0, 80, 24, false, 2, false, 'advanced', 'both',    false, true,  72, 72, 72, 120);

  -- Servicio Menú Diario suelto (RN-CRE-21): 199 € + IVA para quien no lo
  -- tiene en su plan, también con Básico. Sin precio reducido y sin
  -- contador de actualizaciones (RN-CRE-22).
  insert into public.services (space_id, name, price_cents, price_premium_cents, kind, included_updates)
  values (v_space_id, 'Menú Diario', 19900, null, 'daily_menu', 0);

  insert into public.space_working_hours (space_id, calendar_kind, timezone, created_by)
  values
    (v_space_id, 'contractual', 'Europe/Madrid', v_owner_id),
    (v_space_id, 'support', 'Europe/Madrid', v_owner_id),
    (v_space_id, 'menu_diario', 'Europe/Madrid', v_owner_id);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id,
    v_owner_id,
    'space.created',
    'space',
    v_space_id,
    jsonb_build_object('name', 'Restavor', 'slug', 'restavor', 'via', 'create_restavor_space')
  );

  return v_space_id;
end;
$function$;

revoke all on function public.create_restavor_space() from public, anon;
grant execute on function public.create_restavor_space() to authenticated;

-- ------------------------------------------------------------
-- 3 · El espacio de Restavor que ya existe
-- ------------------------------------------------------------
--
-- En una función, como las migraciones 96, 146 y 148, para que la suite
-- pueda ejecutarla sobre un espacio de prueba con el catálogo viejo. Es
-- interna: nadie la llama por RPC (CLAUDE.md).
--
-- Idempotente: solo toca lo que todavía no está como dice la ficha, y el
-- apunte solo se escribe cuando cambia algo.
create or replace function public.apply_credit_catalogue_internal(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_old jsonb;
  v_new jsonb;
  v_menu public.services%rowtype;
begin
  for r in
    select p.*, t.price, t.credits, t.rank
    from public.plans p
    join (values ('Impulso', 9900, 40, 1), ('Premium', 19900, 80, 2)) as t(name, price, credits, rank)
      on t.name = p.name
    where p.space_id = p_space_id and p.superseded_at is null and p.archived_at is null
    for update of p
  loop
    v_old := jsonb_build_object(
      'price_cents', r.price_cents, 'included_credits_half', r.included_credits_half,
      'included_small', r.included_small, 'included_photo', r.included_photo,
      'included_medium', r.included_medium, 'included_large', r.included_large,
      'start_sla_hours', r.start_sla_hours, 'queue_rank', r.queue_rank,
      'can_order_requests', r.can_order_requests, 'report_period', r.report_period,
      'includes_daily_menu', r.includes_daily_menu);
    v_new := jsonb_build_object(
      'price_cents', r.price, 'included_credits_half', r.credits,
      'included_small', 0, 'included_photo', 0, 'included_medium', 0, 'included_large', 0,
      'start_sla_hours', 24, 'queue_rank', r.rank,
      'can_order_requests', false, 'report_period', 'both',
      'includes_daily_menu', true);

    continue when v_old = v_new;

    -- RN-COM-20 · lo que alguien tiene contratado no se reescribe en el
    -- sitio. Aquí no hay nadie; si lo hubiera, se para.
    if public.plan_lineage_in_use(r.lineage_id) then
      raise exception 'El plan % de Restavor ya lo tiene algún restaurante: publícalo como versión nueva desde Planes (RN-COM-20)', r.name;
    end if;

    update public.plans
    set price_cents = r.price, included_credits_half = r.credits,
        included_small = 0, included_photo = 0, included_medium = 0, included_large = 0,
        start_sla_hours = 24, queue_rank = r.rank, can_order_requests = false,
        report_period = 'both', includes_daily_menu = true
    where id = r.id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (p_space_id, null, 'plan.edited', 'plan', r.id, v_old,
            v_new || jsonb_build_object('in_place', true,
                                        'via', 'migración 154 · el catálogo de Restavor en créditos'));
  end loop;

  -- Menú Diario suelto: 199 €, sin precio reducido y sin contador.
  select * into v_menu
  from public.services
  where space_id = p_space_id and kind = 'daily_menu' and superseded_at is null and archived_at is null
  for update;

  if v_menu.id is not null
     and (v_menu.price_cents <> 19900 or v_menu.price_premium_cents is not null or v_menu.included_updates <> 0) then
    if exists (select 1 from public.subscriptions s
               join public.services sv on sv.id = s.service_id
               where sv.lineage_id = v_menu.lineage_id and s.status = 'active') then
      raise exception 'El servicio Menú Diario de Restavor ya lo tiene algún restaurante: publícalo como versión nueva desde Planes (RN-COM-20)';
    end if;

    update public.services
    set price_cents = 19900, price_premium_cents = null, included_updates = 0
    where id = v_menu.id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (p_space_id, null, 'service.edited', 'service', v_menu.id,
            jsonb_build_object('price_cents', v_menu.price_cents, 'price_premium_cents', v_menu.price_premium_cents,
                               'included_updates', v_menu.included_updates),
            jsonb_build_object('price_cents', 19900, 'price_premium_cents', null, 'included_updates', 0,
                               'in_place', true, 'via', 'migración 154 · el catálogo de Restavor en créditos'));
  end if;
end;
$$;

comment on function public.apply_credit_catalogue_internal(uuid) is
  'Interna, 27/09/2026 (decisión 85) · pone en un espacio con el catálogo de
   Restavor el Impulso de 99 € y el Premium de 199 € en créditos, con Menú
   Diario incluido y los dos informes, y Menú Diario suelto a 199 € sin
   contador. Solo en el sitio: si alguien los tiene, se para. Idempotente.';

revoke all on function public.apply_credit_catalogue_internal(uuid) from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in select id from public.spaces where slug = 'restavor' loop
    perform public.apply_credit_catalogue_internal(r.id);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4 · Las guías del centro de ayuda (RN-SOP-10)
-- ------------------------------------------------------------
--
-- Las guías se versionan por migración: cambiar una es una versión más.
-- Cada una solo se toca si todavía cuenta lo de antes.
update public.help_articles
set
  body = 'Las mensualidades de tus restaurantes se emiten solas el día uno y quedan registradas en un libro de apuntes con signo: emitir suma, cobrar resta y reembolsar vuelve a sumar. Nunca hay un saldo que se edite a mano. El estado de cada cobro se deriva del libro y del vencimiento.
Los planes que vendes son Básico, Impulso y Premium, más IVA, con tres meses de permanencia y sin bolsas de horas. El Básico no incluye cambios; Impulso y Premium traen cada mes sus créditos para cambios y llevan Menú Diario incluido.
Tu suscripción a Cuotly es otra cosa: Pro (149 € al mes, 5 establecimientos y 5 usuarios, adicionales a 25 € y 15 €) o Agency (499 € al mes), más IVA, con 7 días de prueba. Se paga también por transferencia o Bizum, la confirma Cuotly, y un impago archiva el espacio en solo lectura a las 72 horas del vencimiento, recuperable durante 30 días pagando. Todo esto lo ves en Ajustes, en Suscripción.',
  version = version + 1,
  updated_at = now()
where slug = 'cobros-a-tus-restaurantes-y-tu-suscripcion'
  and body like '%no incluye cambios ni fotografías%';

update public.help_articles
set
  body = 'Las publicaciones pendientes entran en la cola de Menú Diario, separada de la de trabajos. Se asignan como un trabajo pero usan un tercer calendario: todos los días del año, festivos incluidos, porque un restaurante abre cuando abre.
Al publicar se guarda la evidencia y el menú queda como publicado para el restaurante. Si la publicación falla, el error queda registrado sin datos sensibles y el restaurante recibe el aviso con el motivo.
Hay un menú del día por restaurante y fecha. Si el restaurante cambia uno ya publicado, vuelve a borrador, pide publicarlo otra vez y la publicación nueva sustituye a la anterior. Pedir la publicación no gasta nada: Menú Diario no lleva contador.',
  version = version + 1,
  updated_at = now()
where slug = 'menu-diario-para-el-equipo'
  and body like '%contador de actualizaciones%';

update public.help_articles
set
  body = 'Si tienes Menú Diario, contratado aparte o incluido en tu plan, en tu ficha aparece la sección con tus menús. Escribes el menú del día a la hora que quieras, pulsas Guardar y pides la publicación; el equipo lo publica en tu web. No hay botón "Comenzar": un menú se pide y se publica.
Hay un menú del día por fecha y puedes cambiarlo sin límite: si ya estaba publicado, vuelve a borrador y en tu web sigue el anterior hasta que el equipo publique el nuevo. No eliges plantilla: cada menú sale en la tuya para publicar y en la de imprimir en blanco y negro. Pedir la publicación no gasta nada.
Si al publicar hay un error o te falta información, te lo decimos con el motivo.',
  version = version + 1,
  updated_at = now()
where slug = 'menu-diario-preparar-y-publicar'
  and body like '%30 actualizaciones%';

update public.help_articles
set
  body = 'Desde la ficha de tu restaurante pulsa "Pedir un cambio". Puedes guardar un borrador y volver más tarde: nadie lo ve hasta que lo envías. Adjunta capturas, documentos o imágenes de hasta 25 MB; no se admiten vídeos.
Cada solicitud tiene una conversación. Un mensaje se puede editar durante diez minutos después de enviarlo y no se elimina nunca. Cuando la solicitud se cierra, la conversación queda en solo lectura: si necesitas algo más, abre una solicitud nueva.
Si tu plan trae créditos, cada cambio se valora en créditos y lo aceptas viendo qué parte de tu plan gasta antes de que el equipo empiece. Si no te llegan, puedes quitar cosas, esperar al mes siguiente o pedir presupuesto aparte.',
  version = version + 1,
  updated_at = now()
where slug = 'pedir-un-cambio-a-tu-equipo'
  and body like '%ordenar tus cambios pendientes%';
