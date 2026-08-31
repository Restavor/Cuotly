-- Tercera pasada sobre la misma clase de fallo (identidad individual del
-- equipo visible para el cliente, CLAUDE.md MUST NOT). Esta la introdujo
-- la migración 20260830000026 al ampliar `corrections_select` de
-- `is_space_member(space_id) or can_read_establishment(establishment_id)`
-- a `can_read_job(job_id)`: el cambio era correcto en su intención
-- (RN-ARC-05, que un trabajador sin ese establecimiento autorizado no lea
-- lo que escribió el restaurante), pero `can_read_job()` incluye
-- `is_establishment_client()`, así que el restaurante pasó a leer la fila
-- entera — y con ella dos columnas de identidad del equipo.
--
-- Verificado en vivo antes del arreglo: con una corrección de tipo
-- 'team_error' (que abre y cierra el equipo), el propietario local del
-- restaurante leía `requested_by` y `completed_by` con el uuid del
-- administrador.
--
-- Se cierran con privilegio de columna, igual que las otras diecisiete.
-- `kind` se conserva a propósito: distinguir "la pedí yo" de "fue un
-- error del equipo" es información que al restaurante le corresponde
-- (RN-COR-07: una corrección por error del equipo no le gasta la suya), y
-- no identifica a nadie. Es el mismo criterio que `receipts.uploaded_side`.
revoke select on public.corrections from anon, authenticated;
grant select (id, space_id, establishment_id, job_id, request_id, kind, description,
              requested_at, started_at, completed_at)
  on public.corrections to authenticated;
