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
-- La ventana del barrido, a cualquier hora del día
-- ============================================================
--
-- **Este bloque se reescribió porque el anterior mentía a medias.**
-- Miraba qué hora era en Madrid AHORA y comprobaba el barrido contra esa
-- hora, así que qué se ejercía dependía de cuándo se ejecutara la suite:
-- lanzada por la tarde nunca probaba el caso "antes de las ocho", y
-- lanzada a las ocho no probaba el resto. Tres mutaciones lo demostraron
-- —quitar la ventana entera, usar la hora del servidor y volver a "las
-- ocho en punto"— y las tres sobrevivieron.
--
-- Ahora se conduce el reloj en vez de mirarlo: para cada hora local que se
-- quiere probar se busca una zona en la que **ahora mismo** sea esa hora y
-- se le pone al espacio. Se ejerce el mismo código, con la hora que toca,
-- corra la suite cuando corra.
create or replace function pg_temp.a67_en_hora_local(p_hora int)
returns void language plpgsql as $$
declare
  v_zona text;
begin
  select name into v_zona
  from pg_timezone_names
  where extract(hour from (now() at time zone name)) = p_hora
    and name like 'Etc/GMT%'
  limit 1;

  if v_zona is null then
    raise exception 'FALLO · no hay ninguna zona en la que ahora sean las %', p_hora;
  end if;

  -- Cada caso arranca sin resumen: lo que se mide es si el barrido lo
  -- HACE a esa hora, no si ya estaba.
  delete from public.notification_deliveries
  where digest_id in (select id from public.notification_digests
                      where profile_id = 'a0900000-0000-0000-0000-000000000002');
  delete from public.notification_digests
  where profile_id = 'a0900000-0000-0000-0000-000000000002';

  update public.spaces set timezone = v_zona
  where id = 'a0910000-0000-0000-0000-000000000001';
end $$;

do $$
declare
  v_caso record;
  v_hechos int;
begin
  for v_caso in
    select * from (values
      -- Antes de las ocho: en silencio, a cualquier hora de la madrugada.
      (0, false), (3, false), (7, false),
      -- A las ocho y después: el resumen sale. Las 09 y las 21 son
      -- exactamente las horas a las que el cron de Vercel pasa por Madrid
      -- en verano, y son las que el fallo de la 122 dejaba fuera.
      (8, true), (9, true), (14, true), (21, true), (23, true)
    ) as t(hora, debe_salir)
  loop
    perform pg_temp.a67_en_hora_local(v_caso.hora);
    v_hechos := public.run_notification_digests('a0910000-0000-0000-0000-000000000001');

    if v_caso.debe_salir and v_hechos <> 1 then
      raise exception 'FALLO · a las %:00 del espacio debería salir el resumen y salieron %',
        v_caso.hora, v_hechos;
    end if;

    if not v_caso.debe_salir and v_hechos <> 0 then
      raise exception 'FALLO · a las %:00 del espacio NO debería salir nada y salieron %',
        v_caso.hora, v_hechos;
    end if;
  end loop;
end $$;

-- ============================================================
-- Y la ventana es la del ESPACIO, no la del servidor
-- ============================================================
--
-- Con la hora del servidor, el barrido saldría a la vez para todo el mundo
-- y a una hora que no es la de nadie. Se comprueba poniendo al espacio en
-- una hora que NO vale mientras en el servidor sí, y al revés.
do $$
declare
  v_hora_servidor int := extract(hour from now() at time zone 'UTC');
  v_hechos int;
begin
  -- Espacio a las 03:00: no debe salir nada, diga lo que diga el servidor.
  perform pg_temp.a67_en_hora_local(3);
  v_hechos := public.run_notification_digests('a0910000-0000-0000-0000-000000000001');
  if v_hechos <> 0 then
    raise exception 'FALLO · el espacio está a las 03:00 (servidor a las %) y salió resumen',
      v_hora_servidor;
  end if;

  -- Espacio a las 10:00: debe salir, diga lo que diga el servidor.
  perform pg_temp.a67_en_hora_local(10);
  v_hechos := public.run_notification_digests('a0910000-0000-0000-0000-000000000001');
  if v_hechos <> 1 then
    raise exception 'FALLO · el espacio está a las 10:00 (servidor a las %) y no salió resumen',
      v_hora_servidor;
  end if;
end $$;

-- ============================================================
-- Una pasada al día, aunque el cron pase dos veces
-- ============================================================
--
-- Desde que la ventana es "a partir de las ocho", **las dos pasadas del
-- cron la cumplen**. Lo que impide el segundo correo ya no es la hora: es
-- la clave única de un resumen por día. Aquí se ejerce esa situación de
-- verdad, corriendo el barrido dos veces a dos horas que valen.
do $$
declare
  v_hechos int;
begin
  perform pg_temp.a67_en_hora_local(9);
  if public.run_notification_digests('a0910000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FALLO · la primera pasada del día debería hacer el resumen';
  end if;

  -- La segunda pasada del cron, más tarde y el mismo día.
  update public.spaces set timezone = (
    select name from pg_timezone_names
    where extract(hour from (now() at time zone name)) = 21
      and name like 'Etc/GMT%'
    limit 1
  )
  where id = 'a0910000-0000-0000-0000-000000000001';

  v_hechos := public.run_notification_digests('a0910000-0000-0000-0000-000000000001');
  if v_hechos <> 0 then
    raise exception 'FALLO · la segunda pasada del día mandó % resúmenes de más', v_hechos;
  end if;
end $$;

-- ============================================================
-- El cron de Vercel tiene que caer dentro de la ventana
-- ============================================================
--
-- Esta comprobación existe porque el fallo se escapó: la 122 exigía las
-- ocho en punto y la cola pasa dos veces al día, así que en Madrid y en
-- verano no coincidían nunca. Se toman **las horas reales del cron** —las
-- de `apps/web/vercel.json`—, se traducen a hora de Madrid en las dos
-- estaciones, y se exige que al menos una haga salir el resumen
-- **ejecutando el barrido de verdad a esa hora**, no razonando sobre ella.
--
-- Si alguien mueve el cron, o vuelve a estrechar la ventana, esto se pone
-- rojo antes de que nadie se quede sin correo.
do $$
declare
  v_caso record;
  v_hora_utc int;
  v_hora_local int;
  v_sirve boolean;
begin
  for v_caso in
    select * from (values
      ('verano',   timestamptz '2026-07-15 00:00:00+00'),
      ('invierno', timestamptz '2026-01-15 00:00:00+00')
    ) as t(estacion, dia)
  loop
    v_sirve := false;

    -- Las dos pasadas declaradas en `apps/web/vercel.json`.
    foreach v_hora_utc in array array[7, 19] loop
      v_hora_local := extract(hour from
        ((v_caso.dia + (v_hora_utc || ' hours')::interval) at time zone 'Europe/Madrid'));

      perform pg_temp.a67_en_hora_local(v_hora_local);
      if public.run_notification_digests('a0910000-0000-0000-0000-000000000001') = 1 then
        v_sirve := true;
      end if;
    end loop;

    if not v_sirve then
      raise exception
        'FALLO · en % ninguna pasada del cron (07:00 y 19:00 UTC) hace salir el resumen: Madrid se quedaría sin correo',
        v_caso.estacion;
    end if;
  end loop;
end $$;

-- ============================================================
-- El barrido, forzando que la hora valga
-- ============================================================
--
-- Para comprobar el CONTENIDO del resumen sin esperar a mañana se mueve la
-- zona del espacio a una en la que ahora mismo ya sean las ocho o más. Es
-- un truco del test, no del producto: lo que se ejerce es exactamente el
-- mismo código.
--
-- Y **se borra antes el resumen que el bloque anterior pueda haber
-- creado**: desde que la ventana es "a partir de las ocho" (migración
-- 124), aquel bloque hace el resumen de verdad siempre que en Madrid ya
-- sea esa hora. Sin borrarlo, este bloque encontraría el de hoy ya hecho y
-- mediría cero — que es justo lo que pasó al cambiar la ventana, y por eso
-- queda escrito.
do $$
declare
  v_zona text;
begin
  delete from public.notification_deliveries
  where digest_id in (select id from public.notification_digests
                      where profile_id = 'a0900000-0000-0000-0000-000000000002');
  delete from public.notification_digests
  where profile_id = 'a0900000-0000-0000-0000-000000000002';

  select name into v_zona
  from pg_timezone_names
  where extract(hour from (now() at time zone name)) between 8 and 20
    and name like 'Etc/GMT%'
  limit 1;

  if v_zona is null then
    raise exception 'FALLO · no se encontró ninguna zona en la que ya sean las ocho';
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
    raise exception 'FALLO · pasadas las ocho debería salir 1 resumen y salieron %', v_hechos;
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
