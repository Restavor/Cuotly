-- ============================================================
-- Migración 151 · El detalle del consumo de créditos (decisión 85,
--                 PRD §41, RN-CRE-16 y RN-CRE-17)
-- ============================================================
--
-- Punto 4 del plan de la decisión 85. La barra del ciclo ya la da
-- `establishment_credit_balance()` (migración 149). Bosco pidió "no solo
-- la barra": debajo va el detalle por solicitud, en porcentaje del plan
-- para el restaurante y con los créditos exactos para el equipo
-- (RN-CRE-16). El porcentaje lo calcula el servidor, como el de la barra
-- (CLAUDE.md: los consumos se calculan en el servidor).
--
-- Sale del libro de consumos tal cual (CLAUDE.md, libro inmutable con
-- signo): por solicitud se suman sus apuntes del ciclo vigente, de modo
-- que una solicitud cancelada antes de empezar (débito y devolución) suma
-- cero y no aparece, y un crédito compensatorio que llegó a este ciclo
-- por una cancelación de otro sale en negativo. Los apuntes sin solicitud
-- (los créditos extra de una mejora de plan, RN-CRE-15) van en una fila
-- de ajuste. Ningún número se guarda: se deriva cada vez.
--
-- Se comprueba con `supabase/tests/el_detalle_del_consumo.sql`.

create or replace function public.establishment_credit_detail(p_establishment_id uuid)
returns table(kind text, request_id uuid, request_code text, request_description text,
              used_half integer, percent_of_plan integer, last_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with ciclo as (
    select cc.id, cc.included_credits_half
    from public.consumption_cycles cc
    join public.subscriptions s on s.id = cc.subscription_id
    where cc.establishment_id = p_establishment_id
      and s.kind = 'plan' and s.status = 'active'
      and now() >= cc.cycle_start and now() < cc.cycle_end
    order by cc.cycle_start desc
    limit 1
  ),
  lineas as (
    select ce.request_id, -sum(ce.amount)::integer as usado, max(ce.created_at) as ultimo
    from public.consumption_entries ce
    join ciclo c on c.id = ce.consumption_cycle_id
    where ce.category = 'credits'
    group by ce.request_id
  )
  select
    case when l.request_id is null then 'adjustment' else 'request' end,
    l.request_id,
    r.code,
    r.description,
    l.usado,
    -- RN-CRE-16 · el mismo redondeo que la barra: el entero más cercano.
    -- Por partida no se recorta a 100: una solicitud nunca pasa del plan
    -- (RN-CRE-14), y un ajuste puede ser negativo (créditos de más).
    round(l.usado * 100.0 / c.included_credits_half)::integer,
    l.ultimo
  from lineas l
  cross join ciclo c
  left join public.requests r on r.id = l.request_id
  where l.usado <> 0
    and c.included_credits_half > 0
    and public.can_read_establishment(p_establishment_id)
  order by l.ultimo desc;
$$;

comment on function public.establishment_credit_detail(uuid) is
  'RN-CRE-16 · el detalle del consumo de créditos del ciclo vigente: una fila
   por solicitud (neto de devoluciones) y otra para los ajustes sin
   solicitud, con los medios créditos y el porcentaje del plan calculado
   aquí. Sin filas si el plan no incluye créditos.';

revoke all on function public.establishment_credit_detail(uuid) from public, anon;
grant execute on function public.establishment_credit_detail(uuid) to authenticated;
