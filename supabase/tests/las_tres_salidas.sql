-- ============================================================
-- Suite 84 · Las tres salidas cuando no llegan los créditos
--            (migración 150; decisión 85; PRD RN-CRE-14)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-CRE-14, opción 1 · quitar cosas: solo el restaurante, solo en una
--     solicitud en créditos pendiente de aceptar; nueva versión del
--     alcance, vuelta a `analyzing` y sin créditos fijados; sin cambios no
--     hace nada; con presupuesto en marcha, no.
--   · RN-CRE-14, opción 3 · pedir presupuesto: solo el restaurante; queda
--     la fecha, se cae la espera, se avisa al propietario y a los
--     administradores (no al trabajador) y dos pulsaciones son una (CA-17).
--     El equipo presupuesta una solicitud en créditos y, aceptado, nace el
--     trabajo sin tocar los créditos (RN-CRE-07).
--   · RN-CRE-29 · un trabajo en créditos no tiene corrección gratis.
--   · CLAUDE.md · privilegios de lo nuevo; la columna se lee.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/las_tres_salidas.sql
--
-- Prefijo de esta suite: f1500000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1500000-0000-0000-0000-000000000001', 'duena-sal@cuotly.test', 'authenticated', 'authenticated'),
  ('f1500000-0000-0000-0000-000000000002', 'cliente-sal@cuotly.test', 'authenticated', 'authenticated'),
  ('f1500000-0000-0000-0000-000000000003', 'trabajador-sal@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1500000-0000-0000-0000-000000000001', 'duena-sal@cuotly.test', 'Dueña Salidas'),
  ('f1500000-0000-0000-0000-000000000002', 'cliente-sal@cuotly.test', 'Cliente Salidas'),
  ('f1500000-0000-0000-0000-000000000003', 'trabajador-sal@cuotly.test', 'Trabajador Salidas')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1501000-0000-0000-0000-000000000001', 'Espacio Salidas', 'espacio-salidas', 'Europe/Madrid',
   'f1500000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1501000-0000-0000-0000-000000000001', 'f1500000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('f1501000-0000-0000-0000-000000000001', 'f1500000-0000-0000-0000-000000000003', 'worker', 'active');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium,
                          included_large, start_sla_hours, included_credits_half) values
  ('f1502000-0000-0000-0000-000000000001', 'f1501000-0000-0000-0000-000000000001', 'Veinte', 9900,
   0, 0, 0, 0, 24, 40);

insert into public.groups (id, space_id, name) values
  ('f1503000-0000-0000-0000-000000000001', 'f1501000-0000-0000-0000-000000000001', 'Grupo Salidas');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1504000-0000-0000-0000-000000000001', 'f1501000-0000-0000-0000-000000000001',
   'f1503000-0000-0000-0000-000000000001', 'EST-SAL-1', 'Casa Salidas', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f1504000-0000-0000-0000-000000000001', 'f1500000-0000-0000-0000-000000000002', 'local_owner');

create temp table sal_ids (k text primary key, v uuid);
grant select, insert, update on sal_ids to authenticated, service_role;

create or replace function pg_temp.sal_valued(p_title text, p_half integer)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  perform set_config('request.jwt.claim.sub', 'f1500000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  v_id := public.create_request_draft('f1504000-0000-0000-0000-000000000001', p_title, null, 'medium', 'Lo necesitamos');
  perform public.submit_request(v_id);
  perform public.begin_request_analysis(v_id);
  set local role postgres;
  perform public.record_credit_valuation(v_id, 'f1500000-0000-0000-0000-000000000002', p_half, null,
    'Resumen de ' || p_title, 'claude-opus-5');
  return v_id;
end;
$$;

-- ============================================================
-- CLAUDE.md · privilegios
-- ============================================================
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.trim_request_scope(uuid, text, text)',
    'public.request_credit_quote(uuid, text)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: anon puede ejecutar %', v_fn using errcode = 'assert_failure';
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '% debería poder llamarla authenticated', v_fn using errcode = 'assert_failure';
    end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.requests', 'quote_requested_at', 'select') then
    raise exception 'RN-CRE-14 FALLIDO: el restaurante no ve que pidió presupuesto' using errcode = 'assert_failure';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1500000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.create_plan_subscription('f1504000-0000-0000-0000-000000000001', 'f1502000-0000-0000-0000-000000000001');
end $$;
set local role postgres;

-- ============================================================
-- RN-CRE-14, opción 1 · quitar cosas
-- ============================================================
do $$
declare
  v_id uuid;
begin
  -- 21 créditos en un plan de 20: no cabe nunca.
  v_id := pg_temp.sal_valued('Tres secciones nuevas', 42);
  insert into sal_ids values ('trim', v_id);

  -- El equipo no recorta el alcance del restaurante.
  perform set_config('request.jwt.claim.sub', 'f1500000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin
    perform public.trim_request_scope(v_id, 'Solo una sección nueva');
    raise exception 'RN-CRE-14 FALLIDO: el equipo recortó el alcance del restaurante' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- El restaurante sí; sin cambiar nada, no.
  perform set_config('request.jwt.claim.sub', 'f1500000-0000-0000-0000-000000000002', true);
  begin
    perform public.trim_request_scope(v_id, 'Tres secciones nuevas');
    raise exception 'RN-CRE-14 FALLIDO: aceptó un recorte que no cambia nada' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  perform public.trim_request_scope(v_id, 'Solo una sección nueva');
  set local role postgres;

  if not exists (select 1 from public.requests where id = v_id and state = 'analyzing'
                 and description = 'Solo una sección nueva' and validated_credits_half is null
                 and validated_category is null) then
    raise exception 'RN-CRE-14 FALLIDO: el recorte no volvió a analizar sin créditos fijados' using errcode = 'assert_failure';
  end if;
  -- P4 · el alcance recortado es una versión más.
  if not exists (select 1 from public.request_versions where request_id = v_id
                 and description = 'Solo una sección nueva') then
    raise exception 'P4 FALLIDO: el recorte no dejó su versión' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where entity_id = v_id and action = 'request.scope_trimmed'
                 and (old_value ->> 'credits_half')::int = 42) then
    raise exception 'RN-CRE-14 FALLIDO: el recorte no quedó en la auditoría' using errcode = 'assert_failure';
  end if;

  -- Y la IA la vuelve a valorar: ahora cabe.
  perform public.record_credit_valuation(v_id, 'f1500000-0000-0000-0000-000000000002', 15, null,
    'Una sección', 'claude-opus-5');
  if (select validated_credits_half from public.requests where id = v_id) <> 15 then
    raise exception 'RN-CRE-09 FALLIDO: la solicitud recortada no se volvió a valorar' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-14, opción 3 · pedir presupuesto
-- ============================================================
do $$
declare
  v_id uuid;
  v_at timestamptz;
  v_quote uuid;
  v_job uuid;
begin
  v_id := pg_temp.sal_valued('Rediseñar la portada', 42);
  insert into sal_ids values ('quote', v_id);

  -- La espera que tuviera se cae al pedir presupuesto.
  update public.requests set credits_deferred_until = now() + interval '10 days' where id = v_id;

  perform set_config('request.jwt.claim.sub', 'f1500000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  begin
    perform public.request_credit_quote(v_id, 'Por si acaso');
    raise exception 'RN-CRE-14 FALLIDO: un trabajador pidió presupuesto por el restaurante' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  perform set_config('request.jwt.claim.sub', 'f1500000-0000-0000-0000-000000000002', true);
  v_at := public.request_credit_quote(v_id, 'Preferimos presupuesto');
  if public.request_credit_quote(v_id, null) <> v_at then -- CA-17
    raise exception 'CA-17 FALLIDO: pedir presupuesto dos veces cambió la fecha' using errcode = 'assert_failure';
  end if;
  set local role postgres;

  if (select quote_requested_at from public.requests where id = v_id) is distinct from v_at
     or (select credits_deferred_until from public.requests where id = v_id) is not null then
    raise exception 'RN-CRE-14 FALLIDO: pedir presupuesto no dejó la fecha o no quitó la espera' using errcode = 'assert_failure';
  end if;

  -- Aviso a la propietaria, una sola vez, y no al trabajador.
  if (select count(*) from public.notifications where entity_id = v_id and event_type = 'credit_quote_requested'
      and recipient_id = 'f1500000-0000-0000-0000-000000000001') <> 1
     or exists (select 1 from public.notifications where entity_id = v_id and event_type = 'credit_quote_requested'
                and recipient_id = 'f1500000-0000-0000-0000-000000000003') then
    raise exception 'RN-CRE-14 FALLIDO: el aviso de presupuesto no llegó exactamente a quien decide' using errcode = 'assert_failure';
  end if;

  -- El equipo lo presupuesta, lo envía y el restaurante lo acepta.
  perform set_config('request.jwt.claim.sub', 'f1500000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  v_quote := public.create_quote('f1504000-0000-0000-0000-000000000001', 'Rediseño de la portada', 60000, 'job',
    null, 'Presupuesto aparte', v_id, false);
  perform public.send_quote(v_quote);

  -- Con presupuesto en marcha, ya no se recorta.
  perform set_config('request.jwt.claim.sub', 'f1500000-0000-0000-0000-000000000002', true);
  begin
    perform public.trim_request_scope(v_id, 'Solo el titular');
    raise exception 'RN-CRE-14 FALLIDO: se recortó una solicitud que ya va por presupuesto' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  perform public.accept_quote(v_quote, null);
  set local role postgres;

  if (select category from public.quotes where id = v_quote) <> 'credits' then
    raise exception 'RN-CRE-14 FALLIDO: el presupuesto no heredó la categoría en créditos' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.jobs where request_id = v_id and quote_id = v_quote) then
    raise exception 'RN-CRE-14 FALLIDO: aceptar el presupuesto no creó el trabajo' using errcode = 'assert_failure';
  end if;
  -- RN-CRE-07 · lo presupuestado no toca los créditos.
  if exists (select 1 from public.consumption_entries where request_id = v_id) then
    raise exception 'RN-CRE-07 FALLIDO: una solicitud presupuestada gastó créditos' using errcode = 'assert_failure';
  end if;

  -- RN-CRE-29 · un trabajo en créditos no tiene corrección gratis, y lo
  -- dice el servidor aunque el trabajo estuviera publicado y en ventana.
  update public.jobs
  set state = 'published', published_at = now(), correction_window_ends_at = now() + interval '3 days'
  where request_id = v_id
  returning id into v_job;
  perform set_config('request.jwt.claim.sub', 'f1500000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  begin
    perform public.request_free_correction(v_job, 'El titular no me convence');
    raise exception 'RN-CRE-29 FALLIDO: un trabajo en créditos concedió una corrección gratis' using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then
      if sqlerrm not like '%RN-CRE-29%' then
        raise exception 'RN-CRE-29 FALLIDO: la corrección se rechazó por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
  set local role postgres;
end $$;

select 'las_tres_salidas.sql: RN-CRE-14 (quitar cosas y presupuesto), RN-CRE-07 y RN-CRE-29 cumplidos' as resultado;

rollback;
