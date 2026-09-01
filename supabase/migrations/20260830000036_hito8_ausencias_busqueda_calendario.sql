-- Hito 8, segunda parte: ausencias (HU-30, HU-31), cola de trabajos
-- programados, las funciones del centro de notificaciones (HU-34), la
-- búsqueda global (HU-33) y el calendario operativo.
--
-- Va en un archivo aparte y no dentro de `20260830000035_...` porque
-- CLAUDE.md es tajante: "Cada migración de base de datos es un archivo
-- nuevo y versionado. Nunca modifiques una migración existente". La 35 ya
-- estaba en el árbol y aplicada en local y en CI, así que se completa
-- desde aquí en vez de reescribirla.

-- ============================================================
-- HU-30 / HU-31 · Ausencias.
--
-- Principio P7 del PRD: la organización interna del equipo no es del
-- cliente. Una ausencia no se tapa por columna como en `messages`: el
-- restaurante queda fuera de la FILA, igual que en `assignments` y
-- `tasks` (bloqueante B2 de la cuarta revisión).
-- ============================================================
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text,
  state text not null default 'requested'
    check (state in ('requested', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index absences_space_idx on public.absences (space_id, starts_on);
create index absences_user_idx on public.absences (user_id, starts_on);

comment on table public.absences is
  'HU-30/HU-31 y RN-ASG-12. Organización interna del equipo: el cliente no
   ve la fila (P7). No se borra ninguna: se cancela (CLAUDE.md MUST NOT).';

alter table public.absences enable row level security;

create policy absences_select on public.absences
for select
using (public.is_space_member(space_id));

-- ============================================================
-- Cola de trabajos programados.
--
-- El ROADMAP dejó escrito que `generate_monthly_charge()` y
-- `evaluate_establishment_dunning()` existen pero "no se disparan solas",
-- y que la cola pertenece a este hito. RN-FIN-01 y RN-FIN-10/11 hablan de
-- que ocurra automáticamente.
--
-- Idempotencia por `dedupe_key`: encolar dos veces el mismo trabajo para
-- el mismo día no lo ejecuta dos veces (CA-17).
-- ============================================================
create table public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  -- `not null`: los tres tipos de trabajo son por espacio (la
  -- mensualidad, el impago y los plazos lo son siempre), así que no hay
  -- ningún caso legítimo de fila global. Dejarlo opcional rompía la
  -- invariante de CLAUDE.md y lo cazó el barrido del Hito 7.
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind text not null check (kind in ('monthly_charges', 'dunning_sweep', 'sla_sweep')),
  run_after timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (dedupe_key)
);

create index scheduled_jobs_pending_idx
  on public.scheduled_jobs (run_after) where status = 'pending';

alter table public.scheduled_jobs enable row level security;

create policy scheduled_jobs_select on public.scheduled_jobs
for select
using (public.has_capability(space_id, 'manage_space'));

comment on table public.scheduled_jobs is
  'Cola de lo que debe ocurrir solo (RN-FIN-01, RN-FIN-10/11). La escribe
   y la consume `service_role` desde src/services/queue-runner.ts; la
   aplicación solo la lee para diagnosticar.';

-- ============================================================
-- §18 · Emitir un aviso.
--
-- Interna, reservada a quien ya comprobó permisos: la llaman las
-- funciones de negocio y el proceso de cola. Hace tres cosas en la misma
-- transacción que la operación que la origina —insertar el aviso, mirar
-- la preferencia y encolar el correo— y ninguna toca la red. Por eso
-- CA-18 y RN-NOT-05 se cumplen: lo que puede fallar (Resend) ocurre
-- después y fuera, contra `notification_deliveries`.
--
-- RN-NOT-01 ("no se avisa a trabajadores que no estén asignados") no se
-- comprueba aquí: se cumple eligiendo bien los destinatarios en
-- `notify_job_event()`, más abajo, que es quien sabe quién está asignado.
-- ============================================================
create or replace function public.emit_notification(
  p_space_id uuid,
  p_recipient_id uuid,
  p_event_type text,
  p_audience text,
  p_entity_type text,
  p_entity_id uuid,
  p_deep_link text,
  p_dedupe_key text,
  p_establishment_id uuid default null,
  p_threshold_percent integer default null,
  p_amount_cents bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
  v_email_enabled boolean;
  v_in_app_enabled boolean;
  v_mandatory boolean := public.notification_event_is_mandatory(p_event_type);
begin
  -- RN-NOT-02/03: la ausencia de fila significa "todo activado", y los
  -- obligatorios ignoran la preferencia aunque exista.
  select coalesce(np.in_app, true), coalesce(np.email, true)
  into v_in_app_enabled, v_email_enabled
  from (select 1) z
  left join public.notification_preferences np
    on np.profile_id = p_recipient_id
   and np.space_id = p_space_id
   and np.event_type = p_event_type;

  if not v_mandatory and not coalesce(v_in_app_enabled, true) then
    return null;
  end if;

  insert into public.notifications (
    space_id, recipient_id, event_type, audience, entity_type, entity_id,
    establishment_id, deep_link, threshold_percent, amount_cents, dedupe_key
  ) values (
    p_space_id, p_recipient_id, p_event_type, p_audience, p_entity_type, p_entity_id,
    p_establishment_id, p_deep_link, p_threshold_percent, p_amount_cents, p_dedupe_key
  )
  on conflict (recipient_id, dedupe_key) do nothing
  returning id into v_notification_id;

  -- CA-17: la segunda llamada no crea nada y tampoco vuelve a encolar.
  if v_notification_id is null then
    return null;
  end if;

  if v_mandatory or coalesce(v_email_enabled, true) then
    insert into public.notification_deliveries (space_id, notification_id, channel)
    values (p_space_id, v_notification_id, 'email')
    on conflict (notification_id, channel) do nothing;
  end if;

  return v_notification_id;
end;
$$;

revoke all on function public.emit_notification(uuid, uuid, text, text, text, uuid, text, text, uuid, integer, bigint)
  from public, anon, authenticated;

-- HU-34 · Marcar como leído. No hay política de UPDATE en `notifications`
-- a propósito: esta es la única puerta, y comprueba el destinatario.
create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
begin
  select recipient_id into v_recipient
  from public.notifications where id = p_notification_id;

  if v_recipient is null then
    raise exception 'Aviso no encontrado';
  end if;

  if v_recipient <> auth.uid() then
    raise exception 'Solo puedes marcar como leídos tus propios avisos';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id;
end;
$$;

-- RN-NOT-02/03 · Cambiar una preferencia. Los obligatorios se rechazan.
create or replace function public.set_notification_preference(
  p_space_id uuid,
  p_event_type text,
  p_in_app boolean,
  p_email boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'No perteneces a este espacio';
  end if;

  -- RN-NOT-03: "seguridad, pérdida de acceso, impagos graves y
  -- vencimientos críticos no pueden desactivarse dentro de Cuotly".
  if public.notification_event_is_mandatory(p_event_type)
     and (p_in_app is not true or p_email is not true) then
    raise exception 'Este aviso no se puede desactivar: es un vencimiento crítico o un impago grave';
  end if;

  insert into public.notification_preferences (space_id, profile_id, event_type, in_app, email)
  values (p_space_id, auth.uid(), p_event_type, p_in_app, p_email)
  on conflict (profile_id, space_id, event_type)
  do update set in_app = excluded.in_app, email = excluded.email, updated_at = now();
end;
$$;

-- ============================================================
-- HU-30 · Pedir una ausencia. La pide quien realiza trabajos, sin
-- capacidad global: comprobar `perform_jobs` aquí basta y evita inventar
-- una capacidad "pedir ausencia" que el PRD no menciona.
-- ============================================================
create or replace function public.request_absence(
  p_space_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_absence_id uuid;
  v_admin record;
begin
  if not public.has_capability(p_space_id, 'perform_jobs') then
    raise exception 'Solo quien realiza trabajos puede pedir una ausencia';
  end if;

  if p_ends_on < p_starts_on then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio';
  end if;

  insert into public.absences (space_id, user_id, starts_on, ends_on, reason)
  values (p_space_id, auth.uid(), p_starts_on, p_ends_on, p_reason)
  returning id into v_absence_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (p_space_id, auth.uid(), 'absence.requested', 'absence', v_absence_id,
          jsonb_build_object('starts_on', p_starts_on, 'ends_on', p_ends_on));

  -- HU-31: quien decide se entera. RN-NOT-01 no aplica —no son
  -- trabajadores sin asignar, son quienes aprueban.
  for v_admin in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = p_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
  loop
    perform public.emit_notification(
      p_space_id, v_admin.user_id, 'absence_requested', 'staff', 'absence', v_absence_id,
      '/espacios/' || (select slug from public.spaces where id = p_space_id) || '/calendario',
      'absence_requested:' || v_absence_id::text
    );
  end loop;

  return v_absence_id;
end;
$$;

-- HU-31 · Aprobar o rechazar. Capacidad `manage_absences` (migración 35).
create or replace function public.decide_absence(
  p_absence_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_user_id uuid;
  v_state text;
  v_slug text;
begin
  select space_id, user_id, state into v_space_id, v_user_id, v_state
  from public.absences where id = p_absence_id for update;

  if v_space_id is null then
    raise exception 'Ausencia no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_absences') then
    raise exception 'Solo el propietario o un administrador pueden decidir una ausencia';
  end if;

  if v_state <> 'requested' then
    return; -- CA-17: decidir dos veces produce un único efecto.
  end if;

  update public.absences
  set state = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = p_note
  where id = p_absence_id;

  select slug into v_slug from public.spaces where id = v_space_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'absence.decided', 'absence', p_absence_id,
          jsonb_build_object('state', 'requested'),
          jsonb_build_object('state', case when p_approve then 'approved' else 'rejected' end), p_note);

  perform public.emit_notification(
    v_space_id, v_user_id, 'absence_decided', 'staff', 'absence', p_absence_id,
    '/espacios/' || v_slug || '/calendario',
    'absence_decided:' || p_absence_id::text
  );
end;
$$;

-- HU-31 · "…y ver qué trabajos quedan sin cobertura". Los trabajos vivos
-- del ausente que caen dentro de las fechas de una ausencia aprobada.
create or replace function public.uncovered_jobs_for_absence(p_absence_id uuid)
returns table (job_id uuid, code text, state text, establishment_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_user_id uuid;
begin
  select a.space_id, a.user_id into v_space_id, v_user_id
  from public.absences a where a.id = p_absence_id;

  if v_space_id is null or not public.has_capability(v_space_id, 'manage_absences') then
    raise exception 'No tienes permiso para ver la cobertura de esta ausencia';
  end if;

  return query
  select j.id, j.code, j.state, e.name
  from public.jobs j
  join public.establishments e on e.id = j.establishment_id
  where j.assigned_to = v_user_id
    and j.space_id = v_space_id
    and j.state in ('assigned', 'in_progress', 'blocked_by_client', 'authorized_pause')
  order by j.code;
end;
$$;

-- ============================================================
-- HU-33 / PRD §20.5 · Búsqueda global.
--
-- `SECURITY INVOKER` a propósito (es el modo por defecto, y aquí importa
-- que lo sea): "nunca devuelve resultados a los que el usuario no tenga
-- acceso — el filtrado ocurre en servidor". La forma de garantizarlo no
-- es reescribir aquí las reglas de permisos —eso sería una segunda copia
-- que se desincroniza— sino ejecutar la consulta con los privilegios de
-- quien pregunta y dejar que RLS haga lo mismo que hace en el resto de la
-- aplicación. Si mañana cambia una política, la búsqueda cambia con ella
-- sin tocar este archivo.
--
-- Cada rama enumera sus columnas. Ninguna toca una columna de identidad:
-- sobre `messages`, `files` o `payments` un `select *` devolvería 403
-- (CLAUDE.md, privilegios de columna), y aunque no lo devolviera, el
-- restaurante no puede ver quién del equipo hizo qué.
--
-- Devuelve el `state` en crudo, sin traducir: quien lo pinta usa el mismo
-- diccionario que el resto de la aplicación (`src/i18n/es.ts`), que es lo
-- que sostiene CA-21 —"cada entidad y cada estado se llama igual en
-- escritorio, móvil, correo, PDF e historial"—. Traducir aquí sería crear
-- un segundo juego de nombres.
-- ============================================================
-- El slug del espacio, para construir el enlace de cada resultado.
--
-- Hace falta una función y no una unión con `public.spaces`:
-- `spaces_select` exige ser MIEMBRO del espacio, y el restaurante no lo es
-- —está en `establishment_memberships`—, así que uniendo con esa tabla la
-- búsqueda le devolvía cero resultados incluso sobre su propio
-- restaurante. Lo detectó el test de HU-33, no la lectura del código.
--
-- El slug no es un dato sensible: es el segmento de URL por el que el
-- restaurante ya navega. Se revoca a `anon`, que no navega a ninguna parte.
create or replace function public.space_slug(p_space_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select slug from public.spaces where id = p_space_id;
$$;

revoke all on function public.space_slug(uuid) from public, anon;

create or replace function public.global_search(p_query text, p_limit integer default 20)
returns table (
  kind text,
  id uuid,
  title text,
  subtitle text,
  state text,
  deep_link text
)
language sql
stable
set search_path = public
as $$
  with q as (select '%' || btrim(coalesce(p_query, '')) || '%' as pattern,
                    btrim(coalesce(p_query, '')) as raw)
  select * from (
    select 'establishment'::text, e.id, e.name, e.code, e.status,
           '/espacios/' || public.space_slug(e.space_id) || '/restaurantes/' || e.id::text
    from public.establishments e, q
    where q.raw <> '' and (e.name ilike q.pattern or e.code ilike q.pattern)

    union all
    select 'group', g.id, g.name, null, null,
           '/espacios/' || public.space_slug(g.space_id) || '/restaurantes'
    from public.groups g, q
    where q.raw <> '' and g.name ilike q.pattern

    union all
    select 'request', r.id, r.code, r.description, r.state,
           '/espacios/' || public.space_slug(r.space_id) || '/solicitudes/' || r.id::text
    from public.requests r, q
    where q.raw <> '' and (r.code ilike q.pattern or r.description ilike q.pattern)

    union all
    select 'job', j.id, j.code, j.category, j.state,
           '/espacios/' || public.space_slug(j.space_id) || '/trabajos/' || j.id::text
    from public.jobs j, q
    where q.raw <> '' and (j.code ilike q.pattern or j.category ilike q.pattern)

    union all
    select 'task', t.id, t.title, t.description, t.state,
           '/espacios/' || public.space_slug(t.space_id) || '/tareas/' || t.id::text
    from public.tasks t, q
    where q.raw <> '' and (t.title ilike q.pattern or t.description ilike q.pattern)

    union all
    select 'person', p.id, coalesce(p.full_name, p.email), p.email, null,
           '/espacios'
    from public.profiles p, q
    where q.raw <> '' and (p.full_name ilike q.pattern or p.email ilike q.pattern)

    union all
    select 'plan', pl.id, pl.name, null, null,
           '/espacios/' || public.space_slug(pl.space_id) || '/planes'
    from public.plans pl, q
    where q.raw <> '' and pl.name ilike q.pattern

    union all
    select 'charge', c.id, c.concept, e.name, public.charge_status(c.id),
           '/espacios/' || public.space_slug(c.space_id) || '/finanzas'
    from public.charges c
   
    join public.establishments e on e.id = c.establishment_id, q
    where q.raw <> '' and (c.concept ilike q.pattern or e.name ilike q.pattern)

    union all
    select 'file', f.id, f.name, f.category, null,
           '/espacios/' || public.space_slug(f.space_id) || '/archivos'
    from public.files f, q
    where q.raw <> '' and f.name ilike q.pattern
  ) as resultados(kind, id, title, subtitle, state, deep_link)
  order by kind, title
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

comment on function public.global_search(text, integer) is
  'HU-33 y PRD §20.5. SECURITY INVOKER: el filtrado lo hace RLS con la
   identidad de quien pregunta, no una lista de permisos escrita aquí.';

-- ============================================================
-- Calendario operativo (ROADMAP: "eventos automáticos y ausencias").
--
-- No hay tabla de eventos: se derivan de lo que ya existe. Guardar un
-- evento automático sería un estado derivado duplicado, que es justo lo
-- que RN-DAT-05 prohíbe — y dos sitios donde el mismo día podría decir
-- cosas distintas. También es `SECURITY INVOKER`, por lo mismo que la
-- búsqueda.
-- ============================================================
create or replace function public.space_calendar(
  p_space_id uuid,
  p_from date,
  p_to date
)
returns table (
  kind text,
  event_date date,
  title text,
  entity_type text,
  entity_id uuid,
  state text
)
language sql
stable
set search_path = public
as $$
  select 'holiday'::text, h.holiday_date, h.name, 'holiday'::text, h.id, null::text
  from public.holidays h
  where h.space_id = p_space_id and h.holiday_date between p_from and p_to

  union all
  -- Una ausencia aprobada o pendiente ocupa todos sus días.
  select 'absence', d::date, coalesce(a.reason, ''), 'absence', a.id, a.state
  from public.absences a
  cross join lateral generate_series(a.starts_on, a.ends_on, interval '1 day') d
  where a.space_id = p_space_id
    and a.state in ('requested', 'approved')
    and d::date between p_from and p_to

  union all
  -- Vencimiento de la ventana de corrección de un trabajo publicado
  -- (RN-COR-02): es la fecha que al equipo le importa tener a la vista.
  select 'correction_window', j.correction_window_ends_at::date, j.code, 'job', j.id, j.state
  from public.jobs j
  where j.space_id = p_space_id
    and j.correction_window_ends_at is not null
    and j.correction_window_ends_at::date between p_from and p_to

  union all
  -- Vencimiento de un cobro (RN-FIN-10/11).
  select 'charge_due', c.due_at::date, c.concept, 'charge', c.id, public.charge_status(c.id)
  from public.charges c
  where c.space_id = p_space_id and c.due_at::date between p_from and p_to

  order by 2, 1;
$$;

comment on function public.space_calendar(uuid, date, date) is
  'Calendario operativo del espacio. Los eventos se DERIVAN (RN-DAT-05):
   no hay tabla de eventos que pudiera discrepar de los datos.';
