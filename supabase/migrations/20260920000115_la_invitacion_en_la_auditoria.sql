-- ============================================================
-- Migración 115 · La invitación al panel, en la auditoría
--                 (RN-ACC-13, RN-PAN-15, decisión 59)
-- ============================================================
--
-- La migración 114 escribe cuatro acciones nuevas de auditoría
-- —`panel_invitation.created`, `.reviewed`, `.cancelled` y `.accepted`—
-- pero **no le dijo a `audit_action_capability()` de quién son**, así que
-- la familia caía en el `else null`.
--
-- Y `null` ahí NO significa "la ve cualquiera": significa **"lo decide la
-- fila"**, es decir, la visibilidad la resuelve `audit_entity_is_visible()`
-- mirando a qué apunta. Para una invitación eso se queda corto por lo
-- mismo que se quedó corto para `establishment_permissions` en la 107: la
-- fila guarda **quién invitó, quién revisó y quién aceptó**, y RN-PAN-15
-- dice que al restaurante no se le enseña quién revisó su invitación.
--
-- **Lo cazó un test de web, no una suite de SQL**, y conviene entender por
-- qué: `audit.test.ts` compara el reparto por familias de
-- `src/core/audit.ts` con el de esta función y falla si se separan. Sin
-- él, la pantalla habría filtrado por `manage_clients` mientras RLS
-- filtraba por la fila — la pantalla más estricta que el servidor, que es
-- la forma silenciosa de este fallo: nadie ve nada raro hasta que alguien
-- consulta por otra vía.
--
-- Lo único que cambia respecto a la 107 es la línea de `panel_invitation`.
-- El resto se copia tal cual.
create or replace function public.audit_action_capability(p_action text)
returns text
language sql
immutable
as $$
  select case split_part(coalesce(p_action, ''), '.', 1)
    when 'space' then 'manage_space'
    when 'membership' then 'manage_space'
    when 'supervision' then 'manage_space'
    when 'plan' then 'manage_space'
    when 'service' then 'manage_space'
    when 'channel' then 'manage_space'
    when 'invitation' then 'invite_member'
    when 'charge' then 'manage_finance'
    when 'payment' then 'manage_finance'
    when 'subscription' then 'manage_finance'
    when 'financial' then 'manage_finance'
    when 'establishment' then 'manage_clients'
    when 'establishment_access' then 'manage_clients'
    when 'establishment_note' then 'manage_clients'
    when 'establishment_permissions' then 'manage_clients'
    when 'establishment_transfer' then 'manage_clients'
    -- RN-ACC-13 (migración 114) · la invitación al panel es cartera de
    -- clientes, como el acceso que acaba creando.
    when 'panel_invitation' then 'manage_clients'
    when 'group' then 'manage_clients'
    when 'group_access' then 'manage_clients'
    when 'holiday' then 'manage_holidays'
    when 'menu_template' then 'manage_clients'
    when 'integration' then 'manage_clients'
    when 'opportunity' then 'manage_clients'
    when 'report' then 'manage_clients'
    when 'cuotly_charge' then 'manage_space'
    when 'cuotly_payment' then 'manage_space'
    when 'support' then 'manage_space'
    else null
  end;
$$;

-- CLAUDE.md · aparece dentro de la política de RLS de `audit_log`, así que
-- `authenticated` conserva su EXECUTE: revocárselo rompería la política en
-- vez de cerrarla.
revoke all on function public.audit_action_capability(text) from public, anon;
grant execute on function public.audit_action_capability(text) to authenticated;
