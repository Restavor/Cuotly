-- Sexta revisión del Hito 7. Sin bloqueantes; cuatro importantes y dos
-- menores, y por primera vez ninguno era una puerta abierta al exterior.
--
-- ============================================================
-- H-04 · RN-FIN-12 dice "desde las +24 h" y el código lo hacía a medias.
--
-- Al aplicar la decisión de Bosco (el servicio se detiene a las 24 h) se
-- movió la guarda, pero no la retención de los trabajos: a las +24 h se
-- paraban los once contadores del establecimiento y no se podía empezar
-- nada nuevo, pero un trabajo YA en curso seguía en `in_progress` y sin
-- bloqueo `financial_hold`. El restaurante lo veía "En curso" mientras el
-- servicio estaba detenido, y solo a las +72 h pasaba a `authorized_pause`.
--
-- Comprobado en vivo:
--   etapa: paused    · trabajo EN CURSO: in_progress      · retención: f
--   etapa: suspended · trabajo:          authorized_pause · retención: t
--
-- No es una contradicción nueva que haya que consultar: es completar el
-- cambio que la decisión del 31/08/2026 ya implicaba, y que RN-FIN-12 ya
-- recoge por escrito.
-- ============================================================

CREATE OR REPLACE FUNCTION public.evaluate_establishment_dunning(p_establishment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_oldest_due timestamptz;
  v_hours numeric;
  v_stage text;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_finance') then
    raise exception 'No tienes permiso para gestionar el impago de este establecimiento';
  end if;

  -- Manda el cobro vencido más antiguo que siga con deuda viva: uno nuevo
  -- todavía en plazo no rescata a un establecimiento ya suspendido.
  select min(c.due_at) into v_oldest_due
  from public.charges c
  where c.establishment_id = p_establishment_id
    and now() > c.due_at
    and public.charge_outstanding_cents(c.id) > 0;

  if v_oldest_due is null then
    perform public.reactivate_establishment_after_payment(p_establishment_id);
    return 'current';
  end if;

  -- RN-FIN-10/11: horas **naturales**, no laborables. Es la única familia
  -- de plazos de Cuotly que no pasa por el reloj contractual, y el PRD lo
  -- dice con esa palabra exacta.
  v_hours := extract(epoch from (now() - v_oldest_due)) / 3600;

  if v_hours >= 72 then
    v_stage := 'suspended';
  elsif v_hours >= 24 then
    v_stage := 'paused';
  else
    return 'current';
  end if;

  -- RN-FIN-12 (aclarada 31/08/2026): "se detienen trabajos, publicaciones
  -- y contadores, **desde las +24 h**". Las dos cosas van juntas y en las
  -- dos etapas: hasta la sexta revisión los contadores se paraban a las
  -- 24 h pero los trabajos en curso seguían en `in_progress` y sin
  -- retención, así que el restaurante veía "En curso" un trabajo cuyo
  -- servicio estaba detenido.
  perform public.pause_establishment_counters(p_establishment_id);
  perform public.apply_financial_hold_on_jobs(p_establishment_id);

  if v_stage = 'suspended' then
    perform public.set_establishment_nonpayment_status(p_establishment_id, 'suspended', 'nonpayment_suspension');
  else
    perform public.set_establishment_nonpayment_status(p_establishment_id, 'paused', 'nonpayment_pause');
  end if;

  return v_stage;
end;
$function$;

-- ============================================================
-- H-02 · Un cobro perdonado o reembolsado podía ocultar deuda viva, y el
-- ciclo de impago actuaba sobre ella.
--
-- `charge_status()` devolvía `refunded` o `waived` en cuanto existía el
-- apunte correspondiente, sin mirar el saldo. Pero los dos apuntes cambian
-- el saldo, y hay caminos ordinarios que dejan deuda viva DESPUÉS:
--
--   · Perdonar y luego revertir el pago que se había cobrado. El libro es
--     correcto —se perdonó lo que se debía en ese momento, no el cobro
--     entero— y la deuda revive.
--   · Reembolsar un cobro pagado. Sin revertir nada: el reembolso devuelve
--     la deuda al saldo.
--
-- Comprobado en vivo, este segundo caso:
--   tras pagar:      deuda=0      estado=paid
--   tras reembolsar: deuda=48279  estado=refunded
--   ¿el impago lo ve como deuda viva? t
--
-- Consecuencia: el establecimiento quedaba suspendido por impago por un
-- cobro que todas las pantallas mostraban como "Perdonado" o
-- "Reembolsado", porque `evaluate_establishment_dunning()` mira el saldo y
-- la pantalla miraba el apunte. Y `waive_charge()` no podía arreglarlo,
-- porque su idempotencia miraba "¿existe un perdón?" en vez de "¿queda
-- deuda?", así que era un no-op para siempre.
--
-- RN-FIN-02 enumera los seis estados pero no fija su precedencia: el orden
-- lo elegí yo. Esto no inventa una regla, la hace coherente con RN-DAT-05
-- ("el estado se deriva del libro"): `refunded` y `waived` describen un
-- cobro cerrado, así que solo se devuelven cuando no queda deuda viva. Si
-- la hay, manda la aritmética, que es lo que el ciclo de impago ya hacía.
-- ============================================================

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

  if v_establishment_id is null or not public.can_read_establishment_finance(v_establishment_id) then
    raise exception 'No tienes visibilidad financiera de este establecimiento';
  end if;

  v_outstanding := public.charge_outstanding_cents(p_charge_id);

  -- `refunded` y `waived` son actos explícitos del equipo (RN-FIN-04) y
  -- describen mejor lo que pasó con el cobro que su saldo... siempre que
  -- el cobro esté cerrado. Con deuda viva mienten, y el ciclo de impago
  -- actúa sobre la deuda, no sobre la etiqueta.
  if v_outstanding <= 0 then
    if exists (select 1 from public.financial_entries where charge_id = p_charge_id and entry_type = 'refund') then
      return 'refunded';
    end if;
    if exists (select 1 from public.financial_entries where charge_id = p_charge_id and entry_type = 'waiver') then
      return 'waived';
    end if;
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

CREATE OR REPLACE FUNCTION public.waive_charge(p_charge_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_outstanding integer;
begin
  select space_id, establishment_id into v_space_id, v_establishment_id
  from public.charges where id = p_charge_id
  for update;

  if v_space_id is null then
    raise exception 'Cobro no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_finance') then
    raise exception 'Solo el propietario o un administrador pueden perdonar un cobro';
  end if;

  -- La idempotencia va por DEUDA VIVA, no por "ya existe un perdón". Si un
  -- pago se revierte después de perdonar, la deuda revive (el libro es
  -- correcto: se perdonó lo que se debía entonces, no el cobro entero) y
  -- el equipo tiene que poder volver a perdonarla. Con la comprobación
  -- anterior, esta función se volvía un no-op para siempre y el cobro
  -- quedaba atrapado: deuda viva que nadie podía perdonar, en un cobro que
  -- las pantallas mostraban como "Perdonado" (H-02 de la 6ª revisión).
  v_outstanding := public.charge_outstanding_cents(p_charge_id);
  if v_outstanding <= 0 then
    return; -- Idempotente: no queda deuda que perdonar.
  end if;

  insert into public.financial_entries
    (space_id, establishment_id, charge_id, entry_type, amount_cents, reason, created_by)
  values
    (v_space_id, v_establishment_id, p_charge_id, 'waiver', -v_outstanding, p_reason, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'charge.waived', 'charge', p_charge_id,
          jsonb_build_object('outstanding_cents', v_outstanding),
          jsonb_build_object('outstanding_cents', 0), p_reason);

  perform public.reactivate_establishment_after_payment(v_establishment_id);
end;
$function$;

-- ============================================================
-- H-05 · `request_versions` no tenía `space_id`.
--
-- CLAUDE.md MUST: "toda tabla que pertenezca a un espacio lleva `space_id
-- NOT NULL`". Es la única tabla de negocio de un espacio que no lo tenía,
-- desde el Hito 4. No había fuga —su política de RLS funciona, resolviendo
-- el espacio a través de la solicitud— pero la invariante estructural
-- estaba rota y ninguna de las seis revisiones la había mirado, porque
-- ningún test comprobaba la invariante (ver H-08, en el archivo de tests).
--
-- Con la columna, la política deja además de necesitar dos funciones
-- auxiliares para resolver algo que ya está en la fila.
-- ============================================================

alter table public.request_versions add column space_id uuid references public.spaces (id) on delete cascade;

update public.request_versions rv
set space_id = r.space_id
from public.requests r
where r.id = rv.request_id and rv.space_id is null;

alter table public.request_versions alter column space_id set not null;

-- Las dos funciones que escriben en la tabla tienen que rellenarla, o la
-- restricción las rompe en cuanto alguien cree un borrador.
CREATE OR REPLACE FUNCTION public.create_request_draft(p_establishment_id uuid, p_description text, p_context text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_request_id uuid;
  v_code text;
begin
  if not public.can_write_establishment(p_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'La descripción de la solicitud no puede estar vacía';
  end if;

  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  v_code := public.next_request_code(p_establishment_id);

  insert into public.requests (space_id, establishment_id, code, state, description, context, created_by)
  values (v_space_id, p_establishment_id, v_code, 'draft', p_description, p_context, auth.uid())
  returning id into v_request_id;

  insert into public.request_versions (space_id, request_id, version_number, description, context, created_by)
  values (v_space_id, v_request_id, 1, p_description, p_context, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'request.draft_created', 'request', v_request_id, jsonb_build_object('code', v_code));

  return v_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.copy_paste_request(p_source_request_id uuid, p_target_establishment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_establishment_id uuid;
  v_source_group_id uuid;
  v_target_group_id uuid;
  v_target_space_id uuid;
  v_description text;
  v_context text;
  v_new_request_id uuid;
  v_code text;
begin
  select establishment_id, description, context into v_source_establishment_id, v_description, v_context
  from public.requests where id = p_source_request_id;

  if v_source_establishment_id is null then
    raise exception 'Solicitud de origen no encontrada';
  end if;

  if not public.can_read_establishment(v_source_establishment_id) then
    raise exception 'No tienes acceso a la solicitud de origen';
  end if;

  if not public.can_write_establishment(p_target_establishment_id) then
    raise exception 'No tienes acceso de escritura al establecimiento de destino';
  end if;

  select group_id into v_source_group_id from public.establishments where id = v_source_establishment_id;
  select group_id, space_id into v_target_group_id, v_target_space_id from public.establishments where id = p_target_establishment_id;

  -- RN-REQ-04: "Copiar solicitud" y "Pegar solicitud" funcionan solo
  -- dentro del mismo grupo.
  if v_source_group_id is null or v_source_group_id <> v_target_group_id then
    raise exception 'Solo se puede copiar una solicitud dentro del mismo grupo';
  end if;

  v_code := public.next_request_code(p_target_establishment_id);

  insert into public.requests
    (space_id, establishment_id, code, state, description, context, created_by, copied_from_request_id)
  values
    (v_target_space_id, p_target_establishment_id, v_code, 'draft', v_description, v_context, auth.uid(), p_source_request_id)
  returning id into v_new_request_id;

  insert into public.request_versions (space_id, request_id, version_number, description, context, created_by)
  values (v_target_space_id, v_new_request_id, 1, v_description, v_context, auth.uid());

  -- Los adjuntos copiados se muestran para revisión, sin enviarse
  -- automáticamente (RN-REQ-04): el nuevo borrador nace en 'draft' igual
  -- que cualquier otro, así que ya cumple esa condición sin código extra.
  insert into public.request_attachments (request_id, space_id, establishment_id, storage_path, file_name, mime_type, size_bytes, created_by)
  select v_new_request_id, v_target_space_id, p_target_establishment_id, storage_path, file_name, mime_type, size_bytes, auth.uid()
  from public.request_attachments
  where request_id = p_source_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_target_space_id, auth.uid(), 'request.copied', 'request', v_new_request_id,
    jsonb_build_object('source_request_id', p_source_request_id),
    jsonb_build_object('code', v_code, 'establishment_id', p_target_establishment_id)
  );

  return v_new_request_id;
end;
$function$;


create index if not exists request_versions_space_id_idx on public.request_versions (space_id);

drop policy request_versions_select on public.request_versions;

create policy request_versions_select on public.request_versions
for select
using (
  public.is_space_member(space_id)
  or public.can_read_establishment(public.request_establishment_id(request_id))
);

-- ============================================================
-- H-07 · `space_sequences` tenía RLS activado y CERO políticas.
--
-- Está cerrada de hecho (RLS sin política permisiva deniega), pero
-- CLAUDE.md pide "RLS activado con políticas **explícitas**": que la
-- seguridad dependa de la AUSENCIA de una política es justo lo contrario,
-- y basta que alguien añada mañana una política permisiva "para poder
-- leer el contador" para abrirla sin darse cuenta.
--
-- La tabla no la toca nadie salvo `next_space_sequence()`, que es
-- SECURITY DEFINER y ya está protegida (migración 20260830000012). Así que
-- lo explícito aquí es quitarle el privilegio de tabla, no añadir una
-- política que no hace falta.
-- ============================================================

revoke all on public.space_sequences from anon, authenticated;

comment on table public.space_sequences is
  'Contador de códigos por espacio. No se lee ni se escribe directamente:
   solo a través de next_space_sequence() (SECURITY DEFINER). Sin
   privilegios para anon ni authenticated a propósito — ver la migración
   20260830000034.';
