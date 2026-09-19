-- ============================================================
-- Suite 55 · La prioridad de la solicitud (PRD RN-REQ-05/06, decisión 49)
-- ============================================================
--
-- El diseño definitivo móvil (página 63) pide prioridad y motivo, los dos
-- obligatorios. Lo que esta suite vigila:
--
--   · **Se exige al ENVIAR, no al guardar** el borrador. El diseño tiene
--     los dos botones y a medio escribir todavía no se sabe.
--   · **Lo exige el SERVIDOR.** El `required` del formulario no es un
--     control: quien llame por RPC recibe el mismo "no" (CLAUDE.md).
--   · **Los tres niveles y solo esos**, y el motivo en 200.
--   · **No sustituye al orden 1..N** de la migración 62 (RN-PRI): los dos
--     datos conviven y son distintos. Si alguien retira `priority_rank`
--     sin reescribir RN-REQ-05, esto se pone rojo.
--
-- Prefijo de esta suite: cf100000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('cf100000-0000-0000-0000-000000000001', 'duena@suite55.test', 'authenticated', 'authenticated'),
  ('cf100000-0000-0000-0000-000000000002', 'cliente@suite55.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('cf100000-0000-0000-0000-000000000001', 'duena@suite55.test', 'Dueña 55'),
  ('cf100000-0000-0000-0000-000000000002', 'cliente@suite55.test', 'Cliente 55')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by)
values ('cf100000-0000-0000-0000-000000000010', 'Espacio 55', 'espacio-55', 'Europe/Madrid',
        'cf100000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status)
values ('cf100000-0000-0000-0000-000000000010', 'cf100000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name)
values ('cf100000-0000-0000-0000-000000000015', 'cf100000-0000-0000-0000-000000000010', 'Grupo 55');

insert into public.establishments (id, space_id, group_id, code, name, status)
values ('cf100000-0000-0000-0000-000000000020', 'cf100000-0000-0000-0000-000000000010',
        'cf100000-0000-0000-0000-000000000015', 'R55', 'Magariños 55', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role)
values ('cf100000-0000-0000-0000-000000000020', 'cf100000-0000-0000-0000-000000000002', 'local_owner');

-- ------------------------------------------------------------
-- RN-REQ-05 · el borrador se guarda SIN prioridad
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'cf100000-0000-0000-0000-000000000002';

do $$
declare
  v_req uuid;
  v_prioridad text;
begin
  v_req := public.create_request_draft(
    'cf100000-0000-0000-0000-000000000020', 'Actualizar el horario de la web', null);

  -- A medio escribir no se sabe cuánto corre. Guardar tiene que dejarte.
  perform public.update_request_draft(v_req, 'Actualizar el horario de la web y de Google');

  set local role postgres;
  select priority into v_prioridad from public.requests where id = v_req;
  set local role authenticated;

  if v_prioridad is not null then
    raise exception 'RN-REQ-05 FALLA: el borrador nació con prioridad "%"', v_prioridad;
  end if;

  -- ...pero enviarlo así, no.
  begin
    perform public.submit_request(v_req);
    raise exception 'RN-REQ-05 FALLA: se envió una solicitud sin prioridad';
  exception
    when others then
      if sqlerrm like 'RN-REQ-05 FALLA%' then raise; end if;
  end;

  -- Con prioridad pero sin motivo, tampoco: son los dos.
  perform public.update_request_draft(v_req, 'Actualizar el horario de la web y de Google', null, 'high');

  begin
    perform public.submit_request(v_req);
    raise exception 'RN-REQ-05 FALLA: se envió una solicitud con prioridad y sin motivo';
  exception
    when others then
      if sqlerrm like 'RN-REQ-05 FALLA%' then raise; end if;
  end;

  -- Con los dos, sale.
  perform public.update_request_draft(
    v_req, 'Actualizar el horario de la web y de Google', null, 'high',
    'Abrimos los lunes a partir del 1 de octubre.');

  perform public.submit_request(v_req);

  set local role postgres;
  if (select state from public.requests where id = v_req) <> 'received' then
    raise exception 'RN-REQ-05 FALLA: con prioridad y motivo la solicitud no salió';
  end if;
  set local role authenticated;
end;
$$;

-- ------------------------------------------------------------
-- RN-REQ-05 · tres niveles y solo esos; el motivo cabe en 200
-- ------------------------------------------------------------
do $$
declare
  v_req uuid;
  v_nivel text;
begin
  v_req := public.create_request_draft(
    'cf100000-0000-0000-0000-000000000020', 'Otra cosa', null);

  foreach v_nivel in array array['high', 'medium', 'low'] loop
    perform public.update_request_draft(v_req, 'Otra cosa', null, v_nivel, 'porque sí');
    set local role postgres;
    if (select priority from public.requests where id = v_req) is distinct from v_nivel then
      raise exception 'RN-REQ-05 FALLA: no se guardó el nivel "%"', v_nivel;
    end if;
    set local role authenticated;
  end loop;

  -- Un cuarto nivel no existe. Si alguien añade "urgente" sin reescribir
  -- RN-REQ-05, esto se pone rojo.
  begin
    perform public.update_request_draft(v_req, 'Otra cosa', null, 'urgent', 'porque sí');
    raise exception 'RN-REQ-05 FALLA: se aceptó un nivel que no existe';
  exception
    when others then
      if sqlerrm like 'RN-REQ-05 FALLA%' then raise; end if;
  end;

  -- El límite de 200 lo impone el SERVIDOR, no la pantalla.
  begin
    perform public.update_request_draft(v_req, 'Otra cosa', null, 'low', repeat('x', 201));
    raise exception 'RN-REQ-05 FALLA: se aceptó un motivo de 201 caracteres';
  exception
    when others then
      if sqlerrm like 'RN-REQ-05 FALLA%' then raise; end if;
  end;
end;
$$;

-- ------------------------------------------------------------
-- `null` es NO TOCAR, no "borrar"
-- ------------------------------------------------------------
--
-- La pantalla de alcance no trae estos campos. Si un `null` los borrara,
-- editarle la descripción a una solicitud la dejaría sin prioridad y
-- dejaría de poder enviarse, sin que nadie lo tocara.
do $$
declare
  v_req uuid;
begin
  v_req := public.create_request_draft(
    'cf100000-0000-0000-0000-000000000020', 'Con prioridad puesta', null);

  perform public.update_request_draft(
    v_req, 'Con prioridad puesta', null, 'medium', 'Nos corre lo normal.');

  -- Una llamada de tres argumentos, como la pantalla de alcance.
  perform public.update_request_draft(v_req, 'Con prioridad puesta y descripción cambiada');

  set local role postgres;
  if (select priority from public.requests where id = v_req) is distinct from 'medium' then
    raise exception 'FALLA: editar la descripción borró la prioridad';
  end if;
  if (select priority_reason from public.requests where id = v_req) is null then
    raise exception 'FALLA: editar la descripción borró el motivo';
  end if;
  set local role authenticated;
end;
$$;

-- ------------------------------------------------------------
-- RN-REQ-05 · la prioridad se LEE, y el orden 1..N sigue existiendo
-- ------------------------------------------------------------
set local role postgres;
do $$
begin
  if not has_column_privilege('authenticated', 'public.requests', 'priority', 'select') then
    raise exception 'FALLA: `authenticated` no puede leer `priority` (falta el grant de columna)';
  end if;

  if not has_column_privilege('authenticated', 'public.requests', 'priority_reason', 'select') then
    raise exception 'FALLA: `authenticated` no puede leer `priority_reason`';
  end if;

  -- Falso-cerrado de la decisión 49: los dos datos CONVIVEN. Si alguien
  -- retira el orden 1..N dando por hecho que el nivel lo sustituye, esto
  -- se pone rojo y hay que venir a explicarlo.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'requests' and column_name = 'priority_rank'
  ) then
    raise exception
      'RN-REQ-05 FALLA: desapareció `priority_rank`. El nivel NO sustituye al orden 1..N (decisión 49): si es a propósito, reescribe RN-REQ-05 y RN-PRI';
  end if;

  -- Y una sola firma de cada función, para que PostgREST no elija.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'update_request_draft') <> 1 then
    raise exception 'FALLA: hay más de una `update_request_draft`, y PostgREST elegiría cualquiera';
  end if;
end;
$$;

rollback;
