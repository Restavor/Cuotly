-- La auditoría sabe clasificar las notas internas.
--
-- La migración 66 escribe dos apuntes nuevos —`establishment_note.created`
-- y `establishment_note.archived`— y `audit_action_capability()` no conoce
-- esa familia, así que hasta ahora devolvía `null` para las dos: en la
-- pantalla de auditoría (HU-36) se caerían del reparto por capacidad y no
-- las vería quien tiene que verlas.
--
-- Va en su propio archivo y no dentro de la 66 porque la 66 ya está
-- aplicada, y una migración aplicada no se toca (CLAUDE.md). Lo detectó el
-- test `audit.test.ts`, que compara el catálogo de `src/core/audit.ts` con
-- lo que la base sabe clasificar: existe justo para que esto no se escape.
--
-- La nota es de la cartera de clientes, igual que el establecimiento al
-- que pertenece: quién escribió una nota sobre este restaurante y cuándo
-- lo ven los mismos que gestionan el restaurante.

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
    -- Las notas internas del restaurante (RN-EST-13, migración 66). El
    -- apunte registra que alguien escribió o archivó una nota; el CUERPO
    -- no está en él, a propósito.
    when 'establishment_note' then 'manage_clients'
    when 'group' then 'manage_clients'
    when 'group_access' then 'manage_clients'
    -- Festivos y cierres del espacio (§125, HU-32).
    when 'holiday' then 'manage_holidays'
    else null
  end;
$$;

revoke all on function public.audit_action_capability(text) from public, anon;
grant execute on function public.audit_action_capability(text) to authenticated;
