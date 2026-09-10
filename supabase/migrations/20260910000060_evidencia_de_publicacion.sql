-- Evidencia de publicación (maqueta 06 · "Trabajos — ejecución").
--
-- La ficha de un trabajo enseña, abajo a la derecha, lo que se publicó:
-- la captura de la web, el PDF, lo que sea. No hace falta ninguna tabla
-- nueva — RN-ARC-02 ya modela el "elemento relacionado" en `file_links`, y
-- `entity_type` admite 'job' desde el Hito 7. Lo que falta es la PUERTA:
-- la única función que escribe en `file_links` para un trabajo es
-- `link_file()`, que recibe `p_actor_id` por parámetro y no comprueba
-- absolutamente nada. Es un ayudante interno de `service_role` (la usa la
-- conversión de solicitudes), no una puerta de entrada, y ofrecérsela a
-- una pantalla sería dejar que cualquiera enlazara cualquier archivo a
-- cualquier trabajo diciendo ser quien quisiera.
--
-- Es el mismo patrón que la migración 56 dejó escrito: "una función del
-- servidor no está terminada hasta que algo la usa" — y su reverso, que
-- es este: una pantalla no se apoya en un ayudante interno, se apoya en
-- una puerta que comprueba.
--
-- Lo que comprueba `attach_job_evidence()`, y por qué cada cosa:
--
--   · **Quién.** El responsable asignado, o quien tiene `assign_jobs`.
--     Adjuntar la evidencia es parte de publicar (RN-JOB-10, "el
--     trabajador publica directamente"), así que es de quien hace el
--     trabajo; y un administrador puede completarla después. Al
--     restaurante no: `can_read_job()` le deja ver la ficha de SU trabajo
--     a propósito, y sin esta comprobación eso se habría convertido en
--     permiso de escritura por la puerta de atrás.
--   · **Qué archivo.** Uno que quien llama pueda ver (`can_read_file()`,
--     donde viven RN-ARC-04, RN-ARC-05 y RN-FIN-07). Sin esto, un
--     trabajador podría enlazar a su trabajo una factura que no puede
--     abrir y leerla después por la ficha.
--   · **De quién es el archivo.** Del MISMO restaurante que el trabajo.
--     Enlazar un archivo de otro restaurante lo colaría en la ficha de
--     este, y `file_links` no tiene ninguna columna que lo impida.
--   · **Dos veces no duplica** (CLAUDE.md): `on conflict do nothing` sobre
--     la clave única de `file_links`, y el apunte de auditoría solo se
--     escribe cuando el enlace es nuevo de verdad. Un `insert` que no
--     inserta nada y aun así audita es una auditoría que miente.
--
-- No borra nada ni desenlaza: CLAUDE.md prohíbe el borrado físico de
-- registros de negocio, y una evidencia enlazada es exactamente eso.
--
-- Se comprueba con `supabase/tests/evidencia_de_publicacion.sql`.

create or replace function public.attach_job_evidence(p_file_id uuid, p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_assigned_to uuid;
  v_file_establishment uuid;
  v_inserted integer := 0;
begin
  select space_id, establishment_id, assigned_to
  into v_space_id, v_establishment_id, v_assigned_to
  from public.jobs where id = p_job_id;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  -- El cliente puede leer la ficha de su trabajo, pero no escribir en
  -- ella: `is_space_member()` es lo que lo deja fuera (P7).
  if not public.is_space_member(v_space_id) then
    raise exception 'No tienes acceso a este trabajo';
  end if;

  if v_assigned_to is distinct from auth.uid()
     and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable del trabajo puede adjuntar su evidencia';
  end if;

  if not public.can_read_file(p_file_id) then
    raise exception 'No tienes acceso a ese archivo';
  end if;

  select establishment_id into v_file_establishment
  from public.files where id = p_file_id;

  if v_file_establishment is distinct from v_establishment_id then
    raise exception 'Ese archivo no es de este restaurante';
  end if;

  insert into public.file_links (file_id, space_id, entity_type, entity_id, created_by)
  values (p_file_id, v_space_id, 'job', p_job_id, auth.uid())
  on conflict (file_id, entity_type, entity_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (
      v_space_id, auth.uid(), 'job.evidence_attached', 'job', p_job_id,
      jsonb_build_object('file_id', p_file_id)
    );
  end if;
end;
$$;

comment on function public.attach_job_evidence(uuid, uuid) is
  'RN-JOB-10 · RN-ARC-02: enlaza a un trabajo el archivo que prueba qué se
   publicó. Es la puerta con comprobaciones que `link_file()` —ayudante
   interno de service_role— no tiene. Idempotente: enlazar dos veces el
   mismo archivo deja un solo enlace y un solo apunte de auditoría.';

-- Un proyecto de Supabase concede EXECUTE a `anon` y `authenticated` sobre
-- toda función nueva (CLAUDE.md), así que revocar solo a PUBLIC la dejaría
-- abierta sin sesión. No aparece en ninguna política de RLS, así que no le
-- aplica la excepción de la migración 20260830000032.
revoke all on function public.attach_job_evidence(uuid, uuid) from public, anon;
grant execute on function public.attach_job_evidence(uuid, uuid) to authenticated;
