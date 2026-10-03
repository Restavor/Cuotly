-- Bar Demo, restaurante de pruebas del Agente Menú Diario.
--
-- SOLO "Restavor pruebas" (bnucqykimngjwcrlpmsm). NUNCA en producción ("Cuotly", mcajbfxhkxtdhjoyrqha).
-- Se ejecuta A MANO. Un resembrado del espacio demo (push a la rama `agents` que toque supabase/seed/,
-- o el proceso "Pruebas · Supabase" con `sembrar`) borra y reconstruye Bar Demo: hay que repetirlo.
-- Es idempotente: la segunda ejecución no escribe nada (set_establishment_data devuelve false).
--
-- Permiso de Bosco (03/10/2026): web_platform, website_url, plantilla de publicar y un menú diario.
-- ESTE ARCHIVO HACE SOLO LO PRIMERO (parte 1). La plantilla y el menú (parte 2) exigen que Bar Demo
-- tenga Menú Diario (create_menu_template y create_menu lo comprueban) y hoy no lo tiene: contratarlo
-- emite un cobro y una permanencia de 3 meses, que NO están en el permiso. Pendiente de decisión de Bosco.
--
-- Cómo se actúa: set_establishment_data es la única puerta (un UPDATE directo lo rechaza el disparador
-- establishments_guard_data) y comprueba permisos con auth.uid(). Se simula al usuario con set_config
-- local a la transacción (un único bloque DO), como hace el sembrado. El actor es owner@cuotly.test
-- (Elena Ruiz, administradora del espacio demo, con manage_clients), no la cuenta real de Bosco.

-- ===== Parte 1: plataforma web y dirección de la web de pruebas =====
do $$
declare
  c_establishment constant uuid := 'd4000000-0000-0000-0000-000000000001'; -- Bar Demo
  c_space         constant uuid := 'd1000000-0000-0000-0000-000000000001'; -- espacio demo
  c_actor         constant uuid := 'd0000000-0000-0000-0000-000000000001'; -- owner@cuotly.test
  e         public.establishments;
  v_changed boolean;
begin
  select * into e
  from public.establishments
  where id = c_establishment and space_id = c_space;

  if e.id is null then
    raise exception 'Bar Demo (%) no existe en el espacio demo: no se toca nada', c_establishment;
  end if;

  perform set_config('request.jwt.claim.sub',  c_actor::text,   true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- La función reemplaza la ficha ENTERA: un parámetro omitido llega como NULL y vaciaría el dato.
  -- Por eso se pasan los valores actuales de todos los demás campos.
  v_changed := public.set_establishment_data(
    p_establishment_id := c_establishment,
    p_name             := e.name,
    p_legal_name       := e.legal_name,
    p_tax_id           := e.tax_id,
    p_address          := e.address,
    p_postal_code      := e.postal_code,
    p_city             := e.city,
    p_contact_name     := e.contact_name,
    p_contact_email    := e.contact_email,
    p_phone_primary    := e.phone_primary,
    p_phone_secondary  := e.phone_secondary,
    p_website_url      := 'https://www.restavor.com/pruebas-agente-menu',
    p_instagram        := e.instagram,
    p_facebook_url     := e.facebook_url,
    p_domain           := e.domain,
    p_opening_hours    := e.opening_hours,
    p_web_platform     := 'landing_site'
  );

  raise notice 'set_establishment_data devolvio % (true = cambio aplicado; false = ya estaba asi)', v_changed;
end
$$;

-- Verificación (solo lectura). Esperado: web_platform = landing_site y
-- website_url = https://www.restavor.com/pruebas-agente-menu
select id, code, name, status, web_platform, website_url, domain
from public.establishments
where id = 'd4000000-0000-0000-0000-000000000001';

-- Esperado: 1 fila tras la primera ejecución, y sigue siendo 1 tras la segunda.
select created_at, actor_id, action, old_value, new_value
from public.audit_log
where entity_id = 'd4000000-0000-0000-0000-000000000001'
  and action = 'establishment.data_changed'
order by created_at desc;
