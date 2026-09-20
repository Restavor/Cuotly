-- ============================================================
-- Migración 117 · Vigilancia de reseñas de Google
--                 (RN-INT-10, RN-INT-11, RN-INT-12, decisión 60)
-- ============================================================
--
-- Lo que Bosco quiso añadirle a Premium+ además del informe, el
-- 20/09/2026. Sale de una conexión que ya existe: Google Business Profile
-- lleva construido desde el Hito 14 —OAuth, sincronización, siete estados,
-- pantalla— y hoy solo trae rendimiento (impresiones, clics a la web,
-- llamadas, cómo llegar, reservas). **No trae las reseñas.**
--
-- **Por qué una tabla y no métricas.** Una reseña tiene texto, autor,
-- puntuación y fecha, y hay que poder señalar UNA y decir "contesta a
-- esta". `metric_points` guarda un número por métrica, dimensión y
-- periodo: meter ahí una reseña obligaría a inventarse una dimensión que
-- fuera su identificador, y a guardar el texto en ninguna parte.
--
-- **Lo que NO hay aquí, y es deliberado** (CLAUDE.md, "no inventes lo que
-- está pendiente"): ninguna regla de oportunidad nueva por reputación,
-- ningún umbral de "reputación en riesgo", ninguna respuesta a reseñas
-- desde Cuotly. Una reseña baja avisa a personas; deciden ellas.

-- ------------------------------------------------------------
-- 1 · El plan concede la vigilancia (RN-INT-10)
-- ------------------------------------------------------------
--
-- Columna propia, como las dos de la migración 110 y por la misma razón:
-- cada cosa que el plan manda lleva su nombre, y ninguna se deduce del
-- nombre del plan —Cuotly es multiempresa y otro espacio llamará "Total"
-- a su plan alto—.
alter table public.plans
  add column watches_reviews boolean not null default false;

comment on column public.plans.watches_reviews is
  'RN-INT-10 · si Cuotly vigila las reseñas de Google del establecimiento.
   Si es false la reseña **no se descarga**, no es que se descargue y se
   esconda: es un trabajo que no se está haciendo, como Menú Diario.';

-- El relleno de hoy va por `grants_priority`, que es lo único que se sabe
-- de cualquier espacio sobre cuál es su plan más alto (migración 110).
update public.plans set watches_reviews = true where grants_priority;

-- ------------------------------------------------------------
-- 2 · Qué es una reseña baja (RN-INT-11)
-- ------------------------------------------------------------
--
-- Tres estrellas o menos. Lo fijó Bosco el 20/09/2026 sobre 2 y 4: un 3 en
-- Google ya es un cliente descontento que se tomó la molestia de escribir,
-- y es el que todavía se puede recuperar.
--
-- Es una función y no un número suelto dentro de una consulta para que el
-- día que cambie sea una migración de una línea y no una búsqueda por todo
-- el repositorio.
create or replace function public.review_low_rating_threshold()
returns smallint
language sql
immutable
as $$
  select 3::smallint;
$$;

comment on function public.review_low_rating_threshold() is
  'RN-INT-11 · una reseña de 3 estrellas o menos es baja y salta (decisión
   60, Bosco 20/09/2026). El día que otro espacio quiera su propio número
   será una columna; hoy sería inventar una preferencia que nadie pidió.';

revoke all on function public.review_low_rating_threshold() from public, anon;
grant execute on function public.review_low_rating_threshold() to authenticated;

-- Si el plan vigente del establecimiento concede la vigilancia. La usa el
-- proceso de sincronización para decidir si pide reseñas, y la pantalla
-- para decir por qué no hay ninguna.
create or replace function public.establishment_watches_reviews(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.watches_reviews
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.establishment_id = p_establishment_id
      and s.kind = 'plan'
      and s.status = 'active'
    order by s.started_at desc
    limit 1
  ), false);
$$;

comment on function public.establishment_watches_reviews(uuid) is
  'RN-INT-10 · si el plan vigente del establecimiento concede la vigilancia
   de reseñas. El plan EN VIVO y no la instantánea de un ciclo: dejar de
   pagar Premium+ deja de vigilar desde ese momento, no al mes siguiente.';

-- CLAUDE.md · **interna**, no abierta por RPC. Es `SECURITY DEFINER` y no
-- comprueba permisos por su cuenta, así que dejarla a `authenticated`
-- dejaría preguntar por el plan de cualquier establecimiento del mundo con
-- una sola llamada. El barrido de falso-cerrado de la suite 7 la habría
-- cazado; mejor no dársela que discutir con él. La pantalla no la
-- necesita: ya lee el plan del restaurante por su camino de siempre.
revoke all on function public.establishment_watches_reviews(uuid)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3 · La tabla (RN-INT-10)
-- ------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  -- El identificador que le da Google. Es lo que hace que volver a
  -- sincronizar no duplique ni vuelva a avisar (RN-INT-12).
  external_id text not null,
  rating smallint not null check (rating between 1 and 5),
  -- Google permite puntuar sin escribir: el comentario puede no existir, y
  -- eso NO es un error ni se rellena con nada (CLAUDE.md).
  comment text,
  -- El nombre público que Google publica. El autor es un cliente del
  -- restaurante, no alguien del equipo: aquí no hay identidad que tapar
  -- (P7), y esconderla dejaría al restaurante sin saber a quién contesta.
  author_name text,
  reviewed_at timestamptz not null,
  -- La respuesta, tal como la devuelve Google. Cuotly no responde reseñas
  -- —eso no existe y no se finge—: esto es el reflejo de lo que ya hay.
  reply_comment text,
  replied_at timestamptz,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.reviews is
  'RN-INT-10 · reseñas de Google del establecimiento, traídas por la misma
   conexión de Business Profile. Solo se descargan si el plan concede la
   vigilancia (`plans.watches_reviews`).';

create unique index reviews_external_idx
  on public.reviews (establishment_id, external_id);

create index reviews_establishment_idx
  on public.reviews (establishment_id, reviewed_at desc);

create index reviews_low_idx
  on public.reviews (space_id, reviewed_at desc)
  where rating <= 3;

alter table public.reviews enable row level security;

-- CLAUDE.md · toda tabla con `space_id` lleva el disparador de solo
-- lectura en Modo soporte. Aquí escribe el proceso de sincronización, que
-- no es una sesión de soporte, así que en la práctica nunca salta; va
-- igualmente, porque la lista de exentas de la suite 42 es para lo que se
-- justifica, no para lo que se olvida.
create trigger reviews_guard_support_read_only
  before insert or update or delete on public.reviews
  for each row execute function public.guard_support_read_only();

-- RN-SUB-08 · y el otro, que es distinto: un espacio archivado por impago
-- está congelado, y seguir trayendo reseñas sería seguir prestando el
-- servicio que no se está pagando.
create trigger reviews_cuotly_read_only
  before insert or update or delete on public.reviews
  for each row execute function public.guard_space_read_only();

-- Quien puede leer el restaurante, puede leer sus reseñas: el mismo
-- `can_read_establishment()` con el que se leen sus métricas. Nadie
-- escribe desde una pantalla —solo `service_role` por la función de
-- abajo—, así que no hay política de insert ni de update.
create policy reviews_select on public.reviews
for select
using (public.can_read_establishment(establishment_id));

-- ------------------------------------------------------------
-- 4 · Los dos avisos (RN-INT-12)
-- ------------------------------------------------------------
--
-- Las dos listas se reescriben **desde la definición viva**, no de
-- memoria: escribirlas de memoria se come lo que añadió otra migración y
-- ya pasó una vez en la 114.
alter table public.notifications drop constraint if exists notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
  check (event_type = any (array[
    'request_submitted', 'job_unassigned', 'job_assigned', 'job_started', 'job_published',
    'correction_requested', 'job_reassignment_requested', 'task_reassignment_requested',
    'terms_version_published', 'menu_publication_requested', 'menu_assigned',
    'menu_needs_information', 'menu_published', 'menu_publication_error',
    'menu_not_prepared_reminder', 'menu_publication_overdue', 'quote_sent', 'quote_accepted',
    'quote_rejected', 'integration_sync_failed', 'integration_reauthorization_required',
    'report_schedule_due_soon', 'report_sent', 'cuotly_payment_due_soon',
    'cuotly_payment_due_today', 'cuotly_payment_overdue_24h', 'cuotly_payment_overdue_48h',
    'cuotly_payment_final_notice', 'cuotly_space_archived', 'cuotly_space_reactivated',
    'support_session_started', 'space_ownership_transferred', 'space_archived_by_owner',
    'incident_opened', 'incident_updated', 'incident_replied', 'storage_threshold_80',
    'storage_threshold_100', 'security_incident', 'consumption_threshold_80',
    'consumption_threshold_100', 't2_threshold_50', 't2_threshold_80', 't2_threshold_100',
    't2_critical_alert', 't2_reassignment_suggestion', 't3_threshold_75', 't3_threshold_90',
    't3_threshold_100', 'establishment_paused_nonpayment', 'establishment_suspended_nonpayment',
    'establishment_reactivated', 'charge_due_today', 'absence_requested', 'absence_decided',
    'absence_uncovered_jobs', 'establishment_access_granted', 'panel_invitation_pending_review',
    'panel_invitation_decided',
    -- RN-INT-12 (migración 117) · al equipo todas; al restaurante solo las
    -- bajas. Un aviso que llega todos los días deja de leerse.
    'review_received', 'low_review_received'
  ]));

alter table public.notifications drop constraint if exists notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check
  check (entity_type = any (array[
    'request', 'job', 'task', 'establishment', 'charge', 'absence', 'menu', 'quote',
    'integration', 'report', 'cuotly_charge', 'space', 'support_session', 'incident',
    'review'
  ]));

-- ------------------------------------------------------------
-- 5 · Guardar lo que trae la sincronización (RN-INT-10, RN-INT-12)
-- ------------------------------------------------------------
--
-- La escribe el proceso de la cola con `service_role`, como todo lo que
-- entra de una fuente externa (RN-INT-09): una pantalla no sincroniza.
--
-- **Idempotente por `external_id`**: volver a sincronizar no duplica una
-- reseña ni vuelve a avisar de ella. Es la misma exigencia de CLAUDE.md
-- para las operaciones críticas, y aquí la clave la pone Google.
create or replace function public.record_establishment_reviews(
  p_integration_id uuid,
  p_reviews jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_provider text;
  v_slug text;
  v_review jsonb;
  v_id uuid;
  v_rating smallint;
  v_nuevas integer := 0;
  v_persona uuid;
begin
  select i.space_id, i.establishment_id, i.provider
  into v_space_id, v_establishment_id, v_provider
  from public.integrations i
  where i.id = p_integration_id;

  if v_space_id is null then
    raise exception 'La conexión no existe' using errcode = 'P0001';
  end if;

  -- Las reseñas son de Business Profile y de ninguna otra fuente. Sin esta
  -- comprobación, un adaptador equivocado escribiría reseñas colgando de
  -- la conexión de PageSpeed y nadie se enteraría.
  if v_provider <> 'business_profile' then
    raise exception 'Las reseñas solo vienen de Google Business Profile' using errcode = 'P0001';
  end if;

  -- RN-INT-10 · si el plan no la concede, no se guarda. La barrera está
  -- **aquí** y no solo en el adaptador: un adaptador es código que se
  -- puede llamar mal, y CLAUDE.md dice que la autoridad es el servidor.
  if not public.establishment_watches_reviews(v_establishment_id) then
    raise exception 'El plan de este establecimiento no incluye la vigilancia de reseñas'
      using errcode = 'P0001';
  end if;

  select slug into v_slug from public.spaces where id = v_space_id;

  for v_review in select * from jsonb_array_elements(coalesce(p_reviews, '[]'::jsonb))
  loop
    v_rating := (v_review ->> 'rating')::smallint;
    -- A cero en cada vuelta: `returning into` deja null cuando el
    -- `on conflict` no inserta, pero dejarlo implícito es confiar en que
    -- nadie mueva este bucle mañana. Si se arrastrara el id de la vuelta
    -- anterior, una reseña ya conocida volvería a avisar.
    v_id := null;

    insert into public.reviews (
      space_id, establishment_id, integration_id, external_id, rating,
      comment, author_name, reviewed_at, reply_comment, replied_at
    ) values (
      v_space_id, v_establishment_id, p_integration_id,
      v_review ->> 'external_id', v_rating,
      nullif(btrim(coalesce(v_review ->> 'comment', '')), ''),
      nullif(btrim(coalesce(v_review ->> 'author_name', '')), ''),
      (v_review ->> 'reviewed_at')::timestamptz,
      nullif(btrim(coalesce(v_review ->> 'reply_comment', '')), ''),
      nullif(v_review ->> 'replied_at', '')::timestamptz
    )
    on conflict (establishment_id, external_id) do nothing
    returning id into v_id;

    -- Nada que avisar: esta reseña ya estaba. Es la mitad que hace que
    -- sincronizar cada día no sea una tortura de avisos.
    continue when v_id is null;

    v_nuevas := v_nuevas + 1;

    -- Al EQUIPO, siempre (RN-INT-12).
    for v_persona in
      select m.user_id
      from public.space_memberships m
      where m.space_id = v_space_id and m.status = 'active' and m.role in ('owner', 'admin')
    loop
      perform public.emit_notification(
        v_space_id, v_persona,
        case when v_rating <= public.review_low_rating_threshold()
             then 'low_review_received' else 'review_received' end,
        'staff', 'review', v_id,
        '/espacios/' || v_slug || '/restaurantes/' || v_establishment_id::text || '/resenas',
        'review:' || v_id::text,
        v_establishment_id);
    end loop;

    -- Al RESTAURANTE, solo si es baja (RN-INT-11, RN-INT-12).
    if v_rating <= public.review_low_rating_threshold() then
      for v_persona in
        select em.user_id
        from public.establishment_memberships em
        where em.establishment_id = v_establishment_id and em.revoked_at is null
      loop
        perform public.emit_notification(
          v_space_id, v_persona, 'low_review_received', 'client', 'review', v_id,
          '/espacios/' || v_slug || '/restaurantes/' || v_establishment_id::text || '/resenas',
          'review:' || v_id::text,
          v_establishment_id);
      end loop;
    end if;
  end loop;

  return v_nuevas;
end;
$$;

comment on function public.record_establishment_reviews(uuid, jsonb) is
  'RN-INT-10, RN-INT-12 · guarda las reseñas que trae la sincronización de
   Business Profile y avisa SOLO de las nuevas: al equipo siempre, al
   restaurante solo si son bajas (RN-INT-11). Idempotente por el
   identificador de Google. Interna: solo `service_role`.';

-- CLAUDE.md · interna de verdad. Revocar solo a PUBLIC la dejaría abierta
-- por RPC a cualquiera con sesión, porque un proyecto de Supabase concede
-- EXECUTE por defecto a anon y authenticated.
revoke all on function public.record_establishment_reviews(uuid, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6 · La tabla nueva, en el traspaso (RN-TRA)
-- ------------------------------------------------------------
--
-- **Viaja.** Las reseñas de Google son del restaurante, igual que sus
-- `metric_points`: siguen siendo suyas y siguen estando en su ficha de
-- Google aunque cambie de agencia. Dejarlas atrás le borraría un historial
-- que no es de nadie más. Lo pide el barrido de la suite de las cuatro del
-- grupo C, que falla si una tabla con `establishment_id` no está declarada.
create or replace function public.establishment_transfer_tables()
returns table(table_name text, travels boolean)
language sql
immutable
as $$
  select * from (values
    -- Viaja: el trabajo del restaurante.
    ('requests', true), ('request_attachments', true),
    ('jobs', true), ('tasks', true), ('corrections', true),
    ('conversations', true), ('files', true),
    ('menus', true), ('menu_templates', true), ('menu_publications', true),
    ('menu_corrections', true), ('menu_downloads', true),
    ('integrations', true), ('metric_points', true), ('sync_runs', true),
    -- RN-INT-10 (migración 117) · su ficha de Google es suya.
    ('reviews', true),
    ('opportunities', true), ('opportunity_detections', true), ('opportunity_notes', true),
    ('reports', true),
    ('establishment_notes', true), ('internal_notes', true),
    -- Se queda: el dinero y el plan que cobró el origen (RN-TRA-04),
    -- sus ciclos de consumo (RN-TRA-12), lo que se le aceptó a él y los
    -- avisos que recibió su equipo.
    ('charges', false), ('payments', false), ('receipts', false),
    ('financial_entries', false), ('quotes', false),
    ('subscriptions', false), ('plan_commitments', false), ('scheduled_plan_changes', false),
    ('consumption_cycles', false), ('consumption_entries', false),
    ('menu_update_cycles', false), ('menu_update_entries', false),
    ('acceptances', false), ('terms_acceptances', false),
    ('space_exports', false), ('notifications', false),
    -- Las copias son del espacio que las hizo: llevan dentro material de
    -- SU equipo —conversaciones internas incluidas— y quien lo generó
    -- responde de ello. El destino empieza a hacer las suyas al día
    -- siguiente, con el barrido de RN-BCK-02.
    ('establishment_backups', false),
    -- Se queda y además se retira: RN-TRA-08, el acceso del EQUIPO de
    -- origen no significa nada en otro espacio, y dejarlo vivo sería una
    -- puerta abierta a un restaurante que ya no es suyo.
    ('worker_establishments', false),
    -- RN-ACC-13 (migración 114) · se queda, y además deja de poder
    -- gastarse: lo garantiza la comprobación de espacio de
    -- `consume_establishment_invitation()`, no esta lista.
    ('establishment_invitations', false)
  ) as t(table_name, travels);
$$;
