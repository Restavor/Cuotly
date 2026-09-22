-- ============================================================
-- Migración 127 · El seguimiento de la solicitud, con sus fechas
--                 (R08 y R11 del diseño definitivo; P7)
-- ============================================================
--
-- R08 y R11 enseñan al restaurante el camino de su solicitud con la fecha
-- de cada paso: recibida, aceptada, en curso, publicada. De esas fechas,
-- el restaurante ya lee tres de `requests` (`created_at`, `validated_at` y
-- `accepted_at`, migración 27). Las otras no las puede leer, y es
-- deliberado:
--
--   · **Cuándo se envió** está en `audit_log` (`request.submitted`), que
--     lleva `actor_id`. Un borrador que sale de una conversación se envía
--     días después de crearse, así que `created_at` no es la fecha de
--     envío.
--   · **Cuándo empezó, se publicó y se cerró** está en `jobs`, cuya fila
--     entera es organización interna del equipo (P7) y lleva cuatro
--     identidades (`assigned_to`, `started_by`, `published_by`,
--     `cancelled_by`). `client_request_job()` (migración 43) ya contesta
--     lo que le toca saber de ella sin ninguna identidad; esta función
--     hace lo mismo con las fechas.
--
-- Cinco fechas y ninguna dice quién. Quién puede preguntar lo decide
-- `can_read_establishment()`, la misma puerta que `client_request_job()`.

create or replace function public.client_request_milestones(p_request_id uuid)
returns table (
  submitted_at timestamptz,
  started_at timestamptz,
  published_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
begin
  select r.establishment_id into v_establishment_id
  from public.requests r where r.id = p_request_id;

  if v_establishment_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_read_establishment(v_establishment_id) then
    raise exception 'No tienes acceso a esta solicitud';
  end if;

  return query
  select
    (select max(a.created_at) from public.audit_log a
      where a.entity_type = 'request' and a.entity_id = p_request_id
        and a.action = 'request.submitted'),
    j.started_at,
    j.published_at,
    j.completed_at,
    -- Cancelada por el restaurante antes de ser trabajo (R12) o por el
    -- equipo después: la primera solo deja apunte, la segunda marca el
    -- trabajo.
    coalesce(
      j.cancelled_at,
      (select max(a.created_at) from public.audit_log a
        where a.entity_type = 'request' and a.entity_id = p_request_id
          and a.action = 'request.cancelled')
    )
  from (select 1) as una
  left join lateral (
    select jb.started_at, jb.published_at, jb.completed_at, jb.cancelled_at
    from public.jobs jb
    where jb.request_id = p_request_id
    order by jb.created_at desc
    limit 1
  ) j on true;
end;
$$;

comment on function public.client_request_milestones(uuid) is
  'R08 y R11 · las fechas del seguimiento de una solicitud (envío, comienzo, publicación, cierre, cancelación) sin ninguna identidad del equipo (P7). Comprueba can_read_establishment().';

-- Comprueba el permiso por su cuenta: `authenticated` la necesita, `anon`
-- no (CLAUDE.md: nunca solo `from public`).
revoke all on function public.client_request_milestones(uuid) from public, anon;
grant execute on function public.client_request_milestones(uuid) to authenticated;
