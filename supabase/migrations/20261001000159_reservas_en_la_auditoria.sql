-- Fase A de Restavor agents · la auditoría de Reservas (RN-APP-03).
--
-- `reservations.requested` y `reservations.requested_on_behalf` (migración 158)
-- son una familia nueva. Sin clasificar, `audit_action_capability()` devolvía
-- nulo, que NO es "la ve cualquiera" sino "lo decide la fila", y la fila de un
-- apunte con entidad `establishment` no es visible para el equipo: los
-- administradores no habrían visto quién pidió Reservas. Es cartera de clientes,
-- como `create_reservation_request_on_behalf()`.
--
-- Copia viva de la definición vigente con una línea más. Sigue estando dentro de
-- la política de `audit_log`, así que conserva el EXECUTE de `authenticated`.

create or replace function public.audit_action_capability(p_action text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
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
    -- RN-APP-03 (migración 159) · pedir Reservas es cartera de clientes, igual que
    -- crear una solicitud en su nombre (`manage_clients`).
    when 'reservations' then 'manage_clients'
    else null
  end;
$function$;
