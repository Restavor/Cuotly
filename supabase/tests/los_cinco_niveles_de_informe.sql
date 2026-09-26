-- ============================================================
-- Suite 59 · Los cinco niveles de informe (PRD RN-REP-15/16, decisión 56)
-- ============================================================
--
-- Lo que vigila:
--
--   · **El nivel es una BARRERA.** Preparar el borrador respeta el nivel,
--     sí, pero eso es el valor por omisión. Lo que de verdad importa es que
--     marcar la casilla a mano tampoco cuele: ocultar no es controlar
--     (CLAUDE.md).
--   · **Cada nivel añade y ninguno quita.** Se comprueba con los cinco, no
--     con dos: un `>=` mal puesto se ve solo si se prueban los escalones.
--   · **RN-REP-16 · un informe con Finanzas no lo ve quien no tenga "Pagos
--     y facturas"**. Y no lo ve en absoluto: no se le enseña recortado.
--   · **El reparto de Restavor**, que es un dato de producto (decisión 56).
--
-- Prefijo de esta suite: d0400000-.

begin;

set local role postgres;

-- ------------------------------------------------------------
-- RN-REP-15 · los cinco niveles, escalón a escalón
-- ------------------------------------------------------------
do $$
declare
  v record;
begin
  -- Cada fila dice qué secciones admite ese nivel. Si alguien cambia un
  -- `>=` por un `>`, aquí se cae.
  for v in
    select * from (values
      -- RN-REP-18 · el relato del mes va en los cinco, Básico incluido:
      -- es lo que hace que su informe no sea una hoja en blanco.
      --
      -- RN-REP-15 (decisión 58) · y por eso mismo `operation` empieza en
      -- `standard`: el mes ya se cuenta en el relato, y lo que queda en
      -- Operación —plazos, tiempos, bloqueos— es justo lo que Básico no
      -- paga. Un informe `basic` es resumen ejecutivo más relato del mes.
      ('basic',         true,  true,  false, false, false, false, false),
      ('standard',      true,  true,  true,  false, false, false, false),
      ('standard_plus', true,  true,  true,  true,  false, false, false),
      ('advanced',      true,  true,  true,  true,  true,  true,  true),
      ('complete',      true,  true,  true,  true,  true,  true,  true)
    ) as f(nivel, resumen, relato, operacion, digital, oportunidades, anexos, finanzas)
  loop
    if public.report_level_allows(v.nivel, 'executive_summary') <> v.resumen
       or public.report_level_allows(v.nivel, 'month_activity') <> v.relato
       or public.report_level_allows(v.nivel, 'operation') <> v.operacion
       or public.report_level_allows(v.nivel, 'digital') <> v.digital
       or public.report_level_allows(v.nivel, 'opportunities') <> v.oportunidades
       or public.report_level_allows(v.nivel, 'annexes') <> v.anexos
       or public.report_level_allows(v.nivel, 'finance') <> v.finanzas then
      raise exception 'RN-REP-15 FALLA: el nivel % no admite lo que debe', v.nivel;
    end if;
  end loop;

  -- Ninguno quita lo del anterior.
  for v in
    select * from (values
      ('basic', 'standard'), ('standard', 'standard_plus'),
      ('standard_plus', 'advanced'), ('advanced', 'complete')
    ) as f(bajo, alto)
  loop
    if exists (
      select 1 from unnest(public.report_sections_catalogue()) as s(k)
      where public.report_level_allows(v.bajo, s.k)
        and not public.report_level_allows(v.alto, s.k)
    ) then
      raise exception 'RN-REP-15 FALLA: % quita algo que % sí admitía', v.alto, v.bajo;
    end if;
  end loop;

  -- Un nivel desconocido no alcanza nada: en la duda, el informe corto.
  if public.report_level_allows('platino', 'executive_summary') then
    raise exception 'RN-REP-15 FALLA: un nivel inventado admite secciones';
  end if;

  -- Y una sección desconocida tampoco entra por el nivel más alto.
  if public.report_level_allows('complete', 'lo_que_sea') then
    raise exception 'RN-REP-15 FALLA: una sección inventada entra en el informe completo';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-REP-15 · el reparto de Restavor
-- ------------------------------------------------------------
--
-- Los planes los crea `create_restavor_space()`, no una migración: en una
-- base recién migrada no hay ni uno, así que la suite crea el espacio.
insert into auth.users (id, email, role, aud) values
  ('d0400000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name)
values ('d0400000-0000-0000-0000-000000000001', 'info@restavor.com', 'Bosco 59')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', 'd0400000-0000-0000-0000-000000000001', true);
-- RN-ADM-02 · el sombrero de plataforma solo existe en dos pasos.
select set_config('request.jwt.claim.aal', 'aal2', true);

-- Solo si no está ya. `planes_de_restavor.sql` no es transaccional y deja
-- el espacio creado si corre antes que esta; crearlo dos veces lanza. Lo
-- que esta suite comprueba es el REPARTO, no quién lo crea.
--
-- La comprobación va como `postgres` y **no** como `authenticated`, que es
-- por donde se coló la primera versión: `spaces` tiene RLS, este usuario
-- no es miembro de Restavor, y preguntando desde `authenticated` el
-- espacio "no existe" aunque esté ahí. El rol solo se cambia para llamar a
-- la función, que exige `is_platform_owner()`.
do $$
begin
  if not exists (select 1 from public.spaces where slug = 'restavor') then
    set local role authenticated;
    perform public.create_restavor_space();
    set local role postgres;
  end if;
end;
$$;

do $$
declare
  v record;
begin
  for v in
    select * from (values
      -- Decisión 84 (26/09/2026) · Impulso+ ('standard_plus') y Premium+
      -- ('complete') salen del catálogo de Restavor. Los dos niveles siguen
      -- existiendo (la escalera de arriba) para el plan que los tenga.
      ('Básico', 'basic'), ('Impulso', 'standard'), ('Premium', 'advanced')
    ) as f(plan, nivel)
  loop
    if not exists (
      select 1 from public.plans p
      join public.spaces s on s.id = p.space_id
      where s.slug = 'restavor' and p.name = v.plan and p.report_level = v.nivel
    ) then
      raise exception 'RN-REP-15 FALLA: % no da el informe %', v.plan, v.nivel;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- El escenario: un restaurante con plan Básico
-- ------------------------------------------------------------
insert into auth.users (id, email, role, aud) values
  ('d0400000-0000-0000-0000-000000000003', 'restaurante@suite59.test', 'authenticated', 'authenticated'),
  ('d0400000-0000-0000-0000-000000000004', 'editor@suite59.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d0400000-0000-0000-0000-000000000003', 'restaurante@suite59.test', 'Propietario 59'),
  ('d0400000-0000-0000-0000-000000000004', 'editor@suite59.test', 'Editor 59')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by)
values ('d0400000-0000-0000-0000-000000000010', 'Espacio 59', 'espacio-59', 'Europe/Madrid',
        'd0400000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status)
values ('d0400000-0000-0000-0000-000000000010', 'd0400000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name)
values ('d0400000-0000-0000-0000-000000000015', 'd0400000-0000-0000-0000-000000000010', 'Grupo 59');

insert into public.establishments (id, space_id, group_id, code, name, status)
values ('d0400000-0000-0000-0000-000000000020', 'd0400000-0000-0000-0000-000000000010',
        'd0400000-0000-0000-0000-000000000015', 'R59', 'Magariños 59', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('d0400000-0000-0000-0000-000000000030', 'd0400000-0000-0000-0000-000000000020',
   'd0400000-0000-0000-0000-000000000003', 'local_owner'),
  ('d0400000-0000-0000-0000-000000000031', 'd0400000-0000-0000-0000-000000000020',
   'd0400000-0000-0000-0000-000000000004', 'editor');

-- El Editor ve informes pero NO la facturación: es el caso de RN-REP-16.
insert into public.establishment_permissions
  (establishment_membership_id, view_reports, view_billing)
values ('d0400000-0000-0000-0000-000000000031', true, false);

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo,
                          included_medium, included_large, start_sla_hours, report_level)
values ('d0400000-0000-0000-0000-000000000040', 'd0400000-0000-0000-0000-000000000010',
        'Sencillo 59', 9900, 0, 0, 0, 0, 48, 'basic'),
       ('d0400000-0000-0000-0000-000000000041', 'd0400000-0000-0000-0000-000000000010',
        'Todo 59', 59900, 25, 24, 5, 1, 24, 'complete');

insert into public.subscriptions (space_id, establishment_id, kind, plan_id, status)
values ('d0400000-0000-0000-0000-000000000010', 'd0400000-0000-0000-0000-000000000020',
        'plan', 'd0400000-0000-0000-0000-000000000040', 'active');

do $$
begin
  if public.establishment_report_level('d0400000-0000-0000-0000-000000000020') <> 'basic' then
    raise exception 'RN-REP-15 FALLA: el nivel del restaurante no sale de su plan';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-REP-15 · preparar un informe respeta el nivel
-- ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0400000-0000-0000-0000-000000000001', true);

do $$
declare
  v_report uuid;
begin
  v_report := public.create_report_draft(
    'd0400000-0000-0000-0000-000000000010', 'digital', 'Informe de prueba',
    '2026-09-01', '2026-09-30', 'd0400000-0000-0000-0000-000000000020', null, null, null);

  -- Es un informe de familia "digital", así que sin el nivel entraría la
  -- sección de Rendimiento digital marcada. Con plan Básico, no.
  if (select included from public.report_sections
      where report_id = v_report and section_key = 'digital') then
    raise exception 'RN-REP-15 FALLA: un plan Básico prepara un informe con Rendimiento digital';
  end if;

  if not (select included from public.report_sections
          where report_id = v_report and section_key = 'executive_summary') then
    raise exception 'RN-REP-15 FALLA: el resumen ejecutivo no entra ni en el nivel básico';
  end if;

  -- **La comprobación que justifica la mitad de esta suite**: marcarla a
  -- mano tampoco vale. Si esto pasara, el nivel sería decorativo.
  begin
    perform public.set_report_sections(v_report,
      '[{"key": "digital", "included": true}]'::jsonb);
    raise exception 'RN-REP-15 FALLA: se marcó a mano una sección que el plan no incluye';
  exception
    when others then
      if sqlerrm like 'RN-REP-15 FALLA%' then raise; end if;
      if sqlerrm not like '%no incluye la sección%' then raise; end if;
  end;

  -- Y apagar una que no se puede tener sí vale: no se bloquea quitar.
  perform public.set_report_sections(v_report,
    '[{"key": "digital", "included": false}]'::jsonb);
end;
$$;

-- Con el plan alto, la misma sección entra.
set local role postgres;
update public.subscriptions set plan_id = 'd0400000-0000-0000-0000-000000000041'
where establishment_id = 'd0400000-0000-0000-0000-000000000020';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0400000-0000-0000-0000-000000000001', true);

do $$
declare
  v_report uuid;
begin
  v_report := public.create_report_draft(
    'd0400000-0000-0000-0000-000000000010', 'digital', 'Informe completo',
    '2026-09-01', '2026-09-30', 'd0400000-0000-0000-0000-000000000020', null, null, null);

  if not (select included from public.report_sections
          where report_id = v_report and section_key = 'digital') then
    raise exception 'RN-REP-15 FALLA: con el plan completo no entra Rendimiento digital';
  end if;

  perform public.set_report_sections(v_report,
    '[{"key": "finance", "included": true}]'::jsonb);
end;
$$;

-- ------------------------------------------------------------
-- RN-REP-16 · con Finanzas dentro, no lo ve quien no puede verla
-- ------------------------------------------------------------
set local role postgres;

-- Un informe enviado, con Finanzas dentro, del restaurante.
insert into public.reports (id, space_id, establishment_id, category, name,
                            period_start, period_end, status, created_by, updated_by)
values ('d0400000-0000-0000-0000-000000000050', 'd0400000-0000-0000-0000-000000000010',
        'd0400000-0000-0000-0000-000000000020', 'finance', 'Con finanzas',
        '2026-09-01', '2026-09-30', 'sent',
        'd0400000-0000-0000-0000-000000000001', 'd0400000-0000-0000-0000-000000000001');

insert into public.report_sections (space_id, report_id, section_key, position, included, updated_by)
values ('d0400000-0000-0000-0000-000000000010', 'd0400000-0000-0000-0000-000000000050',
        'finance', 1, true, 'd0400000-0000-0000-0000-000000000001');

-- Y otro sin ella, para que se vea que lo que cierra la puerta es la
-- sección y no el restaurante.
insert into public.reports (id, space_id, establishment_id, category, name,
                            period_start, period_end, status, created_by, updated_by)
values ('d0400000-0000-0000-0000-000000000051', 'd0400000-0000-0000-0000-000000000010',
        'd0400000-0000-0000-0000-000000000020', 'operation', 'Sin finanzas',
        '2026-09-01', '2026-09-30', 'sent',
        'd0400000-0000-0000-0000-000000000001', 'd0400000-0000-0000-0000-000000000001');

insert into public.report_sections (space_id, report_id, section_key, position, included, updated_by)
values ('d0400000-0000-0000-0000-000000000010', 'd0400000-0000-0000-0000-000000000051',
        'operation', 1, true, 'd0400000-0000-0000-0000-000000000001');

set local role authenticated;

-- El Editor con "Consultar informes" pero SIN "Pagos y facturas".
select set_config('request.jwt.claim.sub', 'd0400000-0000-0000-0000-000000000004', true);

do $$
begin
  if exists (select 1 from public.reports where id = 'd0400000-0000-0000-0000-000000000050') then
    raise exception 'RN-REP-16 FALLA: un Editor sin "Pagos y facturas" alcanza un informe con Finanzas';
  end if;

  if not exists (select 1 from public.reports where id = 'd0400000-0000-0000-0000-000000000051') then
    raise exception 'RN-REP-16 FALLA: se le ha cerrado también el informe que NO lleva Finanzas';
  end if;
end;
$$;

-- El Propietario del restaurante los tiene todos por su rol (RN-EST-15),
-- así que ve los dos.
select set_config('request.jwt.claim.sub', 'd0400000-0000-0000-0000-000000000003', true);

do $$
begin
  -- Los dos ENVIADOS. Los borradores de arriba no los ve: no se le han
  -- mandado (RN-REP-13), y eso lo comprueba `informes.sql`.
  if not exists (select 1 from public.reports where id = 'd0400000-0000-0000-0000-000000000050')
     or not exists (select 1 from public.reports where id = 'd0400000-0000-0000-0000-000000000051') then
    raise exception 'RN-REP-16 FALLA: el propietario del restaurante no ve sus dos informes';
  end if;
end;
$$;

-- Y el equipo ve los dos, con Finanzas o sin ella: es su cartera.
--
-- Se comprueban por id y no contando: esta misma suite ha preparado antes
-- dos borradores para este restaurante, así que el equipo ve cuatro
-- informes y un `count(*) = 2` mediría el número de borradores de arriba
-- en vez de lo que esta comprobación quiere decir.
select set_config('request.jwt.claim.sub', 'd0400000-0000-0000-0000-000000000001', true);

do $$
begin
  if not exists (select 1 from public.reports where id = 'd0400000-0000-0000-0000-000000000050')
     or not exists (select 1 from public.reports where id = 'd0400000-0000-0000-0000-000000000051') then
    raise exception 'RN-REP-16 FALLA: el equipo ha perdido de vista un informe suyo';
  end if;
end;
$$;

rollback;
