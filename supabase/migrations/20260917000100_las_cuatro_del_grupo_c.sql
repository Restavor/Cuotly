-- ============================================================
-- Las cuatro del grupo C (PRD §38): transferencia entre espacios,
-- copias de seguridad, canales internos y el recordatorio de vencimiento.
-- ============================================================
--
-- Son las cuatro piezas del diseño que no tenían reglas en ninguna parte y
-- que Bosco decidió en dos tandas: la **43** el qué (17/09/2026) y la **44**
-- el cómo (el mismo día). El §38 del PRD las escribió antes que este
-- archivo, como manda CLAUDE.md, y esto es ese §38 hecho servidor.
--
-- Se comprueba con `supabase/tests/las_cuatro_del_grupo_c.sql`.

-- ============================================================
-- 1 · Transferir un restaurante a otro espacio (RN-TRA)
-- ============================================================
--
-- La operación más delicada de las cuatro, porque mueve la organización
-- interna de un equipo a la casa de otro. Tres cosas la sujetan:
--
--   · **dos firmas** (RN-TRA-02): el origen propone, el destino acepta.
--     Mientras tanto no se mueve nada y el restaurante sigue entero en el
--     origen (RN-TRA-03). No hay ningún estado en el que no sea de nadie;
--   · **el dinero no viaja** (RN-TRA-04) y **con deuda vencida no se
--     transfiere** (RN-TRA-05). Sin la segunda, cambiar de espacio sería
--     una manera de escapar de la deuda, justo lo contrario de RN-FIN-13;
--   · **qué tabla viaja y cuál se queda no se decide de memoria**
--     (RN-TRA-13): las dos listas se declaran aquí y la suite las barre.

create table public.establishment_transfers (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  from_space_id uuid not null references public.spaces (id) on delete cascade,
  to_space_id uuid not null references public.spaces (id) on delete cascade,
  state text not null default 'pending'
    check (state in ('pending', 'accepted', 'rejected', 'withdrawn')),
  reason text,
  proposed_by uuid not null references public.profiles (id),
  proposed_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_reason text,
  -- Un restaurante no se ofrece a dos sitios: dejaría dos aceptaciones
  -- posibles y una carrera por quién pulsa antes (RN-TRA-06).
  constraint establishment_transfers_not_same_space check (from_space_id <> to_space_id)
);

comment on table public.establishment_transfers is
  'RN-TRA · la propuesta de mover un restaurante a otro espacio. El origen
   la propone y el destino la acepta; hasta entonces no se mueve nada.
   Nada se borra: una propuesta retirada o rechazada queda con su
   desenlace, porque "nos ofrecieron un restaurante y dijimos que no" es un
   hecho que se consulta después (RN-TRA-07).';

create unique index establishment_transfers_one_pending
  on public.establishment_transfers (establishment_id) where state = 'pending';

create index establishment_transfers_from_idx on public.establishment_transfers (from_space_id);
create index establishment_transfers_to_idx on public.establishment_transfers (to_space_id);

alter table public.establishment_transfers enable row level security;

-- La ven los dos espacios: el que la propone y el que tiene que decidir.
-- No hay política de escritura: solo las funciones de abajo escriben aquí.
create policy establishment_transfers_select on public.establishment_transfers
for select
using (
  public.is_space_member(from_space_id)
  or public.is_space_member(to_space_id)
);

-- ------------------------------------------------------------
-- Las dos listas de RN-TRA-13
-- ------------------------------------------------------------
--
-- `establishment_transfer_tables()` clasifica **toda** tabla que tenga a la
-- vez `space_id` y `establishment_id`. Devolverlas desde una función y no
-- desde una constante escrita en el cuerpo del `update` permite que la
-- suite las lea y compruebe que no falta ninguna: una tabla nueva sin
-- clasificar pone el test rojo, que es lo contrario de descubrirlo el día
-- que un restaurante se transfiera de verdad.
--
-- Lo que SE QUEDA es lo que el origen cobró o consumió, más su propio
-- libro: dinero (RN-TRA-04), plan y ciclos de consumo, aceptaciones de sus
-- condiciones, exportaciones suyas y los avisos que recibió su equipo.
create or replace function public.establishment_transfer_tables()
returns table (table_name text, travels boolean)
language sql
immutable
as $$
  select * from (values
    -- Viaja: el trabajo del restaurante.
    ('requests', true), ('request_attachments', true),
    ('jobs', true), ('tasks', true), ('corrections', true),
    ('conversations', true), ('files', true),
    ('menus', true), ('menu_templates', true), ('menu_publications', true),
    ('menu_corrections', true), ('menu_downloads', true),
    ('integrations', true), ('metric_points', true), ('sync_runs', true),
    ('opportunities', true), ('opportunity_detections', true), ('opportunity_notes', true),
    ('reports', true),
    ('establishment_notes', true), ('internal_notes', true),
    -- Se queda: el dinero y el plan que cobró el origen (RN-TRA-04),
    -- sus ciclos de consumo (RN-TRA-12), lo que se le aceptó a él y los
    -- avisos que recibió su equipo.
    ('charges', false), ('payments', false), ('receipts', false),
    ('financial_entries', false), ('quotes', false),
    ('subscriptions', false), ('plan_commitments', false), ('scheduled_plan_changes', false),
    ('consumption_cycles', false), ('consumption_entries', false),
    ('menu_update_cycles', false), ('menu_update_entries', false),
    ('acceptances', false), ('terms_acceptances', false),
    ('space_exports', false), ('notifications', false),
    -- Las copias son del espacio que las hizo: llevan dentro material de
    -- SU equipo —conversaciones internas incluidas— y quien lo generó
    -- responde de ello. El destino empieza a hacer las suyas al día
    -- siguiente, con el barrido de RN-BCK-02.
    ('establishment_backups', false),
    -- Se queda y además se retira: RN-TRA-08, el acceso del EQUIPO de
    -- origen no significa nada en otro espacio, y dejarlo vivo sería una
    -- puerta abierta a un restaurante que ya no es suyo.
    ('worker_establishments', false)
  ) as t(table_name, travels);
$$;

comment on function public.establishment_transfer_tables() is
  'RN-TRA-13 · qué viaja y qué se queda, declarado en un sitio para que la
   suite pueda barrerlo. Solo cubre las tablas con `space_id` Y
   `establishment_id`; las que llegan al restaurante por un padre están en
   `establishment_transfer_child_tables()`.';

-- Las que no tienen `establishment_id` y llegan por su padre. Cada una dice
-- de quién cuelga, y el movimiento es el de su padre: si viaja el padre,
-- viaja el hijo.
create or replace function public.establishment_transfer_child_tables()
returns table (table_name text, parent_column text, parent_table text)
language sql
immutable
as $$
  select * from (values
    ('request_versions', 'request_id', 'requests'),
    ('classifications', 'request_id', 'requests'),
    ('assignments', 'job_id', 'jobs'),
    ('blocks', 'job_id', 'jobs'),
    ('task_reassignment_requests', 'task_id', 'tasks'),
    ('messages', 'conversation_id', 'conversations'),
    ('message_edits', 'message_id', 'messages'),
    ('conversation_reads', 'conversation_id', 'conversations'),
    ('file_versions', 'file_id', 'files'),
    ('file_links', 'file_id', 'files'),
    ('menu_versions', 'menu_id', 'menus'),
    ('menu_events', 'menu_id', 'menus'),
    ('report_versions', 'report_id', 'reports'),
    ('report_sections', 'report_id', 'reports'),
    ('report_deliveries', 'report_id', 'reports'),
    ('integration_credentials', 'integration_id', 'integrations')
  ) as t(table_name, parent_column, parent_table);
$$;

comment on function public.establishment_transfer_child_tables() is
  'RN-TRA-13 · las tablas que llegan al restaurante por su padre. Viajan
   con él, y en este orden: `message_edits` va detrás de `messages` porque
   cuelga de una fila que la pasada anterior acaba de mover.';

-- `state_events` y `timer_events` no cuelgan de una columna con clave
-- ajena: guardan `entity_type` + `entity_id`, que es una referencia a mano
-- a cinco tablas distintas. Se mueven aparte, y solo las entidades del
-- restaurante que viaja: los eventos de `space` son del espacio y se
-- quedan, igual que la auditoría (RN-TRA-11).
create or replace function public.establishment_transfer_entity_tables()
returns table (table_name text)
language sql
immutable
as $$
  select * from (values ('state_events'), ('timer_events')) as t(table_name);
$$;

-- ------------------------------------------------------------
-- Proponer, retirar, rechazar y aceptar
-- ------------------------------------------------------------
--
-- Quién propone y quién acepta: el **propietario** de cada espacio
-- (RN-TRA-02). No `manage_clients`: un administrador administra clientes
-- dentro del espacio, y esto saca uno del espacio entero. Es la misma
-- altura que transferir la propiedad del espacio.
create or replace function public.space_owner_is_me(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_memberships sm
    where sm.space_id = p_space_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
      and sm.role = 'owner'
  );
$$;

comment on function public.space_owner_is_me(uuid) is
  'RN-TRA-02 · si quien llama es el propietario de ese espacio. Existe
   porque la transferencia es la única operación que necesita esa
   pregunta suelta, sin capacidad de por medio.';

revoke all on function public.space_owner_is_me(uuid) from public, anon;
grant execute on function public.space_owner_is_me(uuid) to authenticated;

-- La deuda vencida, sumada del libro y sin exigir visibilidad financiera a
-- quien pregunta.
--
-- Existe porque `establishment_has_overdue_debt()` llama por dentro a
-- `charge_outstanding_cents()`, que exige `can_read_establishment_finance()`
-- — y las dos personas que tienen que consultarla aquí no la tienen: el
-- propietario del espacio de DESTINO mira un restaurante que todavía no es
-- suyo, y el barrido de la cola no es nadie. Con la función de siempre, la
-- guarda de RN-TRA-05 lanzaba "no tienes visibilidad financiera" en vez de
-- contestar, que es peor que dejar pasar: parece un problema de permisos
-- cuando lo que hay es una deuda.
--
-- Es la MISMA suma —`financial_entries` del cobro, RN-FIN-02— y está
-- reservada: quien la llama ya ha comprobado quién es.
create or replace function public.establishment_has_overdue_debt_internal(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.charges c
    where c.establishment_id = p_establishment_id
      and now() > c.due_at
      and (select coalesce(sum(fe.amount_cents), 0)
           from public.financial_entries fe where fe.charge_id = c.id) > 0
  );
$$;

comment on function public.establishment_has_overdue_debt_internal(uuid) is
  'RN-TRA-05 · la deuda vencida sin pedirle visibilidad financiera a quien
   pregunta, para el destino de una transferencia y para la cola. Misma
   suma que `charge_outstanding_cents()`, sin su comprobación.';

revoke all on function public.establishment_has_overdue_debt_internal(uuid)
  from public, anon, authenticated;

create or replace function public.propose_establishment_transfer(
  p_establishment_id uuid,
  p_to_space_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_space_id uuid;
  v_status text;
  v_transfer_id uuid;
begin
  select space_id, status into v_from_space_id, v_status
  from public.establishments where id = p_establishment_id for update;

  if v_from_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  if not public.space_owner_is_me(v_from_space_id) then
    raise exception 'Solo el propietario del espacio puede proponer una transferencia';
  end if;

  if p_to_space_id = v_from_space_id then
    raise exception 'El restaurante ya está en ese espacio';
  end if;

  if not exists (select 1 from public.spaces where id = p_to_space_id) then
    raise exception 'El espacio de destino no existe';
  end if;

  -- RN-TRA-05 · con deuda vencida no se transfiere. Sin esto, cambiar de
  -- espacio sería la manera de escapar de la deuda, y existe la guarda
  -- contraria: de una parada por impago se sale cobrando (RN-FIN-13).
  if public.establishment_has_overdue_debt_internal(p_establishment_id) then
    raise exception 'Este restaurante tiene deuda vencida: primero se cobra, y después se transfiere';
  end if;

  -- Lo que ya no tiene servicio no se ofrece: transferir un archivado es
  -- mandar a otro sitio algo que no está en marcha.
  if v_status = 'archived' then
    raise exception 'Un restaurante archivado no se transfiere: reactívalo primero';
  end if;

  -- RN-TRA-06 · una propuesta viva por restaurante. Se dice en vez de
  -- dejar que reviente el índice único con un mensaje de PostgreSQL.
  if exists (
    select 1 from public.establishment_transfers
    where establishment_id = p_establishment_id and state = 'pending'
  ) then
    raise exception 'Este restaurante ya tiene una propuesta de transferencia abierta: retírala antes de hacer otra';
  end if;

  insert into public.establishment_transfers
    (establishment_id, from_space_id, to_space_id, reason, proposed_by)
  values (p_establishment_id, v_from_space_id, p_to_space_id, nullif(btrim(p_reason), ''), auth.uid())
  returning id into v_transfer_id;

  -- RN-TRA-09 · en los dos espacios. El destino tiene que poder leer en su
  -- propio libro que le han ofrecido un restaurante, no solo verlo en una
  -- pantalla.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values
    (v_from_space_id, auth.uid(), 'establishment_transfer.proposed', 'establishment', p_establishment_id,
     jsonb_build_object('transfer_id', v_transfer_id, 'to_space_id', p_to_space_id), nullif(btrim(p_reason), '')),
    (p_to_space_id, auth.uid(), 'establishment_transfer.proposed', 'establishment', p_establishment_id,
     jsonb_build_object('transfer_id', v_transfer_id, 'from_space_id', v_from_space_id), nullif(btrim(p_reason), ''));

  return v_transfer_id;
end;
$$;

comment on function public.propose_establishment_transfer(uuid, uuid, text) is
  'RN-TRA-02 · el propietario del origen propone. No mueve nada: mientras
   la propuesta está abierta el restaurante sigue entero en el origen
   (RN-TRA-03).';

revoke all on function public.propose_establishment_transfer(uuid, uuid, text) from public, anon;
grant execute on function public.propose_establishment_transfer(uuid, uuid, text) to authenticated;

create or replace function public.withdraw_establishment_transfer(
  p_transfer_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.establishment_transfers;
begin
  select * into v_t from public.establishment_transfers where id = p_transfer_id for update;
  if v_t.id is null then
    raise exception 'Propuesta no encontrada';
  end if;

  if not public.space_owner_is_me(v_t.from_space_id) then
    raise exception 'Solo quien la propuso puede retirarla';
  end if;

  -- CA-17 · retirarla dos veces no hace nada la segunda.
  if v_t.state = 'withdrawn' then
    return;
  end if;

  if v_t.state <> 'pending' then
    raise exception 'Esta propuesta ya está %', v_t.state;
  end if;

  update public.establishment_transfers
  set state = 'withdrawn', decided_by = auth.uid(), decided_at = now(),
      decision_reason = nullif(btrim(p_reason), '')
  where id = p_transfer_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values
    (v_t.from_space_id, auth.uid(), 'establishment_transfer.withdrawn', 'establishment', v_t.establishment_id,
     jsonb_build_object('state', 'pending'), jsonb_build_object('state', 'withdrawn'), nullif(btrim(p_reason), '')),
    (v_t.to_space_id, auth.uid(), 'establishment_transfer.withdrawn', 'establishment', v_t.establishment_id,
     jsonb_build_object('state', 'pending'), jsonb_build_object('state', 'withdrawn'), nullif(btrim(p_reason), ''));
end;
$$;

revoke all on function public.withdraw_establishment_transfer(uuid, text) from public, anon;
grant execute on function public.withdraw_establishment_transfer(uuid, text) to authenticated;

create or replace function public.reject_establishment_transfer(
  p_transfer_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.establishment_transfers;
begin
  select * into v_t from public.establishment_transfers where id = p_transfer_id for update;
  if v_t.id is null then
    raise exception 'Propuesta no encontrada';
  end if;

  if not public.space_owner_is_me(v_t.to_space_id) then
    raise exception 'Solo el propietario del espacio de destino puede rechazarla';
  end if;

  if v_t.state = 'rejected' then
    return;
  end if;

  if v_t.state <> 'pending' then
    raise exception 'Esta propuesta ya está %', v_t.state;
  end if;

  update public.establishment_transfers
  set state = 'rejected', decided_by = auth.uid(), decided_at = now(),
      decision_reason = nullif(btrim(p_reason), '')
  where id = p_transfer_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values
    (v_t.from_space_id, auth.uid(), 'establishment_transfer.rejected', 'establishment', v_t.establishment_id,
     jsonb_build_object('state', 'pending'), jsonb_build_object('state', 'rejected'), nullif(btrim(p_reason), '')),
    (v_t.to_space_id, auth.uid(), 'establishment_transfer.rejected', 'establishment', v_t.establishment_id,
     jsonb_build_object('state', 'pending'), jsonb_build_object('state', 'rejected'), nullif(btrim(p_reason), ''));
end;
$$;

revoke all on function public.reject_establishment_transfer(uuid, text) from public, anon;
grant execute on function public.reject_establishment_transfer(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- Aceptar: la única que mueve algo
-- ------------------------------------------------------------
--
-- El movimiento se hace con SQL dinámico sobre las listas declaradas
-- arriba, y no con treinta `update` escritos a mano, por un motivo que no
-- es la elegancia: una tabla nueva con `space_id` y `establishment_id`
-- aparece cada pocos hitos, y treinta `update` a mano son treinta sitios
-- donde nadie se acuerda de añadir el trigésimo primero. Con la lista
-- declarada, la suite barre `information_schema` y falla si alguna tabla
-- no está clasificada (RN-TRA-13).
--
-- Todo dentro de una transacción, que es lo que ya son las funciones de
-- PostgreSQL: o se mueve entero o no se mueve nada. Un restaurante a
-- medio transferir sería la peor fila de esta base de datos.
create or replace function public.accept_establishment_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.establishment_transfers;
  v_tabla record;
  v_group_name text;
  v_new_group_id uuid;
  v_sql text;
begin
  select * into v_t from public.establishment_transfers where id = p_transfer_id for update;
  if v_t.id is null then
    raise exception 'Propuesta no encontrada';
  end if;

  if not public.space_owner_is_me(v_t.to_space_id) then
    raise exception 'Solo el propietario del espacio de destino puede aceptarla';
  end if;

  -- CA-17 · aceptarla dos veces no mueve nada la segunda.
  if v_t.state = 'accepted' then
    return;
  end if;

  if v_t.state <> 'pending' then
    raise exception 'Esta propuesta ya está %', v_t.state;
  end if;

  -- El restaurante sigue donde estaba (RN-TRA-03), así que se vuelve a
  -- comprobar aquí: entre proponer y aceptar puede haber pasado una
  -- mensualidad sin pagar.
  if public.establishment_has_overdue_debt_internal(v_t.establishment_id) then
    raise exception 'Este restaurante tiene deuda vencida: no se puede aceptar la transferencia hasta que se cobre';
  end if;

  if (select space_id from public.establishments where id = v_t.establishment_id) <> v_t.from_space_id then
    raise exception 'El restaurante ya no está en el espacio que lo ofreció';
  end if;

  -- RN-TRA-10 · un grupo no se parte. El restaurante llega a un grupo del
  -- DESTINO con el mismo nombre, que se crea si no lo había. El grupo de
  -- origen se queda con los que no se movieron.
  select g.name into v_group_name
  from public.groups g
  join public.establishments e on e.group_id = g.id
  where e.id = v_t.establishment_id;

  select id into v_new_group_id
  from public.groups
  where space_id = v_t.to_space_id and lower(btrim(name)) = lower(btrim(coalesce(v_group_name, '')))
  limit 1;

  if v_new_group_id is null then
    insert into public.groups (space_id, name)
    values (v_t.to_space_id, coalesce(nullif(btrim(v_group_name), ''), 'Sin grupo'))
    returning id into v_new_group_id;
  end if;

  -- 1 · las tablas que tienen `establishment_id` y viajan.
  for v_tabla in
    select t.table_name from public.establishment_transfer_tables() t where t.travels
  loop
    v_sql := format(
      'update public.%I set space_id = $1 where establishment_id = $2 and space_id = $3',
      v_tabla.table_name);
    execute v_sql using v_t.to_space_id, v_t.establishment_id, v_t.from_space_id;
  end loop;

  -- 2 · las que llegan por su padre. El orden de la lista importa: un hijo
  -- se mueve mirando a un padre que la pasada anterior ya movió.
  for v_tabla in
    select c.table_name, c.parent_column, c.parent_table
    from public.establishment_transfer_child_tables() c
  loop
    v_sql := format(
      'update public.%I h set space_id = $1 where h.space_id = $2 and exists (
         select 1 from public.%I p where p.id = h.%I and p.space_id = $1)',
      v_tabla.table_name, v_tabla.parent_table, v_tabla.parent_column);
    execute v_sql using v_t.to_space_id, v_t.from_space_id;
  end loop;

  -- 3 · las que guardan `entity_type` + `entity_id` a mano. Solo las
  -- entidades que acaban de viajar: un evento de `space` es del espacio.
  for v_tabla in select e.table_name from public.establishment_transfer_entity_tables() e
  loop
    v_sql := format($f$
      update public.%I ev set space_id = $1
      where ev.space_id = $2 and (
        (ev.entity_type = 'job' and exists (select 1 from public.jobs j where j.id = ev.entity_id and j.space_id = $1))
        or (ev.entity_type = 'task' and exists (select 1 from public.tasks t where t.id = ev.entity_id and t.space_id = $1))
        or (ev.entity_type = 'request' and exists (select 1 from public.requests r where r.id = ev.entity_id and r.space_id = $1))
        or (ev.entity_type = 'establishment' and ev.entity_id = $3)
        or (ev.entity_type = 'opportunity' and exists (select 1 from public.opportunities o where o.id = ev.entity_id and o.space_id = $1))
        or (ev.entity_type = 'report' and exists (select 1 from public.reports rp where rp.id = ev.entity_id and rp.space_id = $1))
      )$f$, v_tabla.table_name);
    execute v_sql using v_t.to_space_id, v_t.from_space_id, v_t.establishment_id;
  end loop;

  -- 4 · RN-TRA-08 · el acceso del EQUIPO de origen se retira. No se borra
  -- —no se borra nada—, se marca retirado: dejarlo vivo sería una puerta
  -- abierta a un restaurante que ya no es de ese espacio.
  update public.worker_establishments
  set revoked_at = now(), revoked_by = auth.uid()
  where establishment_id = v_t.establishment_id
    and space_id = v_t.from_space_id
    and revoked_at is null;

  -- 5 · y el restaurante. Va el último a propósito: los pasos 1 a 3 miran
  -- `space_id` para saber qué mover, y moverlo antes les quitaría la
  -- referencia con la que distinguen lo suyo.
  perform set_config('cuotly.status_change', 'on', true);
  update public.establishments
  set space_id = v_t.to_space_id, group_id = v_new_group_id
  where id = v_t.establishment_id;
  perform set_config('cuotly.status_change', 'off', true);

  update public.establishment_transfers
  set state = 'accepted', decided_by = auth.uid(), decided_at = now()
  where id = p_transfer_id;

  -- RN-TRA-09 · el apunte en los dos libros. El del destino es el primero
  -- de la historia de ese restaurante ahí, y dice de dónde vino: es lo que
  -- explica por qué aparece con años de trabajo dentro (RN-TRA-11).
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values
    (v_t.from_space_id, auth.uid(), 'establishment_transfer.accepted', 'establishment', v_t.establishment_id,
     jsonb_build_object('space_id', v_t.from_space_id),
     jsonb_build_object('space_id', v_t.to_space_id, 'transfer_id', p_transfer_id), v_t.reason),
    (v_t.to_space_id, auth.uid(), 'establishment_transfer.accepted', 'establishment', v_t.establishment_id,
     jsonb_build_object('space_id', v_t.from_space_id),
     jsonb_build_object('space_id', v_t.to_space_id, 'transfer_id', p_transfer_id), v_t.reason);
end;
$$;

comment on function public.accept_establishment_transfer(uuid) is
  'RN-TRA · el destino acepta y el restaurante se mueve entero, en una sola
   transacción. Viaja su trabajo; se quedan el dinero del origen
   (RN-TRA-04), sus ciclos de consumo (RN-TRA-12) y su libro de auditoría
   (RN-TRA-11). El acceso del equipo de origen se retira (RN-TRA-08).';

revoke all on function public.accept_establishment_transfer(uuid) from public, anon;
grant execute on function public.accept_establishment_transfer(uuid) to authenticated;

-- ============================================================
-- 2 · Copias de seguridad del contenido del restaurante (RN-BCK)
-- ============================================================
--
-- Una al día, se guardan treinta (RN-BCK-02), y la treinta y uno
-- desaparece: **es el único borrado físico que este producto admite**
-- (RN-BCK-03), y se admite porque una copia no es un registro de negocio,
-- es una foto de él y el registro sigue donde estaba.
--
-- "Restaurar" es descargar, y lo aplica el equipo a mano (RN-BCK-04).
-- Cuotly no deshace nada, y la razón no es pereza: reponer los datos de
-- una fecha anterior machacaría apuntes de auditoría, consumos y cobros
-- posteriores, y este producto entero está construido sobre libros que no
-- se reescriben. **No hay función de restaurar en esta migración**, y eso
-- es el diseño, no una pieza que falte.

create table public.establishment_backups (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  taken_at timestamptz not null default now(),
  -- Lo que hay dentro de Cuotly (RN-BCK-01), en un documento. Los bytes de
  -- los archivos NO están aquí (RN-BCK-09): está su inventario.
  content jsonb not null,
  size_bytes bigint not null,
  -- Para poder decir en una línea qué lleva dentro sin abrir el documento.
  item_counts jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id)
);

comment on table public.establishment_backups is
  'RN-BCK · una copia del contenido que Cuotly guarda de un restaurante.
   Lleva el inventario de los archivos, no sus bytes (RN-BCK-09).
   Se guardan treinta (RN-BCK-02) y la treinta y uno se borra de verdad
   (RN-BCK-03): es la única fila de esta base que se borra, y se puede
   porque una copia no es un registro de negocio.';

create index establishment_backups_est_idx
  on public.establishment_backups (establishment_id, taken_at desc);

alter table public.establishment_backups enable row level security;

-- RN-BCK-07 · una copia es una herramienta de administración y lleva
-- dentro material del espacio. El restaurante tiene su exportación (§141).
create policy establishment_backups_select on public.establishment_backups
for select
using (public.has_capability(space_id, 'manage_clients'));

-- RN-BCK-06 · descargar una copia queda registrado. Una copia lleva dentro
-- todo lo del restaurante, así que quién se la llevó es exactamente el
-- dato que hará falta el día que haya que preguntarlo.
create table public.establishment_backup_downloads (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  backup_id uuid not null references public.establishment_backups (id) on delete cascade,
  downloaded_by uuid not null references public.profiles (id),
  downloaded_at timestamptz not null default now()
);

alter table public.establishment_backup_downloads enable row level security;

create policy establishment_backup_downloads_select on public.establishment_backup_downloads
for select
using (public.has_capability(space_id, 'manage_clients'));

comment on table public.establishment_backup_downloads is
  'RN-BCK-06 · quién se llevó una copia y cuándo.';

-- El cuerpo: no comprueba permisos porque lo llama el barrido de la cola,
-- que no es miembro de ningún espacio. La puerta pública está debajo.
create or replace function public.create_establishment_backup_internal(
  p_establishment_id uuid,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_content jsonb;
  v_counts jsonb;
  v_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  -- RN-BCK-01 · lo que hay DENTRO de Cuotly. La web no: Cuotly no la aloja
  -- y respaldarla habría significado conectarse a donde esté alojada.
  select jsonb_build_object(
    'version', 1,
    'taken_at', now(),
    'establishment', (
      select to_jsonb(e) from public.establishments e where e.id = p_establishment_id),
    'requests', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.requests r where r.establishment_id = p_establishment_id), '[]'::jsonb),
    'menus', coalesce((
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object('versions', coalesce((
          select jsonb_agg(to_jsonb(mv) order by mv.version)
          from public.menu_versions mv where mv.menu_id = m.id), '[]'::jsonb))
        order by m.target_date)
      from public.menus m where m.establishment_id = p_establishment_id), '[]'::jsonb),
    -- RN-BCK-09 · el INVENTARIO de los archivos, no los archivos. Duplicar
    -- los bytes doblaría el almacenamiento que el espacio paga (RN-SUB-13)
    -- y crearía copias fuera de `can_read_file()`.
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'category', f.category,
        'visibility', f.visibility, 'created_at', f.created_at,
        'archived_at', f.archived_at)
        order by f.created_at)
      from public.files f where f.establishment_id = p_establishment_id), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'type', c.type,
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', msg.id, 'body', msg.body, 'created_at', msg.created_at,
            'sender_role', msg.sender_role)
            order by msg.created_at)
          from public.messages msg where msg.conversation_id = c.id), '[]'::jsonb)))
      from public.conversations c
      where public.conversation_establishment_id(c.id) = p_establishment_id), '[]'::jsonb)
  ) into v_content;

  select jsonb_build_object(
    'requests', jsonb_array_length(v_content -> 'requests'),
    'menus', jsonb_array_length(v_content -> 'menus'),
    'files', jsonb_array_length(v_content -> 'files'),
    'conversations', jsonb_array_length(v_content -> 'conversations')
  ) into v_counts;

  insert into public.establishment_backups
    (space_id, establishment_id, content, size_bytes, item_counts, created_by)
  values
    (v_space_id, p_establishment_id, v_content,
     length(v_content::text), v_counts, p_created_by)
  returning id into v_id;

  -- RN-BCK-03 · se guardan treinta. La treinta y uno se borra de verdad,
  -- y es la única fila de esta base que se borra: una copia no es un
  -- registro de negocio, es una foto de él.
  delete from public.establishment_backups
  where establishment_id = p_establishment_id
    and id not in (
      select b.id from public.establishment_backups b
      where b.establishment_id = p_establishment_id
      order by b.taken_at desc
      limit 30
    );

  return v_id;
end;
$$;

revoke all on function public.create_establishment_backup_internal(uuid, uuid)
  from public, anon, authenticated;

comment on function public.create_establishment_backup_internal(uuid, uuid) is
  'El cuerpo de la copia, sin comprobación de permisos, para que lo pueda
   llamar el barrido de la cola, que no es miembro de ningún espacio.';

create or replace function public.create_establishment_backup(p_establishment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo quien gestiona clientes puede generar una copia de seguridad';
  end if;

  return public.create_establishment_backup_internal(p_establishment_id, auth.uid());
end;
$$;

revoke all on function public.create_establishment_backup(uuid) from public, anon;
grant execute on function public.create_establishment_backup(uuid) to authenticated;

-- RN-BCK-05 y RN-BCK-06 · descargar una copia comprueba el permiso, deja
-- el apunte y devuelve el contenido. Que devuelva el documento y no un
-- enlace es la diferencia con un archivo: una copia no vive en Storage,
-- vive en esta tabla, así que el "enlace firmado" de RN-ARC-08 lo pone la
-- ruta de la aplicación al servirlo.
create or replace function public.download_establishment_backup(p_backup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_content jsonb;
begin
  select space_id, content into v_space_id, v_content
  from public.establishment_backups where id = p_backup_id;

  if v_space_id is null then
    raise exception 'Copia no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No tienes permiso para descargar esta copia';
  end if;

  insert into public.establishment_backup_downloads (space_id, backup_id, downloaded_by)
  values (v_space_id, p_backup_id, auth.uid());

  return v_content;
end;
$$;

revoke all on function public.download_establishment_backup(uuid) from public, anon;
grant execute on function public.download_establishment_backup(uuid) to authenticated;

-- El barrido diario (RN-BCK-02). Un restaurante archivado no se respalda:
-- no cambia, y treinta copias iguales no son treinta copias.
create or replace function public.run_backup_sweep(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_est uuid;
  v_hechas integer := 0;
begin
  for v_est in
    select e.id from public.establishments e
    where e.space_id = p_space_id and e.status <> 'archived'
  loop
    begin
      -- Una al día: si ya hay una de hoy, no se hace otra. Es idempotente
      -- por el mismo motivo que todo lo demás — que la cola se ejecute dos
      -- veces no puede duplicar el efecto (CA-17).
      if not exists (
        select 1 from public.establishment_backups b
        where b.establishment_id = v_est and b.taken_at >= date_trunc('day', now())
      ) then
        perform public.create_establishment_backup_internal(v_est, null);
        v_hechas := v_hechas + 1;
      end if;
    exception when others then
      -- Un restaurante que falle no puede dejar sin copia a los demás.
      null;
    end;
  end loop;

  return v_hechas;
end;
$$;

revoke all on function public.run_backup_sweep(uuid) from public, anon, authenticated;

-- ============================================================
-- 3 · Canales de mensajería interna del espacio (RN-CAN)
-- ============================================================
--
-- `conversations.type` era un CHECK cerrado de tres valores y quién lee
-- cada una lo decidía `can_read_conversation()` a partir de la solicitud,
-- el trabajo o el restaurante del que cuelga. **Un canal no cuelga de
-- ninguno de los tres**: es una cuarta cosa, del espacio, con su propia
-- lista de miembros (RN-CAN-01).
--
-- Se amplía el CHECK con una migración nueva, que es lo que la 25 dejó
-- dicho que había que hacer y nunca editando aquella.

alter table public.conversations drop constraint conversations_type_check;
alter table public.conversations drop constraint conversations_owner_by_type;

alter table public.conversations
  add column name text,
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id),
  add constraint conversations_type_check
    check (type in ('request', 'job_internal', 'establishment', 'channel')),
  add constraint conversations_owner_by_type check (
    (type = 'request' and request_id is not null and job_id is null and establishment_id is null)
    or (type = 'job_internal' and job_id is not null and request_id is null and establishment_id is null)
    or (type = 'establishment' and establishment_id is not null and request_id is null and job_id is null)
    -- Un canal no apunta a nada: su dueño es el espacio, y su nombre es
    -- obligatorio porque es lo único que lo distingue de los demás.
    or (type = 'channel' and request_id is null and job_id is null and establishment_id is null
        and name is not null and btrim(name) <> '')
  );

create table public.channel_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id)
);

comment on table public.channel_members is
  'RN-CAN-01 · quién entra en un canal, elegido a mano. Es la ÚNICA llave:
   un canal sin miembros no lo lee nadie, ni siquiera quien lo creó
   (RN-CAN-07), y eso no es un caso raro que evitar sino la consecuencia
   correcta de que la lista mande.';

-- La unicidad es de los vivos: se puede sacar a alguien y volver a
-- meterlo, y las dos cosas quedan.
create unique index channel_members_live_key
  on public.channel_members (conversation_id, user_id) where revoked_at is null;

create index channel_members_user_idx on public.channel_members (user_id) where revoked_at is null;

alter table public.channel_members enable row level security;

create policy channel_members_select on public.channel_members
for select
using (public.is_space_member(space_id));

create or replace function public.is_channel_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.channel_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid()
      and cm.revoked_at is null
  );
$$;

comment on function public.is_channel_member(uuid) is
  'RN-CAN-02 y RN-CAN-07 · la única llave de un canal. Aparece dentro de
   `can_read_conversation()`, que está en políticas de RLS, así que
   conserva EXECUTE de `authenticated` (CLAUDE.md, la excepción).';

revoke all on function public.is_channel_member(uuid) from public, anon;
grant execute on function public.is_channel_member(uuid) to authenticated;

-- `can_read_conversation()` aprende el cuarto tipo. El cliente no entra
-- NUNCA (RN-CAN-02): la barrera es `is_space_member()`, igual que en la
-- conversación interna de trabajo, y encima la lista de miembros.
--
-- Ojo a lo que NO se hace: la capacidad `manage_requests` abre las otras
-- tres conversaciones y **no abre un canal**. Un administrador no lee un
-- canal del que no es miembro, y es a propósito: si la lista de miembros
-- se saltara con una capacidad, dejaría de ser la llave y pasaría a ser
-- una sugerencia.
create or replace function public.can_read_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
  v_space_id uuid;
  v_job_id uuid;
  v_establishment_id uuid;
begin
  select c.type, c.space_id, c.job_id into v_type, v_space_id, v_job_id
  from public.conversations c where c.id = p_conversation_id;

  if v_type is null then
    return false;
  end if;

  if v_type = 'channel' then
    return public.is_space_member(v_space_id) and public.is_channel_member(p_conversation_id);
  end if;

  if public.has_capability(v_space_id, 'manage_requests') then
    return true;
  end if;

  if v_type = 'job_internal' then
    return public.is_space_member(v_space_id) and public.can_read_job(v_job_id);
  end if;

  v_establishment_id := public.conversation_establishment_id(p_conversation_id);

  return public.can_read_establishment_as_client(v_establishment_id)
    or public.is_authorized_worker_establishment(v_establishment_id);
end;
$$;

-- `can_write_conversation()` sigue la misma regla: en un canal escribe
-- quien lo lee. No hay rol de solo lectura dentro de un canal — el rol de
-- Consulta de RN-MSG-05 es del lado cliente, y el cliente no entra aquí.
create or replace function public.can_write_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
  v_space_id uuid;
  v_establishment_id uuid;
  v_archived timestamptz;
begin
  select c.type, c.space_id, c.archived_at into v_type, v_space_id, v_archived
  from public.conversations c where c.id = p_conversation_id;

  if v_type is null then
    return false;
  end if;

  if v_type = 'channel' then
    -- RN-CAN-05 · un canal archivado se lee y no se escribe: lo que se
    -- dijo dentro se dijo, y no se sigue diciendo.
    return v_archived is null and public.can_read_conversation(p_conversation_id);
  end if;

  if public.is_space_member(v_space_id) then
    return public.can_read_conversation(p_conversation_id);
  end if;

  if v_type = 'job_internal' then
    return false;
  end if;

  v_establishment_id := public.conversation_establishment_id(p_conversation_id);
  return public.can_write_establishment(v_establishment_id);
end;
$$;

-- `conversation_establishment_id()` aprende que un canal no tiene
-- restaurante. Sin esto devolvía el `establishment_id` de la fila —nulo—
-- por la rama `else`, que daba la respuesta correcta por casualidad; ahora
-- lo dice a propósito, porque una casualidad se rompe sola.
create or replace function public.conversation_establishment_id(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case c.type
    when 'request' then public.request_establishment_id(c.request_id)
    when 'job_internal' then (select j.establishment_id from public.jobs j where j.id = c.job_id)
    when 'channel' then null
    else c.establishment_id
  end
  from public.conversations c
  where c.id = p_conversation_id;
$$;

-- RN-CAN-04 · quien crea un canal y gestiona sus miembros es el
-- propietario o un administrador del espacio. Un trabajador escribe en los
-- suyos y no añade a nadie.
create or replace function public.create_channel(
  p_space_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := nullif(btrim(p_name), '');
begin
  if v_name is null then
    raise exception 'Un canal necesita un nombre';
  end if;

  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario o un administrador pueden crear un canal';
  end if;

  if exists (
    select 1 from public.conversations
    where space_id = p_space_id and type = 'channel'
      and archived_at is null and lower(btrim(name)) = lower(v_name)
  ) then
    raise exception 'Ya hay un canal con ese nombre';
  end if;

  insert into public.conversations (space_id, type, name)
  values (p_space_id, 'channel', v_name)
  returning id into v_id;

  -- RN-CAN-07 · quien crea un canal entra en él en el mismo acto. Si no,
  -- acabaría de crear algo que no puede leer.
  insert into public.channel_members (space_id, conversation_id, user_id, added_by)
  values (p_space_id, v_id, auth.uid(), auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (p_space_id, auth.uid(), 'channel.created', 'conversation', v_id,
          jsonb_build_object('name', v_name));

  return v_id;
end;
$$;

revoke all on function public.create_channel(uuid, text) from public, anon;
grant execute on function public.create_channel(uuid, text) to authenticated;

create or replace function public.add_channel_member(p_conversation_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_type text;
  v_id uuid;
begin
  select space_id, type into v_space_id, v_type
  from public.conversations where id = p_conversation_id;

  if v_type is distinct from 'channel' then
    raise exception 'Esa conversación no es un canal';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario o un administrador pueden añadir a alguien a un canal';
  end if;

  -- Un canal es del EQUIPO (RN-CAN-02). Quien no es del espacio no entra,
  -- y eso incluye a cualquier cuenta del lado cliente.
  if not exists (
    select 1 from public.space_memberships sm
    where sm.space_id = v_space_id and sm.user_id = p_user_id and sm.status = 'active'
  ) then
    raise exception 'Solo entra en un canal quien es del equipo de este espacio';
  end if;

  -- CA-17 · añadir dos veces no duplica. Se reutiliza la fila retirada si
  -- la hubo, igual que hacen los accesos de RN-EST-05.
  select id into v_id from public.channel_members
  where conversation_id = p_conversation_id and user_id = p_user_id and revoked_at is null;
  if v_id is not null then
    return v_id;
  end if;

  select id into v_id from public.channel_members
  where conversation_id = p_conversation_id and user_id = p_user_id
  order by created_at desc limit 1;

  if v_id is null then
    insert into public.channel_members (space_id, conversation_id, user_id, added_by)
    values (v_space_id, p_conversation_id, p_user_id, auth.uid())
    returning id into v_id;
  else
    update public.channel_members
    set revoked_at = null, revoked_by = null, added_by = auth.uid(), created_at = now()
    where id = v_id;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'channel.member_added', 'conversation', p_conversation_id,
          jsonb_build_object('user_id', p_user_id));

  return v_id;
end;
$$;

revoke all on function public.add_channel_member(uuid, uuid) from public, anon;
grant execute on function public.add_channel_member(uuid, uuid) to authenticated;

create or replace function public.remove_channel_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_type text;
begin
  select space_id, type into v_space_id, v_type
  from public.conversations where id = p_conversation_id;

  if v_type is distinct from 'channel' then
    raise exception 'Esa conversación no es un canal';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario o un administrador pueden sacar a alguien de un canal';
  end if;

  update public.channel_members
  set revoked_at = now(), revoked_by = auth.uid()
  where conversation_id = p_conversation_id and user_id = p_user_id and revoked_at is null;

  if found then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value)
    values (v_space_id, auth.uid(), 'channel.member_removed', 'conversation', p_conversation_id,
            jsonb_build_object('user_id', p_user_id));
  end if;
end;
$$;

revoke all on function public.remove_channel_member(uuid, uuid) from public, anon;
grant execute on function public.remove_channel_member(uuid, uuid) to authenticated;

-- RN-CAN-05 · se archiva, no se borra.
create or replace function public.archive_channel(p_conversation_id uuid, p_archived boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_type text;
begin
  select space_id, type into v_space_id, v_type
  from public.conversations where id = p_conversation_id;

  if v_type is distinct from 'channel' then
    raise exception 'Esa conversación no es un canal';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario o un administrador pueden archivar un canal';
  end if;

  update public.conversations
  set archived_at = case when p_archived then now() else null end,
      archived_by = case when p_archived then auth.uid() else null end
  where id = p_conversation_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(),
          case when p_archived then 'channel.archived' else 'channel.unarchived' end,
          'conversation', p_conversation_id, jsonb_build_object('archived', p_archived));
end;
$$;

revoke all on function public.archive_channel(uuid, boolean) from public, anon;
grant execute on function public.archive_channel(uuid, boolean) to authenticated;

-- RN-CAN-08 · ver que un canal existe no es leerlo.
--
-- Esto salió al montarlo, y merece quedar escrito: los cuatro canales de
-- fábrica nacen sin miembros, y si la lista se filtrara solo por
-- pertenencia nacerían **invisibles para todo el mundo**. El propietario no
-- vería el canal al que tiene que añadirse, y un canal que nadie puede
-- encontrar no lo arregla nadie.
--
-- La distinción es: quien administra el espacio ve la LISTA —nombre,
-- cuántos miembros, si está archivado—; lo que se DICE dentro sigue siendo
-- solo de los miembros, y eso lo decide `can_read_conversation()`, que no
-- ha cambiado. `i_am_member` dice de qué lado está quien pregunta, para que
-- la pantalla no tenga que adivinarlo.
create or replace function public.my_channels(p_space_id uuid)
returns table (
  id uuid,
  name text,
  archived_at timestamptz,
  member_count integer,
  last_message_at timestamptz,
  unread_count integer,
  i_am_member boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.archived_at,
    (select count(*)::integer from public.channel_members cm
     where cm.conversation_id = c.id and cm.revoked_at is null),
    (select max(m.created_at) from public.messages m where m.conversation_id = c.id),
    -- Sin leer solo tiene sentido para quien lee. A quien no es miembro se
    -- le devuelve nulo, no un cero: cero diría "estás al día" de algo que
    -- no puede abrir.
    case when public.is_channel_member(c.id) then (
      select count(*)::integer from public.messages m
      where m.conversation_id = c.id
        and m.sender_id is distinct from auth.uid()
        and m.created_at > coalesce(
          (select cr.last_read_at from public.conversation_reads cr
           where cr.conversation_id = c.id and cr.user_id = auth.uid()),
          '-infinity'::timestamptz)
    ) end,
    public.is_channel_member(c.id)
  from public.conversations c
  where c.space_id = p_space_id
    and c.type = 'channel'
    and (public.is_channel_member(c.id) or public.has_capability(p_space_id, 'manage_space'))
  order by c.archived_at nulls first, c.name;
$$;

comment on function public.my_channels(uuid) is
  'RN-CAN-08 · los canales que puedo ver en la lista: los míos, y todos si
   administro el espacio. Ver que existe no es leerlo: los mensajes los
   sigue decidiendo `can_read_conversation()`.';

revoke all on function public.my_channels(uuid) from public, anon;
grant execute on function public.my_channels(uuid) to authenticated;

-- RN-CAN-03 · los cuatro nombres de la maqueta vienen de fábrica y se
-- crean con el espacio. No son una lista cerrada: el equipo crea los que
-- quiera, y estos cuatro se pueden archivar como cualquier otro.
--
-- Nacen **sin miembros**, que es lo correcto por RN-CAN-07: nadie entra en
-- un canal sin que alguien lo meta. Se ven en la lista por RN-CAN-08, que
-- es lo que los hace alcanzables.
create or replace function public.seed_default_channels(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_creados integer := 0;
begin
  foreach v_nombre in array array['General', 'Proyectos web', 'Menú diario', 'Redes sociales']
  loop
    if not exists (
      select 1 from public.conversations
      where space_id = p_space_id and type = 'channel'
        and lower(btrim(name)) = lower(v_nombre)
    ) then
      insert into public.conversations (space_id, type, name)
      values (p_space_id, 'channel', v_nombre);
      v_creados := v_creados + 1;
    end if;
  end loop;

  return v_creados;
end;
$$;

revoke all on function public.seed_default_channels(uuid) from public, anon, authenticated;

create or replace function public.spaces_seed_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_channels(new.id);
  return new;
end;
$$;

-- Un disparador y no una llamada dentro de `approve_space_request()`
-- porque los espacios nacen por dos caminos —la aprobación de una
-- solicitud y `create_restavor_space()`— y un tercero aparecerá. Con el
-- disparador, los cuatro canales salen por todos.
-- La ejecuta la base, no se llama por RPC. Revocada y no "justificada en
-- una lista": una función que nadie tiene que poder llamar se cierra, que
-- es lo que CLAUDE.md pide para toda función interna.
revoke all on function public.spaces_seed_channels() from public, anon, authenticated;

create trigger spaces_seed_channels_trg
  after insert on public.spaces
  for each row execute function public.spaces_seed_channels();

-- Y los espacios que ya existían, que no pasaron por el disparador.
select public.seed_default_channels(id) from public.spaces;

-- ============================================================
-- 4 · Recordatorios de cobro (RN-REC)
-- ============================================================
--
-- La maqueta enseña tres avisos y el PRD tenía **dos umbrales**: las +24 h
-- (pausa, RN-FIN-10) y las +72 h (suspensión, RN-FIN-11). Un tercero
-- inventado habría sido justo lo que CLAUDE.md prohíbe, así que los tres
-- son el **vencimiento**, las +24 h y las +72 h: ningún plazo nuevo.
--
-- Lo único que no existía es el primero. Los otros dos ya se emiten al
-- pausar y al suspender, y esos dos son obligatorios (RN-NOT-03) porque el
-- servicio se detiene. **El del vencimiento no lo es** (RN-REC-05): avisa,
-- no corta, y el restaurante puede apagarlo sin quedarse sin enterar de lo
-- que sí le para el servicio.

alter table public.notifications drop constraint notifications_event_type_check;

-- Sin paréntesis en los comentarios de esta lista, a propósito:
-- `listas-compartidas.test.ts` la lee con una expresión que se corta en el
-- primer cierre.
alter table public.notifications add constraint notifications_event_type_check check (event_type in (
  'request_submitted', 'job_unassigned', 'job_assigned', 'job_started', 'job_published',
  'correction_requested', 'job_reassignment_requested', 'task_reassignment_requested',
  'terms_version_published',
  'menu_publication_requested', 'menu_assigned', 'menu_needs_information', 'menu_published',
  'menu_publication_error', 'menu_not_prepared_reminder', 'menu_publication_overdue',
  'quote_sent', 'quote_accepted', 'quote_rejected',
  'integration_sync_failed', 'integration_reauthorization_required',
  'report_schedule_due_soon', 'report_sent',
  'cuotly_payment_due_soon', 'cuotly_payment_due_today', 'cuotly_payment_overdue_24h',
  'cuotly_payment_overdue_48h', 'cuotly_payment_final_notice',
  'cuotly_space_archived', 'cuotly_space_reactivated',
  'support_session_started',
  'space_ownership_transferred', 'space_archived_by_owner',
  'incident_opened', 'incident_updated', 'incident_replied',
  'storage_threshold_80', 'storage_threshold_100', 'security_incident',
  'consumption_threshold_80', 'consumption_threshold_100',
  't2_threshold_50', 't2_threshold_80', 't2_threshold_100',
  't2_critical_alert', 't2_reassignment_suggestion',
  't3_threshold_75', 't3_threshold_90', 't3_threshold_100',
  'establishment_paused_nonpayment', 'establishment_suspended_nonpayment',
  'establishment_reactivated',
  -- RN-REC-02 · el primero de los tres avisos de M52, y el único nuevo.
  'charge_due_today',
  'absence_requested', 'absence_decided', 'absence_uncovered_jobs'
));

-- A quién avisa: al RESTAURANTE (RN-REC-05). Los otros dos avisos de
-- impago van al equipo que lleva las finanzas —`notify_establishment_event`
-- recorre owner y admin—, y este es el contrario: quien tiene que pagar es
-- quien tiene que saber que hoy vence.
--
-- Los destinatarios se leen aquí y no con `establishment_client_users()`
-- porque aquella exige `is_space_member()` para contestar, y esto lo llama
-- el barrido de la cola, que no es miembro de ningún espacio.
create or replace function public.notify_charge_due_today(p_charge_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge record;
  v_slug text;
  v_recipient uuid;
  v_sent integer := 0;
begin
  select c.id, c.space_id, c.establishment_id, c.due_at, c.concept
  into v_charge
  from public.charges c where c.id = p_charge_id;

  if v_charge.id is null then
    return 0;
  end if;

  -- RN-REC-04 · lo que decide es el LIBRO, no el estado guardado. Un cobro
  -- pagado ayer no recuerda nada hoy.
  --
  -- La suma se hace aquí y NO con `charge_outstanding_cents()`, por el
  -- mismo motivo que la zona horaria de abajo: aquella exige visibilidad
  -- financiera para contestar, y esto lo ejecuta la cola, que no es nadie.
  -- Llamarla desde aquí lanzaba, el barrido se tragaba el error —tiene su
  -- `exception when others` para que un aviso roto no deje sin avisar a
  -- los demás (CA-18)— y **ningún restaurante recibía nada, en silencio**.
  -- Es el mismo libro de apuntes y la misma suma: `financial_entries` del
  -- cobro, que es la definición de RN-FIN-02.
  if (select coalesce(sum(fe.amount_cents), 0)
      from public.financial_entries fe where fe.charge_id = p_charge_id) <= 0 then
    return 0;
  end if;

  v_slug := public.space_slug(v_charge.space_id);

  for v_recipient in
    select em.user_id
    from public.establishment_memberships em
    where em.establishment_id = v_charge.establishment_id and em.revoked_at is null
    union
    select gm.user_id
    from public.group_memberships gm
    where gm.revoked_at is null
      and gm.group_id = (
        select e.group_id from public.establishments e where e.id = v_charge.establishment_id)
  loop
    -- RN-REC-03 · una vez por umbral. La clave lleva el cobro y el día del
    -- vencimiento, no "hoy": así el barrido puede correr dos veces, o
    -- tarde, sin mandar dos.
    if public.emit_notification(
         v_charge.space_id, v_recipient, 'charge_due_today', 'client', 'charge', p_charge_id,
         '/espacios/' || v_slug || '/restaurantes/' || v_charge.establishment_id::text || '/facturacion',
         'charge_due_today:' || p_charge_id::text || ':' || to_char(v_charge.due_at, 'YYYY-MM-DD'),
         v_charge.establishment_id) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.notify_charge_due_today(uuid) from public, anon, authenticated;

comment on function public.notify_charge_due_today(uuid) is
  'RN-REC-02 · el aviso del día del vencimiento, al restaurante. No pausa
   nada ni cambia ningún estado: avisa. Los otros dos avisos de los tres de
   M52 son los que ya emiten la pausa y la suspensión.';

-- El barrido. Va DENTRO del de impago y no en uno nuevo a propósito: es la
-- misma pregunta —"¿qué cobros están vencidos y cuánto hace?"— y separarla
-- habría creado dos sitios que leen `charges.due_at` con dos criterios que
-- un día discrepan.
create or replace function public.run_charge_reminders(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge uuid;
  v_avisados integer := 0;
  v_zona text;
begin
  -- La zona se lee de la tabla y NO con `space_timezone()`, que exige ser
  -- miembro del espacio para contestar. Este barrido lo ejecuta la cola,
  -- que no es miembro de ninguno: llamarla desde aquí fallaba con "No
  -- tienes acceso a este espacio" y ningún restaurante habría recibido su
  -- aviso. Es interna y está reservada, así que leer la columna es
  -- exactamente lo que le toca.
  select timezone into v_zona from public.spaces where id = p_space_id;
  if v_zona is null then
    return 0;
  end if;

  for v_charge in
    select c.id
    from public.charges c
    join public.establishments e on e.id = c.establishment_id
    where c.space_id = p_space_id
      -- El día del vencimiento, en la zona del espacio: "hoy vence" para un
      -- restaurante de un espacio en otra zona no es el hoy de Restavor
      -- (CLAUDE.md).
      and (c.due_at at time zone v_zona)::date = (now() at time zone v_zona)::date
      and e.status <> 'archived'
  loop
    begin
      v_avisados := v_avisados + public.notify_charge_due_today(v_charge);
    exception when others then
      -- CA-18 · un aviso que falla no puede dejar sin avisar a los demás.
      null;
    end;
  end loop;

  return v_avisados;
end;
$$;

revoke all on function public.run_charge_reminders(uuid) from public, anon, authenticated;

-- ============================================================
-- 5 · La cola aprende los dos barridos nuevos
-- ============================================================
alter table public.scheduled_jobs drop constraint scheduled_jobs_kind_check;
alter table public.scheduled_jobs add constraint scheduled_jobs_kind_check
  check (kind in ('monthly_charges', 'dunning_sweep', 'sla_sweep', 'lifecycle_sweep',
                  'consumption_sweep', 'daily_menu_sweep', 'cuotly_billing_sweep',
                  'cuotly_storage_sweep',
                  'backup_sweep', 'charge_reminders'));

create or replace function public.run_scheduled_job(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_space uuid;
  v_hechos integer := 0;
begin
  select kind, space_id into v_kind, v_space
  from public.scheduled_jobs where id = p_job_id;

  if v_kind is null then
    raise exception 'Trabajo de cola no encontrado';
  end if;

  if v_kind = 'monthly_charges' then
    v_hechos := public.run_monthly_charges(v_space);
  elsif v_kind = 'dunning_sweep' then
    v_hechos := public.run_dunning_sweep(v_space);
  elsif v_kind = 'lifecycle_sweep' then
    v_hechos := public.run_lifecycle_sweep(v_space);
  elsif v_kind = 'consumption_sweep' then
    v_hechos := public.run_consumption_thresholds(v_space);
  elsif v_kind = 'daily_menu_sweep' then
    v_hechos := public.run_daily_menu_sweep(v_space);
  elsif v_kind = 'cuotly_billing_sweep' then
    v_hechos := public.run_cuotly_billing_sweep(v_space);
  elsif v_kind = 'cuotly_storage_sweep' then
    v_hechos := public.run_cuotly_storage_sweep(v_space);
  elsif v_kind = 'backup_sweep' then
    v_hechos := public.run_backup_sweep(v_space);
  elsif v_kind = 'charge_reminders' then
    v_hechos := public.run_charge_reminders(v_space);
  elsif v_kind = 'sla_sweep' then
    raise exception 'El barrido de plazos lo ejecuta src/services/queue-runner.ts, no SQL';
  else
    raise exception 'Tipo de trabajo de cola desconocido: %', v_kind;
  end if;

  perform public.finish_scheduled_job(p_job_id, true, null);
  return v_hechos;
end;
$$;

revoke all on function public.run_scheduled_job(uuid) from public, anon, authenticated;

create or replace function public.enqueue_due_scheduled_jobs(
  p_run_after timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space record;
  v_kind text;
  v_hora text := to_char(p_run_after at time zone 'UTC', 'YYYYMMDDHH24');
  v_encolados integer := 0;
begin
  for v_space in select id, cuotly_plan from public.spaces loop
    foreach v_kind in array array[
      'monthly_charges',   -- RN-FIN-01
      'dunning_sweep',     -- RN-FIN-10 y RN-FIN-11
      'lifecycle_sweep',   -- RN-EST-09, RN-EST-10 y §6.4
      'consumption_sweep', -- §18, avisos al 80 % y al 100 %
      'daily_menu_sweep',  -- RN-MEN-08 y §62
      'backup_sweep',      -- RN-BCK-02, una copia al día
      'charge_reminders'   -- RN-REC-02, el aviso del vencimiento
    ]
    loop
      if public.enqueue_scheduled_job(
           v_space.id, v_kind, p_run_after,
           v_kind || ':' || v_space.id::text || ':' || v_hora) is not null then
        v_encolados := v_encolados + 1;
      end if;
    end loop;

    -- Los dos de plataforma, solo para los espacios con suscripción de
    -- Cuotly: el cobro (Hito 18) y el almacenamiento (RN-SUB-13, migración
    -- 95). Los dos van en el mismo bucle desde la 95 y siguen aquí — esta
    -- función se reescribe entera cada vez que crece la lista, así que
    -- copiar una versión vieja pierde en silencio lo que añadió la anterior.
    if v_space.cuotly_plan is not null then
      foreach v_kind in array array['cuotly_billing_sweep', 'cuotly_storage_sweep'] loop
        if public.enqueue_scheduled_job(
             v_space.id, v_kind, p_run_after,
             v_kind || ':' || v_space.id::text || ':' || v_hora) is not null then
          v_encolados := v_encolados + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_encolados;
end;
$$;

revoke all on function public.enqueue_due_scheduled_jobs(timestamptz)
  from public, anon, authenticated;

-- ============================================================
-- 6 · La auditoría conoce las dos familias nuevas (§21.2)
-- ============================================================
--
-- `establishment_transfer` es de `manage_clients`, como todo lo que pasa
-- con un restaurante. `channel` es de `manage_space`: los canales son
-- organización del espacio, no de un cliente.
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
    when 'establishment_transfer' then 'manage_clients'
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

revoke all on function public.audit_action_capability(text) from public, anon;
grant execute on function public.audit_action_capability(text) to authenticated;

-- ============================================================
-- 7 · Modo soporte: las tablas nuevas, en solo lectura (RN-ADM-07)
-- ============================================================
--
-- CLAUDE.md: "toda tabla nueva con `space_id` lleva el disparador de solo
-- lectura en soporte, o se justifica en la lista de exentas de la suite
-- 42". Estas tres lo llevan.
--
-- `establishment_transfers` NO tiene `space_id` y por eso no aparece aquí:
-- tiene DOS, `from_space_id` y `to_space_id`, porque una transferencia es
-- de dos espacios a la vez y ponerla en uno sería mentir sobre a quién
-- pertenece. Queda justificada en el barrido de la suite 47.
create trigger channel_members_guard_support_read_only
  before insert or update or delete on public.channel_members
  for each row execute function public.guard_support_read_only();

create trigger establishment_backups_guard_support_read_only
  before insert or update or delete on public.establishment_backups
  for each row execute function public.guard_support_read_only();

create trigger establishment_backup_downloads_guard_support_read_only
  before insert or update or delete on public.establishment_backup_downloads
  for each row execute function public.guard_support_read_only();

-- ============================================================
-- 8 · Espacio archivado: las tablas nuevas, congeladas (RN-SUB-08)
-- ============================================================
--
-- El otro disparador, el del espacio archivado. Un espacio archivado "se
-- puede pagar, exportar y contactar con soporte" y nada más: ni se escribe
-- en un canal ni se generan copias nuevas.
--
-- `establishment_backups` lleva el disparador **a propósito**, aunque
-- pudiera argumentarse que una copia es una exportación: no lo es. Lo que
-- RN-SUB-08 deja hacer es llevarse los datos, y para eso está
-- `space_exports` (§141), que es del propietario. Una copia es una
-- herramienta del equipo (RN-BCK-07) y generarla en un espacio congelado
-- sería trabajo nuevo dentro de algo que está parado.
create trigger channel_members_cuotly_read_only
  before insert or update or delete on public.channel_members
  for each row execute function public.guard_space_read_only();

create trigger establishment_backups_cuotly_read_only
  before insert or update or delete on public.establishment_backups
  for each row execute function public.guard_space_read_only();

create trigger establishment_backup_downloads_cuotly_read_only
  before insert or update or delete on public.establishment_backup_downloads
  for each row execute function public.guard_space_read_only();
