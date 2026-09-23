-- ============================================================
-- Suite 70 · Reembolso sin duplicados
--            (migración 129; M52; RN-FIN-04b, CLAUDE.md idempotencia)
-- ============================================================
--
-- `refund_charge()` pasa a aceptar una clave de idempotencia. Lo que esta
-- suite vigila:
--
--   · **Dos clics, un reembolso**: la misma clave no escribe un segundo
--     apunte ni un segundo registro de auditoría.
--   · **Otra clave es otro reembolso**, y las llamadas de tres argumentos
--     que ya existían siguen funcionando.
--   · **RN-FIN-04b · reembolsar reabre**: la deuda viva vuelve a ser lo
--     devuelto.
--   · **No se devuelve más de lo cobrado** y **el motivo es obligatorio**.
--   · **Solo con "Gestionar finanzas"**: el restaurante no reembolsa, y
--     `anon` no puede ni ejecutarla.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/reembolso_sin_duplicados.sql
--
-- Prefijo de esta suite: f1400000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1400000-0000-0000-0000-000000000001', 'duena70@cuotly.test', 'authenticated', 'authenticated'),
  ('f1400000-0000-0000-0000-000000000003', 'cliente70@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1400000-0000-0000-0000-000000000001', 'duena70@cuotly.test', 'Dueña 70'),
  ('f1400000-0000-0000-0000-000000000003', 'cliente70@cuotly.test', 'Cliente 70')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1410000-0000-0000-0000-000000000001', 'Espacio 70', 'espacio-70', 'Europe/Madrid',
   'f1400000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1410000-0000-0000-0000-000000000001', 'f1400000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('f1430000-0000-0000-0000-000000000001', 'f1410000-0000-0000-0000-000000000001', 'Grupo 70');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1440000-0000-0000-0000-000000000001', 'f1410000-0000-0000-0000-000000000001',
   'f1430000-0000-0000-0000-000000000001', 'EST-70-1', 'Casa Reembolso', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f1440000-0000-0000-0000-000000000001', 'f1400000-0000-0000-0000-000000000003', 'local_owner');

insert into public.charges
  (id, space_id, establishment_id, concept, period_start, period_end,
   base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_at, issued_by) values
  ('f1490000-0000-0000-0000-000000000001', 'f1410000-0000-0000-0000-000000000001',
   'f1440000-0000-0000-0000-000000000001', 'Cuota de septiembre',
   now() - interval '10 days', now() + interval '20 days',
   10000, 21, 2100, 12100, now() + interval '20 days', now() - interval '10 days',
   'f1400000-0000-0000-0000-000000000001');

-- RN-DAT-04 · el cobro nace con su apunte de cargo en el libro.
insert into public.financial_entries (space_id, establishment_id, charge_id, entry_type, amount_cents, created_by)
values ('f1410000-0000-0000-0000-000000000001', 'f1440000-0000-0000-0000-000000000001',
        'f1490000-0000-0000-0000-000000000001', 'charge', 12100, 'f1400000-0000-0000-0000-000000000001');

-- ============================================================
-- anon no puede ni ejecutarla
-- ============================================================
do $$
begin
  if has_function_privilege('anon', 'public.refund_charge(uuid, integer, text, text)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: anon puede ejecutar refund_charge()' using errcode = 'assert_failure';
  end if;
  if not has_function_privilege('authenticated', 'public.refund_charge(uuid, integer, text, text)', 'execute') then
    raise exception 'refund_charge() debería poder llamarla authenticated: comprueba el permiso por dentro'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- La dueña cobra el total y reembolsa
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1400000-0000-0000-0000-000000000001';

do $$
declare
  v_charge uuid := 'f1490000-0000-0000-0000-000000000001';
  v_apuntes int;
  v_audit int;
begin
  perform public.register_payment(v_charge, 12100, 'transfer', now(), null, null, 'pago-70');
  if public.charge_outstanding_cents(v_charge) <> 0 then
    raise exception 'preparación: el cobro debería quedar pagado' using errcode = 'assert_failure';
  end if;

  -- Dos clics con la misma clave: un solo apunte y un solo registro.
  perform public.refund_charge(v_charge, 2000, 'Servicio no prestado', 'reembolso-1');
  perform public.refund_charge(v_charge, 2000, 'Servicio no prestado', 'reembolso-1');

  select count(*) into v_apuntes from public.financial_entries
  where charge_id = v_charge and entry_type = 'refund';
  if v_apuntes <> 1 then
    raise exception 'CLAUDE.md FALLIDO: la misma clave escribió % reembolsos', v_apuntes using errcode = 'assert_failure';
  end if;

  select count(*) into v_audit from public.audit_log
  where entity_id = v_charge and action = 'charge.refunded';
  if v_audit <> 1 then
    raise exception 'CLAUDE.md FALLIDO: la misma clave auditó % veces', v_audit using errcode = 'assert_failure';
  end if;

  -- RN-FIN-04b · reembolsar reabre: se debe lo devuelto.
  if public.charge_outstanding_cents(v_charge) <> 2000 then
    raise exception 'RN-FIN-04b FALLIDO: tras devolver 20 € se deben % céntimos',
      public.charge_outstanding_cents(v_charge) using errcode = 'assert_failure';
  end if;

  -- Otra clave es otro reembolso; tres argumentos, como antes, también.
  perform public.refund_charge(v_charge, 1000, 'Segunda devolución', 'reembolso-2');
  perform public.refund_charge(v_charge, 500, 'Sin clave, como antes');
  select count(*) into v_apuntes from public.financial_entries
  where charge_id = v_charge and entry_type = 'refund';
  if v_apuntes <> 3 then
    raise exception 'refund_charge() FALLIDO: se esperaban 3 reembolsos distintos y hay %', v_apuntes
      using errcode = 'assert_failure';
  end if;

  -- No se devuelve más de lo cobrado (queda cobrado 12100 - 3500 = 8600).
  begin
    perform public.refund_charge(v_charge, 9000, 'Demasiado', 'reembolso-3');
    raise exception 'refund_charge() FALLIDO: dejó devolver más de lo cobrado' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- El motivo es obligatorio.
  begin
    perform public.refund_charge(v_charge, 100, '   ', 'reembolso-4');
    raise exception 'refund_charge() FALLIDO: aceptó un reembolso sin motivo' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

-- ============================================================
-- El restaurante no reembolsa, ni repitiendo una clave que existe
-- ============================================================
set local request.jwt.claim.sub = 'f1400000-0000-0000-0000-000000000003';

do $$
begin
  begin
    perform public.refund_charge('f1490000-0000-0000-0000-000000000001', 100, 'Me lo devuelvo', 'reembolso-1');
    raise exception 'manage_finance FALLIDO: el restaurante pudo llamar a refund_charge()' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

rollback;

\echo 'Suite 70 · Reembolso sin duplicados: OK'
