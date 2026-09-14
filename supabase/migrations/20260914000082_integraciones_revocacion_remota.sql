-- Fase 3 · Hito 14 · Integraciones: la revocación remota del token, hecha
-- por el proceso de la cola (RN-INT-06, RN-INT-08; §119 y §163 de la
-- maestra).
--
-- La 81 dejó dicho que desconectar una integración con OAuth "deja
-- pendiente la revocación remota del token, que hace el proceso de la
-- cola" (`integrations.external_revocation_pending`). Lo que faltaba era
-- la puerta: `read_integration_credential()` solo devuelve la credencial
-- VIGENTE, y desconectar la marca como revocada antes de que la cola
-- llegue a leerla. Sin el token, Google no tiene nada que revocar, y la
-- columna se habría quedado en `true` para siempre.
--
-- Tres funciones, las tres reservadas a `service_role`:
--
--   · `pending_integration_revocations()` — lo que hay que revocar.
--   · `read_revoked_integration_token()` — el texto cifrado del token ya
--     revocado en la base, solo mientras la revocación remota siga
--     pendiente. Es la segunda y última puerta a `ciphertext`.
--   · `record_integration_revocation_attempt()` — el resultado. RN-INT-08
--     dice que la revocación remota "se reintenta una vez": el primer
--     intento que falla por algo transitorio se repite en la siguiente
--     tanda, y el segundo fallo cierra la pendiente con su motivo en la
--     auditoría. Un token que Google ya no reconoce cuenta como revocado.
--
-- Nada de esto lo ve ni lo toca una sesión de persona: la columna nueva
-- no entra en el `grant select` de la 81, y las funciones pierden el
-- EXECUTE de `public`, `anon` y `authenticated` (CLAUDE.md).

alter table public.integrations
  add column external_revocation_attempts integer not null default 0
    check (external_revocation_attempts >= 0);

comment on column public.integrations.external_revocation_attempts is
  'RN-INT-08 · cuántas veces el proceso de la cola intentó revocar el token
   en Google. Dos como máximo: el segundo fallo cierra la pendiente.';

-- ============================================================
-- 1 · Lo pendiente de revocar
-- ============================================================

create or replace function public.pending_integration_revocations(p_limit integer default 10)
returns table (
  integration_id uuid,
  space_id uuid,
  establishment_id uuid,
  provider text,
  attempts integer
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.space_id, i.establishment_id, i.provider, i.external_revocation_attempts
  from public.integrations i
  where i.external_revocation_pending
    and i.auth_kind = 'oauth'
  order by i.disconnected_at nulls first, i.id
  limit greatest(coalesce(p_limit, 10), 0);
$$;

revoke all on function public.pending_integration_revocations(integer) from public, anon, authenticated;

-- ============================================================
-- 2 · El token ya revocado en la base, para revocarlo en Google
-- ============================================================

-- Solo mientras la revocación remota siga pendiente: cerrada, el texto
-- cifrado deja de tener puerta, igual que cualquier credencial sustituida.
create or replace function public.read_revoked_integration_token(p_integration_id uuid)
returns table (ciphertext text, key_version integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.ciphertext, c.key_version
  from public.integration_credentials c
  join public.integrations i on i.id = c.integration_id
  where c.integration_id = p_integration_id
    and c.kind = 'oauth_refresh_token'
    and c.revoked_at is not null
    and i.external_revocation_pending
  order by c.created_at desc
  limit 1;
$$;

revoke all on function public.read_revoked_integration_token(uuid) from public, anon, authenticated;

-- ============================================================
-- 3 · El resultado de un intento
-- ============================================================

-- RN-INT-08 · "reintentar solo operaciones seguras (...) una revocación
-- remota, una vez". Correcta: cerrada. Fallida: si es el primer intento
-- queda pendiente para la siguiente tanda; si es el segundo, se cierra
-- con el motivo en la auditoría, porque seguir llamando a Google con un
-- token que quizá ya no existe no es una operación segura. El error llega
-- ya pasado por el filtro de secretos del proceso (`sanitizeSyncError()`)
-- y aquí se recorta a 500, como en `finish_integration_run()`.
-- Idempotente: cerrada una vez, la segunda llamada no hace nada.
create or replace function public.record_integration_revocation_attempt(
  p_integration_id uuid,
  p_ok boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_int public.integrations;
  v_attempts integer;
  v_done boolean;
  v_error text := left(p_error, 500);
begin
  select * into v_int from public.integrations where id = p_integration_id for update;
  if v_int.id is null then
    raise exception 'Integración no encontrada';
  end if;
  if not v_int.external_revocation_pending then
    return false; -- CA-17
  end if;
  if p_ok is null then
    raise exception 'Un intento de revocación necesita su resultado';
  end if;
  if not p_ok and (v_error is null or length(trim(v_error)) = 0) then
    raise exception 'Un intento de revocación fallido necesita su motivo (RN-INT-08)';
  end if;

  v_attempts := v_int.external_revocation_attempts + 1;
  v_done := p_ok or v_attempts >= 2;

  update public.integrations
  set external_revocation_attempts = v_attempts,
      external_revocation_pending = not v_done,
      updated_at = now()
  where id = p_integration_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_int.space_id, null,
          case when p_ok then 'integration.revocation_done' else 'integration.revocation_failed' end,
          'integration', p_integration_id,
          jsonb_build_object('external_revocation_pending', true,
                             'attempts', v_int.external_revocation_attempts),
          jsonb_build_object('external_revocation_pending', not v_done,
                             'attempts', v_attempts,
                             'provider', v_int.provider,
                             'establishment_id', v_int.establishment_id,
                             'error', v_error,
                             'gave_up', (not p_ok and v_done)));

  return v_done;
end;
$$;

comment on function public.record_integration_revocation_attempt(uuid, boolean, text) is
  'RN-INT-06/08 · el resultado de revocar el token en Google, anotado por
   el proceso de la cola. Correcta o segundo fallo: la pendiente se
   cierra. Reservada a service_role.';

revoke all on function public.record_integration_revocation_attempt(uuid, boolean, text)
  from public, anon, authenticated;
