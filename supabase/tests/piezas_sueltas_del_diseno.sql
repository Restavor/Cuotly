-- Paso 2 · las piezas sueltas del diseño (migración 99;
-- `docs/diseno/LAS-CATORCE-PIEZAS.md`).
--
--   · M58: el IVA por defecto del espacio, que solo cambia quien puede
--     gestionar el espacio, y que RN-FIN-08 congela en cada cobro emitido.
--   · R12: cancelar una solicitud que todavía no es un trabajo, por el
--     restaurante o por el equipo. La que ya lo es sigue siendo de
--     `cancel_accepted_request()`.
--   · A17: la edición simultánea del menú, que avisa en vez de pisar.
--   · R24 y M47, RN-EST-09: comunicar la baja del servicio.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/piezas_sueltas_del_diseno.sql

insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('aa100000-0000-0000-0000-000000000001', 'pz-duena@example.com', 'authenticated', 'authenticated'),
  ('aa100000-0000-0000-0000-000000000002', 'pz-trabajadora@example.com', 'authenticated', 'authenticated'),
  ('aa100000-0000-0000-0000-000000000003', 'pz-cliente@bar-piezas.test', 'authenticated', 'authenticated'),
  ('aa100000-0000-0000-0000-000000000004', 'pz-ajena@example.com', 'authenticated', 'authenticated');

select set_config('request.jwt.claim.aal', 'aal2', false);

create temp table pz_ids (k text primary key, v uuid);
grant select, insert, update on pz_ids to anon, authenticated, service_role;

-- ============================================================
-- Fixtures · un espacio con su restaurante y su cliente
-- ============================================================
select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Piezas SL', 'Dueña Piezas', 'pz-duena@example.com', 'pro', '600111222');
  perform public.submit_space_request(v_id);
  insert into pz_ids values ('sol', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  insert into pz_ids values ('espacio',
    public.approve_space_request((select v from pz_ids where k = 'sol'), 'pz-espacio'));
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_est uuid;
begin
  insert into public.space_memberships (space_id, user_id, role, status)
  values ((select v from pz_ids where k = 'espacio'),
          'aa100000-0000-0000-0000-000000000002', 'worker', 'active');

  v_est := public.create_establishment_with_data(
    (select v from pz_ids where k = 'espacio'), 'Bar Piezas', null, 'Grupo Piezas');
  insert into pz_ids values ('rest', v_est);

  perform public.grant_establishment_access(
    v_est, 'pz-cliente@bar-piezas.test', 'local_owner', false, true);
end $$;
reset role;

-- ============================================================
-- M58 · el IVA por defecto del espacio
-- ============================================================
select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  -- Una trabajadora no gestiona el espacio: el tipo impositivo no es suyo.
  begin
    perform public.set_space_tax_rate((select v from pz_ids where k = 'espacio'), 10);
    raise exception 'M58 FALLIDO: una trabajadora cambió el IVA del espacio'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'M58 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_antes numeric;
begin
  select tax_rate_percent into v_antes
  from public.spaces where id = (select v from pz_ids where k = 'espacio');

  -- Fuera de rango no se guarda: un IVA negativo no existe.
  begin
    perform public.set_space_tax_rate((select v from pz_ids where k = 'espacio'), -1);
    raise exception 'M58 FALLIDO: se guardó un IVA negativo' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'M58 FALLIDO%' then raise; end if;
  end;
  begin
    perform public.set_space_tax_rate((select v from pz_ids where k = 'espacio'), 101);
    raise exception 'M58 FALLIDO: se guardó un IVA del 101 %%' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'M58 FALLIDO%' then raise; end if;
  end;

  perform public.set_space_tax_rate((select v from pz_ids where k = 'espacio'), 10);

  if (select tax_rate_percent from public.spaces where id = (select v from pz_ids where k = 'espacio')) <> 10 then
    raise exception 'M58 FALLIDO: no se guardó el IVA nuevo' using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'space.tax_rate_changed'
      and entity_id = (select v from pz_ids where k = 'espacio')
      and old_value->>'tax_rate_percent' = v_antes::text
      and new_value->>'tax_rate_percent' = '10'
  ) then
    raise exception 'M58 FALLIDO: el cambio de IVA no dejó auditoría con el valor anterior'
      using errcode = 'assert_failure';
  end if;

  -- CA-17 · guardar el mismo valor otra vez no apunta un cambio que no hubo.
  perform public.set_space_tax_rate((select v from pz_ids where k = 'espacio'), 10);
  if (select count(*) from public.audit_log
      where action = 'space.tax_rate_changed'
        and entity_id = (select v from pz_ids where k = 'espacio')) <> 1 then
    raise exception 'M58 FALLIDO: guardar el mismo IVA dos veces apuntó dos cambios'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- R12 · cancelar una solicitud que todavía no es un trabajo
-- ============================================================
select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_req uuid;
begin
  v_req := public.create_request_draft(
    (select v from pz_ids where k = 'rest'), 'Cambiar la foto de portada');
  perform public.submit_request(v_req);
  insert into pz_ids values ('sol_cancelar', v_req);

  perform public.cancel_request(v_req, 'Ya no hace falta');
end $$;
reset role;

do $$
begin
  if (select state from public.requests where id = (select v from pz_ids where k = 'sol_cancelar'))
     <> 'cancelled_before_start' then
    raise exception 'R12 FALLIDO: el restaurante no pudo cancelar su solicitud'
      using errcode = 'assert_failure';
  end if;

  -- El motivo es la frase de alguien y se guarda. Va a `audit_log` y no a
  -- `state_events`, que no acepta solicitudes: es la convención que ya
  -- sigue `cancel_accepted_request()`.
  if not exists (
    select 1 from public.audit_log
    where action = 'request.cancelled'
      and entity_id = (select v from pz_ids where k = 'sol_cancelar')
      and old_value->>'state' = 'received'
      and new_value->>'state' = 'cancelled_before_start'
      and reason = 'Ya no hace falta'
  ) then
    raise exception 'R12 FALLIDO: la cancelación no dejó auditoría con su estado anterior y su motivo'
      using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  -- CA-17 · cancelar dos veces no hace nada la segunda.
  perform public.cancel_request((select v from pz_ids where k = 'sol_cancelar'), 'otra vez');
end $$;
reset role;

do $$
begin
  if (select count(*) from public.audit_log
      where action = 'request.cancelled'
        and entity_id = (select v from pz_ids where k = 'sol_cancelar')) <> 1 then
    raise exception 'R12 FALLIDO: cancelar dos veces apuntó dos cancelaciones'
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y alguien de fuera no cancela nada de nadie.
select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_req uuid;
begin
  -- Una solicitud nueva, para que el rechazo no sea por estar ya cancelada.
  begin
    perform public.cancel_request((select v from pz_ids where k = 'sol_cancelar'), 'me apetece');
    -- Es idempotente para la ya cancelada, así que esto NO debe fallar por
    -- permiso... pero tampoco debe dejar rastro. Lo que se comprueba de
    -- verdad está abajo, con una viva.
  exception when others then
    null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_req uuid;
begin
  v_req := public.create_request_draft(
    (select v from pz_ids where k = 'rest'), 'Otra cosa distinta');
  perform public.submit_request(v_req);
  insert into pz_ids values ('sol_viva', v_req);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  begin
    perform public.cancel_request((select v from pz_ids where k = 'sol_viva'), 'me apetece');
    raise exception 'R12 FALLIDO: alguien de fuera canceló una solicitud ajena'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'R12 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

do $$
begin
  if (select state from public.requests where id = (select v from pz_ids where k = 'sol_viva'))
     = 'cancelled_before_start' then
    raise exception 'R12 FALLIDO: la solicitud viva acabó cancelada por un extraño'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- A17 · la edición simultánea del menú
-- ============================================================
--
-- Menú Diario es un servicio contratado, no algo que todo restaurante
-- tenga: `create_menu()` lo exige. Se le da al de esta suite como
-- superusuario porque contratarlo es otro flujo y no es lo que se prueba
-- aquí.
insert into public.services (id, space_id, name, price_cents, price_premium_cents, kind, included_updates)
values ('aa200000-0000-0000-0000-000000000001', (select v from pz_ids where k = 'espacio'),
        'Menú Diario', 22900, 19900, 'daily_menu', 30);

insert into public.subscriptions (space_id, establishment_id, kind, service_id, status, started_at, created_by)
values ((select v from pz_ids where k = 'espacio'), (select v from pz_ids where k = 'rest'),
        'service', 'aa200000-0000-0000-0000-000000000001', 'active',
        now() - interval '10 days', 'aa100000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_menu uuid;
begin
  v_menu := public.create_menu(
    (select v from pz_ids where k = 'rest'),
    'Menú de prueba',
    'daily',
    (now() + interval '3 days')::date);
  insert into pz_ids values ('menu', v_menu);

  -- Dos versiones seguidas, como quien escribe y guarda dos veces.
  perform public.save_menu_version(v_menu, array['Crema'], array['Merluza'], array['Flan']);
  perform public.save_menu_version(v_menu, array['Crema', 'Sopa'], array['Merluza'], array['Flan']);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_menu uuid := (select v from pz_ids where k = 'menu');
begin
  -- Quien abrió el editor cuando iba por la 1 y pulsa ahora: se avisa, no
  -- se pisa lo que la otra persona guardó.
  begin
    perform public.save_menu_version(
      v_menu, array['Lo mío'], array['Lo mío'], array['Lo mío'], null, null, null, 1);
    raise exception 'A17 FALLIDO: se guardó encima de una versión más nueva sin avisar'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'A17 FALLIDO%' then raise; end if;
    -- El mensaje lleva el número real para que la pantalla pueda ofrecer la
    -- comparación sin volver a preguntar.
    if sqlerrm not like '%EDICION_SIMULTANEA%' or sqlerrm not like '%versión 2%' then
      raise exception 'A17 FALLIDO: el aviso no dice contra qué versión se chocó (%)', sqlerrm
        using errcode = 'assert_failure';
    end if;
  end;

  -- Con el número correcto sí guarda.
  perform public.save_menu_version(
    v_menu, array['Crema', 'Sopa'], array['Merluza', 'Pollo'], array['Flan'], null, null, null, 2);

  if (select max(version) from public.menu_versions where menu_id = v_menu) <> 3 then
    raise exception 'A17 FALLIDO: con la versión correcta no se guardó' using errcode = 'assert_failure';
  end if;

  -- Y sin decir nada se comporta como siempre: ninguna pantalla de las que
  -- ya existían cambia por esto.
  perform public.save_menu_version(v_menu, array['Crema'], array['Merluza'], array['Flan']);
  if (select max(version) from public.menu_versions where menu_id = v_menu) <> 4 then
    raise exception 'A17 FALLIDO: sin `p_expected_version` dejó de guardar'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- R24 y M47 · comunicar la baja del servicio (RN-EST-09)
-- ============================================================
select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  begin
    perform public.request_service_termination((select v from pz_ids where k = 'rest'), 'porque sí');
    raise exception 'R24 FALLIDO: alguien de fuera comunicó la baja de un restaurante ajeno'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'R24 FALLIDO%' then raise; end if;
  end;
end $$;
reset role;

-- El restaurante comunica la suya (R24).
select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  -- Y no puede registrar una "de fuera": eso es un acto del equipo.
  begin
    perform public.request_service_termination(
      (select v from pz_ids where k = 'rest'), 'llamaron', false);
    raise exception 'M47 FALLIDO: el restaurante registró una baja comunicada por fuera'
      using errcode = 'assert_failure';
  exception when others then
    if sqlerrm like 'M47 FALLIDO%' then raise; end if;
  end;

  perform public.request_service_termination(
    (select v from pz_ids where k = 'rest'), 'Cerramos en diciembre');
end $$;
reset role;

do $$
begin
  -- RN-EST-09 · `ending` es servicio EN MARCHA: no se corta nada hoy.
  if (select status from public.establishments where id = (select v from pz_ids where k = 'rest'))
     <> 'ending' then
    raise exception 'R24 FALLIDO: el restaurante no quedó en «ending»' using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'establishment.termination_requested'
      and entity_id = (select v from pz_ids where k = 'rest')
      and new_value->>'requested_by_client' = 'true'
      and reason = 'Cerramos en diciembre'
  ) then
    raise exception 'R24 FALLIDO: la baja no dejó auditoría con su motivo y quién la pidió'
      using errcode = 'assert_failure';
  end if;
end $$;

-- CA-17 · comunicarla dos veces no hace nada la segunda.
select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  perform public.request_service_termination((select v from pz_ids where k = 'rest'), 'otra vez');
end $$;
reset role;

do $$
begin
  if (select count(*) from public.audit_log
      where action = 'establishment.termination_requested'
        and entity_id = (select v from pz_ids where k = 'rest')) <> 1 then
    raise exception 'R24 FALLIDO: comunicar la baja dos veces la apuntó dos veces'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- El barrido de siempre: nada de esto se abre a `anon`
-- ============================================================
do $$
begin
  if has_function_privilege('anon', 'public.set_space_tax_rate(uuid, numeric)', 'execute')
     or has_function_privilege('anon', 'public.cancel_request(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.request_service_termination(uuid, text, boolean)', 'execute')
     -- La firma creció con la 101 y cambió con la 102: el noveno argumento
     -- es la NOTA de alérgenos (§39 reescrito, decisión 47), no el documento
     -- por plato. Se nombra entera porque comprobar el privilegio de
     -- "alguna save_menu_version" no comprueba nada: lo que importa es que
     -- la que EXISTE esté cerrada.
     or has_function_privilege('anon', 'public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer, text)', 'execute') then
    raise exception 'CLAUDE.md MUST FALLIDO: una función de la migración 99 está abierta a anon'
      using errcode = 'assert_failure';
  end if;

  -- Y la firma vieja de `save_menu_version` no sigue por ahí: dos funciones
  -- con el mismo nombre y distinta idea de la concurrencia es exactamente
  -- lo que la 99 viene a evitar.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'save_menu_version') <> 1 then
    raise exception 'A17 FALLIDO: hay más de una save_menu_version()' using errcode = 'assert_failure';
  end if;
end $$;

select 'piezas_sueltas_del_diseno: OK' as resultado;
