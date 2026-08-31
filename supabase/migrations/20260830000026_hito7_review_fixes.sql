-- Corrige los hallazgos de la auditoría del Hito 7 (commit 364c93d). La
-- migración 20260830000025 no se toca: todo aquí es CREATE OR REPLACE, o
-- un DROP + CREATE puntual cuando cambia una política.

-- ============================================================
-- B3 (bloqueante) · post_message() no era idempotente bajo concurrencia.
--
-- messages.idempotency_key no tenía índice único y post_message() hacía
-- SELECT y luego INSERT sin bloqueo: dos llamadas simultáneas con la misma
-- clave pasaban las dos por el SELECT vacío y creaban DOS mensajes.
-- Verificado con dos conexiones reales antes del arreglo. Incumple el MUST
-- de CLAUDE.md ("pulsar dos veces nunca duplica el efecto") y, como
-- RN-MSG-08 prohíbe borrar mensajes, el duplicado era permanente.
--
-- El arreglo es el mismo patrón que este archivo ya usaba en `payments`
-- (unique (charge_id, idempotency_key)): la restricción única es quien
-- decide, no una lectura previa. La lectura se conserva como atajo del
-- caso normal, y el `exception when unique_violation` cierra la carrera.
create unique index messages_idempotency_key_idx
  on public.messages (conversation_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.post_message(
  p_conversation_id uuid,
  p_body text,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_type text;
  v_sender_role text;
  v_message_id uuid;
  v_read_only boolean;
begin
  select c.space_id, c.type into v_space_id, v_type
  from public.conversations c where c.id = p_conversation_id;

  if v_space_id is null then
    raise exception 'Conversación no encontrada';
  end if;

  if not public.can_write_conversation(p_conversation_id) then
    raise exception 'No puedes escribir en esta conversación';
  end if;

  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  select public.conversation_is_read_only(p_conversation_id) into v_read_only;
  if v_read_only then
    raise exception 'Esta conversación es de solo lectura: la ventana de corrección ya se cerró';
  end if;

  if p_idempotency_key is not null then
    select id into v_message_id from public.messages
    where conversation_id = p_conversation_id and idempotency_key = p_idempotency_key;
    if v_message_id is not null then
      return v_message_id;
    end if;
  end if;

  v_sender_role := case when public.is_space_member(v_space_id) then 'staff' else 'client' end;

  begin
    insert into public.messages (conversation_id, space_id, sender_id, sender_role, body, idempotency_key)
    values (p_conversation_id, v_space_id, auth.uid(), v_sender_role, btrim(p_body), p_idempotency_key)
    returning id into v_message_id;
  exception
    when unique_violation then
      -- Otra transacción simultánea ganó la carrera con la misma clave:
      -- se devuelve su mensaje en vez de crear un duplicado.
      select id into v_message_id from public.messages
      where conversation_id = p_conversation_id and idempotency_key = p_idempotency_key;
      if v_message_id is null then
        raise;
      end if;
  end;

  return v_message_id;
end;
$$;

comment on function public.post_message(uuid, text, text) is
  'RN-MSG. Idempotente de verdad: la garantía la da el índice único
   messages_idempotency_key_idx, no la lectura previa (que solo es un
   atajo). Antes de 20260830000026, dos clics simultáneos con la misma
   clave creaban dos mensajes, y RN-MSG-08 los volvía permanentes.';

-- ============================================================
-- B2 (bloqueante) · fuga de la identidad individual del equipo al cliente.
--
-- CLAUDE.md, MUST NOT: "mostrar al cliente el nombre, foto o identidad
-- individual de nadie del equipo de mantenimiento. El cliente siempre ve
-- 'Equipo de mantenimiento'." La migración 20260830000025 razonó
-- exactamente esto para `messages.sender_id` ("un uuid estable ya
-- identifica individualmente") y le quitó el privilegio de columna... pero
-- no aplicó la misma medida a ninguna de las otras once tablas nuevas.
--
-- Medido en vivo con la identidad del propietario local de un restaurante:
-- leía message_edits.edited_by, files.created_by, file_versions.created_by,
-- file_links.created_by, charges.issued_by, payments.recorded_by/
-- recorded_role/reversed_by, payment_confirmations.confirmed_by/
-- confirmed_role, receipts.uploaded_by y financial_entries.created_by.
-- Escenario mínimo: un administrador corrige su propio mensaje dentro de
-- la ventana de 10 minutos y el restaurante lee quién fue.
--
-- Mismo mecanismo que ya usó este proyecto para messages.sender_id: el
-- privilegio de columna, que es lo único que distingue columnas (RLS
-- filtra filas). Se esconde para todos: quien del equipo necesite saber
-- quién hizo qué lo tiene en audit_log, que es el registro con actor,
-- fecha y motivo que exige CLAUDE.md, y en las funciones de panel que ya
-- comprueban permisos.
--
-- Las columnas de "lado" (receipts.uploaded_side) se conservan a
-- propósito: distinguir "lo subió el restaurante" de "lo subió el equipo"
-- no identifica a nadie, y es justo lo que el cliente necesita ver.
revoke select on public.message_edits from anon, authenticated;
grant select (id, message_id, space_id, version, previous_body, edited_at)
  on public.message_edits to authenticated;

revoke select on public.files from anon, authenticated;
grant select (id, space_id, group_id, establishment_id, category, visibility, name,
              archived_at, archived_by, deletion_requested_at, deletion_requested_by,
              deletion_reason, created_at)
  on public.files to authenticated;

revoke select on public.file_versions from anon, authenticated;
grant select (id, file_id, space_id, version_number, storage_path, file_name, mime_type,
              size_bytes, variant, checksum, created_at)
  on public.file_versions to authenticated;

revoke select on public.file_links from anon, authenticated;
grant select (id, file_id, space_id, entity_type, entity_id, created_at)
  on public.file_links to authenticated;

revoke select on public.charges from anon, authenticated;
grant select (id, space_id, establishment_id, subscription_id, concept, period_start,
              period_end, base_cents, tax_rate_percent, tax_cents, total_cents, due_at,
              issued_at, created_at)
  on public.charges to authenticated;

revoke select on public.payments from anon, authenticated;
grant select (id, space_id, establishment_id, charge_id, amount_cents, method, paid_at,
              receipt_file_id, idempotency_key, reversed_at, reversal_reason, created_at)
  on public.payments to authenticated;

revoke select on public.payment_confirmations from anon, authenticated;
grant select (id, space_id, payment_id, confirmed_at, note)
  on public.payment_confirmations to authenticated;

revoke select on public.receipts from anon, authenticated;
grant select (id, space_id, establishment_id, charge_id, file_id, payment_id,
              uploaded_side, note, created_at)
  on public.receipts to authenticated;

revoke select on public.financial_entries from anon, authenticated;
grant select (id, space_id, establishment_id, charge_id, entry_type, amount_cents,
              payment_id, related_entry_id, reason, created_at)
  on public.financial_entries to authenticated;

-- state_events: aquí el privilegio de columna no sirve, porque el equipo sí
-- necesita leer actor_id (es su historial operativo, y approve_job_reassignment
-- del Hito 6 lee esta tabla). Se usa el otro patrón del proyecto, el del
-- Hito 6 con `client_jobs`: la tabla vuelve a ser solo del equipo y el
-- restaurante lee una vista barrera sin actor_id.
--
-- RN-EST-08 ("el motivo concreto se muestra junto al estado") se sigue
-- cumpliendo: la vista conserva estado, motivo y causa, que es lo que la
-- regla pide — no quién lo hizo.
drop policy state_events_select on public.state_events;

create policy state_events_select on public.state_events
for select
using (
  public.has_capability(space_id, 'assign_jobs')
  or (entity_type = 'job' and public.can_read_job(entity_id) and public.is_space_member(space_id))
  or (entity_type = 'task' and public.can_read_task(entity_id))
);

create view public.client_establishment_status_events
with (security_barrier)
as
select
  se.id,
  se.space_id,
  se.entity_id as establishment_id,
  se.from_state,
  se.to_state,
  se.reason,
  se.cause,
  se.occurred_at
from public.state_events se
where se.entity_type = 'establishment'
  and public.can_read_establishment_as_client(se.entity_id);

comment on view public.client_establishment_status_events is
  'RN-EST-08: el restaurante ve los cambios de estado de su propio
   establecimiento y el motivo (por ejemplo, impago), pero no actor_id —
   nunca la identidad individual de quien lo hizo (CLAUDE.md MUST NOT).
   Mismo patrón que client_jobs en el Hito 6.';

grant select on public.client_establishment_status_events to authenticated;

-- ============================================================
-- N1 · Helpers de solo lectura invocables por RPC sin comprobar nada.
--
-- Verificado en vivo como `anon`, sin ninguna sesión: charge_outstanding_cents(),
-- charge_collected_cents() y charge_status() devolvían el importe y el
-- estado exactos de un cobro con solo conocer su uuid. Eso salta RN-FIN-07
-- (el rol Consulta y el Editor sin `view_billing` ven cero filas en
-- `charges` por RLS, pero obtenían la cifra por RPC).
--
-- Son fontanería: las llaman otras funciones SECURITY DEFINER de este
-- proyecto, y ahí el REVOKE no estorba (dentro de una función SECURITY
-- DEFINER el rol efectivo es el propietario). Ninguna pantalla necesita
-- llamarlas directamente: para eso están financial_dashboard() y
-- establishment_* , que sí comprueban permisos.
--
-- No se tocan message_conversation_id() ni conversation_is_read_only():
-- las usa una política RLS, y una política se evalúa con los privilegios
-- de quien consulta — revocarlas rompería la lectura legítima.
-- Las tres de dinero SÍ son consulta legítima (una pantalla financiera las
-- necesita), así que no se revocan: se les añade la comprobación que les
-- faltaba, que es además la que hace cumplir RN-FIN-07 de verdad. Es el
-- mismo principio que arregló get_or_create_consumption_cycle() en el
-- Hito 5: una función SECURITY DEFINER comprueba su propio acceso, no da
-- por hecho el de quien la llama.
--
-- Los llamadores internos no se rompen: todos exigen 'manage_finance' o
-- visibilidad financiera del cliente antes de llegar aquí, y
-- can_read_establishment_finance() cubre esos dos casos.
create or replace function public.charge_outstanding_cents(p_charge_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
begin
  select establishment_id into v_establishment_id from public.charges where id = p_charge_id;
  if v_establishment_id is null then
    return null;
  end if;
  if not public.can_read_establishment_finance(v_establishment_id) then
    raise exception 'No tienes visibilidad financiera de este establecimiento';
  end if;

  return (select coalesce(sum(amount_cents), 0)::integer
          from public.financial_entries where charge_id = p_charge_id);
end;
$$;

create or replace function public.charge_collected_cents(p_charge_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
begin
  select establishment_id into v_establishment_id from public.charges where id = p_charge_id;
  if v_establishment_id is null then
    return null;
  end if;
  if not public.can_read_establishment_finance(v_establishment_id) then
    raise exception 'No tienes visibilidad financiera de este establecimiento';
  end if;

  return (select coalesce(-sum(amount_cents), 0)::integer
          from public.financial_entries
          where charge_id = p_charge_id
            and entry_type in ('payment', 'payment_reversal', 'refund'));
end;
$$;

create or replace function public.charge_status(p_charge_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_due_at timestamptz;
  v_establishment_id uuid;
  v_outstanding integer;
begin
  select due_at, establishment_id into v_due_at, v_establishment_id
  from public.charges where id = p_charge_id;
  if v_due_at is null then
    return null;
  end if;

  if not public.can_read_establishment_finance(v_establishment_id) then
    raise exception 'No tienes visibilidad financiera de este establecimiento';
  end if;

  if exists (select 1 from public.financial_entries where charge_id = p_charge_id and entry_type = 'refund') then
    return 'refunded';
  end if;
  if exists (select 1 from public.financial_entries where charge_id = p_charge_id and entry_type = 'waiver') then
    return 'waived';
  end if;

  v_outstanding := public.charge_outstanding_cents(p_charge_id);
  if v_outstanding <= 0 then
    return 'paid';
  end if;

  -- 'overdue' por delante de 'partially_paid': pasada la fecha con deuda
  -- viva, lo que importa es que hay un impago en marcha — es exactamente
  -- la condición que dispara RN-FIN-10/11, y un pago parcial no la detiene.
  if now() > v_due_at then
    return 'overdue';
  end if;

  return case when public.charge_collected_cents(p_charge_id) > 0 then 'partially_paid' else 'pending' end;
end;
$$;

-- Las cuatro restantes son fontanería que ninguna pantalla ni ningún test
-- llama directamente: se revocan, que es más simple y más seguro.
revoke all on function public.file_current_version(uuid) from public, anon, authenticated;
revoke all on function public.conversation_establishment_id(uuid) from public, anon, authenticated;
revoke all on function public.counter_is_running(text, text, uuid) from public, anon, authenticated;
revoke all on function public.counter_pause_cause(text, text, uuid) from public, anon, authenticated;

-- ============================================================
-- N7 · release_financial_holds() auditaba transiciones que podían no haber
-- ocurrido: el UPDATE de `jobs` está condicionado a que el trabajo siguiera
-- en `authorized_pause`, pero el state_event y el contador se escribían
-- fuera de esa condición. Si el trabajo se había movido entretanto, quedaba
-- un asiento de auditoría de un cambio de estado que nunca pasó — y
-- CLAUDE.md dice que los registros de auditoría no se editan ni se borran,
-- así que un asiento falso es permanente.
create or replace function public.release_financial_holds(p_establishment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_block record;
  v_updated integer;
  v_count integer := 0;
begin
  for v_block in
    select b.id, b.job_id from public.blocks b
    join public.jobs j on j.id = b.job_id
    where j.establishment_id = p_establishment_id
      and b.reason_type = 'financial_hold'
      and b.ended_at is null
  loop
    update public.blocks set ended_at = now(), ended_by = auth.uid() where id = v_block.id;

    update public.jobs set state = 'in_progress'
    where id = v_block.job_id and state = 'authorized_pause';
    get diagnostics v_updated = row_count;

    -- Solo se audita y se cuenta lo que de verdad cambió de estado.
    if v_updated > 0 then
      insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
      values (v_space_id, 'job', v_block.job_id, 'authorized_pause', 'in_progress', auth.uid(),
              'Pago confirmado', 'nonpayment_reactivation');

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.release_financial_holds(uuid) is
  'RN-FIN-13. Desde 20260830000026 solo escribe el state_event cuando el
   UPDATE de jobs afectó de verdad a una fila: antes podía dejar un asiento
   de auditoría de una transición que no ocurrió.';

revoke all on function public.release_financial_holds(uuid) from public, anon, authenticated;

-- ============================================================
-- N10 · upload_payment_receipt() solo comprobaba que el archivo fuera del
-- mismo establecimiento, no que quien lo adjunta pueda verlo. Un cliente
-- con visibilidad financiera podía declarar como justificante un archivo
-- INTERNO del equipo: no ganaba lectura (can_read_file() se la sigue
-- negando), pero creaba un file_links de tipo 'charge' sobre él, que por
-- RN-ARC-07 lo vuelve permanentemente no archivable ni borrable, y ensucia
-- el expediente del cobro.
create or replace function public.upload_payment_receipt(p_charge_id uuid, p_file_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_side text;
  v_receipt_id uuid;
begin
  select space_id, establishment_id into v_space_id, v_establishment_id
  from public.charges where id = p_charge_id;

  if v_space_id is null then
    raise exception 'Cobro no encontrado';
  end if;

  if (select establishment_id from public.files where id = p_file_id) is distinct from v_establishment_id then
    raise exception 'El justificante pertenece a otro establecimiento';
  end if;

  -- No se puede adjuntar como justificante un archivo que quien lo adjunta
  -- no puede ni ver (RN-ARC-04/05).
  if not public.can_read_file(p_file_id) then
    raise exception 'No tienes acceso a ese archivo';
  end if;

  if public.is_space_member(v_space_id) then
    v_side := 'staff';
    if not public.can_write_file(v_establishment_id, 'billing') then
      raise exception 'No tienes permiso para adjuntar justificantes a este cobro';
    end if;
  else
    v_side := 'client';
    if not public.client_can_view_billing(v_establishment_id) then
      raise exception 'No tienes visibilidad financiera de este establecimiento';
    end if;
  end if;

  insert into public.receipts
    (space_id, establishment_id, charge_id, file_id, uploaded_by, uploaded_side, note)
  values
    (v_space_id, v_establishment_id, p_charge_id, p_file_id, auth.uid(), v_side, p_note)
  returning id into v_receipt_id;

  perform public.link_file(p_file_id, 'charge', p_charge_id, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_space_id, auth.uid(), 'charge.receipt_uploaded', 'charge', p_charge_id,
          jsonb_build_object('file_id', p_file_id, 'side', v_side), p_note);

  return v_receipt_id;
end;
$$;
