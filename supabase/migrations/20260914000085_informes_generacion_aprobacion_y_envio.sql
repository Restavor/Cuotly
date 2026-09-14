-- Fase 3 · Hito 16 · Informes (PRD §29, RN-REP-01 a 14; §89 a §95 de la
-- maestra).
--
-- Qué es un informe aquí, dicho antes de la primera tabla: **un periodo,
-- unas cifras congeladas y una decisión de una persona**. Ni una plantilla
-- configurable, ni un texto generado, ni un PDF guardado. Las tres cosas
-- que sí hay:
--
--   · `reports` — el informe: su familia (§89), su restaurante o su
--     consolidado, su periodo, sus filtros (§93) y uno de los **seis
--     estados** de §95. Lo que el restaurante ve de él son columnas
--     concedidas una a una: quién lo preparó, lo aprobó o lo envió es
--     identidad del equipo (P7, CLAUDE.md).
--   · `report_sections` — qué secciones lleva, en qué orden y con qué
--     texto (§95.5: "selecciona, edita y ordena"). Es organización
--     interna del equipo mientras se prepara, así que al restaurante se
--     le deja fuera de la **fila**, como en `tasks` — no se le tapa una
--     columna. Distinguir los dos casos fue el bloqueante B2 de la cuarta
--     revisión y aquí se vuelve a decidir a conciencia.
--   · `report_versions` — el **libro inmutable** de §95 ("cada versión se
--     conserva"): cada generación escribe una fila con las cifras y las
--     secciones tal y como estaban. Regenerar **añade**; no pisa. Lo que
--     se envía es una versión concreta, y `report_deliveries` guarda a
--     quién y cuándo.
--
-- Lo que decide el servidor y no la pantalla:
--
--   · **Quién ve un informe** (§89, RN-REP-01): propietario y
--     administradores del espacio; del lado cliente, el propietario
--     global del grupo y **cualquier persona del restaurante** con el
--     acceso vigente, sin distinguir rol. §89 decía que Consulta
--     necesitaba permiso de su propietario y esta migración lo implementó
--     así; **Bosco lo enmendó el 14/09/2026** (decisión 28) y ese permiso
--     se quitó entero. El **trabajador no ve esa pantalla**: lo suyo es el
--     informe personal de §90, que es otra función y otra cuenta; pero si
--     está autorizado en el restaurante **sí recibe el informe enviado**,
--     porque trabaja ahí (RN-REP-11).
--   · **Qué ve el restaurante y cuándo** (RN-REP-13): un informe
--     **enviado**. `preparing`, `pending_review`, `approved` y
--     `scheduled` son conversación interna, y lo sostiene la política de
--     RLS, no que la pantalla no lo pinte.
--   · **Que un informe con oportunidades pendientes no sale** (§95,
--     RN-REP-10). Se comprueba **al enviar** y no al aprobar, porque una
--     oportunidad puede detectarse después de aprobar el informe; el
--     envío se detiene y el informe vuelve a `pending_review` con el
--     motivo.
--   · **Que un informe solo objetivo puede programarse sin aprobación**
--     (§95): lo decide si alguna sección incluida requiere criterio, no
--     una casilla suelta.
--
-- Lo que este archivo NO hace, dicho en claro:
--
--   · **No calcula los indicadores de §91.** El cumplimiento de plazos y
--     los tiempos medios se miden con el reloj contractual, que vive en
--     `src/core/business-clock.ts`; duplicarlo en SQL es exactamente lo
--     que CLAUDE.md prohíbe. Aquí están las funciones que **entregan las
--     filas** (`report_operation_dataset`, `report_finance_dataset`,
--     reservadas a `service_role`) y `src/core/reports.ts` hace la cuenta.
--   · **No guarda texto en español.** Las secciones son claves; sus
--     nombres los escribe la pantalla desde `src/i18n/es.ts`. El nombre
--     del informe y las notas sí se guardan porque los escribe una
--     persona.
--   · **No guarda el PDF ni el CSV.** Los dos se generan desde la versión
--     (RN-REP-06): la versión es el original y ellos son una
--     representación suya. Un PDF guardado sería un segundo original que
--     puede dejar de coincidir.
--   · **No inventa avisos.** Hay dos, y los dos los pide §95/§93: el de
--     las 24 h antes de la fecha programada y el del envío al
--     restaurante.
--
-- Se comprueba con `supabase/tests/informes.sql`.

-- ============================================================
-- 1 · Quién ve los informes de un restaurante
-- ============================================================
--
-- **Enmienda a §89, decidida por Bosco el 14/09/2026.** La maestra dice
-- "Editor ve informes siempre. Consulta necesita permiso de su
-- propietario", y la primera versión de esta migración lo implementó con
-- un permiso por persona (`establishment_permissions.view_reports`) y su
-- función para concederlo. Bosco lo cambia: **el informe lo pueden ver
-- todos** los que trabajan en ese restaurante. El permiso fino se ha
-- quitado entero, no desactivado: una columna que nadie lee y una función
-- que nadie llama son una trampa para quien venga detrás.
--
-- Lo que sí se comprueba, y antes no, es que el acceso **siga vigente**:
-- `establishment_memberships` tiene `revoked_at` y esta función lo
-- ignoraba, así que a quien se le retiraba el acceso seguía viendo los
-- informes (RN-EST-05).

-- Quién puede ver los informes de un restaurante, **desde el lado
-- cliente** (RN-REP-01). El equipo va por capacidad, no por aquí.
create or replace function public.client_can_view_reports(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      -- §14.1 · el propietario global del grupo ve el consolidado y el
      -- detalle de lo suyo.
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id and gm.user_id = auth.uid()
    )
    or exists (
      -- Cualquier rol del restaurante, con el acceso vigente.
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id
        and em.user_id = auth.uid()
        and em.revoked_at is null
    );
$$;

comment on function public.client_can_view_reports(uuid) is
  '§89, enmendado el 14/09/2026 · quién ve los informes de un restaurante
   por el lado cliente: el propietario global del grupo y CUALQUIER
   persona del restaurante con el acceso vigente, sin distinguir rol. No
   mira el estado del informe: eso lo hace report_is_visible_to_client()
   en la misma política.';

-- Aparece dentro de la expresión de la política de `reports`, así que NO
-- puede perder el EXECUTE de `authenticated` (CLAUDE.md: PostgreSQL evalúa
-- esas expresiones con los privilegios de quien consulta).
revoke all on function public.client_can_view_reports(uuid) from public, anon;
grant execute on function public.client_can_view_reports(uuid) to authenticated;


-- ============================================================
-- 2 · El catálogo: familias, secciones y transiciones
--
-- Duplicado a propósito con `src/core/reports.ts`: son dos sistemas y
-- ninguno puede importar del otro. `listas-compartidas.test.ts` lee esta
-- migración y compara, que es lo que impide que se separen.
-- ============================================================

-- §95.3 · "muestra las secciones que requieren criterio". Requiere
-- criterio lo que una persona tiene que escribir o elegir: el resumen
-- ejecutivo, que lo escribe alguien, y las oportunidades, que §99 vuelve
-- a decidir una a una. Confirmado por Bosco (decisión 28a de
-- `docs/DECISIONES.md`).
create or replace function public.report_section_requires_judgement(p_section text)
returns boolean
language sql
immutable
as $$
  select p_section in ('executive_summary', 'opportunities');
$$;

revoke all on function public.report_section_requires_judgement(text) from public, anon;
grant execute on function public.report_section_requires_judgement(text) to authenticated;

-- Las secciones de un informe, en su orden. Son **las cinco de la maqueta
-- 10.04** —"Resumen ejecutivo · Operación · Rendimiento digital ·
-- Oportunidades · Anexos y evidencias"— más **Finanzas**, que esa maqueta
-- no dibuja porque dibuja un informe de operación, pero que §89 da como
-- una de las tres familias.
--
-- No dependen de la familia: la maqueta dibuja un informe con Operación y
-- Rendimiento digital a la vez. La familia dice de qué va el informe; las
-- secciones, qué lleva dentro.
create or replace function public.report_sections_catalogue()
returns text[]
language sql
immutable
as $$
  select array['executive_summary', 'operation', 'finance', 'digital', 'opportunities', 'annexes'];
$$;

revoke all on function public.report_sections_catalogue() from public, anon;
grant execute on function public.report_sections_catalogue() to authenticated;

-- Qué entra marcado al preparar: el resumen ejecutivo, la sección de su
-- familia y los anexos. Las oportunidades **nunca** entran solas (§99).
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
    when p_category = 'operation' and p_section = 'operation' then true
    when p_category = 'operation' and p_section = 'finance' then false
    when p_category = 'operation' and p_section = 'digital' then false
    when p_category = 'operation' and p_section = 'opportunities' then false
    when p_category = 'operation' and p_section = 'annexes' then true
    when p_category = 'finance' and p_section = 'executive_summary' then true
    when p_category = 'finance' and p_section = 'operation' then false
    when p_category = 'finance' and p_section = 'finance' then true
    when p_category = 'finance' and p_section = 'digital' then false
    when p_category = 'finance' and p_section = 'opportunities' then false
    when p_category = 'finance' and p_section = 'annexes' then true
    when p_category = 'digital' and p_section = 'executive_summary' then true
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

-- Los seis estados de §95 y quién mueve cada transición (RN-REP-08).
-- `editor` es quien gestiona la cartera; `approver`, quien además tiene
-- "Aprobar informes".
create or replace function public.report_transition_allowed(
  p_from text,
  p_to text,
  p_actor text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = 'preparing' and p_to = 'pending_review' then p_actor in ('editor', 'approver')
    -- De preparando a aprobado o a programado va quien aprueba. Que un
    -- informe con secciones de criterio no pueda programarse sin
    -- aprobación NO está en esta tabla: depende de las secciones y lo
    -- comprueba schedule_report().
    when p_from = 'preparing' and p_to in ('approved', 'scheduled', 'archived') then p_actor = 'approver'
    when p_from = 'pending_review' and p_to = 'preparing' then p_actor in ('editor', 'approver')
    when p_from = 'pending_review' and p_to in ('approved', 'archived') then p_actor = 'approver'
    -- Editar un informe aprobado lo devuelve a revisión (RN-REP-09).
    when p_from = 'approved' and p_to = 'pending_review' then p_actor in ('editor', 'approver')
    when p_from = 'approved' and p_to in ('scheduled', 'sent', 'archived') then p_actor = 'approver'
    -- §95 · si al llegar la fecha hay oportunidades pendientes, el envío
    -- se detiene y vuelve a revisión (RN-REP-10).
    when p_from = 'scheduled' and p_to in ('pending_review', 'approved', 'sent', 'archived') then p_actor = 'approver'
    -- Lo enviado no vuelve atrás: una corrección es una versión nueva.
    when p_from = 'sent' and p_to = 'archived' then p_actor = 'approver'
    else false
  end;
$$;

revoke all on function public.report_transition_allowed(text, text, text) from public, anon;
grant execute on function public.report_transition_allowed(text, text, text) to authenticated;

-- RN-REP-13 · qué estados alcanza el restaurante.
create or replace function public.report_is_visible_to_client(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('sent', 'archived');
$$;

revoke all on function public.report_is_visible_to_client(text) from public, anon;
grant execute on function public.report_is_visible_to_client(text) to authenticated;

-- ============================================================
-- 3 · Las tablas
-- ============================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  -- §89 · individual (con restaurante) o consolidado (sin él). Un
  -- consolidado no se comparte con ningún cliente: mezcla varios.
  establishment_id uuid references public.establishments (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  category text not null check (category in ('operation', 'finance', 'digital')),
  -- Lo escribe una persona, así que se guarda (no es texto de interfaz).
  name text not null check (length(btrim(name)) > 0),
  period_start date not null,
  period_end date not null,
  -- §93 · los ocho filtros, tal y como se aplicaron.
  filters jsonb not null default '{}'::jsonb,
  -- Los seis estados de §95.
  status text not null default 'preparing' check (status in (
    'preparing', 'pending_review', 'approved', 'scheduled', 'sent', 'archived'
  )),
  status_reason text,
  -- §93 · las salidas. El PDF siempre se puede descargar; esto es lo que
  -- se hace al llegar la fecha.
  delivery_channel text not null default 'none' check (delivery_channel in ('none', 'email')),
  include_csv boolean not null default false,
  scheduled_for timestamptz,
  -- §95 · "Cuotly avisa cuando se acerca la fecha programada": aquí queda
  -- que ya se avisó, para no avisar dos veces (CA-17).
  reminder_sent_at timestamptz,
  sent_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  archived_at timestamptz,
  -- CA-17 · aprobar, programar o enviar dos veces produce un solo efecto;
  -- crear el mismo informe dos veces, también.
  idempotency_key text,
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_period check (period_end >= period_start),
  constraint reports_scope check (establishment_id is not null or group_id is null),
  -- Un informe programado tiene fecha, y una fecha sin programación no
  -- significa nada.
  constraint reports_schedule check (status <> 'scheduled' or scheduled_for is not null)
);

comment on table public.reports is
  '§89 a §95 · un informe. Sin política de escritura: se crea, se edita, se
   aprueba, se programa, se envía y se archiva por función, y cada cosa
   audita. Lo que el restaurante ve son columnas concedidas una a una
   (P7): quién lo preparó o lo aprobó sale de audit_log.';

alter table public.reports enable row level security;

create index reports_space_idx on public.reports (space_id, status);
create index reports_establishment_idx on public.reports (establishment_id, status);
create index reports_scheduled_idx on public.reports (scheduled_for) where status = 'scheduled';
create unique index reports_idempotency_idx on public.reports (space_id, idempotency_key)
  where idempotency_key is not null;

-- RN-REP-01/13 · el equipo que gestiona la cartera, y el restaurante solo
-- lo enviado y solo si puede ver informes.
create policy reports_select on public.reports
for select
using (
  public.has_capability(space_id, 'manage_clients')
  or (
    establishment_id is not null
    and public.report_is_visible_to_client(status)
    and public.client_can_view_reports(establishment_id)
  )
);

-- P7 / CLAUDE.md · la fila la ve el restaurante cuando está enviada, pero
-- quién la preparó, la aprobó o la actualizó es identidad del equipo, y
-- eso RLS no lo filtra: lo filtra el privilegio de columna.
revoke select on public.reports from anon, authenticated;
grant select (id, space_id, establishment_id, group_id, category, name, period_start, period_end,
              filters, status, status_reason, delivery_channel, include_csv, scheduled_for,
              reminder_sent_at, sent_at, approved_at, archived_at, created_at, updated_at)
  on public.reports to authenticated;

create table public.report_sections (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  report_id uuid not null references public.reports (id) on delete cascade,
  section_key text not null,
  position integer not null check (position > 0),
  included boolean not null default true,
  -- §95.5 · "selecciona, edita y ordena": esto es lo que se edita. Lo
  -- escribe una persona; Cuotly no redacta nada (§93: sin IA).
  note text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (report_id, section_key)
);

comment on table public.report_sections is
  '§95 · las secciones del informe mientras se prepara: cuáles entran, en
   qué orden y con qué texto. La FILA es organización interna del equipo,
   así que el restaurante no la ve —como `tasks`, y a diferencia de
   `reports`, donde la fila acaba siendo suya y solo se le tapan las
   columnas de identidad (CLAUDE.md, bloqueante B2 de la cuarta revisión).
   Lo que el restaurante ve de las secciones es la foto que guarda la
   versión enviada.';

alter table public.report_sections enable row level security;

create index report_sections_report_idx on public.report_sections (report_id, position);

create policy report_sections_select on public.report_sections
for select
using (public.has_capability(space_id, 'manage_clients'));

create table public.report_versions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  report_id uuid not null references public.reports (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  -- Cifras, claves de sección y fechas. Ni una frase generada.
  snapshot jsonb not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles (id),
  unique (report_id, version_number)
);

comment on table public.report_versions is
  '§95 · "Cada versión se conserva". Libro inmutable: sin política de
   INSERT/UPDATE/DELETE, solo lo escribe generate_report_version(). Aquí
   viven las cifras congeladas, que es lo que hace cumplir §94: desconectar
   una fuente después no cambia un informe ya generado.';

alter table public.report_versions enable row level security;

create index report_versions_report_idx on public.report_versions (report_id, version_number desc);

-- El restaurante alcanza las versiones de un informe que puede ver. No
-- hace falta más filtro: un informe enviado es el que tiene versión
-- enviada, y las anteriores son su historia.
create policy report_versions_select on public.report_versions
for select
using (
  public.has_capability(space_id, 'manage_clients')
  or exists (
    select 1 from public.reports r
    where r.id = report_versions.report_id
      and r.establishment_id is not null
      and public.report_is_visible_to_client(r.status)
      and public.client_can_view_reports(r.establishment_id)
  )
);

revoke select on public.report_versions from anon, authenticated;
grant select (id, space_id, report_id, version_number, snapshot, generated_at)
  on public.report_versions to authenticated;

create table public.report_deliveries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  report_id uuid not null references public.reports (id) on delete cascade,
  version_id uuid not null references public.report_versions (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id),
  channel text not null check (channel in ('email', 'in_app')),
  sent_at timestamptz not null default now(),
  unique (version_id, recipient_id, channel)
);

comment on table public.report_deliveries is
  '§93 · a quién se envió qué versión y cuándo. Libro inmutable y del
   equipo: es la prueba de que el informe salió. El restaurante no lo lee
   —lo que a él le toca es el informe— y por eso aquí no hay privilegio de
   columna: se le deja fuera de la fila.';

alter table public.report_deliveries enable row level security;

create index report_deliveries_report_idx on public.report_deliveries (report_id, sent_at desc);

create policy report_deliveries_select on public.report_deliveries
for select
using (public.has_capability(space_id, 'manage_clients'));

-- ============================================================
-- 4 · Crear, editar y ordenar (§95.1 a §95.5)
-- ============================================================
create or replace function public.create_report_draft(
  p_space_id uuid,
  p_category text,
  p_name text,
  p_period_start date,
  p_period_end date,
  p_establishment_id uuid default null,
  p_group_id uuid default null,
  p_filters jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
  v_sections text[];
  v_section text;
  v_position integer := 0;
begin
  if not public.has_capability(p_space_id, 'manage_clients') then
    raise exception 'Solo quien gestiona la cartera prepara informes';
  end if;

  if p_category not in ('operation', 'finance', 'digital') then
    raise exception 'Familia de informe desconocida: %', p_category;
  end if;
  v_sections := public.report_sections_catalogue();

  if p_period_end < p_period_start then
    raise exception 'El periodo del informe está al revés';
  end if;

  if p_establishment_id is not null
     and public.establishment_space_id(p_establishment_id) <> p_space_id then
    raise exception 'Ese restaurante no es de este espacio';
  end if;

  -- CA-17 · pulsarlo dos veces devuelve el mismo borrador.
  if p_idempotency_key is not null then
    select id into v_report_id
    from public.reports
    where space_id = p_space_id and idempotency_key = p_idempotency_key;

    if v_report_id is not null then
      return v_report_id;
    end if;
  end if;

  insert into public.reports (
    space_id, establishment_id, group_id, category, name, period_start, period_end,
    filters, status, idempotency_key, created_by, updated_by
  )
  values (
    p_space_id, p_establishment_id, p_group_id, p_category, btrim(p_name),
    p_period_start, p_period_end, coalesce(p_filters, '{}'::jsonb), 'preparing',
    p_idempotency_key, auth.uid(), auth.uid()
  )
  returning id into v_report_id;

  foreach v_section in array v_sections loop
    v_position := v_position + 1;
    insert into public.report_sections (space_id, report_id, section_key, position, included, updated_by)
    values (
      p_space_id, v_report_id, v_section, v_position,
      -- El resumen ejecutivo, la sección de su familia y los anexos, que
      -- es lo que dibuja la maqueta 10.04. Requerir criterio no es entrar
      -- apagado: el resumen entra marcado y lo escribe quien revisa.
      public.report_section_default_included(p_category, v_section),
      auth.uid()
    );
  end loop;

  perform public.record_state_event(p_space_id, 'report', v_report_id, null, 'preparing', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (p_space_id, auth.uid(), 'report.created', 'report', v_report_id,
          jsonb_build_object('category', p_category, 'establishment_id', p_establishment_id,
                             'period_start', p_period_start, 'period_end', p_period_end));

  return v_report_id;
end;
$$;

revoke all on function public.create_report_draft(uuid, text, text, date, date, uuid, uuid, jsonb, text)
  from public, anon;
grant execute on function public.create_report_draft(uuid, text, text, date, date, uuid, uuid, jsonb, text)
  to authenticated;

-- §95.5 · "Selecciona, edita y ordena". Llega la lista entera: qué
-- secciones, en qué orden y con qué nota. Reordenar es esto mismo con la
-- lista en otro orden — no hay una segunda función de "subir/bajar" que
-- pueda dejar dos posiciones iguales.
create or replace function public.set_report_sections(
  p_report_id uuid,
  p_sections jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_status text;
  v_allowed text[];
  v_item jsonb;
  v_key text;
  v_position integer := 0;
begin
  select space_id, status into v_space_id, v_status
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No puedes editar los informes de este espacio';
  end if;

  if v_status in ('sent', 'archived') then
    -- Lo enviado no se edita: una corrección es una versión nueva de otro
    -- informe, no un cambio retroactivo de lo que el cliente ya leyó (P4).
    raise exception 'Un informe % no se edita', v_status;
  end if;

  -- Cualquier sección del catálogo vale para cualquier informe: la
  -- maqueta dibuja uno de operación con "Rendimiento digital" dentro.
  v_allowed := public.report_sections_catalogue();

  for v_item in select * from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb)) loop
    v_key := v_item ->> 'key';
    if not (v_key = any (v_allowed)) then
      raise exception 'La sección % no existe', v_key;
    end if;
    v_position := v_position + 1;

    update public.report_sections
    set position = v_position,
        included = coalesce((v_item ->> 'included')::boolean, included),
        note = case when v_item ? 'note' then nullif(btrim(v_item ->> 'note'), '') else note end,
        updated_by = auth.uid(),
        updated_at = now()
    where report_id = p_report_id and section_key = v_key;
  end loop;

  -- RN-REP-09 · editar un informe aprobado o programado lo devuelve a
  -- revisión: un informe aprobado es un texto concreto, no una carpeta
  -- que sigue cambiando.
  if v_status in ('approved', 'scheduled') then
    update public.reports
    set status = 'pending_review',
        status_reason = 'Se editaron las secciones después de aprobar',
        approved_at = null,
        approved_by = null,
        scheduled_for = null,
        reminder_sent_at = null,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_report_id;

    perform public.record_state_event(v_space_id, 'report', p_report_id, v_status, 'pending_review',
                                      'Se editaron las secciones después de aprobar');
  else
    update public.reports
    set updated_by = auth.uid(), updated_at = now()
    where id = p_report_id;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'report.sections_changed', 'report', p_report_id, p_sections);
end;
$$;

revoke all on function public.set_report_sections(uuid, jsonb) from public, anon;
grant execute on function public.set_report_sections(uuid, jsonb) to authenticated;

create or replace function public.rename_report(p_report_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_before text;
begin
  select space_id, name into v_space_id, v_before
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;
  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No puedes editar los informes de este espacio';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'El informe necesita un nombre';
  end if;

  update public.reports
  set name = btrim(p_name), updated_by = auth.uid(), updated_at = now()
  where id = p_report_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'report.renamed', 'report', p_report_id,
          jsonb_build_object('name', v_before), jsonb_build_object('name', btrim(p_name)));
end;
$$;

revoke all on function public.rename_report(uuid, text) from public, anon;
grant execute on function public.rename_report(uuid, text) to authenticated;

-- ============================================================
-- 5 · La versión (§95.1 y §95.6, RN-REP-12)
--
-- Quien calcula las cifras es `src/services/report-generation.ts` con
-- `src/core/reports.ts`, porque los plazos se miden con el reloj
-- contractual. Aquí llega la foto hecha y se guarda como versión nueva.
-- ============================================================
create or replace function public.generate_report_version(
  p_report_id uuid,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_status text;
  v_next integer;
  v_version_id uuid;
begin
  select space_id, status into v_space_id, v_status
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;

  -- Lo llama el servidor con service_role (la cola) o una persona que
  -- gestiona la cartera desde la pantalla. Nadie más.
  if auth.uid() is not null and not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No puedes generar informes de este espacio';
  end if;

  if v_status in ('sent', 'archived') then
    raise exception 'Un informe % no se regenera', v_status;
  end if;

  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'La versión de un informe necesita sus cifras';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
  from public.report_versions where report_id = p_report_id;

  insert into public.report_versions (space_id, report_id, version_number, snapshot, generated_by)
  values (v_space_id, p_report_id, v_next, p_snapshot, auth.uid())
  returning id into v_version_id;

  update public.reports
  set updated_by = auth.uid(), updated_at = now()
  where id = p_report_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'report.version_generated', 'report', p_report_id,
          jsonb_build_object('version_number', v_next));

  return v_version_id;
end;
$$;

comment on function public.generate_report_version(uuid, jsonb) is
  '§95 · "Cada versión se conserva". Regenerar AÑADE una versión; no pisa
   la anterior. Un informe enviado o archivado no se regenera: lo que el
   cliente leyó no cambia.';

revoke all on function public.generate_report_version(uuid, jsonb) from public, anon;
grant execute on function public.generate_report_version(uuid, jsonb) to authenticated;

-- ============================================================
-- 6 · Los estados (§95) y quién los mueve (RN-REP-08)
-- ============================================================
create or replace function public.report_actor_role(p_space_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- El proceso de la cola (service_role, sin sesión) actúa por la
    -- decisión que una persona ya tomó al programar el envío.
    when auth.uid() is null then 'approver'
    when public.has_capability(p_space_id, 'approve_reports') then 'approver'
    when public.has_capability(p_space_id, 'manage_clients') then 'editor'
    else null
  end;
$$;

revoke all on function public.report_actor_role(uuid) from public, anon, authenticated;

-- El cambio de estado, con su evento y su apunte. Idempotente: mover al
-- mismo estado dos veces no escribe dos apuntes (RN-DAT-09).
create or replace function public.set_report_status(
  p_report_id uuid,
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
  v_status text;
  v_actor text;
  v_sections_need_judgement boolean;
  v_versions integer;
begin
  select space_id, status into v_space_id, v_status
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;

  v_actor := public.report_actor_role(v_space_id);
  if v_actor is null then
    raise exception 'No tienes acceso a los informes de este espacio';
  end if;

  if v_status = p_status then
    return;
  end if;

  if not public.report_transition_allowed(v_status, p_status, v_actor) then
    raise exception 'No puedes pasar un informe de % a %', v_status, p_status;
  end if;

  if p_status in ('approved', 'scheduled', 'sent') then
    select count(*) into v_versions from public.report_versions where report_id = p_report_id;
    if v_versions = 0 then
      -- §95.1: primero los datos, luego la decisión. Aprobar un informe
      -- sin cifras sería aprobar un papel en blanco.
      raise exception 'Este informe todavía no tiene cifras generadas';
    end if;
  end if;

  if p_status = 'archived' and btrim(coalesce(p_reason, '')) = '' and v_status <> 'sent' then
    raise exception 'Archivar un informe sin enviar exige un motivo';
  end if;

  select exists (
    select 1 from public.report_sections s
    where s.report_id = p_report_id
      and s.included
      and public.report_section_requires_judgement(s.section_key)
  ) into v_sections_need_judgement;

  -- §95 · "Informes solo objetivos pueden enviarse automáticamente": de
  -- `preparing` a `scheduled` solo pasa el que no lleva criterio dentro.
  if v_status = 'preparing' and p_status = 'scheduled' and v_sections_need_judgement then
    raise exception 'Un informe con secciones que requieren criterio se aprueba antes de programarlo';
  end if;

  update public.reports
  set status = p_status,
      status_reason = p_reason,
      approved_at = case when p_status = 'approved' then now() else approved_at end,
      approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
      archived_at = case when p_status = 'archived' then now() else archived_at end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_report_id;

  perform public.record_state_event(v_space_id, 'report', p_report_id, v_status, p_status, p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'report.status_changed', 'report', p_report_id,
          jsonb_build_object('status', v_status), jsonb_build_object('status', p_status), p_reason);
end;
$$;

revoke all on function public.set_report_status(uuid, text, text) from public, anon;
grant execute on function public.set_report_status(uuid, text, text) to authenticated;

-- §95.7 · "Genera PDF, programa o envía". Programar es fijar la fecha y el
-- canal; el PDF y el CSV salen de la versión y no se guardan (RN-REP-06).
create or replace function public.schedule_report(
  p_report_id uuid,
  p_scheduled_for timestamptz,
  p_channel text default 'email',
  p_include_csv boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_status text;
begin
  select space_id, status into v_space_id, v_status
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;

  if public.report_actor_role(v_space_id) <> 'approver' then
    raise exception 'Solo quien puede aprobar informes programa un envío';
  end if;

  if p_scheduled_for is null then
    raise exception 'Programar un envío necesita una fecha';
  end if;

  if p_channel not in ('none', 'email') then
    raise exception 'Canal de envío desconocido: %', p_channel;
  end if;

  update public.reports
  set scheduled_for = p_scheduled_for,
      delivery_channel = p_channel,
      include_csv = coalesce(p_include_csv, false),
      -- La fecha nueva vuelve a avisar: el aviso es de ESTA fecha.
      reminder_sent_at = case when scheduled_for is distinct from p_scheduled_for then null else reminder_sent_at end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_report_id;

  if v_status <> 'scheduled' then
    perform public.set_report_status(p_report_id, 'scheduled', null);
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'report.scheduled', 'report', p_report_id,
          jsonb_build_object('scheduled_for', p_scheduled_for, 'channel', p_channel,
                             'include_csv', coalesce(p_include_csv, false)));
end;
$$;

revoke all on function public.schedule_report(uuid, timestamptz, text, boolean) from public, anon;
grant execute on function public.schedule_report(uuid, timestamptz, text, boolean) to authenticated;

-- ============================================================
-- 7 · El envío (§93, §95; RN-REP-10/11)
-- ============================================================

-- §95 · "Si hay oportunidades pendientes, no se envía hasta aprobación".
-- Pendiente es lo que sigue en conversación del equipo; descartada y
-- aprobada ya se decidieron. Solo cuenta si el informe incluye la sección
-- de oportunidades: uno que no habla de ellas sale igual.
create or replace function public.report_pending_opportunities(p_report_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Quién puede preguntarlo: quien gestiona la cartera de ese espacio.
    -- Sin esto, cualquiera con sesión sabría cuántas oportunidades
    -- pendientes tiene cualquier restaurante de cualquier espacio con una
    -- llamada RPC — que es exactamente lo que el barrido de funciones
    -- internas de `hito7_mensajes_archivos_finanzas.sql` busca.
    --
    -- El proceso de la cola (service_role, sin sesión) SÍ pregunta, y la
    -- condición empieza por ahí a propósito: si `auth.uid() is null`
    -- contara como "no puede", esta función devolvería 0 al envío
    -- automático y el freno de §95 —el único que importa de verdad, porque
    -- ahí no hay nadie mirando— no saltaría nunca.
    when auth.uid() is not null and not public.has_capability(
      (select r.space_id from public.reports r where r.id = p_report_id), 'manage_clients'
    ) then 0
    when not exists (
      select 1 from public.report_sections s
      where s.report_id = p_report_id and s.section_key = 'opportunities' and s.included
    ) then 0
    else (
      select count(*)::integer
      from public.opportunities o
      join public.reports r on r.id = p_report_id
      where o.establishment_id = r.establishment_id
        and o.status in ('detected', 'recommended', 'under_review')
        and (o.period_end is null or o.period_end >= r.period_start)
        and (o.period_start is null or o.period_start <= r.period_end)
    )
  end;
$$;

revoke all on function public.report_pending_opportunities(uuid) from public, anon;
grant execute on function public.report_pending_opportunities(uuid) to authenticated;

-- A quién va el correo programado (§93, RN-REP-11).
--
-- **Decidido por Bosco el 14/09/2026**: le llega a **todos los que
-- trabajan en ese restaurante, por los dos lados** —los del restaurante y
-- los de mantenimiento—. La primera versión lo mandaba solo al lado
-- cliente y a quien tuviera permiso; la segunda idea fue añadir una
-- dirección fija de Restavor, y se descartó por lo de siempre: Cuotly es
-- multiempresa, y una dirección escrita en el código mandaría los
-- informes de otro espacio al buzón de Restavor. Esto no tiene ese
-- problema porque **no hay ninguna dirección escrita**: los destinatarios
-- se calculan de quién trabaja ahí.
--
-- Un consolidado no tiene restaurante, así que no se manda a ningún
-- cliente —mezcla varios— y va al equipo que lo gestiona.
create or replace function public.report_recipients(p_report_id uuid)
returns table (recipient_id uuid, audience text)
language sql
stable
security definer
set search_path = public
as $$
  with report as (select * from public.reports where id = p_report_id)

  -- El restaurante: cualquier persona suya con el acceso vigente, sin
  -- distinguir rol (enmienda a §89).
  select em.user_id, 'client'::text
  from report r
  join public.establishment_memberships em on em.establishment_id = r.establishment_id
  where r.establishment_id is not null
    and em.revoked_at is null

  union

  -- Y su grupo, que es quien ve el consolidado y el detalle de lo suyo.
  select gm.user_id, 'client'::text
  from report r
  join public.establishments e on e.id = r.establishment_id
  join public.group_memberships gm on gm.group_id = e.group_id
  where r.establishment_id is not null
    and gm.revoked_at is null

  union

  -- Mantenimiento: los trabajadores autorizados en ESE restaurante
  -- (RN-ASG-01), que son los que "trabajan ahí".
  select we.user_id, 'staff'::text
  from report r
  join public.worker_establishments we on we.establishment_id = r.establishment_id
  where r.establishment_id is not null
    and we.revoked_at is null

  union

  -- Y quien lleva la cartera: propietario y administradores del espacio.
  -- Para un consolidado son los únicos, porque no hay restaurante.
  select sm.user_id, 'staff'::text
  from report r
  join public.space_memberships sm on sm.space_id = r.space_id
  where sm.status = 'active'
    and sm.role in ('owner', 'admin');
$$;

comment on function public.report_recipients(uuid) is
  '§93 · quién recibe el correo programado de un informe: todos los que
   trabajan en ese restaurante, por los dos lados —sus usuarios y su
   grupo, los trabajadores autorizados y quien lleva la cartera—, con el
   acceso vigente. Sin ninguna dirección escrita en el código: Cuotly es
   multiempresa. Un consolidado no se manda a ningún cliente —mezcla
   varios—, así que solo va al equipo. Reservada: devuelve identidades de
   los dos lados.';

revoke all on function public.report_recipients(uuid) from public, anon, authenticated;

-- El envío. Lo llama quien aprueba desde la pantalla ("Enviar ahora") o el
-- proceso de la cola al llegar la fecha. Las dos entradas pasan por la
-- misma comprobación de §95 y dejan el mismo rastro.
create or replace function public.send_report(p_report_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports;
  v_version_id uuid;
  v_pending integer;
  v_slug text;
  v_link text;
  v_recipient record;
  v_sent integer := 0;
begin
  select * into v_report from public.reports where id = p_report_id for update;

  if v_report.id is null then
    raise exception 'Informe no encontrado';
  end if;

  if public.report_actor_role(v_report.space_id) <> 'approver' then
    raise exception 'Solo quien puede aprobar informes lo envía';
  end if;

  -- CA-17 · enviar dos veces produce un solo efecto.
  if v_report.status = 'sent' then
    return 0;
  end if;

  select id into v_version_id
  from public.report_versions
  where report_id = p_report_id
  order by version_number desc
  limit 1;

  if v_version_id is null then
    raise exception 'Este informe todavía no tiene cifras generadas';
  end if;

  -- §95 · el freno de las oportunidades pendientes. Se comprueba AQUÍ y no
  -- al aprobar porque una oportunidad puede detectarse después.
  v_pending := public.report_pending_opportunities(p_report_id);
  if v_pending > 0 then
    update public.reports
    set status = 'pending_review',
        status_reason = 'Hay oportunidades pendientes de aprobar',
        updated_at = now()
    where id = p_report_id;

    perform public.record_state_event(v_report.space_id, 'report', p_report_id, v_report.status,
                                      'pending_review', 'Hay oportunidades pendientes de aprobar');

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
    values (v_report.space_id, auth.uid(), 'report.send_blocked', 'report', p_report_id,
            jsonb_build_object('pending_opportunities', v_pending),
            'Hay oportunidades pendientes de aprobar');

    return -1;
  end if;

  v_slug := public.space_slug(v_report.space_id);
  v_link := case
    when v_report.establishment_id is not null
      then '/espacios/' || v_slug || '/restaurantes/' || v_report.establishment_id::text || '/datos?seccion=informes'
    else '/espacios/' || v_slug || '/informes/' || p_report_id::text
  end;

  for v_recipient in select * from public.report_recipients(p_report_id) loop
    insert into public.report_deliveries (space_id, report_id, version_id, recipient_id, channel)
    values (v_report.space_id, p_report_id, v_version_id, v_recipient.recipient_id, 'email')
    on conflict (version_id, recipient_id, channel) do nothing;

    if found then
      v_sent := v_sent + 1;
    end if;

    perform public.emit_notification(
      v_report.space_id, v_recipient.recipient_id, 'report_sent', v_recipient.audience,
      'report', p_report_id, v_link,
      'report_sent:' || v_version_id::text || ':' || v_recipient.recipient_id::text,
      v_report.establishment_id,
      null, null,
      v_report.delivery_channel = 'email'
    );
  end loop;

  update public.reports
  set status = 'sent',
      sent_at = now(),
      status_reason = null,
      updated_at = now()
  where id = p_report_id;

  perform public.record_state_event(v_report.space_id, 'report', p_report_id, v_report.status, 'sent', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_report.space_id, auth.uid(), 'report.sent', 'report', p_report_id,
          jsonb_build_object('version_id', v_version_id, 'recipients', v_sent,
                             'channel', v_report.delivery_channel));

  return v_sent;
end;
$$;

comment on function public.send_report(uuid) is
  '§93/§95 · envía el informe: guarda a quién y qué versión, avisa y lo
   deja en "Enviado". Devuelve -1 y lo devuelve a revisión si hay
   oportunidades pendientes (RN-REP-10); 0 si ya estaba enviado (CA-17).';

revoke all on function public.send_report(uuid) from public, anon;
grant execute on function public.send_report(uuid) to authenticated;

-- §95 · "Cuotly avisa cuando se acerca la fecha programada": 24 h antes,
-- una sola vez por fecha (decisión 28b, confirmada por Bosco). Va a quien
-- puede pararlo.
create or replace function public.notify_report_schedule_due_soon(p_report_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports;
  v_link text;
  v_recipient uuid;
  v_sent integer := 0;
begin
  select * into v_report from public.reports where id = p_report_id for update;

  if v_report.id is null or v_report.status <> 'scheduled' or v_report.scheduled_for is null then
    return 0;
  end if;

  if v_report.reminder_sent_at is not null then
    return 0;
  end if;

  v_link := '/espacios/' || public.space_slug(v_report.space_id) || '/informes/' || p_report_id::text;

  for v_recipient in
    select sm.user_id
    from public.space_memberships sm
    where sm.space_id = v_report.space_id
      and sm.status = 'active'
      and (sm.role = 'owner' or (sm.role = 'admin' and sm.can_approve_reports))
  loop
    if public.emit_notification(
         v_report.space_id, v_recipient, 'report_schedule_due_soon', 'staff',
         'report', p_report_id, v_link,
         'report_schedule_due_soon:' || p_report_id::text || ':' || v_report.scheduled_for::text,
         v_report.establishment_id) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  update public.reports set reminder_sent_at = now() where id = p_report_id;

  return v_sent;
end;
$$;

revoke all on function public.notify_report_schedule_due_soon(uuid) from public, anon, authenticated;

-- Lo que el proceso de la cola reclama en cada tanda. Dos listas cortas y
-- separadas: la fecha ya llegó, o falta menos de lo que dura el aviso.
create or replace function public.reports_due_for_send(p_limit integer default 20)
returns table (report_id uuid, space_id uuid)
language sql
security definer
set search_path = public
as $$
  select id, space_id
  from public.reports
  where status = 'scheduled'
    and scheduled_for is not null
    and scheduled_for <= now()
  order by scheduled_for
  limit greatest(p_limit, 0);
$$;

revoke all on function public.reports_due_for_send(integer) from public, anon, authenticated;

create or replace function public.reports_due_for_reminder(p_limit integer default 20)
returns table (report_id uuid, space_id uuid)
language sql
security definer
set search_path = public
as $$
  select id, space_id
  from public.reports
  where status = 'scheduled'
    and scheduled_for is not null
    and reminder_sent_at is null
    and scheduled_for > now()
    and scheduled_for <= now() + interval '24 hours'
  order by scheduled_for
  limit greatest(p_limit, 0);
$$;

revoke all on function public.reports_due_for_reminder(integer) from public, anon, authenticated;

-- ============================================================
-- 8 · Los datos de un informe (§91, §89.2)
--
-- Estas dos funciones NO calculan indicadores: entregan las filas. El
-- reloj contractual está en `src/core/business-clock.ts` y la cuenta la
-- hace `src/core/reports.ts` (CLAUDE.md). Reservadas a `service_role`
-- porque devuelven el espacio entero de un tirón, sin pasar por RLS.
-- ============================================================
create or replace function public.report_operation_dataset(
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
    select
      (p_from::timestamptz) as from_at,
      ((p_to + 1)::timestamptz) as to_at
  ),
  reqs as (
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'establishment_id', r.establishment_id, 'state', r.state, 'created_at', r.created_at
    ) order by r.created_at) as rows
    from public.requests r, bounds b
    where r.space_id = p_space_id
      and (p_establishment_id is null or r.establishment_id = p_establishment_id)
      and r.created_at >= b.from_at and r.created_at < b.to_at
  ),
  job_rows as (
    select
      j.id, j.establishment_id, j.category, j.state, j.assigned_to, j.created_at,
      j.started_at, j.published_at, j.completed_at,
      (select s.plan_id from public.subscriptions s
        where s.establishment_id = j.establishment_id and s.kind = 'plan' and s.status = 'active'
        order by s.started_at desc limit 1) as plan_id,
      -- RN-COM-15 · el plazo de inicio con el que se ACEPTÓ, y solo si no
      -- lo hay, el del plan vigente: es el mismo coalesce de
      -- sla_sweep_counters(), y por la misma razón (un cambio de plan no
      -- reescribe hacia atrás lo ya aceptado).
      (select coalesce(rq.accepted_start_sla_hours, pl.start_sla_hours)
       from public.requests rq
       left join public.subscriptions su
         on su.establishment_id = j.establishment_id and su.kind = 'plan' and su.status = 'active'
       left join public.plans pl on pl.id = su.plan_id
       where rq.id = j.request_id) as start_sla_hours,
      coalesce((
        select jsonb_agg(jsonb_build_object('type', te.event_type, 'occurred_at', te.occurred_at)
                         order by te.occurred_at)
        from public.timer_events te
        where te.entity_type = 'job' and te.entity_id = j.id and te.counter_kind = 't2'
      ), '[]'::jsonb) as t2_events,
      coalesce((
        select jsonb_agg(jsonb_build_object('type', te.event_type, 'occurred_at', te.occurred_at)
                         order by te.occurred_at)
        from public.timer_events te
        where te.entity_type = 'job' and te.entity_id = j.id and te.counter_kind = 't3'
      ), '[]'::jsonb) as t3_events
    from public.jobs j, bounds b
    where j.space_id = p_space_id
      and (p_establishment_id is null or j.establishment_id = p_establishment_id)
      and j.created_at < b.to_at
      and (j.completed_at is null or j.completed_at >= b.from_at)
  ),
  jobs as (
    select jsonb_agg(to_jsonb(job_rows.*) order by job_rows.created_at) as rows from job_rows
  ),
  blocks as (
    select jsonb_agg(jsonb_build_object(
      'job_id', bl.job_id, 'started_at', bl.started_at, 'ended_at', bl.ended_at
    ) order by bl.started_at) as rows
    from public.blocks bl
    join public.jobs j on j.id = bl.job_id, bounds b
    where j.space_id = p_space_id
      and (p_establishment_id is null or j.establishment_id = p_establishment_id)
      and bl.started_at < b.to_at
      and (bl.ended_at is null or bl.ended_at >= b.from_at)
  ),
  consumption as (
    select jsonb_agg(jsonb_build_object(
      'establishment_id', ce.establishment_id, 'category', ce.category, 'amount', ce.amount
    )) as rows
    from public.consumption_entries ce, bounds b
    where ce.space_id = p_space_id
      and (p_establishment_id is null or ce.establishment_id = p_establishment_id)
      and ce.created_at >= b.from_at and ce.created_at < b.to_at
  ),
  menus as (
    select jsonb_agg(jsonb_build_object(
      'establishment_id', mp.establishment_id,
      'published_at', mp.published_at,
      -- §62 · la garantía se pidió antes del corte y se publicó a tiempo.
      'within_guarantee', mp.requested_before_cutoff
        and mp.published_at is not null
        and mp.published_at <= public.menu_publish_by_at(m.target_date, mp.space_id)
    )) as rows
    from public.menu_publications mp
    join public.menus m on m.id = mp.menu_id, bounds b
    where mp.space_id = p_space_id
      and (p_establishment_id is null or mp.establishment_id = p_establishment_id)
      and mp.published_at >= b.from_at and mp.published_at < b.to_at
  ),
  corrections as (
    select count(*)::integer as total
    from public.corrections c, bounds b
    where c.space_id = p_space_id
      and (p_establishment_id is null or c.establishment_id = p_establishment_id)
      and c.kind = 'client_request'
      and c.requested_at >= b.from_at and c.requested_at < b.to_at
  ),
  menu_updates as (
    select coalesce(sum(-mue.amount), 0)::integer as total
    from public.menu_update_entries mue, bounds b
    where mue.space_id = p_space_id
      and (p_establishment_id is null or mue.establishment_id = p_establishment_id)
      and mue.amount < 0
      and mue.created_at >= b.from_at and mue.created_at < b.to_at
  )
  select jsonb_build_object(
    'requests', coalesce((select rows from reqs), '[]'::jsonb),
    'jobs', coalesce((select rows from jobs), '[]'::jsonb),
    'blocks', coalesce((select rows from blocks), '[]'::jsonb),
    'consumption', coalesce((select rows from consumption), '[]'::jsonb),
    'menus', coalesce((select rows from menus), '[]'::jsonb),
    'corrections_requested', (select total from corrections),
    'menu_updates_used', (select total from menu_updates)
  );
$$;

comment on function public.report_operation_dataset(uuid, uuid, date, date) is
  '§91 · las FILAS que necesitan los diez indicadores, no los indicadores.
   El cumplimiento y los tiempos medios se miden con el reloj contractual,
   que vive en src/core/business-clock.ts: calcularlos aquí sería duplicar
   la lógica de dominio en SQL (CLAUDE.md).';

revoke all on function public.report_operation_dataset(uuid, uuid, date, date)
  from public, anon, authenticated;

-- §89.2 · finanzas: ingresos, cobros, impagos y renovaciones. Aquí sí
-- salen sumas, porque el dinero no pasa por el reloj laboral: el libro
-- financiero ya lleva el signo (RN-FIN) y sumarlo es leerlo.
create or replace function public.report_finance_dataset(
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
  charges as (
    select
      count(*)::integer as issued,
      coalesce(sum(c.base_cents), 0)::bigint as base_cents,
      coalesce(sum(c.total_cents), 0)::bigint as total_cents,
      coalesce(sum(public.charge_collected_cents(c.id)), 0)::bigint as collected_cents,
      coalesce(sum(public.charge_outstanding_cents(c.id)), 0)::bigint as outstanding_cents,
      count(*) filter (where public.charge_status(c.id) = 'overdue')::integer as overdue
    from public.charges c, bounds b
    where c.space_id = p_space_id
      and (p_establishment_id is null or c.establishment_id = p_establishment_id)
      and c.issued_at >= b.from_at and c.issued_at < b.to_at
  ),
  nonpayment as (
    select count(*)::integer as total
    from public.establishments e
    where e.space_id = p_space_id
      and (p_establishment_id is null or e.id = p_establishment_id)
      and public.establishment_has_overdue_debt(e.id)
  ),
  renewals as (
    -- §89.2 · "renovaciones": el ciclo de consumo es lo que renueva, y su
    -- final es la fecha (la misma que enseña upcoming_renewals()).
    select count(*)::integer as total
    from public.consumption_cycles cc
    join public.subscriptions s on s.id = cc.subscription_id
    where cc.space_id = p_space_id
      and (p_establishment_id is null or cc.establishment_id = p_establishment_id)
      and s.status = 'active'
      and cc.cycle_end::date between p_from and p_to
  )
  select jsonb_build_object(
    'charges_issued', (select issued from charges),
    'income_base_cents', (select base_cents from charges),
    'income_total_cents', (select total_cents from charges),
    'collected_cents', (select collected_cents from charges),
    'outstanding_cents', (select outstanding_cents from charges),
    'charges_overdue', (select overdue from charges),
    'establishments_with_debt', (select total from nonpayment),
    'renewals_due', (select total from renewals)
  );
$$;

revoke all on function public.report_finance_dataset(uuid, uuid, date, date)
  from public, anon, authenticated;

-- §90 · el informe personal del trabajador. Devuelve FILAS por la misma
-- razón: el cumplimiento se mide con el reloj. Quién puede pedirlo: la
-- persona sobre sí misma, y propietario y administradores sobre
-- cualquiera (§90: "las comparaciones solo las ven propietario y
-- administradores").
create or replace function public.worker_report_dataset(
  p_space_id uuid,
  p_user_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not (
    (p_user_id = auth.uid() and public.is_space_member(p_space_id))
    or public.has_capability(p_space_id, 'manage_space')
    or public.has_capability(p_space_id, 'assign_jobs')
  ) then
    raise exception 'No puedes ver el informe personal de otra persona';
  end if;

  select jsonb_build_object(
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id,
        'establishment_id', j.establishment_id,
        'category', j.category,
        'state', j.state,
        'assigned_to', j.assigned_to,
        'created_at', j.created_at,
        'started_at', j.started_at,
        'published_at', j.published_at,
        'completed_at', j.completed_at,
        'plan_id', (select s.plan_id from public.subscriptions s
                    where s.establishment_id = j.establishment_id and s.kind = 'plan'
                      and s.status = 'active' order by s.started_at desc limit 1),
        'start_sla_hours', (select coalesce(rq.accepted_start_sla_hours, pl.start_sla_hours)
                            from public.requests rq
                            left join public.subscriptions su
                              on su.establishment_id = j.establishment_id and su.kind = 'plan'
                                 and su.status = 'active'
                            left join public.plans pl on pl.id = su.plan_id
                            where rq.id = j.request_id),
        't2_events', coalesce((select jsonb_agg(jsonb_build_object('type', te.event_type, 'occurred_at', te.occurred_at)
                                                order by te.occurred_at)
                               from public.timer_events te
                               where te.entity_type = 'job' and te.entity_id = j.id and te.counter_kind = 't2'), '[]'::jsonb),
        't3_events', coalesce((select jsonb_agg(jsonb_build_object('type', te.event_type, 'occurred_at', te.occurred_at)
                                                order by te.occurred_at)
                               from public.timer_events te
                               where te.entity_type = 'job' and te.entity_id = j.id and te.counter_kind = 't3'), '[]'::jsonb)
      ) order by j.created_at)
      from public.jobs j
      where j.space_id = p_space_id
        and j.assigned_to = p_user_id
        and j.created_at < ((p_to + 1)::timestamptz)
        and (j.completed_at is null or j.completed_at >= (p_from::timestamptz))
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('job_id', bl.job_id, 'started_at', bl.started_at, 'ended_at', bl.ended_at))
      from public.blocks bl
      join public.jobs j on j.id = bl.job_id
      where j.space_id = p_space_id and j.assigned_to = p_user_id
        and bl.started_at < ((p_to + 1)::timestamptz)
    ), '[]'::jsonb),
    'corrections_requested', (
      select count(*)::integer
      from public.corrections c
      join public.jobs j on j.id = c.job_id
      where j.space_id = p_space_id and j.assigned_to = p_user_id
        and c.kind = 'client_request'
        and c.requested_at >= (p_from::timestamptz) and c.requested_at < ((p_to + 1)::timestamptz)
    ),
    -- §90 · "puntos históricos realizados separados de carga actual".
    'current_load_points', public.worker_active_load_points(p_space_id, p_user_id),
    'historical_points', coalesce((
      select sum(public.job_load_points(j.category))::integer
      from public.jobs j
      where j.space_id = p_space_id and j.assigned_to = p_user_id
        and j.state in ('published', 'completed')
        and j.published_at >= (p_from::timestamptz) and j.published_at < ((p_to + 1)::timestamptz)
    ), 0)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.worker_report_dataset(uuid, uuid, date, date) is
  '§90 · las filas del informe personal. Sin finanzas, como manda §90. El
   trabajador solo puede pedir el suyo; propietario y administradores, el
   de cualquiera.';

revoke all on function public.worker_report_dataset(uuid, uuid, date, date) from public, anon;
grant execute on function public.worker_report_dataset(uuid, uuid, date, date) to authenticated;

-- ============================================================
-- 9 · Eventos de estado, avisos y auditoría
-- ============================================================

-- §95 · los cambios de estado van al libro de siempre, con una entidad
-- más. El restaurante no los ve: quién aprobó o programó un informe es
-- organización interna (P7); lo que él ve es el informe enviado.
--
-- Se reescribe la política ENTERA porque hay que copiar la VIGENTE (la de
-- la migración 84) y añadirle una rama. Las dos trampas de siempre: la
-- rama de `task` lleva `is_space_member(space_id)` además de
-- `can_read_task()` —sin eso el restaurante alcanza los eventos de las
-- tareas internas y con ellos `actor_id`—, y `establishment` no tiene
-- rama: el restaurante ve el motivo de su estado por la vista que le tapa
-- el actor, no por la tabla base.
alter table public.state_events drop constraint state_events_entity_type_check;
alter table public.state_events add constraint state_events_entity_type_check
  check (entity_type in ('job', 'task', 'establishment', 'opportunity', 'report'));

drop policy state_events_select on public.state_events;

create policy state_events_select on public.state_events
for select
using (
  public.has_capability(space_id, 'assign_jobs')
  or (entity_type = 'job' and public.can_read_job(entity_id) and public.is_space_member(space_id))
  or (entity_type = 'task' and public.is_space_member(space_id) and public.can_read_task(entity_id))
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
  -- §95 · el recorrido de un informe lo ve quien gestiona la cartera. El
  -- trabajador no: §89 no le da los informes de un restaurante.
  or (entity_type = 'report' and public.has_capability(space_id, 'manage_clients'))
);

-- Los dos avisos que pide la maestra, ni uno más (§93 y §95).
alter table public.notifications drop constraint notifications_event_type_check;

alter table public.notifications add constraint notifications_event_type_check check (event_type in (
  'request_submitted', 'job_unassigned', 'job_assigned', 'job_started', 'job_published',
  'correction_requested', 'job_reassignment_requested', 'task_reassignment_requested',
  'terms_version_published',
  'menu_publication_requested', 'menu_assigned', 'menu_needs_information', 'menu_published',
  'menu_publication_error', 'menu_not_prepared_reminder', 'menu_publication_overdue',
  'quote_sent', 'quote_accepted', 'quote_rejected',
  'integration_sync_failed', 'integration_reauthorization_required',
  -- Hito 16 · §95 avisa cuando se acerca la fecha programada, y §93 manda
  -- el correo programado. Sin paréntesis en este comentario a propósito:
  -- `listas-compartidas.test.ts` lee esta lista con una expresión que se
  -- corta en el primer cierre, y un paréntesis aquí le escondería la mitad
  -- del catálogo sin que fallara nada.
  'report_schedule_due_soon', 'report_sent',
  'consumption_threshold_80', 'consumption_threshold_100',
  't2_threshold_50', 't2_threshold_80', 't2_threshold_100',
  't2_critical_alert', 't2_reassignment_suggestion',
  't3_threshold_75', 't3_threshold_90', 't3_threshold_100',
  'establishment_paused_nonpayment', 'establishment_suspended_nonpayment',
  'establishment_reactivated',
  'absence_requested', 'absence_decided', 'absence_uncovered_jobs'
));

alter table public.notifications drop constraint notifications_entity_type_check;

alter table public.notifications add constraint notifications_entity_type_check check (entity_type in (
  'request', 'job', 'task', 'establishment', 'charge', 'absence', 'menu', 'quote', 'integration', 'report'
));

-- §21.2 · la familia `report` es de la cartera, como `establishment` y
-- `opportunity`.
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
    when 'opportunity' then 'manage_clients'
    -- Hito 16 · quién preparó, aprobó, programó o envió un informe lo ve
    -- quien gestiona la cartera.
    when 'report' then 'manage_clients'
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
    when p_entity_type = 'report' then exists (select 1 from public.reports r where r.id = p_entity_id)
    else false
  end;
$$;

revoke all on function public.audit_entity_is_visible(text, uuid) from public, anon;
grant execute on function public.audit_entity_is_visible(text, uuid) to authenticated;
