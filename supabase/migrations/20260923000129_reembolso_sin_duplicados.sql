-- M52 · "Registrar reembolso" llega a la pantalla, y antes de ponerle un
-- botón hay que cerrar un hueco: `refund_charge()` (migración 25) no tenía
-- clave de idempotencia. Un doble clic sobre un reembolso parcial
-- escribía dos apuntes de devolución, y CLAUDE.md es explícito: los
-- movimientos financieros van con transacción + clave de idempotencia, y
-- pulsar dos veces nunca duplica el efecto.
--
-- Lo que cambia:
--
--   · `financial_entries` gana `idempotency_key`, con un índice único por
--     cobro. El libro sigue siendo inmutable: la columna solo se rellena
--     al insertar.
--   · `refund_charge()` acepta la clave como cuarto parámetro, opcional:
--     las llamadas de tres argumentos que ya existen (las suites, cualquier
--     otra) siguen funcionando igual.
--   · Con la misma clave, la segunda llamada no hace nada: ni apunte ni
--     auditoría. Un `insert` que no inserta y aun así audita sería una
--     auditoría que miente (el mismo criterio que la migración 60).
--   · El motivo pasa a ser obligatorio. Queda en la auditoría y es lo único
--     que explica una devolución de dinero; la pantalla ya lo pedía, y el
--     servidor no se fía de la pantalla.
--
-- Lo que NO cambia (RN-FIN-04b, decisión 12): reembolsar **reabre** el
-- cobro. Devolver el dinero y dejar al restaurante sin deuda es otra
-- operación que no existe y no se mete aquí.
--
-- Se comprueba con `supabase/tests/reembolso_sin_duplicados.sql`.

alter table public.financial_entries add column idempotency_key text;

create unique index financial_entries_idempotency_idx
  on public.financial_entries (charge_id, idempotency_key)
  where idempotency_key is not null;

drop function public.refund_charge(uuid, integer, text);

create function public.refund_charge(
  p_charge_id uuid,
  p_amount_cents integer,
  p_reason text,
  p_idempotency_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_collected integer;
begin
  select space_id, establishment_id into v_space_id, v_establishment_id
  from public.charges where id = p_charge_id
  for update;

  if v_space_id is null then
    raise exception 'Cobro no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_finance') then
    raise exception 'Solo el propietario o un administrador pueden reembolsar un cobro';
  end if;

  -- La misma clave ya se usó en este cobro: es el segundo clic. Se
  -- comprueba DESPUÉS del permiso, para que nadie sin él pueda sondear qué
  -- claves existen.
  if p_idempotency_key is not null and exists (
    select 1 from public.financial_entries
    where charge_id = p_charge_id and idempotency_key = p_idempotency_key
  ) then
    return;
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Escribe el motivo del reembolso';
  end if;

  v_collected := public.charge_collected_cents(p_charge_id);
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > v_collected then
    raise exception 'Solo se puede reembolsar lo efectivamente cobrado (%)', v_collected;
  end if;

  begin
    insert into public.financial_entries
      (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by, idempotency_key)
    values
      (v_space_id, v_establishment_id, p_charge_id, 'refund', p_amount_cents, btrim(p_reason), auth.uid(),
       p_idempotency_key);
  exception
    -- Dos llamadas simultáneas con la misma clave: la otra ganó la
    -- carrera y esta no escribe nada, tampoco en la auditoría.
    when unique_violation then
      return;
  end;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'charge.refunded', 'charge', p_charge_id,
          jsonb_build_object('collected_cents', v_collected),
          jsonb_build_object('refunded_cents', p_amount_cents), btrim(p_reason));
end;
$$;

-- Comprueba el permiso por dentro: se cierra a `anon` y se deja a
-- `authenticated` (CLAUDE.md).
revoke all on function public.refund_charge(uuid, integer, text, text) from public, anon;
grant execute on function public.refund_charge(uuid, integer, text, text) to authenticated;
