-- ============================================================
-- RN-NOT-06 · El resumen sale a partir de las ocho, no a las ocho
-- ============================================================
--
-- Corrección de la migración 122, el mismo día y antes de que nadie
-- llegara a usarla.
--
-- ------------------------------------------------------------
-- Qué estaba mal
-- ------------------------------------------------------------
--
-- La 122 exigía que en el espacio fueran **las ocho en punto**:
--
--     if extract(hour from (v_ahora at time zone v_zona)) <> 8 then
--       return 0;
--     end if;
--
-- Eso da por hecho que la cola pasa cada hora, y no pasa. La invoca el
-- cron de Vercel, que en `apps/web/vercel.json` está declarado **dos veces
-- al día**: 07:00 y 19:00 UTC. Traducido a hora de Madrid:
--
--     verano (CEST, UTC+2)  →  09:00 y 21:00   ← nunca son las ocho
--     invierno (CET, UTC+1) →  08:00 y 20:00   ← coincide
--
-- Así que el resumen **no se habría enviado nunca en Madrid durante el
-- verano**. Habría funcionado desde el último domingo de octubre, se
-- habría apagado solo el último domingo de marzo, y no habría dado ningún
-- error ni dejado ninguna fila: la cola habría pasado, el barrido habría
-- devuelto cero y todo el mundo habría dicho que la cola funciona.
--
-- (Canarias, que va en UTC+1 todo el año, sí habría recibido el suyo.
-- Medio producto funcionando es peor que ninguno: nadie lo habría mirado.)
--
-- ------------------------------------------------------------
-- Qué se cambia
-- ------------------------------------------------------------
--
-- Una sola comparación: `<> 8` pasa a `< 8`. El barrido hace el resumen en
-- **la primera pasada del día que ocurra a las 08:00 o después**, y quien
-- impide que salgan dos no es esta línea sino la clave única de
-- `notification_digests (profile_id, space_id, digest_date)`, que ya estaba.
--
-- **Es mejor aunque la cola pase cada hora**, y esa es la parte que
-- conviene no perder: con "las ocho en punto", una sola pasada perdida
-- —la cola parada, un despliegue, un fallo de red— deja a todo el mundo
-- sin resumen ese día y no hay segunda oportunidad hasta mañana. Con "a
-- partir de las ocho", la siguiente pasada lo recoge.
--
-- Lo que cambia hacia fuera es la promesa: la pantalla decía "a las 08:00"
-- y dice "a partir de las 08:00". Cuanto más a menudo corra la cola, más
-- cerca de las ocho llega; con una pasada por hora, en punto.

create or replace function public.run_notification_digests(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zona text;
  v_ahora timestamptz := now();
  v_dia date;
  v_desde timestamptz;
  v_persona record;
  v_digest_id uuid;
  v_cuantos integer;
  v_hechos integer := 0;
begin
  select timezone into v_zona from public.spaces where id = p_space_id;
  if v_zona is null then
    return 0;
  end if;

  -- **A partir de las ocho de la mañana del espacio**, no del servidor
  -- (CLAUDE.md), y no a las ocho en punto: la cola no pasa cada hora. El
  -- porqué está entero en la cabecera de esta migración.
  if extract(hour from (v_ahora at time zone v_zona)) < 8 then
    return 0;
  end if;

  v_dia := (v_ahora at time zone v_zona)::date;
  -- Las 24 h anteriores, contadas desde este mismo instante: la ventana no
  -- puede ser "el día natural anterior" porque entonces lo ocurrido entre
  -- medianoche y las ocho se quedaría fuera hasta el día siguiente.
  v_desde := v_ahora - interval '24 hours';

  for v_persona in
    select ns.profile_id
    from public.notification_schedules ns
    where ns.space_id = p_space_id and ns.frequency = 'daily_digest'
  loop
    begin
      -- Un resumen por persona, espacio y día. **Esto es lo que impide que
      -- la segunda pasada del día mande un segundo correo**, ahora que hay
      -- más de una pasada que cumple la condición de la hora.
      if exists (
        select 1 from public.notification_digests d
        where d.space_id = p_space_id
          and d.profile_id = v_persona.profile_id
          and d.digest_date = v_dia
      ) then
        continue;
      end if;

      -- Lo que entra: sus avisos de este espacio de las últimas 24 h que
      -- **no se enviaron por su cuenta**. Un obligatorio ya salió al
      -- momento (tiene fila en la cola), así que no se repite en el
      -- resumen: recibirlo dos veces es peor que no resumirlo.
      select count(*) into v_cuantos
      from public.notifications n
      where n.space_id = p_space_id
        and n.recipient_id = v_persona.profile_id
        and n.created_at >= v_desde
        and not exists (
          select 1 from public.notification_deliveries d
          where d.notification_id = n.id
        )
        -- Y que no haya entrado ya en un resumen anterior. Con la ventana
        -- de 24 h y un resumen al día no debería poder pasar, pero eso
        -- depende de que el barrido corra todos los días a su hora: un día
        -- que se salte —la cola parada, el servidor caído— desplazaría la
        -- ventana y un aviso podría contarse dos veces. Esto lo hace
        -- imposible por construcción en vez de por calendario.
        and not exists (
          select 1 from public.notification_digest_items i
          where i.notification_id = n.id
        );

      -- RN-NOT-06 · un día sin nada NO genera resumen. Un correo que dice
      -- "no ha pasado nada" es ruido, y quien lo recibe deja de abrir los
      -- que sí traen algo.
      if coalesce(v_cuantos, 0) = 0 then
        continue;
      end if;

      insert into public.notification_digests
        (space_id, profile_id, digest_date, notification_count)
      values (p_space_id, v_persona.profile_id, v_dia, v_cuantos)
      returning id into v_digest_id;

      insert into public.notification_digest_items (space_id, digest_id, notification_id)
      select p_space_id, v_digest_id, n.id
      from public.notifications n
      where n.space_id = p_space_id
        and n.recipient_id = v_persona.profile_id
        and n.created_at >= v_desde
        and not exists (
          select 1 from public.notification_deliveries d
          where d.notification_id = n.id
        )
        and not exists (
          select 1 from public.notification_digest_items i
          where i.notification_id = n.id
        );

      insert into public.notification_deliveries (space_id, digest_id, channel)
      values (p_space_id, v_digest_id, 'email');

      -- Push solo si hay teléfono, por lo mismo que en `emit_notification()`.
      if exists (
        select 1 from public.push_devices d
        where d.user_id = v_persona.profile_id and d.revoked_at is null
      ) then
        insert into public.notification_deliveries (space_id, digest_id, channel)
        values (p_space_id, v_digest_id, 'push');
      end if;

      v_hechos := v_hechos + 1;
    exception when others then
      -- Una persona que falle no puede dejar sin resumen a las demás.
      null;
    end;
  end loop;

  return v_hechos;
end;
$$;

revoke all on function public.run_notification_digests(uuid) from public, anon, authenticated;
