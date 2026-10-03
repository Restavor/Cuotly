-- ALTA del usuario agente del Agente Menú Diario · Fase 1, paso 1.3.
--
-- SOLO "Restavor pruebas" (bnucqykimngjwcrlpmsm). NUNCA producción ("Cuotly", mcajbfxhkxtdhjoyrqha).
-- Permiso de Bosco (03/10/2026, decisión 159): «te doy permiso para hacer la 3 si se puede hacer antes de la 1 y 2».
-- Se ejecuta A MANO, entero (un único bloque = una transacción: o se hace todo o no se hace nada).
-- Idempotente: repetirlo no duplica nada. Hay que repetirlo tras cada resembrado del espacio demo.
--
-- NO crea la cuenta de acceso (auth.users / auth.identities) ni toca su contraseña: la crea Bosco en
-- Supabase > Authentication > Users > Add user (Create new user, Auto Confirm User) con una contraseña que NO pasa por el chat.
-- El script solo la busca por correo y se para con un mensaje claro si no existe.
--
-- Qué hace: miembro activo con rol worker del espacio demo, SIN especialidades, autorizado SOLO en Bar Demo, y marcado
-- «no disponible» como puente hasta la marca de la Fase 2 (decisión 153).
-- LIMITES DE LA MARCA «no disponible» (worker_availability.available = false):
--   Lo saca de job_candidate_ids (list_job_candidates, auto_assign_job, assign_job, approve_job_reassignment) y de menu_candidate_ids.
--   NO lo saca de list_task_candidates / create_job_task, space_team_load, ni de lo que ve y puede hacer por estar autorizado
--   en Bar Demo (finanzas, conversaciones, notas, archivos, register_payment, informes).
do $$
declare
  c_email   constant text    := 'menu@restavor.com';  -- decisión 157 (Bosco, 03/10/2026)
  c_name    constant text    := 'Agente Menú Diario';
  c_space   constant uuid    := 'd1000000-0000-0000-0000-000000000001'; -- espacio demo
  c_est     constant uuid    := 'd4000000-0000-0000-0000-000000000001'; -- Bar Demo
  c_elena   constant uuid    := 'd0000000-0000-0000-0000-000000000001'; -- owner@cuotly.test (administradora, assign_jobs)
  c_marcar_no_disponible constant boolean := true;               -- marca puente (decisión 153)
  c_nota    constant text    := 'Agente automatico: no recibe repartos de trabajos (decision 153)';
  v_agent   uuid;
  v_role    public.space_role;
  v_status  public.member_status;
  v_otros   integer;
  v_espec   integer;
begin
  -- 1. Guardas de entorno
  if not exists (select 1 from public.spaces where id = c_space and slug = 'demo') then
    raise exception 'El espacio demo (%) no existe: no se toca nada', c_space;
  end if;
  if not exists (select 1 from public.establishments where id = c_est and space_id = c_space and name = 'Bar Demo') then
    raise exception 'Bar Demo (%) no esta en el espacio demo: no se toca nada', c_est;
  end if;
  -- 2. La cuenta de acceso la crea Bosco antes; aqui solo se comprueba
  select u.id into v_agent from auth.users u where lower(u.email) = lower(c_email);
  if v_agent is null then
    raise exception 'La cuenta % no existe. Crearla antes en Supabase (Authentication > Users > Add user, con Auto Confirm User)', c_email;
  end if;
  if not exists (select 1 from auth.users u where u.id = v_agent and u.email_confirmed_at is not null) then
    raise exception 'La cuenta % no esta confirmada (marcar Auto Confirm User)', c_email;
  end if;
  if not exists (select 1 from auth.identities i where i.user_id = v_agent and i.provider = 'email') then
    raise exception 'La cuenta % no tiene identidad de correo', c_email;
  end if;
  -- 2b. El perfil lo crea solo el disparador on_auth_user_created al crear la cuenta; sin perfil no hay membresía posible
  if not exists (select 1 from public.profiles p where p.id = v_agent) then
    raise exception 'La cuenta % no tiene perfil (lo crea el disparador on_auth_user_created): no se toca nada', c_email;
  end if;
  -- 3. Solo de este espacio
  select count(*) into v_otros from public.space_memberships sm where sm.user_id = v_agent and sm.space_id <> c_space;
  if v_otros > 0 then
    raise exception 'La cuenta % ya es miembro de otro espacio: no se toca nada', c_email;
  end if;
  -- 4. Nombre visible
  update public.profiles set full_name = c_name where id = v_agent and full_name is distinct from c_name;
  -- 5. Miembro activo, rol worker (si existe con otro rol o estado, se para; can_perform_jobs=false no afecta a un worker)
  select sm.role, sm.status into v_role, v_status
    from public.space_memberships sm where sm.space_id = c_space and sm.user_id = v_agent;
  if not found then
    insert into public.space_memberships (space_id, user_id, role, status, can_perform_jobs)
    values (c_space, v_agent, 'worker', 'active', false);
  elsif v_role <> 'worker' or v_status <> 'active' then
    raise exception 'El agente ya es miembro con rol % y estado %: se esperaba worker/active. No se sobrescribe', v_role, v_status;
  end if;
  -- 6. SIN especialidades: no se crea ninguna y se exige que no tenga ninguna viva
  select count(*) into v_espec from public.worker_specialties ws
   where ws.space_id = c_space and ws.user_id = v_agent and ws.revoked_at is null;
  if v_espec > 0 then
    raise exception 'El agente tiene % especialidad(es) viva(s): entraria en el reparto de menus. Retirarlas antes', v_espec;
  end if;
  -- 7. [OPCIONAL] No disponible. Solo el propio agente (o postgres) puede revertirlo (politica UPDATE user_id = auth.uid())
  if c_marcar_no_disponible then
    insert into public.worker_availability (space_id, user_id, available, note)
    values (c_space, v_agent, false, c_nota)
    on conflict (space_id, user_id) do update
      set available = false, note = excluded.note, updated_at = now()
      where public.worker_availability.available is distinct from false
         or public.worker_availability.note is distinct from excluded.note;
  end if;
  -- 8. Autorizado SOLO en Bar Demo con la funcion de la app, actuando como Elena (tiene assign_jobs).
  --    set_worker_establishments REEMPLAZA el conjunto ({Bar Demo}) y solo audita si cambia algo.
  perform set_config('request.jwt.claims', json_build_object('sub', c_elena, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub',  c_elena::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  if auth.uid() is distinct from c_elena or not public.has_capability(c_space, 'assign_jobs') then
    raise exception 'No se pudo actuar como Elena con assign_jobs';
  end if;
  perform public.set_worker_establishments(c_space, v_agent, array[c_est]);
  raise notice 'Agente % dado de alta: worker activo, sin especialidades, autorizado solo en Bar Demo', v_agent;
end
$$;
-- NOTA SOBRE RESEMBRADOS: el sembrado borra public.spaces del demo (y en cascada membresias y worker_*), pero solo borra de
-- auth.users los '%@cuotly.test'. Con un correo @restavor.com la cuenta y su perfil sobreviven: basta relanzar este script.
-- Con @cuotly.test la cuenta desapareceria y habria que recrearla y cambiar su contrasena.
