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

-- Tres solicitudes más, para los tres estados de la ficha (RN-REP-18): un
-- cambio en marcha, uno aceptado sin empezar y uno presupuestado aparte.
insert into public.requests
  (id, space_id, establishment_id, code, state, description, created_by,
   validated_category, validated_summary, created_at, accepted_at) values
  ('d0560000-0000-0000-0000-000000000006', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'SOL-60-6', 'in_progress',
   'Cambiar 20 EUR de pescado por 25 EUR', 'd0500000-0000-0000-0000-000000000003',
   'photo', 'Cambiar el precio del menu', '2026-08-15T09:00:00Z', '2026-08-16T09:00:00Z'),
  ('d0560000-0000-0000-0000-000000000007', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'SOL-60-7', 'accepted',
   'Fotos nuevas de la terraza', 'd0500000-0000-0000-0000-000000000003',
   'medium', 'Sustituir las fotos de la galeria', '2026-08-18T09:00:00Z', '2026-08-19T09:00:00Z'),
  ('d0560000-0000-0000-0000-000000000008', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'SOL-60-8', 'accepted',
   'Rehacer la home entera', 'd0500000-0000-0000-0000-000000000003',
   'large', 'Rediseno de la portada', '2026-08-24T09:00:00Z', '2026-08-25T09:00:00Z');

-- RN-QUO-02 · el presupuesto del cambio grande, que es lo que hace que NO
-- consuma bolsa (RN-CON-03) y que la línea diga "1 de 0".
insert into public.quotes
  (id, space_id, establishment_id, request_id, code, concept, outcome, category,
   state, base_cents, tax_rate_percent, tax_cents, total_cents, created_by) values
  ('d05b0000-0000-0000-0000-000000000001', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'd0560000-0000-0000-0000-000000000008',
   'PRE-60-1', 'Rediseno de la portada', 'job', 'large',
   'accepted', 100000, 21, 21000, 121000,
   'd0500000-0000-0000-0000-000000000001');

insert into public.jobs
  (id, space_id, establishment_id, request_id, code, state, category,
   assigned_to, quote_id, created_at, started_at, published_at, completed_at) values
  ('d0570000-0000-0000-0000-000000000001', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'd0560000-0000-0000-0000-000000000001',
   'TRB-60-1', 'completed', 'small',
   -- Asignado a una persona del equipo **a propósito**: el relato tiene que
   -- contar el cambio y NO contar a quién se le asignó.
   'd0500000-0000-0000-0000-000000000002', null,
   '2026-08-04T10:30:00Z', '2026-08-05T08:00:00Z', '2026-08-10T11:00:00Z', '2026-08-11T11:00:00Z'),
  -- EN PROCESO: empezado y sin terminar cuando se genera el informe.
  ('d0570000-0000-0000-0000-000000000002', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'd0560000-0000-0000-0000-000000000006',
   'TRB-60-2', 'in_progress', 'photo',
   'd0500000-0000-0000-0000-000000000002', null,
   '2026-08-16T09:30:00Z', '2026-08-17T08:00:00Z', null, null),
  -- PENDIENTE DE EMPEZAR: aceptado y sin arrancar.
  ('d0570000-0000-0000-0000-000000000003', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'd0560000-0000-0000-0000-000000000007',
   'TRB-60-3', 'assigned', 'medium',
   'd0500000-0000-0000-0000-000000000002', null,
   '2026-08-19T09:30:00Z', null, null, null),
  -- PRESUPUESTADO APARTE: no consume bolsa.
  ('d0570000-0000-0000-0000-000000000004', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'd0560000-0000-0000-0000-000000000008',
   'TRB-60-4', 'in_progress', 'large',
   'd0500000-0000-0000-0000-000000000002', 'd05b0000-0000-0000-0000-000000000001',
   '2026-08-25T09:30:00Z', '2026-08-26T08:00:00Z', null, null);

-- ------------------------------------------------------------
-- La bolsa del mes (RN-REP-20)
-- ------------------------------------------------------------
--
-- Plan con 5 pequeños, 6 fotografías, 1 mediano y **0 grandes**, que es el
-- reparto que hace interesante la prueba: el cambio grande del mes fue a
-- presupuesto, así que su línea tiene que decir "1 de 0".
insert into public.plans
  (id, space_id, name, price_cents, included_small, included_photo,
   included_medium, included_large, start_sla_hours, grants_priority, report_level) values
  ('d05c0000-0000-0000-0000-000000000001', 'd0510000-0000-0000-0000-000000000001',
   'Plan 60', 29900, 5, 6, 1, 0, 24, false, 'complete');

insert into public.subscriptions (id, space_id, establishment_id, kind, plan_id, status) values
  ('d05d0000-0000-0000-0000-000000000001', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'plan', 'd05c0000-0000-0000-0000-000000000001', 'active');

insert into public.consumption_cycles
  (id, space_id, establishment_id, subscription_id, cycle_start, cycle_end,
   included_small, included_photo, included_medium, included_large) values
  ('d05e0000-0000-0000-0000-000000000001', 'd0510000-0000-0000-0000-000000000001',
   'd0540000-0000-0000-0000-000000000001', 'd05d0000-0000-0000-0000-000000000001',
   '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', 5, 6, 1, 0);

-- Dos pequeños gastados y uno devuelto: "consumido" son los débitos MENOS
-- las devoluciones (RN-CON-08), no los débitos a secas.
insert into public.consumption_entries
  (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, created_at) values
  ('d0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'd05e0000-0000-0000-0000-000000000001', 'small', -1, 'debit', '2026-08-04T10:30:00Z'),
  ('d0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'd05e0000-0000-0000-0000-000000000001', 'small', -1, 'debit', '2026-08-06T10:30:00Z'),
  ('d0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'd05e0000-0000-0000-0000-000000000001', 'small', -1, 'debit', '2026-08-07T10:30:00Z'),
  ('d0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'd05e0000-0000-0000-0000-000000000001', 'small', 1, 'return', '2026-08-08T10:30:00Z'),
  ('d0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'd05e0000-0000-0000-0000-000000000001', 'photo', -1, 'debit', '2026-08-16T09:30:00Z'),
  ('d0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'd05e0000-0000-0000-0000-000000000001', 'medium', -1, 'debit', '2026-08-19T09:30:00Z'),
  -- De julio: no cuenta en el informe de agosto.
  ('d0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
   'd05e0000-0000-0000-0000-000000000001', 'small', -1, 'debit', '2026-07-20T10:30:00Z');

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

  -- Dos entradas sueltas: la corrección y el archivo. **Las seis clases
  -- de cambio ya no están aquí** —recibida, aceptada, rechazada,
  -- publicado, entregado, cancelado—: un cambio sale una vez, en su
  -- ficha, o el relato de un mes movido sería ilegible (RN-REP-18,
  -- decisión 58).
  if v_clases <> array['correction_requested', 'file_shared'] then
    raise exception 'RN-REP-18 FALLA: el relato del mes no es el que pasó, o no está ordenado: %', v_clases;
  end if;
  if v_sin_dinero -> 'entries' @> '[{"kind": "job_published"}]'::jsonb
     or v_sin_dinero -> 'entries' @> '[{"kind": "request_accepted"}]'::jsonb
     or v_sin_dinero -> 'entries' @> '[{"kind": "request_rejected"}]'::jsonb then
    raise exception 'RN-REP-18 FALLA: un cambio sale como línea suelta además de en su ficha';
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
  if not (v_sin_dinero::text like '%SOL-60-1%' and v_sin_dinero::text like '%carta-agosto.pdf%') then
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
-- RN-REP-18 · la ficha de cada cambio (decisión 58)
-- ------------------------------------------------------------
--
-- Los tres estados que Bosco pidió que se distinguieran —entregado, en
-- proceso, pendiente de empezar— más el presupuestado aparte. Lo que se
-- comprueba no es la frase, que la escribe la pantalla, sino que los datos
-- que la deciden **lleguen y sean los correctos**.
do $$
declare
  v jsonb;
  v_cambio jsonb;
begin
  v := public.report_month_activity(
    'd0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
    '2026-08-01', '2026-08-31', false);

  -- Cinco fichas: los cuatro que llegaron a ser trabajo **y el rechazado**.
  -- Un rechazo también es algo que pasó con un cambio que el restaurante
  -- pidió, y sin ficha desaparecería del relato.
  if jsonb_array_length(v -> 'changes') <> 5 then
    raise exception 'RN-REP-18 FALLA: el mes tuvo cinco cambios y la ficha trae %',
      jsonb_array_length(v -> 'changes');
  end if;

  -- El rechazado: sin trabajo, sin fechas de ejecución, y con su fecha de
  -- rechazo puesta. Es el caso que se escapaba cuando la ficha se montaba
  -- sobre `jobs` en vez de sobre `requests`.
  select e into v_cambio
  from jsonb_array_elements(v -> 'changes') as e where e ->> 'code' = 'SOL-60-2';
  if v_cambio is null then
    raise exception 'RN-REP-18 FALLA: una solicitud rechazada desaparece del relato del mes';
  end if;
  if v_cambio ->> 'rejectedAt' is null or v_cambio ->> 'startedAt' is not null then
    raise exception 'RN-REP-18 FALLA: la ficha de un rechazo no dice que lo es';
  end if;

  -- 1 · El entregado: título, descripción, categoría y las DOS fechas.
  select e into v_cambio
  from jsonb_array_elements(v -> 'changes') as e where e ->> 'code' = 'SOL-60-1';

  if v_cambio ->> 'description' is null or v_cambio ->> 'category' <> 'small' then
    raise exception 'RN-REP-18 FALLA: la ficha de un cambio no dice qué se cambió ni de qué tipo era';
  end if;
  if v_cambio ->> 'startedAt' is null or v_cambio ->> 'completedAt' is null then
    raise exception 'RN-REP-18 FALLA: un cambio entregado no trae sus dos fechas';
  end if;
  if (v_cambio ->> 'budgeted')::boolean then
    raise exception 'RN-REP-20 FALLA: un cambio de la bolsa figura como presupuestado';
  end if;

  -- 2 · EN PROCESO · empezado y sin fecha de fin. Que no haya fecha de fin
  -- es el dato: la pantalla lo dice como "En proceso" y no como un hueco.
  select e into v_cambio
  from jsonb_array_elements(v -> 'changes') as e where e ->> 'code' = 'SOL-60-6';

  if v_cambio ->> 'startedAt' is null then
    raise exception 'RN-REP-18 FALLA: un cambio en marcha no dice cuándo empezó';
  end if;
  if v_cambio ->> 'completedAt' is not null then
    raise exception 'RN-REP-18 FALLA: un cambio en marcha trae fecha de entrega';
  end if;

  -- 3 · PENDIENTE DE EMPEZAR · aceptado y sin arrancar. Las dos fechas
  -- vacías, y la de aceptación puesta, que es la que ordena el relato.
  select e into v_cambio
  from jsonb_array_elements(v -> 'changes') as e where e ->> 'code' = 'SOL-60-7';

  if v_cambio ->> 'startedAt' is not null or v_cambio ->> 'completedAt' is not null then
    raise exception 'RN-REP-18 FALLA: un cambio sin empezar trae fechas que no existen';
  end if;
  if v_cambio ->> 'acceptedAt' is null then
    raise exception 'RN-REP-18 FALLA: un cambio sin empezar no dice ni cuándo se aceptó';
  end if;

  -- 4 · PRESUPUESTADO APARTE · lo dice, porque no gastó bolsa.
  select e into v_cambio
  from jsonb_array_elements(v -> 'changes') as e where e ->> 'code' = 'SOL-60-8';

  if not (v_cambio ->> 'budgeted')::boolean then
    raise exception 'RN-CON-03 FALLA: un cambio presupuestado aparte no lo dice, y parece que gastó bolsa';
  end if;

  -- RN-COR-07 · las correcciones que pidió el restaurante van en la ficha
  -- de su cambio. La de `team_error` no: se corrige sin que le cueste nada.
  select e into v_cambio
  from jsonb_array_elements(v -> 'changes') as e where e ->> 'code' = 'SOL-60-1';
  if (v_cambio ->> 'corrections')::integer <> 1 then
    raise exception 'RN-COR-07 FALLA: la ficha cuenta % correcciones y solo una fue del cliente',
      v_cambio ->> 'corrections';
  end if;

  -- El relato va por fecha: el orden es el de aceptación.
  if (select array_agg(e ->> 'code' order by ord)
      from jsonb_array_elements(v -> 'changes') with ordinality as t(e, ord))
     <> array['SOL-60-1', 'SOL-60-2', 'SOL-60-6', 'SOL-60-7', 'SOL-60-8'] then
    raise exception 'RN-REP-18 FALLA: las fichas no salen en orden de fecha';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-REP-20 · la bolsa del mes, categoría a categoría
-- ------------------------------------------------------------
do $$
declare
  v jsonb;
  v_cat jsonb;
begin
  v := public.report_change_allowance(
    'd0510000-0000-0000-0000-000000000001', 'd0540000-0000-0000-0000-000000000001',
    '2026-08-01', '2026-08-31');

  -- Las CUATRO siempre, y en su orden. La de grandes a 0 incluidos también:
  -- esa línea dice lo que el plan no le da (RN-COM-02).
  if (select array_agg(c ->> 'category' order by ord)
      from jsonb_array_elements(v -> 'categories') with ordinality as t(c, ord))
     <> array['small', 'photo', 'medium', 'large'] then
    raise exception 'RN-REP-20 FALLA: no salen las cuatro categorías, o no en su orden';
  end if;

  -- Pequeños · tres débitos menos una devolución = 2, de 5 incluidos. Si
  -- alguien contara los débitos a secas saldría 3, y un cambio devuelto no
  -- se gastó (RN-CON-08).
  select c into v_cat from jsonb_array_elements(v -> 'categories') as c where c ->> 'category' = 'small';
  if (v_cat ->> 'consumed')::integer <> 2 or (v_cat ->> 'included')::integer <> 5 then
    raise exception 'RN-REP-20 FALLA: los pequeños son % de %, y tenían que ser 2 de 5',
      v_cat ->> 'consumed', v_cat ->> 'included';
  end if;

  -- Fotografías · 1 de 6. Medianos · 1 de 1.
  select c into v_cat from jsonb_array_elements(v -> 'categories') as c where c ->> 'category' = 'photo';
  if (v_cat ->> 'consumed')::integer <> 1 or (v_cat ->> 'included')::integer <> 6 then
    raise exception 'RN-REP-20 FALLA: las fotografías no son 1 de 6';
  end if;
  select c into v_cat from jsonb_array_elements(v -> 'categories') as c where c ->> 'category' = 'medium';
  if (v_cat ->> 'consumed')::integer <> 1 or (v_cat ->> 'included')::integer <> 1 then
    raise exception 'RN-REP-20 FALLA: los medianos no son 1 de 1';
  end if;

  -- **Grandes · 1 de 0, con 1 presupuestado aparte.** Este es el caso que
  -- justifica la regla: el cambio grande NO dejó apunte en el libro
  -- (RN-CON-03), así que `consumed` es 0 y el 1 sale de `budgeted`. Si
  -- alguien los juntara, el restaurante leería que se ha pasado de su plan
  -- cuando lo que hizo fue comprar uno aparte.
  select c into v_cat from jsonb_array_elements(v -> 'categories') as c where c ->> 'category' = 'large';
  if (v_cat ->> 'consumed')::integer <> 0 then
    raise exception 'RN-CON-03 FALLA: un cambio presupuestado aparte consumió bolsa';
  end if;
  if (v_cat ->> 'included')::integer <> 0 then
    raise exception 'RN-REP-20 FALLA: el plan no incluye grandes y la línea dice otra cosa';
  end if;
  if (v_cat ->> 'budgeted')::integer <> 1 then
    raise exception 'RN-REP-20 FALLA: el cambio presupuestado aparte no se cuenta en ninguna parte';
  end if;

  -- Un consolidado del espacio no tiene bolsa: sumar las de cinco
  -- restaurantes no significa nada, así que `included` va a null y NO a 0.
  v := public.report_change_allowance(
    'd0510000-0000-0000-0000-000000000001', null, '2026-08-01', '2026-08-31');
  select c into v_cat from jsonb_array_elements(v -> 'categories') as c where c ->> 'category' = 'small';
  if v_cat ->> 'included' is not null then
    raise exception 'RN-REP-20 FALLA: un consolidado del espacio se inventa una bolsa';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- CLAUDE.md · la bolsa también es interna
-- ------------------------------------------------------------
do $$
begin
  if has_function_privilege('authenticated',
       'public.report_change_allowance(uuid, uuid, date, date)', 'execute')
     or has_function_privilege('anon',
       'public.report_change_allowance(uuid, uuid, date, date)', 'execute') then
    raise exception 'CLAUDE.md FALLA: report_change_allowance está abierta por RPC';
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
