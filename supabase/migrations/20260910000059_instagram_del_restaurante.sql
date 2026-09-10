-- El usuario de Instagram, no su host.
--
-- La migracion 58 normalizaba el campo de Instagram con dos pasos que se
-- pisaban: quitaba el prefijo "https://instagram.com/" y DESPUES cortaba
-- por la primera barra, siempre. Con una direccion entera funcionaba; sin
-- esquema, no, porque el primer paso no reconocia "instagram.com/..." y el
-- segundo se comia el usuario:
--
--   instagram.com/magarinos          ->  @instagram.com     (mal)
--   www.instagram.com/magarinos      ->  @www.instagram.com (mal)
--   instagram.com/magarinos?hl=es    ->  @magarinos?hl=es   (mal)
--
-- Escribir el perfil sin "https://" es lo normal —el propio campo del
-- formulario dice "@usuario o la direccion"—, asi que no era un caso raro:
-- era el caso. Y el dato queda guardado mal en silencio, sin fallar nada,
-- que es la peor forma de equivocarse.
--
-- Encontrado comprobando la 58 en vivo, contra el proyecto, antes de
-- subirla; los tres casos estan en supabase/tests/alta_del_restaurante.sql.
--
-- Se reescribe `set_establishment_data()` entera porque plpgsql no permite
-- parchear un cuerpo: `create or replace` sustituye la funcion o nada. Lo
-- unico que cambia respecto de la 58 es el bloque de Instagram, marcado
-- con su comentario; el resto es identico y no se ha vuelto a escribir a
-- mano.

create or replace function public.set_establishment_data(
  p_establishment_id uuid,
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null,
  p_address text default null,
  p_postal_code text default null,
  p_city text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_phone_primary text default null,
  p_phone_secondary text default null,
  p_website_url text default null,
  p_instagram text default null,
  p_facebook_url text default null,
  p_domain text default null,
  p_opening_hours text default null,
  p_web_platform text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_old public.establishments;
  v_name text;
  v_legal_name text;
  v_tax_id text;
  v_address text;
  v_postal_code text;
  v_city text;
  v_contact_name text;
  v_contact_email text;
  v_phone_primary text;
  v_phone_secondary text;
  v_website_url text;
  v_instagram text;
  v_facebook_url text;
  v_domain text;
  v_opening_hours text;
  v_web_platform text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
begin
  select * into v_old
  from public.establishments
  where id = p_establishment_id
  for update;

  if v_old.id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  v_space_id := v_old.space_id;

  if not (
    public.has_capability(v_space_id, 'manage_clients')
    or public.client_can_edit_establishment_data(p_establishment_id)
  ) then
    raise exception 'No tienes permiso para editar los datos de este restaurante';
  end if;

  v_name            := nullif(btrim(coalesce(p_name, '')), '');
  v_legal_name      := nullif(btrim(coalesce(p_legal_name, '')), '');
  v_tax_id          := nullif(upper(replace(btrim(coalesce(p_tax_id, '')), ' ', '')), '');
  v_address         := nullif(btrim(coalesce(p_address, '')), '');
  v_postal_code     := nullif(btrim(coalesce(p_postal_code, '')), '');
  v_city            := nullif(btrim(coalesce(p_city, '')), '');
  v_contact_name    := nullif(btrim(coalesce(p_contact_name, '')), '');
  v_contact_email   := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
  v_phone_primary   := nullif(btrim(coalesce(p_phone_primary, '')), '');
  v_phone_secondary := nullif(btrim(coalesce(p_phone_secondary, '')), '');
  v_website_url     := nullif(btrim(coalesce(p_website_url, '')), '');
  v_instagram       := nullif(btrim(coalesce(p_instagram, '')), '');
  v_facebook_url    := nullif(btrim(coalesce(p_facebook_url, '')), '');
  v_domain          := nullif(lower(btrim(coalesce(p_domain, ''))), '');
  v_opening_hours   := nullif(btrim(coalesce(p_opening_hours, '')), '');
  v_web_platform    := nullif(btrim(coalesce(p_web_platform, '')), '');

  if v_name is null then
    raise exception 'El nombre comercial no puede quedar vacío';
  end if;

  if v_contact_email is not null and v_contact_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'El correo de contacto no tiene forma de correo: %', v_contact_email;
  end if;

  if v_website_url is not null and v_website_url !~* '^https?://' then
    v_website_url := 'https://' || v_website_url;
  end if;

  if v_facebook_url is not null and v_facebook_url !~* '^https?://' then
    v_facebook_url := 'https://' || v_facebook_url;
  end if;

  -- Instagram al revés que los dos anteriores: se guarda como arroba,
  -- porque "@casasol" es como se escribe y como se enseña (maqueta 02), y
  -- quien pega la URL entera está diciendo lo mismo.
  if v_instagram is not null then
    -- Solo se recorta lo que ES una direccion de Instagram. La version de
    -- la migracion 58 quitaba el trozo posterior a la primera barra
    -- SIEMPRE, asi que "instagram.com/magarinos" (sin esquema) se guardaba
    -- como "@instagram.com": el host en vez del usuario.
    if v_instagram ~* '^(https?://)?(www\.)?instagram\.com/' then
      v_instagram := regexp_replace(v_instagram, '^(https?://)?(www\.)?instagram\.com/', '', 'i');
      -- Y hasta el primer separador, no solo hasta la barra: un enlace
      -- copiado del navegador trae "?hl=es" pegado al usuario.
      v_instagram := regexp_replace(v_instagram, '[/?#].*$', '');
    end if;
    v_instagram := regexp_replace(v_instagram, '^@+', '');
    v_instagram := nullif(v_instagram, '');
    if v_instagram is not null then
      v_instagram := '@' || v_instagram;
    end if;
  end if;

  if v_domain is not null then
    v_domain := regexp_replace(v_domain, '^https?://', '');
    v_domain := regexp_replace(v_domain, '/.*$', '');
  end if;

  if v_web_platform is not null and v_web_platform not in ('landing_site', 'other') then
    raise exception 'Plataforma web desconocida: %', v_web_platform;
  end if;

  if v_name is distinct from v_old.name then
    v_before := v_before || jsonb_build_object('name', v_old.name);
    v_after := v_after || jsonb_build_object('name', v_name);
  end if;
  if v_legal_name is distinct from v_old.legal_name then
    v_before := v_before || jsonb_build_object('legal_name', v_old.legal_name);
    v_after := v_after || jsonb_build_object('legal_name', v_legal_name);
  end if;
  if v_tax_id is distinct from v_old.tax_id then
    v_before := v_before || jsonb_build_object('tax_id', v_old.tax_id);
    v_after := v_after || jsonb_build_object('tax_id', v_tax_id);
  end if;
  if v_address is distinct from v_old.address then
    v_before := v_before || jsonb_build_object('address', v_old.address);
    v_after := v_after || jsonb_build_object('address', v_address);
  end if;
  if v_postal_code is distinct from v_old.postal_code then
    v_before := v_before || jsonb_build_object('postal_code', v_old.postal_code);
    v_after := v_after || jsonb_build_object('postal_code', v_postal_code);
  end if;
  if v_city is distinct from v_old.city then
    v_before := v_before || jsonb_build_object('city', v_old.city);
    v_after := v_after || jsonb_build_object('city', v_city);
  end if;
  if v_contact_name is distinct from v_old.contact_name then
    v_before := v_before || jsonb_build_object('contact_name', v_old.contact_name);
    v_after := v_after || jsonb_build_object('contact_name', v_contact_name);
  end if;
  if v_contact_email is distinct from v_old.contact_email then
    v_before := v_before || jsonb_build_object('contact_email', v_old.contact_email);
    v_after := v_after || jsonb_build_object('contact_email', v_contact_email);
  end if;
  if v_phone_primary is distinct from v_old.phone_primary then
    v_before := v_before || jsonb_build_object('phone_primary', v_old.phone_primary);
    v_after := v_after || jsonb_build_object('phone_primary', v_phone_primary);
  end if;
  if v_phone_secondary is distinct from v_old.phone_secondary then
    v_before := v_before || jsonb_build_object('phone_secondary', v_old.phone_secondary);
    v_after := v_after || jsonb_build_object('phone_secondary', v_phone_secondary);
  end if;
  if v_website_url is distinct from v_old.website_url then
    v_before := v_before || jsonb_build_object('website_url', v_old.website_url);
    v_after := v_after || jsonb_build_object('website_url', v_website_url);
  end if;
  if v_instagram is distinct from v_old.instagram then
    v_before := v_before || jsonb_build_object('instagram', v_old.instagram);
    v_after := v_after || jsonb_build_object('instagram', v_instagram);
  end if;
  if v_facebook_url is distinct from v_old.facebook_url then
    v_before := v_before || jsonb_build_object('facebook_url', v_old.facebook_url);
    v_after := v_after || jsonb_build_object('facebook_url', v_facebook_url);
  end if;
  if v_domain is distinct from v_old.domain then
    v_before := v_before || jsonb_build_object('domain', v_old.domain);
    v_after := v_after || jsonb_build_object('domain', v_domain);
  end if;
  if v_opening_hours is distinct from v_old.opening_hours then
    v_before := v_before || jsonb_build_object('opening_hours', v_old.opening_hours);
    v_after := v_after || jsonb_build_object('opening_hours', v_opening_hours);
  end if;
  if v_web_platform is distinct from v_old.web_platform then
    v_before := v_before || jsonb_build_object('web_platform', v_old.web_platform);
    v_after := v_after || jsonb_build_object('web_platform', v_web_platform);
  end if;

  if v_after = '{}'::jsonb then
    return false;
  end if;

  perform set_config('cuotly.data_change', 'on', true);
  update public.establishments set
    name = v_name,
    legal_name = v_legal_name,
    tax_id = v_tax_id,
    address = v_address,
    postal_code = v_postal_code,
    city = v_city,
    contact_name = v_contact_name,
    contact_email = v_contact_email,
    phone_primary = v_phone_primary,
    phone_secondary = v_phone_secondary,
    website_url = v_website_url,
    instagram = v_instagram,
    facebook_url = v_facebook_url,
    domain = v_domain,
    opening_hours = v_opening_hours,
    web_platform = v_web_platform
  where id = p_establishment_id;
  perform set_config('cuotly.data_change', 'off', true);

  insert into public.audit_log (
    space_id, actor_id, action, entity_type, entity_id, old_value, new_value
  )
  values (
    v_space_id, auth.uid(), 'establishment.data_changed', 'establishment',
    p_establishment_id, v_before, v_after
  );

  return true;
end;
$$;

comment on function public.set_establishment_data(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) is
  'PRD 15.2 - la unica puerta para editar la ficha de un restaurante.
   Comprueba RN-EST-11 por los dos lados -equipo con manage_clients,
   cliente con client_can_edit_establishment_data()- y audita solo los
   campos que cambian. RN-EST-12: no toca el contenido publico de ninguna
   web.';

revoke all on function public.set_establishment_data(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.set_establishment_data(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
