-- Hito 3 · Motor de tiempo (PRD §7 RN-CLK, §8 RN-SLA). La lógica de
-- cálculo en sí (ventanas, minutos laborables, recálculo de contadores)
-- es pura y vive en src/core/business-clock.ts y src/core/timer-events.ts
-- (CA-10, CA-11) — aquí solo se guardan los datos de los que esa lógica
-- se alimenta.
--
-- No se incluye `space_working_hours`: las ventanas del reloj contractual
-- y del horario de soporte están fijadas por RN-CLK-01/02 y §132 de la
-- especificación maestra (no son un umbral pendiente de inventar), y el
-- PRD no describe una pantalla para editarlas en la Fase 1 — solo los
-- festivos son configurables por espacio (HU-32). Si en un hito futuro
-- hace falta versionar también las ventanas, se añadirá en una migración
-- nueva, nunca reescribiendo esta.

-- Nueva capacidad: gestionar festivos es del propietario y del
-- administrador, no del trabajador (§168 de la especificación maestra,
-- "Gestionar festivos | Sí | Sí | No"). Se sustituye con CREATE OR REPLACE
-- en un archivo nuevo — la migración original de has_capability
-- (20260830000007) nunca se toca, tal como exige CLAUDE.md.
create or replace function public.has_capability(p_space_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.space_role;
begin
  select sm.role into v_role
  from public.space_memberships sm
  where sm.space_id = p_space_id
    and sm.user_id = auth.uid()
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
    -- RN-CLK-03 / HU-32: configurar festivos y cierres del espacio.
    when 'manage_holidays' then v_role in ('owner', 'admin')
    else false
  end;
end;
$$;

-- holidays ----------------------------------------------------------------
-- Festivos configurados por el espacio (RN-CLK-03): cierran el reloj
-- contractual el día completo, 00:00–24:00 en la zona horaria del espacio
-- (RN-CLK-06). El calendario de Menú Diario los ignora siempre
-- (RN-CLK-09); el horario de soporte no cierra por festivo, cambia a su
-- horario de fin de semana (§132) — eso lo decide src/core/business-clock.ts
-- a partir de esta misma lista, no una columna aparte.
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  holiday_date date not null,
  name text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (space_id, holiday_date)
);

comment on table public.holidays is
  'Festivos y cierres configurados por el espacio (RN-CLK-03, HU-32). Solo
   INSERT y SELECT a propósito: RN-CLK-10 dice que un cambio de festivos
   no recalcula retroactivamente contadores ya en curso, así que un
   festivo no se edita ni se borra — para dejar de aplicarlo se resuelve
   con una corrección manual auditada cuando exista esa pantalla, no
   mutando esta fila.';

alter table public.holidays enable row level security;

create index holidays_space_id_idx on public.holidays (space_id);

create policy holidays_select on public.holidays
for select
using (public.is_space_member(space_id));

create policy holidays_insert on public.holidays
for insert
with check (public.has_capability(space_id, 'manage_holidays') and created_by = auth.uid());

-- Cada festivo añadido genera su registro de auditoría (CLAUDE.md, MUST:
-- "todo cambio de estado relevante genera un evento y un registro de
-- auditoría"). Trigger en vez de lógica en el servidor porque no hay
-- pantalla ni acción de servidor todavía para esta tabla (HU-32 queda
-- para un hito posterior) — así el dato nunca puede entrar sin auditoría,
-- sea cual sea el camino por el que se inserte.
create or replace function public.log_holiday_created()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    new.space_id,
    auth.uid(),
    'holiday.created',
    'holiday',
    new.id,
    jsonb_build_object('holiday_date', new.holiday_date, 'name', new.name)
  );
  return new;
end;
$$;

create trigger holidays_after_insert
after insert on public.holidays
for each row execute function public.log_holiday_created();

-- timer_events --------------------------------------------------------
-- Libro inmutable de arranques, pausas, reanudaciones y paradas de T1, T2
-- y T3 (RN-SLA, PRD §8 "Implementación"). El tiempo consumido nunca se
-- guarda como contador mutable: se recalcula sumando estas filas
-- (src/core/timer-events.ts, CA-10).
--
-- `entity_type`/`entity_id` apuntan a la solicitud o el trabajo dueño del
-- contador. Todavía sin clave foránea: `requests` (Hito 4) y `jobs`
-- (Hito 6) no existen como tabla en este hito. Se añadirá la referencia
-- real en la migración que cree esas tablas, sin tocar esta.
create table public.timer_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  counter_kind text not null check (counter_kind in ('t1', 't2', 't3')),
  entity_type text not null check (entity_type in ('request', 'job')),
  entity_id uuid not null,
  event_type text not null check (event_type in ('started', 'paused', 'resumed', 'stopped')),
  occurred_at timestamptz not null,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.timer_events is
  'Libro inmutable de eventos de T1/T2/T3 (RN-SLA). Solo SELECT tiene
   política: sin INSERT/UPDATE/DELETE directos desde el cliente a
   propósito — "el reloj contractual... es el componente más delicado del
   sistema" (PRD §7), así que solo lo escriben funciones SECURITY DEFINER
   del servidor que se añadirán junto al flujo de solicitudes y trabajos
   (Hito 4 y 6), nunca una llamada directa a la API.';

alter table public.timer_events enable row level security;

create index timer_events_entity_idx on public.timer_events (entity_type, entity_id);
create index timer_events_space_id_idx on public.timer_events (space_id);

create policy timer_events_select on public.timer_events
for select
using (public.is_space_member(space_id));
