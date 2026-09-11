-- El historial de UN restaurante (maqueta 19, §21.2).
--
-- La auditoría del espacio entero ya se consulta desde Ajustes (HU-36,
-- migración 49). La maqueta 19 pide la misma información acotada a un
-- restaurante, en su pestaña Historial: "consulta todas las acciones
-- realizadas en el restaurante".
--
-- **El problema que hay que resolver.** `audit_log` no tiene
-- `establishment_id`, y no debería tenerlo: un apunte apunta a una
-- entidad (`entity_type` + `entity_id`), y de qué restaurante es esa
-- entidad lo sabe la entidad, no el apunte. Duplicar la columna sería un
-- dato derivado que algún día discrepa del original.
--
-- **Por qué NO es SECURITY DEFINER, que es lo importante de este archivo.**
-- Estas dos funciones leen `audit_log`, y esa tabla tiene una política
-- cuidadosamente escrita (§21.2, migración 49): el propietario ve su
-- espacio entero, un administrador la operativa, un trabajador sus propias
-- acciones y las filas que ya puede ver, y un cliente no ve nada porque no
-- es miembro del espacio. Una función `security definer` leyendo esa tabla
-- correría como su dueño y **se saltaría esa política entera**: sería una
-- puerta de atrás a la auditoría del espacio, justo la clase de agujero
-- que CLAUDE.md persigue. Con `security invoker` —que es lo que ya hace
-- `audit_entity_is_visible()` desde la migración 49, y por el mismo
-- motivo— la política sigue mandando y esto solo acota.
--
-- Consecuencia que conviene tener presente: si alguien no puede leer la
-- fila de la entidad, tampoco resuelve su restaurante y el apunte no sale
-- en este historial. Es el comportamiento correcto —solo se ve el
-- historial de lo que ya se puede ver— y no un descarte accidental.
--
-- Se comprueba con `supabase/tests/historial_del_restaurante.sql`.

-- ------------------------------------------------------------
-- 1 · De qué restaurante es una entidad auditada
-- ------------------------------------------------------------
--
-- La lista NO es "todas las tablas con `establishment_id`": es la de las
-- entidades sobre las que se escriben apuntes. Lo que no está aquí —el
-- espacio, una membresía, un festivo, una sesión— no es de ningún
-- restaurante, y devolver `null` es la respuesta correcta.
create or replace function public.audit_entity_establishment(
  p_entity_type text,
  p_entity_id uuid
)
returns uuid
language sql
stable
set search_path = public
as $$
  select case
    when p_entity_id is null then null
    when p_entity_type = 'establishment' then p_entity_id
    when p_entity_type = 'request' then (select r.establishment_id from public.requests r where r.id = p_entity_id)
    when p_entity_type = 'job' then (select j.establishment_id from public.jobs j where j.id = p_entity_id)
    when p_entity_type = 'task' then (select t.establishment_id from public.tasks t where t.id = p_entity_id)
    when p_entity_type = 'file' then (select f.establishment_id from public.files f where f.id = p_entity_id)
    when p_entity_type = 'charge' then (select c.establishment_id from public.charges c where c.id = p_entity_id)
    when p_entity_type = 'payment' then (select p.establishment_id from public.payments p where p.id = p_entity_id)
    when p_entity_type = 'subscription' then (select s.establishment_id from public.subscriptions s where s.id = p_entity_id)
    when p_entity_type = 'correction' then (select c.establishment_id from public.corrections c where c.id = p_entity_id)
    when p_entity_type = 'conversation' then (select c.establishment_id from public.conversations c where c.id = p_entity_id)
    else null
  end;
$$;

comment on function public.audit_entity_establishment(text, uuid) is
  'Maqueta 19 · de qué restaurante es la entidad de un apunte de auditoría.
   SECURITY INVOKER a propósito: la RLS de cada tabla sigue mandando, así
   que quien no puede leer la entidad tampoco resuelve su restaurante.';

revoke all on function public.audit_entity_establishment(text, uuid) from public, anon;
grant execute on function public.audit_entity_establishment(text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 2 · El historial del restaurante, con sus filtros
-- ------------------------------------------------------------
--
-- Los filtros van en la consulta y no en la pantalla porque esta tabla
-- crece para siempre (§20.7 pide paginación en toda lista que pueda
-- crecer). El tope de `p_limit` no es cosmético: sin él, una llamada con
-- `p_limit => 1000000` traería el historial entero de golpe.
create or replace function public.establishment_audit(
  p_establishment_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_family text default null,
  p_actor_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  actor_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text
)
language sql
stable
set search_path = public
as $$
  select a.id, a.created_at, a.actor_id, a.action, a.entity_type, a.entity_id,
         a.old_value, a.new_value, a.reason
  from public.audit_log a
  where public.audit_entity_establishment(a.entity_type, a.entity_id) = p_establishment_id
    and (p_from is null or a.created_at >= p_from)
    and (p_to is null or a.created_at < p_to)
    and (p_family is null or a.action like p_family || '.%')
    and (p_actor_id is null or a.actor_id = p_actor_id)
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.establishment_audit(uuid, timestamptz, timestamptz, text, uuid, integer, integer) is
  'Maqueta 19 · "todas las acciones realizadas en el restaurante", acotadas
   a las que quien pregunta ya puede ver: SECURITY INVOKER, así que la
   política de audit_log (§21.2) sigue decidiendo fila a fila.';

revoke all on function public.establishment_audit(uuid, timestamptz, timestamptz, text, uuid, integer, integer) from public, anon;
grant execute on function public.establishment_audit(uuid, timestamptz, timestamptz, text, uuid, integer, integer) to authenticated;

-- ------------------------------------------------------------
-- 3 · Quién ha actuado en este restaurante
-- ------------------------------------------------------------
--
-- Para el desplegable "Persona" de la maqueta. Sale de los mismos apuntes
-- que el historial, así que ofrece exactamente a las personas cuyas filas
-- quien pregunta puede ver: un filtro que devuelve cero resultados se lee
-- como un error de la pantalla, no como un filtro bien aplicado.
create or replace function public.establishment_audit_actors(p_establishment_id uuid)
returns table (actor_id uuid)
language sql
stable
set search_path = public
as $$
  select distinct a.actor_id
  from public.audit_log a
  where a.actor_id is not null
    and public.audit_entity_establishment(a.entity_type, a.entity_id) = p_establishment_id;
$$;

comment on function public.establishment_audit_actors(uuid) is
  'Maqueta 19 · las personas que aparecen en el historial de este
   restaurante, para el filtro "Persona". Mismas reglas de visibilidad que
   el historial.';

revoke all on function public.establishment_audit_actors(uuid) from public, anon;
grant execute on function public.establishment_audit_actors(uuid) to authenticated;
