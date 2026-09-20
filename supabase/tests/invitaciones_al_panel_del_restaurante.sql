-- ============================================================
-- Suite 61 · Invitaciones al panel del restaurante
--            (PRD RN-ACC-13, RN-PAN-14/15, decisión 59)
-- ============================================================
--
-- Lo que vigila:
--
--   · **Los dos caminos**, y que no los elija quien invita: un correo con
--     cuenta entra en el momento; uno sin cuenta abre una invitación.
--   · **Que la aprobación sea de verdad una barrera.** Una invitación del
--     restaurante nace `pending_review` y su enlace **no se puede gastar**
--     hasta que el equipo la apruebe. Si esto falla, un restaurante crea
--     cuentas de Cuotly por su cuenta, que es justo lo que Bosco quiso
--     controlar.
--   · **Que la del equipo NO pase por aprobación**, porque pedirle al
--     espacio que apruebe lo suyo es una pantalla de más.
--   · **Que los siete días cuenten desde la aprobación**, no desde el
--     envío (RN-PAN-14).
--   · **Que el restaurante no vea quién la revisó** (RN-PAN-15), con el
--     privilegio de columna, no con buena voluntad.
--   · **Que gastar el enlace esté reservado a `service_role`**: es la
--     mitad del servidor de una puerta que crea cuentas.
--
-- Prefijo de esta suite: d0600000-.

begin;

set local role postgres;

-- ------------------------------------------------------------
-- El decorado
-- ------------------------------------------------------------
insert into auth.users (id, email, role, aud) values
  ('d0600000-0000-0000-0000-000000000001', 'duena61@cuotly.test', 'authenticated', 'authenticated'),
  ('d0600000-0000-0000-0000-000000000002', 'admin61@cuotly.test', 'authenticated', 'authenticated'),
  ('d0600000-0000-0000-0000-000000000003', 'duenorest61@cuotly.test', 'authenticated', 'authenticated'),
  -- Ya tiene cuenta: es el que prueba el camino corto.
  ('d0600000-0000-0000-0000-000000000004', 'yaesta61@cuotly.test', 'authenticated', 'authenticated');

-- `nuevo61@cuotly.test` **no está aquí a propósito**: todavía no tiene
-- cuenta, que es la razón de ser de toda la decisión 59. Se crea más
-- abajo, justo antes de gastar el enlace, como haría el servidor después
-- de que el invitado ponga su contraseña.

insert into public.profiles (id, email, full_name) values
  ('d0600000-0000-0000-0000-000000000001', 'duena61@cuotly.test', 'Duena 61'),
  ('d0600000-0000-0000-0000-000000000002', 'admin61@cuotly.test', 'Admin 61'),
  ('d0600000-0000-0000-0000-000000000003', 'duenorest61@cuotly.test', 'Dueno del restaurante 61'),
  ('d0600000-0000-0000-0000-000000000004', 'yaesta61@cuotly.test', 'Ya esta 61')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('d0610000-0000-0000-0000-000000000001', 'Espacio 61', 'espacio-61', 'Europe/Madrid',
   'd0600000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d0610000-0000-0000-0000-000000000001', 'd0600000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d0610000-0000-0000-0000-000000000001', 'd0600000-0000-0000-0000-000000000002', 'admin', 'active');

insert into public.groups (id, space_id, name) values
  ('d0630000-0000-0000-0000-000000000001', 'd0610000-0000-0000-0000-000000000001', 'Grupo 61');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('d0640000-0000-0000-0000-000000000001', 'd0610000-0000-0000-0000-000000000001',
   'd0630000-0000-0000-0000-000000000001', 'EST-61-1', 'Casa Invitacion', 'active');

-- El dueño del restaurante, con "Usuarios y accesos": es quien invita
-- desde dentro del panel (RN-EST-17).
insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('d0650000-0000-0000-0000-000000000001', 'd0640000-0000-0000-0000-000000000001',
   'd0600000-0000-0000-0000-000000000003', 'local_owner');

-- ------------------------------------------------------------
-- RN-PAN-14 · camino 1: el correo YA tiene cuenta
-- ------------------------------------------------------------
--
-- No hay invitación ni aprobación: meter a alguien que ya está dentro de
-- Cuotly nunca necesitó permiso de nadie y sigue sin necesitarlo.
select set_config('request.jwt.claim.sub', 'd0600000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  v_id uuid;
begin
  v_id := public.invite_to_establishment_panel(
    'd0640000-0000-0000-0000-000000000001', 'yaesta61@cuotly.test', 'editor', true, false);

  if v_id is not null then
    raise exception 'RN-PAN-14 FALLA: un correo con cuenta abre una invitación en vez de entrar';
  end if;

  -- Se comprueba como `postgres` a propósito: la RLS de
  -- `establishment_memberships` le esconde a un cliente las membresías de
  -- los demás, así que mirarlo desde su sesión diría "no hay acceso"
  -- cuando el acceso está. Lo que se prueba aquí es lo que pasó en la
  -- base, no lo que ese cliente alcanza a ver.
  set local role postgres;
  if not exists (
    select 1 from public.establishment_memberships
    where establishment_id = 'd0640000-0000-0000-0000-000000000001'
      and user_id = 'd0600000-0000-0000-0000-000000000004'
      and revoked_at is null
  ) then
    raise exception 'RN-PAN-14 FALLA: un correo con cuenta no recibe el acceso en el momento';
  end if;

  if exists (select 1 from public.establishment_invitations
             where lower(email) = 'yaesta61@cuotly.test') then
    raise exception 'RN-PAN-14 FALLA: se guarda una invitación para quien ya tenía cuenta';
  end if;
  set local role authenticated;
end;
$$;

-- ------------------------------------------------------------
-- RN-ACC-13 · camino 2: el restaurante invita a alguien SIN cuenta
-- ------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_inv public.establishment_invitations;
begin
  v_id := public.invite_to_establishment_panel(
    'd0640000-0000-0000-0000-000000000001', 'nuevo61@cuotly.test', 'editor', false, true,
    'idem-61-1');

  if v_id is null then
    raise exception 'RN-ACC-13 FALLA: invitar a alguien sin cuenta no crea invitación';
  end if;

  set local role postgres;
  select * into v_inv from public.establishment_invitations where id = v_id;
  set local role authenticated;

  -- Nace pendiente: la manda el restaurante, así que la mira el equipo.
  if v_inv.status <> 'pending_review' then
    raise exception 'RN-PAN-14 FALLA: la invitación de un restaurante nace en % y no pendiente', v_inv.status;
  end if;

  -- Y **sin caducidad**: los siete días empiezan al aprobar, no al mandar.
  if v_inv.expires_at is not null then
    raise exception 'RN-PAN-14 FALLA: la caducidad empieza a correr antes de que nadie la apruebe';
  end if;

  -- CA-17 · pulsar dos veces devuelve la misma y no manda dos enlaces.
  if public.invite_to_establishment_panel(
       'd0640000-0000-0000-0000-000000000001', 'nuevo61@cuotly.test', 'editor', false, true,
       'idem-61-1') <> v_id then
    raise exception 'CA-17 FALLA: invitar dos veces con la misma clave crea dos invitaciones';
  end if;
end;
$$;
reset role;

-- ------------------------------------------------------------
-- RN-ACC-13 · LA BARRERA: sin aprobar, el enlace no se gasta
-- ------------------------------------------------------------
--
-- Este es el bloque que justifica toda la decisión 59. Si esto pasara, un
-- restaurante crearía cuentas de Cuotly sin que nadie las mirara.
set local role postgres;

-- **La cuenta se crea AQUÍ, antes de la barrera**, y esto no es un detalle
-- de orden: es lo que hace que la prueba de abajo signifique algo.
--
-- La primera versión de esta suite creaba la cuenta después, y entonces
-- gastar una invitación pendiente fallaba por "la cuenta no coincide" en
-- vez de por "no está aprobada" — el test pasaba **por el motivo
-- equivocado**. Se vio quitándole a `consume_establishment_invitation()`
-- la comprobación del estado: la suite seguía en verde con la barrera
-- desmontada. Con la cuenta ya creada, lo único que puede detener el
-- consumo es la aprobación, que es justo lo que se quiere probar.
insert into auth.users (id, email, role, aud) values
  ('d0600000-0000-0000-0000-000000000005', 'nuevo61@cuotly.test', 'authenticated', 'authenticated');
insert into public.profiles (id, email, full_name)
values ('d0600000-0000-0000-0000-000000000005', 'nuevo61@cuotly.test', 'Nuevo 61')
on conflict (id) do update set full_name = excluded.full_name;

do $$
declare
  v_token uuid;
begin
  select token into v_token from public.establishment_invitations
  where lower(email) = 'nuevo61@cuotly.test';

  begin
    perform public.consume_establishment_invitation(v_token, 'd0600000-0000-0000-0000-000000000005');
    raise exception 'RN-ACC-13 FALLA: una invitación SIN APROBAR se puede gastar, y el restaurante crea cuentas por su cuenta'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ACC-13 FALLA%' then raise; end if;
      -- Y falla **por el motivo correcto**. Sin esta línea, cualquier otro
      -- error —una cuenta que no existe, un correo que no cuadra— haría
      -- pasar el test con la barrera quitada.
      if sqlerrm not like '%no está aprobada%' then
        raise exception 'RN-ACC-13 FALLA: gastar una pendiente falla, pero por otra cosa: %', sqlerrm
          using errcode = 'assert_failure';
      end if;
  end;

  -- Y la pantalla pública tampoco enseña el correo de una pendiente: si lo
  -- enseñara, el enlace filtrado sería un comprobador de direcciones.
  if (select email from public.establishment_invitation_details(v_token)) is not null then
    raise exception 'RN-ACC-13 FALLA: el enlace de una invitación pendiente ya enseña el correo';
  end if;
  if (select state from public.establishment_invitation_details(v_token)) <> 'pending_review' then
    raise exception 'RN-ACC-13 FALLA: el enlace de una pendiente no dice que lo está';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-PAN-14 · el equipo la aprueba, y ahí arrancan los siete días
-- ------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'd0600000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid;
  v_inv public.establishment_invitations;
begin
  set local role postgres;
  select id into v_id from public.establishment_invitations
  where lower(email) = 'nuevo61@cuotly.test';
  set local role authenticated;

  -- Un rechazo sin motivo no le dice nada a quien invitó.
  begin
    perform public.review_establishment_invitation(v_id, false, '   ');
    raise exception 'RN-PAN-14 FALLA: se rechaza sin motivo' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PAN-14 FALLA%' then raise; end if;
  end;

  if public.review_establishment_invitation(v_id, true) <> 'approved' then
    raise exception 'RN-PAN-14 FALLA: aprobar no deja la invitación aprobada';
  end if;

  set local role postgres;
  select * into v_inv from public.establishment_invitations where id = v_id;
  set local role authenticated;

  if v_inv.expires_at is null then
    raise exception 'RN-PAN-14 FALLA: aprobar no arranca la caducidad';
  end if;
  -- Siete días desde AHORA, no desde que se mandó.
  if v_inv.expires_at < now() + interval '6 days'
     or v_inv.expires_at > now() + interval '8 days' then
    raise exception 'RN-PAN-14 FALLA: la caducidad no son siete días desde la aprobación';
  end if;

  -- Aprobada ya no se vuelve a aprobar ni se rechaza: es una transición
  -- que la tabla no tiene.
  begin
    perform public.review_establishment_invitation(v_id, false, 'me lo he pensado mejor');
    raise exception 'RN-PAN-14 FALLA: una aprobada se rechaza después' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PAN-14 FALLA%' then raise; end if;
  end;
end;
$$;
reset role;

-- ------------------------------------------------------------
-- RN-PAN-15 · el restaurante no ve quién la revisó
-- ------------------------------------------------------------
--
-- Privilegio de columna, no buena voluntad: RLS filtra filas y no
-- columnas, así que `select reviewed_by` tiene que dar 403 aunque la fila
-- sí se vea.
select set_config('request.jwt.claim.sub', 'd0600000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  v_n integer;
begin
  -- La fila sí la ve: es su restaurante y tiene "Usuarios y accesos".
  select count(*) into v_n from public.establishment_invitations
  where establishment_id = 'd0640000-0000-0000-0000-000000000001';
  if v_n <> 1 then
    raise exception 'RN-PAN-14 FALLA: quien invitó no ve su propia invitación';
  end if;

  begin
    perform reviewed_by from public.establishment_invitations
    where establishment_id = 'd0640000-0000-0000-0000-000000000001';
    raise exception 'RN-PAN-15 FALLA: el restaurante lee quién revisó su invitación'
      using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PAN-15 FALLA%' then raise; end if;
  end;

  -- El token tampoco: es una credencial, y la lista no es un llavero.
  begin
    perform token from public.establishment_invitations
    where establishment_id = 'd0640000-0000-0000-0000-000000000001';
    raise exception 'RN-PAN-15 FALLA: la lista de invitaciones reparte los enlaces'
      using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-PAN-15 FALLA%' then raise; end if;
  end;
end;
$$;
reset role;

-- ------------------------------------------------------------
-- RN-ACC-13 · aprobada, el enlace se gasta y entra en su panel
-- ------------------------------------------------------------
set local role postgres;
do $$
declare
  v_token uuid;
  v_id uuid;
  v_membership uuid;
begin
  select id, token into v_id, v_token from public.establishment_invitations
  where lower(email) = 'nuevo61@cuotly.test';

  -- Ahora sí enseña el correo, para que la pantalla lo ponga prefijado y
  -- bloqueado (RN-ACC-09, misma razón).
  if (select email from public.establishment_invitation_details(v_token)) <> 'nuevo61@cuotly.test' then
    raise exception 'RN-ACC-13 FALLA: una invitación aprobada no enseña el correo que hay que prefijar';
  end if;

  -- Con la cuenta equivocada, no. Falla cerrado: el servidor deshace el
  -- alta y nadie entra en un panel que no es suyo.
  begin
    perform public.consume_establishment_invitation(v_token, 'd0600000-0000-0000-0000-000000000004');
    raise exception 'RN-ACC-13 FALLA: el enlace lo gasta una cuenta que no es la invitada'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ACC-13 FALLA%' then raise; end if;
  end;

  v_membership := public.consume_establishment_invitation(
    v_token, 'd0600000-0000-0000-0000-000000000005');

  if v_membership is null then
    raise exception 'RN-ACC-13 FALLA: gastar el enlace no da acceso';
  end if;

  -- Con el rol y los permisos que se APROBARON, no con los de por omisión.
  if not exists (
    select 1 from public.establishment_memberships m
    join public.establishment_permissions p on p.establishment_membership_id = m.id
    where m.id = v_membership and m.role = 'editor'
      and m.revoked_at is null
      and p.edit_establishment_data = false and p.view_billing = true
  ) then
    raise exception 'RN-ACC-13 FALLA: el acceso no lleva el rol y los permisos aprobados';
  end if;

  if (select status from public.establishment_invitations where id = v_id) <> 'accepted' then
    raise exception 'RN-ACC-13 FALLA: gastar el enlace no marca la invitación como aceptada';
  end if;

  -- De un solo uso. Sin esto, el enlace de un correo reenviado mete a
  -- cualquiera que lo abra.
  begin
    perform public.consume_establishment_invitation(v_token, 'd0600000-0000-0000-0000-000000000005');
    raise exception 'RN-ACC-13 FALLA: el enlace se puede gastar dos veces'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-ACC-13 FALLA%' then raise; end if;
  end;

  -- CLAUDE.md · cada movimiento deja evento y auditoría.
  if (select count(*) from public.state_events
      where entity_type = 'establishment_invitation' and entity_id = v_id) < 3 then
    raise exception 'RN-PAN-14 FALLA: los movimientos de la invitación no dejan eventos de estado';
  end if;
  if not exists (select 1 from public.audit_log
                 where entity_id = v_id and action = 'panel_invitation.accepted') then
    raise exception 'CLAUDE.md FALLA: aceptar una invitación no deja apunte de auditoría';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-PAN-14 · la invitación del EQUIPO nace aprobada
-- ------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'd0600000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_id uuid;
  v_estado text;
begin
  v_id := public.invite_to_establishment_panel(
    'd0640000-0000-0000-0000-000000000001', 'otro61@cuotly.test', 'editor');

  set local role postgres;
  select status into v_estado from public.establishment_invitations where id = v_id;
  set local role authenticated;

  -- Pedirle al espacio que apruebe su propia invitación no es un control,
  -- es una pantalla de más (RN-PAN-14).
  if v_estado <> 'approved' then
    raise exception 'RN-PAN-14 FALLA: la invitación del propio equipo nace en % y espera aprobación suya', v_estado;
  end if;
end;
$$;
reset role;

-- ------------------------------------------------------------
-- RN-EST-17 · invitar no abre ninguna puerta nueva de permisos
-- ------------------------------------------------------------
--
-- Quien no puede dar accesos tampoco puede invitar: si esto fallara, la
-- tercera puerta sería más ancha que la que ya había.
select set_config('request.jwt.claim.sub', 'd0600000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  -- El invitado acaba de entrar como Editor SIN "Usuarios y accesos".
  begin
    perform public.invite_to_establishment_panel(
      'd0640000-0000-0000-0000-000000000001', 'colado61@cuotly.test', 'editor');
    raise exception 'RN-EST-17 FALLA: un Editor sin "Usuarios y accesos" invita a Cuotly'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-EST-17 FALLA%' then raise; end if;
  end;
end;
$$;
reset role;

-- ------------------------------------------------------------
-- CLAUDE.md · gastar el enlace está reservado a `service_role`
-- ------------------------------------------------------------
set local role postgres;
do $$
begin
  if has_function_privilege('authenticated',
       'public.consume_establishment_invitation(uuid, uuid)', 'execute')
     or has_function_privilege('anon',
       'public.consume_establishment_invitation(uuid, uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLA: la función que crea el acceso está abierta por RPC';
  end if;
  if not has_function_privilege('service_role',
       'public.consume_establishment_invitation(uuid, uuid)', 'execute') then
    raise exception 'El servidor no puede gastar el enlace: nadie podría aceptar una invitación';
  end if;

  -- La de la pantalla pública sí, y a propósito: quien la abre todavía no
  -- tiene cuenta.
  if not has_function_privilege('anon',
       'public.establishment_invitation_details(uuid)', 'execute') then
    raise exception 'RN-ACC-13 FALLA: la pantalla de alta no puede leer su propio enlace';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-PAN-14 · las transiciones, una a una
-- ------------------------------------------------------------
do $$
begin
  if not public.establishment_invitation_transition_allowed('pending_review', 'approved', 'team')
     or not public.establishment_invitation_transition_allowed('approved', 'accepted', 'invitee')
     or not public.establishment_invitation_transition_allowed('pending_review', 'cancelled', 'inviter') then
    raise exception 'RN-PAN-14 FALLA: una transición que existe está cerrada';
  end if;

  -- Lo que NO puede pasar, dicho uno a uno.
  if public.establishment_invitation_transition_allowed('pending_review', 'approved', 'inviter') then
    raise exception 'RN-PAN-14 FALLA: quien invita se aprueba a sí mismo';
  end if;
  if public.establishment_invitation_transition_allowed('pending_review', 'accepted', 'invitee') then
    raise exception 'RN-ACC-13 FALLA: se acepta una invitación que nadie ha aprobado';
  end if;
  if public.establishment_invitation_transition_allowed('accepted', 'cancelled', 'team') then
    raise exception 'RN-PAN-14 FALLA: una aceptada se cancela, y eso ya es retirar un acceso';
  end if;
  if public.establishment_invitation_transition_allowed('rejected', 'approved', 'team') then
    raise exception 'RN-PAN-14 FALLA: un rechazo no es final';
  end if;
end;
$$;

rollback;
