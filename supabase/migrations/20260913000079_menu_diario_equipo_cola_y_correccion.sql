-- Fase 2 · Hito 11 · Menú Diario: la cola del equipo, el recordatorio de
-- las 20:00, el aviso de las 08:00 y la corrección mínima (RN-COR-10).
--
-- La 77 dejó el flujo entero del equipo como funciones (asignar, pedir
-- información, marcar publicado, error, devolver) y la 78 la descarga que
-- pone "Listo para publicar". Lo que faltaba para que el equipo TRABAJE
-- desde una pantalla es lo que trae esta migración:
--
--   1 · **Los candidatos con comprobación** (`list_menu_candidates()`),
--       hermana de `list_job_candidates()`: exige `assign_jobs`, devuelve
--       carga y menús en curso, y su orden es el de RN-ASG-02/06 que se
--       puede calcular en SQL. `menu_candidate_ids()` sigue interna.
--   2 · **La cola** (`team_menu_queue()`): lo que el equipo tiene entre
--       manos, con el corte y la garantía calculados en el servidor
--       (RN-MEN-07, RN-DAT-05) y ordenable por fecha objetivo y hora de
--       corte. Las filas las filtra `can_read_menu_establishment()`, la
--       misma función que las políticas de RLS: un trabajador ve los
--       menús de sus restaurantes autorizados y nada más. Quién está
--       asignado se devuelve con el mismo criterio que la política de
--       `menu_publications` (quien gestiona, o el propio asignado).
--   3 · **El barrido de Menú Diario** (`run_daily_menu_sweep()`), tipo
--       nuevo de `scheduled_jobs`. RN-MEN-08: a las 20:00 se recuerda al
--       propietario y a los Editores si no hay menú preparado para
--       mañana. Y el aviso al equipo de las publicaciones garantizadas
--       (pedidas antes del corte y sin versión tardía, RN-MEN-07) que a
--       las 08:00 siguen sin publicar (§62: la garantía incumplida es lo
--       primero que hay que ver por la mañana). Las dos
--       horas se miran en la zona del espacio (RN-CLK-06) y el barrido no
--       depende de la cadencia del cron: decide "ya son las 20:00 de hoy"
--       y la clave de deduplicación lleva la fecha, así que da igual si
--       corre a las 20:00, a las 23:00 o dos veces (CA-17). Recibe la hora
--       como parámetro para que la suite lo pruebe con la hora fija.
--   4 · **La corrección mínima de Menú Diario** (`menu_corrections`).
--       RN-COR-10: existe, pero "no se garantiza su ejecución si la
--       edición o la petición de cambio llega después de las 21:00 del
--       día anterior". Se aplican las reglas de §13 que tienen sentido en
--       un menú: una sola por publicación (RN-COR-01, índice único
--       parcial), la ventana posterior a la publicación (RN-COR-02), el
--       error del equipo se corrige sin consumir nada (RN-COR-07,
--       `kind = 'team_error'`), la hace el trabajador asignado o quien
--       gestiona (RN-COR-06). Un menú publicado no se edita (RN-MEN-03):
--       la corrección es una petición con texto que el equipo aplica en
--       LandingSite y marca hecha; el menú sigue `published` y el
--       historial lo cuenta con dos eventos.
--   5 · **Los menús en la búsqueda global** (§20.5): por nombre del menú
--       o del restaurante, con RLS, como el resto de entidades.
--
-- **Sobre la ventana de la corrección, dicho para que Bosco lo confirme.**
-- RN-COR-02 la mide en 72 h laborables con el reloj contractual. Menú
-- Diario tiene su propio calendario y opera todos los días del año,
-- festivos incluidos (RN-CLK-09, §62), así que en ese calendario 72 h
-- laborables son 72 h de reloj: es lo que se aplica aquí
-- (`menu_correction_window_ends_at()`), con la salvedad de las 21:00 de
-- RN-COR-10 calculada aparte. No es un umbral nuevo: es la regla que ya
-- existe, aplicada con el calendario que la maestra le da al servicio.
--
-- Se comprueba con `supabase/tests/menu_diario_equipo_cola_y_correccion.sql`.

-- ============================================================
-- 1 · Los candidatos, con comprobación (RN-ASG-02/06, RN-ASG-17)
-- ============================================================
create or replace function public.list_menu_candidates(p_menu_id uuid)
returns table (
  worker_id uuid,
  active_load_points integer,
  active_menu_count integer,
  last_assigned_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select m.space_id into v_space_id from public.menus m where m.id = p_menu_id;

  if v_space_id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para ver los candidatos de este menú';
  end if;

  return query
  select
    c.user_id,
    public.worker_active_load_points(v_space_id, c.user_id),
    (
      select count(*)::integer from public.menu_publications p
      where p.space_id = v_space_id and p.assigned_to = c.user_id
        and p.published_at is null and p.cancelled_at is null
    ),
    (
      select max(p.assigned_at) from public.menu_publications p
      where p.space_id = v_space_id and p.assigned_to = c.user_id
    )
  from public.menu_candidate_ids(p_menu_id) as c(user_id)
  order by 2, 3, 4 nulls first, 1;
end;
$$;

comment on function public.list_menu_candidates(uuid) is
  'Hito 11 · los candidatos a publicar un menú, para la pantalla de
   asignar: exige assign_jobs (RN-ASG-17), y el orden reproduce en SQL los
   criterios de desempate de RN-ASG-02/06 (menos carga, menos menús en
   curso, asignado hace más tiempo). Es la hermana de list_job_candidates().';

revoke all on function public.list_menu_candidates(uuid) from public, anon;
grant execute on function public.list_menu_candidates(uuid) to authenticated;

-- ============================================================
-- 2 · La cola del equipo (§20.4, RN-MEN-07, RN-DAT-05)
-- ============================================================
create or replace function public.team_menu_queue(p_space_id uuid)
returns table (
  menu_id uuid,
  establishment_id uuid,
  establishment_name text,
  name text,
  kind text,
  target_date date,
  state text,
  cutoff_at timestamptz,
  publish_by_at timestamptz,
  requested_at timestamptz,
  guaranteed boolean,
  is_assigned boolean,
  assigned_to uuid,
  assignment_mode text,
  publication_id uuid,
  pending_corrections integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_manages boolean;
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'Solo el equipo del espacio ve la cola de Menú Diario';
  end if;

  v_manages := public.has_capability(p_space_id, 'manage_requests');

  return query
  select
    m.id,
    m.establishment_id,
    e.name,
    m.name,
    m.kind,
    m.target_date,
    m.state,
    public.menu_cutoff_at(m.target_date, m.space_id),
    public.menu_publish_by_at(m.target_date, m.space_id),
    p.requested_at,
    case
      when p.requested_at is null then null
      else p.requested_at <= public.menu_cutoff_at(m.target_date, m.space_id)
        and not exists (
          select 1 from public.menu_versions v
          where v.menu_id = m.id and v.after_cutoff and v.created_at >= p.requested_at
        )
    end,
    p.assigned_to is not null,
    -- El mismo criterio que la política de menu_publications: quien
    -- gestiona ve a quién está asignado; un trabajador, solo si es él.
    case when v_manages or p.assigned_to = auth.uid() then p.assigned_to else null end,
    p.assignment_mode,
    p.id,
    (
      select count(*)::integer from public.menu_corrections c
      where c.menu_id = m.id and c.completed_at is null
    ),
    m.updated_at
  from public.menus m
  join public.establishments e on e.id = m.establishment_id
  left join lateral (
    select pb.id, pb.requested_at, pb.assigned_to, pb.assignment_mode
    from public.menu_publications pb
    where pb.menu_id = m.id and pb.published_at is null and pb.cancelled_at is null
    limit 1
  ) p on true
  where m.space_id = p_space_id
    and (
      m.state in ('publication_requested', 'pending_assignment', 'assigned', 'needs_information',
                  'reviewing', 'ready_to_publish', 'publication_error')
      or (m.state = 'published' and exists (
        select 1 from public.menu_corrections c where c.menu_id = m.id and c.completed_at is null
      ))
    )
    and public.can_read_menu_establishment(m.establishment_id)
  order by m.target_date, 8, m.updated_at;
end;
$$;

comment on function public.team_menu_queue(uuid) is
  'Hito 11 · lo que el equipo tiene entre manos en Menú Diario: las
   publicaciones vivas y los menús publicados con una corrección pendiente,
   con el corte y la garantía calculados aquí (RN-MEN-07, RN-DAT-05). Las
   filas las filtra can_read_menu_establishment(), la misma función que las
   políticas de RLS; el asignado se devuelve con el criterio de la política
   de menu_publications. El cliente no es miembro del espacio y no la llama.';

revoke all on function public.team_menu_queue(uuid) from public, anon;
grant execute on function public.team_menu_queue(uuid) to authenticated;

-- ============================================================
-- 3 · La corrección mínima de Menú Diario (RN-COR-01/02/06/07/10)
-- ============================================================
create table public.menu_corrections (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  menu_id uuid not null references public.menus (id) on delete cascade,
  publication_id uuid not null references public.menu_publications (id),
  -- RN-COR-07: solo 'client_request' gasta la corrección mínima; un error
  -- del equipo se corrige sin consumir nada del cliente.
  kind text not null check (kind in ('client_request', 'team_error')),
  description text not null check (length(btrim(description)) > 0 and length(description) <= 2000),
  requested_by uuid not null references public.profiles (id),
  requested_at timestamptz not null default now(),
  -- RN-COR-10: si la petición llegó antes de las 21:00 del día anterior a
  -- la fecha objetivo. Es un hecho del momento de pedir (como
  -- menu_publications.requested_before_cutoff), no un estado derivado.
  requested_before_cutoff boolean not null,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id),
  completion_note text check (completion_note is null or length(completion_note) <= 2000)
);

comment on table public.menu_corrections is
  'RN-COR-10 · la corrección mínima de un menú publicado. Una sola por
   publicación si la pide el restaurante (RN-COR-01, índice único parcial);
   las de error del equipo (RN-COR-07) no están limitadas ni consumen. El
   menú sigue publicado: el equipo aplica el texto en LandingSite y marca
   la corrección hecha. Solo la escriben las funciones de este archivo.';

alter table public.menu_corrections enable row level security;

create index menu_corrections_menu_idx on public.menu_corrections (menu_id, requested_at);
create index menu_corrections_pending_idx on public.menu_corrections (space_id) where completed_at is null;

-- RN-COR-01: "una sola corrección en total" por publicación.
create unique index menu_corrections_one_client_request_idx
  on public.menu_corrections (publication_id)
  where kind = 'client_request';

create policy menu_corrections_select on public.menu_corrections
for select using (public.can_read_menu_establishment(establishment_id));

-- P7: quien la pidió puede ser alguien del equipo (error propio) y quien
-- la cerró siempre lo es. Las dos columnas van con privilegio de columna.
revoke select on public.menu_corrections from anon, authenticated;
grant select (id, space_id, establishment_id, menu_id, publication_id, kind, description, requested_at,
              requested_before_cutoff, completed_at, completion_note)
  on public.menu_corrections to authenticated;

-- RN-COR-02 aplicada a Menú Diario: 72 h desde la publicación, medidas con
-- el calendario del servicio, que no tiene días no laborables (RN-CLK-09).
create or replace function public.menu_correction_window_ends_at(p_published_at timestamptz)
returns timestamptz
language sql
immutable
as $$
  select p_published_at + interval '72 hours';
$$;

revoke all on function public.menu_correction_window_ends_at(timestamptz) from public, anon, authenticated;

-- La publicación publicada de un menú (la última), bloqueada.
create or replace function public.lock_published_menu_publication(p_menu_id uuid)
returns public.menu_publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pub public.menu_publications;
begin
  select * into v_pub from public.menu_publications
  where menu_id = p_menu_id and published_at is not null
  order by published_at desc
  limit 1
  for update;

  if v_pub.id is null then
    raise exception 'El menú no tiene ninguna publicación hecha';
  end if;

  return v_pub;
end;
$$;

revoke all on function public.lock_published_menu_publication(uuid) from public, anon, authenticated;

-- El restaurante pide su corrección mínima (RN-COR-01/02/03/10).
create or replace function public.request_menu_correction(p_menu_id uuid, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
  v_before_cutoff boolean;
  v_id uuid;
  v_recipient uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para pedir correcciones de este menú';
  end if;

  if p_description is null or length(btrim(p_description)) = 0 then
    raise exception 'Di qué hay que corregir: sin texto nadie puede hacerlo';
  end if;

  if v_menu.state <> 'published' then
    raise exception 'La corrección mínima es de un menú publicado; antes de publicar, guarda una versión nueva (RN-MEN-03)';
  end if;

  -- RN-MEN-13 / §85: con el servicio detenido no se corrige nada.
  perform public.assert_establishment_service_running(v_menu.establishment_id);

  v_pub := public.lock_published_menu_publication(p_menu_id);

  -- RN-COR-01: una sola por publicación.
  if exists (select 1 from public.menu_corrections c where c.publication_id = v_pub.id and c.kind = 'client_request') then
    raise exception 'Este menú ya usó su corrección mínima gratuita (RN-COR-01)';
  end if;

  -- RN-COR-02: la ventana posterior a la publicación.
  if now() > public.menu_correction_window_ends_at(v_pub.published_at) then
    raise exception 'La ventana de corrección de este menú ya se cerró (RN-COR-02)';
  end if;

  -- RN-COR-10: garantizada solo si llega antes de las 21:00 del día anterior.
  v_before_cutoff := now() <= public.menu_cutoff_at(v_menu.target_date, v_menu.space_id);

  insert into public.menu_corrections
    (space_id, establishment_id, menu_id, publication_id, kind, description, requested_by, requested_before_cutoff)
  values
    (v_menu.space_id, v_menu.establishment_id, p_menu_id, v_pub.id, 'client_request', btrim(p_description),
     auth.uid(), v_before_cutoff)
  returning id into v_id;

  -- El historial del menú lo cuenta (RN-MEN-10); el estado no cambia.
  perform public.record_menu_event(p_menu_id, v_pub.id, 'published', 'published', 'Corrección pedida: ' || btrim(p_description));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_menu.space_id, auth.uid(), 'menu.correction_requested', 'menu', p_menu_id,
          jsonb_build_object('correction_id', v_id, 'publication_id', v_pub.id, 'kind', 'client_request',
                             'consumes_free_correction', true, 'requested_before_cutoff', v_before_cutoff),
          btrim(p_description));

  -- §18: "Corrección pedida" al equipo que la va a hacer: el asignado (RN-COR-06)
  -- y quien gestiona.
  for v_recipient in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = v_menu.space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
    union
    select v_pub.assigned_to where v_pub.assigned_to is not null
  loop
    perform public.emit_notification(
      v_menu.space_id, v_recipient, 'correction_requested', 'staff', 'menu', p_menu_id,
      '/espacios/' || public.space_slug(v_menu.space_id) || '/menu-diario/' || p_menu_id::text,
      'correction_requested:menu:' || v_id::text, v_menu.establishment_id);
  end loop;

  return v_id;
end;
$$;

revoke all on function public.request_menu_correction(uuid, text) from public, anon;
grant execute on function public.request_menu_correction(uuid, text) to authenticated;

-- RN-COR-07: un error del equipo se corrige sin consumir la corrección ni
-- créditos. La abre el asignado o quien gestiona, y no está limitada.
create or replace function public.open_menu_team_error_correction(p_menu_id uuid, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
  v_id uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if v_menu.state <> 'published' then
    raise exception 'Solo se corrige un menú publicado';
  end if;

  v_pub := public.lock_published_menu_publication(p_menu_id);
  perform public.assert_can_write_menu_publication(v_menu, v_pub);

  if p_description is null or length(btrim(p_description)) = 0 then
    raise exception 'Di qué se corrige por error del equipo';
  end if;

  insert into public.menu_corrections
    (space_id, establishment_id, menu_id, publication_id, kind, description, requested_by, requested_before_cutoff)
  values
    (v_menu.space_id, v_menu.establishment_id, p_menu_id, v_pub.id, 'team_error', btrim(p_description), auth.uid(),
     now() <= public.menu_cutoff_at(v_menu.target_date, v_menu.space_id))
  returning id into v_id;

  perform public.record_menu_event(p_menu_id, v_pub.id, 'published', 'published', 'Corrección por error del equipo: ' || btrim(p_description));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_menu.space_id, auth.uid(), 'menu.team_error_correction_opened', 'menu', p_menu_id,
          jsonb_build_object('correction_id', v_id, 'publication_id', v_pub.id, 'kind', 'team_error',
                             'consumes_free_correction', false),
          btrim(p_description));

  return v_id;
end;
$$;

revoke all on function public.open_menu_team_error_correction(uuid, text) from public, anon;
grant execute on function public.open_menu_team_error_correction(uuid, text) to authenticated;

-- El equipo la aplica en LandingSite y la marca hecha (RN-COR-06).
create or replace function public.complete_menu_correction(p_correction_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corr public.menu_corrections;
  v_menu public.menus;
  v_pub public.menu_publications;
begin
  select * into v_corr from public.menu_corrections where id = p_correction_id for update;
  if v_corr.id is null then
    raise exception 'Corrección no encontrada';
  end if;

  select * into v_menu from public.menus where id = v_corr.menu_id for update;
  select * into v_pub from public.menu_publications where id = v_corr.publication_id;
  perform public.assert_can_write_menu_publication(v_menu, v_pub);

  if v_corr.completed_at is not null then
    return; -- CA-17
  end if;

  update public.menu_corrections
  set completed_at = now(), completed_by = auth.uid(), completion_note = nullif(btrim(p_note), '')
  where id = p_correction_id;

  perform public.record_menu_event(v_corr.menu_id, v_corr.publication_id, 'published', 'published',
                                   coalesce('Corrección aplicada: ' || nullif(btrim(p_note), ''), 'Corrección aplicada'));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_corr.space_id, auth.uid(), 'menu.correction_completed', 'menu', v_corr.menu_id,
          jsonb_build_object('correction_id', p_correction_id, 'completed_at', null),
          jsonb_build_object('correction_id', p_correction_id, 'completed_at', now(), 'kind', v_corr.kind),
          nullif(btrim(p_note), ''));
end;
$$;

revoke all on function public.complete_menu_correction(uuid, text) from public, anon;
grant execute on function public.complete_menu_correction(uuid, text) to authenticated;

-- ============================================================
-- 4 · Los dos avisos nuevos del catálogo (§18)
-- ============================================================
-- Duplicado a propósito en `src/core/notifications.ts`;
-- `listas-compartidas.test.ts` lee esta ÚLTIMA definición.
alter table public.notifications
  drop constraint notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check check (event_type in (
    'request_submitted',
    'job_unassigned',
    'job_assigned',
    'job_started',
    'job_published',
    'correction_requested',
    'job_reassignment_requested',
    'task_reassignment_requested',
    'terms_version_published',
    'menu_publication_requested',
    'menu_assigned',
    'menu_needs_information',
    'menu_published',
    'menu_publication_error',
    'menu_not_prepared_reminder',
    'menu_publication_overdue',
    'consumption_threshold_80',
    'consumption_threshold_100',
    't2_threshold_50',
    't2_threshold_80',
    't2_threshold_100',
    't2_critical_alert',
    't2_reassignment_suggestion',
    't3_threshold_75',
    't3_threshold_90',
    't3_threshold_100',
    'establishment_paused_nonpayment',
    'establishment_suspended_nonpayment',
    'establishment_reactivated',
    'absence_requested',
    'absence_decided',
    'absence_uncovered_jobs'
  ));

-- ============================================================
-- 5 · El barrido de Menú Diario (RN-MEN-08, §62)
-- ============================================================
create or replace function public.run_daily_menu_sweep(p_space_id uuid, p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_slug text;
  v_local timestamp;
  v_today date;
  v_hour integer;
  v_est record;
  v_pub record;
  v_recipient uuid;
  v_emitidos integer := 0;
begin
  select s.timezone, s.slug into v_tz, v_slug from public.spaces s where s.id = p_space_id;
  if v_tz is null then
    return 0;
  end if;

  -- RN-CLK-06: las horas se miran en la zona del espacio.
  v_local := p_now at time zone v_tz;
  v_today := v_local::date;
  v_hour := extract(hour from v_local)::integer;

  -- ------------------------------------------------------------
  -- RN-MEN-08 · A las 20:00 se recuerda al propietario y a los Editores
  -- si no hay menú preparado para el día siguiente. "Preparado" es
  -- cualquier menú de mañana que no sea un borrador ni esté cancelado.
  -- Todos los días del año (RN-CLK-09): no se mira ningún calendario.
  -- Solo restaurantes con el servicio en marcha: a uno pausado o
  -- suspendido no se le recuerda un servicio que tiene detenido (§85).
  -- ------------------------------------------------------------
  if v_hour >= 20 then
    for v_est in
      select e.id
      from public.establishments e
      where e.space_id = p_space_id
        and e.status in ('active', 'ending')
        and public.establishment_daily_menu_subscription(e.id) is not null
        and not exists (
          select 1 from public.menus m
          where m.establishment_id = e.id
            and m.target_date = v_today + 1
            and m.state not in ('draft', 'cancelled')
        )
    loop
      for v_recipient in
        select em.user_id from public.establishment_memberships em
        where em.establishment_id = v_est.id and em.revoked_at is null
          and em.role in ('local_owner', 'editor')
        union
        select gm.user_id from public.group_memberships gm
        join public.establishments e2 on e2.group_id = gm.group_id
        where e2.id = v_est.id and gm.revoked_at is null
      loop
        if public.emit_notification(
             p_space_id, v_recipient, 'menu_not_prepared_reminder', 'client', 'establishment', v_est.id,
             '/espacios/' || v_slug || '/restaurantes/' || v_est.id::text || '/menu-diario',
             'menu_not_prepared_reminder:' || v_est.id::text || ':' || to_char(v_today + 1, 'YYYY-MM-DD'),
             v_est.id) is not null then
          v_emitidos := v_emitidos + 1;
        end if;
      end loop;
    end loop;
  end if;

  -- ------------------------------------------------------------
  -- §62 · Las publicaciones pedidas antes del corte se garantizan antes
  -- de las 08:00. A esa hora, las que siguen sin publicar son un
  -- incumplimiento y se avisa a quien gestiona y al asignado. Una vez por
  -- publicación: la clave lleva su id. "Garantizada" es lo mismo que
  -- deriva menu_deadlines() (RN-MEN-07): pedida antes del corte Y sin
  -- ninguna versión guardada después de él desde la petición; una versión
  -- tardía pierde la garantía y el equipo no debe esa hora.
  -- ------------------------------------------------------------
  if v_hour >= 8 then
    for v_pub in
      select p.id, p.menu_id, p.assigned_to, m.establishment_id
      from public.menu_publications p
      join public.menus m on m.id = p.menu_id
      where p.space_id = p_space_id
        and p.published_at is null and p.cancelled_at is null
        and p.requested_before_cutoff
        and not exists (
          select 1 from public.menu_versions v
          where v.menu_id = m.id and v.after_cutoff and v.created_at >= p.requested_at
        )
        and m.target_date <= v_today
        and m.state not in ('published', 'cancelled')
    loop
      for v_recipient in
        select sm.user_id from public.space_memberships sm
        where sm.space_id = p_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
        union
        select v_pub.assigned_to where v_pub.assigned_to is not null
      loop
        if public.emit_notification(
             p_space_id, v_recipient, 'menu_publication_overdue', 'staff', 'menu', v_pub.menu_id,
             '/espacios/' || v_slug || '/menu-diario/' || v_pub.menu_id::text,
             'menu_publication_overdue:' || v_pub.id::text,
             v_pub.establishment_id) is not null then
          v_emitidos := v_emitidos + 1;
        end if;
      end loop;
    end loop;
  end if;

  return v_emitidos;
end;
$$;

comment on function public.run_daily_menu_sweep(uuid, timestamptz) is
  'Hito 11 · el barrido de Menú Diario: el recordatorio de las 20:00
   (RN-MEN-08) y el aviso de las 08:00 de las publicaciones pedidas antes
   del corte y sin publicar (§62). Mira la hora en la zona del espacio y
   deduplica por fecha o por publicación (CA-17), así que no depende de la
   cadencia del cron. p_now existe para probarlo con la hora fija. Del
   proceso de la cola: nadie lo llama por RPC.';

revoke all on function public.run_daily_menu_sweep(uuid, timestamptz) from public, anon, authenticated;

-- El tipo nuevo de la cola, el despachador y quien la llena.
alter table public.scheduled_jobs drop constraint scheduled_jobs_kind_check;
alter table public.scheduled_jobs add constraint scheduled_jobs_kind_check
  check (kind in ('monthly_charges', 'dunning_sweep', 'sla_sweep', 'lifecycle_sweep', 'consumption_sweep', 'daily_menu_sweep'));

create or replace function public.run_scheduled_job(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_space uuid;
  v_hechos integer := 0;
begin
  select kind, space_id into v_kind, v_space
  from public.scheduled_jobs where id = p_job_id;

  if v_kind is null then
    raise exception 'Trabajo de cola no encontrado';
  end if;

  if v_kind = 'monthly_charges' then
    v_hechos := public.run_monthly_charges(v_space);
  elsif v_kind = 'dunning_sweep' then
    v_hechos := public.run_dunning_sweep(v_space);
  elsif v_kind = 'lifecycle_sweep' then
    v_hechos := public.run_lifecycle_sweep(v_space);
  elsif v_kind = 'consumption_sweep' then
    v_hechos := public.run_consumption_thresholds(v_space);
  elsif v_kind = 'daily_menu_sweep' then
    v_hechos := public.run_daily_menu_sweep(v_space);
  elsif v_kind = 'sla_sweep' then
    -- Los umbrales de T2 y T3 necesitan el reloj laboral, que vive en
    -- src/core/business-clock.ts. Los calcula el proceso de la cola y
    -- vuelve por emit_sla_notification(); aquí no se duplica.
    raise exception 'El barrido de plazos lo ejecuta src/services/queue-runner.ts, no SQL';
  else
    raise exception 'Tipo de trabajo de cola desconocido: %', v_kind;
  end if;

  perform public.finish_scheduled_job(p_job_id, true, null);
  return v_hechos;
end;
$$;

revoke all on function public.run_scheduled_job(uuid) from public, anon, authenticated;

create or replace function public.enqueue_due_scheduled_jobs(
  p_run_after timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
  v_kind text;
  v_hora text := to_char(p_run_after at time zone 'UTC', 'YYYYMMDDHH24');
  v_encolados integer := 0;
begin
  for v_space in select id from public.spaces loop
    foreach v_kind in array array[
      'monthly_charges',   -- RN-FIN-01
      'dunning_sweep',     -- RN-FIN-10 y RN-FIN-11
      'lifecycle_sweep',   -- RN-EST-09, RN-EST-10 y §6.4
      'consumption_sweep', -- §18, avisos al 80 % y al 100 %
      'daily_menu_sweep'   -- RN-MEN-08 y §62 (Hito 11)
    ]
    loop
      if public.enqueue_scheduled_job(
           v_space, v_kind, p_run_after,
           v_kind || ':' || v_space::text || ':' || v_hora) is not null then
        v_encolados := v_encolados + 1;
      end if;
    end loop;
  end loop;

  return v_encolados;
end;
$$;

revoke all on function public.enqueue_due_scheduled_jobs(timestamptz)
  from public, anon, authenticated;

-- ============================================================
-- 6 · Los menús en la búsqueda global (§20.5, HU-33)
-- ============================================================
-- Misma función que la 36, con una unión más. SECURITY INVOKER: el
-- restaurante encuentra sus menús y el equipo los de sus restaurantes,
-- porque filtra RLS. El enlace es la ficha del equipo; a un cliente esa
-- ruta lo reenvía a la suya.
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
    select 'menu', m.id, m.name, e.name || ' · ' || to_char(m.target_date, 'DD/MM/YYYY'), m.state,
           '/espacios/' || public.space_slug(m.space_id) || '/menu-diario/' || m.id::text
    from public.menus m
    join public.establishments e on e.id = m.establishment_id, q
    where q.raw <> '' and (m.name ilike q.pattern or e.name ilike q.pattern)

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
   identidad de quien pregunta, no una lista de permisos escrita aquí.
   Desde el Hito 11 también encuentra menús de Menú Diario.';
