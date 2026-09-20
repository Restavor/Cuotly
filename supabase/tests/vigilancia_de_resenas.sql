-- ============================================================
-- Suite 62 · Vigilancia de reseñas de Google
--            (migración 117; RN-INT-10, RN-INT-11, RN-INT-12; decisión 60)
-- ============================================================
--
--   · RN-INT-10: la vigilancia la concede el PLAN. Si no la concede, la
--     reseña no se guarda — y la barrera está en el servidor, no en el
--     adaptador.
--   · RN-INT-10: las reseñas solo vienen de Business Profile.
--   · RN-INT-11: tres estrellas o menos es baja (decisión 60).
--   · RN-INT-12: al equipo todas, al restaurante solo las bajas. Y volver a
--     sincronizar no duplica ni vuelve a avisar.
--   · RLS: quien puede leer el restaurante lee sus reseñas; el de fuera, no.
--   · CLAUDE.md: las internas están cerradas por RPC, la tabla lleva los dos
--     disparadores de solo lectura y está declarada en el traspaso.
--
-- **Por qué esta suite cuenta avisos y no se fía de que la función no
-- reviente**: `emit_notification()` termina en `when others then return
-- null`, así que un `entity_type` que no estuviera en su lista `check` no
-- daría error — simplemente no avisaría a nadie, en silencio, para
-- siempre. Contar los avisos es la única forma de que eso no pase.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/vigilancia_de_resenas.sql
--
-- Prefijo de esta suite: d0700000-.

begin;

set local role postgres;

-- ------------------------------------------------------------
-- El decorado
-- ------------------------------------------------------------
insert into auth.users (id, email, role, aud) values
  ('d0700000-0000-0000-0000-000000000001', 'duena62@cuotly.test', 'authenticated', 'authenticated'),
  ('d0700000-0000-0000-0000-000000000002', 'cliente62@cuotly.test', 'authenticated', 'authenticated'),
  ('d0700000-0000-0000-0000-000000000003', 'fuera62@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d0700000-0000-0000-0000-000000000001', 'duena62@cuotly.test', 'Dueña 62'),
  ('d0700000-0000-0000-0000-000000000002', 'cliente62@cuotly.test', 'Cliente 62'),
  ('d0700000-0000-0000-0000-000000000003', 'fuera62@cuotly.test', 'Fuera 62')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('d0710000-0000-0000-0000-000000000001', 'Espacio 62', 'espacio-62', 'Europe/Madrid',
   'd0700000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d0710000-0000-0000-0000-000000000001', 'd0700000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('d0730000-0000-0000-0000-000000000001', 'd0710000-0000-0000-0000-000000000001', 'Grupo 62');

-- Dos planes que se diferencian **solo** en la vigilancia, para que lo que
-- se mide sea la columna y no el nombre ni el precio.
insert into public.plans
  (id, space_id, name, price_cents, included_small, included_photo, included_medium,
   included_large, start_sla_hours, grants_priority, report_level, watches_reviews) values
  ('d0720000-0000-0000-0000-000000000001', 'd0710000-0000-0000-0000-000000000001',
   'Premium+ 62', 59900, 20, 15, 4, 1, 24, true, 'complete', true),
  ('d0720000-0000-0000-0000-000000000002', 'd0710000-0000-0000-0000-000000000001',
   'Básico 62', 9900, 0, 0, 0, 0, 48, false, 'basic', false);

-- El del plan que vigila, y el vecino que no. El vecino existe para que
-- "el plan lo concede" no sea una frase que nadie comprueba.
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('d0740000-0000-0000-0000-000000000001', 'd0710000-0000-0000-0000-000000000001',
   'd0730000-0000-0000-0000-000000000001', 'EST-62-1', 'Casa Reseñas', 'active'),
  ('d0740000-0000-0000-0000-000000000002', 'd0710000-0000-0000-0000-000000000001',
   'd0730000-0000-0000-0000-000000000001', 'EST-62-2', 'El Vecino Básico', 'active');

insert into public.subscriptions (space_id, establishment_id, kind, plan_id, status) values
  ('d0710000-0000-0000-0000-000000000001', 'd0740000-0000-0000-0000-000000000001', 'plan',
   'd0720000-0000-0000-0000-000000000001', 'active'),
  ('d0710000-0000-0000-0000-000000000001', 'd0740000-0000-0000-0000-000000000002', 'plan',
   'd0720000-0000-0000-0000-000000000002', 'active');

-- Quien lleva el panel del restaurante: es a quien hay que avisar cuando
-- la reseña es baja, y a quien NO hay que avisar cuando no lo es.
insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('d0740000-0000-0000-0000-000000000001', 'd0700000-0000-0000-0000-000000000002', 'local_owner');

insert into public.integrations
  (id, space_id, establishment_id, provider, status, auth_kind) values
  ('d0750000-0000-0000-0000-000000000001', 'd0710000-0000-0000-0000-000000000001',
   'd0740000-0000-0000-0000-000000000001', 'business_profile', 'connected', 'oauth'),
  ('d0750000-0000-0000-0000-000000000002', 'd0710000-0000-0000-0000-000000000001',
   'd0740000-0000-0000-0000-000000000002', 'business_profile', 'connected', 'oauth'),
  -- La misma casa, otra fuente: para probar que una reseña no puede colgar
  -- de una conexión que no es la de Google Business Profile.
  ('d0750000-0000-0000-0000-000000000003', 'd0710000-0000-0000-0000-000000000001',
   'd0740000-0000-0000-0000-000000000001', 'pagespeed', 'connected', 'api_key');

-- ============================================================
-- RN-INT-11 · qué es una reseña baja
-- ============================================================
do $$
begin
  if public.review_low_rating_threshold() <> 3 then
    raise exception 'RN-INT-11 FALLA: el umbral no es 3, es % (lo fijó Bosco el 20/09/2026)',
      public.review_low_rating_threshold();
  end if;
end;
$$;

-- ============================================================
-- RN-INT-10 · el plan concede la vigilancia
-- ============================================================
do $$
declare
  v_error text;
begin
  -- La casa con Premium+ sí.
  if not public.establishment_watches_reviews('d0740000-0000-0000-0000-000000000001') then
    raise exception 'RN-INT-10 FALLA: el plan que vigila no vigila';
  end if;

  -- El vecino con Básico, no.
  if public.establishment_watches_reviews('d0740000-0000-0000-0000-000000000002') then
    raise exception 'RN-INT-10 FALLA: un plan que no la concede está vigilando';
  end if;

  -- Y la barrera está en el SERVIDOR, no en el adaptador: aunque alguien
  -- llame la función directamente con la conexión del vecino, no entra
  -- ni una reseña. Un adaptador es código que se puede llamar mal.
  begin
    perform public.record_establishment_reviews(
      'd0750000-0000-0000-0000-000000000002',
      '[{"external_id": "g-vecino-1", "rating": 5, "reviewed_at": "2026-09-01T10:00:00Z"}]'::jsonb);
    -- `assert_failure` y no el P0001 por defecto: si no, el manejador de
    -- abajo se traga esta línea y la suite falla diciendo 'por otro motivo',
    -- escondiendo el motivo de verdad.
    raise exception 'RN-INT-10 FALLA: se guardó una reseña de un plan que no la incluye'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_error = message_text;
      if v_error not like '%no incluye la vigilancia%' then
        raise exception 'RN-INT-10 FALLA: falló por otro motivo (%)', v_error;
      end if;
  end;

  if exists (select 1 from public.reviews
             where establishment_id = 'd0740000-0000-0000-0000-000000000002') then
    raise exception 'RN-INT-10 FALLA: el vecino tiene reseñas guardadas';
  end if;

  -- Y solo de Business Profile: una reseña colgando de PageSpeed sería un
  -- adaptador equivocado escribiendo donde no debe.
  begin
    perform public.record_establishment_reviews(
      'd0750000-0000-0000-0000-000000000003',
      '[{"external_id": "g-mal-1", "rating": 5, "reviewed_at": "2026-09-01T10:00:00Z"}]'::jsonb);
    raise exception 'RN-INT-10 FALLA: se guardó una reseña por una fuente que no es Google'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_error = message_text;
      if v_error not like '%Business Profile%' then
        raise exception 'RN-INT-10 FALLA: falló por otro motivo (%)', v_error;
      end if;
  end;
end;
$$;

-- ============================================================
-- RN-INT-12 · al equipo todas, al restaurante solo las bajas
-- ============================================================
do $$
declare
  v_nuevas integer;
  v_equipo integer;
  v_cliente integer;
  v_bajas integer;
begin
  v_nuevas := public.record_establishment_reviews(
    'd0750000-0000-0000-0000-000000000001',
    '[
      {"external_id": "g-1", "rating": 5, "comment": "Espectacular",
       "author_name": "Marta R.", "reviewed_at": "2026-09-02T20:00:00Z"},
      {"external_id": "g-2", "rating": 2, "comment": "Tardaron mucho",
       "author_name": "Javier L.", "reviewed_at": "2026-09-05T21:30:00Z"},
      {"external_id": "g-3", "rating": 3, "author_name": "Sin Comentario",
       "reviewed_at": "2026-09-07T14:00:00Z"}
     ]'::jsonb);

  if v_nuevas <> 3 then
    raise exception 'RN-INT-10 FALLA: se guardaron % reseñas de 3', v_nuevas;
  end if;

  -- Una reseña sin comentario es normal: Google deja puntuar sin escribir,
  -- y eso NO se rellena con nada (CLAUDE.md).
  if (select comment from public.reviews where external_id = 'g-3') is not null then
    raise exception 'CLAUDE.md FALLA: una reseña sin comentario trae algo escrito';
  end if;

  -- Al EQUIPO, las tres.
  select count(*) into v_equipo
  from public.notifications
  where recipient_id = 'd0700000-0000-0000-0000-000000000001'
    and entity_type = 'review';

  if v_equipo <> 3 then
    raise exception 'RN-INT-12 FALLA: el equipo recibió % avisos de 3', v_equipo;
  end if;

  -- Y las dos bajas llegan nombradas como lo que son, porque el aviso de
  -- una reseña de 2 estrellas no se lee igual que el de una de 5.
  select count(*) into v_bajas
  from public.notifications
  where recipient_id = 'd0700000-0000-0000-0000-000000000001'
    and event_type = 'low_review_received';

  if v_bajas <> 2 then
    raise exception 'RN-INT-11 FALLA: % avisos de reseña baja, esperaba 2 (la de 2 y la de 3)', v_bajas;
  end if;

  -- Al RESTAURANTE, solo las bajas. Un aviso que llega todos los días deja
  -- de leerse, y entonces no sirve el día que importa.
  select count(*) into v_cliente
  from public.notifications
  where recipient_id = 'd0700000-0000-0000-0000-000000000002'
    and entity_type = 'review';

  if v_cliente <> 2 then
    raise exception 'RN-INT-12 FALLA: el restaurante recibió % avisos, esperaba 2', v_cliente;
  end if;

  if exists (
    select 1 from public.notifications n
    join public.reviews r on r.id = n.entity_id
    where n.recipient_id = 'd0700000-0000-0000-0000-000000000002' and r.rating = 5
  ) then
    raise exception 'RN-INT-12 FALLA: al restaurante le llegó el aviso de una reseña de 5 estrellas';
  end if;
end;
$$;

-- ============================================================
-- RN-INT-12 · volver a sincronizar no duplica ni vuelve a avisar
-- ============================================================
do $$
declare
  v_nuevas integer;
  v_filas integer;
  v_avisos integer;
begin
  select count(*) into v_avisos from public.notifications where entity_type = 'review';

  -- La misma tanda otra vez, más una nueva: es exactamente lo que hace la
  -- sincronización de mañana.
  v_nuevas := public.record_establishment_reviews(
    'd0750000-0000-0000-0000-000000000001',
    '[
      {"external_id": "g-1", "rating": 5, "comment": "Espectacular",
       "author_name": "Marta R.", "reviewed_at": "2026-09-02T20:00:00Z"},
      {"external_id": "g-2", "rating": 2, "comment": "Tardaron mucho",
       "author_name": "Javier L.", "reviewed_at": "2026-09-05T21:30:00Z"},
      {"external_id": "g-3", "rating": 3, "author_name": "Sin Comentario",
       "reviewed_at": "2026-09-07T14:00:00Z"},
      {"external_id": "g-4", "rating": 1, "comment": "Fatal",
       "author_name": "Nuevo", "reviewed_at": "2026-09-09T13:00:00Z"}
     ]'::jsonb);

  if v_nuevas <> 1 then
    raise exception 'RN-INT-12 FALLA: la segunda vuelta contó % nuevas, esperaba 1', v_nuevas;
  end if;

  select count(*) into v_filas from public.reviews
  where establishment_id = 'd0740000-0000-0000-0000-000000000001';
  if v_filas <> 4 then
    raise exception 'RN-INT-12 FALLA: hay % reseñas guardadas, esperaba 4', v_filas;
  end if;

  -- Tres avisos más y ni uno de las que ya estaban: el equipo (1) y el
  -- restaurante (1) por la de una estrella. Si las tres viejas volvieran a
  -- avisar, sincronizar cada día sería una tortura y nadie leería nada.
  if (select count(*) from public.notifications where entity_type = 'review') <> v_avisos + 2 then
    raise exception 'RN-INT-12 FALLA: una reseña ya conocida volvió a avisar';
  end if;
end;
$$;

-- ============================================================
-- RLS · quien puede leer el restaurante lee sus reseñas
-- ============================================================
set local role authenticated;

set local request.jwt.claim.sub = 'd0700000-0000-0000-0000-000000000002';
do $$
begin
  if (select count(*) from public.reviews) <> 4 then
    raise exception 'RLS FALLA: el restaurante no ve sus propias reseñas (ve %)',
      (select count(*) from public.reviews);
  end if;
end;
$$;

set local request.jwt.claim.sub = 'd0700000-0000-0000-0000-000000000003';
do $$
begin
  if (select count(*) from public.reviews) <> 0 then
    raise exception 'RLS FALLA: alguien de fuera ve % reseñas ajenas',
      (select count(*) from public.reviews);
  end if;
end;
$$;

reset role;
set local role postgres;

-- ============================================================
-- CLAUDE.md · lo que sostiene todo lo anterior
-- ============================================================
do $$
declare
  v_fn text;
  v_abiertas text := '';
begin
  -- Las internas, cerradas por RPC. Revocar solo a PUBLIC no vale: un
  -- proyecto de Supabase concede EXECUTE por defecto a anon y a
  -- authenticated sobre toda función nueva.
  for v_fn in
    select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('record_establishment_reviews', 'establishment_watches_reviews')
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    v_abiertas := v_abiertas || ' ' || v_fn;
  end loop;

  if v_abiertas <> '' then
    raise exception 'CLAUDE.md MUST FALLIDO: función interna de reseñas abierta por RPC:%', v_abiertas
      using errcode = 'assert_failure';
  end if;

  -- Los DOS disparadores de solo lectura, que son distintos: uno es Modo
  -- soporte (§129) y el otro el espacio archivado por impago (RN-SUB-08).
  if not exists (select 1 from pg_trigger where tgname = 'reviews_guard_support_read_only') then
    raise exception 'CLAUDE.md FALLA: `reviews` no lleva el guardián de Modo soporte';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'reviews_cuotly_read_only') then
    raise exception 'RN-SUB-08 FALLA: `reviews` no lleva el guardián de espacio archivado';
  end if;

  -- Y declarada en el traspaso: viaja, porque la ficha de Google es del
  -- restaurante y sigue siéndolo si cambia de agencia (RN-TRA).
  if not exists (
    select 1 from public.establishment_transfer_tables() t
    where t.table_name = 'reviews' and t.travels
  ) then
    raise exception 'RN-TRA FALLA: `reviews` no está declarada como que viaja con el restaurante';
  end if;

  -- RLS encendida. Una tabla con `space_id` sin RLS es la forma más rápida
  -- de enseñarle a un espacio lo de otro.
  if not (select relrowsecurity from pg_class where relname = 'reviews') then
    raise exception 'CLAUDE.md MUST FALLIDO: `reviews` sin RLS';
  end if;
end;
$$;

rollback;
