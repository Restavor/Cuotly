-- ============================================================
-- Datos del establecimiento (PRD §15.2, RN-EST-11, RN-EST-12).
--
-- La ficha del restaurante lleva desde la migración 55 sus cinco pestañas,
-- y una de ellas —Operación— enseña un bloque que dice literalmente "los
-- datos fiscales y de contacto todavía no se guardan". No era una excusa:
-- `establishments` tiene siete columnas (`id`, `space_id`, `group_id`,
-- `code`, `name`, `status`, `created_at`) y §15.2 pide **quince datos
-- mínimos**. Razón social, identificación fiscal, dirección, teléfonos,
-- correos, sitio web, dominio y horarios no existían en ninguna parte de
-- la base de datos.
--
-- Aquí se guardan. Y con ellos, las dos reglas que los acompañan:
--
-- · **RN-EST-11** · "el propietario puede editar contacto y datos
--   fiscales; los Editores solo con el permiso `edit_establishment_data`".
--   Ese permiso existe en `establishment_permissions` desde la migración 3
--   y hasta hoy **no lo leía nadie**: la pestaña Usuarios lo enseñaba
--   ("Editar datos") y no había ningún dato que editar ni ninguna función
--   que lo comprobara. Era un permiso decorativo.
--
-- · **RN-EST-12** · "cambiar datos en la ficha de Cuotly NO cambia el
--   contenido público de la web; eso requiere una solicitud". Esta
--   migración no publica nada en ninguna web —no hay integración que lo
--   permita, §65— y por eso mismo la pantalla lo dice en alto: quien
--   corrige aquí el teléfono no ha corregido el teléfono de su web.
--
-- Quién puede escribir, y por qué NO basta con la política que ya había.
-- `establishments_update` (migración 8) exige `create_establishment`, que
-- es una capacidad del EQUIPO del espacio: por esa puerta el cliente
-- —propietario local, propietario global del grupo, editor con permiso—
-- no pasa nunca. RN-EST-11 habla justamente de él. Así que la puerta se
-- abre donde se puede comprobar la regla entera: una función.
--
-- Y la puerta lateral se cierra. Mientras `establishments` tenga una
-- política de UPDATE, un administrador puede reescribir el CIF de un
-- cliente por PostgREST sin dejar rastro —el mismo agujero que el
-- bloqueante B2 de la migración 37 encontró con `status`, y que allí se
-- tapó con un disparador porque "el disparador es la barrera, no el
-- privilegio"—. Se hacen las dos cosas: se retira la política (nadie
-- escribe `establishments` por PostgREST) y se añade el disparador (nadie
-- la escribe tampoco si alguien vuelve a crear una política mañana).
--
-- Lo que NO entra aquí, dicho en claro para que nadie lo dé por hecho:
--
-- · **Las notas internas (RN-EST-13).** "Los clientes nunca" las ven, y
--   una columna de `establishments` la vería: RLS filtra filas y la fila
--   del restaurante es suya. Taparla exige privilegios de columna sobre
--   `establishments` —la tabla que consultan diecisiete pantallas—, y
--   además RN-EST-13 reparte las notas en tres niveles (propietario y
--   administradores todas, el trabajador solo las operativas de sus
--   establecimientos). Eso es una tabla con su RLS, no una columna. Queda
--   pendiente y anotado.
-- · **La validación del CIF.** Todo el bloque fiscal está aplazado
--   deliberadamente (CLAUDE.md), y el dígito de control de un CIF español
--   es parte de él. Aquí se guarda el texto en mayúsculas y sin espacios,
--   y no se afirma que sea válido.
-- · **Proyecto, estado y última publicación de LandingSite** (§121). La
--   plataforma web se registra —es uno de los quince datos de §15.2— pero
--   su proyecto y su estado de publicación son de la Fase 2, cuando Menú
--   Diario publique. No se inventan tres columnas para dejarlas vacías.
--
-- Se comprueba con `supabase/tests/datos_del_establecimiento.sql`.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Los datos de §15.2
-- ------------------------------------------------------------
--
-- Todos nulos: un restaurante se da de alta con su nombre y su código
-- (RN-EST-06) y la ficha se rellena después. Un `not null` con cadena
-- vacía por defecto sería peor que un nulo — "sin rellenar" y "vacío a
-- propósito" son lo mismo aquí, y la pantalla necesita distinguir "no hay
-- dato" para decir el motivo en vez de enseñar un hueco (CA-20).

alter table public.establishments
  add column if not exists legal_name text,
  add column if not exists tax_id text,
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists contact_email text,
  add column if not exists phone_primary text,
  add column if not exists phone_secondary text,
  add column if not exists website_url text,
  add column if not exists domain text,
  add column if not exists opening_hours text,
  add column if not exists web_platform text;

-- La plataforma web es una lista cerrada y corta. §121 registra
-- LandingSite como plataforma web; `other` es cualquier otra (WordPress,
-- un desarrollo propio) sin pretender saber cuál — saberlo no cambia nada
-- en la Fase 1 y una lista de plataformas inventada envejecería mal.
alter table public.establishments
  drop constraint if exists establishments_web_platform_check;
alter table public.establishments
  add constraint establishments_web_platform_check
  check (web_platform is null or web_platform in ('landing_site', 'other'));

comment on column public.establishments.name is
  'Nombre comercial (§15.2). Es el que se enseña en toda la aplicación; la
   razón social va aparte en legal_name.';
comment on column public.establishments.legal_name is 'Razón social (§15.2).';
comment on column public.establishments.tax_id is
  'Identificación fiscal (§15.2). Se guarda en mayúsculas y sin espacios,
   SIN validar el dígito de control: el bloque fiscal está aplazado
   (CLAUDE.md) y Cuotly es multiempresa, así que tampoco se da por hecho
   que sea un CIF español.';
comment on column public.establishments.address is 'Dirección (§15.2).';
comment on column public.establishments.contact_email is
  'Correo de contacto del restaurante (§15.2). No es la cuenta de nadie:
   las cuentas están en profiles y el acceso, en
   establishment_memberships.';
comment on column public.establishments.website_url is
  'Sitio web (§15.2). Se normaliza con esquema https:// cuando se guarda
   sin él, para que el enlace de la ficha funcione al pulsarlo.';
comment on column public.establishments.domain is
  'Dominio (§15.2), en minúsculas y sin esquema ni barra final. Quién lo
   paga y quién lo renueva es del contrato, no de Cuotly (§122).';
comment on column public.establishments.opening_hours is
  'Horarios del establecimiento (§15.2) como texto libre y multilínea. NO
   es el calendario laboral del espacio (space_working_hours, RN-CLK-10):
   ese mueve los plazos contractuales y este es un dato de la ficha que no
   calcula nada.';
comment on column public.establishments.web_platform is
  'Plataforma web utilizada (§15.2, §121). El proyecto, el estado y la
   última publicación de LandingSite llegan con la Fase 2.';

-- ------------------------------------------------------------
-- 2 · RN-EST-11 del lado del cliente
-- ------------------------------------------------------------
--
-- Mismo molde que `client_can_view_billing()` (migración 39), porque el
-- reparto es el mismo de RN-FIN-07 con otro permiso:
--
-- · propietario global del grupo → sí, por serlo (RN-EST-03);
-- · editor DE GRUPO → no. RN-EST-04 le da acceso a los establecimientos
--   actuales y futuros, no permisos finos: `establishment_permissions`
--   cuelga de una membresía de establecimiento y un editor de grupo no
--   tiene ninguna, así que no hay dónde concederle este permiso. Sin fila
--   no hay permiso, que es lo que dice RN-EST-11 ("los Editores solo
--   con el permiso");
-- · propietario local → sí;
-- · editor con `edit_establishment_data` → sí;
-- · Consulta → no. Lee y no escribe, aquí igual que en RN-MSG-05.
create or replace function public.client_can_edit_establishment_data(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = auth.uid()
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    )
    or exists (
      select 1 from public.establishment_memberships em
      left join public.establishment_permissions ep
        on ep.establishment_membership_id = em.id
      where em.establishment_id = p_establishment_id
        and em.user_id = auth.uid()
        and em.revoked_at is null
        and (
          em.role = 'local_owner'
          or (em.role = 'editor' and coalesce(ep.edit_establishment_data, false))
        )
    );
$$;

comment on function public.client_can_edit_establishment_data(uuid) is
  'RN-EST-11 · quién del lado CLIENTE puede editar contacto y datos
   fiscales de un restaurante: el propietario global del grupo, el
   propietario local y el editor con el permiso edit_establishment_data.
   Consulta no, y el editor de grupo tampoco (no tiene dónde llevar el
   permiso). Un acceso revocado deja de contar (RN-EST-05).';

-- No aparece en ninguna política de RLS, así que se cierra a `anon`
-- (CLAUDE.md). `authenticated` sí: la pantalla necesita saber si enseñar
-- el formulario o solo la lectura — y si se equivoca, el "no" lo da la
-- función de abajo, que es la que decide.
revoke all on function public.client_can_edit_establishment_data(uuid) from public, anon;
grant execute on function public.client_can_edit_establishment_data(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3 · La barrera: `establishments` no se escribe por PostgREST
-- ------------------------------------------------------------
--
-- La política se retira entera. A partir de aquí `establishments` no tiene
-- ninguna política de UPDATE, que en RLS significa "nadie": el estado se
-- cambia con `set_establishment_status()` (migración 37) y la ficha con
-- `set_establishment_data()`, y las dos auditan. Ninguna pantalla hacía un
-- UPDATE directo sobre esta tabla, así que no se rompe nada; lo que se
-- cierra es lo que HABRÍA podido hacer un administrador con la clave
-- pública y un `curl`.
drop policy if exists establishments_update on public.establishments;

-- Y el disparador, por si mañana alguien vuelve a crear una política. Es
-- el mismo patrón que `guard_establishment_status_change()`: la barrera
-- está en la tabla, no en el privilegio, así que cubre también los caminos
-- que todavía no existen.
--
-- Solo salta si alguna de las columnas de la ficha CAMBIA de verdad
-- (`is distinct from`): `set_establishment_status()` escribe únicamente
-- `status` y tiene que seguir pasando sin pedirle permiso a nadie.
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
       or new.contact_email is distinct from old.contact_email
       or new.phone_primary is distinct from old.phone_primary
       or new.phone_secondary is distinct from old.phone_secondary
       or new.website_url is distinct from old.website_url
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

comment on function public.guard_establishment_data_change() is
  'CLAUDE.md MUST: todo cambio relevante deja actor, valor anterior y valor
   nuevo. Sin esto, la ficha de §15.2 quedaba editable por UPDATE directo
   —el mismo agujero que el bloqueante B2 de la migración 37 tapó para
   `status`— y reescribir el CIF de un cliente no dejaba rastro.';

-- La ejecuta la base al escribir la tabla, nunca nadie por RPC: PostgreSQL
-- comprueba el `EXECUTE` de una función de disparador al CREAR el
-- disparador, no al dispararlo. Así que se cierra a todo el mundo
-- (CLAUDE.md: "revoke all ... from public, anon, authenticated"), que es
-- un paso más de lo que hizo la migración 37 con el disparador de `status`
-- —aquella se quedó en justificarse en la lista de excepciones del barrido
-- de `hito7_mensajes_archivos_finanzas.sql`—.
revoke all on function public.guard_establishment_data_change() from public, anon, authenticated;

create trigger establishments_guard_data
  before update on public.establishments
  for each row execute function public.guard_establishment_data_change();

-- ------------------------------------------------------------
-- 4 · La puerta legítima
-- ------------------------------------------------------------
--
-- Recibe la ficha COMPLETA, tal como la envía el formulario de la
-- pantalla: un campo que llega vacío vacía el dato. No es un `patch` con
-- nulos que significan "no lo toques" —eso haría imposible borrar un
-- teléfono secundario que se apuntó mal— y la pantalla siempre manda todo
-- porque siempre lo enseña todo.
--
-- Escribe una sola vez y audita **solo lo que cambió**: un apunte que
-- repitiera los trece campos en cada guardado haría ilegible el libro y
-- escondería el único dato que importa (qué se tocó). Si no cambió nada,
-- no hay UPDATE ni apunte: pulsar "Guardar cambios" dos veces produce un
-- único efecto (CLAUDE.md).
create or replace function public.set_establishment_data(
  p_establishment_id uuid,
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null,
  p_address text default null,
  p_postal_code text default null,
  p_city text default null,
  p_contact_email text default null,
  p_phone_primary text default null,
  p_phone_secondary text default null,
  p_website_url text default null,
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
  v_contact_email text;
  v_phone_primary text;
  v_phone_secondary text;
  v_website_url text;
  v_domain text;
  v_opening_hours text;
  v_web_platform text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
begin
  -- `for update` porque dos personas de la misma ficha pueden guardar a la
  -- vez y el apunte de auditoría tiene que contar el valor anterior REAL,
  -- no el que se leyó antes de que la otra guardara.
  select * into v_old
  from public.establishments
  where id = p_establishment_id
  for update;

  if v_old.id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  v_space_id := v_old.space_id;

  -- RN-EST-11 · las dos puertas. El equipo del espacio por su capacidad
  -- (`manage_clients`: propietario y administrador, la misma que cambia el
  -- estado), y el cliente por la suya. Un trabajador NO: puede marcar un
  -- pago (RN-FIN-05) y subir archivos, no reescribir la ficha fiscal de un
  -- cliente.
  if not (
    public.has_capability(v_space_id, 'manage_clients')
    or public.client_can_edit_establishment_data(p_establishment_id)
  ) then
    raise exception 'No tienes permiso para editar los datos de este restaurante';
  end if;

  -- Normalización. `nullif(btrim(...), '')` en todo: un campo que llega
  -- con espacios o vacío se guarda como nulo, para que "sin rellenar" sea
  -- un único valor y no tres que la pantalla tendría que distinguir.
  v_name           := nullif(btrim(coalesce(p_name, '')), '');
  v_legal_name     := nullif(btrim(coalesce(p_legal_name, '')), '');
  v_tax_id         := nullif(upper(replace(btrim(coalesce(p_tax_id, '')), ' ', '')), '');
  v_address        := nullif(btrim(coalesce(p_address, '')), '');
  v_postal_code    := nullif(btrim(coalesce(p_postal_code, '')), '');
  v_city           := nullif(btrim(coalesce(p_city, '')), '');
  v_contact_email  := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
  v_phone_primary  := nullif(btrim(coalesce(p_phone_primary, '')), '');
  v_phone_secondary := nullif(btrim(coalesce(p_phone_secondary, '')), '');
  v_website_url    := nullif(btrim(coalesce(p_website_url, '')), '');
  v_domain         := nullif(lower(btrim(coalesce(p_domain, ''))), '');
  -- El horario es multilínea y las líneas cuentan: solo se recortan los
  -- extremos, nunca los saltos de dentro.
  v_opening_hours  := nullif(btrim(coalesce(p_opening_hours, '')), '');
  v_web_platform   := nullif(btrim(coalesce(p_web_platform, '')), '');

  -- El nombre comercial es `not null` en la tabla y es lo que se enseña en
  -- toda la aplicación: sin él la ficha aparecería en blanco en el listado,
  -- en los mensajes y en los cobros.
  if v_name is null then
    raise exception 'El nombre comercial no puede quedar vacío';
  end if;

  -- Lo poco que se valida se valida de verdad. Un correo sin arroba no es
  -- un correo, y guardarlo significa que el aviso de un impago se manda a
  -- ninguna parte.
  if v_contact_email is not null and v_contact_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'El correo de contacto no tiene forma de correo: %', v_contact_email;
  end if;

  -- El sitio web se normaliza en vez de rechazarse: quien escribe
  -- "www.magarinos.es" no se ha equivocado, pero un enlace sin esquema lo
  -- resuelve el navegador como una ruta relativa y lleva a ninguna parte.
  if v_website_url is not null and v_website_url !~* '^https?://' then
    v_website_url := 'https://' || v_website_url;
  end if;

  -- El dominio es un dominio, no una dirección: se le quita el esquema y
  -- la barra final si alguien pega la URL entera en el campo de al lado.
  if v_domain is not null then
    v_domain := regexp_replace(v_domain, '^https?://', '');
    v_domain := regexp_replace(v_domain, '/.*$', '');
  end if;

  if v_web_platform is not null and v_web_platform not in ('landing_site', 'other') then
    raise exception 'Plataforma web desconocida: %', v_web_platform;
  end if;

  -- Qué cambió. Se compara campo a campo para que el apunte diga
  -- exactamente eso y no trece líneas de "de X a X".
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

  -- Guardar lo mismo no es un cambio (CA-17).
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
    contact_email = v_contact_email,
    phone_primary = v_phone_primary,
    phone_secondary = v_phone_secondary,
    website_url = v_website_url,
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

comment on function public.set_establishment_data(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) is
  'PRD §15.2 · la única puerta para editar la ficha de un restaurante
   (nombre comercial, razón social, identificación fiscal, dirección,
   teléfonos, correo, sitio web, dominio, horarios y plataforma web).
   Comprueba RN-EST-11 por los dos lados —equipo con manage_clients,
   cliente con client_can_edit_establishment_data()— y audita solo los
   campos que cambian. RN-EST-12: no toca el contenido público de ninguna
   web; eso requiere una solicitud.';

-- Comprueba el permiso en su propio cuerpo, así que es una función de
-- pantalla y `authenticated` la ejecuta. `anon` no: sin sesión no hay
-- capacidad ni membresía que comprobar, y dejarla abierta por RPC es
-- superficie que no hace falta (CLAUDE.md).
revoke all on function public.set_establishment_data(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.set_establishment_data(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
