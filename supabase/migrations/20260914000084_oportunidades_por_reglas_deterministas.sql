-- Fase 3 · Hito 15 · Oportunidades por reglas deterministas (PRD §28,
-- RN-OPP-01 a 10; §96 a §101 de la maestra; decisión 26 de
-- `docs/DECISIONES.md`).
--
-- **Por qué este archivo no existía hasta hoy.** CLAUDE.md tenía los
-- umbrales de detección y la definición de impacto y esfuerzo en la lista
-- de "no inventes lo que está pendiente", y por eso el Hito 15 estaba
-- bloqueado. Bosco los fijó el 14/09/2026 (decisión 26, sobre
-- `docs/PROPUESTA-OPORTUNIDADES.md`). Todo número que aparezca aquí o en
-- `src/core/opportunities.ts` sale de ahí; ninguno se decide en el código.
--
-- Tres tablas:
--
--   · `opportunities` — una oportunidad viva, con sus campos de §96
--     (categoría, evidencia, periodo, prioridad propuesta, impacto,
--     esfuerzo, acción recomendada, servicio o cambio potencial y la
--     opción "Incluir en informe") y los ocho estados de §98. La clave
--     natural de una automática es (restaurante, regla, sujeto): eso es lo
--     que hace que §99 se cumpla sola —"las detecciones repetidas
--     actualizan la oportunidad existente"— en vez de depender de que
--     alguien se acuerde de buscar antes de insertar.
--   · `opportunity_detections` — el libro inmutable de detecciones: cada
--     vez que una regla salta se escribe aquí con su evidencia y su
--     periodo, y nadie lo edita. La oportunidad enseña la última cuenta;
--     este libro dice cuántas veces y desde cuándo. Sin él, una
--     oportunidad actualizada perdería su historia.
--   · `opportunity_notes` — la evidencia aportada y las observaciones del
--     equipo (§97). Es organización interna: el restaurante no ve la
--     fila, igual que no ve `tasks` (P7). Por eso aquí NO se tapa la
--     columna del autor: se le deja fuera de la fila entera, que es la
--     otra mitad de la regla de CLAUDE.md y la que confundir fue el
--     bloqueante B2 de la cuarta revisión.
--
-- Lo que decide el servidor y no la pantalla:
--
--   · **Detectar no es enseñar** (RN-OPP-07, §96 y §295): hasta que el
--     equipo no aprueba una oportunidad, el restaurante no la ve. Lo
--     sostiene la política de RLS, no que la pantalla no la pinte.
--   · **Qué ve cada plan** (RN-OPP-08, §101 y decisión 26e): Básico
--     ninguna, Impulso las básicas aprobadas, Premium también las
--     avanzadas. "Avanzada" es la que cruza dos fuentes, y eso lo cuenta
--     `opportunity_rule_scope()` sobre la lista de fuentes de cada regla,
--     no una etiqueta escrita a mano.
--   · **Quién aprueba** (§97): propietario y administradores CON "Aprobar
--     informes", que es una capacidad concedida persona a persona
--     (`space_memberships.can_approve_reports`, igual que
--     `can_perform_jobs` en el Hito 6) y no un rol nuevo. El trabajador
--     asignado ve, añade a mano, aporta evidencia, recomienda y
--     observa — y no aprueba.
--   · **La acción del restaurante** (RN-OPP-09, §100) crea un BORRADOR de
--     solicitud con la oportunidad enganchada, y sigue el camino normal.
--     No consume bolsa: el consumo nace al aceptar (RN-CON-06). Pulsarlo
--     dos veces devuelve el mismo borrador.
--
-- Lo que este archivo NO hace, dicho en claro:
--
--   · **No calcula las reglas.** Los umbrales viven en
--     `src/core/opportunities.ts` y los aplica el proceso de la cola
--     (`src/services/opportunity-detection.ts`) con `service_role`, que es
--     quien lee los puntos y llama a `upsert_detected_opportunity()`. Aquí
--     está el catálogo de reglas (fuentes, alcance, categoría y esfuerzo
--     propuesto) porque de él dependen la visibilidad por plan y el orden;
--     `listas-compartidas.test.ts` vigila que las dos mitades no se
--     separen.
--   · **No guarda texto en español.** Una oportunidad automática guarda su
--     regla, su sujeto y su evidencia; el título y la acción recomendada
--     los escribe la pantalla desde `src/i18n/es.ts` (CLAUDE.md: nada de
--     literales de interfaz fuera del sistema de i18n). El título a mano
--     solo existe en la manual de §97, porque ahí lo escribe una persona.
--   · **No inventa un aviso.** §18 no tiene ninguno de oportunidad, así que
--     no se añade: el equipo las ve en su pantalla. Si Bosco quiere uno,
--     será una decisión suya y otra migración.
--   · **No toca informes** (§89 a §95): son el Hito 16. "Incluir en
--     informe" es una opción de §96 que ya se guarda; quien la lea será el
--     informe cuando exista.
--
-- Se comprueba con `supabase/tests/oportunidades.sql`.

-- ============================================================
-- 1 · "Aprobar informes" (§97), concedida persona a persona
-- ============================================================
alter table public.space_memberships
  add column if not exists can_approve_reports boolean not null default false;

comment on column public.space_memberships.can_approve_reports is
  '§95/§97 · "Propietario y administradores CON Aprobar informes pueden
   editar, ordenar, aprobar o descartar". Solo se consulta para el rol
   admin: el propietario la tiene por su control total y el trabajador no
   la tiene nunca (§97: "no puede aprobarla definitivamente").';

-- La matriz de capacidades, con una más. Copiada de la migración 44: lo
-- único que cambia es el caso nuevo.
create or replace function public.has_capability_as(
  p_space_id uuid,
  p_user_id uuid,
  p_capability text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.space_role;
  v_can_perform_jobs boolean;
  v_can_approve_reports boolean;
begin
  select sm.role, sm.can_perform_jobs, sm.can_approve_reports
  into v_role, v_can_perform_jobs, v_can_approve_reports
  from public.space_memberships sm
  where sm.space_id = p_space_id
    and sm.user_id = p_user_id
    and sm.status = 'active';

  if v_role is null then
    return false;
  end if;

  return case p_capability
    when 'manage_space' then v_role = 'owner'
    when 'invite_member' then v_role = 'owner'
    when 'create_establishment' then v_role in ('owner', 'admin')
    when 'manage_clients' then v_role in ('owner', 'admin')
    when 'view_team' then true
    when 'manage_holidays' then v_role in ('owner', 'admin')
    when 'manage_requests' then v_role in ('owner', 'admin')
    when 'assign_jobs' then v_role in ('owner', 'admin')
    when 'perform_jobs' then
      v_role = 'worker'
      or v_role = 'owner'
      or (v_role = 'admin' and coalesce(v_can_perform_jobs, false))
    when 'manage_finance' then v_role in ('owner', 'admin')
    when 'manage_files' then v_role in ('owner', 'admin', 'worker')
    when 'manage_absences' then v_role in ('owner', 'admin')
    -- §97 · aprobar o descartar una oportunidad, y editar su propuesta.
    -- El administrador, solo si la tiene concedida.
    when 'approve_reports' then
      v_role = 'owner'
      or (v_role = 'admin' and coalesce(v_can_approve_reports, false))
    else false
  end;
end;
$$;

revoke all on function public.has_capability_as(uuid, uuid, text) from public, anon, authenticated;

-- Concede o retira "Aprobar informes" a un administrador. Solo el
-- propietario, que es quien "nombra o retira administradores" (§4.2), y
-- con su apunte de auditoría, como `set_admin_can_perform_jobs()`.
create or replace function public.set_admin_can_approve_reports(
  p_space_id uuid,
  p_user_id uuid,
  p_value boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous boolean;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede conceder o retirar la capacidad de aprobar informes';
  end if;

  select can_approve_reports into v_previous
  from public.space_memberships
  where space_id = p_space_id and user_id = p_user_id;

  if v_previous is null then
    raise exception 'Esa persona no pertenece a este espacio';
  end if;

  update public.space_memberships
  set can_approve_reports = p_value
  where space_id = p_space_id and user_id = p_user_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    p_space_id, auth.uid(), 'membership.approve_reports_changed', 'space_membership', p_user_id,
    jsonb_build_object('can_approve_reports', v_previous),
    jsonb_build_object('can_approve_reports', p_value)
  );
end;
$$;

revoke all on function public.set_admin_can_approve_reports(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_admin_can_approve_reports(uuid, uuid, boolean) to authenticated;

-- ============================================================
-- 2 · El catálogo de las nueve reglas (§96, decisión 26)
--
-- Las mismas listas que `src/core/opportunities.ts`. Están aquí porque de
-- ellas dependen el alcance (y con él, qué ve cada plan) y el impacto y el
-- esfuerzo propuestos, que el servidor guarda al detectar.
-- ============================================================
create or replace function public.opportunity_rule_providers(p_rule text)
returns text[]
language sql
immutable
as $$
  select case p_rule
    when 'traffic_drop' then array['ga4']
    when 'low_ctr' then array['search_console']
    when 'position_loss' then array['search_console']
    when 'slowness' then array['pagespeed']
    when 'heavy_images' then array['pagespeed']
    when 'technical_error' then array['clarity']
    when 'low_mobile_conversion' then array['ga4']
    when 'queries_without_content' then array['search_console']
    -- La única que cruza dos: la ficha de Google y la fricción de Clarity.
    when 'low_button_use' then array['business_profile', 'clarity']
    else null
  end;
$$;

comment on function public.opportunity_rule_providers(text) is
  'Decisión 26c · con qué fuentes se calcula cada una de las nueve reglas
   de §96. NULL para una regla que no existe.';

-- §101 + decisión 26e: "avanzadas son las que cruzan dos fuentes y
-- básicas las que salen de una sola". Se cuenta, no se etiqueta: una
-- regla que mañana mire una fuente más se vuelve avanzada sola.
create or replace function public.opportunity_rule_scope(p_rule text)
returns text
language sql
immutable
as $$
  select case
    when public.opportunity_rule_providers(p_rule) is null then null
    when array_length(public.opportunity_rule_providers(p_rule), 1) > 1 then 'advanced'
    else 'basic'
  end;
$$;

create or replace function public.opportunity_rule_category(p_rule text)
returns text
language sql
immutable
as $$
  select case p_rule
    when 'traffic_drop' then 'traffic'
    when 'low_ctr' then 'search'
    when 'position_loss' then 'search'
    when 'queries_without_content' then 'search'
    when 'slowness' then 'performance'
    when 'heavy_images' then 'performance'
    when 'technical_error' then 'technical'
    when 'low_mobile_conversion' then 'conversion'
    when 'low_button_use' then 'conversion'
    else null
  end;
$$;

-- Decisión 26b · el esfuerzo ES la categoría del cambio, con su duración
-- (RN-SLA-16) y lo que gasta de la bolsa. Es una propuesta: el equipo la
-- cambia con `update_opportunity_proposal()`.
create or replace function public.opportunity_rule_effort(p_rule text)
returns text
language sql
immutable
as $$
  select case p_rule
    when 'traffic_drop' then 'medium'
    when 'low_ctr' then 'small'
    when 'position_loss' then 'medium'
    when 'queries_without_content' then 'medium'
    when 'slowness' then 'medium'
    when 'heavy_images' then 'small'
    when 'technical_error' then 'small'
    when 'low_mobile_conversion' then 'medium'
    when 'low_button_use' then 'small'
    else null
  end;
$$;

-- La prioridad propuesta de §96, derivada del impacto: 1 es lo primero.
-- Es una propuesta editable, como el impacto y el esfuerzo.
create or replace function public.opportunity_default_priority(p_impact text)
returns integer
language sql
immutable
as $$
  select case p_impact when 'high' then 1 when 'medium' then 2 else 3 end;
$$;

-- RN-OPP-07 · qué estados de §98 ve el restaurante. "Detectada",
-- "recomendada" y "en revisión" son conversación interna del equipo;
-- "descartada" no la ve nunca.
create or replace function public.opportunity_is_visible_to_client(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('approved_for_report', 'in_progress', 'implemented', 'no_longer_applicable');
$$;

revoke all on function public.opportunity_rule_providers(text) from public, anon;
grant execute on function public.opportunity_rule_providers(text) to authenticated;
revoke all on function public.opportunity_rule_scope(text) from public, anon;
grant execute on function public.opportunity_rule_scope(text) to authenticated;
revoke all on function public.opportunity_rule_category(text) from public, anon;
grant execute on function public.opportunity_rule_category(text) to authenticated;
revoke all on function public.opportunity_rule_effort(text) from public, anon;
grant execute on function public.opportunity_rule_effort(text) to authenticated;
revoke all on function public.opportunity_default_priority(text) from public, anon;
grant execute on function public.opportunity_default_priority(text) to authenticated;
-- Aparece dentro de la expresión de una política de RLS, así que
-- `authenticated` NO puede perder el EXECUTE (CLAUDE.md, excepción
-- documentada: PostgreSQL evalúa esas expresiones con los privilegios de
-- quien consulta y revocarlo rompería la política entera).
revoke all on function public.opportunity_is_visible_to_client(text) from public, anon;
grant execute on function public.opportunity_is_visible_to_client(text) to authenticated;

-- ============================================================
-- 3 · Qué oportunidades deja ver el plan vigente (§101)
--
-- Por lo que el plan ES, no por cómo se llama: Cuotly es multiempresa
-- (CLAUDE.md) y otro espacio llamará "Total" a su plan alto. Sin ningún
-- cambio incluido es el plan de entrada (Básico, que no incluye ninguno);
-- con prioridad concedida es el alto (`plans.grants_priority`, el mismo
-- criterio de la decisión 20 para el precio Premium del servicio).
-- ============================================================
create or replace function public.client_opportunity_access(p_establishment_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- Quién puede preguntarlo: quien puede leer ese restaurante (el equipo
  -- del espacio y el propio restaurante). Sin esto, cualquiera con sesión
  -- sabría de qué plan es cualquier restaurante de cualquier espacio con
  -- una llamada RPC — y el barrido de `hito7_mensajes_archivos_finanzas.sql`
  -- lo caza, que es como se encontró.
  select coalesce(
    (
      select case
        when not public.can_read_establishment(p_establishment_id) then 'none'
        when p.included_small + p.included_photo + p.included_medium + p.included_large = 0 then 'none'
        when p.grants_priority then 'advanced'
        else 'basic'
      end
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
      where s.establishment_id = p_establishment_id
        and s.kind = 'plan'
        and s.status = 'active'
      order by s.started_at desc
      limit 1
    ),
    'none'
  );
$$;

comment on function public.client_opportunity_access(uuid) is
  '§101 · qué oportunidades deja ver el plan vigente: ninguna (Básico o
   sin plan), las básicas (Impulso) o también las avanzadas (Premium, el
   que concede prioridad). Sin plan activo, ninguna.';

-- La comprobación del lado cliente, la que entra en la política de RLS.
create or replace function public.client_sees_opportunity(p_establishment_id uuid, p_scope text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_read_establishment_as_client(p_establishment_id)
     and case public.client_opportunity_access(p_establishment_id)
           when 'advanced' then true
           when 'basic' then p_scope = 'basic'
           else false
         end;
$$;

comment on function public.client_sees_opportunity(uuid, text) is
  'RN-OPP-08 · si el restaurante puede ver una oportunidad de este alcance
   (§101). No mira el estado: eso lo hace
   opportunity_is_visible_to_client() en la misma política.';

revoke all on function public.client_opportunity_access(uuid) from public, anon;
grant execute on function public.client_opportunity_access(uuid) to authenticated;
-- Las dos aparecen en la expresión de la política de `opportunities`:
-- misma excepción documentada de CLAUDE.md que arriba.
revoke all on function public.client_sees_opportunity(uuid, text) from public, anon;
grant execute on function public.client_sees_opportunity(uuid, text) to authenticated;

-- ============================================================
-- 4 · Las tablas
-- ============================================================
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- §96 la detecta sola; §97 la añade el equipo a mano.
  origin text not null check (origin in ('automatic', 'manual')),
  -- Las nueve reglas de §96. Nula en una manual.
  rule_key text check (rule_key is null or rule_key in (
    'traffic_drop', 'low_ctr', 'position_loss', 'slowness', 'heavy_images',
    'technical_error', 'low_mobile_conversion', 'queries_without_content', 'low_button_use'
  )),
  -- Qué caso de la regla: la consulta, la estrategia, el dispositivo.
  -- Vacío cuando la regla habla del sitio entero. Con la regla, es la
  -- clave de §99.
  subject text not null default '',
  category text not null check (category in ('traffic', 'search', 'performance', 'technical', 'conversion')),
  scope text not null check (scope in ('basic', 'advanced')),
  -- §96 · título y acción recomendada. En una automática son nulos: los
  -- escribe la pantalla desde i18n, porque la base no guarda español.
  title text check (title is null or length(btrim(title)) > 0),
  description text,
  recommended_action text,
  -- §96 · "servicio o cambio potencial": el servicio lo engancha el
  -- equipo; el cambio potencial es `effort_category`.
  potential_service_id uuid references public.services (id),
  -- §96 · las tres propuestas editables.
  impact text not null check (impact in ('high', 'medium', 'low')),
  priority integer not null default 2 check (priority between 1 and 3),
  effort_category text check (effort_category is null or effort_category in ('small', 'photo', 'medium', 'large')),
  -- §96 · la opción "Incluir en informe". Aprobar la pone; el informe del
  -- Hito 16 vuelve a decidir (§99).
  include_in_report boolean not null default false,
  -- Los ocho estados de §98.
  status text not null default 'detected' check (status in (
    'detected', 'recommended', 'under_review', 'approved_for_report',
    'discarded', 'in_progress', 'implemented', 'no_longer_applicable'
  )),
  status_reason text,
  -- §96 · la evidencia y el periodo. La evidencia son las cifras que la
  -- dispararon, con su métrica y su unidad; la pantalla las escribe. "No
  -- debe afirmarse algo sin evidencia suficiente" (§96): una automática
  -- sin evidencia no existe, y la restricción de abajo lo impide.
  evidence jsonb not null default '[]'::jsonb,
  period_start date,
  period_end date,
  -- Cuánto de mal está, en la unidad de su regla y siempre "más alto es
  -- peor". Es lo que decide si una descartada reaparece por empeorar (§99).
  severity numeric not null default 0,
  first_detected_at timestamptz,
  last_detected_at timestamptz,
  detection_count integer not null default 0 check (detection_count >= 0),
  -- §96 · "impacto, prioridad o esfuerzo son propuestas editables": en
  -- cuanto alguien las edita, una detección posterior ya no las pisa.
  proposal_edited_at timestamptz,
  proposal_edited_by uuid references public.profiles (id),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  -- §99 · "una descartada conserva historial" y, si vuelve, se indica el
  -- descarte anterior: por eso lo del descarte NO se borra al reabrir.
  discarded_at timestamptz,
  discarded_by uuid references public.profiles (id),
  discard_reason text,
  discarded_severity numeric,
  discarded_period_end date,
  reopened_at timestamptz,
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_shape check (
    (origin = 'automatic' and rule_key is not null and jsonb_array_length(evidence) > 0)
    or (origin = 'manual' and rule_key is null and title is not null)
  )
);

comment on table public.opportunities is
  '§96 a §101 · una oportunidad, automática o añadida a mano. Sin política
   de escritura: se detecta, se mueve de estado y se edita por función, y
   cada cosa audita. La clave natural de una automática (restaurante,
   regla, sujeto) es lo que hace que §99 actualice en vez de duplicar.';

alter table public.opportunities enable row level security;

create index opportunities_establishment_idx on public.opportunities (establishment_id, status);
create index opportunities_space_idx on public.opportunities (space_id, status);

-- §99 · "las detecciones repetidas actualizan la oportunidad existente".
-- No es una comprobación de la función: es la base la que lo impide.
create unique index opportunities_automatic_key_idx
  on public.opportunities (establishment_id, rule_key, subject)
  where origin = 'automatic';

-- Quién lee: quien gestiona la cartera, el trabajador autorizado (§97:
-- "el trabajador asignado puede ver oportunidades automáticas") y el
-- restaurante, solo las aprobadas y solo las que su plan le deja ver
-- (RN-OPP-07/08).
create policy opportunities_select on public.opportunities
for select
using (
  public.has_capability(space_id, 'manage_clients')
  or public.is_authorized_worker_establishment(establishment_id)
  or (
    public.opportunity_is_visible_to_client(status)
    and public.client_sees_opportunity(establishment_id, scope)
  )
);

-- P7 / CLAUDE.md: la fila la ve el restaurante cuando está aprobada, pero
-- quién la detectó, quién la aprobó, quién la descartó y quién editó la
-- propuesta son identidad del equipo, y eso RLS no lo filtra: lo filtra el
-- privilegio de columna.
revoke select on public.opportunities from anon, authenticated;
grant select (id, space_id, establishment_id, origin, rule_key, subject, category, scope,
              title, description, recommended_action, potential_service_id, impact, priority,
              effort_category, include_in_report, status, status_reason, evidence, period_start,
              period_end, severity, first_detected_at, last_detected_at, detection_count,
              proposal_edited_at, approved_at, discarded_at, discard_reason, discarded_severity,
              discarded_period_end, reopened_at, created_at, updated_at)
  on public.opportunities to authenticated;

create table public.opportunity_detections (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  severity numeric not null,
  evidence jsonb not null,
  detected_at timestamptz not null default now(),
  check (period_end >= period_start)
);

comment on table public.opportunity_detections is
  'Libro inmutable de detecciones (§99). Cada vez que una regla salta se
   escribe una fila; la oportunidad guarda la última cuenta y esto guarda
   la historia. Sin política de INSERT/UPDATE/DELETE: solo lo escribe
   upsert_detected_opportunity(), reservada a service_role.';

alter table public.opportunity_detections enable row level security;

create index opportunity_detections_opportunity_idx
  on public.opportunity_detections (opportunity_id, detected_at desc);

-- La historia de las detecciones es del equipo: el restaurante ve la
-- oportunidad y su evidencia, no el registro de cuántas veces saltó.
create policy opportunity_detections_select on public.opportunity_detections
for select
using (
  public.has_capability(space_id, 'manage_clients')
  or public.is_authorized_worker_establishment(establishment_id)
);

create table public.opportunity_notes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  -- §97 · "aportar evidencia" y "añadir observaciones".
  kind text not null check (kind in ('evidence', 'observation')),
  body text not null check (length(btrim(body)) > 0),
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.opportunity_notes is
  '§97 · la evidencia que aporta el equipo y sus observaciones. La FILA es
   organización interna del equipo, así que el restaurante no la ve —como
   `tasks`, y a diferencia de `messages`, donde la fila es suya y solo se
   le tapa la columna del autor (CLAUDE.md, bloqueante B2 de la cuarta
   revisión). Por eso author_id no se revoca: nadie de fuera llega a la
   fila.';

alter table public.opportunity_notes enable row level security;

create index opportunity_notes_opportunity_idx on public.opportunity_notes (opportunity_id, created_at);

create policy opportunity_notes_select on public.opportunity_notes
for select
using (
  public.has_capability(space_id, 'manage_clients')
  or public.is_authorized_worker_establishment(establishment_id)
);

-- §100 · la solicitud que nace de una oportunidad la lleva enganchada:
-- eso es "con evidencia adjunta", sin copiar la evidencia a ningún sitio.
alter table public.requests
  add column if not exists opportunity_id uuid references public.opportunities (id);

alter table public.requests
  add column if not exists opportunity_action text
    check (opportunity_action is null or opportunity_action in ('request_change', 'request_quote', 'ask_question'));

comment on column public.requests.opportunity_id is
  '§100 · la oportunidad desde la que el restaurante pidió esto. Nula en
   una solicitud normal.';

grant select (opportunity_id, opportunity_action) on public.requests to authenticated;

create index requests_opportunity_idx on public.requests (opportunity_id) where opportunity_id is not null;

-- §98 · los cambios de estado van al libro de siempre (`state_events`),
-- con una entidad más. El restaurante no los ve: quién aprobó o descartó
-- una oportunidad es organización interna (P7); lo que él ve es la
-- oportunidad ya aprobada.
alter table public.state_events drop constraint state_events_entity_type_check;
alter table public.state_events add constraint state_events_entity_type_check
  check (entity_type in ('job', 'task', 'establishment', 'opportunity'));

-- Ojo con la política: hay que copiar la VIGENTE, que es la de la
-- migración 30, y no cualquiera de las tres anteriores. Las dos
-- diferencias que costaron un rojo cada una al escribir esta migración:
--
--   · la 25 tenía una rama de `establishment` que la 26 quitó a
--     propósito — el restaurante ve el motivo de su estado por la vista
--     `client_establishment_status_events`, que le tapa `actor_id`, y no
--     por la tabla base (comprobación X3 de `hito7_...sql`);
--   · la rama de `task` de la 30 lleva `is_space_member(space_id)`
--     ADEMÁS de `can_read_task()`, porque `can_read_task()` incluye al
--     cliente a través de `can_read_job()`. Sin ese añadido, el
--     restaurante alcanza los eventos de las tareas internas y con ellos
--     `actor_id` (lo caza el barrido de identidad del Hito 7).
--
-- Aquí se reescribe entera solo para añadir la rama de oportunidad.
drop policy state_events_select on public.state_events;

create policy state_events_select on public.state_events
for select
using (
  public.has_capability(space_id, 'assign_jobs')
  or (entity_type = 'job' and public.can_read_job(entity_id) and public.is_space_member(space_id))
  or (entity_type = 'task' and public.is_space_member(space_id) and public.can_read_task(entity_id))
  -- §98 · quién movió una oportunidad de estado lo ve el equipo: quien
  -- gestiona la cartera y el trabajador autorizado en ese restaurante.
  or (
    entity_type = 'opportunity'
    and (
      public.has_capability(space_id, 'manage_clients')
      or exists (
        select 1 from public.opportunities o
        where o.id = public.state_events.entity_id
          and public.is_authorized_worker_establishment(o.establishment_id)
      )
    )
  )
);

-- ============================================================
-- 5 · La detección (proceso de la cola, con service_role)
--
-- Quien aplica los umbrales es `src/core/opportunities.ts` dentro del
-- proceso de la cola, que es el único que lee todos los puntos de un
-- restaurante. Aquí llega ya la conclusión: esta regla ha saltado sobre
-- este sujeto, con esta evidencia y esta severidad.
--
-- Lo que decide ESTA función, y no el proceso, es §99: si la oportunidad
-- ya existe se actualiza (no se duplica), si está descartada se decide si
-- reaparece, y la propuesta que el equipo haya editado no se pisa.
-- ============================================================
create or replace function public.upsert_detected_opportunity(
  p_establishment_id uuid,
  p_rule text,
  p_subject text,
  p_impact text,
  p_severity numeric,
  p_period_start date,
  p_period_end date,
  p_evidence jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_scope text;
  v_category text;
  v_effort text;
  v_id uuid;
  v_status text;
  v_edited boolean;
  v_discarded_severity numeric;
  v_discarded_period_end date;
  v_reopens boolean;
begin
  if public.opportunity_rule_providers(p_rule) is null then
    raise exception 'Regla de oportunidad desconocida: %', p_rule;
  end if;

  if p_evidence is null or jsonb_array_length(p_evidence) = 0 then
    -- §96: "no debe afirmarse algo sin evidencia suficiente".
    raise exception 'Una oportunidad automática sin evidencia no se guarda';
  end if;

  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  v_scope := public.opportunity_rule_scope(p_rule);
  v_category := public.opportunity_rule_category(p_rule);
  v_effort := public.opportunity_rule_effort(p_rule);

  select id, status, proposal_edited_at is not null, discarded_severity, discarded_period_end
  into v_id, v_status, v_edited, v_discarded_severity, v_discarded_period_end
  from public.opportunities
  where establishment_id = p_establishment_id
    and origin = 'automatic'
    and rule_key = p_rule
    and subject = coalesce(p_subject, '')
  for update;

  if v_id is null then
    insert into public.opportunities (
      space_id, establishment_id, origin, rule_key, subject, category, scope,
      impact, priority, effort_category, status, evidence, period_start, period_end,
      severity, first_detected_at, last_detected_at, detection_count
    )
    values (
      v_space_id, p_establishment_id, 'automatic', p_rule, coalesce(p_subject, ''), v_category, v_scope,
      p_impact, public.opportunity_default_priority(p_impact), v_effort, 'detected', p_evidence,
      p_period_start, p_period_end, p_severity, now(), now(), 1
    )
    returning id into v_id;

    insert into public.opportunity_detections
      (space_id, establishment_id, opportunity_id, period_start, period_end, severity, evidence)
    values (v_space_id, p_establishment_id, v_id, p_period_start, p_period_end, p_severity, p_evidence);

    perform public.record_state_event(v_space_id, 'opportunity', v_id, null, 'detected', null);

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (v_space_id, null, 'opportunity.detected', 'opportunity', v_id,
            jsonb_build_object('rule', p_rule, 'subject', coalesce(p_subject, ''), 'severity', p_severity));

    return v_id;
  end if;

  -- El libro de detecciones se escribe siempre, incluso cuando la
  -- oportunidad está descartada: saber que sigue saltando es un dato.
  insert into public.opportunity_detections
    (space_id, establishment_id, opportunity_id, period_start, period_end, severity, evidence)
  values (v_space_id, p_establishment_id, v_id, p_period_start, p_period_end, p_severity, p_evidence);

  if v_status = 'discarded' then
    -- §99 · "puede reaparecer si empeora o vuelve a cumplirse en otro
    -- periodo, indicando el descarte anterior". "Otro periodo" es una
    -- ventana que ya no se solapa con la que se descartó: si no,
    -- descartar no significaría nada al día siguiente. Lo del descarte
    -- NO se borra: es lo que se indica al reaparecer.
    v_reopens := p_severity > coalesce(v_discarded_severity, 0)
      or (v_discarded_period_end is not null and p_period_start > v_discarded_period_end);

    if not v_reopens then
      update public.opportunities
      set last_detected_at = now(),
          detection_count = detection_count + 1,
          updated_at = now()
      where id = v_id;
      return v_id;
    end if;

    update public.opportunities
    set status = 'detected',
        reopened_at = now(),
        status_reason = null,
        evidence = p_evidence,
        severity = p_severity,
        period_start = p_period_start,
        period_end = p_period_end,
        impact = case when v_edited then impact else p_impact end,
        priority = case when v_edited then priority else public.opportunity_default_priority(p_impact) end,
        effort_category = case when v_edited then effort_category else v_effort end,
        last_detected_at = now(),
        detection_count = detection_count + 1,
        updated_at = now()
    where id = v_id;

    perform public.record_state_event(v_space_id, 'opportunity', v_id, 'discarded', 'detected',
                                      'Vuelve a cumplirse');

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_space_id, null, 'opportunity.reopened', 'opportunity', v_id,
            jsonb_build_object('status', 'discarded', 'discarded_severity', v_discarded_severity),
            jsonb_build_object('status', 'detected', 'severity', p_severity));

    return v_id;
  end if;

  -- Viva: se actualiza la cuenta, nunca la decisión del equipo.
  update public.opportunities
  set evidence = p_evidence,
      severity = p_severity,
      period_start = p_period_start,
      period_end = p_period_end,
      impact = case when v_edited then impact else p_impact end,
      priority = case when v_edited then priority else public.opportunity_default_priority(p_impact) end,
      effort_category = case when v_edited then effort_category else v_effort end,
      last_detected_at = now(),
      detection_count = detection_count + 1,
      updated_at = now()
  where id = v_id;

  return v_id;
end;
$$;

comment on function public.upsert_detected_opportunity(uuid, text, text, text, numeric, date, date, jsonb) is
  '§99 · crea la oportunidad o actualiza la que ya existe para esa regla y
   ese sujeto, y decide si una descartada reaparece. Reservada a
   service_role: la detección la hace el proceso de la cola, no una
   pantalla.';

revoke all on function public.upsert_detected_opportunity(uuid, text, text, text, numeric, date, date, jsonb)
  from public, anon, authenticated;

-- Los restaurantes a los que toca pasarles las reglas: los que tienen
-- alguna integración conectada y no están archivados ni suspendidos. El
-- proceso de la cola lo usa para no leer puntos de quien no los tiene.
create or replace function public.establishments_for_opportunity_detection(p_limit integer default 50)
returns table (establishment_id uuid, space_id uuid, timezone text)
language sql
security definer
set search_path = public
as $$
  select e.id, e.space_id, s.timezone
  from public.establishments e
  join public.spaces s on s.id = e.space_id
  where e.status not in ('archived', 'suspended')
    and exists (
      select 1 from public.integrations i
      where i.establishment_id = e.id
        and i.status in ('connected', 'syncing', 'error', 'needs_attention')
        and i.last_success_at is not null
    )
  order by e.id
  limit greatest(p_limit, 0);
$$;

revoke all on function public.establishments_for_opportunity_detection(integer)
  from public, anon, authenticated;

-- ============================================================
-- 6 · Los estados (§98) y quién los mueve (§97)
-- ============================================================

-- La misma tabla de transiciones que `src/core/opportunities.ts`. `worker`
-- es el trabajador asignado: recomienda y no aprueba.
create or replace function public.opportunity_transition_allowed(
  p_from text,
  p_to text,
  p_actor text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = 'detected' and p_to = 'recommended' then p_actor in ('worker', 'approver')
    -- Quien aprueba puede aprobar lo que está mirando, sin escala en un
    -- estado intermedio (§95: revisa, selecciona y aprueba).
    when p_from = 'detected' and p_to in ('under_review', 'approved_for_report', 'discarded') then p_actor = 'approver'
    when p_from = 'recommended' and p_to in ('under_review', 'approved_for_report', 'discarded') then p_actor = 'approver'
    when p_from = 'under_review' and p_to in ('approved_for_report', 'discarded') then p_actor = 'approver'
    when p_from = 'approved_for_report' and p_to in ('in_progress', 'no_longer_applicable', 'discarded') then p_actor = 'approver'
    when p_from = 'in_progress' and p_to in ('implemented', 'no_longer_applicable') then p_actor = 'approver'
    when p_from = 'implemented' and p_to = 'no_longer_applicable' then p_actor = 'approver'
    -- De descartada no se sale a mano: la reapertura la hace la
    -- detección (§99), con su motivo y su evidencia.
    else false
  end;
$$;

revoke all on function public.opportunity_transition_allowed(text, text, text) from public, anon;
grant execute on function public.opportunity_transition_allowed(text, text, text) to authenticated;

create or replace function public.set_opportunity_status(
  p_opportunity_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_status text;
  v_actor text;
begin
  select space_id, establishment_id, status
  into v_space_id, v_establishment_id, v_status
  from public.opportunities
  where id = p_opportunity_id
  for update;

  if v_space_id is null then
    raise exception 'Oportunidad no encontrada';
  end if;

  -- Quién es quien llama. El propietario y el administrador con "Aprobar
  -- informes" aprueban; el resto del equipo con acceso al restaurante
  -- recomienda (§97).
  if public.has_capability(v_space_id, 'approve_reports') then
    v_actor := 'approver';
  elsif public.has_capability(v_space_id, 'manage_clients')
     or public.is_authorized_worker_establishment(v_establishment_id) then
    v_actor := 'worker';
  else
    raise exception 'No tienes acceso a las oportunidades de este restaurante';
  end if;

  -- Idempotente (RN-DAT-09): pulsarlo dos veces no escribe dos apuntes.
  if v_status = p_status then
    return;
  end if;

  if not public.opportunity_transition_allowed(v_status, p_status, v_actor) then
    raise exception 'No puedes pasar una oportunidad de % a %', v_status, p_status;
  end if;

  if p_status = 'discarded' and btrim(coalesce(p_reason, '')) = '' then
    -- §99: una descartada conserva historial, y el historial sin el
    -- motivo no dice nada.
    raise exception 'Descartar una oportunidad exige un motivo';
  end if;

  update public.opportunities
  set status = p_status,
      status_reason = p_reason,
      include_in_report = case when p_status = 'approved_for_report' then true else include_in_report end,
      approved_at = case when p_status = 'approved_for_report' then now() else approved_at end,
      approved_by = case when p_status = 'approved_for_report' then auth.uid() else approved_by end,
      discarded_at = case when p_status = 'discarded' then now() else discarded_at end,
      discarded_by = case when p_status = 'discarded' then auth.uid() else discarded_by end,
      discard_reason = case when p_status = 'discarded' then p_reason else discard_reason end,
      discarded_severity = case when p_status = 'discarded' then severity else discarded_severity end,
      discarded_period_end = case when p_status = 'discarded' then period_end else discarded_period_end end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_opportunity_id;

  perform public.record_state_event(v_space_id, 'opportunity', p_opportunity_id, v_status, p_status, p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'opportunity.status_changed', 'opportunity', p_opportunity_id,
          jsonb_build_object('status', v_status), jsonb_build_object('status', p_status), p_reason);
end;
$$;

revoke all on function public.set_opportunity_status(uuid, text, text) from public, anon;
grant execute on function public.set_opportunity_status(uuid, text, text) to authenticated;

-- §96 · "impacto, prioridad o esfuerzo son propuestas editables", y §97
-- añade editar y ordenar. Lo hace quien aprueba; lo que NO se puede
-- editar es la evidencia: son las cifras que dispararon la regla.
create or replace function public.update_opportunity_proposal(
  p_opportunity_id uuid,
  p_impact text default null,
  p_priority integer default null,
  p_effort_category text default null,
  p_include_in_report boolean default null,
  p_recommended_action text default null,
  p_potential_service_id uuid default null,
  p_title text default null,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_before jsonb;
begin
  select space_id,
         jsonb_build_object('impact', impact, 'priority', priority, 'effort_category', effort_category,
                            'include_in_report', include_in_report, 'title', title,
                            'recommended_action', recommended_action, 'potential_service_id', potential_service_id)
  into v_space_id, v_before
  from public.opportunities
  where id = p_opportunity_id
  for update;

  if v_space_id is null then
    raise exception 'Oportunidad no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'approve_reports') then
    raise exception 'Solo quien puede aprobar informes edita la propuesta de una oportunidad';
  end if;

  update public.opportunities
  set impact = coalesce(p_impact, impact),
      priority = coalesce(p_priority, priority),
      effort_category = coalesce(p_effort_category, effort_category),
      include_in_report = coalesce(p_include_in_report, include_in_report),
      recommended_action = coalesce(p_recommended_action, recommended_action),
      potential_service_id = coalesce(p_potential_service_id, potential_service_id),
      title = coalesce(p_title, title),
      description = coalesce(p_description, description),
      -- A partir de aquí una detección posterior ya no pisa la propuesta.
      proposal_edited_at = now(),
      proposal_edited_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_opportunity_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  select v_space_id, auth.uid(), 'opportunity.proposal_edited', 'opportunity', p_opportunity_id, v_before,
         jsonb_build_object('impact', o.impact, 'priority', o.priority, 'effort_category', o.effort_category,
                            'include_in_report', o.include_in_report, 'title', o.title,
                            'recommended_action', o.recommended_action, 'potential_service_id', o.potential_service_id)
  from public.opportunities o where o.id = p_opportunity_id;
end;
$$;

revoke all on function public.update_opportunity_proposal(uuid, text, integer, text, boolean, text, uuid, text, text)
  from public, anon;
grant execute on function public.update_opportunity_proposal(uuid, text, integer, text, boolean, text, uuid, text, text)
  to authenticated;

-- §97 · "Existe Añadir oportunidad". La añade el equipo con acceso al
-- restaurante, trabajador incluido; nace detectada y sigue el mismo
-- camino que una automática, así que tampoco la ve el restaurante hasta
-- que alguien la apruebe.
create or replace function public.add_manual_opportunity(
  p_establishment_id uuid,
  p_title text,
  p_category text,
  p_impact text,
  p_description text default null,
  p_effort_category text default null,
  p_recommended_action text default null,
  p_potential_service_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  if not (public.has_capability(v_space_id, 'manage_clients')
          or public.is_authorized_worker_establishment(p_establishment_id)) then
    raise exception 'No tienes acceso a las oportunidades de este restaurante';
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Una oportunidad añadida a mano necesita título';
  end if;

  insert into public.opportunities (
    space_id, establishment_id, origin, subject, category, scope, title, description,
    recommended_action, potential_service_id, impact, priority, effort_category, status, created_by
  )
  values (
    v_space_id, p_establishment_id, 'manual', '', p_category,
    -- Una manual sale de una persona, no de cruzar dos fuentes: es básica.
    'basic', btrim(p_title), p_description, p_recommended_action, p_potential_service_id,
    p_impact, public.opportunity_default_priority(p_impact), p_effort_category, 'detected', auth.uid()
  )
  returning id into v_id;

  perform public.record_state_event(v_space_id, 'opportunity', v_id, null, 'detected', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'opportunity.added_manually', 'opportunity', v_id,
          jsonb_build_object('title', btrim(p_title), 'category', p_category));

  return v_id;
end;
$$;

revoke all on function public.add_manual_opportunity(uuid, text, text, text, text, text, text, uuid)
  from public, anon;
grant execute on function public.add_manual_opportunity(uuid, text, text, text, text, text, text, uuid)
  to authenticated;

-- §97 · aportar evidencia y añadir observaciones. Las notas no se editan
-- ni se borran (RN-DAT-06): son el rastro de lo que el equipo pensó.
create or replace function public.add_opportunity_note(
  p_opportunity_id uuid,
  p_kind text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_id uuid;
begin
  select space_id, establishment_id into v_space_id, v_establishment_id
  from public.opportunities where id = p_opportunity_id;

  if v_space_id is null then
    raise exception 'Oportunidad no encontrada';
  end if;

  if not (public.has_capability(v_space_id, 'manage_clients')
          or public.is_authorized_worker_establishment(v_establishment_id)) then
    raise exception 'No tienes acceso a las oportunidades de este restaurante';
  end if;

  if btrim(coalesce(p_body, '')) = '' then
    raise exception 'La nota no puede estar vacía';
  end if;

  insert into public.opportunity_notes (space_id, establishment_id, opportunity_id, kind, body, author_id)
  values (v_space_id, v_establishment_id, p_opportunity_id, p_kind, btrim(p_body), auth.uid())
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'opportunity.note_added', 'opportunity', p_opportunity_id,
          jsonb_build_object('kind', p_kind));

  return v_id;
end;
$$;

revoke all on function public.add_opportunity_note(uuid, text, text) from public, anon;
grant execute on function public.add_opportunity_note(uuid, text, text) to authenticated;

-- ============================================================
-- 7 · Lo que el restaurante hace con una oportunidad (§100)
--
-- "Solicitar esta mejora", "Pedir presupuesto" y "Hacer una pregunta al
-- equipo". Las tres crean un BORRADOR de solicitud con la oportunidad
-- enganchada, y desde ahí sigue el camino normal: enviar, análisis,
-- aceptación, consumo o presupuesto. Nada de esto consume bolsa: el
-- consumo nace al aceptar (RN-CON-06).
--
-- Idempotencia (CLAUDE.md): si ya hay un borrador de esta persona para
-- esta oportunidad, se devuelve ese. Pulsar dos veces no crea dos.
-- ============================================================
create or replace function public.act_on_opportunity(
  p_opportunity_id uuid,
  p_action text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_status text;
  v_scope text;
  v_request_id uuid;
  v_code text;
begin
  if p_action not in ('request_change', 'request_quote', 'ask_question') then
    raise exception 'Acción de oportunidad desconocida: %', p_action;
  end if;

  select space_id, establishment_id, status, scope
  into v_space_id, v_establishment_id, v_status, v_scope
  from public.opportunities where id = p_opportunity_id;

  if v_space_id is null then
    raise exception 'Oportunidad no encontrada';
  end if;

  -- Quien actúa es el restaurante, y solo sobre lo que puede ver: una
  -- oportunidad sin aprobar o fuera de su plan no existe para él, ni por
  -- pantalla ni por llamada directa (CLAUDE.md).
  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este restaurante';
  end if;

  if not (public.opportunity_is_visible_to_client(v_status)
          and public.client_sees_opportunity(v_establishment_id, v_scope)) then
    raise exception 'Esa oportunidad no está disponible para este restaurante';
  end if;

  if btrim(coalesce(p_message, '')) = '' then
    raise exception 'La solicitud necesita una descripción';
  end if;

  select id into v_request_id
  from public.requests
  where opportunity_id = p_opportunity_id
    and created_by = auth.uid()
    and state = 'draft'
  limit 1;

  if v_request_id is not null then
    return v_request_id;
  end if;

  v_code := public.next_request_code(v_establishment_id);

  insert into public.requests (space_id, establishment_id, code, state, description, created_by,
                               opportunity_id, opportunity_action)
  values (v_space_id, v_establishment_id, v_code, 'draft', btrim(p_message), auth.uid(),
          p_opportunity_id, p_action)
  returning id into v_request_id;

  insert into public.request_versions (space_id, request_id, version_number, description, created_by)
  values (v_space_id, v_request_id, 1, btrim(p_message), auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'opportunity.client_action', 'opportunity', p_opportunity_id,
          jsonb_build_object('action', p_action, 'request_id', v_request_id, 'code', v_code));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'request.draft_created', 'request', v_request_id,
          jsonb_build_object('code', v_code, 'opportunity_id', p_opportunity_id));

  return v_request_id;
end;
$$;

revoke all on function public.act_on_opportunity(uuid, text, text) from public, anon;
grant execute on function public.act_on_opportunity(uuid, text, text) to authenticated;

-- ============================================================
-- 8 · Auditoría (§21.2): la familia `opportunity` es de la cartera
-- ============================================================
create or replace function public.audit_action_capability(p_action text)
returns text
language sql
immutable
as $$
  select case split_part(coalesce(p_action, ''), '.', 1)
    when 'space' then 'manage_space'
    when 'membership' then 'manage_space'
    when 'supervision' then 'manage_space'
    when 'plan' then 'manage_space'
    when 'service' then 'manage_space'
    when 'invitation' then 'invite_member'
    when 'charge' then 'manage_finance'
    when 'payment' then 'manage_finance'
    when 'subscription' then 'manage_finance'
    when 'financial' then 'manage_finance'
    when 'establishment' then 'manage_clients'
    when 'establishment_access' then 'manage_clients'
    when 'establishment_note' then 'manage_clients'
    when 'group' then 'manage_clients'
    when 'group_access' then 'manage_clients'
    when 'holiday' then 'manage_holidays'
    when 'menu_template' then 'manage_clients'
    when 'integration' then 'manage_clients'
    -- Hito 15 · quién detectó, aprobó, descartó o editó una oportunidad
    -- lo ve quien gestiona la cartera, como el establecimiento.
    when 'opportunity' then 'manage_clients'
    else null
  end;
$$;

revoke all on function public.audit_action_capability(text) from public, anon;
grant execute on function public.audit_action_capability(text) to authenticated;

create or replace function public.audit_entity_is_visible(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_entity_id is null then false
    when p_entity_type = 'request' then exists (select 1 from public.requests r where r.id = p_entity_id)
    when p_entity_type = 'job' then exists (select 1 from public.jobs j where j.id = p_entity_id)
    when p_entity_type = 'task' then exists (select 1 from public.tasks t where t.id = p_entity_id)
    when p_entity_type = 'file' then exists (select 1 from public.files f where f.id = p_entity_id)
    when p_entity_type = 'absence' then exists (select 1 from public.absences a where a.id = p_entity_id)
    when p_entity_type = 'correction' then exists (select 1 from public.corrections c where c.id = p_entity_id)
    when p_entity_type = 'menu' then exists (select 1 from public.menus m where m.id = p_entity_id)
    when p_entity_type = 'quote' then exists (select 1 from public.quotes q where q.id = p_entity_id)
    when p_entity_type = 'opportunity' then exists (select 1 from public.opportunities o where o.id = p_entity_id)
    else false
  end;
$$;

revoke all on function public.audit_entity_is_visible(text, uuid) from public, anon;
grant execute on function public.audit_entity_is_visible(text, uuid) to authenticated;
