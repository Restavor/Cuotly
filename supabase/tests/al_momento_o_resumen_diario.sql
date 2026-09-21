-- ============================================================
-- Suite 67 · Al momento o resumen diario
--            (migración 122; RN-NOT-06; decisión 65)
-- ============================================================
--
-- Lo que comprueba, y lo primero es lo que más:
--
--   · **Un aviso obligatorio sale al momento aunque haya resumen.** Es la
--     regla que sostiene a RN-NOT-03: si un impago grave o un incidente de
--     seguridad esperaran a la mañana siguiente, "no se puede desactivar"
--     sería falso en la práctica — se apagaría doce horas.
--   · **La campana nunca espera.** El aviso dentro de la aplicación se crea
--     igual; lo que se agrupa es el correo y el push. Sin esto, quien
--     eligiera resumen diario abriría Cuotly y no vería nada de hoy.
--   · **Las ocho son las del espacio**, no las del servidor (CLAUDE.md).
--     El barrido corre cada hora y solo hace algo en esa.
--   · **Un resumen por persona, espacio y día.** Repetir el barrido no
--     manda dos correos.
--   · **Un día sin nada no genera resumen** (RN-NOT-06): un correo que dice
--     "no ha pasado nada" es ruido.
--   · **Lo que ya salió no se repite en el resumen.** Recibir dos veces el
--     mismo aviso es peor que no resumirlo.
--   · **Sin fila, al momento**: la frecuencia por omisión no hay que
--     sembrarla.
--   · **La frecuencia es de cada quien**: nadie ve ni cambia la de otro, ni
--     siquiera el propietario del espacio.
--   · **La cola sabe llevar un resumen.** Es donde estaba la trampa: la
--     versión anterior de `claim_notification_deliveries()` unía
--     `notifications` con un `join` interno, así que una entrega de resumen
--     se habría reclamado, se le habría sumado un intento y no se habría
--     devuelto nunca. Cinco vueltas y muerta, sin que nada fallara a la
--     vista.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/al_momento_o_resumen_diario.sql
--
-- Prefijo de esta suite: a0900000-.

begin;

set local role postgres;

-- ------------------------------------------------------------
-- El decorado: dos espacios, porque la frecuencia es por espacio
-- ------------------------------------------------------------
insert into auth.users (id, email, role, aud) values
  ('a0900000-0000-0000-0000-000000000001', 'duena67@cuotly.test', 'authenticated', 'authenticated'),
  ('a0900000-0000-0000-0000-000000000002', 'resumen67@cuotly.test', 'authenticated', 'authenticated'),
  ('a0900000-0000-0000-0000-000000000003', 'almomento67@cuotly.test', 'authenticated', 'authenticated'),
  -- Con resumen diario y SIN un solo aviso: es quien demuestra que un día
  -- sin nada no genera correo.
  ('a0900000-0000-0000-0000-000000000004', 'callado67@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('a0900000-0000-0000-0000-000000000001', 'duena67@cuotly.test', 'Dueña 67'),
  ('a0900000-0000-0000-0000-000000000002', 'resumen67@cuotly.test', 'Quien Resume 67'),
  ('a0900000-0000-0000-0000-000000000003', 'almomento67@cuotly.test', 'Al Momento 67'),
  ('a0900000-0000-0000-0000-000000000004', 'callado67@cuotly.test', 'Sin Nada 67')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('a0910000-0000-0000-0000-000000000001', 'Espacio 67', 'espacio-67', 'Europe/Madrid',
   'a0900000-0000-0000-0000-000000000001'),
  -- El segundo, en otra zona: es lo que demuestra que "las ocho" son las
  -- del espacio y no las de nadie más.
  ('a0910000-0000-0000-0000-000000000002', 'Espacio 67 Canarias', 'espacio-67-b', 'Atlantic/Canary',
   'a0900000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('a0910000-0000-0000-0000-000000000001', 'a0900000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('a0910000-0000-0000-0000-000000000001', 'a0900000-0000-0000-0000-000000000002', 'worker', 'active'),
  ('a0910000-0000-0000-0000-000000000001', 'a0900000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('a0910000-0000-0000-0000-000000000002', 'a0900000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('a0910000-0000-0000-0000-000000000002', 'a0900000-0000-0000-0000-000000000002', 'worker', 'active'),
  ('a0910000-0000-0000-0000-000000000001', 'a0900000-0000-0000-0000-000000000004', 'worker', 'active');

-- La cuarta elige resumen diario y no recibe ni un aviso en todo el día.
insert into public.notification_schedules (space_id, profile_id, frequency) values
  ('a0910000-0000-0000-0000-000000000001', 'a0900000-0000-0000-0000-000000000004', 'daily_digest');

-- ============================================================
-- RN-NOT-06 · sin fila, al momento
-- ============================================================
do $$
begin
  if public.effective_notification_frequency(
       'a0900000-0000-0000-0000-000000000002', 'a0910000-0000-0000-0000-000000000001')
     <> 'instant' then
    raise exception 'FALLO · sin fila, la frecuencia debería ser al momento';
  end if;
end $$;

-- ============================================================
-- Elegirla: solo en un espacio al que se pertenece
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'a0900000-0000-0000-0000-000000000003';

do $$
begin
  -- El tercero NO pertenece al segundo espacio.
  begin
    perform public.set_my_notification_frequency(
      'a0910000-0000-0000-0000-000000000002', 'daily_digest');
    raise exception 'FALLO · no se debería poder elegir frecuencia en un espacio ajeno';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;

  begin
    perform public.set_my_notification_frequency(
      'a0910000-0000-0000-0000-000000000001', 'cada_martes');
    raise exception 'FALLO · una frecuencia inventada no debería colar';
  exception
    when others then
      if position('FALLO' in sqlerrm) > 0 then raise; end if;
  end;
end $$;

set local request.jwt.claim.sub = 'a0900000-0000-0000-0000-000000000002';

do $$
begin
  -- Resumen diario en el PRIMER espacio, y nada en el segundo.
  perform public.set_my_notification_frequency(
    'a0910000-0000-0000-0000-000000000001', 'daily_digest');

  if public.my_notification_frequency('a0910000-0000-0000-0000-000000000001')
     <> 'daily_digest' then
    raise exception 'FALLO · debería haber quedado en resumen diario';
  end if;

  -- **Por espacio, no por persona.** El otro espacio sigue al momento.
  if public.my_notification_frequency('a0910000-0000-0000-0000-000000000002')
     <> 'instant' then
    raise exception 'FALLO · elegir resumen en un espacio no debería cambiar el otro';
  end if;
end $$;

-- ============================================================
-- La frecuencia es de cada quien
-- ============================================================
set local request.jwt.claim.sub = 'a0900000-0000-0000-0000-000000000001';

do $$
begin
  -- Ni la propietaria del espacio ve la de otra persona.
  if exists (
    select 1 from public.notification_schedules
    where profile_id = 'a0900000-0000-0000-0000-000000000002'
  ) then
    raise exception 'FALLO · la frecuencia de otra persona no es asunto de nadie';
  end if;

  -- Y no se puede escribir por el lado: `notification_schedules` no tiene
  -- política de insert ni de update, así que un UPDATE directo afecta a
  -- cero filas. Como en las subtareas (RN-REQ-07), lo que se comprueba es
  -- el efecto, no la excepción: PostgreSQL no lanza, devuelve cero.
  update public.notification_schedules set frequency = 'instant'
  where profile_id = 'a0900000-0000-0000-0000-000000000002';

  if found then
    raise exception 'FALLO · no se debería poder cambiar la frecuencia de otra persona';
  end if;
end $$;

set local role postgres;

do $$
begin
  if (select frequency from public.notification_schedules
      where profile_id = 'a0900000-0000-0000-0000-000000000002'
        and space_id = 'a0910000-0000-0000-0000-000000000001') <> 'daily_digest' then
    raise exception 'FALLO · la frecuencia cambió por un UPDATE ajeno';
  end if;
end $$;

-- ============================================================
-- RN-NOT-06 · la campana NUNCA espera, el correo sí
-- ============================================================
do $$
declare
  v_aviso uuid;
  v_envios int;
begin
  -- Un aviso normal a quien tiene resumen diario.
  v_aviso := public.emit_notification(
    'a0910000-0000-0000-0000-000000000001',
    'a0900000-0000-0000-0000-000000000002',
    'request_submitted', 'staff', 'request', gen_random_uuid(),
    '/espacios/espacio-67/solicitudes/x', 'a67-normal-1');

  if v_aviso is null then
    raise exception 'FALLO · el aviso de la campana debería crearse igual';
  end if;

  select count(*) into v_envios
  from public.notification_deliveries where notification_id = v_aviso;

  if v_envios <> 0 then
    raise exception 'FALLO · con resumen diario no se debería encolar ningún envío, y hay %', v_envios;
  end if;
end $$;

-- ============================================================
-- RN-NOT-03 y RN-NOT-06 · un obligatorio sale AL MOMENTO
-- ============================================================
do $$
declare
  v_aviso uuid;
begin
  -- `security_incident` es de los obligatorios (RN-NOT-03).
  v_aviso := public.emit_notification(
    'a0910000-0000-0000-0000-000000000001',
    'a0900000-0000-0000-0000-000000000002',
    'security_incident', 'staff', 'incident', gen_random_uuid(),
    '/espacios/espacio-67/ajustes', 'a67-obligatorio-1');

  if v_aviso is null then
    raise exception 'FALLO · el aviso obligatorio debería crearse';
  end if;

  if not exists (
    select 1 from public.notification_deliveries
    where notification_id = v_aviso and channel = 'email'
  ) then
    raise exception 'FALLO · un aviso obligatorio NO debería esperar al resumen (RN-NOT-03)';
  end if;
end $$;

-- ============================================================
-- Quien está al momento sigue como siempre
-- ============================================================
do $$
declare
  v_aviso uuid;
begin
  v_aviso := public.emit_notification(
    'a0910000-0000-0000-0000-000000000001',
    'a0900000-0000-0000-0000-000000000003',
    'request_submitted', 'staff', 'request', gen_random_uuid(),
    '/espacios/espacio-67/solicitudes/y', 'a67-instant-1');

  if not exists (
    select 1 from public.notification_deliveries
    where notification_id = v_aviso and channel = 'email'
  ) then
    raise exception 'FALLO · sin resumen diario, el correo se encola como siempre';
  end if;
end $$;

-- ============================================================
-- El barrido: solo a las ocho, y las del espacio
-- ============================================================
--
-- No se puede mover `now()`, así que se mira al revés: qué hora es AHORA en
-- cada espacio, y se comprueba que el barrido hace algo exactamente en el
-- que sean las ocho — ninguno, uno o los dos. Sin esto, la suite solo
-- pasaría si alguien la ejecutara a las ocho de la mañana.
do $$
declare
  v_hora_madrid int := extract(hour from (now() at time zone 'Europe/Madrid'));
  v_hora_canarias int := extract(hour from (now() at time zone 'Atlantic/Canary'));
  v_hechos_madrid int;
  v_hechos_canarias int;
begin
  v_hechos_madrid := public.run_notification_digests('a0910000-0000-0000-0000-000000000001');
  v_hechos_canarias := public.run_notification_digests('a0910000-0000-0000-0000-000000000002');

  -- En Madrid hay una persona con resumen y avisos sin enviar: si son las
  -- ocho allí, tiene que salir uno.
  if v_hora_madrid = 8 and v_hechos_madrid <> 1 then
    raise exception 'FALLO · son las 8 en Madrid y el barrido hizo % resúmenes', v_hechos_madrid;
  end if;

  if v_hora_madrid <> 8 and v_hechos_madrid <> 0 then
    raise exception 'FALLO · no son las 8 en Madrid (%) y el barrido hizo algo', v_hora_madrid;
  end if;

  -- En Canarias nadie tiene resumen diario: nunca sale nada, sea la hora
  -- que sea. Así se distingue "no es la hora" de "no hay a quién".
  if v_hechos_canarias <> 0 then
    raise exception 'FALLO · en Canarias nadie tiene resumen y salieron %', v_hechos_canarias;
  end if;

  -- Y las dos horas son distintas, o el decorado no está probando nada.
  if v_hora_madrid = v_hora_canarias then
    raise exception 'FALLO · las dos zonas marcan la misma hora: el decorado no prueba la zona';
  end if;
end $$;

-- ============================================================
-- El barrido, forzando que sean las ocho
-- ============================================================
--
-- Para poder comprobar el CONTENIDO del resumen sin esperar a mañana, se
-- mueve la zona del espacio a una en la que ahora mismo sean las ocho.
-- Es un truco del test, no del producto: lo que se ejerce es exactamente
-- el mismo código.
do $$
declare
  v_zona text;
begin
  select name into v_zona
  from pg_timezone_names
  where extract(hour from (now() at time zone name)) = 8
    and name like 'Etc/GMT%'
  limit 1;

  if v_zona is null then
    raise exception 'FALLO · no se encontró ninguna zona en la que sean las ocho';
  end if;

  update public.spaces set timezone = v_zona
  where id = 'a0910000-0000-0000-0000-000000000001';
end $$;

do $$
declare
  v_hechos int;
  v_digest uuid;
  v_cuantos int;
begin
  v_hechos := public.run_notification_digests('a0910000-0000-0000-0000-000000000001');

  if v_hechos <> 1 then
    raise exception 'FALLO · a las ocho debería salir 1 resumen y salieron %', v_hechos;
  end if;

  select id, notification_count into v_digest, v_cuantos
  from public.notification_digests
  where profile_id = 'a0900000-0000-0000-0000-000000000002'
    and space_id = 'a0910000-0000-0000-0000-000000000001';

  -- **Uno, no dos.** El obligatorio ya salió al momento y tiene su fila en
  -- la cola, así que no se repite en el resumen: recibirlo dos veces es
  -- peor que no resumirlo.
  if v_cuantos <> 1 then
    raise exception 'FALLO · el resumen debería llevar 1 aviso (el normal) y lleva %', v_cuantos;
  end if;

  if exists (
    select 1 from public.notification_digest_items i
    join public.notifications n on n.id = i.notification_id
    where i.digest_id = v_digest and n.event_type = 'security_incident'
  ) then
    raise exception 'FALLO · el obligatorio ya salió al momento y NO debería repetirse en el resumen';
  end if;

  -- El envío del resumen queda encolado, en la cola de siempre.
  if not exists (
    select 1 from public.notification_deliveries
    where digest_id = v_digest and channel = 'email'
  ) then
    raise exception 'FALLO · el resumen debería encolar su correo';
  end if;
end $$;

-- ============================================================
-- Un resumen por persona, espacio y día
-- ============================================================
do $$
declare
  v_hechos int;
begin
  -- Repetir el barrido en la misma hora no manda un segundo correo.
  v_hechos := public.run_notification_digests('a0910000-0000-0000-0000-000000000001');

  if v_hechos <> 0 then
    raise exception 'FALLO · repetir el barrido creó % resúmenes de más', v_hechos;
  end if;

  if (select count(*) from public.notification_digests
      where profile_id = 'a0900000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'FALLO · debería haber exactamente un resumen';
  end if;

  if (select count(*) from public.notification_deliveries
      where digest_id = (select id from public.notification_digests
                         where profile_id = 'a0900000-0000-0000-0000-000000000002')
        and channel = 'email') <> 1 then
    raise exception 'FALLO · el resumen no debería tener dos envíos de correo';
  end if;
end $$;

-- ============================================================
-- RN-NOT-06 · un día sin nada NO genera resumen
-- ============================================================
--
-- La cuarta persona tiene resumen diario y no ha recibido ni un aviso. El
-- barrido de arriba ya corrió con ella dentro: si le hubiera hecho un
-- resumen vacío, aquel `v_hechos` habría sido 2 y no 1. Aquí se dice
-- explícitamente, porque es una regla y no un efecto colateral.
do $$
begin
  if exists (
    select 1 from public.notification_digests
    where profile_id = 'a0900000-0000-0000-0000-000000000004'
  ) then
    raise exception 'FALLO · sin avisos que contar NO debería salir resumen (RN-NOT-06)';
  end if;
end $$;

-- Y un aviso que ya entró en un resumen no vuelve a entrar en el
-- siguiente, aunque siga dentro de la ventana de 24 h.
do $$
declare
  v_hechos int;
begin
  -- Se borra el resumen de hoy —no sus apuntes de qué entró— para que el
  -- barrido pueda volver a intentarlo. Lo que impide el duplicado no es
  -- la fila del resumen: es `notification_digest_items`.
  delete from public.notification_deliveries
  where digest_id in (select id from public.notification_digests
                      where profile_id = 'a0900000-0000-0000-0000-000000000002');

  update public.notification_digests set digest_date = digest_date - 1
  where profile_id = 'a0900000-0000-0000-0000-000000000002';

  v_hechos := public.run_notification_digests('a0910000-0000-0000-0000-000000000001');

  if v_hechos <> 0 then
    raise exception 'FALLO · un aviso ya resumido no debería volver a resumirse (salieron %)', v_hechos;
  end if;
end $$;

-- ============================================================
-- La cola sabe llevar un resumen
-- ============================================================
--
-- Aquí estaba la trampa: con el `join` interno de antes, la entrega del
-- resumen se habría reclamado y NO se habría devuelto. Cinco intentos y
-- muerta, sin que nada fallara a la vista.
do $$
declare
  v_digest uuid;
  v_fila record;
begin
  -- Se vuelve a crear un resumen con algo dentro.
  perform public.emit_notification(
    'a0910000-0000-0000-0000-000000000001',
    'a0900000-0000-0000-0000-000000000002',
    'request_submitted', 'staff', 'request', gen_random_uuid(),
    '/espacios/espacio-67/solicitudes/z', 'a67-normal-2');

  perform public.run_notification_digests('a0910000-0000-0000-0000-000000000001');

  -- El ÚLTIMO: a estas alturas esta persona tiene el resumen de ayer y el
  -- de hoy, y `select into` sin orden habría cogido cualquiera.
  select id into v_digest from public.notification_digests
  where profile_id = 'a0900000-0000-0000-0000-000000000002'
  order by created_at desc, digest_date desc
  limit 1;

  if v_digest is null then
    raise exception 'FALLO · no se creó el resumen para probar la cola';
  end if;

  -- Las entregas de aviso ya reclamadas se apartan, para que la del
  -- resumen sea la que salga.
  update public.notification_deliveries set status = 'sent'
  where digest_id is null;

  select * into v_fila
  from public.claim_notification_deliveries(10)
  where digest_id = v_digest and channel = 'email';

  if v_fila is null then
    raise exception 'FALLO · la cola NO devolvió la entrega del resumen (moriría en silencio)';
  end if;

  if v_fila.recipient_email <> 'resumen67@cuotly.test' then
    raise exception 'FALLO · la cola debería resolver el correo del dueño del resumen, y dio %',
      v_fila.recipient_email;
  end if;

  if v_fila.digest_count is null or v_fila.digest_count < 1 then
    raise exception 'FALLO · la cola debería decir cuántos avisos lleva el resumen';
  end if;

  if v_fila.space_name is null then
    raise exception 'FALLO · la cola debería decir de qué espacio es el resumen';
  end if;
end $$;

-- ============================================================
-- Lo que hay dentro del resumen, y solo para su dueño
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'a0900000-0000-0000-0000-000000000002';

do $$
declare
  v_digest uuid;
begin
  -- El ÚLTIMO: a estas alturas esta persona tiene el resumen de ayer y el
  -- de hoy, y `select into` sin orden habría cogido cualquiera.
  select id into v_digest from public.notification_digests
  where profile_id = 'a0900000-0000-0000-0000-000000000002'
  order by created_at desc, digest_date desc
  limit 1;

  if not exists (select 1 from public.digest_contents(v_digest)) then
    raise exception 'FALLO · el dueño del resumen debería ver lo que entró en él';
  end if;
end $$;

set local request.jwt.claim.sub = 'a0900000-0000-0000-0000-000000000001';

do $$
declare
  v_digest uuid;
begin
  -- La propietaria del espacio tiene el identificador —se lo puede pegar a
  -- mano— y aun así no ve nada: la puerta está dentro de la función.
  -- El ÚLTIMO: a estas alturas esta persona tiene el resumen de ayer y el
  -- de hoy, y `select into` sin orden habría cogido cualquiera.
  select id into v_digest from public.notification_digests
  where profile_id = 'a0900000-0000-0000-0000-000000000002'
  order by created_at desc, digest_date desc
  limit 1;

  if v_digest is null then
    -- No lo ve por la política, que también está bien: se busca como
    -- postgres para poder hacer la prueba de verdad.
    null;
  end if;
end $$;

set local role postgres;

do $$
declare
  v_digest uuid;
begin
  -- El ÚLTIMO: a estas alturas esta persona tiene el resumen de ayer y el
  -- de hoy, y `select into` sin orden habría cogido cualquiera.
  select id into v_digest from public.notification_digests
  where profile_id = 'a0900000-0000-0000-0000-000000000002'
  order by created_at desc, digest_date desc
  limit 1;

  perform set_config('request.jwt.claim.sub', 'a0900000-0000-0000-0000-000000000001', true);
  set local role authenticated;

  if exists (select 1 from public.digest_contents(v_digest)) then
    raise exception 'FALLO · nadie debería ver el contenido del resumen de otra persona';
  end if;
end $$;

-- ============================================================
-- El barrido se ENCOLA (migración 123)
-- ============================================================
--
-- Esta comprobación existe porque faltó. La migración 122 enseñó a
-- `run_scheduled_job()` a ejecutar el barrido y lo metió en el CHECK de
-- `scheduled_jobs.kind`, pero no tocó `enqueue_due_scheduled_jobs()`: el
-- barrido existía, se podía llamar a mano, y **no corría nunca**.
--
-- Nada lo habría cazado, porque el resto de esta suite llama a
-- `run_notification_digests()` directamente. Así que aquí se encola de
-- verdad y se exige encontrar el trabajo: es la diferencia entre probar
-- que la pieza funciona y probar que está enchufada.
--
-- Como postgres: `enqueue_due_scheduled_jobs()` está revocada a
-- `authenticated` —la llama el proceso de cola con `service_role`— y que
-- lo siga estando es justo lo que comprueba el bloque de más abajo.
set local role postgres;

do $$
declare
  v_cuando timestamptz := now();
begin
  perform public.enqueue_due_scheduled_jobs(v_cuando);

  if not exists (
    select 1 from public.scheduled_jobs
    where space_id = 'a0910000-0000-0000-0000-000000000001'
      and kind = 'notification_digests'
  ) then
    raise exception 'FALLO · el barrido del resumen no se encola: existe pero no correría nunca';
  end if;

  -- Y una sola vez por hora, como los demás: la clave de deduplicación es
  -- lo que impide que la cola se llene si el proceso arranca dos veces.
  perform public.enqueue_due_scheduled_jobs(v_cuando);

  if (select count(*) from public.scheduled_jobs
      where space_id = 'a0910000-0000-0000-0000-000000000001'
        and kind = 'notification_digests') <> 1 then
    raise exception 'FALLO · encolar dos veces en la misma hora creó dos trabajos';
  end if;
end $$;

-- ============================================================
-- Las dos restricciones que de verdad sujetan el resumen
-- ============================================================
--
-- Salieron de las mutaciones: quitarle al barrido el `if exists` de "ya
-- hay resumen de hoy", o el `if v_cuantos = 0`, **no cambia nada**, porque
-- debajo están la clave única y el CHECK, y el `exception when others` del
-- bucle se traga el error. Son mutantes equivalentes, no un agujero.
--
-- Pero eso significa que lo que sostiene las dos reglas no es el código
-- del barrido: son estas dos restricciones. Así que se comprueban aquí,
-- por su nombre, y no a través de un comportamiento que otra cosa está
-- garantizando.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notification_digests'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%profile_id, space_id, digest_date%'
  ) then
    raise exception 'FALLO · falta la clave única que impide dos resúmenes el mismo día';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notification_digests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%notification_count > 0%'
  ) then
    raise exception 'FALLO · falta el CHECK que impide un resumen vacío (RN-NOT-06)';
  end if;
end $$;

-- ============================================================
-- CLAUDE.md · lo que se abre por RPC y lo que no
-- ============================================================
set local role postgres;

do $$
declare
  v_mal text;
begin
  select string_agg(p.proname, ', ') into v_mal
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('my_notification_frequency', 'set_my_notification_frequency',
                      'digest_contents')
    and has_function_privilege('anon', p.oid, 'execute');

  if v_mal is not null then
    raise exception 'FALLO · funciones de la frecuencia abiertas a anon: %', v_mal;
  end if;

  -- Y las internas, cerradas.
  select string_agg(p.proname, ', ') into v_mal
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('effective_notification_frequency', 'run_notification_digests')
    and (has_function_privilege('authenticated', p.oid, 'execute')
      or has_function_privilege('anon', p.oid, 'execute'));

  if v_mal is not null then
    raise exception 'FALLO · funciones internas abiertas por RPC: %', v_mal;
  end if;
end $$;

-- ============================================================
-- RN-SUB-08 · el disparador de solo lectura donde toca
-- ============================================================
do $$
declare
  v_falta text;
begin
  select string_agg(esperado, ', ') into v_falta
  from (values
    ('notification_schedules_cuotly_read_only'),
    ('notification_schedules_guard_support_read_only')
  ) as t(esperado)
  where not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.notification_schedules'::regclass
      and tgname = t.esperado
  );

  if v_falta is not null then
    raise exception 'FALLO · a `notification_schedules` le faltan disparadores: %', v_falta;
  end if;
end $$;

rollback;
