-- Bar Demo, restaurante de pruebas del Agente Menú Diario.
--
-- SOLO "Restavor pruebas" (bnucqykimngjwcrlpmsm). NUNCA en producción ("Cuotly", mcajbfxhkxtdhjoyrqha).
-- Se ejecuta A MANO, cada bloque DO por separado (cada uno es una transacción y se deshace entero si falla).
-- Un resembrado del espacio demo (push a la rama `agents` que toque supabase/seed/, o el proceso
-- "Pruebas · Supabase" con `sembrar`) borra y reconstruye Bar Demo: hay que repetirlo. Bar Demo conserva su id.
-- Es idempotente: cada paso comprueba antes si ya está hecho.
--
-- Permisos de Bosco (03/10/2026): (1) plataforma web, dirección, plantilla de publicar y un menú;
-- (2) opción A para Menú Diario: contratarlo con la función de la app y registrar un pago de demostración.
-- Todo se hace con las funciones de la app, actuando como owner@cuotly.test (Elena Ruiz, administradora del
-- espacio demo con manage_clients y manage_requests; el mismo actor que el sembrado), NO con la cuenta real de
-- Bosco. La identidad se simula con set_config local a la transacción, así cada cambio deja su auditoría.
--
-- Ejecutado el 03/10/2026 en este orden (ver docs/RECONOCIMIENTO.md; el paso 3 se lanzó con el id del cobro fijo y aquí lo localiza solo):
--   1) plataforma y dirección  2) contratar Menú Diario  3) pago de demostración  4) plantilla y menú.

-- ===== 1. Plataforma web y dirección de la web de pruebas =====
do $$
declare
  c_establishment constant uuid := 'd4000000-0000-0000-0000-000000000001'; -- Bar Demo
  c_space         constant uuid := 'd1000000-0000-0000-0000-000000000001'; -- espacio demo
  c_actor         constant uuid := 'd0000000-0000-0000-0000-000000000001'; -- owner@cuotly.test
  e         public.establishments;
  v_changed boolean;
begin
  select * into e from public.establishments where id = c_establishment and space_id = c_space;
  if e.id is null then
    raise exception 'Bar Demo (%) no existe en el espacio demo: no se toca nada', c_establishment;
  end if;
  perform set_config('request.jwt.claim.sub',  c_actor::text,   true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  -- set_establishment_data es la única puerta (un UPDATE directo lo rechaza el disparador
  -- establishments_guard_data) y REEMPLAZA la ficha entera: se pasan los valores actuales del resto.
  -- Si no cambia nada devuelve false y no deja auditoría.
  v_changed := public.set_establishment_data(
    p_establishment_id := c_establishment, p_name := e.name, p_legal_name := e.legal_name,
    p_tax_id := e.tax_id, p_address := e.address, p_postal_code := e.postal_code, p_city := e.city,
    p_contact_name := e.contact_name, p_contact_email := e.contact_email,
    p_phone_primary := e.phone_primary, p_phone_secondary := e.phone_secondary,
    p_website_url := 'https://www.restavor.com/pruebas-agente-menu',
    p_instagram := e.instagram, p_facebook_url := e.facebook_url, p_domain := e.domain,
    p_opening_hours := e.opening_hours, p_web_platform := 'landing_site');
  raise notice 'set_establishment_data devolvio %', v_changed;
end
$$;

-- ===== 2. Contratar Menú Diario (create_service_subscription) =====
-- Escribe: una suscripción de servicio, una permanencia de 3 meses y un cobro de 229 € + IVA = 277,09 €
-- (precio del sembrado demo, anterior a la decisión 85: no se corrige por cuenta propia).
do $$
declare
  c_space   constant uuid := 'd1000000-0000-0000-0000-000000000001';
  c_est     constant uuid := 'd4000000-0000-0000-0000-000000000001';
  c_elena   constant uuid := 'd0000000-0000-0000-0000-000000000001';
  c_service constant uuid := '29287d77-62cc-4b54-8266-f56dd12de6fe'; -- servicio Menú Diario del espacio demo
begin
  if not exists (select 1 from public.establishments where id = c_est and space_id = c_space and name = 'Bar Demo') then
    raise exception 'Bar Demo no esta en el espacio demo: no se toca nada';
  end if;
  if not exists (select 1 from public.services where id = c_service and space_id = c_space and kind = 'daily_menu' and archived_at is null) then
    raise exception 'El servicio Menu Diario no es el esperado: no se toca nada';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_elena, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c_elena::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  if auth.uid() is distinct from c_elena or not public.has_capability(c_space, 'manage_clients') then
    raise exception 'No se pudo actuar como Elena con manage_clients';
  end if;
  if public.establishment_daily_menu_subscription(c_est) is null then
    perform public.create_service_subscription(c_est, c_service);
  end if;
end $$;

-- ===== 3. Pago de demostración del cobro de Menú Diario (como hace el sembrado con el plan de Bar Demo) =====
-- Sin él, el cobro vence el 10/10 y un barrido de impagos pausaría y suspendería Bar Demo.
do $$
declare
  c_elena constant uuid := 'd0000000-0000-0000-0000-000000000001';
  c_est   constant uuid := 'd4000000-0000-0000-0000-000000000001';
  v_charge uuid;
  v_total  integer;
begin
  select c.id, c.total_cents into v_charge, v_total
  from public.charges c
  join public.subscriptions s on s.id = c.subscription_id
  join public.services sv on sv.id = s.service_id
  where s.establishment_id = c_est and sv.kind = 'daily_menu'
    and not exists (select 1 from public.payments p where p.charge_id = c.id)
  order by c.created_at desc limit 1;
  if v_charge is null then
    raise notice 'No hay cobro de Menu Diario sin pagar: no se hace nada';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_elena, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c_elena::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  if auth.uid() is distinct from c_elena then raise exception 'No se pudo actuar como Elena'; end if;
  -- Argumentos nombrados a propósito: la firma lleva p_receipt_file_id en quinta posición.
  perform public.register_payment(
    p_charge_id => v_charge, p_amount_cents => v_total, p_method => 'transfer',
    p_paid_at => now(), p_note => 'Transferencia de demostración');
end $$;

-- ===== 4. Plantilla de publicar y un menú diario en borrador, con una versión =====
-- El menú NO se prepara ni se pide publicar: eso dispararía asignación y avisos.
-- RN-CRE-23: la plantilla incluida de publicar se crea una sola vez; si ya se usó y está archivada, aborta.
do $$
declare
  c_space constant uuid := 'd1000000-0000-0000-0000-000000000001';
  c_est   constant uuid := 'd4000000-0000-0000-0000-000000000001';
  c_elena constant uuid := 'd0000000-0000-0000-0000-000000000001';
  v_template uuid;
  v_menu     uuid;
begin
  if not exists (select 1 from public.establishments where id = c_est and space_id = c_space and name = 'Bar Demo') then
    raise exception 'Bar Demo no esta en el espacio demo: no se toca nada';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_elena, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c_elena::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  if auth.uid() is distinct from c_elena
     or not public.has_capability(c_space, 'manage_clients')
     or not public.has_capability(c_space, 'manage_requests') then
    raise exception 'No se pudo actuar como Elena con los permisos necesarios';
  end if;
  if public.establishment_daily_menu_subscription(c_est) is null then
    raise exception 'Bar Demo no tiene Menu Diario: ejecutar antes los pasos 2 y 3';
  end if;

  select id into v_template from public.menu_templates
   where establishment_id = c_est and purpose = 'publish' and archived_at is null;
  if v_template is null then
    if exists (select 1 from public.menu_templates where establishment_id = c_est and purpose = 'publish' and origin = 'included') then
      raise exception 'La plantilla incluida de publicar ya se uso y esta archivada (RN-CRE-23)';
    end if;
    v_template := public.create_menu_template(c_est, 'Clásica', 'included', null, 'publish');
    perform public.update_menu_template_design(v_template, 'classic', '#FFFFFF', '#1F2937', '#145C4E',
      'Bar Demo', 'IVA incluido · Pan y bebida incluidos', true);
  end if;

  -- Si ya hay un daily no cancelado (de cualquier fecha) no se crea otro: repetirlo otro día no acumula menús.
  select id into v_menu from public.menus
   where establishment_id = c_est and kind = 'daily' and state <> 'cancelled'
   order by target_date, created_at limit 1;
  if v_menu is null then
    v_menu := public.create_menu(c_est, 'Menú del día', 'daily', date '2026-10-04', v_template);
  end if;
  if not exists (select 1 from public.menu_versions where menu_id = v_menu) then
    perform public.save_menu_version(
      p_menu_id     := v_menu,
      p_starters    := array['Ensalada de la huerta', 'Caldo gallego'],
      p_mains       := array['Merluza a la gallega', 'Carrilleras al vino tinto'],
      p_desserts    := array['Tarta de Santiago', 'Fruta de temporada'],
      p_drink       := 'Vino de la casa o agua',
      p_price_cents := 1450,
      p_note        := 'Pan incluido');
  end if;
end $$;

-- ===== Verificación (solo lectura) =====
select e.web_platform, e.website_url,
       public.establishment_daily_menu_subscription(e.id) is not null as tiene_menu_diario,
       (select count(*) from public.menu_templates t where t.establishment_id = e.id and t.purpose = 'publish' and t.archived_at is null) as plantillas_publish,
       (select count(*) from public.menus m where m.establishment_id = e.id and m.kind = 'daily' and m.state <> 'cancelled') as menus_daily
from public.establishments e
where e.id = 'd4000000-0000-0000-0000-000000000001';
