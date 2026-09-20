-- ============================================================
-- Migración 112 · "Lo que ha pasado este mes" (RN-REP-18, decisión 57)
-- ============================================================
--
-- Bosco, 20/09/2026, mirando la maqueta del PDF: *"está perfecto pero hay
-- que añadir cosas porque el informe tiene que ser un resumen de todo lo
-- que ha pasado en el mes"*.
--
-- Hasta hoy el informe eran **indicadores**: cuántos cambios, cuánto se
-- tardó, cuántas visitas. Eso responde "cómo fue el mes" pero no responde
-- **"qué pasó"**, que es lo que un restaurante quiere leer: pedí esto, me
-- entregasteis aquello, el día 12 se publicó el menú. Esta migración añade
-- esa sección.
--
-- **Cuatro decisiones que hay que respetar al tocar esto:**
--
--   1. **Entra en los CINCO niveles**, Básico incluido. Es justo lo que un
--      Básico —que no incluye ningún cambio (RN-COM-01)— sí puede leer, y
--      la razón por la que su informe no es una hoja en blanco.
--   2. **Ninguna entrada lleva identidad del equipo** (P7, RN-REP-13).
--      Dice qué pasó y cuándo, nunca quién lo hizo. Por eso la función de
--      abajo no selecciona **ni una sola** columna con clave ajena a
--      `profiles`: ni `created_by`, ni `assigned_to`, ni `published_by`,
--      ni `recorded_by`. El barrido de
--      `hito7_mensajes_archivos_finanzas.sql` lo comprueba por su cuenta.
--   3. **Los cobros solo si el informe lleva Finanzas.** Si no, un informe
--      de cualquier nivel estaría enseñando dinero a quien no tiene "Pagos
--      y facturas" (RN-REP-16, RN-EST-15) — y precisamente el informe con
--      Finanzas es el que ya solo ve quien lo tiene. De ahí el parámetro:
--      quien llama pasa lo que la sección de Finanzas diga de ESE informe,
--      no lo que quiera.
--   4. **Se lee del libro, no se redacta.** Salen filas con su clave y su
--      fecha; la frase en español la pone la pantalla o el PDF desde
--      `src/i18n/es.ts`. Cuotly no escribe el relato: lo ordena.
--
-- **Lo que NO entra y podría parecer que sí:** las **incidencias** de
-- `incidents`. Son del espacio a Cuotly (§131, RN-SOP), no del
-- restaurante: la tabla ni siquiera tiene `establishment_id`. Meterlas
-- aquí sería contarle a un restaurante las incidencias de otro.

-- ------------------------------------------------------------
-- 1 · La sección, en el catálogo
-- ------------------------------------------------------------
--
-- Va **la segunda**, justo detrás del resumen ejecutivo: el orden de este
-- array es el que `create_report_draft()` usa como `position`, y lo que ha
-- pasado el mes es lo que se lee antes de las cifras, no después.
create or replace function public.report_sections_catalogue()
returns text[]
language sql
immutable
as $$
  select array[
    'executive_summary', 'month_activity', 'operation', 'finance',
    'digital', 'opportunities', 'annexes'
  ];
$$;

revoke all on function public.report_sections_catalogue() from public, anon;
grant execute on function public.report_sections_catalogue() to authenticated;

-- ------------------------------------------------------------
-- 2 · Qué nivel la admite: todos
-- ------------------------------------------------------------
--
-- La migración 111 dejó escrito que faltaba: *"«Lo que ha pasado este mes»
-- no está aquí porque todavía no existe como sección; cuando se construya,
-- se añade a las cinco ramas"*. Se añade con rango >= 0, que es lo mismo
-- que decir "en los cinco".
create or replace function public.report_level_allows(p_level text, p_section text)
returns boolean
language sql
immutable
as $$
  select case p_section
    -- El resumen ejecutivo y la operación, desde el primer nivel: es lo
    -- mínimo que cuenta el mes.
    when 'executive_summary' then public.report_level_rank(p_level) >= 0
    -- RN-REP-18 · en los cinco niveles. Un nivel desconocido sigue dando
    -- -1 y sigue sin alcanzar nada.
    when 'month_activity' then public.report_level_rank(p_level) >= 0
    when 'operation' then public.report_level_rank(p_level) >= 0
    when 'digital' then public.report_level_rank(p_level) >= 2
    when 'opportunities' then public.report_level_rank(p_level) >= 3
    when 'annexes' then public.report_level_rank(p_level) >= 3
    when 'finance' then public.report_level_rank(p_level) >= 3
    else false
  end;
$$;

comment on function public.report_level_allows(text, text) is
  'RN-REP-15 · si un nivel de informe admite una sección. Una sección
   desconocida es false, no true: en la duda no se manda de más.
   RN-REP-18 · `month_activity` entra en los cinco niveles.';

revoke all on function public.report_level_allows(text, text) from public, anon;
grant execute on function public.report_level_allows(text, text) to authenticated;

-- ------------------------------------------------------------
-- 3 · Entra marcada por omisión, en las tres familias
-- ------------------------------------------------------------
--
-- El resto de la tabla se copia tal cual de la migración 85: lo único que
-- cambia son las tres filas nuevas. Entra marcada porque un informe sin
-- ella no cuenta el mes, que es lo que Bosco pidió.
create or replace function public.report_section_default_included(
  p_category text,
  p_section text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_category = 'operation' and p_section = 'executive_summary' then true
    when p_category = 'operation' and p_section = 'month_activity' then true
    when p_category = 'operation' and p_section = 'operation' then true
    when p_category = 'operation' and p_section = 'finance' then false
    when p_category = 'operation' and p_section = 'digital' then false
    when p_category = 'operation' and p_section = 'opportunities' then false
    when p_category = 'operation' and p_section = 'annexes' then true
    when p_category = 'finance' and p_section = 'executive_summary' then true
    when p_category = 'finance' and p_section = 'month_activity' then true
    when p_category = 'finance' and p_section = 'operation' then false
    when p_category = 'finance' and p_section = 'finance' then true
    when p_category = 'finance' and p_section = 'digital' then false
    when p_category = 'finance' and p_section = 'opportunities' then false
    when p_category = 'finance' and p_section = 'annexes' then true
    when p_category = 'digital' and p_section = 'executive_summary' then true
    when p_category = 'digital' and p_section = 'month_activity' then true
    when p_category = 'digital' and p_section = 'operation' then false
    when p_category = 'digital' and p_section = 'finance' then false
    when p_category = 'digital' and p_section = 'digital' then true
    when p_category = 'digital' and p_section = 'opportunities' then false
    when p_category = 'digital' and p_section = 'annexes' then true
    else null
  end;
$$;

revoke all on function public.report_section_default_included(text, text) from public, anon;
grant execute on function public.report_section_default_included(text, text) to authenticated;

-- ------------------------------------------------------------
-- 4 · Los informes que ya existen y todavía se pueden editar
-- ------------------------------------------------------------
--
-- Un informe preparado ayer tiene seis filas en `report_sections` y el
-- catálogo tiene siete. `set_report_sections()` actualiza por clave, así
-- que la fila que falta no se crearía nunca y la sección quedaría
-- inalcanzable en ese informe **para siempre**.
--
-- Se rellena solo lo que todavía se puede editar. Un informe **enviado o
-- archivado no se toca**: lo que se le envió al restaurante es lo que se
-- le envió (RN-REP-12, P4), y añadirle una sección hoy reescribiría hacia
-- atrás lo que ya leyó.
--
-- Entra **desmarcada**: en un borrador que alguien ya revisó, marcarla por
-- su cuenta cambiaría el informe sin que nadie lo pidiera. Quien lo esté
-- preparando la ve y decide.
insert into public.report_sections (space_id, report_id, section_key, position, included, updated_by)
select r.space_id, r.id, 'month_activity',
       coalesce((select max(rs.position) from public.report_sections rs where rs.report_id = r.id), 0) + 1,
       false,
       r.updated_by
from public.reports r
where r.status not in ('sent', 'archived')
  and not exists (
    select 1 from public.report_sections rs
    where rs.report_id = r.id and rs.section_key = 'month_activity'
  );

-- ------------------------------------------------------------
-- 5 · El relato del mes
-- ------------------------------------------------------------
--
-- Igual que `report_operation_dataset` y `report_finance_dataset`: entrega
-- **filas**, no frases, y está reservada a `service_role`. La ordenación
-- final y el recorte son de quien la llama.
--
-- `p_include_finance` no tiene valor por omisión a propósito. Un `default
-- false` invitaría a llamarla sin pensar y a que los cobros no salieran
-- nunca; un `default true` sería peor. Quien llama tiene que decir qué
-- dice la sección de Finanzas de ese informe.
create or replace function public.report_month_activity(
  p_space_id uuid,
  p_establishment_id uuid,
  p_from date,
  p_to date,
  p_include_finance boolean
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select (p_from::timestamptz) as from_at, ((p_to + 1)::timestamptz) as to_at
  ),
  entries as (
    -- Solicitudes. `draft` no cuenta: es un borrador que el restaurante
    -- todavía no ha enviado, y contarlo sería contarle algo que no hizo.
    select r.created_at as at, 'request_received' as kind, r.code as subject,
           r.validated_category as category
    from public.requests r, bounds b
    where r.space_id = p_space_id
      and (p_establishment_id is null or r.establishment_id = p_establishment_id)
      and r.state <> 'draft'
      and r.created_at >= b.from_at and r.created_at < b.to_at

    union all
    select r.accepted_at, 'request_accepted', r.code, r.validated_category
    from public.requests r, bounds b
    where r.space_id = p_space_id
      and (p_establishment_id is null or r.establishment_id = p_establishment_id)
      and r.accepted_at >= b.from_at and r.accepted_at < b.to_at

    union all
    select r.rejected_at, 'request_rejected', r.code, r.validated_category
    from public.requests r, bounds b
    where r.space_id = p_space_id
      and (p_establishment_id is null or r.establishment_id = p_establishment_id)
      and r.rejected_at >= b.from_at and r.rejected_at < b.to_at

    -- Cambios. Publicado y entregado son dos momentos distintos y los dos
    -- importan: el restaurante ve el cambio en su web al publicarse, y el
    -- trabajo se cierra al completarse.
    union all
    select j.published_at, 'job_published', j.code, j.category
    from public.jobs j, bounds b
    where j.space_id = p_space_id
      and (p_establishment_id is null or j.establishment_id = p_establishment_id)
      and j.published_at >= b.from_at and j.published_at < b.to_at

    union all
    select j.completed_at, 'job_completed', j.code, j.category
    from public.jobs j, bounds b
    where j.space_id = p_space_id
      and (p_establishment_id is null or j.establishment_id = p_establishment_id)
      and j.completed_at >= b.from_at and j.completed_at < b.to_at

    union all
    select j.cancelled_at, 'job_cancelled', j.code, j.category
    from public.jobs j, bounds b
    where j.space_id = p_space_id
      and (p_establishment_id is null or j.establishment_id = p_establishment_id)
      and j.cancelled_at >= b.from_at and j.cancelled_at < b.to_at

    -- Correcciones que pidió el restaurante. Las de `team_error` no salen:
    -- un error del equipo se corrige sin que al restaurante le cueste nada
    -- (RN-COR-07), y ponerlo en su relato sería contarle nuestra cocina.
    union all
    select c.requested_at, 'correction_requested', j.code, j.category
    from public.corrections c
    join public.jobs j on j.id = c.job_id, bounds b
    where c.space_id = p_space_id
      and (p_establishment_id is null or c.establishment_id = p_establishment_id)
      and c.kind = 'client_request'
      and c.requested_at >= b.from_at and c.requested_at < b.to_at

    -- Menús publicados. El sujeto es el DÍA del menú, no su identificador:
    -- "el menú del 12" es lo que el restaurante reconoce.
    union all
    select mp.published_at, 'menu_published', to_char(m.target_date, 'YYYY-MM-DD'), null
    from public.menu_publications mp
    join public.menus m on m.id = mp.menu_id, bounds b
    where mp.space_id = p_space_id
      and (p_establishment_id is null or mp.establishment_id = p_establishment_id)
      and mp.published_at >= b.from_at and mp.published_at < b.to_at

    -- Archivos que el equipo compartió CON el restaurante. Los internos no
    -- (RN-ARC-04): son del equipo y el cliente no los ve ni debe saber que
    -- existen.
    union all
    select f.created_at, 'file_shared', f.name, f.category
    from public.files f, bounds b
    where f.space_id = p_space_id
      and (p_establishment_id is null or f.establishment_id = p_establishment_id)
      and f.visibility = 'shared_with_client'
      and f.archived_at is null
      and f.created_at >= b.from_at and f.created_at < b.to_at

    -- RN-REP-16 · el dinero, solo si el informe lleva Finanzas.
    union all
    select ch.issued_at, 'charge_issued', ch.concept, null
    from public.charges ch, bounds b
    where p_include_finance
      and ch.space_id = p_space_id
      and (p_establishment_id is null or ch.establishment_id = p_establishment_id)
      and ch.issued_at >= b.from_at and ch.issued_at < b.to_at

    union all
    select pm.paid_at, 'payment_recorded', ch.concept, null
    from public.payments pm
    join public.charges ch on ch.id = pm.charge_id, bounds b
    where p_include_finance
      and pm.space_id = p_space_id
      and (p_establishment_id is null or pm.establishment_id = p_establishment_id)
      -- Un cobro revertido no pasó (RN-FIN-04): el apunte contrario existe
      -- para eso, y contarlo en el relato diría que se pagó dos veces.
      and pm.reversed_at is null
      and pm.paid_at >= b.from_at and pm.paid_at < b.to_at
  )
  select jsonb_build_object(
    'entries',
    coalesce(
      (select jsonb_agg(jsonb_build_object(
         'at', e.at, 'kind', e.kind, 'subject', e.subject, 'category', e.category
       ) order by e.at, e.kind)
       from entries e
       where e.at is not null),
      '[]'::jsonb
    )
  );
$$;

comment on function public.report_month_activity(uuid, uuid, date, date, boolean) is
  'RN-REP-18 · lo que pasó en el periodo, fila a fila y ordenado por fecha.
   Sin identidad del equipo: ni una columna con clave ajena a profiles
   (P7, RN-REP-13). Los cobros solo con p_include_finance, que quien llama
   saca de la sección de Finanzas de ESE informe (RN-REP-16). La frase en
   español la escribe la pantalla desde es.ts: aquí solo hay claves.';

-- Interna, como las otras dos de generación: la llama el servidor con
-- `service_role`. CLAUDE.md · `from public, anon, authenticated`, porque
-- Supabase concede EXECUTE a los dos últimos sobre toda función nueva y
-- revocar solo a PUBLIC la dejaría abierta por RPC a cualquiera.
revoke all on function public.report_month_activity(uuid, uuid, date, date, boolean)
  from public, anon, authenticated;
