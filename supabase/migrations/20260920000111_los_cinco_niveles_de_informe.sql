-- ============================================================
-- Migración 111 · Los cinco niveles de informe (RN-REP-15/16, decisión 56)
-- ============================================================
--
-- La página 97 del diseño definitivo móvil ("Versiones de plan") enseña
-- **"Informes"** en la comparativa de versiones, junto a "Prioridad" y a
-- los cambios incluidos, y una línea del resumen de cambios dice *"Se
-- mejora el nivel de informes a Avanzado"*. Es decir: el nivel de informe
-- **es un atributo del plan y se versiona como los demás**.
--
-- Bosco dio los niveles el 20/09/2026, y son **cinco**, no dos: *"Básico
-- tiene un informe básico, Impulso tiene un informe estándar, Impulso+ un
-- estándar+, Premium un avanzado y Premium+ un informe completo en el que
-- está detallado todo"*.
--
-- **No se deduce del nombre del plan.** Cuotly es multiempresa (CLAUDE.md)
-- y otro espacio pondrá los niveles donde quiera; lo que sigue abajo es el
-- reparto de **Restavor**, que es un dato de producto como los precios.
--
-- **Dos cosas que esta migración hace y conviene no deshacer:**
--
--   1. **El nivel es una BARRERA, no una sugerencia.** Una sección que el
--      nivel no permite no se puede incluir: ni al preparar el borrador ni
--      marcándola a mano después. Si bastara con la casilla, un Básico
--      recibiría lo que no paga en cuanto alguien se despistara, y ocultar
--      no es controlar (CLAUDE.md).
--   2. **Un informe con Finanzas solo lo ve quien tenga "Pagos y
--      facturas"** (RN-REP-16). Bosco: *"no verá ese informe a no ser que
--      le den permiso"*. No se le enseña el informe recortado: no lo ve.
--      Recortar el PDF según quién lo abra convertiría un informe en dos
--      documentos, y el informe es UNO —la versión guardada, RN-REP-12—.

-- ------------------------------------------------------------
-- 1 · El nivel, en el plan
-- ------------------------------------------------------------
alter table public.plans
  add column report_level text not null default 'basic'
    check (report_level in ('basic', 'standard', 'standard_plus', 'advanced', 'complete'));

comment on column public.plans.report_level is
  'RN-REP-15 · qué informe recibe quien tiene este plan, de menos a más:
   basic, standard, standard_plus, advanced, complete. Es un atributo del
   plan y se versiona con él (página 97 del diseño). No se deduce del
   nombre: Cuotly es multiempresa.';

-- ------------------------------------------------------------
-- 2 · El reparto de Restavor
-- ------------------------------------------------------------
--
-- Por nombre y **solo para el relleno de hoy**, que es un dato de Restavor
-- (decisión 39). Los planes que ya existen en el proyecto real son los
-- suyos; de aquí en adelante quien cree un plan elige su nivel. El valor
-- por defecto de la columna es `basic`, que es lo prudente: un plan nuevo
-- del que nadie ha dicho nada da el informe más corto, no el más largo.
update public.plans set report_level = 'standard'      where name = 'Impulso';
update public.plans set report_level = 'standard_plus' where name = 'Impulso+';
update public.plans set report_level = 'advanced'      where name = 'Premium';
update public.plans set report_level = 'complete'      where name = 'Premium+';

-- ------------------------------------------------------------
-- 3 · Qué secciones admite cada nivel
-- ------------------------------------------------------------
--
-- El orden de los niveles importa y se escribe una sola vez, aquí. Cada
-- uno **añade** a lo del anterior; ninguno quita.
--
--   · `basic`         — resumen ejecutivo y operación. Nada más.
--   · `standard`      — igual (lo que cambia en este escalón es la
--                        PROFUNDIDAD de operación y la comparación, no qué
--                        secciones entran).
--   · `standard_plus` — entra Rendimiento digital.
--   · `advanced`      — entran Oportunidades, Anexos y Finanzas.
--   · `complete`      — todo.
--
-- "Lo que ha pasado este mes" no está aquí porque **todavía no existe como
-- sección**: Bosco la pidió el 20/09/2026 y va en todos los niveles
-- cambiando el detalle. Cuando se construya, se añade a las cinco ramas.
create or replace function public.report_level_rank(p_level text)
returns integer
language sql
immutable
as $$
  select case p_level
    when 'basic' then 0
    when 'standard' then 1
    when 'standard_plus' then 2
    when 'advanced' then 3
    when 'complete' then 4
    else -1
  end;
$$;

comment on function public.report_level_rank(text) is
  'RN-REP-15 · el orden de los cinco niveles, escrito una sola vez. Un
   nivel desconocido devuelve -1, que no alcanza ninguna sección: en la
   duda, el informe más corto.';

revoke all on function public.report_level_rank(text) from public, anon;
grant execute on function public.report_level_rank(text) to authenticated;

create or replace function public.report_level_allows(p_level text, p_section text)
returns boolean
language sql
immutable
as $$
  select case p_section
    -- El resumen ejecutivo y la operación, desde el primer nivel: es lo
    -- mínimo que cuenta el mes.
    when 'executive_summary' then public.report_level_rank(p_level) >= 0
    when 'operation' then public.report_level_rank(p_level) >= 0
    when 'digital' then public.report_level_rank(p_level) >= 2
    when 'opportunities' then public.report_level_rank(p_level) >= 3
    when 'annexes' then public.report_level_rank(p_level) >= 3
    when 'finance' then public.report_level_rank(p_level) >= 3
    else false
  end;
$$;

comment on function public.report_level_allows(text, text) is
  'RN-REP-15 · si un nivel de informe admite una sección. Una sección
   desconocida es false, no true: en la duda no se manda de más.';

revoke all on function public.report_level_allows(text, text) from public, anon;
grant execute on function public.report_level_allows(text, text) to authenticated;

-- ------------------------------------------------------------
-- 4 · El nivel de un restaurante
-- ------------------------------------------------------------
--
-- Sin plan vigente, `basic`. Con varios —no debería, pero la tabla no lo
-- impide— manda el más alto, que es lo que el restaurante ha pagado.
create or replace function public.establishment_report_level(p_establishment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_level text;
begin
  -- El plan que tiene contratado un restaurante es información comercial
  -- suya: la ve su espacio y la ve él, nadie más. Sin esto, cualquiera con
  -- el uuid de un restaurante ajeno sabría qué paga.
  --
  -- A quien no le corresponde se le contesta `basic` en vez de un error:
  -- es la misma respuesta que a un restaurante sin plan, así que de la
  -- respuesta no se deduce nada.
  if v_space_id is null then
    return 'basic';
  end if;

  if not public.is_space_member(v_space_id)
     and not exists (
       select 1 from public.establishment_memberships em
       where em.establishment_id = p_establishment_id
         and em.user_id = auth.uid()
         and em.revoked_at is null
     ) then
    return 'basic';
  end if;

  select p.report_level into v_level
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = p_establishment_id
    and s.kind = 'plan'
    and s.status = 'active'
  order by public.report_level_rank(p.report_level) desc
  limit 1;

  return coalesce(v_level, 'basic');
end;
$$;

comment on function public.establishment_report_level(uuid) is
  'RN-REP-15 · el nivel de informe de este restaurante, del plan vigente.
   Sin plan, `basic`. Contesta `basic` también a quien no es de su espacio
   ni tiene acceso vivo: qué plan paga un restaurante no es de nadie más.';

revoke all on function public.establishment_report_level(uuid) from public, anon;
grant execute on function public.establishment_report_level(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5 · Qué entra marcado al preparar, ahora también según el nivel
-- ------------------------------------------------------------
--
-- Se añade una función con el nivel dentro en vez de cambiarle la firma a
-- la de dos parámetros: aquella sigue diciendo lo que decía —qué entra
-- marcado por la FAMILIA del informe— y la de aquí cruza eso con lo que el
-- nivel permite. Dos preguntas distintas, dos funciones.
--
-- Un informe **sin restaurante** es un consolidado, que es del espacio y
-- no lo recibe ningún cliente (decisión 30): ahí no hay plan que mirar y
-- manda la familia, como hasta hoy.
create or replace function public.report_section_default_for_level(
  p_category text,
  p_section text,
  p_level text
)
returns boolean
language sql
immutable
as $$
  select coalesce(public.report_section_default_included(p_category, p_section), false)
     and public.report_level_allows(p_level, p_section);
$$;

comment on function public.report_section_default_for_level(text, text, text) is
  'RN-REP-15 · qué entra marcado al preparar: lo que la familia marcaría Y
   lo que el nivel admite. La de dos parámetros se queda como está.';

revoke all on function public.report_section_default_for_level(text, text, text) from public, anon;
grant execute on function public.report_section_default_for_level(text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 6 · Un informe con Finanzas solo lo ve quien pueda verla (RN-REP-16)
-- ------------------------------------------------------------
create or replace function public.report_includes_finance(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.report_sections rs
    where rs.report_id = p_report_id
      and rs.section_key = 'finance'
      and rs.included
  );
$$;

comment on function public.report_includes_finance(uuid) is
  'RN-REP-16 · si este informe lleva la sección de Finanzas. Decide quién
   lo ve, así que va dentro de `reports_select`.';

-- CLAUDE.md · aparece dentro de la expresión de `reports_select`, y
-- PostgreSQL evalúa esas expresiones con los privilegios de QUIEN
-- CONSULTA. Revocarle el EXECUTE a `authenticated` no la cierra: rompe la
-- política entera y `reports` empieza a devolver "permission denied for
-- function".
revoke all on function public.report_includes_finance(uuid) from public, anon;
grant execute on function public.report_includes_finance(uuid) to authenticated;

-- La política, con la condición nueva. El lado del EQUIPO no cambia: quien
-- gestiona la cartera ve los informes de su espacio, con Finanzas o sin
-- ella. Lo que cambia es la rama del cliente.
drop policy if exists reports_select on public.reports;

create policy reports_select on public.reports
for select
using (
  public.has_capability(space_id, 'manage_clients')
  or (
    establishment_id is not null
    and public.report_is_visible_to_client(status)
    and public.client_can_view_reports(establishment_id)
    -- RN-REP-16 · con Finanzas dentro hace falta además "Pagos y
    -- facturas". No se le enseña el informe recortado: no lo ve.
    and (
      not public.report_includes_finance(id)
      or public.client_can_view_billing(establishment_id)
    )
  )
);

-- ------------------------------------------------------------
-- 7 · El nivel manda al preparar y al marcar a mano
-- ------------------------------------------------------------
--
-- Las dos funciones se copiaron de la definición viva y se les añadió lo
-- del nivel. Lo demás no se toca.
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
  if not public.has_capability(p_space_id, 'manage_clients') then
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

  if not public.has_capability(v_space_id, 'manage_clients') then
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

-- ------------------------------------------------------------
-- 8 · Un espacio nuevo nace con su nivel, y esto ya pasó una vez
-- ------------------------------------------------------------
--
-- El relleno de la parte 2 arregla los planes que YA existen. Pero **los
-- planes no los crea ninguna migración**: los crea `create_restavor_space()`.
-- Sin tocarla, cada espacio nuevo nacería con los cinco planes en `basic`,
-- es decir, con Premium+ dando el informe más corto.
--
-- **Es exactamente lo que pasó ayer con la migración 110** y se descubrió
-- igual: ejecutando las suites sobre una base limpia, donde no hay ni un
-- plan porque ninguna migración los siembra. Queda escrito aquí para que la
-- tercera columna que se añada a `plans` no tenga que aprenderlo otra vez:
-- **una columna nueva en `plans` se toca en tres sitios —la tabla, el
-- relleno y estas dos funciones— o el espacio siguiente nace mal.**
--
-- Los dos cuerpos se copiaron de la definición viva y se les cambió solo
-- la lista de columnas de los `insert into public.plans`.
CREATE OR REPLACE FUNCTION public.create_restavor_space()
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

  -- Los planes de mantenimiento de Restavor (PRD §6.1, fichas del
  -- 16/09/2026). Precios en céntimos, más IVA. Solo Premium+ concede la
  -- prioridad, y solo Premium+ incluye un cambio grande.
  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium,
     included_large, start_sla_hours, grants_priority, queue_rank, can_order_requests,
     report_level)
  values
    -- RN-COM-03 (decisión 55) y RN-REP-15 (decisión 56) · las cuatro
    -- últimas columnas dicen cuatro cosas distintas: `grants_priority` es
    -- el plan alto —precio de Menú Diario y oportunidades avanzadas, solo
    -- Premium+—, `queue_rank` es el turno dentro del mismo plazo,
    -- `can_order_requests` es si el restaurante puede ordenar sus cambios,
    -- y `report_level` es qué informe recibe.
    (v_space_id, 'Básico',   9900,   0,  0, 0, 0, 48, false, 0, false, 'basic'),
    (v_space_id, 'Impulso',  29900,  6,  6, 1, 0, 48, false, 0, false, 'standard'),
    (v_space_id, 'Impulso+', 39900, 16, 12, 3, 0, 24, false, 0, false, 'standard_plus'),
    (v_space_id, 'Premium',  49900, 10, 12, 2, 0, 24, false, 1, true,  'advanced'),
    (v_space_id, 'Premium+', 59900, 25, 24, 5, 1, 24, true,  2, true,  'complete');

  -- Servicio Menú Diario (RN-COM-08 a 10): 229 € + IVA, o 199 € + IVA con
  -- el plan que concede prioridad (Premium+); 30 actualizaciones por ciclo.
  insert into public.services (space_id, name, price_cents, price_premium_cents, kind, included_updates)
  values (v_space_id, 'Menú Diario', 22900, 19900, 'daily_menu', 30);

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

CREATE OR REPLACE FUNCTION public.upgrade_restavor_plan_catalogue(p_space_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Impulso+') then
    update public.plans
      set name = 'Impulso+'
    where space_id = p_space_id and name = 'Impulso' and price_cents = 39900;
  end if;

  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Premium+') then
    update public.plans
      set name = 'Premium+'
    where space_id = p_space_id and name = 'Premium' and price_cents = 59900;
  end if;

  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Impulso') then
    insert into public.plans
      (space_id, name, price_cents, included_small, included_photo, included_medium,
       included_large, start_sla_hours, grants_priority, queue_rank, can_order_requests,
       report_level)
    values (p_space_id, 'Impulso', 29900, 6, 6, 1, 0, 48, false, 0, false, 'standard');
  end if;

  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Premium') then
    insert into public.plans
      (space_id, name, price_cents, included_small, included_photo, included_medium,
       included_large, start_sla_hours, grants_priority, queue_rank, can_order_requests,
       report_level)
    values (p_space_id, 'Premium', 49900, 10, 12, 2, 0, 24, false, 1, true, 'advanced');
  end if;
end;
$function$;
