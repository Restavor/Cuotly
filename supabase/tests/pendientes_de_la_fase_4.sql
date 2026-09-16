-- Fase 4 · después del Hito 22 · las cuatro pendientes de la Fase 4
-- (migración 95; decisión 38 de docs/DECISIONES.md; PRD RN-SUB-13,
-- RN-PLA-09 y RN-ADM-13).
--
--   · RN-SUB-13: avisos al 80 % y al 100 % del almacenamiento incluido en
--     el plan (§113), al propietario y, al 100 %, también a Cuotly. Una
--     vez al mes por umbral. Pasarse NO bloquea nada: se presupuesta
--     aparte (pendiente 18). "Uso razonable" no tiene umbral y aquí no se
--     mide (pendiente 17: lo controla Bosco).
--   · RN-PLA-09: una sola prueba gratuita por negocio: el mismo NIF o el
--     mismo dominio de correo no público (pendiente 19). Un dominio
--     público (gmail…) no identifica a nadie.
--   · RN-ADM-13: el incidente de seguridad de §142 se declara como evento
--     de estado marcado como tal, con aviso obligatorio a los propietarios
--     afectados (pendiente 20.3). Los otros tres puntos legales quedan como
--     están y no tienen nada que probar aquí.
--   · CLAUDE.md: las internas cerradas por RPC; las de plataforma solo
--     con la sesión verificada en dos pasos.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pendientes_de_la_fase_4.sql

insert into auth.users (id, email, role, aud) values
  ('ffc00000-0000-0000-0000-000000000001', 'nuria@fonda-azul.test', 'authenticated', 'authenticated'),
  ('ffc00000-0000-0000-0000-000000000002', 'p4-cuotly@example.com', 'authenticated', 'authenticated'),
  ('ffc00000-0000-0000-0000-000000000003', 'pepe@fonda-azul.test', 'authenticated', 'authenticated'),
  ('ffc00000-0000-0000-0000-000000000004', 'gestoria@otra-gestoria.test', 'authenticated', 'authenticated'),
  ('ffc00000-0000-0000-0000-000000000005', 'p4-uno@gmail.com', 'authenticated', 'authenticated'),
  ('ffc00000-0000-0000-0000-000000000006', 'p4-dos@gmail.com', 'authenticated', 'authenticated'),
  ('ffc00000-0000-0000-0000-000000000007', 'p4-cuotly-sin@example.com', 'authenticated', 'authenticated');

-- Un Administrador de Cuotly que aprueba espacios Y gestiona suscripciones
-- (recibe el aviso del 100 %), y otro sin el segundo permiso (no lo recibe).
insert into public.platform_roles (user_id, role, can_approve_spaces, can_manage_subscriptions) values
  ('ffc00000-0000-0000-0000-000000000002', 'cuotly_admin', true, true),
  ('ffc00000-0000-0000-0000-000000000007', 'cuotly_admin', true, false);

-- RN-ADM-02 · sin este reclamo la plataforma no existe.
select set_config('request.jwt.claim.aal', 'aal2', false);

create temp table p4_ids (k text primary key, v uuid);
grant select, insert, update on p4_ids to authenticated, service_role;

-- ============================================================
-- Fixtures · tres solicitudes aprobadas: Fonda Azul (NIF y dominio
-- propios), y dos con Gmail que no tienen nada que ver entre sí
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Fonda Azul', 'Nuria Vela', 'nuria@fonda-azul.test', 'pro',
    '600444555', 2, 3, 'Mantenimiento de la web', 'Fonda Azul SL', 'B-11.222.333', 'Plaza Vieja 4');
  perform public.submit_space_request(v_id);
  insert into p4_ids values ('sol_azul', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Casa Uno', 'Uno Gómez', 'p4-uno@gmail.com', 'pro', '600555666', 1, 1, 'Web');
  perform public.submit_space_request(v_id);
  insert into p4_ids values ('sol_uno', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  insert into p4_ids values ('azul', public.approve_space_request((select v from p4_ids where k = 'sol_azul'), 'p4-azul'));
  insert into p4_ids values ('uno', public.approve_space_request((select v from p4_ids where k = 'sol_uno'), 'p4-uno'));
end $$;
reset role;

-- ============================================================
-- RN-PLA-09 · el mismo negocio por el NIF
-- ============================================================
do $$
begin
  if public.normalized_tax_id(' b-11.222.333 ') <> 'B11222333' then
    raise exception 'RN-PLA-09 FALLIDO: el NIF no se normaliza (espacios, guiones, puntos, mayúsculas)'
      using errcode = 'assert_failure';
  end if;
  if public.normalized_tax_id('  ') is not null or public.normalized_tax_id(null) is not null then
    raise exception 'RN-PLA-09 FALLIDO: un NIF vacío no es "ningún NIF"' using errcode = 'assert_failure';
  end if;
  if public.email_domain('  Pepe@Fonda-Azul.TEST ') <> 'fonda-azul.test' then
    raise exception 'RN-PLA-09 FALLIDO: el dominio de correo no se extrae en minúsculas'
      using errcode = 'assert_failure';
  end if;
  if not public.is_public_email_domain('gmail.com') or not public.is_public_email_domain('Hotmail.es')
     or public.is_public_email_domain('fonda-azul.test') then
    raise exception 'RN-PLA-09 FALLIDO: la lista de dominios públicos no distingue gmail de un dominio propio'
      using errcode = 'assert_failure';
  end if;
end $$;

-- Otra persona, otro nombre, otro dominio… y el MISMO NIF escrito de otra forma.
select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'La Fonda de Siempre', 'Gestoría Otra', 'gestoria@otra-gestoria.test', 'agency',
    '600666777', 1, 1, 'Web', 'Fonda Azul SL', 'b11222333', 'Plaza Vieja 4');
  perform public.submit_space_request(v_id);
  insert into p4_ids values ('sol_nif', v_id);

  -- Quien la escribe no ve con qué choca: eso es de la plataforma (§128).
  begin
    perform public.space_request_trial_conflicts(v_id);
    raise exception 'RN-PLA-09 FALLIDO: el solicitante lee los conflictos de prueba de la plataforma'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PLA%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_kind text; v_matched text; v_business text; v_n integer;
begin
  select count(*) into v_n from public.space_request_trial_conflicts((select v from p4_ids where k = 'sol_nif'));
  if v_n <> 1 then
    raise exception 'RN-PLA-09 FALLIDO: el mismo NIF debía chocar con exactamente una solicitud aprobada y choca con %', v_n
      using errcode = 'assert_failure';
  end if;
  select kind, matched, business_name into v_kind, v_matched, v_business
  from public.space_request_trial_conflicts((select v from p4_ids where k = 'sol_nif'));
  if v_kind <> 'tax_id' or v_matched <> 'B11222333' or v_business <> 'Fonda Azul' then
    raise exception 'RN-PLA-09 FALLIDO: el conflicto por NIF no dice el NIF ni con quién (%, %, %)', v_kind, v_matched, v_business
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.approve_space_request((select v from p4_ids where k = 'sol_nif'), 'p4-nif');
    raise exception 'RN-PLA-09 FALLIDO: el mismo negocio (mismo NIF) consigue una segunda prueba gratuita (§4.4)'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PLA%' then raise; end if;
      if sqlerrm not like '%NIF%' then
        raise exception 'RN-PLA-09 FALLIDO: el rechazo no dice que es por el NIF: %', sqlerrm
          using errcode = 'assert_failure';
      end if;
  end;

  -- La solicitud no cambió de estado: el rechazo automático no decide por Cuotly.
  if (select status from public.space_requests where id = (select v from p4_ids where k = 'sol_nif')) <> 'submitted' then
    raise exception 'RN-PLA-09 FALLIDO: la solicitud que choca cambió de estado sola' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-PLA-09 · el mismo negocio por el dominio de correo propio
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  -- Sin NIF, otro nombre, otra persona: solo la comparte el dominio.
  v_id := public.save_space_request_draft(
    'Terraza Azul', 'Pepe Vela', 'pepe@fonda-azul.test', 'pro', '600777888', 1, 1, 'Web');
  perform public.submit_space_request(v_id);
  insert into p4_ids values ('sol_dominio', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_kind text; v_matched text;
begin
  select kind, matched into v_kind, v_matched
  from public.space_request_trial_conflicts((select v from p4_ids where k = 'sol_dominio'));
  if v_kind is distinct from 'email_domain' or v_matched <> 'fonda-azul.test' then
    raise exception 'RN-PLA-09 FALLIDO: el mismo dominio propio no se detecta (%, %)', v_kind, v_matched
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.approve_space_request((select v from p4_ids where k = 'sol_dominio'), 'p4-dominio');
    raise exception 'RN-PLA-09 FALLIDO: el mismo negocio (mismo dominio) consigue una segunda prueba gratuita (§4.4)'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PLA%' then raise; end if;
      if sqlerrm not like '%dominio%' then
        raise exception 'RN-PLA-09 FALLIDO: el rechazo no dice que es por el dominio: %', sqlerrm
          using errcode = 'assert_failure';
      end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-PLA-09 · un dominio público no identifica a nadie: Gmail pasa
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.save_space_request_draft(
    'Casa Dos', 'Dos Pérez', 'p4-dos@gmail.com', 'pro', '600888999', 1, 1, 'Web');
  perform public.submit_space_request(v_id);
  insert into p4_ids values ('sol_dos', v_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.space_request_trial_conflicts((select v from p4_ids where k = 'sol_dos'))) then
    raise exception 'RN-PLA-09 FALLIDO: dos restaurantes distintos con Gmail se toman por el mismo negocio'
      using errcode = 'assert_failure';
  end if;
  insert into p4_ids values ('dos', public.approve_space_request((select v from p4_ids where k = 'sol_dos'), 'p4-dos'));
  if (select v from p4_ids where k = 'dos') is null then
    raise exception 'RN-PLA-09 FALLIDO: la segunda solicitud con Gmail no se aprueba' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-SUB-13 · el almacenamiento: lo incluido, el 80 % y el 100 %
-- ============================================================
-- Fonda Azul es Pro: 20 GB incluidos. Cada versión de archivo pesa lo
-- máximo que admite la tabla (25 MB): 656 llegan al 80 % y 820 al 100 %.
insert into public.groups (id, space_id, name)
select 'ffc30000-0000-0000-0000-000000000001', v, 'Grupo Azul' from p4_ids where k = 'azul';
insert into public.establishments (id, space_id, group_id, code, name)
select 'ffc40000-0000-0000-0000-000000000001', v, 'ffc30000-0000-0000-0000-000000000001', 'AZUL-1', 'Fonda Azul' from p4_ids where k = 'azul';
insert into public.files (id, space_id, group_id, establishment_id, category, name, created_by)
select 'ffc50000-0000-0000-0000-000000000001', v, 'ffc30000-0000-0000-0000-000000000001',
       'ffc40000-0000-0000-0000-000000000001', 'photos', 'Fotos del comedor', 'ffc00000-0000-0000-0000-000000000001'
from p4_ids where k = 'azul';

create or replace function pg_temp.p4_add_versions(p_from integer, p_to integer) returns void
language sql as $$
  insert into public.file_versions (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, created_by)
  select 'ffc50000-0000-0000-0000-000000000001', (select v from p4_ids where k = 'azul'), g,
         'azul/fotos/' || g || '.jpg', 'foto-' || g || '.jpg', 'image/jpeg', 26214400,
         'ffc00000-0000-0000-0000-000000000001'
  from generate_series(p_from, p_to) g;
$$;

do $$
declare v_space uuid := (select v from p4_ids where k = 'azul');
        v_slug text := (select slug from public.spaces where id = v_space);
        v_n integer;
begin
  if public.cuotly_storage_limit_bytes(v_space) <> 20::bigint * 1024 * 1024 * 1024 then
    raise exception 'RN-SUB-13 FALLIDO: lo incluido en Pro no son 20 GB' using errcode = 'assert_failure';
  end if;
  -- Sin plan de Cuotly (Restavor, la demo) no hay nada que vigilar.
  if public.cuotly_storage_limit_bytes(gen_random_uuid()) is not null then
    raise exception 'RN-SUB-13 FALLIDO: un espacio sin plan de Cuotly tiene límite de almacenamiento'
      using errcode = 'assert_failure';
  end if;

  -- Por debajo del 80 %: silencio.
  perform pg_temp.p4_add_versions(1, 600);
  if public.run_cuotly_storage_sweep(v_space, '2026-10-05 10:00+00') <> 0 then
    raise exception 'RN-SUB-13 FALLIDO: avisa por debajo del 80 %%' using errcode = 'assert_failure';
  end if;

  -- 80 %: al propietario, con el porcentaje y el enlace a su suscripción.
  perform pg_temp.p4_add_versions(601, 656);
  if public.run_cuotly_storage_sweep(v_space, '2026-10-05 11:00+00') <> 1 then
    raise exception 'RN-SUB-13 FALLIDO: al 80 %% no avisa exactamente al propietario' using errcode = 'assert_failure';
  end if;
  select count(*) into v_n from public.notifications
  where space_id = v_space and recipient_id = 'ffc00000-0000-0000-0000-000000000001'
    and event_type = 'storage_threshold_80' and threshold_percent = 80
    and deep_link = '/espacios/' || v_slug || '/ajustes/suscripcion';
  if v_n <> 1 then
    raise exception 'RN-SUB-13 FALLIDO: el aviso del 80 %% no lleva umbral y enlace a la suscripción' using errcode = 'assert_failure';
  end if;
  -- El aviso del 80 % no molesta a Cuotly: al 80 % no hay nada que presupuestar.
  if exists (select 1 from public.notifications where recipient_id = 'ffc00000-0000-0000-0000-000000000002' and event_type = 'storage_threshold_80') then
    raise exception 'RN-SUB-13 FALLIDO: el 80 %% avisa a Cuotly' using errcode = 'assert_failure';
  end if;

  -- El mismo mes, otra hora: nada (una vez al mes por umbral).
  if public.run_cuotly_storage_sweep(v_space, '2026-10-20 09:00+00') <> 0 then
    raise exception 'RN-SUB-13 FALLIDO: repite el aviso del 80 %% dentro del mismo mes' using errcode = 'assert_failure';
  end if;
  -- El mes siguiente, si sigue por encima: se recuerda.
  if public.run_cuotly_storage_sweep(v_space, '2026-11-02 09:00+00') <> 1 then
    raise exception 'RN-SUB-13 FALLIDO: no recuerda el 80 %% al mes siguiente' using errcode = 'assert_failure';
  end if;

  -- 100 %: al propietario Y a Cuotly (Bosco y quien gestiona suscripciones;
  -- cuántos gestores hay depende de las suites anteriores, así que se
  -- exige "al menos los dos de aquí" y se mira uno a uno).
  perform pg_temp.p4_add_versions(657, 820);
  if public.run_cuotly_storage_sweep(v_space, '2026-11-15 09:00+00') < 2 then
    raise exception 'RN-SUB-13 FALLIDO: al 100 %% debía avisar al propietario y al gestor de suscripciones'
      using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.notifications
                 where space_id = v_space and recipient_id = 'ffc00000-0000-0000-0000-000000000001'
                   and event_type = 'storage_threshold_100' and threshold_percent = 100) then
    raise exception 'RN-SUB-13 FALLIDO: el propietario no recibe el aviso del 100 %%' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.notifications
                 where space_id = v_space and recipient_id = 'ffc00000-0000-0000-0000-000000000002'
                   and event_type = 'storage_threshold_100' and deep_link = '/administracion/espacios') then
    raise exception 'RN-SUB-13 FALLIDO: quien gestiona suscripciones no recibe el aviso del 100 %% con el enlace al panel'
      using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications where recipient_id = 'ffc00000-0000-0000-0000-000000000007' and event_type like 'storage_%') then
    raise exception 'RN-SUB-13 FALLIDO: un Administrador de Cuotly SIN el permiso de suscripciones recibe el aviso'
      using errcode = 'assert_failure';
  end if;

  -- Pasarse NO bloquea nada (decisión 38: se presupuesta aparte). El
  -- espacio sigue como estaba y sigue admitiendo archivos.
  if (select cuotly_status from public.spaces where id = v_space) <> 'trial' then
    raise exception 'RN-SUB-13 FALLIDO: pasarse del almacenamiento cambió el estado del espacio' using errcode = 'assert_failure';
  end if;
  perform pg_temp.p4_add_versions(821, 821);
  if (select storage_bytes from public.cuotly_space_usage(v_space)) <> 821::bigint * 26214400 then
    raise exception 'RN-SUB-13 FALLIDO: el uso medido no cuadra con lo subido' using errcode = 'assert_failure';
  end if;

  -- El barrido está en la cola de trabajos, solo para espacios con plan de Cuotly.
  perform public.enqueue_due_scheduled_jobs('2026-12-01 09:00+00');
  if not exists (select 1 from public.scheduled_jobs where space_id = v_space and kind = 'cuotly_storage_sweep') then
    raise exception 'RN-SUB-13 FALLIDO: el barrido de almacenamiento no se encola' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.scheduled_jobs j join public.spaces s on s.id = j.space_id
             where j.kind = 'cuotly_storage_sweep' and s.cuotly_plan is null) then
    raise exception 'RN-SUB-13 FALLIDO: se encola el barrido para espacios sin plan de Cuotly' using errcode = 'assert_failure';
  end if;
  -- Y el despachador lo ejecuta (diciembre: nuevo mes, vuelve a avisar del 100 %).
  select public.run_scheduled_job(j.id) into v_n from public.scheduled_jobs j
  where j.space_id = v_space and j.kind = 'cuotly_storage_sweep' and j.status = 'pending'
  order by j.created_at desc limit 1;
  if v_n < 1 then
    raise exception 'RN-SUB-13 FALLIDO: el despachador no ejecuta el barrido de almacenamiento (%)', v_n
      using errcode = 'assert_failure';
  end if;
end $$;

-- El panel ve el uso frente a lo incluido, y cuenta los que se pasan.
select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_space uuid := (select v from p4_ids where k = 'azul'); v_row record; v_sum jsonb;
begin
  select storage_bytes, storage_limit_bytes into v_row from public.platform_list_spaces() where id = v_space;
  if v_row.storage_limit_bytes <> 20::bigint * 1024 * 1024 * 1024 or v_row.storage_bytes < v_row.storage_limit_bytes then
    raise exception 'RN-SUB-13 FALLIDO: el panel no enseña el uso frente a lo incluido (% de %)', v_row.storage_bytes, v_row.storage_limit_bytes
      using errcode = 'assert_failure';
  end if;
  v_sum := public.platform_panel_summary();
  if coalesce((v_sum->>'storage_over_limit')::integer, 0) < 1 then
    raise exception 'RN-SUB-13 FALLIDO: el resumen del panel no cuenta los espacios que se pasan de lo incluido'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ADM-13 · el incidente de seguridad (§142)
-- ============================================================
-- Es obligatorio: el propietario no puede apagarlo.
do $$
begin
  if not public.notification_event_is_mandatory('security_incident') then
    raise exception 'RN-ADM-13 FALLIDO: el aviso de incidente de seguridad no es obligatorio' using errcode = 'assert_failure';
  end if;
  if public.notification_event_is_mandatory('storage_threshold_80') or public.notification_event_is_mandatory('storage_threshold_100') then
    raise exception 'RN-SUB-13 FALLIDO: los avisos de almacenamiento no son de los obligatorios' using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  begin
    perform public.set_notification_preference((select v from p4_ids where k = 'azul'), 'security_incident', false, false);
    raise exception 'RN-ADM-13 FALLIDO: el propietario apaga el aviso de incidente de seguridad' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;

  -- Y no lo declara: es de la plataforma.
  begin
    perform public.declare_security_incident('Me lo invento', null);
    raise exception 'RN-ADM-13 FALLIDO: un propietario declara un incidente de seguridad' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
end $$;
reset role;

-- Sin el segundo paso, tampoco la plataforma (RN-ADM-02).
select set_config('request.jwt.claim.aal', 'aal1', false);
select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  begin
    perform public.declare_security_incident('Sin segundo paso', null);
    raise exception 'RN-ADM-02 FALLIDO: se declara un incidente de seguridad sin la sesión verificada en dos pasos'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.aal', 'aal2', false);

-- Declararlo para todos: cada propietario de cada espacio recibe el aviso.
select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_id uuid; v_n integer; v_snapshot jsonb;
begin
  begin
    perform public.declare_security_incident('   ', 'sin título');
    raise exception 'RN-ADM-13 FALLIDO: un incidente sin título' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ADM%' then raise; end if;
  end;

  v_id := public.declare_security_incident(
    'Acceso no autorizado a una copia de seguridad',
    'Hemos detectado un acceso no autorizado. Cambia tu contraseña y revisa tus sesiones.',
    'degraded', 'auth');
  insert into p4_ids values ('incidente', v_id);
end $$;
reset role;

-- Lo que pasó, visto desde fuera de cualquier espacio (la RLS de
-- `notifications` solo enseña a cada uno los suyos).
do $$
declare v_id uuid := (select v from p4_ids where k = 'incidente'); v_n integer; v_snapshot jsonb;
begin
  if not (select security from public.platform_status_events where id = v_id) then
    raise exception 'RN-ADM-13 FALLIDO: el evento de estado no queda marcado como de seguridad' using errcode = 'assert_failure';
  end if;

  -- Los tres propietarios de esta suite lo reciben, cada uno por su espacio.
  select count(*) into v_n from public.notifications n
  where n.event_type = 'security_incident' and n.deep_link = '/estado' and n.entity_type = 'space'
    and n.dedupe_key = 'security_incident:' || v_id::text || ':' || n.space_id::text
    and (n.space_id, n.recipient_id) in (
      ((select v from p4_ids where k = 'azul'), 'ffc00000-0000-0000-0000-000000000001'),
      ((select v from p4_ids where k = 'uno'), 'ffc00000-0000-0000-0000-000000000005'),
      ((select v from p4_ids where k = 'dos'), 'ffc00000-0000-0000-0000-000000000006'));
  if v_n <> 3 then
    raise exception 'RN-ADM-13 FALLIDO: los propietarios afectados no reciben el aviso obligatorio (% de 3)', v_n
      using errcode = 'assert_failure';
  end if;
  -- Y va por correo aunque el propietario nunca haya tocado sus preferencias.
  if (select count(*) from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
      where n.event_type = 'security_incident' and n.dedupe_key like 'security_incident:' || v_id::text || ':%'
        and d.channel = 'email') < 3 then
    raise exception 'RN-ADM-13 FALLIDO: el aviso obligatorio no sale por correo' using errcode = 'assert_failure';
  end if;

  -- Un incidente, un evento.
  if (select count(*) from public.platform_status_events where security) <> 1 then
    raise exception 'RN-ADM-13 FALLIDO: un incidente, un evento' using errcode = 'assert_failure';
  end if;

  -- Auditoría con el actor y la marca de seguridad.
  if not exists (select 1 from public.audit_log
                 where action = 'platform_status.declared' and entity_id = v_id
                   and actor_id = 'ffc00000-0000-0000-0000-000000000002'
                   and (new_value->>'security')::boolean and new_value->>'spaces' = 'all'
                   and (new_value->>'owners_notified')::integer >= 3) then
    raise exception 'RN-ADM-13 FALLIDO: falta la auditoría del incidente de seguridad' using errcode = 'assert_failure';
  end if;

  -- La instantánea pública lo marca.
  v_snapshot := public.platform_status_snapshot();
  if not exists (select 1 from jsonb_array_elements(v_snapshot->'open_events') e
                 where e->>'id' = v_id::text and (e->>'security')::boolean) then
    raise exception 'RN-ADM-13 FALLIDO: la página de estado no dice que es un incidente de seguridad' using errcode = 'assert_failure';
  end if;
end $$;

-- Solo para algunos espacios: los demás propietarios no reciben nada.
select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  insert into p4_ids values ('incidente_uno', public.declare_security_incident(
    'Incidente en un solo espacio', 'Solo afecta a Casa Uno.', 'degraded', 'files',
    array[(select v from p4_ids where k = 'uno')]));
end $$;
reset role;

do $$
declare v_id uuid := (select v from p4_ids where k = 'incidente_uno');
begin
  if not exists (select 1 from public.notifications
                 where event_type = 'security_incident' and dedupe_key = 'security_incident:' || v_id::text || ':' || (select v from p4_ids where k = 'uno')::text
                   and recipient_id = 'ffc00000-0000-0000-0000-000000000005') then
    raise exception 'RN-ADM-13 FALLIDO: el propietario del espacio afectado no recibe el aviso' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications
             where event_type = 'security_incident' and dedupe_key like 'security_incident:' || v_id::text || ':%'
               and recipient_id <> 'ffc00000-0000-0000-0000-000000000005') then
    raise exception 'RN-ADM-13 FALLIDO: un incidente de un espacio avisa a propietarios de otros' using errcode = 'assert_failure';
  end if;
  if (select new_value->>'spaces' from public.audit_log where action = 'platform_status.declared' and entity_id = v_id) <> 'some' then
    raise exception 'RN-ADM-13 FALLIDO: la auditoría no dice que fue para algunos espacios' using errcode = 'assert_failure';
  end if;
end $$;

-- El propietario ve su aviso; el de otro espacio, no (RLS de siempre).
select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.notifications where event_type = 'security_incident') <> 1 then
    raise exception 'RN-ADM-13 FALLIDO: el propietario de Fonda Azul debía ver exactamente su aviso de seguridad'
      using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Un evento de estado corriente NO es de seguridad y no avisa a nadie.
select set_config('request.jwt.claim.sub', 'ffc00000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  insert into p4_ids values ('corriente', public.declare_platform_status_event('app', 'degraded', 'Lentitud en la aplicación'));
end $$;
reset role;

do $$
begin
  if (select security from public.platform_status_events where id = (select v from p4_ids where k = 'corriente')) then
    raise exception 'RN-ADM-13 FALLIDO: un evento corriente nace marcado como de seguridad' using errcode = 'assert_failure';
  end if;
  -- Ningún aviso de seguridad cuelga de este evento.
  if exists (select 1 from public.notifications
             where event_type = 'security_incident'
               and dedupe_key like 'security_incident:' || (select v from p4_ids where k = 'corriente')::text || ':%') then
    raise exception 'RN-ADM-13 FALLIDO: un evento corriente manda el aviso de seguridad' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- CLAUDE.md · privilegios
-- ============================================================
do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'cuotly_storage_limit_bytes(uuid)',
    'notify_platform_storage(uuid, text)',
    'run_cuotly_storage_sweep(uuid, timestamptz)']
  loop
    if has_function_privilege('anon', 'public.' || v_fn, 'execute')
       or has_function_privilege('authenticated', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % es interna y está abierta por RPC', v_fn using errcode = 'assert_failure';
    end if;
  end loop;

  foreach v_fn in array array[
    'space_request_trial_conflicts(uuid)',
    'declare_security_incident(text, text, text, text, uuid[])',
    'platform_list_spaces()',
    'platform_panel_summary()']
  loop
    if has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % está abierta a anon', v_fn using errcode = 'assert_failure';
    end if;
    if not has_function_privilege('authenticated', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % debía ser llamable con sesión (comprueba el permiso dentro)', v_fn
        using errcode = 'assert_failure';
    end if;
  end loop;

  -- La página de estado es pública: anon la lee, con la marca de seguridad.
  if not has_function_privilege('anon', 'public.platform_status_snapshot()', 'execute') then
    raise exception 'RN-ADM-13 FALLIDO: la página de estado dejó de ser pública' using errcode = 'assert_failure';
  end if;
end $$;

select 'pendientes_de_la_fase_4: OK' as resultado;
