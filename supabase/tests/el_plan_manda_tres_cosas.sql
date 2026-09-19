-- ============================================================
-- Suite 58 · El plan manda tres cosas distintas (PRD RN-COM-03, decisión 55)
-- ============================================================
--
-- Lo que vigila, y por qué esta suite existe:
--
-- Hasta el 19/09/2026 `plans.grants_priority` decidía **cuatro** cosas a la
-- vez. Cuando Bosco pidió que Premium también pudiera ordenar sus
-- solicitudes, la manera fácil era ponerle ese booleano a `true` — y eso le
-- habría dado **en silencio** el Menú Diario a 199 € y las oportunidades
-- avanzadas, que son de Premium+ y que él mismo fijó en la decisión 39.
--
-- Así que aquí se comprueban las dos mitades a la vez:
--
--   · Premium **sí** puede ordenar sus cambios (`can_order_requests`).
--   · Premium **no** tiene `grants_priority`, y por tanto ni el precio
--     rebajado ni las oportunidades avanzadas.
--   · Premium+ va **por delante** de Premium en el turno (`queue_rank`),
--     sin que su plazo sea más corto (`start_sla_hours` iguales).
--   · El turno **no viaja hacia el cliente**.
--
-- Prefijo de esta suite: d0300000-.

begin;

set local role postgres;

-- Los NÚMEROS de cada plan de Restavor —quién ordena, quién va primero en
-- el turno, y que `grants_priority` siga siendo solo de Premium+— los
-- defiende `planes_de_restavor.sql`, que es la suite que crea ese espacio
-- y ya guarda su ficha. Aquí se comprueba la REGLA, con planes propios: que
-- las tres columnas son tres cosas distintas y que ninguna arrastra a otra.

-- ------------------------------------------------------------
-- RN-COM-03 · el turno no viaja hacia el cliente
-- ------------------------------------------------------------
insert into auth.users (id, email, role, aud) values
  ('d0300000-0000-0000-0000-000000000001', 'duena@suite58.test', 'authenticated', 'authenticated'),
  ('d0300000-0000-0000-0000-000000000003', 'restaurante@suite58.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d0300000-0000-0000-0000-000000000001', 'duena@suite58.test', 'Dueña 58'),
  ('d0300000-0000-0000-0000-000000000003', 'restaurante@suite58.test', 'Restaurante 58')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by)
values ('d0300000-0000-0000-0000-000000000010', 'Espacio 58', 'espacio-58', 'Europe/Madrid',
        'd0300000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status)
values ('d0300000-0000-0000-0000-000000000010', 'd0300000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name)
values ('d0300000-0000-0000-0000-000000000015', 'd0300000-0000-0000-0000-000000000010', 'Grupo 58');

insert into public.establishments (id, space_id, group_id, code, name, status)
values ('d0300000-0000-0000-0000-000000000020', 'd0300000-0000-0000-0000-000000000010',
        'd0300000-0000-0000-0000-000000000015', 'R58', 'Magariños 58', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role)
values ('d0300000-0000-0000-0000-000000000030', 'd0300000-0000-0000-0000-000000000020',
        'd0300000-0000-0000-0000-000000000003', 'local_owner');

-- Dos planes que son el caso entero: el alto (como Premium+) y el que
-- **ordena sin ser el alto** (como Premium). El segundo es el que no se
-- podía expresar antes del 19/09/2026, cuando todo colgaba de un booleano.
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo,
                          included_medium, included_large, start_sla_hours, grants_priority,
                          queue_rank, can_order_requests)
values ('d0300000-0000-0000-0000-000000000040', 'd0300000-0000-0000-0000-000000000010',
        'Alto 58', 59900, 10, 10, 3, 1, 24, true, 2, true),
       ('d0300000-0000-0000-0000-000000000041', 'd0300000-0000-0000-0000-000000000010',
        'Ordena sin ser alto 58', 49900, 10, 10, 2, 0, 24, false, 1, true);

-- El mismo plazo en los dos: el turno NO es un plazo más corto.
do $$
begin
  if (select count(distinct start_sla_hours) from public.plans
      where space_id = 'd0300000-0000-0000-0000-000000000010') <> 1 then
    raise exception 'RN-COM-03 FALLA: el turno se ha colado como un plazo distinto';
  end if;

  if (select queue_rank from public.plans where id = 'd0300000-0000-0000-0000-000000000040')
     <= (select queue_rank from public.plans where id = 'd0300000-0000-0000-0000-000000000041') then
    raise exception 'RN-COM-03 FALLA: el plan alto no va por delante en el turno';
  end if;

  -- **La comprobación que justifica esta suite entera**: ordenar los
  -- cambios propios NO arrastra `grants_priority`, que es lo que decide el
  -- precio de Menú Diario (RN-COM-08) y las oportunidades avanzadas
  -- (RN-OPP). Antes del 19/09/2026 eran la misma columna y darle a Premium
  -- lo uno le habría dado lo otro en silencio, deshaciendo la decisión 39.
  if (select grants_priority from public.plans where id = 'd0300000-0000-0000-0000-000000000041') then
    raise exception 'DECISIÓN 39 FALLA: un plan que solo ordena sus cambios se ha llevado el precio rebajado y las oportunidades avanzadas';
  end if;
end;
$$;

insert into public.subscriptions (space_id, establishment_id, kind, plan_id, status)
values ('d0300000-0000-0000-0000-000000000010', 'd0300000-0000-0000-0000-000000000020',
        'plan', 'd0300000-0000-0000-0000-000000000040', 'active');

set local role authenticated;

-- El equipo lo ve: es su orden de trabajo.
set local "request.jwt.claim.sub" = 'd0300000-0000-0000-0000-000000000001';
do $$
begin
  if public.establishment_queue_rank('d0300000-0000-0000-0000-000000000020') <> 2 then
    raise exception 'RN-COM-03 FALLA: el equipo no ve el turno del plan';
  end if;
end;
$$;

-- El restaurante no. No se le miente con un error: se le contesta 0, que es
-- lo mismo que a cualquiera sin plan, y así no puede deducir nada de la
-- respuesta.
set local "request.jwt.claim.sub" = 'd0300000-0000-0000-0000-000000000003';
do $$
begin
  if public.establishment_queue_rank('d0300000-0000-0000-0000-000000000020') <> 0 then
    raise exception 'RN-COM-03 FALLA: el cliente alcanza el turno de su plan, que es organización interna';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-PRI · y sin embargo SÍ puede ordenar sus cambios
-- ------------------------------------------------------------
--
-- Las dos mitades a la vez en la misma persona: no ve el turno y sí ordena
-- lo suyo. Son cosas distintas y esto lo demuestra.
do $$
begin
  if not public.client_can_set_priority('d0300000-0000-0000-0000-000000000020') then
    raise exception 'RN-PRI FALLA: con un plan que lo concede, el restaurante no puede ordenar sus cambios';
  end if;
end;
$$;

-- Y con un plan que no lo concede, no.
set local role postgres;
update public.plans set can_order_requests = false
where id = 'd0300000-0000-0000-0000-000000000040';

set local role authenticated;
do $$
begin
  if public.client_can_set_priority('d0300000-0000-0000-0000-000000000020') then
    raise exception 'RN-PRI FALLA: ordena sus cambios con un plan que no lo concede';
  end if;
end;
$$;

rollback;
