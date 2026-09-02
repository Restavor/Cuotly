-- ============================================================
-- El restaurante nunca podía pedir su corrección gratuita.
--
-- Lo destapó el recorrido de CA-19 en un teléfono, en el último paso:
-- después de publicar, la pantalla del cliente no enseña "Pedir una
-- corrección". No era la ventana ni el estado —el trabajo estaba
-- publicado, con la ventana abierta hasta cinco días después y sin
-- corrección gastada—: era que la pantalla leía la tabla `jobs`
-- directamente y el cliente NO puede leerla.
--
-- Y no puede a propósito. `jobs_select` es
-- `is_space_member(space_id) and can_read_job(id)`, exactamente la misma
-- forma que `assignments`, `blocks`, `tasks` y los `state_events` de
-- trabajo: el cliente se queda fuera de la FILA porque la fila entera es
-- organización interna del equipo (P7 del PRD; el bloqueante B2 de la
-- cuarta revisión fue confundir este caso con el de tapar una columna).
-- Y la fila lo es de verdad: `jobs` lleva `assigned_to`, `started_by`,
-- `published_by` y `cancelled_by`, cuatro identidades del equipo que el
-- cliente no puede ver (CA-04, MUST NOT de CLAUDE.md). La prueba de que
-- la línea está bien trazada es `corrections_select`, que sí es
-- `can_read_job(job_id)` a secas: la corrección es del cliente, el
-- trabajo no.
--
-- Así que la puerta no es abrir la tabla, que obligaría a revocar cuatro
-- columnas a TODO el mundo —los privilegios de columna son por rol, y el
-- equipo las necesita— sino una función que conteste exactamente lo que
-- el cliente tiene derecho a saber de su solicitud: si hay trabajo, si
-- está publicado, si ya gastó la corrección y hasta cuándo puede pedirla.
-- Ninguna identidad. Es el mismo patrón con el que el cliente ya obtiene
-- el slug de su espacio (`space_slug`) o el estado de un cobro
-- (`charge_status`).
--
-- La comprobación de permiso es `can_read_establishment()`, que cubre a
-- los dos lados: el cliente por `establishment_memberships` o
-- `group_memberships`, y el equipo por pertenencia al espacio.
-- ============================================================

create or replace function public.client_request_job(p_request_id uuid)
returns table (
  job_id uuid,
  state text,
  free_correction_used boolean,
  correction_window_ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
begin
  select r.establishment_id into v_establishment_id
  from public.requests r where r.id = p_request_id;

  if v_establishment_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_read_establishment(v_establishment_id) then
    raise exception 'No tienes acceso a esta solicitud';
  end if;

  -- Cuatro columnas, y ninguna dice quién. Devolver la fila entera aquí
  -- sería exactamente el agujero que la política de `jobs` evita.
  return query
  select j.id,
         j.state,
         j.free_correction_used_at is not null,
         j.correction_window_ends_at
  from public.jobs j
  where j.request_id = p_request_id;
end;
$$;

-- `authenticated` la necesita: es quien la llama desde la pantalla del
-- restaurante. `anon` no: sin sesión no hay `auth.uid()` con el que
-- `can_read_establishment()` pueda decir que sí, pero una función abierta
-- a `anon` es una superficie que no tiene por qué existir.
revoke all on function public.client_request_job(uuid) from public, anon;
grant execute on function public.client_request_job(uuid) to authenticated;
