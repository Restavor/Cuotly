-- RN-EST-05 en la pestaña Usuarios: un acceso retirado desaparece.
--
-- `establishment_client_users()` (migración 55) no filtra `revoked_at` en
-- ninguna de sus dos ramas, así que la pestaña Usuarios de la ficha
-- enseñaba a quien tuvo acceso y ya no lo tiene, con su nombre, su correo
-- y sus permisos, exactamente igual que a quien sí lo tiene. RN-EST-05
-- dice lo contrario: "al retirar un acceso desaparece de inmediato, pero
-- la actividad histórica permanece". Lo que permanece es la actividad, no
-- la fila de la lista de accesos.
--
-- No es un fallo de presentación que se pueda tapar en la pantalla: la
-- pantalla pinta lo que le contesta el servidor, y el servidor estaba
-- contestando mal (CLAUDE.md: el cliente nunca es la autoridad). Además
-- `revoke_establishment_access()` existe desde la migración 37 y su
-- efecto no llegaba a verse en la única pantalla que lo enseña — van seis
-- veces que una función del servidor resulta no tener a nadie que la use
-- de verdad, y esta es la variante peor: sí la usaba alguien, y no servía
-- de nada.
--
-- **Cómo apareció.** La cabecera de la migración 55 decía "se comprueba
-- con `supabase/tests/ficha_del_restaurante.sql`" y ese archivo no
-- existía; el ROADMAP lo tenía anotado como la quinta vez que una
-- garantía escrita en un comentario resulta no estar implementada. Al
-- escribir por fin la suite, su primera comprobación —contar las filas de
-- la pestaña— salió en rojo. El fallo llevaba desde el 09/09 en pie.
--
-- Se comprueba con `supabase/tests/ficha_del_restaurante.sql`.

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
    and em.revoked_at is null
    and public.is_space_member(public.establishment_space_id(p_establishment_id))

  union all

  select
    p.id,
    nullif(btrim(p.full_name), ''),
    p.email,
    'group'::text,
    gm.role,
    -- RN-EST-11 · el propietario global no tiene permisos finos: los tiene
    -- todos por serlo.
    true,
    true,
    gm.created_at
  from public.group_memberships gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = (select e.group_id from public.establishments e where e.id = p_establishment_id)
    and gm.revoked_at is null
    and public.is_space_member(public.establishment_space_id(p_establishment_id))

  order by 4, 2 nulls last, 3;
$$;

comment on function public.establishment_client_users(uuid) is
  'PRD §15.2 ("responsables") · quién tiene acceso HOY a un restaurante del
   lado cliente, con nombre y correo, para el EQUIPO del espacio. Existe
   porque profiles_select no deja al equipo leer el perfil de un cliente
   —no comparten espacio— y sin ella la pestaña Usuarios enseñaría uuids.
   Devuelve cero filas a quien no es miembro del espacio: la identidad del
   equipo nunca viaja hacia el cliente (RN-MSG-02), y tampoco la de sus
   compañeros de restaurante. RN-EST-05: un acceso retirado NO sale, ni
   por el restaurante ni por el grupo.';

revoke all on function public.establishment_client_users(uuid) from public, anon;
grant execute on function public.establishment_client_users(uuid) to authenticated;
