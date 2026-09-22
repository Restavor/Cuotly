-- ============================================================================
-- Migración 126 · El DNI, CIF o NIF se comprueba (RN-ACC-02)
-- Decisión 68 del 22/09/2026
-- ============================================================================
--
-- Bosco, sobre la 125: "controla que el DNI exista; no tiene por qué ser
-- español, pero controla que sea real". Lo que se puede hacer, y lo que
-- esta migración sostiene:
--
--   · **Ningún registro público dice si un documento de identidad existe.**
--     Lo que se comprueba es que esté bien formado, con la letra o el
--     dígito de control de su país (España, Portugal, Países Bajos y
--     Bélgica en `src/core/tax-id.ts`). Un número inventado casi nunca
--     cuadra, y ese **se rechaza**.
--   · **El número de IVA de una empresa de la UE sí se comprueba de
--     verdad**, contra VIES (`src/services/vies.ts`), que además devuelve
--     el nombre registrado para que quien revisa lo compare con el negocio.
--   · Lo que no se puede confirmar —un país sin cálculo y fuera de VIES, o
--     VIES caído— **entra marcado** para que el equipo lo mire antes de
--     aprobar. Rechazarlo dejaría fuera a gente real.
--
-- Por qué la función deja de estar abierta a `anon`. VIES no se puede
-- consultar desde la base, así que la comprobación vive en el servidor de
-- Cuotly (Next). Si `submit_access_request()` siguiera abierta por RPC,
-- cualquiera la llamaría directamente con un documento falso y "ya
-- comprobado", y la regla sería de la pantalla (CLAUDE.md: toda operación
-- se valida en el servidor, también la que se llama por URL). Así que se
-- reserva a `service_role`, que solo tiene el servidor, y todo pasa por el
-- mismo código: la acción del formulario web y `/api/movil/solicitud-acceso`
-- para el teléfono (`src/services/access-request.ts`).
--
-- Lo que la base sigue exigiendo por su cuenta: que venga el país, que la
-- comprobación sea una de las cinco conocidas, y que un documento español
-- solo entre comprobado por cálculo.
--
-- En producción había 0 solicitudes al escribir esto.

alter table public.access_requests
  add column tax_id_country text check (tax_id_country ~ '^[A-Z]{2}$'),
  add column tax_id_verification text check (tax_id_verification in (
    'checksum', 'registry', 'registry_not_found', 'registry_unavailable', 'unverified'
  )),
  add column tax_id_registry_name text,
  add constraint access_requests_spanish_tax_id_checked check (
    tax_id_country is distinct from 'ES' or tax_id_verification = 'checksum'
  );

comment on column public.access_requests.tax_id_country is
  'Decisión 68 · país del documento (ISO 3166-1 alfa-2). Nulo solo en las
   solicitudes anteriores a la migración 126.';
comment on column public.access_requests.tax_id_verification is
  'Decisión 68 · cómo quedó comprobado el documento: `checksum` (el cálculo
   de control cuadra), `registry` (VIES lo confirma), `registry_not_found`
   (VIES no lo encuentra y no hay cálculo), `registry_unavailable` (VIES no
   contestó y no hay cálculo) o `unverified` (país sin cálculo y fuera de
   VIES). Las tres últimas las mira el equipo antes de aprobar.';
comment on column public.access_requests.tax_id_registry_name is
  'Decisión 68 · el nombre que VIES tiene registrado para ese número de IVA,
   para compararlo con el negocio que dice la solicitud.';

grant select (tax_id_country, tax_id_verification, tax_id_registry_name)
  on public.access_requests to authenticated;

drop function public.submit_access_request(text, text, text, text, text, text);

create or replace function public.submit_access_request(
  p_contact_name text,
  p_business_name text,
  p_phone text,
  p_email text,
  p_tax_id text,
  p_tax_id_country text,
  p_tax_id_verification text,
  p_tax_id_registry_name text default null,
  p_comments text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  -- Decisión 67 · sin espacios, puntos, guiones ni barras y en
  -- mayúsculas, igual que `normalizeTaxId()` en `src/core/tax-id.ts`.
  v_tax_id text := upper(regexp_replace(coalesce(p_tax_id, ''), '[[:space:]./-]', '', 'g'));
  v_country text := upper(btrim(coalesce(p_tax_id_country, '')));
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

  -- Decisión 68 · el país y cómo quedó comprobado. La comprobación la hace
  -- el servidor de Cuotly antes de llamar (cálculo de control y VIES);
  -- aquí se exige que venga y que sea una de las conocidas. España solo
  -- entra comprobada por cálculo: un DNI, NIE o CIF que no cuadra no llega.
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'Falta el país del documento';
  end if;
  if coalesce(p_tax_id_verification, '') not in
     ('checksum', 'registry', 'registry_not_found', 'registry_unavailable', 'unverified') then
    raise exception 'Falta cómo se comprobó el documento';
  end if;
  if v_country = 'ES' and p_tax_id_verification <> 'checksum' then
    raise exception 'Un documento español solo entra con su cálculo de control comprobado';
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

  insert into public.access_requests (
    contact_name, business_name, phone, email, tax_id,
    tax_id_country, tax_id_verification, tax_id_registry_name, comments
  )
  values (btrim(p_contact_name), btrim(p_business_name), btrim(p_phone), v_email, v_tax_id,
          v_country, p_tax_id_verification, nullif(btrim(coalesce(p_tax_id_registry_name, '')), ''),
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

comment on function public.submit_access_request(text, text, text, text, text, text, text, text, text) is
  'RN-ACC-02 · la solicitud de acceso, con el documento ya comprobado por el
   servidor de Cuotly (decisión 68). Interna: solo `service_role`. Devuelve
   `void` para no ser un oráculo de correos (RN-ACC-12).';

revoke all on function public.submit_access_request(text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_access_request(text, text, text, text, text, text, text, text, text)
  to service_role;
