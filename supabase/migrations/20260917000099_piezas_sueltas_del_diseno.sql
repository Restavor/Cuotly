-- ============================================================================
-- Migración 99 · El servidor que les falta a cuatro piezas del diseño
-- Paso 2 del orden acordado · `docs/diseno/LAS-CATORCE-PIEZAS.md`
-- ============================================================================
--
-- De las catorce piezas sueltas que el diseño definitivo da por hechas, seis
-- solo necesitaban pantalla y cinco necesitaban servidor. De esas cinco,
-- una —comparar versiones de menú— es cálculo puro y va en `src/core`. Las
-- otras cuatro están aquí.
--
-- Ninguna estrena una regla: las cuatro salen de reglas que el PRD ya tiene,
-- y el triaje dice de cuál sale cada una. Lo que faltaba era escribirlas.
--
--   1. El **IVA por defecto del espacio** (M58). Los datos fiscales ya se
--      editan; el tipo impositivo no, porque `spaces` perdió su política de
--      UPDATE en la migración 49 para que ningún cambio se colara sin
--      auditoría. Le faltaba su función.
--   2. **Cancelar una solicitud que todavía no es un trabajo** (R12). La
--      que sí lo es ya se cancela con `cancel_accepted_request()`.
--   3. **La edición simultánea del menú** (A17): guardar sabiendo contra qué
--      versión se empezó a escribir.
--   4. **Comunicar la baja del servicio** (R24 y M47), que es RN-EST-09
--      entera y ya tenía su estado.

-- ============================================================
-- 1 · El IVA por defecto del espacio (M58, RN-FIN-08)
-- ============================================================
--
-- `spaces.tax_rate_percent` existe desde el principio y se usa al emitir
-- cada cobro, pero no había forma de cambiarlo desde la aplicación: la
-- migración 49 le quitó a `spaces` la política de UPDATE precisamente para
-- que no hubiera una segunda puerta sin auditoría, y este campo se quedó sin
-- la suya.
--
-- **Lo que cambia y lo que no**, que es lo que la pantalla tiene que decir:
-- RN-FIN-08 congela el tipo en el cobro al emitirlo, igual que RN-FIN-01b
-- hace con el plazo. Así que tocar esto mueve **los cobros futuros** y
-- ninguno de los ya emitidos. No es una corrección retroactiva y no debe
-- parecerlo.
create or replace function public.set_space_tax_rate(
  p_space_id uuid,
  p_percent numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous numeric;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario puede cambiar el IVA por defecto del espacio';
  end if;

  -- Un tipo impositivo negativo no existe, y uno por encima de 100 tampoco.
  -- No se fija ningún valor "correcto": el que aplique lo sabe el espacio,
  -- y CLAUDE.md prohíbe inventar el porcentaje español aquí dentro.
  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'El IVA por defecto va entre 0 y 100';
  end if;

  select tax_rate_percent into v_previous from public.spaces where id = p_space_id for update;
  if v_previous is null then
    raise exception 'Espacio no encontrado';
  end if;

  if v_previous = p_percent then
    return; -- CA-17 · pulsar dos veces produce un único efecto.
  end if;

  update public.spaces set tax_rate_percent = p_percent where id = p_space_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (p_space_id, auth.uid(), 'space.tax_rate_changed', 'space', p_space_id,
          jsonb_build_object('tax_rate_percent', v_previous),
          jsonb_build_object('tax_rate_percent', p_percent));
end;
$$;

comment on function public.set_space_tax_rate(uuid, numeric) is
  'M58 · el IVA por defecto del espacio. RN-FIN-08 lo congela en cada cobro
   al emitirlo, así que cambiarlo mueve los futuros y ninguno de los ya
   emitidos.';

revoke all on function public.set_space_tax_rate(uuid, numeric) from public, anon;
grant execute on function public.set_space_tax_rate(uuid, numeric) to authenticated;

-- ============================================================
-- 2 · Cancelar una solicitud que todavía no es un trabajo (R12)
-- ============================================================
--
-- `cancel_accepted_request()` cancela la solicitud que **ya** tiene trabajo:
-- devuelve el consumo, mueve el trabajo y deja el rastro. Y empieza
-- exigiendo que exista ese trabajo, así que una solicitud que todavía está
-- esperando revisión no se podía cancelar por ningún sitio.
--
-- Eso es lo que R12 pide: "cancelar mientras no esté completada". Aquí va la
-- otra mitad, la de antes de aceptar, que es más simple porque **no hay nada
-- que devolver**: sin trabajo no se ha consumido nada del plan.
--
-- Quién puede: el restaurante (`can_write_establishment`) y el equipo que
-- gestiona solicitudes. Los dos, porque las dos cosas pasan — el cliente se
-- arrepiente, o llama y lo hace el equipo por él.
create or replace function public.cancel_request(
  p_request_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.requests;
  v_job_id uuid;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not (public.can_write_establishment(v_req.establishment_id)
          or public.has_capability(v_req.space_id, 'manage_requests')) then
    raise exception 'No puedes cancelar esta solicitud';
  end if;

  -- CA-17 · ya cancelada: no se hace nada la segunda vez.
  if v_req.state in ('cancelled_before_start', 'cancelled_after_start') then
    return;
  end if;

  -- Si ya tiene trabajo, esta no es la función: la otra devuelve el consumo
  -- y mueve el trabajo, y hacerlo a medias aquí dejaría el libro descuadrado.
  select id into v_job_id from public.jobs where request_id = p_request_id;
  if v_job_id is not null then
    raise exception 'Esta solicitud ya tiene trabajo: se cancela con cancel_accepted_request()';
  end if;

  -- Lo que ya terminó no se cancela: se cancela lo que está en marcha.
  if v_req.state in ('closed', 'rejected', 'published') then
    raise exception 'Una solicitud en % ya está terminada', v_req.state;
  end if;

  update public.requests
  set state = 'cancelled_before_start'
  where id = p_request_id;

  -- El rastro va a `audit_log` y NO a `state_events`, y no es un descuido:
  -- el CHECK de aquella tabla acepta trabajo, tarea, establecimiento,
  -- oportunidad, informe y espacio, y una solicitud no está. Es la misma
  -- convención que sigue `cancel_accepted_request()`, que apunta el estado
  -- del TRABAJO ahí y el de la solicitud en la auditoría. Ensanchar el
  -- CHECK para que quepa aquí sería cambiar cómo se cuenta la historia de
  -- las solicitudes en todo el producto por una función.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_req.space_id, auth.uid(), 'request.cancelled', 'request', p_request_id,
          jsonb_build_object('state', v_req.state),
          jsonb_build_object('state', 'cancelled_before_start'),
          btrim(p_reason));
end;
$$;

comment on function public.cancel_request(uuid, text) is
  'R12 · el restaurante (o el equipo por él) cancela una solicitud que
   todavía no es un trabajo. La que ya lo es se cancela con
   `cancel_accepted_request()`, que además devuelve el consumo.';

revoke all on function public.cancel_request(uuid, text) from public, anon;
grant execute on function public.cancel_request(uuid, text) to authenticated;

-- ============================================================
-- 3 · Edición simultánea del menú (A17)
-- ============================================================
--
-- La maqueta A17 enseña el aviso de que otra persona guardó una versión
-- mientras escribías, con la comparación de las dos. Para poder avisar hay
-- que saber **contra qué versión se empezó a escribir**, y eso no viajaba:
-- `save_menu_version()` leía el máximo y sumaba uno, así que dos personas
-- guardando a la vez producían dos versiones y la segunda se llevaba el
-- menú sin que la primera se enterara de nada.
--
-- Se añade `p_expected_version`, **opcional**: sin él la función se comporta
-- exactamente igual que antes —ninguna pantalla existente cambia—, y con él
-- falla con un mensaje reconocible cuando alguien se ha adelantado. No se
-- pierde lo escrito: quien llama recibe el error, conserva su texto y la
-- pantalla ofrece comparar.
--
-- Esto es control de concurrencia optimista, que es lo que corresponde aquí:
-- bloquear el menú mientras alguien lo tiene abierto dejaría menús
-- bloqueados por pestañas que nadie cerró.
create or replace function public.save_menu_version(
  p_menu_id uuid,
  p_starters text[],
  p_mains text[],
  p_desserts text[],
  p_drink text default null,
  p_price_cents integer default null,
  p_note text default null,
  p_expected_version integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_version integer;
  v_after_cutoff boolean;
  v_id uuid;
  v_actual integer;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null then
    raise exception 'Menú no encontrado';
  end if;

  if not public.can_write_menus(v_menu.establishment_id) then
    raise exception 'No tienes permiso para editar este menú';
  end if;

  if v_menu.state in ('published', 'cancelled') then
    raise exception 'Un menú publicado o cancelado no se edita: copia el menú para crear un borrador nuevo';
  end if;

  select coalesce(max(version), 0) into v_actual
  from public.menu_versions where menu_id = p_menu_id;

  -- A17 · alguien guardó entre que esta persona abrió el editor y pulsó.
  -- El mensaje lleva el número real para que la pantalla pueda ofrecer la
  -- comparación sin tener que preguntarlo otra vez.
  if p_expected_version is not null and p_expected_version <> v_actual then
    raise exception 'EDICION_SIMULTANEA: el menú va por la versión %, no por la %', v_actual, p_expected_version
      using errcode = '40001';
  end if;

  v_version := v_actual + 1;
  v_after_cutoff := now() > public.menu_cutoff_at(v_menu.target_date, v_menu.space_id);

  insert into public.menu_versions
    (space_id, menu_id, version, starters, mains, desserts, drink, price_cents, note, after_cutoff, created_by)
  values
    (v_menu.space_id, p_menu_id, v_version, coalesce(p_starters, '{}'), coalesce(p_mains, '{}'),
     coalesce(p_desserts, '{}'), nullif(btrim(p_drink), ''), p_price_cents, nullif(btrim(p_note), ''),
     v_after_cutoff, auth.uid())
  returning id into v_id;

  update public.menus set current_version_id = v_id, updated_at = now() where id = p_menu_id;

  if v_menu.state = 'needs_information' then
    perform public.record_menu_event(p_menu_id,
      (select id from public.menu_publications where menu_id = p_menu_id and published_at is null and cancelled_at is null),
      'needs_information', 'reviewing', 'Versión ' || v_version || ' guardada por el restaurante');
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.version_saved', 'menu', p_menu_id,
          jsonb_build_object('version', v_version, 'version_id', v_id, 'after_cutoff', v_after_cutoff));

  return v_id;
end;
$$;

comment on function public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer) is
  'RN-MEN · guarda una versión del menú. Con `p_expected_version` avisa de la
   edición simultánea de A17 en vez de pisar lo que otro acaba de guardar;
   sin él se comporta como siempre.';

revoke all on function public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer)
  from public, anon;
grant execute on function public.save_menu_version(uuid, text[], text[], text[], text, integer, text, integer)
  to authenticated;

-- La firma de siete argumentos se queda muerta: PostgreSQL trataría la de
-- ocho como una sobrecarga distinta y PostgREST elegiría cualquiera de las
-- dos según los parámetros que le llegaran. Dos funciones con el mismo
-- nombre y distinta idea de la concurrencia es justo lo que este cambio
-- viene a evitar.
drop function if exists public.save_menu_version(uuid, text[], text[], text[], text, integer, text);

-- ============================================================
-- 4 · Comunicar la baja del servicio (R24, M47, RN-EST-09)
-- ============================================================
--
-- Antes de la función, una partición que hace falta para que exista.
--
-- `set_establishment_status()` empieza exigiendo `manage_clients`, y eso
-- está bien para lo que hace: mover el estado de un restaurante a mano es
-- del equipo. Pero **comunicar la baja también la hace el restaurante**
-- (R24), y su estado es `ending`.
--
-- Se parte en dos, que es lo que este proyecto ya hace en todos los casos
-- iguales —`evaluate_establishment_dunning` y su `_internal`,
-- `generate_monthly_charge` y el suyo—: el cuerpo, que no comprueba
-- permisos y está reservado, y la puerta de siempre, que comprueba
-- `manage_clients` y llama al cuerpo. Ninguna comprobación se pierde, y
-- **la de la deuda vencida sigue dentro del cuerpo**, donde protege a las
-- dos puertas: de una parada por impago se sale cobrando (RN-FIN-13),
-- también comunicando una baja.
create or replace function public.set_establishment_status_internal(
  p_establishment_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_previous text;
begin
  select space_id, status into v_space_id, v_previous
  from public.establishments where id = p_establishment_id for update;

  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if v_previous = p_status then
    return; -- CA-17: pulsar dos veces produce un único efecto.
  end if;

  -- RN-FIN-13: de una parada por impago solo se sale cobrando. La guarda
  -- mira la DEUDA, no el estado del que se venga. `archived` se exceptúa:
  -- RN-FIN-14 mantiene la deuda del que se va, así que archivar a un moroso
  -- es legítimo. Lo que no lo es es darle servicio.
  if p_status not in ('paused', 'suspended', 'archived')
     and public.establishment_has_overdue_debt(p_establishment_id) then
    raise exception 'Este restaurante tiene deuda vencida: se reactiva al cobrar, no cambiando el estado a mano';
  end if;

  perform set_config('cuotly.status_change', 'on', true);
  update public.establishments set status = p_status where id = p_establishment_id;
  perform set_config('cuotly.status_change', 'off', true);

  perform public.record_state_event(v_space_id, 'establishment', p_establishment_id, v_previous, p_status, p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.status_changed', 'establishment', p_establishment_id,
          jsonb_build_object('status', v_previous), jsonb_build_object('status', p_status), p_reason);
end;
$$;

comment on function public.set_establishment_status_internal(uuid, text, text) is
  'El cuerpo de `set_establishment_status()`, sin la comprobación de
   permisos. Interna: quien la llama comprueba quién puede. La guarda de la
   deuda vencida (RN-FIN-13) vive AQUÍ, para que proteja a todas las
   puertas y no solo a la del equipo.';

revoke all on function public.set_establishment_status_internal(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.set_establishment_status(
  p_establishment_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select space_id into v_space_id from public.establishments where id = p_establishment_id;

  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden cambiar el estado de un restaurante';
  end if;

  perform public.set_establishment_status_internal(p_establishment_id, p_status, p_reason);
end;
$$;

revoke all on function public.set_establishment_status(uuid, text, text) from public, anon;
grant execute on function public.set_establishment_status(uuid, text, text) to authenticated;
--
-- RN-EST-09 ya lo dice entero: "el restaurante ha comunicado la baja pero el
-- servicio sigue activo hasta el final del periodo pagado o de la
-- permanencia vigente. Al llegar esa fecha pasa a `read_only` durante 24 h y
-- después a `suspended`". El estado `ending` existe y el barrido que lo
-- mueve también.
--
-- Lo que no existía es **comunicarla**. R24 la pide desde el panel del
-- restaurante; M47 la pide desde la ficha, para la baja que llegó por
-- teléfono o por correo. Es el mismo hecho con dos puertas, así que es una
-- sola función: quién la llama queda en la auditoría, y `requested_by_client`
-- distingue si la comunicó el restaurante o la registró el equipo.
--
-- **No adelanta ninguna fecha.** Pasar a `ending` no corta el servicio: lo
-- que hace es decir que no se renueva. Cuándo se corta lo decide RN-EST-09
-- con el periodo pagado y la permanencia, y eso ya está escrito y calculado
-- en otro sitio.
create or replace function public.request_service_termination(
  p_establishment_id uuid,
  p_reason text default null,
  p_requested_by_client boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_status text;
  v_es_cliente boolean;
  v_es_equipo boolean;
begin
  select space_id, status into v_space_id, v_status
  from public.establishments where id = p_establishment_id for update;

  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  v_es_cliente := public.can_write_establishment(p_establishment_id);
  v_es_equipo := public.has_capability(v_space_id, 'manage_clients');

  if not (v_es_cliente or v_es_equipo) then
    raise exception 'No puedes comunicar la baja de este restaurante';
  end if;

  -- Registrar una baja "de fuera" es un acto del equipo: dice que alguien
  -- llamó. El restaurante comunica la suya, no la de otro.
  if not p_requested_by_client and not v_es_equipo then
    raise exception 'Solo el equipo registra una baja comunicada por fuera de Cuotly';
  end if;

  -- CA-17 · comunicarla dos veces no hace nada la segunda.
  if v_status = 'ending' then
    return;
  end if;

  -- Lo que ya no tiene servicio no se da de baja: no queda nada que acabar.
  if v_status in ('suspended', 'archived') then
    raise exception 'Este restaurante ya no tiene servicio activo (%)', v_status;
  end if;

  -- RN-EST-09 · `ending` es servicio EN MARCHA. `set_establishment_status()`
  -- lo sabe y por eso exige que no haya deuda vencida: de una parada por
  -- impago se sale cobrando (RN-FIN-13), no comunicando una baja.
  -- Por el cuerpo y no por la puerta del equipo: quién puede ya se ha
  -- comprobado arriba, y el restaurante no tiene `manage_clients` —ni debe
  -- tenerlo— para comunicar su propia baja.
  perform public.set_establishment_status_internal(
    p_establishment_id, 'ending', btrim(p_reason));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.termination_requested', 'establishment',
          p_establishment_id,
          jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'ending', 'requested_by_client', p_requested_by_client),
          btrim(p_reason));
end;
$$;

comment on function public.request_service_termination(uuid, text, boolean) is
  'R24 y M47, RN-EST-09 · el restaurante comunica la baja, o el equipo
   registra la que llegó por fuera. Pasa a `ending`, que es servicio en
   marcha: cuándo se corta lo decide el periodo pagado y la permanencia, y no
   esta función.';

revoke all on function public.request_service_termination(uuid, text, boolean) from public, anon;
grant execute on function public.request_service_termination(uuid, text, boolean) to authenticated;
