-- El alta de un restaurante (vista 02 de las maquetas, §20.5, RN-EST-06).
--
-- Hasta aquí, dar de alta un restaurante era un modal con dos campos
-- —nombre del grupo, nombre comercial— y dos `insert` sueltos por
-- PostgREST desde `createEstablishment()`. Eso tenía tres problemas, y los
-- tres son de los que CLAUDE.md nombra por su nombre:
--
-- 1. **No es una transacción.** Se creaba el grupo, y si el
--    establecimiento fallaba después (una capacidad revocada entre las dos
--    llamadas, la red), quedaba un grupo vacío que nadie había pedido.
-- 2. **No deja rastro.** Crear un cliente es el cambio de estado más
--    grande que existe en un espacio y no escribía ni una línea en
--    `audit_log`: no había actor, ni fecha, ni valor nuevo.
-- 3. **Pulsar dos veces creaba dos restaurantes.** Sin clave de
--    idempotencia, un doble clic o un reintento del navegador dejaba
--    "Casa Sol" y "Casa Sol" con dos códigos distintos, dos fichas y dos
--    conversaciones.
--
-- La maqueta 02 además pide en el alta lo que hasta ahora solo se podía
-- rellenar después: los datos fiscales, el contacto principal y la web.
-- Tres de esos campos no existían como columna —el **nombre** del contacto
-- principal, Instagram y Facebook—, así que entran aquí.
--
-- Una advertencia sobre el nombre del contacto principal, porque es
-- exactamente el sitio donde este proyecto se ha equivocado antes: es el
-- contacto **del cliente** (quien firma, a quien se llama cuando hay un
-- impago), no nadie del equipo de mantenimiento. La prohibición de
-- CLAUDE.md es enseñarle al cliente la identidad de quien le mantiene la
-- web; su propio nombre lo escribe él. Aun así la columna queda dentro del
-- `grant select` explícito de `establishments`, como todas las demás, y el
-- barrido de `hito7_mensajes_archivos_finanzas.sql` no se ve afectado:
-- esto es texto libre, no una clave ajena a `profiles`.
--
-- Se comprueba con `supabase/tests/alta_del_restaurante.sql`.

-- ------------------------------------------------------------
-- 1 · Las tres columnas que faltaban
-- ------------------------------------------------------------

alter table public.establishments
  add column if not exists contact_name text,
  add column if not exists instagram text,
  add column if not exists facebook_url text;

comment on column public.establishments.contact_name is
  'Nombre de la persona de contacto DEL CLIENTE (maqueta 02, "Contacto
   principal"). Nunca alguien del equipo de mantenimiento: eso es lo que
   CLAUDE.md prohíbe enseñar, y no se guarda aquí ni en ninguna columna de
   esta tabla.';

comment on column public.establishments.instagram is
  'Perfil de Instagram tal como lo escribe el restaurante: "@casasol" o la
   URL entera. Se normaliza a arroba porque es como se enseña.';

comment on column public.establishments.facebook_url is
  'Dirección de la página de Facebook. Se normaliza como el sitio web: un
   enlace sin esquema lo resuelve el navegador como ruta relativa.';

-- ------------------------------------------------------------
-- 2 · La clave de idempotencia
-- ------------------------------------------------------------
--
-- Mismo molde que `messages.idempotency_key` (migración 25): columna
-- nullable, índice único parcial. Nullable porque las filas que ya existen
-- no la tienen y porque una llamada sin clave sigue siendo válida —lo que
-- no puede es repetirse sin consecuencias, y quien no manda clave está
-- diciendo que se hace responsable de eso.
alter table public.establishments
  add column if not exists idempotency_key text;

create unique index if not exists establishments_idempotency_key_idx
  on public.establishments (space_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.establishments.idempotency_key is
  'CLAUDE.md MUST · "pulsar dos veces nunca duplica el efecto". El alta la
   genera en el navegador al abrir el formulario, así que sobrevive al
   reintento del propio navegador, no solo al doble clic.';

-- ------------------------------------------------------------
-- 3 · `set_establishment_data()` con los tres campos nuevos
-- ------------------------------------------------------------
--
-- Se REEMPLAZA la firma, no se añade una segunda. Un `create or replace`
-- con tres parámetros más y valor por omisión crearía una sobrecarga, y
-- entonces `set_establishment_data(uuid, text, text, ...)` sería ambigua:
-- PostgREST elegiría una de las dos según los argumentos que le llegaran y
-- la pantalla guardaría trece campos unas veces y dieciséis otras, sin
-- fallar nunca. Se borra la vieja primero.
drop function if exists public.set_establishment_data(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
);

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
    v_instagram := regexp_replace(v_instagram, '^https?://(www\.)?instagram\.com/', '', 'i');
    v_instagram := regexp_replace(v_instagram, '/.*$', '');
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
  'PRD §15.2 · la única puerta para editar la ficha de un restaurante.
   Comprueba RN-EST-11 por los dos lados —equipo con manage_clients,
   cliente con client_can_edit_establishment_data()— y audita solo los
   campos que cambian. RN-EST-12: no toca el contenido público de ninguna
   web; eso requiere una solicitud.';

revoke all on function public.set_establishment_data(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.set_establishment_data(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 4 · El disparador cubre también las tres columnas nuevas
-- ------------------------------------------------------------
--
-- Si no se reescribiera, `contact_name`, `instagram` y `facebook_url`
-- serían tres columnas de la ficha reescribibles por UPDATE directo sin
-- actor y sin valor anterior — exactamente el agujero que la migración 57
-- cerró para las otras trece. Se añaden a la condición.
create or replace function public.guard_establishment_data_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('cuotly.data_change', true), '') <> 'on'
     and (
       new.name is distinct from old.name
       or new.legal_name is distinct from old.legal_name
       or new.tax_id is distinct from old.tax_id
       or new.address is distinct from old.address
       or new.postal_code is distinct from old.postal_code
       or new.city is distinct from old.city
       or new.contact_name is distinct from old.contact_name
       or new.contact_email is distinct from old.contact_email
       or new.phone_primary is distinct from old.phone_primary
       or new.phone_secondary is distinct from old.phone_secondary
       or new.website_url is distinct from old.website_url
       or new.instagram is distinct from old.instagram
       or new.facebook_url is distinct from old.facebook_url
       or new.domain is distinct from old.domain
       or new.opening_hours is distinct from old.opening_hours
       or new.web_platform is distinct from old.web_platform
     )
  then
    raise exception 'Los datos de un restaurante se cambian con set_establishment_data(), que comprueba el permiso y los audita';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_establishment_data_change() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5 · El alta: una transacción, un apunte, una clave
-- ------------------------------------------------------------
--
-- Reutiliza `set_establishment_data()` en vez de repetir las trescientas
-- líneas de normalización y validación de arriba. Eso tiene una
-- consecuencia visible en el libro y es la correcta: un alta con datos
-- deja DOS apuntes, `establishment.created` con lo que define al
-- restaurante y `establishment.data_changed` con la ficha que se rellenó.
-- Son dos hechos distintos y el segundo puede repetirse; juntarlos en uno
-- haría que el alta y una edición se leyeran igual.
--
-- El grupo: por id si la pantalla lo eligió de la lista (maqueta 02,
-- "Grupo de cliente" es un desplegable), por nombre si se escribió uno que
-- no existía. Nunca las dos cosas.
--
-- El estado NO es un parámetro. Un restaurante nace 'configuring'
-- (migración 3, valor por omisión de la columna) y se mueve con
-- `set_establishment_status()`, que tiene sus propias reglas y su propio
-- apunte. La maqueta lo enseña porque hay que saberlo, no porque se
-- elija: el formulario lo pinta bloqueado con su motivo debajo.
create or replace function public.create_establishment_with_data(
  p_space_id uuid,
  p_name text,
  p_group_id uuid default null,
  p_group_name text default null,
  p_plan_id uuid default null,
  p_legal_name text default null,
  p_tax_id text default null,
  p_address text default null,
  p_postal_code text default null,
  p_city text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_phone_primary text default null,
  p_website_url text default null,
  p_instagram text default null,
  p_facebook_url text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_group_name text;
  v_group_id uuid;
  v_group_space_id uuid;
  v_key text;
  v_establishment_id uuid;
begin
  if not public.has_capability(p_space_id, 'create_establishment') then
    raise exception 'No tienes permiso para dar de alta un restaurante en este espacio';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'El nombre comercial no puede quedar vacío';
  end if;

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');

  -- Idempotencia antes de tocar nada: el segundo clic devuelve el mismo
  -- restaurante y no crea ni un grupo.
  if v_key is not null then
    select id into v_establishment_id
    from public.establishments
    where space_id = p_space_id and idempotency_key = v_key;
    if v_establishment_id is not null then
      return v_establishment_id;
    end if;
  end if;

  -- El grupo.
  if p_group_id is not null then
    select space_id into v_group_space_id from public.groups where id = p_group_id;
    if v_group_space_id is null then
      raise exception 'Grupo de cliente no encontrado';
    end if;
    if v_group_space_id <> p_space_id then
      raise exception 'El grupo de cliente no pertenece a este espacio';
    end if;
    v_group_id := p_group_id;
  else
    v_group_name := nullif(btrim(coalesce(p_group_name, '')), '');
    if v_group_name is null then
      raise exception 'Hay que elegir un grupo de cliente o escribir el nombre de uno nuevo';
    end if;

    -- `ilike` y no `=`: "Grupo La Encina" y "grupo la encina" son el mismo
    -- cliente, y crear el segundo parte su facturación en dos.
    select id into v_group_id
    from public.groups
    where space_id = p_space_id and name ilike v_group_name
    limit 1;

    if v_group_id is null then
      insert into public.groups (space_id, name)
      values (p_space_id, v_group_name)
      returning id into v_group_id;

      insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
      values (p_space_id, auth.uid(), 'group.created', 'group', v_group_id,
              jsonb_build_object('name', v_group_name));
    end if;
  end if;

  insert into public.establishments (space_id, group_id, name, idempotency_key)
  values (p_space_id, v_group_id, v_name, v_key)
  returning id into v_establishment_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    p_space_id, auth.uid(), 'establishment.created', 'establishment', v_establishment_id,
    jsonb_build_object('name', v_name, 'group_id', v_group_id)
  );

  -- La ficha, por la puerta de siempre: normaliza, valida el correo y deja
  -- su propio apunte. Si todos los campos llegan vacíos devuelve `false` y
  -- no escribe nada, que es justo lo que tiene que pasar en un alta sin
  -- datos fiscales todavía.
  perform public.set_establishment_data(
    p_establishment_id := v_establishment_id,
    p_name := v_name,
    p_legal_name := p_legal_name,
    p_tax_id := p_tax_id,
    p_address := p_address,
    p_postal_code := p_postal_code,
    p_city := p_city,
    p_contact_name := p_contact_name,
    p_contact_email := p_contact_email,
    p_phone_primary := p_phone_primary,
    p_website_url := p_website_url,
    p_instagram := p_instagram,
    p_facebook_url := p_facebook_url
  );

  -- El plan, si se eligió. `create_plan_subscription()` comprueba que el
  -- plan sea del mismo espacio y deja su apunte; RN-COM-13 la hace cumplir
  -- el índice único de la tabla, no esta función.
  if p_plan_id is not null then
    perform public.create_plan_subscription(v_establishment_id, p_plan_id);
  end if;

  return v_establishment_id;
end;
$$;

comment on function public.create_establishment_with_data(uuid, text, uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text) is
  'RN-EST-06 · el alta de un restaurante (maqueta 02, §20.5) en UNA
   transacción, con apunte de auditoría y clave de idempotencia. Sustituye
   a los dos `insert` sueltos por PostgREST que hacía `createEstablishment()`:
   aquellos podían dejar un grupo huérfano, no dejaban rastro y duplicaban
   el restaurante con un doble clic. Comprueba `create_establishment` por
   su cuenta.';

revoke all on function public.create_establishment_with_data(uuid, text, uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_establishment_with_data(uuid, text, uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 6 · Los privilegios de columna de las tres nuevas
-- ------------------------------------------------------------
--
-- `establishments` no está en la lista de tablas con `select` revocado de
-- CLAUDE.md —no tiene ninguna columna con la identidad del equipo—, así
-- que las tres columnas nuevas se leen con el `select` de tabla que ya
-- había. Lo que sí hay que rehacer es el `grant update` de la migración 38,
-- que enumera columnas: sin tocarlo, `idempotency_key` quedaría fuera y
-- eso está bien (nadie la escribe por PostgREST), pero conviene decirlo
-- aquí en vez de que alguien lo descubra dentro de seis migraciones.
--
-- El `grant update (code, name, group_id)` de la 38 sigue como está: con
-- la política de UPDATE retirada por la 57, no habilita nada.

-- ------------------------------------------------------------
-- 7 · Se retira el camino viejo
-- ------------------------------------------------------------
--
-- Con `create_establishment_with_data()` en pie, la política de INSERT
-- directo sobre `establishments` deja de tener usuario legítimo y pasa a
-- ser lo mismo que era la de UPDATE antes de la 57: la manera de crear un
-- restaurante sin apunte, sin transacción y sin idempotencia, con la clave
-- pública y un `curl`. Se retira.
--
-- `groups` conserva la suya: `create_establishment_with_data()` es
-- `security definer`, así que no la necesita, pero la pantalla de grupos
-- del Hito 8 sí escribe grupos por PostgREST y retirarla la rompería sin
-- avisar. Cuando esa pantalla pase por una función, se retira también.
drop policy if exists establishments_insert on public.establishments;

-- ------------------------------------------------------------
-- 8 · La familia `group` en la auditoría (§21.2)
-- ------------------------------------------------------------
--
-- El alta crea el grupo cuando no existía y eso deja `group.created`, una
-- familia que hasta ahora no escribía nadie. Sin este `when`,
-- `audit_action_capability()` la clasificaría como "lo decide la fila", y
-- `audit_entity_is_visible()` devuelve `false` para un tipo de entidad que
-- no conoce: el apunte existiría y no lo vería ni el propietario, salvo
-- por ser quien lo ejecutó. Se reparte como el establecimiento, que es la
-- misma cartera de clientes.
--
-- Sigue apareciendo dentro de la expresión de una política de RLS, así que
-- NO puede perder el EXECUTE de `authenticated` (CLAUDE.md, excepción
-- documentada en la migración 32).
create or replace function public.audit_action_capability(p_action text)
returns text
language sql
immutable
as $$
  select case split_part(coalesce(p_action, ''), '.', 1)
    -- Configuración del espacio y composición del equipo: del propietario.
    when 'space' then 'manage_space'
    when 'membership' then 'manage_space'
    when 'supervision' then 'manage_space'
    when 'invitation' then 'invite_member'
    -- Dinero (RN-FIN, RN-ARC-05): propietario y administradores.
    when 'charge' then 'manage_finance'
    when 'payment' then 'manage_finance'
    when 'subscription' then 'manage_finance'
    when 'financial' then 'manage_finance'
    -- Cartera de clientes: propietario y administradores.
    when 'establishment' then 'manage_clients'
    when 'establishment_access' then 'manage_clients'
    when 'group' then 'manage_clients'
    when 'group_access' then 'manage_clients'
    -- Festivos y cierres del espacio (§125, HU-32).
    when 'holiday' then 'manage_holidays'
    else null
  end;
$$;

revoke all on function public.audit_action_capability(text) from public, anon;
grant execute on function public.audit_action_capability(text) to authenticated;
