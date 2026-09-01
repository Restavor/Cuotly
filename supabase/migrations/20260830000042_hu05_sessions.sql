-- HU-05 · "Como usuario, quiero ver y cerrar mis sesiones activas".
--
-- El Hito 2 se dio por cerrado con "gestión de sesiones" en su lista y lo
-- único que había era cerrar la sesión actual. La tercera revisión lo
-- señaló y no figuraba como salvedad.
--
-- Las sesiones las guarda Supabase Auth en `auth.sessions`, un esquema que
-- PostgREST no expone: no se puede consultar desde el cliente ni con una
-- política de RLS. La vía es una función `SECURITY DEFINER` que filtre por
-- `auth.uid()` — cada uno ve y cierra las suyas y nada más. Es lo mismo que
-- hace el resto del sistema para lo que RLS no alcanza, con la diferencia
-- de que aquí el filtro es la única barrera, así que va escrito dos veces:
-- en el `where` y en la comprobación de propiedad antes de borrar.
--
-- Cerrar una sesión SÍ borra filas, y no contradice el "no borrar
-- físicamente registros de negocio" de CLAUDE.md: una sesión no es un
-- registro de negocio, es una credencial viva. Dejarla marcada como
-- "cerrada" pero presente sería exactamente el fallo. Lo que sí queda es
-- el rastro en `audit_log`.

create or replace function public.my_active_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  refreshed_at timestamptz,
  user_agent text,
  ip text,
  is_current boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    s.id,
    s.created_at,
    coalesce(s.refreshed_at, s.updated_at) as refreshed_at,
    s.user_agent,
    host(s.ip) as ip,
    -- El identificador de la sesión viaja en el propio token: así el
    -- usuario sabe cuál está usando ahora mismo y no la cierra sin querer.
    s.id::text = nullif(current_setting('request.jwt.claim.session_id', true), '') as is_current
  from auth.sessions s
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
  order by coalesce(s.refreshed_at, s.updated_at) desc;
$$;

comment on function public.my_active_sessions() is
  'HU-05: las sesiones activas del usuario que consulta, y solo las suyas.
   `auth.sessions` no la expone PostgREST y no admite RLS, así que el
   filtro por auth.uid() de aquí es la barrera.';

-- A diferencia de casi todo lo demás de este proyecto, esta función SÍ
-- tiene que poder llamarla `authenticated`: es la propia persona
-- consultando lo suyo. `anon` no.
revoke all on function public.my_active_sessions() from public, anon;
grant execute on function public.my_active_sessions() to authenticated;

create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'No hay sesión';
  end if;

  select user_id into v_user_id from auth.sessions where id = p_session_id;

  -- Se comprueba la propiedad antes de borrar, y no solo en el `where`:
  -- si algún día alguien reescribe el borrado, el fallo salta aquí en vez
  -- de dejar que cualquiera cierre la sesión de cualquiera.
  if v_user_id is null then
    return false; -- Idempotente: ya estaba cerrada.
  end if;

  if v_user_id <> v_actor then
    raise exception 'Solo puedes cerrar tus propias sesiones';
  end if;

  delete from auth.sessions where id = p_session_id and user_id = v_actor;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    null, v_actor, 'session.revoked', 'session', p_session_id,
    jsonb_build_object('session_id', p_session_id)
  );

  return true;
end;
$$;

comment on function public.revoke_my_session(uuid) is
  'HU-05: cierra una sesión propia. Borra la credencial —una sesión viva no
   se "archiva"— y deja el rastro en audit_log.';

revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.revoke_my_session(uuid) to authenticated;

-- `audit_log.space_id` era obligatorio y una sesión no pertenece a ningún
-- espacio: un usuario puede no ser miembro de ninguno y aun así tener
-- sesiones que cerrar.
alter table public.audit_log alter column space_id drop not null;

comment on column public.audit_log.space_id is
  'El espacio al que pertenece la acción. Nulo solo para acciones que no
   son de ningún espacio, como cerrar una sesión propia (HU-05).';

-- Y que cada uno vea su propio rastro de sesiones. La política actual
-- exige `space_id is not null`, así que sin esto las filas de HU-05 solo
-- las vería el Propietario de Cuotly — el rastro sería de todos menos del
-- interesado.
drop policy audit_log_select on public.audit_log;

create policy audit_log_select on public.audit_log
  for select using (
    public.is_platform_owner()
    or (space_id is null and actor_id = auth.uid())
    or (
      space_id is not null
      and public.is_space_member(space_id)
      and (
        (action not like 'charge.%' and action not like 'payment.%'
         and action not like 'subscription.%' and action not like 'financial%')
        or public.has_capability(space_id, 'manage_finance')
      )
    )
  );
