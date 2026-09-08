-- El cobro de la mejora de plan no estaba en el libro.
--
-- `change_plan_immediately()` (migración 40) emite la diferencia
-- proporcional de RN-COM-15 insertando una fila en `charges` y **ninguna
-- en `financial_entries`**. Se vio mirando los datos de Restavor al
-- arreglar la cola: el cobro de 362,95 € del 08/09/2026 existía y el libro
-- decía que nadie debía nada.
--
-- Es exactamente lo que CLAUDE.md prohíbe ("consumos y movimientos
-- financieros se registran como libro inmutable de apuntes con signo") y
-- lo que RN-DAT-05 apoya: `charges` no tiene columna de estado a propósito,
-- el estado lo deriva `charge_status()` de `charge_outstanding_cents()`, y
-- esa función suma apuntes. Sin apunte de cargo, la deuda viva de ese cobro
-- es cero, así que:
--
--   · sale como cobrado sin que nadie haya pagado;
--   · el ciclo de impago no lo mira jamás (RN-FIN-10/11 arrancan de
--     `charge_outstanding_cents(c.id) > 0`);
--   · y no cuenta ni en el panel financiero ni en la ficha del cliente.
--
-- Sale ahora y no antes porque hasta la migración 52 la cola no andaba: el
-- barrido de impago no se ejecutaba nunca, así que nadie preguntó por la
-- deuda viva de este cobro.

-- ============================================================
-- 1 · El apunte que faltaba, en la función.
--
-- Solo cambia el bloque del cobro: se le añade el apunte de cargo y su
-- fila de `charge.issued`, los mismos dos que escribe
-- `generate_monthly_charge_internal()`. El resto del cuerpo es el de la
-- migración 40, que era correcto.
-- ============================================================
create or replace function public.change_plan_immediately(
  p_subscription_id uuid,
  p_new_plan_id uuid,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_old_plan_id uuid;
  v_old_price integer;
  v_new_price integer;
  v_new_space uuid;
  v_cycle_id uuid;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_pro record;
  v_tax_rate numeric(5,2);
  v_tax_cents integer;
  v_charge_id uuid;
  v_new_name text;
  v_key text;
begin
  select s.space_id, s.establishment_id, s.plan_id, p.price_cents
  into v_space_id, v_establishment_id, v_old_plan_id, v_old_price
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.id = p_subscription_id and s.kind = 'plan' and s.status = 'active'
  for update;

  if v_space_id is null then
    raise exception 'Suscripción de plan activa no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden cambiar el plan de un restaurante';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  select space_id, price_cents, name into v_new_space, v_new_price, v_new_name
  from public.plans where id = p_new_plan_id;

  if v_new_space is null or v_new_space <> v_space_id then
    raise exception 'El plan no pertenece al mismo espacio que el establecimiento';
  end if;

  if p_new_plan_id = v_old_plan_id then
    return null; -- CA-17: cambiar al mismo plan no hace nada.
  end if;

  -- RN-COM-17: la reducción es solo en renovación. Aquí no cabe.
  if v_new_price <= v_old_price then
    raise exception 'Una reducción de plan solo se aplica en la renovación y tras cumplir la permanencia (RN-COM-17)';
  end if;

  v_key := coalesce(p_idempotency_key, 'plan_change:' || p_subscription_id::text || ':' || p_new_plan_id::text);

  -- RN-DAT-09 / CA-17: pulsar dos veces no cobra dos veces ni regala dos
  -- bolsas. La marca la lleva la auditoría, que ya es un libro inmutable.
  if exists (
    select 1 from public.audit_log
    where action = 'subscription.plan_changed'
      and entity_id = p_subscription_id
      and new_value ->> 'idempotency_key' = v_key
  ) then
    return null;
  end if;

  v_cycle_id := public.get_or_create_consumption_cycle(p_subscription_id);
  select cycle_start, cycle_end into v_cycle_start, v_cycle_end
  from public.consumption_cycles where id = v_cycle_id;

  select * into v_pro from public.plan_change_proration(p_subscription_id, p_new_plan_id);

  update public.subscriptions set plan_id = p_new_plan_id where id = p_subscription_id;

  -- "Se añaden consumos adicionales proporcionales al periodo restante,
  -- redondeando al alza (a favor del cliente). No se duplica lo ya
  -- utilizado": por eso son apuntes NUEVOS sobre el ciclo en curso y no un
  -- recálculo de la bolsa. El libro es de apuntes con signo (CLAUDE.md).
  if v_pro.extra_small > 0 then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason, created_by)
    values (v_space_id, v_establishment_id, v_cycle_id, 'small', v_pro.extra_small,
            'compensatory_credit', 'Mejora de plan (RN-COM-15)', auth.uid());
  end if;
  if v_pro.extra_photo > 0 then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason, created_by)
    values (v_space_id, v_establishment_id, v_cycle_id, 'photo', v_pro.extra_photo,
            'compensatory_credit', 'Mejora de plan (RN-COM-15)', auth.uid());
  end if;
  if v_pro.extra_medium > 0 then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason, created_by)
    values (v_space_id, v_establishment_id, v_cycle_id, 'medium', v_pro.extra_medium,
            'compensatory_credit', 'Mejora de plan (RN-COM-15)', auth.uid());
  end if;
  if v_pro.extra_large > 0 then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason, created_by)
    values (v_space_id, v_establishment_id, v_cycle_id, 'large', v_pro.extra_large,
            'compensatory_credit', 'Mejora de plan (RN-COM-15)', auth.uid());
  end if;

  -- "Se cobra la diferencia económica proporcional al periodo restante."
  if v_pro.difference_cents > 0 then
    select tax_rate_percent into v_tax_rate from public.spaces where id = v_space_id;
    v_tax_cents := round(v_pro.difference_cents * v_tax_rate / 100)::integer;

    insert into public.charges
      (space_id, establishment_id, subscription_id, concept, period_start, period_end,
       base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_by)
    values
      (v_space_id, v_establishment_id, p_subscription_id,
       'Mejora a ' || v_new_name || ' (parte proporcional)', now(), v_cycle_end,
       v_pro.difference_cents, v_tax_rate, v_tax_cents, v_pro.difference_cents + v_tax_cents,
       v_cycle_end, auth.uid())
    returning id into v_charge_id;

    -- RN-DAT-04 y RN-DAT-05 · esto es lo que faltaba. `charges` no tiene
    -- columna de estado a propósito: el estado lo deriva `charge_status()`
    -- sumando apuntes del libro, así que un cobro SIN apunte de cargo es
    -- un cobro que el libro da por saldado. Salía como cobrado sin que
    -- nadie hubiera pagado, el ciclo de impago no lo miraba nunca
    -- (RN-FIN-10/11 arrancan de `charge_outstanding_cents(c.id) > 0`) y no
    -- contaba en el panel financiero.
    insert into public.financial_entries
      (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
    values
      (v_space_id, v_establishment_id, v_charge_id, 'charge',
       v_pro.difference_cents + v_tax_cents,
       'Mejora a ' || v_new_name || ' (parte proporcional)', auth.uid());

    -- Y su fila de emisión, la misma que escribe
    -- `generate_monthly_charge_internal()`: todo cobro que nace deja
    -- rastro de quién lo emitió y por cuánto.
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (v_space_id, auth.uid(), 'charge.issued', 'charge', v_charge_id,
            jsonb_build_object('establishment_id', v_establishment_id,
                               'total_cents', v_pro.difference_cents + v_tax_cents,
                               'cause', 'plan_change'));
  end if;

  -- RN-COM-05: nueva permanencia de 3 meses.
  insert into public.plan_commitments
    (space_id, establishment_id, subscription_id, plan_id, started_at, ends_at, cause, created_by)
  values
    (v_space_id, v_establishment_id, p_subscription_id, p_new_plan_id,
     now(), now() + interval '3 months', 'plan_change', auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'subscription.plan_changed', 'subscription', p_subscription_id,
    jsonb_build_object('plan_id', v_old_plan_id, 'price_cents', v_old_price),
    jsonb_build_object(
      'plan_id', p_new_plan_id, 'price_cents', v_new_price, 'kind', 'immediate_upgrade',
      'fraction', v_pro.fraction, 'difference_cents', v_pro.difference_cents,
      'charge_id', v_charge_id, 'idempotency_key', v_key)
  );

  return v_charge_id;
end;
$$;

comment on function public.change_plan_immediately(uuid, uuid, text) is
  'RN-COM-15 (mejora inmediata) + RN-COM-05 (nueva permanencia de 3 meses)
   + RN-COM-18 (prorrateo). La reducción no cabe aquí: RN-COM-17 la reserva
   a la renovación. Desde la migración 53 el cobro de la diferencia deja su
   apunte en el libro (RN-DAT-04): sin él, `charge_status()` lo daba por
   saldado y el ciclo de impago no lo miraba nunca.';

revoke all on function public.change_plan_immediately(uuid, uuid, text) from public, anon;
grant execute on function public.change_plan_immediately(uuid, uuid, text) to authenticated;

-- ============================================================
-- 2 · Y los cobros que ya se emitieron sin apunte.
--
-- No se reescribe nada: se AÑADE el apunte de cargo que les faltaba, que
-- es lo que un libro inmutable permite hacer. Un cobro que ya tuviera su
-- apunte no se toca, así que esto es idempotente.
--
-- No se filtra por origen a propósito. El único emisor que podía dejar un
-- cobro sin apunte era `change_plan_immediately()`, pero la condición que
-- importa no es "de dónde vino" sino "el libro no lo conoce": si mañana
-- aparece otro cobro así, esta reparación también lo cubre.
--
-- Y para que no vuelva a colarse uno, el barrido en falso-cerrado de
-- `supabase/tests/cola_llena_y_vencimiento.sql` recorre TODOS los cobros y
-- falla si alguno no tiene su apunte de cargo. Esta avería no la habría
-- encontrado una lista escrita a mano de emisores: se encontró mirando los
-- datos.
-- ============================================================
do $$
declare
  v_c record;
  v_reparados integer := 0;
begin
  for v_c in
    select c.id, c.space_id, c.establishment_id, c.concept, c.total_cents, c.issued_by
    from public.charges c
    where not exists (
      select 1 from public.financial_entries fe
      where fe.charge_id = c.id and fe.entry_type = 'charge'
    )
  loop
    insert into public.financial_entries
      (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
    values
      (v_c.space_id, v_c.establishment_id, v_c.id, 'charge', v_c.total_cents,
       v_c.concept, v_c.issued_by);

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
    values (v_c.space_id, null, 'charge.issued', 'charge', v_c.id,
            jsonb_build_object('total_cents', v_c.total_cents, 'cause', 'ledger_backfill'),
            'Migración 53: el cobro se emitió sin apunte en el libro y la deuda constaba como cero');

    v_reparados := v_reparados + 1;
  end loop;

  if v_reparados > 0 then
    raise notice 'Migración 53: % cobro(s) sin apunte reparados', v_reparados;
  end if;
end $$;
