-- ============================================================
-- RN-NOT-06 · Al momento o resumen diario (decisión 65)
-- ============================================================
--
-- Era el último hueco abierto del repaso del diseño definitivo. La
-- pantalla dibujaba "Instantáneo / Resumen diario" y no había ninguna
-- columna de frecuencia: `notification_preferences` guarda un booleano por
-- canal y por evento, y nada más.
--
-- Bosco, el 21/09/2026: el resumen sale **a las 08:00 de la zona del
-- espacio**, el horario de recepción se queda fuera, y **un aviso
-- obligatorio sale al momento** aunque la persona tenga resumen.
--
-- ------------------------------------------------------------
-- Por persona Y espacio, no por persona
-- ------------------------------------------------------------
--
-- Es la decisión de diseño que lo sostiene todo. Un aviso pertenece a un
-- espacio (`notifications.space_id`), y la hora de corte es la de **ese**
-- espacio: con una frecuencia global habría que elegir la zona horaria de
-- alguien, y quien trabaja en Santiago y en Canarias recibiría su resumen
-- a una hora que no es la suya en ninguno de los dos sitios.
--
-- Así, quien esté en dos espacios recibe dos resúmenes, cada uno en su
-- mañana. No es un efecto secundario: es lo correcto.
--
-- La ausencia de fila significa **al momento**, igual que la ausencia de
-- fila en `notification_preferences` significa "todo encendido". Nadie
-- tiene que sembrar una fila por persona y espacio para que funcione.

create table public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  frequency text not null default 'instant'
    check (frequency in ('instant', 'daily_digest')),
  updated_at timestamptz not null default now(),
  unique (profile_id, space_id)
);

comment on table public.notification_schedules is
  'RN-NOT-06 · si esta persona recibe los avisos de este espacio al momento
   o en un resumen diario. Sin fila: al momento, que es el valor por
   omisión y el de siempre.';

alter table public.notification_schedules enable row level security;

-- Cada quien la suya y nada más: la frecuencia de otra persona no es asunto
-- de nadie, ni siquiera del propietario del espacio.
create policy notification_schedules_select on public.notification_schedules
for select
using (profile_id = auth.uid());

-- Sin política de insert ni de update: se escribe solo por la función de
-- abajo. Un `update` suelto podría poner en resumen diario a otra persona.

-- ------------------------------------------------------------
-- La frecuencia efectiva
-- ------------------------------------------------------------
--
-- Un solo sitio donde se decide, como `effective_notification_preference()`.
create or replace function public.effective_notification_frequency(
  p_profile_id uuid,
  p_space_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ns.frequency from public.notification_schedules ns
     where ns.profile_id = p_profile_id and ns.space_id = p_space_id),
    'instant'
  );
$$;

revoke all on function public.effective_notification_frequency(uuid, uuid)
  from public, anon, authenticated;

-- Lo que la pantalla necesita para pintarse, y lo que escribe cuando se
-- cambia. Las dos comprueban lo mismo: que quien llama pertenezca al
-- espacio. Sin eso, cualquiera con sesión podría sembrar una preferencia
-- en un espacio ajeno — no leería nada, pero ensuciaría la tabla.
create or replace function public.my_notification_frequency(p_space_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'No perteneces a este espacio';
  end if;

  return public.effective_notification_frequency(auth.uid(), p_space_id);
end;
$$;

revoke all on function public.my_notification_frequency(uuid) from public, anon;
grant execute on function public.my_notification_frequency(uuid) to authenticated;

create or replace function public.set_my_notification_frequency(
  p_space_id uuid,
  p_frequency text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior text;
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'No perteneces a este espacio';
  end if;

  if p_frequency not in ('instant', 'daily_digest') then
    raise exception 'Frecuencia no válida';
  end if;

  v_anterior := public.effective_notification_frequency(auth.uid(), p_space_id);

  if v_anterior = p_frequency then
    return;
  end if;

  insert into public.notification_schedules (space_id, profile_id, frequency)
  values (p_space_id, auth.uid(), p_frequency)
  on conflict (profile_id, space_id)
  do update set frequency = excluded.frequency, updated_at = now();

  -- **Sin apunte de auditoría, y es deliberado.** `set_my_profile()`,
  -- `set_my_avatar()` y `set_my_notification_preference()` tampoco lo
  -- escriben: son preferencias de uno mismo, no cambios de estado que
  -- afecten a otros. El libro de auditoría es para responder de lo que uno
  -- le hace a los demás; meter aquí una preferencia personal le enseñaría
  -- al propietario del espacio a qué hora quiere sus correos cada quien.
  --
  -- La primera versión sí lo escribía, con el argumento de que así se
  -- respondería a "no me llegó el aviso". Se puede responder igual mirando
  -- `notification_schedules` —que la propia persona lee— sin convertir una
  -- preferencia en un expediente.
end;
$$;

revoke all on function public.set_my_notification_frequency(uuid, text) from public, anon;
grant execute on function public.set_my_notification_frequency(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- El resumen: qué es y qué NO es
-- ------------------------------------------------------------
--
-- **No es un aviso.** Podría haberse modelado como una fila más de
-- `notifications` —el resto de la tubería habría funcionado sin tocar
-- nada—, y estaría mal: aparecería en la campana junto a los siete avisos
-- que resume, y `notifications` pasaría a significar dos cosas.
--
-- Es un **envío que agrupa avisos**, así que tiene tabla propia y viaja
-- por la cola de siempre (`notification_deliveries`), que es la que ya
-- sabe reintentar y no duplicar (RN-NOT-05).
create table public.notification_digests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- El día **de la zona del espacio** al que corresponde el resumen, que
  -- es lo que lo hace idempotente: repetir el barrido no manda dos correos.
  digest_date date not null,
  notification_count integer not null check (notification_count > 0),
  created_at timestamptz not null default now(),
  unique (profile_id, space_id, digest_date)
);

comment on table public.notification_digests is
  'RN-NOT-06 · un resumen diario por persona, espacio y día. `unique` es la
   idempotencia: el barrido corre cada hora y solo el de las 08:00 locales
   crea fila, pero aunque corriera dos veces no habría dos correos.';

alter table public.notification_digests enable row level security;

create policy notification_digests_select on public.notification_digests
for select
using (profile_id = auth.uid());

-- Qué avisos entraron en cada resumen. Tabla de enlace y no una columna
-- `digested_at` en `notifications`: lo segundo sería un UPDATE sobre una
-- fila ya escrita, y esto es un hecho que se añade, no uno que se corrige
-- (CLAUDE.md, libro inmutable).
create table public.notification_digest_items (
  -- `space_id` aquí también, aunque se pueda deducir del resumen: CLAUDE.md
  -- no admite una tabla de espacio sin él, y el barrido del hito 7 lo
  -- comprueba. Es la misma decisión que en `file_links`, que es la otra
  -- tabla de enlace del proyecto.
  space_id uuid not null references public.spaces (id) on delete cascade,
  digest_id uuid not null references public.notification_digests (id) on delete cascade,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  primary key (digest_id, notification_id)
);

alter table public.notification_digest_items enable row level security;

create policy notification_digest_items_select on public.notification_digest_items
for select
using (
  exists (
    select 1 from public.notification_digests d
    where d.id = digest_id and d.profile_id = auth.uid()
  )
);

-- ------------------------------------------------------------
-- Los dos disparadores de solo lectura (RN-SUB-08, RN-ADM-07)
-- ------------------------------------------------------------
--
-- **`notification_schedules` los lleva**: es una escritura de una persona
-- con sesión, y en un espacio archivado por impago no se escribe nada
-- (§4.6). Tampoco lo cambia quien entra en Modo soporte, que mira y no
-- toca (§129).
create trigger notification_schedules_cuotly_read_only
  before insert or update or delete on public.notification_schedules
  for each row execute function public.guard_space_read_only();

create trigger notification_schedules_guard_support_read_only
  before insert or update or delete on public.notification_schedules
  for each row execute function public.guard_support_read_only();

-- **`notification_digests` y `notification_digest_items` NO los llevan**, y
-- es la misma exención que ya tienen `notifications` y
-- `notification_deliveries`, por el mismo motivo escrito en la migración
-- 90: los avisos de §4.5 siguen llegando mientras el espacio está
-- archivado, y un resumen es exactamente eso — avisos. Congelarlos dejaría
-- a la gente sin enterarse de que su espacio está archivado.
--
-- Las dos las escribe **solo** el barrido, que corre sin sesión, así que
-- no hay ninguna vía por la que alguien las escriba a mano: no tienen
-- política de insert ni de update.

-- ------------------------------------------------------------
-- La cola aprende a llevar resúmenes
-- ------------------------------------------------------------
--
-- `notification_deliveries` pasa a poder apuntar a un aviso **o** a un
-- resumen, nunca a los dos ni a ninguno. Se extiende la cola que ya
-- existe en vez de montar una segunda con sus propios reintentos: dos
-- máquinas de reintentar acaban reintentando distinto.
alter table public.notification_deliveries
  alter column notification_id drop not null;

alter table public.notification_deliveries
  add column digest_id uuid references public.notification_digests (id) on delete cascade;

alter table public.notification_deliveries
  add constraint notification_deliveries_target_check
  check (num_nonnulls(notification_id, digest_id) = 1);

-- La misma idempotencia que ya tenía el aviso: un resumen, un envío por
-- canal. En PostgreSQL varios NULL no chocan en un índice único, así que
-- la restricción de `notification_id` sigue funcionando igual.
create unique index notification_deliveries_digest_channel_idx
  on public.notification_deliveries (digest_id, channel)
  where digest_id is not null;

-- ------------------------------------------------------------
-- Emitir: el resumen se decide aquí, no en el barrido
-- ------------------------------------------------------------
--
-- Lo único que cambia respecto de la versión de la migración 98: si la
-- persona tiene resumen diario en ese espacio **y el aviso no es
-- obligatorio**, no se encola ni correo ni push. El aviso en la campana se
-- crea igual — RN-NOT-06 dice que la campana nunca espera.
--
-- Por qué aquí y no en el barrido: si se encolaran y luego se borraran,
-- habría una ventana en la que el proceso de envío podría haberlos mandado
-- ya. Lo que no se encola no se manda.
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
  p_amount_cents bigint default null,
  p_send_email boolean default true
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
  v_push_enabled boolean;
  v_mandatory boolean := public.notification_event_is_mandatory(p_event_type);
  v_agrupa boolean;
begin
  select e.in_app, e.email, e.push
  into v_in_app_enabled, v_email_enabled, v_push_enabled
  from public.effective_notification_preference(p_recipient_id, p_space_id, p_event_type) e;

  if not v_mandatory and not coalesce(v_in_app_enabled, true) then
    return null;
  end if;

  -- RN-NOT-06 · un obligatorio no espera al resumen. Si esperara, "no se
  -- puede desactivar" (RN-NOT-03) sería falso: se apagaría hasta mañana.
  v_agrupa := not v_mandatory
    and public.effective_notification_frequency(p_recipient_id, p_space_id) = 'daily_digest';

  insert into public.notifications (
    space_id, recipient_id, event_type, audience, entity_type, entity_id,
    establishment_id, deep_link, threshold_percent, amount_cents, dedupe_key
  ) values (
    p_space_id, p_recipient_id, p_event_type, p_audience, p_entity_type, p_entity_id,
    p_establishment_id, p_deep_link, p_threshold_percent, p_amount_cents, p_dedupe_key
  )
  on conflict (recipient_id, dedupe_key) do nothing
  returning id into v_notification_id;

  if v_notification_id is null then
    return null;
  end if;

  if p_send_email and not v_agrupa and (v_mandatory or coalesce(v_email_enabled, true)) then
    insert into public.notification_deliveries (space_id, notification_id, channel)
    values (p_space_id, v_notification_id, 'email')
    on conflict (notification_id, channel) do nothing;
  end if;

  -- RN-MOV-04 · push solo si hay un teléfono vigente al que mandarlo: una
  -- entrega sin destino se moriría en la cola tras cinco reintentos.
  if p_send_email
     and not v_agrupa
     and (v_mandatory or coalesce(v_push_enabled, true))
     and exists (
       select 1 from public.push_devices d
       where d.user_id = p_recipient_id and d.revoked_at is null
     ) then
    insert into public.notification_deliveries (space_id, notification_id, channel)
    values (p_space_id, v_notification_id, 'push')
    on conflict (notification_id, channel) do nothing;
  end if;

  return v_notification_id;

exception
  -- CA-18 y RN-NOT-05, igual que siempre.
  when others then
    return null;
end;
$$;

-- ------------------------------------------------------------
-- El barrido de las 08:00
-- ------------------------------------------------------------
--
-- Corre cada hora como los demás y **solo hace algo cuando en el espacio
-- son las ocho**. Esa comprobación vive aquí y no en quien encola porque
-- la zona es del espacio: quien encola no la conoce y tendría que
-- preguntarla para cada uno.
create or replace function public.run_notification_digests(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zona text;
  v_ahora timestamptz := now();
  v_dia date;
  v_desde timestamptz;
  v_persona record;
  v_digest_id uuid;
  v_cuantos integer;
  v_hechos integer := 0;
begin
  select timezone into v_zona from public.spaces where id = p_space_id;
  if v_zona is null then
    return 0;
  end if;

  -- Las ocho de la mañana **del espacio**, no del servidor (CLAUDE.md).
  if extract(hour from (v_ahora at time zone v_zona)) <> 8 then
    return 0;
  end if;

  v_dia := (v_ahora at time zone v_zona)::date;
  -- Las 24 h anteriores, contadas desde este mismo instante: la ventana no
  -- puede ser "el día natural anterior" porque entonces lo ocurrido entre
  -- medianoche y las ocho se quedaría fuera hasta el día siguiente.
  v_desde := v_ahora - interval '24 hours';

  for v_persona in
    select ns.profile_id
    from public.notification_schedules ns
    where ns.space_id = p_space_id and ns.frequency = 'daily_digest'
  loop
    begin
      -- Un resumen por persona, espacio y día. Si ya está, no se repite.
      if exists (
        select 1 from public.notification_digests d
        where d.space_id = p_space_id
          and d.profile_id = v_persona.profile_id
          and d.digest_date = v_dia
      ) then
        continue;
      end if;

      -- Lo que entra: sus avisos de este espacio de las últimas 24 h que
      -- **no se enviaron por su cuenta**. Un obligatorio ya salió al
      -- momento (tiene fila en la cola), así que no se repite en el
      -- resumen: recibirlo dos veces es peor que no resumirlo.
      select count(*) into v_cuantos
      from public.notifications n
      where n.space_id = p_space_id
        and n.recipient_id = v_persona.profile_id
        and n.created_at >= v_desde
        and not exists (
          select 1 from public.notification_deliveries d
          where d.notification_id = n.id
        )
        -- Y que no haya entrado ya en un resumen anterior. Con la ventana
        -- de 24 h y un resumen al día no debería poder pasar, pero eso
        -- depende de que el barrido corra todos los días a su hora: un día
        -- que se salte —la cola parada, el servidor caído— desplazaría la
        -- ventana y un aviso podría contarse dos veces. Esto lo hace
        -- imposible por construcción en vez de por calendario.
        and not exists (
          select 1 from public.notification_digest_items i
          where i.notification_id = n.id
        );

      -- RN-NOT-06 · un día sin nada NO genera resumen. Un correo que dice
      -- "no ha pasado nada" es ruido, y quien lo recibe deja de abrir los
      -- que sí traen algo.
      if coalesce(v_cuantos, 0) = 0 then
        continue;
      end if;

      insert into public.notification_digests
        (space_id, profile_id, digest_date, notification_count)
      values (p_space_id, v_persona.profile_id, v_dia, v_cuantos)
      returning id into v_digest_id;

      insert into public.notification_digest_items (space_id, digest_id, notification_id)
      select p_space_id, v_digest_id, n.id
      from public.notifications n
      where n.space_id = p_space_id
        and n.recipient_id = v_persona.profile_id
        and n.created_at >= v_desde
        and not exists (
          select 1 from public.notification_deliveries d
          where d.notification_id = n.id
        )
        -- Y que no haya entrado ya en un resumen anterior. Con la ventana
        -- de 24 h y un resumen al día no debería poder pasar, pero eso
        -- depende de que el barrido corra todos los días a su hora: un día
        -- que se salte —la cola parada, el servidor caído— desplazaría la
        -- ventana y un aviso podría contarse dos veces. Esto lo hace
        -- imposible por construcción en vez de por calendario.
        and not exists (
          select 1 from public.notification_digest_items i
          where i.notification_id = n.id
        );

      insert into public.notification_deliveries (space_id, digest_id, channel)
      values (p_space_id, v_digest_id, 'email');

      -- Push solo si hay teléfono, por lo mismo que en `emit_notification()`.
      if exists (
        select 1 from public.push_devices d
        where d.user_id = v_persona.profile_id and d.revoked_at is null
      ) then
        insert into public.notification_deliveries (space_id, digest_id, channel)
        values (p_space_id, v_digest_id, 'push');
      end if;

      v_hechos := v_hechos + 1;
    exception when others then
      -- Una persona que falle no puede dejar sin resumen a las demás.
      null;
    end;
  end loop;

  return v_hechos;
end;
$$;

revoke all on function public.run_notification_digests(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- La cola aprende el barrido
-- ------------------------------------------------------------
alter table public.scheduled_jobs drop constraint scheduled_jobs_kind_check;
alter table public.scheduled_jobs add constraint scheduled_jobs_kind_check
  check (kind in ('monthly_charges', 'dunning_sweep', 'sla_sweep', 'lifecycle_sweep',
                  'consumption_sweep', 'daily_menu_sweep', 'cuotly_billing_sweep',
                  'cuotly_storage_sweep',
                  'backup_sweep', 'charge_reminders', 'notification_digests'));

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
  elsif v_kind = 'cuotly_billing_sweep' then
    v_hechos := public.run_cuotly_billing_sweep(v_space);
  elsif v_kind = 'cuotly_storage_sweep' then
    v_hechos := public.run_cuotly_storage_sweep(v_space);
  elsif v_kind = 'backup_sweep' then
    v_hechos := public.run_backup_sweep(v_space);
  elsif v_kind = 'charge_reminders' then
    v_hechos := public.run_charge_reminders(v_space);
  elsif v_kind = 'notification_digests' then
    v_hechos := public.run_notification_digests(v_space);
  elsif v_kind = 'sla_sweep' then
    raise exception 'El barrido de plazos lo ejecuta src/services/queue-runner.ts, no SQL';
  else
    raise exception 'Tipo de trabajo de cola desconocido: %', v_kind;
  end if;

  perform public.finish_scheduled_job(p_job_id, true, null);
  return v_hechos;
end;
$$;

revoke all on function public.run_scheduled_job(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Reclamar: la cola devuelve avisos y resúmenes
-- ------------------------------------------------------------
--
-- **Aquí estaba la trampa.** La versión anterior unía `notifications` con
-- un `join` interno, así que una entrega de resumen —con `notification_id`
-- nulo— se habría reclamado, se le habría sumado un intento y **no se
-- habría devuelto nunca**: cinco vueltas y muerta, sin que nada fallara a
-- la vista. El `join` pasa a ser `left join` y las columnas del resumen
-- viajan al lado de las del aviso.
drop function if exists public.claim_notification_deliveries(integer);

create function public.claim_notification_deliveries(p_limit integer default 20)
returns table (
  delivery_id uuid,
  notification_id uuid,
  attempts integer,
  channel text,
  recipient_email text,
  push_tokens text[],
  event_type text,
  audience text,
  deep_link text,
  space_name text,
  entity_type text,
  establishment_name text,
  amount_cents bigint,
  threshold_percent integer,
  subject text,
  -- RN-NOT-06 · lo que el resumen añade. Nulos en una entrega de aviso.
  digest_id uuid,
  digest_date date,
  digest_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with tomados as (
    select d.id from public.notification_deliveries d
    where d.status = 'pending' and d.next_attempt_at <= now()
    order by d.next_attempt_at
    limit p_limit
    for update skip locked
  ),
  marcados as (
    update public.notification_deliveries d
    set attempts = d.attempts + 1
    from tomados t
    where d.id = t.id
    returning d.id, d.notification_id, d.digest_id, d.attempts, d.channel
  )
  select m.id, m.notification_id, m.attempts, m.channel,
         coalesce(p.email, pd_perfil.email),
         case when m.channel = 'push' then
           coalesce((
             select array_agg(dev.expo_push_token order by dev.last_seen_at desc)
             from public.push_devices dev
             where dev.user_id = coalesce(n.recipient_id, dg.profile_id)
               and dev.revoked_at is null
           ), '{}'::text[])
         else null end,
         n.event_type, n.audience, n.deep_link,
         coalesce(s.name, s_digest.name),
         n.entity_type,
         ctx.establishment_name,
         n.amount_cents,
         n.threshold_percent,
         ctx.subject,
         dg.id, dg.digest_date, dg.notification_count
  from marcados m
  left join public.notifications n on n.id = m.notification_id
  left join public.notification_digests dg on dg.id = m.digest_id
  left join public.profiles p on p.id = n.recipient_id
  left join public.profiles pd_perfil on pd_perfil.id = dg.profile_id
  left join public.spaces s on s.id = n.space_id
  left join public.spaces s_digest on s_digest.id = dg.space_id
  left join lateral public.notification_push_context(n.id) ctx on true;
end;
$$;

revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Lo que la persona ve de su propio resumen
-- ------------------------------------------------------------
--
-- Para que el correo pueda listar qué entró, y para que la pantalla pueda
-- enseñarlo sin que cada consumidor se invente su propia consulta.
create or replace function public.digest_contents(p_digest_id uuid)
returns table (
  notification_id uuid,
  event_type text,
  deep_link text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.event_type, n.deep_link, n.created_at
  from public.notification_digest_items i
  join public.notifications n on n.id = i.notification_id
  join public.notification_digests d on d.id = i.digest_id
  where i.digest_id = p_digest_id
    -- La puerta: solo el dueño del resumen. Es `SECURITY DEFINER` para
    -- poder leer `notifications` sin depender de su política, así que la
    -- comprobación tiene que estar escrita aquí (CLAUDE.md).
    and d.profile_id = auth.uid()
  order by n.created_at desc;
$$;

revoke all on function public.digest_contents(uuid) from public, anon;
grant execute on function public.digest_contents(uuid) to authenticated;
