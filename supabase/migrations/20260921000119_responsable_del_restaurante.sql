-- ============================================================
-- RN-EST-19 · El responsable de un restaurante (decisión 63)
-- ============================================================
--
-- El diseño definitivo móvil enseña en su página 23 un "Supervisor ·
-- Diego" en cada ficha de la lista de restaurantes. Eso chocaba con una
-- decisión que no debe reaparecer: **supervisor no es un rol**, es una
-- relación Administrador–Trabajador (§14, RN-SUP), y `supervisions`
-- enlaza dos personas, no una persona con un local. La lista se construyó
-- sin esa columna, diciendo por qué, y se preguntó.
--
-- Bosco, el 21/09/2026: *"Crearlo pero no es obligatorio que haya siempre
-- uno"*.
--
-- ------------------------------------------------------------
-- Las tres decisiones de forma, y por qué
-- ------------------------------------------------------------
--
-- **1 · Tabla aparte, no una columna en `establishments`.**
--
-- El responsable es alguien del EQUIPO, y `establishments` la lee el
-- cliente: es su propio restaurante. Una columna `manager_id` ahí le
-- entregaría el uuid de una persona del equipo de mantenimiento en cuanto
-- leyera su ficha, que es exactamente lo que CLAUDE.md prohíbe (P7, y el
-- bloqueante B2 de la cuarta revisión).
--
-- Se podría tapar con privilegios de columna, que es la herramienta para
-- una tabla cuya FILA sí es del cliente. Pero `establishments` hoy no
-- tiene ninguno, y estrenárselos convertiría cualquier `select *` sobre
-- ella —en la web, en la app, en un script— en un 403. El precio no vale
-- la pena cuando hay una respuesta más limpia: esto **no es un dato del
-- restaurante**, es organización interna del equipo, igual que
-- `worker_establishments` o `assignments`. Y a la organización interna se
-- la deja fuera del alcance del cliente con RLS, no tapando columnas.
--
-- **2 · Una fila por restaurante, y puede no haberla.**
--
-- La clave primaria es `establishment_id`: uno o ninguno, nunca dos.
-- "Puede no haberlo" no se representa con un `null` en una columna sino
-- con la ausencia de la fila, que es la manera de que **ninguna consulta
-- pueda tropezar con un responsable que no existe**.
--
-- **3 · Nada del servidor depende de que esté relleno.**
--
-- RN-EST-19 lo dice y aquí se cumple por construcción: esta tabla no la
-- lee ningún aviso, ningún reparto, ningún plazo y ningún informe. Ser
-- responsable **no concede ni quita permisos**; quién puede hacer qué
-- sigue saliendo de las capacidades del espacio (§13). Es una atribución,
-- no una llave.

-- ------------------------------------------------------------
-- 1 · La tabla
-- ------------------------------------------------------------

create table public.establishment_managers (
  -- Uno o ninguno: la clave primaria es el restaurante.
  establishment_id uuid primary key references public.establishments(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  -- Alguien del equipo del espacio. `on delete cascade`: si el perfil
  -- desaparece, el restaurante se queda sin responsable, que es lo que
  -- dice RN-EST-19 para cuando esa persona sale.
  manager_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id)
);

comment on table public.establishment_managers is
  'RN-EST-19 · quién del equipo lleva cada restaurante. Opcional: sin fila
   es "sin responsable", que es un estado normal. Tabla aparte y no una
   columna de `establishments` porque el cliente lee su propia ficha y
   esto es organización interna del equipo (P7).';

create index establishment_managers_manager_idx
  on public.establishment_managers (space_id, manager_id);

-- El `space_id` no se escribe a mano: se copia del restaurante. Una fila
-- con el espacio de otro dejaría al responsable fuera de su propia RLS o,
-- peor, dentro de la de un espacio ajeno.
create or replace function public.establishment_managers_space_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
begin
  select e.space_id into v_space
  from public.establishments e
  where e.id = new.establishment_id;

  if v_space is null then
    raise exception 'El restaurante no existe';
  end if;

  new.space_id := v_space;
  return new;
end;
$$;

revoke all on function public.establishment_managers_space_guard() from public, anon, authenticated;

create trigger establishment_managers_space_guard
  before insert or update on public.establishment_managers
  for each row execute function public.establishment_managers_space_guard();

alter table public.establishment_managers enable row level security;

-- CLAUDE.md · toda tabla con `space_id` lleva el disparador de solo
-- lectura en Modo soporte: desde soporte se mira, no se reasigna.
create trigger establishment_managers_guard_support_read_only
  before insert or update or delete on public.establishment_managers
  for each row execute function public.guard_support_read_only();

-- Y el otro, que es distinto: un espacio archivado por impago está
-- congelado (RN-SUB-08).
create trigger establishment_managers_cuotly_read_only
  before insert or update or delete on public.establishment_managers
  for each row execute function public.guard_space_read_only();

-- **La puerta.** Solo los miembros del espacio. El cliente no lo es, así
-- que para él esta tabla no tiene ni una fila: no hay nombre del equipo
-- que se le pueda escapar (P7).
--
-- No hay política de insert, update ni delete a propósito: se escribe por
-- la función de abajo, que comprueba la capacidad y deja auditoría.
create policy establishment_managers_select on public.establishment_managers
for select
using (public.is_space_member(space_id));

-- ------------------------------------------------------------
-- 2 · Asignarlo y quitarlo
-- ------------------------------------------------------------
--
-- Una sola función para las dos cosas: `p_manager_id` nulo **quita** el
-- responsable. Tenerlas separadas invita a que una compruebe el permiso y
-- la otra se olvide.
create or replace function public.set_establishment_manager(
  p_establishment_id uuid,
  p_manager_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
  v_anterior uuid;
  v_activo boolean;
begin
  select e.space_id into v_space
  from public.establishments e
  where e.id = p_establishment_id;

  if v_space is null then
    raise exception 'El restaurante no existe';
  end if;

  -- RN-EST-11 · la misma capacidad que edita los datos del cliente.
  if not public.has_capability(v_space, 'manage_clients') then
    raise exception 'No tienes permiso para asignar el responsable de este restaurante';
  end if;

  select m.manager_id into v_anterior
  from public.establishment_managers m
  where m.establishment_id = p_establishment_id;

  -- Nada que hacer: ni un apunte de auditoría que diga que algo cambió
  -- cuando no cambió nada. Pulsar dos veces no deja dos rastros.
  if v_anterior is not distinct from p_manager_id then
    return;
  end if;

  if p_manager_id is null then
    delete from public.establishment_managers
    where establishment_id = p_establishment_id;
  else
    -- RN-EST-19 · solo alguien con pertenencia ACTIVA al espacio. Un
    -- invitado que no ha entrado todavía, o alguien que ya salió, no
    -- puede ser responsable de nada.
    select exists (
      select 1 from public.space_memberships sm
      where sm.space_id = v_space
        and sm.user_id = p_manager_id
        and sm.status = 'active'
    ) into v_activo;

    if not v_activo then
      raise exception 'El responsable tiene que ser alguien del equipo de este espacio';
    end if;

    insert into public.establishment_managers (establishment_id, space_id, manager_id, assigned_by)
    values (p_establishment_id, v_space, p_manager_id, auth.uid())
    on conflict (establishment_id) do update
      set manager_id = excluded.manager_id,
          assigned_at = now(),
          assigned_by = excluded.assigned_by;
  end if;

  -- §21.2 · actor, valor anterior y valor nuevo. Quitar el responsable es
  -- un cambio como asignarlo, y se anota igual.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id,
                                old_value, new_value)
  values (v_space, auth.uid(), 'establishment.manager_set', 'establishment',
          p_establishment_id,
          jsonb_build_object('manager_id', v_anterior),
          jsonb_build_object('manager_id', p_manager_id));
end;
$$;

-- La función comprueba el permiso por su cuenta, así que la llama
-- cualquiera con sesión: es ella quien dice que no.
revoke all on function public.set_establishment_manager(uuid, uuid) from public, anon;
grant execute on function public.set_establishment_manager(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 3 · Quien sale del equipo deja de ser responsable
-- ------------------------------------------------------------
--
-- RN-EST-19 · "si esa persona sale del espacio, el restaurante se queda
-- **sin responsable** —no se reasigna solo a nadie—".
--
-- Se hace aquí, en el servidor, y no en la pantalla que da de baja a
-- alguien: hay más de una manera de salir de un espacio, y la que se
-- olvidara dejaría una ficha diciendo que el responsable es alguien que
-- ya no está.
create or replace function public.clear_managers_on_membership_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.establishment_managers
    where space_id = old.space_id and manager_id = old.user_id;
    return old;
  end if;

  if old.status = 'active' and new.status <> 'active' then
    delete from public.establishment_managers
    where space_id = new.space_id and manager_id = new.user_id;
  end if;

  return new;
end;
$$;

revoke all on function public.clear_managers_on_membership_end() from public, anon, authenticated;

create trigger space_memberships_clear_managers
  after update or delete on public.space_memberships
  for each row execute function public.clear_managers_on_membership_end();

-- ------------------------------------------------------------
-- 4 · La transferencia
-- ------------------------------------------------------------
--
-- **Se queda.** Un responsable del espacio de origen no significa nada en
-- otro espacio, igual que `worker_establishments` (RN-TRA-08). Y además
-- se retira: la fila es del espacio viejo y el restaurante ya no lo es.
--
-- La lista se reescribe **desde la definición viva**, no de memoria.
create or replace function public.establishment_transfer_tables()
returns table(table_name text, travels boolean)
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
    -- RN-INT-10 (migración 117) · su ficha de Google es suya.
    ('reviews', true),
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
    ('worker_establishments', false),
    -- RN-EST-19 (migración 119) · lo mismo, y por lo mismo: quien lo
    -- llevaba es del equipo de origen.
    ('establishment_managers', false),
    -- RN-ACC-13 (migración 114) · se queda, y además deja de poder
    -- gastarse: lo garantiza la comprobación de espacio de
    -- `consume_establishment_invitation()`, no esta lista.
    ('establishment_invitations', false)
  ) as t(table_name, travels);
$$;
