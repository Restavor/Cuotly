-- La cola que nadie llenaba, y el cobro que nacía vencido.
--
-- La migración 41 dejó la cola entera: `enqueue_scheduled_job()`,
-- `claim_scheduled_jobs()`, `run_scheduled_job()` y los cuatro barridos.
-- El ROADMAP la dio por cerrada ("resuelto en la migración 41 … y la cola
-- los despacha"), y despachar sí sabía. Lo que **no** existía en ninguna
-- parte —ni en SQL ni en TypeScript— era una sola llamada a
-- `enqueue_scheduled_job()`. `scheduled_jobs` estaba vacía desde el primer
-- día, así que el cron de Vercel entraba cada mañana, no encontraba nada
-- que reclamar y se iba. Consecuencia: la mensualidad de RN-FIN-01 no se
-- habría emitido jamás, ni el ciclo de impago de RN-FIN-10/11, ni el final
-- de servicio de RN-EST-09/10, ni los avisos de consumo del §18.
--
-- Al ir a arreglarlo salieron dos averías más que el arreglo habría
-- disparado en cuanto la cola empezara a andar, y por eso van en la misma
-- migración:
--
--   1. **El cobro nacía vencido.** `generate_monthly_charge_internal()`
--      ponía `due_at = cycle_start`, así que la mensualidad se emitía ya
--      vencida y el barrido de impago la pausaba veinticuatro horas
--      después (RN-FIN-10). El PRD no fija ningún plazo de pago y
--      CLAUDE.md prohíbe inventar umbrales, así que no se inventa: se
--      añade `spaces.payment_term_days` como **dato configurable del
--      espacio**, con 7 días por defecto, y el propietario lo cambia desde
--      Ajustes. Decisión 15 de `docs/DECISIONES.md`.
--
--   2. **La primera mensualidad no se emitía nunca.**
--      `create_plan_subscription()` abría el ciclo de consumo (HU-07) pero
--      no emitía el cobro del ciclo. Con la cola andando eso es un cobro
--      duplicado, no un cobro que falta: si el establecimiento mejora de
--      plan dentro del ciclo, `change_plan_immediately()` le cobra la
--      **diferencia** proporcional (RN-COM-15) contra una base que no
--      existe, y luego el barrido le emite la mensualidad **completa** del
--      plan nuevo por ese mismo ciclo. Restavor tenía exactamente ese caso
--      vivo el 08/09/2026: 299,96 € de diferencia cobrados y 399 € a punto
--      de emitirse encima.
--
-- Nada de esto se sostiene mirándolo: lo sostiene
-- `supabase/tests/cola_llena_y_vencimiento.sql`, que comprueba que la cola
-- se llena sola, que llenarla dos veces en la misma hora no encola dos
-- veces, que la mensualidad no nace vencida y que después de una mejora de
-- plan el barrido NO emite un segundo cobro por el mismo ciclo.

-- ============================================================
-- 1 · El plazo de pago, como dato del espacio.
--
-- No es una regla de negocio inventada aquí: es el hueco que el PRD deja
-- abierto, expuesto como configuración en vez de tapado con un número
-- escondido en una función. Siete días es el valor por defecto que fijó
-- Bosco, no un umbral deducido.
--
-- Que sea configurable no reescribe el pasado: `charges.due_at` se congela
-- al emitir, igual que `tax_rate_percent` (P4). Cambiar el plazo hoy mueve
-- las mensualidades futuras, ninguna de las ya emitidas.
-- ============================================================
alter table public.spaces
  add column payment_term_days integer not null default 7;

alter table public.spaces
  add constraint spaces_payment_term_days_range
  check (payment_term_days between 0 and 90);

comment on column public.spaces.payment_term_days is
  'Días naturales entre la emisión de una mensualidad y su vencimiento
   (RN-FIN-01b). El PRD no fija ningún plazo de pago, así que es un dato
   del espacio y no un número escondido en una función: sin él la
   mensualidad nacía vencida y el ciclo de impago de RN-FIN-10 la pausaba a
   las 24 h. Se congela en `charges.due_at` al emitir; cambiarlo no mueve
   ningún cobro ya emitido.';

-- El propietario lo cambia desde Ajustes, con rastro. Misma puerta única
-- que §124 y §125: `spaces` no tiene política de UPDATE desde la migración
-- 49, así que esta función es la única forma de tocar la columna.
create or replace function public.set_space_payment_term(
  p_space_id uuid,
  p_days integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old integer;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede cambiar el plazo de pago';
  end if;

  if p_days is null or p_days < 0 or p_days > 90 then
    raise exception 'El plazo de pago debe estar entre 0 y 90 días naturales';
  end if;

  select payment_term_days into v_old from public.spaces where id = p_space_id;
  if v_old is null then
    raise exception 'El espacio no existe';
  end if;

  if v_old = p_days then
    return false;
  end if;

  update public.spaces set payment_term_days = p_days where id = p_space_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    p_space_id, auth.uid(), 'space.payment_term_changed', 'space', p_space_id,
    jsonb_build_object('payment_term_days', v_old),
    jsonb_build_object('payment_term_days', p_days)
  );

  return true;
end;
$$;

comment on function public.set_space_payment_term(uuid, integer) is
  'RN-FIN-01b · el plazo de pago del espacio, que solo cambia el
   propietario (manage_space) y siempre con rastro en audit_log. No pide
   motivo, a diferencia de §125: no mueve ningún plazo vivo, porque los
   cobros ya emitidos conservan su `due_at`.';

revoke all on function public.set_space_payment_term(uuid, integer) from public, anon;
grant execute on function public.set_space_payment_term(uuid, integer) to authenticated;

-- ============================================================
-- 2 · La mensualidad deja de nacer vencida.
--
-- Único cambio respecto a la migración 41: `due_at`. Sigue admitiendo un
-- `p_due_at` explícito, porque quien emite a mano desde Finanzas puede
-- fijar otro.
-- ============================================================
create or replace function public.generate_monthly_charge_internal(
  p_subscription_id uuid,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_kind text;
  v_plan_name text;
  v_base_cents integer;
  v_tax_rate numeric(5, 2);
  v_tax_cents integer;
  v_term_days integer;
  v_cycle_id uuid;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_charge_id uuid;
begin
  select s.space_id, s.establishment_id, s.kind, p.name, p.price_cents
  into v_space_id, v_establishment_id, v_kind, v_plan_name, v_base_cents
  from public.subscriptions s
  left join public.plans p on p.id = s.plan_id
  where s.id = p_subscription_id and s.status = 'active';

  if v_space_id is null then
    raise exception 'Suscripción activa no encontrada';
  end if;

  if v_kind <> 'plan' then
    -- RN-COM-08 fija dos precios para Menú Diario según el establecimiento
    -- tenga o no plan Premium activo, y el esquema todavía no sabe cuál de
    -- los planes es "Premium" (solo tienen nombre). Menú Diario entero es
    -- Fase 2: aquí se para en vez de adivinar el precio.
    raise exception 'La mensualidad de un servicio se implementa con Menú Diario (Fase 2)';
  end if;

  v_cycle_id := public.get_or_create_consumption_cycle_internal(p_subscription_id);
  select cycle_start, cycle_end into v_cycle_start, v_cycle_end
  from public.consumption_cycles where id = v_cycle_id;

  select id into v_charge_id from public.charges
  where subscription_id = p_subscription_id and period_start = v_cycle_start;
  if v_charge_id is not null then
    return v_charge_id; -- RN-DAT-09: emitir dos veces no cobra dos veces.
  end if;

  select tax_rate_percent, payment_term_days
  into v_tax_rate, v_term_days
  from public.spaces where id = v_space_id;
  v_tax_cents := round(v_base_cents * v_tax_rate / 100)::integer;

  insert into public.charges
    (space_id, establishment_id, subscription_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_by)
  values
    (v_space_id, v_establishment_id, p_subscription_id, v_plan_name, v_cycle_start, v_cycle_end,
     v_base_cents, v_tax_rate, v_tax_cents, v_base_cents + v_tax_cents,
     -- RN-FIN-01b. Antes era `v_cycle_start` a secas: el cobro nacía
     -- vencido y RN-FIN-10 pausaba el restaurante al día siguiente de
     -- emitírselo. El plazo se cuenta desde la emisión real, no desde el
     -- inicio del ciclo, porque el barrido puede llegar horas después y
     -- descontárselas al cliente sería cobrarle el retraso del cron.
     coalesce(p_due_at, greatest(now(), v_cycle_start) + (v_term_days || ' days')::interval),
     auth.uid())
  returning id into v_charge_id;

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    (v_space_id, v_establishment_id, v_charge_id, 'charge', v_base_cents + v_tax_cents,
     'Mensualidad ' || v_plan_name, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'charge.issued', 'charge', v_charge_id,
          jsonb_build_object('establishment_id', v_establishment_id, 'total_cents', v_base_cents + v_tax_cents,
                             'period_start', v_cycle_start));

  return v_charge_id;
end;
$$;

revoke all on function public.generate_monthly_charge_internal(uuid, timestamptz)
  from public, anon, authenticated;

comment on function public.generate_monthly_charge_internal(uuid, timestamptz) is
  'Cuerpo de generate_monthly_charge() sin la comprobación de permiso, para
   que la pueda llamar el proceso de la cola, que no es miembro de ningún
   espacio. Interna: la pública comprueba `manage_finance` y delega aquí.
   El vencimiento sale de `spaces.payment_term_days` (RN-FIN-01b).';

-- ============================================================
-- 3 · La primera mensualidad, al dar de alta el plan.
--
-- HU-07 abría el ciclo de consumo desde el primer día y no emitía el cobro
-- de ese ciclo, así que el primer mes de todo restaurante quedaba sin
-- facturar hasta la primera renovación. Con la cola andando eso deja de
-- ser un cobro que falta y pasa a ser un cobro duplicado: una mejora de
-- plan dentro del ciclo cobra la **diferencia** (RN-COM-15) sobre una base
-- inexistente, y después el barrido emite la mensualidad **entera** del
-- plan nuevo por el mismo periodo.
--
-- RN-FIN-01 dice "en la fecha de renovación". El alta ES la primera fecha
-- de renovación del establecimiento: es el `cycle_start` del primer ciclo,
-- el mismo instante del que ya cuelgan la bolsa (RN-COM-06) y la
-- permanencia (RN-COM-04).
-- ============================================================
create or replace function public.create_plan_subscription(
  p_establishment_id uuid,
  p_plan_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_plan_space_id uuid;
  v_subscription_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para asignar un plan a este establecimiento';
  end if;

  select space_id into v_plan_space_id from public.plans where id = p_plan_id;
  if v_plan_space_id is null or v_plan_space_id <> v_space_id then
    raise exception 'El plan no pertenece al mismo espacio que el establecimiento';
  end if;

  insert into public.subscriptions (space_id, establishment_id, kind, plan_id, created_by)
  values (v_space_id, p_establishment_id, 'plan', p_plan_id, auth.uid())
  returning id into v_subscription_id;

  -- RN-COM-04: "permanencia mínima inicial de 3 meses".
  insert into public.plan_commitments
    (space_id, establishment_id, subscription_id, plan_id, started_at, ends_at, cause, created_by)
  values
    (v_space_id, p_establishment_id, v_subscription_id, p_plan_id,
     now(), now() + interval '3 months', 'initial', auth.uid());

  -- RN-COM-06 · la bolsa del ciclo, desde el primer día. Se llama a la
  -- interna a propósito: el permiso ya se ha comprobado arriba y la
  -- pública lo volvería a comprobar con otro criterio.
  perform public.get_or_create_consumption_cycle_internal(v_subscription_id);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'subscription.plan_created', 'subscription', v_subscription_id, jsonb_build_object('establishment_id', p_establishment_id, 'plan_id', p_plan_id));

  -- RN-FIN-01 · y la mensualidad de ese primer ciclo. Va por la interna
  -- por el mismo motivo que el ciclo: quien da de alta un plan tiene
  -- `manage_clients`, que no es `manage_finance`, y exigirle las dos para
  -- contratar sería inventarse un permiso que el PRD no pide. El cobro
  -- queda auditado con su actor de todas formas.
  perform public.generate_monthly_charge_internal(v_subscription_id, null);

  return v_subscription_id;
end;
$$;

comment on function public.create_plan_subscription(uuid, uuid) is
  'HU-07 · alta de plan. Abre la permanencia (RN-COM-04), la bolsa del
   ciclo (RN-COM-06) y **la mensualidad de ese primer ciclo** (RN-FIN-01).
   Lo último faltaba: sin él, una mejora de plan dentro del primer ciclo
   cobraba la diferencia (RN-COM-15) sobre una base que no existía y el
   barrido emitía después la mensualidad entera del plan nuevo por el mismo
   periodo.';

revoke all on function public.create_plan_subscription(uuid, uuid) from public, anon;
grant execute on function public.create_plan_subscription(uuid, uuid) to authenticated;

-- ============================================================
-- 4 · El barrido de mensualidades cuenta lo que emite, no lo que mira.
--
-- Devolvía "emitidos" contando también los ciclos ya cobrados, porque
-- `generate_monthly_charge_internal()` devuelve el cobro existente cuando
-- lo hay (que es lo correcto: RN-DAT-09). Con el barrido corriendo a
-- diario, eso convertía el número que se guarda en el registro del cron en
-- "suscripciones activas", que no dice nada.
-- ============================================================
create or replace function public.run_monthly_charges(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub uuid;
  v_emitidos integer := 0;
  v_charge uuid;
  v_cycle_start timestamptz;
begin
  for v_sub in
    select s.id from public.subscriptions s
    join public.establishments e on e.id = s.establishment_id
    where s.space_id = p_space_id
      and s.kind = 'plan'
      and s.status = 'active'
      -- A un restaurante archivado no se le sigue pasando la mensualidad.
      -- Suspendido o pausado sí: RN-FIN-14, la deuda no desaparece.
      and e.status <> 'archived'
  loop
    begin
      v_cycle_start := null;
      select cc.cycle_start into v_cycle_start
      from public.consumption_cycles cc
      where cc.subscription_id = v_sub
        and now() >= cc.cycle_start and now() < cc.cycle_end;

      -- Ciclo en curso ya cobrado: no hay nada que emitir. Sin esto el
      -- contador subía igual y el barrido decía haber cobrado a todo el
      -- mundo todos los días.
      if v_cycle_start is not null and exists (
        select 1 from public.charges c
        where c.subscription_id = v_sub and c.period_start = v_cycle_start
      ) then
        continue;
      end if;

      v_charge := public.generate_monthly_charge_internal(v_sub, null);
      if v_charge is not null then
        v_emitidos := v_emitidos + 1;
      end if;
    exception when others then
      -- Un restaurante que falle no puede dejar sin cobrar a los demás.
      null;
    end;
  end loop;

  return v_emitidos;
end;
$$;

revoke all on function public.run_monthly_charges(uuid) from public, anon, authenticated;

-- ============================================================
-- 5 · Lo que faltaba de verdad: alguien que llene la cola.
--
-- Un barrido por espacio y por tipo, con la clave de deduplicación atada a
-- la HORA en curso: llamar dos veces al cron dentro de la misma hora no
-- encola dos veces (CA-17), y si mañana el cron pasa de diario a horario
-- esta función no cambia — el ritmo lo pone quien la llama, no ella.
--
-- `sla_sweep` NO se encola a propósito, y no es un olvido: los umbrales de
-- T2 y T3 necesitan el reloj laboral de `src/core/business-clock.ts`, así
-- que `run_scheduled_job()` los rechaza con un error explícito y el
-- proceso de la cola los recorre espacio por espacio por su cuenta.
-- Encolarlos sería llenar `scheduled_jobs` de trabajos condenados a
-- fallar.
-- ============================================================
create or replace function public.enqueue_due_scheduled_jobs(
  p_run_after timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
  v_kind text;
  v_hora text := to_char(p_run_after at time zone 'UTC', 'YYYYMMDDHH24');
  v_encolados integer := 0;
begin
  for v_space in select id from public.spaces loop
    foreach v_kind in array array[
      'monthly_charges',   -- RN-FIN-01
      'dunning_sweep',     -- RN-FIN-10 y RN-FIN-11
      'lifecycle_sweep',   -- RN-EST-09, RN-EST-10 y §6.4
      'consumption_sweep'  -- §18, avisos al 80 % y al 100 %
    ]
    loop
      if public.enqueue_scheduled_job(
           v_space, v_kind, p_run_after,
           v_kind || ':' || v_space::text || ':' || v_hora) is not null then
        v_encolados := v_encolados + 1;
      end if;
    end loop;
  end loop;

  return v_encolados;
end;
$$;

comment on function public.enqueue_due_scheduled_jobs(timestamptz) is
  'Llena la cola con los cuatro barridos de SQL de cada espacio. Era la
   pieza que faltaba desde la migración 41: la cola sabía despachar pero
   nadie metía nada en ella, así que `scheduled_jobs` estaba vacía y ni la
   mensualidad (RN-FIN-01), ni el impago (RN-FIN-10/11), ni el final de
   servicio (RN-EST-09/10), ni los avisos de consumo (§18) se disparaban
   solos. Deduplica por hora (CA-17). No encola `sla_sweep`: ese lo calcula
   `src/services/queue-runner.ts` con el reloj laboral.';

revoke all on function public.enqueue_due_scheduled_jobs(timestamptz)
  from public, anon, authenticated;
