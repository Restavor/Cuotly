-- Los cuatro planes de mantenimiento de Restavor: Impulso, Impulso+,
-- Premium y Premium+ (16/09/2026, decisión 39; PRD §6.1).
--
-- **Lo que este archivo es.** Restavor fijó el 16/09/2026 su catálogo
-- definitivo en cuatro fichas (una por plan) y Bosco decidió que Cuotly lo
-- refleje tal cual. Lo que cambia respecto del catálogo del Hito 2:
--
--   · **Impulso** pasa a ser el plan de entrada con cambios incluidos:
--     299 € + IVA, 6 pequeños, 1 mediano, 6 fotográficos, sin grandes, e
--     inicio en 48 horas laborables (antes 24).
--   · **Impulso+** es lo que hasta hoy se llamaba Impulso: 399 € + IVA,
--     16 pequeños, 3 medianos, 12 fotográficos, sin grandes, 24 horas.
--   · **Premium** es nuevo: 499 € + IVA, 10 pequeños, 2 medianos, 12
--     fotográficos, sin grandes, 24 horas. Incluye MENOS cambios pequeños
--     que Impulso+ y no es un error: es lo que dice su ficha (analítica
--     avanzada y SEO a cambio de menos capacidad).
--   · **Premium+** es lo que hasta hoy se llamaba Premium: 599 € + IVA,
--     25 pequeños, 5 medianos, 1 grande, 24 fotográficos, 24 horas, y el
--     único que concede prioridad (`grants_priority`).
--   · **Básico** se queda como está (decisión 39, punto 1): 99 € + IVA y
--     ningún cambio incluido. Las fichas no lo mencionan y Bosco decidió
--     que no se toca.
--
-- **Qué sigue decidiéndose por lo que el plan ES y no por su nombre.**
-- Nada de lo de abajo cambia una regla: `grants_priority` sigue siendo la
-- única marca del plan alto, y la concede solo Premium+. De ella cuelgan,
-- como hasta hoy, las cuatro cosas que ya colgaban: el restaurante ordena
-- sus cambios (migración 62), va por delante en la cola (RN-COM-03), paga
-- Menú Diario a 199 € en vez de 229 € (RN-COM-08, decisión 20) y ve las
-- oportunidades avanzadas (RN-OPP-08). Impulso+ y Premium tienen las 24
-- horas de inicio pero NO la prioridad: sus fichas dicen "prioridad alta"
-- y solo la de Premium+ dice "prioridad superior en la cola". El plazo de
-- inicio sale de `plans.start_sla_hours`, así que Impulso a 48 horas no
-- necesita tocar ningún reloj.
--
-- **Por qué se renombra en vez de crear cuatro filas nuevas.** El Impulso
-- actual (399 €, 16/3/0/12, 24 h) es exactamente el nuevo Impulso+, y el
-- Premium actual (599 €, 25/5/1/24, 24 h, con prioridad) es exactamente el
-- nuevo Premium+. Renombrarlos deja a los restaurantes que los tienen con
-- las mismas condiciones, la misma suscripción, la misma permanencia y el
-- mismo ciclo: no hay nada que migrar de ellos. Crear filas nuevas y dejar
-- las viejas habría dejado dos planes idénticos con nombres distintos y sin
-- forma de archivar uno (`plans` no tiene estado). Lo que sí se crea son
-- los dos planes que no existían, Impulso (299 €) y Premium (499 €).
--
-- **Lo que NO hace este archivo.** No publica las condiciones de cada plan
-- (RN-DAT-07, migración 75): las fichas traen un texto de condiciones y
-- Bosco decidió publicarlo él desde la pantalla de Condiciones, porque
-- publicar dispara el aviso de condiciones nuevas a los restaurantes con
-- suscripción activa (migración 76) y eso es una decisión suya, no de una
-- migración. Tampoco construye lógica por plan para analítica, informes,
-- SEO ni copias de seguridad (decisión 39, punto 5): esas líneas de las
-- fichas son descripción comercial del plan y viven en el PRD §6.1, no en
-- una regla del servidor.
--
-- Se comprueba con `supabase/tests/planes_de_restavor.sql`.

-- ============================================================
-- 1 · La semilla de Restavor, con los cinco planes
-- ============================================================
create or replace function public.create_restavor_space()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_owner_id uuid := auth.uid();
begin
  if not public.is_platform_owner() then
    raise exception 'Solo el propietario de Cuotly puede crear el espacio de Restavor';
  end if;

  if exists (select 1 from public.spaces where slug = 'restavor') then
    raise exception 'El espacio de Restavor ya existe';
  end if;

  insert into public.spaces (name, slug, timezone, created_by)
  values ('Restavor', 'restavor', 'Europe/Madrid', v_owner_id)
  returning id into v_space_id;

  insert into public.space_memberships (space_id, user_id, role, status)
  values (v_space_id, v_owner_id, 'owner', 'active');

  -- Los planes de mantenimiento de Restavor (PRD §6.1, fichas del
  -- 16/09/2026). Precios en céntimos, más IVA. Solo Premium+ concede la
  -- prioridad, y solo Premium+ incluye un cambio grande.
  insert into public.plans
    (space_id, name, price_cents, included_small, included_photo, included_medium,
     included_large, start_sla_hours, grants_priority)
  values
    (v_space_id, 'Básico',   9900,   0,  0, 0, 0, 48, false),
    (v_space_id, 'Impulso',  29900,  6,  6, 1, 0, 48, false),
    (v_space_id, 'Impulso+', 39900, 16, 12, 3, 0, 24, false),
    (v_space_id, 'Premium',  49900, 10, 12, 2, 0, 24, false),
    (v_space_id, 'Premium+', 59900, 25, 24, 5, 1, 24, true);

  -- Servicio Menú Diario (RN-COM-08 a 10): 229 € + IVA, o 199 € + IVA con
  -- el plan que concede prioridad (Premium+); 30 actualizaciones por ciclo.
  insert into public.services (space_id, name, price_cents, price_premium_cents, kind, included_updates)
  values (v_space_id, 'Menú Diario', 22900, 19900, 'daily_menu', 30);

  insert into public.space_working_hours (space_id, calendar_kind, timezone, created_by)
  values
    (v_space_id, 'contractual', 'Europe/Madrid', v_owner_id),
    (v_space_id, 'support', 'Europe/Madrid', v_owner_id),
    (v_space_id, 'menu_diario', 'Europe/Madrid', v_owner_id);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id,
    v_owner_id,
    'space.created',
    'space',
    v_space_id,
    jsonb_build_object('name', 'Restavor', 'slug', 'restavor', 'via', 'create_restavor_space')
  );

  return v_space_id;
end;
$$;

comment on function public.create_restavor_space() is
  'Único punto de entrada para crear el espacio de Restavor. No hay
   ninguna otra vía (ni política de INSERT directo en spaces salvo esta
   función, que además exige is_platform_owner()). Pulsarlo dos veces
   lanza un error explícito en la segunda, en vez de duplicar el espacio.
   Siembra los cinco planes de PRD §6.1 (fichas del 16/09/2026) y Menú
   Diario.';

-- ============================================================
-- 2 · Los espacios que ya existen: Restavor y el de demostración
--
-- Los dos están creados en el proyecto real con el catálogo del Hito 2
-- (`docs/DESPLIEGUE-SUPABASE.md`). El nombre del espacio aparece aquí y
-- no en una regla, por la misma razón que en la migración 63: esto es la
-- semilla de Restavor, que es quien fijó estos precios, y el espacio de
-- demostración la copia. Otro espacio de la plataforma tiene su propio
-- catálogo y no se toca.
--
-- Se renombra solo la fila que sigue siendo la del Hito 2 (mismo precio),
-- y se crea cada plan nuevo solo si no existe: la migración se puede
-- aplicar dos veces sin duplicar nada, y en un espacio recién sembrado por
-- la función de arriba no hace nada.
--
-- Va en una función y no en un bloque suelto para que la suite pueda
-- ejecutarla sobre un espacio de prueba con el catálogo viejo y comprobar
-- qué hace y qué no hace. Es interna: nadie la llama por RPC (CLAUDE.md:
-- revocada a public, anon y authenticated, no solo a public).
-- ============================================================
create or replace function public.upgrade_restavor_plan_catalogue(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Impulso+') then
    update public.plans
      set name = 'Impulso+'
    where space_id = p_space_id and name = 'Impulso' and price_cents = 39900;
  end if;

  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Premium+') then
    update public.plans
      set name = 'Premium+'
    where space_id = p_space_id and name = 'Premium' and price_cents = 59900;
  end if;

  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Impulso') then
    insert into public.plans
      (space_id, name, price_cents, included_small, included_photo, included_medium,
       included_large, start_sla_hours, grants_priority)
    values (p_space_id, 'Impulso', 29900, 6, 6, 1, 0, 48, false);
  end if;

  if not exists (select 1 from public.plans where space_id = p_space_id and name = 'Premium') then
    insert into public.plans
      (space_id, name, price_cents, included_small, included_photo, included_medium,
       included_large, start_sla_hours, grants_priority)
    values (p_space_id, 'Premium', 49900, 10, 12, 2, 0, 24, false);
  end if;
end;
$$;

comment on function public.upgrade_restavor_plan_catalogue(uuid) is
  'Interna, 16/09/2026 · lleva el catálogo del Hito 2 (Básico, Impulso,
   Premium) al de las cuatro fichas de Restavor: renombra Impulso a
   Impulso+ y Premium a Premium+ (mismas condiciones, mismas
   suscripciones) y crea Impulso (299 €) y Premium (499 €) si no existen.
   Idempotente. No toca Básico ni ningún otro plan.';

revoke all on function public.upgrade_restavor_plan_catalogue(uuid) from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select id from public.spaces where slug in ('restavor', 'demo')
  loop
    perform public.upgrade_restavor_plan_catalogue(r.id);
  end loop;
end $$;

-- ============================================================
-- 3 · El centro de ayuda (RN-SOP-10, migración 93) nombraba los tres
--     planes del Hito 2. Las guías se versionan por migración: cambiar
--     una es una versión más, con rastro en el repositorio.
-- ============================================================
update public.help_articles
set
  body = 'Las mensualidades de tus restaurantes se emiten solas el día uno y quedan registradas en un libro de apuntes con signo: emitir suma, cobrar resta y reembolsar vuelve a sumar. Nunca hay un saldo que se edite a mano. El estado de cada cobro se deriva del libro y del vencimiento.
Los planes que vendes son Básico, Impulso, Impulso+, Premium y Premium+, más IVA, con tres meses de permanencia y sin bolsas de horas. El Básico no incluye cambios ni fotografías; solo Premium+ incluye un cambio grande al mes y es el único con el precio reducido de Menú Diario.
Tu suscripción a Cuotly es otra cosa: Pro (149 € al mes, 5 establecimientos y 5 usuarios, adicionales a 25 € y 15 €) o Agency (499 € al mes), más IVA, con 7 días de prueba. Se paga también por transferencia o Bizum, la confirma Cuotly, y un impago archiva el espacio en solo lectura a las 72 horas del vencimiento, recuperable durante 30 días pagando. Todo esto lo ves en Ajustes, en Suscripción.',
  version = version + 1,
  updated_at = now()
where slug = 'cobros-a-tus-restaurantes-y-tu-suscripcion'
  and body not like '%Impulso+%';
