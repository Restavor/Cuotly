-- RN-EST-08 · "el motivo concreto se muestra junto al estado".
--
-- Lo que se comprueba: que `establishment_status_reason()` devuelva la
-- FRASE que escribió quien cambió el estado, y no el código del ciclo de
-- impago. Leía `state_events.cause` —que solo escribe ese ciclo, y en
-- forma de identificador— así que en todo cambio manual devolvía nulo y en
-- el automático habría devuelto la cadena `nonpayment`.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_motivo_del_estado.sql

insert into auth.users (id, email, role, aud) values
  ('bf000000-0000-0000-0000-000000000001', 'motivo-owner@example.com', 'authenticated', 'authenticated'),
  ('bf000000-0000-0000-0000-000000000002', 'motivo-cliente@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('bf100000-0000-0000-0000-000000000001', 'Espacio Motivo', 'espacio-motivo-test',
   'bf000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('bf100000-0000-0000-0000-000000000001', 'bf000000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('bf300000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000001', 'Grupo Motivo');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('bf400000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000001',
   'bf300000-0000-0000-0000-000000000001', 'EST-MOT-A', 'Restaurante Motivo', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('bf500000-0000-0000-0000-000000000001', 'bf400000-0000-0000-0000-000000000001',
   'bf000000-0000-0000-0000-000000000002', 'local_owner');

-- ============================================================
-- El propietario pausa el restaurante explicando por qué.
-- ============================================================
select set_config('request.jwt.claim.sub', 'bf000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare v_motivo text;
begin
  perform public.set_establishment_status(
    'bf400000-0000-0000-0000-000000000001', 'paused', 'Impago de la cuota de septiembre');

  select public.establishment_status_reason('bf400000-0000-0000-0000-000000000001') into v_motivo;

  if v_motivo is distinct from 'Impago de la cuota de septiembre' then
    raise exception 'FALLIDO: el motivo del estado es "%" y tenía que ser la frase que se escribió (RN-EST-08)',
      coalesce(v_motivo, '(nulo)') using errcode = 'assert_failure';
  end if;

  -- Y NO es el código de la máquina: un identificador de programa
  -- enseñado a un restaurante no es una explicación.
  if v_motivo in ('nonpayment', 'suspension', 'pause') then
    raise exception 'FALLIDO: el motivo es un codigo de programa, no una frase'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- Y el CLIENTE lo ve: la regla existe para él.
-- ============================================================
select set_config('request.jwt.claim.sub', 'bf000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  if public.establishment_status_reason('bf400000-0000-0000-0000-000000000001')
     is distinct from 'Impago de la cuota de septiembre' then
    raise exception 'FALLIDO: el restaurante no ve el motivo de su propio estado (RN-EST-08)'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id = 'bf100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'bf100000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'bf000000-%';

select 'el_motivo_del_estado.sql: todas las comprobaciones han pasado' as resultado;
