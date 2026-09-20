-- ============================================================
-- Suite 60 · "Lo que ha pasado este mes" (PRD RN-REP-18, decisión 57)
-- ============================================================
--
-- Lo que vigila:
--
--   · **Que el relato sea el del restaurante y de su periodo.** Ni las
--     filas de otro restaurante, ni las de otro mes, ni los borradores que
--     el cliente nunca envió.
--   · **Que no lleve identidad del equipo** (P7, RN-REP-13). Esto no se
--     comprueba leyendo la función: se comprueba buscando en el JSON que
--     devuelve **el uuid de cada persona del equipo**, uno a uno. Si algún
--     día alguien añade un `'por', j.assigned_to` al `jsonb_build_object`,
--     aquí se cae.
--   · **Que el dinero dependa del parámetro** (RN-REP-16) y no de la buena
--     voluntad de quien llama.
--   · **Que un pago revertido no cuente** (RN-FIN-04): el apunte contrario
--     existe justamente para que no cuente.
--   · **Que la función sea interna** (CLAUDE.md): reservada a
--     `service_role`, cerrada a `anon` y a `authenticated`.
--
-- Prefijo de esta suite: d0500000-.

begin;

set local role postgres;

-- ------------------------------------------------------------
-- El decorado
-- ------------------------------------------------------------
insert into auth.users (id, email, role, aud) values
  ('d0500000-0000-0000-0000-000000000001', 'duena60@cuotly.test', 'authenticated', 'authenticated'),
  ('d0500000-0000-0000-0000-000000000002', 'trabaja60@cuotly.test', 'authenticated', 'authenticated'),
  ('d0500000-0000-0000-0000-000000000003', 'cliente60@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d0500000-0000-0000-0000-000000000001', 'duena60@cuotly.test', 'Dueña 60'),
  ('d0500000-0000-0000-0000-000000000002', 'trabaja60@cuotly.test', 'Trabajadora 60'),
  ('d0500000-0000-0000-0000-000000000003', 'cliente60@cuotly.test', 'Cliente 60')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('d0510000-0000-0000-0000-000000000001', 'Espacio 60', 'espacio-60', 'Europe/Madrid',
   'd0500000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d0510000-0000-0000-0000-000000000001', 'd0500000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d0510000-0000-0000-0000-000000000001', 'd0500000-0000-0000-0000-000000000002', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('d0530000-0000-0000-0000-000000000001', 'd0510000-0000-0000-0000-000000000001', 'Grupo 60');

-- Dos restaurantes: el del informe y el vecino. El vecino existe solo para
-- que "solo lo suyo" no sea una frase que nadie comprueba.
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('d0540000-0000-0000-0000-000000000001', 'd0510000-0000-0000-0000-000000000001',
   'd0530000-0000-0000-0000-000000000001', 'EST-60-1', 'Casa del Mes', 'active'),
  ('d0540000-0000-0000-0000-000000000002', 'd0510000-0000-0000-0000-000000000001',
   'd0530000-0000-0000-0000-000000000001', 'EST-60-2', 'El Vecino', 'active');

-- ------------------------------------------------------------
-- Lo que pasó (y lo que no debe salir)
-- ------------------------------------------------------------
--
-- El periodo de la prueba es **agosto de 2026**. Todo lo de julio y lo de
-- septiembre está puesto a propósito para que el corte se note.
insert into public.requests
  (id, space_id, establishment_id, code, state, description, created_by,
   validated_category, created_at, accepted_at, rejected_at) values
  -- Dentro: recibida el 3 y aceptada el 4.
  ('d0560000-0000-0000-0000-000000000001', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'SOL-60-1', 'accepted', 'Cambiar la carta',
   'd0500000-0000-0000-0000-000000000003', 'small',
   '2026-08-03T09:00:00Z', '2026-08-04T10:00:00Z', null),
  -- Dentro: recibida el 6 y rechazada el 7.
  ('d0560000-0000-0000-0000-000000000002', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'SOL-60-2', 'rejected', 'Cambiar el dominio',
   'd0500000-0000-0000-0000-000000000003', 'large',
   '2026-08-06T09:00:00Z', null, '2026-08-07T09:00:00Z'),
  -- FUERA: un borrador que el restaurante nunca envió. Contarlo sería
  -- contarle algo que no hizo.
  ('d0560000-0000-0000-0000-000000000003', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'SOL-60-3', 'draft', 'A medio escribir',
   'd0500000-0000-0000-0000-000000000003', null, '2026-08-08T09:00:00Z', null, null),
  -- FUERA: es del vecino.
  ('d0560000-0000-0000-0000-000000000004', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000002', 'SOL-60-4', 'received', 'Del vecino',
   'd0500000-0000-0000-0000-000000000003', 'small', '2026-08-09T09:00:00Z', null, null),
  -- FUERA: es de julio.
  ('d0560000-0000-0000-0000-000000000005', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'SOL-60-5', 'received', 'Del mes pasado',
   'd0500000-0000-0000-0000-000000000003', 'small', '2026-07-30T09:00:00Z', null, null);

insert into public.jobs
  (id, space_id, establishment_id, request_id, code, state, category,
   assigned_to, created_at, published_at, completed_at) values
  ('d0570000-0000-0000-0000-000000000001', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'd0560000-0000-0000-0000-000000000001',
   'TRB-60-1', 'completed', 'small',
   -- Asignado a una persona del equipo **a propósito**: el relato tiene que
   -- contar el cambio y NO contar a quién se le asignó.
   'd0500000-0000-0000-0000-000000000002',
   '2026-08-04T10:30:00Z', '2026-08-10T11:00:00Z', '2026-08-11T11:00:00Z');

insert into public.corrections
  (space_id, establishment_id, job_id, request_id, kind, description, requested_by, requested_at) values
  ('d0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'd0570000-0000-0000-0000-000000000001', 'd0560000-0000-0000-0000-000000000001',
   'client_request', 'Faltaba un plato', 'd0500000-0000-0000-0000-000000000003',
   '2026-08-12T09:00:00Z'),
  -- FUERA: un error del equipo se corrige sin que al restaurante le cueste
  -- nada (RN-COR-07), y ponerlo en su relato sería contarle nuestra cocina.
  ('d0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'd0570000-0000-0000-0000-000000000001', 'd0560000-0000-0000-0000-000000000001',
   'team_error', 'Se nos coló una errata', 'd0500000-0000-0000-0000-000000000002',
   '2026-08-13T09:00:00Z');

insert into public.files
  (id, space_id, group_id, establishment_id, category, visibility, name, created_by, created_at) values
  ('d0580000-0000-0000-0000-000000000001', 'd0510000-0000-0000-0000-000000000001',
   'd0530000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'photos', 'shared_with_client', 'carta-agosto.pdf',
   'd0500000-0000-0000-0000-000000000002', '2026-08-14T09:00:00Z'),
  -- FUERA: un archivo interno es del equipo. El cliente no lo ve ni debe
  -- saber que existe (RN-ARC-04).
  ('d0580000-0000-0000-0000-000000000002', 'd0510000-0000-0000-0000-000000000001',
   'd0530000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'documents', 'internal', 'notas-internas.txt',
   'd0500000-0000-0000-0000-000000000002', '2026-08-15T09:00:00Z');

insert into public.charges
  (id, space_id, establishment_id, concept, period_start, period_end,
   base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_at, issued_by) values
  ('d0590000-0000-0000-0000-000000000001', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'Cuota de agosto',
   '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z',
   39900, 21, 8379, 48279, '2026-08-31T23:59:59Z', '2026-08-01T08:00:00Z',
   'd0500000-0000-0000-0000-000000000001');

insert into public.payments
  (space_id, establishment_id, charge_id, amount_cents, method, paid_at,
   recorded_by, recorded_role, reversed_at) values
  ('d0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'd0590000-0000-0000-0000-000000000001', 48279, 'transfer', '2026-08-20T10:00:00Z',
   'd0500000-0000-0000-0000-000000000001', 'owner', null),
  -- FUERA: revertido. El apunte contrario existe para que no cuente
  -- (RN-FIN-04); contarlo diría que el restaurante pagó dos veces.
  ('d0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'd0590000-0000-0000-0000-000000000001', 1000, 'bizum', '2026-08-21T10:00:00Z',
   'd0500000-0000-0000-0000-000000000001', 'owner', '2026-08-22T10:00:00Z');

-- ------------------------------------------------------------
-- RN-REP-18 · el relato es el del restaurante y el del mes
-- ------------------------------------------------------------
do $$
declare
  v_sin_dinero jsonb;
  v_con_dinero jsonb;
  v_clases text[];
begin
  v_sin_dinero := public.report_month_activity(
    'd0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
    '2026-08-01', '2026-08-31', false);
  v_con_dinero := public.report_month_activity(
    'd0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
    '2026-08-01', '2026-08-31', true);

  select array_agg(e ->> 'kind' order by e ->> 'at')
  into v_clases
  from jsonb_array_elements(v_sin_dinero -> 'entries') as e;

  -- Ocho entradas, en este orden y no en otro: la fecha es la columna
  -- vertebral del relato.
  if v_clases <> array[
       'request_received', 'request_accepted', 'request_received', 'request_rejected',
       'job_published', 'job_completed', 'correction_requested', 'file_shared'] then
    raise exception 'RN-REP-18 FALLA: el relato del mes no es el que pasó, o no está ordenado: %', v_clases;
  end if;

  -- Lo que NO está, dicho uno a uno para que el fallo nombre al culpable.
  if v_sin_dinero::text like '%SOL-60-3%' then
    raise exception 'RN-REP-18 FALLA: un borrador que el cliente no envió sale en su relato';
  end if;
  if v_sin_dinero::text like '%SOL-60-4%' then
    raise exception 'RN-REP-18 FALLA: se le cuenta a un restaurante lo que pasó en otro';
  end if;
  if v_sin_dinero::text like '%SOL-60-5%' then
    raise exception 'RN-REP-18 FALLA: entra una solicitud de otro mes';
  end if;
  if v_sin_dinero::text like '%notas-internas%' then
    raise exception 'RN-ARC-04 FALLA: un archivo interno del equipo sale en el informe del cliente';
  end if;
  if v_sin_dinero::text like '%errata%' then
    raise exception 'RN-COR-07 FALLA: una corrección por error del equipo sale en el relato del cliente';
  end if;

  -- El sujeto es lo que el restaurante reconoce: el código de su cambio y
  -- el nombre de su archivo. No un uuid.
  if not (v_sin_dinero::text like '%SOL-60-1%' and v_sin_dinero::text like '%TRB-60-1%'
          and v_sin_dinero::text like '%carta-agosto.pdf%') then
    raise exception 'RN-REP-18 FALLA: una entrada no dice de qué habla';
  end if;

  -- RN-REP-16 · el dinero depende del parámetro, no de la buena voluntad.
  if v_sin_dinero::text like '%Cuota de agosto%' then
    raise exception 'RN-REP-16 FALLA: un informe SIN Finanzas enseña cobros en el relato del mes';
  end if;
  if not (v_con_dinero::text like '%charge_issued%' and v_con_dinero::text like '%payment_recorded%') then
    raise exception 'RN-REP-18 FALLA: un informe CON Finanzas no cuenta el cobro ni el pago';
  end if;

  -- RN-FIN-04 · un pago revertido no pasó. El segundo pago es el de 1000,
  -- y si contara habría DOS `payment_recorded`.
  if (select count(*) from jsonb_array_elements(v_con_dinero -> 'entries') as e
      where e ->> 'kind' = 'payment_recorded') <> 1 then
    raise exception 'RN-FIN-04 FALLA: un pago revertido cuenta en el relato del mes';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-REP-13 y P7 · ni una identidad del equipo, buscada uuid a uuid
-- ------------------------------------------------------------
--
-- Esto es lo que de verdad sostiene la regla. Una lista escrita a mano de
-- "columnas que no se seleccionan" se escapa; buscar **el uuid de cada
-- persona** en el texto del JSON, no.
do $$
declare
  v_json text;
  v_persona record;
begin
  v_json := public.report_month_activity(
    'd0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
    '2026-08-01', '2026-08-31', true)::text;

  for v_persona in
    select p.id, p.full_name
    from public.profiles p
    where p.id in (
      'd0500000-0000-0000-0000-000000000001',
      'd0500000-0000-0000-0000-000000000002',
      'd0500000-0000-0000-0000-000000000003'
    )
  loop
    if v_json like ('%' || v_persona.id::text || '%') then
      raise exception 'RN-REP-13 FALLA: el relato del mes lleva el uuid de % dentro', v_persona.full_name;
    end if;
    if v_json like ('%' || v_persona.full_name || '%') then
      raise exception 'RN-REP-13 FALLA: el relato del mes lleva el nombre de % dentro', v_persona.full_name;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- RN-REP-18 · un consolidado del espacio sí ve los dos restaurantes
-- ------------------------------------------------------------
--
-- Un informe sin restaurante es del ESPACIO y no lo recibe ningún cliente
-- (decisión 30): ahí sí entra todo lo del espacio. Si no se comprobara,
-- el `p_establishment_id is null` podría estar filtrando a cero y nadie se
-- enteraría.
do $$
declare
  v_todo jsonb;
begin
  v_todo := public.report_month_activity(
    'd0510000-0000-0000-0000-000000000001', null, '2026-08-01', '2026-08-31', false);

  if not (v_todo::text like '%SOL-60-1%' and v_todo::text like '%SOL-60-4%') then
    raise exception 'RN-REP-18 FALLA: un consolidado del espacio no ve los dos restaurantes';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- CLAUDE.md · la función es interna
-- ------------------------------------------------------------
--
-- Un proyecto de Supabase concede EXECUTE a `anon` y `authenticated` sobre
-- toda función nueva, así que esto no es una formalidad: sin el `revoke`
-- completo, cualquiera con sesión leería por RPC el mes entero de
-- cualquier restaurante cuyo uuid conociera.
do $$
begin
  if has_function_privilege('authenticated',
       'public.report_month_activity(uuid, uuid, date, date, boolean)', 'execute') then
    raise exception 'CLAUDE.md FALLA: report_month_activity está abierta por RPC a authenticated';
  end if;
  if has_function_privilege('anon',
       'public.report_month_activity(uuid, uuid, date, date, boolean)', 'execute') then
    raise exception 'CLAUDE.md FALLA: report_month_activity está abierta por RPC a anon';
  end if;
  if not has_function_privilege('service_role',
       'public.report_month_activity(uuid, uuid, date, date, boolean)', 'execute') then
    raise exception 'La generación no puede llamar a report_month_activity: nadie la ejecutaría';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-REP-18 · la sección entra marcada y en los cinco niveles
-- ------------------------------------------------------------
do $$
declare
  v_nivel text;
begin
  foreach v_nivel in array array['basic', 'standard', 'standard_plus', 'advanced', 'complete'] loop
    if not public.report_level_allows(v_nivel, 'month_activity') then
      raise exception 'RN-REP-18 FALLA: el nivel % no admite el relato del mes', v_nivel;
    end if;
  end loop;

  -- En las tres familias, porque un informe de finanzas también cuenta un
  -- mes: lo que cambia es de qué va, no si lo cuenta.
  if not (public.report_section_default_included('operation', 'month_activity')
          and public.report_section_default_included('finance', 'month_activity')
          and public.report_section_default_included('digital', 'month_activity')) then
    raise exception 'RN-REP-18 FALLA: el relato del mes no entra marcado en alguna familia';
  end if;

  -- Y no pide criterio: es el libro, no una opinión. Si lo pidiera,
  -- bloquearía el envío automático de todos los informes (RN-REP-10).
  if public.report_section_requires_judgement('month_activity') then
    raise exception 'RN-REP-18 FALLA: el relato del mes pide criterio y frena el envío automático';
  end if;
end;
$$;

rollback;
