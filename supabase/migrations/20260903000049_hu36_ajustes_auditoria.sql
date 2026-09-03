-- ============================================================
-- HU-36 · Ajustes del espacio y consulta de la auditoría.
--
-- Es el destino `/ajustes` del menú de §20.2, que devolvía 404 desde el
-- Hito 8, y trae otra vez el patrón de siempre: **el servidor "completo"
-- de un hito no está completo hasta que una pantalla lo usa**. Al ir a
-- construir Ajustes aparecieron tres huecos:
--
-- 1. **El espacio se podía renombrar sin dejar rastro.** `spaces` tenía
--    una política de UPDATE para el propietario (`spaces_update_owner`,
--    migración 8) y ninguna función: cambiar el nombre —o la ZONA
--    HORARIA, que mueve el reloj contractual de todos los plazos— era un
--    UPDATE directo por PostgREST, sin actor, sin valor anterior y sin
--    motivo. CLAUDE.md lo prohíbe en una línea ("todo cambio de estado
--    relevante genera un evento y un registro de auditoría con actor,
--    fecha, valor anterior, valor nuevo y motivo cuando proceda") y el
--    PRD lo repite en su principio P4. La política se retira y los dos
--    cambios pasan a hacerse por función, con auditoría.
--
-- 2. **Cambiar la zona horaria no versionaba los calendarios.**
--    `space_working_hours` existe desde el Hito 3 justamente para eso
--    (RN-CLK-10: poder reconstruir qué calendario aplicaba a un tramo
--    pasado), y nadie insertaba nunca una versión nueva porque nadie
--    podía cambiar la zona desde ninguna pantalla. Ahora
--    `set_space_timezone()` da de alta la versión de los calendarios
--    contractual y de Menú Diario. El de **soporte no se toca**: §132 fija
--    su zona en Europa/Madrid y es un reloj distinto que no afecta a los
--    plazos contractuales (decisión ya tomada, ver CLAUDE.md).
--
-- 3. **La visibilidad de la auditoría no era la que dice el PRD.** §21.2
--    reparte la auditoría en cuatro: el propietario ve la de su espacio
--    entera; los administradores, la operativa; el propietario de un
--    restaurante, la de su establecimiento; trabajadores y Editores, sus
--    propias acciones y las operaciones autorizadas. La política vigente
--    (migración 42) decía otra cosa: **cualquier miembro activo** veía
--    TODO el espacio salvo lo financiero. Un trabajador leía por RPC quién
--    supervisa a quién, a quién se ha invitado y qué accesos de cliente se
--    han revocado. Eso se cierra aquí.
--
-- Lo que este archivo NO hace, dicho en claro para que nadie lo dé por
-- hecho al leer §21.2:
--
-- · **El cliente sigue sin ver auditoría.** No es un descuido: sus filas
--   llevan `actor_id`, y enseñárselas rompería el MUST NOT de CLAUDE.md
--   ("el cliente siempre ve 'Equipo de mantenimiento'"). Darle la
--   auditoría de su establecimiento exige una proyección sin identidad,
--   como la que ya tiene `establishment_consumption_ledger()`, y una
--   pantalla suya. HU-36 es la historia del PROPIETARIO; lo del cliente
--   queda pendiente y anotado en el ROADMAP.
-- · **El logotipo del espacio (§124) tampoco.** `files.establishment_id`
--   es NOT NULL: hoy no existe un archivo que sea del espacio y no de un
--   restaurante, así que no hay dónde ponerlo sin inventarse media
--   estructura. La pantalla lo dice en vez de enseñar un botón muerto.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Identidad y configuración contractual del espacio
-- ------------------------------------------------------------

-- El UPDATE directo se retira. A partir de aquí `spaces` no tiene ninguna
-- política de UPDATE, que en RLS significa "nadie": los dos cambios que el
-- PRD admite (§124 nombre, §125 zona horaria) pasan por sus funciones, que
-- comprueban la capacidad y dejan el rastro. El `slug` no se cambia por
-- ninguna de las dos — es la URL del espacio y no hay historia que pida
-- moverla.
drop policy spaces_update_owner on public.spaces;

create or replace function public.set_space_name(p_space_id uuid, p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_new text := btrim(coalesce(p_name, ''));
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede cambiar su nombre';
  end if;

  if v_new = '' then
    raise exception 'El nombre del espacio no puede quedar vacío';
  end if;

  select name into v_old from public.spaces where id = p_space_id;
  if v_old is null then
    raise exception 'El espacio no existe';
  end if;

  -- Guardar lo mismo no es un cambio: no se escribe una fila de auditoría
  -- que diría "de X a X". Pulsar dos veces no ensucia el libro.
  if v_old = v_new then
    return false;
  end if;

  update public.spaces set name = v_new where id = p_space_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    p_space_id, auth.uid(), 'space.renamed', 'space', p_space_id,
    jsonb_build_object('name', v_old),
    jsonb_build_object('name', v_new)
  );

  return true;
end;
$$;

comment on function public.set_space_name(uuid, text) is
  '§124 · el espacio puede cambiar su nombre. Solo el propietario
   (manage_space) y siempre con rastro en audit_log, que es lo que el
   UPDATE directo de la migración 8 no daba.';

revoke all on function public.set_space_name(uuid, text) from public, anon;
grant execute on function public.set_space_name(uuid, text) to authenticated;

create or replace function public.set_space_timezone(
  p_space_id uuid,
  p_timezone text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede cambiar la zona horaria contractual';
  end if;

  -- §21.1: "las acciones sensibles (…, SLA, …) exigen confirmación
  -- adicional". Esta mueve el reloj de TODOS los plazos vivos, así que el
  -- motivo es obligatorio y acaba en la columna `reason` de la auditoría.
  if v_reason = '' then
    raise exception 'Cambiar la zona horaria contractual exige un motivo';
  end if;

  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'La zona horaria "%" no existe', p_timezone;
  end if;

  select timezone into v_old from public.spaces where id = p_space_id;
  if v_old is null then
    raise exception 'El espacio no existe';
  end if;

  if v_old = p_timezone then
    return false;
  end if;

  update public.spaces set timezone = p_timezone where id = p_space_id;

  -- RN-CLK-10 · una versión no se edita: se añade otra vigente desde
  -- ahora, y así se puede reconstruir qué calendario aplicaba a un tramo
  -- pasado. El calendario de SOPORTE no entra: §132 lo fija en
  -- Europa/Madrid y es un reloj distinto del contractual.
  insert into public.space_working_hours (space_id, calendar_kind, timezone, created_by)
  values
    (p_space_id, 'contractual', p_timezone, auth.uid()),
    (p_space_id, 'menu_diario', p_timezone, auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    p_space_id, auth.uid(), 'space.timezone_changed', 'space', p_space_id,
    jsonb_build_object('timezone', v_old),
    jsonb_build_object('timezone', p_timezone),
    v_reason
  );

  return true;
end;
$$;

comment on function public.set_space_timezone(uuid, text, text) is
  '§125 · la zona horaria contractual, que solo cambia el propietario.
   Versiona los calendarios contractual y de Menú Diario (RN-CLK-10) y
   exige motivo, porque mueve todos los plazos vivos (§21.1).';

revoke all on function public.set_space_timezone(uuid, text, text) from public, anon;
grant execute on function public.set_space_timezone(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 2 · Quién ve qué en la auditoría (§21.2)
-- ------------------------------------------------------------

-- La capacidad que hace falta para ver una acción es **la misma que hace
-- falta para ejecutarla**. No es un criterio inventado para la pantalla:
-- sale de `has_capability_as()`, que ya dice quién puede renombrar el
-- espacio (manage_space), quién cobra (manage_finance) o quién gestiona
-- clientes (manage_clients).
--
-- Las familias que devuelven NULL no es que sean públicas: es que su
-- visibilidad no la decide una capacidad sino la FILA —un trabajo, una
-- solicitud, un archivo— y se resuelve con `audit_entity_is_visible()`,
-- que pregunta por la fila misma y hereda su RLS. Así "las operaciones
-- autorizadas" de §21.2 significan exactamente las que el trabajador ya
-- puede ver, sin una segunda copia de esas reglas.
--
-- Falso-cerrado: una familia desconocida cae en NULL y, si su entidad
-- tampoco se reconoce, solo la ven el propietario y quien hizo la acción.
-- El barrido de `audit.test.ts` obliga a clasificar toda acción nueva.
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
    when 'group_access' then 'manage_clients'
    -- Festivos y cierres del espacio (§125, HU-32).
    when 'holiday' then 'manage_holidays'
    else null
  end;
$$;

comment on function public.audit_action_capability(text) is
  '§21.2 · la capacidad que hace falta para VER una acción en la
   auditoría, que es la misma que hace falta para ejecutarla. NULL
   significa "lo decide la fila", no "lo ve cualquiera".';

-- Aparece dentro de la expresión de una política de RLS, así que NO puede
-- perder el EXECUTE de `authenticated`: PostgreSQL evalúa esas
-- expresiones con los privilegios de quien consulta y revocárselo no la
-- cerraría, la rompería entera (CLAUDE.md).
revoke all on function public.audit_action_capability(text) from public, anon;
grant execute on function public.audit_action_capability(text) to authenticated;

-- SECURITY INVOKER a propósito —lo contrario de casi todo lo demás—:
-- justamente queremos que el EXISTS lo evalúe RLS con la identidad de
-- quien pregunta. Un SECURITY DEFINER aquí devolvería "sí" a todo el
-- mundo y sería la fuga.
create or replace function public.audit_entity_is_visible(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_entity_id is null then false
    when p_entity_type = 'request' then exists (select 1 from public.requests r where r.id = p_entity_id)
    when p_entity_type = 'job' then exists (select 1 from public.jobs j where j.id = p_entity_id)
    when p_entity_type = 'task' then exists (select 1 from public.tasks t where t.id = p_entity_id)
    when p_entity_type = 'file' then exists (select 1 from public.files f where f.id = p_entity_id)
    when p_entity_type = 'absence' then exists (select 1 from public.absences a where a.id = p_entity_id)
    when p_entity_type = 'correction' then exists (select 1 from public.corrections c where c.id = p_entity_id)
    else false
  end;
$$;

comment on function public.audit_entity_is_visible(text, uuid) is
  '§21.2 · "las operaciones autorizadas" de un trabajador: las que recaen
   sobre una fila que ya puede ver. SECURITY INVOKER para que sea la RLS
   de esa fila quien conteste.';

revoke all on function public.audit_entity_is_visible(text, uuid) from public, anon;
grant execute on function public.audit_entity_is_visible(text, uuid) to authenticated;

drop policy audit_log_select on public.audit_log;

create policy audit_log_select on public.audit_log
  for select using (
    public.is_platform_owner()
    -- Acciones que no son de ningún espacio (HU-05, cerrar una sesión):
    -- las ve el interesado y nadie más.
    or (space_id is null and actor_id = auth.uid())
    or (
      space_id is not null
      and public.is_space_member(space_id)
      and (
        -- "El propietario del espacio ve la auditoría completa de su
        -- espacio" (§21.2), sin más matices.
        public.has_capability(space_id, 'manage_space')
        -- "Trabajadores y Editores, sus propias acciones…"
        or actor_id = auth.uid()
        -- "…y las operaciones autorizadas", y la operativa de los
        -- administradores: por capacidad cuando la acción la tiene, y por
        -- la fila cuando no.
        or case
             when public.audit_action_capability(action) is not null
               then public.has_capability(space_id, public.audit_action_capability(action))
             else public.audit_entity_is_visible(entity_type, entity_id)
           end
      )
    )
  );

comment on policy audit_log_select on public.audit_log is
  '§21.2 · propietario: todo su espacio. Administradores: la operativa
   (todo salvo la configuración del espacio y la composición del equipo,
   que son capacidades suyas del propietario). Trabajadores: sus propias
   acciones y las filas que ya pueden ver. Cliente: nada — su auditoría
   necesita una proyección sin identidad que todavía no existe.';

-- La pantalla pide el libro del espacio ordenado por fecha y paginado, y el
-- único índice que había era por `space_id` a secas: con eso, cada página
-- ordena en memoria todo el historial del espacio. El libro solo crece.
create index if not exists audit_log_space_created_idx
  on public.audit_log (space_id, created_at desc);

-- Sigue sin haber política de UPDATE ni de DELETE, que es lo que sostiene
-- CA-16. Se repite aquí porque este archivo toca la tabla y conviene que
-- quien lo lea no crea que se le olvidaron.
