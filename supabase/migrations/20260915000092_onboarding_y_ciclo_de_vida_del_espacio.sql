-- Fase 4 · Hito 20 · onboarding del espacio nuevo y ciclo de vida del
-- espacio (PRD §33, RN-CIC-01 a 15; §9, §127, §141, §123, §139 y §140 de
-- la maestra).
--
-- **Lo que hace distinta a esta migración.** Las tres anteriores miraban
-- el espacio desde fuera: la 89 lo crea, la 90 le cobra, la 91 le da a
-- Cuotly una ventana desde la que verlo. Esta lo mira desde dentro y a lo
-- largo del tiempo: cómo se rellena recién nacido, cómo cambia de dueño,
-- cómo se termina y qué se lleva quien se va.
--
-- **Lo que NO hace, y conviene leer antes que nada:** no borra nada. §127
-- dice "después se programa eliminación" y aquí se programa: se guarda la
-- fecha, se enseña, y ningún proceso la ejecuta. Qué se elimina de verdad
-- y qué se conserva por obligación legal es del bloque legal (§170.1,
-- pendiente 20). Tampoco cierra ninguna cuenta personal: de §141 se
-- entrega la comprobación —qué impide cerrarla— y no el cierre.
--
-- **Tres cosas que se apoyan en lo que ya había, en vez de duplicarlo:**
--
--   1. El archivado del propietario es un **modo más** de `cuotly_status`
--      (RN-SUB-02), no un estado paralelo, así que hereda tal cual la solo
--      lectura que la 90 instaló en toda tabla con `space_id`. Aquí solo
--      se ensancha la lista de modos archivados, en un sitio.
--   2. La exportación no lleva ninguna lista de columnas escrita a mano.
--      Se ejecuta **con la identidad de quien exporta** (`security
--      invoker`), así que la RLS decide las filas y el privilegio de
--      columna decide las columnas — que es exactamente lo que P7 pide y
--      lo que CLAUDE.md dice que no se sostiene con una lista.
--   3. "Al menos un propietario" es un **disparador**, no una
--      comprobación dentro de una función: la política de
--      `space_memberships` deja al propietario escribir esa tabla por
--      PostgREST, y una comprobación en una función la esquiva un
--      `update` de una línea.
--
-- Se comprueba con `supabase/tests/onboarding_y_ciclo_de_vida_del_espacio.sql`.

-- ============================================================
-- 1 · Lo que le faltaba al espacio para poder rellenarse (RN-CIC-02)
-- ============================================================
--
-- Los datos fiscales se guardan **como los escribe quien los escribe**,
-- igual que en `space_requests` (RN-PLA-01): no se valida ningún
-- identificador ni se numera nada. Eso es del bloque legal (§170.1).
alter table public.spaces add column if not exists legal_name text;
alter table public.spaces add column if not exists tax_id text;
alter table public.spaces add column if not exists address text;
alter table public.spaces add column if not exists logo_storage_path text;
alter table public.spaces add column if not exists onboarding_completed_at timestamptz;

comment on column public.spaces.legal_name is
  '§9 paso 1 · razón social del espacio. Nace copiada de la solicitud
   aprobada (§10) y la edita su propietario. Sin validar: bloque legal.';
comment on column public.spaces.tax_id is
  '§9 paso 1 · identificador fiscal, texto libre y sin validar, como en
   `space_requests.tax_id` (RN-PLA-01, §170.1).';
comment on column public.spaces.address is
  '§9 paso 1 · dirección fiscal del espacio. Sin validar, mismo motivo.';
comment on column public.spaces.logo_storage_path is
  '§9 paso 2, §124 · la ruta del logotipo en el bucket privado `files`.
   No es un `files.id`: `files` exige `establishment_id` y el logotipo del
   espacio existe antes que el primer establecimiento (§9 lo pide en el
   paso 2 y el establecimiento en el 7).';
comment on column public.spaces.onboarding_completed_at is
  'RN-CIC-04 · cuándo quedaron hechos los diez pasos de §9. Se sella una
   vez y no se vuelve atrás: archivar después el único establecimiento no
   devuelve el espacio al asistente, porque es un hecho del pasado
   (§3.4).';

-- Los datos fiscales del espacio salen de la solicitud que lo creó, que
-- es donde su propietario ya los escribió (§10). Backfill de lo que
-- aprobó la 89 antes de que estas columnas existieran.
update public.spaces s
set legal_name = coalesce(s.legal_name, sr.tax_name),
    tax_id = coalesce(s.tax_id, sr.tax_id),
    address = coalesce(s.address, sr.tax_address)
from public.space_requests sr
where sr.space_id = s.id and sr.status = 'approved';

-- Y de aquí en adelante, al aprobar. Va como disparador sobre
-- `space_requests` y no reescribiendo `approve_space_request()`: copiar
-- tres columnas no justifica duplicar cien líneas de una función que ya
-- funciona, y duplicarla es como se separan las dos copias.
create or replace function public.copy_request_tax_data_to_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and new.space_id is not null
     and old.space_id is distinct from new.space_id then
    update public.spaces s
    set legal_name = coalesce(s.legal_name, new.tax_name),
        tax_id = coalesce(s.tax_id, new.tax_id),
        address = coalesce(s.address, new.tax_address)
    where s.id = new.space_id;
  end if;
  return new;
end;
$$;

comment on function public.copy_request_tax_data_to_space() is
  '§9 paso 1 · el espacio nace con los datos fiscales que su propietario
   escribió en la solicitud (§10). Sin validar ninguno: bloque legal
   (§170.1). Es lo que hace que el paso 1 del asistente pueda estar hecho
   POR DATO y no por una confirmación vacía.';

revoke all on function public.copy_request_tax_data_to_space() from public, anon, authenticated;

create trigger space_requests_copy_tax_data
  after update on public.space_requests
  for each row execute function public.copy_request_tax_data_to_space();

-- ============================================================
-- 2 · Los diez pasos de §9, en un solo sitio (RN-CIC-01)
-- ============================================================
--
-- Duplicados a propósito con `ONBOARDING_STEPS` de
-- `src/core/space-lifecycle.ts`, como los estados de la solicitud y los
-- niveles de soporte. Lo vigila `listas-compartidas.test.ts`: son dos
-- sistemas y ninguno puede importar del otro.
create or replace function public.onboarding_steps()
returns table (ordinal integer, step text, derivable boolean)
language sql
immutable
as $$
  -- `derivable` dice si el paso se puede saber por un dato. Los cuatro
  -- que no lo son tienen ya un valor de partida —`Europe/Madrid`, 21 %,
  -- todos los avisos activados (RN-NOT-02) y la 2FA, opcional para el
  -- propietario de un espacio (RN-ADM-02)— y en la base no hay nada que
  -- distinga "el valor por omisión" de "mirado y decidido". Se completan
  -- con la confirmación de una persona, que es un hecho con actor y
  -- fecha; dar por hecho el valor por omisión sería el dato de relleno
  -- que CLAUDE.md prohíbe.
  select * from (values
    (1,  'space_details',      true),
    (2,  'logo',               true),
    (3,  'timezone',           false),
    (4,  'working_hours',      true),
    (5,  'taxes',              false),
    (6,  'plans_and_services', true),
    (7,  'first_establishment',true),
    (8,  'first_worker',       true),
    (9,  'notifications',      false),
    (10, 'security',           false)
  ) as t(ordinal, step, derivable);
$$;

comment on function public.onboarding_steps() is
  'RN-CIC-01 · los diez pasos de §9, en su orden y sin ninguno más.
   Duplicado a propósito con `ONBOARDING_STEPS`; lo vigila
   `listas-compartidas.test.ts`.';

-- ============================================================
-- 3 · Las confirmaciones (RN-CIC-02, RN-CIC-03)
-- ============================================================
create table public.space_onboarding_confirmations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  -- La lista va literal porque un CHECK no admite subconsultas, ni
  -- siquiera contra una función inmutable. La suite la compara con
  -- `onboarding_steps()`, que es quien manda.
  step text not null check (step in (
    'space_details', 'logo', 'timezone', 'working_hours', 'taxes',
    'plans_and_services', 'first_establishment', 'first_worker',
    'notifications', 'security'
  )),
  confirmed_by uuid not null references public.profiles (id),
  confirmed_at timestamptz not null default now(),
  -- Un paso se confirma una vez. Repetirlo no escribe una fila nueva.
  unique (space_id, step)
);

comment on table public.space_onboarding_confirmations is
  'RN-CIC-02 · "este paso lo he mirado y lo doy por bueno", dicho por el
   propietario, con actor y fecha. Es lo que completa los cuatro pasos que
   no se pueden derivar de ningún dato, y lo que deja saltarse los seis que
   sí —un espacio que no quiere logotipo marca el paso y la pantalla dice
   "confirmado", no "hecho"—. Libro inmutable: no se edita ni se borra
   desde la aplicación, que es por lo que RN-CIC-13 no las copia a la
   auditoría una por una.';

alter table public.space_onboarding_confirmations enable row level security;

-- RN-CIC-03 · lo ve y lo confirma el propietario. No hay `update` ni
-- `delete`: una confirmación es un hecho con fecha, no una casilla.
create policy space_onboarding_confirmations_select on public.space_onboarding_confirmations
for select using (public.has_capability(space_id, 'manage_space'));

-- ============================================================
-- 4 · El progreso, calculado en el servidor (RN-CIC-02)
-- ============================================================
--
-- Los seis derivados se preguntan a los datos que ya existen; los cuatro
-- restantes solo pueden venir de una confirmación. `source` dice de dónde
-- sale cada "hecho", y es lo que impide que la pantalla enseñe "hecho"
-- donde lo que hay es "el propietario dijo que no le hacía falta".
create or replace function public.space_onboarding_progress(p_space_id uuid)
returns table (ordinal integer, step text, done boolean, source text, confirmed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio ve el asistente de puesta en marcha (§9, RN-CIC-03)';
  end if;

  return query
  with pasos as (select * from public.onboarding_steps()),
  confirmadas as (
    select c.step, c.confirmed_at
    from public.space_onboarding_confirmations c
    where c.space_id = p_space_id
  ),
  espacio as (select * from public.spaces s where s.id = p_space_id),
  datos as (
    select p.step,
           case p.step
             -- Paso 1 · los tres campos de §10 que el espacio hereda.
             when 'space_details' then exists (
               select 1 from espacio e
               where length(btrim(coalesce(e.legal_name, ''))) > 0
                 and length(btrim(coalesce(e.tax_id, ''))) > 0
                 and length(btrim(coalesce(e.address, ''))) > 0
             )
             when 'logo' then exists (
               select 1 from espacio e where length(btrim(coalesce(e.logo_storage_path, ''))) > 0
             )
             -- Paso 4 · hay una versión del calendario contractual, que es
             -- el reloj del que cuelgan los plazos (RN-CLK-10).
             when 'working_hours' then exists (
               select 1 from public.space_working_hours w
               where w.space_id = p_space_id and w.calendar_kind = 'contractual'
             )
             when 'plans_and_services' then
               exists (select 1 from public.plans pl where pl.space_id = p_space_id)
               or exists (select 1 from public.services sv where sv.space_id = p_space_id)
             when 'first_establishment' then exists (
               select 1 from public.establishments es where es.space_id = p_space_id
             )
             -- Paso 8 · invitar cuenta: el paso es del propietario, y
             -- aceptar es de la otra persona. Darlo por no hecho mientras
             -- alguien no contesta sería colgar el asistente de un tercero.
             when 'first_worker' then
               exists (
                 select 1 from public.space_memberships sm
                 where sm.space_id = p_space_id and sm.role = 'worker' and sm.status = 'active'
               )
               or exists (
                 select 1 from public.space_invitations si
                 where si.space_id = p_space_id and si.role = 'worker' and si.status = 'pending'
                   and si.expires_at > now()
               )
             else false
           end as por_dato
    from pasos p
  )
  select p.ordinal,
         p.step,
         (d.por_dato or c.step is not null) as done,
         case
           when d.por_dato then 'data'
           when c.step is not null then 'confirmed'
           else null
         end as source,
         c.confirmed_at
  from pasos p
  join datos d on d.step = p.step
  left join confirmadas c on c.step = p.step
  order by p.ordinal;
end;
$$;

comment on function public.space_onboarding_progress(uuid) is
  'RN-CIC-02 · los diez pasos con si están hechos y POR QUÉ. Comprueba el
   permiso por su cuenta, así que no es interna: el propietario la llama.';

revoke all on function public.space_onboarding_progress(uuid) from public, anon;
grant execute on function public.space_onboarding_progress(uuid) to authenticated;

-- ============================================================
-- 5 · Confirmar un paso, y sellar el final (RN-CIC-02, RN-CIC-04)
-- ============================================================
create or replace function public.confirm_onboarding_step(
  p_space_id uuid,
  p_step text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pendientes integer;
  v_ya_sellado timestamptz;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio completa el asistente de puesta en marcha (§9, RN-CIC-03)';
  end if;

  if not exists (select 1 from public.onboarding_steps() s where s.step = p_step) then
    raise exception 'El asistente de §9 tiene diez pasos y "%" no es ninguno de ellos', p_step;
  end if;

  -- Repetirlo no escribe una fila nueva ni mueve la fecha: la
  -- confirmación es de cuando se hizo.
  insert into public.space_onboarding_confirmations (space_id, step, confirmed_by)
  values (p_space_id, p_step, auth.uid())
  on conflict (space_id, step) do nothing;

  -- RN-CIC-04 · el sello del final. Se pone una vez; si ya estaba, se
  -- queda como estaba.
  select onboarding_completed_at into v_ya_sellado from public.spaces where id = p_space_id;
  if v_ya_sellado is not null then
    return true;
  end if;

  select count(*) into v_pendientes
  from public.space_onboarding_progress(p_space_id) pr
  where not pr.done;

  if v_pendientes > 0 then
    return false;
  end if;

  update public.spaces set onboarding_completed_at = now() where id = p_space_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, auth.uid(), 'space.onboarding_completed', 'space', p_space_id,
          null, jsonb_build_object('steps', 10), null);

  return true;
end;
$$;

comment on function public.confirm_onboarding_step(uuid, text) is
  'RN-CIC-02 · marca un paso como confirmado por el propietario y, si con
   eso quedan los diez hechos, sella el final del asistente (RN-CIC-04).
   Devuelve si el asistente ha terminado.';

revoke all on function public.confirm_onboarding_step(uuid, text) from public, anon;
grant execute on function public.confirm_onboarding_step(uuid, text) to authenticated;

-- ============================================================
-- 5 bis · Dónde se hacen los pasos 1 y 2, que no tenían sitio
-- ============================================================
--
-- `spaces` no tiene política de UPDATE desde la migración 49 —para que no
-- haya una segunda puerta sin auditoría—, así que los datos del espacio y
-- su logotipo se tocan por función, como el nombre y la zona horaria.
create or replace function public.set_space_details(
  p_space_id uuid,
  p_legal_name text,
  p_tax_id text,
  p_address text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario cambia los datos del espacio (§125)';
  end if;

  select legal_name, tax_id, address into v_old from public.spaces where id = p_space_id;

  -- Como `set_space_name()`: si no cambia nada, no se escribe un apunte
  -- que diría "de X a X".
  if v_old.legal_name is not distinct from nullif(btrim(p_legal_name), '')
     and v_old.tax_id is not distinct from nullif(btrim(p_tax_id), '')
     and v_old.address is not distinct from nullif(btrim(p_address), '') then
    return false;
  end if;

  update public.spaces
  set legal_name = nullif(btrim(p_legal_name), ''),
      tax_id = nullif(btrim(p_tax_id), ''),
      address = nullif(btrim(p_address), '')
  where id = p_space_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, auth.uid(), 'space.details_changed', 'space', p_space_id,
          jsonb_build_object('legal_name', v_old.legal_name, 'tax_id', v_old.tax_id, 'address', v_old.address),
          jsonb_build_object('legal_name', nullif(btrim(p_legal_name), ''),
                             'tax_id', nullif(btrim(p_tax_id), ''),
                             'address', nullif(btrim(p_address), '')),
          null);
  return true;
end;
$$;

comment on function public.set_space_details(uuid, text, text, text) is
  '§9 paso 1, §125 · razón social, identificador fiscal y dirección del
   espacio. **Sin validar ninguno**: el bloque legal sigue aplazado
   (§170.1), igual que en `space_requests` (RN-PLA-01).';

revoke all on function public.set_space_details(uuid, text, text, text) from public, anon;
grant execute on function public.set_space_details(uuid, text, text, text) to authenticated;

-- El logotipo (§9 paso 2, §124). Guarda la RUTA, no los bytes: los bytes
-- van al mismo bucket privado que los archivos, y quien los sube es el
-- servidor tras comprobar este permiso.
create or replace function public.set_space_logo(
  p_space_id uuid,
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario cambia el logotipo del espacio (§124)';
  end if;

  select logo_storage_path into v_old from public.spaces where id = p_space_id;
  if v_old is not distinct from nullif(btrim(p_storage_path), '') then
    return false;
  end if;

  update public.spaces
  set logo_storage_path = nullif(btrim(p_storage_path), '')
  where id = p_space_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, auth.uid(), 'space.logo_changed', 'space', p_space_id,
          jsonb_build_object('logo_storage_path', v_old),
          jsonb_build_object('logo_storage_path', nullif(btrim(p_storage_path), '')),
          null);
  return true;
end;
$$;

comment on function public.set_space_logo(uuid, text) is
  '§9 paso 2, §124 · "puede cambiar nombre y logotipo". La ruta, no los
   bytes. §124 no deja cambiar nada más de la identidad visual.';

revoke all on function public.set_space_logo(uuid, text) from public, anon;
grant execute on function public.set_space_logo(uuid, text) to authenticated;

-- ============================================================
-- 6 · El archivado del propietario es un modo más (RN-CIC-07)
-- ============================================================
--
-- `archived_by_owner` se suma a los dos de §4.6 en vez de abrir un estado
-- paralelo, y con eso hereda **toda** la solo lectura que la 90 instaló.
-- Lo único que hay que ensanchar es dónde se pregunta "¿está archivado?",
-- y para que eso no sea una lista repetida en cinco cuerpos de función,
-- primero se le pone nombre.
alter table public.spaces drop constraint if exists spaces_cuotly_status_check;
alter table public.spaces add constraint spaces_cuotly_status_check
  check (cuotly_status is null or cuotly_status in (
    'trial', 'active', 'archived_trial_ended', 'archived_nonpayment', 'archived_by_owner'
  ));

-- `spaces.cuotly_deletion_scheduled_at` es el "después se programa
-- eliminación" de §127, y nada más que eso.
alter table public.spaces add column if not exists cuotly_deletion_scheduled_at timestamptz;

comment on column public.spaces.cuotly_deletion_scheduled_at is
  'RN-CIC-09, §127 · la fecha a partir de la cual la eliminación queda
   PROGRAMADA. **Ningún proceso de Cuotly la ejecuta**: qué se elimina,
   qué se conserva por obligación legal y dónde queda aislado es del
   bloque legal (§170.1, pendiente 20). Se guarda y se enseña.';

create or replace function public.space_status_is_archived(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('archived_trial_ended', 'archived_nonpayment', 'archived_by_owner');
$$;

comment on function public.space_status_is_archived(text) is
  'RN-SUB-08 + RN-CIC-07 · los modos en los que el espacio es de solo
   lectura. Existe para que la lista no viva repetida en cinco cuerpos de
   función: el día que aparezca un cuarto modo archivado, se toca aquí.';

-- Las dos guardas de la 90, redefinidas para preguntar por el nombre en
-- vez de repetir la lista. No cambia nada más de su comportamiento.
create or replace function public.guard_space_cuotly_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('cuotly.space_status_change', true), '') = 'on' then
    return new;
  end if;

  if new.cuotly_status is distinct from old.cuotly_status
     or new.cuotly_plan is distinct from old.cuotly_plan
     or new.cuotly_trial_ends_at is distinct from old.cuotly_trial_ends_at
     or new.cuotly_archived_at is distinct from old.cuotly_archived_at
     or new.cuotly_reactivation_deadline_at is distinct from old.cuotly_reactivation_deadline_at
     or new.cuotly_deletion_scheduled_at is distinct from old.cuotly_deletion_scheduled_at
     or new.cuotly_status_changed_at is distinct from old.cuotly_status_changed_at then
    raise exception 'La suscripción de Cuotly de un espacio se mueve con sus funciones, que la auditan';
  end if;

  -- RN-SUB-08 · el espacio mismo también es de solo lectura (renombrarlo,
  -- cambiar la zona horaria) mientras está archivado, y desde el Hito 20
  -- eso incluye el archivado de su propio dueño.
  if auth.uid() is not null and public.space_status_is_archived(old.cuotly_status) then
    raise exception 'Este espacio está archivado y es de solo lectura: se puede pagar, exportar y contactar con soporte (§4.6, §127)';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_space_cuotly_columns() from public, anon, authenticated;

create or replace function public.guard_space_read_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
  v_status text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if coalesce(current_setting('cuotly.space_status_change', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_space := case when tg_op = 'DELETE' then old.space_id else new.space_id end;
  if v_space is null then
    return coalesce(new, old);
  end if;

  select s.cuotly_status into v_status from public.spaces s where s.id = v_space;
  if public.space_status_is_archived(v_status) then
    raise exception 'Este espacio está archivado y es de solo lectura: se puede pagar, exportar y contactar con soporte (§4.6, §127)';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_space_read_only() from public, anon, authenticated;

-- RN-CIC-07 · el ciclo de impago NO mueve un espacio que su dueño ya
-- terminó: hacerlo borraría su plazo de 30 días y cambiaría el motivo por
-- el que está cerrado. Es el único cambio de comportamiento que esta
-- migración le hace a la 90.
create or replace function public.set_space_cuotly_status_internal(
  p_space_id uuid,
  p_status text,
  p_reason text,
  p_cause text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_now timestamptz := now();
  v_archiving boolean := p_status in ('archived_trial_ended', 'archived_nonpayment');
begin
  select cuotly_status into v_current from public.spaces where id = p_space_id for update;

  if v_current is not distinct from p_status then
    return;
  end if;

  -- RN-CIC-07 · lo terminó su dueño; la deuda no tiene nada que añadir.
  -- Lo saca de ahí `restore_space_by_owner()` y nadie más.
  if v_current = 'archived_by_owner' then
    return;
  end if;

  perform set_config('cuotly.space_status_change', 'on', true);
  update public.spaces
  set cuotly_status = p_status,
      cuotly_status_changed_at = v_now,
      cuotly_archived_at = case when v_archiving then v_now else null end,
      cuotly_reactivation_deadline_at =
        case when v_archiving then v_now + make_interval(days => public.cuotly_constant('reactivation_days')) else null end
  where id = p_space_id;

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (p_space_id, 'space', p_space_id, v_current, p_status, auth.uid(), p_reason, p_cause);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, auth.uid(),
          case
            when p_status = 'archived_trial_ended' then 'space.archived_trial_ended'
            when p_status = 'archived_nonpayment' then 'space.archived_nonpayment'
            when v_current = 'trial' then 'space.activated'
            else 'space.reactivated'
          end,
          'space', p_space_id,
          jsonb_build_object('cuotly_status', v_current),
          jsonb_build_object('cuotly_status', p_status, 'cause', p_cause),
          p_reason);
  perform set_config('cuotly.space_status_change', 'off', true);

  if v_archiving then
    perform public.notify_cuotly_event(
      p_space_id, 'cuotly_space_archived', 'space', p_space_id,
      'cuotly_space_archived:' || p_space_id::text || ':' || to_char(v_now, 'YYYYMMDDHH24MISS'));
  elsif v_current in ('archived_trial_ended', 'archived_nonpayment') then
    perform public.notify_cuotly_event(
      p_space_id, 'cuotly_space_reactivated', 'space', p_space_id,
      'cuotly_space_reactivated:' || p_space_id::text || ':' || to_char(v_now, 'YYYYMMDDHH24MISS'));
  end if;
end;
$$;

revoke all on function public.set_space_cuotly_status_internal(uuid, text, text, text) from public, anon, authenticated;

-- ============================================================
-- 7 · Siempre al menos un propietario (RN-CIC-06)
-- ============================================================
--
-- Por qué un disparador y no una comprobación dentro de las funciones de
-- abajo: `space_memberships_update_owner` deja que cualquiera con
-- `invite_member` —o sea, el propietario— escriba esa tabla **directamente
-- por PostgREST**. Una comprobación metida en una función la esquiva un
-- `update` de una línea, y "ocultar un botón no es un control de acceso"
-- (CLAUDE.md) vale igual para "comprobarlo solo en la función que yo
-- escribí". Un CHECK tampoco sirve: la condición es sobre el CONJUNTO de
-- filas del espacio, no sobre una.
create or replace function public.guard_last_space_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quedan integer;
begin
  -- Cuando lo que se está borrando es el espacio ENTERO, esta fila se va
  -- con él por la clave ajena en cascada y no hay ningún espacio que
  -- pueda quedarse sin dueño. El disparador de la cascada corre después
  -- de que la fila de `spaces` ya no esté, así que preguntar por ella es
  -- la forma exacta de distinguir los dos casos.
  if tg_op = 'DELETE' and not exists (
       select 1 from public.spaces s where s.id = old.space_id
     ) then
    return old;
  end if;

  -- Solo importa cuando la fila DEJA de ser un propietario activo.
  if old.role <> 'owner' or old.status <> 'active' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' and new.status = 'active' then
    return new;
  end if;

  select count(*) into v_quedan
  from public.space_memberships sm
  where sm.space_id = old.space_id
    and sm.role = 'owner'
    and sm.status = 'active'
    and sm.id <> old.id;

  if v_quedan = 0 then
    raise exception 'Un espacio no puede quedarse sin propietario (§127, RN-CIC-06): transfiere la propiedad antes';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_last_space_owner() from public, anon, authenticated;

create trigger space_memberships_guard_last_owner
  before update or delete on public.space_memberships
  for each row execute function public.guard_last_space_owner();

-- ============================================================
-- 8 · El libro del ciclo de vida (RN-CIC-13, RN-CIC-14)
-- ============================================================
--
-- Dónde vive la clave de idempotencia de las operaciones críticas, y de
-- paso el recorrido del espacio contado en una sola tabla. Mismo patrón
-- que `messages.idempotency_key` y `payments.idempotency_key`: la clave
-- vive donde se apunta la operación.
create table public.space_lifecycle_operations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind text not null check (kind in ('ownership_transferred', 'archived', 'restored')),
  actor_id uuid not null references public.profiles (id),
  -- Solo en 'ownership_transferred'.
  from_owner_id uuid references public.profiles (id),
  to_owner_id uuid references public.profiles (id),
  reason text,
  idempotency_key text,
  occurred_at timestamptz not null default now(),
  constraint space_lifecycle_operations_transfer_shape check (
    (kind = 'ownership_transferred') = (to_owner_id is not null)
  )
);

comment on table public.space_lifecycle_operations is
  'RN-CIC-14 · libro inmutable de lo que le pasa al espacio como entidad:
   cambia de dueño, se archiva, se restaura. Es donde vive la clave de
   idempotencia de esas tres operaciones críticas (CLAUDE.md), igual que
   la de un mensaje vive en `messages`. No se edita ni se borra.';

create unique index space_lifecycle_operations_idempotency_idx
  on public.space_lifecycle_operations (space_id, idempotency_key)
  where idempotency_key is not null;

create index space_lifecycle_operations_space_idx
  on public.space_lifecycle_operations (space_id, occurred_at desc);

alter table public.space_lifecycle_operations enable row level security;

-- Del propietario, como la auditoría de `space` (§139): es quién manda en
-- el espacio y cuándo dejó de estar abierto. Sin `insert` ni `update` ni
-- `delete`: solo escriben las funciones de abajo.
create policy space_lifecycle_operations_select on public.space_lifecycle_operations
for select using (public.has_capability(space_id, 'manage_space'));

-- Los dos avisos de RN-CIC-15. `notify_cuotly_event()` de la 90 no sirve
-- tal cual: aquel apunta siempre a `/ajustes/suscripcion` y solo avisa a
-- los propietarios, y aquí el enlace es otro y el archivado le importa a
-- todo el equipo, que se encuentra con el espacio en solo lectura.
create or replace function public.notify_space_lifecycle_event(
  p_space_id uuid,
  p_event_type text,
  p_dedupe_key text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text;
  v_recipient uuid;
  v_sent integer := 0;
begin
  v_link := '/espacios/' || public.space_slug(p_space_id) || '/ajustes';

  for v_recipient in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = p_space_id
      and sm.status = 'active'
      -- Transferir la propiedad es cosa de quien manda; archivar deja a
      -- todo el equipo sin poder escribir, y se lo tienen que decir.
      and (p_event_type <> 'space_ownership_transferred' or sm.role in ('owner', 'admin'))
  loop
    if public.emit_notification(
         p_space_id, v_recipient, p_event_type, 'staff',
         'space', p_space_id, v_link, p_dedupe_key || ':' || v_recipient::text) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.notify_space_lifecycle_event(uuid, text, text) from public, anon, authenticated;

-- ============================================================
-- 9 · Transferir la propiedad (RN-CIC-05, RN-CIC-14)
-- ============================================================
create or replace function public.transfer_space_ownership(
  p_space_id uuid,
  p_to_user_id uuid,
  p_reason text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_target_role text;
  v_op_id uuid;
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión para transferir la propiedad de un espacio';
  end if;

  -- RN-CIC-05 · Modo soporte no transfiere la propiedad ni en nivel
  -- `owner`. RN-ADM-07 le quita invitar porque es "lo único que dejaría
  -- un acceso vivo después de la sesión"; esto lo deja y además con el
  -- espacio en manos de otro.
  if public.support_access_level(p_space_id) is not null then
    raise exception 'Modo soporte no transfiere la propiedad de un espacio (§129, RN-ADM-07, RN-CIC-05)';
  end if;

  -- **La clave se mira ANTES del permiso, y es imprescindible aquí.**
  -- Después de transferir, quien transfirió ya NO es propietario: si el
  -- permiso se comprobara primero, el segundo clic del doble clic se
  -- encontraría con "solo el propietario transfiere" en vez de con la
  -- misma respuesta de antes, que es justo lo que una clave de
  -- idempotencia existe para evitar (CLAUDE.md, RN-CIC-14). Va acotada a
  -- `actor_id = auth.uid()`: solo cortocircuita quien repite lo suyo.
  if p_idempotency_key is not null then
    select id into v_existing
    from public.space_lifecycle_operations
    where space_id = p_space_id and idempotency_key = p_idempotency_key
      and actor_id = v_actor;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario transfiere la propiedad de su espacio (§127, RN-CIC-05)';
  end if;

  if p_to_user_id = v_actor then
    raise exception 'La propiedad ya es tuya';
  end if;

  -- RN-CIC-05 · a un miembro activo del espacio. A quien no está dentro
  -- se le invita, y eso es otra operación (HU-03).
  select role into v_target_role
  from public.space_memberships
  where space_id = p_space_id and user_id = p_to_user_id and status = 'active'
  for update;

  if v_target_role is null then
    raise exception 'La propiedad se transfiere a un miembro activo del espacio (§127, RN-CIC-05): invita antes a quien todavía no está dentro';
  end if;

  -- El orden importa: primero se nombra al nuevo, y así el disparador de
  -- RN-CIC-06 nunca ve el espacio sin propietario.
  update public.space_memberships
  set role = 'owner'
  where space_id = p_space_id and user_id = p_to_user_id;

  update public.space_memberships
  set role = 'admin'
  where space_id = p_space_id and user_id = v_actor;

  insert into public.space_lifecycle_operations
    (space_id, kind, actor_id, from_owner_id, to_owner_id, reason, idempotency_key)
  values (p_space_id, 'ownership_transferred', v_actor, v_actor, p_to_user_id, p_reason, p_idempotency_key)
  returning id into v_op_id;

  -- Sin `state_events`: ese libro es el de `cuotly_status` (RN-SUB-12), y
  -- meterle la propiedad lo convertiría en dos libros dentro de uno. El
  -- recorrido de la propiedad está arriba, en `space_lifecycle_operations`.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, v_actor, 'space.ownership_transferred', 'space', p_space_id,
          jsonb_build_object('owner_id', v_actor, 'role', 'owner'),
          jsonb_build_object('owner_id', p_to_user_id, 'previous_owner_role', 'admin'),
          p_reason);

  -- RN-CIC-15 · obligatorio: es un cambio sensible de §137 y quien
  -- transfiere pierde el mando.
  perform public.notify_space_lifecycle_event(
    p_space_id, 'space_ownership_transferred',
    'space_ownership_transferred:' || v_op_id::text);

  return v_op_id;
end;
$$;

comment on function public.transfer_space_ownership(uuid, uuid, text, text) is
  'RN-CIC-05 · el destinatario pasa a propietario y quien transfiere pasa
   a administrador. No la duplica: la mueve. Con clave de idempotencia
   (RN-CIC-14) y cerrada a Modo soporte.';

revoke all on function public.transfer_space_ownership(uuid, uuid, text, text) from public, anon;
grant execute on function public.transfer_space_ownership(uuid, uuid, text, text) to authenticated;

-- ============================================================
-- 10 · Archivar y restaurar (RN-CIC-07, RN-CIC-08, RN-CIC-09)
-- ============================================================
--
-- §127: "Solo propietario archiva o solicita eliminación. Primero se
-- archiva. Recuperable durante 30 días. Después se programa eliminación."
-- Las cuatro frases están aquí, y la cuarta hace exactamente lo que dice:
-- PROGRAMA. No hay ningún proceso que borre (pendiente 20).
create or replace function public.archive_space_by_owner(
  p_space_id uuid,
  p_reason text,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_current text;
  v_now timestamptz := now();
  v_deadline timestamptz;
  v_op_id uuid;
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión para archivar un espacio';
  end if;

  -- RN-CIC-07 · la sesión de soporte dura horas y el archivado dura
  -- treinta días. No es suya esta decisión.
  if public.support_access_level(p_space_id) is not null then
    raise exception 'Modo soporte no archiva un espacio (§129, RN-ADM-07, RN-CIC-07)';
  end if;

  -- Antes que nada, por lo mismo que en `transfer_space_ownership()`: el
  -- segundo clic se encontraría con "este espacio ya está archivado",
  -- que es un error para algo que sí ocurrió (RN-CIC-14).
  if p_idempotency_key is not null then
    select id into v_existing
    from public.space_lifecycle_operations
    where space_id = p_space_id and idempotency_key = p_idempotency_key
      and actor_id = v_actor;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario archiva su espacio (§127, RN-CIC-07)';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Archivar un espacio exige motivo (§140: propiedad y eliminación piden confirmación)';
  end if;

  select cuotly_status into v_current from public.spaces where id = p_space_id for update;

  if public.space_status_is_archived(v_current) then
    raise exception 'Este espacio ya está archivado';
  end if;

  -- RN-CIC-08 · 30 días. El mismo número que la reactivación de §4.6, y
  -- del mismo sitio: no hay dos plazos distintos que recordar.
  v_deadline := v_now + make_interval(days => public.cuotly_constant('reactivation_days'));

  perform set_config('cuotly.space_status_change', 'on', true);
  update public.spaces
  set cuotly_status = 'archived_by_owner',
      cuotly_status_changed_at = v_now,
      cuotly_archived_at = v_now,
      cuotly_reactivation_deadline_at = v_deadline,
      -- RN-CIC-09 · "después se programa eliminación". Se programa.
      cuotly_deletion_scheduled_at = v_deadline
  where id = p_space_id;
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.space_lifecycle_operations
    (space_id, kind, actor_id, reason, idempotency_key)
  values (p_space_id, 'archived', v_actor, p_reason, p_idempotency_key)
  returning id into v_op_id;

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (p_space_id, 'space', p_space_id, v_current, 'archived_by_owner', v_actor, p_reason, 'owner_request');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, v_actor, 'space.archived_by_owner', 'space', p_space_id,
          jsonb_build_object('cuotly_status', v_current),
          jsonb_build_object('cuotly_status', 'archived_by_owner',
                             'recoverable_until', v_deadline,
                             'deletion_scheduled_at', v_deadline),
          p_reason);

  perform public.notify_space_lifecycle_event(
    p_space_id, 'space_archived_by_owner',
    'space_archived_by_owner:' || v_op_id::text);

  return v_op_id;
end;
$$;

comment on function public.archive_space_by_owner(uuid, text, text) is
  'RN-CIC-07/08/09, §127 · archiva el espacio en solo lectura, lo deja
   recuperable 30 días y PROGRAMA la eliminación para esa fecha. No borra
   nada: el borrado es del bloque legal (§170.1, pendiente 20).';

revoke all on function public.archive_space_by_owner(uuid, text, text) from public, anon;
grant execute on function public.archive_space_by_owner(uuid, text, text) to authenticated;

-- RN-CIC-08 · dentro del plazo lo restaura su propietario; pasado el
-- plazo es de la plataforma, igual que la reactivación tardía de
-- RN-SUB-09. Vuelve al modo que tenía, que se lee del libro de estados.
create or replace function public.restore_space_by_owner(
  p_space_id uuid,
  p_reason text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_current text;
  v_deadline timestamptz;
  v_previous text;
  v_platform boolean := public.is_platform_owner() or public.is_platform_subscription_manager();
  v_op_id uuid;
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión para restaurar un espacio';
  end if;

  -- La clave, antes de todo lo demás: el segundo clic se encontraría con
  -- "este espacio no lo archivó su propietario" —porque el primero ya lo
  -- restauró— en vez de con la misma respuesta (RN-CIC-14).
  if p_idempotency_key is not null then
    select id into v_existing
    from public.space_lifecycle_operations
    where space_id = p_space_id and idempotency_key = p_idempotency_key
      and actor_id = v_actor;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  select cuotly_status, cuotly_reactivation_deadline_at
  into v_current, v_deadline
  from public.spaces where id = p_space_id for update;

  if v_current is distinct from 'archived_by_owner' then
    raise exception 'Este espacio no lo archivó su propietario: si está archivado por prueba o impago, se reactiva pagando (§4.6, RN-SUB-09)';
  end if;

  if not v_platform then
    if public.support_access_level(p_space_id) is not null then
      raise exception 'Modo soporte no restaura un espacio (§129, RN-ADM-07, RN-CIC-08)';
    end if;
    if not public.has_capability(p_space_id, 'manage_space') then
      raise exception 'Solo el propietario restaura su espacio dentro de los 30 días (§127, RN-CIC-08)';
    end if;
    if v_deadline is not null and now() > v_deadline then
      raise exception 'Pasados los 30 días, restaurar este espacio es de la plataforma (RN-CIC-08, como RN-SUB-09)';
    end if;
  end if;

  -- Al modo que tenía antes de archivarse. Si el libro no lo dice —no
  -- puede pasar, porque archivar escribe el evento en la misma
  -- transacción— vuelve a 'active', que es lo único que no inventa un
  -- periodo de prueba que ya no existe.
  select se.from_state into v_previous
  from public.state_events se
  where se.space_id = p_space_id and se.entity_type = 'space'
    and se.to_state = 'archived_by_owner'
  order by se.occurred_at desc, se.id desc
  limit 1;

  perform set_config('cuotly.space_status_change', 'on', true);
  update public.spaces
  set cuotly_status = coalesce(v_previous, 'active'),
      cuotly_status_changed_at = now(),
      cuotly_archived_at = null,
      cuotly_reactivation_deadline_at = null,
      cuotly_deletion_scheduled_at = null
  where id = p_space_id;
  perform set_config('cuotly.space_status_change', 'off', true);

  insert into public.space_lifecycle_operations
    (space_id, kind, actor_id, reason, idempotency_key)
  values (p_space_id, 'restored', v_actor, p_reason, p_idempotency_key)
  returning id into v_op_id;

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (p_space_id, 'space', p_space_id, 'archived_by_owner', coalesce(v_previous, 'active'),
          v_actor, p_reason, case when v_platform then 'platform_restore' else 'owner_request' end);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (p_space_id, v_actor, 'space.restored_by_owner', 'space', p_space_id,
          jsonb_build_object('cuotly_status', 'archived_by_owner'),
          jsonb_build_object('cuotly_status', coalesce(v_previous, 'active'),
                             'by_platform', v_platform),
          p_reason);

  return v_op_id;
end;
$$;

comment on function public.restore_space_by_owner(uuid, text, text) is
  'RN-CIC-08 · saca al espacio del archivado de su dueño y borra la
   eliminación programada. Dentro de los 30 días lo hace el propietario;
   pasados, la plataforma.';

revoke all on function public.restore_space_by_owner(uuid, text, text) from public, anon;
grant execute on function public.restore_space_by_owner(uuid, text, text) to authenticated;

-- ============================================================
-- 11 · Exportación (RN-CIC-10, RN-CIC-11)
-- ============================================================
--
-- **La decisión de diseño del hito, y conviene entenderla entera.** Una
-- exportación es el `select` más grande del producto, y §141 la pide para
-- dos audiencias muy distintas: el propietario del espacio (todo) y el
-- propietario de un restaurante (su grupo o sus establecimientos). La
-- tentación es escribir dos listas de tablas y columnas a mano. CLAUDE.md
-- dice de la identidad del equipo que "nada de esto se sostiene con una
-- lista escrita a mano: se escapó tres veces".
--
-- Así que no hay lista. La función se ejecuta **con la identidad de quien
-- exporta** (`security invoker`), y con eso:
--
--   · las **filas** las decide la RLS, que es la misma que decide lo que
--     esa persona ve en pantalla. Un cliente no exporta `assignments` ni
--     `tasks` porque no las ve (P7, principio de fila);
--   · las **columnas** las decide el privilegio de columna, que es el que
--     tapa `messages.sender_id` y sus veintitantas hermanas (P7,
--     principio de columna). Se enumeran las que `has_column_privilege`
--     concede, nunca `select *`, que sobre esas tablas devuelve 403.
--
-- El equipo tampoco ve en su exportación las columnas revocadas, y eso es
-- correcto y ya estaba decidido: "cuando el equipo sí necesita ver quién
-- hizo qué, sale de `audit_log`" (CLAUDE.md) — y `audit_log` va dentro.
create table public.space_exports (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  -- §141 · las dos audiencias, con los tres alcances que nombra.
  scope text not null check (scope in ('space', 'group', 'establishment')),
  group_id uuid references public.groups (id) on delete cascade,
  establishment_id uuid references public.establishments (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  requested_at timestamptz not null default now(),
  -- Cuántas tablas y filas salieron. No el contenido: una exportación no
  -- se guarda dos veces, se entrega.
  table_count integer not null default 0 check (table_count >= 0),
  row_count integer not null default 0 check (row_count >= 0),
  constraint space_exports_scope_shape check (
    case scope
      when 'space' then group_id is null and establishment_id is null
      when 'group' then group_id is not null and establishment_id is null
      when 'establishment' then establishment_id is not null and group_id is null
    end
  )
);

comment on table public.space_exports is
  'RN-CIC-10/11, §139 · el registro de cada exportación: quién, cuándo y
   con qué alcance. §139 nombra las "exportaciones" entre lo que la
   auditoría registra como mínimo. No guarda el contenido exportado.';

create index space_exports_space_idx on public.space_exports (space_id, requested_at desc);

alter table public.space_exports enable row level security;

-- El propietario del espacio ve todas las de su espacio; quien exportó,
-- la suya. Un propietario de restaurante ve las de su grupo por la
-- segunda rama, que es la que le toca.
create policy space_exports_select on public.space_exports
for select using (
  public.has_capability(space_id, 'manage_space') or requested_by = auth.uid()
);

-- Las columnas de una tabla que **esta sesión** puede leer, en orden.
-- Es el punto en el que P7 deja de ser una promesa: lo que el privilegio
-- revocó no aparece en la lista, y por tanto no aparece en el JSON.
create or replace function public.exportable_columns(p_table text)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(quote_ident(a.attname) order by a.attnum), array[]::text[])
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = p_table
    and a.attnum > 0 and not a.attisdropped
    and has_column_privilege(c.oid, a.attnum, 'select');
$$;

comment on function public.exportable_columns(text) is
  'RN-CIC-11 · las columnas que quien llama puede leer de verdad. `stable`
   y NO `security definer` a propósito: la respuesta depende de quién
   pregunta, y ese es justo el punto.';

revoke all on function public.exportable_columns(text) from public, anon;
grant execute on function public.exportable_columns(text) to authenticated;

-- El JSON. `security invoker`: la RLS y el privilegio de columna de quien
-- llama son los que deciden, y no hay una segunda copia de esas reglas
-- aquí dentro que pueda quedarse vieja.
create or replace function public.build_export_payload(
  p_space_id uuid,
  p_scope text,
  p_group_id uuid default null,
  p_establishment_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tabla record;
  v_columnas text[];
  v_filtro text;
  v_ests text;
  v_datos jsonb;
  v_salida jsonb := '{}'::jsonb;
  v_tablas integer := 0;
  v_filas integer := 0;
begin
  -- Los cuatro vínculos por los que una fila puede ser "del restaurante".
  -- Están aquí y en ningún otro sitio: el día que haga falta un quinto se
  -- toca esta consulta, no una lista de tablas. Todos pasan igualmente
  -- por la RLS de quien exporta, así que ninguno puede ensanchar lo que
  -- esa persona ve; lo único que deciden es qué se le ofrece.
  for v_tabla in
    select c.relname as nombre,
           exists (select 1 from pg_attribute a where a.attrelid = c.oid
                     and a.attname = 'group_id' and a.attnum > 0 and not a.attisdropped) as tiene_grupo,
           exists (select 1 from pg_attribute a where a.attrelid = c.oid
                     and a.attname = 'establishment_id' and a.attnum > 0 and not a.attisdropped) as tiene_establecimiento,
           exists (select 1 from pg_attribute a where a.attrelid = c.oid
                     and a.attname = 'request_id' and a.attnum > 0 and not a.attisdropped) as tiene_solicitud,
           exists (select 1 from pg_attribute a where a.attrelid = c.oid
                     and a.attname = 'conversation_id' and a.attnum > 0 and not a.attisdropped) as tiene_conversacion
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'space_id'
          and a.attnum > 0 and not a.attisdropped
      )
    order by c.relname
  loop
    v_columnas := public.exportable_columns(v_tabla.nombre);
    -- Sin ninguna columna legible no hay nada que exportar de esa tabla.
    if array_length(v_columnas, 1) is null then
      continue;
    end if;

    v_filtro := format('space_id = %L', p_space_id);
    if p_scope <> 'space' then
      -- Los establecimientos del alcance, que es a lo que se reducen los
      -- dos casos: un grupo son los suyos, y un establecimiento es él.
      v_ests := case
        when p_scope = 'group'
          then format('(select id from public.establishments where group_id = %L)', p_group_id)
        else format('(%L::uuid)', p_establishment_id)
      end;

      if v_tabla.tiene_establecimiento then
        v_filtro := v_filtro || format(' and establishment_id in %s', v_ests);
      elsif v_tabla.tiene_grupo then
        v_filtro := v_filtro || case
          when p_scope = 'group' then format(' and group_id = %L', p_group_id)
          else format(' and group_id = (select group_id from public.establishments where id = %L)',
                      p_establishment_id)
        end;
      elsif v_tabla.tiene_solicitud then
        -- Lo que cuelga de una solicitud del restaurante: sus versiones,
        -- sus adjuntos, su conversación.
        v_filtro := v_filtro || format(
          ' and request_id in (select id from public.requests where establishment_id in %s)', v_ests);
      elsif v_tabla.tiene_conversacion then
        -- Y lo que cuelga de esa conversación: sus mensajes, que es la
        -- tabla con la columna de identidad más delicada del proyecto.
        v_filtro := v_filtro || format(
          ' and conversation_id in (select c2.id from public.conversations c2'
          || ' join public.requests r2 on r2.id = c2.request_id'
          || ' where r2.establishment_id in %s)', v_ests);
      else
        -- Una tabla del espacio que no cuelga de ninguno de los cuatro no
        -- es del restaurante: no se exporta en este alcance.
        continue;
      end if;
    end if;

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select %s from public.%I where %s) x',
      array_to_string(v_columnas, ', '), v_tabla.nombre, v_filtro)
    into v_datos;

    if jsonb_array_length(v_datos) > 0 then
      v_salida := v_salida || jsonb_build_object(v_tabla.nombre, v_datos);
      v_tablas := v_tablas + 1;
      v_filas := v_filas + jsonb_array_length(v_datos);
    end if;
  end loop;

  return jsonb_build_object(
    'generated_at', now(),
    'scope', p_scope,
    'space_id', p_space_id,
    'group_id', p_group_id,
    'establishment_id', p_establishment_id,
    'table_count', v_tablas,
    'row_count', v_filas,
    'tables', v_salida
  );
end;
$$;

comment on function public.build_export_payload(uuid, text, uuid, uuid) is
  'RN-CIC-10/11 · el contenido de una exportación. `security invoker`: las
   filas las filtra la RLS de quien llama y las columnas su privilegio de
   columna. Sin lista escrita a mano de ninguna de las dos cosas.';

revoke all on function public.build_export_payload(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.build_export_payload(uuid, text, uuid, uuid) to authenticated;

-- Quién puede exportar qué (§141). Va dentro de la política de
-- `space_exports`, así que conserva el `execute` de `authenticated`:
-- PostgreSQL evalúa esas expresiones con los privilegios de quien
-- consulta, y revocárselo rompería la política entera (CLAUDE.md).
create or replace function public.can_export_scope(
  p_space_id uuid,
  p_scope text,
  p_group_id uuid,
  p_establishment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_scope
    -- §141 · "Propietario del espacio exporta todo su espacio."
    when 'space' then public.has_capability(p_space_id, 'manage_space')
    -- §141 · "Propietario de restaurante exporta grupo o establecimientos
    -- propios." El grupo, su propietario global (§14.1).
    when 'group' then exists (
      select 1 from public.groups g
      where g.id = p_group_id and g.space_id = p_space_id
    ) and public.is_group_member(p_group_id)
    -- Un establecimiento, su propietario local (§14.2) o el propietario
    -- global del grupo al que pertenece. Editor y Consulta no exportan:
    -- §141 dice "propietario".
    when 'establishment' then exists (
      select 1 from public.establishments e
      where e.id = p_establishment_id and e.space_id = p_space_id
        and (
          exists (
            select 1 from public.establishment_memberships em
            where em.establishment_id = e.id and em.user_id = auth.uid()
              and em.revoked_at is null and em.role = 'local_owner'
          )
          or public.is_group_member(e.group_id)
        )
    )
    else false
  end;
$$;

comment on function public.can_export_scope(uuid, text, uuid, uuid) is
  'RN-CIC-10/11, §141 · el espacio lo exporta su propietario; el grupo, su
   propietario global; un establecimiento, su propietario local. Editor y
   Consulta no: §141 dice "propietario".';

revoke all on function public.can_export_scope(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.can_export_scope(uuid, text, uuid, uuid) to authenticated;

create policy space_exports_insert on public.space_exports
for insert with check (
  requested_by = auth.uid()
  and public.can_export_scope(space_id, scope, group_id, establishment_id)
);

-- La puerta. `security invoker` **a propósito y es imprescindible**: una
-- función `security definer` que llamara a `build_export_payload()` la
-- ejecutaría con la identidad del dueño de la función, y la RLS y el
-- privilegio de columna de quien exporta dejarían de aplicar. Es decir:
-- el restaurante se llevaría el espacio entero. Por eso el permiso se
-- comprueba con `can_export_scope()` —la misma que la política— y no
-- levantando privilegios.
create or replace function public.export_space(
  p_space_id uuid,
  p_scope text default 'space',
  p_group_id uuid default null,
  p_establishment_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_payload jsonb;
  v_export_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión para exportar';
  end if;

  if not public.can_export_scope(p_space_id, p_scope, p_group_id, p_establishment_id) then
    raise exception 'No puedes exportar esto (§141, RN-CIC-10/11): el espacio lo exporta su propietario y el grupo o el establecimiento, el suyo';
  end if;

  v_payload := public.build_export_payload(p_space_id, p_scope, p_group_id, p_establishment_id);

  insert into public.space_exports
    (space_id, scope, group_id, establishment_id, requested_by, table_count, row_count)
  values (p_space_id, p_scope, p_group_id, p_establishment_id, auth.uid(),
          (v_payload ->> 'table_count')::integer, (v_payload ->> 'row_count')::integer)
  returning id into v_export_id;

  -- El apunte de §139 lo escribe el disparador de abajo, no esta función:
  -- `audit_log` no tiene política de INSERT y esto corre con la identidad
  -- de quien exporta, que no puede escribirlo.
  return v_payload || jsonb_build_object('export_id', v_export_id);
end;
$$;

comment on function public.export_space(uuid, text, uuid, uuid) is
  'RN-CIC-10/11, §141 · devuelve la exportación como un único JSON y deja
   registro y auditoría. `security invoker`: quien exporta se lleva
   exactamente lo que ve, ni una fila ni una columna más.';

revoke all on function public.export_space(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.export_space(uuid, text, uuid, uuid) to authenticated;

-- El apunte de auditoría de §139 ("exportaciones"), como disparador y no
-- como llamada: `export_space()` corre con la identidad de quien exporta,
-- que no puede escribir en `audit_log` ni debe poder. Así el apunte no se
-- puede falsificar sin que exista de verdad la fila de la exportación,
-- que es lo que la política vigila.
create or replace function public.stamp_export_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (new.space_id, new.requested_by, 'export.requested', 'export', new.id,
          null,
          jsonb_build_object('scope', new.scope, 'group_id', new.group_id,
                             'establishment_id', new.establishment_id,
                             'table_count', new.table_count, 'row_count', new.row_count),
          null);
  return new;
end;
$$;

revoke all on function public.stamp_export_audit() from public, anon, authenticated;

create trigger space_exports_stamp_audit
  after insert on public.space_exports
  for each row execute function public.stamp_export_audit();

-- ============================================================
-- 12 · Qué impide cerrar una cuenta (RN-CIC-12, §141)
-- ============================================================
--
-- §141: "Un usuario no puede eliminar su cuenta si es único propietario
-- de un espacio o grupo. Primero transfiere propiedad o cierra entidades."
--
-- Lo que hay aquí es **la comprobación y su respuesta útil**, con la lista
-- de qué lo impide. **El cierre de la cuenta NO se implementa**: cuánto se
-- conserva, de qué se anonimiza y qué se le entrega antes es del bloque
-- legal (§170.1, pendiente 20). Un "no puedes" sin la lista deja a alguien
-- buscando a ciegas; un borrado inventado deja algo peor.
create or replace function public.account_deletion_blockers()
returns table (kind text, entity_id uuid, entity_name text, remedy text)
language sql
stable
security definer
set search_path = public
as $$
  -- Espacios de los que esta persona es el ÚNICO propietario activo.
  select 'space'::text,
         s.id,
         s.name,
         'transfer_ownership'::text
  from public.spaces s
  join public.space_memberships mine
    on mine.space_id = s.id and mine.user_id = auth.uid()
   and mine.role = 'owner' and mine.status = 'active'
  where (
    select count(*) from public.space_memberships other
    where other.space_id = s.id and other.role = 'owner' and other.status = 'active'
  ) = 1

  union all

  -- Grupos de los que es el único propietario global (§14.1).
  select 'group'::text,
         g.id,
         g.name,
         'transfer_or_close_group'::text
  from public.groups g
  join public.group_memberships mine
    on mine.group_id = g.id and mine.user_id = auth.uid() and mine.revoked_at is null
  where (
    select count(*) from public.group_memberships other
    where other.group_id = g.id and other.revoked_at is null
  ) = 1;
$$;

comment on function public.account_deletion_blockers() is
  'RN-CIC-12, §141 · qué impide cerrar la cuenta de quien pregunta, con
   qué hacer con cada cosa. **No cierra ninguna cuenta**: el cierre es del
   bloque legal (§170.1, pendiente 20). Sin argumento a propósito: nadie
   consulta los bloqueos de otra persona.';

revoke all on function public.account_deletion_blockers() from public, anon;
grant execute on function public.account_deletion_blockers() to authenticated;

-- ============================================================
-- 13 · El catálogo de avisos (RN-CIC-15)
-- ============================================================
alter table public.notifications drop constraint notifications_event_type_check;

-- Sin paréntesis en los comentarios de esta lista, a propósito:
-- `listas-compartidas.test.ts` la lee con una expresión que se corta en el
-- primer cierre.
alter table public.notifications add constraint notifications_event_type_check check (event_type in (
  'request_submitted', 'job_unassigned', 'job_assigned', 'job_started', 'job_published',
  'correction_requested', 'job_reassignment_requested', 'task_reassignment_requested',
  'terms_version_published',
  'menu_publication_requested', 'menu_assigned', 'menu_needs_information', 'menu_published',
  'menu_publication_error', 'menu_not_prepared_reminder', 'menu_publication_overdue',
  'quote_sent', 'quote_accepted', 'quote_rejected',
  'integration_sync_failed', 'integration_reauthorization_required',
  'report_schedule_due_soon', 'report_sent',
  'cuotly_payment_due_soon', 'cuotly_payment_due_today', 'cuotly_payment_overdue_24h',
  'cuotly_payment_overdue_48h', 'cuotly_payment_final_notice',
  'cuotly_space_archived', 'cuotly_space_reactivated',
  'support_session_started',
  -- Hito 20 · el espacio cambia de dueño, o su dueño lo archiva.
  'space_ownership_transferred', 'space_archived_by_owner',
  'consumption_threshold_80', 'consumption_threshold_100',
  't2_threshold_50', 't2_threshold_80', 't2_threshold_100',
  't2_critical_alert', 't2_reassignment_suggestion',
  't3_threshold_75', 't3_threshold_90', 't3_threshold_100',
  'establishment_paused_nonpayment', 'establishment_suspended_nonpayment',
  'establishment_reactivated',
  'absence_requested', 'absence_decided', 'absence_uncovered_jobs'
));

-- RN-CIC-15 · los dos son obligatorios por RN-NOT-03: uno es un cambio
-- sensible de §137 y el otro es una pérdida de acceso para todo el equipo.
create or replace function public.notification_event_is_mandatory(p_event_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_event_type in (
    't2_threshold_100',
    't3_threshold_100',
    'establishment_paused_nonpayment',
    'establishment_suspended_nonpayment',
    'cuotly_payment_final_notice',
    'cuotly_space_archived',
    'support_session_started',
    'space_ownership_transferred',
    'space_archived_by_owner'
  );
$$;

-- ============================================================
-- 14 · La auditoría conoce la familia nueva (RN-CIC-13, §139)
-- ============================================================
--
-- `export` la decide **la fila**: quién ve el apunte de una exportación es
-- quién ve esa exportación, y eso ya lo resuelve la política de
-- `space_exports` —el propietario del espacio, todas; quien exportó, la
-- suya—. Una capacidad fija diría que el propietario del restaurante no
-- ve la exportación que él mismo pidió.
-- `audit_action_capability()` NO se toca: `export` no aparece en su
-- `case`, así que cae en el `else null` y queda como "la decide la fila",
-- que es lo que se quiere. Lo que sí hay que enseñarle a la base es cómo
-- resolver esa fila.
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
    when p_entity_type = 'export' then exists (select 1 from public.space_exports x where x.id = p_entity_id)
    else false
  end;
$$;

revoke all on function public.audit_entity_is_visible(text, uuid) from public, anon;
grant execute on function public.audit_entity_is_visible(text, uuid) to authenticated;

-- ============================================================
-- 15 · Las tres tablas nuevas, dentro de los dos barridos
-- ============================================================
--
-- Los bucles de la 90 y la 91 recorrieron las tablas que existían el día
-- que se escribieron. Estas nacen después, así que se les pone el
-- disparador aquí — o se justifica por qué no, que es lo que las suites
-- 41 y 42 exigen.
--
--   · `space_onboarding_confirmations`: los dos disparadores. En un
--     espacio archivado no se completa el asistente, y en soporte de solo
--     lectura tampoco.
--   · `space_lifecycle_operations`: **exenta del de archivado**, porque
--     archivar y restaurar escriben aquí justo cuando el espacio está
--     archivado. Sí lleva el de soporte, aunque las tres funciones ya
--     rechazan una sesión de soporte por su cuenta: dos cerraduras.
--   · `space_exports`: **exenta del de archivado**, porque RN-SUB-08 dice
--     con todas las letras que un espacio archivado "se puede pagar,
--     exportar y contactar con soporte". Sí lleva el de soporte: en
--     soporte de solo lectura no se exporta un espacio ajeno entero
--     -mínimo privilegio, §129-.
create trigger space_onboarding_confirmations_cuotly_read_only
  before insert or update or delete on public.space_onboarding_confirmations
  for each row execute function public.guard_space_read_only();

create trigger space_onboarding_confirmations_guard_support_read_only
  before insert or update or delete on public.space_onboarding_confirmations
  for each row execute function public.guard_support_read_only();

create trigger space_lifecycle_operations_guard_support_read_only
  before insert or update or delete on public.space_lifecycle_operations
  for each row execute function public.guard_support_read_only();

create trigger space_exports_guard_support_read_only
  before insert or update or delete on public.space_exports
  for each row execute function public.guard_support_read_only();
