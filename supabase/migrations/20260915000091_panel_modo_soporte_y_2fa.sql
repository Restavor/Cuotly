-- Fase 4 · Hito 19 · el panel de Administración de Cuotly, Modo soporte y
-- 2FA (PRD §32, RN-ADM-01 a 12; §128, §129, §136, §137 y §167 de la
-- maestra).
--
-- **Lo que hace distinta a esta migración.** Todo lo anterior CIERRA: cada
-- política del proyecto pregunta "¿pertenece esta persona a este espacio?"
-- y deja fuera a quien no. Aquí se abre a propósito la única puerta que
-- §134 permite —"ningún usuario accede a otro espacio salvo soporte
-- autorizado"— y se abre por el mismo sitio por el que se cierra: las dos
-- funciones que evalúan todas las políticas, `is_space_member()` y
-- `has_capability()`, reconocen una sesión de Modo soporte activa. No hay
-- una excepción por tabla, así que no puede faltar en ninguna.
--
-- **Y por eso la 2FA va en la misma migración.** §136 la hace obligatoria
-- para Bosco y para los Administradores de Cuotly, y entregar Modo soporte
-- sin ella sería entregar la llave sin la cerradura. Se hace cumplir de
-- una sola forma (RN-ADM-02): `is_platform_owner()` —el único punto de
-- verdad de "¿es Bosco?"— exige desde aquí una sesión verificada en dos
-- pasos, y todo lo que cuelga de ella lo hereda. Sin 2FA, Bosco es un
-- usuario normal en sus espacios y ninguna función de plataforma le
-- responde.
--
-- Se comprueba con `supabase/tests/plataforma_panel_soporte_y_2fa.sql`.

-- ============================================================
-- 1 · La sesión verificada en dos pasos (§136, RN-ADM-02)
-- ============================================================
--
-- Supabase Auth pone en el token el nivel de garantía de la sesión:
-- `aal1` con contraseña o Google, `aal2` cuando además se ha pasado el
-- segundo factor. Se leen las DOS formas en que puede llegar el reclamo,
-- igual que `auth.uid()`: el JSON entero (`request.jwt.claims`, lo que usa
-- PostgREST) y el ajuste suelto (`request.jwt.claim.aal`, lo que usan las
-- suites de `supabase/tests/`).
create or replace function public.session_is_two_factor()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    nullif(current_setting('request.jwt.claim.aal', true), '')
  ) = 'aal2';
$$;

comment on function public.session_is_two_factor() is
  '§136, RN-ADM-02 · si la sesión que consulta ha pasado el segundo factor
   (`aal2` en el token de Supabase Auth). Es lo que hace obligatoria la
   2FA para la plataforma: sin ella, `is_platform_owner()` es falso.';

revoke all on function public.session_is_two_factor() from public, anon;
grant execute on function public.session_is_two_factor() to authenticated;

-- El único punto de verdad de "¿es Bosco?" (migración 06), ahora con la
-- cerradura. Aparece dentro de políticas (`audit_log_select`,
-- `platform_roles_select`, `spaces_insert_platform_owner`), así que
-- CONSERVA el EXECUTE de `authenticated` (CLAUDE.md).
create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.session_is_two_factor()
     and exists (
       select 1
       from public.profiles p
       where p.id = auth.uid()
         and lower(p.email) = lower('info@restavor.com')
     );
$$;

comment on function public.is_platform_owner() is
  'Compara el correo del usuario autenticado con CUOTLY_OWNER_EMAIL Y exige
   una sesión verificada en dos pasos (§136, RN-ADM-02). Único punto de
   verdad para "¿es Bosco?" en el servidor — nunca se decide en el cliente
   (MUST de CLAUDE.md). Sin 2FA, Bosco es un usuario normal.';

-- ============================================================
-- 2 · El tercer permiso fino y quién es la plataforma (§167, RN-ADM-01)
-- ============================================================
alter table public.platform_roles
  add column if not exists can_support boolean not null default false;

comment on column public.platform_roles.can_support is
  '§167 · "Modo soporte: Bosco sí; Admin Cuotly si recibe permiso".
   Concederlo es de Bosco y de nadie más (RN-ADM-03).';

-- Un Administrador de Cuotly, con 2FA. Lee el panel entero; actúa solo
-- con su permiso fino.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.session_is_two_factor()
     and exists (select 1 from public.platform_roles pr where pr.user_id = auth.uid());
$$;

comment on function public.is_platform_admin() is
  'RN-ADM-01 · un Administrador de Cuotly (`platform_roles`) con la sesión
   verificada en dos pasos. Vive dentro de la política de
   `support_sessions`, así que conserva el EXECUTE de `authenticated`.';

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.is_platform_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner() or public.is_platform_admin();
$$;

comment on function public.is_platform_member() is
  'RN-ADM-01 · quien puede LEER el panel de Administración de Cuotly: Bosco
   o un Administrador de Cuotly, los dos con 2FA. Actuar exige además el
   permiso fino de §167.';

revoke all on function public.is_platform_member() from public, anon;
grant execute on function public.is_platform_member() to authenticated;

-- Las dos de los hitos 17 y 18, redefinidas para que la rama del
-- Administrador de Cuotly también exija 2FA: `is_platform_owner()` ya lo
-- hace por su cuenta, pero `platform_roles` no sabía nada del token.
create or replace function public.is_platform_approver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
      or (public.is_platform_admin()
          and exists (
            select 1 from public.platform_roles pr
            where pr.user_id = auth.uid() and pr.can_approve_spaces
          ));
$$;

create or replace function public.is_platform_subscription_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
      or (public.is_platform_admin()
          and exists (
            select 1 from public.platform_roles pr
            where pr.user_id = auth.uid() and pr.can_manage_subscriptions
          ));
$$;

create or replace function public.is_platform_supporter()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
      or (public.is_platform_admin()
          and exists (
            select 1 from public.platform_roles pr
            where pr.user_id = auth.uid() and pr.can_support
          ));
$$;

comment on function public.is_platform_supporter() is
  '§167, RN-ADM-06 · quién puede abrir Modo soporte: Bosco siempre, o un
   Administrador de Cuotly con `can_support`. Los dos con 2FA. Vive dentro
   de la política de `support_sessions`, así que conserva el EXECUTE de
   `authenticated` (CLAUDE.md).';

revoke all on function public.is_platform_supporter() from public, anon;
grant execute on function public.is_platform_supporter() to authenticated;

-- Lo que la pantalla necesita para pintar la entrada del selector y para
-- mandar a registrar la 2FA: la IDENTIDAD sin la cerradura. No autoriza
-- nada: cada función vuelve a preguntar por su cuenta con la cerradura
-- puesta. Contesta solo sobre quien pregunta, como `my_active_sessions()`.
create or replace function public.my_platform_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'is_owner', exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and lower(p.email) = lower('info@restavor.com')
    ),
    'is_admin', exists (select 1 from public.platform_roles pr where pr.user_id = auth.uid()),
    'can_approve_spaces', coalesce((select pr.can_approve_spaces from public.platform_roles pr where pr.user_id = auth.uid()), false),
    'can_manage_subscriptions', coalesce((select pr.can_manage_subscriptions from public.platform_roles pr where pr.user_id = auth.uid()), false),
    'can_support', coalesce((select pr.can_support from public.platform_roles pr where pr.user_id = auth.uid()), false),
    'two_factor', public.session_is_two_factor()
  );
$$;

comment on function public.my_platform_access() is
  'RN-ADM-01/02 · la identidad de plataforma de quien pregunta, SIN la
   cerradura de la 2FA, para que el selector sepa a quién enseñarle la
   entrada "Administración de Cuotly" y a quién mandar a registrar el
   segundo factor. No autoriza nada.';

revoke all on function public.my_platform_access() from public, anon;
grant execute on function public.my_platform_access() to authenticated;

-- ============================================================
-- 3 · Nombrar Administrador de Cuotly (§167, RN-ADM-03)
-- ============================================================
--
-- La política de escritura directa de la Fase 1 era una segunda puerta sin
-- auditoría: Bosco podía dar un permiso por PostgREST y no quedaba rastro.
-- Se retira. Desde aquí se escribe solo por las dos funciones.
drop policy if exists platform_roles_write on public.platform_roles;

create or replace function public.set_platform_admin(
  p_user_id uuid,
  p_can_approve_spaces boolean default false,
  p_can_manage_subscriptions boolean default false,
  p_can_support boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.platform_roles;
  v_email text;
begin
  if not public.is_platform_owner() then
    raise exception 'Solo el propietario de Cuotly nombra Administradores de Cuotly (§167)';
  end if;

  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    raise exception 'Esa persona no tiene cuenta en Cuotly';
  end if;
  if lower(v_email) = lower('info@restavor.com') then
    raise exception 'El propietario de Cuotly no se nombra a sí mismo: lo identifica su correo';
  end if;

  select * into v_previous from public.platform_roles where user_id = p_user_id;

  insert into public.platform_roles (user_id, role, can_approve_spaces, can_manage_subscriptions, can_support)
  values (p_user_id, 'cuotly_admin', p_can_approve_spaces, p_can_manage_subscriptions, p_can_support)
  on conflict (user_id) do update
    set can_approve_spaces = excluded.can_approve_spaces,
        can_manage_subscriptions = excluded.can_manage_subscriptions,
        can_support = excluded.can_support;

  if v_previous.user_id is null then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (null, auth.uid(), 'platform.admin_granted', 'platform_role', p_user_id,
            jsonb_build_object('can_approve_spaces', p_can_approve_spaces,
                               'can_manage_subscriptions', p_can_manage_subscriptions,
                               'can_support', p_can_support));
  elsif v_previous.can_approve_spaces is distinct from p_can_approve_spaces
     or v_previous.can_manage_subscriptions is distinct from p_can_manage_subscriptions
     or v_previous.can_support is distinct from p_can_support then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (null, auth.uid(), 'platform.admin_updated', 'platform_role', p_user_id,
            jsonb_build_object('can_approve_spaces', v_previous.can_approve_spaces,
                               'can_manage_subscriptions', v_previous.can_manage_subscriptions,
                               'can_support', v_previous.can_support),
            jsonb_build_object('can_approve_spaces', p_can_approve_spaces,
                               'can_manage_subscriptions', p_can_manage_subscriptions,
                               'can_support', p_can_support));
  end if;
end;
$$;

comment on function public.set_platform_admin(uuid, boolean, boolean, boolean) is
  '§167, RN-ADM-03 · nombra un Administrador de Cuotly, o cambia sus tres
   permisos finos. Solo Bosco. Sin cambio, sin apunte (CA-17).';

revoke all on function public.set_platform_admin(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_platform_admin(uuid, boolean, boolean, boolean) to authenticated;

create or replace function public.revoke_platform_admin(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.platform_roles;
begin
  if not public.is_platform_owner() then
    raise exception 'Solo el propietario de Cuotly retira Administradores de Cuotly (§167)';
  end if;

  select * into v_previous from public.platform_roles where user_id = p_user_id;
  if v_previous.user_id is null then
    return false; -- CA-17.
  end if;

  -- Retirar el rol cierra también cualquier sesión de soporte que tuviera
  -- abierta: la puerta se cerraría sola en la siguiente consulta (RN-ADM-07),
  -- pero el cierre merece su apunte.
  update public.support_sessions
  set ended_at = now(), end_note = 'Rol de Administrador de Cuotly retirado'
  where actor_id = p_user_id and ended_at is null;

  delete from public.platform_roles where user_id = p_user_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value)
  values (null, auth.uid(), 'platform.admin_revoked', 'platform_role', p_user_id,
          jsonb_build_object('can_approve_spaces', v_previous.can_approve_spaces,
                             'can_manage_subscriptions', v_previous.can_manage_subscriptions,
                             'can_support', v_previous.can_support));
  return true;
end;
$$;

comment on function public.revoke_platform_admin(uuid) is
  '§167, RN-ADM-03 · retira el rol de Administrador de Cuotly. Solo Bosco.
   Borra la fila de `platform_roles` porque un rol no es un registro de
   negocio: es un permiso vivo, y el rastro queda en `audit_log`.';

revoke all on function public.revoke_platform_admin(uuid) from public, anon;
grant execute on function public.revoke_platform_admin(uuid) to authenticated;

-- ============================================================
-- 4 · La sesión de Modo soporte (§129, RN-ADM-06)
-- ============================================================
create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  actor_id uuid not null references public.profiles (id),
  -- §129 · "motivo obligatorio".
  reason text not null check (length(btrim(reason)) > 0),
  -- §129 · "mínimo privilegio necesario": el nivel se elige al abrir y se
  -- queda escrito. `read` no escribe nada; `admin` opera como un
  -- administrador sin permisos concedidos; `owner`, como el propietario
  -- salvo invitar (RN-ADM-07).
  access_level text not null check (access_level in ('read', 'admin', 'owner')),
  -- §129 · "fecha y hora" y "duración".
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_note text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  constraint support_sessions_window check (expires_at > started_at),
  constraint support_sessions_end check (ended_at is null or ended_at >= started_at)
);

comment on table public.support_sessions is
  '§129, RN-ADM-06 · una entrada de Cuotly en un espacio ajeno: quién, en
   qué espacio, por qué, con qué nivel, desde y hasta cuándo. Es la ÚNICA
   vía (§134): nada se escribe en `space_memberships`. Las acciones
   realizadas son los apuntes de `audit_log` que llevan su
   `support_session_id`.';

create unique index support_sessions_idempotency_idx
  on public.support_sessions (idempotency_key) where idempotency_key is not null;
-- Una sesión activa por persona y espacio, y la consulta que hacen todas
-- las políticas va por aquí.
create unique index support_sessions_one_active_idx
  on public.support_sessions (actor_id, space_id) where ended_at is null;
create index support_sessions_space_idx on public.support_sessions (space_id, started_at desc);

alter table public.support_sessions enable row level security;

-- La plataforma las ve todas; quien la abrió, la suya; el propietario del
-- espacio, las de su espacio (§129: identidad visible). Ningún
-- administrador ni trabajador: quién de Cuotly entró es cosa del
-- propietario, como la composición del equipo.
create policy support_sessions_select on public.support_sessions
for select
using (
  public.is_platform_member()
  or actor_id = auth.uid()
  or public.has_capability(space_id, 'manage_space')
);

-- Sin políticas de insert, update ni delete: se escribe por las funciones
-- de abajo, que comprueban y dejan rastro.

-- El nivel de la sesión activa de quien consulta sobre ese espacio, o nulo.
-- Interna y en plpgsql a propósito: `is_space_member()` la llama por cada
-- fila que evalúa una política, y la comprobación cara —¿sigue teniendo
-- el permiso?, que lee `profiles` y `platform_roles`— solo se hace cuando
-- HAY una sesión. Sin sesión, es una consulta por índice y nada más.
create or replace function public.support_access_level(p_space_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_level text;
begin
  if auth.uid() is null then
    return null;
  end if;

  select s.access_level into v_level
  from public.support_sessions s
  where s.actor_id = auth.uid()
    and s.space_id = p_space_id
    and s.ended_at is null
    and s.expires_at > now()
  limit 1;

  if v_level is null then
    return null;
  end if;

  -- RN-ADM-07 · retirar el permiso cierra la puerta en la siguiente
  -- consulta, aunque la sesión siga escrita como abierta. Y sin 2FA no
  -- hay plataforma (`is_platform_supporter()` la exige).
  if not public.is_platform_supporter() then
    return null;
  end if;

  return v_level;
end;
$$;

comment on function public.support_access_level(uuid) is
  'RN-ADM-07 · el nivel de Modo soporte con el que quien consulta está
   dentro de ese espacio ahora mismo, o nulo. Interna: la leen
   `is_space_member()`, `has_capability_as()` y el disparador de solo
   lectura.';

revoke all on function public.support_access_level(uuid) from public, anon, authenticated;

create or replace function public.start_support_session(
  p_space_id uuid,
  p_reason text,
  p_access_level text default 'read',
  p_minutes integer default 60,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_space public.spaces;
  v_recipient uuid;
begin
  if not public.is_platform_supporter() then
    raise exception 'Solo Cuotly, con el permiso de Modo soporte y la sesión verificada en dos pasos, entra en un espacio ajeno (§129, §136)';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Modo soporte exige un motivo (§129)';
  end if;
  if p_access_level not in ('read', 'admin', 'owner') then
    raise exception 'Nivel de acceso desconocido: read, admin u owner';
  end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 240 then
    raise exception 'La duración de Modo soporte va de 15 a 240 minutos';
  end if;

  select * into v_space from public.spaces where id = p_space_id;
  if v_space.id is null then
    raise exception 'Espacio no encontrado';
  end if;

  -- RN-ADM-06 · sobre un espacio propio no hay soporte: se entra como
  -- quien se es. Y es una comprobación de verdad: si se abriera igual, la
  -- sesión se estamparía en apuntes que son del miembro, no de Cuotly.
  if exists (
    select 1 from public.space_memberships sm
    where sm.space_id = p_space_id and sm.user_id = auth.uid() and sm.status = 'active'
  ) then
    raise exception 'Ya perteneces a este espacio: entra como miembro, no en Modo soporte';
  end if;

  -- CA-17 · pulsar dos veces devuelve la misma sesión.
  if p_idempotency_key is not null then
    select id into v_id from public.support_sessions where idempotency_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  select id into v_id from public.support_sessions
  where actor_id = auth.uid() and space_id = p_space_id and ended_at is null and expires_at > now();
  if v_id is not null then
    return v_id;
  end if;

  -- Una sesión caducada y no cerrada ocupa el índice de "una activa por
  -- persona y espacio": se cierra aquí, con la fecha en que caducó.
  update public.support_sessions
  set ended_at = expires_at, end_note = coalesce(end_note, 'Caducada')
  where actor_id = auth.uid() and space_id = p_space_id and ended_at is null;

  insert into public.support_sessions (space_id, actor_id, reason, access_level, expires_at, idempotency_key)
  values (p_space_id, auth.uid(), btrim(p_reason), p_access_level,
          now() + make_interval(mins => p_minutes), p_idempotency_key)
  returning id into v_id;

  -- RN-ADM-08 · el apunte va en la auditoría DEL ESPACIO y con la identidad:
  -- el propietario ve quién de Cuotly entró (§129).
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason, support_session_id)
  values (p_space_id, auth.uid(), 'support.session_started', 'support_session', v_id,
          jsonb_build_object('access_level', p_access_level, 'minutes', p_minutes,
                             'expires_at', now() + make_interval(mins => p_minutes)),
          btrim(p_reason), v_id);

  -- RN-ADM-08 · aviso obligatorio a los propietarios del espacio (RN-NOT-03:
  -- es seguridad). El enlace abre su auditoría, donde está el apunte.
  for v_recipient in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = p_space_id and sm.status = 'active' and sm.role = 'owner'
  loop
    perform public.emit_notification(
      p_space_id, v_recipient, 'support_session_started', 'staff',
      'support_session', v_id,
      '/espacios/' || v_space.slug || '/ajustes/auditoria',
      'support_session_started:' || v_id::text || ':' || v_recipient::text);
  end loop;

  return v_id;
end;
$$;

comment on function public.start_support_session(uuid, text, text, integer, text) is
  '§129, RN-ADM-06/08 · abre Modo soporte sobre un espacio ajeno: motivo,
   nivel mínimo, duración; apunte en la auditoría del espacio y aviso
   obligatorio a sus propietarios. Con clave de idempotencia (CA-17).';

revoke all on function public.start_support_session(uuid, text, text, integer, text) from public, anon;
grant execute on function public.start_support_session(uuid, text, text, integer, text) to authenticated;

create or replace function public.end_support_session(p_session_id uuid, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.support_sessions;
begin
  select * into v_session from public.support_sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'Sesión de soporte no encontrada';
  end if;
  -- Quien la abrió, o Bosco. Un Administrador de Cuotly no cierra la de
  -- otro: si hace falta, Bosco le retira el permiso (RN-ADM-03).
  if v_session.actor_id <> auth.uid() and not public.is_platform_owner() then
    raise exception 'Solo quien abrió la sesión de soporte, o el propietario de Cuotly, la cierra';
  end if;
  if v_session.ended_at is not null then
    return false; -- CA-17.
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason, support_session_id)
  values (v_session.space_id, auth.uid(), 'support.session_ended', 'support_session', v_session.id,
          jsonb_build_object('started_at', v_session.started_at, 'access_level', v_session.access_level),
          jsonb_build_object('ended_at', now(),
                             'duration_minutes', floor(extract(epoch from (least(now(), v_session.expires_at) - v_session.started_at)) / 60)),
          nullif(btrim(coalesce(p_note, '')), ''), v_session.id);

  update public.support_sessions
  set ended_at = now(), end_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_session.id;

  return true;
end;
$$;

comment on function public.end_support_session(uuid, text) is
  'RN-ADM-06 · cierra una sesión de Modo soporte antes de que caduque, con
   su apunte. Cerrar dos veces no hace nada (CA-17).';

revoke all on function public.end_support_session(uuid, text) from public, anon;
grant execute on function public.end_support_session(uuid, text) to authenticated;

-- Lo que el armazón necesita para pintar la banda "Estás en Modo soporte":
-- la sesión activa de quien pregunta sobre ese espacio. Filtra por
-- `auth.uid()`, como `my_active_sessions()`.
create or replace function public.my_support_session(p_space_id uuid)
returns table (id uuid, access_level text, reason text, started_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.access_level, s.reason, s.started_at, s.expires_at
  from public.support_sessions s
  where s.actor_id = auth.uid()
    and s.space_id = p_space_id
    and s.ended_at is null
    and s.expires_at > now()
    and public.is_platform_supporter()
  limit 1;
$$;

revoke all on function public.my_support_session(uuid) from public, anon;
grant execute on function public.my_support_session(uuid) to authenticated;

-- ============================================================
-- 5 · La puerta: `is_space_member()` y `has_capability_as()` (RN-ADM-07)
-- ============================================================
--
-- Las dos funciones por las que pasan TODAS las políticas del proyecto
-- (migración 07). En plpgsql y con corte explícito: primero la pertenencia
-- real, que es lo que hay en el 99,99 % de las consultas; solo si no la
-- hay se mira la sesión de soporte, que es una consulta por índice.
create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.space_memberships sm
    where sm.space_id = p_space_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
  ) then
    return true;
  end if;

  -- §134 · "salvo soporte autorizado". La única excepción, y está aquí y
  -- no en las tablas.
  return public.support_access_level(p_space_id) is not null;
end;
$$;

comment on function public.is_space_member(uuid) is
  'SECURITY DEFINER a propósito: evita la recursión de RLS al consultar
   space_memberships desde sus propias políticas. No decide permisos
   finos, solo "¿pertenece este usuario a este espacio, en activo?" — o,
   desde el Hito 19, "¿está dentro en Modo soporte?" (§134, RN-ADM-07).';

-- La misma de la migración 84, con la rama de soporte. Solo cuando quien
-- pregunta es quien consulta (`p_user_id = auth.uid()`): las llamadas
-- sobre terceros —"¿puede este trabajador hacer trabajos?"— siguen
-- mirando la pertenencia real y nada más.
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
  v_support text;
begin
  select sm.role, sm.can_perform_jobs, sm.can_approve_reports
  into v_role, v_can_perform_jobs, v_can_approve_reports
  from public.space_memberships sm
  where sm.space_id = p_space_id
    and sm.user_id = p_user_id
    and sm.status = 'active';

  if v_role is null and p_user_id = auth.uid() then
    v_support := public.support_access_level(p_space_id);
    -- RN-ADM-07 · `read` no tiene NINGUNA capacidad; `admin` opera como un
    -- administrador sin permisos concedidos; `owner`, como el propietario.
    if v_support in ('admin', 'owner') then
      v_role := v_support::public.space_role;
      v_can_perform_jobs := false;
      v_can_approve_reports := false;
    end if;
  end if;

  if v_role is null then
    return false;
  end if;

  return case p_capability
    when 'manage_space' then v_role = 'owner'
    -- RN-ADM-07 · lo único que Modo soporte no puede hacer ni como
    -- propietario: dejar a alguien dentro cuando la sesión acabe.
    when 'invite_member' then v_role = 'owner' and v_support is null
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
    when 'approve_reports' then
      v_role = 'owner'
      or (v_role = 'admin' and coalesce(v_can_approve_reports, false))
    else false
  end;
end;
$$;

revoke all on function public.has_capability_as(uuid, uuid, text) from public, anon, authenticated;

-- ============================================================
-- 6 · Solo lectura en soporte (RN-ADM-07): un disparador en toda tabla
--     con `space_id`, como el modo lectura de la 90
-- ============================================================
--
-- Con `read`, `is_space_member()` es verdadero y hay políticas de escritura
-- que solo preguntan eso (un mensaje, un archivo). Que la pantalla no
-- ofrezca el botón no es un control de acceso: lo que cierra es esto.
create or replace function public.guard_support_read_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  v_space := case when tg_op = 'DELETE' then old.space_id else new.space_id end;
  if v_space is null then
    return coalesce(new, old);
  end if;

  if public.support_access_level(v_space) = 'read' then
    raise exception 'Estás en Modo soporte de solo lectura: este espacio no se puede modificar (§129, RN-ADM-07)';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_support_read_only() from public, anon, authenticated;

-- Las exentas, con el mismo criterio que la 90: los libros y los avisos
-- que la propia sesión tiene que escribir, y la sesión misma (cerrarla es
-- una escritura de quien está en solo lectura). `space_requests` es de
-- plataforma. Un miembro de verdad nunca tiene sesión de soporte sobre su
-- espacio (RN-ADM-06), así que a nadie del equipo le afecta.
do $$
declare
  v_tabla text;
begin
  for v_tabla in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'space_id' and a.attnum > 0 and not a.attisdropped
      )
      and c.relname not in (
        'audit_log', 'state_events', 'notifications', 'notification_deliveries',
        'space_requests', 'support_sessions'
      )
  loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function public.guard_support_read_only()',
      v_tabla || '_guard_support_read_only', v_tabla);
  end loop;
end $$;

-- ============================================================
-- 7 · Las acciones realizadas (§129, RN-ADM-08): el sello en `audit_log`
-- ============================================================
alter table public.audit_log
  add column if not exists support_session_id uuid references public.support_sessions (id);

comment on column public.audit_log.support_session_id is
  '§129, RN-ADM-08 · si el apunte lo dejó alguien de Cuotly dentro de una
   sesión de Modo soporte, cuál. Lo estampa un disparador; es lo que hace
   que "acciones realizadas" sea una consulta y no una promesa.';

create index audit_log_support_session_idx
  on public.audit_log (support_session_id) where support_session_id is not null;

create or replace function public.stamp_support_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.support_session_id is null and new.actor_id is not null and new.space_id is not null then
    select s.id into new.support_session_id
    from public.support_sessions s
    where s.actor_id = new.actor_id
      and s.space_id = new.space_id
      and s.ended_at is null
      and s.expires_at > now()
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_support_session() from public, anon, authenticated;

create trigger audit_log_stamp_support_session
  before insert on public.audit_log
  for each row execute function public.stamp_support_session();

-- El sello se lee, y sigue sin haber política de UPDATE ni DELETE.
grant select (support_session_id) on public.audit_log to authenticated;

-- ============================================================
-- 8 · El aviso obligatorio (RN-ADM-08, RN-NOT-03)
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
  -- Hito 19 · alguien de Cuotly ha entrado en el espacio en Modo soporte.
  'support_session_started',
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
  'request', 'job', 'task', 'establishment', 'charge', 'absence', 'menu', 'quote', 'integration', 'report',
  'cuotly_charge', 'space', 'support_session'
));

-- RN-NOT-03 · "seguridad … no puede desactivarse": que alguien de Cuotly
-- haya entrado en tu espacio es seguridad. Mismo espejo en `MANDATORY_EVENTS`.
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
    'support_session_started'
  );
$$;

-- ============================================================
-- 9 · La auditoría conoce las dos familias nuevas (§21.2)
-- ============================================================
--
-- `support` es del propietario del espacio (`manage_space`): quién de
-- Cuotly entró en su espacio es tan suyo como quién está en su equipo.
-- `platform` no es de ningún espacio: sus apuntes llevan `space_id` nulo
-- y los ven Bosco y quien hizo la acción (la tercera rama de
-- `audit_log_select`), como `space_request`.
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
    when 'report' then 'manage_clients'
    when 'cuotly_charge' then 'manage_space'
    when 'cuotly_payment' then 'manage_space'
    when 'support' then 'manage_space'
    else null
  end;
$$;

-- ============================================================
-- 10 · El panel (§128, RN-ADM-04)
-- ============================================================
--
-- La plataforma no es miembro de ningún espacio y ninguna política la deja
-- pasar; lo que la deja pasar son estas funciones, que comprueban primero
-- quién pregunta. Todas de lectura. Ninguna añade una vía por PostgREST.

-- Los doce bloques en cifras. `incidents` va a nulo a propósito: son el
-- Hito 21 y la pantalla lo dice con su motivo (CA-20), no con un cero.
create or replace function public.platform_panel_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'spaces_total', (select count(*) from public.spaces),
    'spaces_trial', (select count(*) from public.spaces where cuotly_status = 'trial'),
    'spaces_active', (select count(*) from public.spaces where cuotly_status = 'active'),
    'spaces_archived', (select count(*) from public.spaces where cuotly_status in ('archived_trial_ended', 'archived_nonpayment')),
    'spaces_without_plan', (select count(*) from public.spaces where cuotly_status is null),
    'requests_pending', (select count(*) from public.space_requests where status in ('submitted', 'in_review', 'needs_information')),
    'requests_submitted', (select count(*) from public.space_requests where status in ('submitted', 'in_review')),
    'subscriptions_total', (select count(*) from public.cuotly_subscriptions),
    'revenue_total_cents', (select coalesce(-sum(amount_cents), 0) from public.cuotly_ledger_entries where entry_type in ('payment', 'payment_reversal')),
    'revenue_month_cents', (select coalesce(-sum(amount_cents), 0) from public.cuotly_ledger_entries
                              where entry_type in ('payment', 'payment_reversal')
                                and created_at >= date_trunc('month', now())),
    'overdue_charges', (select count(*) from public.cuotly_charges c where public.cuotly_charge_status(c.id) = 'overdue'),
    'overdue_cents', (select coalesce(sum(public.cuotly_charge_outstanding_cents(c.id)), 0) from public.cuotly_charges c where public.cuotly_charge_status(c.id) = 'overdue'),
    'declared_payments_pending', (select count(*) from public.cuotly_payments where confirmed_at is null and rejected_at is null),
    'storage_bytes_total', (select coalesce(sum(size_bytes), 0) from public.file_versions),
    'activity_24h', (select count(*) from public.audit_log where created_at >= now() - interval '24 hours'),
    'incidents', null,
    'support_sessions_active', (select count(*) from public.support_sessions where ended_at is null and expires_at > now()),
    'support_sessions_total', (select count(*) from public.support_sessions),
    'platform_audit_total', (select count(*) from public.audit_log
                               where space_id is null
                                  or split_part(action, '.', 1) in ('space_request', 'cuotly_charge', 'cuotly_payment', 'support', 'platform'))
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_panel_summary() from public, anon;
grant execute on function public.platform_panel_summary() to authenticated;

-- Usuarios (§128): cuentas, a cuántos espacios pertenecen, y si tienen el
-- segundo factor registrado, que es lo que Bosco necesita saber antes de
-- nombrar a alguien Administrador de Cuotly (§136).
create or replace function public.platform_list_users(p_limit integer default 200, p_offset integer default 0)
returns table (
  id uuid, email text, full_name text, created_at timestamptz,
  spaces_count integer, is_owner boolean, is_admin boolean,
  can_approve_spaces boolean, can_manage_subscriptions boolean, can_support boolean,
  two_factor_enrolled boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select p.id, p.email, p.full_name, p.created_at,
      (select count(*)::integer from public.space_memberships sm where sm.user_id = p.id and sm.status = 'active'),
      lower(p.email) = lower('info@restavor.com'),
      pr.user_id is not null,
      coalesce(pr.can_approve_spaces, false),
      coalesce(pr.can_manage_subscriptions, false),
      coalesce(pr.can_support, false),
      exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
    from public.profiles p
    left join public.platform_roles pr on pr.user_id = p.id
    order by p.created_at desc
    limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.platform_list_users(integer, integer) from public, anon;
grant execute on function public.platform_list_users(integer, integer) to authenticated;

-- Espacios, suscripciones, pruebas activas, impagos y almacenamiento
-- (§128): una fila por espacio con todo lo que esos cinco bloques
-- necesitan, que es la misma fila mirada desde cinco sitios.
create or replace function public.platform_list_spaces()
returns table (
  id uuid, name text, slug text, created_at timestamptz,
  cuotly_status text, cuotly_plan text,
  cuotly_trial_ends_at timestamptz, cuotly_archived_at timestamptz, cuotly_reactivation_deadline_at timestamptz,
  current_period_end timestamptz, pending_plan text,
  owner_emails text,
  active_establishments integer, internal_users integer, storage_bytes bigint,
  outstanding_cents integer, overdue_cents integer, has_pending_declaration boolean,
  support_active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select s.id, s.name, s.slug, s.created_at,
      s.cuotly_status, s.cuotly_plan,
      s.cuotly_trial_ends_at, s.cuotly_archived_at, s.cuotly_reactivation_deadline_at,
      sub.current_period_end, sub.pending_plan,
      (select string_agg(p.email, ', ' order by p.email)
         from public.space_memberships sm join public.profiles p on p.id = sm.user_id
        where sm.space_id = s.id and sm.status = 'active' and sm.role = 'owner'),
      (select count(*)::integer from public.establishments e where e.space_id = s.id and e.status <> 'archived'),
      (select count(*)::integer from public.space_memberships sm where sm.space_id = s.id and sm.status = 'active'),
      (select coalesce(sum(fv.size_bytes), 0)::bigint from public.file_versions fv where fv.space_id = s.id),
      (select coalesce(sum(public.cuotly_charge_outstanding_cents(c.id)), 0)::integer
         from public.cuotly_charges c where c.space_id = s.id),
      (select coalesce(sum(public.cuotly_charge_outstanding_cents(c.id)), 0)::integer
         from public.cuotly_charges c where c.space_id = s.id and public.cuotly_charge_status(c.id) = 'overdue'),
      exists (select 1 from public.cuotly_payments cp where cp.space_id = s.id and cp.confirmed_at is null and cp.rejected_at is null),
      exists (select 1 from public.support_sessions ss where ss.space_id = s.id and ss.ended_at is null and ss.expires_at > now())
    from public.spaces s
    left join public.cuotly_subscriptions sub on sub.space_id = s.id
    order by s.created_at desc;
end;
$$;

revoke all on function public.platform_list_spaces() from public, anon;
grant execute on function public.platform_list_spaces() to authenticated;

-- Impagos e ingresos (§128): los cobros con su estado derivado
-- (RN-SUB-06) y el nombre del espacio, que la política de `cuotly_charges`
-- no puede dar porque `spaces` no se lee desde fuera.
create or replace function public.platform_list_charges(p_open_only boolean default true)
returns table (
  id uuid, space_id uuid, space_name text, space_slug text,
  reference text, concept text, kind text,
  total_cents integer, outstanding_cents integer, status text,
  period_start timestamptz, period_end timestamptz, due_at timestamptz, issued_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select c.id, c.space_id, s.name, s.slug,
      c.reference, c.concept, c.kind,
      c.total_cents, public.cuotly_charge_outstanding_cents(c.id), public.cuotly_charge_status(c.id),
      c.period_start, c.period_end, c.due_at, c.issued_at
    from public.cuotly_charges c
    join public.spaces s on s.id = c.space_id
    where not p_open_only or public.cuotly_charge_status(c.id) <> 'paid'
    order by c.due_at asc;
end;
$$;

revoke all on function public.platform_list_charges(boolean) from public, anon;
grant execute on function public.platform_list_charges(boolean) to authenticated;

-- Los pagos declarados que esperan la confirmación humana de §4.5.
create or replace function public.platform_list_pending_payments()
returns table (
  id uuid, space_id uuid, space_name text, charge_id uuid, charge_reference text,
  amount_cents integer, method text, paid_at timestamptz,
  receipt_reference text, note text, declared_side text, declared_at timestamptz, declared_by_email text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select p.id, p.space_id, s.name, p.charge_id, c.reference,
      p.amount_cents, p.method, p.paid_at,
      p.receipt_reference, p.note, p.declared_side, p.declared_at, pr.email
    from public.cuotly_payments p
    join public.spaces s on s.id = p.space_id
    join public.cuotly_charges c on c.id = p.charge_id
    join public.profiles pr on pr.id = p.declared_by
    where p.confirmed_at is null and p.rejected_at is null
    order by p.declared_at asc;
end;
$$;

revoke all on function public.platform_list_pending_payments() from public, anon;
grant execute on function public.platform_list_pending_payments() to authenticated;

-- Ingresos por mes (§128): lo que dice el libro —pagos confirmados menos
-- reversiones—, en la zona horaria de Cuotly. Una cifra de libro, no una
-- factura: la numeración fiscal es la pendiente 20.
create or replace function public.platform_revenue_by_month(p_months integer default 12)
returns table (month date, paid_cents bigint, payments integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select (date_trunc('month', e.created_at at time zone 'Europe/Madrid'))::date,
      -sum(e.amount_cents)::bigint,
      count(*) filter (where e.entry_type = 'payment')::integer
    from public.cuotly_ledger_entries e
    where e.entry_type in ('payment', 'payment_reversal')
      and e.created_at >= date_trunc('month', now() at time zone 'Europe/Madrid') - make_interval(months => greatest(p_months, 1) - 1)
    group by 1
    order by 1 desc;
end;
$$;

revoke all on function public.platform_revenue_by_month(integer) from public, anon;
grant execute on function public.platform_revenue_by_month(integer) to authenticated;

-- Actividad y auditoría (§128). `platform`: los apuntes de plataforma —sin
-- espacio, o de las familias que decide Cuotly—. `all`: los últimos de
-- todos los espacios, que es la actividad. Con la identidad del actor: es
-- Bosco mirando su plataforma, no un cliente mirando al equipo (P7 no
-- aplica aquí).
create or replace function public.platform_audit(
  p_scope text default 'platform',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, created_at timestamptz, space_id uuid, space_name text,
  actor_id uuid, actor_email text, action text, entity_type text, entity_id uuid,
  old_value jsonb, new_value jsonb, reason text, support_session_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;
  if p_scope not in ('platform', 'all') then
    raise exception 'Ámbito desconocido: platform o all';
  end if;

  return query
    select a.id, a.created_at, a.space_id, s.name,
      a.actor_id, p.email, a.action, a.entity_type, a.entity_id,
      a.old_value, a.new_value, a.reason, a.support_session_id
    from public.audit_log a
    left join public.spaces s on s.id = a.space_id
    left join public.profiles p on p.id = a.actor_id
    where p_scope = 'all'
       or a.space_id is null
       or split_part(a.action, '.', 1) in ('space_request', 'cuotly_charge', 'cuotly_payment', 'support', 'platform')
    order by a.created_at desc
    limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.platform_audit(text, integer, integer) from public, anon;
grant execute on function public.platform_audit(text, integer, integer) to authenticated;

-- Soporte (§128): las sesiones, abiertas y pasadas, con cuántas acciones
-- dejó cada una.
create or replace function public.platform_list_support_sessions(p_limit integer default 100)
returns table (
  id uuid, space_id uuid, space_name text, space_slug text,
  actor_id uuid, actor_email text, reason text, access_level text,
  started_at timestamptz, expires_at timestamptz, ended_at timestamptz, end_note text,
  is_active boolean, actions_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Cuotly, con la sesión verificada en dos pasos, lee el panel de Administración (§128, §136)';
  end if;

  return query
    select ss.id, ss.space_id, s.name, s.slug,
      ss.actor_id, p.email, ss.reason, ss.access_level,
      ss.started_at, ss.expires_at, ss.ended_at, ss.end_note,
      ss.ended_at is null and ss.expires_at > now(),
      (select count(*)::integer from public.audit_log a
        where a.support_session_id = ss.id and a.action not in ('support.session_started', 'support.session_ended'))
    from public.support_sessions ss
    join public.spaces s on s.id = ss.space_id
    join public.profiles p on p.id = ss.actor_id
    order by ss.started_at desc
    limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.platform_list_support_sessions(integer) from public, anon;
grant execute on function public.platform_list_support_sessions(integer) to authenticated;

-- Las acciones realizadas en una sesión (§129): para la plataforma y para
-- el propietario del espacio, que es quien tiene derecho a saber qué se
-- hizo dentro de lo suyo.
create or replace function public.support_session_actions(p_session_id uuid)
returns table (
  id uuid, created_at timestamptz, action text, entity_type text, entity_id uuid,
  old_value jsonb, new_value jsonb, reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space uuid;
begin
  select ss.space_id into v_space from public.support_sessions ss where ss.id = p_session_id;
  if v_space is null then
    raise exception 'Sesión de soporte no encontrada';
  end if;
  if not (public.is_platform_member() or public.has_capability(v_space, 'manage_space')) then
    raise exception 'Solo Cuotly o el propietario del espacio ven lo que se hizo en una sesión de soporte';
  end if;

  return query
    select a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.old_value, a.new_value, a.reason
    from public.audit_log a
    where a.support_session_id = p_session_id
      -- Abrir y cerrar son la sesión misma, no lo que se hizo dentro: la
      -- fila de `support_sessions` ya lo cuenta. Mismo criterio que
      -- `actions_count` en `platform_list_support_sessions()`.
      and a.action not in ('support.session_started', 'support.session_ended')
    order by a.created_at asc;
end;
$$;

revoke all on function public.support_session_actions(uuid) from public, anon;
grant execute on function public.support_session_actions(uuid) to authenticated;
