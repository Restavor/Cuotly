-- ============================================================================
-- Migración 125 · El DNI, CIF o NIF en la solicitud de acceso (RN-ACC-02)
-- Decisión 67 del 22/09/2026
-- ============================================================================
--
-- Bosco, al revisar el diseño de la puerta de entrada: la solicitud de
-- acceso pide **nombre y apellidos, nombre del negocio, teléfono, correo,
-- DNI/CIF/NIF y un comentario opcional**. Hasta hoy eran cinco campos y
-- cuatro obligatorios (migración 97); ahora son seis y cinco obligatorios.
--
-- Qué cambia:
--
--   · `access_requests.tax_id`. **Admite nulo** a propósito: las
--     solicitudes que ya existen se escribieron sin él, y un `not null`
--     —o un `check` `not valid`, que PostgreSQL vuelve a comprobar en cada
--     UPDATE de la fila— impediría decidirlas. La obligación la pone la
--     única puerta de entrada, `submit_access_request()`: nadie tiene
--     `insert` sobre la tabla, así que toda solicitud nueva pasa por ella.
--   · `submit_access_request()` gana `p_tax_id`, **obligatorio**. La firma
--     de cinco argumentos se **borra**, no se deja al lado: si siguiera
--     viva, cualquiera podría seguir mandando solicitudes sin documento
--     llamándola por RPC, y la regla sería de la pantalla y no del
--     servidor (CLAUDE.md).
--   · El documento se guarda sin espacios, puntos ni guiones y en
--     mayúsculas. **No se comprueba la letra de control ni la forma**: no
--     está decidido qué documentos se aceptan y uno extranjero no tiene la
--     forma española. Se exige que haya algo.
--
-- Quién lo ve: el equipo de Cuotly que revisa solicitudes, por la misma
-- política de siempre (`is_platform_approver()`), con su columna en el
-- `grant select` de columnas. El seguimiento por enlace con clave
-- (`access_request_follow_up()`) **no** lo devuelve: un enlace se reenvía,
-- y con él no se regala el documento de nadie.

alter table public.access_requests
  add column tax_id text
    check (tax_id is null or length(btrim(tax_id)) > 0);

comment on column public.access_requests.tax_id is
  'Decisión 67 · RN-ACC-02 · DNI, CIF o NIF de quien solicita, sin espacios,
   puntos ni guiones y en mayúsculas. Nulo solo en las solicitudes
   anteriores a la migración 125; las nuevas lo traen siempre, porque
   `submit_access_request()` lo exige.';

grant select (tax_id) on public.access_requests to authenticated;

drop function public.submit_access_request(text, text, text, text, text);

create or replace function public.submit_access_request(
  p_contact_name text,
  p_business_name text,
  p_phone text,
  p_email text,
  p_tax_id text,
  p_comments text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  -- Decisión 67 · sin espacios, puntos ni guiones y en mayúsculas, igual
  -- que `normalizeTaxId()` en `src/core/access-requests.ts`.
  v_tax_id text := upper(regexp_replace(coalesce(p_tax_id, ''), '[[:space:].-]', '', 'g'));
  v_id uuid;
  v_token uuid;
begin
  if coalesce(btrim(p_contact_name), '') = ''
     or coalesce(btrim(p_business_name), '') = ''
     or coalesce(btrim(p_phone), '') = ''
     or v_tax_id = ''
     or position('@' in v_email) < 2 then
    raise exception 'Faltan el nombre, el negocio, el teléfono, el correo o el DNI, CIF o NIF';
  end if;

  -- Ya tiene cuenta: no se abre una solicitud que nadie podría aprobar
  -- —una persona, una cuenta, un correo— y quien se entera es la
  -- dirección, no la pantalla.
  if exists (select 1 from public.profiles p where lower(p.email) = v_email) then
    perform public.queue_platform_email(
      'access_request_already_registered', v_email,
      jsonb_build_object('contact_name', btrim(p_contact_name)),
      'already:' || v_email || ':' || to_char(now(), 'YYYY-MM-DD')
    );
    return;
  end if;

  -- Ya tiene una abierta: tampoco se abre otra, y se le recuerda por dónde
  -- va la suya. La clave del enlace NO se regenera: si se regenerara,
  -- cualquiera podría invalidar el seguimiento de otro reenviando el
  -- formulario con su correo.
  select id, follow_up_token into v_id, v_token
  from public.access_requests
  where lower(email) = v_email and status in ('submitted', 'needs_information')
  limit 1;

  if v_id is not null then
    perform public.queue_platform_email(
      'access_request_received', v_email,
      jsonb_build_object('contact_name', btrim(p_contact_name), 'follow_up_token', v_token),
      'received:' || v_id::text
    );
    return;
  end if;

  insert into public.access_requests (contact_name, business_name, phone, email, tax_id, comments)
  values (btrim(p_contact_name), btrim(p_business_name), btrim(p_phone), v_email, v_tax_id,
          nullif(btrim(coalesce(p_comments, '')), ''))
  returning id, follow_up_token into v_id, v_token;

  insert into public.access_request_events (request_id, from_status, to_status)
  values (v_id, null, 'submitted');

  -- RN-ACC-08 · con `space_id` nulo y `actor_id` nulo: no hay espacio, y
  -- quien la escribió no es nadie en Cuotly todavía.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (null, null, 'access_request.submitted', 'access_request', v_id,
          jsonb_build_object('status', 'submitted'));

  perform public.queue_platform_email(
    'access_request_received', v_email,
    jsonb_build_object('contact_name', btrim(p_contact_name), 'follow_up_token', v_token),
    'received:' || v_id::text
  );
end;
$$;

comment on function public.submit_access_request(text, text, text, text, text, text) is
  'RN-ACC-02 · el formulario público, con el DNI, CIF o NIF obligatorio
   (decisión 67). Devuelve `void` para no ser un oráculo de correos
   (RN-ACC-12): conteste lo que conteste la base, la pantalla dice siempre
   lo mismo.';

revoke all on function public.submit_access_request(text, text, text, text, text, text) from public;
grant execute on function public.submit_access_request(text, text, text, text, text, text)
  to anon, authenticated;
