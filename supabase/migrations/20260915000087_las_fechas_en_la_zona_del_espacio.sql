-- Fase 3 · Un `timestamptz` convertido a `date` se convierte en la zona de
-- la SESIÓN, no en la del espacio. Cuatro sitios lo hacían.
--
-- Lo encontró el job `e2e-datos` la primera vez que CI ejecutó los
-- recorridos con datos, el 14/09/2026 a las 22:03 UTC — que son las 00:03
-- del día siguiente en Madrid. `integraciones_conexiones_y_sincronizacion.sql`
-- se puso en rojo con "RN-INT-09 FALLIDO: la pasada siguiente no solapa
-- tres días con el último éxito", y la misma suite había pasado en verde
-- veinte minutos antes.
--
-- **Por qué es un fallo de verdad y no un test quisquilloso.** CLAUDE.md:
-- "las fechas se guardan en `timestamptz` y se calculan en la zona horaria
-- del espacio". `x::date` sobre un `timestamptz` usa el `TimeZone` de la
-- sesión; en Supabase eso es UTC siempre. Así que entre las 22:00 y las
-- 24:00 UTC —23:00 y 24:00 en invierno— la base contesta con el día de
-- ayer para un espacio en Madrid. Nada falla ruidosamente: sale otro día.
-- Es el mismo patrón que la migración 83 (`"Europe/Madrid"` escrito a
-- mano) y que el `role !== "client"` del 404: correcto por casualidad
-- mientras el mundo era pequeño, y aquí ni siquiera eso — bastaba con
-- mirar a las doce de la noche.
--
-- ============================================================
-- 1 · `space_timezone()`, la pieza que faltaba
-- ============================================================
--
-- `space_calendar()` es SECURITY INVOKER a propósito: devuelve lo que la
-- RLS de cada tabla deja ver a quien pregunta. Por eso no puede leer
-- `public.spaces` por su cuenta para saber la zona — `spaces_select` exige
-- ser miembro del espacio, y una función INVOKER hereda esa limitación—.
-- Se resuelve igual que en la 83 para el restaurante: una función que
-- devuelve la zona y NADA más de `spaces`, con su propia guarda.
--
-- **La guarda NO es "miembro del espacio", y esto se aprendió fallando.**
-- La primera versión exigía `is_space_member()` y rompió
-- `presupuestos_y_calendario.sql`: el restaurante **sí** llama a
-- `space_calendar()` —ahí ve la publicación de su menú, y la suite lo
-- exige— y un restaurante no es miembro del espacio. Con aquella guarda,
-- su calendario pasaba de funcionar a dar un error.
--
-- La zona de un espacio no es un secreto que P7 proteja: la migración 83
-- ya se la da al restaurante, porque la necesita para pintar SUS fechas.
-- Lo que hay que impedir es que alguien de fuera pregunte por un espacio
-- ajeno. Así que la guarda es "perteneces al mundo de este espacio":
-- miembro del espacio, o con acceso a alguno de sus restaurantes.
create or replace function public.space_timezone(p_space_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
begin
  if not exists (select 1 from public.spaces s where s.id = p_space_id) then
    raise exception 'Espacio no encontrado';
  end if;

  if not (
    public.is_space_member(p_space_id)
    or exists (
      select 1 from public.establishments e
      where e.space_id = p_space_id and public.can_read_establishment(e.id)
    )
  ) then
    raise exception 'No tienes acceso a este espacio';
  end if;

  select s.timezone into v_timezone from public.spaces s where s.id = p_space_id;
  return v_timezone;
end;
$$;

comment on function public.space_timezone(uuid) is
  'La zona horaria de un espacio, y nada más de `spaces`. Para funciones
   SECURITY INVOKER que tienen que calcular un día y no pueden leer esa
   tabla. La ven quienes pertenecen al mundo de ese espacio: sus miembros
   y quien tiene acceso a alguno de sus restaurantes — el restaurante
   también usa `space_calendar()`. Hermana de `establishment_timezone()`
   (migración 83), que hace lo propio por el lado del restaurante.';

revoke all on function public.space_timezone(uuid) from public, anon;
grant execute on function public.space_timezone(uuid) to authenticated;

-- ============================================================
-- 2 · El calendario ponía tres clases de evento en el día de la sesión
-- ============================================================
--
-- `space_calendar()` decidía el día de tres eventos con `x::date`: el fin
-- de la ventana de corrección de un trabajo, el vencimiento de un cobro y
-- el final de una sustitución. Un cobro que vence a las 00:30 del día 15
-- en Madrid se guarda como las 22:30Z del 14, y el calendario lo pintaba
-- el 14. Además del día que enseña, eso decide si el evento CAE DENTRO del
-- rango pedido: el usuario que mira la semana del 15 no lo veía.
--
-- Las otras cuatro ramas se quedan **exactamente** como estaban, y eso se
-- comprobó comparando el texto de la función entera y no a ojo: la
-- primera versión de este arreglo se dejó por el camino la rama de
-- `menu_publication` y reescribió la de `renewal` con una función que no
-- existe. Las cuatro no tenían el problema: `holidays.holiday_date`,
-- `absences.starts_on`/`ends_on` y `menus.target_date` ya son `date` —
-- convertir lo que ya es un día no depende de ninguna zona—, y la de
-- `renewal` ya calculaba con `s.started_at at time zone sp.timezone`,
-- que es justo lo que las otras tres no hacían.
create or replace function public.space_calendar(
  p_space_id uuid,
  p_from date,
  p_to date,
  p_establishment_id uuid default null,
  p_worker_id uuid default null,
  p_kind text default null
)
returns table (
  kind text,
  event_date date,
  title text,
  entity_type text,
  entity_id uuid,
  state text,
  establishment_id uuid
)
language sql
stable
set search_path = public
as $$
  with zona as (
    select public.space_timezone(p_space_id) as tz
  ),
  eventos as (
    select 'holiday'::text as kind, h.holiday_date as event_date, h.name as title,
           'holiday'::text as entity_type, h.id as entity_id, null::text as state,
           null::uuid as establishment_id, null::uuid as worker_id
    from public.holidays h
    where h.space_id = p_space_id and h.holiday_date between p_from and p_to

    union all
    -- Una ausencia aprobada o pendiente ocupa todos sus días.
    select 'absence', d::date, coalesce(a.reason, ''), 'absence', a.id, a.state, null, a.user_id
    from public.absences a
    cross join lateral generate_series(a.starts_on, a.ends_on, interval '1 day') d
    where a.space_id = p_space_id
      and a.state in ('requested', 'approved')
      and d::date between p_from and p_to

    union all
    -- Vencimiento de la ventana de corrección de un trabajo publicado
    -- (RN-COR-02, §76 "fin de corrección").
    select 'correction_window', (j.correction_window_ends_at at time zone (select tz from zona))::date, j.code, 'job', j.id, j.state,
           j.establishment_id, j.assigned_to
    from public.jobs j
    where j.space_id = p_space_id
      and j.correction_window_ends_at is not null
      and (j.correction_window_ends_at at time zone (select tz from zona))::date between p_from and p_to

    union all
    -- Vencimiento de un cobro (RN-FIN-10/11).
    select 'charge_due', (c.due_at at time zone (select tz from zona))::date, c.concept, 'charge', c.id, public.charge_status(c.id),
           c.establishment_id, null
    from public.charges c
    where c.space_id = p_space_id and (c.due_at at time zone (select tz from zona))::date between p_from and p_to

    union all
    -- §76 · publicaciones de Menú Diario: todo menú con publicación
    -- pedida, en curso, publicada o fallida, en su fecha objetivo. Un
    -- borrador o un preparado sin pedir no es una publicación todavía.
    select 'menu_publication', m.target_date, m.name || ' · ' || e.name, 'menu', m.id, m.state,
           m.establishment_id,
           (select p.assigned_to from public.menu_publications p
            where p.menu_id = m.id and p.cancelled_at is null
            order by p.requested_at desc limit 1)
    from public.menus m
    join public.establishments e on e.id = m.establishment_id
    where m.space_id = p_space_id
      and m.target_date between p_from and p_to
      and m.state in ('publication_requested', 'pending_assignment', 'assigned', 'needs_information',
                      'reviewing', 'ready_to_publish', 'published', 'publication_error')

    union all
    -- §76 · renovaciones de planes y servicios: cada mes natural desde el
    -- alta, en la zona del espacio (RN-COM-04/06/09), la misma aritmética
    -- que los ciclos. Se DERIVAN: no hay fila de renovación que pueda
    -- decir otra cosa que la suscripción.
    select 'renewal', r.renews_on, coalesce(p.name, sv.name, '') || ' · ' || e.name, 'subscription', s.id,
           s.kind, s.establishment_id, null
    from public.subscriptions s
    join public.establishments e on e.id = s.establishment_id
    join public.spaces sp on sp.id = s.space_id
    left join public.plans p on p.id = s.plan_id
    left join public.services sv on sv.id = s.service_id
    cross join lateral (
      select ((s.started_at at time zone sp.timezone) + (k || ' months')::interval)::date as renews_on
      from generate_series(
        greatest(1, ((extract(year from p_from) - extract(year from (s.started_at at time zone sp.timezone))) * 12
                     + (extract(month from p_from) - extract(month from (s.started_at at time zone sp.timezone))) - 1)::integer),
        greatest(1, ((extract(year from p_to) - extract(year from (s.started_at at time zone sp.timezone))) * 12
                     + (extract(month from p_to) - extract(month from (s.started_at at time zone sp.timezone))) + 1)::integer)
      ) k
    ) r
    where s.space_id = p_space_id
      and s.status = 'active'
      and e.status <> 'archived'
      and r.renews_on between p_from and p_to

    union all
    -- §76 · final de una sustitución (RN-SUP-03).
    select 'supervision_end', (sv.ends_at at time zone (select tz from zona))::date, coalesce(pw.full_name, pw.email, ''), 'supervision', sv.id,
           sv.kind, null, sv.worker_id
    from public.supervisions sv
    left join public.profiles pw on pw.id = sv.worker_id
    where sv.space_id = p_space_id
      and sv.kind = 'substitute'
      and sv.revoked_at is null
      and sv.ends_at is not null
      and (sv.ends_at at time zone (select tz from zona))::date between p_from and p_to
  )
  select ev.kind, ev.event_date, ev.title, ev.entity_type, ev.entity_id, ev.state, ev.establishment_id
  from eventos ev
  where (p_establishment_id is null or ev.establishment_id = p_establishment_id)
    and (p_worker_id is null or ev.worker_id = p_worker_id)
    and (p_kind is null or ev.kind = p_kind)
  order by ev.event_date, ev.kind, ev.title;
$$;

-- ============================================================
-- 3 · La ventana de solape de las integraciones (RN-INT-09)
-- ============================================================
--
-- Esta es la que se puso en rojo. `v_today` ya se calculaba bien —`(now()
-- at time zone v_int.timezone)::date`—, y la línea de al lado hacía
-- `v_int.last_success_at::date`, en la zona de la sesión. Entre las 22:00
-- y las 24:00 UTC el solape de RN-INT-09 salía de dos días en vez de tres:
-- un día menos de revisión, en silencio, todas las noches.
create or replace function public.claim_integration_runs(p_limit integer default 10)
returns table (
  run_id uuid,
  integration_id uuid,
  space_id uuid,
  establishment_id uuid,
  provider text,
  kind text,
  external_property_id text,
  period_start date,
  period_end date,
  last_success_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run record;
  v_int record;
  v_left integer := greatest(coalesce(p_limit, 10), 0);
  v_today date;
  v_end date;
  v_start date;
  v_run_id uuid;
begin
  for v_run in
    select r.id, r.integration_id
    from public.sync_runs r
    where r.kind = 'check' and r.status = 'pending'
    order by r.created_at
    limit v_left
    for update skip locked
  loop
    update public.sync_runs set status = 'running', started_at = now() where id = v_run.id;
    v_left := v_left - 1;
    return query
      select v_run.id, i.id, i.space_id, i.establishment_id, i.provider, 'check'::text,
             i.external_property_id, null::date, null::date, i.last_success_at
      from public.integrations i where i.id = v_run.integration_id;
  end loop;

  if v_left <= 0 then
    return;
  end if;

  for v_int in
    select i.id, i.space_id, i.establishment_id, i.provider, i.external_property_id, i.last_success_at,
           s.timezone
    from public.integrations i
    join public.spaces s on s.id = i.space_id
    join public.establishments e on e.id = i.establishment_id
    where i.status in ('connected', 'error')
      and i.next_attempt_at is not null
      and i.next_attempt_at <= now()
      and e.status not in ('suspended', 'archived')
    order by i.next_attempt_at
    limit v_left
    for update of i skip locked
  loop
    v_today := (now() at time zone v_int.timezone)::date;
    v_end := v_today - 1;
    -- **El arreglo.** La conversión a día de ese instante usaba la zona
    -- de la SESIÓN. Es el mismo instante convertido a día que `v_today`
    -- de dos líneas arriba, así que o usa la misma zona o los dos días
    -- no son comparables.
    v_start := greatest(
      v_end - 89,
      coalesce((v_int.last_success_at at time zone v_int.timezone)::date - 3, v_end - 89)
    );

    insert into public.sync_runs
      (space_id, establishment_id, integration_id, kind, status, period_start, period_end, started_at)
    values
      (v_int.space_id, v_int.establishment_id, v_int.id, 'sync', 'running', v_start, v_end, now())
    returning id into v_run_id;

    update public.integrations
    set status = 'syncing', updated_at = now()
    where id = v_int.id;

    return query
      select v_run_id, v_int.id, v_int.space_id, v_int.establishment_id, v_int.provider, 'sync'::text,
             v_int.external_property_id, v_start, v_end, v_int.last_success_at;
  end loop;
end;
$$;

revoke all on function public.claim_integration_runs(integer) from public, anon, authenticated;

-- Se comprueba con `supabase/tests/integraciones_conexiones_y_sincronizacion.sql`
-- y `supabase/tests/presupuestos_y_calendario.sql`, con
-- comprobaciones que NO dependen de la hora a la que se ejecuten: fijan la
-- zona de la sesión a dos zonas distintas y exigen la misma respuesta.
