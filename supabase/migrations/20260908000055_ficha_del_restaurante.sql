-- La ficha del restaurante (PRD §15.2), con las cinco pestañas.
--
-- Casi toda la ficha son consultas que la pantalla ya puede hacer con RLS:
-- el plan y los servicios salen de `subscriptions`, el ciclo de
-- `consumption_cycles`, los consumos de `establishment_cycle_allowance()`,
-- los cobros de `charges`, los archivos de `files` y `file_versions`, y el
-- historial de `state_events`. Nada de eso necesita una función nueva.
--
-- Una sí: **la pestaña Usuarios**.
--
-- `establishment_memberships` la lee el equipo sin problema —su política
-- es `is_space_member()` desde la migración 15—, pero lo único que
-- devuelve son uuids. El nombre y el correo están en `profiles`, y
-- `profiles_select` (migración 8) solo deja ver a quien comparte ESPACIO
-- con quien pregunta: un cliente no es miembro del espacio, así que su
-- perfil es ilegible para el equipo que le da servicio. La pestaña
-- Usuarios de §15.2 —"responsables"— enseñaría una lista de identificadores.
--
-- Se resuelve como el resto del proyecto: una función que comprueba el
-- permiso por su cuenta, no ensanchando la política de `profiles`. La
-- política es de toda la tabla y afectaría a cualquier consulta futura;
-- esto contesta exactamente una pregunta —"quién tiene acceso a ESTE
-- restaurante"— y solo a quien pertenece al espacio.
--
-- La dirección importa y no es simétrica: al **equipo** se le dice quién
-- es cada persona del restaurante, porque es a quien le da de alta, le
-- retira el acceso (RN-EST-05) y le escribe. Al revés no: al restaurante
-- no se le da la identidad individual de nadie del equipo (CLAUDE.md MUST
-- NOT, RN-MSG-02), y por eso esta función NO tiene rama de cliente — a
-- quien no es del espacio le contesta con cero filas, no con una lista
-- distinta. Una función con dos respuestas según quién pregunta es una
-- función a la que un día se le olvida cuál toca.
--
-- Se comprueba con `supabase/tests/ficha_del_restaurante.sql`.

-- ============================================================
-- Quién tiene acceso a un restaurante, con nombre (§15.2, RN-EST-01 a 05).
--
-- Dos orígenes, porque el acceso de un cliente tiene dos formas
-- (RN-EST-01/03): el propietario global del GRUPO, que además lo recibe
-- automáticamente en cada establecimiento nuevo, y el miembro directo del
-- establecimiento con su rol (`local_owner`, `editor`, `consulta`) y sus
-- permisos finos (RN-EST-11, RN-FIN-07).
--
-- Los dos se devuelven en la misma lista, distinguidos por `source`, en
-- vez de mezclarlos: "propietario global del grupo" y "propietario local"
-- no son el mismo acceso y retirarlos no es la misma operación
-- (`revoke_group_access()` frente a `revoke_establishment_access()`).
-- ============================================================
create or replace function public.establishment_client_users(p_establishment_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  source text,
  role text,
  edit_establishment_data boolean,
  view_billing boolean,
  granted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    nullif(btrim(p.full_name), ''),
    p.email,
    'establishment'::text,
    em.role,
    coalesce(ep.edit_establishment_data, false),
    coalesce(ep.view_billing, false),
    em.created_at
  from public.establishment_memberships em
  join public.profiles p on p.id = em.user_id
  left join public.establishment_permissions ep on ep.establishment_membership_id = em.id
  where em.establishment_id = p_establishment_id
    and public.is_space_member(public.establishment_space_id(p_establishment_id))

  union all

  select
    p.id,
    nullif(btrim(p.full_name), ''),
    p.email,
    'group'::text,
    gm.role,
    -- RN-EST-11 · el propietario global no tiene permisos finos: los tiene
    -- todos por serlo. Se dice con `true`, no con `null`, porque la
    -- pantalla enseña lo que puede hacer, no cómo está guardado.
    true,
    true,
    gm.created_at
  from public.group_memberships gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = (select e.group_id from public.establishments e where e.id = p_establishment_id)
    and public.is_space_member(public.establishment_space_id(p_establishment_id))

  order by 4, 2 nulls last, 3;
$$;

comment on function public.establishment_client_users(uuid) is
  'PRD §15.2 ("responsables") · quién tiene acceso a un restaurante del
   lado cliente, con nombre y correo, para el EQUIPO del espacio. Existe
   porque profiles_select no deja al equipo leer el perfil de un cliente
   —no comparten espacio— y sin ella la pestaña Usuarios de la ficha
   enseñaría uuids. Devuelve cero filas a quien no es miembro del espacio:
   la identidad del equipo nunca viaja hacia el cliente (RN-MSG-02), y
   tampoco la de sus compañeros de restaurante.';

-- Comprueba el permiso en su propio cuerpo (`is_space_member`), así que
-- `authenticated` la ejecuta: es una función de pantalla, no interna
-- (CLAUDE.md). `anon` no: sin sesión no hay espacio del que ser miembro y
-- la respuesta sería siempre vacía, pero dejar abierta por RPC una
-- función que toca `profiles` es una superficie que no hace falta.
revoke all on function public.establishment_client_users(uuid) from public, anon;
grant execute on function public.establishment_client_users(uuid) to authenticated;
