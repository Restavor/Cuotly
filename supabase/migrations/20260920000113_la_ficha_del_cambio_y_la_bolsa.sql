-- ============================================================
-- Migración 113 · La ficha de cada cambio y la bolsa del mes
--                 (RN-REP-18 ampliada, RN-REP-20, decisión 58)
-- ============================================================
--
-- Bosco, 20/09/2026, leyendo el primer PDF:
--
--   · *"donde cumplimiento del inicio 100 % prefiero que ahí pongas por
--     separado cuántos cambios pequeños ha consumido, cuántos medianos,
--     cuántos grandes y cuántos fotográficos"*;
--   · *"en lo que ha pasado este mes hay que detallar los cambios: 4 de
--     agosto, cambiar precio menú, y abajo pones en descripción cambiar
--     20 € de pescado por 25 €, y se pone la fecha de inicio y la fecha de
--     finalización y el tipo de cambio que ha consumido"*;
--   · *"si hay algún cambio que todavía está en proceso mientras se ha
--     generado el informe se pondría todo igual pero en vez de poner fecha
--     de finalización pondrías en proceso"*.
--
-- **Lo que esto cambia de fondo**, y está escrito en RN-REP-15: la
-- escalera de niveles deja de repartir *información* y pasa a repartir
-- *análisis*. Lo que el restaurante pidió, lo que se le entregó y lo que
-- gastó de su bolsa va en **los cinco niveles**; lo que sube de precio es
-- la lectura de cómo fue —plazos, comparación, digital, oportunidades—.
--
-- **Tres cosas que hay que respetar al tocar esto:**
--
--   1. **Un cambio sale UNA vez, en su ficha.** Antes cada cambio dejaba
--      cuatro entradas sueltas —recibida, aceptada, publicado, entregado—
--      y el relato de un mes movido era ilegible. Ahora todo lo que le
--      pasó a un cambio se cuenta dentro de su ficha.
--   2. **Ni un hueco ni una fecha inventada.** Un cambio en marcha dice
--      "en proceso" y uno aceptado sin empezar dice "pendiente de
--      empezar"; aquí eso son `started_at`/`completed_at` a null más el
--      estado, y la frase la escribe la pantalla (CLAUDE.md).
--   3. **"1 de 0" no es un error de cuentas.** Un cambio presupuestado
--      aparte NO consume bolsa (RN-CON-03), así que el consumido y el
--      incluido salen de sitios distintos y los presupuestados se cuentan
--      por su lado. Juntarlos sería decirle al restaurante que se ha
--      pasado de su plan cuando lo que hizo fue comprar uno aparte.
--
-- Sigue sin salir **ninguna identidad del equipo** (P7, RN-REP-13): las
-- dos funciones de abajo no seleccionan una sola columna con clave ajena a
-- `profiles`, y la suite 60 lo comprueba buscando los uuid uno a uno.

-- ------------------------------------------------------------
-- 1 · La sección de Operación empieza en `standard`, no en `basic`
-- ------------------------------------------------------------
--
-- Cuando se escribió la migración 111, `operation` empezaba en `basic`
-- porque el relato del mes no existía y sin ella el informe de un Básico
-- no tenía nada dentro. Hoy el mes se cuenta en `month_activity`, y lo que
-- queda en la sección de Operación es justo lo que Básico no paga: plazos,
-- tiempos medios, bloqueos.
--
-- Un informe `basic` lleva por tanto resumen ejecutivo y "Lo que ha pasado
-- este mes" —con su bolsa y la ficha de cada cambio—, que es su mes
-- contado entero, sin ninguna lectura de cómo fue.
create or replace function public.report_level_allows(p_level text, p_section text)
returns boolean
language sql
immutable
as $$
  select case p_section
    when 'executive_summary' then public.report_level_rank(p_level) >= 0
    -- RN-REP-18 · el relato del mes, con la bolsa y la ficha de cada
    -- cambio, en los cinco niveles. Es lo que pasó, no una valoración.
    when 'month_activity' then public.report_level_rank(p_level) >= 0
    -- RN-REP-15 (decisión 58) · los plazos y los tiempos, desde Impulso.
    when 'operation' then public.report_level_rank(p_level) >= 1
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
   RN-REP-18 · `month_activity` entra en los cinco niveles; `operation`,
   desde `standard` (decisión 58).';

revoke all on function public.report_level_allows(text, text) from public, anon;
grant execute on function public.report_level_allows(text, text) to authenticated;

-- ------------------------------------------------------------
-- 2 · La bolsa del mes, categoría a categoría (RN-REP-20)
-- ------------------------------------------------------------
--
-- Devuelve las cuatro categorías **siempre**, incluso a cero: la línea
-- "cambios grandes, 0 de 0 incluidos" informa, porque dice lo que el plan
-- del restaurante no le da (RN-COM-02: solo Premium+ incluye uno).
--
-- Los tres números de cada categoría vienen de tres sitios, y conviene no
-- juntarlos nunca:
--
--   · `consumed`  — los apuntes del libro de consumos DEL PERIODO. Se
--     suman los débitos y se les restan las devoluciones, que es lo que
--     significa "ha consumido": un cambio cancelado que devolvió su unidad
--     no se gastó (RN-CON-08).
--   · `included`  — la instantánea del ciclo vigente al FINAL del periodo,
--     no el plan en vivo: un ciclo ya creado no se mueve si el plan cambia
--     después (RN-CON-05). Sin plan vigente no hay ciclo y se devuelve
--     null, que la pantalla dice como "sin plan" en vez de como un 0.
--   · `budgeted`  — los trabajos del periodo con presupuesto
--     (`jobs.quote_id`), que NO pasan por el libro (RN-CON-03).
--
-- Un consolidado del espacio (`p_establishment_id` nulo) no tiene bolsa:
-- sumar las de cinco restaurantes no significa nada. Devuelve las cuatro
-- categorías con `included` a null y los contadores sumados, que sí se
-- pueden sumar.
create or replace function public.report_change_allowance(
  p_space_id uuid,
  p_establishment_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select (p_from::timestamptz) as from_at, ((p_to + 1)::timestamptz) as to_at
  ),
  categories as (
    select unnest(array['small', 'photo', 'medium', 'large']) as category
  ),
  -- El ciclo vigente al final del periodo. `order by cycle_start desc` con
  -- límite 1 y no un `between`: si dos ciclos se solapan por un cambio de
  -- plan, manda el más reciente, que es el que el restaurante tiene.
  cycle as (
    select c.included_small, c.included_photo, c.included_medium, c.included_large
    from public.consumption_cycles c, bounds b
    where p_establishment_id is not null
      and c.establishment_id = p_establishment_id
      and c.space_id = p_space_id
      and c.cycle_start < b.to_at
    order by c.cycle_start desc
    limit 1
  ),
  consumed as (
    select ce.category, coalesce(-sum(ce.amount), 0)::integer as total
    from public.consumption_entries ce, bounds b
    where ce.space_id = p_space_id
      and (p_establishment_id is null or ce.establishment_id = p_establishment_id)
      and ce.created_at >= b.from_at and ce.created_at < b.to_at
    group by ce.category
  ),
  budgeted as (
    select j.category, count(*)::integer as total
    from public.jobs j, bounds b
    where j.space_id = p_space_id
      and (p_establishment_id is null or j.establishment_id = p_establishment_id)
      and j.quote_id is not null
      -- El trabajo cuenta en el mes en que se aceptó, que es cuando el
      -- restaurante lo encargó y lo que la ficha del cambio enseña.
      and j.created_at >= b.from_at and j.created_at < b.to_at
    group by j.category
  )
  select jsonb_build_object(
    'categories',
    coalesce(
      (select jsonb_agg(jsonb_build_object(
         'category', cat.category,
         'consumed', coalesce(co.total, 0),
         'included', case cat.category
           when 'small' then (select included_small from cycle)
           when 'photo' then (select included_photo from cycle)
           when 'medium' then (select included_medium from cycle)
           when 'large' then (select included_large from cycle)
         end,
         'budgeted', coalesce(bu.total, 0)
       ) order by array_position(array['small', 'photo', 'medium', 'large'], cat.category))
       from categories cat
       left join consumed co on co.category = cat.category
       left join budgeted bu on bu.category = cat.category),
      '[]'::jsonb
    )
  );
$$;

comment on function public.report_change_allowance(uuid, uuid, date, date) is
  'RN-REP-20 · las cuatro categorías de cambio con lo consumido del libro,
   lo incluido en la instantánea del ciclo vigente y lo presupuestado
   aparte. Los tres números vienen de tres sitios y no se juntan: un
   presupuestado no consume bolsa (RN-CON-03), de ahí el "1 de 0".
   `included` a null significa sin plan vigente, nunca cero.';

revoke all on function public.report_change_allowance(uuid, uuid, date, date)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3 · El relato del mes, con la ficha de cada cambio
-- ------------------------------------------------------------
--
-- Dos mitades, y son distintas a propósito:
--
--   · `changes` — un cambio es lo que el restaurante pidió y pagó, así que
--     se cuenta entero: título, descripción, categoría, fechas y estado.
--   · `entries` — lo demás, una línea por cosa: rechazos, correcciones,
--     menús, archivos y, solo con Finanzas dentro, cobros y pagos.
--
-- **Qué se fue de `entries` y por qué.** Las seis clases de cambio
-- —recibida, aceptada, rechazada, publicado, entregado, cancelado— ya no
-- salen ahí: un cambio con esas líneas más su ficha aparecería siete
-- veces, y el relato de un mes movido sería ilegible.
--
-- **La ficha sale de la SOLICITUD y no del trabajo**, que es la corrección
-- que hizo falta al construirlo: una solicitud enviada y todavía en
-- análisis cuando se genera el informe no tiene trabajo, y montando las
-- fichas sobre `jobs` desaparecía del relato sin dejar rastro. El
-- restaurante la pidió y quiere saber que no se ha perdido.
--
-- El **texto** de un cambio ya es del restaurante: la migración 27 le
-- concede `select` sobre `description`, `validated_summary` y
-- `validated_category` de `requests`. Esto no le enseña nada nuevo: lo
-- reúne en un sitio.
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
  changes as (
    select
      -- El código de la SOLICITUD, no el del trabajo: el trabajo es
      -- organización interna del equipo y el restaurante sigue su cambio
      -- por el código con el que lo pidió.
      r.code,
      -- El título es el resumen que validó el equipo; si no lo hay todavía
      -- —una solicitud recién enviada, sin clasificar—, null, y la
      -- pantalla usa el código. Nunca una frase inventada.
      nullif(btrim(coalesce(r.validated_summary, '')), '') as title,
      r.description,
      coalesce(j.category, r.validated_category) as category,
      j.quote_id is not null as budgeted,
      r.created_at as requested_at,
      r.accepted_at,
      r.rejected_at,
      j.started_at,
      j.completed_at,
      j.cancelled_at,
      -- El estado del TRABAJO manda cuando lo hay, porque es el que dice si
      -- está en marcha; si no lo hay todavía, el de la solicitud, que es lo
      -- que le pasa a una recién enviada y a una rechazada.
      coalesce(j.state, r.state) as state,
      -- RN-COR-07 · cuántas correcciones pidió el restaurante sobre este
      -- cambio. Las de `team_error` no cuentan: se corrigen sin que a él le
      -- cueste nada, y contárselas sería contarle nuestra cocina.
      (select count(*)::integer
       from public.corrections c
       where c.request_id = r.id and c.kind = 'client_request') as corrections
    from public.requests r
    left join public.jobs j on j.request_id = r.id, bounds b
    where r.space_id = p_space_id
      and (p_establishment_id is null or r.establishment_id = p_establishment_id)
      -- `draft` no cuenta: es un borrador que el restaurante todavía no ha
      -- enviado, y contarlo sería contarle algo que no hizo.
      and r.state <> 'draft'
      -- Un cambio entra en el informe del mes en que **pasó algo con él**.
      -- Por eso son seis fechas y no una: un cambio pedido en agosto y
      -- entregado en septiembre sale en los dos informes —en el primero
      -- "en proceso" y en el segundo entregado—, que es justo lo que hace
      -- que ninguno deje al restaurante con la duda.
      and (
        (r.created_at >= b.from_at and r.created_at < b.to_at)
        or (r.accepted_at >= b.from_at and r.accepted_at < b.to_at)
        or (r.rejected_at >= b.from_at and r.rejected_at < b.to_at)
        or (j.started_at >= b.from_at and j.started_at < b.to_at)
        or (j.completed_at >= b.from_at and j.completed_at < b.to_at)
        or (j.cancelled_at >= b.from_at and j.cancelled_at < b.to_at)
      )
  ),
  entries as (
    -- Las correcciones que pidió el restaurante. Van sueltas, con su
    -- fecha, **además** de contarse en la ficha de su cambio: la ficha
    -- dice "necesitó dos correcciones" y el relato dice cuándo fue cada
    -- una. Por el código de la solicitud, igual que la ficha: el
    -- restaurante reconoce el cambio que pidió, no el trabajo interno.
    select c.requested_at as at, 'correction_requested' as kind, r.code as subject,
           r.validated_category as category
    from public.corrections c
    join public.requests r on r.id = c.request_id, bounds b
    where c.space_id = p_space_id
      and (p_establishment_id is null or c.establishment_id = p_establishment_id)
      and c.kind = 'client_request'
      and c.requested_at >= b.from_at and c.requested_at < b.to_at

    union all
    select mp.published_at, 'menu_published', to_char(m.target_date, 'YYYY-MM-DD'), null
    from public.menu_publications mp
    join public.menus m on m.id = mp.menu_id, bounds b
    where mp.space_id = p_space_id
      and (p_establishment_id is null or mp.establishment_id = p_establishment_id)
      and mp.published_at >= b.from_at and mp.published_at < b.to_at

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
      -- Un cobro revertido no pasó (RN-FIN-04).
      and pm.reversed_at is null
      and pm.paid_at >= b.from_at and pm.paid_at < b.to_at
  )
  select jsonb_build_object(
    'changes',
    coalesce(
      (select jsonb_agg(jsonb_build_object(
         'code', ch.code,
         'title', ch.title,
         'description', ch.description,
         'category', ch.category,
         'budgeted', ch.budgeted,
         'requestedAt', ch.requested_at,
         'acceptedAt', ch.accepted_at,
         'rejectedAt', ch.rejected_at,
         'startedAt', ch.started_at,
         'completedAt', ch.completed_at,
         'cancelledAt', ch.cancelled_at,
         'state', ch.state,
         'corrections', ch.corrections
       ) order by ch.requested_at, ch.code)
       from changes ch),
      '[]'::jsonb
    ),
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
  'RN-REP-18 · lo que pasó en el periodo: `changes` con la ficha de cada
   cambio —título, descripción, categoría, fechas y estado— y `entries`
   con lo demás, una línea por cosa. Un cambio sale UNA vez, en su ficha.
   Sin identidad del equipo: ni una columna con clave ajena a profiles
   (P7, RN-REP-13). Los cobros solo con p_include_finance (RN-REP-16). La
   frase en español la escribe la pantalla desde es.ts: aquí solo hay
   claves y fechas.';

revoke all on function public.report_month_activity(uuid, uuid, date, date, boolean)
  from public, anon, authenticated;
