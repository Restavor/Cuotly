-- ============================================================
-- Migración 128 · La actividad del restaurante
--                 (R41 del diseño definitivo; P7, RN-REP-18)
-- ============================================================
--
-- R41 enseña al restaurante su actividad: lo que envió, lo que aceptó, lo
-- que el equipo empezó y publicó, los menús publicados, los informes que
-- recibió, los cobros y los pagos. Una línea de tiempo por mes.
--
-- **Por qué no sale de `audit_log`.** Su política lo dice: "Cliente: nada
-- — su auditoría necesita una proyección sin identidad que todavía no
-- existe" (migración 49). Cada apunte lleva `actor_id`, y la fila de
-- `jobs` es organización interna del equipo (P7).
--
-- **Qué hace en su lugar.** Lo mismo que `report_month_activity()`
-- (RN-REP-18, migración 113), que ya cuenta el mes de un restaurante sin
-- ninguna identidad: leer la **fecha** de cada hecho en su tabla. Una
-- fila por hecho, con su clave, su fecha, de qué es y el código o nombre
-- que el restaurante ya reconoce. Ni una columna con clave ajena a
-- `profiles`, ni quién lo hizo.
--
-- **Quién ve qué.** La función es `security definer` para poder leer las
-- fechas de `jobs` y `menu_publications`, así que la visibilidad de cada
-- clase se replica aquí con **las mismas funciones que usan las políticas
-- de cada tabla**, no con una lista escrita a mano:
--
--   · la puerta, `can_read_establishment()` (la de `requests`);
--   · menús, `can_read_menu_establishment()` (la de `menus`);
--   · informes, `report_is_visible_to_client()` y
--     `client_can_view_reports()` (la de `reports`, RN-REP-16);
--   · presupuestos, `client_can_view_billing()` (la de `quotes`);
--   · cobros, justificantes y pagos, `can_read_establishment_finance()`
--     (la de `charges`, RN-FIN-07);
--   · archivos, `can_read_file()` (RN-ARC-08).
--
-- La frase en español la pone la pantalla desde es.ts: aquí solo hay
-- claves y fechas.

create or replace function public.client_activity(
  p_establishment_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  at timestamptz,
  kind text,
  entity_type text,
  entity_id uuid,
  subject text,
  detail text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_read_establishment(p_establishment_id) then
    raise exception 'No tienes acceso a este restaurante';
  end if;

  if p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'El periodo tiene que ir hacia delante y no pasar de un año';
  end if;

  return query
  with sol as (
    select r.id, r.code, r.created_at, r.accepted_at, r.rejected_at,
           -- El resumen que validó el equipo o, si aún no lo hay, el
           -- principio de lo que escribió el restaurante. Las dos son
           -- columnas que ya lee (migración 27).
           coalesce(nullif(btrim(coalesce(r.validated_summary, '')), ''), left(btrim(r.description), 140)) as texto
    from public.requests r
    where r.establishment_id = p_establishment_id
      -- Un borrador no se ha enviado: contarlo sería contarle algo que no hizo.
      and r.state <> 'draft'
  ),
  trabajo as (
    select distinct on (j.request_id) j.request_id, j.started_at, j.published_at, j.cancelled_at
    from public.jobs j
    where j.establishment_id = p_establishment_id
    order by j.request_id, j.created_at desc
  ),
  hechos as (
    -- Solicitud enviada: la fecha del apunte `request.submitted`, que es la
    -- que el restaurante reconoce (un borrador puede enviarse días después
    -- de crearse). Sin apunte, la de creación.
    select coalesce(
             (select max(a.created_at) from public.audit_log a
               where a.entity_type = 'request' and a.entity_id = s.id and a.action = 'request.submitted'),
             s.created_at) as cuando,
           'request_sent'::text as clase, 'request'::text as tipo, s.id as id, s.code as asunto, s.texto as texto
    from sol s

    union all
    select s.accepted_at, 'request_accepted', 'request', s.id, s.code, s.texto from sol s
    union all
    select s.rejected_at, 'request_rejected', 'request', s.id, s.code, s.texto from sol s

    -- Lo que hizo el equipo, contado por la SOLICITUD: el trabajo es
    -- organización interna y el restaurante sigue su cambio por su código.
    union all
    select t.started_at, 'work_started', 'request', s.id, s.code, s.texto
    from sol s join trabajo t on t.request_id = s.id
    union all
    select t.published_at, 'work_published', 'request', s.id, s.code, s.texto
    from sol s join trabajo t on t.request_id = s.id
    union all
    select coalesce(
             t.cancelled_at,
             (select max(a.created_at) from public.audit_log a
               where a.entity_type = 'request' and a.entity_id = s.id and a.action = 'request.cancelled')),
           'request_cancelled', 'request', s.id, s.code, s.texto
    from sol s left join trabajo t on t.request_id = s.id

    -- RN-COR-07 · las correcciones que pidió el restaurante. Las de
    -- `team_error` no: son la cocina del equipo.
    union all
    select c.requested_at, 'correction_requested', 'request', s.id, s.code, s.texto
    from public.corrections c join sol s on s.id = c.request_id
    where c.kind = 'client_request'

    union all
    select mp.published_at, 'menu_published', 'menu', m.id, m.name, to_char(m.target_date, 'YYYY-MM-DD')
    from public.menu_publications mp
    join public.menus m on m.id = mp.menu_id
    where mp.establishment_id = p_establishment_id
      and public.can_read_menu_establishment(p_establishment_id)

    union all
    select rp.sent_at, 'report_sent', 'report', rp.id, rp.name, null
    from public.reports rp
    where rp.establishment_id = p_establishment_id
      and public.report_is_visible_to_client(rp.status)
      and public.client_can_view_reports(p_establishment_id)

    union all
    select q.sent_at, 'quote_sent', 'quote', q.id, q.code, q.concept
    from public.quotes q
    where q.establishment_id = p_establishment_id
      and q.state <> 'draft'
      and public.client_can_view_billing(p_establishment_id)
    union all
    select q.decided_at, 'quote_accepted', 'quote', q.id, q.code, q.concept
    from public.quotes q
    where q.establishment_id = p_establishment_id
      and q.state = 'accepted'
      and public.client_can_view_billing(p_establishment_id)

    union all
    select ch.issued_at, 'charge_issued', 'charge', ch.id, ch.concept, null
    from public.charges ch
    where ch.establishment_id = p_establishment_id
      and public.can_read_establishment_finance(p_establishment_id)
    union all
    select rc.created_at, 'receipt_uploaded', 'charge', ch.id, ch.concept, null
    from public.receipts rc
    join public.charges ch on ch.id = rc.charge_id
    where rc.establishment_id = p_establishment_id
      and public.can_read_establishment_finance(p_establishment_id)
    union all
    select pm.paid_at, 'payment_recorded', 'charge', ch.id, ch.concept, null
    from public.payments pm
    join public.charges ch on ch.id = pm.charge_id
    where pm.establishment_id = p_establishment_id
      -- Un pago revertido no pasó (RN-FIN-04).
      and pm.reversed_at is null
      and public.can_read_establishment_finance(p_establishment_id)

    union all
    select f.created_at, 'file_shared', 'file', f.id, f.name, f.category
    from public.files f
    where f.establishment_id = p_establishment_id
      and f.archived_at is null
      and public.can_read_file(f.id)
  )
  select h.cuando, h.clase, h.tipo, h.id, h.asunto, h.texto
  from hechos h
  where h.cuando is not null
    and h.cuando >= p_from
    and h.cuando < p_to
  order by h.cuando desc, h.clase;
end;
$$;

comment on function public.client_activity(uuid, timestamptz, timestamptz) is
  'R41 · la actividad de un restaurante en un periodo: una fila por hecho (clave, fecha, de qué es, código o nombre), leída de la fecha de cada tabla como report_month_activity(). Sin ninguna identidad (P7). Cada clase se filtra con la misma función que la política de su tabla. Comprueba can_read_establishment().';

-- Comprueba el permiso por su cuenta: `authenticated` la necesita, `anon`
-- no (CLAUDE.md: nunca solo `from public`).
revoke all on function public.client_activity(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.client_activity(uuid, timestamptz, timestamptz) to authenticated;
