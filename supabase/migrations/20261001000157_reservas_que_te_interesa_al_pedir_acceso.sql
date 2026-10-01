-- Fase A de Restavor agents (APP-00) · segunda de tres migraciones.
--
-- "¿Qué te interesa?" al pedir acceso (decisión 88, RN-APP-03): quien pide
-- una cuenta dice si quiere Restavor web, Reservas o las dos. Es una
-- indicación para quien aprueba la solicitud; no abre ni cierra nada por sí
-- sola. Sin marcar vale ['web'], que es lo que había antes de la casilla.
--
-- `submit_access_request` cambia de firma: se borra la de nueve argumentos y
-- se crea la de diez. Sigue reservada a `service_role` (RN-ACC-12).

alter table public.access_requests add column interested_in text[];

alter table public.access_requests
  add constraint access_requests_interested_in_check check (
    interested_in is null
    or (cardinality(interested_in) between 1 and 2
        and interested_in <@ array['web', 'reservations']::text[])
  );

comment on column public.access_requests.interested_in is
  'Decisión 88 · web, reservations o las dos. Nulo en las solicitudes anteriores a la casilla.';

-- La lee el equipo de Restavor web por la misma vía que el resto de columnas visibles.
grant select (interested_in) on public.access_requests to authenticated;

drop function public.submit_access_request(text, text, text, text, text, text, text, text, text);

create or replace function public.submit_access_request(p_contact_name text, p_business_name text, p_phone text, p_email text, p_tax_id text, p_tax_id_country text, p_tax_id_verification text, p_tax_id_registry_name text DEFAULT NULL::text, p_comments text DEFAULT NULL::text, p_interested_in text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  -- Decisión 67 · sin espacios, puntos, guiones ni barras y en
  -- mayúsculas, igual que `normalizeTaxId()` en `src/core/tax-id.ts`.
  v_tax_id text := upper(regexp_replace(coalesce(p_tax_id, ''), '[[:space:]./-]', '', 'g'));
  v_country text := upper(btrim(coalesce(p_tax_id_country, '')));
  v_id uuid;
  v_token uuid;
  -- Decisión 88 · "¿Qué te interesa?": Restavor web, Reservas o las dos. Sin
  -- marcar vale Restavor web, que es lo que había antes de esta casilla.
  v_interested text[];
begin
  if p_interested_in is null or cardinality(p_interested_in) = 0 then
    v_interested := array['web'];
  else
    if exists (select 1 from unnest(p_interested_in) i where i is null or i not in ('web', 'reservations')) then
      raise exception 'Lo que te interesa solo puede ser Restavor web o Reservas';
    end if;
    select array_agg(distinct i order by i) into v_interested from unnest(p_interested_in) i;
  end if;

  if coalesce(btrim(p_contact_name), '') = ''
     or coalesce(btrim(p_business_name), '') = ''
     or coalesce(btrim(p_phone), '') = ''
     or v_tax_id = ''
     or position('@' in v_email) < 2 then
    raise exception 'Faltan el nombre, el negocio, el teléfono, el correo o el DNI, CIF o NIF';
  end if;

  -- Decisión 68 · el país y cómo quedó comprobado. La comprobación la hace
  -- el servidor de Restavor web antes de llamar (cálculo de control y VIES);
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
    tax_id_country, tax_id_verification, tax_id_registry_name, comments, interested_in
  )
  values (btrim(p_contact_name), btrim(p_business_name), btrim(p_phone), v_email, v_tax_id,
          v_country, p_tax_id_verification, nullif(btrim(coalesce(p_tax_id_registry_name, '')), ''),
          nullif(btrim(coalesce(p_comments, '')), ''), v_interested)
  returning id, follow_up_token into v_id, v_token;

  insert into public.access_request_events (request_id, from_status, to_status)
  values (v_id, null, 'submitted');

  -- RN-ACC-08 · con `space_id` nulo y `actor_id` nulo: no hay espacio, y
  -- quien la escribió no es nadie en Restavor web todavía.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (null, null, 'access_request.submitted', 'access_request', v_id,
          jsonb_build_object('status', 'submitted'));

  perform public.queue_platform_email(
    'access_request_received', v_email,
    jsonb_build_object('contact_name', btrim(p_contact_name), 'follow_up_token', v_token),
    'received:' || v_id::text
  );
end;
$function$;


revoke all on function public.submit_access_request(text, text, text, text, text, text, text, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.submit_access_request(text, text, text, text, text, text, text, text, text, text[])
  to service_role;
